/**
 * ⛓️ Nhà Tù Online — trại đầy thì ai phải nhường chỗ cho người mới.
 * Logic thuần (không DOM, không three.js) → test bằng `npm test` (tests/nhatu-population.test.mjs).
 *
 * - Người đang lên sóng và người đang CHỜ LƯỢT không bao giờ bị đẩy ra (trước đây người chờ có thể bị đẩy →
 *   tới lượt mà không còn nhân vật).
 * - Ưu tiên nhường: người đang bị biệt giam → người không giữ chức vụ → người im lặng lâu nhất.
 */

/**
 * Id những người không được đẩy khỏi trại: người đang lên sóng + mọi người trong hàng chờ lượt.
 * @param {{current: {id:string}|null, queue: {id:string}[]}} spot SpotlightQueue
 * @returns {Set<string>}
 */
export function turnHolderIds(spot) {
  const ids = new Set();
  if (spot.current) ids.add(spot.current.id);
  for (const q of spot.queue) ids.add(q.id);
  return ids;
}

/**
 * Chọn người xem phải rời trại.
 * @param {Iterable<{id:string, lastActive:number, jailed?:boolean}>} viewers
 * @param {Set<string>} protectedIds id người đang lên sóng + đang chờ lượt
 * @param {(v:object) => boolean} [hasRole] người đang giữ chức vụ (Đại Ca, Cán Bộ, Đầu Bếp…)
 * @returns {object|null} null = không ai nhường được (mọi người trong trại đều đang giữ/chờ lượt)
 */
export function pickEvictee(viewers, protectedIds, hasRole = () => false) {
  let best = null;
  let bestRole = false;
  for (const v of viewers) {
    if (protectedIds.has(v.id)) continue;
    const role = !!hasRole(v);
    if (!best || isBetter(v, role, best, bestRole)) {
      best = v;
      bestRole = role;
    }
  }
  return best;
}

function isBetter(a, aRole, b, bRole) {
  if (!!a.jailed !== !!b.jailed) return !!a.jailed;
  if (aRole !== bRole) return !aRole;
  return a.lastActive < b.lastActive;
}

/**
 * Giới hạn số người được thay ra/vào mỗi giây khi trại đầy (thùng token): phòng đông bình luận dồn dập thì
 * không dựng/huỷ hàng chục nhân vật mỗi giây. Quà không đi qua giới hạn này.
 */
export class SwapBudget {
  /** @param {{perSec?:number, burst?:number}} opts */
  constructor({ perSec = 3, burst = 6 } = {}) {
    this.perSec = perSec;
    this.burst = burst;
    this.tokens = burst;
    this.at = null;
  }

  /** Lấy 1 lượt thay người lúc `now` (ms). false = hết lượt, để người mới chờ lần sau. */
  take(now) {
    if (this.at !== null) this.tokens = Math.min(this.burst, this.tokens + (Math.max(0, now - this.at) / 1000) * this.perSec);
    this.at = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
