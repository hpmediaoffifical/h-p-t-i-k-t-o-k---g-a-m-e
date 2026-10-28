/* 🔊 Tiếng giả lập CHÂN THỰC cho 🧍 Bộ Tách Người (WebAudio, không cần file) - người ngã xuống sàn, gió lúc rơi, vút khi bị văng,
 * nứt đất / đá, mảnh vụn rơi, ầm ầm, xoáy cổng, sột soạt quần áo. Dùng chung cho 🕳️ Rơi Hố và nhịp NGƯỜI diễn của 🎬 Video Hành Động
 * (video đã có tiếng hiệu ứng riêng; ở đây chỉ thêm tiếng của người: văng, rơi, đáp).
 * Cách cho "thật": mọi tiếng = nhiều lớp (thân trầm + mặt va chạm + tạp âm), đường bao tấn công vài ms, ngẫu nhiên nhẹ mỗi lần (không lần
 * nào giống hệt lần nào), vang phòng (convolver, xung phản hồi tự sinh 1,6 s), nén nhẹ ở đầu ra cho đều tiếng giữa máy.
 * 🔊 Chỉ phát khi game KHÔNG có mp3 riêng (sfxFile) và video của lượt không có tiếng / tắt tiếng (overlay.html sfxOn).
 * createSfx({ muted: () => bool }) → { thud, whoosh, wind, crack, debris, rumble, portal, rustle, steps, warm }; mọi hàm nhận vol (0…1)
 * và at (giây trễ, mặc định 0). */
export function createSfx({ muted = () => false } = {}) {
    let ac = null, out = null, verb = null, white = null, brown = null;
    const R = (a, b) => a + Math.random() * (b - a);
    function get() {
        if (muted()) return null;
        if (!ac) {
            try { ac = new AudioContext(); } catch (_) { return null; }
            const comp = ac.createDynamicsCompressor();
            comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
            // Bù âm lượng sau nén (user 2026-10-19: "Rơi hố bé quá") + bộ CHẶN ĐỈNH ở −2 dB: to hơn ~7 dB mà cú đáp mạnh không méo.
            const makeup = ac.createGain(); makeup.gain.value = 2.2;
            const lim = ac.createDynamicsCompressor();
            lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
            comp.connect(makeup).connect(lim).connect(ac.destination);
            out = ac.createGain(); out.gain.value = 0.9; out.connect(comp);
            verb = ac.createConvolver(); verb.buffer = impulse(1.6, 2.6);
            const wet = ac.createGain(); wet.gain.value = 0.55; verb.connect(wet).connect(comp);
            const n = ac.sampleRate * 2;
            white = ac.createBuffer(1, n, ac.sampleRate); brown = ac.createBuffer(1, n, ac.sampleRate);
            const w = white.getChannelData(0), b = brown.getChannelData(0);
            let last = 0;
            for (let i = 0; i < n; i++) { w[i] = Math.random() * 2 - 1; last = (last + 0.02 * w[i]) / 1.02; b[i] = last * 3.5; }
        }
        if (ac.state === 'suspended') ac.resume().catch(() => {});
        return ac;
    }
    // Xung phản hồi phòng: nhiễu stereo tắt dần theo hàm mũ + vài phản xạ sớm - vang tự nhiên, không "ống".
    function impulse(sec, decay) {
        const len = Math.round(ac.sampleRate * sec), buf = ac.createBuffer(2, len, ac.sampleRate);
        for (let c = 0; c < 2; c++) {
            const d = buf.getChannelData(c);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
            for (const ms of [11, 19, 29, 41]) { const i = Math.round(ac.sampleRate * (ms + c * 3) / 1000); if (i < len) d[i] += 0.5 * (c ? -1 : 1); }
        }
        return buf;
    }
    // Nối một nguồn → gain (đường bao) → pan → ra + gửi vang. Trả gain để đặt đường bao.
    function chain(src, { pan = 0, wet = 0.2, nodes = [] } = {}) {
        const g = ac.createGain(), p = ac.createStereoPanner ? ac.createStereoPanner() : null;
        let n = src;
        for (const x of nodes) { n.connect(x); n = x; }
        n.connect(g);
        if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(out); } else g.connect(out);
        if (wet > 0) { const s = ac.createGain(); s.gain.value = wet; g.connect(s); s.connect(verb); }
        return { g, p };
    }
    const noise = (buf, t, dur) => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = R(0, 1); s.start(t, R(0, 1.5)); s.stop(t + dur + 0.05); return s; };
    const filt = (type, f, q = 0.7) => { const x = ac.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; };
    // Đường bao: lên trong a giây tới peak, giữ h, tắt theo hàm mũ trong r giây.
    function envl(g, t, a, peak, h, r) {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
        if (h > 0) g.gain.setValueAtTime(Math.max(0.0002, peak), t + a + h);
        g.gain.exponentialRampToValueAtTime(0.0001, t + a + h + r);
    }

    // 🧍 Người ngã / đáp xuống sàn: thân trầm (sine tụt 95 → 38 Hz) + cú dội thân người (nhiễu nâu lọc trầm) + tiếng chạm mặt sàn
    // (nhiễu dải 1,6 kHz rất ngắn) + sột soạt quần áo. power 0.3 (chạm nhẹ) … 1.3 (đè bẹp).
    function thud(power = 1, { vol = 1, at = 0, pan = 0 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t = a.currentTime + at, p = Math.max(0.1, power) * vol;
        const o = a.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(R(88, 100) + 20 * Math.min(1, power - 0.5), t); o.frequency.exponentialRampToValueAtTime(R(36, 42), t + 0.22);
        const c1 = chain(o, { pan, wet: 0.12 }); envl(c1.g, t, 0.003, 0.95 * p, 0.02, 0.34 + 0.12 * power);
        o.start(t); o.stop(t + 0.7);
        const body = noise(brown, t, 0.5), c2 = chain(body, { pan, wet: 0.25, nodes: [filt('lowpass', R(320, 420))] });
        envl(c2.g, t, 0.004, 0.75 * p, 0.03, 0.2 + 0.08 * power);
        const slap = noise(white, t, 0.1), c3 = chain(slap, { pan, wet: 0.3, nodes: [filt('bandpass', R(1400, 1900), 0.9)] });
        envl(c3.g, t, 0.0015, 0.32 * p, 0, 0.05);
        rustle(0.25, { vol: 0.5 * vol * Math.min(1, power), at: at + 0.01, pan });
    }
    // 💨 Vút (bị văng / lao qua): 2 lớp nhiễu dải quét tần + lướt trái → phải (dir) - như vật nặng xé gió sát tai.
    function whoosh(dur = 0.5, { vol = 1, at = 0, f0 = 300, f1 = 1800, dir = 0 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t = a.currentTime + at;
        for (const [k, q] of [[1, 1.1], [1.6, 2.2]]) {
            const s = noise(white, t, dur), bp = filt('bandpass', f0 * k, q), lp = filt('lowpass', 6000);
            bp.frequency.setValueAtTime(f0 * k, t); bp.frequency.exponentialRampToValueAtTime(f1 * k, t + dur * 0.6); bp.frequency.exponentialRampToValueAtTime(f1 * k * 0.55, t + dur);
            const c = chain(s, { pan: -dir, wet: 0.15, nodes: [bp, lp] });
            c.g.gain.setValueAtTime(0.0001, t); c.g.gain.exponentialRampToValueAtTime((k === 1 ? 0.8 : 0.35) * vol, t + dur * 0.55); c.g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            if (c.p && dir) { c.p.pan.setValueAtTime(-dir, t); c.p.pan.linearRampToValueAtTime(dir, t + dur); }
        }
    }
    // 🌬 Gió lúc rơi tự do: tiếng gió ù to dần, cao dần, có rung (flutter) - tắt gọn ngay trước lúc chạm đất.
    function wind(dur = 0.6, { vol = 1, at = 0 } = {}) {
        const a = get(); if (!a || vol <= 0 || dur < 0.08) return;
        const t = a.currentTime + at, s = noise(white, t, dur), bp = filt('bandpass', 260, 0.6), lp = filt('lowpass', 2400);
        bp.frequency.setValueAtTime(260, t); bp.frequency.exponentialRampToValueAtTime(R(900, 1100), t + dur);
        const c = chain(s, { wet: 0.08, nodes: [bp, lp] });
        c.g.gain.setValueAtTime(0.0001, t); c.g.gain.exponentialRampToValueAtTime(0.7 * vol, t + dur * 0.92); c.g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
        const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = R(7, 11); lg.gain.value = 0.18 * vol; lfo.connect(lg).connect(c.g.gain);
        lfo.start(t); lfo.stop(t + dur + 0.1);
    }
    // 🪨 Nứt đất / đá: chuỗi tiếng "rắc" ngắn dày dần (nhiễu dải cao 2–5 kHz vài ms) + một tiếng gãy + ầm trầm bên dưới.
    function crack(power = 1, { vol = 1, at = 0 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t0 = a.currentTime + at, n = Math.round(10 + 8 * power);
        for (let i = 0; i < n; i++) {
            const t = t0 + Math.pow(i / n, 1.6) * 0.32 + R(0, 0.012), s = noise(white, t, 0.03);
            const c = chain(s, { pan: R(-0.4, 0.4), wet: 0.25, nodes: [filt('bandpass', R(2000, 5200), R(2, 5))] });
            envl(c.g, t, 0.0008, R(0.25, 0.6) * vol * power, 0, R(0.006, 0.02));
        }
        const o = a.createOscillator(); o.type = 'triangle';
        o.frequency.setValueAtTime(R(1500, 2100), t0 + 0.05); o.frequency.exponentialRampToValueAtTime(260, t0 + 0.09);
        const c = chain(o, { wet: 0.3 }); envl(c.g, t0 + 0.05, 0.001, 0.28 * vol * power, 0, 0.06);
        o.start(t0 + 0.05); o.stop(t0 + 0.2);
        rumble(0.9 * power + 0.3, { vol: 0.7 * vol * power, at });
    }
    // Mảnh vụn rơi lộp độp (đá, bụi tường) rải trong 'spread' giây.
    function debris(n = 8, { vol = 1, at = 0, spread = 0.7 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t0 = a.currentTime + at;
        for (let i = 0; i < n; i++) {
            const t = t0 + Math.pow(Math.random(), 1.8) * spread, s = noise(white, t, 0.05), big = Math.random() < 0.25;
            const c = chain(s, { pan: R(-0.7, 0.7), wet: 0.35, nodes: [filt('bandpass', big ? R(700, 1300) : R(2500, 6000), R(3, 8))] });
            envl(c.g, t, 0.0008, (big ? 0.8 : 0.5) * R(0.5, 1) * vol, 0, big ? 0.06 : 0.025);
        }
    }
    // Ầm trầm (đất rung) - nhiễu nâu lọc dưới 110 Hz, phồng lên rồi tắt.
    function rumble(dur = 1, { vol = 1, at = 0 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t = a.currentTime + at, s = noise(brown, t, dur), c = chain(s, { wet: 0.2, nodes: [filt('lowpass', 110, 0.9)] });
        c.g.gain.setValueAtTime(0.0001, t); c.g.gain.exponentialRampToValueAtTime(0.9 * vol, t + Math.min(0.12, dur * 0.2)); c.g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    // 🌀 Xoáy cổng / hố không gian: 2 sóng răng cưa trầm lệch nhau (phách) qua bộ lọc quét chậm + gió xoáy (nhiễu dải đảo trái phải).
    function portal(dur = 1.5, { vol = 1, at = 0 } = {}) {
        const a = get(); if (!a || vol <= 0 || dur < 0.2) return;
        const t = a.currentTime + at, fin = Math.min(0.35, dur * 0.3), fout = Math.min(0.45, dur * 0.35);
        const lp = filt('lowpass', 420, 4), lfo = a.createOscillator(), lg = a.createGain();
        lfo.frequency.value = R(0.5, 0.8); lg.gain.value = 300; lfo.connect(lg).connect(lp.frequency);
        const mix = a.createGain(); mix.gain.value = 0.5;
        const oscs = [R(52, 58), R(52, 58) * 1.012, R(104, 112)].map((f, i) => { const o = a.createOscillator(); o.type = i < 2 ? 'sawtooth' : 'sine'; o.frequency.value = f; o.connect(mix); o.start(t); o.stop(t + dur + 0.1); return o; });
        oscs[0].frequency.setValueAtTime(oscs[0].frequency.value, t); oscs[0].frequency.linearRampToValueAtTime(oscs[0].frequency.value * 1.15, t + dur);
        const c = chain(mix, { wet: 0.35, nodes: [lp] });
        c.g.gain.setValueAtTime(0.0001, t); c.g.gain.exponentialRampToValueAtTime(0.2 * vol, t + fin); c.g.gain.setValueAtTime(0.2 * vol, t + dur - fout); c.g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        const s = noise(white, t, dur), bp = filt('bandpass', 900, 3), sw = a.createOscillator(), sg = a.createGain();
        sw.frequency.value = R(1.2, 1.8); sg.gain.value = 650; sw.connect(sg).connect(bp.frequency);
        const c2 = chain(s, { wet: 0.4, nodes: [bp] });
        c2.g.gain.setValueAtTime(0.0001, t); c2.g.gain.exponentialRampToValueAtTime(0.16 * vol, t + fin); c2.g.gain.setValueAtTime(0.16 * vol, t + dur - fout); c2.g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        if (c2.p) { const pl = a.createOscillator(), pg = a.createGain(); pl.frequency.value = R(0.6, 1); pg.gain.value = 0.6; pl.connect(pg).connect(c2.p.pan); pl.start(t); pl.stop(t + dur + 0.1); }
        lfo.start(t); lfo.stop(t + dur + 0.1); sw.start(t); sw.stop(t + dur + 0.1);
    }
    // 👕 Sột soạt quần áo (lúc lăn / đứng dậy): nhiễu cao điều biên ngẫu nhiên.
    function rustle(dur = 0.4, { vol = 1, at = 0, pan = 0 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t = a.currentTime + at, s = noise(white, t, dur), c = chain(s, { pan, wet: 0.15, nodes: [filt('highpass', 1800), filt('lowpass', 7000)] });
        c.g.gain.setValueAtTime(0.0001, t);
        const steps = Math.max(3, Math.round(dur * 30));
        for (let i = 1; i <= steps; i++) c.g.gain.linearRampToValueAtTime(R(0.02, 0.16) * vol * (1 - i / steps * 0.6), t + dur * i / steps);
        c.g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.02);
    }
    // Mở sẵn AudioContext (OBS / trình duyệt) để tiếng đầu tiên không trễ.
    // 👟 Chân chạy (🏃 Bị Đuổi): chuỗi bước = thân trầm ngắn + tiếng đế giày trên sàn, lướt pan0 → pan1 (chạy ngang qua tai);
    // far = chạy ở xa ngoài khung (lọc trầm, nhỏ, vang hơn). rate = bước / giây.
    function steps(dur = 0.6, { vol = 1, at = 0, rate = 7.5, pan0 = 0, pan1 = 0, far = false } = {}) {
        const a = get(); if (!a || vol <= 0 || dur < 0.08) return;
        const n = Math.max(1, Math.round(dur * rate));
        for (let i = 0; i < n; i++) {
            const k = n > 1 ? i / (n - 1) : 0, t = Math.max(a.currentTime, a.currentTime + at + i * dur / n + R(-0.012, 0.012));
            const pan = pan0 + (pan1 - pan0) * k, pv = vol * (far ? 0.4 : 1) * R(0.75, 1) * (i % 2 ? 0.85 : 1);
            const o = a.createOscillator(); o.type = 'sine';
            o.frequency.setValueAtTime(R(72, 92), t); o.frequency.exponentialRampToValueAtTime(46, t + 0.08);
            const c1 = chain(o, { pan, wet: far ? 0.4 : 0.15, nodes: far ? [filt('lowpass', 450)] : [] }); envl(c1.g, t, 0.002, 0.6 * pv, 0, 0.09);
            o.start(t); o.stop(t + 0.2);
            const s = noise(white, t, 0.07), c2 = chain(s, { pan, wet: far ? 0.45 : 0.2, nodes: [filt('bandpass', far ? 650 : R(1700, 2500), 1.1)] });
            envl(c2.g, t, 0.001, (far ? 0.14 : 0.3) * pv, 0, 0.045);
        }
    }
    // 🎮 Nhạc 8-bit (🥷 Ninja: trúng đòn / GAME OVER): chuỗi nốt sóng vuông [tần số Hz, giây], 0 = lặng; nốt cắt gọn, không vang.
    function chip(notes, { vol = 1, at = 0, type = 'square' } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        let t = a.currentTime + at;
        for (const [f, d] of notes) {
            if (f > 0) {
                const o = a.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
                const c = chain(o, { wet: 0.06, nodes: [filt('lowpass', 3800)] });
                c.g.gain.setValueAtTime(0.0001, t); c.g.gain.exponentialRampToValueAtTime(0.22 * vol, t + 0.008);
                c.g.gain.setValueAtTime(0.22 * vol, t + d * 0.75); c.g.gain.exponentialRampToValueAtTime(0.0001, t + d);
                o.start(t); o.stop(t + d + 0.02);
            }
            t += d;
        }
    }
    // 🔴 Bắt NPC (fx-catch.mjs) - tiếng cơ khí của quả cầu, tự tổng hợp (không chép tiếng game / phim):
    // Cạch: khoá bấm - nhiễu dải 3 kHz rất ngắn + sine 2,4 kHz tắt gọn. power 0.3 (lắc nhẹ) … 1 (đóng nắp).
    function click(power = 1, { vol = 1, at = 0, pan = 0 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t = a.currentTime + at, p = Math.max(0.1, power) * vol;
        const s = noise(white, t, 0.04), c1 = chain(s, { pan, wet: 0.12, nodes: [filt('bandpass', R(2800, 3400), 3)] });
        envl(c1.g, t, 0.001, 0.55 * p, 0.004, 0.025);
        const o = a.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(R(2300, 2500), t);
        const c2 = chain(o, { pan, wet: 0.1 }); envl(c2.g, t, 0.001, 0.22 * p, 0, 0.03);
        o.start(t); o.stop(t + 0.08);
    }
    // TING: chuông kim loại sáng - 3 sine (nốt + quãng năm + bát độ) tắt chậm theo hàm mũ, vang dài.
    function ding({ vol = 1, at = 0 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t = a.currentTime + at;
        for (const [f, g, r] of [[1318.5, 0.32, 1.3], [1975.5, 0.16, 0.9], [2637, 0.1, 0.6], [3951, 0.04, 0.3]]) {
            const o = a.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f, t);
            const c = chain(o, { wet: 0.4 }); envl(c.g, t, 0.002, g * vol, 0.01, r);
            o.start(t); o.stop(t + r + 0.2);
        }
    }
    // Bật nắp / bung ra: tiếng "bốp" - nhiễu dải quét 2,4 kHz → 300 Hz rất nhanh + sine tụt.
    function pop(power = 1, { vol = 1, at = 0 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t = a.currentTime + at, p = Math.max(0.1, power) * vol;
        const s = noise(white, t, 0.2), bp = filt('bandpass', 2400, 1.4);
        bp.frequency.setValueAtTime(2400, t); bp.frequency.exponentialRampToValueAtTime(300, t + 0.12);
        const c1 = chain(s, { wet: 0.25, nodes: [bp] }); envl(c1.g, t, 0.002, 0.7 * p, 0.01, 0.12);
        const o = a.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.15);
        const c2 = chain(o, { wet: 0.15 }); envl(c2.g, t, 0.002, 0.5 * p, 0, 0.16);
        o.start(t); o.stop(t + 0.3);
    }
    // Tia sáng hút: dải sine trượt lên + rung (tremolo) + nhiễu sáng - "vùuu" kéo dài dur giây.
    function beam(dur = 1, { vol = 1, at = 0 } = {}) {
        const a = get(); if (!a || vol <= 0 || dur < 0.1) return;
        const t = a.currentTime + at;
        const o = a.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(1300, t + dur);
        const c = chain(o, { wet: 0.35, nodes: [filt('lowpass', 2600), filt('highpass', 160)] });
        c.g.gain.setValueAtTime(0.0001, t); c.g.gain.exponentialRampToValueAtTime(0.12 * vol, t + 0.08);
        c.g.gain.setValueAtTime(0.12 * vol, t + dur * 0.8); c.g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = 14; lg.gain.value = 0.05 * vol; lfo.connect(lg).connect(c.g.gain);
        o.start(t); o.stop(t + dur + 0.05); lfo.start(t); lfo.stop(t + dur + 0.05);
        const s = noise(white, t, dur), c2 = chain(s, { wet: 0.3, nodes: [filt('bandpass', 5200, 1.2)] });
        c2.g.gain.setValueAtTime(0.0001, t); c2.g.gain.exponentialRampToValueAtTime(0.05 * vol, t + dur * 0.5); c2.g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    // Cầu LẮC trên sàn (dur = một lần lắc): nghiêng trái - phải = 2 tiếng "cộc" vỏ nhựa chạm sàn (nhiễu dải 900 Hz + sine 180 Hz rất
    // ngắn) + lạch cạch bên trong (vài hạt nhiễu cao) + bíp nút sáng ở giữa lần lắc.
    function rattle(dur = 0.42, { vol = 1, at = 0, pan = 0 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t0 = a.currentTime + at;
        [0.25, 0.75].forEach((k, i) => {
            const t = t0 + dur * k, p = pan + (i ? 0.25 : -0.25);
            const s = noise(white, t, 0.05), c1 = chain(s, { pan: p, wet: 0.2, nodes: [filt('bandpass', R(820, 1000), 2.5)] });
            envl(c1.g, t, 0.001, 0.5 * vol, 0.005, 0.05);
            const o = a.createOscillator(); o.type = 'sine';
            o.frequency.setValueAtTime(R(170, 200), t); o.frequency.exponentialRampToValueAtTime(90, t + 0.06);
            const c2 = chain(o, { pan: p, wet: 0.15 }); envl(c2.g, t, 0.001, 0.45 * vol, 0, 0.07);
            o.start(t); o.stop(t + 0.12);
        });
        for (let i = 0; i < 5; i++) {
            const t = t0 + R(0.05, dur * 0.85), s = noise(white, t, 0.02);
            const c = chain(s, { pan: pan + R(-0.3, 0.3), wet: 0.15, nodes: [filt('bandpass', R(3500, 6500), 6)] });
            envl(c.g, t, 0.001, R(0.08, 0.18) * vol, 0, 0.015);
        }
        const tb = t0 + dur * 0.4, o = a.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(1046.5, tb);
        const cb = chain(o, { wet: 0.2 }); envl(cb.g, tb, 0.005, 0.07 * vol, 0.06, 0.08);
        o.start(tb); o.stop(tb + 0.25);
    }
    // ✨ Biến Hình (fx-morph.mjs) - tự tổng hợp:
    // 🧊 Vỡ kính / băng: chùm "keng" kim loại cao (sine 2,5–7 kHz tắt nhanh, lệch nhau) + nhiễu sáng vỡ vụn + mảnh rơi lộp độp.
    function shatter(power = 1, { vol = 1, at = 0 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t0 = a.currentTime + at, p = Math.max(0.1, power) * vol;
        const s = noise(white, t0, 0.35), c = chain(s, { wet: 0.4, nodes: [filt('highpass', 2600)] });
        envl(c.g, t0, 0.001, 0.6 * p, 0.02, 0.28);
        for (let i = 0; i < 14; i++) {
            const t = t0 + Math.pow(Math.random(), 1.5) * 0.5, o = a.createOscillator(); o.type = 'sine';
            o.frequency.setValueAtTime(R(2500, 7200), t);
            const cc = chain(o, { pan: R(-0.7, 0.7), wet: 0.45 }); envl(cc.g, t, 0.001, R(0.05, 0.16) * p, 0, R(0.08, 0.3));
            o.start(t); o.stop(t + 0.4);
        }
        debris(12, { vol: 0.6 * vol, at: at + 0.25, spread: 1.1 });
    }
    // ❄ Đóng băng: tiếng "rít" băng lan (nhiễu dải cao quét lên) + vài tiếng "tách" nhỏ.
    function freeze(dur = 1, { vol = 1, at = 0 } = {}) {
        const a = get(); if (!a || vol <= 0 || dur < 0.1) return;
        const t = a.currentTime + at, s = noise(white, t, dur), bp = filt('bandpass', 1800, 2.5);
        bp.frequency.setValueAtTime(1800, t); bp.frequency.exponentialRampToValueAtTime(6500, t + dur);
        const c = chain(s, { wet: 0.3, nodes: [bp] });
        c.g.gain.setValueAtTime(0.0001, t); c.g.gain.exponentialRampToValueAtTime(0.28 * vol, t + dur * 0.4); c.g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        for (let i = 0; i < 8; i++) click(R(0.2, 0.5), { vol: vol * 0.6, at: at + R(0, dur), pan: R(-0.5, 0.5) });
    }
    // ⚡ Sét: tiếng "xẹt" điện (răng cưa rung nhanh + nhiễu) rồi sấm nổ (crack mạnh + ầm dài).
    function zap(power = 1, { vol = 1, at = 0 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t = a.currentTime + at, p = Math.max(0.1, power) * vol;
        const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(R(55, 70), t);
        const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = R(40, 60); lg.gain.value = 40; lfo.connect(lg).connect(o.frequency);
        const c = chain(o, { wet: 0.2, nodes: [filt('highpass', 300), filt('lowpass', 5000)] }); envl(c.g, t, 0.002, 0.22 * p, 0.25, 0.25);
        o.start(t); o.stop(t + 0.6); lfo.start(t); lfo.stop(t + 0.6);
        const s = noise(white, t, 0.5), cs = chain(s, { wet: 0.2, nodes: [filt('bandpass', 4200, 1.5)] }); envl(cs.g, t, 0.001, 0.4 * p, 0.2, 0.2);
        crack(1.4 * power, { vol, at });
        rumble(2.2, { vol: vol * Math.min(1, power), at: at + 0.15 });
    }
    // 🐝 Ong vo ve (dur giây) - nghe như ~10 con (user 2026-10-28: "tầm 10 con thay cho 100 con"): mỗi con một giọng riêng = răng cưa
    // 180–290 Hz qua lọc dải (tiếng cánh), cao độ lượn theo đường bay; to nhỏ từng con khi bay sát tai rồi xa ra (doppler nhẹ + pan),
    // vài con chỉ thoáng qua. Tổng nhỏ, không thành tiếng ù đặc của cả đàn.
    function buzz(dur = 2, { vol = 1, at = 0, bees = 10 } = {}) {
        const a = get(); if (!a || vol <= 0 || dur < 0.2) return;
        const t0 = a.currentTime + at, n = Math.max(1, Math.min(14, bees));
        for (let i = 0; i < n; i++) {
            // mỗi con bay ngang tai trong một quãng ngẫu nhiên của lượt (có con bay suốt, có con lướt qua)
            const st = t0 + R(0, dur * 0.5), len = Math.min(t0 + dur - st, R(0.6, dur)), t = st;
            if (len < 0.25) continue;
            const f0 = R(180, 290), o = a.createOscillator(); o.type = 'sawtooth';
            o.frequency.setValueAtTime(f0 * 1.04, t); o.frequency.linearRampToValueAtTime(f0, t + len * 0.5); o.frequency.linearRampToValueAtTime(f0 * 0.96, t + len);
            const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = R(4, 9); lg.gain.value = R(6, 16); lfo.connect(lg).connect(o.frequency);
            const c = chain(o, { pan: R(-0.8, 0.8), wet: 0.12, nodes: [filt('bandpass', R(500, 950), R(1.5, 3)), filt('highpass', 160)] });
            const peak = 0.035 * vol * R(0.6, 1.2);
            c.g.gain.setValueAtTime(0.0001, t); c.g.gain.exponentialRampToValueAtTime(peak, t + len * R(0.3, 0.55)); c.g.gain.exponentialRampToValueAtTime(0.0001, t + len);
            // rung biên độ nhanh = tiếng đập cánh
            const am = a.createOscillator(), ag = a.createGain(); am.frequency.value = R(28, 40); ag.gain.value = peak * 0.35; am.connect(ag).connect(c.g.gain);
            if (c.p) { c.p.pan.setValueAtTime(R(-0.9, 0.9), t); c.p.pan.linearRampToValueAtTime(R(-0.9, 0.9), t + len); }
            for (const x of [o, lfo, am]) { x.start(t); x.stop(t + len + 0.05); }
        }
    }
    // ===== ✨ Biến Hình - tiếng khớp từng pha (tự tổng hợp; có mp3 riêng thì tắt) =====
    // ❄ Băng kết tinh: lách tách dày dần (nhiễu cao rất ngắn) + hơi lạnh rít nhẹ.
    function iceForm(dur = 1.5, { vol = 1, at = 0 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t0 = a.currentTime + at, n = Math.round(30 * dur);
        for (let i = 0; i < n; i++) {
            const t = t0 + Math.pow(i / n, 0.8) * dur + R(0, 0.02), s = noise(white, t, 0.02);
            const c = chain(s, { pan: R(-0.6, 0.6), wet: 0.3, nodes: [filt('bandpass', R(3500, 9000), R(4, 9))] });
            envl(c.g, t, 0.0005, R(0.05, 0.22) * vol * (0.4 + 0.6 * i / n), 0, R(0.004, 0.015));
        }
        const s = noise(white, t0, dur), bp = filt('bandpass', 5000, 1.5);
        const c = chain(s, { wet: 0.3, nodes: [bp] }); c.g.gain.setValueAtTime(0.0001, t0); c.g.gain.exponentialRampToValueAtTime(0.06 * vol, t0 + dur * 0.8); c.g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    }
    // 🧊 Băng rạn kêu cót két trước khi vỡ: tiếng rên trầm (răng cưa lọc, cao độ trượt) + vài tiếng "tách" sắc.
    function creak(dur = 0.5, { vol = 1, at = 0 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t = a.currentTime + at, o = a.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(R(70, 90), t); o.frequency.linearRampToValueAtTime(R(130, 170), t + dur);
        const c = chain(o, { wet: 0.25, nodes: [filt('bandpass', 900, 6), filt('lowpass', 2500)] });
        c.g.gain.setValueAtTime(0.0001, t); c.g.gain.exponentialRampToValueAtTime(0.18 * vol, t + dur * 0.3); c.g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        const am = a.createOscillator(), ag = a.createGain(); am.frequency.value = 22; ag.gain.value = 0.08 * vol; am.connect(ag).connect(c.g.gain);
        o.start(t); o.stop(t + dur + 0.05); am.start(t); am.stop(t + dur + 0.05);
        for (let i = 0; i < 4; i++) click(R(0.5, 0.9), { vol: vol * 0.7, at: at + R(0.05, dur), pan: R(-0.4, 0.4) });
    }
    // Mảnh kính rơi leng keng: tiếng "ting" cao tắt nhanh rải theo thời gian (mảnh chạm sàn).
    function tinkle(n = 12, { vol = 1, at = 0, spread = 1 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t0 = a.currentTime + at;
        for (let i = 0; i < n; i++) {
            const t = t0 + Math.pow(Math.random(), 1.4) * spread, f = R(2800, 7500), o = a.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f, t);
            const c = chain(o, { pan: R(-0.8, 0.8), wet: 0.4 }); envl(c.g, t, 0.001, R(0.03, 0.1) * vol, 0, R(0.05, 0.18));
            o.start(t); o.stop(t + 0.3);
            const o2 = a.createOscillator(); o2.type = 'sine'; o2.frequency.setValueAtTime(f * 2.76, t);
            const c2 = chain(o2, { pan: R(-0.8, 0.8), wet: 0.4 }); envl(c2.g, t, 0.001, R(0.01, 0.04) * vol, 0, 0.05); o2.start(t); o2.stop(t + 0.15);
        }
    }
    // 👾 Nhiễu số (glitch): vài mẩu sóng vuông nhảy cao độ + nhiễu bị "cắt vụn" (bitcrush giả bằng bật tắt nhanh).
    function glitch(dur = 0.12, { vol = 1, at = 0 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t0 = a.currentTime + at, n = Math.max(2, Math.round(dur / 0.025));
        for (let i = 0; i < n; i++) {
            const t = t0 + i * dur / n, o = a.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime([110, 220, 440, 880, 1760, 3520][Math.floor(R(0, 6))], t);
            const c = chain(o, { wet: 0.02, nodes: [filt('lowpass', 5000)] }); envl(c.g, t, 0.001, 0.07 * vol, dur / n * 0.6, 0.004);
            o.start(t); o.stop(t + dur / n + 0.02);
        }
        const s = noise(white, t0, dur), c = chain(s, { wet: 0.02, nodes: [filt('highpass', 2000)] });
        c.g.gain.setValueAtTime(0.0001, t0);
        for (let i = 0; i < n * 2; i++) c.g.gain.setValueAtTime(i % 2 ? 0.0001 : 0.05 * vol, t0 + i * dur / (n * 2));
        c.g.gain.setValueAtTime(0.0001, t0 + dur);
    }
    // Khối nhựa / gỗ rơi lộp cộp: tiếng "cạch" dải 1,2–2,6 kHz + thân trầm ngắn, rải theo thời gian.
    function clack(n = 16, { vol = 1, at = 0, spread = 0.8 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t0 = a.currentTime + at;
        for (let i = 0; i < n; i++) {
            const t = t0 + Math.pow(Math.random(), 1.3) * spread, s = noise(white, t, 0.04), p = R(-0.7, 0.7);
            const c = chain(s, { pan: p, wet: 0.25, nodes: [filt('bandpass', R(1200, 2600), R(4, 10))] }); envl(c.g, t, 0.0008, R(0.15, 0.4) * vol, 0, R(0.02, 0.05));
            const o = a.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(R(260, 520), t); o.frequency.exponentialRampToValueAtTime(R(120, 200), t + 0.05);
            const c2 = chain(o, { pan: p, wet: 0.2 }); envl(c2.g, t, 0.001, R(0.06, 0.16) * vol, 0, 0.05); o.start(t); o.stop(t + 0.1);
        }
    }
    // Xoáy gió (khối xoáy bay về): nhiễu dải quét lên + pan vòng trái phải.
    function swirl(dur = 1, { vol = 1, at = 0 } = {}) {
        const a = get(); if (!a || vol <= 0 || dur < 0.1) return;
        const t = a.currentTime + at, s = noise(white, t, dur), bp = filt('bandpass', 400, 2);
        bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(2600, t + dur);
        const c = chain(s, { wet: 0.25, nodes: [bp] });
        c.g.gain.setValueAtTime(0.0001, t); c.g.gain.exponentialRampToValueAtTime(0.35 * vol, t + dur * 0.6); c.g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        if (c.p) { const pl = a.createOscillator(), pg = a.createGain(); pl.frequency.value = 2.2; pg.gain.value = 0.85; pl.connect(pg).connect(c.p.pan); pl.start(t); pl.stop(t + dur + 0.05); }
    }
    // ⚡ Sấm rền: tiếng nổ + ầm cuộn dài nhiều đợt (nhiễu nâu lọc, to nhỏ thất thường).
    function thunder(power = 1, { vol = 1, at = 0 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t = a.currentTime + at, dur = 2.2 + power;
        const s = noise(brown, t, dur), c = chain(s, { wet: 0.45, nodes: [filt('lowpass', R(160, 240), 0.8)] });
        c.g.gain.setValueAtTime(0.0001, t);
        let x = t;
        for (let i = 0; i < 9; i++) { x += dur / 10; c.g.gain.linearRampToValueAtTime(R(0.25, 0.9) * vol * Math.pow(1 - i / 10, 0.6), x); }
        c.g.gain.linearRampToValueAtTime(0.0001, t + dur);
    }
    // Điện xẹt lách tách (lúc lộ xương): nhiễu cao bật tắt ngẫu nhiên + vo ve điện 120 Hz.
    function sizzle(dur = 0.6, { vol = 1, at = 0 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t0 = a.currentTime + at, s = noise(white, t0, dur), c = chain(s, { wet: 0.15, nodes: [filt('highpass', 2500), filt('lowpass', 9000)] });
        c.g.gain.setValueAtTime(0.0001, t0);
        for (let x = 0; x < dur; x += R(0.008, 0.03)) c.g.gain.setValueAtTime(Math.random() < 0.5 ? R(0.05, 0.25) * vol : 0.0001, t0 + x);
        c.g.gain.setValueAtTime(0.0001, t0 + dur);
        const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 120;
        const c2 = chain(o, { wet: 0.1, nodes: [filt('bandpass', 1200, 2)] }); envl(c2.g, t0, 0.01, 0.06 * vol, dur * 0.7, dur * 0.3);
        o.start(t0); o.stop(t0 + dur + 0.05);
    }
    // 👀 Mắt bật ra "boing" (lò xo) + rơi xuống đất "bẹp" (mềm, ướt).
    function boing({ vol = 1, at = 0 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t = a.currentTime + at, o = a.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(620, t + 0.08); o.frequency.exponentialRampToValueAtTime(260, t + 0.35);
        const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = 16; lg.gain.value = 40; lfo.connect(lg).connect(o.frequency);
        const c = chain(o, { wet: 0.2 }); envl(c.g, t, 0.003, 0.3 * vol, 0.05, 0.3);
        o.start(t); o.stop(t + 0.5); lfo.start(t); lfo.stop(t + 0.5);
    }
    function splat(power = 1, { vol = 1, at = 0 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t = a.currentTime + at, s = noise(white, t, 0.15), bp = filt('lowpass', 1400, 1);
        bp.frequency.setValueAtTime(1800, t); bp.frequency.exponentialRampToValueAtTime(300, t + 0.1);
        const c = chain(s, { wet: 0.2, nodes: [bp] }); envl(c.g, t, 0.002, 0.4 * vol * power, 0.01, 0.1);
        thud(0.25 * power, { vol: vol * 0.7, at });
    }
    // 🌀 Máy hút: mô-tơ ù (răng cưa trầm + hoạ âm, cao dần khi hút mạnh) + luồng gió rít.
    function vacuum(dur = 1.5, { vol = 1, at = 0 } = {}) {
        const a = get(); if (!a || vol <= 0 || dur < 0.2) return;
        const t = a.currentTime + at, mix = a.createGain(); mix.gain.value = 0.5;
        const oscs = [1, 2.01, 3.02].map((m, i) => { const o = a.createOscillator(); o.type = i ? 'sine' : 'sawtooth'; o.frequency.setValueAtTime(95 * m, t); o.frequency.exponentialRampToValueAtTime(150 * m, t + dur * 0.7); o.connect(mix); o.start(t); o.stop(t + dur + 0.05); return o; });
        void oscs;
        const c = chain(mix, { wet: 0.15, nodes: [filt('lowpass', 900)] });
        c.g.gain.setValueAtTime(0.0001, t); c.g.gain.exponentialRampToValueAtTime(0.16 * vol, t + 0.25); c.g.gain.setValueAtTime(0.16 * vol, t + dur - 0.2); c.g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        const s = noise(white, t, dur), bp = filt('bandpass', 700, 0.8);
        bp.frequency.setValueAtTime(700, t); bp.frequency.exponentialRampToValueAtTime(2600, t + dur * 0.8);
        const c2 = chain(s, { wet: 0.2, nodes: [bp] });
        c2.g.gain.setValueAtTime(0.0001, t); c2.g.gain.exponentialRampToValueAtTime(0.3 * vol, t + dur * 0.75); c2.g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    // Hút tuột "sụp" (người chui vào ống): dải lọc quét lên rất nhanh + bong bóng ọc ọc.
    function slurp({ vol = 1, at = 0 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t = a.currentTime + at, s = noise(white, t, 0.45), bp = filt('bandpass', 300, 5);
        bp.frequency.setValueAtTime(250, t); bp.frequency.exponentialRampToValueAtTime(3200, t + 0.35);
        const c = chain(s, { wet: 0.25, nodes: [bp] }); envl(c.g, t, 0.01, 0.5 * vol, 0.15, 0.2);
        const am = a.createOscillator(), ag = a.createGain(); am.frequency.value = 26; ag.gain.value = 0.25 * vol; am.connect(ag).connect(c.g.gain); am.start(t); am.stop(t + 0.5);
        pop(0.8, { vol: vol * 0.8, at: at + 0.38 });
    }
    // Ống gân co duỗi: tiếng nhựa gân sột soạt / cót két ngắn.
    function hose(dur = 0.5, { vol = 1, at = 0 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t0 = a.currentTime + at, n = Math.round(dur * 26);
        for (let i = 0; i < n; i++) {
            const t = t0 + i * dur / n + R(0, 0.01), s = noise(white, t, 0.03);
            const c = chain(s, { pan: R(-0.3, 0.3), wet: 0.15, nodes: [filt('bandpass', R(700, 1500), 6)] }); envl(c.g, t, 0.001, R(0.04, 0.1) * vol, 0, 0.02);
        }
    }
    // 🖐 Cái tát: tiếng "BỐP" da thịt - nhiễu dải 1,5–3 kHz bật cực nhanh tắt nhanh (mặt da) + thân trầm ngắn (thịt) + vang phòng;
    // power 0.5 … 1.5.
    function slap(power = 1, { vol = 1, at = 0, pan = 0 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t = a.currentTime + at, p = Math.max(0.2, power) * vol;
        const s = noise(white, t, 0.12), c = chain(s, { pan, wet: 0.35, nodes: [filt('bandpass', R(1700, 2600), 0.7)] });
        envl(c.g, t, 0.0006, 0.95 * p, 0.004, 0.07);
        const s2 = noise(white, t, 0.05), c2 = chain(s2, { pan, wet: 0.2, nodes: [filt('highpass', 5000)] }); envl(c2.g, t, 0.0004, 0.35 * p, 0, 0.02);
        const o = a.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(R(150, 190), t); o.frequency.exponentialRampToValueAtTime(70, t + 0.09);
        const c3 = chain(o, { pan, wet: 0.15 }); envl(c3.g, t, 0.002, 0.55 * p, 0, 0.1); o.start(t); o.stop(t + 0.2);
    }
    // 👻 Hồn lìa: tiếng hú ma (2 sine lệch nhau rung chậm kiểu theremin, trượt lên rồi xuống) + gió thì thào (nhiễu dải cao).
    function ghost(dur = 1.6, { vol = 1, at = 0, up = true } = {}) {
        const a = get(); if (!a || vol <= 0 || dur < 0.2) return;
        const t = a.currentTime + at, f0 = up ? 330 : 700, f1 = up ? 760 : 300;
        for (const [m, gv] of [[1, 0.13], [1.503, 0.06]]) {
            const o = a.createOscillator(); o.type = 'sine';
            o.frequency.setValueAtTime(f0 * m, t); o.frequency.exponentialRampToValueAtTime(f1 * m, t + dur * 0.7); o.frequency.exponentialRampToValueAtTime(f1 * m * 0.82, t + dur);
            const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = 5.5; lg.gain.value = 14 * m; lfo.connect(lg).connect(o.frequency);
            const c = chain(o, { wet: 0.6 }); envl(c.g, t, dur * 0.25, gv * vol, dur * 0.35, dur * 0.4);
            o.start(t); o.stop(t + dur + 0.1); lfo.start(t); lfo.stop(t + dur + 0.1);
        }
        const s = noise(white, t, dur), bp = filt('bandpass', 2400, 3);
        bp.frequency.setValueAtTime(1800, t); bp.frequency.exponentialRampToValueAtTime(3600, t + dur);
        const c2 = chain(s, { wet: 0.5, nodes: [bp] }); envl(c2.g, t, dur * 0.3, 0.07 * vol, dur * 0.3, dur * 0.4);
    }
    // 🎈 Bơm hơi: n nhịp "xì" (nhiễu dải cao, cao dần) - mỗi nhịp một lần bơm.
    function inflate(n = 4, { vol = 1, at = 0, dur = 1.8 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t0 = a.currentTime + at;
        for (let i = 0; i < n; i++) {
            const t = t0 + i * dur / n, s = noise(white, t, 0.3), bp = filt('bandpass', 1800 + i * 500, 2);
            const c = chain(s, { wet: 0.15, nodes: [bp] }); envl(c.g, t, 0.04, 0.22 * vol, 0.08, 0.12);
            const o = a.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(140 + i * 40, t); o.frequency.exponentialRampToValueAtTime(220 + i * 50, t + 0.25);
            const c2 = chain(o, { wet: 0.1 }); envl(c2.g, t, 0.03, 0.06 * vol, 0.1, 0.12); o.start(t); o.stop(t + 0.35);
        }
    }
    // 🎈 Bóng xì hơi bay vòng vèo: "phrrrt" (răng cưa lọc + rung nhanh, cao độ lượn sóng rồi tụt).
    function deflate(dur = 1.2, { vol = 1, at = 0 } = {}) {
        const a = get(); if (!a || vol <= 0 || dur < 0.2) return;
        const t = a.currentTime + at, o = a.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(420, t);
        for (let i = 1; i <= 6; i++) o.frequency.linearRampToValueAtTime((i % 2 ? 560 : 330) * (1 - i * 0.08), t + dur * i / 7);
        o.frequency.exponentialRampToValueAtTime(90, t + dur);
        const am = a.createOscillator(), ag = a.createGain(); am.frequency.value = 38; ag.gain.value = 0.5;
        const c = chain(o, { wet: 0.2, nodes: [filt('lowpass', 1600, 2)] });
        am.connect(ag).connect(c.g.gain);
        envl(c.g, t, 0.02, 0.2 * vol, dur - 0.2, 0.18);
        o.start(t); o.stop(t + dur + 0.1); am.start(t); am.stop(t + dur + 0.1);
    }
    // 🫠 Tan chảy: bọt sủi ọc ọc (nhiều "bụp" nhỏ cao độ ngẫu nhiên, sine trượt lên) + nền nhớt trầm.
    function gloop(dur = 2, { vol = 1, at = 0 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t0 = a.currentTime + at, n = Math.round(dur * 9);
        for (let i = 0; i < n; i++) {
            const t = t0 + R(0, dur), o = a.createOscillator(), f = R(160, 520); o.type = 'sine';
            o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * R(1.8, 2.6), t + 0.06);
            const c = chain(o, { pan: R(-0.5, 0.5), wet: 0.25 }); envl(c.g, t, 0.004, R(0.05, 0.12) * vol, 0, 0.06); o.start(t); o.stop(t + 0.12);
        }
        const s = noise(brown, t0, dur), c2 = chain(s, { wet: 0.2, nodes: [filt('lowpass', 380)] }); envl(c2.g, t0, 0.3, 0.25 * vol, dur - 0.6, 0.3);
    }
    // 🪞 Phân thân: chuông lấp lánh (1 nốt cho mỗi bản sao, đi lên) - n nốt cách nhau gap giây.
    function shimmer(n = 6, { vol = 1, at = 0, gap = 0.18 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const scale = [659.3, 784, 987.8, 1174.7, 1318.5, 1568, 1975.5, 2349.3];
        for (let i = 0; i < n; i++) {
            const t = a.currentTime + at + i * gap, f = scale[i % scale.length];
            for (const [m, g] of [[1, 0.12], [2.76, 0.04], [5.4, 0.015]]) {
                const o = a.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * m, t);
                const c = chain(o, { pan: (i % 2 ? 0.4 : -0.4), wet: 0.5 }); envl(c.g, t, 0.003, g * vol, 0, 0.8 / m + 0.2); o.start(t); o.stop(t + 1.2);
            }
        }
    }
    // 🎨 Anime: trống taiko "DÔNG" (sine tụt + nhiễu da trống) - power 0.5…1.5.
    function taiko(power = 1, { vol = 1, at = 0 } = {}) {
        const a = get(); if (!a || vol <= 0) return;
        const t = a.currentTime + at, p = power * vol, o = a.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.35);
        const c = chain(o, { wet: 0.45 }); envl(c.g, t, 0.002, 0.8 * p, 0.03, 0.5); o.start(t); o.stop(t + 0.7);
        const s = noise(white, t, 0.1), c2 = chain(s, { wet: 0.3, nodes: [filt('bandpass', 900, 1.2)] }); envl(c2.g, t, 0.001, 0.3 * p, 0, 0.06);
    }
    function warm() { get(); }
    return { thud, whoosh, wind, crack, debris, rumble, portal, rustle, steps, chip, click, ding, pop, beam, rattle, shatter, freeze, zap, buzz,
        iceForm, creak, tinkle, glitch, clack, swirl, thunder, sizzle, boing, splat, vacuum, slurp, hose, slap, ghost, inflate, deflate, gloop, shimmer, taiko, warm };
}
