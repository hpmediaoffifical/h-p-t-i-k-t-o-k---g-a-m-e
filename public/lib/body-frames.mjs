// public/lib/body-frames.mjs — khung ĐẦU / THÂN từ 33 điểm MediaPipe Pose (toạ độ sân khấu), thuần, test node.
//
// Chép công thức từ Bắn Cung (public/games/bancung/body-track.mjs: body()/toStage()/toLocal()) nhưng bỏ
// socket/feed/mặt nạ để game khác (Đập Muỗi) dùng chung. Bắn Cung giữ code riêng — refactor để sau.
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

const VIS = 0.5;          // visibility tối thiểu để tin một điểm
const EMA = 0.6;          // lọc rung: mới 60% + cũ 40%

export const BITE_ZONES = ['forehead', 'cheekL', 'cheekR', 'chin', 'neck', 'shoulderL', 'shoulderR'];
// (a,b) cục bộ của từng điểm đậu + vùng cấu hình bật/tắt
const SPOTS = [
    { zone: 'forehead', frame: 'head', a: 0, b: -0.45, cfg: 'forehead' },
    { zone: 'cheekL', frame: 'head', a: -0.35, b: 0.15, cfg: 'cheeks' },
    { zone: 'cheekR', frame: 'head', a: 0.35, b: 0.15, cfg: 'cheeks' },
    { zone: 'chin', frame: 'head', a: 0, b: 0.5, cfg: 'chin' },
    { zone: 'neck', frame: 'head', a: 0, b: 0.95, cfg: 'neck' },
    { zone: 'shoulderL', frame: 'torso', a: -0.4, b: 0.05, cfg: 'shoulders' },
    { zone: 'shoulderR', frame: 'torso', a: 0.4, b: 0.05, cfg: 'shoulders' }
];

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
    let head = null;
    const ears = ok(7) && ok(8), eyes = ok(2) && ok(5);
    if (ears || eyes || ok(0)) {
        let c, hu, width;
        if (ears) { const [a, b] = P[7].x <= P[8].x ? [P[7], P[8]] : [P[8], P[7]]; c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; hu = { x: b.x - a.x, y: b.y - a.y }; width = Math.hypot(hu.x, hu.y); }
        else if (eyes) { const [a, b] = P[2].x <= P[5].x ? [P[2], P[5]] : [P[5], P[2]]; c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 20 }; width = Math.hypot(b.x - a.x, b.y - a.y) * 2.3; hu = { x: b.x - a.x, y: b.y - a.y }; }
        else { c = { x: P[0].x, y: P[0].y - shoulderW * 0.1 }; width = shoulderW * 0.55; hu = { x: width, y: 0 }; }
        // Quay nghiêng thì hai tai chồng nhau → khoảng tai rất nhỏ; đầu người không hẹp hơn ~0.45 bề vai.
        width = Math.max(shoulderW * 0.45, Math.min(shoulderW * 0.9, width || shoulderW * 0.55));
        // Hướng ngang của đầu: theo tai/mắt nếu đủ xa nhau, không thì theo vai; độ dài = bề rộng đầu.
        const hl = Math.hypot(hu.x, hu.y);
        hu = hl > shoulderW * 0.25 ? { x: hu.x / hl * width, y: hu.y / hl * width } : { x: u.x / shoulderW * width, y: u.y / shoulderW * width };
        const n = { x: -hu.y, y: hu.x }; const nl = Math.hypot(n.x, n.y) || 1;
        if (n.y < 0) { n.x = -n.x; n.y = -n.y; }
        head = { O: c, u: hu, v: { x: n.x / nl * width, y: n.y / nl * width }, width };
    }
    return { seen: true, pts: P, head, torso: { O: S, u, v }, shoulderW };
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
            const p = toStage(m, F);
            if (!p) continue;
            out.push({ id: s.zone + '#' + i, x: p.x, y: p.y, frame: s.frame, a: m.a, b: m.b, zone: s.zone });
        }
    }
    return out;
}
