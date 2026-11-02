/**
 * 🏢 Creator Online — PK giữa các nhóm (fan club 1–5).
 * Spec: docs/superpowers/specs/2026-11-03-creatoronline-design.md mục 9 (và 2, 8, bảng 17.3).
 * Logic thuần (không DOM, không three.js) → test bằng `npm test` (tests/creatoronline-pk.test.mjs).
 *
 * - Điểm mỗi bên = 10 × xu + 10 × √L. L = tim có trọng số: 1 mỗi tim; trong nước rút, bên ĐANG THUA (xét lúc
 *   mỗi đợt tim tới) tính 2. Lật kèo chỉ bằng tim miễn phí, không có quà Boost.
 * - "Cần X xu để lật kèo": X = ⌊chênh lệch / 10⌋ + 1.
 * - Kết thúc: nhiều điểm hơn thắng; hoà điểm → nhiều người tặng khác nhau hơn thắng; vẫn hoà → hoà.
 *   MVP = người tặng nhiều xu nhất bên thắng. Không có thưởng xu.
 * - Đồng hồ tạm dừng trong lúc Gala (pause/resume); quà và tim lúc dừng vẫn tính.
 * - Toàn tòa nhà chỉ 1 PK; trận mới cách trận trước ≥ cooldown; tự mở mỗi `everyMs` (PkScheduler).
 * - Thời gian luôn là `now` (ms) truyền vào, không đọc đồng hồ.
 */

/** Club hợp lệ: số nguyên 1..5 (G1–G5). */
const isClub = (c) => Number.isInteger(c) && c >= 1 && c <= 5;

/**
 * Điểm PK của một bên.
 * @param {number} xu tổng xu fan bên đó tặng trong trận
 * @param {number} likesW số tim có trọng số
 */
export function pkPoints(xu, likesW) {
  return 10 * (Number(xu) || 0) + 10 * Math.sqrt(Math.max(0, Number(likesW) || 0));
}

function newSide() {
  /** gifters: id → tổng xu, theo thứ tự tặng lần đầu (hoà xu → người tặng trước đứng trước) */
  return { xu: 0, likesW: 0, gifters: new Map() };
}

export class PkRound {
  /**
   * @param {{a:number, b:number, startAt:number, durMs?:number, finalMs?:number}} opts
   *   a, b: 2 club khác nhau · finalMs: nước rút, bị kẹp ≤ durMs / 2
   */
  constructor({ a, b, startAt, durMs = 90000, finalMs = 30000 }) {
    this.a = Number(a);
    this.b = Number(b);
    if (this.a === this.b) throw new RangeError('PkRound: a và b phải là 2 club khác nhau');
    this.startAt = Number(startAt) || 0;
    this.durMs = Math.max(0, durMs);
    this.finalMs = Math.min(Math.max(0, finalMs), this.durMs / 2);
    /** @type {number|null} lúc bắt đầu tạm dừng (null = đang chạy) */
    this.pausedAt = null;
    /** tổng thời gian đã tạm dừng (ms), đẩy lùi giờ kết thúc */
    this.pausedMs = 0;
    /** đã gọi finish() */
    this.ended = false;
    this.sides = { [this.a]: newSide(), [this.b]: newSide() };
  }

  _side(club) {
    const c = Number(club);
    return c === this.a || c === this.b ? this.sides[c] : null;
  }

  _other(club) {
    return Number(club) === this.a ? this.b : this.a;
  }

  /**
   * Fan club `club` tặng `xu` xu. Bỏ qua nếu club không thuộc trận hoặc trận đã xong.
   * @returns {boolean} có tính hay không
   */
  addGift(club, id, xu, now) {
    const s = this._side(club);
    const x = Number(xu);
    if (!s || this.isOver(now) || !(x > 0)) return false;
    s.xu += x;
    s.gifters.set(id, (s.gifters.get(id) ?? 0) + x);
    return true;
  }

  /**
   * Một đợt `n` tim của club `club`. Trọng số quyết định cho CẢ đợt, theo điểm ngay trước đợt tim:
   * nước rút + bên này đang thua hẳn → ×2, còn lại ×1.
   * @returns {number} trọng số đã dùng (0 = bỏ qua)
   */
  addLikes(club, n, now) {
    const s = this._side(club);
    const k = Number(n);
    if (!s || this.isOver(now) || !(k > 0)) return 0;
    const w = this.isFinal(now) && this.score(club) < this.score(this._other(club)) ? 2 : 1;
    s.likesW += k * w;
    return w;
  }

  /** Điểm thực (số thực); HUD hiện ⌊điểm⌋. Club ngoài trận → 0. */
  score(club) {
    const s = this._side(club);
    return s ? pkPoints(s.xu, s.likesW) : 0;
  }

  /** @returns {{[club:number]: number}} */
  scores() {
    return { [this.a]: this.score(this.a), [this.b]: this.score(this.b) };
  }

  /** @returns {number|null} club đang dẫn, null khi hoà */
  leader() {
    const sa = this.score(this.a);
    const sb = this.score(this.b);
    return sa > sb ? this.a : sb > sa ? this.b : null;
  }

  /** @returns {number|null} club đang thua, null khi hoà */
  trailing() {
    const sa = this.score(this.a);
    const sb = this.score(this.b);
    return sa < sb ? this.a : sb < sa ? this.b : null;
  }

  /** Số xu bên thua cần tặng để vượt lên: ⌊chênh / 10⌋ + 1 (hoà → 1). */
  needXu() {
    return Math.floor(Math.abs(this.score(this.a) - this.score(this.b)) / 10) + 1;
  }

  /** Tạm dừng đồng hồ (Gala). Đang dừng hoặc trận đã xong → bỏ qua. */
  pause(now) {
    if (this.pausedAt === null && !this.isOver(now)) this.pausedAt = now;
  }

  /** Chạy tiếp; thời gian đã dừng đẩy lùi giờ kết thúc. */
  resume(now) {
    if (this.pausedAt === null) return;
    this.pausedMs += Math.max(0, now - this.pausedAt);
    this.pausedAt = null;
  }

  isPaused() {
    return this.pausedAt !== null;
  }

  /** Mili-giây còn lại (≥ 0); đứng yên khi đang dừng. */
  remaining(now) {
    const pausing = this.pausedAt !== null ? Math.max(0, now - this.pausedAt) : 0;
    return Math.max(0, this.startAt + this.durMs + this.pausedMs + pausing - now);
  }

  /** Đang nước rút: 0 < còn lại ≤ finalMs và không tạm dừng. */
  isFinal(now) {
    if (this.pausedAt !== null) return false;
    const r = this.remaining(now);
    return r > 0 && r <= this.finalMs;
  }

  isOver(now) {
    return this.ended || this.remaining(now) <= 0;
  }

  /**
   * Chốt trận (sau đó mọi quà / tim bị bỏ qua).
   * @returns {{winner:number|null, sides:{[club:number]:{score:number, xu:number, gifters:number}}, mvp:{id:string, xu:number}|null}}
   */
  finish() {
    this.ended = true;
    const sa = this.score(this.a);
    const sb = this.score(this.b);
    const ga = this.sides[this.a].gifters.size;
    const gb = this.sides[this.b].gifters.size;
    let winner = sa > sb ? this.a : sb > sa ? this.b : null;
    if (winner === null) winner = ga > gb ? this.a : gb > ga ? this.b : null;
    const mvp = winner === null ? null : this.topGifters(winner, 1)[0] ?? null;
    return {
      winner,
      sides: {
        [this.a]: { score: sa, xu: this.sides[this.a].xu, gifters: ga },
        [this.b]: { score: sb, xu: this.sides[this.b].xu, gifters: gb },
      },
      mvp,
    };
  }

  /**
   * Top người tặng của một bên, nhiều xu trước; hoà xu → người tặng trước đứng trước.
   * @returns {{id:string, xu:number}[]}
   */
  topGifters(club, n = 3) {
    const s = this._side(club);
    if (!s) return [];
    return [...s.gifters]
      .map(([id, xu]) => ({ id, xu }))
      .sort((p, q) => q.xu - p.xu)
      .slice(0, Math.max(0, n));
  }

  /** Ảnh chụp trạng thái để lưu localStorage. */
  toJSON() {
    const side = (c) => {
      const s = this.sides[c];
      return { xu: s.xu, likesW: s.likesW, gifters: [...s.gifters] };
    };
    return {
      a: this.a,
      b: this.b,
      startAt: this.startAt,
      durMs: this.durMs,
      finalMs: this.finalMs,
      pausedAt: this.pausedAt,
      pausedMs: this.pausedMs,
      ended: this.ended,
      sides: { [this.a]: side(this.a), [this.b]: side(this.b) },
    };
  }

  /**
   * Dựng lại từ ảnh chụp. Thời lượng của trận lấy từ `obj` (trận đang chạy giữ luật lúc mở);
   * `opts.durMs` / `opts.finalMs` chỉ dùng khi ảnh chụp thiếu. Ném lỗi nếu a = b.
   */
  static fromJSON(obj, opts = {}) {
    const o = obj ?? {};
    const r = new PkRound({
      a: o.a,
      b: o.b,
      startAt: o.startAt,
      durMs: Number.isFinite(o.durMs) ? o.durMs : opts.durMs,
      finalMs: Number.isFinite(o.finalMs) ? o.finalMs : opts.finalMs,
    });
    r.pausedAt = Number.isFinite(o.pausedAt) ? o.pausedAt : null;
    r.pausedMs = Number.isFinite(o.pausedMs) ? Math.max(0, o.pausedMs) : 0;
    r.ended = o.ended === true;
    for (const c of [r.a, r.b]) {
      const src = o.sides?.[c];
      if (!src) continue;
      const s = r.sides[c];
      s.xu = Number(src.xu) > 0 ? Number(src.xu) : 0;
      s.likesW = Number(src.likesW) > 0 ? Number(src.likesW) : 0;
      for (const row of Array.isArray(src.gifters) ? src.gifters : []) {
        if (Array.isArray(row) && Number(row[1]) > 0) s.gifters.set(row[0], Number(row[1]));
      }
    }
    return r;
  }
}

/**
 * Danh sách club có số > 0, nhiều trước; hoà → club số nhỏ trước.
 * @param {{[club:string]:number}|Map<number,number>} counts
 * @returns {number[]}
 */
function rankClubs(counts) {
  const rows = counts instanceof Map ? [...counts] : Object.entries(counts ?? {});
  return rows
    .map(([k, v]) => [Number(k), Number(v) || 0])
    .filter(([c, v]) => isClub(c) && v > 0)
    .sort((p, q) => q[1] - p[1] || p[0] - q[0])
    .map(([c]) => c);
}

/** Hai cặp giống nhau, không kể thứ tự. */
function samePair(p, q) {
  if (!Array.isArray(q) || q.length !== 2) return false;
  const [x, y] = q.map(Number);
  return (p[0] === x && p[1] === y) || (p[0] === y && p[1] === x);
}

/**
 * PK tự động: ghép 2 club có nhiều fan hoạt động nhất. Cặp mạnh nhất trùng trận trước và còn club hoạt động
 * thứ ba → lấy club thứ ba thay club thứ hai.
 * @param {{[club:string]:number}} activity club → số fan có tương tác trong 3 phút qua
 * @param {[number, number]|null} lastPair cặp vừa đấu
 * @returns {[number, number]|null} null khi dưới 2 club hoạt động (thử lại sau retryMs)
 */
export function pickPkPair(activity, lastPair) {
  const list = rankClubs(activity);
  if (list.length < 2) return null;
  const [t1, t2, t3] = list;
  if (t3 !== undefined && samePair([t1, t2], lastPair)) return [t1, t3];
  return [t1, t2];
}

/**
 * Đối thủ khi PK mở bằng quà: club hoạt động nhiều nhất khác club người tặng; không có → club đông fan nhất;
 * vẫn không có → club kế tiếp (5 → 1).
 * @param {number} club club người tặng
 * @param {{[club:string]:number}} activity
 * @param {{[club:string]:number}} fanCounts
 * @returns {number}
 */
export function pickOpponent(club, activity, fanCounts) {
  const c = Number(club);
  const active = rankClubs(activity).filter((k) => k !== c);
  if (active.length) return active[0];
  const fans = rankClubs(fanCounts).filter((k) => k !== c);
  if (fans.length) return fans[0];
  return (c % 5) + 1;
}

/** JSON không chứa ±Infinity → lưu null. */
const finiteOr = (v, fallback) => (Number.isFinite(v) ? v : fallback);

export class PkScheduler {
  /**
   * @param {{everyMs?:number, cooldownMs?:number, retryMs?:number}} [opts] everyMs = 0 → tắt PK tự động
   */
  constructor({ everyMs = 300000, cooldownMs = 60000, retryMs = 60000 } = {}) {
    this.everyMs = Math.max(0, everyMs);
    this.cooldownMs = Math.max(0, cooldownMs);
    this.retryMs = Math.max(0, retryMs);
    /** chưa begin() → không tự mở */
    this.nextAutoAt = Infinity;
    this.lastEndAt = -Infinity;
    this.active = false;
    /** yêu cầu mở PK đang chờ hết thời gian nghỉ (chỉ giữ yêu cầu ĐẦU TIÊN) */
    this.pending = null;
  }

  /** Bắt đầu buổi LIVE. */
  begin(now) {
    this.nextAutoAt = now + this.everyMs;
    this.lastEndAt = -Infinity;
    this.active = false;
    this.pending = null;
  }

  _cooled(now) {
    return now - this.lastEndAt >= this.cooldownMs;
  }

  /** Tới giờ PK tự động chưa. */
  autoDue(now) {
    return !this.active && this.everyMs > 0 && now >= this.nextAutoAt && this._cooled(now);
  }

  /** Không ghép được cặp (dưới 2 club hoạt động) → thử lại sau retryMs. */
  retryLater(now) {
    this.nextAutoAt = now + this.retryMs;
  }

  /**
   * Quà / lệnh xin mở PK.
   * @param {*} req dữ liệu của yêu cầu (phải ghi được ra JSON), trả lại qua takePending()
   * @param {{force?:boolean}} [o] force = nút panel / lệnh `pk N` của Quản lý: bỏ qua thời gian nghỉ
   * @returns {'start'|'pending'|'busy'} start: mở ngay (gọi onStart) · pending: mở khi hết nghỉ · busy: đang có PK
   */
  request(req, now, { force = false } = {}) {
    if (this.active) return 'busy';
    if (!force && !this._cooled(now)) {
      if (this.pending === null) this.pending = req;
      return 'pending';
    }
    return 'start';
  }

  /** @returns {number|null} lúc yêu cầu đang chờ được mở (chip "⚔️ PK sau 0:42") */
  pendingAt() {
    return this.pending === null ? null : this.lastEndAt + this.cooldownMs;
  }

  /** @returns {*|null} yêu cầu đang chờ nếu đã mở được (lấy ra khỏi hàng), ngược lại null */
  takePending(now) {
    if (this.pending === null || this.active || !this._cooled(now)) return null;
    const req = this.pending;
    this.pending = null;
    return req;
  }

  /** PK vừa mở (`now` giữ cho cân với onEnd). */
  onStart(now) {
    this.active = true;
  }

  /** Trận nào kết thúc cũng đặt lại đồng hồ PK tự động. */
  onEnd(now) {
    this.active = false;
    this.lastEndAt = now;
    this.nextAutoAt = now + this.everyMs;
  }

  /** Ảnh chụp trạng thái (±Infinity lưu thành null). */
  toJSON() {
    return {
      nextAutoAt: finiteOr(this.nextAutoAt, null),
      lastEndAt: finiteOr(this.lastEndAt, null),
      active: this.active,
      pending: this.pending,
    };
  }

  /** Dựng lại từ ảnh chụp. Thông số lấy từ `opts` (cấu hình hiện tại), trạng thái từ `obj`. */
  static fromJSON(obj, opts = {}) {
    const s = new PkScheduler(opts);
    const o = obj ?? {};
    s.nextAutoAt = finiteOr(o.nextAutoAt, Infinity);
    s.lastEndAt = finiteOr(o.lastEndAt, -Infinity);
    s.active = o.active === true;
    s.pending = o.pending ?? null;
    return s;
  }
}
