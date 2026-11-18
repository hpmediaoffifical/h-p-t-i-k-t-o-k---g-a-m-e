/* ⚽ Sút Bóng - bộ vẽ 2.5D trên canvas 2D (không thư viện). Overlay nền TRONG SUỐT phủ lên camera: chỉ vẽ khung gôn, lưới,
 * thảm cỏ dưới vạch vôi, đèn sân góc trên, bóng, găng, chữ hiệu ứng.
 *  - Phối cảnh chung với engine: tâm phối cảnh C = giữa vùng thấy, 40 % chiều cao (game.js launch()).
 *  - Bóng = khối cầu 32 mặt (12 ngũ giác + 20 lục giác) xoay 3D thật, chiếu trực giao, đổ bóng + đèn rọi + viền tối.
 *  - Khung gôn: mặt sau co về C (goalBox), cột/xà là khối trụ tô dải sáng; lưới mắt cáo trên 4 mặt, phồng khi bóng vào.
 * Hàm thuần (ballGeometry, rotate, goalBox) có test ở tests/sutbong-render.test.js.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else { root.HpSutBongRender = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    // ---------- hình học thuần ----------
    let GEO = null;
    // Khối cầu 32 mặt = khối hai mươi mặt cắt 1/3 mỗi cạnh: 60 đỉnh, 90 cạnh, 12 ngũ giác (mỗi đỉnh khối 20 mặt → 1 ngũ giác).
    function ballGeometry() {
        if (GEO) return GEO;
        const p = (1 + Math.sqrt(5)) / 2;
        const ico = [];
        for (const a of [-1, 1]) for (const b of [-p, p]) { ico.push([0, a, b], [a, b, 0], [b, 0, a]); }
        const dist = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
        const norm = v => { const L = Math.hypot(v[0], v[1], v[2]); return [v[0] / L, v[1] / L, v[2] / L]; };
        const iEdges = [];
        for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) if (Math.abs(dist(ico[i], ico[j]) - 2) < 1e-9) iEdges.push([i, j]);
        const verts = [], owner = [];
        const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        for (const [i, j] of iEdges) {
            verts.push(norm(lerp(ico[i], ico[j], 1 / 3))); owner.push(i);
            verts.push(norm(lerp(ico[i], ico[j], 2 / 3))); owner.push(j);
        }
        let min = Infinity;
        for (let i = 0; i < 60; i++) for (let j = i + 1; j < 60; j++) min = Math.min(min, dist(verts[i], verts[j]));
        const edges = [];
        for (let i = 0; i < 60; i++) for (let j = i + 1; j < 60; j++) if (dist(verts[i], verts[j]) < min * 1.0001) edges.push([i, j]);
        // ngũ giác: 5 đỉnh cùng chủ, xếp vòng quanh trục của đỉnh khối 20 mặt
        const pents = [];
        for (let k = 0; k < 12; k++) {
            const c = norm(ico[k]);
            const ids = owner.map((o, i) => (o === k ? i : -1)).filter(i => i >= 0);
            const ref = Math.abs(c[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
            const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
            const e1 = norm(cross(c, ref)), e2 = cross(c, e1);
            ids.sort((a, b) => {
                const va = verts[a], vb = verts[b];
                const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
                return Math.atan2(dot(va, e2), dot(va, e1)) - Math.atan2(dot(vb, e2), dot(vb, e1));
            });
            pents.push(ids);
        }
        GEO = { verts, edges, pents, centers: ico.map(norm) };
        return GEO;
    }
    // Xoay quanh trục X (rx) rồi trục Y (ry).
    function rotate(v, rx, ry) {
        const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
        const y1 = v[1] * cx - v[2] * sx, z1 = v[1] * sx + v[2] * cx;
        return [v[0] * cy + z1 * sy, y1, -v[0] * sy + z1 * cy];
    }
    // Khung gôn 3D: mặt trước = vùng khung thành của engine; mặt sau = mặt trước co về tâm phối cảnh theo hệ số k.
    function goalBox(front, C, k) {
        const sc = (x, cx) => cx + (x - cx) * k;
        const bx = sc(front.x, C.x), by = sc(front.y, C.y);
        return { front, back: { x: bx, y: by, w: sc(front.x + front.w, C.x) - bx, h: sc(front.y + front.h, C.y) - by } };
    }

    // ---------- vẽ ----------
    const lerp2 = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    // điểm (u,v) trên tứ giác q = [tl, tr, br, bl]
    function quadAt(q, u, v) { return lerp2(lerp2(q[0], q[1], u), lerp2(q[3], q[2], u), v); }

    // 💡 Dàn đèn sân vận động ở 2 góc trên: khung đèn + vầng sáng + tia chéo (rất nhẹ, không che mặt).
    function drawLights(ctx, view) {
        ctx.save();
        for (const side of [-1, 1]) {
            const x = view.x + view.w / 2 + side * view.w * 0.43, y = view.y + view.h * 0.035;
            ctx.globalCompositeOperation = 'lighter';
            const glow = ctx.createRadialGradient(x, y, 0, x, y, view.w * 0.42);
            glow.addColorStop(0, 'rgba(255,250,225,.42)'); glow.addColorStop(0.18, 'rgba(255,245,210,.14)'); glow.addColorStop(1, 'rgba(255,245,210,0)');
            ctx.fillStyle = glow; ctx.fillRect(x - view.w * 0.42, y - view.w * 0.42, view.w * 0.84, view.w * 0.84);
            // tia sáng rọi xuống khung gôn
            const beam = ctx.createLinearGradient(x, y, view.x + view.w / 2, view.y + view.h * 0.6);
            beam.addColorStop(0, 'rgba(255,248,220,.10)'); beam.addColorStop(1, 'rgba(255,248,220,0)');
            ctx.fillStyle = beam;
            ctx.beginPath(); ctx.moveTo(x, y);
            ctx.lineTo(view.x + view.w / 2 - side * view.w * 0.05, view.y + view.h * 0.62);
            ctx.lineTo(view.x + view.w / 2 + side * view.w * 0.32, view.y + view.h * 0.62);
            ctx.closePath(); ctx.fill();
            // vệt lóa ngang
            const fl = ctx.createLinearGradient(x - 220, y, x + 220, y);
            fl.addColorStop(0, 'rgba(180,210,255,0)'); fl.addColorStop(0.5, 'rgba(220,235,255,.35)'); fl.addColorStop(1, 'rgba(180,210,255,0)');
            ctx.fillStyle = fl; ctx.fillRect(x - 220, y - 2, 440, 4);
            ctx.globalCompositeOperation = 'source-over';
            // khung dàn đèn 4×3 bóng
            const bw = 132, bh = 74;
            ctx.save(); ctx.translate(x, y); ctx.rotate(side * 0.1);
            const panel = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
            panel.addColorStop(0, '#4a5363'); panel.addColorStop(1, '#1b2029');
            ctx.fillStyle = panel; roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 10); ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 3; ctx.stroke();
            for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
                const lx = -bw / 2 + 20 + c * 30.5, ly = -bh / 2 + 15 + r * 22;
                const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 11);
                g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#fff6d5'); g.addColorStop(1, 'rgba(255,230,160,.25)');
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, 10, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        }
        ctx.restore();
    }

    // 🌱 Thảm cỏ từ vạch vôi xuống mép dưới: sọc cắt cỏ hội tụ về tâm phối cảnh, mờ dần lên phía khung gôn.
    function drawPitch(ctx, view, goal, C) {
        const y0 = goal.y + goal.h, y1 = view.y + view.h;
        if (y1 - y0 < 8) return;
        ctx.save();
        ctx.beginPath(); ctx.rect(view.x, y0, view.w, y1 - y0); ctx.clip();
        const base = ctx.createLinearGradient(0, y0, 0, y1);
        base.addColorStop(0, 'rgba(44,122,52,.55)'); base.addColorStop(0.25, 'rgba(40,116,48,.86)'); base.addColorStop(1, 'rgba(30,96,40,.95)');
        ctx.fillStyle = base; ctx.fillRect(view.x, y0, view.w, y1 - y0);
        // sọc: tia từ C qua các điểm chia đều trên vạch vôi
        const n = 14, span = view.w * 2.4, left = C.x - span / 2;
        const at = (x, y) => C.x + (x - C.x) * (y - C.y) / (y0 - C.y);
        for (let i = 0; i < n; i += 2) {
            const xa = left + span * i / n, xb = left + span * (i + 1) / n;
            ctx.fillStyle = 'rgba(120,200,110,.13)';
            ctx.beginPath(); ctx.moveTo(xa, y0); ctx.lineTo(xb, y0); ctx.lineTo(at(xb, y1), y1); ctx.lineTo(at(xa, y1), y1); ctx.closePath(); ctx.fill();
        }
        // bóng đổ của khung gôn trên cỏ (đèn từ trên xuống, hơi về phía camera)
        const sh = ctx.createLinearGradient(0, y0, 0, y0 + 60);
        sh.addColorStop(0, 'rgba(0,0,0,.35)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sh; ctx.fillRect(goal.x - 20, y0, goal.w + 40, 60);
        ctx.restore();
        // vạch vôi (có độ dày phối cảnh)
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,.88)'; ctx.lineWidth = 7; ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.moveTo(view.x + view.w * 0.02, y0); ctx.lineTo(view.x + view.w * 0.98, y0); ctx.stroke();
        // 2 cạnh khu 5m50 chạy về phía camera
        for (const s of [-1, 1]) {
            const gx = goal.x + goal.w / 2 + s * goal.w * 0.82;
            ctx.beginPath(); ctx.moveTo(gx, y0); ctx.lineTo(at(gx, y1), y1); ctx.stroke();
        }
        ctx.restore();
    }

    // Lưới mắt cáo trên tứ giác q. disp(x,y) → [dx,dy] làm lưới phồng khi bóng vào (null = phẳng).
    function netQuad(ctx, q, nu, nv, alpha, disp) {
        const P = (u, v) => { const p = quadAt(q, u, v); if (disp) { const d = disp(p.x, p.y); p.x += d[0]; p.y += d[1]; } return p; };
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        // 2 họ đường chéo = mắt lưới hình thoi
        const steps = 10;
        for (let i = -nv; i <= nu; i++) {
            let first = true;
            for (let s = 0; s <= steps; s++) {
                const t = s / steps, u = (i + t * nv) / nu, v = t;
                if (u < 0 || u > 1) { first = true; continue; }
                const p = P(u, v); if (first) { ctx.moveTo(p.x, p.y); first = false; } else ctx.lineTo(p.x, p.y);
            }
        }
        for (let i = 0; i <= nu + nv; i++) {
            let first = true;
            for (let s = 0; s <= steps; s++) {
                const t = s / steps, u = (i - t * nv) / nu, v = t;
                if (u < 0 || u > 1) { first = true; continue; }
                const p = P(u, v); if (first) { ctx.moveTo(p.x, p.y); first = false; } else ctx.lineTo(p.x, p.y);
            }
        }
        ctx.stroke();
    }

    // Lưới + khung sau (vẽ TRƯỚC người/bóng). ripples: [{x,y,k}] k = 0..1 độ mạnh còn lại.
    function drawNet(ctx, goal, C, ripples) {
        const box = goalBox(goal, C, 0.8), F = box.front, B = box.back;
        const fTL = { x: F.x, y: F.y }, fTR = { x: F.x + F.w, y: F.y }, fBR = { x: F.x + F.w, y: F.y + F.h }, fBL = { x: F.x, y: F.y + F.h };
        const bTL = { x: B.x, y: B.y }, bTR = { x: B.x + B.w, y: B.y }, bBR = { x: B.x + B.w, y: B.y + B.h }, bBL = { x: B.x, y: B.y + B.h };
        // nền tối nhẹ bên trong gôn (chiều sâu) - chỉ phần sàn
        ctx.save();
        const floor = ctx.createLinearGradient(0, B.y + B.h, 0, F.y + F.h);
        floor.addColorStop(0, 'rgba(0,0,0,.18)'); floor.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = floor;
        ctx.beginPath(); ctx.moveTo(bBL.x, bBL.y); ctx.lineTo(bBR.x, bBR.y); ctx.lineTo(fBR.x, fBR.y); ctx.lineTo(fBL.x, fBL.y); ctx.closePath(); ctx.fill();
        const disp = ripples && ripples.length ? (x, y) => {
            let dx = 0, dy = 0;
            for (const r of ripples) {
                const d2 = (x - r.x) ** 2 + (y - r.y) ** 2, f = r.k * Math.exp(-d2 / (2 * 150 * 150));
                // phồng ra sau = co về tâm phối cảnh + rung
                dx += (C.x - x) * 0.16 * f; dy += (C.y - y) * 0.16 * f + 26 * f;
            }
            return [dx, dy];
        } : null;
        ctx.lineWidth = 2;
        netQuad(ctx, [bTL, bTR, bBR, bBL], 16, 12, 0.24, disp);           // lưới sau
        ctx.lineWidth = 1.8;
        netQuad(ctx, [fTL, bTL, bBL, fBL], 4, 12, 0.2, disp);             // hông trái
        netQuad(ctx, [bTR, fTR, fBR, bBR], 4, 12, 0.2, disp);             // hông phải
        netQuad(ctx, [fTL, fTR, bTR, bTL], 16, 4, 0.2, disp);             // nóc
        // khung sau (ống thép mảnh)
        ctx.strokeStyle = 'rgba(200,208,220,.75)'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(fBL.x, fBL.y); ctx.lineTo(bBL.x, bBL.y); ctx.lineTo(bBR.x, bBR.y); ctx.lineTo(fBR.x, fBR.y); ctx.stroke();
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(fTL.x, fTL.y); ctx.lineTo(bTL.x, bTL.y); ctx.lineTo(bBL.x, bBL.y);
        ctx.moveTo(fTR.x, fTR.y); ctx.lineTo(bTR.x, bTR.y); ctx.lineTo(bBR.x, bBR.y); ctx.stroke();
        ctx.restore();
    }

    // Cột + xà mặt trước: khối trụ trắng tô dải sáng (vẽ SAU lưới, trước bóng đang bay).
    function drawPosts(ctx, goal) {
        const pw = Math.max(18, goal.w * 0.026);
        const x0 = goal.x, x1 = goal.x + goal.w, y0 = goal.y, y1 = goal.y + goal.h;
        ctx.save();
        // bóng đổ của cột trên sàn
        for (const x of [x0, x1]) {
            const g = ctx.createRadialGradient(x, y1 + 4, 0, x, y1 + 4, pw * 2.2);
            g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y1 + 4, pw * 2.2, pw * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        }
        const cyl = (horiz, a, b) => {
            const g = horiz ? ctx.createLinearGradient(0, a - pw / 2, 0, a + pw / 2) : ctx.createLinearGradient(a - pw / 2, 0, a + pw / 2, 0);
            g.addColorStop(0, '#7d8794'); g.addColorStop(0.28, '#ffffff'); g.addColorStop(0.5, '#f1f4f8'); g.addColorStop(0.82, '#b7c0cb'); g.addColorStop(1, '#6c7480');
            return g;
        };
        ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
        ctx.fillStyle = cyl(false, x0); ctx.fillRect(x0 - pw / 2, y0, pw, y1 - y0);
        ctx.fillStyle = cyl(false, x1); ctx.fillRect(x1 - pw / 2, y0, pw, y1 - y0);
        ctx.fillStyle = cyl(true, y0); ctx.fillRect(x0 - pw / 2, y0 - pw / 2, x1 - x0 + pw, pw);
        ctx.shadowColor = 'transparent';
        // khớp góc tròn
        for (const x of [x0, x1]) {
            const g = ctx.createRadialGradient(x - pw * 0.15, y0 - pw * 0.2, 1, x, y0, pw * 0.6);
            g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#9aa3ae');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y0, pw * 0.58, 0, Math.PI * 2); ctx.fill();
        }
        // viền mảnh cho rõ trên nền sáng
        ctx.strokeStyle = 'rgba(40,46,56,.45)'; ctx.lineWidth = 1.5;
        ctx.strokeRect(x0 - pw / 2, y0 - pw / 2, x1 - x0 + pw, pw);
        ctx.strokeRect(x0 - pw / 2, y0 + pw / 2, pw, y1 - y0 - pw / 2);
        ctx.strokeRect(x1 - pw / 2, y0 + pw / 2, pw, y1 - y0 - pw / 2);
        ctx.restore();
    }

    const BALL_LOOK = {
        normal: { base: ['#ffffff', '#e6ebf2', '#9aa6b8'], patch: '#151a28', seam: 'rgba(60,70,90,.55)', glow: '' },
        curve: { base: ['#ffffff', '#e2f7f3', '#8fb8b0'], patch: '#0b6c5f', seam: 'rgba(20,90,80,.5)', glow: 'rgba(80,240,210,.7)' },
        rocket: { base: ['#ffffff', '#e4efff', '#8ea8d6'], patch: '#0c3fa8', seam: 'rgba(20,60,140,.5)', glow: 'rgba(110,190,255,.95)' },
        gold: { base: ['#fff8d6', '#ffd659', '#b98500'], patch: '#6e4500', seam: 'rgba(110,70,0,.55)', glow: 'rgba(255,210,80,.95)' }
    };
    // Bóng 32 mặt xoay (rx, ry) tại (x,y) bán kính r.
    function drawBall(ctx, x, y, r, rx, ry, type, alpha) {
        if (r < 1 || alpha <= 0) return;
        const L = BALL_LOOK[type] || BALL_LOOK.normal, G = ballGeometry();
        ctx.save(); ctx.globalAlpha = alpha;
        if (L.glow) { ctx.shadowColor = L.glow; ctx.shadowBlur = r * 0.9; }
        const base = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
        base.addColorStop(0, L.base[0]); base.addColorStop(0.6, L.base[1]); base.addColorStop(1, L.base[2]);
        ctx.fillStyle = base; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, r * 0.995, 0, Math.PI * 2); ctx.clip();
        const V = G.verts.map(v => rotate(v, rx, ry));
        // đường may lục giác (chỉ cạnh quay về phía camera)
        ctx.strokeStyle = L.seam; ctx.lineWidth = Math.max(1, r * 0.035);
        ctx.beginPath();
        for (const [a, b] of G.edges) {
            const va = V[a], vb = V[b];
            if (va[2] <= 0 && vb[2] <= 0) continue;
            ctx.moveTo(x + va[0] * r, y + va[1] * r); ctx.lineTo(x + vb[0] * r, y + vb[1] * r);
        }
        ctx.stroke();
        // 12 miếng ngũ giác (phình nhẹ ra 8 % cho giống miếng da khâu)
        ctx.fillStyle = L.patch;
        for (let k = 0; k < 12; k++) {
            const c = rotate(G.centers[k], rx, ry);
            if (c[2] < -0.2) continue;
            ctx.beginPath();
            G.pents[k].forEach((i, n) => {
                const v = V[i], px = c[0] + (v[0] - c[0]) * 1.08, py = c[1] + (v[1] - c[1]) * 1.08;
                if (n) ctx.lineTo(x + px * r, y + py * r); else ctx.moveTo(x + px * r, y + py * r);
            });
            ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        // khối cầu: tối dần ra viền + đốm sáng đèn
        const rim = ctx.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.45, x, y, r);
        rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(1, 'rgba(10,16,30,.45)');
        ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        const hi = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, 0, x - r * 0.38, y - r * 0.42, r * 0.5);
        hi.addColorStop(0, 'rgba(255,255,255,.85)'); hi.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hi; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = Math.max(1.5, r * 0.03);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
    }

    // Bóng đổ mềm trên mặt đất.
    function drawShadow(ctx, x, y, r, alpha) {
        if (alpha <= 0) return;
        ctx.save(); ctx.globalAlpha = alpha;
        ctx.translate(x, y); ctx.scale(1, 0.28);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, 'rgba(0,0,0,.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    const TRAIL = { normal: [255, 255, 255], curve: [90, 245, 215], rocket: [120, 195, 255], gold: [255, 210, 80] };
    // Vệt bay thuôn dần (dải đa giác) + tia điện cho ⚡.
    function drawTrail(ctx, pts, type, alpha, now) {
        if (pts.length < 3) return;
        const c = TRAIL[type] || TRAIL.normal;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const n = pts.length, L = [], R = [];
        for (let i = 0; i < n; i++) {
            const p = pts[i], q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)];
            let dx = q.x - o.x, dy = q.y - o.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
            const w = p.r * 0.85 * (i / (n - 1));
            L.push({ x: p.x - dy * w, y: p.y + dx * w }); R.push({ x: p.x + dy * w, y: p.y - dx * w });
        }
        const g = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[n - 1].x, pts[n - 1].y);
        g.addColorStop(0, `rgba(${c},0)`); g.addColorStop(1, `rgba(${c},${0.42 * alpha})`);
        ctx.fillStyle = g;
        ctx.beginPath(); L.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i].x, R[i].y);
        ctx.closePath(); ctx.fill();
        if (type === 'rocket') {
            ctx.strokeStyle = `rgba(200,235,255,${0.8 * alpha})`; ctx.lineWidth = 3;
            for (let k = 0; k < 2; k++) {
                ctx.beginPath();
                for (let i = 0; i < n; i++) {
                    const p = pts[i], j = Math.sin(now / 25 + i * 1.7 + k * 3) * p.r * 0.5;
                    if (i) ctx.lineTo(p.x + j, p.y - j * 0.4); else ctx.moveTo(p.x + j, p.y);
                }
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    // 🧤 Găng thủ môn vector, xoay theo hướng ngón (a, radian). side 'L'|'R' lật ngón cái.
    function drawGlove(ctx, x, y, r, a, side, alpha) {
        const s = r / 60;
        ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate((Number.isFinite(a) ? a : -Math.PI / 2) + Math.PI / 2);
        if (side === 'R') ctx.scale(-1, 1);
        ctx.scale(s, s);
        ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
        const body = ctx.createLinearGradient(-40, -70, 40, 50);
        body.addColorStop(0, '#e9ff8a'); body.addColorStop(0.45, '#9be22d'); body.addColorStop(1, '#4f9a12');
        ctx.fillStyle = body; ctx.strokeStyle = '#1b2a0a'; ctx.lineWidth = 3.5;
        // 4 ngón
        const fingers = [[-27, -58, 15, 40], [-9, -70, 16, 50], [9, -68, 16, 48], [26, -56, 15, 38]];
        for (const [fx, fy, fw, fh] of fingers) { roundRect(ctx, fx - fw / 2, fy, fw, fh + 20, fw / 2); ctx.fill(); ctx.stroke(); }
        // ngón cái
        ctx.save(); ctx.translate(-36, 2); ctx.rotate(-0.75); roundRect(ctx, -9, -34, 18, 40, 9); ctx.fill(); ctx.stroke(); ctx.restore();
        // lòng bàn tay
        roundRect(ctx, -38, -20, 76, 64, 22); ctx.fill(); ctx.stroke();
        ctx.shadowColor = 'transparent';
        // vân lòng găng
        ctx.strokeStyle = 'rgba(30,60,10,.35)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-24, 0); ctx.quadraticCurveTo(0, 12, 24, 0); ctx.moveTo(-22, 16); ctx.quadraticCurveTo(0, 26, 22, 16); ctx.stroke();
        // cổ găng tối + quai trắng
        const cuff = ctx.createLinearGradient(0, 40, 0, 70);
        cuff.addColorStop(0, '#2a2f3a'); cuff.addColorStop(1, '#0f1218');
        ctx.fillStyle = cuff; ctx.strokeStyle = '#05070a'; ctx.lineWidth = 3;
        roundRect(ctx, -34, 40, 68, 30, 10); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#f4f6fa'; roundRect(ctx, -30, 49, 60, 9, 4); ctx.fill();
        // bóng sáng
        ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(-14, -8, 14, 22, -0.3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    // 🎯 Vòng ngắm góc sút (bóng nằm chấm phạt đền): 2 vòng + 4 vạch, xoay chậm, co dần theo k (0→1).
    function drawReticle(ctx, x, y, r, k, now) {
        const R = r * (2.3 - 1.2 * k);
        ctx.save(); ctx.translate(x, y); ctx.rotate(now / 900);
        ctx.globalAlpha = 0.35 + 0.55 * k;
        ctx.shadowColor = 'rgba(255,40,80,.9)'; ctx.shadowBlur = 16;
        ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 3; ctx.setLineDash([12, 10]);
        ctx.beginPath(); ctx.arc(0, 0, R * 0.62, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]); ctx.lineWidth = 6;
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8); ctx.lineTo(Math.cos(a) * R * 1.22, Math.sin(a) * R * 1.22); ctx.stroke(); }
        ctx.restore();
    }

    // Chấm phạt đền trên cỏ.
    function drawSpot(ctx, x, y, r) {
        ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.3);
        ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    const TEXT_LOOK = {
        goal: { top: '#fff1a8', mid: '#ff9a3c', bot: '#e8203a', side: '#5a0814', edge: '#ffffff' },
        save: { top: '#f2fff6', mid: '#5cf59a', bot: '#0fae5c', side: '#043b20', edge: '#ffffff' },
        gold: { top: '#fffbe0', mid: '#ffd54a', bot: '#d18a00', side: '#4d3000', edge: '#ffffff' }
    };
    // Chữ khối 3D: đùn sâu + mặt chữ chuyển màu + viền trắng/viền tối.
    function drawText3D(ctx, text, x, y, size, look, scale, alpha) {
        const L = TEXT_LOOK[look] || TEXT_LOOK.goal;
        ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.translate(x, y); ctx.scale(scale || 1, scale || 1);
        ctx.font = `900 ${size}px "Segoe UI", Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
        const depth = Math.round(size * 0.12);
        ctx.fillStyle = L.side;
        for (let i = depth; i > 0; i--) ctx.fillText(text, 0, i);
        ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = size * 0.25; ctx.shadowOffsetY = depth;
        ctx.lineWidth = size * 0.16; ctx.strokeStyle = L.side; ctx.strokeText(text, 0, 0);
        ctx.shadowColor = 'transparent';
        ctx.lineWidth = size * 0.08; ctx.strokeStyle = L.edge; ctx.strokeText(text, 0, 0);
        const g = ctx.createLinearGradient(0, -size * 0.5, 0, size * 0.5);
        g.addColorStop(0, L.top); g.addColorStop(0.5, L.mid); g.addColorStop(1, L.bot);
        ctx.fillStyle = g; ctx.fillText(text, 0, 0);
        // vệt bóng loáng nửa trên
        ctx.save(); ctx.beginPath(); ctx.rect(-size * 6, -size * 0.55, size * 12, size * 0.42); ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillText(text, 0, 0); ctx.restore();
        ctx.restore();
    }

    // Nhãn tên người tặng: viên thuốc tối, chữ trắng - đọc rõ trên mọi nền camera.
    function drawNameTag(ctx, text, x, y, size, accent) {
        ctx.save();
        ctx.font = `800 ${size}px "Segoe UI", Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const w = Math.min(ctx.measureText(text).width, size * 16) + size * 1.2, h = size * 1.55;
        ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
        ctx.fillStyle = 'rgba(10,14,24,.82)'; roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2); ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = accent || 'rgba(255,255,255,.35)'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillText(text, x, y + 1, size * 16);
        ctx.restore();
    }

    function roundRect(ctx, x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }

    return { ballGeometry, rotate, goalBox, drawLights, drawPitch, drawNet, drawPosts, drawBall, drawShadow, drawTrail, drawGlove,
        drawReticle, drawSpot, drawText3D, drawNameTag, roundRect, BALL_LOOK };
});
