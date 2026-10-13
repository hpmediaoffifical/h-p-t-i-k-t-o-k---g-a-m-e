'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMediaQueue } = require('../lib/vipwelcome/media-queue.js');

const T0 = 1_000_000;
const item = (key, priority, ts) => ({ key, priority, ts, payload: { key } });

test('ưu tiên cao ra trước, cùng ưu tiên theo thời gian', () => {
    const q = createMediaQueue();
    q.push(item('a', 100, T0));
    q.push(item('b', 1000, T0 + 10));
    q.push(item('c', 100, T0 - 5));
    assert.deepEqual([q.next(T0 + 20, 30000).item.key, q.next(T0 + 20, 30000).item.key, q.next(T0 + 20, 30000).item.key], ['b', 'c', 'a']);
    assert.equal(q.next(T0 + 20, 30000).item, null);
});

test('cùng người chỉ giữ 1 mục (mục mới thay mục cũ)', () => {
    const q = createMediaQueue();
    q.push(item('a', 100, T0));
    q.push(item('a', 135, T0 + 1000));
    assert.equal(q.size(), 1);
    assert.equal(q.list()[0].priority, 135);
});

test('mục chờ quá lâu bị bỏ, trả mục kế', () => {
    const q = createMediaQueue();
    q.push(item('old', 1000, T0));
    q.push(item('new', 100, T0 + 25000));
    const r = q.next(T0 + 31000, 30000);
    assert.equal(r.item.key, 'new');
    assert.deepEqual(r.expired.map(x => x.key), ['old']);
    assert.equal(q.size(), 0);
});

test('trim: bỏ mục ưu tiên thấp nhất khi hàng quá dài', () => {
    const q = createMediaQueue();
    q.push(item('a', 1000, T0));
    q.push(item('b', 50, T0));
    q.push(item('c', 135, T0));
    assert.deepEqual(q.trim(2).map(x => x.key), ['b']);
    assert.deepEqual(q.list().map(x => x.key), ['a', 'c']);
});

test('item không có key vẫn xếp hàng riêng; clear', () => {
    const q = createMediaQueue();
    q.push(item('', 1, T0));
    q.push(item('', 1, T0));
    assert.equal(q.size(), 2);
    q.clear();
    assert.equal(q.size(), 0);
});
