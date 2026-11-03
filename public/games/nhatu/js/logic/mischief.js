/**
 * ⛓️ Nhà Tù Online — quà nghịch ngợm: 💩 Đi bậy / 💦 Tè bậy, 📢 Tố cáo, 🗑️ Ném vào thùng rác.
 * Logic thuần (không DOM, không three.js) → test bằng `npm test` (tests/nhatu-mischief.test.mjs).
 *
 * - Đi bậy mà có Cán Bộ (NPC hoặc người xem làm cán bộ) đứng gần → bị bắt quả tang, giam ntOffenseJailSec giây.
 * - Không bị bắt thì vẫn có thể bị người khác tặng quà 📢 Tố cáo trong REPORT_WINDOW_MS.
 * - Ra tù (hết hạn hoặc quà 🔓 Bảo lãnh) vẫn phải tự dọn bãi của mình. Ai dọn giúp bãi của người khác → điểm cống hiến cao.
 */

/** Khoảng cách cán bộ nhìn thấy (m). */
export const CATCH_RADIUS = 7;
/** Tố cáo được người đi bậy trong vòng bấy nhiêu ms. */
export const REPORT_WINDOW_MS = 5 * 60 * 1000;
/** Điểm cống hiến khi dọn bãi bẩn: của người khác / của chính mình. */
export const CLEAN_POINTS = { other: 20, own: 5 };

/**
 * Cán bộ gần nhất (cùng tầng) trong bán kính → người bắt quả tang.
 * @param {{body:{pos:{x:number,y:number,z:number}}}[]} guards
 * @param {{x:number,y:number,z:number}} pos chỗ đi bậy
 * @param {number} [radius]
 */
export function findCatcher(guards, pos, radius = CATCH_RADIUS) {
  let best = null;
  let bd = radius;
  for (const g of guards) {
    const p = g.body.pos;
    if (Math.abs(p.y - pos.y) > 1.5) continue;
    const d = Math.hypot(p.x - pos.x, p.z - pos.z);
    if (d <= bd) {
      bd = d;
      best = g;
    }
  }
  return best;
}

/**
 * Người bị tố cáo: lần đi bậy MỚI NHẤT chưa bị bắt, người đó còn trong trại và chưa bị giam.
 * @param {{v:object, at:number, caught:boolean}[]} offenses
 * @param {number} now
 * @param {(v:object) => boolean} isFree còn trong trại + đang không bị giam
 * @param {number} [windowMs]
 * @returns {object|null} bản ghi lần đi bậy
 */
export function pickReportTarget(offenses, now, isFree, windowMs = REPORT_WINDOW_MS) {
  let best = null;
  for (const o of offenses) {
    if (o.caught || now - o.at > windowMs || !isFree(o.v)) continue;
    if (!best || o.at > best.at) best = o;
  }
  return best;
}

/**
 * Nạn nhân thùng rác: ưu tiên người xem thật (vui cho cả phòng), không ném chính người tặng.
 * @param {{viewerRec?:{id:string}}[]} candidates phạm nhân đang rảnh
 * @param {string} gifterId
 * @param {() => number} rng
 * @param {number} [viewerBias] xác suất chọn người xem khi có cả người xem lẫn NPC
 */
export function pickTrashVictim(candidates, gifterId, rng, viewerBias = 0.7) {
  const pool = candidates.filter((c) => c.viewerRec?.id !== gifterId);
  if (!pool.length) return null;
  const viewers = pool.filter((c) => c.viewerRec);
  const npcs = pool.filter((c) => !c.viewerRec);
  const from = viewers.length && (!npcs.length || rng() < viewerBias) ? viewers : npcs;
  return from[Math.floor(rng() * from.length) % from.length];
}

/** Điểm cống hiến khi `cleaner` dọn bãi của `owner`. */
export function cleanPoints(cleanerId, ownerId) {
  return cleanerId && cleanerId === ownerId ? CLEAN_POINTS.own : CLEAN_POINTS.other;
}

/** "2:05" cho đồng hồ trên đầu nhân vật. */
export function mmss(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
