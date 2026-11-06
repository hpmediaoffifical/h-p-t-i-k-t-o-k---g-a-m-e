/* 📋 Overlay báo "tôi đang mở" cho Bảng Quà Tổng (server: lib/overlay-presence.js) + nhận lệnh ẩn bảng quà riêng.
 * Gắn sau socket.io:  <script src="/lib/overlay-hello.js" data-game="<gameId>"></script>
 *   data-presence="0": CHỈ NGHE (trang bảng quà riêng như /overlay/nhatla-gifts — không tính game "đang mở").
 * - Dùng socket RIÊNG (không đụng socket của game), gửi `overlay:hello` lúc nối + nhắc lại mỗi 8s.
 * - Không báo: xem trước trong app (?preview=1, ?review, ?demo=1), trang trong iframe (panel app, hub Game Camera),
 *   trang /_prototype/ không có ?mode=overlay (đó là bảng điều khiển, không phải overlay).
 * - Trong OBS: nghe obsSourceActiveChanged (detail.active = đang lên Program) → gửi ngay.
 * - Bảng Quà Tổng đang mở trên OBS → server phát `giftboard:active {on}` → thêm class `gb-active` vào <html> +
 *   bắn sự kiện window `hp:giftboard-active` {detail:{on}}: game ẩn bảng quà riêng (không đổi config đã lưu).
 */
(function () {
    'use strict';
    var me = document.currentScript;
    var gameId = me && me.getAttribute('data-game');
    if (!gameId || typeof io !== 'function') return;
    var qs = new URLSearchParams(location.search);
    if (qs.get('preview') === '1' || qs.has('review') || qs.get('demo') === '1') return;
    if (location.pathname.indexOf('/_prototype/') === 0 && qs.get('mode') !== 'overlay') return;
    var inFrame = true;
    try { inFrame = window.self !== window.top; } catch (e) { inFrame = true; }
    var say = !inFrame && me.getAttribute('data-presence') !== '0';

    var token = qs.get('token');
    var sock = io(token ? { auth: { token: token } } : undefined);
    var onAir = null;
    var obs = !!window.obsstudio;
    function hello() { if (say && sock.connected) sock.emit('overlay:hello', { gameId: gameId, onAir: onAir, obs: obs }); }
    sock.on('connect', hello);
    if (say) setInterval(hello, 8000);
    window.addEventListener('obsSourceActiveChanged', function (e) {
        var a = e && e.detail && e.detail.active;
        if (typeof a === 'boolean') { onAir = a; hello(); }
    });
    window.__hpGiftboardActive = false;
    sock.on('giftboard:active', function (d) {
        var on = !!(d && d.on);
        if (gameId === 'giftboard' || on === window.__hpGiftboardActive) return;
        window.__hpGiftboardActive = on;
        document.documentElement.classList.toggle('gb-active', on);
        try { window.dispatchEvent(new CustomEvent('hp:giftboard-active', { detail: { on: on } })); } catch (e) {}
    });
})();
