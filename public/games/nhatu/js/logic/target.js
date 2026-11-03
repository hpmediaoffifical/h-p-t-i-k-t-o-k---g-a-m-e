/**
 * ⛓️ Nhà Tù Online — chỉ định người để chơi khăm bằng MÃ SỐ TÙ NHÂN (số 4 chữ số in trên áo + bảng tên).
 * Logic thuần (không DOM, không three.js) → test bằng `npm test` (tests/nhatu-target.test.mjs).
 *
 * - Quà nhắm người (🗑️ thùng rác, trò đùa, hít đất, vật tay, lì xì, bảo lãnh…) KHÔNG chạy ngay: mở cửa sổ
 *   `ntTargetSec` giây (mặc định 10) để người tặng bình luận mã số tù nhân của người muốn nhắm.
 * - Bình luận mã số → chạy ngay vào đúng người đó. Hết giờ không bình luận → ⚔️ trả thù kẻ vừa chơi khăm mình
 *   (trong `ntRevengeSec` giây) hoặc bốc ngẫu nhiên như cũ.
 */

/** Hành động quà nhắm vào người cụ thể (bình luận mã số tù nhân sau khi tặng). */
export const TARGETED = new Set(['trash', 'shave', 'dress', 'cake', 'banana', 'pushup', 'armwrestle', 'lixi', 'bail', 'report']);

/** Hành động "chơi khăm" — người bị nhắm được quyền ⚔️ trả thù người tặng. */
export const HOSTILE = new Set(['trash', 'shave', 'dress', 'cake', 'banana', 'pushup', 'armwrestle', 'report']);

/**
 * Đọc mã số tù nhân (đúng 4 chữ số) trong bình luận: "ném 4823", "#4823 5120", "số 4823 nha" → [4823, 5120].
 * Số dài hơn ("12345", số điện thoại…) không tính. Không trùng lặp, giữ thứ tự gõ.
 * @returns {number[]}
 */
export function parsePrisonerNumbers(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(/(?<!\d)(\d{4})(?!\d)/g)) {
    const n = Number(m[1]);
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * Đổi mã số → nhân vật đang có trong trại.
 * @param {number[]} numbers
 * @param {(n:number) => object|null} lookup mã số → nhân vật (null = không có trong trại)
 * @param {{exclude?: object|null, max?: number, usable?: (a:object) => boolean}} [opts]
 *   exclude = chính người tặng; usable = nhân vật đang nhắm được (không bị vác, không ở trong thùng rác…)
 * @returns {{hits: object[], missing: number[], busy: number[]}}
 */
export function matchTargets(numbers, lookup, { exclude = null, max = 3, usable = () => true } = {}) {
  const hits = [];
  const missing = [];
  const busy = [];
  for (const n of numbers) {
    const a = lookup(n);
    if (!a || a === exclude) missing.push(n);
    else if (!usable(a)) busy.push(n);
    else if (!hits.includes(a) && hits.length < max) hits.push(a);
  }
  return { hits, missing, busy };
}

/**
 * Các cửa sổ "chọn mục tiêu" đang mở. Cùng người tặng + cùng hành động đang chờ → gộp (combo tăng số người trúng).
 */
export class TargetWindows {
  constructor({ sec = 10 } = {}) {
    this.sec = sec;
    this.items = [];
    this.seq = 0;
  }

  /**
   * Mở cửa sổ chọn mục tiêu.
   * @param {{gifterId:string, action:string, power?:number}} o
   * @returns {{entry:object, merged:boolean}}
   */
  open({ gifterId, action, power = 1, ...rest }, now) {
    const same = this.items.find((w) => w.gifterId === gifterId && w.action === action);
    if (same) {
      same.power = Math.max(same.power, power);
      return { entry: same, merged: true };
    }
    const entry = { id: ++this.seq, gifterId, action, power, openedAt: now, until: now + this.sec * 1000, ...rest };
    this.items.push(entry);
    return { entry, merged: false };
  }

  /** Cửa sổ đang chờ của 1 người tặng (cũ trước). */
  of(gifterId) {
    return this.items.filter((w) => w.gifterId === gifterId);
  }

  close(entry) {
    const i = this.items.indexOf(entry);
    if (i >= 0) this.items.splice(i, 1);
  }

  /** Lấy ra (và gỡ) các cửa sổ đã hết giờ. */
  expired(now) {
    const out = this.items.filter((w) => now >= w.until);
    if (out.length) this.items = this.items.filter((w) => now < w.until);
    return out;
  }

  /** Giây còn lại của 1 cửa sổ. */
  left(entry, now) {
    return Math.max(0, (entry.until - now) / 1000);
  }

  clear() {
    this.items = [];
  }
}

/**
 * Sổ thù: ai vừa bị ai chơi khăm. Trong `sec` giây, người bị chơi tặng quà chơi khăm mà không bình luận
 * mã số → tự nhắm lại kẻ đã chơi mình (⚔️ TRẢ THÙ). Chỉ nhớ lần gần nhất.
 */
export class Grudges {
  constructor({ sec = 60 } = {}) {
    this.sec = sec;
    this.map = new Map(); // victimId → {by, at}
  }

  record(victimId, byId, now) {
    if (!victimId || !byId || victimId === byId) return;
    this.map.set(victimId, { by: byId, at: now });
    if (this.map.size > 300) for (const [k, g] of this.map) if (now - g.at > this.sec * 1000) this.map.delete(k);
  }

  /** Id kẻ mà `victimId` đang được quyền trả thù (null = không có / quá hạn). */
  peek(victimId, now) {
    const g = this.map.get(victimId);
    if (!g) return null;
    if (now - g.at > this.sec * 1000) {
      this.map.delete(victimId);
      return null;
    }
    return g.by;
  }

  clear(victimId) {
    this.map.delete(victimId);
  }

  reset() {
    this.map.clear();
  }
}
