/**
 * ⛓️ Nhà Tù Online — camera cho người tương tác MIỄN PHÍ (lúc không ai có lượt quà).
 * Logic thuần (không DOM, không three.js) → test bằng `npm test` (tests/nhatu-cameo.test.mjs).
 *
 * Bậc ưu tiên: quà (lượt lên sóng, ngoài module này) > chia sẻ > theo dõi > bình luận > thả tim.
 * - Chia sẻ / theo dõi → được camera ghé riêng vài giây (CameoQueue) kèm lời cảm ơn.
 * - Lúc camera đi dạo: người có điểm "quan tâm" cao được ghé nhiều hơn (Interest, giảm dần theo thời gian).
 */

/** Điểm quan tâm mỗi lần tương tác. */
export const INTEREST_WEIGHT = { share: 8, follow: 6, comment: 3, like: 1 };

export class Interest {
  /** @param {{halfLifeSec?: number}} opts điểm giảm một nửa sau bấy nhiêu giây */
  constructor({ halfLifeSec = 90 } = {}) {
    this.halfLife = halfLifeSec * 1000;
    this.map = new Map(); // id → {s, at}
  }

  score(id, now) {
    const e = this.map.get(id);
    return e ? e.s * 0.5 ** (Math.max(0, now - e.at) / this.halfLife) : 0;
  }

  bump(id, kind, now) {
    this.map.set(id, { s: this.score(id, now) + (INTEREST_WEIGHT[kind] ?? 1), at: now });
    if (this.map.size > 500) for (const [k] of this.map) if (this.score(k, now) < 0.05) this.map.delete(k);
  }

  forget(id) {
    this.map.delete(id);
  }

  /**
   * Bốc 1 người cho camera ghé, theo trọng số điểm quan tâm (người im lâu gần như không được bốc).
   * @param {string[]} ids những người đang có mặt
   * @returns {string|null}
   */
  pick(ids, now, rng = Math.random) {
    let total = 0;
    const w = ids.map((id) => {
      const s = this.score(id, now);
      total += s;
      return s;
    });
    if (total < 0.05) return null;
    let r = rng() * total;
    for (let i = 0; i < ids.length; i++) {
      r -= w[i];
      if (r <= 0) return ids[i];
    }
    return ids[ids.length - 1];
  }
}

/**
 * Hàng chờ "ghé thăm" cho người chia sẻ / theo dõi: mỗi người 1 lần, tối đa `max` người chờ,
 * chờ quá `ttlSec` giây (camera bận lượt quà suốt) thì bỏ.
 */
export class CameoQueue {
  constructor({ max = 6, ttlSec = 90 } = {}) {
    this.max = max;
    this.ttl = ttlSec * 1000;
    this.items = [];
  }

  /** @returns {boolean} true = đã xếp vào hàng */
  push(id, kind, now) {
    this.items = this.items.filter((c) => now - c.at < this.ttl);
    if (this.items.some((c) => c.id === id)) return false;
    if (this.items.length >= this.max) {
      // hàng đầy: chia sẻ được thay chỗ người theo dõi cũ nhất
      const i = kind === 'share' ? this.items.findIndex((c) => c.kind !== 'share') : -1;
      if (i < 0) return false;
      this.items.splice(i, 1);
    }
    this.items.push({ id, kind, at: now });
    return true;
  }

  /** Lấy người kế tiếp (chia sẻ trước theo dõi). */
  next(now) {
    this.items = this.items.filter((c) => now - c.at < this.ttl);
    if (!this.items.length) return null;
    const i = Math.max(0, this.items.findIndex((c) => c.kind === 'share'));
    return this.items.splice(i, 1)[0];
  }

  get size() {
    return this.items.length;
  }
}
