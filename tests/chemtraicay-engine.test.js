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

// ---------- Task 2: dao chém, mảnh, điểm, combo ----------
function oneFruitAt(eng, x, y, kind) {
    eng.enqueue(kind || 'apple', 1); eng.step(16);
    const objs = eng.snapshot().objects;
    const o = objs[objs.length - 1];
    o.x = x; o.y = y; o.vx = 0; o.vy = 0;
    return o;
}
function swipe(eng, y, x1, x2, side) {
    eng.setBlade(side || 'R', x1, y, true); eng.step(16);
    eng.setBlade(side || 'R', x2, y, true); eng.step(16);
}

test('đoạn thẳng của dao cắt quả trong cutRadius → +points, tách 2 mảnh depth 1', () => {
    const eng = createEngine({ ...defaultConfig(), cutRadius: 15, points: 10, cuts: 2, spawnPerSecond: 100 }); eng.start();
    oneFruitAt(eng, 540, 900);
    swipe(eng, 900, 400, 700);
    const s = eng.snapshot();
    assert.equal(s.score, 10);
    assert.equal(s.objects.length, 2);
    assert.ok(s.objects.every(o => o.depth === 1 && o.kind === 'apple'));
    assert.ok(s.events.some(e => e.type === 'cut' && e.kind === 'apple' && e.points === 10));
});

test('dao đi xa quả hơn r + cutRadius thì không cắt', () => {
    const eng = createEngine({ ...defaultConfig(), cutRadius: 15, objectScale: 1, spawnPerSecond: 100 }); eng.start();
    oneFruitAt(eng, 540, 900);
    swipe(eng, 900 + 40 + 15 + 5, 400, 700);
    assert.equal(eng.snapshot().score, 0);
    assert.equal(eng.snapshot().objects.length, 1);
});

test('mảnh đạt depth = cuts thì không cắt thêm', () => {
    const eng = createEngine({ ...defaultConfig(), cuts: 1, spawnPerSecond: 100 }); eng.start();
    oneFruitAt(eng, 540, 900);
    swipe(eng, 900, 400, 700);
    eng.snapshot().objects.forEach(o => { o.x = 540; o.y = 900; o.vx = 0; o.vy = 0; });
    swipe(eng, 900, 400, 700);
    assert.equal(eng.snapshot().score, 10);
});

test('tay vắng rồi hiện lại không tạo đoạn thẳng ma', () => {
    const eng = createEngine({ ...defaultConfig(), spawnPerSecond: 100 }); eng.start();
    oneFruitAt(eng, 540, 900);
    eng.setBlade('R', 100, 900, true); eng.step(16);
    eng.setBlade('R', 100, 900, false); eng.step(16);
    eng.setBlade('R', 900, 900, true); eng.step(16);
    assert.equal(eng.snapshot().score, 0);
});

test('hai tay chém độc lập, snapshot().blades phản ánh vị trí', () => {
    const eng = createEngine({ ...defaultConfig(), spawnPerSecond: 100 }); eng.start();
    oneFruitAt(eng, 300, 900); oneFruitAt(eng, 800, 1200);
    eng.setBlade('L', 200, 900, true); eng.setBlade('R', 700, 1200, true); eng.step(16);
    eng.setBlade('L', 400, 900, true); eng.setBlade('R', 900, 1200, true); eng.step(16);
    const s = eng.snapshot();
    assert.equal(s.score, 20);
    assert.equal(s.blades.L.x, 400); assert.equal(s.blades.R.present, true);
});

test('combo tăng khi nhát liên tiếp trong 1 s và về 0 sau 1 s', () => {
    const eng = createEngine({ ...defaultConfig(), spawnPerSecond: 100 }); eng.start();
    oneFruitAt(eng, 540, 900);
    swipe(eng, 900, 400, 700);
    eng.snapshot();
    eng.setBlade('R', 400, 1300, true); eng.step(500);
    oneFruitAt(eng, 540, 1300);
    eng.setBlade('R', 700, 1300, true); eng.step(16);
    assert.equal(eng.snapshot().combo, 2);
    eng.setBlade('R', 700, 1300, false); eng.step(1100);
    assert.equal(eng.snapshot().combo, 0);
});
