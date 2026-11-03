import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, metersFor, pickAction, resolveGift, sideFromComment, ACTIONS } from '../public/games/duongveque/logic.js';

const A = { id: 'a', name: 'An' }, B = { id: 'b', name: 'Bình' };
const run = (g, sec, dt = 0.05) => { for (let t = 0; t < sec; t += dt) g.step(dt); };
// số mét/xu cố định cho test (mặc định game có thể đổi khi cân lại)
const M25 = { meterPerCoin: 2.5, minMeters: 5 };
const race = (opts = {}) => { const g = createGame(Object.assign({ autoPilot: false, lobbySec: 0.05 }, M25, opts), () => 0.99); run(g, 0.1); assert.equal(g.phase, 'race'); g.drainEvents(); return g; };

test('mét theo xu: tuyến tính, có tối thiểu', () => {
  assert.equal(metersFor(1, M25), 5);
  assert.equal(metersFor(100, M25), 250);
  assert.equal(metersFor(0, M25), 5);
  assert.equal(metersFor(1), 15);      // mặc định: 8 m/xu, tối thiểu 15 m (xe chạy 100 km/h)
  assert.equal(metersFor(100), 800);
});

test('quà chưa gán chọn hành động theo bậc giá của phe', () => {
  assert.equal(pickAction('cuu', 1), 'wind');
  assert.equal(pickAction('cuu', 5), 'fuel');
  assert.equal(pickAction('cuu', 100), 'helmet');
  assert.equal(pickAction('cuu', 5000), 'heli');
  assert.equal(pickAction('pha', 1), 'banana');
  assert.equal(pickAction('pha', 30), 'dog');
  assert.equal(pickAction('pha', 499), 'container');
  assert.equal(pickAction('pha', 1000), 'tornado');
  for (const a of ACTIONS) assert.ok(['cuu', 'pha'].includes(a.side));
});

test('gán quà: khớp id trước, rồi tên đúng cả chuỗi; không khớp → phe người tặng', () => {
  const map = { nitro: [{ giftId: '5879', giftName: 'Doughnut' }], ducks: [{ giftId: '5585', giftName: 'Confetti', names: ['Pháo hoa giấy'] }] };
  assert.deepEqual(resolveGift({ giftId: 5879, coins: 30 }, map, null), { action: 'nitro', side: 'cuu', mapped: true });
  assert.equal(resolveGift({ giftName: 'pháo hoa giấy', coins: 100 }, map, null).action, 'ducks');
  assert.equal(resolveGift({ giftName: 'Pháo hoa', coins: 1088 }, map, null).action, 'heli'); // không "chứa" là khớp
  assert.equal(resolveGift({ giftId: 1, coins: 1088 }, map, 'pha').action, 'tornado');
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
  const g = createGame({ autoPilot: false, lobbySec: 1, ...M25 }, () => 0.5);
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
  const g = race({ fuelBurn: 0, speed: 0.0001, likePer: 100 });
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
  const g = createGame({ autoPilot: true, lobbySec: 0.05, fuelBurn: 0, ...M25 }, rnd);
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
