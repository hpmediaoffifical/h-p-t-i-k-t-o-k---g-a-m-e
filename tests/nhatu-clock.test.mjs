import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHM, formatHM, compileSchedule, phaseAt, minutesToNextPhase, GameClock } from '../public/games/nhatu/js/logic/clock.js';

const SCHEDULE = compileSchedule([
  { start: '21:00', key: 'sleep', label: 'Giờ ngủ' },
  { start: '00:00', key: 'sleep', label: 'Giờ ngủ' },
  { start: '05:30', key: 'rollcall', label: 'Điểm danh' },
  { start: '10:00', key: 'free', label: 'Giờ tự do' },
]);

test('parseHM parses and rejects', () => {
  assert.equal(parseHM('10:25'), 625);
  assert.equal(parseHM('0:00'), 0);
  assert.throws(() => parseHM('24:00'));
  assert.throws(() => parseHM('abc'));
});

test('formatHM wraps around the day', () => {
  assert.equal(formatHM(625), '10:25');
  assert.equal(formatHM(1440 + 61.9), '01:01');
  assert.equal(formatHM(-1), '23:59');
});

test('compileSchedule sorts by start time', () => {
  assert.deepEqual(SCHEDULE.map((p) => p.start), ['00:00', '05:30', '10:00', '21:00']);
});

test('phaseAt picks the active phase', () => {
  assert.equal(phaseAt(SCHEDULE, 625).key, 'free');
  assert.equal(phaseAt(SCHEDULE, 330).key, 'rollcall');
  assert.equal(phaseAt(SCHEDULE, 329.9).key, 'sleep');
  assert.equal(phaseAt(SCHEDULE, 1300).start, '21:00');
});

test('minutesToNextPhase wraps past midnight', () => {
  assert.equal(minutesToNextPhase(SCHEDULE, 600), 660);
  assert.equal(minutesToNextPhase(SCHEDULE, 1430), 10);
});

test('GameClock derives time from the epoch', () => {
  const clock = new GameClock({ msPerGameMinute: 1000, startMinute: 625, epochMs: 0 });
  assert.equal(clock.snapshot(0).minuteOfDay, 625);
  const later = clock.snapshot(1000 * 60 * 24); // 24 game hours later
  assert.equal(later.day, 1);
  assert.equal(Math.round(later.minuteOfDay), 625);
});

test('GameClock.skipTo always moves forward', () => {
  const clock = new GameClock({ msPerGameMinute: 1000, startMinute: 22 * 60, epochMs: 0 });
  const delta = clock.skipTo(0, 330);
  assert.equal(delta, 2 * 60 + 330);
  const s = clock.snapshot(0);
  assert.equal(s.day, 1);
  assert.equal(s.minuteOfDay, 330);
});
