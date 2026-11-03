// ⛓️ Nhà Tù Online — chế độ Tự chơi: lượt của người tặng quà + đọc mã hành động từ bình luận.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpotlightQueue, parseActionCode, turnSeconds, stripVN, MAX_JUMPS } from '../public/games/nhatu/js/logic/spotlight.js';

const ACTIONS = [
  { id: 'ball', keys: ['1', 'b', 'bong'] },
  { id: 'mop', keys: ['2', 'l', 'lau', 'lau san'] },
  { id: 'eat', keys: ['3', 'a', 'an'] },
];
const OPTS = { base: 20, perCoin: 1, max: 60, queueMax: 3, minTurn: 10, preempt: true };
const user = (id) => ({ id, name: id.toUpperCase(), avatar: '' });

test('stripVN bỏ dấu và chữ hoa', () => {
  assert.equal(stripVN('Lau Sàn Đẹp'), 'lau san dep');
});

test('parseActionCode đọc số, chữ và từ khoá ở đầu bình luận', () => {
  assert.equal(parseActionCode('1', ACTIONS), 'ball');
  assert.equal(parseActionCode('B', ACTIONS), 'ball');
  assert.equal(parseActionCode('#2 nha', ACTIONS), 'mop');
  assert.equal(parseActionCode('Lau sàn!', ACTIONS), 'mop');
  assert.equal(parseActionCode('ăn', ACTIONS), 'eat');
  assert.equal(parseActionCode('bông hoa đẹp quá', ACTIONS), null, 'từ khoá dài phải là cả câu');
});

test('parseActionCode bỏ qua bình luận thường', () => {
  assert.equal(parseActionCode('xin chào cả nhà', ACTIONS), null);
  assert.equal(parseActionCode('', ACTIONS), null);
  assert.equal(parseActionCode('12', ACTIONS), null);
});

test('turnSeconds tăng theo xu và bị kẹp', () => {
  assert.equal(turnSeconds(1, OPTS), 20);
  assert.equal(turnSeconds(11, OPTS), 30);
  assert.equal(turnSeconds(5000, OPTS), 60);
  assert.equal(turnSeconds(0, OPTS), 20);
});

test('quà đầu tiên bắt đầu lượt ngay; cùng người tặng thêm thì cộng giờ', () => {
  const q = new SpotlightQueue(OPTS);
  assert.equal(q.addGift(user('a'), 1, 0), 'start');
  assert.equal(q.current.id, 'a');
  assert.equal(q.remaining(0), 20);
  assert.equal(q.addGift(user('a'), 11, 5000), 'extend');
  assert.equal(q.remaining(5000), 45);
});

test('người khác tặng quà → xếp hàng; người đang chơi giữ tối thiểu minTurn rồi nhường', () => {
  const q = new SpotlightQueue(OPTS);
  q.addGift(user('a'), 1, 0);
  assert.equal(q.addGift(user('b'), 1, 2000), 'queued');
  assert.equal(q.tick(9000).started, null);
  const r = q.tick(10000);
  assert.equal(r.ended.id, 'a');
  assert.equal(r.started.id, 'b');
  assert.equal(q.remaining(10000), 20);
});

test('không nhường lượt khi tắt preempt', () => {
  const q = new SpotlightQueue({ ...OPTS, preempt: false });
  q.addGift(user('a'), 1, 0);
  q.addGift(user('b'), 1, 1000);
  assert.equal(q.tick(15000).ended, null);
  assert.equal(q.tick(20000).started.id, 'b');
});

test('hàng chờ đầy thì từ chối, người đang chờ tặng thêm thì cộng giờ chờ', () => {
  const q = new SpotlightQueue(OPTS);
  q.addGift(user('a'), 1, 0);
  q.addGift(user('b'), 1, 0);
  q.addGift(user('c'), 1, 0);
  q.addGift(user('d'), 1, 0);
  assert.equal(q.addGift(user('e'), 1, 0), 'full');
  assert.equal(q.addGift(user('b'), 30, 0), 'queued-extend');
  assert.equal(q.queue[0].seconds, 60);
});

test('skip chuyển ngay sang người kế; hết hàng thì trống', () => {
  const q = new SpotlightQueue(OPTS);
  q.addGift(user('a'), 1, 0);
  q.addGift(user('b'), 1, 0);
  assert.equal(q.skip(1000).started.id, 'b');
  assert.equal(q.skip(2000).started, null);
  assert.equal(q.current, null);
  assert.equal(q.remaining(2000), 0);
});

test('hàng chờ xếp theo xu: quà lớn chen lên trước quà nhỏ', () => {
  // Arrange
  const q = new SpotlightQueue({ ...OPTS, queueMax: 10 });
  q.addGift(user('a'), 1, 0);
  q.addGift(user('b'), 1, 0);
  q.addGift(user('c'), 5, 0);
  // Act
  q.addGift(user('d'), 299, 0);
  // Assert
  assert.deepEqual(q.queue.map((x) => x.id), ['d', 'c', 'b']);
});

test('quà bằng nhau giữ thứ tự đến; ưu tiên riêng (quà đã gán) thắng số xu', () => {
  const q = new SpotlightQueue({ ...OPTS, queueMax: 10 });
  q.addGift(user('a'), 1, 0);
  q.addGift(user('b'), 10, 0);
  q.addGift(user('c'), 10, 0);
  q.addGift(user('d'), 10, 0, 20);
  assert.deepEqual(q.queue.map((x) => x.id), ['d', 'b', 'c']);
});

test('người chờ bị chen qua tối đa MAX_JUMPS lần rồi giữ chỗ (quà nhỏ không bị đẩy xuống mãi)', () => {
  // Arrange
  const q = new SpotlightQueue({ ...OPTS, queueMax: 20 });
  q.addGift(user('a'), 1, 0);
  q.addGift(user('small'), 1, 0);
  // Act: 5 quà lớn tới sau
  for (let i = 0; i < 5; i++) q.addGift(user(`big${i}`), 100, 0);
  // Assert: 'small' chỉ bị chen 3 lần → đứng thứ 4
  assert.equal(q.queue.findIndex((x) => x.id === 'small'), MAX_JUMPS);
  assert.equal(q.queue.length, 6);
});

test('người đang chờ tặng thêm được chen lên theo tổng xu', () => {
  const q = new SpotlightQueue({ ...OPTS, queueMax: 10 });
  q.addGift(user('a'), 1, 0);
  q.addGift(user('b'), 10, 0);
  q.addGift(user('c'), 1, 0);
  assert.equal(q.addGift(user('c'), 50, 0), 'queued-extend');
  assert.deepEqual(q.queue.map((x) => x.id), ['c', 'b']);
});
