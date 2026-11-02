'use strict';
// 🧪 Hub giả cho selftest của app: đủ hello / pair / state / overlays / open / WebSocket (ping, req→res qua handlers) để app chạy test mà không cần
// HP Game Hub thật. CẦN gói `ws` (devDependency của app; app dùng socket.io thì đã có sẵn). Dùng Node `http` cho phần còn lại.
//
//   const { startFakeHub } = require('./fake-hub.cjs');
//   const fake = await startFakeHub({ handlers: { 'gift.plan': (gift) => ({ decision: 'consume' }) } });
//   const link = createHubLink({ ..., discoveryFile: fake.discoveryFile, probePorts: [] });
//   ... await fake.close();
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

function loadWs() {
  try { return require('ws'); } catch {
    throw new Error('fake-hub cần gói "ws" (npm i -D ws) - chỉ để chạy selftest, SDK thật không cần.');
  }
}

const MACHINE_ID = 'HPGH-FAKE0001';
const OPEN_PAGES = new Set(['home', 'camera', 'fxlib', 'obs', 'link', 'setup', 'settings', 'info']); // như server/app.cjs

async function startFakeHub({ port = 0, autoApprove = true, handlers = {}, discoveryFile, pingMs = 5000, version = '0.0.0-fake', grantScopes = (requested) => requested } = {}) {
  const { WebSocketServer } = loadWs();
  const allHandlers = {
    'gift.plan': () => ({ decision: 'pass' }), 'echo.test': (d) => ({ got: d }),
    'fx.list': () => ({ sources: [], sig: '' }),
    'fx.fire': () => ({ ok: false, code: 'unknown_src', error: 'Hub giả chưa có nguồn hiệu ứng' }),
    'fx.stop': () => ({ ok: true, stopped: false }),
    ...handlers,
  };
  const masterToken = 'hpl_fake' + crypto.randomBytes(8).toString('hex'); // token dùng được cho mọi app (bỏ qua ghép đôi)
  const tokens = new Map(); // appId → token đã cấp
  const revoked = new Set();
  const pairs = new Map(); // pairId → { appId, status, token?, scopes }
  const sockets = new Set(); // { ws, appId, scopes }
  const received = [];
  const pongs = []; // hub.pong app trả cho hub.ping (tách riêng khỏi received)
  const opened = []; // POST /hub/v1/open: { appId, page, auth, xHpApp }
  let pairCount = 0; // số lần POST /hub/v1/pair (kể cả body hỏng) - selftest của app dùng để chứng minh app KHÔNG xin ghép (vd máy chủ cách ly)

  const appOfToken = (t) => { for (const [a, v] of tokens) if (v === t) return a; return t === masterToken ? '*' : null; };
  const bearer = (req) => { const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || ''); return m ? m[1] : ''; };
  const identify = (req) => {
    const t = bearer(req);
    const a = appOfToken(t);
    if (!a || revoked.has(t)) return null;
    const claimed = req.headers['x-hp-app'];
    if (a !== '*' && claimed && claimed !== a) return null;
    return a;
  };

  function issue(appId) {
    const t = 'hpl_' + crypto.randomBytes(16).toString('hex');
    tokens.set(appId, t);
    return t;
  }
  const json = (res, status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const readBody = (req) => new Promise((resolve) => {
    let s = '';
    req.on('data', (d) => { s += d; });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch { resolve(null); } });
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fake.local');
    if (req.method === 'GET' && url.pathname === '/hub/v1/hello') {
      return json(res, 200, { ok: true, hub: 'hp-game-hub', protocol: 1, version, machineId: MACHINE_ID, paired: !!identify(req), lan: false });
    }
    if (req.method === 'POST' && url.pathname === '/hub/v1/pair') {
      pairCount++;
      const b = await readBody(req);
      if (!b || typeof b.appId !== 'string') return json(res, 400, { ok: false, error: { code: 'bad_request', message: 'thiếu appId' } });
      const pairId = 'p_' + crypto.randomBytes(8).toString('hex');
      const p = { appId: b.appId, status: 'pending', scopes: grantScopes(Array.isArray(b.scopes) ? b.scopes : []) };
      pairs.set(pairId, p);
      if (autoApprove) approveOne(p);
      return json(res, 202, { ok: true, pairId, code: '123456', expiresIn: 120 });
    }
    const m = /^\/hub\/v1\/pair\/([\w-]+)$/.exec(url.pathname);
    if (req.method === 'GET' && m) {
      const p = pairs.get(m[1]);
      if (!p) return json(res, 200, { ok: true, status: 'expired' });
      return json(res, 200, p.status === 'approved' ? { ok: true, status: 'approved', token: p.token, scopes: p.scopes } : { ok: true, status: p.status });
    }
    const deny = () => json(res, 401, revoked.has(bearer(req))
      ? { ok: false, error: { code: 'token_revoked', message: 'Token đã bị thu hồi.' } }
      : { ok: false, error: { code: 'unauthorized', message: 'Thiếu hoặc sai token.' } });
    if (req.method === 'GET' && url.pathname === '/hub/v1/state') {
      if (identify(req)) return json(res, 200, { ok: true, version });
      return deny();
    }
    // Link overlay OBS - cùng dạng Hub thật (§6): localhost + cổng, có 'body'.
    if (req.method === 'GET' && url.pathname === '/hub/v1/overlays') {
      if (!identify(req)) return deny();
      const b = `http://localhost:${server.address().port}`;
      return json(res, 200, [{ id: 'camgames', url: b + '/overlay/camgames' }, { id: 'body', url: b + '/overlay/body' }]);
    }
    // Mở trang Hub (§6): ghi vào fake.opened để test kiểm.
    if (req.method === 'POST' && url.pathname === '/hub/v1/open') {
      const a = identify(req);
      if (!a) return deny();
      const b = await readBody(req);
      const page = b && typeof b.page === 'string' ? b.page : '';
      if (!OPEN_PAGES.has(page)) return json(res, 400, { ok: false, error: { code: 'bad_request', message: 'page phải là ' + [...OPEN_PAGES].join(' | ') } });
      opened.push({ appId: a === '*' ? (req.headers['x-hp-app'] || 'unknown') : a, page, auth: req.headers.authorization || '', xHpApp: req.headers['x-hp-app'] || '' });
      return json(res, 200, { ok: true });
    }
    json(res, 404, { ok: false, error: { code: 'not_found', message: url.pathname } });
  });

  function approveOne(p) {
    p.status = 'approved';
    p.token = issue(p.appId);
    revoked.delete(p.token);
  }

  // WebSocket: noServer để chỉ nhận đúng /hub/v1/ws
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://fake.local');
    if (url.pathname !== '/hub/v1/ws') { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const t = url.searchParams.get('token') || bearer(req);
      const a = appOfToken(t);
      if (!a || revoked.has(t)) { ws.close(revoked.has(t) ? 4001 : 4401, revoked.has(t) ? 'token_revoked' : 'unauthorized'); return; }
      const appId = a === '*' ? (url.searchParams.get('app') || 'unknown') : a;
      const entry = { ws, appId, token: t };
      sockets.add(entry);
      const timer = setInterval(() => { try { ws.send(JSON.stringify({ t: 'ev', name: 'hub.ping', data: {}, ts: Date.now() })); } catch {} }, pingMs);
      timer.unref();
      ws.on('error', () => {});
      ws.on('close', () => { clearInterval(timer); sockets.delete(entry); });
      ws.on('message', async (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        if (!msg || typeof msg.name !== 'string') return;
        if (msg.name === 'hub.pong') { pongs.push({ appId, at: Date.now() }); return; }
        if (msg.t === 'ev') { received.push({ appId, t: 'ev', name: msg.name, data: msg.data }); return; }
        if (msg.t !== 'req') return;
        received.push({ appId, t: 'req', name: msg.name, data: msg.data });
        const h = allHandlers[msg.name];
        const reply = (o) => { try { ws.send(JSON.stringify({ t: 'res', id: msg.id, ...o })); } catch {} };
        if (!h) return reply({ ok: false, error: { code: 'unknown_name', message: `Hub giả không có xử lý cho "${msg.name}".` } });
        try { reply({ ok: true, data: (await h(msg.data, { appId })) ?? null }); } catch (e) { reply({ ok: false, error: { code: 'handler_error', message: String((e && e.message) || e) } }); }
      });
    });
  });

  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const realPort = server.address().port;
  const file = discoveryFile || path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hp-fake-hub-')), 'hub.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ protocol: 1, port: realPort, pid: process.pid, version, startedAt: new Date().toISOString(), host: '127.0.0.1' }));

  return {
    port: realPort,
    url: `http://127.0.0.1:${realPort}`,
    token: masterToken,
    received,
    pongs,
    opened,
    get pairCount() { return pairCount; },
    // quyền đã cấp cho app (lần ghép gần nhất được duyệt); chưa ghép → null
    scopesOf(appId) { for (const p of [...pairs.values()].reverse()) if (p.appId === appId && p.status === 'approved') return [...p.scopes]; return null; },
    discoveryFile: file,
    // Gửi ev từ Hub tới app (socket mới nhất của app đó). true = đã gửi.
    emit(appId, name, data) {
      const list = [...sockets].filter((s) => s.appId === appId && s.ws.readyState === 1);
      const e = list[list.length - 1];
      if (!e) return false;
      e.ws.send(JSON.stringify({ t: 'ev', name, data, ts: Date.now() }));
      return true;
    },
    // autoApprove=false: duyệt tay mọi yêu cầu đang chờ. Trả số yêu cầu đã duyệt.
    approve() {
      let n = 0;
      for (const p of pairs.values()) if (p.status === 'pending') { approveOne(p); n++; }
      return n;
    },
    // Thu hồi token của app: socket đang mở bị đóng 4001, token cũ trả 401 token_revoked.
    revoke(appId) {
      const t = tokens.get(appId);
      if (!t) return false;
      revoked.add(t);
      tokens.delete(appId);
      for (const s of [...sockets]) if (s.token === t) s.ws.close(4001, 'token_revoked');
      return true;
    },
    async close() {
      for (const s of sockets) { try { s.ws.terminate(); } catch {} }
      sockets.clear();
      wss.close();
      server.closeAllConnections();
      await new Promise((r) => server.close(() => r()));
      try { const d = JSON.parse(fs.readFileSync(file, 'utf8')); if (d.port === realPort) fs.rmSync(file, { force: true }); } catch {}
    },
  };
}

module.exports = { startFakeHub };
