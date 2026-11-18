/* 🎲 Đấu Trường Mini — bàn tay vẽ bằng SVG (tự thiết kế) cho phần diễn: tay bay vào bấm / rút / lật / rải quân.
 * window.LcHandArt(kind) → chuỗi SVG. kind: 'point' (ngón trỏ chỉ lên — đầu ngón ở (52, 2) của khung 140×200),
 * 'sow' (cùng bàn tay, overlay xoay 180° để úp xuống rải quân), 'stick' (que tre cho Dê Núi).
 * Có ảnh vẽ tay (assets/manifest.json → "hand": "hand.png", đầu ngón ở giữa mép trên ảnh) thì dùng ảnh thay SVG.
 * Brief vẽ ảnh: art-requests/dau-truong-mini/BRIEF-DAU-TRUONG-MINI.md. */
(function () {
    'use strict';
    var uid = 0;
    function hand() {
        var id = 'lch' + (++uid);
        return '<svg viewBox="0 0 140 200" width="140" height="200">' +
            '<defs>' +
            '<linearGradient id="' + id + 's" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffe2c9"/><stop offset=".55" stop-color="#f7c3a0"/><stop offset="1" stop-color="#e09a74"/></linearGradient>' +
            '<linearGradient id="' + id + 'c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6b9d"/><stop offset="1" stop-color="#c72f68"/></linearGradient>' +
            '<radialGradient id="' + id + 'h" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
            '</defs>' +
            // ngón trỏ
            '<path d="M40 24 Q40 3 52 3 Q64 3 64 24 L67 98 L37 98 Z" fill="url(#' + id + 's)" stroke="#8a5238" stroke-width="3" stroke-linejoin="round"/>' +
            '<ellipse cx="52" cy="15" rx="7.5" ry="9.5" fill="#ffeee3" stroke="#d69a7e" stroke-width="1.5"/>' +
            '<path d="M44 44 Q52 48 60 44 M44 66 Q52 70 60 66" fill="none" stroke="#c98463" stroke-width="2" stroke-linecap="round"/>' +
            // lòng bàn tay + 3 ngón co
            '<path d="M30 92 Q28 76 42 76 L98 76 Q120 78 120 102 L120 142 Q120 174 88 178 L56 178 Q28 174 28 142 Z" fill="url(#' + id + 's)" stroke="#8a5238" stroke-width="3" stroke-linejoin="round"/>' +
            '<path d="M66 78 Q66 104 72 112 Q82 118 86 106 L86 78 M86 80 Q86 106 92 112 Q102 116 104 104 L104 82 M104 84 Q104 104 109 108 Q118 110 119 98" fill="url(#' + id + 's)" stroke="#8a5238" stroke-width="2.6" stroke-linejoin="round"/>' +
            '<path d="M70 98 Q76 102 82 98 M90 98 Q96 101 100 97 M107 96 Q112 98 116 95" fill="none" stroke="#c98463" stroke-width="2" stroke-linecap="round"/>' +
            // ngón cái ôm bên trái
            '<path d="M32 104 Q10 110 14 132 Q18 150 40 142 Q52 136 48 120 Z" fill="url(#' + id + 's)" stroke="#8a5238" stroke-width="3" stroke-linejoin="round"/>' +
            '<ellipse cx="22" cy="132" rx="5" ry="6.5" fill="#ffeee3" stroke="#d69a7e" stroke-width="1.2" transform="rotate(-30 22 132)"/>' +
            // ánh sáng + bóng mép phải
            '<path d="M44 82 Q60 80 74 84 L72 150 Q56 156 42 148 Z" fill="url(#' + id + 'h)"/>' +
            '<path d="M112 110 Q118 140 108 166" fill="none" stroke="#c98463" stroke-width="3" stroke-linecap="round" opacity=".6"/>' +
            // tay áo
            '<rect x="22" y="168" width="104" height="32" rx="12" fill="url(#' + id + 'c)" stroke="#7a1c43" stroke-width="3"/>' +
            '<rect x="22" y="178" width="104" height="6" fill="#fff" opacity=".85"/>' +
            '</svg>';
    }
    function stick() {
        return '<svg viewBox="0 0 60 236" width="60" height="236">' +
            '<defs><linearGradient id="lcbam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5f8a26"/><stop offset=".45" stop-color="#bfe37a"/><stop offset="1" stop-color="#4d7419"/></linearGradient></defs>' +
            '<rect x="22" y="0" width="16" height="220" rx="8" fill="url(#lcbam)" stroke="#3d5e14" stroke-width="2"/>' +
            '<rect x="21" y="52" width="18" height="6" rx="3" fill="#4d7419"/><rect x="21" y="118" width="18" height="6" rx="3" fill="#4d7419"/><rect x="21" y="184" width="18" height="6" rx="3" fill="#4d7419"/>' +
            '<path d="M22 214 L30 234 L38 214 Z" fill="#d6b77a" stroke="#8a6a32" stroke-width="2"/></svg>';
    }
    window.LcHandArt = function (kind) {
        var a = window.__lcAssets || {};
        if (kind === 'stick') return a.stick ? '<img src="' + a.stick + '" alt="">' : stick();
        return a.hand ? '<img class="lc-hand-img" src="' + a.hand + '" alt="">' : hand();
    };
    // ảnh vẽ tay thay thế (không bắt buộc): public/games/luotchoi/assets/manifest.json
    try {
        fetch('/games/luotchoi/assets/manifest.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
            if (!m) return;
            var out = {};
            Object.keys(m).forEach(function (k) { if (typeof m[k] === 'string' && /^[\w.-]+$/.test(m[k])) out[k] = '/games/luotchoi/assets/' + m[k]; });
            window.__lcAssets = out;
            window.dispatchEvent(new Event('lc:assets'));
        }).catch(function () {});
    } catch (e) {}
})();
