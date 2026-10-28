// node --test tests/bancung-bow-stall.test.mjs
// Phao bow-anim: khung vẽ (rAF) dừng → cung không bước → mũi tên phải tự buông sau drawMs + 250ms.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const HpBow = require('../public/games/bancung/bow-anim.js');

const wait = ms => new Promise(r => setTimeout(r, ms));

test('rAF đứng im: không ai gọi step() → vẫn tự buông sau drawMs + 250ms', async () => {
    const c = HpBow.createController();
    const rel = [];
    c.shoot(lead => rel.push(lead), { drawMs: 60 });
    await wait(200);
    assert.equal(rel.length, 0, 'chưa tới hạn thì chưa buông');
    await wait(250);
    assert.equal(rel.length, 1, 'quá hạn → tự buông');
    assert.ok(rel[0] >= 300, 'báo đúng độ trễ ' + rel[0]);
    assert.equal(c.queue.length, 0, 'hàng chờ đã trống');
});

test('rAF chạy bình thường: đã buông theo nhịp thì phao không buông lần 2', async () => {
    const c = HpBow.createController();
    const rel = [];
    c.shoot(lead => rel.push(lead), { drawMs: 60 });
    const t0 = performance.now();
    while (performance.now() - t0 < 200) { c.step(performance.now()); await wait(16); }
    assert.equal(rel.length, 1);
    await wait(200);
    assert.equal(rel.length, 1, 'không gọi lại');
});

test('đồng hồ giả (opts.now) → không đặt phao theo đồng hồ thật', async () => {
    const c = HpBow.createController();
    const rel = [];
    c.shoot(lead => rel.push(lead), { drawMs: 40, now: 0 });
    await wait(350);
    assert.equal(rel.length, 0);
    assert.equal(c.queue.length, 1);
});
