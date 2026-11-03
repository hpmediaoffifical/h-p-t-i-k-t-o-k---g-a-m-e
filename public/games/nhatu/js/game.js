/**
 * ⛓️ Nhà Tù Online — overlay OBS /overlay/nhatu (HP Action LIVE).
 *
 * Trại giam 3D chibi sống theo lịch trại (điểm danh, ăn, lao động, giờ tự do, ngủ) với NPC + người xem LIVE.
 *  - Người xem bình luận / thả tim / follow → vào trại thành phạm nhân mang tên + avatar TikTok.
 *  - Chế độ TỰ CHƠI (auto): ai tặng quà được 1 lượt — camera bám theo, bình luận mã (1/B, 2/L…) để ném bóng,
 *    lau sàn, ăn cơm… Im lặng quá ntIdleAuto giây thì nhân vật tự làm. Quà tiếp theo chuyển lượt sang người khác.
 *    Không ai tặng quà → camera tự lia quanh trại. Treo máy cả buổi không cần người trực.
 *  - Chế độ STREAMER: streamer tự đi lại bằng phím (cửa sổ game hoặc bàn phím ảo trong app, relay 'nhatu:key').
 *  - 🎯 Mỗi phạm nhân có MÃ SỐ TÙ NHÂN riêng (trên áo + bảng tên). Quà chơi khăm (thùng rác, trò đùa, vật tay…)
 *    chờ ntTargetSec giây để người tặng bình luận mã số người muốn nhắm; im lặng → ⚔️ trả thù hoặc ngẫu nhiên.
 *  - 🏠 Phòng = đội: bình luận P1…P6 chọn phòng, cả phòng thi đua bằng tim / bình luận / chia sẻ / quà theo vòng.
 * Cấu hình: GET /api/games/nhatu/config (khoá nt*). Lệnh panel: gameCmd {gameId:'nhatu'}.
 */
import * as THREE from 'three';
import { buildWorld, HALL } from './world.js';
import { animateCharacter, disposeCharacter } from './character.js';
import { NpcManager, makeActor, syncActor, turnToward, separateActors } from './npc.js';
import { BallSystem, DirtSystem } from './effects.js';
import { AudioFx } from './audio.js';
import { LabelLayer, setLabelLayer } from './labels.js';
import { GameClock, compileSchedule, phaseAt, parseHM, formatHM, minutesToNextPhase } from './logic/clock.js';
import { stepBody } from './logic/physics.js';
import { mulberry32, pick, range } from './logic/rng.js';
import { formatThousands, cleanText } from './logic/format.js';
import { SpotlightQueue, parseActionCode, stripVN } from './logic/spotlight.js';
import { TARGETED, HOSTILE, parsePrisonerNumbers, matchTargets, TargetWindows, Grudges } from './logic/target.js';
import { Interest, CameoQueue } from './logic/cameo.js';
import { parseRoomCode, leastCrowdedRoom, RoomRace, ROOM_POINTS, COMMENT_COOLDOWN_MS, SWITCH_COOLDOWN_MS } from './logic/rooms.js';
import { createEvents } from './events.js';
import { pickEvictee, turnHolderIds, SwapBudget } from './logic/population.js';
import { comboPower } from './logic/live.js';

const Q = new URLSearchParams(location.search);
/** ?mode= trên link luôn thắng cấu hình app (thử nhanh: ?mode=streamer, ?mode=off). */
const URL_MODE = ['auto', 'streamer', 'off'].includes(Q.get('mode')) ? Q.get('mode') : null;
const LOW = Q.get('q') === 'low';
const FRAME_MS = 1000 / (Number(Q.get('fps')) || (LOW ? 30 : 60));
const DATA = await fetch('/games/nhatu/data.json').then((r) => r.json());
const T = DATA.tuning;
const ACTIONS = DATA.actions;
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ cấu hình (ghi đè bằng config nt* từ app)
const CFG = {
  mode: 'auto',
  streamerName: 'Streamer',
  turnBase: 6, // lượt lên sóng ngắn: mỗi người tặng quà được camera bám vài giây rồi chuyển người kế
  turnPerCoin: 0.5,
  turnMax: 30,
  minTurn: 4,
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
  commentPlay: false, // bình luận 1/B… ra lệnh (tắt = chỉ chơi bằng quà, bảng dưới gọn)
  offenseJailSec: 180, // 💩 💦 đi bậy bị bắt → giam bấy nhiêu giây
  trashSec: 60, // 🗑️ kẹt trong thùng rác bấy nhiêu giây
  prankSec: 120, // 💇 👗 trò đùa đổi đầu / đổi đồ giữ bấy nhiêu giây
  likeEvent: 1000, // ❤️ cả phòng đủ bấy nhiêu tim → 1 sự kiện vui (0 = tắt)
  autoEvents: true, // trại vắng quà > 3 phút → thỉnh thoảng mưa / chuột chạy qua cho LIVE treo máy sinh động
  pkTug: true, // 🪢 PK → kéo co giữa sân, thua PK vào thùng rác
  targetSec: 15, // 🎯 quà chơi khăm: bấy nhiêu giây để bình luận MÃ SỐ tù nhân người muốn nhắm; hết giờ → bốc ngẫu nhiên (0 = ngẫu nhiên ngay)
  revengeSec: 60, // ⚔️ bị chơi khăm → trong bấy nhiêu giây gõ đúng mã số kẻ đó khi tặng quà chơi khăm = trả thù (+5)
  rooms: 6, // 🏠 phòng = đội P1…P6, thi đua theo vòng (0 = tắt)
  roomRoundMin: 5, // mỗi vòng thi đua phòng bấy nhiêu phút
};

// ------------------------------------------------------------------ renderer
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = LOW ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 160);
const labelLayer = new LabelLayer($('labels'));
setLabelLayer(labelLayer);
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // ngân sách điểm ảnh ~2,2 triệu (OBS 1080×1920); ?q=low giảm còn 1 triệu cho máy yếu
  const budget = LOW ? 1.0e6 : 2.2e6;
  renderer.setPixelRatio(Math.max(0.5, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(budget / Math.max(1, w * h)))));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 62 : 50; // khung dọc 9:16 cần góc rộng hơn
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ thế giới + hệ thống
const world = buildWorld(scene, { low: LOW });
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
const swapBudget = new SwapBudget({ perSec: 3, burst: 6 }); // trại đầy: tối đa ~3 người thay ra/vào mỗi giây (quà không bị giới hạn)
const targets = new TargetWindows({ sec: CFG.targetSec }); // 🎯 quà chơi khăm đang chờ người tặng bình luận mã số tù nhân
const grudges = new Grudges({ sec: CFG.revengeSec }); // ⚔️ ai vừa bị ai chơi khăm
const interest = new Interest({ halfLifeSec: 90 }); // 🎥 camera đi dạo: ai tương tác nhiều được ghé nhiều
const cameos = new CameoQueue({ max: 6, ttlSec: 90 }); // 🎥 người chia sẻ / theo dõi được camera ghé riêng
const roomRace = new RoomRace({ rooms: CFG.rooms, roundSec: CFG.roomRoundMin * 60 }); // 🏠 thi đua phòng
const teamCells = world.cells.filter((c) => c.level === 0); // P1 = phòng A-01, P2 = A-02…
const SIGNUP_RE = /^(tham gia|thamgia|tg|join|dang ky|dangky|dk)(?![a-z])/; // ✋ đăng ký trò tập thể (đã bỏ dấu)

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
const numMemo = lsGet('nt_numbers', {}); // id người xem → mã số tù nhân đã mang (giữ nguyên số qua các buổi LIVE)
let campBonusDays = lsGet('nt_bonus_days', 0);
// "Toàn trại đã gạch" chỉ tăng: cộng dồn mỗi ngày trại theo số phạm nhân (NPC rời trại không làm tụt số)
let campDays = lsGet('nt_camp_days', 0) || npcs.inmates.reduce((a, n) => a + n.days, 0);
let likeAcc = 0;
let likeEvt = 0; // ❤️ đếm tới CFG.likeEvent
let lastGiftAt = Date.now();
let autoT = 240; // giây tới sự kiện tự chạy kế tiếp (khi trại vắng quà)
const combos = new Map(); // `${người}|${quà}` → {n, at}: combo quà (logic/live.js)

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
function flash() {
  const el = $('flash');
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}
// Banner xếp hàng: 1 món quà thường bật 2–3 banner cùng lúc (🔥 combo → hành động → 🎥 lượt của…) — hiện lần lượt
// ~1,6 giây mỗi cái thay vì cái sau đè mất cái trước. Giữ tối đa 3 cái chờ, bỏ cái trùng liền kề.
const bannerQ = [];
let bannerT = 0;
function banner(text) {
  if (bannerQ[bannerQ.length - 1] === text) return;
  if (bannerQ.length >= 3) bannerQ.shift();
  bannerQ.push(text);
}
function flushBanner(dt) {
  bannerT -= dt;
  if (bannerT > 0 || !bannerQ.length) return;
  const el = $('banner');
  el.textContent = bannerQ.shift();
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  bannerT = 1.6;
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
const hasRole = (v) => !!(v.guardRole || v.npc?.isBoss || v.npc?.jobRole);

/**
 * Đưa người xem vào trại (hoặc cập nhật nếu đã có).
 * Trại đầy: người mới chỉ vào được khi có người nhường chỗ (không bao giờ là người đang lên sóng / đang chờ lượt).
 *  - 'like'  : thả tim không đẩy ai ra (phòng đông thả tim liên tục → nhân vật bị thay ra vào không ngớt).
 *  - 'comment' / 'social': đẩy được, nhưng tối đa ~3 người/giây (swapBudget).
 *  - 'gift' / 'turn': luôn vào; ai cũng đang giữ/chờ lượt thì trại tạm vượt trần.
 * @param {{id:string, name:string, avatar?:string}} user
 * @param {'gift'|'turn'|'comment'|'social'|'like'} how
 * @returns {object|null} null = chưa vào được trại
 */
function ensureViewer(user, how = 'gift') {
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
    const force = how === 'gift' || how === 'turn';
    if (how === 'like') return null;
    const victim = pickEvictee(viewers.values(), turnHolderIds(spot), hasRole);
    if (!victim && !force) return null;
    if (!force && !swapBudget.take(now)) return null;
    if (victim) removeViewer(victim);
  }
  const saved = board[user.id];
  const npc = npcs.addInmate({ name: user.name, avatar: user.avatar, kind: 'viewer', number: numMemo[user.id], x: range(Math.random, -1.6, 1.6), z: 12.6, days: 0 });
  npc.viewer = true;
  v = { id: user.id, name: user.name, avatar: user.avatar, npc, points: saved?.points ?? 0, lastActive: now, lastCmdAt: now, lastLikeBubble: 0, lastAct: 0, team: 0 };
  npc.viewerRec = v;
  viewers.set(user.id, v);
  delete numMemo[user.id]; // ghi lại ở cuối: cắt bớt sổ thì bỏ người lâu không vào nhất
  numMemo[user.id] = npc.number;
  if (CFG.rooms) setTeam(v, leastCrowdedRoom(CFG.rooms, teamCounts()));
  npc.label.say(pick(Math.random, DATA.chat.joined));
  noteJoin(`${user.name} (#${npc.number})`, v.team ? `P${v.team}` : npc.room.id);
  return v;
}

// Gom thông báo nhập trại: phòng đông vào dồn dập thì 1 dòng "A, B và N người khác…" thay vì đẩy trôi bình luận thật.
const joins = { names: [], room: null, t: 0 };
function noteJoin(name, room) {
  if (!joins.names.length) {
    joins.t = 1.2;
    joins.room = room;
  }
  joins.names.push(name);
}
function flushJoins(dt) {
  if (!joins.names.length) return;
  joins.t -= dt;
  if (joins.t > 0) return;
  const n = joins.names.length;
  const text = n === 1 ? `${joins.names[0]} đã nhập trại! Phòng ${joins.room}.` : `${joins.names.slice(0, 2).join(', ')}${n > 2 ? ` và ${n - 2} người khác` : ''} đã nhập trại!`;
  chatLine('Hệ thống', text, 'system');
  joins.names = [];
}

// ------------------------------------------------------------------ 🏠 phòng = đội
/** Đưa người xem vào phòng-đội `no` (P1 = phòng A-01…): ngủ ở phòng đó, mã số tù nhân đổi màu theo phòng. 0 = bỏ đội. */
function setTeam(v, no) {
  v.team = no;
  const cell = teamCells[no - 1];
  if (cell) v.npc.room = cell;
  v.npc.label.setTeam(no);
}
function teamCounts() {
  const m = new Map();
  for (const x of viewers.values()) if (x.team) m.set(x.team, (m.get(x.team) ?? 0) + 1);
  return m;
}
/** Bình luận "P3" → đổi sang phòng 3 (1 lần / phút). */
function chooseRoom(v, no) {
  const now = Date.now();
  if (v.team === no) return v.npc.label.say(`Đang ở phòng P${no} rồi!`, 2);
  if (now - (v.teamAt ?? 0) < SWITCH_COOLDOWN_MS) return v.npc.label.say('Chờ chút nữa mới đổi phòng được!', 2);
  v.teamAt = now;
  setTeam(v, no);
  v.npc.label.say(`🏠 Vào phòng P${no}!`, 2.5);
  sfx('pop');
}
function roomScore(v, pts) {
  if (CFG.rooms && v?.team) roomRace.add(v.team, pts);
}
/** Hết vòng thi đua: phòng nhất ra bàn ăn tiệc, mỗi người +10. */
function roomRoundEnd(res) {
  if (!res.winner) return;
  const members = [...viewers.values()].filter((x) => x.team === res.winner);
  banner(`🏆 Phòng P${res.winner} thắng vòng thi đua! Cả phòng ăn tiệc!`);
  chatLine('Hệ thống', `🏆 Phòng P${res.winner} nhất vòng (${formatThousands(Math.round(res.score))} điểm) — mỗi người +10! Bình luận P1…P${CFG.rooms} để đổi phòng.`, 'gift');
  sfx('coin');
  for (const x of members) addPoints(x, 10, '🏆');
  if (members.length) events.roomFeast(members.map((x) => x.npc));
}

/** ✋ Bình luận "tham gia" → được ưu tiên chọn vào trò tập thể kế tiếp (thi chạy, kéo co PK, vật tay) trong 5 phút. */
function signup(v) {
  v.signupUntil = Date.now() + 5 * 60000;
  v.npc.label.say('✋ Cho tui chơi với!', 2.5);
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
  if (n.carried) return false;
  if (events.isOffender(n.viewerRec)) {
    n.label.say('🔒 Đang bị giam…', 2);
    return false;
  }
  npcs.release(n);
  const award = () => v && addPoints(v, a.points, a.emoji);
  switch (id) {
    case 'ball': {
      const s = pick(Math.random, world.courtSpots);
      npcs.command(n, { dest: { level: 0, x: s.x + range(Math.random, -0.5, 0.5), z: s.z + range(Math.random, -0.5, 0.5) }, mode: 'idle', stay: 3.5, shoot: true });
      break;
    }
    case 'mop': {
      if (v && events.cleanJob(n, v)) break; // còn bãi bẩn (đi bậy) → dọn bãi trước: điểm cống hiến cao
      let s = dirt.spots.filter((d) => !d.claimed).sort((p, q) => dist2d(p, n.body.pos) - dist2d(q, n.body.pos))[0];
      if (!s) s = dirt.spawn() ?? dirt.spots[0];
      if (!s) return false;
      s.claimed = n;
      npcs.command(n, {
        dest: { level: 0, x: s.x, z: s.z },
        mode: 'mop',
        stay: 2.5,
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
      npcs.command(n, { dest: { level: 0, x: seat.approach.x, z: seat.approach.z }, seat, mode: 'eat', stay: 4, done: award });
      break;
    }
    case 'gym': {
      const s = pick(Math.random, world.rollcallSpots);
      npcs.command(n, { dest: { level: 0, ...s }, mode: 'exercise', stay: 4, ry: -Math.PI / 2, done: award });
      break;
    }
    case 'dance':
      npcs.command(n, { inPlace: true, mode: 'cheer', stay: 3, done: award });
      break;
    case 'sleep': {
      const room = n.room;
      const bed = room.beds.find((b) => !b.occupant || b.occupant === n);
      if (bed) bed.occupant = n;
      npcs.command(n, {
        dest: { level: room.level, cell: room },
        seat: bed ? { ...bed, approach: room.inside, ref: bed } : undefined,
        mode: bed ? 'sleep' : 'idle',
        stay: 4,
        then: () => n.label.say('Zzz...', 3),
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
        stay: 2.5,
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
const events = createEvents({ scene, world, npcs, DATA, CFG, viewers, chatLine, banner, sfx, addPoints, doAction, spot, dirt, camera, flash, onHit });
const allGiftActions = ACTIONS.map((a) => ({ ...a, group: 'task' })).concat(DATA.giftActions || []);
const giftDefs = Object.fromEntries(allGiftActions.map((a) => [a.id, a]));

/**
 * Kích hoạt một hành động quà (nhiệm vụ, vai trò hoặc sự kiện) cho người xem. power = combo (1–3).
 * hits = người bị chỉ định bằng mã số tù nhân (null = bốc ngẫu nhiên như cũ).
 */
function runGiftAction(id, v, power = 1, hits = null) {
  if (events.trigger(id, v, power, hits)) return true;
  if (actionById[id] && events.isOffender(v)) events.bailOut(v); // quà nhiệm vụ lúc đang bị giam → được thả, vẫn phải dọn
  return doAction(v.npc, id, v);
}

// ------------------------------------------------------------------ 🎯 chỉ định người bằng mã số tù nhân + ⚔️ trả thù
/** Quà chơi khăm: mở cửa sổ ntTargetSec giây chờ người tặng bình luận mã số tù nhân. Quà cùng loại tới tiếp → gộp combo. */
function openTarget(action, v, power = 1) {
  const { merged } = targets.open({ gifterId: v.id, action, power, v }, Date.now());
  if (merged) return;
  const a = giftDefs[action];
  v.npc.label.say('🎯 Chọn ai đây? Bình luận mã số!', 3);
  chatLine('Hệ thống', `🎯 ${v.name}: bình luận MÃ SỐ tù nhân để ${a.emoji} ${a.label.toLowerCase()} (${CFG.targetSec} giây)`, 'gift');
}

/** Người tặng bình luận mã số (vd "4823", "#4823 5120") → chạy quà đang chờ vào đúng người đó. */
const TARGET_MAX = { armwrestle: 1, bail: 1, report: 1 };
function pickTargets(v, nums) {
  for (const w of targets.of(v.id)) {
    const max = TARGET_MAX[w.action] ?? (w.action === 'lixi' ? 3 * Math.min(3, w.power) : Math.min(3, w.power));
    const r = matchTargets(nums, (no) => npcs.byNo(no), { exclude: v.npc, max, usable: (a) => !events.targetIssue(a, w.action) });
    if (!r.hits.length) {
      const no = r.busy[0] ?? r.missing[0];
      const why = no === v.npc.number ? 'là chính bạn' : r.busy.length ? events.targetIssue(npcs.byNo(no), w.action) : 'không có trong trại';
      v.npc.label.say(`#${no} ${why} — chọn số khác!`, 2.5);
      continue;
    }
    targets.close(w);
    v.npc.label.say(`🎯 #${r.hits.map((h) => h.number).join(', #')}!`, 2);
    runGiftAction(w.action, v, w.power, r.hits);
  }
  sfx('pop');
}

/** Hết giờ mà chưa gõ mã số (gõ không kịp / đã rời trại) → bốc 1 người ngẫu nhiên; người tặng đã rời thì đàn em làm hộ. */
function expireTargets(now) {
  for (const w of targets.expired(now)) runGiftAction(w.action, viewers.get(w.gifterId) ?? w.v, w.power, null);
}

/** Trò chơi khăm của `v` trúng `victim`: trả thù thành công → thưởng; ghi sổ để nạn nhân được trả thù lại. */
function onHit(v, victim) {
  const rv = victim?.viewerRec;
  if (!v || !rv || rv === v) return;
  const now = Date.now();
  if (grudges.peek(v.id, now) === rv.id) {
    grudges.clear(v.id);
    banner(`⚔️ ${v.name} TRẢ THÙ ${rv.name}!`);
    addPoints(v, 5, '⚔️');
  }
  if (CFG.revengeSec <= 0) return;
  grudges.record(rv.id, v.id, now);
  chatLine('Hệ thống', `⚔️ ${rv.name}: tặng quà + gõ #${v.npc.number} trong ${CFG.revengeSec} giây để trả thù ${v.name}!`, 'gift');
}

// ------------------------------------------------------------------ sự kiện LIVE
function onComment(user, text) {
  const clean = cleanText(text, 120);
  if (!clean) return;
  const now = Date.now();
  const v = CFG.joinOnComment || viewers.has(user.id) ? ensureViewer(user, 'comment') : null;
  chatLine(user.name, clean, v && spot.current?.id === user.id ? 'spot' : 'viewer');
  if (!v) return;
  interest.bump(v.id, 'comment', now);
  if (now - (v.roomCmtAt ?? 0) > COMMENT_COOLDOWN_MS) {
    v.roomCmtAt = now;
    roomScore(v, ROOM_POINTS.comment);
  }
  // 🎯 đang chờ chọn người để chơi khăm → bình luận mã số tù nhân
  if (targets.of(v.id).length) {
    const nums = parsePrisonerNumbers(clean);
    if (nums.length) return pickTargets(v, nums);
  }
  const room = CFG.rooms ? parseRoomCode(clean, CFG.rooms) : null;
  if (room) return chooseRoom(v, room);
  if (SIGNUP_RE.test(stripVN(clean).trim())) return signup(v);
  const code = parseActionCode(clean, ACTIONS);
  const isTurn = spot.current?.id === user.id;
  if (code && CFG.commentPlay && (isTurn || (CFG.anyoneAct && now - v.lastAct > 8000))) {
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
  likeEvt += count;
  if (CFG.likeEvent > 0 && likeEvt >= CFG.likeEvent) {
    likeEvt = 0;
    events.likeEvent(formatThousands(CFG.likeEvent));
  }
  while (CFG.likePerDay > 0 && likeAcc >= CFG.likePerDay) {
    likeAcc -= CFG.likePerDay;
    campBonusDays += 1;
    banner('❤️ Thả tim đủ — cả trại gạch thêm 1 ngày!');
    sfx('coin');
  }
  if (!CFG.joinOnLike && !viewers.has(user.id)) return;
  const v = ensureViewer(user, 'like'); // thả tim = vào trại làm tù nhân (và được thả nếu đang bị nhốt)
  if (!v) return;
  interest.bump(v.id, 'like', Date.now());
  roomScore(v, count * ROOM_POINTS.like);
  if (Date.now() - v.lastLikeBubble > 4000) {
    v.lastLikeBubble = Date.now();
    v.npc.label.say('❤️', 1.5);
  }
}

function onSocial(user, kind) {
  const v = ensureViewer(user, 'social');
  if (!v) {
    chatLine('Hệ thống', kind === 'follow' ? `${user.name} đã theo dõi!` : `${user.name} đã chia sẻ LIVE!`, 'system');
    return;
  }
  addPoints(v, kind === 'follow' ? 5 : 3, kind === 'follow' ? '➕' : '↗️');
  chatLine('Hệ thống', kind === 'follow' ? `${user.name} đã theo dõi — được thưởng điểm!` : `${user.name} đã chia sẻ LIVE!`, 'system');
  doAction(v.npc, 'dance', null);
  const now = Date.now();
  interest.bump(v.id, kind, now);
  cameos.push(v.id, kind, now); // 🎥 lúc không ai có lượt quà: camera ghé riêng + lời cảm ơn
  roomScore(v, ROOM_POINTS[kind]);
}

function giftActionFor(giftId) {
  const id = String(giftId ?? '');
  if (!id) return null;
  for (const [action, list] of Object.entries(CFG.giftMap || {})) if ((list || []).some((g) => String(g.giftId) === id)) return action;
  return null;
}

function onGift(user, giftName, count, coinEach, giftId) {
  const v = ensureViewer(user, 'gift');
  const coins = Math.max(1, coinEach) * Math.max(1, count);
  addPoints(v, coins, '🎁');
  chatLine('Hệ thống', `${user.name} tặng ${count > 1 ? `${count}× ` : ''}${giftName}`, 'gift');
  sfx('coin');
  lastGiftAt = Date.now();
  const mapped = giftActionFor(giftId);
  const combo = comboPower(combos, `${v.id}|${giftId || giftName}`, count, Date.now());
  roomScore(v, coins * ROOM_POINTS.coin);
  events.duelGift(v, coins); // 💪 đang vật tay → gồng sức
  events.tugGift(v); // 🪢 đang PK → vào dây kéo co đội mình
  if (mapped && combo.power >= 2) {
    banner(`🔥 COMBO ×${combo.n} — ${v.name}!`);
    const p = v.npc.body.pos;
    events.burst(p.x, p.y + 4, p.z);
  }
  // 🎯 quà chơi khăm chờ người tặng bình luận mã số tù nhân; quà khác chạy ngay
  if (mapped && TARGETED.has(mapped) && CFG.targetSec > 0) openTarget(mapped, v, combo.power);
  else if (mapped) runGiftAction(mapped, v, combo.power);
  else if (CFG.bossCoins > 0 && coins >= CFG.bossCoins) runGiftAction('boss', v);
  else if (CFG.guardCoins > 0 && coins >= CFG.guardCoins) runGiftAction('guard', v);
  if (CFG.mode !== 'auto' && CFG.mode !== 'streamer') return;
  if (mapped && giftDefs[mapped]?.crowd) return; // sự kiện cả trại đã chạy đồng loạt — không bắt ai xếp hàng chờ
  // hàng chờ xếp theo xu (quà lớn chen lên trước); quà đã gán hành động được ưu tiên gấp đôi
  const res = spot.addGift({ id: v.id, name: v.name, avatar: v.avatar }, coins, Date.now(), mapped ? coins * 2 : coins);
  // người tặng đầu tiên lên sóng ngay (addGift tự bật lượt, tick() không báo 'started') → vẫn phải viền sáng tên, banner, chuông
  if (res === 'start') beginTurn(spot.current);
  else if (res === 'extend') v.npc.label.say(`⏱ +giờ chơi!`, 2.5);
  // người chờ lượt: tên + số thứ tự đã hiện ở hàng "⏳ Tiếp theo" và trên đầu nhân vật — không đẩy trôi khung chat
}

function beginTurn(cur) {
  // tới lượt mà nhân vật không còn trong trại (vd. bị dọn vì im lặng) → cho vào lại, không để lượt chạy không
  const v = viewers.get(cur.id) ?? ensureViewer({ id: cur.id, name: cur.name, avatar: cur.avatar }, 'turn');
  if (v.jailed) events.free(v);
  v.lastCmdAt = Date.now();
  v.npc.label.setKind('spot');
  v.npc.label.say(pick(Math.random, DATA.chat.turn), 3);
  banner(`🎥 Lượt của ${v.name}`);
  sfx('bell');
}

function endTurn(cur) {
  const v = viewers.get(cur.id);
  if (v) v.npc.label.setKind(v.jailed ? 'jailed' : v.guardRole ? 'guard' : 'viewer');
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
  disposeCharacter(streamer.char);
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
    if (events.cleanNear(p.x, p.y, p.z)) {
      sfx('scrub');
      return true;
    }
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
  const ev = events.focusActor(); // 🗑️ đang có người vác người ném vào thùng rác → camera bám cảnh đó trước
  if (ev) return ev;
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
    const now = Date.now();
    // 🎥 người vừa chia sẻ / theo dõi: camera ghé riêng 4 giây kèm lời cảm ơn (sau quà, trước đi dạo)
    if (cam.cameo && (now > cam.cameo.until || !cam.cameo.v.npc.char.root.parent)) cam.cameo = null;
    if (!cam.cameo && cameos.size) {
      const c = cameos.next(now);
      const cv = c && viewers.get(c.id);
      if (cv) {
        cam.cameo = { v: cv, until: now + 4000 };
        banner(c.kind === 'share' ? `↗️ Cảm ơn ${cv.name} đã chia sẻ LIVE!` : `➕ Cảm ơn ${cv.name} đã theo dõi!`);
        cv.npc.label.say('🙏 Cảm ơn cả nhà!', 3);
      }
    }
    // chuyến tham quan: lúc toàn cảnh, lúc bám một người — ai tương tác nhiều (chia sẻ > theo dõi > bình luận > tim) được ghé nhiều
    cam.tourT -= dt;
    if (cam.tourT <= 0 || (cam.tourKind === 'follow' && !npcs.inmates.includes(cam.tourActor))) {
      cam.tourT = 9;
      if (cam.tourKind === 'follow' || Math.random() < 0.35) cam.tourKind = 'overview';
      else {
        const id = interest.pick([...viewers.keys()], now);
        cam.tourActor = id ? viewers.get(id).npc : pick(Math.random, npcs.inmates);
        cam.tourKind = cam.tourActor ? 'follow' : 'overview';
      }
    }
    cam.yaw += dt * 0.05;
    if (cam.cameo) actor = cam.cameo.v.npc;
    else if (cam.tourKind === 'follow') actor = cam.tourActor;
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

/** 🎯 Thẻ "chọn người": ai vừa tặng quà chơi khăm, còn mấy giây để bình luận mã số, im lặng thì trả thù ai. */
function updateTargetCard(now) {
  const host = hudEl('target');
  const items = targets.items.slice(0, 2);
  host.classList.toggle('hidden', !items.length);
  const sig = items.map((w) => w.id).join(',');
  if (sig !== hudSig.target) {
    hudSig.target = sig;
    host.replaceChildren();
    for (const w of items) {
      const v = viewers.get(w.gifterId);
      const a = giftDefs[w.action];
      const row = document.createElement('div');
      row.className = 'nt-tg';
      const box = document.createElement('div');
      box.className = 'nt-tg-box';
      const t1 = document.createElement('div');
      t1.className = 'nt-tg-title';
      t1.textContent = `🎯 ${v?.name ?? '?'} · ${a.emoji} ${a.label}`;
      const t2 = document.createElement('div');
      t2.className = 'nt-tg-sub';
      const track = document.createElement('div');
      track.className = 'nt-tg-track';
      const fill = document.createElement('div');
      track.append(fill);
      box.append(t1, t2, track);
      row.append(avatarEl(v?.name ?? '?', v?.avatar ?? ''), box);
      host.append(row);
      w.el = { t2, fill };
    }
  }
  for (const w of items) {
    if (!w.el) continue;
    const left = targets.left(w, now);
    const foeId = HOSTILE.has(w.action) ? grudges.peek(w.gifterId, now) : null;
    const foe = foeId ? viewers.get(foeId) : null;
    const txt = `Bình luận MÃ SỐ tù nhân (số vàng trên bảng tên) · còn ${Math.ceil(left)} giây · hết giờ = bốc ngẫu nhiên${foe ? ` · gõ #${foe.npc.number} = ⚔️ trả thù ${foe.name}` : ''}`;
    if (w.el.t2.textContent !== txt) w.el.t2.textContent = txt;
    const pct = `${Math.max(0, Math.min(100, (left * 1000 * 100) / Math.max(1, w.until - w.openedAt))).toFixed(1)}%`;
    if (w.el.fill.style.width !== pct) w.el.fill.style.width = pct;
  }
}

/** 🏠 Bảng thi đua phòng: điểm vòng này + số người mỗi phòng + giờ chốt. */
function updateRooms(now) {
  hudEl('rooms-wrap').classList.toggle('hidden', !CFG.rooms);
  if (!CFG.rooms) return;
  setText('rooms-left', mmss(roomRace.left(now)));
  const counts = teamCounts();
  const score = new Map(roomRace.ranking().map((r) => [r.room, r.score]));
  const order = Array.from({ length: CFG.rooms }, (_, i) => i + 1).sort((a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0) || a - b);
  const sig = order.map((r) => `${r}:${Math.round(score.get(r) ?? 0)}:${counts.get(r) ?? 0}`).join('|');
  if (sig === hudSig.rooms) return;
  hudSig.rooms = sig;
  const host = hudEl('rooms');
  host.replaceChildren();
  order.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'nt-rm';
    row.dataset.team = String(r);
    if (i === 0 && (score.get(r) ?? 0) > 0) row.classList.add('lead');
    const tag = document.createElement('b');
    tag.textContent = `P${r}`;
    const ppl = document.createElement('span');
    ppl.className = 'ppl';
    const ic = document.createElement('i');
    ic.textContent = '👤';
    ppl.append(String(counts.get(r) ?? 0), ic);
    const pt = document.createElement('span');
    pt.className = 'pt';
    pt.textContent = formatThousands(Math.round(score.get(r) ?? 0));
    row.append(tag, ppl, pt);
    host.append(row);
  });
}

// HUD cập nhật 5 lần/giây nhưng chỉ ghi DOM khi nội dung đổi (trước đây xoá + dựng lại thẻ lượt, hàng chờ,
// bảng TOP và ảnh avatar mỗi lần → trình duyệt tải lại ảnh, tính lại bố cục liên tục).
const hudEls = {};
const hudEl = (id) => hudEls[id] || (hudEls[id] = $(id));
const hudText = new Map();
function setText(id, text) {
  if (hudText.get(id) === text) return;
  hudText.set(id, text);
  hudEl(id).textContent = text;
}
const hudSig = { spot: null, queue: null, board: null, target: null, rooms: null };
const queueBadged = new Set();
let spotSubEl = null;
const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

function updateHud() {
  const now = Date.now();
  const snap = clock.snapshot(now);
  const phase = phaseAt(schedule, snap.minuteOfDay);
  const next = schedule[(phase.index + 1) % schedule.length];
  setText('clock', formatHM(snap.minuteOfDay));
  setText('phase', phase.label);
  setText('next', `${next.label} lúc ${next.start} (còn ${Math.ceil(minutesToNextPhase(schedule, snap.minuteOfDay))}′)`);
  setText('camp', formatThousands(campDays + campBonusDays));
  setText('online', String(npcs.all.length + (streamer ? 1 : 0)));
  setText('viewers', String(viewers.size));

  // đại ca / cán bộ
  const r = events.roles();
  const parts = [];
  if (r.boss) parts.push(`👑 Đại ca: ${r.boss.name} (${mmss(r.boss.left)})`);
  for (const g of r.guards.slice(0, 2)) parts.push(`👮 Cán bộ: ${g.name} (${mmss(g.left)})`);
  for (const j of r.jobs.slice(0, 3)) parts.push(`${j.emoji} ${j.title}: ${j.name} (${mmss(j.left)})`);
  for (const o of r.offenders.slice(0, 2)) parts.push(`🔒 Đang giam: ${o.name} (${mmss(o.left)})`);
  setText('roles', parts.join(' · '));
  hudEl('roles').classList.toggle('hidden', parts.length === 0);

  // 🪢 kéo co PK
  const tug = events.tugInfo();
  hudEl('pkbar').classList.toggle('hidden', !tug);
  if (tug) {
    setText('pk-host', formatThousands(tug.host));
    setText('pk-opp', formatThousands(tug.opp));
    const total = tug.host + tug.opp;
    const w = `${(total ? (tug.host / total) * 100 : 50).toFixed(1)}%`;
    const fill = hudEl('pk-fill');
    if (fill.style.width !== w) fill.style.width = w;
  }

  // thẻ lượt chơi
  const card = hudEl('spot');
  const cur = spot.current;
  card.classList.toggle('live', !!cur);
  // không ai lên sóng / chờ lượt thì thẻ chỉ là dòng hướng dẫn + thanh rỗng → ẩn (trừ khi đang hiện bảng lệnh bình luận)
  card.classList.toggle('hidden', CFG.mode === 'off' || (!cur && !spot.queue.length && !(CFG.commentPlay && CFG.showMenu)));
  hudEl('menu').classList.toggle('hidden', !CFG.showMenu || !CFG.commentPlay);
  hudEl('spot-tip').classList.toggle('hidden', !CFG.commentPlay);
  const sig = cur ? `on|${cur.id}|${cur.name}|${cur.avatar}|${CFG.commentPlay}` : `off|${CFG.mode}|${CFG.streamerName}|${CFG.commentPlay}`;
  if (sig !== hudSig.spot) {
    hudSig.spot = sig;
    const who = hudEl('spot-who');
    who.replaceChildren();
    const box = document.createElement('div');
    const n = document.createElement('div');
    n.className = 'nt-spot-name';
    const sub = document.createElement('div');
    sub.className = 'nt-spot-sub';
    if (cur) {
      who.append(avatarEl(cur.name, cur.avatar, 'nt-av big'));
      n.textContent = cur.name;
      setText('spot-tip', 'Bình luận 1 SỐ hoặc 1 CHỮ để ra lệnh (vd: gõ 1 hoặc gõ B = ném bóng):');
    } else {
      n.textContent = CFG.mode === 'streamer' ? `🎮 ${CFG.streamerName || 'Streamer'} đang dạo trại` : '🎁 Tặng quà để lên sóng!';
      sub.textContent =
        (CFG.commentPlay ? 'Bình luận để vào trại · tặng quà để được camera quay và điều khiển phạm nhân của bạn' : 'Tặng quà → camera quay phạm nhân của bạn làm theo món quà') +
        (CFG.targetSec > 0 ? ' · quà chơi khăm: tặng xong bình luận MÃ SỐ người muốn chọn' : '');
      setText('spot-tip', 'Khi tới lượt, bình luận 1 SỐ hoặc 1 CHỮ (vd: gõ 1 hoặc gõ B = ném bóng):');
    }
    box.append(n, sub);
    who.append(box);
    spotSubEl = cur ? sub : null;
  }
  let barW = '0%';
  if (cur) {
    const left = spot.remaining(now);
    const txt = `🎥 Đang lên sóng · còn ${Math.ceil(left)} giây`;
    if (spotSubEl.textContent !== txt) spotSubEl.textContent = txt;
    const total = Math.max(1, (spot.deadline() - cur.startedAt) / 1000);
    barW = `${Math.max(0, Math.min(100, (left / total) * 100)).toFixed(1)}%`;
  }
  const bar = hudEl('spot-bar');
  if (bar.style.width !== barW) bar.style.width = barW;
  updateTargetCard(now);
  updateRooms(now);

  const qSig = `${spot.queue.length}|${spot.queue.slice(0, 5).map((q) => `${q.id}:${q.name}:${q.avatar}`).join(',')}`;
  if (qSig !== hudSig.queue) {
    hudSig.queue = qSig;
    const qEl = hudEl('queue');
    qEl.replaceChildren();
    if (spot.queue.length) {
      const lab = document.createElement('span');
      lab.textContent = '⏳ Tiếp theo:';
      qEl.append(lab);
      spot.queue.slice(0, 5).forEach((q, i) => {
        const it = document.createElement('span');
        it.className = 'nt-q';
        const no = document.createElement('i');
        no.textContent = String(i + 1);
        const nm = document.createElement('span');
        nm.textContent = q.name;
        it.append(no, avatarEl(q.name, q.avatar), nm);
        qEl.append(it);
      });
      if (spot.queue.length > 5) {
        const more = document.createElement('span');
        more.textContent = `+${spot.queue.length - 5}`;
        qEl.append(more);
      }
    }
    // huy hiệu ⏳ số thứ tự trên đầu người đang chờ (không đè huy hiệu giam / thùng rác / phải dọn)
    const order = new Map(spot.queue.map((q, i) => [q.id, i + 1]));
    for (const id of queueBadged) {
      if (order.has(id)) continue;
      queueBadged.delete(id);
      const qv = viewers.get(id);
      if (qv && !qv.offense && !qv.npc.carried && !qv.mustClean) qv.npc.label.setBadge('');
    }
    for (const [id, no] of order) {
      const qv = viewers.get(id);
      if (!qv || qv.offense || qv.npc.carried || qv.mustClean) continue;
      qv.npc.label.setBadge(`⏳${no}`);
      queueBadged.add(id);
    }
  }

  // bảng TOP
  const top = Object.entries(board)
    .sort((a, b) => b[1].points - a[1].points)
    .slice(0, 5)
    .map(([id, rec]) => {
      const live = viewers.get(id);
      return { id, rec, badge: live ? events.roleEmoji(live) : '' };
    });
  const bSig = top.map((t) => `${t.id}:${t.rec.points}:${t.rec.name}:${t.rec.avatar}:${t.badge}`).join('|');
  if (bSig !== hudSig.board) {
    hudSig.board = bSig;
    const B = hudEl('board');
    B.replaceChildren();
    top.forEach(({ rec, badge }, i) => {
      const row = document.createElement('div');
      row.className = 'nt-br';
      const rk = document.createElement('span');
      rk.className = 'rk';
      rk.textContent = ['🥇', '🥈', '🥉', '4', '5'][i];
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = badge ? `${badge} ${rec.name}` : rec.name;
      const pt = document.createElement('span');
      pt.className = 'pt';
      pt.textContent = formatThousands(rec.points);
      row.append(rk, avatarEl(rec.name, rec.avatar), nm, pt);
      B.append(row);
    });
    hudEl('board-wrap').classList.toggle('hidden', top.length === 0);
  }
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
  else if (r < 0.95) {
    const a = pick(Math.random, DATA.giftActions).id;
    const v = ensureViewer(user, 'gift');
    if (TARGETED.has(a) && CFG.targetSec > 0) {
      // demo 🎯: mở cửa sổ chọn người, 2/3 số lần "bình luận" mã số 1 người xem khác sau 2–5 giây
      openTarget(a, v);
      const others = [...viewers.values()].filter((x) => x !== v);
      if (others.length && Math.random() < 0.67) setTimeout(() => onComment(user, `#${pick(Math.random, others).npc.number}`), range(Math.random, 2000, 5000));
    } else runGiftAction(a, v); // demo cả vai trò + sự kiện
  }
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
    // không bớt NPC đang làm lệnh / đang bị giữ (vd. sắp bị vác ném thùng rác) / đang bị vác
    const spare = (n) => !n.locked && !n.puppet && !n.carried;
    const f = fillers.find((n) => spare(n) && dist2d(n.body.pos, cam.target) > 12) ?? fillers.find(spare);
    if (f) npcs.removeInmate(f);
  } else if (fillers.length < target) {
    const used = new Set(npcs.inmates.map((n) => n.name));
    const name = DATA.names.find((x) => !used.has(x)) ?? pick(Math.random, DATA.names);
    npcs.addInmate({ name, x: range(Math.random, -1.6, 1.6), z: 12.6 });
  }
}

/** Mô phỏng một bước nhỏ (≤ 50 ms) — máy giật thì chạy nhiều bước để nhân vật không đi chậm như quay chậm. */
const actorsBuf = [];
function simulate(dt) {
  npcs.update(dt, npcCtx);
  if (streamer) updateStreamer(dt);
  let actors = npcs.all;
  if (streamer) {
    actorsBuf.length = 0;
    for (const a of actors) actorsBuf.push(a);
    actorsBuf.push(streamer);
    actors = actorsBuf;
  }
  separateActors(actors);
  balls.update(dt, (pos) => {
    if (cam.target.distanceTo(pos) < 12) sfx('bounce');
  });
  return actors;
}

let lastFrame = performance.now();
let nextDraw = 0;
function frame(nowPerf) {
  requestAnimationFrame(frame);
  if (nowPerf + 1 < nextDraw) return; // màn 144 Hz: bỏ bớt khung, giữ ~60 FPS (hoặc ?fps=)
  nextDraw = Math.max(nextDraw + FRAME_MS, nowPerf - FRAME_MS);
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
  expireTargets(now); // 🎯 hết giờ chọn mã số → trả thù / ngẫu nhiên
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
  flushJoins(rawDt);
  flushBanner(rawDt);
  fillerT -= rawDt;
  if (fillerT <= 0) {
    fillerT = 1;
    balancePopulation();
    const rr = CFG.rooms ? roomRace.tick(now) : null; // 🏠 hết vòng thi đua phòng
    if (rr) roomRoundEnd(rr);
  }

  if (CFG.autoEvents && now - lastGiftAt > 180000) {
    autoT -= rawDt;
    if (autoT <= 0) {
      autoT = range(Math.random, 240, 420);
      events.autoEvent();
    }
  }
  nightF += ((phase.key === 'sleep' || events.isNight() ? 1 : events.isRaining() ? 0.4 : 0) - nightF) * Math.min(1, rawDt * 1.5);
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
    // bảng điểm trong bộ nhớ cũng cắt còn 300 (LIVE dài → hàng nghìn người, HUD sắp xếp 5 lần/giây).
    // Người còn trong trại mà bị cắt thì lần cộng điểm sau tự ghi lại (điểm vẫn nằm ở bản ghi người xem).
    const ranked = Object.entries(board).sort((a, b) => b[1].points - a[1].points);
    for (const [id] of ranked.slice(300)) delete board[id];
    lsSet('nt_board', Object.fromEntries(ranked.slice(0, 200)));
    const memo = Object.keys(numMemo);
    for (const id of memo.slice(0, Math.max(0, memo.length - 400))) delete numMemo[id];
    lsSet('nt_numbers', numMemo);
  }
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ HP Action LIVE: cấu hình + sự kiện qua socket.io
function applyServerConfig(c) {
  if (!c || typeof c !== 'object') return;
  const num = (v, d, lo, hi) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Math.min(hi, Math.max(lo, Number(v))) : d);
  // "Máy yếu" trong app → tải lại với ?q=low&qa=1 (khử răng cưa chỉ đổi được lúc tạo renderer). qa=1 = do app bật →
  // chọn lại "Đẹp" thì gỡ ra; link ?q=low người dùng tự gõ (không có qa) thì giữ nguyên.
  const wantLow = c.ntQuality === 'low';
  if (wantLow !== LOW && (wantLow || Q.get('qa') === '1')) {
    const u = new URL(location.href);
    if (wantLow) {
      u.searchParams.set('q', 'low');
      u.searchParams.set('qa', '1');
    } else {
      u.searchParams.delete('q');
      u.searchParams.delete('qa');
    }
    location.replace(u.toString());
    return;
  }
  if (['auto', 'streamer', 'off'].includes(c.ntMode)) CFG.mode = c.ntMode;
  if (URL_MODE) CFG.mode = URL_MODE;
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
  CFG.commentPlay = c.ntCommentPlay === true;
  CFG.offenseJailSec = num(c.ntOffenseJailSec, CFG.offenseJailSec, 10, 3600);
  CFG.trashSec = num(c.ntTrashSec, CFG.trashSec, 5, 600);
  CFG.prankSec = num(c.ntPrankSec, CFG.prankSec, 10, 1800);
  CFG.likeEvent = num(c.ntLikeEvent, CFG.likeEvent, 0, 1000000);
  CFG.autoEvents = c.ntAutoEvents !== false;
  CFG.pkTug = c.ntPkTug !== false;
  CFG.targetSec = num(c.ntTargetSec, CFG.targetSec, 0, 60);
  CFG.revengeSec = num(c.ntRevengeSec, CFG.revengeSec, 0, 600);
  CFG.rooms = Math.round(num(c.ntRooms, CFG.rooms, 0, teamCells.length));
  CFG.roomRoundMin = num(c.ntRoomRoundMin, CFG.roomRoundMin, 1, 60);
  targets.sec = CFG.targetSec;
  grudges.sec = CFG.revengeSec;
  if (roomRace.rooms !== CFG.rooms || roomRace.roundSec !== CFG.roomRoundMin * 60) {
    roomRace.setOptions({ rooms: CFG.rooms, roundSec: CFG.roomRoundMin * 60 });
    roomRace.start(Date.now());
  }
  // bớt số phòng / tắt phòng → xếp lại người đang ở phòng không còn
  for (const x of viewers.values()) {
    if (!CFG.rooms) x.team && setTeam(x, 0);
    else if (!x.team || x.team > CFG.rooms) setTeam(x, leastCrowdedRoom(CFG.rooms, teamCounts()));
  }
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
    targets.clear();
    grudges.reset();
    roomRace.start(Date.now());
    for (const v of [...viewers.values()]) removeViewer(v);
    for (const k of Object.keys(board)) delete board[k];
    campBonusDays = 0;
    lsSet('nt_board', {});
    lsSet('nt_bonus_days', 0);
    banner('🧹 Đã làm mới trại');
  } else if (d.cmd === 'pk') {
    events.pkState(p); // thử kéo co không cần PK thật: {phase:'start'|'score'|'end', host, opp, result}
  } else if (d.cmd === 'test') {
    const name = p.name || pick(Math.random, DATA.demoNames);
    const u = { id: `test_${name}`, name, avatar: '' };
    if (p.kind === 'action' && typeof p.action === 'string') {
      const v = ensureViewer(u, 'gift');
      const power = Math.max(1, Math.min(3, Number(p.power) || 1));
      if (p.target === true && TARGETED.has(p.action) && CFG.targetSec > 0) openTarget(p.action, v, power); // 🧪 thử luôn bước chọn mã số
      else runGiftAction(p.action, v, power);
    } else if (p.kind === 'comment') onComment(u, p.text || pick(Math.random, DATA.chat.free));
    else if (p.kind === 'like') onLike(u, 20);
    else if (p.kind === 'follow') onSocial(u, 'follow');
    else if (p.kind === 'share') onSocial(u, 'share');
    else onGift(u, p.giftName || 'Hoa hồng', 1, Number(p.coins) || 1, p.giftId || '');
  }
}

if (typeof window.io === 'function') {
  const socket = window.io({ reconnection: true, reconnectionDelay: 600, reconnectionDelayMax: 5000 });
  // cửa sổ game (Edge/Chrome --app, ?win=1): app tắt / mất kết nối quá 4 giây → tự đóng, không để game 3D chạy mồ côi
  const WIN = Q.get('win') === '1';
  let winCloseT = WIN ? setTimeout(() => window.close(), 9000) : 0;
  socket.on('disconnect', () => {
    if (!WIN) return;
    clearTimeout(winCloseT);
    winCloseT = setTimeout(() => window.close(), 4000);
  });
  socket.on('connect', async () => {
    clearTimeout(winCloseT);
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
  // 🚫 bình luận dính từ cấm (server đã bỏ chữ): người đang trong trại vẫn tính là còn tương tác — không hiện, không cộng điểm
  socket.on('chat:blocked', (c) => c && viewers.has(appUser(c).id) && ensureViewer(appUser(c), 'comment'));
  socket.on('like', (l) => l && onLike(appUser(l), Math.max(1, Number(l.likeCount) || 1)));
  socket.on('social', (d) => {
    if (!d) return;
    const t = String(d.label || '');
    if (/theo dõi|follow/i.test(t)) onSocial(appUser(d), 'follow');
    else if (/chia sẻ|share/i.test(t)) onSocial(appUser(d), 'share');
  });
  socket.on('gameCmd', onAppCmd);
  socket.on('pk:state', (d) => events.pkState(d)); // 🪢 tín hiệu PK thật (server.js emitPkState)
  socket.on('nhatu:key', (k) => {
    if (!k || typeof k.code !== 'string') return;
    if (k.down) keyDown(k.code);
    else keyUp(k.code);
  });
}

// thử trong trình duyệt: ?demo=1 · ?mode=streamer · ?q=low
if (URL_MODE) CFG.mode = URL_MODE;
window.__nhatu = {
  CFG, spot, viewers, npcs, onGift, onComment, onLike, doAction, renderer, scene, camera, events,
  targets, grudges, roomRace, interest, cameos, openTarget, onSocial,
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
