/* ✨ BIẾN HÌNH - mô-đun hiệu ứng của 🧍 Bộ Tách Người (overlays/camgames/body/overlay.html), kind 'morph'.
 * 5 kiểu vẽ bằng mã (không cần video), theo 6 clip user gửi 2026-10-28 (docs/camgames-bien-hinh.md):
 *   🧊 ice   - gió tuyết thổi ngang từ trái → băng lan dần trái → phải → tượng pha lê đứng waitSec giây → tan rã thành mảnh kính + khói băng → người hiện lại
 *   👾 pixel - chớp glitch nhiều kiểu (bảng 8-bit, xé ngang, âm bản…) → lưới khối 3D → đổ sụp → nằm vụn waitSec giây → xoáy bay về → mịn lại
 *   ⚡ zap   - dải mây dông phủ đỉnh khung → mỗi tia (1 + power): loé trắng cả màn → cầu sáng nổ trên đầu + người phát sáng → tia lửa phun
 *              → xương ↔ người nhấp nháy, tia điện bò tay chân; người sạm dần; sau tia cuối 2 mắt tuột xuống sàn, đen sì bốc khói → sáng lại, mây tan
 *   🌀 vacuum - ống gân nhỏ thả xuống trên đầu → hút người THU NHỎ vào ống → ống rút lên → chờ waitSec → hạ xuống một chút → thả người ra
 *   🖐 slap  - bàn tay khổng lồ tát qua tát lại (trái/phải, trên/dưới, chéo), người bay văng có vệt nhoè, đổi tư thế → bay về đáp đất
 *   🐝 bees  - tổ ong rơi trúng đầu bật xuống sàn → đàn ong bu lên người (đậu theo dáng), NPC vung tay xua thì tản ra rồi bu lại → bay đi
 *   🐉 fly   - cảnh trời / núi / toà nhà, NPC thu nhỏ nấp sau toà nhà → bay lên kiểu Songoku → chưởng / lao vào màn / đánh bản sao (fx-morph-fly.mjs)
 * Mốc thời gian = HpBody.morphPlan (core.cjs, dùng chung với estimateMs).
 * NHẸ: chỉ Canvas 2D. Người vẽ vào canvas phụ quanh người (nửa cỡ) khi cần nhuộm / chụp tượng; mảnh vỡ / khối tính theo công thức
 * thời gian (rơi + nảy 1 lần + trượt) - tua mốc (__bodyT) vẫn đúng, khung chậm không làm mảnh xuyên sàn. Không WebGL, không shadowBlur.
 * env: như fx-catch.mjs (ctx, W, H, view, person, backdrop, sfx, sfxOn, cfg) + plan (HpBody.morphPlan). */

import { createFly } from './fx-morph-fly.mjs';
import { createMore } from './fx-morph-more.mjs';
import { drawLogo } from './hp-brand.mjs';

export function createMorph(env) {
    const { ctx, W, H } = env;
    const TAU = Math.PI * 2;
    const FULL = { x: 0, y: 0, w: W, h: H };
    const viewNow = () => (env.view && env.view()) || FULL;
    const clamp01 = t => t < 0 ? 0 : t > 1 ? 1 : t;
    const lerp = (a, b, k) => a + (b - a) * k;
    const easeIn = t => t * t, easeOut = t => 1 - (1 - t) * (1 - t);
    const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const easeOutBack = t => { const c = 1.7; t = clamp01(t) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };
    const rgb = hex => { const n = parseInt(String(hex || '#ffffff').slice(1), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const rgba = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };
    // số ngẫu nhiên có hạt giống (mỗi lượt một hạt) - mảnh vỡ / vết nứt không đổi giữa các khung
    function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

    let person = env.person();
    let fx = null;
    // canvas phụ dùng lại: oc = người nhuộm (mỗi khung) · st = tượng / lưới khối (chụp một lần) · tiny = bản thu nhỏ đọc alpha
    const mk = (read = false) => { const c = document.createElement('canvas'); c.width = c.height = 8; return { c, x: c.getContext('2d', read ? { willReadFrequently: true } : undefined) }; };
    // TINY / QR: canvas ĐỌC điểm ảnh (CPU) - chỉ nhận ảnh nhỏ đã thu từ canvas GPU, không bao giờ vẽ thẳng người (WebGL) vào.
    const OC = mk(), ST = mk(), CK = mk(), TINY = mk(true), QR = mk(true);
    const OS = 0.5;

    // ---------- hình học ----------
    function geom() {
        const v = viewNow(), bottom = v.y + v.h;
        const feet = person.feet || { x: W / 2, y: H * 0.86 }, head = person.head || { x: W / 2, y: H * 0.3 };
        let floorY = Math.min(feet.y, bottom);
        let full = feet.y < bottom - 12;                       // thấy cả chân (không thì camera nửa người: chân khuất dưới mép)
        // có dáng người (MediaPipe Pose): cổ chân / mũi chân thật = mặt sàn - mặt nạ tách nền hay dính bóng / thảm tới mép dưới
        const L = env.pose ? env.pose() : null;
        if (L) {
            const ys = [27, 28, 31, 32].filter(i => L[i] && (L[i].v == null || L[i].v >= 0.5)).map(i => L[i].y);
            const fy = ys.length ? Math.max(...ys) : Infinity;
            if (fy < bottom - 8 && fy > head.y + 200) { floorY = fy + 6; full = true; }
        }
        const ph = Math.max(200, floorY - head.y);
        const unit = full ? ph : ph / 0.6;                     // chiều cao CẢ người ước lượng
        return { v, bottom, feet, head, floorY, full, ph, unit, cx: feet.x, w: Math.max(80, person.w || ph * 0.35) };
    }
    function boxOf(g) {
        const hw = Math.max(g.w * 0.62, g.ph * 0.3);
        return { x0: g.cx - hw, x1: g.cx + hw, y0: g.head.y - g.ph * 0.06, y1: g.floorY + 6 };
    }

    // ---------- 🧍 người ----------
    function drawPersonPlain(dx = 0, dy = 0, alpha = 1) {
        if (!person.ready || !person.img || !person.M || alpha <= 0) return;
        const M = person.M;
        ctx.save();
        ctx.globalAlpha *= alpha;
        if (dx || dy) ctx.translate(dx, dy);
        ctx.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
        ctx.drawImage(person.img, 0, 0);
        ctx.restore();
    }
    // Vẽ người (đang sống) vào canvas phụ C theo khung box, tỉ lệ sc; filter = bộ lọc CSS (tuỳ chọn). Trả khung kèm cỡ canvas.
    function snapInto(C, box, sc, filter) {
        if (!person.ready || !person.img || !person.M) return null;
        const ow = Math.max(8, Math.ceil((box.x1 - box.x0) * sc)), oh = Math.max(8, Math.ceil((box.y1 - box.y0) * sc));
        if (C.c.width !== ow || C.c.height !== oh) { C.c.width = ow; C.c.height = oh; } else C.x.clearRect(0, 0, ow, oh);
        const M = person.M, x = C.x;
        x.setTransform(sc, 0, 0, sc, -box.x0 * sc, -box.y0 * sc);
        x.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
        if (filter) x.filter = filter;
        x.drawImage(person.img, 0, 0);
        if (filter) x.filter = 'none';
        x.setTransform(1, 0, 0, 1, 0, 0);
        return { ...box, ow, oh, sc };
    }
    const blitBox = (C, b, alpha = 1) => { if (!b) return; ctx.save(); ctx.globalAlpha *= alpha; ctx.drawImage(C.c, 0, 0, b.ow, b.oh, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); ctx.restore(); };
    // Đọc alpha thu nhỏ (cw × ch) của canvas C - null nếu canvas bị "bẩn" (không đọc được điểm ảnh).
    function alphaMap(C, cw, ch) {
        try {
            TINY.c.width = cw; TINY.c.height = ch;
            TINY.x.clearRect(0, 0, cw, ch);
            TINY.x.drawImage(C.c, 0, 0, cw, ch);
            const d = TINY.x.getImageData(0, 0, cw, ch).data, out = new Uint8Array(cw * ch);
            for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3];
            return out;
        } catch (_) { return null; }
    }
    // Rơi tự do + nảy MỘT lần + trượt chậm dần, tính theo thời gian t (giây) từ lúc bắt đầu rơi.
    const GRAV = 4200;
    function fall(p, t) {
        if (t <= 0) return { x: p.x, y: p.y, r: p.r, rest: false };
        const fy = p.fy, a = GRAV, vy = p.vy;
        const t1 = (-vy + Math.sqrt(Math.max(0, vy * vy + 2 * a * Math.max(0, fy - p.y)))) / a;
        if (t < t1) return { x: p.x + p.vx * t, y: p.y + vy * t + a * t * t / 2, r: p.r + p.vr * t, rest: false };
        const x1 = p.x + p.vx * t1, r1 = p.r + p.vr * t1, v2 = (vy + a * t1) * p.bounce, t2 = 2 * v2 / a, u = t - t1;
        const hop = u < t2 ? v2 * u - a * u * u / 2 : 0;
        const k = 1 - Math.exp(-u * 4);
        return { x: x1 + p.vx * 0.35 * k, y: fy - hop, r: r1 + p.vr * 0.25 * k, rest: u >= t2 };
    }

    // ---------- 🔊 tiếng theo mốc (mốc đã qua > 0,4 s - tua soi - bỏ qua) ----------
    function cue(f, e, k, at, fn) {
        if (e >= at && !f.cue.has(k)) { f.cue.add(k); if (e - at < 400 && env.sfx && env.sfxOn && env.sfxOn(f.sc)) fn(env.sfx, (env.cfg().sfxVolume ?? 0.7)); }
    }
    // rung màn: cường độ mạnh tại mốc at, tắt dần trong dur ms
    const shakeAt = (f, e, at, dur, amp) => (f.sc.shake && e >= at && e < at + dur ? amp * (1 - (e - at) / dur) : 0);
    // 🐉 Bay chưởng: vẽ ở file riêng (cảnh 3 lớp + hào quang + 3 kiểu ra đòn)
    const fly = createFly({ ctx, W, H, person: () => person, cue, shakeAt, view: viewNow,
        want: () => ((env.cfg && env.cfg().scripts) || []).some(sc => sc.style === 'fly') });

    // =====================================================================================================================
    // 🧊 ĐÓNG BĂNG (clip 5, phân tích 2026-10-28): gió tuyết thổi NGANG từ trái sang → băng lan dần từ phía gió tới (trái → phải)
    // → tượng băng PHA LÊ (trắng xanh, vân nứt như kính khắp người, viền sáng) đứng yên waitSec giây → tan rã: nổ tung thành mảnh kính
    // + khói băng trắng, mảnh rơi đầy sàn → người hiện lại.
    // =====================================================================================================================
    const ICE_FILTER = 'grayscale(1) brightness(1.28) contrast(1.45)';
    // Nhuộm băng lên canvas người (C, khung b): xanh băng trên → trắng dưới.
    function iceTint(C, b, col) {
        const x = C.x;
        x.globalCompositeOperation = 'source-atop';
        const gr = x.createLinearGradient(0, 0, 0, b.oh);
        gr.addColorStop(0, rgba(col, 0.62)); gr.addColorStop(0.5, rgba(col, 0.5)); gr.addColorStop(1, 'rgba(232,247,255,.55)');
        x.fillStyle = gr; x.fillRect(0, 0, b.ow, b.oh);
        x.globalCompositeOperation = 'source-over';
    }
    // Lưới nứt pha lê (toạ độ 0..1 trong khung tượng) = đúng các cạnh mảnh vỡ sau này → nứt và vỡ khớp nhau.
    function iceNet(f, b) {
        const R = f.rand, cols = 7 + f.sc.power * 2, rows = Math.max(6, Math.round(cols * (b.y1 - b.y0) / (b.x1 - b.x0)));
        const P = [];
        for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
            const edge = r === 0 || c === 0 || r === rows || c === cols;
            P.push([(c + (edge ? 0 : (R() - 0.5) * 0.85)) / cols, (r + (edge ? 0 : (R() - 0.5) * 0.85)) / rows]);
        }
        const at = (c, r) => P[r * (cols + 1) + c], tris = [];
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            const q = [at(c, r), at(c + 1, r), at(c + 1, r + 1), at(c, r + 1)];
            for (const t of (R() < 0.5 ? [[q[0], q[1], q[2]], [q[0], q[2], q[3]]] : [[q[0], q[1], q[3]], [q[1], q[2], q[3]]])) tris.push(t);
        }
        return { cols, rows, tris };
    }
    // Vân nứt: mỗi mặt tam giác sáng / tối khác nhau (mặt cắt pha lê) + cạnh trắng mảnh, cạnh xanh đậm lệch 1 px (chiều sâu).
    const FACET = new Map();     // 'w x h' → canvas vân nứt đã vẽ (xoá ở iceStart)
    function iceFacets(C, b, net, alpha) {
        const key = b.ow + 'x' + b.oh;
        let fc = FACET.get(key);
        if (!fc) { fc = document.createElement('canvas'); fc.width = b.ow; fc.height = b.oh; facetDraw(fc.getContext('2d'), b.ow, b.oh, net); FACET.set(key, fc); }
        const x = C.x;
        x.globalCompositeOperation = 'source-atop'; x.globalAlpha = alpha;
        x.drawImage(fc, 0, 0);
        x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    }
    function facetDraw(x, w, h, net) {
        const alpha = 1;
        net.tris.forEach((t, i) => {
            const v = ((i * 7919) % 100) / 100;
            x.fillStyle = v < 0.5 ? `rgba(255,255,255,${0.3 * v * alpha})` : `rgba(20,70,140,${0.24 * (v - 0.5) * alpha})`;
            x.beginPath(); x.moveTo(t[0][0] * w, t[0][1] * h); x.lineTo(t[1][0] * w, t[1][1] * h); x.lineTo(t[2][0] * w, t[2][1] * h); x.closePath(); x.fill();
        });
        const lw = Math.max(1, w / 260);
        for (const [dx, col, a] of [[lw, '30,80,150', 0.28], [0, '255,255,255', 0.42]]) {
            x.strokeStyle = `rgba(${col},${a * alpha})`; x.lineWidth = lw;
            x.beginPath();
            for (const t of net.tris) { x.moveTo(t[0][0] * w + dx, t[0][1] * h + dx); x.lineTo(t[1][0] * w + dx, t[1][1] * h + dx); x.lineTo(t[2][0] * w + dx, t[2][1] * h + dx); }
            x.stroke();
        }
    }
    // Viền sáng (rim light) phía trên trái của tượng: bản trắng của tượng trừ đi chính nó dời xuống phải → còn dải mép.
    function iceRim(b) {
        if (CK.c.width !== b.ow || CK.c.height !== b.oh) { CK.c.width = b.ow; CK.c.height = b.oh; } else CK.x.clearRect(0, 0, b.ow, b.oh);
        const x = CK.x, d = Math.max(2, b.ow / 120);
        x.drawImage(ST.c, 0, 0);
        x.globalCompositeOperation = 'source-in'; x.fillStyle = '#ffffff'; x.fillRect(0, 0, b.ow, b.oh);
        x.globalCompositeOperation = 'destination-out'; x.drawImage(ST.c, d, d);
        x.globalCompositeOperation = 'source-over';
        ST.x.globalCompositeOperation = 'lighter'; ST.x.globalAlpha = 0.7; ST.x.drawImage(CK.c, 0, 0);
        ST.x.globalAlpha = 1; ST.x.globalCompositeOperation = 'source-over';
    }
    function iceStart(f) { f.shards = null; f.mist = []; f.wind = []; f.windAcc = 0; f.net = null; f.statue = null; f.atlas = null; f.burst = false; FACET.clear(); }
    // Tượng băng tĩnh (chụp lúc băng phủ kín) - canvas ST.
    function iceStatue(f, g) {
        const b = snapInto(ST, boxOf(g), 0.75, ICE_FILTER);
        if (!b) return null;
        if (!f.net) f.net = iceNet(f, b);
        iceTint(ST, b, f.sc.color);
        iceFacets(ST, b, f.net, 1);
        iceRim(b);
        return b;
    }
    function makeShards(f, g, b) {
        const R = f.rand, net = f.net, am = alphaMap(ST, net.cols * 3, net.rows * 3);
        const bw = b.x1 - b.x0, bh = b.y1 - b.y0, mx = (b.x0 + b.x1) / 2, my = b.y0 + bh * 0.45;
        const out = [];
        for (const tri of net.tris) {
            const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
            if (am) { const ax = Math.min(net.cols * 3 - 1, Math.floor(cx * net.cols * 3)), ay = Math.min(net.rows * 3 - 1, Math.floor(cy * net.rows * 3)); if (am[ay * net.cols * 3 + ax] < 60) continue; }
            const sx = b.x0 + cx * bw, sy = b.y0 + cy * bh;
            const pts = tri.map(([u, v]) => [b.x0 + u * bw - sx, b.y0 + v * bh - sy]);
            // nổ tung ra mọi phía + đẩy theo chiều gió (sang phải), rồi rơi
            const dx = sx - mx, dy = sy - my, d = Math.hypot(dx, dy) || 1, burst = 380 + R() * 620;
            out.push({ pts, x: sx, y: sy, vx: dx / d * burst + 260 + (R() - 0.5) * 240, vy: dy / d * burst * 0.6 - 260 - R() * 420,
                r: 0, vr: (R() - 0.5) * 12, fy: g.floorY - R() * g.ph * 0.04, bounce: 0.22 + R() * 0.15, delay: R() * 70, sh: R() * 0.4 });
        }
        return out;
    }
    // Atlas mảnh vỡ (đo 2026-10-28: 250-400 mảnh × (clip + ảnh tượng + fill + stroke) mỗi khung = 🧊 nặng nhất nhóm): mỗi mảnh vẽ
    // MỘT lần vào ô riêng của một canvas lớn (ảnh tượng cắt theo tam giác + loé kính + viền sáng), mỗi khung chỉ 1 drawImage xoay.
    function shardAtlas(shards, b) {
        const bw = b.x1 - b.x0, bh = b.y1 - b.y0, PAD = 3, AW = 2048;
        let x = 0, y = 0, rowH = 0;
        for (const s of shards) {
            const xs = s.pts.map(p => p[0]), ys = s.pts.map(p => p[1]);
            s.ax = Math.floor(Math.min(...xs)) - PAD; s.ay = Math.floor(Math.min(...ys)) - PAD;
            s.aw = Math.ceil(Math.max(...xs)) - s.ax + PAD; s.ah = Math.ceil(Math.max(...ys)) - s.ay + PAD;
            if (x + s.aw > AW) { x = 0; y += rowH; rowH = 0; }
            s.ox = x; s.oy = y; x += s.aw; rowH = Math.max(rowH, s.ah);
        }
        const c = document.createElement('canvas'); c.width = AW; c.height = Math.max(8, y + rowH);
        return { c, a: c.getContext('2d'), b, bw, bh, i: 0, shards };
    }
    // vẽ tiếp n mảnh vào atlas (gọi mỗi khung lúc tượng đứng yên - dựng cả 300 mảnh một lúc là gai 175 ms, đo 2026-10-28); n = Infinity = vẽ hết
    function shardAtlasStep(A, n) {
        const { a, b, bw, bh, shards } = A;
        for (let k = 0; k < n && A.i < shards.length; k++, A.i++) {
            const s = shards[A.i];
            a.save(); a.translate(s.ox - s.ax, s.oy - s.ay);
            a.beginPath(); a.moveTo(s.pts[0][0], s.pts[0][1]); a.lineTo(s.pts[1][0], s.pts[1][1]); a.lineTo(s.pts[2][0], s.pts[2][1]); a.closePath();
            a.save(); a.clip();
            a.drawImage(ST.c, 0, 0, b.ow, b.oh, -(s.x - b.x0), -(s.y - b.y0), bw, bh);
            a.fillStyle = `rgba(255,255,255,${0.12 + 0.3 * s.sh})`; a.fill();       // mặt kính loé (cố định theo mảnh)
            a.restore();
            a.strokeStyle = 'rgba(240,252,255,.85)'; a.lineWidth = 1.6; a.stroke();
            a.restore();
        }
        return A.i >= shards.length;
    }
    function drawShard(s, pos, atlas, alpha) {
        ctx.setTransform(1, 0, 0, 1, pos.x + fx.sx, pos.y + fx.sy); ctx.rotate(pos.r);
        ctx.globalAlpha = alpha;
        ctx.drawImage(atlas.c, s.ox, s.oy, s.aw, s.ah, s.ax, s.ay, s.aw, s.ah);
        ctx.globalAlpha = 1;
    }
    // ❄ tuyết đọng quanh chân (lớp băng dưới sàn)
    function frost(g, k, col) {
        if (k <= 0) return;
        ctx.save(); ctx.translate(g.cx + fx.sx, g.floorY + fx.sy); ctx.scale(1, 0.22);
        const r = Math.max(g.w * 1.2, g.ph * 0.38) * (0.4 + 0.6 * k);
        const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        gr.addColorStop(0, `rgba(255,255,255,${0.8 * k})`); gr.addColorStop(0.55, rgba(col, 0.42 * k)); gr.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.restore();
    }
    // 🌬 gió tuyết thổi ngang từ trái: vệt gió dài, bông tuyết, làn hơi lạnh mờ
    function windStep(f, g, rate, dt) {
        const R = Math.random, top = g.head.y - g.ph * 0.25, bot = g.floorY + 10;
        f.windAcc += rate * dt;
        while (f.windAcc >= 1) {
            f.windAcc -= 1;
            const k = R(), y = top + R() * (bot - top);
            f.wind.push(k < 0.55 ? { k: 'flake', x: g.v.x - 20, y, vx: 900 + R() * 900, vy: (R() - 0.3) * 140, r: 1.5 + R() * 3.5, ph: R() * TAU }
                : k < 0.92 ? { k: 'streak', x: g.v.x - 60, y, vx: 1500 + R() * 1200, vy: (R() - 0.4) * 80, l: 40 + R() * 110, a: 0.35 + R() * 0.45 }
                : { k: 'gust', x: g.v.x - 300, y, vx: 700 + R() * 500, vy: 0, l: 260 + R() * 260, h: 30 + R() * 50 });
        }
        const right = g.v.x + g.v.w + 300;
        ctx.save();
        for (const p of f.wind) {
            p.x += p.vx * dt; p.y += p.vy * dt;
            if (p.k === 'flake') { p.y += Math.sin(p.x * 0.01 + p.ph) * 0.8; ctx.fillStyle = 'rgba(245,252,255,.95)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); }
            else if (p.k === 'streak') {
                const gr = ctx.createLinearGradient(p.x - p.l, 0, p.x, 0); gr.addColorStop(0, 'rgba(230,246,255,0)'); gr.addColorStop(1, `rgba(240,250,255,${p.a})`);
                ctx.strokeStyle = gr; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x - p.l, p.y - p.vy * 0.02); ctx.lineTo(p.x, p.y); ctx.stroke();
            } else {
                const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.l);
                gr.addColorStop(0, 'rgba(225,242,255,.22)'); gr.addColorStop(1, 'rgba(225,242,255,0)');
                ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, p.h / p.l); ctx.translate(-p.x, -p.y);
                ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, p.l, 0, TAU); ctx.fill(); ctx.restore();
            }
        }
        ctx.restore();
        f.wind = f.wind.filter(p => p.x - (p.l || 0) < right);
    }
    function mistPuff(f, g, n, big) {
        const R = Math.random;
        for (let i = 0; i < n; i++) f.mist.push({ x: g.cx + (R() - 0.5) * g.w * (big ? 1.2 : 0.8), y: g.head.y + R() * g.ph, vx: (R() - 0.3) * (big ? 420 : 200), vy: -30 - R() * 160,
            r: (big ? 60 : 25) + R() * (big ? 90 : 40), t: 0, life: (big ? 1.2 : 0.6) + R() * 0.9, a: big ? 0.5 : 0.3 });
    }
    function drawMist(f, dt) {
        if (!f.mist.length) return;
        ctx.save(); ctx.setTransform(1, 0, 0, 1, fx.sx, fx.sy);
        for (const m of f.mist) {
            m.t += dt; m.x += m.vx * dt; m.y += m.vy * dt; m.vx *= 0.96;
            const k = clamp01(m.t / m.life), r = m.r * (1 + k * 1.6);
            const gr = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, r);
            gr.addColorStop(0, `rgba(238,248,255,${m.a * (1 - k)})`); gr.addColorStop(0.6, `rgba(225,240,252,${m.a * 0.5 * (1 - k)})`); gr.addColorStop(1, 'rgba(225,240,252,0)');
            ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, TAU); ctx.fill();
        }
        ctx.restore();
        f.mist = f.mist.filter(m => m.t < m.life);
    }
    // lấp lánh: dải sáng chéo quét qua tượng + vài ngôi sao loé
    function iceGlint(b, e) {
        const per = 1500, p = (e % per) / per;
        if (p < 0.65) {
            const x = CK.x, w = b.ow, h = b.oh;
            if (CK.c.width !== w || CK.c.height !== h) { CK.c.width = w; CK.c.height = h; } else x.clearRect(0, 0, w, h);
            x.drawImage(ST.c, 0, 0);
            x.globalCompositeOperation = 'source-in';
            const c = lerp(-0.3, 1.3, p / 0.65) * (w + h), gr = x.createLinearGradient(c - w * 0.25, c - w * 0.25 - h * 0.3, c + w * 0.25, c + w * 0.25 - h * 0.3);
            gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
            x.fillStyle = gr; x.fillRect(0, 0, w, h);
            x.globalCompositeOperation = 'source-over';
            ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55;
            ctx.drawImage(CK.c, 0, 0, w, h, b.x0 + fx.sx, b.y0 + fx.sy, b.x1 - b.x0, b.y1 - b.y0); ctx.restore();
        }
        // sao loé 4 cánh
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,255,255,.9)';
        for (let i = 0; i < 5; i++) {
            const s = Math.max(0, Math.sin(e / 260 + i * 2.1)), px = b.x0 + (b.x1 - b.x0) * (0.3 + ((i * 0.37) % 0.4)), py = b.y0 + (b.y1 - b.y0) * (0.15 + i * 0.16), r = 14 * s;
            if (r < 1) continue;
            ctx.beginPath(); ctx.moveTo(px, py - r); ctx.lineTo(px + r * 0.18, py); ctx.lineTo(px, py + r); ctx.lineTo(px - r * 0.18, py); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(px - r, py); ctx.lineTo(px, py + r * 0.18); ctx.lineTo(px + r, py); ctx.lineTo(px, py - r * 0.18); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
    }
    function iceFrame(f, e, dt, g) {
        const P = f.p, col = f.sc.color;
        cue(f, e, 'wind', 0, (X, v) => { X.wind((P.freezeB + 400) / 1000, { vol: v * 0.9 }); X.whoosh(0.9, { vol: v * 0.4, f0: 500, f1: 2200, dir: 1 }); });
        cue(f, e, 'freeze', P.freezeA, (X, v) => { X.iceForm((P.freezeB - P.freezeA) / 1000, { vol: v }); X.freeze((P.freezeB - P.freezeA) / 1000, { vol: v * 0.5 }); });
        cue(f, e, 'crack', P.crack, (X, v) => X.creak((P.shatter - P.crack) / 1000, { vol: v }));
        cue(f, e, 'shatter', P.shatter, (X, v) => { X.shatter(1.2, { vol: v }); X.tinkle(18 + f.sc.power * 6, { vol: v, at: 0.35, spread: 1.4 }); });
        cue(f, e, 'reform', P.reform, (X, v) => X.ding({ vol: v * 0.4 }));
        const sh = shakeAt(f, e, P.shatter, 450, 22) || (e >= P.crack && e < P.shatter ? 3 : 0);
        f.sx = sh ? (Math.random() - 0.5) * sh : 0; f.sy = sh ? (Math.random() - 0.5) * sh * 0.5 : 0;
        // gió mạnh tới lúc đóng băng xong rồi thưa dần
        const windRate = e < P.freezeB ? 90 + f.sc.power * 30 : e < P.freezeB + 900 ? 40 * (1 - (e - P.freezeB) / 900) : 0;
        if (e < P.freezeB) {
            if (e < P.freezeA) drawPersonPlain();
            else {
                // băng lan từ TRÁI (phía gió tới) sang phải, mép băng gợn; phần chưa đóng đã ám lạnh dần
                const k = easeInOut((e - P.freezeA) / (P.freezeB - P.freezeA));
                const b = snapInto(OC, boxOf(g), OS, ICE_FILTER);
                if (!b) return;
                if (!f.net) f.net = iceNet(f, b);
                iceTint(OC, b, col); iceFacets(OC, b, f.net, 0.8);
                const front = lerp(g.cx - g.w * 0.62, g.cx + g.w * 0.62, k), amp = g.w * 0.07;
                drawPersonPlain();
                blitBox(OC, b, 0.28 * k);
                ctx.save(); ctx.beginPath(); ctx.moveTo(b.x0 - 100, b.y0 - 20);
                for (let y = b.y0 - 20; y <= b.y1 + 20; y += 24) ctx.lineTo(front + Math.sin(y * 0.021 + e / 140) * amp + Math.sin(y * 0.057) * amp * 0.5, y);
                ctx.lineTo(b.x0 - 100, b.y1 + 20); ctx.closePath(); ctx.clip();
                blitBox(OC, b);
                ctx.restore();
                // hạt băng loé ngay mép băng đang lan
                ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(235,250,255,.85)';
                for (let i = 0; i < 14; i++) { const y = b.y0 + Math.random() * (b.y1 - b.y0); ctx.beginPath(); ctx.arc(front + Math.sin(y * 0.021 + e / 140) * amp + (Math.random() - 0.5) * 20, y, 1.5 + Math.random() * 3, 0, TAU); ctx.fill(); }
                ctx.restore();
                frost(g, k, col);
            }
            windStep(f, g, windRate, dt);
            return;
        }
        if (!f.statue) f.statue = iceStatue(f, g);
        const b = f.statue;
        if (!b) { drawPersonPlain(); return; }
        if (!f.shards) { f.shards = makeShards(f, g, b); f.atlas = shardAtlas(f.shards, b); }
        if (e < P.shatter) {
            shardAtlasStep(f.atlas, 40);
            // tượng pha lê đứng im waitSec giây: lấp lánh; 0,5 s cuối nứt rạn rung rung
            ctx.drawImage(ST.c, 0, 0, b.ow, b.oh, b.x0 + fx.sx, b.y0 + fx.sy, b.x1 - b.x0, b.y1 - b.y0);
            iceGlint(b, e);
            if (e >= P.crack) {
                const ck = clamp01((e - P.crack) / (P.shatter - P.crack));
                ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * ck;
                ctx.drawImage(ST.c, 0, 0, b.ow, b.oh, b.x0 + fx.sx, b.y0 + fx.sy, b.x1 - b.x0, b.y1 - b.y0); ctx.restore();
            }
            frost(g, 1, col);
            windStep(f, g, windRate, dt);
            drawMist(f, dt);
            return;
        }
        if (!f.burst) { f.burst = true; shardAtlasStep(f.atlas, Infinity); mistPuff(f, g, 14 + f.sc.power * 5, true); }
        // tan rã: mảnh bung ra + khói băng trắng, rơi nảy rồi nằm lấp lánh; tới mốc người hiện lại thì mảnh mờ đi
        const fade = e >= P.reform ? 1 - clamp01((e - P.reform) / (P.end - P.reform - 100)) : 1;
        const t = (e - P.shatter) / 1000;
        frost(g, fade, col);
        if (e >= P.reform) {
            const k = easeOut(clamp01((e - P.reform) / (P.end - P.reform - 150)));
            drawPersonPlain(0, (1 - k) * 18, k);
            if (k < 1) { const ob = snapInto(OC, boxOf(g), OS, ICE_FILTER); if (ob) { iceTint(OC, ob, col); blitBox(OC, ob, (1 - k) * 0.8); } }
        }
        if (fade > 0.02) for (const s of f.shards) drawShard(s, fall(s, t - s.delay / 1000), f.atlas, fade);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (e < P.shatter + 260) { ctx.fillStyle = `rgba(240,250,255,${0.55 * (1 - (e - P.shatter) / 260)})`; ctx.fillRect(0, 0, W, H); }
        windStep(f, g, windRate, dt);
        drawMist(f, dt);
    }

    // =====================================================================================================================
    // 👾 VỠ ĐIỂM ẢNH (clip 3, phân tích 2026-10-28): CHỚP glitch nhiều kiểu ~1,2 s (màu ép bảng 8-bit, ô to dần từng nấc, khung
    // xé ngang, âm bản, sọc quét, 2 màu) → thành LƯỚI KHỐI lập phương 3D viền tối → đổ sụp lăn lộn xuống sàn → nằm vụn waitSec giây →
    // khối XOÁY bay ngược về ghép lại → lưới khối → điểm ảnh màu mịn dần → người thật.
    // =====================================================================================================================
    // bảng 16 màu kiểu máy 8-bit
    const PAL = ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436',
        '#29adff', '#83769c', '#ff77a8', '#ffccaa'].map(h => rgb(h));
    function nearest(r, g, b) {
        let best = 0, bd = 1e9;
        for (let i = 0; i < PAL.length; i++) { const p = PAL[i], d = (p[0] - r) ** 2 * 0.3 + (p[1] - g) ** 2 * 0.59 + (p[2] - b) ** 2 * 0.11; if (d < bd) { bd = d; best = i; } }
        return PAL[best];
    }
    // Ép ảnh nhỏ trong canvas C về bảng màu theo kiểu: 'pal' thường · 'inv' âm bản · 'mono' 2 màu tím xanh / hồng · 'scan' sọc tối từng hàng.
    // Đọc điểm ảnh không được (canvas bẩn) → để nguyên màu.
    // Đọc / ghi điểm ảnh qua canvas RIÊNG (QR, willReadFrequently, cỡ nhỏ): getImageData thẳng trên OC / ST mỗi 80 ms làm Chrome tự
    // chuyển OC / ST sang CPU → mỗi lần snapInto vẽ người (canvas WebGL của matte) vào là đọc ngược CẢ khung về CPU
    // (NPC đo 2026-11-03: 👾 / 🧊 khựng 80-240 ms). OC / ST giữ trên GPU, chỉ ảnh nhỏ đã thu mới đi qua CPU. Trả mảng điểm ảnh đã ép màu.
    function quantize(C, mode) {
        const w = C.c.width, h = C.c.height;
        if (QR.c.width !== w || QR.c.height !== h) { QR.c.width = w; QR.c.height = h; } else QR.x.clearRect(0, 0, w, h);
        QR.x.drawImage(C.c, 0, 0);
        let im;
        try { im = QR.x.getImageData(0, 0, w, h); } catch (_) { return null; }
        const d = im.data;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 110) { d[i + 3] = 0; continue; }
            d[i + 3] = 255;
            let r = d[i], g = d[i + 1], b = d[i + 2];
            if (mode === 'inv') { r = 255 - r; g = 255 - g; b = 255 - b; }
            let p;
            if (mode === 'mono') p = (r * 0.3 + g * 0.59 + b * 0.11) > 95 ? PAL[14] : PAL[1];
            else p = nearest(r, g, b);
            let k = 1;
            if (mode === 'scan' && Math.floor(i / 4 / w) % 2) k = 0.55;
            d[i] = p[0] * k; d[i + 1] = p[1] * k; d[i + 2] = p[2] * k;
        }
        QR.x.putImageData(im, 0, 0);
        C.x.clearRect(0, 0, w, h);
        C.x.drawImage(QR.c, 0, 0);
        return d;
    }
    const pixelSize = (f, g) => Math.max(9, Math.round(g.unit / (34 + f.sc.power * 9)));
    // Vẽ người thô (ô bs px sân khấu) theo kiểu glitch.
    const QUANT_MS = 80;
    function pixelLive(g, bs, mode) {
        const f = fx, now = performance.now(), key = bs + ':' + mode;
        let b;
        if (f.qb && f.qkey === key && now - f.qat < QUANT_MS) b = f.qb;      // dùng lại khung đã ép màu
        else {
            b = snapInto(OC, boxOf(g), 1 / Math.max(1, bs));
            if (!b) return;
            if (bs > 1.5 && mode !== 'raw') quantize(OC, mode);
            f.qb = b; f.qkey = key; f.qat = now;
        }
        ctx.save(); ctx.imageSmoothingEnabled = false;
        const dw = b.ow * bs, dh = b.oh * bs;
        if (mode === 'tear') {
            // xé ngang: từng dải lệch trái phải ngẫu nhiên + bóng ma lệch màu
            const strip = Math.max(1, Math.round(3 + Math.random() * 4));
            ctx.globalAlpha = 0.45; ctx.drawImage(OC.c, 0, 0, b.ow, b.oh, b.x0 - bs * 1.5, b.y0, dw, dh); ctx.globalAlpha = 1;
            for (let r = 0; r < b.oh; r += strip) {
                const h = Math.min(strip, b.oh - r), off = Math.random() < 0.35 ? (Math.random() - 0.5) * bs * 6 : 0;
                ctx.drawImage(OC.c, 0, r, b.ow, h, b.x0 + off, b.y0 + r * bs, dw, h * bs);
            }
        } else ctx.drawImage(OC.c, 0, 0, b.ow, b.oh, b.x0, b.y0, dw, dh);
        ctx.restore();
    }
    // Lịch chớp glitch (phần của đoạn pixA → pixB): [mốc 0..1, kiểu, cỡ ô so với ô cuối] - 'real' = loé lại người thật 1 nhịp.
    const GLITCH = [[0, 'pal', 0.22], [0.07, 'tear', 0.22], [0.13, 'real', 0], [0.18, 'pal', 0.32], [0.25, 'inv', 0.32], [0.31, 'pal', 0.45], [0.38, 'scan', 0.45],
        [0.45, 'real', 0], [0.49, 'tear', 0.6], [0.56, 'pal', 0.6], [0.63, 'mono', 0.75], [0.7, 'pal', 0.75], [0.77, 'inv', 0.9], [0.83, 'tear', 1], [0.9, 'pal', 1]];
    const glitchAt = k => { let s = GLITCH[0]; for (const x of GLITCH) if (k >= x[0]) s = x; return s; };
    // Lưới khối (chụp một lần lúc hết chớp): màu ép bảng 8-bit, mỗi khối 3 mặt (trước / trên sáng / phải tối).
    function pixelGrid(f, g) {
        const bs = pixelSize(f, g), b = snapInto(ST, boxOf(g), 1 / bs);
        if (!b) return null;
        const d = quantize(ST, 'pal');
        const R = f.rand, blocks = [];
        const cs = (c, k) => `rgb(${Math.min(255, Math.round(c[0] * k))},${Math.min(255, Math.round(c[1] * k))},${Math.min(255, Math.round(c[2] * k))})`;
        for (let r = 0; r < b.oh; r++) for (let c = 0; c < b.ow; c++) {
            let col = [90, 90, 110];
            if (d) { const i = (r * b.ow + c) * 4; if (d[i + 3] < 110) continue; col = [d[i], d[i + 1], d[i + 2]]; }
            const lift = (x, k) => [x[0] + (255 - x[0]) * k, x[1] + (255 - x[1]) * k, x[2] + (255 - x[2]) * k];
            const hx = b.x0 + c * bs, hy = b.y0 + r * bs, rowUp = 1 - r / b.oh;
            // dưới đổ trước (đổ sụp như tường gạch), lúc ghép lại thì dưới về trước, xoáy cùng một chiều
            blocks.push({ c, row: r, front: cs(col, 0.85), top: cs(lift(col, 0.35), 1), side: cs(col, 0.5), hx, hy, x: hx, y: hy,
                vx: (R() - 0.5) * 420 + (hx - g.cx) * 0.9, vy: -R() * 260, r: 0, vr: (R() - 0.5) * 9,
                fy: g.floorY - bs - R() * Math.min(g.ph * 0.1, bs * 3.5) * (0.3 + rowUp), bounce: 0.25 + R() * 0.2,
                delay: rowUp * 420 + R() * 140, back: (1 - rowUp) * 480 + R() * 180, ph: R() * TAU });
        }
        // atlas khối: mỗi khối vẽ MỘT lần (3 mặt + viền) vào ô (bs + dd)², mỗi khung chỉ 1 drawImage xoay (đo 2026-10-28: 352 khối × 6 lệnh/khung = 👾 nặng)
        const dd = Math.ceil(bs * 0.3), cell = bs + dd + 2, per = Math.max(1, Math.floor(2048 / cell));
        const atlas = document.createElement('canvas'); atlas.width = per * cell; atlas.height = Math.ceil(blocks.length / per) * cell;
        const a = atlas.getContext('2d'), h = bs / 2;
        blocks.forEach((p, i) => {
            p.ox = (i % per) * cell; p.oy = Math.floor(i / per) * cell;
            a.setTransform(1, 0, 0, 1, p.ox + h + 1, p.oy + h + dd + 1);
            a.fillStyle = p.top; a.beginPath(); a.moveTo(-h, -h); a.lineTo(-h + dd, -h - dd); a.lineTo(h + dd, -h - dd); a.lineTo(h, -h); a.closePath(); a.fill();
            a.fillStyle = p.side; a.beginPath(); a.moveTo(h, -h); a.lineTo(h + dd, -h - dd); a.lineTo(h + dd, h - dd); a.lineTo(h, h); a.closePath(); a.fill();
            a.fillStyle = p.front; a.fillRect(-h, -h, bs, bs);
            a.strokeStyle = 'rgba(0,0,0,.65)'; a.lineWidth = Math.max(1, bs * 0.08); a.strokeRect(-h, -h, bs, bs);
            a.fillStyle = 'rgba(255,255,255,.18)'; a.fillRect(-h, -h, bs, bs * 0.14);
        });
        return { b, bs, blocks, atlas, cell, dd };
    }
    // khối lập phương 3D từ atlas: tâm khối (x + h, y + h), xoay rot
    function drawCube(p, x, y, rot, G, alpha) {
        const h = G.bs / 2;
        ctx.setTransform(1, 0, 0, 1, x + h + fx.sx, y + h + fx.sy);
        if (rot) ctx.rotate(rot);
        ctx.globalAlpha = alpha;
        ctx.drawImage(G.atlas, p.ox, p.oy, G.cell, G.cell, -h - 1, -h - G.dd - 1, G.cell, G.cell);
    }
    function pixelFrame(f, e, dt, g) {
        const P = f.p;
        f.sx = 0; f.sy = 0;
        // tiếng: mỗi nhịp chớp một tiếng "bíp" 8-bit, đổ sụp lộp độp, ghép lại arpeggio đi lên
        if (e >= P.pixA && e < P.pixB) {
            const gi = GLITCH.indexOf(glitchAt((e - P.pixA) / (P.pixB - P.pixA)));
            cue(f, e, 'gl' + gi, P.pixA + GLITCH[gi][0] * (P.pixB - P.pixA), (X, v) => { X.glitch(0.09 + Math.random() * 0.06, { vol: v }); X.chip([[[880, 660, 1320, 440, 990][gi % 5], 0.04]], { vol: v * 0.35 }); });
        }
        cue(f, e, 'grid', P.pixB, (X, v) => { X.clack(6, { vol: v * 0.6, spread: 0.15 }); X.chip([[523, 0.06], [392, 0.06], [262, 0.1]], { vol: v * 0.45 }); });
        cue(f, e, 'fall', P.fall, (X, v) => { X.clack(30 + f.sc.power * 10, { vol: v, spread: 1.1 }); X.thud(0.45, { vol: v * 0.5, at: 0.4 }); });
        cue(f, e, 'build', P.rebuild, (X, v) => { X.swirl((P.rebuildB - P.rebuild) / 1000, { vol: v }); X.clack(14, { vol: v * 0.5, at: (P.rebuildB - P.rebuild) / 1000 * 0.6, spread: 0.5 });
            X.chip([[392, 0.08], [523, 0.08], [659, 0.08], [784, 0.08], [1046, 0.08], [1318, 0.16]], { vol: v * 0.5 }); });
        cue(f, e, 'done', P.end - 200, (X, v) => X.ding({ vol: v * 0.45 }));
        const BS = pixelSize(f, g);
        ctx.imageSmoothingEnabled = true;
        if (e < P.pixA) { drawPersonPlain(); return; }
        if (e < P.pixB) {
            const [, mode, sz] = glitchAt((e - P.pixA) / (P.pixB - P.pixA));
            if (mode === 'real') drawPersonPlain(); else pixelLive(g, Math.max(2, Math.round(BS * sz)), mode);
            return;
        }
        if (!f.grid) f.grid = pixelGrid(f, g);
        const G = f.grid;
        if (!G) { drawPersonPlain(); return; }
        const depA = P.rebuildB + 250;
        if (e >= depA) {
            // điểm ảnh màu mịn dần → người thật
            // mịn dần: ô < 6 px thì canvas ép màu quá lớn (quantize quét mọi điểm ảnh 60-100 ms/khung - đo 2026-10-28) → vẽ thô không ép màu
            const k = clamp01((e - depA) / (P.end - depA - 150));
            const bs = Math.round(BS * (1 - easeOut(k)));
            if (bs <= 1) drawPersonPlain(); else if (bs < 6) pixelLive(g, bs, 'raw'); else pixelLive(g, bs, 'pal');
            return;
        }
        let list;
        if (e < P.fall) list = G.blocks.map(p => [p, p.hx, p.hy, 0]);
        else if (e < P.rebuild) {
            const tF = (e - P.fall) / 1000;
            list = G.blocks.map(p => { const q = fall(p, tF - p.delay / 1000); return [p, q.x, q.y, q.r]; });
        } else {
            // xoáy bay về: đi theo đường xoắn quanh người rồi khớp vào ô cũ (khối dưới về trước)
            const span = P.rebuildB - P.rebuild, tE = (P.rebuild - P.fall) / 1000;
            list = G.blocks.map(p => {
                const q = fall(p, tE - p.delay / 1000), k = easeInOut(clamp01((e - P.rebuild - p.back) / Math.max(200, span - 660)));
                const sw = Math.sin(k * Math.PI), a = k * TAU * 0.9 + p.ph, rad = sw * Math.max(g.w * 0.45, G.bs * 6);
                return [p, lerp(q.x, p.hx, k) + Math.cos(a) * rad, lerp(q.y, p.hy, k) + Math.sin(a) * rad * 0.45 - sw * G.bs * 2, q.r * (1 - k)];
            });
        }
        // vẽ dưới → trên, trái → phải (khối trên che mặt trên của khối dưới)
        list.sort((A, B) => B[2] - A[2] || A[1] - B[1]);
        for (const [p, x, y, r] of list) drawCube(p, x, y, r, G, 1);
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    }

    // =====================================================================================================================
    // ⚡ SÉT ĐÁNH
    // =====================================================================================================================
    // ☁️ Mây dông: kết cấu vẽ MỘT lần mỗi lượt vào canvas phụ (90 cụm mây mềm, đỉnh sáng - đáy tối phẳng như mây dông thật) + bản
    // "được sét rọi sáng" để chớp bên trong mây. Mỗi khung chỉ 2-3 lần drawImage.
    const CL = mk(), CLL = mk();
    const CLW = 900, CLH = 430;
    let CLOUD_READY = false;
    function cloudTex(f) {
        const R = rng(0x9e3779b9);          // hạt cố định: mây giống nhau mọi lượt (dựng 1 lần)
        for (const C of [CL, CLL]) { C.c.width = CLW; C.c.height = CLH; C.x.clearRect(0, 0, CLW, CLH); }
        const x = CL.x;
        // thân mây: nhiều cụm nhỏ - tâm sáng lệch lên trên (nắng đỉnh mây), mép sẫm; cụm THẤP vẽ trước, cụm cao chồng lên → đỉnh
        // gồ ghề như súp lơ; mép ngoài cụm nhỏ lởm chởm
        const puffs = [];
        for (let i = 0; i < 150; i++) {
            const u = R(), bulge = Math.sin(Math.PI * (0.08 + 0.84 * u)), edge = i >= 110;
            const px = CLW * (0.08 + 0.84 * u), py = CLH * (0.66 - 0.44 * bulge * Math.pow(R(), edge ? 0.25 : 0.7));
            puffs.push({ px, py, r: (edge ? 14 + 22 * R() : 26 + 44 * R()) * (0.6 + 0.55 * bulge) });
        }
        puffs.sort((p, q) => q.py - p.py);
        for (const { px, py, r } of puffs) {
            const h = 1 - py / CLH, lv = Math.round(30 + 58 * h);
            const gr = x.createRadialGradient(px - r * 0.2, py - r * 0.35, r * 0.05, px, py, r * 1.05);
            gr.addColorStop(0, `rgba(${lv + 64},${lv + 68},${lv + 84},.92)`);
            gr.addColorStop(0.5, `rgba(${lv + 14},${lv + 15},${lv + 26},.86)`);
            gr.addColorStop(0.85, `rgba(${lv},${lv + 1},${lv + 10},.6)`);
            gr.addColorStop(1, `rgba(${lv - 8},${lv - 8},${lv},0)`);
            x.fillStyle = gr; x.beginPath(); x.arc(px, py, r * 1.05, 0, TAU); x.fill();
        }
        // đáy phẳng sẫm (chân mây dông) đè lên các cụm thấp
        for (let i = 0; i < 22; i++) {
            const px = CLW * (0.12 + 0.76 * R()), py = CLH * (0.7 + 0.06 * R()), rx = 80 + 90 * R(), ry = rx * 0.28;
            const gr = x.createRadialGradient(px, py, 0, px, py, rx);
            gr.addColorStop(0, 'rgba(14,15,22,.8)'); gr.addColorStop(0.6, 'rgba(14,15,22,.45)'); gr.addColorStop(1, 'rgba(14,15,22,0)');
            x.save(); x.translate(px, py); x.scale(1, ry / rx); x.translate(-px, -py);
            x.fillStyle = gr; x.beginPath(); x.arc(px, py, rx, 0, TAU); x.fill(); x.restore();
        }
        // vân hơi nước: nhiễu nhiều tầng (ô ngẫu nhiên phóng to mịn) phủ lên mây → bớt trơn bóng
        const noise = (w, h, lo, hi, a0, a1) => {
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            const n = c.getContext('2d'), im = n.createImageData(w, h);
            for (let i = 0; i < w * h; i++) { const v = lo + (hi - lo) * R(); im.data[i * 4] = v; im.data[i * 4 + 1] = v; im.data[i * 4 + 2] = v + 8; im.data[i * 4 + 3] = 255 * (a0 + (a1 - a0) * R()); }
            n.putImageData(im, 0, 0);
            return c;
        };
        x.globalCompositeOperation = 'source-atop';
        x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
        for (const [w, a] of [[12, 0.24], [30, 0.12]]) { x.globalAlpha = a; x.drawImage(noise(w, Math.round(w * CLH / CLW), 10, 150, 1, 1), 0, 0, CLW, CLH); }
        x.globalAlpha = 1;
        // đổ bóng theo chiều cao: đỉnh hửng sáng nhẹ, đáy tối
        const sh = x.createLinearGradient(0, 0, 0, CLH);
        sh.addColorStop(0, 'rgba(190,196,214,.14)'); sh.addColorStop(0.5, 'rgba(60,62,74,0)'); sh.addColorStop(1, 'rgba(4,4,10,.5)');
        x.fillStyle = sh; x.fillRect(0, 0, CLW, CLH);
        // mép mây tơi: khoét nhẹ theo nhiễu
        x.globalCompositeOperation = 'destination-out';
        x.globalAlpha = 0.45; x.drawImage(noise(22, Math.round(22 * CLH / CLW), 0, 0, 0, 0.8), 0, 0, CLW, CLH);
        x.globalAlpha = 1;
        x.globalCompositeOperation = 'source-over';
        // bản rọi sáng: cùng hình mây, ruột trắng xanh từ chỗ phóng sét (giữa đáy)
        CLL.x.drawImage(CL.c, 0, 0);
        CLL.x.globalCompositeOperation = 'source-atop';
        const lt = CLL.x.createRadialGradient(CLW / 2, CLH * 0.62, 10, CLW / 2, CLH * 0.55, CLW * 0.5);
        lt.addColorStop(0, 'rgba(235,240,255,.95)'); lt.addColorStop(0.4, 'rgba(150,170,235,.6)'); lt.addColorStop(1, 'rgba(80,90,140,.15)');
        CLL.x.fillStyle = lt; CLL.x.fillRect(0, 0, CLW, CLH);
        CLL.x.globalCompositeOperation = 'source-over';
    }
    // k 0..1 mây hiện · lit 0..1 sét rọi trong mây. Trả chỗ phóng sét (giữa đáy mây).
    function drawCloud(f, g, e, k, lit) {
        if (k <= 0) return null;
        // dải mây dông PHỦ NGANG đỉnh khung (như clip), dẹt, đáy ngay trên đầu
        const cw = W * 1.35, ch = cw * CLH / CLW * 0.62;
        const bottom = Math.max(g.v.y + ch * 0.45, g.head.y - g.unit * 0.05), cx = W / 2 + Math.sin(e / 1700) * cw * 0.02;
        const y0 = bottom - ch * 0.78 - (1 - k) * ch * 0.35, br = 1 + Math.sin(e / 800) * 0.01;
        ctx.save();
        ctx.globalAlpha = k;
        // lớp sau lệch nhẹ (thêm khối), lớp trước chính
        ctx.save(); ctx.globalAlpha = k * 0.55; ctx.translate(cx + cw * 0.06, y0 - ch * 0.08); ctx.scale(-1.05, 0.95); ctx.drawImage(CL.c, -cw / 2, 0, cw, ch); ctx.restore();
        ctx.drawImage(CL.c, cx - cw * br / 2, y0, cw * br, ch * br);
        if (lit > 0) { ctx.globalAlpha = k * lit; ctx.drawImage(CLL.c, cx - cw * br / 2, y0, cw * br, ch * br); }
        ctx.restore();
        return { x: g.head.x, y: y0 + ch * 0.66 * br, r: g.w * 0.6 };
    }
    // tia sét: dời điểm giữa (6 cấp) + 2-3 nhánh ngắn
    function boltPath(x0, y0, x1, y1, R, rough) {
        let pts = [[x0, y0], [x1, y1]];
        for (let lv = 0; lv < 6; lv++) {
            const nx = [];
            for (let i = 0; i < pts.length - 1; i++) {
                const [ax, ay] = pts[i], [bx, by] = pts[i + 1], l = Math.hypot(bx - ax, by - ay);
                nx.push(pts[i], [(ax + bx) / 2 + (R() - 0.5) * l * rough, (ay + by) / 2 + (R() - 0.5) * l * rough * 0.25]);
            }
            nx.push(pts[pts.length - 1]); pts = nx;
        }
        return pts;
    }
    function makeBolt(f, from, to) {
        const R = Math.random, main = boltPath(from.x, from.y, to.x, to.y, R, 0.55), branches = [];
        for (let i = 0; i < 1 + f.sc.power; i++) {
            const s = main[8 + Math.floor(R() * (main.length - 20))], a = Math.atan2(to.y - from.y, to.x - from.x) + (R() < 0.5 ? -1 : 1) * (0.4 + R() * 0.6);
            const l = Math.hypot(to.x - from.x, to.y - from.y) * (0.15 + R() * 0.2);
            branches.push(boltPath(s[0], s[1], s[0] + Math.cos(a) * l, s[1] + Math.sin(a) * l, R, 0.6));
        }
        return { main, branches };
    }
    function strokePath(pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); }
    function drawBolt(bolt, a, col) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const [w, al, c] of [[44, 0.14, col], [18, 0.4, col], [6, 1, '#ffffff']]) {
            ctx.strokeStyle = c === '#ffffff' ? `rgba(255,255,255,${al * a})` : rgba(c, al * a);
            ctx.lineWidth = w; strokePath(bolt.main);
            ctx.lineWidth = w * 0.5; for (const b of bolt.branches) strokePath(b);
        }
        ctx.restore();
    }

    // ---------- 🦴 dáng người: 33 điểm MediaPipe Pose (env.pose) - không có thì dựng dáng đứng thẳng theo khung người ----------
    // 0 mũi · 2/5 mắt · 7/8 tai · 11/12 vai · 13/14 khuỷu · 15/16 cổ tay · 17/18 út · 19/20 trỏ · 21/22 cái · 23/24 hông · 25/26 gối ·
    // 27/28 cổ chân · 31/32 mũi chân
    const vis = (P, i, m = 0.45) => !!P[i] && (P[i].v == null || P[i].v >= m);
    function synthPose(g) {
        const u = g.unit, hx = g.head.x, Y = k => g.head.y + u * k, sw = Math.min(u * 0.11, g.w * 0.4);
        const P = [];
        const set = (i, x, y) => { P[i] = { x, y, v: 1 }; };
        set(0, hx, Y(0.085));
        for (const [i, d] of [[2, -1], [5, 1]]) set(i, hx + d * u * 0.022, Y(0.066));
        for (const [i, d] of [[7, -1], [8, 1]]) set(i, hx + d * u * 0.045, Y(0.075));
        for (const [s, e, w, pk, ix, th, d] of [[11, 13, 15, 17, 19, 21, -1], [12, 14, 16, 18, 20, 22, 1]]) {
            set(s, hx + d * sw, Y(0.19)); set(e, hx + d * (sw + u * 0.025), Y(0.335)); set(w, hx + d * (sw + u * 0.035), Y(0.465));
            set(pk, hx + d * (sw + u * 0.045), Y(0.51)); set(ix, hx + d * (sw + u * 0.025), Y(0.515)); set(th, hx + d * (sw + u * 0.01), Y(0.49));
        }
        for (const [h, k, a, ft, d] of [[23, 25, 27, 31, -1], [24, 26, 28, 32, 1]]) {
            set(h, hx + d * sw * 0.5, Y(0.53)); set(k, hx + d * sw * 0.48, Y(0.755)); set(a, hx + d * sw * 0.46, Y(0.95)); set(ft, hx + d * sw * 0.7, Y(0.985));
        }
        return P;
    }
    // Dáng thật (nếu có) bù điểm thiếu bằng dáng dựng: camera nửa người không thấy hông → hông = vai dời xuống theo trục người.
    function poseOf(g) {
        const S = synthPose(g), L = env.pose ? env.pose() : null;
        if (!L || !vis(L, 11) || !vis(L, 12)) return { P: S, real: false };
        const P = S.slice();
        for (let i = 0; i < 33; i++) if (vis(L, i)) P[i] = L[i];
        if (!vis(L, 23) || !vis(L, 24)) {
            const sw = Math.hypot(P[12].x - P[11].x, P[12].y - P[11].y), dn = sw * 1.55;
            P[23] = { x: P[11].x + sw * 0.15, y: P[11].y + dn, v: 1 }; P[24] = { x: P[12].x - sw * 0.15, y: P[12].y + dn, v: 1 };
        }
        return { P, real: true };
    }
    const midP = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const dst = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
    // xương dài: thân thắt giữa + 2 núm mỗi đầu (đầu xương thật)
    function bonePath(a, b, w) {
        const L = dst(a, b);
        if (L < 2) return;
        ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
        ctx.beginPath();
        ctx.moveTo(0, -w * 0.3); ctx.quadraticCurveTo(L / 2, -w * 0.16, L, -w * 0.3); ctx.lineTo(L, w * 0.3); ctx.quadraticCurveTo(L / 2, w * 0.16, 0, w * 0.3); ctx.closePath();
        for (const [x, y] of [[0, -0.3], [0, 0.3], [L, -0.3], [L, 0.3]]) { ctx.moveTo(x + w * 0.4, y * w); ctx.arc(x, y * w, w * 0.4, 0, TAU); }
        ctx.fill();
        ctx.restore();
    }
    function skeleton(g) {
        const { P } = poseOf(g);
        const sw = dst(P[11], P[12]), wb = Math.max(5, Math.min(38, sw * 0.11));
        const neck = midP(P[11], P[12]), pel = midP(P[23], P[24]);
        const ax = { x: neck.x - pel.x, y: neck.y - pel.y }, al = Math.hypot(ax.x, ax.y) || 1;
        const up = { x: ax.x / al, y: ax.y / al }, rt = { x: -up.y, y: up.x };          // trục người: lên / phải
        const at = (o, k) => ({ x: o.x + up.x * k, y: o.y + up.y * k });
        const off = (o, d) => ({ x: o.x + rt.x * d, y: o.y + rt.y * d });
        // sọ: canh 2 hốc mắt đúng 2 mắt thật
        // mắt bên TRÁI ẢNH trước (điểm 2 = mắt trái của người = bên phải ảnh khi không lật gương) - không thì sọ lộn ngược
        const [eL, eR] = P[2].x <= P[5].x ? [P[2], P[5]] : [P[5], P[2]], ed = Math.max(dst(eL, eR), sw * 0.16), sa = Math.atan2(eR.y - eL.y, eR.x - eL.x);
        const s = Math.max(ed * 1.25, Math.min(sw * 0.36, ed * 1.6)), em = midP(eL, eR);
        let wq = wb;
        const parts = () => {
            // xương đòn
            bonePath(neck, P[11], wq * 0.75); bonePath(neck, P[12], wq * 0.75);
            // tay: cánh tay + 2 xương cẳng tay song song + ngón
            for (const [sh, el, wr, pk, ix, th] of [[11, 13, 15, 17, 19, 21], [12, 14, 16, 18, 20, 22]]) {
                if (!vis(P, el, 0.3)) continue;
                bonePath(P[sh], P[el], wq);
                if (!vis(P, wr, 0.3)) continue;
                const d = dst(P[el], P[wr]) || 1, n = { x: -(P[wr].y - P[el].y) / d * wq * 0.28, y: (P[wr].x - P[el].x) / d * wq * 0.28 };
                bonePath({ x: P[el].x + n.x, y: P[el].y + n.y }, { x: P[wr].x + n.x, y: P[wr].y + n.y }, wq * 0.55);
                bonePath({ x: P[el].x - n.x, y: P[el].y - n.y }, { x: P[wr].x - n.x, y: P[wr].y - n.y }, wq * 0.45);
                for (const k of [0, 0.33, 0.66, 1]) {
                    const tip = { x: lerp(P[pk].x, P[ix].x, k), y: lerp(P[pk].y, P[ix].y, k) };
                    bonePath(P[wr], { x: P[wr].x + (tip.x - P[wr].x) * 1.5, y: P[wr].y + (tip.y - P[wr].y) * 1.5 }, wq * 0.28);
                }
                bonePath(P[wr], { x: P[wr].x + (P[th].x - P[wr].x) * 1.3, y: P[wr].y + (P[th].y - P[wr].y) * 1.3 }, wq * 0.3);
            }
            // chân: xương đùi + bánh chè + 2 xương cẳng chân + bàn chân
            for (const [hp, kn, an, ft] of [[23, 25, 27, 31], [24, 26, 28, 32]]) {
                if (!vis(P, kn, 0.3)) continue;
                bonePath(P[hp], P[kn], wq * 1.25);
                ctx.beginPath(); ctx.arc(P[kn].x, P[kn].y, wq * 0.55, 0, TAU); ctx.fill();
                if (!vis(P, an, 0.3)) continue;
                const d = dst(P[kn], P[an]) || 1, n = { x: -(P[an].y - P[kn].y) / d * wq * 0.3, y: (P[an].x - P[kn].x) / d * wq * 0.3 };
                bonePath({ x: P[kn].x - n.x, y: P[kn].y - n.y }, { x: P[an].x - n.x, y: P[an].y - n.y }, wq * 0.8);
                bonePath({ x: P[kn].x + n.x * 1.6, y: P[kn].y + n.y * 1.6 }, { x: P[an].x + n.x * 1.6, y: P[an].y + n.y * 1.6 }, wq * 0.4);
                if (vis(P, ft, 0.3)) bonePath(P[an], P[ft], wq * 0.55);
            }
            // cột sống: đốt cổ + 16 đốt tới chậu
            const top = at(neck, al * 0.12), n = 16;
            for (let i = 0; i <= n + 3; i++) {
                const c = i <= 3 ? { x: lerp(top.x, neck.x, i / 3), y: lerp(top.y, neck.y, i / 3) } : { x: lerp(neck.x, pel.x, (i - 3) / n), y: lerp(neck.y, pel.y, (i - 3) / n) };
                ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(Math.atan2(rt.y, rt.x));
                ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-wq * 0.42, -wq * 0.2, wq * 0.84, wq * 0.4, wq * 0.15) : ctx.rect(-wq * 0.42, -wq * 0.2, wq * 0.84, wq * 0.4); ctx.fill();
                ctx.restore();
            }
            // chậu: 2 cánh xương chậu + lỗ
            const hw = Math.max(dst(P[23], P[24]), sw * 0.6);
            for (const d of [-1, 1]) {
                const crest = at(off(pel, d * hw * 0.95), hw * 0.38), hipJ = d < 0 ? P[23] : P[24], pub = at(off(pel, d * hw * 0.12), -hw * 0.4);
                ctx.beginPath(); ctx.moveTo(off(pel, d * hw * 0.1).x, off(pel, d * hw * 0.1).y);
                ctx.quadraticCurveTo(at(off(pel, d * hw * 0.5), hw * 0.62).x, at(off(pel, d * hw * 0.5), hw * 0.62).y, crest.x, crest.y);
                ctx.quadraticCurveTo(off(crest, d * hw * 0.05).x, off(crest, d * hw * 0.05).y - 0, hipJ.x, hipJ.y);
                ctx.quadraticCurveTo(at(hipJ, -hw * 0.3).x, at(hipJ, -hw * 0.3).y, pub.x, pub.y);
                ctx.closePath(); ctx.fill();
            }
        };
        // xương sườn: 7 đôi cong từ cột sống ra, ngắn dần xuống dưới + xương ức
        const ribs = lw => {
            ctx.lineWidth = lw; ctx.lineCap = 'round';
            for (let i = 0; i < 7; i++) {
                const k = 0.1 + i * 0.075, o = at(neck, -al * k), wd = sw * (0.36 + 0.1 * Math.sin((i + 1) / 7.5 * Math.PI));
                for (const d of [-1, 1]) {
                    const c1 = at(off(o, d * wd * 0.85), al * 0.03), c2 = at(off(o, d * wd * 1.1), -al * 0.05), e = at(off(o, d * wd * 0.45), -al * 0.1);
                    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, e.x, e.y); ctx.stroke();
                }
            }
            const s0 = at(neck, -al * 0.08), s1 = at(neck, -al * 0.42);
            ctx.lineWidth = lw * 1.6; ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.stroke();
        };
        // sọ (hệ toạ độ riêng: x theo đường 2 mắt, đơn vị s = nửa bề ngang sọ; hốc mắt ở y = 0)
        const skull = (grow, fillSk) => {
            ctx.save(); ctx.translate(em.x, em.y); ctx.rotate(sa);
            const k = s * grow;
            ctx.beginPath(); ctx.ellipse(0, -0.42 * k, 1.0 * k, 0.98 * k, 0, 0, TAU);
            ctx.moveTo(-0.92 * k, -0.1 * k);
            ctx.bezierCurveTo(-0.95 * k, 0.45 * k, -0.62 * k, 0.62 * k, -0.5 * k, 0.95 * k);
            ctx.quadraticCurveTo(0, 1.22 * k, 0.5 * k, 0.95 * k);
            ctx.bezierCurveTo(0.62 * k, 0.62 * k, 0.95 * k, 0.45 * k, 0.92 * k, -0.1 * k);
            ctx.closePath(); ctx.fill();
            if (fillSk) {
                ctx.fillStyle = 'rgba(2,10,38,.92)';
                for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(d * 0.4 * s, 0.02 * s, 0.29 * s, 0.27 * s, d * 0.15, 0, TAU); ctx.fill(); }
                ctx.beginPath(); ctx.moveTo(0, 0.3 * s); ctx.quadraticCurveTo(-0.16 * s, 0.5 * s, -0.08 * s, 0.56 * s); ctx.lineTo(0, 0.5 * s); ctx.lineTo(0.08 * s, 0.56 * s); ctx.quadraticCurveTo(0.16 * s, 0.5 * s, 0, 0.3 * s); ctx.fill();
                // răng: 2 hàm + kẽ răng
                ctx.strokeStyle = 'rgba(2,10,38,.85)'; ctx.lineWidth = Math.max(1, s * 0.04);
                ctx.beginPath(); ctx.moveTo(-0.38 * s, 0.8 * s); ctx.quadraticCurveTo(0, 0.88 * s, 0.38 * s, 0.8 * s); ctx.stroke();
                for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 0.1 * s, 0.7 * s); ctx.lineTo(i * 0.1 * s, 0.94 * s); ctx.stroke(); }
                // gò má
                ctx.strokeStyle = 'rgba(120,170,230,.5)'; ctx.lineWidth = Math.max(1, s * 0.05);
                for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(d * 0.75 * s, 0.25 * s); ctx.quadraticCurveTo(d * 0.6 * s, 0.45 * s, d * 0.35 * s, 0.38 * s); ctx.stroke(); }
            }
            ctx.restore();
        };
        ctx.save();
        // quầng sáng: vẽ to + mờ, cộng sáng → thân xương trắng xanh
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(110,180,255,.24)'; ctx.strokeStyle = 'rgba(110,180,255,.24)';
        wq = wb * 1.8; parts(); ribs(wb * 0.8); skull(1.1, false);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(226,242,255,.96)'; ctx.strokeStyle = 'rgba(226,242,255,.96)';
        wq = wb; parts(); ribs(wb * 0.32); skull(1, true);
        ctx.restore();
    }
    // X-quang: thân xanh thẫm trong suốt (giữ hình người) + bộ xương sáng
    function xray(f, g) {
        const b = snapInto(OC, boxOf(g), OS, 'grayscale(1) invert(1) contrast(1.5) brightness(.6)');
        if (!b) return;
        const x = OC.x;
        x.globalCompositeOperation = 'source-atop';
        x.fillStyle = 'rgba(14,50,170,.7)'; x.fillRect(0, 0, b.ow, b.oh);
        x.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(0,8,30,.4)'; ctx.fillRect(0, 0, W, H);
        blitBox(OC, b, 0.9);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; blitBox(OC, b, 0.3); ctx.restore();
        skeleton(g);
    }
    // cháy đen: người nhuộm tối (giữ hình) - k 0..1
    function charred(g, k) {
        const b = snapInto(OC, boxOf(g), OS);
        if (!b) return;
        OC.x.globalCompositeOperation = 'source-atop';
        OC.x.fillStyle = `rgba(18,12,8,${0.78 * k})`; OC.x.fillRect(0, 0, b.ow, b.oh);
        OC.x.globalCompositeOperation = 'source-over';
        ctx.save(); ctx.translate(fx.sx, fx.sy); blitBox(OC, b); ctx.restore();
    }
    // cả người phát sáng xanh trắng (khoảnh khắc sét giáng)
    function bodyGlow(g, k) {
        // vẫn thấy rõ người (clip: sáng xanh trắng chứ không trắng toát): người thật + bản xanh sáng cộng nhẹ lên
        drawPersonPlain(fx.sx, fx.sy);
        const b = snapInto(OC, boxOf(g), OS, 'grayscale(1) brightness(1.35) contrast(1.2)');
        if (!b) return;
        OC.x.globalCompositeOperation = 'source-atop'; OC.x.fillStyle = 'rgba(110,170,255,.6)'; OC.x.fillRect(0, 0, b.ow, b.oh); OC.x.globalCompositeOperation = 'source-over';
        ctx.save(); ctx.translate(fx.sx, fx.sy); blitBox(OC, b, 0.75 * k); ctx.globalCompositeOperation = 'lighter'; blitBox(OC, b, 0.32 * k); ctx.restore();
    }
    function smoke(f, g, on, dt) {
        if (on) { f.smokeAcc += dt * (12 + f.sc.power * 6); while (f.smokeAcc >= 1) { f.smokeAcc -= 1; f.smoke.push({ x: g.head.x + (Math.random() - 0.5) * g.w * 0.6, y: g.head.y + Math.random() * g.ph * 0.5, vx: (Math.random() - 0.5) * 40, vy: -90 - Math.random() * 90, r: 16 + Math.random() * 22, t: 0, life: 1.4 + Math.random() }); } }
        for (const s of f.smoke) {
            s.t += dt; s.x += s.vx * dt + Math.sin(s.t * 3) * 0.6; s.y += s.vy * dt;
            const k = clamp01(s.t / s.life), r = s.r * (1 + k * 2.2);
            const gr = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
            gr.addColorStop(0, `rgba(60,60,64,${0.45 * (1 - k)})`); gr.addColorStop(1, 'rgba(60,60,64,0)');
            ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.fill();
        }
        f.smoke = f.smoke.filter(s => s.t < s.life);
    }
    // ⚡ tia điện bò DỌC tay chân / thân (theo dáng thật) + thỉnh thoảng phóng từ tay ra ngoài - như clip
    const ARC_SEGS = [[11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28], [11, 23], [12, 24], [11, 12]];
    function limbArcs(f, g, k, col) {
        if (k <= 0) return;
        const { P } = poseOf(g), R = Math.random, u = g.unit;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const n = Math.round((2 + f.sc.power) * (0.4 + 0.6 * k));
        for (let i = 0; i < n; i++) {
            let A, B;
            if (R() < 0.25) {
                // phóng từ cổ tay / cổ chân ra ngoài
                const j = [15, 16, 27, 28][Math.floor(R() * 4)], a = R() * TAU, l = u * (0.08 + R() * 0.12);
                A = P[j]; B = { x: A.x + Math.cos(a) * l, y: A.y + Math.sin(a) * l };
            } else {
                const [s0, s1] = ARC_SEGS[Math.floor(R() * ARC_SEGS.length)], p0 = P[s0], p1 = P[s1], d = dst(p0, p1) || 1;
                const t1 = R() * 0.6, t2 = t1 + 0.25 + R() * 0.4, off = u * 0.035 * (R() < 0.5 ? -1 : 1), nx = -(p1.y - p0.y) / d * off, ny = (p1.x - p0.x) / d * off;
                A = { x: lerp(p0.x, p1.x, t1) + nx * R(), y: lerp(p0.y, p1.y, t1) + ny * R() };
                B = { x: lerp(p0.x, p1.x, Math.min(1, t2)) + nx, y: lerp(p0.y, p1.y, Math.min(1, t2)) + ny };
            }
            const pts = boltPath(A.x, A.y, B.x, B.y, R, 0.75);
            ctx.strokeStyle = rgba(col, 0.45 * k); ctx.lineWidth = 7; strokePath(pts);
            ctx.strokeStyle = rgba('#7fb8ff', 0.8 * k); ctx.lineWidth = 3; strokePath(pts);
            ctx.strokeStyle = `rgba(255,255,255,${k})`; ctx.lineWidth = 1.3; strokePath(pts);
        }
        ctx.restore();
    }
    // quả cầu sáng nổ trên đỉnh đầu lúc sét giáng: lõi trắng chói + quầng xanh + tia toả
    function headOrb(g, k) {
        if (k <= 0) return;
        const { P } = poseOf(g), c = { x: (P[2].x + P[5].x) / 2, y: Math.min(P[2].y, P[5].y) - g.unit * 0.03 }, r = Math.max(g.unit * 0.07, g.w * 0.22);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const gr = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r * 3.2);
        gr.addColorStop(0, `rgba(255,255,255,${k})`); gr.addColorStop(0.18, `rgba(235,245,255,${0.95 * k})`); gr.addColorStop(0.4, `rgba(130,190,255,${0.5 * k})`); gr.addColorStop(1, 'rgba(80,140,255,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(c.x, c.y, r * 3.2, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(230,245,255,${0.8 * k})`; ctx.lineWidth = 3;
        for (let i = 0; i < 14; i++) { const a = i / 14 * TAU + Math.random() * 0.2, l = r * (1.4 + Math.random() * 1.6); ctx.beginPath(); ctx.moveTo(c.x + Math.cos(a) * r * 0.6, c.y + Math.sin(a) * r * 0.6); ctx.lineTo(c.x + Math.cos(a) * l, c.y + Math.sin(a) * l); ctx.stroke(); }
        ctx.restore();
    }
    // tia lửa phun tung toé trên đỉnh đầu (như pháo hoa), rơi theo trọng lực
    function sparkBurst(f, g) {
        const { P } = poseOf(g), x = (P[2].x + P[5].x) / 2, y = Math.min(P[2].y, P[5].y) - g.unit * 0.05, R = Math.random;
        for (let i = 0; i < 70 + f.sc.power * 20; i++) {
            const a = -Math.PI / 2 + (R() - 0.5) * 2.6, sp = 450 + R() * 1100;
            f.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.3 + R() * 0.45 });
        }
    }
    function drawSparks(f, dt) {
        if (!f.sparks.length) return;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (const s of f.sparks) {
            s.t += dt; s.vy += 1700 * dt; s.vx *= 0.985; s.x += s.vx * dt; s.y += s.vy * dt;
            const k = 1 - clamp01(s.t / s.life);
            ctx.strokeStyle = `rgba(150,200,255,${0.6 * k})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03); ctx.stroke();
            ctx.strokeStyle = `rgba(255,255,255,${k})`; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.02, s.y - s.vy * 0.02); ctx.stroke();
        }
        ctx.restore();
        f.sparks = f.sparks.filter(s => s.t < s.life);
    }

    // ---------- 👀 2 con mắt: lồi ra đỏ rực từ tia sét đầu → sau tia cuối TUỘT xuống dọc người, rơi xuống sàn; mặt còn 2 hốc đen ----------
    function eyesOf(g) {
        const { P } = poseOf(g);
        const a = P[2], b = P[5], d = Math.max(8, dst(a, b));
        return { L: a, R: b, r: Math.max(10, Math.min(70, d * 0.48)) };
    }
    const VEINS = [[0.2, 0.7], [1.4, 0.55], [2.6, 0.65], [3.7, 0.6], [4.9, 0.7]];
    function drawEyeball(x, y, r, rot, look, glow) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
        if (glow > 0) {
            ctx.globalCompositeOperation = 'lighter';
            const gl = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 2.6);
            gl.addColorStop(0, `rgba(255,80,40,${0.75 * glow})`); gl.addColorStop(0.5, `rgba(255,30,10,${0.3 * glow})`); gl.addColorStop(1, 'rgba(255,0,0,0)');
            ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, r * 2.6, 0, TAU); ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
        }
        const sc = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
        sc.addColorStop(0, '#ffffff'); sc.addColorStop(0.75, '#f3e6e6'); sc.addColorStop(1, '#d9a9a9');
        ctx.fillStyle = sc; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(200,20,30,.75)'; ctx.lineWidth = Math.max(1, r * 0.05);
        for (const [a, l] of VEINS) { ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97); ctx.quadraticCurveTo(Math.cos(a + 0.25) * r * 0.75, Math.sin(a + 0.25) * r * 0.75, Math.cos(a) * r * (1 - l * 0.5), Math.sin(a) * r * (1 - l * 0.5)); ctx.stroke(); }
        const ix = look.x * r * 0.32, iy = look.y * r * 0.32;
        const ir = ctx.createRadialGradient(ix, iy, r * 0.1, ix, iy, r * 0.58);
        ir.addColorStop(0, '#ff6a3c'); ir.addColorStop(0.7, '#e0141a'); ir.addColorStop(1, '#5a0008');
        ctx.fillStyle = ir; ctx.beginPath(); ctx.arc(ix, iy, r * 0.58, 0, TAU); ctx.fill();
        ctx.fillStyle = '#100000'; ctx.beginPath(); ctx.arc(ix, iy, r * 0.24, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(ix - r * 0.17, iy - r * 0.2, r * 0.11, 0, TAU); ctx.fill();
        ctx.restore();
    }
    function eyesFrame(f, g, e) {
        const P = f.p, first = P.strikes[0];
        if (e < first + 100) return;
        const E = eyesOf(g);
        if (e < P.drop) {
            // lồi ra + giật giật, ngươi đảo loạn
            const pop = easeOutBack(clamp01((e - first - 100) / 260)), jit = () => (Math.random() - 0.5) * E.r * 0.1;
            const look = { x: Math.sin(e / 70), y: Math.cos(e / 93) * 0.6 };
            for (const q of [E.L, E.R]) drawEyeball(q.x + jit(), q.y + jit(), E.r * (0.6 + 0.4 * pop), 0, look, 1);
            return;
        }
        // tuột: rơi gần như thẳng xuống dọc người (như clip), chạm sàn nảy nhẹ rồi lăn; mặt còn 2 hốc đen
        if (!f.eyeDrop) {
            f.eyeDrop = [E.L, E.R].map((q, i) => ({ x: q.x, y: q.y, vx: (i ? 1 : -1) * (25 + Math.random() * 45), vy: -60 - Math.random() * 60, r: 0,
                vr: (i ? 1 : -1) * (4 + Math.random() * 4), fy: Math.min(g.floorY, g.bottom - E.r * 2.4) - E.r, bounce: 0.45, rad: E.r }));
        }
        const out = 1 - clamp01((e - (P.end - 450)) / 450), t = (e - P.drop) / 1000;
        ctx.save(); ctx.globalAlpha = out * clamp01((e - P.drop) / 100);
        for (const q of [E.L, E.R]) {
            const gr = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, E.r * 0.9);
            gr.addColorStop(0, 'rgba(0,0,0,.95)'); gr.addColorStop(0.75, 'rgba(10,0,0,.85)'); gr.addColorStop(1, 'rgba(10,0,0,0)');
            ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(q.x, q.y, E.r * 0.9, E.r * 0.75, 0, 0, TAU); ctx.fill();
        }
        ctx.restore();
        ctx.save(); ctx.globalAlpha = out;
        for (const b of f.eyeDrop) { const q = fall(b, t); drawEyeball(q.x, q.y, b.rad, q.r, { x: 0, y: 0.4 }, q.rest ? 0.3 : 0.7); }
        ctx.restore();
    }

    // Nhịp mỗi tia sét (ms kể từ lúc giáng - đo từ clip 12 khung/giây): 0-80 loé TRẮNG cả màn · 80-240 cầu sáng trên đầu + cả người
    // phát sáng + tia sét chạy dọc người · từ 120 tia lửa phun trên đầu · XRAY_ON nhấp nháy xương ↔ người · tia điện bò tay chân ~1 s.
    const XRAY_ON = [[240, 400], [470, 640], [720, 860]];
    function zapFrame(f, e, dt, g) {
        const P = f.p, col = f.sc.color, n = P.strikes.length;
        if (!CLOUD_READY) { cloudTex(f); CLOUD_READY = true; }
        cue(f, e, 'cloud', 0, (X, v) => X.thunder(0.4, { vol: v * 0.45 }));
        P.strikes.forEach((at, i) => cue(f, e, 'strike' + i, at, (X, v) => { X.zap(1.1, { vol: v }); X.thunder(1, { vol: v * 0.8, at: 0.25 }); X.sizzle(0.9, { vol: v }); }));
        cue(f, e, 'eyepop', P.strikes[0] + 100, (X, v) => X.boing({ vol: v * 0.8 }));
        cue(f, e, 'eyes', P.drop, (X, v) => { X.boing({ vol: v * 0.45 }); X.splat(1, { vol: v, at: 0.38 }); X.splat(0.6, { vol: v * 0.8, at: 0.5 }); X.splat(0.3, { vol: v * 0.5, at: 0.68 }); });
        const ck = e < P.cloudB ? easeOut(e / P.cloudB) : e >= P.leave ? 1 - easeIn((e - P.leave) / (P.end - P.leave)) : 1;
        let last = -1, li = -1;
        P.strikes.forEach((at, i) => { if (e >= at) { last = at; li = i; } });
        const se = last >= 0 ? e - last : -1;
        if (se >= 0 && se < 30 && f.burstAt !== last) { f.burstAt = last; }
        if (se >= 120 && f.sparkAt !== last) { f.sparkAt = last; sparkBurst(f, g); }
        const sh = last >= 0 ? shakeAt(f, e, last, 450, 30) : 0;
        f.sx = sh ? (Math.random() - 0.5) * sh : 0; f.sy = sh ? (Math.random() - 0.5) * sh : 0;
        ctx.fillStyle = `rgba(6,8,22,${0.3 * ck})`; ctx.fillRect(0, 0, W, H);
        // người: sạm dần qua từng tia (tia cuối đen sì), sau "leave" sáng lại dần
        const char = li < 0 ? 0 : Math.min(1, (li + (se >= 300 ? 1 : se / 300)) / n) * (e >= P.leave ? 1 - clamp01((e - P.leave) / (P.end - P.leave - 150)) : 1);
        const isX = se >= 0 && se < 1000 && XRAY_ON.some(([a, b]) => se >= a && se < b);
        if (se >= 80 && se < 240) bodyGlow(g, 1 - (se - 80) / 400);
        else if (isX) xray(f, g);
        else if (char > 0.02) charred(g, char);
        else drawPersonPlain();
        smoke(f, g, li >= n - 1 && se >= 300 && e < P.leave + 400, dt);
        limbArcs(f, g, se >= 60 && se < 1100 ? 1 - (se - 60) / 1100 : 0, col);
        eyesFrame(f, g, e);
        drawSparks(f, dt);
        if (se >= 80 && se < 300) headOrb(g, 1 - clamp01((se - 80) / 220));
        // mây: dải mây dông phủ ngang đỉnh khung, sáng lên lúc sét
        if (f.flick == null || e > f.flickEnd + 300 + Math.random() * 900) { if (Math.random() < 0.04) { f.flick = e; f.flickEnd = e + 60 + Math.random() * 90; } }
        const lit = se >= 0 && se < 420 ? 1 - clamp01(se / 420) * 0.6 : (f.flick != null && e < f.flickEnd ? 0.45 : 0);
        const cl = drawCloud(f, g, e, ck, lit);
        if (cl && se >= 30 && se < 300) {
            // tia chính mây → đỉnh đầu (đổi nhánh giữa 2 lần loé) + 2 tia chạy dọc 2 bên người xuống chân
            const key = last + ':' + (se < 160 ? 1 : 2);
            if (f.boltKey !== key) {
                f.boltKey = key;
                const { P: Q } = poseOf(g), top = { x: (Q[2].x + Q[5].x) / 2, y: Math.min(Q[2].y, Q[5].y) - g.unit * 0.04 };
                f.bolt = makeBolt(f, { x: cl.x + (Math.random() - 0.5) * cl.r * 0.5, y: cl.y }, top);
                f.side = [-1, 1].map(s => makeBolt(f, { x: top.x + s * g.w * 0.15, y: top.y + g.unit * 0.05 }, { x: g.cx + s * g.w * (0.45 + Math.random() * 0.2), y: g.floorY }));
            }
            const a = se < 120 ? 1 : se < 160 ? 0.2 : 1 - clamp01((se - 160) / 140);
            drawBolt(f.bolt, a, col);
            if (se < 240) for (const b of f.side) drawBolt(b, a * 0.7, col);
        }
        if (se >= 0 && se < 80) { ctx.fillStyle = `rgba(245,248,255,${0.9 * (1 - se / 80)})`; ctx.fillRect(0, 0, W, H); }
    }

    // =====================================================================================================================
    // 🌀 ỐNG HÚT NGƯỜI
    // =====================================================================================================================
    // Ống gân (ống hút khói) thẳng đứng từ mép trên xuống miệng loe ở (x, my). hw = nửa bề ngang ống. bulge: { y, k } cục phình
    // (người đang bị hút đi lên trong ống).
    function drawHose(x, top, my, hw, bulge, t) {
        const rib = Math.max(10, hw * 0.24), mw = hw * 1.32, bellH = hw * 0.55;
        const widthAt = y => hw * (bulge ? 1 + bulge.k * 0.38 * Math.exp(-Math.pow((y - bulge.y) / (hw * 1.4), 2)) : 1);
        // thân ống: các vòng gân từ trên xuống, mỗi vòng = dải trụ (sáng giữa, tối 2 mép) + rãnh tối
        for (let y = top; y < my - bellH; y += rib) {
            const w = widthAt(y + rib / 2), sway = Math.sin(t * 1.7 + y * 0.004) * hw * 0.04 * (1 - (y - top) / Math.max(1, my - top));
            const gx = ctx.createLinearGradient(x - w, 0, x + w, 0);
            gx.addColorStop(0, '#0d0d0f'); gx.addColorStop(0.28, '#3b3c41'); gx.addColorStop(0.45, '#6a6b72'); gx.addColorStop(0.62, '#3a3b40'); gx.addColorStop(1, '#0b0b0d');
            ctx.fillStyle = gx;
            ctx.beginPath(); ctx.ellipse(x + sway, y + rib * 0.5, w, rib * 0.62, 0, 0, TAU); ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,.55)';
            ctx.beginPath(); ctx.ellipse(x + sway, y + rib * 0.98, w * 0.94, rib * 0.18, 0, 0, Math.PI); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = Math.max(1, rib * 0.08);
            ctx.beginPath(); ctx.ellipse(x + sway, y + rib * 0.32, w * 0.86, rib * 0.3, 0, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
        }
        // miệng loe (3 vòng gân to dần) + vành + lòng ống tối
        for (let i = 0; i < 3; i++) {
            const y = my - bellH + i * bellH / 3, w = lerp(hw, mw, (i + 1) / 3), h = bellH / 3;
            const gx = ctx.createLinearGradient(x - w, 0, x + w, 0);
            gx.addColorStop(0, '#101012'); gx.addColorStop(0.3, '#44454b'); gx.addColorStop(0.47, '#787981'); gx.addColorStop(0.64, '#404147'); gx.addColorStop(1, '#0c0c0e');
            ctx.fillStyle = gx; ctx.beginPath(); ctx.ellipse(x, y + h * 0.5, w, h * 0.72, 0, 0, TAU); ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.ellipse(x, y + h * 0.95, w * 0.95, h * 0.2, 0, 0, Math.PI); ctx.fill();
        }
        drawLogo(ctx, x, my - bellH * 0.5, Math.min(hw * 0.85, bellH * 0.66));    // 🅷 logo hp trên miệng loe ống hút
        ctx.fillStyle = '#050506'; ctx.beginPath(); ctx.ellipse(x, my, mw * 0.9, bellH * 0.16, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(160,162,170,.55)'; ctx.lineWidth = Math.max(2, hw * 0.05);
        ctx.beginPath(); ctx.ellipse(x, my, mw * 0.93, bellH * 0.18, 0, 0, Math.PI); ctx.stroke();
    }
    // Vẽ người quanh TÂM người (x, y): cỡ s, thót ngang sx / giãn dọc sy, xoay rot; clipY = miệng ống (phần phía trên = đã ở trong ống).
    function drawBodyAt(g, x, y, s, sx, sy, clipY, rot) {
        if (!person.ready || !person.img || !person.M || s <= 0.01) return;
        const ph = g.floorY - g.head.y;
        ctx.save();
        if (clipY != null) { ctx.beginPath(); ctx.rect(0, clipY, W, H); ctx.clip(); }
        ctx.translate(x + fx.sx, y + fx.sy); if (rot) ctx.rotate(rot); ctx.scale(s * sx, s * sy); ctx.translate(-g.cx, -(g.floorY - ph / 2));
        const M = person.M; ctx.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
        ctx.drawImage(person.img, 0, 0);
        ctx.restore();
    }
    // hạt bụi / khói bị hút vào miệng ống
    function suckDust(f, mx, my, g, on, dt) {
        if (on) { f.smokeAcc += dt * 45; while (f.smokeAcc >= 1) { f.smokeAcc -= 1; const a = Math.random() * Math.PI; f.smoke.push({ x: mx + Math.cos(a) * g.unit * (0.15 + Math.random() * 0.25), y: my + Math.sin(a) * g.unit * (0.12 + Math.random() * 0.35), t: 0, life: 0.35 + Math.random() * 0.3, r: 3 + Math.random() * 6 }); } }
        ctx.save();
        for (const s of f.smoke) {
            s.t += dt;
            const k = easeIn(clamp01(s.t / s.life)), x = lerp(s.x, mx, k), y = lerp(s.y, my, k);
            ctx.fillStyle = `rgba(210,210,215,${0.55 * (1 - k)})`; ctx.beginPath(); ctx.ellipse(x, y, s.r * (1 - k * 0.5), s.r * (1 + k * 2), Math.atan2(my - y, mx - x) + Math.PI / 2, 0, TAU); ctx.fill();
        }
        ctx.restore();
        f.smoke = f.smoke.filter(s => s.t < s.life);
    }
    function vacuumFrame(f, e, dt, g) {
        const P = f.p;
        cue(f, e, 'drop', P.drop, (X, v) => { X.whoosh((P.down - P.drop) / 1000, { vol: v * 0.5, f0: 1300, f1: 260 }); X.hose((P.down - P.drop) / 1000, { vol: v }); });
        cue(f, e, 'suck', P.down, (X, v) => X.vacuum((P.gone - P.down) / 1000 + 0.2, { vol: v }));
        cue(f, e, 'slurp', P.suckB, (X, v) => X.slurp({ vol: v }));
        cue(f, e, 'up', P.upA, (X, v) => { X.whoosh((P.upB - P.upA) / 1000, { vol: v * 0.5, f0: 300, f1: 1500 }); X.hose((P.upB - P.upA) / 1000, { vol: v * 0.8 }); });
        cue(f, e, 'low', P.lowA, (X, v) => { X.whoosh((P.lowB - P.lowA) / 1000, { vol: v * 0.45, f0: 1200, f1: 400 }); X.hose((P.lowB - P.lowA) / 1000, { vol: v * 0.8 }); });
        cue(f, e, 'spit', P.spit, (X, v) => { X.pop(1.3, { vol: v }); X.whoosh((P.land - P.spit) / 1000, { vol: v * 0.5, f0: 1600, f1: 400 }); });
        cue(f, e, 'land', P.land, (X, v) => { X.thud(1.1, { vol: v }); X.rustle(0.3, { vol: v * 0.6 }); });
        cue(f, e, 'back', P.back, (X, v) => { X.whoosh((P.backB - P.back) / 1000, { vol: v * 0.4, f0: 300, f1: 1400 }); X.hose((P.backB - P.back) / 1000, { vol: v * 0.6 }); });
        const sh = shakeAt(f, e, P.land, 300, 18);
        f.sx = sh ? (Math.random() - 0.5) * sh : 0; f.sy = sh ? Math.random() * sh * 0.5 : 0;
        // ống NHỎ (user 2026-10-28): cỡ theo đầu, không trùm cả người
        const hw = Math.max(g.unit * 0.055, Math.min(g.w * 0.3, g.unit * 0.075)), top = g.v.y - 30;
        if (f.tx == null) f.tx = g.cx;
        if (e < P.down || e >= P.land) f.tx = lerp(f.tx, g.cx, clamp01((dt || 0) * 6));
        const mx = f.tx;
        const rest = Math.max(g.v.y + hw * 2, g.head.y - g.unit * 0.04);      // miệng ống ngay trên đỉnh đầu
        const half = g.v.y + Math.max(hw * 2.2, g.unit * 0.12);               // "hạ xuống một chút" lúc thả người
        const hidden = top - hw * 1.5;
        let my = hidden;
        if (e < P.drop) my = hidden;
        else if (e < P.down) my = lerp(hidden, rest, easeOutBack((e - P.drop) / (P.down - P.drop)));
        else if (e < P.upA) my = rest;
        else if (e < P.upB) my = lerp(rest, hidden, easeIn((e - P.upA) / (P.upB - P.upA)));
        else if (e < P.lowA) my = hidden;
        else if (e < P.lowB) my = lerp(hidden, half, easeOut((e - P.lowA) / (P.lowB - P.lowA)));
        else if (e < P.back) my = half;
        else my = lerp(half, hidden, easeIn(clamp01((e - P.back) / (P.backB - P.back))));
        const t = e / 1000, ph = g.floorY - g.head.y;
        // --- người ---
        // Cỡ nhỏ nhất s0: bề ngang người lọt miệng ống. Bay lên / rơi xuống: đỉnh đầu đi THẲNG từ chỗ đứng tới miệng ống, cỡ đổi cùng nhịp
        // (tâm + cỡ cùng một hàm) → đầu luôn đúng hướng miệng ống. Chui vào / ra: người cỡ s0 trượt qua miệng ống, thân thót lại.
        const mouthW = hw * 1.32 * 2, s0 = Math.max(0.1, Math.min(0.4, mouthW * 0.8 / Math.max(g.w, 1))), hS = s0 * ph;
        const along = (p, mouthY, x0) => {      // p 0 = đứng ở sàn, 1 = đầu chạm miệng ống (cỡ s0)
            const s = lerp(1, s0, p), top = lerp(g.head.y, mouthY + 2, p);
            return { x: lerp(g.cx, x0, p), y: top + s * ph / 2, s };
        };
        if (e < P.down) drawPersonPlain();
        else if (e < P.gone) {
            const k = clamp01((e - P.down) / (P.suckB - P.down)), k2 = clamp01((e - P.suckB) / (P.gone - P.suckB));
            if (k2 <= 0) {
                const q = along(easeInOut(k), my, mx), wob = Math.sin(t * 9) * 0.1 * Math.sin(k * Math.PI);
                drawBodyAt(g, q.x, q.y, q.s, 1 - 0.15 * k, 1 + 0.12 * k, my - 1, wob);
            } else {
                // tuột vào: thót ngang, giãn dọc, trượt lên qua miệng ống
                const sy = 1.12 + 0.5 * easeIn(k2), sx = 0.85 - 0.25 * k2;
                const top = lerp(my + 2, my - hS * sy - 4, easeIn(k2));
                drawBodyAt(g, mx, top + s0 * sy * ph / 2, s0, sx, sy, my - 1, 0);
            }
        } else if (e >= P.spit) {
            if (e < P.land) {
                const k = (e - P.spit) / (P.land - P.spit), k1 = clamp01(k / 0.3), k2 = clamp01((k - 0.3) / 0.7);
                if (k1 < 1) {
                    // chui ra khỏi miệng ống (chân ra trước), thân thót rồi nở dần
                    const sy = 1.5 - 0.38 * k1, sx = 0.65 + 0.2 * k1;
                    const top = lerp(my - hS * sy - 4, my + 2, easeOut(k1));
                    drawBodyAt(g, mx, top + s0 * sy * ph / 2, s0, sx, sy, my - 1, 0);
                } else {
                    // rơi xuống, lớn dần lại cỡ thật (cùng nhịp với vị trí - ngược đường bay lên)
                    const q = along(1 - easeIn(k2), my, mx);
                    drawBodyAt(g, q.x, q.y, q.s, lerp(0.85, 1, k2), lerp(1.12, 1, k2), null, Math.sin(k2 * TAU) * 0.08 * (1 - k2));
                }
            } else {
                const k = clamp01((e - P.land) / 320), sq = 1 - Math.sin(k * Math.PI) * 0.16 * (1 - k * 0.5);
                // đáp đất: nén theo chân (tâm hạ xuống đúng phần nén)
                drawBodyAt(g, g.cx, g.floorY - sq * ph / 2, 1, 1 + (1 - sq) * 0.6, sq, null, 0);
            }
        }
        suckDust(f, mx, my, g, e >= P.down && e < P.gone, dt || 0);
        // --- ống: cục phình (người bên trong) chạy lên lúc hút xong, chạy xuống trước lúc thả ---
        const bulge = e >= P.gone - 150 && e < P.upB ? { y: lerp(my - hw, top - hw * 2, easeIn(clamp01((e - P.gone + 150) / 700))), k: 1 }
            : e >= P.lowB - 300 && e < P.spit ? { y: lerp(top, my - hw, easeIn(clamp01((e - P.lowB + 300) / (P.spit - P.lowB + 300)))), k: 1 } : null;
        drawHose(mx, top, my, hw * (e >= P.down && e < P.gone ? 1 + Math.sin(t * 40) * 0.02 : 1), bulge, t);
    }

    // =====================================================================================================================
    // 🐝 ONG VỠ TỔ
    // =====================================================================================================================
    // 🍯 TỔ ONG 3D: vẽ kỹ MỘT lần vào ảnh đệm (theo cỡ) rồi mỗi khung chỉ drawImage + xoay. Dáng giọt nước (hẹp đỉnh, phình
    // 2/3 dưới), 6 khoanh rơm xếp chồng - mỗi khoanh: màu mật ong đổ bóng trụ + quầng sáng phía trên trái + vân lục giác mờ + vệt bóng
    // loáng; rãnh tối giữa các khoanh; cửa tổ lõm sâu; 2 giọt mật trong veo bóng loáng; viền tối định hình.
    const HIVE = { c: null, s: 0 };
    function hiveSprite(s) {
        s = Math.round(s / 8) * 8;
        if (HIVE.c && HIVE.s === s) return HIVE.c;
        const c = document.createElement('canvas'); c.width = Math.ceil(s * 1.3); c.height = Math.ceil(s * 1.5);
        const x = c.getContext('2d'), cx = c.width / 2, cy = c.height * 0.5;
        x.translate(cx, cy);
        const N = 6, y0 = -s * 0.56, y1 = s * 0.4, rh = (y1 - y0) / (N - 1);
        const wAt = k => s * (0.17 + 0.39 * Math.sin(Math.PI * (0.1 + 0.78 * k)));
        // bóng đổ mềm phía sau (tách khỏi nền)
        const sh = x.createRadialGradient(s * 0.05, s * 0.05, s * 0.1, s * 0.05, s * 0.05, s * 0.62);
        sh.addColorStop(0, 'rgba(40,20,0,.28)'); sh.addColorStop(1, 'rgba(40,20,0,0)');
        x.fillStyle = sh; x.beginPath(); x.arc(s * 0.05, s * 0.05, s * 0.62, 0, TAU); x.fill();
        // núm treo trên đỉnh
        const kg = x.createLinearGradient(-s * 0.06, 0, s * 0.06, 0);
        kg.addColorStop(0, '#4a2a08'); kg.addColorStop(0.45, '#9a6224'); kg.addColorStop(1, '#3a2006');
        x.fillStyle = kg; x.beginPath(); x.roundRect ? x.roundRect(-s * 0.05, y0 - s * 0.14, s * 0.1, s * 0.12, s * 0.03) : x.rect(-s * 0.05, y0 - s * 0.14, s * 0.1, s * 0.12); x.fill();
        for (let i = 0; i < N; i++) {
            const k = i / (N - 1), y = y0 + i * rh, w = wAt(k), h = rh * 0.78;
            x.save();
            x.beginPath(); x.ellipse(0, y, w, h, 0, 0, TAU); x.clip();
            // đổ bóng trụ: tối 2 mép → mật ong sáng giữa lệch trái
            const g1 = x.createLinearGradient(-w, 0, w, 0);
            g1.addColorStop(0, '#5c2f02'); g1.addColorStop(0.18, '#a8600c'); g1.addColorStop(0.38, '#e9a326'); g1.addColorStop(0.5, '#f6bf45');
            g1.addColorStop(0.7, '#d48a18'); g1.addColorStop(0.9, '#8a4a06'); g1.addColorStop(1, '#4e2702');
            x.fillStyle = g1; x.fillRect(-w, y - h, w * 2, h * 2);
            // trên sáng - dưới tối (khoanh tròn như cuộn rơm)
            const g2 = x.createLinearGradient(0, y - h, 0, y + h);
            g2.addColorStop(0, 'rgba(255,236,170,.55)'); g2.addColorStop(0.45, 'rgba(255,220,140,0)'); g2.addColorStop(0.8, 'rgba(70,30,0,.25)'); g2.addColorStop(1, 'rgba(50,20,0,.55)');
            x.fillStyle = g2; x.fillRect(-w, y - h, w * 2, h * 2);
            // vân rơm: sợi xiên mảnh
            x.strokeStyle = 'rgba(110,55,0,.22)'; x.lineWidth = Math.max(1, s * 0.006);
            x.beginPath();
            for (let j = -w; j < w; j += s * 0.028) { x.moveTo(j, y - h); x.lineTo(j + h * 0.7, y + h); }
            x.stroke();
            // vệt bóng loáng
            const hl = x.createRadialGradient(-w * 0.35, y - h * 0.45, 0, -w * 0.35, y - h * 0.45, w * 0.55);
            hl.addColorStop(0, 'rgba(255,250,225,.75)'); hl.addColorStop(0.35, 'rgba(255,240,190,.25)'); hl.addColorStop(1, 'rgba(255,240,190,0)');
            x.fillStyle = hl; x.save(); x.translate(-w * 0.35, y - h * 0.45); x.scale(1, 0.38); x.translate(w * 0.35, -(y - h * 0.45));
            x.beginPath(); x.arc(-w * 0.35, y - h * 0.45, w * 0.55, 0, TAU); x.fill(); x.restore();
            x.restore();
            // rãnh tối dưới khoanh (bóng đổ lên khoanh kế)
            x.strokeStyle = 'rgba(45,18,0,.6)'; x.lineWidth = Math.max(1.5, s * 0.016);
            x.beginPath(); x.ellipse(0, y + h * 0.15, w * 0.97, h * 0.86, 0, Math.PI * 0.08, Math.PI * 0.92); x.stroke();
        }
        // cửa tổ: lõm sâu, viền dưới hửng sáng
        const ey = y0 + rh * 3.65, ew = s * 0.11, eh = s * 0.075;
        const eg = x.createRadialGradient(0, ey - eh * 0.3, 0, 0, ey, ew * 1.1);
        eg.addColorStop(0, '#000'); eg.addColorStop(0.65, '#170800'); eg.addColorStop(1, '#5a2c02');
        x.fillStyle = eg; x.beginPath(); x.ellipse(0, ey, ew, eh, 0, 0, TAU); x.fill();
        x.strokeStyle = 'rgba(255,214,120,.65)'; x.lineWidth = Math.max(1, s * 0.012);
        x.beginPath(); x.ellipse(0, ey, ew * 1.05, eh * 1.08, 0, Math.PI * 0.15, Math.PI * 0.85); x.stroke();
        // giọt mật trong veo
        for (const [dx, dy, r] of [[s * 0.2, y0 + rh * 4.4, s * 0.045], [-s * 0.27, y0 + rh * 3.1, s * 0.032]]) {
            x.beginPath(); x.moveTo(dx - r * 0.5, dy - r * 1.6); x.quadraticCurveTo(dx - r * 1.05, dy + r * 0.2, dx, dy + r); x.quadraticCurveTo(dx + r * 1.05, dy + r * 0.2, dx + r * 0.5, dy - r * 1.6); x.closePath();
            const hg = x.createRadialGradient(dx - r * 0.3, dy - r * 0.2, r * 0.05, dx, dy, r * 1.3);
            hg.addColorStop(0, '#ffe9a0'); hg.addColorStop(0.45, '#ffb020'); hg.addColorStop(1, '#b85d00');
            x.fillStyle = hg; x.fill();
            x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.ellipse(dx - r * 0.35, dy - r * 0.15, r * 0.18, r * 0.3, -0.3, 0, TAU); x.fill();
        }
        HIVE.c = c; HIVE.s = s;
        return c;
    }
    function drawHive(x, y, s, rot) {
        const c = hiveSprite(s);
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
        ctx.drawImage(c, -c.width / 2, -c.height / 2);
        ctx.restore();
    }
    // 🐝 CON ONG 3D (nhìn từ trên, đầu hướng +x): bụng vàng bóng sọc đen cong theo thân, ngực lông xù nâu, đầu đen bóng mắt kép,
    // râu, 6 chân, ngòi; cánh trong suốt có gân. Ảnh đệm 4 khung: 3 nhịp vỗ cánh + cánh khép (đang đậu).
    const BEE_PX = 112;
    let BEE_SHEET = null;
    function beeSheet() {
        if (BEE_SHEET) return BEE_SHEET;
        const c = document.createElement('canvas'); c.width = BEE_PX * 4; c.height = BEE_PX;
        const x = c.getContext('2d');
        const wing = (spread, fold) => {
            for (const d of [-1, 1]) {
                for (const [len, wd, off] of [[34, 15, 0], [24, 10, 7]]) {
                    x.save(); x.translate(6 - off, d * 5);
                    if (fold) x.rotate(Math.PI + d * 0.22); else x.rotate(d * (Math.PI / 2 - 0.35 + off * 0.03));
                    x.scale(1, fold ? 0.55 : spread);
                    const wg = x.createLinearGradient(0, 0, len, 0);
                    wg.addColorStop(0, 'rgba(225,240,255,.55)'); wg.addColorStop(1, 'rgba(240,248,255,.28)');
                    x.fillStyle = wg; x.beginPath(); x.ellipse(len / 2, 0, len / 2, wd / 2, 0, 0, TAU); x.fill();
                    x.strokeStyle = 'rgba(80,90,110,.55)'; x.lineWidth = 0.9; x.stroke();
                    x.beginPath(); x.moveTo(2, 0); x.lineTo(len * 0.9, -wd * 0.1); x.moveTo(len * 0.35, 0); x.lineTo(len * 0.7, wd * 0.32); x.moveTo(len * 0.45, 0); x.lineTo(len * 0.75, -wd * 0.35); x.stroke();
                    x.fillStyle = 'rgba(255,255,255,.5)'; x.beginPath(); x.ellipse(len * 0.4, -wd * 0.18, len * 0.2, wd * 0.08, 0, 0, TAU); x.fill();
                    x.restore();
                }
            }
        };
        const body = () => {
            // chân
            x.strokeStyle = '#1a1006'; x.lineWidth = 2; x.lineCap = 'round';
            for (const [ax, bx, by] of [[12, 22, 16], [7, 6, 19], [2, -10, 17]]) for (const d of [-1, 1]) { x.beginPath(); x.moveTo(ax, d * 5); x.quadraticCurveTo((ax + bx) / 2, d * by * 1.1, bx, d * by); x.stroke(); }
            // ngòi
            x.fillStyle = '#2a1a08'; x.beginPath(); x.moveTo(-36, -2.5); x.lineTo(-45, 0); x.lineTo(-36, 2.5); x.closePath(); x.fill();
            // bụng: vàng bóng + sọc đen cong theo thân
            x.save(); x.beginPath(); x.ellipse(-16, 0, 22, 14.5, 0, 0, TAU); x.clip();
            const ag = x.createRadialGradient(-20, -6, 2, -16, 0, 24);
            ag.addColorStop(0, '#fff6b0'); ag.addColorStop(0.35, '#ffd21f'); ag.addColorStop(0.75, '#e69a00'); ag.addColorStop(1, '#8c5200');
            x.fillStyle = ag; x.fillRect(-40, -16, 48, 32);
            x.fillStyle = '#1b1206';
            for (const sx of [-6, -17, -28]) { x.beginPath(); x.moveTo(sx - 3, -16); x.quadraticCurveTo(sx - 6.5, 0, sx - 3, 16); x.lineTo(sx + 3, 16); x.quadraticCurveTo(sx - 0.5, 0, sx + 3, -16); x.closePath(); x.fill(); }
            const sh = x.createLinearGradient(0, -15, 0, 15); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.65, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.35)');
            x.fillStyle = sh; x.fillRect(-40, -16, 48, 32);
            x.restore();
            x.fillStyle = 'rgba(255,255,255,.75)'; x.beginPath(); x.ellipse(-15, -7.5, 8, 2.6, -0.1, 0, TAU); x.fill();
            // ngực lông xù
            const tg = x.createRadialGradient(6, -3, 1, 8, 0, 11);
            tg.addColorStop(0, '#c8892c'); tg.addColorStop(0.55, '#7a4a12'); tg.addColorStop(1, '#3b2306');
            x.fillStyle = tg; x.beginPath(); x.arc(8, 0, 10, 0, TAU); x.fill();
            x.strokeStyle = 'rgba(240,190,90,.6)'; x.lineWidth = 1;
            for (let i = 0; i < 22; i++) { const a = i / 22 * TAU; x.beginPath(); x.moveTo(8 + Math.cos(a) * 8, Math.sin(a) * 8); x.lineTo(8 + Math.cos(a) * 11.5, Math.sin(a) * 11.5); x.stroke(); }
            // đầu đen bóng + mắt kép + râu
            const hg = x.createRadialGradient(21, -2, 0.5, 22, 0, 8);
            hg.addColorStop(0, '#5a4a3a'); hg.addColorStop(0.5, '#1a120a'); hg.addColorStop(1, '#050302');
            x.fillStyle = hg; x.beginPath(); x.ellipse(22, 0, 7.5, 8, 0, 0, TAU); x.fill();
            for (const d of [-1, 1]) {
                x.fillStyle = '#0b0b10'; x.beginPath(); x.ellipse(23, d * 5, 4, 3.4, d * 0.4, 0, TAU); x.fill();
                x.fillStyle = 'rgba(255,255,255,.85)'; x.beginPath(); x.arc(22.5, d * 5 - 1.2, 1.1, 0, TAU); x.fill();
                x.strokeStyle = '#120a04'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(27, d * 2); x.quadraticCurveTo(34, d * 4, 38, d * 11); x.stroke();
                x.fillStyle = '#120a04'; x.beginPath(); x.arc(38, d * 11, 1.8, 0, TAU); x.fill();
            }
        };
        const frames = [[1, false, true], [0.6, false, true], [0.25, false, true], [0, true, false]];
        frames.forEach(([sp, fold, over], i) => {
            x.save(); x.translate(BEE_PX * i + BEE_PX / 2 + 4, BEE_PX / 2);
            if (fold) { body(); wing(0, true); } else { body(); if (over) wing(sp, false); }
            x.restore();
        });
        BEE_SHEET = c;
        return c;
    }
    function drawBee(b, sz, t, on) {
        const sheet = beeSheet(), k = sz * 2.2 / 80;
        const fr = on ? 3 : [0, 1, 2, 1][Math.floor((t * 60 + b.ph * 3) % 4)];
        ctx.setTransform(1, 0, 0, 1, b.x, b.y);
        ctx.rotate(Math.atan2(b.vy, b.vx));
        if (on) { ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(-sz * 0.2 + 3, 4, sz * 0.95, sz * 0.5, 0, 0, TAU); ctx.fill(); }   // bóng đổ lên người
        ctx.scale(k, k);
        ctx.drawImage(sheet, BEE_PX * fr, 0, BEE_PX, BEE_PX, -BEE_PX / 2 - 4, -BEE_PX / 2, BEE_PX, BEE_PX);
    }
    // Chỗ ong đậu trên người, bám theo DÁNG (đầu, thân, tay, chân): mỗi con một "điểm neo" tính lại mỗi khung theo dáng hiện tại.
    const BEE_SEGS = [[11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28]];
    function beeAnchor(R) {
        const u = R();
        if (u < 0.22) return { k: 'head', a: R() * TAU, rr: 0.35 + R() * 0.6 };
        if (u < 0.6) return { k: 'body', u: 0.12 + R() * 0.76, v: 0.05 + R() * 0.9 };
        const s = BEE_SEGS[Math.floor(R() * (u < 0.85 ? 4 : 8))];
        return { k: 'seg', a: s[0], b: s[1], t: 0.1 + R() * 0.85, off: (R() - 0.5) * 1.4 };
    }
    function anchorPos(an, P, g) {
        if (an.k === 'head') {
            const c = midP(P[2], P[5]), r = Math.max(dst(P[7], P[8]) * 0.55, H * 0.035);
            return { x: c.x + Math.cos(an.a) * r * an.rr, y: c.y - r * 0.25 + Math.sin(an.a) * r * an.rr * 1.15 };
        }
        if (an.k === 'body') {
            const top = { x: lerp(P[11].x, P[12].x, an.u), y: lerp(P[11].y, P[12].y, an.u) }, bot = { x: lerp(P[23].x, P[24].x, an.u), y: lerp(P[23].y, P[24].y, an.u) };
            return { x: lerp(top.x, bot.x, an.v), y: lerp(top.y, bot.y, an.v) };
        }
        const A = P[an.a], B = P[an.b], d = dst(A, B) || 1, w = H * 0.012;
        return { x: lerp(A.x, B.x, an.t) - (B.y - A.y) / d * w * an.off, y: lerp(A.y, B.y, an.t) + (B.x - A.x) / d * w * an.off };
    }
    // ĐỘNG vào ong: MỌI khớp của dáng (đầu, vai, khuỷu, cổ tay, hông, gối, cổ chân) đi nhanh hơn ngưỡng = một điểm xua { x, y, r, i, vx, vy }
    // (đo theo dáng thật, px/giây). Cổ tay / bàn tay tầm rộng hơn (vung tay đuổi ong).
    const BEE_JOINTS = [0, 2, 5, 11, 12, 13, 14, 15, 16, 19, 20, 23, 24, 25, 26, 27, 28];
    const HANDS = [15, 16, 19, 20];
    function disturb(f, g, P, real, now) {
        const out = [];
        if (!real) return out;
        const thr = H * 0.33;                                  // px/giây - theo khung, không theo cỡ người (ổn định)
        for (const i of BEE_JOINTS) {
            const q = P[i], o = f.track[i];
            if (!q) continue;
            if (o && (q.x !== o.x || q.y !== o.y)) {
                const dtt = Math.max(0.03, (now - o.t) / 1000), sp = dst(q, o) / dtt;
                if (sp > thr && dtt < 0.3 && sp < H * 5) out.push({ x: q.x, y: q.y, r: H * (HANDS.includes(i) ? 0.13 : 0.085) * Math.min(1.6, sp / thr * 0.6 + 0.4), i, vx: (q.x - o.x) / dtt, vy: (q.y - o.y) / dtt });
                f.track[i] = { x: q.x, y: q.y, t: now };
            } else if (!o) f.track[i] = { x: q.x, y: q.y, t: now };
        }
        // hơn nửa số khớp cùng "nhảy" một lúc = bộ nhận diện vừa bắt lại người, không phải cử động thật
        return out.length > BEE_JOINTS.length * 0.6 ? [] : out;
    }
    // điểm neo của ong có dính khớp i không (ong đang đậu trên chỗ đang cử động)
    const onJoint = (an, i) => an.k === 'seg' ? an.a === i || an.b === i : an.k === 'head' ? i === 0 || i === 2 || i === 5 : an.k === 'body' ? [11, 12, 23, 24].includes(i) : false;
    function beesFrame(f, e, dt, g) {
        const P = f.p;
        cue(f, e, 'drop', P.drop, (X, v) => X.whoosh(0.4, { vol: v * 0.5, f0: 1200, f1: 400 }));
        cue(f, e, 'land', P.land, (X, v) => { X.thud(0.5, { vol: v * 0.7 }); X.pop(0.5, { vol: v * 0.5 }); X.thud(0.4, { vol: v * 0.6, at: 0.55 }); X.rustle(0.25, { vol: v * 0.5, at: 0.6 });
            X.buzz((P.end - P.land) / 1000, { vol: v * 0.8, at: 0.45, bees: 6 + f.sc.power * 2 }); });
        f.sx = 0; f.sy = 0;
        drawPersonPlain();
        // CỠ CỐ ĐỊNH mỗi lượt theo khung OBS (user 2026-10-28: ong / tổ "lúc to lúc nhỏ, tràn màn hình" - trước tính theo chiều cao người,
        // camera nửa người / dáng lúc bắt được chân lúc không làm cỡ nhảy): ong ~12 px, tổ ~120 px, vòng bay tản quanh người vừa phải.
        if (!f.bz) f.bz = { sz: Math.round(H * 0.0062), hs: Math.round(H * 0.062), rx: Math.max(H * 0.1, Math.min(H * 0.17, g.w * 0.6)), ry: Math.max(H * 0.2, Math.min(H * 0.32, g.ph * 0.45)) };
        const hs = f.bz.hs, side = f.seed % 2 < 1 ? -1 : 1;
        const { P: Q, real } = poseOf(g);
        // 🍯 tổ ong: rơi trúng đầu → bật văng xuống sàn cạnh NPC, nằm đó (ong bay ra từ miệng tổ)
        const hx = Q[0].x, hy = g.head.y - hs * 0.2;
        const fx0 = Math.max(g.v.x + hs * 0.8, Math.min(g.v.x + g.v.w - hs * 0.8, g.cx + side * Math.max(g.w * 0.45, g.unit * 0.14))), fy0 = Math.min(g.floorY, g.bottom - hs * 0.15) - hs * 0.42;
        let hive = null;
        if (e >= P.drop) {
            let x = hx, y = hy, rot = 0;
            if (e < P.land) y = lerp(g.v.y - hs, hy, easeIn((e - P.drop) / (P.land - P.drop)));
            else {
                const k = clamp01((e - P.land) / 650);
                x = lerp(hx, fx0, k); y = lerp(hy, fy0, easeIn(k)) - Math.sin(k * Math.PI) * hs * 0.9; rot = side * k * 1.35;
                if (k >= 1) { const w = Math.max(0, 1 - (e - P.land - 650) / 500); y = fy0 - Math.abs(Math.sin((e - P.land - 650) / 70)) * hs * 0.06 * w; rot = side * 1.35 + Math.sin(e / 60) * 0.05 * w; }
            }
            ctx.save(); ctx.globalAlpha = 1 - clamp01((e - P.end + 350) / 350); drawHive(x, y, hs, rot); ctx.restore();
            hive = { x: x + Math.sin(rot) * hs * 0.18, y: y + Math.cos(rot) * hs * 0.18 };
        }
        if (e < P.land + 450 || !hive) return;
        const N = 40 + f.sc.power * 30, sz = f.bz.sz, t = e / 1000, st = Math.min(dt, 0.05), R = Math.random;
        // ong ùa ra khỏi tổ trong ~1,8 s
        while (f.bees.length < N && (e - P.land - 450) / 1800 * N > f.bees.length) {
            const a = -Math.PI / 2 + (R() - 0.5) * 2;
            f.bees.push({ x: hive.x, y: hive.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, ph: R() * TAU, st: 'fly', tt: 0.3 + R() * 1.2, an: beeAnchor(R), cx: 0, cy: 0, hd: R() * TAU });
        }
        const leaving = e >= P.leave;
        const sw = leaving ? [] : disturb(f, g, Q, real, performance.now());
        const cx = g.cx, cy = g.head.y + g.ph * 0.4, rx = f.bz.rx, ry = f.bz.ry;
        let scattered = 0;
        if (f.swirl == null) f.swirl = 1;
        if (sw.length && R() < 0.15) f.swirl = -f.swirl;
        for (const b of f.bees) {
            b.tt -= st;
            // bị động vào: ong gần chỗ đang cử động (hoặc đang đậu đúng chỗ đó) bật tung ra theo hướng cử động, rồi cả bầy lượn VÒNG quanh
            // người (cùng một chiều xoáy) một lúc mới bu lại
            if (!leaving && b.st !== 'flee' && !(b.calm > t)) for (const s of sw) {
                const near = dst(b, s) < s.r || (b.st === 'on' && onJoint(b.an, s.i));
                if (!near) continue;
                const dx = b.x - s.x, dy = b.y - s.y, d = Math.hypot(dx, dy) || 1, sp = 500 + R() * 600;
                b.vx = dx / d * sp + s.vx * 0.4 + (R() - 0.5) * 260; b.vy = dy / d * sp + s.vy * 0.4 - 120 - R() * 200;
                b.st = 'flee'; b.tt = 0.8 + R() * 1; b.an = beeAnchor(R); b.orb = 0.85 + R() * 0.4;
                scattered++;
                break;
            }
            if (leaving) {
                if (b.st !== 'gone') { const a = Math.atan2(b.y - cy, b.x - cx) + (R() - 0.5); b.out = { x: Math.cos(a), y: Math.sin(a) - 0.3 }; b.st = 'gone'; }
                b.vx += b.out.x * 2600 * st; b.vy += b.out.y * 2600 * st;
            } else if (b.st === 'fly') {
                // lượn quanh người (đích chạy vòng + nhiễu) rồi sà xuống đậu
                const a = t * 2 + b.ph, tx = cx + Math.cos(a) * rx * 0.8 + Math.sin(t * 3.3 + b.ph) * rx * 0.3, ty = cy + Math.sin(a * 1.3) * ry * 0.7 + Math.cos(t * 2.1 + b.ph) * ry * 0.2;
                b.vx = (b.vx + (tx - b.x) * 8 * st) * 0.94; b.vy = (b.vy + (ty - b.y) * 8 * st) * 0.94;
                if (b.tt <= 0) { b.st = 'land'; b.tt = 2.5; }
            } else if (b.st === 'land') {
                // bay thẳng tới điểm neo, chậm dần (tiếp đất nhẹ)
                const p = anchorPos(b.an, Q, g), dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy);
                const want = Math.min(900, d * 6);
                b.vx += ((dx / (d || 1)) * want - b.vx) * Math.min(1, 10 * st); b.vy += ((dy / (d || 1)) * want - b.vy) * Math.min(1, 10 * st);
                b.vx += Math.sin(t * 40 + b.ph) * 30; b.vy += Math.cos(t * 37 + b.ph) * 30;
                if (d < sz * 0.7 || b.tt <= 0) { b.st = 'on'; b.cx = 0; b.cy = 0; b.tt = 2 + R() * 6; b.hd = Math.atan2(b.vy, b.vx); }
            } else if (b.st === 'on') {
                // đậu: bò lổm ngổm quanh điểm neo, đổi hướng; thỉnh thoảng tự cất cánh rồi đậu chỗ khác
                b.hd += (R() - 0.5) * 6 * st;
                const cr = sz * 1.6;
                b.cx = Math.max(-cr, Math.min(cr, b.cx + Math.cos(b.hd) * sz * 1.2 * st)); b.cy = Math.max(-cr, Math.min(cr, b.cy + Math.sin(b.hd) * sz * 1.2 * st));
                const p = anchorPos(b.an, Q, g);
                b.x = p.x + b.cx; b.y = p.y + b.cy; b.vx = Math.cos(b.hd); b.vy = Math.sin(b.hd);
                if (b.tt <= 0) { b.st = 'fly'; b.tt = 0.4 + R() * 1.2; b.an = beeAnchor(R); b.vx = (R() - 0.5) * 400; b.vy = -200 - R() * 200; }
            } else if (b.st === 'flee') {
                // bầy tản: lực kéo về một vòng quanh người (bán kính orb) + xoáy cùng chiều f.swirl → đàn ong bay vòng vòng như mây
                const fry = ry * 0.8, dx = b.x - cx, dy = (b.y - cy) * (rx / fry), d = Math.hypot(dx, dy) || 1, want = rx * 0.75 * b.orb;
                const radial = (want - d) * 5, tang = 520 * f.swirl;
                const ux = dx / d, uy = dy / d;
                b.vx += (ux * radial - uy * tang - b.vx) * Math.min(1, 3 * st);
                b.vy += ((uy * radial + ux * tang) * (fry / rx) - b.vy) * Math.min(1, 3 * st);
                b.vx += (R() - 0.5) * 160; b.vy += (R() - 0.5) * 160;
                if (b.tt <= 0) { b.st = 'land'; b.tt = 2.5; b.calm = t + 1.4; }      // vừa tản xong: 1,4 s bu lại không bị xua tiếp
            }
            if (b.st !== 'on') { b.x += b.vx * st; b.y += b.vy * st; }
            drawBee(b, sz, t, b.st === 'on');
        }
        if (scattered >= 3 && (!f.swatAt || e - f.swatAt > 500)) {
            f.swatAt = e;
            if (env.sfx && env.sfxOn && env.sfxOn(f.sc)) { const v = env.cfg().sfxVolume ?? 0.7; env.sfx.buzz(1.1, { vol: v * Math.min(0.8, 0.3 + scattered / 40), bees: 3 }); }
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // =====================================================================================================================
    // 🖐 TÁT BAY (đầu clip 1, phân tích 2026-10-28): bàn tay khổng lồ (da sáng, quầng loá, nhoè chuyển động) vung qua tát trúng người →
    // người bay văng có VỆT NHOÈ dài, lộn vòng / nằm ngang / chúc đầu, khỏi khung → bay ngược về giữa → tay tát chiều khác → …
    // Hướng tát: trái ↔ phải, trên ↔ dưới, chéo (user 2026-10-28 "cho sinh động và phong phú"). Hết lượt người bay về đáp đất.
    // =====================================================================================================================
    // ✋ Bàn tay (lòng bàn tay hướng camera, ngón chỉ lên, đi theo +x) - vẽ kỹ MỘT lần vào ảnh đệm.
    let HAND = null;
    function handSprite() {
        if (HAND) return HAND;
        // ✋ Bàn tay xinh (lòng bàn tay hướng camera, ngón hơi xoè, ngón cái chìa trái): dựng MỘT mặt nạ liền (lòng bàn tay cong + 5 ngón
        // thuôn) rồi đổ nhiều lớp bóng mềm bên trong mặt nạ - không viền cứng, không "ống dán" (user 2026-10-28: bản đầu thô).
        const W0 = 480, H0 = 660, c = document.createElement('canvas'); c.width = W0; c.height = H0;
        const x = c.getContext('2d');
        const mk2 = () => { const m = document.createElement('canvas'); m.width = W0; m.height = H0; return [m, m.getContext('2d')]; };
        // ngón: gốc (bx, by), dài L, rộng gốc wb, đầu wt, nghiêng a độ; thân hơi phình ở đốt giữa, đầu tròn đầy
        const fingerPath = (g, bx, by, L, wb, wt, a) => {
            g.save(); g.translate(bx, by); g.rotate(a * Math.PI / 180);
            g.beginPath();
            g.moveTo(-wb / 2, wb * 0.35);
            g.bezierCurveTo(-wb / 2 - 2, -L * 0.3, -wt / 2 - 4, -L * 0.7, -wt / 2, -L + wt * 0.55);
            g.bezierCurveTo(-wt / 2, -L - wt * 0.02, wt / 2, -L - wt * 0.02, wt / 2, -L + wt * 0.55);
            g.bezierCurveTo(wt / 2 + 4, -L * 0.7, wb / 2 + 2, -L * 0.3, wb / 2, wb * 0.35);
            g.closePath(); g.restore();
        };
        const F = [[172, 285, 215, 54, 44, -7], [228, 268, 248, 58, 47, -1], [284, 275, 232, 56, 45, 5], [334, 300, 178, 50, 40, 12]];     // trỏ, giữa, áp út, út
        const thumbPath = g => {
            g.beginPath();
            g.moveTo(156, 436);
            g.bezierCurveTo(128, 412, 92, 378, 62, 356);
            g.bezierCurveTo(40, 340, 14, 364, 28, 392);
            g.bezierCurveTo(44, 422, 78, 460, 104, 488);
            g.bezierCurveTo(122, 508, 142, 530, 160, 546);
            g.closePath();
        };
        const TC = { x: 94, y: 446, ux: -0.69, uy: -0.72 };     // tâm + trục ngón cái (hướng về đầu ngón)
        const palmPath = g => {
            g.beginPath();
            g.moveTo(170, 660);
            g.bezierCurveTo(128, 585, 112, 470, 136, 330);
            g.bezierCurveTo(150, 300, 165, 290, 190, 292);        // gò ngón trỏ
            g.bezierCurveTo(240, 268, 330, 282, 356, 318);         // dưới các gốc ngón
            g.bezierCurveTo(384, 380, 372, 500, 326, 660);
            g.closePath();
        };
        // ---- mặt nạ silhouette ----
        const [M, mx] = mk2();
        mx.fillStyle = '#fff';
        palmPath(mx); mx.fill();
        for (const f of F) { fingerPath(mx, ...f); mx.fill(); }
        thumbPath(mx); mx.fill();
        // ---- lớp da nền: sáng ấm ở giữa lòng bàn tay → hồng cam ở mép ----
        const base = x.createRadialGradient(240, 420, 30, 240, 420, 330);
        base.addColorStop(0, '#f6cdb4'); base.addColorStop(0.55, '#efb79a'); base.addColorStop(1, '#d9937a');
        x.fillStyle = base; x.fillRect(0, 0, W0, H0);
        x.globalCompositeOperation = 'destination-in'; x.drawImage(M, 0, 0);
        x.globalCompositeOperation = 'source-over';
        // ---- lớp bóng (vẽ trên canvas riêng, blur mềm, rồi ghép vào trong mặt nạ) ----
        const [S, sx] = mk2();
        const soft = (fn, blur) => { sx.save(); sx.filter = `blur(${blur}px)`; fn(sx); sx.filter = 'none'; sx.restore(); };
        // bóng mỗi ngón theo bề ngang (2 mép sẫm, giữa sáng) - vẽ dải gradient dọc theo ngón
        const fingerShade = (g, bx, by, L, wb, wt, a) => {
            g.save(); fingerPath(g, bx, by, L, wb, wt, a); g.clip(); g.translate(bx, by); g.rotate(a * Math.PI / 180);
            const gr = g.createLinearGradient(-wb / 2, 0, wb / 2, 0);
            gr.addColorStop(0, 'rgba(150,70,55,.5)'); gr.addColorStop(0.3, 'rgba(255,230,215,.18)'); gr.addColorStop(0.5, 'rgba(255,240,230,.3)'); gr.addColorStop(0.75, 'rgba(255,230,215,0)'); gr.addColorStop(1, 'rgba(140,60,45,.55)');
            g.fillStyle = gr; g.fillRect(-wb / 2 - 6, -L - wt, wb + 12, L + wt + wb);
            g.restore();
        };
        for (const f of F) fingerShade(sx, ...f);
        // ngón cái: bóng ngang trục (2 mép sẫm, giữa sáng), kẹp trong hình ngón cái
        sx.save(); thumbPath(sx); sx.clip();
        { const px = -TC.uy, py = TC.ux, gr = sx.createLinearGradient(TC.x - px * 40, TC.y - py * 40, TC.x + px * 40, TC.y + py * 40);
          gr.addColorStop(0, 'rgba(150,70,55,.38)'); gr.addColorStop(0.32, 'rgba(255,230,215,.18)'); gr.addColorStop(0.5, 'rgba(255,240,230,.3)'); gr.addColorStop(0.75, 'rgba(255,230,215,0)'); gr.addColorStop(1, 'rgba(140,60,45,.4)');
          sx.fillStyle = gr; sx.fillRect(0, 0, W0, H0); }
        sx.restore();
        // đầu ngón hồng (máu dưới da) + vùng đệm đầu ngón sáng
        const tip = (g, bx, by, L, wb, wt, a) => {
            g.save(); fingerPath(g, bx, by, L, wb, wt, a); g.clip(); g.translate(bx, by); g.rotate(a * Math.PI / 180);
            let gr = g.createRadialGradient(0, -L + wt * 0.5, 2, 0, -L + wt * 0.5, wt * 1.1); gr.addColorStop(0, 'rgba(255,150,140,.5)'); gr.addColorStop(1, 'rgba(255,150,140,0)');
            g.fillStyle = gr; g.fillRect(-wt * 1.2, -L - wt, wt * 2.4, wt * 2.2);
            gr = g.createRadialGradient(-wt * 0.1, -L + wt * 0.75, 1, 0, -L + wt * 0.75, wt * 0.55); gr.addColorStop(0, 'rgba(255,245,238,.55)'); gr.addColorStop(1, 'rgba(255,245,238,0)');
            g.fillStyle = gr; g.fillRect(-wt, -L - wt, wt * 2, wt * 2);
            g.restore();
        };
        soft(g => {
            for (const f of F) tip(g, ...f);
            g.save(); thumbPath(g); g.clip();
            let gr = g.createRadialGradient(48, 372, 2, 48, 372, 52); gr.addColorStop(0, 'rgba(255,150,140,.5)'); gr.addColorStop(1, 'rgba(255,150,140,0)'); g.fillStyle = gr; g.fillRect(0, 320, 140, 130);
            gr = g.createRadialGradient(46, 378, 1, 46, 378, 26); gr.addColorStop(0, 'rgba(255,245,238,.5)'); gr.addColorStop(1, 'rgba(255,245,238,0)'); g.fillStyle = gr; g.fillRect(10, 345, 90, 70);
            g.restore();
        }, 3);
        // nếp đốt ngón: 2 nếp mỗi ngón, cong theo ngón, sẫm mảnh + sáng ngay dưới (có độ lõm)
        const crease = (g, bx, by, L, wb, wt, a, ks) => {
            g.save(); fingerPath(g, bx, by, L, wb, wt, a); g.clip(); g.translate(bx, by); g.rotate(a * Math.PI / 180); g.lineCap = 'round';
            for (const k of ks) {
                const y = -L * k, w = lerp(wb, wt, k) * 0.34;
                g.strokeStyle = 'rgba(150,72,58,.55)'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(-w, y); g.quadraticCurveTo(0, y + 7, w, y); g.stroke();
                g.strokeStyle = 'rgba(255,238,228,.5)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-w * 0.9, y + 3.5); g.quadraticCurveTo(0, y + 10, w * 0.9, y + 3.5); g.stroke();
                g.strokeStyle = 'rgba(150,72,58,.28)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-w * 0.85, y - 5); g.quadraticCurveTo(0, y + 1, w * 0.85, y - 5); g.stroke();
            }
            g.restore();
        };
        soft(g => {
            for (const f of F) crease(g, ...f, [0.17, 0.5]);
            // nếp khớp ngón cái: ngang trục tại giữa ngón
            g.save(); thumbPath(g); g.clip(); g.lineCap = 'round';
            const px = -TC.uy, py = TC.ux, cx = TC.x + TC.ux * 4, cy = TC.y + TC.uy * 4;
            g.strokeStyle = 'rgba(150,72,58,.5)'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(cx - px * 24, cy - py * 24); g.quadraticCurveTo(cx - TC.ux * 5, cy - TC.uy * 5, cx + px * 24, cy + py * 24); g.stroke();
            g.strokeStyle = 'rgba(255,238,228,.45)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(cx - px * 22 - TC.ux * 3, cy - py * 22 - TC.uy * 3); g.quadraticCurveTo(cx - TC.ux * 8, cy - TC.uy * 8, cx + px * 22 - TC.ux * 3, cy + py * 22 - TC.uy * 3); g.stroke();
            g.restore();
        }, 0.6);
        // lòng bàn tay: gò ngón cái sáng phồng, gò út sáng nhẹ, hõm giữa sẫm, kẽ ngón sẫm (ambient occlusion)
        soft(g => {
            const rg = (px, py, r, c0, c1) => { const gr = g.createRadialGradient(px, py, 2, px, py, r); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2); };
            rg(178, 520, 120, 'rgba(255,240,228,.55)', 'rgba(255,240,228,0)');      // gò ngón cái
            rg(330, 480, 85, 'rgba(255,236,224,.35)', 'rgba(255,236,224,0)');       // gò út
            rg(250, 405, 90, 'rgba(160,80,62,.28)', 'rgba(160,80,62,0)');           // hõm lòng bàn tay
            for (const [px, py] of [[200, 300], [256, 290], [310, 300], [160, 432]]) rg(px, py, 30, 'rgba(120,55,42,.45)', 'rgba(120,55,42,0)');   // kẽ ngón
            const pd = g.createLinearGradient(0, 275, 0, 345); pd.addColorStop(0, 'rgba(245,160,140,.38)'); pd.addColorStop(1, 'rgba(245,160,140,0)');
            g.fillStyle = pd; g.fillRect(130, 268, 240, 80);                        // đệm dưới gốc ngón hồng
        }, 6);
        // chỉ tay: đường tim · đường trí · đường đời (sẫm mảnh + sáng kề dưới), mềm
        soft(g => {
            const line = (pts) => {
                for (const [dy, col, w] of [[0, 'rgba(150,72,58,.55)', 2.4], [2.6, 'rgba(255,238,228,.45)', 1.4]]) {
                    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(pts[0], pts[1] + dy); g.bezierCurveTo(pts[2], pts[3] + dy, pts[4], pts[5] + dy, pts[6], pts[7] + dy); g.stroke();
                }
            };
            line([356, 352, 300, 372, 236, 362, 182, 335]); line([150, 392, 205, 400, 272, 392, 338, 420]); line([164, 345, 182, 430, 192, 510, 212, 600]);
        }, 0.7);
        x.globalCompositeOperation = 'source-atop'; x.drawImage(S, 0, 0);
        // ---- chiều sâu: bóng trong ở mép dưới-phải + viền sáng ở mép trên-trái (silhouette dời + blur, ghép trong mặt nạ) ----
        const [I, ix] = mk2();
        ix.drawImage(M, 0, 0);
        ix.globalCompositeOperation = 'destination-out'; ix.filter = 'blur(10px)'; ix.drawImage(M, -8, -10); ix.filter = 'none';
        ix.globalCompositeOperation = 'source-in'; ix.fillStyle = 'rgba(120,50,38,.55)'; ix.fillRect(0, 0, W0, H0);
        x.drawImage(I, 0, 0);
        const [R2, rx] = mk2();
        rx.drawImage(M, 0, 0);
        rx.globalCompositeOperation = 'destination-out'; rx.filter = 'blur(6px)'; rx.drawImage(M, 5, 6); rx.filter = 'none';
        rx.globalCompositeOperation = 'source-in'; rx.fillStyle = 'rgba(255,245,235,.6)'; rx.fillRect(0, 0, W0, H0);
        x.drawImage(R2, 0, 0);
        // da bóng nhẹ (như clip) + cổ tay mờ dần ở mép dưới
        const bl = x.createRadialGradient(215, 360, 10, 215, 360, 320); bl.addColorStop(0, 'rgba(255,250,245,.16)'); bl.addColorStop(1, 'rgba(255,250,245,0)');
        x.fillStyle = bl; x.fillRect(0, 0, W0, H0);
        x.globalCompositeOperation = 'destination-out';
        const wf = x.createLinearGradient(0, 575, 0, 660); wf.addColorStop(0, 'rgba(0,0,0,0)'); wf.addColorStop(1, 'rgba(0,0,0,1)');
        x.fillStyle = wf; x.fillRect(0, 575, W0, 85);
        x.globalCompositeOperation = 'source-over';
        HAND = c;
        return c;
    }
    // d = hướng tay đi (vector đơn vị). Tay đi sang trái thì LẬT GƯƠNG (ngón vẫn chỉ lên), nghiêng theo thành phần dọc.
    if (typeof window !== 'undefined') window.__hpHandSprite = handSprite;      // soi sprite lúc chỉnh hình
    // Ảnh bàn tay THU SẴN về đúng cỡ vẽ (1 lần / lượt, chống khựng): mỗi khung chỉ chép ảnh nhỏ, không co ảnh 720 px.
    const HAND_IMG = new Map();      // file → { c, h, src }
    function handImg(file, hD) {
        const m = file ? env.media(file) : null;
        if (!m || m.isVideo || !m.el.complete || !m.el.naturalWidth) return null;
        const h = Math.max(8, Math.round(hD)), old = HAND_IMG.get(file);
        if (old && old.src === m.el && (hD <= 1 || old.h === h)) return old.c;
        if (hD <= 1) return m.el;                                        // chỉ hỏi "đã nạp chưa"
        const im = m.el, c = document.createElement('canvas');
        c.height = h; c.width = Math.max(8, Math.round(im.naturalWidth * h / im.naturalHeight));
        const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, c.width, c.height);
        HAND_IMG.set(file, { c, h, src: im });
        return c;
    }
    // vẽ 1 ảnh tay: tâm lòng bàn tay (a) đặt ở (x, y) lệch xuống 12 % cỡ (như ban-tay.png vẽ giữa); ghosts = số bóng mờ phía sau
    function putHand(c, x, y, hD, a, d, blurLen, alpha, ghosts) {
        const w = c.width * hD / c.height, flip = d[0] < -0.01, ang = Math.atan2(d[1], Math.abs(d[0])) + 0.18;
        const ox = -a[0] * w, oy = -(a[1] - 0.12) * hD;
        const put = (px, py) => { ctx.setTransform(1, 0, 0, 1, px + fx.sx, py + fx.sy); if (flip) ctx.scale(-1, 1); ctx.rotate(ang); ctx.drawImage(c, ox, oy, w, hD); };
        for (let i = ghosts; i >= 0; i--) { const o = ghosts ? blurLen * i / ghosts : 0; ctx.globalAlpha = alpha * (i ? 0.5 / (ghosts + 1) : 1); put(x - d[0] * o, y - d[1] * o); }
    }
    // key / key2 / mix: ảnh trong bộ nhiều góc theo pha (mix 0..1 = chuyển dần sang key2); ảnh riêng / sprite vẽ mã thì bỏ qua key
    function drawHand(x, y, hs, d, blurLen, alpha, key, key2, mix) {
        const H0 = env.hands, file = fx.sc.handFile;
        ctx.save();
        if (H0 && file && file === H0.file && H0.set[key] && handImg(H0.set[key].file, 1)) {
            const one = (k, al) => { const h = H0.set[k], hD = hs * 1.3 * h.k, c = handImg(h.file, hD); if (c) putHand(c, x, y, hD, h.a, d, blurLen, al, h.blur ? 0 : 3); };
            if (key2 && key2 !== key && mix > 0) { if (mix < 0.5) { one(key, alpha); one(key2, alpha * mix * 2); } else { one(key2, alpha); one(key, alpha * (1 - mix) * 2); } }
            else one(key, alpha);
        } else {
            // ảnh bàn tay riêng (handFile) nếu có và đã nạp; không thì sprite vẽ mã. Ảnh thật kèm cổ tay dài → phóng to để lòng bàn tay cỡ như tay vẽ
            const photo = file ? handImg(file, hs * 1.3) : null, c = photo || handSprite(), hD = photo ? hs * 1.3 : hs;
            putHand(c, x, y, hD, [0.5, 0.62], d, blurLen, alpha, 5);
        }
        ctx.restore();
    }
    // người bay: tâm (x, y), xoay rot, lật gương mir, kèm vệt nhoè (các vị trí trước đó trên cùng đường bay)
    function drawFlyer(g, pts) {
        if (!person.ready || !person.img || !person.M) return;
        const ph = g.floorY - g.head.y, M = person.M;
        pts.forEach((q, i) => {
            ctx.save();
            ctx.globalAlpha = q.a;
            ctx.translate(q.x + fx.sx, q.y + fx.sy); ctx.rotate(q.r); ctx.scale(q.s * q.m, q.s * q.st);
            ctx.translate(-g.cx, -(g.floorY - ph / 2));
            ctx.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
            ctx.drawImage(person.img, 0, 0);
            ctx.restore();
        });
    }
    // 8 hướng (vector người bị văng đi) - lượt sau khác hướng lượt trước, ưu tiên ngang như clip
    const SLAP_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.75, 0.66], [-0.75, -0.66], [-0.75, 0.66], [0.75, -0.66]];
    function slapStart(f) {
        const R = Math.random, n = f.p.hits.length, dirs = [];
        for (let i = 0; i < n; i++) {
            let d;
            if (i === 0) d = R() < 0.5 ? SLAP_DIRS[0] : SLAP_DIRS[1];
            else if (i === 1) d = [-dirs[0][0], -dirs[0][1]];                         // tát ngược lại như clip
            else { do d = SLAP_DIRS[Math.floor(R() * SLAP_DIRS.length)]; while (d === dirs[i - 1] || (d[0] === dirs[i - 1][0] && d[1] === dirs[i - 1][1])); }
            dirs.push(d);
        }
        // tư thế mỗi lần bay: nghiêng gốc (nằm ngang / chúc đầu / lộn ngược / chéo) + tốc độ lộn vòng + lật gương + kéo dài
        f.poses = dirs.map(() => ({ tilt: [Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI * 0.75, -Math.PI / 4][Math.floor(R() * 5)], spin: (R() < 0.5 ? -1 : 1) * (5 + R() * 9),
            m: R() < 0.5 ? -1 : 1, st: 0.9 + R() * 0.3 }));
        f.dirs = dirs; f.trail = [];
    }
    function slapFrame(f, e, dt, g) {
        const P = f.p, n = P.hits.length, ph = g.floorY - g.head.y, cx = g.cx, cy = g.floorY - ph / 2;
        const far = Math.max(W, H) * 0.72, SWP = 300, FOL = 260, OUT = 380, IN = 380, hs = Math.max(H * 0.26, ph * 0.55);
        // thu sẵn cả bộ ảnh tay về cỡ vẽ ngay khung đầu (tay chưa hiện) - giữa cú tát không phải co ảnh
        if (!f.handPrep && env.hands && fx.sc.handFile === env.hands.file) { f.handPrep = 1; for (const h of Object.values(env.hands.set)) handImg(h.file, hs * 1.3 * h.k); }
        P.hits.forEach((h, i) => {
            const d = f.dirs[i];
            cue(f, e, 'sw' + i, h - SWP, (X, v) => X.whoosh(SWP / 1000 + 0.05, { vol: v * 0.45, f0: 700, f1: 2600, dir: d[0] }));
            cue(f, e, 'hit' + i, h, (X, v) => { X.slap(1.2, { vol: v, pan: d[0] * 0.3 }); X.whoosh(OUT / 1000, { vol: v * 0.55, f0: 400, f1: 1500, dir: d[0] }); });
            if (i > 0) cue(f, e, 'in' + i, h - IN, (X, v) => X.whoosh(IN / 1000, { vol: v * 0.35, f0: 1400, f1: 500, dir: -f.dirs[i - 1][0] }));
        });
        cue(f, e, 'back', P.backA, (X, v) => X.whoosh((P.land - P.backA) / 1000, { vol: v * 0.4, f0: 1400, f1: 400, dir: -f.dirs[n - 1][0] }));
        cue(f, e, 'land', P.land, (X, v) => { X.thud(1, { vol: v }); X.rustle(0.3, { vol: v * 0.6 }); });
        let sh = 0;
        for (const h of P.hits) sh = Math.max(sh, shakeAt(f, e, h, 260, 30));
        sh = Math.max(sh, shakeAt(f, e, P.land, 250, 14));
        f.sx = sh ? (Math.random() - 0.5) * sh : 0; f.sy = sh ? (Math.random() - 0.5) * sh : 0;
        // --- người: vị trí / tư thế theo pha ---
        let q = null, moving = false;
        const last = P.hits[n - 1];
        for (let i = 0; i < n && !q; i++) {
            const h = P.hits[i], d = f.dirs[i], po = f.poses[i];
            if (e >= h && e < h + OUT && !(i === n - 1 && e >= P.backA)) {
                // văng đi: nhanh dần ra khỏi khung, lộn vòng
                const k = (e - h) / OUT, s = easeIn(k) * 0.75 + k * 0.25;
                q = { x: cx + d[0] * far * s, y: cy + d[1] * far * s, r: po.tilt * Math.min(1, k * 3) + po.spin * (e - h) / 1000, m: po.m, st: po.st, s: 1 };
            } else if (i > 0 && e >= h - IN && e < h) {
                // bay ngược về giữa (từ phía vừa văng ra) đón cú tát kế
                const dp = f.dirs[i - 1], pp = f.poses[i - 1], k = (e - (h - IN)) / IN, s = 1 - easeOut(k);
                q = { x: cx + dp[0] * far * s, y: cy + dp[1] * far * s, r: pp.tilt + pp.spin * 0.3 * s, m: pp.m, st: pp.st, s: 1 };      // bay về vẫn nằm nghiêng như lúc văng đi
            }
        }
        if (q) moving = true;
        else if (e >= P.backA && e < P.land) {
            // lượt cuối: bay về, dựng thẳng người dần, đáp xuống
            const k = (e - P.backA) / (P.land - P.backA), dl = f.dirs[n - 1], s = 1 - easeOut(k);
            q = { x: cx + dl[0] * far * s, y: cy + dl[1] * far * s - Math.sin(k * Math.PI) * ph * 0.15, r: s * Math.PI * 1.2, m: 1, st: 1, s: 1 };
            moving = true;
        } else if (e >= P.land) {
            const k = clamp01((e - P.land) / 320), sq = 1 - Math.sin(k * Math.PI) * 0.15 * (1 - k * 0.5);
            q = { x: cx, y: g.floorY - sq * ph / 2, r: 0, m: 1, st: sq, s: 1 };
        } else if (e >= last + OUT) q = { x: -9999, y: -9999, r: 0, m: 1, st: 1, s: 1 };      // (khoảng trống giữa văng cuối và bay về)
        // vệt nhoè: giữ 7 vị trí gần nhất lúc đang bay
        if (q && moving) { f.trail.unshift(q); if (f.trail.length > 7) f.trail.length = 7; } else f.trail.length = 0;
        if (!q) drawPersonPlain(f.sx, f.sy);
        else {
            const pts = f.trail.length > 1 ? f.trail.slice(1).reverse().map((t, j, arr) => ({ ...t, a: 0.08 + 0.22 * (j + 1) / arr.length })) : [];
            pts.push({ ...q, a: 1 });
            drawFlyer(g, pts);
        }
        // --- tay: lao tới từ phía -d, nhanh dần, CHẠM mép người đúng mốc tát, rồi đi tiếp chậm lại + mờ (luôn thấy rõ như clip) ---
        P.hits.forEach((h, i) => {
            if (e < h - SWP - 80 || e > h + FOL + 140) return;
            const d = f.dirs[i], contact = Math.abs(d[0]) * g.w * 0.38 + Math.abs(d[1]) * ph * 0.42;
            let s, blur, al;
            // ảnh theo pha (bộ nhiều góc): tát xuôi = cạnh tay lao tới (ngang) / lòng bàn tay (dọc, chéo) → ảnh nhoè lúc nhanh nhất → lòng bàn
            // tay lúc chạm; tát ngược lại (lượt lẻ) = mu bàn tay cả cú
            const back = i % 2 === 1, horiz = Math.abs(d[0]) > 0.9, A = back ? 'mu' : horiz ? 'nghieng' : 'camera', B = back ? 'mu' : horiz ? 'luot' : 'nhoe', C = back ? 'mu' : 'camera';
            let key, key2, mix;
            if (e < h) { const k = clamp01((e - (h - SWP)) / SWP); s = lerp(-(contact + hs * 1.7), -contact, easeIn(k)); blur = hs * 0.9 * easeIn(k); al = clamp01((e - (h - SWP - 80)) / 80); key = A; key2 = B; mix = clamp01((k - 0.45) / 0.2); }
            else { const k = clamp01((e - h) / FOL); s = lerp(-contact, hs * 0.7, easeOut(k)); blur = hs * 0.7 * (1 - k); al = 1 - clamp01((e - h - FOL) / 140); key = B; key2 = C; mix = clamp01((k - 0.12) / 0.25); }
            const hx = cx + d[0] * s, hy = cy - ph * 0.1 * Math.abs(d[0]) + d[1] * s;
            drawHand(hx, hy, hs, d, blur, al, key, key2, mix);
        });
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        // loé trắng + sao va chạm lúc trúng
        for (const h of P.hits) if (e >= h && e < h + 160) {
            const k = (e - h) / 160, r = hs * (0.4 + 0.8 * k);
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            const gr = ctx.createRadialGradient(cx, cy - ph * 0.15, 0, cx, cy - ph * 0.15, r);
            gr.addColorStop(0, `rgba(255,255,255,${0.85 * (1 - k)})`); gr.addColorStop(1, 'rgba(255,240,200,0)');
            ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy - ph * 0.15, r, 0, TAU); ctx.fill();
            ctx.strokeStyle = `rgba(255,250,220,${1 - k})`; ctx.lineWidth = 6; ctx.lineCap = 'round';
            for (let j = 0; j < 10; j++) { const an = j / 10 * TAU, r0 = r * 0.35, r1 = r * (0.7 + (j % 2) * 0.3); ctx.beginPath(); ctx.moveTo(cx + Math.cos(an) * r0, cy - ph * 0.15 + Math.sin(an) * r0); ctx.lineTo(cx + Math.cos(an) * r1, cy - ph * 0.15 + Math.sin(an) * r1); ctx.stroke(); }
            ctx.restore();
        }
    }

    // ---------- lượt ----------
    // 👻 🪞 🫠 🎈 📱 🎨 đợt 4 vẽ ở file riêng (fx-morph-more.mjs)
    const more = createMore({ ctx, W, H, cue, shakeAt, drawPersonPlain, snapInto, mk, rng });
    const FRAMES = { ice: iceFrame, pixel: pixelFrame, zap: zapFrame, vacuum: vacuumFrame, bees: beesFrame, slap: slapFrame, fly: (f, e, dt, g) => fly.frame(f, e, dt, g) };
    for (const st of more.styles) FRAMES[st] = (f, e, dt, g) => more.frame(f, e, dt, g);
    // Trả NGAY bộ nhớ GPU của canvas dùng một lượt (atlas mảnh băng / khối điểm ảnh rộng tới 2048 px, vân nứt): canvas chỉ được giải phóng
    // khi trình duyệt dọn rác lớn - heap JS nhỏ thì hiếm khi dọn → spam 100 lượt dồn hàng trăm MB GPU, trang chậm dần (NPC đo 2026-11-03:
    // sau 120 lượt luồng chính bị chặn 49-71 % ở 🧊 / ⚡, nạp lại trang còn 5-12 %; tiến trình GPU +115 MB / 12 lượt).
    const freeCanvas = c => { if (c && c.width) { c.width = 0; c.height = 0; } };
    function release(f) {
        if (!f) return;
        if (f.atlas) freeCanvas(f.atlas.c);
        if (f.grid) freeCanvas(f.grid.atlas);
        f.atlas = null; f.grid = null; f.qb = null;
        for (const c of FACET.values()) freeCanvas(c);
        FACET.clear();
        if (more.release) more.release(f);
    }
    function start(d, now) {
        release(fx);
        person = env.person();
        const sc = d.script, seed = (Math.random() * 1e9) | 0;
        fx = { d, sc, start: now, p: env.plan(sc), cue: new Set(), rand: rng(seed), seed: (seed % 1000) / 100, sx: 0, sy: 0,
               statue: null, shards: null, grid: null, mist: [], smoke: [], smokeAcc: 0, sparks: [], sparkAt: -1, side: null, bees: [], bz: null, track: {}, qb: null, qkey: '', qat: 0, swatAt: 0, cloud: false, eyeDrop: null, flick: null, flickEnd: 0, bolt: null, boltKey: '', tx: null, tilt: 0 };
        if (sc.style === 'ice') iceStart(fx);
        if (sc.style === 'slap') slapStart(fx);
        if (sc.style === 'fly') fly.start(fx);
        if (more.styles.includes(sc.style)) more.start(fx);
                return true;
    }
    function stop() { release(fx); fx = null; }
    const estMs = () => (fx ? fx.p.end : 0);
    function frame(now, dt, eFix) {
        if (!fx) return true;
        person = env.person();
        const f = fx, e = eFix != null ? eFix : now - f.start;
        const g = geom();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        // rung màn (mốc va chạm của khung trước): dời nền + người cùng lúc, nền vẽ dư mép
        if (f.sc.style === 'fly' && fly.covers(f, e)) { /* 🐉 cảnh trời phủ kín - không vẽ phòng sạch (đỡ khựng) */ }
        else if (f.sx || f.sy) { ctx.translate(f.sx, f.sy); env.backdrop(40, null); ctx.setTransform(1, 0, 0, 1, 0, 0); }
        else env.backdrop(4, null);
        (FRAMES[f.sc.style] || iceFrame)(f, e, dt || 0, g);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.imageSmoothingEnabled = true;
        if (e >= f.p.end) { stop(); return true; }
        return false;
    }
    return { start, stop, frame, estMs, get fx() { return fx; }, playing: () => [], preload: () => [] };
}
