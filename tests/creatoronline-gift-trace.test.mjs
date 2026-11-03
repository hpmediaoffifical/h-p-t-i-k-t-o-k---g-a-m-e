import test from 'node:test';
import assert from 'node:assert/strict';
import { GiftTrace, STAND_SLOTS, BALLOON_SLOTS, STAND_MIN_XU, BALLOON_MIN_XU, standTier, pileCount } from '../public/games/creatoronline/js/logic/gift-trace.js';

const gift = (id, xu, name = id) => ({ id, name, xu });

test('kệ hoa: quà dưới ngưỡng không có kệ, đủ ngưỡng thì chiếm ô trống đầu tiên', () => {
  const g = new GiftTrace();
  assert.equal(g.add(1, gift('a', STAND_MIN_XU - 1)).stand, null);
  // cộng dồn trong buổi: lần sau đủ ngưỡng thì mới có kệ
  const r = g.add(1, gift('a', 1));
  assert.equal(r.stand, 0);
  assert.deepEqual(g.club(1).stands[0], { id: 'a', name: 'a', xu: STAND_MIN_XU });
  assert.equal(g.add(1, gift('b', 50)).stand, 1);
});

test('kệ hoa: cùng người tặng tiếp thì nâng cấp kệ cũ, không chiếm thêm ô', () => {
  const g = new GiftTrace();
  g.add(2, gift('a', 20));
  const r = g.add(2, gift('a', 200, 'A mới'));
  assert.equal(r.stand, 0);
  assert.equal(g.club(2).stands.filter(Boolean).length, 1);
  assert.deepEqual(g.club(2).stands[0], { id: 'a', name: 'A mới', xu: 220 });
});

test('kệ hoa: đầy 8 ô thì người mới chỉ thay kệ ít xu nhất khi xu của họ cao hơn', () => {
  const g = new GiftTrace();
  for (let i = 0; i < STAND_SLOTS; i++) g.add(3, gift(`p${i}`, 100 + i * 10));
  assert.equal(g.add(3, gift('nho', 50)).stand, null); // 50 < 100 thấp nhất
  const r = g.add(3, gift('to', 500));
  assert.equal(r.stand, 0); // ô của p0 (100 xu)
  assert.equal(g.club(3).stands[0].id, 'to');
  assert.equal(g.club(3).stands.filter(Boolean).length, STAND_SLOTS);
});

test('bóng bay: chỉ quà lớn; đầy 3 chùm thì thay chùm cũ nhất', () => {
  const g = new GiftTrace();
  assert.equal(g.add(4, gift('a', BALLOON_MIN_XU - 1)).balloon, null);
  assert.equal(g.add(4, gift('a', BALLOON_MIN_XU), 1000).balloon, 0);
  assert.equal(g.add(4, gift('b', BALLOON_MIN_XU), 2000).balloon, 1);
  assert.equal(g.add(4, gift('c', BALLOON_MIN_XU), 3000).balloon, 2);
  assert.equal(g.add(4, gift('d', BALLOON_MIN_XU), 4000).balloon, 0);
  assert.equal(g.club(4).balloons[0].name, 'd');
  assert.equal(g.club(4).balloons.length, BALLOON_SLOTS);
});

test('đống hộp quà lớn dần theo tổng xu của nhóm, tối đa 12 hộp', () => {
  assert.equal(pileCount(0), 0);
  assert.ok(pileCount(30) >= 1);
  assert.ok(pileCount(1000) > pileCount(100));
  assert.equal(pileCount(1e9), 12);
  const g = new GiftTrace();
  g.add(5, gift('a', 300));
  const r = g.add(5, gift('b', 300));
  assert.equal(r.pile, pileCount(600));
  assert.equal(g.club(5).xu, 600);
});

test('bậc kệ hoa theo xu', () => {
  assert.equal(standTier(10), 1);
  assert.equal(standTier(100), 2);
  assert.equal(standTier(1000), 3);
});

test('top fan: 3 người nhiều xu nhất của nhóm, báo đổi khi thứ tự đổi', () => {
  const g = new GiftTrace();
  assert.equal(g.add(1, gift('a', 100)).topChanged, true);
  g.add(1, gift('b', 50));
  g.add(1, gift('c', 20));
  assert.equal(g.add(1, gift('d', 5)).topChanged, false); // d đứng thứ 4
  assert.deepEqual(g.top(1).map((f) => f.id), ['a', 'b', 'c']);
  assert.equal(g.add(1, gift('c', 200)).topChanged, true);
  assert.deepEqual(g.top(1).map((f) => f.id), ['c', 'a', 'b']);
  assert.deepEqual(g.top(2), []);
});

test('club lạ / xu không hợp lệ: bỏ qua', () => {
  const g = new GiftTrace();
  assert.equal(g.add(9, gift('a', 100)), null);
  assert.equal(g.add(1, gift('a', 0)), null);
  assert.equal(g.add(1, gift('a', Number.NaN)), null);
});

test('lưu / khôi phục buổi LIVE giữ kệ hoa, bóng bay, tổng xu và top fan; clear() xoá sạch', () => {
  const g = new GiftTrace();
  g.add(1, gift('a', 600, 'Ánh'), 1000);
  g.add(1, gift('b', 30), 2000);
  g.add(3, gift('c', 12));
  const back = GiftTrace.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
  assert.deepEqual(back.club(1).stands, g.club(1).stands);
  assert.deepEqual(back.club(1).balloons, g.club(1).balloons);
  assert.equal(back.club(1).xu, 630);
  assert.deepEqual(back.top(1), g.top(1));
  assert.deepEqual(back.club(3).stands[0], { id: 'c', name: 'c', xu: 12 });
  // người cũ tặng tiếp sau khi khôi phục vẫn nâng cấp đúng kệ
  assert.equal(back.add(1, gift('b', 70)).stand, 1);
  back.clear();
  assert.equal(back.club(1).stands.filter(Boolean).length, 0);
  assert.equal(back.club(1).xu, 0);
  assert.deepEqual(back.top(1), []);
});

test('fromJSON chịu được dữ liệu hỏng / thiếu', () => {
  const g = GiftTrace.fromJSON({ clubs: { 1: { stands: 'x', balloons: null, xu: 'abc' } } });
  assert.equal(g.club(1).stands.length, STAND_SLOTS);
  assert.equal(g.club(1).xu, 0);
  assert.equal(GiftTrace.fromJSON(null).club(2).stands.length, STAND_SLOTS);
});
