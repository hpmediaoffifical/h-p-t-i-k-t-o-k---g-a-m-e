import test from 'node:test';
import assert from 'node:assert/strict';
import { findCatcher, pickReportTarget, pickTrashVictim, cleanPoints, mmss, CLEAN_POINTS } from '../public/games/nhatu/js/logic/mischief.js';

const at = (x, z, y = 0) => ({ body: { pos: { x, y, z } } });

test('cán bộ đứng gần chỗ đi bậy thì bắt quả tang (chọn người gần nhất), xa / khác tầng thì không', () => {
  const near = at(3, 0);
  const nearer = at(1, 1);
  assert.equal(findCatcher([near, nearer, at(20, 0)], { x: 0, y: 0, z: 0 }), nearer);
  assert.equal(findCatcher([at(20, 0)], { x: 0, y: 0, z: 0 }), null);
  assert.equal(findCatcher([at(1, 0, 3.4)], { x: 0, y: 0, z: 0 }), null); // cán bộ đang trên lầu
  assert.equal(findCatcher([], { x: 0, y: 0, z: 0 }), null);
});

test('tố cáo: bắt lần đi bậy mới nhất còn tự do, bỏ qua người đã bị bắt / đã rời trại / quá hạn', () => {
  const a = { id: 'a' };
  const b = { id: 'b' };
  const c = { id: 'c' };
  const free = (v) => v !== c; // c đã rời trại hoặc đang bị giam
  const offs = [
    { v: a, at: 1000, caught: false },
    { v: b, at: 5000, caught: true },
    { v: c, at: 6000, caught: false },
  ];
  assert.equal(pickReportTarget(offs, 7000, free).v, a);
  offs.push({ v: b, at: 6500, caught: false });
  assert.equal(pickReportTarget(offs, 7000, free).v, b);
  assert.equal(pickReportTarget([{ v: a, at: 0, caught: false }], 10 * 60 * 1000, free), null); // quá 5 phút
  assert.equal(pickReportTarget([], 0, free), null);
});

test('thùng rác: không ném người tặng, ưu tiên người xem thật, không ai thì null', () => {
  const me = { viewerRec: { id: 'me' } };
  const fan = { viewerRec: { id: 'fan' } };
  const npc = { name: 'NPC' };
  assert.equal(pickTrashVictim([me], 'me', () => 0), null);
  assert.equal(pickTrashVictim([me, fan, npc], 'me', () => 0.1), fan); // rng < 0.7 → người xem
  assert.equal(pickTrashVictim([me, fan, npc], 'me', () => 0.9), npc);
  assert.equal(pickTrashVictim([npc], 'me', () => 0.1), npc); // chỉ có NPC
  assert.equal(pickTrashVictim([], 'me', Math.random), null);
});

test('điểm cống hiến: dọn giúp người khác cao hơn dọn bãi của mình', () => {
  assert.equal(cleanPoints('x', 'y'), CLEAN_POINTS.other);
  assert.equal(cleanPoints('x', 'x'), CLEAN_POINTS.own);
  assert.equal(cleanPoints('x', null), CLEAN_POINTS.other); // chủ bãi đã rời trại
  assert.ok(CLEAN_POINTS.other > CLEAN_POINTS.own);
});

test('mmss làm tròn lên và không âm', () => {
  assert.equal(mmss(180), '3:00');
  assert.equal(mmss(59.2), '1:00');
  assert.equal(mmss(5), '0:05');
  assert.equal(mmss(-3), '0:00');
});
