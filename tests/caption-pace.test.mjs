// node --test tests/caption-pace.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { minShowMs, createLinePacer } from '../public/lib/caption-pace.mjs';

const line = (texts) => ({ translations: texts.map(t => ({ translatedText: t })) });

test('minShowMs: 1500 + 60ms/ký tự theo bản dịch dài nhất, kẹp 2500–9000', () => {
    assert.equal(minShowMs(line(['hi'])), 2500);                       // 1500 + 120 → kẹp dưới
    assert.equal(minShowMs(line(['a'.repeat(50), 'b'.repeat(20)])), 4500);
    assert.equal(minShowMs(line(['a'.repeat(300)])), 9000);            // kẹp trên
    assert.equal(minShowMs({ translatedText: 'x'.repeat(40) }), 3900); // không có mảng translations
});

test('pacer: câu đầu hiện ngay; câu tới sớm xếp hàng rồi hiện khi hết thời gian giữ', () => {
    let now = 0;
    const shown = [];
    const p = createLinePacer({ now: () => now, show: (item) => shown.push(item.id), minShow: () => 3000 });
    p.push({ id: 1 });
    assert.deepEqual(shown, [1]);
    now = 1000; p.push({ id: 2 });
    assert.deepEqual(shown, [1]);
    assert.equal(p.pending(), 1);
    assert.equal(p.waitMs(), 2000);
    now = 3000; p.tick();
    assert.deepEqual(shown, [1, 2]);
    now = 7000; p.push({ id: 3 });     // đã quá 3s từ câu 2 → hiện ngay
    assert.deepEqual(shown, [1, 2, 3]);
});

test('pacer: hàng chờ tối đa 4 — quá thì bỏ câu cũ nhất, không trễ dần', () => {
    let now = 0;
    const shown = [];
    const p = createLinePacer({ now: () => now, show: (item) => shown.push(item.id), minShow: () => 5000, maxQueue: 4 });
    p.push({ id: 1 });
    now = 100;
    for (let id = 2; id <= 8; id++) p.push({ id });
    assert.equal(p.pending(), 4);
    now = 5000; p.tick();
    assert.deepEqual(shown, [1, 5]);   // 2,3,4 bị bỏ
});

test('pacer: hàng chờ xếp theo createTime — câu nói trước hiện trước dù bản dịch tới sau', () => {
    let now = 0;
    const shown = [];
    const p = createLinePacer({ now: () => now, show: (item) => shown.push(item.id), minShow: () => 3000 });
    p.push({ id: 1, createTime: 100 });
    now = 500; p.push({ id: 3, createTime: 300 });
    now = 900; p.push({ id: 2, createTime: 200 });
    now = 3000; p.tick();
    now = 6000; p.tick();
    assert.deepEqual(shown, [1, 2, 3]);
});

test('pacer: tắt giữ nhịp → mọi câu hiện ngay', () => {
    const shown = [];
    const p = createLinePacer({ now: () => 0, show: (item) => shown.push(item.id), minShow: () => 5000, enabled: false });
    p.push({ id: 1 }); p.push({ id: 2 });
    assert.deepEqual(shown, [1, 2]);
    assert.equal(p.pending(), 0);
});
