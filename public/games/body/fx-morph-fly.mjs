/* 🐉 BAY CHƯỞNG - kiểu 'fly' của ✨ Biến Hình (fx-morph.mjs), ý tưởng user 2026-10-28:
 *   3 lớp: SAU = trời xanh, mây, núi, đồi cây (vẽ bằng mã) · GIỮA = NPC · TRƯỚC = dãy toà nhà che 1/3 dưới khung cam.
 *   NPC (cam) mờ dần ẩn hẳn → hào quang vàng loé lên sau mái, đá vụn bay lên → NPC cưỡi mây 3D bay lên TỪ TỪ từ sau dãy nhà kiểu Songoku
 *   → ra đòn (sc.act, 'random' = bốc mỗi lượt một kiểu, không lặp lượt trước):
 *     🌊 beam  - gom chưởng xanh trước ngực rồi bắn THẲNG vào màn hình (đĩa sáng lớn dần trùm kín, rung, loá trắng)
 *     🚀 dive  - lấy đà rồi lao thẳng vào màn hình: dính bẹp lên "kính" nứt toác, trượt xuống, bay lại từ sau toà nhà
 *     🥊 fight - bản sao bóng tối (chính NPC, nhuộm tím, lật gương) hiện ra: đấm nhau 3-5 hiệp chớp nhoáng, cú chót đá văng nó vào núi, nổ
 *   → hạ xuống khuất sau dãy nhà, cảnh tan, cam hiện lại.
 * Mốc = HpBody.morphPlan (core.cjs): sceneB · hide · riseA · riseB(=actA) · actB(=backA) · land · end.
 * NHẸ: cảnh (trời / núi / cây / mây / toà nhà) vẽ MỘT lần mỗi lượt vào canvas phụ rồi chỉ dán; người chụp vào canvas nhỏ một lần mỗi khung
 * (hào quang = bản tô màu của chính nó, thu nhỏ + làm mờ trên canvas nhỏ rồi phóng to). Không WebGL, không shadowBlur. */

import { createFlyVfx } from './fx-fly-vfx.mjs';

export function createFly(h) {
    const { ctx, W, H } = h;
    const TAU = Math.PI * 2;
    const clamp01 = t => t < 0 ? 0 : t > 1 ? 1 : t;
    const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
    const lerp = (a, b, k) => a + (b - a) * k;
    const easeIn = t => t * t, easeOut = t => 1 - (1 - t) * (1 - t);
    const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const hash = i => { const s = Math.sin(i * 12.9898 + 4.1414) * 43758.5453; return s - Math.floor(s); };
    const rgb = hex => { const n = parseInt(String(hex || '#ffffff').slice(1), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const rgba = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };
    const canvas = (w, hh) => { const c = document.createElement('canvas'); c.width = Math.max(2, Math.ceil(w)); c.height = Math.max(2, Math.ceil(hh)); return c; };
    const mk = () => { const c = canvas(8, 8); return { c, x: c.getContext('2d') }; };
    const fit = (C, w, hh) => { if (C.c.width !== w || C.c.height !== hh) { C.c.width = w; C.c.height = hh; } else C.x.clearRect(0, 0, w, hh); };
    // PC = người chụp (mỗi khung) · SIL = bóng tô màu hào quang · CL = bản sao bóng tối · CSIL = bóng tím của bản sao · AU / CAU = quầng mờ
    const PC = mk(), SIL = mk(), CL = mk(), CSIL = mk(), AU = mk(), CAU = mk(), WS = mk(), BLU = mk();     // WS = bóng trắng / đen khung va chạm · BLU = ánh chưởng xanh rọi lên người
    const ACTS = ['beam', 'dive', 'fight'];
    const vfx = createFlyVfx(ctx, W, H);      // 💥 va chạm / chưởng 2.5D / kính vỡ / tách màu
    let lastAct = '';
    const SCN = { key: '', seed: 0, bg: null, fg: null, fgTop: 0, clouds: [] };

    // =====================================================================================================================
    // 🏞 CẢNH (vẽ một lần mỗi lượt)
    // =====================================================================================================================
    function ridge(R, w, n, base, amp, rough) {
        const ph = [R() * TAU, R() * TAU, R() * TAU], fr = [1.1 + R() * 0.8, 2.6 + R() * 1.6, 6 + R() * 4], pts = [];
        for (let i = 0; i <= n; i++) {
            const u = i / n;
            let y = Math.sin(u * fr[0] * Math.PI + ph[0]) * 0.55 + Math.sin(u * fr[1] * Math.PI + ph[1]) * 0.3 + Math.sin(u * fr[2] * Math.PI + ph[2]) * 0.15;
            y += (R() - 0.5) * rough;
            pts.push([u * w, base - (y * 0.5 + 0.5) * amp]);
        }
        return pts;
    }
    function fillRidge(x, pts, bottom, fill) {
        x.beginPath(); x.moveTo(pts[0][0], bottom);
        for (const p of pts) x.lineTo(p[0], p[1]);
        x.lineTo(pts[pts.length - 1][0], bottom); x.closePath();
        x.fillStyle = fill; x.fill();
    }
    // mặt dốc hướng nắng (nắng chiếu từ phải trên) sáng, dốc khuất tối - mỗi đoạn sườn một dải mờ dần xuống
    function shadeRidge(x, pts, depth, lit, dark) {
        for (let i = 0; i < pts.length - 1; i++) {
            const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], up = y1 < y0;
            const g = x.createLinearGradient(0, Math.min(y0, y1), 0, Math.max(y0, y1) + depth);
            g.addColorStop(0, up ? lit : dark); g.addColorStop(1, 'rgba(0,0,0,0)');
            x.fillStyle = g;
            x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.lineTo(x1, y1 + depth); x.lineTo(x0, y0 + depth); x.closePath(); x.fill();
        }
    }
    // tán cây tròn kiểu hoạt hình: 3-4 cụm tròn, tối dưới, sáng phía trên phải
    function tree(x, R, cx, by, r, dark, mid, light) {
        if (R() < 0.3) {     // cây thông
            const hh = r * 2.6;
            x.fillStyle = dark; x.beginPath(); x.moveTo(cx, by - hh); x.lineTo(cx + r * 0.75, by); x.lineTo(cx - r * 0.75, by); x.closePath(); x.fill();
            x.fillStyle = mid; x.beginPath(); x.moveTo(cx, by - hh); x.lineTo(cx + r * 0.75, by); x.lineTo(cx + r * 0.1, by); x.closePath(); x.fill();
            return;
        }
        const blobs = [[0, -r * 0.9, r], [-r * 0.7, -r * 0.5, r * 0.75], [r * 0.7, -r * 0.5, r * 0.75], [0, -r * 1.55, r * 0.7]];
        x.fillStyle = dark;
        for (const [dx, dy, rr] of blobs) { x.beginPath(); x.arc(cx + dx, by + dy, rr, 0, TAU); x.fill(); }
        x.fillStyle = mid;
        for (const [dx, dy, rr] of blobs) { x.beginPath(); x.arc(cx + dx + rr * 0.15, by + dy - rr * 0.15, rr * 0.78, 0, TAU); x.fill(); }
        x.fillStyle = light;
        for (const [dx, dy, rr] of blobs) { x.beginPath(); x.arc(cx + dx + rr * 0.32, by + dy - rr * 0.35, rr * 0.38, 0, TAU); x.fill(); }
    }
    function bgSprite(w, hh, R) {
        const c = canvas(w, hh), x = c.getContext('2d'), hz = hh * 0.62;
        // trời: xanh đậm trên → nhạt dần về chân trời
        let g = x.createLinearGradient(0, 0, 0, hz);
        g.addColorStop(0, '#1b63c9'); g.addColorStop(0.5, '#4fa3ea'); g.addColorStop(0.85, '#a9dcfb'); g.addColorStop(1, '#e2f5ff');
        x.fillStyle = g; x.fillRect(0, 0, w, hh);
        // nắng phía trên phải
        const sx = w * (0.72 + R() * 0.2), sy = hh * 0.12;
        g = x.createRadialGradient(sx, sy, 0, sx, sy, hh * 0.55);
        g.addColorStop(0, 'rgba(255,253,235,.95)'); g.addColorStop(0.12, 'rgba(255,248,215,.55)'); g.addColorStop(1, 'rgba(255,240,200,0)');
        x.fillStyle = g; x.fillRect(0, 0, w, hh);
        // núi xa (tím xanh, mờ sương) → núi gần (xanh lam) → sương chân núi → đồi xanh → hàng cây
        const far = ridge(R, w, 70, hz - hh * 0.02, hh * 0.3, 0.1);
        g = x.createLinearGradient(0, hz - hh * 0.32, 0, hz); g.addColorStop(0, '#a7b8dc'); g.addColorStop(1, '#c9d9ef');
        fillRidge(x, far, hh, g);
        shadeRidge(x, far, hh * 0.1, 'rgba(255,255,255,.28)', 'rgba(60,80,130,.16)');
        x.strokeStyle = 'rgba(255,255,255,.45)'; x.lineWidth = Math.max(1, hh / 500);
        x.beginPath(); far.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke();
        const near = ridge(R, w, 46, hz + hh * 0.03, hh * 0.2, 0.18);
        g = x.createLinearGradient(0, hz - hh * 0.2, 0, hz + hh * 0.05); g.addColorStop(0, '#6f8fc4'); g.addColorStop(1, '#9db7dc');
        fillRidge(x, near, hh, g);
        shadeRidge(x, near, hh * 0.08, 'rgba(255,255,255,.22)', 'rgba(30,45,95,.22)');
        g = x.createLinearGradient(0, hz - hh * 0.04, 0, hz + hh * 0.06);
        g.addColorStop(0, 'rgba(240,248,255,0)'); g.addColorStop(0.6, 'rgba(240,248,255,.75)'); g.addColorStop(1, 'rgba(240,248,255,.35)');
        x.fillStyle = g; x.fillRect(0, hz - hh * 0.04, w, hh * 0.1);
        const hill = ridge(R, w, 30, hz + hh * 0.1, hh * 0.08, 0.05);
        g = x.createLinearGradient(0, hz, 0, hh); g.addColorStop(0, '#7cc25a'); g.addColorStop(0.5, '#4f9a3f'); g.addColorStop(1, '#2f6b2c');
        fillRidge(x, hill, hh, g);
        shadeRidge(x, hill, hh * 0.05, 'rgba(230,255,170,.3)', 'rgba(10,50,10,.18)');
        // cây trên đồi: rải theo sườn, xa nhỏ gần to
        const yAt = (pts, px) => { const i = clamp(Math.floor(px / w * (pts.length - 1)), 0, pts.length - 2), k = px / w * (pts.length - 1) - i; return lerp(pts[i][1], pts[i + 1][1], k); };
        for (let px = R() * 30; px < w; px += hh * (0.018 + R() * 0.03)) {
            if (R() < 0.25) continue;
            tree(x, R, px, yAt(hill, px) + hh * 0.012, hh * (0.012 + R() * 0.012), '#24572a', '#3d8a3a', '#7fc858');
        }
        const front = ridge(R, w, 24, hh * 0.86, hh * 0.06, 0.05);
        fillRidge(x, front, hh, '#2e6a2c');
        for (let px = R() * 40; px < w; px += hh * (0.03 + R() * 0.04)) tree(x, R, px, yAt(front, px) + hh * 0.03, hh * (0.025 + R() * 0.02), '#1d4a22', '#2f7a33', '#69b84d');
        return c;
    }
    function cloudSprite(R, cw) {
        const ch = cw * 0.5, c = canvas(cw, ch), x = c.getContext('2d'), n = 7 + ((R() * 5) | 0), puffs = [];
        for (let i = 0; i < n; i++) {
            const u = i / (n - 1), r = ch * (0.14 + 0.2 * Math.sin(Math.PI * u)) * (0.85 + R() * 0.3);
            puffs.push([cw * (0.14 + 0.72 * u) + (R() - 0.5) * cw * 0.05, ch * 0.72 - r * 0.5 + (R() - 0.5) * ch * 0.06, r]);
        }
        x.fillStyle = '#ffffff';
        for (const [px, py, r] of puffs) { x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill(); }
        x.beginPath(); x.ellipse(cw * 0.5, ch * 0.74, cw * 0.38, ch * 0.1, 0, 0, TAU); x.fill();
        x.globalCompositeOperation = 'source-atop';
        const g = x.createLinearGradient(0, ch * 0.3, 0, ch * 0.86);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(140,170,210,.8)');
        x.fillStyle = g; x.fillRect(0, 0, cw, ch);
        for (const [px, py, r] of puffs) {
            const hg = x.createRadialGradient(px + r * 0.25, py - r * 0.4, 0, px + r * 0.25, py - r * 0.4, r);
            hg.addColorStop(0, 'rgba(255,255,255,.95)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
            x.fillStyle = hg; x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
        }
        x.globalCompositeOperation = 'source-over';
        return c;
    }
    // 🏢 dãy toà nhà phía trước. Toà CHÍNH ở giữa sprite (đặt đúng chỗ NPC đứng), mái = mt; toà sát bên không cao hơn toà chính
    // (NPC đánh nhau trên trời không bị khuất), toà xa thì tuỳ.
    const PAL = [['#e3dccd', '#b4ab9a', '#8c8373'], ['#c9906f', '#9a684c', '#734c37'], ['#d6d9de', '#a3a9b3', '#7b818c'], ['#e8d9b0', '#bda97a', '#8f7e55']];
    function windowRect(x, R, wx, wy, ww, wh) {
        const lit = R() < 0.12, g = x.createLinearGradient(0, wy, 0, wy + wh);
        if (lit) { g.addColorStop(0, '#fff1b8'); g.addColorStop(1, '#f1b552'); }
        else { g.addColorStop(0, '#d4efff'); g.addColorStop(0.45, '#7fb2df'); g.addColorStop(1, '#2f5784'); }
        x.fillStyle = g; x.fillRect(wx, wy, ww, wh);
        if (!lit && R() < 0.6) {     // vệt phản chiếu chéo
            x.fillStyle = 'rgba(255,255,255,.35)';
            x.beginPath(); x.moveTo(wx + ww * 0.15, wy + wh); x.lineTo(wx + ww * 0.5, wy); x.lineTo(wx + ww * 0.68, wy); x.lineTo(wx + ww * 0.33, wy + wh); x.closePath(); x.fill();
        }
        x.strokeStyle = 'rgba(40,30,20,.35)'; x.lineWidth = Math.max(1, ww * 0.06); x.strokeRect(wx, wy, ww, wh);
        x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(wx - ww * 0.06, wy + wh, ww * 1.12, Math.max(1, wh * 0.08));
    }
    function building(x, R, bx, top, bw, bottom, kind, floorH, main) {
        const glass = kind === 4, pal = PAL[kind % PAL.length];
        let g = x.createLinearGradient(bx, 0, bx + bw, 0);
        if (glass) { g.addColorStop(0, '#9cc6ea'); g.addColorStop(0.55, '#4f86bb'); g.addColorStop(1, '#2c5480'); }
        else { g.addColorStop(0, pal[0]); g.addColorStop(0.7, pal[1]); g.addColorStop(1, pal[2]); }
        x.fillStyle = g; x.fillRect(bx, top, bw, bottom - top);
        if (glass) {
            // tường kính: đường khung đứng + ngang, phản chiếu trời
            x.strokeStyle = 'rgba(20,40,70,.45)'; x.lineWidth = Math.max(1, bw / 180);
            const cols = Math.max(4, Math.round(bw / (floorH * 0.55)));
            x.beginPath();
            for (let i = 1; i < cols; i++) { const lx = bx + i * bw / cols; x.moveTo(lx, top); x.lineTo(lx, bottom); }
            for (let y = top + floorH; y < bottom; y += floorH) { x.moveTo(bx, y); x.lineTo(bx + bw, y); }
            x.stroke();
            const rg = x.createLinearGradient(bx, top, bx + bw * 0.6, top + (bottom - top) * 0.5);
            rg.addColorStop(0, 'rgba(255,255,255,.35)'); rg.addColorStop(0.4, 'rgba(255,255,255,0)'); rg.addColorStop(0.55, 'rgba(255,255,255,.18)'); rg.addColorStop(0.7, 'rgba(255,255,255,0)');
            x.fillStyle = rg; x.fillRect(bx, top, bw, bottom - top);
        } else {
            const cols = Math.max(2, Math.round(bw / (floorH * 0.95))), cw = bw / cols;
            for (let y = top + floorH * 0.42; y < bottom; y += floorH) {
                x.fillStyle = 'rgba(0,0,0,.08)'; x.fillRect(bx, y + floorH * 0.66, bw, Math.max(1, floorH * 0.05));     // gờ tầng
                for (let c = 0; c < cols; c++) windowRect(x, R, bx + c * cw + cw * 0.2, y, cw * 0.6, floorH * 0.5);
            }
        }
        // tối dần xuống chân + mép phải khuất nắng
        g = x.createLinearGradient(0, top, 0, bottom);
        g.addColorStop(0, 'rgba(255,255,255,.06)'); g.addColorStop(1, 'rgba(10,15,40,.42)');
        x.fillStyle = g; x.fillRect(bx, top, bw, bottom - top);
        x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(bx + bw * 0.93, top, bw * 0.07, bottom - top);
        // tường chắn mái + đường bóng dưới gờ
        const pp = Math.max(6, floorH * 0.22);
        x.fillStyle = glass ? '#3b5f86' : pal[0]; x.fillRect(bx - pp * 0.35, top - pp, bw + pp * 0.7, pp);
        x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(bx - pp * 0.35, top - pp, bw + pp * 0.7, Math.max(1, pp * 0.18));
        x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(bx, top, bw, Math.max(2, pp * 0.4));
        // đồ trên mái: bồn nước, cột ăng-ten đèn đỏ, cục điều hoà
        const props = main ? ['tank', 'ac', 'ant'] : [R() < 0.5 ? 'tank' : 'ac', R() < 0.4 ? 'ant' : ''];
        for (const p of props) {
            const px = bx + bw * (0.15 + R() * 0.7);
            if (p === 'tank') {
                const tw = floorH * 0.9, th = floorH * 0.85, ty = top - pp - th - floorH * 0.35;
                x.strokeStyle = '#4b4b4b'; x.lineWidth = Math.max(1.5, tw * 0.05);
                x.beginPath(); x.moveTo(px - tw * 0.35, ty + th); x.lineTo(px - tw * 0.42, top - pp); x.moveTo(px + tw * 0.35, ty + th); x.lineTo(px + tw * 0.42, top - pp); x.stroke();
                const tg = x.createLinearGradient(px - tw / 2, 0, px + tw / 2, 0);
                tg.addColorStop(0, '#9aa3ab'); tg.addColorStop(0.35, '#e6ecf1'); tg.addColorStop(1, '#6d757d');
                x.fillStyle = tg; x.fillRect(px - tw / 2, ty, tw, th);
                x.fillStyle = '#c9d1d8'; x.beginPath(); x.ellipse(px, ty, tw / 2, tw * 0.12, 0, 0, TAU); x.fill();
                x.strokeStyle = 'rgba(0,0,0,.2)'; x.lineWidth = 1; x.beginPath(); x.moveTo(px - tw / 2, ty + th * 0.5); x.lineTo(px + tw / 2, ty + th * 0.5); x.stroke();
            } else if (p === 'ac') {
                const aw = floorH * 0.8, ah = floorH * 0.45, ay = top - pp - ah;
                x.fillStyle = '#d7d9dc'; x.fillRect(px - aw / 2, ay, aw, ah);
                x.fillStyle = '#9ea2a7'; x.beginPath(); x.arc(px + aw * 0.18, ay + ah * 0.5, ah * 0.32, 0, TAU); x.fill();
                x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 1; x.strokeRect(px - aw / 2, ay, aw, ah);
            } else if (p === 'ant') {
                const ah = floorH * (2 + R() * 1.4);
                x.strokeStyle = '#555'; x.lineWidth = Math.max(1.5, floorH * 0.05);
                x.beginPath(); x.moveTo(px, top - pp); x.lineTo(px, top - pp - ah); x.moveTo(px - floorH * 0.25, top - pp - ah * 0.6); x.lineTo(px + floorH * 0.25, top - pp - ah * 0.6); x.stroke();
                x.fillStyle = '#ff3b30'; x.beginPath(); x.arc(px, top - pp - ah, Math.max(2, floorH * 0.07), 0, TAU); x.fill();
            }
        }
    }
    function fgSprite(vw, vh, R) {
        // sprite rộng 1,7 khung để toà chính luôn đặt được đúng chỗ NPC; mái toà chính = mt (cách đáy 0,34 khung)
        const fw = vw * 1.7, fh = vh * 0.56, mt = fh - vh * 0.34, c = canvas(fw, fh), x = c.getContext('2d'), floorH = vh * 0.05;
        const mw = vw * (0.3 + R() * 0.06), mx = fw / 2 - mw / 2, items = [];
        // trái / phải toà chính: bề ngang ngẫu nhiên, sát toà chính thì thấp hơn, xa thì cao thấp tuỳ (có khe hở thấy đồi cây)
        for (const dir of [-1, 1]) {
            let edge = dir < 0 ? mx : mx + mw, near = true;
            while (dir < 0 ? edge > 0 : edge < fw) {
                const bw = vw * (0.12 + R() * 0.14), gap = R() < 0.3 ? vw * (0.02 + R() * 0.05) : 0;
                const top = near ? mt + vh * (0.02 + R() * 0.07) : mt + vh * (-0.1 + R() * 0.16);
                const bx = dir < 0 ? edge - gap - bw : edge + gap;
                items.push([bx, top, bw, (R() * 5) | 0]);
                edge = dir < 0 ? bx : bx + bw;
                near = Math.abs((bx + bw / 2) - fw / 2) < vw * 0.3;
            }
        }
        items.sort((a, b) => a[1] - b[1]);     // toà cao vẽ trước (sau lưng)
        for (const [bx, top, bw, kind] of items) building(x, R, bx, top, bw, fh, kind, floorH, false);
        building(x, R, mx, mt, mw, fh, (R() * 5) | 0, floorH, true);
        // đáy: bóng đổ mặt đường
        const g = x.createLinearGradient(0, fh - vh * 0.08, 0, fh);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
        x.fillStyle = g; x.fillRect(0, fh - vh * 0.08, fw, vh * 0.08);
        return { c, mt };
    }
    // các bước dựng cảnh (mỗi bước một việc nặng) - dùng chung cho dựng ngay và VẼ SẴN lúc máy rảnh
    function sceneSteps(vw, vh, seed, out) {
        let s = seed >>> 0 || 1;
        const R = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
        return [
            () => { out.bg = bgSprite(vw, vh, R); },
            () => {
                const fg = fgSprite(vw, vh, R);
                out.fg = fg.c; out.fgTop = fg.mt;
                out.clouds = [0, 1, 2, 3].map(i => {
                    const cw = vw * (0.22 + R() * 0.16) * (i === 3 ? 0.6 : 1);
                    return { c: cloudSprite(R, cw), x0: R() * (vw + cw), y: vh * (0.05 + R() * 0.3), sp: vw * (0.006 + R() * 0.012) * (i % 2 ? 1 : 0.6), par: 0.4 + R() * 0.4 };
                });
            }
        ];
    }
    const sceneKey = (v, seed) => `${Math.round(v.w)}x${Math.round(v.h)}:${seed}`;
    function ensureScene(f, v) {
        loadArt();
        if (artOn()) { bakeArt(v); return; }
        const key = sceneKey(v, f.fly.seed);
        if (SCN.key === key) return;
        if (PRE && PRE.done && PRE.key === key) { Object.assign(SCN, PRE.scene, { key, seed: PRE.seed }); PRE = null; return; }
        const out = {};
        sceneSteps(v.w, v.h, f.fly.seed, out).forEach(fn => fn());      // chưa vẽ sẵn kịp (lượt đầu ngay khi mở trang) → dựng ngay
        Object.assign(SCN, out, { key, seed: f.fly.seed });
    }
    // 🧊 VẼ SẴN (user 2026-10-28 "biến mất rồi cảnh hiện thì khựng 1 cái"): dựng cảnh + mây + vùng nhớ tách màu cho lượt TỚI lúc máy rảnh
    // (requestIdleCallback, mỗi lần một bước) → khung đầu của lượt chỉ dán ảnh. Không chạy lúc đang có lượt 🐉; không có game 🐉 thì bỏ.
    let PRE = null, preTimer = 0, runEnd = 0;
    const idle = fn => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 80));
    function prebuild() {
        if (h.want && !h.want()) { schedulePre(5000); return; }      // cài đặt chưa nạp / chưa có game 🐉 → hỏi lại sau (rẻ)
        if (performance.now() < runEnd) { schedulePre(runEnd - performance.now() + 600); return; }
        const v = (h.view && h.view()) || { x: 0, y: 0, w: W, h: H }, seed = (Math.random() * 1e9) | 0, scene = {};
        loadArt();
        const steps = artOn() ? [] : sceneSteps(v.w, v.h, seed, scene);
        steps.push(() => buildClouds(v.h * 0.24 * 1.12, seed), () => vfx.warm(), () => bakeArt(v), () => warmArt());     // cỡ người bay (không bị kẹp) → mây cưỡi
        const job = { key: sceneKey(v, seed), seed, scene, done: false };
        PRE = job;
        const next = () => {
            if (PRE !== job) return;
            if (performance.now() < runEnd) { PRE = null; schedulePre(runEnd - performance.now() + 600); return; }
            const fn = steps.shift();
            if (fn) { fn(); idle(next); } else job.done = true;
        };
        idle(next);
    }
    function schedulePre(ms) { clearTimeout(preTimer); preTimer = setTimeout(prebuild, Math.max(0, ms)); }
    schedulePre(1500);
    // 🖼 ẢNH CẢNH user vẽ (2026-10-28): nền núi bình minh + dãy toà nhà logo hp (list/camgames/body, đã dọn viền + WebP). Nạp được thì
    // DÙNG THAY cảnh vẽ bằng mã (đẹp hơn, không phải dựng cảnh); lỗi / chưa nạp xong thì lùi về cảnh vẽ mã.
    // Toà nhà 941×1624 (đáy = mép dưới ảnh): mái tháp giữa y≈975, mái 2 cánh y≈1125-1150 → NPC nấp dưới ART_ROOF. Cỡ theo CHIỀU CAO khung
    // (sF = v.h / 1672 như ảnh gốc 941×1672): khung dọc 1080×1920 vừa khít bề ngang; khung ngang thì toà nhà đứng giữa đúng cột NPC.
    const ART = { bg: null, fg: null, tried: false, bake: null };
    const ART_W = 941, ART_H = 1672, ART_FG_H = 1624, ART_ROOF = 1150, ART_SUN = [718, 638];
    function loadArt() {
        if (ART.tried) return;
        ART.tried = true;
        const load = (src, k) => {
            const im = new Image();
            im.decoding = 'async'; im.src = src;
            (im.decode ? im.decode() : new Promise((ok, no) => { im.onload = ok; im.onerror = no; })).then(async () => {
                if (k === 'fg') ART.tops = roofTops(im);
                // ImageBitmap = ảnh GIẢI NÉN GIỮ NGUYÊN (img thường trình duyệt có thể xả rồi giải nén lại đúng lúc vẽ → khựng)
                let src = im;
                try { if (typeof createImageBitmap === 'function') src = await createImageBitmap(im); } catch (_) {}
                ART[k] = src;
                if (artOn()) schedulePre(300);      // đủ 2 ảnh → vẽ sẵn đúng cỡ hiển thị ngay lúc rảnh
            }).catch(() => {});
        };
        load('/games/body/samples/bay-chuong-nen.webp', 'bg');
        load('/games/body/samples/bay-chuong-toa-nha.webp', 'fg');
    }
    // mái theo TỪNG CỘT ảnh toà nhà (điểm đặc đầu tiên từ trên xuống) - đọc MỘT lần lúc nạp ảnh
    function roofTops(im) {
        const tops = new Int16Array(im.naturalWidth).fill(ART_FG_H);
        try {
            const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
            const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
            const d = x.getImageData(0, 0, c.width, c.height).data;
            for (let col = 0; col < c.width; col++) for (let y = 0; y < c.height; y++) if (d[(y * c.width + col) * 4 + 3] > 128) { tops[col] = y; break; }
        } catch (_) { tops.fill(ART_ROOF); }
        return tops;
    }
    const artOn = () => !!(ART.bg && ART.fg);
    // 🧊 VẼ SẴN ảnh ĐÚNG CỠ HIỂN THỊ (user 2026-10-28 "ảnh toà nhà xuất hiện hơi khựng"): nền ở cỡ lớn nhất của lượt (zoom 1,07), toà nhà đúng cỡ
    // + 24 px đáy → lúc chạy toà nhà dán 1:1, nền chỉ thu nhẹ; không phải giải nén / phóng / nạp ảnh lớn lên GPU giữa lượt.
    function bakeArt(v) {
        const key = Math.round(v.w) + 'x' + Math.round(v.h);
        if (!artOn() || (ART.bake && ART.bake.key === key)) return;
        const m = 40, bs = Math.max((v.w + m * 2) / ART_W, (v.h + m * 2) / ART_H) * 1.07, fs = artScale(v);
        const bg = canvas(ART_W * bs, ART_H * bs), bx = bg.getContext('2d');
        bx.imageSmoothingQuality = 'high'; bx.drawImage(ART.bg, 0, 0, bg.width, bg.height);
        const fg = canvas(Math.round(ART_W * fs), Math.round(ART_FG_H * fs) + 24), fx = fg.getContext('2d');
        fx.imageSmoothingQuality = 'high'; fx.drawImage(ART.fg, 0, 0, fg.width, fg.height);
        ART.bake = { key, bg, fg };
    }
    // nạp sẵn 2 ảnh lên GPU của canvas overlay: vẽ vô hình 2×2 px (overlay xoá lại mỗi khung) - lúc rảnh + nhắc lại định kỳ (GPU có thể xả)
    function warmArt() {
        if (!ART.bake) return;
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.004;
        ctx.drawImage(ART.bake.bg, 0, 0, 2, 2); ctx.drawImage(ART.bake.fg, 0, 0, 2, 2);
        ctx.restore();
    }
    setInterval(() => { if (ART.bake && performance.now() > runEnd && (!h.want || h.want())) warmArt(); }, 3000);
    const artScale = v => v.h / ART_H;
    const artLeft = (v, cx, w) => (w >= v.w ? v.x + v.w / 2 - w / 2 : clamp(cx - w / 2, v.x, v.x + v.w - w));
    // mái toà nhà ở cột x (toạ độ màn); cx = cột NPC (khung ngang toà nhà đứng theo NPC). Vẽ mã: 2/3 khung
    function roofAt(v, cx, x) {
        if (!artOn() || !ART.tops) return v.y + v.h * 0.66;
        const sc = artScale(v), w = ART_W * sc, ix = Math.floor((x - artLeft(v, cx, w)) / sc);
        if (ix < 0 || ix >= ART.tops.length) return v.y + v.h;
        return v.y + v.h - (ART_FG_H - ART.tops[ix]) * sc;
    }
    // mái THẤP nhất trong khoảng [x1, x2] (chỗ nấp phải khuất cả bề ngang đám mây)
    function roofLow(v, cx, x1, x2) { let y = -1e9; for (let i = 0; i <= 12; i++) y = Math.max(y, roofAt(v, cx, lerp(x1, x2, i / 12))); return y; }
    // nền: phủ kín khung (cover), neo theo dải núi, máy quay ĐẨY CHẬM (zoom 1,07 → 1) + lệch theo camY khi bay lên; nắng lấp lánh
    function bgPlace(v, t, camY) {
        const z = 1.07 - 0.07 * clamp01(t / 10), m = 40, sc = Math.max((v.w + m * 2) / ART_W, (v.h + m * 2) / ART_H) * z;
        const w = ART_W * sc, hh = ART_H * sc;
        return { x: v.x + v.w / 2 - w / 2, y: v.y + v.h * 0.45 - hh * 0.45 + camY * 0.25, w, h: hh, sc };
    }
    function drawScene(v, a, camY, t) {
        if (a <= 0) return;
        ctx.save();
        ctx.globalAlpha = a;
        if (artOn()) {
            const b = bgPlace(v, t, camY);
            const bk = ART.bake && ART.bake.key === Math.round(v.w) + 'x' + Math.round(v.h) ? ART.bake : null;
            ctx.drawImage(bk ? bk.bg : ART.bg, b.x, b.y, b.w, b.h);
            // mặt trời trong ảnh: quầng sáng thở nhẹ + loá ngang (sống động, rẻ)
            const sx = b.x + ART_SUN[0] * b.sc, sy = b.y + ART_SUN[1] * b.sc, r = v.h * 0.14 * (1 + Math.sin(t * 2.2) * 0.08);
            ctx.globalCompositeOperation = 'lighter';
            const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
            g.addColorStop(0, `rgba(255,244,210,${0.35 * a})`); g.addColorStop(1, 'rgba(255,230,180,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
            vfx.flare(sx, sy, v.w * 0.55, Math.max(2, v.h * 0.004), 0.35 * a, '#ffd9a0');
            ctx.restore();
            return;
        }
        const m = 40;
        ctx.drawImage(SCN.bg, v.x - m, v.y - m + camY * 0.25, v.w + m * 2, v.h + m * 2);
        for (const cl of SCN.clouds) {
            const cw = cl.c.width, span = v.w + cw, cx = ((cl.x0 + t * cl.sp) % span + span) % span - cw;
            ctx.drawImage(cl.c, v.x + cx, v.y + cl.y + camY * cl.par);
        }
        ctx.restore();
    }
    // dãy toà nhà phía trước; jx / jy = RUNG RIÊNG của toà nhà (gom sức, cất cánh, va chạm) chồng lên rung màn
    function drawFg(v, a, cx, drop, jx = 0, jy = 0) {
        if (a <= 0) return;
        ctx.save(); ctx.globalAlpha = a;
        if (artOn()) {
            const sc = artScale(v), w = ART_W * sc, hh = ART_FG_H * sc;
            const x0 = artLeft(v, cx, w) + jx, y0 = v.y + v.h - hh + drop + jy;
            const bk = ART.bake && ART.bake.key === Math.round(v.w) + 'x' + Math.round(v.h) ? ART.bake : null;
            if (bk) ctx.drawImage(bk.fg, Math.round(x0), Math.round(y0));      // dán 1:1 (vẽ sẵn đúng cỡ, đã kèm 24 px đáy)
            else ctx.drawImage(ART.fg, x0, y0, w, hh + 24);      // +24: kéo đáy xuống quá mép khung (rung lên không hở đáy)
            ctx.restore();
            return;
        }
        const fw = SCN.fg.width, x0 = clamp(cx - fw / 2, v.x + v.w - fw, v.x) + jx, y0 = v.y + v.h * 0.66 - SCN.fgTop + drop + jy;
        ctx.drawImage(SCN.fg, x0, y0);
        // phủ kín phần dưới sprite khi rung (đáy không hở)
        if (y0 + SCN.fg.height < H + 40) { ctx.fillStyle = '#2a2a30'; ctx.fillRect(x0, y0 + SCN.fg.height - 1, fw, H + 40 - (y0 + SCN.fg.height)); }
        ctx.restore();
    }

    // =====================================================================================================================
    // 🧍 NPC thu nhỏ + hào quang
    // =====================================================================================================================
    function boxOf(g) {
        const hw = Math.max(g.w * 0.62, g.ph * 0.3);
        return { x0: g.cx - hw, x1: g.cx + hw, y0: g.head.y - g.ph * 0.06, y1: g.floorY + 6 };
    }
    // Chụp người vào PC ở tỉ lệ sc; mép dưới mờ dần (camera nửa người: thân cụt không lơ lửng cứng đơ; cả người: cẳng chân chìm vào mây). null = chưa có người.
    function snap(g, sc) {
        const P = h.person();
        if (!P.ready || !P.img || !P.M) return null;
        const b = boxOf(g), ow = Math.max(8, Math.ceil((b.x1 - b.x0) * sc)), oh = Math.max(8, Math.ceil((b.y1 - b.y0) * sc)), x = PC.x, M = P.M;
        fit(PC, ow, oh);
        x.setTransform(sc, 0, 0, sc, -b.x0 * sc, -b.y0 * sc);
        x.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
        x.drawImage(P.img, 0, 0);
        x.setTransform(1, 0, 0, 1, 0, 0);
        {
            x.globalCompositeOperation = 'destination-out';
            const gr = x.createLinearGradient(0, oh * 0.74, 0, oh);
            gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
            x.fillStyle = gr; x.fillRect(0, oh * 0.74, ow, oh * 0.26);
            x.globalCompositeOperation = 'source-over';
        }
        return { b, ow, oh };
    }
    function tint(D, S, col, op) {
        fit(D, S.c.width, S.c.height);
        D.x.drawImage(S.c, 0, 0);
        D.x.globalCompositeOperation = op; D.x.fillStyle = col; D.x.fillRect(0, 0, S.c.width, S.c.height);
        D.x.globalCompositeOperation = 'source-over';
    }
    // Dán canvas chụp C sao cho TÂM người ở (X, Y), cỡ s (1 = cỡ thật).
    function place(C, sn, g, X, Y, s, o) {
        const b = sn.b, ox = g.cx, oy = g.floorY - g.ph / 2;
        ctx.save();
        ctx.globalAlpha *= o.a == null ? 1 : o.a;
        if (o.op) ctx.globalCompositeOperation = o.op;
        ctx.translate(X, Y); if (o.rot) ctx.rotate(o.rot);
        ctx.scale(s * (o.flip ? -1 : 1) * (o.sx || 1), s * (o.sy || 1));
        ctx.drawImage(C.c, 0, 0, sn.ow, sn.oh, b.x0 - ox, b.y0 - oy, b.x1 - b.x0, b.y1 - b.y0);
        ctx.restore();
    }
    // Vẽ thẳng ảnh người gốc (nét nhất) - dùng khi cỡ ≥ 0,95.
    function direct(g, X, Y, s, o) {
        const P = h.person();
        if (!P.ready || !P.img || !P.M) return;
        const M = P.M;
        ctx.save();
        ctx.globalAlpha *= o.a == null ? 1 : o.a;
        ctx.translate(X, Y); if (o.rot) ctx.rotate(o.rot);
        ctx.scale(s * (o.flip ? -1 : 1) * (o.sx || 1), s * (o.sy || 1));
        ctx.translate(-g.cx, -(g.floorY - g.ph / 2));
        ctx.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
        ctx.drawImage(P.img, 0, 0);
        ctx.restore();
    }
    // Hào quang kiểu Siêu Saiyan: bóng tô màu của chính người, thu nhỏ rồi LÀM MỜ một lần mỗi khung (canvas nhỏ → blur rẻ) = quầng mềm;
    // dán phóng to, kéo cao lên trên đầu (lửa bốc), chập chờn. Phủ thường (không cộng sáng: vàng cộng trời xanh ra trắng).
    function auraBuf(D, Sil, sn) {
        const k = 0.4, pad = 22, w = Math.ceil(sn.ow * k) + pad * 2, hh = Math.ceil(sn.oh * k) + pad * 2;
        fit(D, w, hh);
        D.x.filter = `blur(${Math.max(3, Math.round(w * 0.045))}px)`;
        D.x.drawImage(Sil.c, pad, pad, sn.ow * k, sn.oh * k);
        D.x.drawImage(Sil.c, pad, pad, sn.ow * k, sn.oh * k);
        D.x.filter = 'none';
        return { k, pad };
    }
    function placeAura(D, ab, sn, g, X, Y, s, o) {
        const b = sn.b, unit = (b.x1 - b.x0) / sn.ow / ab.k, ox = g.cx, oy = g.floorY - g.ph / 2;
        ctx.save();
        ctx.globalAlpha *= o.a == null ? 1 : o.a;
        if (o.op) ctx.globalCompositeOperation = o.op;
        ctx.translate(X, Y); if (o.rot) ctx.rotate(o.rot);
        ctx.scale(s * (o.flip ? -1 : 1) * (o.sx || 1), s * (o.sy || 1));
        ctx.drawImage(D.c, b.x0 - ox - ab.pad * unit, b.y0 - oy - ab.pad * unit, D.c.width * unit, D.c.height * unit);
        ctx.restore();
    }
    function aura(D, ab, sn, g, q, t, k) {
        if (k <= 0 || !ab) return;
        const nh = q.s * g.ph, a = Math.min(1, k) * (q.a ?? 1);
        for (let i = 0; i < 2; i++) {
            const fl = Math.sin(t * 23 + i * 2.1) * 0.03 + Math.sin(t * 37 + i) * 0.02, z = 1.12 + 0.16 * i + fl + (k > 1 ? (k - 1) * 0.25 : 0);
            placeAura(D, ab, sn, g, q.x, q.y - nh * (0.05 + 0.07 * i), q.s, { ...q, sx: (q.sx || 1) * z, sy: (q.sy || 1) * z * 1.12, a: a * (i ? 0.55 : 0.85) });
        }
        placeAura(D, ab, sn, g, q.x, q.y - nh * 0.03, q.s, { ...q, sx: (q.sx || 1) * 1.06, sy: (q.sy || 1) * 1.08, a: a * 0.35, op: 'lighter' });
    }
    function drawNpc(f, g, sn, q, t, clone) {
        if (!sn || !q || q.a <= 0) return;
        const body = clone ? CL : PC;
        aura(clone ? CAU : AU, clone ? f.fly.cab : f.fly.ab, sn, g, q, t, q.aura || 0);
        if (!clone && q.s >= 0.95) direct(g, q.x, q.y, q.s, q);
        else place(body, sn, g, q.x, q.y, q.s, q);
        if (q.aura) place(clone ? CSIL : SIL, sn, g, q.x, q.y, q.s, { ...q, a: (q.a ?? 1) * Math.min(1, q.aura) * 0.14, op: 'lighter' });
    }
    // lưỡi lửa hào quang: mọc dọc 2 bên + trên đầu, bốc thẳng lên, nhọn đầu (vẽ SAU lưng người)
    function flames(f, g, q, dt, col, on) {
        const P = f.fly;
        if (on && q && q.a > 0) {
            const nh = q.s * g.ph, nw = nh * 0.3;
            P.flAcc += dt * 55 * on;
            while (P.flAcc >= 1) {
                P.flAcc -= 1;
                const side = Math.random() < 0.5 ? -1 : 1, yy = Math.random();
                P.fl.push({ x: q.x + side * nw * (0.55 + Math.random() * 0.5) * (yy < 0.15 ? 0.4 : 1), y: q.y - nh * 0.5 + nh * yy * 0.95, vy: -nh * (1.1 + Math.random() * 0.8), vx: -side * nh * 0.12,
                    t: 0, life: 0.3 + Math.random() * 0.25, r: nh * (0.02 + Math.random() * 0.025), col });
            }
        }
        if (!P.fl.length) return;
        ctx.save();
        const [r, gg, bb] = rgb(col);
        for (const p of P.fl) {
            p.t += dt; p.y += p.vy * dt; p.x += p.vx * dt;
            const k = p.t / p.life, w = p.r * (1 - k * 0.5), hh = p.r * (3.2 - k * 1.5), a = 0.75 * Math.sin(Math.PI * Math.min(1, k * 1.4 + 0.1));
            const gr = ctx.createLinearGradient(0, p.y + w, 0, p.y - hh);
            gr.addColorStop(0, `rgba(255,255,235,${a})`); gr.addColorStop(0.45, `rgba(${r},${gg},${bb},${a})`); gr.addColorStop(1, `rgba(${r},${gg},${bb},0)`);
            ctx.fillStyle = gr;
            ctx.beginPath(); ctx.moveTo(p.x - w, p.y); ctx.quadraticCurveTo(p.x - w, p.y + w, p.x, p.y + w); ctx.quadraticCurveTo(p.x + w, p.y + w, p.x + w, p.y);
            ctx.quadraticCurveTo(p.x + w * 0.5, p.y - hh * 0.5, p.x, p.y - hh); ctx.quadraticCurveTo(p.x - w * 0.5, p.y - hh * 0.5, p.x - w, p.y); ctx.fill();
        }
        ctx.restore();
        P.fl = P.fl.filter(p => p.t < p.life);
    }
    // vệt nhoè (bóng mờ các vị trí trước) khi bay nhanh
    function trailPush(f, q, on) { const T = f.fly.trail; if (on && q) { T.unshift({ ...q }); if (T.length > 6) T.length = 6; } else T.length = 0; }
    function drawTrail(f, g, sn, t) {
        const T = f.fly.trail;
        for (let i = T.length - 1; i >= 1; i--) placeAura(AU, f.fly.ab, sn, g, T[i].x, T[i].y, T[i].s, { ...T[i], a: 0.4 * (1 - i / T.length) });
    }

    // =====================================================================================================================
    // ✨ hiệu ứng phụ
    // =====================================================================================================================
    function glowBall(x, y, r, a, c0, c1) {
        if (r <= 0 || a <= 0) return;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        let g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
        g.addColorStop(0, rgba(c1, 0.55 * a)); g.addColorStop(1, rgba(c1, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, TAU); ctx.fill();
        g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.45, rgba(c0, a)); g.addColorStop(1, rgba(c1, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.restore();
    }
    function sparks(x, y, r, a, col, t, n = 7) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(col, a); ctx.lineWidth = Math.max(1.5, r * 0.06); ctx.lineCap = 'round';
        for (let i = 0; i < n; i++) {
            if (hash(i * 7 + Math.floor(t * 18)) < 0.45) continue;
            let an = hash(i + Math.floor(t * 18) * 3) * TAU, px = x + Math.cos(an) * r * 0.9, py = y + Math.sin(an) * r * 0.9;
            ctx.beginPath(); ctx.moveTo(px, py);
            for (let j = 0; j < 3; j++) { an += (hash(i * 3 + j + t) - 0.5) * 1.6; px += Math.cos(an) * r * 0.45; py += Math.sin(an) * r * 0.45; ctx.lineTo(px, py); }
            ctx.stroke();
        }
        ctx.restore();
    }
    // vạch tốc độ dọc (bay lên): chạy xuống quanh cột x
    function speedLines(x, yTop, yBot, wid, a, t) {
        if (a <= 0) return;
        const hh = Math.max(50, yBot - yTop);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (let i = 0; i < 26; i++) {
            const lx = x + (hash(i) - 0.5) * wid, len = hh * (0.12 + hash(i + 40) * 0.2), y = yTop + ((t * hh * 2.6 + hash(i + 80) * hh) % hh);
            ctx.strokeStyle = `rgba(255,255,255,${a * (0.25 + hash(i + 9) * 0.4)})`; ctx.lineWidth = 1.5 + hash(i + 3) * 3;
            ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(lx, y + len); ctx.stroke();
        }
        ctx.restore();
    }
    // vạch phóng (lao vào màn): toả từ tâm ra mép
    function zoomLines(cx, cy, a, t) {
        if (a <= 0) return;
        const R = Math.hypot(W, H);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (let i = 0; i < 56; i++) {
            const an = i * 2.39996 + hash(i) * 0.1, r0 = R * (0.18 + ((t * 1.6 + hash(i + 5)) % 1) * 0.6), len = R * (0.08 + hash(i + 11) * 0.14);
            ctx.strokeStyle = `rgba(255,255,255,${a * (0.25 + hash(i + 2) * 0.45)})`; ctx.lineWidth = 2 + hash(i + 7) * 4;
            ctx.beginPath(); ctx.moveTo(cx + Math.cos(an) * r0, cy + Math.sin(an) * r0); ctx.lineTo(cx + Math.cos(an) * (r0 + len), cy + Math.sin(an) * (r0 + len)); ctx.stroke();
        }
        ctx.restore();
    }
    // 🌊 mặt chưởng lao vào màn: đĩa sáng trắng lõi, viền xanh, tia xoáy + gợn vòng
    // 🪨 đá vụn: bay lơ lửng lên khi gom sức, văng tung lúc phóng lên
    function rocks(f, dt) {
        const L = f.fly.rk;
        ctx.save();
        for (const p of L) {
            p.t += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
            const a = clamp01(Math.min(p.t / 0.15, (p.life - p.t) / 0.3));
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = a;
            ctx.fillStyle = '#6d655b'; ctx.beginPath(); ctx.moveTo(-p.s, -p.s * 0.4); ctx.lineTo(-p.s * 0.2, -p.s); ctx.lineTo(p.s, -p.s * 0.3); ctx.lineTo(p.s * 0.6, p.s * 0.8); ctx.lineTo(-p.s * 0.7, p.s * 0.6); ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.moveTo(-p.s * 0.2, -p.s); ctx.lineTo(p.s, -p.s * 0.3); ctx.lineTo(p.s * 0.2, -p.s * 0.1); ctx.closePath(); ctx.fill();
            ctx.restore();
        }
        ctx.restore();
        f.fly.rk = L.filter(p => p.t < p.life);
    }
    // 💨 khói / bụi tròn mềm
    function puffs(f, dt) {
        const L = f.fly.sm;
        ctx.save();
        for (const p of L) {
            p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 2.2; p.vy *= 1 - dt * 2.2;
            const k = p.t / p.life, r = p.r * (0.6 + k * 0.9);
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
            g.addColorStop(0, `rgba(${p.c},${0.5 * (1 - k)})`); g.addColorStop(1, `rgba(${p.c},0)`);
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
        }
        ctx.restore();
        f.fly.sm = L.filter(p => p.t < p.life);
    }
    const puffRing = (f, x, y, r, n, c) => { for (let i = 0; i < n; i++) { const an = (i / n) * Math.PI + Math.PI + (Math.random() - 0.5) * 0.3, sp = r * (2 + Math.random() * 2); f.fly.sm.push({ x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp * 0.35, t: 0, life: 0.6 + Math.random() * 0.4, r: r * (0.5 + Math.random() * 0.4), c }); } };
    // 💥 nổ vòm trên núi (đòn chót đánh nhau)
    function dome(x, y, r, k) {
        if (k <= 0 || k >= 1) return;
        const rr = r * easeOut(clamp01(k * 2.2)), a = 1 - clamp01((k - 0.35) / 0.65);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
        g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.4, `rgba(255,236,150,${0.9 * a})`); g.addColorStop(0.8, `rgba(255,140,60,${0.6 * a})`); g.addColorStop(1, 'rgba(255,90,30,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr, Math.PI, TAU); ctx.lineTo(x + rr, y + rr * 0.15); ctx.lineTo(x - rr, y + rr * 0.15); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${0.7 * a})`; ctx.lineWidth = Math.max(2, r * 0.03);
        ctx.beginPath(); ctx.ellipse(x, y, rr * 1.5, rr * 0.25, 0, 0, TAU); ctx.stroke();
        ctx.restore();
    }

    // =====================================================================================================================
    // 💥 hiệu ứng hành động kiểu anime: tia lửa văng · sóng xung kích · tia điện quanh người · khung va chạm đen trắng · mảnh kính
    // =====================================================================================================================
    function sparkBurst(F, x, y, n, sp, col) {
        for (let i = 0; i < n; i++) {
            const a = Math.random() * TAU, s = sp * (0.35 + Math.random() * 0.9);
            F.sp.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 0.22 + Math.random() * 0.35, col, w: 1.5 + Math.random() * 3 });
        }
    }
    function drawSparks(F, dt) {
        if (!F.sp.length) return;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (const p of F.sp) {
            p.t += dt; p.vx *= 1 - dt * 3; p.vy = p.vy * (1 - dt * 3) + 700 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
            const k = clamp01(p.t / p.life), tx = p.x - p.vx * 0.035, ty = p.y - p.vy * 0.035;
            ctx.strokeStyle = rgba(p.col, 0.9 * (1 - k)); ctx.lineWidth = p.w * (1 - k * 0.5);
            ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(p.x, p.y); ctx.stroke();
            ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - k)})`; ctx.lineWidth = Math.max(1, p.w * 0.35);
            ctx.beginPath(); ctx.moveTo(lerp(tx, p.x, 0.5), lerp(ty, p.y, 0.5)); ctx.lineTo(p.x, p.y); ctx.stroke();
        }
        ctx.restore();
        F.sp = F.sp.filter(p => p.t < p.life);
    }
    // vòng sóng xung kích nở ra (flat < 1 = elip nằm, kiểu sóng loang trên mặt phẳng)
    const ringPush = (F, x, y, r, life, col, flat = 1, lw = 10) => F.rings.push({ x, y, r, life, col, flat, lw, t: 0 });
    function drawRings(F, dt) {
        if (!F.rings.length) return;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const o of F.rings) {
            o.t += dt;
            const k = clamp01(o.t / o.life), rr = o.r * easeOut(k) + 4, a = 1 - k;
            ctx.strokeStyle = rgba(o.col, 0.55 * a); ctx.lineWidth = o.lw * (1 - k * 0.7) * 2.2;
            ctx.beginPath(); ctx.ellipse(o.x, o.y, rr, rr * o.flat, 0, 0, TAU); ctx.stroke();
            ctx.strokeStyle = `rgba(255,255,255,${0.85 * a})`; ctx.lineWidth = Math.max(1.5, o.lw * (1 - k) * 0.6);
            ctx.beginPath(); ctx.ellipse(o.x, o.y, rr, rr * o.flat, 0, 0, TAU); ctx.stroke();
        }
        ctx.restore();
        F.rings = F.rings.filter(o => o.t < o.life);
    }
    // ⚡ tia điện bò lách tách quanh người (hào quang dâng cao) - mỗi 1/14 s một bộ tia mới
    function bodyArcs(q, g, t, col, k) {
        if (!q || k <= 0) return;
        const nh = q.s * g.ph, nw = nh * 0.36, slot = Math.floor(t * 14);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
            if (hash(slot * 7 + i) > 0.35 + 0.4 * k) continue;
            let x = q.x + (hash(slot * 3 + i * 11) - 0.5) * nw * 1.4, y = q.y + (hash(slot * 5 + i * 13) - 0.55) * nh * 0.95, a = hash(slot + i * 17) * TAU;
            const pts = [[x, y]];
            for (let j = 0; j < 5; j++) { a += (hash(slot * 9 + i * 5 + j) - 0.5) * 2.4; x += Math.cos(a) * nh * 0.055; y += Math.sin(a) * nh * 0.055; pts.push([x, y]); }
            for (const [c, w] of [[rgba(col, 0.4), Math.max(2.5, nh * 0.01)], ['rgba(255,255,255,.9)', Math.max(1, nh * 0.004)]]) {
                ctx.strokeStyle = c; ctx.lineWidth = w;
                ctx.beginPath(); pts.forEach((p, n) => (n ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
            }
        }
        ctx.restore();
    }
    // 🎞 KHUNG VA CHẠM (anime "impact frame"): nửa đầu nền tối + bóng người trắng + vạch toả trắng, nửa sau đảo màu - chỉ ~0,12 s
    function impactFrame(g, sn, people, x, y, k) {
        const inv = k > 0.5, R = Math.hypot(W, H);
        ctx.save();
        ctx.fillStyle = inv ? 'rgba(248,246,255,.95)' : 'rgba(14,4,12,.93)'; ctx.fillRect(-40, -40, W + 80, H + 80);
        ctx.fillStyle = inv ? 'rgba(10,6,14,.9)' : 'rgba(255,255,255,.92)';
        for (let i = 0; i < 44; i++) {
            const a = i / 44 * TAU + hash(i) * 0.12, w = 0.012 + hash(i + 3) * 0.03, r0 = R * (0.06 + hash(i + 7) * 0.12);
            ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
            ctx.lineTo(x + Math.cos(a - w) * R, y + Math.sin(a - w) * R); ctx.lineTo(x + Math.cos(a + w) * R, y + Math.sin(a + w) * R); ctx.closePath(); ctx.fill();
        }
        if (sn) {
            tint(WS, PC, inv ? '#0a060e' : '#ffffff', 'source-in');
            for (const p of people) if (p && p.a > 0) place(WS, sn, g, p.x, p.y, p.s, { ...p, a: 1 });
        }
        ctx.restore();
    }
    // 🪟 mảnh kính rơi từ chỗ va chạm
    function glassBurst(F, x, y, R) {
        for (let i = 0; i < 30; i++) {
            const a = Math.random() * TAU, d = Math.random() * R * 0.35, s = R * (0.02 + Math.random() * 0.045);
            F.gs.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a) * (150 + Math.random() * 500), vy: -150 + Math.random() * 300, r: Math.random() * TAU, vr: (Math.random() - 0.5) * 14,
                pts: [[-s, -s * 0.4], [s * 0.7, -s], [s * (0.2 + Math.random() * 0.6), s]], t: 0, life: 1.4 + Math.random() * 0.6 });
        }
    }
    function drawGlass(F, dt) {
        if (!F.gs.length) return;
        ctx.save();
        for (const p of F.gs) {
            p.t += dt; p.vy += 2600 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
            const a = 1 - clamp01((p.t - p.life + 0.4) / 0.4), lit = 0.5 + 0.5 * Math.sin(p.r * 2);
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
            ctx.beginPath(); ctx.moveTo(p.pts[0][0], p.pts[0][1]); ctx.lineTo(p.pts[1][0], p.pts[1][1]); ctx.lineTo(p.pts[2][0], p.pts[2][1]); ctx.closePath();
            ctx.fillStyle = `rgba(215,238,255,${(0.18 + 0.35 * lit) * a})`; ctx.fill();
            ctx.strokeStyle = `rgba(255,255,255,${0.85 * a})`; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.restore();
        }
        ctx.restore();
        F.gs = F.gs.filter(p => p.t < p.life && p.y < H + 200);
    }
    // 🌊 năng lượng hút vào cầu chưởng (vạch sáng chạy từ xa vào tâm)
    function inflow(x, y, R, r, a, t) {
        if (a <= 0) return;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (let i = 0; i < 22; i++) {
            const ph = (t * 1.7 + hash(i)) % 1, an = hash(i + 3) * TAU + t * 0.6, d = lerp(R, r * 1.1, easeIn(ph)), len = R * 0.12 * (1 - ph * 0.6);
            ctx.strokeStyle = `rgba(170,230,255,${a * ph * 0.9})`; ctx.lineWidth = 2 + hash(i + 5) * 3;
            ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * (d + len), y + Math.sin(an) * (d + len)); ctx.lineTo(x + Math.cos(an) * d, y + Math.sin(an) * d); ctx.stroke();
        }
        ctx.restore();
    }
    // vạch dịch chuyển tức thời (bóng lướt từ chỗ cũ tới chỗ mới)
    function zip(a, b, k, col, w) {
        if (k <= 0) return;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (let i = -1; i <= 1; i++) {
            ctx.strokeStyle = i ? rgba(col, 0.35 * k) : `rgba(255,255,255,${0.7 * k})`; ctx.lineWidth = i ? w * 0.5 : w * 0.25;
            ctx.beginPath(); ctx.moveTo(a.x, a.y + i * w * 0.6); ctx.lineTo(b.x, b.y + i * w * 0.6); ctx.stroke();
        }
        ctx.restore();
    }

    // =====================================================================================================================
    // ☁ MÂY CƯỠI DƯỚI CHÂN (user 2026-10-28): che đùi / mép cụt của camera nửa người → như có chân đang bay. Vẽ 3D MỘT lần mỗi lượt:
    // mỗi cụm mây là một quả cầu (tâm sáng lệch về phía nắng trên-phải, mép xám xanh), bụng tối, viền nắng, quầng xốp mờ quanh mép.
    // 2 lớp: SAU lưng người (cụm cao hơn) + TRƯỚC người (thân mây che đùi). Bản sao bóng tối cưỡi mây giông tím. Vệt mây bay theo hướng đi.
    // =====================================================================================================================
    const CLOUD = { key: '', back: null, front: null, dback: null, dfront: null, w: 0, h: 0 };
    let WISP = null;
    function cloudCanvas(w, hh, puffs, dark) {
        const pad = Math.ceil(hh * 0.22), cw = w + pad * 2, ch = hh + pad * 2, c = canvas(cw, ch), x = c.getContext('2d');
        x.translate(pad, pad);
        const all = (fill, k = 1) => { x.fillStyle = fill; x.beginPath(); for (const [px, py, r] of puffs) { x.moveTo(px + r * k, py); x.arc(px, py, r * k, 0, TAU); } x.fill(); };
        // quầng hơi nước mềm quanh mép
        x.filter = `blur(${Math.max(3, Math.round(hh * 0.06))}px)`; all('rgba(255,255,255,.55)', 1.12);
        // khối mây: mép hơi mềm (không viền cứng như bong bóng)
        x.filter = `blur(${Math.max(1, Math.round(hh * 0.012))}px)`; all('#eef3f9'); x.filter = 'none';
        x.globalCompositeOperation = 'source-atop';
        // từng cụm (súp lơ): bóng mờ phía dưới-trái, sáng rực phía trên-phải (nắng) → khối 3D, ranh giới cụm hoà vào nhau
        for (const [px, py, r] of puffs) {
            const g = x.createRadialGradient(px - r * 0.2, py + r * 0.45, 0, px - r * 0.2, py + r * 0.45, r * 0.95);
            g.addColorStop(0, 'rgba(88,108,150,.22)'); g.addColorStop(1, 'rgba(88,108,150,0)');
            x.fillStyle = g; x.fillRect(px - r * 1.3, py - r * 0.6, r * 2.4, r * 2.2);
        }
        for (const [px, py, r] of puffs.slice().sort((p1, p2) => p2[1] - p1[1])) {
            const g = x.createRadialGradient(px + r * 0.22, py - r * 0.38, 0, px + r * 0.22, py - r * 0.38, r * 0.8);
            g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
            x.fillStyle = g; x.fillRect(px - r, py - r * 1.3, r * 2.4, r * 2);
        }
        // bụng mây tối + đáy phẳng xám xanh (khối dày)
        let g = x.createLinearGradient(0, hh * 0.35, 0, hh * 0.95);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(120,140,180,.32)'); g.addColorStop(1, 'rgba(95,115,160,.55)');
        x.fillStyle = g; x.fillRect(-pad, -pad, cw, ch);
        // viền nắng ấm trên đỉnh
        g = x.createLinearGradient(0, 0, 0, hh * 0.4);
        g.addColorStop(0, 'rgba(255,246,220,.5)'); g.addColorStop(1, 'rgba(255,246,220,0)');
        x.fillStyle = g; x.fillRect(-pad, -pad, cw, ch);
        if (dark) {     // mây giông của bản sao bóng tối
            x.fillStyle = 'rgba(48,18,78,.66)'; x.fillRect(-pad, -pad, cw, ch);
            g = x.createLinearGradient(0, 0, 0, hh * 0.4); g.addColorStop(0, 'rgba(200,120,255,.35)'); g.addColorStop(1, 'rgba(200,120,255,0)');
            x.fillStyle = g; x.fillRect(-pad, -pad, cw, ch);
        }
        x.globalCompositeOperation = 'source-over';
        return { c, pad };
    }
    function buildClouds(nh, seed) {
        const key = String(Math.round(nh));      // theo CỠ, không theo hạt giống: dựng một lần, lượt sau dùng lại (đỡ 4 canvas blur sau mỗi lượt)
        if (CLOUD.key === key) return;
        let s = (seed ^ 0x5bd1e995) >>> 0 || 7;
        const R = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
        const w = nh * 0.9, hh = nh * 0.4, front = [], back = [];
        // MÂY TRƯỚC (che đùi): đế = hàng cụm to đáy gần phẳng · thân = cụm lớn giữa phồng cao · đỉnh = cụm nhỏ nhấp nhô
        for (let i = 0; i < 7; i++) { const u = i / 6, r = hh * (0.19 + 0.07 * Math.sin(Math.PI * u)) * (0.9 + R() * 0.2); front.push([w * (0.13 + 0.74 * u) + (R() - 0.5) * w * 0.03, hh * 0.84 - r * 0.78, r]); }
        for (let i = 0; i < 6; i++) { const u = (i + 0.5) / 6, env = Math.sin(Math.PI * u), r = hh * (0.15 + 0.15 * env) * (0.85 + R() * 0.3); front.push([w * (0.14 + 0.72 * u) + (R() - 0.5) * w * 0.05, hh * 0.62 - env * hh * 0.16, r]); }
        for (let i = 0; i < 9; i++) { const u = 0.08 + R() * 0.84, env = Math.sin(Math.PI * u), r = hh * (0.07 + 0.09 * env) * (0.85 + R() * 0.3); front.push([w * u, hh * 0.46 - env * hh * 0.2 + R() * hh * 0.05, r]); }
        // MÂY SAU (sau lưng, cao hơn, lệch 2 bên)
        for (let i = 0; i < 6; i++) { const u = i / 5, r = hh * (0.15 + 0.12 * Math.sin(Math.PI * u)) * (0.85 + R() * 0.3); back.push([w * (0.16 + 0.68 * u), hh * 0.52 - r * 0.6 + (R() - 0.5) * hh * 0.08, r]); }
        for (let i = 0; i < 6; i++) { const u = 0.15 + R() * 0.7, r = hh * (0.07 + 0.07 * R()); back.push([w * u, hh * 0.32 - Math.sin(Math.PI * u) * hh * 0.12, r]); }
        CLOUD.key = key; CLOUD.w = w; CLOUD.h = hh;
        CLOUD.front = cloudCanvas(w, hh, front, false); CLOUD.back = cloudCanvas(w, hh, back, false);
        CLOUD.dfront = cloudCanvas(w, hh, front, true); CLOUD.dback = cloudCanvas(w, hh, back, true);
        if (!WISP) {
            const c = canvas(96, 96), x = c.getContext('2d'), g = x.createRadialGradient(44, 42, 4, 48, 48, 46);
            g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(0.5, 'rgba(240,245,252,.55)'); g.addColorStop(1, 'rgba(200,215,235,0)');
            x.fillStyle = g; x.fillRect(0, 0, 96, 96);
            WISP = c;
        }
    }
    // vị trí mây theo người q: tâm thân mây ở đùi (thấy cả người) / mép cụt (camera nửa người)
    const cloudY = (g, q) => q.s * g.ph * (g.full ? 0.27 : 0.36);
    // vẽ một lớp mây (sp = CLOUD.front / back …) dưới người q; thở nhẹ + một bản mờ trôi lệch → mây "sôi"
    function drawCloudLayer(sp, g, q, t, sc, lift, a) {
        if (!sp || a <= 0) return;
        const k = q.s / sc, w = CLOUD.w * k, hh = CLOUD.h * k, pad = sp.pad * k;
        ctx.save();
        ctx.translate(q.x, q.y); if (q.rot) ctx.rotate(q.rot);
        ctx.translate(0, cloudY(g, q) - lift * hh);
        const bx = 1 + Math.sin(t * 2.1) * 0.025, by = 1 + Math.sin(t * 2.7 + 1) * 0.04;
        ctx.globalAlpha = a;
        ctx.drawImage(sp.c, -w / 2 * bx - pad, -hh / 2 * by - pad, (w + pad * 2) * bx, (hh + pad * 2) * by);
        ctx.globalAlpha = a * 0.35;
        const dx = Math.sin(t * 1.3) * w * 0.03;
        ctx.drawImage(sp.c, -w / 2 * by - pad + dx, -hh / 2 * bx - pad, (w + pad * 2) * by, (hh + pad * 2) * bx);
        ctx.restore();
    }
    // vệt mây: cụm hơi nước bong ra từ mây, trôi ngược hướng bay, kéo dài theo tốc độ, tan dần
    function wisps(F, g, q, dt, a, sc) {
        const L = F.cw;
        if (q && a > 0 && dt > 0) {
            const lq = F.lastQ, vx = lq ? (q.x - lq.x) / dt : 0, vy = lq ? (q.y - lq.y) / dt : 0, sp = Math.hypot(vx, vy), nh = q.s * g.ph;
            const hh = CLOUD.h * q.s / sc, w = CLOUD.w * q.s / sc;
            F.cwAcc += dt * (5 + Math.min(40, sp / Math.max(1, nh) * 14)) * a;
            while (F.cwAcc >= 1) {
                F.cwAcc -= 1;
                const side = (Math.random() - 0.5) * w * 0.85;
                L.push({ x: q.x + side, y: q.y + cloudY(g, q) + (Math.random() - 0.2) * hh * 0.4,
                    vx: -vx * 0.28 + side * 0.4 + (Math.random() - 0.5) * nh * 0.12, vy: -vy * 0.28 + nh * (0.05 + Math.random() * 0.12),
                    r: hh * (0.3 + Math.random() * 0.3), t: 0, life: 0.7 + Math.random() * 0.6, st: 1 + Math.min(2.2, sp / Math.max(1, nh * 1.6)), an: Math.atan2(-vy, -vx), a });
            }
        }
        if (!L.length || !WISP) return;
        ctx.save();
        for (const p of L) {
            p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 1.2; p.vy *= 1 - dt * 1.2;
            const k = clamp01(p.t / p.life), r = p.r * (1 + k * 0.9);
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.st > 1.15 ? p.an : 0); ctx.scale(p.st, 1);
            ctx.globalAlpha = 0.6 * p.a * (1 - k) * Math.min(1, p.t / 0.08);
            ctx.drawImage(WISP, -r, -r, r * 2, r * 2);
            ctx.restore();
        }
        ctx.restore();
        F.cw = L.filter(p => p.t < p.life);
    }

    // =====================================================================================================================
    // 🥊 kế hoạch đánh nhau (tỉ lệ 0..1 trong vùng trời - đổi ra toạ độ lúc vẽ)
    // =====================================================================================================================
    function fightPlan(f, L) {
        const R = Math.random, n = clamp(2 + (Number(f.sc.power) || 2), 2, Math.max(2, Math.floor(L * 0.66 / 650))), cl = [];
        for (let j = 0; j < n; j++) {
            const side = j % 2 ? 1 : -1, mx = 0.38 + R() * 0.24, dx = 0.16 + R() * 0.1;
            cl.push({ a: [mx + side * dx, 0.15 + R() * 0.85], b: [mx - side * dx, 0.15 + R() * 0.85], m: [mx + (R() - 0.5) * 0.05, 0.2 + R() * 0.7] });
        }
        return { cl, ex: 0.2 + R() * 0.6, exSide: R() < 0.5 ? -1 : 1 };
    }

    // =====================================================================================================================
    // lượt
    // =====================================================================================================================
    function start(f) {
        let act = ACTS.includes(f.sc.act) ? f.sc.act : '';
        if (!act) { const pool = ACTS.filter(a => a !== lastAct); act = pool[(Math.random() * pool.length) | 0]; }
        lastAct = act;
        // hạt giống cảnh: bản VẼ SẴN nếu xong; không thì dùng lại cảnh lượt trước (combo nối nhau không phải dựng lại); lượt đầu mới dựng mới
        const v = (h.view && h.view()) || { x: 0, y: 0, w: W, h: H };
        const seed = PRE && PRE.done && PRE.key === sceneKey(v, PRE.seed) ? PRE.seed : SCN.key && SCN.key === sceneKey(v, SCN.seed) ? SCN.seed : (Math.random() * 1e9) | 0;
        runEnd = performance.now() + (Number(f.p && f.p.end) || 10000);
        schedulePre(runEnd - performance.now() + 800);
        f.fly = { act, seed, fl: [], flAcc: 0, trail: [], rk: [], rkAcc: 0, sm: [], sp: [], rings: [], gs: [], once: new Set(), cw: [], cwAcc: 0, lastQ: null,
                  q: null, cr: null, fp: null, ex: null };
    }
    function frame(f, e, dt, g) {
        const P = f.p, F = f.fly, v = g.v, t = e / 1000, col = f.sc.color || '#ffd23a', pw = Number(f.sc.power) || 2;
        if (!F) return;
        ensureScene(f, v);
        const ph = g.ph, Yb = roofAt(v, g.cx, g.cx);      // mái ngay cột NPC: hào quang loé, đá vụn bay lên từ đây
        const s1 = clamp(v.h * 0.24 / ph, 0.12, 0.55) * 1.12, nh1 = s1 * ph;
        buildClouds(nh1, F.seed);
        const OX = g.cx, OY = g.floorY - ph / 2;
        const HX = clamp(g.cx, v.x + v.w * 0.3, v.x + v.w * 0.7), HY = v.y + v.h * 0.34;
        const hidY = roofLow(v, g.cx, g.cx - nh1 * 0.48, g.cx + nh1 * 0.48) + nh1 * 0.62 + 14;      // đỉnh đầu + mây khuất dưới mái thấp nhất
        const bob = Math.sin(t * 3.2) * nh1 * 0.03;
        const L = Math.max(1, P.actB - P.actA), u = clamp01((e - P.actA) / L), at = k => P.actA + L * k;
        const yMin = v.y + nh1 * 0.62 + v.h * 0.03, yMax = Math.max(yMin, Yb - nh1 * 0.6);
        const sky = (fx, fy) => ({ x: v.x + v.w * fx, y: lerp(yMin, yMax, fy) });
        // sự kiện MỘT lần (sinh hạt / vòng sóng) - chỉ khi vừa qua mốc (tua mốc xa thì bỏ)
        const once = (k, when) => (e >= when && e < when + 350 && !F.once.has(k) ? (F.once.add(k), true) : false);
        const BLUE = '#7fd4ff', PURP = '#c27bff';

        // --- 🔊 ---
        const { cue } = h;
        cue(f, e, 'in', 0, (X, vo) => { X.whoosh(0.7, { vol: vo * 0.4, f0: 1400, f1: 300 }); X.rumble(0.9, { vol: vo * 0.5 }); });
        cue(f, e, 'charge', P.hide, (X, vo) => { X.rumble((P.riseA - P.hide) / 1000 + 0.3, { vol: vo * 0.8 }); X.portal((P.riseA - P.hide) / 1000, { vol: vo * 0.35 }); X.debris(6, { vol: vo * 0.4, spread: 0.6 }); });
        cue(f, e, 'rise', P.riseA, (X, vo) => { X.crack(0.7, { vol: vo * 0.7 }); X.thud(1.1, { vol: vo * 0.6 }); X.whoosh((P.riseB - P.riseA) / 1000 + 0.2, { vol: vo * 0.7, f0: 260, f1: 2200 }); X.debris(10, { vol: vo * 0.5, spread: 1 }); });
        cue(f, e, 'pu', P.actA, (X, vo) => { X.zap(0.6, { vol: vo * 0.5 }); X.whoosh(0.4, { vol: vo * 0.4, f0: 500, f1: 2400 }); });
        cue(f, e, 'back', P.backA, (X, vo) => X.whoosh((P.land - P.backA) / 1000, { vol: vo * 0.45, f0: 1600, f1: 350 }));
        cue(f, e, 'land', P.land, (X, vo) => { X.thud(1.2, { vol: vo }); X.rustle(0.3, { vol: vo * 0.6 }); });

        // --- trạng thái NPC + bản sao (tính trước, vẽ sau theo lớp) ---
        let q = null, clone = null, behind = true, fast = false, shake = 0, arcs = 0, blueLit = 0, orig = 0;
        let ball = null, beamR = 0, beamC = null, beamA = 0, white = 0, dim = 0, zoomA = 0, crackA = 0, flashes = [], domeK = 0, imp = null, zips = [];
        const punches = [];     // [mốc, x, y, độ giật] - giật camera + tách màu RGB lúc va chạm
        const chromaBase = 0;     // KHÔNG tách màu liên tục (4 bản sao màn mỗi khung = giật) - chỉ loé theo punches
        const sh = (when, dur, amp) => (f.sc.shake && e >= when && e < when + dur ? amp * (1 - (e - when) / dur) : 0);
        const IMP = 130;     // độ dài khung va chạm (ms)
        if (e < P.hide) {
            // ẩn cam: NPC BIẾN NGAY LẬP TỨC (user 2026-10-28, không mờ chồng hình) kèm "poof" khói + tia sáng tại chỗ, rồi cảnh mới hiện lên
            if (once('vanish', 0)) { puffRing(f, OX, g.floorY, ph * 0.08, 14, '235,235,240'); sparkBurst(F, OX, OY, 22, ph * 1.6, col); ringPush(F, OX, OY, ph * 0.3, 0.35, '#ffffff', 1, 6); }
            if (e < 180) flashes.push([OX, OY - ph * 0.1, ph * 0.2, e / 180, '#ffffff']);
        } else if (e < P.riseA) {
            q = null;
            if (f.sc.shake) shake = 4 + 4 * clamp01((e - P.hide) / (P.riseA - P.hide));
            // đá vụn trên mái lơ lửng bay lên
            F.rkAcc += dt * 18;
            while (F.rkAcc >= 1) { F.rkAcc -= 1; F.rk.push({ x: OX + (Math.random() - 0.5) * v.w * 0.22, y: Yb - 4, vx: (Math.random() - 0.5) * 20, vy: -(40 + Math.random() * 120), g: 0, r: Math.random() * TAU, vr: (Math.random() - 0.5) * 3, s: 3 + Math.random() * 7, t: 0, life: 1.2 + Math.random() * 0.8 }); }
        } else if (e < P.actA) {
            // cưỡi mây bay lên TỪ TỪ từ sau dãy nhà (cỡ bay giữ nguyên - user 2026-10-28)
            const k = clamp01((e - P.riseA) / (P.riseB - P.riseA)), kk = easeInOut(k);
            q = { x: lerp(OX, HX, kk), y: lerp(hidY, HY, kk) + bob * k, s: s1, aura: 1.2, a: 1, cloud: 1 };
            arcs = 0.3;
            shake = sh(P.riseA, 400, 8);
            if (once('rise', P.riseA)) {
                for (let i = 0; i < 8; i++) F.rk.push({ x: OX + (Math.random() - 0.5) * v.w * 0.12, y: Yb - 6, vx: (Math.random() - 0.5) * 300, vy: -(250 + Math.random() * 350), g: 1500, r: Math.random() * TAU, vr: (Math.random() - 0.5) * 8, s: 4 + Math.random() * 8, t: 0, life: 1.4 });
                puffRing(f, OX, Yb, v.h * 0.04, 10, '235,225,210');
                ringPush(F, OX, Yb, v.w * 0.24, 0.6, col, 0.18, 10);
                sparkBurst(F, OX, Yb - 10, 12, v.h * 0.8, col);
            }
        } else if (e < P.actB) {
            behind = false;
            // ⚡ bung sức đầu pha ra đòn: hào quang phồng lên, vòng sóng, tia điện
            const pu = 1 - clamp01((e - P.actA) / 500);
            const hov = { x: HX, y: HY + bob, s: s1, aura: 1 + 0.8 * pu, a: 1, cloud: 1 };
            arcs = 0.3 + 0.7 * pu;
            if (once('pu', P.actA)) { ringPush(F, HX, HY, nh1 * 1.3, 0.5, col, 1, 10); ringPush(F, HX, HY + nh1 * 0.1, nh1 * 1.8, 0.6, col, 0.3, 12); sparkBurst(F, HX, HY, 18, nh1 * 3, col); }
            if (F.act === 'beam') {
                const kc = clamp01(u / 0.42), kf = clamp01((u - 0.42) / 0.13), fire = at(0.42);
                q = { ...hov, aura: Math.max(hov.aura, 1 + 0.8 * kc) };
                // gom chưởng bên hông (kiểu Kamehameha, không che người) → lúc bắn đẩy ra trước ngực
                const side = q.x > v.x + v.w / 2 ? -1 : 1, kp = easeInOut(clamp01((u - 0.36) / 0.08));
                const bx = q.x + side * nh1 * 0.3 * (1 - kp), by = q.y + nh1 * 0.06 * (1 - kp) - nh1 * 0.08 * kp;
                dim = 0.45 * kc * (1 - clamp01((u - 0.85) / 0.1));
                cue(f, e, 'b-charge', P.actA, (X, vo) => { X.portal(L * 0.42 / 1000, { vol: vo * 0.6 }); X.rumble(L * 0.42 / 1000, { vol: vo * 0.5 }); X.beam(L * 0.42 / 1000, { vol: vo * 0.3 }); });
                cue(f, e, 'b-fire', fire, (X, vo) => { X.beam(L * 0.4 / 1000, { vol: vo * 1.2 }); X.thud(1.5, { vol: vo }); X.crack(0.8, { vol: vo * 0.5 }); X.rumble(L * 0.45 / 1000, { vol: vo }); });
                if (u < 0.42) {
                    ball = { x: bx, y: by, r: nh1 * (0.04 + 0.15 * easeIn(kc)) * (1 + Math.sin(t * 30) * 0.07), k: kc };
                    blueLit = kc; arcs = Math.max(arcs, kc * 0.45);
                    if (f.sc.shake) shake = 2 + 6 * kc;
                    // nhịp đập: cứ 0,35 s cầu chưởng phát một vòng sóng
                    const beat = Math.floor((e - P.actA) / 350);
                    if (kc > 0.25 && once('bb' + beat, P.actA + beat * 350)) ringPush(F, bx, by, ball.r * 3.2, 0.4, BLUE, 1, 6);
                } else {
                    // bắn vào màn: giật lùi, khung va chạm, đĩa lớn dần theo hàm mũ, tâm trôi về giữa khung
                    const r0 = nh1 * 0.2, Rm = Math.hypot(W, H) * 0.9, rec = Math.sin(clamp01((e - fire) / 260) * Math.PI) * nh1 * 0.06;
                    q = { ...q, y: q.y - rec };
                    beamR = r0 * Math.pow(Rm / r0, easeIn(kf));
                    beamC = { x: lerp(bx, v.x + v.w / 2, easeOut(kf)), y: lerp(by, v.y + v.h * 0.62, easeOut(kf)), sx: bx, sy: by };      // rời tay nhanh, lao xuống giữa màn (gần người xem)
                    beamA = 1 - clamp01((u - 0.82) / 0.08);
                    blueLit = beamA;
                    white = u < 0.8 ? 0 : u < 0.88 ? (u - 0.8) / 0.08 : 1 - clamp01((u - 0.88) / 0.12);
                    if (u > 0.88) q = { ...hov, aura: 1 };
                    punches.push([fire, bx, by, 0.05]);
                    if (f.sc.shake) shake = u < 0.86 ? 12 + 10 * pw / 3 : 0;
                    if (once('bfire', fire)) { ringPush(F, bx, by, nh1 * 2.5, 0.45, BLUE, 1, 16); ringPush(F, bx, by, nh1 * 4, 0.7, '#ffffff', 1, 10); sparkBurst(F, bx, by, 34, nh1 * 6, BLUE); }
                    if (e < fire + IMP) imp = { x: bx, y: by, k: (e - fire) / IMP };
                }
            } else if (F.act === 'dive') {
                // dính kính: đầu + ngực trùm gần kín khung (đỉnh đầu sát mép trên, thân tràn xuống dưới)
                const sBig = clamp(v.h * 2.1 / ph, s1 * 3, 5), cX = v.x + v.w / 2, cY = v.y + v.h * 0.04 + sBig * ph / 2, hit = at(0.38), hY = v.y + v.h * 0.3;
                cue(f, e, 'd-wind', P.actA, (X, vo) => X.rumble(L * 0.22 / 1000, { vol: vo * 0.6 }));
                cue(f, e, 'd-dash', at(0.22), (X, vo) => X.whoosh(L * 0.16 / 1000 + 0.05, { vol: vo * 0.8, f0: 250, f1: 2600 }));
                cue(f, e, 'd-hit', hit, (X, vo) => { X.thud(1.5, { vol: vo }); X.shatter(0.8, { vol: vo * 0.8 }); X.crack(0.7, { vol: vo * 0.6 }); X.tinkle(14, { vol: vo * 0.5, spread: 1.2 }); });
                cue(f, e, 'd-slide', at(0.6), (X, vo) => X.whoosh(L * 0.22 / 1000, { vol: vo * 0.25, f0: 900, f1: 500 }));
                cue(f, e, 'd-back', at(0.82), (X, vo) => X.whoosh(L * 0.18 / 1000, { vol: vo * 0.5, f0: 300, f1: 1800 }));
                if (u < 0.22) {
                    const k = easeOut(u / 0.22);
                    q = { x: HX, y: HY - nh1 * 0.12 * k + bob, s: s1 * (1 - 0.12 * k), aura: 1.2 + 0.8 * k, a: 1, rot: -0.08 * k, cloud: 1 };
                    arcs = 0.6 + 0.4 * k;
                    if (f.sc.shake) shake = 3 + 3 * k;
                } else if (u < 0.38) {
                    const k = easeIn(easeIn((u - 0.22) / 0.16));
                    q = { x: lerp(HX, cX, k), y: lerp(HY - nh1 * 0.12, cY, k), s: s1 * 0.88 * Math.pow(sBig / (s1 * 0.88), k), aura: 2, a: 1, rot: -0.08 * (1 - k), cloud: 1 - clamp01(k * 2.5) };
                    fast = true; zoomA = 0.35 + 0.65 * k;
                    if (once('dash', at(0.22))) ringPush(F, HX, HY, nh1 * 1.6, 0.35, col, 1, 10);
                } else if (u < 0.82) {
                    if (!F.cr) F.cr = vfx.makeGlass(cX, hY, Math.max(v.w, v.h) * 0.6);
                    punches.push([hit, cX, hY, 0.08]);
                    const k = (u - 0.38) / 0.44, ks = clamp01((k - 0.5) / 0.5), w = Math.sin(e / 45) * 0.012 * (1 - clamp01(k * 3));
                    // dính bẹp lên kính → trượt xuống
                    q = { x: cX, y: cY + easeIn(ks) * v.h * 1.25, s: sBig, sx: 1.14 + w, sy: 0.9 - w, aura: 0, a: 1, rot: 0.12 * ks };
                    if (e >= hit + IMP) flashes.push([cX, hY, v.h * 0.55, clamp01((e - hit - IMP) / 260), '#cfeaff']);
                    shake = sh(hit, 600, 34);
                    if (once('dhit', hit)) { glassBurst(F, cX, hY, Math.max(v.w, v.h)); ringPush(F, cX, hY, v.h * 0.9, 0.5, '#ffffff', 1, 14); sparkBurst(F, cX, hY, 30, v.h * 2.2, '#cfeaff'); }
                    if (e < hit + IMP) imp = { x: cX, y: hY, k: (e - hit) / IMP };
                } else {
                    const k = clamp01((u - 0.82) / 0.18), kk = 1 - Math.pow(1 - k, 3);
                    q = { x: HX, y: lerp(hidY, HY, kk) + bob, s: s1, aura: 1.3, a: 1, cloud: 1 };
                    behind = true; fast = k < 0.85;
                }
                crackA = u < 0.38 ? 0 : 1 - clamp01((u - 0.84) / 0.16);
            } else {
                // 🥊 đánh nhau với bản sao bóng tối: mỗi hiệp = hiện ra · lao vào · MƯA ĐÒN sát nhau · cú nặng văng ra · biến mất (dịch chuyển)
                if (!F.fp) F.fp = fightPlan(f, L);
                const fp = F.fp, n = fp.cl.length, c0 = 0.1, c1 = 0.78, sl = (c1 - c0) / n, gap = nh1 * 0.3;
                const slotPos = (j, w) => {
                    const c = fp.cl[j], A = sky(c.a[0], c.a[1]), B = sky(c.b[0], c.b[1]), M = sky(c.m[0], c.m[1]);
                    const dir = Math.sign(B.x - A.x) || 1, MA = { x: M.x - dir * gap, y: M.y }, MB = { x: M.x + dir * gap, y: M.y };
                    const backA = { x: lerp(MA.x, A.x, 0.5), y: MA.y - nh1 * 0.1 }, backB = { x: lerp(MB.x, B.x, 0.5), y: MB.y - nh1 * 0.1 };
                    let pa, pb, al = 1, lean = 0, ph = 'in';
                    if (w < 0.25) { pa = A; pb = B; al = j ? easeOut(clamp01(w / 0.12)) : 1; }
                    else if (w < 0.45) { const k = easeIn((w - 0.25) / 0.2); pa = { x: lerp(A.x, MA.x, k), y: lerp(A.y, MA.y, k) }; pb = { x: lerp(B.x, MB.x, k), y: lerp(B.y, MB.y, k) }; lean = 0.3; ph = 'dash'; }
                    else if (w < 0.68) { const jx = Math.sin(e / 26) * nh1 * 0.04, jy = Math.cos(e / 33) * nh1 * 0.03; pa = { x: MA.x + jx, y: MA.y + jy }; pb = { x: MB.x + jx * 0.8, y: MB.y - jy }; lean = 0.14 + Math.sin(e / 40) * 0.08; ph = 'bar'; }
                    else if (w < 0.88) { const k = easeOut((w - 0.68) / 0.2); pa = { x: lerp(MA.x, backA.x, k), y: lerp(MA.y, backA.y, k) }; pb = { x: lerp(MB.x, backB.x, k), y: lerp(MB.y, backB.y, k) }; lean = -0.25 * (1 - k); ph = 'back'; }
                    else { pa = backA; pb = backB; al = j < n - 1 ? 1 - (w - 0.88) / 0.12 : 1; ph = 'out'; }
                    return { pa, pb, al, lean, dir, M, ph };
                };
                cue(f, e, 'f-in', P.actA, (X, vo) => { X.pop(1.2, { vol: vo * 0.6 }); X.zap(0.5, { vol: vo * 0.4 }); X.whoosh(0.35, { vol: vo * 0.4, f0: 1800, f1: 400 }); });
                fp.cl.forEach((c, j) => {
                    const big = at(c0 + sl * (j + 0.68)), M = sky(c.m[0], c.m[1]);
                    cue(f, e, 'f-dash' + j, at(c0 + sl * (j + 0.25)), (X, vo) => X.whoosh(L * sl * 0.2 / 1000 + 0.05, { vol: vo * 0.4, f0: 600, f1: 2400 }));
                    // mưa đòn: 5 cú nhỏ lách tách trong lúc sát nhau
                    for (let b = 0; b < 5; b++) {
                        const bt = at(c0 + sl * (j + 0.46 + b * 0.044)), ox = (hash(j * 10 + b) - 0.5) * nh1 * 0.35, oy = (hash(j * 10 + b + 5) - 0.5) * nh1 * 0.45;
                        cue(f, e, `f-b${j}-${b}`, bt, (X, vo) => { X.slap(0.45, { vol: vo * 0.45, pan: (c.m[0] - 0.5) }); X.thud(0.35, { vol: vo * 0.3 }); });
                        if (e >= bt && e < bt + 90) flashes.push([M.x + ox, M.y + oy, nh1 * 0.24, (e - bt) / 90]);
                        if (once(`fb${j}-${b}`, bt)) sparkBurst(F, M.x + ox, M.y + oy, 6, nh1 * 2.2, col);
                    }
                    cue(f, e, 'f-hit' + j, big, (X, vo) => { X.slap(1.2, { vol: vo * 0.95, pan: (c.m[0] - 0.5) }); X.thud(0.9, { vol: vo * 0.7 }); });
                    if (e >= big && e < big + 260) flashes.push([M.x, M.y, nh1 * 0.95, (e - big) / 260]);
                    punches.push([big, M.x, M.y, 0.035]);
                    if (once('fh' + j, big)) { ringPush(F, M.x, M.y, nh1 * 1.4, 0.4, '#ffffff', 1, 12); ringPush(F, M.x, M.y, nh1 * 2, 0.5, col, 0.35, 10); sparkBurst(F, M.x, M.y, 22, nh1 * 4, col); sparkBurst(F, M.x, M.y, 10, nh1 * 3, PURP); }
                    shake = Math.max(shake, sh(big, 280, 20), e >= at(c0 + sl * (j + 0.46)) && e < big ? (f.sc.shake ? 5 : 0) : 0);
                });
                const fin = at(c1 + 0.22 * 0.25), boom = at(c1 + 0.22 * 0.6);
                cue(f, e, 'f-fin', fin, (X, vo) => { X.slap(1.5, { vol: vo }); X.thud(1.3, { vol: vo * 0.9 }); X.whoosh(0.6, { vol: vo * 0.5, f0: 2000, f1: 300 }); });
                cue(f, e, 'f-boom', boom, (X, vo) => { X.thud(1.6, { vol: vo * 0.8 }); X.rumble(1.3, { vol: vo * 0.9 }); X.debris(10, { vol: vo * 0.35, spread: 0.9 }); });
                shake = Math.max(shake, sh(fin, 360, 28), sh(boom, 700, 12));
                const cA = { aura: 1.2, a: 1, cloud: 1 }, cB = { aura: 1.2, a: 1, flip: true, cloud: 1 };
                if (u < c0) {
                    const k = u / c0, b = sky(fp.cl[0].b[0], fp.cl[0].b[1]);
                    q = { ...hov }; clone = { ...cB, x: b.x, y: b.y + bob, s: s1, a: easeOut(k) };
                    if (k < 0.6) flashes.push([b.x, b.y, nh1 * 0.9, k / 0.6]);
                    if (once('cin', P.actA)) { ringPush(F, b.x, b.y, nh1 * 1.5, 0.5, PURP, 1, 10); sparkBurst(F, b.x, b.y, 16, nh1 * 3, PURP); }
                    zips.push([{ x: HX, y: HY }, { x: HX, y: HY }, 0]);
                } else if (u < c1) {
                    const j = Math.min(n - 1, Math.floor((u - c0) / sl)), w = (u - c0) / sl - j, S = slotPos(j, w);
                    q = { ...cA, x: S.pa.x, y: S.pa.y + bob, s: s1, a: S.al, rot: S.lean * S.dir, flip: S.dir < 0 };
                    clone = { ...cB, x: S.pb.x, y: S.pb.y - bob, s: s1, a: S.al, rot: -S.lean * S.dir, flip: S.dir > 0 };
                    fast = S.ph === 'dash' || S.ph === 'back';
                    arcs = S.ph === 'bar' ? 1 : 0.4;
                    // vừa dịch chuyển tới chỗ mới: vệt lướt từ chỗ cũ
                    if (j > 0 && w < 0.14) { const O = slotPos(j - 1, 0.99), k = 1 - w / 0.14; zips.push([O.pa, S.pa, k, col], [O.pb, S.pb, k, PURP]); }
                } else {
                    // đòn chót: lao tới đá → khung va chạm → bản sao văng vào núi, nổ vòm
                    const w = (u - c1) / (1 - c1), S = slotPos(n - 1, 0.99), A0 = S.pa, B0 = S.pb, dir = S.dir;
                    const E = { x: v.x + v.w * (dir > 0 ? 0.62 + fp.ex * 0.3 : 0.08 + fp.ex * 0.3), y: v.y + v.h * 0.6 };
                    F.ex = E;
                    if (w < 0.25) {
                        const k = easeIn(w / 0.25);
                        q = { ...cA, aura: 2, x: lerp(A0.x, B0.x - dir * nh1 * 0.35, k), y: lerp(A0.y, B0.y, k), s: s1, rot: 0.35 * dir, flip: dir < 0 };
                        clone = { ...cB, x: B0.x, y: B0.y, s: s1, flip: dir > 0 }; fast = true; arcs = 1;
                    } else {
                        const kq = easeInOut(clamp01((w - 0.35) / 0.65)), kc = clamp01((w - 0.25) / 0.35);
                        const qA = { x: B0.x - dir * nh1 * 0.35, y: B0.y };
                        q = { ...cA, x: lerp(qA.x, HX, kq), y: lerp(qA.y, HY, kq) + bob * kq, s: s1, rot: 0.35 * dir * (1 - kq), flip: kq < 0.5 ? dir < 0 : false };
                        if (kc < 1) clone = { ...cB, x: lerp(B0.x, E.x, easeOut(kc)), y: lerp(B0.y, E.y, easeIn(kc)) - Math.sin(kc * Math.PI) * nh1 * 0.3, s: s1 * lerp(1, 0.08, easeIn(kc)), rot: kc * 9 * dir, flip: dir > 0, aura: 1 - kc, cloud: 1 - clamp01(kc * 3) };
                        if (e >= fin + IMP && w < 0.45) flashes.push([B0.x, B0.y, nh1 * 1.5, clamp01((e - fin - IMP) / 280)]);
                        punches.push([fin, B0.x, B0.y, 0.06]);
                        if (e < fin + IMP) { imp = { x: B0.x, y: B0.y, k: (e - fin) / IMP }; clone = { ...cB, x: B0.x, y: B0.y, s: s1, flip: dir > 0 }; }
                        if (once('ffin', fin)) { ringPush(F, B0.x, B0.y, nh1 * 2.2, 0.5, '#ffffff', 1, 16); sparkBurst(F, B0.x, B0.y, 30, nh1 * 5, col); }
                        domeK = (w - 0.6) / 0.4;
                        if (once('boom', boom)) {
                            for (let i = 0; i < 10; i++) F.sm.push({ x: E.x + (Math.random() - 0.5) * v.h * 0.1, y: E.y - Math.random() * v.h * 0.06, vx: (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 80, t: 0, life: 1.4 + Math.random(), r: v.h * (0.04 + Math.random() * 0.04), c: '120,110,105' });
                            ringPush(F, E.x, E.y, v.h * 0.4, 0.8, '#ffd9a0', 0.22, 14);
                            sparkBurst(F, E.x, E.y - v.h * 0.03, 26, v.h * 0.9, '#ffb060');
                        }
                    }
                }
            }
            if (q) F.q = { x: q.x, y: q.y, s: q.s };
        } else if (e < P.land) {
            // hạ xuống khuất sau dãy nhà → cảnh tan, cam (NPC gốc) hiện lại tại chỗ
            const Q = F.q || { x: HX, y: HY, s: s1 }, kd = clamp01((e - P.backA) / 650);
            if (kd < 1) { const k = easeInOut(kd); q = { x: lerp(Q.x, OX, k), y: lerp(Q.y, hidY, k), s: lerp(Q.s, s1, k), aura: 1, a: 1, cloud: 1 }; fast = kd > 0.15; }
            // cảnh tan HẲN rồi NPC gốc hiện lại TỨC THÌ (không chồng mờ) kèm "poof"
            if (e >= P.land - 100) { orig = 1; behind = false; }
        } else {
            behind = false; orig = 1;
        }
        if (once('appear', P.land - 100)) { puffRing(f, OX, g.floorY, ph * 0.08, 14, '235,235,240'); sparkBurst(F, OX, OY, 18, ph * 1.4, col); ringPush(F, OX, OY, ph * 0.45, 0.4, '#ffffff', 1, 10); }
        if (e >= P.land - 100 && e < P.land + 80) flashes.push([OX, OY - ph * 0.1, ph * 0.2, (e - P.land + 100) / 180, '#ffffff']);
        trailPush(f, q, fast);

        // --- rung màn (fx-morph dời nền phòng theo f.sx / f.sy ở khung sau) ---
        f.sx = shake ? (Math.random() - 0.5) * shake : 0; f.sy = shake ? (Math.random() - 0.5) * shake : 0;
        let zoom = 1, zx = W / 2, zy = H / 2, chromaAmt = chromaBase;
        for (const [when, x, y, amp] of punches) {
            if (e < when || e >= when + 280) continue;
            const k = (e - when) / 280, dz = amp * (1 - k) * (1 - k);
            if (1 + dz > zoom) { zoom = 1 + dz; zx = x; zy = y; }
            chromaAmt = Math.max(chromaAmt, 16 * (1 - k) * amp / 0.05);
        }
        ctx.setTransform(zoom, 0, 0, zoom, f.sx + zx * (1 - zoom), f.sy + zy * (1 - zoom));

        // --- lớp cảnh ---
        // trời / núi PHỦ KÍN ngay khung đầu tới lúc cắt cuối (land − 100) - không mờ dần lộ phòng: lúc phủ kín fx-morph KHÔNG vẽ phòng sạch
        // (HpRoom._refill đọc điểm ảnh ~35 ms mỗi 0,5 s = cú khựng user báo 2026-10-28). Dãy nhà vẫn trồi lên (inK) / hạ xuống (outK).
        const inK = easeOut(clamp01(e / P.sceneB)), outK = easeInOut(clamp01((e - P.backA - 450) / (P.land - 100 - P.backA - 450)));
        const sceneA = e < P.land - 100 ? 1 : 0;
        white = Math.max(white, 0.85 * (1 - clamp01(e / 220)), e >= P.land - 100 ? 0.85 * (1 - clamp01((e - P.land + 100) / 260)) : 0);
        const riseK = easeInOut(clamp01((e - P.riseA) / (P.riseB - P.riseA))), camY = v.h * 0.05 * riseK * (1 - outK);
        const fgDrop = (1 - inK) * v.h * 0.45 + outK * v.h * 0.45 + camY * 1.6;
        drawScene(v, sceneA, camY, t);
        if (dim > 0) { ctx.fillStyle = `rgba(4,12,40,${dim})`; ctx.fillRect(-40, -40, W + 80, H + 80); }
        // quầng sáng hào quang rọi lên trời quanh NPC (đang bay)
        if (q && q.aura && !behind && q.s < 1.5) glowBall(q.x, q.y, q.s * ph * 0.55 * (1 + Math.sin(t * 9) * 0.05), 0.22 * Math.min(1, q.aura), col, col);
        // hào quang loé sau mái lúc gom sức
        if (e >= P.hide && e < P.riseA + 400) {
            const k = e < P.riseA ? easeIn(clamp01((e - P.hide) / (P.riseA - P.hide))) : 1 - clamp01((e - P.riseA) / 400);
            const fl = 1 + Math.sin(t * 40) * 0.08;
            glowBall(OX, Yb, v.h * 0.13 * k * fl, k, col, col);
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 6; i++) {
                const bx = OX + (hash(i) - 0.5) * v.w * 0.12, bh = v.h * (0.25 + hash(i + 4) * 0.35) * k * (0.8 + Math.sin(t * 25 + i) * 0.2), bw = v.w * (0.006 + hash(i + 8) * 0.01);
                const gr = ctx.createLinearGradient(0, Yb, 0, Yb - bh); gr.addColorStop(0, rgba(col, 0.85 * k)); gr.addColorStop(1, rgba(col, 0));
                ctx.fillStyle = gr; ctx.fillRect(bx - bw / 2, Yb - bh, bw, bh);
            }
            ctx.restore();
        }

        // --- người: chụp một lần, tô bóng hào quang ---
        const maxS = Math.max(q ? q.s : 0, clone ? clone.s : 0);
        const sn = maxS > 0 ? snap(g, clamp(maxS * 1.15, 0.3, 1)) : null;
        if (sn) {
            tint(SIL, PC, col, 'source-in');
            F.ab = auraBuf(AU, SIL, sn);
            if (clone) { tint(CL, PC, 'rgba(36,0,60,.74)', 'source-atop'); tint(CSIL, PC, '#b44dff', 'source-in'); F.cab = auraBuf(CAU, CSIL, sn); }
            if (blueLit > 0) tint(BLU, PC, BLUE, 'source-in');
        }
        const rider = (p, isClone) => {
            const ca = p.cloud ? Math.min(1, p.cloud) * (p.a ?? 1) : 0;
            if (ca > 0) drawCloudLayer(isClone ? CLOUD.dback : CLOUD.back, g, p, t, s1, 0.32, ca);
            drawNpc(f, g, sn, p, t, isClone);
            if (ca > 0) drawCloudLayer(isClone ? CLOUD.dfront : CLOUD.front, g, p, t, s1, 0, ca);
        };
        const people = () => {
            if (!sn) return;
            if (F.ab) drawTrail(f, g, sn, t);
            wisps(F, g, q && q.cloud ? q : null, dt, q && q.cloud ? Math.min(1, q.cloud) : 0, s1);
            flames(f, g, q && q.aura ? q : null, dt, col, q && q.aura ? Math.min(1, q.aura) : 0);
            if (clone && clone.a > 0) { rider(clone, true); bodyArcs(clone, g, t + 0.37, PURP, arcs * 0.8); }
            if (q) {
                rider(q, false);
                if (blueLit > 0) place(BLU, sn, g, q.x, q.y, q.s, { ...q, a: 0.16 * blueLit, op: 'lighter' });      // cầu chưởng rọi xanh lên người
                bodyArcs(q, g, t, col, arcs);
            }
        };
        if (behind) people();
        // 🏢 toà nhà RUNG RIÊNG (user 2026-10-28): rền khi hào quang gom sức sau mái, giật mạnh lúc NPC phóng lên, rung theo va chạm lớn
        let fgSh = 0;
        if (f.sc.shake) {
            if (e >= P.hide && e < P.riseA) fgSh = 3 + 9 * clamp01((e - P.hide) / (P.riseA - P.hide));
            if (e >= P.riseA && e < P.riseA + 700) fgSh = Math.max(fgSh, 16 * (1 - (e - P.riseA) / 700));
            for (const [when] of punches) if (e >= when && e < when + 400) fgSh = Math.max(fgSh, 10 * (1 - (e - when) / 400));
        }
        drawFg(v, sceneA, OX, fgDrop, fgSh ? (Math.random() - 0.5) * fgSh : 0, fgSh ? (Math.random() - 0.5) * fgSh * 0.6 : 0);
        rocks(f, dt);
        puffs(f, dt);
        if (!behind) people();
        if (!sn) { flames(f, g, null, dt, col, 0); wisps(F, g, null, dt, 0, s1); }
        if (orig > 0) direct(g, OX, OY, 1, { a: orig });      // NPC gốc (cam) hiện lại cuối lượt
        F.lastQ = q ? { x: q.x, y: q.y } : null;

        // --- lớp trên cùng ---
        for (const [a, b, k, c] of zips) if (c) zip(a, b, k, c, nh1 * 0.25);
        if (F.ex && domeK > 0) dome(F.ex.x, F.ex.y, v.h * 0.16, domeK);
        if (ball) {
            inflow(ball.x, ball.y, nh1 * 0.9, ball.r, ball.k * 0.8, t);
            vfx.sphere(ball.x, ball.y, ball.r, 1, t, ball.r * 7 * ball.k);
            sparks(ball.x, ball.y, ball.r * 1.9, 0.8 * ball.k, '#bff0ff', t, 8);
        }
        if (beamC) vfx.beam(beamC.sx, beamC.sy, nh1 * 0.12, beamC.x, beamC.y, beamR, beamA, t);
        drawRings(F, dt);
        drawSparks(F, dt);
        for (const [x, y, r, k, c] of flashes) vfx.hit(x, y, r, k, c || col, Math.round(x * 0.37 + y * 0.71));
        if (q && e >= P.riseA && e < P.actA) speedLines(q.x, q.y - q.s * ph * 0.2, q.y + q.s * ph * 1.4, q.s * ph * 0.9, 0.35, t);      // bay lên từ từ: vạch nhẹ
        zoomLines(v.x + v.w / 2, v.y + v.h / 2, zoomA, t);
        vfx.glass(F.cr, crackA, t);
        drawGlass(F, dt);
        vfx.chroma(chromaAmt);
        if (imp) impactFrame(g, sn, [q, clone], imp.x, imp.y, clamp01(imp.k));
        if (white > 0) { ctx.fillStyle = `rgba(240,250,255,${white})`; ctx.fillRect(-40, -40, W + 80, H + 80); }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    // cảnh 🐉 đang phủ kín khung → fx-morph bỏ vẽ phòng sạch (đỡ HpRoom._refill nặng)
    const covers = (f, e) => !!(f && f.fly && f.p && e < f.p.land - 100);
    return { start, frame, covers };
}
