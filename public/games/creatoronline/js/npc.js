/**
 * NPCs of the Creator building.
 *
 * - Streamers stay at their spot: standing presenters, seated singers, gamers.
 * - Group stages have members by role: idols (2–6, dancing in sync with the
 *   room's beat clock), an MC, a technician at the console and a manager.
 * - Fans wander the hall with lightsticks, walk to a room, watch and cheer,
 *   then move on. Navigation is waypoint-based around the central island.
 */
import { stepBody } from './logic/physics.js';
import { createCharacter, animateCharacter, setProps, setLook } from './character.js';
import { attachLabel } from './labels.js';

// Bản đi dạo dùng nhãn CSS2D (labels.js); bản LIVE cắm LabelLayer (label-layer.js) trước khi dựng nhân vật.
let makeLabel = attachLabel;
/** @param {(char, name:string, kind:string) => object} fn */
export function setLabelFactory(fn) {
  makeLabel = fn;
}
import { pick, range, shuffled } from './logic/rng.js';
import { MAX_IDOLS } from './logic/rooms.js';

/** Shortest signed angle difference. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Create a physical actor (shared by NPCs, the player and remote players). */
export function makeActor(scene, { name, look, kind, x, z, y = 0 }) {
  const char = createCharacter(look);
  scene.add(char.root);
  const label = makeLabel(char, name, kind);
  const actor = {
    name,
    kind,
    char,
    label,
    body: { pos: { x, y, z }, vy: 0, grounded: true, radius: 0.34, height: 1.6 },
    ry: 0,
    mode: 'idle',
    speed: 0,
    seat: null,
    hidden: false,
  };
  syncActor(actor);
  return actor;
}

/** Copy the physics position/rotation to the render object. */
export function syncActor(a) {
  a.char.root.position.set(a.body.pos.x, a.body.pos.y, a.body.pos.z);
  a.char.root.rotation.y = a.ry;
}

/** Turn an actor smoothly toward `target` yaw. */
export function turnToward(a, target, dt, rate = 10) {
  a.ry += angleDelta(a.ry, target) * Math.min(1, dt * rate);
}

export function setHidden(a, hidden) {
  a.hidden = hidden;
  a.char.root.visible = !hidden;
  a.label.obj.visible = !hidden;
}

/** Push overlapping moving actors apart (fixed streamers never move). */
export function separateActors(list) {
  const n = list.length;
  for (let i = 0; i < n; i++) {
    const a = list[i];
    if (a.hidden) continue;
    for (let j = i + 1; j < n; j++) {
      const b = list[j];
      if (b.hidden || (a.fixed && b.fixed)) continue;
      const dx = b.body.pos.x - a.body.pos.x;
      const dz = b.body.pos.z - a.body.pos.z;
      if (Math.abs(b.body.pos.y - a.body.pos.y) > 1) continue;
      const d2 = dx * dx + dz * dz;
      const min = a.body.radius + b.body.radius;
      if (d2 >= min * min || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      const ux = dx / d;
      const uz = dz / d;
      if (a.fixed) {
        b.body.pos.x += ux * push * 2;
        b.body.pos.z += uz * push * 2;
      } else if (b.fixed || b.isPlayer) {
        a.body.pos.x -= ux * push * 2;
        a.body.pos.z -= uz * push * 2;
      } else if (a.isPlayer) {
        b.body.pos.x += ux * push * 2;
        b.body.pos.z += uz * push * 2;
      } else {
        a.body.pos.x -= ux * push;
        a.body.pos.z -= uz * push;
        b.body.pos.x += ux * push;
        b.body.pos.z += uz * push;
      }
    }
  }
}

const IDOL_OUTFITS = ['idolPink', 'idolWhite', 'idolBlack', 'idolRed', 'idolMint'];
const CASUAL = ['hoodie', 'tee', 'street', 'cozy', 'purple', 'yellow', 'gamer'];
const HAIRS = ['brown', 'black', 'blonde', 'pink', 'blue', 'silver', 'red'];
const ROLE_ICON = { mc: '🎙️', tech: '🎛️', manager: '📋', idol: '💃' };
const STICK_COLORS = [0xff4fa3, 0x35d0ff, 0x3be38f, 0xffd23f, 0x9b5cff];

/** Which corridor a point is in (outside rooms). */
function zoneOf(p) {
  if (p.z < -8.3) return 'N';
  if (p.z > 8.3) return 'S';
  if (p.x < -21.5) return 'W';
  if (p.x > 21.5) return 'E';
  return 'N';
}

/** Waypoints between two corridor points that avoid the central island. */
export function corridorPath(a, b) {
  const za = zoneOf(a);
  const zb = zoneOf(b);
  if (za === zb) return [];
  const sideX = (s) => (s === 'W' ? -25.5 : 25.5);
  const rowZ = (s) => (s === 'N' ? -11 : 11);
  const isRow = (s) => s === 'N' || s === 'S';
  if (isRow(za) && isRow(zb)) {
    const sx = (a.x + b.x) / 2 < 0 ? -25.5 : 25.5;
    return [{ x: sx, z: rowZ(za) }, { x: sx, z: rowZ(zb) }];
  }
  if (isRow(za)) return [{ x: sideX(zb), z: rowZ(za) }];
  if (isRow(zb)) return [{ x: sideX(za), z: rowZ(zb) }];
  return [{ x: sideX(za), z: -11 }, { x: sideX(zb), z: -11 }];
}

export class NpcManager {
  /**
   * @param {{scene, world, cfg, rng, states:Map}} deps
   */
  constructor({ scene, world, cfg, rng, states }) {
    this.scene = scene;
    this.world = world;
    this.cfg = cfg;
    this.rng = rng;
    this.states = states;
    this.gravity = cfg.tuning.gravity;
    this.speed = cfg.tuning.npcWalkSpeed;
    this.streamers = []; // everyone fixed in a room
    this.fans = [];
    this.queuers = []; // people waiting in line beside a solo room
    this.byRoom = new Map(); // roomId -> {main, members:{mc,tech,manager,idols[]}}
    this._all = null; // mảng gộp dựng lại khi danh sách đổi (trước đây concat mỗi khung)
  }

  get all() {
    this._all ??= this.streamers.concat(this.fans, this.queuers);
    return this._all;
  }

  /** Same name, same look: a gifter keeps their appearance from the queue into the room. */
  lookFromName(name, type) {
    let h = 2166136261;
    for (const ch of String(name)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    const at = (list, shift) => list[(h >>> shift) % list.length];
    const outfits = type === 'game' ? ['gamer', 'hoodie', 'street'] : type === 'sing' ? ['singer', 'cozy', 'idolWhite', 'purple'] : CASUAL;
    return { outfit: at(outfits, 3), hair: at(HAIRS, 7), hairStyle: at(['short', 'short', 'long', 'bun', 'twin'], 11), hat: (h >>> 15) % 5 === 0 ? 'cap' : 'none' };
  }

  /**
   * The gifter who owns a solo room: rename and re-dress the room's streamer,
   * or hide it (empty room, or a real player sits there).
   */
  setSoloHost(roomId, owner, playerOwned) {
    const e = this.byRoom.get(roomId);
    if (!e || e.members) return;
    const a = e.main;
    if (!owner || playerOwned) {
      setHidden(a, true);
      return;
    }
    if (a.baseName !== owner.name) {
      a.baseName = owner.name;
      a.name = owner.name;
      a.label.setName(owner.name);
      setLook(a.char, this.lookFromName(owner.name, a.room.type));
    }
    setHidden(a, false);
  }

  /** Someone joins the line beside `room`: walks in from the corridor to their spot. */
  addQueuer(name, room, spot) {
    const from = { x: spot.x + (Math.random() - 0.5) * 2, z: spot.z + (room.out ?? 1) * 4 };
    const a = makeActor(this.scene, { name: `⏳ ${name}`, look: this.lookFromName(name, room.type), kind: 'npc', x: from.x, z: from.z });
    setProps(a.char, { stick: true, stickColor: pick(this.rng, STICK_COLORS) });
    Object.assign(a, { role: 'queue', baseName: name, room, spot, path: [{ x: spot.x, z: spot.z }], walkT: 0 });
    this.queuers.push(a);
    this._all = null;
    return a;
  }

  /** Move a waiting person to a new place in the line. */
  moveQueuer(a, spot, position) {
    a.spot = spot;
    a.path = [{ x: spot.x, z: spot.z }];
    a.walkT = 0;
    a.label.setName(`⏳${position} ${a.baseName}`);
  }

  removeQueuer(a) {
    this.scene.remove(a.char.root);
    a.label.dispose();
    this.queuers = this.queuers.filter((q) => q !== a);
    this._all = null;
  }

  /** Spawn streamers for every room and the wandering fans. */
  spawn() {
    const { rng, world, cfg } = this;
    this._all = null;
    const names = shuffled(rng, cfg.creatorNames);
    let ni = 0;
    const nextName = () => names[ni++ % names.length];
    for (const room of world.rooms) {
      const st = this.states.get(room.id);
      if (room.type === 'group') {
        const members = { idols: [] };
        const mk = (role, spot, look, props) => {
          const name = nextName();
          const a = makeActor(this.scene, { name: `${ROLE_ICON[role]} ${name}`, look, kind: 'npc', x: spot.x, y: spot.y, z: spot.z });
          Object.assign(a, { fixed: true, role, room, spot, baseName: name, roleMode: role === 'idol' ? 'dance1' : role });
          a.ry = spot.ry;
          setProps(a.char, props);
          this.streamers.push(a);
          return a;
        };
        members.mc = mk('mc', room.spots.mc, { outfit: 'mcSuit', hair: pick(rng, HAIRS), hat: 'none' }, { mic: true });
        members.tech = mk('tech', room.spots.tech, { outfit: 'tech', hair: pick(rng, HAIRS), hat: rng() < 0.4 ? 'cap' : 'none' }, { headset: true });
        members.manager = mk('manager', room.spots.manager, { outfit: 'manager', hair: pick(rng, ['black', 'brown', 'silver']), hat: 'none' }, { clipboard: true });
        // each group has its own uniform set and hair styles (Vitamin B: boys' cuts and caps)
        const def = room.def;
        const outfits = def.outfits?.length ? def.outfits : [pick(rng, IDOL_OUTFITS)];
        const hairs = def.hair?.length ? def.hair : HAIRS;
        const styles = def.hairStyles?.length ? def.hairStyles : ['short'];
        for (let k = 0; k < MAX_IDOLS; k++) {
          const look = {
            outfit: outfits[k % outfits.length],
            hair: pick(rng, hairs),
            hairStyle: styles[k % styles.length],
            hat: def.style === 'boy' && rng() < 0.35 ? 'cap' : 'none',
          };
          const a = mk('idol', room.spots.idols[k], look, { mic: k < 2 });
          a.slot = k;
          members.idols.push(a);
        }
        this.byRoom.set(room.id, { main: members.mc, members });
        st.streamer = members.mc.baseName;
        this.applyRoles(room.id);
      } else {
        const name = nextName();
        const spot = room.spots.streamer;
        const look = { outfit: room.type === 'game' ? 'gamer' : room.type === 'sing' ? pick(rng, ['singer', 'cozy', 'idolWhite']) : pick(rng, CASUAL), hair: pick(rng, HAIRS), hat: rng() < 0.2 ? 'cap' : 'none' };
        const a = makeActor(this.scene, { name, look, kind: 'npc', x: spot.x, y: spot.y, z: spot.z });
        Object.assign(a, { fixed: true, role: room.type, room, spot, baseName: name });
        a.ry = spot.ry;
        setProps(a.char, { mic: room.type === 'sing', headset: room.type === 'game' });
        this.streamers.push(a);
        this.byRoom.set(room.id, { main: a, members: null });
        st.streamer = name;
      }
    }
    const fanNames = shuffled(rng, cfg.fanNames);
    for (let i = 0; i < cfg.tuning.audienceCount; i++) {
      const p = this.randomCorridorPoint();
      const a = makeActor(this.scene, { name: fanNames[i % fanNames.length], look: { outfit: pick(rng, CASUAL), hair: pick(rng, HAIRS), hat: rng() < 0.25 ? pick(rng, ['cap', 'red']) : 'none' }, kind: 'npc', x: p.x, z: p.z });
      const stickColor = pick(rng, STICK_COLORS);
      setProps(a.char, { stick: true, stickColor });
      Object.assign(a, { role: 'fan', path: [], wait: range(rng, 0, 3), target: null, spot: null, stay: 0, stuckT: 0, stuckRef: { ...p }, stuckCount: 0, watchMode: 'idle' });
      a.ry = range(rng, -Math.PI, Math.PI);
      this.fans.push(a);
    }
  }

  randomCorridorPoint() {
    const areas = [
      { minX: -40, maxX: 40, minZ: -20, maxZ: -10 },
      { minX: -40, maxX: 40, minZ: 10, maxZ: 27 },
      { minX: -40, maxX: -23, minZ: -7, maxZ: 7 },
      { minX: 23, maxX: 40, minZ: -7, maxZ: 7 },
    ];
    for (let i = 0; i < 30; i++) {
      const a = pick(this.rng, areas);
      const x = range(this.rng, a.minX, a.maxX);
      const z = range(this.rng, a.minZ, a.maxZ);
      if (this.world.collision.isFree(x, 0, z, 0.5, 1.6)) return { x, z };
    }
    return { x: 0, z: 14 };
  }

  /**
   * Show the members a group needs: `state.idols` idols, and step aside for
   * every role or idol slot a real player holds (state.holders).
   */
  applyRoles(roomId) {
    const m = this.byRoom.get(roomId)?.members;
    if (!m) return;
    const st = this.states.get(roomId);
    const h = st.holders ?? { idol: {} };
    for (const r of ['mc', 'tech', 'manager']) setHidden(m[r], !!h[r]);
    m.idols.forEach((a, k) => setHidden(a, k >= st.idols || !!h.idol[k]));
  }

  /** The NPC who talks for a room (MC for groups if present). */
  speaker(roomId) {
    const e = this.byRoom.get(roomId);
    if (!e) return null;
    if (e.members && e.members.mc.hidden) {
      const idol = e.members.idols.find((a) => !a.hidden);
      return idol ?? null;
    }
    return e.main;
  }

  /** Pick the next room for a fan. Group stages are popular. */
  chooseRoom() {
    const rooms = this.world.rooms;
    const weighted = [];
    for (const r of rooms) {
      const w = r.type === 'group' ? 4 : 1;
      for (let i = 0; i < w; i++) weighted.push(r);
    }
    return pick(this.rng, weighted);
  }

  /** Plan a route for a fan to a watch spot in/at `room`. */
  sendFan(a, room) {
    const spots = room.type === 'group' ? room.audienceSpots : room.viewSpots;
    const free = spots.filter((s) => !s.occupant);
    if (!free.length) {
      a.wait = range(this.rng, 1, 3);
      return;
    }
    const spot = pick(this.rng, free);
    spot.occupant = a;
    const pos = a.body.pos;
    const pts = [];
    const cur = this.world.roomAt(pos.x, pos.z);
    let start = { x: pos.x, z: pos.z };
    if (cur) {
      pts.push(cur.door.in, cur.door.out);
      start = cur.door.out;
    }
    const inside = room.type === 'group';
    const end = inside ? room.door.out : spot;
    pts.push(...corridorPath(start, end));
    if (inside) pts.push(room.door.out, room.door.in);
    pts.push({ x: spot.x + range(this.rng, -0.2, 0.2), z: spot.z + range(this.rng, -0.2, 0.2) });
    a.path = pts.map((p) => ({ x: p.x, z: p.z }));
    a.spot = spot;
    a.target = room;
    a.stay = 0;
    a.mode = 'walk';
    a.stuckT = 0;
    a.stuckCount = 0;
    a.stuckRef = { x: pos.x, z: pos.z };
  }

  releaseSpot(a) {
    if (a.spot?.occupant === a) a.spot.occupant = null;
    a.spot = null;
  }

  /**
   * @param {number} dt
   * @param {{beat:(id)=>number, onCheer:(fan, room)=>void}} ctx
   */
  update(dt, ctx) {
    const { rng } = this;
    // streamers
    for (const a of this.streamers) {
      if (a.hidden) continue;
      const room = a.room;
      const st = this.states.get(room.id);
      const beat = ctx.beat(room.id);
      a.talkT = Math.max(0, (a.talkT ?? 0) - dt);
      let mode;
      if (room.type === 'group') {
        if (a.role === 'idol') {
          const order = st.genre === 'hiphop' ? ['dance4', 'dance1', 'dance3', 'dance2'] : ['dance1', 'dance2', 'dance4', 'dance3'];
          mode = order[Math.floor(beat / 16) % order.length];
          if (a.slot < 2 && Math.floor(beat / 32) % 2 === 1) mode = 'sing';
        } else if (a.role === 'mc') mode = a.talkT > 0 ? 'mc' : Math.floor(beat / 8) % 3 === 0 ? 'clap' : 'mc';
        else if (a.role === 'tech') mode = 'type';
        else mode = Math.floor(beat / 16) % 4 === 3 ? 'clap' : 'manager';
      } else if (room.type === 'stand') mode = a.talkT > 0 ? 'present' : Math.floor(beat / 8) % 3 === 2 ? 'talk' : 'present';
      else if (room.type === 'sing') mode = 'singSit';
      else mode = 'game';
      if (a.forceMode) mode = a.forceMode; // bản LIVE: idol nhóm thua PK nhảy phạt, Gala…
      a.mode = mode;
      if (!a.far) animateCharacter(a.char, dt, { mode, speed: 0, beat });
    }
    // people waiting their turn beside a room: they watch and cheer too
    for (const a of this.queuers) {
      if (a.path.length) {
        // straight walk to the spot; if something is in the way for 3 s, just step into line
        const p = a.body.pos;
        const dx = a.spot.x - p.x;
        const dz = a.spot.z - p.z;
        const d = Math.hypot(dx, dz);
        a.walkT = (a.walkT ?? 0) + dt;
        if (d < 0.3 || a.walkT > 3) {
          if (d >= 0.3) {
            p.x = a.spot.x;
            p.z = a.spot.z;
          }
          a.path = [];
          a.walkT = 0;
        } else {
          const vx = (dx / d) * this.speed;
          const vz = (dz / d) * this.speed;
          a.ry += angleDelta(a.ry, Math.atan2(vx, vz)) * Math.min(1, dt * 8);
          stepBody(a.body, vx, vz, dt, this.world.collision, this.gravity);
          a.mode = 'walk';
          if (!a.far) animateCharacter(a.char, dt, { mode: 'walk', speed: this.speed });
        }
        continue;
      }
      a.ry += angleDelta(a.ry, a.spot.ry) * Math.min(1, dt * 6);
      const beat = ctx.beat(a.room.id);
      a.mode = Math.floor(beat / 8) % 3 === 1 ? 'clap' : 'wave';
      if (!a.far) animateCharacter(a.char, dt, { mode: a.mode, speed: 0, beat });
    }
    // fans
    for (const a of this.fans) {
      if (a.path.length) {
        this.walk(a, dt);
      } else if (a.target) {
        // watching
        a.ry += angleDelta(a.ry, a.spot?.ry ?? a.ry) * Math.min(1, dt * 6);
        a.stay += dt;
        const beat = ctx.beat(a.target.id);
        a.mode = a.target.type === 'group' ? (Math.floor(beat / 8) % 3 === 2 ? 'clap' : 'wave') : a.target.type === 'game' ? 'idle' : Math.floor(beat / 8) % 2 ? 'clap' : 'idle';
        if (a.stay > (a.watchFor ?? 20)) {
          this.releaseSpot(a);
          a.target = null;
          a.wait = range(rng, 0.5, 2.5);
        } else if (rng() < dt * 0.04) ctx.onCheer?.(a, a.target);
        if (!a.far) animateCharacter(a.char, dt, { mode: a.mode, speed: 0, beat });
        stepBody(a.body, 0, 0, dt, this.world.collision, this.gravity);
      } else {
        a.wait -= dt;
        a.mode = 'idle';
        if (!a.far) animateCharacter(a.char, dt, { mode: 'idle', speed: 0 });
        if (a.wait <= 0) {
          a.watchFor = range(rng, 14, 40);
          this.sendFan(a, this.chooseRoom());
        }
      }
    }
  }

  walk(a, dt) {
    const p = a.body.pos;
    const t = a.path[0];
    const dx = t.x - p.x;
    const dz = t.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.35) {
      a.path.shift();
      if (!a.path.length) {
        a.mode = 'idle';
        a.speed = 0;
      }
      if (!a.far) animateCharacter(a.char, dt, { mode: 'walk', speed: this.speed });
      return;
    }
    const vx = (dx / d) * this.speed;
    const vz = (dz / d) * this.speed;
    a.ry += angleDelta(a.ry, Math.atan2(vx, vz)) * Math.min(1, dt * 8);
    stepBody(a.body, vx, vz, dt, this.world.collision, this.gravity);
    a.speed = this.speed;
    a.mode = 'walk';
    if (!a.far) animateCharacter(a.char, dt, { mode: 'walk', speed: this.speed });
    // stuck recovery: sidestep, then skip the waypoint
    a.stuckT += dt;
    if (a.stuckT > 1.2) {
      const moved = Math.hypot(p.x - a.stuckRef.x, p.z - a.stuckRef.z);
      a.stuckT = 0;
      a.stuckRef = { x: p.x, z: p.z };
      if (moved < 0.5) {
        a.stuckCount++;
        if (a.stuckCount === 1) {
          const side = this.rng() < 0.5 ? -1 : 1;
          a.path.unshift({ x: p.x - (dz / d) * 1.8 * side, z: p.z + (dx / d) * 1.8 * side });
        } else if (a.stuckCount === 2) a.path.shift();
        else {
          // give up: go somewhere else
          this.releaseSpot(a);
          a.path = [];
          a.target = null;
          a.wait = 0.5;
          a.stuckCount = 0;
        }
      } else a.stuckCount = 0;
    }
  }

  /** Fans currently watching a room. */
  watchers(roomId) {
    let n = 0;
    for (const a of this.fans) if (a.target?.id === roomId && !a.path.length) n++;
    return n;
  }

  /** Change a group's idol costumes (manager/tech panel). */
  restyleIdols(roomId, outfit) {
    const m = this.byRoom.get(roomId)?.members;
    if (!m) return;
    for (const a of m.idols) setLook(a.char, { ...a.char.look, outfit });
  }
}
