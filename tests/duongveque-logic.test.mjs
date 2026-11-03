import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, metersFor, pickAction, resolveGift, sideFromComment, ACTIONS } from '../public/games/duongveque/logic.js';
import { ROUTE, provinceAt, provinceIndex, rangesOf } from '../public/games/duongveque/route.js';

const A = { id: 'a', name: 'An' }, B = { id: 'b', name: 'Bình' };
const run = (g, sec, dt = 0.05) => { for (let t = 0; t < sec; t += dt) g.step(dt); };
// số mét/xu cố định cho test (mặc định game có thể đổi khi cân lại)
const M25 = { meterPerCoin: 2.5, minMeters: 5 };
// test luật cơ bản: tắt lộ trình (trạm dừng, CSGT, tình huống) — có test riêng bên dưới
const NOPLAN = { restStop: false, gasStop: false, police: false, roadEvents: 0 };
const race = (opts = {}) => { const g = createGame(Object.assign({ autoPilot: false, lobbySec: 0.05 }, M25, NOPLAN, opts), () => 0.99); run(g, 0.1); assert.equal(g.phase, 'race'); g.drainEvents(); return g; };

test('mét theo xu: tuyến tính, có tối thiểu', () => {
  assert.equal(metersFor(1, M25), 5);
  assert.equal(metersFor(100, M25), 250);
  assert.equal(metersFor(0, M25), 5);
  assert.equal(metersFor(1), 15);      // mặc định: 5 m/xu, tối thiểu 15 m (xe chạy 100 km/h)
  assert.equal(metersFor(100), 500);
});

test('quà chưa gán chọn hành động theo bậc giá của phe', () => {
  assert.equal(pickAction('cuu', 1), 'wind');
  // thang giá 1–199 xu: trò hoành tráng nhất ở 149–199 xu, quà to hơn vẫn ra trò cao nhất
  assert.equal(pickAction('cuu', 4), 'fuel');
  assert.equal(pickAction('cuu', 5), 'creditor');
  assert.equal(pickAction('cuu', 20), 'helmet');
  assert.equal(pickAction('cuu', 99), 'tow');
  assert.equal(pickAction('cuu', 149), 'heli');
  assert.equal(pickAction('cuu', 199), 'superman');
  assert.equal(pickAction('cuu', 5000), 'superman');
  assert.equal(pickAction('pha', 1), 'banana');
  assert.equal(pickAction('pha', 10), 'dog');
  assert.equal(pickAction('pha', 30), 'croc');
  assert.equal(pickAction('pha', 99), 'container');
  assert.equal(pickAction('pha', 149), 'tornado');
  assert.equal(pickAction('pha', 199), 'zombie');
  for (const a of ACTIONS) assert.ok(a.min < 200 || a.min === Infinity, `${a.id} phải dưới 200 xu`);
  for (const a of ACTIONS) assert.ok(['cuu', 'pha'].includes(a.side));
});

test('gán quà: khớp id trước, rồi tên đúng cả chuỗi; không khớp → phe người tặng', () => {
  const map = { nitro: [{ giftId: '5879', giftName: 'Doughnut' }], ducks: [{ giftId: '5585', giftName: 'Confetti', names: ['Pháo hoa giấy'] }] };
  assert.deepEqual(resolveGift({ giftId: 5879, coins: 30 }, map, null), { action: 'nitro', side: 'cuu', mapped: true });
  assert.equal(resolveGift({ giftName: 'pháo hoa giấy', coins: 100 }, map, null).action, 'ducks');
  assert.equal(resolveGift({ giftName: 'Pháo hoa', coins: 149 }, map, null).action, 'heli'); // không "chứa" là khớp
  assert.equal(resolveGift({ giftId: 1, coins: 149 }, map, 'pha').action, 'tornado');
});

test('bình luận chọn phe', () => {
  assert.equal(sideFromComment('1'), 'cuu');
  assert.equal(sideFromComment('Cứu'), 'cuu');
  assert.equal(sideFromComment('P'), 'pha');
  assert.equal(sideFromComment('phá!'), 'pha');
  assert.equal(sideFromComment('chào cả nhà'), null);
});

test('mặc định ≈ 100 km/h, đường về quê 6 km', () => {
  const g = createGame();
  assert.equal(Math.round(g.cfg.speed * 3.6), 100);
  assert.equal(g.cfg.goal, 6000);
});

test('xe tự chạy khi còn xăng, xăng tụt dần', () => {
  const g = race({ speed: 10, fuelBurn: 2 });
  run(g, 5);
  assert.ok(Math.abs(g.dist - 50) < 1.5, `dist=${g.dist}`);
  assert.ok(g.fuel < 92 && g.fuel > 88);
});

test('quà Cứu và quà Phá cùng giá triệt tiêu nhau', () => {
  const g1 = race({ fuelBurn: 0, speed: 9 }), g2 = race({ fuelBurn: 0, speed: 9 });
  g1.gift(A, { action: 'wind', coins: 10 });
  g1.gift(B, { action: 'rain', coins: 10 });
  run(g1, 8); run(g2, 8);
  assert.ok(Math.abs(g1.dist - (g2.dist - 8 * 9 * 0.45 * (6 / 8))) < 6, `${g1.dist} vs ${g2.dist}`); // mưa còn làm chậm 6 giây
  const g3 = race({ fuelBurn: 0, speed: 0.0001 });
  g3.gift(A, { action: 'wind', coins: 40 });
  g3.gift(B, { action: 'pothole', coins: 40 });
  run(g3, 14); // vật cản rơi cách 60 m, trôi tới 6 m/giây
  assert.ok(g3.dist < 3, `dist=${g3.dist}`);
});

test('tặng ×N chạy đủ: gộp xu, vỏ chuối rải tối đa 10 cái', () => {
  const g = race({ fuelBurn: 0, speed: 0.0001 });
  g.gift(A, { action: 'wind', coins: 1, count: 20 });
  run(g, 2);
  assert.ok(Math.abs(g.dist - metersFor(20, M25)) < 1, `dist=${g.dist}`);
  g.gift(B, { action: 'banana', coins: 1, count: 30 });
  assert.equal(g.obstacles.length, 10);
  assert.equal(g.totals.pha, 30);
});

test('NHẢY né vỏ chuối; không nhảy thì bị lùi', () => {
  const g = race({ fuelBurn: 0, speed: 10 });
  g.gift(B, { action: 'banana', coins: 1 });
  const o = g.obstacles[0];
  o.gap = 2;
  g.input('jump');
  run(g, 1);
  assert.ok(g.drainEvents().some(e => e.type === 'dodge'));
  g.gift(B, { action: 'banana', coins: 1 });
  g.obstacles[0].gap = 1;
  run(g, 0.3);
  assert.ok(g.drainEvents().some(e => e.type === 'hit'));
});

test('vật cản giá cao không né được bằng nhảy', () => {
  const g = race({ fuelBurn: 0 });
  g.gift(B, { action: 'pothole', coins: 50 });
  g.obstacles[0].gap = 1;
  g.input('jump');
  run(g, 0.3);
  const ev = g.drainEvents();
  assert.ok(ev.some(e => e.type === 'hit') && !ev.some(e => e.type === 'dodge'));
});

test('mũ bảo hiểm chặn cú phá đúng bằng giá trị của nó', () => {
  const g = race({ fuelBurn: 0, speed: 0.0001 });
  g.gift(A, { action: 'helmet', coins: 100 });
  assert.equal(g.shield, 250);
  g.gift(B, { action: 'dog', coins: 40 }); // 100 m
  assert.equal(g.shield, 150);
  assert.ok(g.drainEvents().some(e => e.type === 'shieldBlock'));
});

test('xe container đẩy lùi; HÚC đúng lúc giảm một nửa và ném người tặng vào thùng rác', () => {
  const g = race({ fuelBurn: 0, speed: 0.0001 });
  g.dist = 1000;
  g.gift(B, { action: 'container', coins: 100 }); // 250 m
  run(g, 1.6);
  assert.equal(g.exclusive.stage, 'push');
  g.input('ram');
  run(g, 4);
  const ev = g.drainEvents();
  const hit = ev.find(e => e.type === 'ramHit');
  assert.ok(hit && hit.kind === 'container' && hit.user.id === 'b');
  assert.ok(g.dist > 1000 - 250 && g.dist < 1000 - 60, `dist=${g.dist}`);
  assert.ok(g.ramCd > 0);
  assert.equal(g.input('ram'), false); // đang hồi chiêu
});

test('đàn vịt chặn đường; HÚC dẹp ngay', () => {
  const g = race({ fuelBurn: 0, speed: 10 });
  g.gift(B, { action: 'ducks', coins: 1 });
  run(g, 1);
  assert.equal(g.speed, 0);
  g.input('ram');
  run(g, 0.1);
  assert.ok(g.speed > 0);
});

test('lốc xoáy: phe Cứu gom đủ xu trong 10 giây thì thoát', () => {
  const g = race({ fuelBurn: 0, speed: 0.0001 });
  g.dist = 1500;
  g.gift(B, { action: 'tornado', coins: 1000 });
  run(g, 1);
  assert.ok(g.rescue && g.rescue.need === 300);
  g.gift(A, { action: 'wind', coins: 300 });
  run(g, 3);
  const ev = g.drainEvents();
  const r = ev.find(e => e.type === 'rescued');
  assert.ok(r && r.heroes[0].id === 'a');
  assert.ok(g.dist >= 1500);
});

test('lốc xoáy: không ai cứu thì bị hất lùi', () => {
  const g = race({ fuelBurn: 0, speed: 0.0001 });
  g.dist = 1500;
  g.gift(B, { action: 'tornado', coins: 100 }); // 250 m
  run(g, 13);
  assert.ok(g.drainEvents().some(e => e.type === 'rescueFail'));
  assert.ok(Math.abs(g.dist - 1250) < 2, `dist=${g.dist}`);
});

test('hết xăng: 10 giây báo động rồi dắt bộ; đổ xăng thì chạy lại', () => {
  const g = race({ fuelBurn: 50, speed: 10, walkSpeed: 1 });
  run(g, 2.2);
  assert.ok(g.fuelAlarm);
  run(g, 10.5);
  assert.ok(g.walking);
  assert.ok(Math.abs(g.speed - 1) < 1e-9);
  g.share(A);
  run(g, 0.1);
  assert.equal(g.walking, false);
  assert.equal(g.speed, 10);
});

test('về tới quê → Cứu thắng; hết giờ → Phá thắng; 30 giây cuối ×2', () => {
  const g = race({ goal: 300, fuelBurn: 0, speed: 0.0001, roundSec: 60 });
  g.gift(A, { action: 'wind', coins: 200 });
  run(g, 2);
  assert.equal(g.phase, 'race', 'về cổng làng: đếm ngược 15 giây trước khi thắng');
  assert.ok(g.finish && g.finish.left > 12);
  run(g, 14);
  assert.equal(g.phase, 'result');
  assert.equal(g.result.winner, 'cuu');
  assert.equal(g.result.topCuu[0].id, 'a');

  const h = race({ fuelBurn: 0, speed: 1, roundSec: 40, finalSec: 30 });
  run(h, 11);
  assert.ok(h.drainEvents().some(e => e.type === 'final'));
  h.gift(A, { action: 'helmet', coins: 10 });
  assert.equal(h.shield, 50); // 25 × 2
  run(h, 30);
  assert.equal(h.result.winner, 'pha');
});

test('quà lúc chờ ván không mất: chạy khi ván bắt đầu', () => {
  const g = createGame({ autoPilot: false, lobbySec: 1, ...M25, ...NOPLAN }, () => 0.5);
  g.gift(A, { action: 'helmet', coins: 10 });
  assert.equal(g.pending.length, 1);
  run(g, 1.1);
  assert.equal(g.phase, 'race');
  assert.equal(g.shield, 25);
  assert.equal(g.totals.cuu, 10);
});

test('phản bội: đang Cứu mà tặng Phá', () => {
  const g = race();
  g.gift(A, { action: 'wind', coins: 1 });
  g.gift(A, { action: 'banana', coins: 1 });
  assert.ok(g.drainEvents().some(e => e.type === 'betray' && e.user.id === 'a'));
});

test('tim cả phòng: đủ likePer → gió + xăng', () => {
  const g = race({ fuelBurn: 0, speed: 0.0001, likePer: 100, likeFuel: 6 });
  g.fuel = 50;
  g.like(A, 250);
  run(g, 1);
  assert.equal(g.fuel, 62);
  assert.ok(g.dist >= 9.9);
  assert.equal(g.likeAcc, 50);
});

test('tự lái (AI) né được một phần vật cản và tự húc', () => {
  let s = 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const g = createGame({ autoPilot: true, lobbySec: 0.05, fuelBurn: 0, ...M25, ...NOPLAN }, rnd);
  run(g, 0.1);
  let dodge = 0, hit = 0, ram = 0;
  for (let i = 0; i < 40; i++) {
    g.gift(B, { action: 'banana', coins: 1 });
    if (i % 4 === 0) g.gift(B, { action: 'dog', coins: 5 });
    run(g, 3);
    for (const e of g.drainEvents()) { if (e.type === 'dodge') dodge++; if (e.type === 'hit') hit++; if (e.type === 'ramHit') ram++; }
  }
  assert.ok(dodge > 8 && hit > 8, `dodge=${dodge} hit=${hit}`);
  assert.ok(ram > 0);
});

test('tài xế: quà lên lái 3 phút, người sau xếp hàng, hết giờ thì đổi', () => {
  const g = race({ fuelBurn: 0 });
  const C = { id: 'c', name: 'Chi' };
  g.gift(A, { action: 'driver', coins: 99 });
  assert.equal(g.driver.id, 'a');
  assert.equal(g.driver.left, 180);
  g.gift(B, { action: 'driver', coins: 99 });
  g.gift(C, { action: 'driver', coins: 99 });
  assert.equal(g.driver.id, 'a');
  assert.deepEqual(g.driverQueue.map(q => q.user.id), ['b', 'c']);
  g.step(0.1); for (let i = 0; i < 1800; i++) g.step(0.1);
  assert.equal(g.driver.id, 'b');
  assert.deepEqual(g.driverQueue.map(q => q.user.id), ['c']);
});

test('tài xế: hết giờ mà không ai chờ thì người đang lái giữ nguyên, quà mới thay ngay', () => {
  const g = race({ fuelBurn: 0, roundSec: 9999, driverSec: 5 });
  g.gift(A, { action: 'driver', coins: 99 });
  for (let i = 0; i < 70; i++) g.step(0.1);
  assert.equal(g.driver.id, 'a');
  assert.equal(g.driver.free, true);
  assert.ok(g.drainEvents().some(e => e.type === 'driverHold'));
  g.gift(B, { action: 'driver', coins: 99 });
  assert.equal(g.driver.id, 'b');
  assert.equal(g.driver.free, false);
});

test('tài xế: chính mình tặng thêm thì cộng giờ; ×2 = 6 phút; quà chưa gán không bao giờ thành tài xế', () => {
  const g = race({ fuelBurn: 0 });
  g.gift(A, { action: 'driver', coins: 99, count: 2 });
  assert.equal(g.driver.left, 360);
  g.gift(A, { action: 'driver', coins: 99 });
  assert.equal(g.driver.left, 540);
  for (const c of [1, 99, 5000, 1e9]) assert.notEqual(pickAction('cuu', c), 'driver');
});

test('hành khách: phe Cứu lên xe, đổi sang Phá thì xuống, tài xế không chiếm ghế, dư ghế đếm +N', () => {
  const g = race({ seats: 2, maxCars: 1 });
  g.comment(A, '1');
  g.gift(B, { action: 'wind', coins: 5 });
  g.comment({ id: 'c', name: 'Chi' }, '1');
  let p = g.passengers();
  assert.deepEqual(p.seated.map(u => u.id), ['b', 'a']);   // xu Cứu cao ngồi trước
  assert.equal(p.extra, 1);
  g.comment(A, '2');
  p = g.passengers();
  assert.ok(!p.seated.some(u => u.id === 'a'));
  g.gift({ id: 'c', name: 'Chi' }, { action: 'driver', coins: 99 });
  assert.ok(!g.passengers().seated.some(u => u.id === 'c'));
});

test('quà có số xu vô hạn/không hợp lệ không làm thắng ngay (lỗi nút thử quà tài xế)', () => {
  const g = race({ fuelBurn: 0, speed: 0.0001 });
  g.gift(A, { action: 'driver', coins: Infinity });
  g.gift(B, { action: 'wind', coins: NaN });
  for (let i = 0; i < 30; i++) g.step(0.1);
  assert.equal(g.phase, 'race');
  assert.ok(Number.isFinite(g.totals.cuu) && g.totals.cuu <= 1e6);
});

test('tài xế: tặng lúc đang chờ ván thì nhận lái ngay, xu và cú đẩy chạy khi ván bắt đầu (không nhân đôi giờ lái)', () => {
  const g = createGame({ autoPilot: false, lobbySec: 1, ...M25, ...NOPLAN }, () => 0.5);
  g.gift(A, { action: 'driver', coins: 99 });
  assert.equal(g.phase, 'lobby');
  assert.equal(g.driver && g.driver.id, 'a');
  for (let i = 0; i < 12; i++) g.step(0.1);
  assert.equal(g.phase, 'race');
  assert.equal(g.totals.cuu, 99);
  assert.ok(g.driver.left > 178 && g.driver.left <= 180, `left=${g.driver.left}`);
  assert.equal(g.driverQueue.length, 0);
});

test('bị đẩy lùi quá vạch xuất phát tới bến xe → phe Phá thắng ngay; lùi chưa tới bến thì vẫn chạy', () => {
  const g = race({ fuelBurn: 0, speed: 0.0001, goal: 6000, backFloor: 0.25 });   // bến xe ở −1.500 m
  g.gift(B, { action: 'container', coins: 400 });   // −1.000 m: chưa tới bến
  for (let i = 0; i < 60; i++) g.step(0.1);
  assert.equal(g.phase, 'race');
  assert.ok(g.dist < -900 && g.dist > -1100, `dist=${g.dist}`);
  g.gift(B, { action: 'container', coins: 400 });   // thêm −1.000 m → quá bến xe
  for (let i = 0; i < 60; i++) g.step(0.1);
  assert.equal(g.phase, 'result');
  assert.equal(g.result.winner, 'pha');
  assert.equal(g.result.reason, 'depot');
});

test('LIVE nhiều giờ: danh sách lên xe có trần, người xem cũ được dọn đầu ván, tài xế và người trên xe giữ lại', () => {
  const g = createGame({ autoPilot: false, lobbySec: 0.05, resultSec: 0.05, maxRiders: 50, maxUsers: 100, ...M25, ...NOPLAN }, () => 0.5);
  for (let i = 0; i < 400; i++) g.comment({ id: 'v' + i, name: 'v' + i }, '1');
  assert.equal(g.riders.length, 50);
  assert.ok(g.riders.includes('v399') && !g.riders.includes('v0'));
  g.gift({ id: 'v0', name: 'v0' }, { action: 'driver', coins: 99 });
  for (let i = 0; i < 3; i++) g.step(0.1);          // vào ván → dọn
  assert.equal(g.phase, 'race');
  assert.ok(g.users.size <= 51, `users=${g.users.size}`);
  assert.ok(g.users.has('v0') && g.users.has('v399'));
  assert.equal(g.passengers().total, 50 - (g.riders.includes('v0') ? 1 : 0));
});

// ---------------- đoàn xe + lộ trình về quê ----------------
const PLAN = (o = {}) => { const g = createGame(Object.assign({ autoPilot: false, lobbySec: 0.05, ...M25, fuelBurn: 0, restStop: false, gasStop: false, police: false, roadEvents: 0 }, o), () => 0.5); for (let i = 0; i < 2; i++) g.step(0.05); g.drainEvents(); return g; };

test('đoàn xe: đầy ghế thì nối thêm xe, tối đa maxCars, dư nữa mới +N', () => {
  const g = PLAN({ seats: 4, maxCars: 3 });
  for (let i = 0; i < 4; i++) g.comment({ id: 'v' + i, name: 'v' + i }, '1');
  assert.equal(g.passengers().cars, 1);
  g.comment({ id: 'v4', name: 'v4' }, '1');
  assert.equal(g.passengers().cars, 2);
  for (let i = 5; i < 15; i++) g.comment({ id: 'v' + i, name: 'v' + i }, '1');
  const p = g.passengers();
  assert.equal(p.cars, 3);
  assert.equal(p.seated.length, 12);
  assert.equal(p.extra, 3);
});

test('trạm dừng chân: xe dừng, ĐỒNG HỒ VÁN DỪNG, quà lúc dừng tính xu ngay và chạy khi xe đi tiếp', () => {
  const g = PLAN({ restStop: true, restAt: 0.1, restSec: 30, goal: 6000, speed: 30 });
  g.dist = 650;                         // quá 600 m
  g.step(0.05);
  assert.equal(g.halt && g.halt.kind, 'rest');
  assert.ok(g.drainEvents().some(e => e.type === 'halt' && e.kind === 'rest' && e.pauseClock));
  const t0 = g.timeLeft, d0 = g.dist;
  g.gift(A, { action: 'helmet', coins: 10 });
  assert.equal(g.totals.cuu, 10);
  assert.equal(g.shield, 0);            // chưa chạy hành động
  for (let i = 0; i < 200; i++) g.step(0.1);   // 20 giây
  assert.equal(g.timeLeft, t0);
  assert.equal(g.dist, d0);
  for (let i = 0; i < 110; i++) g.step(0.1);   // hết 30 giây
  assert.equal(g.halt, null);
  assert.equal(g.shield, 25);
  assert.ok(g.drainEvents().some(e => e.type === 'haltEnd' && e.kind === 'rest'));
  for (let i = 0; i < 10; i++) g.step(0.1);
  assert.ok(g.dist > d0 && g.timeLeft < t0);
});

test('trạm xăng: đổ đầy bình, dừng 15 giây rồi đi; mỗi trạm chỉ 1 lần/ván', () => {
  const g = PLAN({ gasStop: true, gasAt: 0.5, gasSec: 15, goal: 2000, speed: 20 });
  g.fuel = 12; g.dist = 1001;
  g.step(0.05);
  assert.equal(g.halt.kind, 'gas');
  assert.equal(g.fuel, 100);
  for (let i = 0; i < 160; i++) g.step(0.1);
  assert.equal(g.halt, null);
  g.dist = 1001; g.step(0.05);
  assert.equal(g.halt, null);
});

test('CSGT: đồng hồ ván dừng, đủ 2000 tim (hoặc quà Cứu 1 xu = 10 tim) mới được đi; quá giờ thì nộp phạt lùi 150 m', () => {
  const g = PLAN({ goal: 6000, roundSec: 999 });
  g.dist = 2000;
  assert.equal(g.triggerEvent('police'), true);
  const t0 = g.timeLeft;
  g.like(A, 1500);
  for (let i = 0; i < 20; i++) g.step(0.1);
  assert.equal(g.halt.kind, 'police');
  assert.equal(g.timeLeft, t0);
  g.gift(B, { action: 'wind', coins: 50 });   // +500 tim
  g.step(0.05);
  assert.equal(g.halt, null);
  const end = g.drainEvents().find(e => e.type === 'haltEnd');
  assert.equal(end.how, 'likes');
  assert.equal(end.helpers[0].id, 'a');
  // quá giờ
  assert.equal(g.triggerEvent('police'), true);
  const d1 = g.dist;
  for (let i = 0; i < 460; i++) g.step(0.1);
  assert.equal(g.halt, null);
  const ev = g.drainEvents();
  assert.ok(ev.some(e => e.type === 'haltEnd' && e.how === 'timeout') && ev.some(e => e.type === 'fine'));
  assert.ok(g.pushes.some(p => p.kind === 'fine' && p.side === 'pha' && Math.abs(p.m - 150) < 1e-9));
  void d1;
});

test('quà Phá lúc bị CSGT giữ không tính tim, vẫn chạy khi xe đi tiếp', () => {
  const g = PLAN({ goal: 6000, roundSec: 999, policeLikes: 100 });
  g.dist = 3000;
  g.triggerEvent('police');
  g.gift(B, { action: 'wind', coins: 1 });
  g.gift(A, { action: 'container', coins: 100 });   // phe Phá (container) — không tính tim
  assert.equal(g.halt.got, 10);
  g.like(A, 90);
  g.step(0.05);
  assert.equal(g.halt, null);
  const st = g.drainEvents().find(e => e.type === 'stash');
  assert.ok(st && st.n === 2 && st.net < 0, JSON.stringify(st));
  assert.ok(g.pushes.some(p => p.kind === 'stash' && p.side === 'pha'));
});

test('lộ trình: trạm dừng + trạm xăng + CSGT + tình huống đúng chặng, không chồng nhau, mỗi ván làm lại', () => {
  let s = 3; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const g = createGame({ autoPilot: false, lobbySec: 0.05, resultSec: 0.05, policeChance: 1, roadEvents: 3 }, rnd);
  for (let r = 0; r < 20; r++) {
    for (let i = 0; i < 3 && g.phase !== 'race'; i++) g.step(0.05);
    const kinds = g.plan.map(x => x.kind);
    assert.ok(kinds.includes('rest') && kinds.includes('gas') && kinds.includes('police'), kinds.join());
    assert.ok(g.plan.length >= 5 && g.plan.length <= 6);
    for (let i = 1; i < g.plan.length; i++) assert.ok(g.plan[i].at - g.plan[i - 1].at > 250);
    const at = k => { const x = g.plan.find(y => y.kind === k); return x ? provinceAt(x.at, 6000).name : null; };
    if (at('jam')) assert.ok(['TP. Hồ Chí Minh', 'Hà Nội'].includes(at('jam')), at('jam'));
    if (at('photo')) assert.ok(['Đà Nẵng', 'Huế', 'Quảng Ninh', 'Lào Cai'].includes(at('photo')), at('photo'));
    if (at('lixi')) assert.ok(['Cao Bằng', 'Tuyên Quang'].includes(at('lixi')), at('lixi'));
    g.forceEnd('cuu');
  }
});

test('tình huống: chắn tàu dừng 7 giây (đồng hồ dừng), kẹt xe làm chậm, thủng lốp thả tim bơm, lì xì cho xăng + đẩy tới', () => {
  const g = PLAN({ goal: 6000, roundSec: 999, speed: 20 });
  g.triggerEvent('train');
  for (let i = 0; i < 60; i++) g.step(0.1);
  assert.equal(g.halt.kind, 'train');
  for (let i = 0; i < 15; i++) g.step(0.1);
  assert.equal(g.halt, null);
  g.triggerEvent('jam'); g.step(0.1);
  assert.ok(Math.abs(g.speed - 6) < 1e-9);
  for (let i = 0; i < 110; i++) g.step(0.1);
  g.triggerEvent('flat');
  g.like(A, 600); g.step(0.05);
  assert.equal(g.halt, null);
  g.fuel = 10; const d = g.dist;
  g.triggerEvent('lixi');
  for (let i = 0; i < 20; i++) g.step(0.1);
  assert.ok(g.fuel >= 36 && g.dist > d + 100);
});

test('tuyến Cà Mau → Hà Giang: đủ 34 tỉnh/thành sau sắp xếp 2025, không trùng, đầu Cà Mau cuối Tuyên Quang (Hà Giang)', () => {
  assert.equal(ROUTE.length, 34);
  assert.equal(new Set(ROUTE.map(p => p.name)).size, 34);
  assert.equal(ROUTE[0].name, 'Cà Mau');
  assert.ok(ROUTE[33].old.includes('Hà Giang'));
  // 63 tỉnh cũ = 34 tỉnh mới + các tỉnh cũ đã gộp vào
  const all = new Set(ROUTE.flatMap(p => [p.name === 'TP. Hồ Chí Minh' ? 'TP. Hồ Chí Minh' : p.name, ...p.old]));
  assert.equal(all.size, 63);
  for (const p of ROUTE) assert.ok(p.landmark && p.icon && p.biome, p.name);
  assert.equal(provinceAt(-500, 6000).name, 'Cà Mau');
  assert.equal(provinceAt(6000, 6000).name, 'Tuyên Quang');
  assert.equal(provinceIndex(3000, 6000), 17);
  assert.deepEqual(rangesOf(['Hà Nội']).length, 1);
});

test('bị đẩy vọt qua điểm dừng quá 300 m (vd quà trực thăng) thì bỏ qua điểm đó, không dừng sai chỗ', () => {
  const g = PLAN({ restStop: true, restAt: 0.4, gasStop: true, gasAt: 0.7, goal: 6000, speed: 20 });
  g.dist = 4300;                // đã qua trạm dừng (2.400) và trạm xăng (4.200) ... trạm xăng chỉ qua 100 m
  g.step(0.05);
  assert.equal(g.halt && g.halt.kind, 'gas');
  assert.ok(g.plan.find(x => x.kind === 'rest').done);
});

test('CSGT có lý do: chở quá số người (ngồi trên nóc) / kiểm tra giấy tờ', () => {
  const g = PLAN({ seats: 14, windowSeats: 6, maxCars: 1 });
  for (let i = 0; i < 5; i++) g.comment({ id: 'v' + i, name: 'v' + i }, '1');
  g.triggerEvent('police');
  assert.equal(g.halt.reason, 'papers');
  g.like(A, 2000); g.step(0.05);
  for (let i = 5; i < 10; i++) g.comment({ id: 'v' + i, name: 'v' + i }, '1');
  g.triggerEvent('police');
  assert.equal(g.halt.reason, 'overload');
  assert.equal(g.halt.over, 5);   // 10 người bình luận + A (thả tim cũng lên xe) − 6 ghế cửa sổ
});

test('bắn tốc độ: được đẩy vọt quá 150 km/h ≥ 1,5 giây thì có thể bị CSGT bắt ngay (1 lần/ván), cú đẩy chỉ tạm dừng', () => {
  const g = createGame({ autoPilot: false, lobbySec: 0.05, ...M25, fuelBurn: 0, restStop: false, gasStop: false, police: true, policeChance: 0, roadEvents: 0, speedTrap: 1 }, () => 0.1);
  for (let i = 0; i < 2; i++) g.step(0.05);
  g.gift(A, { action: 'nitro', coins: 1000 });      // 2.500 m trong ~5 giây ≈ 1.800 km/h
  for (let i = 0; i < 25 && !g.halt; i++) g.step(0.1);
  assert.equal(g.halt && g.halt.kind, 'police');
  assert.equal(g.halt.reason, 'speed');
  assert.ok(g.halt.kmh > 150);
  const left = g.pushes.reduce((s, p) => s + p.m * (1 - p.t / p.dur), 0);
  assert.ok(left > 100, `left=${left}`);             // phần đẩy còn lại vẫn giữ, chạy tiếp sau khi được thả
  g.like(A, 2000); g.step(0.05);
  for (let i = 0; i < 80; i++) g.step(0.1);
  assert.equal(g.halt, null);                        // không bị bắt lần 2 trong ván
});

test('quãng đường tự theo thời gian ván: 4 phút = 6 km, 10 phút = 15 km; tình huống + cờ mốc chia đều', async () => {
  const { goalFor, roadEventsFor, flagEveryFor } = await import('../public/games/duongveque/logic.js');
  assert.equal(goalFor(240), 6000);
  assert.equal(goalFor(600), 15000);
  assert.equal(goalFor(60), 2000);
  assert.equal(roadEventsFor(240), 3);
  assert.equal(roadEventsFor(600), 7);
  assert.equal(flagEveryFor(15000), 1300);
  // mỗi tỉnh ≈ 1/34 thời gian ván khi chạy 100 km/h (không tính quà): 10 phút → ~16 giây/tỉnh
  const secPerProvince = goalFor(600) / ROUTE.length / (100 / 3.6);
  assert.ok(secPerProvince > 14 && secPerProvince < 18, String(secPerProvince));
});

test('bị đẩy về bến xe: ván giữ thêm thời gian cháy bến (depotFireSec) rồi mới sang ván mới', () => {
  const g = PLAN({ goal: 6000, backFloor: 0.25, resultSec: 2, depotFireSec: 9.5 });
  g.dist = -1490; g.gift(B, { action: 'wind', coins: 1 }); g.gift(B, { action: 'pothole', coins: 50 });
  for (let i = 0; i < 300 && g.phase === 'race'; i++) g.step(0.1);
  assert.equal(g.result.reason, 'depot');
  for (let i = 0; i < 100; i++) g.step(0.1);     // 10 giây: còn ở màn kết quả (2 + 9,5)
  assert.equal(g.phase, 'result');
  for (let i = 0; i < 20; i++) g.step(0.1);
  assert.notEqual(g.phase, 'result');          // đã sang màn chờ / ván mới
  assert.equal(g.round, 2);
});

// ---------------- trò kinh dị phe Phá & trừ tà phe Cứu ----------------
const still = (opts = {}) => race(Object.assign({ fuelBurn: 0, speed: 0.0001 }, opts));   // xe gần đứng yên: dist chỉ do quà
const riders = (g, n) => { for (let i = 0; i < n; i++) g.comment({ id: `r${i}`, name: `Khách ${i}` }, '1'); };

test('mỗi trò kinh dị phe Phá đẩy lùi đúng số mét theo xu', () => {
  for (const k of ['crow', 'snake', 'ghost', 'croc', 'possess', 'coffin', 'zombie']) {
    const g = still();
    g.gift(B, { action: k, coins: 20 });
    run(g, 10);
    assert.ok(Math.abs(g.dist + metersFor(20, M25)) < 1, `${k}: ${g.dist}`);
  }
});

test('trò kinh dị chặn / làm chậm xe: ma, quỷ, quan tài đứng hẳn; zombie, rắn, quạ chậm lại', () => {
  for (const [k, stop] of [['ghost', true], ['possess', true], ['coffin', true], ['zombie', false], ['snake', false], ['crow', false]]) {
    const g = race({ fuelBurn: 0, speed: 10 });
    g.gift(B, { action: k, coins: 1 });
    run(g, 0.5);
    if (stop) assert.equal(g.speed, 0, k); else assert.ok(g.speed > 0 && g.speed < 10, `${k}: ${g.speed}`);
  }
});

test('cá sấu đớp 1 khách khỏi ghế, bơi về sau crocSec giây; HÚC cứu ngay', () => {
  const g = still({ crocSec: 5 });
  riders(g, 3);
  g.gift(B, { action: 'croc', coins: 99 });
  const ev = g.drainEvents().find(e => e.type === 'snatch');
  assert.ok(ev && ev.victim, 'có khách bị đớp');
  assert.equal(g.passengers().total, 2);
  assert.ok(!g.passengers().seated.some(u => u.id === ev.victim.id));
  run(g, 5.2);
  assert.equal(g.passengers().total, 3);
  assert.ok(g.drainEvents().some(e => e.type === 'victimBack' && e.how === 'swim'));
  g.gift(B, { action: 'croc', coins: 99 });
  assert.equal(g.passengers().total, 2);
  g.input('ram'); run(g, 0.1);
  assert.equal(g.passengers().total, 3);
  assert.ok(g.drainEvents().some(e => e.type === 'victimBack' && e.how === 'ram'));
});

test('quỷ nhập tài xế: không nhảy, không húc được trong lúc bị nhập', () => {
  const g = race({ fuelBurn: 0, speed: 10 });
  g.gift(B, { action: 'possess', coins: 199 });
  run(g, 0.2);
  assert.equal(g.input('jump'), false);
  assert.equal(g.input('ram'), false);
  assert.ok(g.drainEvents().some(e => e.type === 'possessed'));
  run(g, 5);
  assert.equal(g.input('jump'), true);
});

test('trừ tà cùng giá xoá sạch trò kinh dị (cùng giá triệt tiêu), dư mét thành đẩy tới', () => {
  for (const [cuu, pha] of [['garlic', 'ghost'], ['shaman', 'possess'], ['fireworks', 'coffin'], ['buffalo', 'dog'], ['lion', 'coffin'], ['fireworks', 'zombie']]) {
    const g = still();
    g.gift(B, { action: pha, coins: 50 });
    run(g, 0.5);
    const back = g.dist;
    g.gift(A, { action: cuu, coins: 50 });
    assert.ok(g.drainEvents().some(e => e.type === 'exorcise'), `${cuu} vs ${pha}: có trừ tà`);
    run(g, 8);
    // đã bị lùi một ít trước khi trừ tà; phần còn lại bị xoá, dư đúng bằng phần đã lùi được đẩy tới lại
    assert.ok(Math.abs(g.dist) < 1.5, `${cuu} vs ${pha}: dist=${g.dist} (lùi trước đó ${back})`);
    assert.equal(g.effects.filter(e => e.kind === pha).length, 0, `${pha} đã tắt`);
  }
});

test('trừ tà nhỏ hơn trò kinh dị chỉ xoá được một phần; trừ tà không đúng loại thì thành đẩy tới', () => {
  const g = still();
  g.gift(B, { action: 'ghost', coins: 100 });
  g.gift(A, { action: 'garlic', coins: 40 });
  run(g, 8);
  assert.ok(Math.abs(g.dist + metersFor(60, M25)) < 1.5, `dist=${g.dist}`);
  const g2 = still();
  g2.gift(B, { action: 'rain', coins: 40 });   // mưa không phải tà → tỏi không xoá, chỉ đẩy tới
  g2.gift(A, { action: 'garlic', coins: 40 });
  assert.ok(!g2.drainEvents().some(e => e.type === 'exorcise'));
  run(g2, 8);
  assert.ok(Math.abs(g2.dist) < 1.5, `dist=${g2.dist}`);
  assert.equal(g2.effects.length, 0);
});

test('trừ tà cứu khách đang bị cá sấu đớp', () => {
  const g = still();
  riders(g, 2);
  g.gift(B, { action: 'croc', coins: 99 });
  assert.equal(g.passengers().total, 1);
  g.gift(A, { action: 'shaman', coins: 199 });
  assert.equal(g.passengers().total, 3);   // 2 khách + người tặng thầy pháp (tặng Cứu là lên xe)
  assert.ok(g.drainEvents().some(e => e.type === 'victimBack' && e.how === 'saved'));
});

test('múa lân dọn vật cản phía trước (tính vào mét của quà)', () => {
  const g = still();
  g.gift(B, { action: 'banana', coins: 10, count: 3 });
  assert.equal(g.obstacles.length, 3);
  g.gift(A, { action: 'lion', coins: 49 });
  assert.equal(g.obstacles.length, 0);
  run(g, 20);
  assert.ok(Math.abs(g.dist - (metersFor(49, M25) - 3 * metersFor(10, M25))) < 1.5, `dist=${g.dist}`);
});

test('zombie quá đông: HÚC chỉ văng một nửa phần còn lại, zombie vẫn bám', () => {
  const g = still();
  g.gift(B, { action: 'zombie', coins: 100 });
  run(g, 0.1);
  g.input('ram'); run(g, 0.05);
  assert.equal(g.effects.filter(e => e.kind === 'zombie').length, 1);
  run(g, 10);
  const full = metersFor(100, M25);
  assert.ok(g.dist > -full * 0.6 && g.dist < -full * 0.45, `dist=${g.dist}`);
});

test('chủ nợ rượt: đuổi kịp xe rồi cả đoàn mới vọt lên đủ mét; siêu nhân vác xe đẩy đủ mét', () => {
  const g = still();
  g.gift(A, { action: 'creditor', coins: 10 });
  run(g, 0.5);
  assert.ok(Math.abs(g.dist) < 0.01, 'chủ nợ chưa tới thì xe chưa vọt');
  run(g, 4);
  assert.ok(Math.abs(g.dist - metersFor(10, M25)) < 1, `dist=${g.dist}`);
  const g2 = still();
  g2.gift(A, { action: 'superman', coins: 1000 });
  run(g2, 8);
  assert.ok(Math.abs(g2.dist - metersFor(1000, M25)) < 2, `dist=${g2.dist}`);
});

test('kẻ đẩy phải CHẠM xe rồi xe mới lùi / tiến: trong lúc tiếp cận xe chưa bị đẩy', () => {
  for (const [k, side] of [['zombie', 'pha'], ['coffin', 'pha'], ['ghost', 'pha'], ['dog', 'pha'], ['tow', 'cuu'], ['buffalo', 'cuu']]) {
    const g = still();
    g.gift(side === 'pha' ? B : A, { action: k, coins: 40 });
    const lead = g.pushes[0].lead;
    assert.ok(lead > 0, `${k} có thời gian tiếp cận`);
    run(g, lead - 0.1);
    assert.ok(Math.abs(g.dist) < 0.01, `${k}: chưa chạm mà đã đi ${g.dist}`);
    run(g, 10);
    assert.ok(Math.abs(Math.abs(g.dist) - metersFor(40, M25)) < 1, `${k}: ${g.dist}`);
  }
});

test('quà dồn lúc dừng + nộp phạt CSGT: xe ủi lái tới chạm rồi mới đẩy', () => {
  const g = still();
  g.gift(A, { action: 'wind', coins: 1 });
  run(g, 3);
  const before = g.dist;
  g.triggerEvent('rest'); g.gift(B, { action: 'rain', coins: 40 }); run(g, 30.3);
  const p = g.pushes.find(x => x.kind === 'stash');
  assert.ok(p && p.t < 0, 'cú đẩy quà dồn đang tiếp cận');
  assert.ok(Math.abs(g.dist - before) < 0.5);
});

test('cảnh theo tỉnh cũ: đủ 63 tỉnh cũ, mỗi tỉnh đúng 1 đoạn, đúng tỉnh mới đã gộp; kiểu cảnh hợp lệ; partAt đi Nam → Bắc', async () => {
  const { PARTS, partAt, BIOMES } = await import('../public/games/duongveque/route.js');
  const names = [];
  for (const p of ROUTE) {
    const parts = PARTS[p.name];
    assert.ok(parts && parts.length, `${p.name} có đoạn cảnh`);
    assert.deepEqual(parts.map(x => x.name).sort(), [p.name, ...p.old].sort(), `${p.name}: đúng các tỉnh cũ đã gộp`);
    for (const x of parts) {
      assert.ok(BIOMES.includes(x.biome), `${x.name}: biome ${x.biome}`);
      assert.ok(x.feats.length >= 2 && x.sign, `${x.name}: có nét đặc trưng + biển chào`);
      names.push(x.name);
    }
  }
  assert.equal(names.length, 63);
  assert.equal(new Set(names).size, 63);
  const goal = 6000, seen = [];
  for (let m = 0; m < goal; m += 5) { const n = partAt(m, goal).part.name; if (seen[seen.length - 1] !== n) seen.push(n); }
  assert.equal(seen.length, 63);
  assert.equal(seen[0], 'Cà Mau'); assert.equal(seen[1], 'Bạc Liêu'); assert.equal(seen[62], 'Hà Giang');
  assert.equal(partAt(-50, goal).part.name, 'Cà Mau');
  assert.equal(partAt(goal + 99, goal).part.name, 'Hà Giang');
});

test('nhiều xe: quà Tài xế lên lái xe tiếp theo còn trống, mỗi xe cùng thuật toán (giờ lái, hàng chờ, giữ lái)', () => {
  const g = race({ fuelBurn: 0, roundSec: 9999, driverSec: 5, seats: 4, maxCars: 3 });
  for (let i = 0; i < 9; i++) g.comment({ id: `r${i}`, name: `R${i}` }, '1');
  assert.equal(g.passengers().cars, 3);
  const D = ['d0', 'd1', 'd2', 'd3'].map(id => ({ id, name: id }));
  g.gift(D[0], { action: 'driver', coins: 99 });
  g.gift(D[1], { action: 'driver', coins: 99, count: 2 });
  g.gift(D[2], { action: 'driver', coins: 99 });
  assert.deepEqual(g.drivers.map(d => d && d.id), ['d0', 'd1', 'd2']);
  assert.equal(g.driver.id, 'd0');
  assert.equal(g.passengers().cars, 3, 'tài xế xe sau không làm mất xe');
  g.gift(D[3], { action: 'driver', coins: 99 });            // hết xe trống → chờ
  assert.deepEqual(g.driverQueue.map(q => q.user.id), ['d3']);
  const evs = g.drainEvents().filter(e => e.type === 'driver').map(e => e.car);
  assert.deepEqual(evs, [0, 1, 2]);
  run(g, 5.2);                                                // xe 0 và xe 2 hết giờ: d3 lên xe 0, xe 2 giữ lái
  assert.equal(g.drivers[0].id, 'd3');
  assert.equal(g.drivers[2].id, 'd2'); assert.equal(g.drivers[2].free, true);
  assert.equal(g.drivers[1].free, false);                     // xe 1 còn giờ (×2)
  g.gift(D[0], { action: 'driver', coins: 99 });            // xe có người giữ lái → quà mới thay ngay
  assert.equal(g.drivers[2].id, 'd0');
  g.gift(D[0], { action: 'driver', coins: 99 });            // đang lái thì cộng giờ
  assert.ok(g.drivers[2].left > 9);
});

test('nhiều xe: đoàn có thêm xe thì người đang chờ tự lên lái xe mới', () => {
  const g = race({ fuelBurn: 0, roundSec: 9999, seats: 4, maxCars: 3 });
  for (let i = 0; i < 3; i++) g.comment({ id: `r${i}`, name: `R${i}` }, '1');
  g.gift({ id: 'd0', name: 'd0' }, { action: 'driver', coins: 99 });
  g.gift({ id: 'd1', name: 'd1' }, { action: 'driver', coins: 99 });
  assert.equal(g.passengers().cars, 1);
  assert.deepEqual(g.driverQueue.map(q => q.user.id), ['d1']);
  for (let i = 3; i < 7; i++) g.comment({ id: `r${i}`, name: `R${i}` }, '1');
  run(g, 0.1);
  assert.equal(g.passengers().cars, 2);
  assert.equal(g.drivers[1] && g.drivers[1].id, 'd1');
  assert.equal(g.driverQueue.length, 0);
});

test('ghế trên xe ưu tiên người thả tim + tặng quà nhiều (1 xu = coinLikes tim); thả tim là lên xe', () => {
  const g = race({ fuelBurn: 0, roundSec: 9999, seats: 2, maxCars: 1 });
  g.comment({ id: 'c1', name: 'Chỉ bình luận' }, '1');
  g.like({ id: 'l1', name: 'Tim 50' }, 50);
  g.gift({ id: 'g1', name: 'Quà 3 xu' }, { action: 'wind', coins: 3 });   // 30 điểm
  g.like({ id: 'g1', name: 'Quà 3 xu' }, 25);                             // 55 điểm
  const P = g.passengers();
  assert.deepEqual(P.seated.map(u => u.id), ['g1', 'l1']);
  assert.equal(P.extra, 1);
  g.comment({ id: 'p1', name: 'Phá' }, '2');
  g.like({ id: 'p1', name: 'Phá' }, 999);
  assert.ok(!g.passengers().seated.some(u => u.id === 'p1'), 'phe Phá thả tim không lên xe');
});

test('trạm dừng chân: đám đông = người trên xe + mọi người từng thả tim / tặng quà, tối đa crowdMax, giữ qua các ván', () => {
  const g = race({ fuelBurn: 0, roundSec: 9999, seats: 3, maxCars: 1, crowdMax: 10 });
  for (let i = 0; i < 6; i++) g.like({ id: `l${i}`, name: `L${i}` }, 10 + i);
  g.comment({ id: 'p', name: 'Phá' }, '2'); g.gift({ id: 'p', name: 'Phá' }, { action: 'banana', coins: 1 });
  g.comment({ id: 'quiet', name: 'Im lặng' }, '2');
  const c = g.crowd();
  assert.ok(c.length <= 10);
  assert.ok(c.some(u => u.id === 'p'), 'phe Phá cũng xuống tám chuyện');
  assert.ok(!c.some(u => u.id === 'quiet'), 'chưa thả tim / tặng quà thì không có');
  assert.deepEqual(c.slice(0, 3).map(u => u.id), g.passengers().seated.map(u => u.id));
  g.forceEnd('cuu'); run(g, 30);
  assert.ok(g.crowd().length >= 7, 'sang ván mới vẫn nhớ người từng tương tác');
});

test('về cổng làng: 15 giây đếm ngược (đồng hồ ván dừng), phe Phá đẩy lùi khỏi đích thì huỷ đếm và chạy tiếp', () => {
  const g = race({ goal: 300, fuelBurn: 0, speed: 0.0001, roundSec: 60 });
  g.gift(A, { action: 'wind', coins: 200 });
  run(g, 2);
  assert.ok(g.drainEvents().some(e => e.type === 'finishStart' && e.sec === 15));
  const clock = g.timeLeft;
  run(g, 5);
  assert.equal(g.timeLeft, clock, 'đồng hồ ván dừng lúc đếm ngược');
  g.gift(B, { action: 'rain', coins: 20 });
  run(g, 8);
  assert.equal(g.finish, null);
  assert.ok(g.drainEvents().some(e => e.type === 'finishCancel'));
  assert.equal(g.phase, 'race');
  assert.ok(g.dist < 300 && g.timeLeft < clock, 'chạy tiếp, đồng hồ chạy lại');
});

test('chủ nợ rượt: đòi nợ đích danh 1 người trong top 10 tặng quà + thả tim, không phải chính mình', () => {
  const g = still();
  for (let i = 0; i < 12; i++) g.like({ id: `f${i}`, name: `Fan ${i}` }, 100 - i);
  g.gift(A, { action: 'creditor', coins: 5 });
  const ev = g.drainEvents().find(e => e.type === 'debt');
  const top = g.topFans(10).map(u => u.id);
  assert.ok(ev.debtor && top.includes(ev.debtor.id) && ev.debtor.id !== 'a', JSON.stringify(ev.debtor));
  assert.ok(!['f10', 'f11'].includes(ev.debtor.id));
});

test('bị đẩy vọt tới cổng làng thì không dừng trạm xăng / trạm dừng còn lại nữa', () => {
  let s = 5; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const g = createGame({ autoPilot: false, lobbySec: 0.05, goal: 900, fuelBurn: 0, speed: 0.0001, ...M25 }, rnd);
  run(g, 0.1);
  g.gift(A, { action: 'heli', coins: 400 });
  run(g, 8);
  assert.ok(g.finish || g.phase === 'result');
  assert.equal(g.halt, null);
});

test('quán ăn vỉa hè: đủ 63 tỉnh cũ, mỗi tỉnh 2 món ≤ 22 ký tự + câu mời ≤ 60 ký tự có nhắc món', async () => {
  const { FOOD } = await import('../public/games/duongveque/food.js');
  const { PARTS } = await import('../public/games/duongveque/route.js');
  const names = Object.values(PARTS).flat().map(p => p.name);
  assert.deepEqual(Object.keys(FOOD).sort(), [...names].sort());
  for (const [k, v] of Object.entries(FOOD)) {
    assert.equal(v.food.length, 2, k);
    for (const d of v.food) assert.ok(d.length <= 22, `${k}: "${d}" dài ${d.length}`);
    assert.ok(v.invite.length <= 60, `${k}: câu mời dài ${v.invite.length}`);
  }
});
