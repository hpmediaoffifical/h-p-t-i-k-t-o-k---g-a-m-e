'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBumps } = require('../public/games/dapmuoi/bumps.js');

const cfg = { bumpSec: 30, maxBumps: 12 };
// Khung giả: đầu tâm (540,690) rộng 200, thân tâm (540,900) vai 400 hông +600
const FRAMES = { seen: true, head: { O: { x: 540, y: 690 }, u: { x: 200, y: 0 }, v: { x: 0, y: 200 }, width: 200 }, torso: { O: { x: 540, y: 900 }, u: { x: 400, y: 0 }, v: { x: 0, y: 600 } }, shoulderW: 400 };
const mark = (zone = 'forehead') => ({ frame: 'head', a: 0, b: -0.45, zone });

test('add/count; hết hạn bumpSec thì biến mất; trần maxBumps xoá cũ nhất', () => {
    const b = createBumps(cfg);
    b.add(mark(), 0); b.add(mark('cheekL'), 100); b.add(mark('chin'), 200);
    assert.equal(b.count(), 3);
    b.tick(31000); assert.equal(b.count(), 0);
    for (let i = 0; i < 13; i++) b.add(mark(), 40000 + i);
    b.tick(40100); assert.equal(b.count(), 12);
    assert.equal(b.list(FRAMES)[0].t0, 40001, 'nốt cũ nhất (t0=40000) đã bị xoá');
});

test('list(frames): toạ độ sân khấu theo khung, alpha 1 lúc trẻ, mờ dần 30% cuối, scale phập phồng 2s đầu', () => {
    const b = createBumps(cfg);
    b.add(mark(), 0);
    let L = b.list(FRAMES, 500);
    assert.equal(L.length, 1); assert.ok(Math.abs(L[0].x - 540) < 1e-6 && Math.abs(L[0].y - 600) < 1e-6);
    assert.equal(L[0].alpha, 1); assert.ok(L[0].scale > 1);
    L = b.list(FRAMES, 10000); assert.equal(L[0].alpha, 1); assert.ok(Math.abs(L[0].scale - 1) < 1e-6);
    L = b.list(FRAMES, 27000); assert.ok(L[0].alpha < 1 && L[0].alpha > 0);
    assert.deepEqual(b.list(null, 500), []);
    assert.deepEqual(b.list({ seen: false, head: null, torso: null }, 500), []);
});

test('heal: cách 0.5s bắt đầu một nốt (cũ nhất trước), xoa 0.8s rồi xoá; stopHeal dừng', () => {
    const b = createBumps(cfg);
    b.add(mark(), 0); b.add(mark('cheekL'), 100);
    b.startHeal(1000);
    let h = b.heal(1000); assert.ok(h && h.bump.t0 === 0 && h.progress === 0);
    h = b.heal(1400); assert.ok(h && Math.abs(h.progress - 0.5) < 1e-6);
    h = b.heal(1800); assert.equal(b.count(), 1);              // nốt 1 đã xoá sau 0.8s
    h = b.heal(2000); assert.equal(h, null);                   // đang nghỉ 0.5s
    h = b.heal(2300); assert.ok(h && h.bump.t0 === 100);       // nốt 2 bắt đầu
    b.stopHeal(); assert.equal(b.heal(2500), null); assert.equal(b.count(), 1);
    b.startHeal(3000); b.heal(3000); b.heal(3800); assert.equal(b.count(), 0); assert.equal(b.heal(4000), null);
});

test('list đánh dấu nốt đang xoa + tiến độ', () => {
    const b = createBumps(cfg);
    b.add(mark(), 0); b.startHeal(100); b.heal(100);          // xoa bắt đầu ở lần heal() đầu (t=100)
    const L = b.list(FRAMES, 500);
    assert.equal(L[0].healing, true); assert.ok(Math.abs(L[0].progress - 0.5) < 1e-6);
});
