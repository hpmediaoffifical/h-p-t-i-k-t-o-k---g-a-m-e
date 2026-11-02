/**
 * ⛓️ Nhà Tù Online — overlay OBS /overlay/nhatu (HP Action LIVE).
 *
 * Trại giam 3D chibi sống theo lịch trại (điểm danh, ăn, lao động, giờ tự do, ngủ) với NPC + người xem LIVE.
 *  - Người xem bình luận / thả tim / follow → vào trại thành phạm nhân mang tên + avatar TikTok.
 *  - Chế độ TỰ CHƠI (auto): ai tặng quà được 1 lượt — camera bám theo, bình luận mã (1/B, 2/L…) để ném bóng,
 *    lau sàn, ăn cơm… Im lặng quá ntIdleAuto giây thì nhân vật tự làm. Quà tiếp theo chuyển lượt sang người khác.
 *    Không ai tặng quà → camera tự lia quanh trại. Treo máy cả buổi không cần người trực.
 *  - Chế độ STREAMER: streamer tự đi lại bằng phím (cửa sổ game hoặc bàn phím ảo trong app, relay 'nhatu:key').
 * Cấu hình: GET /api/games/nhatu/config (khoá nt*). Lệnh panel: gameCmd {gameId:'nhatu'}.
 */
import * as THREE from 'three';
import { buildWorld, HALL } from './world.js';
import { animateCharacter } from './character.js';
import { NpcManager, makeActor, syncActor, turnToward, separateActors } from './npc.js';
import { BallSystem, DirtSystem } from './effects.js';
import { AudioFx } from './audio.js';
import { LabelLayer, setLabelLayer } from './labels.js';
import { GameClock, compileSchedule, phaseAt, parseHM, formatHM, minutesToNextPhase } from './logic/clock.js';
import { stepBody } from './logic/physics.js';
import { mulberry32, pick, range } from './logic/rng.js';
import { formatThousands, cleanText } from './logic/format.js';
import { SpotlightQueue, parseActionCode } from './logic/spotlight.js';
import { createEvents } from './events.js';

const Q = new URLSearchParams(location.search);
const DATA = await fetch('/games/nhatu/data.json').then((r) => r.json());
const T = DATA.tuning;
const ACTIONS = DATA.actions;
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ cấu hình (ghi đè bằng config nt* từ app)
const CFG = {
  mode: 'auto',
  streamerName: 'Streamer',
  turnBase: 25,
  turnPerCoin: 1,
  turnMax: 90,
  minTurn: 15,
  preempt: true,
  queueMax: 20,
  idleAuto: 6,
  maxViewers: 40,
  npcCount: 28,
  minuteMs: 1000,
  sound: true,
  music: false,
  likePerDay: 300,
  anyoneAct: false,
  joinOnComment: true,
  showMenu: true,
  giftMap: {},
  bossSec: 180,
  guardSec: 180,
  jobSec: 180,
  bossFollowers: 6,
  jailIdleSec: 180,
  joinOnLike: true,
  bossCoins: 0,
  guardCoins: 0,
  showGiftLegend: true,
};

// ------------------------------------------------------------------ renderer
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.get('q') !== 'low', powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = Q.get('q') === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 160);
const labelLayer = new LabelLayer($('labels'));
setLabelLayer(labelLayer);
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // ngân sách điểm ảnh ~2,2 triệu (OBS 1080×1920); ?q=low giảm còn 1 triệu cho máy yếu
  const budget = Q.get('q') === 'low' ? 1.0e6 : 2.2e6;
  renderer.setPixelRatio(Math.max(0.5, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(budget / Math.max(1, w * h)))));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 62 : 50; // khung dọc 9:16 cần góc rộng hơn
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ thế giới + hệ thống
const world = buildWorld(scene);
const rng = mulberry32(T.seed);
const schedule = compileSchedule(DATA.schedule);
const npcs = new NpcManager({ scene, world, config: { tuning: T, names: DATA.names, guards: DATA.guards }, rng });
npcs.spawn(CFG.npcCount);
const balls = new BallSystem(scene, world.hoop);
const dirt = new DirtSystem(scene, () => npcs.randomPoint(), T.dirtMax);
for (let i = 0; i < 3; i++) dirt.spawn();
const audio = new AudioFx();
const spot = new SpotlightQueue({});
const viewers = new Map(); // id → {id, name, avatar, npc, points, lastActive, lastCmdAt, lastLikeBubble}

function lsGet(k, d) {
  try {
    const v = localStorage.getItem(k);
    return v === null ? d : JSON.parse(v);
  } catch {
    return d;
  }
}
function lsSet(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* OBS có thể chặn storage */
  }
}

// Đồng hồ trại chạy tiếp qua các lần tải lại overlay
const savedClock = lsGet('nt_clock', null);
const clock = new GameClock({ msPerGameMinute: CFG.minuteMs, startMinute: parseHM('10:00'), epochMs: Date.now() });
if (savedClock && savedClock.total > 0) clock.startMinute = savedClock.total;
const board = lsGet('nt_board', {}); // id → {name, avatar, points}
let campBonusDays = lsGet('nt_bonus_days', 0);
// "Toàn trại đã gạch" chỉ tăng: cộng dồn mỗi ngày trại theo số phạm nhân (NPC rời trại không làm tụt số)
let campDays = lsGet('nt_camp_days', 0) || npcs.inmates.reduce((a, n) => a + n.days, 0);
let likeAcc = 0;

// ------------------------------------------------------------------ trạng thái
let currentPhase = null;
let lastDay = null;
let nightF = 0;
let chatT = 3;
let dirtT = T.dirtSpawnSec;
let hudT = 0;
let saveT = 5;
let demo = Q.get('demo') === '1';
let demoT = 1;
let fillerT = 1;
let streamer = null;
const keys = new Set();
const cam = { yaw: 0.6, pitch: 0.5, dist: 9, target: new THREE.Vector3(0, 1, 0), tourT: 0, tourKind: 'overview', tourActor: null };
const raycaster = new THREE.Raycaster();

// ------------------------------------------------------------------ tiện ích HUD
function chatLine(name, text, kind = 'npc') {
  const log = $('chat');
  const row = document.createElement('div');
  row.className = `nt-chat ${kind}`;
  const b = document.createElement('b');
  b.textContent = `${name}: `;
  const s = document.createElement('span');
  s.textContent = text;
  row.append(b, s);
  log.append(row);
  while (log.children.length > 6) log.firstChild.remove();
}
function banner(text) {
  const el = $('banner');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}
function avatarEl(name, url, cls = 'nt-av') {
  const d = document.createElement('span');
  d.className = cls;
  d.textContent = (name || '?').trim().charAt(0).toUpperCase();
  if (url && /^https?:\/\//i.test(url)) {
    const img = document.createElement('img');
    img.referrerPolicy = 'no-referrer';
    img.alt = '';
    img.src = url;
    img.onerror = () => img.remove();
    d.append(img);
  }
  return d;
}
const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const sfx = (name) => CFG.sound && audio.play(name);

// ------------------------------------------------------------------ người xem
/** Đưa người xem vào trại (hoặc cập nhật nếu đã có). */
function ensureViewer(user) {
  const now = Date.now();
  let v = viewers.get(user.id);
  if (v) {
    v.lastActive = now;
    if (v.jailed) events.free(v); // luật ngầm: tương tác lại là được thả
    if (user.avatar && user.avatar !== v.avatar) {
      v.avatar = user.avatar;
      v.npc.label.setAvatar(user.avatar);
    }
    return v;
  }
  if (viewers.size >= CFG.maxViewers) {
    const oldest = [...viewers.values()].filter((x) => x.id !== spot.current?.id).sort((a, b) => (b.jailed ? 1 : 0) - (a.jailed ? 1 : 0) || a.lastActive - b.lastActive)[0];
    if (oldest) removeViewer(oldest);
  }
  const saved = board[user.id];
  const npc = npcs.addInmate({ name: user.name, avatar: user.avatar, kind: 'viewer', x: range(Math.random, -1.6, 1.6), z: 12.6, days: 0 });
  npc.viewer = true;
  v = { id: user.id, name: user.name, avatar: user.avatar, npc, points: saved?.points ?? 0, lastActive: now, lastCmdAt: now, lastLikeBubble: 0, lastAct: 0 };
  npc.viewerRec = v;
  viewers.set(user.id, v);
  npc.label.say(pick(Math.random, DATA.chat.joined));
  chatLine('Hệ thống', `${user.name} đã nhập trại! Phòng ${npc.room.id}.`, 'system');
  return v;
}

function removeViewer(v) {
  events.onViewerRemoved(v);
  viewers.delete(v.id);
  npcs.removeInmate(v.npc);
}

function addPoints(v, pts, reason) {
  if (!pts) return;
  v.points += pts;
  board[v.id] = { name: v.name, avatar: v.avatar, points: v.points };
  if (reason) v.npc.label.say(`${reason} +${pts}`, 3);
}

// ------------------------------------------------------------------ hành động (nhiệm vụ)
const actionById = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));

/**
 * Ra lệnh cho một phạm nhân làm nhiệm vụ.
 * @param {object} n actor (NPC / người xem / streamer)
 * @param {string} id ball | mop | eat | gym | dance | sleep | salute
 * @param {object|null} v bản ghi người xem (để cộng điểm)
 */
function doAction(n, id, v = null) {
  const a = actionById[id];
  if (!a) return false;
  if (n.isStreamer) return streamerAction(id);
  npcs.release(n);
  const award = () => v && addPoints(v, a.points, a.emoji);
  switch (id) {
    case 'ball': {
      const s = pick(Math.random, world.courtSpots);
      npcs.command(n, { dest: { level: 0, x: s.x + range(Math.random, -0.5, 0.5), z: s.z + range(Math.random, -0.5, 0.5) }, mode: 'idle', stay: 7.5, shoot: true });
      break;
    }
    case 'mop': {
      let s = dirt.spots.filter((d) => !d.claimed).sort((p, q) => dist2d(p, n.body.pos) - dist2d(q, n.body.pos))[0];
      if (!s) s = dirt.spawn() ?? dirt.spots[0];
      if (!s) return false;
      s.claimed = n;
      npcs.command(n, {
        dest: { level: 0, x: s.x, z: s.z },
        mode: 'mop',
        stay: 3.5,
        then: () => sfx('scrub'),
        done: () => {
          if (dirt.spots.includes(s)) dirt.remove(s);
          award();
          if (v) chatLine('Hệ thống', `🧽 ${v.name} lau sàn sạch bóng!`, 'system');
        },
      });
      break;
    }
    case 'eat': {
      const seat = world.seats.filter((s) => !s.occupant).sort((p, q) => dist2d(p, n.body.pos) - dist2d(q, n.body.pos))[0];
      if (!seat) return false;
      npcs.command(n, { dest: { level: 0, x: seat.approach.x, z: seat.approach.z }, seat, mode: 'eat', stay: 7, done: award });
      break;
    }
    case 'gym': {
      const s = pick(Math.random, world.rollcallSpots);
      npcs.command(n, { dest: { level: 0, ...s }, mode: 'exercise', stay: 6, ry: -Math.PI / 2, done: award });
      break;
    }
    case 'dance':
      npcs.command(n, { inPlace: true, mode: 'cheer', stay: 4.5, done: award });
      break;
    case 'sleep': {
      const room = n.room;
      const bed = room.beds.find((b) => !b.occupant || b.occupant === n);
      if (bed) bed.occupant = n;
      npcs.command(n, {
        dest: { level: room.level, cell: room },
        seat: bed ? { ...bed, approach: room.inside, ref: bed } : undefined,
        mode: bed ? 'sleep' : 'idle',
        stay: 8,
        then: () => n.label.say('Zzz...', 4),
        done: award,
      });
      break;
    }
    case 'salute': {
      const g = npcs.guards.slice().sort((p, q) => dist2d(p.body.pos, n.body.pos) - dist2d(q.body.pos, n.body.pos))[0];
      if (!g) return false;
      npcs.command(n, {
        dest: { level: 0, x: g.body.pos.x + 1.2, z: g.body.pos.z + 0.6 },
        mode: 'talk',
        stay: 3,
        then: () => {
          n.faceActor = g;
          const line = `Chào ${n.name}! ${pick(Math.random, DATA.chat.guard)}`;
          g.label.say(line);
          chatLine(g.name, line, 'guard');
        },
        done: award,
      });
      break;
    }
    default:
      return false;
  }
  n.label.say(`${a.emoji} ${a.label}!`, 2.5);
  return true;
}

// vai trò Đại Ca / Cán Bộ, luật biệt giam, sự kiện quà cả trại
const events = createEvents({ scene, world, npcs, DATA, CFG, viewers, chatLine, banner, sfx, addPoints, doAction, spot, dirt });
const allGiftActions = ACTIONS.map((a) => ({ ...a, group: 'task' })).concat(DATA.giftActions || []);

/** Kích hoạt một hành động quà (nhiệm vụ, vai trò hoặc sự kiện) cho người xem. */
function runGiftAction(id, v) {
  if (events.trigger(id, v)) return true;
  return doAction(v.npc, id, v);
}

// ------------------------------------------------------------------ sự kiện LIVE
function onComment(user, text) {
  const clean = cleanText(text, 120);
  if (!clean) return;
  const now = Date.now();
  const v = CFG.joinOnComment || viewers.has(user.id) ? ensureViewer(user) : null;
  chatLine(user.name, clean, v && spot.current?.id === user.id ? 'spot' : 'viewer');
  if (!v) return;
  const code = parseActionCode(clean, ACTIONS);
  const isTurn = spot.current?.id === user.id;
  if (code && (isTurn || (CFG.anyoneAct && now - v.lastAct > 8000))) {
    v.lastCmdAt = now;
    v.lastAct = now;
    doAction(v.npc, code, v);
    sfx('pop');
    return;
  }
  v.npc.label.say(clean);
}

function onLike(user, count) {
  likeAcc += count;
  while (CFG.likePerDay > 0 && likeAcc >= CFG.likePerDay) {
    likeAcc -= CFG.likePerDay;
    campBonusDays += 1;
    banner('❤️ Thả tim đủ — cả trại gạch thêm 1 ngày!');
    sfx('coin');
  }
  if (!CFG.joinOnLike && !viewers.has(user.id)) return;
  const v = ensureViewer(user); // thả tim = vào trại làm tù nhân (và được thả nếu đang bị nhốt)
  if (Date.now() - v.lastLikeBubble > 4000) {
    v.lastLikeBubble = Date.now();
    v.npc.label.say('❤️', 1.5);
  }
}

function onSocial(user, kind) {
  const v = ensureViewer(user);
  addPoints(v, kind === 'follow' ? 5 : 3, kind === 'follow' ? '➕' : '↗️');
  chatLine('Hệ thống', kind === 'follow' ? `${user.name} đã theo dõi — được thưởng điểm!` : `${user.name} đã chia sẻ LIVE!`, 'system');
  doAction(v.npc, 'dance', null);
}

function giftActionFor(giftId) {
  const id = String(giftId ?? '');
  if (!id) return null;
  for (const [action, list] of Object.entries(CFG.giftMap || {})) if ((list || []).some((g) => String(g.giftId) === id)) return action;
  return null;
}

function onGift(user, giftName, count, coinEach, giftId) {
  const v = ensureViewer(user);
  const coins = Math.max(1, coinEach) * Math.max(1, count);
  addPoints(v, coins, '🎁');
  chatLine('Hệ thống', `${user.name} tặng ${count > 1 ? `${count}× ` : ''}${giftName}`, 'gift');
  sfx('coin');
  const mapped = giftActionFor(giftId);
  if (mapped) runGiftAction(mapped, v);
  else if (CFG.bossCoins > 0 && coins >= CFG.bossCoins) runGiftAction('boss', v);
  else if (CFG.guardCoins > 0 && coins >= CFG.guardCoins) runGiftAction('guard', v);
  if (CFG.mode !== 'auto' && CFG.mode !== 'streamer') return;
  const res = spot.addGift({ id: v.id, name: v.name, avatar: v.avatar }, coins, Date.now());
  if (res === 'extend') v.npc.label.say(`⏱ +giờ chơi!`, 2.5);
  else if (res === 'queued' || res === 'queued-extend') chatLine('Hệ thống', `${v.name} đang chờ lượt (thứ ${spot.queue.findIndex((q) => q.id === v.id) + 1})`, 'system');
}

function beginTurn(cur) {
  const v = viewers.get(cur.id);
  if (!v) return;
  if (v.jailed) events.free(v);
  v.lastCmdAt = Date.now();
  v.npc.label.setKind('spot');
  v.npc.label.say(pick(Math.random, DATA.chat.turn), 3);
  banner(`🎥 Lượt của ${v.name}`);
  sfx('bell');
}

function endTurn(cur) {
  const v = viewers.get(cur.id);
  if (v && !v.jailed) v.npc.label.setKind(v.guardRole ? 'guard' : 'viewer');
}

// ------------------------------------------------------------------ lịch trại
function onPhaseChange(phase, initial) {
  currentPhase = phase;
  npcs.setPhase(phase.key);
  if (initial) return;
  sfx('bell');
  banner(`🔔 ${phase.label}`);
  chatLine('Hệ thống', `Đã đến giờ ${phase.label.toLowerCase()}!`, 'system');
  if (phase.key === 'work') for (let i = 0; i < 3; i++) dirt.spawn();
  const g = npcs.guards[0];
  if (g) {
    const line = pick(Math.random, DATA.chat.guard);
    g.label.say(line);
    chatLine(g.name, line, 'guard');
  }
}

function onNewDay(days) {
  for (const n of npcs.inmates) n.days += days;
  campDays += npcs.inmates.length * days;
  banner(`📅 Cả trại gạch thêm ${days} ngày`);
}

// ------------------------------------------------------------------ chế độ streamer (điều khiển bằng phím)
function ensureStreamer() {
  if (streamer) return;
  streamer = makeActor(scene, { name: CFG.streamerName || 'Streamer', look: { outfit: 'stripe', hair: 'brown', hat: 'red', number: 1 }, kind: 'player', x: 2, z: 10 });
  streamer.isStreamer = true;
  streamer.isPlayer = true;
  streamer.timers = { shoot: 0, cheer: 0, exercise: 0 };
}
function dropStreamer() {
  if (!streamer) return;
  if (streamer.seat?.occupantRef?.occupant === streamer) streamer.seat.occupantRef.occupant = null;
  scene.remove(streamer.char.root);
  streamer.label.dispose();
  streamer = null;
}
function streamerAction(id) {
  const s = streamer;
  if (!s) return false;
  const p = s.body.pos;
  if (id === 'ball') {
    const rim = world.hoop.rim;
    const d = Math.hypot(rim.x - p.x, rim.z - p.z);
    if (d > 10 || p.x < 8) {
      s.label.say('Ra sân bóng đã!', 2);
      return false;
    }
    s.ry = Math.atan2(rim.x - p.x, rim.z - p.z);
    s.timers.shoot = 0.5;
    balls.shoot({ x: p.x, y: p.y + 1.7, z: p.z }, Math.random() < BallSystem.chanceFor(d), (ok) => {
      sfx(ok ? 'swish' : 'miss');
      if (ok) s.timers.cheer = 1.2;
    });
  } else if (id === 'dance') s.timers.cheer = 3;
  else if (id === 'gym') s.timers.exercise = 5;
  else if (id === 'mop') {
    const d = dirt.nearest(p.x, p.z, 1.4);
    if (!d) {
      s.label.say('Không có vết bẩn gần đây', 2);
      return false;
    }
    dirt.remove(d);
    s.timers.exercise = 0;
    sfx('scrub');
  } else s.label.say(`${actionById[id]?.emoji ?? ''} ${actionById[id]?.label ?? ''}`, 2);
  return true;
}
function updateStreamer(dt) {
  const s = streamer;
  let fwd = 0;
  let right = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) fwd += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) fwd -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) right += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) right -= 1;
  for (const k of Object.keys(s.timers)) s.timers[k] = Math.max(0, s.timers[k] - dt);
  let vx = 0;
  let vz = 0;
  if (fwd || right) {
    const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? T.runSpeed : T.walkSpeed;
    const sy = Math.sin(cam.yaw);
    const cy = Math.cos(cam.yaw);
    const dx = -sy * fwd + cy * right;
    const dz = -cy * fwd - sy * right;
    const l = Math.hypot(dx, dz) || 1;
    vx = (dx / l) * speed;
    vz = (dz / l) * speed;
    turnToward(s, Math.atan2(vx, vz), dt, 12);
    s.timers.exercise = 0;
  }
  if (s.jump && s.body.grounded) {
    s.body.vy = T.jumpVelocity;
    s.body.grounded = false;
    sfx('jump');
  }
  s.jump = false;
  stepBody(s.body, vx, vz, dt, world.collision, T.gravity);
  if (s.body.pos.y < -3) Object.assign(s.body.pos, { x: 2, y: 0, z: 10 });
  s.speed = Math.hypot(vx, vz);
  s.mode = s.timers.shoot > 0 ? 'shoot' : s.timers.cheer > 0 ? 'cheer' : s.timers.exercise > 0 ? 'exercise' : s.speed > 0.1 ? 'walk' : 'idle';
  animateCharacter(s.char, dt, { mode: s.mode, speed: s.speed, airborne: !s.body.grounded });
}
function keyDown(code) {
  keys.add(code);
  if (code === 'Space' && streamer) streamer.jump = true;
  const digit = /^Digit([1-9])$/.exec(code) || /^Numpad([1-9])$/.exec(code);
  if (digit) {
    const a = ACTIONS[Number(digit[1]) - 1];
    if (!a) return;
    if (CFG.mode === 'streamer' && streamer) streamerAction(a.id);
    else commandSpotlight(a.id);
  }
}
function keyUp(code) {
  keys.delete(code);
}
/** Panel / phím số ra lệnh thay cho người đang có lượt. */
function commandSpotlight(actionId) {
  const v = spot.current && viewers.get(spot.current.id);
  if (!v) return false;
  v.lastCmdAt = Date.now();
  return doAction(v.npc, actionId, v);
}
window.addEventListener('keydown', (e) => {
  if (!e.repeat) keyDown(e.code);
  audio.init();
});
window.addEventListener('keyup', (e) => keyUp(e.code));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('pointerdown', () => audio.init());

// ------------------------------------------------------------------ camera tự động
const camDesired = new THREE.Vector3();
const camDir = new THREE.Vector3();
const tmpV = new THREE.Vector3();
function followActor() {
  if (CFG.mode === 'streamer' && streamer) return streamer;
  const v = spot.current && viewers.get(spot.current.id);
  return v ? v.npc : null;
}
function updateCamera(dt) {
  let actor = followActor();
  let dist = 8.5;
  let pitch = 0.5;
  if (actor) {
    cam.yaw += dt * (CFG.mode === 'streamer' ? 0 : 0.07);
  } else {
    // chuyến tham quan: lúc toàn cảnh, lúc bám một người ngẫu nhiên
    cam.tourT -= dt;
    if (cam.tourT <= 0 || (cam.tourKind === 'follow' && !npcs.inmates.includes(cam.tourActor))) {
      cam.tourT = 9;
      if (cam.tourKind === 'follow' || Math.random() < 0.35) cam.tourKind = 'overview';
      else {
        const recent = [...viewers.values()].filter((v) => Date.now() - v.lastActive < 180000).map((v) => v.npc);
        cam.tourActor = pick(Math.random, recent.length ? recent : npcs.inmates);
        cam.tourKind = cam.tourActor ? 'follow' : 'overview';
      }
    }
    cam.yaw += dt * 0.05;
    if (cam.tourKind === 'follow') actor = cam.tourActor;
  }
  if (actor) {
    const p = actor.body.pos;
    tmpV.set(p.x, p.y + 1.2, p.z);
    cam.target.lerp(tmpV, 1 - Math.exp(-dt * 6));
  } else {
    tmpV.set(1, 0.5, -1);
    cam.target.lerp(tmpV, 1 - Math.exp(-dt * 1.5));
    dist = 30;
    pitch = 1.0;
  }
  cam.dist += (dist - cam.dist) * (1 - Math.exp(-dt * 2));
  cam.pitch += (pitch - cam.pitch) * (1 - Math.exp(-dt * 2));
  camDir.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
  let d = cam.dist;
  if (cam.dist < 12) {
    raycaster.set(cam.target, camDir);
    raycaster.far = cam.dist;
    const hit = raycaster.intersectObjects(world.cameraBlockers, false).find((h) => h.point.y < HALL.height - 0.05);
    if (hit) d = Math.max(1.2, hit.distance - 0.35);
  }
  camDesired.copy(cam.target).addScaledVector(camDir, d);
  if (cam.dist < 12) camDesired.y = Math.min(camDesired.y, HALL.height - 0.3);
  camera.position.lerp(camDesired, 1 - Math.exp(-dt * 8));
  camera.lookAt(cam.target);
}

// ------------------------------------------------------------------ HUD
const menuEl = $('menu');
function buildMenu() {
  menuEl.replaceChildren();
  for (const a of ACTIONS) {
    const c = document.createElement('div');
    c.className = 'nt-act';
    const k1 = document.createElement('b');
    k1.textContent = a.keys[0];
    const or = document.createElement('i');
    or.textContent = 'hoặc';
    const k2 = document.createElement('b');
    k2.textContent = a.keys[1].toUpperCase();
    const t = document.createElement('span');
    t.textContent = `${a.emoji} ${a.label}`;
    c.append(k1, or, k2, t);
    menuEl.append(c);
  }
}
buildMenu();

function updateHud() {
  const now = Date.now();
  const snap = clock.snapshot(now);
  const phase = phaseAt(schedule, snap.minuteOfDay);
  const next = schedule[(phase.index + 1) % schedule.length];
  $('clock').textContent = formatHM(snap.minuteOfDay);
  $('phase').textContent = phase.label;
  $('next').textContent = `${next.label} lúc ${next.start} (còn ${Math.ceil(minutesToNextPhase(schedule, snap.minuteOfDay))}′)`;
  $('camp').textContent = formatThousands(campDays + campBonusDays);
  $('online').textContent = String(npcs.all.length + (streamer ? 1 : 0));
  $('viewers').textContent = String(viewers.size);

  // đại ca / cán bộ
  const r = events.roles();
  const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  const parts = [];
  if (r.boss) parts.push(`👑 Đại ca: ${r.boss.name} (${mmss(r.boss.left)})`);
  for (const g of r.guards.slice(0, 2)) parts.push(`👮 Cán bộ: ${g.name} (${mmss(g.left)})`);
  for (const j of r.jobs.slice(0, 3)) parts.push(`${j.emoji} ${j.title}: ${j.name} (${mmss(j.left)})`);
  $('roles').textContent = parts.join(' · ');
  $('roles').classList.toggle('hidden', parts.length === 0);

  // thẻ lượt chơi
  const card = $('spot');
  const cur = spot.current;
  card.classList.toggle('live', !!cur);
  card.classList.toggle('hidden', CFG.mode === 'off');
  $('menu').classList.toggle('hidden', !CFG.showMenu);
  const who = $('spot-who');
  who.replaceChildren();
  if (cur) {
    who.append(avatarEl(cur.name, cur.avatar, 'nt-av big'));
    const box = document.createElement('div');
    const n = document.createElement('div');
    n.className = 'nt-spot-name';
    n.textContent = cur.name;
    const s = document.createElement('div');
    s.className = 'nt-spot-sub';
    s.textContent = `🎥 Đang lên sóng · còn ${Math.ceil(spot.remaining(now))} giây`;
    box.append(n, s);
    who.append(box);
    const total = Math.max(1, (spot.deadline() - cur.startedAt) / 1000);
    $('spot-bar').style.width = `${Math.max(0, Math.min(100, (spot.remaining(now) / total) * 100))}%`;
    $('spot-tip').textContent = 'Bình luận 1 SỐ hoặc 1 CHỮ để ra lệnh (vd: gõ 1 hoặc gõ B = ném bóng):';
  } else {
    const t = document.createElement('div');
    t.className = 'nt-spot-name';
    t.textContent = CFG.mode === 'streamer' ? `🎮 ${CFG.streamerName || 'Streamer'} đang dạo trại` : '🎁 Tặng quà để lên sóng!';
    const s = document.createElement('div');
    s.className = 'nt-spot-sub';
    s.textContent = 'Bình luận để vào trại · tặng quà để được camera quay và điều khiển phạm nhân của bạn';
    const box = document.createElement('div');
    box.append(t, s);
    who.append(box);
    $('spot-bar').style.width = '0%';
    $('spot-tip').textContent = 'Khi tới lượt, bình luận 1 SỐ hoặc 1 CHỮ (vd: gõ 1 hoặc gõ B = ném bóng):';
  }
  const qEl = $('queue');
  qEl.replaceChildren();
  if (spot.queue.length) {
    const lab = document.createElement('span');
    lab.textContent = 'Chờ lượt:';
    qEl.append(lab);
    for (const q of spot.queue.slice(0, 6)) qEl.append(avatarEl(q.name, q.avatar));
    if (spot.queue.length > 6) {
      const more = document.createElement('span');
      more.textContent = `+${spot.queue.length - 6}`;
      qEl.append(more);
    }
  }

  // bảng TOP
  const top = Object.entries(board)
    .sort((a, b) => b[1].points - a[1].points)
    .slice(0, 5);
  const B = $('board');
  B.replaceChildren();
  top.forEach(([id, r], i) => {
    const row = document.createElement('div');
    row.className = 'nt-br';
    const rk = document.createElement('span');
    rk.className = 'rk';
    rk.textContent = ['🥇', '🥈', '🥉', '4', '5'][i];
    const nm = document.createElement('span');
    nm.className = 'nm';
    const live = viewers.get(id);
    const badge = live ? events.roleEmoji(live) : '';
    nm.textContent = badge ? `${badge} ${r.name}` : r.name;
    const pt = document.createElement('span');
    pt.className = 'pt';
    pt.textContent = formatThousands(r.points);
    row.append(rk, avatarEl(r.name, r.avatar), nm, pt);
    B.append(row);
  });
  $('board-wrap').classList.toggle('hidden', top.length === 0);
}

/** Bảng "🎁 Tặng quà để…" trên overlay — chỉ hiện các quà đã gán trong panel. */
function buildLegend() {
  const host = $('legend');
  if (!host) return;
  host.replaceChildren();
  const rows = [];
  for (const a of allGiftActions) for (const g of CFG.giftMap?.[a.id] || []) rows.push({ a, g });
  host.classList.toggle('hidden', !CFG.showGiftLegend || rows.length === 0);
  const h = document.createElement('h4');
  h.textContent = '🎁 Tặng quà để…';
  host.append(h);
  rows.sort((p, q) => (p.g.coins || 0) - (q.g.coins || 0));
  for (const { a, g } of rows.slice(0, 20)) {
    const row = document.createElement('div');
    row.className = 'nt-lg';
    if (g.giftImage && /^https?:/i.test(g.giftImage)) {
      const img = document.createElement('img');
      img.src = g.giftImage;
      img.referrerPolicy = 'no-referrer';
      img.alt = '';
      row.append(img);
    }
    else {
      const ph = document.createElement('span');
      ph.className = 'gi';
      ph.textContent = '🎁';
      row.append(ph);
    }
    const ac = document.createElement('span');
    ac.textContent = `→ ${a.emoji} ${a.label}`;
    row.append(ac);
    host.append(row);
  }
}

// ------------------------------------------------------------------ demo (người xem ảo) để thử khi chưa LIVE
function demoTick() {
  const name = pick(Math.random, DATA.demoNames);
  const user = { id: `demo_${name}`, name, avatar: '' };
  const cur = spot.current;
  const r = Math.random();
  if (cur && cur.id.startsWith('demo_') && r < 0.35) {
    const a = pick(Math.random, ACTIONS);
    onComment({ id: cur.id, name: cur.name, avatar: '' }, Math.random() < 0.5 ? a.keys[0] : a.keys[1].toUpperCase());
  } else if (r < 0.55) onComment(user, pick(Math.random, DATA.chat.free));
  else if (r < 0.75) onLike(user, 15);
  else if (r < 0.86) onGift(user, pick(Math.random, ['Hoa hồng', 'TikTok', 'Kem', 'Bắn tim']), 1, pick(Math.random, [1, 1, 5, 10, 30]), '');
  else if (r < 0.95) runGiftAction(pick(Math.random, DATA.giftActions).id, ensureViewer(user)); // demo cả vai trò + sự kiện
  else onSocial(user, 'follow');
}

// ------------------------------------------------------------------ vòng lặp chính
const npcCtx = {
  onShoot(n) {
    const rim = world.hoop.rim;
    const p = n.body.pos;
    n.ry = Math.atan2(rim.x - p.x, rim.z - p.z);
    const d = Math.hypot(rim.x - p.x, rim.z - p.z);
    const v = n.viewerRec;
    balls.shoot({ x: p.x, y: p.y + 1.7, z: p.z }, Math.random() < BallSystem.chanceFor(d) * (v ? 1 : 0.8), (ok) => {
      const near = cam.target.distanceTo(tmpV.set(p.x, p.y, p.z)) < 14;
      if (ok && near) sfx('swish');
      if (ok && v) {
        addPoints(v, actionById.ball.points, '🏀');
        n.mode = 'cheer';
        n.shootAnim = 1.2;
        chatLine('Hệ thống', `🏀 ${v.name} ném trúng rổ!`, 'system');
      }
    });
  },
  onSay(n, cat) {
    if (Math.random() > 0.35 || n.viewer) return;
    n.label.say(pick(Math.random, DATA.chat[cat] ?? DATA.chat.free));
  },
};

function npcChatter() {
  const pool = npcs.all.filter((n) => !n.viewer && dist2d(n.body.pos, cam.target) < 22);
  const speaker = pick(Math.random, pool.length ? pool : npcs.guards);
  if (!speaker) return;
  const cat = speaker.role === 'guard' ? 'guard' : currentPhase?.key ?? 'free';
  speaker.label.say(pick(Math.random, DATA.chat[cat] ?? DATA.chat.free));
}

/** Giữ tổng dân số ổn định: người xem vào thì bớt NPC, người xem đi thì bù NPC; dọn người xem im lặng lâu. */
function balancePopulation() {
  const now = Date.now();
  events.checkJail(viewers, now); // luật ngầm: im lặng quá lâu → biệt giam trên lầu
  for (const v of [...viewers.values()]) if (now - v.lastActive > 30 * 60000 && v.id !== spot.current?.id && !spot.queue.some((q) => q.id === v.id)) removeViewer(v);
  const fillers = npcs.inmates.filter((n) => !n.viewer);
  const target = Math.max(6, CFG.npcCount - viewers.size);
  if (fillers.length > target) {
    const f = fillers.find((n) => !n.locked && dist2d(n.body.pos, cam.target) > 12) ?? fillers.find((n) => !n.locked);
    if (f) npcs.removeInmate(f);
  } else if (fillers.length < target) {
    const used = new Set(npcs.inmates.map((n) => n.name));
    const name = DATA.names.find((x) => !used.has(x)) ?? pick(Math.random, DATA.names);
    npcs.addInmate({ name, x: range(Math.random, -1.6, 1.6), z: 12.6 });
  }
}

/** Mô phỏng một bước nhỏ (≤ 50 ms) — máy giật thì chạy nhiều bước để nhân vật không đi chậm như quay chậm. */
function simulate(dt) {
  npcs.update(dt, npcCtx);
  if (streamer) updateStreamer(dt);
  const actors = streamer ? npcs.all.concat(streamer) : npcs.all;
  separateActors(actors);
  balls.update(dt, (pos) => {
    if (cam.target.distanceTo(pos) < 12) sfx('bounce');
  });
  return actors;
}

let lastFrame = performance.now();
function frame(nowPerf) {
  const rawDt = Math.min(0.25, Math.max(0, (nowPerf - lastFrame) / 1000));
  const steps = Math.max(1, Math.ceil(rawDt / 0.05));
  const dt = rawDt / steps;
  lastFrame = nowPerf;
  const now = Date.now();
  const snap = clock.snapshot(now);
  const phase = phaseAt(schedule, snap.minuteOfDay);
  if (phase !== currentPhase) onPhaseChange(phase, currentPhase === null);
  if (lastDay === null) lastDay = snap.day;
  else if (snap.day > lastDay) {
    onNewDay(snap.day - lastDay);
    lastDay = snap.day;
  }

  // lượt chơi
  const t = spot.tick(now);
  if (t.ended) endTurn(t.ended);
  if (t.started) beginTurn(t.started);
  const cur = spot.current && viewers.get(spot.current.id);
  // người đang giữ chức vụ (Đại Ca, Cán Bộ, Đầu Bếp…) thì cứ làm việc của chức vụ, không tự đổi nhiệm vụ
  const hasRole = cur && (cur.npc.isBoss || cur.npc.jobRole || cur.guardRole);
  if (cur && !hasRole && CFG.idleAuto > 0 && now - cur.lastCmdAt > CFG.idleAuto * 1000 && !cur.npc.locked) {
    cur.lastCmdAt = now;
    doAction(cur.npc, pick(Math.random, ACTIONS.filter((a) => a.id !== 'sleep')).id, cur); // tự chơi khi người xem im lặng
  }

  if (CFG.mode === 'streamer') ensureStreamer();
  else dropStreamer();
  let actors = null;
  for (let i = 0; i < steps; i++) actors = simulate(dt);
  for (const a of actors) syncActor(a);
  events.update(rawDt);

  dirtT -= rawDt * (phase.key === 'work' ? 2.5 : 1);
  if (dirtT <= 0) {
    dirtT = T.dirtSpawnSec;
    dirt.spawn();
  }
  chatT -= rawDt;
  if (chatT <= 0) {
    chatT = range(Math.random, T.chatIntervalSec[0], T.chatIntervalSec[1]);
    if (phase.key !== 'sleep' || Math.random() < 0.3) npcChatter();
  }
  if (demo) {
    demoT -= rawDt;
    if (demoT <= 0) {
      demoT = range(Math.random, 1.2, 3.5);
      demoTick();
    }
  }
  fillerT -= rawDt;
  if (fillerT <= 0) {
    fillerT = 1;
    balancePopulation();
  }

  nightF += ((phase.key === 'sleep' || events.isNight() ? 1 : 0) - nightF) * Math.min(1, rawDt * 1.5);
  world.setNight(nightF);
  updateCamera(rawDt);
  renderer.render(scene, camera);
  labelLayer.render(camera, window.innerWidth, window.innerHeight, rawDt);

  hudT -= rawDt;
  if (hudT <= 0) {
    hudT = 0.2;
    updateHud();
  }
  saveT -= rawDt;
  if (saveT <= 0) {
    saveT = 15;
    lsSet('nt_clock', { total: snap.total });
    lsSet('nt_bonus_days', campBonusDays);
    lsSet('nt_camp_days', campDays);
    const keep = Object.entries(board).sort((a, b) => b[1].points - a[1].points).slice(0, 200);
    lsSet('nt_board', Object.fromEntries(keep));
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ HP Action LIVE: cấu hình + sự kiện qua socket.io
function applyServerConfig(c) {
  if (!c || typeof c !== 'object') return;
  const num = (v, d, lo, hi) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Math.min(hi, Math.max(lo, Number(v))) : d);
  if (['auto', 'streamer', 'off'].includes(c.ntMode)) CFG.mode = c.ntMode;
  if (typeof c.ntStreamerName === 'string') CFG.streamerName = c.ntStreamerName.trim().slice(0, 24) || 'Streamer';
  CFG.turnBase = num(c.ntTurnBase, CFG.turnBase, 5, 300);
  CFG.turnPerCoin = num(c.ntTurnPerCoin, CFG.turnPerCoin, 0, 60);
  CFG.turnMax = num(c.ntTurnMax, CFG.turnMax, 5, 1800);
  CFG.minTurn = num(c.ntMinTurn, CFG.minTurn, 3, 300);
  CFG.queueMax = num(c.ntQueueMax, CFG.queueMax, 1, 200);
  CFG.idleAuto = num(c.ntIdleAuto, CFG.idleAuto, 0, 120);
  CFG.maxViewers = num(c.ntMaxViewers, CFG.maxViewers, 5, 120);
  CFG.npcCount = num(c.ntNpcCount, CFG.npcCount, 6, 80);
  CFG.likePerDay = num(c.ntLikePerDay, CFG.likePerDay, 0, 100000);
  const minuteMs = num(c.ntMinuteMs, CFG.minuteMs, 100, 60000);
  if (minuteMs !== clock.msPerGameMinute) {
    const total = clock.snapshot(Date.now()).total; // đổi tốc độ không làm giờ trại nhảy
    clock.msPerGameMinute = minuteMs;
    clock.startMinute = total;
    clock.epochMs = Date.now();
    clock.skipMinutes = 0;
  }
  CFG.minuteMs = minuteMs;
  CFG.preempt = c.ntPreempt !== false;
  CFG.sound = c.ntSound !== false;
  CFG.music = c.ntMusic === true;
  CFG.anyoneAct = c.ntAnyoneAct === true;
  CFG.joinOnComment = c.ntJoinOnComment !== false;
  CFG.showMenu = c.ntShowMenu !== false;
  CFG.giftMap = c.ntGiftMap && typeof c.ntGiftMap === 'object' ? c.ntGiftMap : {};
  CFG.bossSec = num(c.ntBossSec, CFG.bossSec, 20, 3600);
  CFG.guardSec = num(c.ntGuardSec, CFG.guardSec, 20, 3600);
  CFG.jobSec = num(c.ntJobSec, CFG.jobSec, 20, 3600);
  CFG.bossFollowers = num(c.ntBossFollowers, CFG.bossFollowers, 0, 8);
  CFG.jailIdleSec = num(c.ntJailIdleSec, CFG.jailIdleSec, 0, 7200);
  CFG.bossCoins = num(c.ntBossCoins, CFG.bossCoins, 0, 100000);
  CFG.guardCoins = num(c.ntGuardCoins, CFG.guardCoins, 0, 100000);
  CFG.joinOnLike = c.ntJoinOnLike !== false;
  CFG.showGiftLegend = c.ntShowGiftLegend !== false;
  buildLegend();
  spot.setOptions({ base: CFG.turnBase, perCoin: CFG.turnPerCoin, max: CFG.turnMax, queueMax: CFG.queueMax, minTurn: CFG.minTurn, preempt: CFG.preempt });
  if (streamer) streamer.label.setName(CFG.streamerName);
  if (CFG.sound || CFG.music) audio.init();
  audio.setSfx(CFG.sound);
  audio.setMusic(CFG.music);
  document.body.style.visibility = c.enabled === false ? 'hidden' : '';
}
spot.setOptions({ base: CFG.turnBase, perCoin: CFG.turnPerCoin, max: CFG.turnMax, queueMax: CFG.queueMax, minTurn: CFG.minTurn, preempt: CFG.preempt });
audio.musicOn = CFG.music;

function appUser(d) {
  return { id: String(d.uniqueId || d.userId || d.nickname || 'khach'), name: cleanText(d.nickname || d.uniqueId || 'Khách', 24) || 'Khách', avatar: d.profilePicture || '' };
}

function onAppCmd(d) {
  if (!d || d.gameId !== 'nhatu') return;
  const p = d.payload || {};
  if (d.cmd === 'demo') demo = !!p.on;
  else if (d.cmd === 'skip') {
    const r = spot.skip(Date.now());
    if (r.ended) endTurn(r.ended);
    if (r.started) beginTurn(r.started);
  } else if (d.cmd === 'act' && typeof p.action === 'string') {
    if (CFG.mode === 'streamer' && streamer) streamerAction(p.action);
    else commandSpotlight(p.action);
  } else if (d.cmd === 'reset') {
    events.reset();
    spot.clear();
    for (const v of [...viewers.values()]) removeViewer(v);
    for (const k of Object.keys(board)) delete board[k];
    campBonusDays = 0;
    lsSet('nt_board', {});
    lsSet('nt_bonus_days', 0);
    banner('🧹 Đã làm mới trại');
  } else if (d.cmd === 'test') {
    const name = p.name || pick(Math.random, DATA.demoNames);
    const u = { id: `test_${name}`, name, avatar: '' };
    if (p.kind === 'action' && typeof p.action === 'string') {
      const v = ensureViewer(u);
      runGiftAction(p.action, v);
    } else if (p.kind === 'comment') onComment(u, p.text || pick(Math.random, DATA.chat.free));
    else if (p.kind === 'like') onLike(u, 20);
    else if (p.kind === 'follow') onSocial(u, 'follow');
    else onGift(u, p.giftName || 'Hoa hồng', 1, Number(p.coins) || 1, p.giftId || '');
  }
}

if (typeof window.io === 'function') {
  const socket = window.io({ reconnection: true, reconnectionDelay: 600, reconnectionDelayMax: 5000 });
  socket.on('connect', async () => {
    try {
      const r = await fetch('/api/games/nhatu/config');
      if (r.ok) applyServerConfig(await r.json());
    } catch {
      /* chạy tiếp với cấu hình mặc định */
    }
    socket.emit('subscribe', 'overlay');
  });
  socket.on('gameConfig', (d) => d && d.gameId === 'nhatu' && applyServerConfig(d.config));
  socket.on('overlay:reload', (d) => {
    if (!d || !d.gameId || d.gameId === 'nhatu') location.reload();
  });
  socket.on('gameDisabled', (d) => {
    if (d && d.gameId === 'nhatu') document.body.style.visibility = 'hidden';
  });
  socket.on('gameEnabled', (d) => {
    if (d && d.gameId === 'nhatu') document.body.style.visibility = '';
  });
  socket.on('gift', (g) => g && onGift(appUser(g), g.giftName || 'Quà', Math.max(1, Number(g.repeatCount) || 1), Number(g.coinValue || g.diamondCount || 1), g.giftId));
  socket.on('chat', (c) => c && onComment(appUser(c), c.comment || ''));
  socket.on('like', (l) => l && onLike(appUser(l), Math.max(1, Number(l.likeCount) || 1)));
  socket.on('social', (d) => {
    if (!d) return;
    const t = String(d.label || '');
    if (/theo dõi|follow/i.test(t)) onSocial(appUser(d), 'follow');
    else if (/chia sẻ|share/i.test(t)) onSocial(appUser(d), 'share');
  });
  socket.on('gameCmd', onAppCmd);
  socket.on('nhatu:key', (k) => {
    if (!k || typeof k.code !== 'string') return;
    if (k.down) keyDown(k.code);
    else keyUp(k.code);
  });
}

// thử trong trình duyệt: ?demo=1 · ?mode=streamer
if (['auto', 'streamer'].includes(Q.get('mode'))) CFG.mode = Q.get('mode');
window.__nhatu = {
  CFG, spot, viewers, npcs, onGift, onComment, onLike, doAction, renderer, scene,
  /** gỡ lỗi: tua nhanh mô phỏng `sec` giây không cần vẽ (khi tab bị ẩn requestAnimationFrame dừng) */
  advance(sec) {
    for (let t = 0; t < sec; t += 0.05) {
      const r = spot.tick(Date.now());
      if (r.ended) endTurn(r.ended);
      if (r.started) beginTurn(r.started);
      for (const a of simulate(0.05)) syncActor(a);
      events.update(0.05);
    }
  },
};
