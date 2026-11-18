'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { clipLength, pickSegment, growClip, normalizeHeatmap } = require('../lib/goi-bai/clip');

const CFG = { clipOn: true, clipShortSec: 45, clipLongSec: 90, clipMidCoins: 30, clipFullCoins: 299 };

// heatmap 100 khúc đều nhau, nhiệt = fn(chỉ số)
function heat(duration, fn) {
    const step = duration / 100;
    return Array.from({ length: 100 }, (_, i) => ({ start_time: i * step, end_time: (i + 1) * step, value: fn(i) }));
}

test('clipLength: 3 mốc xu', () => {
    assert.equal(clipLength(1, CFG), 45);
    assert.equal(clipLength(29, CFG), 45);
    assert.equal(clipLength(30, CFG), 90);
    assert.equal(clipLength(298, CFG), 90);
    assert.equal(clipLength(299, CFG), null);
    assert.equal(clipLength(5000, CFG), null);
    assert.equal(clipLength(1, Object.assign({}, CFG, { clipOn: false })), null, 'tắt = cả bài');
});

test('normalizeHeatmap: lọc rác, sắp xếp', () => {
    assert.deepEqual(normalizeHeatmap(null), []);
    const h = normalizeHeatmap([{ start_time: 10, end_time: 20, value: 0.5 }, { start_time: 0, end_time: 10, value: 1 }, { foo: 1 }, { start_time: 5, end_time: 5, value: 1 }]);
    assert.deepEqual(h, [{ s: 0, e: 10, v: 1 }, { s: 10, e: 20, v: 0.5 }]);
});

test('pickSegment: cửa sổ quanh đỉnh nhiệt', () => {
    // bài 200 s, đỉnh ở khúc 67 (giây 134–136) — như "Lạc Trôi"
    const h = heat(200, i => (i === 67 ? 1 : i > 60 && i < 75 ? 0.6 : 0.1));
    const seg = pickSegment(h, 200, 45);
    assert.equal(seg.src, 'heat');
    assert.equal(seg.full, false);
    assert.equal(seg.end - seg.start, 45);
    assert.ok(seg.start <= 134 && seg.end >= 136, `đoạn ${seg.start}-${seg.end} phải chứa đỉnh`);
});

test('pickSegment: bỏ 10% đầu video dù đỉnh ở giây 0', () => {
    const h = heat(300, i => (i < 5 ? 1 : i >= 50 && i < 60 ? 0.7 : 0.1));
    const seg = pickSegment(h, 300, 45);
    assert.ok(seg.start >= 30, 'không được bắt đầu trong 10% đầu: ' + seg.start);
    assert.ok(seg.start <= 150 && seg.end >= 150, 'phải vào vùng nóng thứ hai');
});

test('pickSegment: không vượt cuối bài', () => {
    const h = heat(200, i => (i > 95 ? 1 : 0.1));
    const seg = pickSegment(h, 200, 90);
    assert.equal(seg.end, 200);
    assert.equal(seg.start, 110);
});

test('pickSegment: không có heatmap → từ đầu, dừng ở thời lượng', () => {
    assert.deepEqual(pickSegment([], 240, 45), { start: 0, end: 45, len: 45, full: false, src: 'head' });
});

test('pickSegment: bài ngắn hơn đoạn / cả bài', () => {
    assert.deepEqual(pickSegment(heat(40, () => 1), 40, 45), { start: 0, end: null, len: null, full: true, src: 'full' });
    assert.deepEqual(pickSegment(heat(200, () => 1), 200, null), { start: 0, end: null, len: null, full: true, src: 'full' });
    // đoạn dài hơn 90% bài → lấn vào 10% đầu nhưng vẫn đủ dài
    const s = pickSegment(heat(95, () => 1), 95, 90);
    assert.equal(s.end - s.start, 90);
    assert.ok(s.start >= 0 && s.end <= 95);
});

test('pickSegment: lùi về đầu khúc nhiệt', () => {
    const h = heat(200, i => (i === 67 ? 1 : 0.1));
    const seg = pickSegment(h, 200, 45);
    // điểm đầu trùng ranh khúc 2 s
    assert.equal(seg.start % 2, 0);
});

test('growClip: kéo dài, không rút ngắn, cả bài', () => {
    const c = { start: 100, end: 145, len: 45, full: false, src: 'heat' };
    assert.deepEqual(growClip(c, 90, 300), { start: 100, end: 190, len: 90, full: false, src: 'heat' });
    assert.equal(growClip(c, 30, 300), null, 'không rút ngắn → null = không đổi');
    assert.equal(growClip(c, 45, 300), null);
    assert.deepEqual(growClip(c, null, 300), { start: 100, end: null, len: null, full: true, src: 'heat' });
    assert.deepEqual(growClip(c, 90, 160), { start: 100, end: null, len: null, full: true, src: 'heat' }, 'chạm cuối bài = cả bài');
    assert.equal(growClip({ start: 0, end: null, len: null, full: true, src: 'full' }, 90, 300), null);
});
