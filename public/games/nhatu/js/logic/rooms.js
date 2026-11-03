/**
 * ⛓️ Nhà Tù Online — PHÒNG = ĐỘI: người xem bình luận `P1`…`P6` để chọn phòng, cả phòng thi đua theo vòng
 * bằng tương tác miễn phí (tim, bình luận, chia sẻ, theo dõi) + quà. Hết vòng phòng nhất được ăn tiệc + điểm.
 * Logic thuần (không DOM, không three.js) → test bằng `npm test` (tests/nhatu-rooms.test.mjs).
 */
import { stripVN } from './spotlight.js';

/** Điểm thi đua phòng cho mỗi tương tác (quà tính theo xu). */
export const ROOM_POINTS = { like: 1, comment: 5, share: 50, follow: 50, coin: 10 };

/** Bình luận chỉ được tính điểm phòng 1 lần mỗi bấy nhiêu ms / người (chống spam). */
export const COMMENT_COOLDOWN_MS = 10000;

/** Đổi phòng tối đa 1 lần mỗi bấy nhiêu ms / người (không nhảy phòng dồn phiếu lúc cuối vòng). */
export const SWITCH_COOLDOWN_MS = 60000;

/**
 * Đọc mã chọn phòng ở đầu bình luận: "P3", "p 3", "Phòng 3", "phong3 nha", "#P2" → 3.
 * @param {string} text
 * @param {number} rooms số phòng đang mở (P1…Prooms)
 * @returns {number|null}
 */
export function parseRoomCode(text, rooms) {
  const m = /^[#!/.]*\s*(?:p|phong)\s*(\d{1,2})(?!\d)/.exec(stripVN(text).trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= rooms ? n : null;
}

/**
 * Phòng ít người nhất (cân đội) — người mới vào trại được xếp vào đây. Hoà → phòng số nhỏ.
 * @param {number} rooms
 * @param {Map<number, number>} counts phòng → số người xem đang ở
 */
export function leastCrowdedRoom(rooms, counts) {
  let best = 1;
  for (let r = 2; r <= rooms; r++) if ((counts.get(r) ?? 0) < (counts.get(best) ?? 0)) best = r;
  return best;
}

export class RoomRace {
  /** @param {{rooms?: number, roundSec?: number}} opts */
  constructor(opts = {}) {
    this.scores = new Map();
    this.endsAt = 0;
    this.setOptions(opts);
  }

  setOptions({ rooms = 6, roundSec = 300 } = {}) {
    this.rooms = rooms;
    this.roundSec = roundSec;
  }

  /** Bắt đầu vòng mới (xoá điểm). */
  start(now) {
    this.scores.clear();
    this.endsAt = now + this.roundSec * 1000;
  }

  add(room, pts) {
    if (!(room >= 1 && room <= this.rooms) || !(pts > 0)) return;
    this.scores.set(room, (this.scores.get(room) ?? 0) + pts);
  }

  /** Bảng xếp hạng vòng hiện tại (chỉ phòng có điểm), cao trước; hoà → phòng số nhỏ trước. */
  ranking() {
    return [...this.scores.entries()]
      .filter(([r, s]) => s > 0 && r <= this.rooms)
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .map(([room, score]) => ({ room, score }));
  }

  left(now) {
    return Math.max(0, (this.endsAt - now) / 1000);
  }

  /**
   * Gọi đều đặn. Hết vòng → trả kết quả và tự bắt đầu vòng mới.
   * @returns {null | {winner: number|null, score: number, ranking: {room:number, score:number}[]}}
   */
  tick(now) {
    if (!this.endsAt) this.start(now);
    if (now < this.endsAt) return null;
    const ranking = this.ranking();
    const top = ranking[0] ?? null;
    this.start(now);
    return { winner: top ? top.room : null, score: top ? top.score : 0, ranking };
  }
}
