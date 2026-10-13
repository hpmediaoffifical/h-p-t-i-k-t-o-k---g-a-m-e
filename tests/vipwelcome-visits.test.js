'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createVisits } = require('../lib/vipwelcome/visits.js');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vw-visits-')), 'visits.json');
const OCT = Date.UTC(2026, 9, 13, 12);
const NOV = Date.UTC(2026, 10, 2, 12);
const meta = { uniqueId: 'davina', nickname: 'Davina', avatar: '' };

test('same room: vào nhiều lần trong 1 buổi chỉ đếm 1', () => {
    const v = createVisits({ file: tmpFile(), saveDelayMs: 0 });
    v.startRoom('h', 'r1');
    const a = v.record('h', 'u1', 'r1', meta, OCT);
    assert.deepEqual([a.visitNo, a.isFirst, a.streak, a.counted], [1, true, 1, true]);
    const b = v.record('h', 'u1', 'r1', meta, OCT + 1000);
    assert.deepEqual([b.visitNo, b.isFirst, b.counted], [1, true, false]);
});

test('streak: có mặt buổi kế tiếp +1, vắng 1 buổi về 1', () => {
    const v = createVisits({ file: tmpFile(), saveDelayMs: 0 });
    for (const r of ['r1', 'r2', 'r3']) { v.startRoom('h', r); v.record('h', 'u1', r, meta, OCT); }
    assert.equal(v.peek('h', 'u1', 'r4').streak, 1);   // r4 chưa mở buổi → không tính liền
    v.startRoom('h', 'r4');
    assert.deepEqual(v.peek('h', 'u1', 'r4'), { visitNo: 4, isFirst: false, streak: 4 });
    v.startRoom('h', 'r5');   // u1 vắng r4
    const x = v.record('h', 'u1', 'r5', meta, OCT);
    assert.deepEqual([x.visitNo, x.streak], [4, 1]);
    assert.equal(v.top('h', { scope: 'all' }, OCT)[0].bestStreak, 3);
});

test('startRoom idempotent (kết nối lại giữa buổi)', () => {
    const v = createVisits({ file: tmpFile(), saveDelayMs: 0 });
    v.startRoom('h', 'r1'); v.record('h', 'u1', 'r1', meta, OCT);
    v.startRoom('h', 'r2'); v.startRoom('h', 'r2'); v.startRoom('h', 'r1');
    assert.equal(v.record('h', 'u1', 'r2', meta, OCT).streak, 2);
});

test('peek không ghi; isFirst cho người mới', () => {
    const v = createVisits({ file: tmpFile(), saveDelayMs: 0 });
    v.startRoom('h', 'r1');
    assert.deepEqual(v.peek('h', 'u9', 'r1'), { visitNo: 1, isFirst: true, streak: 1 });
    assert.equal(v.top('h', { scope: 'all' }, OCT).length, 0);
});

test('top: all theo số buổi, month theo tháng hiện tại, lọc q, limit', () => {
    const v = createVisits({ file: tmpFile(), saveDelayMs: 0 });
    ['r1', 'r2', 'r3'].forEach((r) => { v.startRoom('h', r); v.record('h', 'a', r, { nickname: 'An' }, OCT); });
    v.startRoom('h', 'r4'); v.record('h', 'b', 'r4', { nickname: 'Bình' }, NOV); v.record('h', 'a', 'r4', { nickname: 'An' }, NOV);
    v.startRoom('h', 'r5'); v.record('h', 'b', 'r5', { nickname: 'Bình' }, NOV);
    assert.deepEqual(v.top('h', { scope: 'all' }, NOV).map(x => [x.key, x.sessions]), [['a', 4], ['b', 2]]);
    assert.deepEqual(v.top('h', { scope: 'month' }, NOV).map(x => [x.key, x.monthCount]), [['b', 2], ['a', 1]]);
    assert.deepEqual(v.top('h', { scope: 'all', q: 'binh' }, NOV).map(x => x.key), ['b']);
    assert.equal(v.top('h', { scope: 'all', limit: 1 }, NOV).length, 1);
});

test('flushSync + mở lại; file hỏng không sập; __proto__ không bẩn', () => {
    const file = tmpFile();
    const v = createVisits({ file, saveDelayMs: 60000 });
    v.startRoom('__proto__', 'r1');
    v.record('__proto__', 'constructor', 'r1', meta, OCT);
    v.startRoom('h', 'r1'); v.record('h', 'u1', 'r1', meta, OCT);
    v.flushSync();
    assert.equal(({}).r1, undefined);
    const v2 = createVisits({ file });
    assert.equal(v2.peek('h', 'u1', 'r1').visitNo, 1);
    fs.writeFileSync(file, '{ hỏng');
    const v3 = createVisits({ file });
    assert.equal(v3.top('h', { scope: 'all' }, OCT).length, 0);
    assert.equal(fs.readdirSync(path.dirname(file)).filter(f => f.includes('.bad-')).length, 1);
});

test('rekey gộp u:<id> về userId; reset xoá kênh', () => {
    const v = createVisits({ file: tmpFile(), saveDelayMs: 0 });
    v.startRoom('h', 'r1'); v.record('h', 'u:davina', 'r1', meta, OCT);
    v.rekey('h', 'u:davina', '77');
    assert.equal(v.peek('h', '77', 'r1').visitNo, 1);
    v.reset('h');
    assert.equal(v.top('h', { scope: 'all' }, OCT).length, 0);
});

test('top: chuỗi chỉ còn hiệu lực nếu ghé buổi gần nhất hoặc buổi ngay trước', () => {
    const v = createVisits({ file: tmpFile(), saveDelayMs: 0 });
    ['r1', 'r2', 'r3'].forEach(r => { v.startRoom('h', r); v.record('h', 'a', r, { nickname: 'A' }, OCT); });
    v.startRoom('h', 'r4');
    assert.equal(v.top('h', { scope: 'all' }, OCT)[0].streak, 3);   // r4 đang diễn ra, chưa vào vẫn giữ chuỗi
    v.startRoom('h', 'r5');
    assert.equal(v.top('h', { scope: 'all' }, OCT)[0].streak, 0);   // đã lỡ r4 → hết chuỗi
    assert.equal(v.top('h', { scope: 'all' }, OCT)[0].bestStreak, 3);
});

test('rekey khi cả 2 key đã có: gộp số buổi, không mất dữ liệu', () => {
    const v = createVisits({ file: tmpFile(), saveDelayMs: 0 });
    v.startRoom('h', 'r1'); v.record('h', 'u:abc', 'r1', { nickname: 'A' }, OCT);
    v.startRoom('h', 'r2'); v.record('h', '77', 'r2', { nickname: 'A' }, OCT);
    v.rekey('h', 'u:abc', '77');
    const t = v.top('h', { scope: 'all' }, OCT);
    assert.equal(t.length, 1);
    assert.equal(t[0].key, '77');
    assert.equal(t[0].sessions, 2);
    v.startRoom('h', 'r3'); v.record('h', 'u:x', 'r3', {}, OCT); v.record('h', 'y', 'r3', {}, OCT);
    v.rekey('h', 'u:x', 'y');   // cùng buổi r3 → không đếm 2 lần
    assert.equal(v.top('h', { scope: 'all', q: '' }, OCT).find(x => x.key === 'y').sessions, 1);
});
