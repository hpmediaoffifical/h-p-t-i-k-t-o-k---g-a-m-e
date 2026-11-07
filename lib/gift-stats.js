// 🎨 Gợi ý 7 — "Quà hôm nay": đếm quà THẬT theo ngày (giờ máy). Thuần, server gọi add() trong emitGift
// (quà đã gộp combo) và lưu toJSON() xuống <DATA_DIR>/gift-stats-today.json để mở lại app trong ngày không mất số.
'use strict';

function dayKey(ms) {
    const d = new Date(ms);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function createGiftStats({ now = Date.now } = {}) {
    let day = dayKey(now());
    let map = new Map();   // giftId → { giftId, name, image, count, coins }
    function roll() {
        const k = dayKey(now());
        if (k !== day) { day = k; map = new Map(); }
    }
    function add(g) {
        if (!g || g.source === 'test' || g.repeatEnd === false || g.giftId == null) return false;
        roll();
        const id = String(g.giftId);
        const n = Math.max(1, Number(g.repeatCount) || 1);
        const unit = Math.max(0, Number(g.coinValue) || 0);
        const cur = map.get(id) || { giftId: id, name: '', image: '', count: 0, coins: 0 };
        cur.name = String(g.giftName || (g.sheetItem && g.sheetItem.name) || cur.name || 'Quà');
        cur.image = String(g.image || g.giftPicture || cur.image || '');
        cur.count += n;
        cur.coins += unit * n;
        map.set(id, cur);
        return true;
    }
    function today(limit = 50) {
        roll();
        const items = [...map.values()].sort((a, b) => b.coins - a.coins || b.count - a.count).slice(0, limit).map(x => ({ ...x }));
        let totalCoins = 0, totalCount = 0;
        for (const x of map.values()) { totalCoins += x.coins; totalCount += x.count; }
        return { day, items, totalCoins, totalCount };
    }
    function toJSON() { return { day, items: [...map.values()] }; }
    function load(data) {
        roll();
        if (!data || data.day !== day || !Array.isArray(data.items)) return;
        map = new Map(data.items.filter(x => x && x.giftId != null).map(x => [String(x.giftId), { ...x, giftId: String(x.giftId) }]));
    }
    return { add, today, toJSON, load };
}

module.exports = { createGiftStats, dayKey };
