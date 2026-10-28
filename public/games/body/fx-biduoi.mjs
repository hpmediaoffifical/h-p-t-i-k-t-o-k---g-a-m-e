/* 🏃 BỊ ĐUỔI - mô-đun hiệu ứng của 🧍 Bộ Tách Người (overlays/camgames/body/overlay.html).
 * Một lượt: video đuổi bắt → chân hoá vòng tròn quay tít kiểu hoạt hình → phóng ra khỏi màn kèm khói → [chạy ngang qua màn nhỏ dần
 * theo con đường] → N giây sau chạy về chỗ cũ, phanh trượt. Mốc thời gian + vị trí = lõi window.HpBiDuoi (plan / stateAt).
 * env giống fx-roiho.mjs (+ cfg() = nhánh biduoi đã chuẩn hoá, drawCover(m, margin), MUTE).
 * Phần vẽ người chạy / vòng chân / 2.5D / khói / tiếng chép nguyên từ overlays/camgames/biduoi/overlay.html. */

export function createBiDuoi(env) {
    const { ctx, W, H } = env;
    const BD = window.HpBiDuoi;
    const TAU = Math.PI * 2;
    const MUTE = env.MUTE;
    let person = env.person();
    let fx = null;
    const cfg = { get sfxVolume() { return env.cfg().sfxVolume; }, get look() { return env.cfg().look; } };
    // Nền (video kịch bản / phòng / Hậu Cảnh) đang được vẽ dưới người → hoà màu / bóng đổ mới có nghĩa.
    const bgOn = () => !!fx && env.cfg().bgMode !== 'none';

    // ---------- 🔊 tiếng hoạt hình tổng hợp (không cần file) ----------
    const sfx = (() => {
        let ac = null, bus = null, noise = null;
        const get = () => {
            if (MUTE) return null;
            if (!ac) {
                try { ac = new AudioContext(); } catch (_) { return null; }
                bus = ac.createGain(); bus.connect(ac.destination);
                noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
                const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
            }
            if (ac.state === 'suspended') ac.resume().catch(() => {});
            bus.gain.value = cfg.sfxVolume;
            return ac;
        };
        const env = (g, t, a, peak, dur) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); };
        function whoosh(dur = 0.4, f0 = 500, f1 = 3200, peak = 0.7) {
            const a = get(); if (!a) return;
            const t = a.currentTime, src = a.createBufferSource(), bp = a.createBiquadFilter(), g = a.createGain();
            src.buffer = noise; bp.type = 'bandpass'; bp.Q.value = 1.4;
            bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
            env(g, t, dur * 0.25, peak, dur);
            src.connect(bp).connect(g).connect(bus); src.start(t); src.stop(t + dur + 0.05);
        }
        // Lấy đà: tiếng "brrrrrr" cao dần (sóng vuông điều biên nhanh).
        function rev(dur) {
            const a = get(); if (!a || dur <= 0.05) return;
            const t = a.currentTime, o = a.createOscillator(), lfo = a.createOscillator(), lg = a.createGain(), g = a.createGain(), lp = a.createBiquadFilter();
            o.type = 'square'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(520, t + dur);
            lfo.type = 'square'; lfo.frequency.setValueAtTime(14, t); lfo.frequency.linearRampToValueAtTime(34, t + dur);
            lg.gain.value = 0.5; lfo.connect(lg).connect(g.gain);
            lp.type = 'lowpass'; lp.frequency.value = 2200;
            g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.18, t + 0.08); g.gain.setValueAtTime(0.18, t + dur - 0.05); g.gain.linearRampToValueAtTime(0.0001, t + dur);
            o.connect(lp).connect(g).connect(bus);
            o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
        }
        // Phanh: rít cao tụt dần + tiếng sàn.
        function skid(dur = 0.35) {
            const a = get(); if (!a) return;
            const t = a.currentTime, src = a.createBufferSource(), bp = a.createBiquadFilter(), g = a.createGain();
            src.buffer = noise; bp.type = 'bandpass'; bp.Q.value = 9;
            bp.frequency.setValueAtTime(3400, t); bp.frequency.exponentialRampToValueAtTime(1500, t + dur);
            env(g, t, 0.02, 0.9, dur);
            src.connect(bp).connect(g).connect(bus); src.start(t); src.stop(t + dur + 0.05);
        }
        function pop() {
            const a = get(); if (!a) return;
            const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
            o.type = 'sine'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(880, t + 0.09);
            env(g, t, 0.01, 0.35, 0.14);
            o.connect(g).connect(bus); o.start(t); o.stop(t + 0.2);
        }
        return { whoosh, rev, skid, pop, warm: get };
    })();

    function body(sc) {
        const feet = person.feet || { x: W / 2, y: H * 0.92 }, head = person.head || { x: W / 2, y: H * 0.3 };
        const ph = Math.max(200, feet.y - head.y);
        const hipY = head.y + ph * sc.hip, legH = Math.max(60, feet.y - hipY);
        const w = Math.max(160, person.w || 360);
        return { feet, head, ph, hipY, legH, r: legH / 2, w, legW: Math.min(w * 0.75, legH * 0.9) };
    }

    // ---------- người đã dựng sẵn mỗi khung ----------
    // personCan - vùng người (hộp quanh người) đã HOÀ MÀU theo video nền (🧊 2.5D). Mọi lớp sau lấy từ nó, một lần mỗi khung
    // (bóng mờ dùng lại):
    //   legsCan  - phần CHÂN (hông → bàn chân), làm nhoè nhẹ: vòng tròn quay vẽ lại nó nhiều lớp
    //   upperCan - thân trên, MỜ DẦN qua dải hông (không có đường cắt ngang đùi lộ ra quanh vòng chân)
    //   shadowCan - bóng (đen, 1/4 cỡ: phóng lên là tự nhoè)
    const mk = () => { const c = document.createElement('canvas'); return [c, c.getContext('2d')]; };
    const [personCan, personCtx] = mk(), [legsRaw, legsRawCtx] = mk(), [legsCan, legsCtx] = mk(), [upperCan, upperCtx] = mk(), [shadowCan, shadowCtx] = mk();
    const comp = { on: false, x: 0, y: 0 }, upper = { x: 0, y: 0 };
    const fit = (c, w, h) => { w = Math.max(8, Math.ceil(w)); h = Math.max(8, Math.ceil(h)); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } return c; };
    const look = () => cfg.look;
    const lite = () => cfg.look.lite;

    // Vẽ ảnh tách nền gốc vào c2 (ox, oy = góc trên-trái vùng trên sân khấu) - không xoá trước.
    function matteInto(c2, ox, oy) {
        const M = person.M;
        c2.save();
        c2.setTransform(1, 0, 0, 1, -ox, -oy);
        c2.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
        c2.drawImage(person.img, 0, 0);
        c2.restore();
    }
    // Chép một vùng của personCan (toạ độ sân khấu ox, oy) vào c2 (đã xoá).
    function copyPerson(c2, ox, oy) {
        c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, c2.canvas.width, c2.canvas.height);
        if (comp.on) c2.drawImage(personCan, comp.x - ox, comp.y - oy);
    }

    // 🎨 Màu + độ sáng trung bình của video nền (đọc ảnh 8×8, 4 lần/giây) - để người "đứng trong" cảnh chứ không dán lên.
    const [probe, probeCtx] = mk(); probe.width = probe.height = 8;
    const tone = { r: 128, g: 128, b: 128, L: 0.5, ok: false, at: 0 };
    function sampleBg(now) {
        if (now - tone.at < 250) return;
        tone.at = now;
        const b = fx && fx.bg, el = b && b.el;
        if (!el || (b.isVideo ? el.readyState < 2 : !el.naturalWidth)) return;
        try {
            if (b.packed) probeCtx.drawImage(el, 0, 0, ...(el.videoWidth > el.videoHeight ? [el.videoWidth / 2, el.videoHeight] : [el.videoWidth, el.videoHeight / 2]), 0, 0, 8, 8);     // mp4 xếp cặp: chỉ nửa màu
            else probeCtx.drawImage(el, 0, 0, 8, 8);
            const d = probeCtx.getImageData(0, 0, 8, 8).data;
            let r = 0, g = 0, bl = 0;
            for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; bl += d[i + 2]; }
            r /= 64; g /= 64; bl /= 64;
            const k = tone.ok ? 0.35 : 1;
            tone.r += (r - tone.r) * k; tone.g += (g - tone.g) * k; tone.b += (bl - tone.b) * k;
            tone.L = (0.2126 * tone.r + 0.7152 * tone.g + 0.0722 * tone.b) / 255;
            tone.ok = true;
        } catch (_) {}
    }

    // Dựng personCan (+ hoà màu) mỗi khung đang có lượt.
    function prepPerson(B) {
        comp.on = false;
        if (!person.ready || !person.img || !person.M) return;
        comp.x = B.feet.x - B.w / 2 - 40; comp.y = B.head.y - 60;
        fit(personCan, B.w + 80, B.feet.y - comp.y + 40);
        personCtx.setTransform(1, 0, 0, 1, 0, 0); personCtx.clearRect(0, 0, personCan.width, personCan.height);
        const L = look(), amt = L.tint && !lite() && tone.ok && bgOn() ? L.tintAmt : 0;
        if (amt > 0) {
            // sáng theo nền: nền tối thì người tối đi, nền sáng thì sáng lên (giới hạn để không mất mặt)
            const b = 1 + (Math.min(1.15, Math.max(0.72, 0.62 + 0.75 * tone.L)) - 1) * Math.min(1, amt * 2.2);
            personCtx.filter = `brightness(${b.toFixed(3)})`;
        }
        matteInto(personCtx, comp.x, comp.y);
        personCtx.filter = 'none';
        if (amt > 0) {
            personCtx.globalCompositeOperation = 'soft-light';      // ánh màu cảnh, giữ nguyên chi tiết sáng tối
            personCtx.globalAlpha = Math.min(1, amt * 1.6);
            personCtx.fillStyle = `rgb(${tone.r | 0},${tone.g | 0},${tone.b | 0})`;
            personCtx.fillRect(0, 0, personCan.width, personCan.height);
            personCtx.globalAlpha = 1;
            personCtx.globalCompositeOperation = 'destination-in';  // soft-light tô cả chỗ trong suốt → cắt lại theo mặt nạ
            matteInto(personCtx, comp.x, comp.y);
            personCtx.globalCompositeOperation = 'source-over';
        }
        comp.on = true;
    }

    function cutParts(B) {
        fit(legsRaw, B.legW, B.legH); fit(legsCan, B.legW, B.legH);
        copyPerson(legsRawCtx, B.feet.x - legsRaw.width / 2, B.hipY);
        legsCtx.clearRect(0, 0, legsCan.width, legsCan.height);
        if (!lite()) legsCtx.filter = `blur(${Math.max(2, B.legH * 0.006).toFixed(1)}px)`;
        legsCtx.drawImage(legsRaw, 0, 0);
        legsCtx.filter = 'none';
        // thân trên: hết ở dải [hông − 3 %, hông + 9 %] thân, độ đậm 1 → 0
        const a = B.hipY - B.ph * 0.03, b = B.hipY + B.ph * 0.09;
        upper.x = comp.x; upper.y = comp.y;
        fit(upperCan, personCan.width, Math.max(8, b - upper.y));
        copyPerson(upperCtx, upper.x, upper.y);
        upperCtx.globalCompositeOperation = 'destination-out';
        const g = upperCtx.createLinearGradient(0, a - upper.y, 0, b - upper.y);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
        upperCtx.fillStyle = g; upperCtx.fillRect(0, a - upper.y, upperCan.width, upperCan.height);
        upperCtx.globalCompositeOperation = 'source-over';
    }
    function cutShadow() {
        fit(shadowCan, personCan.width / 4, personCan.height / 4);
        shadowCtx.setTransform(1, 0, 0, 1, 0, 0);
        shadowCtx.clearRect(0, 0, shadowCan.width, shadowCan.height);
        shadowCtx.drawImage(personCan, 0, 0, shadowCan.width, shadowCan.height);
        shadowCtx.globalCompositeOperation = 'source-in';
        shadowCtx.fillStyle = '#000'; shadowCtx.fillRect(0, 0, shadowCan.width, shadowCan.height);
        shadowCtx.globalCompositeOperation = 'source-over';
    }

    // Vẽ người tách nền nguyên vẹn (toạ độ sân khấu hiện tại) - đang có lượt thì bản đã hoà màu.
    function drawPersonRaw() {
        if (comp.on && fx) { ctx.drawImage(personCan, comp.x, comp.y); return; }
        if (!person.ready || !person.img || !person.M) return;
        const M = person.M;
        ctx.save(); ctx.transform(M[0], M[1], M[2], M[3], M[4], M[5]); ctx.drawImage(person.img, 0, 0); ctx.restore();
    }

    /* Chân hoá VÒNG TRÒN: phần chân xoay quanh tâm đầu gối nhiều lớp mờ → đĩa nhoè màu da / quần như bánh xe hoạt hình,
       thêm cung chuyển động trắng viền tối quay quanh + xoáy nhỏ ở giữa. k = độ hoá (0..1), a = góc quay. */
    function drawWheel(B, k, a, alpha) {
        const cx = B.feet.x, cy = B.hipY + B.r, N = lite() ? 10 : 16;
        ctx.save();
        ctx.translate(cx, cy); ctx.scale(0.82, 1);       // hơi dẹt ngang: gọn trong bề ngang người
        ctx.globalAlpha = alpha * k * (lite() ? 0.24 : 0.17);
        for (let i = 0; i < N; i++) {
            ctx.save(); ctx.rotate(a + i * Math.PI / N);
            ctx.drawImage(legsCan, -legsCan.width / 2, -legsCan.height / 2);
            ctx.restore();
        }
        // lõi: thêm 2 lớp đậm hơn để đĩa có thân (không chỉ là khói)
        ctx.globalAlpha = alpha * k * 0.35;
        for (let i = 0; i < 2; i++) { ctx.save(); ctx.rotate(a * 1.7 + i * Math.PI / 2); ctx.drawImage(legsCan, -legsCan.width / 2, -legsCan.height / 2); ctx.restore(); }
        // cung chuyển động
        ctx.globalAlpha = alpha * k;
        ctx.lineCap = 'round';
        const arcs = [[0.98, 1.5, 0], [0.86, 1.1, Math.PI * 0.66], [0.94, 1.3, Math.PI * 1.25], [0.45, 2.2, Math.PI * 0.3], [0.28, 2.6, Math.PI * 1.2]];
        for (const [rr, span, off] of arcs) {
            const a0 = a * (rr < 0.5 ? 2.1 : 1.35) + off, R = B.r * rr;
            ctx.strokeStyle = 'rgba(30,20,20,.35)'; ctx.lineWidth = Math.max(4, B.r * 0.05);
            ctx.beginPath(); ctx.arc(0, 0, R, a0, a0 + span); ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = Math.max(2, B.r * 0.026);
            ctx.beginPath(); ctx.arc(0, 0, R, a0, a0 + span); ctx.stroke();
        }
        ctx.restore();
    }

    // 🧊 Bóng đổ dài trên mặt đất: hình người dẹt + ngả theo hướng sáng, gốc ở bàn chân (toạ độ người, trước khi dời/thu nhỏ).
    function drawCastShadow(B, wk) {
        const dir = look().shadowDir;
        ctx.save();
        ctx.globalAlpha = 0.5 * (1 - 0.35 * wk);
        ctx.translate(B.feet.x, B.feet.y);
        ctx.transform(1, 0, -dir * 0.42, 0.3, 0, 0);       // y' = 0,3·dy (nằm rạp xuống đất), x' lệch theo chiều cao
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(shadowCan, comp.x - B.feet.x, comp.y - B.feet.y, personCan.width, personCan.height);
        ctx.restore();
    }

    /* Vẽ người đang chạy: st (core.stateAt) đặt CHÂN tại (st.x, st.y) tỉ lệ st.s. Thân trên ngả theo st.lean quanh hông + nhún;
       chân → vòng tròn theo st.wheel. alpha < 1 = bóng mờ phía sau (không bóng đổ). */
    function drawRunner(st, sc, B, alpha, t, shadow) {
        const wk = sc.wheel ? st.wheel : 0;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(st.x, st.y); ctx.scale(st.s, st.s); ctx.translate(-B.feet.x, -B.feet.y);
        if (shadow) drawCastShadow(B, wk);
        // bóng tiếp đất ngay dưới chân
        if (wk > 0.001 || shadow) {
            ctx.fillStyle = `rgba(0,0,0,${(0.22 * wk + (shadow ? 0.18 : 0)) * alpha})`;
            ctx.beginPath(); ctx.ellipse(B.feet.x, B.feet.y, Math.max(B.r * 0.8 * wk, B.w * 0.32), B.r * 0.13, 0, 0, TAU); ctx.fill();
        }
        if (wk <= 0.001) { ctx.globalAlpha = alpha; drawPersonRaw(); ctx.restore(); return; }
        // chân thật mờ dần khi đang hoá vòng (và hiện lại lúc dừng) - từ đầu dải mờ của thân trên trở xuống
        if (wk < 1) {
            ctx.save(); ctx.globalAlpha = alpha * (1 - wk);
            ctx.beginPath(); ctx.rect(-W, B.hipY - B.ph * 0.03, W * 3, H * 3); ctx.clip();
            drawPersonRaw(); ctx.restore();
        }
        drawWheel(B, wk, fx.spin, alpha);
        // thân trên (đã mờ dần qua hông): ngả + nhún theo nhịp chân
        const bob = -Math.abs(Math.sin(t * TAU * 5.5)) * B.ph * 0.014 * wk * (st.spin || 0);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(B.feet.x, B.hipY + bob); ctx.rotate(st.lean); ctx.translate(-B.feet.x, -B.hipY);
        ctx.drawImage(upperCan, upper.x, upper.y);
        ctx.restore();
        ctx.restore();
    }

    // 🎥 Máy quay động (🧊 2.5D): dồn vào mặt lúc lấy đà → giật về khi phóng → lia nhẹ theo người ở vòng xa → rung khi phanh.
    // Zoom ≥ 1 quanh tiêu điểm nằm trong khung → không lộ mép; nền vẽ tràn mép để rung / lia không hở camera gốc.
    const midY = () => (fx && fx.v ? fx.v.y + fx.v.h * 0.55 : H * 0.55);
    function camTarget(st, B) {
        const face = { x: B.feet.x, y: B.head.y + B.ph * 0.33 };
        switch (st.phase) {
            case 'windup': return { z: 1.16, x: face.x, y: face.y, rate: 5 };
            case 'exit': return { z: 1, x: face.x, y: face.y, rate: 16 };
            case 'pass': return { z: 1.06, x: Math.min(W, Math.max(0, st.x)), y: midY(), rate: 3 };
            case 'away': return { z: 1.04, x: W / 2, y: midY(), rate: 2.5 };
            case 'return': return { z: 1.05, x: Math.min(W, Math.max(0, st.x)), y: face.y, rate: 4 };
            default: return { z: 1, x: face.x, y: face.y, rate: 4 };
        }
    }
    function stepCam(st, B, dt, now) {
        const c = fx.cam || (fx.cam = { z: 1, x: W / 2, y: H / 2, shake: 0 });
        if (!look().camera || lite()) { c.z = 1; c.shake = 0; return [1, 0, 0, 1, 0, 0]; }
        const t = camTarget(st, B), k = 1 - Math.exp(-dt * t.rate);
        c.z += (t.z - c.z) * k; c.x += (t.x - c.x) * k; c.y += (t.y - c.y) * k;
        if (st.phase === 'return' && st.k > 0.7 && !c.braked) { c.braked = true; c.shake = 1; }
        c.shake = Math.max(0, c.shake - dt * 2.4);
        const A = 18 * c.shake * c.shake;
        const sx = (Math.random() - 0.5) * 2 * A, sy = (Math.random() - 0.5) * 2 * A * 0.6;
        return [c.z, 0, 0, c.z, c.x * (1 - c.z) + sx, c.y * (1 - c.z) + sy];
    }

    // ---------- khói (cụm mây hoạt hình) + vệt tốc độ ----------
    function puff(x, y, r, vx, vy, life) { fx.puffs.push({ x, y, r, vx, vy, life, age: 0 }); if (fx.puffs.length > 260) fx.puffs.shift(); }
    function stepPuffs(dt) {
        for (const p of fx.puffs) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(0.15, dt); p.vy *= Math.pow(0.3, dt); }
        fx.puffs = fx.puffs.filter(p => p.age < p.life);
    }
    function drawPuffs() {
        for (const p of fx.puffs) {
            const q = p.age / p.life, a = Math.pow(1 - q, 1.2) * 0.85, r = p.r * (1 + Math.sqrt(q) * 1.9);   // nở nhanh rồi tan
            ctx.fillStyle = `rgba(150,138,124,${a * 0.85})`;
            ctx.beginPath(); ctx.arc(p.x + r * 0.14, p.y + r * 0.2, r, 0, TAU); ctx.fill();
            ctx.fillStyle = `rgba(246,240,230,${a})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.9, 0, TAU); ctx.fill();
            ctx.fillStyle = `rgba(255,255,255,${a * 0.7})`;
            ctx.beginPath(); ctx.arc(p.x - r * 0.28, p.y - r * 0.3, r * 0.35, 0, TAU); ctx.fill();
        }
    }
    function drawStreaks(now) {
        ctx.lineCap = 'round';
        for (const s of fx.streaks) {
            const q = (now - s.at) / s.life; if (q >= 1) continue;
            ctx.strokeStyle = `rgba(255,255,255,${0.75 * (1 - q)})`; ctx.lineWidth = s.w;
            ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.dir * s.len * (1 - q * 0.5), s.y); ctx.stroke();
        }
        fx.streaks = fx.streaks.filter(s => now - s.at < s.life);
    }
    // Sinh khói / vệt theo pha: lấy đà = khói bắn ngược sau gót; đang chạy = vệt khói kéo dài sau lưng; phanh = khói bắn phía trước.
    function emit(st, sc, B, dt, now) {
        const s = st.s, fxX = st.x, fyY = st.y, R = B.r * s;
        const rate = st.phase === 'windup' ? 30 * st.wheel : st.dir ? (st.phase === 'return' && st.k > 0.7 ? 60 : 36) : 0;
        if (sc.smoke && rate > 0 && st.visible) {
            fx.acc += rate * dt;
            const back = st.phase === 'windup' ? (fx.P.exitDir === 'left' ? 1 : -1) : -st.dir;   // khói bắn ra SAU hướng chạy
            while (fx.acc >= 1) {
                fx.acc -= 1;
                if (st.phase === 'return' && st.k > 0.7) {
                    puff(fxX + st.dir * R * (0.3 + Math.random() * 0.4), fyY - Math.random() * R * 0.2, (28 + Math.random() * 30) * s, st.dir * (160 + Math.random() * 200) * s, -(30 + Math.random() * 60) * s, 0.55 + Math.random() * 0.35);
                } else if (st.phase === 'windup') {
                    puff(fxX + back * R * (0.2 + Math.random() * 0.5), fyY - Math.random() * R * 0.15, (16 + Math.random() * 20) * s, back * (160 + Math.random() * 240) * s, -(30 + Math.random() * 70) * s, 0.5 + Math.random() * 0.3);
                } else {
                    puff(fxX + back * R * (0.2 + Math.random() * 0.3), fyY - Math.random() * R * 0.3, (26 + Math.random() * 34) * s, back * (40 + Math.random() * 90) * s, -(40 + Math.random() * 70) * s, 0.55 + Math.random() * 0.45);
                }
            }
        }
        if (sc.lines && st.dir && st.visible && st.phase !== 'settle' && Math.random() < 0.9) {
            const top = fyY - B.ph * s, n = 1 + (Math.random() < 0.5 ? 1 : 0);
            for (let i = 0; i < n; i++) {
                fx.streaks.push({ x: fxX - st.dir * (B.w * 0.45 * s), y: top + Math.random() * B.ph * s * 0.95, len: (160 + Math.random() * 280) * s, w: 3 + Math.random() * 4,
                    dir: st.dir, at: now, life: 160 + Math.random() * 120 });
            }
        }
    }
    function burst(x, y, s, n, spread) {
        for (let i = 0; i < n; i++) {
            const a = Math.PI + Math.random() * Math.PI;
            puff(x + (Math.random() - 0.5) * spread * s, y - Math.random() * 40 * s, (34 + Math.random() * 46) * s, Math.cos(a) * (80 + Math.random() * 220) * s, Math.sin(a) * (40 + Math.random() * 90) * s, 0.7 + Math.random() * 0.6);
        }
    }
    // Mốc một lần (tiếng + khói bùng) khi bước sang pha mới.
    function cue(name, fn) { if (!fx.cues[name]) { fx.cues[name] = 1; try { fn(); } catch (e) { console.warn('[biduoi] cue', e); } } }

    // d = { script (đã chuẩn hoá), videoIdx (server bốc; -1 = không video) }.
    const lastPick = new Map();
    function start(d, now) {
        person = env.person();
        const sc = d.script;
        let vi = Number.isInteger(d.videoIdx) && d.videoIdx >= 0 ? d.videoIdx : BD.pickVideo(sc, lastPick.has(sc.id) ? lastPick.get(sc.id) : -1);
        if (vi >= sc.videos.length) vi = sc.videos.length ? 0 : -1;
        lastPick.set(sc.id, vi);
        const v = vi >= 0 ? sc.videos[vi] : null;
        const bg = v ? env.media(v.file) : null, fg = v && v.fg ? env.media(v.fg) : null;
        fx = { d, script: sc, video: v, start: now, P: BD.plan(sc), puffs: [], streaks: [], hist: [], spin: 0, acc: 0, bg, fg, cam: null, cues: {} };
        if (bg) env.playOnce(bg, sc.bgSound);
        if (fg) env.playOnce(fg, false);                 // lớp trước luôn câm (tiếng đã ở video nền)
        return true;
    }
    function stop() { for (const o of fx ? [fx.bg, fx.fg] : []) if (o && o.isVideo) o.el.pause(); fx = null; comp.on = false; }

    function frame(now, dt, eFix) {
        if (!fx) return true;
        person = env.person();
        const f = fx, sc = f.script, e = eFix != null ? eFix : now - f.start;
        const B = body(sc);
        const vr = (env.view && env.view()) || { y: 0, h: H };     // 👁 vùng thấy (Scene PK cắt ô): vòng chạy xa nằm trong dải này
        f.v = vr;
        const st = BD.stateAt(f.P, e, { homeX: B.feet.x, homeY: B.feet.y, halfW: Math.max(B.w / 2, B.r * 0.82), W, H, vy: vr.y, vh: vr.h });
        f.spin += dt * (st.spin || 0) * 30;
        // 🧊 máy quay: mọi lớp của cảnh (nền, bóng, người, khói, lớp trước) cùng một khung hình
        ctx.setTransform(...stepCam(st, B, dt, now));
        env.backdrop(60, f.bg);
        if (bgOn()) sampleBg(now);
        // tiếng + khói bùng theo mốc. Tiếng giả lập chỉ khi KHÔNG có mp3 riêng + video nền không có tiếng (overlay.html sfxOn).
        // Đủ tiếng cả lượt (user 2026-10-19 "giờ chỉ có khúc đầu" - đo: lấy đà −6 dB, các lượt chạy chỉ −24…−41 dB, khoảng ngoài khung
        // im hẳn): lấy đà "brrr" · bật đi = đạp đất + vút + chân chạy ra · ngoài khung = chân chạy xa · mỗi lượt ngang = chân chạy
        // lướt trái ↔ phải + vút · về = chân chạy vào + vút · phanh két · đáp = dậm chân + "pop".
        const sfxOk = env.sfxOn ? env.sfxOn(sc) : sc.sfx && !sc.sfxFile;
        const X = env.sfx, v = cfg.sfxVolume ?? 0.6, P = f.P, T = sc.timing;
        const sgn = d => (d === 'left' ? -1 : 1);
        // chân chạy xa (ngoài khung) từ ms a tới b, nhỏ dần rồi to dần ở hai đầu
        const far = (a, b) => { const d = (b - a) / 1000, at = Math.max(0, (a - e) / 1000); if (X && d > 0.3) { X.steps(d * 0.45, { vol: v * 0.8, far: true, rate: 7, at }); X.steps(d * 0.4, { vol: v * 0.8, far: true, rate: 7, at: at + d * 0.6 }); } };
        if (st.phase === 'windup' && sfxOk) cue('rev', () => { sfx.rev(T.windupSec); if (X) X.rustle(Math.min(0.6, T.windupSec), { vol: v * 0.6 }); });
        if (st.phase === 'exit') cue('exit', () => {
            if (sfxOk && X) {
                const d = T.exitMs / 1000, dir = sgn(P.exitDir);
                X.thud(0.45, { vol: v * 0.8 });
                X.whoosh(Math.max(0.35, d + 0.2), { vol: v, f0: 300, f1: 2400, dir });
                X.steps(d, { vol: v, rate: 9, pan0: 0, pan1: dir });
                far(P.exitEnd, P.passes.length ? P.passes[0].start : P.retStart);
            } else if (sfxOk) sfx.whoosh(0.45);
            if (sc.smoke) burst(B.feet.x, B.feet.y, 1, 16, B.r * 1.2);
        });
        if (st.phase === 'pass') cue('pass' + st.pass, () => {
            if (!sfxOk) return;
            const p = st.pass >= 0 ? P.passes[st.pass] : null, d = p ? p.ms / 1000 : 0.6, dir = st.dir || 1;
            if (!X) { sfx.whoosh(Math.min(0.9, d * 0.6), 400, 2400, 0.45); return; }
            X.steps(d, { vol: v, rate: 9, pan0: -dir * 0.9, pan1: dir * 0.9 });
            X.whoosh(Math.max(0.35, d * 0.7), { vol: v * 0.9, f0: 350, f1: 2600, dir, at: d * 0.25 });
            if (p) far(p.end, st.pass + 1 < P.passes.length ? P.passes[st.pass + 1].start : P.retStart);
        });
        if (st.phase === 'return') {
            cue('ret', () => {
                if (!sfxOk) return;
                if (!X) { sfx.whoosh(0.4); return; }
                const d = T.returnMs / 1000, dir = sgn(P.returnDir);
                X.steps(d * 0.85, { vol: v, rate: 9, pan0: dir, pan1: 0 });     // chạy vào từ phía returnDir
                X.whoosh(Math.max(0.35, d * 0.8), { vol: v * 0.85, f0: 2200, f1: 400, dir: -dir });
            });
            if (st.k > 0.7) cue('skid', () => { if (sfxOk) sfx.skid(0.4); });
        }
        if (st.phase === 'settle') cue('settle', () => { if (sfxOk) { if (X) X.thud(0.4, { vol: v * 0.8 }); sfx.pop(); } if (sc.smoke) burst(B.feet.x, B.feet.y, 1, 8, B.r); });

        if (st.visible) {
            prepPerson(B);
            if (sc.wheel && st.wheel > 0.001) cutParts(B);
            const shadow = look().shadow && !lite() && bgOn() && comp.on;
            if (shadow) cutShadow();
            if (st.dir && !lite()) {
                for (let i = f.hist.length - 1, n = 0; i >= 0 && n < 3; i -= 2, n++) {
                    const h = f.hist[i];
                    if (h.phase !== st.phase || h.pass !== st.pass) break;
                    drawRunner(h, sc, B, 0.22 - n * 0.06, now / 1000, false);
                }
            }
            drawRunner(st, sc, B, 1, now / 1000, shadow);
        }
        f.hist.push({ ...st }); if (f.hist.length > 8) f.hist.shift();
        emit(st, sc, B, dt, now);
        stepPuffs(dt);
        if (sc.lines) drawStreaks(now);
        if (sc.smoke) drawPuffs();
        if (f.fg && env.cfg().bgMode !== 'none') env.drawCover(f.fg, 60);     // 🌿 lớp TRƯỚC người (kẻ đuổi lao ngang, bụi cây…)
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        if (st.phase === 'done') { stop(); return true; }
        return false;
    }
    return { start, stop, frame, get fx() { return fx; }, playing: () => (fx ? [fx.bg, fx.fg].filter(Boolean) : []), warm: () => sfx.warm() };
}
