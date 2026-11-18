'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGoiBai, normalizeConfig, DEFAULTS } = require('../lib/goi-bai/logic');

const U = (key, nickname = key) => ({ key, nickname, avatar: '' });
const item = (id, o = {}) => Object.assign({ id, title: 'Bài ' + id, channel: 'Kênh', duration: 200, isLive: false, thumb: '' }, o);

function make(cfg = {}, opts = {}) {
    let t = 1_000_000;
    const so = createGoiBai(Object.assign({ config: Object.assign({ gifts: [{ giftId: '5655' }] }, cfg), now: () => t }, opts));
    return { so, adv: (ms) => { t += ms; so.tick(); }, now: () => t };
}
// quà mở lượt → bình luận → tìm xong: trả về hàng đã ready
function callSong(so, who, coins, vid, text = 'bài ' + vid) {
    so.addGift({ user: U(who), giftId: '5655', coins });
    const row = so.addComment({ user: U(who), text });
    assert.ok(row, 'phải tạo hàng');
    const r = so.applySearch(row.id, [item(vid)]);
    assert.equal(r.ok, true);
    return r.mergedInto || r.row;
}

test('normalizeConfig: mặc định + kẹp giá trị', () => {
    const c = normalizeConfig({ countdownSec: 999, maxPerViewer: 0, gifts: [{ giftId: 5655 }, {}], volume: -5 });
    assert.equal(c.countdownSec, 120);
    assert.equal(c.maxPerViewer, 1);
    assert.equal(c.volume, 0);
    assert.deepEqual(c.gifts.map(g => g.giftId), ['5655']);
    assert.equal(normalizeConfig(null).lockFirst, DEFAULTS.lockFirst);
});

test('quà không nằm trong danh sách → bỏ qua', () => {
    const { so } = make();
    assert.equal(so.addGift({ user: U('a'), giftId: '1', coins: 1 }).action, 'ignored');
    assert.equal(so.snapshot().passes.length, 0);
    // giả lập từ panel: force bỏ qua danh sách quà
    assert.equal(so.addGift({ user: U('t'), giftId: '', coins: 1, force: true }).action, 'pass');
});

test('quà mở lượt: 2 mốc cdUntil / validUntil, quà thêm cộng xu vào lượt', () => {
    const { so, now } = make({ countdownSec: 15, keepMin: 10 });
    assert.equal(so.addGift({ user: U('a'), giftId: '5655', coins: 1 }).action, 'pass');
    const g = so.snapshot().passes[0];
    assert.equal(g.cdUntil, now() + 15000);
    assert.equal(g.validUntil, now() + 600000);
    assert.equal(so.addGift({ user: U('a'), giftId: '5655', coins: 5 }).action, 'passAdd');
    assert.equal(so.snapshot().passes[0].coins, 6);
});

test('keepMin = 0 → hạn thật bằng đếm ngược; lượt hết hạn bị gỡ', () => {
    const { so, adv } = make({ countdownSec: 15, keepMin: 0 });
    so.addGift({ user: U('a'), giftId: '5655', coins: 1 });
    adv(14000); assert.equal(so.snapshot().passes.length, 1);
    adv(2000); assert.equal(so.snapshot().passes.length, 0);
    assert.equal(so.addComment({ user: U('a'), text: 'Lạc Trôi' }), null);
});

test('lượt giữ 10 phút dù đếm ngược trên OBS đã hết (TikTok trễ)', () => {
    const { so, adv } = make({ countdownSec: 15, keepMin: 10 });
    so.addGift({ user: U('a'), giftId: '5655', coins: 1 });
    adv(60000);
    const row = so.addComment({ user: U('a'), text: 'Lạc Trôi' });
    assert.equal(row.status, 'searching');
    assert.equal(row.query, 'Lạc Trôi');
    assert.equal(so.snapshot().passes.length, 0, 'lượt đã tiêu');
});

test('bình luận không có lượt / quá ngắn / chỉ số ngắn → không tạo hàng', () => {
    const { so } = make();
    assert.equal(so.addComment({ user: U('x'), text: 'Lạc Trôi' }), null);
    so.addGift({ user: U('a'), giftId: '5655', coins: 1 });
    assert.equal(so.addComment({ user: U('a'), text: 'a' }), null);
    assert.equal(so.addComment({ user: U('a'), text: '111' }), null);
    assert.equal(so.snapshot().passes.length, 1, 'lượt còn nguyên');
    assert.ok(so.addComment({ user: U('a'), text: '2002' }), 'số 4 chữ là tên bài được');
});

test('tìm xong: chọn kết quả đầu tiên không live, đủ ngắn; rút gọn tên', () => {
    const { so } = make({ maxSongSec: 420 });
    so.addGift({ user: U('a'), giftId: '5655', coins: 1 });
    const row = so.addComment({ user: U('a'), text: 'lac troi' });
    const r = so.applySearch(row.id, [
        item('live1', { isLive: true }),
        item('long1', { duration: 900 }),
        item('zero', { duration: 0 }),
        item('ok1', { title: 'Lạc Trôi | Official Music Video', channel: 'Sơn Tùng M-TP' })
    ]);
    assert.equal(r.ok, true);
    assert.equal(r.row.videoId, 'ok1');
    assert.equal(r.row.status, 'ready');
    assert.equal(r.row.title, 'Lạc Trôi');
});

test('bị loại → trả lượt cùng số xu + lý do', () => {
    const { so } = make({ maxSongSec: 420 });
    so.addGift({ user: U('a'), giftId: '5655', coins: 30 });
    const row = so.addComment({ user: U('a'), text: 'mix 2 tiếng' });
    const r = so.applySearch(row.id, [item('long', { duration: 7200 })]);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'toolong');
    assert.equal(so.snapshot().queue.length, 0);
    const g = so.snapshot().passes[0];
    assert.equal(g.coins, 30);
    assert.equal(g.note, 'toolong');
    // không có kết quả nào
    const row2 = so.addComment({ user: U('a'), text: 'zzz' });
    assert.equal(so.applySearch(row2.id, []).reason, 'notfound');
    // yt-dlp lỗi
    const row3 = so.addComment({ user: U('a'), text: 'zzz' });
    assert.equal(so.rejectRow(row3.id, 'error').reason, 'error');
    assert.equal(so.snapshot().passes[0].coins, 30);
});

test('tên bài dính từ cấm → loại, trả lượt', () => {
    const { so } = make({}, { isBlocked: (t) => /cấm/.test(t) });
    so.addGift({ user: U('a'), giftId: '5655', coins: 1 });
    const row = so.addComment({ user: U('a'), text: 'abc' });
    assert.equal(so.applySearch(row.id, [item('v', { title: 'Bài cấm' })]).reason, 'blocked');
});

test('mỗi người tối đa 1 bài: quà thêm → cộng xu vào bài đang chờ', () => {
    const { so } = make({ maxPerViewer: 1 });
    const row = callSong(so, 'a', 1, 'v1');
    assert.equal(so.addGift({ user: U('a'), giftId: '5655', coins: 99 }).action, 'boost');
    assert.equal(so.snapshot().queue.find(r => r.id === row.id).coins, 100);
    assert.equal(so.snapshot().passes.length, 0);
});

test('trùng bài đang chờ → góp xu vào bài có sẵn', () => {
    const { so } = make();
    const a = callSong(so, 'a', 10, 'same');
    const merged = callSong(so, 'b', 5, 'same');
    assert.equal(merged.id, a.id);
    const q = so.snapshot().queue;
    assert.equal(q.length, 1);
    assert.equal(q[0].coins, 15);
    assert.deepEqual(q[0].backers.map(c => c.key), ['b']);
});

test('trùng bài đang phát → loại "playing", trả lượt', () => {
    const { so } = make({ clipOn: false });   // không phát đoạn hay: bài đang phát không nhận góp
    const a = callSong(so, 'a', 10, 'same');
    so.beginPlay(a.id);
    so.addGift({ user: U('b'), giftId: '5655', coins: 3 });
    const row = so.addComment({ user: U('b'), text: 'same' });
    assert.equal(so.applySearch(row.id, [item('same')]).reason, 'playing');
});

test('xếp theo xu, ai trước đứng trước khi hoà', () => {
    const { so, adv } = make({ lockFirst: 0 });
    callSong(so, 'a', 1, 'v1'); adv(10);
    callSong(so, 'b', 50, 'v2'); adv(10);
    callSong(so, 'c', 1, 'v3');
    assert.deepEqual(so.snapshot().queue.map(r => r.videoId), ['v2', 'v1', 'v3']);
});

test('chống bỏ đói: chờ lâu được cộng điểm', () => {
    const { so, adv } = make({ lockFirst: 0, waitBonus: 30 });
    callSong(so, 'a', 1, 'old');
    adv(5 * 60000);   // +150 điểm
    callSong(so, 'b', 100, 'new');
    assert.deepEqual(so.snapshot().queue.map(r => r.videoId), ['old', 'new']);
});

test('khoá top N sau thời gian đứng yên; quà to không chen được lên trước bài đã khoá', () => {
    const { so, adv } = make({ lockFirst: 2, lockAfterSec: 8, waitBonus: 0 });
    callSong(so, 'a', 1, 'v1');
    callSong(so, 'b', 2, 'v2');
    adv(1000);
    callSong(so, 'c', 500, 'v3');   // chưa ai khoá → chen lên đầu được
    assert.equal(so.snapshot().queue[0].videoId, 'v3');
    adv(1000);                   // nhịp tick 1 giây: v3 bắt đầu tính giờ đứng top
    adv(8000);                   // v3, v2 đứng top 2 đủ 8 giây → khoá
    const q = so.snapshot().queue;
    assert.deepEqual(q.slice(0, 2).map(r => [r.videoId, r.locked]), [['v3', true], ['v2', true]]);
    callSong(so, 'd', 9999, 'v4');
    assert.deepEqual(so.snapshot().queue.map(r => r.videoId), ['v3', 'v2', 'v4', 'v1']);
});

test('peekNext bỏ qua bài đang tìm; beginPlay / endPlay', () => {
    const { so } = make({ lockFirst: 0 });
    so.addGift({ user: U('a'), giftId: '5655', coins: 100 });
    const searching = so.addComment({ user: U('a'), text: 'đang tìm' });
    const b = callSong(so, 'b', 1, 'v2');
    assert.equal(so.peekNext().id, b.id);
    so.beginPlay(b.id);
    assert.equal(so.snapshot().playing.id, b.id);
    assert.equal(so.snapshot().queue.length, 1);
    assert.equal(so.snapshot().queue[0].id, searching.id);
    so.endPlay();
    assert.equal(so.snapshot().playing, null);
    assert.equal(so.peekNext(), null);
});

test('bài đang phát không nhận cộng xu; người đó lại được lượt mới', () => {
    const { so } = make({ clipOn: false });   // không phát đoạn hay: không nối dài
    const a = callSong(so, 'a', 1, 'v1');
    so.beginPlay(a.id);
    assert.equal(so.addGift({ user: U('a'), giftId: '5655', coins: 5 }).action, 'pass');
    assert.equal(so.snapshot().playing.coins, 1);
});

test('🎵 quà Ca khúc: vào hàng ngay, không tính giới hạn mỗi người', () => {
    const { so } = make({ maxPerViewer: 1 });
    callSong(so, 'a', 1, 'v1');
    const row = so.addSongGift({ user: U('a'), coins: 199, song: 'Nơi Này Có Anh', artist: 'Sơn Tùng M-TP' });
    assert.equal(row.query, 'Nơi Này Có Anh Sơn Tùng M-TP');
    assert.equal(row.status, 'searching');
    assert.equal(row.source, 'music');
    assert.equal(so.snapshot().queue.length, 2);
    // tìm không ra → trả thành lượt để người đó tự gõ tên bài
    assert.equal(so.applySearch(row.id, []).reason, 'notfound');
    assert.equal(so.snapshot().passes[0].coins, 199);
});

test('quà Ca khúc tắt → bỏ qua', () => {
    const { so } = make({ songGifts: false });
    assert.equal(so.addSongGift({ user: U('a'), coins: 199, song: 'X', artist: '' }), null);
});

test('pinTop lên đầu + khoá; remove; clear', () => {
    const { so } = make({ lockFirst: 3, lockAfterSec: 0 });
    callSong(so, 'a', 50, 'v1');
    const b = callSong(so, 'b', 1, 'v2');
    const c = callSong(so, 'c', 1, 'v3');
    so.tick();
    so.pinTop(c.id);
    assert.equal(so.snapshot().queue[0].id, c.id);
    assert.equal(so.snapshot().queue[0].locked, true);
    so.remove(b.id);
    assert.equal(so.snapshot().queue.length, 2);
    so.clear();
    assert.equal(so.snapshot().queue.length, 0);
    assert.equal(so.snapshot().passes.length, 0);
});

test('serialize/restore: bài đang phát quay lại đầu hàng', () => {
    const { so } = make();
    const a = callSong(so, 'a', 1, 'v1');
    callSong(so, 'b', 9, 'v2');
    so.beginPlay(a.id);
    so.addGift({ user: U('c'), giftId: '5655', coins: 3 });
    const data = JSON.parse(JSON.stringify(so.serialize()));
    const { so: so2 } = make();
    so2.restore(data);
    const s = so2.snapshot();
    assert.equal(s.playing, null);
    assert.equal(s.queue[0].videoId, 'v1');
    assert.equal(s.queue[0].locked, true);
    assert.equal(s.passes[0].coins, 3);
    // id mới không trùng id cũ
    so2.addGift({ user: U('d'), giftId: '5655', coins: 1 });
    const row = so2.addComment({ user: U('d'), text: 'mới' });
    assert.ok(!s.queue.some(r => r.id === row.id));
});

test('hàng đang tìm bị xoá giữa chừng → applySearch trả gone, không trả lượt', () => {
    const { so } = make();
    so.addGift({ user: U('a'), giftId: '5655', coins: 1 });
    const row = so.addComment({ user: U('a'), text: 'abc' });
    so.remove(row.id);
    assert.equal(so.applySearch(row.id, [item('v')]).reason, 'gone');
    assert.equal(so.snapshot().passes.length, 0);
});

// ── Giai đoạn 2 (spec §10) ─────────────────────────────────────────────────
const CLIP = { start: 100, end: 145, len: 45, full: false, src: 'heat' };
const FULLCLIP = { start: 0, end: null, len: null, full: true, src: 'full' };

test('nối dài: người gọi bài đang phát tặng quà mở lượt → cộng vào bài đang phát', () => {
    const { so } = make();
    const r = callSong(so, 'a', 1, 'v1');
    so.beginPlay(r.id); so.setClip(r.id, CLIP);
    const g = so.addGift({ user: U('a'), giftId: '5655', coins: 50 });
    assert.equal(g.action, 'extend');
    assert.equal(so.playing.coins, 51);
    assert.equal(so.snapshot().passes.length, 0, 'không mở lượt mới');
});

test('nối dài: đã phát cả bài / tắt đoạn hay → quà mở lượt mới như cũ', () => {
    const { so } = make();
    const r = callSong(so, 'a', 1, 'v1');
    so.beginPlay(r.id); so.setClip(r.id, FULLCLIP);
    assert.equal(so.addGift({ user: U('a'), giftId: '5655', coins: 5 }).action, 'pass');
    const m = make({ clipOn: false });
    const r2 = callSong(m.so, 'b', 1, 'v2');
    m.so.beginPlay(r2.id); m.so.setClip(r2.id, CLIP);
    assert.equal(m.so.addGift({ user: U('b'), giftId: '5655', coins: 5 }).action, 'pass');
});

test('nối dài: người khác gọi trùng bài đang phát (đoạn ngắn) → góp xu; đã cả bài → trả lượt', () => {
    const { so } = make();
    const r = callSong(so, 'a', 1, 'v1');
    so.beginPlay(r.id); so.setClip(r.id, CLIP);
    so.addGift({ user: U('b'), giftId: '5655', coins: 40 });
    const row = so.addComment({ user: U('b'), text: 'trùng' });
    const res = so.applySearch(row.id, [item('v1')]);
    assert.equal(res.ok, true);
    assert.equal(res.extended, true);
    assert.equal(so.playing.coins, 41);
    assert.equal(so.playing.backers.length, 1);
    assert.equal(so.snapshot().queue.length, 0);
    so.setClip(r.id, FULLCLIP);
    so.addGift({ user: U('c'), giftId: '5655', coins: 1 });
    const row2 = so.addComment({ user: U('c'), text: 'trùng nữa' });
    assert.equal(so.applySearch(row2.id, [item('v1')]).reason, 'playing');
});

// đang phát 1 bài + 2 bài ready trong hàng
function duelSetup(cfg = {}) {
    const m = make(Object.assign({ lockFirst: 0 }, cfg));
    const p = callSong(m.so, 'p', 1, 'vp');
    m.so.beginPlay(p.id);
    const a = callSong(m.so, 'a', 10, 'va');
    const b = callSong(m.so, 'b', 5, 'vb');
    return Object.assign(m, { p, a, b });
}

test('Đấu Bài: mở trận giữa 2 bài ready đầu hàng khi còn đủ thời gian', () => {
    const { so, a, b } = duelSetup();
    so.tick({ remainSec: 10 });
    assert.equal(so.snapshot().duel, null, 'còn ít giờ → không mở');
    so.tick({ remainSec: 60 });
    const d = so.snapshot().duel;
    assert.ok(d, 'phải mở trận');
    assert.equal(d.a.id, a.id);
    assert.equal(d.b.id, b.id);
    assert.equal(d.endsAt - d.startedAt, 15000);
});

test('Đấu Bài: không mở khi tắt, tạm dừng, chưa đủ 2 bài ready, hoặc không có bài đang phát', () => {
    let m = duelSetup({ duel: false }); m.so.tick({ remainSec: 60 }); assert.equal(m.so.snapshot().duel, null);
    m = duelSetup(); m.so.tick({ remainSec: 60, paused: true }); assert.equal(m.so.snapshot().duel, null);
    m = duelSetup(); m.so.tick({}); assert.equal(m.so.snapshot().duel, null, 'chưa biết còn bao lâu');
    m = make({ lockFirst: 0 });
    callSong(m.so, 'a', 1, 'va'); callSong(m.so, 'b', 1, 'vb');
    m.so.tick({ remainSec: 60 }); assert.equal(m.so.snapshot().duel, null, 'không có bài đang phát');
    m = make({ lockFirst: 0 });
    const p = callSong(m.so, 'p', 1, 'vp'); m.so.beginPlay(p.id);
    callSong(m.so, 'a', 1, 'va');
    m.so.addGift({ user: U('b'), giftId: '5655', coins: 1 }); m.so.addComment({ user: U('b'), text: 'đang tìm' });
    m.so.tick({ remainSec: 60 }); assert.equal(m.so.snapshot().duel, null, 'bài searching không tính');
});

test('Đấu Bài: mỗi người 1 phiếu, không đổi phe; chỉ "1"/"2"', () => {
    const { so } = duelSetup();
    assert.equal(so.duelVote({ user: U('x'), text: '1' }), null, 'chưa có trận');
    so.tick({ remainSec: 60 });
    assert.equal(so.duelVote({ user: U('x'), text: ' 2 ' }).side, 'b');
    assert.equal(so.duelVote({ user: U('x'), text: '1' }).ok, false);
    assert.equal(so.duelVote({ user: U('y'), text: '12' }), null);
    assert.equal(so.duelVote({ user: U('y'), text: '1' }).side, 'a');
    const d = so.snapshot().duel;
    assert.equal(d.a.votes, 1);
    assert.equal(d.b.votes, 1);
});

test('Đấu Bài: người đã bầu tặng quà (bất kỳ) → xu vào bài phe đó', () => {
    const { so, b } = duelSetup();
    so.tick({ remainSec: 60 });
    so.duelVote({ user: U('x'), text: '2' });
    const g = so.addGift({ user: U('x'), giftId: '9999', coins: 20 });
    assert.equal(g.action, 'duelGift');
    assert.equal(so.findRow(b.id).coins, 25);
    assert.equal(so.snapshot().duel.b.pts, 21, '1 phiếu + 20 xu');
    // người chưa bầu: quà lạ bị bỏ qua như cũ
    assert.equal(so.addGift({ user: U('z'), giftId: '9999', coins: 20 }).action, 'ignored');
});

test('Đấu Bài: hết giờ → bài thắng lên đầu, phát kế tiếp; 1 trận / bài đang phát', () => {
    const { so, adv, a, b } = duelSetup();
    so.tick({ remainSec: 60 });
    so.duelVote({ user: U('x'), text: '2' }); so.duelVote({ user: U('y'), text: '2' });
    adv(15000); so.tick({ remainSec: 40 });
    assert.equal(so.snapshot().duel, null);
    assert.equal(so.snapshot().lastDuel.winnerId, b.id);
    assert.equal(so.peekNext().id, b.id);
    assert.equal(so.findRow(a.id).duelLosses, 1);
    so.tick({ remainSec: 40 });
    assert.equal(so.snapshot().duel, null);
});

test('Đấu Bài: hoà → bài đứng trước (A) thắng', () => {
    const { so, adv, a } = duelSetup();
    so.tick({ remainSec: 60 });
    adv(15000); so.tick({ remainSec: 40 });
    assert.equal(so.snapshot().lastDuel.winnerId, a.id);
    assert.equal(so.peekNext().id, a.id);
});

test('Đấu Bài: bài đang phát kết thúc giữa trận → chốt luôn', () => {
    const { so, b } = duelSetup();
    so.tick({ remainSec: 60 });
    so.duelVote({ user: U('x'), text: '2' });
    so.endPlay();
    assert.equal(so.snapshot().duel, null);
    assert.equal(so.snapshot().lastDuel.winnerId, b.id);
    assert.equal(so.peekNext().id, b.id);
});

test('Đấu Bài: thua 2 trận liên tiếp → về cuối hàng', () => {
    const { so, adv, a, b } = duelSetup();
    const c = callSong(so, 'c', 1, 'vc');
    so.tick({ remainSec: 60 }); so.duelVote({ user: U('x'), text: '2' }); adv(15000); so.tick({ remainSec: 40 });
    so.endPlay(); so.beginPlay(so.peekNext().id);
    assert.equal(so.playing.id, b.id);
    so.tick({ remainSec: 60 });
    const d = so.snapshot().duel;
    assert.equal(d.a.id, a.id); assert.equal(d.b.id, c.id);
    so.duelVote({ user: U('y'), text: '2' }); adv(15000); so.tick({ remainSec: 40 });
    assert.equal(so.snapshot().lastDuel.sunk, true);
    assert.equal(so.findRow(a.id).sunk, true);
    const e = callSong(so, 'e', 1, 've');
    assert.deepEqual(so.snapshot().queue.map(r => r.id), [c.id, e.id, a.id], 'bài mới ít xu vẫn đứng trước bài chìm');
});

test('Đấu Bài: thắng thì xoá chuỗi thua', () => {
    const { so, adv, a } = duelSetup();
    so.tick({ remainSec: 60 }); so.duelVote({ user: U('x'), text: '2' }); adv(15000); so.tick({ remainSec: 40 });
    assert.equal(so.findRow(a.id).duelLosses, 1);
    so.endPlay(); so.beginPlay(so.peekNext().id);
    callSong(so, 'c', 1, 'vc');
    so.tick({ remainSec: 60 }); adv(15000); so.tick({ remainSec: 40 });   // a thắng (hoà, a đứng trước)
    assert.equal(so.snapshot().lastDuel.winnerId, a.id);
    assert.equal(so.findRow(a.id).duelLosses, 0);
});

test('Đấu Bài: bài trong trận bị xoá → huỷ trận, không ai thắng', () => {
    const { so, b } = duelSetup();
    so.tick({ remainSec: 60 });
    so.remove(b.id);
    assert.equal(so.snapshot().duel, null);
    assert.equal(so.snapshot().lastDuel, null);
});

test('Đấu Bài: kết quả hiện duelShowSec giây rồi ẩn', () => {
    const { so, adv } = duelSetup();
    so.tick({ remainSec: 60 }); adv(15000); so.tick({ remainSec: 40 });
    assert.ok(so.snapshot().lastDuel);
    adv(5001);
    assert.equal(so.snapshot().lastDuel, null);
});

test('Đấu Bài: phát bài chìm thì hết chìm; serialize giữ chuỗi thua', () => {
    const { so, a } = duelSetup();
    const row = so.findRow(a.id);
    row.sunk = true; row.duelLosses = 2;
    const m2 = make();
    m2.so.restore(JSON.parse(JSON.stringify(so.serialize())));
    assert.equal(m2.so.findRow(a.id).duelLosses, 2);
    so.endPlay();
    assert.equal(so.beginPlay(a.id).sunk, false);
});

test('QA 19/11: bình luận chỉ gồm số / mã tù nhân không thành tên bài, giữ lượt', () => {
    const { so } = make();
    so.addGift({ user: U('a'), giftId: '5655', coins: 1 });
    for (const t of ['#4823', '4823 5120']) assert.equal(so.addComment({ user: U('a'), text: t }), null, t);
    assert.ok(so.addComment({ user: U('a'), text: 'Lạc trôi' }));
});
test('QA 19/11: gọi trùng bài vừa vào phát (đoạn chưa chốt) → góp xu, không trả lượt playing', () => {
    const { so } = make({ clipOn: true });
    const r1 = callSong(so, 'a', 1, 'v1');
    so.beginPlay(r1.id);   // clip chưa chốt (server đang lấy link)
    so.addGift({ user: U('b'), giftId: '5655', coins: 30 });
    const row = so.addComment({ user: U('b'), text: 'bài v1' });
    const r = so.applySearch(row.id, [item('v1')]);
    assert.equal(r.ok, true);
    assert.equal(so.playing.coins, 31);
});
test('QA 19/11: bài vừa vào phát mà không phát được → trả lượt cho người gọi', () => {
    const { so } = make();
    const r1 = callSong(so, 'a', 5, 'v1');
    so.beginPlay(r1.id);
    so.refundPlaying('error');
    assert.equal(so.playing, null);
    const p = so.snapshot().passes.find(g => g.key === 'a');
    assert.ok(p, 'có lượt trả lại');
    assert.equal(p.coins, 5);
});

test('QA 19/11: bài không phát được → mỗi người góp nhận lại xu của mình; tìm lại bỏ qua video hỏng', () => {
    const { so } = make({ clipOn: true });
    const r1 = callSong(so, 'a', 5, 'bad');
    so.beginPlay(r1.id);
    so.addGift({ user: U('b'), giftId: '5655', coins: 30 });
    const rb = so.addComment({ user: U('b'), text: 'bad' });
    so.applySearch(rb.id, [item('bad')]);   // góp vào bài đang phát
    so.refundPlaying('error');
    const pa = so.snapshot().passes.find(g => g.key === 'a'), pb = so.snapshot().passes.find(g => g.key === 'b');
    assert.equal(pa.coins, 5);
    assert.equal(pb.coins, 30);
    const row = so.addComment({ user: U('a'), text: 'bad' });
    const r = so.applySearch(row.id, [item('bad'), item('good')]);
    assert.equal(r.ok, true);
    assert.equal(r.row.videoId, 'good', 'bỏ qua video vừa hỏng');
});
test('QA 19/11: "#1 Lạc trôi" vẫn là tên bài; "#4823" trơn thì không', () => {
    const { so } = make();
    so.addGift({ user: U('a'), giftId: '5655', coins: 1 });
    assert.equal(so.addComment({ user: U('a'), text: '#4823' }), null);
    assert.ok(so.addComment({ user: U('a'), text: '#1 Lạc trôi' }));
});
