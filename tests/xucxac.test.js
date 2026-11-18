const test = require('node:test');
const assert = require('node:assert');
const X = require('../lib/xucxac');

test('rollDice: đúng số viên, mỗi viên 1–6', () => {
    assert.deepStrictEqual(X.rollDice(1, () => 0), [1]);
    assert.deepStrictEqual(X.rollDice(3, () => 0.9999), [6, 6, 6]);
    assert.deepStrictEqual(X.rollDice(2, (() => { const v = [0.2, 0.5]; let i = 0; return () => v[i++]; })()), [2, 4]);
    assert.strictEqual(X.rollDice(9, Math.random).length, 3, 'kẹp tối đa 3');
    assert.strictEqual(X.rollDice(0, Math.random).length, 1, 'tối thiểu 1');
});

test('defaultOutcomes: phủ kín mọi tổng [n, 6n], không chồng', () => {
    for (const n of [1, 2, 3]) {
        const rows = X.defaultOutcomes(n);
        for (let t = n; t <= 6 * n; t++) {
            assert.strictEqual(rows.filter(r => t >= r.from && t <= r.to).length, 1, `n=${n} tổng ${t}`);
        }
        assert.ok(rows.every(r => r.text));
    }
});

test('outcomeFor: dòng đầu chứa tổng, không có → rỗng', () => {
    const cfg = { outcomes: [{ from: 1, to: 3, text: 'Thấp' }, { from: 3, to: 6, text: 'Cao' }] };
    assert.strictEqual(X.outcomeFor(cfg, 3), 'Thấp');
    assert.strictEqual(X.outcomeFor(cfg, 6), 'Cao');
    assert.strictEqual(X.outcomeFor(cfg, 7), '');
    assert.strictEqual(X.outcomeFor(null, 2), '');
});

test('normalizeConfig: kẹp số viên, cắt chữ, bỏ dòng sai, tối đa 12 dòng', () => {
    const long = 'a'.repeat(100);
    assert.strictEqual(X.normalizeConfig({ dice: 7 }).dice, 3);
    const c = X.normalizeConfig({ dice: 1, turnSec: 1, outcomes: [
        { from: 5, to: 2, text: 'sai' }, { from: 2, to: 2, text: long }, { from: '3', to: '4', text: '  ok ' }, { from: 1, to: 1, text: '' }
    ], display: { color: 'tím' } });
    assert.strictEqual(c.dice, 1);
    assert.strictEqual(c.turnSec, 3);
    assert.deepStrictEqual(c.outcomes.map(o => [o.from, o.to, o.text.length]), [[2, 2, 60], [3, 4, 2]]);
    assert.strictEqual(c.display.color, 'white');
    const many = X.normalizeConfig({ outcomes: Array.from({ length: 20 }, (_, i) => ({ from: 1, to: 6, text: 'x' + i })) });
    assert.strictEqual(many.outcomes.length, 12);
});

test('normalizeConfig(null) = mặc định 1 viên + bảng mặc định', () => {
    const c = X.normalizeConfig(null);
    assert.deepStrictEqual(c, X.defaultConfig());
    assert.strictEqual(c.dice, 1);
    assert.deepStrictEqual(c.outcomes, X.defaultOutcomes(1));
    assert.strictEqual(c.anyGift, true);
});

test('rollTurn: số + tổng + dòng kết quả', () => {
    const cfg = X.normalizeConfig({ dice: 2, outcomes: X.defaultOutcomes(2) });
    const r = X.rollTurn(cfg, () => 0.9999);
    assert.deepStrictEqual(r.values, [6, 6]);
    assert.strictEqual(r.total, 12);
    assert.strictEqual(r.text, X.outcomeFor(cfg, 12));
    assert.ok(r.text);
});

test('normalizeConfig: đổi số viên mà bảng cũ chỉ hợp số viên ít hơn → bảng mặc định của số viên mới', () => {
    // bảng 1 viên (tổng ≤ 6) dùng cho 2 viên: tổng 7–12 không có việc → thay bảng 2 viên
    assert.deepStrictEqual(X.normalizeConfig({ dice: 2, outcomes: X.defaultOutcomes(1) }).outcomes, X.defaultOutcomes(2));
    assert.deepStrictEqual(X.normalizeConfig({ dice: 3, outcomes: X.defaultOutcomes(2) }).outcomes, X.defaultOutcomes(3));
    // bảng 3 viên (tổng ≥ 7 hết) dùng cho 1 viên: không dòng nào trúng 1–6 → thay bảng 1 viên
    assert.deepStrictEqual(X.normalizeConfig({ dice: 1, outcomes: X.defaultOutcomes(3).filter(o => o.from > 6) }).outcomes, X.defaultOutcomes(1));
    // bảng dựng cho NHIỀU viên hơn (tổng nhỏ nhất bỏ trống, vượt quá tổng tối đa) → bảng của số viên hiện tại
    assert.deepStrictEqual(X.normalizeConfig({ dice: 2, outcomes: X.defaultOutcomes(3) }).outcomes, X.defaultOutcomes(2));
    assert.deepStrictEqual(X.normalizeConfig({ dice: 1, outcomes: X.defaultOutcomes(2) }).outcomes, X.defaultOutcomes(1));
    // bảng tự đặt có phủ một phần vùng mới thì GIỮ (streamer cố ý)
    const mine = [{ from: 2, to: 12, text: 'Mọi số: hát' }];
    assert.deepStrictEqual(X.normalizeConfig({ dice: 2, outcomes: mine }).outcomes, mine);
});