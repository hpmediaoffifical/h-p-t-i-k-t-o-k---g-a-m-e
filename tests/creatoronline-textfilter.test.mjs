// 🏢 Creator Online — lọc chữ người xem trước khi lên LED / TV phòng / miệng MC (spec mục 10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BAD_WORDS, makeTextFilter } from '../public/games/creatoronline/js/logic/textfilter.js';

const filter = makeTextFilter();

test('danh sách mặc định không chứa dạng không dấu mơ hồ', () => {
  assert.ok(Array.isArray(DEFAULT_BAD_WORDS) && DEFAULT_BAD_WORDS.length > 20);
  for (const w of ['lon', 'cac', 'buoi', 'deo', 'du', 'dit', 'di', 'dai', 'ngu', 'cu', 'lol', 'cc', 'ml', 'du ma', 'vd', 'db']) {
    assert.ok(!DEFAULT_BAD_WORDS.includes(w), `"${w}" gây nhầm, không được nằm trong danh sách mặc định`);
  }
  for (const w of ['lồn', 'cặc', 'buồi', 'đéo', 'đụ', 'địt', 'đĩ', 'dm', 'đm', 'vcl', 'fuck', 'shit', 'bitch']) {
    assert.ok(DEFAULT_BAD_WORDS.includes(w), `thiếu "${w}"`);
  }
});

test('không che nhầm chữ thường của tiếng Việt', () => {
  for (const t of [
    'các bạn ơi', 'lớn quá', 'buổi live vui', 'đeo kính', 'con dâu', 'đi đâu', 'đi dù mà', 'đẹp lộng lẫy',
    'đỉnh của chóp', 'cực đỉnh luôn', 'dụ dỗ', 'cắc cớ', 'lốn nhốn', 'lon bia', 'cac ban oi', 'lon qua', 'buoi live', 'deo kinh',
    'con chó đẹp', 'đúng rồi', 'cứu với',
  ]) {
    assert.equal(filter(t), t, `"${t}" bị che nhầm`);
  }
});

test('chỉ che cả từ: chữ chứa từ cấm bên trong không bị che', () => {
  for (const t of ['admin ơi', 'vlog hay', 'dmx', 'shitake', 'classic', 'scunthorpe', 'pk_dm']) {
    assert.equal(filter(t), t, `"${t}" bị che nhầm`);
  }
});

test('che từ cấm có dấu và teencode, không phân biệt hoa thường', () => {
  assert.equal(filter('dm'), '***');
  assert.equal(filter('Vcl quá'), '*** quá');
  assert.equal(filter('đồ đĩ'), 'đồ ***');
  assert.equal(filter('fuck'), '***');
  assert.equal(filter('FUCK you'), '*** you');
  assert.equal(filter('LỒN'), '***');
  assert.equal(filter('Đéo thích'), '*** thích');
  assert.equal(filter('ĐM, vãi cặc'), '***, vãi ***');
  assert.equal(filter('đẹp vl!'), 'đẹp ***!');
  assert.equal(filter('shit shit shit'), '*** *** ***');
});

test('che trọn cụm nhiều chữ', () => {
  assert.equal(filter('địt mẹ mày'), '*** mày');
  assert.equal(filter('ĐỤ MÁ nó'), '*** nó');
  assert.equal(filter('thằng óc chó'), 'thằng ***');
});

test('chữ tổ hợp (NFD) và ký tự rộng-0 không lách được bộ lọc', () => {
  assert.equal(filter('lồn'.normalize('NFD')), '***');
  assert.equal(filter('l​ồn'), '***');
  assert.equal(filter('fu­ck'), '***');
});

test('chuẩn hoá: bỏ ký tự điều khiển, gộp khoảng trắng, cắt hai đầu', () => {
  assert.equal(filter('  xin\tchào\n\n  bạn\u0000 '), 'xin chào bạn');
  assert.equal(filter('a\u0007b'), 'ab');
  assert.equal(filter('‮abc'), 'abc', 'bỏ ký tự đảo chiều chữ');
  assert.equal(filter('Hoa hồng'.normalize('NFD')), 'Hoa hồng'.normalize('NFC'), 'trả về dạng NFC');
});

test('không phải chuỗi → chuỗi rỗng', () => {
  assert.equal(filter(null), '');
  assert.equal(filter(undefined), '');
  assert.equal(filter(42), '');
});

test('cắt độ dài: mặc định 60 ký tự, kết thúc bằng …', () => {
  const exact = 'a'.repeat(60);
  assert.equal(filter(exact), exact, 'đúng 60 ký tự thì giữ nguyên');
  const cut = filter('a'.repeat(100));
  assert.equal(Array.from(cut).length, 60);
  assert.ok(cut.endsWith('…'));
  assert.equal(filter('xin chào các bạn', 10), 'xin chào…');
  assert.equal(filter('abcdef', 1), '…');
});

test('cắt độ dài không làm đôi emoji', () => {
  const out = filter('😀'.repeat(70));
  const chars = Array.from(out);
  assert.equal(chars.length, 60);
  assert.ok(chars.slice(0, 59).every((c) => c === '😀'));
  assert.equal(chars[59], '…');
});

test('che từ cấm TRƯỚC khi cắt: từ cấm nằm ở chỗ cắt không lộ ra', () => {
  const out = filter(`${'x'.repeat(57)} fuck`);
  assert.equal(Array.from(out).length, 60);
  assert.ok(!out.includes('fu'), out);
});

test('từ streamer thêm không dấu → che không dấu; có dấu → chỉ che đúng chữ đó', () => {
  const f = makeTextFilter('lon, bò');
  assert.equal(f('lớn quá'), '*** quá', 'streamer chọn che "lon" mọi dấu');
  assert.equal(f('LON bia'), '*** bia');
  assert.equal(f('LƠN'), '***');
  assert.equal(f('con bò'), 'con ***');
  assert.equal(f('CON BÒ'), 'CON ***');
  assert.equal(f('con bo'), 'con bo', 'từ có dấu không che dạng không dấu');
  assert.equal(f('bó hoa'), 'bó hoa', 'từ có dấu không che dấu khác');
  assert.equal(f('lonely'), 'lonely', 'chỉ che cả từ');
  assert.equal(f('dm'), '***', 'vẫn giữ danh sách mặc định');
});

test('từ streamer thêm: chữ d không dấu khớp cả đ; cụm nhiều chữ; ký tự đặc biệt', () => {
  const f = makeTextFilter(' , ,  do ngok ,a+b,, ');
  assert.equal(f('đồ ngốk'), '***', 'không dấu → khớp mọi dấu, d khớp cả đ');
  assert.equal(f('Đồ Ngok quá'), '*** quá');
  assert.equal(f('do   ngok'), '***');
  assert.equal(f('đồ đẹp'), 'đồ đẹp', 'chỉ che trọn cụm, không che từng chữ');
  assert.equal(f('x a+b y'), 'x *** y');
  assert.equal(f('aab'), 'aab', 'không hiểu "+" là regex');
});

test('từ streamer thêm nhận cả mảng và xuống dòng', () => {
  assert.equal(makeTextFilter(['spam', 'quảng cáo'])('Spam quảng cáo'), '*** ***');
  assert.equal(makeTextFilter('spam\nrác')('spam rác'), '*** ***');
});

test('mỗi bộ lọc độc lập, gọi nhiều lần cho cùng kết quả (regex toàn cục không giữ vị trí)', () => {
  const a = makeTextFilter('xyz');
  const b = makeTextFilter();
  assert.equal(a('xyz'), '***');
  assert.equal(b('xyz'), 'xyz');
  for (let i = 0; i < 3; i++) assert.equal(a('fuck xyz'), '*** ***');
});
