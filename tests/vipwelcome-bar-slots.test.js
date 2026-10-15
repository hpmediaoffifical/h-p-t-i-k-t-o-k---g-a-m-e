'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBarSlots, holdMs, accentOf } = require('../public/games/vipwelcome/bar-slots.js');

const it = (id, priority) => ({ id, priority });
const ids = (s) => s.snapshot().slots.map(x => (x ? x.id : '-')).join(',');

test('người mới luôn vào tầng 0, thanh cũ đẩy lên', () => {
    const s = createBarSlots({ slots: 3 });
    s.place(it('A', 115)); s.place(it('B', 115));
    const r = s.place(it('C', 115));
    assert.equal(ids(s), 'C,B,A');
    assert.deepEqual(r.moves.map(m => [m.item.id, m.slot]), [['A', 2], ['B', 1]]);
});

test('thanh hết giờ: chỉ trống ô, các thanh khác đứng yên; người sau lấp tầng 0 không dịch ai', () => {
    const s = createBarSlots({ slots: 3 });
    const A = it('A', 115), B = it('B', 115), C = it('C', 115);
    s.place(A); s.place(B); s.place(C);           // C,B,A
    s.remove(C);                                   // -,B,A
    assert.equal(ids(s), '-,B,A');
    const r = s.place(it('D', 115));
    assert.equal(ids(s), 'D,B,A');
    assert.equal(r.moves.length, 0);
});

test('chỉ đẩy dãy liền kề tới ô trống đầu tiên', () => {
    const s = createBarSlots({ slots: 3 });
    const A = it('A', 115), B = it('B', 115);
    s.place(A); s.place(B);                        // B,A,-
    s.remove(A);                                   // B,-,-
    s.place(it('C', 115));                         // C,B,-
    assert.equal(ids(s), 'C,B,-');
});

test('đầy: bỏ thanh ưu tiên THẤP nhất, không bỏ Chí tôn vì Tân binh', () => {
    const s = createBarSlots({ slots: 3 });
    s.place(it('VIP', 145)); s.place(it('lo1', 101)); s.place(it('mid', 125));   // mid,lo1,VIP
    const r = s.place(it('new', 115));
    assert.equal(r.retired.id, 'lo1');
    assert.equal(ids(s), 'new,mid,VIP');
});

test('đầy và người mới thấp hơn mọi thanh → vào hàng chờ, hiện khi có tầng trống', () => {
    const s = createBarSlots({ slots: 2, maxWaitMs: 8000 });
    const A = it('A', 145), B = it('B', 135);
    s.place(A, 0); s.place(B, 0);
    const r = s.place(it('lo', 101), 100);
    assert.equal(r.queued, true);
    assert.equal(ids(s), 'B,A');
    const next = s.remove(A, 2000);
    assert.equal(next.id, 'lo');
});

test('hàng chờ quá hạn thì bỏ; ưu tiên cao ra trước', () => {
    const s = createBarSlots({ slots: 1, maxWaitMs: 1000 });
    const X = it('X', 200);
    s.place(X, 0);
    s.place(it('a', 101), 0); s.place(it('b', 150), 0);
    assert.deepEqual(s.snapshot().waiting.map(w => w.id), ['b', 'a']);
    assert.equal(s.remove(X, 5000), null);   // cả 2 đã quá 1s
});

test('đầy và hoà ưu tiên → bỏ thanh cũ nhất (tầng cao nhất)', () => {
    const s = createBarSlots({ slots: 3 });
    s.place(it('A', 115)); s.place(it('B', 115)); s.place(it('C', 115));
    const r = s.place(it('D', 115));
    assert.equal(r.retired.id, 'A');
    assert.equal(ids(s), 'D,C,B');
});

test('holdMs: bậc cao giữ lâu hơn, có sao băng cộng 1s', () => {
    assert.equal(holdMs(0, 5000, true), 3750);
    assert.equal(holdMs(1, 5000, false), 6000);
    assert.equal(holdMs(4, 5000, false), 8500);
    assert.ok(holdMs(4, 5000, false) > holdMs(2, 5000, false));
});

test('accentOf: lần đầu > chuỗi > TOP > MOD; thẻ muộn không có', () => {
    assert.equal(accentOf({ visit: { isFirst: true, streak: 5 }, roles: { top: 1 } }), '🎉 LẦN ĐẦU GHÉ');
    assert.equal(accentOf({ visit: { streak: 5 }, roles: { top: 1 } }), '🔥 5 BUỔI LIỀN');
    assert.equal(accentOf({ visit: { streak: 2 }, roles: { top: 3 } }), '👑 TOP 3');
    assert.equal(accentOf({ roles: { mod: true } }), '🛡 MOD');
    assert.equal(accentOf({ roles: {} }), '');
    assert.equal(accentOf({ late: true, visit: { isFirst: true } }), '');
});
