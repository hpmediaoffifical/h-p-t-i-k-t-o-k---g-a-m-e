'use strict';
// 🎲 Bộ Trò Chơi Theo Lượt — khung ghế + lượt. Spec docs/superpowers/specs/2026-11-12-luotchoi-design.md §2.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTable, normalizeConfig, parseNumbers, HOST_KEY } = require('../lib/luot-choi/table');

const SEAT = { giftId: '5655', giftName: 'Hoa hồng' };
const SHIELD = { giftId: '6064', giftName: 'Kem' };
const u = (k) => ({ key: k, nickname: 'Tên ' + k, avatar: '' });

function make(cfg = {}, rng = () => 0.5) {
    let t = 1000000;
    const clock = { now: () => t, go: (ms) => { t += ms; tb.tick(); } };
    const tb = createTable({ config: Object.assign({ enabled: true, game: 'hama', seatGifts: [SEAT], shieldGifts: [SHIELD] }, cfg), now: clock.now, rng });
    return { tb, clock };
}
const seat = (tb, ...keys) => keys.map(k => tb.addGift({ user: u(k), giftId: SEAT.giftId }).action);
const snap = (tb) => tb.snapshot();
const turnKey = (tb) => snap(tb).turnKey;
// chạy tới khi hết khoảng giữ (hiệu ứng) để lượt kế bắt đầu
const settle = (tb, clock) => { for (let i = 0; i < 20 && snap(tb).holdUntil; i++) clock.go(500); };

test('normalizeConfig: quà ghi dạng mã trơn ("5655" / 5655) cũng nhận như {giftId}', () => {
    const c = normalizeConfig({ seatGifts: ['5655', 7934, '', null], shieldGifts: [{ giftId: '5269' }] });
    assert.deepEqual(c.seatGifts.map(g => g.giftId), ['5655', '7934']);
    assert.deepEqual(c.shieldGifts.map(g => g.giftId), ['5269']);
});

test('normalizeConfig: chặn khoảng, trò lạ về hama', () => {
    const c = normalizeConfig({ seats: 9, minPlayers: 0, turnSec: 1, game: 'xyz', seatGifts: [{ giftId: 1 }, {}] });
    assert.equal(c.seats, 4);
    assert.equal(c.minPlayers, 2);
    assert.equal(c.turnSec, 8);
    assert.equal(c.game, 'hama');
    assert.deepEqual(c.seatGifts.map(g => g.giftId), ['1']);
    assert.equal(normalizeConfig({ minPlayers: 4, seats: 3 }).minPlayers, 3);
});

test('parseNumbers: chỉ nhận bình luận toàn số', () => {
    assert.deepEqual(parseNumbers('7'), [7]);
    assert.deepEqual(parseNumbers(' #12 '), [12]);
    assert.deepEqual(parseNumbers('3 9'), [3, 9]);
    assert.deepEqual(parseNumbers('3,9'), [3, 9]);
    assert.deepEqual(parseNumbers('số 7'), []);
    assert.deepEqual(parseNumbers('7a'), []);
    assert.deepEqual(parseNumbers(''), []);
    assert.deepEqual(parseNumbers('1 2 3'), []);
});

test('quà đúng → vào ghế; quà sai → bỏ qua; đã ngồi → không ngồi thêm ghế', () => {
    const { tb } = make();
    assert.equal(tb.addGift({ user: u('a'), giftId: '999' }).action, 'ignored');
    assert.equal(tb.addGift({ user: u('a'), giftId: SEAT.giftId }).action, 'seat');
    assert.equal(tb.addGift({ user: u('a'), giftId: SEAT.giftId }).action, 'ignored');
    assert.equal(snap(tb).seats.length, 1);
    assert.equal(snap(tb).phase, 'lobby');
});

test('tắt game → không nhận quà', () => {
    const { tb } = make({ enabled: false });
    assert.equal(seat(tb, 'a')[0], 'ignored');
});

test('đủ 2 người → đếm ngược lobbySec rồi tự chạy', () => {
    const { tb, clock } = make({ lobbySec: 20 });
    seat(tb, 'a');
    clock.go(60000);
    assert.equal(snap(tb).phase, 'lobby', '1 người thì chờ mãi');
    seat(tb, 'b');
    assert.ok(snap(tb).lobbyUntil > 0);
    clock.go(19000);
    assert.equal(snap(tb).phase, 'lobby');
    clock.go(1500);
    assert.equal(snap(tb).phase, 'playing');
    assert.equal(turnKey(tb), 'a', 'người ngồi trước đi trước');
});

test('đủ ghế → chạy sau 3 giây; người tặng thêm vào hàng chờ', () => {
    const { tb, clock } = make({ seats: 2, lobbySec: 30 });
    seat(tb, 'a', 'b');
    clock.go(3100);
    assert.equal(snap(tb).phase, 'playing');
    assert.equal(seat(tb, 'c')[0], 'queue');
    assert.equal(snap(tb).queue.length, 1);
    assert.equal(seat(tb, 'c')[0], 'ignored', 'đã trong hàng chờ');
});

test('hàng chờ có giới hạn maxQueue', () => {
    const { tb } = make({ seats: 2, maxQueue: 1 });
    seat(tb, 'a', 'b');
    assert.deepEqual(seat(tb, 'c', 'd'), ['queue', 'full']);
});

test('chỉ người tới lượt + bình luận toàn số mới tính', () => {
    const { tb, clock } = make({ seats: 2 }, () => 0.99);   // bẫy ở răng cuối
    seat(tb, 'a', 'b'); clock.go(3100);
    const trap = tb._board().trap;
    const safe = trap === 1 ? 2 : 1;
    assert.equal(tb.comment({ user: u('b'), text: String(safe) }), false, 'chưa tới lượt b');
    assert.equal(tb.comment({ user: u('a'), text: 'răng ' + safe }), false, 'không phải toàn số');
    assert.equal(tb.comment({ user: u('a'), text: '99' }), false, 'ngoài khoảng');
    assert.equal(tb.comment({ user: u('a'), text: String(safe) }), true);
    settle(tb, clock);
    assert.equal(turnKey(tb), 'b');
});

test('hết giờ lượt → máy chọn hộ ngẫu nhiên', () => {
    const { tb, clock } = make({ seats: 2, turnSec: 15 }, () => 0.99);
    seat(tb, 'a', 'b'); clock.go(3100);
    clock.go(14000);
    assert.equal(snap(tb).board.used.length, 0);
    clock.go(1500);
    assert.equal(snap(tb).board.used.length, 1);
    assert.ok(snap(tb).events.some(e => e.type === 'pick' && e.auto === true));
});

test('trúng bẫy → bị loại, người đi trước ném vào thùng rác, còn 1 người → vô địch', () => {
    const { tb, clock } = make({ seats: 2, resultSec: 8 });
    seat(tb, 'a', 'b'); clock.go(3100);
    const trap = tb._board().trap;
    tb.comment({ user: u('a'), text: String(trap) });
    const out = snap(tb).events.find(e => e.type === 'out');
    assert.equal(out.key, 'a');
    assert.equal(out.byKey, 'b');
    settle(tb, clock);
    const s = snap(tb);
    assert.equal(s.phase, 'result');
    assert.deepEqual(s.result.winners.map(w => w.key), ['b']);
    assert.deepEqual(s.result.losers.map(w => w.key), ['a']);
    assert.equal(s.champs[0].key, 'b');
    assert.equal(s.champs[0].wins, 1);
});

test('3 người: loại 1 → dựng bàn mới, 2 người còn lại chơi tiếp, lượt sang người kế', () => {
    const { tb, clock } = make({ seats: 3 });
    seat(tb, 'a', 'b', 'c'); clock.go(3100);
    const b1 = tb._board();
    tb.comment({ user: u('a'), text: String(b1.trap) });
    settle(tb, clock);
    const s = snap(tb);
    assert.equal(s.phase, 'playing');
    assert.notEqual(tb._board(), b1, 'bàn mới');
    assert.equal(s.board.used.length, 0);
    assert.equal(turnKey(tb), 'b');
    assert.equal(s.seats.find(x => x.key === 'a').out, true);
    assert.equal(tb.comment({ user: u('a'), text: '1' }), false, 'người bị loại không chơi');
});

test('🛡️ khiên: người đang ngồi tặng quà khiên → trúng bẫy không bị loại, bẫy giấu lại', () => {
    const { tb, clock } = make({ seats: 2 });
    seat(tb, 'a', 'b');
    assert.equal(tb.addGift({ user: u('z'), giftId: SHIELD.giftId }).action, 'ignored', 'chưa ngồi');
    assert.equal(tb.addGift({ user: u('a'), giftId: SHIELD.giftId }).action, 'shield');
    clock.go(3100);
    const trap = tb._board().trap;
    tb.comment({ user: u('a'), text: String(trap) });
    assert.ok(snap(tb).events.some(e => e.type === 'shield' && e.key === 'a'));
    settle(tb, clock);
    const s = snap(tb);
    assert.equal(s.phase, 'playing');
    assert.equal(s.seats[0].out, false);
    assert.equal(s.seats[0].shields, 0);
    assert.notEqual(tb._board().trap, trap);
    assert.equal(turnKey(tb), 'b');
});

test('khiên tối đa 3', () => {
    const { tb } = make();
    seat(tb, 'a');
    for (let i = 0; i < 5; i++) tb.addGift({ user: u('a'), giftId: SHIELD.giftId });
    assert.equal(snap(tb).seats[0].shields, 3);
});

test('Lật Cặp: cặp đúng +1 điểm và đi tiếp; trật → úp lại, sang người kế; hết ô → điểm cao thắng', () => {
    const { tb, clock } = make({ seats: 2, game: 'latcap', pairs: 4 });
    seat(tb, 'a', 'b'); clock.go(3100);
    const f = tb._board().faces;
    const pairOf = (i) => f.findIndex((x, k) => k !== i && x === f[i]);
    const miss = f.findIndex((x, k) => k > 0 && x !== f[0]);
    // a: lật 1 + ô trật (2 số trong 1 bình luận)
    assert.equal(tb.comment({ user: u('a'), text: `1 ${miss + 1}` }), true);
    settle(tb, clock);
    assert.equal(turnKey(tb), 'b');
    assert.equal(snap(tb).board.cards[0].face, undefined, 'đã úp lại');
    // b: lật từng ô một, trúng cặp 0
    assert.equal(tb.comment({ user: u('b'), text: '1' }), true);
    assert.equal(tb.comment({ user: u('b'), text: String(pairOf(0) + 1) }), true);
    settle(tb, clock);
    assert.equal(turnKey(tb), 'b', 'trúng thì đi tiếp');
    assert.equal(snap(tb).seats[1].score, 1);
    // b dọn nốt
    const done = new Set([0, pairOf(0)]);
    for (let i = 0; i < f.length; i++) {
        if (done.has(i)) continue;
        const j = pairOf(i); done.add(i); done.add(j);
        tb.comment({ user: u('b'), text: `${i + 1} ${j + 1}` });
        settle(tb, clock);
    }
    const s = snap(tb);
    assert.equal(s.phase, 'result');
    assert.deepEqual(s.result.winners.map(w => w.key), ['b']);
    assert.deepEqual(s.result.losers.map(w => w.key), ['a']);
});

test('kết quả xong → về sảnh, người trong hàng chờ tự vào ghế, người cũ phải tặng lại', () => {
    const { tb, clock } = make({ seats: 2, resultSec: 8 });
    seat(tb, 'a', 'b'); clock.go(3100);
    seat(tb, 'c');
    tb.comment({ user: u('a'), text: String(tb._board().trap) });
    settle(tb, clock);
    assert.equal(snap(tb).phase, 'result');
    clock.go(8500);
    const s = snap(tb);
    assert.equal(s.phase, 'lobby');
    assert.deepEqual(s.seats.map(x => x.key), ['c']);
    assert.equal(s.queue.length, 0);
});

test('chủ LIVE vào ghế bằng panel và chọn bằng hostPick', () => {
    const { tb, clock } = make({ seats: 2, hostName: 'Anh Chủ' });
    assert.equal(tb.hostJoin().action, 'seat');
    assert.equal(tb.hostJoin().action, 'ignored');
    seat(tb, 'a'); clock.go(3100);
    assert.equal(turnKey(tb), HOST_KEY);
    assert.equal(snap(tb).seats[0].nickname, 'Anh Chủ');
    const trap = tb._board().trap;
    assert.equal(tb.hostPick(trap === 1 ? 2 : 1), true);
    settle(tb, clock);
    assert.equal(turnKey(tb), 'a');
});

test('streamer: Bắt đầu ngay, Huỷ ván giữ ghế, mời khỏi ghế', () => {
    const { tb, clock } = make({ seats: 4, lobbySec: 60 });
    seat(tb, 'a', 'b', 'c');
    assert.equal(tb.startNow().ok, true);
    assert.equal(snap(tb).phase, 'playing');
    tb.cancel();
    assert.equal(snap(tb).phase, 'lobby');
    assert.equal(snap(tb).seats.length, 3);
    tb.kick('b');
    assert.deepEqual(snap(tb).seats.map(x => x.key), ['a', 'c']);
    tb.startNow(); clock.go(10);
    tb.kick(turnKey(tb));   // mời người đang tới lượt khỏi ghế giữa ván → còn 1 → vô địch
    settle(tb, clock);
    assert.equal(snap(tb).phase, 'result');
});

test('đổi trò khi đang chạy ván → huỷ ván, giữ ghế', () => {
    const { tb, clock } = make({ seats: 2 });
    seat(tb, 'a', 'b'); clock.go(3100);
    tb.setConfig({ enabled: true, game: 'thaptre', seatGifts: [SEAT] });
    const s = snap(tb);
    assert.equal(s.phase, 'lobby');
    assert.equal(s.game.id, 'thaptre');
    assert.equal(s.seats.length, 2);
});

test('snapshot không lộ bẫy khi đang chơi', () => {
    const { tb, clock } = make({ seats: 2 });
    seat(tb, 'a', 'b'); clock.go(3100);
    assert.equal(snap(tb).board.trap, undefined);
    assert.ok(Array.isArray(snap(tb).options) && snap(tb).options.length === 10);
});

test('Lật Cặp: mời người đang lật dở khỏi ghế → ô lẻ úp lại, người kế đi', () => {
    const { tb, clock } = make({ seats: 3, game: 'latcap', pairs: 4 });
    seat(tb, 'a', 'b', 'c'); clock.go(3100);
    tb.comment({ user: u('a'), text: '1' });
    assert.equal(snap(tb).board.cards[0].open, true);
    tb.kick('a');
    settle(tb, clock);
    assert.equal(turnKey(tb), 'b');
    assert.equal(snap(tb).board.cards[0].open, false);
});

test('quà thử từ panel (as) vào ghế / thêm khiên không cần cài quà', () => {
    const { tb } = make({ seatGifts: [], shieldGifts: [] });
    assert.equal(tb.addGift({ user: u('a'), as: 'seat' }).action, 'seat');
    assert.equal(tb.addGift({ user: u('a'), as: 'shield' }).action, 'shield');
    assert.equal(tb.addGift({ user: u('b'), giftId: SEAT.giftId }).action, 'ignored');
});

test('người xem trùng khoá Chủ LIVE không vào ghế / chọn số thay Chủ LIVE được', () => {
    const { tb, clock } = make({ seats: 2 });
    tb.hostJoin(); seat(tb, 'a'); clock.go(3100);
    assert.equal(turnKey(tb), HOST_KEY);
    const fake = { key: HOST_KEY, nickname: 'Mạo danh', avatar: '' };
    assert.equal(tb.comment({ user: fake, text: '1' }), false, 'bình luận mạo danh không được tính');
    assert.equal(tb.addGift({ user: fake, giftId: SEAT.giftId }).action, 'ignored');
    assert.equal(snap(tb).board.used.length, 0);
});

test('nhãn tên: ô đã chọn ghi người chọn, giữ qua lượt; bàn dựng lại thì xoá', () => {
    const { tb, clock } = make({ seats: 3 });
    seat(tb, 'a', 'b', 'c'); clock.go(3100);
    const trap = tb._board().trap;
    const safe = trap === 1 ? 2 : 1;
    tb.comment({ user: u('a'), text: String(safe) });
    settle(tb, clock);
    assert.deepEqual(snap(tb).marks, [{ n: safe, key: 'a', nickname: 'Tên a', avatar: '' }]);
    tb.comment({ user: u('b'), text: String(trap) });
    assert.equal(snap(tb).marks.length, 2, 'ô bẫy cũng có nhãn người dính');
    settle(tb, clock);
    assert.deepEqual(snap(tb).marks, [], 'bàn mới');
});

test('Lật Cặp: lật trượt thì bỏ nhãn 2 ô, ghép đúng thì giữ nhãn', () => {
    const { tb, clock } = make({ seats: 2, game: 'latcap', pairs: 4 });
    seat(tb, 'a', 'b'); clock.go(3100);
    const f = tb._board().faces;
    const miss = f.findIndex((x, k) => k > 0 && x !== f[0]);
    tb.comment({ user: u('a'), text: `1 ${miss + 1}` });
    assert.equal(snap(tb).marks.length, 2);
    settle(tb, clock);
    assert.equal(snap(tb).marks.length, 0);
    const mate = f.findIndex((x, k) => k !== 0 && x === f[0]);
    tb.comment({ user: u('b'), text: `1 ${mate + 1}` });
    settle(tb, clock);
    assert.deepEqual(snap(tb).marks.map(m => [m.n, m.key]), [[1, 'b'], [mate + 1, 'b']]);
});

test('nhịp hồi hộp: sau khi chọn, lượt kế chưa bắt đầu ngay (đủ thời gian tay bay vào + lộ kết quả)', () => {
    const { tb, clock } = make({ seats: 2 }, () => 0.99);
    seat(tb, 'a', 'b'); clock.go(3100);
    const safe = tb._board().trap === 1 ? 2 : 1;
    tb.comment({ user: u('a'), text: String(safe) });
    const { SUSPENSE_MS } = require('../lib/luot-choi/table');
    assert.ok(SUSPENSE_MS >= 600 && SUSPENSE_MS <= 1000);
    clock.go(SUSPENSE_MS + 500);
    assert.equal(turnKey(tb), 'a', 'vẫn đang diễn');
    settle(tb, clock);
    assert.equal(turnKey(tb), 'b');
    const pick = snap(tb).events.find(e => e.type === 'pick');
    assert.equal(pick.avatar, '');
    assert.equal(pick.nickname, 'Tên a');
});

test('giọng đọc: mặc định bật, âm lượng chặn 0–100, có trong snapshot cho overlay', () => {
    assert.equal(normalizeConfig({}).voice, true);
    assert.equal(normalizeConfig({ voice: false }).voice, false);
    assert.equal(normalizeConfig({ voiceVolume: 500 }).voiceVolume, 100);
    assert.equal(normalizeConfig({}).voiceVolume, 80);
    const { tb } = make({ voice: false, voiceVolume: 30 });
    assert.deepEqual([snap(tb).cfg.voice, snap(tb).cfg.voiceVolume], [false, 30]);
});

test('âm thanh hiệu ứng: mặc định bật 70%, chặn 0–100, có trong snapshot cho overlay', () => {
    assert.equal(normalizeConfig({}).sfx, true);
    assert.equal(normalizeConfig({ sfx: false }).sfx, false);
    assert.equal(normalizeConfig({}).sfxVolume, 70);
    assert.equal(normalizeConfig({ sfxVolume: -5 }).sfxVolume, 0);
    const { tb } = make({ sfx: false, sfxVolume: 40 });
    assert.deepEqual([snap(tb).cfg.sfx, snap(tb).cfg.sfxVolume], [false, 40]);
});

test('Ô Ăn Quan rải sỏi thành nhạc: oqSong mặc định happy, chỉ nhận bài có sẵn hoặc off, có trong snapshot', () => {
    assert.equal(normalizeConfig({}).oqSong, 'happy');
    for (const id of ['happy', 'twinkle', 'buom', 'off']) assert.equal(normalizeConfig({ oqSong: id }).oqSong, id);
    assert.equal(normalizeConfig({ oqSong: 'xyz' }).oqSong, 'happy');
    const { tb } = make({ oqSong: 'buom' });
    assert.equal(snap(tb).cfg.oqSong, 'buom');
});

test('boardId: đổi mỗi lần dựng bàn (bắt đầu / loại người) để overlay 3D biết dựng lại cảnh', () => {
    const { tb, clock } = make({ seats: 3 });
    seat(tb, 'a', 'b', 'c'); clock.go(3100);
    const id1 = snap(tb).boardId;
    assert.ok(id1 > 0);
    tb.comment({ user: u('a'), text: String(tb._board().trap === 1 ? 2 : 1) });
    settle(tb, clock);
    assert.equal(snap(tb).boardId, id1, 'chọn an toàn không đổi bàn');
    tb.comment({ user: u('b'), text: String(tb._board().trap) });
    settle(tb, clock);
    assert.ok(snap(tb).boardId > id1, 'loại người → bàn mới');
});

test('Ô Ăn Quan: chỉ 2 ghế (người thứ 3 vào hàng chờ), đủ 2 là chạy', () => {
    const { tb, clock } = make({ game: 'oanquan', seats: 4, minPlayers: 3 });
    assert.deepEqual(seat(tb, 'a', 'b', 'c'), ['seat', 'seat', 'queue']);
    assert.equal(snap(tb).cfg.seats, 2);
    clock.go(3100);
    assert.equal(snap(tb).phase, 'playing');
});

test('Ô Ăn Quan: bình luận "3 2" = ô 3 rải phải; lượt sang người kia sau khi diễn rải xong; điểm đồng bộ lên ghế', () => {
    const { tb, clock } = make({ game: 'oanquan', seats: 2 });
    seat(tb, 'a', 'b'); clock.go(3100);
    assert.deepEqual(snap(tb).options, [1, 2, 3, 4, 5]);
    assert.equal(tb.comment({ user: u('a'), text: '3 2' }), true);
    const mv = snap(tb).board.lastMove;
    assert.ok(mv && mv.trace.length > 3);
    assert.ok(snap(tb).holdUntil > 0);
    settle(tb, clock);
    assert.equal(turnKey(tb), 'b');
    const sc = snap(tb).board.scores;
    assert.deepEqual(snap(tb).seats.map(s => s.score), sc);
});

test('Ô Ăn Quan: gõ từng số (ô rồi hướng) cũng được; hết giờ máy đi hộ trọn 1 nước', () => {
    const { tb, clock } = make({ game: 'oanquan', seats: 2, turnSec: 15 });
    seat(tb, 'a', 'b'); clock.go(3100);
    assert.equal(tb.comment({ user: u('a'), text: '1' }), true);
    assert.deepEqual(snap(tb).options, [1, 2]);
    assert.equal(tb.comment({ user: u('a'), text: '1' }), true);
    settle(tb, clock);
    assert.equal(turnKey(tb), 'b');
    clock.go(15500);
    assert.ok(snap(tb).board.lastMove.side === 1, 'máy đi hộ bên 1');
});

test('Ô Ăn Quan: để máy tự đi tới hết ván → có kết quả theo điểm', () => {
    let x = 7;
    const rng = () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; };
    const { tb, clock } = make({ game: 'oanquan', seats: 2, turnSec: 8 }, rng);
    seat(tb, 'a', 'b'); clock.go(3100);
    for (let i = 0; i < 4000 && snap(tb).phase === 'playing'; i++) clock.go(1000);
    const s = snap(tb);
    assert.equal(s.phase, 'result');
    const [p0, p1] = s.seats.map(q => q.score);
    if (p0 === p1) assert.equal(s.result.draw, true);
    else assert.equal(s.result.winners[0].key, p0 > p1 ? 'a' : 'b');
});

test('Ô Ăn Quan: bình luận "2 phải" đi được (bàn dùng parseComment riêng của trò)', () => {
    const { tb, clock } = make({ game: 'oanquan', seats: 2 });
    seat(tb, 'a', 'b'); clock.go(3100);
    assert.equal(tb.comment({ user: u('a'), text: '2 phải' }), true);
    assert.equal(snap(tb).board.lastMove.dir, 2);
    settle(tb, clock);
    assert.equal(tb.comment({ user: u('b'), text: String(snap(tb).options[0]) }), true);   // 1 ô còn quân
    assert.equal(tb.comment({ user: u('b'), text: 'trái' }), true);
    assert.equal(snap(tb).board.lastMove.dir, 1);
});

test('giao diện LIVE: khung neo dưới, nền kính mờ 35%, cỡ 85% mặc định; giá trị lạ bị chặn; có trong snapshot', () => {
    const c = normalizeConfig({});
    assert.deepEqual([c.layout, c.glass, c.cardScale], ['bottom', 35, 85]);
    const d = normalizeConfig({ layout: 'xyz', glass: 500, cardScale: 10 });
    assert.deepEqual([d.layout, d.glass, d.cardScale], ['bottom', 90, 55]);
    assert.equal(normalizeConfig({ layout: 'top' }).layout, 'top');
    const { tb } = make({ layout: 'middle', glass: 20, cardScale: 70 });
    assert.deepEqual([snap(tb).cfg.layout, snap(tb).cfg.glass, snap(tb).cfg.cardScale], ['middle', 20, 70]);
});

test('kiểu hiển thị: HUD nổi mặc định (không khung nền to), chọn được khung kính; có trong snapshot', () => {
    assert.equal(normalizeConfig({}).frame, 'hud');
    assert.equal(normalizeConfig({ frame: 'card' }).frame, 'card');
    assert.equal(normalizeConfig({ frame: 'abc' }).frame, 'hud');
    const { tb } = make({ frame: 'card' });
    assert.equal(snap(tb).cfg.frame, 'card');
});

test('Dê Núi giữ lượt lâu hơn đúng leadMs (overlay xoay núi tới hốc + dừng ~1 giây rồi mới cắm)', () => {
    const holdAfterPick1 = (game) => {
        const { tb, clock } = make({ game, seats: 2 });
        seat(tb, 'a', 'b'); clock.go(3100);
        const s = snap(tb);
        tb.comment({ user: u(s.turnKey), text: '1' });   // ô 1: không phải bẫy với rng 0.5
        return snap(tb).holdUntil - clock.now();
    };
    const { GAMES_BY_ID } = require('../lib/luot-choi/games');
    assert.equal(GAMES_BY_ID.chumcoc.leadMs, 1600);
    assert.equal(holdAfterPick1('chumcoc') - holdAfterPick1('hama'), 1600);
});

// QA 19/11: mời người khỏi ghế ĐÚNG LÚC bàn giữ hoạt cảnh từng ghi đè việc đang chờ → ván treo cứng
function mkSeeded(game, seed, extra) {
    let t = 1e9, s0 = seed; const rng = () => { s0 = (s0 * 16807) % 2147483647; return (s0 - 1) / 2147483646; };
    const tb = createTable({ config: Object.assign({ enabled: true, game, seats: 3, minPlayers: 2 }, extra || {}), now: () => t, rng });
    const run = (ms) => { for (let i = 0; i < ms / 250; i++) { t += 250; tb.tick(); } };
    ['a', 'b', 'c'].forEach(k => tb.addGift({ user: { key: k, nickname: k }, as: 'seat' }));
    run(4000);
    return { tb, run };
}
test('mời ra lúc 2 thẻ lật trật đang chờ úp lại: thẻ vẫn úp lại, lượt chuyển cho người kế, ván không treo', () => {
    const { tb, run } = mkSeeded('latcap', 3);
    const who = tb.snapshot().turnKey; const b = tb._board();
    const i2 = b.faces.findIndex((f, i) => i > 0 && f !== b.faces[0]);
    tb.comment({ user: { key: who }, text: '1 ' + (i2 + 1) });
    assert.equal(tb.kick(who).ok, true);
    run(8000);
    const s = tb.snapshot();
    assert.equal(s.phase, 'playing');
    assert.notEqual(s.turnKey, who);
    assert.equal(!!s.board.pendingMiss, false);
    assert.ok(s.options.length > 0, 'còn thẻ để chọn');
});
test('mời ra ngay sau khi lật trúng cặp cuối: ván vẫn kết thúc', () => {
    const { tb, run } = mkSeeded('latcap', 9, { pairs: 4 });
    const b = tb._board();
    const pairs = () => { const m = new Map(); b.faces.forEach((f, i) => { if (!b.matched[i]) (m.get(f) || m.set(f, []).get(f)).push(i + 1); }); return [...m.values()]; };
    while (pairs().length > 1) { tb.comment({ user: { key: tb.snapshot().turnKey }, text: pairs()[0].join(' ') }); run(3000); }
    const who = tb.snapshot().turnKey;
    tb.comment({ user: { key: who }, text: pairs()[0].join(' ') });
    tb.kick(who);
    run(30000);
    assert.notEqual(tb.snapshot().phase, 'playing');
});
test('Hà Mã: khiên đang cứu mà bị mời ra → ván chạy tiếp (lượt người kế, có ô để chọn)', () => {
    const { tb, run } = mkSeeded('hama', 5);
    ['a', 'b', 'c'].forEach(k => tb.addGift({ user: { key: k }, as: 'shield' }));
    const who = tb.snapshot().turnKey;
    tb.comment({ user: { key: who }, text: String(tb._board().trap) });
    tb.kick(who);
    run(8000);
    const s = tb.snapshot();
    assert.equal(s.phase, 'playing');
    assert.notEqual(s.turnKey, who);
    assert.ok(s.options.length > 0);
});
