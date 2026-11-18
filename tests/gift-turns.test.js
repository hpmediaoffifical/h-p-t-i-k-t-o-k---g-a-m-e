const test = require('node:test');
const assert = require('node:assert');
const T = require('../lib/gift-turns');

const cfg = (over) => ({ anyGift: true, gifts: [{ giftId: '5655', turns: 3, sure: true }], ...over });

test('turnsForGift: quà gán đích danh × combo', () => {
    assert.deepStrictEqual(T.turnsForGift(cfg(), { giftId: 5655, repeatCount: 2 }), { turns: 6, sure: true });
});

test('turnsForGift: quà lạ = 1 lượt/lần khi anyGift bật, 0 khi tắt', () => {
    assert.deepStrictEqual(T.turnsForGift(cfg(), { giftId: '1', repeatCount: 4 }), { turns: 4, sure: false });
    assert.deepStrictEqual(T.turnsForGift(cfg({ anyGift: false }), { giftId: '1', repeatCount: 4 }), { turns: 0, sure: false });
});

test('turnsForGift: chặn trần mỗi lần tặng, repeat rác = 1', () => {
    assert.strictEqual(T.turnsForGift(cfg(), { giftId: '5655', repeatCount: 999 }).turns, T.MAX_PER_GIFT);
    assert.strictEqual(T.turnsForGift(cfg(), { giftId: '1', repeatCount: 'x' }).turns, 1);
    assert.strictEqual(T.turnsForGift(cfg({ gifts: [{ giftId: '7', turns: 0 }] }), { giftId: '7' }).turns, 1, 'turns 0 → tối thiểu 1');
});

test('turnsForGift: không có giftId → 0', () => {
    assert.strictEqual(T.turnsForGift(cfg(), {}).turns, 0);
    assert.strictEqual(T.turnsForGift(null, { giftId: '1' }).turns, 1, 'cfg rỗng = anyGift mặc định bật');
});

test('createQueue: trần + nhận bao nhiêu', () => {
    const q = T.createQueue({ max: 3 });
    assert.strictEqual(q.push([1, 2]), 2);
    assert.strictEqual(q.push([3, 4, 5]), 1);
    assert.strictEqual(q.size(), 3);
    assert.strictEqual(q.shift(), 1);
    assert.deepStrictEqual(q.list(), [2, 3]);
    q.clear();
    assert.strictEqual(q.size(), 0);
    assert.strictEqual(q.shift(), undefined);
});

test('speedFactor: hàng chờ > 3 nhanh thêm 12%/lượt, trần ×2,5', () => {
    assert.strictEqual(T.speedFactor(0), 1);
    assert.strictEqual(T.speedFactor(3), 1);
    assert.strictEqual(T.speedFactor(5), 1.24);
    assert.strictEqual(T.speedFactor(30), 2.5);
});

test('turnMs: rút ngắn theo hàng chờ, không dưới 1,5 giây', () => {
    assert.strictEqual(T.turnMs(4, 0), 4000);
    assert.strictEqual(T.turnMs(4, 5), 3226);
    assert.strictEqual(T.turnMs(4, 30), 1600);
    assert.strictEqual(T.turnMs(3, 30), 1500);
    assert.strictEqual(T.turnMs(99, 0), 5000, 'kẹp 3–5 giây');
    assert.strictEqual(T.turnMs('x', 0), 4000);
});
function fakeClock() {
    let now = 0; const timers = [];
    return {
        setTimeout(fn, ms) { const t = { at: now + ms, fn }; timers.push(t); return t; },
        clearTimeout(t) { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
        advance(ms) {
            const end = now + ms;
            for (;;) {
                timers.sort((a, b) => a.at - b.at);
                if (!timers.length || timers[0].at > end) break;
                const t = timers.shift(); now = t.at; t.fn();
            }
            now = end;
        }
    };
}

test('createRunner: chạy từng lượt nối nhau, nghỉ giữa lượt, dừng khi hết', () => {
    const clock = fakeClock();
    const played = [];
    const r = T.createRunner({
        clock, gapMs: 250, max: 10,
        turnSec: () => 4,
        onTurn: (item, ms, left) => played.push([item, ms, left])
    });
    r.add(['a', 'b']);
    assert.deepStrictEqual(played, [['a', 4000, 1]], 'lượt đầu chạy ngay');
    assert.strictEqual(r.busy(), true);
    clock.advance(4000);
    assert.strictEqual(played.length, 1, 'chưa hết khoảng nghỉ');
    clock.advance(250);
    assert.deepStrictEqual(played[1], ['b', 4000, 0]);
    clock.advance(4250);
    assert.strictEqual(r.busy(), false);
    r.add(['c']);
    assert.strictEqual(played[2][0], 'c', 'rảnh thì chạy ngay');
});

test('createRunner: clear xoá hàng chờ, lượt đang chạy vẫn xong', () => {
    const clock = fakeClock();
    const played = [];
    const r = T.createRunner({ clock, gapMs: 0, max: 10, turnSec: () => 4, onTurn: (i) => played.push(i) });
    r.add([1, 2, 3]);
    r.clear();
    assert.strictEqual(r.size(), 0);
    clock.advance(10000);
    assert.deepStrictEqual(played, [1]);
});

test('createRunner: add trả số lượt nhận (tràn hàng chờ)', () => {
    const clock = fakeClock();
    const r = T.createRunner({ clock, max: 2, turnSec: () => 4, onTurn: () => {} });
    assert.strictEqual(r.add([1, 2, 3, 4]), 3, '1 chạy ngay + 2 xếp hàng');
    assert.strictEqual(r.size(), 2);
});

test('createRunner: lượt giữ (hold) chờ release rồi mới sang lượt kế', () => {
    const clock = fakeClock();
    const played = [];
    const r = T.createRunner({ clock, gapMs: 100, max: 10, turnSec: () => 4,
        onTurn: (item) => { played.push(item); return item === 'steer' ? { hold: true } : undefined; } });
    r.add(['steer', 'b']);
    clock.advance(60000);
    assert.deepStrictEqual(played, ['steer'], 'đang giữ: không tự sang lượt');
    assert.strictEqual(r.holding(), true);
    r.release(500);
    clock.advance(599);
    assert.deepStrictEqual(played, ['steer']);
    clock.advance(1);
    assert.deepStrictEqual(played, ['steer', 'b']);
    assert.strictEqual(r.holding(), false);
    r.release(0);
    assert.strictEqual(played.length, 2, 'release khi không giữ = bỏ qua');
});