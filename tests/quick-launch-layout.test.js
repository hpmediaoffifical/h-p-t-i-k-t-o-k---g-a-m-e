'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../public/lib/quick-launch-layout.js');

const IDS = ['a', 'b', 'c', 'd', 'e'];

test('resolveOrder: chưa lưu gì → thứ tự mặc định', () => {
    assert.deepEqual(L.resolveOrder(null, 'doc', IDS), IDS);
    assert.deepEqual(L.resolveOrder({}, 'ngang', IDS), IDS);
});

test('resolveOrder: dùng thứ tự đã lưu của đúng bố cục', () => {
    const saved = { doc: ['c', 'a', 'b', 'd', 'e'], ngang: ['e', 'd', 'c', 'b', 'a'] };
    assert.deepEqual(L.resolveOrder(saved, 'doc', IDS), ['c', 'a', 'b', 'd', 'e']);
    assert.deepEqual(L.resolveOrder(saved, 'ngang', IDS), ['e', 'd', 'c', 'b', 'a']);
});

test('resolveOrder: bố cục chưa sắp riêng thì theo bố cục kia', () => {
    assert.deepEqual(L.resolveOrder({ doc: ['b', 'a', 'c', 'd', 'e'] }, 'ngang', IDS), ['b', 'a', 'c', 'd', 'e']);
    assert.deepEqual(L.resolveOrder({ ngang: ['e', 'a', 'b', 'c', 'd'] }, 'doc', IDS), ['e', 'a', 'b', 'c', 'd']);
});

test('resolveOrder: null = đã khôi phục mặc định → KHÔNG theo bố cục kia', () => {
    assert.deepEqual(L.resolveOrder({ doc: ['b', 'a', 'c', 'd', 'e'], ngang: null }, 'ngang', IDS), IDS);
});

test('resolveOrder: game mới (chưa có trong thứ tự đã lưu) nối cuối; id lạ/trùng bị bỏ', () => {
    const saved = { doc: ['c', 'zzz', 'a', 'c'] };
    assert.deepEqual(L.resolveOrder(saved, 'doc', IDS), ['c', 'a', 'b', 'd', 'e']);
});

test('resolveOrder: dữ liệu hỏng không làm vỡ', () => {
    assert.deepEqual(L.resolveOrder({ doc: 'abc' }, 'doc', IDS), IDS);
    assert.deepEqual(L.resolveOrder('rác', 'doc', IDS), IDS);
    assert.deepEqual(L.resolveOrder({ doc: [1, null, 'b'] }, 'doc', IDS), ['b', 'a', 'c', 'd', 'e']);
});

test('setLayoutOrder / resetLayoutOrder: chỉ đụng bố cục được chọn, không sửa object cũ', () => {
    const saved = { doc: ['b', 'a'] };
    const next = L.setLayoutOrder(saved, 'ngang', ['e', 'd']);
    assert.deepEqual(next, { doc: ['b', 'a'], ngang: ['e', 'd'] });
    assert.deepEqual(saved, { doc: ['b', 'a'] });
    assert.deepEqual(L.resetLayoutOrder(next, 'doc'), { doc: null, ngang: ['e', 'd'] });
    assert.deepEqual(L.setLayoutOrder(null, 'doc', ['a']), { doc: ['a'] });
});

test('applyVisibleOrder: game bị ẩn giữ nguyên chỗ, game hiện theo thứ tự mới', () => {
    // b, d đang ẩn; user kéo e lên đầu nhóm đang hiện
    assert.deepEqual(L.applyVisibleOrder(['a', 'b', 'c', 'd', 'e'], ['e', 'a', 'c']), ['e', 'b', 'a', 'd', 'c']);
    assert.deepEqual(L.applyVisibleOrder(['a', 'b', 'c'], ['c', 'b', 'a']), ['c', 'b', 'a']);
    // danh sách hiện thiếu/thừa id → bỏ id lạ, id thiếu giữ chỗ cũ
    assert.deepEqual(L.applyVisibleOrder(['a', 'b', 'c'], ['c', 'x', 'a']), ['c', 'b', 'a']);
});

test('moveId: dời lên/xuống, chặn ở hai đầu', () => {
    assert.deepEqual(L.moveId(IDS, 'c', -1), ['a', 'c', 'b', 'd', 'e']);
    assert.deepEqual(L.moveId(IDS, 'c', 1), ['a', 'b', 'd', 'c', 'e']);
    assert.deepEqual(L.moveId(IDS, 'a', -1), IDS);
    assert.deepEqual(L.moveId(IDS, 'e', 1), IDS);
    assert.deepEqual(L.moveId(IDS, 'zzz', 1), IDS);
});

test('snapColumns: số cột vừa bề rộng, cửa sổ gọt khít N cột', () => {
    // chrome = lề trái+phải của vùng nội dung; colW = bề rộng tự nhiên 1 thẻ; gap giữa cột
    const o = { colW: 230, gap: 6, chrome: 16, count: 14 };
    assert.deepEqual(L.snapColumns(780, o), { cols: 3, width: 16 + 3 * 230 + 2 * 6 });
    assert.deepEqual(L.snapColumns(16 + 4 * 230 + 3 * 6, o), { cols: 4, width: 16 + 4 * 230 + 3 * 6 });
    // hẹp hơn 1 cột → vẫn 1 cột
    assert.deepEqual(L.snapColumns(100, o), { cols: 1, width: 16 + 230 });
});

test('snapColumns: không tạo cột trống khi ít game', () => {
    assert.deepEqual(L.snapColumns(2000, { colW: 230, gap: 6, chrome: 16, count: 3 }), { cols: 3, width: 16 + 3 * 230 + 2 * 6 });
    assert.deepEqual(L.snapColumns(2000, { colW: 230, gap: 6, chrome: 16, count: 0 }), { cols: 1, width: 16 + 230 });
});

test('fitWidth: bố cục Dọc = bề rộng tự nhiên + lề, có sàn tối thiểu', () => {
    assert.equal(L.fitWidth({ colW: 230, chrome: 16, min: 260 }), 260);
    assert.equal(L.fitWidth({ colW: 251.2, chrome: 16, min: 260 }), 268);
    assert.equal(L.fitWidth({ colW: 0, chrome: 16, min: 260 }), 260);
});
