// 🏢 Creator Online — 12 chỗ khách trên sân khấu nhóm (spec mục 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StageSlots, stageSeconds } from '../public/games/creatoronline/js/logic/stage.js';

/** Lấp đủ 12 chỗ lúc `now`; người thứ i tặng xuOf(i) xu. */
function fillStage(stage, now, xuOf = () => 1) {
  for (let i = 0; i < stage.slotCount; i++) stage.add(`p${i}`, xuOf(i), now);
}

test('stageSeconds = 12 + 3 × (xu − 1), kẹp trong [12, 120]', () => {
  assert.equal(stageSeconds(1), 12);
  assert.equal(stageSeconds(5), 24);
  assert.equal(stageSeconds(10), 39);
  assert.equal(stageSeconds(36), 117);
  assert.equal(stageSeconds(37), 120);
  assert.equal(stageSeconds(30000), 120);
});

test('stageSeconds: 0 xu, số âm, giá trị hỏng → giờ cơ bản; nhận thông số riêng', () => {
  assert.equal(stageSeconds(0), 12);
  assert.equal(stageSeconds(-5), 12);
  assert.equal(stageSeconds(undefined), 12);
  assert.equal(stageSeconds('abc'), 12);
  assert.equal(stageSeconds(4, { baseSec: 10, perCoinSec: 5, maxSec: 20 }), 20);
  assert.equal(stageSeconds(2, { baseSec: 10, perCoinSec: 5, maxSec: 20 }), 15);
});

test('chỗ trống lấp theo thứ tự: chỗ idol 0–5 trước, rồi hàng trước 6–11', () => {
  const stage = new StageSlots();
  for (let i = 0; i < 12; i++) {
    assert.deepEqual(stage.add(`p${i}`, 1, 0), { status: 'on', slot: i });
  }
  assert.deepEqual(stage.entries().map((e) => e.slot), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

test('lên sân: since = now, until = now + stageSeconds(xu)', () => {
  const stage = new StageSlots();
  stage.add('a', 5, 1000);
  assert.deepEqual(stage.entries(), [{ id: 'a', slot: 0, since: 1000, until: 25000 }]);
});

test('đang trên sân tặng thêm → cộng giờ, giữ chỗ cũ', () => {
  const stage = new StageSlots();
  stage.add('x', 1, 0);
  stage.add('a', 1, 0); // until 12000
  assert.deepEqual(stage.add('a', 10, 5000), { status: 'extended', slot: 1 });
  assert.equal(stage.entries()[1].until, 12000 + 39000);
  assert.equal(stage.entries()[1].since, 0, 'cộng giờ không đổi lúc lên sân');
});

test('cộng giờ không vượt now + 120 giây', () => {
  const stage = new StageSlots();
  stage.add('a', 10, 0); // 39000
  stage.add('a', 10, 1000); // 78000
  assert.deepEqual(stage.add('a', 37, 6000), { status: 'extended', slot: 0 });
  assert.equal(stage.entries()[0].until, 6000 + 120000);
});

test('sân đầy, chưa ai đứng đủ 8 giây → xếp hàng', () => {
  const stage = new StageSlots();
  fillStage(stage, 0);
  assert.deepEqual(stage.add('new', 1, 7999), { status: 'queued' });
  assert.deepEqual(stage.queueIds(), ['new']);
  assert.equal(stage.isOn('p0'), true);
});

test('sân đầy, đã đứng đủ 8 giây → người mới thay người còn ít giờ nhất', () => {
  const stage = new StageSlots();
  fillStage(stage, 0, (i) => 37 - i); // p0 giữ 120 giây ... p11 giữ 87 giây
  assert.deepEqual(stage.add('new', 1, 8000), { status: 'on', slot: 11, replaced: 'p11' });
  assert.equal(stage.isOn('p11'), false);
  assert.equal(stage.slotOf('new'), 11);
  assert.deepEqual(stage.entries()[11], { id: 'new', slot: 11, since: 8000, until: 20000 });
});

test('người chưa đứng đủ 8 giây không bị thay dù còn ít giờ nhất', () => {
  const stage = new StageSlots();
  for (let i = 0; i < 11; i++) stage.add(`p${i}`, 37 - i, 0); // p10 còn ít nhất: 90 giây
  stage.add('late', 1, 5000); // chỗ 11, hết lúc 17000 nhưng mới đứng 5 giây lúc 10000
  const r = stage.add('new', 1, 10000);
  assert.deepEqual(r, { status: 'on', slot: 10, replaced: 'p10' });
  assert.equal(stage.isOn('late'), true);
});

test('hoà giờ còn lại → thay người ở chỗ số nhỏ hơn', () => {
  const stage = new StageSlots();
  fillStage(stage, 0, () => 37);
  assert.deepEqual(stage.add('new', 1, 8000), { status: 'on', slot: 0, replaced: 'p0' });
});

test('hàng chờ tối đa 10 người, đầy thì "full"', () => {
  const stage = new StageSlots();
  fillStage(stage, 0);
  for (let i = 0; i < 10; i++) assert.equal(stage.add(`q${i}`, 1, 1000).status, 'queued');
  assert.deepEqual(stage.add('extra', 1, 1000), { status: 'full' });
  assert.equal(stage.isQueued('extra'), false);
  assert.equal(stage.queueIds().length, 10);
});

test('người đang chờ tặng thêm → vẫn "queued", cộng xu, không chen hàng', () => {
  const stage = new StageSlots();
  fillStage(stage, 0);
  stage.add('q1', 1, 1000);
  stage.add('q2', 1, 1000);
  assert.deepEqual(stage.add('q2', 9, 2000), { status: 'queued' });
  assert.deepEqual(stage.queueIds(), ['q1', 'q2']);
  stage.remove('p0');
  stage.remove('p1');
  const { joined } = stage.tick(3000);
  assert.deepEqual(joined, [{ id: 'q1', slot: 0 }, { id: 'q2', slot: 1 }]);
  assert.equal(stage.entries()[1].until, 3000 + stageSeconds(10) * 1000, 'giờ trên sân tính theo tổng xu đã chờ');
});

test('có người đang chờ → người mới đứng sau họ dù vừa có chỗ trống (FIFO)', () => {
  const stage = new StageSlots();
  fillStage(stage, 0);
  stage.add('q1', 1, 1000);
  stage.remove('p3');
  assert.deepEqual(stage.add('new', 1, 2000), { status: 'queued' });
  assert.deepEqual(stage.queueIds(), ['q1', 'new']);
  assert.deepEqual(stage.tick(2000), { left: [], joined: [{ id: 'q1', slot: 3 }] });
  assert.deepEqual(stage.queueIds(), ['new']);
});

test('tick: hết giờ (until ≤ now) thì xuống sân, còn giờ thì ở lại', () => {
  const stage = new StageSlots();
  stage.add('a', 1, 0); // until 12000
  stage.add('b', 2, 0); // until 15000
  assert.deepEqual(stage.tick(11999), { left: [], joined: [] });
  assert.deepEqual(stage.tick(12000), { left: ['a'], joined: [] });
  assert.equal(stage.isOn('a'), false);
  assert.equal(stage.isOn('b'), true);
});

test('tick: người đầu hàng lên chỗ trống với giờ tính từ lúc lên', () => {
  const stage = new StageSlots();
  fillStage(stage, 0); // ai cũng hết lúc 12000
  stage.add('q1', 5, 1000);
  stage.add('q2', 1, 1000);
  const r = stage.tick(12000);
  assert.equal(r.left.length, 12);
  assert.deepEqual(r.joined, [{ id: 'q1', slot: 0 }, { id: 'q2', slot: 1 }]);
  assert.deepEqual(stage.entries()[0], { id: 'q1', slot: 0, since: 12000, until: 12000 + 24000 });
  assert.deepEqual(stage.queueIds(), []);
});

test('tick: người chờ thay người đã đứng đủ 8 giây; người vừa lên được giữ 8 giây', () => {
  const stage = new StageSlots();
  fillStage(stage, 0, (i) => 37 - i); // p11 ít giờ nhất (87 giây), rồi p10, p9, p8...
  for (const id of ['q1', 'q2', 'q3']) stage.add(id, 1, 1000);
  assert.deepEqual(stage.tick(7999), { left: [], joined: [] });
  const r = stage.tick(8000);
  assert.deepEqual(r.left, ['p11', 'p10', 'p9']);
  assert.deepEqual(r.joined, [{ id: 'q1', slot: 11 }, { id: 'q2', slot: 10 }, { id: 'q3', slot: 9 }]);
  // q1..q3 còn ít giờ nhất (tới 20000) nhưng mới đứng 1 giây → người mới thay p8.
  assert.deepEqual(stage.add('q4', 1, 9000), { status: 'on', slot: 8, replaced: 'p8' });
  assert.equal(stage.isOn('q1'), true);
});

test('tick: không thay ngay người vừa lên trong cùng lượt (minStand = 0)', () => {
  // Với minStand = 0, add() thay người ngay nên hàng chờ chỉ có được từ ảnh chụp cũ.
  const stage = StageSlots.fromJSON(
    { slots: [{ id: 'a', slot: 0, since: 0, until: 12000 }], queue: [{ id: 'q1', xu: 1 }, { id: 'q2', xu: 1 }] },
    { slots: 1, minStandMs: 0 },
  );
  const r = stage.tick(12000);
  assert.deepEqual(r, { left: ['a'], joined: [{ id: 'q1', slot: 0 }] });
  assert.deepEqual(stage.queueIds(), ['q2']);
});

test('remove gỡ khỏi sân hoặc hàng chờ; người lạ → false', () => {
  const stage = new StageSlots({ slots: 1 });
  stage.add('a', 1, 0);
  stage.add('b', 1, 0);
  assert.equal(stage.remove('b'), true);
  assert.equal(stage.isQueued('b'), false);
  assert.equal(stage.remove('a'), true);
  assert.equal(stage.isOn('a'), false);
  assert.equal(stage.slotOf('a'), null);
  assert.equal(stage.remove('zzz'), false);
});

test('truy vấn: isOn, isQueued, slotOf, entries theo chỗ, queueIds', () => {
  const stage = new StageSlots({ slots: 2 });
  stage.add('a', 1, 0);
  stage.add('b', 1, 0);
  stage.add('c', 1, 0);
  stage.remove('a');
  stage.tick(1); // c lên chỗ 0
  assert.equal(stage.isOn('c'), true);
  assert.equal(stage.slotOf('c'), 0);
  assert.equal(stage.slotOf('b'), 1);
  assert.deepEqual(stage.entries().map((e) => e.id), ['c', 'b']);
  stage.add('d', 1, 2);
  assert.equal(stage.isQueued('d'), true);
  assert.deepEqual(stage.queueIds(), ['d']);
});

test('toJSON / fromJSON giữ nguyên trạng thái và chạy tiếp như cũ', () => {
  const stage = new StageSlots();
  fillStage(stage, 0, (i) => 37 - i);
  stage.add('q1', 5, 1000);
  stage.add('q2', 1, 1000);
  const saved = JSON.parse(JSON.stringify(stage));
  const back = StageSlots.fromJSON(saved);
  assert.deepEqual(back.entries(), stage.entries());
  assert.deepEqual(back.queueIds(), ['q1', 'q2']);
  assert.deepEqual(back.toJSON(), stage.toJSON());
  assert.deepEqual(back.tick(8000), stage.tick(8000));
});

test('fromJSON lấy thông số từ opts; bỏ chỗ ngoài số chỗ mới, id trùng, dòng hỏng', () => {
  const saved = {
    slots: [
      { id: 'a', slot: 0, since: 0, until: 12000 },
      { id: 'b', slot: 5, since: 0, until: 12000 },
      { id: 'a', slot: 1, since: 0, until: 12000 },
      { id: 'c', slot: 1, since: 'x', until: 12000 },
      null,
    ],
    queue: [{ id: 'a', xu: 1 }, { id: 'q1', xu: 3 }, { id: 'q2', xu: 1 }],
  };
  const back = StageSlots.fromJSON(saved, { slots: 4, queueMax: 1 });
  assert.equal(back.slotCount, 4);
  assert.equal(back.queueMax, 1);
  assert.deepEqual(back.entries().map((e) => e.id), ['a'], 'b ở chỗ 5 nằm ngoài 4 chỗ mới → bỏ');
  assert.deepEqual(back.queueIds(), ['q1'], 'a đã trên sân → không chờ; hàng cắt theo queueMax 1');
});

test('fromJSON với dữ liệu rỗng / hỏng → sân trống', () => {
  for (const bad of [null, undefined, 'abc', 42, {}, { slots: 'x', queue: 7 }]) {
    const s = StageSlots.fromJSON(bad);
    assert.deepEqual(s.entries(), []);
    assert.deepEqual(s.queueIds(), []);
  }
});
