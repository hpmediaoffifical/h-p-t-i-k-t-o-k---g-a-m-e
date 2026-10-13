'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../public/games/hoasi/game.js');
const { defaultConfig, normalizeConfig, normalizeAction, actionForGift, shotsForGift, giftPlan, ACTION_TYPES } = G;
// rng tất định (mulberry32) — cùng helper với tests/dapmuoi-engine.test.js.
const seeded = (seed) => { let t = seed; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ t >>> 15, 1 | t); r ^= r + Math.imul(r ^ r >>> 7, 61 | r); return ((r ^ r >>> 14) >>> 0) / 4294967296; }; };

// ---------- Task 1: config, hành động, luật quà ----------

test('defaultConfig đúng spec và là bản sao', () => {
    const a = defaultConfig(), b = defaultConfig();
    assert.equal(a.enabled, true); assert.equal(a.aimFace, true);
    assert.equal(a.paintSize, 10.5); assert.equal(a.waterSize, 14.5); assert.equal(a.paintOpacity, 92);
    assert.equal(a.flightMs, 460); assert.equal(a.shotsPerSecond, 6); assert.equal(a.shieldScale, 100);
    assert.equal(a.wipeSpeed, 100); assert.equal(a.minFingers, 2); assert.equal(a.wristFallback, true);
    assert.deepEqual(a.full, { enabled: true, percent: 95, holdSec: 1.5, autoWash: true, washAfterSec: 4 });
    assert.equal(a.maxPerGift, 50); assert.equal(a.coinsPerShot, 1); assert.deepEqual(a.giftRules, []);
    assert.deepEqual(a.actions.map(x => x.type), ACTION_TYPES);
    assert.deepEqual(ACTION_TYPES, ['paint', 'storm', 'water', 'shield', 'wash']);
    assert.equal(a.actions[0].params.count, 5);
    assert.deepEqual(a.actions[1].params, { seconds: 10, percent: 100 });
    assert.equal(a.actions[2].params.count, 3); assert.equal(a.actions[3].params.seconds, 10);
    assert.deepEqual(a.actions[4].params, {});
    assert.deepEqual(a.sound, { enabled: true, volume: 0.5 });
    assert.deepEqual(a.display, { showHud: true, hudXPercent: 50, hudYPercent: 8, hudScale: 100, showLastThrower: true, showWipe: false });
    assert.equal(a.quality, 'auto');
    a.paintSize = 1; a.actions.length = 0; a.full.percent = 1;
    assert.equal(b.paintSize, 10.5); assert.equal(b.actions.length, 5); assert.equal(b.full.percent, 95);
});

test('normalizeConfig kẹp và config rác giữ mặc định', () => {
    assert.equal(normalizeConfig({ paintSize: 99 }).paintSize, 20);
    assert.equal(normalizeConfig({ paintSize: 1 }).paintSize, 5);
    const junk = normalizeConfig({ paintSize: 'abc', wipeSpeed: null, minFingers: '' });
    assert.equal(junk.paintSize, 10.5); assert.equal(junk.wipeSpeed, 100); assert.equal(junk.minFingers, 2);
    assert.deepEqual(normalizeConfig({ full: 'x' }).full, defaultConfig().full);
    assert.equal(normalizeConfig({ full: { percent: 10 } }).full.percent, 50);
    assert.equal(normalizeConfig({ full: { autoWash: false } }).full.autoWash, false);
    assert.equal(normalizeConfig({ actions: 'x' }).actions.length, 5);
    assert.deepEqual(normalizeConfig({ actions: [] }).actions, []);
    assert.equal(normalizeConfig({ quality: 'zzz' }).quality, 'auto');
    assert.equal(normalizeConfig({ enabled: false }).enabled, false);
    assert.equal(normalizeConfig({ wristFallback: false }).wristFallback, false);
    assert.equal(normalizeConfig({ display: { hudScale: 999 } }).display.hudScale, 300);
    assert.equal(normalizeConfig({ sound: { volume: 5 } }).sound.volume, 1);
    assert.equal(normalizeConfig(null).paintSize, 10.5);
    const r = normalizeConfig({ giftRules: [{ giftId: 5, count: 0 }] }).giftRules[0];
    assert.equal(r.giftId, '5'); assert.equal(r.count, 1); assert.equal(r.enabled, true);
});

test('normalizeAction: loại lạ → paint, khoá lạ bỏ, chữ giữ mặc định', () => {
    assert.equal(normalizeAction({ type: 'zzz' }, 0).type, 'paint');
    const a = normalizeAction({ type: 'storm', params: { seconds: 99, percent: 'a', foo: 1 } }, 0);
    assert.deepEqual(a.params, { seconds: 30, percent: 100 });
    assert.equal(a.icon, '🌧'); assert.equal(a.name, 'Mưa sơn'); assert.equal(a.enabled, true);
    assert.deepEqual(normalizeAction({ type: 'wash', params: { x: 1 } }, 0).params, {});
});

test('actionForGift id trước, tên dự phòng, bỏ hành động tắt', () => {
    const cfg = normalizeConfig({ actions: [
        { type: 'storm', giftId: '11', giftName: 'Rose' },
        { type: 'water', giftId: '22', giftName: 'Heart', enabled: false },
        { type: 'shield', giftName: 'Galaxy' }
    ] });
    assert.equal(actionForGift(cfg, 11, 'x').type, 'storm');
    assert.equal(actionForGift(cfg, '', 'rose').type, 'storm');
    assert.equal(actionForGift(cfg, '22', 'Heart'), null);
    assert.equal(actionForGift(cfg, '99', 'GALAXY').type, 'shield');
    assert.equal(actionForGift(cfg, '99', 'nope'), null);
});

test('shotsForGift: hành động → 0, rule, rule tắt, theo xu, trần', () => {
    const cfg = normalizeConfig({
        actions: [{ type: 'storm', giftId: '1' }],
        giftRules: [{ giftId: '5', count: 3 }, { giftId: '6', count: 9, enabled: false }],
        coinsPerShot: 2
    });
    assert.equal(shotsForGift(cfg, '1', '', 100, 1), 0);
    assert.equal(shotsForGift(cfg, '5', '', 1, 2), 6);
    assert.equal(shotsForGift(cfg, '6', '', 1000, 1), 0);
    assert.equal(shotsForGift(cfg, '7', '', 7, 3), 10);
    assert.equal(shotsForGift({ ...cfg, coinsPerShot: 0 }, '7', '', 7, 3), 0);
    assert.equal(shotsForGift(cfg, '7', '', 1000, 1), 50);
    assert.equal(shotsForGift(cfg, '5', '', 1, 99), 50);
});

test('giftPlan nhân repeat có trần', () => {
    const cfg = normalizeConfig({ actions: [
        { type: 'paint', giftId: 'p' }, { type: 'storm', giftId: 's' }, { type: 'shield', giftId: 'h' },
        { type: 'water', giftId: 'w' }, { type: 'wash', giftId: 'x' }
    ] });
    const p = giftPlan(cfg, { giftId: 'p', repeatCount: 20 });
    assert.equal(p.action, 'paint'); assert.equal(p.params.count, 50); assert.equal(p.icon, '🎨');
    assert.deepEqual(giftPlan(cfg, { giftId: 's', repeatCount: 5 }).params, { seconds: 30, percent: 100 });
    assert.deepEqual(giftPlan(cfg, { giftId: 's', repeatCount: 2 }).params, { seconds: 20, percent: 100 });
    assert.equal(giftPlan(cfg, { giftId: 'h', repeatCount: 9 }).params.seconds, 60);
    assert.equal(giftPlan(cfg, { giftId: 'w', repeatCount: 2 }).params.count, 6);
    const w = giftPlan(cfg, { giftId: 'x', repeatCount: 3 });
    assert.equal(w.action, 'wash'); assert.deepEqual(w.params, {});
    assert.deepEqual(giftPlan(cfg, { giftId: 'zz', giftName: 'Rose', coinValue: 3, repeatCount: 1 }),
        { action: 'paint', params: { count: 3 }, name: 'Ném sơn', icon: '🎨' });
    assert.equal(giftPlan(cfg, { giftId: 'zz', coinValue: 0, repeatCount: 1 }), null);
    assert.equal(giftPlan(normalizeConfig({ enabled: false }), { giftId: 'zz', coinValue: 9 }), null);
});

// ---------- Task 2: cục bay, chọn ô, nước, mưa, khiên ----------
const { createEngine, COLS } = G;
const FACE = { x: 540, y: 600, width: 300 };          // ô mặt: hàng 5, cột 6 → 66
const FACE_CELL = 66, CENTER_CELL = 9 * 12 + 6;
const rc = (i) => [Math.floor(i / COLS), i % COLS];
const manhattan = (a, b) => { const [r1, c1] = rc(a), [r2, c2] = rc(b); return Math.abs(r1 - r2) + Math.abs(c1 - c2); };
const cellCenter = (i) => ({ x: (i % 12 + 0.5) * 90, y: (Math.floor(i / 12) + 0.5) * 1920 / 18 });
const inDome = (d, p) => ((p.x - d.cx) / d.rx) ** 2 + ((p.y - d.cy) / d.ry) ** 2 <= 1;
// Chạy ms theo bước 10 ms; hook chạy trước mỗi bước (giữ mặt "tươi" như overlay gửi mỗi khung AI).
function run(eng, ms, hook) { const ev = []; for (let t = 0; t < ms; t += 10) { if (hook) hook(eng); ev.push(...eng.step(10)); } return ev; }
const of = (ev, type) => ev.filter(e => e.type === type);
const mk = (over) => createEngine({ ...defaultConfig(), ...over }, { random: seeded(7) });
const cov = (fill, set) => { const c = new Array(216).fill(fill); for (const [i, v] of Object.entries(set || {})) c[i] = v; return c; };

test('nhịp phóng shotsPerSecond, hàng đợi trần 500', () => {
    const eng = mk();
    assert.equal(eng.enqueuePaint(20, 'a'), 20);
    assert.equal(of(run(eng, 1000), 'launch').length, 6);
    assert.equal(eng.snapshot().queue, 14);
    assert.equal(eng.enqueuePaint(1000, 'b'), 486);
});

test('cục bay tới đích sau flightMs, rơi đúng ô', () => {
    const eng = mk();
    eng.enqueuePaint(1, 'An');
    const l = of(run(eng, 200), 'launch'); assert.equal(l.length, 1);
    const t1 = eng.snapshot().flights[0].t;
    assert.equal(of(run(eng, 400), 'splat').length, 0);
    assert.ok(eng.snapshot().flights[0].t > t1);
    const s = of(run(eng, 100), 'splat'); assert.equal(s.length, 1);
    assert.equal(s[0].cell, l[0].cell); assert.equal(s[0].by, 'An');
    assert.equal(Math.floor(s[0].x / 90), s[0].cell % 12);
    assert.equal(Math.floor(s[0].y / (1920 / 18)), Math.floor(s[0].cell / 12));
    assert.ok(Math.abs(s[0].r - 113.4) < 0.01);
    assert.equal(eng.snapshot().cells[s[0].cell], 1); assert.equal(eng.snapshot().lastBy, 'An');
    assert.equal(eng.snapshot().flights.length, 0);
});

test('nhắm mặt trước: phát đầu vào 3×3 quanh mặt', () => {
    const eng = mk({ shotsPerSecond: 30 });
    eng.enqueuePaint(10, 'a');
    const l = of(run(eng, 400, e => e.setFace(FACE)), 'launch');
    assert.equal(l.length, 10);
    for (const e of l) assert.ok(manhattan(e.cell, FACE_CELL) <= 2 && Math.abs(rc(e.cell)[0] - 5) <= 1 && Math.abs(rc(e.cell)[1] - 6) <= 1, 'ô ' + e.cell);
});

test('mặt phủ ≥55% thì lan ra quanh mặt', () => {
    const eng = mk({ shotsPerSecond: 30 });
    const box = {}; for (let r = 4; r <= 6; r++) for (let c = 5; c <= 7; c++) box[r * 12 + c] = 1;
    eng.setCoverage(cov(0, box), 9 / 216);
    eng.enqueuePaint(5, 'a');
    const l = of(run(eng, 300, e => e.setFace(FACE)), 'launch');
    assert.equal(l.length, 5);
    for (const e of l) { assert.ok(!(e.cell in box), 'trong 3×3: ' + e.cell); assert.ok(manhattan(e.cell, FACE_CELL) <= 6, 'xa quá: ' + e.cell); }
});

test('không có mặt chọn ô ít phủ nhất', () => {
    const eng = mk();
    eng.setCoverage(cov(1, { 100: 0 }), 215 / 216);
    eng.enqueuePaint(1, 'a');
    assert.equal(of(run(eng, 300), 'launch')[0].cell, 100);
});

test('phạt ô đang bay: 2 phát liền vào 2 ô khác nhau', () => {
    const eng = mk({ shotsPerSecond: 30 });
    eng.setCoverage(cov(1, { 10: 0, 11: 0 }), 214 / 216);
    eng.enqueuePaint(2, 'a');
    const l = of(run(eng, 100), 'launch');
    assert.deepEqual(l.map(e => e.cell).sort((a, b) => a - b), [10, 11]);
});

test('nước nhắm ô bẩn nhất và rửa ô đó', () => {
    const eng = mk();
    eng.setCoverage(cov(0, { 77: 1 }), 1 / 216);
    eng.water(1, 'w');
    const ev = run(eng, 600);
    const l = of(ev, 'launch'); assert.equal(l.length, 1); assert.equal(l[0].kind, 'water'); assert.equal(l[0].cell, 77);
    const w = of(ev, 'wash'); assert.equal(w.length, 2);
    assert.equal(w[0].strength, 0.9); assert.equal(w[1].strength, 0.76);
    assert.ok(Math.abs(w[1].r - w[0].r * 0.62) < 0.01); assert.ok(Math.abs(w[0].r - 156.6) < 0.01);
    assert.ok(Math.abs(eng.snapshot().cells[77] - 0.1) < 1e-6);
});

test('nước khi màn sạch nhắm mặt, không mặt thì giữa màn; cách 240 ms', () => {
    const eng = mk();
    eng.water(2, 'w');
    const at = [];
    for (let t = 0; t < 400; t += 10) { eng.setFace(FACE); for (const e of eng.step(10)) if (e.type === 'launch') at.push([eng.snapshot().clock, e.cell]); }
    assert.equal(at.length, 2); assert.equal(at[0][1], FACE_CELL); assert.equal(at[1][1], FACE_CELL);
    assert.ok(Math.abs(at[1][0] - at[0][0] - 240) <= 10);
    const e2 = mk(); e2.water(1, 'w');
    assert.equal(of(run(e2, 50), 'launch')[0].cell, CENTER_CELL);
});

test('mưa hẹn đủ ô trong seconds, không chịu nhịp', () => {
    const eng = mk();
    eng.storm(10, 50, 'm');
    const a = of(run(eng, 5000), 'launch');
    assert.ok(a.length >= 50 && a.length <= 58, 'ở 5s: ' + a.length);
    const b = a.concat(of(run(eng, 5600), 'launch'));
    assert.equal(b.length, 108);
    assert.equal(new Set(b.map(e => e.cell)).size, 108);
});

test('khiên: bỏ ô trong vòm, chặn sơn, nước xuyên', () => {
    const hook = e => e.setFace(FACE);
    const e1 = mk({ shotsPerSecond: 30 });
    e1.shield(10); e1.enqueuePaint(30, 'a');
    const l = of(run(e1, 1500, hook), 'launch');
    const dome = e1.snapshot().dome; assert.ok(dome);
    assert.equal(dome.cx, 540); assert.equal(dome.rx, 240); assert.ok(Math.abs(dome.ry - 276) < 1e-9);
    assert.equal(l.length, 30);
    for (const e of l) assert.ok(!inDome(dome, cellCenter(e.cell)), 'ô trong vòm: ' + e.cell);

    const e2 = mk(); e2.shield(10); e2.storm(2, 100, 's');
    const ev = run(e2, 3000, hook), d2 = e2.snapshot().dome;
    const splats = of(ev, 'splat'), blocks = of(ev, 'block');
    assert.ok(blocks.length >= 1);
    assert.equal(splats.length + blocks.length, 216);
    for (const s of splats) assert.ok(!inDome(d2, s), 'vết trong vòm');

    const e3 = mk(); e3.shield(10); e3.setCoverage(cov(0, { [FACE_CELL]: 1 }), 1 / 216); e3.water(1, 'w');
    const ev3 = run(e3, 600, hook);
    assert.equal(of(ev3, 'wash').length, 2); assert.equal(of(ev3, 'block').length, 0);
});

test('khiên cộng dồn trần 60s, mất mặt quá 1s thì tắt vòm', () => {
    const eng = mk();
    eng.shield(50); eng.shield(50);
    assert.equal(eng.snapshot().shieldMs, 60000);
    eng.setFace(FACE); assert.ok(eng.snapshot().dome);
    run(eng, 1500);
    assert.equal(eng.snapshot().dome, null);
    assert.ok(eng.snapshot().shieldMs > 0);
    eng.setFace(null); assert.equal(eng.snapshot().dome, null);
});

// ---------- Task 3: PHỦ KÍN, rửa, xoá ----------
const ALL = (v) => new Array(216).fill(v);
function fullEngine(over) {
    const eng = mk(over);
    eng.enqueuePaint(1, 'An'); run(eng, 700);              // 1 cú ném để có lastBy
    eng.setCoverage(ALL(1), 0.96);
    return eng;
}

test('PHỦ KÍN sau holdSec, chỉ một lần', () => {
    const eng = fullEngine({ full: { autoWash: false } });
    assert.equal(of(run(eng, 1400), 'full').length, 0);
    const f = of(run(eng, 200), 'full');
    assert.equal(f.length, 1); assert.equal(f[0].by, 'An');
    assert.equal(eng.snapshot().phase, 'full');
    assert.equal(of(run(eng, 2000), 'full').length, 0);
});

test('pha full dừng phóng', () => {
    const eng = fullEngine({ full: { autoWash: false } });
    run(eng, 1600);
    eng.enqueuePaint(5, 'b');
    assert.equal(of(run(eng, 1000), 'launch').length, 0);
});

test('tự rửa sau washAfterSec rồi chạy tiếp hàng đợi', () => {
    const eng = fullEngine();
    run(eng, 1500);
    assert.equal(eng.snapshot().phase, 'full');
    eng.enqueuePaint(3, 'b');
    assert.equal(of(run(eng, 3900), 'washStart').length, 0);
    const ws = of(run(eng, 200), 'washStart');
    assert.equal(ws.length, 1); assert.equal(ws[0].ms, 1200);
    assert.equal(eng.snapshot().phase, 'washing');
    eng.washDone();
    const ev = run(eng, 1000);
    assert.equal(of(ev, 'washDone').length, 1);
    const s = eng.snapshot();
    assert.equal(s.phase, 'play'); assert.equal(s.coverage, 0);
    assert.ok(Array.from(s.cells).every((v, i) => v === 0 || of(ev, 'splat').some(e => e.cell === i)));
    assert.ok(of(ev, 'launch').length >= 1);
});

test('không tự rửa: lau dưới ngưỡng thì về play', () => {
    const eng = fullEngine({ full: { autoWash: false } });
    run(eng, 1600);
    eng.setCoverage(ALL(0.8), 0.86); run(eng, 100);
    assert.equal(eng.snapshot().phase, 'full');
    eng.setCoverage(ALL(0.8), 0.80); run(eng, 100);
    assert.equal(eng.snapshot().phase, 'play');
});

test('lịch mưa đóng băng khi đang rửa', () => {
    const eng = mk();
    eng.storm(2, 100, 's');
    const a = of(run(eng, 1000), 'launch').length;
    assert.ok(a >= 100 && a <= 112, 'trước khi rửa: ' + a);
    eng.wash('x');
    assert.equal(of(run(eng, 3000), 'launch').length, 0);
    eng.washDone();
    assert.equal(a + of(run(eng, 1100), 'launch').length, 216);
});

test('full.enabled false không bao giờ full', () => {
    const eng = mk({ full: { enabled: false } });
    eng.setCoverage(ALL(1), 1);
    assert.equal(of(run(eng, 3000), 'full').length, 0);
    assert.equal(eng.snapshot().phase, 'play');
});

test('rửa tự xong nếu overlay không báo washDone', () => {
    const eng = mk();
    eng.wash('x');
    const ev = run(eng, 4000);
    assert.equal(of(ev, 'washStart').length, 1); assert.equal(of(ev, 'washDone').length, 1);
    assert.equal(eng.snapshot().phase, 'play');
});

test('wash / clear / reset', () => {
    const eng = mk();
    eng.wash('x');
    const w = of(eng.step(10), 'washStart'); assert.equal(w.length, 1); assert.equal(w[0].ms, 800);
    eng.washDone(); eng.step(10);
    eng.setCoverage(ALL(0.5), 0.5);
    eng.clear();
    assert.equal(of(eng.step(10), 'clear').length, 1);
    assert.ok(Array.from(eng.snapshot().cells).every(v => v === 0)); assert.equal(eng.snapshot().coverage, 0);
    eng.enqueuePaint(50, 'a'); eng.storm(10, 100, 's'); eng.water(3, 'w'); eng.shield(20); run(eng, 300);
    eng.reset();
    const s = eng.snapshot();
    assert.equal(s.queue, 0); assert.equal(s.scheduled, 0); assert.equal(s.shieldMs, 0);
    assert.equal(s.flights.length, 0); assert.equal(s.lastBy, ''); assert.equal(s.phase, 'play');
});
