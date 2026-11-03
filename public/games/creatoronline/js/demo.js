/**
 * Creator Online — entry point. Wires the building, live rooms, NPC streamers
 * and fans, the player controller, camera, positional room audio, gifts,
 * roles, PK battles, mini games, HUD and the optional LAN connection.
 */
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildWorld, HALL } from './world.js';
import { buildDecor } from './decor.js';
import { animateCharacter, setLook, setProps, drawAvatar, HAIR_COLORS, HAT_COLORS, OUTFITS } from './character.js';
import { NpcManager, makeActor, syncActor, turnToward, separateActors, angleDelta } from './npc.js';
import { Effects } from './effects.js';
import { AudioFx } from './audio.js';
import { Net } from './net.js';
import { Hud, el } from './hud.js';
import * as S from './screens.js';
import { stepBody } from './logic/physics.js';
import { mulberry32, pick, range, shuffled } from './logic/rng.js';
import { formatThousands, rankFor, cleanText } from './logic/format.js';
import { loadProfile, saveProfile, spend } from './logic/profile.js';
import {
  createRoomState, pushComment, applyGift, topFans, isBigGift, startPk, pkHas, pkAddScore, pkRemaining, pkShare, pkResult,
  judgeBeat, comboReward, pickWeighted, distToRect, cooldownLeft, clampIdols, memberCount, MIN_IDOLS, MAX_IDOLS,
} from './logic/rooms.js';
import { SeatHouse, NpcSeatSim } from './logic/seats.js';

const cfg = await fetch('data.json').then((r) => r.json());
// chữ trên màn LED/biển phòng vẽ bằng canvas lúc dựng tòa nhà → nạp font trước, không thì vẽ bằng font dự phòng
await Promise.all(['700 20px "Baloo 2"', '800 20px "Baloo 2"'].map((f) => document.fonts.load(f).catch(() => null)));
const T = cfg.tuning;
await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]);

// ------------------------------------------------------------------ renderer
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.append(renderer.domElement);
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.className = 'labels';
container.append(labelRenderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 220);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------------ data helpers
const GENRES = cfg.genres;
const genresFor = (type) => Object.entries(GENRES).filter(([, g]) => g.type === type);
const giftById = new Map(cfg.gifts.map((g) => [g.id, g]));
const NPC_GIFT_WEIGHTS = { rose: 40, heart: 25, icecream: 15, mic: 9, cake: 6, car: 3, castle: 1.5, rocket: 0.5 };
const npcGiftTable = cfg.gifts.map((g) => ({ ...g, w: NPC_GIFT_WEIGHTS[g.id] ?? 1 }));
const SONGS = {
  ballad: ['Mưa Trên Phố Nhỏ', 'Gửi Ngày Hôm Qua', 'Chiếc Ô Màu Xanh'],
  bolero: ['Trăng Quê Mình', 'Chuyến Xe Cuối Ngày', 'Thư Gửi Mẹ Hiền'],
  acoustic: ['Cà Phê Sáng Nay', 'Đạp Xe Qua Phố', 'Nắng Ban Mai'],
  rnb: ['Đêm Thành Phố', 'Chậm Lại Thôi', 'Mây Trôi Lững Lờ'],
};
const genreSrc = (key) => ({ style: GENRES[key]?.style ?? 'lobby', file: GENRES[key]?.file, bpm: GENRES[key]?.bpm });
const genreLabel = (key) => GENRES[key]?.label ?? key;
const ROLE_PROPS = { idol: { mic: false }, mc: { mic: true }, tech: { headset: true }, manager: { clipboard: true } };

// ------------------------------------------------------------------ systems
const rng = mulberry32(T.seed);
// group stages without a fixed name get a random one
{
  const pool = shuffled(rng, cfg.randomGroupNames ?? []);
  for (const g of cfg.groupRooms) if (!g.name) g.name = pool.shift() ?? `Nhóm ${g.id}`;
}
const world = buildWorld(scene, cfg);
// trang trí dùng chung với bản LIVE (spec §20); dấu vết quà chỉ có ở bản LIVE
const decor = buildDecor(scene, world, { labelKind: 'guard' });
const states = new Map();
for (const room of world.rooms) {
  const pool = genresFor(room.type);
  const genre = room.type === 'group' ? room.def.genre : pool[room.index % pool.length][0];
  const st = createRoomState({ id: room.id, type: room.type, name: room.def?.name ?? room.id, genre, theme: room.def?.theme ?? 'neon', idols: 3 + Math.floor(rng() * 3) });
  st.baseViewers = room.type === 'group' ? Math.floor(range(rng, 400, 3200)) : Math.floor(range(rng, 30, 700));
  st.viewers = st.baseViewers;
  st.hearts = Math.floor(st.baseViewers * range(rng, 2, 9));
  st.holders = { mc: null, tech: null, manager: null, idol: {} };
  st.commentT = range(rng, 0, 3);
  st.giftT = range(rng, 1, 6);
  st.sayT = range(rng, 3, 10);
  st.scrT = rng();
  st.camIdx = 0;
  st.camT = 0;
  st.boost = 0;
  st.hype = 0;
  if (room.type === 'sing') st.song = pick(rng, SONGS[genre] ?? ['La la la']);
  if (room.type === 'game') st.match = newMatch(0);
  states.set(room.id, st);
}
const npcs = new NpcManager({ scene, world, cfg, rng, states });
npcs.spawn();
for (const room of world.rooms) {
  const st = states.get(room.id);
  st.title = room.type === 'group' ? room.def.name : room.type === 'stand' ? `Phòng ${st.streamer}` : room.type === 'sing' ? `Góc hát ${st.streamer}` : `Kênh game ${st.streamer}`;
}
// solo rooms belong to whoever gifted a room ticket (rules in logic/seats.js)
const SEAT = cfg.seats;
const seatHouse = new SeatHouse({ rooms: world.rooms, holdMs: SEAT.holdSec * 1000, maxQueue: SEAT.maxQueue });
const seatSim = new NpcSeatSim(seatHouse, { names: cfg.fanNames, rng: Math.random, everyMs: SEAT.npcEverySec.map((x) => x * 1000), stayMs: SEAT.npcStaySec.map((x) => x * 1000) });
seatSim.seed(Date.now(), 0.85);
const SOLO_PREFIX = { stand: 'Phòng', sing: 'Góc hát', game: 'Kênh game' };
const TICKET = { id: 'ticket', name: SEAT.ticket.name, icon: SEAT.ticket.icon, price: SEAT.price };
const accentOf = (room) => (room.type === 'group' ? room.def.accent : room.type === 'stand' ? `hsl(${room.index * 36},85%,62%)` : room.type === 'sing' ? '#ff6fb5' : '#31d0a0');

const effects = new Effects(scene);
const audio = new AudioFx({ files: cfg.audioFiles });
for (const room of world.rooms) audio.setChannel(room.id, genreSrc(states.get(room.id).genre));
audio.setChannel('lobby', { style: cfg.lobbyMusic.style, file: cfg.lobbyMusic.file });
const remotes = new Map();
const fallbackName = pick(Math.random, cfg.playerNames);
const profile = loadProfile(window.localStorage, fallbackName, T.startCoins);

let player = null;
let myRole = null; // {roomId, role, slot}
let pendingRole = null;
let focusRoom = null;
let pk = null;
let pkT = T.autoPkEverySec * 0.4;
let netT = 0;
let hudT = 0;
let saveT = 0;
let watchT = 0;
let heartCd = 0;
let heartBatch = new Map();
let heartSendT = 0;
let netStatus = 'offline';
let rhythm = { combo: 0, last: 0 };
let roleIncome = 0;
let myHost = null; // solo room id the player owns
let myQueue = null; // {roomId, position}
let seatT = 0;
const seatSeen = new Map(); // roomId -> owner id last shown
const queueActors = new Map(); // roomId -> Map(whoId -> actor)
let liveRoom = null;
let frameNo = 0;
const mini = { quiz: null, guess: null, wheelBusy: false };
const input = { keys: new Set(), joy: { x: 0, y: 0 }, pressed: false, jump: false };
const cam = { yaw: 0, pitch: 0.42, dist: 9.5, wide: false, target: new THREE.Vector3(0, 1, 15), dragging: false };
const raycaster = new THREE.Raycaster();

const hud = new Hud({ onSend: sendChat, onButton });

// live TV render target (one group stage at a time)
const rt = new THREE.WebGLRenderTarget(512, 288);
const tvCam = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 60);

// ------------------------------------------------------------------ helpers
const save = () => saveProfile(window.localStorage, profile);
const myId = () => (net.online ? net.id : 'me');
const fanRank = () => rankFor(profile.gifted, cfg.fanRanks);
const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const allActors = () => {
  const list = npcs.all.slice();
  for (const r of remotes.values()) list.push(r);
  if (player) list.push(player);
  return list;
};
const onlineCount = () => npcs.all.length + remotes.size + (player ? 1 : 0);
const stagePos = (room) => (room.type === 'group' ? { x: room.cx, y: 2.6, z: -33 } : { x: room.spots.streamer.x, y: 2.4, z: room.spots.streamer.z });
const playerDist = (room) => (player ? distToRect(room.rect, player.body.pos.x, player.body.pos.z) : 99);
const isNear = (room, d = 22) => playerDist(room) < d;
const randomFan = () => (Math.random() < 0.7 ? pick(Math.random, cfg.fanNames) : `user${Math.floor(1000 + Math.random() * 9000)}`);

function earn(coins, text, kind = 'gold') {
  if (!coins) return;
  profile.coins += coins;
  profile.earned += coins;
  save();
  if (text) hud.toast(`${text} +${coins} xu`, kind);
  audio.play('coin');
  updateHud(true);
}

function addChat(name, text, kind = 'npc', tag = '') {
  hud.chat(name, text, kind, tag);
}

/** Positional volume/pan for one-shot sounds at a world point. */
function spatial(x, z, radius = 18) {
  if (!player) return { vol: 0, pan: 0 };
  const dx = x - player.body.pos.x;
  const dz = z - player.body.pos.z;
  const d = Math.hypot(dx, dz);
  const vol = Math.max(0, 1 - d / radius) ** 1.5;
  const pan = d > 0.5 ? (dx * Math.cos(cam.yaw) - dz * Math.sin(cam.yaw)) / d : 0;
  return { vol, pan: pan * 0.8 };
}

/** NPC says a line: bubble + voice + (if relevant) chat log. */
function npcSay(actor, line, room, toChat = true) {
  if (!actor || actor.hidden) return;
  actor.label.say(line);
  actor.talkT = 2.5;
  const p = spatial(actor.body.pos.x, actor.body.pos.z, 16);
  audio.voice(line, actor.role === 'idol' ? 1.4 : 1.1 + (actor.name.length % 4) * 0.08, p.vol, p.pan);
  if (toChat && room && room === focusRoom) addChat(actor.baseName ?? actor.name, line, 'host', room.id);
}

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

function newMatch(no) {
  return { no: no + 1, alive: 48 + Math.floor(Math.random() * 3), t: 0, next: 2.5, result: null, endT: 0, pred: null };
}

// ------------------------------------------------------------------ room events (shared by local player, NPCs and network)
function giftFx(room, gift, count, from, mine) {
  const st = states.get(room.id);
  const sp = stagePos(room);
  const near = isNear(room, 26);
  if (near) {
    const n = Math.min(count, 8);
    for (let i = 0; i < n; i++) {
      setTimeout(() => effects.float(gift.icon, sp.x + (Math.random() - 0.5) * (room.type === 'group' ? 8 : 1.5), sp.y, sp.z + (Math.random() - 0.5) * 2, { size: isBigGift(gift) ? 1.6 : 0.8, rise: 1.2, life: 2.4 }), i * 90);
    }
    const p = spatial(sp.x, sp.z, 24);
    if (isBigGift(gift)) {
      effects.confetti(sp.x, sp.y + 3, sp.z, 220, 6);
      audio.play('bigGift', p.vol, p.pan);
      audio.cheer(p.vol * 0.8, p.pan);
      st.boost = 1;
    } else audio.play('gift', p.vol * 0.7, p.pan);
  }
  if (isBigGift(gift) && (room === focusRoom || mine)) hud.banner(`${gift.icon} ${from} tặng ${gift.name}!`, `${room.id} · ${st.title}`);
  // thank-you from the host, not for every rose
  const speaker = npcs.speaker(room.id);
  if (speaker && (gift.price >= 10 || mine || Math.random() < 0.15)) {
    setTimeout(() => npcSay(speaker, `Cảm ơn ${from} đã tặng ${gift.name}${count > 1 ? ` x${count}` : ''}!`, room), 500);
  }
}

/** Apply a gift to a room from anyone. */
/** Coins a player spends on a room that is not a gift item (role ticket, genre, request). */
function payRoom(st, price, icon, name) {
  profile.gifted += price;
  applyGift(st, profile.name, { id: 'ticket', price }, 1);
  st.lastGift = { ...st.lastGift, icon, name };
  st.dirty = true;
}

function receiveGift(room, gift, count, from, { mine = false, remote = false } = {}) {
  const st = states.get(room.id);
  const value = applyGift(st, from, gift, count);
  st.lastGift = { ...st.lastGift, icon: gift.icon, name: gift.name };
  st.hearts += Math.round(value / 5);
  if (pkHas(pk, room.id)) {
    pkAddScore(pk, room.id, value);
    if (mine) pk.mine[room.id] = (pk.mine[room.id] ?? 0) + value;
  }
  if (room === focusRoom || mine) {
    const kind = mine ? 'self' : remote ? 'remote' : 'gift';
    addChat(from, `đã tặng ${gift.icon} ${gift.name}${count > 1 ? ` x${count}` : ''}`, kind === 'self' ? 'self gift' : 'gift', room.id);
  }
  giftFx(room, gift, count, from, mine);
  // role holders and solo-room owners earn a share of what the room receives
  const share = mine ? 0 : myHost === room.id ? SEAT.hostShare : myRole && myRole.roomId === room.id && (myRole.role === 'idol' || myRole.role === 'mc') ? T.roleShare : 0;
  if (share) {
    roleIncome += value * share;
    if (roleIncome >= 1) {
      const c = Math.floor(roleIncome);
      roleIncome -= c;
      profile.coins += c;
      profile.earned += c;
    }
  }
  st.dirty = true;
}
function sendGift(room, gift, count = 1) {
  if (!player) return;
  const cost = gift.price * count;
  if (!spend(profile, cost)) {
    hud.toast(`Không đủ xu! Cần ${cost} xu.`, 'bad');
    audio.play('miss');
    return;
  }
  profile.gifted += cost;
  save();
  player.timers.cheer = 1.2;
  receiveGift(room, gift, count, profile.name, { mine: true });
  net.event('gift', { room: room.id, gift: gift.id, count });
  updateHud(true);
}

function sendHeart(room) {
  if (!player || heartCd > 0) return;
  heartCd = 0.12;
  const st = states.get(room.id);
  st.hearts += 1;
  profile.hearts += 1;
  if (pkHas(pk, room.id)) pkAddScore(pk, room.id, 1);
  const p = player.body.pos;
  effects.float(pick(Math.random, ['❤️', '💖', '💗', '💕']), p.x + (Math.random() - 0.5) * 0.4, p.y + 2.2, p.z, { size: 0.5, rise: 1.6, life: 1.6 });
  const sp = stagePos(room);
  if (Math.random() < 0.5) effects.float('❤️', sp.x + (Math.random() - 0.5) * 3, sp.y - 0.6, sp.z, { size: 0.45, rise: 1.2, life: 1.5 });
  audio.play('heart', 0.5);
  player.timers.wave = 0.8;
  heartBatch.set(room.id, (heartBatch.get(room.id) ?? 0) + 1);
  if (profile.hearts % 100 === 0) {
    const sp2 = npcs.speaker(room.id);
    npcSay(sp2, `Cảm ơn ${profile.name} đã thả ${formatThousands(profile.hearts)} tim nha!`, room);
    earn(5, 'Mốc thả tim:');
  }
  st.dirty = true;
}

/** Change genre (music + screens). */
function applyGenre(room, key, by) {
  const st = states.get(room.id);
  if (!GENRES[key] || GENRES[key].type !== room.type || st.genre === key) return;
  st.genre = key;
  audio.setChannel(room.id, genreSrc(key));
  if (room.type === 'sing') st.song = pick(Math.random, SONGS[key] ?? ['La la la']);
  if (room.type === 'game') st.match = newMatch(st.match?.no ?? 0);
  const label = genreLabel(key);
  if (by === 'server') return;
  if (room === focusRoom || by === profile.name) {
    hud.banner(`${room.id} đổi thể loại: ${label}`, `bởi ${by}`);
    addChat('Hệ thống', `${by} đã đổi phòng ${room.id} sang ${label}!`, 'system');
  }
  const lines = room.type === 'group' ? cfg.streamerLines.group.mc : cfg.streamerLines[key];
  if (lines) setTimeout(() => npcSay(npcs.speaker(room.id), fill(pick(Math.random, lines), { room: st.title }), room), 700);
  drawRoomScreens(room, performance.now() / 1000, true);
}

function applyTheme(room, key, by) {
  if (room.type !== 'group' || !cfg.lightThemes[key]) return;
  const st = states.get(room.id);
  st.theme = key;
  world.setTheme(room, key);
  if (room === focusRoom && by !== 'server') addChat('Kỹ thuật', `${by} chuyển đèn sang "${cfg.lightThemes[key].label}"`, 'system', room.id);
  st.dirty = true;
}

function applyIdols(room, n, by) {
  const st = states.get(room.id);
  const v = clampIdols(n);
  if (v === st.idols) return;
  // drop holders of slots that no longer exist
  for (const k of Object.keys(st.holders.idol)) if (Number(k) >= v) delete st.holders.idol[k];
  if (myRole && myRole.roomId === room.id && myRole.role === 'idol' && myRole.slot >= v) clearMyRole('Sân khấu thu gọn, bạn rời vị trí idol.');
  st.idols = v;
  npcs.applyRoles(room.id);
  if (room === focusRoom && by !== 'server') addChat('Quản lý', `${by}: nhóm ${st.title} giờ có ${memberCount(st)} thành viên`, 'system', room.id);
  st.dirty = true;
}

function applyFx(room, fx, by) {
  const st = states.get(room.id);
  const c = room.cx;
  const near = isNear(room, 30);
  const p = spatial(c, -30, 26);
  if (fx === 'confetti' && near) {
    effects.confetti(c, 6.8, -32, 260, 7);
    audio.play('confetti', p.vol, p.pan);
  } else if (fx === 'smoke' && near) {
    effects.smoke(c, room.stageY, -33.5, 13, 6);
    audio.play('smoke', p.vol, p.pan);
  } else if (fx === 'laser' && near) {
    const cols = cfg.lightThemes[st.theme]?.colors ?? ['#3be38f'];
    effects.laser(c, 6.9, -36.2, cols, 7);
    audio.play('laser', p.vol, p.pan);
  }
  if (fx === 'flash') st.boost = 1;
  if (near) audio.cheer(p.vol * 0.6, p.pan);
  if (room === focusRoom && by) addChat('Kỹ thuật', `${by} bật hiệu ứng ${{ confetti: 'pháo giấy 🎉', smoke: 'khói ☁️', laser: 'laser ⚡', flash: 'chớp đèn 💡' }[fx]}`, 'system', room.id);
}

// ------------------------------------------------------------------ roles
function applyRole(roomId, role, slot, holder) {
  const room = world.byId.get(roomId);
  const st = states.get(roomId);
  if (!room || room.type !== 'group') return;
  if (role === 'idol') st.holders.idol[slot] = holder;
  else st.holders[role] = holder;
  npcs.applyRoles(roomId);
  const r = cfg.roles[role];
  if (holder.id === myId()) {
    const price = pendingRole?.price ?? r.price;
    pendingRole = null;
    if (!spend(profile, price)) {
      // could not pay after all: give it back
      releaseRole(roomId, role, slot);
      hud.toast('Không đủ xu để nhận vai.', 'bad');
      return;
    }
    payRoom(st, price, r.icon, r.gift);
    save();
    myRole = { roomId, role, slot };
    const spot = role === 'idol' ? room.spots.idols[slot] : room.spots[role];
    player.body.pos.x = spot.x;
    player.body.pos.y = spot.y;
    player.body.pos.z = spot.z + (role === 'tech' ? 0.05 : 0);
    player.body.vy = 0;
    player.ry = spot.ry;
    player.dancing = role === 'idol';
    setProps(player.char, ROLE_PROPS[role]);
    hud.banner(`${r.icon} Bạn là ${r.label} của ${st.title}!`, `Đã tặng ${r.gift} (${price} xu)`);
    audio.play('bigGift');
    effects.confetti(spot.x, 4, spot.z, 120, 3);
    addChat('Hệ thống', `${profile.name} tặng ${r.gift} và trở thành ${r.label} của ${st.title}!`, 'system', roomId);
    hud.toast(r.desc);
    updateHud(true);
  } else {
    const a = remotes.get(holder.id);
    if (a) {
      setProps(a.char, ROLE_PROPS[role]);
      a.role = { roomId, role, slot };
    }
    if (room === focusRoom) addChat('Hệ thống', `${holder.name} trở thành ${r.label} của ${st.title}!`, 'system', roomId);
  }
  st.dirty = true;
}

function unapplyRole(roomId, role, slot) {
  const st = states.get(roomId);
  if (!st) return;
  let holder;
  if (role === 'idol') {
    holder = st.holders.idol[slot];
    delete st.holders.idol[slot];
  } else {
    holder = st.holders[role];
    st.holders[role] = null;
  }
  npcs.applyRoles(roomId);
  if (holder && holder.id !== myId()) {
    const a = remotes.get(holder.id);
    if (a) {
      setProps(a.char, { stick: true });
      a.role = null;
    }
  }
  st.dirty = true;
}

function clearMyRole(msg) {
  if (!myRole) return;
  const { roomId, role, slot } = myRole;
  myRole = null;
  player.dancing = false;
  setProps(player.char, { stick: true, stickColor: 0xff4fa3 });
  releaseRole(roomId, role, slot);
  if (msg) hud.toast(msg);
  updateHud(true);
}

function releaseRole(roomId, role, slot) {
  unapplyRole(roomId, role, slot);
  net.event('unrole', { room: roomId, role, slot });
}

function claimRole(room, role) {
  const st = states.get(room.id);
  const r = cfg.roles[role];
  if (myRole && myRole.roomId === room.id && myRole.role === role) return;
  if (profile.coins < r.price) {
    hud.toast(`Cần ${r.price} xu để tặng ${r.gift}.`, 'bad');
    return;
  }
  let slot = 0;
  if (role === 'idol') {
    slot = -1;
    for (let k = 0; k < st.idols; k++) if (!st.holders.idol[k]) { slot = k; break; }
    if (slot < 0) {
      hud.toast('Sân khấu đã kín idol người chơi.', 'bad');
      return;
    }
  } else if (st.holders[role]) {
    hud.toast(`${st.holders[role].name} đang giữ vai ${r.label}.`, 'bad');
    return;
  }
  if (myRole) clearMyRole();
  if (net.online) {
    pendingRole = { roomId: room.id, role, slot, price: r.price };
    net.event('role', { room: room.id, role, slot });
  } else applyRole(room.id, role, slot, { id: 'me', name: profile.name });
  hud.closePanel();
}

function amHolder(room, role) {
  return myRole && myRole.roomId === room.id && myRole.role === role;
}

// ------------------------------------------------------------------ solo rooms: named after the gifter, waiting line by the door
let myLineKey = null;

/** Short status for the door sign. */
function seatLine(room) {
  const seat = seatHouse.get(room.id);
  if (!seat?.owner) return `${TICKET.icon} Phòng trống — tặng vé để vào`;
  const left = Math.ceil(seatHouse.lockLeft(room.id, Date.now()) / 1000);
  return `${left > 0 ? `🔒 ${left}s` : '🔓 giành được'}${seat.queue.length ? ` · ⏳ ${seat.queue.length} chờ` : ''}`;
}

/** Bring a solo room's title, host, waiting line and the player in line with its seat. */
function refreshSeat(room) {
  const seat = seatHouse.get(room.id);
  if (!seat) return;
  const st = states.get(room.id);
  const owner = seat.owner;
  const me = myId();
  st.title = owner ? `${SOLO_PREFIX[room.type]} ${owner.name}` : 'PHÒNG TRỐNG';
  st.streamer = owner?.name ?? 'Phòng trống';
  st.washDrawn = false;
  st.dirty = true;
  npcs.setSoloHost(room.id, owner, owner && !owner.npc);
  syncQueue(room, seat);
  const prevId = seatSeen.get(room.id) ?? null;
  const nowId = owner?.id ?? null;
  seatSeen.set(room.id, nowId);
  if (prevId === nowId) return;
  if (prevId === me && nowId !== me) loseHost(room, owner);
  if (nowId === me && myHost !== room.id) becomeHost(room);
}

/** People waiting stand against the glass beside the door, in order, watching the live. */
function syncQueue(room, seat) {
  let line = queueActors.get(room.id);
  if (!line) queueActors.set(room.id, (line = new Map()));
  const keep = new Set();
  seat.queue.forEach((q, i) => {
    const spot = room.queueSpots[Math.min(i, room.queueSpots.length - 1)];
    if (q.id === myId()) {
      placeMeInLine(room, i + 1, spot);
      return;
    }
    if (!q.npc) return; // real players walk to their place themselves
    keep.add(q.id);
    let a = line.get(q.id);
    if (!a) {
      a = npcs.addQueuer(q.name, room, spot);
      line.set(q.id, a);
    }
    npcs.moveQueuer(a, spot, i + 1);
  });
  for (const [id, a] of line) {
    if (keep.has(id)) continue;
    npcs.removeQueuer(a);
    line.delete(id);
  }
  const mine = seatHouse.queuedIn(myId());
  myQueue = mine ? { roomId: mine.seat.id, position: mine.position } : null;
  if (!mine) myLineKey = null;
}

/** Walk the player into their place in line (when they join, or move up while nearby). */
function placeMeInLine(room, position, spot) {
  const key = `${room.id}:${position}`;
  if (!player || myLineKey === key) return;
  const fresh = !myLineKey || !myLineKey.startsWith(`${room.id}:`);
  myLineKey = key;
  if (!fresh && playerDist(room) > 6) return;
  if (player.seat) standUpPlayer();
  Object.assign(player.body.pos, { x: spot.x, y: 0, z: spot.z });
  player.ry = spot.ry;
}

function becomeHost(room) {
  if (!player) return;
  if (myRole) clearMyRole();
  myHost = room.id;
  myLineKey = null;
  const spot = room.spots.streamer;
  if (player.seat) standUpPlayer();
  if (room.type === 'stand') {
    Object.assign(player.body.pos, { x: spot.x, y: 0, z: spot.z });
    player.ry = spot.ry;
  } else {
    sitPlayer({ x: spot.x, z: spot.z, y: spot.y + 0.4, ry: spot.ry, approach: room.door.in, hostMode: room.type === 'sing' ? 'singSit' : 'game' });
  }
  setProps(player.char, { mic: room.type === 'sing', headset: room.type === 'game' });
  hud.banner(`👑 ${SOLO_PREFIX[room.type]} ${profile.name}`, `Bạn là chủ phòng ${room.id} · ${SEAT.holdSec} giây đầu không ai giành được`);
  audio.play('bigGift');
  effects.confetti(spot.x, 3, spot.z, 120, 2);
  updateHud(true);
}

/** Someone else took the room (after the protection time): step out by the door. */
function loseHost(room, newOwner) {
  if (myHost !== room.id) return;
  myHost = null;
  if (player.seat) standUpPlayer();
  Object.assign(player.body.pos, { x: room.door.out.x, y: 0, z: room.door.out.z });
  setProps(player.char, { stick: true, stickColor: 0xff4fa3 });
  hud.toast(newOwner ? `${newOwner.name} đã vào phòng ${room.id} — bạn nhường phòng.` : `Bạn đã rời phòng ${room.id}.`, 'bad');
  updateHud(true);
}

/** The player gives the room up (walked out, or pressed the button). */
function leaveMySeat(msg) {
  const id = myHost;
  if (!id) return;
  myHost = null;
  if (player.seat?.hostMode) standUpPlayer();
  setProps(player.char, { stick: true, stickColor: 0xff4fa3 });
  if (net.online) net.event('unseat', { room: id });
  else {
    const c = seatHouse.leave(id, myId(), Date.now());
    if (c) seatEvents([c]);
    refreshSeat(world.byId.get(id));
  }
  if (msg) hud.toast(msg);
  updateHud(true);
}

function leaveMyQueue(room) {
  if (net.online) net.event('unseat', { room: room.id });
  else {
    seatHouse.leave(room.id, myId(), Date.now());
    refreshSeat(room);
  }
  hud.toast('Bạn đã rời hàng chờ.');
}

/** Gift a room ticket. Offline the rules run here; online the server decides. */
function claimSeat(room) {
  if (!player) return;
  if (profile.coins < SEAT.price) {
    hud.toast(`Cần ${SEAT.price} xu để tặng ${TICKET.icon} ${TICKET.name}.`, 'bad');
    return;
  }
  if (net.online) {
    net.event('seat', { room: room.id });
    return;
  }
  const who = { id: myId(), name: profile.name };
  const r = seatHouse.claim(room.id, who, Date.now());
  claimResult(r, room.id);
  seatEvents([{ room: r.room ?? room.id, kind: 'claim', result: r, who }]);
  for (const id of new Set([room.id, r.room].filter(Boolean))) refreshSeat(world.byId.get(id));
}

/** Pay for the ticket once the claim went through, and tell the player what happened. */
function claimResult(r, askedId) {
  const msg = {
    busy: `Bạn đang là chủ phòng ${r.room}. Ra khỏi phòng đó trước nhé.`,
    already: 'Bạn đang là chủ phòng này rồi.',
    full: 'Hàng chờ phòng này đã đầy, thử phòng khác nhé!',
    invalid: 'Phòng nhóm không dùng vé — hãy nhận vai trong tab Vai trò.',
  }[r.result];
  if (msg) {
    hud.toast(msg, 'bad');
    return;
  }
  if (!spend(profile, SEAT.price)) return;
  const target = world.byId.get(r.room ?? askedId);
  payRoom(states.get(target.id), SEAT.price, TICKET.icon, TICKET.name);
  save();
  audio.play('buy');
  if (r.result === 'queue') hud.toast(`${TICKET.icon} Bạn xếp hàng #${r.position} cạnh phòng ${target.id} — đến lượt sẽ tự vào.`, 'gold');
  else if (r.result === 'redirect') hud.toast(`Phòng ${askedId} đã có chủ, còn phòng trống nên bạn được vào ${target.id}.`, 'gold');
  hud.closePanel();
  updateHud(true);
}

/** Chat lines and small effects for seat changes the player can see. */
function seatEvents(events) {
  for (const e of events) {
    const room = world.byId.get(e.room);
    if (!room) continue;
    const near = room === focusRoom || isNear(room, 14);
    if (e.kind === 'claim') {
      const r = e.result;
      if (!near && e.who?.id !== myId()) continue;
      const text = {
        own: `tặng ${TICKET.icon} và vào phòng ${room.id}!`,
        redirect: `tặng ${TICKET.icon}, được xếp sang phòng trống ${room.id}`,
        takeover: `tặng ${TICKET.icon} giành phòng ${room.id} từ ${r.from?.name ?? '?'}`,
        queue: `tặng ${TICKET.icon} và xếp hàng chờ #${r.position} ở ${room.id}`,
      }[r.result];
      if (text) addChat(e.who?.name ?? '?', text, 'gift', room.id);
      if (near && ['own', 'takeover', 'redirect'].includes(r.result)) {
        const sp = stagePos(room);
        effects.float(TICKET.icon, sp.x, sp.y, sp.z, { size: 1, life: 2.2 });
        const p = spatial(sp.x, sp.z);
        audio.play('gift', p.vol, p.pan);
      }
    } else if (e.kind === 'promote' && near) addChat('Hệ thống', `Hết ${SEAT.holdSec} giây — ${e.to.name} đến lượt vào phòng ${room.id}!`, 'system', room.id);
    else if (e.kind === 'empty' && near) addChat('Hệ thống', `${e.from.name} rời phòng ${room.id}. Phòng đang trống!`, 'system', room.id);
  }
}

function applySeatSnapshot(id, snap) {
  const room = world.byId.get(id);
  if (!room || !seatHouse.get(id)) return;
  seatHouse.load(id, snap);
  refreshSeat(room);
}

/** Offline: run the protection timer and the NPC gifters here (online the server does it). */
let seatPanelT = 0;
function updateSeats(dt) {
  seatPanelT -= dt;
  if (seatPanelT <= 0) {
    seatPanelT = 1;
    const key = hud.panelOpen ? hud.panelKey ?? '' : '';
    if (key.endsWith(':seat')) openRoom(world.byId.get(key.split(':')[1]), 'seat');
  }
  seatT -= dt;
  if (seatT > 0 || net.online) return;
  seatT = 0.5;
  const now = Date.now();
  const events = [...seatHouse.tick(now), ...seatSim.step(now)];
  if (!events.length) return;
  seatEvents(events);
  for (const id of new Set(events.map((e) => e.room))) refreshSeat(world.byId.get(id));
}

function tabSeat(body, room) {
  const seat = seatHouse.get(room.id);
  const left = Math.ceil(seatHouse.lockLeft(room.id, Date.now()) / 1000);
  const me = myId();
  const owner = seat.owner;
  const status = !owner
    ? 'Tặng vé là vào ngay, phòng đổi tên theo bạn.'
    : left > 0
      ? `🔒 Còn ${left} giây bảo vệ — ai tặng vé lúc này phải xếp hàng chờ`
      : seat.queue.length
        ? '⏱ Hết giờ bảo vệ — người đầu hàng vào ngay'
        : `🔓 Đã quá ${SEAT.holdSec} giây — tặng vé sẽ giành phòng nếu không còn phòng trống cùng loại`;
  body.append(el('div', { className: 'seat-card' },
    el('div', { className: 'seat-owner', textContent: owner ? `👑 ${owner.name}${owner.id === me ? ' (bạn)' : ''}` : '🚪 Phòng đang trống' }),
    el('div', { className: `seat-lock ${left > 0 ? 'on' : ''}`, textContent: status })));
  body.append(el('h3', { textContent: `⏳ Hàng chờ ${seat.queue.length}/${SEAT.maxQueue} — đứng cạnh cửa phòng` }));
  if (!seat.queue.length) body.append(el('p', { className: 'muted', textContent: 'Chưa có ai chờ.' }));
  seat.queue.forEach((q, i) => body.append(el('div', { className: `list-row ${q.id === me ? 'me' : ''}` },
    el('b', { textContent: `#${i + 1}` }),
    el('span', { className: 'grow', textContent: q.name + (q.id === me ? ' (bạn)' : '') }),
    el('span', { className: 'muted', textContent: i === 0 && owner ? (left > 0 ? `vào sau ${left}s` : 'sắp vào') : '' }))));
  const inLine = seat.queue.some((q) => q.id === me);
  if (owner?.id === me) body.append(el('button', { className: 'wide ghost', textContent: '🚪 Rời phòng (nhường cho người chờ)', onclick: () => { leaveMySeat('Bạn đã nhường phòng.'); openRoom(room, 'seat'); } }));
  else if (inLine) body.append(el('button', { className: 'wide ghost', textContent: 'Rời hàng chờ', onclick: () => { leaveMyQueue(room); openRoom(room, 'seat'); } }));
  else body.append(el('button', { className: 'wide', disabled: profile.coins < SEAT.price, textContent: `Tặng ${TICKET.icon} ${TICKET.name} · ${SEAT.price} xu`, onclick: () => claimSeat(room) }));
  const empties = [...seatHouse.seats.values()].filter((x) => x.type === room.type && !x.owner && !x.queue.length).map((x) => x.id);
  body.append(el('p', { className: 'muted small', textContent: empties.length ? `Phòng trống cùng loại: ${empties.join(', ')}` : 'Không còn phòng trống cùng loại.' }));
  body.append(el('p', { className: 'muted small', textContent: `Luật: tặng vé → phòng mang tên bạn. ${SEAT.holdSec} giây đầu không ai giành được; người đến sau xếp hàng cạnh cửa và vào theo lượt. Hết ${SEAT.holdSec} giây mà không ai chờ thì bạn ở tiếp, đến khi có người tặng vé giành phòng (chỉ khi không còn phòng trống cùng loại). Chủ phòng nhận ${Math.round(SEAT.hostShare * 100)}% giá trị quà phòng nhận được.` }));
}

// ------------------------------------------------------------------ PK
function beginPk(a, b, by) {
  if (pk) return false;
  pk = startPk(a, b, Date.now(), T.pkDurationSec * 1000);
  pk.mine = {};
  pk.pred = null;
  const A = states.get(a);
  const B = states.get(b);
  hud.notify(`⚔ PK: ${A.title} vs ${B.title}`);
  addChat('Hệ thống', `⚔ PK bắt đầu: ${a} ${A.title} vs ${b} ${B.title}${by ? ` (do ${by} mở)` : ''}! Tặng quà để ủng hộ!`, 'system');
  const near = [a, b].some((id) => isNear(world.byId.get(id), 24));
  if (near) {
    hud.banner(`⚔ PK: ${A.title} vs ${B.title}`, `${T.pkDurationSec} giây — tặng quà để giành chiến thắng!`);
    audio.play('whoosh');
  }
  for (const id of [a, b]) {
    const room = world.byId.get(id);
    states.get(id).boost = 1;
    setTimeout(() => npcSay(npcs.speaker(id), `PK rồi cả nhà ơi! Ủng hộ ${states.get(id).title} nào!`, room), 600);
  }
  return true;
}

function endPk() {
  const res = pkResult(pk);
  const done = pk;
  pk = null;
  pkT = T.autoPkEverySec;
  const A = states.get(done.a);
  const B = states.get(done.b);
  const text = res.draw ? `⚔ PK hòa: ${A.title} ${done.scoreA} – ${done.scoreB} ${B.title}` : `🏆 ${states.get(res.winner).title} thắng PK! (${formatThousands(Math.max(done.scoreA, done.scoreB))} – ${formatThousands(Math.min(done.scoreA, done.scoreB))})`;
  addChat('Hệ thống', text, 'system');
  hud.notify(text);
  const near = [done.a, done.b].some((id) => isNear(world.byId.get(id), 24));
  if (near) {
    hud.banner(res.draw ? 'PK HÒA!' : `🏆 ${states.get(res.winner).title} THẮNG!`, `${A.title} ${formatThousands(done.scoreA)} – ${formatThousands(done.scoreB)} ${B.title}`);
    audio.play(res.draw ? 'bell' : 'win');
  }
  if (!res.draw) {
    const room = world.byId.get(res.winner);
    states.get(res.winner).boost = 1;
    if (isNear(room, 30)) {
      effects.confetti(room.cx, 7, -32, 320, 8);
      audio.cheer(spatial(room.cx, -30).vol);
    }
    npcSay(npcs.speaker(res.winner), 'Cảm ơn cả nhà! Tụi mình thắng rồi!!!', room);
    const loser = world.byId.get(res.loser);
    npcSay(npcs.speaker(res.loser), 'Hẹn PK lần sau nha cả nhà!', loser);
    if ((done.mine[res.winner] ?? 0) > 0) earn(15, 'Bạn góp công thắng PK:');
  }
  if (done.pred) {
    if (!res.draw && done.pred === res.winner) earn(20, 'Dự đoán PK đúng!');
    else hud.toast('Dự đoán PK chưa đúng, lần sau nhé!');
  }
}

// ------------------------------------------------------------------ player
function startGame(name, look) {
  profile.name = cleanText(name, 20) || fallbackName;
  profile.look = { ...profile.look, ...look };
  save();
  const s = world.spawn;
  player = makeActor(scene, { name: profile.name, look: profile.look, kind: 'player', x: s.x, z: s.z });
  player.isPlayer = true;
  player.ry = Math.PI;
  player.timers = { talk: 0, cheer: 0, wave: 0 };
  player.dancing = false;
  setProps(player.char, { stick: true, stickColor: 0xff4fa3 });
  cam.yaw = 0;
  cam.target.set(s.x, 1.2, s.z);
  drawAvatar(document.getElementById('avatar'), profile.look);
  hud.show();
  document.getElementById('start').classList.add('hidden');
  audio.init();
  addChat('Hệ thống', `${profile.name} đã vào tòa nhà Creator Online!`, 'system');
  hud.toast(`Chào ${profile.name}! Đi gần phòng nào sẽ nghe nhạc phòng đó. Nhấn ? để xem hướng dẫn.`);
  net.connect({ name: profile.name, look: profile.look });
}

function sitPlayer(seat) {
  seat.occupant = player;
  player.seat = seat;
  player.body.pos.x = seat.x;
  player.body.pos.z = seat.z;
  player.body.pos.y = seat.y - 0.4;
  player.body.vy = 0;
  player.ry = seat.ry;
  player.mode = 'sit';
}

function standUpPlayer() {
  const s = player.seat;
  if (!s) return;
  s.occupant = null;
  player.body.pos.x = s.approach.x;
  player.body.pos.z = s.approach.z;
  player.body.pos.y = 0;
  player.seat = null;
  player.mode = 'idle';
}

function nearestNpc(maxDist) {
  let best = null;
  let bd = maxDist;
  for (const n of npcs.all) {
    if (n.hidden || Math.abs(n.body.pos.y - player.body.pos.y) > 1) continue;
    const d = dist2d(n.body.pos, player.body.pos);
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}

/** What can the player do right now? Returns {label, act} or null. */
function findInteraction() {
  const p = player.body.pos;
  if (myHost) {
    const room = world.byId.get(myHost);
    return { label: 'Trả lời bình luận (ra khỏi phòng = nhường phòng)', act: () => mcAnswer(room) };
  }
  if (player.seat) return { label: 'Đứng dậy', act: standUpPlayer };
  if (dist2d(p, world.wheel.spot) < 2.6) {
    const left = cooldownLeft(profile.wheelAt, Date.now(), T.wheelCooldownSec);
    return { label: left > 0 ? `Vòng quay may mắn (chờ ${Math.ceil(left)}s)` : 'Quay vòng may mắn (miễn phí)', act: spinWheel };
  }
  if (dist2d(p, world.wardrobe.spot) < 2.4) return { label: 'Mở tủ đồ', act: openShop };
  if (dist2d(p, world.leaderboard.spot) < 4) return { label: 'Xem bảng xếp hạng', act: openLeaderboard };
  if (myRole) {
    const room = world.byId.get(myRole.roomId);
    switch (myRole.role) {
      case 'idol':
        return { label: player.dancing ? 'Dừng nhảy (F: bắt nhịp)' : 'Nhảy cùng nhóm', act: () => (player.dancing = !player.dancing) };
      case 'mc':
        return { label: 'Trả lời bình luận trên TV', act: () => mcAnswer(room) };
      case 'tech':
        if (dist2d(p, room.spots.tech) < 2.2) return { label: 'Mở bàn điều khiển kỹ thuật', act: () => openTech(room) };
        break;
      case 'manager':
        return { label: 'Mở bảng quản lý nhóm', act: () => openManager(room) };
      default:
        break;
    }
  }
  if (focusRoom) {
    const solo = focusRoom.type !== 'group';
    return { label: solo ? `Phòng ${focusRoom.id} · vào phòng, quà & tương tác` : `Xem phòng ${focusRoom.id} · quà & tương tác`, act: () => openRoom(focusRoom, solo ? 'seat' : 'gift') };
  }
  for (const s of world.seats) {
    if (!s.occupant && Math.hypot(s.x - p.x, s.z - p.z) < 1.5) return { label: 'Ngồi nghỉ', act: () => sitPlayer(s) };
  }
  const n = nearestNpc(1.9);
  if (n) return { label: `Bắt chuyện với ${n.baseName ?? n.name}`, act: () => talkAct(n) };
  return null;
}

function talkAct(n) {
  const room = n.room ?? null;
  let line;
  if (n.role === 'fan') line = pick(Math.random, cfg.comments.any);
  else if (room?.type === 'group') line = fill(pick(Math.random, cfg.streamerLines.group[n.role] ?? cfg.streamerLines.group.idol), { room: states.get(room.id).title });
  else line = pick(Math.random, cfg.streamerLines[states.get(room.id).genre] ?? cfg.comments.any);
  if (n.role === 'fan' && !n.path.length && !n.target) n.ry = Math.atan2(player.body.pos.x - n.body.pos.x, player.body.pos.z - n.body.pos.z);
  player.ry = Math.atan2(n.body.pos.x - player.body.pos.x, n.body.pos.z - player.body.pos.z);
  player.timers.talk = 1.5;
  npcSay(n, line, room, false);
  addChat(n.baseName ?? n.name, line, 'npc');
}

function mcAnswer(room) {
  const st = states.get(room.id);
  const c = [...st.comments].reverse().find((x) => x.kind !== 'answered' && x.kind !== 'self' && x.name !== profile.name);
  if (!c) {
    hud.toast('Chưa có bình luận mới để trả lời.');
    return;
  }
  c.kind = 'answered';
  const replies = ['cảm ơn bạn nhiều nha!', 'mình nghe rồi, chiều bạn liền!', 'chào bạn, chúc bạn buổi tối vui vẻ!', 'đúng rồi đó, cả nhà thả tim nào!', 'lát nữa có bất ngờ nha!'];
  const line = `${c.name} ơi, ${pick(Math.random, replies)}`;
  player.label.say(line);
  player.timers.talk = 2;
  addChat(profile.name, line, 'self', room.id);
  net.send({ t: 'chat', text: line, room: room.id });
  const p = spatial(room.cx, -30);
  audio.cheer(p.vol * 0.5, p.pan);
  st.hype = Math.min(1, st.hype + 0.25);
  if ((mini.mcCd ?? 0) < Date.now()) {
    mini.mcCd = Date.now() + 2500;
    earn(3, 'MC trả lời bình luận:');
  }
  st.dirty = true;
}

function rhythmHit() {
  if (!myRole || myRole.role !== 'idol' || !player.dancing) return;
  const id = myRole.roomId;
  const res = judgeBeat(audio.elapsed(id), audio.bpm(id));
  const now = performance.now();
  if (now - rhythm.last < 120) return;
  rhythm.last = now;
  hud.rhythmGrade(res.grade);
  if (res.grade === 'miss') {
    rhythm.combo = 0;
    audio.play('miss', 0.6);
    return;
  }
  rhythm.combo++;
  audio.play(res.grade, 0.7);
  const p = player.body.pos;
  effects.float(res.grade === 'perfect' ? '✨' : '⭐', p.x, p.y + 2.3, p.z, { size: 0.55, rise: 1.4, life: 1.1 });
  states.get(id).hearts += res.grade === 'perfect' ? 3 : 1;
  const c = comboReward(rhythm.combo);
  if (c) {
    earn(c, `Combo x${rhythm.combo}!`);
    const room = world.byId.get(id);
    if (Math.random() < 0.6) npcSay(npcs.speaker(id), `${profile.name} nhảy đỉnh quá cả nhà ơi!`, room);
  }
}

function updatePlayer(dt) {
  const typing = hud.isTyping() || hud.panelOpen;
  const k = input.keys;
  let fwd = 0;
  let right = 0;
  if (!typing) {
    if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) right += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) right -= 1;
    fwd += -input.joy.y;
    right += input.joy.x;
  }
  const mag = Math.min(1, Math.hypot(fwd, right));
  const pressed = input.pressed && !typing;
  const jump = input.jump && !typing;
  input.pressed = false;
  input.jump = false;
  for (const key of Object.keys(player.timers)) player.timers[key] = Math.max(0, player.timers[key] - dt);
  heartCd = Math.max(0, heartCd - dt);

  if (player.seat && (mag > 0.3 || jump)) standUpPlayer();

  let vx = 0;
  let vz = 0;
  if (!player.seat) {
    if (mag > 0.05) {
      const run = k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(input.joy.x, input.joy.y) > 0.92;
      const speed = (run ? T.runSpeed : T.walkSpeed) * mag;
      const sy = Math.sin(cam.yaw);
      const cy = Math.cos(cam.yaw);
      const dx = -sy * fwd + cy * right;
      const dz = -cy * fwd - sy * right;
      const l = Math.hypot(dx, dz) || 1;
      vx = (dx / l) * speed;
      vz = (dz / l) * speed;
      turnToward(player, Math.atan2(vx, vz), dt, 12);
    }
    if (jump && player.body.grounded) {
      player.body.vy = T.jumpVelocity;
      player.body.grounded = false;
      audio.play('jump', 0.6);
    }
    stepBody(player.body, vx, vz, dt, world.collision, T.gravity);
    if (player.body.pos.y < -3) Object.assign(player.body.pos, { x: world.spawn.x, y: 0, z: world.spawn.z });
  }
  player.speed = Math.hypot(vx, vz);

  // walking out of your solo room hands it over
  if (myHost) {
    const room = world.byId.get(myHost);
    if (distToRect(room.rect, player.body.pos.x, player.body.pos.z) > 0.6) leaveMySeat('Bạn đã ra khỏi phòng nên nhường phòng cho người khác.');
  }
  // leaving the stage room ends the role
  if (myRole) {
    const room = world.byId.get(myRole.roomId);
    if (distToRect(room.rect, player.body.pos.x, player.body.pos.z) > 0.6) clearMyRole('Bạn đã rời phòng nên thôi giữ vai trò.');
  }

  const inter = findInteraction();
  if (inter && pressed) inter.act();
  hud.prompt(inter ? inter.label : null);

  // animation state
  const roleRoom = myRole ? myRole.roomId : null;
  const beat = roleRoom ? audio.beat(roleRoom) : undefined;
  if (player.seat) player.mode = player.seat.hostMode ?? 'sit';
  else if (player.speed > 0.1) {
    player.mode = 'walk';
    if (player.dancing && myRole?.role === 'idol' && player.speed > 2) player.dancing = false;
  } else if (player.timers.cheer > 0) player.mode = 'cheer';
  else if (myRole?.role === 'idol' && player.dancing) {
    const order = states.get(roleRoom).genre === 'hiphop' ? ['dance4', 'dance1', 'dance3', 'dance2'] : ['dance1', 'dance2', 'dance4', 'dance3'];
    player.mode = order[Math.floor(beat / 16) % order.length];
  } else if (myRole?.role === 'mc') player.mode = 'mc';
  else if (myRole?.role === 'tech') player.mode = 'type';
  else if (myRole?.role === 'manager') player.mode = 'manager';
  else if (myHost) player.mode = 'present';
  else if (player.timers.wave > 0) player.mode = 'wave';
  else if (player.timers.talk > 0) player.mode = 'talk';
  else player.mode = 'idle';
  animateCharacter(player.char, dt, { mode: player.mode, speed: player.speed, airborne: !player.body.grounded && !player.seat, beat });

  // rhythm HUD
  if (myRole?.role === 'idol' && player.dancing) hud.setRhythm({ phase: ((beat % 1) + 1) % 1, combo: rhythm.combo });
  else hud.setRhythm(null);

  // network
  netT -= dt;
  if (netT <= 0 && net.online) {
    netT = 1 / T.networkSendHz;
    const p = player.body.pos;
    net.send({ t: 's', x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), r: +player.ry.toFixed(2), a: player.mode });
  }
  heartSendT -= dt;
  if (heartSendT <= 0) {
    heartSendT = 1;
    for (const [room, n] of heartBatch) net.event('heart', { room, n });
    heartBatch.clear();
  }
}

// ------------------------------------------------------------------ remote players
function addRemote(p) {
  if (remotes.has(p.id)) return;
  const s = p.state ?? { x: world.spawn.x, y: 0, z: world.spawn.z, r: 0, a: 'idle' };
  const a = makeActor(scene, { name: p.name, look: p.look, kind: 'remote', x: s.x, y: s.y, z: s.z });
  a.isRemote = true;
  a.target = { ...s };
  setProps(a.char, { stick: true, stickColor: 0x35d0ff });
  remotes.set(p.id, a);
}
function removeRemote(id) {
  const a = remotes.get(id);
  if (!a) return;
  scene.remove(a.char.root);
  a.label.dispose();
  remotes.delete(id);
}
function updateRemotes(dt) {
  const k = 1 - Math.exp(-dt * 10);
  for (const a of remotes.values()) {
    const p = a.body.pos;
    const t = a.target;
    const ox = p.x;
    const oz = p.z;
    p.x += (t.x - p.x) * k;
    p.y += (t.y - p.y) * k;
    p.z += (t.z - p.z) * k;
    a.ry += angleDelta(a.ry, t.r) * k;
    a.speed = Math.hypot(p.x - ox, p.z - oz) / Math.max(dt, 1e-3);
    a.mode = t.a;
    const beat = a.role ? audio.beat(a.role.roomId) : undefined;
    animateCharacter(a.char, dt, { mode: a.mode, speed: Math.min(a.speed, 7), airborne: false, beat });
  }
}

const net = new Net({
  onWelcome(m) {
    for (const p of m.players) addRemote(p);
    for (const [id, snap] of Object.entries(m.seats ?? {})) applySeatSnapshot(id, snap);
    // shared room state from the server
    for (const [id, r] of Object.entries(m.rooms ?? {})) {
      const room = world.byId.get(id);
      if (!room) continue;
      if (r.genre) applyGenre(room, r.genre, 'server');
      if (room.type === 'group') {
        if (r.theme) applyTheme(room, r.theme, 'server');
        if (r.idols) applyIdols(room, r.idols, 'server');
        for (const h of r.holders ?? []) applyRole(id, h.role, h.slot, { id: h.id, name: h.name });
      }
    }
    if (m.pk && !pk) {
      beginPk(m.pk.a, m.pk.b, null);
      pk.endsAt = Date.now() + Math.max(0, m.pk.endsAt - m.now);
    }
    hud.toast(`Đã kết nối server: ${m.players.length + 1} người chơi thật`, 'good');
  },
  onJoin(p) {
    addRemote(p);
    addChat('Hệ thống', `${p.name} đã vào tòa nhà!`, 'system');
    hud.notify(`${p.name} đã vào tòa nhà`);
  },
  onLeave(id) {
    const a = remotes.get(id);
    if (a) addChat('Hệ thống', `${a.name} đã rời đi.`, 'system');
    removeRemote(id);
  },
  onState(m) {
    const a = remotes.get(m.id);
    if (a) a.target = { x: m.x, y: m.y, z: m.z, r: m.r, a: m.a };
  },
  onChat(m) {
    const a = remotes.get(m.id);
    if (!a) return;
    a.label.say(m.text);
    const room = m.room ? world.byId.get(m.room) : null;
    if (room) {
      pushComment(states.get(room.id), a.name, m.text, 'remote');
      states.get(room.id).dirty = true;
    }
    addChat(a.name, m.text, 'remote', room?.id ?? '');
    const p = spatial(a.body.pos.x, a.body.pos.z, 20);
    audio.play('pop', p.vol, p.pan);
  },
  onLook(m) {
    const a = remotes.get(m.id);
    if (a) setLook(a.char, m.look);
  },
  onEvent(m) {
    const room = world.byId.get(m.room ?? m.a);
    const who = m.id === net.id ? profile.name : remotes.get(m.id)?.name ?? 'Ai đó';
    switch (m.kind) {
      case 'gift': {
        if (m.id === net.id) return; // already applied locally
        const gift = giftById.get(m.gift);
        if (room && gift) receiveGift(room, gift, m.count, who, { remote: true });
        break;
      }
      case 'heart':
        if (m.id !== net.id && room) {
          states.get(room.id).hearts += m.n;
          if (pkHas(pk, room.id)) pkAddScore(pk, room.id, m.n);
        }
        break;
      case 'genre':
        if (m.id !== net.id && room) applyGenre(room, m.genre, who);
        break;
      case 'theme':
        if (m.id !== net.id && room) applyTheme(room, m.theme, who);
        break;
      case 'idols':
        if (m.id !== net.id && room) applyIdols(room, m.n, who);
        break;
      case 'fx':
        if (m.id !== net.id && room) applyFx(room, m.fx, who);
        break;
      case 'camera':
        if (room) states.get(room.id).camIdx = m.idx;
        break;
      case 'role':
        applyRole(m.room, m.role, m.slot, { id: m.id, name: who });
        break;
      case 'unrole':
        if (m.id !== net.id) unapplyRole(m.room, m.role, m.slot);
        break;
      case 'deny':
        pendingRole = null;
        hud.toast('Vai trò này vừa có người khác nhận rồi!', 'bad');
        break;
      case 'pk':
        if (m.id !== net.id) beginPk(m.a, m.b, who);
        break;
      case 'seats':
        for (const [id, snap] of Object.entries(m.rooms ?? {})) applySeatSnapshot(id, snap);
        seatEvents(m.events ?? []);
        break;
      case 'seatres':
        if (m.id === net.id) claimResult(m.res, m.room);
        break;
      default:
        break;
    }
  },
  onStatus(status, wasOnline) {
    netStatus = status;
    if (status === 'offline' && wasOnline) {
      hud.toast('Mất kết nối server, chuyển sang chơi offline.');
      for (const id of [...remotes.keys()]) removeRemote(id);
      for (const st of states.values()) {
        for (const r of ['mc', 'tech', 'manager']) if (st.holders[r] && st.holders[r].id !== 'me' && st.holders[r].id !== net.id) st.holders[r] = null;
        for (const k of Object.keys(st.holders.idol)) if (st.holders.idol[k].id !== net.id) delete st.holders.idol[k];
        npcs.applyRoles(st.id);
      }
    }
    updateHud(true);
  },
});

function sendChat(text) {
  if (!player) return;
  const clean = cleanText(text, 120);
  if (!clean) return;
  player.label.say(clean);
  player.timers.talk = 1.5;
  const room = focusRoom;
  addChat(profile.name, clean, 'self', room?.id ?? '');
  net.send({ t: 'chat', text: clean, room: room?.id });
  audio.play('pop', 0.6);
  if (room) {
    const st = states.get(room.id);
    pushComment(st, profile.name, clean, 'self');
    st.dirty = true;
    // the host reads it on screen and answers
    if (!amHolder(room, 'mc') && Math.random() < 0.8) {
      setTimeout(() => {
        const replies = ['cảm ơn bạn đã bình luận nha!', 'mình đọc được rồi nè!', 'chào bạn, ở lại chơi với mình nha!', 'câu hỏi hay quá!', 'thả tim cho mình nha!'];
        npcSay(npcs.speaker(room.id), `${profile.name} ơi, ${pick(Math.random, replies)}`, room);
        const c = st.comments.find((x) => x.kind === 'self' && x.text === clean);
        if (c) c.kind = 'answered';
        st.dirty = true;
      }, 1200 + Math.random() * 1400);
    }
  }
}

// ------------------------------------------------------------------ panels
function onButton(name) {
  audio.init();
  switch (name) {
    case 'fullscreen':
      if (document.fullscreenElement) document.exitFullscreen?.();
      else document.documentElement.requestFullscreen?.().catch(() => {});
      break;
    case 'chat':
      hud.toggleChat();
      break;
    case 'music':
      audio.setMusic(!audio.musicOn);
      hud.setToggle('music', audio.musicOn);
      break;
    case 'sound':
      audio.setSfx(!audio.sfxOn);
      hud.setButtonIcon('sound', audio.sfxOn ? 'volume' : 'mute');
      break;
    case 'camera':
      cam.wide = !cam.wide;
      hud.toast(cam.wide ? 'Camera: toàn cảnh' : 'Camera: theo nhân vật');
      break;
    case 'help':
      openHelp();
      break;
    case 'friends':
      openFriends();
      break;
    case 'notif':
      openNotifications();
      break;
    case 'shop':
    case 'coins':
      openShop();
      break;
    case 'rooms':
      openRoomList();
      break;
    case 'rb-gift':
      if (focusRoom) openRoom(focusRoom, 'gift');
      break;
    case 'rb-heart':
      if (focusRoom) for (let i = 0; i < 3; i++) setTimeout(() => sendHeart(focusRoom), i * 130);
      break;
    case 'rb-role':
      if (focusRoom) openRoom(focusRoom, 'role');
      break;
    case 'rb-genre':
      if (focusRoom) openRoom(focusRoom, 'genre');
      break;
    case 'rb-game':
      if (focusRoom) openRoom(focusRoom, 'game');
      break;
    case 'rb-seat':
      if (focusRoom && focusRoom.type !== 'group') openRoom(focusRoom, 'seat');
      break;
    default:
      break;
  }
}

function openHelp() {
  hud.openPanel('Hướng dẫn', (body) => {
    const items = [
      ['WASD / mũi tên', 'đi lại • Shift chạy • Space nhảy'],
      ['E', 'tương tác: xem phòng, nhận vai, ngồi, quay thưởng, bắt chuyện'],
      ['H', 'thả tim cho phòng đang xem (miễn phí)'],
      ['G', 'mở bảng tặng quà của phòng'],
      ['R', 'vai trò (phòng nhóm) • T: thể loại • M: mini game'],
      ['F', 'bắt nhịp khi đang làm Idol nhảy'],
      ['Enter', 'chat — khi đứng ở phòng nào, chat thành bình luận trên màn hình phòng đó'],
      ['Kéo chuột / lăn chuột', 'xoay và thu phóng camera (kéo xa = nhìn từ trên cao)'],
    ];
    const ul = el('ul', { className: 'help-list' });
    for (const [k, v] of items) ul.append(el('li', {}, el('kbd', { textContent: k }), ` ${v}`));
    body.append(ul);
    body.append(el('h3', { textContent: '4 kiểu phòng LIVE' }));
    const ul2 = el('ul', { className: 'help-list' });
    for (const t of Object.values(cfg.roomTypes)) ul2.append(el('li', {}, el('b', { textContent: `${t.icon} ${t.label}: ` }), t.desc));
    body.append(ul2);
    body.append(el('p', { className: 'muted', textContent: 'Phía Bắc: 5 sân khấu nhóm G1–G5. Giữa: 5 phòng ngồi hát S1–S5 (mặt Bắc) và 5 phòng game P1–P5 (mặt Nam). Phía Nam: 10 phòng đứng N01–N10. Sảnh Tây: vòng quay may mắn + tủ đồ. Sảnh Đông: bảng xếp hạng.' }));
    body.append(el('p', { className: 'muted', textContent: 'Tặng quà để nhận vai MC / Kỹ thuật / Quản lý / Idol, đổi thể loại phòng, đẩy phòng lên top và thắng PK. Mỗi 30 giây xem live bạn được +3 xu.' }));
  });
}

function openFriends() {
  hud.openPanel(`Trong tòa nhà (${onlineCount()})`, (body) => {
    const row = (name, chip, chipCls, extra) =>
      el('div', { className: 'list-row' }, el('span', { className: 'grow', textContent: name }), extra ? el('span', { className: 'muted', textContent: extra }) : null, el('span', { className: `tagchip ${chipCls}`, textContent: chip }));
    if (player) body.append(row(profile.name, 'Bạn', 'you', myRole ? `${cfg.roles[myRole.role].label} @ ${myRole.roomId}` : fanRank()));
    for (const r of remotes.values()) body.append(row(r.name, 'Người chơi', 'real', r.role ? `${cfg.roles[r.role.role].label} @ ${r.role.roomId}` : ''));
    body.append(el('p', { className: 'muted', textContent: `${npcs.streamers.filter((a) => !a.hidden).length} creator NPC đang live • ${npcs.fans.length} fan NPC đi xem` }));
  });
}

function openNotifications() {
  hud.clearUnread();
  hud.openPanel('Thông báo', (body) => {
    if (!hud.notifications.length) body.append(el('p', { className: 'muted', textContent: 'Chưa có thông báo nào.' }));
    for (const n of hud.notifications) body.append(el('div', { className: 'list-row' }, el('span', { className: 'grow', textContent: n.text }), el('span', { className: 'muted', textContent: n.at.toLocaleTimeString('vi-VN') })));
  });
}

function openRoomList() {
  hud.openPanel('Danh sách 25 phòng LIVE', (body) => {
    for (const type of ['group', 'stand', 'sing', 'game']) {
      body.append(el('h3', { textContent: `${cfg.roomTypes[type].icon} ${cfg.roomTypes[type].label}` }));
      for (const room of world.rooms.filter((r) => r.type === type)) {
        const st = states.get(room.id);
        body.append(el('div', { className: 'list-row' },
          el('b', { textContent: room.id, style: { color: accentOf(room), minWidth: '42px' } }),
          el('span', { className: 'grow', textContent: `${st.title} · ${genreLabel(st.genre)}` }),
          el('span', { className: 'muted', textContent: `👁 ${formatThousands(st.viewers)} · 💰 ${formatThousands(st.giftTotal)}` }),
          pkHas(pk, room.id) ? el('span', { className: 'tagchip real', textContent: 'PK' }) : null));
      }
    }
  });
}

function openLeaderboard() {
  hud.openPanel('🏆 Bảng xếp hạng', (body) => {
    const list = [...states.values()].sort((a, b) => b.giftTotal - a.giftTotal).slice(0, 10);
    list.forEach((s, i) => body.append(el('div', { className: 'list-row' }, el('b', { textContent: `${i + 1}.` }), el('span', { className: 'grow', textContent: `${s.id} · ${s.title}` }), el('span', { className: 'muted', textContent: `${formatThousands(s.giftTotal)} xu · ❤ ${formatThousands(s.hearts)}` }))));
    body.append(el('h3', { textContent: 'Bạn' }));
    body.append(el('p', { className: 'muted', textContent: `${fanRank()} · đã tặng ${formatThousands(profile.gifted)} xu · thả ${formatThousands(profile.hearts)} tim · kiếm được ${formatThousands(profile.earned)} xu` }));
  });
}

/** The main room panel with tabs. */
function openRoom(room, tab = 'gift') {
  const st = states.get(room.id);
  const tabs = [...(room.type === 'group' ? [] : [['seat', '🎟️ Vào phòng']]), ['gift', '🎁 Quà'], ['genre', '🎵 Thể loại'], ...(room.type === 'group' ? [['role', '⭐ Vai trò']] : []), ['game', '🎮 Mini game'], ['info', 'ℹ️ Phòng']];
  if (!tabs.some(([k]) => k === tab)) tab = 'gift';
  hud.openPanel(`${cfg.roomTypes[room.type].icon} ${room.id} · ${st.title}`, (body) => {
    const bar = el('div', { className: 'tabs' });
    for (const [k, label] of tabs) bar.append(el('button', { className: k === tab ? 'on' : '', textContent: label, onclick: () => openRoom(room, k) }));
    body.append(bar);
    body.append(el('p', { className: 'muted small', textContent: `${genreLabel(st.genre)} · 👁 ${formatThousands(st.viewers)} · ❤ ${formatThousands(st.hearts)} · 💰 ${formatThousands(st.giftTotal)} xu · Bạn có ${formatThousands(profile.coins)} xu` }));
    ({ seat: tabSeat, gift: tabGift, genre: tabGenre, role: tabRole, game: tabGame, info: tabInfo })[tab](body, room, st);
  }, `room:${room.id}:${tab}`);
}

function tabGift(body, room) {
  const qty = mini.qty ?? 1;
  const qbar = el('div', { className: 'tabs small' });
  for (const q of [1, 10, 99]) qbar.append(el('button', { className: q === qty ? 'on' : '', textContent: `x${q}`, onclick: () => { mini.qty = q; openRoom(room, 'gift'); } }));
  body.append(qbar);
  const grid = el('div', { className: 'gift-grid' });
  for (const g of cfg.gifts) {
    const cost = g.price * qty;
    grid.append(el('button', { className: 'gift', disabled: profile.coins < cost, onclick: () => { sendGift(room, g, qty); openRoom(room, 'gift'); } },
      el('span', { className: 'gi', textContent: g.icon }), el('span', { className: 'gn', textContent: g.name }), el('span', { className: 'gp', textContent: `${formatThousands(cost)} xu` })));
  }
  body.append(grid);
  body.append(el('p', { className: 'muted small', textContent: 'Quà từ 199 xu trở lên bật pháo giấy và thông báo lớn. Quà cộng điểm PK nếu phòng đang PK. Nhấn H để thả tim miễn phí.' }));
}

function tabGenre(body, room, st) {
  const isMgr = amHolder(room, 'manager');
  const price = isMgr ? 0 : room.type === 'group' ? cfg.prices.genreGroup : cfg.prices.genreSolo;
  body.append(el('p', { className: 'muted small', textContent: isMgr ? 'Bạn là Quản lý: đổi thể loại miễn phí.' : `Tặng quà ${price} xu để chọn thể loại cho phòng. Nhạc nền, màn hình và lời nói của streamer đổi theo.` }));
  const list = el('div', { className: 'genre-list' });
  for (const [key, g] of genresFor(room.type)) {
    const on = st.genre === key;
    list.append(el('div', { className: `genre ${on ? 'on' : ''}` },
      el('div', { className: 'grow' }, el('b', { textContent: g.label }), el('div', { className: 'muted small', textContent: g.mo_ta })),
      el('button', { textContent: on ? 'Đang phát' : price ? `${price} xu` : 'Chọn', disabled: on || profile.coins < price, onclick: () => {
        if (price && !spend(profile, price)) return;
        if (price) payRoom(st, price, '🎵', `Thể loại ${g.label}`);
        save();
        applyGenre(room, key, profile.name);
        net.event('genre', { room: room.id, genre: key });
        audio.play('buy');
        openRoom(room, 'genre');
      } })));
  }
  body.append(list);
  if (room.type !== 'group') {
    const req = { stand: 'Yêu cầu chủ đề', sing: 'Yêu cầu bài hát', game: 'Thách đấu streamer' }[room.type];
    body.append(el('button', { className: 'wide', textContent: `${req} (${cfg.prices.request} xu)`, disabled: profile.coins < cfg.prices.request, onclick: () => {
      if (!spend(profile, cfg.prices.request)) return;
      payRoom(st, cfg.prices.request, '📝', req);
      save();
      const sp = npcs.speaker(room.id);
      if (room.type === 'sing') {
        st.song = `Bài ${profile.name} yêu cầu`;
        audio.setChannel(room.id, genreSrc(st.genre));
        npcSay(sp, `Bài tiếp theo tặng ${profile.name} nha!`, room);
      } else if (room.type === 'stand') npcSay(sp, `${profile.name} muốn nghe chuyện gì? Mình kể liền!`, room);
      else {
        st.match = newMatch(st.match.no);
        npcSay(sp, `${profile.name} thách đấu hả? Vào trận mới luôn!`, room);
      }
      audio.play('buy');
      hud.closePanel();
    } }));
  }
}

function tabRole(body, room, st) {
  body.append(el('p', { className: 'muted small', textContent: `Nhóm có ${memberCount(st)} thành viên (5–9): ${st.idols} idol + MC + Kỹ thuật + Quản lý. Tặng quà để nhận vai. Ra khỏi phòng sẽ tự rời vai.` }));
  const wrap = el('div', { className: 'role-grid' });
  const m = npcs.byRoom.get(room.id).members;
  for (const [key, r] of Object.entries(cfg.roles)) {
    let holder;
    if (key === 'idol') {
      const players = Object.values(st.holders.idol).map((h) => h.name);
      holder = players.length ? `Người chơi: ${players.join(', ')}` : `${st.idols} idol NPC`;
    } else holder = st.holders[key] ? `Người chơi: ${st.holders[key].name}` : `NPC: ${m[key].baseName}`;
    const mine = amHolder(room, key);
    wrap.append(el('div', { className: `role ${mine ? 'on' : ''}` },
      el('div', { className: 'ri', textContent: r.icon }),
      el('b', { textContent: r.label }),
      el('div', { className: 'muted small', textContent: holder }),
      el('div', { className: 'small', textContent: r.desc }),
      mine
        ? el('button', { textContent: 'Rời vai', onclick: () => { clearMyRole('Bạn đã rời vai.'); openRoom(room, 'role'); } })
        : el('button', { textContent: `Tặng ${r.gift} · ${r.price} xu`, disabled: profile.coins < r.price, onclick: () => claimRole(room, key) })));
  }
  body.append(wrap);
  if (amHolder(room, 'mc')) {
    body.append(el('div', { className: 'row-btns' },
      el('button', { textContent: '📣 Kêu gọi thả tim', onclick: () => mcHype(room) }),
      el('button', { textContent: '🎤 Giới thiệu tiết mục', onclick: () => mcIntro(room) }),
      el('button', { textContent: '💬 Trả lời bình luận (E)', onclick: () => mcAnswer(room) })));
  }
}

function mcHype(room) {
  const st = states.get(room.id);
  if ((st.hypeCd ?? 0) > Date.now()) return hud.toast('Chờ một chút rồi kêu gọi tiếp nhé!');
  st.hypeCd = Date.now() + 25000;
  st.hype = 1;
  const line = 'Cả nhà ơi thả tim, tặng quà cho nhóm mình nào!!!';
  player.label.say(line);
  addChat(profile.name, line, 'self', room.id);
  net.send({ t: 'chat', text: line, room: room.id });
  audio.cheer(0.8);
  hud.toast('Khán giả NPC tặng quà nhiều hơn trong 20 giây!', 'good');
}

function mcIntro(room) {
  const st = states.get(room.id);
  const line = `Tiếp theo là tiết mục ${genreLabel(st.genre)} của nhóm ${st.title}!`;
  player.label.say(line);
  addChat(profile.name, line, 'self', room.id);
  net.send({ t: 'chat', text: line, room: room.id });
  hud.banner(`🎤 ${st.title}`, genreLabel(st.genre));
  st.boost = 1;
  audio.cheer(0.9);
}

function tabGame(body, room, st) {
  if (room.type === 'group') {
    if (pk && pkHas(pk, room.id)) {
      const A = states.get(pk.a);
      const B = states.get(pk.b);
      body.append(el('h3', { textContent: `⚔ Đang PK: ${A.title} vs ${B.title}` }));
      body.append(el('p', { className: 'muted', textContent: pk.pred ? `Bạn đoán: ${states.get(pk.pred).title}` : 'Đoán đội thắng (miễn phí, đúng +20 xu):' }));
      if (!pk.pred) {
        body.append(el('div', { className: 'row-btns' },
          el('button', { textContent: A.title, onclick: () => { pk.pred = pk.a; openRoom(room, 'game'); } }),
          el('button', { textContent: B.title, onclick: () => { pk.pred = pk.b; openRoom(room, 'game'); } })));
      }
    } else {
      body.append(el('h3', { textContent: '⚔ PK đấu nhóm' }));
      body.append(el('p', { className: 'muted', textContent: pk ? `Đang có PK giữa ${pk.a} và ${pk.b}. Chờ trận sau nhé!` : 'Chưa có PK. Quản lý của nhóm có thể mở PK với nhóm khác, hoặc chờ PK tự động.' }));
    }
    body.append(el('h3', { textContent: '💃 Bắt nhịp' }));
    body.append(el('p', { className: 'muted', textContent: 'Nhận vai Idol, nhấn E để nhảy rồi nhấn F đúng lúc vòng nhịp thu nhỏ. Mỗi 8 nhịp liên tiếp được thưởng xu.' }));
    body.append(el('h3', { textContent: '❤ Thả tim combo' }));
    body.append(el('p', { className: 'muted', textContent: 'Nhấn giữ H: mỗi 100 tim bạn được streamer gọi tên và +5 xu.' }));
    return;
  }
  if (room.type === 'sing') return gameGuess(body, room, st);
  if (room.type === 'stand') return gameQuiz(body, room, st);
  return gamePredict(body, room, st);
}

function gameGuess(body, room, st) {
  body.append(el('h3', { textContent: '🎵 Đoán bài hát' }));
  body.append(el('p', { className: 'muted', textContent: 'Streamer ngân nga vài nốt — đoán đúng tên bài được +15 xu.' }));
  const g = mini.guess && mini.guess.room === room.id ? mini.guess : null;
  if (!g) {
    body.append(el('button', { className: 'wide', textContent: '▶ Nghe giai điệu', onclick: () => {
      const song = pick(Math.random, cfg.songGuess);
      const others = shuffled(Math.random, cfg.songGuess.filter((s) => s !== song)).slice(0, 3);
      mini.guess = { room: room.id, song, options: shuffled(Math.random, [song, ...others]) };
      audio.melody(song.notes, 112, 0.9);
      npcSay(npcs.speaker(room.id), '🎵 Hmm hmm hmm... bài gì đây cả nhà?', room);
      openRoom(room, 'game');
    } }));
    return;
  }
  body.append(el('button', { className: 'wide ghost', textContent: '🔁 Nghe lại', onclick: () => audio.melody(g.song.notes, 112, 0.9) }));
  const opts = el('div', { className: 'opt-list' });
  for (const o of g.options) {
    opts.append(el('button', { textContent: o.name, onclick: () => {
      mini.guess = null;
      if (o === g.song) {
        earn(15, 'Đoán đúng bài!');
        npcSay(npcs.speaker(room.id), `Chính xác! Là bài "${g.song.name}" đó ${profile.name}!`, room);
      } else {
        audio.play('miss');
        hud.toast(`Chưa đúng! Đáp án: ${g.song.name}`);
      }
      openRoom(room, 'game');
    } }));
  }
  body.append(opts);
}

function gameQuiz(body, room) {
  body.append(el('h3', { textContent: '❓ Hỏi nhanh đáp gọn' }));
  body.append(el('p', { className: 'muted', textContent: 'Streamer hỏi — trả lời đúng +10 xu.' }));
  let q = mini.quiz && mini.quiz.room === room.id ? mini.quiz : null;
  if (!q) {
    q = mini.quiz = { room: room.id, item: pick(Math.random, cfg.quiz) };
    npcSay(npcs.speaker(room.id), `Câu hỏi: ${q.item.q}`, room);
  }
  body.append(el('p', { className: 'quiz-q', textContent: q.item.q }));
  const opts = el('div', { className: 'opt-list' });
  q.item.a.forEach((a, i) => opts.append(el('button', { textContent: a, onclick: () => {
    mini.quiz = null;
    if (i === q.item.ok) {
      earn(10, 'Trả lời đúng!');
      npcSay(npcs.speaker(room.id), `${profile.name} trả lời đúng rồi! Giỏi quá!`, room);
    } else {
      audio.play('miss');
      hud.toast(`Sai rồi! Đáp án: ${q.item.a[q.item.ok]}`);
    }
    openRoom(room, 'game');
  } })));
  body.append(opts);
}

function gamePredict(body, room, st) {
  const m = st.match;
  body.append(el('h3', { textContent: `🎮 Dự đoán trận #${m.no}` }));
  if (m.result) {
    body.append(el('p', { className: 'muted', textContent: m.result === 'win' ? 'Streamer vừa TOP 1! Trận mới sắp bắt đầu.' : 'Streamer bị loại. Trận mới sắp bắt đầu.' }));
    return;
  }
  body.append(el('p', { className: 'muted', textContent: `Còn ${m.alive} người. Đoán trước khi còn 15 người — đúng +25 xu (miễn phí).` }));
  if (m.pred) body.append(el('p', { textContent: `Bạn đoán: ${m.pred === 'win' ? 'TOP 1 🏆' : 'Bị loại 💀'}` }));
  else if (m.alive > 15) {
    body.append(el('div', { className: 'row-btns' },
      el('button', { textContent: '🏆 Streamer TOP 1', onclick: () => { m.pred = 'win'; openRoom(room, 'game'); } }),
      el('button', { textContent: '💀 Không TOP 1', onclick: () => { m.pred = 'lose'; openRoom(room, 'game'); } })));
  } else body.append(el('p', { className: 'muted', textContent: 'Đã khóa dự đoán cho trận này.' }));
}

function tabInfo(body, room, st) {
  body.append(el('p', { textContent: cfg.roomTypes[room.type].desc }));
  body.append(el('p', { className: 'muted', textContent: `Streamer: ${st.streamer} · Thể loại: ${genreLabel(st.genre)}` }));
  body.append(el('p', { className: 'muted small', textContent: `Nhạc nền: ${GENRES[st.genre].mo_ta}` }));
  body.append(el('p', { className: 'muted small', textContent: `File nhạc có thể thay: assets/${GENRES[st.genre].file}` }));
  body.append(el('h3', { textContent: 'Top fan' }));
  const fans = topFans(st, 5);
  if (!fans.length) body.append(el('p', { className: 'muted', textContent: 'Chưa có ai tặng quà.' }));
  fans.forEach((f, i) => body.append(el('div', { className: 'list-row' }, el('b', { textContent: `${i + 1}.` }), el('span', { className: 'grow', textContent: f.name }), el('span', { className: 'muted', textContent: `${formatThousands(f.value)} xu` }))));
}

function openTech(room) {
  const st = states.get(room.id);
  hud.openPanel(`🎛️ Kỹ thuật · ${st.title}`, (body) => {
    body.append(el('h3', { textContent: 'Màu đèn sân khấu' }));
    const t = el('div', { className: 'row-btns' });
    for (const [k, th] of Object.entries(cfg.lightThemes)) {
      const b = el('button', { className: st.theme === k ? 'on' : '', textContent: th.label, onclick: () => { applyTheme(room, k, profile.name); net.event('theme', { room: room.id, theme: k }); openTech(room); } });
      b.style.borderBottom = `4px solid ${th.colors[0]}`;
      t.append(b);
    }
    body.append(t);
    body.append(el('h3', { textContent: 'Hiệu ứng' }));
    const fx = el('div', { className: 'row-btns' });
    for (const [k, label] of [['confetti', '🎉 Pháo giấy'], ['smoke', '☁️ Khói'], ['laser', '⚡ Laser'], ['flash', '💡 Chớp đèn']]) {
      fx.append(el('button', { textContent: label, onclick: () => {
        if ((mini.fxCd ?? 0) > Date.now()) return hud.toast('Thiết bị đang hồi, chờ chút nhé!');
        mini.fxCd = Date.now() + 3000;
        applyFx(room, k, profile.name);
        net.event('fx', { room: room.id, fx: k });
        if ((mini.techPay ?? 0) < Date.now()) {
          mini.techPay = Date.now() + 8000;
          earn(2, 'Kỹ thuật lên hiệu ứng:');
        }
      } }));
    }
    body.append(fx);
    body.append(el('h3', { textContent: 'Góc máy TV trực tiếp' }));
    const cams = el('div', { className: 'row-btns' });
    ['Toàn cảnh', 'Cận sân khấu', 'Từ trên cao'].forEach((label, i) => cams.append(el('button', { className: st.camIdx === i ? 'on' : '', textContent: label, onclick: () => { st.camIdx = i; st.camT = -20; net.event('camera', { room: room.id, idx: i }); openTech(room); } })));
    body.append(cams);
    body.append(el('h3', { textContent: 'Nhạc' }));
    body.append(el('button', { className: 'wide', textContent: '⏭ Phát lại / đổi đoạn nhạc', onclick: () => { audio.setChannel(room.id, genreSrc(st.genre)); hud.toast('Đã chuyển đoạn nhạc'); } }));
  }, 'tech');
}

function openManager(room) {
  const st = states.get(room.id);
  hud.openPanel(`📋 Quản lý · ${st.title}`, (body) => {
    body.append(el('p', { className: 'muted', textContent: `Doanh thu quà: ${formatThousands(st.giftTotal)} xu · ❤ ${formatThousands(st.hearts)} · 👁 ${formatThousands(st.viewers)}` }));
    body.append(el('h3', { textContent: `Thành viên: ${memberCount(st)} người (5–9)` }));
    body.append(el('div', { className: 'row-btns' },
      el('button', { textContent: '➖ Bớt idol', disabled: st.idols <= MIN_IDOLS, onclick: () => { applyIdols(room, st.idols - 1, profile.name); net.event('idols', { room: room.id, n: st.idols }); openManager(room); } }),
      el('span', { className: 'pill-num', textContent: `${st.idols} idol` }),
      el('button', { textContent: '➕ Thêm idol', disabled: st.idols >= MAX_IDOLS, onclick: () => { applyIdols(room, st.idols + 1, profile.name); net.event('idols', { room: room.id, n: st.idols }); openManager(room); } })));
    body.append(el('h3', { textContent: 'Trang phục idol' }));
    const outfits = el('div', { className: 'row-btns' });
    for (const [k, label] of [...(room.def.outfits ?? []).map((o) => [o, 'Đồng phục nhóm']), ['idolPink', 'Hồng'], ['idolWhite', 'Trắng'], ['idolBlack', 'Đen ánh kim'], ['idolRed', 'Đỏ'], ['idolMint', 'Xanh mint'], ['boyOrange', 'Nam cam'], ['boyWhite', 'Nam trắng']]) {
      const b = el('button', { textContent: label, onclick: () => npcs.restyleIdols(room.id, k) });
      b.style.borderBottom = `4px solid #${OUTFITS[k].top.toString(16).padStart(6, '0')}`;
      outfits.append(b);
    }
    body.append(outfits);
    body.append(el('h3', { textContent: 'Thể loại (miễn phí cho Quản lý)' }));
    body.append(el('button', { className: 'wide', textContent: '🎵 Chọn thể loại', onclick: () => openRoom(room, 'genre') }));
    body.append(el('h3', { textContent: '⚔ Mở PK với nhóm khác' }));
    if (pk) body.append(el('p', { className: 'muted', textContent: `Đang có PK ${pk.a} vs ${pk.b}.` }));
    else {
      const list = el('div', { className: 'row-btns' });
      for (const other of world.rooms.filter((r) => r.type === 'group' && r !== room)) {
        list.append(el('button', { textContent: `${other.id} ${states.get(other.id).title}`, onclick: () => {
          if (beginPk(room.id, other.id, profile.name)) net.event('pk', { a: room.id, b: other.id });
          hud.closePanel();
        } }));
      }
      body.append(list);
    }
  }, 'manager');
}

const SLOT_NAMES = { hat: 'Mũ', hair: 'Tóc', outfit: 'Trang phục' };
function swatchColor(item) {
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  if (item.slot === 'hair') return hex(HAIR_COLORS[item.value] ?? 0);
  if (item.slot === 'hat') return item.value === 'none' ? 'transparent' : hex(HAT_COLORS[item.value] ?? 0xe5483d);
  const o = OUTFITS[item.value];
  return `linear-gradient(180deg, ${hex(o.top)} 0 60%, ${hex(o.legs)} 60% 100%)`;
}
function openShop() {
  hud.openPanel(`👗 Tủ đồ • ${formatThousands(profile.coins)} xu`, (body) => {
    const grid = el('div', { className: 'shop-grid' });
    for (const item of cfg.shop) {
      const owned = profile.owned.includes(item.id) || item.price === 0;
      const equipped = profile.look[item.slot] === item.value;
      const btn = el('button', {
        textContent: equipped ? 'Đang dùng' : owned ? 'Dùng' : `Mua ${formatThousands(item.price)} xu`,
        disabled: equipped || (!owned && profile.coins < item.price),
        onclick: () => {
          if (!owned) {
            if (!spend(profile, item.price)) return;
            profile.owned.push(item.id);
            audio.play('buy');
            hud.toast(`Đã mua ${item.name}!`, 'gold');
          }
          profile.look[item.slot] = item.value;
          save();
          if (player) {
            setLook(player.char, profile.look);
            net.send({ t: 'look', look: profile.look });
          }
          drawAvatar(document.getElementById('avatar'), profile.look);
          updateHud(true);
          openShop();
        },
      });
      const sw = el('div', { className: 'swatch' });
      sw.style.background = swatchColor(item);
      if (item.value === 'none') sw.style.border = '2px dashed rgba(255,255,255,.3)';
      grid.append(el('div', { className: `shop-item ${equipped ? 'equipped' : ''}` }, sw, el('div', { className: 'name', textContent: item.name }), el('div', { className: 'slot', textContent: SLOT_NAMES[item.slot] }), btn));
    }
    body.append(grid);
  });
}

function spinWheel() {
  const w = world.wheel;
  if (w.spinning) return;
  const left = cooldownLeft(profile.wheelAt, Date.now(), T.wheelCooldownSec);
  if (left > 0) {
    hud.toast(`Vòng quay hồi sau ${Math.ceil(left)} giây.`);
    return;
  }
  profile.wheelAt = Date.now();
  save();
  const prize = pickWeighted(Math.random, cfg.wheel);
  const i = cfg.wheel.indexOf(prize);
  const n = cfg.wheel.length;
  const target = ((i + 0.5) / n) * Math.PI * 2;
  const cur = ((w.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const delta = (((target - cur) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const to = w.angle + Math.PI * 2 * 5 + delta;
  let lastSeg = -1;
  w.spinning = {
    from: w.angle, to, t: 0, dur: 4.2,
    done: () => {
      if (prize.item) {
        if (!profile.owned.includes(prize.item)) profile.owned.push(prize.item);
        save();
        hud.banner('👑 Trúng Vương miện!', 'Vào tủ đồ để đội nhé');
        audio.play('win');
      } else {
        earn(prize.coins, 'Vòng quay may mắn:');
        hud.banner(`🎡 +${prize.coins} xu`, 'Quay lại sau 2 phút');
      }
      effects.confetti(HALL.minX + 1.5, 4, 0, 140, 3);
    },
  };
  w.tick = () => {
    const seg = Math.floor((((w.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / ((Math.PI * 2) / n));
    if (seg !== lastSeg) {
      lastSeg = seg;
      audio.play('tick', 0.5);
    }
  };
  audio.play('whoosh', 0.5);
}

// ------------------------------------------------------------------ HUD + screens
function updateHud(force = false) {
  if (!player && !force) return;
  const now = new Date();
  const room = focusRoom;
  const st = room ? states.get(room.id) : null;
  let hint = 'Đi gần một phòng để nghe nhạc phòng đó. E: xem phòng & tặng quà.';
  if (myRole) {
    hint = {
      idol: 'Idol: E bật/tắt nhảy, F bắt nhịp để ăn combo.',
      mc: 'MC: E trả lời bình luận trên TV. R: kêu gọi thả tim, giới thiệu tiết mục.',
      tech: 'Kỹ thuật: đứng ở bàn mixer, E để đổi đèn, khói, pháo giấy, góc máy.',
      manager: 'Quản lý: E để thêm/bớt thành viên, đổi thể loại, mở PK.',
    }[myRole.role];
  } else if (myHost) hint = 'Chủ phòng: E trả lời bình luận, nhận 20% quà phòng. Đi ra ngoài là nhường phòng.';
  else if (room) hint = `H thả tim • G tặng quà • ${room.type === 'group' ? 'R nhận vai • ' : 'V vào phòng • '}M mini game • Enter bình luận`;
  hud.setInfo({
    time: now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    where: room ? `${room.id} · ${st.title}` : 'Sảnh chính',
    rank: `${fanRank()} · đã tặng ${formatThousands(profile.gifted)} xu`,
    role: myRole ? `${cfg.roles[myRole.role].icon} ${cfg.roles[myRole.role].label} @ ${myRole.roomId}` : myHost ? `👑 Chủ phòng ${myHost}` : myQueue ? `⏳ Chờ lượt #${myQueue.position} ở ${myQueue.roomId}` : 'Khán giả',
    hearts: formatThousands(profile.hearts),
    coins: formatThousands(profile.coins),
    online: String(onlineCount()),
    hint,
    net: netStatus === 'online' ? 'LAN' : 'Offline',
  });
  document.getElementById('net-status').classList.toggle('on', netStatus === 'online');
  hud.setRoomBar(room ? { title: `${cfg.roomTypes[room.type].icon} ${room.id} · ${st.title}`, sub: `${genreLabel(st.genre)} · 👁 ${formatThousands(st.viewers)} · ❤ ${formatThousands(st.hearts)}${room.type === 'group' ? ` · ${memberCount(st)} thành viên` : ''}`, accent: accentOf(room), group: room.type === 'group' } : null);
  if (pk && player && [pk.a, pk.b].some((id) => isNear(world.byId.get(id), 30))) {
    hud.setPk({ leftName: states.get(pk.a).title, rightName: states.get(pk.b).title, scoreA: formatThousands(pk.scoreA), scoreB: formatThousands(pk.scoreB), share: pkShare(pk), left: Math.ceil(pkRemaining(pk, Date.now()) / 1000) });
  } else hud.setPk(null);
}

const roomsByTitle = new Map();
function drawRoomScreens(room, t, force = false) {
  const st = states.get(room.id);
  const scr = room.screens;
  const genre = genreLabel(st.genre);
  const accent = accentOf(room);
  const beat = audio.beat(room.id);
  const d = playerDist(room);
  const near = !player || d < 28;
  if (room.type !== 'group') st.seatLine = seatLine(room);
  if (force || st.signT === undefined || t - st.signT > (d < 20 ? 1 : 3) || st.dirty) {
    st.signT = t;
    S.drawSign(scr.sign, room, st, genre, accent);
  }
  if (!near && !force) return;
  if (room.type === 'group') {
    const cols = (cfg.lightThemes[st.theme] ?? cfg.lightThemes.neon).colors;
    const pkView = pkHas(pk, room.id) ? { ...pk, left: pkRemaining(pk, Date.now()) } : null;
    roomsByTitle.clear();
    if (pkView) for (const id of [pk.a, pk.b]) roomsByTitle.set(id, states.get(id));
    S.drawLed(scr.led, room, st, genre, cols, beat, t, pkView, roomsByTitle);
    if (st.dirty || force || frameNo % 3 === 0) S.drawBoard(scr.board, st, accent);
    if (liveRoom !== room) S.drawTvFallback(scr.tv, st, accent, t);
    if (d < 18) S.drawMixer(scr.mixer, t, accent);
  } else if (room.type === 'stand') {
    if (force || !st.washDrawn) {
      st.washDrawn = true;
      S.drawWash(scr.wash, room.washColor, st.streamer);
    }
    S.drawMonitor(scr.monitor, room, st, genre, t);
  } else if (room.type === 'sing') {
    S.drawLyrics(scr.lyrics, st, genre, beat, t, 300 + room.index * 12);
    S.drawMonitor(scr.monitor, room, st, genre, t);
  } else {
    S.drawGame(scr.game, st, genre, t);
  }
  st.dirty = false;
}

// ------------------------------------------------------------------ simulation of the live rooms
function simulateRooms(dt) {
  for (const room of world.rooms) {
    const st = states.get(room.id);
    const inPk = pkHas(pk, room.id);
    st.boost = Math.max(0, st.boost - dt * 0.6);
    st.hype = Math.max(0, st.hype - dt / 20);
    // viewers drift + fans watching
    st.viewT = (st.viewT ?? 0) - dt;
    if (st.viewT <= 0) {
      st.viewT = 3;
      st.baseViewers = Math.max(10, Math.round(st.baseViewers * range(Math.random, 0.97, 1.035) + (inPk ? 15 : 0)));
      st.viewers = st.baseViewers + npcs.watchers(room.id) * 3 + (focusRoom === room ? 1 : 0);
      st.hearts += Math.floor(Math.random() * (room.type === 'group' ? 30 : 8));
    }
    // comments
    st.commentT -= dt;
    if (st.commentT <= 0) {
      st.commentT = range(Math.random, T.commentEverySec[0], T.commentEverySec[1]) * (focusRoom === room ? 1 : 2.5);
      const name = randomFan();
      const pool = Math.random() < 0.55 ? cfg.comments[room.type] : cfg.comments.any;
      const text = pick(Math.random, pool);
      pushComment(st, name, text, 'npc');
      if (room === focusRoom) addChat(name, text, 'npc', room.id);
      st.dirty = true;
    }
    // NPC gifts
    st.giftT -= dt * (inPk ? 1.8 : 1) * (1 + st.hype * 1.5);
    if (st.giftT <= 0 && (room.type === 'group' || seatHouse.get(room.id)?.owner)) {
      st.giftT = range(Math.random, T.npcGiftEverySec[0], T.npcGiftEverySec[1]) * (room.type === 'group' ? 1 : 2.2);
      const gift = pickWeighted(Math.random, npcGiftTable);
      receiveGift(room, gift, gift.price <= 5 ? 1 + Math.floor(Math.random() * 5) : 1, randomFan());
    }
    // host chatter
    st.sayT -= dt;
    if (st.sayT <= 0) {
      st.sayT = range(Math.random, 7, 15);
      if (isNear(room, 20)) {
        let speaker = npcs.speaker(room.id);
        let lines = cfg.streamerLines[st.genre];
        if (room.type === 'group') {
          const m = npcs.byRoom.get(room.id).members;
          const roles = ['mc', 'mc', 'idol', 'tech', 'manager'].filter((r) => (r === 'idol' ? m.idols.some((a) => !a.hidden) : !m[r].hidden));
          const role = pick(Math.random, roles.length ? roles : ['idol']);
          speaker = role === 'idol' ? pick(Math.random, m.idols.filter((a) => !a.hidden)) : m[role];
          lines = cfg.streamerLines.group[role];
        }
        if (speaker && lines) npcSay(speaker, fill(pick(Math.random, lines), { room: st.title }), room);
      }
    }
    // game matches
    if (room.type === 'game') {
      const m = st.match;
      m.t += dt;
      if (m.result) {
        if (m.t > m.endT + 7) st.match = newMatch(m.no);
      } else if (m.t > m.next) {
        m.next = m.t + range(Math.random, 1.5, 3.5);
        m.alive = Math.max(1, m.alive - 1 - Math.floor(Math.random() * 4));
        const out = m.alive > 1 && Math.random() < 0.06 + (50 - m.alive) * 0.002;
        if (m.alive <= 1 || out) {
          m.result = out ? 'lose' : 'win';
          m.endT = m.t;
          if (isNear(room, 20)) {
            npcSay(npcs.speaker(room.id), m.result === 'win' ? 'TOP 1!!! Cảm ơn cả nhà!' : 'Ui bị loại rồi... trận sau nhé!', room);
            if (m.result === 'win') {
              const sp = stagePos(room);
              effects.confetti(sp.x, 3, sp.z, 90, 2);
            }
          }
          if (m.pred) {
            if (m.pred === m.result) earn(25, `Dự đoán đúng trận #${m.no}!`);
            else if (room === focusRoom) hud.toast(`Dự đoán trận #${m.no} chưa đúng.`);
          }
        }
        st.dirty = true;
      }
    }
    // TV camera auto-cut
    if (room.type === 'group') {
      st.camT += dt;
      if (st.camT > 7) {
        st.camT = 0;
        st.camIdx = (st.camIdx + 1) % room.tvCams.length;
      }
    }
  }
  // auto PK
  if (pk) {
    if (Date.now() >= pk.endsAt) endPk();
  } else {
    pkT -= dt;
    if (pkT <= 0) {
      const groups = shuffled(Math.random, world.rooms.filter((r) => r.type === 'group'));
      beginPk(groups[0].id, groups[1].id, null);
    }
  }
  // watch reward
  if (player && focusRoom) {
    watchT += dt;
    if (watchT >= T.watchRewardSec) {
      watchT = 0;
      earn(T.watchRewardCoins, `Xem live ${focusRoom.id}:`, 'good');
    }
  }
}

// ------------------------------------------------------------------ audio mix
function mixAudio() {
  if (!player) {
    for (const room of world.rooms) audio.mix(room.id, 0, 0, 1);
    audio.mix('lobby', 0.45, 0, 0);
    return;
  }
  const px = player.body.pos.x;
  const pz = player.body.pos.z;
  const R = T.audioRadius;
  const rx = Math.cos(cam.yaw);
  const rz = -Math.sin(cam.yaw);
  let loudest = 0;
  for (const room of world.rooms) {
    const d = distToRect(room.rect, px, pz);
    const inside = d === 0;
    let vol = inside ? 1 : Math.max(0, 1 - d / (room.type === 'group' ? R * 1.2 : R)) ** 1.7 * (room.type === 'group' ? 0.85 : 0.65);
    const nearDoor = Math.hypot(room.door.out.x - px, room.door.out.z - pz) < 4;
    const muffle = inside ? 0 : room.type === 'group' ? (nearDoor ? 0.25 : 0.55) : nearDoor ? 0.45 : 0.75;
    let pan = 0;
    if (!inside) {
      const dx = room.cx - px;
      const dz = room.cz - pz;
      const l = Math.hypot(dx, dz) || 1;
      pan = ((dx * rx + dz * rz) / l) * 0.75;
    }
    if (vol < 0.004) vol = 0;
    audio.mix(room.id, vol, pan, muffle);
    loudest = Math.max(loudest, vol);
  }
  audio.mix('lobby', Math.max(0, 1 - loudest * 1.6) * 0.5, 0, 0);
}

// ------------------------------------------------------------------ live TV
function renderLiveTv() {
  if (!player) return;
  let best = null;
  let bd = 34;
  for (const room of world.rooms) {
    if (room.type !== 'group') continue;
    const d = playerDist(room);
    if (d < bd) {
      bd = d;
      best = room;
    }
  }
  if (best !== liveRoom) {
    if (liveRoom) {
      liveRoom.tv.mesh.material.map = liveRoom.tv.fallback;
      liveRoom.tv.mesh.material.needsUpdate = true;
    }
    liveRoom = best;
    if (liveRoom) {
      liveRoom.tv.mesh.material.map = rt.texture;
      liveRoom.tv.mesh.material.needsUpdate = true;
    }
  }
  // ~20 fps is plenty for a TV; reuse the main view's shadow map
  if (!liveRoom || frameNo % 3) return;
  const c = liveRoom.tvCams[states.get(liveRoom.id).camIdx % liveRoom.tvCams.length];
  tvCam.position.set(...c.pos);
  tvCam.lookAt(...c.look);
  liveRoom.tv.mesh.visible = false;
  renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(rt);
  renderer.render(scene, tvCam);
  renderer.setRenderTarget(null);
  renderer.shadowMap.autoUpdate = true;
  liveRoom.tv.mesh.visible = true;
}

// ------------------------------------------------------------------ input
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space']);
window.addEventListener('keydown', (e) => {
  if (!player || document.activeElement?.tagName === 'INPUT') return;
  if (e.code === 'Enter') {
    e.preventDefault();
    hud.focusChat();
    return;
  }
  if (e.code === 'Escape') hud.closePanel();
  if (GAME_KEYS.has(e.code)) e.preventDefault();
  if (hud.panelOpen && e.code !== 'Escape') return;
  if (e.code === 'Space' && !e.repeat) input.jump = true;
  if (e.code === 'KeyE' && !e.repeat) input.pressed = true;
  if (e.code === 'KeyF' && !e.repeat) rhythmHit();
  if (e.code === 'KeyH' && focusRoom) sendHeart(focusRoom);
  if (e.code === 'KeyG' && focusRoom) openRoom(focusRoom, 'gift');
  if (e.code === 'KeyR' && focusRoom?.type === 'group') openRoom(focusRoom, 'role');
  if (e.code === 'KeyT' && focusRoom) openRoom(focusRoom, 'genre');
  if (e.code === 'KeyM' && focusRoom) openRoom(focusRoom, 'game');
  if (e.code === 'KeyV' && focusRoom && focusRoom.type !== 'group') openRoom(focusRoom, 'seat');
  if (e.code === 'KeyL') openRoomList();
  if (e.key === '?') openHelp();
  input.keys.add(e.code);
});
window.addEventListener('keyup', (e) => input.keys.delete(e.code));
window.addEventListener('blur', () => input.keys.clear());

const canvas = renderer.domElement;
let lastPointer = null;
canvas.addEventListener('pointerdown', (e) => {
  cam.dragging = true;
  lastPointer = { x: e.clientX, y: e.clientY, id: e.pointerId };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!cam.dragging || !lastPointer || e.pointerId !== lastPointer.id) return;
  cam.yaw -= (e.clientX - lastPointer.x) * 0.006;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + (e.clientY - lastPointer.y) * 0.004, 0.06, 1.3);
  lastPointer.x = e.clientX;
  lastPointer.y = e.clientY;
});
const endDrag = () => {
  cam.dragging = false;
  lastPointer = null;
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.dist = THREE.MathUtils.clamp(cam.dist * (1 + Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120) * 0.0015), 3.5, 60);
}, { passive: false });

// touch joystick + buttons
{
  const joy = document.getElementById('joy');
  const knob = document.getElementById('joy-knob');
  let jid = null;
  const setKnob = (x, y) => {
    knob.style.transform = `translate(${x * 40}px, ${y * 40}px)`;
  };
  joy.addEventListener('pointerdown', (e) => {
    jid = e.pointerId;
    joy.setPointerCapture(jid);
  });
  joy.addEventListener('pointermove', (e) => {
    if (e.pointerId !== jid) return;
    const r = joy.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    input.joy.x = x;
    input.joy.y = y;
    setKnob(x, y);
  });
  const end = () => {
    jid = null;
    input.joy.x = input.joy.y = 0;
    setKnob(0, 0);
  };
  joy.addEventListener('pointerup', end);
  joy.addEventListener('pointercancel', end);
  document.getElementById('t-act').addEventListener('pointerdown', () => (input.pressed = true));
  document.getElementById('t-jump').addEventListener('pointerdown', () => (input.jump = true));
  document.getElementById('t-heart').addEventListener('pointerdown', () => focusRoom && sendHeart(focusRoom));
  document.getElementById('t-beat').addEventListener('pointerdown', () => rhythmHit());
}

// ------------------------------------------------------------------ camera
const camDesired = new THREE.Vector3();
const camDir = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();
function updateCamera(dt, t) {
  if (!player) {
    // attract mode: slow orbit over the building
    const a = t * 0.04;
    camDesired.set(Math.sin(a) * 30, 22, Math.cos(a) * 26);
    cam.target.set(0, 1, -6);
    camera.position.lerp(camDesired, 1 - Math.exp(-dt * 2));
    camera.lookAt(cam.target);
    return;
  }
  const p = player.body.pos;
  cam.target.lerp(tmpTarget.set(p.x, p.y + 1.25, p.z), 1 - Math.exp(-dt * 12));
  const dist = cam.wide ? Math.max(cam.dist, 34) : cam.dist;
  // the further out, the more top-down: zooming out turns into a bird's-eye overview
  const overview = THREE.MathUtils.clamp((dist - 12) / 20, 0, 1);
  const pitch = THREE.MathUtils.lerp(cam.pitch, 1.2, overview);
  camDir.set(Math.sin(cam.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(cam.yaw) * Math.cos(pitch));
  raycaster.set(cam.target, camDir);
  raycaster.far = dist;
  // zoomed far out the camera floats above the roofless rooms, so walls stop blocking it
  const hit = overview > 0.6 ? null : raycaster.intersectObjects(world.cameraBlockers, false).find((h) => h.point.y < HALL.height - 0.05);
  const d = hit ? Math.max(1.2, hit.distance - 0.35) : dist;
  camDesired.copy(cam.target).addScaledVector(camDir, d);
  if (d < 12) camDesired.y = Math.min(camDesired.y, HALL.height - 0.3);
  camera.position.lerp(camDesired, 1 - Math.exp(-dt * 14));
  camera.lookAt(cam.target);
}

// ------------------------------------------------------------------ main loop
const beats = new Map();
const boosts = new Map();
const npcCtx = {
  beat: (id) => beats.get(id) ?? 0,
  onCheer(fan, room) {
    if (!player || dist2d(fan.body.pos, player.body.pos) > 12) return;
    const line = pick(Math.random, room.type === 'group' ? ['Yeah!!!', 'Đỉnh quá!', 'Nhảy đẹp!', 'Yêu nhóm ❤'] : ['Hay quá!', '❤❤❤', 'Tuyệt vời!', 'Ủng hộ!']);
    fan.label.say(line, 2.5);
  },
};

let lastFrame = performance.now();
function frame(now, once = false) {
  // chặn cả dt âm: gọi frame() tay (__creator.frame, performance.now) xen vòng rAF làm now < lastFrame → lerp ngoại suy, camera văng
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = Math.max(lastFrame, now);
  const t = now / 1000;
  frameNo++;

  for (const room of world.rooms) {
    beats.set(room.id, audio.beat(room.id));
    boosts.set(room.id, states.get(room.id).boost);
  }

  // focus room: the one you are in, or the closest within 3.5 m
  if (player) {
    const p = player.body.pos;
    const prev = focusRoom;
    focusRoom = world.roomAt(p.x, p.z) ?? world.nearestRoom(p.x, p.z, 3.5);
    if (focusRoom !== prev) {
      watchT = 0;
      if (focusRoom) {
        const st = states.get(focusRoom.id);
        addChat('Hệ thống', `Bạn đang xem ${focusRoom.id} · ${st.title} (${genreLabel(st.genre)})`, 'system', focusRoom.id);
        hud.setChatTarget(`Bình luận vào phòng ${focusRoom.id}... (Enter)`);
      } else hud.setChatTarget('Nhấn Enter để chat...');
    }
  }

  simulateRooms(dt);
  updateSeats(dt);
  // far NPCs are neither drawn nor animated (they keep walking)
  const cullDist = Math.max(46, cam.dist + 34);
  for (const a of npcs.all) {
    a.far = camera.position.distanceTo(a.char.root.position) > cullDist;
    a.char.root.visible = !a.hidden && !a.far;
  }
  npcs.update(dt, npcCtx);
  if (player) updatePlayer(dt);
  updateRemotes(dt);
  const actors = allActors();
  separateActors(actors);
  for (const a of actors) syncActor(a);
  effects.update(dt);
  world.update(dt, t, beats, boosts);
  decor.update(dt, t, { camera, beats, focus: focusRoom, actors });
  if (world.wheel.spinning) world.wheel.tick?.();

  // screens: nearby rooms refresh often, far ones only their door signs
  for (const room of world.rooms) {
    const st = states.get(room.id);
    st.scrT -= dt;
    if (st.scrT <= 0) {
      const d = playerDist(room);
      st.scrT = d < 16 ? 0.1 : d < 30 ? 0.25 : 1.5;
      drawRoomScreens(room, t);
    }
  }
  if (frameNo % 120 === 1) S.drawLeaderboard(world.leaderboard.screen, states, pk, profile, fanRank());

  mixAudio();
  if (player) world.followShadow(player.body.pos.x, player.body.pos.z);
  updateCamera(dt, t);
  for (const a of actors) if (!a.hidden && !a.far) a.label.update(dt, camera.position.distanceTo(a.char.root.position), 30);
  for (const a of decor.staff) a.label.update(dt, a.char.root.visible ? camera.position.distanceTo(a.char.root.position) : 1e9, 30);

  hudT -= dt;
  if (hudT <= 0) {
    hudT = 0.25;
    updateHud();
  }
  saveT -= dt;
  if (saveT <= 0) {
    saveT = 10;
    if (player) save();
  }

  renderLiveTv();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  if (!once) requestAnimationFrame(frame);
}

// solo rooms take their owners' names, then first paint of every screen
for (const room of world.rooms) if (room.type !== 'group') refreshSeat(room);
for (const room of world.rooms) drawRoomScreens(room, 0, true);
S.drawWheel(world.wheel.screen, cfg.wheel);
S.drawLabel(world.wardrobe.screen, '👗 TỦ ĐỒ', '#ff4fa3');
requestAnimationFrame(frame);

// ------------------------------------------------------------------ start screen
{
  const form = document.getElementById('start-form');
  const nameInput = document.getElementById('start-name');
  nameInput.value = profile.name;
  const choice = { outfit: profile.look.outfit, hair: profile.look.hair };
  const outfits = cfg.shop.filter((i) => i.slot === 'outfit' && (i.price === 0 || profile.owned.includes(i.id)));
  const hairs = cfg.shop.filter((i) => i.slot === 'hair' && (i.price === 0 || profile.owned.includes(i.id)));
  function renderChoices() {
    for (const [wrapId, list, slot] of [['choose-outfit', outfits, 'outfit'], ['choose-hair', hairs, 'hair']]) {
      const wrap = document.getElementById(wrapId);
      wrap.replaceChildren();
      for (const item of list) {
        const sw = el('span', { className: 'sw' });
        sw.style.background = swatchColor(item);
        wrap.append(el('button', { type: 'button', className: choice[slot] === item.value ? 'on' : '', onclick: () => { choice[slot] = item.value; renderChoices(); } }, sw, item.name));
      }
    }
  }
  renderChoices();
  if (profile.gifted || profile.earned || profile.coins !== T.startCoins) {
    document.getElementById('returning').textContent = `Chào mừng trở lại! ${formatThousands(profile.coins)} xu • ${fanRank()} • đã tặng ${formatThousands(profile.gifted)} xu`;
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    startGame(nameInput.value, choice);
  });
  document.getElementById('loading').classList.add('hidden');
  form.classList.remove('hidden');
  nameInput.focus();
  nameInput.select();
  hud.setToggle('music', true);
}

// expose a tiny debug handle for testing in the console
window.__creator = { world, npcs, states, profile, audio, renderer, scene, camera, cam, get pk() { return pk; }, get player() { return player; }, beginPk, openRoom, frame: () => frame(performance.now(), true) };
