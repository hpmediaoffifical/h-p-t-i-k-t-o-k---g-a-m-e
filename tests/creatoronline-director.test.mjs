import test from 'node:test';
import assert from 'node:assert/strict';
import { Director, IdleCycle, PRIORITY, PK_ROLE_PRIORITY } from '../public/games/creatoronline/js/logic/director.js';

/** Cảnh thử: { kind, target, gifter, view, focus, durMs }. */
const shot = (kind, target, gifter, durMs, extra = {}) => ({ kind, target, gifter, view: 'stage', focus: null, durMs, ...extra });
/** ctx mặc định: không PK, mọi mục tiêu còn sống, không có vòng rảnh. */
const ctx = (extra = {}) => ({ pk: null, alive: () => true, idleNext: () => null, ...extra });
const targets = (d) => d.queue.map((s) => s.target);

// ───────── ưu tiên ─────────

test('PRIORITY đúng bảng mục 12; vai ở sân PK đứng ngay trên cảnh PK', () => {
  assert.deepEqual({ ...PRIORITY }, { gala: 70, spotlight: 60, big: 50, pk: 45, room: 40, role: 30, idle: 0 });
  assert.equal(PK_ROLE_PRIORITY, 46);
});

// ───────── trần cảnh quay mỗi người ─────────

test('trần cảnh quay: mỗi người tối đa 90 giây trong 5 phút, phần còn lại < 8 giây thì bị chặn', () => {
  const d = new Director();
  assert.equal(d.push(shot('room', 'N01', 'x', 30000), 0), 'queued');
  assert.equal(d.push(shot('room', 'N02', 'x', 30000), 1000), 'queued');
  assert.equal(d.push(shot('role', 'G1', 'x', 20000), 2000), 'queued'); // đã giữ 80 giây
  // còn 10 giây ≥ 8 → vẫn vào hàng nhưng bị cắt còn 10 giây
  assert.equal(d.push(shot('big', 'G2', 'x', 15000), 3000), 'queued');
  assert.equal(d.queue.find((s) => s.target === 'G2').durMs, 10000);
  // đủ 90 giây → chỉ mất cú cắt cảnh
  assert.equal(d.push(shot('big', 'G3', 'x', 15000), 4000), 'capped');
  // người khác không bị ảnh hưởng
  assert.equal(d.push(shot('big', 'G3', 'y', 15000), 4000), 'queued');
});

test('trần cảnh quay: còn 5 giây (< 8 giây tối thiểu) thì bị chặn dù cảnh mới rất ngắn', () => {
  const d = new Director();
  d.push(shot('room', 'N01', 'x', 30000), 0);
  d.push(shot('room', 'N02', 'x', 30000), 0);
  d.push(shot('role', 'G1', 'x', 20000), 0);
  assert.equal(d.push(shot('big', 'G2', 'x', 5000), 0), 'queued'); // 85 giây
  assert.equal(d.push(shot('big', 'G3', 'x', 5000), 0), 'capped');
});

test('trần cảnh quay là cửa sổ trượt: giây giữ từ 5 phút trước được trả lại', () => {
  const d = new Director();
  d.push(shot('room', 'N01', 'x', 30000), 0);
  d.push(shot('room', 'N02', 'x', 30000), 1000);
  d.push(shot('room', 'N03', 'x', 30000), 2000); // 90 giây
  assert.equal(d.push(shot('big', 'G1', 'x', 15000), 299999), 'capped');
  // t = 300 000: 30 giây giữ lúc t = 0 ra khỏi cửa sổ → còn 30 giây
  assert.equal(d.push(shot('big', 'G1', 'x', 15000), 300000), 'queued');
  assert.equal(d.queue.find((s) => s.target === 'G1').durMs, 15000);
});

test('Gala không bị trần và giây Gala không tính vào trần', () => {
  const d = new Director();
  d.push(shot('room', 'N01', 'x', 30000), 0);
  d.push(shot('room', 'N02', 'x', 30000), 0);
  d.push(shot('room', 'N03', 'x', 30000), 0); // hết trần
  assert.equal(d.push(shot('gala', 'G1', 'x', 60000), 0), 'queued');
  assert.equal(d.queue.find((s) => s.kind === 'gala').durMs, 60000);

  const fresh = new Director();
  fresh.push(shot('gala', 'G1', 'x', 60000), 0);
  assert.equal(fresh.push(shot('room', 'N01', 'x', 90000), 0), 'queued');
  assert.equal(fresh.queue.find((s) => s.kind === 'room').durMs, 90000); // Gala không ăn vào 90 giây
});

test('cảnh chờ bị bỏ (quá hạn) thì trả lại giây đã giữ cho người tặng', () => {
  // Arrange — x chỉ được 20 giây; một Gala dài đang quay nên cảnh của x phải chờ
  const d = new Director({ camCapMs: 20000 });
  d.push(shot('gala', 'G1', 'z', 60000), 0);
  d.tick(0, ctx());
  assert.equal(d.push(shot('role', 'G2', 'x', 20000), 1000), 'queued');
  assert.equal(d.push(shot('role', 'G3', 'x', 20000), 1000), 'capped');
  // Act — cảnh của x chờ quá 45 giây → bị bỏ
  d.tick(46001, ctx());
  // Assert — x có lại 20 giây
  assert.deepEqual(targets(d), []);
  assert.equal(d.push(shot('role', 'G3', 'x', 20000), 46001), 'queued');
});

test('cảnh bị cảnh ưu tiên cao cắt ngang thì trả lại phần giây chưa quay', () => {
  const d = new Director({ camCapMs: 30000 });
  d.push(shot('room', 'N01', 'x', 30000), 0);
  d.tick(0, ctx());
  d.push(shot('big', 'G1', 'y', 15000), 1000);
  d.tick(8000, ctx()); // phòng của x chỉ quay được 8 giây
  assert.equal(d.current.gifter, 'y');
  assert.equal(d.push(shot('room', 'N02', 'x', 30000), 8000), 'queued');
  assert.equal(d.queue.find((s) => s.target === 'N02').durMs, 22000);
});

// ───────── gộp cảnh ─────────

test('gộp: chỉ cảnh cùng người tặng VÀ cùng mục tiêu được cộng giờ', () => {
  const d = new Director();
  assert.equal(d.push(shot('big', 'G1', 'x', 15000), 0), 'queued');
  assert.equal(d.push(shot('big', 'G1', 'x', 15000), 1000), 'merged');
  assert.equal(d.push(shot('big', 'G1', 'y', 15000), 2000), 'queued'); // khác người
  assert.equal(d.push(shot('big', 'G2', 'x', 15000), 3000), 'queued'); // khác sân
  assert.equal(d.queue.length, 3);
  assert.equal(d.queue.find((s) => s.gifter === 'x' && s.target === 'G1').durMs, 30000);
});

test('gộp vào cảnh đang quay: kéo dài giờ kết thúc, vẫn là cùng một cảnh (không cắt lại)', () => {
  const d = new Director();
  d.push(shot('big', 'G1', 'x', 15000), 0);
  const first = d.tick(0, ctx());
  assert.equal(d.push(shot('big', 'G1', 'x', 15000), 5000), 'merged');
  assert.equal(d.current, first);
  assert.equal(first.endAt, 30000);
  assert.equal(d.tick(20000, ctx()), first);
});

test('gộp: giây gộp vẫn tính vào trần của người tặng', () => {
  const d = new Director();
  d.push(shot('room', 'N01', 'x', 30000), 0);
  d.push(shot('room', 'N01', 'x', 30000), 0); // gộp → 60 giây
  d.push(shot('room', 'N01', 'x', 30000), 0); // gộp → 90 giây
  assert.equal(d.queue.length, 1);
  assert.equal(d.push(shot('big', 'G1', 'x', 15000), 0), 'capped');
});

test('gộp cảnh ưu tiên cao hơn vào cảnh đang chờ: cảnh mang ưu tiên cao hơn và lên đầu hàng', () => {
  const d = new Director();
  d.push(shot('room', 'N05', 'w', 30000), 0);
  d.push(shot('role', 'G1', 'x', 20000, { view: 'close', focus: 'x' }), 1000);
  assert.equal(d.push(shot('big', 'G1', 'x', 15000), 2000), 'merged');
  const q = d.queue;
  assert.equal(q[0].gifter, 'x');
  assert.equal(q[0].kind, 'big');
  assert.equal(q[0].durMs, 35000);
  assert.equal(q[0].focus, 'x');
});

test('gộp: một cảnh không dài quá 300 giây (giữ chỗ liên tục)', () => {
  const d = new Director({ camCapMs: 1e9 });
  d.push(shot('room', 'N01', 'x', 200000), 0);
  assert.equal(d.push(shot('room', 'N01', 'x', 200000), 0), 'merged');
  assert.equal(d.queue[0].durMs, 300000);
});

test('2 Gala cùng người cùng sân gộp lại tối đa 90 giây', () => {
  const d = new Director();
  d.push(shot('gala', 'G1', 'x', 60000), 0);
  const g = d.tick(0, ctx());
  assert.equal(d.push(shot('gala', 'G1', 'x', 60000), 10000), 'merged');
  assert.equal(g.durMs, 90000);
  assert.equal(g.endAt, 90000);
  assert.equal(d.push(shot('gala', 'G1', 'x', 60000), 20000), 'merged'); // Gala thứ 3: không dài thêm
  assert.equal(g.endAt, 90000);
});

// ───────── hàng chờ ─────────

test('hàng chờ xếp theo ưu tiên giảm dần, cùng ưu tiên thì tới trước được trước', () => {
  const d = new Director();
  d.push(shot('role', 'G1', 'a', 20000), 0);
  d.push(shot('room', 'N01', 'b', 30000), 1000);
  d.push(shot('role', 'G2', 'c', 20000), 2000);
  d.push(shot('gala', 'G3', 'e', 60000), 3000);
  d.push(shot('big', 'G4', 'f', 15000), 4000);
  assert.deepEqual(targets(d), ['G3', 'G4', 'N01', 'G1', 'G2']);
});

test('hàng đầy: cảnh ưu tiên cao hơn thay cảnh thấp nhất cũ nhất; ngang hoặc thấp hơn thì bỏ', () => {
  const d = new Director({ queueMax: 3 });
  d.push(shot('role', 'G1', 'a', 20000), 0);
  d.push(shot('role', 'G2', 'b', 20000), 1000);
  d.push(shot('role', 'G3', 'c', 20000), 2000);
  assert.equal(d.push(shot('role', 'G4', 'd', 20000), 3000), 'dropped');
  assert.equal(d.push(shot('room', 'N01', 'e', 30000), 4000), 'queued'); // thay vai cũ nhất (a)
  assert.deepEqual(targets(d), ['N01', 'G2', 'G3']);
  assert.equal(d.push(shot('role', 'G5', 'f', 20000), 5000), 'dropped');
  assert.equal(d.push(shot('big', 'G1', 'g', 15000), 6000), 'queued'); // thay vai cũ nhất còn lại (b)
  assert.deepEqual(targets(d), ['G1', 'N01', 'G3']);
  assert.equal(d.queue.length, 3);
});

test('mặc định hàng chờ tối đa 6 cảnh', () => {
  const d = new Director();
  for (let i = 0; i < 6; i++) assert.equal(d.push(shot('role', 'G' + (i % 5 + 1), 'u' + i, 20000), i), 'queued');
  assert.equal(d.push(shot('role', 'G1', 'u9', 20000), 9), 'dropped');
});

// ───────── bỏ cảnh quá hạn / mất mục tiêu ─────────

test('cảnh chờ quá 45 giây thì bị bỏ (đúng 45 giây vẫn giữ)', () => {
  const d = new Director();
  d.push(shot('gala', 'G1', 'z', 60000), 0);
  d.tick(0, ctx());
  d.push(shot('big', 'G2', 'x', 15000), 1000);
  d.tick(46000, ctx());
  assert.deepEqual(targets(d), ['G2']);
  d.tick(46001, ctx());
  assert.deepEqual(targets(d), []);
});

test('cảnh chờ mất mục tiêu (alive = false) thì bị bỏ ngay', () => {
  const d = new Director();
  d.push(shot('gala', 'G1', 'z', 60000), 0);
  d.tick(0, ctx());
  d.push(shot('room', 'N01', 'x', 30000), 1000);
  d.push(shot('role', 'G2', 'y', 20000), 1000);
  d.tick(2000, ctx({ alive: (s) => s.target !== 'N01' }));
  assert.deepEqual(targets(d), ['G2']);
});

test('cảnh đang quay mất mục tiêu thì dừng ngay, không chờ mốc 8 giây', () => {
  const d = new Director();
  d.push(shot('room', 'N01', 'x', 30000), 0);
  d.tick(0, ctx());
  const cur = d.tick(1000, ctx({ alive: (s) => s.target !== 'N01' }));
  assert.equal(cur.kind, 'idle');
  assert.equal(cur.startAt, 1000);
});

test('cảnh PK và cảnh rảnh không hỏi alive (luôn còn mục tiêu)', () => {
  const d = new Director();
  const asked = [];
  const alive = (s) => {
    asked.push(s.kind);
    return false;
  };
  const a = d.tick(0, ctx({ alive }));
  assert.equal(d.tick(1000, ctx({ alive })), a);
  const p = d.tick(8000, ctx({ alive, pk: { a: 1, b: 2 } }));
  assert.equal(p.kind, 'pk');
  assert.equal(d.tick(9000, ctx({ alive, pk: { a: 1, b: 2 } })), p);
  assert.deepEqual(asked, []);
});

// ───────── cắt ngang ─────────

test('cảnh ưu tiên cao chỉ cắt ngang sau khi cảnh hiện tại chạy đủ 8 giây', () => {
  const d = new Director();
  d.push(shot('room', 'N01', 'x', 30000), 0);
  d.tick(0, ctx());
  d.push(shot('big', 'G2', 'y', 15000), 1000);
  assert.equal(d.tick(7999, ctx()).kind, 'room');
  const big = d.tick(8000, ctx());
  assert.equal(big.kind, 'big');
  assert.equal(big.startAt, 8000);
  assert.equal(big.endAt, 23000);
});

test('cảnh ngang ưu tiên không cắt ngang: chờ cảnh hiện tại hết giờ', () => {
  const d = new Director();
  d.push(shot('room', 'N01', 'x', 30000), 0);
  d.tick(0, ctx());
  d.push(shot('room', 'N02', 'y', 30000), 1000);
  assert.equal(d.tick(20000, ctx()).target, 'N01');
  assert.equal(d.tick(29999, ctx()).target, 'N01');
  assert.equal(d.tick(30000, ctx()).target, 'N02');
});

test('cảnh hết giờ → lấy cảnh đầu hàng; bắt đầu thì đặt startAt = now, endAt = now + durMs', () => {
  const d = new Director();
  d.push(shot('role', 'G1', 'x', 20000), 0);
  d.push(shot('room', 'N01', 'y', 30000), 0);
  const a = d.tick(500, ctx());
  assert.deepEqual([a.target, a.startAt, a.endAt, a.queuedAt], ['N01', 500, 30500, 0]);
  const b = d.tick(30500, ctx());
  assert.deepEqual([b.target, b.startAt, b.endAt], ['G1', 30500, 50500]);
});

// ───────── Gala ─────────

test('Gala rút còn 30 giây khi có Gala của người khác đang chờ', () => {
  const d = new Director();
  d.push(shot('gala', 'G1', 'x', 60000), 0);
  const gx = d.tick(0, ctx());
  assert.equal(gx.endAt, 60000);
  d.push(shot('gala', 'G2', 'y', 60000), 5000);
  d.tick(5000, ctx());
  assert.equal(gx.endAt, 30000);
  assert.equal(d.tick(29999, ctx()), gx);
  const gy = d.tick(30000, ctx());
  assert.equal(gy.gifter, 'y');
  assert.equal(gy.endAt, 90000); // không còn Gala nào chờ → đủ 60 giây
});

test('Gala chờ cùng người (khác sân) không rút ngắn Gala đang quay', () => {
  const d = new Director();
  d.push(shot('gala', 'G1', 'x', 60000), 0);
  const gx = d.tick(0, ctx());
  d.push(shot('gala', 'G2', 'x', 60000), 5000);
  d.tick(5000, ctx());
  assert.equal(gx.endAt, 60000);
});

test('Gala đã chạy quá 30 giây thì Gala người khác tới là cắt ngay', () => {
  const d = new Director();
  d.push(shot('gala', 'G1', 'x', 60000), 0);
  d.tick(0, ctx());
  d.push(shot('gala', 'G2', 'y', 60000), 40000);
  const gy = d.tick(40000, ctx());
  assert.equal(gy.gifter, 'y');
  assert.equal(gy.startAt, 40000);
});

// ───────── PK ─────────

test('PK: cảnh PK xen kẽ 2 sân, mỗi sân 8 giây', () => {
  const d = new Director();
  const pk = { a: 1, b: 3 };
  const got = [0, 8000, 16000, 24000].map((t) => d.tick(t, ctx({ pk })));
  assert.deepEqual(got.map((s) => s.target), ['G1', 'G3', 'G1', 'G3']);
  assert.ok(got.every((s) => s.kind === 'pk' && s.view === 'stage' && s.gifter === null && s.durMs === 8000));
});

test('PK: cảnh vai ở sân đang PK được chen (46), vé và vai sân khác chờ PK xong', () => {
  const d = new Director();
  const pk = { a: 1, b: 3 };
  d.tick(16000, ctx({ pk })); // cảnh PK G1 16 000 → 24 000
  d.push(shot('room', 'N01', 'x', 30000), 17000);
  d.push(shot('role', 'G2', 'y', 20000), 17000);
  d.push(shot('role', 'G3', 'z', 20000, { view: 'close', focus: 'z' }), 17000);
  // Act + Assert — vai ở sân G3 (đang PK) lên trước
  const role = d.tick(24000, ctx({ pk }));
  assert.deepEqual([role.kind, role.target], ['role', 'G3']);
  assert.deepEqual(targets(d), ['N01', 'G2']);
  // cảnh PK ảo (45) không cắt ngang vai ở sân PK (46)
  assert.equal(d.tick(35000, ctx({ pk })), role);
  // vai hết giờ → quay lại PK, vé + vai sân khác vẫn chờ
  assert.equal(d.tick(44000, ctx({ pk })).kind, 'pk');
  assert.deepEqual(targets(d), ['N01', 'G2']);
  // PK xong: cảnh PK cuối chạy hết lượt rồi tới vé (ưu tiên cao hơn vai)
  assert.equal(d.tick(52000, ctx()).target, 'N01');
});

test('PK: quà lớn (bậc 5) cắt ngang cảnh PK sau 8 giây', () => {
  const d = new Director({ pkSwapMs: 20000 });
  const pk = { a: 2, b: 4 };
  d.tick(0, ctx({ pk }));
  d.push(shot('big', 'G5', 'x', 15000), 1000);
  assert.equal(d.tick(7999, ctx({ pk })).kind, 'pk');
  assert.equal(d.tick(8000, ctx({ pk })).kind, 'big');
});

test('PK bắt đầu khi đang quay vé: cảnh PK thay sau mốc 8 giây', () => {
  const d = new Director();
  d.push(shot('room', 'N01', 'x', 30000), 0);
  d.tick(0, ctx());
  assert.equal(d.tick(5000, ctx({ pk: { a: 1, b: 2 } })).kind, 'room');
  assert.equal(d.tick(8000, ctx({ pk: { a: 1, b: 2 } })).kind, 'pk');
});

test('PK đổi cặp: cảnh PK của cặp cũ dừng ngay, cặp mới bắt đầu từ sân a', () => {
  const d = new Director();
  d.tick(0, ctx({ pk: { a: 1, b: 3 } }));
  const s = d.tick(2000, ctx({ pk: { a: 5, b: 2 } }));
  assert.deepEqual([s.kind, s.target, s.startAt], ['pk', 'G5', 2000]);
});

// ───────── vòng rảnh ─────────

test('không có cảnh nào và vòng rảnh trả null → toàn tòa nhà 8 giây', () => {
  const d = new Director();
  const a = d.tick(0, ctx());
  assert.deepEqual([a.kind, a.target, a.view, a.gifter, a.startAt, a.endAt], ['idle', 'overview', 'overview', null, 0, 8000]);
  assert.equal(d.tick(4000, ctx()), a);
  const b = d.tick(8000, ctx());
  assert.notEqual(b.id, a.id);
  assert.equal(b.startAt, 8000);
  // ctx thiếu hẳn cũng chạy được
  assert.equal(new Director().tick(0).target, 'overview');
});

test('không có cảnh nào → lấy cảnh từ ctx.idleNext', () => {
  const d = new Director();
  const cyc = new IdleCycle();
  const info = { clubs: [3], guests: {}, rooms: [] };
  const idleNext = (now) => cyc.next(now, info);
  const a = d.tick(0, ctx({ idleNext }));
  assert.deepEqual([a.kind, a.target, a.view, a.startAt, a.endAt], ['idle', 'G3', 'stage', 0, 8000]);
  assert.ok(a.id);
  const b = d.tick(8000, ctx({ idleNext }));
  assert.deepEqual([b.view, b.endAt], ['close', 13000]);
});

test('skip: bỏ cảnh hiện tại, lần tick kế sang cảnh tiếp theo và trả lại giây chưa quay', () => {
  const d = new Director({ camCapMs: 30000 });
  d.push(shot('room', 'N01', 'x', 30000), 0);
  d.tick(0, ctx());
  d.push(shot('role', 'G2', 'y', 20000), 0);
  assert.equal(d.skip(3000), true);
  assert.equal(d.tick(3000, ctx()).target, 'G2');
  assert.equal(d.push(shot('room', 'N02', 'x', 30000), 3000), 'queued');
  assert.equal(d.queue[0].durMs, 27000);
  assert.equal(new Director().skip(0), false);
});

test('clear: xoá cảnh đang quay, hàng chờ và trần mỗi người (buổi LIVE mới)', () => {
  const d = new Director();
  d.push(shot('room', 'N01', 'x', 90000), 0);
  d.tick(0, ctx());
  d.push(shot('role', 'G1', 'y', 20000), 0);
  d.clear();
  assert.equal(d.current, null);
  assert.deepEqual(d.queue, []);
  assert.equal(d.push(shot('room', 'N02', 'x', 30000), 1000), 'queued');
});

test('queue trả về bản sao: sửa bên ngoài không làm hỏng hàng chờ', () => {
  const d = new Director();
  d.push(shot('role', 'G1', 'x', 20000), 0);
  const q = d.queue;
  q[0].target = 'G9';
  q.length = 0;
  assert.deepEqual(targets(d), ['G1']);
});

// ───────── IdleCycle ─────────

const view = (s) => `${s.view}:${s.target}:${s.focus}`;

test('IdleCycle: mỗi club sân → cận khách (xoay vòng) → phòng có chủ (xoay vòng) → bảng xếp hạng → club kế', () => {
  const c = new IdleCycle();
  const info = { clubs: [2, 4], guests: { 2: ['a', 'b'] }, rooms: ['N03', 'S2'] };
  const got = [];
  for (let i = 0; i < 10; i++) got.push(c.next(i * 1000, info));
  assert.deepEqual(got.map(view), [
    'stage:G2:null',
    'close:G2:a',
    'room:N03:null',
    'board:board:null',
    'stage:G4:null',
    'close:G4:null', // sân G4 chưa có khách → cận idol
    'room:S2:null',
    'board:board:null',
    'stage:G2:null',
    'close:G2:b',
  ]);
  assert.deepEqual(got.slice(0, 4).map((s) => s.durMs), [8000, 5000, 6000, 4000]);
  assert.ok(got.every((s) => s.kind === 'idle' && s.gifter === null));
});

test('IdleCycle: không có phòng của người xem thì bỏ qua cảnh phòng', () => {
  const c = new IdleCycle();
  const info = { clubs: [1], guests: {}, rooms: [] };
  const got = [0, 1, 2, 3].map((t) => view(c.next(t, info)));
  assert.deepEqual(got, ['stage:G1:null', 'close:G1:null', 'board:board:null', 'stage:G1:null']);
});

test('IdleCycle: chưa club nào hoạt động → xoay 1..5', () => {
  const c = new IdleCycle();
  const stages = [];
  for (let i = 0; i < 18; i++) {
    const s = c.next(i, {});
    if (s.view === 'stage') stages.push(s.target);
  }
  assert.deepEqual(stages, ['G1', 'G2', 'G3', 'G4', 'G5', 'G1']);
});

test('IdleCycle: club mới có hoạt động chen lên trước club đã ghé', () => {
  const c = new IdleCycle();
  const rooms = [];
  const stageOf = (clubs) => {
    for (;;) {
      const s = c.next(0, { clubs, rooms });
      if (s.view === 'stage') return s.target;
    }
  };
  assert.equal(stageOf([3, 1]), 'G3');
  assert.equal(stageOf([5, 3, 1]), 'G5'); // club 5 vừa hoạt động, chưa ghé
  assert.equal(stageOf([5, 3, 1]), 'G1');
  assert.equal(stageOf([5, 3, 1]), 'G3');
});

test('IdleCycle: mỗi 2 phút chèn 1 cảnh lát sàn 3 giây rồi đi tiếp đúng vòng', () => {
  const c = new IdleCycle();
  const info = { clubs: [2, 4], guests: {}, rooms: ['N03'] };
  assert.equal(view(c.next(0, info)), 'stage:G2:null');
  assert.equal(view(c.next(119999, info)), 'close:G2:null');
  const slice = c.next(120000, info);
  assert.deepEqual([slice.view, slice.target, slice.durMs, slice.kind], ['slice', 'G2', 3000, 'idle']);
  assert.equal(view(c.next(120001, info)), 'room:N03:null');
  assert.equal(view(c.next(130000, info)), 'board:board:null');
  // lát sàn ngay đầu vòng mới → lát sàn sân của club sắp quay
  assert.equal(view(c.next(240000, info)), 'slice:G4:null');
  assert.equal(view(c.next(240001, info)), 'stage:G4:null');
  assert.equal(view(c.next(359999, info)), 'close:G4:null');
  assert.equal(view(c.next(360000, info)), 'slice:G4:null');
});

test('IdleCycle: nhận guests dạng Map', () => {
  const c = new IdleCycle();
  const info = { clubs: [1], guests: new Map([[1, ['m']]]), rooms: [] };
  c.next(0, info);
  assert.equal(c.next(1, info).focus, 'm');
});

// ───────── lưu / khôi phục buổi LIVE ─────────

test('Director toJSON/fromJSON: giữ cảnh đang quay, hàng chờ, trần mỗi người và lượt PK', () => {
  const opts = { camCapMs: 30000 };
  const d = new Director(opts);
  d.push(shot('room', 'N01', 'x', 30000), 0);
  d.tick(0, ctx());
  d.push(shot('big', 'G1', 'y', 15000, { label: 'Sư tử' }), 1000);
  d.push(shot('role', 'G3', 'z', 20000), 2000);

  const copy = Director.fromJSON(JSON.parse(JSON.stringify(d)), opts);
  assert.deepEqual(copy.current, d.current);
  assert.deepEqual(copy.queue, d.queue);
  assert.equal(copy.queue[0].label, 'Sư tử'); // trường thêm được giữ
  assert.equal(copy.push(shot('room', 'N02', 'x', 30000), 3000), 'capped'); // nhớ trần của x
  assert.deepEqual(copy.tick(8000, ctx()), d.tick(8000, ctx()));
  // id mới không trùng id cũ
  copy.push(shot('room', 'N09', 'w', 30000), 9000);
  const ids = [copy.current.id, ...copy.queue.map((s) => s.id)];
  assert.equal(new Set(ids).size, ids.length);
});

test('Director toJSON/fromJSON: PK tiếp tục xen kẽ đúng sân sau khi tải lại trang', () => {
  const d = new Director();
  const pk = { a: 1, b: 3 };
  assert.equal(d.tick(0, ctx({ pk })).target, 'G1');
  const copy = Director.fromJSON(JSON.parse(JSON.stringify(d)));
  assert.equal(copy.tick(8000, ctx({ pk })).target, 'G3');
});

test('Director.fromJSON: bản lưu hỏng thì bỏ phần hỏng, không ném lỗi', () => {
  assert.equal(Director.fromJSON(null).current, null);
  const d = Director.fromJSON({ current: { kind: 'big' }, queue: [null, { kind: 'big' }, 5], reserve: 'x', pkSide: 7 });
  assert.equal(d.current, null);
  assert.deepEqual(d.queue, []);
  assert.equal(d.push(shot('room', 'N01', 'x', 90000), 0), 'queued');
});

test('IdleCycle toJSON/fromJSON: đi tiếp đúng vòng như chưa tải lại', () => {
  const info = { clubs: [2, 4], guests: { 2: ['a', 'b'], 4: ['c'] }, rooms: ['N03'] };
  const a = new IdleCycle();
  for (let i = 0; i < 6; i++) a.next(i * 1000, info);
  const b = IdleCycle.fromJSON(JSON.parse(JSON.stringify(a)));
  for (let i = 6; i < 16; i++) assert.deepEqual(b.next(i * 1000, info), a.next(i * 1000, info));
  // lát sàn vẫn theo mốc cũ
  assert.equal(b.next(120000, info).view, 'slice');
  assert.equal(IdleCycle.fromJSON('hong').next(0, {}).target, 'G1');
});

// ───────── chốt 03/11/2026 (3 chỗ spec mâu thuẫn do agent đạo diễn nêu) ─────────

test('A: cảnh vé chờ vì PK không bị tính hạn 45 giây — PK 90 giây xong vẫn lên sóng', () => {
  // Arrange
  const d = new Director();
  const pk = { a: 1, b: 3 };
  d.tick(0, ctx({ pk }));
  d.push(shot('room', 'N01', 'x', 30000), 1000);
  // Act — PK chạy 90 giây, tick mỗi 0,5 giây như overlay
  for (let t = 500; t <= 90000; t += 500) d.tick(t, ctx({ pk }));
  // Assert — vé vẫn còn trong hàng, PK xong thì lên sóng
  assert.deepEqual(targets(d), ['N01']);
  assert.equal(d.tick(98000, ctx()).target, 'N01');
});

test('A: hết PK thì hạn 45 giây của cảnh chờ chạy tiếp từ chỗ dừng', () => {
  const d = new Director();
  const pk = { a: 1, b: 3 };
  d.tick(0, ctx({ pk }));
  d.push(shot('room', 'N01', 'x', 30000), 0);
  for (let t = 500; t <= 60000; t += 500) d.tick(t, ctx({ pk }));
  // cảnh đang quay chiếm sóng 60 giây sau PK → cảnh vé chờ thêm quá 45 giây thì bị bỏ
  d.push(shot('big', 'G2', 'y', 60000), 60500);
  for (let t = 60500; t <= 110000; t += 500) d.tick(t, ctx());
  assert.deepEqual(targets(d), []);
});

test('B: Gala đang chờ không bị bỏ vì quá 45 giây', () => {
  const d = new Director();
  d.push(shot('gala', 'G1', 'a', 60000), 0);
  d.tick(0, ctx());
  d.push(shot('gala', 'G2', 'b', 60000), 1000);
  d.push(shot('gala', 'G3', 'c', 60000), 2000);
  // Gala a rút còn 30 giây, Gala b (30 giây vì c chờ) → Gala c chờ ~58 giây
  let cur;
  for (let t = 500; t <= 61000; t += 500) cur = d.tick(t, ctx());
  assert.equal(cur.target, 'G3');
  assert.equal(cur.kind, 'gala');
});

test('C: cảnh rảnh bị cảnh sự kiện cắt ngay, không chờ 8 giây', () => {
  const d = new Director();
  const cyc = new IdleCycle();
  const idleNext = (now) => cyc.next(now, { clubs: [2], guests: {}, rooms: [] });
  d.tick(0, ctx({ idleNext }));
  d.push(shot('big', 'G4', 'z', 15000), 1000);
  const s = d.tick(1000, ctx({ idleNext }));
  assert.deepEqual([s.kind, s.target, s.startAt], ['big', 'G4', 1000]);
});
