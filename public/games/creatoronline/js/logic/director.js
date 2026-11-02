/**
 * 🏢 Creator Online — đạo diễn camera: hàng cảnh quay, trần cảnh quay mỗi người tặng, cảnh PK xen kẽ 2 sân, vòng rảnh.
 * Spec: docs/superpowers/specs/2026-11-03-creatoronline-design.md mục 12 (đạo diễn), 4.4 (luật chống kẹt),
 * 9 (cảnh quay khi PK), bảng 17.3 (`galaSec`, `galaShortSec`, `galaMergeMaxSec`, `shotMinSec`, `shotQueueMax`,
 * `shotStaleSec`, `coCamMaxPer5Min`).
 * Logic thuần (không DOM, không three.js) → test bằng `npm test` (tests/creatoronline-director.test.mjs).
 *
 * Thời gian luôn là `now` (ms) do bên gọi truyền vào. startAt/endAt/queuedAt là mốc tuyệt đối, nên muốn lưu/khôi phục
 * buổi LIVE bằng toJSON/fromJSON thì `now` phải là đồng hồ thật (Date.now()), không phải performance.now().
 *
 * Một cảnh (shot): { id, kind, target, gifter, view, focus, durMs, startAt, endAt, queuedAt }
 * - kind: 'gala' | 'spotlight' | 'big' | 'room' | 'role' | 'pk' | 'idle'
 * - target: 'G1'..'G5' (sân nhóm), 'N01'.. (phòng), 'board' (bảng xếp hạng), 'overview' (toàn tòa nhà)
 * - view: gợi ý cho director-cam: 'stage' | 'close' | 'room' | 'board' | 'slice' | 'overview'
 * - focus: id người xem cần đặt vào khung (null = không ai)
 * Trường thêm (nhãn HUD, ảnh quà…) được giữ nguyên qua hàng chờ và toJSON.
 *
 * Đối tượng `current` / kết quả `tick()` là chính cảnh đang quay (cùng một object suốt cảnh, kể cả khi được gộp
 * thêm giờ) → so `shot !== last` hoặc `shot.id` để biết lúc cắt cảnh. Chỉ đọc, đừng sửa.
 */

/** Ưu tiên cảnh: cao cắt ngang thấp (sau mốc tối thiểu), ngang hoặc thấp hơn thì xếp hàng. */
export const PRIORITY = Object.freeze({ gala: 70, spotlight: 60, big: 50, pk: 45, room: 40, role: 30, idle: 0 });

/** Cảnh vai thuộc một trong 2 sân đang PK: đứng ngay trên cảnh PK (mục 9). */
export const PK_ROLE_PRIORITY = 46;

/** Cảnh không bao giờ "mất mục tiêu": không hỏi `ctx.alive`. */
const ALWAYS_ALIVE = new Set(['idle', 'pk']);

const basePrio = (s) => PRIORITY[s.kind] ?? 0;
const positive = (n) => Number.isFinite(n) && n > 0;

export class Director {
  /**
   * @param {{minShotMs?:number, queueMax?:number, staleMs?:number, camCapMs?:number, camWindowMs?:number,
   *   galaShortMs?:number, galaMergeMaxMs?:number, holdMaxMs?:number, pkSwapMs?:number}} [opts]
   */
  constructor({
    minShotMs = 8000,
    queueMax = 6,
    staleMs = 45000,
    camCapMs = 90000,
    camWindowMs = 300000,
    galaShortMs = 30000,
    galaMergeMaxMs = 90000,
    holdMaxMs = 300000,
    pkSwapMs = 8000,
  } = {}) {
    this.minShotMs = minShotMs; // mỗi cảnh chạy tối thiểu chừng này trước khi bị cảnh ưu tiên cao hơn cắt ngang
    this.queueMax = queueMax;
    this.staleMs = staleMs; // cảnh chờ quá lâu thì bỏ
    this.camCapMs = camCapMs; // trần cảnh quay mỗi người tặng trong cửa sổ trượt (Gala miễn)
    this.camWindowMs = camWindowMs;
    this.galaShortMs = galaShortMs; // Gala rút còn chừng này khi có Gala người khác đang chờ
    this.galaMergeMaxMs = galaMergeMaxMs; // 2 Gala cùng người gộp lại tối đa
    this.holdMaxMs = holdMaxMs; // một cảnh không dài quá chừng này (giữ chỗ liên tục)
    this.pkSwapMs = pkSwapMs; // cảnh PK đổi sân mỗi chừng này
    this._current = null;
    this._queue = [];
    /** Giây cảnh quay đã giữ cho từng người: { gifter, shot (id), at (lúc push), ms }. */
    this._reserve = [];
    this._seq = 0;
    this._pkKey = null; // cặp PK của cảnh PK gần nhất ('1:3')
    this._pkSide = 0; // 0 = cảnh PK kế quay sân a, 1 = sân b
    this._lastTick = null; // mốc tick trước: dừng đồng hồ hạn chờ của cảnh bị PK giữ lại
  }

  /** Cảnh đang quay (null trước lần `tick` đầu). */
  get current() {
    return this._current;
  }

  /** Bản sao hàng chờ, theo thứ tự ưu tiên giảm dần rồi tới trước được trước. */
  get queue() {
    return this._queue.map((s) => ({ ...s }));
  }

  /**
   * Đưa một cảnh vào hàng.
   * - Trần mỗi người (trừ Gala, giây Gala không tính): tổng giây đã giữ trong `camWindowMs` qua; phần còn được dưới
   *   `minShotMs` → 'capped' (chỉ mất cú cắt cảnh, hiệu ứng lớp A/B vẫn chạy ở phía gọi).
   * - Cùng người tặng VÀ cùng mục tiêu với cảnh đang quay / đang chờ → cộng giờ vào cảnh đó ('merged').
   * - Hàng đầy: cảnh mới ưu tiên cao hơn cảnh thấp nhất đang chờ thì thay cảnh đó, không thì 'dropped'.
   * @param {object} shot xem đầu file; `durMs` thiếu/≤ 0 thì lấy `minShotMs`
   * @param {number} now
   * @returns {'queued'|'merged'|'capped'|'dropped'}
   */
  push(shot, now) {
    const s = { ...shot };
    s.id = s.id ?? this._nextId();
    s.gifter = s.gifter ?? null;
    s.focus = s.focus ?? null;
    s.durMs = positive(s.durMs) ? s.durMs : this.minShotMs;
    s.queuedAt = now;
    s.startAt = null;
    s.endAt = null;

    // 1. Trần cảnh quay mỗi người tặng (mục 4.4)
    const counted = s.gifter != null && s.kind !== 'gala';
    if (counted) {
      const allowance = this.camCapMs - this._used(s.gifter, now);
      if (allowance < this.minShotMs) return 'capped';
      s.durMs = Math.min(s.durMs, allowance);
    }

    // 2. Gộp: chỉ cùng người tặng và cùng mục tiêu
    const host = s.gifter != null ? this._mergeHost(s, now) : null;
    if (host) {
      const limit = host.kind === 'gala' && s.kind === 'gala' ? this.galaMergeMaxMs : this.holdMaxMs;
      const add = Math.max(0, Math.min(s.durMs, limit - host.durMs));
      host.durMs += add;
      if (host === this._current) host.endAt = host.startAt + host.durMs;
      // cảnh gộp mang ưu tiên cao hơn (vd. quà lớn gộp vào cảnh vai cùng sân → thành cảnh quà lớn)
      if (basePrio(s) > basePrio(host)) {
        host.kind = s.kind;
        if (s.view != null) host.view = s.view;
        if (s.focus != null) host.focus = s.focus;
        this._sortQueue();
      }
      if (counted && add > 0) this._reserve.push({ gifter: s.gifter, shot: host.id, at: now, ms: add });
      return 'merged';
    }

    // 3. Xếp hàng
    if (this._queue.length >= this.queueMax) {
      const low = this._lowestIndex();
      if (low < 0 || basePrio(s) <= basePrio(this._queue[low])) return 'dropped';
      const [gone] = this._queue.splice(low, 1);
      this._refund(gone.id); // cảnh bị thay chưa lên sóng → trả lại giây đã giữ
    }
    this._queue.push(s);
    this._sortQueue();
    if (counted) this._reserve.push({ gifter: s.gifter, shot: s.id, at: now, ms: s.durMs });
    return 'queued';
  }

  /**
   * Chạy mỗi khung (hoặc mỗi ≤ 0,5 giây). Trả về cảnh đang quay.
   * @param {number} now
   * @param {{pk?: null|{a:number, b:number}, alive?: (shot:object) => boolean, idleNext?: (now:number) => object|null}} [ctx]
   *   `pk`: 2 club đang PK; `alive`: mục tiêu của cảnh còn không (người còn trong tòa nhà, vai/phòng chưa chuyển);
   *   `idleNext`: cảnh vòng rảnh kế tiếp (thường là `IdleCycle.next`).
   * @returns {object} cảnh đang quay
   */
  tick(now, ctx) {
    ctx = ctx ?? {};
    const pk = ctx.pk && ctx.pk.a != null && ctx.pk.b != null ? ctx.pk : null;
    const pkStages = pk ? ['G' + pk.a, 'G' + pk.b] : null;
    const alive = typeof ctx.alive === 'function' ? ctx.alive : () => true;
    const isAlive = (s) => ALWAYS_ALIVE.has(s.kind) || !!alive(s);

    // 1. Bỏ cảnh chờ quá lâu hoặc đã mất mục tiêu.
    //    Chốt 03/11/2026: cảnh đang chờ VÌ PK (ưu tiên < cảnh PK) thì đồng hồ hạn chờ đứng yên trong lúc PK
    //    (dời queuedAt theo thời gian trôi) → người tặng vé/vai không mất cảnh quay chỉ vì có trận PK.
    //    Gala không bao giờ bị bỏ vì quá hạn (ai tặng ≥ 10.000 xu cũng được lên sóng).
    const dt = this._lastTick != null ? Math.max(0, now - this._lastTick) : 0;
    this._lastTick = now;
    if (this._queue.length) {
      const keep = [];
      for (const s of this._queue) {
        if (pkStages && dt > 0 && this._prio(s, pkStages) < PRIORITY.pk) s.queuedAt = Math.min(now, s.queuedAt + dt);
        const stale = s.kind !== 'gala' && now - s.queuedAt > this.staleMs;
        if (stale || !isAlive(s)) this._refund(s.id);
        else keep.push(s);
      }
      this._queue = keep;
    }

    let cur = this._current;
    // 2. Cảnh đang quay mất mục tiêu → dừng ngay, không chờ mốc tối thiểu. Cảnh PK của cặp cũ cũng dừng.
    if (cur && (!isAlive(cur) || (cur.kind === 'pk' && pkStages && !pkStages.includes(cur.target)))) {
      this._stop(cur, now);
      cur = null;
    }

    // 3. Gala đang quay rút còn galaShortMs khi có Gala của người khác đang chờ (mục 4.4)
    if (cur && cur.kind === 'gala' && this._queue.some((q) => q.kind === 'gala' && q.gifter !== cur.gifter)) {
      cur.endAt = Math.min(cur.endAt, cur.startAt + this.galaShortMs);
      cur.durMs = cur.endAt - cur.startAt;
    }

    // 4. Hết giờ → cảnh kế; cảnh kế ưu tiên cao hơn và cảnh hiện tại đã qua mốc tối thiểu → cắt ngang
    const next = this._candidate(pkStages);
    if (cur) {
      if (now >= cur.endAt) {
        cur = null;
      } else if (next && next.prio > this._prio(cur, pkStages) && (cur.kind === 'idle' || now - cur.startAt >= this.minShotMs)) {
        // cảnh rảnh bị cảnh sự kiện cắt ngay (chốt 03/11/2026); cảnh khác phải chạy đủ minShotMs
        this._stop(cur, now);
        cur = null;
      }
    }
    if (!cur) cur = this._begin(next, now, pk, ctx.idleNext);
    this._current = cur;
    return cur;
  }

  /**
   * Bỏ cảnh hiện tại (lệnh panel `skip`): lần `tick` kế sẽ sang cảnh tiếp theo. Giây chưa quay được trả lại trần.
   * @returns {boolean} false = chưa có cảnh nào
   */
  skip(now) {
    const c = this._current;
    if (!c) return false;
    this._refund(c.id, Math.max(0, c.endAt - now));
    c.endAt = Math.min(c.endAt, now);
    c.durMs = c.endAt - c.startAt;
    return true;
  }

  /** Xoá sạch (buổi LIVE mới): cảnh đang quay, hàng chờ, trần mỗi người, lượt PK. */
  clear() {
    this._current = null;
    this._queue = [];
    this._reserve = [];
    this._pkKey = null;
    this._pkSide = 0;
    this._lastTick = null;
  }

  /** Ảnh chụp để lưu buổi LIVE (localStorage). Thông số lấy từ `opts` lúc `fromJSON`, không lưu ở đây. */
  toJSON() {
    return {
      seq: this._seq,
      current: this._current ? { ...this._current } : null,
      queue: this._queue.map((s) => ({ ...s })),
      reserve: this._reserve.map((r) => ({ ...r })),
      pkKey: this._pkKey,
      pkSide: this._pkSide,
    };
  }

  /**
   * Dựng lại từ `toJSON()`. Bản lưu hỏng thì bỏ phần hỏng, không ném lỗi.
   * @param {object} obj
   * @param {object} [opts] như constructor
   */
  static fromJSON(obj, opts = {}) {
    const d = new Director(opts);
    if (!obj || typeof obj !== 'object') return d;
    const isShot = (s) => !!s && typeof s === 'object' && typeof s.kind === 'string' && positive(s.durMs);
    if (Number.isInteger(obj.seq) && obj.seq > 0) d._seq = obj.seq;
    const c = obj.current;
    if (isShot(c) && Number.isFinite(c.startAt) && Number.isFinite(c.endAt)) d._current = { ...c };
    if (Array.isArray(obj.queue)) {
      d._queue = obj.queue.filter((s) => isShot(s) && Number.isFinite(s.queuedAt)).map((s) => ({ ...s }));
      d._sortQueue();
      if (d._queue.length > d.queueMax) d._queue.length = d.queueMax;
    }
    if (Array.isArray(obj.reserve)) {
      d._reserve = obj.reserve
        .filter((r) => r && r.gifter != null && Number.isFinite(r.at) && positive(r.ms))
        .map((r) => ({ gifter: r.gifter, shot: r.shot ?? null, at: r.at, ms: r.ms }));
    }
    if (typeof obj.pkKey === 'string') d._pkKey = obj.pkKey;
    d._pkSide = obj.pkSide === 1 ? 1 : 0;
    return d;
  }

  // ───────── nội bộ ─────────

  _nextId() {
    this._seq += 1;
    return 'shot' + this._seq;
  }

  /** Tổng giây cảnh quay `gifter` đã giữ trong cửa sổ trượt (mốc = lúc push). */
  _used(gifter, now) {
    this._reserve = this._reserve.filter((r) => now - r.at < this.camWindowMs);
    let sum = 0;
    for (const r of this._reserve) if (r.gifter === gifter) sum += r.ms;
    return sum;
  }

  /** Trả lại tối đa `ms` giây đã giữ cho cảnh `shotId` (cảnh chưa lên sóng / bị cắt sớm). */
  _refund(shotId, ms = Infinity) {
    for (let i = this._reserve.length - 1; i >= 0 && ms > 0; i--) {
      const r = this._reserve[i];
      if (r.shot !== shotId) continue;
      const take = Math.min(r.ms, ms);
      r.ms -= take;
      ms -= take;
      if (r.ms <= 0) this._reserve.splice(i, 1);
    }
  }

  /** Cảnh để gộp: cảnh đang quay (chưa hết giờ) trước, rồi cảnh đang chờ — cùng người tặng và cùng mục tiêu. */
  _mergeHost(s, now) {
    const c = this._current;
    if (c && now < c.endAt && c.gifter === s.gifter && c.target === s.target) return c;
    return this._queue.find((q) => q.gifter === s.gifter && q.target === s.target) ?? null;
  }

  /** Ưu tiên giảm dần, cùng ưu tiên thì tới trước được trước (sort ổn định). */
  _sortQueue() {
    this._queue.sort((a, b) => basePrio(b) - basePrio(a) || a.queuedAt - b.queuedAt);
  }

  /** Cảnh ưu tiên thấp nhất đang chờ; cùng ưu tiên thì cảnh cũ nhất. -1 = hàng trống. */
  _lowestIndex() {
    let idx = -1;
    for (let i = 0; i < this._queue.length; i++) {
      const q = this._queue[i];
      if (idx < 0) {
        idx = i;
        continue;
      }
      const low = this._queue[idx];
      if (basePrio(q) < basePrio(low) || (basePrio(q) === basePrio(low) && q.queuedAt < low.queuedAt)) idx = i;
    }
    return idx;
  }

  /**
   * Ưu tiên của cảnh lúc này. Trong PK, vai ở một trong 2 sân PK = 46 (đứng trên cảnh PK). Vé và vai sân khác giữ
   * ưu tiên gốc (< 45) nên tự chờ: cảnh PK ảo (45) luôn có mặt trong lúc PK và luôn thắng chúng.
   */
  _prio(s, pkStages) {
    if (pkStages && s.kind === 'role' && pkStages.includes(s.target)) return PK_ROLE_PRIORITY;
    return basePrio(s);
  }

  /** Cảnh nên quay tiếp: { prio, index } (index -1 = cảnh PK ảo), null = không có gì → vòng rảnh. */
  _candidate(pkStages) {
    let best = null;
    for (let i = 0; i < this._queue.length; i++) {
      const prio = this._prio(this._queue[i], pkStages);
      if (!best || prio > best.prio) best = { prio, index: i };
    }
    if (pkStages && (!best || best.prio < PRIORITY.pk)) best = { prio: PRIORITY.pk, index: -1 };
    return best;
  }

  /** Dừng cảnh đang quay trước giờ: giây chưa quay được trả lại trần. */
  _stop(cur, now) {
    this._refund(cur.id, Math.max(0, cur.endAt - now));
    this._current = null;
  }

  /** Bắt đầu cảnh kế: từ hàng chờ, cảnh PK ảo, hoặc vòng rảnh (không có thì toàn tòa nhà `minShotMs`). */
  _begin(next, now, pk, idleNext) {
    let s;
    if (next && next.index >= 0) {
      [s] = this._queue.splice(next.index, 1);
    } else if (next) {
      s = this._pkShot(pk, now);
    } else {
      const idle = typeof idleNext === 'function' ? idleNext(now) : null;
      s = idle
        ? { kind: 'idle', gifter: null, focus: null, ...idle }
        : { kind: 'idle', target: 'overview', view: 'overview', gifter: null, focus: null, durMs: this.minShotMs };
      s.id = s.id ?? this._nextId();
      s.queuedAt = now;
      if (!positive(s.durMs)) s.durMs = this.minShotMs;
    }
    s.startAt = now;
    s.endAt = now + s.durMs;
    return s;
  }

  /** Cảnh PK ảo: xen kẽ sân 'G'+a / 'G'+b, mỗi sân `pkSwapMs`. Cặp PK mới thì bắt đầu từ sân a. */
  _pkShot(pk, now) {
    const key = pk.a + ':' + pk.b;
    if (this._pkKey !== key) {
      this._pkKey = key;
      this._pkSide = 0;
    }
    const club = this._pkSide === 0 ? pk.a : pk.b;
    this._pkSide ^= 1;
    return {
      id: this._nextId(),
      kind: 'pk',
      target: 'G' + club,
      gifter: null,
      view: 'stage',
      focus: null,
      durMs: this.pkSwapMs,
      startAt: null,
      endAt: null,
      queuedAt: now,
    };
  }
}

/** Club mặc định khi chưa club nào có hoạt động. */
const DEFAULT_CLUBS = [1, 2, 3, 4, 5];

const idleShot = (target, view, focus, durMs) => ({
  id: null,
  kind: 'idle',
  target,
  gifter: null,
  view,
  focus,
  durMs,
  startAt: null,
  endAt: null,
  queuedAt: null,
});

/** Danh sách khách trên sân của club (object `{[club]: ids}` hoặc Map). */
function guestsOf(guests, club) {
  const list = guests instanceof Map ? guests.get(club) : guests?.[club];
  return Array.isArray(list) ? list : [];
}

/**
 * Vòng rảnh (mục 12) khi không có cảnh nào: mỗi club lần lượt
 * sân (tầm trung) → cận một khách trên sân (không có khách thì cận idol, focus null) → phòng có chủ là người xem
 * (không có thì bỏ qua) → bảng xếp hạng → club kế tiếp. Mỗi `sliceEveryMs` chèn một cảnh "lát sàn" làm chuyển cảnh.
 *
 * Club kế tiếp = club ghé lâu nhất rồi (chưa ghé coi như lâu nhất), cùng mức thì theo thứ tự `info.clubs`
 * (club có hoạt động gần nhất đứng trước) → danh sách đứng yên thì đúng là xoay vòng theo thứ tự.
 */
export class IdleCycle {
  /**
   * @param {{sliceEveryMs?:number, stageMs?:number, closeMs?:number, roomMs?:number, boardMs?:number, sliceMs?:number}} [opts]
   */
  constructor({ sliceEveryMs = 120000, stageMs = 8000, closeMs = 5000, roomMs = 6000, boardMs = 4000, sliceMs = 3000 } = {}) {
    this.sliceEveryMs = sliceEveryMs;
    this.stageMs = stageMs;
    this.closeMs = closeMs;
    this.roomMs = roomMs;
    this.boardMs = boardMs;
    this.sliceMs = sliceMs;
    this._club = null; // club đang quay vòng
    this._step = 0; // 0 = chọn club mới, 1 sân, 2 cận, 3 phòng, 4 bảng
    this._visit = {}; // club → lượt ghé gần nhất
    this._visitN = 0;
    this._closeN = {}; // club → số lần đã cận (xoay vòng khách)
    this._roomN = 0; // xoay vòng phòng có chủ
    this._sliceAt = null; // lúc chèn lát sàn gần nhất (lần gọi đầu = mốc)
  }

  /**
   * Cảnh rảnh kế tiếp (kind 'idle', gifter null).
   * @param {number} now
   * @param {{clubs?: number[], guests?: Object<string, string[]>|Map<number, string[]>, rooms?: string[]}} [info]
   *   `clubs` xếp theo hoạt động gần nhất (rỗng → 1..5); `guests[club]` id người xem trên sân; `rooms` phòng có chủ
   *   là người xem.
   * @returns {object} shot
   */
  next(now, info = {}) {
    const clubs = Array.isArray(info?.clubs) && info.clubs.length ? info.clubs : DEFAULT_CLUBS;
    if (this._sliceAt === null) this._sliceAt = now;
    if (now - this._sliceAt >= this.sliceEveryMs) {
      this._sliceAt = now;
      return idleShot('G' + this._ensureClub(clubs), 'slice', null, this.sliceMs);
    }
    const club = this._ensureClub(clubs);
    const stage = 'G' + club;
    if (this._step === 1) {
      this._step = 2;
      return idleShot(stage, 'stage', null, this.stageMs);
    }
    if (this._step === 2) {
      this._step = 3;
      const guests = guestsOf(info?.guests, club);
      let focus = null;
      if (guests.length) {
        const n = this._closeN[club] ?? 0;
        focus = guests[n % guests.length];
        this._closeN[club] = n + 1;
      }
      return idleShot(stage, 'close', focus, this.closeMs);
    }
    if (this._step === 3) {
      this._step = 4;
      const rooms = Array.isArray(info?.rooms) ? info.rooms : [];
      if (rooms.length) {
        const room = rooms[this._roomN % rooms.length];
        this._roomN += 1;
        return idleShot(room, 'room', null, this.roomMs);
      }
      // không có phòng của người xem → bỏ qua, sang bảng xếp hạng
    }
    this._step = 0;
    return idleShot('board', 'board', null, this.boardMs);
  }

  /** Club của cảnh kế tiếp; đang ở đầu vòng thì chọn club mới. */
  _ensureClub(clubs) {
    if (this._step === 0) {
      let best = clubs[0];
      let bestVisit = Infinity;
      for (const c of clubs) {
        const v = this._visit[c] ?? -1;
        if (v < bestVisit) {
          best = c;
          bestVisit = v;
        }
      }
      this._visitN += 1;
      this._visit[best] = this._visitN;
      this._club = best;
      this._step = 1;
    }
    return this._club;
  }

  /** Ảnh chụp để lưu buổi LIVE. */
  toJSON() {
    return {
      club: this._club,
      step: this._step,
      visit: { ...this._visit },
      visitN: this._visitN,
      closeN: { ...this._closeN },
      roomN: this._roomN,
      sliceAt: this._sliceAt,
    };
  }

  /**
   * Dựng lại từ `toJSON()`. Thông số lấy từ `opts`.
   * @param {object} obj
   * @param {object} [opts] như constructor
   */
  static fromJSON(obj, opts = {}) {
    const c = new IdleCycle(opts);
    if (!obj || typeof obj !== 'object') return c;
    const counts = (o) => {
      const out = {};
      if (o && typeof o === 'object') for (const [k, n] of Object.entries(o)) if (Number.isFinite(n)) out[k] = n;
      return out;
    };
    const step = Number.isInteger(obj.step) && obj.step >= 0 && obj.step <= 4 ? obj.step : 0;
    // giữa vòng mà mất club → quay về đầu vòng
    c._club = obj.club ?? null;
    c._step = c._club == null ? 0 : step;
    c._visit = counts(obj.visit);
    c._visitN = Number.isFinite(obj.visitN) ? obj.visitN : 0;
    c._closeN = counts(obj.closeN);
    c._roomN = Number.isInteger(obj.roomN) && obj.roomN >= 0 ? obj.roomN : 0;
    c._sliceAt = Number.isFinite(obj.sliceAt) ? obj.sliceAt : null;
    return c;
  }
}
