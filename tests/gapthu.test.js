const test = require('node:test');
const assert = require('node:assert');
const G = require('../lib/gapthu');

// rng trả lần lượt các số trong mảng (lặp lại số cuối)
const seq = (...xs) => { let i = 0; return () => xs[Math.min(i++, xs.length - 1)]; };

test('defaultConfig: có giải, tỉ lệ 35%, bảo hiểm 5, anyGift bật', () => {
    const c = G.defaultConfig();
    assert.ok(c.prizes.length >= 4);
    assert.strictEqual(c.winRate, 35);
    assert.strictEqual(c.pity, 5);
    assert.strictEqual(c.anyGift, true);
    assert.strictEqual(c.enabled, true);
});

test('normalizeConfig: kẹp số, giữ giải hợp lệ, tự cấp id', () => {
    const c = G.normalizeConfig({ winRate: 150, pity: -3, turnSec: 9,
        prizes: [{ name: '  Kẹo  ', icon: '🍬', weight: '2' }, { name: '', icon: '' }, { name: 'X', weight: -5 }],
        gifts: [{ giftId: 12, turns: 50 }, { giftName: 'không id' }], display: { scale: 5000, theme: 'lạ' } });
    assert.strictEqual(c.winRate, 100);
    assert.strictEqual(c.pity, 0);
    assert.strictEqual(c.turnSec, 5);
    assert.deepStrictEqual(c.prizes.map(p => [p.name, p.icon, p.weight]), [['Kẹo', '🍬', 2], ['X', '🎁', 0]]);
    assert.ok(c.prizes.every(p => p.id));
    assert.deepStrictEqual(c.gifts.map(g => [g.giftId, g.turns, g.sure]), [['12', 10, false]]);
    assert.strictEqual(c.display.scale, 200);
    assert.strictEqual(c.display.theme, 'pink');
    assert.deepStrictEqual(G.normalizeConfig(null), G.defaultConfig());
});

test('pickPrize: theo trọng số, bỏ giải weight 0', () => {
    const prizes = [{ id: 'a', weight: 1 }, { id: 'z', weight: 0 }, { id: 'b', weight: 3 }];
    assert.strictEqual(G.pickPrize(prizes, () => 0).id, 'a');
    assert.strictEqual(G.pickPrize(prizes, () => 0.24).id, 'a');
    assert.strictEqual(G.pickPrize(prizes, () => 0.26).id, 'b');
    assert.strictEqual(G.pickPrize(prizes, () => 0.999).id, 'b');
    assert.strictEqual(G.pickPrize([{ id: 'z', weight: 0 }], () => 0.5), null);
    assert.strictEqual(G.pickPrize([], () => 0.5), null);
});

test('prizeOdds: % thực của từng giải', () => {
    assert.deepStrictEqual(G.prizeOdds([{ weight: 1 }, { weight: 3 }, { weight: 0 }]), [25, 75, 0]);
    assert.deepStrictEqual(G.prizeOdds([{ weight: 0 }]), [0]);
});

test('rollGrab: winRate quyết trúng/trượt', () => {
    const cfg = G.normalizeConfig({ winRate: 40, pity: 0 });
    // rng: clawX, cú quyết (0.39 < 0.40 → trúng), chọn giải
    assert.strictEqual(G.rollGrab(cfg, {}, seq(0.5, 0.39, 0)).win, true);
    assert.strictEqual(G.rollGrab(cfg, {}, seq(0.5, 0.41, 0)).win, false);
    assert.strictEqual(G.rollGrab(G.normalizeConfig({ winRate: 0, pity: 0 }), {}, seq(0.5, 0, 0)).win, false);
    assert.strictEqual(G.rollGrab(G.normalizeConfig({ winRate: 100 }), {}, seq(0.5, 0.9999, 0)).win, true);
});

test('rollGrab: trúng có giải, trượt có slipAt; clawX luôn trong máy', () => {
    const cfg = G.normalizeConfig({ winRate: 50, pity: 0 });
    const w = G.rollGrab(cfg, {}, seq(0, 0, 0));
    assert.ok(w.prize && w.prize.name);
    assert.ok(w.clawX >= 0.12 && w.clawX <= 0.88);
    const l = G.rollGrab(cfg, {}, seq(1, 0.99, 1));
    assert.strictEqual(l.prize, null);
    assert.ok(l.slipAt >= 0.25 && l.slipAt <= 0.75);
    assert.ok(l.clawX >= 0.12 && l.clawX <= 0.88);
});

test('rollGrab: quà chắc trúng và bảo hiểm', () => {
    const cfg = G.normalizeConfig({ winRate: 0, pity: 3 });
    assert.strictEqual(G.rollGrab(cfg, { sure: true }, seq(0.5, 0.9, 0)).win, true);
    assert.strictEqual(G.rollGrab(cfg, { misses: 2 }, seq(0.5, 0.9, 0)).win, false);
    const p = G.rollGrab(cfg, { misses: 3 }, seq(0.5, 0.9, 0));
    assert.strictEqual(p.win, true);
    assert.strictEqual(p.pityHit, true);
});

test('rollGrab: không còn giải nào (weight toàn 0) → trượt', () => {
    const cfg = G.normalizeConfig({ winRate: 100, prizes: [{ name: 'A', weight: 0 }] });
    assert.strictEqual(G.rollGrab(cfg, { sure: true }, seq(0.5, 0, 0)).win, false);
});

test('nextMisses: trúng về 0, trượt +1', () => {
    assert.strictEqual(G.nextMisses(4, { win: true }), 0);
    assert.strictEqual(G.nextMisses(4, { win: false }), 5);
});
