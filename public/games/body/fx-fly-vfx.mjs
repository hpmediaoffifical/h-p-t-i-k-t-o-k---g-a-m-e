/* 💥 VFX 2.5D của 🐉 Bay chưởng (fx-morph-fly.mjs) - user 2026-10-28 "va chạm, chưởng, nứt chưa đẹp → 2.5D / 3D, chuyên nghiệp, cảm giác game".
 * Ngôn ngữ hình học từ game đối kháng / anime: tia va chạm (lõi trắng + gai nhọn + vòng sóng méo + mảnh thoi văng), giật camera + tách màu RGB
 * lúc va chạm; chưởng = trụ năng lượng nhiều lớp (vỏ xanh → lõi trắng) + dòng chảy dọc trục + 2 dải xoắn ốc quấn quanh có chiều sâu (trước sáng,
 * sau mờ) + đầu chưởng hình cầu có vòng quỹ đạo 3D + loá ống kính ngang; kính nứt = các mảnh khúc xạ lệch hình phía sau + mặt cắt sáng tối +
 * lỗ thủng tâm + vệt loá quét.
 * Canvas 2D thuần, không trạng thái (mọi thứ tính theo thời gian / hạt giống) trừ ảnh chụp màn dùng lại (OFF / CH*). */

export function createFlyVfx(ctx, W, H) {
    const TAU = Math.PI * 2;
    const clamp01 = t => t < 0 ? 0 : t > 1 ? 1 : t;
    const lerp = (a, b, k) => a + (b - a) * k;
    const easeOut = t => 1 - (1 - t) * (1 - t);
    const hash = i => { const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };
    const rgb = hex => { const n = parseInt(String(hex || '#ffffff').slice(1), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const rgba = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = 8; return { c, x: c.getContext('2d') }; };
    const OFF = mk(), CR = mk(), CG = mk(), CB = mk();
    // chụp nguyên màn hiện tại (toạ độ thật, bỏ qua phép dời / phóng đang đặt)
    function grab(D) {
        const cv = ctx.canvas;
        if (D.c.width !== cv.width || D.c.height !== cv.height) { D.c.width = cv.width; D.c.height = cv.height; } else D.x.clearRect(0, 0, cv.width, cv.height);
        D.x.drawImage(cv, 0, 0);
        return D;
    }

    // =====================================================================================================================
    // 💥 TIA VA CHẠM (hit spark): k 0..1 tiến trình, seed cố định mỗi cú (gai không nhảy hình giữa các khung)
    // =====================================================================================================================
    function hit(x, y, r, k, col, seed) {
        if (k < 0 || k >= 1 || r <= 0) return;
        const ga = 1 - k, grow = easeOut(clamp01(k * 4)), rot = hash(seed) * TAU;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        // quầng màu
        let g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.5);
        g.addColorStop(0, rgba(col, 0.55 * ga)); g.addColorStop(0.5, rgba(col, 0.18 * ga)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.5, 0, TAU); ctx.fill();
        // gai nhọn: lớp màu rộng + lõi trắng hẹp; dài ra rất nhanh rồi mảnh dần
        const n = 11;
        for (let pass = 0; pass < 2; pass++) {
            ctx.fillStyle = pass ? `rgba(255,255,255,${0.95 * ga})` : rgba(col, 0.9 * ga);
            for (let i = 0; i < n; i++) {
                const an = rot + i / n * TAU + (hash(seed + i * 3) - 0.5) * 0.45, long = i % 3 === 0 ? 1.35 : 0.7 + hash(seed + i) * 0.5;
                const len = r * long * grow * (1 + k * 0.25) * (pass ? 0.8 : 1), wid = r * 0.1 * (1 - k * 0.85) * (pass ? 0.4 : 1) * (0.6 + hash(seed + i * 7) * 0.8);
                const ca = Math.cos(an), sa = Math.sin(an), b0 = r * 0.06;
                ctx.beginPath();
                ctx.moveTo(x + ca * b0 - sa * wid, y + sa * b0 + ca * wid);
                ctx.lineTo(x + ca * len, y + sa * len);
                ctx.lineTo(x + ca * b0 + sa * wid, y + sa * b0 - ca * wid);
                ctx.lineTo(x - ca * wid * 0.5, y - sa * wid * 0.5);
                ctx.closePath(); ctx.fill();
            }
        }
        // lõi trắng nóng
        const cr = r * 0.34 * Math.sqrt(1 - k);
        g = ctx.createRadialGradient(x, y, 0, x, y, cr);
        g.addColorStop(0, `rgba(255,255,255,${ga})`); g.addColorStop(0.6, `rgba(255,255,240,${0.8 * ga})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, cr, 0, TAU); ctx.fill();
        // vòng sóng: 1 vòng tròn mảnh sáng + 1 vòng elip méo nghiêng (cảm giác 3D)
        const rr = r * (0.3 + easeOut(k) * 1.25);
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * ga})`; ctx.lineWidth = Math.max(1.5, r * 0.045 * ga);
        ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke();
        ctx.strokeStyle = rgba(col, 0.7 * ga); ctx.lineWidth = Math.max(2, r * 0.08 * ga);
        ctx.beginPath(); ctx.ellipse(x, y, rr * 1.25, rr * 0.38, rot, 0, TAU); ctx.stroke();
        // mảnh thoi văng ra
        ctx.fillStyle = `rgba(255,250,230,${ga})`;
        for (let i = 0; i < 9; i++) {
            const an = hash(seed + 40 + i) * TAU, d = r * (0.3 + easeOut(k) * (0.9 + hash(seed + 50 + i) * 0.9)), s = r * 0.05 * (1 - k);
            const px = x + Math.cos(an) * d, py = y + Math.sin(an) * d;
            ctx.beginPath(); ctx.moveTo(px + Math.cos(an) * s * 3, py + Math.sin(an) * s * 3); ctx.lineTo(px - Math.sin(an) * s, py + Math.cos(an) * s);
            ctx.lineTo(px - Math.cos(an) * s * 2, py - Math.sin(an) * s * 2); ctx.lineTo(px + Math.sin(an) * s, py - Math.cos(an) * s); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
    }

    // =====================================================================================================================
    // 🪐 VÒNG QUỸ ĐẠO 3D quanh một tâm: elip nghiêng xoay; nửa sau mờ mảnh, nửa trước sáng dày. side: -1 = chỉ vẽ nửa sau, 1 = nửa trước.
    // NHẸ (2026-10-28): mỗi nửa = MỘT đường stroke (trước đây 40 đoạn × 2 lớp = 240 nét / cầu → khung giật lúc bắn chưởng)
    // =====================================================================================================================
    function orbit(x, y, R, tilt, spin, t, col, a, side, lw) {
        const ct = Math.cos(tilt), st = Math.sin(tilt), cs = Math.cos(spin), sn = Math.sin(spin), N = 24;
        const p = th => { const ex = Math.cos(th) * R, ey = Math.sin(th) * R * ct; return [x + ex * cs - ey * sn, y + ex * sn + ey * cs]; };
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        ctx.strokeStyle = rgba(col, a * (side < 0 ? 0.35 : 1)); ctx.lineWidth = lw * (side < 0 ? 0.5 : 1);
        ctx.beginPath();
        let pen = false;
        for (let i = 0; i <= N; i++) {
            const th = i / N * TAU, depth = Math.sin(th) * st, [px, py] = p(th);
            if ((side < 0) !== (depth < 0)) { pen = false; continue; }
            pen ? ctx.lineTo(px, py) : ctx.moveTo(px, py); pen = true;
        }
        ctx.stroke();
        // hạt sáng chạy trên vòng (chỉ khi ở nửa đang vẽ)
        const th = t * 5 + tilt * 3, depth = Math.sin(th) * st;
        if ((side < 0) === (depth < 0)) {
            const [px, py] = p(th), pr = Math.min(lw * 1.6, 10);
            const g = ctx.createRadialGradient(px, py, 0, px, py, pr * 2.5);
            g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, rgba(col, 0));
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, pr * 2.5, 0, TAU); ctx.fill();
        }
        ctx.restore();
    }
    // loá ống kính ngang (anamorphic flare) qua (x, y)
    function flare(x, y, len, th, a, col) {
        if (a <= 0) return;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(x - len, 0, x + len, 0);
        g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.42, rgba(col, 0.35 * a)); g.addColorStop(0.5, `rgba(255,255,255,${0.9 * a})`); g.addColorStop(0.58, rgba(col, 0.35 * a)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, len, th, 0, 0, TAU); ctx.fill();
        ctx.restore();
    }
    // quả cầu năng lượng (cầu chưởng / đầu chưởng): quầng · vòng quỹ đạo sau · lõi cầu · vòng quỹ đạo trước · loá.
    // Cầu TO (đầu chưởng sát mặt, r > 1/3 khung): bỏ quầng + loá (đã ra ngoài màn, chỉ tốn một lần tô kín màn), vòng quỹ đạo mờ dần.
    function sphere(x, y, r, a, t, flareLen) {
        const B = '#7fd4ff', D = '#2a8cff', big = clamp01((r - H * 0.12) / (H * 0.18));
        const ra = a * (1 - big), lw = Math.max(1.5, Math.min(r * 0.06, 7));
        if (big < 1) {
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            const gr = Math.min(r * 3.2, Math.max(W, H) * 0.6);
            let g = ctx.createRadialGradient(x, y, 0, x, y, gr);
            g.addColorStop(0, rgba(B, 0.45 * a * (1 - big))); g.addColorStop(0.4, rgba(D, 0.18 * a * (1 - big))); g.addColorStop(1, rgba(D, 0));
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, gr, 0, TAU); ctx.fill();
            ctx.restore();
        }
        const rings = [[1.1, 0.4], [1.25, -0.7], [1.45, 1.6]];
        if (ra > 0.02) rings.forEach(([tl, sp], i) => orbit(x, y, r * (1.5 + i * 0.25), tl, sp + t * (1.4 + i * 0.6) * (i % 2 ? -1 : 1), t, i === 1 ? '#ffffff' : B, ra * 0.8, -1, lw));
        ctx.save();
        const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.25, 0, x, y, r);
        g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.4, `rgba(228,248,255,${a})`); g.addColorStop(0.78, rgba(B, a)); g.addColorStop(1, rgba(D, 0.85 * a));
        ctx.fillStyle = g;
        ctx.beginPath();
        for (let i = 0; i <= 48; i++) { const an = i / 48 * TAU, rr = r * (1 + 0.05 * Math.sin(an * 6 + t * 16) + 0.03 * Math.sin(an * 11 - t * 23)); i ? ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr) : ctx.moveTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
        ctx.closePath(); ctx.fill();
        ctx.restore();
        if (ra > 0.02) rings.forEach(([tl, sp], i) => orbit(x, y, r * (1.5 + i * 0.25), tl, sp + t * (1.4 + i * 0.6) * (i % 2 ? -1 : 1), t, i === 1 ? '#ffffff' : B, ra, 1, lw));
        // viền sáng quanh cầu
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(B, 0.6 * a); ctx.lineWidth = Math.max(2, Math.min(r * 0.06, 14));
        ctx.beginPath(); ctx.arc(x, y, r * 1.02, 0, TAU); ctx.stroke();
        ctx.restore();
        if (flareLen && big < 1) flare(x, y, flareLen, Math.max(2, r * 0.06), a * (1 - big), B);
    }

    // =====================================================================================================================
    // 🌊 CHƯỞNG 2.5D: trụ năng lượng từ tay (sx, sy, r0) tới đầu chưởng (cx, cy, R) đang lao về phía người xem.
    // NHẸ: 2 dải xoắn = 4 đường stroke (trước / sau mỗi dải) thay vì 140 đoạn; số vòng xoắn giảm khi đầu chưởng đã to (phần lớn ngoài màn).
    // =====================================================================================================================
    function cone(sx, sy, r0, cx, cy, R) {
        const dx = cx - sx, dy = cy - sy, d = Math.hypot(dx, dy);
        if (d <= Math.abs(R - r0) + 1) return false;
        const base = Math.atan2(dy, dx), off = Math.acos(Math.max(-1, Math.min(1, (R - r0) / d)));
        ctx.beginPath();
        ctx.arc(sx, sy, r0, base + off, base - off + TAU, false);
        ctx.lineTo(cx + Math.cos(base - off) * R, cy + Math.sin(base - off) * R);
        ctx.arc(cx, cy, R, base - off, base + off, false);
        ctx.closePath();
        return true;
    }
    function beam(sx, sy, r0, cx, cy, R, a, t) {
        if (a <= 0) return;
        const B = '#7fd4ff', D = '#2a8cff';
        const dx = cx - sx, dy = cy - sy, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
        const at = (s, lat) => { const r = lerp(r0, R, s); return [sx + dx * s + nx * lat * r, sy + dy * s + ny * lat * r]; };
        const big = clamp01((R - H * 0.12) / (H * 0.18));
        // thân trụ: các vỏ lồng nhau (ngoài xanh đậm mờ → xanh → xanh nhạt → lõi trắng) = đổ bóng hình trụ
        ctx.save();
        for (const [k, c, al, op] of [[1.35, D, 0.35, 'lighter'], [1, D, 0.9, 'source-over'], [0.72, B, 0.95, 'source-over'], [0.42, '#e6f8ff', 1, 'source-over'], [0.2, '#ffffff', 1, 'source-over']]) {
            ctx.globalCompositeOperation = op;
            if (!cone(sx, sy, r0 * k, cx, cy, R * k)) continue;
            ctx.fillStyle = rgba(c, al * a); ctx.fill();
        }
        ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        // dòng năng lượng chảy dọc trục (từ tay ra) - một đường cho cả 12 vạch
        ctx.strokeStyle = `rgba(235,250,255,${0.55 * a})`; ctx.lineWidth = Math.max(1.5, lerp(r0, R, 0.6) * 0.05);
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
            const lat = (hash(i) - 0.5) * 1.5, p0 = (t * (1.6 + hash(i + 3)) + hash(i + 7)) % 1, p1 = Math.min(1, p0 + 0.1 + hash(i + 9) * 0.12);
            const [x0, y0] = at(p0, lat), [x1, y1] = at(p1, lat);
            ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
        }
        ctx.stroke();
        // 2 dải xoắn ốc quấn quanh trụ: nửa trước sáng dày, nửa sau mờ mảnh → chiều sâu 3D
        const turns = lerp(5, 2.5, big), N = Math.round(lerp(44, 20, big)), lwm = lerp(r0, R, 0.55);
        for (let hlx = 0; hlx < 2; hlx++) for (const front of [false, true]) {
            ctx.strokeStyle = front ? `rgba(255,255,255,${0.85 * a})` : rgba(B, 0.3 * a);
            ctx.lineWidth = Math.max(1.5, lwm * (front ? 0.07 : 0.035));
            ctx.beginPath();
            let pen = false;
            for (let i = 0; i <= N; i++) {
                const s = i / N, th = s * turns * TAU - t * 14 + hlx * Math.PI;
                if ((Math.cos(th) > 0) !== front) { pen = false; continue; }
                const [px, py] = at(s, Math.sin(th) * 1.08);
                pen ? ctx.lineTo(px, py) : ctx.moveTo(px, py); pen = true;
            }
            ctx.stroke();
        }
        ctx.restore();
        // đầu chưởng: cầu năng lượng + vòng quỹ đạo 3D + loá ngang
        sphere(cx, cy, R, a, t, Math.max(W, H) * 0.6);
        // cung xoáy trên mặt đầu chưởng
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (let i = 0; i < 10; i++) {
            const rr = R * (0.25 + hash(i + 3) * 0.7), sp = 5 - rr / R * 3, st = hash(i) * TAU + t * sp * (i % 2 ? 1 : -1);
            ctx.strokeStyle = i % 3 ? `rgba(200,240,255,${0.5 * a})` : `rgba(255,255,255,${0.75 * a})`; ctx.lineWidth = Math.max(2, R * (0.012 + hash(i + 5) * 0.018));
            ctx.beginPath(); ctx.arc(cx, cy, rr, st, st + 0.5 + hash(i + 9) * 0.8); ctx.stroke();
        }
        ctx.restore();
    }

    // =====================================================================================================================
    // 🪟 KÍNH VỠ: mảnh kính khúc xạ (lệch hình phía sau) + mặt cắt sáng tối + đường nứt thon dần + lỗ thủng tâm + vệt loá quét
    // =====================================================================================================================
    function makeGlass(cx, cy, R) {
        const n = 14, rays = [];
        for (let i = 0; i < n; i++) {
            const an = (i + 0.2 + Math.random() * 0.6) / n * TAU, len = R * (0.55 + Math.random() * 0.7), pts = [[cx, cy]];
            let r = 0;
            while (r < len) { r += R * (0.04 + Math.random() * 0.07); const a = an + (Math.random() - 0.5) * 0.16; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
            rays.push(pts);
        }
        // vòng nứt ở 3 bán kính; điểm vòng = điểm trên tia gần bán kính đó nhất
        const near = (pts, rad) => { let best = pts[1], bd = 1e9; for (const p of pts) { const dd = Math.abs(Math.hypot(p[0] - cx, p[1] - cy) - rad); if (dd < bd) { bd = dd; best = p; } } return best; };
        const radii = [R * 0.07, R * 0.17, R * 0.33, R * 0.55];
        const rings = radii.map(rad => rays.map(p => near(p, rad)));
        const cells = [];
        for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < n; i++) {
            const i2 = (i + 1) % n, an = Math.atan2(rings[j][i][1] - cy, rings[j][i][0] - cx), push = (3 - j) * (2 + Math.random() * 4);
            cells.push({ pts: [rings[j][i], rings[j][i2], rings[j + 1][i2], rings[j + 1][i]], dx: Math.cos(an) * push + (Math.random() - 0.5) * 3, dy: Math.sin(an) * push + (Math.random() - 0.5) * 3,
                tint: Math.random(), j });
        }
        const hole = []; for (let i = 0; i < 11; i++) { const an = i / 11 * TAU, rr = R * (0.035 + Math.random() * 0.035); hole.push([cx + Math.cos(an) * rr, cy + Math.sin(an) * rr]); }
        return { cx, cy, R, rays, rings, cells, hole };
    }
    const poly = pts => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); };
    function glass(G, a, t) {
        if (!G || a <= 0) return;
        // chụp màn ở NỬA độ phân giải (2026-10-28: chụp cỡ thật + 39 mảnh mỗi khung = khung giật) - khúc xạ vốn lệch vài px, không thấy khác
        const cv = ctx.canvas, hw = Math.ceil(cv.width * CH_SC), hh = Math.ceil(cv.height * CH_SC);
        if (OFF.c.width !== hw || OFF.c.height !== hh) { OFF.c.width = hw; OFF.c.height = hh; }
        OFF.x.globalCompositeOperation = 'copy'; OFF.x.drawImage(cv, 0, 0, hw, hh); OFF.x.globalCompositeOperation = 'source-over';
        ctx.save();
        const tr = ctx.getTransform();
        // 1) khúc xạ: mỗi mảnh (2 vòng trong, vòng ngoài chỉ nhuộm) vẽ lại ảnh phía sau lệch vài px (ảnh chụp theo toạ độ thật → dán ở phép biến đổi gốc)
        for (const c of G.cells) {
            ctx.save(); poly(c.pts); ctx.clip();
            if (c.j < 2) {
                ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = a;
                ctx.drawImage(OFF.c, 0, 0, hw, hh, c.dx * a, c.dy * a, cv.width, cv.height);
            }
            ctx.setTransform(tr);
            // mặt cắt: sáng / tối khác nhau theo mảnh + dải phản chiếu chéo
            ctx.fillStyle = c.tint > 0.55 ? `rgba(255,255,255,${(0.06 + (c.tint - 0.55) * 0.35) * a})` : `rgba(10,30,60,${(0.04 + c.tint * 0.1) * a})`;
            ctx.fill();
            ctx.restore();
        }
        // 2) đường nứt: bóng tối lệch + chỉ trắng sáng, thon dần ra xa tâm
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const base = Math.max(1.2, H / 420);
        for (const [col, mul, off] of [['rgba(0,0,0,', 2.2, base * 0.8], ['rgba(255,255,255,', 1, 0]]) {
            for (const pts of G.rays) for (let i = 1; i < pts.length; i++) {
                const k = 1 - i / pts.length;
                ctx.strokeStyle = col + ((off ? 0.4 : 0.95) * a) + ')'; ctx.lineWidth = base * mul * (0.5 + k * 1.6);
                ctx.beginPath(); ctx.moveTo(pts[i - 1][0] + off, pts[i - 1][1] + off); ctx.lineTo(pts[i][0] + off, pts[i][1] + off); ctx.stroke();
            }
            for (let j = 0; j < G.rings.length; j++) {
                ctx.strokeStyle = col + ((off ? 0.35 : 0.8) * a) + ')'; ctx.lineWidth = base * mul * (1.2 - j * 0.2);
                ctx.beginPath(); G.rings[j].forEach((p, i) => (i ? ctx.lineTo(p[0] + off, p[1] + off) : ctx.moveTo(p[0] + off, p[1] + off))); ctx.closePath(); ctx.stroke();
            }
        }
        // 3) lỗ thủng tâm: tối, viền sáng sắc
        poly(G.hole);
        const hg = ctx.createRadialGradient(G.cx, G.cy, 0, G.cx, G.cy, G.R * 0.07);
        hg.addColorStop(0, `rgba(5,10,20,${0.85 * a})`); hg.addColorStop(1, `rgba(40,60,90,${0.5 * a})`);
        ctx.fillStyle = hg; ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${0.95 * a})`; ctx.lineWidth = base * 1.6; ctx.stroke();
        // 4) vệt loá quét chéo qua mặt kính
        const sw = ((t * 0.45) % 1.6) - 0.3, x0 = G.cx - G.R + sw * G.R * 2;
        const lg = ctx.createLinearGradient(x0, G.cy - G.R, x0 + G.R * 0.5, G.cy + G.R);
        lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, `rgba(255,255,255,${0.22 * a})`); lg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = lg;
        for (const c of G.cells) if (c.j < 2) { poly(c.pts); ctx.fill(); }
        ctx.restore();
    }

    // =====================================================================================================================
    // 🎮 TÁCH MÀU RGB (chromatic aberration) cả màn - chỉ trong khoảnh khắc va chạm (amt px, 0 = bỏ)
    // =====================================================================================================================
    // NHẸ (2026-10-28): làm ở NỬA độ phân giải (4 bản sao màn mỗi khung ở cỡ thật = khung giật) rồi phóng lên - hiệu ứng vốn nhoè, không thấy khác
    const CH_SC = 0.5;
    function chroma(amt) {
        if (amt < 0.8) return;
        const cv = ctx.canvas, w = Math.ceil(cv.width * CH_SC), h = Math.ceil(cv.height * CH_SC);
        const sz = D => { if (D.c.width !== w || D.c.height !== h) { D.c.width = w; D.c.height = h; } };
        sz(OFF); OFF.x.globalCompositeOperation = 'copy'; OFF.x.drawImage(cv, 0, 0, w, h); OFF.x.globalCompositeOperation = 'source-over';
        const chan = (D, col) => {
            sz(D);
            D.x.globalCompositeOperation = 'copy'; D.x.drawImage(OFF.c, 0, 0);
            D.x.globalCompositeOperation = 'multiply'; D.x.fillStyle = col; D.x.fillRect(0, 0, w, h);
            D.x.globalCompositeOperation = 'destination-in'; D.x.drawImage(OFF.c, 0, 0);
            D.x.globalCompositeOperation = 'source-over';
        };
        chan(CR, '#ff0000'); chan(CG, '#00ff00'); chan(CB, '#0000ff');
        const a = amt * CH_SC;
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true;
        ctx.globalCompositeOperation = 'copy'; ctx.drawImage(CG.c, 0, 0, w, h, 0, 0, cv.width, cv.height);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(CR.c, 0, 0, w, h, -a * 2, 0, cv.width, cv.height); ctx.drawImage(CB.c, 0, 0, w, h, a * 2, a * 0.6, cv.width, cv.height);
        ctx.restore();
    }

    // cấp sẵn 4 ảnh cỡ màn (chụp màn / 3 kênh màu) - lần va chạm đầu không phải xin vùng nhớ giữa lượt
    function warm() {
        const cv = ctx.canvas, w = Math.ceil(cv.width * CH_SC), h = Math.ceil(cv.height * CH_SC);
        for (const D of [OFF, CR, CG, CB]) {
            if (D.c.width !== w || D.c.height !== h) { D.c.width = w; D.c.height = h; }
            D.x.fillStyle = '#000'; D.x.fillRect(0, 0, 1, 1); D.x.clearRect(0, 0, 1, 1);
        }
    }
    return { hit, orbit, flare, sphere, beam, makeGlass, glass, chroma, warm };
}
