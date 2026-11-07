// 🎨 Giao diện mới — nhóm Thư viện Game ở sidebar. Thuần (chạy cả trình duyệt lẫn node test).
// Game mới chưa khai báo → "Game quà". Thêm game: thêm id vào nhóm hợp lý dưới đây.
(function (root) {
    const GROUPS = [
        { id: 'gift', label: 'Game quà' },
        { id: 'hubs', label: 'Nhóm game' },   // 🎥 Game Camera + 🎮 Game Tương Tác (mỗi mục mở menu game con)
        { id: 'fx', label: 'Hiệu ứng & PK' },
        { id: 'tools', label: 'Công cụ' }
    ];
    const BY_ID = {
        camgames: 'hubs',
        gametuongtac: 'hubs',
        pktiktok: 'fx', vipwelcome: 'fx', leaguecard: 'fx',
        liveTranslate: 'tools', timer: 'tools', giftboard: 'tools'
    };
    function groupOf(id) { return BY_ID[id] || 'gift'; }
    function group(games) {
        return GROUPS
            .map(g => ({ id: g.id, label: g.label, items: games.filter(x => groupOf(x.id) === g.id) }))
            .filter(g => g.items.length);
    }
    // Biểu tượng sidebar dạng ô chữ cái (thay emoji lệch cỡ): 2 chữ đầu của 2 từ đầu, bỏ emoji/ký hiệu
    function initials(name) {
        const words = String(name || '').split(/\s+/).map(w => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
        if (!words.length) return '?';
        const s = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0];
        // bỏ dấu thanh (huyền/sắc/ngã/hỏi/nặng), giữ chữ gốc Ư Ơ Â Ă Ê Ô Đ
        return s.normalize('NFD').replace(/[̣̀́̃̉]/g, '').normalize('NFC').toLocaleUpperCase('vi');
    }
    const api = { GROUPS, groupOf, group, initials };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.HpNavGroups = api;
})(typeof window !== 'undefined' ? window : globalThis);
