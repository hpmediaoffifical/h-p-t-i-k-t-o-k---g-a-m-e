// 🎨 Giao diện mới — bảng lệnh Ctrl K (public/ui/cmdk.js): lọc game theo tên, bỏ dấu.
const test = require('node:test');
const assert = require('node:assert');
const { match, fold } = require('../public/ui/cmdk.js');

const ITEMS = [
    { id: 'thuytinh', name: 'Hũ Thủy Tinh' },
    { id: 'caro', name: 'Caro Đối Đầu' },
    { id: 'pktiktok', name: 'Hiệu ứng PK' },
    { id: 'liveTranslate', name: 'Dịch Thuật LIVE' }
];

test('fold bỏ dấu + chữ thường, đ → d', () => {
    assert.strictEqual(fold('Hũ Thủy Tinh'), 'hu thuy tinh');
    assert.strictEqual(fold('Đối Đầu'), 'doi dau');
});

test('match: gõ không dấu vẫn khớp, rỗng trả tất cả', () => {
    assert.deepStrictEqual(match('hu', ITEMS).map(x => x.id), ['thuytinh']);
    assert.deepStrictEqual(match('doi dau', ITEMS).map(x => x.id), ['caro']);
    assert.deepStrictEqual(match('  ', ITEMS).map(x => x.id), ITEMS.map(x => x.id));
});

test('match: khớp đầu tên xếp trước khớp giữa; khớp cả id', () => {
    const out = match('t', ITEMS).map(x => x.id);
    assert.ok(out.indexOf('thuytinh') < out.indexOf('liveTranslate'));
    assert.deepStrictEqual(match('pktik', ITEMS).map(x => x.id), ['pktiktok']);
});
