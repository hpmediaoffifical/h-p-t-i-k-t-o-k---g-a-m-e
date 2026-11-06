const test = require('node:test');
const assert = require('node:assert');
const C = require('../public/lib/giftboard-collect.js');

test('collect: Hũ trigger + Caro đăng ký + Trồng Cây theo xu → đúng nhãn', () => {
    const rows = C.collect({
        games: {
            thuytinh: { config: { triggers: { 5655: 'thief', 1: 'tilt' } } },
            caro: { config: { registration: { giftId: '5269', minCount: 3 } } },
            trongcay: { config: { growthMode: 'perCoin', perCoinGrowth: 2 } }
        },
        catalog: { 5655: { name: 'Rose', image: 'r.png', diamond: 1 } }
    });
    assert.deepStrictEqual(rows.map(r => [r.gameId, r.giftId, r.label, r.tag]), [
        ['thuytinh', '5655', 'Trộm', ''],
        ['caro', '5269', 'Đăng ký đấu Caro', '×3'],
        ['trongcay', '', 'Mọi quà: cây cao +2% mỗi xu', '']
    ]);
    assert.strictEqual(rows[0].giftName, 'Rose');
});

test('collect: quà Game Camera / Game Tương Tác từ dữ liệu server; mục không giftId = dòng chung', () => {
    const rows = C.collect({
        camData: { games: { chemtraicay: [{ giftId: '7', name: 'Táo quà', label: '🍎 Táo' }] } },
        ttData: { games: { nhatu: [{ giftId: '9', name: 'Mũ', label: '👑 Lên làm Đại Ca' }], creatoronline: [{ giftId: '', name: 'Quà khác', label: 'Lên sân khấu' }] } }
    });
    assert.deepStrictEqual(rows.map(r => [r.gameId, r.giftId, r.generic, r.label]), [
        ['chemtraicay', '7', false, '🍎 Táo'],
        ['nhatu', '9', false, '👑 Lên làm Đại Ca'],
        ['creatoronline', '', true, 'Quà khác: Lên sân khấu']
    ]);
});
