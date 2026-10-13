'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fingersExtended, canWipe, handShapes, wristShapes, BONES, TIPS, PALM } = require('../public/games/hoasi/wipe-shapes.js');

// Bàn tay giả hướng lên: cổ tay (x,y), cỡ s. kind: 'open' | 'fist' | 'v' (trỏ + giữa duỗi).
function makeHand(kind, { x = 500, y = 1200, s = 100 } = {}) {
    const P = new Array(21);
    P[0] = { x, y };
    const thumbOut = kind === 'open';
    P[1] = { x: x - 0.35 * s, y: y - 0.3 * s }; P[2] = { x: x - 0.6 * s, y: y - 0.5 * s }; P[3] = { x: x - 0.85 * s, y: y - 0.65 * s };
    P[4] = thumbOut ? { x: x - 1.2 * s, y: y - 0.8 * s } : { x: x - 0.35 * s, y: y - 0.95 * s };
    const cols = [-0.45, -0.15, 0.15, 0.45];
    const ext = { open: [1, 1, 1, 1], fist: [0, 0, 0, 0], v: [1, 1, 0, 0] }[kind];
    cols.forEach((cx, f) => {
        const b = 5 + f * 4, fx = x + cx * s;
        P[b] = { x: fx, y: y - s };
        if (ext[f]) { P[b + 1] = { x: fx, y: y - 1.5 * s }; P[b + 2] = { x: fx, y: y - 1.8 * s }; P[b + 3] = { x: fx, y: y - 2.1 * s }; }
        else { P[b + 1] = { x: fx, y: y - 1.3 * s }; P[b + 2] = { x: fx, y: y - 1.1 * s }; P[b + 3] = { x: fx, y: y - 0.9 * s }; }
    });
    return { id: 'Left', size: s, pts: P };
}
const shift = (h, dx, dy) => ({ ...h, pts: h.pts.map(p => ({ x: p.x + dx, y: p.y + dy })) });
const ofT = (list, t) => list.filter(s => s.t === t);

test('hằng số: 20 đốt, 5 đầu ngón, 6 điểm lòng bàn tay', () => {
    assert.equal(BONES.length, 20); assert.deepEqual(TIPS, [4, 8, 12, 16, 20]); assert.deepEqual(PALM, [0, 1, 5, 9, 13, 17]);
});

test('đếm ngón: xoè 5, nắm 0, chữ V 2', () => {
    assert.equal(fingersExtended(makeHand('open').pts), 5);
    assert.equal(fingersExtended(makeHand('fist').pts), 0);
    assert.equal(fingersExtended(makeHand('v').pts), 2);
    assert.equal(fingersExtended(null), 0);
});

test('canWipe theo minFingers', () => {
    assert.equal(canWipe(makeHand('open'), 2), true);
    assert.equal(canWipe(makeHand('fist'), 2), false);
    assert.equal(canWipe(makeHand('v'), 2), true);
    assert.equal(canWipe(makeHand('v'), 3), false);
    assert.equal(canWipe({ pts: [] }, 1), false);
    assert.equal(canWipe(null, 1), false);
});

test('handShapes không khung trước: 21 tròn + 20 viên nang + 1 lòng bàn tay', () => {
    const h = makeHand('open'), list = handShapes(h, null, 1000);
    assert.equal(list.length, 42);
    const circles = ofT(list, 'circle'), caps = ofT(list, 'capsule'), polys = ofT(list, 'poly');
    assert.equal(circles.length, 21); assert.equal(caps.length, 20); assert.equal(polys.length, 1);
    const at = (i) => circles.find(c => c.x === h.pts[i].x && c.y === h.pts[i].y);
    assert.ok(Math.abs(at(8).r - 36) < 1e-9); assert.ok(Math.abs(at(0).r - 30) < 1e-9);
    for (const c of caps) assert.ok(Math.abs(c.r - 26) < 1e-9);
    assert.equal(polys[0].pts.length, 6);
});

test('vệt quét khi khung trước tươi', () => {
    const h = makeHand('open'), prev = shift(h, -30, 0);
    const list = handShapes(h, { pts: prev.pts, at: 900 }, 1000);
    assert.equal(list.length, 63);
    const sweep = ofT(list, 'capsule').filter(c => c.x0 === prev.pts[8].x && c.x1 === h.pts[8].x && c.y0 === h.pts[8].y);
    assert.equal(sweep.length, 1); assert.ok(Math.abs(sweep[0].r - 36) < 1e-9);
});

test('khung trước cũ không quét', () => {
    const h = makeHand('open');
    assert.equal(handShapes(h, { pts: shift(h, -30, 0).pts, at: 750 }, 1000).length, 42);
});

test('nhảy cóc > 4 span không quét', () => {
    const h = makeHand('open');
    assert.equal(handShapes(h, { pts: shift(h, -500, 0).pts, at: 950 }, 1000).length, 42);
});

test('wristShapes: 4 hình tròn nối dài qua cổ tay theo hướng khuỷu→cổ tay', () => {
    const pose = Array.from({ length: 33 }, () => ({ x: 0, y: 0, v: 0 }));
    pose[13] = { x: 500, y: 1000, v: 1 }; pose[15] = { x: 500, y: 800, v: 1 };
    const L = wristShapes(pose, 'L');
    assert.equal(L.length, 4);
    assert.deepEqual(L.map(c => Math.round(c.y)), [770, 730, 690, 650]);
    for (const c of L) { assert.equal(c.t, 'circle'); assert.equal(c.x, 500); assert.ok(Math.abs(c.r - 44) < 1e-9); }
    assert.deepEqual(wristShapes(pose, 'R'), []);
    pose[15].v = 0.3; assert.deepEqual(wristShapes(pose, 'L'), []);
    assert.deepEqual(wristShapes(null, 'L'), []);
});
