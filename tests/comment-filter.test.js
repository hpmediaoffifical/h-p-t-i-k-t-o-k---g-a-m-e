// 🚫 Từ cấm chung cho mọi game: so khớp nguyên văn có dấu theo ranh giới từ.
const test = require('node:test');
const assert = require('node:assert');
const { compileForbidden, findForbidden, maskForbidden, isNumberOnly } = require('../lib/comment-filter');

const LIST = ['chim', 'chó', 'con chó', 'mông', 'cac', 'Đít', 'l o n', '18+', 'l*n', 'd!t', 'vl', '1111', 'ăn xin', 'lồn', 'câm', 'ăn', 'sẽ', 'to', 'đĩ'];
const F = compileForbidden(LIST);

test('chặn bình luận có từ cấm, không phân biệt hoa thường', () => {
  assert.equal(findForbidden('con CHIM đẹp', F), 'chim');
  assert.equal(findForbidden('đít bự', F), 'đít');
  assert.equal(findForbidden('Ăn Xin quá', F), 'ăn xin');
  assert.equal(findForbidden('đồ lồn', F), 'lồn');
});

test('cụm nhiều chữ khớp trước từ ngắn và chịu nhiều dấu cách', () => {
  assert.equal(findForbidden('đồ con   chó', F), 'con   chó');
  assert.equal(findForbidden('l  o n', F), 'l  o n');
});

test('so nguyên văn có dấu: chữ thường gặp trùng mặt chữ không dấu không bị chặn nhầm', () => {
  assert.equal(findForbidden('cho tui chơi với', F), '', '"chó" không chặn "cho"');
  assert.equal(findForbidden('cho mình xin link với', F), '');
  assert.equal(findForbidden('lớn quá trời luôn', F), '', '"lồn" không chặn "lớn"');
  assert.equal(findForbidden('cảm ơn anh nhiều', F), '', '"câm" không chặn "cảm"');
  assert.equal(findForbidden('mong được lên sóng', F), '', '"mông" không chặn "mong"');
  assert.equal(findForbidden('chào các bạn', F), '', '"cac" không chặn "các"');
  assert.equal(findForbidden('tàu chìm rồi', F), '', '"chim" không chặn "chìm"');
});

test('từ ≤ 2 ký tự chỉ chặn khi cả bình luận đúng bằng từ đó (từ ngắn thông dụng không làm mất câu thường)', () => {
  assert.equal(findForbidden('vl', F), 'vl');
  assert.equal(findForbidden('  VL  ', F), 'vl');
  assert.equal(findForbidden('Đĩ', F), 'đĩ');
  assert.equal(findForbidden('vl thật', F), '');
  assert.equal(findForbidden('anh ăn cơm chưa', F), '');
  assert.equal(findForbidden('em sẽ tặng quà', F), '');
  assert.equal(findForbidden('to quá', F), '');
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

test('che từ cấm trong tên người xem, giữ nguyên phần còn lại', () => {
  assert.equal(maskForbidden('Nam Chó', F), 'Nam ***');
  assert.equal(maskForbidden('CHIM Xinh 99', F), '*** Xinh 99');
  assert.equal(maskForbidden('Con  Chó Mực', F), '*** Mực');
  assert.equal(maskForbidden('vl', F), '***', 'cả tên là từ cấm ngắn');
  assert.equal(maskForbidden('Thu Hà', F), 'Thu Hà');
  assert.equal(maskForbidden('Cho Mình Ké', F), 'Cho Mình Ké', 'không che nhầm');
  assert.equal(maskForbidden('Ăn Chơi', F), 'Ăn Chơi', 'từ ngắn trong tên không che');
  assert.equal(maskForbidden('', F), '');
  assert.equal(maskForbidden('Chó Chó', F), '*** ***', 'che mọi chỗ, kể cả lần gọi liên tiếp');
  assert.equal(maskForbidden('Chó Chó', F), '*** ***');
});

test('bình luận chỉ gồm chữ số là cú pháp game (111, 222, 1-9, mã tù nhân) — nhận ra để game không lọc', () => {
  assert.equal(isNumberOnly('111'), true);
  assert.equal(isNumberOnly(' 2 2 2 '), true);
  assert.equal(isNumberOnly('5'), true);
  assert.equal(isNumberOnly('1111'), true);
  assert.equal(isNumberOnly('#3333'), true, 'mã tù nhân có # (Nhà Tù)');
  assert.equal(isNumberOnly('4823 #5120'), true, 'nhiều mã trong 1 câu');
  assert.equal(isNumberOnly('#'), false);
  assert.equal(isNumberOnly('#18+'), false);
  assert.equal(isNumberOnly('18+'), false, '"18+" có ký hiệu → vẫn lọc');
  assert.equal(isNumberOnly('111 con chó'), false);
  assert.equal(isNumberOnly(''), false);
  assert.equal(isNumberOnly('   '), false);
});

test('danh sách rỗng / bình luận rỗng thì không chặn gì', () => {
  assert.equal(compileForbidden([]), null);
  assert.equal(compileForbidden(['', '  ']), null);
  assert.equal(findForbidden('chim', null), '');
  assert.equal(maskForbidden('Chim', null), 'Chim');
  assert.equal(findForbidden('', F), '');
  assert.equal(compileForbidden(['a', 'A', ' a ']).size, 1);
  assert.equal(findForbidden('chim', compileForbidden(['vl'])), '', 'chỉ có từ ngắn');
});
