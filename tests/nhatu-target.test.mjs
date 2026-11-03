// ⛓️ Nhà Tù Online — chỉ định người chơi khăm bằng mã số tù nhân + ⚔️ trả thù.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrisonerNumbers, matchTargets, TargetWindows, Grudges, TARGETED, HOSTILE } from '../public/games/nhatu/js/logic/target.js';

test('parsePrisonerNumbers đọc mã 4 chữ số ở bất kỳ đâu trong bình luận', () => {
  assert.deepEqual(parsePrisonerNumbers('4823'), [4823]);
  assert.deepEqual(parsePrisonerNumbers('ném #4823 nha'), [4823]);
  assert.deepEqual(parsePrisonerNumbers('số 4823 với 5120'), [4823, 5120]);
});

test('parsePrisonerNumbers bỏ số không phải 4 chữ số và số lặp', () => {
  assert.deepEqual(parsePrisonerNumbers('0912345678'), [], 'số điện thoại không tính');
  assert.deepEqual(parsePrisonerNumbers('1 2 123 12345'), []);
  assert.deepEqual(parsePrisonerNumbers('4823 4823'), [4823]);
  assert.deepEqual(parsePrisonerNumbers(''), []);
  assert.deepEqual(parsePrisonerNumbers(null), []);
});

test('matchTargets: trúng người có mặt, báo số không có / đang bận, bỏ chính người tặng', () => {
  // Arrange
  const a = { n: 1111 };
  const b = { n: 2222 };
  const me = { n: 3333 };
  const busyOne = { n: 4444 };
  const byNo = new Map([[1111, a], [2222, b], [3333, me], [4444, busyOne]]);
  // Act
  const r = matchTargets([2222, 9999, 3333, 4444, 1111], (n) => byNo.get(n) ?? null, { exclude: me, usable: (x) => x !== busyOne });
  // Assert
  assert.deepEqual(r.hits, [b, a]);
  assert.deepEqual(r.missing, [9999, 3333]);
  assert.deepEqual(r.busy, [4444]);
});

test('matchTargets giới hạn số người trúng theo max (combo)', () => {
  const byNo = new Map([[1111, 'a'], [2222, 'b'], [3333, 'c']]);
  const r = matchTargets([1111, 2222, 3333], (n) => byNo.get(n), { max: 2 });
  assert.deepEqual(r.hits, ['a', 'b']);
});

test('TargetWindows: mở cửa sổ N giây, hết giờ thì trả ra để chạy ngẫu nhiên / trả thù', () => {
  // Arrange
  const w = new TargetWindows({ sec: 10 });
  // Act
  const { entry } = w.open({ gifterId: 'a', action: 'trash' }, 0);
  // Assert
  assert.equal(w.of('a').length, 1);
  assert.equal(w.left(entry, 4000), 6);
  assert.deepEqual(w.expired(9999), []);
  assert.deepEqual(w.expired(10000), [entry]);
  assert.equal(w.of('a').length, 0);
});

test('TargetWindows gộp quà cùng loại của cùng người (combo lớn hơn), quà khác mở cửa sổ riêng', () => {
  const w = new TargetWindows({ sec: 10 });
  const first = w.open({ gifterId: 'a', action: 'trash', power: 1 }, 0);
  const again = w.open({ gifterId: 'a', action: 'trash', power: 3 }, 2000);
  const other = w.open({ gifterId: 'a', action: 'shave' }, 2000);
  assert.equal(again.merged, true);
  assert.equal(again.entry, first.entry);
  assert.equal(first.entry.power, 3);
  assert.equal(other.merged, false);
  assert.equal(w.of('a').length, 2);
  w.close(first.entry);
  assert.deepEqual(w.of('a'), [other.entry]);
});

test('Grudges: người bị chơi khăm được trả thù trong thời hạn, quá hạn thì quên', () => {
  // Arrange
  const g = new Grudges({ sec: 60 });
  // Act
  g.record('victim', 'bully', 1000);
  // Assert
  assert.equal(g.peek('victim', 30000), 'bully');
  assert.equal(g.peek('bully', 30000), null);
  assert.equal(g.peek('victim', 61001), null);
});

test('Grudges chỉ nhớ kẻ gần nhất và không tự thù chính mình', () => {
  const g = new Grudges({ sec: 60 });
  g.record('v', 'x', 0);
  g.record('v', 'y', 5000);
  g.record('z', 'z', 5000);
  assert.equal(g.peek('v', 6000), 'y');
  assert.equal(g.peek('z', 6000), null);
  g.clear('v');
  assert.equal(g.peek('v', 6000), null);
});

test('mọi trò chơi khăm đều nhắm được người; lì xì / bảo lãnh nhắm được nhưng không gây thù', () => {
  for (const id of HOSTILE) assert.ok(TARGETED.has(id), id);
  assert.ok(TARGETED.has('lixi') && !HOSTILE.has('lixi'));
  assert.ok(TARGETED.has('bail') && !HOSTILE.has('bail'));
});
