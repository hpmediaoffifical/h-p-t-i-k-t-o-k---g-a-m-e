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
