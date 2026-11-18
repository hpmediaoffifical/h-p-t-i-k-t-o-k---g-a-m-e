'use strict';
// 🎲 Bộ Trò Chơi Theo Lượt — bộ điều phối: quà/bình luận từ server.js → bàn → socket.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLuotChoiController } = require('../lib/luot-choi/controller');

function fakeIo() { const sent = []; return { sent, emit: (ev, data) => sent.push([ev, data]) }; }
const wait = (ms) => new Promise(r => setTimeout(r, ms));

test('quà vào ghế + bình luận số của người tới lượt đi qua bộ điều phối và đẩy trạng thái', async () => {
    const io = fakeIo();
    const cfg = { enabled: true, game: 'chumcoc', seats: 2, seatGifts: [{ giftId: '5655' }] };
    const c = createLuotChoiController({ io, getConfig: () => cfg, log: () => {} });
    assert.equal(c.addGift({ uniqueId: 'a', nickname: 'An', giftId: 5655 }).action, 'seat');
    assert.equal(c.addGift({ uniqueId: 'b', nickname: 'Bình', giftId: 1 }).action, 'ignored');
    c.control('test', { uniqueId: 'b', nickname: 'Bình' });
    c.control('start');
    const board = c._table._board();
    const safe = board.trap === 1 ? 2 : 1;
    assert.equal(c.addComment({ uniqueId: 'b', comment: String(safe) }), false, 'chưa tới lượt');
    assert.equal(c.addComment({ uniqueId: 'a', comment: String(safe) }), true);
    await wait(30);
    const last = io.sent.filter(x => x[0] === 'luotchoi:state').pop()[1];
    assert.equal(last.phase, 'playing');
    assert.deepEqual(last.board.used, [safe]);
    assert.equal(last.games.length, 5);
    assert.equal(last.board.trap, undefined, 'không lộ bẫy');
});

test('đổi phòng LIVE → xoá bàn', () => {
    const io = fakeIo();
    const c = createLuotChoiController({ io, getConfig: () => ({ enabled: true }), log: () => {} });
    c.onRoom('r1');
    c.control('test', { nickname: 'X' });
    assert.equal(c.publicState().seats.length, 1);
    c.onRoom('r1');
    assert.equal(c.publicState().seats.length, 1);
    c.onRoom('r2');
    assert.equal(c.publicState().seats.length, 0);
});

test('lệnh lạ bị từ chối', () => {
    const c = createLuotChoiController({ io: fakeIo(), getConfig: () => ({}), log: () => {} });
    assert.equal(c.control('rm -rf').ok, false);
});

test('bàn mẫu ?demo: chạy luật thật trên bàn tạm, bàn thật không đổi, ván tới được kết quả', () => {
    const c = createLuotChoiController({ io: fakeIo(), getConfig: () => ({ enabled: true }), log: () => {} });
    for (const g of ['hama', 'chumcoc', 'thaptre', 'latcap', 'oanquan']) {
        assert.equal(c.demoState(g, 0).seats.length, g === 'oanquan' ? 2 : 4);
        assert.equal(c.demoState(g, 1).phase, 'playing', g);
        let reached = false;
        for (let step = 2; step < 300 && !reached; step += 3) reached = c.demoState(g, step).phase === 'result';
        assert.ok(reached, g + ' phải tới kết quả');
        assert.deepEqual(c.demoState(g, 9).events, c.demoState(g, 9).events, 'tất định');
    }
    assert.equal(c.publicState().seats.length, 0);
});

test('rotate: creator xoay mô hình 3D — phát luotchoi:rotate với dir -1/0/1, dir lạ bị chặn', () => {
    const io = fakeIo();
    const c = createLuotChoiController({ io, getConfig: () => ({ enabled: true }), log: () => {} });
    assert.equal(c.control('rotate', { dir: 1 }).ok, true);
    assert.equal(c.control('rotate', { dir: -1 }).ok, true);
    assert.equal(c.control('rotate', { dir: 0 }).ok, true);
    assert.equal(c.control('rotate', { dir: 'x' }).ok, false);
    const rot = io.sent.filter(([ev]) => ev === 'luotchoi:rotate').map(([, d]) => d.dir);
    assert.deepEqual(rot, [1, -1, 0]);
});
