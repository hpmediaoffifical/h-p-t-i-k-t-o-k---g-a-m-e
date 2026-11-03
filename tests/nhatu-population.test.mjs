import test from 'node:test';
import assert from 'node:assert/strict';
import { pickEvictee, SwapBudget, turnHolderIds } from '../public/games/nhatu/js/logic/population.js';
import { SpotlightQueue } from '../public/games/nhatu/js/logic/spotlight.js';

const v = (id, lastActive, extra = {}) => ({ id, lastActive, ...extra });

test('người đang chờ lượt và đang lên sóng không bị đẩy khỏi trại', () => {
  const list = [v('cho', 1), v('song', 2), v('thuong', 50)];
  assert.equal(pickEvictee(list, new Set(['cho', 'song'])).id, 'thuong');
});

test('trại đầy: người đã tặng quà và đang CHỜ LƯỢT không bị người mới đẩy ra (lỗi cũ: chỉ chừa người đang lên sóng)', () => {
  const spot = new SpotlightQueue({ base: 25, perCoin: 1, max: 90, queueMax: 20, minTurn: 15 });
  spot.addGift({ id: 'dangchoi', name: 'A' }, 1, 0);
  spot.addGift({ id: 'dangcho', name: 'B' }, 1, 0);
  // người chờ lượt im lặng lâu nhất trong trại — đúng người mà bản cũ sẽ đẩy ra
  const inCamp = [v('dangcho', 1), v('dangchoi', 2), v('khac', 40)];
  assert.equal(pickEvictee(inCamp, turnHolderIds(spot)).id, 'khac');
});

test('ai cũng đang giữ/chờ lượt → không đẩy ai (null)', () => {
  assert.equal(pickEvictee([v('a', 1), v('b', 2)], new Set(['a', 'b'])), null);
  assert.equal(pickEvictee([], new Set()), null);
});

test('ưu tiên nhường: biệt giam → không chức vụ → im lặng lâu nhất', () => {
  const role = (x) => x.role;
  assert.equal(pickEvictee([v('cu', 1), v('giam', 99, { jailed: true })], new Set(), role).id, 'giam');
  assert.equal(pickEvictee([v('daica', 1, { role: true }), v('thuong', 50)], new Set(), role).id, 'thuong');
  assert.equal(pickEvictee([v('moi', 30), v('cu', 10), v('vua', 20)], new Set(), role).id, 'cu');
  // tất cả đều giữ chức vụ → vẫn chọn người im lặng lâu nhất
  assert.equal(pickEvictee([v('a', 5, { role: true }), v('b', 3, { role: true })], new Set(), role).id, 'b');
});

test('SwapBudget: hết lượt thay người thì chờ, hồi lại theo thời gian', () => {
  const b = new SwapBudget({ perSec: 2, burst: 3 });
  assert.deepEqual([b.take(0), b.take(0), b.take(0), b.take(0)], [true, true, true, false]);
  assert.equal(b.take(400), false); // 0,8 lượt — chưa đủ 1
  assert.equal(b.take(500), true); // 1 lượt sau 0,5 s
  assert.equal(b.take(500), false);
  assert.deepEqual([b.take(10000), b.take(10000), b.take(10000), b.take(10000)], [true, true, true, false]); // trần = burst
});
