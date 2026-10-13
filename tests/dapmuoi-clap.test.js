'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createClapDetector } = require('../public/games/dapmuoi/clap.js');

const H = (x, y, size = 100, id = 'Left') => ({ id, palm: { x, y }, size });
const cfg = { hitMode: 'clap', clapDistance: 1.2, clapSpeed: 900, slapSpeed: 1200, clapCooldownMs: 250, hitRadius: 14 };
const pose = (lw, rw) => {
    const p = Array.from({ length: 33 }, () => ({ x: 0, y: 0, v: 1 }));
    p[11] = { x: 340, y: 700, v: 1 }; p[12] = { x: 740, y: 700, v: 1 };
    p[15] = { x: lw, y: 1000, v: 1 }; p[16] = { x: rw, y: 1000, v: 1 };
    return p;
};

test('2 tay khép nhanh dưới 1.2×cỡ tay → 1 cú clap tại trung điểm, r = 14%×1080 + cỡ tay', () => {
    const d = createClapDetector(cfg);
    assert.deepEqual(d.update({ hands: [H(300, 900), H(700, 900, 100, 'Right')], pose: null, now: 0 }), []);
    const ev = d.update({ hands: [H(480, 900), H(580, 900, 100, 'Right')], pose: null, now: 100 });   // d 400→100 trong 100ms = 3000px/s
    assert.equal(ev.length, 1); assert.equal(ev[0].mode, 'clap'); assert.equal(ev[0].x, 530); assert.equal(ev[0].y, 900);
    assert.ok(Math.abs(ev[0].r - (0.14 * 1080 + 100)) < 1e-6);
    assert.deepEqual(d.update({ hands: [H(500, 900), H(560, 900, 100, 'Right')], pose: null, now: 150 }), []);   // cooldown
});

test('2 tay gần nhau nhưng đứng yên → không bắn', () => {
    const d = createClapDetector(cfg);
    d.update({ hands: [H(500, 900), H(580, 900, 100, 'Right')], pose: null, now: 0 });
    assert.deepEqual(d.update({ hands: [H(500, 900), H(580, 900, 100, 'Right')], pose: null, now: 100 }), []);
});

test('rớt 1 tay lúc chập: khung trước 2 tay khép nhanh, d < 2.5×cỡ → vẫn clap', () => {
    const d = createClapDetector(cfg);
    d.update({ hands: [H(300, 900), H(700, 900, 100, 'Right')], pose: null, now: 0 });
    d.update({ hands: [H(420, 900), H(600, 900, 100, 'Right')], pose: null, now: 60 });       // d 180, đang khép 3667px/s, chưa < 120
    const ev = d.update({ hands: [H(500, 900)], pose: null, now: 120 });
    assert.equal(ev.length, 1); assert.equal(ev[0].mode, 'clap');
});

test('rớt 1 tay nhưng khung trước 2 tay còn xa (d ≥ 2.5×cỡ) → không bắn', () => {
    const d = createClapDetector(cfg);
    d.update({ hands: [H(100, 900), H(900, 900, 100, 'Right')], pose: null, now: 0 });
    d.update({ hands: [H(200, 900), H(800, 900, 100, 'Right')], pose: null, now: 60 });       // d 600
    assert.deepEqual(d.update({ hands: [H(300, 900)], pose: null, now: 120 }), []);
});

test('dự phòng cổ tay: không có tay, pose 2 cổ tay khép < 0.45×vai → wrist', () => {
    const d = createClapDetector(cfg);
    d.update({ hands: [], pose: pose(300, 800), now: 0 });
    const ev = d.update({ hands: [], pose: pose(500, 600), now: 100 });
    assert.equal(ev.length, 1); assert.equal(ev[0].mode, 'wrist'); assert.equal(ev[0].x, 550); assert.equal(ev[0].y, 1000);
});

test('cổ tay không chạy khi luật tay vừa bắn cùng khung (chỉ 1 sự kiện)', () => {
    const d = createClapDetector(cfg);
    d.update({ hands: [H(300, 900), H(700, 900, 100, 'Right')], pose: pose(300, 800), now: 0 });
    const ev = d.update({ hands: [H(480, 900), H(580, 900, 100, 'Right')], pose: pose(500, 600), now: 100 });
    assert.equal(ev.length, 1); assert.equal(ev[0].mode, 'clap');
});

test('hitMode slap: 1 tay vụt ≥1200px/s → slap tại tay; hitMode clap thì 1 tay vụt không bắn', () => {
    const d = createClapDetector({ ...cfg, hitMode: 'slap' });
    d.update({ hands: [H(100, 900)], pose: null, now: 0 });
    const ev = d.update({ hands: [H(300, 900)], pose: null, now: 100 });
    assert.equal(ev.length, 1); assert.equal(ev[0].mode, 'slap'); assert.equal(ev[0].x, 300);
    const c = createClapDetector(cfg);
    c.update({ hands: [H(100, 900)], pose: null, now: 0 });
    assert.deepEqual(c.update({ hands: [H(300, 900)], pose: null, now: 100 }), []);
});

test('hitMode both: clap và slap cùng khung chỉ ra 1 sự kiện (ưu tiên clap)', () => {
    const d = createClapDetector({ ...cfg, hitMode: 'both' });
    d.update({ hands: [H(300, 900), H(700, 900, 100, 'Right')], pose: null, now: 0 });
    const ev = d.update({ hands: [H(480, 900), H(580, 900, 100, 'Right')], pose: null, now: 100 });
    assert.equal(ev.length, 1); assert.equal(ev[0].mode, 'clap');
});

test('setConfig đổi hitMode có hiệu lực ngay', () => {
    const d = createClapDetector(cfg);
    d.setConfig({ ...cfg, hitMode: 'slap' });
    d.update({ hands: [H(100, 900)], pose: null, now: 0 });
    assert.equal(d.update({ hands: [H(300, 900)], pose: null, now: 100 }).length, 1);
});
