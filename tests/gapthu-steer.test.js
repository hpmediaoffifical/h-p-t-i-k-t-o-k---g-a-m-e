const test = require('node:test');
const assert = require('node:assert');
const G = require('../lib/gapthu');

const seq = (...xs) => { let i = 0; return () => xs[Math.min(i++, xs.length - 1)]; };
const PRIZES = [{ id: 'a', name: 'A', icon: '🅰', weight: 1 }, { id: 'b', name: 'B', icon: '🅱', weight: 1 }];
// lưới 7×3 toàn 'a', trừ vài ô được đặt riêng
function grid(over) { const l = Array(21).fill('a'); Object.entries(over || {}).forEach(([i, v]) => { l[i] = v; }); return l; }
const at = (col, row) => ({ col, row });

test('normalizeConfig: khoá tự lái có mặc định + kẹp phạm vi', () => {
    const d = G.normalizeConfig(null);
    assert.deepStrictEqual([d.steerMinCoins, d.steerSec, d.steerSteps, d.steerBonus], [99, 15, 8, 15]);
    const c = G.normalizeConfig({ steerMinCoins: -5, steerSec: 99, steerSteps: 1, steerBonus: 80 });
    assert.deepStrictEqual([c.steerMinCoins, c.steerSec, c.steerSteps, c.steerBonus], [0, 30, 3, 50]);
});

test('turnMode: quà ≥ ngưỡng xu → tự lái; ngưỡng 0 = tắt', () => {
    const cfg = G.normalizeConfig({ steerMinCoins: 99 });
    assert.strictEqual(G.turnMode(cfg, 99), 'steer');
    assert.strictEqual(G.turnMode(cfg, 98), 'auto');
    assert.strictEqual(G.turnMode(cfg, 'x'), 'auto');
    assert.strictEqual(G.turnMode(G.normalizeConfig({ steerMinCoins: 0 }), 100000), 'auto');
});

test('cellIndex / cellPos: hàng 0 sát kính, 7 cột', () => {
    assert.strictEqual(G.GRID.cols * G.GRID.rows, 21);
    assert.strictEqual(G.cellIndex(at(3, 1)), 10);
    assert.deepStrictEqual(G.cellPos(10), at(3, 1));
    assert.deepStrictEqual(G.START, at(3, 1));
});

test('fixLayout: đủ 21 ô, giữ ô hợp lệ, thay id lạ / giải tỉ trọng 0', () => {
    const prizes = [...PRIZES, { id: 'z', name: 'Z', icon: 'Z', weight: 0 }];
    const l = G.fixLayout(['a', 'zz', 'z', 'b'], prizes, () => 0);
    assert.strictEqual(l.length, 21);
    assert.deepStrictEqual(l.slice(0, 4), ['a', 'a', 'a', 'b']);
    assert.ok(l.every(id => id === 'a' || id === 'b'));
    assert.deepStrictEqual(G.fixLayout(null, [{ id: 'z', name: 'Z', weight: 0 }], () => 0), Array(21).fill(null), 'không còn giải → ô trống');
});

test('refillCell: chỉ đổi đúng ô, trả mảng mới', () => {
    const l = grid();
    const n = G.refillCell(l, 5, PRIZES, () => 0.9);
    assert.strictEqual(n[5], 'b');
    assert.strictEqual(l[5], 'a', 'không sửa mảng cũ');
    assert.deepStrictEqual(n.filter((_, i) => i !== 5), l.filter((_, i) => i !== 5));
});

test('autoCell: trúng → ô có đúng giải; không có thì đặt giải vào 1 ô', () => {
    const l = grid({ 7: 'b' });
    assert.strictEqual(G.autoCell(l, { win: true, prize: { id: 'b' } }, () => 0.5).cell, 7);
    const r = G.autoCell(grid(), { win: true, prize: { id: 'b' } }, () => 0);
    assert.strictEqual(r.layout[r.cell], 'b');
    const miss = G.autoCell(l, { win: false }, () => 0);
    assert.ok(miss.cell >= 0 && miss.cell < 21);
});

test('parseSteer: hướng có/không dấu, số bước, lặp từ, chuỗi wasd', () => {
    const L = [-1, 0], R = [1, 0], IN = [0, 1], OUT = [0, -1];
    assert.deepStrictEqual(G.parseSteer('Trái'), { moves: [L], grab: false });
    assert.deepStrictEqual(G.parseSteer('phai 3'), { moves: [R, R, R], grab: false });
    assert.deepStrictEqual(G.parseSteer('vào vào ra'), { moves: [IN, IN, OUT], grab: false });
    assert.deepStrictEqual(G.parseSteer('aaw'), { moves: [L, L, IN], grab: false });
    assert.deepStrictEqual(G.parseSteer('qua phải 2 nha'), { moves: [R, R], grab: false });
    assert.deepStrictEqual(G.parseSteer('lên xuống'), { moves: [IN, OUT], grab: false });
});

test('parseSteer: gắp / thả, kèm bước rồi gắp', () => {
    assert.deepStrictEqual(G.parseSteer('GẮP!'), { moves: [], grab: true });
    assert.deepStrictEqual(G.parseSteer('tha'), { moves: [], grab: true });
    assert.deepStrictEqual(G.parseSteer('trái 2 gắp'), { moves: [[-1, 0], [-1, 0]], grab: true });
});

test('parseSteer: có từ lạ → trò chuyện (null); tối đa 5 bước/bình luận', () => {
    assert.strictEqual(G.parseSteer('ra đây chị ơi'), null);
    assert.strictEqual(G.parseSteer('hay quá'), null);
    assert.strictEqual(G.parseSteer(''), null);
    assert.strictEqual(G.parseSteer('qua nha'), null, 'chỉ toàn từ đệm = trò chuyện');
    assert.strictEqual(G.parseSteer('trái 9').moves.length, 5);
    assert.strictEqual(G.parseSteer('dddddddd').moves.length, 5);
});

test('applyMoves: theo ngân sách, va vách không tốn bước', () => {
    const r = G.applyMoves(at(0, 0), [[-1, 0], [1, 0], [1, 0], [0, 1]], 2);
    assert.deepStrictEqual(r.pos, at(2, 0));
    assert.strictEqual(r.used, 2);
    assert.deepStrictEqual(r.last, [1, 0]);
    const w = G.applyMoves(at(6, 2), [[1, 0], [0, 1]], 5);
    assert.deepStrictEqual([w.pos, w.used], [at(6, 2), 0]);
});

test('resolveSteer: nhắm đúng ô, lực kẹp = winRate + steerBonus', () => {
    const cfg = G.normalizeConfig({ winRate: 35, steerBonus: 15, pity: 0, prizes: PRIZES });
    const l = grid({ 10: 'b' });
    // rng: bốc vật (0 → ô đầu danh sách = ô dưới càng), lực kẹp 0.49 < 0.50
    const w = G.resolveSteer(cfg, l, at(3, 1), {}, seq(0, 0.49));
    assert.deepStrictEqual([w.win, w.cell, w.prize.id, w.kind], [true, 10, 'b', 'grab']);
    const s = G.resolveSteer(cfg, l, at(3, 1), {}, seq(0, 0.51, 0.5));
    assert.deepStrictEqual([s.win, s.cell, s.kind, s.prize], [false, 10, 'slip', null]);
    assert.ok(s.slipAt >= 0.25 && s.slipAt <= 0.75);
});

test('resolveSteer: kẹp lệch sang ô kề thì lực còn một nửa', () => {
    const cfg = G.normalizeConfig({ winRate: 35, steerBonus: 15, pity: 0, prizes: PRIZES });
    const l = grid();
    // bốc 0.999 → vật cuối danh sách (1 ô chéo) → lực 25%
    const lose = G.resolveSteer(cfg, l, at(3, 1), {}, seq(0.999, 0.3, 0.5));
    assert.notStrictEqual(lose.cell, 10);
    assert.strictEqual(lose.win, false);
    const win = G.resolveSteer(cfg, l, at(3, 1), {}, seq(0.999, 0.2));
    assert.strictEqual(win.win, true);
});

test('resolveSteer: ô dưới càng trống có thể kẹp hụt (empty)', () => {
    const cfg = G.normalizeConfig({ winRate: 100, steerBonus: 0, pity: 0, prizes: PRIZES });
    const l = grid({ 10: null });
    const r = G.resolveSteer(cfg, l, at(3, 1), {}, seq(0, 0));
    assert.deepStrictEqual([r.win, r.kind, r.cell], [false, 'empty', 10]);
});

test('resolveSteer: chắc trúng (quà sure / bảo hiểm) vẫn trúng, bốc hụt thì lấy ô gần nhất', () => {
    const cfg = G.normalizeConfig({ winRate: 0, steerBonus: 0, pity: 3, prizes: PRIZES });
    const l = grid({ 10: null });
    const s = G.resolveSteer(cfg, l, at(3, 1), { sure: true }, seq(0, 0.99));
    assert.strictEqual(s.win, true);
    assert.notStrictEqual(s.cell, 10);
    const p = G.resolveSteer(cfg, grid(), at(3, 1), { misses: 3 }, seq(0, 0.99));
    assert.deepStrictEqual([p.win, p.pityHit], [true, true]);
    assert.strictEqual(G.resolveSteer(cfg, grid(), at(3, 1), { misses: 2 }, seq(0, 0.99, 0.5)).win, false);
});

test('resolveSteer: tỉ lệ trung bình — nhắm giữa đống ≈ 40%, cao hơn tự gắp 35% nhưng không chắc', () => {
    const cfg = G.normalizeConfig({ pity: 0, prizes: PRIZES });
    let s = 7; const rng = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    let wins = 0; const N = 4000;
    for (let i = 0; i < N; i++) if (G.resolveSteer(cfg, grid(), at(3, 1), {}, rng).win) wins++;
    const rate = wins / N;
    assert.ok(rate > 0.38 && rate < 0.5, 'tỉ lệ ' + rate);
});
