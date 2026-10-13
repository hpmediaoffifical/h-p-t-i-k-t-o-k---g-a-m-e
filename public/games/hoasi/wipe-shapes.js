/* Họa Sĩ — hình học lau sơn (thuần, test node). 21 điểm tay MediaPipe (toạ độ sân khấu) → các hình xoá
 * mà overlay vẽ vào mặt nạ rồi `destination-out` lên lớp sơn. Cỡ theo span = hand.size (cổ tay → MCP giữa),
 * thông số như HP LIVE Studio erasePainterWithHands. Spec §5. */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else { root.HpGame = root.HpGame || {}; root.HpGame.hoasiWipe = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
        [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20]];
    const TIPS = [4, 8, 12, 16, 20];
    const PALM = [0, 1, 5, 9, 13, 17];
    const R_POINT = 0.30, R_TIP = 0.36, R_BONE = 0.26;     // × span
    const SWEEP_MS = 200, SWEEP_MAX_SPAN = 4;

    const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const ok = (pts) => Array.isArray(pts) && pts.length >= 21 && pts.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));

    // Đếm ngón duỗi trong 2D (camera trước mặt): ngón dài duỗi khi đầu ngón xa cổ tay hơn khớp PIP 15%;
    // ngón cái duỗi khi đầu cái xa MCP út hơn khớp IP 5%.
    function fingersExtended(pts) {
        if (!ok(pts)) return 0;
        let n = d(pts[4], pts[17]) > d(pts[3], pts[17]) * 1.05 ? 1 : 0;
        for (const tip of [8, 12, 16, 20]) if (d(pts[0], pts[tip]) > d(pts[0], pts[tip - 2]) * 1.15) n++;
        return n;
    }

    // Nắm tay (0–1 ngón) không lau — streamer đưa tay qua mặt mà không xoá.
    function canWipe(hand, minFingers) {
        return !!hand && ok(hand.pts) && fingersExtended(hand.pts) >= Math.max(1, Number(minFingers) || 1);
    }

    const pointR = (i, span) => (TIPS.includes(i) ? R_TIP : R_POINT) * span;

    // prev = { pts, at } khung nhận diện trước của CÙNG tay; now = thời điểm khung này.
    // Vệt quét nối từng điểm prev → cur (liên tục, quẹt nhanh không đứt nét); bỏ khi khung trước cũ hoặc nhảy cóc.
    function handShapes(hand, prev, now) {
        if (!hand || !ok(hand.pts)) return [];
        const P = hand.pts, span = Math.max(1, Number(hand.size) || d(P[0], P[9]) || 1);
        const out = [];
        for (let i = 0; i < 21; i++) out.push({ t: 'circle', x: P[i].x, y: P[i].y, r: pointR(i, span) });
        for (const [a, b] of BONES) out.push({ t: 'capsule', x0: P[a].x, y0: P[a].y, x1: P[b].x, y1: P[b].y, r: R_BONE * span });
        out.push({ t: 'poly', pts: PALM.map(i => ({ x: P[i].x, y: P[i].y })) });
        if (prev && ok(prev.pts) && now - prev.at < SWEEP_MS && now >= prev.at) {
            let far = false;
            for (let i = 0; i < 21 && !far; i++) if (d(prev.pts[i], P[i]) >= SWEEP_MAX_SPAN * span) far = true;
            if (!far) for (let i = 0; i < 21; i++) out.push({ t: 'capsule', x0: prev.pts[i].x, y0: prev.pts[i].y, x1: P[i].x, y1: P[i].y, r: pointR(i, span) });
        }
        return out;
    }

    // Dự phòng khi mất bàn tay: 4 hình tròn nối dài qua cổ tay theo hướng khuỷu → cổ tay (pose 33 điểm).
    function wristShapes(pose, side) {
        if (!Array.isArray(pose)) return [];
        const [ei, wi] = side === 'R' ? [14, 16] : [13, 15];
        const e = pose[ei], w = pose[wi];
        if (!e || !w || !(e.v >= 0.5) || !(w.v >= 0.5)) return [];
        const len = d(e, w);
        if (!(len > 1)) return [];
        const ux = (w.x - e.x) / len, uy = (w.y - e.y) / len;
        return [0.15, 0.35, 0.55, 0.75].map(k => ({ t: 'circle', x: w.x + ux * len * k, y: w.y + uy * len * k, r: 0.22 * len }));
    }

    return { BONES, TIPS, PALM, fingersExtended, canWipe, handShapes, wristShapes };
});
