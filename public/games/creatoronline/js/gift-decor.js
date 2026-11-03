/**
 * 🏢 Creator Online (bản LIVE) — vẽ dấu vết quà tặng của buổi LIVE (spec 2026-11-03-creatoronline-design.md §20.1).
 * Logic chọn ô ở logic/gift-trace.js (có test); file này chỉ dựng hình:
 *   - kệ hoa mang tên người tặng ở hành lang Bắc trước cửa mỗi nhóm (8 ô / nhóm, x = cx ± 3,3 / 4,6 / 5,9 / 7,2)
 *   - chùm bóng bay trên giàn đèn trước sân khấu khi có quà lớn (3 chùm / nhóm)
 *   - đống hộp quà ở 2 góc trước sân khấu, lớn dần theo tổng xu của nhóm
 *   - băng rôn TOP FAN trên tường trước cửa nhóm (trên biển tên)
 * Cả 5 nhóm dùng chung: 1 InstancedMesh / loại hình + 1 atlas chữ → ~7 lệnh vẽ. Tên chỉ vẽ lại ô đổi.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GiftTrace, STAND_SLOTS, BALLOON_SLOTS, PILE_MAX, standTier, pileCount } from './logic/gift-trace.js';
import { GROUP } from './world.js';
import { canvasTex } from './decor.js';

const FONT = '"Baloo 2", system-ui, sans-serif';
const STAND_DX = [-3.3, 3.3, -4.6, 4.6, -5.9, 5.9, -7.2, 7.2]; // ô gần cửa trước
const STAND_Z = GROUP.front + 0.65; // -21.35
const WREATH_Y = 1.55;
const BALLOON_DX = [-3.1, 3.1, 0];
const BALLOON_N = 7; // bóng / chùm
const TRUSS = { y: 7.45, z: -30.6 };
const BANNER = { w: 12, h: 2.2, y: 6.7 };
const CARD = 128; // px mỗi ô huy hiệu tên
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const fmt = (n) => Math.floor(Number(n) || 0).toLocaleString('vi-VN');

function fit(ctx, text, x, y, maxW, size, weight = 800) {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (s > 10 && ctx.measureText(text).width > maxW) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
  ctx.fillText(text, x, y);
}

export class GiftDecor {
  /**
   * @param {THREE.Scene} scene
   * @param {object} world từ buildWorld
   */
  constructor(scene, world, { low = false } = {}) {
    this.groups = world.rooms.filter((r) => r.type === 'group');
    this.clubs = this.groups.map((_, i) => i + 1);
    this.trace = new GiftTrace({ clubs: this.clubs });
    this.low = low;
    const G = this.groups.length;

    // --- kệ hoa: chân + vòng hoa (InstancedMesh) + huy hiệu tên (1 hình gộp, UV trỏ vào atlas)
    const leg = (x, z) => new THREE.CylinderGeometry(0.025, 0.03, 1.5, 6).rotateX(z * 0.35).rotateZ(-x * 0.35).translate(x * 0.13, 0.72, z * 0.13);
    const standGeo = mergeGeometries([leg(-1, 0.3), leg(1, 0.3), leg(0, -1), new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6).translate(0, 1.0, -0.06)]);
    const n = G * STAND_SLOTS;
    this.stands = new THREE.InstancedMesh(standGeo, new THREE.MeshStandardMaterial({ color: 0xd8b25a, roughness: 0.35, metalness: 0.7 }), n);
    this.wreaths = new THREE.InstancedMesh(new THREE.TorusGeometry(0.5, 0.17, low ? 6 : 8, low ? 18 : 28), new THREE.MeshStandardMaterial({ roughness: 0.7 }), n);
    this.cardAtlas = canvasTex(CARD * STAND_SLOTS, CARD * G);
    const cardGeos = [];
    this.groups.forEach((r, gi) => {
      for (let k = 0; k < STAND_SLOTS; k++) {
        const g = new THREE.CircleGeometry(0.34, 28);
        const uv = g.attributes.uv;
        const u0 = k / STAND_SLOTS;
        const v0 = 1 - (gi + 1) / G;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) / STAND_SLOTS, v0 + uv.getY(i) / G);
        g.translate(r.cx + STAND_DX[k], WREATH_Y, STAND_Z + 0.2);
        cardGeos.push(g);
      }
    });
    this.cards = new THREE.Mesh(mergeGeometries(cardGeos), new THREE.MeshBasicMaterial({ map: this.cardAtlas.tex, transparent: true, alphaTest: 0.4 }));
    cardGeos.forEach((g) => g.dispose());
    for (let i = 0; i < n; i++) {
      this.stands.setMatrixAt(i, ZERO);
      this.wreaths.setMatrixAt(i, ZERO);
      this.wreaths.setColorAt(i, _c.set(0xffffff));
    }

    // --- bóng bay: G × 3 chùm × 7 quả + dây (LineSegments cập nhật theo gió)
    const nb = G * BALLOON_SLOTS * BALLOON_N;
    this.balloons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, low ? 10 : 14, low ? 8 : 10), new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 0.1 }), nb);
    this.balloons.frustumCulled = false;
    this.strings = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xdedede, transparent: true, opacity: 0.7 }));
    this.strings.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nb * 6), 3));
    this.strings.frustumCulled = false;
    this.balloonOfs = [];
    for (let k = 0; k < BALLOON_N; k++) {
      const a = (k / BALLOON_N) * Math.PI * 2;
      const ring = k === 0 ? 0 : 0.45;
      this.balloonOfs.push({ x: Math.cos(a) * ring, y: 1.05 + (k === 0 ? 0.45 : (k % 2) * 0.22), z: Math.sin(a) * ring * 0.7, s: 0.9 + ((k * 37) % 10) / 40 });
    }
    for (let i = 0; i < nb; i++) {
      this.balloons.setMatrixAt(i, ZERO);
      this.balloons.setColorAt(i, _c.set(0xffffff));
    }
    this.balloonOn = new Array(G * BALLOON_SLOTS).fill(0); // 0 = không có, >0 = lúc thả (giây) để bay lên
    this.balloonPal = this.groups.map((r) => {
      const a = new THREE.Color(r.def.accent);
      return [a, new THREE.Color(0xffffff), new THREE.Color(0xffd23f), a, new THREE.Color(0xff8cc4), new THREE.Color(0x8fe3ff), a];
    });
    this.balloons.count = 0;
    this.stands.count = 0;
    this.wreaths.count = 0;

    // --- hộp quà: 2 đống / nhóm ở góc trước sân khấu (6 hộp / đống, xếp kim tự tháp)
    const boxTex = canvasTex(64, 64, (ctx) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(27, 0, 10, 64);
      ctx.fillRect(0, 27, 64, 10);
    }, { mips: true });
    this.boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: boxTex.tex, roughness: 0.55 }), G * PILE_MAX);
    const PILE = [[-0.5, 0, 0.5], [0.05, 0, 0.42], [0.55, 0, 0.46], [-0.22, 1, 0.42], [0.32, 1, 0.38], [0.05, 2, 0.34]]; // [dx, tầng, cỡ]
    const BOX_COLORS = [0xff4fa3, 0x35d0ff, 0xffd23f, 0x9b5cff, 0x3be38f, 0xff7a3d];
    this.boxSlots = [];
    this.groups.forEach((r, gi) => {
      const sy = GROUP.stageY;
      // sau hàng cột giàn đèn (z -30,6), trước loa lớn (z -31,6)
      const piles = [{ x: r.cx + 7.0, z: -31.3 }, { x: r.cx - 7.15, z: -31.3 }];
      for (let k = 0; k < PILE_MAX; k++) {
        const pile = piles[k % 2];
        const [dx, tier, s] = PILE[Math.floor(k / 2)];
        let y = sy;
        for (let t = 0; t < tier; t++) y += PILE[t === 0 ? 0 : 3][2] * 0.98;
        this.boxSlots.push({ x: pile.x + dx, y: y + s / 2, z: pile.z + (((k * 13) % 5) - 2) * 0.02, s, ry: ((k * 53) % 17) * 0.09, shown: false, at: 0 });
        this.boxes.setColorAt(gi * PILE_MAX + k, _c.set(BOX_COLORS[(k + gi) % BOX_COLORS.length]));
      }
    });
    for (let i = 0; i < G * PILE_MAX; i++) this.boxes.setMatrixAt(i, ZERO);
    this.boxes.frustumCulled = false;

    // --- băng rôn TOP FAN: atlas G ô 1024×188, mỗi ô 1 mặt phẳng 12 × 2,2 m trên tường trước cửa
    this.bannerAtlas = canvasTex(1024, 188 * G);
    const bGeos = this.groups.map((r, gi) => {
      const g = new THREE.PlaneGeometry(BANNER.w, BANNER.h);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), 1 - (gi + 1 - uv.getY(i)) / G);
      return g.translate(r.cx, BANNER.y, GROUP.front + 0.15);
    });
    this.banner = new THREE.Mesh(mergeGeometries(bGeos), new THREE.MeshBasicMaterial({ map: this.bannerAtlas.tex, toneMapped: false }));
    bGeos.forEach((g) => g.dispose());

    for (const m of [this.stands, this.wreaths, this.cards, this.balloons, this.strings, this.boxes, this.banner]) {
      m.castShadow = false;
      scene.add(m);
    }
    for (const m of [this.stands, this.wreaths]) {
      m.computeBoundingSphere?.();
      m.frustumCulled = false; // ô hiện dần theo quà: hình cầu bao lúc dựng (toàn 0) không còn đúng
    }
    this._cardsDirty = false;
    this._bannerDirty = new Set(this.clubs);
    this._uploadT = 0;
    this.redrawAll();
  }

  /** Quà của người xem cho nhóm `club` (nhóm của người tặng). */
  onGift({ club, id, name, xu }, now = Date.now()) {
    const r = this.trace.add(club, { id, name, xu }, now);
    if (!r) return null;
    const gi = r.club - 1;
    if (r.stand != null) this._drawStand(gi, r.stand);
    if (r.balloon != null) this._setBalloon(gi, r.balloon, performance.now() / 1000);
    this._syncPile(gi, performance.now() / 1000);
    if (r.topChanged) this._bannerDirty.add(r.club);
    return r;
  }

  toJSON() {
    return this.trace.toJSON();
  }

  /** Khôi phục buổi LIVE (bóng bay / hộp quà hiện ngay, không bay lên lại). */
  load(json) {
    this.trace = GiftTrace.fromJSON(json, { clubs: this.clubs });
    this.redrawAll(true);
  }

  /** Buổi LIVE mới: xoá sạch. */
  clear() {
    this.trace.clear();
    this.redrawAll(true);
  }

  redrawAll(instant = false) {
    const t = instant ? -100 : performance.now() / 1000;
    this.groups.forEach((_, gi) => {
      for (let k = 0; k < STAND_SLOTS; k++) this._drawStand(gi, k);
      for (let k = 0; k < BALLOON_SLOTS; k++) this._setBalloon(gi, k, this.trace.club(gi + 1).balloons[k] ? t : 0);
      this._syncPile(gi, t);
      this._bannerDirty.add(gi + 1);
    });
  }

  _drawStand(gi, k) {
    const c = this.trace.club(gi + 1);
    const s = c.stands[k];
    const room = this.groups[gi];
    const ctx = this.cardAtlas.ctx;
    const x = k * CARD;
    const y = gi * CARD;
    ctx.clearRect(x, y, CARD, CARD);
    this._standsDirty = true;
    if (s) {
      const tier = standTier(s.xu);
      // huy hiệu tròn: viền màu nhóm, tên người tặng, số xu
      const cx = x + CARD / 2;
      const cy = y + CARD / 2;
      ctx.fillStyle = tier === 3 ? '#fff4cf' : '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, CARD / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = tier === 3 ? '#d4a017' : room.def.accent;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(cx, cy, CARD / 2 - 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#2a1f33';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 22px ${FONT}`;
      ctx.fillText(['', '🌸', '💖', '👑'][tier], cx, cy - 34);
      fit(ctx, s.name, cx, cy + 2, CARD - 22, 26);
      ctx.fillStyle = '#7a5a2a';
      fit(ctx, `${fmt(s.xu)} xu`, cx, cy + 30, CARD - 34, 18, 700);
    }
    this._cardsDirty = true;
  }

  /** Dồn kệ hoa đang có lên đầu mảng instance (count = số kệ) → ô trống không tốn tam giác. */
  _packStands() {
    let n = 0;
    this.groups.forEach((room, gi) => {
      const c = this.trace.club(gi + 1);
      c.stands.forEach((s, k) => {
        if (!s) return;
        const tier = standTier(s.xu);
        const px = room.cx + STAND_DX[k];
        this.stands.setMatrixAt(n, _m.makeTranslation(px, 0, STAND_Z));
        const sc = [0, 0.82, 1, 1.22][tier];
        this.wreaths.setMatrixAt(n, _m.compose(_p.set(px, WREATH_Y, STAND_Z), _q.identity(), _s.set(sc, sc, sc * 0.9)));
        const flower = tier === 3 ? 0xffd23f : tier === 2 ? room.def.accent : [0xff8cc4, 0xffb3c7, 0xff6f91, 0xfff0f5][(k + gi) % 4];
        this.wreaths.setColorAt(n, _c.set(flower));
        n++;
      });
    });
    this.stands.count = n;
    this.wreaths.count = n;
    this.stands.instanceMatrix.needsUpdate = true;
    this.wreaths.instanceMatrix.needsUpdate = true;
    this.wreaths.instanceColor.needsUpdate = true;
  }

  _setBalloon(gi, k, at) {
    this.balloonOn[gi * BALLOON_SLOTS + k] = at;
  }

  _syncPile(gi, at) {
    const want = pileCount(this.trace.club(gi + 1)?.xu ?? 0);
    for (let k = 0; k < PILE_MAX; k++) {
      const s = this.boxSlots[gi * PILE_MAX + k];
      const on = k < want;
      if (on && !s.shown) {
        s.shown = true;
        s.at = at;
      } else if (!on && s.shown) s.shown = false;
      if (!s.shown) this.boxes.setMatrixAt(gi * PILE_MAX + k, ZERO);
    }
    this.boxes.instanceMatrix.needsUpdate = true;
  }

  _drawBanner(club) {
    const gi = club - 1;
    const room = this.groups[gi];
    const ctx = this.bannerAtlas.ctx;
    const H = 188;
    const y0 = gi * H;
    const top = this.trace.top(club);
    const g = ctx.createLinearGradient(0, y0, 1024, y0);
    g.addColorStop(0, '#120c1e');
    g.addColorStop(0.5, '#24163a');
    g.addColorStop(1, '#120c1e');
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, 1024, H);
    ctx.strokeStyle = room.def.accent;
    ctx.lineWidth = 8;
    ctx.strokeRect(8, y0 + 8, 1008, H - 16);
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, y0 + 20, 984, H - 40);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23f';
    fit(ctx, `🏆 BẢNG VÀNG ${room.def.name}`, 512, y0 + 50, 900, 46);
    if (!top.length) {
      ctx.fillStyle = '#ffffff';
      fit(ctx, 'Tặng quà để treo tên ở đây!', 512, y0 + 120, 900, 50, 700);
      return;
    }
    const medal = ['🥇', '🥈', '🥉'];
    const w = 1024 / Math.max(1, top.length);
    top.forEach((f, i) => {
      const cx = w * i + w / 2;
      ctx.fillStyle = i === 0 ? '#ffe27a' : '#ffffff';
      fit(ctx, `${medal[i]} ${f.name}`, cx, y0 + 112, w - 40, i === 0 ? 46 : 40);
      ctx.fillStyle = '#c9b8ff';
      fit(ctx, `${fmt(f.xu)} xu`, cx, y0 + 152, w - 60, 28, 700);
    });
  }

  update(dt, t) {
    // bóng bay đung đưa + dây; quả mới thả thì bay lên từ sân khấu trong 1,2 giây
    // (chỉ chùm đang có: dồn lên đầu mảng instance, count = số quả)
    if (this._standsDirty) {
      this._standsDirty = false;
      this._packStands();
    }
    const pos = this.strings.geometry.attributes.position.array;
    const now = performance.now() / 1000;
    let i = 0;
    for (let slot = 0; slot < this.balloonOn.length; slot++) {
      const at = this.balloonOn[slot];
      if (!at) continue;
      const gi = Math.floor(slot / BALLOON_SLOTS);
      const k = slot % BALLOON_SLOTS;
      const ax = this.groups[gi].cx + BALLOON_DX[k];
      for (let b = 0; b < BALLOON_N; b++, i++) {
        this.balloons.setColorAt(i, this.balloonPal[gi][(b + k) % BALLOON_N]);
        const o = this.balloonOfs[b];
        const rise = Math.min(1, Math.max(0, (now - at) / 1.2));
        const e = 1 - (1 - rise) ** 3;
        const sway = Math.sin(t * 0.9 + b * 1.3 + slot) * 0.08;
        const x = ax + o.x + sway;
        const y = TRUSS.y - (1 - e) * 6 + o.y + Math.sin(t * 1.3 + b) * 0.04;
        const z = TRUSS.z + o.z + Math.cos(t * 0.7 + b) * 0.05;
        this.balloons.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q.identity(), _s.set(o.s, o.s * 1.15, o.s)));
        pos[i * 6] = ax + o.x * 0.2;
        pos[i * 6 + 1] = TRUSS.y - (1 - e) * 6 + 0.1;
        pos[i * 6 + 2] = TRUSS.z;
        pos[i * 6 + 3] = x;
        pos[i * 6 + 4] = y - 0.36 * o.s;
        pos[i * 6 + 5] = z;
      }
    }
    this.balloons.count = i;
    this.strings.geometry.setDrawRange(0, i * 2);
    if (i || this._hadBalloons) {
      this.balloons.instanceMatrix.needsUpdate = true;
      this.balloons.instanceColor.needsUpdate = true;
      this.strings.geometry.attributes.position.needsUpdate = true;
    }
    this._hadBalloons = i > 0;
    // hộp quà mới bật nảy lên
    let boxDirty = false;
    for (let i = 0; i < this.boxSlots.length; i++) {
      const s = this.boxSlots[i];
      if (!s.shown) continue;
      const k = Math.min(1, Math.max(0, (now - s.at) / 0.45));
      if (k >= 1 && s.done) continue;
      s.done = k >= 1;
      const pop = k >= 1 ? 1 : Math.sin(k * Math.PI * 0.5) * (1 + 0.25 * Math.sin(k * Math.PI));
      const sc = s.s * pop;
      _q.setFromAxisAngle(_p.set(0, 1, 0), s.ry);
      this.boxes.setMatrixAt(i, _m.compose(_p.set(s.x, s.y - s.s / 2 + sc / 2, s.z), _q, _s.set(sc, sc, sc)));
      boxDirty = true;
    }
    for (const s of this.boxSlots) if (!s.shown) s.done = false;
    if (boxDirty) this.boxes.instanceMatrix.needsUpdate = true;
    // tải atlas lên GPU tối đa 2 lần / giây
    this._uploadT -= dt;
    if (this._uploadT <= 0) {
      this._uploadT = 0.5;
      if (this._cardsDirty) {
        this._cardsDirty = false;
        this.cardAtlas.tex.needsUpdate = true;
      }
      if (this._bannerDirty.size) {
        for (const c of this._bannerDirty) this._drawBanner(c);
        this._bannerDirty.clear();
        this.bannerAtlas.tex.needsUpdate = true;
      }
    }
  }
}
