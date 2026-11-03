// 🏢 Creator Online — GĐ2 chơi với nhau: lệnh bình luận, số bảng tên, điểm lên hình, cổ vũ đồng thanh,
// vị trí Center, ghép đôi / bạn thân, thách đấu 1–1, ném đồ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSocialCommand, chorusKey, TagBook, CameraScore, Chorus, CenterBoard, Bonds, Duel, Pranks,
  PRANK_ITEMS, OUTFIT_COUNT, HAIR_COUNT,
} from '../public/games/creatoronline/js/logic/social.js';

const S = 1000;
/** Vòng qua chuỗi JSON như khi lưu localStorage. */
const viaJSON = (x) => JSON.parse(JSON.stringify(x));
/** So số thực (điểm bán rã). */
const near = (actual, expected, msg = '') =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${msg} ${actual} ≈ ${expected}`);
/** Gần như không giảm điểm — để test cộng điểm không dính bán rã. */
const NO_DECAY = { halfLifeMs: 1e15 };

// ======================= parseSocialCommand =======================

test('parseSocialCommand: lệnh nhắm người — không dấu, đúng dấu, viết hoa, có # hoặc dính số', () => {
  for (const [t, kind, target] of [
    ['ném 12', 'throw', 12], ['nem 12', 'throw', 12], ['NÉM 12', 'throw', 12], ['Ném #12', 'throw', 12],
    ['nem#7', 'throw', 7], ['ném12', 'throw', 12], ['ném # 3', 'throw', 3], ['  ném   12  ', 'throw', 12],
    ['ghép 3', 'pair', 3], ['ghep 3', 'pair', 3], ['Ghép #3', 'pair', 3],
    ['ôm 4', 'hug', 4], ['om 4', 'hug', 4], ['Ôm #4', 'hug', 4],
    ['thách 9', 'duel', 9], ['THACH 9', 'duel', 9],
    ['bạn 15', 'friend', 15], ['ban 15', 'friend', 15], ['BẠN #15', 'friend', 15],
  ]) {
    assert.deepEqual(parseSocialCommand(t), { kind, target }, `"${t}" → ${kind} ${target}`);
  }
});

test('parseSocialCommand: số 1 và 99 nhận; 0, 100, số 0 đứng đầu, số âm / lẻ → null', () => {
  assert.deepEqual(parseSocialCommand('ném 1'), { kind: 'throw', target: 1 });
  assert.deepEqual(parseSocialCommand('ném 99'), { kind: 'throw', target: 99 });
  assert.deepEqual(parseSocialCommand('ôm #99'), { kind: 'hug', target: 99 });
  for (const t of ['ném 0', 'ném 100', 'ném #100', 'ném 05', 'ném 012', 'ném -1', 'ném 1.5', 'ném 1,5', 'ném 999']) {
    assert.equal(parseSocialCommand(t), null, `"${t}" không phải lệnh`);
  }
});

test('parseSocialCommand: thiếu số hoặc chỉ có số → null', () => {
  for (const t of ['ném', 'ném #', 'nem ', 'ghép', 'ôm', 'thách', 'bạn', '#12', '12', '# 12']) {
    assert.equal(parseSocialCommand(t), null, `"${t}" không phải lệnh`);
  }
});

test('parseSocialCommand: chữ có dấu khác nghĩa không thành lệnh dù bỏ dấu trùng mã', () => {
  // bán/bàn/bản ≠ bạn · ốm/ổm ≠ ôm · nêm/nệm ≠ ném · thạch ≠ thách · ghẹp ≠ ghép
  for (const t of ['bán 12', 'bàn 12', 'bản 12', 'ốm 12', 'ổm 12', 'ơm 12', 'nêm 12', 'nệm 12', 'nẹm 12', 'thạch 12', 'thảch 12', 'ghẹp 12']) {
    assert.equal(parseSocialCommand(t), null, `"${t}" không phải lệnh`);
  }
});

test('parseSocialCommand: câu thường không bị hiểu là lệnh (cả câu phải đúng lệnh)', () => {
  for (const t of [
    'nem rán', 'ném đá', 'ném 12 nha', 'ném 12!', 'ném bạn 12', 'ném 12 13', 'bạn ơi', 'tim đỏ', 'nhảy đi',
    'nhảy 3', 'ôm ôm 3', 'xin chào', 'ném 12 🎂', 'ném a',
  ]) {
    assert.equal(parseSocialCommand(t), null, `"${t}" không phải lệnh`);
  }
});

test('parseSocialCommand: chữ tổ hợp (NFD) có dấu đúng vẫn nhận', () => {
  assert.deepEqual(parseSocialCommand('ném 12'.normalize('NFD')), { kind: 'throw', target: 12 });
  assert.deepEqual(parseSocialCommand('nhảy'.normalize('NFD')), { kind: 'emote', emote: 'dance' });
  assert.equal(parseSocialCommand('bán 12'.normalize('NFD')), null);
});

test('parseSocialCommand: áo 1–8, tóc 1–6', () => {
  assert.equal(OUTFIT_COUNT, 8);
  assert.equal(HAIR_COUNT, 6);
  for (const [t, kind, value] of [
    ['áo 1', 'outfit', 1], ['ao 8', 'outfit', 8], ['Áo #3', 'outfit', 3], ['ÁO 5', 'outfit', 5], ['ao5', 'outfit', 5],
    ['tóc 6', 'hair', 6], ['toc 1', 'hair', 1], ['tóc#2', 'hair', 2], ['TÓC 4', 'hair', 4],
  ]) {
    assert.deepEqual(parseSocialCommand(t), { kind, value }, `"${t}" → ${kind} ${value}`);
  }
});

test('parseSocialCommand: áo / tóc ngoài phạm vi, thiếu số hoặc sai dấu → null', () => {
  for (const t of ['áo 9', 'áo 0', 'ao 12', 'áo 05', 'tóc 0', 'tóc 7', 'toc 10', 'ào 3', 'ảo 3', 'ạo 3', 'tọc 2', 'tộc 2', 'áo', 'tóc', 'áo đẹp']) {
    assert.equal(parseSocialCommand(t), null, `"${t}" không phải lệnh`);
  }
});

test('parseSocialCommand: biểu cảm nhảy / vẫy / tim / lắc', () => {
  for (const [t, emote] of [
    ['nhảy', 'dance'], ['nhay', 'dance'], ['NHẢY', 'dance'], ['vẫy', 'wave'], ['vay', 'wave'], ['Vẫy', 'wave'],
    ['tim', 'heart'], ['TIM', 'heart'], [' tim ', 'heart'], ['lắc', 'shake'], ['lac', 'shake'],
  ]) {
    assert.deepEqual(parseSocialCommand(t), { kind: 'emote', emote }, `"${t}" → ${emote}`);
  }
});

test('parseSocialCommand: biểu cảm sai dấu → null', () => {
  for (const t of ['nhầy', 'nháy', 'vây', 'vấy', 'váy', 'vậy', 'tím', 'tìm', 'tỉm', 'lạc', 'lác', 'nhảy!', 'tim tim']) {
    assert.equal(parseSocialCommand(t), null, `"${t}" không phải lệnh`);
  }
});

test('parseSocialCommand: a / b cổ vũ bên — chỉ một chữ cái không dấu', () => {
  assert.deepEqual(parseSocialCommand('a'), { kind: 'cheerSide', side: 'a' });
  assert.deepEqual(parseSocialCommand('A'), { kind: 'cheerSide', side: 'a' });
  assert.deepEqual(parseSocialCommand(' b '), { kind: 'cheerSide', side: 'b' });
  assert.deepEqual(parseSocialCommand('B'), { kind: 'cheerSide', side: 'b' });
  for (const t of ['à', 'á', 'ă', 'â', 'ạ', 'c', 'ab', 'a b', 'a 1', 'aa', 'a!']) {
    assert.equal(parseSocialCommand(t), null, `"${t}" không phải lệnh`);
  }
});

test('parseSocialCommand: rỗng hoặc không phải chuỗi → null', () => {
  for (const t of ['', '   ', null, undefined, 12, {}, ['ném 12']]) {
    assert.equal(parseSocialCommand(t), null);
  }
});

// ======================= chorusKey =======================

test('chorusKey chuẩn hoá: bỏ dấu, dấu câu, emoji, gộp khoảng trắng, chữ lặp > 2 lần còn 2', () => {
  for (const [t, key] of [
    ['Cố lên!!!', 'co len'], ['CỐ   LÊN 🔥🔥', 'co len'], ['co len', 'co len'], ['  cố, lên.  ', 'co len'],
    ['GOOOOO', 'goo'], ['gooo', 'goo'], ['goo', 'goo'], ['hay quá 👏👏', 'hay qua'], ['❤️ yêu ❤️', 'yeu'],
    ['go,go,go', 'go go go'], ['Đẹp quá', 'dep qua'], ['dep qua', 'dep qua'], ['Việt Nam vô địch', 'viet nam vo dich'],
  ]) {
    assert.equal(chorusKey(t), key, `"${t}" → "${key}"`);
  }
});

test('chorusKey: dài 1–16 ký tự sau chuẩn hoá', () => {
  assert.equal(chorusKey('abcdefghijklmnop'), 'abcdefghijklmnop', '16 ký tự nhận');
  assert.equal(chorusKey('abcdefghijklmnopq'), null, '17 ký tự bỏ');
  assert.equal(chorusKey('Cố lên Việt Nam ơi!!!'), null, '"co len viet nam oi" 18 ký tự');
  assert.equal(chorusKey('a'.repeat(30) + 'h'), 'aah', 'gộp chữ lặp trước rồi mới đếm độ dài');
  assert.equal(chorusKey('ố'), 'o');
  for (const t of ['', '   ', '!!!', '👏👏👏', '...?']) assert.equal(chorusKey(t), null, `"${t}" rỗng sau chuẩn hoá`);
});

test('chorusKey: số trơn → null (kể cả có khoảng trắng); câu có số lẫn chữ vẫn nhận', () => {
  for (const t of ['12', '1 2 3', '9999', ' 7 ', '100!!!']) assert.equal(chorusKey(t), null, `"${t}" là số`);
  assert.equal(chorusKey('3 sao'), '3 sao');
  assert.equal(chorusKey('10 điểm!'), '10 diem');
});

test('chorusKey: lệnh chơi với nhau và mã club → null', () => {
  for (const t of ['ném 12', 'nem #12', 'nhảy', 'nhảy!!!', 'tim', 'Tím!!!', 'a', 'B', 'áo 3', 'g1', 'G 3', 'g5', '5', '#12']) {
    assert.equal(chorusKey(t), null, `"${t}" là lệnh / mã`);
  }
  assert.equal(chorusKey('g6'), 'g6', 'g6 không phải mã club');
});

test('chorusKey: không phải chuỗi → null', () => {
  for (const t of [null, undefined, 3, {}]) assert.equal(chorusKey(t), null);
});

// ======================= TagBook =======================

test('TagBook: cấp số nhỏ nhất còn trống, người cũ giữ số cũ', () => {
  const tb = new TagBook();

  const got = ['u1', 'u2', 'u3'].map((id) => tb.assign(id));

  assert.deepEqual(got, [1, 2, 3]);
  assert.equal(tb.assign('u2'), 2, 'người đã có số giữ số cũ');
  assert.equal(tb.size, 3);
  assert.equal(tb.numOf('u3'), 3);
  assert.equal(tb.idOf(2), 'u2');
  assert.equal(tb.idOf(4), null);
  assert.equal(tb.numOf('x'), null);
});

test('TagBook: trả số thì số đó được cấp lại (số nhỏ nhất trước)', () => {
  const tb = new TagBook();
  for (const id of ['a', 'b', 'c', 'd']) tb.assign(id);

  tb.release('b');
  tb.release('d');
  tb.release('không-có');

  assert.equal(tb.size, 2);
  assert.equal(tb.numOf('b'), null);
  assert.equal(tb.idOf(2), null);
  assert.equal(tb.assign('e'), 2);
  assert.equal(tb.assign('f'), 4);
  assert.equal(tb.assign('g'), 5);
  assert.equal(tb.idOf(2), 'e');
});

test('TagBook: hết số → null; có người rời thì cấp lại được', () => {
  const small = new TagBook({ max: 3 });
  for (const id of ['a', 'b', 'c']) small.assign(id);
  assert.equal(small.assign('d'), null);
  assert.equal(small.size, 3);
  small.release('a');
  assert.equal(small.assign('d'), 1);

  const tb = new TagBook();
  for (let i = 1; i <= 99; i++) assert.equal(tb.assign(`u${i}`), i);
  assert.equal(tb.assign('u100'), null, 'mặc định tối đa #99');
  assert.equal(tb.idOf(99), 'u99');
});

test('TagBook: id hỏng → null, không chiếm số', () => {
  const tb = new TagBook();
  for (const id of [null, undefined, '', NaN, {}, true]) assert.equal(tb.assign(id), null);
  assert.equal(tb.size, 0);
  assert.equal(tb.assign(0), 1, 'id số 0 vẫn hợp lệ');
});

test('TagBook toJSON / fromJSON giữ số; dòng hỏng, trùng, ngoài phạm vi bị bỏ', () => {
  const tb = new TagBook();
  for (const id of ['a', 'b', 'c']) tb.assign(id);
  tb.release('b');
  const back = TagBook.fromJSON(viaJSON(tb));
  assert.deepEqual(back.toJSON(), tb.toJSON());
  assert.equal(back.assign('z'), 2, 'số trống vẫn được cấp lại sau khi dựng');

  const bad = TagBook.fromJSON(
    { tags: [['a', 1], ['b', 1], ['a', 2], ['c', 0], ['d', 100], ['e', 2.5], [null, 3], 'x', ['f', 3], ['g', 5]] },
    { max: 4 },
  );
  assert.deepEqual(bad.toJSON(), { tags: [['a', 1], ['f', 3]] }, 'số > max của opts cũng bị bỏ');
  assert.equal(bad.assign('h'), 2);
  for (const junk of [null, undefined, 'x', {}, { tags: 'x' }]) assert.equal(TagBook.fromJSON(junk).size, 0);
});

// ======================= CameraScore =======================

test('CameraScore: bình luận +3, tối đa 1 lần mỗi 10 giây tính từ lần được cộng', () => {
  const cs = new CameraScore(NO_DECAY);

  const got = [0, 4 * S, 8 * S, 10 * S - 1, 10 * S].map((t) => cs.comment('u', t));

  assert.deepEqual(got, [3, 0, 0, 0, 3], 'bình luận dồn dập không đẩy lùi mốc 10 giây');
  near(cs.score('u', 10 * S), 6);
});

test('CameraScore: chia sẻ +15, theo dõi +10; người lạ 0 điểm', () => {
  const cs = new CameraScore(NO_DECAY);
  assert.equal(cs.share('u', 0), 15);
  assert.equal(cs.follow('u', 1), 10);
  near(cs.score('u', 2), 25);
  assert.equal(cs.score('lạ', 2), 0);
});

test('CameraScore: điểm giảm một nửa sau mỗi halfLifeMs; điểm mới cộng lên điểm đã giảm', () => {
  const cs = new CameraScore();
  cs.share('u', 0);

  assert.equal(cs.score('u', 60 * S), 7.5);
  assert.equal(cs.score('u', 120 * S), 3.75);
  cs.follow('u', 60 * S);
  assert.equal(cs.score('u', 60 * S), 17.5);
  assert.equal(cs.score('u', 120 * S), 8.75);
});

test('CameraScore: tim +1 mỗi 20 tim, số lẻ giữ lại theo từng người', () => {
  const cs = new CameraScore(NO_DECAY);

  assert.equal(cs.likes('u', 15, 0), 0);
  assert.equal(cs.score('u', 0), 0);
  assert.equal(cs.likes('u', 5, 1), 1, '15 + 5 = 20 tim');
  assert.equal(cs.likes('u', 45, 2), 2, 'dư 5');
  assert.equal(cs.likes('v', 15, 3), 0, 'số lẻ của người khác không cộng chung');
  assert.equal(cs.likes('u', 15, 4), 1, '5 + 15 = 20');
  near(cs.score('u', 5), 4);
  assert.equal(cs.score('v', 5), 0);
});

test('CameraScore: tim ≤ 0 / không phải số và id hỏng bị bỏ', () => {
  const cs = new CameraScore(NO_DECAY);
  for (const n of [0, -20, NaN, 'x', undefined]) assert.equal(cs.likes('u', n, 0), 0);
  assert.equal(cs.likes(null, 100, 0), 0);
  assert.equal(cs.comment(undefined, 0), 0);
  assert.equal(cs.share('', 0), 0);
  assert.equal(cs.follow(null, 0), 0);
  assert.equal(cs.likes('u', 19, 0), 0);
  assert.equal(cs.likes('u', 1, 0), 1, 'lượt hỏng không làm mất số lẻ');
  assert.equal(cs.top(0, { exclude: new Set(['u']) }), null);
});

test('CameraScore.top: điểm cao nhất ≥ minScore; dưới ngưỡng → null', () => {
  const cs = new CameraScore(NO_DECAY);
  cs.comment('a', 0);
  assert.equal(cs.top(0), null, '3 điểm < 5');

  cs.follow('b', 0);
  assert.equal(cs.top(0).id, 'b');
  cs.share('c', 0);
  const best = cs.top(0);

  assert.equal(best.id, 'c');
  near(best.score, 15);
});

test('CameraScore.top: exclude (Set hoặc mảng) bỏ người đang lên hình', () => {
  const cs = new CameraScore(NO_DECAY);
  cs.share('a', 0);
  cs.follow('b', 0);
  cs.comment('c', 0);

  assert.equal(cs.top(0, { exclude: new Set(['a']) }).id, 'b');
  assert.equal(cs.top(0, { exclude: ['a'] }).id, 'b');
  assert.equal(cs.top(0, { exclude: new Set(['a', 'b']) }), null, 'c chỉ 3 điểm');
  assert.equal(cs.top(0, {}).id, 'a');
});

test('CameraScore.top: điểm giảm dưới ngưỡng thì không còn được chọn', () => {
  const cs = new CameraScore();
  cs.follow('a', 0);
  assert.deepEqual(cs.top(60 * S), { id: 'a', score: 5 }, 'đúng bằng minScore vẫn nhận');
  assert.equal(cs.top(60 * S + 1), null);
});

test('CameraScore.top: hoà điểm → người có mặt trong bảng trước', () => {
  const cs = new CameraScore(NO_DECAY);
  cs.follow('a', 0);
  cs.follow('b', 0);
  assert.equal(cs.top(0).id, 'a');
});

test('CameraScore.consume: điểm về 0, giữ nhịp bình luận và tim lẻ; remove quên hẳn', () => {
  const cs = new CameraScore(NO_DECAY);
  cs.comment('u', 0);
  cs.share('u', 0);
  cs.likes('u', 10, 0);

  near(cs.consume('u', 1 * S), 18);

  assert.equal(cs.score('u', 1 * S), 0);
  assert.equal(cs.top(1 * S), null);
  assert.equal(cs.comment('u', 5 * S), 0, 'vẫn chưa đủ 10 giây');
  assert.equal(cs.likes('u', 10, 6 * S), 1, 'giữ 10 tim lẻ');
  assert.equal(cs.consume('lạ', 0), 0);
  cs.remove('u');
  assert.equal(cs.score('u', 7 * S), 0);
  assert.equal(cs.comment('u', 7 * S), 3, 'quên cả nhịp bình luận');
});

test('CameraScore toJSON / fromJSON giữ điểm, nhịp bình luận, tim lẻ; thông số lấy từ opts', () => {
  const cs = new CameraScore();
  cs.share('a', 0);
  cs.comment('a', 1 * S);
  cs.likes('a', 30, 2 * S);
  cs.follow('b', 3 * S);

  const back = CameraScore.fromJSON(viaJSON(cs));

  assert.deepEqual(back.toJSON(), cs.toJSON());
  assert.equal(back.score('a', 30 * S), cs.score('a', 30 * S));
  assert.equal(back.comment('a', 5 * S), 0, 'nhịp bình luận còn giữ');
  assert.equal(back.likes('a', 10, 6 * S), 1, 'giữ 10 tim lẻ');
  assert.equal(CameraScore.fromJSON(viaJSON(cs), { share: 99 }).points.share, 99);
});

test('CameraScore.fromJSON: dòng hỏng bị bỏ, số tim lẻ kẹp theo likePer; dữ liệu hỏng → bảng trống', () => {
  const back = CameraScore.fromJSON({
    rows: [
      ['a', 5, 0, null, 25], ['a', 9, 0, null, 0], ['b', -1, 0, null, 0], ['c', 'x', 0, null, 0],
      [null, 1, 0, null, 0], 'x', ['d', 4, null, null, 0], ['e', 4, 0, 'x', 1.5],
    ],
  });
  assert.deepEqual(back.toJSON(), { rows: [['a', 5, 0, null, 5], ['e', 4, 0, null, 0]] });
  for (const junk of [null, undefined, 'x', {}, { rows: 3 }]) assert.deepEqual(CameraScore.fromJSON(junk).toJSON(), { rows: [] });
});

// ======================= Chorus =======================

test('Chorus: 3 người khác nhau cùng hô một câu trong 10 giây → nổ { key, ids }', () => {
  const ch = new Chorus();

  const r1 = ch.add('u1', 'Cố lên!!', 0);
  const r2 = ch.add('u2', 'co len', 2 * S);
  const r3 = ch.add('u3', 'CỐ LÊN 🔥', 4 * S);

  assert.equal(r1, null);
  assert.equal(r2, null);
  assert.deepEqual(r3, { key: 'co len', ids: ['u1', 'u2', 'u3'] });
});

test('Chorus: một người hô nhiều lần chỉ tính một', () => {
  const ch = new Chorus();
  assert.equal(ch.add('u1', 'go', 0), null);
  assert.equal(ch.add('u1', 'go', 1), null);
  assert.equal(ch.add('u1', 'GOOO', 2), null);
  assert.equal(ch.add('u2', 'go', 3), null);
  assert.deepEqual(ch.add('u3', 'go', 4), { key: 'go', ids: ['u1', 'u2', 'u3'] });
});

test('Chorus: lượt hô quá 10 giây không tính (hết hạn đúng mốc 10 giây)', () => {
  const ch = new Chorus();
  ch.add('u1', 'go', 0);
  ch.add('u2', 'go', 5 * S);
  assert.equal(ch.add('u3', 'go', 10 * S), null, 'u1 vừa hết hạn');
  assert.deepEqual(ch.add('u4', 'go', 11 * S), { key: 'go', ids: ['u2', 'u3', 'u4'] });

  const edge = new Chorus();
  edge.add('u1', 'go', 0);
  edge.add('u2', 'go', 1 * S);
  assert.deepEqual(edge.add('u3', 'go', 10 * S - 1), { key: 'go', ids: ['u1', 'u2', 'u3'] });
});

test('Chorus: hô lại làm mới mốc của người đó', () => {
  const ch = new Chorus();
  ch.add('u1', 'go', 0);
  ch.add('u1', 'go', 8 * S);
  ch.add('u2', 'go', 9 * S);
  assert.deepEqual(ch.add('u3', 'go', 12 * S), { key: 'go', ids: ['u1', 'u2', 'u3'] });
});

test('Chorus: sau khi nổ nghỉ chung 30 giây — câu khác cũng không nổ', () => {
  const ch = new Chorus();
  for (const id of ['u1', 'u2', 'u3']) ch.add(id, 'go', 0);

  const during = ['v1', 'v2', 'v3', 'v4'].map((id, i) => ch.add(id, 'hay qua', (20 + i) * S));

  assert.deepEqual(during, [null, null, null, null]);
  for (const id of ['w1', 'w2']) ch.add(id, 'yeu', 31 * S);
  assert.deepEqual(ch.add('w3', 'yêu', 31 * S), { key: 'yeu', ids: ['w1', 'w2', 'w3'] }, 'hết nghỉ thì nổ được');
});

test('Chorus: lượt hô trong lúc nghỉ vẫn được ghi — hết nghỉ mà còn hô thì nổ ngay', () => {
  const ch = new Chorus();
  for (const id of ['u1', 'u2', 'u3']) ch.add(id, 'go', 0);
  ch.add('v1', 'hay qua', 25 * S);
  ch.add('v2', 'hay qua', 26 * S);
  assert.equal(ch.add('v3', 'hay qua', 30 * S - 1), null, 'còn nghỉ');
  assert.deepEqual(ch.add('v4', 'hay qua', 30 * S), { key: 'hay qua', ids: ['v1', 'v2', 'v3', 'v4'] });
});

test('Chorus: câu vừa nổ bị xoá — phải hô lại đủ người', () => {
  const ch = new Chorus({ cooldownMs: 0 });
  for (const id of ['u1', 'u2', 'u3']) ch.add(id, 'go', 0);
  assert.equal(ch.add('u1', 'go', 1 * S), null);
  assert.equal(ch.add('u2', 'go', 2 * S), null);
  assert.deepEqual(ch.add('u3', 'go', 3 * S), { key: 'go', ids: ['u1', 'u2', 'u3'] });
});

test('Chorus: ngưỡng = max(minPeople, need)', () => {
  const ch = new Chorus();
  for (const id of ['u1', 'u2', 'u3', 'u4']) assert.equal(ch.add(id, 'go', 0, 5), null);
  assert.equal(ch.add('u5', 'go', 0, 5).ids.length, 5);

  for (const need of [1, 0, undefined, 'x', NaN, -4]) {
    const c = new Chorus();
    c.add('u1', 'go', 0, need);
    assert.equal(c.add('u2', 'go', 0, need), null, `need ${need} vẫn cần đủ 3 người`);
    assert.notEqual(c.add('u3', 'go', 0, need), null);
  }
});

test('Chorus: câu không hợp lệ (số, lệnh, rỗng) và id hỏng bị bỏ, không đếm', () => {
  const ch = new Chorus();
  for (const t of ['12', 'ném 3', 'nhảy', 'g2', '!!!']) {
    for (const id of ['u1', 'u2', 'u3']) assert.equal(ch.add(id, t, 0), null, `"${t}"`);
  }
  assert.equal(ch.add(null, 'go', 0), null);
  assert.equal(ch.add('', 'go', 0), null);
  ch.add('u1', 'go', 0);
  assert.equal(ch.add('u2', 'go', 0), null, 'id hỏng ở trên không được tính là một người');
  assert.deepEqual(ch.toJSON().cooldownUntil, null, 'chưa nổ lần nào');
});

test('Chorus toJSON / fromJSON giữ lượt đang hô và thời gian nghỉ', () => {
  const ch = new Chorus();
  ch.add('u1', 'go', 0);
  ch.add('u2', 'go', 1 * S);

  const back = Chorus.fromJSON(viaJSON(ch));
  assert.deepEqual(back.toJSON(), ch.toJSON());
  assert.deepEqual(back.add('u3', 'go', 2 * S), { key: 'go', ids: ['u1', 'u2', 'u3'] });

  const cooling = Chorus.fromJSON(viaJSON(back), { minPeople: 1 });
  assert.equal(cooling.minPeople, 1, 'thông số lấy từ opts');
  assert.equal(cooling.add('v', 'yeu', 31 * S), null, 'vẫn đang nghỉ tới 32 giây');
  assert.deepEqual(cooling.add('v', 'yeu', 32 * S), { key: 'yeu', ids: ['v'] });
});

test('Chorus.fromJSON: câu không chuẩn, lượt hỏng / trùng bị bỏ; dữ liệu hỏng → trống', () => {
  const back = Chorus.fromJSON({
    cooldownUntil: 'x',
    keys: [
      ['ném 3', [['a', 1]]], ['GO', [['a', 1]]], ['go', [['a', 1], ['a', 2], [null, 3], ['b', 'x']]],
      ['go', [['z', 1]]], ['trống', []], 'x', [5, []],
    ],
  });
  assert.deepEqual(back.toJSON(), { cooldownUntil: null, keys: [['go', [['a', 1]]]] });
  for (const junk of [null, undefined, 'x', {}]) assert.deepEqual(Chorus.fromJSON(junk).toJSON(), { cooldownUntil: null, keys: [] });
});

// ======================= CenterBoard =======================

test('CenterBoard: người tặng nhiều xu nhất của club giữ Center; mỗi club riêng', () => {
  const cb = new CenterBoard();

  cb.add(1, 'u1', 5, 0);
  cb.add(1, 'u2', 3, 1 * S);
  cb.add(1, 'u2', 4, 2 * S);
  cb.add(2, 'v', 1, 0);

  assert.deepEqual(cb.holder(1, 3 * S), { id: 'u2', xu: 7 }, 'cộng dồn quà của cùng người');
  assert.deepEqual(cb.holder(2, 3 * S), { id: 'v', xu: 1 });
  assert.equal(cb.holder(3, 3 * S), null);
  assert.equal(cb.holder(0, 3 * S), null);
  assert.equal(cb.holder(6, 3 * S), null);
});

test('CenterBoard: quà quá 5 phút rơi khỏi cửa sổ', () => {
  const cb = new CenterBoard();
  cb.add(1, 'u1', 10, 0);
  cb.add(1, 'u2', 5, 60 * S);

  assert.equal(cb.holder(1, 300 * S - 1).id, 'u1');
  assert.deepEqual(cb.holder(1, 300 * S), { id: 'u2', xu: 5 });
  assert.equal(cb.holder(1, 360 * S), null);
});

test('CenterBoard: chỉ phần quà còn trong cửa sổ được cộng', () => {
  const cb = new CenterBoard();
  cb.add(1, 'u1', 10, 0);
  cb.add(1, 'u1', 2, 200 * S);
  cb.add(1, 'u2', 5, 250 * S);
  assert.deepEqual(cb.holder(1, 299 * S), { id: 'u1', xu: 12 });
  assert.deepEqual(cb.holder(1, 300 * S), { id: 'u2', xu: 5 }, 'u1 chỉ còn 2 xu');
});

test('CenterBoard: hoà xu → người đạt tổng đó trước giữ Center', () => {
  const cb = new CenterBoard();
  cb.add(1, 'u1', 10, 0);
  cb.add(1, 'u2', 10, 1 * S);
  assert.equal(cb.holder(1, 2 * S).id, 'u1');

  const late = new CenterBoard();
  late.add(1, 'u1', 5, 0);
  late.add(1, 'u2', 10, 1 * S);
  late.add(1, 'u1', 5, 2 * S);
  assert.deepEqual(late.holder(1, 3 * S), { id: 'u2', xu: 10 }, 'u1 đạt 10 xu sau u2');
});

test('CenterBoard.needXu: 0 cho người giữ / chưa ai giữ; còn lại chênh + 1', () => {
  const cb = new CenterBoard();
  assert.equal(cb.needXu(1, 'x', 0), 0, 'chưa ai giữ');
  cb.add(1, 'u1', 10, 0);
  cb.add(1, 'u2', 4, 0);

  assert.equal(cb.needXu(1, 'u1', 0), 0);
  assert.equal(cb.needXu(1, 'u2', 0), 7);
  assert.equal(cb.needXu(1, 'mới', 0), 11);
  cb.add(1, 'u2', 7, 1 * S);
  assert.equal(cb.holder(1, 1 * S).id, 'u2', 'tặng đúng số cần → giành Center');
  assert.equal(cb.needXu(1, 'u1', 1 * S), 2);
  assert.equal(cb.needXu(9, 'u1', 1 * S), 0, 'club lạ');
});

test('CenterBoard.add bỏ quà hỏng', () => {
  const cb = new CenterBoard();
  for (const [c, id, xu] of [[0, 'u', 5], [6, 'u', 5], [1.5, 'u', 5], [1, null, 5], [1, 'u', 0], [1, 'u', -3], [1, 'u', 'x'], [1, 'u', Infinity]]) {
    assert.equal(cb.add(c, id, xu, 0), false, `${c}/${id}/${xu}`);
  }
  assert.equal(cb.holder(1, 0), null);
  assert.equal(cb.add('2', 'u', 5, 0), true, 'club dạng chuỗi số vẫn nhận');
  assert.equal(cb.holder(2, 0).id, 'u');
});

test('CenterBoard.remove: người rời tòa nhà mất Center ở mọi club', () => {
  const cb = new CenterBoard();
  cb.add(1, 'u1', 10, 0);
  cb.add(1, 'u2', 5, 0);
  cb.add(3, 'u1', 1, 0);

  cb.remove('u1');

  assert.equal(cb.holder(1, 0).id, 'u2');
  assert.equal(cb.holder(3, 0), null);
});

test('CenterBoard toJSON / fromJSON giữ quà và thứ tự; dòng hỏng bị bỏ', () => {
  const cb = new CenterBoard();
  cb.add(1, 'u1', 5, 0);
  cb.add(1, 'u2', 10, 1 * S);
  cb.add(1, 'u1', 5, 2 * S);
  cb.add(4, 'v', 3, 0);

  const back = CenterBoard.fromJSON(viaJSON(cb), { windowMs: 60 * S });

  assert.deepEqual(back.toJSON(), cb.toJSON());
  assert.deepEqual(back.holder(1, 3 * S), { id: 'u2', xu: 10 }, 'hoà vẫn xét theo thứ tự đã lưu');
  assert.equal(back.holder(4, 60 * S), null, 'cửa sổ lấy từ opts');
  const bad = CenterBoard.fromJSON({ gifts: [[1, 'a', 5, 0], [7, 'a', 5, 0], [1, null, 5, 0], [1, 'b', 0, 0], [1, 'c', 5, 'x'], 'x'] });
  assert.deepEqual(bad.toJSON(), { gifts: [[1, 'a', 5, 0]] });
  for (const junk of [null, undefined, 'x', {}]) assert.deepEqual(CenterBoard.fromJSON(junk).toJSON(), { gifts: [] });
});

// ======================= Bonds =======================

test('Bonds.pair: ghép đôi, pairOf hai chiều, pairs liệt kê cặp còn hạn', () => {
  const bd = new Bonds();

  assert.equal(bd.pair('a', 'b', 0), 'paired');

  assert.equal(bd.pairOf('a', 1 * S), 'b');
  assert.equal(bd.pairOf('b', 1 * S), 'a');
  assert.equal(bd.pairOf('c', 1 * S), null);
  assert.deepEqual(bd.pairs(1 * S), [{ a: 'a', b: 'b', since: 0, until: 60 * S }]);
});

test('Bonds.pair: tự ghép mình → self; id hỏng → null', () => {
  const bd = new Bonds();
  assert.equal(bd.pair('a', 'a', 0), 'self');
  assert.equal(bd.pair('a', null, 0), null);
  assert.equal(bd.pair(undefined, 'b', 0), null);
  assert.deepEqual(bd.pairs(0), []);
});

test('Bonds.pair: a hoặc b đang ở cặp khác → busy', () => {
  const bd = new Bonds();
  bd.pair('a', 'b', 0);

  assert.equal(bd.pair('a', 'c', 1 * S), 'busy');
  assert.equal(bd.pair('c', 'b', 1 * S), 'busy');
  assert.equal(bd.pair('c', 'd', 1 * S), 'paired');
  assert.equal(bd.pair('a', 'd', 2 * S), 'busy');
  assert.equal(bd.pairOf('a', 2 * S), 'b');
});

test('Bonds.pair: ghép lại đúng cặp → thêm pairMs, trần since + pairMaxMs; không kể thứ tự', () => {
  const bd = new Bonds();
  bd.pair('a', 'b', 0);

  assert.equal(bd.pair('b', 'a', 10 * S), 'extended');
  assert.equal(bd.pairs(10 * S)[0].until, 120 * S);
  assert.equal(bd.pair('a', 'b', 20 * S), 'extended');
  assert.equal(bd.pairs(20 * S)[0].until, 180 * S);
  assert.equal(bd.pair('a', 'b', 30 * S), 'extended');
  assert.equal(bd.pairs(30 * S)[0].until, 180 * S, 'chạm trần 3 phút');
  assert.equal(bd.pairs(30 * S)[0].since, 0);
  assert.equal(bd.pairOf('a', 180 * S - 1), 'b');
  assert.equal(bd.pairOf('a', 180 * S), null);
});

test('Bonds.pair: gia hạn từ dưới trần chỉ lên tới trần', () => {
  const bd = new Bonds();
  bd.pair('a', 'b', 0);
  bd.pair('a', 'b', 1 * S);
  bd.pair('a', 'b', 2 * S);
  assert.equal(bd.pairs(2 * S)[0].until, 180 * S);
  const part = new Bonds({ pairMs: 60 * S, pairMaxMs: 150 * S });
  part.pair('a', 'b', 0);
  part.pair('a', 'b', 1 * S);
  part.pair('a', 'b', 2 * S);
  assert.equal(part.pairs(2 * S)[0].until, 150 * S);
});

test('Bonds.tick: trả cặp hết hạn đúng một lần rồi bỏ', () => {
  const bd = new Bonds();
  bd.pair('a', 'b', 0);
  bd.pair('c', 'd', 30 * S);

  assert.deepEqual(bd.tick(60 * S - 1), []);
  assert.deepEqual(bd.tick(60 * S), [{ a: 'a', b: 'b' }]);
  assert.deepEqual(bd.tick(61 * S), []);
  assert.deepEqual(bd.pairs(61 * S), [{ a: 'c', b: 'd', since: 30 * S, until: 90 * S }]);
  assert.deepEqual(bd.tick(90 * S), [{ a: 'c', b: 'd' }]);
});

test('Bonds: cặp hết giờ (chưa tick) không còn bận — ghép người khác được, tick vẫn báo cặp cũ tan', () => {
  const bd = new Bonds();
  bd.pair('a', 'b', 0);
  assert.equal(bd.pairOf('a', 60 * S), null, 'hết hạn ngay cả khi chưa tick');

  assert.equal(bd.pair('a', 'c', 70 * S), 'paired');

  assert.deepEqual(bd.tick(70 * S), [{ a: 'a', b: 'b' }]);
  assert.equal(bd.pairOf('a', 70 * S), 'c');
});

test('Bonds: ghép lại đúng cặp đã hết giờ (chưa tick) → paired như mới, tick không báo tan', () => {
  const bd = new Bonds();
  bd.pair('a', 'b', 0);

  assert.equal(bd.pair('b', 'a', 70 * S), 'paired');

  assert.deepEqual(bd.pairs(70 * S), [{ a: 'b', b: 'a', since: 70 * S, until: 130 * S }]);
  assert.deepEqual(bd.tick(71 * S), []);
});

test('Bonds.befriend: mỗi người một bạn, chọn mới thay cũ, không bắt buộc hai chiều', () => {
  const bd = new Bonds();

  assert.equal(bd.befriend('a', 'b', 0), 'ok');
  assert.equal(bd.friendOf('a', 0), 'b');
  assert.equal(bd.friendOf('b', 0), null, 'không tự thành hai chiều');
  assert.equal(bd.befriend('a', 'c', 1 * S), 'ok');
  assert.equal(bd.friendOf('a', 1 * S), 'c');
  assert.equal(bd.befriend('a', 'a', 2 * S), 'self');
  assert.equal(bd.friendOf('a', 2 * S), 'c', 'tự chọn mình không xoá bạn cũ');
  assert.equal(bd.befriend(null, 'a', 0), null);
  assert.equal(bd.befriend('a', undefined, 0), null);
});

test('Bonds.friendOf: bạn thân hết hạn sau friendMs; chọn lại thì tính lại', () => {
  const bd = new Bonds();
  bd.befriend('a', 'b', 0);

  assert.equal(bd.friendOf('a', 600 * S - 1), 'b');
  assert.equal(bd.friendOf('a', 600 * S), null);
  bd.befriend('a', 'b', 700 * S);
  assert.equal(bd.friendOf('a', 1299 * S), 'b');
  bd.tick(1300 * S);
  assert.deepEqual(bd.toJSON().friends, [], 'tick dọn bạn thân hết hạn');
});

test('Bonds.remove: bỏ cặp của người rời (trả về) và bạn thân cả hai chiều', () => {
  const bd = new Bonds();
  bd.pair('a', 'b', 0);
  bd.pair('c', 'd', 0);
  bd.befriend('a', 'c', 0);
  bd.befriend('c', 'a', 0);
  bd.befriend('d', 'a', 0);
  bd.befriend('b', 'd', 0);

  const ended = bd.remove('a');

  assert.deepEqual(ended, [{ a: 'a', b: 'b' }]);
  assert.equal(bd.pairOf('b', 1), null);
  assert.equal(bd.friendOf('a', 1), null);
  assert.equal(bd.friendOf('c', 1), null);
  assert.equal(bd.friendOf('d', 1), null);
  assert.equal(bd.friendOf('b', 1), 'd');
  assert.deepEqual(bd.pairs(1), [{ a: 'c', b: 'd', since: 0, until: 60 * S }]);
  assert.deepEqual(bd.remove('không-có'), []);
  assert.deepEqual(bd.tick(60 * S), [{ a: 'c', b: 'd' }], 'cặp đã remove không báo tan lần nữa');
});

test('Bonds toJSON / fromJSON giữ cặp và bạn thân', () => {
  const bd = new Bonds();
  bd.pair('a', 'b', 0);
  bd.pair('a', 'b', 10 * S);
  bd.pair('c', 'd', 5 * S);
  bd.befriend('a', 'c', 0);

  const back = Bonds.fromJSON(viaJSON(bd), { pairMs: 30 * S });

  assert.deepEqual(back.toJSON(), bd.toJSON());
  assert.equal(back.pairOf('a', 100 * S), 'b');
  assert.equal(back.friendOf('a', 100 * S), 'c');
  assert.equal(back.pair('c', 'd', 10 * S), 'extended');
  assert.equal(back.pairs(10 * S)[1].until, 95 * S, 'pairMs lấy từ opts');
});

test('Bonds.fromJSON: cặp hỏng, tự ghép, người ở hai cặp bị bỏ (giữ cặp còn hạn lâu hơn)', () => {
  const back = Bonds.fromJSON({
    pairs: [
      { a: 'a', b: 'a', since: 0, until: 1 }, { a: 'a', b: 'b', since: 0, until: 60 }, { a: 'c', b: 'a', since: 0, until: 100 },
      { a: 'x', b: null, since: 0, until: 9 }, { a: 'd', b: 'e', since: 'x', until: 5 }, null, 'q', { a: 'f', b: 'g', since: 0, until: 5 },
    ],
    friends: [['a', 'b', 10], ['a', 'c', 20], ['d', 'd', 5], ['e', null, 5], ['f', 'g', 'x'], 'x'],
  });
  assert.deepEqual(back.toJSON(), {
    pairs: [{ a: 'c', b: 'a', since: 0, until: 100 }, { a: 'f', b: 'g', since: 0, until: 5 }],
    friends: [['a', 'b', 10]],
  });
  for (const junk of [null, undefined, 'x', {}]) assert.deepEqual(Bonds.fromJSON(junk).toJSON(), { pairs: [], friends: [] });
});

// ======================= Duel =======================

/** Thách đấu u1 (a) vs u2 (b) ở club 3, mở lúc 0: 60 giây, nước rút 15 giây cuối, nghỉ 20 giây. */
const duelAt0 = (o = {}) => {
  const d = new Duel(o);
  d.start('u1', 'u2', 3, 0);
  return d;
};

test('Duel: chưa mở trận → không active, điểm 0', () => {
  const d = new Duel();
  assert.equal(d.active(0), false);
  assert.equal(d.isOver(0), true);
  assert.equal(d.isFinal(0), false);
  assert.equal(d.remaining(0), 0);
  assert.deepEqual(d.scores(), { a: 0, b: 0 });
  assert.equal(d.needXu(), 0);
  assert.equal(d.a, null);
  assert.equal(d.finish(0), null);
  assert.equal(d.gift('u1', 5, 0), null);
  assert.equal(d.likes('u1', 5, 0), null);
});

test('Duel.start: mở trận, getter a / b / club, active, đồng hồ 60 giây', () => {
  const d = new Duel();

  assert.equal(d.start('u1', 'u2', 3, 0), 'start');

  assert.equal(d.a, 'u1');
  assert.equal(d.b, 'u2');
  assert.equal(d.club, 3);
  assert.equal(d.active(0), true);
  assert.equal(d.remaining(10 * S), 50 * S);
  assert.equal(d.isOver(60 * S - 1), false);
  assert.equal(d.isOver(60 * S), true);
  assert.equal(d.needXu(), 1, 'hoà → cần 1 xu');
});

test('Duel.start: tự thách mình → self; đang có trận → busy; id hỏng → null', () => {
  const d = new Duel();
  assert.equal(d.start('u1', 'u1', 1, 0), 'self');
  assert.equal(d.start('u1', null, 1, 0), null);
  assert.equal(d.start(undefined, 'u2', 1, 0), null);
  assert.equal(d.active(0), false);
  d.start('u1', 'u2', 1, 0);
  assert.equal(d.start('u3', 'u4', 2, 30 * S), 'busy');
  assert.equal(d.a, 'u1', 'trận đang chạy giữ nguyên');
});

test('Duel: sau khi chốt phải nghỉ 20 giây mới mở trận mới', () => {
  const d = duelAt0();
  d.finish(30 * S);

  assert.equal(d.start('u3', 'u4', 1, 50 * S - 1), 'cooldown');
  assert.equal(d.start('u3', 'u4', 1, 50 * S), 'start');
  assert.equal(d.a, 'u3');
});

test('Duel: trận hết giờ mà chưa chốt → nghỉ tính từ giờ hết', () => {
  const d = duelAt0();
  assert.equal(d.active(60 * S), false);
  assert.equal(d.start('u3', 'u4', 1, 80 * S - 1), 'cooldown');
  assert.equal(d.start('u3', 'u4', 1, 80 * S), 'start');
});

test('Duel: người đấu tặng quà / thả tim tính cho bên mình', () => {
  const d = duelAt0();

  assert.equal(d.gift('u1', 5, 1 * S), 'a');
  assert.equal(d.likes('u2', 100, 2 * S), 'b');

  assert.deepEqual(d.scores(), { a: 50, b: 100 });
  assert.equal(d.needXu(), 6, 'chênh 50 → ⌊50/10⌋ + 1');
  assert.equal(d.gift('u1', 0, 3 * S), null, 'quà 0 xu bỏ qua');
  assert.equal(d.likes('u1', -5, 3 * S), null);
});

test('Duel.cheer: người cổ vũ chọn bên, thêm 5 tim cho bên đó', () => {
  const d = duelAt0();

  assert.equal(d.cheer('f1', 'b', 1 * S), 'b');

  assert.equal(d.sideOf('f1'), 'b');
  assert.deepEqual(d.scores(), { a: 0, b: 10 * Math.sqrt(5) });
});

test('Duel.cheer: mỗi người 5 giây một lần; lần bị chặn không đổi bên', () => {
  const d = duelAt0();
  assert.equal(d.cheer('f1', 'a', 1 * S), 'a');

  assert.equal(d.cheer('f1', 'b', 6 * S - 1), null);
  assert.equal(d.sideOf('f1'), 'a');
  assert.equal(d.cheer('f1', 'b', 6 * S), 'b', 'sau 5 giây được đổi bên');

  assert.equal(d.sideOf('f1'), 'b');
  assert.deepEqual(d.scores(), { a: 10 * Math.sqrt(5), b: 10 * Math.sqrt(5) });
  assert.equal(d.cheer('f2', 'a', 6 * S), 'a', 'nhịp 5 giây tính riêng từng người');
});

test('Duel.cheer: người đấu luôn cổ vũ bên mình', () => {
  const d = duelAt0();
  assert.equal(d.cheer('u1', 'b', 1 * S), 'a');
  assert.equal(d.sideOf('u1'), 'a');
  assert.equal(d.cheer('u2', 'a', 1 * S), 'b');
  assert.deepEqual(d.scores(), { a: 10 * Math.sqrt(5), b: 10 * Math.sqrt(5) });
  assert.equal(d.cheer('u1', 'a', 2 * S), null, 'người đấu cũng 5 giây một lần');
});

test('Duel.cheer: không có trận / bên lạ / id hỏng → null', () => {
  assert.equal(new Duel().cheer('f', 'a', 0), null);
  const d = duelAt0();
  assert.equal(d.cheer('f', 'c', 1 * S), null);
  assert.equal(d.cheer('f', undefined, 1 * S), null);
  assert.equal(d.cheer(null, 'a', 1 * S), null);
  assert.equal(d.sideOf('f'), null);
  assert.equal(d.cheer('f', 'a', 1 * S), 'a', 'lần bên lạ không tính vào nhịp 5 giây');
});

test('Duel.gift / likes: người cổ vũ tính cho bên đã chọn; người lạ → null', () => {
  const d = duelAt0();
  d.cheer('f1', 'b', 1 * S);

  assert.equal(d.gift('f1', 10, 2 * S), 'b');
  assert.equal(d.likes('f1', 20, 3 * S), 'b');
  assert.equal(d.gift('lạ', 10, 4 * S), null);
  assert.equal(d.likes('lạ', 20, 4 * S), null);

  assert.deepEqual(d.scores(), { a: 0, b: 150 }, '10 xu + √(5 + 20) tim');
});

test('Duel: nước rút 15 giây cuối — bên đang thua thả tim ×2', () => {
  const d = duelAt0();
  d.gift('u2', 1, 1 * S);

  assert.equal(d.isFinal(45 * S - 1), false);
  assert.equal(d.isFinal(45 * S), true);
  d.likes('u1', 1, 50 * S);

  assert.equal(d.scores().a, 10 * Math.SQRT2);
});

test('Duel: hết giờ → quà / tim / cổ vũ bị bỏ, remaining 0', () => {
  const d = duelAt0();
  d.cheer('f1', 'a', 1 * S);

  assert.equal(d.gift('u1', 5, 60 * S), null);
  assert.equal(d.likes('u1', 5, 60 * S), null);
  assert.equal(d.gift('f1', 5, 60 * S), null);
  assert.equal(d.cheer('f2', 'a', 60 * S), null);
  assert.equal(d.remaining(60 * S), 0);
  assert.equal(d.isFinal(60 * S), false);
  assert.equal(d.isOver(60 * S), true);
});

test('Duel.finish: nhiều điểm hơn thắng; chốt rồi thì hết trận', () => {
  const d = duelAt0();
  d.gift('u1', 5, 1 * S);
  d.gift('u2', 3, 2 * S);

  const r = d.finish(30 * S);

  assert.deepEqual(r, { winner: 'u1', loser: 'u2', scores: { a: 50, b: 30 }, forfeit: false });
  assert.equal(d.active(30 * S), false);
  assert.equal(d.remaining(30 * S), 0, 'chốt sớm → không còn giờ');
  assert.equal(d.isFinal(50 * S), false);
  assert.equal(d.finish(31 * S), null, 'chốt hai lần → null');
  assert.equal(d.gift('u1', 99, 31 * S), null);
  assert.equal(d.a, 'u1', 'giữ người đấu để hiện kết quả');
});

test('Duel.finish: hoà điểm → bên nhiều người tặng khác nhau hơn thắng (luật PK); vẫn hoà → null', () => {
  const d = duelAt0();
  d.cheer('f1', 'b', 1 * S);
  d.gift('u1', 10, 2 * S);
  d.gift('u2', 5, 2 * S);
  d.gift('f1', 5, 2 * S);
  d.likes('u1', 5, 3 * S); // bù 5 tim cổ vũ của b → 2 bên cùng 10 xu + 5 tim

  const r = d.finish(10 * S);

  assert.equal(r.scores.a, r.scores.b);
  assert.equal(r.winner, 'u2');
  assert.equal(r.loser, 'u1');

  const tie = duelAt0().finish(10 * S);
  assert.deepEqual(tie, { winner: null, loser: null, scores: { a: 0, b: 0 }, forfeit: false });
});

test('Duel.remove: người đấu rời giữa trận → người còn lại thắng, nghỉ tính từ lúc đó', () => {
  const d = duelAt0();
  d.gift('u2', 50, 1 * S);

  const r = d.remove('u2', 10 * S);

  assert.deepEqual(r, { winner: 'u1', loser: 'u2', scores: { a: 0, b: 500 }, forfeit: true });
  assert.equal(d.active(10 * S), false);
  assert.equal(d.remove('u1', 11 * S), null, 'trận đã chốt');
  assert.equal(d.start('u3', 'u4', 1, 30 * S - 1), 'cooldown');
  assert.equal(d.start('u3', 'u4', 1, 30 * S), 'start');
});

test('Duel.remove không có now → dùng mốc now gần nhất đã thấy', () => {
  const d = duelAt0();
  d.gift('u2', 1, 10 * S);

  const r = d.remove('u1');

  assert.equal(r.winner, 'u2');
  assert.equal(r.forfeit, true);
  assert.equal(d.start('u3', 'u4', 1, 30 * S - 1), 'cooldown');
  assert.equal(d.start('u3', 'u4', 1, 30 * S), 'start');
});

test('Duel.remove: trận đã hết giờ mà chưa chốt → chốt theo điểm, không tính bỏ cuộc', () => {
  const d = duelAt0();
  d.gift('u1', 5, 1 * S);

  const r = d.remove('u1', 61 * S);

  assert.deepEqual(r, { winner: 'u1', loser: 'u2', scores: { a: 50, b: 0 }, forfeit: false });
});

test('Duel.remove: người cổ vũ rời → quên bên đã chọn, trận vẫn chạy', () => {
  const d = duelAt0();
  d.cheer('f1', 'a', 1 * S);

  assert.equal(d.remove('f1', 2 * S), null);

  assert.equal(d.sideOf('f1'), null);
  assert.equal(d.gift('f1', 5, 3 * S), null);
  assert.equal(d.active(3 * S), true);
  assert.equal(d.cheer('f1', 'b', 3 * S), 'b', 'quên cả nhịp cổ vũ');
});

test('Duel toJSON / fromJSON giữa trận giữ điểm, bên cổ vũ, nhịp cổ vũ, thời lượng lúc mở', () => {
  const play = (d) => {
    d.start('u1', 'u2', 4, 0);
    d.gift('u1', 3, 1 * S);
    d.cheer('f1', 'b', 2 * S);
    d.likes('u2', 40, 3 * S);
  };
  const d = new Duel();
  play(d);

  const back = Duel.fromJSON(viaJSON(d), { durMs: 999 * S });

  assert.deepEqual(back.toJSON(), d.toJSON());
  assert.equal(back.club, 4);
  assert.equal(back.remaining(10 * S), 50 * S, 'trận đang chạy giữ thời lượng lúc mở');
  assert.equal(back.cheer('f1', 'a', 4 * S), null, 'nhịp 5 giây còn giữ');
  assert.equal(back.gift('f1', 1, 5 * S), 'b');
  d.gift('f1', 1, 5 * S);
  assert.deepEqual(back.finish(20 * S), d.finish(20 * S));

  const cooled = Duel.fromJSON(viaJSON(d));
  assert.equal(cooled.start('x', 'y', 1, 40 * S - 1), 'cooldown', 'mốc nghỉ còn giữ');
  assert.equal(cooled.start('x', 'y', 1, 40 * S), 'start');
});

test('Duel.fromJSON: remove không có now sau khi dựng → mốc lấy từ lúc mở trận', () => {
  const d = duelAt0();
  const back = Duel.fromJSON(viaJSON(d));
  assert.equal(back.remove('u1').winner, 'u2');
  assert.equal(back.start('x', 'y', 1, 20 * S - 1), 'cooldown');
});

test('Duel.fromJSON: dữ liệu hỏng → như chưa có trận; bên cổ vũ hỏng bị bỏ', () => {
  const okRound = viaJSON(duelAt0()).round; // ảnh chụp PkRound hợp lệ: bên 1–2, mở lúc 0, 60 giây
  for (const junk of [
    null, undefined, 'x', {}, { round: { a: 1, b: 1, startAt: 0 }, a: 'u', b: 'v' },
    { round: okRound, a: 'u', b: 'u' }, { round: { a: 3, b: 4, startAt: 0 }, a: 'u', b: 'v' },
    { round: 'x', a: 'u', b: 'v' }, { round: okRound, a: null, b: 'v' },
  ]) {
    const d = Duel.fromJSON(junk);
    assert.equal(d.round, null);
    assert.equal(d.active(0), false);
    assert.equal(d.start('p', 'q', 1, 0), 'start');
  }

  const d = Duel.fromJSON({ round: okRound, a: 'u1', b: 'u2', club: { x: 1 }, fans: [['f', 'c'], ['u1', 'b'], ['g', 'a'], 'x'] });
  assert.equal(d.active(1 * S), true);
  assert.equal(d.club, null);
  assert.equal(d.sideOf('g'), 'a');
  assert.equal(d.sideOf('f'), null);
  assert.equal(d.sideOf('u1'), 'a', 'người đấu luôn ở bên mình');
});

// ======================= Pranks =======================

test('Pranks.hit: vết bẩn bám 20 giây; trúng món mới thì thay món và tính lại hạn', () => {
  const pr = new Pranks();

  assert.deepEqual(pr.hit('b', 'egg', 'a', 0), { revenge: false });

  assert.equal(pr.splatOf('b', 20 * S - 1), 'egg');
  assert.equal(pr.splatOf('b', 20 * S), null);
  assert.equal(pr.splatOf('a', 0), null, 'người ném không dính');
  pr.hit('b', 'cake', 'c', 10 * S);
  assert.equal(pr.splatOf('b', 25 * S), 'cake');
  assert.equal(pr.splatOf('b', 30 * S - 1), 'cake');
  assert.equal(pr.splatOf('b', 30 * S), null);
});

test('Pranks.hit: trả đũa khi người bị ném đã ném mình trong 60 giây trước', () => {
  const pr = new Pranks();
  pr.hit('b', 'egg', 'a', 0);

  assert.deepEqual(pr.hit('a', 'cake', 'b', 30 * S), { revenge: true });
});

test('Pranks.hit: quá 60 giây thì không còn là trả đũa (hết hạn đúng mốc 60 giây)', () => {
  const late = new Pranks();
  late.hit('b', 'egg', 'a', 0);
  assert.deepEqual(late.hit('a', 'cake', 'b', 60 * S), { revenge: false });

  const edge = new Pranks();
  edge.hit('b', 'egg', 'a', 0);
  assert.deepEqual(edge.hit('a', 'cake', 'b', 60 * S - 1), { revenge: true });
});

test('Pranks.hit: người thứ ba không phải trả đũa; mỗi lần bị ném chỉ trả đũa một lần; ném qua lại thì lần nào cũng là trả đũa', () => {
  const pr = new Pranks();
  pr.hit('b', 'egg', 'a', 0);

  assert.equal(pr.hit('a', 'cake', 'c', 1 * S).revenge, false, 'c chưa bị a ném');
  assert.equal(pr.hit('a', 'cake', 'b', 2 * S).revenge, true);
  assert.equal(pr.hit('a', 'heart', 'b', 3 * S).revenge, false, 'món nợ đã trả');
  assert.equal(pr.hit('b', 'egg', 'a', 4 * S).revenge, true, 'b vừa ném a → a ném lại là trả đũa');
  assert.equal(pr.hit('c', 'egg', 'a', 5 * S).revenge, true, 'a ném lại c');
});

test('Pranks.hit: tự ném mình → dính bẩn, không bao giờ là trả đũa', () => {
  const pr = new Pranks();
  assert.deepEqual(pr.hit('a', 'egg', 'a', 0), { revenge: false });
  assert.equal(pr.splatOf('a', 0), 'egg');
  assert.deepEqual(pr.hit('a', 'egg', 'a', 1 * S), { revenge: false });
  assert.deepEqual(pr.toJSON().thrown, [], 'không ghi lượt tự ném');
});

test('Pranks.hit: món đồ lạ hoặc id hỏng → null, không dính bẩn', () => {
  const pr = new Pranks();
  assert.deepEqual([...PRANK_ITEMS], ['cake', 'heart', 'egg']);
  assert.equal(pr.hit('b', 'rock', 'a', 0), null);
  assert.equal(pr.hit('b', undefined, 'a', 0), null);
  assert.equal(pr.splatOf('b', 0), null);
  assert.equal(pr.hit(null, 'egg', 'a', 0), null);
  assert.equal(pr.hit('b', 'egg', undefined, 0), null);
  assert.equal(pr.splatOf('b', 0), null);
  assert.deepEqual(pr.toJSON(), { splats: [], thrown: [] });
});

test('Pranks.tick: báo người hết vết bẩn đúng một lần', () => {
  const pr = new Pranks();
  pr.hit('b', 'egg', 'a', 0);
  pr.hit('c', 'heart', 'a', 5 * S);

  assert.deepEqual(pr.tick(20 * S - 1), []);
  assert.deepEqual(pr.tick(20 * S), ['b']);
  assert.deepEqual(pr.tick(21 * S), []);
  assert.deepEqual(pr.tick(25 * S), ['c']);
});

test('Pranks.tick: vết bẩn bị ném chồng thì chỉ báo khi hết hạn cuối', () => {
  const pr = new Pranks();
  pr.hit('b', 'egg', 'a', 0);
  pr.hit('b', 'cake', 'a', 15 * S);
  assert.deepEqual(pr.tick(20 * S), []);
  assert.deepEqual(pr.tick(35 * S), ['b']);
});

test('Pranks.tick dọn lượt ném quá hạn trả đũa', () => {
  const pr = new Pranks();
  pr.hit('b', 'egg', 'a', 0);
  pr.hit('c', 'egg', 'a', 30 * S);

  pr.tick(60 * S);

  assert.deepEqual(pr.toJSON().thrown, [['a', 'c', 30 * S]]);
  pr.tick(90 * S);
  assert.deepEqual(pr.toJSON().thrown, []);
});

test('Pranks.remove: bỏ vết bẩn và lượt ném của / vào người rời', () => {
  const pr = new Pranks();
  pr.hit('b', 'egg', 'a', 0);
  pr.hit('c', 'egg', 'b', 1 * S);

  pr.remove('b');

  assert.equal(pr.splatOf('b', 2 * S), null);
  assert.deepEqual(pr.tick(30 * S), ['c'], 'b không còn trong danh sách vết bẩn');
  assert.equal(pr.hit('a', 'cake', 'b', 2 * S).revenge, false, 'lượt a ném b đã bỏ');
  assert.equal(pr.hit('b', 'cake', 'c', 3 * S).revenge, false, 'lượt b ném c đã bỏ');
});

test('Pranks toJSON / fromJSON giữ vết bẩn và lượt ném; thông số lấy từ opts', () => {
  const pr = new Pranks();
  pr.hit('b', 'egg', 'a', 0);
  pr.hit('c', 'heart', 'b', 1 * S);

  const back = Pranks.fromJSON(viaJSON(pr), { splatMs: 5 * S });

  assert.deepEqual(back.toJSON(), pr.toJSON());
  assert.equal(back.splatOf('c', 2 * S), 'heart');
  assert.equal(back.hit('a', 'cake', 'b', 2 * S).revenge, true);
  assert.equal(back.splatMs, 5 * S);
  assert.equal(back.splatOf('a', 7 * S - 1), 'cake', 'vết bẩn mới dùng splatMs của opts');
  assert.equal(back.splatOf('a', 7 * S), null);
});

test('Pranks.fromJSON: dòng hỏng, món lạ, tự ném, dòng trùng bị bỏ; dữ liệu hỏng → trống', () => {
  const back = Pranks.fromJSON({
    splats: [['a', 'rock', 5], ['b', 'egg', 'x'], [null, 'egg', 5], ['c', 'cake', 5], ['c', 'egg', 9], 'x'],
    thrown: [['a', 'a', 1], ['a', 'b', 'x'], ['a', 'b', 2], ['a', 'b', 3], [null, 'b', 1], 'x'],
  });
  assert.deepEqual(back.toJSON(), { splats: [['c', 'cake', 5]], thrown: [['a', 'b', 2]] });
  for (const junk of [null, undefined, 'x', {}]) assert.deepEqual(Pranks.fromJSON(junk).toJSON(), { splats: [], thrown: [] });
});
