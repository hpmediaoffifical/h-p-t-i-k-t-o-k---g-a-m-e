/**
 * Gameplay props: basketballs (ballistic shots at the hoop) and dirt spots to mop.
 */
import * as THREE from 'three';

const BALL_R = 0.12;

function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e8762c';
  ctx.fillRect(0, 0, 128, 64);
  ctx.strokeStyle = '#3a1d0c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 32);
  ctx.lineTo(128, 32);
  ctx.moveTo(32, 0);
  ctx.lineTo(32, 64);
  ctx.moveTo(96, 0);
  ctx.lineTo(96, 64);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class BallSystem {
  /**
   * @param {THREE.Scene} scene
   * @param {{rim:THREE.Vector3, net:THREE.Mesh}} hoop
   */
  constructor(scene, hoop, gravity = 9.8) {
    this.scene = scene;
    this.hoop = hoop;
    this.g = gravity;
    this.balls = [];
    this.geo = new THREE.SphereGeometry(BALL_R, 16, 12);
    this.mat = new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.7 });
    this.netWiggle = 0;
  }

  /** Probability of scoring from a horizontal distance (metres) to the rim. */
  static chanceFor(dist) {
    return Math.max(0.15, Math.min(0.85, 0.95 - dist * 0.09));
  }

  /**
   * Launch a ball from `from` toward the rim.
   * @param {{x,y,z}} from
   * @param {boolean} success decided by the caller
   * @param {(scored:boolean)=>void} onResult
   */
  shoot(from, success, onResult) {
    const rim = this.hoop.rim;
    const target = success
      ? new THREE.Vector3(rim.x, rim.y + 0.06, rim.z)
      : new THREE.Vector3(rim.x + (Math.random() - 0.3) * 0.5, rim.y + 0.12, rim.z + (Math.random() - 0.5) * 0.7);
    const start = new THREE.Vector3(from.x, from.y, from.z);
    const dist = Math.hypot(target.x - start.x, target.z - start.z);
    const T = 0.7 + dist * 0.07;
    const vel = new THREE.Vector3(
      (target.x - start.x) / T,
      (target.y - start.y + 0.5 * this.g * T * T) / T,
      (target.z - start.z) / T
    );
    const mesh = new THREE.Mesh(this.geo, this.mat);
    mesh.castShadow = true;
    mesh.position.copy(start);
    this.scene.add(mesh);
    this.balls.push({ mesh, pos: start, vel, t: 0, T, success, resolved: false, life: 5, onResult });
    if (this.balls.length > 8) this.remove(this.balls[0]);
  }

  remove(b) {
    this.scene.remove(b.mesh);
    this.balls.splice(this.balls.indexOf(b), 1);
  }

  /** @param {(pos:THREE.Vector3)=>void} onBounce */
  update(dt, onBounce) {
    const rim = this.hoop.rim;
    for (const b of this.balls.slice()) {
      b.t += dt;
      b.vel.y -= this.g * dt;
      b.pos.addScaledVector(b.vel, dt);
      if (!b.resolved && b.t >= b.T) {
        b.resolved = true;
        if (b.success) {
          b.pos.set(rim.x, rim.y, rim.z);
          b.vel.set(0, -1.5, 0);
          this.netWiggle = 0.6;
        } else {
          b.vel.set(-Math.abs(b.vel.x) * 0.35 - 1.2, 2.2, b.vel.z * 0.3 + (Math.random() - 0.5) * 2);
        }
        b.onResult?.(b.success);
      }
      if (b.pos.y < BALL_R) {
        b.pos.y = BALL_R;
        if (Math.abs(b.vel.y) > 1.2) onBounce?.(b.pos);
        b.vel.y = -b.vel.y * 0.62;
        b.vel.x *= 0.82;
        b.vel.z *= 0.82;
      }
      if (b.pos.x > 19.85) b.vel.x = -Math.abs(b.vel.x) * 0.6;
      if (b.pos.x < -19.8) b.vel.x = Math.abs(b.vel.x) * 0.6;
      if (b.pos.z > 13.8) b.vel.z = -Math.abs(b.vel.z) * 0.6;
      if (b.pos.z < -15.8) b.vel.z = Math.abs(b.vel.z) * 0.6;
      b.mesh.position.copy(b.pos);
      b.mesh.rotation.x += b.vel.z * dt * 4;
      b.mesh.rotation.z -= b.vel.x * dt * 4;
      b.life -= dt;
      if (b.life <= 0) this.remove(b);
    }
    if (this.netWiggle > 0) {
      this.netWiggle -= dt;
      const s = 1 + Math.sin(this.netWiggle * 30) * this.netWiggle * 0.25;
      this.hoop.net.scale.set(s, 1 + this.netWiggle * 0.3, s);
    }
  }
}

export class DirtSystem {
  /**
   * @param {THREE.Scene} scene
   * @param {(area?)=>{x:number,z:number}} randomPoint
   */
  constructor(scene, randomPoint, max) {
    this.scene = scene;
    this.randomPoint = randomPoint;
    this.max = max;
    this.spots = [];
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    for (let i = 0; i < 9; i++) {
      const x = 64 + (Math.random() - 0.5) * 50;
      const y = 64 + (Math.random() - 0.5) * 50;
      const r = 18 + Math.random() * 26;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(105,78,48,.75)');
      g.addColorStop(1, 'rgba(105,78,48,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    this.geo = new THREE.PlaneGeometry(1.4, 1.4);
  }

  spawn() {
    if (this.spots.length >= this.max) return null;
    const p = this.randomPoint();
    const mesh = new THREE.Mesh(this.geo, this.mat.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.random() * Math.PI;
    const s = 0.7 + Math.random() * 0.6;
    mesh.scale.set(s, s, 1);
    mesh.position.set(p.x, 0.014, p.z);
    mesh.renderOrder = 1;
    this.scene.add(mesh);
    const spot = { x: p.x, z: p.z, mesh, progress: 0 };
    this.spots.push(spot);
    return spot;
  }

  /** Nearest spot within maxDist of (x, z), or null. */
  nearest(x, z, maxDist) {
    let best = null;
    let bd = maxDist;
    for (const s of this.spots) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  /** Visual feedback while cleaning (0..1). */
  setProgress(spot, p) {
    spot.progress = p;
    spot.mesh.material.opacity = 1 - p * 0.85;
  }

  remove(spot) {
    this.scene.remove(spot.mesh);
    spot.mesh.material.dispose();
    this.spots.splice(this.spots.indexOf(spot), 1);
  }
}

/** Pháo hoa / pháo giấy cho sự kiện Ân Xá, lên Đại Ca… */
export class Fireworks {
  constructor(scene) {
    this.scene = scene;
    this.bursts = [];
  }

  /** Bắn một chùm hạt màu tại (x, y, z). */
  burst(x, y, z, count = 90) {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const vel = [];
    const palette = [[1, 0.82, 0.25], [1, 0.35, 0.35], [0.4, 0.8, 1], [0.5, 1, 0.5], [1, 0.5, 0.9]];
    const base = palette[Math.floor(Math.random() * palette.length)];
    for (let i = 0; i < count; i++) {
      pos.set([x, y, z], i * 3);
      const c = Math.random() < 0.6 ? base : palette[Math.floor(Math.random() * palette.length)];
      col.set(c, i * 3);
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const sp = 3 + Math.random() * 3;
      vel.push([Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp + 2, Math.sin(ph) * Math.sin(th) * sp]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.18, vertexColors: true, transparent: true, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.bursts.push({ pts, vel, life: 2.2 });
  }

  update(dt) {
    for (const b of this.bursts.slice()) {
      b.life -= dt;
      const a = b.pts.geometry.attributes.position;
      for (let i = 0; i < b.vel.length; i++) {
        const v = b.vel[i];
        v[1] -= 6 * dt;
        v[0] *= 0.985;
        v[2] *= 0.985;
        a.array[i * 3] += v[0] * dt;
        a.array[i * 3 + 1] = Math.max(0.05, a.array[i * 3 + 1] + v[1] * dt);
        a.array[i * 3 + 2] += v[2] * dt;
      }
      a.needsUpdate = true;
      b.pts.material.opacity = Math.max(0, Math.min(1, b.life / 1.2));
      if (b.life <= 0) {
        this.scene.remove(b.pts);
        b.pts.geometry.dispose();
        b.pts.material.dispose();
        this.bursts.splice(this.bursts.indexOf(b), 1);
      }
    }
  }
}

/**
 * 💩 💦 Bãi bẩn của quà "Đi bậy / Tè bậy" — nằm đó tới khi có người dọn (logic dọn ở events.js).
 * Hình/vật liệu dùng chung; ruồi của mọi bãi là 1 InstancedMesh (1 lệnh vẽ).
 */
export class MessSystem {
  /** @param {THREE.Scene} scene @param {number} max số bãi tối đa (quá thì bãi cũ nhất biến mất) */
  constructor(scene, max = 14) {
    this.scene = scene;
    this.max = max;
    this.items = [];
    this.poopMat = new THREE.MeshStandardMaterial({ color: 0x7a4a24, roughness: 0.5 });
    this.peeMat = new THREE.MeshStandardMaterial({ color: 0xf2d43c, roughness: 0.12, transparent: true, opacity: 0.72, depthWrite: false });
    const parts = [
      [0.2, 0.09],
      [0.15, 0.21],
      [0.1, 0.31],
    ].map(([r, y]) => {
      const g = new THREE.SphereGeometry(r, 12, 8);
      g.scale(1, 0.62, 1);
      g.translate(0, y, 0);
      return g;
    });
    const tip = new THREE.ConeGeometry(0.06, 0.12, 8);
    tip.translate(0.02, 0.39, 0);
    this.poopGeo = mergeIndexed([...parts, tip]);
    this.peeGeo = new THREE.CircleGeometry(0.45, 20);
    this.peeGeo.rotateX(-Math.PI / 2);
    this.flies = new THREE.InstancedMesh(new THREE.SphereGeometry(0.028, 5, 4), new THREE.MeshBasicMaterial({ color: 0x151515 }), max * 2);
    this.flies.count = 0;
    this.flies.frustumCulled = false;
    scene.add(this.flies);
    this._m = new THREE.Matrix4();
  }

  /** Tạo bãi bẩn ở (x, y, z). grow: số giây lớn dần (lúc nhân vật đang "làm"). */
  add(kind, x, y, z, owner, grow = 2) {
    if (this.items.length >= this.max) this.remove(this.items[0]);
    const mesh = new THREE.Mesh(kind === 'poop' ? this.poopGeo : this.peeGeo, kind === 'poop' ? this.poopMat : this.peeMat);
    mesh.position.set(x, y + (kind === 'poop' ? 0 : 0.016), z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.scale.setScalar(0.01);
    mesh.castShadow = kind === 'poop';
    mesh.renderOrder = 1;
    this.scene.add(mesh);
    const item = { kind, x, y, z, owner, mesh, grow: Math.max(0.1, grow), age: 0, at: performance.now(), claimed: null, size: kind === 'poop' ? 0.85 + Math.random() * 0.3 : 0.9 + Math.random() * 0.4 };
    this.items.push(item);
    return item;
  }

  remove(item) {
    const i = this.items.indexOf(item);
    if (i < 0) return;
    this.items.splice(i, 1);
    this.scene.remove(item.mesh);
  }

  /** Bãi gần nhất (cùng tầng) trong bán kính maxDist, bỏ qua bãi đã có người nhận dọn. */
  nearest(x, y, z, maxDist = Infinity, { includeClaimed = false } = {}) {
    let best = null;
    let bd = maxDist;
    for (const it of this.items) {
      if (!includeClaimed && it.claimed) continue;
      if (Math.abs(it.y - y) > 1.2) continue;
      const d = Math.hypot(it.x - x, it.z - z);
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  update(dt) {
    let f = 0;
    const t = performance.now() / 1000;
    for (const it of this.items) {
      it.age += dt;
      const k = Math.min(1, it.age / it.grow);
      it.mesh.scale.setScalar(Math.max(0.01, k * it.size));
      if (it.kind !== 'poop' || k < 1) continue;
      for (let j = 0; j < 2; j++) {
        const a = t * (3 + j) + j * 2.4 + it.x;
        this._m.makeTranslation(it.x + Math.cos(a) * 0.32, it.y + 0.45 + Math.sin(a * 1.7) * 0.08, it.z + Math.sin(a) * 0.32);
        this.flies.setMatrixAt(f++, this._m);
      }
    }
    this.flies.count = f;
    this.flies.instanceMatrix.needsUpdate = true;
  }
}

/** Gộp các BufferGeometry có index (cùng thuộc tính position/normal/uv) thành 1. */
function mergeIndexed(geos) {
  let vc = 0;
  let ic = 0;
  for (const g of geos) {
    vc += g.attributes.position.count;
    ic += g.index.count;
  }
  const out = new THREE.BufferGeometry();
  const names = ['position', 'normal', 'uv'];
  const arrays = names.map((n) => new Float32Array(vc * geos[0].attributes[n].itemSize));
  const idx = new Uint16Array(ic);
  let vo = 0;
  let io = 0;
  for (const g of geos) {
    names.forEach((n, k) => arrays[k].set(g.attributes[n].array, vo * g.attributes[n].itemSize));
    for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo;
    vo += g.attributes.position.count;
    io += g.index.count;
  }
  names.forEach((n, k) => out.setAttribute(n, new THREE.BufferAttribute(arrays[k], geos[0].attributes[n].itemSize)));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/** ☔ Mưa rào: 1 LineSegments (1 lệnh vẽ) rơi trong khoảng sân, bật/tắt dần. */
export class RainSystem {
  constructor(scene, area = { minX: -20, maxX: 20, minZ: -16, maxZ: 14 }, count = 700) {
    this.area = area;
    this.count = count;
    const pos = new Float32Array(count * 6);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0, depthWrite: false });
    this.lines = new THREE.LineSegments(this.geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    scene.add(this.lines);
    this.on = false;
    for (let i = 0; i < count; i++) this.reset(i, Math.random() * 9);
  }

  reset(i, y = 9) {
    const a = this.area;
    const x = a.minX + Math.random() * (a.maxX - a.minX);
    const z = a.minZ + Math.random() * (a.maxZ - a.minZ);
    const p = this.geo.attributes.position.array;
    p.set([x, y, z, x + 0.03, y - 0.45, z], i * 6);
  }

  set(on) {
    this.on = on;
    if (on) this.lines.visible = true;
  }

  update(dt) {
    const target = this.on ? 0.55 : 0;
    this.mat.opacity += (target - this.mat.opacity) * Math.min(1, dt * 2);
    if (!this.on && this.mat.opacity < 0.02) {
      this.lines.visible = false;
      return;
    }
    const p = this.geo.attributes.position.array;
    const fall = 16 * dt;
    for (let i = 0; i < this.count; i++) {
      const k = i * 6;
      p[k + 1] -= fall;
      p[k + 4] -= fall;
      if (p[k + 4] < 0) this.reset(i, 8 + Math.random());
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

/** 🍌 Vỏ chuối nằm trên sàn. */
export function makeBanana() {
  const g = new THREE.Group();
  const yel = new THREE.MeshStandardMaterial({ color: 0xf6d13a, roughness: 0.6 });
  const tip = new THREE.MeshStandardMaterial({ color: 0x5a4a1e, roughness: 0.8 });
  for (let i = 0; i < 4; i++) {
    const peel = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), yel);
    const a = (i / 4) * Math.PI * 2 + 0.3;
    peel.scale.set(1.5, 0.22, 0.55);
    peel.position.set(Math.cos(a) * 0.1, 0.03, Math.sin(a) * 0.1);
    peel.rotation.y = -a;
    g.add(peel);
  }
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), tip);
  top.position.y = 0.05;
  g.add(top);
  return g;
}

/** 🐀 Chuột chạy qua sân. */
export function makeMouse() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0x8a8a92, roughness: 0.8 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xf2a0b0, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), fur);
  body.scale.set(0.8, 0.7, 1.3);
  body.position.y = 0.12;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), fur);
  head.position.set(0, 0.14, 0.22);
  g.add(head);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), pink);
    ear.position.set(sx * 0.06, 0.22, 0.2);
    ear.scale.set(1, 1, 0.4);
    g.add(ear);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.006, 0.4, 5), pink);
  tail.rotation.x = Math.PI / 2 + 0.4;
  tail.position.set(0, 0.1, -0.36);
  g.add(tail);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return g;
}

/** 🪢 Dây kéo co + khăn đỏ đánh dấu giữa dây. */
export function makeRope(length = 9) {
  const g = new THREE.Group();
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, length, 8), new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.9 }));
  rope.rotation.z = Math.PI / 2;
  rope.castShadow = true;
  g.add(rope);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.22), new THREE.MeshStandardMaterial({ color: 0xe5483d, roughness: 0.7 }));
  flag.position.y = -0.16;
  g.add(flag);
  return g;
}
