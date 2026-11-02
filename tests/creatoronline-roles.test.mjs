// 🏢 Creator Online — vai MC / Kỹ thuật / Quản lý: xếp hàng, giữ chắc, nhường (spec mục 7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoleBoard, ROLES } from '../public/games/creatoronline/js/logic/roles.js';

const S = 1000;

test('ROLES theo thứ tự MC → Kỹ thuật → Quản lý', () => {
  assert.deepEqual(ROLES, ['mc', 'tech', 'manager']);
});

test('vai trống → nhận ngay: giữ 180 giây, giữ chắc 45 giây đầu', () => {
  const board = new RoleBoard();
  assert.deepEqual(board.request(2, 'tech', 'a', 10 * S), { status: 'granted', club: 2, role: 'tech' });
  assert.deepEqual(board.holder(2, 'tech'), { id: 'a', since: 10 * S, until: 190 * S, lockUntil: 55 * S });
  assert.deepEqual(board.roleOf('a'), { club: 2, role: 'tech' });
  assert.equal(board.holder(3, 'tech'), null, 'vai thuộc sân club người tặng, club khác vẫn trống');
});

test('người khác tặng cùng vai → xếp hàng, không cướp', () => {
  const board = new RoleBoard();
  board.request(1, 'mc', 'a', 0);
  assert.deepEqual(board.request(1, 'mc', 'b', 10 * S), { status: 'queued', club: 1, role: 'mc' });
  assert.equal(board.holder(1, 'mc').id, 'a');
  assert.deepEqual(board.queued(1, 'mc'), ['b']);
  assert.equal(board.isQueued('b'), true);
  assert.equal(board.roleOf('b'), null);
});

test('có người chờ → người giữ còn tối đa 60 giây nữa', () => {
  const board = new RoleBoard();
  board.request(1, 'mc', 'a', 0);
  board.request(1, 'mc', 'b', 10 * S);
  assert.equal(board.holder(1, 'mc').until, 70 * S);
});

test('nhường không sớm hơn lúc hết giữ chắc 45 giây', () => {
  const board = new RoleBoard({ yieldMs: 30 * S });
  board.request(1, 'mc', 'a', 0);
  board.request(1, 'mc', 'b', 5 * S); // 5 + 30 = 35 giây < 45 giây giữ chắc
  assert.equal(board.holder(1, 'mc').until, 45 * S);
});

test('người giữ sắp hết giờ thì người chờ không làm kéo dài thêm', () => {
  const board = new RoleBoard();
  board.request(1, 'mc', 'a', 0);
  board.request(1, 'mc', 'b', 150 * S); // 150 + 60 = 210 > 180
  assert.equal(board.holder(1, 'mc').until, 180 * S);
});

test('mỗi vai 1 chỗ chờ: người thứ ba → "full" (quà về bậc 2)', () => {
  const board = new RoleBoard();
  board.request(1, 'manager', 'a', 0);
  board.request(1, 'manager', 'b', 0);
  assert.deepEqual(board.request(1, 'manager', 'c', 0), { status: 'full', club: 1, role: 'manager' });
  assert.equal(board.isQueued('c'), false);
  assert.deepEqual(board.queued(1, 'manager'), ['b']);
});

test('queueMax = 0 → vai đã có người thì "full" ngay', () => {
  const board = new RoleBoard({ queueMax: 0 });
  board.request(1, 'mc', 'a', 0);
  assert.equal(board.request(1, 'mc', 'b', 0).status, 'full');
});

test('người giữ tặng lại, không ai chờ → cộng 90 giây, trần 300 giây tính từ lúc nhận', () => {
  const board = new RoleBoard();
  board.request(1, 'mc', 'a', 0);
  assert.deepEqual(board.request(1, 'mc', 'a', 1 * S), { status: 'extended', club: 1, role: 'mc' });
  assert.equal(board.holder(1, 'mc').until, 270 * S);
  assert.equal(board.request(1, 'mc', 'a', 2 * S).status, 'extended');
  assert.equal(board.holder(1, 'mc').until, 300 * S);
  assert.equal(board.holder(1, 'mc').lockUntil, 45 * S, 'tặng lại không kéo dài giữ chắc');
});

test('người giữ tặng lại khi có người chờ → "held", không cộng giờ', () => {
  const board = new RoleBoard();
  board.request(1, 'mc', 'a', 0);
  board.request(1, 'mc', 'b', 10 * S); // a còn tới 70 giây
  assert.deepEqual(board.request(1, 'mc', 'a', 20 * S), { status: 'held', club: 1, role: 'mc' });
  assert.equal(board.holder(1, 'mc').until, 70 * S);
});

test('mỗi người một vai: đang giữ MC club 1 mà tặng quà Kỹ thuật club 2 → tính là tặng lại MC', () => {
  const board = new RoleBoard();
  board.request(1, 'mc', 'a', 0);
  assert.deepEqual(board.request(2, 'tech', 'a', 1 * S), { status: 'extended', club: 1, role: 'mc' });
  assert.equal(board.holder(2, 'tech'), null);
  assert.deepEqual(board.all(), [{ club: 1, role: 'mc', id: 'a', until: 270 * S }]);
});

test('đang chờ một vai mà tặng tiếp → vẫn "queued" ở chỗ cũ, không chờ 2 nơi', () => {
  const board = new RoleBoard();
  board.request(1, 'mc', 'a', 0);
  board.request(1, 'mc', 'b', 0);
  assert.deepEqual(board.request(3, 'tech', 'b', 1 * S), { status: 'queued', club: 1, role: 'mc' });
  assert.deepEqual(board.request(1, 'mc', 'b', 2 * S), { status: 'queued', club: 1, role: 'mc' });
  assert.equal(board.holder(3, 'tech'), null);
  assert.deepEqual(board.queued(1, 'mc'), ['b']);
});

test('auto (bậc 4): vai trống theo thứ tự MC → Kỹ thuật → Quản lý', () => {
  const board = new RoleBoard();
  assert.deepEqual(board.request(4, 'auto', 'a', 0), { status: 'granted', club: 4, role: 'mc' });
  assert.deepEqual(board.request(4, 'auto', 'b', 0), { status: 'granted', club: 4, role: 'tech' });
  assert.deepEqual(board.request(4, 'auto', 'c', 0), { status: 'granted', club: 4, role: 'manager' });
});

test('auto bỏ qua vai đã có người, lấy vai trống kế tiếp', () => {
  const board = new RoleBoard();
  board.request(4, 'mc', 'x', 0);
  assert.deepEqual(board.request(4, 'auto', 'a', 0), { status: 'granted', club: 4, role: 'tech' });
});

test('auto hết vai trống → vào hàng chờ theo thứ tự; mọi hàng đầy → "full"', () => {
  const board = new RoleBoard();
  for (const id of ['a', 'b', 'c']) board.request(5, 'auto', id, 0);
  assert.deepEqual(board.request(5, 'auto', 'd', 0), { status: 'queued', club: 5, role: 'mc' });
  assert.deepEqual(board.request(5, 'auto', 'e', 0), { status: 'queued', club: 5, role: 'tech' });
  assert.deepEqual(board.request(5, 'auto', 'f', 0), { status: 'queued', club: 5, role: 'manager' });
  assert.deepEqual(board.request(5, 'auto', 'g', 0), { status: 'full', club: 5, role: 'auto' });
  assert.equal(board.holder(5, 'mc').until, 60 * S, 'người chờ qua auto cũng làm người giữ nhường');
});

test('auto với hàng dài hơn 1 → vào hàng ngắn nhất', () => {
  const board = new RoleBoard({ queueMax: 2 });
  for (const id of ['a', 'b', 'c']) board.request(5, 'auto', id, 0);
  board.request(5, 'mc', 'x', 0);
  assert.deepEqual(board.request(5, 'auto', 'd', 0), { status: 'queued', club: 5, role: 'tech' });
});

test('tick: hết giờ → "end", vai về NPC khi không ai chờ', () => {
  const board = new RoleBoard();
  board.request(1, 'mc', 'a', 0);
  assert.deepEqual(board.tick(180 * S - 1), []);
  assert.deepEqual(board.tick(180 * S), [{ type: 'end', club: 1, role: 'mc', id: 'a' }]);
  assert.equal(board.holder(1, 'mc'), null);
  assert.equal(board.roleOf('a'), null);
  assert.deepEqual(board.tick(181 * S), []);
});

test('tick: mọi "end" trước rồi mới "grant"; người chờ nhận vai với giờ mới', () => {
  const board = new RoleBoard();
  board.request(1, 'mc', 'a', 0);
  board.request(1, 'mc', 'b', 10 * S); // a hết lúc 70 giây
  board.request(2, 'tech', 'c', 0); // c hết lúc 180 giây
  assert.deepEqual(board.tick(69 * S), []);
  const events = board.tick(200 * S);
  assert.deepEqual(events, [
    { type: 'end', club: 1, role: 'mc', id: 'a' },
    { type: 'end', club: 2, role: 'tech', id: 'c' },
    { type: 'grant', club: 1, role: 'mc', id: 'b' },
  ]);
  assert.deepEqual(board.holder(1, 'mc'), { id: 'b', since: 200 * S, until: 380 * S, lockUntil: 245 * S });
  assert.deepEqual(board.queued(1, 'mc'), []);
});

test('người chờ đợi không quá 60 giây (vai bị giữ đã qua giữ chắc)', () => {
  const board = new RoleBoard();
  board.request(1, 'mc', 'a', 0);
  board.request(1, 'mc', 'b', 100 * S);
  assert.deepEqual(board.tick(159 * S), []);
  assert.deepEqual(board.tick(160 * S).map((e) => e.type), ['end', 'grant']);
  assert.equal(board.roleOf('b').role, 'mc');
});

test('tick: người vừa nhận vai mà hàng còn người → áp luật nhường cho họ luôn', () => {
  const board = new RoleBoard({ queueMax: 2 });
  board.request(1, 'mc', 'a', 0);
  board.request(1, 'mc', 'b', 0);
  board.request(1, 'mc', 'c', 0);
  board.tick(60 * S); // a nhường lúc 60 giây
  assert.deepEqual(board.holder(1, 'mc'), { id: 'b', since: 60 * S, until: 120 * S, lockUntil: 105 * S });
  assert.deepEqual(board.queued(1, 'mc'), ['c']);
});

test('durMs > maxMs → giờ giữ bị kẹp ở maxMs', () => {
  const board = new RoleBoard({ durMs: 400 * S });
  board.request(1, 'mc', 'a', 0);
  assert.equal(board.holder(1, 'mc').until, 300 * S);
});

test('drop người giữ vai → "end" + người chờ nhận vai ngay', () => {
  const board = new RoleBoard();
  board.request(3, 'manager', 'a', 0);
  board.request(3, 'manager', 'b', 5 * S);
  assert.deepEqual(board.drop('a', 20 * S), [
    { type: 'end', club: 3, role: 'manager', id: 'a' },
    { type: 'grant', club: 3, role: 'manager', id: 'b' },
  ]);
  assert.deepEqual(board.holder(3, 'manager'), { id: 'b', since: 20 * S, until: 200 * S, lockUntil: 65 * S });
});

test('drop người giữ vai không ai chờ → chỉ "end", vai về NPC', () => {
  const board = new RoleBoard();
  board.request(3, 'manager', 'a', 0);
  assert.deepEqual(board.drop('a', 1 * S), [{ type: 'end', club: 3, role: 'manager', id: 'a' }]);
  assert.equal(board.holder(3, 'manager'), null);
});

test('drop người đang chờ → chỉ rời hàng, không sự kiện, người giữ không đổi', () => {
  const board = new RoleBoard();
  board.request(3, 'manager', 'a', 0);
  board.request(3, 'manager', 'b', 5 * S);
  const before = board.holder(3, 'manager');
  assert.deepEqual(board.drop('b', 10 * S), []);
  assert.deepEqual(board.queued(3, 'manager'), []);
  assert.equal(board.isQueued('b'), false);
  assert.deepEqual(board.holder(3, 'manager'), before);
  assert.deepEqual(board.drop('nobody', 10 * S), []);
});

test('club hoặc vai không hợp lệ → "full"', () => {
  const board = new RoleBoard();
  assert.equal(board.request(0, 'mc', 'a', 0).status, 'full');
  assert.equal(board.request(6, 'auto', 'a', 0).status, 'full');
  assert.equal(board.request(1, 'idol', 'a', 0).status, 'full');
  assert.deepEqual(board.all(), []);
});

test('club dạng chuỗi "2" được hiểu là club 2', () => {
  const board = new RoleBoard();
  assert.deepEqual(board.request('2', 'mc', 'a', 0), { status: 'granted', club: 2, role: 'mc' });
  assert.equal(board.holder(2, 'mc').id, 'a');
});

test('holder / queued trả bản sao, sửa không ảnh hưởng bảng vai', () => {
  const board = new RoleBoard();
  board.request(1, 'mc', 'a', 0);
  board.request(1, 'mc', 'b', 0);
  board.holder(1, 'mc').until = 1;
  board.queued(1, 'mc').push('zzz');
  assert.equal(board.holder(1, 'mc').until, 60 * S);
  assert.deepEqual(board.queued(1, 'mc'), ['b']);
});

test('all() liệt kê mọi vai đang giữ', () => {
  const board = new RoleBoard();
  board.request(2, 'tech', 'a', 0);
  board.request(1, 'manager', 'b', 0);
  assert.deepEqual(board.all(), [
    { club: 1, role: 'manager', id: 'b', until: 180 * S },
    { club: 2, role: 'tech', id: 'a', until: 180 * S },
  ]);
});

test('toJSON / fromJSON giữ nguyên trạng thái và chạy tiếp như cũ', () => {
  const board = new RoleBoard();
  board.request(1, 'mc', 'a', 0);
  board.request(1, 'mc', 'b', 10 * S);
  board.request(4, 'tech', 'c', 5 * S);
  const back = RoleBoard.fromJSON(JSON.parse(JSON.stringify(board)));
  assert.deepEqual(back.toJSON(), board.toJSON());
  assert.deepEqual(back.all(), board.all());
  assert.deepEqual(back.queued(1, 'mc'), ['b']);
  assert.deepEqual(back.tick(70 * S), board.tick(70 * S));
  assert.deepEqual(back.toJSON(), board.toJSON());
});

test('fromJSON lấy thông số từ opts; bỏ dòng hỏng và id trùng; hàng cắt theo queueMax', () => {
  const saved = {
    slots: [
      { club: 1, role: 'mc', holder: { id: 'a', since: 0, until: 60000, lockUntil: 45000 }, queue: ['b', 'c'] },
      { club: 2, role: 'mc', holder: { id: 'a', since: 0, until: 9, lockUntil: 9 }, queue: [] },
      { club: 3, role: 'tech', holder: { id: 'd', since: 'x', until: 1, lockUntil: 1 }, queue: ['a', 'e'] },
      { club: 9, role: 'mc', holder: { id: 'f', since: 0, until: 1, lockUntil: 1 }, queue: [] },
      null,
    ],
  };
  const back = RoleBoard.fromJSON(saved, { queueMax: 1, extendMs: 1000 });
  assert.equal(back.extendMs, 1000);
  assert.deepEqual(back.all(), [{ club: 1, role: 'mc', id: 'a', until: 60000 }]);
  assert.deepEqual(back.queued(1, 'mc'), ['b']);
  assert.deepEqual(back.queued(3, 'tech'), ['e']);
  assert.equal(back.isQueued('c'), false);
});

test('fromJSON với dữ liệu rỗng / hỏng → bảng vai trống', () => {
  for (const bad of [null, undefined, 'abc', {}, { slots: 7 }]) {
    const b = RoleBoard.fromJSON(bad);
    assert.deepEqual(b.all(), []);
    assert.deepEqual(b.toJSON(), { slots: [] });
  }
});
