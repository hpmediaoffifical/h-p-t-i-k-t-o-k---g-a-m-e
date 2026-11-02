/**
 * Inmate and guard NPCs that follow the camp schedule: line up for roll call,
 * exercise, eat at the tables, mop the floor, shoot hoops, nap and sleep in
 * their own cells. Navigation is waypoint-based (stairs, balcony corner, cell
 * doors) with simple stuck recovery on top of the shared character physics.
 */
import { stepBody } from './logic/physics.js';
import { createCharacter, animateCharacter, disposeCharacter, NUMBER_POOL } from './character.js';
import { attachLabel } from './labels.js';
import { pick, range, shuffled } from './logic/rng.js';

const UPPER_THRESHOLD = 2;
/** Trong 4 bức tường bao của trại (tường ngoài dày 0,4 m: x ±20, z −16…14). */
const insideCamp = (x, z) => x > -19.7 && x < 19.7 && z > -15.7 && z < 13.7;

/** Shortest signed angle difference. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Create a physical actor (shared by NPCs, guards, the player and remote players). */
export function makeActor(scene, { name, look, kind, x, z, y = 0, avatar = '' }) {
  const char = createCharacter(look);
  scene.add(char.root);
  const label = attachLabel(char, name, kind, avatar);
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
  };
  syncActor(actor);
  return actor;
}

/** Copy the physics position/rotation to the render object. Đang ngủ trên giường → nằm ngửa theo chỗ nằm của giường. */
export function syncActor(a) {
  const root = a.char.root;
  const lie = a.mode === 'sleep' ? a.seat?.lie : null;
  if (lie) {
    root.position.copy(lie.pos);
    root.quaternion.copy(lie.q);
    a.char.anchor = lie.head; // bảng tên treo trên đầu thay vì trên gót chân
    if (a.char.blob) a.char.blob.visible = false;
    a.lying = true;
    return;
  }
  if (a.lying) {
    a.lying = false;
    root.quaternion.identity();
    a.char.anchor = null;
    if (a.char.blob) a.char.blob.visible = true;
  }
  root.position.set(a.body.pos.x, a.body.pos.y, a.body.pos.z);
  root.rotation.y = a.ry;
}

/** Turn an actor smoothly toward `target` yaw. */
export function turnToward(a, target, dt, rate = 10) {
  a.ry += angleDelta(a.ry, target) * Math.min(1, dt * rate);
}

export class NpcManager {
  /**
   * @param {{scene, world, config, rng}} deps
   */
  constructor({ scene, world, config, rng }) {
    this.scene = scene;
    this.world = world;
    this.cfg = config;
    this.rng = rng;
    this.gravity = config.tuning.gravity;
    this.speed = config.tuning.npcWalkSpeed;
    this.inmates = [];
    this.guards = [];
    this.phaseKey = null;
  }

  /** Phạm nhân + cán bộ. Mảng dựng lại chỉ khi danh sách đổi (không tạo mảng mới mỗi bước mô phỏng) — đừng sửa trực tiếp. */
  get all() {
    if (!this._all) this._all = this.inmates.concat(this.guards);
    return this._all;
  }

  /** Ngẫu nhiên một bộ đồ phạm nhân. */
  randomLook() {
    const rng = this.rng;
    const hairRoll = rng();
    return {
      outfit: rng() < 0.6 ? 'orange' : 'stripe',
      hair: hairRoll < 0.5 ? 'brown' : hairRoll < 0.72 ? 'black' : hairRoll < 0.84 ? 'bald' : hairRoll < 0.92 ? 'gray' : 'blonde',
      hat: rng() < 0.2 ? pick(rng, ['red', 'white']) : 'none',
      number: NUMBER_POOL[Math.floor(rng() * NUMBER_POOL.length)], // số có sẵn trong atlas số áo
    };
  }

  /** Spawn `count` inmate NPCs (deterministic from the seed) and the guards. */
  spawn(count) {
    const { rng, world, cfg } = this;
    this.roomSlots = [];
    for (let pass = 0; pass < 3; pass++) for (const c of world.cells) this.roomSlots.push(c);
    this.seatOrder = shuffled(rng, world.seats);
    this.nextIndex = 0;
    const names = shuffled(rng, cfg.names).slice(0, count);
    for (const name of names) {
      const p = this.randomPoint();
      this.addInmate({ name, look: this.randomLook(), x: p.x, z: p.z });
    }
    cfg.guards.forEach((name, i) => {
      const p = this.randomPoint();
      const g = makeActor(this.scene, { name, look: { outfit: 'guard', hair: 'black', hat: 'none' }, kind: 'guard', x: p.x, z: p.z });
      Object.assign(g, { role: 'guard', index: i, path: [], wait: 1 + i, onArrive: null, stuckT: 0, stuckRef: { ...p }, stuckCount: 0, stay: 0, days: 0 });
      this.guards.push(g);
    });
    this._all = null;
  }

  /**
   * Thêm một phạm nhân (NPC hoặc người xem LIVE) — dùng chung bộ não lịch trại.
   * @param {{name:string, look?:object, avatar?:string, kind?:string, x?:number, z?:number, days?:number}} o
   */
  addInmate(o) {
    const rng = this.rng;
    const i = this.nextIndex++;
    const x = o.x ?? 0;
    const z = o.z ?? 12.4;
    const npc = makeActor(this.scene, { name: o.name, look: o.look ?? this.randomLook(), kind: o.kind ?? 'npc', x, z, avatar: o.avatar ?? '' });
    Object.assign(npc, {
      role: 'inmate',
      index: i,
      room: this.roomSlots[i % this.roomSlots.length],
      mealSeat: this.seatOrder[i % this.seatOrder.length],
      days: o.days ?? Math.floor(range(rng, 15, 800)),
      path: [],
      wait: range(rng, 0, 2),
      onArrive: null,
      stuckT: 0,
      stuckRef: { x, z },
      stuckCount: 0,
      shootT: 0,
      stay: 0,
      locked: false,
    });
    npc.ry = o.z === undefined ? Math.PI : range(rng, -Math.PI, Math.PI);
    this.inmates.push(npc);
    this._all = null;
    return npc;
  }

  /** Gỡ một phạm nhân khỏi trại (người xem rời đi / quá đông). */
  removeInmate(n) {
    if (n.seat) this.releaseSeat(n);
    for (const s of this.world.seats.concat(...this.world.cells.map((c) => c.beds))) if (s.occupant === n) s.occupant = null;
    const i = this.inmates.indexOf(n);
    if (i >= 0) this.inmates.splice(i, 1);
    this._all = null;
    disposeCharacter(n.char);
    n.label.dispose();
  }

  /**
   * Ra lệnh cho một nhân vật: đi tới `dest`, đến nơi thì làm `mode` trong `stay` giây.
   * Trong lúc đó bộ não lịch trại không chen vào (n.locked). `then` chạy lúc tới nơi, `done` lúc làm xong.
   */
  command(n, { dest, mode = 'idle', stay = 3, ry, seat, shoot = false, then, done, inPlace = false, via = null }) {
    if (n.seat) this.releaseSeat(n);
    n.locked = true;
    n.stay = 0;
    n.wait = 0;
    n.faceActor = null;
    n.afterStay = null;
    if (seat) seat.occupant = n;
    n.onArrive = { mode, stay, ry, seat, shoot, then, done };
    if (inPlace) {
      n.path = []; // làm ngay tại chỗ (nhảy, cúi chào…), không đi đâu
      this.arrive(n, {});
    } else {
      this.route(n, dest);
      if (via?.length) n.path.splice(n.path.length - 1, 0, ...via.map((p) => ({ x: p.x, z: p.z }))); // điểm đi vòng trước đích
    }
  }

  /** Game điều khiển trực tiếp (đám đông bu quanh đại ca…): set n.puppetVel {x,z}, n.mode, n.puppetFace. */
  puppetize(n) {
    this.release(n);
    n.puppet = true;
    n.puppetVel = { x: 0, z: 0 };
    n.puppetFace = undefined;
  }

  unpuppet(n) {
    if (!n.puppet) return;
    n.puppet = false;
    n.puppetVel = null;
    n.mode = 'idle';
    n.wait = 0.3;
  }

  /** Huỷ lệnh đang làm, trả nhân vật về lịch trại. */
  release(n) {
    n.locked = false;
    n.animMode = null;
    n.path = [];
    n.onArrive = null;
    n.stay = 0;
    n.afterStay = null;
    n.shootT = 0;
    if (n.seat) this.releaseSeat(n);
    n.mode = 'idle';
    n.wait = 0.3;
  }

  /** Random reachable point on the ground floor. */
  randomPoint(area = this.world.freeArea) {
    for (let i = 0; i < 30; i++) {
      const x = range(this.rng, area.minX, area.maxX);
      const z = range(this.rng, area.minZ, area.maxZ);
      if (this.world.collision.isFree(x, 0, z, 0.5, 1.6)) return { x, z };
    }
    return { x: 0, z: 10 };
  }

  /** Called when the schedule phase changes: everybody re-plans with a small stagger. */
  setPhase(key) {
    if (key === this.phaseKey) return;
    this.phaseKey = key;
    for (const n of this.all) {
      if (n.locked || n.puppet) continue; // đang làm nhiệm vụ / đang bị game điều khiển trực tiếp
      if (n.seat) this.releaseSeat(n);
      n.path = [];
      n.onArrive = null;
      n.stay = 0;
      n.mode = 'idle';
      n.wait = range(this.rng, 0.1, 3.0);
    }
    // drop NPC reservations; seats held by players stay held
    const spots = this.world.seats.concat(...this.world.cells.map((c) => c.beds));
    for (const s of spots) if (s.occupant?.role && !s.occupant.locked && !s.occupant.puppet) s.occupant = null;
  }

  /** Build waypoints from the actor's position to a destination. */
  route(n, dest) {
    const w = this.world;
    const pos = n.body.pos;
    const pts = [];
    const curLevel = pos.y > UPPER_THRESHOLD ? 1 : 0;
    const curCell = w.cellAt(pos.x, pos.y, pos.z);
    if (curCell) pts.push(curCell.door, curCell.front);
    let onLeftWalk = curLevel === 1 && (curCell ? curCell.side === 'left' : pos.x < -13.4 && pos.z > -10);
    if (curLevel !== dest.level) {
      if (curLevel === 1) {
        if (onLeftWalk) pts.push(w.nav.upperCorner);
        pts.push(w.nav.stairTop, w.nav.stairBottom, w.nav.stairExit);
      } else {
        pts.push(w.nav.stairExit, w.nav.stairBottom, w.nav.stairTop);
        onLeftWalk = false;
      }
    }
    if (dest.cell) {
      const c = dest.cell;
      if (c.level === 1 && c.side === 'left' && !onLeftWalk) pts.push(w.nav.upperCorner);
      if (c.level === 1 && c.side === 'back' && onLeftWalk) pts.push(w.nav.upperCorner);
      if (c !== curCell) pts.push(c.front, c.door);
      pts.push(dest.x !== undefined ? { x: dest.x, z: dest.z } : c.inside);
    } else {
      pts.push({ x: dest.x, z: dest.z });
    }
    n.path = pts.map((p) => ({ x: p.x, z: p.z }));
  }

  /** Choose what to do next based on the current phase. */
  decide(n, ctx) {
    const rng = this.rng;
    const key = this.phaseKey;
    if (n.role === 'guard') return this.decideGuard(n, ctx);
    const goSit = (seat, mode, stay) => {
      if (seat.occupant && seat.occupant !== n) return false;
      seat.occupant = n; // reserve
      this.route(n, { level: seat.y > 2 ? 1 : 0, x: seat.approach.x, z: seat.approach.z });
      n.onArrive = { seat, mode, stay };
      return true;
    };
    switch (key) {
      case 'meal':
        if (!goSit(n.mealSeat, 'eat', Infinity)) {
          const free = this.world.seats.find((s) => !s.occupant);
          if (!free || !goSit(free, 'eat', Infinity)) this.wanderTo(n, 'idle', 5);
        }
        return;
      case 'rollcall':
      case 'exercise': {
        const spot = this.world.rollcallSpots[n.index % this.world.rollcallSpots.length];
        this.route(n, { level: 0, ...spot });
        n.onArrive = { mode: key === 'exercise' ? 'exercise' : 'idle', stay: Infinity, ry: -Math.PI / 2 };
        return;
      }
      case 'rest':
      case 'sleep': {
        const bed = n.room.beds.find((b) => !b.occupant || b.occupant === n);
        if (bed) {
          bed.occupant = n;
          this.route(n, { level: n.room.level, cell: n.room });
          n.onArrive = { seat: { ...bed, approach: n.room.inside, ref: bed }, mode: key === 'sleep' ? 'sleep' : 'sit', stay: Infinity };
        } else {
          this.route(n, { level: n.room.level, cell: n.room });
          n.onArrive = { mode: 'idle', stay: Infinity };
        }
        return;
      }
      case 'work':
        this.wanderTo(n, 'mop', range(rng, 4, 9));
        return;
      default: {
        const r = rng();
        if (r < 0.48) this.wanderTo(n, 'idle', range(rng, 2, 6));
        else if (r < 0.66) {
          const spot = pick(rng, this.world.courtSpots);
          this.route(n, { level: 0, x: spot.x + range(rng, -0.6, 0.6), z: spot.z + range(rng, -0.6, 0.6) });
          n.onArrive = { mode: 'idle', stay: range(rng, 8, 16), shoot: true };
        } else if (r < 0.84) {
          const seat = pick(rng, this.world.seats);
          if (!goSit(seat, 'sit', range(rng, 6, 14))) this.wanderTo(n, 'idle', 3);
        } else {
          const friend = pick(rng, this.inmates);
          if (friend === n || friend.body.pos.y > UPPER_THRESHOLD || friend.seat) return this.wanderTo(n, 'idle', 3);
          this.route(n, { level: 0, x: friend.body.pos.x + range(rng, -1.2, 1.2), z: friend.body.pos.z + range(rng, -1.2, 1.2) });
          n.onArrive = { mode: 'talk', stay: range(rng, 3, 6), faceActor: friend, chat: true };
        }
      }
    }
  }

  decideGuard(n, ctx) {
    const post = this.world.guardPost;
    if (this.phaseKey === 'rollcall' && n.index === 0) {
      this.route(n, { level: 0, x: post.x, z: post.z });
      n.onArrive = { mode: 'idle', stay: Infinity, ry: post.ry };
      return;
    }
    if (this.phaseKey === 'meal' && n.index === 1) {
      this.route(n, { level: 0, x: -2, z: 4 });
      n.onArrive = { mode: 'idle', stay: 12, ry: 0 };
      return;
    }
    this.wanderTo(n, 'idle', range(this.rng, 3, 7));
  }

  wanderTo(n, mode, stay) {
    const p = this.randomPoint();
    this.route(n, { level: 0, ...p });
    n.onArrive = { mode, stay };
  }

  arrive(n, ctx) {
    const a = n.onArrive;
    n.onArrive = null;
    if (!a) {
      n.wait = range(this.rng, 1, 3);
      return;
    }
    if (a.seat) {
      const s = a.seat;
      const target = s.ref ?? s;
      if (target.occupant && target.occupant !== n) {
        n.wait = 0.5;
        return;
      }
      target.occupant = n;
      n.seat = { ...s, occupantRef: target };
      n.seat.occupant = n;
      n.body.pos.x = s.x;
      n.body.pos.z = s.z;
      n.body.pos.y = s.y - 0.4;
      n.ry = s.ry;
    }
    if (a.ry !== undefined) n.targetRy = a.ry;
    n.mode = a.mode;
    n.stay = a.stay;
    n.shootT = a.shoot ? (n.locked ? 0.4 : range(this.rng, 1, 3)) : 0;
    n.faceActor = a.faceActor ?? null;
    n.afterStay = a.done ?? null;
    if (a.chat) ctx.onSay?.(n, 'free');
    a.then?.(n);
  }

  /** Per-frame update. ctx: {dt, onShoot(npc), onSay(npc, category)} */
  update(dt, ctx) {
    const coll = this.world.collision;
    for (const n of this.all) {
      if (n.carried) {
        // đang bị vác / kẹt trong thùng rác: vị trí + hướng do events.js đặt mỗi khung, chỉ chạy hoạt ảnh
        animateCharacter(n.char, dt, { mode: n.animMode ?? n.mode, speed: 0 });
        continue;
      }
      if (n.puppet) {
        const v = n.puppetVel ?? { x: 0, z: 0 };
        if (!n.seat) stepBody(n.body, v.x, v.z, dt, coll, this.gravity);
        n.speed = Math.hypot(v.x, v.z);
        if (n.speed > 0.1) turnToward(n, Math.atan2(v.x, v.z), dt, 10);
        else if (n.puppetFace !== undefined) turnToward(n, n.puppetFace, dt, 6);
        animateCharacter(n.char, dt, { mode: n.animMode ?? (n.speed > 0.1 ? 'walk' : n.mode), speed: n.speed, airborne: !n.body.grounded && !n.seat });
        syncActor(n);
        continue;
      }
      let vx = 0;
      let vz = 0;
      if (n.path.length) {
        n.mode = 'walk';
        const wp = n.path[0];
        const dx = wp.x - n.body.pos.x;
        const dz = wp.z - n.body.pos.z;
        const d = Math.hypot(dx, dz);
        const tol = n.path.length === 1 ? 0.22 : 0.4;
        if (d < tol) {
          n.path.shift();
          if (!n.path.length) this.arrive(n, ctx);
        } else {
          // đang làm lệnh của người xem → chạy cho kịp lượt lên sóng
          const sp = (n.role === 'guard' ? this.speed * 0.85 : this.speed) * (n.locked ? 2.1 : 1) * (n.speedMul ?? 1); // speedMul: thi chạy
          vx = (dx / d) * sp;
          vz = (dz / d) * sp;
          turnToward(n, Math.atan2(vx, vz), dt, 8);
        }
        this.checkStuck(n, dt, wp);
      } else if (n.stay > 0) {
        n.stay -= dt;
        if (n.faceActor) turnToward(n, Math.atan2(n.faceActor.body.pos.x - n.body.pos.x, n.faceActor.body.pos.z - n.body.pos.z), dt, 4);
        else if (n.targetRy !== undefined) turnToward(n, n.targetRy, dt, 5);
        if (n.shootT > 0) {
          n.shootT -= dt;
          if (n.shootT <= 0) {
            n.mode = 'shoot';
            ctx.onShoot?.(n);
            n.shootT = range(this.rng, 3, 6);
            n.shootAnim = 0.45;
          }
        }
        if (n.shootAnim > 0) {
          n.shootAnim -= dt;
          if (n.shootAnim <= 0) n.mode = 'idle';
        }
        if (n.stay <= 0) {
          n.targetRy = undefined;
          if (n.seat) this.releaseSeat(n);
          n.mode = 'idle';
          n.wait = range(this.rng, 0.3, 1.5);
          const done = n.afterStay;
          n.afterStay = null;
          n.locked = false;
          done?.(n);
        }
      } else if (n.wait > 0) {
        n.wait -= dt;
        if (n.mode === 'walk') n.mode = 'idle';
      } else {
        n.locked = false;
        this.decide(n, ctx);
      }

      if (!n.seat) stepBody(n.body, vx, vz, dt, coll, this.gravity);
      if (!insideCamp(n.body.pos.x, n.body.pos.z)) Object.assign(n.body.pos, { x: 0, y: 0, z: 12 }); // lưới an toàn: lọt ra ngoài tường → về cổng
      n.speed = Math.hypot(vx, vz);
      animateCharacter(n.char, dt, { mode: n.animMode ?? n.mode, speed: n.speed, airborne: !n.body.grounded && !n.seat });
      syncActor(n);
    }
  }

  releaseSeat(n) {
    const ref = n.seat?.occupantRef;
    if (ref && ref.occupant === n) ref.occupant = null;
    const out = n.seat.approach;
    n.seat = null;
    if (out) {
      n.body.pos.x = out.x;
      n.body.pos.z = out.z;
    }
    n.body.pos.y = n.body.pos.y > UPPER_THRESHOLD - 0.5 ? 3.4 : 0;
  }

  checkStuck(n, dt, wp) {
    n.stuckT += dt;
    if (n.stuckT < 0.9) return;
    const moved = Math.hypot(n.body.pos.x - n.stuckRef.x, n.body.pos.z - n.stuckRef.z);
    n.stuckT = 0;
    n.stuckRef = { x: n.body.pos.x, z: n.body.pos.z };
    if (moved > 0.3) {
      n.stuckCount = 0;
      return;
    }
    n.stuckCount++;
    if (n.stuckCount >= 4) {
      // last resort: hop to the waypoint (keeps the crowd flowing)
      n.body.pos.x = wp.x;
      n.body.pos.z = wp.z;
      n.stuckCount = 0;
      return;
    }
    const dx = wp.x - n.body.pos.x;
    const dz = wp.z - n.body.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const first = this.rng() < 0.5 ? -1 : 1;
    // né sang bên: chỉ chọn điểm trống nằm trong trại (trước đây có thể là bên kia tường → kẹt lâu thì "nhảy" ra ngoài)
    for (const side of [first, -first]) {
      const x = n.body.pos.x + (-dz / d) * side * 1.3 + (dx / d) * 0.3;
      const z = n.body.pos.z + (dx / d) * side * 1.3 + (dz / d) * 0.3;
      if (insideCamp(x, z) && this.world.collision.isFree(x, n.body.pos.y, z, n.body.radius, n.body.height)) {
        n.path.unshift({ x, z });
        return;
      }
    }
  }
}

/** Keep characters from overlapping each other (same floor only). */
export function separateActors(actors) {
  for (let i = 0; i < actors.length; i++) {
    const a = actors[i];
    if (a.seat || a.carried) continue;
    for (let j = i + 1; j < actors.length; j++) {
      const b = actors[j];
      if (b.seat || b.carried) continue;
      if (Math.abs(a.body.pos.y - b.body.pos.y) > 1.2) continue;
      const dx = b.body.pos.x - a.body.pos.x;
      const dz = b.body.pos.z - a.body.pos.z;
      const min = a.body.radius + b.body.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      const wa = a.isPlayer ? 0.25 : 1;
      const wb = b.isPlayer ? 0.25 : 1;
      a.body.pos.x -= (dx / d) * push * wa;
      a.body.pos.z -= (dz / d) * push * wa;
      b.body.pos.x += (dx / d) * push * wb;
      b.body.pos.z += (dz / d) * push * wb;
    }
  }
}
