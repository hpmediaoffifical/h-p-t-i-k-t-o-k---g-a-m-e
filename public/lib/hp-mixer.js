/* 🎚 Bàn trộn âm — lớp nhân âm lượng chạy TRONG overlay (server tự chèn vào đầu <head> mọi /overlay/*,
 * xem lib/audio-mixer.js). Không sửa code game: nhân mọi âm thanh của trang với hệ số Tổng × kênh game.
 *  - <audio>/<video>/new Audio(): bọc thuộc tính volume (game đặt 0.8 → thật = 0.8 × hệ số; đọc lại vẫn 0.8)
 *  - Web Audio: ctx.destination trả về 1 GainNode nối tới loa thật → mọi nhánh nối vào đều qua hệ số
 *  - Giọng đọc (speechSynthesis): nhân utterance.volume lúc speak
 * Hệ số đến từ /api/mixer + socket 'mixer:state'. Lỗi gì cũng bỏ qua → game vẫn kêu như cũ. */
(function () {
    'use strict';
    if (window.__hpMixer) return;
    const me = document.currentScript;
    const GID = (me && me.dataset && me.dataset.game) || '';
    let gain = 1;
    const api = window.__hpMixer = { game: GID, get gain() { return gain; } };

    function compute(st) {
        const s = st || {};
        const m = s.master || {};
        const g = (s.games && s.games[GID]) || {};
        if (m.mute || g.mute) return 0;
        const mv = Number.isFinite(+m.vol) ? +m.vol : 100;
        const gv = Number.isFinite(+g.vol) ? +g.vol : 100;
        return Math.max(0, Math.min(1, (mv / 100) * (gv / 100)));
    }

    // ---- thẻ media ----
    const want = new WeakMap();
    const seen = new Set();
    let vDesc = null;
    try {
        vDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
        Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
            configurable: true, enumerable: true,
            get() { return want.has(this) ? want.get(this) : vDesc.get.call(this); },
            set(v) {
                const n = Math.max(0, Math.min(1, Number(v) || 0));
                want.set(this, n);
                seen.add(this);
                vDesc.set.call(this, n * gain);
            }
        });
        const play = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () {
            try { if (!want.has(this)) want.set(this, vDesc.get.call(this)); seen.add(this); vDesc.set.call(this, want.get(this) * gain); } catch (_) {}
            return play.apply(this, arguments);
        };
    } catch (_) { vDesc = null; }

    // ---- Web Audio ----
    const nodes = new WeakMap();
    const ctxs = new Set();
    try {
        const Base = window.BaseAudioContext || window.AudioContext;
        const dDesc = Base && Object.getOwnPropertyDescriptor(Base.prototype, 'destination');
        if (dDesc && dDesc.get) {
            Object.defineProperty(Base.prototype, 'destination', {
                configurable: true, enumerable: true,
                get() {
                    const real = dDesc.get.call(this);
                    if (window.OfflineAudioContext && this instanceof window.OfflineAudioContext) return real;
                    let g = nodes.get(this);
                    if (!g) {
                        g = this.createGain();
                        g.gain.value = gain;
                        g.connect(real);
                        try { g.maxChannelCount = real.maxChannelCount; } catch (_) {}
                        nodes.set(this, g);
                        ctxs.add(this);
                    }
                    return g;
                }
            });
        }
    } catch (_) {}

    // ---- giọng đọc ----
    try {
        const ss = window.speechSynthesis;
        if (ss && ss.speak) {
            const speak = ss.speak.bind(ss);
            ss.speak = function (u) {
                try { if (u) u.volume = Math.max(0, Math.min(1, (Number.isFinite(u.volume) ? u.volume : 1) * gain)); } catch (_) {}
                return speak(u);
            };
        }
    } catch (_) {}

    function apply(next) {
        if (next === gain) return;
        gain = next;
        if (vDesc) {
            for (const el of seen) {
                try {
                    if (el.ended && !el.isConnected) { seen.delete(el); continue; }
                    vDesc.set.call(el, (want.has(el) ? want.get(el) : 1) * gain);
                } catch (_) { seen.delete(el); }
            }
        }
        for (const c of ctxs) {
            const g = nodes.get(c);
            try { if (c.state === 'closed') { ctxs.delete(c); continue; } g.gain.setTargetAtTime(gain, c.currentTime, 0.05); } catch (_) {}
        }
    }
    api.apply = (st) => apply(compute(st));

    fetch('/api/mixer', { cache: 'no-store' }).then(r => r.json()).then(api.apply).catch(() => {});

    function listen() {
        try {
            // io() không forceNew → dùng chung kết nối socket của game nếu trang đã có
            const s = window.io({ reconnection: true });
            s.on('mixer:state', api.apply);
            s.on('connect', () => fetch('/api/mixer', { cache: 'no-store' }).then(r => r.json()).then(api.apply).catch(() => {}));
        } catch (_) {}
    }
    function boot() {
        if (window.io) return listen();
        const sc = document.createElement('script');
        sc.src = '/socket.io/socket.io.js';
        sc.onload = listen;
        (document.head || document.documentElement).appendChild(sc);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
