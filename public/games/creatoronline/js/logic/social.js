/**
 * 🏢 Creator Online — GĐ2: người xem chơi với nhau qua bình luận / tim / chia sẻ / theo dõi / quà.
 * Logic thuần (không DOM, không three.js) → test bằng `npm test` (tests/creatoronline-social.test.mjs).
 *
 * - parseSocialCommand: "ném 12", "ghép 12", "ôm 12", "thách 12", "bạn 12", "áo 3", "tóc 2", "nhảy", "a" / "b"…
 *   Luật dấu như codes.js: gõ không dấu luôn nhận; gõ có dấu phải đúng chữ của lệnh ("bán 12", "ốm 12" không nhận).
 * - TagBook: số ngắn #1–#99 trên bảng tên để người khác nhắm tới.
 * - CameraScore: điểm lên hình cho tương tác miễn phí, giảm dần theo thời gian (bán rã).
 * - Chorus: cổ vũ đồng thanh — nhiều người cùng gõ một câu trong vài giây.
 * - CenterBoard: vị trí Center của mỗi club = người tặng nhiều xu nhất trong cửa sổ trượt.
 * - Bonds: ghép đôi (có hạn, gia hạn có trần) + bạn thân (một chiều, có hạn).
 * - Duel: thách đấu 1–1, mỗi lúc một trận (dùng PkRound của pk.js: bên 1 = a, bên 2 = b).
 * - Pranks: ném bánh / tim / trứng → vết bẩn trên người, trả đũa.
 * Thời gian luôn là `now` (ms) truyền vào, không đọc đồng hồ; không có ngẫu nhiên.
 * Mọi class có toJSON() + static fromJSON(obj, opts): thông số lấy từ opts, trạng thái từ obj, dữ liệu hỏng bị bỏ.
 */
import { stripVN } from './codes.js';
import { PkRound } from './pk.js';

// ---------- tiện ích ----------

/** id người xem hợp lệ: chuỗi khác rỗng hoặc số hữu hạn. */
const okId = (id) => (typeof id === 'string' && id !== '') || (typeof id === 'number' && Number.isFinite(id));

/** Thông số cấu hình: số hữu hạn ≥ 0; sai kiểu → mặc định. */
const optNum = (v, def) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : def);

/** JSON không chứa ±Infinity → lưu null. */
const finiteOr = (v, fallback) => (Number.isFinite(v) ? v : fallback);

/** Club hợp lệ: số nguyên 1..5 (G1–G5). */
const isClub = (c) => Number.isInteger(c) && c >= 1 && c <= 5;

/** Dữ liệu lưu là mảng → dùng; còn lại → mảng rỗng. */
const rowsOf = (v) => (Array.isArray(v) ? v : []);

// ---------- lệnh bình luận ----------

/** Số bộ áo / kiểu tóc có trong game (lệnh "áo N" / "tóc N"). */
export const OUTFIT_COUNT = 8;
export const HAIR_COUNT = 6;

/** Lệnh nhắm vào người khác theo số trên bảng tên: mã không dấu → loại + cách viết có dấu duy nhất. */
const TARGET_CMDS = {
  nem: { kind: 'throw', accented: 'ném' },
  ghep: { kind: 'pair', accented: 'ghép' },
  om: { kind: 'hug', accented: 'ôm' },
  thach: { kind: 'duel', accented: 'thách' },
  ban: { kind: 'friend', accented: 'bạn' },
};

/** Đổi ngoại hình của chính mình. */
const LOOK_CMDS = {
  ao: { kind: 'outfit', accented: 'áo', max: OUTFIT_COUNT },
  toc: { kind: 'hair', accented: 'tóc', max: HAIR_COUNT },
};

/** Biểu cảm ('' = không có dạng có dấu: "tím", "tìm" không phải lệnh). */
const EMOTES = {
  nhay: { emote: 'dance', accented: 'nhảy' },
  vay: { emote: 'wave', accented: 'vẫy' },
  tim: { emote: 'heart', accented: '' },
  lac: { emote: 'shake', accented: 'lắc' },
};

/** "ném 12", "nem #12", "ném12", "ném # 12" → [chữ lệnh, số]. Số 1..99, không có số 0 đứng đầu. */
const NUM_CMD_RE = /^([a-z]+) ?(?:# ?)?([1-9]\d?)$/;

/** Chữ thường có dấu (NFC) + gộp khoảng trắng — để so với cách viết có dấu của lệnh. */
function accentedLower(text) {
  return text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Bình luận có dấu tiếng Việt (kể cả chữ đ) hay không. */
function hasDiacritics(text) {
  return /[\p{M}đ]/u.test(text.normalize('NFD').toLowerCase());
}

/**
 * Gõ không dấu → nhận; gõ có dấu → cả câu phải là `accented` + phần đuôi (số, '#') y như bản bỏ dấu.
 * @param {string} text bình luận gốc · @param {string} t stripVN(text) · @param {string} word chữ lệnh không dấu
 * @param {string} accented cách viết có dấu ('' = lệnh không có dạng có dấu)
 */
function accentOk(text, t, word, accented) {
  if (!hasDiacritics(text)) return true;
  return !!accented && accentedLower(text) === accented + t.slice(word.length);
}

/**
 * @typedef {{kind:'throw'|'pair'|'hug'|'duel'|'friend', target:number}
 *   | {kind:'outfit'|'hair', value:number}
 *   | {kind:'emote', emote:'dance'|'wave'|'heart'|'shake'}
 *   | {kind:'cheerSide', side:'a'|'b'}} SocialCommand
 */

/**
 * Đọc lệnh chơi với nhau. CẢ CÂU phải là lệnh (chỉ bỏ khoảng trắng thừa): "ném 12 nha", "nem rán" → null.
 * - ném / ghép / ôm / thách / bạn N (N = 1..99, cho phép '#' trước số) → { kind, target: N }
 * - áo N (1..8) → { kind: 'outfit', value } · tóc N (1..6) → { kind: 'hair', value }
 * - nhảy | vẫy | tim | lắc → { kind: 'emote', emote: 'dance'|'wave'|'heart'|'shake' }
 * - a | b → { kind: 'cheerSide', side } (cổ vũ một bên khi có thách đấu)
 * @param {string} text bình luận
 * @returns {SocialCommand|null}
 */
export function parseSocialCommand(text) {
  const t = stripVN(text);
  if (!t) return null;
  const m = NUM_CMD_RE.exec(t);
  if (m) {
    const word = m[1];
    const n = Number(m[2]);
    if (Object.hasOwn(TARGET_CMDS, word)) {
      const c = TARGET_CMDS[word];
      return accentOk(text, t, word, c.accented) ? { kind: c.kind, target: n } : null;
    }
    if (Object.hasOwn(LOOK_CMDS, word)) {
      const c = LOOK_CMDS[word];
      return n <= c.max && accentOk(text, t, word, c.accented) ? { kind: c.kind, value: n } : null;
    }
    return null;
  }
  if (Object.hasOwn(EMOTES, t)) {
    const e = EMOTES[t];
    return accentOk(text, t, t, e.accented) ? { kind: 'emote', emote: e.emote } : null;
  }
  if (t === 'a' || t === 'b') return accentOk(text, t, t, '') ? { kind: 'cheerSide', side: t } : null;
  return null;
}

/** Mã chọn club (giống codes.js) — không được thành câu cổ vũ. */
const CLUB_KEY_RE = /^g?\s?[1-5]$/;

/**
 * Câu cổ vũ đồng thanh đã chuẩn hoá: bỏ dấu, bỏ dấu câu / emoji / ký hiệu, gộp khoảng trắng,
 * chữ lặp > 2 lần còn 2 ("goooo" → "goo"). Dài 1..16 ký tự; số trơn (kể cả "1 2 3"),
 * lệnh chơi với nhau ("ném 12", "nhảy", "tím" → "tim") và mã club → null.
 * @param {string} text bình luận
 * @returns {string|null}
 */
export function chorusKey(text) {
  const k = stripVN(text)
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(.)\1{2,}/gu, '$1$1');
  const len = [...k].length;
  if (len < 1 || len > 16) return null;
  if (/^[\d ]+$/.test(k)) return null;
  if (CLUB_KEY_RE.test(k) || parseSocialCommand(k) !== null) return null;
  return k;
}

// ---------- số trên bảng tên ----------

export class TagBook {
  /** @param {{max?:number}} [opts] số lớn nhất được cấp (lệnh bình luận chỉ đọc tới 99) */
  constructor({ max = 99 } = {}) {
    this.max = Number.isInteger(max) && max >= 1 ? max : 99;
    /** id → số */
    this._num = new Map();
    /** số → id */
    this._id = new Map();
  }

  /**
   * Cấp số cho người vào tòa nhà. Đã có số → giữ số cũ; mới → số nhỏ nhất còn trống.
   * @returns {number|null} null khi hết số (hoặc id hỏng)
   */
  assign(id) {
    if (!okId(id)) return null;
    const had = this._num.get(id);
    if (had !== undefined) return had;
    for (let n = 1; n <= this.max; n++) {
      if (this._id.has(n)) continue;
      this._num.set(id, n);
      this._id.set(n, id);
      return n;
    }
    return null;
  }

  /** Trả số khi người rời tòa nhà (số được cấp lại cho người sau). */
  release(id) {
    const n = this._num.get(id);
    if (n === undefined) return;
    this._num.delete(id);
    this._id.delete(n);
  }

  /** @returns {number|null} */
  numOf(id) {
    return this._num.get(id) ?? null;
  }

  /** @returns {string|number|null} người đang giữ số `n` */
  idOf(n) {
    return this._id.get(Number(n)) ?? null;
  }

  get size() {
    return this._num.size;
  }

  toJSON() {
    return { tags: [...this._num] };
  }

  /** Dựng lại: bỏ dòng hỏng, số ngoài 1..max (theo opts), id hoặc số trùng (giữ dòng đầu). */
  static fromJSON(obj, opts = {}) {
    const tb = new TagBook(opts);
    for (const row of rowsOf(obj?.tags)) {
      if (!Array.isArray(row)) continue;
      const [id, n] = row;
      if (!okId(id) || !Number.isInteger(n) || n < 1 || n > tb.max) continue;
      if (tb._num.has(id) || tb._id.has(n)) continue;
      tb._num.set(id, n);
      tb._id.set(n, id);
    }
    return tb;
  }
}

// ---------- điểm lên hình ----------

export class CameraScore {
  /**
   * @param {{halfLifeMs?:number, comment?:number, share?:number, follow?:number, likePer?:number,
   *   commentGapMs?:number, minScore?:number}} [opts]
   *   comment/share/follow: điểm mỗi lần · likePer: số tim đổi 1 điểm · commentGapMs: bình luận tính tối đa 1 lần / khoảng
   */
  constructor({
    halfLifeMs = 60000, comment = 3, share = 15, follow = 10, likePer = 20, commentGapMs = 10000, minScore = 5,
  } = {}) {
    /** chu kỳ bán rã (ms), ≥ 1 */
    this.halfLifeMs = Math.max(1, optNum(halfLifeMs, 60000));
    /** điểm mỗi loại (đặt trong `points` để không che hàm comment/share/follow) */
    this.points = { comment: optNum(comment, 3), share: optNum(share, 15), follow: optNum(follow, 10) };
    this.likePer = Math.max(1, Math.floor(optNum(likePer, 20)));
    this.commentGapMs = optNum(commentGapMs, 10000);
    this.minScore = optNum(minScore, 5);
    /** @type {Map<string|number, {v:number, at:number, lastComment:number|null, likeRem:number}>} v = điểm lúc `at` */
    this._rows = new Map();
  }

  _row(id, now) {
    let r = this._rows.get(id);
    if (!r) {
      r = { v: 0, at: now, lastComment: null, likeRem: 0 };
      this._rows.set(id, r);
    }
    return r;
  }

  /** Điểm sau khi giảm theo bán rã (đồng hồ lùi → không giảm). */
  _value(r, now) {
    return r.v * Math.pow(2, -Math.max(0, now - r.at) / this.halfLifeMs);
  }

  _add(id, pts, now) {
    const r = this._row(id, now);
    r.v = this._value(r, now) + pts;
    r.at = Math.max(r.at, now);
    return pts;
  }

  /** Bình luận: +comment, tối đa 1 lần mỗi commentGapMs (tính từ lần được cộng gần nhất). @returns {number} điểm cộng */
  comment(id, now) {
    if (!okId(id)) return 0;
    const r = this._row(id, now);
    if (r.lastComment !== null && now - r.lastComment < this.commentGapMs) return 0;
    r.lastComment = now;
    return this._add(id, this.points.comment, now);
  }

  /** Chia sẻ: +share. @returns {number} điểm cộng */
  share(id, now) {
    return okId(id) ? this._add(id, this.points.share, now) : 0;
  }

  /** Theo dõi: +follow. @returns {number} điểm cộng */
  follow(id, now) {
    return okId(id) ? this._add(id, this.points.follow, now) : 0;
  }

  /** `n` tim: +1 mỗi likePer tim, số lẻ giữ lại cho lần sau (theo từng người). @returns {number} điểm cộng */
  likes(id, n, now) {
    const k = Math.floor(Number(n));
    if (!okId(id) || !(k > 0)) return 0;
    const r = this._row(id, now);
    const rem = r.likeRem + k;
    const pts = Math.floor(rem / this.likePer);
    r.likeRem = rem - pts * this.likePer;
    return pts > 0 ? this._add(id, pts, now) : 0;
  }

  /** Điểm hiện tại (đã giảm theo thời gian); người lạ → 0. */
  score(id, now) {
    const r = this._rows.get(id);
    return r ? this._value(r, now) : 0;
  }

  /**
   * Người đáng lên hình nhất: điểm cao nhất, > 0 và ≥ minScore, không nằm trong `exclude`.
   * Hoà điểm → người có mặt trong bảng trước.
   * @param {number} now
   * @param {{exclude?:Set<string|number>|Array<string|number>}} [o]
   * @returns {{id:string|number, score:number}|null}
   */
  top(now, { exclude } = {}) {
    const ex = exclude instanceof Set ? exclude : new Set(Array.isArray(exclude) ? exclude : []);
    let best = null;
    for (const [id, r] of this._rows) {
      if (ex.has(id)) continue;
      const s = this._value(r, now);
      if (s > 0 && s >= this.minScore && (best === null || s > best.score)) best = { id, score: s };
    }
    return best;
  }

  /** Đã được lên hình → điểm về 0 (giữ nhịp bình luận và số tim lẻ). @returns {number} điểm vừa dùng */
  consume(id, now) {
    const r = this._rows.get(id);
    if (!r) return 0;
    const s = this._value(r, now);
    r.v = 0;
    r.at = Math.max(r.at, now);
    return s;
  }

  /** Người rời tòa nhà → quên hẳn (bên gọi phải gọi, bảng không tự dọn). */
  remove(id) {
    this._rows.delete(id);
  }

  toJSON() {
    return { rows: [...this._rows].map(([id, r]) => [id, r.v, r.at, r.lastComment, r.likeRem]) };
  }

  /** Dựng lại: bỏ dòng hỏng / id trùng; số tim lẻ kẹp theo likePer hiện tại. */
  static fromJSON(obj, opts = {}) {
    const cs = new CameraScore(opts);
    for (const row of rowsOf(obj?.rows)) {
      if (!Array.isArray(row)) continue;
      const [id, v, at, lastComment, likeRem] = row;
      if (!okId(id) || cs._rows.has(id) || !Number.isFinite(v) || v < 0 || !Number.isFinite(at)) continue;
      cs._rows.set(id, {
        v,
        at,
        lastComment: Number.isFinite(lastComment) ? lastComment : null,
        likeRem: Number.isInteger(likeRem) && likeRem > 0 ? likeRem % cs.likePer : 0,
      });
    }
    return cs;
  }
}

// ---------- cổ vũ đồng thanh ----------

export class Chorus {
  /**
   * @param {{windowMs?:number, minPeople?:number, cooldownMs?:number}} [opts]
   *   windowMs: cửa sổ đếm · minPeople: số người khác nhau tối thiểu · cooldownMs: nghỉ chung sau mỗi lần nổ
   */
  constructor({ windowMs = 10000, minPeople = 3, cooldownMs = 30000 } = {}) {
    this.windowMs = optNum(windowMs, 10000);
    this.minPeople = Math.max(1, optNum(minPeople, 3));
    this.cooldownMs = optNum(cooldownMs, 30000);
    /** hết nghỉ lúc này (trước đó không nổ lần mới) */
    this.cooldownUntil = -Infinity;
    /** @type {Map<string, Map<string|number, number>>} câu → (id → lúc gửi gần nhất) */
    this._keys = new Map();
    this._sweptAt = -Infinity;
  }

  /** Bỏ lượt gửi đã ra khỏi cửa sổ (hết hạn đúng lúc t + windowMs). */
  _prune(m, now) {
    for (const [id, t] of m) if (now - t >= this.windowMs) m.delete(id);
  }

  /**
   * Một bình luận. Trong windowMs, số người KHÁC NHAU gửi cùng câu (theo chorusKey) đạt max(minPeople, need)
   * → nổ: trả { key, ids }, xoá câu đó và nghỉ chung cooldownMs. Trong lúc nghỉ vẫn ghi nhận lượt gửi
   * (hết nghỉ mà đám đông vẫn hô thì lượt kế tiếp nổ luôn) nhưng không nổ.
   * @param {number} [need] ngưỡng theo số người xem (bên gọi tính), nhỏ hơn minPeople thì dùng minPeople
   * @returns {{key:string, ids:Array<string|number>}|null}
   */
  add(id, text, now, need) {
    const key = chorusKey(text);
    if (key === null || !okId(id)) return null;
    if (now - this._sweptAt >= this.windowMs) {
      // dọn câu cũ định kỳ để bảng không phình trong buổi LIVE dài
      for (const [k, m] of this._keys) {
        this._prune(m, now);
        if (!m.size) this._keys.delete(k);
      }
      this._sweptAt = now;
    }
    let m = this._keys.get(key);
    if (!m) {
      m = new Map();
      this._keys.set(key, m);
    }
    this._prune(m, now);
    m.set(id, now);
    if (now < this.cooldownUntil) return null;
    const want = Math.max(this.minPeople, Number(need) || 0);
    if (m.size < want) return null;
    this._keys.delete(key);
    this.cooldownUntil = now + this.cooldownMs;
    return { key, ids: [...m.keys()] };
  }

  toJSON() {
    return {
      cooldownUntil: finiteOr(this.cooldownUntil, null),
      keys: [...this._keys].map(([k, m]) => [k, [...m]]),
    };
  }

  /** Dựng lại: bỏ câu không phải chorusKey hợp lệ, lượt gửi hỏng / trùng. */
  static fromJSON(obj, opts = {}) {
    const c = new Chorus(opts);
    c.cooldownUntil = finiteOr(obj?.cooldownUntil, -Infinity);
    for (const row of rowsOf(obj?.keys)) {
      if (!Array.isArray(row) || typeof row[0] !== 'string' || chorusKey(row[0]) !== row[0] || c._keys.has(row[0])) continue;
      const m = new Map();
      for (const e of rowsOf(row[1])) {
        if (Array.isArray(e) && okId(e[0]) && Number.isFinite(e[1]) && !m.has(e[0])) m.set(e[0], e[1]);
      }
      if (m.size) c._keys.set(row[0], m);
    }
    return c;
  }
}

// ---------- vị trí Center ----------

export class CenterBoard {
  /** @param {{windowMs?:number}} [opts] cửa sổ trượt tính quà (mặc định 5 phút) */
  constructor({ windowMs = 300000 } = {}) {
    this.windowMs = optNum(windowMs, 300000);
    /** @type {Map<number, {id:string|number, xu:number, t:number}[]>} club → quà theo thứ tự tặng */
    this._gifts = new Map();
  }

  /** Fan `id` của club `club` tặng `xu` xu. @returns {boolean} có tính hay không */
  add(club, id, xu, now) {
    const c = Number(club);
    const x = Number(xu);
    if (!isClub(c) || !okId(id) || !(x > 0) || !Number.isFinite(x)) return false;
    const list = (this._gifts.get(c) ?? []).filter((g) => now - g.t < this.windowMs);
    list.push({ id, xu: x, t: now });
    this._gifts.set(c, list);
    return true;
  }

  /** Tổng xu từng người trong cửa sổ + vị trí món quà cuối (= lúc đạt tổng hiện tại). */
  _totals(club, now) {
    const tot = new Map();
    const list = this._gifts.get(Number(club)) ?? [];
    list.forEach((g, i) => {
      if (now - g.t >= this.windowMs) return;
      const r = tot.get(g.id);
      if (r) {
        r.xu += g.xu;
        r.last = i;
      } else {
        tot.set(g.id, { xu: g.xu, last: i });
      }
    });
    return tot;
  }

  /** Người dẫn trong bảng tổng: nhiều xu nhất; hoà → món quà cuối đến sớm hơn (đạt tổng đó trước). */
  static _best(tot) {
    let best = null;
    for (const [id, r] of tot) {
      if (!best || r.xu > best.xu || (r.xu === best.xu && r.last < best.last)) best = { id, xu: r.xu, last: r.last };
    }
    return best;
  }

  /**
   * Người giữ Center của club: tổng xu trong cửa sổ cao nhất; hoà → người đạt tổng đó trước.
   * @returns {{id:string|number, xu:number}|null}
   */
  holder(club, now) {
    const best = CenterBoard._best(this._totals(club, now));
    return best ? { id: best.id, xu: best.xu } : null;
  }

  /** Số xu `id` cần tặng thêm để giành Center: 0 nếu đang giữ hoặc chưa ai giữ; còn lại holderXu − xu của id + 1. */
  needXu(club, id, now) {
    const tot = this._totals(club, now);
    const best = CenterBoard._best(tot);
    if (!best || best.id === id) return 0;
    return best.xu - (tot.get(id)?.xu ?? 0) + 1;
  }

  /** Người rời tòa nhà → bỏ mọi quà của họ ở mọi club. */
  remove(id) {
    for (const [c, list] of this._gifts) this._gifts.set(c, list.filter((g) => g.id !== id));
  }

  toJSON() {
    return { gifts: [...this._gifts].flatMap(([c, list]) => list.map((g) => [c, g.id, g.xu, g.t])) };
  }

  /** Dựng lại theo thứ tự đã lưu; bỏ dòng hỏng. */
  static fromJSON(obj, opts = {}) {
    const cb = new CenterBoard(opts);
    for (const row of rowsOf(obj?.gifts)) {
      if (!Array.isArray(row)) continue;
      const [c, id, xu, t] = row;
      if (!isClub(c) || !okId(id) || !Number.isFinite(xu) || xu <= 0 || !Number.isFinite(t)) continue;
      if (!cb._gifts.has(c)) cb._gifts.set(c, []);
      cb._gifts.get(c).push({ id, xu, t });
    }
    return cb;
  }
}

// ---------- ghép đôi + bạn thân ----------

export class Bonds {
  /**
   * @param {{pairMs?:number, pairMaxMs?:number, friendMs?:number}} [opts]
   *   pairMs: mỗi lần ghép / gia hạn · pairMaxMs: tổng tối đa của một cặp tính từ lúc ghép · friendMs: hạn bạn thân
   */
  constructor({ pairMs = 60000, pairMaxMs = 180000, friendMs = 600000 } = {}) {
    this.pairMs = optNum(pairMs, 60000);
    this.pairMaxMs = Math.max(this.pairMs, optNum(pairMaxMs, 180000));
    this.friendMs = optNum(friendMs, 600000);
    /** @type {{a:string|number, b:string|number, since:number, until:number}[]} kể cả cặp hết giờ chưa tick() */
    this._pairs = [];
    /** @type {Map<string|number, {id:string|number, until:number}>} người → bạn thân (một chiều) */
    this._friends = new Map();
  }

  _find(a, b) {
    return this._pairs.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a)) ?? null;
  }

  _activeOf(id, now) {
    return this._pairs.find((p) => (p.a === id || p.b === id) && p.until > now) ?? null;
  }

  /**
   * `a` ghép đôi với `b`.
   * @returns {'paired'|'extended'|'busy'|'self'|null}
   *   extended: đúng cặp đang ghép → until = min(until + pairMs, since + pairMaxMs) ·
   *   busy: a hoặc b đang ở cặp KHÁC · null: id hỏng (vd số trên bảng tên không có ai)
   */
  pair(a, b, now) {
    if (!okId(a) || !okId(b)) return null;
    if (a === b) return 'self';
    const same = this._find(a, b);
    if (same && same.until > now) {
      same.until = Math.max(same.until, Math.min(same.until + this.pairMs, same.since + this.pairMaxMs));
      return 'extended';
    }
    if (this._activeOf(a, now) || this._activeOf(b, now)) return 'busy';
    if (same) {
      // cặp cũ hết giờ nhưng chưa tick() → ghép lại như mới; tick() không báo cặp này tan
      Object.assign(same, { a, b, since: now, until: now + this.pairMs });
      return 'paired';
    }
    this._pairs.push({ a, b, since: now, until: now + this.pairMs });
    return 'paired';
  }

  /** @returns {string|number|null} người đang ghép đôi với `id` */
  pairOf(id, now) {
    const p = this._activeOf(id, now);
    if (!p) return null;
    return p.a === id ? p.b : p.a;
  }

  /** @returns {{a:string|number, b:string|number, since:number, until:number}[]} các cặp còn hạn (bản sao) */
  pairs(now) {
    return this._pairs.filter((p) => p.until > now).map((p) => ({ ...p }));
  }

  /** Bỏ các cặp hết hạn (mỗi cặp báo một lần) + dọn bạn thân hết hạn. @returns {{a:*, b:*}[]} */
  tick(now) {
    const ended = [];
    this._pairs = this._pairs.filter((p) => {
      if (p.until > now) return true;
      ended.push({ a: p.a, b: p.b });
      return false;
    });
    for (const [id, f] of this._friends) if (f.until <= now) this._friends.delete(id);
    return ended;
  }

  /**
   * `a` chọn `b` làm bạn thân (mỗi người 1 bạn; chọn mới thay bạn cũ; không bắt buộc hai chiều).
   * @returns {'ok'|'self'|null} null: id hỏng
   */
  befriend(a, b, now) {
    if (!okId(a) || !okId(b)) return null;
    if (a === b) return 'self';
    this._friends.set(a, { id: b, until: now + this.friendMs });
    return 'ok';
  }

  /** @returns {string|number|null} bạn thân của `id` (hết friendMs → null) */
  friendOf(id, now) {
    const f = this._friends.get(id);
    if (!f) return null;
    if (f.until <= now) {
      this._friends.delete(id);
      return null;
    }
    return f.id;
  }

  /** Người rời tòa nhà: bỏ cặp của họ (trả về để bên gọi gỡ hình) + bạn thân cả hai chiều. */
  remove(id) {
    const ended = [];
    this._pairs = this._pairs.filter((p) => {
      if (p.a !== id && p.b !== id) return true;
      ended.push({ a: p.a, b: p.b });
      return false;
    });
    this._friends.delete(id);
    for (const [k, f] of this._friends) if (f.id === id) this._friends.delete(k);
    return ended;
  }

  toJSON() {
    return {
      pairs: this._pairs.map((p) => ({ ...p })),
      friends: [...this._friends].map(([id, f]) => [id, f.id, f.until]),
    };
  }

  /** Dựng lại: bỏ cặp hỏng / tự ghép; mỗi người tối đa 1 cặp (giữ cặp còn hạn lâu hơn); bạn thân trùng giữ dòng đầu. */
  static fromJSON(obj, opts = {}) {
    const bd = new Bonds(opts);
    const rows = rowsOf(obj?.pairs).filter(
      (p) => p && okId(p.a) && okId(p.b) && p.a !== p.b && Number.isFinite(p.since) && Number.isFinite(p.until),
    );
    const keep = new Set();
    const seen = new Set();
    for (const p of [...rows].sort((p, q) => q.until - p.until)) {
      if (seen.has(p.a) || seen.has(p.b)) continue;
      seen.add(p.a);
      seen.add(p.b);
      keep.add(p);
    }
    for (const p of rows) if (keep.has(p)) bd._pairs.push({ a: p.a, b: p.b, since: p.since, until: p.until });
    for (const row of rowsOf(obj?.friends)) {
      if (!Array.isArray(row)) continue;
      const [id, fr, until] = row;
      if (!okId(id) || !okId(fr) || id === fr || !Number.isFinite(until) || bd._friends.has(id)) continue;
      bd._friends.set(id, { id: fr, until });
    }
    return bd;
  }
}

// ---------- thách đấu 1–1 ----------

/** Bên của thách đấu → bên trong PkRound. */
const SIDE_NUM = { a: 1, b: 2 };

/**
 * @typedef {{winner:string|number|null, loser:string|number|null, scores:{a:number, b:number}, forfeit:boolean}} DuelResult
 *   forfeit: true khi một người đấu rời tòa nhà giữa trận
 */

export class Duel {
  /**
   * @param {{durMs?:number, finalMs?:number, cooldownMs?:number, cheerLikes?:number, cheerGapMs?:number}} [opts]
   *   cheerLikes: số tim mỗi lần gõ a/b · cheerGapMs: mỗi người cổ vũ được tính tối đa 1 lần / khoảng
   */
  constructor({ durMs = 60000, finalMs = 15000, cooldownMs = 20000, cheerLikes = 5, cheerGapMs = 5000 } = {}) {
    this.durMs = optNum(durMs, 60000);
    this.finalMs = optNum(finalMs, 15000);
    this.cooldownMs = optNum(cooldownMs, 20000);
    this.cheerLikes = optNum(cheerLikes, 5);
    this.cheerGapMs = optNum(cheerGapMs, 5000);
    /** @type {PkRound|null} trận gần nhất (bên 1 = a, bên 2 = b) */
    this.round = null;
    this._a = null;
    this._b = null;
    this._club = null;
    /** @type {Map<string|number, 'a'|'b'>} người cổ vũ → bên đã chọn */
    this._fans = new Map();
    /** @type {Map<string|number, number>} người (kể cả người đấu) → lúc cổ vũ được tính gần nhất */
    this._cheerAt = new Map();
    /** lúc trận gần nhất được chốt (finish / remove) */
    this.lastEndAt = -Infinity;
    /** mốc `now` lớn nhất đã thấy — dùng khi remove() không có now */
    this._seen = -Infinity;
  }

  /** Người thách đấu (bên a) của trận gần nhất; giữ lại sau khi chốt để hiện kết quả. */
  get a() {
    return this._a;
  }

  /** Người bị thách (bên b) của trận gần nhất. */
  get b() {
    return this._b;
  }

  get club() {
    return this._club;
  }

  _see(now) {
    if (Number.isFinite(now) && now > this._seen) this._seen = now;
  }

  /** Bên cố định của người đấu: 'a' | 'b' | null. */
  _own(id) {
    if (!okId(id)) return null;
    return id === this._a ? 'a' : id === this._b ? 'b' : null;
  }

  /** Lúc trận gần nhất kết thúc: đã chốt → lastEndAt; hết giờ mà chưa chốt → giờ hết. */
  _endAt() {
    const r = this.round;
    if (!r || r.ended) return this.lastEndAt;
    return r.startAt + r.durMs + r.pausedMs;
  }

  /**
   * Mở thách đấu `a` vs `b` (club: nơi diễn ra / club của người thách, bên gọi tự quy ước).
   * @returns {'start'|'busy'|'cooldown'|'self'|null} null: id hỏng
   */
  start(a, b, club, now) {
    this._see(now);
    if (!okId(a) || !okId(b)) return null;
    if (a === b) return 'self';
    if (this.active(now)) return 'busy';
    if (now - this._endAt() < this.cooldownMs) return 'cooldown';
    this.round = new PkRound({ a: SIDE_NUM.a, b: SIDE_NUM.b, startAt: now, durMs: this.durMs, finalMs: this.finalMs });
    this._a = a;
    this._b = b;
    this._club = club ?? null;
    this._fans.clear();
    this._cheerAt.clear();
    return 'start';
  }

  /** Đang có trận (đã mở, chưa chốt, chưa hết giờ). */
  active(now) {
    this._see(now);
    return !!this.round && !this.round.isOver(now);
  }

  /** @returns {'a'|'b'|null} bên của `id`: người đấu → bên của mình; người cổ vũ → bên đã chọn */
  sideOf(id) {
    return this._own(id) ?? this._fans.get(id) ?? null;
  }

  /**
   * Gõ "a" / "b": người cổ vũ chọn bên (người đấu luôn ở bên mình) và thêm cheerLikes tim cho bên đó.
   * Mỗi người tối đa 1 lần / cheerGapMs — lần bị chặn bỏ hẳn (không đổi bên).
   * @returns {'a'|'b'|null} bên được tính; null = bỏ qua
   */
  cheer(id, side, now) {
    if (!this.active(now) || !okId(id)) return null;
    const own = this._own(id);
    const pick = own ?? (side === 'a' || side === 'b' ? side : null);
    if (!pick) return null;
    const last = this._cheerAt.get(id);
    if (last !== undefined && now - last < this.cheerGapMs) return null;
    this._cheerAt.set(id, now);
    if (!own) this._fans.set(id, pick);
    if (this.cheerLikes > 0) this.round.addLikes(SIDE_NUM[pick], this.cheerLikes, now);
    return pick;
  }

  /**
   * Quà trong lúc thách đấu: người đấu tính cho mình, người cổ vũ tính cho bên đã chọn, người lạ → null.
   * @returns {'a'|'b'|null}
   */
  gift(id, xu, now) {
    this._see(now);
    if (!this.round) return null;
    const side = this.sideOf(id);
    if (!side) return null;
    return this.round.addGift(SIDE_NUM[side], id, xu, now) ? side : null;
  }

  /** `n` tim của người đấu (cho mình) hoặc người cổ vũ (cho bên đã chọn); còn lại bỏ qua. @returns {'a'|'b'|null} */
  likes(id, n, now) {
    this._see(now);
    if (!this.round) return null;
    const side = this.sideOf(id);
    if (!side) return null;
    return this.round.addLikes(SIDE_NUM[side], n, now) > 0 ? side : null;
  }

  /** Điểm hai bên (số thực, HUD hiện ⌊điểm⌋). */
  scores() {
    return { a: this.round ? this.round.score(SIDE_NUM.a) : 0, b: this.round ? this.round.score(SIDE_NUM.b) : 0 };
  }

  /** Số xu bên thua cần tặng để vượt (PkRound: ⌊chênh / 10⌋ + 1); chưa có trận → 0. */
  needXu() {
    return this.round ? this.round.needXu() : 0;
  }

  /** Mili-giây còn lại; không có trận đang chạy → 0. */
  remaining(now) {
    return this.active(now) ? this.round.remaining(now) : 0;
  }

  /** Đang nước rút (finalMs cuối). */
  isFinal(now) {
    return this.active(now) && this.round.isFinal(now);
  }

  /** Không có trận đang chạy (chưa từng mở, đã chốt hoặc hết giờ). */
  isOver(now) {
    return !this.active(now);
  }

  _result(win, forfeit) {
    return {
      winner: win === 'a' ? this._a : win === 'b' ? this._b : null,
      loser: win === 'a' ? this._b : win === 'b' ? this._a : null,
      scores: this.scores(),
      forfeit,
    };
  }

  /**
   * Chốt trận (hết giờ hoặc huỷ sớm); thời gian nghỉ tính từ `now`.
   * Thắng/thua theo luật PkRound: nhiều điểm hơn; hoà điểm → nhiều người tặng khác nhau hơn; vẫn hoà → hoà (null).
   * @returns {DuelResult|null} null khi không có trận chưa chốt
   */
  finish(now) {
    this._see(now);
    if (!this.round || this.round.ended) return null;
    const r = this.round.finish();
    this.lastEndAt = Number.isFinite(now) ? now : this._seen;
    return this._result(r.winner === SIDE_NUM.a ? 'a' : r.winner === SIDE_NUM.b ? 'b' : null, false);
  }

  /**
   * Người rời tòa nhà. Là người đấu của trận chưa chốt → trận kết thúc ngay, người còn lại thắng (forfeit);
   * riêng trận đã hết giờ mà chưa chốt thì chốt theo điểm như finish(). Người cổ vũ → chỉ quên bên đã chọn.
   * @param {number} [now] thiếu → dùng mốc `now` gần nhất đã thấy
   * @returns {DuelResult|null}
   */
  remove(id, now) {
    this._see(now);
    const own = this.round && !this.round.ended ? this._own(id) : null;
    if (own) {
      const t = Number.isFinite(now) ? now : this._seen;
      if (this.round.isOver(t)) return this.finish(t);
      this.round.finish();
      this.lastEndAt = t;
      return this._result(own === 'a' ? 'b' : 'a', true);
    }
    this._fans.delete(id);
    this._cheerAt.delete(id);
    return null;
  }

  toJSON() {
    return {
      round: this.round ? this.round.toJSON() : null,
      a: this._a,
      b: this._b,
      club: this._club,
      fans: [...this._fans],
      cheerAt: [...this._cheerAt],
      lastEndAt: finiteOr(this.lastEndAt, null),
    };
  }

  /**
   * Dựng lại. Trận đang chạy giữ thời lượng lúc mở (lưu trong round); opts chỉ dùng khi ảnh chụp thiếu.
   * Trận hỏng (id hỏng / trùng, round không phải bên 1–2) → bỏ, như chưa có trận.
   */
  static fromJSON(obj, opts = {}) {
    const d = new Duel(opts);
    const o = obj && typeof obj === 'object' ? obj : {};
    d.lastEndAt = finiteOr(o.lastEndAt, -Infinity);
    let round = null;
    if (o.round && okId(o.a) && okId(o.b) && o.a !== o.b) {
      try {
        round = PkRound.fromJSON(o.round, { durMs: d.durMs, finalMs: d.finalMs });
      } catch {
        round = null;
      }
      if (round && !(round.a === SIDE_NUM.a && round.b === SIDE_NUM.b)) round = null;
    }
    if (round) {
      d.round = round;
      d._a = o.a;
      d._b = o.b;
      d._club = typeof o.club === 'number' || typeof o.club === 'string' ? o.club : null;
      for (const row of rowsOf(o.fans)) {
        if (Array.isArray(row) && okId(row[0]) && (row[1] === 'a' || row[1] === 'b') && !d._own(row[0])) {
          d._fans.set(row[0], row[1]);
        }
      }
      for (const row of rowsOf(o.cheerAt)) {
        if (Array.isArray(row) && okId(row[0]) && Number.isFinite(row[1])) d._cheerAt.set(row[0], row[1]);
      }
    }
    d._seen = Math.max(d.lastEndAt, round ? round.startAt : -Infinity);
    return d;
  }
}

// ---------- ném đồ ----------

/** Đồ ném được: bánh kem, tim, trứng. */
export const PRANK_ITEMS = Object.freeze(['cake', 'heart', 'egg']);

export class Pranks {
  /** @param {{splatMs?:number, revengeMs?:number}} [opts] splatMs: vết bẩn bám bao lâu · revengeMs: hạn trả đũa */
  constructor({ splatMs = 20000, revengeMs = 60000 } = {}) {
    this.splatMs = optNum(splatMs, 20000);
    this.revengeMs = optNum(revengeMs, 60000);
    /** @type {Map<string|number, {item:string, until:number}>} người bị ném → vết bẩn gần nhất */
    this._splats = new Map();
    /** @type {Map<string|number, Map<string|number, number>>} người ném → (người bị ném → lúc ném) */
    this._thrown = new Map();
  }

  /**
   * `fromId` ném `item` trúng `targetId`. Trả đũa = trong revengeMs trước đó `targetId` đã ném `fromId`;
   * mỗi lần bị ném chỉ được trả đũa một lần. Tự ném mình: vẫn dính bẩn, không bao giờ là trả đũa.
   * @param {'cake'|'heart'|'egg'} item
   * @returns {{revenge:boolean}|null} null: id hoặc món đồ hỏng (bỏ qua)
   */
  hit(targetId, item, fromId, now) {
    if (!okId(targetId) || !okId(fromId) || !PRANK_ITEMS.includes(item)) return null;
    let revenge = false;
    if (fromId !== targetId) {
      const theirs = this._thrown.get(targetId);
      const t = theirs?.get(fromId);
      if (t !== undefined && now >= t && now - t < this.revengeMs) {
        revenge = true;
        theirs.delete(fromId); // đã trả đũa → món nợ đó hết
        if (!theirs.size) this._thrown.delete(targetId);
      }
      let mine = this._thrown.get(fromId);
      if (!mine) {
        mine = new Map();
        this._thrown.set(fromId, mine);
      }
      mine.set(targetId, now);
    }
    this._splats.set(targetId, { item, until: now + this.splatMs });
    return { revenge };
  }

  /** @returns {'cake'|'heart'|'egg'|null} vết bẩn đang bám (món trúng gần nhất, tới splatMs sau lần trúng đó) */
  splatOf(id, now) {
    const s = this._splats.get(id);
    return s && now < s.until ? s.item : null;
  }

  /** Vết bẩn hết hạn (mỗi người báo một lần) + dọn lượt ném quá hạn trả đũa. @returns {Array<string|number>} */
  tick(now) {
    const gone = [];
    for (const [id, s] of this._splats) {
      if (now < s.until) continue;
      this._splats.delete(id);
      gone.push(id);
    }
    for (const [from, m] of this._thrown) {
      for (const [to, t] of m) if (now - t >= this.revengeMs) m.delete(to);
      if (!m.size) this._thrown.delete(from);
    }
    return gone;
  }

  /** Người rời tòa nhà: bỏ vết bẩn và mọi lượt ném của / vào họ. */
  remove(id) {
    this._splats.delete(id);
    this._thrown.delete(id);
    for (const [from, m] of this._thrown) {
      m.delete(id);
      if (!m.size) this._thrown.delete(from);
    }
  }

  toJSON() {
    return {
      splats: [...this._splats].map(([id, s]) => [id, s.item, s.until]),
      thrown: [...this._thrown].flatMap(([from, m]) => [...m].map(([to, t]) => [from, to, t])),
    };
  }

  /** Dựng lại: bỏ dòng hỏng, món đồ lạ, tự ném, dòng trùng (giữ dòng đầu). */
  static fromJSON(obj, opts = {}) {
    const p = new Pranks(opts);
    for (const row of rowsOf(obj?.splats)) {
      if (!Array.isArray(row)) continue;
      const [id, item, until] = row;
      if (!okId(id) || !PRANK_ITEMS.includes(item) || !Number.isFinite(until) || p._splats.has(id)) continue;
      p._splats.set(id, { item, until });
    }
    for (const row of rowsOf(obj?.thrown)) {
      if (!Array.isArray(row)) continue;
      const [from, to, t] = row;
      if (!okId(from) || !okId(to) || from === to || !Number.isFinite(t)) continue;
      let m = p._thrown.get(from);
      if (!m) {
        m = new Map();
        p._thrown.set(from, m);
      }
      if (!m.has(to)) m.set(to, t);
    }
    return p;
  }
}
