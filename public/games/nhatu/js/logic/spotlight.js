/**
 * ⛓️ Nhà Tù Online — chế độ TỰ CHƠI: lượt "lên sóng" của người tặng quà.
 * Logic thuần (không DOM, không three.js) → test bằng `npm test` (tests/nhatu-spotlight.test.mjs).
 *
 * - Ai tặng quà được 1 lượt: camera bám theo, bình luận mã (số hoặc chữ) để ra lệnh cho phạm nhân của mình.
 * - Thời lượng lượt = base + (xu - 1) × perCoin, kẹp trong [base, max].
 * - preempt = true: có người mới tặng quà đang chờ → người đang chơi chỉ giữ tối thiểu `minTurn` giây rồi nhường.
 * - Hàng chờ xếp theo độ ưu tiên (`prio`, mặc định = số xu): quà lớn chen lên trước quà nhỏ. Mỗi người chỉ bị
 *   chen qua tối đa MAX_JUMPS lần — quà nhỏ không bị đẩy xuống mãi.
 */

/** Một người trong hàng chờ bị quà lớn hơn chen qua tối đa bấy nhiêu lần, sau đó giữ chỗ. */
export const MAX_JUMPS = 3;

/** Bỏ dấu tiếng Việt + chữ thường: "Lau Sàn" → "lau san". */
export function stripVN(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();
}

/**
 * Đọc mã hành động ở ĐẦU bình luận: "1", "b", "#2", "bong", "lau san"...
 * @param {string} text bình luận
 * @param {{id:string, keys:string[]}[]} actions mỗi hành động có danh sách mã (đã chữ thường, không dấu)
 * @returns {string|null} id hành động hoặc null
 */
export function parseActionCode(text, actions) {
  const t = stripVN(text).trim().replace(/^[#!/.]+/, '');
  if (!t) return null;
  const first = t.split(/[\s,.;:!?]+/)[0];
  for (const a of actions) {
    for (const k of a.keys) {
      if (!k) continue;
      if (k.length <= 2 && first === k) return a.id; // mã ngắn ở đầu câu: "1", "b", "#2 nha"
      if (k.length > 2 && t.replace(/[\s,.;:!?]+$/, '') === k) return a.id; // từ khoá phải là cả câu: "lau san" (tránh "bông hoa" → bóng)
    }
  }
  return null;
}

/** Số giây một lượt cho món quà `coins` xu. */
export function turnSeconds(coins, { base, perCoin, max }) {
  const c = Math.max(1, Number(coins) || 1);
  return Math.round(Math.min(max, Math.max(base, base + (c - 1) * perCoin)));
}

export class SpotlightQueue {
  /**
   * @param {{base:number, perCoin:number, max:number, queueMax:number, minTurn:number, preempt:boolean}} opts
   */
  constructor(opts) {
    this.setOptions(opts);
    this.current = null;
    this.queue = [];
  }

  setOptions({ base = 20, perCoin = 1, max = 90, queueMax = 20, minTurn = 10, preempt = true } = {}) {
    this.base = base;
    this.perCoin = perCoin;
    this.max = Math.max(base, max);
    this.queueMax = queueMax;
    this.minTurn = minTurn;
    this.preempt = preempt;
  }

  /**
   * Ghi nhận một món quà.
   * @param {{id:string, name:string, avatar?:string}} user
   * @param {number} [prio] độ ưu tiên trong hàng chờ (mặc định = số xu; quà đã gán hành động được nhân đôi)
   * @returns {'start'|'extend'|'queued'|'queued-extend'|'full'}
   */
  addGift(user, coins, now, prio = coins) {
    const sec = turnSeconds(coins, this);
    const p = Math.max(0, Number(prio) || 0);
    if (this.current && this.current.id === user.id) {
      this.current.endsAt = Math.min(this.current.endsAt + sec * 1000, now + this.max * 1000);
      return 'extend';
    }
    const waiting = this.queue.find((q) => q.id === user.id);
    if (waiting) {
      waiting.seconds = Math.min(this.max, waiting.seconds + sec);
      waiting.prio += p; // tặng thêm lúc đang chờ → được chen lên (nếu đủ ưu tiên)
      this.queue.splice(this.queue.indexOf(waiting), 1);
      this.place(waiting);
      return 'queued-extend';
    }
    if (!this.current) {
      this.start({ ...user, seconds: sec }, now);
      return 'start';
    }
    if (this.queue.length >= this.queueMax) return 'full';
    this.place({ id: user.id, name: user.name, avatar: user.avatar ?? '', seconds: sec, prio: p, jumped: 0 });
    return 'queued';
  }

  /** Chèn vào hàng chờ: đứng trước những người ưu tiên thấp hơn chưa bị chen quá MAX_JUMPS lần. */
  place(entry) {
    let at = this.queue.length;
    while (at > 0) {
      const q = this.queue[at - 1];
      if (q.prio >= entry.prio || q.jumped >= MAX_JUMPS) break;
      at--;
    }
    for (let i = at; i < this.queue.length; i++) this.queue[i].jumped++;
    this.queue.splice(at, 0, entry);
  }

  start(entry, now) {
    this.current = {
      id: entry.id,
      name: entry.name,
      avatar: entry.avatar ?? '',
      startedAt: now,
      endsAt: now + entry.seconds * 1000,
    };
  }

  /** Thời điểm lượt hiện tại thực sự kết thúc (tính cả nhường lượt). */
  deadline() {
    const c = this.current;
    if (!c) return 0;
    if (this.preempt && this.queue.length) return Math.min(c.endsAt, c.startedAt + this.minTurn * 1000);
    return c.endsAt;
  }

  /**
   * Gọi đều đặn. Hết lượt → chuyển người kế.
   * @returns {{ended:object|null, started:object|null}}
   */
  tick(now) {
    let ended = null;
    let started = null;
    if (this.current && now >= this.deadline()) {
      ended = this.current;
      this.current = null;
    }
    if (!this.current && this.queue.length) {
      this.start(this.queue.shift(), now);
      started = this.current;
    }
    return { ended, started };
  }

  /** Giây còn lại của lượt hiện tại. */
  remaining(now) {
    return this.current ? Math.max(0, (this.deadline() - now) / 1000) : 0;
  }

  /** Bỏ qua lượt hiện tại (lệnh từ panel). */
  skip(now) {
    if (this.current) this.current.endsAt = now;
    return this.tick(now);
  }

  clear() {
    this.current = null;
    this.queue = [];
  }
}
