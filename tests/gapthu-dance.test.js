const test = require('node:test');
const assert = require('node:assert');
const G = require('../lib/gapthu');

const seq = (...xs) => { let i = 0; return () => xs[Math.min(i++, xs.length - 1)]; };
const PRIZES = [{ id: 'a', name: 'A', icon: '🅰', weight: 1 }];

test('normalizeConfig: khối dance có mặc định + kẹp', () => {
    const d = G.normalizeConfig(null).dance;
    assert.deepStrictEqual([d.enabled, d.pct, d.sec, d.cooldownSec, d.sound, d.image], [true, 6, 30, 120, true, '']);
    assert.ok(d.text.includes('{name}'));
    const c = G.normalizeConfig({ dance: { enabled: false, pct: 90, sec: 1, cooldownSec: -1, text: 'x'.repeat(200), image: 'javascript:alert(1)' } }).dance;
    assert.deepStrictEqual([c.enabled, c.pct, c.sec, c.cooldownSec, c.text.length, c.image], [false, 30, 5, 0, 80, '']);
    assert.strictEqual(G.normalizeConfig({ dance: { image: '/api/gapthu/dance-image?v=12' } }).dance.image, '/api/gapthu/dance-image?v=12');
});

test('danceReady: tắt / đang nhảy / đang hồi → không ra', () => {
    const cfg = G.normalizeConfig({ dance: { cooldownSec: 120 } });
    assert.strictEqual(G.danceReady(cfg, { now: 1e6, lastEndAt: 0 }), true);
    assert.strictEqual(G.danceReady(cfg, { now: 1e6, lastEndAt: 0, active: true }), false);
    assert.strictEqual(G.danceReady(cfg, { now: 1e6, lastEndAt: 1e6 - 119000 }), false);
    assert.strictEqual(G.danceReady(cfg, { now: 1e6, lastEndAt: 1e6 - 120000 }), true);
    assert.strictEqual(G.danceReady(G.normalizeConfig({ dance: { enabled: false } }), { now: 1e6, lastEndAt: 0 }), false);
});

test('rollGrab: sẵn sàng + số tung < pct → trúng giải Streamer', () => {
    const cfg = G.normalizeConfig({ winRate: 0, pity: 0, prizes: PRIZES, dance: { pct: 6 } });
    const r = G.rollGrab(cfg, { dance: true }, seq(0.5, 0.05));
    assert.deepStrictEqual([r.win, r.prize.id, r.dance], [true, G.DANCE_ID, true]);
    assert.strictEqual(G.rollGrab(cfg, { dance: true }, seq(0.5, 0.07, 0.9, 0.5)).win, false);
    assert.strictEqual(G.rollGrab(cfg, {}, seq(0.5, 0.01, 0.5)).win, false, 'không truyền dance: không ra, thứ tự rng như cũ');
});

test('syncDance: đúng 1 ô khi bật, không ô nào khi tắt', () => {
    const l = Array(21).fill('a');
    const on = G.syncDance(l, PRIZES, true, () => 0.5);
    assert.strictEqual(on.filter(x => x === G.DANCE_ID).length, 1);
    const again = G.syncDance(on, PRIZES, true, () => 0.1);
    assert.deepStrictEqual(again, on, 'đã có thì giữ nguyên chỗ');
    const two = on.slice(); two[0] = G.DANCE_ID; two[20] = G.DANCE_ID;
    assert.strictEqual(G.syncDance(two, PRIZES, true, () => 0).filter(x => x === G.DANCE_ID).length, 1);
    const off = G.syncDance(on, PRIZES, false, () => 0);
    assert.ok(off.every(x => x === 'a'));
    assert.deepStrictEqual(G.fixLayout(on, PRIZES, () => 0), on, 'fixLayout không xoá ô Streamer');
});

test('resolveSteer: kẹp trúng ô Streamer → giải Streamer', () => {
    const cfg = G.normalizeConfig({ winRate: 100, pity: 0, prizes: PRIZES });
    const l = Array(21).fill('a'); l[10] = G.DANCE_ID;
    const r = G.resolveSteer(cfg, l, { col: 3, row: 1 }, {}, seq(0, 0));
    assert.deepStrictEqual([r.win, r.prize.id, r.prize.dance], [true, G.DANCE_ID, true]);
});

function png(w, h, extra) {
    const b = Buffer.alloc(33 + (extra || 0));
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
    b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
    return b;
}

test('checkPng: chữ ký, khung, kích thước file', () => {
    assert.deepStrictEqual(G.checkPng(png(512, 640)), { ok: true, width: 512, height: 640 });
    assert.strictEqual(G.checkPng(Buffer.from('GIF89a........................')).ok, false);
    assert.strictEqual(G.checkPng(png(4000, 300)).error, 'too_big_dim');
    assert.strictEqual(G.checkPng(png(100, 100, 2 * 1024 * 1024)).error, 'too_big_file');
    assert.strictEqual(G.checkPng(Buffer.alloc(0)).error, 'not_png');
    assert.strictEqual(G.checkPng(null).error, 'not_png');
});
