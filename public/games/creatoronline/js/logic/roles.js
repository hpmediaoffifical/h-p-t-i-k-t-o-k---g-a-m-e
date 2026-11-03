/**
 * 🏢 Creator Online — vai trong nhóm: 🎙️ MC, 🎛️ Kỹ thuật, 📋 Quản lý.
 * Spec: docs/superpowers/specs/2026-11-03-creatoronline-design.md mục 7 (và 4.2 bậc 4, 4.4, bảng 17.3).
 * Logic thuần (không DOM, không three.js) → test bằng `npm test` (tests/creatoronline-roles.test.mjs).
 *
 * - Mỗi sân club (1–5) có 3 vai. Vai thuộc sân club của người tặng.
 * - Nhận vai: giữ `durMs` (180 giây), giữ chắc `lockMs` (45 giây) đầu.
 * - Người giữ tặng lại: cộng `extendMs` (90 giây), trần `maxMs` (300 giây) tính từ lúc nhận; có người chờ thì không cộng.
 * - Người khác tặng cùng vai: xếp hàng, KHÔNG cướp. Mỗi vai `queueMax` (1) chỗ chờ; hàng đầy → 'full' (quà về bậc 2).
 * - Có người chờ: người giữ còn tối đa `yieldMs` (60 giây) nữa, nhưng không trước khi hết giữ chắc.
 * - Mỗi người chỉ một vai (giữ hoặc chờ) trên cả tòa nhà.
 * - Thời gian luôn là `now` (ms) truyền vào, không đọc đồng hồ.
 */

export const ROLES = ['mc', 'tech', 'manager'];

/** Club hợp lệ: số nguyên 1..5 (G1–G5). */
const CLUBS = [1, 2, 3, 4, 5];

const slotKey = (club, role) => `${club}:${role}`;

export class RoleBoard {
  /**
   * @param {{durMs?:number, lockMs?:number, maxMs?:number, extendMs?:number, yieldMs?:number, queueMax?:number}} [opts]
   */
  constructor({ durMs = 180000, lockMs = 45000, maxMs = 300000, extendMs = 90000, yieldMs = 60000, queueMax = 1 } = {}) {
    this.durMs = durMs;
    this.lockMs = lockMs;
    this.maxMs = maxMs;
    this.extendMs = extendMs;
    this.yieldMs = yieldMs;
    this.queueMax = Math.max(0, Math.floor(queueMax));
    /** @type {Map<string, {club:number, role:string, holder:{id:string, since:number, until:number, lockUntil:number}|null, queue:string[]}>} */
    this.slots = new Map();
    for (const club of CLUBS) {
      for (const role of ROLES) this.slots.set(slotKey(club, role), { club, role, holder: null, queue: [] });
    }
  }

  _slot(club, role) {
    return this.slots.get(slotKey(Number(club), role)) ?? null;
  }

  /** Vai mà `id` đang giữ (ô vai) hoặc null. */
  _heldBy(id) {
    for (const s of this.slots.values()) if (s.holder?.id === id) return s;
    return null;
  }

  /** Ô vai mà `id` đang chờ hoặc null. */
  _queuedAt(id) {
    for (const s of this.slots.values()) if (s.queue.includes(id)) return s;
    return null;
  }

  _grant(s, id, now) {
    s.holder = { id, since: now, until: now + Math.min(this.durMs, this.maxMs), lockUntil: now + this.lockMs };
  }

  /** Có người chờ → người giữ còn tối đa yieldMs nữa, nhưng không trước lockUntil. */
  _yield(s, now) {
    const h = s.holder;
    if (h) h.until = Math.min(h.until, Math.max(h.lockUntil, now + this.yieldMs));
  }

  _enqueue(s, id, now) {
    s.queue.push(id);
    this._yield(s, now);
    return { status: 'queued', club: s.club, role: s.role };
  }

  /** Người đầu hàng nhận vai; hàng còn người thì áp luật nhường cho người vừa nhận. */
  _promote(s, now) {
    const id = s.queue.shift();
    this._grant(s, id, now);
    if (s.queue.length) this._yield(s, now);
    return { type: 'grant', club: s.club, role: s.role, id };
  }

  /** Ô vai trống thật: không ai giữ, không ai chờ. */
  _free(s) {
    return !s.holder && !s.queue.length;
  }

  /**
   * Có quà xin vai.
   * @param {number} club 1..5 — club của người tặng
   * @param {'mc'|'tech'|'manager'|'auto'} role 'auto' = bậc 4: vai trống theo thứ tự MC → Kỹ thuật → Quản lý
   * @param {string} id fanKey
   * @param {number} now ms
   * @returns {{status:'granted'|'extended'|'held'|'queued'|'full', club:number, role:string}}
   *   granted: nhận vai · extended: đang giữ, được cộng giờ · held: đang giữ, có người chờ nên không cộng ·
   *   queued: đang chờ (mới vào hoặc đã chờ từ trước) · full: không còn chỗ (quà về bậc 2)
   */
  request(club, role, id, now) {
    // Mỗi người một vai: đang giữ vai nào thì coi như tặng lại đúng vai đó.
    const held = this._heldBy(id);
    if (held) {
      if (held.queue.length) return { status: 'held', club: held.club, role: held.role };
      const h = held.holder;
      h.until = Math.min(h.until + this.extendMs, h.since + this.maxMs);
      return { status: 'extended', club: held.club, role: held.role };
    }
    const waiting = this._queuedAt(id);
    if (waiting) return { status: 'queued', club: waiting.club, role: waiting.role };

    const c = Number(club);
    if (!CLUBS.includes(c)) return { status: 'full', club, role };

    if (role === 'auto') {
      for (const r of ROLES) {
        const s = this._slot(c, r);
        if (this._free(s)) {
          this._grant(s, id, now);
          return { status: 'granted', club: c, role: r };
        }
      }
      // Hết vai trống → hàng ngắn nhất còn chỗ; hoà thì theo thứ tự MC → Kỹ thuật → Quản lý.
      let best = null;
      for (const r of ROLES) {
        const s = this._slot(c, r);
        if (s.queue.length < this.queueMax && (!best || s.queue.length < best.queue.length)) best = s;
      }
      return best ? this._enqueue(best, id, now) : { status: 'full', club: c, role: 'auto' };
    }

    const s = this._slot(c, role);
    if (!s) return { status: 'full', club: c, role };
    if (this._free(s)) {
      this._grant(s, id, now);
      return { status: 'granted', club: c, role };
    }
    if (s.queue.length < this.queueMax) return this._enqueue(s, id, now);
    return { status: 'full', club: c, role };
  }

  /**
   * Gọi đều đặn: hết giờ thì trả vai, người chờ nhận vai.
   * @param {number} now ms
   * @returns {{type:'end'|'grant', club:number, role:string, id:string}[]} mọi 'end' trước, rồi tới 'grant'
   */
  tick(now) {
    const events = [];
    for (const s of this.slots.values()) {
      if (s.holder && s.holder.until <= now) {
        events.push({ type: 'end', club: s.club, role: s.role, id: s.holder.id });
        s.holder = null;
      }
    }
    for (const s of this.slots.values()) {
      if (!s.holder && s.queue.length) events.push(this._promote(s, now));
    }
    return events;
  }

  /**
   * Fan rời tòa nhà: người giữ vai → trả vai + người chờ nhận; người đang chờ → chỉ rời hàng (không sự kiện).
   * Người giữ vai đã bị rút giờ vì có người chờ thì giữ nguyên giờ đã rút.
   * @returns {{type:'end'|'grant', club:number, role:string, id:string}[]}
   */
  drop(id, now) {
    const s = this._heldBy(id);
    if (s) {
      const events = [{ type: 'end', club: s.club, role: s.role, id }];
      s.holder = null;
      if (s.queue.length) events.push(this._promote(s, now));
      return events;
    }
    const w = this._queuedAt(id);
    if (w) w.queue = w.queue.filter((q) => q !== id);
    return [];
  }

  /** @returns {{id:string, since:number, until:number, lockUntil:number}|null} bản sao */
  holder(club, role) {
    const h = this._slot(club, role)?.holder;
    return h ? { ...h } : null;
  }

  /** @returns {{club:number, role:string}|null} vai `id` đang giữ */
  roleOf(id) {
    const s = this._heldBy(id);
    return s ? { club: s.club, role: s.role } : null;
  }

  /** @returns {string[]} người đang chờ vai này (bản sao) */
  queued(club, role) {
    return [...(this._slot(club, role)?.queue ?? [])];
  }

  isQueued(id) {
    return this._queuedAt(id) !== null;
  }

  /** @returns {{club:number, role:string, id:string, until:number}[]} mọi vai đang có người giữ */
  all() {
    const out = [];
    for (const s of this.slots.values()) {
      if (s.holder) out.push({ club: s.club, role: s.role, id: s.holder.id, until: s.holder.until });
    }
    return out;
  }

  /** Ảnh chụp trạng thái để lưu localStorage (chỉ ô có người giữ / chờ; không gồm thông số). */
  toJSON() {
    const slots = [];
    for (const s of this.slots.values()) {
      if (s.holder || s.queue.length) {
        slots.push({ club: s.club, role: s.role, holder: s.holder ? { ...s.holder } : null, queue: [...s.queue] });
      }
    }
    return { slots };
  }

  /**
   * Dựng lại từ ảnh chụp. Thông số lấy từ `opts` (cấu hình hiện tại), trạng thái từ `obj`.
   * Bỏ dòng hỏng; giữ luật một người một vai (id trùng bị bỏ); hàng chờ cắt theo queueMax mới.
   */
  static fromJSON(obj, opts = {}) {
    const board = new RoleBoard(opts);
    const seen = new Set();
    const okId = (id) => (typeof id === 'string' || typeof id === 'number') && !seen.has(id);
    const rows = Array.isArray(obj?.slots) ? obj.slots : [];
    // Người giữ trước, người chờ sau: id vừa giữ vừa chờ thì giữ vai.
    for (const row of rows) {
      const s = row ? board._slot(row.club, row.role) : null;
      const h = row?.holder;
      if (!s || !h || !okId(h.id)) continue;
      if (![h.since, h.until, h.lockUntil].every(Number.isFinite)) continue;
      s.holder = { id: h.id, since: h.since, until: h.until, lockUntil: h.lockUntil };
      seen.add(h.id);
    }
    for (const row of rows) {
      const s = row ? board._slot(row.club, row.role) : null;
      if (!s || !Array.isArray(row.queue)) continue;
      for (const id of row.queue) {
        if (s.queue.length >= board.queueMax) break;
        if (!okId(id)) continue;
        s.queue.push(id);
        seen.add(id);
      }
    }
    return board;
  }
}
