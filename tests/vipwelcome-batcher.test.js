'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBatcher } = require('../lib/vipwelcome/batcher.js');

const T0 = 1_000_000;
const OPT = { priority: 115, threshold: 125, maxStack: 3, enabled: true };

test('phòng vắng: không gộp', () => {
    const b = createBatcher();
    assert.equal(b.decide(T0, OPT), 'single');
    b.noteSent(T0); b.noteSent(T0 + 100);
    assert.equal(b.decide(T0 + 200, OPT), 'single');
});

test('phòng đông + bậc thấp: gộp; bậc cao / tắt: không gộp', () => {
    const b = createBatcher();
    b.noteSent(T0); b.noteSent(T0 + 100); b.noteSent(T0 + 200);
    assert.equal(b.decide(T0 + 300, OPT), 'batch');
    assert.equal(b.decide(T0 + 300, { ...OPT, priority: 135 }), 'single');
    assert.equal(b.decide(T0 + 300, { ...OPT, priority: 1000 }), 'single');
    assert.equal(b.decide(T0 + 300, { ...OPT, enabled: false }), 'single');
    // quá cửa sổ 3s → hết đông
    assert.equal(b.decide(T0 + 3300, OPT), 'single');
});

test('nhóm: due sau groupMs, members ≤ 3, total đủ, nhóm mới sau khi flush', () => {
    const b = createBatcher({ groupMs: 2500 });
    for (let i = 0; i < 5; i++) b.add({ key: 'k' + i, nickname: 'N' + i, priority: 110 + i }, T0 + i * 100);
    assert.equal(b.due(T0 + 2000), null);
    const g = b.due(T0 + 2500);
    assert.equal(g.total, 5);
    assert.equal(g.members.length, 3);
    assert.deepEqual(g.keys, ['k0', 'k1', 'k2', 'k3', 'k4']);
    assert.equal(g.topPriority, 114);
    assert.equal(b.due(T0 + 2600), null);
    b.add({ key: 'k9', nickname: 'N9', priority: 101 }, T0 + 2700);
    assert.equal(b.due(T0 + 5200).total, 1);
});

test('add trả flushAt; cùng key trong nhóm không nhân đôi; clear', () => {
    const b = createBatcher({ groupMs: 2500 });
    assert.equal(b.add({ key: 'a', nickname: 'A' }, T0).flushAt, T0 + 2500);
    b.add({ key: 'a', nickname: 'A' }, T0 + 50);
    b.add({ key: 'b', nickname: 'B' }, T0 + 60);
    b.clear();
    assert.equal(b.due(T0 + 9999), null);
    b.add({ key: 'a' }, T0); b.add({ key: 'a' }, T0 + 1);
    assert.equal(b.due(T0 + 2500).total, 1);
});
