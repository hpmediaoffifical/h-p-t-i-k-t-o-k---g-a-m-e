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
  fuelBurn: 1.8,       // % xăng/giây
  meterPerCoin: 8,     // mỗi xu = bấy nhiêu mét (đẩy tới hoặc lùi) — ≈ 0,3 giây chạy ở 100 km/h
  minMeters: 15,
  likePer: 100,        // đủ bấy nhiêu tim cả phòng → 1 cơn gió nhỏ + chút xăng
  lobbySec: 8,
  resultSec: 12,
  rescueSec: 10,
  tornadoNeed: 0.3,    // lốc xoáy: phe Cứu cần gom đủ bấy nhiêu phần giá lốc trong rescueSec
  ramCd: 12,           // giây hồi chiêu HÚC
  dodgeMax: 10,        // vật cản giá ≤ bấy nhiêu xu thì NHẢY né được
  autoPilot: true,     // AI tự nhảy / húc (treo máy)
  autoNext: true,      // hết ván tự sang ván mới
  defaultSide: 'cuu',  // quà chưa gán của người chưa chọn phe tính cho phe này
  flagEvery: 500,      // cắm cờ mốc mỗi bấy nhiêu mét
  pushRate: 300,       // cú đẩy dài chạy tối đa bấy nhiêu m/giây (quà to = bị đẩy tuột lâu hơn, tối đa pushMax giây)
  pushMax: 5,
  driverSec: 180,      // 🧑‍✈️ mỗi lượt tài xế bấy nhiêu giây; hết giờ không ai chờ → người đang lái giữ nguyên
  seats: 14,           // chỗ ngồi hiện trên xe (người phe Cứu); dư thì chỉ đếm "+N"
};

const DODGE_KINDS = new Set(['banana', 'pothole']);
const EXCLUSIVE = new Set(['container', 'tornado', 'heli']);

export function normName(s) {
  return String(s || '').toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
}

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
    phase: 'lobby', phaseT: 0, round: 0,
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

  function applyAction(action, u, coins, count) {
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
        const sec = cfg.driverSec * count;
        if (g.driver && g.driver.id === u.id) { g.driver.left += sec; emit('driverExtend', { user: base.user, left: g.driver.left }); }
        else if (!g.driver || g.driver.free) setDriver(u, sec);
        else {
          const q = g.driverQueue.find(x => x.user.id === u.id);
          if (q) q.sec += sec; else g.driverQueue.push({ user: base.user, sec });
          emit('driverQueued', { user: base.user, pos: g.driverQueue.findIndex(x => x.user.id === u.id) + 1 });
        }
        break;
      }
      case 'fuel': {
        g.fuel = Math.min(100, g.fuel + Math.max(15, Math.min(100, total * 4)));
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

  function board(u) {
    if (u.side === 'pha' || g.riders.includes(u.id)) return;
    g.riders.push(u.id);
    emit('board', { user: { id: u.id, name: u.name, avatar: u.avatar } });
  }
  function giveCoins(u, side, total) {
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
  g.passengers = function () {
    const list = g.riders.map(id => g.users.get(id)).filter(u => u && u.side !== 'pha' && (!g.driver || u.id !== g.driver.id));
    list.sort((a, b) => b.cuu - a.cuu || g.riders.indexOf(a.id) - g.riders.indexOf(b.id));
    return { seated: list.slice(0, cfg.seats), extra: Math.max(0, list.length - cfg.seats), total: list.length };
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
      g.pending.push({ u, action: r.action, side: r.side, coins, count });
      emit('pending', { user: { id: u.id, name: u.name, avatar: u.avatar }, action: r.action, side: r.side, coins: coins * count });
      return r;
    }
    giveCoins(u, r.side, coins * count);
    applyAction(r.action, u, coins, count);
    return r;
  };

  g.like = function (who, n) {
    const u = user(who);
    g.likeAcc += Math.max(0, Number(n) || 0);
    while (g.likeAcc >= cfg.likePer) {
      g.likeAcc -= cfg.likePer;
      if (g.phase === 'race') { addPush(metersFor(1, cfg), 0.8, 'cuu', 'like'); g.fuel = Math.min(100, g.fuel + 6); }
      emit('likeBurst', { user: { id: u.id, name: u.name, avatar: u.avatar } });
    }
  };
  g.share = function (who) {
    const u = user(who);
    if (g.phase === 'race') g.fuel = Math.min(100, g.fuel + 12);
    emit('share', { user: { id: u.id, name: u.name, avatar: u.avatar } });
  };
  g.follow = function (who) {
    const u = user(who);
    if (g.phase === 'race') g.fuel = Math.min(100, g.fuel + 8);
    emit('follow', { user: { id: u.id, name: u.name, avatar: u.avatar } });
  };
  g.comment = function (who, text) {
    const side = sideFromComment(text);
    if (!side) return null;
    const u = user(who);
    if (u.side !== side) {
      u.side = side;
      if (side === 'pha') g.riders = g.riders.filter(id => id !== u.id);   // đổi sang phá → xuống xe
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

  function startRace() {
    g.round += 1;
    g.phase = 'race'; g.phaseT = 0;
    g.timeLeft = cfg.roundSec; g.dist = 0; g.maxDist = 0; g.fuel = 100; g.shield = 0;
    g.walking = false; g.fuelAlarm = null; g.rescue = null; g.exclusive = null; g.xqueue = [];
    g.pushes = []; g.effects = []; g.obstacles = []; g.result = null;
    g.jumpT = 0; g.jumpCd = 0; g.ramCd = 0; g.ramWindow = 0; g.aiTimers = [];
    g.users = new Map([...g.users].map(([k, u]) => [k, Object.assign(u, { cuu: 0, pha: 0, betrayed: false })]));
    g.totals = { cuu: 0, pha: 0 };
    emit('roundStart', { round: g.round, goal: cfg.goal, roundSec: cfg.roundSec });
    const pend = g.pending; g.pending = [];
    for (const p of pend) { giveCoins(p.u, p.side, p.coins * p.count); applyAction(p.action, p.u, p.coins, p.count); }
  }

  function endRace(winner) {
    const topCuu = topList(g.users, 'cuu', 3), topPha = topList(g.users, 'pha', 3);
    g.result = {
      round: g.round, winner, dist: Math.round(g.dist), goal: cfg.goal, timeUsed: Math.round(cfg.roundSec - g.timeLeft),
      totals: Object.assign({}, g.totals), topCuu, topPha,
      betrayers: [...g.users.values()].filter(u => u.betrayed).map(u => ({ id: u.id, name: u.name, avatar: u.avatar })),
    };
    g.phase = 'result'; g.phaseT = 0;
    g.pushes = []; g.effects = []; g.obstacles = []; g.exclusive = null; g.xqueue = []; g.rescue = null; g.fuelAlarm = null;
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
        if (o.dodge && g.rnd() < 0.55) g.input('jump');
      }
    }
    const target = (g.exclusive && g.exclusive.kind === 'container' && g.exclusive.stage === 'push' && !g.exclusive.aiSeen && g.exclusive)
      || g.effects.find(e => e.ram && !e.aiSeen && !e.rammed);
    if (target) {
      target.aiSeen = true;
      if (g.ramCd <= 0 && g.rnd() < 0.45) g.aiTimers.push(0.4 + g.rnd() * 0.8);
    }
    g.aiTimers = g.aiTimers.map(t => t - dt);
    if (g.aiTimers.some(t => t <= 0)) { g.aiTimers = g.aiTimers.filter(t => t > 0); g.input('ram'); }
  }

  /** Tiến mô phỏng dt giây. */
  g.step = function (dtIn) {
    const dt = Math.max(0, Math.min(0.1, Number(dtIn) || 0));
    g.phaseT += dt;
    stepDriver(dt);
    if (g.phase === 'lobby') { if (g.phaseT >= cfg.lobbySec) startRace(); return; }
    if (g.phase === 'result') { if (cfg.autoNext && g.phaseT >= cfg.resultSec) { g.phase = 'lobby'; g.phaseT = 0; emit('lobby'); } return; }

    // ---- race ----
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

    g.dist = Math.max(0, g.dist + dd);
    if (g.dist > g.maxDist) {
      const before = Math.floor(g.maxDist / cfg.flagEvery), after = Math.floor(g.dist / cfg.flagEvery);
      g.maxDist = g.dist;
      if (after > before && g.dist < cfg.goal) emit('flag', { meters: after * cfg.flagEvery });
    }
    if (g.timeLeft <= cfg.finalSec && g.timeLeft + dt > cfg.finalSec) emit('final', { sec: cfg.finalSec, mult: cfg.finalMult });
    if (g.dist >= cfg.goal) { g.dist = cfg.goal; endRace('cuu'); return; }
    if (g.timeLeft <= 0) endRace('pha');
  };

  g.drainEvents = function () { const e = g.events; g.events = []; return e; };
  g.setConfig = function (o) { Object.assign(cfg, o || {}); };
  g.forceEnd = function (winner) { if (g.phase === 'race') endRace(winner === 'pha' ? 'pha' : 'cuu'); };
  g.reset = function () {
    g.phase = 'lobby'; g.phaseT = 0; g.result = null; g.pending = []; g.dist = 0; g.maxDist = 0; g.fuel = 100;
    g.pushes = []; g.effects = []; g.obstacles = []; g.exclusive = null; g.xqueue = []; g.rescue = null; g.fuelAlarm = null;
    g.users = new Map(); g.totals = { cuu: 0, pha: 0 };
    g.driver = null; g.driverQueue = []; g.riders = [];
    emit('lobby');
  };
  return g;
}

/** Hình phạt vui gợi ý khi phe Phá thắng (người tặng Phá nhiều nhất "chọn"). */
export const PENALTIES = [
  'Hát 1 câu bài Tết', 'Hít đất 10 cái', 'Đội nón lá nhảy 15 giây', 'Nói giọng miền Tây 1 phút',
  'Gọi tên cảm ơn top Phá', 'Uống 1 ly nước chanh không đường', 'Làm mặt xấu 5 giây', 'Đọc vè 1 đoạn',
];
