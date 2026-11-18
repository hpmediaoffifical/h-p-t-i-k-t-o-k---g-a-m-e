'use strict';
/**
 * 🎁 Săn Cặp Quà — `pairs` cặp hình QUÀ TIKTOK úp ngẫu nhiên (mặt thẻ = id quà, overlay lấy ảnh quà thật từ /api/gifts). Mỗi lượt lật 2 ô: trùng → giữ ngửa (+1 điểm, đi tiếp),
 * trật → chờ settle() úp lại. view() không lộ hình ô đang úp.
 */
const { clampInt, shuffle } = require('./util');

const GIFTS = [   // 8 quà chủ LIVE chọn (sheet quà, tab gift) — id TikTok; emoji = dự phòng khi chưa tải được ảnh
    { id: '5655', name: 'Hoa hồng', emoji: '🌹', coin: 1 },
    { id: '7934', name: 'Thả tim', emoji: '💗', coin: 1 },
    { id: '5269', name: 'TikTok', emoji: '🎵', coin: 1 },
    { id: '7122', name: 'Súng đá quý', emoji: '💎', coin: 500 },
    { id: '7168', name: 'Súng bắn tiền', emoji: '💸', coin: 500 },
    { id: '6369', name: 'Sư tử', emoji: '🦁', coin: 29999 },
    { id: '9092', name: 'Phượng hoàng lửa', emoji: '🔥', coin: 41999 },
    { id: '9072', name: 'TikTok Universe', emoji: '🌌', coin: 44999 }
];
const GIFT_BY_ID = Object.fromEntries(GIFTS.map(g => [g.id, g]));
const FACES = GIFTS.map(g => g.id);
const LO = 4, HI = GIFTS.length, DFLT = 8;   // tối đa = số quà (8 cặp, 16 thẻ)

function options(b) {
    if (b.pendingMiss) return [];
    const out = [];
    b.faces.forEach((_, i) => { if (!b.matched[i] && !b.open.includes(i)) out.push(i + 1); });
    return out;
}

module.exports = {
    id: 'latcap', kind: 'score', perTurn: 2, sizeKey: 'pairs', name: 'Săn Cặp Quà', icon: '🎁', unit: 'ô', FACES, GIFTS,
    normalize(c) { return { pairs: clampInt(c && c.pairs, LO, HI, DFLT) }; },
    setup(gc, rng) {
        const pairs = clampInt(gc && gc.pairs, LO, HI, DFLT);
        const pool = shuffle(FACES.slice(), rng).slice(0, pairs);
        const faces = shuffle(pool.concat(pool), rng);
        return { pairs, faces, matched: faces.map(() => false), open: [], pendingMiss: false, last: [] };
    },
    options,
    pick(b, n) {
        n = Number(n);
        if (b.pendingMiss) return { ok: false, reason: 'busy' };
        if (!Number.isInteger(n) || n < 1 || n > b.faces.length) return { ok: false, reason: 'range' };
        const i = n - 1;
        if (b.matched[i] || b.open.includes(i)) return { ok: false, reason: 'used' };
        b.open.push(i);
        if (b.open.length === 1) { b.last = [n]; return { ok: true, outcome: 'pending' }; }
        const [a, c] = b.open;
        b.last = [a + 1, c + 1];
        if (b.faces[a] === b.faces[c]) { b.matched[a] = b.matched[c] = true; b.open = []; return { ok: true, outcome: 'match' }; }
        b.pendingMiss = true;
        return { ok: true, outcome: 'miss' };
    },
    // đổi người giữa chừng (bị mời khỏi ghế) → úp ô lẻ đang ngửa
    endTurn(b) { if (!b.pendingMiss) b.open = []; },
    // nhãn tên chỉ giữ trên ô đang ngửa / đã ghép (ô úp lại thì bỏ)
    marked(b, n) { const i = Number(n) - 1; return !!b.matched[i] || b.open.includes(i); },
    settle(b) { if (b.pendingMiss) { b.open = []; b.pendingMiss = false; } },
    done(b) { return b.matched.every(Boolean); },
    view(b) {
        return { kind: 'latcap', pairs: b.pairs, last: b.last.slice(), pendingMiss: b.pendingMiss,
            cards: b.faces.map((f, i) => {
                const c = { n: i + 1, matched: b.matched[i], open: b.open.includes(i) };
                if (c.matched || c.open) { c.face = f; const g = GIFT_BY_ID[f]; if (g) c.gift = { id: g.id, name: g.name, emoji: g.emoji, coin: g.coin }; }
                return c;
            }) };
    }
};
