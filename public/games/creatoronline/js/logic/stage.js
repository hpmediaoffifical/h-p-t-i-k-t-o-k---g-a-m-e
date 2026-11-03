/**
 * 🏢 Creator Online — 12 chỗ khách trên mỗi sân khấu nhóm.
 * Spec: docs/superpowers/specs/2026-11-03-creatoronline-design.md mục 5 (và 4.2, bảng 17.3).
 * Logic thuần (không DOM, không three.js) → test bằng `npm test` (tests/creatoronline-stage.test.mjs).
 *
 * - Quà bất kỳ (kể cả Hoa hồng) → fan lên sân club mình.
 * - Thời gian trên sân = clamp(base + perCoin × (xu − 1), base, max) giây.
 * - Chỗ 0–5 là vị trí idol (lấp trước, idol NPC lùi ra cánh gà), chỗ 6–11 là hàng trước.
 * - Đang trên sân tặng thêm → cộng giờ, nhưng không quá `now + max`.
 * - Sân đầy → thay người còn ÍT giờ nhất trong số người đã đứng ≥ minStand (8 giây, bằng cảnh quay ngắn nhất).
 *   Không thay được ai → xếp hàng FIFO (tối đa queueMax); hàng đầy → 'full' (đứng hàng đầu khán giả, lightstick vàng).
 * - Thời gian luôn là `now` (ms) truyền vào, không đọc đồng hồ.
 */

/** Xu hợp lệ của một món quà: quà lạ / thiếu giá tính 1 xu (mục 4.1). */
function coins(xu) {
  const n = Number(xu);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Số giây trên sân cho món quà `xu` xu.
 * @param {number} xu tổng xu của combo (coinValue × repeatCount)
 * @param {{baseSec?:number, perCoinSec?:number, maxSec?:number}} [opts]
 * @returns {number} giây, trong [baseSec, maxSec]
 */
export function stageSeconds(xu, { baseSec = 12, perCoinSec = 3, maxSec = 120 } = {}) {
  const n = Number(xu);
  const c = Number.isFinite(n) ? n : 1;
  const max = Math.max(baseSec, maxSec);
  return Math.min(max, Math.max(baseSec, baseSec + perCoinSec * (c - 1)));
}

export class StageSlots {
  /**
   * @param {{slots?:number, queueMax?:number, minStandMs?:number, baseSec?:number, perCoinSec?:number, maxSec?:number}} [opts]
   */
  constructor({ slots = 12, queueMax = 10, minStandMs = 8000, baseSec = 12, perCoinSec = 3, maxSec = 120 } = {}) {
    this.slotCount = Math.max(1, Math.floor(slots));
    this.queueMax = Math.max(0, Math.floor(queueMax));
    this.minStandMs = Math.max(0, minStandMs);
    this.timing = { baseSec, perCoinSec, maxSec: Math.max(baseSec, maxSec) };
    /** @type {({id:string, since:number, until:number}|null)[]} chỗ đứng, null = trống */
    this.slots = new Array(this.slotCount).fill(null);
    /** @type {{id:string, xu:number}[]} hàng chờ FIFO */
    this.queue = [];
  }

  /** Mili-giây trên sân cho `xu` xu. */
  _ms(xu) {
    return stageSeconds(coins(xu), this.timing) * 1000;
  }

  _put(slot, id, xu, now) {
    this.slots[slot] = { id, since: now, until: now + this._ms(xu) };
  }

  _slotIndex(id) {
    return this.slots.findIndex((e) => e !== null && e.id === id);
  }

  /** Chỗ trống đầu tiên (chỗ idol 0–5 trước), -1 nếu đầy. */
  _freeSlot() {
    return this.slots.indexOf(null);
  }

  /**
   * Chỗ của người bị thay được: đã đứng ≥ minStand, còn ít giờ nhất (hoà → chỗ nhỏ hơn).
   * @param {number} now
   * @param {Set<string>} [skip] id vừa lên trong cùng lượt tick (không thay ngay)
   */
  _replaceable(now, skip) {
    let best = -1;
    for (let i = 0; i < this.slots.length; i++) {
      const e = this.slots[i];
      if (!e || now - e.since < this.minStandMs || skip?.has(e.id)) continue;
      if (best < 0 || e.until < this.slots[best].until) best = i;
    }
    return best;
  }

  /**
   * Ghi nhận một món quà của fan `id`.
   * Có người đang chờ thì người mới đứng sau họ (FIFO), kể cả khi vừa có chỗ trống — tick() sẽ đưa người chờ lên trước.
   * @param {string} id fanKey
   * @param {number} xu tổng xu của combo
   * @param {number} now ms
   * @returns {{status:'on'|'extended'|'queued'|'full', slot?:number, replaced?:string}}
   */
  add(id, xu, now) {
    const i = this._slotIndex(id);
    if (i >= 0) {
      const e = this.slots[i];
      e.until = Math.min(e.until + this._ms(xu), now + this.timing.maxSec * 1000);
      return { status: 'extended', slot: i };
    }
    const waiting = this.queue.find((q) => q.id === id);
    if (waiting) {
      waiting.xu += coins(xu); // cộng xu, lên sân sẽ tính giờ theo tổng
      return { status: 'queued' };
    }
    if (!this.queue.length) {
      const free = this._freeSlot();
      if (free >= 0) {
        this._put(free, id, xu, now);
        return { status: 'on', slot: free };
      }
      const r = this._replaceable(now);
      if (r >= 0) {
        const replaced = this.slots[r].id;
        this._put(r, id, xu, now);
        return { status: 'on', slot: r, replaced };
      }
    }
    if (this.queue.length < this.queueMax) {
      this.queue.push({ id, xu: coins(xu) });
      return { status: 'queued' };
    }
    return { status: 'full' };
  }

  /**
   * Gọi đều đặn: người hết giờ xuống sân, người chờ lên chỗ trống, rồi thay người đã đứng đủ minStand.
   * @param {number} now ms
   * @returns {{left:string[], joined:{id:string, slot:number}[]}}
   */
  tick(now) {
    const left = [];
    const joined = [];
    for (let i = 0; i < this.slots.length; i++) {
      const e = this.slots[i];
      if (e && e.until <= now) {
        left.push(e.id);
        this.slots[i] = null;
      }
    }
    const fresh = new Set();
    for (let i = 0; i < this.slots.length && this.queue.length; i++) {
      if (this.slots[i]) continue;
      const q = this.queue.shift();
      this._put(i, q.id, q.xu, now);
      joined.push({ id: q.id, slot: i });
      fresh.add(q.id);
    }
    while (this.queue.length) {
      const r = this._replaceable(now, fresh);
      if (r < 0) break;
      left.push(this.slots[r].id);
      const q = this.queue.shift();
      this._put(r, q.id, q.xu, now);
      joined.push({ id: q.id, slot: r });
      fresh.add(q.id);
    }
    return { left, joined };
  }

  /** Gỡ fan khỏi sân hoặc hàng chờ (rời tòa nhà, nhận vai / phòng). */
  remove(id) {
    const i = this._slotIndex(id);
    if (i >= 0) {
      this.slots[i] = null;
      return true;
    }
    const k = this.queue.findIndex((q) => q.id === id);
    if (k >= 0) {
      this.queue.splice(k, 1);
      return true;
    }
    return false;
  }

  isOn(id) {
    return this._slotIndex(id) >= 0;
  }

  isQueued(id) {
    return this.queue.some((q) => q.id === id);
  }

  /** @returns {number|null} */
  slotOf(id) {
    const i = this._slotIndex(id);
    return i >= 0 ? i : null;
  }

  /** @returns {{id:string, slot:number, since:number, until:number}[]} theo thứ tự chỗ */
  entries() {
    const out = [];
    this.slots.forEach((e, slot) => {
      if (e) out.push({ id: e.id, slot, since: e.since, until: e.until });
    });
    return out;
  }

  /** @returns {string[]} id trong hàng chờ, người đầu hàng trước */
  queueIds() {
    return this.queue.map((q) => q.id);
  }

  /** Ảnh chụp trạng thái để lưu localStorage (chỉ trạng thái, không gồm thông số). */
  toJSON() {
    return {
      slots: this.entries(),
      queue: this.queue.map((q) => ({ id: q.id, xu: q.xu })),
    };
  }

  /**
   * Dựng lại từ ảnh chụp. Thông số lấy từ `opts` (cấu hình hiện tại), trạng thái từ `obj`.
   * Bỏ qua dòng hỏng, id trùng, chỗ nằm ngoài số chỗ mới; hàng chờ cắt theo queueMax mới.
   */
  static fromJSON(obj, opts = {}) {
    const s = new StageSlots(opts);
    const seen = new Set();
    const okId = (id) => (typeof id === 'string' || typeof id === 'number') && !seen.has(id);
    for (const e of Array.isArray(obj?.slots) ? obj.slots : []) {
      if (!e || !okId(e.id)) continue;
      if (!Number.isInteger(e.slot) || e.slot < 0 || e.slot >= s.slotCount || s.slots[e.slot]) continue;
      if (!Number.isFinite(e.since) || !Number.isFinite(e.until)) continue;
      s.slots[e.slot] = { id: e.id, since: e.since, until: e.until };
      seen.add(e.id);
    }
    for (const q of Array.isArray(obj?.queue) ? obj.queue : []) {
      if (s.queue.length >= s.queueMax) break;
      if (!q || !okId(q.id)) continue;
      s.queue.push({ id: q.id, xu: coins(q.xu) });
      seen.add(q.id);
    }
    return s;
  }
}
