/* 🌐 hpT() — bản tối giản cho HP Action LIVE (app chỉ có tiếng Việt).
 * Các game camera port từ HP LIVE NPC gọi hpT('Câu tiếng Việt {bien}', { bien }) và nạp file này trước mọi script;
 * ở đây chỉ thay {biến}, không dịch. Giữ cùng giao diện window.hpI18n / window.hpT để chép code NPC sang không phải sửa.
 */
(function () {
    'use strict';
    if (window.hpT) return;
    function t(s, v) {
        return String(s).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, function (m, k) { return v && v[k] != null ? String(v[k]) : m; });
    }
    window.hpI18n = { lang: 'vi', scope: (document.currentScript && document.currentScript.dataset.scope) || 'app', t: t, apply: function () {} };
    window.hpT = t;
})();
