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

test('gameStatus needOverlay: game bật nhưng overlay không mở → off; mở (hoặc vừa đóng <30s) → running', () => {
    assert.strictEqual(M.gameStatus({ running: true, open: false, needOverlay: true }), 'off');
    assert.strictEqual(M.gameStatus({ running: true, open: true, needOverlay: true }), 'running');
    assert.strictEqual(M.gameStatus({ running: true, open: false, lastOpenAt: 1000, now: 20000, needOverlay: true }), 'running');
    assert.strictEqual(M.gameStatus({ running: true, open: false, lastOpenAt: 1000, now: 40000, needOverlay: true }), 'off');
    // game tắt mà overlay mở vẫn là 🔗; "Luôn hiện" thắng
    assert.strictEqual(M.gameStatus({ running: false, open: true, needOverlay: true }), 'linked');
    assert.strictEqual(M.gameStatus({ visibility: 'always', running: false, open: false, needOverlay: true }), 'running');
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

test('pagerTick: lật trang sau mỗi `sec` giây, vòng lại trang đầu', () => {
    let st = M.pagerTick(null, 14, 6, 0, 5);                 // lần đầu: trang 0, hết hạn sau 5s
    assert.deepStrictEqual(st, { page: 0, until: 5000 });
    st = M.pagerTick(st, 14, 6, 4000, 5);                    // chưa hết giờ → giữ
    assert.strictEqual(st.page, 0);
    st = M.pagerTick(st, 14, 6, 5000, 5); assert.strictEqual(st.page, 1);
    st = M.pagerTick(st, 14, 6, 10000, 5); assert.strictEqual(st.page, 2);
    st = M.pagerTick(st, 14, 6, 15000, 5); assert.strictEqual(st.page, 0);
});

test('pagerTick: ít thẻ hơn 1 trang → luôn trang 0; bớt thẻ → kẹp trang', () => {
    assert.strictEqual(M.pagerTick({ page: 2, until: 1 }, 4, 6, 9, 5).page, 0);
    assert.strictEqual(M.pageCount(0, 6), 1);
    assert.strictEqual(M.pageCount(13, 6), 3);
    assert.strictEqual(M.pagerTick({ page: 2, until: 99999 }, 8, 6, 0, 5).page, 1);
});

test('pagerHold: có quà → nhảy tới trang chứa thẻ và giữ lâu hơn', () => {
    assert.deepStrictEqual(M.pagerHold(13, 6, 1000, 12), { page: 2, until: 13000 });
    assert.deepStrictEqual(M.pagerHold(0, 6, 0, 12), { page: 0, until: 12000 });
});
