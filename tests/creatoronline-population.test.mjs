import test from 'node:test';
import assert from 'node:assert/strict';
import { pickEvictee, SwapBudget, canOverflow, protectedSet } from '../public/games/creatoronline/js/logic/population.js';

const v = (id, lastActive) => ({ id, lastActive });

test('pickEvictee: chọn người im lặng lâu nhất trong số người không được bảo vệ', () => {
  const list = [v('moi', 30), v('cu', 10), v('vua', 20)];
  assert.equal(pickEvictee(list, new Set()).id, 'cu');
  assert.equal(pickEvictee(list, new Set(['cu'])).id, 'vua');
});

test('pickEvictee: ai cũng được bảo vệ hoặc tòa nhà trống → null (không đẩy ai)', () => {
  assert.equal(pickEvictee([v('a', 1), v('b', 2)], new Set(['a', 'b'])), null);
  assert.equal(pickEvictee([], new Set()), null);
});

test('pickEvictee: nhận cả Map.values() (Iterable), không chỉ mảng', () => {
  const m = new Map([['a', v('a', 5)], ['b', v('b', 3)]]);
  assert.equal(pickEvictee(m.values(), new Set()).id, 'b');
});

test('protectedSet: gộp người trên sân, giữ vai, chủ phòng, đang chờ, có cảnh quay chờ', () => {
  const ids = protectedSet({
    stageIds: ['san'],
    roleIds: new Set(['vai']),
    roomIds: ['chuphong'],
    queuedIds: ['cho'],
    shotGifterIds: ['canh'],
    now: 0,
  });
  assert.deepEqual([...ids].sort(), ['canh', 'cho', 'chuphong', 'san', 'vai']);
});

test('protectedSet: người tặng quà trong 5 phút qua được bảo vệ, quá 5 phút thì không', () => {
  const recentGifters = new Map([['vuatang', 1000], ['tanglau', 0]]);
  const ids = protectedSet({ recentGifters, now: 300000 });
  assert.equal(ids.has('vuatang'), true); // 299 giây trước
  assert.equal(ids.has('tanglau'), false); // đúng 300 giây trước → hết bảo vệ
  assert.equal(protectedSet({ recentGifters, now: 299999 }).has('tanglau'), true);
});

test('protectedSet: gifterProtectMs chỉnh được; thiếu now thì coi mọi người tặng là vừa tặng', () => {
  const recentGifters = new Map([['a', 0]]);
  assert.equal(protectedSet({ recentGifters, now: 10000, gifterProtectMs: 5000 }).has('a'), false);
  assert.equal(protectedSet({ recentGifters }).has('a'), true);
});

test('tòa nhà đầy: người tặng quà và người giữ vai không bị người mới đẩy ra', () => {
  // Arrange — người tặng quà và người giữ vai im lặng lâu nhất: đúng những người bản không bảo vệ sẽ đẩy ra
  const inBuilding = [v('tangqua', 1), v('giuvai', 2), v('thuong', 40)];
  const prot = protectedSet({ roleIds: ['giuvai'], recentGifters: new Map([['tangqua', 0]]), now: 60000 });
  // Act + Assert
  assert.equal(pickEvictee(inBuilding, prot).id, 'thuong');
});

test('canOverflow: người tặng quà vượt trần tạm tới coMaxViewers + 20', () => {
  assert.equal(canOverflow(40, { max: 40 }), true);
  assert.equal(canOverflow(59, { max: 40 }), true);
  assert.equal(canOverflow(60, { max: 40 }), false);
  assert.equal(canOverflow(44, { max: 40, overflow: 5 }), true);
  assert.equal(canOverflow(45, { max: 40, overflow: 5 }), false);
});

test('canOverflow: không vượt trần cứng (160 thường / 100 thấp)', () => {
  // trần cứng thấp hơn max + overflow (90 + 20 = 110 > 100) → trần cứng thắng
  assert.equal(canOverflow(99, { max: 90, overflow: 20, hardCap: 100 }), true);
  assert.equal(canOverflow(100, { max: 90, overflow: 20, hardCap: 100 }), false);
  // trần cứng cao hơn max + overflow → max + overflow thắng
  assert.equal(canOverflow(139, { max: 120, overflow: 20, hardCap: 160 }), true);
  assert.equal(canOverflow(140, { max: 120, overflow: 20, hardCap: 160 }), false);
});

test('SwapBudget: hết lượt thay người thì chờ, hồi lại theo thời gian (giống Nhà Tù)', () => {
  const b = new SwapBudget({ perSec: 2, burst: 3 });
  assert.deepEqual([b.take(0), b.take(0), b.take(0), b.take(0)], [true, true, true, false]);
  assert.equal(b.take(400), false); // 0,8 lượt — chưa đủ 1
  assert.equal(b.take(500), true); // 1 lượt sau 0,5 s
  assert.equal(b.take(500), false);
  assert.deepEqual([b.take(10000), b.take(10000), b.take(10000), b.take(10000)], [true, true, true, false]); // trần = burst
});

test('SwapBudget: mặc định 3 lượt/giây, dồn tối đa 6', () => {
  const b = new SwapBudget();
  const got = [];
  for (let i = 0; i < 7; i++) got.push(b.take(0));
  assert.deepEqual(got, [true, true, true, true, true, true, false]);
  assert.equal(b.take(334), true); // 3/giây → ~0,33 s một lượt
});

test('SwapBudget: toJSON/fromJSON giữ số lượt còn lại và mốc giờ', () => {
  const b = new SwapBudget({ perSec: 2, burst: 3 });
  b.take(0);
  b.take(0);
  b.take(0);
  const copy = SwapBudget.fromJSON(JSON.parse(JSON.stringify(b)), { perSec: 2, burst: 3 });
  assert.equal(copy.take(0), false); // vẫn hết lượt sau khi khôi phục
  assert.equal(copy.take(500), true);
  // bản lưu hỏng → thùng đầy như mới
  assert.equal(SwapBudget.fromJSON(null, { burst: 2 }).tokens, 2);
});
