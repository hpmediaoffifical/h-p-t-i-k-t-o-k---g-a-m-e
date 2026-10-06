'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine, defaultConfig, ACTIONS, FRUITS } = require('../public/games/chemtraicay/game.js');

const H = 1920;

test('ACTIONS có đúng 15 hành động theo thứ tự spec', () => {
    assert.deepEqual(ACTIONS, ['apple', 'orange', 'lemon', 'pear', 'peach', 'strawberry', 'plum',
        'watermelon', 'pineapple', 'kiwi', 'bomb', 'god', 'fast', 'slow', 'rescue']);
    assert.deepEqual(FRUITS, ACTIONS.slice(0, 10));
});

test('defaultConfig trả về bản sao độc lập với giá trị spec', () => {
    const a = defaultConfig(); const b = defaultConfig();
    assert.equal(a.cutRadius, 15); assert.equal(a.danger, 50); assert.equal(a.camRect, null);
    a.cutRadius = 99; assert.equal(b.cutRadius, 15);
});

test('enqueue cắt trần maxPerGift và xả theo spawnPerSecond', () => {
    const eng = createEngine({ ...defaultConfig(), spawnPerSecond: 3, maxPerGift: 30 }); eng.start();
    eng.enqueue('apple', 999);
    assert.equal(eng.snapshot().queue, 30);
    eng.step(1000);
    assert.equal(eng.snapshot().objects.length, 3);
    assert.equal(eng.snapshot().queue, 27);
});

test('quả bay lên tới đỉnh peak% rồi rơi xuống', () => {
    const eng = createEngine({ ...defaultConfig(), peak: 72, spawnPerSecond: 100 }); eng.start();
    eng.enqueue('apple', 1); eng.step(16);
    let minY = H;
    for (let i = 0; i < 400; i++) {
        eng.step(16);
        const o = eng.snapshot().objects[0];
        if (!o) break;
        minY = Math.min(minY, o.y);
    }
    assert.ok(Math.abs(minY - H * (1 - 0.72)) < 60, `đỉnh ${minY}`);
});

test('quả xuất hiện có kind, r theo objectScale và nằm dưới mép đáy', () => {
    const eng = createEngine({ ...defaultConfig(), objectScale: 1.5, spawnPerSecond: 100 }); eng.start();
    eng.enqueue('watermelon', 1); eng.step(16);
    const o = eng.snapshot().objects[0];
    assert.equal(o.kind, 'watermelon'); assert.equal(o.r, 60); assert.equal(o.depth, 0);
    assert.ok(o.y >= H - 100 && o.x > 0 && o.x < 1080);
});

test('không start thì không sinh quả', () => {
    const eng = createEngine(defaultConfig());
    eng.enqueue('apple', 2); eng.step(2000);
    assert.equal(eng.snapshot().objects.length, 0);
});
