/**
 * Live-room state: comments, gifts, top fans, group roles, PK battles, rhythm
 * judging and the lucky wheel. Pure logic (no DOM, no Three.js) so it can be
 * unit tested in Node and shared with the server.
 */

export const ROLE_KEYS = ['idol', 'mc', 'tech', 'manager'];
export const MIN_IDOLS = 2; // 2 idols + MC + tech + manager = 5 members
export const MAX_IDOLS = 6; // 6 idols + 3 = 9 members
/** Animation modes the network may carry for players. */
export const ANIM_MODES = ['idle', 'walk', 'sit', 'talk', 'cheer', 'clap', 'wave', 'dance1', 'dance2', 'dance3', 'dance4', 'sing', 'singSit', 'game', 'type', 'mc', 'present', 'manager'];
export const FX_KEYS = ['confetti', 'smoke', 'laser', 'flash'];
export const ROOM_ID = /^(G[1-5]|N(0[1-9]|10)|S[1-5]|P[1-5])$/;

/** Fresh state for one room. */
export function createRoomState({ id, type, name, genre, theme = 'neon', idols = 0 }) {
  return {
    id,
    type,
    name,
    genre,
    theme,
    hearts: 0,
    giftTotal: 0,
    viewers: 0,
    comments: [],
    fans: {},
    idols: type === 'group' ? clampIdols(idols || 4) : 0,
    lastGift: null,
  };
}

export function clampIdols(n) {
  return Math.max(MIN_IDOLS, Math.min(MAX_IDOLS, Math.round(n)));
}

/** Total group members (idols + MC + tech + manager). */
export function memberCount(room) {
  return room.type === 'group' ? room.idols + 3 : 1;
}

/** Add a comment; keeps the newest `max`. */
export function pushComment(room, name, text, kind = 'npc', max = 8) {
  room.comments.push({ name, text, kind });
  if (room.comments.length > max) room.comments.splice(0, room.comments.length - max);
  return room.comments[room.comments.length - 1];
}

/** Record a gift. Returns its total value in coins. */
export function applyGift(room, from, gift, count = 1) {
  const n = Math.max(1, Math.floor(count));
  const value = gift.price * n;
  room.giftTotal += value;
  room.fans[from] = (room.fans[from] ?? 0) + value;
  room.lastGift = { from, giftId: gift.id, count: n, value };
  return value;
}

/** Top fans by gift value, highest first. */
export function topFans(room, n = 3) {
  return Object.entries(room.fans)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([name, value]) => ({ name, value }));
}

/** Gifts above this value get a full-screen banner and confetti. */
export function isBigGift(gift) {
  return gift.price >= 199;
}

// ------------------------------------------------------------------ PK battles

/** Start a PK between two group rooms. Times in ms. */
export function startPk(a, b, now, durationMs) {
  if (a === b) throw new Error('PK needs two different rooms');
  return { a, b, scoreA: 0, scoreB: 0, startsAt: now, endsAt: now + durationMs, done: false };
}

export function pkHas(pk, roomId) {
  return !!pk && !pk.done && (pk.a === roomId || pk.b === roomId);
}

/** Add points to whichever side `roomId` is. Returns true if counted. */
export function pkAddScore(pk, roomId, value) {
  if (!pkHas(pk, roomId)) return false;
  if (pk.a === roomId) pk.scoreA += value;
  else pk.scoreB += value;
  return true;
}

export function pkRemaining(pk, now) {
  return Math.max(0, pk.endsAt - now);
}

/** Share of side A in [0,1] for the progress bar (0.5 when both are 0). */
export function pkShare(pk) {
  const t = pk.scoreA + pk.scoreB;
  return t ? pk.scoreA / t : 0.5;
}

/** Final result; call once time is up. */
export function pkResult(pk) {
  if (pk.scoreA === pk.scoreB) return { draw: true, winner: null, loser: null };
  const aWins = pk.scoreA > pk.scoreB;
  return { draw: false, winner: aWins ? pk.a : pk.b, loser: aWins ? pk.b : pk.a };
}

// ------------------------------------------------------------------ rhythm game

/**
 * Judge a key press against the beat grid.
 * @param {number} t seconds since the room's music started
 * @param {number} bpm
 * @returns {{err:number, grade:'perfect'|'good'|'miss'}} err in seconds (signed, nearest beat)
 */
export function judgeBeat(t, bpm, perfect = 0.07, good = 0.15) {
  const beat = 60 / bpm;
  const phase = ((t % beat) + beat) % beat;
  const err = phase > beat / 2 ? phase - beat : phase;
  const a = Math.abs(err);
  return { err, grade: a <= perfect ? 'perfect' : a <= good ? 'good' : 'miss' };
}

/** Coins for a rhythm combo milestone (every 8 hits). */
export function comboReward(combo) {
  if (combo <= 0 || combo % 8 !== 0) return 0;
  return Math.min(30, 4 + combo / 2);
}

// ------------------------------------------------------------------ helpers

/** Weighted pick: items carry a numeric `w`. */
export function pickWeighted(rng, items) {
  const total = items.reduce((s, i) => s + i.w, 0);
  let r = rng() * total;
  for (const i of items) {
    r -= i.w;
    if (r < 0) return i;
  }
  return items[items.length - 1];
}

export function inRect(rect, x, z, pad = 0) {
  return x >= rect.minX - pad && x <= rect.maxX + pad && z >= rect.minZ - pad && z <= rect.maxZ + pad;
}

/** Distance from a point to a rectangle (0 inside). */
export function distToRect(rect, x, z) {
  const dx = Math.max(rect.minX - x, 0, x - rect.maxX);
  const dz = Math.max(rect.minZ - z, 0, z - rect.maxZ);
  return Math.hypot(dx, dz);
}

/** Seconds left on a cooldown that started at `since` (ms). */
export function cooldownLeft(since, now, seconds) {
  if (!since) return 0;
  return Math.max(0, seconds - (now - since) / 1000);
}
