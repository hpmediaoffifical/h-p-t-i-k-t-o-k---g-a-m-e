// 🎨 Biểu tượng nét (SVG 24×24, stroke = currentColor) cho từng game ở sidebar / danh sách.
// Tự vẽ, cùng một kiểu nét. Game mới: thêm 1 dòng `<id>: '<nội dung svg>'`; chưa có → biểu tượng mặc định.
// Thuần (chạy cả trình duyệt lẫn node test: tests/game-icons.test.js).
(function (root) {
    const P = (d) => `<path d="${d}"/>`;
    const C = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
    const ICONS = {
        thuytinh: P('M8 3h8M9 3v3a5 5 0 0 0-3 4.6V19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8.4A5 5 0 0 0 15 6V3') + C(10, 15, 1.4) + C(14, 12, 1.4),
        caro: P('M9 3v18M15 3v18M3 9h18M3 15h18') + C(12, 12, 1.6),
        pktiktok: P('M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M14.5 6.5 18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2'),
        vipwelcome: P('M3 19h18M4 16 3 7l5 4 4-6 4 6 5-4-1 9z'),
        votecomment: P('M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z') + P('m9 12 2 2 4-4'),
        quaivat: P('M12 3a7 7 0 0 0-7 7c0 2.4 1.2 4 3 5v3h8v-3c1.8-1 3-2.6 3-5a7 7 0 0 0-7-7zM10 18v3M14 18v3') + C(9.5, 10.5, 1.3) + C(14.5, 10.5, 1.3),
        nhatu: P('M4 3h16v18H4zM8 3v18M12 3v18M16 3v18'),
        creatoronline: P('M4 21V6l8-3 8 3v15M2 21h20M9 9h2M13 9h2M9 13h2M13 13h2M10 21v-4h4v4'),
        duongveque: P('M6 3h12a2 2 0 0 1 2 2v12H4V5a2 2 0 0 1 2-2zM4 11h16M7 17v3M17 17v3') + C(8, 14, 0.9) + C(16, 14, 0.9),
        nhietdo: P('M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0zM12 9v8'),
        bancung: C(11, 13, 8) + C(11, 13, 4) + P('M11 13 21 3M17 3h4v4'),
        trongcay: P('M12 21v-9M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 10c0-3 2.5-5 6-5 0 3-2.5 5-6 5zM7 21h10'),
        nhatla: P('M5 21c0-9 6-16 16-16 0 10-7 16-16 16zM5 21l9-9'),
        chemtraicay: P('M3 9h18a9 9 0 0 1-18 0zM6 9.5a6 6 0 0 0 12 0') + C(9, 13, 0.7) + C(12, 15, 0.7) + C(15, 13, 0.7),
        dapmuoi: P('M12 8v10M12 8V3M12 10c-3-4-7-3-7 0s4 3 7 1zM12 10c3-4 7-3 7 0s-4 3-7 1zM10 16l-3 4M14 16l3 4'),
        dacau: P('M12 21a3 3 0 0 0 3-3H9a3 3 0 0 0 3 3zM9 18 6 4M15 18l3-14M12 18V3M7.5 11h9'),
        body: C(12, 5, 2.5) + P('M12 8v7M7 11h10M12 15l-3 6M12 15l3 6'),
        camgames: P('M3 7h4l2-3h6l2 3h4v13H3z') + C(12, 13, 4),
        pokemon: C(12, 12, 9) + P('M3 12h6M15 12h6') + C(12, 12, 3),
        gametuongtac: P('M6 8h12a4 4 0 0 1 4 4v1a4 4 0 0 1-7 2.6L14 14h-4l-1 1.6A4 4 0 0 1 2 13v-1a4 4 0 0 1 4-4zM7 10.5v3M5.5 12h3') + C(16, 11.5, 0.8) + C(18, 13.5, 0.8),
        leaguecard: P('M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M10 17h4l1 4H9z'),
        liveTranslate: P('M4 5h8M8 3v2M6 5c0 4 3 7 6 8M10 5c0 3-3 7-6 8M13 21l4-10 4 10M14.5 17h5'),
        timer: C(12, 13, 8) + P('M12 9v4l2.5 2.5M9 2h6'),
        giftboard: P('M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8c-2-4-6-4-6-1s4 1 6 1M12 8c2-4 6-4 6-1s-4 1-6 1'),
        touchplay: P('M9 11V5a1.5 1.5 0 0 1 3 0v5M12 10V4a1.5 1.5 0 0 1 3 0v6M15 10a1.5 1.5 0 0 1 3 0v4a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.5-1.5L9 15'),
        levelquest: P('M4 6h16v4H4zM4 14h10v4H4zM7 6v4M7 14v4'),
        goibai: P('M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z'),
        luotchoi: P('M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z') + C(8.5, 8.5, 1) + C(15.5, 15.5, 1) + C(12, 12, 1),
        _default: P('M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z')
    };
    function has(id) { return Object.prototype.hasOwnProperty.call(ICONS, id) && id !== '_default'; }
    function svg(id, size = 18) {
        const body = has(id) ? ICONS[id] : ICONS._default;
        return `<svg class="hp-gico" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
    }
    const api = { ICONS, has, svg };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.HpGameIcons = api;
})(typeof window !== 'undefined' ? window : globalThis);
