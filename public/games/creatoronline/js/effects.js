/**
 * Stage effects: floating hearts and gift emojis (pooled sprites), confetti
 * bursts (Points), smoke puffs and laser sweeps.
 */
import * as THREE from 'three';

const emojiTex = new Map();

/** Emoji/text drawn once to a texture. */
function emojiTexture(emoji) {
  if (emojiTex.has(emoji)) return emojiTex.get(emoji);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = '96px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  emojiTex.set(emoji, tex);
  return tex;
}

function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.sprites = [];
    this.free = [];
    this.bursts = [];
    this.smokes = [];
    this.lasers = [];
    this.dot = softDot();
    this.confettiColors = [0xff4fa3, 0xffd23f, 0x35d0ff, 0x3be38f, 0x9b5cff, 0xffffff].map((c) => new THREE.Color(c));
  }

  _sprite() {
    let s = this.free.pop();
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      s.renderOrder = 5;
    }
    this.scene.add(s);
    return s;
  }

  /** Emoji that floats up and fades (hearts, gifts). */
  float(emoji, x, y, z, { size = 0.6, rise = 1.4, life = 1.8, drift = 0.4 } = {}) {
    if (this.sprites.length > 160) return;
    const s = this._sprite();
    s.material.map = emojiTexture(emoji);
    s.material.color.set(0xffffff); // sprite tái dùng từ khói còn giữ màu xanh khói
    s.material.opacity = 1;
    s.material.needsUpdate = true;
    s.position.set(x, y, z);
    s.scale.set(size, size, size);
    this.sprites.push({ s, vx: (Math.random() - 0.5) * drift, vy: rise, vz: (Math.random() - 0.5) * drift, life, age: 0, size });
  }

  /** Confetti burst from a point. */
  confetti(x, y, z, count = 160, spread = 5) {
    if (this.bursts.length >= 6) return; // mưa quà lớn: trần 6 đợt cùng lúc (mỗi đợt 1 geometry + material)
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * spread;
      vel[i * 3] = Math.cos(a) * sp;
      vel[i * 3 + 1] = 3 + Math.random() * 5;
      vel[i * 3 + 2] = Math.sin(a) * sp;
      const c = this.confettiColors[i % this.confettiColors.length];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.bursts.push({ pts, vel, age: 0, life: 3.5, count });
  }

  /** Low smoke over a stage area. */
  smoke(x, y, z, w = 12, d = 6) {
    if (this.smokes.length > 42) return; // trần 3 đợt khói cùng lúc
    for (let i = 0; i < 14; i++) {
      const s = this._sprite();
      s.material.map = this.dot;
      s.material.color.set(0xd8dcff); // không tạo Color mới mỗi hạt
      s.material.opacity = 0;
      s.material.needsUpdate = true;
      s.position.set(x + (Math.random() - 0.5) * w, y + 0.4 + Math.random() * 0.6, z + (Math.random() - 0.5) * d);
      const size = 2.5 + Math.random() * 2.5;
      s.scale.set(size, size * 0.6, size);
      this.smokes.push({ s, age: 0, life: 6 + Math.random() * 2, vx: (Math.random() - 0.5) * 0.4 });
    }
  }

  /** Laser fan from (x,y,z) sweeping toward +z for `life` seconds. */
  laser(x, y, z, colors, life = 6) {
    if (this.lasers.length >= 4) return;
    const n = 8;
    const pos = new Float32Array(n * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: colors[0] ?? 0x3be38f, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    this.scene.add(lines);
    this.lasers.push({ lines, x, y, z, n, age: 0, life, colors });
  }

  update(dt) {
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const p = this.sprites[i];
      p.age += dt;
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.position.z += p.vz * dt;
      const k = p.age / p.life;
      const sc = p.size * (k < 0.15 ? 0.4 + k * 4 : 1);
      p.s.scale.set(sc, sc, sc);
      p.s.material.opacity = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      if (p.age >= p.life) {
        this.scene.remove(p.s);
        this.free.push(p.s);
        this.sprites.splice(i, 1);
      }
    }
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const p = this.smokes[i];
      p.age += dt;
      const k = p.age / p.life;
      p.s.position.x += p.vx * dt;
      p.s.position.y += dt * 0.08;
      p.s.material.opacity = Math.sin(Math.min(1, k) * Math.PI) * 0.35;
      if (p.age >= p.life) {
        this.scene.remove(p.s);
        p.s.material.color = new THREE.Color(0xffffff);
        this.free.push(p.s);
        this.smokes.splice(i, 1);
      }
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.age += dt;
      const pos = b.pts.geometry.attributes.position.array;
      for (let j = 0; j < b.count; j++) {
        b.vel[j * 3 + 1] -= 6 * dt;
        b.vel[j * 3] *= 0.985;
        b.vel[j * 3 + 2] *= 0.985;
        if (b.vel[j * 3 + 1] < -1.2) b.vel[j * 3 + 1] = -1.2; // flutter
        pos[j * 3] += b.vel[j * 3] * dt;
        pos[j * 3 + 1] = Math.max(0.05, pos[j * 3 + 1] + b.vel[j * 3 + 1] * dt);
        pos[j * 3 + 2] += b.vel[j * 3 + 2] * dt;
      }
      b.pts.geometry.attributes.position.needsUpdate = true;
      b.pts.material.opacity = b.age > b.life - 1 ? Math.max(0, b.life - b.age) : 1;
      if (b.age >= b.life) {
        this.scene.remove(b.pts);
        b.pts.geometry.dispose();
        b.pts.material.dispose();
        this.bursts.splice(i, 1);
      }
    }
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const L = this.lasers[i];
      L.age += dt;
      const pos = L.lines.geometry.attributes.position.array;
      for (let j = 0; j < L.n; j++) {
        const a = -0.9 + (j / (L.n - 1)) * 1.8 + Math.sin(L.age * 2.2) * 0.35;
        const dy = -0.35 + Math.sin(L.age * 1.3 + j) * 0.15;
        pos.set([L.x, L.y, L.z, L.x + Math.sin(a) * 18, L.y + dy * 18, L.z + Math.cos(a) * 18], j * 6);
      }
      L.lines.geometry.attributes.position.needsUpdate = true;
      L.lines.material.color.set(L.colors[Math.floor(L.age * 2) % L.colors.length]);
      L.lines.material.opacity = L.age > L.life - 0.5 ? (L.life - L.age) * 1.8 : 0.9;
      if (L.age >= L.life) {
        this.scene.remove(L.lines);
        L.lines.geometry.dispose();
        L.lines.material.dispose();
        this.lasers.splice(i, 1);
      }
    }
  }
}
