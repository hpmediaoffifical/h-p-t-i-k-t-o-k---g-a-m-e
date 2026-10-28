/* 🔇 Gác cổng khung game camera - nạp TRƯỚC mọi script khác trong overlay của từng game (Đập Muỗi, Chém Trái Cây, Touch & Play).
 *
 * Lỗi gốc (2026-10-17): overlay mẹ /overlay/camgames giữ khung game ẨN mà vẫn chạy - mất kết nối app chỉ làm mờ khung,
 * game "nạp sẵn chờ phiên theo quà" / bị ẩn trong phiên game khác vẫn sống → Đập Muỗi cứ sinh muỗi nền và VO VE mãi
 * trong OBS tới khi tải lại link.
 *
 * Cách chữa chung: khung chỉ được KÊU khi đang được chơi.
 *   - Overlay mẹ postMessage { type: 'hp-cam-frame', active } mỗi khi khung hiện / ẩn / sắp gỡ / app mất kết nối.
 *   - Game tự báo mất kết nối app (link riêng): HpCamFrame.setOnline(false).
 *   - Không được chơi → MỌI AudioContext của khung bị suspend (kể cả tạo sau), resume() bị chặn; <audio>/<video> dừng.
 *   - Game đọc HpCamFrame.active để ngưng bước engine (không sinh muỗi / quả rơi khi bị ẩn).
 */
(function () {
    'use strict';
    if (window.HpCamFrame) return;
    let hub = true;       // overlay mẹ cho chạy (link riêng: luôn true)
    let online = true;    // còn nối app
    const ctxs = new Set();
    const subs = new Set();
    const isOn = () => hub && online;

    const Orig = window.AudioContext || window.webkitAudioContext;
    if (Orig) {
        const realResume = Orig.prototype.resume;
        const Guarded = function (...args) {
            const c = new Orig(...args);
            ctxs.add(c);
            // game hay gọi resume() lúc có quà / đập - bị ẩn thì không cho kêu lại
            c.resume = function () { return isOn() ? realResume.call(c) : Promise.resolve(); };
            c.__hpRealResume = realResume;
            if (!isOn()) c.suspend().catch(() => {});
            return c;
        };
        Guarded.prototype = Orig.prototype;
        window.AudioContext = Guarded;
        if (window.webkitAudioContext) window.webkitAudioContext = Guarded;
    }

    function apply() {
        const on = isOn();
        for (const c of ctxs) {
            if (c.state === 'closed') { ctxs.delete(c); continue; }
            if (on) { if (c.state === 'suspended') c.__hpRealResume.call(c).catch(() => {}); }
            else c.suspend().catch(() => {});
        }
        if (!on) document.querySelectorAll('audio, video').forEach(m => { try { m.pause(); } catch (e) {} });
        for (const fn of subs) { try { fn(on); } catch (e) {} }
    }

    window.addEventListener('message', (e) => {
        if (e.origin !== location.origin || !e.data || e.data.type !== 'hp-cam-frame') return;
        const v = e.data.active !== false;
        if (v !== hub) { hub = v; apply(); }
    });

    window.HpCamFrame = {
        get active() { return isOn(); },
        setOnline(v) { v = !!v; if (v !== online) { online = v; apply(); } },
        onChange(fn) { subs.add(fn); return () => subs.delete(fn); },
        get audioStates() { return [...ctxs].map(c => c.state); }   // soi / tự kiểm: trạng thái các AudioContext của khung
    };
})();
