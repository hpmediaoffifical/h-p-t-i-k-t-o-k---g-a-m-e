/* 🎬 VIDEO HÀNH ĐỘNG - mô-đun hiệu ứng của 🧍 Bộ Tách Người (overlays/camgames/body/overlay.html).
 * Một lượt = MỘT video hiệu ứng (webm trong suốt hoặc mp4 phủ kín) chạy lại từ 0 + người tách nền diễn theo mốc của video:
 *   đứng → [hitSec] rời đi (outMs) → vắng → [backSec] quay về (inMs) → khuỵu / nảy (settleMs) → hết video.
 * Kiểu rời / về theo sc.motion (body/core.cjs VIDFX_PRESETS - mốc đo từ ref của 5 video mẫu NGHIEN CUU/NPC ACTION):
 *   portal 🌀 tụt xuống sàn tại cổng → rơi từ trần · blast ☄️ văng chéo lên + xoay → rơi từ trên · abduct 🛸 bay lên nhỏ dần →
 *   thả chậm xuống · knock 🥊 văng ngang → trượt ngang về từ mép · crush 👊 bẹp dí (vẫn thấy) → bật dậy nảy.
 * Lớp video: 'front' trước người · 'back' sau người (đi qua env.backdrop như video nền Rơi Hố) · 'auto' trước người tới backSec rồi
 * thành nền (UFO: luồng sáng phủ người lúc bị hút, sau đó cảnh mặt trăng nằm SAU người).
 * Đồng hồ lượt bám currentTime của video (video giải mã chậm / khựng thì người vẫn khớp mốc), hết video thì chạy tiếp bằng đồng hồ.
 * env giống fx-roiho.mjs: ctx, W, H, person(), backdrop(m, bg), media(file), playOnce(m, sound), drawCover(m, margin). */

export function createVidFx(env) {
    const { ctx, W, H } = env;
    const HB = window.HpBody;
    let person = env.person();
    let fx = null;
    const TAU = Math.PI * 2;
    const clamp01 = t => t < 0 ? 0 : t > 1 ? 1 : t;
    const easeIn = t => t * t;
    const easeOut = t => 1 - (1 - t) * (1 - t);
    const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
    // nảy vượt rồi về (bật dậy sau khi bẹp)
    const elastic = t => t <= 0 ? 0 : t >= 1 ? 1 : 1 + Math.pow(2, -9 * t) * Math.sin((t * 9 - 0.75) * TAU / 3);

    const feetOf = () => person.feet || { x: W / 2, y: H * 0.86 };
    const headOf = () => person.head || { x: W / 2, y: H * 0.3 };

    // Vẽ người: dời (dx, dy), co giãn (sx, sy) + xoay quanh bàn chân, mờ alpha, cắt theo clip { top, bottom, ell? }.
    // st.funnel = { top, len, narrow, cx }: "cuốn vào" - trên đường top bị nuốt mất, càng gần top càng thon (bề ngang còn
    // narrow ở sát top, đủ bề ngang khi cách top ≥ len) → đầu thon nhỏ cuốn vào đáy đĩa bay, thân kéo theo sau.
    function paintPerson(g, st) {
        const M = person.M, f = feetOf(), ax = f.x, ay = Math.min(f.y, H);
        if (st.pv) {
            // neo tại một điểm trên người (rel: 0 đỉnh đầu → 1 chân) đặt ở (pv.x, pv.y); xoay + lật quanh điểm đó (quả bóng Pickleball)
            const hy = headOf().y, py = hy + st.pv.rel * (ay - hy);
            g.translate(st.pv.x, st.pv.y);
            if (st.rot) g.rotate(st.rot);
            g.scale(st.sx, st.sy);
            g.translate(-ax, -py);
        } else {
            // xoay quanh giữa người (văng / lăn) - chân làm điểm neo co giãn
            const mid = (st.rot || 0) ? (ay - headOf().y) * 0.5 : 0;
            g.translate(ax + st.dx, ay + st.dy);
            if (st.rot) { g.translate(0, -mid); g.rotate(st.rot); g.translate(0, mid); }
            g.scale(st.sx, st.sy);
            g.translate(-ax, -ay);
        }
        g.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
        if (st.tint) g.filter = st.tint;
        g.drawImage(person.img, 0, 0);
    }
    let buf = null;
    function drawPerson(st) {
        if (!person.ready || !person.img || !person.M || !st || st.alpha <= 0.01) return;
        if (st.funnel) return drawFunnel(st);
        ctx.save();
        if (st.clip) {
            ctx.beginPath(); ctx.rect(-W, st.clip.top, W * 3, st.clip.bottom - st.clip.top);
            if (st.clip.ell) ctx.ellipse(st.clip.ell.x, st.clip.ell.y, st.clip.ell.rx, st.clip.ell.ry, 0, 0, TAU);
            ctx.clip();
        }
        ctx.globalAlpha = st.alpha;
        paintPerson(ctx, st);
        ctx.restore();
    }
    function drawFunnel(st) {
        const F = st.funnel;
        if (!buf) { buf = document.createElement('canvas'); buf.width = W; buf.height = H; }
        const g = buf.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0); g.filter = 'none'; g.clearRect(0, 0, W, H);
        g.save(); paintPerson(g, st); g.restore();
        // vẽ lại theo dải ngang 6 px, mỗi dải co bề ngang quanh cx (nối dải chồng 1 px khỏi hở vạch)
        const y0 = Math.max(0, Math.floor(F.top)), step = 6, len = Math.max(1, F.len);
        ctx.save();
        ctx.globalAlpha = st.alpha;
        for (let y = y0; y < H; y += step) {
            const q = clamp01((y + step / 2 - F.top) / len);
            const k = F.narrow + (1 - F.narrow) * Math.sqrt(q);
            if (k >= 0.999) { ctx.drawImage(buf, 0, y, W, H - y, 0, y, W, H - y); break; }
            ctx.drawImage(buf, 0, y, W, step + 1, F.cx - F.cx * k, y, W * k, step + 1);
        }
        ctx.restore();
    }

    function burstDust(x, y, rx, n = 40) {
        for (let i = 0; i < n; i++) {
            const a = Math.PI + Math.random() * Math.PI, sp = 220 + Math.random() * 480;
            fx.dust.push({ x: x + (Math.random() - 0.5) * rx * 0.6, y, vx: Math.cos(a) * sp * (Math.random() < 0.5 ? -1 : 1), vy: Math.sin(a) * sp * 0.35 - 70,
                r: 10 + Math.random() * 24, life: 0.7 + Math.random() * 0.6, age: 0 });
        }
    }
    function drawDust(dt) {
        for (const p of fx.dust) {
            p.age += dt; if (p.age >= p.life) continue;
            p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy += 260 * dt;
            ctx.fillStyle = `rgba(190,175,160,${(1 - p.age / p.life) * 0.5})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + p.age * 1.4), 0, TAU); ctx.fill();
        }
        fx.dust = fx.dust.filter(p => p.age < p.life);
    }
    // Bóng dưới chân chỗ sắp đáp: to + đậm dần khi người tới gần đất.
    function drawShadow(k) {
        const f = feetOf(), rx = Math.max(90, (person.w || 300) * 0.55), q = easeIn(clamp01(k));
        ctx.save(); ctx.translate(f.x + fx.ox, Math.min(f.y, H)); ctx.scale(1, 0.22);
        const r = rx * (0.45 + 0.55 * q), g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, `rgba(0,0,0,${0.1 + 0.38 * q})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.restore();
    }

    // Trạng thái người ở mốc e (ms). null = vắng mặt.
    function stateAt(e) {
        const sc = fx.script, P = fx.plan, f = feetOf(), h = headOf();
        const ph = Math.max(200, f.y - h.y), sg = sc.dir === 'left' ? -1 : 1, ox = fx.ox;
        const base = { dx: ox, dy: 0, sx: 1, sy: 1, rot: 0, alpha: 1, clip: null, tint: '' };
        if (sc.motion === 'abduct') return abductAt(e, f, h);
        if (sc.motion === 'mario') return marioAt(e, f, h);
        if (sc.motion === 'pickle') return pickleAt(e, f, h);
        if (sc.motion === 'ninja') return ninjaAt(e, f, h);
        if (sc.motion === 'batu') return batuAt(e, f, h);
        // trước mốc: đứng (portal: trượt nhẹ về đúng cổng trong 400 ms đầu)
        if (e < P.hit) return { ...base, dx: ox * easeInOut(clamp01(e / 400)) };
        // rời đi
        if (e < P.gone) {
            const k = clamp01((e - P.hit) / sc.outMs);
            switch (sc.motion) {
                case 'portal': {
                    const floor = sc.anchorY / 100 * H, rx = Math.max(160, (person.w || 300) * 0.9);
                    const s = 1 - easeIn(k) * 0.15;
                    return { ...base, dy: easeIn(k) * ph * 1.25, sx: s, sy: s, clip: { top: -H, bottom: floor, ell: { x: f.x + ox, y: floor, rx, ry: rx * 0.28 } } };
                }
                case 'blast': return { ...base, dx: ox + sg * easeOut(k) * W * 0.55, dy: -easeOut(k) * (f.y + ph * 0.3), rot: sg * k * 2.4, sx: 1 - 0.3 * k, sy: 1 - 0.3 * k };
                case 'knock': return { ...base, dx: ox + sg * easeIn(k) * W * 1.35, dy: -k * 90, rot: sg * k * 0.7, sx: 1 - 0.1 * k, sy: 1 + 0.06 * k };
                case 'crush': { const q = easeOut(k); return { ...base, sx: 1 + 0.55 * q, sy: 1 - 0.93 * q }; }
            }
        }
        // vắng mặt (bẹp dí: vẫn nằm bẹp)
        if (e < P.back) return sc.motion === 'crush' ? { ...base, sx: 1.55, sy: 0.07 } : null;
        // quay về
        if (e < P.land) {
            const k = clamp01((e - P.back) / sc.inMs);
            switch (sc.motion) {
                case 'portal': case 'blast': {
                    const dy0 = -(f.y + 60);          // cả người ở trên mép trên khung
                    return { ...base, dy: dy0 * (1 - easeIn(k)), sy: 1 + 0.12 * k, sx: 1 - 0.05 * k, shadow: k };
                }
                case 'knock': {
                    // trượt ngang trên mặt đất từ mép về (khớp khói dưới chân của video): chân không rời đất, nhanh rồi phanh dần,
                    // người khom (khớp đúng tư thế khuỵu lúc đáp, khỏi giật) + ngả về phía sau lúc phanh
                    const q = easeOut(k);
                    return { ...base, dx: ox + sg * W * 0.75 * (1 - q), rot: sg * 0.1 * (1 - q), sx: 1.063, sy: 0.82 };
                }
                case 'crush': { const q = elastic(k); return { ...base, sx: 1.55 - 0.55 * q, sy: 0.07 + 0.93 * q }; }
            }
        }
        // đáp: khuỵu / ngồi thụp rồi đứng dậy
        const q = clamp01((e - P.land) / Math.max(1, sc.settleMs));
        const c = sc.motion === 'crush' ? 0 : sc.motion === 'knock' ? 0.18 : 0.26;
        const dip = c * (1 - easeInOut(q));
        return { ...base, sx: 1 + dip * 0.35, sy: 1 - dip };
    }

    // 🛸 Bị hút lên - kiểu phim: người co về cỡ "đứng dưới đĩa" (đầu cách đáy đĩa anchorY một khoảng) lúc đĩa bay tới →
    // bị hút: nhấc khỏi đất, nhỏ dần, đáy đĩa là miệng hút (phần qua đó bị nuốt), càng gần đĩa càng thon - đầu nhỏ cuốn vào
    // trước, thân kéo theo → vắng → nhả ra: chân ló ra trước, người bé + đầu thon, phát sáng, hạ xuống to dần rồi nở về cỡ
    // "dưới đĩa" → 1,2 s cuối lượt mới to lại cỡ thật (trả cam gốc không giật).
    function abductAt(e, f, h) {
        const sc = fx.script, P = fx.plan, ay = Math.min(f.y, H), ph = Math.max(120, ay - h.y);
        const top = sc.anchorY / 100 * H, gap = H * 0.08;
        const s0 = Math.max(0.3, Math.min(1, (ay - top - gap) / ph));          // cỡ để đầu nằm dưới đáy đĩa
        const at = (s, feetY) => ({ dx: 0, dy: feetY - ay, sx: s, sy: s, rot: 0, alpha: 1, clip: null, tint: '' });
        if (e < P.hit) return at(1 - (1 - s0) * easeInOut(clamp01(e / 900)), ay);
        // bị hút: nhấc khỏi đất, nhỏ dần, phần chạm đáy đĩa bị nuốt; càng gần đĩa càng thon (đầu nhỏ cuốn vào trước)
        if (e < P.gone) {
            const k = clamp01((e - P.hit) / sc.outMs);
            const s = s0 * (1 - 0.5 * easeIn(k));
            const feetY = ay + (top - ay) * Math.pow(k, 1.5);                   // k = 1: chân cũng vào tới đáy đĩa
            const bodyH = ph * s;
            return { ...at(s, feetY), rot: Math.sin(k * 12) * 0.04 * (1 - k), alpha: 1,
                funnel: { top, cx: f.x, narrow: 0.12 + 0.5 * (1 - easeOut(k)), len: bodyH * (0.3 + 0.45 * easeOut(k)) },
                tint: `brightness(${(1 + 0.35 * k).toFixed(2)}) drop-shadow(0 0 ${Math.round(34 * k)}px rgba(120,255,220,${(0.85 * k).toFixed(2)}))` };
        }
        if (e < P.back) return null;
        // nhả ra: chân ló ra trước, người bé + đầu thon nhỏ → hạ xuống, to dần, nở về cỡ "dưới đĩa"
        if (e < P.land) {
            const k = clamp01((e - P.back) / sc.inMs), q = easeOut(k);
            const s = s0 * (0.5 + 0.5 * easeInOut(k));
            const feetY = top + (ay - top) * q;
            const bodyH = ph * s, open = clamp01(k / 0.75);                      // 3/4 đầu còn thon, 1/4 cuối nở hẳn
            const glow = 1 - k;
            return { ...at(s, feetY), rot: Math.sin(k * 10) * 0.04 * (1 - k), alpha: 1, shadow: k,
                funnel: open < 1 ? { top, cx: f.x, narrow: 0.18 + 0.82 * easeInOut(open), len: bodyH * (0.75 - 0.6 * easeInOut(open)) } : null,
                tint: glow > 0.02 ? `brightness(${(1 + 0.35 * glow).toFixed(2)}) drop-shadow(0 0 ${Math.round(36 * glow)}px rgba(120,255,220,${(0.85 * glow).toFixed(2)}))` : '' };
        }
        // đứng ở cỡ "dưới đĩa"; 1,2 s cuối to lại cỡ thật
        const g = easeInOut(clamp01((e - (P.end - 1200)) / 1200));
        return at(s0 + (1 - s0) * g, ay);
    }

    // ---------- 🎮 kiểu "game" theo video nền phủ kín (tư thế tuyệt đối trên sân khấu) ----------
    // Người cỡ thật = đặt chân đúng chỗ cũ, cao ph. pose(x, feetY, height) → trạng thái vẽ (neo chân).
    function poseAt(f, h, x, feetY, height) {
        const ay = Math.min(f.y, H), ph = Math.max(80, ay - h.y), s = height / ph;
        return { dx: x - f.x, dy: feetY - ay, sx: s, sy: s, rot: 0, alpha: 1, clip: null, tint: '' };
    }
    // Trộn 2 tư thế (k 0..1) - cỡ trộn theo log cho cảm giác xa / gần đều.
    function mixPose(a, b, k) {
        const L = (p, q) => p + (q - p) * k, G = (p, q) => Math.exp(Math.log(Math.max(1e-3, p)) * (1 - k) + Math.log(Math.max(1e-3, q)) * k);
        return { ...a, dx: L(a.dx, b.dx), dy: L(a.dy, b.dy), sx: G(a.sx, b.sx), sy: G(a.sy, b.sy), rot: L(a.rot || 0, b.rot || 0) };
    }
    // Mario ăn nấm: to / nhỏ giật liên tục rồi PHÓNG TO, giữ, về cỡ cũ (bảng mốc chép từ mario_1080x1920.lua).
    const MUSH = [[0, 1], [0.05, 1.3], [0.1, 0.75], [0.15, 1.3], [0.2, 0.75], [0.26, 1.35], [0.32, 0.75], [0.4, 1.4], [0.46, 0.75], [0.55, 1.6], [0.8, 1.6], [1, 1]];
    function mushFactor(t) {
        if (t <= 0 || t >= 1) return 1;
        for (let i = 0; i < MUSH.length - 1; i++) {
            const [a, va] = MUSH[i], [b, vb] = MUSH[i + 1];
            if (t <= b) return va + (vb - va) * easeInOut((t - a) / Math.max(1e-3, b - a));
        }
        return 1;
    }
    // ✨ Chớp phóng to dần: sau tiếng ăn nấm, nền còn chuỗi tiếng nhấp nháy (~0,27 s một nhịp) → to theo BẬC: ×mGrowX → chớp →
    // to thêm mGrowAdd → chớp → … (user 2026-10-19: "to 3 > chớp > to 4 > chớp > to 5…") tới backSec rồi về cỡ thật.
    // Mỗi lần chớp: cỡ cũ / cỡ mới đổi nhau 40 ms (cỡ cũ mờ, cỡ mới sáng) như Mario lớn lên. Đầu không lố mép trên khung.
    // still = chỉ lấy cỡ (không chớp). Trả null khi chưa tới / đã tắt (mGrowX = 0).
    function growAt(S, sc, P, still) {
        if (!(sc.mGrowX > 0) || S < sc.mGrow) return null;
        const stepS = Math.max(0.08, sc.mGrowMs / 1000), t = Math.min(S, P.back / 1000) - sc.mGrow;
        const k = Math.floor(t / stepS), u = (t - k * stepS) * 1000;
        const cap = Math.max(1, (sc.mGround - 2) / Math.max(1, sc.mSize));
        const mk0 = (sc.mGrow - sc.mMush) / (sc.mMushMs / 1000);
        const size = n => n < 0 ? (mk0 > 0 && mk0 < 1 ? mushFactor(mk0) : 1) : Math.min(cap, sc.mGrowX + sc.mGrowAdd * n);
        const g = size(k), blinkMs = Math.min(160, sc.mGrowMs * 0.6);
        if (still || u >= blinkMs) return { g, alpha: 1, tint: '' };
        const isNew = Math.floor(u / 40) % 2 === 0;
        return isNew ? { g, alpha: 1, tint: 'brightness(1.8)' } : { g: size(k - 1), alpha: 0.45, tint: '' };
    }
    // 🍄 Mario: 0 → thu nhỏ về điểm 1 (outMs) → chạy tới điểm 2 (mArrive) → nhảy đội ô ? (mJumpMs) → chờ → chạy theo nấm tới
    // điểm 3 (mLeave → mReach) → ăn nấm (mMush, mMushMs) → giữ → backSec về cỡ thật (inMs).
    function marioAt(e, f, h) {
        const sc = fx.script, P = fx.plan, S = e / 1000;
        const ground = sc.mGround / 100 * H, size = sc.mSize / 100 * H;
        const p1 = sc.m1x / 100 * W, p2 = sc.m2x / 100 * W, p3 = sc.m3x / 100 * W;
        const real = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, alpha: 1, clip: null, tint: '' };
        const at = (x, y = ground, hh = size) => poseAt(f, h, x, y, hh);
        // chạy: nhún nhẹ theo bước + nghiêng tới
        const run = (x0, x1, k, ms) => {
            const q = easeInOut(k), steps = Math.max(2, Math.round(ms / 180));
            const p = at(x0 + (x1 - x0) * q);
            return { ...p, dy: p.dy - Math.abs(Math.sin(k * Math.PI * steps)) * size * 0.07, rot: (x1 > x0 ? 1 : -1) * 0.06 * Math.sin(Math.PI * k) };
        };
        if (e < sc.outMs) return mixPose(real, at(p1), easeInOut(e / sc.outMs));          // thu nhỏ về điểm 1
        if (S < sc.mArrive) {
            const t0 = sc.outMs / 1000 + 0.15;
            return S < t0 ? at(p1) : run(p1, p2, clamp01((S - t0) / Math.max(0.05, sc.mArrive - t0)), (sc.mArrive - t0) * 1000);
        }
        const jumpEnd = sc.mArrive + sc.mJumpMs / 1000;
        if (S < jumpEnd) {
            // đầu chạm đáy ô ? ở đỉnh cú nhảy (giữa cú nhảy)
            const k = (S - sc.mArrive) / (sc.mJumpMs / 1000), top = Math.max(0, ground - size - sc.mBlock / 100 * H);
            const p = at(p2);
            return { ...p, dy: p.dy - top * Math.sin(Math.PI * k), sy: p.sy * (1 + 0.06 * Math.sin(Math.PI * k)) };
        }
        if (S < sc.mLeave) return at(p2);
        if (S < sc.mReach) return run(p2, p3, (S - sc.mLeave) / Math.max(0.05, sc.mReach - sc.mLeave), (sc.mReach - sc.mLeave) * 1000);
        const big = at(p3), scaled = (p, g) => ({ ...p, sx: p.sx * g, sy: p.sy * g });
        if (e < P.back) {
            const gr = growAt(S, sc, P, false);
            if (gr) return { ...scaled(big, gr.g), alpha: gr.alpha, tint: gr.tint };
            const mk = (S - sc.mMush) / (sc.mMushMs / 1000);
            const g = mk > 0 && mk < 1 ? mushFactor(mk) : 1;
            return { ...big, sx: big.sx * g, sy: big.sy * g, tint: mk > 0 && mk < 0.55 && Math.floor(mk * 40) % 2 ? 'brightness(1.5)' : '' };
        }
        const last = growAt(P.back / 1000, sc, P, true);                                      // bậc to nhất lúc bắt đầu về
        return mixPose(last ? scaled(big, last.g) : big, real, easeInOut(clamp01((e - P.back) / Math.max(1, sc.inMs))));     // trở lại cỡ thật
    }

    // 🏓 Pickleball: người = quả bóng. Đầu mút chẵn = A (sát camera), lẻ = B (vợt cô bé, xa). Mỗi chặng giữa 2 tiếng đánh:
    //   - SÁT CAMERA lấy KHUÔN MẶT: điểm neo trượt từ giữa người (xa) lên mặt (gần) + phóng to tới khi mặt cao pAsz % khung
    //     → người xem thấy mặt NPC lao vào màn (hài), XA camera nhỏ dần thấy đủ cả người ở vợt cô bé;
    //   - bay vồng lên (bezier, đỉnh cao pLob % khung), cỡ trộn log (xa / gần đều);
    //   - QUAY TRÒN đầu–chân đủ hướng: mỗi chặng số vòng NGUYÊN (pSpin % vòng, làm tròn) → tới vợt / tới mặt luôn thẳng người;
    //     lộn nhào (ép dọc theo cos số vòng nguyên pFlips) cho cảm giác 3D;
    //   - mỗi cú đánh nảy dẹt 90 ms. Trước tiếng đánh đầu: cỡ thật; sau tiếng cuối (mặt ở A): về cỡ thật.
    // Tư thế = { x, y: chỗ đặt điểm neo trên sân khấu, s: cỡ, rel: điểm neo trên người (0 = đỉnh đầu, 0,5 = giữa, 1 = chân) }.
    const hash01 = n => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
    function pickleAt(e, f, h) {
        const sc = fx.script, P = fx.plan, hits = P.hits, S = e / 1000;
        const ay = Math.min(f.y, H), ph = Math.max(80, ay - h.y);
        const face = sc.pFace / 100;                                            // tâm mặt: % chiều cao người tính từ đỉnh đầu
        const real = { x: f.x, y: h.y + 0.5 * ph, s: 1, rel: 0.5 };
        const A = { x: sc.pAx / 100 * W, y: sc.pAy / 100 * H, s: (sc.pAsz / 100 * H) / (ph * Math.max(0.05, face * 1.8)), rel: face };
        const B = { x: sc.pBx / 100 * W, y: sc.pBy / 100 * H, s: (sc.pBsz / 100 * H) / ph, rel: 0.5 };
        const mix = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, rel: a.rel + (b.rel - a.rel) * k,
            s: Math.exp(Math.log(a.s) * (1 - k) + Math.log(b.s) * k) });
        const out = (p, extra) => ({ dx: 0, dy: 0, sx: p.s, sy: p.s, rot: 0, alpha: 1, clip: null, tint: '', pv: { x: p.x, y: p.y, rel: p.rel }, ...extra });
        if (S <= hits[0]) return out(real);
        const last = hits.length - 1;
        if (S >= hits[last]) return out(mix(A, real, easeInOut(clamp01((e - P.back) / Math.max(1, sc.inMs)))));
        let k = 0; while (k < last - 1 && S >= hits[k + 1]) k++;
        const from = k === 0 ? real : (k % 2 ? B : A), to = (k + 1) % 2 ? B : A;
        const t = clamp01((S - hits[k]) / (hits[k + 1] - hits[k])), q = easeInOut(t);
        const p = mix(from, to, q);
        // vồng lên: điểm điều khiển cao hơn trung điểm pLob % khung
        const lob = sc.pLob / 100 * H, cy = (from.y + to.y) / 2 - lob, u = 1 - q;
        p.y = u * u * from.y + 2 * u * q * cy + q * q * to.y;
        // quay tròn: số vòng nguyên (≥ 1 khi bật), chiều ngẫu nhiên tất định theo chặng
        const vary = n => 0.6 + 0.8 * hash01(n);
        const turns = sc.pSpin > 0 ? Math.max(1, Math.round(sc.pSpin / 100 * vary(k * 2.17 + 46))) * (hash01(k * 1.31 + 24) < 0.5 ? -1 : 1) : 0;
        const rot = turns * TAU * q;
        const flips = sc.pFlips > 0 ? Math.max(1, Math.round(sc.pFlips * vary(k * 3.71 + 17))) * (hash01(k * 4.53 + 29) < 0.5 ? -1 : 1) : 0;
        let fy = flips ? Math.cos(flips * TAU * q) : 1;
        if (Math.abs(fy) < 0.06) fy = fy < 0 ? -0.06 : 0.06;
        // nảy dẹt lúc vừa bị đánh
        const hitK = clamp01((S - hits[k]) / 0.09), pop = k > 0 && hitK < 1 ? Math.sin(Math.PI * hitK) * 0.18 : 0;
        return out(p, { sx: p.s * (1 + pop), sy: p.s * fy * (1 - pop), rot });
    }

    // 🪢 Ba Tư (3 lớp: batu.webm trên cùng · NPC · batu-nen.webm dưới cùng): bị trói ở cột. Chu kỳ bPeriod giây theo GIỜ VIDEO:
    //   cảnh TOÀN (0 → bCut): NPC nhỏ ở cột (bAx), vùng vẫy nhẹ; lúc Ba Tư vung roi (≈ 0,92 s trước cú quất) co rúm, ngả né sang phải ·
    //   cảnh CẬN (bCut → hết chu kỳ): NPC to (bBx) - CẮT CẢNH tức thì đúng khung video cắt; roi quất bHits → giật nảy + loé trắng / đỏ + run.
    // Cỡ: MÉP DƯỚI khung cam (chỗ camera cắt chân) đặt ngay dưới miệng bao tải (bAbot / bBbot) - bao tải ở lớp trên che mất; đỉnh đầu
    // cao b?sz % khung trên đó. Hết video (backSec) cắt về cỡ thật.
    const BATU_WIND = 0.92, BATU_FLINCH = 0.45, BATU_HURT = 0.7;
    function batuAt(e, f, h) {
        const sc = fx.script, P = fx.plan, S = e / 1000;
        if (e >= P.back) return { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, alpha: 1, clip: null, tint: '' };
        const per = Math.max(0.2, sc.bPeriod), cyc = S % per, close = cyc >= sc.bCut, sw = sc.bSway / 100;
        const size = (close ? sc.bBsz : sc.bAsz) / 100 * H;
        const p = poseAt(f, h, (close ? sc.bBx : sc.bAx) / 100 * W, (close ? sc.bBbot : sc.bAbot) / 100 * H, size);
        // vùng vẫy khi bị trói: lắc nhẹ quanh giữa người + nhích ngang
        let rot = sw * (0.022 * Math.sin(S * TAU * 0.9) + 0.01 * Math.sin(S * TAU * 2.3 + 1)), dx = sw * size * 0.012 * Math.sin(S * TAU * 1.4);
        let sx = 1, sy = 1, tint = '';
        for (const t of P.hits || []) {
            const w = S - (t - BATU_WIND);
            if (w >= 0 && w < BATU_FLINCH) { const k = Math.sin(Math.PI * w / BATU_FLINCH); rot += sw * 0.06 * k; sy -= 0.035 * k; sx += 0.02 * k; }   // thấy roi vung: co rúm, né
            const d = S - t;
            if (d >= 0 && d < BATU_HURT) {
                const dec = Math.exp(-d * 6.5), j = dec * Math.sin(d * 42);
                rot += sw * (0.09 * dec + 0.03 * j); dx += sw * size * (0.045 * dec + 0.012 * j); sx += 0.05 * dec; sy -= 0.05 * dec;
                tint = d < 0.07 ? 'brightness(2.3)' : d < 0.24 ? 'sepia(0.8) saturate(4) hue-rotate(-35deg) brightness(1.05)' : '';
                if (d > 0.24) { rot += sw * 0.012 * Math.sin(d * 70) * (1 - d / BATU_HURT); }       // run vì đau
            }
        }
        return { ...p, dx: p.dx + dx, sx: p.sx * sx, sy: p.sy * sy, rot, tint };
    }

    // 🥷 Ninja (rừng cuộn ngang, ninja.mp4): NPC thu nhỏ lên NGỌN CÂY trái (outMs), đứng trên ☁️ mây pixel che phần thân bị cắt →
    // nDrop cưỡi mây tụt chéo xuống GIỮA cam (nX) → nLand chạm đất: mây tan, đĩa "chân chạy" (HB.NINJA_FEET_FILE) thay phần chân
    // bị khuất; chạy tại chỗ (nhún + nghiêng tới) và né theo nMoves: j nhảy (nJump % khung) · f nhảy lộn 1 vòng · h nhảy ngắn
    // (nHop) · d cúi (thân còn nDuck %, ngả ra sau, đĩa chân dẹt) → backSec về cỡ thật (inMs).
    // Thân + đĩa chân là MỘT nhóm (đáy đĩa chạm đất, chân thân lút vào nửa trên đĩa nFeetUp %): lộn vòng quay cả nhóm quanh giữa nhóm.
    // Trả trạng thái vẽ thân (neo chân) + feet (đĩa chân) + cloud (mây) + shadow0 (bóng trên đất, 0..1).
    const FEET_ASPECT = 634 / 655;
    function ninjaMove(S) {
        for (const mv of fx.moves) if (S >= mv.a && S < mv.b) return { ...mv, k: (S - mv.a) / (mv.b - mv.a) };
        return null;
    }
    function ninjaAt(e, f, h) {
        const P = fx.plan;
        let st = P.ko != null && e >= P.ko && fx.end !== 'gone' ? ninjaDead(e, f, h) : ninjaAlive(e, f, h);
        if (st && fx.end === 'burnt') st = burnDecor(st, e / 1000, f, h);
        // 🎁 CONTINUE: hồi sinh xong nhấp nháy 1,4 s như game (bất tử)
        if (st && fx.reviveAt != null && e >= fx.reviveAt && e - fx.reviveAt < 1400 && Math.floor((e - fx.reviveAt) / 90) % 2) st = { ...st, alpha: st.alpha * 0.25 };
        return st;
    }
    // Điểm trên ảnh camera (p) → điểm trên sân khấu theo trạng thái vẽ st (chế độ pv) - đặt mắt / khói / sao đúng chỗ đầu NPC.
    function mapCam(st, p, f, h) {
        const ax = f.x, ay = Math.min(f.y, H), py = h.y + st.pv.rel * (ay - h.y);
        const dx = (p.x - ax) * st.sx, dy = (p.y - py) * st.sy, c = Math.cos(st.rot || 0), sn = Math.sin(st.rot || 0);
        return { x: st.pv.x + c * dx - sn * dy, y: st.pv.y + sn * dx + c * dy };
    }
    function ninjaAlive(e, f, h) {
        const sc = fx.script, P = fx.plan, S = e / 1000;
        const ay = Math.min(f.y, H), ph = Math.max(80, ay - h.y);
        const ground = sc.nGround / 100 * H, size = sc.nSize / 100 * H, D = sc.nFeetSz / 100 * size, up = sc.nFeetUp / 100;
        const gx = sc.nX / 100 * W, gs = size / ph;
        const tree = { x: sc.nTreeX / 100 * W, y: sc.nTreeY / 100 * H, s: (sc.nTreeSz / 100 * H) / ph };
        const real = { x: f.x, y: ay, s: 1 };
        const mixP = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, s: Math.exp(Math.log(a.s) * (1 - k) + Math.log(b.s) * k) });
        const body = (p, extra) => ({ dx: 0, dy: 0, sx: p.s, sy: p.s, rot: 0, alpha: 1, clip: null, tint: '', pv: { x: p.x, y: p.y, rel: 1 }, ...extra });
        const cloudOf = (p, extra) => ({ x: p.x, y: p.y, w: Math.max(ph * p.s * 0.95, (person.w || ph * 0.7) * p.s * 1.3), puff: 0, alpha: 1, ...extra });
        const mv = ninjaMove(S);
        const duckK = mv && mv.t === 'd' ? (mv.k < 0.2 ? easeOut(mv.k / 0.2) : mv.k > 0.8 ? easeOut((1 - mv.k) / 0.2) : 1) : 0;
        const duckSy = 1 - (1 - sc.nDuck / 100) * duckK;
        const bobAt = s => Math.sin(s * TAU * 1.1) * H * 0.006;           // mây bồng bềnh
        // 1. lên ngọn cây (thu nhỏ) + mây hiện dần dưới chân; cúi = rụt vào mây
        if (S < sc.nDrop) {
            const q = easeInOut(clamp01(e / Math.max(1, sc.outMs)));
            const p = mixP(real, { ...tree, y: tree.y + bobAt(S) }, q);
            return body(p, { sy: p.s * duckSy, sx: p.s * (1 + 0.08 * duckK), rot: -0.25 * duckK, cloud: cloudOf(p, { alpha: q }) });
        }
        // nhóm thân + đĩa chân trên mặt đất: lift px, thân cỡ s (hệ số dọc sy, ngang sxk), ngả lean, lộn theta, đĩa dẹt wsy / cỡ ws / mờ wa
        const grp = o => {
            const Dx = D * o.ws * (o.s / gs), Dw = Dx * o.wsy, bodyH = ph * o.s * o.sy;      // đĩa chân co giãn theo cỡ thân
            // ✂ cắt chân: đáy thân lút vào nửa trên đĩa · 🧍 full người: đĩa đứng trên đất, che chân - bàn chân thấp hơn tâm đĩa nFeetLeg %
            const feetL = sc.nFeetMode === 'full' ? -Dw / 2 + sc.nFeetLeg / 100 * bodyH : -Dw * (1 - up);
            const cy = (feetL - bodyH) / 2, c = Math.cos(o.theta), sn = Math.sin(o.theta), bx = o.x, by = ground - o.lift;
            const at = (px, py) => ({ x: bx + c * px - sn * (py - cy), y: by + cy + sn * px + c * (py - cy) });
            const ft = at(0, feetL), wc = at(0, -Dw / 2);
            return body({ x: ft.x, y: ft.y, s: o.s }, { sx: o.s * o.sxk, sy: o.s * o.sy, rot: o.theta + o.lean,
                feet: { x: wc.x, y: wc.y, w: Dx, h: Dx * FEET_ASPECT * o.wsy, rot: o.theta, alpha: o.wa },
                shadow0: { x: bx, w: Math.max(Dx, ph * o.s * 0.5), k: 1 - clamp01(o.lift / (H * 0.4)) } });
        };
        const neutral = { x: gx, lift: 0, s: gs, sy: 1, sxk: 1, lean: 0.06, theta: 0, wsy: 1, ws: 1, wa: 1 };
        // 2. cưỡi mây tụt chéo xuống giữa cam (vồng lên chút lúc rời cây); cuối đoạn đĩa chân hiện dần trong mây
        if (S < sc.nLand) {
            const k = clamp01((S - sc.nDrop) / Math.max(0.05, sc.nLand - sc.nDrop));
            const g = grp(neutral), q = easeInOut(k);
            const p = mixP({ ...tree, y: tree.y + bobAt(sc.nDrop) }, { x: g.pv.x, y: g.pv.y, s: gs }, q);
            p.y = tree.y + bobAt(sc.nDrop) + (g.pv.y - tree.y - bobAt(sc.nDrop)) * easeIn(k) - Math.sin(Math.PI * k) * H * 0.04;
            const wk = clamp01((k - 0.8) / 0.2);
            return body(p, { rot: 0.12 * Math.sin(Math.PI * k), cloud: cloudOf(p),
                feet: wk > 0 ? { ...g.feet, w: g.feet.w * (0.4 + 0.6 * wk), h: g.feet.h * (0.4 + 0.6 * wk), alpha: wk } : null });
        }
        // mây tan ở chỗ chạm đất
        const puffK = clamp01((S - sc.nLand) / 0.45);
        const landCloud = puffK < 1 ? cloudOf({ ...grp(neutral).pv, s: gs }, { puff: puffK, alpha: 1 - puffK }) : null;
        // 4. hết video: về cỡ thật, đĩa chân thu nhỏ + mờ (🌠 bay mất: hiện dần lại từ giữa cam)
        if (e >= P.back) {
            const k = easeInOut(clamp01((e - P.back) / Math.max(1, sc.inMs)));
            const g = grp({ ...neutral, ws: 1 - 0.6 * k, wa: 1 - k });
            const p = mixP({ x: g.pv.x, y: g.pv.y, s: gs }, real, k);
            return body(p, { feet: g.feet, alpha: fx.end === 'gone' ? k : 1 });
        }
        const C = { grp, neutral, gx, gs, ph, D, up, ground, f, h };
        // 🎭 màn riêng của từng kiểu chơi
        if (fx.end === 'gone' && S >= sc.nTwistHit) return goneAt(S, C);
        if (fx.end === 'burnt' && S >= sc.nBurnHit && S < sc.nBurnHit + BURN_HIT_SEC) return burnHitAt(S, C);
        if (fx.end === 'bonk' && S >= sc.nBonkHit && S < sc.nBonkHit + BONK_SEC) return bonkAt(S, C);
        if (fx.end === 'ride' && S >= sc.nRideAt - RIDE_JUMP && S < RIDE.backT1) return rideAt(S, C);
        if (fx.end === 'pole' && S >= sc.nPoleAt && S < sc.nPoleAt + POLE.total) return poleAt(S, C);
        if (fx.end === 'matrix' && S >= HB.NINJA_SLOW.from && S < HB.NINJA_SLOW.to) return matrixAt(S, C);
        // 🌪 bị lốc cuốn (vẫn WIN)
        if (fx.end === 'twister' && S >= sc.nTwistHit && S < sc.nTwistLand + TWIST_SQUASH) return twistAt(S, grp, neutral, gx, gs);
        // 🏆 WIN: hết video, nhảy mừng tại chỗ trong lúc bảng hiện
        if (P.ko == null && P.over != null && e >= P.over) {
            const c = (e - P.over) / 1000;
            return grp({ ...neutral, lift: Math.abs(Math.sin(c * Math.PI * 2.2)) * H * 0.06, lean: 0, sy: 1 + 0.05 * Math.sin(c * Math.PI * 4.4) });
        }
        // 3. chạy tại chỗ + né
        const run = Math.abs(Math.sin(S * Math.PI * 3.2)) * H * 0.008;
        if (!mv) return { ...grp({ ...neutral, lift: run }), cloud: landCloud };
        if (mv.t === 's') return { ...slideAt(mv, grp, neutral, gx, gs, S, run), cloud: landCloud };
        if (mv.t === 'd') return { ...grp({ ...neutral, lift: run * 0.3, sy: duckSy, sxk: 1 + 0.1 * duckK, lean: 0.06 - 0.36 * duckK, wsy: 1 - 0.35 * duckK }), cloud: landCloud };
        // nhảy: nhún lấy đà → bay (parabol) → dẹt lúc đáp
        const pre = 0.12, post = 0.1, k = mv.k, u = clamp01((k - pre) / (1 - pre - post));
        const hgt = (mv.t === 'h' ? sc.nHop : sc.nJump) / 100 * H * (mv.low ? 0.3 : 1);      // ⭐ low: nhảy hụt, dính phi tiêu
        const cc = k < pre ? 0.3 * Math.sin(Math.PI / 2 * k / pre) : k > 1 - post ? 0.3 * Math.sin(Math.PI * (k - (1 - post)) / post) : 0;
        const air = k >= pre && k <= 1 - post ? Math.sin(Math.PI * u) : 0;
        return { ...grp({ ...neutral, lift: hgt * 4 * u * (1 - u), sy: 1 - cc + 0.08 * air, sxk: 1 + 0.5 * cc, lean: 0.06 - 0.1 * air,
            theta: mv.t === 'f' ? TAU * easeInOut(u) : 0, wsy: (1 - 0.8 * cc) * (mv.t === 'h' ? 1 - 0.15 * air : 1) }), cloud: landCloud };
    }
    // 🛝 's' trượt háng + đạp lưng (Bowser chạy phải → trái, đo khung 5 /s: tâm 47 % ngang lúc 5,09 s theo <video>, 128 % ngang / giây, lưng / mai
    // ở phía phải tâm ~15 % ngang, cao ~72 %): nhún (0–8 %) → ngả gần nằm, đĩa chân trượt lên trước sang phải lướt qua dưới háng (–55 %)
    // → bật lên trái ĐẠP vào lưng: cả người nghiêng, bàn chân chĩa về phía lưng (–68 %, "bốp") → bật ra lộn ngược 1 vòng, đáp giữa cam.
    const bowserX = S => (0.47 - 1.28 * (S - 5.09)) * W;            // giờ <video> trình duyệt: tâm 47 % lúc 5,09 s (ffmpeg 5,0 s)
    function slideAt(mv, grp, neutral, gx, gs, S, run) {
        const k = mv.k, kickK = 0.68, tKick = mv.a + (mv.b - mv.a) * kickK;
        const slideX = gx + W * 0.13, kick = { x: Math.min(slideX, bowserX(tKick) + W * 0.15), lift: H * 0.15 };
        if (k < 0.08) { const q = k / 0.08; return grp({ ...neutral, lift: run * (1 - q), sy: 1 - 0.2 * q, lean: 0.06 - 0.3 * q, wsy: 1 - 0.15 * q }); }
        if (k < 0.55) {
            // ngả ra sau gần nằm, lướt sang phải dưới háng; đĩa chân dẹt, quay tít
            const q = (k - 0.08) / 0.47;
            return grp({ ...neutral, x: gx + (slideX - gx) * easeOut(q), sy: 0.8, sxk: 1.05, lean: -0.24 - 1.0 * easeOut(clamp01(q * 3)), wsy: 0.75 });
        }
        if (k < kickK) {
            // bật lên chéo trái tới lưng Bowser, xoay nghiêng cả người cho bàn chân chĩa về phía lưng
            const q = easeOut((k - 0.55) / (kickK - 0.55));
            return grp({ ...neutral, x: slideX + (kick.x - slideX) * q, lift: kick.lift * q, sy: 0.8 + 0.2 * q, lean: -1.24 * (1 - q), theta: 1.05 * q, wsy: 0.75 + 0.25 * q });
        }
        // đạp xong bật ra: vồng lên cao hơn, lộn ngược 1 vòng (về thẳng người) rồi đáp đúng giữa cam
        const q = (k - kickK) / (1 - kickK), u = 1 - q;
        const lift = u * u * kick.lift + 2 * u * q * H * 0.42 + q * q * 0;
        const squash = q > 0.88 ? 0.25 * Math.sin(Math.PI * (q - 0.88) / 0.12) : 0;
        return grp({ ...neutral, x: kick.x + (gx - kick.x) * easeInOut(q), lift, theta: 1.05 + (-TAU - 1.05) * easeOut(q), lean: 0, sy: 1 - squash, wsy: 1 - squash });
    }

    // 🔥 'burnt' cháy đen thui (vẫn WIN): cầu lửa ngang ngực tới NPC ở nBurnHit (bỏ cú cúi) → loé lửa, giật lùi + nảy → đen thui
    // (brightness), 2 mắt trắng tròn chớp chớp, khói bốc từ đỉnh đầu, ho ra 3 cụm khói → ~1,5 s sau nhấp nháy sạch muội, chạy tiếp.
    const BURN_HIT_SEC = 0.35, BURN_SEC = 1.5, BURN_CLEAN = 0.5;
    function burnHitAt(S, C) {
        const k = (S - fx.script.nBurnHit) / BURN_HIT_SEC;
        return C.grp({ ...C.neutral, x: C.gx - W * 0.03 * Math.sin(Math.PI * k), lift: H * 0.035 * Math.sin(Math.PI * k), lean: -0.35 * Math.sin(Math.PI * k), sy: 1 - 0.12 * Math.sin(Math.PI * k) });
    }
    function burnDecor(st, S, f, h) {
        const k = S - fx.script.nBurnHit;
        if (k < 0) return st;
        if (k < 0.12) return { ...st, tint: 'brightness(2.6) sepia(1) saturate(5) hue-rotate(-25deg)' };
        if (k > BURN_SEC + BURN_CLEAN) return st;
        const dirty = k <= BURN_SEC || Math.floor((k - BURN_SEC) / 0.08) % 3 !== 0 && (k - BURN_SEC) < BURN_CLEAN * 0.7;
        if (!dirty) return st;
        const ph = Math.max(80, Math.min(f.y, H) - h.y);
        const top = mapCam(st, { x: h.x, y: h.y + ph * 0.02 }, f, h);
        const blink = (k % 0.9) > 0.8;
        const eyes = k > 0.25 && k < BURN_SEC ? { L: mapCam(st, { x: h.x - ph * 0.05, y: h.y + ph * 0.11 }, f, h), R: mapCam(st, { x: h.x + ph * 0.05, y: h.y + ph * 0.11 }, f, h), r: ph * 0.026 * st.sy, blink } : null;
        const mouth = mapCam(st, { x: h.x, y: h.y + ph * 0.19 }, f, h);
        const cough = [0.65, 1.05, 1.45].some(t => k >= t && k < t + 0.08);
        return { ...st, tint: 'brightness(0.16) contrast(1.7)', smoke: { x: top.x, y: top.y, mouth, cough, rate: k < BURN_SEC ? 1 : 0.3 }, eyes };
    }
    // 🕶 'matrix' (vẫn WIN): đoạn phi tiêu (HB.NINJA_SLOW, giây video) video chạy CHẬM nSlow %; NPC ngả người ra sau gần nằm, đầu gối
    // khuỵu, lắc nhẹ - 3 phi tiêu bay sượt trên người; bóng mờ xanh (ghost) + màn ám xanh lúc chậm (vẽ ở frame).
    function matrixAt(S, C) {
        const SL = HB.NINJA_SLOW, q = (S - SL.from) / (SL.to - SL.from);
        const inK = easeOut(clamp01(q / 0.14)), outK = easeIn(clamp01((q - 0.86) / 0.14)), k = inK * (1 - outK);
        return C.grp({ ...C.neutral, lean: 0.06 + (-1.42 + 0.07 * Math.sin(q * TAU * 1.5) - 0.06) * k, sy: 1 - 0.15 * k, sxk: 1 + 0.05 * k, wsy: 1 - 0.25 * k });
    }
    // 😵 'bonk' (vẫn WIN): Bowser húc trúng ở nBonkHit (bỏ cú trượt háng) → bị ép dẹt, loé → lăn lông lốc sang trái 2 vòng → ngồi choáng,
    // lắc lư, 3 ngôi sao xoay quanh đầu → lắc đầu tỉnh, chạy về giữa cam (BONK_SEC).
    const BONK_SEC = 1.17;
    function bonkAt(S, C) {
        const t = S - fx.script.nBonkHit, gx = C.gx, out = gx - W * 0.25;
        if (t < 0.06) return { ...C.grp({ ...C.neutral, sxk: 0.82, sy: 0.92 }), tint: 'brightness(2)' };
        if (t < 0.62) {
            const q = (t - 0.06) / 0.56;
            return C.grp({ ...C.neutral, x: gx + (out - gx) * easeOut(q), lift: Math.sin(Math.PI * q) * H * 0.1, theta: -TAU * 2 * easeOut(q), sy: 0.85, lean: 0 });
        }
        const stars = (st, a) => ({ ...st, stars: { at: mapCam(st, C.h, C.f, C.h), r: C.ph * st.sy * 0.32, t, a } });
        if (t < 1.0) {
            const st = C.grp({ ...C.neutral, x: out, sy: 0.78, wsy: 0.7, lean: Math.sin(t * 9) * 0.16 });
            return stars(st, 1);
        }
        const q = (t - 1.0) / (BONK_SEC - 1.0);
        const st = C.grp({ ...C.neutral, x: out + (gx - out) * easeInOut(q), lift: Math.abs(Math.sin(S * Math.PI * 3.2)) * H * 0.008, lean: 0.06 + 0.12 * Math.sin(Math.PI * q) });
        return stars(st, 1 - q);
    }
    // 🐢 'ride' (vẫn WIN): nhảy lên lưng Bowser ở nRideAt (bỏ cú trượt háng), cưỡi nhún theo bước chạy của nó, bị chở ra khỏi màn bên trái,
    // rồi chạy vào lại từ mép trái về giữa cam (RIDE.backT0 → backT1).
    const RIDE_JUMP = 0.15, RIDE = { lift: 0.205, backT0: 5.72, backT1: 6.06 };
    function rideAt(S, C) {
        const sc = fx.script, t1 = sc.nRideAt, back = x => x + W * 0.08;
        if (S < t1) {
            const q = (S - (t1 - RIDE_JUMP)) / RIDE_JUMP, u = 1 - q;
            return C.grp({ ...C.neutral, x: C.gx + (back(bowserX(t1)) - C.gx) * q, lift: 2 * u * q * H * (RIDE.lift + 0.1) + q * q * H * RIDE.lift, sy: 0.9, lean: -0.1 });
        }
        if (S < RIDE.backT0) {
            return C.grp({ ...C.neutral, x: back(bowserX(S)), lift: H * RIDE.lift + Math.abs(Math.sin(S * Math.PI * 6)) * H * 0.012, sy: 0.86, wsy: 0.6, lean: -0.12 + Math.sin(S * 14) * 0.05 });
        }
        const q = (S - RIDE.backT0) / (RIDE.backT1 - RIDE.backT0);
        return C.grp({ ...C.neutral, x: -W * 0.15 + (C.gx + W * 0.15) * easeOut(q), lift: Math.abs(Math.sin(S * Math.PI * 4.4)) * H * 0.012, lean: 0.18 * (1 - q) + 0.06 });
    }
    // 🪧 'pole' (vẫn WIN): biển hp trôi qua giữa cam ~7,24 s theo <video> (31 % ngang / giây, mép trên tấm biển ~64,5 % cao) → nhún nhảy
    // tới nắm biển (đỉnh đầu bám mép biển, người co nhỏ lại), xoay vòng xà đơn 1,15 vòng theo biển trôi, buông tay bay lên lộn về giữa cam.
    const POLE = { jump: 0.12, swing: 0.55, fly: 0.35, gripY: 0.645, t0: 7.24, v: 0.31 };
    POLE.total = POLE.jump + POLE.swing + POLE.fly;
    const signX = S => (0.5 - POLE.v * (S - POLE.t0)) * W;
    function hangAt(C, x, y, a, s) {
        const sc = fx.script, bodyH = C.ph * s, Dx = C.D * (s / C.gs);
        const off = sc.nFeetMode === 'full' ? -sc.nFeetLeg / 100 * bodyH : Dx * (0.5 - C.up);
        const dn = { x: -Math.sin(a), y: Math.cos(a) };
        const ft = { x: x + dn.x * bodyH, y: y + dn.y * bodyH }, wc = { x: ft.x + dn.x * off, y: ft.y + dn.y * off };
        return { dx: 0, dy: 0, sx: s, sy: s, rot: a, alpha: 1, clip: null, tint: '', pv: { x, y, rel: 0 },
            feet: { x: wc.x, y: wc.y, w: Dx, h: Dx * FEET_ASPECT, rot: a, alpha: 1 }, shadow0: { x: wc.x, w: Dx, k: 0.4 } };
    }
    function poleAt(S, C) {
        const t = S - fx.script.nPoleAt, gy = POLE.gripY * H, s = C.gs * 0.82, aEnd = -TAU * 1.15;
        const g0 = fx.script.nPoleAt + POLE.jump, r0 = g0 + POLE.swing;
        if (t < POLE.jump) {
            const q = t / POLE.jump;
            return C.grp({ ...C.neutral, x: C.gx + (signX(g0) - C.gx) * q, lift: Math.sin(Math.PI * q) * H * 0.05, sy: 1 - 0.18 * Math.sin(Math.PI * q), lean: -0.1 });
        }
        if (t < POLE.jump + POLE.swing) {
            const q = (t - POLE.jump) / POLE.swing;
            return hangAt(C, signX(S), gy, aEnd * easeInOut(q), s);
        }
        // buông tay: bay vồng lên, lộn nốt về thẳng người, đáp giữa cam
        const q = (t - POLE.jump - POLE.swing) / POLE.fly, u = 1 - q;
        const hang = hangAt(C, signX(r0), gy, aEnd, s), x0 = hang.feet.x, lift0 = Math.max(0, C.ground - hang.feet.y - C.D * 0.5);
        const squash = q > 0.85 ? 0.22 * Math.sin(Math.PI * (q - 0.85) / 0.15) : 0;
        return C.grp({ ...C.neutral, x: x0 + (C.gx - x0) * easeInOut(q), lift: u * u * lift0 + 2 * u * q * H * 0.32, s: s + (C.gs - s) * q,
            theta: aEnd + (-TAU * 2 - aEnd) * easeOut(q), lean: 0, sy: 1 - squash, wsy: 1 - squash });
    }
    // 🌠 'gone' (GAME OVER): bị lốc cuốn như 🌪 (đoạn cuốn vào) rồi bay vút lên góc trên trái, nhỏ dần thành một chấm → lấp lánh "ting"
    // → bảng GAME OVER (ko + 1,7 s). Video nền chạy tiếp.
    function goneAt(S, C) {
        const sc = fx.script, t0 = sc.nTwistHit, t1 = t0 + (sc.nTwistLand - t0) * 0.33, tEnd = t0 + 1.25;
        if (S < t1) return twistAt(S, C.grp, C.neutral, C.gx, C.gs);
        const dot = { x: W * 0.16, y: H * 0.1 };
        if (S < tEnd) {
            const q = easeIn((S - t1) / (tEnd - t1)), x0 = twistX(t1);
            const st = C.grp({ ...C.neutral, x: x0 + (dot.x - x0) * q, lift: H * 0.27 + (C.ground - dot.y - H * 0.27) * q, lean: 0,
                s: Math.exp(Math.log(C.gs) * (1 - q) + Math.log(C.gs * 0.03) * q), theta: TAU * 3 * q });
            return st;
        }
        return { dx: 0, dy: 0, sx: 0.01, sy: 0.01, rot: 0, alpha: 0, clip: null, tint: '', pv: { x: dot.x, y: dot.y, rel: 1 }, twinkle: { ...dot, t: S - tEnd } };
    }

    // 🌪 Bị lốc cuốn (fx.end 'twister', vẫn WIN): lốc chạm NPC ở nTwistHit → (1/3 đầu) kéo vào tâm lốc đang trôi sang trái, nhấc lên
    // tới đỉnh lốc, quay vòng quanh lốc (dẹt ngang theo cos) + lắc → (tới 70 %) văng lên cao gần mép trên, lộn vòng, về lại giữa cam, nhỏ đi
    // chút (xa) → rơi thẳng xuống, lộn nốt về thẳng người → nTwistLand chạm đất "BỊCH": dẹt rồi nảy về (TWIST_SQUASH giây), bụi + chữ.
    // Lốc trong ninja.mp4 (đo khung 5 /s): tâm 64 % ngang lúc 1,8 s, trôi sang trái 117,5 % ngang / giây; đỉnh lốc ~62 % cao.
    const TWIST_SQUASH = 0.28;
    const twistX = S => (0.64 - 1.175 * (S - 1.8)) * W;
    function twistAt(S, grp, neutral, gx, gs) {
        const sc = fx.script, t0 = sc.nTwistHit, t3 = Math.max(t0 + 0.3, sc.nTwistLand);
        const t1 = t0 + (t3 - t0) * 0.33, t2 = t0 + (t3 - t0) * 0.7;
        const topLift = H * 0.27, apex = H * 0.56;
        if (S < t1) {
            const k = (S - t0) / (t1 - t0), spin = k * TAU * 2.5;
            return grp({ ...neutral, x: gx + (twistX(S) - gx) * easeOut(clamp01(k * 1.6)), lift: topLift * easeIn(k), lean: 0,
                sxk: Math.max(0.22, Math.abs(Math.cos(spin))), theta: Math.sin(k * 22) * 0.3 * k });
        }
        if (S < t2) {
            const k = (S - t1) / (t2 - t1), x0 = twistX(t1);          // = chỗ cuối đoạn cuốn vào (đã về tâm lốc)
            return grp({ ...neutral, x: x0 + (gx - x0) * easeInOut(k), lift: topLift + (apex - topLift) * easeOut(k), lean: 0,
                s: gs * (1 - 0.15 * easeOut(k)), theta: TAU * 3.5 * easeOut(k) });
        }
        if (S < t3) {
            const k = (S - t2) / (t3 - t2);
            return grp({ ...neutral, lift: apex * (1 - easeIn(k)), lean: 0, s: gs * (0.85 + 0.15 * k), theta: TAU * 3.5 + TAU * 0.5 * easeOut(k) });
        }
        // "BỊCH": dẹt xuống rồi nảy về
        const q = clamp01((S - t3) / TWIST_SQUASH), c = 0.45 * (1 - easeOut(q));
        return grp({ ...neutral, lean: 0, sy: 1 - c, sxk: 1 + c * 0.9, wsy: 1 - c * 0.8 });
    }

    // 💀 Kết thúc GAME OVER (fx.end): ⭐ 'star' dính phi tiêu - chớp đỏ, video ĐỨNG HÌNH, bật lên rồi rơi nằm ngang trên đất (đĩa chân
    // văng mất) · 🪨 'rock' đá lăn đè: người + đĩa chân bị ép dẹt theo mặt dưới cục đá (đá vẽ lại ĐÈ LÊN người), nằm bẹp dí.
    // Cục đá trong ninja.mp4 (đo khung 10 /s, chỉnh theo giờ <video> trong trình duyệt): tâm qua 50 % ngang lúc 9,04 s, chạy 126 % ngang / giây,
    // tâm cao 79,7 %, bán kính 9,9 % cao.
    const ROCK = { t0: 9.04, x0: 0.504, v: 1.26, y: 0.797, r: 0.099 };
    const rockAt = S => ({ x: (ROCK.x0 - ROCK.v * (S - ROCK.t0)) * W, y: ROCK.y * H, r: ROCK.r * H });
    function ninjaDead(e, f, h) {
        const sc = fx.script, P = fx.plan, S = e / 1000, t = (e - P.ko) / 1000;
        const ay = Math.min(f.y, H), ph = Math.max(80, ay - h.y), ground = sc.nGround / 100 * H;
        const base = ninjaAlive(P.ko - 1, f, h), s0 = base.sy, sx0 = base.sx, bodyH = ph * s0, bf = base.feet;
        const back = e >= P.back ? easeInOut(clamp01((e - P.back) / Math.max(1, sc.inMs))) : 0;
        const st = (pv, extra) => ({ dx: 0, dy: 0, sx: sx0, sy: s0, rot: 0, alpha: 1, clip: null, tint: '', pv, ...extra });
        if (fx.end === 'star') {
            const c0 = { x: base.pv.x, y: base.pv.y - bodyH / 2 };
            const thick = Math.max(16, (person.w || ph * 0.5) * s0 * 0.42);
            const lie = { x: c0.x - W * 0.06, y: ground - thick / 2 };
            // 0–0,18 s: chớp đỏ / trắng + giật
            if (t < 0.18) {
                const red = Math.floor(t / 0.045) % 2 === 0;
                return st({ x: c0.x + (Math.random() - 0.5) * 14, y: c0.y, rel: 0.5 }, { tint: red ? 'sepia(1) saturate(7) hue-rotate(-38deg) brightness(1.15)' : 'brightness(2.4)', feet: bf, shadow0: base.shadow0 });
            }
            const k = clamp01((t - 0.18) / 0.82);
            const fly = bf ? { ...bf, x: bf.x + W * 0.3 * k, y: bf.y - Math.sin(Math.PI * k) * H * 0.12 + k * k * H * 0.2, rot: 7 * k, alpha: 1 - clamp01(k / 0.6) } : null;
            if (k < 1) {
                // bật lên kiểu chết trong game rồi rơi ngửa xuống đất (đầu về phía trái - phi tiêu bay từ phải sang)
                const u = 1 - k, y = u * u * c0.y + 2 * u * k * (c0.y - H * 0.2) + k * k * lie.y;
                return st({ x: c0.x + (lie.x - c0.x) * k, y, rel: 0.5 }, { rot: -Math.PI / 2 * easeOut(k) + Math.sin(k * 9) * 0.06 * u, feet: fly });
            }
            const bounce = t < 1.15 ? Math.sin(Math.PI * (t - 1) / 0.15) * H * 0.012 : 0;
            const lying = { x: lie.x, y: lie.y - bounce, rel: 0.5 };
            if (!back) return st(lying, { rot: -Math.PI / 2, tint: 'saturate(0.6)' });
            return st({ x: lying.x + (f.x - lying.x) * back, y: lying.y + (ay - lying.y) * back, rel: 0.5 + 0.5 * back },
                { rot: -Math.PI / 2 * (1 - back), sx: Math.exp(Math.log(sx0) * (1 - back)), sy: Math.exp(Math.log(s0) * (1 - back)) });
        }
        // 🪨 đá đè: ép dần từ lúc mép đá chạm thân NPC tới lúc tâm đá qua đúng chỗ NPC (đá vẽ lại đè lên người); qua rồi nằm bẹp luôn
        const xN = base.pv.x, floor = 0.07, half = Math.max(30, (bf ? bf.w : ph * s0 * 0.5) / 2);
        const R = rockAt(S), c = clamp01((xN + half + R.r - R.x) / (R.r + half));
        let q = 1 - (1 - floor) * easeInOut(c);
        if (back) q = floor + (1 - floor) * elastic(back);
        const wob = q <= floor + 0.01 && !back ? 1 + 0.05 * Math.sin(t * 26) * Math.exp(-t * 2.5) : 1;
        const fy = ground - (ground - base.pv.y) * q, spread = 1 + 0.8 * (1 - q);
        const p = { x: xN + (f.x - xN) * back, y: fy + (ay - fy) * back, rel: 1 };
        return st(p, { sx: Math.exp(Math.log(sx0) * (1 - back)) * spread * wob, sy: Math.exp(Math.log(s0) * (1 - back)) * q,
            feet: bf ? { ...bf, y: ground - (ground - bf.y) * q, h: bf.h * q, w: bf.w * spread, alpha: 1 - back } : null, shadow0: back ? null : base.shadow0 });
    }

    // 💨 khói (🔥 cháy đen): bốc từ đỉnh đầu, ho thì phụt cụm khói ra từ miệng; hạt sống fx.smoke (vẽ cả khi st không còn khói).
    function drawSmoke(sm, dt) {
        if (sm) {
            const n = Math.random() < sm.rate * dt * 14 ? 1 : 0;
            for (let i = 0; i < n; i++) fx.smoke.push({ x: sm.x + (Math.random() - 0.5) * W * 0.03, y: sm.y, vx: (Math.random() - 0.5) * 30, vy: -60 - Math.random() * 60, r: W * 0.012 + Math.random() * W * 0.012, age: 0, life: 1.2 + Math.random() * 0.6 });
            if (sm.cough && !fx.smoke.coughing) for (let i = 0; i < 7; i++) fx.smoke.push({ x: sm.mouth.x, y: sm.mouth.y, vx: -120 - Math.random() * 160, vy: -40 + Math.random() * 60, r: W * 0.014 + Math.random() * W * 0.012, age: 0, life: 0.8 + Math.random() * 0.4 });
            fx.smoke.coughing = sm.cough;
        }
        for (const p of fx.smoke) {
            p.age += dt; if (p.age >= p.life) continue;
            p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97;
            const k = p.age / p.life;
            ctx.fillStyle = `rgba(70,66,64,${0.55 * (1 - k)})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + k * 1.8), 0, TAU); ctx.fill();
        }
        fx.smoke = Object.assign(fx.smoke.filter(p => p.age < p.life), { coughing: fx.smoke.coughing });
    }
    // 👀 2 mắt trắng tròn kiểu hoạt hình trên mặt đen thui (chớp = 1 vạch)
    function drawEyes(E) {
        ctx.save();
        for (const p of [E.L, E.R]) {
            if (E.blink) { ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, E.r * 0.35); ctx.beginPath(); ctx.moveTo(p.x - E.r, p.y); ctx.lineTo(p.x + E.r, p.y); ctx.stroke(); continue; }
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(p.x, p.y, E.r, E.r * 1.25, 0, 0, TAU); ctx.fill();
            ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(p.x + E.r * 0.15, p.y + E.r * 0.2, E.r * 0.42, 0, TAU); ctx.fill();
        }
        ctx.restore();
    }
    // 💫 3 ngôi sao vàng pixel xoay quanh đầu (😵 bị húc choáng)
    function drawStars(S) {
        if (S.a <= 0.02) return;
        const z = Math.max(5, W / 85);
        for (let i = 0; i < 3; i++) {
            const an = S.t * 7 + i * TAU / 3, x = S.at.x + Math.cos(an) * S.r, y = S.at.y - S.r * 0.15 + Math.sin(an) * S.r * 0.3;
            ctx.save(); ctx.globalAlpha *= S.a; ctx.fillStyle = '#ffe14d'; ctx.strokeStyle = '#7a4a00'; ctx.lineWidth = z * 0.4;
            ctx.fillRect(x - z / 2, y - z * 1.5, z, z * 3); ctx.fillRect(x - z * 1.5, y - z / 2, z * 3, z);
            ctx.strokeRect(x - z / 2, y - z * 1.5, z, z * 3); ctx.strokeRect(x - z * 1.5, y - z / 2, z * 3, z);
            ctx.restore();
        }
    }
    // 🕶 màn ám xanh + tối 4 góc lúc chạy chậm
    function drawSlowTint(S) {
        const SL = HB.NINJA_SLOW, k = clamp01(Math.min((S - SL.from) / 0.25, (SL.to - S) / 0.25));
        if (k <= 0 || S < SL.from || S >= SL.to) return;
        ctx.save();
        ctx.fillStyle = `rgba(20,70,160,${0.16 * k})`; ctx.fillRect(0, 0, W, H);
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,10,${0.45 * k})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }
    // 🎁 CONTINUE: bảng đếm 3 · 2 · 1 · GO! (CONT_MS) rồi hồi sinh. Video ĐỨNG HÌNH (⭐) chạy tiếp từ chỗ dừng; video đã HẾT (🪨) tua về
    // trước lúc chết 0,3 s; còn chạy (🌠) thì hồi sinh ngay giữa cam. Sau đó là lượt WIN (mốc né đầy đủ), nhấp nháy bất tử 1,4 s.
    const CONT_MS = 1700;
    function drawContinue(t) {
        ctx.save();
        ctx.fillStyle = 'rgba(8,4,24,0.55)'; ctx.fillRect(-20, -20, W + 40, H + 40);
        pixText('CONTINUE!', H * 0.045, W / 2, H * 0.33, { k: 3, fill: '#5cf2ff', fill2: '#2a8cff' });
        const n = 3 - Math.floor(t / 0.45), pop = easeOutBack(clamp01((t % 0.45) / 0.2));
        pixText(n > 0 ? String(n) : 'GO!', H * (n > 0 ? 0.16 : 0.11) * pop, W / 2, H * 0.47, { k: 4, fill: '#fff36b', fill2: '#ff3d5a' });
        pixText(hpT('CẢM ƠN QUÀ TẶNG!'), H * 0.026, W / 2, H * 0.58, { k: 3, fill: '#ffffff', fill2: '#ffd23f' });
        ctx.restore();
    }
    function ninjaRevive(now, P, el) {
        const S0 = fx.end === 'star' ? P.ko : el && el.ended ? Math.max(0, P.ko - 300) : (fx.clock != null ? now - fx.clock : P.ko);
        fx.cont.done = true;
        fx.end = 'win'; fx.frozen = false; fx.reviveAt = S0;
        fx.moves = HB.parseMoves(fx.script.nMoves);
        for (const k of ['over', 'dust', 'ko']) fx.cue.delete(k);
        if (el) { try { el.currentTime = S0 / 1000; } catch (_) {} el.play().catch(() => {}); }
        fx.clock = now - S0; fx.vt = -1;
    }

    // 🎮 Bảng WIN / GAME OVER kiểu game 8-bit (WIN: chữ YOU / WIN vàng + pháo giấy pixel): nền tối dần, bảng rơi xuống nảy (viền pixel trắng / hồng, nền tím, vạch quét), chữ GAME / OVER
    // rơi từng chữ (font Bungee vẽ trên lưới thô rồi phóng to KHÔNG làm mịn → chữ pixel), logo hp BÊN PHẢI (user 2026-10-23) nảy ra +
    // lấp lánh, lý do thua, "TẶNG QUÀ ĐỂ CHƠI LẠI" nhấp nháy như PRESS START. a = độ hiện (mờ dần lúc về cỡ thật).
    const hpT = (s, v) => (typeof window.hpT === 'function' ? window.hpT(s, v) : s);
    let goLogo = null;
    function goAssets() {
        if (!goLogo) { goLogo = new Image(); goLogo.src = '/games/body/samples/hp-logo.png'; }
        if (!document.querySelector('link[data-hp-gift-fonts]')) {
            const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/games/body/fonts/bungee.css'; l.dataset.hpGiftFonts = '1';
            l.onload = () => { try { document.fonts.load('60px Bungee', 'GAME OVER YOU WIN ' + hpT('TẶNG QUÀ ĐỂ CHƠI LẠI') + hpT('BỊ ĐÁ ĐÈ BẸP!')); } catch (_) {} };
            document.head.appendChild(l);
        }
    }
    const easeOutBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
    let pbuf = null;
    // Chữ pixel: vẽ cỡ px/k trên canvas phụ (viền + bóng đổ + tô chuyển màu) rồi phóng to k lần không làm mịn. Trả bề ngang đã vẽ.
    function pixText(str, px, x, y, { fill = '#fff', fill2 = '', stroke = '#1a0533', k = 3, align = 'center', alpha = 1, measure = false } = {}) {
        if (!pbuf) pbuf = document.createElement('canvas');
        const g = pbuf.getContext('2d'), fs = Math.max(6, Math.round(px / k)), font = `${fs}px Bungee, Impact, 'Arial Black', sans-serif`;
        g.font = font;
        const pad = Math.ceil(fs * 0.25), tw = Math.ceil(g.measureText(str).width) + pad * 2, th = Math.ceil(fs * 1.3) + pad * 2;
        if (measure) return g.measureText(str).width * k;                   // bề rộng chữ (không tính lề)
        if (pbuf.width < tw || pbuf.height < th) { pbuf.width = Math.max(pbuf.width, tw); pbuf.height = Math.max(pbuf.height, th); }
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, pbuf.width, pbuf.height);
        g.font = font; g.textBaseline = 'middle'; g.textAlign = 'left'; g.lineJoin = 'round';
        const cy = th / 2, sh = Math.max(1, Math.round(fs * 0.07));
        g.fillStyle = stroke; g.lineWidth = Math.max(2, fs * 0.18); g.strokeStyle = stroke;
        g.strokeText(str, pad + sh, cy + sh); g.fillText(str, pad + sh, cy + sh);              // bóng đổ
        g.strokeText(str, pad, cy);
        if (fill2) { const gr = g.createLinearGradient(0, cy - fs * 0.45, 0, cy + fs * 0.45); gr.addColorStop(0, fill); gr.addColorStop(1, fill2); g.fillStyle = gr; } else g.fillStyle = fill;
        g.fillText(str, pad, cy);
        const dw = tw * k, dh = th * k, dx = align === 'center' ? x - dw / 2 : align === 'right' ? x - dw : x;
        ctx.save(); ctx.globalAlpha *= alpha; ctx.imageSmoothingEnabled = false;
        ctx.drawImage(pbuf, 0, 0, tw, th, Math.round(dx), Math.round(y - dh / 2), dw, dh);
        ctx.restore();
        return dw;
    }
    // Khung bo góc bậc thang (góc pixel) - st = cỡ 1 bậc.
    function pixRect(x, y, w, h, st) {
        ctx.beginPath();
        ctx.moveTo(x + 2 * st, y); ctx.lineTo(x + w - 2 * st, y); ctx.lineTo(x + w - 2 * st, y + st); ctx.lineTo(x + w - st, y + st); ctx.lineTo(x + w - st, y + 2 * st);
        ctx.lineTo(x + w, y + 2 * st); ctx.lineTo(x + w, y + h - 2 * st); ctx.lineTo(x + w - st, y + h - 2 * st); ctx.lineTo(x + w - st, y + h - st);
        ctx.lineTo(x + w - 2 * st, y + h - st); ctx.lineTo(x + w - 2 * st, y + h); ctx.lineTo(x + 2 * st, y + h); ctx.lineTo(x + 2 * st, y + h - st);
        ctx.lineTo(x + st, y + h - st); ctx.lineTo(x + st, y + h - 2 * st); ctx.lineTo(x, y + h - 2 * st); ctx.lineTo(x, y + 2 * st); ctx.lineTo(x + st, y + 2 * st);
        ctx.lineTo(x + st, y + st); ctx.lineTo(x + 2 * st, y + st); ctx.closePath();
    }
    function sparkle(x, y, z, a) {
        if (a <= 0.02) return;
        ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = '#fff6b0';
        ctx.fillRect(x - z / 2, y - z * 1.5, z, z * 3); ctx.fillRect(x - z * 1.5, y - z / 2, z * 3, z);
        ctx.restore();
    }
    function drawEndBoard(t, a, ending) {
        const win = HB.ninjaWin(ending);
        if (a <= 0.01) return;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = `rgba(8,4,24,${(win ? 0.35 : 0.55) * clamp01(t / 0.35)})`;
        ctx.fillRect(-20, -20, W + 40, H + 40);
        if (win) {
            // pháo giấy pixel rơi (tất định theo chỉ số - không cần lưu hạt)
            const COL = ['#ff4f9a', '#ffe14d', '#5cf2ff', '#7dff7a', '#ffffff', '#ff9d00'];
            for (let i = 0; i < 70; i++) {
                const r1 = hash01(i * 3.1 + 1), r2 = hash01(i * 7.7 + 2), r3 = hash01(i * 1.3 + 5);
                const y = ((t * (0.18 + 0.22 * r2) + r3) % 1.1) * H * 1.05 - H * 0.05, x = r1 * W + Math.sin(t * 3 + i) * 18, z = W / 150 * (1 + Math.round(r2 * 2));
                ctx.fillStyle = COL[i % COL.length]; ctx.fillRect(Math.round(x / z) * z, Math.round(y / z) * z, z * (1 + (i % 2)), z);
            }
        }
        const bw = W * 0.86, bh = H * 0.235, bx = (W - bw) / 2, drop = easeOutBack(clamp01(t / 0.55));
        const by = H * 0.3 - (1 - drop) * H * 0.55, u = Math.max(6, Math.round(W / 150));          // u = 1 "điểm ảnh" của khung
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; pixRect(bx + u * 2.5, by + u * 2.5, bw, bh, u * 2); ctx.fill();           // bóng
        ctx.fillStyle = '#0b0620'; pixRect(bx - u, by - u, bw + 2 * u, bh + 2 * u, u * 2); ctx.fill();
        ctx.fillStyle = '#ffffff'; pixRect(bx, by, bw, bh, u * 2); ctx.fill();
        ctx.fillStyle = '#ff4f9a'; pixRect(bx + u * 1.5, by + u * 1.5, bw - u * 3, bh - u * 3, u * 1.5); ctx.fill();
        const ix = bx + u * 3, iy = by + u * 3, iw = bw - u * 6, ih = bh - u * 6;
        const gr = ctx.createLinearGradient(0, iy, 0, iy + ih); gr.addColorStop(0, '#2c1063'); gr.addColorStop(1, '#10052c');
        ctx.fillStyle = gr; pixRect(ix, iy, iw, ih, u); ctx.fill();
        ctx.save(); pixRect(ix, iy, iw, ih, u); ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.045)';
        for (let y = iy; y < iy + ih; y += u * 1.5) ctx.fillRect(ix, y, iw, Math.max(1, u * 0.4));          // vạch quét CRT
        ctx.restore();
        // logo hp BÊN PHẢI, chữ GAME / OVER bên trái
        const L = Math.min(ih * 0.62, iw * 0.27), lx = ix + iw - u * 4 - L, ly = iy + ih * 0.42;
        const tx0 = ix + u * 5, tw = lx - u * 4 - tx0, fs = ih * 0.36;
        (win ? ['YOU', 'WIN'] : ['GAME', 'OVER']).forEach((word, row) => {
            let w = 0; const ws = [...word].map(c => pixText(c, fs, 0, 0, { k: 4, measure: true }) * 1.04);
            for (const x of ws) w += x;
            const sc = Math.min(1, tw / w), y0 = iy + ih * (row ? 0.6 : 0.26);
            let x = tx0 + (tw - w * sc) / 2;
            [...word].forEach((c, i) => {
                const ti = 0.35 + (row * 4 + i) * 0.07, q = clamp01((t - ti) / 0.28);
                if (q > 0) pixText(c, fs * sc, x + ws[i] * sc / 2, y0 - (1 - easeOutBack(q)) * fs * 0.9,
                    { k: 4, fill: win ? '#fffbd0' : '#fff36b', fill2: win ? '#ffb300' : '#ff3d5a', alpha: clamp01(q * 3) });
                x += ws[i] * sc;
            });
        });
        const lq = clamp01((t - 1.0) / 0.4);
        if (lq > 0 && goLogo && goLogo.complete && goLogo.naturalWidth) {
            const z = L * easeOutBack(lq), bob = Math.sin(t * 2.6) * u * 1.2;
            ctx.save(); ctx.translate(lx + L / 2, ly + bob); ctx.rotate(Math.sin(t * 1.8) * 0.07);
            ctx.fillStyle = '#0b0620'; pixRect(-z / 2 - u, -z / 2 - u, z + 2 * u, z + 2 * u, u * 1.5); ctx.fill();
            ctx.imageSmoothingEnabled = true; ctx.drawImage(goLogo, -z / 2, -z / 2, z, z);
            ctx.restore();
            for (let i = 0; i < 4; i++) {
                const an = i * 1.7 + 0.6, ph = (t * 1.3 + i * 0.37) % 1;
                sparkle(lx + L / 2 + Math.cos(an) * L * 0.62, ly + Math.sin(an) * L * 0.62, u, lq * Math.sin(Math.PI * ph));
            }
        }
        const reason = win ? hpT('VƯỢT QUA MỌI THỬ THÁCH!') : ending === 'rock' ? hpT('BỊ ĐÁ ĐÈ BẸP!') : ending === 'gone' ? hpT('BỊ LỐC CUỐN BAY MẤT!') : hpT('TRÚNG PHI TIÊU!');
        if (t > 1.0) pixText(reason, ih * 0.13, ix + iw / 2, iy + ih * 0.9, { k: 3, fill: '#ffffff', fill2: '#bfe9ff', alpha: clamp01((t - 1.0) / 0.3) });
        // nhấp nháy như PRESS START
        if (t > 1.4 && (t - 1.4) % 0.9 < 0.58) {
            const cy = by + bh + H * 0.055, cta = win ? hpT('TẶNG QUÀ ĐỂ CHƠI TIẾP') : hpT('TẶNG QUÀ ĐỂ CHƠI LẠI'), cw = pixText(cta, H * 0.03, W / 2, cy, { k: 3, fill: '#ffe14d', fill2: '#ff9d00' });
            ctx.fillStyle = '#ffe14d';
            for (const sgn of [-1, 1]) {
                const ax = W / 2 + sgn * (cw / 2 + u * 3), s = u * 2.2;
                ctx.beginPath(); ctx.moveTo(ax - sgn * s, cy - s); ctx.lineTo(ax + sgn * s * 0.6, cy); ctx.lineTo(ax - sgn * s, cy + s); ctx.closePath(); ctx.fill();
            }
        }
        ctx.restore();
    }

    // ☁️ Mây pixel 8-bit (hợp nền rừng NES): các cục tròn vẽ trên lưới thô rồi phóng to KHÔNG làm mịn; viền tím đậm, thân lavender,
    // mặt trên trắng; bồng bềnh nhẹ. puff 0..1 = tan (cục bung ra, to dần, mờ).
    const CLOUD = [[-0.38, 0.04, 0.12], [-0.24, -0.04, 0.15], [-0.07, -0.09, 0.17], [0.11, -0.08, 0.16], [0.27, -0.02, 0.14], [0.4, 0.05, 0.1],
        [-0.15, 0.07, 0.14], [0.08, 0.07, 0.15], [0.26, 0.08, 0.11]];
    let cbuf = null;
    function drawCloud(c, t) {
        if (!c || c.alpha <= 0.01 || !(c.w > 4)) return;
        const n = Math.max(24, Math.min(64, Math.round(c.w / 7)));          // số ô ngang (≈ 7 px / ô như pixel của nền)
        const bw = n * 2, bh = n * 2, cx = n, cy = n;
        if (!cbuf) cbuf = document.createElement('canvas');
        if (cbuf.width !== bw || cbuf.height !== bh) { cbuf.width = bw; cbuf.height = bh; }
        const g = cbuf.getContext('2d');
        g.clearRect(0, 0, bw, bh);
        const sp = 1 + c.puff * 0.9, gr = 1 + c.puff * 0.35;
        const lobes = CLOUD.map(([x, y, r], i) => ({ x: cx + x * n * sp, y: cy + (y - 0.12 * c.puff) * n * sp, r: (r + Math.sin(t * 2.2 + i * 1.7) * 0.008) * n * gr }));
        const pass = (col, dr, ox, oy, kr) => { g.fillStyle = col; for (const L of lobes) { g.beginPath(); g.arc(L.x + ox * L.r, L.y + oy * L.r, Math.max(0.5, L.r * kr + dr), 0, TAU); g.fill(); } };
        pass('#2b1d63', 1.2, 0, 0, 1);              // viền
        pass('#b7b0ea', 0, 0, 0, 1);                // thân (bóng dưới)
        pass('#f7f5ff', 0, -0.12, -0.22, 0.82);     // mặt trên sáng
        const k = c.w / n;
        ctx.save();
        ctx.globalAlpha *= c.alpha;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(cbuf, c.x - cx * k, c.y + 0.04 * c.w - cy * k, bw * k, bh * k);
        ctx.restore();
    }
    // Bóng dưới đĩa chân: nhạt + nhỏ khi nhảy cao.
    function drawGroundShadow(sh) {
        if (!sh) return;
        const sc = fx.script, y = sc.nGround / 100 * H, q = clamp01(sh.k), r = sh.w * (0.35 + 0.25 * q);
        ctx.save(); ctx.translate(sh.x, y); ctx.scale(1, 0.18);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, `rgba(0,0,0,${0.12 + 0.3 * q})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.restore();
    }

    // d = { script (đã chuẩn hoá), … }.
    function start(d, now) {
        person = env.person();
        const sc = d.script;
        const m = sc.file ? env.media(sc.file) : null;
        const f = feetOf();
        // Tụt cổng: người dời về đúng chỗ cổng trong video (neo ngang %); kiểu khác giữ chỗ đang đứng.
        const ox = sc.motion === 'portal' ? sc.anchorX / 100 * W - f.x : 0;
        fx = { d, script: sc, start: now, m, ox, plan: HB.vidFxPlan(sc, NaN), dust: [], landed: false, landedAt: 0, clock: null, vt: -1, cue: new Set(),
            loop: m && m.isVideo ? HB.vidFxLoop(sc) : { n: 0, len: 0 },
            moves: [], feet: null, end: null, frozen: false, smoke: [], cont: null, reviveAt: null, rate: 1 };
        if (m && m.isVideo) m.el.playbackRate = 1;
        if (sc.motion === 'ninja') {
            fx.end = sc.nEnd === 'random' || !HB.NINJA_OUTCOMES.includes(sc.nEnd) ? HB.NINJA_OUTCOMES[Math.floor(Math.random() * HB.NINJA_OUTCOMES.length)] : sc.nEnd;
            fx.plan = HB.vidFxPlan(sc, NaN, fx.end);
            const ko = fx.plan.ko != null ? fx.plan.ko / 1000 : Infinity;
            // ⭐ dính phi tiêu: cú né chứa lúc trúng thành nhảy HỤT (thấp), bỏ mọi cú sau · 🪨 đá đè: bỏ cú né đá (và mọi cú sau)
            fx.moves = HB.parseMoves(sc.nMoves).filter(mv => (fx.end === 'rock' ? mv.a < ko - 0.35 : mv.a <= ko))
                .filter(mv => fx.end !== 'twister' || !(mv.b > sc.nTwistHit - 0.3 && mv.a < sc.nTwistLand + 0.1))
                .filter(mv => !ninjaBlock(sc, fx.end).some(([a, b]) => mv.b > a && mv.a < b))
                .map(mv => (fx.end === 'star' && mv.b > ko ? { ...mv, low: true } : mv));
            goAssets();
        }
        if (m) env.playOnce(m, sc.sound);
        // 🎞 video NỀN dưới cùng (bgFile): lặp, câm, chạy cùng video chính - frame() giữ khớp giờ
        fx.bg = sc.bgFile ? env.media(sc.bgFile) : null;
        if (fx.bg && fx.bg.isVideo) { const el = fx.bg.el; el.loop = true; el.muted = true; try { el.currentTime = 0; } catch (_) {} el.play().catch(() => {}); }
        // 🥷 đĩa chân chạy: lặp, câm, chạy suốt lượt
        if (sc.motion === 'ninja' && env.drawAt) {
            const ft = env.media(HB.NINJA_FEET_FILE);
            if (ft && ft.isVideo) { fx.feet = ft; ft.el.loop = true; ft.el.muted = true; try { ft.el.currentTime = 0; } catch (_) {} ft.el.play().catch(() => {}); }
        }
        return true;
    }
    // Khoảng giây mà màn riêng của kiểu chơi chiếm chỗ - cú né rơi vào đây bị bỏ (màn tự lo vượt chướng ngại).
    function ninjaBlock(sc, end) {
        if (end === 'burnt') return [[sc.nBurnHit - 0.3, sc.nBurnHit + 0.4]];
        if (end === 'matrix') return [[HB.NINJA_SLOW.from - 0.05, HB.NINJA_SLOW.to]];
        if (end === 'bonk') return [[sc.nBonkHit - 0.35, sc.nBonkHit + BONK_SEC]];
        if (end === 'ride') return [[sc.nRideAt - RIDE_JUMP - 0.2, RIDE.backT1]];
        if (end === 'pole') return [[sc.nPoleAt, sc.nPoleAt + POLE.total]];
        if (end === 'gone') return [[sc.nTwistHit - 0.3, 99]];
        return [];
    }
    function stop() { if (fx && fx.m && fx.m.isVideo) { fx.m.el.pause(); fx.m.el.playbackRate = 1; } if (fx && fx.feet) fx.feet.el.pause(); if (fx && fx.bg && fx.bg.isVideo) fx.bg.el.pause(); fx = null; }
    // ms còn lại ước tính của lượt (để DANH SÁCH giữ hàng) - biết độ dài video thì theo video.
    function estMs() {
        if (!fx) return 0;
        const el = fx.m && fx.m.isVideo ? fx.m.el : null;
        return HB.vidFxPlan(fx.script, el && Number.isFinite(el.duration) ? el.duration * 1000 : NaN, fx.end || undefined).end + fx.loop.n * fx.loop.len;
    }

    // 🔊 Tiếng giả lập nhịp NGƯỜI (sfx-real.mjs): văng ra · về · đáp - chồng nhỏ dưới tiếng video. mp3 riêng / tắt → im.
    function sounds(e, P) {
        const sc = fx.script, m = sc.motion;
        if (m === 'mario' || m === 'pickle' || !env.sfx || !env.sfxOn || !env.sfxOn(sc)) return;
        const X = env.sfx, v = env.cfg().sfxVolume ?? 0.7, dir = sc.dir === 'left' ? -1 : 1;
        const once = (k, at, fn) => { if (e >= at && !fx.cue.has(k)) { fx.cue.add(k); if (e - at < 400) fn(); } };
        // 🪢 webm Ba Tư có sẵn tiếng vút + chát; chỉ khi video câm / tắt tiếng mới giả lập
        if (m === 'batu') {
            (P.hits || []).forEach((t, i) => {
                once('w' + i, (t - BATU_WIND) * 1000, () => X.whoosh(0.3, { vol: v * 0.6, f0: 400, f1: 1800, dir: 1 }));
                once('h' + i, t * 1000, () => { X.crack(0.35, { vol: v * 0.8 }); X.thud(0.35, { vol: v * 0.5 }); });
            });
            return;
        }
        // 🥷 video nền Ninja câm → tiếng giả lập: gió lúc cưỡi mây · chạm đất · vút mỗi cú nhảy / cúi · chạm đất sau cú nhảy
        if (m === 'ninja') {
            once('drop', sc.nDrop * 1000, () => X.wind(Math.max(0.2, sc.nLand - sc.nDrop), { vol: v * 0.6 }));
            once('land', sc.nLand * 1000, () => { X.thud(0.4, { vol: v * 0.6 }); X.rustle(0.45, { vol: v * 0.5 }); });
            if (fx.end === 'star') {
                once('ko', P.ko, () => { X.thud(0.5, { vol: v * 0.7 }); X.chip([[1568, 0.05], [1175, 0.05], [784, 0.09]], { vol: v * 0.8 }); });
                once('down', P.ko + 1000, () => X.thud(0.7, { vol: v * 0.8 }));
            } else if (fx.end === 'rock') once('ko', P.ko + 40, () => { X.thud(1.3, { vol: v }); X.crack(0.8, { vol: v * 0.7 }); X.debris(4, { vol: v * 0.4 }); });
            if (fx.end === 'twister') {
                const t0 = sc.nTwistHit, t3 = sc.nTwistLand;
                once('tw', t0 * 1000, () => { X.wind(Math.max(0.3, (t3 - t0) * 0.7), { vol: v * 0.9 }); X.whoosh(Math.max(0.3, (t3 - t0) * 0.4), { vol: v * 0.6, f0: 200, f1: 900 }); });
                once('twland', t3 * 1000, () => { X.thud(1.2, { vol: v }); X.debris(4, { vol: v * 0.4, spread: 0.5 }); });
            }
            const E = fx.end;
            if (E === 'burnt') {
                once('burn', sc.nBurnHit * 1000, () => { X.crack(0.5, { vol: v * 0.7 }); X.whoosh(0.4, { vol: v * 0.7, f0: 1800, f1: 300 }); X.chip([[880, 0.04], [440, 0.05], [220, 0.12]], { vol: v * 0.6 }); });
                [0.65, 1.05, 1.45].forEach((t, i) => once('cough' + i, (sc.nBurnHit + t) * 1000, () => X.chip([[170, 0.07], [0, 0.03], [150, 0.09]], { vol: v * 0.6, type: 'sawtooth' })));
            } else if (E === 'matrix') {
                once('slow', HB.NINJA_SLOW.from * 1000, () => { X.wind(1.6, { vol: v * 0.5 }); X.chip([[110, 0.5], [98, 0.6]], { vol: v * 0.5, type: 'triangle' }); });
                [6.32, 6.75, 7.28].forEach((t, i) => once('mx' + i, (t - 0.12) * 1000, () => X.whoosh(0.6, { vol: v * 0.7, f0: 160, f1: 520, dir: -1 })));
            } else if (E === 'bonk') {
                once('bonk', sc.nBonkHit * 1000, () => { X.thud(1.0, { vol: v }); X.chip([[220, 0.06], [440, 0.06], [880, 0.12]], { vol: v * 0.7 }); });
                once('stars', (sc.nBonkHit + 0.62) * 1000, () => X.chip([[1568, 0.06], [2093, 0.06], [1568, 0.06], [2093, 0.08]], { vol: v * 0.5 }));
            } else if (E === 'ride') {
                once('ride', (sc.nRideAt - RIDE_JUMP) * 1000, () => X.whoosh(0.3, { vol: v * 0.6, f0: 300, f1: 1800 }));
                once('rideon', sc.nRideAt * 1000, () => { X.thud(0.4, { vol: v * 0.6 }); X.chip([[523, 0.07], [784, 0.12]], { vol: v * 0.5 }); });
                once('rideback', RIDE.backT0 * 1000, () => X.steps(RIDE.backT1 - RIDE.backT0, { vol: v * 0.7, pan0: -0.8, pan1: 0 }));
            } else if (E === 'pole') {
                once('grab', (sc.nPoleAt + POLE.jump) * 1000, () => { X.thud(0.3, { vol: v * 0.5 }); X.whoosh(POLE.swing, { vol: v * 0.6, f0: 300, f1: 1500 }); });
                once('pland', (sc.nPoleAt + POLE.total - 0.05) * 1000, () => X.thud(0.35, { vol: v * 0.5 }));
            } else if (E === 'gone') {
                once('tw', sc.nTwistHit * 1000, () => { X.wind(1.4, { vol: v * 0.9 }); X.whoosh(1.2, { vol: v * 0.6, f0: 200, f1: 2400 }); });
                once('ting', (sc.nTwistHit + 1.25) * 1000, () => X.chip([[2093, 0.06], [2637, 0.14]], { vol: v * 0.7 }));
            }
            if (P.over != null) once('over', P.over, () => X.chip(HB.ninjaWin(fx.end)
                ? [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.2], [0, 0.06], [784, 0.1], [1047, 0.42]]
                : [[784, 0.16], [0, 0.04], [659, 0.16], [0, 0.04], [523, 0.16], [0, 0.04], [392, 0.12], [370, 0.12], [392, 0.5]], { vol: v * 0.9 }));
            fx.moves.forEach((mv, i) => {
                if (mv.t === 's') {
                    // trượt: sột soạt + vút thấp · đạp lưng: "bốp" + nốt bật 8-bit
                    once('m' + i, mv.a * 1000, () => { X.rustle(0.45, { vol: v * 0.8 }); X.whoosh(0.45, { vol: v * 0.5, f0: 500, f1: 200 }); });
                    once('k' + i, (mv.a + (mv.b - mv.a) * 0.68) * 1000, () => { X.thud(0.6, { vol: v * 0.8 }); X.chip([[392, 0.05], [784, 0.09]], { vol: v * 0.7 }); });
                    once('l' + i, mv.b * 1000 - 80, () => X.thud(0.3, { vol: v * 0.45 }));
                    return;
                }
                once('m' + i, mv.a * 1000, () => mv.t === 'd' ? X.whoosh(0.35, { vol: v * 0.6, f0: 1400, f1: 500 })
                    : X.whoosh(Math.max(0.25, (mv.b - mv.a) * 0.6), { vol: v * 0.7, f0: 300, f1: mv.t === 'h' ? 1500 : 2200 }));
                if (mv.t !== 'd') once('l' + i, mv.b * 1000 - 80, () => X.thud(0.25, { vol: v * 0.45 }));
            });
            return;
        }
        once('hit', P.hit, () => {
            if (m === 'blast') { X.whoosh(Math.max(0.35, sc.outMs / 1000 + 0.2), { vol: v, f0: 250, f1: 2200, dir }); X.rustle(0.3, { vol: v * 0.6 }); }
            else if (m === 'knock') { X.thud(0.5, { vol: v * 0.7 }); X.whoosh(Math.max(0.3, sc.outMs / 1000 + 0.2), { vol: v, f0: 350, f1: 2600, dir }); }
            else if (m === 'portal') X.whoosh(Math.max(0.3, sc.outMs / 1000), { vol: v * 0.8, f0: 900, f1: 200 });
            else if (m === 'crush') { X.thud(1.3, { vol: v }); X.crack(0.5, { vol: v * 0.6 }); }
            else if (m === 'abduct') X.rustle(0.5, { vol: v * 0.5 });
        });
        once('back', P.back, () => {
            if (m === 'blast' || m === 'portal') X.wind(Math.max(0.15, sc.inMs / 1000), { vol: v * 0.8 });
            else if (m === 'knock') { const d = sc.inMs / 1000; X.rustle(d, { vol: v * 0.9 }); X.whoosh(d, { vol: v * 0.35, f0: 900, f1: 300, dir: -dir }); }   // trượt về: tiếng cọ đất
            else if (m === 'crush') X.rustle(0.5, { vol: v * 0.7 });
        });
        once('land', P.land, () => {
            if (m === 'blast') { X.thud(1.1, { vol: v }); X.debris(5, { vol: v * 0.5, spread: 0.4 }); }
            else if (m === 'portal') X.thud(1, { vol: v });
            else if (m === 'knock') { X.thud(0.6, { vol: v * 0.8 }); X.rustle(0.4, { vol: v * 0.6 }); }
            else if (m === 'abduct') X.thud(0.35, { vol: v * 0.7 });
            else if (m === 'crush') X.thud(0.45, { vol: v * 0.8 });
        });
    }

    // Mốc lượt: bám currentTime khi video đang chạy; video chưa chạy được sau 1,5 s / đã hết → đồng hồ.
    function elapsed(now) {
        const el = fx.m && fx.m.isVideo ? fx.m.el : null;
        // ⏳ chờ trước khi rơi: tới cuối đoạn lặp thì tua về đầu đoạn (giờ video lùi → người vẫn đứng chờ, cổng vẫn chạy)
        if (el && fx.loop.n > 0 && el.currentTime >= fx.script.loopTo) { fx.loop.n--; el.currentTime = fx.script.loopFrom; fx.vt = -1; fx.clock = now - fx.script.loopFrom * 1000; return fx.script.loopFrom * 1000; }
        if (el && !el.ended && el.currentTime > 0 && el.currentTime !== fx.vt) {
            fx.vt = el.currentTime;
            const e = el.currentTime * 1000;
            fx.clock = now - e;
            return e;
        }
        if (fx.clock != null) return now - fx.clock;
        if (el && now - fx.start < 1500 && !el.error) return 0;          // chờ video bắt đầu
        fx.clock = fx.start;
        return now - fx.start;
    }

    // Video nền dưới cùng chạy lặp - giữ khớp giờ video chính (giờ lượt mod độ dài nền); lệch > 0,1 s thì tua. eFix (tua tay): đứng đúng khung.
    function syncBg(e, fixed) {
        const el = fx.bg.isVideo ? fx.bg.el : null, d = el ? el.duration : NaN;
        if (!el || !(d > 0.2) || el.seeking) return;
        const t = (e / 1000) % d;
        let diff = el.currentTime - t;
        if (diff > d / 2) diff -= d; else if (diff < -d / 2) diff += d;
        if (fixed) { el.pause(); if (Math.abs(diff) > 0.02) el.currentTime = t; return; }
        if (e <= 0) { if (!el.paused) el.pause(); if (el.currentTime > 0.02) el.currentTime = 0; return; }      // video chính chưa chạy
        if (Math.abs(diff) > 0.1) el.currentTime = t;
        if (el.paused) el.play().catch(() => {});
    }
    function frame(now, dt, eFix) {
        if (!fx) return true;
        person = env.person();
        const sc = fx.script, m = fx.m;
        const el = m && m.isVideo ? m.el : null;
        fx.plan = HB.vidFxPlan(sc, el && Number.isFinite(el.duration) ? el.duration * 1000 : NaN, fx.end || undefined);
        const P = fx.plan, e = eFix != null ? eFix : elapsed(now);
        sounds(e, P);
        // 🕶 Matrix: đoạn phi tiêu video chạy chậm
        if (el && fx.end) {
            const SL = HB.NINJA_SLOW, slow = fx.end === 'matrix' && e / 1000 >= SL.from && e / 1000 < SL.to, rate = slow ? Math.max(0.1, sc.nSlow / 100) : 1;
            if (fx.rate !== rate) { fx.rate = rate; el.playbackRate = rate; }
        }
        // 🎁 CONTINUE: bảng GAME OVER đang hiện + có thêm lượt cùng game trong hàng chờ trang (combo / ⚡ / bấm thử) → đếm 3-2-1 rồi hồi sinh
        if (fx.end && !HB.ninjaWin(fx.end) && P.over != null && e >= P.over + 300 && !fx.cont && env.takeContinue && env.takeContinue(sc)) fx.cont = { at: now };
        if (fx.cont && !fx.cont.done && now - fx.cont.at >= CONT_MS) ninjaRevive(now, P, el);
        const freezeAt = fx.end === 'star' && P.ko != null ? P.ko / 1000 : Infinity;
        if (el && e / 1000 >= freezeAt && !fx.frozen) { fx.frozen = true; el.pause(); }
        if (eFix != null && el && Number.isFinite(el.duration)) { const t = Math.min(el.duration, e / 1000, freezeAt); if (Math.abs(el.currentTime - t) > 0.05) { el.pause(); el.currentTime = t; } }
        // rung: lúc bị đánh + lúc đáp
        let shx = 0, shy = 0;
        const shakeAt = (t0, len) => { const k = clamp01(1 - (e - t0) / len); return e >= t0 && k > 0 ? k : 0; };
        const sk = (sc.motion === 'batu' ? Math.max(0, ...(P.hits || []).map(t => shakeAt(t * 1000, 380)))
            : Math.max(sc.motion === 'abduct' || sc.motion === 'portal' ? 0 : shakeAt(P.hit, 420), shakeAt(P.land, 480))) * sc.shake;
        if (sk > 0) { shx = (Math.random() - 0.5) * 2 * sk; shy = (Math.random() - 0.5) * 2 * sk * 0.7; }
        ctx.setTransform(1, 0, 0, 1, shx, shy);
        const margin = (sc.shake || 0) + 4;
        const behind = sc.layer === 'back' || (sc.layer === 'auto' && e >= P.back);
        if (fx.bg) syncBg(e, eFix != null);
        env.backdrop(margin, fx.bg || (behind ? m : null));
        if (fx.bg && behind && m) env.drawCover(m, margin);
        const st = stateAt(e);
        if (st && st.shadow != null) drawShadow(st.shadow);
        if (e >= P.land && !fx.landed) {
            fx.landed = true; fx.landedAt = now;
            if (!['crush', 'abduct', 'mario', 'pickle', 'ninja', 'batu'].includes(sc.motion)) { const f = feetOf(); burstDust(f.x + fx.ox, Math.min(f.y, H), Math.max(220, (person.w || 300))); }
        }
        if (st && st.shadow0) drawGroundShadow(st.shadow0);
        // 🕶 bóng mờ xanh theo sau lúc chậm
        if (fx.end === 'matrix' && e / 1000 >= HB.NINJA_SLOW.from && e / 1000 < HB.NINJA_SLOW.to) {
            for (const [d, a] of [[90, 0.28], [180, 0.16], [270, 0.08]]) { const g = stateAt(e - d); if (g) drawPerson({ ...g, alpha: a, tint: 'hue-rotate(170deg) saturate(2.5) brightness(1.3)' }); }
        }
        if ((fx.end === 'star' || fx.end === 'rock') && P.ko != null && e >= P.ko + (fx.end === 'star' ? 1000 : 120) && !fx.cue.has('dust')) {
            fx.cue.add('dust'); burstDust(sc.nX / 100 * W - (fx.end === 'star' ? W * 0.06 : 0), sc.nGround / 100 * H, W * 0.18, 26);
        }
        if (st) drawPerson(st);
        if (st && st.feet && fx.feet) env.drawAt(fx.feet, st.feet.x, st.feet.y, st.feet.w, st.feet.h, st.feet.rot, st.feet.alpha);    // 🥷 che phần thân bị cắt
        if (st && st.cloud) drawCloud(st.cloud, e / 1000);
        if (st && (st.smoke || fx.smoke.length)) drawSmoke(st.smoke, dt);
        if (st && st.eyes) drawEyes(st.eyes);
        if (st && st.stars) drawStars(st.stars);
        if (st && st.twinkle) { const k = st.twinkle.t; sparkle(st.twinkle.x, st.twinkle.y, Math.max(4, W / 90) * (1 + Math.sin(k * 30) * 0.3), clamp01(1 - k / 0.5) * (0.6 + 0.4 * Math.abs(Math.sin(k * 25)))); }
        if (fx.end === 'matrix') drawSlowTint(e / 1000);
        if (fx.end === 'twister') {
            const tl = sc.nTwistLand * 1000, ground = sc.nGround / 100 * H, gx = sc.nX / 100 * W;
            if (e >= tl && !fx.cue.has('twdust')) { fx.cue.add('twdust'); burstDust(gx, ground, W * 0.2, 34); }
            if (e >= tl && e < tl + 750) {
                const k = (e - tl) / 750, pop = easeOutBack(clamp01(k / 0.25));
                pixText(hpT('BỊCH!'), H * 0.05 * pop, gx + W * 0.2, ground - H * 0.07 - k * H * 0.03, { k: 3, fill: '#ffffff', fill2: '#ffd23f', alpha: 1 - clamp01((k - 0.6) / 0.4) });
            }
        }
        // 🪨 cục đá vẽ lại ĐÈ LÊN người lúc lăn qua (cắt tròn đúng chỗ đá trong cùng khung video)
        if (fx.end === 'rock' && m && e >= P.ko - 200 && e < P.ko + 700) {
            const R = rockAt(e / 1000);
            ctx.save(); ctx.beginPath(); ctx.arc(R.x, R.y, R.r * 1.01, 0, TAU); ctx.clip(); env.drawCover(m, margin); ctx.restore();
        }
        if (fx.cont && !fx.cont.done) drawContinue((now - fx.cont.at) / 1000);
        else if (fx.end && P.over != null && e >= P.over) drawEndBoard((e - P.over) / 1000, 1 - clamp01((e - P.back) / Math.max(1, sc.inMs)), fx.end);
        if (!behind && m) env.drawCover(m, margin);
        if (fx.dust.length) drawDust(dt);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const done = e >= P.end;
        if (done) stop();
        return done;
    }
    return { start, stop, frame, estMs, get fx() { return fx; }, playing: () => (fx ? [fx.m, fx.feet, fx.bg].filter(Boolean) : []) };
}
