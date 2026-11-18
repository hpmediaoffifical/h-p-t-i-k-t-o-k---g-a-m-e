'use strict';
// 🪨 Ô Ăn Quan — luật thuần. Spec docs/superpowers/specs/2026-11-12-luotchoi-design.md §2.2.
// Vòng ô (ring) 0..11: 0–4 = hàng dưới (bên 0) trái→phải, 5 = quan phải, 6–10 = hàng trên (bên 1) phải→trái, 11 = quan trái.
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../lib/luot-choi/games/oanquan');

const fresh = (c) => G.setup(G.normalize(c || {}));
// đặt nhanh số dân cho 12 ô (quan giữ nguyên trừ khi ghi rõ)
function setDan(b, arr, quan) {
    arr.forEach((n, i) => { b.cells[i].dan = n; });
    if (quan) quan.forEach((q, i) => { if (q != null) b.cells[i === 0 ? 5 : 11].quan = q; });
    return b;
}
const side0 = { side: 0 }, side1 = { side: 1 };

test('dựng bàn: 10 ô × 5 dân, 2 ô quan có quan, quan = 10 điểm (tuỳ chọn 5)', () => {
    const b = fresh();
    assert.equal(b.cells.length, 12);
    assert.deepEqual(b.cells.filter((c, i) => i !== 5 && i !== 11).map(c => c.dan), [5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
    assert.equal(b.cells[5].quan && b.cells[11].quan, true);
    assert.equal(b.cells[5].dan, 0);
    assert.equal(G.normalize({}).quanValue, 10);
    assert.equal(G.normalize({ quanValue: 5 }).quanValue, 5);
    assert.equal(G.normalize({ quanValue: 7 }).quanValue, 10);
    assert.equal(G.maxSeats, 2);
});

test('đánh số theo màn hình: bên 0 ô 1–5 = ring 0–4, bên 1 ô 1–5 (trái→phải) = ring 10…6', () => {
    assert.deepEqual([1, 2, 3, 4, 5].map(k => G.ringOf(0, k)), [0, 1, 2, 3, 4]);
    assert.deepEqual([1, 2, 3, 4, 5].map(k => G.ringOf(1, k)), [10, 9, 8, 7, 6]);
    assert.equal(G.stepOf(0, 2), 1); assert.equal(G.stepOf(0, 1), -1);    // hàng dưới: phải = +1
    assert.equal(G.stepOf(1, 2), -1); assert.equal(G.stepOf(1, 1), 1);    // hàng trên: phải màn hình = −1 trên vòng
});

test('chọn ô rồi chọn hướng: options đổi theo bước, ô trống / ô bên kia không chọn được', () => {
    const b = setDan(fresh(), [0, 5, 5, 5, 5, 0, 5, 5, 5, 5, 5, 0]);
    assert.deepEqual(G.options(b, side0), [2, 3, 4, 5]);
    assert.equal(G.pick(b, 1, null, side0).ok, false, 'ô trống');
    assert.deepEqual(G.pick(b, 3, null, side0), { ok: true, outcome: 'pending' });
    assert.deepEqual(G.options(b, side0), [1, 2]);
    assert.equal(G.pick(b, 3, null, side0).ok, false, 'đang chờ hướng');
    assert.equal(G.pick(b, 2, null, side0).outcome, 'move');
});

test('rải hết → ô kế có dân thì bốc rải tiếp; ô kế là ô quan thì mất lượt', () => {
    // bên 0 bốc ô 1 (ring 0, 2 dân) rải phải: ring1, ring2. Ô kế ring3 có 1 → bốc, rải ring4. Ô kế ring5 = quan → dừng.
    const b = setDan(fresh(), [2, 0, 0, 1, 0, 0, 3, 3, 3, 3, 3, 0]);
    G.pick(b, 1, null, side0); G.pick(b, 2, null, side0);
    assert.deepEqual(b.cells.slice(0, 5).map(c => c.dan), [0, 1, 1, 0, 1]);
    assert.equal(b.captured[0].dan, 0);
    assert.equal(b.lastMove.trace.at(-1).why, 'quan');
});

test('ô kế trống, ô sau có dân → ăn; ăn liên tiếp khi trống–có quân xen kẽ', () => {
    // bên 0 bốc ring1 (1 dân) rải phải → ring2. Ô kế ring3 trống, ring4 có 4 → ăn. Ô kế ring5 (quan, 0 dân)…
    // quan có quan → không trống → dừng sau 1 lần ăn.
    let b = setDan(fresh(), [0, 1, 0, 0, 4, 0, 1, 1, 1, 1, 1, 0]);
    G.pick(b, 2, null, side0); G.pick(b, 2, null, side0);
    assert.equal(b.captured[0].dan, 4);
    assert.equal(b.cells[4].dan, 0);
    // chuỗi: rải xong ring2, trống ring3, ăn ring4 (3), trống ring5? → ring5 là ô quan đã mất quan và trống → trống thật,
    // ring6 có 2 → ăn tiếp.
    b = setDan(fresh(), [0, 1, 0, 0, 3, 0, 2, 0, 0, 0, 0, 0], [false, null]);
    G.pick(b, 2, null, side0); G.pick(b, 2, null, side0);
    assert.equal(b.captured[0].dan, 5, 'ăn 3 rồi ăn tiếp 2');
});

test('hai ô trống liền → mất lượt, không ăn', () => {
    const b = setDan(fresh(), [0, 1, 0, 0, 0, 0, 2, 2, 2, 2, 2, 0]);
    G.pick(b, 2, null, side0); G.pick(b, 2, null, side0);
    assert.equal(b.captured[0].dan, 0);
    assert.equal(b.lastMove.trace.at(-1).why, 'empty2');
});

test('ăn ô quan: quan tính 10 (hoặc 5) + dân trong ô; quan non (quan + dưới 5 dân) không ăn được', () => {
    // bên 0 bốc ring2 (1) rải phải → ring3. ring4 trống, ring5 = quan + 6 dân → ăn
    let b = setDan(fresh(), [0, 0, 1, 0, 0, 6, 1, 1, 1, 1, 1, 0]);
    G.pick(b, 3, null, side0); G.pick(b, 2, null, side0);
    assert.deepEqual(b.captured[0], { dan: 6, quan: 1 });
    assert.equal(b.cells[5].quan, false);
    assert.equal(G.scores(b, G.normalize({}))[0], 16);
    // quan non: quan + 2 dân → không ăn, mất lượt
    b = setDan(fresh(), [0, 0, 1, 0, 0, 2, 1, 1, 1, 1, 1, 0]);
    G.pick(b, 3, null, side0); G.pick(b, 2, null, side0);
    assert.deepEqual(b.captured[0], { dan: 0, quan: 0 });
    assert.equal(b.lastMove.trace.at(-1).why, 'quannon');
    // tắt luật quan non → ăn được
    b = setDan(G.setup(G.normalize({ quanNon: false })), [0, 0, 1, 0, 0, 2, 1, 1, 1, 1, 1, 0]);
    G.pick(b, 3, null, side0); G.pick(b, 2, null, side0);
    assert.deepEqual(b.captured[0], { dan: 2, quan: 1 });
});

test('bên 1 rải theo hướng màn hình: "2" = sang phải = ngược vòng', () => {
    // bên 1 ô 1 = ring10 (2 dân), rải phải màn hình → ring9, ring8.
    const b = setDan(fresh(), [1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 2, 0]);
    G.pick(b, 1, null, side1); G.pick(b, 2, null, side1);
    assert.equal(b.cells[10].dan, 0);
    assert.equal(b.cells[9].dan, 1);
    assert.equal(b.cells[8].dan, 1);
});

test('đầu lượt hết dân bên mình: rải lại 5 dân đã ăn; thiếu thì vay đối thủ, cuối ván trả', () => {
    let b = setDan(fresh(), [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0]);
    b.captured[0].dan = 7;
    let ev = G.startTurn(b, 0);
    assert.deepEqual(ev, { refill: 5, borrowed: 0 });
    assert.deepEqual(b.cells.slice(0, 5).map(c => c.dan), [1, 1, 1, 1, 1]);
    assert.equal(b.captured[0].dan, 2);
    b = setDan(fresh(), [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0]);
    b.captured[0].dan = 2; b.captured[1].dan = 9;
    ev = G.startTurn(b, 0);
    assert.deepEqual(ev, { refill: 5, borrowed: 3 });
    assert.equal(b.captured[1].dan, 6);
    assert.equal(b.debt[0], 3);
    const sc = G.scores(b, G.normalize({}));
    assert.equal(sc[0], 0 - 3 + 0, 'người vay bị trừ khi tính điểm');
    assert.equal(sc[1], 6 + 3);
    assert.equal(G.startTurn(fresh(), 0), null, 'còn dân thì không làm gì');
});

test('hết hẳn quân để rải (không còn gì để vay) → ván kết thúc', () => {
    const b = setDan(fresh(), [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]);
    const ev = G.startTurn(b, 0);
    assert.equal(ev.over, true);
    assert.equal(G.done(b), true);
});

test('kết thúc khi 2 ô quan trống: dân còn trên bàn về bên đang giữ ô', () => {
    // bên 0 ăn nốt ô quan phải (đã mất quan, còn 3 dân); ô quan trái đã trống
    const b = setDan(fresh(), [0, 0, 1, 0, 0, 3, 2, 2, 0, 0, 0, 0], [false, false]);
    b.captured[1].quan = 2;
    G.pick(b, 3, null, side0); G.pick(b, 2, null, side0);
    assert.equal(G.done(b), true);
    assert.equal(b.captured[0].dan, 3 + 1, 'ăn 3 + dân còn lại hàng dưới (1)');
    assert.equal(b.captured[1].dan, 4, 'dân còn lại hàng trên');
    assert.deepEqual(G.scores(b, G.normalize({})), [4, 24]);
});

test('view: số dân từng ô theo số màn hình + quan + điểm, không lộ gì bí mật; lastMove có trace để diễn', () => {
    const b = fresh();
    G.pick(b, 3, null, side0); G.pick(b, 2, null, side0);
    const v = G.view(b);
    assert.equal(v.kind, 'oanquan');
    assert.equal(v.rows.length, 2);
    assert.equal(v.rows[0].length, 5);
    assert.equal(typeof v.quanL.dan, 'number');
    assert.ok(Array.isArray(v.lastMove.trace) && v.lastMove.trace.length > 0);
    assert.ok(v.lastMove.id > 0);
});

test('chặn vòng lặp vô hạn: lượt dừng sau tối đa MAX_STEPS bước', () => {
    const b = fresh();
    G.pick(b, 1, null, side0); G.pick(b, 2, null, side0);
    assert.ok(b.lastMove.trace.length < 2000);
});
