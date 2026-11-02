/**
 * Who owns each solo room (stand / sing / game). Group stages are not here.
 *
 * Rules:
 *  - Gifting a room ticket makes you the owner of an empty room right away.
 *  - A new owner is protected for `holdMs` (60 s): anyone else who gifts joins the
 *    room's queue and gets in by turn.
 *  - When the protection is over and someone is queued, the first in line takes over.
 *  - When it is over and nobody is queued, the owner stays. A newcomer who gifts is
 *    sent to an empty room of the same type if one exists, otherwise takes the room.
 *
 * Pure logic (no DOM): shared by the browser (offline play) and the LAN server.
 */

export const SEAT_TYPES = ['stand', 'sing', 'game'];

export class SeatHouse {
  /**
   * @param {{rooms: {id:string,type:string}[], holdMs?: number, maxQueue?: number}} opts
   */
  constructor({ rooms, holdMs = 60000, maxQueue = 6 }) {
    this.holdMs = holdMs;
    this.maxQueue = maxQueue;
    this.seats = new Map();
    for (const r of rooms) {
      if (SEAT_TYPES.includes(r.type)) this.seats.set(r.id, { id: r.id, type: r.type, owner: null, since: 0, queue: [] });
    }
  }

  get(id) {
    return this.seats.get(id) ?? null;
  }

  /** Milliseconds of protection left for the current owner (0 when free to take). */
  lockLeft(id, now) {
    const s = this.seats.get(id);
    if (!s?.owner) return 0;
    return Math.max(0, this.holdMs - (now - s.since));
  }

  /** The room `whoId` owns, or null. */
  ownedBy(whoId) {
    for (const s of this.seats.values()) if (s.owner?.id === whoId) return s;
    return null;
  }

  /** The room whose queue `whoId` is in, with the 1-based position. */
  queuedIn(whoId) {
    for (const s of this.seats.values()) {
      const i = s.queue.findIndex((q) => q.id === whoId);
      if (i >= 0) return { seat: s, position: i + 1 };
    }
    return null;
  }

  /** An empty room of this type (lowest id first), or null. */
  emptyOfType(type) {
    for (const s of this.seats.values()) if (s.type === type && !s.owner && !s.queue.length) return s;
    return null;
  }

  _own(s, who, now) {
    s.owner = { ...who };
    s.since = now;
  }

  _dropFromQueues(whoId) {
    for (const s of this.seats.values()) s.queue = s.queue.filter((q) => q.id !== whoId);
  }

  /**
   * Someone gifted a ticket for room `id`.
   * @param {{id:string|number, name:string, npc?:boolean}} who
   * @returns {{result:'own'|'queue'|'takeover'|'redirect'|'already'|'busy'|'full'|'invalid', room?:string, position?:number, from?:object}}
   *   own: got an empty room; takeover: replaced `from`; redirect: got empty `room` instead;
   *   queue: waiting at `position`; busy: already owns another room; full: queue is full.
   */
  claim(id, who, now) {
    const s = this.seats.get(id);
    if (!s) return { result: 'invalid' };
    if (s.owner?.id === who.id) return { result: 'already', room: id };
    const owned = this.ownedBy(who.id);
    if (owned) return { result: 'busy', room: owned.id };
    const queued = s.queue.findIndex((q) => q.id === who.id);
    if (queued >= 0) return { result: 'queue', room: id, position: queued + 1 };
    this._dropFromQueues(who.id);

    if (!s.owner) {
      this._own(s, who, now);
      return { result: 'own', room: id };
    }
    const protectedNow = now - s.since < this.holdMs;
    if (protectedNow || s.queue.length) {
      if (s.queue.length >= this.maxQueue) return { result: 'full', room: id };
      s.queue.push({ ...who });
      return { result: 'queue', room: id, position: s.queue.length };
    }
    const empty = this.emptyOfType(s.type);
    if (empty) {
      this._own(empty, who, now);
      return { result: 'redirect', room: empty.id };
    }
    const from = s.owner;
    this._own(s, who, now);
    return { result: 'takeover', room: id, from };
  }

  /** Owner leaves (or is removed); the next in line moves in. Returns the change or null. */
  leave(id, whoId, now) {
    const s = this.seats.get(id);
    if (!s) return null;
    if (s.owner?.id !== whoId) {
      const before = s.queue.length;
      s.queue = s.queue.filter((q) => q.id !== whoId);
      return before !== s.queue.length ? { room: id, kind: 'unqueue', who: whoId } : null;
    }
    const from = s.owner;
    const next = s.queue.shift() ?? null;
    s.owner = null;
    if (next) this._own(s, next, now);
    return { room: id, kind: next ? 'promote' : 'empty', from, to: next };
  }

  /** Remove a player everywhere (disconnect). Returns the changes. */
  removeEverywhere(whoId, now) {
    const out = [];
    for (const s of this.seats.values()) {
      const c = this.leave(s.id, whoId, now);
      if (c) out.push(c);
    }
    return out;
  }

  /** Protection over and someone waiting → the first in line takes over. */
  tick(now) {
    const out = [];
    for (const s of this.seats.values()) {
      if (s.owner && s.queue.length && now - s.since >= this.holdMs) {
        const from = s.owner;
        const to = s.queue.shift();
        this._own(s, to, now);
        out.push({ room: s.id, kind: 'promote', from, to });
      }
    }
    return out;
  }

  /** Plain copy for the network / UI. */
  snapshot(id) {
    const s = this.seats.get(id);
    return s ? { owner: s.owner ? { ...s.owner } : null, since: s.since, queue: s.queue.map((q) => ({ ...q })) } : null;
  }

  /** Replace one room's state from a snapshot (client following the server). */
  load(id, snap) {
    const s = this.seats.get(id);
    if (!s || !snap) return;
    s.owner = snap.owner ? { ...snap.owner } : null;
    s.since = snap.since ?? 0;
    s.queue = (snap.queue ?? []).map((q) => ({ ...q }));
  }
}

/**
 * NPC fans gifting tickets so solo rooms always carry gifters' names.
 * Call `step(now)` often; returns claim results and leaves that happened.
 */
export class NpcSeatSim {
  /**
   * @param {SeatHouse} house
   * @param {{names:string[], rng:()=>number, everyMs?:[number,number], stayMs?:[number,number]}} opts
   */
  constructor(house, { names, rng, everyMs = [7000, 16000], stayMs = [90000, 300000] }) {
    this.house = house;
    this.names = names;
    this.rng = rng;
    this.everyMs = everyMs;
    this.stayMs = stayMs;
    this.nextAt = 0;
    this.n = 0;
  }

  _between([a, b]) {
    return a + (b - a) * this.rng();
  }

  _who() {
    const name = this.names[Math.floor(this.rng() * this.names.length)];
    return { id: `npc:${name}:${this.n++}`, name, npc: true, leaveAfter: Math.round(this._between(this.stayMs)) };
  }

  /** Fill most rooms at start so the building looks alive. */
  seed(now, share = 0.8) {
    for (const s of this.house.seats.values()) {
      if (this.rng() < share) {
        const who = this._who();
        s.owner = who;
        s.since = now - this.house.holdMs - Math.round(this.rng() * 60000); // already past protection
      }
    }
  }

  step(now) {
    const events = [];
    // NPC owners leave when their stay is over (only if nobody real is waiting... queue moves in)
    for (const s of this.house.seats.values()) {
      if (s.owner?.npc && now - s.since > s.owner.leaveAfter) {
        const c = this.house.leave(s.id, s.owner.id, now);
        if (c) events.push(c);
      }
    }
    if (now >= this.nextAt) {
      this.nextAt = now + this._between(this.everyMs);
      const ids = [...this.house.seats.keys()];
      const id = ids[Math.floor(this.rng() * ids.length)];
      const who = this._who();
      const r = this.house.claim(id, who, now);
      events.push({ room: r.room ?? id, kind: 'claim', result: r, who: { id: who.id, name: who.name, npc: true } });
    }
    return events;
  }
}
