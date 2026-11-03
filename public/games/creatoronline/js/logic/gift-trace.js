/**
 * 🏢 Creator Online (bản LIVE) — dấu vết quà tặng của buổi LIVE (spec 2026-11-03-creatoronline-design.md §20.1):
 * logic thuần chọn ô kệ hoa / chùm bóng bay / số hộp quà / top fan cho từng nhóm. Phần vẽ ở js/gift-decor.js.
 *
 * - Kệ hoa: 8 ô / nhóm. Người tặng (cộng dồn xu trong buổi, theo nhóm) ≥ STAND_MIN_XU có 1 kệ mang tên; tặng tiếp
 *   thì nâng cấp kệ cũ. Đầy ô → người mới chỉ thay kệ ít xu nhất khi xu của họ cao hơn.
 * - Bóng bay: mỗi quà ≥ BALLOON_MIN_XU thả 1 chùm; 3 chùm / nhóm, đầy thì thay chùm cũ nhất.
 * - Hộp quà: số hộp tăng theo căn bậc hai tổng xu nhóm, tối đa 12.
 * - Top fan: 3 người nhiều xu nhất nhóm (băng rôn trên tường trước cửa).
 */
export const STAND_SLOTS = 8;
export const BALLOON_SLOTS = 3;
export const STAND_MIN_XU = 10;
export const BALLOON_MIN_XU = 500;
export const PILE_MAX = 12;
const FANS_KEEP = 20; // số fan / nhóm giữ lại khi lưu buổi LIVE

/** Bậc kệ hoa: 1 nhỏ, 2 vừa (≥100 xu), 3 lớn vàng (≥1000 xu). */
export function standTier(xu) {
  return xu >= 1000 ? 3 : xu >= 100 ? 2 : 1;
}

/** Số hộp quà trước sân khấu theo tổng xu của nhóm trong buổi. */
export function pileCount(xu) {
  return Math.min(PILE_MAX, Math.floor(Math.sqrt(Math.max(0, Number(xu) || 0) / 30)));
}

const emptyClub = () => ({ stands: new Array(STAND_SLOTS).fill(null), balloons: [], xu: 0, fans: new Map() });
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export class GiftTrace {
  /** @param {{clubs?:number[]}} [opts] */
  constructor({ clubs = [1, 2, 3, 4, 5] } = {}) {
    this.ids = clubs.slice();
    this.clear();
  }

  clear() {
    this.clubs = new Map(this.ids.map((c) => [c, emptyClub()]));
    this._topKey = new Map();
  }

  club(c) {
    return this.clubs.get(Number(c)) ?? null;
  }

  /**
   * Một quà của người xem cho nhóm `club`.
   * @param {number} club
   * @param {{id:string, name:string, xu:number}} g
   * @param {number} [now] mốc thời gian (chùm bóng bay cũ nhất bị thay)
   * @returns {null | {club, stand:number|null, balloon:number|null, pile:number, topChanged:boolean}}
   */
  add(club, { id, name, xu }, now = Date.now()) {
    const c = this.club(club);
    const val = Number(xu);
    if (!c || !Number.isFinite(val) || val <= 0 || id == null) return null;
    c.xu += val;
    let f = c.fans.get(id);
    if (!f) c.fans.set(id, (f = { id, name, xu: 0 }));
    if (name) f.name = name;
    f.xu += val;
    const res = { club: Number(club), stand: null, balloon: null, pile: pileCount(c.xu), topChanged: false };

    if (f.xu >= STAND_MIN_XU) {
      let i = c.stands.findIndex((s) => s?.id === id);
      if (i < 0) i = c.stands.findIndex((s) => !s);
      if (i < 0) {
        let low = 0;
        for (let k = 1; k < c.stands.length; k++) if (c.stands[k].xu < c.stands[low].xu) low = k;
        if (c.stands[low].xu < f.xu) i = low;
      }
      if (i >= 0) {
        c.stands[i] = { id, name: f.name, xu: f.xu };
        res.stand = i;
      }
    }

    if (val >= BALLOON_MIN_XU) {
      let i = c.balloons.length < BALLOON_SLOTS ? c.balloons.length : 0;
      if (c.balloons.length >= BALLOON_SLOTS) for (let k = 1; k < c.balloons.length; k++) if (c.balloons[k].at < c.balloons[i].at) i = k;
      c.balloons[i] = { id, name: f.name, at: now };
      res.balloon = i;
    }

    const key = this.top(club)
      .map((t) => `${t.id}:${t.name}`)
      .join('|');
    res.topChanged = key !== (this._topKey.get(res.club) ?? '');
    this._topKey.set(res.club, key);
    return res;
  }

  /** n người nhiều xu nhất của nhóm (bằng xu thì theo tên). */
  top(club, n = 3) {
    const c = this.club(club);
    if (!c) return [];
    return [...c.fans.values()]
      .sort((a, b) => b.xu - a.xu || String(a.name).localeCompare(String(b.name)))
      .slice(0, n)
      .map((f) => ({ ...f }));
  }

  toJSON() {
    const clubs = {};
    for (const [id, c] of this.clubs) {
      clubs[id] = { stands: c.stands, balloons: c.balloons, xu: c.xu, fans: this.top(id, FANS_KEEP).map((f) => [f.id, f.name, f.xu]) };
    }
    return { clubs };
  }

  static fromJSON(j, opts) {
    const g = new GiftTrace(opts);
    for (const [id, c] of g.clubs) {
      const s = j?.clubs?.[id];
      if (!s || typeof s !== 'object') continue;
      if (Array.isArray(s.stands)) {
        for (let i = 0; i < STAND_SLOTS; i++) {
          const v = s.stands[i];
          c.stands[i] = v && v.id != null ? { id: v.id, name: String(v.name ?? ''), xu: num(v.xu) } : null;
        }
      }
      if (Array.isArray(s.balloons)) c.balloons = s.balloons.filter((b) => b && b.id != null).slice(0, BALLOON_SLOTS).map((b) => ({ id: b.id, name: String(b.name ?? ''), at: num(b.at) }));
      c.xu = num(s.xu);
      if (Array.isArray(s.fans)) for (const [fid, name, xu] of s.fans) if (fid != null) c.fans.set(fid, { id: fid, name: String(name ?? ''), xu: num(xu) });
      g._topKey.set(id, g.top(id).map((t) => `${t.id}:${t.name}`).join('|'));
    }
    return g;
  }
}
