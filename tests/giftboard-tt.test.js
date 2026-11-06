const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const T = require('../lib/giftboard-tt');

const GAMES_DIR = path.join(__dirname, '..', 'public', 'games');
const cat = new Map([['5655', { name: 'Rose', image: 'rose.png', diamonds: 1 }]]);

test('loadLabels: nạp nhãn thật của 4 game (ES module + data.json)', async () => {
    const L = await T.loadLabels(GAMES_DIR);
    assert.strictEqual(L.err, undefined);
    assert.ok(L.quaivat.length > 10 && L.quaivat.some(d => d.action === 'rose'));
    assert.ok(L.nhatu.boss && L.nhatu.boss.label);
    assert.ok(Object.keys(L.creatoronline).length > 5);
    assert.match(L.duongveque.wind.label, /^Cứu: /);
});

test('fromMap: quà gán theo hành động → dòng có nhãn; hành động lạ / quà thiếu id bỏ', () => {
    const rows = T.fromMap({ boss: [{ giftId: '5655' }, { giftName: 'chỉ tên' }], lạ: [{ giftId: '1' }] },
        { boss: { emoji: '👑', label: 'Lên làm Đại Ca' } }, cat);
    assert.deepStrictEqual(rows, [{ giftId: '5655', name: 'Rose', image: 'rose.png', diamonds: 1, emoji: '', label: '👑 Lên làm Đại Ca' }]);
});

test('quaivatRows: gán tay thắng quà mặc định; opt chỉ hiện khi gán; time theo đồng hồ', () => {
    const defs = [
        { action: 'rose', emoji: '🌹', label: 'Khoai lăn', ids: [5655], gift: 'Hoa hồng', coins: 1 },
        { action: 'win', emoji: '🏆', label: 'Thắng ngay', ids: [999], opt: true },
        { action: 'time', emoji: '⏱', label: 'Thêm giờ', ids: [777] }
    ];
    let rows = T.quaivatRows({ qvHold: false }, defs, cat);
    assert.deepStrictEqual(rows.map(r => [r.giftId, r.label]), [['5655', '🌹 Khoai lăn']]);
    rows = T.quaivatRows({ qvGiftMap: { rose: [{ giftId: '42' }], win: [{ giftId: '43' }] }, qvTimerOn: true }, defs, cat);
    assert.deepStrictEqual(rows.map(r => r.giftId), ['42', '43', '777']);
});

test('pokemonRows: quà đặc biệt theo giftId + mốc xu thành dòng chung', () => {
    const rows = T.pokemonRows({
        specials: [{ giftId: '6369', labelVi: 'Sư tử', balls: 1, maxLevel: 100, vip: true, legendary: true }, { giftId: '1', enabled: false, labelVi: 'Tắt' }],
        tiers: [{ minCoins: 1, maxLevel: 12, balls: 1, labelVi: 'Quà 1 - 4 xu' }, { minCoins: 5, maxLevel: 20, balls: 1 }]
    }, cat);
    assert.strictEqual(rows[0].giftId, '6369');
    assert.strictEqual(rows[0].label, 'Sư tử: 1 bóng + Ghế VIP + Huyền Thoại');
    assert.deepStrictEqual(rows.slice(1).map(r => [r.giftId, r.name, r.label]), [['', 'Quà 1 - 4 xu', '1 bóng Lv.12'], ['', 'Quà 5+ xu', '1 bóng Lv.20']]);
});

test('buildTtGifts: running theo enabled, Nhà Tù chế độ off thì không chạy; Creator Online có dòng quà khác', () => {
    const r = T.buildTtGifts({ quaivat: { enabled: false }, nhatu: { enabled: true, ntMode: 'off' }, pokemon: {}, creatoronline: {}, duongveque: { enabled: true } }, {}, cat);
    assert.deepStrictEqual(r.running, { quaivat: false, nhatu: false, pokemon: true, creatoronline: true, duongveque: true });
    assert.deepStrictEqual(r.games.creatoronline.map(x => x.label), ['Lên sân khấu']);
});
