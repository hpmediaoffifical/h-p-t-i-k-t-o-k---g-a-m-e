/**
 * Game clock and camp schedule. Pure logic: no DOM, no three.js, so it runs in
 * Node tests. Game time is derived from wall-clock time, so every client that
 * shares the same epoch shows the same camp time.
 */

export const MINUTES_PER_DAY = 1440;

/** Parse "HH:MM" into a minute-of-day number. Throws on malformed input. */
export function parseHM(text) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(text).trim());
  if (!match) throw new Error(`Giờ không hợp lệ: ${text}`);
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) throw new Error(`Giờ không hợp lệ: ${text}`);
  return h * 60 + m;
}

/** Format a minute-of-day (any real number, wraps around) as "HH:MM". */
export function formatHM(minute) {
  const m = ((Math.floor(minute) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Sort schedule entries and attach `startMin`. Requires at least one entry. */
export function compileSchedule(entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('Lịch trại trống');
  return entries
    .map((e) => ({ ...e, startMin: parseHM(e.start) }))
    .sort((a, b) => a.startMin - b.startMin)
    .map((e, index) => ({ ...e, index }));
}

/** Return the schedule entry active at `minuteOfDay` (wraps to the last entry before the first start). */
export function phaseAt(schedule, minuteOfDay) {
  let current = schedule[schedule.length - 1];
  for (const p of schedule) {
    if (p.startMin <= minuteOfDay) current = p;
    else break;
  }
  return current;
}

/** Minutes until the phase after `minuteOfDay` starts. */
export function minutesToNextPhase(schedule, minuteOfDay) {
  for (const p of schedule) if (p.startMin > minuteOfDay) return p.startMin - minuteOfDay;
  return MINUTES_PER_DAY - minuteOfDay + schedule[0].startMin;
}

/** Wall-clock driven game clock. */
export class GameClock {
  /**
   * @param {{msPerGameMinute:number, startMinute:number, epochMs:number}} opts
   */
  constructor({ msPerGameMinute, startMinute, epochMs }) {
    if (!(msPerGameMinute > 0)) throw new Error('msPerGameMinute phải > 0');
    this.msPerGameMinute = msPerGameMinute;
    this.startMinute = startMinute;
    this.epochMs = epochMs;
    this.skipMinutes = 0;
  }

  /** Re-anchor to a shared epoch (used when the server tells us its start time). */
  sync(epochMs) {
    this.epochMs = epochMs;
    this.skipMinutes = 0;
  }

  /** Total game minutes since day 0, 00:00. */
  totalMinutes(nowMs) {
    return this.startMinute + (nowMs - this.epochMs) / this.msPerGameMinute + this.skipMinutes;
  }

  /** @returns {{day:number, minuteOfDay:number, total:number}} */
  snapshot(nowMs) {
    const total = this.totalMinutes(nowMs);
    const day = Math.floor(total / MINUTES_PER_DAY);
    return { day, minuteOfDay: total - day * MINUTES_PER_DAY, total };
  }

  /** Jump forward to the next occurrence of `targetMinuteOfDay` (offline sleep). */
  skipTo(nowMs, targetMinuteOfDay) {
    const { minuteOfDay } = this.snapshot(nowMs);
    let delta = targetMinuteOfDay - minuteOfDay;
    if (delta <= 0) delta += MINUTES_PER_DAY;
    this.skipMinutes += delta;
    return delta;
  }
}
