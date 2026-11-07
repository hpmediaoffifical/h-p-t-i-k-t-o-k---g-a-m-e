// 🎨 Gợi ý 7 — "Quà hôm nay": đếm quà theo ngày (lib/gift-stats.js)
const test = require('node:test');
const assert = require('node:assert');
const { createGiftStats } = require('../lib/gift-stats.js');

test('cộng dồn theo giftId: lượt = repeatCount, xu = coinValue × lượt; xếp theo xu giảm dần', () => {
    let now = new Date(2026, 10, 7, 20, 0).getTime();
    const s = createGiftStats({ now: () => now });
    s.add({ giftId: 5655, giftName: 'Rose', repeatCount: 10, coinValue: 1 });
    s.add({ giftId: 5655, giftName: 'Rose', repeatCount: 5, coinValue: 1 });
    s.add({ giftId: 6064, giftName: 'Galaxy', repeatCount: 1, coinValue: 1000 });
    const t = s.today();
    assert.deepStrictEqual(t.items.map(i => [i.giftId, i.count, i.coins]), [['6064', 1, 1000], ['5655', 15, 15]]);
    assert.strictEqual(t.totalCoins, 1015);
    assert.strictEqual(t.totalCount, 16);
    assert.strictEqual(t.items[1].name, 'Rose');
});

test('bỏ quà thử (source test) và quà combo dở (repeatEnd false)', () => {
    const s = createGiftStats({ now: () => 0 });
    s.add({ giftId: 1, giftName: 'A', repeatCount: 3, coinValue: 1, source: 'test' });
    s.add({ giftId: 1, giftName: 'A', repeatCount: 3, coinValue: 1, repeatEnd: false });
    assert.strictEqual(s.today().items.length, 0);
});

test('qua ngày mới (giờ máy) thì đếm lại từ 0; load() bỏ dữ liệu ngày cũ', () => {
    let now = new Date(2026, 10, 7, 23, 59).getTime();
    const s = createGiftStats({ now: () => now });
    s.add({ giftId: 1, giftName: 'A', repeatCount: 2, coinValue: 5 });
    const saved = s.toJSON();
    now = new Date(2026, 10, 8, 0, 1).getTime();
    assert.strictEqual(s.today().items.length, 0);
    const s2 = createGiftStats({ now: () => now });
    s2.load(saved);
    assert.strictEqual(s2.today().items.length, 0, 'dữ liệu hôm qua không được nạp');
    now = new Date(2026, 10, 7, 23, 59, 30).getTime();
    const s3 = createGiftStats({ now: () => now });
    s3.load(saved);
    assert.strictEqual(s3.today().totalCoins, 10, 'cùng ngày thì nạp lại được');
});
