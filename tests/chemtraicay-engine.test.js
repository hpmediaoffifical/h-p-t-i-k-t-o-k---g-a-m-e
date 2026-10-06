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
    assert.deepEqual(a.videoSource, { mode: 'obs-source', scene: '', source: '', fps: 15, width: 640 });
    assert.deepEqual(a.obsScene, { enabled: false, playScene: '', backScene: '' });
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

// ---------- Task 3: vườn tích tụ, thua, bom, buff, giải cứu, hold-to-start ----------
function dropAll(eng, ms) { eng.snapshot().objects.forEach(o => { o.vy = 3000; }); eng.step(ms || 500); }

test('quả rơi hết khỏi đáy → pile += pileStep và event land', () => {
    const eng = createEngine({ ...defaultConfig(), pileStep: 5, danger: 50, spawnPerSecond: 100 }); eng.start();
    oneFruitAt(eng, 540, 1900); dropAll(eng);
    const s = eng.snapshot();
    assert.equal(s.pile, 5); assert.equal(s.playing, true);
    assert.ok(s.events.some(e => e.type === 'land' && e.kind === 'apple'));
});

test('pile ≥ danger → end, playing=false, score giữ, object xóa hết', () => {
    const eng = createEngine({ ...defaultConfig(), pileStep: 25, danger: 50, cuts: 1, spawnPerSecond: 100 }); eng.start();
    oneFruitAt(eng, 540, 900); swipe(eng, 900, 400, 700); eng.snapshot();
    for (let i = 0; i < 2; i++) { oneFruitAt(eng, 540, 1900); dropAll(eng); }
    const s = eng.snapshot();
    assert.equal(s.pile, 50); assert.equal(s.playing, false); assert.equal(s.score, 10);
    assert.equal(s.objects.length, 0);
    assert.ok(s.events.some(e => e.type === 'end' && e.score === 10));
    eng.start(); assert.equal(eng.snapshot().pile, 0); assert.equal(eng.snapshot().score, 10);
});

test('chém bom → -bombPenalty, event bomb, quả trong bán kính blast rơi vào vườn', () => {
    const eng = createEngine({ ...defaultConfig(), bombPenalty: 50, blast: 24, pileStep: 5, spawnPerSecond: 100 }); eng.start();
    oneFruitAt(eng, 540, 900, 'bomb'); oneFruitAt(eng, 600, 900, 'apple'); oneFruitAt(eng, 540, 300, 'apple');
    swipe(eng, 900, 400, 700);
    const s = eng.snapshot();
    assert.equal(s.score, -50); assert.equal(s.pile, 5);
    assert.equal(s.objects.length, 1); assert.ok(Math.abs(s.objects[0].y - 300) < 5);
    assert.ok(s.events.some(e => e.type === 'bomb'));
});

test('god: bom thành vàng, chém được +points, không nổ; buffs.god ≈ godSeconds', () => {
    const eng = createEngine({ ...defaultConfig(), godSeconds: 10, points: 10, spawnPerSecond: 100 }); eng.start();
    eng.enqueue('god', 1); eng.step(16);
    assert.ok(Math.abs(eng.snapshot().buffs.god - 10000) < 50);
    const b = oneFruitAt(eng, 540, 900, 'bomb'); assert.equal(b.golden, true);
    swipe(eng, 900, 400, 700);
    const s = eng.snapshot();
    assert.equal(s.score, 10); assert.ok(!s.events.some(e => e.type === 'bomb'));
});

test('fast và slow triệt tiêu thời gian của nhau', () => {
    const eng = createEngine({ ...defaultConfig(), fastSeconds: 10, slowSeconds: 4 }); eng.start();
    eng.enqueue('fast', 1); eng.step(16); eng.enqueue('slow', 1); eng.step(16);
    const b = eng.snapshot().buffs;
    assert.ok(Math.abs(b.fast - 6000) < 50, `fast ${b.fast}`); assert.equal(b.slow, 0);
    eng.step(7000);
    assert.equal(eng.snapshot().buffs.fast, 0);
});

test('fast nhân tốc độ bay theo fastFactor', () => {
    const mk = (fast) => { const e = createEngine({ ...defaultConfig(), fastFactor: 2, spawnPerSecond: 100 }); e.start(); if (fast) { e.enqueue('fast', 1); e.step(16); } return e; };
    const a = mk(false), b = mk(true);
    const oa = oneFruitAt(a, 540, 1500), ob = oneFruitAt(b, 540, 1500);
    oa.vy = -1000; ob.vy = -1000; a.step(100); b.step(100);
    assert.ok(1500 - ob.y > (1500 - oa.y) * 1.5);
});

test('rescue trừ rescuePercent khỏi pile, không âm', () => {
    const eng = createEngine({ ...defaultConfig(), pileStep: 30, rescuePercent: 100, spawnPerSecond: 100 }); eng.start();
    oneFruitAt(eng, 540, 1900); dropAll(eng);
    assert.equal(eng.snapshot().pile, 30);
    eng.enqueue('rescue', 1); eng.step(16);
    const s = eng.snapshot(); assert.equal(s.pile, 0); assert.ok(s.events.some(e => e.type === 'rescue'));
});

test('hold-to-start: giữ ngón trên nút holdSeconds thì start, rời tay thì progress về 0', () => {
    const eng = createEngine({ ...defaultConfig(), holdSeconds: 0.85 }); eng.holdTarget(540, 1000, 120);
    eng.setBlade('R', 540, 1000, true); eng.step(400);
    assert.ok(eng.snapshot().hold.progress > 0.4 && !eng.snapshot().playing);
    eng.setBlade('R', 900, 1000, true); eng.step(16); assert.equal(eng.snapshot().hold.progress, 0);
    eng.setBlade('R', 540, 1000, true); eng.step(900);
    assert.equal(eng.snapshot().playing, true);
});

test('chuột (blade M) cũng giữ được nút nhưng không chém quả', () => {
    const eng = createEngine({ ...defaultConfig(), holdSeconds: 0.5, spawnPerSecond: 100 }); eng.holdTarget(540, 1000, 120);
    eng.setBlade('M', 540, 1000, true); eng.step(600);
    assert.equal(eng.snapshot().playing, true);
    oneFruitAt(eng, 540, 900); eng.setBlade('M', 400, 900, true); eng.step(16); eng.setBlade('M', 700, 900, true); eng.step(16);
    assert.equal(eng.snapshot().score, 0);
});

test('idleSpawnSeconds > 0 tự sinh quả khi hàng đợi rỗng', () => {
    const eng = createEngine({ ...defaultConfig(), idleSpawnSeconds: 1, spawnPerSecond: 100 }); eng.start();
    eng.step(1100);
    assert.equal(eng.snapshot().objects.length, 1);
});

test('holdTarget gọi lại mỗi khung với cùng vị trí không làm mất tiến độ giữ', () => {
    const eng = createEngine({ ...defaultConfig(), holdSeconds: 0.5 });
    for (let i = 0; i < 40; i++) { eng.holdTarget(540, 1000, 120); eng.setBlade('R', 540, 1000, true); eng.step(16); }
    assert.equal(eng.snapshot().playing, true);
});
test('holdTarget đổi vị trí thì tiến độ giữ về 0', () => {
    const eng = createEngine({ ...defaultConfig(), holdSeconds: 0.85 }); eng.holdTarget(540, 1000, 120);
    eng.setBlade('R', 540, 1000, true); eng.step(400);
    eng.holdTarget(540, 1400, 120);
    assert.equal(eng.snapshot().hold.progress, 0);
});

test('tổng hàng đợi sinh quả có trần 300 dù nhiều quà liên tiếp', () => {
    const eng = createEngine({ ...defaultConfig(), maxPerGift: 30 }); eng.start();
    for (let i = 0; i < 20; i++) eng.enqueue('apple', 30);
    assert.equal(eng.snapshot().queue, 300);
});
