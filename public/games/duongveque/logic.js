/* 🛵 Đường Về Quê — luật thuần (không DOM, không vẽ). Overlay (game.js) gọi step(dt) mỗi khung rồi vẽ theo `state`
 * và các sự kiện drainEvents(); test ở tests/duongveque-logic.test.mjs.
 *
 * Luật chính:
 *  - Streamer chạy xe máy về quê: xe tự chạy khi còn xăng, xăng tụt dần. Streamer chỉ bấm NHẢY (né chuối/ổ gà)
 *    và HÚC (phản đòn chó, đàn vịt, xe container, vật cản sát xe) — hoặc để Tự lái (AI bấm thay, treo máy).
 *  - Quà chia 2 phe: 🛡️ CỨU đẩy xe tới / đổ xăng / che chắn, ⚔️ PHÁ thả vật cản / đẩy lùi. Mức tác dụng tính theo
 *    XU (metersFor) cho mọi hành động → quà giúp và quà phá cùng giá triệt tiêu nhau. Tặng ×N chạy đủ N lần (gộp xu).
 *  - Lốc xoáy: 10 giây phe Cứu gom đủ xu thì thoát, không thì bị hất lùi. Hết xăng: 10 giây không ai đổ → dắt bộ.
 *  - Về tới quê trước khi hết giờ → phe Cứu thắng; hết giờ → phe Phá thắng. 30 giây cuối mọi quà ×2.
 */

import { rangesOf } from './route.js';

export const SIDES = ['cuu', 'pha'];

// min = giá xu tối thiểu khi quà CHƯA GÁN tự chọn hành động theo giá (quà đã gán thì giá nào cũng chạy đúng hành động đó).
export const ACTIONS = [
  { id: 'wind',      side: 'cuu', emoji: '🌬️', label: 'Gió xuôi',      min: 0 },
  { id: 'fuel',      side: 'cuu', emoji: '⛽', label: 'Đổ xăng',       min: 2 },
  { id: 'nitro',     side: 'cuu', emoji: '🚀', label: 'Nitro',         min: 20 },
  { id: 'helmet',    side: 'cuu', emoji: '⛑️', label: 'Mũ bảo hiểm',   min: 90 },
  { id: 'convoy',    side: 'cuu', emoji: '🏍️', label: 'Đoàn phượt',    min: 150 },
  { id: 'tow',       side: 'cuu', emoji: '🚛', label: 'Xe cứu hộ',     min: 300 },
  { id: 'heli',      side: 'cuu', emoji: '🚁', label: 'Trực thăng',    min: 1000 },
  // chỉ chạy khi đã GÁN quà (min vô cực → quà chưa gán không bao giờ rơi vào đây)
  { id: 'driver',    side: 'cuu', emoji: '🧑‍✈️', label: 'Lên làm tài xế', min: Infinity },
  { id: 'banana',    side: 'pha', emoji: '🍌', label: 'Vỏ chuối',      min: 0 },
  { id: 'pothole',   side: 'pha', emoji: '🕳️', label: 'Ổ gà',          min: 2 },
  { id: 'dog',       side: 'pha', emoji: '🐕', label: 'Chó rượt',      min: 20 },
  { id: 'ducks',     side: 'pha', emoji: '🦆', label: 'Đàn vịt',       min: 90 },
  { id: 'rain',      side: 'pha', emoji: '🌧️', label: 'Mưa ngập',      min: 150 },
  { id: 'container', side: 'pha', emoji: '🚚', label: 'Xe container',  min: 300 },
  { id: 'tornado',   side: 'pha', emoji: '🌪️', label: 'Lốc xoáy',      min: 1000 },
];
export const ACTION_BY_ID = Object.fromEntries(ACTIONS.map(a => [a.id, a]));

export const DEFAULTS = {
  goal: 6000,          // mét tới cổng làng (6 km)
  roundSec: 240,       // giây một ván
  finalSec: 30,        // nước rút: bấy nhiêu giây cuối mọi quà ×finalMult
  finalMult: 2,
  speed: 27.8,         // m/giây khi còn xăng (≈ 100 km/h)
  walkSpeed: 3,        // m/giây khi dắt bộ (hết xăng quá rescueSec)
  fuelBurn: 3,         // % xăng/giây (đầy bình ≈ 33 giây chạy)
  fuelPerCoin: 1.5,    // quà Đổ xăng: % xăng mỗi xu (tối thiểu fuelMin)
  fuelMin: 6,
  likeFuel: 2,         // % xăng mỗi đợt tim (likePer tim)
  shareFuel: 12,
  followFuel: 8,
  meterPerCoin: 5,     // mỗi xu = bấy nhiêu mét (đẩy tới hoặc lùi)
  minMeters: 15,
  likePer: 300,        // đủ bấy nhiêu tim cả phòng → 1 cơn gió nhỏ + chút xăng
  lobbySec: 8,
  resultSec: 12,
  depotFireSec: 9.5,   // bị đẩy về bến xe: bến cháy bấy nhiêu giây rồi mới hiện kết quả (ván giữ thêm chừng ấy)
  rescueSec: 10,
  tornadoNeed: 0.3,    // lốc xoáy: phe Cứu cần gom đủ bấy nhiêu phần giá lốc trong rescueSec
  ramCd: 12,           // giây hồi chiêu HÚC
  dodgeMax: 10,        // vật cản giá ≤ bấy nhiêu xu thì NHẢY né được
  autoPilot: true,     // AI tự nhảy / húc (treo máy)
  aiDodge: 0.3,        // Tự lái: xác suất nhảy né vật cản rẻ (cao quá thì phe Cứu thắng gần hết)
  aiRam: 0.25,         // Tự lái: xác suất húc chó / vịt / container
  autoNext: true,      // hết ván tự sang ván mới
  defaultSide: 'cuu',  // quà chưa gán của người chưa chọn phe tính cho phe này
  flagEvery: 500,      // cắm cờ mốc mỗi bấy nhiêu mét
  backFloor: 0.25,     // bị đẩy lùi quá vạch xuất phát bấy nhiêu phần đường (0,25 × 6 km = 1,5 km) → về lại BẾN XE: phe Phá thắng ngay
  pushRate: 300,       // cú đẩy dài chạy tối đa bấy nhiêu m/giây (quà to = bị đẩy tuột lâu hơn, tối đa pushMax giây)
  pushMax: 5,
  driverSec: 180,      // 🧑‍✈️ mỗi lượt tài xế bấy nhiêu giây; hết giờ không ai chờ → người đang lái giữ nguyên
  seats: 14,           // chỗ ngồi hiện trên xe (người phe Cứu); dư thì chỉ đếm "+N"
  maxCars: 5,          // 🚌 đoàn xe: đầy seats ghế thì nối thêm 1 xe phía sau (tối đa bấy nhiêu xe)
  windowSeats: 6,      // mỗi xe 6 chỗ trong cửa sổ — dư ngồi trên nóc = CHỞ QUÁ SỐ NGƯỜI (CSGT phạt)
  speedLimit: 150,     // km/h: được đẩy vọt quá mức này là QUÁ TỐC ĐỘ
  speedTrap: 0.5,      // mỗi lần quá tốc độ ≥ 1,5 giây: xác suất bị CSGT bắn tốc độ bắt ngay (1 lần CSGT/ván)
  maxRiders: 300,      // nhớ tối đa bấy nhiêu người đã lên xe (LIVE dài)
  // ---- lộ trình về quê (mỗi ván 1 lần, theo phần quãng đường) ----
  restStop: true, restAt: 0.4, restSec: 30,     // 🍜 trạm dừng chân: cả đoàn xuống ăn uống — ĐỒNG HỒ VÁN DỪNG
  gasStop: true, gasAt: 0.7, gasSec: 15,        // ⛽ trạm xăng: đi vệ sinh + đổ đầy bình — đồng hồ dừng
  police: true, policeChance: 0.7,              // 🚓 CSGT kiểm tra (ngẫu nhiên): thả đủ policeLikes tim mới được đi
  policeLikes: 2000, coinLikes: 10,             // quà Cứu lúc bị giữ: 1 xu = coinLikes tim
  policeMaxSec: 45,                             // quá bấy nhiêu giây chưa đủ tim → nộp phạt (lùi policeFine mét) rồi đi
  policeFine: 150,
  roadEvents: 3,                                // số tình huống đường xá mỗi ván (kẹt xe, chắn tàu, đàn bò, thủng lốp, say xe, check-in, lì xì)
  flatLikes: 600, flatMaxSec: 25,               // 🛞 thủng lốp: thả bấy nhiêu tim để bơm
  maxUsers: 2000,      // quá bấy nhiêu người xem thì đầu ván dọn người không còn trên xe / không lái
};

const DODGE_KINDS = new Set(['banana', 'pothole']);
const EXCLUSIVE = new Set(['container', 'tornado', 'heli']);

export function normName(s) {
  return String(s || '').toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** Quãng đường tự theo thời gian ván: 25 m mỗi giây (4 phút = 6 km, 10 phút = 15 km), làm tròn 500 m, tối thiểu 2 km.
 *  Mỗi tỉnh vì thế luôn chiếm ~1/34 thời gian ván — địa danh chia đều theo thời gian. Mô phỏng: ngang xu vẫn ≈ 50/50. */
export const METERS_PER_ROUND_SEC = 25;
export function goalFor(roundSec) { return Math.max(2000, Math.round((Number(roundSec) || 240) * METERS_PER_ROUND_SEC / 500) * 500); }
/** Số tình huống dọc đường theo độ dài ván: 4 phút 3 cái, 10 phút 7 cái (đủ mọi loại). */
export function roadEventsFor(roundSec) { return Math.max(3, Math.min(7, Math.round(3 * (Number(roundSec) || 240) / 240))); }
/** Cờ mốc: 12 mốc đều trên đường, làm tròn 100 m. */
export function flagEveryFor(goal) { return Math.max(300, Math.round(goal / 12 / 100) * 100); }

/** Mét tác dụng của quà (đẩy tới hoặc lùi) — tuyến tính theo xu, tối thiểu minMeters. */
export function metersFor(coins, cfg = DEFAULTS) {
  const per = Number(cfg.meterPerCoin) || DEFAULTS.meterPerCoin;
  const min = Number(cfg.minMeters) || DEFAULTS.minMeters;
  return Math.max(min, Math.round(Math.max(0, Number(coins) || 0) * per));
}

/** Quà chưa gán: hành động bậc cao nhất của phe có min ≤ giá. */
export function pickAction(side, coins) {
  const c = Math.max(0, Number(coins) || 0);
  let best = null;
  for (const a of ACTIONS) if (a.side === side && a.min <= c && (!best || a.min >= best.min)) best = a;
  return best ? best.id : (side === 'pha' ? 'banana' : 'wind');
}

/** Phe chọn bằng bình luận: 1 / C / cứu → cuu · 2 / P / phá → pha. */
export function sideFromComment(text) {
  const t = normName(text).replace(/[!.?~]+$/g, '');
  if (/^(1|c|cứu|cuu|cuu oi|cứu ơi|phe cứu|team cứu)$/.test(t)) return 'cuu';
  if (/^(2|p|phá|pha|phe phá|team phá)$/.test(t)) return 'pha';
  return null;
}

/**
 * Tìm hành động cho quà: giftMap = { [actionId]: [{ giftId, giftName, names? }] } — khớp id trước, rồi tên (đúng cả chuỗi).
 * Không khớp → theo phe người tặng đã chọn (hoặc defaultSide) + bậc giá.
 */
export function resolveGift(gift, giftMap, userSide, defaultSide = 'cuu') {
  const id = gift && gift.giftId != null ? String(gift.giftId) : '';
  const name = normName(gift && gift.giftName);
  const map = giftMap && typeof giftMap === 'object' ? giftMap : {};
  if (id) {
    for (const act of Object.keys(map)) {
      if (!ACTION_BY_ID[act]) continue;
      if ((map[act] || []).some(g => g && String(g.giftId) === id)) return { action: act, side: ACTION_BY_ID[act].side, mapped: true };
    }
  }
  if (name) {
    for (const act of Object.keys(map)) {
      if (!ACTION_BY_ID[act]) continue;
      if ((map[act] || []).some(g => g && (normName(g.giftName) === name || (Array.isArray(g.names) && g.names.some(n => normName(n) === name))))) {
        return { action: act, side: ACTION_BY_ID[act].side, mapped: true };
      }
    }
  }
  const side = userSide === 'pha' || userSide === 'cuu' ? userSide : (defaultSide === 'pha' ? 'pha' : 'cuu');
  return { action: pickAction(side, gift && gift.coins), side, mapped: false };
}

export function topList(users, side, n = 3) {
  return [...users.values()].filter(u => u[side] > 0).sort((a, b) => b[side] - a[side] || a.t - b.t).slice(0, n)
    .map(u => ({ id: u.id, name: u.name, avatar: u.avatar, coins: u[side] }));
}

let SEQ = 0;

export function createGame(options = {}, rnd = Math.random) {
  const cfg = Object.assign({}, DEFAULTS, options);
  const g = {
    cfg, rnd,
    phase: 'lobby', phaseT: 0, round: 0, tick: 0,
    timeLeft: cfg.roundSec, dist: 0, maxDist: 0, fuel: 100, shield: 0,
    speed: 0, walking: false, fuelAlarm: null,
    pushes: [],        // { m, dur, t, side, kind }
    effects: [],       // { id, kind, t, dur, user, meters, push } — chó, vịt, mưa, đoàn phượt, nitro…
    obstacles: [],     // { id, kind, gap, user, meters, dodge, decided }
    exclusive: null,   // { id, kind, t, stage, user, meters, coins, push? }
    xqueue: [],
    rescue: null,      // lốc xoáy: { left, need, got, heroes:Map }
    jumpT: 0, jumpCd: 0, ramCd: 0, ramWindow: 0,
    users: new Map(), totals: { cuu: 0, pha: 0 },
    likeAcc: 0, pending: [], events: [], result: null, aiTimers: [],
    driver: null,      // { id, name, avatar, left } — null = streamer tự lái
    driverQueue: [],   // [{ user, sec }]
    riders: [],        // id người phe Cứu theo thứ tự lên xe
    plan: [],          // lộ trình ván này: [{ kind, at (mét), done }]
    kmh: 0, fastT: 0, fastSeen: false,   // tốc độ thật (gồm cú đẩy), thời gian đang quá tốc độ
    halt: null,        // xe đang dừng: { kind, left, need, got, pauseClock, t, deferred: [] }
    get final() { return this.phase === 'race' && this.timeLeft <= this.cfg.finalSec; },
    get progress() { return Math.max(0, Math.min(1, this.dist / this.cfg.goal)); },
  };

  const emit = (type, data = {}) => { g.events.push(Object.assign({ type }, data)); };

  function user(u) {
    const id = String((u && (u.id || u.uniqueId || u.name)) || 'khach');
    let x = g.users.get(id);
    if (!x) { x = { id, name: (u && u.name) || 'Khách', avatar: (u && u.avatar) || '', cuu: 0, pha: 0, side: null, betrayed: false, t: g.users.size }; g.users.set(id, x); }
    if (u && u.name) x.name = u.name;
    if (u && u.avatar) x.avatar = u.avatar;
    return x;
  }

  function addPush(m, dur, side, kind) {
    if (m <= 0) return null;
    if (side === 'pha' && g.shield > 0) {
      const ab = Math.min(g.shield, m);
      g.shield -= ab; m -= ab;
      emit('shieldBlock', { meters: ab, kind, left: g.shield });
      if (m <= 0) return null;
    }
    const p = { m, dur: Math.max(0.05, dur, Math.min(cfg.pushMax, m / cfg.pushRate)), t: 0, side, kind };
    g.pushes.push(p);
    return p;
  }
  // phần chưa chạy của một cú đẩy (để huỷ / giảm khi bị HÚC)
  const remaining = p => (p ? p.m * Math.max(0, 1 - p.t / p.dur) : 0);
  function cutPush(p, keep) { if (!p) return 0; const rem = remaining(p); const cut = rem * (1 - keep); p.m -= cut; return cut; }

  function applyAction(action, u, coins, count, driverDone = false) {
    const total = coins * count;
    const a = ACTION_BY_ID[action];
    const mult = g.final ? cfg.finalMult : 1;
    const M = metersFor(total, cfg) * mult;
    const base = { user: { id: u.id, name: u.name, avatar: u.avatar }, coins: total, count, meters: M };
    emit('action', Object.assign({ action, side: a.side, label: a.label, emoji: a.emoji, final: mult > 1 }, base));
    switch (action) {
      case 'wind': addPush(M, 0.8, 'cuu', 'wind'); break;
      case 'driver': {
        addPush(M, 1, 'cuu', 'driver');
        if (!driverDone) assignDriver(u, count);
        break;
      }
      case 'fuel': {
        g.fuel = Math.min(100, g.fuel + Math.max(cfg.fuelMin, Math.min(100, total * cfg.fuelPerCoin)));
        addPush(M * 0.5, 1, 'cuu', 'fuel');
        break;
      }
      case 'nitro': g.effects.push({ id: ++SEQ, kind: 'nitro', t: 0, dur: 2, ...base, push: addPush(M, 2, 'cuu', 'nitro') }); break;
      case 'helmet': g.shield += M; break;
      case 'convoy': g.effects.push({ id: ++SEQ, kind: 'convoy', t: 0, dur: 6, ...base, push: addPush(M, 6, 'cuu', 'convoy') }); break;
      case 'tow': {
        if (g.fuel < 30) g.fuel = 30;
        g.effects.push({ id: ++SEQ, kind: 'tow', t: 0, dur: 3.5, ...base, push: addPush(M, 3.5, 'cuu', 'tow') });
        break;
      }
      case 'banana': case 'pothole': {
        // ×N vật cản rải trên đường (tối đa 10 cái, chia đều xu) — giá nhỏ thì NHẢY né được
        const n = Math.max(1, Math.min(10, count));
        const each = metersFor(total / n, cfg) * mult;
        for (let i = 0; i < n; i++) {
          g.obstacles.push({ id: ++SEQ, kind: action, gap: 60 + i * 16 + g.obstacles.length * 5, ...base, meters: each, dodge: coins <= cfg.dodgeMax, decided: false });
        }
        break;
      }
      case 'dog': g.effects.push({ id: ++SEQ, kind: 'dog', t: 0, dur: 3.5, ...base, ram: true, push: addPush(M, 3.5, 'pha', 'dog') }); break;
      case 'ducks': g.effects.push({ id: ++SEQ, kind: 'ducks', t: 0, dur: 3, ...base, ram: true, block: true, push: addPush(M, 3, 'pha', 'ducks') }); break;
      case 'rain': g.effects.push({ id: ++SEQ, kind: 'rain', t: 0, dur: 6, ...base, slow: 0.55, push: addPush(M, 6, 'pha', 'rain') }); break;
      case 'container': case 'tornado': case 'heli':
        g.xqueue.push({ id: ++SEQ, kind: action, t: 0, stage: 'enter', ...base });
        emit('queued', { action, size: g.xqueue.length });
        break;
      default: break;
    }
  }
  /** Quà tài xế: lên lái ngay (kể cả lúc chờ ván), đang có người lái thì xếp hàng; chính mình tặng thêm = cộng giờ. */
  function assignDriver(u, count) {
    const base = { user: { id: u.id, name: u.name, avatar: u.avatar } };
    const sec = cfg.driverSec * count;
    if (g.driver && g.driver.id === u.id) { g.driver.left += sec; emit('driverExtend', { user: base.user, left: g.driver.left }); }
    else if (!g.driver || g.driver.free) setDriver(u, sec);
    else {
      const q = g.driverQueue.find(x => x.user.id === u.id);
      if (q) q.sec += sec; else g.driverQueue.push({ user: base.user, sec });
      emit('driverQueued', { user: base.user, pos: g.driverQueue.findIndex(x => x.user.id === u.id) + 1 });
    }
  }

  function board(u) {
    if (u.side === 'pha' || g.riders.includes(u.id)) return;
    g.riders.push(u.id);
    if (g.riders.length > cfg.maxRiders) g.riders.splice(0, g.riders.length - cfg.maxRiders);   // giữ người lên xe gần nhất
    paxTick = -1;
    emit('board', { user: { id: u.id, name: u.name, avatar: u.avatar } });
  }
  function giveCoins(u, side, total) {
    paxTick = -1;   // xu Cứu đổi thứ tự ghế
    if (side === 'cuu') board(u);
    if (side === 'pha' && u.cuu > 0 && !u.betrayed) { u.betrayed = true; emit('betray', { user: { id: u.id, name: u.name, avatar: u.avatar } }); }
    u[side] += total;
    g.totals[side] += total;
    if (g.rescue && side === 'cuu') {
      g.rescue.got += total;
      g.rescue.heroes.set(u.id, (g.rescue.heroes.get(u.id) || 0) + total);
    }
  }

  function setDriver(u, sec) {
    paxTick = -1;
    const prev = g.driver;
    g.driver = { id: u.id, name: u.name, avatar: u.avatar || '', left: sec, free: false };
    emit('driver', { user: { id: u.id, name: u.name, avatar: u.avatar }, sec, prev: prev ? { id: prev.id, name: prev.name } : null });
  }
  /** Lượt tài xế chạy theo giờ thật (cả lúc chờ ván). Hết giờ: có người chờ → đổi; không → giữ nguyên người đang lái. */
  function stepDriver(dt) {
    const d = g.driver;
    if (!d || d.free) return;
    d.left -= dt;
    if (d.left > 0) return;
    const next = g.driverQueue.shift();
    if (next) setDriver(next.user, next.sec);
    else { d.left = 0; d.free = true; emit('driverHold', { user: { id: d.id, name: d.name, avatar: d.avatar } }); }
  }
  /** Người ngồi trên xe: tài xế không tính, xếp theo xu Cứu ván này rồi tới thứ tự lên xe. */
  let paxTick = -1, paxCache = null;
  g.passengers = function () {
    if (paxTick === g.tick && paxCache) return paxCache;
    const list = g.riders.map(id => g.users.get(id)).filter(u => u && u.side !== 'pha' && (!g.driver || u.id !== g.driver.id));
    list.sort((a, b) => b.cuu - a.cuu || g.riders.indexOf(a.id) - g.riders.indexOf(b.id));
    paxTick = g.tick;
    const cars = Math.max(1, Math.min(cfg.maxCars, Math.ceil(list.length / cfg.seats)));
    const cap = cfg.seats * cars;
    return (paxCache = { seated: list.slice(0, cap), extra: Math.max(0, list.length - cap), total: list.length, cars });
  };

  /** Quà thật / quà thử. gift = { giftId, giftName, coins (xu 1 cái), count }. giftMap theo resolveGift. */
  g.gift = function (who, gift, giftMap) {
    const u = user(who);
    const c0 = Number(gift && gift.coins);
    const coins = Number.isFinite(c0) ? Math.max(1, Math.min(1e6, c0)) : 1;   // quà lỗi/∞ không phá ván
    const count = Math.max(1, Math.min(9999, Number(gift && gift.count) || 1));
    let r;
    if (gift && gift.action && ACTION_BY_ID[gift.action]) r = { action: gift.action, side: ACTION_BY_ID[gift.action].side };
    else r = resolveGift({ giftId: gift && gift.giftId, giftName: gift && gift.giftName, coins }, giftMap, u.side, cfg.defaultSide);
    if (g.phase !== 'race') {
      const driverDone = r.action === 'driver';
      if (driverDone) assignDriver(u, count);
      g.pending.push({ u, action: r.action, side: r.side, coins, count, driverDone });
      emit('pending', { user: { id: u.id, name: u.name, avatar: u.avatar }, action: r.action, side: r.side, coins: coins * count });
      return r;
    }
    giveCoins(u, r.side, coins * count);
    if (g.halt) {
      if (r.action === 'driver') assignDriver(u, count);
      if (g.halt.need && r.side === 'cuu') haltProgress(coins * count * cfg.coinLikes, u);
      g.halt.deferred.push({ u, action: r.action, coins, count, driverDone: r.action === 'driver' });
      emit('deferred', { user: { id: u.id, name: u.name, avatar: u.avatar }, action: r.action, side: r.side, coins: coins * count, halt: g.halt.kind });
      return r;
    }
    applyAction(r.action, u, coins, count);
    return r;
  };

  g.like = function (who, n) {
    const u = user(who);
    const nl = Math.max(0, Number(n) || 0);
    if (g.halt && g.halt.need) haltProgress(nl, u);
    g.likeAcc += nl;
    while (g.likeAcc >= cfg.likePer) {
      g.likeAcc -= cfg.likePer;
      if (g.phase === 'race' && !g.halt) { addPush(metersFor(1, cfg), 0.8, 'cuu', 'like'); g.fuel = Math.min(100, g.fuel + cfg.likeFuel); }
      emit('likeBurst', { user: { id: u.id, name: u.name, avatar: u.avatar } });
    }
  };
  g.share = function (who) {
    const u = user(who);
    if (g.phase === 'race') g.fuel = Math.min(100, g.fuel + cfg.shareFuel);
    emit('share', { user: { id: u.id, name: u.name, avatar: u.avatar } });
  };
  g.follow = function (who) {
    const u = user(who);
    if (g.phase === 'race') g.fuel = Math.min(100, g.fuel + cfg.followFuel);
    emit('follow', { user: { id: u.id, name: u.name, avatar: u.avatar } });
  };
  g.comment = function (who, text) {
    const side = sideFromComment(text);
    if (!side) return null;
    const u = user(who);
    if (u.side !== side) {
      u.side = side;
      if (side === 'pha') { g.riders = g.riders.filter(id => id !== u.id); paxTick = -1; }   // đổi sang phá → xuống xe
      emit('join', { side, user: { id: u.id, name: u.name, avatar: u.avatar } });
      if (side === 'cuu') board(u);
    }
    return side;
  };

  /** Phím streamer (hoặc AI): 'jump' | 'ram' | 'start' */
  g.input = function (what) {
    if (what === 'start') { if (g.phase !== 'race') startRace(); return true; }
    if (g.phase !== 'race') return false;
    if (what === 'jump') {
      if (g.jumpT > 0 || g.jumpCd > 0 || g.exclusive?.kind === 'heli' || g.exclusive?.kind === 'tornado') return false;
      g.jumpT = 0.75; g.jumpCd = 0.95;
      emit('jump');
      return true;
    }
    if (what === 'ram') {
      if (g.ramCd > 0) { emit('ramCd', { left: g.ramCd }); return false; }
      g.ramCd = cfg.ramCd;
      g.ramWindow = 0.5;
      emit('ram');
      tryRam();
      return true;
    }
    return false;
  };

  function tryRam() {
    // ưu tiên: xe container đang đẩy → vịt/chó → vật cản sát đầu xe
    const x = g.exclusive;
    if (x && x.kind === 'container' && x.stage === 'push' && !x.rammed) {
      x.rammed = true;
      const cut = cutPush(x.push, 0.5);
      g.ramWindow = 0;
      emit('ramHit', { kind: 'container', user: x.user, saved: Math.round(cut) });
      return true;
    }
    const e = g.effects.find(f => f.ram && !f.rammed && f.t < f.dur);
    if (e) {
      e.rammed = true;
      const cut = cutPush(e.push, 0);
      e.dur = e.t;       // kết thúc hiệu ứng ngay
      g.ramWindow = 0;
      emit('ramHit', { kind: e.kind, user: e.user, saved: Math.round(cut) });
      return true;
    }
    const o = g.obstacles.filter(ob => ob.gap < 20).sort((a, b) => a.gap - b.gap)[0];
    if (o) {
      g.obstacles.splice(g.obstacles.indexOf(o), 1);
      g.ramWindow = 0;
      emit('ramHit', { kind: o.kind, user: o.user, saved: Math.round(o.meters) });
      return true;
    }
    return false;
  }

  // Tình huống đường xá đặt đúng tỉnh trên tuyến Cà Mau → Hà Giang (route.js): mỗi tình huống 1 dãy [from, to) phần quãng đường
  const ROAD_EVENTS = [
    { kind: 'jam',     ranges: rangesOf(['TP. Hồ Chí Minh', 'Hà Nội']) },                                   // 🚗 kẹt xe cửa ngõ
    { kind: 'train',   ranges: rangesOf(['Hà Tĩnh', 'Nghệ An', 'Thanh Hóa', 'Hưng Yên', 'Bắc Ninh']) },     // 🚂 chắn tàu Bắc – Nam
    { kind: 'cows',    ranges: rangesOf(['Tây Ninh', 'Đồng Nai', 'Lâm Đồng', 'Đắk Lắk', 'Gia Lai']) },      // 🐄 đàn bò qua đường
    { kind: 'flat',    ranges: [[0.1, 0.9]] },                                                              // 🛞 thủng lốp — thả tim bơm
    { kind: 'carsick', ranges: rangesOf(['Lâm Đồng', 'Sơn La', 'Điện Biên', 'Lai Châu', 'Lào Cai', 'Lạng Sơn']) }, // 🤢 say xe qua đèo
    { kind: 'photo',   ranges: rangesOf(['Đà Nẵng', 'Huế', 'Quảng Ninh', 'Lào Cai']) },                    // 📸 Hải Vân · Hạ Long · Sa Pa
    { kind: 'lixi',    ranges: rangesOf(['Cao Bằng', 'Tuyên Quang']) },                                    // 🧧 họ hàng lì xì gần tới quê
  ];
  const TIMED = { train: 7, cows: 5, carsick: 5, photo: 5 };
  function buildPlan() {
    const L = cfg.goal, plan = [];
    const free = m => plan.every(x => Math.abs(x.at - m) > Math.max(250, L * 0.05));
    if (cfg.restStop) plan.push({ kind: 'rest', at: L * cfg.restAt, done: false });
    if (cfg.gasStop) plan.push({ kind: 'gas', at: L * cfg.gasAt, done: false });
    if (cfg.police && g.rnd() < cfg.policeChance) {
      for (let k = 0; k < 8; k++) { const m = L * (0.18 + g.rnd() * 0.64); if (free(m)) { plan.push({ kind: 'police', at: m, done: false }); break; } }
    }
    const pool = ROAD_EVENTS.slice();
    for (let n = 0; n < cfg.roadEvents && pool.length; n++) {
      const e = pool.splice(Math.floor(g.rnd() * pool.length), 1)[0];
      for (let k = 0; k < 8; k++) {
        const [from, to] = e.ranges[Math.floor(g.rnd() * e.ranges.length)];
        const m = L * (from + g.rnd() * (to - from));
        if (free(m)) { plan.push({ kind: e.kind, at: m, done: false }); break; }
      }
    }
    return plan.sort((a, b) => a.at - b.at);
  }
  function startHalt(kind, reason) {
    // mọi điểm dừng đều dừng đồng hồ ván: chuyện dọc đường không nghiêng về phe nào (đo bằng mô phỏng)
    const h = { kind, t: 0, got: 0, need: 0, left: 0, maxLeft: 0, pauseClock: true, deferred: [], helpers: new Map() };
    if (kind === 'rest') h.left = cfg.restSec;
    else if (kind === 'gas') { h.left = cfg.gasSec; g.fuel = 100; g.walking = false; g.fuelAlarm = null; }
    else if (kind === 'police') {
      h.need = cfg.policeLikes; h.maxLeft = cfg.policeMaxSec;
      const P = g.passengers();
      h.reason = reason || (g.fastT > 0.5 ? 'speed' : P.total > P.cars * cfg.windowSeats ? 'overload' : 'papers');
      h.kmh = Math.round(Math.max(g.kmh, g.peakKmh || 0)); h.over = Math.max(0, P.total - P.cars * cfg.windowSeats);
      for (const x of g.plan) if (x.kind === 'police') x.done = true;   // mỗi ván chỉ 1 lần CSGT
    }
    else if (kind === 'flat') { h.need = cfg.flatLikes; h.maxLeft = cfg.flatMaxSec; }
    else h.left = TIMED[kind] || 5;
    g.halt = h;
    emit('halt', { kind, sec: h.left || h.maxLeft, need: h.need, pauseClock: h.pauseClock, reason: h.reason, kmh: h.kmh, over: h.over });
  }
  function haltProgress(n, u) {
    const h = g.halt;
    h.got += n;
    if (u) h.helpers.set(u.id, (h.helpers.get(u.id) || 0) + n);
  }
  function endHalt(how) {
    const h = g.halt;
    g.halt = null;
    const helpers = [...h.helpers].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => { const u = g.users.get(id); return { id, name: u ? u.name : id, avatar: u ? u.avatar : '', likes: n }; });
    emit('haltEnd', { kind: h.kind, how, helpers });
    // Quà dồn lúc dừng: cộng gọn thành 1 cú đẩy ròng (mét Cứu − mét Phá). Không chạy lần lượt từng container / lốc xoáy
    // (xếp hàng sẽ giữ xe đứng yên rất lâu sau khi đi tiếp → lệch về phe Phá, đo bằng mô phỏng).
    if (h.deferred.length) {
      let net = 0, cuu = 0, pha = 0, shield = 0;
      for (const d of h.deferred) {
        const a = ACTION_BY_ID[d.action], m = metersFor(d.coins * d.count, cfg);
        if (d.action === 'helmet') { shield += m; cuu += m; continue; }
        if (d.action === 'fuel') g.fuel = Math.min(100, g.fuel + Math.max(cfg.fuelMin, Math.min(100, d.coins * d.count * cfg.fuelPerCoin)));
        if (a.side === 'cuu') { net += m; cuu += m; } else { net -= m; pha += m; }
      }
      g.shield += shield;
      if (net > 0) addPush(net, 2, 'cuu', 'stash'); else if (net < 0) addPush(-net, 2, 'pha', 'stash');
      emit('stash', { cuu: Math.round(cuu), pha: Math.round(pha), net: Math.round(net), n: h.deferred.length });
    }
    // quá tốc độ chỉ bắt dừng thả tim (bị bắt vì phe Cứu đẩy mạnh — phạt lùi nữa thì lệch về phe Phá, đo bằng mô phỏng)
    if (h.kind === 'police' && h.reason !== 'speed' && how === 'timeout' && cfg.policeFine > 0) { addPush(cfg.policeFine, 1.2, 'pha', 'fine'); emit('fine', { meters: cfg.policeFine }); }
  }
  /** Tình huống không bắt dừng: kẹt xe (chậm), lì xì (thưởng). */
  function startRoadEffect(kind) {
    if (kind === 'jam') { g.effects.push({ id: ++SEQ, kind: 'jam', t: 0, dur: 10, slow: 0.3, user: { id: 'road', name: 'Kẹt xe' } }); emit('roadEvent', { kind }); }
    else if (kind === 'lixi') { g.fuel = Math.min(100, g.fuel + 30); addPush(metersFor(40, cfg), 1.5, 'cuu', 'lixi'); emit('roadEvent', { kind }); }
  }
  /** Bật ngay một tình huống (nút thử trong panel): rest | gas | police | jam | train | cows | flat | carsick | photo | lixi */
  g.triggerEvent = function (kind) {
    if (g.phase !== 'race' || g.halt) return false;
    if (kind === 'jam' || kind === 'lixi') { startRoadEffect(kind); return true; }
    if (!['rest', 'gas', 'police', 'flat', ...Object.keys(TIMED)].includes(kind)) return false;
    for (const x of g.plan) if (x.kind === kind && !x.done && Math.abs(x.at - g.dist) < 300) x.done = true;   // dùng luôn điểm thật gần đó
    startHalt(kind);
    return true;
  };
  function stepPlan() {
    if (g.halt || g.exclusive) return;
    // điểm đã vượt quá 300 m (bị đẩy vọt qua) thì bỏ qua — không dừng sai chỗ
    for (const x of g.plan) if (!x.done && g.dist - x.at > 300) x.done = true;
    const next = g.plan.find(x => !x.done && g.dist >= x.at);
    if (!next) return;
    next.done = true;
    if (next.kind === 'jam' || next.kind === 'lixi') startRoadEffect(next.kind);
    else startHalt(next.kind);
  }
  function stepHalt(dt) {
    const h = g.halt;
    h.t += dt;
    if (!h.pauseClock) g.timeLeft = Math.max(0, g.timeLeft - dt);
    if (h.need) {
      if (h.got >= h.need) return endHalt('likes');
      if (h.t >= h.maxLeft) return endHalt('timeout');
    } else {
      h.left -= dt;
      if (h.left <= 0) return endHalt('time');
    }
  }

  function startRace() {
    g.round += 1;
    g.phase = 'race'; g.phaseT = 0;
    g.timeLeft = cfg.roundSec; g.dist = 0; g.maxDist = 0; g.fuel = 100; g.shield = 0;
    g.walking = false; g.fuelAlarm = null; g.rescue = null; g.exclusive = null; g.xqueue = [];
    g.pushes = []; g.effects = []; g.obstacles = []; g.result = null; g.halt = null; g.kmh = 0; g.peakKmh = 0; g.fastT = 0; g.fastSeen = false; g.policeCaught = false;
    g.plan = buildPlan();
    g.jumpT = 0; g.jumpCd = 0; g.ramCd = 0; g.ramWindow = 0; g.aiTimers = [];
    if (g.users.size > cfg.maxUsers) {
      const keep = new Set([...g.riders, ...(g.driver ? [g.driver.id] : []), ...g.driverQueue.map(q => q.user.id), ...g.pending.map(p => p.u.id)]);
      for (const id of [...g.users.keys()]) if (!keep.has(id)) g.users.delete(id);
    }
    for (const u of g.users.values()) Object.assign(u, { cuu: 0, pha: 0, betrayed: false });
    g.totals = { cuu: 0, pha: 0 };
    emit('roundStart', { round: g.round, goal: cfg.goal, roundSec: cfg.roundSec });
    const pend = g.pending; g.pending = [];
    for (const p of pend) { giveCoins(p.u, p.side, p.coins * p.count); applyAction(p.action, p.u, p.coins, p.count, p.driverDone); }
  }

  function endRace(winner, reason = '') {
    const topCuu = topList(g.users, 'cuu', 3), topPha = topList(g.users, 'pha', 3);
    g.result = {
      round: g.round, winner, reason: reason || (winner === 'cuu' ? 'home' : 'time'), dist: Math.round(g.dist), goal: cfg.goal, timeUsed: Math.round(cfg.roundSec - g.timeLeft),
      totals: Object.assign({}, g.totals), topCuu, topPha,
      betrayers: [...g.users.values()].filter(u => u.betrayed).map(u => ({ id: u.id, name: u.name, avatar: u.avatar })),
    };
    g.phase = 'result'; g.phaseT = 0;
    g.pushes = []; g.effects = []; g.obstacles = []; g.exclusive = null; g.xqueue = []; g.rescue = null; g.fuelAlarm = null; g.halt = null;
    emit('roundEnd', g.result);
  }

  function startExclusive(x) {
    g.exclusive = x;
    x.t = 0; x.stage = 'enter';
    if (x.kind === 'tornado') {
      g.rescue = { left: cfg.rescueSec, need: Math.max(1, Math.ceil(x.coins * cfg.tornadoNeed)), got: 0, heroes: new Map(), user: x.user };
      emit('rescueStart', { kind: 'tornado', need: g.rescue.need, sec: cfg.rescueSec, user: x.user });
    }
    emit('exclusive', { kind: x.kind, user: x.user, coins: x.coins });
  }

  function stepExclusive(dt) {
    const x = g.exclusive;
    if (!x) { if (g.xqueue.length) startExclusive(g.xqueue.shift()); return; }
    x.t += dt;
    if (x.kind === 'container') {
      if (x.stage === 'enter' && x.t >= 1) { x.stage = 'push'; x.t = 0; x.push = addPush(x.meters, 2.5, 'pha', 'container'); if (!x.push) { x.stage = 'bounce'; emit('bounce', { user: x.user }); } }
      else if (x.stage === 'push' && x.t >= (x.push ? x.push.dur : 2.5)) { x.stage = 'leave'; x.t = 0; }
      else if (x.stage === 'bounce' && x.t >= 1) { x.stage = 'leave'; x.t = 0; }
      else if (x.stage === 'leave' && x.t >= 1) g.exclusive = null;
    } else if (x.kind === 'heli') {
      if (x.stage === 'enter' && x.t >= 1) { x.stage = 'fly'; x.t = 0; x.push = addPush(x.meters, 3, 'cuu', 'heli'); }
      else if (x.stage === 'fly' && x.t >= (x.push ? x.push.dur : 3)) { x.stage = 'leave'; x.t = 0; }
      else if (x.stage === 'leave' && x.t >= 0.8) g.exclusive = null;
    } else if (x.kind === 'tornado') {
      const r = g.rescue;
      if (x.stage === 'enter') {
        if (r) r.left -= dt;
        if (r && r.got >= r.need) {
          const heroes = [...r.heroes].sort((a, b) => b[1] - a[1]).map(([id, coins]) => { const u = g.users.get(id); return { id, name: u ? u.name : id, avatar: u ? u.avatar : '', coins }; });
          emit('rescued', { kind: 'tornado', heroes, user: x.user });
          g.rescue = null; x.stage = 'leave'; x.t = 0;
        } else if (!r || r.left <= 0) {
          emit('rescueFail', { kind: 'tornado', user: x.user, meters: x.meters });
          g.rescue = null; x.stage = 'throw'; x.t = 0;
          x.push = addPush(x.meters, 1.6, 'pha', 'tornado');
        }
      } else if (x.stage === 'throw' && x.t >= (x.push ? x.push.dur : 1.6)) { x.stage = 'leave'; x.t = 0; }
      else if (x.stage === 'leave' && x.t >= 0.8) g.exclusive = null;
    }
  }

  function ai(dt) {
    if (!cfg.autoPilot) return;
    for (const o of g.obstacles) {
      if (!o.decided && o.gap < Math.max(g.speed, 6) * 0.32 + 1.2) {
        o.decided = true;
        if (o.dodge && g.rnd() < cfg.aiDodge) g.input('jump');
      }
    }
    const target = (g.exclusive && g.exclusive.kind === 'container' && g.exclusive.stage === 'push' && !g.exclusive.aiSeen && g.exclusive)
      || g.effects.find(e => e.ram && !e.aiSeen && !e.rammed);
    if (target) {
      target.aiSeen = true;
      if (g.ramCd <= 0 && g.rnd() < cfg.aiRam) g.aiTimers.push(0.4 + g.rnd() * 0.8);
    }
    g.aiTimers = g.aiTimers.map(t => t - dt);
    if (g.aiTimers.some(t => t <= 0)) { g.aiTimers = g.aiTimers.filter(t => t > 0); g.input('ram'); }
  }

  /** Tiến mô phỏng dt giây. */
  g.step = function (dtIn) {
    const dt = Math.max(0, Math.min(0.1, Number(dtIn) || 0));
    g.phaseT += dt;
    stepDriver(dt);
    g.tick++;
    if (g.phase === 'lobby') { if (g.phaseT >= cfg.lobbySec) startRace(); return; }
    if (g.phase === 'result') { const hold = cfg.resultSec + (g.result && g.result.reason === 'depot' ? cfg.depotFireSec : 0); if (cfg.autoNext && g.phaseT >= hold) { g.phase = 'lobby'; g.phaseT = 0; emit('lobby'); } return; }

    // ---- race ----
    if (g.halt) {
      g.speed = 0;
      stepHalt(dt);
      if (g.timeLeft <= cfg.finalSec && g.timeLeft + dt > cfg.finalSec && !(g.halt && g.halt.pauseClock)) emit('final', { sec: cfg.finalSec, mult: cfg.finalMult });
      if (g.timeLeft <= 0) endRace('pha');
      return;
    }
    stepPlan();
    if (g.halt) return;
    g.timeLeft = Math.max(0, g.timeLeft - dt);
    g.jumpT = Math.max(0, g.jumpT - dt);
    g.jumpCd = Math.max(0, g.jumpCd - dt);
    g.ramCd = Math.max(0, g.ramCd - dt);
    g.ramWindow = Math.max(0, g.ramWindow - dt);
    if (g.ramWindow > 0) tryRam();
    stepExclusive(dt);

    // tốc độ nền
    const x = g.exclusive;
    let mul = 1;
    for (const e of g.effects) if (e.t < e.dur) { if (e.block) mul = 0; else if (e.slow) mul = Math.min(mul, e.slow); else if (e.kind === 'dog') mul = Math.min(mul, 0.8); }
    const held = x && ((x.kind === 'container' && x.stage !== 'leave') || (x.kind === 'tornado' && x.stage !== 'leave') || (x.kind === 'heli' && x.stage !== 'leave'));
    if (held) mul = 0;
    if (g.fuel > 0) {
      g.walking = false;
      if (g.fuelAlarm) { emit('refueled'); g.fuelAlarm = null; }
      g.speed = cfg.speed * mul;
      if (g.speed > 0) g.fuel = Math.max(0, g.fuel - cfg.fuelBurn * dt * mul);
    } else {
      if (!g.fuelAlarm && !g.walking) { g.fuelAlarm = { left: cfg.rescueSec }; emit('fuelOut', { sec: cfg.rescueSec }); }
      if (g.fuelAlarm) { g.fuelAlarm.left -= dt; if (g.fuelAlarm.left <= 0) { g.fuelAlarm = null; g.walking = true; emit('walking'); } }
      g.speed = g.walking ? cfg.walkSpeed * mul : 0;
    }
    let dd = g.speed * dt;

    // cú đẩy
    for (const p of g.pushes) {
      const k = Math.min(dt, p.dur - p.t) / p.dur;
      if (k > 0) dd += (p.side === 'pha' ? -1 : 1) * p.m * k;
      p.t += dt;
    }
    g.pushes = g.pushes.filter(p => p.t < p.dur);

    // hiệu ứng có thời hạn
    for (const e of g.effects) e.t += dt;
    g.effects = g.effects.filter(e => e.t < e.dur);

    // vật cản tiến lại (xe đứng yên thì vật cản vẫn trôi tới, không treo mãi)
    const approach = Math.max(g.speed, 6) * dt;
    for (const o of [...g.obstacles]) {
      o.gap -= approach;
      if (o.gap > 0) continue;
      g.obstacles.splice(g.obstacles.indexOf(o), 1);
      const airborne = g.jumpT > 0 || (x && x.kind === 'heli' && x.stage === 'fly');
      if (o.dodge && airborne) { emit('dodge', { kind: o.kind, user: o.user }); continue; }
      const p = addPush(o.meters, o.kind === 'banana' ? 0.9 : 0.6, 'pha', o.kind);
      emit('hit', { kind: o.kind, user: o.user, meters: p ? Math.round(p.m) : 0 });
    }

    ai(dt);

    g.dist = Math.max(-cfg.goal * cfg.backFloor, g.dist + dd);
    g.kmh = dt > 0 ? (dd / dt) * 3.6 : 0;
    g.peakKmh = Math.max((g.peakKmh || 0) * Math.pow(0.5, dt / 3), g.kmh);
    if (g.kmh > cfg.speedLimit) g.fastT += dt; else { g.fastT = Math.max(0, g.fastT - dt * 2); if (g.fastT === 0) g.fastSeen = false; }
    if (cfg.police && g.fastT >= 1.5 && !g.fastSeen && !g.halt && !g.exclusive) {
      g.fastSeen = true;
      const done = g.plan.some(x => x.kind === 'police' && x.done) || g.policeCaught;
      if (!done && g.rnd() < cfg.speedTrap) { g.policeCaught = true; startHalt('police', 'speed'); return; }
    }   // bị đẩy lùi được quá vạch xuất phát (quà Phá to không bị phí)
    if (g.dist > g.maxDist) {
      const before = Math.floor(g.maxDist / cfg.flagEvery), after = Math.floor(g.dist / cfg.flagEvery);
      g.maxDist = g.dist;
      if (after > before && g.dist < cfg.goal) emit('flag', { meters: after * cfg.flagEvery });
    }
    if (g.timeLeft <= cfg.finalSec && g.timeLeft + dt > cfg.finalSec) emit('final', { sec: cfg.finalSec, mult: cfg.finalMult });
    if (g.dist >= cfg.goal) { g.dist = cfg.goal; endRace('cuu'); return; }
    if (g.dist <= -cfg.goal * cfg.backFloor) { endRace('pha', 'depot'); return; }
    if (g.timeLeft <= 0) endRace('pha');
  };

  g.drainEvents = function () { const e = g.events; g.events = []; return e; };
  g.setConfig = function (o) { Object.assign(cfg, o || {}); };
  g.forceEnd = function (winner) { if (g.phase === 'race') endRace(winner === 'pha' ? 'pha' : 'cuu'); };
  g.reset = function () {
    g.phase = 'lobby'; g.phaseT = 0; g.result = null; g.pending = []; g.dist = 0; g.maxDist = 0; g.fuel = 100;
    g.pushes = []; g.effects = []; g.obstacles = []; g.exclusive = null; g.xqueue = []; g.rescue = null; g.fuelAlarm = null;
    g.users = new Map(); g.totals = { cuu: 0, pha: 0 };
    g.driver = null; g.driverQueue = []; g.riders = []; g.halt = null; g.plan = []; paxTick = -1;
    emit('lobby');
  };
  return g;
}

/** Hình phạt vui gợi ý khi phe Phá thắng (người tặng Phá nhiều nhất "chọn"). */
export const PENALTIES = [
  'Hát 1 câu bài Tết', 'Hít đất 10 cái', 'Đội nón lá nhảy 15 giây', 'Nói giọng miền Tây 1 phút',
  'Gọi tên cảm ơn top Phá', 'Uống 1 ly nước chanh không đường', 'Làm mặt xấu 5 giây', 'Đọc vè 1 đoạn',
];
