import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoomState, pushComment, applyGift, topFans, memberCount, clampIdols, startPk, pkAddScore, pkHas, pkShare,
  pkResult, pkRemaining, judgeBeat, comboReward, pickWeighted, distToRect, inRect, cooldownLeft, ROOM_ID, MIN_IDOLS, MAX_IDOLS,
} from '../../src/web/js/logic/rooms.js';
import { defaultProfile, sanitizeProfile, spend } from '../../src/web/js/logic/profile.js';

const rose = { id: 'rose', price: 1 };
const car = { id: 'car', price: 199 };

test('a group always has 5 to 9 members', () => {
  assert.equal(clampIdols(0), MIN_IDOLS);
  assert.equal(clampIdols(99), MAX_IDOLS);
  const small = createRoomState({ id: 'G1', type: 'group', name: 'A', genre: 'kpop', idols: 1 });
  const big = createRoomState({ id: 'G2', type: 'group', name: 'B', genre: 'kpop', idols: 50 });
  assert.equal(memberCount(small), 5);
  assert.equal(memberCount(big), 9);
  assert.equal(memberCount(createRoomState({ id: 'N01', type: 'stand', name: 'C', genre: 'talk' })), 1);
});

test('gifts add up per room and per fan; top fans are sorted', () => {
  const r = createRoomState({ id: 'S1', type: 'sing', name: 'S', genre: 'ballad' });
  assert.equal(applyGift(r, 'An', rose, 10), 10);
  assert.equal(applyGift(r, 'Bình', car), 199);
  applyGift(r, 'An', rose, 5);
  assert.equal(r.giftTotal, 214);
  assert.deepEqual(topFans(r, 2), [{ name: 'Bình', value: 199 }, { name: 'An', value: 15 }]);
  assert.equal(r.lastGift.giftId, 'rose');
  assert.equal(r.lastGift.count, 5);
});

test('comments keep only the newest ones', () => {
  const r = createRoomState({ id: 'P1', type: 'game', name: 'P', genre: 'racing' });
  for (let i = 0; i < 12; i++) pushComment(r, `u${i}`, `c${i}`, 'npc', 8);
  assert.equal(r.comments.length, 8);
  assert.equal(r.comments[0].text, 'c4');
  assert.equal(r.comments[7].text, 'c11');
});

test('PK scores the right side and picks the winner', () => {
  const pk = startPk('G1', 'G3', 1000, 60000);
  assert.ok(pkHas(pk, 'G1') && pkHas(pk, 'G3') && !pkHas(pk, 'G2'));
  assert.equal(pkShare(pk), 0.5);
  assert.ok(pkAddScore(pk, 'G3', 50));
  assert.ok(pkAddScore(pk, 'G1', 10));
  assert.ok(!pkAddScore(pk, 'G2', 999));
  assert.equal(pkResult(pk).winner, 'G3');
  assert.equal(pkResult(pk).loser, 'G1');
  assert.ok(Math.abs(pkShare(pk) - 10 / 60) < 1e-9);
  assert.equal(pkRemaining(pk, 31000), 30000);
  assert.equal(pkRemaining(pk, 99999), 0);
  assert.throws(() => startPk('G1', 'G1', 0, 1));
  const draw = startPk('G4', 'G5', 0, 1);
  assert.ok(pkResult(draw).draw);
});

test('rhythm judge measures distance to the nearest beat', () => {
  const bpm = 120; // beat = 0.5 s
  assert.equal(judgeBeat(1.0, bpm).grade, 'perfect');
  assert.equal(judgeBeat(1.49, bpm).grade, 'perfect'); // just before the next beat
  assert.equal(judgeBeat(1.1, bpm).grade, 'good');
  assert.equal(judgeBeat(1.25, bpm).grade, 'miss');
  assert.ok(judgeBeat(1.49, bpm).err < 0);
  assert.equal(comboReward(7), 0);
  assert.equal(comboReward(8), 8);
  assert.equal(comboReward(160), 30);
});

test('weighted pick respects weights and edges', () => {
  const items = [{ k: 'a', w: 1 }, { k: 'b', w: 3 }];
  assert.equal(pickWeighted(() => 0, items).k, 'a');
  assert.equal(pickWeighted(() => 0.3, items).k, 'b');
  assert.equal(pickWeighted(() => 0.9999, items).k, 'b');
});

test('room geometry helpers', () => {
  const rect = { minX: 0, maxX: 4, minZ: 0, maxZ: 2 };
  assert.ok(inRect(rect, 1, 1));
  assert.ok(!inRect(rect, 5, 1));
  assert.equal(distToRect(rect, 2, 1), 0);
  assert.equal(distToRect(rect, 7, 6), 5);
  assert.equal(cooldownLeft(0, 5000, 120), 0);
  assert.equal(cooldownLeft(1000, 61000, 120), 60);
});

test('room ids cover 5 group, 10 stand, 5 sing, 5 game rooms', () => {
  const ids = [...'12345'].map((n) => `G${n}`).concat([...Array(10)].map((_, i) => `N${String(i + 1).padStart(2, '0')}`), [...'12345'].map((n) => `S${n}`), [...'12345'].map((n) => `P${n}`));
  assert.equal(ids.length, 25);
  for (const id of ids) assert.ok(ROOM_ID.test(id), id);
  for (const bad of ['G6', 'N11', 'N00', 'S0', 'X1', 'G1x']) assert.ok(!ROOM_ID.test(bad), bad);
});

test('profile spending never goes negative and bad data is cleaned', () => {
  const p = defaultProfile('An', 100);
  assert.ok(spend(p, 60));
  assert.ok(!spend(p, 60));
  assert.equal(p.coins, 40);
  assert.ok(!spend(p, -5));
  const s = sanitizeProfile({ name: '  Bé\u0007 Na  ', coins: -3, look: { outfit: 'hack', hair: 'pink' }, owned: ['x', 3] }, 'F', 500);
  assert.equal(s.name, 'Bé Na');
  assert.equal(s.coins, 500);
  assert.equal(s.look.outfit, 'hoodie');
  assert.equal(s.look.hair, 'pink');
  assert.ok(s.owned.includes('x') && !s.owned.includes(3));
});
