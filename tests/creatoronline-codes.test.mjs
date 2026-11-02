// 🏢 Creator Online — mã bình luận: chọn club 1–5 và lệnh của người giữ vai (spec mục 3, 7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripVN, parseClubCode, parseRoleCommand, isCommand } from '../public/games/creatoronline/js/logic/codes.js';

test('stripVN bỏ dấu, chữ thường, đ → d, gộp khoảng trắng và cắt hai đầu', () => {
  assert.equal(stripVN('  Đèn   ĐẸP  quá '), 'den dep qua');
  assert.equal(stripVN('Pháo Giấy Tuyệt Đẹp'), 'phao giay tuyet dep');
  assert.equal(stripVN('ỒN ÀO\t\nnhé'), 'on ao nhe');
  assert.equal(stripVN('Hoa hồng'.normalize('NFD')), 'hoa hong', 'chữ tổ hợp (NFD) cũng bỏ dấu');
});

test('stripVN: không phải chuỗi → chuỗi rỗng', () => {
  assert.equal(stripVN(null), '');
  assert.equal(stripVN(undefined), '');
  assert.equal(stripVN(12), '');
  assert.equal(stripVN({}), '');
});

test('parseClubCode nhận cả câu là 1–5 hoặc g1–g5', () => {
  assert.equal(parseClubCode('1'), 1);
  assert.equal(parseClubCode(' 3 '), 3);
  assert.equal(parseClubCode('5'), 5);
  assert.equal(parseClubCode('G2'), 2);
  assert.equal(parseClubCode('g 4'), 4);
  assert.equal(parseClubCode('g5'), 5);
  assert.equal(parseClubCode('g   1'), 1, 'khoảng trắng thừa được gộp');
});

test('parseClubCode bỏ qua câu thường có số và mã ngoài 1–5', () => {
  for (const t of ['5 sao', '1 tim nè', '12', '6', '0', 'g6', 'g0', 'g', 'gg1', '1g', '#1', '1.', '1!', 'nhóm 1', '１', '', '   ']) {
    assert.equal(parseClubCode(t), null, `"${t}" không phải mã club`);
  }
  assert.equal(parseClubCode(null), null);
  assert.equal(parseClubCode(undefined), null);
});

test('parseRoleCommand: lệnh Kỹ thuật, gõ không dấu hoặc đúng dấu', () => {
  for (const [t, cmd] of [
    ['phao', 'phao'], ['Pháo', 'phao'], ['khoi', 'khoi'], ['KHÓI', 'khoi'], ['laser', 'laser'], ['LASER', 'laser'],
    ['den', 'den'], ['đèn', 'den'], ['Đèn', 'den'], ['chop', 'chop'], ['chớp', 'chop'], ['  phao  ', 'phao'],
  ]) {
    assert.deepEqual(parseRoleCommand(t), { role: 'tech', cmd }, `"${t}" → tech/${cmd}`);
  }
});

test('parseRoleCommand: lệnh Quản lý pk N, them, bot, do', () => {
  assert.deepEqual(parseRoleCommand('pk 3'), { role: 'manager', cmd: 'pk', club: 3 });
  assert.deepEqual(parseRoleCommand('PK3'), { role: 'manager', cmd: 'pk', club: 3 });
  assert.deepEqual(parseRoleCommand('pk   5'), { role: 'manager', cmd: 'pk', club: 5 });
  assert.deepEqual(parseRoleCommand('Pk 1'), { role: 'manager', cmd: 'pk', club: 1 });
  for (const [t, cmd] of [['them', 'them'], ['thêm', 'them'], ['bot', 'bot'], ['Bớt', 'bot'], ['do', 'do'], ['đồ', 'do'], ['ĐỒ', 'do']]) {
    assert.deepEqual(parseRoleCommand(t), { role: 'manager', cmd }, `"${t}" → manager/${cmd}`);
  }
});

test('parseRoleCommand: pk ngoài 1–5 hoặc thiếu số không phải lệnh', () => {
  for (const t of ['pk', 'pk 0', 'pk 6', 'pk 12', 'pk 3 nha', 'pk3!', 'gọi pk 3']) {
    assert.equal(parseRoleCommand(t), null, `"${t}" không phải lệnh`);
  }
});

test('parseRoleCommand: câu thường không bị hiểu là lệnh (cả câu phải đúng mã)', () => {
  for (const t of ['đèn đẹp quá', 'đó', 'khỏi nha', 'thèm quá', 'Pháo!', 'phao giay', 'laser đẹp', 'chớp chớp', 'them nua']) {
    assert.equal(parseRoleCommand(t), null, `"${t}" không phải lệnh`);
  }
});

test('parseRoleCommand: chữ có dấu khác nghĩa không thành lệnh dù bỏ dấu trùng mã', () => {
  // đó/đỏ/đổ ≠ đồ · đen ≠ đèn · khỏi ≠ khói · thèm ≠ thêm · bột ≠ bớt · chóp ≠ chớp
  for (const t of ['đó', 'đỏ', 'đổ', 'đô', 'đen', 'khỏi', 'thèm', 'bột', 'chóp', 'phạo']) {
    assert.equal(parseRoleCommand(t), null, `"${t}" không phải lệnh`);
  }
});

test('parseRoleCommand: rỗng hoặc không phải chuỗi → null', () => {
  assert.equal(parseRoleCommand(''), null);
  assert.equal(parseRoleCommand('   '), null);
  assert.equal(parseRoleCommand(null), null);
  assert.equal(parseRoleCommand(undefined), null);
});

test('isCommand gộp mã club và lệnh vai', () => {
  assert.equal(isCommand('3'), true);
  assert.equal(isCommand('g2'), true);
  assert.equal(isCommand('đèn'), true);
  assert.equal(isCommand('pk 4'), true);
  assert.equal(isCommand('đồ'), true);
  assert.equal(isCommand('5 sao'), false);
  assert.equal(isCommand('đèn đẹp quá'), false);
  assert.equal(isCommand('đó'), false);
  assert.equal(isCommand('xin chào cả nhà'), false);
  assert.equal(isCommand(''), false);
});
