/**
 * 🏢 Creator Online — quà TikTok → ý định: tổng xu, bậc, hành động đã gán, kế hoạch phản hồi.
 * Logic thuần (không DOM, không three.js) → test bằng `npm test` (tests/creatoronline-events.test.mjs).
 * Spec: docs/superpowers/specs/2026-11-03-creatoronline-design.md mục 4.1–4.3.
 *
 * - Bảng gán quà `coGiftMap`: { [action]: [{ giftId, giftName, giftImage, coins }] }.
 * - Hành động được quyết định lúc quà tới (resolveGift → planGift); bên gọi giữ kết quả cho quà đang xếp hàng.
 * - Kế hoạch (`plan`) chỉ nói fan đi đâu + hiệu ứng gì; hàng chờ sân/phòng/vai/cảnh quay do module khác xử lý.
 */

import { stripVN } from './codes.js';

/** Một quà bị gán cho nhiều hành động → chạy hành động đứng trước (spec 4.2). */
export const ACTION_PRIORITY = ['gala', 'spotlight', 'pkStart', 'manager', 'tech', 'mc', 'ticket', 'confetti', 'genre'];

/** Xu tối thiểu của bậc 1..7 (spec 4.2). */
const TIER_MIN = [1, 5, 30, 99, 299, 1000, 10000];

/** Sự kiện cả tòa nhà theo bậc 5–7. */
const TIER_BUILDING = { 5: 'big', 6: 'spotlight', 7: 'gala' };

/** Độ mạnh sự kiện tòa nhà: gala > spotlight > big. */
const BUILDING_RANK = { big: 1, spotlight: 2, gala: 3 };

const ROLE_ACTIONS = ['mc', 'tech', 'manager'];

/**
 * Bậc xu: 1: 1–4 · 2: 5–29 · 3: 30–98 · 4: 99–298 · 5: 299–999 · 6: 1.000–9.999 · 7: ≥ 10.000.
 * Dưới 1 xu / không phải số → bậc 1.
 */
export function tierOf(xu) {
  const n = Number(xu);
  let tier = 1;
  for (let i = 1; i < TIER_MIN.length; i++) if (n >= TIER_MIN[i]) tier = i + 1;
  return tier;
}

/** Mã quà dạng chuỗi đã cắt khoảng trắng ('' khi không có). */
function idOf(giftId) {
  return giftId === null || giftId === undefined ? '' : String(giftId).trim();
}

/** Danh sách quà hợp lệ của một hành động trong bảng gán. */
function entriesOf(giftMap, action) {
  const list = giftMap && typeof giftMap === 'object' ? giftMap[action] : null;
  return Array.isArray(list) ? list.filter((e) => e && typeof e === 'object') : [];
}

/**
 * Tìm hành động đã gán cho quà: khớp mã quà trước; không mã nào khớp thì khớp tên (không dấu, không hoa thường).
 * Nhiều hành động cùng khớp → hành động đứng trước trong ACTION_PRIORITY.
 */
function findAction(giftId, giftName, giftMap) {
  const id = idOf(giftId);
  if (id) {
    for (const action of ACTION_PRIORITY) {
      if (entriesOf(giftMap, action).some((e) => idOf(e.giftId) === id)) return action;
    }
  }
  const name = stripVN(giftName);
  if (name) {
    for (const action of ACTION_PRIORITY) {
      if (entriesOf(giftMap, action).some((e) => stripVN(e.giftName) === name)) return action;
    }
  }
  return null;
}

/**
 * Quy đổi một sự kiện quà (đã hết combo) ra tổng xu, bậc và hành động đã gán.
 * xu = max(1, round(coins)) × max(1, round(count)) — quà lạ không giá tính 1 xu (xếp bậc thấp, không bao giờ cao).
 * @param {{giftId?:string|number, giftName?:string, coins?:number, count?:number}} gift
 * @param {Object<string, {giftId, giftName, giftImage, coins}[]>} giftMap bảng `coGiftMap`
 * @returns {{xu:number, tier:number, action:string|null, mapped:boolean}}
 */
export function resolveGift(gift, giftMap) {
  const { giftId, giftName, coins, count } = gift ?? {};
  const each = Math.max(1, Math.round(Number(coins) || 1));
  const times = Math.max(1, Math.round(Number(count) || 1));
  const xu = each * times;
  const action = findAction(giftId, giftName, giftMap);
  return { xu, tier: tierOf(xu), action, mapped: action !== null };
}

/** Kế hoạch trơn: fan lên sân khấu club mình, không gì thêm (bậc 1). */
function basePlan() {
  return { place: 'stage', role: null, roomFx: null, shoutout: false, genre: false, building: null, openPk: false };
}

/** Kế hoạch mặc định theo bậc cho quà chưa gán (spec 4.2, bảng bậc). */
function tierPlan(tier) {
  const plan = basePlan();
  if (tier === 2) {
    plan.roomFx = 'random';
    plan.shoutout = true;
  } else if (tier === 3) {
    plan.place = 'room';
  } else if (tier === 4) {
    plan.place = 'role';
    plan.role = 'auto';
  } else if (tier >= 5) {
    plan.building = TIER_BUILDING[tier];
    plan.openPk = true;
  }
  return plan;
}

/** Kế hoạch của hành động đã gán (spec 4.3). */
function actionPlan(action) {
  const plan = basePlan();
  if (action === 'genre') plan.genre = true;
  else if (action === 'ticket') plan.place = 'room';
  else if (ROLE_ACTIONS.includes(action)) {
    plan.place = 'role';
    plan.role = action;
  } else if (action === 'confetti') plan.roomFx = 'confetti';
  else if (action === 'pkStart') {
    plan.building = 'big';
    plan.openPk = true;
  } else if (action === 'spotlight' || action === 'gala') {
    plan.building = action;
    plan.openPk = true;
  }
  return plan;
}

/** Sự kiện tòa nhà mạnh hơn trong hai (null = không có). */
function strongerBuilding(a, b) {
  return (BUILDING_RANK[b] ?? 0) > (BUILDING_RANK[a] ?? 0) ? b : a;
}

function clampTier(tier) {
  return Math.min(7, Math.max(1, Math.floor(Number(tier) || 1)));
}

/**
 * Kế hoạch phản hồi cho một quà đã quy đổi.
 * - place: fan đi đâu ('stage' sân khấu · 'room' phòng mang tên · 'role' vai)
 * - role: vai cụ thể, hoặc 'auto' (bậc 4: vai trống theo MC → Kỹ thuật → Quản lý)
 * - roomFx: hiệu ứng lớp B tại sân ('random' pháo giấy/khói/chớp · 'confetti' mưa pháo giấy)
 * - shoutout: MC NPC gọi tên · genre: đổi thể loại nhạc sân/phòng
 * - building: sự kiện cả tòa nhà ('big' quà lớn · 'spotlight' tâm điểm · 'gala') · openPk: mở PK nếu đang không có
 * Quà đã gán mà bậc ≥ 5 → chạy thêm sự kiện của bậc (lấy cái mạnh hơn) + mở PK.
 * @param {{action:string|null, tier:number, mapped:boolean}} resolved kết quả resolveGift
 * @param {{tierFallback?:boolean}} [opts] `coTierFallback` — tắt thì quà chưa gán chỉ lên sân khấu
 */
export function planGift(resolved, opts = {}) {
  const { action = null, tier = 1, mapped = false } = resolved ?? {};
  const tierFallback = opts?.tierFallback === undefined ? true : !!opts.tierFallback;
  const t = clampTier(tier);
  if (!mapped || !ACTION_PRIORITY.includes(action)) return tierFallback ? tierPlan(t) : basePlan();
  const plan = actionPlan(action);
  if (t >= 5) {
    plan.building = strongerBuilding(plan.building, TIER_BUILDING[t]);
    plan.openPk = true;
  }
  return plan;
}

/** Kế hoạch dự phòng khi hàng chờ phòng/vai đã đầy: như bậc 2 (lên sân + hiệu ứng ngẫu nhiên + MC gọi tên). */
export function fallbackPlan() {
  return tierPlan(2);
}

// ------------------------------------------------------------------ bảng chú giải trên overlay

const ROLE_ICON = { mc: '🎙️', tech: '🎛️', manager: '📋' };
const ROLE_LABEL = { mc: 'MC', tech: 'Kỹ thuật', manager: 'Quản lý' };

/** Quà THỰC SỰ chạy hành động này (quà gán trùng chỉ hiện ở hành động thắng theo ACTION_PRIORITY). */
function effectiveEntries(giftMap, action) {
  return entriesOf(giftMap, action).filter((e) => {
    if (!idOf(e.giftId) && !stripVN(e.giftName)) return false;
    return findAction(e.giftId, e.giftName, giftMap) === action;
  });
}

function nameOf(entry) {
  const name = String(entry.giftName ?? '').trim();
  if (name) return name;
  const id = idOf(entry.giftId);
  return id ? `Quà #${id}` : 'Quà';
}

function imageOf(entry) {
  return entry && typeof entry.giftImage === 'string' && entry.giftImage ? entry.giftImage : null;
}

/**
 * Bảng chú giải quà (tối đa 6 dòng), tự sinh từ `coGiftMap` — spec 4.3.
 * Mỗi dòng hiện thành `${icon} ${text}`; dòng nào hành động không có quà thì bỏ.
 * @param {Object} giftMap bảng `coGiftMap`
 * @param {{ticketName?:string}} [opts] ticketName: tên hiển thị thay cho tên quà vé (khi bên gọi có tên chuẩn hơn)
 * @returns {{icon:string, text:string, giftImage:string|null}[]}
 */
export function legendRows(giftMap, opts = {}) {
  const ticketName = opts?.ticketName;
  const rows = [{ icon: '🌹', text: 'Quà bất kỳ → lên sân khấu', giftImage: null }];
  const first = (action) => effectiveEntries(giftMap, action)[0] ?? null;

  const ticket = first('ticket');
  if (ticket) {
    const name = String(ticketName ?? '').trim() || nameOf(ticket);
    rows.push({ icon: '🎟️', text: `${name} → phòng LIVE mang tên bạn`, giftImage: imageOf(ticket) });
  }

  const roles = ROLE_ACTIONS.map((r) => ({ r, e: first(r) })).filter((x) => x.e);
  if (roles.length) {
    rows.push({
      icon: roles.map((x) => ROLE_ICON[x.r]).join(''),
      text: `${roles.map((x) => nameOf(x.e)).join(' / ')} → ${roles.map((x) => ROLE_LABEL[x.r]).join(' / ')}`,
      giftImage: roles.map((x) => imageOf(x.e)).find(Boolean) ?? null,
    });
  }

  const genre = first('genre');
  const confetti = first('confetti');
  if (genre || confetti) {
    const parts = [];
    if (genre) parts.push(`${nameOf(genre)} → đổi nhạc`);
    if (confetti) parts.push(`${genre ? '🎉 ' : ''}${nameOf(confetti)} → mưa pháo giấy`);
    rows.push({ icon: genre ? '🎵' : '🎉', text: parts.join(' · '), giftImage: imageOf(genre) ?? imageOf(confetti) });
  }

  const pk = first('pkStart');
  if (pk) rows.push({ icon: '⚔️', text: `${nameOf(pk)} → PK ngay`, giftImage: imageOf(pk) });

  const spot = first('spotlight');
  if (spot) rows.push({ icon: '🌌', text: `${nameOf(spot)} → cả tòa nhà về nhóm bạn`, giftImage: imageOf(spot) });

  return rows.slice(0, 6);
}
