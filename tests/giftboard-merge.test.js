const test = require('node:test');
const assert = require('node:assert');
const M = require('../public/lib/giftboard-merge.js');

const E = (gameId, giftId, extra) => ({ gameId, giftId, generic: false, giftName: 'Quà ' + giftId, ...extra });
const G = gameId => ({ gameId, giftId: '', generic: true, giftName: 'Mọi quà' });

test('gameStatus: bật → running; tắt nhưng overlay mở → linked; còn lại off', () => {
    assert.strictEqual(M.gameStatus({ running: true }), 'running');
    assert.strictEqual(M.gameStatus({ running: false, open: true }), 'linked');
    assert.strictEqual(M.gameStatus({ running: false, open: false }), 'off');
});

test('gameStatus: ghi đè tay Luôn hiện / Không hiện thắng mọi thứ', () => {
    assert.strictEqual(M.gameStatus({ visibility: 'always', running: false }), 'running');
    assert.strictEqual(M.gameStatus({ visibility: 'never', running: true, open: true }), 'off');
    assert.strictEqual(M.gameStatus({ visibility: 'lạ', running: true }), 'running');
});

test('gameStatus: mất tín hiệu overlay vẫn giữ linked 30s rồi mới off', () => {
    assert.strictEqual(M.gameStatus({ open: false, lastOpenAt: 1000, now: 1000 + 29000 }), 'linked');
    assert.strictEqual(M.gameStatus({ open: false, lastOpenAt: 1000, now: 1000 + 31000 }), 'off');
});

test('mergeBoard: game off bị bỏ', () => {
    const r = M.mergeBoard([E('thuytinh', '1'), E('caro', '2')], { thuytinh: 'running' });
    assert.deepStrictEqual(r.main.map(e => e.gameId), ['thuytinh']);
    assert.deepStrictEqual(r.linked, []);
});

test('mergeBoard: game linked không trùng quà → gộp vào danh sách chính', () => {
    const r = M.mergeBoard([E('thuytinh', '1'), E('caro', '2'), G('caro')], { thuytinh: 'running', caro: 'linked' });
    assert.deepStrictEqual(r.main.map(e => e.gameId), ['thuytinh', 'caro', 'caro']);
    assert.deepStrictEqual(r.linked, []);
    assert.deepStrictEqual(r.overlaps, []);
});

test('mergeBoard: game linked trùng quà game đang chạy → cả game sang "Đang mở kèm" + cảnh báo', () => {
    const r = M.mergeBoard([E('thuytinh', '1'), E('caro', '1'), E('caro', '2')], { thuytinh: 'running', caro: 'linked' });
    assert.deepStrictEqual(r.main.map(e => e.gameId), ['thuytinh']);
    assert.deepStrictEqual(r.linked.map(e => e.giftId), ['1', '2']);
    assert.deepStrictEqual(r.linkedGames, ['caro']);
    // Caro đang tắt → chưa "cùng chạy"; chỉ đánh dấu trùng để streamer biết nếu bật lên
    assert.deepStrictEqual(r.overlaps, []);
    assert.deepStrictEqual(r.clashOf, { 1: ['thuytinh'] });
});

test('mergeBoard: 2 game đang chạy trùng quà → vẫn ở danh sách chính, có cảnh báo', () => {
    const r = M.mergeBoard([E('thuytinh', '5'), E('chemtraicay', '5')], { thuytinh: 'running', chemtraicay: 'running' });
    assert.strictEqual(r.main.length, 2);
    assert.deepStrictEqual(r.overlapOf, { 5: ['thuytinh', 'chemtraicay'] });
    assert.deepStrictEqual(r.overlaps, [{ giftId: '5', giftName: 'Quà 5', games: ['thuytinh', 'chemtraicay'] }]);
    assert.deepStrictEqual(r.clashOf, {});
});

test('mergeBoard: dòng "mọi quà" không bao giờ tính trùng; trùng trong cùng 1 game không cảnh báo', () => {
    const r = M.mergeBoard([G('nhietdo'), G('bancung'), E('trongcay', '7'), E('trongcay', '7', { source: 'water' })],
        { nhietdo: 'running', bancung: 'linked', trongcay: 'running' });
    assert.deepStrictEqual(r.overlaps, []);
    assert.deepStrictEqual(r.linked, []);
});
