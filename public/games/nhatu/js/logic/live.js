/**
 * ⛓️ Nhà Tù Online — gắn với LIVE: combo quà, kéo co theo điểm PK.
 * Logic thuần (không DOM, không three.js) → test bằng `npm test` (tests/nhatu-live.test.mjs).
 */

/** Quà giống nhau của cùng 1 người trong bấy nhiêu ms được cộng dồn thành combo. */
export const COMBO_WINDOW_MS = 10000;

/**
 * Combo quà: TikTok gộp chuỗi thành `count`; quà rời cùng loại trong COMBO_WINDOW_MS cũng cộng dồn.
 * @param {Map<string, {n:number, at:number}>} combos bộ nhớ combo (bị sửa)
 * @param {string} key `${người}|${quà}`
 * @param {number} count số lượt của lần tặng này
 * @param {number} now ms
 * @returns {{n:number, power:1|2|3}} power 2 = ×5, 3 = ×10 (trò đùa / thùng rác trúng 2–3 người…)
 */
export function comboPower(combos, key, count, now) {
  const c = combos.get(key);
  const n = (c && now - c.at < COMBO_WINDOW_MS ? c.n : 0) + Math.max(1, Number(count) || 1);
  combos.set(key, { n, at: now });
  if (combos.size > 400) for (const [k, x] of combos) if (now - x.at > COMBO_WINDOW_MS) combos.delete(k);
  return { n, power: n >= 10 ? 3 : n >= 5 ? 2 : 1 };
}

/**
 * Độ dịch dây kéo co (m) theo điểm PK: dương = đội mình dẫn (dây kéo về phía mình). Kẹp ±maxShift;
 * +50 điểm "đệm" để đầu trận điểm nhỏ không làm dây giật hết cỡ.
 */
export function tugShift(host, opp, maxShift = 1.8) {
  const h = Math.max(0, Number(host) || 0);
  const o = Math.max(0, Number(opp) || 0);
  if (h + o <= 0) return 0;
  return Math.max(-1, Math.min(1, (h - o) / (h + o + 50))) * maxShift;
}
