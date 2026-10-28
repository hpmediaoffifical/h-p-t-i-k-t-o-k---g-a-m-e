// overlays/camgames/body/fx-cry.mjs - 😭 KHÓC LÓC (lớp mặt của 🧍 Bộ Tách Người): nước mắt HOẠT HÌNH bám 2 mắt thật.
//
// Nhận diện: overlay chạy MediaPipe FaceLandmarker (hp-tracking.mjs → face.eyes L/R, nose, chin, cheek…, toạ độ sân khấu đã áp
// tư thế hồ sơ NPC). Mô-đun này CHỈ vẽ, không giữ hàng chờ (overlay.html giữ: cQueue / cry, hàng 📋, mp3).
//
// Một lượt (durSec × số combo) kiểu 😭 khóc, có "tăng dần" (ramp):
//   A rơm rớm  : mắt long lanh - lấp lánh sao + màng nước mỏng dâng ở mí dưới
//   B chảy     : dải nước xanh trong mờ từ mí dưới chảy xuống má (mép gợn sóng, vệt sáng, giọt tách ở đuôi), giọt văng nhẹ khoé ngoài
//   C phun vòi : giọt bắn ào 2 bên như anime (bùng 1 đợt lúc vào), dòng dày hơn, mũi đỏ + má hồng đậm nhất
//   Không "tăng dần" = giữ mức B+ suốt lượt. 😂 cười ra nước mắt: không rơm rớm, giọt bắn NGANG to hơn, dòng ngắn, chữ HA HA bật ra.
// Mất mặt > 0,5 s → mờ dần (giọt đang bay vẫn rơi hết). Lượt hành động (Rơi Hố / Bị Đuổi / 🎬) đang vẽ lại người → tạm dừng đồng hồ.
//
//   const cry = createCry({ ctx, W, H, face: () => F | null, view?: () => { x, y, w, h } });
//   view: 👁 vùng sân khấu còn thấy trên OBS (Scene PK cắt ô) - vũng nước dâng từ ĐÁY vùng thấy, mây rơi vào từ MÉP TRÊN vùng thấy.
//   cry.start({ script, units }, now) · cry.extend(units) · cry.frame(now, dt, paused) → true khi xong · cry.stop() · cry.estMs()

const TAU = Math.PI * 2;
const FADE = 0.6;                  // s - mờ dần cuối lượt (khớp CRY_FADE_MS ở core.cjs)
const LOST = 0.5;                  // s - mất mặt lâu hơn mức này → ẩn
const MAX_DROPS = 220;
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = t => t * t * (3 - 2 * t);
const easeOut = t => 1 - (1 - t) * (1 - t);
const lerp = (a, b, k) => a + (b - a) * k;
const rnd = (a, b) => a + Math.random() * (b - a);

function hexRgb(h) { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const mix = (c, d, k) => [Math.round(lerp(c[0], d[0], k)), Math.round(lerp(c[1], d[1], k)), Math.round(lerp(c[2], d[2], k))];

export function createCry(env) {
    const { ctx, W, H } = env;
    const FULL = { x: 0, y: 0, w: W, h: H };
    const viewNow = () => (env.view && env.view()) || FULL;
    let fx = null;                 // lượt đang chạy
    let S = null;                  // mặt đã làm mượt (EMA) - giữ lại lúc mất mặt
    let seenAt = -1e9, vis = 0;    // lần cuối thấy mặt (giờ lượt) · độ hiện 0..1

    // ---------- làm mượt điểm mặt ----------
    const PTS = ['nose', 'chin', 'brow', 'cheekL', 'cheekR', 'mouth', 'mouthL', 'mouthR'];
    const EYE = ['outer', 'inner', 'upper', 'lower', 'c'];
    function smooth(F, dt, snap) {
        const k = snap ? 1 : Math.min(1, dt * 16);
        const pt = (o, n) => { if (!o) return { x: n.x, y: n.y }; o.x += (n.x - o.x) * k; o.y += (n.y - o.y) * k; return o; };
        if (!S || snap) S = { eyes: { L: {}, R: {} } };
        for (const p of PTS) S[p] = pt(S[p], F[p]);
        for (const side of ['L', 'R']) {
            const e = F.eyes[side], s = S.eyes[side];
            for (const q of EYE) s[q] = pt(s[q], e[q]);
            s.w = s.w ? s.w + (e.w - s.w) * k : e.w;
            s.open = s.open == null ? e.open : s.open + (e.open - s.open) * k;
        }
        S.roll = S.roll == null || snap ? F.roll : S.roll + (F.roll - S.roll) * k;
        S.bs = F.bs || {};
    }
    // Khung đầu: u = trục ngang mặt (R→L), dn = hướng cằm, ew = cỡ mắt trung bình (mọi kích thước tính theo ew → xa gần cam đều hợp).
    function frameOf() {
        const L = S.eyes.L, R = S.eyes.R;
        const mid = { x: (L.c.x + R.c.x) / 2, y: (L.c.y + R.c.y) / 2 };
        let dx = S.chin.x - mid.x, dy = S.chin.y - mid.y, n = Math.hypot(dx, dy) || 1;
        const dn = { x: dx / n, y: dy / n };
        dx = L.c.x - R.c.x; dy = L.c.y - R.c.y; n = Math.hypot(dx, dy) || 1;
        const u = { x: dx / n, y: dy / n };
        const ew = Math.max(14, (L.w + R.w) / 2);
        const out = e => { let ox = e.outer.x - e.inner.x, oy = e.outer.y - e.inner.y; const m = Math.hypot(ox, oy) || 1; return { x: ox / m, y: oy / m }; };
        return { mid, dn, u, ew, faceW: Math.hypot(L.outer.x - R.outer.x, L.outer.y - R.outer.y), ang: Math.atan2(dn.y, dn.x) - Math.PI / 2, outL: out(L), outR: out(R) };
    }

    // ---------- lượt ----------
    function start(d, now) {
        const sc = d.script;
        const units = Math.max(1, Math.floor(Number(d.units) || 1));
        const base = hexRgb(sc.color);
        fx = {
            sc, units, t: 0, total: sc.durSec * units, laugh: sc.mood === 'laugh',
            col: { base, deep: mix(base, [40, 110, 200], 0.45), pale: mix(base, [255, 255, 255], 0.55) },
            mult: [0.62, 1, 1.45][(sc.intensity || 2) - 1],
            drops: [], texts: [], acc: { L: 0, R: 0 }, drip: { L: 0.2, R: 0.45 }, ha: 0, burst: false,
            stream: { L: { on: 0 }, R: { on: 0 } }, lastHa: 'L', ew: 50,
            v: viewNow(),                                                       // 👁 vùng thấy (cập nhật mỗi khung)
            pool: { level: 0, rings: [], bubbles: [], splash: [], bub: 0 },     // 💧 vũng nước: level = % chiều cao vùng thấy
            cloud: { x: 0, y: 0, w: 0, ok: false, rain: [], acc: 0, flash: 0, bolt: null, nextBolt: 0 }   // ☁️ mây mưa trên đầu
        };
        S = null; seenAt = -1e9; vis = 0;
        return fx;
    }
    function extend(units) { if (fx) { fx.units += units; fx.total = fx.sc.durSec * fx.units; } }
    function stop() { fx = null; S = null; }
    const estMs = () => (fx ? Math.round(fx.total * 1000 + FADE * 1000) : 0);
    // Mức khóc 0..1 theo thời điểm (ramp): A ≈ 0 → B 0,45 → C 1; không ramp: 0,75 đều. 😂: lên 1 trong 0,25 s.
    function phases(f) {
        const T = f.total;
        if (f.laugh) return { a1: 0, c1: 0 };
        if (!f.sc.ramp) return { a1: 0, c1: 0 };
        const a1 = Math.min(1.4, Math.max(0.6, T * 0.18));
        return { a1, c1: Math.max(a1 + 1.2, T * 0.5) };
    }
    function power(f) {
        const t = f.t, { a1, c1 } = phases(f);
        if (f.laugh) return Math.min(1, t / 0.25);
        if (!f.sc.ramp) return Math.min(0.75, t / 0.4 * 0.75);
        if (t < a1) return 0;
        if (t < c1) return 0.45 * ease(clamp01((t - a1) / 0.35));
        return lerp(0.45, 1, ease(clamp01((t - c1) / 0.3)));
    }
    // Độ long lanh (màng nước + sao): dâng trong pha A rồi giữ.
    function glisten(f) {
        const { a1 } = phases(f);
        if (f.laugh) return Math.min(1, f.t / 0.3);
        return a1 > 0 ? ease(clamp01(f.t / a1)) : Math.min(1, f.t / 0.4);
    }

    // ---------- hạt ----------
    function spawnDrop(f, H0, side, p, speedK, elev) {
        if (f.drops.length >= MAX_DROPS) f.drops.shift();
        const e = S.eyes[side], o = side === 'L' ? H0.outL : H0.outR, up = { x: -H0.dn.x, y: -H0.dn.y };
        const el = elev * (Math.PI / 180), ca = Math.cos(el), sa = Math.sin(el);
        const dir = { x: o.x * ca + up.x * sa, y: o.y * ca + up.y * sa };
        const v = H0.ew * (4.2 + 3.6 * p) * speedK * rnd(0.78, 1.22);
        const r = H0.ew * (0.085 + 0.075 * p) * Math.sqrt(f.mult) * rnd(0.72, 1.28) * (f.laugh ? 1.25 : 1);
        // Có vũng nước: giọt sống tới khi chạm nước / ra khỏi màn (không tan giữa trời); không thì tan sau 1,1–1,7 s.
        f.drops.push({ x: e.outer.x + o.x * H0.ew * 0.12, y: e.outer.y, vx: dir.x * v, vy: dir.y * v, r, age: 0, life: f.sc.puddle ? 6 : rnd(1.1, 1.7), w: rnd(0, TAU) });
    }
    function spawnDrip(f, H0, x, y, speed) {
        if (f.drops.length >= MAX_DROPS) f.drops.shift();
        f.drops.push({ x, y, vx: H0.dn.x * speed + rnd(-0.3, 0.3) * speed, vy: H0.dn.y * speed, r: H0.ew * 0.11 * Math.sqrt(f.mult), age: 0, life: f.sc.puddle ? 6 : 1.6, w: 0 });
    }
    function spawnHa(f, H0) {
        const side = f.lastHa === 'L' ? 'R' : 'L'; f.lastHa = side;
        const m = side === 'L' ? S.mouthL : S.mouthR, o = side === 'L' ? H0.outL : H0.outR, up = { x: -H0.dn.x, y: -H0.dn.y };
        const v = H0.ew * rnd(2.6, 3.6);
        // Bật ra từ BÊN NGOÀI khoé miệng (≥ 1 ew) và bay ra xa - chữ không đè lên miệng / mũi.
        f.texts.push({ x: m.x + o.x * H0.ew * 1.1, y: m.y + o.y * H0.ew * 1.1, vx: (o.x * 0.9 + up.x * 0.5) * v, vy: (o.y * 0.9 + up.y * 0.5) * v, age: 0, life: 1.15,
            rot: rnd(-0.35, 0.35) + (o.x < 0 ? -0.15 : 0.15), size: H0.ew * rnd(0.62, 0.8), txt: Math.random() < 0.5 ? 'HA' : 'HA HA', side });
    }
    function stepParticles(f, dt) {
        const g = f.ew * 9.5, wet = f.sc.puddle && f.pool.level > 0.3;
        for (let i = f.drops.length - 1; i >= 0; i--) {
            const d = f.drops[i];
            d.age += dt; d.vy += g * dt; d.vx *= (1 - 0.6 * dt); d.x += d.vx * dt; d.y += d.vy * dt;
            if (d.age > d.life || d.y > f.v.y + f.v.h + 60 || d.x < -80 || d.x > W + 80) { f.drops.splice(i, 1); continue; }
            // chạm mặt nước: nổ vòng sóng + bắn vài tia nhỏ (tia nhỏ rơi lại thì chỉ biến mất)
            if (wet && d.vy > 0) { const sy = poolTop(f, d.x); if (d.y >= sy) { if (!d.tiny) splashAt(f, d.x, sy, d.r); f.drops.splice(i, 1); } }
        }
        for (let i = f.texts.length - 1; i >= 0; i--) {
            const x = f.texts[i];
            x.age += dt; x.vx *= (1 - 2.2 * dt); x.vy *= (1 - 2.2 * dt); x.x += x.vx * dt; x.y += x.vy * dt;
            if (x.age > x.life) f.texts.splice(i, 1);
        }
    }

    // ---------- 💧 vũng nước dâng từ đáy vùng thấy (cả sân khấu khi không bị cắt) ----------
    // Mặt nước = mực + 2 lớp sóng chạy ngược chiều. Dâng theo mức khóc (khóc to dâng nhanh), hết lượt rút trong ~1,4 s.
    const poolBase = f => f.v.y + f.v.h - f.pool.level / 100 * f.v.h;
    function poolTop(f, x) {
        const t = f.t, lv = f.pool.level;
        return poolBase(f) + (5 + lv * 0.25) * Math.sin(x / 430 * TAU + t * 1.7) + 3 * Math.sin(x / 165 * TAU - t * 2.9);
    }
    function splashAt(f, x, y, r) {
        const P = f.pool;
        if (P.rings.length < 40) P.rings.push({ x, y, age: 0, life: 0.65, r0: Math.max(r * 2.2, f.ew * 0.28) });
        const n = f.drops.length > 140 ? 0 : f.drops.length > 90 ? 1 : (r > f.ew * 0.1 ? 3 : 2);   // đông hạt thì bớt tia
        for (let i = 0; i < n; i++) {
            if (f.drops.length >= MAX_DROPS) break;
            f.drops.push({ x, y: y - 2, vx: rnd(-1.6, 1.6) * f.ew, vy: -rnd(2.2, 3.8) * f.ew, r: Math.max(2.5, r * rnd(0.35, 0.55)), age: 0, life: 0.9, w: 0, tiny: true });
        }
    }
    function stepPool(f, dt, p, over) {
        const P = f.pool, sc = f.sc;
        if (!sc.puddle) { P.level = 0; return; }
        if (over) P.level = Math.max(0, P.level - sc.puddleMax / 1.4 * dt);
        else P.level = Math.min(sc.puddleMax, P.level + sc.puddleMax / Math.max(2.5, f.total * 0.8) * (0.25 + 1.1 * p) * (0.8 + 0.2 * f.mult) * dt);
        for (let i = P.rings.length - 1; i >= 0; i--) { const r = P.rings[i]; r.age += dt; if (r.age > r.life) P.rings.splice(i, 1); }
        // bong bóng nổi từ đáy, vỡ ở mặt nước
        if (P.level > 2 && !over) { P.bub -= dt; if (P.bub <= 0) { P.bub = rnd(0.25, 0.6); if (P.bubbles.length < 30) P.bubbles.push({ x: f.v.x + rnd(0.05, 0.95) * f.v.w, y: f.v.y + f.v.h + 4, r: rnd(3, 7), v: rnd(45, 90), ph: rnd(0, TAU) }); } }
        for (let i = P.bubbles.length - 1; i >= 0; i--) {
            const b = P.bubbles[i]; b.y -= b.v * dt; b.ph += dt * 4;
            if (b.y <= poolTop(f, b.x) + b.r) { P.bubbles.splice(i, 1); if (P.rings.length < 40) P.rings.push({ x: b.x, y: b.y, age: 0.2, life: 0.5, r0: b.r * 2 }); }
        }
    }
    function drawPool(f, a) {
        const P = f.pool;
        if (!f.sc.puddle || P.level <= 0.05) return;
        const base = poolBase(f), step = 22;
        ctx.save(); ctx.globalAlpha = a;
        ctx.beginPath(); ctx.moveTo(-12, poolTop(f, -12));
        for (let x = step; x <= W + 12; x += step) ctx.lineTo(x, poolTop(f, x));
        const bot = f.v.y + f.v.h;
        ctx.lineTo(W + 12, bot + 12); ctx.lineTo(-12, bot + 12); ctx.closePath();
        const g = ctx.createLinearGradient(0, base - 20, 0, bot);
        g.addColorStop(0, rgba(f.col.pale, 0.5)); g.addColorStop(0.25, rgba(f.col.base, 0.6)); g.addColorStop(1, rgba(f.col.deep, 0.82));
        ctx.fillStyle = g; ctx.fill();
        // bóng NPC phản chiếu lộn ngược quanh mặt nước (người đã tách nền, cùng tư thế đang vẽ)
        const v = env.person && env.person();
        if (v && v.ready && v.img && v.M) {
            ctx.save(); ctx.clip();
            ctx.globalAlpha = a * 0.26;
            ctx.translate(0, 2 * base); ctx.scale(1, -1);
            ctx.transform(v.M[0], v.M[1], v.M[2], v.M[3], v.M[4], v.M[5]); ctx.drawImage(v.img, 0, 0);
            ctx.restore();
        }
        // bong bóng
        for (const b of P.bubbles) {
            ctx.beginPath(); ctx.arc(b.x + Math.sin(b.ph) * 2, b.y, b.r, 0, TAU);
            ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
            ctx.beginPath(); ctx.arc(b.x + Math.sin(b.ph) * 2 - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.25, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
        }
        // mặt nước: viền sáng + dải sáng mờ dưới + vệt lấp lánh trôi
        ctx.beginPath(); ctx.moveTo(-12, poolTop(f, -12));
        for (let x = step; x <= W + 12; x += step) ctx.lineTo(x, poolTop(f, x));
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-12, poolTop(f, -12) + 11);
        for (let x = step; x <= W + 12; x += step) ctx.lineTo(x, poolTop(f, x) + 11);
        ctx.strokeStyle = rgba(f.col.pale, 0.35); ctx.lineWidth = 7; ctx.stroke();
        ctx.lineCap = 'round';
        for (let i = 0; i < 6; i++) {
            const x = ((i * W / 6) + f.t * 55 + i * 37) % (W + 60) - 30, k = 0.5 + 0.5 * Math.sin(f.t * 3 + i * 1.9);
            ctx.globalAlpha = a * 0.6 * k; ctx.beginPath(); ctx.moveTo(x - 9, poolTop(f, x) + 3); ctx.lineTo(x + 9, poolTop(f, x) + 3);
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
        }
        ctx.globalAlpha = a;
        // vòng sóng chỗ giọt rơi / bong bóng vỡ
        for (const r of P.rings) {
            const k = r.age / r.life, rx = r.r0 * (0.4 + 2.4 * k), ry = rx * 0.3;
            ctx.globalAlpha = a * (1 - k) * 0.85;
            ctx.beginPath(); ctx.ellipse(r.x, r.y, rx, ry, 0, 0, TAU); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
            ctx.beginPath(); ctx.ellipse(r.x, r.y, rx * 0.55, ry * 0.55, 0, 0, TAU); ctx.strokeStyle = rgba(f.col.pale, 0.8); ctx.lineWidth = 1.5; ctx.stroke();
        }
        ctx.restore();
    }

    // ---------- ☁️ mây mưa trên đầu ----------
    // Mây bám ĐỈNH ĐẦU (trán + ~1 chiều cao mặt theo hướng ngược cằm), trễ mềm; vào: rơi từ trên khung xuống, nảy nhẹ; ra: vụt lên.
    // Màu xám dần + mưa dày dần theo mức khóc; chớp loé lúc bùng phun vòi rồi thỉnh thoảng trong pha C. Mưa chạm vũng → vòng sóng.
    const CLOUD_IN = 0.55, CLOUD_OUT = 0.6;
    function cloudTarget(H0) {
        const fh = Math.hypot(S.chin.x - S.brow.x, S.chin.y - S.brow.y) || H0.ew * 4;
        const w = Math.max(H0.faceW * 2.8, H0.ew * 10);
        return { x: S.brow.x - H0.dn.x * fh * 0.95, y: S.brow.y - H0.dn.y * fh * 0.95 - w * 0.12, w };
    }
    function boltNow(f) {
        const C = f.cloud; if (!f.sc.cloud || !C.ok) return;
        const pts = [], n = 6; let x = C.x + rnd(-0.15, 0.15) * C.w, y = C.y + C.w * 0.12;
        for (let i = 0; i <= n; i++) { pts.push({ x, y }); x += rnd(-0.09, 0.09) * C.w; y += C.w * 0.075; }
        C.bolt = { pts, age: 0 }; C.flash = 1;
    }
    function stepCloud(f, dt, H0, p, emit) {
        const C = f.cloud, sc = f.sc;
        if (!sc.cloud) return;
        if (H0) {
            const tg = cloudTarget(H0);
            if (!C.ok) { C.x = tg.x; C.y = tg.y; C.w = tg.w; C.ok = true; }
            const k = Math.min(1, dt * 5);
            C.x += (tg.x - C.x) * k; C.y += (tg.y - C.y) * k; C.w += (tg.w - C.w) * k;
        }
        if (!C.ok) return;
        C.flash = Math.max(0, C.flash - dt * 4);
        if (C.bolt) { C.bolt.age += dt; if (C.bolt.age > 0.28) C.bolt = null; }
        if (emit && f.burst && f.t >= C.nextBolt) { const first = !C.nextBolt; C.nextBolt = f.t + rnd(2.2, 3.8); if (!first) boltNow(f); }
        // mưa: hạt dài rơi thẳng từ đáy mây
        if (emit && f.t >= CLOUD_IN) C.acc += (25 + 160 * p * p) * Math.sqrt(f.mult) * (C.w / 600) * dt;
        while (C.acc >= 1 && C.rain.length < 260) {
            C.acc -= 1;
            C.rain.push({ x: C.x + rnd(-0.38, 0.38) * C.w, y: C.y + C.w * 0.1, vy: rnd(1500, 1900), len: rnd(34, 60), vx: rnd(-40, 40) });
        }
        const wet = sc.puddle && f.pool.level > 0.3;
        for (let i = C.rain.length - 1; i >= 0; i--) {
            const r = C.rain[i]; r.x += r.vx * dt; r.y += r.vy * dt;
            if (r.y > f.v.y + f.v.h + 50) { C.rain.splice(i, 1); continue; }
            if (wet) { const sy = poolTop(f, r.x); if (r.y >= sy) { C.rain.splice(i, 1); if (Math.random() < 0.35 && f.pool.rings.length < 40) f.pool.rings.push({ x: r.x, y: sy, age: 0.15, life: 0.45, r0: 9 }); } }
        }
    }
    function puff(x, y, r) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
    function drawCloud(f, a, p) {
        const C = f.cloud;
        if (!f.sc.cloud || !C.ok) return;
        // vào: rơi từ mép trên vùng thấy + nảy (easeOutBack) · ra: vụt lên trong CLOUD_OUT giây cuối
        const tin = clamp01(f.t / CLOUD_IN), left = f.total - f.t;
        const back = t => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
        const top = f.v.y, dropY = (1 - back(tin)) * -(C.y - top + C.w);
        const outK = left < CLOUD_OUT ? ease(clamp01(1 - left / CLOUD_OUT)) : 0;
        const cx = C.x, cy = C.y + dropY - outK * (C.y - top + C.w * 1.2), w = C.w, sq = 1 + 0.06 * Math.sin(f.t * 2.2);
        const ca = a * (1 - outK * 0.6);
        // mưa (dưới mây)
        ctx.save(); ctx.globalAlpha = ca * 0.9; ctx.lineCap = 'round';
        ctx.strokeStyle = rgba(mix(f.col.pale, [255, 255, 255], 0.3), 0.95); ctx.lineWidth = 4.5;
        ctx.beginPath();
        for (const r of C.rain) { const k = r.len / r.vy; ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - r.vx * k, r.y - r.len); }
        ctx.stroke(); ctx.restore();
        // tia chớp
        if (C.bolt) {
            const k = 1 - C.bolt.age / 0.28;
            ctx.save(); ctx.globalAlpha = ca * k; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
            for (const [lw, col] of [[w * 0.05, 'rgba(255,240,120,0.45)'], [w * 0.018, '#fff7b0']]) {
                ctx.beginPath(); C.bolt.pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y + dropY) : ctx.moveTo(q.x, q.y + dropY)));
                ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
            }
            ctx.restore();
        }
        // thân mây: các cụm tròn, gradient trắng xám → xám đậm theo mức khóc, bóng đáy, điểm sáng trên; chớp → loé vàng
        const g0 = mix([236, 240, 247], [120, 128, 145], clamp01(p * 1.1)), g1 = mix([200, 208, 222], [72, 80, 98], clamp01(p * 1.1));
        const lit = C.flash;
        ctx.save(); ctx.globalAlpha = ca; ctx.translate(cx, cy); ctx.scale(sq, 1 / sq);
        const shape = () => {
            ctx.beginPath();
            puff(-w * 0.28, w * 0.02, w * 0.18); puff(-w * 0.08, -w * 0.08, w * 0.24); puff(w * 0.16, -w * 0.04, w * 0.2);
            puff(w * 0.33, w * 0.04, w * 0.14); puff(-w * 0.4, w * 0.07, w * 0.1);
            ctx.rect(-w * 0.4, w * 0.02, w * 0.73, w * 0.12);
        };
        ctx.save(); ctx.translate(0, w * 0.03); shape(); ctx.fillStyle = 'rgba(30,36,52,0.35)'; ctx.fill(); ctx.restore();
        shape();
        const gr = ctx.createLinearGradient(0, -w * 0.32, 0, w * 0.16);
        gr.addColorStop(0, rgba(mix(g0, [255, 255, 235], lit), 1)); gr.addColorStop(1, rgba(mix(g1, [255, 250, 210], lit), 1));
        ctx.fillStyle = gr; ctx.fill();
        ctx.beginPath(); ctx.ellipse(-w * 0.12, -w * 0.2, w * 0.1, w * 0.045, -0.3, 0, TAU); ctx.fillStyle = `rgba(255,255,255,${0.55 - 0.35 * p})`; ctx.fill();
        ctx.restore();
    }

    // ---------- vẽ ----------
    function drawDrop(f, d, a) {
        if (d.tiny) {           // tia bắn khi chạm nước: chấm tròn rẻ (không xoay / viền / điểm sáng)
            ctx.globalAlpha = a * 0.9; ctx.fillStyle = rgba(f.col.pale, 1);
            ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; return;
        }
        const r = d.r, rot = Math.atan2(d.vy, d.vx);
        ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(rot);
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.moveTo(-2.3 * r, 0);
        ctx.quadraticCurveTo(-0.6 * r, -0.98 * r, 0.25 * r, -0.97 * r);
        ctx.arc(0, 0, r, -1.32, 1.32, false);
        ctx.quadraticCurveTo(-0.6 * r, 0.98 * r, -2.3 * r, 0);
        ctx.closePath();
        ctx.fillStyle = rgba(f.col.base, 0.9); ctx.fill();
        ctx.lineWidth = Math.max(1, r * 0.14); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0.22 * r, -0.36 * r, 0.3 * r, 0.2 * r, -0.5, 0, TAU);
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
        ctx.restore();
    }
    function drawStar(x, y, r, a, rot) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = a;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.32 : r, an = i * Math.PI / 4; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, TAU); ctx.fillStyle = 'rgba(190,235,255,0.95)'; ctx.fill();
        ctx.restore();
    }
    // Màng nước dâng ở mí dưới (rơm rớm) - hình thấu kính mỏng theo chiều mắt.
    function drawWell(f, H0, e, k) {
        if (k <= 0) return;
        // Nằm NGAY DƯỚI mí dưới (không đè lên tròng mắt - màu nhạt sẽ thành "mắt trắng"), mỏng, hơi trong.
        const p = e.lower, rx = H0.ew * 0.42, ry = H0.ew * (0.035 + 0.045 * k);
        ctx.save(); ctx.translate(p.x + H0.dn.x * H0.ew * 0.07, p.y + H0.dn.y * H0.ew * 0.07); ctx.rotate(H0.ang);
        ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
        ctx.fillStyle = rgba(f.col.base, 0.38 * k); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, -ry * 0.25, rx * 0.8, ry * 0.4, 0, Math.PI, TAU);
        ctx.strokeStyle = `rgba(255,255,255,${0.6 * k})`; ctx.lineWidth = Math.max(1, H0.ew * 0.03); ctx.stroke();
        ctx.restore();
    }
    // Dải nước chảy từ mí dưới xuống má: mép gợn sóng chạy xuống, bụng phình trôi xuống, vệt sáng, đuôi tròn.
    function drawStream(f, H0, side, p, a, dt, emit) {
        const e = S.eyes[side], st = f.stream[side], o = side === 'L' ? H0.outL : H0.outR;
        const on = p > 0.02 || f.laugh;
        st.on = clamp01(st.on + (on ? dt / 0.6 : -dt / 0.4));
        if (st.on <= 0) return;
        const ew = H0.ew, sq = Math.sqrt(f.mult);
        const w = ew * (f.laugh ? 0.26 : 0.26 + 0.24 * p) * sq;
        const Lmax = ew * (f.laugh ? 0.8 : 2.3 + 1.3 * p) * (0.9 + 0.1 * sq);
        const L = Lmax * easeOut(st.on);
        const ox = e.lower.x + o.x * ew * 0.1, oy = e.lower.y + o.y * ew * 0.1;
        const t = f.t, lam = ew * 0.95, amp = w * 0.09, ph = t * 7.5 + (side === 'L' ? 1.7 : 0);
        const bulgeY = ((t * ew * 2.4 + (side === 'L' ? 0 : Lmax * 0.5)) % (Lmax + ew * 0.8)) - ew * 0.3;
        const width = y => { const b = Math.exp(-((y - bulgeY) ** 2) / (2 * (ew * 0.25) ** 2)); return w * (1 + 0.32 * b) * (1 - 0.15 * (y / Lmax)); };
        ctx.save(); ctx.translate(ox, oy); ctx.rotate(H0.ang); ctx.globalAlpha = a;
        const step = Math.max(6, ew * 0.11);
        ctx.beginPath();
        ctx.moveTo(-width(0) / 2, 0);
        for (let y = step; y <= L; y += step) ctx.lineTo(-width(y) / 2 + amp * Math.sin(y / lam * TAU - ph), y);
        ctx.lineTo(-width(L) / 2 + amp * Math.sin(L / lam * TAU - ph), L);
        ctx.arc(0, L, width(L) / 2, Math.PI, 0, true);
        for (let y = L; y >= 0; y -= step) ctx.lineTo(width(y) / 2 + amp * Math.sin(y / lam * TAU - ph + 2.1), y);
        ctx.lineTo(width(0) / 2, 0);
        ctx.closePath();
        const gr = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
        gr.addColorStop(0, rgba(f.col.deep, 0.62)); gr.addColorStop(0.38, rgba(f.col.pale, 0.7)); gr.addColorStop(0.62, rgba(f.col.base, 0.64)); gr.addColorStop(1, rgba(f.col.deep, 0.62));
        ctx.fillStyle = gr; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = Math.max(1, ew * 0.025); ctx.stroke();
        // vệt sáng trắng chạy dọc
        ctx.beginPath();
        for (let y = ew * 0.15; y <= L - ew * 0.2; y += step) { const x = -w * 0.2 + amp * 0.6 * Math.sin(y / lam * TAU - ph); if (y === ew * 0.15) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(1.2, w * 0.14); ctx.lineCap = 'round'; ctx.stroke();
        ctx.restore();
        // giọt tách khỏi đuôi dải (chỉ khi dải đã chảy đủ dài, còn trong giờ sinh hạt)
        if (emit && st.on > 0.85 && p > 0.1 && !f.laugh) {
            f.drip[side] -= dt;
            if (f.drip[side] <= 0) {
                f.drip[side] = rnd(0.45, 0.8) / (0.5 + p);
                spawnDrip(f, H0, ox + H0.dn.x * L, oy + H0.dn.y * L, ew * 1.2);
            }
        }
    }
    function drawFace(f, H0, k, a) {
        if (k <= 0) return;
        const ew = H0.ew;
        ctx.save(); ctx.globalAlpha = a;
        if (!f.laugh) {    // mũi đỏ
            const n = S.nose, r = ew * 0.5;
            const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
            g.addColorStop(0, `rgba(255,70,85,${0.5 * k})`); g.addColorStop(0.6, `rgba(255,80,95,${0.22 * k})`); g.addColorStop(1, 'rgba(255,80,95,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU); ctx.fill();
        }
        for (const c of [S.cheekL, S.cheekR]) {    // má hồng + 3 vạch chéo kiểu anime
            const rx = ew * 0.78, ry = ew * 0.42;
            ctx.save(); ctx.translate(c.x, c.y + H0.dn.y * ew * 0.1); ctx.rotate(H0.ang);
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
            g.addColorStop(0, `rgba(255,110,140,${0.42 * k})`); g.addColorStop(0.7, `rgba(255,120,150,${0.18 * k})`); g.addColorStop(1, 'rgba(255,120,150,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.fill();
            ctx.strokeStyle = `rgba(235,75,115,${0.38 * k})`; ctx.lineWidth = Math.max(1.5, ew * 0.045); ctx.lineCap = 'round';
            for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * rx * 0.3 - ry * 0.35, -ry * 0.5); ctx.lineTo(i * rx * 0.3 + ry * 0.35, ry * 0.5); ctx.stroke(); }
            ctx.restore();
        }
        ctx.restore();
    }
    function drawMouth(f, H0, k, a) {
        if (k <= 0 || !f.sc.mouth || f.laugh) return;
        const l = S.mouthL, r = S.mouthR, ew = H0.ew, n = 6;
        const amp = ew * 0.11 * k, dn = H0.dn;
        const pt = i => { const s = i / n, x = l.x + (r.x - l.x) * s, y = l.y + (r.y - l.y) * s, b = Math.sin(s * Math.PI * 3) * amp * (i === 0 || i === n ? 0 : 1); return { x: x + dn.x * b, y: y + dn.y * b }; };
        ctx.save(); ctx.globalAlpha = a * ease(k); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); const p0 = pt(0); ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i <= n; i++) { const p = pt(i); ctx.lineTo(p.x, p.y); }
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = ew * 0.14; ctx.stroke();
        ctx.strokeStyle = 'rgba(175,40,75,0.85)'; ctx.lineWidth = ew * 0.075; ctx.stroke();
        ctx.restore();
    }
    function drawHa(f, x, a) {
        const k = x.age / x.life, pop = k < 0.18 ? easeOut(k / 0.18) * 1.18 : lerp(1.18, 1, Math.min(1, (k - 0.18) / 0.25));
        ctx.save(); ctx.translate(x.x, x.y); ctx.rotate(x.rot); ctx.scale(pop, pop);
        ctx.globalAlpha = a * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
        ctx.font = `900 ${Math.round(x.size)}px "Arial Black", Impact, "Segoe UI", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
        ctx.lineWidth = x.size * 0.22; ctx.strokeStyle = '#ff4d79'; ctx.strokeText(x.txt, 0, 0);
        ctx.fillStyle = '#ffe66d'; ctx.fillText(x.txt, 0, 0);
        ctx.restore();
    }

    // ---------- khung ----------
    // paused: lượt hành động đang vẽ lại người → giữ đồng hồ, không vẽ. Trả true khi lượt xong (hết giờ + mờ + hạt rơi hết).
    function frame(now, dtIn, paused) {
        if (!fx) return true;
        const f = fx;
        // Đồng hồ THẬT của lượt: overlay kẹp dt ≤ 0,05 s/khung → máy / tab chậm (< 20 khung/s) thì 7 s kéo thành 10–12 s.
        // Tự đo từ `now` (kẹp 0,1 s chống giật khi tab vừa thức dậy); lúc tạm dừng (lượt hành động) chỉ cập nhật mốc.
        const dt = f.lastNow != null && Number.isFinite(now) ? Math.min(0.1, Math.max(0, (now - f.lastNow) / 1000)) : dtIn;
        f.lastNow = now;
        if (paused) return false;
        f.v = viewNow();
        const F = env.face();
        if (F && F.eyes) { const lost = f.t - seenAt > LOST; smooth(F, dt, lost || !S); seenAt = f.t; }
        const has = !!S;
        const target = has && f.t - seenAt <= LOST ? 1 : 0;
        vis = clamp01(vis + (target ? dt / 0.25 : -dt / 0.35));
        f.t += dt;
        const left = f.total - f.t;
        const fade = left < FADE ? clamp01(left / FADE) : 1;
        const a = vis * fade;
        const over = f.t >= f.total;
        const p = power(f), gl = glisten(f), sq = Math.sqrt(f.mult);
        const H0 = has ? frameOf() : null;
        if (H0) f.ew = H0.ew;
        stepPool(f, dt, p, over);                           // 💧 vũng nước sống độc lập với việc thấy mặt
        stepCloud(f, dt, H0, p, !over && !!H0 && f.total - f.t > FADE);
        // Hết giờ: giọt / chữ / mưa đã mờ hẳn (vẽ nhân `fade` = 0) → không chờ chúng rơi hết, chỉ chờ vũng nước rút.
        const done = () => over && (!f.sc.puddle || f.pool.level <= 0.05);
        if (f.t > f.total + 6) return true;                 // phao: quá giờ 6 s thì xong hẳn dù hạt còn bay / nước chưa rút
        if (!has) {
            stepParticles(f, dt);
            ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
            drawPool(f, 1);
            drawCloud(f, fade, p);
            for (const d of f.drops) drawDrop(f, d, fade * (d.age > d.life - 0.35 ? (d.life - d.age) / 0.35 : 1));
            for (const x of f.texts) drawHa(f, x, fade);
            ctx.restore();
            return done();
        }
        const sprayOn = f.sc.style !== 'stream', streamOn = f.sc.style !== 'spray';
        // sinh hạt (chỉ khi đang thấy mặt, chưa tới đoạn mờ)
        const emit = !!target && left > FADE;
        if (emit) {
            if (sprayOn) {
                const { c1 } = phases(f);
                if (!f.laugh && f.sc.ramp && !f.burst && f.t >= c1) { f.burst = true; boltNow(f); for (const s of ['L', 'R']) for (let i = 0; i < Math.round(9 * sq); i++) spawnDrop(f, H0, s, 1, rnd(0.9, 1.35), rnd(10, 60)); }
                const rate = (f.laugh ? 7 + 11 * p : 1.5 + 15 * p * p) * f.mult;
                for (const s of ['L', 'R']) {
                    f.acc[s] += rate * dt;
                    while (f.acc[s] >= 1) { f.acc[s] -= 1; spawnDrop(f, H0, s, p, 1, f.laugh ? rnd(-5, 28) : rnd(14, 58)); }
                }
            }
            if (f.laugh) { f.ha -= dt; if (f.ha <= 0) { f.ha = rnd(0.32, 0.5); spawnHa(f, H0); } }
        }
        stepParticles(f, dt);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
        drawPool(f, 1);                                     // dưới cùng: mặt / dòng / giọt vẽ đè lên
        drawCloud(f, a, p);
        if (f.sc.face) drawFace(f, H0, f.laugh ? gl : Math.max(gl * 0.35, p), a);
        for (const s of ['L', 'R']) drawWell(f, H0, S.eyes[s], gl * (f.laugh ? 0.5 : 1) * a);
        if (!f.laugh) {   // sao lấp lánh - rơm rớm rồi tắt dần khi đã chảy
            const tw = gl * (1 - 0.8 * p);
            if (tw > 0.02) for (const s of ['L', 'R']) {
                const e = S.eyes[s];
                for (let i = 0; i < 3; i++) {
                    const k = 0.5 + 0.5 * Math.sin(f.t * 8.5 + i * 2.1 + (s === 'L' ? 1 : 0));
                    const px = e.lower.x + H0.u.x * H0.ew * (i - 1) * 0.28, py = e.lower.y + H0.u.y * H0.ew * (i - 1) * 0.28 - H0.dn.y * H0.ew * 0.06;
                    drawStar(px, py, H0.ew * (0.09 + 0.1 * k), tw * a * (0.5 + 0.5 * k), f.t * 1.5 + i);
                }
            }
        }
        if (streamOn) for (const s of ['L', 'R']) drawStream(f, H0, s, p, a, dt, emit);
        drawMouth(f, H0, p > 0.5 ? (p - 0.5) * 2 : 0, a);
        for (const d of f.drops) drawDrop(f, d, fade * (d.age > d.life - 0.35 ? (d.life - d.age) / 0.35 : 1));
        for (const x of f.texts) drawHa(f, x, fade);
        ctx.restore();
        return done();
    }

    return { start, extend, stop, frame, estMs, get fx() { return fx; }, playing: () => [], power: () => (fx ? power(fx) : 0) };
}
