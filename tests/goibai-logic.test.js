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
    const { so } = make();
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
    const { so } = make();
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
