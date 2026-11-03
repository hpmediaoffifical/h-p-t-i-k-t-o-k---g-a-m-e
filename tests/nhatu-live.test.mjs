import test from 'node:test';
import assert from 'node:assert/strict';
import { comboPower, tugShift, COMBO_WINDOW_MS } from '../public/games/nhatu/js/logic/live.js';

test('combo: chuỗi quà TikTok ×5 / ×10 → power 2 / 3, quà lẻ → 1', () => {
  assert.deepEqual(comboPower(new Map(), 'a|hoa', 1, 0), { n: 1, power: 1 });
  assert.equal(comboPower(new Map(), 'a|hoa', 5, 0).power, 2);
  assert.equal(comboPower(new Map(), 'a|hoa', 10, 0).power, 3);
});

test('combo: quà rời cùng loại trong 10 giây cộng dồn, quá 10 giây tính lại; khác người / khác quà không cộng', () => {
  const m = new Map();
  for (let i = 0; i < 4; i++) comboPower(m, 'a|hoa', 1, i * 1000);
  assert.equal(comboPower(m, 'a|hoa', 1, 4000).power, 2); // lần thứ 5
  assert.equal(comboPower(m, 'b|hoa', 1, 4000).power, 1); // người khác
  assert.equal(comboPower(m, 'a|kem', 1, 4000).power, 1); // quà khác
  assert.equal(comboPower(m, 'a|hoa', 1, 4000 + COMBO_WINDOW_MS + 1).n, 1); // quá hạn → đếm lại
});

test('kéo co: dây kéo về phía đội dẫn điểm, kẹp ±1,8 m, chưa ai có điểm thì đứng giữa', () => {
  assert.equal(tugShift(0, 0), 0);
  assert.ok(tugShift(900, 300) > 0);
  assert.ok(tugShift(300, 2400) < 0);
  assert.ok(Math.abs(tugShift(1e9, 0)) <= 1.8);
  assert.ok(Math.abs(tugShift(10, 0)) < 0.5); // đầu trận điểm nhỏ không giật hết cỡ
});
