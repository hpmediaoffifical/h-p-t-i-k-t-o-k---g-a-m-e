// ⛓️ Nhà Tù Online — đàn em quanh Đại Ca + luật biệt giam khi người xem im lặng.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENTOURAGE_SLOTS, slotWorld, shouldJail, pickJailCell } from '../public/games/nhatu/js/logic/roles.js';

const close = (a, b) => Math.abs(a - b) < 1e-9;

test('chỗ "trước mặt" nằm theo hướng đại ca đang nhìn', () => {
  const front = { dx: 0, dz: 1, face: 'forward' };
  const p0 = slotWorld({ x: 0, z: 0, ry: 0 }, front);
  assert.ok(close(p0.x, 0) && close(p0.z, 1));
  const p1 = slotWorld({ x: 2, z: 3, ry: Math.PI / 2 }, front); // nhìn sang +x
  assert.ok(close(p1.x, 3) && close(p1.z, 3));
});

test('bên phải đại ca là +x khi đại ca nhìn +z', () => {
  const p = slotWorld({ x: 0, z: 0, ry: 0 }, { dx: 1, dz: 0, face: 'forward' });
  assert.ok(close(p.x, 1) && close(p.z, 0));
});

test('đàn em "quay vào đại ca" nhìn đúng về phía đại ca', () => {
  const boss = { x: 5, z: 5, ry: 0.7 };
  for (const slot of ENTOURAGE_SLOTS.filter((s) => s.face === 'boss')) {
    const p = slotWorld(boss, slot);
    const dir = { x: Math.sin(p.ry), z: Math.cos(p.ry) };
    const to = { x: boss.x - p.x, z: boss.z - p.z };
    const len = Math.hypot(to.x, to.z);
    assert.ok(dir.x * (to.x / len) + dir.z * (to.z / len) > 0.999, slot.duty);
  }
});

test('mỗi việc nịnh bợ có chỗ đứng riêng, không chồng nhau', () => {
  const pts = ENTOURAGE_SLOTS.map((s) => slotWorld({ x: 0, z: 0, ry: 0 }, s));
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z) > 0.5, `${ENTOURAGE_SLOTS[i].duty}/${ENTOURAGE_SLOTS[j].duty}`);
  }
});

test('shouldJail: đủ 3 phút im lặng mới nhốt; 0 = tắt luật', () => {
  assert.equal(shouldJail(0, 179_999, 180), false);
  assert.equal(shouldJail(0, 180_000, 180), true);
  assert.equal(shouldJail(0, 10 ** 9, 0), false);
});

test('pickJailCell chỉ chọn phòng trên lầu còn chỗ, ưu tiên phòng vắng', () => {
  const cells = [
    { id: 'A-01', level: 0 },
    { id: 'A-14', level: 1 },
    { id: 'A-15', level: 1 },
  ];
  const occ = new Map([['A-14', 1]]);
  assert.equal(pickJailCell(cells, occ, 2).id, 'A-15');
  occ.set('A-15', 2);
  assert.equal(pickJailCell(cells, occ, 2).id, 'A-14');
  occ.set('A-14', 2);
  assert.equal(pickJailCell(cells, occ, 2), null);
});
