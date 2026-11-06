/* 📋 Overlay báo "tôi đang mở" cho Bảng Quà Tổng (server: lib/overlay-presence.js).
 * Gắn sau socket.io:  <script src="/lib/overlay-hello.js" data-game="<gameId>"></script>
 * - Dùng socket RIÊNG (không đụng socket của game), gửi `overlay:hello` lúc nối + nhắc lại mỗi 8s.
 * - Bỏ qua: xem trước trong app (?preview=1, ?review, ?demo=1), trang nằm trong iframe (panel app, hub Game Camera),
 *   trang /_prototype/ không có ?mode=overlay (đó là bảng điều khiển, không phải overlay).
 * - Trong OBS: nghe obsSourceActiveChanged (detail.active = đang lên Program) → gửi ngay.
 */
(function () {
    'use strict';
    var me = document.currentScript;
    var gameId = me && me.getAttribute('data-game');
    if (!gameId || typeof io !== 'function') return;
    var qs = new URLSearchParams(location.search);
    if (qs.get('preview') === '1' || qs.has('review') || qs.get('demo') === '1') return;
    if (location.pathname.indexOf('/_prototype/') === 0 && qs.get('mode') !== 'overlay') return;
    try { if (window.self !== window.top) return; } catch (e) { return; }

    var token = qs.get('token');
    var sock = io(token ? { auth: { token: token } } : undefined);
    var onAir = null;
    var obs = !!window.obsstudio;
    function hello() { if (sock.connected) sock.emit('overlay:hello', { gameId: gameId, onAir: onAir, obs: obs }); }
    sock.on('connect', hello);
    setInterval(hello, 8000);
    window.addEventListener('obsSourceActiveChanged', function (e) {
        var a = e && e.detail && e.detail.active;
        if (typeof a === 'boolean') { onAir = a; hello(); }
    });
})();
