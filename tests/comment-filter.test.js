// 🚫 Từ cấm chung cho mọi game: so khớp nguyên văn có dấu theo ranh giới từ.
const test = require('node:test');
const assert = require('node:assert');
const { compileForbidden, findForbidden } = require('../lib/comment-filter');

const LIST = ['chim', 'chó', 'con chó', 'mông', 'cac', 'Đít', 'l o n', '18+', 'l*n', 'd!t', 'vl', '1111', 'ăn xin'];
const F = compileForbidden(LIST);

test('chặn bình luận có từ cấm, không phân biệt hoa thường', () => {
  assert.equal(findForbidden('con CHIM đẹp', F), 'chim');
  assert.equal(findForbidden('đít bự', F), 'đít');
  assert.equal(findForbidden('vl thật', F), 'vl');
  assert.equal(findForbidden('Ăn Xin quá', F), 'ăn xin');
});

test('cụm nhiều chữ khớp trước từ ngắn và chịu nhiều dấu cách', () => {
  assert.equal(findForbidden('đồ con   chó', F), 'con   chó');
  assert.equal(findForbidden('l  o n', F), 'l  o n');
});

test('so nguyên văn có dấu: chữ thường gặp trùng mặt chữ không dấu không bị chặn nhầm', () => {
  assert.equal(findForbidden('cho tui chơi với', F), '', '"chó" không chặn "cho"');
  assert.equal(findForbidden('mong được lên sóng', F), '', '"mông" không chặn "mong"');
  assert.equal(findForbidden('chào các bạn', F), '', '"cac" không chặn "các"');
  assert.equal(findForbidden('tàu chìm rồi', F), '', '"chim" không chặn "chìm"');
});

test('chỉ khớp nguyên từ: không chặn khi từ cấm nằm trong từ khác', () => {
  assert.equal(findForbidden('chimmm', F), '');
  assert.equal(findForbidden('bachim', F), '');
  assert.equal(findForbidden('mã số 11112', F), '');
  assert.equal(findForbidden('#1111', F), '1111');
});

test('từ có ký tự đặc biệt khớp nguyên văn', () => {
  assert.equal(findForbidden('phim 18+ nè', F), '18+');
  assert.equal(findForbidden('l*n', F), 'l*n');
  assert.equal(findForbidden('d!t mẹ', F), 'd!t');
  assert.equal(findForbidden('lon', F), '');
});

test('danh sách rỗng / bình luận rỗng thì không chặn gì', () => {
  assert.equal(compileForbidden([]), null);
  assert.equal(compileForbidden(['', '  ']), null);
  assert.equal(findForbidden('chim', null), '');
  assert.equal(findForbidden('', F), '');
  assert.equal(compileForbidden(['a', 'A', ' a ']).size, 1);
});
