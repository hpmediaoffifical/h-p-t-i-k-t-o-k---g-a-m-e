// overlays/lib/body-frames.mjs (port nguyên từ HP Action LIVE public/lib/body-frames.mjs) - khung ĐẦU / THÂN từ 33 điểm MediaPipe Pose (toạ độ sân khấu), thuần, test node.
//
// Chép công thức từ Bắn Cung (public/games/bancung/body-track.mjs: body()/toStage()/toLocal()) nhưng bỏ
// socket/feed/mặt nạ để game khác (Đập Muỗi) dùng chung. Bắn Cung giữ code riêng - refactor để sau.
//
// Toạ độ cục bộ: P = O + a·u + b·v.
//   Khung THÂN: O = giữa hai vai, u = vai trái→vai phải (độ dài = bề vai), v = vai→hông.
//   Khung ĐẦU:  O = tâm đầu (giữa hai tai; mất tai thì giữa hai mắt; không thì mũi), u = tai→tai
//               (độ dài = bề rộng đầu), v = vuông góc hướng xuống, độ dài = bề rộng đầu.
// Người xoay/di chuyển thì (a,b) giữ nguyên, điểm trên sân khấu đi theo → vết dính người.
//
//   bodyFrames(pose, prev)        → { seen, pts, head|null, torso|null, shoulderW }  (pts: 33 điểm đã EMA)
//   toStage(mark, frames)         → {x,y} | null
//   toLocal(x, y, frame, frames)  → {frame,a,b} | null
//   biteSpots(frames, zones)      → điểm muỗi đậu: trán / má / cằm / cổ / vai
//
// Thanh bám trên đầu (Level Quest trong Game Camera) - vị trí là { x: tâm ngang, yBottom: mép dưới, s: tỉ lệ }:
//   headAnchor(frames)                        → { crown, headW } | null  (không thấy đầu thì ước lượng từ vai)
//   placeAbove(anchor, box, W, H, {scale,gap}) → cụm cỡ gốc box={w,h} đặt trên đỉnh đầu, kẹp trong khung W×H
//   homePlace(box, W, H, {scale})             → chỗ mặc định khi mất người: giữa ngang, sát mép trên
//   followStep(prev, target, dt, tau)         → trượt mượt theo thời gian thật, bỏ qua rung nhỏ

const VIS = 0.5;          // visibility tối thiểu để tin một điểm
const EMA = 0.6;          // lọc rung: mới 60% + cũ 40%

export const BITE_ZONES = ['forehead', 'cheekL', 'cheekR', 'chin', 'neck', 'shoulderL', 'shoulderR', 'belly', 'flankL', 'flankR', 'armL', 'armR'];
// Vùng MẶT - Đập Muỗi chọn điểm đậu ở mặt theo tỉ lệ bite.facePercent (mặc định 70 %), còn lại rải khắp thân.
export const FACE_ZONES = ['forehead', 'cheekL', 'cheekR', 'chin'];
// (a,b) cục bộ của từng điểm đậu + vùng cấu hình bật/tắt
const SPOTS = [
    { zone: 'forehead', frame: 'head', a: 0, b: -0.45, cfg: 'forehead' },
    { zone: 'cheekL', frame: 'head', a: -0.35, b: 0.15, cfg: 'cheeks' },
    { zone: 'cheekR', frame: 'head', a: 0.35, b: 0.15, cfg: 'cheeks' },
    { zone: 'chin', frame: 'head', a: 0, b: 0.5, cfg: 'chin' },
    { zone: 'neck', frame: 'head', a: 0, b: 0.95, cfg: 'neck' },
    { zone: 'shoulderL', frame: 'torso', a: -0.4, b: 0.05, cfg: 'shoulders' },
    { zone: 'shoulderR', frame: 'torso', a: 0.4, b: 0.05, cfg: 'shoulders' },
    // Toàn thân (khung thân: a theo bề ngang vai, b theo đoạn vai → hông). cfg 'body' bật/tắt cả nhóm.
    // KHÔNG đậu ở NGỰC và HÁNG (TikTok coi là nhạy cảm - nốt đỏ / muỗi bu ở đó dễ dính vi phạm): bỏ chestL/chestR (cũ a ±0.22,
    // b 0.3 = đúng vùng ngực), eo cũ (a ±0.3, b 0.9 + biến thể tới 0.98 = sát háng) dời thành HÔNG HAI BÊN cao hơn, ra ngoài.
    // isSensitiveSpot() chặn thêm một lớp cho mọi điểm (kể cả biến thể lệch).
    { zone: 'belly', frame: 'torso', a: 0, b: 0.6, cfg: 'body' },
    { zone: 'flankL', frame: 'torso', a: -0.46, b: 0.62, cfg: 'body' },
    { zone: 'flankR', frame: 'torso', a: 0.46, b: 0.62, cfg: 'body' },
    { zone: 'armL', frame: 'torso', a: -0.62, b: 0.4, cfg: 'body' },
    { zone: 'armR', frame: 'torso', a: 0.62, b: 0.4, cfg: 'body' }
];

// Vùng nhạy cảm trên khung THÂN (a: ngang theo bề vai, 0 = giữa; b: 0 = vai, 1 = hông):
//   NGỰC: |a| 0.06–0.42, b 0.15–0.5 (hai bên ngực, chừa xương quai xanh / vai / giữa bụng trên)
//   HÁNG: b ≥ 0.78, |a| ≤ 0.55 (từ dưới rốn tới đường hông và thấp hơn)
export function isSensitiveSpot(frame, a, b) {
    if (frame !== 'torso') return false;
    const x = Math.abs(Number(a)), y = Number(b);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
    if (x >= 0.06 && x <= 0.42 && y >= 0.15 && y <= 0.5) return true;
    if (y >= 0.78 && x <= 0.55) return true;
    return false;
}

function smoothPts(pose, prev) {
    if (!Array.isArray(pose) || pose.length < 33) return null;
    const old = prev && prev.pts;
    return pose.map((p, i) => {
        const v = p && Number.isFinite(p.v) ? p.v : 1;
        const x = p ? Number(p.x) : NaN, y = p ? Number(p.y) : NaN;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0, v: 0 };
        const o = old && old[i] && old[i].v >= VIS && v >= VIS ? old[i] : null;
        return o ? { x: o.x + (x - o.x) * EMA, y: o.y + (y - o.y) * EMA, v } : { x, y, v };
    });
}

export function bodyFrames(pose, prev) {
    const P = smoothPts(pose, prev);
    const empty = { seen: false, pts: null, head: null, torso: null, shoulderW: 0 };
    if (!P) return empty;
    const ok = i => P[i] && P[i].v >= VIS;
    if (!ok(11) || !ok(12)) return { ...empty, pts: P };
    // Vai xếp theo bên MÀN HÌNH (ảnh có thể đã lật), không tin nhãn trái/phải của model.
    const [lS, rS] = P[11].x <= P[12].x ? [P[11], P[12]] : [P[12], P[11]];
    const S = { x: (lS.x + rS.x) / 2, y: (lS.y + rS.y) / 2 };
    const u = { x: rS.x - lS.x, y: rS.y - lS.y };
    const shoulderW = Math.hypot(u.x, u.y) || 1;
    let v;
    if (ok(23) && ok(24)) {
        const hip = { x: (P[23].x + P[24].x) / 2, y: (P[23].y + P[24].y) / 2 };
        v = { x: hip.x - S.x, y: hip.y - S.y };
    } else {
        // Hông ngoài khung (ngồi sát camera) → thân dài ~1.4 bề vai, vuông góc với vai, hướng xuống.
        const n = { x: -u.y / shoulderW, y: u.x / shoulderW };
        if (n.y < 0) { n.x = -n.x; n.y = -n.y; }
        v = { x: n.x * shoulderW * 1.4, y: n.y * shoulderW * 1.4 };
    }
    return { seen: true, pts: P, head: headFrom(P, ok, { u, shoulderW }), torso: { O: S, u, v }, shoulderW };
}

// Khung đầu từ tai / mắt / mũi. sh = { u, shoulderW } khi thấy vai: kẹp bề rộng đầu theo vai và lấy hướng vai làm
// dự phòng. Không thấy vai (ngồi sát camera - chỉ headAnchor dùng) thì cần tai hoặc mắt; chỉ mũi → null.
function headFrom(P, ok, sh) {
    const ears = ok(7) && ok(8), eyes = ok(2) && ok(5);
    if (!(ears || eyes || (sh && ok(0)))) return null;
    const eyeW = eyes ? Math.hypot(P[5].x - P[2].x, P[5].y - P[2].y) * 2.3 : 0;
    let c, hu, width;
    if (ears) { const [a, b] = P[7].x <= P[8].x ? [P[7], P[8]] : [P[8], P[7]]; c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; hu = { x: b.x - a.x, y: b.y - a.y }; width = Math.hypot(hu.x, hu.y); }
    else if (eyes) { const [a, b] = P[2].x <= P[5].x ? [P[2], P[5]] : [P[5], P[2]]; c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 20 }; width = eyeW; hu = { x: b.x - a.x, y: b.y - a.y }; }
    else { c = { x: P[0].x, y: P[0].y - sh.shoulderW * 0.1 }; width = sh.shoulderW * 0.55; hu = { x: width, y: 0 }; }
    const hl = Math.hypot(hu.x, hu.y);
    if (sh) {
        const { u, shoulderW } = sh;
        // Quay nghiêng thì hai tai chồng nhau → khoảng tai rất nhỏ; đầu người không hẹp hơn ~0.45 bề vai.
        width = Math.max(shoulderW * 0.45, Math.min(shoulderW * 0.9, width || shoulderW * 0.55));
        // Hướng ngang của đầu: theo tai/mắt nếu đủ xa nhau, không thì theo vai; độ dài = bề rộng đầu.
        hu = hl > shoulderW * 0.25 ? { x: hu.x / hl * width, y: hu.y / hl * width } : { x: u.x / shoulderW * width, y: u.y / shoulderW * width };
    } else {
        width = Math.max(width, eyeW);              // không có vai để kẹp: tai chồng nhau thì lấy theo mắt
        if (!(hl > 1e-6) || !(width > 1e-6)) return null;
        hu = { x: hu.x / hl * width, y: hu.y / hl * width };
    }
    const n = { x: -hu.y, y: hu.x }; const nl = Math.hypot(n.x, n.y) || 1;
    if (n.y < 0) { n.x = -n.x; n.y = -n.y; }
    // Tai nằm khoảng giữa đầu → đỉnh đầu cao hơn tâm ~0.72 bề rộng đầu (tóc tính vào) - công thức Bắn Cung.
    const hv = { x: n.x / nl * width, y: n.y / nl * width };
    return { O: c, u: hu, v: hv, width, crown: { x: c.x - hv.x * 0.72, y: c.y - hv.y * 0.72 } };
}

export function toStage(mark, F) {
    if (!F || !mark) return null;
    const f = mark.frame === 'head' ? F.head : F.torso;
    if (!f) return null;
    return { x: f.O.x + f.u.x * mark.a + f.v.x * mark.b, y: f.O.y + f.u.y * mark.a + f.v.y * mark.b };
}

export function toLocal(x, y, frame, F) {
    if (!F) return null;
    const f = frame === 'head' ? F.head : F.torso;
    if (!f) return null;
    const det = f.u.x * f.v.y - f.u.y * f.v.x;
    if (Math.abs(det) < 1e-6) return null;
    const dx = x - f.O.x, dy = y - f.O.y;
    return { frame, a: (dx * f.v.y - dy * f.v.x) / det, b: (f.u.x * dy - f.u.y * dx) / det };
}

// Mỗi vùng 3 biến thể lệch nhau cố định (±0.1 a, ±0.08 b) → nhiều cú chích cùng vùng không chồng một điểm.
const VARIANTS = [[0, 0], [-0.1, 0.08], [0.1, -0.08]];
export function biteSpots(F, zones) {
    if (!F || !F.seen) return [];
    const z = zones || {};
    const out = [];
    for (const s of SPOTS) {
        if (z[s.cfg] === false) continue;
        for (let i = 0; i < VARIANTS.length; i++) {
            const m = { frame: s.frame, a: s.a + VARIANTS[i][0], b: s.b + VARIANTS[i][1] };
            if (isSensitiveSpot(m.frame, m.a, m.b)) continue;
            const p = toStage(m, F);
            if (!p) continue;
            out.push({ id: s.zone + '#' + i, x: p.x, y: p.y, frame: s.frame, a: m.a, b: m.b, zone: s.zone });
        }
    }
    return out;
}

// ---------- Thanh bám trên đầu ----------
const EDGE = 6;            // lề khung (px)
const HOME_TOP = 30;       // chỗ mặc định: mép trên cụm cách mép trên khung
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function headAnchor(F) {
    if (!F) return null;
    if (!F.seen) {
        // Không thấy vai (ngồi sát camera, chỉ có mặt) - vẫn đặt được thanh nếu thấy tai/mắt.
        const P = F.pts, h = P ? headFrom(P, i => P[i] && P[i].v >= VIS, null) : null;
        return h ? { crown: h.crown, headW: h.width } : null;
    }
    if (F.head) return { crown: { x: F.head.crown.x, y: F.head.crown.y }, headW: F.head.width };
    if (!F.torso) return null;
    // Đầu ngoài khung / không thấy mặt: đỉnh đầu ~0.95 bề vai phía trên giữa vai, ngược hướng thân.
    const v = F.torso.v, vl = Math.hypot(v.x, v.y) || 1, d = F.shoulderW * 0.95;
    return { crown: { x: F.torso.O.x - v.x / vl * d, y: F.torso.O.y - v.y / vl * d }, headW: F.shoulderW * 0.55 };
}

export function placeAbove(anchor, box, W, H, { scale = 0.55, gap = 20 } = {}) {
    // Đứng gần camera đầu to → thanh to, có giới hạn để không phá bố cục (cùng hệ số hàng tim Bắn Cung).
    const s = scale * clamp(anchor.headW / 180, 0.65, 1.4);
    const bw = box.w * s, bh = box.h * s;
    const x = bw + EDGE * 2 < W ? clamp(anchor.crown.x, bw / 2 + EDGE, W - bw / 2 - EDGE) : W / 2;
    let yBottom = anchor.crown.y - (gap + anchor.headW * 0.08);
    if (yBottom - bh < EDGE) yBottom = EDGE + bh;          // sát mép trên: đè lên đầu chứ không ra ngoài khung
    return { x, yBottom: Math.min(yBottom, H - EDGE), s };
}

export function homePlace(box, W, H, { scale = 0.55 } = {}) {
    return { x: W / 2, yBottom: HOME_TOP + box.h * scale, s: scale };
}

export function followStep(prev, target, dt, tau = 90) {
    if (!prev) return { ...target };
    const dx = target.x - prev.x, dy = target.yBottom - prev.yBottom, ds = target.s - prev.s;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2 && Math.abs(ds) < 0.01) return prev;
    const a = 1 - Math.exp(-Math.max(0, dt) / tau);
    return { x: prev.x + dx * a, yBottom: prev.yBottom + dy * a, s: prev.s + ds * a };
}

// Toạ độ pose tính theo cỡ khung lúc tạo tracker; Browser Source đổi cỡ mà không tải lại thì đổi tỉ lệ sang cỡ
// trang hiện tại (bố cục overlay co giãn theo khung nên tỉ lệ thẳng là đúng).
export function rescaleAnchor(a, fromW, fromH, toW, toH) {
    if (!a || (fromW === toW && fromH === toH) || !fromW || !fromH) return a;
    const sx = toW / fromW, sy = toH / fromH;
    return { crown: { x: a.crown.x * sx, y: a.crown.y * sy }, headW: a.headW * sx };
}
