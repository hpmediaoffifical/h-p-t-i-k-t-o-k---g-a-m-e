/* ✨ BIẾN HÌNH đợt 4 (user 2026-10-28 chọn từ gợi ý) - 6 kiểu vẽ bằng mã, nối vào fx-morph.mjs (FRAMES):
 *   👻 ghost   - hồn trong suốt phát sáng kéo ra khỏi thân (thân gục, màn tối xanh) → lượn vòng 3D quanh người (ra sau lưng thì khuất)
 *                 nối bằng sợi hồn → bị hút ngược về, nhập lại loé sáng
 *   🪞 clone   - 2 + 2×power bản sao xếp hình chữ V phía sau (xa = nhỏ + cao + tối), mỗi bản nhảy TRỄ 0,12 s × thứ tự (ảnh chụp vòng),
 *                 viền sáng đổi sắc + đèn sân khấu → nhập về một
 *   🫠 melt    - LÝ DO: mặt trời plasma hạ xuống + đồng hồ nhiệt vọt 1000°C + sóng nhiệt + mồ hôi → từng cột người chảy xuống với tốc độ khác nhau thành vũng bóng loáng (màu người trải ra, sáng đỉnh, tối mép), bọt sủi
 *                 vỡ; giữ waitSec → mọc lên lại kiểu thạch (vượt lố rồi rung)
 *   🎈 balloon - bơm 4 nhịp (bơm tay kim loại + ống) → người phồng tròn từng hàng + bóng khối cầu + điểm loá cao su → bay lên có dây →
 *                 NỔ "BỤP!" mảnh cao su văng → xì hơi bay vòng vèo → nằm bẹp → phồng về (lò xo)
 *   📱 phone   - điện thoại 3D (vỏ kim loại, độ dày, đảo camera) bay vào xoay → tia hút người thu nhỏ vào màn → màn LIVE mini có avatar +
 *                 tên người tặng, tim bay, bình luận → vuốt lên văng người ra đáp chỗ cũ → điện thoại bay đi
 *   💉 lipo    - xe máy hút mỡ y tế lăn vào, ống trong suốt cắm bụng, cục mỡ vàng chạy về bình (đầy dần), người tóp từng hàng (eo / đùi /
 *                 má hóp, KHÔNG vẽ vạch xương - user chốt) → bật phồng lại kiểu lò xo
 *   🎨 anime   - nền thành trang truyện trắng đen (khử màu + giấy ngà), vệt tập trung đập theo trống taiko, người tô màu phẳng
 *                 (SVG posterize) + bóng cel cạnh cứng + chấm lưới + viền mực, bong bóng thoại, "ドドド" → trang xé đôi bay đi
 * CHỐNG LAG (user dặn "làm mượt, không lag" ngay từ đầu): chỉ Canvas 2D; người chụp vào canvas phụ NỬA cỡ một lần / khung rồi cắt dán
 * (cột / hàng ≤ 56 lần vẽ ảnh nhỏ); quầng sáng = mờ trên canvas 1/4; mọi hình nặng (vỏ điện thoại, vệt tập trung) vẽ SẴN một lần;
 * không getImageData, không shadowBlur; KHÔNG chạy model dáng (MORPH_NO_POSE trong overlay.html). Hạt / mảnh có trần số lượng.
 * h: { ctx, W, H, person(), cue, shakeAt, drawPersonPlain, snapInto, mk, rng } từ fx-morph.mjs. dt = giây. */

export function createMore(h) {
    const { ctx, W, H, cue, shakeAt, mk } = h;
    const TAU = Math.PI * 2;
    const clamp01 = t => t < 0 ? 0 : t > 1 ? 1 : t;
    const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
    const lerp = (a, b, k) => a + (b - a) * k;
    const easeIn = t => t * t, easeOut = t => 1 - (1 - t) * (1 - t);
    const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const easeOutBack = t => { const c = 1.7; t = clamp01(t) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };
    const easeOutElastic = t => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * TAU / 3) + 1);
    const rgb = hex => { const n = parseInt(String(hex || '#ffffff').slice(1), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const rgba = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };
    const S = 0.5;                                     // tỉ lệ canvas phụ chụp người
    const OC = mk(), GL = mk(), MC = mk(), SIL = mk(), OUTL = mk(), PHB = mk(), TEAR = mk(), FZ = mk();

    // ---------- tiện ích chung ----------
    // chụp người (đang sống) vào canvas phụ C quanh khung người, padX = nới ngang
    function shot(C, g, sc = S, filter, padX = 1) {
        const hw = Math.max(g.w * 0.8, g.ph * 0.36) * padX;
        return h.snapInto(C, { x0: g.cx - hw, x1: g.cx + hw, y0: g.head.y - g.ph * 0.1, y1: g.floorY + 6 }, sc, filter);
    }
    // vẽ ảnh chụp: (ax, ay) = điểm gốc (toạ độ màn lúc chụp) → đặt tại (x, y), co sx / sy, xoay r quanh gốc
    function put(c, sw, sh, b, ax, ay, x, y, sx = 1, sy = sx, r = 0) {
        ctx.save();
        ctx.translate(x, y); if (r) ctx.rotate(r); if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
        ctx.drawImage(c, 0, 0, sw, sh, b.x0 - ax, b.y0 - ay, b.x1 - b.x0, b.y1 - b.y0);
        ctx.restore();
    }
    // quầng sáng màu quanh dáng: mờ trên canvas 1/2 cỡ ảnh chụp (≈ 1/4 cỡ thật) rồi tô màu
    function glowOf(src, b, color, blur = 4, G = GL) {
        const gw = Math.max(4, Math.ceil(b.ow * 0.5)), gh = Math.max(4, Math.ceil(b.oh * 0.5));
        if (G.c.width !== gw || G.c.height !== gh) { G.c.width = gw; G.c.height = gh; } else G.x.clearRect(0, 0, gw, gh);
        const x = G.x;
        x.filter = `blur(${blur}px)`; x.drawImage(src.c, 0, 0, b.ow, b.oh, 0, 0, gw, gh); x.filter = 'none';
        x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, gw, gh); x.globalCompositeOperation = 'source-over';
        return G;
    }
    const DOTS = new Map();
    function dot(color) {
        let c = DOTS.get(color);
        if (c) return c;
        c = document.createElement('canvas'); c.width = c.height = 64;
        const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, rgba(color, 0.9)); gr.addColorStop(1, rgba(color, 0));
        x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
        DOTS.set(color, c);
        return c;
    }
    function rr(X, x, y, w, hh, r) {
        r = Math.min(r, w / 2, hh / 2);
        X.beginPath(); X.moveTo(x + r, y); X.arcTo(x + w, y, x + w, y + hh, r); X.arcTo(x + w, y + hh, x, y + hh, r);
        X.arcTo(x, y + hh, x, y, r); X.arcTo(x, y, x + w, y, r); X.closePath();
    }
    const AV = new Map();
    function avatar(url) {
        if (!url) return null;
        let im = AV.get(url);
        if (!im) { im = new Image(); im.referrerPolicy = 'no-referrer'; im.decoding = 'async'; im.src = url; AV.set(url, im); if (AV.size > 30) AV.delete(AV.keys().next().value); }
        return im.complete && im.naturalWidth ? im : null;
    }
    const setShake = (f, amp) => { f.sx = amp ? (Math.random() - 0.5) * amp : 0; f.sy = amp ? (Math.random() - 0.5) * amp : 0; };

    // =====================================================================================================================
    // 👻 HỒN LÌA KHỎI XÁC
    function ghostStart(f) { f.m = { wisps: [], acc: 0, fz: null }; }
    function ghostFrame(f, e, dt, g) {
        const P = f.p, m = f.m, col = f.sc.color || '#7fe8ff', ph = g.ph;
        cue(f, e, 'out', P.out, (X, v) => X.ghost(1.8, { vol: v }));
        cue(f, e, 'back', P.back, (X, v) => { X.ghost(1.2, { vol: v * 0.8, up: false }); X.whoosh(1.2, { vol: v * 0.4, f0: 1500, f1: 300 }); });
        cue(f, e, 'snap', P.snap, (X, v) => { X.pop(1.3, { vol: v }); X.ding({ vol: v * 0.6 }); });
        setShake(f, shakeAt(f, e, P.snap, 260, 12));
        const kOut = clamp01((e - P.out) / (P.outB - P.out)), kBack = clamp01((e - P.back) / (P.snap - P.back)), kRec = clamp01((e - P.snap) / Math.max(1, P.end - P.snap));
        const dead = e < P.snap ? easeInOut(kOut) : 1 - easeOut(kRec);
        // không khí ma: màn tối xanh + 4 góc tối
        if (dead > 0.01) {
            ctx.fillStyle = `rgba(8,18,42,${0.32 * dead})`; ctx.fillRect(0, 0, W, H);
            const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
            vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,6,22,${0.55 * dead})`);
            ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
        }
        const soulOn = e >= P.out && e < P.snap;
        let sx = g.cx, sy = g.floorY - ph * 0.5, ss = 1, sr = 0, st = 1, sa = 0, z = 1;     // sy = TÂM hồn
        if (soulOn) {
            const rise = easeOut(kOut), amp = clamp01((e - P.outB + 400) / 900), ang = Math.max(0, e - (P.outB - 400)) / 1000 * 1.35;
            z = lerp(1, Math.cos(ang), amp);
            ss = 0.8 * (1 - 0.2 * (1 - z) / 2);                            // hồn nhỏ hơn thân; ra sau lưng = nhỏ nữa (chiều sâu)
            // giữ hồn TRONG khung: người đứng sát cam (cao gần hết khung) thì bay vòng hẹp + nổi lên ít
            const halfW = g.w * 0.55 * ss, orbit = Math.max(0, Math.min(Math.max(g.w * 1.05, ph * 0.3), Math.min(g.cx, W - g.cx) - halfW - 8));
            sx = g.cx + Math.sin(ang) * orbit * amp;
            sy = g.floorY - ph * 0.5 - ph * 0.3 * rise + Math.sin(ang * 2) * ph * 0.05 * amp + Math.sin(e / 320) * ph * 0.012;
            sy = Math.max(sy, H * 0.02 + ph * 0.5 * ss * 1.1);
            sr = Math.cos(ang) * 0.2 * amp;                                // nghiêng theo hướng bay
            st = 1 + 0.18 * Math.sin(kOut * Math.PI);
            sa = 0.82 * Math.min(1, kOut * 1.8);
            if (e >= P.back) {
                const kb = easeIn(kBack);
                sx = lerp(sx, g.cx, kb); sy = lerp(sy, g.floorY - ph * 0.5, kb); ss = lerp(ss, 1, kb); sr *= 1 - kb; z = lerp(z, 1, kb);
                st = 1 + 0.55 * Math.sin(kBack * Math.PI);                   // bị hút: kéo dài như sợi
            }
        }
        let b = null;
        if (soulOn) {
            b = shot(OC, g, S, 'grayscale(1) brightness(1.45) contrast(0.9)');
            if (b) {
                const x = OC.x;
                x.globalCompositeOperation = 'source-atop'; x.fillStyle = rgba(col, 0.55); x.fillRect(0, 0, b.ow, b.oh);
                x.globalCompositeOperation = 'destination-in';               // chân tan thành khói
                const gr = x.createLinearGradient(0, 0, 0, b.oh);
                gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.9)'); gr.addColorStop(1, 'rgba(0,0,0,0.04)');
                x.fillStyle = gr; x.fillRect(0, 0, b.ow, b.oh);
                x.globalCompositeOperation = 'source-over';
                glowOf(OC, b, col, 6);
            }
        }
        const drawSoul = () => {
            if (!b || sa <= 0.01) return;
            const bw = b.x1 - b.x0, bh = b.y1 - b.y0, ox = b.x0 - g.cx, oy = b.y0 - (g.floorY - ph * 0.5);
            ctx.save();
            ctx.translate(sx + f.sx, sy + f.sy); ctx.rotate(sr); ctx.scale(ss, ss * st);
            ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = sa * 0.8;
            ctx.drawImage(GL.c, 0, 0, GL.c.width, GL.c.height, ox - bw * 0.05, oy - bh * 0.03, bw * 1.1, bh * 1.06);
            ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = sa * (0.5 + 0.3 * (z + 1) / 2);
            const N = 26, tt = e / 1000;
            for (let i = 0; i < N; i++) {                                  // gợn sóng ngang như khói
                const v = i / N, wob = Math.sin(v * 9 + tt * 5) * bw * 0.02 * (0.3 + v);
                ctx.drawImage(OC.c, 0, b.oh * v, b.ow, Math.min(b.oh / N + 1, b.oh - b.oh * v), ox + wob, oy + bh * v, bw, bh / N + 1);
            }
            ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = sa * 0.22;
            ctx.drawImage(OC.c, 0, 0, b.ow, b.oh, ox, oy, bw, bh);
            ctx.restore();
        };
        // thân ĐỨNG IM NHƯ CHẾT (user 2026-10-28): chụp nguyên cỡ một lần lúc hồn bắt đầu ra → vẽ ảnh tĩnh đó tới lúc nhập lại;
        // chỉ HỒN là người thật đang cử động (NPC diễn bằng hồn)
        if (e >= P.out && e < P.snap && !m.fz) { const fb = shot(FZ, g, 1); if (fb) m.fz = { b: fb, cx: g.cx, fy: g.floorY }; }
        if (e >= P.snap) m.fz = null;
        const drawBody = () => {
            const z0 = m.fz, ax = z0 ? z0.cx : g.cx, ay = z0 ? z0.fy : g.floorY;
            ctx.save();
            ctx.translate(ax + f.sx, ay + f.sy); ctx.rotate(0.07 * dead); ctx.scale(1 + 0.04 * dead, 1 - 0.1 * dead); ctx.translate(-ax, -ay);
            if (dead > 0.02) ctx.filter = `grayscale(${0.8 * dead}) brightness(${1 - 0.32 * dead})`;
            if (z0) ctx.drawImage(FZ.c, 0, 0, z0.b.ow, z0.b.oh, z0.b.x0, z0.b.y0, z0.b.x1 - z0.b.x0, z0.b.y1 - z0.b.y0);
            else h.drawPersonPlain();
            ctx.filter = 'none';
            ctx.restore();
        };
        const drawCord = () => {
            if (!b || sa < 0.05) return;
            const bx = m.fz ? m.fz.cx : g.cx, by = m.fz ? m.fz.fy : g.floorY;
            const x0 = bx + f.sx, y0 = by - ph * 0.6 * (1 - 0.1 * dead) + f.sy, x1 = sx + f.sx, y1 = sy + ph * 0.12 * ss + f.sy;
            const mx = (x0 + x1) / 2, my = Math.max(y0, y1) + ph * 0.08;
            ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
            for (const [lw, a] of [[ph * 0.03, 0.12], [ph * 0.014, 0.25], [ph * 0.005, 0.7]]) {
                ctx.strokeStyle = rgba(col, a * sa); ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
            }
            ctx.setLineDash([ph * 0.01, ph * 0.05]); ctx.lineDashOffset = -e * 0.25;            // năng lượng chạy dọc sợi hồn
            ctx.strokeStyle = `rgba(255,255,255,${0.8 * sa})`; ctx.lineWidth = ph * 0.006;
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
            ctx.restore();
        };
        if (soulOn && z < 0) drawSoul();                                   // hồn sau lưng: vẽ trước thân
        drawBody();
        drawCord();
        if (soulOn && z >= 0) drawSoul();
        // làn khói hồn bay lên
        if (soulOn && b) {
            m.acc += dt;
            while (m.acc > 0.04) {
                m.acc -= 0.04;
                if (m.wisps.length < 70) m.wisps.push({ x: sx + (Math.random() - 0.5) * g.w * 0.8 * ss, y: sy + (Math.random() - 0.3) * ph * 0.45 * ss,
                    vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 70, age: 0, life: 0.9 + Math.random() * 0.8, r: ph * (0.006 + Math.random() * 0.01) });
            }
        }
        if (m.wisps.length) {
            const d = dot(col);
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            for (let i = m.wisps.length - 1; i >= 0; i--) {
                const w = m.wisps[i]; w.age += dt;
                if (w.age >= w.life) { m.wisps.splice(i, 1); continue; }
                w.x += (w.vx + Math.sin(w.age * 5 + i) * 25) * dt; w.y += w.vy * dt;
                const k = w.age / w.life; ctx.globalAlpha = (1 - k) * 0.75 * Math.min(1, k * 6);
                const r = w.r * (1 + k);
                ctx.drawImage(d, w.x - r * 2, w.y - r * 2, r * 4, r * 4);
            }
            ctx.restore();
        }
        // nhập lại: vòng sáng + loé
        if (e >= P.snap && e < P.snap + 450) {
            const k = (e - P.snap) / 450, cx = g.cx, cy = g.floorY - ph * 0.55, R = ph * (0.15 + 0.6 * k);
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
            gr.addColorStop(0, `rgba(255,255,255,${0.75 * (1 - k)})`); gr.addColorStop(1, rgba(col, 0));
            ctx.fillStyle = gr; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
            ctx.strokeStyle = rgba(col, 0.9 * (1 - k)); ctx.lineWidth = ph * 0.02 * (1 - k) + 2;
            ctx.beginPath(); ctx.ellipse(cx, cy, R * 0.7, R, 0, 0, TAU); ctx.stroke();
            ctx.restore();
        }
    }

    // =====================================================================================================================
    // 🪞 PHÂN THÂN
    const CL_DELAY = 120;
    function cloneStart(f) { f.m = { ring: [], last: -1e9 }; }
    function cloneFrame(f, e, dt, g) {
        const P = f.p, m = f.m, n = P.n, col = f.sc.color || '#ff5ad1', ph = g.ph;
        cue(f, e, 'in', P.inA, (X, v) => X.shimmer(n, { vol: v, gap: 0.18 }));
        cue(f, e, 'merge', P.merge, (X, v) => X.whoosh((P.mergeB - P.merge) / 1000, { vol: v * 0.5, f0: 500, f1: 2200 }));
        cue(f, e, 'one', P.mergeB, (X, v) => { X.ding({ vol: v * 0.7 }); X.pop(0.8, { vol: v * 0.5 }); });
        f.sx = f.sy = 0;
        // ảnh chụp vòng (≥ 30 ms / ảnh) - bản sao thứ j xem ảnh trễ j × 0,12 s
        const cap = Math.ceil(n * CL_DELAY / 30) + 3;
        if (e - m.last >= 30 && e < P.mergeB) {
            m.last = e;
            const it = m.ring.length < cap ? { C: mk(), G: mk() } : m.ring.pop();
            const b = shot(it.C, g, 0.42);
            if (b) { glowOf(it.C, b, col, 3, it.G); Object.assign(it, { b, cx: g.cx, fy: g.floorY, t: e }); m.ring.unshift(it); }
            else if (it.b) m.ring.push(it);
        }
        const frameAt = d => { let best = null; for (const it of m.ring) { if (!it.b) continue; best = it; if (it.t <= e - d) break; } return best; };
        const kin = clamp01((e - P.inA) / 600), kout = 1 - clamp01((e - P.merge) / (P.mergeB - P.merge)), vis = Math.min(kin, kout);
        // đèn sân khấu (3 luồng sáng lia qua lại + vũng sáng sàn)
        if (vis > 0) {
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            const cols = [col, '#5ad1ff', '#ffd25a'];
            for (let i = 0; i < 3; i++) {
                const ox = W * (0.18 + 0.32 * i), tx = g.cx + Math.sin(e / 900 + i * 2.1) * Math.max(g.w * 1.6, ph * 0.5), ty = g.floorY, wb = ph * 0.32;
                const gr = ctx.createLinearGradient(ox, 0, tx, ty);
                gr.addColorStop(0, rgba(cols[i], 0.32 * vis)); gr.addColorStop(1, rgba(cols[i], 0.04 * vis));
                ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(ox - 14, -10); ctx.lineTo(ox + 14, -10); ctx.lineTo(tx + wb, ty); ctx.lineTo(tx - wb, ty); ctx.closePath(); ctx.fill();
                const pg = ctx.createRadialGradient(tx, ty, 0, tx, ty, wb * 1.1);
                pg.addColorStop(0, rgba(cols[i], 0.35 * vis)); pg.addColorStop(1, rgba(cols[i], 0));
                ctx.fillStyle = pg; ctx.save(); ctx.translate(tx, ty); ctx.scale(1, 0.2); ctx.translate(-tx, -ty); ctx.fillRect(tx - wb * 1.1, ty - wb * 1.1, wb * 2.2, wb * 2.2); ctx.restore();
            }
            ctx.restore();
        }
        const maxR = Math.ceil(n / 2), sp0 = Math.max(g.w, ph * 0.28) * 0.95, sp = Math.min(sp0, W * 0.46 / (0.8 + 0.55 * (maxR - 1)));
        const order = Array.from({ length: n }, (_, i) => i + 1).sort((a, b) => Math.ceil(b / 2) - Math.ceil(a / 2));   // xa vẽ trước
        const mDur = P.mergeB - P.merge, kM = easeInOut(clamp01((e - P.merge) / mDur));
        for (const j of order) {
            const r = Math.ceil(j / 2), side = j % 2 ? -1 : 1, tj = P.inA + (j - 1) * 180;
            if (e < tj || e >= P.mergeB) continue;
            const it = frameAt(j * CL_DELAY);
            if (!it) continue;
            const pos = easeOutBack(clamp01((e - tj) / 450)) * (1 - kM);
            const s = 1 - 0.1 * r * pos, dx = side * sp * (0.8 + 0.55 * (r - 1)) * pos, dy = -ph * 0.06 * r * pos;
            const a = clamp01((e - tj) / 160) * (1 - clamp01((e - P.merge - mDur * 0.55) / (mDur * 0.45)));
            const x = it.cx + dx, y = it.fy + dy, bw = it.b.x1 - it.b.x0;
            // bóng đổ trên sàn
            ctx.save(); ctx.globalAlpha = 0.35 * a;
            const sg = ctx.createRadialGradient(x, y, 0, x, y, bw * 0.4 * s);
            sg.addColorStop(0, 'rgba(0,0,0,0.8)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = sg; ctx.translate(x, y); ctx.scale(1, 0.12); ctx.translate(-x, -y); ctx.fillRect(x - bw * 0.4 * s, y - bw * 0.4 * s, bw * 0.8 * s, bw * 0.8 * s);
            ctx.restore();
            // viền sáng đổi sắc theo bản
            ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.85 * a; ctx.filter = `hue-rotate(${(j * 47) % 360}deg)`;
            put(it.G.c, it.G.c.width, it.G.c.height, it.b, it.cx, it.fy, x, y, s * 1.03);
            ctx.restore();
            ctx.save(); ctx.globalAlpha = a; ctx.filter = `brightness(${1 - 0.08 * r}) saturate(${1 + 0.12 * r})`;
            put(it.C.c, it.b.ow, it.b.oh, it.b, it.cx, it.fy, x, y, s);
            ctx.restore();
            // chớp lúc hiện
            if (e - tj < 260) {
                const k = (e - tj) / 260, R = ph * (0.12 + 0.3 * k), cy = y - ph * 0.5 * s;
                ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - k; ctx.drawImage(dot(col), x - R, cy - R, R * 2, R * 2); ctx.restore();
            }
        }
        h.drawPersonPlain();
        if (e >= P.mergeB && e < P.mergeB + 300) {
            const k = (e - P.mergeB) / 300, R = ph * (0.3 + 0.5 * k);
            ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.9 * (1 - k); ctx.drawImage(dot(col), g.cx - R, g.floorY - ph * 0.5 - R, R * 2, R * 2); ctx.restore();
        }
    }

    // =====================================================================================================================
    // 🫠 TAN CHẢY
    const MELT_N = 160;            // nhiều cột mảnh: mép chảy mịn, không thành bậc thang (vẫn chỉ là chép ảnh nhỏ)
    function meltStart(f) {
        const R = f.rand, a = R() * 6, b = R() * 6;
        // độ trễ chảy theo chiều ngang - đường cong MƯỢT (tần số thấp) để cột kề nhau gần như nhau, không ra bậc thang
        f.m = { d: Array.from({ length: MELT_N }, (_, i) => { const u = i / (MELT_N - 1); return 0.22 * (0.5 + 0.5 * Math.sin(u * 5.3 + a)) + 0.1 * (0.5 + 0.5 * Math.sin(u * 11.7 + b)); }),
            bub: [], acc: 0, drips: Array.from({ length: 6 }, () => [0.2 + R() * 0.6, R()]) };
    }
    // ☀ mặt trời vẽ SẴN một lần: đĩa plasma (hạt sáng tối + tối mép), vầng hào quang, tia sáng dài / ngắn
    let SUN = null, CORONA = null, RAYS = null, RAYS2 = null;
    function sunSprites() {
        if (SUN) return;
        const rnd = (() => { let q = 991; return () => { q = (q * 16807) % 2147483647; return q / 2147483647; }; })();
        SUN = document.createElement('canvas'); SUN.width = SUN.height = 512;
        let x = SUN.getContext('2d'), gr = x.createRadialGradient(256, 256, 0, 256, 256, 150);
        gr.addColorStop(0, '#fffef6'); gr.addColorStop(0.45, '#fff2b0'); gr.addColorStop(0.78, '#ffc14a'); gr.addColorStop(0.95, '#ff8a1c'); gr.addColorStop(1, '#ff6a00');
        x.fillStyle = gr; x.beginPath(); x.arc(256, 256, 150, 0, TAU); x.fill();
        x.save(); x.beginPath(); x.arc(256, 256, 150, 0, TAU); x.clip();
        for (let i = 0; i < 260; i++) {                                    // hạt plasma bề mặt
            const a = rnd() * TAU, r = Math.sqrt(rnd()) * 148, px = 256 + Math.cos(a) * r, py = 256 + Math.sin(a) * r, s = 6 + rnd() * 16, hot = rnd() < 0.5;
            const g2 = x.createRadialGradient(px, py, 0, px, py, s);
            g2.addColorStop(0, hot ? 'rgba(255,255,235,0.4)' : 'rgba(255,150,30,0.16)'); g2.addColorStop(1, 'rgba(255,200,80,0)');
            x.fillStyle = g2; x.fillRect(px - s, py - s, s * 2, s * 2);
        }
        gr = x.createRadialGradient(256, 256, 90, 256, 256, 152);           // tối mép (khối cầu)
        gr.addColorStop(0, 'rgba(200,70,0,0)'); gr.addColorStop(1, 'rgba(200,70,0,0.3)');
        x.fillStyle = gr; x.fillRect(0, 0, 512, 512);
        gr = x.createRadialGradient(205, 200, 0, 220, 215, 110);            // lõi loá lệch trên trái
        gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = gr; x.fillRect(0, 0, 512, 512);
        x.restore();
        CORONA = document.createElement('canvas'); CORONA.width = CORONA.height = 512;
        x = CORONA.getContext('2d');
        gr = x.createRadialGradient(256, 256, 60, 256, 256, 256);
        gr.addColorStop(0, 'rgba(255,230,150,0.9)'); gr.addColorStop(0.3, 'rgba(255,160,50,0.45)'); gr.addColorStop(0.62, 'rgba(255,110,20,0.14)'); gr.addColorStop(1, 'rgba(255,80,0,0)');
        x.fillStyle = gr; x.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 70; i++) {                                     // lưỡi lửa viền (vầng nhật hoa)
            const a = rnd() * TAU, r0 = 74, L = 18 + rnd() * 46, w = 0.03 + rnd() * 0.05;
            const g2 = x.createRadialGradient(256, 256, r0, 256, 256, r0 + L);
            g2.addColorStop(0, 'rgba(255,200,90,0.6)'); g2.addColorStop(1, 'rgba(255,120,30,0)');
            x.fillStyle = g2; x.beginPath(); x.moveTo(256 + Math.cos(a - w) * r0, 256 + Math.sin(a - w) * r0);
            x.quadraticCurveTo(256 + Math.cos(a + w * 0.3) * (r0 + L * 0.7), 256 + Math.sin(a + w * 0.3) * (r0 + L * 0.7), 256 + Math.cos(a) * (r0 + L), 256 + Math.sin(a) * (r0 + L));
            x.lineTo(256 + Math.cos(a + w) * r0, 256 + Math.sin(a + w) * r0); x.closePath(); x.fill();
        }
        const mkRays = (n, Lmin, Lmax, wmin, wmax, a0, a1) => {
            const c = document.createElement('canvas'); c.width = c.height = 1024; const y = c.getContext('2d');
            for (let i = 0; i < n; i++) {
                const a = i / n * TAU + rnd() * 0.15, w = wmin + rnd() * (wmax - wmin), L = Lmin + rnd() * (Lmax - Lmin);
                const g2 = y.createRadialGradient(512, 512, 40, 512, 512, L);
                g2.addColorStop(0, `rgba(255,236,170,${a0})`); g2.addColorStop(1, `rgba(255,170,70,${a1})`);
                y.fillStyle = g2; y.beginPath(); y.moveTo(512, 512); y.lineTo(512 + Math.cos(a - w) * L, 512 + Math.sin(a - w) * L); y.lineTo(512 + Math.cos(a + w) * L, 512 + Math.sin(a + w) * L); y.closePath(); y.fill();
            }
            return c;
        };
        RAYS = mkRays(14, 330, 510, 0.035, 0.07, 0.42, 0);
        RAYS2 = mkRays(36, 160, 360, 0.006, 0.016, 0.6, 0);
    }
    // 🌡 đồng hồ đo nhiệt cao cấp: mặt số vẽ SẴN theo cỡ (viền kim loại xoay màu, kính đen, vạch chia 0-1000), mỗi khung chỉ vẽ cung màu + kim + số
    let GF = null, GF_R = 0;
    const G_A0 = Math.PI * 0.75, G_A1 = Math.PI * 2.25;
    function gaugeFace(R) {
        R = Math.round(R);
        if (GF && GF_R === R) return GF;
        const sz = Math.ceil(R * 2.6), c = document.createElement('canvas'); c.width = c.height = sz;
        const x = c.getContext('2d'), o = sz / 2;
        x.filter = `blur(${Math.max(3, R * 0.06)}px)`; x.fillStyle = 'rgba(0,0,0,0.55)'; x.beginPath(); x.arc(o + R * 0.04, o + R * 0.1, R * 1.08, 0, TAU); x.fill(); x.filter = 'none';
        let gr;
        if (x.createConicGradient) {
            gr = x.createConicGradient(0, o, o);
            [[0, '#f7f8fa'], [0.12, '#8b919a'], [0.26, '#eef0f3'], [0.4, '#5b616a'], [0.55, '#e4e7eb'], [0.7, '#787e87'], [0.86, '#f3f4f6'], [1, '#f7f8fa']].forEach(([k, cc]) => gr.addColorStop(k, cc));
        } else { gr = x.createLinearGradient(o - R, o - R, o + R, o + R); gr.addColorStop(0, '#f2f3f5'); gr.addColorStop(0.5, '#6b717a'); gr.addColorStop(1, '#e9ebee'); }
        x.fillStyle = gr; x.beginPath(); x.arc(o, o, R * 1.08, 0, TAU); x.fill();
        x.fillStyle = '#0a0c11'; x.beginPath(); x.arc(o, o, R * 0.985, 0, TAU); x.fill();
        gr = x.createRadialGradient(o, o - R * 0.3, R * 0.1, o, o, R * 0.96);
        gr.addColorStop(0, '#232a3a'); gr.addColorStop(1, '#06080c');
        x.fillStyle = gr; x.beginPath(); x.arc(o, o, R * 0.95, 0, TAU); x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.08)'; x.lineWidth = R * 0.09; x.beginPath(); x.arc(o, o, R * 0.78, G_A0, G_A1); x.stroke();      // rãnh cung
        for (let i = 0; i <= 50; i++) {
            const a = G_A0 + (G_A1 - G_A0) * i / 50, major = i % 5 === 0, r0 = R * (major ? 0.6 : 0.64), r1 = R * 0.68;
            x.strokeStyle = major ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)'; x.lineWidth = major ? R * 0.022 : R * 0.01;
            x.beginPath(); x.moveTo(o + Math.cos(a) * r0, o + Math.sin(a) * r0); x.lineTo(o + Math.cos(a) * r1, o + Math.sin(a) * r1); x.stroke();
            if (major && i % 10 === 0) {
                x.fillStyle = 'rgba(255,255,255,0.75)'; x.font = `600 ${R * 0.085}px "Segoe UI", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
                x.fillText(String(i * 20), o + Math.cos(a) * R * 0.5, o + Math.sin(a) * R * 0.5);
            }
        }
        x.fillStyle = 'rgba(255,255,255,0.45)'; x.font = `700 ${R * 0.085}px "Segoe UI", sans-serif`; x.textAlign = 'center'; x.fillText('NHIỆT ĐỘ  °C', o, o + R * 0.66);
        GF = c; GF_R = R;
        return c;
    }
    const heatCol = v => v < 0.35 ? '#ffd23a' : v < 0.6 ? '#ff8a1c' : v < 0.85 ? '#ff3b1f' : '#fff2e0';
    function drawGauge(x, y, R, v, a, e) {
        const face = gaugeFace(R), sz = face.width, hot = clamp01((v - 0.8) / 0.2);
        const jx = hot ? (Math.random() - 0.5) * R * 0.04 * hot : 0, jy = hot ? (Math.random() - 0.5) * R * 0.04 * hot : 0;
        ctx.save(); ctx.globalAlpha = a; ctx.translate(x + jx, y + jy);
        if (hot > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * hot * (0.55 + 0.25 * Math.sin(e / 90)); const r2 = R * 1.7; ctx.drawImage(dot('#ff3b1f'), -r2, -r2, r2 * 2, r2 * 2); ctx.restore(); }
        ctx.drawImage(face, -sz / 2, -sz / 2);
        // cung màu theo nhiệt (vàng → cam → đỏ → trắng nóng) + quầng
        const aV = G_A0 + (G_A1 - G_A0) * v, N = Math.max(1, Math.ceil(v * 40));
        ctx.lineCap = 'round';
        for (let pass = 0; pass < 2; pass++) {
            if (pass === 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * 0.35; ctx.lineWidth = R * 0.2; }
            else { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a; ctx.lineWidth = R * 0.085; }
            for (let i = 0; i < N; i++) {
                const t0 = i / N * v, t1 = (i + 1) / N * v;
                ctx.strokeStyle = heatCol(t1); ctx.beginPath(); ctx.arc(0, 0, R * 0.78, G_A0 + (G_A1 - G_A0) * t0, G_A0 + (G_A1 - G_A0) * t1 + 0.004); ctx.stroke();
            }
        }
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
        // số lớn
        const deg = Math.round(25 + 975 * Math.pow(v, 2.2)), fs = R * (deg >= 1000 ? 0.26 : 0.31), col = heatCol(v);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * 0.5; ctx.drawImage(dot(col === '#fff2e0' ? '#ff6a2a' : col), -R * 0.55, R * 0.02 - R * 0.3, R * 1.1, R * 0.6); ctx.restore();
        ctx.font = `800 ${fs}px "Segoe UI", "Arial", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tg = ctx.createLinearGradient(0, R * 0.02 - fs / 2, 0, R * 0.02 + fs / 2); tg.addColorStop(0, '#ffffff'); tg.addColorStop(1, col);
        ctx.fillStyle = tg; ctx.fillText(String(deg), 0, R * 0.04);
        // kim (thuôn, đỏ - trắng) + chụp kim kim loại
        ctx.save(); ctx.rotate(aV);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * 0.6; ctx.drawImage(dot('#ff5a3a'), R * 0.62, -R * 0.1, R * 0.2, R * 0.2); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
        const ng = ctx.createLinearGradient(0, -R * 0.03, 0, R * 0.03); ng.addColorStop(0, '#ff8a7a'); ng.addColorStop(0.5, '#ffffff'); ng.addColorStop(1, '#d01010');
        ctx.fillStyle = ng; ctx.beginPath(); ctx.moveTo(-R * 0.14, -R * 0.03); ctx.lineTo(R * 0.74, -R * 0.007); ctx.lineTo(R * 0.74, R * 0.007); ctx.lineTo(-R * 0.14, R * 0.03); ctx.closePath(); ctx.fill();
        ctx.restore();
        const cg = ctx.createRadialGradient(-R * 0.03, -R * 0.03, 0, 0, 0, R * 0.09); cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.5, '#9aa0a8'); cg.addColorStop(1, '#3a3f47');
        ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, R * 0.08, 0, TAU); ctx.fill();
        // kính: vệt loá trên trái
        const gg = ctx.createLinearGradient(-R, -R, R * 0.2, R * 0.2); gg.addColorStop(0, 'rgba(255,255,255,0.22)'); gg.addColorStop(0.5, 'rgba(255,255,255,0.04)'); gg.addColorStop(0.51, 'rgba(255,255,255,0)');
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, R * 0.95, 0, TAU); ctx.fill();
        ctx.restore();
    }
    function meltHeat(f, e, g, dt) {
        const P = f.p, m = f.m, ph = g.ph;
        sunSprites();
        // nóng: lên trong 0 → heatB, giữ tới cool, dịu đi tới rise
        const heat = e < P.cool ? clamp01(e / P.heatB) : 1 - clamp01((e - P.cool) / (P.rise - P.cool));
        if (heat <= 0) return 0;
        if (!m.side) m.side = g.cx < W / 2 ? 1 : -1;                         // chốt bên một lần / lượt (NPC đi qua giữa khung không làm nhảy)
        const side = m.side, R = Math.min(W, H) * 0.2;
        // mặt trời hạ xuống từ trên (vào) / bay lên (đi)
        const k = e < P.cool ? easeOutBack(clamp01(e / P.heatB)) : 1 - easeIn(clamp01((e - P.cool) / (P.rise - P.cool)));
        const sx = W * (side > 0 ? 0.78 : 0.22), sy = lerp(-R * 2.2, H * 0.11, k);
        // trời nóng: ám cam + loé từ phía mặt trời
        ctx.save();
        ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgba(255,${Math.round(225 - 40 * heat)},${Math.round(190 - 90 * heat)},1)`; ctx.globalAlpha = 0.55 * heat; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = heat;
        const gl = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, H) * 0.9);
        gl.addColorStop(0, 'rgba(255,170,60,0.35)'); gl.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
        ctx.translate(sx, sy);
        const pr = 1 + 0.04 * Math.sin(e / 140);
        ctx.save(); ctx.rotate(e / 5000); ctx.drawImage(RAYS, -R * 2.8 * pr, -R * 2.8 * pr, R * 5.6 * pr, R * 5.6 * pr); ctx.restore();       // tia dài xoay chậm
        ctx.save(); ctx.rotate(-e / 3200); ctx.globalAlpha = heat * 0.8; ctx.drawImage(RAYS2, -R * 2.2, -R * 2.2, R * 4.4, R * 4.4); ctx.restore();   // tia mảnh xoay ngược
        ctx.globalAlpha = heat;
        const cp = 1 + 0.03 * Math.sin(e / 90);
        ctx.drawImage(CORONA, -R * 1.9 * cp, -R * 1.9 * cp, R * 3.8 * cp, R * 3.8 * cp);                               // vầng nhật hoa phập phồng
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(SUN, -R * 1.28, -R * 1.28, R * 2.56, R * 2.56);                                                   // đĩa plasma (r ≈ 0,75 R)
        ctx.globalCompositeOperation = 'lighter';
        const st = ctx.createLinearGradient(-W * 0.7, 0, W * 0.7, 0);                                                   // vệt loá ngang kiểu ống kính điện ảnh
        st.addColorStop(0, 'rgba(255,170,80,0)'); st.addColorStop(0.5, `rgba(255,236,190,${0.55 * heat})`); st.addColorStop(1, 'rgba(255,170,80,0)');
        ctx.fillStyle = st; ctx.fillRect(-W * 0.7, -R * 0.035, W * 1.4, R * 0.07);
        ctx.restore();
        // loá ống kính: vòng lục giác + đốm màu dọc đường mặt trời → tâm khung
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const [t, r, c, hex] of [[0.3, 0.035, '#ffd27a', 0], [0.48, 0.06, '#ff9a4a', 1], [0.62, 0.025, '#fff0c0', 0], [0.8, 0.09, '#ffb46a', 1], [1.05, 0.05, '#ff7a3a', 1]]) {
            const x = lerp(sx, W - sx, t), y = lerp(sy, H - sy, t), r2 = Math.min(W, H) * r;
            ctx.globalAlpha = 0.28 * heat;
            if (hex) { ctx.fillStyle = rgba(c, 0.5); ctx.strokeStyle = rgba(c, 0.8); ctx.lineWidth = 1.5; ctx.beginPath(); for (let i = 0; i < 6; i++) { const an = i / 6 * TAU + 0.3; i ? ctx.lineTo(x + Math.cos(an) * r2, y + Math.sin(an) * r2) : ctx.moveTo(x + Math.cos(an) * r2, y + Math.sin(an) * r2); } ctx.closePath(); ctx.fill(); ctx.stroke(); }
            else ctx.drawImage(dot(c), x - r2, y - r2, r2 * 2, r2 * 2);
        }
        ctx.restore();
        // sóng nhiệt bốc lên quanh người
        ctx.save(); ctx.strokeStyle = `rgba(255,255,255,${0.16 * heat})`; ctx.lineWidth = Math.max(2, ph * 0.004);
        for (let i = 0; i < 7; i++) {
            const x0 = g.cx + (i - 3) * g.w * 0.32, ph0 = (e / 600 + i * 0.37) % 1, y0 = g.floorY - ph * ph0;
            ctx.beginPath();
            for (let j = 0; j <= 12; j++) { const yy = y0 - j * ph * 0.025, xx = x0 + Math.sin(j * 0.9 + e / 160 + i) * g.w * 0.05; j ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
            ctx.stroke();
        }
        ctx.restore();
        // đồng hồ nhiệt cạnh người (phía đối diện mặt trời): vọt tới 1000°C trước khi chảy, dịu về khi mặt trời đi
        const tv = e < P.cool ? easeInOut(clamp01(e / (P.meltA + 600))) : 1 - easeInOut(clamp01((e - P.cool) / (P.rise - P.cool)));
        const gR = clamp(Math.min(W, H) * 0.13, 60, ph * 0.16);
        const tx = clamp(g.cx - side * Math.max(g.w * 0.75 + gR, ph * 0.26), gR * 1.25, W - gR * 1.25), ty = clamp(g.floorY - ph * 0.62, gR * 1.3, H - gR * 1.3);
        drawGauge(tx, ty, gR, tv, clamp01(heat * 2), e);
        // mồ hôi chảy trên đầu / mặt (trước khi chảy)
        if (e < P.meltA + 500) {
            const a = clamp01((e - 300) / 400) * (1 - clamp01((e - P.meltA) / 500));
            ctx.save(); ctx.globalAlpha = a;
            for (let i = 0; i < 5; i++) {
                const u = ((e / 1100) + i * 0.29) % 1, x = g.head.x + (i - 2) * g.w * 0.13, y = g.head.y + ph * (0.04 + 0.14 * u), r = ph * 0.011;
                const gr = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, 0, x, y, r * 1.4);
                gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.45, 'rgba(160,215,255,0.55)'); gr.addColorStop(1, 'rgba(120,190,255,0)');
                ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x, y - r * 1.9); ctx.quadraticCurveTo(x + r * 1.1, y, x, y + r); ctx.quadraticCurveTo(x - r * 1.1, y, x, y - r * 1.9); ctx.fill();
            }
            ctx.restore();
        }
        return heat;
    }
    function meltFrame(f, e, dt, g) {
        const P = f.p, m = f.m, ph = g.ph;
        cue(f, e, 'sun', 0, (X, v) => { X.whoosh(1.1, { vol: v * 0.5, f0: 200, f1: 900 }); X.sizzle(1.2, { vol: v * 0.35 }); });
        cue(f, e, 'hot', P.heatB, (X, v) => X.sizzle(0.8, { vol: v * 0.4 }));
        cue(f, e, 'cool', P.cool, (X, v) => X.wind(0.9, { vol: v * 0.5 }));
        cue(f, e, 'melt', P.meltA, (X, v) => X.gloop((P.meltB - P.meltA) / 1000, { vol: v }));
        cue(f, e, 'pool', P.meltB, (X, v) => X.gloop(Math.max(0.5, (P.rise - P.meltB) / 1000), { vol: v * 0.8 }));
        cue(f, e, 'rise', P.rise, (X, v) => X.swirl((P.riseB - P.rise) / 1000, { vol: v * 0.6 }));
        cue(f, e, 'up', P.riseB - 300, (X, v) => X.boing({ vol: v }));
        f.sx = f.sy = 0;
        let k;
        if (e < P.meltA) k = 0;
        else if (e < P.meltB) k = clamp01((e - P.meltA) / (P.meltB - P.meltA));
        else if (e < P.rise) k = 1;
        else if (e < P.riseB) k = Math.max(-0.1, 1 - easeOutBack(clamp01((e - P.rise) / (P.riseB - P.rise))));     // lố lên cao rồi về (thạch)
        else k = -0.035 * Math.sin((e - P.riseB) / 55) * Math.exp(-(e - P.riseB) / 220);
        meltHeat(f, e, g, dt);
        if (Math.abs(k) < 0.003) { h.drawPersonPlain(); return; }
        const b = shot(OC, g, S);
        if (!b) return;
        const bw = b.x1 - b.x0, top0 = b.y0, half0 = bw / 2;
        // đáy khối chảy: sàn thật, nhưng người đứng sát mép dưới (cam nửa người) thì nâng lên cho vũng còn thấy
        const moundH = ph * 0.17, fy = Math.min(g.floorY, H - ph * 0.035), Hh = fy - top0;
        const spread = 1 + 1.5 * easeIn(clamp01(k)), half = half0 * spread;
        const kp = clamp01((k - 0.25) / 0.75);
        // --- vũng mỏng bóng dưới khối + bóng đổ ---
        const prx = half * (0.75 + 0.45 * kp), pry = ph * 0.035 * (0.4 + kp), pcy = fy - pry * 0.3;
        if (kp > 0) {
            ctx.save();
            const sg = ctx.createRadialGradient(g.cx, fy, 0, g.cx, fy, prx * 1.15);
            sg.addColorStop(0, `rgba(0,0,0,${0.4 * kp})`); sg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = sg; ctx.translate(g.cx, fy); ctx.scale(1, (pry * 1.8) / (prx * 1.15)); ctx.translate(-g.cx, -fy);
            ctx.fillRect(g.cx - prx * 1.15, fy - prx * 1.15, prx * 2.3, prx * 2.3);
            ctx.restore();
            ctx.save();
            ctx.beginPath(); ctx.ellipse(g.cx, pcy, prx, pry, 0, 0, TAU); ctx.clip();
            ctx.drawImage(OC.c, 0, b.oh * 0.45, b.ow, b.oh * 0.55, g.cx - prx, pcy - pry, prx * 2, pry * 2);
            let gr = ctx.createLinearGradient(0, pcy - pry, 0, pcy + pry);
            gr.addColorStop(0, `rgba(255,255,255,${0.35 * kp})`); gr.addColorStop(0.45, 'rgba(255,255,255,0)'); gr.addColorStop(1, `rgba(0,0,0,${0.35 * kp})`);
            ctx.fillStyle = gr; ctx.fillRect(g.cx - prx, pcy - pry, prx * 2, pry * 2);
            ctx.restore();
        }
        // --- khối chảy: 160 cột, đỉnh mỗi cột rơi dần về hình VÒM thạch, ngang nới đều quanh tâm → canvas phụ rồi phủ bóng 2.5D ---
        const mx0 = g.cx - half - 4, my0 = Math.min(top0, top0 + Hh * Math.min(0, k)) - 4;
        const mw = (half + 4) * 2, mh = fy + 10 - my0, cw0 = Math.ceil(mw * S), ch0 = Math.ceil(mh * S);
        if (MC.c.width !== cw0 || MC.c.height !== ch0) { MC.c.width = cw0; MC.c.height = ch0; } else MC.x.clearRect(0, 0, cw0, ch0);
        const X = MC.x, colW = bw / MELT_N * spread;
        for (let i = 0; i < MELT_N; i++) {
            const u = (i + 0.5) / MELT_N;
            const dome = moundH * Math.sqrt(Math.max(0, 1 - Math.pow(2 * u - 1, 2)));            // vòm: giữa cao, 2 mép thấp
            let top;
            if (k <= 0) top = top0 + Hh * k;
            else { const mi = easeInOut(clamp01((k - m.d[i]) / (1 - 0.32))); top = lerp(top0, fy - dome * (0.35 + 0.65 * kp), mi); }
            const xL = g.cx + (b.x0 + bw * i / MELT_N - g.cx) * spread;
            X.drawImage(OC.c, b.ow * i / MELT_N, 0, b.ow / MELT_N, b.oh, (xL - mx0) * S, (top - my0) * S, (colW + 0.8) * S, (fy + 4 - top) * S);
        }
        if (k > 0) {
            X.globalCompositeOperation = 'source-atop';
            const kk = clamp01(k * 1.4);
            let gr = X.createLinearGradient(0, 0, cw0, 0);                 // khối nhớt: tối 2 mép, sáng lệch trái
            gr.addColorStop(0, `rgba(10,0,0,${0.35 * kk})`); gr.addColorStop(0.3, 'rgba(255,255,255,0)'); gr.addColorStop(0.38, `rgba(255,255,255,${0.26 * kk})`);
            gr.addColorStop(0.48, 'rgba(255,255,255,0)'); gr.addColorStop(1, `rgba(10,0,0,${0.38 * kk})`);
            X.fillStyle = gr; X.fillRect(0, 0, cw0, ch0);
            const ty = (fy - moundH * 0.85 - my0) * S;                     // điểm loá trên đỉnh vòm
            gr = X.createRadialGradient(cw0 * 0.4, ty, 0, cw0 * 0.4, ty, cw0 * 0.25);
            gr.addColorStop(0, `rgba(255,255,255,${0.55 * kp})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
            X.fillStyle = gr; X.fillRect(0, 0, cw0, ch0);
            gr = X.createLinearGradient(0, (fy - moundH * 0.4 - my0) * S, 0, ch0);             // chân khối tối dần (đổ bóng trong)
            gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${0.3 * kp})`);
            X.fillStyle = gr; X.fillRect(0, 0, cw0, ch0);
            X.fillStyle = `rgba(255,255,255,${0.7 * kp})`;
            X.beginPath(); X.ellipse(cw0 * 0.38, ty + ch0 * 0.006, cw0 * 0.05, Math.max(2, moundH * S * 0.07), -0.25, 0, TAU); X.fill();
            X.globalCompositeOperation = 'source-over';
        }
        ctx.drawImage(MC.c, 0, 0, cw0, ch0, mx0, my0, mw, mh);
        // giọt nhỏ chảy dọc thân lúc đang tan
        if (k > 0.05 && k < 0.9) {
            ctx.save();
            for (const [du, ds] of m.drips) {
                const i = Math.min(MELT_N - 1, Math.floor(du * MELT_N)), mi = easeInOut(clamp01((k - m.d[i]) / 0.68));
                const xL = g.cx + (b.x0 + bw * du - g.cx) * spread, ytop = lerp(top0, fy - moundH, mi);
                const yy = ytop + (fy - ytop) * ((e / 900 + ds) % 1), r = ph * 0.009;
                const gr = ctx.createRadialGradient(xL - r * 0.3, yy - r * 0.3, 0, xL, yy, r * 1.3);
                gr.addColorStop(0, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.5, 'rgba(255,220,210,0.35)'); gr.addColorStop(1, 'rgba(255,220,210,0)');
                ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(xL, yy, r, r * 1.5, 0, 0, TAU); ctx.fill();
            }
            ctx.restore();
        }
        // --- bọt sủi trên khối ---
        if (kp > 0.6 && e < P.rise + 200) {
            m.acc += dt;
            while (m.acc > 0.11) {
                m.acc -= 0.11;
                if (m.bub.length < 18) { const u = Math.random() - 0.5; m.bub.push({ x: g.cx + u * half * 1.4, y: fy - moundH * Math.sqrt(Math.max(0, 1 - 4 * u * u * 0.49)) * 0.95, age: 0, life: 0.5 + Math.random() * 0.6, r: ph * (0.008 + Math.random() * 0.014) }); }
            }
        }
        if (m.bub.length) {
            ctx.save();
            for (let i = m.bub.length - 1; i >= 0; i--) {
                const q = m.bub[i]; q.age += dt;
                if (q.age > q.life + 0.14) { m.bub.splice(i, 1); continue; }
                if (q.age <= q.life) {
                    const r = q.r * easeOut(clamp01(q.age / q.life * 1.2)), cy = q.y - r * 0.6;
                    const gr = ctx.createRadialGradient(q.x - r * 0.35, cy - r * 0.4, r * 0.05, q.x, cy, r);
                    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.22)'); gr.addColorStop(0.8, 'rgba(255,255,255,0.08)'); gr.addColorStop(1, 'rgba(255,255,255,0.45)');
                    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(q.x, cy, r, 0, TAU); ctx.fill();
                } else {                                                    // vỡ: vòng loang
                    const k2 = (q.age - q.life) / 0.14;
                    ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - k2)})`; ctx.lineWidth = 1.5;
                    ctx.beginPath(); ctx.ellipse(q.x, q.y, q.r * (1 + k2 * 1.5), q.r * 0.4 * (1 + k2), 0, 0, TAU); ctx.stroke();
                }
            }
            ctx.restore();
        }
    }

    // =====================================================================================================================
    // 🎈 THỔI PHỒNG
    function balloonStart(f) { f.m = { shreds: null, trail: [], popX: 0, popY: 0, prev: null }; }
    function drawPump(px, fy, hP, stroke, a, hoseTo) {
        const wP = hP * 0.2;
        ctx.save(); ctx.globalAlpha = a;
        // ống dẫn hơi
        ctx.strokeStyle = '#151515'; ctx.lineWidth = Math.max(3, wP * 0.16); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(px, fy - hP * 0.06); ctx.bezierCurveTo(px - (px - hoseTo[0]) * 0.3, fy + hP * 0.05, hoseTo[0] + (px - hoseTo[0]) * 0.3, fy + hP * 0.04, hoseTo[0], hoseTo[1]); ctx.stroke();
        // đế
        let gr = ctx.createLinearGradient(px - wP * 1.4, 0, px + wP * 1.4, 0);
        gr.addColorStop(0, '#1b1b1b'); gr.addColorStop(0.45, '#5a5a5a'); gr.addColorStop(1, '#141414');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(px, fy - wP * 0.08, wP * 1.4, wP * 0.3, 0, 0, TAU); ctx.fill();
        // cần + tay cầm (nhấn xuống theo nhịp bơm)
        const rodTop = fy - hP - hP * 0.42 * (1 - stroke);
        gr = ctx.createLinearGradient(px - wP * 0.08, 0, px + wP * 0.08, 0); gr.addColorStop(0, '#8b8f96'); gr.addColorStop(0.5, '#f2f4f7'); gr.addColorStop(1, '#6d7178');
        ctx.fillStyle = gr; ctx.fillRect(px - wP * 0.08, rodTop, wP * 0.16, fy - hP - rodTop + 2);
        gr = ctx.createLinearGradient(0, rodTop - wP * 0.22, 0, rodTop + wP * 0.22); gr.addColorStop(0, '#3a3a3a'); gr.addColorStop(0.5, '#0c0c0c'); gr.addColorStop(1, '#262626');
        ctx.fillStyle = gr; rr(ctx, px - wP * 1.15, rodTop - wP * 0.2, wP * 2.3, wP * 0.4, wP * 0.2); ctx.fill();
        // thân trụ kim loại đỏ (khối: sáng giữa, tối 2 mép) + nắp
        gr = ctx.createLinearGradient(px - wP / 2, 0, px + wP / 2, 0);
        gr.addColorStop(0, '#5c0710'); gr.addColorStop(0.3, '#d62a3c'); gr.addColorStop(0.45, '#ffa0aa'); gr.addColorStop(0.6, '#c51f31'); gr.addColorStop(1, '#4a050c');
        ctx.fillStyle = gr; ctx.fillRect(px - wP / 2, fy - hP, wP, hP * 0.93);
        ctx.fillStyle = '#e04050'; ctx.beginPath(); ctx.ellipse(px, fy - hP, wP / 2, wP * 0.13, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.ellipse(px, fy - hP, wP * 0.14, wP * 0.05, 0, 0, TAU); ctx.fill();
        // đồng hồ áp suất
        const gx = px + wP * 0.5, gy = fy - hP * 0.35, gR = wP * 0.38;
        ctx.fillStyle = '#d9dde3'; ctx.beginPath(); ctx.arc(gx, gy, gR, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(gx, gy, gR * 0.8, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#d0021b'; ctx.lineWidth = Math.max(1.5, gR * 0.12);
        const an = Math.PI * 0.8 + stroke * 0.3;
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(an) * gR * 0.7, gy + Math.sin(an) * gR * 0.7); ctx.stroke();
        ctx.restore();
    }
    // người phồng: vẽ từng hàng nới ngang theo hình cầu vào MC, phủ màu cao su + bóng khối cầu + điểm loá; trả cỡ vẽ
    function inflated(b, A, col) {
        const rows = 44, BW = Math.ceil(b.ow * (1 + A)), BH = Math.ceil(b.oh * (1 + 0.1 * A));
        if (MC.c.width !== BW || MC.c.height !== BH) { MC.c.width = BW; MC.c.height = BH; } else MC.x.clearRect(0, 0, BW, BH);
        const X = MC.x, sh = b.oh / rows, dh = BH / rows;
        for (let i = 0; i < rows; i++) {
            const v = (i + 0.5) / rows, pv = Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, v / 0.92))), 0.7), dw = b.ow * (1 + A * pv);
            X.drawImage(OC.c, 0, i * sh, b.ow, Math.min(sh + 0.5, b.oh - i * sh), (BW - dw) / 2, i * dh, dw, dh + 0.6);
        }
        const ak = clamp01(A / 1.5);
        if (ak > 0.03) {
            X.globalCompositeOperation = 'source-atop';
            X.fillStyle = rgba(col, 0.22 * ak); X.fillRect(0, 0, BW, BH);
            let gr = X.createRadialGradient(BW * 0.5, BH * 0.46, Math.min(BW, BH) * 0.18, BW * 0.5, BH * 0.46, Math.max(BW, BH) * 0.6);
            gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(30,0,12,${0.5 * ak})`);
            X.fillStyle = gr; X.fillRect(0, 0, BW, BH);
            gr = X.createRadialGradient(BW * 0.36, BH * 0.3, 0, BW * 0.36, BH * 0.3, Math.min(BW, BH) * 0.42);
            gr.addColorStop(0, `rgba(255,255,255,${0.45 * ak})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
            X.fillStyle = gr; X.fillRect(0, 0, BW, BH);
            X.fillStyle = `rgba(255,255,255,${0.8 * ak})`;
            X.beginPath(); X.ellipse(BW * 0.33, BH * 0.24, BW * 0.05, BH * 0.028, -0.6, 0, TAU); X.fill();
            X.beginPath(); X.arc(BW * 0.4, BH * 0.205, Math.min(BW, BH) * 0.012, 0, TAU); X.fill();
            X.globalCompositeOperation = 'source-over';
        }
        return { w: (b.x1 - b.x0) * BW / b.ow, h: (b.y1 - b.y0) * BH / b.oh, BW, BH };
    }
    function balloonFrame(f, e, dt, g) {
        const P = f.p, m = f.m, ph = g.ph, col = f.sc.color || '#ff3d6e';
        cue(f, e, 'pump', P.inflA, (X, v) => X.inflate(4, { vol: v, dur: (P.inflB - P.inflA) / 1000 }));
        cue(f, e, 'float', P.inflB, (X, v) => X.whoosh(1.4, { vol: v * 0.3, f0: 300, f1: 900 }));
        cue(f, e, 'pop', P.pop, (X, v) => { X.pop(2.4, { vol: v }); X.thud(0.5, { vol: v * 0.6 }); });
        cue(f, e, 'defl', P.pop + 60, (X, v) => X.deflate((P.deflB - P.pop - 60) / 1000, { vol: v }));
        cue(f, e, 'flat', P.deflB, (X, v) => X.splat(1, { vol: v }));
        cue(f, e, 'rein', P.flatB, (X, v) => X.inflate(2, { vol: v * 0.8, dur: 0.7 }));
        cue(f, e, 'back', P.reinB - 250, (X, v) => X.boing({ vol: v }));
        setShake(f, Math.max(shakeAt(f, e, P.pop, 320, 24), shakeAt(f, e, P.deflB, 200, 10)));
        const b = shot(OC, g, S);
        if (!b) return;
        const lift0 = Math.min(ph * 0.42, Math.max(0, g.head.y - H * 0.04) * 0.9);
        if (e < P.pop) {
            const pd = (P.inflB - P.inflA) / 4;
            let A = 0, stroke = 0;
            for (let i = 0; i < 4; i++) {
                A += 0.38 * easeOutBack(clamp01((e - P.inflA - i * pd) / (pd * 0.55)));
                const t = (e - P.inflA - i * pd) / pd;
                if (t >= 0 && t < 1) stroke = t < 0.35 ? easeIn(t / 0.35) : 1 - easeOut((t - 0.35) / 0.65);
            }
            const tf = clamp01((e - P.inflB) / (P.pop - P.inflB)), lift = easeInOut(tf) * lift0;
            A += 0.04 * Math.sin(e / 180) * clamp01((e - P.inflB) / 300);
            const rot = Math.sin(e / 520) * 0.08 * tf, x = g.cx + Math.sin(e / 700) * ph * 0.03 * tf, y = g.floorY - lift;
            // bơm tay đứng cạnh (mờ dần sau nhịp cuối)
            const pa = 1 - clamp01((e - P.inflB) / 400);
            if (!m.side) m.side = g.cx < W / 2 ? 1 : -1;
            const side = m.side, pumpX = clamp(g.cx + side * Math.max(g.w * 0.85 + ph * 0.1, ph * 0.3), ph * 0.08, W - ph * 0.08);     // luôn trong khung
            if (pa > 0 && e >= P.inflA - 200) drawPump(pumpX, g.floorY, ph * 0.3, stroke, pa * clamp01((e - P.inflA + 200) / 200), [g.cx + side * g.w * 0.12, g.floorY - ph * 0.02]);
            const s = inflated(b, A, col);
            // dây buộc + nút bóng (từ lúc phồng to)
            const ak = clamp01((A - 0.6) / 0.6);
            if (ak > 0) {
                ctx.save(); ctx.globalAlpha = ak; ctx.strokeStyle = 'rgba(245,245,245,0.95)'; ctx.lineWidth = Math.max(2, ph * 0.003);
                ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + Math.sin(e / 300) * ph * 0.05, y + ph * 0.2, x - Math.sin(e / 400) * ph * 0.06, y + ph * 0.38, x + Math.sin(e / 350) * ph * 0.04, y + Math.max(ph * 0.1, lift));
                ctx.stroke();
                const kn = ph * 0.026;
                ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - kn * 0.4); ctx.lineTo(x - kn * 0.7, y + kn * 0.6); ctx.lineTo(x + kn * 0.7, y + kn * 0.6); ctx.closePath(); ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(x - kn * 0.2, y + kn * 0.1, kn * 0.18, 0, TAU); ctx.fill();
                ctx.restore();
            }
            ctx.save(); ctx.translate(x + f.sx, y + f.sy); ctx.rotate(rot);
            ctx.drawImage(MC.c, 0, 0, s.BW, s.BH, -s.w / 2, -s.h + 6, s.w, s.h);
            ctx.restore();
            m.popX = x; m.popY = y - s.h * 0.5; m.popW = s.w; m.popH = s.h;
            return;
        }
        // ---- NỔ ----
        if (!m.shreds) {
            const R = f.rand;
            m.shreds = Array.from({ length: 22 }, () => { const a = R() * TAU, sp = 500 + R() * 1100;
                return { x: m.popX + Math.cos(a) * m.popW * 0.25, y: m.popY + Math.sin(a) * m.popH * 0.25, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 450, r: R() * TAU, vr: (R() - 0.5) * 18,
                    w: ph * (0.04 + R() * 0.05), hh: ph * (0.018 + R() * 0.022), c: R() < 0.7 ? col : '#ffffff', rest: false }; });
        }
        if (e < P.deflB) {
            // xì hơi bay vòng vèo (nhỏ, nhăn, quay theo hướng bay) + vệt
            const k = clamp01((e - P.pop) / (P.deflB - P.pop)), t = (e - P.pop) / 1000;
            const px = lerp(m.popX, g.cx, easeIn(k)) + Math.sin(t * 9.5) * W * 0.28 * (1 - k);
            const py = lerp(m.popY, g.floorY - ph * 0.12, easeIn(k)) + Math.cos(t * 13) * H * 0.07 * (1 - k);
            const pv = m.prev || [px, py - 1], rot = Math.atan2(py - pv[1], px - pv[0]) + Math.PI / 2;
            m.prev = [px, py];
            const sc = 0.42 + 0.08 * Math.sin(t * 40);
            m.trail.unshift({ x: px, y: py, r: rot }); if (m.trail.length > 4) m.trail.length = 4;
            for (let i = m.trail.length - 1; i >= 0; i--) {
                const q = m.trail[i];
                ctx.save(); ctx.globalAlpha = i ? 0.14 : 1;
                put(OC.c, b.ow, b.oh, b, g.cx, g.floorY - ph * 0.5, q.x + f.sx, q.y + f.sy, sc * 0.75, sc, q.r);
                ctx.restore();
            }
        } else if (e < P.flatB) {
            const t = (e - P.deflB) / 1000, sy = 0.2 * (1 + 0.35 * Math.exp(-t * 8) * Math.cos(t * 30));
            put(OC.c, b.ow, b.oh, b, g.cx, g.floorY, g.cx + f.sx, g.floorY + f.sy, 1.35, sy);
        } else if (e < P.reinB) {
            const k = easeOutElastic(clamp01((e - P.flatB) / (P.reinB - P.flatB)));
            put(OC.c, b.ow, b.oh, b, g.cx, g.floorY, g.cx + f.sx, g.floorY + f.sy, lerp(1.35, 1, k), lerp(0.2, 1, k));
        } else h.drawPersonPlain(f.sx, f.sy);
        // mảnh cao su văng
        const fade = 1 - clamp01((e - (P.end - 600)) / 600);
        ctx.save();
        for (const q of m.shreds) {
            if (!q.rest) {
                q.vy += 2600 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.r += q.vr * dt; q.vx *= 0.99;
                if (q.y >= g.floorY) { q.y = g.floorY; q.vy *= -0.25; q.vx *= 0.55; q.vr *= 0.5; if (Math.abs(q.vy) < 60) q.rest = true; }
            }
            ctx.globalAlpha = fade;
            ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.r);
            ctx.fillStyle = q.c; ctx.beginPath(); ctx.moveTo(-q.w / 2, 0); ctx.quadraticCurveTo(0, -q.hh * 1.6, q.w / 2, 0); ctx.quadraticCurveTo(0, q.hh * 0.4, -q.w / 2, 0); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(-q.w * 0.1, -q.hh * 0.45, q.w * 0.18, q.hh * 0.18, 0, 0, TAU); ctx.fill();
            ctx.restore();
        }
        ctx.restore();
        // "BỤP!" + tia nổ + loé
        if (e < P.pop + 800) {
            const t = (e - P.pop) / 800, sc = easeOutBack(clamp01(t / 0.25)), a = 1 - clamp01((t - 0.55) / 0.45);
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            if (t < 0.3) { const R = m.popW * (0.4 + t * 2); ctx.globalAlpha = 1 - t / 0.3; ctx.drawImage(dot('#ffffff'), m.popX - R, m.popY - R, R * 2, R * 2); }
            ctx.globalAlpha = a; ctx.strokeStyle = '#fff6c8'; ctx.lineWidth = 6; ctx.lineCap = 'round';
            for (let j = 0; j < 14; j++) { const an = j / 14 * TAU, r0 = m.popW * (0.3 + t * 0.4), r1 = r0 + m.popW * (0.25 + (j % 2) * 0.2) * (1 - t);
                ctx.beginPath(); ctx.moveTo(m.popX + Math.cos(an) * r0, m.popY + Math.sin(an) * r0); ctx.lineTo(m.popX + Math.cos(an) * r1, m.popY + Math.sin(an) * r1); ctx.stroke(); }
            ctx.restore();
            ctx.save(); ctx.globalAlpha = a; ctx.translate(m.popX, m.popY - m.popH * 0.1); ctx.rotate(-0.14); ctx.scale(sc, sc);
            const fs = Math.max(48, ph * 0.17);
            ctx.font = `900 ${fs}px "Arial Black", Impact, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
            ctx.strokeStyle = '#fff'; ctx.lineWidth = fs * 0.26; ctx.strokeText('BỤP!', 0, 0);
            ctx.strokeStyle = '#111'; ctx.lineWidth = fs * 0.14; ctx.strokeText('BỤP!', 0, 0);
            const tg = ctx.createLinearGradient(0, -fs / 2, 0, fs / 2); tg.addColorStop(0, '#fff36a'); tg.addColorStop(1, '#ff8a00');
            ctx.fillStyle = tg; ctx.fillText('BỤP!', 0, 0);
            ctx.restore();
        }
    }

    // =====================================================================================================================
    // 📱 HÚT VÀO ĐIỆN THOẠI
    const PH_LINES = ['vào đây chơi với tui', 'trời ơi bị hút luôn', 'hahaha', 'thả ra đi mà', 'xịn quá trời', '666', 'cứu idol với', 'đỉnh thật sự'];
    const PH_NAMES = ['minh.anh', 'tuan_99', 'bé.na', 'hoang.long', 'lili', 'khoa.t'];
    function phoneStart(f) {
        const R = f.rand;
        f.m = { hearts: [], acc: 0, view: 1200 + Math.floor(R() * 8000), cm: [0, 1, 2, 3].map(() => [PH_NAMES[Math.floor(R() * PH_NAMES.length)], PH_LINES[Math.floor(R() * PH_LINES.length)]]),
            bok: Array.from({ length: 9 }, () => [R(), R(), 0.3 + R() * 0.7]), side: 0 };
        avatar(f.d && f.d.profilePicture);
    }
    // vỏ điện thoại vẽ SẴN (một lần mỗi cỡ): bóng đổ mờ, độ dày 2.5D, khung kim loại, viền màn, nút cạnh
    function phoneBody(w, hh) {
        const key = Math.round(w) + 'x' + Math.round(hh);
        if (PHB.key === key) return PHB;
        const d = w * 0.045, pad = Math.ceil(w * 0.12), cw = Math.ceil(w + d + pad * 2), chh = Math.ceil(hh + d + pad * 2), x = PHB.x, r = w * 0.14;
        PHB.c.width = cw; PHB.c.height = chh; x.clearRect(0, 0, cw, chh);
        x.filter = `blur(${Math.max(4, w * 0.04)}px)`; rr(x, pad + d * 1.6, pad + d * 2.4, w, hh, r); x.fillStyle = 'rgba(0,0,0,0.45)'; x.fill(); x.filter = 'none';
        for (let i = 6; i >= 1; i--) { const o = d * i / 6; rr(x, pad + o, pad + o, w, hh, r); x.fillStyle = i > 3 ? '#0a0b0e' : '#1b1e24'; x.fill(); }
        let gr = x.createLinearGradient(pad, 0, pad + w, 0);
        gr.addColorStop(0, '#454c58'); gr.addColorStop(0.06, '#d4dbe5'); gr.addColorStop(0.16, '#5b636f'); gr.addColorStop(0.84, '#3b414a'); gr.addColorStop(0.94, '#b4bcc8'); gr.addColorStop(1, '#2b3038');
        rr(x, pad, pad, w, hh, r); x.fillStyle = gr; x.fill();
        gr = x.createLinearGradient(0, pad, 0, pad + hh); gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.12, 'rgba(255,255,255,0)'); gr.addColorStop(0.9, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)');
        x.fillStyle = gr; x.fill();
        const bz = w * 0.035;
        rr(x, pad + bz * 0.6, pad + bz * 0.6, w - bz * 1.2, hh - bz * 1.2, r * 0.9); x.fillStyle = '#040506'; x.fill();
        x.fillStyle = '#6b737f';
        for (const [yy, ll] of [[0.2, 0.06], [0.29, 0.09], [0.41, 0.09]]) { rr(x, pad - w * 0.014, pad + hh * yy, w * 0.02, hh * ll, w * 0.01); x.fill(); }
        rr(x, pad + w - w * 0.006, pad + hh * 0.3, w * 0.02, hh * 0.13, w * 0.01); x.fill();
        PHB.key = key; PHB.pad = pad; PHB.scr = { x: bz, y: bz, w: w - bz * 2, h: hh - bz * 2, r: r * 0.82 };
        return PHB;
    }
    function heartPath(X, x, y, s) {
        X.beginPath(); X.moveTo(x, y + s * 0.35);
        X.bezierCurveTo(x - s * 0.9, y - s * 0.25, x - s * 0.45, y - s * 0.95, x, y - s * 0.45);
        X.bezierCurveTo(x + s * 0.45, y - s * 0.95, x + s * 0.9, y - s * 0.25, x, y + s * 0.35); X.closePath();
    }
    function drawScreen(f, e, b, X0, Y0, SW, SH, inside, slide, ia = 1) {
        const m = f.m, P = f.p, col = f.sc.color || '#fe2c55';
        let gr = ctx.createLinearGradient(0, Y0, 0, Y0 + SH);
        gr.addColorStop(0, '#2a1242'); gr.addColorStop(0.55, '#4b1338'); gr.addColorStop(1, '#130a1d');
        ctx.fillStyle = gr; ctx.fillRect(X0, Y0, SW, SH);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const [bx, by, bs] of m.bok) { const R = SW * 0.12 * bs; ctx.globalAlpha = 0.25; ctx.drawImage(dot(bs > 0.6 ? col : '#7a5cff'), X0 + bx * SW - R, Y0 + by * SH * 0.7 - R, R * 2, R * 2); }
        ctx.restore();
        ctx.save(); ctx.translate(0, -slide * SH);
        if (inside && b && ia > 0) {                                        // NPC trong màn hiện dần + co nhẹ về cỡ (như vừa rơi vào)
            const dh = SH * 0.8 * (1 + 0.18 * (1 - ia)), dw = dh * b.ow / b.oh;
            ctx.globalAlpha = ia; ctx.drawImage(OC.c, 0, 0, b.ow, b.oh, X0 + SW / 2 - dw / 2, Y0 + SH - dh - SH * 0.03, dw, dh); ctx.globalAlpha = 1;
        }
        const tIn = e - P.suckB;
        // thanh trên: avatar + tên người tặng + lượt xem; LIVE
        const pH = SH * 0.062, pX = X0 + SW * 0.04, pY = Y0 + SH * 0.06, nick = String((f.d && f.d.nickname) || 'Khán giả');
        ctx.fillStyle = 'rgba(0,0,0,0.38)'; rr(ctx, pX, pY, SW * 0.62, pH, pH / 2); ctx.fill();
        const aR = pH * 0.42, ax = pX + pH / 2, ay = pY + pH / 2, im = avatar(f.d && f.d.profilePicture);
        ctx.save(); ctx.beginPath(); ctx.arc(ax, ay, aR, 0, TAU); ctx.clip();
        if (im) ctx.drawImage(im, ax - aR, ay - aR, aR * 2, aR * 2);
        else { const ag = ctx.createLinearGradient(ax - aR, ay - aR, ax + aR, ay + aR); ag.addColorStop(0, '#ff7ab6'); ag.addColorStop(1, '#7a5cff'); ctx.fillStyle = ag; ctx.fillRect(ax - aR, ay - aR, aR * 2, aR * 2);
            ctx.fillStyle = '#fff'; ctx.font = `700 ${aR}px "Segoe UI", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(nick.slice(0, 1).toUpperCase(), ax, ay + 1); }
        ctx.restore();
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
        ctx.font = `700 ${pH * 0.34}px "Segoe UI", sans-serif`; ctx.fillText(nick.length > 14 ? nick.slice(0, 13) + '…' : nick, pX + pH * 1.05, pY + pH * 0.36);
        ctx.font = `500 ${pH * 0.26}px "Segoe UI", sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillText((m.view + Math.floor(Math.max(0, tIn) / 37)).toLocaleString('vi-VN') + ' đang xem', pX + pH * 1.05, pY + pH * 0.72);
        ctx.fillStyle = col; rr(ctx, X0 + SW * 0.78, pY + pH * 0.15, SW * 0.17, pH * 0.7, pH * 0.18); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = `800 ${pH * 0.34}px "Segoe UI", sans-serif`; ctx.textAlign = 'center'; ctx.fillText('LIVE', X0 + SW * 0.865, pY + pH * 0.51);
        // tim bay bên phải
        for (const q of m.hearts) {
            const k = (e - q.t) / 1600; if (k < 0 || k > 1) continue;
            const x = X0 + SW * (0.86 + Math.sin(k * 7 + q.p) * 0.05), y = Y0 + SH * (0.9 - 0.55 * k), s = SW * 0.045 * (0.6 + 0.6 * easeOut(clamp01(k * 4)));
            ctx.globalAlpha = 1 - clamp01((k - 0.7) / 0.3);
            ctx.fillStyle = q.c; heartPath(ctx, x, y, s); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(x - s * 0.35, y - s * 0.45, s * 0.14, s * 0.1, -0.6, 0, TAU); ctx.fill();
            ctx.globalAlpha = 1;
        }
        // bình luận dưới trái (hiện dần)
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const lh = SH * 0.05, fsz = lh * 0.42;
        m.cm.forEach(([who, txt], i) => {
            const t0 = 300 + i * 650; if (tIn < t0) return;
            const a = clamp01((tIn - t0) / 200), yy = Y0 + SH * 0.62 + i * lh * 1.12 + (1 - a) * lh * 0.5;
            ctx.globalAlpha = a; ctx.font = `700 ${fsz}px "Segoe UI", sans-serif`;
            const wN = ctx.measureText(who + '  ').width; ctx.font = `500 ${fsz}px "Segoe UI", sans-serif`; const wT = ctx.measureText(txt).width;
            ctx.fillStyle = 'rgba(0,0,0,0.32)'; rr(ctx, X0 + SW * 0.04, yy, Math.min(SW * 0.7, wN + wT + fsz * 1.4), lh, lh / 2); ctx.fill();
            ctx.font = `700 ${fsz}px "Segoe UI", sans-serif`; ctx.fillStyle = '#ffd36b'; ctx.fillText(who, X0 + SW * 0.04 + fsz * 0.7, yy + lh / 2);
            ctx.font = `500 ${fsz}px "Segoe UI", sans-serif`; ctx.fillStyle = '#fff'; ctx.fillText(txt, X0 + SW * 0.04 + fsz * 0.7 + wN, yy + lh / 2);
            ctx.globalAlpha = 1;
        });
        // dải quà: "@tên đã hút NPC vào điện thoại"
        if (tIn > 150) {
            const a = easeOutBack(clamp01((tIn - 150) / 400)), bh = SH * 0.055, by = Y0 + SH * 0.48, bx = X0 - SW * 0.8 * (1 - a) + SW * 0.04;
            const bg = ctx.createLinearGradient(bx, 0, bx + SW * 0.8, 0); bg.addColorStop(0, rgba(col, 0.95)); bg.addColorStop(1, 'rgba(255,140,60,0.85)');
            ctx.fillStyle = bg; rr(ctx, bx, by, SW * 0.82, bh, bh / 2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.font = `700 ${bh * 0.36}px "Segoe UI", sans-serif`; ctx.textAlign = 'left';
            const s = '@' + (nick.length > 10 ? nick.slice(0, 9) + '…' : nick) + ' hút idol vào máy';
            ctx.fillText(s, bx + bh * 0.45, by + bh / 2);
        }
        ctx.restore();
    }
    function phoneFrame(f, e, dt, g) {
        const P = f.p, m = f.m, ph = g.ph, col = f.sc.color || '#fe2c55';
        cue(f, e, 'in', 0, (X, v) => X.whoosh(0.8, { vol: v * 0.6, f0: 300, f1: 1600 }));
        cue(f, e, 'suck', P.suckA, (X, v) => X.vacuum((P.suckB - P.suckA) / 1000, { vol: v }));
        cue(f, e, 'slurp', P.suckB - 380, (X, v) => X.slurp({ vol: v }));
        cue(f, e, 'noti', P.suckB + 250, (X, v) => X.ding({ vol: v * 0.7 }));
        cue(f, e, 'swipe', P.swipe, (X, v) => X.whoosh(0.6, { vol: v * 0.7, f0: 600, f1: 2400 }));
        cue(f, e, 'land', P.land, (X, v) => X.thud(1, { vol: v }));
        cue(f, e, 'out', P.land + 200, (X, v) => X.whoosh(0.7, { vol: v * 0.5, f0: 1600, f1: 400 }));
        setShake(f, shakeAt(f, e, P.land, 260, 16));
        if (!m.side) m.side = g.cx < W / 2 ? 1 : -1;
        const side = m.side, PHh = Math.min(H * 0.52, ph * 0.82), PHw = PHh * 0.49;
        const hx = clamp(g.cx + side * (Math.max(g.w * 0.55, ph * 0.16) + PHw * 0.62), PHw * 0.62, W - PHw * 0.62), hy = clamp(g.floorY - ph * 0.56, PHh * 0.54, H - PHh * 0.54);
        // điện thoại: bay vào xoay (giả 3D: co ngang theo góc quay) → lơ lửng → bay đi
        let px = hx, py = hy + Math.sin(e / 500) * PHh * 0.012, rot = -side * 0.06 + Math.sin(e / 900) * 0.02, yaw = 1, pa = 1;
        if (e < P.phoneB) {
            const k = clamp01(e / P.phoneB), kb = easeOutBack(k);
            px = lerp(hx + side * W * 0.7, hx, kb); py = lerp(-PHh, hy, easeOut(k)); rot = lerp(side * 0.9, rot, easeOut(k)); yaw = Math.max(0.12, Math.cos((1 - easeOut(k)) * 1.35));
        } else if (e > P.land + 150) {
            const k = easeIn(clamp01((e - P.land - 150) / (P.end - P.land - 150)));
            py -= k * (hy + PHh * 1.3); rot += side * k * 0.9; yaw = Math.max(0.12, Math.cos(k * 1.2)); pa = 1 - clamp01((k - 0.85) / 0.15);
        }
        const B = phoneBody(PHw, PHh), scr = B.scr;
        const b = shot(OC, g, S);
        const inside = e >= P.suckB - 420 && e < P.swipe + 260, ia = clamp01((e - (P.suckB - 420)) / 420);
        // người ngoài màn TRƯỚC khi hút (sau khi văng ra thì vẽ SAU điện thoại = nằm trước máy, xem cuối hàm)
        if (e < P.suckA) h.drawPersonPlain(f.sx, f.sy);
        // tia hút: hình nón sáng từ màn tới người + hạt chạy về máy
        if (e >= P.suckA - 150 && e < P.suckB + 100) {
            const k = clamp01((e - P.suckA + 150) / 300) * (1 - clamp01((e - P.suckB) / 100));
            const ex = px - side * PHw * 0.42;
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            const gr = ctx.createLinearGradient(ex, py, g.cx, g.floorY - ph * 0.5);
            gr.addColorStop(0, `rgba(255,255,255,${0.5 * k})`); gr.addColorStop(1, rgba(col, 0.1 * k));
            ctx.fillStyle = gr; ctx.beginPath();
            ctx.moveTo(ex, py - PHh * 0.36); ctx.lineTo(g.cx + side * g.w * 0.2, g.head.y - ph * 0.08); ctx.lineTo(g.cx - side * g.w * 0.9, g.floorY); ctx.lineTo(ex, py + PHh * 0.36); ctx.closePath(); ctx.fill();
            const d = dot('#ffffff');
            for (let i = 0; i < 26; i++) {
                const u = ((e / 700) + i / 26) % 1, sx = lerp(g.cx + Math.sin(i * 7.1) * g.w, ex, easeIn(u)), sy = lerp(g.floorY - ph * (0.1 + 0.9 * ((i * 0.37) % 1)), py + Math.sin(i * 3.3) * PHh * 0.25, easeIn(u)), r = ph * 0.012 * (1 - u * 0.6);
                ctx.globalAlpha = k * (1 - u) * 0.9; ctx.drawImage(d, sx - r * 2, sy - r * 2, r * 4, r * 4);
            }
            ctx.restore();
        }
        // điện thoại
        ctx.save();
        ctx.globalAlpha = pa; ctx.translate(px + f.sx, py + f.sy); ctx.rotate(rot); ctx.scale(yaw, 1);
        ctx.drawImage(B.c, -PHw / 2 - B.pad, -PHh / 2 - B.pad);
        const X0 = -PHw / 2 + scr.x, Y0 = -PHh / 2 + scr.y;
        ctx.save(); rr(ctx, X0, Y0, scr.w, scr.h, scr.r); ctx.clip();
        const slide = e >= P.swipe ? easeIn(clamp01((e - P.swipe) / 260)) : 0;
        if (inside && e >= P.suckB && e - m.acc > 160) { m.acc = e; m.hearts.push({ t: e, p: Math.random() * 6, c: ['#ff3d6e', '#ff8ac0', '#ffd36b', '#ff5a5a'][m.hearts.length % 4] }); if (m.hearts.length > 14) m.hearts.shift(); }
        drawScreen(f, e, b, X0, Y0, scr.w, scr.h, inside, slide, ia);
        if (e >= P.suckB - 300 && e < P.suckB + 450) {                     // chạm màn: gợn sóng sáng loang (thay chớp trắng gắt)
            const k = clamp01((e - P.suckB + 300) / 750), cx = X0 + scr.w / 2, cy = Y0 + scr.h * 0.55;
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = pa * 0.35 * Math.sin(k * Math.PI); ctx.fillStyle = '#fff'; ctx.fillRect(X0, Y0, scr.w, scr.h);
            for (let i = 0; i < 3; i++) { const kk = clamp01(k * 1.4 - i * 0.18); if (kk <= 0 || kk >= 1) continue;
                ctx.globalAlpha = pa * 0.7 * (1 - kk); ctx.strokeStyle = rgba(col, 1); ctx.lineWidth = scr.w * 0.02 * (1 - kk) + 1;
                ctx.beginPath(); ctx.ellipse(cx, cy, scr.w * 0.8 * kk, scr.h * 0.5 * kk, 0, 0, TAU); ctx.stroke(); }
            ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = pa;
        }
        const gg = ctx.createLinearGradient(X0, Y0, X0 + scr.w, Y0 + scr.h * 0.6);       // kính phản chiếu
        gg.addColorStop(0, 'rgba(255,255,255,0.16)'); gg.addColorStop(0.32, 'rgba(255,255,255,0.04)'); gg.addColorStop(0.33, 'rgba(255,255,255,0)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gg; ctx.fillRect(X0, Y0, scr.w, scr.h);
        ctx.restore();
        ctx.fillStyle = '#000'; rr(ctx, -PHw * 0.14, Y0 + scr.h * 0.018, PHw * 0.28, scr.h * 0.032, scr.h * 0.016); ctx.fill();        // đảo camera
        ctx.fillStyle = '#1d2a44'; ctx.beginPath(); ctx.arc(PHw * 0.08, Y0 + scr.h * 0.034, scr.h * 0.009, 0, TAU); ctx.fill();
        ctx.restore();
        // người bị hút bay vào màn
        // MƯỢT (user 2026-10-28 "rơi vào hơi thô"): đường cong mềm (chậm - nhanh - chậm), nghiêng nhẹ thay vì xoay vòng, kéo giãn theo lực hút,
        // vệt mờ 3 bóng theo sau, mờ dần lúc chạm màn - cùng lúc NPC trong màn hiện dần (ia)
        if (b && e >= P.suckA && e < P.suckB) {
            const k = clamp01((e - P.suckA) / (P.suckB - P.suckA)), kk = easeInOut(k);
            const tx = px, ty = py + PHh * 0.1;
            const pos = q => [lerp(g.cx, tx, q) + Math.sin(q * Math.PI) * side * ph * 0.05, lerp(g.floorY - ph * 0.5, ty, q) - Math.sin(q * Math.PI) * ph * 0.16];
            const a = 1 - clamp01((k - 0.7) / 0.3), stretch = Math.sin(k * Math.PI) * 0.22, tilt = side * 0.28 * Math.sin(k * Math.PI);
            for (let j = 3; j >= 0; j--) {
                const q = Math.max(0, kk - j * 0.035), [x, y] = pos(q), sj = lerp(1, (scr.h * 0.62) / ph, Math.pow(q, 0.85));
                ctx.save(); ctx.globalAlpha = a * (j ? 0.14 : 1);
                put(OC.c, b.ow, b.oh, b, g.cx, g.floorY - ph * 0.5, x + f.sx, y + f.sy, sj * (1 - stretch * 0.5), sj * (1 + stretch), tilt);
                ctx.restore();
            }
        }
        // văng ra khỏi màn, đáp về chỗ cũ
        if (b && e >= P.swipe + 120 && e < P.land) {
            const k = clamp01((e - P.swipe - 120) / (P.land - P.swipe - 120)), kk = easeOut(k);
            // lao RA PHÍA NGƯỜI XEM: to vượt cỡ thật giữa đường (≤ 1,3×) rồi đáp về đúng cỡ
            const s = lerp((scr.h * 0.5) / ph, 1, kk) * (1 + 0.3 * Math.sin(k * Math.PI)), x = lerp(px, g.cx, kk), y = lerp(py, g.floorY - ph * 0.5, kk) - Math.sin(k * Math.PI) * ph * 0.3;
            put(OC.c, b.ow, b.oh, b, g.cx, g.floorY - ph * 0.5, x + f.sx, y + f.sy, s, s, -side * (1 - kk) * TAU);
        }
        // đã đáp: NPC luôn nằm TRƯỚC điện thoại đang bay đi (user 2026-10-28: trước đó vẽ người trước máy → máy đè lên, trông như nhảy ra sau)
        if (e >= P.land) {
            if (e < P.land + 260 && b) { const k = (e - P.land) / 260; put(OC.c, b.ow, b.oh, b, g.cx, g.floorY, g.cx + f.sx, g.floorY + f.sy, 1 + 0.12 * Math.sin(k * Math.PI), 1 - 0.15 * Math.sin(k * Math.PI)); }
            else h.drawPersonPlain(f.sx, f.sy);
        }
    }

    // =====================================================================================================================
    // 🎨 BIẾN HOẠT HÌNH
    let toonOK = null;
    function toonFilter() {
        if (toonOK != null) return toonOK;
        try {
            if (!document.getElementById('hpToon')) {
                const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg');
                s.setAttribute('width', '0'); s.setAttribute('height', '0'); s.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
                s.innerHTML = '<filter id="hpToon" color-interpolation-filters="sRGB"><feComponentTransfer>'
                    + '<feFuncR type="discrete" tableValues="0.03 0.2 0.37 0.54 0.7 0.86 1"/><feFuncG type="discrete" tableValues="0.03 0.2 0.37 0.54 0.7 0.86 1"/>'
                    + '<feFuncB type="discrete" tableValues="0.05 0.22 0.39 0.56 0.72 0.87 1"/></feComponentTransfer></filter>';      // 7 mức: tô phẳng mà không loang màu lạ
                document.body.appendChild(s);
            }
            toonOK = true;
        } catch (_) { toonOK = false; }
        return toonOK;
    }
    const FL = [];
    function focusLines(i) {           // vệt tập trung (集中線) vẽ SẴN 3 biến thể, nửa cỡ, phủ 2W × 2H
        if (FL[i]) return FL[i];
        const c = document.createElement('canvas'); c.width = Math.ceil(W); c.height = Math.ceil(H);
        const x = c.getContext('2d'), cx = c.width / 2, cy = c.height / 2, R = Math.hypot(cx, cy), r0 = Math.min(W, H) * 0.2;
        let s = 77 + i * 131; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
        x.fillStyle = '#000';
        for (let k = 0; k < 170; k++) {
            const a = rnd() * TAU, wA = 0.002 + rnd() * 0.012, rIn = r0 * (1 + rnd() * 1.3);
            x.beginPath(); x.moveTo(cx + Math.cos(a) * rIn, cy + Math.sin(a) * rIn);
            x.lineTo(cx + Math.cos(a - wA) * R, cy + Math.sin(a - wA) * R); x.lineTo(cx + Math.cos(a + wA) * R, cy + Math.sin(a + wA) * R); x.closePath(); x.fill();
        }
        FL[i] = c;
        return c;
    }
    let TONE = null;
    function tone() {                  // chấm lưới (screentone)
        if (TONE) return TONE;
        const c = document.createElement('canvas'); c.width = c.height = 8;
        const x = c.getContext('2d'); x.fillStyle = 'rgba(20,10,40,1)'; x.beginPath(); x.arc(2, 2, 1.25, 0, TAU); x.arc(6, 6, 1.25, 0, TAU); x.fill();
        TONE = OC.x.createPattern(c, 'repeat');
        return TONE;
    }
    const ANIME_LINES = ['Sức mạnh này... là gì?!', 'Không thể nào!!', 'Ta đã thức tỉnh!', 'Hừm... thú vị đấy!', 'Đến lượt ta rồi!'];
    function animeStart(f) { f.m = { line: ANIME_LINES[Math.floor(f.rand() * ANIME_LINES.length)], tear: null, lb: -1e9 }; toonFilter(); }
    function animeFrame(f, e, dt, g) {
        const P = f.p, m = f.m, ph = g.ph;
        const beats = []; for (let t = P.inB; t < P.tear - 200; t += 1300) beats.push(t);
        cue(f, e, 'in', 0, (X, v) => X.whoosh(0.55, { vol: v * 0.6, f0: 400, f1: 2600 }));
        beats.forEach((t, i) => cue(f, e, 'b' + i, t, (X, v) => X.taiko(i ? 1 : 1.5, { vol: v })));
        cue(f, e, 'tear', P.tear, (X, v) => { X.rustle(0.6, { vol: v }); X.whoosh(0.8, { vol: v * 0.5, f0: 900, f1: 300 }); });
        for (const t of beats) if (e >= t) m.lb = t;
        setShake(f, shakeAt(f, e, P.inB, 280, 16));
        if (e >= P.tear && m.tear) return animeTear(f, e, g);
        const on = easeOut(clamp01(e / P.inB)), pulse = 1 - clamp01((e - m.lb) / 260);
        // 1) nền → trang truyện trắng đen
        ctx.save(); ctx.globalAlpha = on;
        ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#f2e8d2'; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = on * 0.22; ctx.fillStyle = '#fffaf0'; ctx.fillRect(0, 0, W, H);
        ctx.restore();
        // 2) vệt tập trung, đập theo trống
        const fx0 = g.cx, fy0 = g.floorY - ph * 0.62, fsc = 1 + 0.07 * pulse;
        ctx.save(); ctx.globalAlpha = on * (0.5 + 0.4 * pulse); ctx.translate(fx0, fy0); ctx.scale(fsc, fsc);
        ctx.drawImage(focusLines(Math.floor(e / 90) % 3), -W, -H, 2 * W, 2 * H);
        ctx.restore();
        // 3) NPC kiểu anime: tô phẳng + bóng cel cạnh cứng + chấm lưới + viền mực
        if (on < 1) h.drawPersonPlain(f.sx, f.sy, 1 - on);
        const b = shot(OC, g, S, toonOK ? 'contrast(1.15) saturate(1.55) url(#hpToon)' : 'contrast(1.3) saturate(1.7)');
        if (b) {
            const X = OC.x;
            X.globalCompositeOperation = 'source-atop';
            const gr = X.createLinearGradient(0, 0, b.ow, 0);
            gr.addColorStop(0, 'rgba(40,20,70,0)'); gr.addColorStop(0.6, 'rgba(40,20,70,0)'); gr.addColorStop(0.61, 'rgba(40,20,70,0.26)'); gr.addColorStop(1, 'rgba(40,20,70,0.32)');
            X.fillStyle = gr; X.fillRect(0, 0, b.ow, b.oh);
            X.globalAlpha = 0.3; X.fillStyle = tone(); X.fillRect(b.ow * 0.61, 0, b.ow * 0.39, b.oh); X.globalAlpha = 1;
            const rg = X.createLinearGradient(0, 0, b.ow * 0.45, 0);            // viền sáng bên trái
            rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(0.32, 'rgba(255,255,255,0)'); rg.addColorStop(0.33, 'rgba(255,255,255,0.16)'); rg.addColorStop(0.4, 'rgba(255,255,255,0)');
            X.fillStyle = rg; X.fillRect(0, 0, b.ow, b.oh);
            X.globalCompositeOperation = 'source-over';
            // viền mực: bóng đen (8 hướng) của dáng
            const r = 3;
            if (SIL.c.width !== b.ow || SIL.c.height !== b.oh) { SIL.c.width = b.ow; SIL.c.height = b.oh; } else SIL.x.clearRect(0, 0, b.ow, b.oh);
            SIL.x.drawImage(OC.c, 0, 0); SIL.x.globalCompositeOperation = 'source-in'; SIL.x.fillStyle = '#0b0710'; SIL.x.fillRect(0, 0, b.ow, b.oh); SIL.x.globalCompositeOperation = 'source-over';
            const ow2 = b.ow + r * 2, oh2 = b.oh + r * 2;
            if (OUTL.c.width !== ow2 || OUTL.c.height !== oh2) { OUTL.c.width = ow2; OUTL.c.height = oh2; } else OUTL.x.clearRect(0, 0, ow2, oh2);
            for (let i = 0; i < 8; i++) OUTL.x.drawImage(SIL.c, r + Math.round(Math.cos(i / 8 * TAU) * r), r + Math.round(Math.sin(i / 8 * TAU) * r));
            const bw = b.x1 - b.x0, bh = b.y1 - b.y0, pr = r / S;
            ctx.save(); ctx.globalAlpha = on;
            ctx.drawImage(OUTL.c, 0, 0, ow2, oh2, b.x0 - pr + f.sx, b.y0 - pr + f.sy, bw + pr * 2, bh + pr * 2);
            ctx.drawImage(OC.c, 0, 0, b.ow, b.oh, b.x0 + f.sx, b.y0 + f.sy, bw, bh);
            ctx.restore();
        }
        // 4) chữ tượng thanh ドドド hai bên, nảy theo trống
        if (e > P.inB) {
            const a = clamp01((e - P.inB) / 250), fs = Math.max(40, Math.min(W, H) * 0.075);
            ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
            ctx.font = `900 ${fs * (1 + 0.15 * pulse)}px "Yu Gothic", "Meiryo", "MS Gothic", sans-serif`;
            for (const [sx0, rot0] of [[0.1, -0.12], [0.9, 0.12]]) {
                for (let i = 0; i < 4; i++) {
                    const x = W * sx0 + (i % 2 ? fs * 0.25 : -fs * 0.25) + Math.sin(e / 40 + i) * 2 * pulse, y = H * 0.28 + i * fs * 1.05;
                    ctx.save(); ctx.translate(x, y); ctx.rotate(rot0 + (i % 2 ? 0.08 : -0.08));
                    ctx.strokeStyle = '#fff'; ctx.lineWidth = fs * 0.22; ctx.strokeText('ド', 0, 0);
                    ctx.fillStyle = '#120a18'; ctx.fillText('ド', 0, 0);
                    ctx.restore();
                }
            }
            ctx.restore();
        }
        // 5) bong bóng thoại
        if (e > P.inB + 250) {
            if (!m.side) m.side = g.cx < W / 2 ? 1 : -1;
            const a = easeOutBack(clamp01((e - P.inB - 250) / 350)), side = m.side;
            const fs = Math.max(26, Math.min(W, H) * 0.036), bwB = Math.min(W * 0.42, fs * 9), bhB = fs * 2.6;
            const bx = clamp(g.cx + side * (g.w * 0.55 + bwB * 0.45), bwB * 0.55, W - bwB * 0.55), by = clamp(g.head.y - ph * 0.02, bhB, H - bhB);
            ctx.save(); ctx.translate(bx, by); ctx.scale(a, a);
            ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(3, fs * 0.14);
            ctx.beginPath(); ctx.ellipse(0, 0, bwB / 2, bhB / 2, 0, 0, TAU); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-side * bwB * 0.18, bhB * 0.38); ctx.lineTo(-side * bwB * 0.42, bhB * 0.85); ctx.lineTo(-side * bwB * 0.02, bhB * 0.44); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, 0, bwB / 2 - ctx.lineWidth, bhB / 2 - ctx.lineWidth, 0, 0, TAU); ctx.fill();
            ctx.fillStyle = '#111'; ctx.font = `800 ${fs}px "Comic Sans MS", "Segoe UI", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(m.line, 0, 0, bwB * 0.86);
            ctx.restore();
        }
        // 6) khung tranh truyện (lề giấy trắng + viền đen) trượt vào
        const mg = Math.min(W, H) * 0.028 * on;
        if (mg > 0.5) {
            ctx.save(); ctx.fillStyle = '#fbf7ee'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(mg, mg, W - mg * 2, H - mg * 2); ctx.fill('evenodd');
            ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(4, mg * 0.28); ctx.strokeRect(mg, mg, W - mg * 2, H - mg * 2); ctx.restore();
        }
        // chớp trắng mở màn
        if (e < P.inB) { ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - clamp01(e / P.inB))})`; ctx.fillRect(0, 0, W, H); }
        // chụp khung cuối cho cảnh xé trang (một lần, nửa cỡ)
        if (!m.tear && e >= P.tear - 70) {
            const tw = Math.ceil(W / 2), th = Math.ceil(H / 2);
            TEAR.c.width = tw; TEAR.c.height = th; TEAR.x.drawImage(ctx.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height, 0, 0, tw, th);
            const R = f.rand, pts = [], n = 18, x0 = W * (0.46 + R() * 0.08);
            for (let i = 0; i <= n; i++) pts.push([x0 + (R() - 0.5) * W * 0.07 + Math.sin(i * 1.3) * W * 0.02, H * i / n]);
            m.tear = pts;
        }
    }
    function animeTear(f, e, g) {
        const P = f.p, pts = f.m.tear, k = clamp01((e - P.tear) / (P.end - P.tear)), kk = easeIn(k);
        h.drawPersonPlain();
        for (const s of [-1, 1]) {
            ctx.save();
            ctx.translate(s * kk * W * 0.6, kk * kk * H * 0.25);
            ctx.translate(W / 2, H); ctx.rotate(s * kk * 0.35); ctx.translate(-W / 2, -H);
            ctx.globalAlpha = 1 - clamp01((k - 0.75) / 0.25);
            ctx.beginPath(); ctx.moveTo(s < 0 ? 0 : W, 0);
            for (const [x, y] of pts) ctx.lineTo(x, y);
            ctx.lineTo(s < 0 ? 0 : W, H); ctx.closePath();
            ctx.save(); ctx.clip();
            ctx.drawImage(TEAR.c, 0, 0, TEAR.c.width, TEAR.c.height, 0, 0, W, H);
            ctx.restore();
            ctx.lineJoin = 'round';
            ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 16; ctx.stroke();
            ctx.strokeStyle = '#fdfaf2'; ctx.lineWidth = 8; ctx.stroke();
            ctx.restore();
        }
    }

    // =====================================================================================================================
    // 💉 HÚT MỠ
    const gauss = (v, c, w) => Math.exp(-((v - c) * (v - c)) / (2 * w * w));
    function lipoStart(f) { f.m = { blobs: [], acc: 0, side: 0 }; }
    function lipoMachine(x, fy, hM, fat, T, e, a) {     // xe máy hút y tế 2.5D: thân trắng sứ, màn số, bình thuỷ tinh chứa mỡ, bánh xe
        const wM = hM * 0.52, top = fy - hM;
        ctx.save(); ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, fy, wM * 0.75, hM * 0.035, 0, 0, TAU); ctx.fill();
        for (const wx of [-0.36, 0.36]) {                                    // bánh xe
            const gr = ctx.createRadialGradient(x + wM * wx - 2, fy - hM * 0.04 - 2, 0, x + wM * wx, fy - hM * 0.04, hM * 0.045);
            gr.addColorStop(0, '#666'); gr.addColorStop(1, '#111'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x + wM * wx, fy - hM * 0.04, hM * 0.045, 0, TAU); ctx.fill();
        }
        rr(ctx, x - wM / 2 + wM * 0.06, top + hM * 0.38 + wM * 0.05, wM, hM * 0.55, wM * 0.08); ctx.fillStyle = '#9aa3ad'; ctx.fill();        // cạnh khối (độ dày)
        let gr = ctx.createLinearGradient(x - wM / 2, 0, x + wM / 2, 0);
        gr.addColorStop(0, '#d9dee4'); gr.addColorStop(0.25, '#ffffff'); gr.addColorStop(0.7, '#eef1f4'); gr.addColorStop(1, '#b9c0c8');
        rr(ctx, x - wM / 2, top + hM * 0.38, wM, hM * 0.55, wM * 0.08); ctx.fillStyle = gr; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2; ctx.stroke();
        // màn số
        const sx0 = x - wM * 0.38, sy0 = top + hM * 0.43, sw = wM * 0.76, sh = hM * 0.14;
        rr(ctx, sx0, sy0, sw, sh, wM * 0.04); ctx.fillStyle = '#0b1a1f'; ctx.fill();
        ctx.fillStyle = '#3dffb0'; ctx.font = `700 ${sh * 0.3}px "Consolas", "Segoe UI", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('HÚT MỠ  ' + Math.round(T * 87) + '%', x, sy0 + sh * 0.34);
        ctx.fillStyle = 'rgba(61,255,176,0.25)'; ctx.fillRect(sx0 + sw * 0.08, sy0 + sh * 0.66, sw * 0.84, sh * 0.14);
        ctx.fillStyle = '#3dffb0'; ctx.fillRect(sx0 + sw * 0.08, sy0 + sh * 0.66, sw * 0.84 * T, sh * 0.14);
        ctx.fillStyle = T > 0.02 && Math.sin(e / 120) > 0 ? '#ff3b3b' : '#5a1010'; ctx.beginPath(); ctx.arc(x + wM * 0.32, top + hM * 0.62, wM * 0.035, 0, TAU); ctx.fill();
        for (let i = 0; i < 3; i++) { ctx.fillStyle = '#c9d0d8'; ctx.beginPath(); ctx.arc(x - wM * 0.25 + i * wM * 0.17, top + hM * 0.68, wM * 0.05, 0, TAU); ctx.fill(); }
        // bình thuỷ tinh (trụ) chứa mỡ trên nóc
        const cx0 = x - wM * 0.22, cw = wM * 0.44, ch = hM * 0.33, cy0 = top + hM * 0.04;
        const lvl = ch * 0.9 * fat;
        gr = ctx.createLinearGradient(cx0, 0, cx0 + cw, 0); gr.addColorStop(0, '#c98a00'); gr.addColorStop(0.35, '#ffd95a'); gr.addColorStop(0.6, '#ffc21a'); gr.addColorStop(1, '#a86e00');
        if (lvl > 1) { ctx.fillStyle = gr; ctx.fillRect(cx0, cy0 + ch - lvl, cw, lvl); ctx.fillStyle = '#ffe28a'; ctx.beginPath(); ctx.ellipse(cx0 + cw / 2, cy0 + ch - lvl, cw / 2, cw * 0.1, 0, 0, TAU); ctx.fill(); }
        for (let i = 0; i < 5 && lvl > 10; i++) { const by = cy0 + ch - ((e / 900 + i * 0.21) % 1) * lvl, bx = cx0 + cw * (0.2 + 0.15 * i); ctx.fillStyle = 'rgba(255,250,220,0.6)'; ctx.beginPath(); ctx.arc(bx, by, cw * 0.035, 0, TAU); ctx.fill(); }
        gr = ctx.createLinearGradient(cx0, 0, cx0 + cw, 0); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.08)'); gr.addColorStop(0.8, 'rgba(255,255,255,0.04)'); gr.addColorStop(1, 'rgba(255,255,255,0.3)');
        ctx.fillStyle = gr; ctx.fillRect(cx0, cy0, cw, ch);
        ctx.strokeStyle = 'rgba(220,235,245,0.8)'; ctx.lineWidth = 2; ctx.strokeRect(cx0, cy0, cw, ch);
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(cx0 + cw * 0.12, cy0 + ch * 0.06, cw * 0.07, ch * 0.85);
        gr = ctx.createLinearGradient(cx0, 0, cx0 + cw, 0); gr.addColorStop(0, '#8d949c'); gr.addColorStop(0.5, '#f4f6f8'); gr.addColorStop(1, '#7d848c');
        ctx.fillStyle = gr; rr(ctx, cx0 - cw * 0.06, cy0 - ch * 0.08, cw * 1.12, ch * 0.1, 4); ctx.fill();          // nắp kim loại
        ctx.restore();
        return { x: cx0 + cw / 2, y: cy0 - ch * 0.06 };                     // miệng ống trên nắp bình
    }
    function lipoFrame(f, e, dt, g) {
        const P = f.p, m = f.m, ph = g.ph, col = f.sc.color || '#ffc93c';
        cue(f, e, 'roll', 0, (X, v) => X.rattle(0.7, { vol: v * 0.5 }));
        cue(f, e, 'motor', P.suckA, (X, v) => X.vacuum((P.suckB - P.suckA) / 1000 + 0.4, { vol: v }));
        for (let t = P.suckA + 300, i = 0; t < P.suckB; t += 650, i++) cue(f, e, 's' + i, t, (X, v) => X.slurp({ vol: v * 0.6 }));
        cue(f, e, 'boing', P.back, (X, v) => { X.inflate(2, { vol: v * 0.7, dur: 0.5 }); X.boing({ vol: v }); });
        cue(f, e, 'leave', P.backB, (X, v) => X.rattle(0.6, { vol: v * 0.4 }));
        f.sx = f.sy = 0;
        // T = độ tóp 0..1
        let T = 0;
        if (e >= P.suckA && e < P.suckB) T = easeInOut((e - P.suckA) / (P.suckB - P.suckA));
        else if (e >= P.suckB && e < P.back) T = 1;
        else if (e >= P.back && e < P.backB) T = 1 - easeOutElastic((e - P.back) / (P.backB - P.back));
        T = clamp(T, -0.25, 1);
        if (!m.side) m.side = g.cx < W / 2 ? 1 : -1;
        const side = m.side, hM = clamp(ph * 0.42, 140, H * 0.5), wM = hM * 0.52;
        const tgt = clamp(g.cx + side * (g.w * 0.8 + wM * 0.75), wM * 0.6, W - wM * 0.6);
        const kin = easeOutBack(clamp01(e / P.machB)), kout = easeIn(clamp01((e - P.backB) / (P.end - P.backB)));
        const mx = lerp(tgt + side * W * 0.6, tgt, kin) + side * W * 0.6 * kout;
        const fat = clamp01(T) * 0.85 + (e >= P.suckB ? 0.15 * clamp01((e - P.suckB) / 400) : 0);
        const mouth = lipoMachine(mx, g.floorY, hM, e < P.back ? fat : 1, Math.max(0, T), e, 1);
        const b = shot(OC, g, S, T > 0.03 ? `saturate(${1 - 0.45 * T}) contrast(${1 + 0.18 * T}) brightness(${1 - 0.1 * T})` : undefined);
        if (!b) return;
        // người gầy: từng hàng co ngang (bụng / eo nhiều nhất, đùi vừa, má hóp), run nhẹ lúc đang hút
        const rows = 150, BW = b.ow, BH = b.oh, torso = Math.min(0.5, g.w * 0.5 / (b.x1 - b.x0));      // nhiều hàng mảnh: mép mịn; torso = bề ngang thân / khung chụp
        if (MC.c.width !== BW || MC.c.height !== BH) { MC.c.width = BW; MC.c.height = BH; } else MC.x.clearRect(0, 0, BW, BH);
        const X = MC.x, sh = BH / rows;
        const fac = v => 1 - T * Math.min(0.62, 0.55 * gauss(v, 0.43, 0.13) + 0.28 * gauss(v, 0.68, 0.12) + 0.2 * gauss(v, 0.88, 0.1) + 0.22 * gauss(v, 0.1, 0.04));
        for (let i = 0; i < rows; i++) {
            const v = (i + 0.5) / rows, dw = BW * fac(v);
            X.drawImage(OC.c, 0, i * sh, BW, Math.min(sh + 0.5, BH - i * sh), (BW - dw) / 2, i * sh, dw, sh + 0.6);
        }
        if (T > 0.05) {
            const tt = clamp01(T);
            X.globalCompositeOperation = 'source-atop';
            let gr = X.createLinearGradient(0, 0, BW, 0);                    // má / sườn hõm: tối 2 bên thân
            const e0 = 0.5 - torso * 0.95, e1 = 0.5 + torso * 0.95;
            gr.addColorStop(clamp01(e0), `rgba(40,20,15,${0.3 * tt})`); gr.addColorStop(0.5 - torso * 0.45, 'rgba(40,20,15,0)'); gr.addColorStop(0.5 + torso * 0.45, 'rgba(40,20,15,0)'); gr.addColorStop(clamp01(e1), `rgba(40,20,15,${0.3 * tt})`);
            X.fillStyle = gr; X.fillRect(0, 0, BW, BH);
            const cxm = BW / 2;                                              // (vạch xương sườn / quai xanh đã BỎ - user 2026-10-28: ốm vậy là đủ hài)
            for (const s2 of [-1, 1]) {                                      // má hóp
                const hx = cxm + s2 * BW * torso * 0.36, hy = 0.095 * BH, r = BW * torso * 0.2;
                const g2 = X.createRadialGradient(hx, hy, 0, hx, hy, r); g2.addColorStop(0, `rgba(60,25,20,${0.45 * tt})`); g2.addColorStop(1, 'rgba(60,25,20,0)');
                X.fillStyle = g2; X.fillRect(hx - r, hy - r, r * 2, r * 2);
            }
            X.globalCompositeOperation = 'source-over';
        }
        const shake = T > 0 && e < P.suckB ? Math.sin(e / 22) * ph * 0.004 : 0;
        ctx.drawImage(MC.c, 0, 0, BW, BH, b.x0 + shake, b.y0, b.x1 - b.x0, b.y1 - b.y0);
        // ống hút trong suốt: từ bụng tới miệng bình, mỡ vàng chảy về máy
        const hoseOn = clamp01(e / P.machB) * (1 - clamp01((e - P.back + 200) / 300));
        if (hoseOn > 0) {
            const vB = 0.47, bx = g.cx + side * (b.x1 - b.x0) * fac(vB) * 0.16, by = b.y0 + (b.y1 - b.y0) * vB;
            const c1x = bx + side * ph * 0.18, c1y = by + ph * 0.18, c2x = mouth.x, c2y = mouth.y - ph * 0.25;
            const at = u => { const q = 1 - u; return [q * q * q * bx + 3 * q * q * u * c1x + 3 * q * u * u * c2x + u * u * u * mouth.x, q * q * q * by + 3 * q * q * u * c1y + 3 * q * u * u * c2y + u * u * u * mouth.y]; };
            ctx.save(); ctx.globalAlpha = hoseOn; ctx.lineCap = 'round';
            const hw = Math.max(6, ph * 0.022);
            const path = () => { ctx.beginPath(); ctx.moveTo(bx, by); ctx.bezierCurveTo(c1x, c1y, c2x, c2y, mouth.x, mouth.y); };
            path(); ctx.strokeStyle = 'rgba(150,180,200,0.55)'; ctx.lineWidth = hw; ctx.stroke();
            path(); ctx.strokeStyle = 'rgba(230,245,255,0.35)'; ctx.lineWidth = hw * 0.62; ctx.stroke();
            if (T > 0 && e < P.suckB + 300) {                                // cục mỡ chạy trong ống
                m.acc += dt;
                while (m.acc > 0.07) { m.acc -= 0.07; if (m.blobs.length < 40) m.blobs.push({ u: 0, sp: 0.55 + Math.random() * 0.35, r: hw * (0.22 + Math.random() * 0.16) }); }
            }
            for (let i = m.blobs.length - 1; i >= 0; i--) {
                const q = m.blobs[i]; q.u += q.sp * dt;
                if (q.u >= 1) { m.blobs.splice(i, 1); continue; }
                const [px, py] = at(q.u);
                const g2 = ctx.createRadialGradient(px - q.r * 0.35, py - q.r * 0.35, 0, px, py, q.r);
                g2.addColorStop(0, '#fff6c8'); g2.addColorStop(0.4, col); g2.addColorStop(1, '#b07800');
                ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(px, py, q.r, 0, TAU); ctx.fill();
            }
            path(); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = Math.max(1.5, hw * 0.12); ctx.setLineDash([hw * 0.2, hw * 0.5]); ctx.stroke(); ctx.setLineDash([]);
            const ng = ctx.createLinearGradient(bx - hw, by, bx + hw, by); ng.addColorStop(0, '#8d949c'); ng.addColorStop(0.5, '#f4f6f8'); ng.addColorStop(1, '#7d848c');
            ctx.fillStyle = ng; ctx.beginPath(); ctx.arc(bx, by, hw * 0.55, 0, TAU); ctx.fill();          // đầu cắm kim loại trên bụng
            ctx.restore();
        }
    }

    const START = { ghost: ghostStart, clone: cloneStart, melt: meltStart, balloon: balloonStart, lipo: lipoStart, phone: phoneStart, anime: animeStart };
    const FRAME = { ghost: ghostFrame, clone: cloneFrame, melt: meltFrame, balloon: balloonFrame, lipo: lipoFrame, phone: phoneFrame, anime: animeFrame };
    return {
        styles: Object.keys(FRAME),
        start(f) { (START[f.sc.style] || (() => {}))(f); },
        frame(f, e, dt, g) { const fn = FRAME[f.sc.style]; if (fn) fn(f, e, dt, g); },
    };
}
