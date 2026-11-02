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
