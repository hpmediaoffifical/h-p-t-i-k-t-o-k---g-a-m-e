/**
 * Creator Online — static file server + tiny WebSocket relay for LAN multiplayer.
 * Zero dependencies: the WebSocket handshake and framing (RFC 6455) are implemented here.
 *
 * The server owns the shared room state that must agree between players
 * (genre, light theme, idol count, who holds MC / Kỹ thuật / Quản lý / idol slots,
 * the running PK) and validates every room event before relaying it.
 *
 *   node server/server.mjs          (PORT=8090 HOST=0.0.0.0 by default)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { cleanText } from '../src/web/js/logic/format.js';
import { sanitizeLook } from '../src/web/js/logic/profile.js';
import { ANIM_MODES, FX_KEYS, ROOM_ID, MIN_IDOLS, MAX_IDOLS } from '../src/web/js/logic/rooms.js';
import { SeatHouse, NpcSeatSim } from '../src/web/js/logic/seats.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'src', 'web');
const DATA = path.join(ROOT, 'assets', 'data');
const AUDIO = path.join(ROOT, 'assets', 'audio');
const PORT = Number(process.env.PORT) || 8090;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_FRAME = 16 * 1024;
const MAX_PLAYERS = 120;
const ANIMS = new Set(ANIM_MODES);
const cfg = JSON.parse(fs.readFileSync(path.join(DATA, 'game-config.json'), 'utf8'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
};

/** Map a URL path to a file under src/web, assets/data or assets/audio; null if outside. */
function resolveStatic(urlPath) {
  let p;
  try {
    p = decodeURIComponent(new URL(urlPath, 'http://x').pathname);
  } catch {
    return null;
  }
  if (p === '/') p = '/index.html';
  let base = WEB;
  for (const [prefix, dir] of [['/data/', DATA], ['/audio/', AUDIO]]) {
    if (p.startsWith(prefix)) {
      base = dir;
      p = p.slice(prefix.length - 1);
    }
  }
  const full = path.resolve(base, '.' + p);
  if (!full.startsWith(base + path.sep)) return null;
  return full;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  if (new URL(req.url, 'http://x').pathname === '/api/audio') {
    // which music files the user has dropped into assets/audio (the game falls back to synth music)
    let list = [];
    try {
      list = fs.readdirSync(AUDIO).filter((f) => /\.(mp3|ogg|m4a|wav)$/i.test(f));
    } catch {
      /* no audio folder yet */
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' }).end(JSON.stringify(list));
    return;
  }
  const file = resolveStatic(req.url);
  if (!file) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Không tìm thấy');
      return;
    }
    const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' };
    // audio needs Range support so the browser can loop/seek
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range && type.startsWith('audio/')) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
      if (start > end || start >= st.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end();
        return;
      }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      if (req.method === 'HEAD') res.end();
      else fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).pipe(res);
  });
});

// ------------------------------------------------------------------ WebSocket framing
function encodeFrame(text, opcode = 0x1) {
  const payload = Buffer.from(text);
  const len = payload.length;
  let header;
  if (len < 126) header = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function frameParser({ onText, onClose, onPing }) {
  let buf = Buffer.alloc(0);
  let fragments = [];
  let fragLen = 0;
  return (chunk) => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    while (buf.length >= 2) {
      const fin = (buf[0] & 0x80) !== 0;
      const op = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        const big = buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_FRAME)) return onClose();
        len = Number(big);
        off = 10;
      }
      if (len > MAX_FRAME || !masked) return onClose();
      const total = off + 4 + len;
      if (buf.length < total) return;
      const mask = buf.subarray(off, off + 4);
      const payload = Buffer.from(buf.subarray(off + 4, total));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      buf = buf.subarray(total);
      if (op === 0x8) return onClose();
      if (op === 0x9) {
        onPing(payload);
        continue;
      }
      if (op === 0xa || op === 0x2) continue;
      if (op === 0x1 || (op === 0x0 && fragments.length)) {
        fragments.push(payload);
        fragLen += payload.length;
        if (fragLen > MAX_FRAME) return onClose();
        if (fin) {
          const text = Buffer.concat(fragments).toString('utf8');
          fragments = [];
          fragLen = 0;
          onText(text);
        }
      }
    }
  };
}

// ------------------------------------------------------------------ shared room state
const GIFTS = new Map(cfg.gifts.map((g) => [g.id, g]));
const ROLES = new Set(Object.keys(cfg.roles));
const THEMES = new Set(Object.keys(cfg.lightThemes));
const typeOf = (id) => ({ G: 'group', N: 'stand', S: 'sing', P: 'game' })[id[0]];
const rooms = {};
for (const g of cfg.groupRooms) rooms[g.id] = { genre: g.genre, theme: g.theme ?? 'neon', idols: 0, holders: [] };
let pk = null; // {a, b, endsAt}

// solo rooms: owner = whoever gifted a room ticket; 60 s protection, then the queue moves in
const soloRooms = [
  ...Array.from({ length: 10 }, (_, i) => ({ id: `N${String(i + 1).padStart(2, '0')}`, type: 'stand' })),
  ...[1, 2, 3, 4, 5].map((i) => ({ id: `S${i}`, type: 'sing' })),
  ...[1, 2, 3, 4, 5].map((i) => ({ id: `P${i}`, type: 'game' })),
];
const seatCfg = cfg.seats;
const seats = new SeatHouse({ rooms: soloRooms, holdMs: seatCfg.holdSec * 1000, maxQueue: seatCfg.maxQueue });
const seatSim = new NpcSeatSim(seats, { names: cfg.fanNames, rng: Math.random, everyMs: seatCfg.npcEverySec.map((x) => x * 1000), stayMs: seatCfg.npcStaySec.map((x) => x * 1000) });
seatSim.seed(Date.now(), 0.85);
const allSeats = () => Object.fromEntries(soloRooms.map((r) => [r.id, seats.snapshot(r.id)]));
/** Tell everyone about changed rooms (full state of each) plus what happened. */
function broadcastSeats(events) {
  if (!events.length) return;
  const ids = [...new Set(events.map((e) => e.room).filter(Boolean))];
  broadcast({ t: 'ev', kind: 'seats', id: 0, rooms: Object.fromEntries(ids.map((id) => [id, seats.snapshot(id)])), events });
}

function roomOf(id) {
  if (typeof id !== 'string' || !ROOM_ID.test(id)) return null;
  if (!rooms[id]) rooms[id] = { genre: null };
  return rooms[id];
}

/** Release every role a player holds; returns the events to broadcast. */
function releaseAll(c) {
  const out = [];
  for (const [id, r] of Object.entries(rooms)) {
    if (!r.holders) continue;
    r.holders = r.holders.filter((h) => {
      if (h.id !== c.id) return true;
      out.push({ t: 'ev', kind: 'unrole', id: c.id, room: id, role: h.role, slot: h.slot });
      return false;
    });
  }
  return out;
}

// ------------------------------------------------------------------ game relay
const clients = new Map();
let nextId = 1;

const num = (v, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0);
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
const publicInfo = (c) => ({ id: c.id, name: c.name, look: c.look, state: c.state });

function send(c, msg) {
  if (!c.socket.destroyed) c.socket.write(encodeFrame(JSON.stringify(msg)));
}
function broadcast(msg, except) {
  const frame = encodeFrame(JSON.stringify(msg));
  for (const c of clients.values()) if (c !== except && c.name && !c.socket.destroyed) c.socket.write(frame);
}

/** Validate a room event; returns the message to broadcast (to everyone) or null. */
function handleEvent(c, m, now) {
  const base = { t: 'ev', kind: m.kind, id: c.id };
  switch (m.kind) {
    case 'gift': {
      const r = roomOf(m.room);
      const count = int(m.count, 1, 99);
      if (!r || !GIFTS.has(m.gift) || !count) return null;
      return { ...base, room: m.room, gift: m.gift, count };
    }
    case 'heart': {
      const n = int(m.n, 1, 60);
      if (!roomOf(m.room) || !n) return null;
      return { ...base, room: m.room, n };
    }
    case 'genre': {
      const r = roomOf(m.room);
      const g = cfg.genres[m.genre];
      if (!r || !g || g.type !== typeOf(m.room)) return null;
      r.genre = m.genre;
      return { ...base, room: m.room, genre: m.genre };
    }
    case 'theme': {
      const r = roomOf(m.room);
      if (!r || typeOf(m.room) !== 'group' || !THEMES.has(m.theme)) return null;
      r.theme = m.theme;
      return { ...base, room: m.room, theme: m.theme };
    }
    case 'idols': {
      const r = roomOf(m.room);
      const n = int(m.n, MIN_IDOLS, MAX_IDOLS);
      if (!r || typeOf(m.room) !== 'group' || !n) return null;
      if (!r.holders.some((h) => h.id === c.id && h.role === 'manager')) return null;
      r.idols = n;
      r.holders = r.holders.filter((h) => h.role !== 'idol' || h.slot < n);
      return { ...base, room: m.room, n };
    }
    case 'fx': {
      if (!roomOf(m.room) || typeOf(m.room) !== 'group' || !FX_KEYS.includes(m.fx)) return null;
      return { ...base, room: m.room, fx: m.fx };
    }
    case 'camera': {
      const idx = int(m.idx, 0, 2);
      if (!roomOf(m.room) || typeOf(m.room) !== 'group' || idx === null) return null;
      return { ...base, room: m.room, idx };
    }
    case 'role': {
      const r = roomOf(m.room);
      const slot = m.role === 'idol' ? int(m.slot, 0, MAX_IDOLS - 1) : 0;
      if (!r || typeOf(m.room) !== 'group' || !ROLES.has(m.role) || slot === null) return null;
      const taken = r.holders.some((h) => h.role === m.role && h.slot === slot && h.id !== c.id);
      if (taken) {
        send(c, { t: 'ev', kind: 'deny', id: c.id, room: m.room, role: m.role });
        return null;
      }
      // one role per player across the building
      for (const ev of releaseAll(c)) broadcast(ev);
      r.holders.push({ id: c.id, name: c.name, role: m.role, slot });
      return { ...base, room: m.room, role: m.role, slot };
    }
    case 'unrole': {
      const r = roomOf(m.room);
      if (!r?.holders) return null;
      const before = r.holders.length;
      r.holders = r.holders.filter((h) => !(h.id === c.id && h.role === m.role));
      if (r.holders.length === before) return null;
      return { ...base, room: m.room, role: m.role, slot: Number.isInteger(m.slot) ? m.slot : 0 };
    }
    case 'seat': {
      if (!seats.get(m.room)) return null;
      const who = { id: c.id, name: c.name };
      const res = seats.claim(m.room, who, now);
      send(c, { t: 'ev', kind: 'seatres', id: c.id, room: m.room, res });
      if (!['busy', 'already', 'full', 'invalid'].includes(res.result)) broadcastSeats([{ room: res.room ?? m.room, kind: 'claim', result: res, who }]);
      return null;
    }
    case 'unseat': {
      const change = seats.get(m.room) ? seats.leave(m.room, c.id, now) : null;
      if (change) broadcastSeats([change]);
      return null;
    }
    case 'pk': {
      if (typeOf(m.a ?? '') !== 'group' || typeOf(m.b ?? '') !== 'group' || m.a === m.b || !roomOf(m.a) || !roomOf(m.b)) return null;
      if (pk && pk.endsAt > now) return null;
      pk = { a: m.a, b: m.b, endsAt: now + cfg.tuning.pkDurationSec * 1000 };
      return { ...base, a: m.a, b: m.b };
    }
    default:
      return null;
  }
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (new URL(req.url, 'http://x').pathname !== '/ws' || String(req.headers.upgrade).toLowerCase() !== 'websocket' || !key) {
    socket.destroy();
    return;
  }
  if (clients.size >= MAX_PLAYERS) {
    socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');
    return;
  }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);

  const c = { id: nextId++, socket, name: null, look: null, state: null, lastChat: 0, windowStart: Date.now(), count: 0 };
  clients.set(c.id, c);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clients.delete(c.id);
    if (c.name) {
      for (const ev of releaseAll(c)) broadcast(ev);
      broadcastSeats(seats.removeEverywhere(c.id, Date.now()));
      broadcast({ t: 'leave', id: c.id });
      console.log(`- ${c.name} rời tòa nhà (${clients.size} online)`);
    }
    if (!socket.destroyed) {
      socket.write(encodeFrame('', 0x8));
      socket.end();
    }
  };

  const onText = (text) => {
    const now = Date.now();
    if (now - c.windowStart > 1000) {
      c.windowStart = now;
      c.count = 0;
    }
    if (++c.count > 60) return close(); // flood guard
    let m;
    try {
      m = JSON.parse(text);
    } catch {
      return;
    }
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'join': {
        if (c.name) return;
        c.name = cleanText(m.name, 20) || 'Creator';
        c.look = sanitizeLook(m.look);
        const others = [...clients.values()].filter((o) => o !== c && o.name).map(publicInfo);
        send(c, { t: 'welcome', id: c.id, now, players: others, rooms, seats: allSeats(), pk: pk && pk.endsAt > now ? pk : null });
        broadcast({ t: 'join', p: publicInfo(c) }, c);
        console.log(`+ ${c.name} vào tòa nhà (${clients.size} online)`);
        break;
      }
      case 's': {
        if (!c.name) return;
        c.state = {
          x: num(m.x, -45, 45),
          y: num(m.y, -2, 10),
          z: num(m.z, -40, 40),
          r: num(m.r, -10, 10),
          a: ANIMS.has(m.a) ? m.a : 'idle',
        };
        broadcast({ t: 's', id: c.id, ...c.state }, c);
        break;
      }
      case 'chat': {
        if (!c.name || now - c.lastChat < 600) return;
        const textOut = cleanText(m.text, 120);
        if (!textOut) return;
        c.lastChat = now;
        const room = typeof m.room === 'string' && ROOM_ID.test(m.room) ? m.room : undefined;
        broadcast({ t: 'chat', id: c.id, text: textOut, room }, c);
        break;
      }
      case 'look': {
        if (!c.name) return;
        c.look = sanitizeLook(m.look);
        broadcast({ t: 'look', id: c.id, look: c.look }, c);
        break;
      }
      case 'ev': {
        if (!c.name) return;
        const out = handleEvent(c, m, now);
        if (out) broadcast(out);
        break;
      }
      default:
        break;
    }
  };

  socket.on('data', frameParser({ onText, onClose: close, onPing: (p) => socket.write(encodeFrame(p.toString(), 0xa)) }));
  socket.on('error', close);
  socket.on('close', close);
});

// protection timer + NPC gifters, shared by every player
setInterval(() => {
  const now = Date.now();
  broadcastSeats([...seats.tick(now), ...seatSim.step(now)]);
}, 500);

server.listen(PORT, HOST, () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i.address}:${PORT}`);
  console.log('Creator Online đang chạy!');
  console.log(`  Máy này : http://localhost:${PORT}`);
  if (HOST === '0.0.0.0') for (const u of lan) console.log(`  Mạng LAN: ${u}`);
  console.log('Nhạc nền: thả file mp3 vào assets/audio/ (xem assets/audio/DANH-SACH-NHAC.md).');
  console.log('Nhấn Ctrl+C để dừng.');
});
