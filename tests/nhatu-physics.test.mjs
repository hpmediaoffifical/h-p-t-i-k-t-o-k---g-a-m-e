import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld, makeBox, stepBody, STEP_UP } from '../public/games/nhatu/js/logic/physics.js';

const GRAVITY = 18;
const body = (x, y, z) => ({ pos: { x, y, z }, vy: 0, grounded: true, radius: 0.35, height: 1.6 });

test('a wall pushes the body back', () => {
  const w = new CollisionWorld();
  w.add(makeBox(1, 2, 0, 3, -5, 5, false));
  const b = body(0, 0, 0);
  for (let i = 0; i < 60; i++) stepBody(b, 3, 0, 1 / 60, w, GRAVITY);
  assert.ok(b.pos.x <= 1 - 0.35 + 1e-6, `x=${b.pos.x}`);
});

test('a low step is climbed, a high box is not', () => {
  const w = new CollisionWorld();
  w.add(makeBox(1, 3, 0, STEP_UP - 0.05, -2, 2, true));
  w.add(makeBox(5, 7, 0, 0.78, -2, 2, true));
  const b = body(0, 0, 0);
  for (let i = 0; i < 60; i++) stepBody(b, 3, 0, 1 / 60, w, GRAVITY);
  assert.ok(Math.abs(b.pos.y - (STEP_UP - 0.05)) < 1e-6, 'stands on the step');
  for (let i = 0; i < 120; i++) stepBody(b, 3, 0, 1 / 60, w, GRAVITY);
  assert.ok(b.pos.x < 5, 'blocked by the table');
});

test('body walks under a high slab', () => {
  const w = new CollisionWorld();
  w.add(makeBox(1, 5, 3.1, 3.4, -2, 2, true));
  const b = body(0, 0, 0);
  for (let i = 0; i < 60; i++) stepBody(b, 3, 0, 1 / 60, w, GRAVITY);
  assert.ok(b.pos.x > 2.5);
  assert.equal(b.pos.y, 0);
});

test('stairs lead up to a balcony', () => {
  const w = new CollisionWorld();
  const steps = 12;
  for (let k = 0; k < steps; k++) {
    const x0 = 1 + k * 0.5;
    w.add(makeBox(x0, x0 + 0.5, 0, ((k + 1) * 3.4) / steps, -1, 1, true));
  }
  w.add(makeBox(7, 12, 3.1, 3.4, -1, 1, true));
  const b = body(0, 0, 0);
  for (let i = 0; i < 240; i++) stepBody(b, 2.5, 0, 1 / 60, w, GRAVITY);
  assert.ok(b.pos.x > 7, `x=${b.pos.x}`);
  assert.ok(Math.abs(b.pos.y - 3.4) < 1e-6, `y=${b.pos.y}`);
});

test('jumping lands back on the floor', () => {
  const w = new CollisionWorld();
  const b = body(0, 0, 0);
  b.vy = 6;
  b.grounded = false;
  let maxY = 0;
  for (let i = 0; i < 120; i++) {
    stepBody(b, 0, 0, 1 / 60, w, GRAVITY);
    maxY = Math.max(maxY, b.pos.y);
  }
  assert.ok(maxY > 0.8);
  assert.equal(b.pos.y, 0);
  assert.ok(b.grounded);
});

test('isFree detects overlap', () => {
  const w = new CollisionWorld();
  w.add(makeBox(-1, 1, 0, 2, -1, 1, false));
  assert.equal(w.isFree(0, 0, 0, 0.3, 1.6), false);
  assert.equal(w.isFree(3, 0, 0, 0.3, 1.6), true);
});
