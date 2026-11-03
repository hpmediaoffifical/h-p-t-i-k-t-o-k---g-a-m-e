// 🏢 Creator Online — PK giữa các nhóm: điểm, nước rút, lật kèo, hoà, ghép cặp, lịch PK (spec mục 9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PkRound, PkScheduler, pkPoints, pickPkPair, pickOpponent } from '../public/games/creatoronline/js/logic/pk.js';

const S = 1000;
/** Trận club 1 vs club 3, mở lúc 0, 90 giây, nước rút 30 giây cuối (từ 60 giây). */
const round = (o = {}) => new PkRound({ a: 1, b: 3, startAt: 0, ...o });

// ---------- điểm ----------

test('pkPoints = 10 × xu + 10 × √tim', () => {
  assert.equal(pkPoints(0, 0), 0);
  assert.equal(pkPoints(5, 0), 50);
  assert.equal(pkPoints(0, 100), 100);
  assert.equal(pkPoints(3, 16), 70);
});

test('tim lật được trận sát nút nhưng không thắng nổi quà to', () => {
  assert.equal(pkPoints(0, 10000), pkPoints(100, 0), '10.000 tim = 100 xu');
  assert.ok(pkPoints(0, 50000) < pkPoints(299, 0), '50.000 tim vẫn thua 1 quà 299 xu');
  assert.ok(Math.abs(pkPoints(0, 50000) - 2236.07) < 0.01);
});

test('pkPoints chịu giá trị hỏng', () => {
  assert.equal(pkPoints(undefined, -5), 0);
  assert.equal(pkPoints('x', NaN), 0);
});

// ---------- PkRound: dựng trận ----------

test('PkRound: hai club phải khác nhau', () => {
  assert.throws(() => new PkRound({ a: 2, b: 2, startAt: 0 }), RangeError);
});

test('PkRound: nước rút bị kẹp ≤ nửa thời lượng', () => {
  assert.equal(new PkRound({ a: 1, b: 2, startAt: 0, durMs: 60 * S, finalMs: 40 * S }).finalMs, 30 * S);
  assert.equal(round().finalMs, 30 * S);
  assert.equal(round().durMs, 90 * S);
});

// ---------- quà ----------

test('addGift cộng xu cho bên, theo từng người tặng', () => {
  const pk = round();
  assert.equal(pk.addGift(1, 'u1', 5, 1 * S), true);
  pk.addGift(1, 'u2', 3, 2 * S);
  pk.addGift(1, 'u1', 2, 3 * S);
  pk.addGift(3, 'v1', 1, 3 * S);
  assert.equal(pk.score(1), 100);
  assert.equal(pk.score(3), 10);
  assert.deepEqual(pk.scores(), { 1: 100, 3: 10 });
  assert.deepEqual(pk.topGifters(1), [{ id: 'u1', xu: 7 }, { id: 'u2', xu: 3 }]);
});

test('addGift bỏ qua club không thuộc trận, xu ≤ 0 và quà sau khi hết giờ', () => {
  const pk = round();
  assert.equal(pk.addGift(2, 'x', 100, 1 * S), false);
  assert.equal(pk.addGift(1, 'x', 0, 1 * S), false);
  assert.equal(pk.addGift(1, 'x', 50, 90 * S), false);
  assert.equal(pk.score(1), 0);
  assert.equal(pk.score(2), 0, 'club ngoài trận luôn 0 điểm');
});

// ---------- tim + nước rút ----------

test('tim ngoài nước rút luôn ×1, kể cả bên đang thua', () => {
  const pk = round();
  pk.addGift(3, 'v', 10, 1 * S);
  assert.equal(pk.addLikes(1, 100, 59 * S), 1);
  assert.equal(pk.score(1), 100);
});

test('nước rút: bên đang thua thả tim → ×2', () => {
  const pk = round();
  pk.addGift(3, 'v', 10, 1 * S);
  assert.equal(pk.addLikes(1, 50, 61 * S), 2);
  assert.equal(pk.score(1), 100, '50 tim × 2 = 100 tim có trọng số → 100 điểm');
});

test('nước rút: bên đang dẫn hoặc đang hoà thả tim → ×1', () => {
  const pk = round();
  pk.addGift(1, 'u', 10, 1 * S);
  assert.equal(pk.addLikes(1, 100, 70 * S), 1, 'đang dẫn');
  const tie = round();
  assert.equal(tie.addLikes(1, 100, 70 * S), 1, 'đang hoà 0–0');
});

test('nước rút: "đang thua" xét theo từng đợt tim — đợt vượt lên vẫn ×2 cả đợt, đợt sau ×1', () => {
  const pk = round();
  pk.addGift(3, 'v', 10, 1 * S); // 3 dẫn 100 – 0
  assert.equal(pk.addLikes(1, 200, 80 * S), 2); // L = 400 → 200 điểm, giờ club 1 dẫn
  assert.equal(pk.score(1), 200);
  assert.equal(pk.addLikes(1, 100, 81 * S), 1); // L = 500
  assert.equal(pk.score(1), 10 * Math.sqrt(500));
  assert.equal(pk.addLikes(3, 1, 82 * S), 2, 'bên kia giờ đang thua → ×2');
});

test('nước rút bắt đầu khi còn đúng 30 giây; tim lúc hết giờ bị bỏ', () => {
  const pk = round();
  pk.addGift(3, 'v', 10, 1 * S);
  assert.equal(pk.isFinal(60 * S - 1), false);
  assert.equal(pk.isFinal(60 * S), true);
  assert.equal(pk.isFinal(90 * S - 1), true);
  assert.equal(pk.isFinal(90 * S), false);
  assert.equal(pk.addLikes(1, 10, 90 * S), 0);
  assert.equal(pk.score(1), 0);
});

test('addLikes bỏ qua club không thuộc trận và số tim ≤ 0', () => {
  const pk = round();
  assert.equal(pk.addLikes(5, 10, 1 * S), 0);
  assert.equal(pk.addLikes(1, 0, 1 * S), 0);
  assert.equal(pk.addLikes(1, -3, 1 * S), 0);
  assert.equal(pk.score(1), 0);
});

// ---------- dẫn / thua / cần bao nhiêu xu ----------

test('leader / trailing; hoà → null', () => {
  const pk = round();
  assert.equal(pk.leader(), null);
  assert.equal(pk.trailing(), null);
  pk.addGift(3, 'v', 2, 1 * S);
  assert.equal(pk.leader(), 3);
  assert.equal(pk.trailing(), 1);
  pk.addGift(1, 'u', 2, 2 * S);
  assert.equal(pk.leader(), null);
});

test('needXu = ⌊chênh / 10⌋ + 1 (hoà → 1)', () => {
  const pk = round();
  assert.equal(pk.needXu(), 1);
  pk.addGift(1, 'u', 3, 1 * S); // chênh 30 → 3 xu chỉ hoà, cần 4
  assert.equal(pk.needXu(), 4);
  pk.addLikes(3, 4, 2 * S); // 3 có 20 điểm, chênh 10 → cần 2
  assert.equal(pk.needXu(), 2);
});

test('needXu với điểm lẻ: 2 tim = 14,14 điểm → cần 2 xu (1 xu = 10 điểm chưa đủ)', () => {
  const pk = round();
  pk.addLikes(1, 2, 1 * S);
  assert.equal(pk.score(1), 10 * Math.SQRT2);
  assert.equal(pk.needXu(), 2);
  pk.addGift(3, 'v', 1, 2 * S); // chênh 4,14 → cần 1
  assert.equal(pk.needXu(), 1);
});

// ---------- đồng hồ, tạm dừng ----------

test('remaining / isOver theo startAt + thời lượng', () => {
  const pk = round({ startAt: 1 * S });
  assert.equal(pk.remaining(1 * S), 90 * S);
  assert.equal(pk.remaining(50 * S), 41 * S);
  assert.equal(pk.isOver(91 * S - 1), false);
  assert.equal(pk.isOver(91 * S), true);
  assert.equal(pk.remaining(200 * S), 0);
});

test('tạm dừng (Gala) giữ nguyên giờ còn lại và đẩy lùi giờ kết thúc', () => {
  const pk = round();
  pk.pause(50 * S);
  assert.equal(pk.isPaused(), true);
  assert.equal(pk.remaining(50 * S), 40 * S);
  assert.equal(pk.remaining(100 * S), 40 * S, 'đang dừng thì đồng hồ đứng yên');
  assert.equal(pk.isOver(100 * S), false);
  pk.resume(110 * S);
  assert.equal(pk.isPaused(), false);
  assert.equal(pk.remaining(110 * S), 40 * S);
  assert.equal(pk.isOver(150 * S - 1), false);
  assert.equal(pk.isOver(150 * S), true);
});

test('đang dừng: không tính nước rút (tim ×1) nhưng quà và tim vẫn tính điểm', () => {
  const pk = round();
  pk.addGift(3, 'v', 10, 1 * S);
  pk.pause(70 * S); // trong nước rút
  assert.equal(pk.isFinal(75 * S), false);
  assert.equal(pk.addLikes(1, 100, 75 * S), 1);
  assert.equal(pk.addGift(1, 'u', 5, 76 * S), true);
  assert.equal(pk.score(1), 150);
  pk.resume(80 * S);
  assert.equal(pk.isFinal(80 * S), true);
});

test('pause hai lần chỉ tính một; resume khi không dừng thì bỏ qua; pause khi đã hết giờ bị bỏ', () => {
  const pk = round();
  pk.pause(10 * S);
  pk.pause(20 * S);
  pk.resume(30 * S);
  pk.resume(40 * S);
  assert.equal(pk.remaining(30 * S), 80 * S);
  const over = round();
  over.pause(95 * S);
  assert.equal(over.isPaused(), false);
  assert.equal(over.isOver(95 * S), true);
});

// ---------- kết thúc ----------

test('finish: bên nhiều điểm hơn thắng, MVP là người tặng nhiều nhất bên thắng', () => {
  const pk = round();
  pk.addGift(1, 'u1', 5, 1 * S);
  pk.addGift(1, 'u2', 20, 2 * S);
  pk.addGift(3, 'v1', 30, 3 * S);
  pk.addLikes(1, 100, 4 * S);
  const r = pk.finish();
  assert.deepEqual(r, {
    winner: 1,
    sides: {
      1: { score: 350, xu: 25, gifters: 2 },
      3: { score: 300, xu: 30, gifters: 1 },
    },
    mvp: { id: 'u2', xu: 20 },
  });
});

test('finish: hoà điểm → bên nhiều người tặng khác nhau hơn thắng', () => {
  const pk = round();
  pk.addGift(1, 'u1', 10, 1 * S);
  pk.addGift(3, 'v1', 4, 1 * S);
  pk.addGift(3, 'v2', 6, 1 * S);
  const r = pk.finish();
  assert.equal(r.winner, 3);
  assert.deepEqual(r.mvp, { id: 'v2', xu: 6 });
});

test('finish: hoà điểm và hoà số người tặng → hoà, không MVP', () => {
  const pk = round();
  pk.addGift(1, 'u1', 10, 1 * S);
  pk.addGift(3, 'v1', 10, 1 * S);
  const r = pk.finish();
  assert.equal(r.winner, null);
  assert.equal(r.mvp, null);
  assert.equal(round().finish().winner, null, 'trận trống cũng là hoà');
});

test('finish: thắng chỉ bằng tim → không có MVP', () => {
  const pk = round();
  pk.addLikes(3, 9, 1 * S);
  const r = pk.finish();
  assert.equal(r.winner, 3);
  assert.equal(r.mvp, null);
});

test('sau finish mọi quà / tim bị bỏ qua', () => {
  const pk = round();
  pk.finish();
  assert.equal(pk.isOver(1 * S), true);
  assert.equal(pk.addGift(1, 'u', 99, 1 * S), false);
  assert.equal(pk.addLikes(1, 99, 1 * S), 0);
  assert.equal(pk.score(1), 0);
});

test('topGifters: nhiều xu trước, hoà xu → người tặng trước; mặc định 3 người', () => {
  const pk = round();
  pk.addGift(1, 'a', 5, 1 * S);
  pk.addGift(1, 'b', 9, 2 * S);
  pk.addGift(1, 'c', 5, 3 * S);
  pk.addGift(1, 'd', 1, 4 * S);
  assert.deepEqual(pk.topGifters(1), [{ id: 'b', xu: 9 }, { id: 'a', xu: 5 }, { id: 'c', xu: 5 }]);
  assert.deepEqual(pk.topGifters(1, 1), [{ id: 'b', xu: 9 }]);
  assert.deepEqual(pk.topGifters(4), []);
});

test('PkRound toJSON / fromJSON giữ điểm, người tặng, tạm dừng', () => {
  const pk = round({ startAt: 5 * S, durMs: 120 * S, finalMs: 40 * S });
  pk.addGift(1, 'u1', 5, 6 * S);
  pk.addGift(1, 'u2', 5, 7 * S);
  pk.addGift(3, 'v1', 2, 8 * S);
  pk.addLikes(3, 30, 9 * S);
  pk.pause(20 * S);
  const back = PkRound.fromJSON(JSON.parse(JSON.stringify(pk)), { durMs: 60 * S });
  assert.deepEqual(back.toJSON(), pk.toJSON());
  assert.equal(back.durMs, 120 * S, 'trận đang chạy giữ thời lượng lúc mở');
  assert.deepEqual(back.scores(), pk.scores());
  assert.deepEqual(back.topGifters(1), pk.topGifters(1));
  assert.equal(back.remaining(50 * S), pk.remaining(50 * S));
  back.resume(30 * S);
  pk.resume(30 * S);
  assert.deepEqual(back.finish(), pk.finish());
});

test('PkRound.fromJSON thiếu thời lượng → lấy từ opts', () => {
  const back = PkRound.fromJSON({ a: 2, b: 4, startAt: 0 }, { durMs: 120 * S, finalMs: 20 * S });
  assert.equal(back.durMs, 120 * S);
  assert.equal(back.finalMs, 20 * S);
  assert.equal(back.score(2), 0);
});

// ---------- ghép cặp ----------

test('pickPkPair: 2 club hoạt động nhiều nhất, hoà → club số nhỏ trước', () => {
  assert.deepEqual(pickPkPair({ 1: 2, 2: 9, 3: 5, 4: 0 }, null), [2, 3]);
  assert.deepEqual(pickPkPair({ 5: 4, 2: 4, 3: 4 }, null), [2, 3]);
});

test('pickPkPair: dưới 2 club hoạt động → null', () => {
  assert.equal(pickPkPair({}, null), null);
  assert.equal(pickPkPair({ 3: 7, 1: 0 }, null), null);
  assert.equal(pickPkPair(null, null), null);
});

test('pickPkPair: không ghép lại cặp vừa đấu (không kể thứ tự) → lấy club thứ ba', () => {
  const act = { 1: 10, 2: 8, 3: 1 };
  assert.deepEqual(pickPkPair(act, [1, 2]), [1, 3]);
  assert.deepEqual(pickPkPair(act, [2, 1]), [1, 3]);
  assert.deepEqual(pickPkPair(act, [1, 3]), [1, 2], 'trận trước khác cặp mạnh nhất → giữ cặp mạnh nhất');
});

test('pickPkPair: chỉ 2 club hoạt động thì đành ghép lại cặp cũ', () => {
  assert.deepEqual(pickPkPair({ 1: 10, 2: 8 }, [1, 2]), [1, 2]);
});

test('pickPkPair bỏ qua khoá không phải club 1–5; nhận cả Map', () => {
  assert.deepEqual(pickPkPair({ 0: 99, 7: 99, x: 99, 4: 2, 5: 1 }, null), [4, 5]);
  assert.deepEqual(pickPkPair(new Map([[3, 1], [1, 5]]), null), [1, 3]);
});

test('pickOpponent: club hoạt động nhiều nhất khác club người tặng', () => {
  assert.deepEqual(pickOpponent(2, { 2: 50, 4: 3, 1: 3 }, {}), 1);
  assert.equal(pickOpponent(2, { 2: 50, 5: 9 }, { 1: 100 }), 5);
});

test('pickOpponent: không ai hoạt động → club đông fan nhất; vẫn không có → club kế tiếp', () => {
  assert.equal(pickOpponent(2, { 2: 50 }, { 2: 999, 3: 10, 4: 40 }), 4);
  assert.equal(pickOpponent(2, {}, {}), 3);
  assert.equal(pickOpponent(5, {}, { 5: 3 }), 1);
});

// ---------- lịch PK ----------

test('PkScheduler: chưa begin thì không tự mở; begin đặt PK tự động sau everyMs', () => {
  const sch = new PkScheduler();
  assert.equal(sch.autoDue(10_000 * S), false);
  sch.begin(1000 * S);
  assert.equal(sch.autoDue(1299 * S), false);
  assert.equal(sch.autoDue(1300 * S), true);
});

test('PkScheduler: đang có PK → không tự mở, quà xin PK → "busy"', () => {
  const sch = new PkScheduler();
  sch.begin(0);
  sch.onStart(300 * S);
  assert.equal(sch.autoDue(400 * S), false);
  assert.equal(sch.request({ club: 1 }, 400 * S), 'busy');
  assert.equal(sch.request({ club: 1 }, 400 * S, { force: true }), 'busy');
  assert.equal(sch.pending, null);
});

test('PkScheduler: trận kết thúc đặt lại đồng hồ tự động', () => {
  const sch = new PkScheduler();
  sch.begin(0);
  sch.onStart(100 * S); // mở bằng quà sớm
  sch.onEnd(190 * S);
  assert.equal(sch.autoDue(300 * S), false, 'không chạy theo mốc cũ 300 giây');
  assert.equal(sch.autoDue(490 * S - 1), false);
  assert.equal(sch.autoDue(490 * S), true);
});

test('PkScheduler: trận mới phải cách trận trước ≥ 60 giây kể cả khi everyMs ngắn hơn', () => {
  const sch = new PkScheduler({ everyMs: 30 * S });
  sch.begin(0);
  sch.onStart(30 * S);
  sch.onEnd(120 * S);
  assert.equal(sch.autoDue(150 * S), false);
  assert.equal(sch.autoDue(180 * S), true);
});

test('PkScheduler: everyMs = 0 → tắt PK tự động, quà vẫn mở được', () => {
  const sch = new PkScheduler({ everyMs: 0 });
  sch.begin(0);
  assert.equal(sch.autoDue(0), false);
  assert.equal(sch.autoDue(10_000 * S), false);
  assert.equal(sch.request({ club: 2 }, 5 * S), 'start');
});

test('PkScheduler: dưới 2 club hoạt động → thử lại sau 60 giây', () => {
  const sch = new PkScheduler();
  sch.begin(0);
  assert.equal(sch.autoDue(300 * S), true);
  sch.retryLater(300 * S);
  assert.equal(sch.autoDue(359 * S), false);
  assert.equal(sch.autoDue(360 * S), true);
});

test('PkScheduler: đầu buổi không phải chờ nghỉ → quà xin PK "start"', () => {
  const sch = new PkScheduler();
  sch.begin(0);
  assert.equal(sch.request({ club: 1 }, 1 * S), 'start');
  assert.equal(sch.pendingAt(), null);
});

test('PkScheduler: quà xin PK lúc đang nghỉ → "pending", giữ yêu cầu ĐẦU TIÊN', () => {
  const sch = new PkScheduler();
  sch.begin(0);
  sch.onStart(10 * S);
  sch.onEnd(100 * S);
  assert.equal(sch.request({ club: 1, id: 'first' }, 110 * S), 'pending');
  assert.equal(sch.request({ club: 4, id: 'second' }, 120 * S), 'pending');
  assert.equal(sch.pendingAt(), 160 * S, 'chip "⚔️ PK sau …" đếm tới lúc hết nghỉ');
  assert.equal(sch.takePending(159 * S), null);
  assert.deepEqual(sch.takePending(160 * S), { club: 1, id: 'first' });
  assert.equal(sch.takePending(161 * S), null, 'lấy ra rồi thì hết');
  assert.equal(sch.pendingAt(), null);
});

test('PkScheduler: nút panel / lệnh pk (force) bỏ qua thời gian nghỉ', () => {
  const sch = new PkScheduler();
  sch.begin(0);
  sch.onStart(10 * S);
  sch.onEnd(100 * S);
  assert.equal(sch.request({ a: 1, b: 2 }, 101 * S, { force: true }), 'start');
  assert.equal(sch.pending, null, 'force không xếp chờ');
});

test('PkScheduler: không lấy yêu cầu chờ khi đang có PK', () => {
  const sch = new PkScheduler();
  sch.begin(0);
  sch.onStart(10 * S);
  sch.onEnd(100 * S);
  sch.request({ club: 1 }, 110 * S);
  sch.onStart(120 * S); // mở bằng force trong lúc chờ
  assert.equal(sch.takePending(170 * S), null);
  sch.onEnd(200 * S);
  assert.equal(sch.takePending(259 * S), null);
  assert.deepEqual(sch.takePending(260 * S), { club: 1 });
});

test('PkScheduler: hết nghỉ → quà xin PK "start"', () => {
  const sch = new PkScheduler();
  sch.begin(0);
  sch.onStart(10 * S);
  sch.onEnd(100 * S);
  assert.equal(sch.request({ club: 1 }, 160 * S), 'start');
});

test('PkScheduler toJSON / fromJSON giữ trạng thái, kể cả ±Infinity', () => {
  const fresh = new PkScheduler();
  const back0 = PkScheduler.fromJSON(JSON.parse(JSON.stringify(fresh)));
  assert.equal(back0.nextAutoAt, Infinity);
  assert.equal(back0.lastEndAt, -Infinity);
  assert.equal(back0.autoDue(1e12), false);

  const sch = new PkScheduler();
  sch.begin(0);
  assert.equal(PkScheduler.fromJSON(JSON.parse(JSON.stringify(sch))).request({ club: 1 }, 1), 'start');
  sch.onStart(10 * S);
  sch.onEnd(100 * S);
  sch.request({ club: 3, by: 'u' }, 110 * S);
  const back = PkScheduler.fromJSON(JSON.parse(JSON.stringify(sch)), { everyMs: 600 * S });
  assert.deepEqual(back.toJSON(), sch.toJSON());
  assert.equal(back.everyMs, 600 * S, 'thông số lấy từ opts');
  assert.equal(back.pendingAt(), 160 * S);
  assert.deepEqual(back.takePending(160 * S), { club: 3, by: 'u' });
});

test('PkScheduler.fromJSON với dữ liệu hỏng → như mới tạo', () => {
  for (const bad of [null, undefined, 'x', {}]) {
    const s = PkScheduler.fromJSON(bad);
    assert.equal(s.active, false);
    assert.equal(s.pending, null);
    assert.equal(s.autoDue(1e12), false);
  }
});
