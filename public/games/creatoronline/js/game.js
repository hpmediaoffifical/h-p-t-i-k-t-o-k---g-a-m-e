/**
 * 🏢 Creator Online — overlay LIVE (OBS Browser Source 1080×1920 hoặc cửa sổ Edge/Chrome ?win=1).
 * Spec: docs/superpowers/specs/2026-11-03-creatoronline-design.md.
 *
 * Người xem TikTok là fan của 5 nhóm (club ①–⑤): bình luận / thả tim / follow là vào tòa nhà, bình luận "1"–"5" chọn
 * nhóm (server giữ club + cấp fan trọn đời, lib/creatoronline-fans.js). Quà bất kỳ → lên sân khấu nhóm mình; vé → phòng
 * mang tên; quà 99 xu → vai MC / Kỹ thuật / Quản lý; quà lớn → banner, tâm điểm, Gala; PK giữa các nhóm.
 * Streamer là đạo diễn: camera tự cắt cảnh (logic/director.js + director-cam.js). Không có người chơi, ví xu hay
 * hoạt động giả (NPC chỉ là đám đông vô danh + cư dân phát sóng). Bản đi dạo cũ: demo.html (?demo=1).
 *
 * Logic thuần có test nằm ở js/logic/*; file này chỉ nối logic ↔ hình ↔ socket.
 */
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { animateCharacter, setLook, setProps, disposeCharacter } from './character.js';
import { NpcManager, makeActor, syncActor, separateActors, setHidden, setLabelFactory, corridorPath } from './npc.js';
import { Effects } from './effects.js';
import { AudioFx } from './audio.js';
import * as S from './screens.js';
import { LabelLayer, setLabelLayer, attachLabel } from './label-layer.js';
import { LiveHud } from './live-hud.js';
import { DirectorCam } from './director-cam.js';
import { stepBody } from './logic/physics.js';
import { mulberry32, pick, range } from './logic/rng.js';
import { cleanText } from './logic/format.js';
import { createRoomState, pushComment, clampIdols, MAX_IDOLS } from './logic/rooms.js';
import { SeatHouse } from './logic/seats.js';
import { parseClubCode, parseRoleCommand } from './logic/codes.js';
import { makeTextFilter } from './logic/textfilter.js';
import { resolveGift, planGift, fallbackPlan } from './logic/events.js';
import { StageSlots } from './logic/stage.js';
import { RoleBoard } from './logic/roles.js';
import { PkRound, PkScheduler, pickPkPair, pickOpponent } from './logic/pk.js';
import { Director, IdleCycle } from './logic/director.js';
import { pickEvictee, canOverflow, protectedSet } from './logic/population.js';

// ------------------------------------------------------------------ cấu hình
const Q = new URLSearchParams(location.search);
const LOW = Q.get('q') === 'low';
const DEBUG = Q.get('debug') === '1';
const WIN = Q.get('win') === '1';
const DATA = await fetch('/games/creatoronline/data.json').then((r) => r.json());
const L = DATA.live;
const DEFAULTS = {
  enabled: true, coQuality: 'high', coMaxViewers: 40, coNpcCount: 20, coViewerIdleMin: 30, coClubSwitchSec: 60,
  coStageBaseSec: 12, coStagePerCoinSec: 3, coStageMaxSec: 120, coStageSlots: 12, coRoomHoldSec: 60, coRoomQueueMax: 6,
  coRoleSec: 180, coRoleLockSec: 45, coRoleMaxSec: 300, coPkEveryMin: 5, coPkSec: 90, coPkFinalSec: 30, coMvpMin: 10,
  coCamMaxPer5Min: 90, coTierFallback: true, coLikeMilestone: 300, coSound: true, coMusic: true, coMusicVol: 0.35,
  coLiveTv: true, coShowGiftLegend: true, coShowJoinHint: true, coBadWords: '', coGiftMap: DATA.suggestedGiftMap || {},
};
const clampN = (v, lo, hi, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
};
/** Chuẩn hoá config co* (giá trị ngoài khoảng → kẹp lại, spec §17.3). */
function normalizeCfg(raw) {
  const c = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
  c.coMaxViewers = clampN(c.coMaxViewers, 5, LOW ? L.maxViewersLow : 120, 40);
  c.coNpcCount = clampN(c.coNpcCount, 0, 60, 20);
  c.coPkSec = clampN(c.coPkSec, 60, 300, 90);
  c.coPkFinalSec = clampN(c.coPkFinalSec, 0, c.coPkSec / 2, 30);
  c.coPkEveryMin = Number(c.coPkEveryMin) > 0 ? clampN(c.coPkEveryMin, 2, 15, 5) : 0;
  c.coStageBaseSec = clampN(c.coStageBaseSec, 5, 60, 12);
  c.coStagePerCoinSec = clampN(c.coStagePerCoinSec, 0, 30, 3);
  c.coStageMaxSec = clampN(c.coStageMaxSec, c.coStageBaseSec, 300, 120);
  c.coStageSlots = clampN(c.coStageSlots, 1, 12, 12);
  c.coRoomHoldSec = clampN(c.coRoomHoldSec, 10, 300, 60);
  c.coRoomQueueMax = clampN(c.coRoomQueueMax, 0, LOW ? 3 : 6, 6);
  c.coRoleSec = clampN(c.coRoleSec, 30, 300, 180);
  c.coRoleLockSec = clampN(c.coRoleLockSec, 0, c.coRoleSec, 45);
  c.coRoleMaxSec = clampN(c.coRoleMaxSec, c.coRoleSec, 600, 300);
  c.coCamMaxPer5Min = clampN(c.coCamMaxPer5Min, 10, 300, 90);
  c.coLikeMilestone = clampN(c.coLikeMilestone, 50, 100000, 300);
  c.coClubSwitchSec = clampN(c.coClubSwitchSec, 0, 3600, 60);
  c.coViewerIdleMin = clampN(c.coViewerIdleMin, 1, 600, 30);
  c.coMvpMin = clampN(c.coMvpMin, 1, 120, 10);
  c.coMusicVol = clampN(c.coMusicVol, 0, 1, 0.35);
  if (!c.coGiftMap || typeof c.coGiftMap !== 'object') c.coGiftMap = {};
  return c;
}
let CFG = normalizeCfg(await fetch('/api/games/creatoronline/config').then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
// chất lượng thấp: overlay tự tải lại ?q=low (qa=1 = tự thêm, đổi lại 'high' thì tự bỏ) — giống Nhà Tù
{
  const wantLow = CFG.coQuality === 'low';
  if (wantLow !== LOW && (wantLow || Q.get('qa') === '1')) {
    const u = new URL(location.href);
    if (wantLow) u.searchParams.set('q', 'low'), u.searchParams.set('qa', '1');
    else u.searchParams.delete('q'), u.searchParams.delete('qa');
    location.replace(u.href);
    await new Promise(() => {}); // dừng tại đây, trang sắp tải lại
  }
}
await Promise.all(['700 20px "Baloo 2"', '800 20px "Baloo 2"'].map((f) => document.fonts.load(f).catch(() => null)));

// ------------------------------------------------------------------ renderer, camera, lớp nhãn, HUD
const PIXEL_BUDGET = LOW ? 1.0e6 : 2.2e6;
const FPS = LOW ? 30 : 60;
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: !LOW, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = LOW ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 9 / 16, 0.1, 260);
const labelLayer = new LabelLayer(document.getElementById('labels'), { maxShown: 8 });
setLabelLayer(labelLayer);
setLabelFactory(attachLabel);
const hud = new LiveHud(document.getElementById('hud'));
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(Math.max(0.5, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(PIXEL_BUDGET / Math.max(1, w * h)))));
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = w < h ? 60 : 50; // khung dọc: 50° chỉ còn ~29° chiều ngang
  camera.updateProjectionMatrix();
  hud.resize();
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ thế giới + phòng
const GENRES = DATA.genres;
const genresFor = (type) => Object.keys(GENRES).filter((k) => GENRES[k].type === type);
const genreSrc = (key) => ({ style: GENRES[key]?.style ?? 'lobby', file: GENRES[key]?.file, bpm: GENRES[key]?.bpm });
const genreLabel = (key) => GENRES[key]?.label ?? key;
const SONGS = {
  ballad: ['Mưa Trên Phố Nhỏ', 'Gửi Ngày Hôm Qua', 'Chiếc Ô Màu Xanh'],
  bolero: ['Trăng Quê Mình', 'Chuyến Xe Cuối Ngày', 'Thư Gửi Mẹ Hiền'],
  acoustic: ['Cà Phê Sáng Nay', 'Đạp Xe Qua Phố', 'Nắng Ban Mai'],
  rnb: ['Đêm Thành Phố', 'Chậm Lại Thôi', 'Mây Trôi Lững Lờ'],
};
const SOLO_PREFIX = { stand: 'Phòng', sing: 'Góc hát', game: 'Kênh game' };
const ROLE_PROPS = { mc: { mic: true }, tech: { headset: true }, manager: { clipboard: true } };
const ROLE_INFO = { mc: { icon: '🎙️', label: 'MC' }, tech: { icon: '🎛️', label: 'Kỹ thuật' }, manager: { icon: '📋', label: 'Quản lý' } };
const CLUBS = [1, 2, 3, 4, 5];
const CLUB_NO = ['', '①', '②', '③', '④', '⑤'];
const TIER_ICON = ['', '🌹', '💖', '🎟️', '🎙️', '🎁', '🌌', '👑'];
const FX_LABEL = { confetti: 'pháo giấy 🎉', smoke: 'khói ☁️', laser: 'laser ⚡', flash: 'chớp đèn 💡' };
const rng = mulberry32(DATA.tuning.seed);
const worldCfg = { ...DATA, screenScale: LOW ? 1 : 2, staticShadows: false, shadowMapSize: LOW ? 1024 : 2048, tuning: { ...DATA.tuning, audienceCount: Math.min(60, CFG.coNpcCount) } };
const world = buildWorld(scene, worldCfg);
const states = new Map();
for (const room of world.rooms) {
  const pool = genresFor(room.type);
  const genre = room.type === 'group' ? room.def.genre : pool[room.index % pool.length];
  const st = createRoomState({ id: room.id, type: room.type, name: room.def?.name ?? room.id, genre, theme: room.def?.theme ?? 'neon', idols: 4 });
  Object.assign(st, { viewers: 0, hearts: 0, holders: { mc: null, tech: null, manager: null, idol: {} }, sayT: range(rng, 4, 12), scrT: rng(), camIdx: 0, camT: 0, boost: 0, hype: 0, ticker: '', tickerUntil: 0, mvp: '', mvpUntil: 0, fxQueue: [], fxT: 0, greet: [], greetT: 0, thanks: [], thanksT: 0, lastComment: null, mcReadT: range(rng, 8, 20) });
  if (room.type === 'sing') st.song = pick(rng, SONGS[genre] ?? ['La la la']);
  if (room.type === 'game') st.match = newMatch(0);
  states.set(room.id, st);
}
const npcs = new NpcManager({ scene, world, cfg: worldCfg, rng, states });
npcs.spawn();
const groupRooms = CLUBS.map((n) => world.byId.get(`G${n}`));
const soloRooms = world.rooms.filter((r) => r.type !== 'group');
const clubRoom = (n) => groupRooms[n - 1] ?? null;
const clubOfRoom = (room) => (room?.type === 'group' ? room.index + 1 : null);
const accentOf = (room) => (room.type === 'group' ? room.def.accent : room.type === 'stand' ? `hsl(${room.index * 36},85%,62%)` : room.type === 'sing' ? '#ff6fb5' : '#31d0a0');
const clubColor = (n) => (n ? clubRoom(n).def.accent : '#ff4fa3');
for (const room of world.rooms) {
  const st = states.get(room.id);
  if (room.type === 'group') st.title = room.def.name;
  else {
    // cư dân phát sóng (NPC) — giữ tên + dáng gốc để trả phòng lại khi người xem rời
    const host = npcs.byRoom.get(room.id).main;
    host.npcName = host.baseName;
    host.npcLook = { ...host.char.look };
    st.title = `${SOLO_PREFIX[room.type]} ${host.baseName}`;
  }
}
for (const a of npcs.fans) a.label.setKind('crowd'); // đám đông vô danh: không hiện tên giả
const seatHouse = new SeatHouse({ rooms: world.rooms, holdMs: CFG.coRoomHoldSec * 1000, maxQueue: CFG.coRoomQueueMax });
const effects = new Effects(scene);
const audio = new AudioFx({ files: DATA.audioFiles });
for (const room of world.rooms) audio.setChannel(room.id, genreSrc(states.get(room.id).genre));
audio.setChannel('lobby', { style: DATA.lobbyMusic.style, file: DATA.lobbyMusic.file });
const dcam = new DirectorCam(camera, world);
let filterText = makeTextFilter(CFG.coBadWords);

// ------------------------------------------------------------------ hệ thống logic (js/logic, có test)
const stageOpts = () => ({ slots: CFG.coStageSlots, queueMax: L.stageQueueMax, minStandMs: L.stageMinStandSec * 1000, baseSec: CFG.coStageBaseSec, perCoinSec: CFG.coStagePerCoinSec, maxSec: CFG.coStageMaxSec });
const roleOpts = () => ({ durMs: CFG.coRoleSec * 1000, lockMs: CFG.coRoleLockSec * 1000, maxMs: CFG.coRoleMaxSec * 1000, extendMs: L.roleExtendSec * 1000, yieldMs: L.roleYieldSec * 1000, queueMax: L.roleQueueMax });
const schedOpts = () => ({ everyMs: CFG.coPkEveryMin * 60000, cooldownMs: L.pkCooldownSec * 1000, retryMs: L.pkRetrySec * 1000 });
const dirOpts = () => ({ minShotMs: L.shotMinSec * 1000, queueMax: L.shotQueueMax, staleMs: L.shotStaleSec * 1000, camCapMs: CFG.coCamMaxPer5Min * 1000, camWindowMs: 300000, galaShortMs: L.galaShortSec * 1000, galaMergeMaxMs: L.galaMergeMaxSec * 1000, holdMaxMs: L.holdMaxSec * 1000 });
let stages = {};
let roles = null;
let sched = null;
let director = null;
let idleCycle = null;
let pk = null; // PkRound đang chạy
let lastPair = null;
let pendingAfterGala = null;
const viewers = new Map(); // fanKey → người xem
const ownSince = new Map(); // roomId → lúc người xem hiện tại bắt đầu giữ phòng (trần 300 giây liên tục)
let wins = {};
let clubXu = {};
let totalLikes = 0;
let milestoneLikers = new Map();
let sessionRoomId = null;
let gala = null; // { club, gifter, until, borrowed:[{a, pos}] }
let spotlight = null; // { club, until, themes: Map }
const actorById = (id) => viewers.get(id)?.actor ?? null;

function freshSystems() {
  stages = Object.fromEntries(CLUBS.map((c) => [c, new StageSlots(stageOpts())]));
  roles = new RoleBoard(roleOpts());
  sched = new PkScheduler(schedOpts());
  sched.begin(Date.now());
  director = new Director(dirOpts());
  idleCycle = new IdleCycle();
  pk = null;
  lastPair = null;
  wins = Object.fromEntries(CLUBS.map((c) => [c, 0]));
  clubXu = Object.fromEntries(CLUBS.map((c) => [c, 0]));
  totalLikes = 0;
  milestoneLikers = new Map();
}
freshSystems();

// ------------------------------------------------------------------ tiện ích
const textOf = (v) => filterText(String(v ?? ''), 60);
/** Khoá người xem dùng chung server (lib/creatoronline-fans.js fanKey): userId, không có thì uniqueId viết thường. */
function fanKeyOf(d) {
  if (d.userId != null && String(d.userId) !== '' && String(d.userId) !== '0') return String(d.userId);
  return d.uniqueId ? String(d.uniqueId).toLowerCase() : '';
}
function userOf(d) {
  if (!d) return null;
  const id = fanKeyOf(d);
  if (!id) return null;
  return { id, name: cleanText(d.nickname || d.uniqueId || 'Khách', 24) || 'Khách', avatar: d.profilePicture || '' };
}
function newMatch(no) {
  return { no: no + 1, alive: 48 + Math.floor(Math.random() * 3), t: 0, next: 2.5, result: null, endT: 0 };
}
/** Âm lượng hiệu ứng: phòng đang được quay nghe rõ, phòng khác nhỏ. */
const vol = (room) => (room && dcam.room === room ? 1 : 0.3);
function npcSay(actor, line, room) {
  if (!actor || actor.hidden) return;
  actor.label.say(line);
  actor.talkT = 2.5;
  if (dcam.room === room) audio.voice(line, actor.role === 'idol' ? 1.4 : 1.1 + ((actor.name?.length ?? 3) % 4) * 0.08, 0.8, 0);
}
function stagePos(room) {
  return room.type === 'group' ? { x: room.cx, y: 2.6, z: -33 } : { x: room.spots.streamer.x, y: 2.4, z: room.spots.streamer.z };
}
function activeCounts() {
  const now = Date.now();
  const act = {};
  const fans = {};
  for (const v of viewers.values()) {
    if (!v.club) continue;
    fans[v.club] = (fans[v.club] ?? 0) + 1;
    if (now - v.lastActive < L.activeWindowSec * 1000) act[v.club] = (act[v.club] ?? 0) + 1;
  }
  return { act, fans };
}
const spawnedCount = () => {
  let n = 0;
  for (const v of viewers.values()) if (v.actor) n++;
  return n;
};
function ticketName() {
  return (CFG.coGiftMap.ticket || [])[0]?.giftName || 'Vé';
}
function chipFor(v, text) {
  if (v?.actor && !v.actor.hidden && v.actor.label.onScreen) v.actor.label.flash(text);
  else if (Date.now() - lastHudChip > 800) {
    lastHudChip = Date.now();
    hud.chip(`${v ? `${v.name} ` : ''}${text}`);
  }
}
let lastHudChip = 0;

// ------------------------------------------------------------------ người xem: vào, chọn club, chỗ đứng
function crowdSpots(room) {
  if (!room._crowd) {
    const list = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 11; col++) {
        const x = room.cx - 5.8 + col * 1.16 + (row % 2) * 0.4;
        const z = -28.9 + row * 1.2;
        if (x > room.cx + 3.6 && z > -25.9) continue; // bàn kỹ thuật
        if (x < room.cx - 5.6 && z > -24.6) continue; // chỗ quản lý
        list.push({ x, z, ry: Math.PI, occ: null });
      }
    }
    room._crowd = list;
  }
  return room._crowd;
}
function releaseCrowd(v) {
  if (v.crowdSpot?.occ === v.id) v.crowdSpot.occ = null;
  v.crowdSpot = null;
}
function takeCrowdSpot(v, room) {
  releaseCrowd(v);
  const spot = crowdSpots(room).find((s) => !s.occ);
  if (spot) {
    spot.occ = v.id;
    v.crowdSpot = spot;
    return spot;
  }
  return { x: room.cx + range(Math.random, -4, 4), z: -23.6 + range(Math.random, -0.6, 0.4), ry: Math.PI };
}
/** Đường đi trong tòa nhà (theo cửa phòng + hành lang quanh đảo giữa), như NpcManager.sendFan. */
function routeTo(a, room, spot) {
  const pos = a.body.pos;
  const pts = [];
  const cur = world.roomAt(pos.x, pos.z);
  let start = { x: pos.x, z: pos.z };
  if (cur !== room) {
    if (cur) {
      pts.push(cur.door.in, cur.door.out);
      start = cur.door.out;
    }
    pts.push(...corridorPath(start, room.door.out), room.door.out, room.door.in);
  }
  pts.push({ x: spot.x, z: spot.z });
  a.path = pts.map((p) => ({ x: p.x, z: p.z }));
  a.mode = 'walk';
  Object.assign(a, { stuckT: 0, stuckCount: 0, stuckRef: { x: pos.x, z: pos.z } });
}

/** Club tự xếp (người chưa chọn bao giờ): club ít fan hoạt động nhất; đang PK thì phe PK ít fan hơn. Không lưu. */
function autoClub() {
  const { act, fans } = activeCounts();
  const pool = pk && !pk.isOver(Date.now()) ? [pk.a, pk.b] : CLUBS;
  let best = pool[0];
  for (const c of pool) if ((act[c] ?? 0) < (act[best] ?? 0) || ((act[c] ?? 0) === (act[best] ?? 0) && (fans[c] ?? 0) < (fans[best] ?? 0))) best = c;
  return best;
}
/** Đổi club (server đã duyệt, hoặc lệnh thử). Fan đang ở 2 phe PK bị khoá phe tới hết trận. */
function setClub(v, club, { auto = false } = {}) {
  if (!club || club === v.club) {
    if (!auto) v.clubAuto = false;
    return;
  }
  // khoá phe: chỉ người đã TỰ chọn nhóm (club tự xếp đổi được ngay, kể cả sang club đã lưu trên server)
  if (pk && !pk.isOver(Date.now()) && (v.club === pk.a || v.club === pk.b) && !auto && !v.clubAuto) {
    v.pendingClub = club;
    chipFor(v, `🔒 đổi sang ${CLUB_NO[club]} sau PK`);
    return;
  }
  const prev = v.club;
  v.club = club;
  v.clubAuto = auto;
  v.pendingClub = null;
  if (v.actor) setProps(v.actor.char, { stick: v.place?.kind === 'crowd' || !v.place, stickColor: clubColor(club) });
  if (!auto && prev) chipFor(v, `✓ → ${CLUB_NO[club]} ${clubRoom(club).def.name}`);
  else if (auto) v.autoChip = true;
  if (v.place?.kind === 'crowd') v.place = null; // reconcile sẽ dẫn sang khu khán giả nhóm mới
}
function applyCoFan(v, f, { club = true } = {}) {
  if (!f) return;
  if (Number.isInteger(f.rank)) v.rank = f.rank;
  if (Number.isFinite(f.xu)) v.lifeXu = f.xu;
  if (club && f.club && (v.clubAuto || !v.club) && f.club !== v.club) setClub(v, f.club);
}

/** @param {{gift?:boolean, coFan?:object, coFanClub?:boolean}} [o] coFan (server) áp trước khi sinh nhân vật → fan quay lại vào thẳng nhóm đã lưu */
function ensureViewer(u, { gift = false, coFan = null, coFanClub = true } = {}) {
  const now = Date.now();
  let v = viewers.get(u.id);
  if (!v) {
    v = { id: u.id, name: u.name, avatar: u.avatar, club: null, clubAuto: true, pendingClub: null, rank: 0, lifeXu: 0, sessionXu: 0, likes: 0, likeBatch: 0, likeChipAt: 0, lastActive: now, lastGiftAt: 0, lastCommentAt: 0, goldUntil: 0, greeted: false, actor: null, place: null, crowdSpot: null, autoChip: false };
    viewers.set(u.id, v);
    fanAsk.add(u.id);
  } else {
    if (u.name) v.name = u.name;
    if (u.avatar && u.avatar !== v.avatar) {
      v.avatar = u.avatar;
      v.actor?.label.setAvatar(u.avatar);
    }
  }
  v.lastActive = now;
  if (coFan) applyCoFan(v, coFan, { club: coFanClub });
  if (!v.club) setClub(v, autoClub(), { auto: true });
  if (!v.actor) trySpawn(v, gift);
  return v;
}
/** Người tặng quà luôn được vào (vượt trần tạm +20, không quá trần cứng); bình luận/tim khi đầy thì không sinh nhân vật. */
function trySpawn(v, gift) {
  const n = spawnedCount();
  if (n < CFG.coMaxViewers) return spawnActor(v);
  if (!gift) return;
  const hardCap = LOW ? L.hardCapLow : L.hardCapHigh;
  if (canOverflow(n, { max: CFG.coMaxViewers, overflow: L.overflowViewers, hardCap })) return spawnActor(v);
  const out = pickEvictee([...viewers.values()].filter((x) => x.actor), protectedIds());
  if (out) {
    despawn(out);
    spawnActor(v);
  }
}
function protectedIds() {
  const now = Date.now();
  const stageIds = [];
  const queuedIds = [];
  for (const c of CLUBS) {
    for (const e of stages[c].entries()) stageIds.push(e.id);
    queuedIds.push(...stages[c].queueIds());
  }
  const roomIds = [];
  for (const r of soloRooms) {
    const s = seatHouse.get(r.id);
    if (s.owner) roomIds.push(s.owner.id);
    for (const q of s.queue) queuedIds.push(q.id);
  }
  const recentGifters = new Map();
  for (const v of viewers.values()) if (v.lastGiftAt) recentGifters.set(v.id, v.lastGiftAt);
  const shotGifterIds = [director.current?.gifter, ...director.queue.map((s) => s.gifter)].filter(Boolean);
  return protectedSet({ stageIds, roleIds: roles.all().map((r) => r.id), roomIds, queuedIds, shotGifterIds, recentGifters, now, gifterProtectMs: L.gifterProtectSec * 1000 });
}
function spawnActor(v) {
  const room = clubRoom(v.club);
  const x = room.door.out.x + range(Math.random, -2.5, 2.5);
  const z = room.door.out.z + range(Math.random, 0.5, 2.5);
  const a = makeActor(scene, { name: v.name, look: npcs.lookFromName(v.name, 'stand'), kind: 'viewer', x, z });
  a.label.setAvatar(v.avatar);
  setProps(a.char, { stick: true, stickColor: clubColor(v.club) });
  Object.assign(a, { viewerId: v.id, role: 'viewer', path: [], stuckT: 0, stuckCount: 0, stuckRef: { x, z } });
  a.ry = Math.PI;
  v.actor = a;
  v.place = null;
  liveActors = null;
  reconcile(v); // vào khu khán giả nhóm mình ngay (thả tim / bình luận thường không qua reconcile ở chỗ khác)
  if (v.autoChip) {
    v.autoChip = false;
    setTimeout(() => v.actor?.label.flash(`→ ${CLUB_NO[v.club]} ${clubRoom(v.club).def.name} · gõ 1–5 để đổi`, 4), 300);
  }
  syncNpcCrowd();
}
function despawn(v) {
  if (!v.actor) return;
  leavePlace(v);
  releaseCrowd(v);
  v.actor.label.dispose();
  disposeCharacter(v.actor.char);
  v.actor = null;
  v.place = null;
  liveActors = null;
  syncNpcCrowd();
}
/** Đám đông NPC bớt dần khi người xem vào (coNpcCount là dân số lúc vắng). */
function syncNpcCrowd() {
  const want = Math.max(0, Math.min(npcs.fans.length, CFG.coNpcCount) - spawnedCount());
  npcs.fans.forEach((a, i) => {
    const hide = i >= want;
    if (a.hidden !== hide) setHidden(a, hide);
  });
}
function removeViewer(v, now) {
  roleCmdAt.delete(v.id);
  for (const c of CLUBS) stages[c].remove(v.id);
  for (const e of roles.drop(v.id, now)) onRoleEvent(e);
  const c = seatHouse.removeEverywhere(v.id, now);
  if (c) for (const e of [].concat(c)) onSeatEvent(e, now);
  despawn(v);
  viewers.delete(v.id);
}

// ---- chỗ đứng: tính từ trạng thái logic (vai > phòng > sân khấu > khán giả) rồi đổi hình cho khớp
function desiredPlace(v) {
  const r = roles.roleOf(v.id);
  if (r) return { kind: 'role', club: r.club, role: r.role, key: `role:${r.club}:${r.role}` };
  const seat = seatHouse.ownedBy(v.id);
  if (seat) return { kind: 'room', roomId: seat.id, key: `room:${seat.id}` };
  for (const c of CLUBS) {
    const slot = stages[c].slotOf(v.id);
    if (slot != null) return { kind: 'stage', club: c, slot, key: `stage:${c}:${slot}` };
  }
  return { kind: 'crowd', club: v.club, key: `crowd:${v.club}` };
}
function stageSpot(room, slot) {
  if (slot < 6) return room.spots.idols[slot];
  const k = slot - 6;
  return { x: room.cx - 5.5 + k * 2.2, z: -30.75, y: room.stageY, ry: 0 };
}
function place(a, spot, y = 0) {
  a.body.pos.x = spot.x;
  a.body.pos.y = spot.y ?? y;
  a.body.pos.z = spot.z;
  a.body.vy = 0;
  a.ry = spot.ry ?? 0;
  a.path = [];
  syncActor(a);
}
function leavePlace(v) {
  const p = v.place;
  if (!p) return;
  const a = v.actor;
  if (p.kind === 'stage') {
    const st = states.get(`G${p.club}`);
    if (p.slot < MAX_IDOLS && st.holders.idol[p.slot]?.id === v.id) {
      delete st.holders.idol[p.slot];
      npcs.applyRoles(`G${p.club}`);
    }
  } else if (p.kind === 'role') {
    const st = states.get(`G${p.club}`);
    if (st.holders[p.role]?.id === v.id) {
      st.holders[p.role] = null;
      npcs.applyRoles(`G${p.club}`);
    }
  } else if (p.kind === 'room') {
    // phòng đã sang chủ mới (người chờ / giành phòng) thì để chủ mới giữ tên + dáng, chỉ phòng trống mới về NPC
    if (!seatHouse.get(p.roomId)?.owner) restoreSoloHost(world.byId.get(p.roomId));
    if (a) {
      const room = world.byId.get(p.roomId);
      place(a, room.door.out);
      setHidden(a, false);
    }
  }
  if (a) {
    a.fixed = false;
    a.label.setBadge('');
    setProps(a.char, { stick: true, stickColor: clubColor(v.club) });
  }
  v.place = null;
}
function enterPlace(v, d) {
  const a = v.actor;
  if (d.kind === 'room') {
    releaseCrowd(v);
    const room = world.byId.get(d.roomId);
    const host = npcs.byRoom.get(room.id).main;
    host.baseName = v.name;
    host.name = v.name;
    host.label.setName(v.name);
    host.label.setAvatar(v.avatar);
    host.label.setKind('host');
    host.viewerId = v.id;
    setLook(host.char, npcs.lookFromName(v.name, room.type));
    const st = states.get(room.id);
    st.title = `${SOLO_PREFIX[room.type]} ${v.name}`;
    st.streamer = v.name;
    st.washDrawn = false;
    st.dirty = true;
    if (a) setHidden(a, true);
    burst(room, '🎟️', 2);
  } else if (!a) {
    v.place = d;
    return;
  } else if (d.kind === 'stage') {
    const room = clubRoom(d.club);
    releaseCrowd(v);
    place(a, stageSpot(room, d.slot));
    a.fixed = true;
    setProps(a.char, { mic: d.slot < 2 });
    if (d.slot < MAX_IDOLS) {
      states.get(room.id).holders.idol[d.slot] = { id: v.id, name: v.name };
      npcs.applyRoles(room.id);
    }
    effects.confetti(a.body.pos.x, 2.4, a.body.pos.z, LOW ? 30 : 60, 1.2);
    audio.play('gift', vol(room) * 0.7);
  } else if (d.kind === 'role') {
    const room = clubRoom(d.club);
    releaseCrowd(v);
    place(a, room.spots[d.role]);
    a.fixed = true;
    setProps(a.char, ROLE_PROPS[d.role]);
    a.label.setBadge(ROLE_INFO[d.role].icon);
    states.get(room.id).holders[d.role] = { id: v.id, name: v.name };
    if (d.role === 'tech') states.get(room.id).techIdleAt = Date.now(); // "im lặng 10 giây" tính từ lúc nhận vai
    npcs.applyRoles(room.id);
    effects.confetti(a.body.pos.x, 3, a.body.pos.z, LOW ? 60 : 120, 2.5);
    audio.play('bigGift', vol(room) * 0.8);
  } else {
    const room = clubRoom(v.club);
    const spot = takeCrowdSpot(v, room);
    a.fixed = false;
    routeTo(a, room, spot);
    a.crowdRy = spot.ry;
  }
  v.place = d;
}
function reconcile(v) {
  const d = desiredPlace(v);
  if (v.place?.key === d.key) return;
  leavePlace(v);
  enterPlace(v, d);
}
function restoreSoloHost(room) {
  if (!room || room.type === 'group') return;
  const host = npcs.byRoom.get(room.id).main;
  host.baseName = host.npcName;
  host.name = host.npcName;
  host.viewerId = null;
  host.label.setName(host.npcName);
  host.label.setAvatar('');
  host.label.setKind('npc');
  setLook(host.char, host.npcLook);
  const st = states.get(room.id);
  st.title = `${SOLO_PREFIX[room.type]} ${host.npcName}`;
  st.streamer = host.npcName;
  st.washDrawn = false;
  st.dirty = true;
}

// ------------------------------------------------------------------ hiệu ứng phòng
function burst(room, emoji, n = 4) {
  const sp = stagePos(room);
  for (let i = 0; i < n; i++) effects.float(emoji, sp.x + (Math.random() - 0.5) * (room.type === 'group' ? 7 : 1.4), sp.y, sp.z + (Math.random() - 0.5) * 2, { size: 0.9, rise: 1.3, life: 2.4 });
}
/** Hàng hiệu ứng mỗi phòng: 1 hiệu ứng mỗi 1,5 giây, tối đa 6 chờ, trùng thì gộp (spec §4.1). */
function queueFx(room, fx) {
  if (room.type !== 'group') return burst(room, '🎉', 4);
  const st = states.get(room.id);
  if (st.fxQueue.includes(fx)) return;
  if (st.fxQueue.length >= L.roomFxQueueMax) return;
  st.fxQueue.push(fx);
}
function applyFx(room, fx) {
  const st = states.get(room.id);
  const c = room.cx;
  const v = vol(room);
  if (fx === 'confetti') {
    effects.confetti(c, 6.8, -32, LOW ? 120 : 260, 7);
    audio.play('confetti', v);
  } else if (fx === 'smoke') {
    effects.smoke(c, room.stageY, -33.5, 13, 6);
    audio.play('smoke', v);
  } else if (fx === 'laser') {
    effects.laser(c, 6.9, -36.2, DATA.lightThemes[st.theme]?.colors ?? ['#3be38f'], 7);
    audio.play('laser', v);
  } else if (fx === 'flash') {
    st.boost = 1;
  } else if (fx === 'theme') {
    const keys = Object.keys(DATA.lightThemes);
    applyTheme(room, keys[(keys.indexOf(st.theme) + 1) % keys.length]);
  }
  if (fx !== 'theme') audio.cheer(v * 0.6, 0);
}
function applyTheme(room, key) {
  if (room.type !== 'group' || !DATA.lightThemes[key]) return;
  const st = states.get(room.id);
  st.theme = key;
  world.setTheme(room, key);
  st.dirty = true;
}
function applyGenre(room) {
  const st = states.get(room.id);
  const pool = genresFor(room.type);
  const key = pool[(pool.indexOf(st.genre) + 1) % pool.length];
  st.genre = key;
  audio.setChannel(room.id, genreSrc(key));
  if (room.type === 'sing') st.song = pick(Math.random, SONGS[key] ?? ['La la la']);
  if (room.type === 'game') st.match = newMatch(st.match?.no ?? 0);
  st.dirty = true;
  mixKey = '';
}
function setTicker(st, text, sec = 8) {
  st.ticker = text;
  st.tickerUntil = Date.now() + sec * 1000;
  st.dirty = true;
}
/** NPC chủ sân/phòng gọi tên người tặng (gộp tên, tối đa 1 câu mỗi 3 giây mỗi phòng). */
function thank(room, name, what) {
  const st = states.get(room.id);
  if (!st.thanks.some((t) => t.name === name)) st.thanks.push({ name, what });
}

// ------------------------------------------------------------------ quà
function onGift(p) {
  const u = userOf(p);
  if (!u) return;
  const now = Date.now();
  const v = ensureViewer(u, { gift: true, coFan: p.coFan });
  const count = Math.max(1, Number(p.repeatCount) || 1);
  const res = resolveGift({ giftId: p.giftId, giftName: p.giftName, coins: p.coinValue ?? p.diamondCount, count }, CFG.coGiftMap);
  let plan = planGift(res, { tierFallback: CFG.coTierFallback });
  const reGiftGap = now - v.lastGiftAt < L.stageReGiftGapSec * 1000;
  v.lastGiftAt = now;
  v.sessionXu += res.xu;
  topDirty = true;
  const club = v.club;
  const room = clubRoom(club);
  const st = states.get(room.id);
  st.giftTotal += res.xu;
  clubXu[club] += res.xu;
  st.lastGift = { from: v.name, icon: TIER_ICON[res.tier], name: p.giftName || 'Quà', count };
  st.dirty = true;
  st.fansDirty = true;
  if (pk && !pk.isOver(now)) pk.addGift(club, v.id, res.xu, now);
  hud.pushGift({ key: `${v.id}|${p.giftId || p.giftName}`, name: v.name, avatar: v.avatar, giftName: p.giftName || 'Quà', giftImage: p.sheetItem?.image || p.image || p.giftPicture || '', count }, now);
  if (!reGiftGap) burst(room, TIER_ICON[res.tier], Math.min(8, Math.max(2, count)));
  audio.play(res.tier >= 5 ? 'bigGift' : 'gift', vol(room) * 0.7);

  // chỗ đứng: vai > phòng > sân khấu; vai/phòng hết chỗ → bậc 2 (spec §4.2)
  let shot = null;
  if (plan.place === 'role') {
    const owned = seatHouse.ownedBy(v.id);
    // chủ phòng tặng quà vai: mỗi người 1 chỗ (vai > phòng) — giữ phòng thêm thay vì có 2 thân
    const r = owned ? { status: 'room' } : roles.request(club, plan.role, v.id, now);
    if (r.status === 'room') claimRoom(v, now);
    else if (r.status === 'granted') {
      clearStage(v);
      shot = { kind: 'role', target: `G${r.club}`, gifter: v.id, view: 'close', focus: v.id, durMs: L.shotSec.role * 1000 };
      setTicker(states.get(`G${r.club}`), `${ROLE_INFO[r.role].icon} ${v.name} là ${ROLE_INFO[r.role].label} của ${clubRoom(r.club).def.name}!`, 8);
    } else if (r.status === 'extended' || r.status === 'held') chipFor(v, `${ROLE_INFO[r.role]?.icon ?? '⭐'} ${r.status === 'extended' ? '+90 giây' : 'giữ vai'}`);
    else if (r.status === 'queued') {
      chipFor(v, `⏳ chờ vai ${ROLE_INFO[r.role]?.label ?? ''}`);
      stageAdd(v, res.xu, now);
    } else plan = { ...plan, ...fallbackPlan(), building: plan.building, openPk: plan.openPk };
  } else if (plan.place === 'room') {
    const ok = claimRoom(v, now);
    if (ok === 'own') clearStage(v);
    if (ok === 'own') shot = { kind: 'room', target: seatHouse.ownedBy(v.id).id, gifter: v.id, view: 'room', focus: v.id, durMs: L.shotSec.room * 1000 };
    else if (ok === 'queue') stageAdd(v, res.xu, now);
    else if (ok === 'full') plan = { ...plan, ...fallbackPlan(), building: plan.building, openPk: plan.openPk };
  }
  if (plan.place === 'stage') stageAdd(v, res.xu, now);
  if (plan.roomFx) queueFx(room, plan.roomFx === 'random' ? pick(Math.random, ['confetti', 'smoke', 'flash']) : 'confetti');
  if (plan.shoutout) thank(room, v.name, p.giftName || 'quà');
  if (plan.genre) applyGenre(seatHouse.ownedBy(v.id) ? world.byId.get(seatHouse.ownedBy(v.id).id) : room);
  if (plan.building) bigEvent(plan.building, v, room, p, res, now);
  else if (res.tier >= 3 && !plan.shoutout) thank(room, v.name, p.giftName || 'quà');
  if (shot) director.push(shot, now);
  // quà mở PK cũng được tính điểm cho phe người tặng (trận vừa bắt đầu sau khi quà đã cộng ở trên)
  if (plan.openPk && requestPk({ club, by: v.name }, now) === 'start' && pk && (pk.a === club || pk.b === club)) pk.addGift(club, v.id, res.xu, now);
  reconcile(v);
}
function clearStage(v) {
  for (const c of CLUBS) stages[c].remove(v.id);
}
function stageAdd(v, xu, now) {
  // mỗi người 1 chỗ (vai > phòng > sân): người giữ vai / chủ phòng không chiếm chỗ vô hình trên sân
  if (roles.roleOf(v.id) || seatHouse.ownedBy(v.id)) return { status: 'held' };
  for (const c of CLUBS) if (c !== v.club) stages[c].remove(v.id);
  const r = stages[v.club].add(v.id, xu, now);
  if (r.replaced) {
    const out = viewers.get(r.replaced);
    if (out) reconcile(out);
  }
  if (r.status === 'queued') chipFor(v, '⏳ chờ lên sân khấu');
  if (r.status === 'full') v.goldUntil = Math.max(v.goldUntil, now + 20000); // sân + hàng chờ đầy: hàng đầu khán giả, lightstick vàng
  return r;
}
/** Vé: phòng đơn chưa có chủ là người xem (ngẫu nhiên), hết thì xếp hàng ở phòng hàng ngắn nhất. */
function claimRoom(v, now) {
  const held = roles.roleOf(v.id);
  if (held) {
    // người giữ vai tặng vé: giữ vai (gia hạn nếu không ai chờ) — không lấy thêm phòng
    const r = roles.request(held.club, held.role, v.id, now);
    chipFor(v, `${ROLE_INFO[held.role].icon} ${r.status === 'extended' ? '+90 giây' : 'giữ vai'}`);
    return 'extended';
  }
  const owned = seatHouse.ownedBy(v.id);
  if (owned) {
    owned.since = Math.max(owned.since, now - seatHouse.holdMs + 60000); // mua vé nữa: giữ chắc thêm 60 giây
    chipFor(v, '🎟️ giữ phòng thêm 60 giây');
    return 'extended';
  }
  if (seatHouse.queuedIn(v.id)) return 'queue';
  const empties = soloRooms.filter((r) => !seatHouse.get(r.id).owner);
  let target = empties.length ? pick(Math.random, empties) : null;
  if (!target) {
    const open = soloRooms.filter((r) => seatHouse.get(r.id).queue.length < seatHouse.maxQueue);
    open.sort((a, b) => seatHouse.get(a.id).queue.length - seatHouse.get(b.id).queue.length);
    target = open[0] ?? null;
  }
  if (!target) return 'full';
  const r = seatHouse.claim(target.id, { id: v.id, name: v.name }, now);
  if (r.result === 'own' || r.result === 'redirect' || r.result === 'takeover') {
    ownSince.set(r.room, now);
    if (r.result === 'takeover' && r.from) {
      const prev = viewers.get(r.from.id);
      if (prev) reconcile(prev);
    }
    chipFor(v, `🎟️ ${SOLO_PREFIX[world.byId.get(r.room).type]} ${v.name}`);
    return 'own';
  }
  if (r.result === 'queue') {
    chipFor(v, `🎟️ chờ phòng #${r.position}`);
    return 'queue';
  }
  return 'full';
}

// ---- sự kiện lớn bậc 5–7
function bigEvent(kind, v, room, p, res, now) {
  const club = v.club;
  const st = states.get(room.id);
  v.goldUntil = now + 30000;
  st.boost = 1;
  effects.confetti(room.cx, 7, -32, LOW ? 160 : 320, 8);
  audio.cheer(vol(room), 0);
  const giftName = p.giftName || 'Quà';
  const tier = kind === 'gala' ? 7 : kind === 'spotlight' ? 6 : 5;
  const text = kind === 'gala' ? `👑 GALA · ${giftName}` : kind === 'spotlight' ? `🌌 ${giftName} → ${room.def.name}` : `🎁 ${giftName}${res.xu > 1 ? ` · ${res.xu.toLocaleString('vi-VN')} xu` : ''}`;
  hud.banner({ avatar: v.avatar, name: v.name, text, sub: `${CLUB_NO[club]} ${room.def.name}`, giftImage: p.sheetItem?.image || p.image || p.giftPicture || '', tier }, now, kind === 'gala' ? 7000 : 5000);
  thank(room, v.name, giftName);
  if (kind === 'spotlight' || kind === 'gala') {
    // cả tòa nhà đổi màu đèn nhóm người tặng 30 giây, fan NPC kéo về sân đó, LED mọi sân báo tên
    if (spotlight) endSpotlight();
    const themes = new Map(groupRooms.map((r) => [r.id, states.get(r.id).theme]));
    for (const r of groupRooms) {
      world.setTheme(r, kind === 'gala' ? 'gold' : states.get(room.id).theme);
      setTicker(states.get(r.id), kind === 'gala' ? `👑 GALA của ${v.name} tại ${room.def.name}!` : `🌌 ${v.name} → ${room.def.name}!`, kind === 'gala' ? L.galaSec : 30);
    }
    spotlight = { until: now + (kind === 'gala' ? L.galaSec : 30) * 1000, themes };
    for (const a of npcs.fans) {
      if (a.hidden) continue;
      npcs.releaseSpot(a);
      a.watchFor = 30;
      npcs.sendFan(a, room);
    }
  }
  if (kind === 'gala') startGala(club, v, now);
  director.push({ kind, target: room.id, gifter: v.id, view: 'stage', focus: v.id, durMs: L.shotSec[kind] * 1000 }, now);
}
function endSpotlight() {
  if (!spotlight) return;
  for (const [id, th] of spotlight.themes) world.setTheme(world.byId.get(id), th);
  spotlight = null;
}
/** Gala: 2 idol mỗi nhóm khác sang nhảy hàng sau trên sân nhóm người tặng; PK tạm dừng đồng hồ. */
function startGala(club, v, now) {
  const room = clubRoom(club);
  if (gala) endGala();
  const borrowed = [];
  let k = 0;
  for (const c of CLUBS) {
    if (c === club) continue;
    for (const a of npcs.byRoom.get(`G${c}`).members.idols.slice(0, 2)) {
      borrowed.push({ a, pos: { ...a.body.pos }, ry: a.ry, hidden: a.hidden });
      setHidden(a, false);
      a.body.pos.x = room.cx - 5.6 + (k % 8) * 1.6;
      a.body.pos.z = -36.6;
      a.body.pos.y = room.stageY;
      a.ry = 0;
      a.forceMode = 'dance2';
      k++;
    }
  }
  for (const a of npcs.byRoom.get(room.id).members.idols) a.forceMode = 'dance2';
  gala = { club, gifter: v.id, until: now + L.galaSec * 1000, borrowed };
  S.drawLabel(world.wardrobe.screen, `👑 GALA · ${v.name}`, '#c98a14'); // biển tòa nhà (sảnh Tây) hiện tên người tặng
  if (pk && !pk.isOver(now)) pk.pause(now);
}
function endGala() {
  if (!gala) return;
  for (const b of gala.borrowed) {
    Object.assign(b.a.body.pos, b.pos);
    b.a.ry = b.ry;
    b.a.forceMode = null;
    setHidden(b.a, b.hidden);
  }
  for (const a of npcs.byRoom.get(`G${gala.club}`).members.idols) a.forceMode = null;
  for (const c of CLUBS) npcs.applyRoles(`G${c}`);
  gala = null;
  S.drawLabel(world.wardrobe.screen, '🏢 CREATOR ONLINE', '#7a5cff');
  if (pk) pk.resume(Date.now());
  if (pendingAfterGala) {
    const r = pendingAfterGala;
    pendingAfterGala = null;
    requestPk(r, Date.now());
  }
}

// ------------------------------------------------------------------ PK
function requestPk(req, now, { force = false } = {}) {
  if (gala && !force) {
    pendingAfterGala ??= req;
    return;
  }
  const r = sched.request(req, now, { force });
  if (r === 'start') beginPkFor(req, now);
  else if (r === 'pending') {
    const left = Math.max(0, Math.ceil((sched.pendingAt() - now) / 1000));
    hud.chip(`⚔️ PK sau ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
  }
  return r;
}
function beginPkFor(req, now) {
  const { act, fans } = activeCounts();
  let a = req?.club;
  let b = req?.vs;
  if (!a) {
    const pair = pickPkPair(act, lastPair) ?? [1, 2];
    [a, b] = pair;
  }
  if (!b || b === a) b = pickOpponent(a, act, fans);
  startPk(a, b, now);
}
function startPk(a, b, now) {
  if (pk && !pk.isOver(now)) return;
  pk = new PkRound({ a, b, startAt: now, durMs: CFG.coPkSec * 1000, finalMs: CFG.coPkFinalSec * 1000 });
  sched.onStart(now);
  const A = clubRoom(a);
  const B = clubRoom(b);
  hud.banner({ name: `⚔ PK: ${A.def.name} vs ${B.def.name}`, text: `${CFG.coPkSec} giây — gõ ${a} hoặc ${b} để vào phe, tặng quà để thắng!`, tier: 5 }, now, 4500);
  audio.play('whoosh', 0.8);
  for (const r of [A, B]) {
    states.get(r.id).boost = 1;
    setTimeout(() => npcSay(npcs.speaker(r.id), `PK rồi cả nhà ơi! Ủng hộ ${r.def.name} nào!`, r), 600);
  }
  mixKey = '';
}
function endPk(now) {
  const done = pk;
  const res = done.finish();
  pk = null;
  sched.onEnd(now);
  lastPair = [done.a, done.b];
  const A = clubRoom(done.a);
  const B = clubRoom(done.b);
  const sa = Math.floor(res.sides[done.a].score);
  const sb = Math.floor(res.sides[done.b].score);
  if (res.winner == null) {
    hud.banner({ name: 'PK HÒA!', text: `${A.def.name} ${sa.toLocaleString('vi-VN')} – ${sb.toLocaleString('vi-VN')} ${B.def.name}`, tier: 5 }, now, 5000);
    audio.play('bell', 0.8);
  } else {
    const W = clubRoom(res.winner);
    const loser = res.winner === done.a ? B : A;
    wins[res.winner] = (wins[res.winner] ?? 0) + 1;
    const mvp = res.mvp ? viewers.get(res.mvp.id) : null;
    hud.banner({ avatar: mvp?.avatar, name: `🏆 ${W.def.name} THẮNG!`, text: `${A.def.name} ${sa.toLocaleString('vi-VN')} – ${sb.toLocaleString('vi-VN')} ${B.def.name}`, sub: mvp ? `👑 MVP ${mvp.name}` : '', tier: 6 }, now, 6000);
    audio.play('win', 0.9);
    effects.confetti(W.cx, 7, -32, LOW ? 160 : 320, 8);
    states.get(W.id).boost = 1;
    npcSay(npcs.speaker(W.id), 'Cảm ơn cả nhà! Tụi mình thắng rồi!!!', W);
    npcSay(npcs.speaker(loser.id), 'Hẹn PK lần sau nha cả nhà!', loser);
    if (mvp) {
      const st = states.get(W.id);
      st.mvp = mvp.name;
      st.mvpUntil = now + CFG.coMvpMin * 60000;
      st.dirty = true;
      mvp.mvpUntil = now + CFG.coMvpMin * 60000;
    }
    // idol nhóm thua nhảy phạt 10 giây
    for (const a of npcs.byRoom.get(loser.id).members.idols) a.forceMode = 'clap';
    setTimeout(() => {
      for (const a of npcs.byRoom.get(loser.id).members.idols) if (a.forceMode === 'clap') a.forceMode = null;
    }, 10000);
  }
  // người đổi club trong lúc bị khoá phe → áp dụng bây giờ
  for (const v of viewers.values()) if (v.pendingClub) setClub(v, v.pendingClub);
  topDirty = true;
}
function tickPk(now) {
  if (pk) {
    if (gala) {
      if (!pk.isPaused()) pk.pause(now);
    } else if (pk.isPaused()) pk.resume(now);
    if (pk.isOver(now)) endPk(now);
    return;
  }
  if (gala) return; // PK mở sau Gala (spec §8)
  const pend = sched.takePending(now);
  if (pend) return beginPkFor(pend, now);
  if (sched.autoDue(now)) {
    const pair = pickPkPair(activeCounts().act, lastPair);
    if (pair) startPk(pair[0], pair[1], now);
    else sched.retryLater(now);
  }
}

// ------------------------------------------------------------------ vai: lệnh bình luận
const roleCmdAt = new Map();
function runRoleCommand(v, holder, cmd) {
  const now = Date.now();
  if (now - (roleCmdAt.get(v.id) ?? 0) < L.cmdGapSec * 1000) return;
  roleCmdAt.set(v.id, now);
  const room = clubRoom(holder.club);
  const st = states.get(room.id);
  st.techIdleAt = now;
  if (holder.role === 'tech') {
    const fx = { phao: 'confetti', khoi: 'smoke', laser: 'laser', den: 'theme', chop: 'flash' }[cmd.cmd];
    if (fx) {
      queueFx(room, fx);
      chipFor(v, fx === 'theme' ? '💡 đổi đèn' : FX_LABEL[fx]);
    }
  } else if (holder.role === 'manager') {
    if (cmd.cmd === 'pk') {
      if (cmd.club === holder.club) return chipFor(v, '⚔️ chọn club khác');
      requestPk({ club: holder.club, vs: cmd.club, by: v.name }, now);
    } else if (cmd.cmd === 'them' || cmd.cmd === 'bot') {
      st.idols = clampIdols(st.idols + (cmd.cmd === 'them' ? 1 : -1));
      npcs.applyRoles(room.id);
      st.dirty = true;
      chipFor(v, `💃 ${st.idols + 3} thành viên`);
    } else if (cmd.cmd === 'do') {
      const outfits = ['idolPink', 'idolWhite', 'idolBlack', 'idolRed', 'idolMint'];
      st.outfitIdx = ((st.outfitIdx ?? -1) + 1) % outfits.length;
      npcs.restyleIdols(room.id, outfits[st.outfitIdx]);
      chipFor(v, '👗 đổi trang phục');
    }
  }
}

// ------------------------------------------------------------------ bình luận, tim, follow
let bubblesUntil = [];
function canBubble(now) {
  bubblesUntil = bubblesUntil.filter((t) => t > now);
  if (bubblesUntil.length >= 3) return false;
  bubblesUntil.push(now + 4500);
  return true;
}
function onChat(p) {
  const u = userOf(p);
  if (!u) return;
  const now = Date.now();
  const raw = String(p.comment ?? '');
  const club = parseClubCode(raw);
  // bình luận là mã club: không áp club cũ trong coFan (server sẽ gửi club mới) → tránh đổi nhóm 2 lần
  const v = ensureViewer(u, { coFan: p.coFan, coFanClub: club == null });
  v.lastCommentAt = now;
  if (club != null) {
    // có coFan = bộ đếm server đang chạy → server quyết định club (gửi 'creatoronline:fan'); không có (lệnh thử) → tự đổi
    if ('coFan' in p) {
      // server từ chối khi chưa hết thời gian chờ đổi nhóm (không gửi gì) → báo cho người xem biết
      if (club !== v.club && !v.clubAuto && now - (v.clubAt ?? 0) < CFG.coClubSwitchSec * 1000) chipFor(v, '⏳ chờ chút mới đổi nhóm');
    } else {
      if (v.clubAuto || now - (v.clubAt ?? 0) >= CFG.coClubSwitchSec * 1000) {
        v.clubAt = now;
        setClub(v, club);
        reconcile(v);
      } else chipFor(v, '⏳ chờ chút mới đổi nhóm');
    }
    return;
  }
  const holder = roles.roleOf(v.id);
  const cmd = parseRoleCommand(raw);
  if (holder && cmd && cmd.role === holder.role) return runRoleCommand(v, holder, cmd);
  const text = textOf(raw);
  if (!text) return;
  const room = clubRoom(v.club);
  const st = states.get(room.id);
  if (holder?.role === 'mc') {
    v.actor?.label.say(text, 5);
    setTicker(states.get(`G${holder.club}`), `🎙️ ${v.name}: ${text}`, 8);
    return;
  }
  const owned = seatHouse.ownedBy(v.id);
  if (owned) {
    const r = world.byId.get(owned.id);
    npcs.byRoom.get(r.id).main.label.say(text, 5);
    pushComment(states.get(r.id), v.name, text, 'self');
    states.get(r.id).dirty = true;
    return;
  }
  if (v.actor && !v.actor.hidden && canBubble(now)) v.actor.label.say(text, 4.5);
  pushComment(st, v.name, text, 'npc');
  st.lastComment = { name: v.name, text, at: now };
  st.dirty = true;
  if (!v.greeted) {
    v.greeted = true;
    if (!st.greet.includes(v.name)) st.greet.push(v.name);
  }
}
function onLike(p) {
  const u = userOf(p);
  if (!u) return;
  const now = Date.now();
  const v = ensureViewer(u, { coFan: p.coFan });
  const n = Math.max(1, Number(p.likeCount) || 1);
  v.likes += n;
  v.likeBatch += n;
  const st = states.get(clubRoom(v.club).id);
  st.hearts += n;
  st.dirty = true;
  if (pk && !pk.isOver(now)) {
    const w = pk.addLikes(v.club, n, now);
    if (w === 2) v.x2 = true;
  }
  milestoneLikers.set(v.id, (milestoneLikers.get(v.id) ?? 0) + n);
  const before = Math.floor(totalLikes / CFG.coLikeMilestone);
  totalLikes += n;
  if (Math.floor(totalLikes / CFG.coLikeMilestone) > before) heartWave(now);
}
/** Mốc tim cả tòa nhà: sóng tim ở cảnh đang quay + MC cảm ơn người thả nhiều nhất đợt đó (không bao giờ cho vai/cảnh). */
function heartWave(now) {
  const room = dcam.room ?? clubRoom(1);
  const sp = stagePos(room);
  for (let i = 0; i < (LOW ? 10 : 22); i++) effects.float(pick(Math.random, ['❤️', '💖', '💗', '💕']), sp.x + (Math.random() - 0.5) * 9, sp.y - 1 + Math.random() * 2, sp.z + 2 + Math.random() * 4, { size: 0.7, rise: 2, life: 2.6 });
  audio.play('heart', 0.7);
  let best = null;
  for (const [id, n] of milestoneLikers) if (!best || n > best.n) best = { id, n };
  milestoneLikers = new Map();
  const v = best ? viewers.get(best.id) : null;
  if (v) {
    const r = clubRoom(v.club);
    npcSay(npcs.speaker(r.id), `Cảm ơn ${v.name} đã thả ${best.n.toLocaleString('vi-VN')} tim nha!`, r);
  }
  hud.chip(`❤ ${totalLikes.toLocaleString('vi-VN')} tim cả tòa nhà!`);
}
function onSocial(p) {
  const u = userOf(p);
  if (!u) return;
  const kind = /chia sẻ|share/i.test(String(p.label || '')) ? 'share' : 'follow';
  const v = ensureViewer(u, { coFan: p.coFan });
  chipFor(v, kind === 'share' ? 'đã chia sẻ 🔁' : 'đã follow ❤');
  const st = states.get(clubRoom(v.club).id);
  if (!st.thanks.some((t) => t.name === v.name)) st.thanks.push({ name: v.name, what: kind === 'share' ? 'chia sẻ' : 'follow' });
}

// ------------------------------------------------------------------ chỗ ngồi / vai: sự kiện theo thời gian
function onRoleEvent(e) {
  const v = viewers.get(e.id);
  if (e.type === 'grant' && v) {
    clearStage(v);
    director.push({ kind: 'role', target: `G${e.club}`, gifter: v.id, view: 'close', focus: v.id, durMs: L.shotSec.role * 1000 }, Date.now());
    setTicker(states.get(`G${e.club}`), `${ROLE_INFO[e.role].icon} ${v.name} là ${ROLE_INFO[e.role].label}!`, 8);
  }
  if (v) reconcile(v);
}
function onSeatEvent(e, now) {
  if (!e) return;
  const room = world.byId.get(e.room);
  if (e.from) {
    const prev = viewers.get(e.from.id);
    if (prev) reconcile(prev);
  }
  if (e.kind === 'promote' && e.to) {
    ownSince.set(e.room, now);
    const v = viewers.get(e.to.id);
    if (v) {
      clearStage(v);
      director.push({ kind: 'room', target: e.room, gifter: v.id, view: 'room', focus: v.id, durMs: L.shotSec.room * 1000 }, now);
      reconcile(v);
    }
  }
  if (e.kind === 'empty') {
    ownSince.delete(e.room);
    restoreSoloHost(room);
  }
}

// ------------------------------------------------------------------ đạo diễn
function shotAlive(s) {
  if (s.kind === 'room') return seatHouse.get(s.target)?.owner?.id === s.gifter;
  if (s.kind === 'role') return roles.roleOf(s.gifter) != null;
  return true;
}
function idleInfo() {
  const { act } = activeCounts();
  const clubs = CLUBS.filter((c) => (act[c] ?? 0) > 0).sort((a, b) => (act[b] ?? 0) - (act[a] ?? 0));
  const guests = {};
  for (const c of CLUBS) guests[c] = stages[c].entries().map((e) => e.id);
  const rooms = soloRooms.filter((r) => seatHouse.get(r.id).owner && viewers.has(seatHouse.get(r.id).owner.id)).map((r) => r.id);
  return { clubs, guests, rooms };
}
let shotNow = null;
function tickDirector(now) {
  const pkCtx = pk && !pk.isOver(now) ? { a: pk.a, b: pk.b } : null;
  const shot = director.tick(now, { pk: pkCtx, alive: shotAlive, idleNext: (t) => idleCycle.next(t, idleInfo()) });
  if (shot !== shotNow) {
    shotNow = shot;
    dcam.setShot(shot);
    mixKey = '';
    if (dcam.room?.type === 'group') states.get(dcam.room.id).camT = 0;
  }
}

// ------------------------------------------------------------------ màn hình trong cảnh
const roomsByTitle = new Map();
function seatLine(room) {
  const seat = seatHouse.get(room.id);
  if (!seat?.owner) return `🎟️ ${ticketName()} → phòng mang tên bạn`;
  const left = Math.ceil(seatHouse.lockLeft(room.id, Date.now()) / 1000);
  return `${left > 0 ? `🔒 ${left}s` : '👑 chủ phòng'}${seat.queue.length ? ` · ⏳ ${seat.queue.length} chờ` : ''}`;
}
let liveRoom = null;
function drawRoomScreens(room, t, force = false) {
  const st = states.get(room.id);
  const scr = room.screens;
  const genre = genreLabel(st.genre);
  const accent = accentOf(room);
  const beat = audio.beat(room.id);
  const now = Date.now();
  if (st.ticker && now > st.tickerUntil) {
    st.ticker = '';
    st.dirty = true;
  }
  if (st.mvp && now > st.mvpUntil) {
    st.mvp = '';
    st.dirty = true;
  }
  if (room.type !== 'group') st.seatLine = seatLine(room);
  if (force || st.signT === undefined || t - st.signT > 2 || st.dirty) {
    st.signT = t;
    S.drawSign(scr.sign, room, st, genre, accent);
  }
  const onCam = dcam.room === room;
  if (room.type === 'group') {
    const cols = (DATA.lightThemes[st.theme] ?? DATA.lightThemes.neon).colors;
    const no = clubOfRoom(room);
    let pkView = null;
    if (pk && (pk.a === no || pk.b === no)) {
      pkView = { a: `G${pk.a}`, b: `G${pk.b}`, scoreA: Math.floor(pk.score(pk.a)), scoreB: Math.floor(pk.score(pk.b)), left: pk.remaining(now) };
      roomsByTitle.clear();
      roomsByTitle.set(pkView.a, states.get(pkView.a));
      roomsByTitle.set(pkView.b, states.get(pkView.b));
    }
    S.drawLed(scr.led, room, st, genre, cols, beat, t, pkView, roomsByTitle);
    if (st.dirty || force || onCam) {
      if (st.fansDirty) rebuildRoomFans(room);
      S.drawBoard(scr.board, st, accent);
    }
    if (liveRoom !== room) S.drawTvFallback(scr.tv, st, accent, t);
    if (onCam) S.drawMixer(scr.mixer, t, accent);
  } else if (room.type === 'stand') {
    if (force || !st.washDrawn) {
      st.washDrawn = true;
      S.drawWash(scr.wash, room.washColor, st.streamer);
    }
    S.drawMonitor(scr.monitor, room, st, genre, t);
  } else if (room.type === 'sing') {
    S.drawLyrics(scr.lyrics, st, genre, beat, t, 300 + room.index * 12);
    S.drawMonitor(scr.monitor, room, st, genre, t);
  } else S.drawGame(scr.game, st, genre, t);
  st.dirty = false;
}
/** Bảng bình luận nhóm: top fan = người xem club đó theo xu buổi này (khoá theo fanKey, chỉ giữ top 10 tên). */
function rebuildRoomFans(room) {
  const st = states.get(room.id);
  const no = clubOfRoom(room);
  const list = [...viewers.values()].filter((v) => v.club === no && v.sessionXu > 0).sort((a, b) => b.sessionXu - a.sessionXu).slice(0, 10);
  st.fans = Object.fromEntries(list.map((v) => [v.name, v.sessionXu]));
  st.viewers = [...viewers.values()].filter((v) => v.club === no).length;
  st.fansDirty = false;
}
let topDirty = true;
let topList = [];
function sessionTop() {
  if (topDirty) {
    topDirty = false;
    topList = [...viewers.values()].filter((v) => v.sessionXu > 0).sort((a, b) => b.sessionXu - a.sessionXu).slice(0, 5).map((v) => ({ name: v.name, avatar: v.avatar, xu: v.sessionXu }));
  }
  return topList;
}
function drawBoardWall() {
  const { fans } = activeCounts();
  const clubs = CLUBS.map((c) => ({ no: c, title: clubRoom(c).def.name, accent: clubColor(c), xu: clubXu[c] ?? 0, wins: wins[c] ?? 0, fans: fans[c] ?? 0 }));
  S.drawLiveBoard(world.leaderboard.screen, clubs, sessionTop(), '💬 Gõ 1–5 chọn nhóm · 🌹 Quà bất kỳ → lên sân khấu');
}

// ------------------------------------------------------------------ mô phỏng phòng (không hoạt động giả)
function simulateRooms(dt, now) {
  for (const room of world.rooms) {
    const st = states.get(room.id);
    st.boost = Math.max(0, st.boost - dt * 0.6);
    // hàng hiệu ứng: 1 cái mỗi 1,5 giây
    st.fxT -= dt;
    if (st.fxQueue.length && st.fxT <= 0) {
      st.fxT = L.roomFxGapSec;
      applyFx(room, st.fxQueue.shift());
    }
    // cảm ơn quà / follow: gộp tên, 1 câu mỗi 3 giây
    st.thanksT -= dt;
    if (st.thanks.length && st.thanksT <= 0) {
      st.thanksT = 3;
      const list = st.thanks.splice(0, 3);
      const names = list.map((t) => t.name).join(', ');
      const what = list.length === 1 ? ` đã ${list[0].what === 'follow' || list[0].what === 'chia sẻ' ? list[0].what : `tặng ${list[0].what}`}` : '';
      npcSay(room.type === 'group' ? npcs.speaker(room.id) : npcs.byRoom.get(room.id).main, `Cảm ơn ${names}${what}!`, room);
    }
    // chào người mới bình luận lần đầu: gộp tên, 1 câu mỗi 5 giây
    st.greetT -= dt;
    if (st.greet.length && st.greetT <= 0) {
      st.greetT = 5;
      const names = st.greet.splice(0, 3).join(', ');
      npcSay(npcs.speaker(room.id), `Chào ${names}! 👋`, room);
    }
    if (room.type === 'group') {
      const holderMc = st.holders.mc;
      // MC NPC đọc 1 bình luận thật mỗi ~20 giây (khi không có người xem giữ vai MC)
      st.mcReadT -= dt;
      if (st.mcReadT <= 0) {
        st.mcReadT = L.mcReadEverySec * range(Math.random, 0.8, 1.2);
        if (!holderMc && st.lastComment && now - st.lastComment.at < 60000) {
          const c = st.lastComment;
          st.lastComment = null;
          npcSay(npcs.byRoom.get(room.id).members.mc, `💬 ${c.name}: "${c.text.slice(0, 40)}"`, room);
        }
      }
      // Kỹ thuật im lặng 10 giây → tự bắn hiệu ứng mỗi 8 giây
      const tech = st.holders.tech;
      if (tech && now - (st.techIdleAt ?? 0) > L.techIdleSec * 1000) {
        st.techAutoT = (st.techAutoT ?? 0) - dt;
        if (st.techAutoT <= 0) {
          st.techAutoT = L.techAutoEverySec;
          queueFx(room, pick(Math.random, ['confetti', 'smoke', 'laser', 'flash', 'theme']));
        }
      }
      st.camT += dt;
      if (st.camT > 7) {
        st.camT = 0;
        st.camIdx = (st.camIdx + 1) % room.tvCams.length;
      }
    }
    // câu thoại cư dân (chỉ phòng đang quay — nghe được + thấy được)
    st.sayT -= dt;
    if (st.sayT <= 0) {
      st.sayT = range(Math.random, 9, 16);
      if (dcam.room === room) {
        let speaker = npcs.speaker(room.id);
        let lines = DATA.streamerLines[st.genre];
        if (room.type === 'group') {
          const m = npcs.byRoom.get(room.id).members;
          const pool = ['mc', 'idol', 'tech', 'manager'].filter((r) => (r === 'idol' ? m.idols.some((a) => !a.hidden) : !m[r].hidden));
          const role = pick(Math.random, pool.length ? pool : ['idol']);
          speaker = role === 'idol' ? pick(Math.random, m.idols.filter((a) => !a.hidden)) : m[role];
          lines = DATA.streamerLines.group[role];
        } else if (npcs.byRoom.get(room.id).main.viewerId) lines = null; // phòng của người xem: chỉ nói lời của họ
        if (speaker && lines) npcSay(speaker, pick(Math.random, lines).replace(/\{room\}/g, st.title), room);
      }
    }
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
          if (dcam.room === room) npcSay(npcs.speaker(room.id), m.result === 'win' ? 'TOP 1!!! Cảm ơn cả nhà!' : 'Ui bị loại rồi... trận sau nhé!', room);
        }
        st.dirty = true;
      }
    }
  }
}

// ------------------------------------------------------------------ hệ thống chạy mỗi 0,25 giây
let slowT = 0;
let labelT = 0;
let boardT = 0;
function tickSystems(now) {
  // sân khấu
  for (const c of CLUBS) {
    const r = stages[c].tick(now);
    for (const id of r.left) {
      const v = viewers.get(id);
      if (v) reconcile(v);
    }
    for (const j of r.joined) {
      const v = viewers.get(j.id);
      if (v) reconcile(v);
    }
  }
  for (const e of roles.tick(now)) onRoleEvent(e);
  for (const e of seatHouse.tick(now)) onSeatEvent(e, now);
  // trần 300 giây giữ phòng liên tục
  for (const [roomId, since] of ownSince) {
    const s = seatHouse.get(roomId);
    if (!s?.owner) {
      ownSince.delete(roomId);
      continue;
    }
    if (now - since > L.holdMaxSec * 1000) {
      ownSince.delete(roomId);
      const c = seatHouse.leave(roomId, s.owner.id, now);
      onSeatEvent(c ?? { room: roomId, kind: 'empty', from: s.owner }, now);
      if (!c) restoreSoloHost(world.byId.get(roomId));
    }
  }
  tickPk(now);
  if (spotlight && now > spotlight.until) endSpotlight();
  if (gala && now > gala.until) endGala();
  // người xem: im lặng lâu thì rời; tim cộng dồn → chip mỗi 2 giây
  let prot = null;
  for (const v of viewers.values()) {
    if (now - v.lastActive > CFG.coViewerIdleMin * 60000 && !(prot ??= protectedIds()).has(v.id)) {
      removeViewer(v, now);
      continue;
    }
    if (v.actor && !v.place) reconcile(v); // lưới an toàn: nhân vật chưa có chỗ đứng
    if (v.likeBatch > 0 && now - v.likeChipAt >= 2000) {
      chipFor(v, `+${v.likeBatch} ❤${v.x2 ? ' ×2' : ''}`);
      v.likeBatch = 0;
      v.x2 = false;
      v.likeChipAt = now;
    }
  }
}
/** Loại + ưu tiên bảng tên (1 lần/giây): người đang được quay → người tặng quà 60 giây qua → vừa bình luận → người xem. */
function tickLabels(now) {
  const focus = shotNow?.focus ?? null;
  for (const v of viewers.values()) {
    const a = v.actor;
    if (!a) continue;
    const kind = v.id === focus ? 'spot' : v.place?.kind === 'stage' || v.place?.kind === 'role' ? 'host' : now < v.goldUntil ? 'gifter' : 'viewer';
    if (a.label.kind !== kind) a.label.setKind(kind);
    a.label.setPriority((v.rank ?? 0) * 3 + (now - v.lastGiftAt < 60000 ? 40 : 0) + (now - v.lastCommentAt < 10000 ? 20 : 0));
    const rankIcon = ['', '⭐', '💎', '👑', '🏆'][v.rank] ?? '';
    const role = v.place?.kind === 'role' ? ROLE_INFO[v.place.role].icon : '';
    const mvp = (v.mvpUntil ?? 0) > now ? '🏅' : '';
    a.label.setBadge(`${role}${mvp}${rankIcon}`);
    if (now < v.goldUntil && v.place?.kind === 'crowd') setProps(a.char, { stick: true, stickColor: 0xffd23f });
  }
  const wide = shotNow?.view === 'overview' || shotNow?.view === 'slice' || shotNow?.kind === 'pk';
  labelLayer.maxShown = wide ? 5 : 8;
}

// ------------------------------------------------------------------ HUD
/**
 * Mục chú giải cho ô quà HUD (xoay từng mục, 4 giây): mỗi hành động 1 mục với ảnh quà của nó — ô 260 px không chứa
 * nổi dòng gộp của legendRows (bảng chú giải ≤ 6 dòng dùng trong panel/màn hình lớn).
 */
let legendCache = { key: '', items: [] };
function hudLegend() {
  const key = JSON.stringify(CFG.coGiftMap);
  if (legendCache.key === key) return legendCache.items;
  const items = [{ icon: '🌹', text: 'Quà bất kỳ → lên sân khấu', giftImage: null }];
  const order = ['ticket', 'mc', 'tech', 'manager', 'genre', 'confetti', 'pkStart', 'spotlight', 'gala'];
  for (const id of order) {
    const g = (CFG.coGiftMap[id] || [])[0];
    const a = DATA.giftActions.find((x) => x.id === id);
    if (g && a) items.push({ icon: a.emoji, text: `${g.giftName} → ${a.label}`, giftImage: g.giftImage || null });
  }
  legendCache = { key, items };
  return items;
}
function tickHud(now, dt) {
  const room = dcam.room;
  hud.setTitle(room ? { title: room.type === 'group' ? `${room.id} · ${room.def.name}` : `${room.id} · ${states.get(room.id).title}`, genre: genreLabel(states.get(room.id).genre), accent: accentOf(room) } : { title: '🏢 CREATOR ONLINE', genre: '', accent: '#ff4fa3' });
  if (pk && !pk.isOver(now)) {
    const sa = pk.score(pk.a);
    const sb = pk.score(pk.b);
    const top = (c) => pk.topGifters(c, 3).map((g) => ({ name: viewers.get(g.id)?.name ?? '?', avatar: viewers.get(g.id)?.avatar ?? '' }));
    const tr = pk.trailing();
    hud.setPk({
      aNo: CLUB_NO[pk.a], bNo: CLUB_NO[pk.b], aName: clubRoom(pk.a).def.name, bName: clubRoom(pk.b).def.name,
      aScore: sa, bScore: sb, share: sa + sb > 0 ? sa / (sa + sb) : 0.5, left: Math.ceil(pk.remaining(now) / 1000),
      final: pk.isFinal(now), needXu: tr ? pk.needXu() : 0, trailing: tr === pk.a ? 'a' : tr === pk.b ? 'b' : null,
      topA: top(pk.a), topB: top(pk.b), hint: `gõ ${pk.a} hoặc ${pk.b} để vào phe`,
    });
  } else hud.setPk(null);
  // người đang được quay
  const s = shotNow;
  const v = s?.focus ? viewers.get(s.focus) : s?.gifter ? viewers.get(s.gifter) : null;
  if (v && s.endAt) {
    const where = v.place?.kind === 'role' ? `${ROLE_INFO[v.place.role].icon} ${ROLE_INFO[v.place.role].label} ${clubRoom(v.place.club).def.name}` : v.place?.kind === 'room' ? `🎟️ ${states.get(v.place.roomId).title}` : v.place?.kind === 'stage' ? `💃 trên sân ${clubRoom(v.place.club).def.name}` : `${CLUB_NO[v.club]} ${clubRoom(v.club).def.name}`;
    hud.setOnAir({ name: v.name, avatar: v.avatar, label: where, remainSec: (s.endAt - now) / 1000, progress: (s.endAt - now) / Math.max(1, s.endAt - s.startAt) });
  } else hud.setOnAir(null);
  hud.setLegend(hudLegend(), CFG.coShowGiftLegend);
  hud.setTopFans(sessionTop().slice(0, 3));
  hud.setJoinLines(L.joinLines.map((l) => l.replace('{ticket}', ticketName())), CFG.coShowJoinHint);
  hud.tick(now, dt);
  const hint = CFG.coShowJoinHint ? hud.joinLine : '';
  for (const r of groupRooms) {
    const st = states.get(r.id);
    if (st.hint !== hint) {
      st.hint = hint;
      st.dirty = true;
    }
  }
  if (DEBUG) {
    const info = renderer.info;
    hud.debug(`calls ${info.render.calls} · tris ${(info.render.triangles / 1000).toFixed(0)}k · geo ${info.memory.geometries} · tex ${info.memory.textures} · prog ${info.programs?.length ?? 0}\nfps ${fpsShown} · ms ${msAvg.toFixed(1)}/${msP95.toFixed(1)} · người xem ${viewers.size} (${spawnedCount()} hình) · nhãn ${labelLayer.shownCount}\ncảnh ${shotNow?.kind}:${shotNow?.target}:${shotNow?.view} · hàng ${director.queue.length} · PK ${pk ? `${pk.a}v${pk.b}` : '-'} · heap ${performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + 'MB' : '?'}`);
  }
}

// ------------------------------------------------------------------ âm thanh: nhạc theo phòng đang quay
let mixKey = '';
function mixAudio() {
  const room = dcam.room;
  const key = `${room?.id ?? 'lobby'}|${CFG.coMusicVol}|${CFG.coMusic}`;
  if (key === mixKey) return;
  mixKey = key;
  const v = Math.min(1, CFG.coMusicVol * 2);
  for (const r of world.rooms) audio.mix(r.id, r === room ? v : 0, 0, 0);
  audio.mix('lobby', room ? 0 : v * 0.7, 0, 0);
}
function applyAudioCfg() {
  audio.setMusic(!!CFG.coMusic);
  audio.setSfx(!!CFG.coSound);
  mixKey = '';
}

// ------------------------------------------------------------------ TV trực tiếp (vẽ cảnh lần 2) — tắt khi ?q=low / coLiveTv
const rt = new THREE.WebGLRenderTarget(512, 288);
const tvCam = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 60);
let frameNo = 0;
function renderLiveTv() {
  const want = !LOW && CFG.coLiveTv && dcam.room?.type === 'group' ? dcam.room : null;
  if (want !== liveRoom) {
    if (liveRoom) {
      liveRoom.tv.mesh.material.map = liveRoom.tv.fallback;
      liveRoom.tv.mesh.material.needsUpdate = true;
    }
    liveRoom = want;
    if (liveRoom) {
      liveRoom.tv.mesh.material.map = rt.texture;
      liveRoom.tv.mesh.material.needsUpdate = true;
    }
  }
  if (!liveRoom || frameNo % 6) return; // ~10 fps là đủ cho TV
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

// ------------------------------------------------------------------ vòng lặp chính
const beats = new Map();
const boosts = new Map();
const npcCtx = { beat: (id) => beats.get(id) ?? 0, onCheer() {} };
let liveActors = null;
function allActors() {
  if (!liveActors) {
    liveActors = npcs.all.slice();
    for (const v of viewers.values()) if (v.actor) liveActors.push(v.actor);
  }
  return liveActors;
}
function updateViewerActors(dt) {
  for (const v of viewers.values()) {
    const a = v.actor;
    if (!a || a.hidden) continue;
    const kind = v.place?.kind;
    if (kind === 'stage') {
      const beat = beats.get(`G${v.place.club}`) ?? 0;
      const order = ['dance1', 'dance2', 'dance4', 'dance3'];
      a.mode = order[Math.floor(beat / 16) % order.length];
      if (!a.far) animateCharacter(a.char, dt, { mode: a.mode, speed: 0, beat });
    } else if (kind === 'role') {
      const beat = beats.get(`G${v.place.club}`) ?? 0;
      a.mode = v.place.role === 'mc' ? 'mc' : v.place.role === 'tech' ? 'type' : 'manager';
      if (!a.far) animateCharacter(a.char, dt, { mode: a.mode, speed: 0, beat });
    } else if (a.path?.length) {
      npcs.walk(a, dt);
    } else {
      const beat = beats.get(`G${v.club}`) ?? 0;
      a.ry += ((a.crowdRy ?? Math.PI) - a.ry) * Math.min(1, dt * 5);
      a.mode = Math.floor(beat / 8) % 3 === 2 ? 'clap' : 'wave';
      if (!a.far) animateCharacter(a.char, dt, { mode: a.mode, speed: 0, beat });
      stepBody(a.body, 0, 0, dt, world.collision, DATA.tuning.gravity);
    }
  }
}
let lastFrame = performance.now();
let lastRender = 0;
let sysT = 0;
let screensT = 0;
let fpsN = 0;
let fpsT = 0;
let fpsShown = 0;
const msBuf = [];
let msAvg = 0;
let msP95 = 0;
function frame(now, once = false) {
  if (!once) requestAnimationFrame(frame);
  if (!once && now - lastRender < 1000 / FPS - 2) return; // giới hạn FPS (30 khi ?q=low)
  lastRender = now;
  const t0 = performance.now();
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000)); // chặn dt âm (gọi frame() tay xen rAF)
  lastFrame = Math.max(lastFrame, now);
  const t = now / 1000;
  const wall = Date.now();
  frameNo++;
  for (const room of world.rooms) {
    beats.set(room.id, audio.beat(room.id));
    boosts.set(room.id, states.get(room.id).boost);
  }
  sysT -= dt;
  if (sysT <= 0) {
    sysT = 0.25;
    tickSystems(wall);
    tickDirector(wall);
    simulateRooms(0.25, wall);
    tickHud(wall, 0.25);
    labelT -= 0.25;
    if (labelT <= 0) {
      labelT = 1;
      tickLabels(wall);
      boardT -= 1;
      if (boardT <= 0) {
        boardT = shotNow?.view === 'board' ? 1 : 8;
        drawBoardWall();
      }
    }
    slowT -= 0.25;
    if (slowT <= 0) {
      slowT = 2;
      saveSession(wall);
      if (fanAsk.size) askFans();
    }
  } else tickDirector(wall);
  const view = shotNow?.view;
  const cullDist = view === 'overview' ? 140 : view === 'slice' ? 70 : 52;
  for (const a of allActors()) {
    a.far = camera.position.distanceTo(a.char.root.position) > cullDist;
    a.char.root.visible = !a.hidden && !a.far;
  }
  npcs.update(dt, npcCtx);
  updateViewerActors(dt);
  const actors = allActors();
  separateActors(actors);
  for (const a of actors) syncActor(a);
  effects.update(dt);
  world.update(dt, t, beats, boosts);
  // màn hình: phòng đang quay 4 lần/giây, LED các sân 1,5 giây, phòng khác chỉ biển cửa
  screensT -= dt;
  if (screensT <= 0) {
    screensT = 0.25;
    for (const room of world.rooms) {
      const st = states.get(room.id);
      st.scrT -= 0.25;
      if (st.scrT <= 0 || st.dirty) {
        st.scrT = dcam.room === room ? 0.25 : room.type === 'group' ? 1.5 : 3;
        drawRoomScreens(room, t);
      }
    }
  }
  mixAudio();
  dcam.update(dt, t, actorById, wall);
  world.followShadow(dcam.look.x, dcam.look.z);
  renderLiveTv();
  renderer.render(scene, camera);
  labelLayer.render(camera, window.innerWidth, window.innerHeight, dt);
  // đo thời gian khung (?debug=1)
  const ms = performance.now() - t0;
  msBuf.push(ms);
  if (msBuf.length > 120) msBuf.shift();
  fpsN++;
  fpsT += dt;
  if (fpsT >= 1) {
    fpsShown = Math.round(fpsN / fpsT);
    fpsN = 0;
    fpsT = 0;
    const sorted = msBuf.slice().sort((a, b) => a - b);
    msAvg = sorted.reduce((s, x) => s + x, 0) / Math.max(1, sorted.length);
    msP95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  }
}

// ------------------------------------------------------------------ cấp fan trọn đời (server)
const fanAsk = new Set();
async function askFans() {
  const ids = [...fanAsk].slice(0, 100);
  for (const id of ids) fanAsk.delete(id);
  try {
    const r = await fetch(`/api/creatoronline/fans?ids=${encodeURIComponent(ids.join(','))}`);
    if (!r.ok) return;
    const { fans } = await r.json();
    for (const [id, f] of Object.entries(fans || {})) {
      const v = viewers.get(id);
      if (v) applyCoFan(v, f), reconcile(v);
    }
  } catch {
    /* server cũ / mất kết nối: giữ club tự xếp */
  }
}
function onFanUpdate(f) {
  if (!f?.id) return;
  const v = viewers.get(String(f.id));
  if (!v) return;
  if (Number.isInteger(f.rank)) v.rank = f.rank;
  if (Number.isFinite(f.xu)) v.lifeXu = f.xu;
  if (f.club && f.club !== v.club) {
    v.clubAt = Date.now();
    setClub(v, f.club);
    reconcile(v);
  } else if (f.club) v.clubAuto = false;
}

// ------------------------------------------------------------------ buổi LIVE: lưu / khôi phục / làm mới
const SESSION_KEY = 'co_session_v1';
function saveSession(now) {
  try {
    const keep = protectedIds();
    const recent = [...viewers.values()].filter((v) => !keep.has(v.id) && now - v.lastActive < CFG.coViewerIdleMin * 60000).sort((a, b) => b.lastActive - a.lastActive);
    const list = [...viewers.values()].filter((v) => keep.has(v.id)).concat(recent).slice(0, 400);
    const snap = {
      at: now,
      roomId: sessionRoomId,
      viewers: list.map((v) => ({ id: v.id, name: v.name, avatar: v.avatar, club: v.club, clubAuto: v.clubAuto, rank: v.rank, sessionXu: v.sessionXu, likes: v.likes, lastActive: v.lastActive, lastGiftAt: v.lastGiftAt, greeted: v.greeted, spawned: !!v.actor })),
      stages: CLUBS.map((c) => stages[c].toJSON()),
      roles: roles.toJSON(),
      seats: soloRooms.map((r) => [r.id, seatHouse.snapshot(r.id)]),
      ownSince: [...ownSince],
      pk: pk ? pk.toJSON() : null,
      sched: sched.toJSON(),
      director: director.toJSON(),
      idle: idleCycle.toJSON(),
      wins, clubXu, totalLikes, lastPair,
      mvp: groupRooms.map((r) => [r.id, states.get(r.id).mvp, states.get(r.id).mvpUntil]),
      idols: groupRooms.map((r) => [r.id, states.get(r.id).idols, states.get(r.id).genre, states.get(r.id).theme]),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(snap));
  } catch {
    /* localStorage đầy / bị chặn: bỏ qua */
  }
}
function restoreSession() {
  let snap = null;
  try {
    snap = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    snap = null;
  }
  const now = Date.now();
  if (!snap || now - snap.at > L.sessionRestoreMaxSec * 1000) return false;
  sessionRoomId = snap.roomId ?? null;
  try {
    stages = Object.fromEntries(CLUBS.map((c, i) => [c, StageSlots.fromJSON(snap.stages?.[i], stageOpts())]));
    roles = RoleBoard.fromJSON(snap.roles, roleOpts());
    for (const [id, s] of snap.seats ?? []) if (s) seatHouse.load(id, s);
    for (const [id, t] of snap.ownSince ?? []) ownSince.set(id, t);
    pk = snap.pk ? PkRound.fromJSON(snap.pk) : null;
    sched = PkScheduler.fromJSON(snap.sched, schedOpts());
    director = Director.fromJSON(snap.director, dirOpts());
    idleCycle = IdleCycle.fromJSON(snap.idle);
    wins = snap.wins ?? wins;
    clubXu = snap.clubXu ?? clubXu;
    totalLikes = snap.totalLikes ?? 0;
    lastPair = snap.lastPair ?? null;
    for (const [id, name, until] of snap.mvp ?? []) Object.assign(states.get(id), { mvp: name, mvpUntil: until });
    for (const [id, idols, genre, theme] of snap.idols ?? []) {
      const st = states.get(id);
      st.idols = idols;
      if (genre && genre !== st.genre) {
        st.genre = genre;
        audio.setChannel(id, genreSrc(genre));
      }
      if (theme) applyTheme(world.byId.get(id), theme);
    }
    for (const s of snap.viewers ?? []) {
      viewers.set(s.id, { id: s.id, name: s.name, avatar: s.avatar, club: s.club, clubAuto: s.clubAuto, pendingClub: null, rank: s.rank ?? 0, lifeXu: 0, sessionXu: s.sessionXu ?? 0, likes: s.likes ?? 0, likeBatch: 0, likeChipAt: 0, lastActive: s.lastActive, lastGiftAt: s.lastGiftAt ?? 0, lastCommentAt: 0, goldUntil: 0, greeted: !!s.greeted, actor: null, place: null, crowdSpot: null, autoChip: false, spawnWanted: s.spawned });
      fanAsk.add(s.id);
    }
    const keep = protectedIds();
    for (const v of viewers.values()) if (v.spawnWanted || keep.has(v.id)) trySpawn(v, keep.has(v.id));
    for (const v of viewers.values()) reconcile(v);
    for (const r of soloRooms) {
      const s = seatHouse.get(r.id);
      s.queue = s.queue.filter((q) => viewers.has(q.id));
      if (s.owner && !viewers.has(s.owner.id)) onSeatEvent(seatHouse.leave(r.id, s.owner.id, now), now);
    }
    topDirty = true;
    for (const r of groupRooms) npcs.applyRoles(r.id);
    return true;
  } catch (e) {
    console.warn('[creatoronline] khôi phục buổi LIVE lỗi, bắt đầu mới:', e);
    newSession(sessionRoomId);
    return false;
  }
}
/** Buổi LIVE mới (đổi phòng TikTok / lệnh 🧹 Làm mới buổi): xoá PK, vai, phòng, khách trên sân, top fan buổi. */
function newSession(roomId) {
  const now = Date.now();
  pendingAfterGala = null; // không mở PK thừa khi kết thúc Gala dưới đây
  if (gala) endGala();
  endSpotlight();
  for (const v of [...viewers.values()]) despawn(v);
  viewers.clear();
  roleCmdAt.clear();
  fanAsk.clear();
  for (const r of soloRooms) {
    const s = seatHouse.get(r.id);
    s.queue.length = 0; // trước leave(): leave() đẩy người đầu hàng lên làm chủ
    if (s.owner) seatHouse.leave(r.id, s.owner.id, now);
    restoreSoloHost(r);
    Object.assign(states.get(r.id), { comments: [], thanks: [], greet: [], hearts: 0, giftTotal: 0, dirty: true });
  }
  ownSince.clear();
  for (const r of groupRooms) {
    const st = states.get(r.id);
    st.holders = { mc: null, tech: null, manager: null, idol: {} };
    Object.assign(st, { giftTotal: 0, hearts: 0, fans: {}, comments: [], lastGift: null, mvp: '', mvpUntil: 0, ticker: '', fxQueue: [], thanks: [], greet: [], lastComment: null, dirty: true });
    npcs.applyRoles(r.id);
    for (const c of crowdSpots(r)) c.occ = null;
  }
  freshSystems();
  sessionRoomId = roomId ?? null;
  shotNow = null;
  topDirty = true;
  syncNpcCrowd();
  saveSession(now);
}

// ------------------------------------------------------------------ lệnh từ panel (POST /api/games/creatoronline/cmd)
function testUser(name) {
  const n = name || pick(Math.random, DATA.fanNames);
  return { userId: `test_${n}`, uniqueId: `test_${n}`, nickname: n, profilePicture: '' };
}
function onAppCmd(d) {
  if (!d || d.gameId !== 'creatoronline') return;
  const p = d.payload || {};
  const now = Date.now();
  if (d.cmd === 'test') {
    const u = testUser(p.name);
    if (p.kind === 'gift') {
      const coins = Math.max(1, Number(p.coins) || 1);
      onGift({ ...u, giftId: p.giftId || '', giftName: p.giftName || (coins >= 10000 ? 'Sư tử' : coins >= 1000 ? 'Thiên hà' : coins >= 299 ? 'Chó Corgi' : coins >= 99 ? 'Vương miện nhỏ' : coins >= 30 ? 'Bánh vòng' : coins >= 5 ? 'Bắn tim' : 'Hoa hồng'), coinValue: coins, repeatCount: 1 });
    } else if (p.kind === 'action') {
      const g = (CFG.coGiftMap[p.action] || [])[0];
      if (g) onGift({ ...u, giftId: g.giftId, giftName: g.giftName, coinValue: g.coins || 1, repeatCount: 1, sheetItem: { image: g.giftImage } });
      else hud.chip(`Chưa gán quà cho "${p.action}"`);
    } else if (p.kind === 'comment') onChat({ ...u, comment: p.text || pick(Math.random, DATA.comments.any) });
    else if (p.kind === 'like') onLike({ ...u, likeCount: 20 });
    else if (p.kind === 'follow') onSocial({ ...u, label: 'đã theo dõi' });
  } else if (d.cmd === 'pk') {
    if (pk && !pk.isOver(now)) return hud.chip('⚔️ Đang có PK');
    const club = (x) => (Number.isInteger(Number(x)) && Number(x) >= 1 && Number(x) <= 5 ? Number(x) : undefined);
    const a = club(p.a);
    const b = club(p.b);
    requestPk(a ? { club: a, vs: b !== a ? b : undefined } : {}, now, { force: true });
  } else if (d.cmd === 'skip') director.skip(now);
  else if (d.cmd === 'cut' && p.target && world.byId.get(p.target)) director.push({ kind: 'big', target: p.target, gifter: null, view: 'stage', durMs: 15000 }, now);
  else if (d.cmd === 'reset') newSession(sessionRoomId);
}

// ------------------------------------------------------------------ config đổi giữa buổi (gameConfig)
function applyServerConfig(raw) {
  const prev = CFG;
  CFG = normalizeCfg(raw);
  if ((CFG.coQuality === 'low') !== LOW) {
    const u = new URL(location.href);
    if (CFG.coQuality === 'low') u.searchParams.set('q', 'low'), u.searchParams.set('qa', '1');
    else u.searchParams.delete('q'), u.searchParams.delete('qa');
    saveSession(Date.now());
    location.replace(u.href);
    return;
  }
  if (prev.coBadWords !== CFG.coBadWords) filterText = makeTextFilter(CFG.coBadWords);
  // đổi thông số: dựng lại từ ảnh chụp với thông số mới (giữ người đang trên sân / giữ vai / PK) — chỉ hệ thống bị đổi
  const changed = (keys) => keys.some((k) => prev[k] !== CFG[k]);
  if (changed(['coStageSlots', 'coStageBaseSec', 'coStagePerCoinSec', 'coStageMaxSec'])) stages = Object.fromEntries(CLUBS.map((c) => [c, StageSlots.fromJSON(stages[c].toJSON(), stageOpts())]));
  if (changed(['coRoleSec', 'coRoleLockSec', 'coRoleMaxSec'])) roles = RoleBoard.fromJSON(roles.toJSON(), roleOpts());
  if (changed(['coPkEveryMin'])) sched = PkScheduler.fromJSON(sched.toJSON(), schedOpts());
  if (changed(['coCamMaxPer5Min'])) {
    director = Director.fromJSON(director.toJSON(), dirOpts());
    shotNow = director.current; // cùng cảnh → không cắt lại camera
    dcam.shot = shotNow;
  }
  // giảm số chỗ sân khấu / vai: người ở chỗ bị bỏ phải về khu khán giả (không đứng đơ trên sân)
  for (const v of viewers.values()) reconcile(v);
  seatHouse.holdMs = CFG.coRoomHoldSec * 1000;
  seatHouse.maxQueue = CFG.coRoomQueueMax;
  applyAudioCfg();
  syncNpcCrowd();
  for (const r of world.rooms) states.get(r.id).dirty = true;
}

// ------------------------------------------------------------------ khởi động
for (const room of world.rooms) drawRoomScreens(room, 0, true);
S.drawWheel(world.wheel.screen, DATA.wheel);
S.drawLabel(world.wardrobe.screen, '🏢 CREATOR ONLINE', '#7a5cff');
drawBoardWall();
syncNpcCrowd();
restoreSession();
// Âm thanh: OBS cho tự phát → tạo AudioContext ngay; trình duyệt thường chặn thì mở lại ở cú click/phím đầu tiên
audio.init();
applyAudioCfg();
const unlock = () => audio.init();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);
document.getElementById('loading')?.remove();
requestAnimationFrame(frame);
// Nhịp dự phòng: cửa sổ game thu nhỏ / nguồn OBS ẩn → requestAnimationFrame đứng, nhưng quà/bình luận vẫn tới →
// hết giờ sân/vai/phòng, PK, lưu buổi LIVE vẫn phải chạy (không dồn lại xử lý một lúc khi hiện lại).
let bgSaveT = 0;
setInterval(() => {
  if (performance.now() - lastRender < 700) return;
  const wall = Date.now();
  tickSystems(wall);
  tickDirector(wall);
  simulateRooms(0.25, wall);
  bgSaveT -= 0.25;
  if (bgSaveT <= 0) {
    bgSaveT = 2;
    saveSession(wall);
    if (fanAsk.size) askFans();
  }
}, 250);

if (typeof window.io === 'function') {
  const socket = window.io({ reconnection: true, reconnectionDelay: 600, reconnectionDelayMax: 5000 });
  // cửa sổ game (Edge/Chrome --app, ?win=1): app tắt / mất kết nối quá 4 giây → tự đóng, không để game 3D chạy mồ côi
  let winCloseT = WIN ? setTimeout(() => window.close(), 9000) : 0;
  socket.on('disconnect', () => {
    if (!WIN) return;
    clearTimeout(winCloseT);
    winCloseT = setTimeout(() => window.close(), 4000);
  });
  socket.on('connect', async () => {
    clearTimeout(winCloseT);
    try {
      const r = await fetch('/api/games/creatoronline/config');
      if (r.ok) applyServerConfig(await r.json());
    } catch {
      /* giữ cấu hình đang có */
    }
    socket.emit('subscribe', 'overlay');
    socket.emit('subscribe', 'co-overlay'); // bộ đếm fan trên server chỉ ghi khi có overlay này
  });
  socket.on('gameConfig', (d) => d && d.gameId === 'creatoronline' && applyServerConfig(d.config));
  socket.on('overlay:reload', (d) => {
    if (!d || !d.gameId || d.gameId === 'creatoronline') {
      saveSession(Date.now());
      location.reload();
    }
  });
  socket.on('gameDisabled', (d) => {
    if (d && d.gameId === 'creatoronline') document.body.style.visibility = 'hidden';
  });
  socket.on('gameEnabled', (d) => {
    if (d && d.gameId === 'creatoronline') document.body.style.visibility = '';
  });
  socket.on('status', (s) => {
    // buổi LIVE mới = phòng TikTok khác lần trước
    if (s?.connected && s.roomId && String(s.roomId) !== String(sessionRoomId)) {
      if (sessionRoomId == null && viewers.size === 0) sessionRoomId = String(s.roomId);
      else newSession(String(s.roomId));
    }
  });
  socket.on('gift', (g) => g && onGift(g));
  socket.on('chat', (c) => c && onChat(c));
  socket.on('like', (l) => l && onLike(l));
  socket.on('social', (s) => s && onSocial(s));
  socket.on('creatoronline:fan', onFanUpdate);
  socket.on('gameCmd', onAppCmd);
}

// ------------------------------------------------------------------ gỡ lỗi / soak test (?debug=1)
let simTimer = 0;
/** Luồng sự kiện giả (khoá 'sim…' → server không ghi cấp fan): bình luận / tim / quà mỗi phút. */
function sim({ commentsPerMin = 40, likesPerMin = 60, giftsPerMin = 12, people = 80 } = {}) {
  clearInterval(simTimer);
  if (!commentsPerMin && !likesPerMin && !giftsPerMin) return;
  simTimer = setInterval(() => {
    const roll = (perMin) => Math.random() < perMin / 240;
    const who = () => {
      const k = Math.floor(Math.random() * people);
      return { userId: `sim${k}`, uniqueId: `sim${k}`, nickname: `${pick(Math.random, DATA.fanNames)} ${k}`, profilePicture: '' };
    };
    if (roll(commentsPerMin)) onChat({ ...who(), comment: Math.random() < 0.15 ? String(1 + Math.floor(Math.random() * 5)) : pick(Math.random, DATA.comments.any) });
    if (roll(likesPerMin)) onLike({ ...who(), likeCount: 1 + Math.floor(Math.random() * 25) });
    if (roll(giftsPerMin)) {
      const c = pick(Math.random, [1, 1, 1, 1, 5, 10, 30, 99, 99, 299, 1000, 30000]);
      onGift({ ...who(), giftId: '', giftName: 'Quà thử', coinValue: c, repeatCount: c === 1 ? 1 + Math.floor(Math.random() * 5) : 1 });
    }
  }, 250);
}
window.__creator = {
  get CFG() { return CFG; }, world, npcs, states, viewers, get stages() { return stages; }, get roles() { return roles; }, seatHouse,
  get director() { return director; }, get pk() { return pk; }, dcam, renderer, scene, camera, audio, labelLayer, hud,
  onGift, onChat, onLike, onSocial, onAppCmd, newSession, sim: DEBUG || location.hostname === '127.0.0.1' || location.hostname === 'localhost' ? sim : undefined,
  frame: () => frame(performance.now(), true),
};
