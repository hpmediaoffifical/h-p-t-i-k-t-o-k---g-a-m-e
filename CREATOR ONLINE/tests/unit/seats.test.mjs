import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeatHouse, NpcSeatSim } from '../../src/web/js/logic/seats.js';

const rooms = [
  { id: 'G1', type: 'group' },
  { id: 'N01', type: 'stand' },
  { id: 'N02', type: 'stand' },
  { id: 'S1', type: 'sing' },
];
const A = { id: 'a', name: 'An' };
const B = { id: 'b', name: 'Bình' };
const C = { id: 'c', name: 'Chi' };
const D = { id: 'd', name: 'Dũng' };
const H = 60000;

test('group stages are not seats', () => {
  const h = new SeatHouse({ rooms });
  assert.equal(h.get('G1'), null);
  assert.equal(h.claim('G1', A, 0).result, 'invalid');
});

test('an empty room is owned at once and named after the gifter', () => {
  const h = new SeatHouse({ rooms });
  assert.deepEqual(h.claim('N01', A, 1000), { result: 'own', room: 'N01' });
  assert.equal(h.get('N01').owner.name, 'An');
  assert.equal(h.lockLeft('N01', 1000), H);
  assert.equal(h.claim('N01', A, 2000).result, 'already');
});

test('nobody can take the room during the first 60 s: they queue by turn', () => {
  const h = new SeatHouse({ rooms });
  h.claim('N01', A, 0);
  assert.deepEqual(h.claim('N01', B, 10000), { result: 'queue', room: 'N01', position: 1 });
  assert.deepEqual(h.claim('N01', C, 20000), { result: 'queue', room: 'N01', position: 2 });
  assert.equal(h.claim('N01', B, 30000).position, 1, 'claiming again keeps the place');
  assert.deepEqual(h.tick(59999), []);
  const [ev] = h.tick(60000);
  assert.equal(ev.kind, 'promote');
  assert.equal(ev.from.id, 'a');
  assert.equal(ev.to.id, 'b');
  assert.equal(h.get('N01').owner.id, 'b');
  assert.equal(h.get('N01').since, 60000, 'the new owner gets a fresh 60 s');
  assert.equal(h.queuedIn('c').position, 1);
});

test('after 60 s with no queue the owner stays; a newcomer goes to an empty room of the same type', () => {
  const h = new SeatHouse({ rooms });
  h.claim('N01', A, 0);
  assert.deepEqual(h.tick(500000), []);
  assert.equal(h.get('N01').owner.id, 'a');
  assert.deepEqual(h.claim('N01', B, 500000), { result: 'redirect', room: 'N02' });
  assert.equal(h.get('N01').owner.id, 'a');
  assert.equal(h.get('N02').owner.id, 'b');
});

test('with no empty room left, a gift after 60 s takes the room', () => {
  const h = new SeatHouse({ rooms });
  h.claim('N01', A, 0);
  h.claim('N02', B, 0);
  const r = h.claim('N01', C, 61000);
  assert.equal(r.result, 'takeover');
  assert.equal(r.from.id, 'a');
  assert.equal(h.get('N01').owner.id, 'c');
  // the protected room cannot be taken: queue instead
  assert.equal(h.claim('N01', D, 70000).result, 'queue');
});

test('an owner cannot hold two rooms; leaving hands the room to the queue', () => {
  const h = new SeatHouse({ rooms });
  h.claim('N01', A, 0);
  assert.deepEqual(h.claim('S1', A, 10), { result: 'busy', room: 'N01' });
  h.claim('N01', B, 100);
  const c = h.leave('N01', 'a', 5000);
  assert.equal(c.kind, 'promote');
  assert.equal(h.get('N01').owner.id, 'b');
  assert.equal(h.leave('N01', 'b', 6000).kind, 'empty');
  assert.equal(h.get('N01').owner, null);
});

test('joining another queue moves you; disconnect clears everything', () => {
  const h = new SeatHouse({ rooms });
  h.claim('N01', A, 0);
  h.claim('S1', B, 0);
  h.claim('N01', C, 10);
  h.claim('S1', C, 20);
  assert.equal(h.get('N01').queue.length, 0);
  assert.equal(h.queuedIn('c').seat.id, 'S1');
  const changes = h.removeEverywhere('c', 30);
  assert.equal(changes.length, 1);
  assert.equal(h.get('S1').queue.length, 0);
});

test('queues have a limit', () => {
  const h = new SeatHouse({ rooms, maxQueue: 2 });
  h.claim('N01', A, 0);
  h.claim('N01', B, 1);
  h.claim('N01', C, 2);
  assert.equal(h.claim('N01', D, 3).result, 'full');
});

test('snapshots round-trip', () => {
  const h = new SeatHouse({ rooms });
  h.claim('N01', A, 5);
  h.claim('N01', B, 6);
  const copy = new SeatHouse({ rooms });
  copy.load('N01', h.snapshot('N01'));
  assert.deepEqual(copy.snapshot('N01'), h.snapshot('N01'));
});

test('NPC fans fill rooms and follow the same rules', () => {
  let x = 0.37;
  const rng = () => (x = (x * 9301 + 49297) % 233280 / 233280);
  const h = new SeatHouse({ rooms });
  const sim = new NpcSeatSim(h, { names: ['Fan 1', 'Fan 2', 'Fan 3'], rng, everyMs: [1000, 1000], stayMs: [5000, 5000] });
  sim.seed(0, 1);
  for (const s of h.seats.values()) assert.ok(s.owner?.npc, `${s.id} seeded`);
  let claims = 0;
  for (let t = 0; t < 30000; t += 500) for (const e of sim.step(t)) if (e.kind === 'claim') claims++;
  assert.ok(claims >= 25);
  for (const s of h.seats.values()) assert.ok(s.queue.length <= h.maxQueue);
});
