'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine, defaultConfig } = require('../public/games/dapmuoi/game.js');

// ---------- Task 1: config, sinh, bay ----------

test('defaultConfig đúng số spec và là bản sao', () => {
    const a = defaultConfig(), b = defaultConfig();
    assert.equal(a.hitMode, 'clap'); assert.equal(a.clapDistance, 1.2); assert.equal(a.clapSpeed, 900);
    assert.equal(a.hitRadius, 14); assert.equal(a.speed, 180); assert.equal(a.spawnPerSecond, 6);
    assert.equal(a.maxOnScreen, 300); assert.equal(a.idleSpawnSeconds, 8); assert.equal(a.maxPerGift, 100);
    assert.equal(a.coinsPerMosquito, 1); assert.equal(a.gentlePercent, 35); assert.equal(a.crowdFrom, 120);
    assert.equal(a.smartPercent, 10); assert.equal(a.smartLives, 3);
    assert.equal(a.actions.length, 4); assert.deepEqual(a.actions.map(x => x.type), ['release', 'spray', 'racket', 'net']);
    a.speed = 1; a.actions.length = 0; assert.equal(b.speed, 180); assert.equal(b.actions.length, 4);
});

test('enqueue xả spawnPerSecond/giây, không vượt maxOnScreen, hàng đợi trần 2000', () => {
    const eng = createEngine({ ...defaultConfig(), spawnPerSecond: 6, maxOnScreen: 10, idleSpawnSeconds: 0 });
    assert.equal(eng.enqueue(5000), 2000);
    eng.step(1000); assert.equal(eng.snapshot().flying, 6);
    eng.step(1000); assert.equal(eng.snapshot().flying, 10);
    assert.equal(eng.snapshot().queue, 1990);
});

test('muỗi mới vào từ mép trái/phải, y trải 0–100%, dir theo vx', () => {
    const eng = createEngine({ ...defaultConfig(), spawnPerSecond: 1e6, idleSpawnSeconds: 0 });
    eng.enqueue(60); eng.step(16);
    const m = eng.snapshot().mosquitoes;
    assert.equal(m.length, 60);
    // sau 1 khung muỗi đã nhích ≤ 10px khỏi mép
    assert.ok(m.every(o => (o.x <= 10 && o.dir === 1) || (o.x >= 1070 && o.dir === -1)));
    assert.ok(m.some(o => o.x <= 10) && m.some(o => o.x >= 1070));
    assert.ok(m.every(o => o.y >= 0 && o.y <= 1920) && m.some(o => o.y < 300) && m.some(o => o.y > 1620));
});

test('sinh nền: idleSpawnSeconds=2 → sau 4s có 2 con khi hàng đợi rỗng', () => {
    const eng = createEngine({ ...defaultConfig(), idleSpawnSeconds: 2 });
    for (let i = 0; i < 250; i++) eng.step(16);
    assert.equal(eng.snapshot().flying, 2);
});

test('gentlePercent: speedMul bay nhẹ 0.25–0.5, còn lại 0.8–1.3; smartPercent gán smart + livesLeft', () => {
    const eng = createEngine({ ...defaultConfig(), spawnPerSecond: 1000, idleSpawnSeconds: 0, gentlePercent: 50, smartPercent: 50, smartLives: 3 });
    eng.enqueue(200); eng.step(16);
    const m = eng.snapshot().mosquitoes;
    assert.ok(m.every(x => (x.speedMul >= 0.25 && x.speedMul <= 0.5) || (x.speedMul >= 0.8 && x.speedMul <= 1.3)));
    assert.ok(m.some(x => x.speedMul <= 0.5) && m.some(x => x.speedMul >= 0.8));
    assert.ok(m.filter(x => x.smart).every(x => x.livesLeft === 3) && m.some(x => x.smart) && m.some(x => !x.smart));
});

test('muỗi bay về đích khắp sân: sau 60s có con ở 4 góc phần tư, không văng xa khỏi sân', () => {
    const eng = createEngine({ ...defaultConfig(), spawnPerSecond: 1000, idleSpawnSeconds: 0 });
    eng.enqueue(80); for (let i = 0; i < 3600; i++) eng.step(16);
    const m = eng.snapshot().mosquitoes;
    for (const [qx, qy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) assert.ok(m.some(o => (o.x > 540) === !!qx && (o.y > 960) === !!qy), `góc ${qx},${qy}`);
    assert.ok(m.every(o => o.x > -130 && o.x < 1210 && o.y > -130 && o.y < 2050));
});

test('hệ số đàn: flying > crowdFrom thì tốc độ trung bình giảm, sàn 0.4', () => {
    const mk = (n) => {
        const e = createEngine({ ...defaultConfig(), spawnPerSecond: 1e6, maxOnScreen: 5000, idleSpawnSeconds: 0, crowdFrom: 120, gentlePercent: 0, smartPercent: 0 });
        e.enqueue(n); e.step(16); e.step(16);
        const m = e.snapshot().mosquitoes; assert.equal(m.length, n);
        return m.reduce((s, o) => s + Math.hypot(o.vx, o.vy), 0) / m.length;
    };
    assert.ok(mk(240) < mk(60) * 0.7); assert.ok(mk(2000) > mk(60) * 0.3);
});

test('setFace: faceAttract bật → trong 20s có ≥30% muỗi trong faceRadius quanh mặt', () => {
    const eng = createEngine({ ...defaultConfig(), spawnPerSecond: 1000, idleSpawnSeconds: 0, faceRadius: 260 });
    eng.enqueue(100); for (let i = 0; i < 1200; i++) { eng.setFace(540, 500); eng.step(16); }
    const near = eng.snapshot().mosquitoes.filter(o => Math.hypot(o.x - 540, o.y - 500) <= 260).length;
    assert.ok(near >= 30, `near=${near}`);
});

// ---------- Task 2: đập, chết, combo, muỗi thông minh ----------

function one(cfgExtra = {}) {
    const e = createEngine({ ...defaultConfig(), spawnPerSecond: 1e6, idleSpawnSeconds: 0, smartPercent: 0, ...cfgExtra });
    e.enqueue(1); e.step(16); return e;
}

test('hit trúng trong r + nửa cỡ muỗi: chết, score/killed +1, event kill; hụt → event miss', () => {
    const e = one(); const m = e.snapshot().mosquitoes[0];
    assert.equal(e.hit(m.x + 9999, m.y, 100), 0); assert.equal(e.snapshot().events[0].type, 'miss');
    assert.equal(e.hit(m.x + 150 + 70, m.y, 150), 1);
    const s = e.snapshot(); assert.equal(s.score, 1); assert.equal(s.killed, 1); assert.equal(s.flying, 0);
    assert.equal(s.mosquitoes[0].state, 'dead'); assert.equal(s.events[0].type, 'kill'); assert.equal(s.events[0].n, 1);
});

test('muỗi chết rơi với g=1600, xoá khi y > H+100 hoặc sau 2.5s', () => {
    const e = one(); const m = e.snapshot().mosquitoes[0]; e.hit(m.x, m.y, 10);
    e.step(16); const vy1 = e.snapshot().mosquitoes[0].vy; e.step(500); const vy2 = e.snapshot().mosquitoes[0].vy;
    assert.ok(vy2 > vy1); for (let i = 0; i < 200; i++) e.step(16);
    assert.equal(e.snapshot().mosquitoes.length, 0);
});

test('combo: 2 cú trúng cách < 1.5s → combo 2; cách 2s → về 1', () => {
    const e = createEngine({ ...defaultConfig(), spawnPerSecond: 1e6, idleSpawnSeconds: 0, smartPercent: 0 });
    e.enqueue(3); e.step(16);
    const fly = () => e.snapshot().mosquitoes.find(o => o.state === 'fly');   // đọc toạ độ MỚI trước mỗi cú
    let m = fly(); e.hit(m.x, m.y, 1); e.step(500); m = fly(); e.hit(m.x, m.y, 1); assert.equal(e.snapshot().combo, 2);
    e.step(2000); m = fly(); e.hit(m.x, m.y, 1); assert.equal(e.snapshot().combo, 1);
});

test('muỗi thông minh né smartLives−1 lần rồi chết; lúc dodge bất tử, vụt xa ≥ 300px', () => {
    const e = one({ smartPercent: 100, smartLives: 3 });
    let m = e.snapshot().mosquitoes[0]; assert.equal(m.livesLeft, 3);
    assert.equal(e.hit(m.x, m.y, 1), 0);
    let s = e.snapshot(); assert.equal(s.events[0].type, 'dodge'); assert.equal(s.mosquitoes[0].state, 'dodge'); assert.equal(s.mosquitoes[0].livesLeft, 2);
    assert.equal(e.hit(s.mosquitoes[0].x, s.mosquitoes[0].y, 2000), 0);   // bất tử lúc né
    for (let i = 0; i < 25; i++) e.step(16);
    m = e.snapshot().mosquitoes[0]; assert.equal(m.state, 'fly'); assert.ok(Math.hypot(m.x - s.mosquitoes[0].x, m.y - s.mosquitoes[0].y) >= 300);
    assert.equal(e.hit(m.x, m.y, 1), 0); for (let i = 0; i < 25; i++) e.step(16);
    m = e.snapshot().mosquitoes[0]; assert.equal(m.livesLeft, 1);
    assert.equal(e.hit(m.x, m.y, 1), 1);
});
