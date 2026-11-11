// node --test tests/top3-tran.test.js — luật thuần 🏆 Top 3 Kết Thúc Trận (lib/top3-tran.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const T3 = require('../lib/top3-tran');

function mk(cfg) {
    let t = 5_000_000;
    const clock = { now: () => t, go: (ms) => { t += ms; } };
    const m = T3.createMatchTop({ now: clock.now });
    m.setConfig(Object.assign({ holdSec: 12, autoPk: true }, cfg || {}));
    return { m, clock };
}
const gift = (m, id, coins) => m.gift({ uniqueId: id, nickname: id.toUpperCase(), avatar: id + '.png', coins });

test('normalizeCfg: mặc định + chặn biên', () => {
    const d = T3.normalizeCfg({});
    assert.equal(d.autoPk, true);
    assert.equal(d.liveBar, true);
    assert.equal(d.holdSec, 12);
    assert.equal(d.durationSec, 0);
    const c = T3.normalizeCfg({ holdSec: 999, durationSec: -3 });
    assert.equal(c.holdSec, 120);
    assert.equal(c.durationSec, 0);
});

test('chưa mở trận: quà không tính', () => {
    const { m } = mk();
    assert.equal(gift(m, 'u1', 100).changed, false);
    assert.equal(m.snapshot().players, 0);
});

test('mở tay → cộng điểm, top xếp giảm dần, gỡ hoà theo người lên mức trước', () => {
    const { m } = mk();
    m.open({ source: 'manual' });
    gift(m, 'u1', 10); gift(m, 'u2', 20); gift(m, 'u3', 5); gift(m, 'u1', 10);
    const s = m.snapshot();
    assert.equal(s.open, true);
    assert.equal(s.source, 'manual');
    assert.deepEqual(s.top.map((r) => r.id), ['u2', 'u1', 'u3']);
    assert.equal(s.total, 45);
    assert.equal(s.players, 3);
});

test('bỏ quà dưới min xu và quà không có id', () => {
    const { m } = mk({ minCoins: 10 });
    m.open({ source: 'manual' });
    assert.equal(gift(m, 'u1', 9).changed, false);
    assert.equal(m.gift({ coins: 50 }).changed, false);
    assert.equal(gift(m, 'u2', 10).changed, true);
});

test('đóng trận → công bố 3 người, tổng, seq tăng; tự ẩn sau holdSec', () => {
    const { m, clock } = mk({ holdSec: 12 });
    m.open({ source: 'manual' });
    ['a', 'b', 'c', 'd'].forEach((id, i) => gift(m, id, (i + 1) * 10));
    const ok = m.close();
    assert.equal(ok, true);
    const s = m.snapshot();
    assert.equal(s.open, false);
    assert.ok(s.announce);
    assert.deepEqual(s.announce.rows.map((r) => [r.id, r.coins]), [['d', 40], ['c', 30], ['b', 20]]);
    assert.equal(s.announce.total, 100);
    assert.equal(s.announce.rows[0].avatar, 'd.png');
    assert.equal(s.announce.hideAt, clock.now() + 12_000);
    const seq1 = s.announce.seq;
    clock.go(11_999); assert.equal(m.tick().changed, false);
    clock.go(1); assert.equal(m.tick().changed, true);
    assert.equal(m.snapshot().announce, null);
    m.open({ source: 'manual' }); gift(m, 'x', 1); m.close();
    assert.ok(m.snapshot().announce.seq > seq1);
});

test('holdSec = 0 → công bố giữ tới khi hide()', () => {
    const { m, clock } = mk({ holdSec: 0 });
    m.open({ source: 'manual' }); gift(m, 'u1', 5); m.close();
    clock.go(3_600_000); m.tick();
    assert.ok(m.snapshot().announce);
    m.hide();
    assert.equal(m.snapshot().announce, null);
});

test('đóng trận không ai tặng → không công bố', () => {
    const { m } = mk();
    m.open({ source: 'manual' });
    assert.equal(m.close(), false);
    assert.equal(m.snapshot().announce, null);
});

test('mở trận mới xoá sổ + xoá công bố cũ', () => {
    const { m } = mk();
    m.open({ source: 'manual' }); gift(m, 'u1', 5); m.close();
    m.open({ source: 'manual' });
    const s = m.snapshot();
    assert.equal(s.players, 0);
    assert.equal(s.announce, null);
});

test('trận tay có hẹn giờ → tự đóng + công bố khi hết giờ', () => {
    const { m, clock } = mk({ durationSec: 60 });
    m.open({ source: 'manual' });
    assert.equal(m.snapshot().endsAt, clock.now() + 60_000);
    gift(m, 'u1', 5);
    clock.go(60_000);
    assert.equal(m.tick().changed, true);
    assert.equal(m.snapshot().open, false);
    assert.ok(m.snapshot().announce);
});

test('trận theo PK: không hẹn giờ dù durationSec > 0', () => {
    const { m } = mk({ durationSec: 60 });
    m.pkStart();
    assert.equal(m.snapshot().endsAt, 0);
    assert.equal(m.snapshot().source, 'pk');
});

test('PK: mở → đóng tự động; gói mở báo 2 lần không xoá sổ', () => {
    const { m } = mk();
    assert.equal(m.pkStart(), true);
    gift(m, 'u1', 30);
    assert.equal(m.pkStart(), false);
    assert.equal(m.snapshot().total, 30);
    assert.equal(m.pkEnd(), true);
    assert.equal(m.snapshot().announce.rows[0].id, 'u1');
});

test('PK không cướp trận tay; pkEnd không đóng trận tay', () => {
    const { m } = mk();
    m.open({ source: 'manual' });
    gift(m, 'u1', 30);
    assert.equal(m.pkStart(), false);
    assert.equal(m.snapshot().source, 'manual');
    assert.equal(m.pkEnd(), false);
    assert.equal(m.snapshot().open, true);
    assert.equal(m.snapshot().total, 30);
});

test('autoPk tắt → bỏ qua tín hiệu PK', () => {
    const { m } = mk({ autoPk: false });
    assert.equal(m.pkStart(), false);
    assert.equal(m.snapshot().open, false);
});

test('sổ vượt trần → cắt giữ người điểm cao', () => {
    const { m } = mk();
    m.open({ source: 'manual' });
    for (let i = 0; i < T3.MAX_BOOK + 1; i++) gift(m, 'u' + i, i + 1);
    const s = m.snapshot();
    assert.equal(s.players, T3.TRIM_TO);
    assert.equal(s.top[0].id, 'u' + T3.MAX_BOOK);
});

test('demo(): công bố giả không đụng sổ thật', () => {
    const { m } = mk();
    m.open({ source: 'manual' }); gift(m, 'u1', 7);
    m.demo();
    const s = m.snapshot();
    assert.equal(s.announce.demo, true);
    assert.equal(s.announce.rows.length, 3);
    assert.equal(s.total, 7);
    assert.equal(s.open, true);
});

test('reset(): đóng, xoá sổ, xoá công bố', () => {
    const { m } = mk();
    m.open({ source: 'manual' }); gift(m, 'u1', 7); m.close();
    m.reset();
    const s = m.snapshot();
    assert.equal(s.open, false);
    assert.equal(s.players, 0);
    assert.equal(s.announce, null);
});
