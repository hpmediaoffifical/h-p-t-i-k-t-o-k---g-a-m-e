// node --test tests/dau-gia.test.js — luật thuần 🔨 Đấu Giá (lib/dau-gia.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const DG = require('../lib/dau-gia');

function mk(cfg) {
    let t = 1_000_000;
    const clock = { now: () => t, go: (ms) => { t += ms; } };
    const a = DG.createAuction({ now: clock.now });
    a.setConfig(Object.assign({ durationSec: 60, tieSec: 15, tieRounds: 3, snipeOn: false }, cfg || {}));
    return { a, clock };
}
const gift = (a, id, coins, extra) => a.gift(Object.assign({ uniqueId: id, nickname: id.toUpperCase(), coins }, extra || {}));

test('normalizeCfg: mặc định + chặn biên', () => {
    const c = DG.normalizeCfg({ durationSec: 1, tieRounds: 99, snipeAddSec: -5, rows: 50, title: 'x'.repeat(300) });
    assert.equal(c.durationSec, 10);
    assert.equal(c.tieRounds, 5);
    assert.equal(c.snipeAddSec, 1);
    assert.equal(c.rows, 10);
    assert.equal(c.title.length, 120);
    const d = DG.normalizeCfg({});
    assert.equal(d.snipeOn, true);
    assert.equal(d.trashOn, true);
    assert.equal(d.minCoins, 0);
});

test('idle: quà không tính', () => {
    const { a } = mk();
    assert.equal(gift(a, 'u1', 100).changed, false);
    assert.equal(a.snapshot().phase, 'idle');
    assert.equal(a.snapshot().rows.length, 0);
});

test('start → cộng xu theo người, xếp hạng giảm dần', () => {
    const { a, clock } = mk();
    a.start('Áo đấu');
    const s0 = a.snapshot();
    assert.equal(s0.phase, 'live');
    assert.equal(s0.title, 'Áo đấu');
    assert.equal(s0.endsAt, clock.now() + 60_000);
    gift(a, 'u1', 10);
    gift(a, 'u2', 30);
    gift(a, 'u1', 5);
    const s = a.snapshot();
    assert.deepEqual(s.rows.map((r) => [r.id, r.coins]), [['u2', 30], ['u1', 15]]);
    assert.equal(s.total, 45);
    assert.equal(s.bidders, 2);
});

test('bỏ quà dưới min xu, quà không có id, xu <= 0', () => {
    const { a } = mk({ minCoins: 5 });
    a.start();
    assert.equal(gift(a, 'u1', 4).changed, false);
    assert.equal(a.gift({ nickname: 'ẩn', coins: 100 }).changed, false);
    assert.equal(gift(a, 'u2', 0).changed, false);
    assert.equal(gift(a, 'u3', 5).changed, true);
    assert.deepEqual(a.snapshot().rows.map((r) => r.id), ['u3']);
});

test('gỡ hoà: ai lên tới mức đó TRƯỚC đứng trên (không phụ thuộc thứ tự tặng lần đầu)', () => {
    const { a } = mk();
    a.start();
    gift(a, 'u1', 10);   // u1 vào trước
    gift(a, 'u2', 20);
    gift(a, 'u1', 10);   // u1 lên 20 SAU u2 — cùng mili-giây cũng vậy
    assert.deepEqual(a.snapshot().rows.map((r) => r.id), ['u2', 'u1']);
});

test('tên/ảnh cập nhật, không ghi đè bằng rỗng; giữ 3 quà nhiều xu nhất', () => {
    const { a } = mk();
    a.start();
    a.gift({ uniqueId: 'u1', nickname: 'Lan', avatar: 'a.png', coins: 1, giftName: 'Rose', giftIcon: 'r.png', count: 1 });
    a.gift({ uniqueId: 'u1', nickname: '', avatar: '', coins: 100, giftName: 'Galaxy', giftIcon: 'g.png', count: 1 });
    a.gift({ uniqueId: 'u1', coins: 30, giftName: 'Hat', count: 3 });
    a.gift({ uniqueId: 'u1', coins: 50, giftName: 'Car', count: 1 });
    const r = a.snapshot().rows[0];
    assert.equal(r.name, 'Lan');
    assert.equal(r.avatar, 'a.png');
    assert.deepEqual(r.gifts.map((g) => g.name), ['Galaxy', 'Car', 'Hat']);
    assert.equal(r.gifts[2].count, 3);
});

test('hết giờ không hoà → done, có người thắng + người về nhì', () => {
    const { a, clock } = mk();
    a.start();
    gift(a, 'u1', 10);
    gift(a, 'u2', 30);
    clock.go(59_999);
    assert.equal(a.tick().changed, false);
    clock.go(1);
    assert.equal(a.tick().changed, true);
    const s = a.snapshot();
    assert.equal(s.phase, 'done');
    assert.equal(s.winner.id, 'u2');
    assert.equal(s.runnerUp.id, 'u1');
    assert.equal(s.endsAt, 0);
});

test('hết giờ không ai trả giá → done, không có người thắng', () => {
    const { a, clock } = mk();
    a.start();
    clock.go(60_000);
    a.tick();
    const s = a.snapshot();
    assert.equal(s.phase, 'done');
    assert.equal(s.winner, null);
    assert.equal(s.runnerUp, null);
});

test('hoà ở đỉnh → hiệp phụ; trong hiệp phụ vẫn nhận quà của người thứ ba', () => {
    const { a, clock } = mk();
    a.start();
    gift(a, 'u1', 20);
    gift(a, 'u2', 20);
    gift(a, 'u3', 5);
    clock.go(60_000);
    a.tick();
    let s = a.snapshot();
    assert.equal(s.phase, 'tie');
    assert.equal(s.tieRound, 1);
    assert.deepEqual(s.tieIds.sort(), ['u1', 'u2']);
    assert.equal(s.endsAt, clock.now() + 15_000);
    gift(a, 'u3', 100);
    clock.go(15_000);
    a.tick();
    s = a.snapshot();
    assert.equal(s.phase, 'done');
    assert.equal(s.winner.id, 'u3');
});

test('hoà mãi → hết số hiệp phụ thì ai lên mức trước thắng', () => {
    const { a, clock } = mk({ tieRounds: 2 });
    a.start();
    gift(a, 'u1', 20);
    gift(a, 'u2', 20);
    clock.go(60_000); a.tick();
    assert.equal(a.snapshot().tieRound, 1);
    gift(a, 'u2', 5); gift(a, 'u1', 5);   // u2 lên 25 trước
    clock.go(15_000); a.tick();
    assert.equal(a.snapshot().tieRound, 2);
    clock.go(15_000); a.tick();
    const s = a.snapshot();
    assert.equal(s.phase, 'done');
    assert.equal(s.winner.id, 'u2');
    assert.equal(s.runnerUp.id, 'u1');
});

test('tieSec = 0 → không hiệp phụ, chốt luôn theo người lên mức trước', () => {
    const { a, clock } = mk({ tieSec: 0 });
    a.start();
    gift(a, 'u1', 20); gift(a, 'u2', 20);
    clock.go(60_000); a.tick();
    assert.equal(a.snapshot().phase, 'done');
    assert.equal(a.snapshot().winner.id, 'u1');
});

test('chống cướp: chỉ gia hạn khi quà ở cửa sổ cuối làm ĐỔI người dẫn', () => {
    const { a, clock } = mk({ snipeOn: true, snipeWindowSec: 10, snipeAddSec: 10, snipeMax: 20 });
    a.start();
    gift(a, 'u1', 50);
    clock.go(30_000);
    assert.equal(gift(a, 'u2', 100).extended, false, 'ngoài cửa sổ cuối không gia hạn');
    const end0 = a.snapshot().endsAt;
    clock.go(25_000);   // còn 5s
    assert.equal(gift(a, 'u2', 10).extended, false, 'người đang dẫn tự tặng thêm không gia hạn');
    assert.equal(gift(a, 'u1', 20).extended, false, 'không vượt được người dẫn thì không gia hạn');
    assert.equal(gift(a, 'u1', 100).extended, true, 'vượt lên dẫn đầu → gia hạn');
    const s = a.snapshot();
    assert.equal(s.endsAt, end0 + 10_000);
    assert.equal(s.extendCount, 1);
    assert.equal(s.lastExtendAt, clock.now());
});

test('chống cướp tắt → không gia hạn', () => {
    const { a, clock } = mk({ snipeOn: false });
    a.start();
    gift(a, 'u1', 50);
    clock.go(55_000);
    assert.equal(gift(a, 'u2', 100).extended, false);
});

test('chống cướp có trần số lần', () => {
    const { a, clock } = mk({ snipeOn: true, snipeWindowSec: 10, snipeAddSec: 10, snipeMax: 2 });
    a.start();
    clock.go(55_000);
    gift(a, 'u1', 10);                                  // người dẫn đầu tiên → đổi từ "không ai" sang u1
    assert.equal(a.snapshot().extendCount, 1);
    clock.go(10_000);                                   // lại còn 5s
    gift(a, 'u2', 20);
    assert.equal(a.snapshot().extendCount, 2);
    clock.go(10_000);
    assert.equal(gift(a, 'u1', 20).extended, false);    // vượt lên dẫn nhưng hết quỹ
    assert.equal(a.snapshot().extendCount, 2);
});

test('mỗi hiệp phụ có quỹ gia hạn riêng', () => {
    const { a, clock } = mk({ snipeOn: true, snipeWindowSec: 10, snipeAddSec: 5, snipeMax: 1 });
    a.start();
    gift(a, 'u1', 10);
    clock.go(55_000);
    gift(a, 'u2', 10);   // hoà, chưa đổi người dẫn (u1 lên mức trước)
    assert.equal(a.snapshot().extendCount, 0);
    clock.go(5_000); a.tick();
    assert.equal(a.snapshot().phase, 'tie');
    clock.go(10_000);
    assert.equal(gift(a, 'u2', 1).extended, true);
    assert.equal(a.snapshot().extendCount, 1);
});

test('end() chốt ngay bỏ hiệp phụ; reset() về idle; setTitle đổi tên giữa phiên', () => {
    const { a } = mk();
    a.start('A');
    gift(a, 'u1', 20); gift(a, 'u2', 20);
    a.setTitle('  B  ');
    assert.equal(a.snapshot().title, 'B');
    a.end();
    assert.equal(a.snapshot().phase, 'done');
    assert.equal(a.snapshot().winner.id, 'u1');
    assert.equal(gift(a, 'u3', 99).changed, false, 'đã chốt thì không nhận quà');
    a.reset();
    const s = a.snapshot();
    assert.equal(s.phase, 'idle');
    assert.equal(s.rows.length, 0);
    assert.equal(s.winner, null);
});

test('start lại xoá bảng cũ; seq tăng mỗi lần đổi', () => {
    const { a } = mk();
    a.start();
    const q0 = a.snapshot().seq;
    gift(a, 'u1', 10);
    assert.ok(a.snapshot().seq > q0);
    a.start();
    assert.equal(a.snapshot().rows.length, 0);
});

test('snapshot gửi tối đa 10 hàng, có serverNow + cấu hình hiển thị luật', () => {
    const { a, clock } = mk({ snipeOn: true });
    a.start();
    for (let i = 0; i < 15; i++) gift(a, 'u' + i, i + 1);
    const s = a.snapshot();
    assert.equal(s.rows.length, 10);
    assert.equal(s.bidders, 15);
    assert.equal(s.serverNow, clock.now());
    assert.equal(s.rules.snipeOn, true);
    assert.equal(s.rules.snipeAddSec, 10);
    assert.equal(s.rules.tieRounds, 3);
});
