/* 🔊 Âm thanh hiệu ứng Đấu Trường Mini — TỰ TỔNG HỢP bằng Web Audio (không file, không nhạc nền).
 * Mỗi tiếng dựng từ dao động + nhiễu lọc + đường bao âm lượng, có ngẫu nhiên nhẹ cao độ để nghe tự nhiên, không lặp máy móc.
 * window.LcSfx.play(tên, opts) · .config({ on, volume }) · .unlock() (trình duyệt chỉ cho phát sau thao tác / OBS thì phát ngay).
 * Tên: press stick pull slide chomp boing clatter flip match miss pebble take capture quan shield trash seat start turn tick win draw
 */
(function () {
    'use strict';
    var ctx = null, master = null, comp = null, noiseBuf = null;
    var on = true, vol = 0.7;
    var lastAt = {};   // chống dồn cùng 1 tiếng trong vài chục ms (vd sỏi rơi dày)

    function init() {
        if (ctx) return ctx;
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.18;
        master = ctx.createGain(); master.gain.value = vol;
        master.connect(comp); comp.connect(ctx.destination);
        // 1 giây nhiễu trắng dùng chung
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        return ctx;
    }
    function unlock() { var c = init(); if (c && c.state === 'suspended') c.resume().catch(function () {}); }
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, unlock, { passive: true }); });

    var rnd = function (a, b) { return a + Math.random() * (b - a); };
    // đường bao: nhanh lên → giữ → tắt theo hàm mũ
    function env(g, t, peak, a, d) {
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
        g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
    function out(node, pan) {
        if (pan && ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.value = pan; node.connect(p); p.connect(master); return; }
        node.connect(master);
    }
    // nốt dao động: type, f0 → f1 (trượt), đỉnh, attack, decay
    function tone(t, type, f0, f1, peak, a, d, pan) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(f0, t);
        if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + d * 0.9);
        env(g, t, peak, a, d);
        o.connect(g); out(g, pan);
        o.start(t); o.stop(t + a + d + 0.05);
        return o;
    }
    // nhiễu lọc: kiểu lọc, tần số (có thể trượt), Q, đỉnh, attack, decay
    function noise(t, ftype, f0, f1, q, peak, a, d, pan) {
        var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        s.buffer = noiseBuf; s.loop = true;
        f.type = ftype; f.Q.value = q || 1; f.frequency.setValueAtTime(f0, t);
        if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + a + d);
        env(g, t, peak, a, d);
        s.connect(f); f.connect(g); out(g, pan);
        s.start(t, Math.random() * 0.5); s.stop(t + a + d + 0.05);
    }
    // tiếng gõ gỗ: cộng hưởng ngắn + vụn nhiễu cao
    function knock(t, f, peak, pan) {
        tone(t, 'triangle', f, f * 0.82, peak, 0.002, 0.09, pan);
        tone(t, 'sine', f * 2.7, f * 2.4, peak * 0.35, 0.001, 0.04, pan);
        noise(t, 'bandpass', f * 4, f * 3, 3, peak * 0.5, 0.001, 0.03, pan);
    }
    // tiếng sỏi chạm: tick cao trong + thân trầm ngắn
    function clack(t, peak, pan) {
        var f = rnd(2600, 4200);
        tone(t, 'sine', f, f * 0.9, peak, 0.001, 0.035, pan);
        noise(t, 'highpass', 3000, 3000, 0.7, peak * 0.55, 0.001, 0.025, pan);
        tone(t, 'triangle', rnd(420, 620), 300, peak * 0.4, 0.001, 0.05, pan);
    }
    // chuông kim loại (partial không hoà âm) — dùng cho ăn quan / khiên
    function bell(t, f, peak, d, pan) {
        [1, 2.01, 2.76, 4.07].forEach(function (m, i) { tone(t, 'sine', f * m, f * m, peak / (1 + i * 0.9), 0.003, d / (1 + i * 0.5), pan); });
    }

    var S = {
        // ấn răng / chạm ô: tách nhựa giòn
        press: function (t) { tone(t, 'square', rnd(1500, 1700), 900, 0.22, 0.001, 0.025); noise(t, 'bandpass', 2400, 1800, 2, 0.8, 0.001, 0.045); tone(t + 0.012, 'sine', 520, 380, 0.55, 0.002, 0.08); },
        tap: function (t) { S.press(t); },
        // que tre cắm vào lỗ chum: gõ gỗ + cọ nhẹ
        stick: function (t) { noise(t, 'bandpass', 1400, 700, 2, 0.25, 0.01, 0.12); knock(t + 0.1, rnd(330, 380), 0.55); },
        // rút thanh tre: tiếng cạ gỗ có rung + "cộc" cuối
        pull: function (t) {
            var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
            s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.Q.value = 4; f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(1500, t + 0.45);
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.04); g.gain.setValueAtTime(0.32, t + 0.38); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
            lfo.frequency.value = 38; lg.gain.value = 0.14; lfo.connect(lg); lg.connect(g.gain);
            s.connect(f); f.connect(g); out(g); s.start(t); s.stop(t + 0.55); lfo.start(t); lfo.stop(t + 0.55);
            knock(t + 0.46, 300, 0.4);
        },
        slide: function (t) { S.pull(t); },
        // hà mã ngoạm: hít gió → "phập" trầm + hai hàm va nhau
        chomp: function (t) {
            noise(t, 'lowpass', 600, 2400, 0.8, 0.25, 0.08, 0.06);
            tone(t + 0.13, 'sine', 160, 45, 0.9, 0.004, 0.32);
            noise(t + 0.13, 'lowpass', 900, 200, 1, 0.7, 0.002, 0.16);
            knock(t + 0.14, 520, 0.6); knock(t + 0.19, 460, 0.45);
            tone(t + 0.15, 'square', 90, 60, 0.12, 0.002, 0.12);
        },
        // cóc bật khỏi chum: "bốp" nút chai + lò xo "boing" có rung
        boing: function (t) {
            noise(t, 'bandpass', 1800, 900, 1.5, 0.6, 0.001, 0.05);
            tone(t, 'sine', 700, 700, 0.3, 0.001, 0.05);
            var o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
            o.type = 'triangle'; o.frequency.setValueAtTime(180, t + 0.04); o.frequency.exponentialRampToValueAtTime(620, t + 0.14); o.frequency.exponentialRampToValueAtTime(260, t + 0.7);
            lfo.frequency.setValueAtTime(18, t); lg.gain.setValueAtTime(60, t); lg.gain.exponentialRampToValueAtTime(4, t + 0.7);
            lfo.connect(lg); lg.connect(o.frequency);
            env(g, t + 0.04, 0.5, 0.01, 0.66); o.connect(g); out(g);
            o.start(t + 0.04); o.stop(t + 0.8); lfo.start(t + 0.04); lfo.stop(t + 0.8);
            // tiếng "ộp" cóc kêu
            tone(t + 0.55, 'sawtooth', 140, 110, 0.12, 0.01, 0.14); tone(t + 0.72, 'sawtooth', 150, 115, 0.1, 0.01, 0.12);
        },
        // tháp đổ: rắc → hàng loạt thanh gỗ rơi lộp cộp, thưa dần + tiếng ầm nền
        clatter: function (t) {
            noise(t, 'highpass', 2500, 1200, 0.8, 0.3, 0.002, 0.08);
            tone(t + 0.05, 'sine', 110, 50, 0.5, 0.01, 0.6);
            noise(t + 0.05, 'lowpass', 500, 150, 0.7, 0.35, 0.02, 0.9);
            for (var i = 0; i < 26; i++) {
                var dt = 0.06 + Math.pow(i / 26, 1.6) * 1.6 + rnd(-0.02, 0.03);
                knock(t + dt, rnd(240, 520), 0.55 * (1 - i / 32), rnd(-0.6, 0.6));
            }
        },
        // lật thẻ: phẩy gió + tách giấy cứng
        flip: function (t) { noise(t, 'bandpass', 900, 3200, 1.2, 0.3, 0.03, 0.12); tone(t + 0.15, 'square', 2100, 1500, 0.06, 0.001, 0.02); noise(t + 0.15, 'highpass', 4000, 4000, 0.7, 0.35, 0.001, 0.03); },
        // trúng cặp: hợp âm rải sáng + lấp lánh
        match: function (t) {
            [784, 988, 1175, 1568].forEach(function (f, i) { tone(t + i * 0.07, 'triangle', f, f, 0.32, 0.005, 0.38); tone(t + i * 0.07, 'sine', f * 2, f * 2, 0.08, 0.004, 0.2); });
            for (var i = 0; i < 8; i++) tone(t + 0.25 + i * 0.035, 'sine', rnd(2500, 5200), null, 0.06, 0.002, 0.1, rnd(-0.7, 0.7));
        },
        // trật: hai nốt đi xuống mềm "bùm bụp"
        miss: function (t) { tone(t, 'triangle', 392, 370, 0.3, 0.008, 0.16); tone(t + 0.17, 'triangle', 294, 250, 0.3, 0.008, 0.3); },
        // sỏi rơi vào ô
        pebble: function (t) { clack(t, rnd(0.5, 0.65), rnd(-0.4, 0.4)); if (Math.random() < 0.35) clack(t + rnd(0.02, 0.05), 0.15, rnd(-0.4, 0.4)); },
        // bốc cả nắm sỏi: lạo xạo nhiều viên
        take: function (t) { noise(t, 'bandpass', 2600, 1800, 1.4, 0.2, 0.02, 0.18); for (var i = 0; i < 6; i++) clack(t + i * rnd(0.018, 0.04), 0.22, rnd(-0.5, 0.5)); },
        // ăn quân: gom sỏi + 2 nốt thưởng
        capture: function (t) { S.take(t); tone(t + 0.12, 'triangle', 1047, 1047, 0.28, 0.004, 0.18); tone(t + 0.22, 'triangle', 1568, 1568, 0.3, 0.004, 0.35); },
        // ăn quan: chuông lớn + lấp lánh
        quan: function (t) {
            S.take(t); bell(t + 0.1, 660, 0.5, 1.4); bell(t + 0.28, 990, 0.35, 1.2);
            for (var i = 0; i < 12; i++) tone(t + 0.3 + i * 0.04, 'sine', rnd(2800, 6000), null, 0.05, 0.002, 0.12, rnd(-0.8, 0.8));
        },
        // khiên: quét sáng đi lên + chuông nhỏ
        shield: function (t) { noise(t, 'bandpass', 600, 5000, 3, 0.22, 0.05, 0.35); bell(t + 0.12, 1320, 0.25, 0.8); tone(t, 'sine', 440, 880, 0.15, 0.04, 0.35); },
        // bị loại → thùng rác: vèo xuống + "keng" nắp thùng kim loại
        trash: function (t) {
            noise(t, 'bandpass', 3000, 400, 1.5, 0.35, 0.03, 0.4);
            tone(t, 'sine', 900, 200, 0.18, 0.02, 0.4);
            bell(t + 0.45, 310, 0.35, 0.5); noise(t + 0.45, 'bandpass', 1800, 1200, 4, 0.3, 0.001, 0.12); tone(t + 0.45, 'sine', 90, 50, 0.4, 0.003, 0.18);
        },
        // vào ghế: "bộp" mềm vui tai
        seat: function (t) { tone(t, 'sine', 300, 620, 0.6, 0.004, 0.1); tone(t + 0.06, 'sine', 620, 900, 0.32, 0.004, 0.1); },
        // bắt đầu ván: trống bass + quét lên + chũm chọe nhẹ (không phải nhạc)
        start: function (t) { tone(t, 'sine', 140, 50, 0.8, 0.003, 0.35); noise(t, 'bandpass', 300, 4000, 1.2, 0.25, 0.25, 0.1); noise(t + 0.34, 'highpass', 6000, 6000, 0.7, 0.3, 0.004, 0.5); tone(t + 0.34, 'triangle', 880, 880, 0.2, 0.004, 0.3); },
        // tới lượt: ping 2 nốt nhẹ
        turn: function (t) { tone(t, 'sine', 988, 988, 0.18, 0.004, 0.14); tone(t + 0.09, 'sine', 1319, 1319, 0.16, 0.004, 0.22); },
        // đếm ngược 5 giây cuối: mõ gỗ (giây cuối cao hơn)
        tick: function (t, o) { knock(t, (o && o.last) ? 1100 : 820, 0.4); },
        // vô địch: kèn ngắn hợp âm trưởng + trống + pháo giấy (đoạn hiệu ứng ~1,3 s, không phải nhạc nền)
        win: function (t) {
            tone(t, 'sine', 120, 45, 0.7, 0.003, 0.4);
            [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.32]].forEach(function (n) {
                var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
                [0, 4, -4].forEach(function (cents) {
                    var o = ctx.createOscillator(), g = ctx.createGain();
                    o.type = 'sawtooth'; o.frequency.value = n[0]; o.detune.value = cents;
                    env(g, t + n[1], 0.09, 0.02, n[1] > 0.3 ? 0.9 : 0.3); o.connect(g); g.connect(f);
                    o.start(t + n[1]); o.stop(t + n[1] + 1.1);
                });
                out(f);
            });
            noise(t + 0.32, 'highpass', 5000, 5000, 0.7, 0.3, 0.004, 0.7);
            for (var i = 0; i < 14; i++) noise(t + 0.4 + i * rnd(0.03, 0.07), 'bandpass', rnd(2000, 5000), null, 6, 0.12, 0.001, 0.04);
        },
        draw: function (t) { tone(t, 'triangle', 523, 523, 0.25, 0.01, 0.25); tone(t + 0.18, 'triangle', 523, 523, 0.25, 0.01, 0.4); }
    };

    function play(name, o) {
        if (!on || vol <= 0 || !S[name]) return;
        var c = init();
        if (!c) return;
        if (c.state === 'suspended') c.resume().catch(function () {});
        var nowMs = performance.now();
        if (lastAt[name] && nowMs - lastAt[name] < 28) return;
        lastAt[name] = nowMs;
        try { S[name](c.currentTime + 0.01 + ((o && o.delay) || 0), o || {}); } catch (e) {}
    }
    function config(c) {
        if (!c) return;
        if (c.on != null) on = !!c.on;
        if (c.volume != null) vol = Math.max(0, Math.min(1, Number(c.volume)));
        if (master) master.gain.value = vol;
    }
    // kiểm thử: dựng 1 tiếng trong OfflineAudioContext → { peak, rms, ms có tiếng } (không phát ra loa)
    function measure(name, secs) {
        secs = secs || 2.5;
        var saved = [ctx, master, comp, noiseBuf];
        var off = new OfflineAudioContext(1, Math.round(44100 * secs), 44100);
        ctx = off;
        comp = off.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.18;
        master = off.createGain(); master.gain.value = 0.7; master.connect(comp); comp.connect(off.destination);
        noiseBuf = off.createBuffer(1, 44100, 44100); var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        try { S[name](0.01, {}); } finally { ctx = saved[0]; master = saved[1]; comp = saved[2]; noiseBuf = saved[3]; }
        return off.startRendering().then(function (buf) {
            var x = buf.getChannelData(0), peak = 0, sum = 0, last = 0;
            for (var j = 0; j < x.length; j++) { var a = Math.abs(x[j]); if (a > peak) peak = a; sum += a * a; if (a > 0.01) last = j; }
            return { name: name, peak: +peak.toFixed(3), rms: +Math.sqrt(sum / x.length).toFixed(4), ms: Math.round(last / 44.1) };
        });
    }
    window.LcSfx = { play: play, config: config, unlock: unlock, measure: measure, names: Object.keys(S) };
})();
