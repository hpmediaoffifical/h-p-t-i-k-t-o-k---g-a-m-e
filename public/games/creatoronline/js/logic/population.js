/**
 * 🏢 Creator Online — tòa nhà đầy thì ai nhường chỗ, ai không bao giờ bị đẩy, người tặng quà vượt trần tạm.
 * Spec: docs/superpowers/specs/2026-11-03-creatoronline-design.md mục 3 (Dân số), bảng 17.3 (`gifterProtectSec`,
 * `overflowViewers`).
 * Logic thuần (không DOM, không three.js) → test bằng `npm test` (tests/creatoronline-population.test.mjs).
 *
 * Chép/chỉnh từ Nhà Tù population.js (bản working tree 03/11/2026, chưa commit — `public/games/nhatu/js/logic/population.js`):
 * - `pickEvictee` bỏ tham số `hasRole` và cờ biệt giam: Creator Online không có luật phạt, còn người giữ vai đã
 *   nằm trong `protectedSet` nên không bao giờ tới lượt bị chọn.
 * - `SwapBudget` giữ nguyên thùng token (cùng tên hàm, cùng nghĩa), thêm `toJSON/fromJSON` để lưu buổi LIVE.
 * - Thêm `protectedSet` (ai không được đẩy) và `canOverflow` (người tặng quà luôn được vào, vượt trần tạm).
 * - Thời gian luôn là `now` (ms) truyền vào, không đọc đồng hồ.
 */

/**
 * Chọn người xem phải rời tòa nhà: người im lặng lâu nhất trong số người không được bảo vệ.
 * @param {Iterable<{id:string, lastActive:number}>} viewers
 * @param {Set<string>} protectedIds kết quả của `protectedSet`
 * @returns {object|null} null = không ai nhường được (mọi người đều được bảo vệ, hoặc tòa nhà trống)
 */
export function pickEvictee(viewers, protectedIds) {
  let best = null;
  for (const v of viewers) {
    if (!v || protectedIds?.has(v.id)) continue;
    if (!best || v.lastActive < best.lastActive) best = v;
  }
  return best;
}

/**
 * Người tặng quà có được sinh nhân vật nữa không (tòa nhà đầy, không đẩy được ai).
 * Người tặng quà luôn được vào: vượt trần tạm tới `max + overflow`, nhưng không vượt trần cứng (mục 16: 160 thường /
 * 100 thấp). Bình luận / thả tim / follow KHÔNG dùng hàm này: đầy thì không sinh nhân vật mới.
 * @param {number} count số người xem đang có nhân vật
 * @param {{max:number, overflow?:number, hardCap?:number}} opts `max` = coMaxViewers; thiếu `hardCap` = không có trần cứng
 * @returns {boolean}
 */
export function canOverflow(count, { max, overflow = 20, hardCap = Infinity } = {}) {
  return count < Math.min(max + overflow, hardCap);
}

/**
 * Id những người không được đẩy khỏi tòa nhà (mục 3): đang trên sân khấu, giữ vai, chủ phòng, đang chờ sân / phòng /
 * vai, có cảnh quay đang chờ, tặng quà trong `gifterProtectMs` (5 phút) qua.
 * @param {{
 *   stageIds?: Iterable<string>, roleIds?: Iterable<string>, roomIds?: Iterable<string>, queuedIds?: Iterable<string>,
 *   shotGifterIds?: Iterable<string>, recentGifters?: Map<string, number>, now?: number, gifterProtectMs?: number
 * }} parts `recentGifters`: id → lúc tặng quà gần nhất (ms). Thiếu `now` thì coi mọi người trong `recentGifters` là
 *   vừa tặng (an toàn: không đẩy nhầm người tặng quà).
 * @returns {Set<string>}
 */
export function protectedSet({
  stageIds = [],
  roleIds = [],
  roomIds = [],
  queuedIds = [],
  shotGifterIds = [],
  recentGifters = new Map(),
  now,
  gifterProtectMs = 300000,
} = {}) {
  const ids = new Set();
  for (const list of [stageIds, roleIds, roomIds, queuedIds, shotGifterIds]) {
    if (!list) continue;
    for (const id of list) if (id != null) ids.add(id);
  }
  const knowNow = Number.isFinite(now);
  for (const [id, at] of recentGifters ?? []) {
    if (id == null) continue;
    // còn trong cửa sổ bảo vệ (mốc giờ trong tương lai do lệch đồng hồ cũng tính là vừa tặng)
    if (!knowNow || now - at < gifterProtectMs) ids.add(id);
  }
  return ids;
}

/**
 * Giới hạn số người được thay ra/vào mỗi giây khi tòa nhà đầy (thùng token): phòng đông bình luận dồn dập thì
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

  /** Ảnh chụp để lưu buổi LIVE (localStorage). */
  toJSON() {
    return { tokens: this.tokens, at: this.at };
  }

  /**
   * Dựng lại từ `toJSON()`. Thông số (`perSec`, `burst`) lấy từ `opts`, không từ bản lưu.
   * @param {{tokens?:number, at?:number|null}} obj
   * @param {{perSec?:number, burst?:number}} [opts]
   */
  static fromJSON(obj, opts = {}) {
    const b = new SwapBudget(opts);
    if (Number.isFinite(obj?.tokens)) b.tokens = Math.max(0, Math.min(b.burst, obj.tokens));
    if (Number.isFinite(obj?.at)) b.at = obj.at;
    return b;
  }
}
