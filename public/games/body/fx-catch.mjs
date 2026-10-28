/* 🔴 BẮT NPC - mô-đun hiệu ứng của 🧍 Bộ Tách Người (overlays/camgames/body/overlay.html).
 * Một lượt: ném cầu (vòng cung, gần cam to → xa nhỏ) → trúng người → bật lên góc trên → mở nắp, tia sáng → người hoá năng lượng
 * và bị HÚT vào cầu, đầu vào trước → đóng nắp → cầu rơi xuống đất nảy → lắc N lần →
 *   ✅ bắt được: "cạch" + TING + sao bay → giữ holdSec giây → cầu bật mở, trả NPC về chỗ cũ
 *   ❌ xổng: cầu bung nắp → nhả ra ĐÚNG NPC (failMode 'self') hoặc một VIDEO hài thay NPC ('video': webm trong suốt / .pack.mp4,
 *      đứng đúng chỗ NPC, cao theo người) rồi NPC trở lại.
 * Quả cầu VẼ BẰNG MÃ (màu chỉnh được; mặc định đỏ - trắng - đai đen theo ý user 2026-10-27, đã báo rủi ro thương hiệu) hoặc ảnh ballFile (cầu tròn nhìn
 * thẳng: nửa trên ảnh = nắp, mở quanh mép sau).
 * NHẸ: chỉ Canvas 2D. Lúc hút / nhả (≈ 1 s) người được vẽ MỘT lần vào canvas phụ nửa cỡ quanh người + nhuộm màu, rồi cắt N dải
 * ngang (40 lần drawImage nhỏ) bay về cầu - không WebGL, không đọc điểm ảnh, không shadowBlur.
 * env: như fx-roiho.mjs (ctx, W, H, view, person, backdrop, media, playOnce, drawAt, sfx, sfxOn, cfg). */

import { packedLayout } from './alpha-pack.mjs';

export function createCatch(env) {
    const { ctx, W, H } = env;
    const TAU = Math.PI * 2;
    const FULL = { x: 0, y: 0, w: W, h: H };
    const viewNow = () => (env.view && env.view()) || FULL;
    const clamp01 = t => t < 0 ? 0 : t > 1 ? 1 : t;
    const lerp = (a, b, k) => a + (b - a) * k;
    const easeIn = t => t * t, easeInCubic = t => t * t * t;
    const easeOut = t => 1 - (1 - t) * (1 - t);
    const easeOutBack = t => { const c = 1.7; t = clamp01(t) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };
    // nảy khi rơi chạm đất (3 lần, mỗi lần thấp hơn)
    const bounce = t => {
        const n = 7.5625, d = 2.75;
        if (t < 1 / d) return n * t * t;
        if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
        if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
        return n * (t -= 2.625 / d) * t + 0.984375;
    };
    const rgb = hex => { const n = parseInt(String(hex || '#ffffff').slice(1), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const rgba = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };
    const shade = (hex, k) => { const [r, g, b] = rgb(hex).map(v => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))); return `rgb(${r},${g},${b})`; };

    let person = env.person();
    let fx = null;
    // canvas phụ: người nhuộm màu (nửa cỡ) - tạo một lần, đổi cỡ khi cần
    const oc = document.createElement('canvas'), octx = oc.getContext('2d');
    const OS = 0.5;

    // ---------- hình học: đo lúc bắt đầu ném (sau phần chờ) ----------
    function fxGeom(side) {
        const v = viewNow(), bottom = v.y + v.h;
        const feet = person.feet || { x: W / 2, y: H * 0.86 }, head = person.head || { x: W / 2, y: H * 0.3 };
        const ph = Math.max(240, Math.min(feet.y, bottom) - head.y);
        const cx = feet.x;
        const R = Math.max(46, Math.min(110, ph * 0.075)) * (fx.sc.ballSize / 100);
        const hit = { x: cx + side * Math.min(60, (person.w || 300) * 0.1), y: head.y + ph * 0.32 };
        const from = { x: cx + side * W * 0.75, y: bottom + R * 3 };
        const off = Math.max(200, Math.min(380, ph * 0.42));
        const air = { x: Math.max(v.x + R * 2.2, Math.min(v.x + v.w - R * 2.2, cx + side * off)), y: Math.max(v.y + R * 2.4, Math.min(head.y + ph * 0.05, v.y + v.h * 0.18)) };
        // khung chỉ tới eo (không thấy chân): cầu rơi xuống sát mép dưới vùng thấy
        // có 💬 hộp chữ ở mép dưới → cầu nằm trên mép hộp (không bị che)
        const boxTop = fx.sc.showText ? bottom - Math.max(40, v.h * 0.04) - Math.max(34, Math.min(52, v.w * 0.045)) * 4.2 : bottom;
        const groundY = Math.min(feet.y, bottom - R * 1.25, boxTop - R * 0.5) - R;
        const ground = { x: Math.max(v.x + R * 2, Math.min(v.x + v.w - R * 2, cx + side * Math.min(140, ph * 0.12))), y: groundY };
        return { R, hit, from, air, ground, ph, cx, headY: head.y, bottom };
    }

    // ---------- 🔴 quả cầu ----------
    // open 0..1 nắp mở (xoay quanh mép sau), glow 0..1 nút sáng, rot rad, scale. Toạ độ tâm (x, y).
    function drawBall(x, y, R, { rot = 0, open = 0, glow = 0, alpha = 1, inner = 0 } = {}) {
        const sc = fx.sc;
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.translate(x, y); ctx.rotate(rot);
        const hinge = fx.side;                  // bản lề phía XA người → nắp lật ra sau, miệng cầu hướng về NPC
        const img = sc.ballFile ? env.media(sc.ballFile) : null;
        const imgOk = img && !img.isVideo && img.el.complete && img.el.naturalWidth > 0;
        // lòng cầu sáng khi mở
        if (open > 0.02) {
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
            g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, rgba(sc.energyColor, 0.9)); g.addColorStop(1, rgba(sc.energyColor, 0));
            ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, R * 0.95, R * 0.3 + R * 0.15 * open, 0, 0, TAU); ctx.fill();
        }
        // nửa dưới
        if (imgOk) {
            const el = img.el, iw = el.naturalWidth, ih = el.naturalHeight;
            ctx.drawImage(el, 0, ih / 2, iw, ih / 2, -R, 0, R * 2, R);
        } else {
            const g = ctx.createRadialGradient(-R * 0.35, -R * 0.2, R * 0.1, 0, 0, R * 1.05);
            g.addColorStop(0, shade(sc.ballColor2, 0.45)); g.addColorStop(0.7, sc.ballColor2); g.addColorStop(1, shade(sc.ballColor2, -0.35));
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI); ctx.closePath(); ctx.fill();
            ctx.fillStyle = sc.bandColor; ctx.fillRect(-R, -R * 0.02, R * 2, R * 0.13);
        }
        // nắp (nửa trên) xoay quanh bản lề
        ctx.save();
        ctx.translate(hinge * R, 0); ctx.rotate(hinge * open * 1.25); ctx.translate(-hinge * R, 0);
        if (imgOk) {
            const el = img.el, iw = el.naturalWidth, ih = el.naturalHeight;
            ctx.drawImage(el, 0, 0, iw, ih / 2, -R, -R, R * 2, R);
        } else {
            const g = ctx.createRadialGradient(-R * 0.35, -R * 0.55, R * 0.08, 0, -R * 0.2, R * 1.1);
            g.addColorStop(0, shade(sc.ballColor, 0.55)); g.addColorStop(0.45, sc.ballColor); g.addColorStop(1, shade(sc.ballColor, -0.45));
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, Math.PI, TAU); ctx.closePath(); ctx.fill();
            ctx.fillStyle = sc.bandColor; ctx.fillRect(-R, -R * 0.11, R * 2, R * 0.12);
            // vệt bóng
            ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(-R * 0.38, -R * 0.58, R * 0.22, R * 0.11, -0.6, 0, TAU); ctx.fill();
        }
        ctx.restore();
        // nút giữa (vòng sáng) - nằm ở đường ghép nắp: nắp mở thì ẩn (không lơ lửng giữa lòng cầu)
        if ((!imgOk || glow > 0) && open < 0.08) {
            const br = R * 0.3;
            if (!imgOk) {
                // nút: vòng đen dày → nút trắng → vòng xám mảnh bên trong (như cầu thật)
                ctx.fillStyle = sc.bandColor; ctx.beginPath(); ctx.arc(0, 0, br, 0, TAU); ctx.fill();
                const gb = ctx.createRadialGradient(-br * 0.2, -br * 0.25, br * 0.05, 0, 0, br * 0.66);
                gb.addColorStop(0, '#ffffff'); gb.addColorStop(1, '#dcdcdc');
                ctx.fillStyle = gb; ctx.beginPath(); ctx.arc(0, 0, br * 0.64, 0, TAU); ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = Math.max(1, br * 0.06);
                ctx.beginPath(); ctx.arc(0, 0, br * 0.4, 0, TAU); ctx.stroke();
            }
            if (glow > 0) {
                ctx.globalCompositeOperation = 'lighter';
                const g = ctx.createRadialGradient(0, 0, 0, 0, 0, br * 2.4);
                g.addColorStop(0, rgba(sc.glowColor, 0.95 * glow)); g.addColorStop(0.35, rgba(sc.glowColor, 0.6 * glow)); g.addColorStop(1, rgba(sc.glowColor, 0));
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, br * 2.4, 0, TAU); ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
            }
        }
        // hào quang năng lượng (lúc hút / vừa đóng)
        if (inner > 0) {
            ctx.globalCompositeOperation = 'lighter';
            const g = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R * 2.2);
            g.addColorStop(0, rgba(sc.energyColor, 0.55 * inner)); g.addColorStop(1, rgba(sc.energyColor, 0));
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 2.2, 0, TAU); ctx.fill();
        }
        ctx.restore();
    }
    // bóng dưới cầu trên sàn
    function drawShadow(x, y, R, k) {
        ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.25);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.3);
        g.addColorStop(0, `rgba(0,0,0,${0.35 * k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 1.3, 0, TAU); ctx.fill(); ctx.restore();
    }
    // nắp + đáy bung khi xổng: 2 nửa văng ra, xoay, mờ dần
    function drawBurst(x, y, R, k) {
        const sc = fx.sc;
        ctx.save(); ctx.globalAlpha = 1 - k;
        for (const [dir, top] of [[-1, true], [1, false]]) {
            ctx.save();
            ctx.translate(x + dir * R * 1.6 * easeOut(k), y + (top ? -R * 1.8 : R * 0.4) * easeOut(k) + (top ? R * 2.4 * k * k : 0));
            ctx.rotate(dir * k * 2.2);
            ctx.fillStyle = top ? sc.ballColor : sc.ballColor2;
            ctx.beginPath(); ctx.arc(0, 0, R, top ? Math.PI : 0, top ? TAU : Math.PI); ctx.closePath(); ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }

    // ---------- 🧍 người: vẽ thường / nhuộm năng lượng + cắt dải hút về cầu ----------
    function drawPersonPlain(dx = 0, dy = 0, s = 1) {
        if (!person.ready || !person.img || !person.M) return;
        const M = person.M, ax = person.feet ? person.feet.x : W / 2, ay = person.feet ? person.feet.y : H;
        ctx.save();
        if (dx || dy || s !== 1) { ctx.translate(ax + dx, ay + dy); ctx.scale(s, s); ctx.translate(-ax, -ay); }
        ctx.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
        ctx.drawImage(person.img, 0, 0);
        ctx.restore();
    }
    // Vẽ người (đang sống - camera vẫn chạy) vào canvas phụ quanh người, nhuộm tint 0..1. Trả khung trên sân khấu.
    function snapPerson(tint) {
        if (!person.ready || !person.img || !person.M) return null;
        const g = fx.g, v = viewNow();
        const hw = Math.max((person.w || 300) * 0.62, g.ph * 0.28);
        const x0 = person.feet.x - hw, x1 = person.feet.x + hw;
        const y0 = person.head.y - g.ph * 0.1, y1 = Math.min(person.feet.y, v.y + v.h) + 8;
        const ow = Math.max(8, Math.ceil((x1 - x0) * OS)), oh = Math.max(8, Math.ceil((y1 - y0) * OS));
        if (oc.width !== ow || oc.height !== oh) { oc.width = ow; oc.height = oh; } else octx.clearRect(0, 0, ow, oh);
        const M = person.M;
        octx.setTransform(OS, 0, 0, OS, -x0 * OS, -y0 * OS);
        octx.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
        octx.drawImage(person.img, 0, 0);
        octx.setTransform(1, 0, 0, 1, 0, 0);
        if (tint > 0) {
            octx.globalCompositeOperation = 'source-atop';
            octx.fillStyle = rgba(fx.sc.energyColor, 0.85 * tint); octx.fillRect(0, 0, ow, oh);
            octx.fillStyle = `rgba(255,255,255,${0.35 * tint})`; octx.fillRect(0, 0, ow, oh);
            octx.globalCompositeOperation = 'source-over';
        }
        return { x0, y0, x1, y1, ow, oh };
    }
    // k 0..1: tiến độ hút (0 = đứng nguyên, 1 = vào hết). Dải gần đầu đi trước (D = độ trễ chân so với đầu).
    const STRIPS = 40, D = 0.9;
    const edges = new Float32Array((STRIPS + 1) * 4);      // x, y, bề ngang, tiến độ của từng cạnh dải - dùng lại mỗi khung
    function drawSuck(k, bx, by, tint, swirl) {
        const box = snapPerson(tint);
        if (!box) return;
        const sh = box.oh / STRIPS, stageH = (box.y1 - box.y0) / STRIPS, cx = (box.x0 + box.x1) / 2, fullW = box.x1 - box.x0;
        // Tính theo CẠNH dải (STRIPS + 1 cạnh) rồi vẽ mỗi dải trải kín giữa 2 cạnh kề → dải liền nhau như một dải lụa, không hở khe.
        const E = edges;
        for (let j = 0; j <= STRIPS; j++) {
            const v = j / STRIPS, p = clamp01(k * (1 + D) - v * D), e = easeInCubic(p);
            const sy = box.y0 + j * stageH;
            // vòng cung xoáy: lệch theo sin, chiều theo phía cầu
            const arc = Math.sin(e * Math.PI) * swirl;
            E[j * 4] = lerp(cx, bx, e) + arc * (1 - v * 0.5);
            E[j * 4 + 1] = lerp(sy, by, e) - arc * 0.35;
            E[j * 4 + 2] = fullW * Math.pow(1 - e, 1.4);
            E[j * 4 + 3] = p;
        }
        for (let i = 0; i < STRIPS; i++) {
            const a = i * 4, b = a + 4;
            const p = Math.min(E[a + 3], E[b + 3]);
            if (p >= 1) continue;
            const w = (E[a + 2] + E[b + 2]) / 2;
            if (w < 1) continue;
            const ya = E[a + 1], yb = E[b + 1];
            const y = Math.min(ya, yb) - 0.75, h = Math.max(1.5, Math.abs(yb - ya) + 1.5);
            ctx.globalAlpha = p > 0.85 ? (1 - p) / 0.15 : 1;
            ctx.drawImage(oc, 0, i * sh, box.ow, sh, (E[a] + E[b]) / 2 - w / 2, y, w, h);
        }
        ctx.globalAlpha = 1;
    }
    // hạt năng lượng bay từ người về cầu (hút) / từ cầu ra (nhả)
    function stepSparks(dt, on, bx, by, out) {
        const f = fx, g = f.g;
        if (on) {
            f.sparkAcc += 90 * dt;
            while (f.sparkAcc >= 1) {
                f.sparkAcc -= 1;
                const sx = g.cx + (Math.random() - 0.5) * (person.w || 300), sy = g.headY + Math.random() * g.ph;
                f.sparks.push(out ? { x: bx, y: by, tx: sx, ty: sy, t: 0, life: 0.5 + Math.random() * 0.3, r: 3 + Math.random() * 5 }
                                  : { x: sx, y: sy, tx: bx, ty: by, t: 0, life: 0.45 + Math.random() * 0.35, r: 3 + Math.random() * 5 });
            }
        }
        if (!f.sparks.length) return;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgba(f.sc.energyColor, 0.9);
        for (const s of f.sparks) {
            s.t += dt;
            const k = easeIn(clamp01(s.t / s.life));
            const x = lerp(s.x, s.tx, k), y = lerp(s.y, s.ty, k);
            ctx.globalAlpha = 1 - k * 0.6;
            ctx.beginPath(); ctx.arc(x, y, s.r * (1 - k * 0.5), 0, TAU); ctx.fill();
        }
        ctx.restore();
        f.sparks = f.sparks.filter(s => s.t < s.life);
    }
    // tia sáng: hình nón từ cầu toả xuống người
    function drawBeam(bx, by, a) {
        if (a <= 0) return;
        const g = fx.g, tx = g.cx, ty = g.headY + g.ph * 0.45, spread = Math.max(140, g.ph * 0.35);
        const ang = Math.atan2(ty - by, tx - bx), len = Math.hypot(tx - bx, ty - by) * 1.15;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(bx, by); ctx.rotate(ang);
        const gr = ctx.createLinearGradient(0, 0, len, 0);
        gr.addColorStop(0, `rgba(255,255,255,${0.75 * a})`); gr.addColorStop(0.25, rgba(fx.sc.energyColor, 0.45 * a)); gr.addColorStop(1, rgba(fx.sc.energyColor, 0));
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.moveTo(0, -fx.g.R * 0.5); ctx.lineTo(len, -spread); ctx.lineTo(len, spread); ctx.lineTo(0, fx.g.R * 0.5); ctx.closePath(); ctx.fill();
        ctx.restore();
    }
    // chớp sáng tròn (trúng / đóng / bung)
    function drawFlash(x, y, r, a) {
        if (a <= 0) return;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.4, rgba(fx.sc.glowColor, 0.5 * a)); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore();
    }
    // ⭐ sao bay khi bắt được
    // ⭐ bắt được (như phim): 5 sao vàng to toả sáng bung thành vòng cung TRÊN cầu, sao giữa to nhất, lơ lửng nhẹ rồi mờ;
    // quanh cầu lấp lánh hạt sáng 4 cánh nhỏ. k = 0..1 trên ~1,6 s.
    const STAR_ARC = [[-162, 0.62], [-128, 0.78], [-90, 1], [-52, 0.78], [-18, 0.62]];
    const TWINKLES = Array.from({ length: 14 }, (_, i) => ({ a: i * 2.39, d: 0.9 + (i * 0.37) % 1.4, t: (i * 0.29) % 1, s: 0.08 + (i % 3) * 0.04 }));
    function starPath(r, inner) {
        ctx.beginPath();
        for (let j = 0; j < 10; j++) { const rr = j % 2 ? r * inner : r, aa = j * Math.PI / 5 - Math.PI / 2; ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); }
        ctx.closePath();
    }
    function drawStars(x, y, R, k) {
        if (k <= 0 || k >= 1) return;
        const col = fx.sc.glowColor, out = easeOutBack(clamp01(k / 0.28)), fade = 1 - clamp01((k - 0.65) / 0.35);
        ctx.save();
        STAR_ARC.forEach(([deg, sz], i) => {
            const a = deg * Math.PI / 180, d = R * (0.4 + 1.55 * out) * (0.85 + sz * 0.25);
            const sx = x + Math.cos(a) * d, sy = y - R * 0.15 + Math.sin(a) * d - Math.sin(k * 6 + i) * R * 0.05 - k * R * 0.25;
            const r = R * 0.62 * sz * Math.min(1, out);
            ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.sin(k * 4 + i * 1.3) * 0.18);
            ctx.globalAlpha = fade;
            // quầng sáng mềm sau sao
            ctx.globalCompositeOperation = 'lighter';
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.7);
            g.addColorStop(0, rgba(col, 0.75)); g.addColorStop(0.5, rgba(col, 0.25)); g.addColorStop(1, rgba(col, 0));
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, TAU); ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
            // thân sao: vàng đậm viền, ruột sáng dần ra trắng
            starPath(r, 0.5);
            const b = ctx.createRadialGradient(0, -r * 0.1, 0, 0, 0, r);
            b.addColorStop(0, '#fffde8'); b.addColorStop(0.55, shade(col, 0.35)); b.addColorStop(1, col);
            ctx.fillStyle = b; ctx.fill();
            ctx.restore();
        });
        // hạt lấp lánh 4 cánh quanh cầu
        ctx.globalCompositeOperation = 'lighter';
        for (const p of TWINKLES) {
            const tw = Math.sin((k * 3 + p.t) * TAU) * 0.5 + 0.5;
            const px = x + Math.cos(p.a) * R * p.d * 1.6, py = y + Math.sin(p.a) * R * p.d - R * 0.3, s = R * p.s * (0.5 + tw);
            ctx.globalAlpha = fade * tw;
            ctx.fillStyle = p.t > 0.5 ? '#c8ffb0' : '#fff6c0';
            ctx.beginPath(); ctx.moveTo(px, py - s * 2); ctx.lineTo(px + s * 0.45, py); ctx.lineTo(px, py + s * 2); ctx.lineTo(px - s * 0.45, py); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(px - s * 2, py); ctx.lineTo(px, py + s * 0.45); ctx.lineTo(px + s * 2, py); ctx.lineTo(px, py - s * 0.45); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
    }

    // ---------- 💬 hộp chữ kiểu game (lúc lắc: "Đang thu phục..." chấm theo từng lần lắc → kết quả) ----------
    const fill = (tpl, f) => String(tpl || '').replace(/\{user\}/g, f.user).replace(/\{npc\}/g, f.npc);
    function wrap(text, maxW) {
        const out = [];
        for (const para of text.split(/\r?\n/)) {
            let line = '';
            for (const w of para.split(' ')) {
                const t = line ? line + ' ' + w : w;
                if (line && ctx.measureText(t).width > maxW) { out.push(line); line = w; } else line = t;
            }
            out.push(line);
        }
        return out.slice(0, 3);
    }
    // text: chữ đầy đủ · shown: số ký tự đã gõ (gõ chữ dần như game) · a: độ hiện hộp · arrow: tam giác nhấp nháy "bấm tiếp"
    function drawTextBox(text, shown, a, arrow, now) {
        if (a <= 0.01 || !text) return;
        const v = viewNow(), fs = Math.round(Math.max(34, Math.min(52, v.w * 0.045)));
        const bw = Math.min(v.w - 60, 980), pad = fs * 0.7, x = v.x + (v.w - bw) / 2;
        ctx.save();
        ctx.font = `800 ${fs}px "Segoe UI", "Be Vietnam Pro", Arial, sans-serif`;
        const lines = wrap(text, bw - pad * 2 - fs);
        const bh = pad * 2 + lines.length * fs * 1.3;
        const y = v.y + v.h - bh - Math.max(40, v.h * 0.04) + (1 - a) * 30;
        ctx.globalAlpha = a;
        const rr = (X, Y, w, h, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(X, Y, w, h, r) : ctx.rect(X, Y, w, h); };
        rr(x, y, bw, bh, fs * 0.45); ctx.fillStyle = '#2b2d42'; ctx.fill();
        rr(x + 5, y + 5, bw - 10, bh - 10, fs * 0.35); ctx.fillStyle = fx.sc.textColor2; ctx.fill();
        rr(x + 12, y + 12, bw - 24, bh - 24, fs * 0.28); ctx.fillStyle = '#fbfbf7'; ctx.fill();
        ctx.fillStyle = '#2b2d42'; ctx.textBaseline = 'top';
        let left = shown;
        lines.forEach((ln, i) => {
            if (left <= 0) return;
            ctx.fillText(ln.slice(0, left), x + pad, y + pad + i * fs * 1.3);
            left -= ln.length + 1;
        });
        if (arrow && shown >= text.length && Math.floor(now / 380) % 2 === 0) {
            const ax = x + bw - pad - fs * 0.3, ay = y + bh - pad - fs * 0.35;
            ctx.fillStyle = fx.sc.textColor2;
            ctx.beginPath(); ctx.moveTo(ax - fs * 0.3, ay - fs * 0.2); ctx.lineTo(ax + fs * 0.3, ay - fs * 0.2); ctx.lineTo(ax, ay + fs * 0.2); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
    }
    const CPS = 34;                              // tốc độ gõ chữ (ký tự / giây)
    function texts(f, e, now) {
        const sc = f.sc, s = f.s;
        if (!sc.showText) return;
        const from = s.landAt + 150;
        if (e < from) return;
        let text, t0, a = clamp01((e - from) / 200), arrow = false;
        if (e < s.resultAt) {
            // chấm "." thêm theo từng lần lắc như game
            const n = s.shakes.filter(at => e >= at).length;
            text = fill(f.tWait, f) + '.'.repeat(n);
            t0 = from;
        } else {
            text = fill(f.outcome === 'win' ? f.tWin : f.tFail, f);
            t0 = s.resultAt + (f.outcome === 'win' ? 250 : 150);
            if (e < t0) { text = fill(f.tWait, f) + '.'.repeat(s.shakes.length); t0 = from; }
            arrow = true;
            const until = f.outcome === 'win' ? s.releaseAt + 300 : s.resultAt + 2600;
            a = Math.min(a, 1 - clamp01((e - until) / 300));
        }
        const base = text.replace(/\.+$/, '');
        const shown = e < s.resultAt ? Math.min(base.length, Math.floor((e - t0) / 1000 * CPS)) + (text.length - base.length)
                                     : Math.floor((e - t0) / 1000 * CPS);
        drawTextBox(text, Math.min(text.length, shown), a, arrow, now);
    }

    // ---------- lượt ----------
    function plan(sc, outcome, breakAt) {
        const T = sc.timing, s = {};
        s.throwAt = Math.max(0, sc.waitSec) * 1000;
        s.hitAt = s.throwAt + T.throwMs;
        s.airAt = s.hitAt + T.bounceMs;
        s.openAt = s.airAt + 120;
        s.suckAt = s.openAt + T.openMs;
        s.closeAt = s.suckAt + T.suckMs;
        s.fallAt = s.closeAt + T.closeMs;
        s.landAt = s.fallAt + T.fallMs;
        const shakes = outcome === 'win' ? sc.shakes : breakAt;
        s.shakes = [];
        let t = s.landAt + 350;
        for (let i = 0; i < shakes; i++) { s.shakes.push(t); t += T.shakeMs + T.shakeGapMs; }
        s.resultAt = t - (shakes ? T.shakeGapMs * 0.5 : 0);
        if (outcome === 'win') {
            s.releaseAt = s.resultAt + 1200 + sc.holdSec * 1000;
            s.endAt = s.releaseAt + T.releaseMs + 350;
        } else {
            s.releaseAt = s.resultAt + 120;
            // có 💬 hộp chữ: giữ lượt tới khi câu "thoát ra" đọc xong (hộp tắt ở resultAt + 2,6 s)
            s.endAt = Math.max(s.releaseAt + T.releaseMs + 350, sc.showText ? s.resultAt + 2900 : 0);   // 'video': kéo dài tới hết video (frame tự dời)
        }
        return s;
    }
    // d = { script (đã chuẩn hoá), … }
    function start(d, now) {
        person = env.person();
        const sc = d.script;
        const win = sc.outcome === 'win' ? true : sc.outcome === 'fail' ? false : Math.random() * 100 < sc.winPct;
        const breakAt = 1 + Math.floor(Math.random() * Math.max(1, sc.shakes));     // xổng ở lần lắc thứ mấy (1..shakes)
        const failMode = sc.failMode === 'random' ? (sc.failFile && Math.random() < 0.5 ? 'video' : 'self') : (sc.failMode === 'video' && sc.failFile ? 'video' : 'self');
        const side = Math.random() < 0.5 ? -1 : 1;
        // 💬 mỗi ô chữ có thể nhiều câu (mỗi dòng một câu) → bốc một câu cho lượt này
        const pick = t => { const L = String(t || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean); return L.length ? L[Math.floor(Math.random() * L.length)] : ''; };
        fx = { d, sc, start: now, side, user: String(d.nickname || d.uniqueId || '').trim() || 'Bạn', npc: sc.npcName || 'NPC',
               tWait: pick(sc.textWait), tWin: pick(sc.textWin), tFail: pick(sc.textFail), winPick: win ? pickWin(sc) : '', outcome: win ? 'win' : 'fail', failMode, s: plan(sc, win ? 'win' : 'fail', breakAt), g: null,
               sparks: [], sparkAcc: 0, cue: new Set(), vid: null, vidStart: 0, vidEnd: 0 };
        fx.g = fxGeom(side);
        if (sc.ballFile) env.media(sc.ballFile);
        return true;
    }
    // 🎬 BẮT ĐƯỢC: video (winFile - webm trong suốt phủ cả khung / mp4) + mp3 riêng (winAudio) bắt đầu ngay sau tiếng TING.
    // NPC ở trong cầu tới khi CẢ HAI chạy hết (user 2026-10-28 "chạy hết video thì ngưng") - dời releaseAt / endAt theo từng khung.
    // Video / mp3 chưa kịp chạy (đang nạp) chờ tối đa 1,5 s; ảnh tĩnh hiện 3 s.
    const WIN_MEDIA_AT = 350;
    const busy = (el, t0, e) => !!el && !el.ended && (!el.paused || e - t0 < 1500);
    function winMedia(f, e) {
        const s = f.s, sc = f.sc;
        if (!f.winPick && !sc.winAudio) return;
        if (e < s.resultAt + WIN_MEDIA_AT) return;
        if (!f.win) {
            f.win = { m: f.winPick ? env.media(f.winPick) : null, a: sc.winAudio && env.audio ? env.audio(sc.winAudio, sc.winAudioVol) : null, at: e };
            if (f.win.m) env.playOnce(f.win.m, sc.winSound);
        }
        const w = f.win, el = w.m && w.m.isVideo ? w.m.el : null;
        if (busy(el, w.at, e) || busy(w.a, w.at, e) || (w.m && !w.m.isVideo && e - w.at < 3000)) {
            s.releaseAt = Math.max(s.releaseAt, e + 60);
            s.endAt = s.releaseAt + sc.timing.releaseMs + 350;
        }
        if (w.m && e < s.releaseAt + 300) {
            ctx.save(); ctx.globalAlpha = 1 - clamp01((e - s.releaseAt) / 300); env.drawCover(w.m, 0); ctx.restore();
        }
    }
    // ❌ XỔNG: mp3 riêng (failAudio) lúc cầu bung; nhả lại đúng NPC thì lượt chờ mp3 chạy hết (bản video hài: theo video).
    function failAudio(f, e) {
        const s = f.s, sc = f.sc;
        if (!sc.failAudio || e < s.resultAt) return;
        if (!f.failA) f.failA = { a: env.audio ? env.audio(sc.failAudio, sc.failAudioVol) : null, at: e };
        if (f.failMode !== 'video' && busy(f.failA.a, f.failA.at, e)) s.endAt = Math.max(s.endAt, e + 60);
    }
    // 🎬 bốc 1 video bắt được: ngẫu nhiên, không lặp liền video lượt trước của cùng kịch bản
    const lastWin = new Map();
    function pickWin(sc) {
        const L = sc.winFiles || [];
        if (!L.length) return '';
        const prev = lastWin.get(sc.id), pool = L.length > 1 ? L.filter(x => x !== prev) : L;
        const f = pool[Math.floor(Math.random() * pool.length)];
        lastWin.set(sc.id, f);
        return f;
    }
    function stop() {
        if (fx) {
            if (fx.vid && fx.vid.isVideo) fx.vid.el.pause();
            if (fx.win) { if (fx.win.m && fx.win.m.isVideo) fx.win.m.el.pause(); if (fx.win.a) fx.win.a.pause(); }
            if (fx.failA && fx.failA.a) fx.failA.a.pause();
        }
        fx = null;
    }
    function estMs() {
        if (!fx) return 0;
        return fx.failMode === 'video' && fx.outcome === 'fail' ? fx.s.endAt + 6000 : fx.s.endAt;
    }

    // 🔊 tiếng theo mốc - mốc đã qua > 0,4 s (tua soi) bỏ qua
    function sounds(f, e) {
        if (!env.sfx || !env.sfxOn || !env.sfxOn(f.sc)) return;
        const s = f.s, T = f.sc.timing, X = env.sfx, v = env.cfg().sfxVolume ?? 0.7;
        const once = (k, at, fn) => { if (e >= at && !f.cue.has(k)) { f.cue.add(k); if (e - at < 400) fn(); } };
        once('throw', s.throwAt, () => X.whoosh(T.throwMs / 1000, { vol: v * 0.8, f0: 500, f1: 1600, dir: -f.side }));
        once('hit', s.hitAt, () => { X.thud(0.35, { vol: v * 0.7 }); X.click(0.6, { vol: v }); });
        once('open', s.openAt, () => { X.pop(0.6, { vol: v * 0.8 }); X.beam((T.openMs + T.suckMs) / 1000, { vol: v }); });
        once('close', s.closeAt, () => X.click(1, { vol: v }));
        // rơi nảy: chạm sàn đúng 4 mốc của đường nảy (bounce), mỗi lần nhẹ hơn
        [[0.364, 0.45], [0.727, 0.25], [0.909, 0.14], [1, 0.08]].forEach(([k, p], i) => once('land' + i, s.fallAt + T.fallMs * k, () => {
            X.thud(p, { vol: v * 0.7 }); X.click(p * 1.4, { vol: v * 0.7, at: 0.005 });
        }));
        // lắc: cộc trái - phải trên sàn + lạch cạch trong cầu + bíp nút sáng
        s.shakes.forEach((at, i) => once('shake' + i, at, () => X.rattle(T.shakeMs / 1000, { vol: v })));
        if (f.outcome === 'win') {
            // cạch khoá → TING → nhạc thắng ngắn (sóng tam giác, tự soạn)
            once('win', s.resultAt, () => {
                X.click(1.2, { vol: v }); X.ding({ vol: v, at: 0.1 });
                X.chip([[0, 0.55], [784, 0.1], [988, 0.1], [1175, 0.1], [1568, 0.34]], { vol: v * 0.8, type: 'triangle' });
            });
            once('release', s.releaseAt, () => { X.pop(0.8, { vol: v * 0.8 }); X.beam(0.5, { vol: v * 0.6 }); });
        } else {
            // bung nắp → tiếng tụt buồn ngắn
            once('burst', s.resultAt, () => {
                X.pop(1.2, { vol: v }); X.crack(0.4, { vol: v * 0.5 });
                X.chip([[0, 0.25], [392, 0.16], [370, 0.16], [349, 0.16], [330, 0.42]], { vol: v * 0.7, type: 'triangle' });
            });
        }
    }

    // Toạ độ cầu theo thời gian e. Trả { x, y, R, rot, open, glow, inner, show, shadow }.
    function ballAt(f, e) {
        const s = f.s, g = f.g, T = f.sc.timing, R = g.R;
        if (e < s.throwAt) return null;
        if (e < s.hitAt) {
            const k = (e - s.throwAt) / T.throwMs;
            const x = lerp(g.from.x, g.hit.x, k), y = lerp(g.from.y, g.hit.y, k) - Math.sin(k * Math.PI) * g.ph * 0.35;
            return { x, y, R: R * lerp(1.7, 1, easeOut(k)), rot: k * 9 * f.side };
        }
        if (e < s.airAt) {
            const k = (e - s.hitAt) / T.bounceMs, q = easeOut(k);
            const x = lerp(g.hit.x, g.air.x, q), y = lerp(g.hit.y, g.air.y, q) - Math.sin(k * Math.PI) * R * 1.5;
            return { x, y, R, rot: (1 - q) * 3 * f.side };
        }
        const bob = Math.sin(e / 180) * R * 0.08;
        if (e < s.closeAt + T.closeMs) {
            const open = e < s.openAt ? 0 : e < s.closeAt ? easeOutBack((e - s.openAt) / T.openMs) : 1 - easeIn((e - s.closeAt) / T.closeMs);
            const inner = e < s.suckAt ? 0.4 * clamp01((e - s.openAt) / T.openMs) : e < s.closeAt ? 1 : 1 - (e - s.closeAt) / T.closeMs;
            // nghiêng cả quả cầu cho miệng hướng xuống phía NPC (≈ 35°) lúc mở, đóng nắp thì xoay về thẳng
            const tq = e < s.openAt ? 0 : e < s.closeAt ? easeOut(clamp01((e - s.openAt) / T.openMs)) : 1 - easeIn(clamp01((e - s.closeAt) / T.closeMs));
            return { x: g.air.x, y: g.air.y + bob, R, rot: -f.side * 0.6 * tq, open: clamp01(open) * 0.85 + Math.max(0, open - 1) * 0.3, inner };
        }
        if (e < s.landAt) {
            const k = (e - s.fallAt) / T.fallMs, q = bounce(clamp01(k));
            return { x: lerp(g.air.x, g.ground.x, easeOut(clamp01(k * 1.4))), y: lerp(g.air.y + bob, g.ground.y, q), R, rot: k * 2 * f.side, shadow: q };
        }
        let rot = 0, glow = 0;
        for (const at of s.shakes) {
            if (e >= at && e < at + T.shakeMs) { const k = (e - at) / T.shakeMs; rot = Math.sin(k * TAU) * 0.42 * (1 - k * 0.3); glow = Math.sin(k * Math.PI); }
        }
        if (f.outcome === 'win' && e >= s.resultAt) glow = e < s.releaseAt ? 0.55 + 0.45 * Math.max(0, 1 - (e - s.resultAt) / 500) : 0;
        return { x: g.ground.x, y: g.ground.y, R, rot, glow, shadow: 1 };
    }

    function frame(now, dt, eFix) {
        if (!fx) return true;
        person = env.person();
        const f = fx, s = f.s, T = f.sc.timing, g = f.g;
        const e = eFix != null ? eFix : now - f.start;
        sounds(f, e);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        env.backdrop(4, null);
        const b = ballAt(f, e);
        let done = false;

        // --- người ---
        if (e < s.suckAt) {
            // trúng cầu: giật nhẹ; mở nắp: bắt đầu nhuộm năng lượng
            const flinch = e >= s.hitAt && e < s.hitAt + 260 ? Math.sin((e - s.hitAt) / 260 * Math.PI) : 0;
            if (e >= s.openAt) { const tint = clamp01((e - s.openAt) / T.openMs) * 0.6; drawSuck(0, b.x, b.y, tint, 0); }
            else drawPersonPlain(-f.side * flinch * 14, 0, 1 - flinch * 0.03);
        } else if (e < s.closeAt) {
            const k = (e - s.suckAt) / T.suckMs;
            drawSuck(k, b.x, b.y, 0.6 + 0.4 * clamp01(k * 3), f.side * g.ph * 0.18);
        } else if (e >= s.releaseAt) {
            // nhả ra: bản 'video' thay người bằng video hài; còn lại người mọc lại từ cầu (hút ngược)
            if (f.outcome === 'fail' && f.failMode === 'video') done = drawFailVideo(f, e, b);
            else {
                const k = 1 - clamp01((e - s.releaseAt) / T.releaseMs);
                if (k > 0) drawSuck(easeOut(k), b.x, b.y - b.R * 0.3, k, f.side * g.ph * 0.1);
                else drawPersonPlain();
                if (e >= s.endAt) done = true;
            }
        }

        // --- tia sáng + hạt ---
        if (b && e >= s.openAt && e < s.closeAt + T.closeMs) {
            const a = e < s.suckAt ? clamp01((e - s.openAt) / T.openMs) : e < s.closeAt ? 1 - 0.3 * ((e - s.suckAt) / T.suckMs) : 1 - (e - s.closeAt) / T.closeMs;
            drawBeam(b.x, b.y, a * 0.9);
        }
        stepSparks(dt, b && e >= s.suckAt - 150 && e < s.closeAt, b ? b.x : 0, b ? b.y : 0, false);

        // --- cầu ---
        const broken = f.outcome === 'fail' && e >= s.resultAt;
        const released = f.outcome === 'win' && e >= s.releaseAt;
        if (b) {
            if (b.shadow != null) drawShadow(g.ground.x, g.ground.y + b.R * 1.02, b.R, b.shadow);
            if (broken) drawBurst(b.x, b.y, b.R, clamp01((e - s.resultAt) / 600));
            else if (released) {
                const k = clamp01((e - s.releaseAt) / 450);
                drawBall(b.x, b.y, b.R, { open: easeOutBack(k) * 0.9, alpha: 1 - clamp01((e - s.releaseAt - 300) / 400), inner: 1 - k });
            } else drawBall(b.x, b.y, b.R, b);
        }
        // chớp: trúng người · đóng nắp · bung / bật mở
        if (b) {
            if (e >= s.hitAt && e < s.hitAt + 220) drawFlash(g.hit.x, g.hit.y, g.R * 3, 1 - (e - s.hitAt) / 220);
            if (e >= s.closeAt && e < s.closeAt + 350) drawFlash(b.x, b.y, g.R * 4, 1 - (e - s.closeAt) / 350);
            if (broken && e < s.resultAt + 450) drawFlash(b.x, b.y, g.R * 6, 1 - (e - s.resultAt) / 450);
            if (released && e < s.releaseAt + 400) drawFlash(b.x, b.y, g.R * 5, 1 - (e - s.releaseAt) / 400);
            if (f.outcome === 'win') drawStars(b.x, b.y, g.R, (e - s.resultAt) / 1600);
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        if (f.outcome === 'win') winMedia(f, e);
        else failAudio(f, e);
        texts(f, e, now);
        if (done) stop();
        return done;
    }
    // ❌ nhả ra video hài: đứng đúng chỗ NPC (đáy = chân / mép dưới), cao theo người × failScale; hết video → NPC hiện lại.
    function drawFailVideo(f, e, b) {
        const s = f.s, g = f.g, sc = f.sc;
        if (!f.vid) {
            f.vid = env.media(sc.failFile);
            if (f.vid) env.playOnce(f.vid, sc.failSound);
            f.vidStart = e;
        }
        const m = f.vid, el = m && m.el;
        const vw = el ? (m.isVideo ? el.videoWidth : el.naturalWidth) : 0, vh = el ? (m.isVideo ? el.videoHeight : el.naturalHeight) : 0;
        const dur = sc.failDurSec > 0 ? sc.failDurSec * 1000 : (m && m.isVideo && el.duration > 0 && isFinite(el.duration) ? el.duration * 1000 : 4000);
        const t = e - f.vidStart, back = 450;
        if (vw && vh) {
            // .pack.mp4 = nửa màu + nửa alpha (cạnh nhau hoặc trên dưới) → khung thật một nửa
            const L = m.packed ? packedLayout(vw, vh) : { w: vw, h: vh };
            const hh = g.ph * sc.failScale / 100, ww = hh * L.w / L.h;
            const grow = easeOutBack(clamp01(t / 350)), fade = 1 - clamp01((t - dur) / back);
            const bottom = Math.min(person.feet ? person.feet.y : g.bottom, g.bottom);
            env.drawAt(m, g.cx, bottom - hh * grow / 2, ww * grow, hh * grow, 0, fade);
        }
        if (t >= dur) {
            const k = clamp01((t - dur) / back);
            drawSuck(1 - easeOut(k), b.x, b.y, 1 - k, 0);
            if (k >= 1) { drawPersonPlain(); return t >= dur + back + 250; }
        }
        return false;
    }
    return { start, stop, frame, estMs, get fx() { return fx; }, playing: () => (fx ? [fx.vid, fx.win && fx.win.m].filter(Boolean) : []),
        preload: () => (fx && fx.winPick ? [fx.winPick] : []) };      // nạp sẵn video bắt được ngay từ đầu lượt (overlay syncMedia)
}
