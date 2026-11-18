const test = require('node:test');
const assert = require('node:assert');
const Srv = require('../lib/gapthu-xucxac-server');

function harness(cfgOver) {
    let now = 0; const timers = [];
    const clock = {
        now: () => now,
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
    const events = [];
    const room = { emit: (ev, data) => events.push([ev, data]) };
    const io = { to: () => ({ to: () => room, emit: room.emit }) };
    const app = { get() {}, post() {} };
    const cfgs = { gapthu: { anyGift: true, steerMinCoins: 99, steerSec: 15, steerSteps: 8, pity: 0, ...cfgOver }, xucxac: { enabled: false } };
    const s = Srv.install({ app, io, getConfig: id => cfgs[id], publicDir: '.', clock });
    const of = ev => events.filter(e => e[0] === ev).map(e => e[1]);
    return { s, clock, events, of };
}
const gift = (coins, extra) => ({ giftId: '1', coinValue: coins, repeatCount: 1, uniqueId: 'bena', nickname: 'Bé Na', ...extra });

test('quà nhỏ = lượt tự gắp; quà ≥ ngưỡng = lượt tự lái và giữ hàng chờ', () => {
    const h = harness();
    h.s.onGift(gift(1));
    assert.strictEqual(h.of('gapthu:turn')[0].mode, 'auto');
    h.clock.advance(10000);
    h.s.onGift(gift(199));
    const t = h.of('gapthu:turn')[1];
    assert.strictEqual(t.mode, 'steer');
    assert.deepStrictEqual(t.steer.pos, { col: 3, row: 1 });
    assert.strictEqual(t.layout.length, 21);
    h.s.onGift(gift(1, { uniqueId: 'khac' }));
    h.clock.advance(14000);
    assert.strictEqual(h.of('gapthu:turn').length, 2, 'đang tự lái: lượt sau chưa chạy');
});

test('chỉ người tặng điều khiển; trò chuyện bị bỏ qua; gắp → drop rồi sang lượt kế', () => {
    const h = harness();
    h.s.onGift(gift(199));
    h.s.onGift(gift(1, { uniqueId: 'khac', nickname: 'Khác' }));
    assert.strictEqual(h.s.onChat({ uniqueId: 'khac', comment: 'trái' }), false);
    assert.strictEqual(h.s.onChat({ uniqueId: 'bena', comment: 'ra đây chị ơi' }), false);
    assert.strictEqual(h.of('gapthu:steer').length, 0);
    h.s.onChat({ uniqueId: 'bena', comment: 'trái 2' });
    h.s.onChat({ uniqueId: 'bena', comment: 'vào' });
    const st = h.of('gapthu:steer');
    assert.deepStrictEqual(st[1].pos, { col: 1, row: 2 });
    assert.strictEqual(st[1].stepsLeft, 5);
    h.s.onChat({ uniqueId: 'bena', comment: 'gắp' });
    const d = h.of('gapthu:drop')[0];
    assert.strictEqual(d.reason, 'grab');
    assert.deepStrictEqual(d.pos, { col: 1, row: 2 });
    assert.ok(['grab', 'slip', 'empty'].includes(d.result.kind));
    assert.strictEqual(h.s.onChat({ uniqueId: 'bena', comment: 'trái' }), false, 'hết lượt lái');
    h.clock.advance(d.ms + 300);
    assert.strictEqual(h.of('gapthu:turn')[1].nickname, 'Khác', 'lượt kế chạy sau phần thả càng');
});

test('hết giờ thì tự gắp tại chỗ; hết bước thì không đi nữa nhưng vẫn gắp được', () => {
    const h = harness({ steerSteps: 3 });
    h.s.onGift(gift(199));
    h.s.onChat({ uniqueId: 'bena', comment: 'phải 5' });
    assert.strictEqual(h.of('gapthu:steer')[0].stepsLeft, 0);
    h.s.onChat({ uniqueId: 'bena', comment: 'trái' });
    assert.strictEqual(h.of('gapthu:steer').length, 1, 'hết bước: lệnh đi bị bỏ');
    h.clock.advance(15000);
    const d = h.of('gapthu:drop')[0];
    assert.strictEqual(d.reason, 'timeout');
    assert.deepStrictEqual(d.pos, { col: 6, row: 1 });
});

test('hàng chờ dài: đồng hồ tự lái rút ngắn nhưng không dưới 8 giây', () => {
    const h = harness({ steerSec: 15 });
    h.s.onGift(gift(199, { repeatCount: 10 }));
    const sec = h.of('gapthu:turn')[0].steer.sec;   // còn 9 lượt chờ → ×1,72 → 15/1,72 ≈ 9
    assert.strictEqual(sec, 9);
});

test('ngưỡng 0 = tắt tự lái', () => {
    const h = harness({ steerMinCoins: 0 });
    h.s.onGift(gift(30000));
    assert.strictEqual(h.of('gapthu:turn')[0].mode, 'auto');
});
