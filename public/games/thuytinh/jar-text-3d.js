// ✍️ Chữ trang trí Hũ — bộ vẽ 3D bằng canvas + sticker 3D (SVG có khối, nạp qua <img data:> nên id gradient không đụng nhau).
// jar-text.js gọi HpJarText3D.render(...) cho các kiểu "khối" (puffy, plaque, candy, bubble, gold, sticker, retro, ice, rainbow);
// các kiểu phát sáng (neon, lửa, kim tuyến, phấn, chữ ký) vẫn vẽ bằng CSS.
// Chữ vẽ 1 lần mỗi khi đổi nội dung/kiểu/màu ở cỡ chuẩn F px rồi CSS co giãn theo em → nét ở mọi cỡ, không tốn CPU mỗi khung.
(function (root) {
    'use strict';
    const F = 160;                                   // cỡ font chuẩn khi vẽ (px)
    const FONT = (s) => `800 ${Math.round(F * s)}px "Baloo 2", "Segoe UI Black", "Arial Rounded MT Bold", sans-serif`;

    // ===== màu =====
    const rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const mix = (a, b, t) => '#' + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
    const L = (c, t) => mix(c, '#ffffff', t), D = (c, t) => mix(c, '#000000', t);
    const A = (c, a) => { const [r, g, b] = rgb(c); return `rgba(${r},${g},${b},${a})`; };

    // ===== vật liệu từng kiểu (đơn vị độ dày = phần của F) =====
    // face(c): các mốc màu mặt chữ theo chiều dọc; out: viền ngoài {w, color, side, depth}; ext: khối chữ {depth, dx, top, bottom};
    // inner: viền trong {w, color}; bevel: [sáng, tối]; gloss: độ bóng kẹo; specks: đốm sáng; shadow; glow.
    function material(style, c) {
        const base = { inner: { w: .04, color: D(c, .4) }, out: null, ext: { depth: .07, dx: 0, top: D(c, .25), bottom: D(c, .5) },
            bevel: [.85, .35], gloss: .7, specks: true, shadow: { blur: .1, dy: .07, color: 'rgba(50,15,45,.45)' }, glow: null };
        switch (style) {
            case 'puffy': return { ...base,
                face: [[0, L(c, .6)], [.42, L(c, .2)], [1, D(c, .1)]],
                inner: { w: .045, color: D(c, .32) },
                out: { w: .13, color: '#ffffff', side: mix(L(c, .55), '#7a6a8a', .25), depth: .075 },
                ext: { depth: .06, dx: 0, top: D(c, .2), bottom: D(c, .42) }, gloss: .8 };
            case 'candy': return { ...base,
                face: [[0, L(c, .4)], [.5, c], [1, D(c, .22)]],
                out: { w: .1, color: '#ffffff', side: mix(L(c, .5), '#6a5a7a', .3), depth: .055 },
                ext: { depth: .1, dx: 0, top: D(c, .3), bottom: D(c, .55) }, gloss: .9 };
            case 'bubble': return { ...base,
                face: [[0, '#ffffff'], [.28, L(c, .55)], [.72, c], [1, D(c, .28)]],
                inner: { w: .035, color: D(c, .5) },
                out: { w: .07, color: L(c, .85), side: L(c, .45), depth: .035 },
                ext: { depth: .055, dx: 0, top: D(c, .3), bottom: D(c, .5) }, gloss: .95 };
            case 'gold': return { ...base,
                face: [[0, '#fff7cf'], [.26, '#ffd54f'], [.48, '#d99308'], [.6, '#ffe680'], [.8, '#e0a414'], [1, '#9c5c06']],
                inner: { w: .035, color: '#5e3400' },
                out: { w: .075, color: '#3d2200', side: '#1a0e00', depth: .045 },
                ext: { depth: .11, dx: 0, top: '#9a5d00', bottom: '#3e2300' },
                bevel: [1, .55], gloss: .45, glow: 'rgba(255,196,60,.55)' };
            case 'sticker': return { ...base,
                face: [[0, L(c, .15)], [1, D(c, .1)]],
                inner: { w: .03, color: D(c, .42) },
                out: { w: .17, color: '#ffffff', side: '#cfd0dc', depth: .05 },
                ext: { depth: 0 }, bevel: [.45, .22], gloss: .35, specks: false };
            case 'retro': return { ...base,
                face: [[0, L(c, .55)], [.5, c], [1, D(c, .18)]],
                inner: { w: .035, color: '#1b1030' },
                out: { w: .05, color: '#1b1030', side: '#1b1030', depth: 0 },
                ext: { depth: .17, dx: .75, top: '#ff3d6e', bottom: '#5a0a32' }, gloss: .4, specks: false };
            case 'ice': return { ...base,
                face: [[0, '#ffffff'], [.38, '#dcf7ff'], [.78, '#7fd3ff'], [1, '#c4f0ff']],
                inner: { w: .035, color: '#2a7fb8' },
                out: { w: .09, color: '#f4fcff', side: '#9ed6f2', depth: .04 },
                ext: { depth: .07, dx: 0, top: '#4b9fd0', bottom: '#1f5f8c' }, gloss: .85, glow: 'rgba(170,232,255,.65)' };
            case 'rainbow': return { ...base,
                faceH: ['#ff4d6d', '#ffa53d', '#ffe14d', '#5ee07a', '#4dc3ff', '#9b6bff'],
                face: [[0, 'rgba(255,255,255,.35)'], [.5, 'rgba(255,255,255,0)'], [1, 'rgba(40,0,60,.25)']],
                inner: { w: .035, color: '#4a2378' },
                out: { w: .12, color: '#ffffff', side: '#c9b8e6', depth: .055 },
                ext: { depth: .07, dx: 0, top: '#6a3aa0', bottom: '#2e1450' }, gloss: .75 };
            case 'plaque': return { ...base,
                face: [[0, '#ffffff'], [.6, '#ffffff'], [1, L(c, .78)]],
                inner: { w: .05, color: D(c, .38) },
                out: null, ext: { depth: .045, dx: 0, top: D(c, .42), bottom: D(c, .6) },
                bevel: [.5, .25], gloss: .3, specks: false, plaque: true };
        }
        return null;
    }

    const mk = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };

    // lines: [{ text, scale, color }]. Trả { canvas, pad } (pad = lề quanh khối chữ, px ở cỡ F) hoặc null nếu kiểu không vẽ bằng canvas.
    function render(style, lines, c) {
        const m = material(style, c);
        if (!m) return null;
        const meas = mk(4, 4).getContext('2d');
        const lay = lines.map(l => {
            meas.font = FONT(l.scale);
            const t = meas.measureText(l.text || ' ');
            const asc = Math.max(t.actualBoundingBoxAscent, F * l.scale * .55), desc = Math.max(t.actualBoundingBoxDescent, F * l.scale * .1);
            return { ...l, w: Math.max(t.width, F * .2), asc, desc, m: m.plaque ? material('plaque', l.color) : material(style, l.color) };
        });
        const outW = (m.out ? m.out.w : 0) * F, outD = (m.out ? m.out.depth : 0) * F;
        const extD = (m.ext.depth || 0) * F, extDx = (m.ext.dx || 0);
        const plq = m.plaque ? { px: .42 * F, py: .2 * F, d: .07 * F } : null;
        const pad = Math.ceil(outW + Math.max(outD, extD) * (1 + extDx) + (m.shadow.blur + m.shadow.dy) * F + (plq ? plq.px + plq.d : 0) + F * .08);
        const gap = F * .02;
        let H = 0; lay.forEach((l, i) => { l.y = H + l.asc; H += l.asc + l.desc + (i < lay.length - 1 ? gap : 0); });
        const W = Math.max(...lay.map(l => l.w));
        const cw = Math.ceil(W + pad * 2), ch = Math.ceil(H + pad * 2);
        const cv = mk(cw, ch), x = cv.getContext('2d');
        const cx = cw / 2;
        lay.forEach(l => { l.y += pad; l.top = l.y - l.asc; l.h = l.asc + l.desc; });
        const each = (ctx, fn) => lay.forEach(l => { ctx.font = FONT(l.scale); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; fn(l); });
        x.lineJoin = 'round'; x.miterLimit = 2;

        // ---- nền nhãn (plaque) ----
        if (plq) {
            const bx = cx - W / 2 - plq.px, by = pad - plq.py, bw = W + plq.px * 2, bh = H + plq.py * 2, r = Math.min(bh * .42, F * .5);
            const rr = (ctx, dy) => { ctx.beginPath(); ctx.roundRect(bx, by + dy, bw, bh, r); };
            x.save(); x.shadowColor = m.shadow.color; x.shadowBlur = m.shadow.blur * F; x.shadowOffsetY = m.shadow.dy * F;
            rr(x, plq.d); x.fillStyle = D(c, .45); x.fill(); x.restore();
            for (let k = plq.d; k > 0; k -= 2) { rr(x, k); x.fillStyle = mix(D(c, .2), D(c, .45), k / plq.d); x.fill(); }
            rr(x, 0); const g = x.createLinearGradient(0, by, 0, by + bh);
            g.addColorStop(0, L(c, .45)); g.addColorStop(.5, c); g.addColorStop(1, D(c, .16)); x.fillStyle = g; x.fill();
            x.save(); rr(x, 0); x.clip();
            const gl = x.createLinearGradient(0, by, 0, by + bh * .5); gl.addColorStop(0, 'rgba(255,255,255,.75)'); gl.addColorStop(1, 'rgba(255,255,255,.08)');
            x.beginPath(); x.ellipse(cx, by + bh * .06, bw * .56, bh * .44, 0, 0, Math.PI * 2); x.fillStyle = gl; x.fill();
            const sh = x.createLinearGradient(0, by + bh * .6, 0, by + bh); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, A(D(c, .6), .35));
            x.fillStyle = sh; x.fillRect(bx, by, bw, bh); x.restore();
            rr(x, 0); x.lineWidth = F * .05; x.strokeStyle = '#ffffff'; x.stroke();
            x.lineWidth = F * .015; x.strokeStyle = L(c, .35); x.beginPath(); x.roundRect(bx - F * .03, by - F * .03, bw + F * .06, bh + F * .06, r + F * .03); x.stroke();
            x.beginPath(); x.ellipse(bx + r * .7, by + bh * .2, F * .09, F * .045, -.35, 0, Math.PI * 2); x.fillStyle = 'rgba(255,255,255,.9)'; x.fill();
        }

        // ---- 1. viền ngoài có bề dày (sticker giấy dày) + bóng đổ ----
        if (m.out && outW > 0) {
            x.save();
            if (!plq) { x.shadowColor = m.shadow.color; x.shadowBlur = m.shadow.blur * F; x.shadowOffsetY = m.shadow.dy * F; }
            each(x, l => { x.lineWidth = outW * 2 * l.scale; x.strokeStyle = m.out.side; x.fillStyle = m.out.side; x.strokeText(l.text, cx, l.y + outD); x.fillText(l.text, cx, l.y + outD); });
            x.restore();
            for (let k = outD; k > 0; k -= 1.5) each(x, l => { x.lineWidth = outW * 2 * l.scale; x.strokeStyle = m.out.side; x.strokeText(l.text, cx, l.y + k); });
            each(x, l => { x.lineWidth = outW * 2 * l.scale; x.strokeStyle = m.out.color; x.strokeText(l.text, cx, l.y); });
            // mép trên viền trắng sáng hơn, mép dưới hơi ám → viền tròn trịa
            if (m.out.color === '#ffffff') {
                const t = mk(cw, ch), tx = t.getContext('2d'); tx.lineJoin = 'round';
                each(tx, l => { tx.lineWidth = outW * 2 * l.scale; tx.strokeStyle = '#000'; tx.strokeText(l.text, cx, l.y); });
                tx.globalCompositeOperation = 'source-in';
                const g = tx.createLinearGradient(0, 0, 0, ch); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.7, 'rgba(255,255,255,0)'); g.addColorStop(1, A(m.out.side, .55));
                tx.fillStyle = g; tx.fillRect(0, 0, cw, ch); x.drawImage(t, 0, 0);
            }
        } else if (!plq) {
            x.save(); x.shadowColor = m.shadow.color; x.shadowBlur = m.shadow.blur * F; x.shadowOffsetY = m.shadow.dy * F;
            each(x, l => { x.fillStyle = l.m.ext.bottom || D(l.color, .5); x.fillText(l.text, cx + extD * extDx, l.y + extD); }); x.restore();
        }
        if (m.glow) { x.save(); x.shadowColor = m.glow; x.shadowBlur = F * .22; each(x, l => { x.fillStyle = m.glow; x.fillText(l.text, cx, l.y); }); x.restore(); }

        // ---- 2. khối chữ đổ sâu (mặt bên) ----
        if (extD > 0) {
            for (let k = extD; k > 0; k -= 1.2) {
                const t = k / extD;
                each(x, l => {
                    const col = mix(l.m.ext.top, l.m.ext.bottom, t);
                    x.fillStyle = col; x.strokeStyle = col; x.lineWidth = (l.m.inner.w * 2) * F * l.scale;
                    x.strokeText(l.text, cx + k * extDx, l.y + k); x.fillText(l.text, cx + k * extDx, l.y + k);
                });
            }
        }
        // ---- 3. viền trong ----
        each(x, l => { x.lineWidth = l.m.inner.w * 2 * F * l.scale; x.strokeStyle = l.m.inner.color; x.strokeText(l.text, cx, l.y); });

        // ---- 4. mặt chữ (lớp riêng để gờ vát / bóng chỉ phủ lên chữ) ----
        const face = mk(cw, ch), f = face.getContext('2d');
        each(f, l => {
            let g;
            if (l.m.faceH) {
                g = f.createLinearGradient(cx - l.w / 2, 0, cx + l.w / 2, 0);
                l.m.faceH.forEach((col, i, arr) => g.addColorStop(i / (arr.length - 1), col));
                f.fillStyle = g; f.fillText(l.text, cx, l.y);
            }
            g = f.createLinearGradient(0, l.top, 0, l.top + l.h);
            l.m.face.forEach(([o, col]) => g.addColorStop(o, col));
            f.fillStyle = g; f.fillText(l.text, cx, l.y);
        });
        const band = (dy, color) => {
            const t = mk(cw, ch), tx = t.getContext('2d');
            each(tx, l => { tx.fillStyle = '#000'; tx.fillText(l.text, cx, l.y); });
            tx.globalCompositeOperation = 'destination-out';
            each(tx, l => { tx.fillText(l.text, cx, l.y + dy * l.scale); });
            tx.globalCompositeOperation = 'source-in'; tx.fillStyle = color; tx.fillRect(0, 0, cw, ch);
            return t;
        };
        f.globalCompositeOperation = 'source-atop';
        f.filter = `blur(${(F * .012).toFixed(1)}px)`;
        f.globalAlpha = m.bevel[0]; f.drawImage(band(F * .045, '#ffffff'), 0, 0);
        f.globalAlpha = m.bevel[1]; f.drawImage(band(-F * .05, D(c, .55)), 0, 0);
        f.filter = 'none'; f.globalAlpha = 1;
        // dải bóng kẹo: elip sáng phủ nửa trên, mép dưới cong rõ
        lay.forEach(l => {
            if (!m.gloss) return;
            const g = f.createLinearGradient(0, l.top, 0, l.top + l.h * .55);
            g.addColorStop(0, `rgba(255,255,255,${m.gloss})`); g.addColorStop(1, `rgba(255,255,255,${(m.gloss * .18).toFixed(2)})`);
            f.beginPath(); f.ellipse(cx, l.top + l.h * .08, l.w * .62, l.h * .45, 0, 0, Math.PI * 2); f.fillStyle = g; f.fill();
        });
        if (m.specks) lay.forEach(l => {
            f.fillStyle = 'rgba(255,255,255,.95)';
            const n = Math.max(2, Math.round(l.w / (F * .9)));
            for (let i = 0; i < n; i++) {
                const px = cx - l.w / 2 + l.w * (.08 + i * .84 / n), py = l.top + l.h * .26;
                f.beginPath(); f.ellipse(px, py, F * .03 * l.scale, F * .018 * l.scale, -.5, 0, Math.PI * 2); f.fill();
                f.beginPath(); f.arc(px + F * .055 * l.scale, py + F * .03 * l.scale, F * .011 * l.scale, 0, Math.PI * 2); f.fill();
            }
        });
        x.drawImage(face, 0, 0);
        return { canvas: cv, pad, F };
    }

    // ===== sticker 3D: SVG có gradient khối + điểm sáng mờ, nạp như ảnh =====
    function mkSvg(vb, build) {
        let n = 0; const defs = [];
        const rad = (stops, cx = '35%', cy = '30%', r = '75%') => { const id = 'g' + (n++); defs.push(`<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('')}</radialGradient>`); return `url(#${id})`; };
        const lin = (stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) => { const id = 'g' + (n++); defs.push(`<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('')}</linearGradient>`); return `url(#${id})`; };
        defs.push('<filter id="bl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>');
        defs.push('<filter id="gl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>');
        defs.push('<filter id="sd" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2.5" stdDeviation="2" flood-color="#3a1030" flood-opacity=".35"/></filter>');
        const body = build({ rad, lin });
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><defs>${defs.join('')}</defs><g filter="url(#sd)">${body}</g></svg>`;
    }
    const spec = (cx, cy, rx, ry, rot, a = .9) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" opacity="${a}" filter="url(#bl)" transform="rotate(${rot} ${cx} ${cy})"/>`;
    const dot = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff"/>`;
    // khối cầu/elip có bóng: sáng góc trên-trái, tối mép dưới
    const blob = (k, tag, attrs, c, stroke) => `<${tag} ${attrs} fill="${k.rad([[0, L(c, .6)], [.55, c], [1, D(c, .28)]])}"${stroke ? ` stroke="${stroke}" stroke-width="3"` : ''}/>`;
    const eyes = (cx, cy, s, ink) => [-1, 1].map(d => `<ellipse cx="${cx + d * 10 * s}" cy="${cy}" rx="${4.6 * s}" ry="${5.6 * s}" fill="${ink}"/>${dot(cx + d * 10 * s - 1.4 * s, cy - 2 * s, 1.9 * s)}${dot(cx + d * 10 * s + 1.6 * s, cy + 2 * s, .9 * s)}`).join('');
    const blush = (cx, cy, s) => [-1, 1].map(d => `<ellipse cx="${cx + d * 18 * s}" cy="${cy}" rx="${6 * s}" ry="${3.6 * s}" fill="#ff7fa3" opacity=".55" filter="url(#bl)"/>`).join('');
    const smile = (cx, cy, s, ink) => `<path d="M${cx - 4.5 * s} ${cy} Q${cx - 2.2 * s} ${cy + 3.6 * s} ${cx} ${cy} Q${cx + 2.2 * s} ${cy + 3.6 * s} ${cx + 4.5 * s} ${cy}" fill="none" stroke="${ink}" stroke-width="${2 * s}" stroke-linecap="round"/>`;
    const HEART = 'M50 88C20 66 6 48 10 30C14 14 34 10 50 28C66 10 86 14 90 30C94 48 80 66 50 88Z';
    const SPARK = 'M50 4C54 40 60 46 96 50C60 54 54 60 50 96C46 60 40 54 4 50C40 46 46 40 50 4Z';
    function starPath(cx, cy, R, r) {
        let d = '';
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r : R; d += (i ? 'L' : 'M') + (cx + q * Math.cos(a)).toFixed(1) + ' ' + (cy + q * Math.sin(a)).toFixed(1); }
        return d + 'Z';
    }
    const heart = (c) => mkSvg('0 0 100 100', k => `<path d="${HEART}" fill="#fff" stroke="#fff" stroke-width="10" stroke-linejoin="round"/>`
        + `<path d="${HEART}" fill="${k.rad([[0, L(c, .55)], [.5, c], [1, D(c, .3)]], '35%', '28%', '80%')}"/>`
        + `<path d="${HEART}" fill="${k.lin([[.55, D(c, .4), 0], [1, D(c, .45), .55]])}"/>${spec(32, 30, 11, 6, -35)}${dot(24, 44, 2.6)}${spec(70, 70, 6, 3, -40, .35)}`);
    const PIECES = {
        sparkle: () => mkSvg('0 0 100 100', k => `<path d="${SPARK}" fill="#ffe27a" opacity=".85" filter="url(#gl)"/><path d="${SPARK}" fill="${k.rad([[0, '#ffffff'], [.45, '#fff6c4'], [1, '#ffc23a']], '50%', '50%', '55%')}" stroke="#fff" stroke-width="2"/>`),
        sparkleBlue: () => mkSvg('0 0 100 100', k => `<path d="${SPARK}" fill="#9fdcff" opacity=".85" filter="url(#gl)"/><path d="${SPARK}" fill="${k.rad([[0, '#ffffff'], [.45, '#e6f6ff'], [1, '#62bdf7']], '50%', '50%', '55%')}" stroke="#fff" stroke-width="2"/>`),
        heart: () => heart('#ff5f9e'),
        heartBlue: () => heart('#4fb8ff'),
        starFace: () => mkSvg('0 0 100 100', k => { const p = starPath(50, 54, 44, 23);
            return `<path d="${p}" fill="#fff" stroke="#fff" stroke-width="12" stroke-linejoin="round"/><path d="${p}" fill="${k.rad([[0, '#fff3a6'], [.5, '#ffcc29'], [1, '#f08c00']], '38%', '32%', '75%')}" stroke="#f5a000" stroke-width="5" stroke-linejoin="round"/>`
                + `<path d="${p}" fill="${k.lin([[.55, '#c46a00', 0], [1, '#b05a00', .45]])}"/>${spec(36, 34, 9, 5, -30)}${eyes(50, 56, .78, '#4a2600')}${blush(50, 64, .75)}${smile(50, 64, .8, '#4a2600')}`; }),
        bow: () => mkSvg('0 0 100 100', k => { const loop = k.lin([[0, '#ffd1e6'], [.45, '#ff8cc0'], [1, '#d94c8c']], 0, 0, 1, 1);
            return `<path d="M47 56L33 92L45 84L50 95L54 58Z" fill="${k.lin([[0, '#ff9cc9'], [1, '#d9468a']])}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M53 56L67 92L55 84L50 95L46 58Z" fill="${k.lin([[0, '#ff9cc9'], [1, '#c43a7a']])}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>`
                + `<path d="M50 50C30 14 4 22 6 44C8 66 32 68 50 50Z" fill="${loop}" stroke="#fff" stroke-width="3.5"/><path d="M50 50C70 14 96 22 94 44C92 66 68 68 50 50Z" fill="${loop}" stroke="#fff" stroke-width="3.5"/>`
                + `<path d="M46 50C34 38 22 36 16 42" stroke="#c43a7a" stroke-width="2.5" fill="none" opacity=".45"/><path d="M54 50C66 38 78 36 84 42" stroke="#c43a7a" stroke-width="2.5" fill="none" opacity=".45"/>`
                + `<ellipse cx="50" cy="50" rx="10" ry="11" fill="${k.rad([[0, '#ffb3d6'], [.6, '#ff6fa8'], [1, '#c43a7a']])}" stroke="#fff" stroke-width="3"/>${spec(22, 34, 9, 4, -30)}${spec(74, 32, 7, 3.5, 25)}${spec(47, 46, 3, 2, 0)}`; }),
        flower: () => mkSvg('0 0 100 100', k => [0, 72, 144, 216, 288].map(a => { const px = 50 + 23 * Math.cos((a - 90) * Math.PI / 180), py = 50 + 23 * Math.sin((a - 90) * Math.PI / 180);
            return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="19" fill="${k.rad([[0, '#fff0f6'], [.5, '#ffb6d5'], [1, '#f2709f']], '40%', '35%', '70%')}" stroke="#fff" stroke-width="2.5"/>`; }).join('')
            + `<circle cx="50" cy="50" r="14" fill="${k.rad([[0, '#fff3a6'], [.6, '#ffc61a'], [1, '#e08a00']])}" stroke="#fff" stroke-width="2.5"/>${spec(45, 44, 5, 3, -30)}${spec(38, 20, 6, 3, -20, .6)}`),
        crown: () => mkSvg('0 0 100 100', k => { const gold = k.lin([[0, '#fff6c2'], [.3, '#ffd23f'], [.55, '#d48a00'], [.7, '#ffe27a'], [1, '#a35f00']]);
            return `<path d="M12 80L18 32L37 54L50 18L63 54L82 32L88 80Z" fill="${gold}" stroke="#fff" stroke-width="4" stroke-linejoin="round"/><rect x="12" y="73" width="76" height="14" rx="5" fill="${k.lin([[0, '#ffe27a'], [.5, '#e09a00'], [1, '#9c5800']])}" stroke="#fff" stroke-width="3"/>`
                + [[50, 18, 7, '#ff3f7f'], [18, 32, 5.5, '#3fb6ff'], [82, 32, 5.5, '#3fb6ff'], [50, 80, 5, '#ff3f7f'], [30, 80, 3.5, '#5ce0a0'], [70, 80, 3.5, '#5ce0a0']].map(([gx, gy, r, gc]) => `<circle cx="${gx}" cy="${gy}" r="${r}" fill="${k.rad([[0, L(gc, .7)], [.5, gc], [1, D(gc, .35)]])}" stroke="#fff" stroke-width="1.6"/>${dot(gx - r * .35, gy - r * .35, r * .3)}`).join('')
                + spec(30, 58, 6, 3, -25); }),
        cloud: () => mkSvg('0 0 120 90', k => { const p = 'M24 74C8 74 4 56 16 48C12 30 32 22 44 32C50 12 80 12 86 32C102 26 116 40 108 54C118 62 110 76 96 74Z';
            return `<path d="${p}" fill="${k.rad([[0, '#ffffff'], [.6, '#f2f8ff'], [1, '#bcdcf7']], '40%', '30%', '80%')}" stroke="#d2e9ff" stroke-width="3" stroke-linejoin="round"/>${spec(48, 28, 12, 5, -10, .8)}${eyes(60, 52, .9, '#34506e')}${blush(60, 60, .9)}${smile(60, 60, .9, '#34506e')}`; }),
        duck: () => mkSvg('0 0 120 120', k => Array.from({ length: 12 }, (_, i) => `<ellipse cx="60" cy="21" rx="11" ry="17" fill="${k.lin([[0, '#ffd166'], [1, '#f08a00']])}" stroke="#fff" stroke-width="2" transform="rotate(${i * 30} 60 58)"/>`).join('')
            + blob(k, 'circle', 'cx="60" cy="58" r="34"', '#fff1cc', '#fff')
            + [-1, 1].map(d => `<circle cx="${60 + d * 13}" cy="56" r="10.5" fill="#fff" fill-opacity=".45" stroke="#7a4a1e" stroke-width="3"/>`).join('') + '<path d="M57 55H63" stroke="#7a4a1e" stroke-width="3"/>'
            + eyes(60, 57, .78, '#2e1a08') + `<ellipse cx="60" cy="72" rx="12" ry="7" fill="${k.rad([[0, '#ffc08a'], [.6, '#ff8c42'], [1, '#d9601a']])}"/>${spec(56, 69, 4, 2, 0, .8)}` + blush(60, 70, 1.1)
            + blob(k, 'ellipse', 'cx="34" cy="98" rx="14" ry="10"', '#fff1cc', '#fff') + blob(k, 'ellipse', 'cx="86" cy="98" rx="14" ry="10"', '#fff1cc', '#fff') + spec(44, 36, 10, 5, -30, .75)),
        cat: () => mkSvg('0 0 120 110', k => [[24, 44, 22, 8, 52, 30], [96, 44, 98, 8, 68, 30]].map(([a, b, c2, d, e, f2]) => `<path d="M${a} ${b}L${c2} ${d}L${e} ${f2}Z" fill="${k.lin([[0, '#ffe8cc'], [1, '#e8b98a']])}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>`).join('')
            + '<path d="M29 36L28 18L42 29Z" fill="#ffb3c7"/><path d="M91 36L92 18L78 29Z" fill="#ffb3c7"/>'
            + blob(k, 'ellipse', 'cx="60" cy="58" rx="42" ry="34"', '#ffedd6', '#fff') + eyes(60, 56, 1, '#2e1a08') + blush(60, 66, 1) + smile(60, 65, 1, '#2e1a08')
            + blob(k, 'ellipse', 'cx="34" cy="96" rx="14" ry="10"', '#ffedd6', '#fff') + blob(k, 'ellipse', 'cx="86" cy="96" rx="14" ry="10"', '#ffedd6', '#fff') + spec(40, 38, 12, 6, -25, .7)),
        bear: () => mkSvg('0 0 120 110', k => blob(k, 'circle', 'cx="26" cy="28" r="16"', '#c48a58', '#fff') + blob(k, 'circle', 'cx="94" cy="28" r="16"', '#c48a58', '#fff')
            + '<circle cx="26" cy="29" r="7.5" fill="#f2c79c"/><circle cx="94" cy="29" r="7.5" fill="#f2c79c"/>'
            + blob(k, 'ellipse', 'cx="60" cy="58" rx="42" ry="36"', '#cf9462', '#fff') + `<ellipse cx="60" cy="69" rx="17" ry="12" fill="${k.rad([[0, '#fff1de'], [1, '#e8c09a']])}"/>`
            + `<ellipse cx="60" cy="64" rx="6" ry="4" fill="#2e1a08"/>${dot(58, 62.5, 1.5)}` + eyes(60, 52, .85, '#2e1a08') + blush(60, 64, 1.05)
            + blob(k, 'ellipse', 'cx="34" cy="98" rx="14" ry="10"', '#cf9462', '#fff') + blob(k, 'ellipse', 'cx="86" cy="98" rx="14" ry="10"', '#cf9462', '#fff') + spec(40, 36, 12, 6, -25, .6)),
        bunny: () => mkSvg('0 0 120 130', k => [[42, 30, -12], [80, 28, 14]].map(([ex, ey, r]) => `<ellipse cx="${ex}" cy="${ey}" rx="13" ry="29" fill="${k.rad([[0, '#ffffff'], [.7, '#f6eef6'], [1, '#d9c6dc']])}" stroke="#fff" stroke-width="2" transform="rotate(${r} ${ex} ${ey})"/><ellipse cx="${ex}" cy="${ey + 3}" rx="5.5" ry="19" fill="${k.lin([[0, '#ffd6e1'], [1, '#ff9ab7']])}" transform="rotate(${r} ${ex} ${ey})"/>`).join('')
            + blob(k, 'ellipse', 'cx="60" cy="78" rx="41" ry="33"', '#ffffff', '#fff').replace(L('#ffffff', .6), '#ffffff') + `<ellipse cx="60" cy="96" rx="34" ry="14" fill="#c9b2cf" opacity=".35" filter="url(#bl)"/>`
            + eyes(60, 76, 1, '#3e2640') + blush(60, 86, 1) + smile(60, 85, 1, '#3e2640')
            + blob(k, 'ellipse', 'cx="36" cy="114" rx="13" ry="9"', '#f4ecf6', '#fff') + blob(k, 'ellipse', 'cx="84" cy="114" rx="13" ry="9"', '#f4ecf6', '#fff') + spec(42, 58, 12, 6, -25, .8))
    };
    // ===== sticker theo mùa (bộ chữ mẫu PRESETS trong jar-text.js) =====
    const petals = (k, n, R, r, light, mid, dark) => Array.from({ length: n }, (_, i) => { const a = (i * 360 / n - 90) * Math.PI / 180;
        return `<circle cx="${(50 + R * Math.cos(a)).toFixed(1)}" cy="${(50 + R * Math.sin(a)).toFixed(1)}" r="${r}" fill="${k.rad([[0, light], [.5, mid], [1, dark]], '40%', '35%', '70%')}" stroke="#fff" stroke-width="2.5"/>`; }).join('');
    const SNOW = Array.from({ length: 6 }, (_, i) => `<g transform="rotate(${i * 60} 50 50)"><path d="M50 50V10M50 22L41 13M50 22L59 13M50 34L43 27M50 34L57 27" fill="none" stroke-linecap="round"/></g>`).join('');
    Object.assign(PIECES, {
        mai: () => mkSvg('0 0 100 100', k => petals(k, 5, 23, 19, '#fff6c2', '#ffd21f', '#f0a000')
            + `<circle cx="50" cy="50" r="12" fill="${k.rad([[0, '#ffb066'], [.6, '#ff7a1a'], [1, '#c94f00']])}" stroke="#fff" stroke-width="2"/>`
            + [0, 60, 120, 180, 240, 300].map(a => `<circle cx="${(50 + 7 * Math.cos(a * Math.PI / 180)).toFixed(1)}" cy="${(50 + 7 * Math.sin(a * Math.PI / 180)).toFixed(1)}" r="2" fill="#7a2a00"/>`).join('') + spec(40, 22, 7, 3, -20, .7)),
        lixi: () => mkSvg('0 0 100 100', k => `<rect x="22" y="10" width="56" height="80" rx="9" fill="${k.lin([[0, '#ff5a4f'], [.55, '#e3201b'], [1, '#a50e0e']], 0, 0, 1, 1)}" stroke="#fff" stroke-width="4"/>`
            + `<path d="M22 32Q50 52 78 32V19Q78 10 69 10H31Q22 10 22 19Z" fill="${k.lin([[0, '#ff7a6e'], [1, '#c81812']])}" stroke="#ffd34d" stroke-width="2.5"/>`
            + `<circle cx="50" cy="44" r="11" fill="${k.rad([[0, '#fff3a6'], [.55, '#ffc61a'], [1, '#c98a00']])}" stroke="#fff" stroke-width="2"/><path d="M45 44h10M50 39v10" stroke="#b5161a" stroke-width="3" stroke-linecap="round"/>`
            + `<path d="M32 70h36M32 77h24" stroke="#ffd34d" stroke-width="3" stroke-linecap="round" opacity=".85"/>${spec(34, 22, 8, 3.5, -20, .55)}`),
        lantern: () => mkSvg('0 0 100 120', k => `<path d="M50 4V14" stroke="#c98a00" stroke-width="3"/><rect x="36" y="12" width="28" height="9" rx="3" fill="${k.lin([[0, '#ffe27a'], [1, '#b97800']])}" stroke="#fff" stroke-width="2"/>`
            + `<ellipse cx="50" cy="55" rx="38" ry="35" fill="${k.rad([[0, '#ffb08a'], [.45, '#f2342a'], [1, '#8f0b0b']], '38%', '35%', '75%')}" stroke="#fff" stroke-width="3.5"/>`
            + [-22, -8, 8, 22].map(d => `<path d="M${50 + d} 22Q${50 + d * 1.7} 55 ${50 + d} 88" fill="none" stroke="#a80f10" stroke-width="2" opacity=".55"/>`).join('')
            + `<ellipse cx="50" cy="55" rx="18" ry="22" fill="#ffe08a" opacity=".45" filter="url(#gl)"/><rect x="36" y="88" width="28" height="9" rx="3" fill="${k.lin([[0, '#ffe27a'], [1, '#b97800']])}" stroke="#fff" stroke-width="2"/>`
            + [-8, 0, 8].map(d => `<path d="M${50 + d} 97V116" stroke="#ff3b30" stroke-width="3" stroke-linecap="round"/>`).join('') + spec(32, 38, 9, 5, -30, .7)),
        moon: () => mkSvg('0 0 100 100', k => `<circle cx="50" cy="50" r="40" fill="#ffe9a6" opacity=".7" filter="url(#gl)"/><circle cx="50" cy="50" r="38" fill="${k.rad([[0, '#fffbe3'], [.55, '#ffe07a'], [1, '#f0b400']], '38%', '32%', '75%')}" stroke="#fff" stroke-width="3"/>`
            + `<circle cx="66" cy="34" r="6" fill="#f2c040" opacity=".55"/><circle cx="72" cy="58" r="4" fill="#f2c040" opacity=".5"/><circle cx="32" cy="70" r="5" fill="#f2c040" opacity=".45"/>`
            + eyes(50, 50, .85, '#6b4400') + blush(50, 58, .85) + smile(50, 58, .85, '#6b4400') + spec(34, 30, 9, 5, -30, .75)),
        snowflake: () => mkSvg('0 0 100 100', k => `<g stroke="#9fd8ff" stroke-width="11" opacity=".9">${SNOW}</g><g stroke="#ffffff" stroke-width="6">${SNOW}</g><circle cx="50" cy="50" r="7" fill="${k.rad([[0, '#ffffff'], [1, '#bfe6ff']])}" stroke="#fff" stroke-width="2"/>`),
        santaHat: () => mkSvg('0 0 120 100', k => `<path d="M18 74C26 36 54 12 84 14C100 15 108 30 104 46C98 36 88 32 80 40C72 50 76 66 74 74Z" fill="${k.lin([[0, '#ff6157'], [.5, '#e11d26'], [1, '#93070d']], 0, 0, 1, 1)}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>`
            + `<rect x="10" y="68" width="74" height="20" rx="10" fill="${k.rad([[0, '#ffffff'], [.7, '#f1f1f6'], [1, '#c9cad6']])}" stroke="#fff" stroke-width="2"/><circle cx="104" cy="50" r="12" fill="${k.rad([[0, '#ffffff'], [.7, '#f1f1f6'], [1, '#c3c4d2']])}" stroke="#fff" stroke-width="2"/>` + spec(46, 34, 10, 4, -35, .55)),
        tree: () => mkSvg('0 0 100 120', k => { const g = k.lin([[0, '#7be28a'], [.5, '#1fa64a'], [1, '#0b6a2c']], 0, 0, 1, 1);
            return `<rect x="43" y="98" width="14" height="16" rx="3" fill="#8a5a2b" stroke="#fff" stroke-width="2"/>`
                + [[56, 94, 42], [36, 72, 36], [16, 50, 30]].map(([y, bw, h]) => `<path d="M50 ${y}Q${50 + bw * .18} ${y + h * .5} ${50 + bw / 2} ${y + h}Q50 ${y + h + 6} ${50 - bw / 2} ${y + h}Q${50 - bw * .18} ${y + h * .5} 50 ${y}Z" fill="${g}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>`).join('')
                + [[36, 92, '#ff3b4f'], [62, 86, '#ffd23f'], [44, 66, '#3fb6ff'], [58, 62, '#ff3b4f'], [50, 44, '#ffd23f']].map(([bx, by, bc]) => `<circle cx="${bx}" cy="${by}" r="4.5" fill="${k.rad([[0, L(bc, .6)], [.6, bc], [1, D(bc, .35)]])}"/>`).join('')
                + `<path d="${starPath(50, 16, 12, 5.5)}" fill="${k.rad([[0, '#fff3a6'], [.6, '#ffcc29'], [1, '#e08a00']])}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>`; }),
        pumpkin: () => mkSvg('0 0 120 100', k => `<path d="M60 22Q62 8 72 6" stroke="#4d7c0f" stroke-width="6" fill="none" stroke-linecap="round"/>`
            + `<ellipse cx="60" cy="60" rx="58" ry="38" fill="#fff"/>`
            + [[30, 28], [90, 28], [45, 34], [75, 34], [60, 38]].map(([x, rx]) => `<ellipse cx="${x}" cy="60" rx="${rx}" ry="35" fill="${k.rad([[0, '#ffc07a'], [.5, '#ff8a1f'], [1, '#c24d00']], '38%', '32%', '78%')}" stroke="#d9650a" stroke-width="1.6"/>`).join('')
            + `<path d="M40 52L50 44L54 56ZM80 52L70 44L66 56Z" fill="#5a2000"/><path d="M42 70Q60 84 78 70L72 74L66 70L60 76L54 70L48 74Z" fill="#5a2000"/>` + spec(42, 38, 9, 4, -30, .6)),
        bat: () => mkSvg('0 0 120 80', k => `<path d="M60 30C48 14 30 10 6 22C16 26 18 34 14 42C24 38 32 42 34 50C40 42 50 42 60 52C70 42 80 42 86 50C88 42 96 38 106 42C102 34 104 26 114 22C90 10 72 14 60 30Z" fill="${k.lin([[0, '#8a5cd6'], [1, '#3b1f6e']])}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>`
            + `<circle cx="60" cy="38" r="15" fill="${k.rad([[0, '#a77ff0'], [.6, '#6a3fc0'], [1, '#3b1f6e']])}" stroke="#fff" stroke-width="2.5"/><path d="M48 28L50 16L56 26M72 28L70 16L64 26" fill="#6a3fc0" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>`
            + eyes(60, 38, .55, '#fff') + blush(60, 44, .6)),
        ghost: () => mkSvg('0 0 100 110', k => `<path d="M16 96V46C16 22 32 8 50 8C68 8 84 22 84 46V96L74 88L64 98L55 88L45 98L36 88L26 98Z" fill="${k.rad([[0, '#ffffff'], [.7, '#f1eefa'], [1, '#c8c0e0']], '40%', '30%', '80%')}" stroke="#d9d2f0" stroke-width="3" stroke-linejoin="round"/>`
            + eyes(50, 46, 1, '#3a2f5a') + blush(50, 56, 1) + `<ellipse cx="50" cy="60" rx="5" ry="4" fill="#3a2f5a"/>` + spec(34, 26, 9, 5, -30, .8)),
        sun: () => mkSvg('0 0 100 100', k => Array.from({ length: 12 }, (_, i) => `<path d="M50 2L56 18H44Z" fill="${k.lin([[0, '#ffe066'], [1, '#ff9f1a']])}" transform="rotate(${i * 30} 50 50)"/>`).join('')
            + `<circle cx="50" cy="50" r="28" fill="${k.rad([[0, '#fff6b0'], [.55, '#ffcf26'], [1, '#f08c00']])}" stroke="#fff" stroke-width="3"/>` + eyes(50, 48, .75, '#6b3a00') + blush(50, 56, .75) + smile(50, 56, .75, '#6b3a00') + spec(40, 34, 7, 4, -30, .7)),
        watermelon: () => mkSvg('0 0 100 80', k => `<path d="M6 16A44 44 0 0 0 94 16Z" fill="${k.lin([[0, '#7be28a'], [1, '#1d8f3e']])}" stroke="#fff" stroke-width="3"/><path d="M13 16A37 37 0 0 0 87 16Z" fill="#f4ffe9"/><path d="M17 16A33 33 0 0 0 83 16Z" fill="${k.rad([[0, '#ff9aa6'], [.6, '#ff3b55'], [1, '#d81c3a']], '50%', '10%', '90%')}"/>`
            + [[34, 26], [50, 34], [66, 26], [42, 40], [58, 40]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2.4" ry="3.6" fill="#3a1010"/>`).join('') + spec(30, 20, 8, 2.5, 10, .55)),
        flagVN: () => mkSvg('0 0 120 90', k => `<path d="M8 6V86" stroke="#c9a46a" stroke-width="5" stroke-linecap="round"/><path d="M10 10Q40 2 64 12T114 12V62Q90 52 64 62T10 62Z" fill="${k.lin([[0, '#ff4a3d'], [.5, '#da251d'], [1, '#a5100c']], 0, 0, 1, 1)}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>`
            + `<path d="${starPath(62, 37, 16, 6.5)}" fill="${k.rad([[0, '#fff6a6'], [.6, '#ffde00'], [1, '#e0a800']])}" stroke="#ffef80" stroke-width="1"/>` + spec(36, 16, 10, 3, -10, .4))
    });
    const cache = {};
    function sticker(name) {
        if (!PIECES[name]) return '';
        return cache[name] || (cache[name] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(PIECES[name]()));
    }

    const CANVAS_STYLES = new Set(['puffy', 'plaque', 'candy', 'bubble', 'gold', 'sticker', 'retro', 'ice', 'rainbow']);
    root.HpJarText3D = { F, FONT, render, sticker, CANVAS_STYLES, mix };
})(typeof self !== 'undefined' ? self : this);
