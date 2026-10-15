const test = require('node:test');
const assert = require('node:assert/strict');
const JT = require('../public/games/thuytinh/jar-text.js');

test('normalizeItem: giá trị lạ → mặc định, kẹp biên', () => {
    const it = JT.normalizeItem({ id: 'a', text: 'x'.repeat(99), style: 'nope', anim: 'zzz', x: 999, y: -99, size: 99, rot: -90, color: 'red' });
    assert.equal(it.text.length, JT.MAX_LEN);
    assert.equal(it.style, 'candy');
    assert.equal(it.anim, 'none');
    assert.deepEqual([it.x, it.y, it.size, it.rot], [150, -50, 30, -45]);
    assert.equal(it.color, '');
});

test('normalizeItem: giữ màu hex, bỏ \\r, giữ xuống dòng', () => {
    const it = JT.normalizeItem({ id: 'b', text: 'HP\r\nLIVE', style: 'neon', color: '#AABBCC' });
    assert.equal(it.text, 'HP\nLIVE');
    assert.equal(it.color, '#aabbcc');
});

test('normalizeList: không phải mảng → rỗng, cắt tối đa MAX_ITEMS', () => {
    assert.deepEqual(JT.normalizeList(null), []);
    const many = Array.from({ length: 20 }, (_, i) => ({ id: 'i' + i, text: String(i) }));
    assert.equal(JT.normalizeList(many).length, JT.MAX_ITEMS);
});

test('mọi kiểu đổi màu được đều có màu mặc định', () => {
    for (const s of JT.STYLES.filter(s => s.hue)) assert.ok(JT.DEFAULT_COLOR[s.id], s.id);
});

test('deco/color2: giữ giá trị hợp lệ, bỏ giá trị lạ', () => {
    assert.equal(JT.normalizeItem({ deco: 'bunny', color2: '#74C4FF' }).deco, 'bunny');
    assert.equal(JT.normalizeItem({ deco: 'bunny', color2: '#74C4FF' }).color2, '#74c4ff');
    assert.equal(JT.normalizeItem({ deco: 'xyz', color2: 'blue' }).deco, 'none');
    assert.equal(JT.normalizeItem({ deco: 'xyz', color2: 'blue' }).color2, '');
});

test('fillVars: điền TOP / tổng xu / %, rút gọn tên dài, giữ biến lạ', () => {
    const d = { top: [{ name: 'Nguyễn Thị Minh Anh Rất Dài', xu: 12345 }], tong: 123456, qua: 9, muctieu: 500000 };
    assert.equal(JT.fillVars('{top1}', d), 'Nguyễn Thị Mi…');
    assert.equal(JT.fillVars('{TONG} xu · {phantram} · {qua} quà', d), '123K xu · 24% · 9 quà');
    assert.equal(JT.fillVars('{top2} {abc}', d), '??? {abc}');
    assert.equal(JT.fillVars('HP Media', d), 'HP Media');
});

test('newItem: tên mẫu HP Media; flip là boolean', () => {
    assert.equal(JT.newItem(0).text, 'HP Media');
    assert.equal(JT.normalizeItem({ flip: 1 }).flip, true);
    assert.equal(JT.normalizeItem({}).flip, false);
});

test('presetsFor: gợi ý đúng dịp (Tết/Trung Thu theo âm lịch)', () => {
    const at = (s) => JT.presetsFor(new Date(s + 'T12:00:00'));
    assert.deepEqual(at('2026-10-15'), ['women2010']);
    assert.ok(at('2027-02-03').includes('tet'));          // Tết 2027 = 06/02
    assert.ok(at('2026-09-20').includes('trungthu'));     // Trung Thu 2026 = 25/09
    assert.ok(at('2026-12-24').includes('noel'));
    assert.ok(at('2026-10-25').includes('halloween'));
    assert.deepEqual(at('2026-11-15'), []);
});

test('presetItems: mọi bộ mẫu ra chữ hợp lệ, sticker có thật, id không trùng', () => {
    for (const p of JT.PRESETS) {
        const items = JT.presetItems(p.id);
        assert.ok(items.length > 0, p.id);
        for (const it of items) assert.ok(JT.DECOS.some(d => d.id === it.deco), p.id + ' deco ' + it.deco);
        assert.equal(new Set(items.map(i => i.id)).size, items.length);
    }
    assert.deepEqual(JT.presetItems('khong-co'), []);
});

test('show/pop/minXu: chuẩn hoá + biến {nguoitang}', () => {
    const it = JT.normalizeItem({ show: 'gift', pop: 1, minXu: 0 });
    assert.deepEqual([it.show, it.pop, it.minXu], ['gift', true, 1]);
    assert.equal(JT.normalizeItem({ show: 'xx' }).show, 'always');
    assert.equal(JT.normalizeItem({}).minXu, 100);
    assert.equal(JT.fillVars('Cảm ơn {nguoitang}', { nguoitang: 'Hoài An' }), 'Cảm ơn Hoài An');
    assert.equal(JT.fillVars('{nguoitang}', {}), 'bạn');
    assert.equal(JT.presetItems('biggift')[0].show, 'gift');
    assert.equal(JT.presetItems('finish')[0].show, 'goal');
});
