// 🎨 Giao diện mới — nhóm Thư viện Game ở sidebar. Thuần (chạy cả trình duyệt lẫn node test).
// Game mới chưa khai báo → "Game quà". Thêm game: thêm id vào nhóm hợp lý dưới đây.
(function (root) {
    const GROUPS = [
        { id: 'gift', label: 'Game quà' },
        { id: 'camera', label: 'Game Camera' },
        { id: 'tuongtac', label: 'Game Tương Tác' },
        { id: 'fx', label: 'Hiệu ứng & PK' },
        { id: 'tools', label: 'Công cụ' }
    ];
    const BY_ID = {
        camgames: 'camera',
        gametuongtac: 'tuongtac',
        pktiktok: 'fx', vipwelcome: 'fx', leaguecard: 'fx', 'obs-effects': 'fx',
        liveTranslate: 'tools', timer: 'tools', giftboard: 'tools'
    };
    function groupOf(id) { return BY_ID[id] || 'gift'; }
    function group(games) {
        return GROUPS
            .map(g => ({ id: g.id, label: g.label, items: games.filter(x => groupOf(x.id) === g.id) }))
            .filter(g => g.items.length);
    }
    const api = { GROUPS, groupOf, group };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.HpNavGroups = api;
})(typeof window !== 'undefined' ? window : globalThis);
