'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPresence, createPendingCards } = require('../lib/vipwelcome/presence.js');

const OPT = { antiDupMs: 10000, cooldownMs: 0 };
const T0 = 1_000_000;

test('lần đầu vào phòng → welcome', () => {
    const p = createPresence();
    assert.equal(p.onJoinSignal('u1', T0, OPT), 'welcome');
    assert.equal(p.get('u1').joinCount, 1);
});

test('member + barrage dedupe: tín hiệu thứ 2 sau 2s là trùng', () => {
    const p = createPresence();
    p.onJoinSignal('u1', T0, OPT);
    assert.equal(p.onJoinSignal('u1', T0 + 2000, OPT), 'dup');
    assert.equal(p.get('u1').joinCount, 1);
});

test('vào lại sau 11s, sau 5 phút → luôn welcome', () => {
    const p = createPresence();
    p.onJoinSignal('u1', T0, OPT); p.markWelcomed('u1', T0 + 500);
    assert.equal(p.onJoinSignal('u1', T0 + 11000, OPT), 'welcome');
    assert.equal(p.onJoinSignal('u1', T0 + 11000 + 300000, OPT), 'welcome');
    assert.equal(p.get('u1').joinCount, 3);
});

test('vào lại 3s sau tín hiệu trước vẫn trong cửa sổ chống trùng', () => {
    const p = createPresence();
    p.onJoinSignal('u1', T0, OPT);
    assert.equal(p.onJoinSignal('u1', T0 + 3000, OPT), 'dup');
    assert.equal(p.onJoinSignal('u1', T0 + 3000, { antiDupMs: 2000, cooldownMs: 0 }), 'welcome');
});

test('cooldown tính từ lần đã chào thật', () => {
    const p = createPresence();
    p.onJoinSignal('u1', T0, OPT); p.markWelcomed('u1', T0);
    assert.equal(p.onJoinSignal('u1', T0 + 60000, { antiDupMs: 10000, cooldownMs: 120000 }), 'cooldown');
    assert.equal(p.onJoinSignal('u1', T0 + 130000, { antiDupMs: 10000, cooldownMs: 120000 }), 'welcome');
});

test('chưa được chào (overlay chưa hiện) thì cooldown không chặn', () => {
    const p = createPresence();
    p.onJoinSignal('u1', T0, OPT);
    assert.equal(p.onJoinSignal('u1', T0 + 60000, { antiDupMs: 10000, cooldownMs: 120000 }), 'welcome');
});

test('onActivity: người chưa có tín hiệu vào → late đúng 1 lần', () => {
    const p = createPresence();
    assert.equal(p.onActivity('u2', T0, { lateEnabled: true }), 'late');
    assert.equal(p.onActivity('u2', T0 + 1000, { lateEnabled: true }), null);
    assert.equal(p.onActivity('u3', T0, { lateEnabled: false }), null);
});

test('onActivity sau khi đã có tín hiệu vào → null', () => {
    const p = createPresence();
    p.onJoinSignal('u1', T0, OPT);
    assert.equal(p.onActivity('u1', T0 + 1000, { lateEnabled: true }), null);
});

test('hoạt động không bao giờ là "vào lại", kể cả sau 10 phút im lặng', () => {
    const p = createPresence();
    p.onJoinSignal('u1', T0, OPT); p.markWelcomed('u1', T0);
    assert.equal(p.onActivity('u1', T0 + 600000, { lateEnabled: true }), null);
    assert.equal(p.get('u1').joinCount, 1);
});

test('reset xoá trạng thái', () => {
    const p = createPresence();
    p.onJoinSignal('u1', T0, OPT);
    p.reset();
    assert.equal(p.size(), 0);
    assert.equal(p.onJoinSignal('u1', T0 + 1, OPT), 'welcome');
});

test('pending: cùng key chỉ giữ thẻ mới nhất', () => {
    const q = createPendingCards({ maxAgeMs: 60000 });
    q.put({ id: 'a', key: 'u1' }, T0);
    q.put({ id: 'b', key: 'u1' }, T0 + 1000);
    assert.equal(q.size(), 1);
    assert.deepEqual(q.take(T0 + 2000).map(c => c.id), ['b']);
});

test('pending expiry: quá 60s thì bỏ', () => {
    const q = createPendingCards({ maxAgeMs: 60000 });
    q.put({ id: 'a', key: 'u1' }, T0);
    q.put({ id: 'b', key: 'u2' }, T0 + 30000);
    assert.deepEqual(q.take(T0 + 61000).map(c => c.id), ['b']);
    assert.equal(q.size(), 1);   // b vẫn chờ ack
});

test('pending: ack trả thẻ và xoá; unacked sau 8s được gửi lại', () => {
    const q = createPendingCards({ maxAgeMs: 60000 });
    q.put({ id: 'a', key: 'u1' }, T0);
    q.put({ id: 'b', key: 'u2' }, T0);
    q.markSent('a', T0); q.markSent('b', T0 + 5000);
    assert.deepEqual(q.unackedOlderThan(8000, T0 + 9000).map(c => c.id), ['a']);
    assert.equal(q.ack('a').key, 'u1');
    assert.equal(q.ack('a'), null);
    assert.equal(q.size(), 1);
    q.clear();
    assert.equal(q.size(), 0);
});
