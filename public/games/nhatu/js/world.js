/**
 * Builds the cell block: two floors of cells with bars, a yellow-railed balcony,
 * stairs, cafeteria tables, a basketball court. Static boxes are merged per
 * material to keep draw calls low; every solid box is also registered in the
 * CollisionWorld.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CollisionWorld, makeBox } from './logic/physics.js';

export const HALL = { minX: -20, maxX: 20, minZ: -16, maxZ: 14, height: 7.2 };
export const UPPER_Y = 3.4;
const SLAB_BOTTOM = 3.1;
const BAR_H = 3.0;

const COLORS = {
  wall: 0xe8ecf0,
  cellWall: 0xdde2e8,
  concrete: 0xc9ced5,
  stairs: 0xbcc3cb,
  blue: 0x2f6db5,
  yellow: 0xf2c230,
  bars: 0x2a2e35,
  tableTop: 0xe9ecf0,
  bench: 0xd8dde3,
  leg: 0x2c3138,
  mattress: 0xf4f5f7,
  ceiling: 0xdfe3e8,
  court: 0xe0773a,
};

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Collects transformed geometries per material and merges them into a few meshes. */
class StaticBatch {
  constructor() {
    this.groups = new Map();
  }
  add(geometry, material, { cast = true, receive = true, blocker = false } = {}) {
    const key = `${material.uuid}|${cast}|${receive}|${blocker}`;
    if (!this.groups.has(key)) this.groups.set(key, { material, cast, receive, blocker, list: [] });
    this.groups.get(key).list.push(geometry);
  }
  build(scene, blockers) {
    for (const g of this.groups.values()) {
      const merged = mergeGeometries(g.list, false);
      const m = new THREE.Mesh(merged, g.material);
      m.castShadow = g.cast;
      m.receiveShadow = g.receive;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      scene.add(m);
      if (g.blocker) blockers.push(m);
      for (const geo of g.list) geo.dispose();
    }
  }
}

/** Collects instance transforms per key and emits one InstancedMesh per key. */
class Instancer {
  constructor() {
    this.kinds = new Map();
    this.dummy = new THREE.Object3D();
  }
  define(key, geometry, material, cast = true) {
    this.kinds.set(key, { geometry, material, cast, matrices: [] });
  }
  add(key, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    const d = this.dummy;
    d.position.set(x, y, z);
    d.rotation.set(rx, ry, rz);
    d.scale.set(sx, sy, sz);
    d.updateMatrix();
    this.kinds.get(key).matrices.push(d.matrix.clone());
  }
  build(scene) {
    for (const k of this.kinds.values()) {
      if (!k.matrices.length) continue;
      const im = new THREE.InstancedMesh(k.geometry, k.material, k.matrices.length);
      k.matrices.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = k.cast;
      im.receiveShadow = true;
      scene.add(im);
    }
  }
}

/**
 * Build the whole level.
 * @returns world description used by gameplay systems
 */
export function buildWorld(scene) {
  const collision = new CollisionWorld(4);
  const batch = new StaticBatch();
  const inst = new Instancer();
  const cameraBlockers = [];
  const M = {};
  for (const [k, c] of Object.entries(COLORS)) M[k] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
  M.bars.roughness = 0.45;
  M.bars.metalness = 0.4;
  M.yellow.roughness = 0.5;
  M.light = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6dd, emissiveIntensity: 0.8 });
  const blankets = [0x5b8fd6, 0xe58fa6, 0x7ccfb6, 0x9b86d9].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
  const posters = [0xf2a65a, 0x6fc2e8, 0xe56b6f, 0x9ad17a, 0xf6d55c].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));

  /** Add an axis-aligned box in world coordinates. */
  function box(x0, x1, y0, y1, z0, z1, material, opts = {}) {
    const { collide = true, walkable = false, cast = true, receive = true, blocker = false, invisible = false } = opts;
    if (!invisible) {
      const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
      geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      batch.add(geo, material, { cast, receive, blocker });
    }
    if (collide) collision.add(makeBox(x0, x1, y0, y1, z0, z1, walkable));
  }

  // ---------------------------------------------------------------- floor
  const floorTex = canvasTexture(128, 128, (ctx) => {
    const a = '#eef0f3';
    const b = '#c9cfd7';
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = b;
    ctx.fillRect(64, 0, 64, 64);
    ctx.fillRect(0, 64, 64, 64);
    ctx.strokeStyle = 'rgba(120,130,145,.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 62, 62);
    ctx.strokeRect(65, 1, 62, 62);
    ctx.strokeRect(1, 65, 62, 62);
    ctx.strokeRect(65, 65, 62, 62);
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(20, 15);
  floorTex.anisotropy = 8;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 30),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -1);
  floor.receiveShadow = true;
  scene.add(floor);

  // ---------------------------------------------------------------- outer shell
  const H = HALL.height;
  box(-20.4, 20.4, 0, H, -16.4, -16, M.wall, { blocker: true });
  box(-20.4, -20, 0, H, -16.4, 14.4, M.wall, { blocker: true });
  box(20, 20.4, 0, H, -16.4, 14.4, M.wall, { blocker: true });
  box(-20.4, 20.4, 0, H, 14, 14.4, M.wall, { blocker: true });
  // ceiling: a downward-facing plane, invisible from above so the camera can zoom out over the roof
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), M.ceiling);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, H, -1);
  scene.add(ceiling);
  // solid corner + end blocks of the cell rows
  box(-20, -16, 0, H, -16, -12, M.cellWall, { blocker: true });
  box(-20, -16, 0, H, 12, 14, M.cellWall, { blocker: true });
  box(12, 20, 0, H, -16, -12, M.wall, { blocker: true });
  // painted bands (blue lower wall + yellow stripe) like a gym
  box(19.95, 20, 0, 2.6, -12, 14, M.blue, { collide: false, cast: false });
  box(19.94, 20, 2.6, 2.78, -12, 14, M.yellow, { collide: false, cast: false });
  box(-16, 20, 0, 2.6, 13.95, 14, M.blue, { collide: false, cast: false });
  box(-16, 20, 2.6, 2.78, 13.94, 14, M.yellow, { collide: false, cast: false });
  box(12.6, 20, 2.6, 2.78, -12.06, -12, M.yellow, { collide: false, cast: false });
  box(12.6, 20, 0, 2.6, -12.05, -12, M.blue, { collide: false, cast: false });
  // gate on the front wall
  box(-2.2, 2.2, 0, 3.4, 13.85, 13.95, M.bars, { collide: false });
  const gateSign = signMesh('CỔNG TRẠI', 2.4, 0.5, '#2b2f36', '#ffd34d');
  gateSign.position.set(0, 3.8, 13.9);
  gateSign.rotation.y = Math.PI;
  scene.add(gateSign);
  const rules = signMesh('NỘI QUY: Ăn nhẹ nói khẽ • Đúng giờ điểm danh • Giữ vệ sinh', 6.5, 0.55, '#f7f3e3', '#3a3a3a');
  rules.position.set(8, 3.5, 13.9);
  rules.rotation.y = Math.PI;
  scene.add(rules);
  // ceiling light panels
  const panelGeo = new THREE.PlaneGeometry(2.4, 0.6);
  for (let x = -12; x <= 16; x += 7) {
    for (let z = -6; z <= 10; z += 8) {
      const panel = new THREE.Mesh(panelGeo, M.light);
      panel.rotation.x = Math.PI / 2;
      panel.position.set(x, H - 0.02, z);
      scene.add(panel);
    }
  }

  // ---------------------------------------------------------------- cells
  const cells = [];
  inst.define('bar', new THREE.CylinderGeometry(0.028, 0.028, 1, 6), M.bars);
  inst.define('hbar', new THREE.BoxGeometry(1, 1, 1), M.bars);
  inst.define('post', new THREE.CylinderGeometry(0.045, 0.045, 1, 8), M.yellow);
  inst.define('rail', new THREE.CylinderGeometry(0.05, 0.05, 1, 8), M.yellow);

  const frames = [];
  for (let i = 0; i < 7; i++) frames.push({ side: 'back', cx: -16 + 4 * i + 2, cz: -12, rot: 0 });
  for (let j = 0; j < 6; j++) frames.push({ side: 'left', cx: -16, cz: -12 + 4 * j + 2, rot: 1 });

  const toWorld = (f, lx, lz) => (f.rot === 0 ? [f.cx + lx, f.cz + lz] : [f.cx + lz, f.cz - lx]);
  function localBox(f, lx0, lx1, y0, y1, lz0, lz1, material, opts) {
    if (f.rot === 0) box(f.cx + lx0, f.cx + lx1, y0, y1, f.cz + lz0, f.cz + lz1, material, opts);
    else box(f.cx + lz0, f.cx + lz1, y0, y1, f.cz - lx1, f.cz - lx0, material, opts);
  }
  /** Horizontal bar along local x (or local z when alongZ). */
  function localHBar(f, l0, l1, y, fixed, alongZ = false) {
    const len = l1 - l0;
    const mid = (l0 + l1) / 2;
    const [wx, wz] = alongZ ? toWorld(f, fixed, mid) : toWorld(f, mid, fixed);
    const lengthOnWorldX = (f.rot === 0) !== alongZ;
    inst.add('hbar', wx, y, wz, lengthOnWorldX ? len : 0.05, 0.05, lengthOnWorldX ? 0.05 : len);
  }

  // cửa song sắt đóng (phòng biệt giam) — ẩn sẵn, bật bằng setCellLocked()
  const doorParts = [];
  for (let x = -0.45; x <= 0.46; x += 0.15) {
    const b = new THREE.CylinderGeometry(0.03, 0.03, 2.15, 6);
    b.translate(x, 1.08, 0);
    doorParts.push(b);
  }
  for (const y of [0.1, 1.1, 2.12]) {
    const h = new THREE.BoxGeometry(1.0, 0.06, 0.06);
    h.translate(0, y, 0);
    doorParts.push(h);
  }
  const lockBox = new THREE.BoxGeometry(0.16, 0.2, 0.12);
  lockBox.translate(0.38, 1.05, 0.05);
  doorParts.push(lockBox);
  const closedDoorGeo = mergeGeometries(doorParts, false);
  const closedDoorMat = new THREE.MeshStandardMaterial({ color: 0x1f232a, roughness: 0.4, metalness: 0.5 });

  let cellNo = 1;
  for (const level of [0, 1]) {
    const base = level === 0 ? 0 : UPPER_Y;
    for (const f of frames) {
      const id = `A-${String(cellNo++).padStart(2, '0')}`;
      // bars (front plane at local z = -0.05)
      for (let lx = -1.88; lx <= 1.9; lx += 0.17) {
        const inGap = lx > 0.38 && lx < 1.42;
        const [wx, wz] = toWorld(f, lx, -0.05);
        if (!inGap) inst.add('bar', wx, base + BAR_H / 2, wz, 1, BAR_H, 1);
        else inst.add('bar', wx, base + 2.2 + (BAR_H - 2.2) / 2, wz, 1, BAR_H - 2.2, 1);
      }
      for (const y of [0.08, 1.1]) {
        localHBar(f, -1.95, 0.4, base + y, -0.05);
        localHBar(f, 1.4, 1.95, base + y, -0.05);
      }
      localHBar(f, -1.95, 1.95, base + 2.2, -0.05);
      localHBar(f, -1.95, 1.95, base + BAR_H - 0.03, -0.05);
      localBox(f, -2, 0.4, base, base + BAR_H, -0.1, 0.0, M.bars, { invisible: true });
      localBox(f, 1.4, 2, base, base + BAR_H, -0.1, 0.0, M.bars, { invisible: true });
      // open door swung into the cell
      for (let lz = -0.17; lz >= -0.95; lz -= 0.17) {
        const [wx, wz] = toWorld(f, 1.36, lz);
        inst.add('bar', wx, base + 1.08, wz, 1, 2.1, 1);
      }
      for (const y of [0.1, 1.1, 2.1]) localHBar(f, -1.0, -0.05, base + y, 1.36, true);
      localBox(f, 1.32, 1.4, base, base + 2.15, -1.0, -0.05, M.bars, { invisible: true });
      // wall band above upper cells
      if (level === 1) localBox(f, -2, 2, base + BAR_H, H, -0.16, 0.0, M.cellWall, { blocker: true });
      // bunk bed
      const bx0 = -1.88, bx1 = -1.0, bz0 = -3.88, bz1 = -1.75;
      for (const lx of [bx0 + 0.04, bx1 - 0.04]) for (const lz of [bz0 + 0.04, bz1 - 0.04]) localBox(f, lx - 0.04, lx + 0.04, base, base + 2.0, lz - 0.04, lz + 0.04, M.bars, { collide: false });
      for (const y of [0.32, 1.32]) {
        localBox(f, bx0, bx1, base + y - 0.04, base + y, bz0, bz1, M.bars, { collide: false });
        localBox(f, bx0 + 0.03, bx1 - 0.03, base + y, base + y + 0.16, bz0 + 0.03, bz1 - 0.03, M.mattress, { collide: false });
        localBox(f, bx0 + 0.01, bx1 - 0.01, base + y + 0.05, base + y + 0.19, bz1 - 1.2, bz1 - 0.02, blankets[(cellNo + (y > 1 ? 1 : 0)) % blankets.length], { collide: false });
        localBox(f, bx0 + 0.12, bx1 - 0.12, base + y + 0.16, base + y + 0.26, bz0 + 0.08, bz0 + 0.42, M.mattress, { collide: false });
      }
      localBox(f, bx0, bx1, base, base + 2.0, bz0, bz1, M.bars, { invisible: true });
      // toilet
      localBox(f, 1.3, 1.72, base, base + 0.42, -3.6, -3.15, M.mattress, { walkable: false });
      localBox(f, 1.25, 1.77, base + 0.42, base + 0.82, -3.95, -3.72, M.mattress, { walkable: false });
      // poster
      localBox(f, -0.5, 0.35, base + 1.3, base + 2.0, -3.99, -3.95, posters[cellNo % posters.length], { collide: false, cast: false });
      // ceiling light strip in front of the cell
      const ly = level === 0 ? SLAB_BOTTOM - 0.06 : H - 0.06;
      localBox(f, -1.2, 1.2, ly, ly + 0.05, 0.25, 0.5, M.light, { collide: false, cast: false });
      // cell sign
      const sign = signMesh(id, 0.62, 0.26, '#2b2f36', '#ffffff');
      const [sx, sz] = toWorld(f, -0.85, 0.02);
      sign.position.set(sx, base + 2.62, sz);
      sign.rotation.y = f.rot === 0 ? 0 : Math.PI / 2;
      scene.add(sign);

      const door = new THREE.Mesh(closedDoorGeo, closedDoorMat);
      const [dx, dz] = toWorld(f, 0.9, -0.05);
      door.position.set(dx, base, dz);
      door.rotation.y = f.rot === 0 ? 0 : Math.PI / 2;
      door.visible = false;
      door.castShadow = true;
      scene.add(door);

      const pt = (lx, lz) => {
        const [x, z] = toWorld(f, lx, lz);
        return { x, z };
      };
      const c0 = toWorld(f, -2, -4);
      const c1 = toWorld(f, 2, 0);
      cells.push({
        id,
        level,
        side: f.side,
        y: base,
        front: pt(0.88, 1.0),
        door: pt(0.88, -0.45),
        inside: pt(0.25, -2.2),
        beds: [pt(-1.05, -2.35), pt(-1.05, -3.2)].map((b) => ({ ...b, y: base + 0.5, ry: f.rot === 0 ? Math.PI / 2 : Math.PI, occupant: null })),
        bounds: { minX: Math.min(c0[0], c1[0]), maxX: Math.max(c0[0], c1[0]), minZ: Math.min(c0[1], c1[1]), maxZ: Math.max(c0[1], c1[1]) },
        faceRy: f.rot === 0 ? Math.PI : -Math.PI / 2,
        doorMesh: door,
      });
    }
  }

  // dividing walls between cells (both floors)
  for (const [y0, y1] of [[0, SLAB_BOTTOM], [UPPER_Y, H]]) {
    for (let i = 1; i <= 6; i++) {
      const x = -16 + 4 * i;
      box(x - 0.12, x + 0.12, y0, y1, -16, -12, M.cellWall, { blocker: true });
    }
    for (let j = 1; j <= 5; j++) {
      const z = -12 + 4 * j;
      box(-20, -16, y0, y1, z - 0.12, z + 0.12, M.cellWall, { blocker: true });
    }
  }
  // upper floor slabs (cells + walkway)
  box(-16, 12.6, SLAB_BOTTOM, UPPER_Y, -16, -10, M.concrete, { walkable: true, blocker: true });
  box(-20, -14, SLAB_BOTTOM, UPPER_Y, -12, 12, M.concrete, { walkable: true, blocker: true });
  // light strips under the balcony
  for (let x = -12; x <= 10; x += 4) box(x - 0.9, x + 0.9, SLAB_BOTTOM - 0.05, SLAB_BOTTOM, -10.6, -10.4, M.light, { collide: false, cast: false });

  // pillars under the balcony edge
  const pillars = [];
  for (let x = -14; x <= 10; x += 4) pillars.push([x, -10]);
  for (let z = -6; z <= 10; z += 4) pillars.push([-14, z]);
  for (const [x, z] of pillars) box(x - 0.18, x + 0.18, 0, SLAB_BOTTOM, z - 0.18, z + 0.18, M.concrete);

  // railing (yellow) on the balcony edges
  const railTop = UPPER_Y + 1.05;
  function railX(z, x0, x1) {
    for (let x = x0; x <= x1 + 0.01; x += 1.0) inst.add('post', x, UPPER_Y + 0.525, z, 1, 1.05, 1);
    for (const y of [railTop, UPPER_Y + 0.55]) inst.add('rail', (x0 + x1) / 2, y, z, 1, x1 - x0, 1, 0, 0, Math.PI / 2);
    collision.add(makeBox(x0, x1, UPPER_Y, railTop + 0.05, z - 0.07, z + 0.07, false));
  }
  function railZ(x, z0, z1) {
    for (let z = z0; z <= z1 + 0.01; z += 1.0) inst.add('post', x, UPPER_Y + 0.525, z, 1, 1.05, 1);
    for (const y of [railTop, UPPER_Y + 0.55]) inst.add('rail', x, y, (z0 + z1) / 2, 1, z1 - z0, 1, Math.PI / 2, 0, 0);
    collision.add(makeBox(x - 0.07, x + 0.07, UPPER_Y, railTop + 0.05, z0, z1, false));
  }
  railX(-10, -14, 12.6);
  railZ(-14, -10, 12);
  railX(12, -16, -14);
  box(-14.04, -13.96, SLAB_BOTTOM - 0.02, UPPER_Y, -10, 12, M.yellow, { collide: false });
  box(-14, 12.6, SLAB_BOTTOM - 0.02, UPPER_Y, -10.04, -9.96, M.yellow, { collide: false });

  // stairs along the back block, rising toward -x
  const STEPS = 12;
  const sx0 = 12.6, sx1 = 19.0;
  const stepW = (sx1 - sx0) / STEPS;
  for (let k = 0; k < STEPS; k++) {
    const x1 = sx1 - k * stepW;
    const x0 = x1 - stepW;
    const top = ((k + 1) * UPPER_Y) / STEPS;
    box(x0, x1, 0, top, -12, -10, M.stairs, { walkable: true });
    box(x0, x0 + 0.08, top, top + 0.01, -12, -10, M.yellow, { collide: false, cast: false });
  }
  // sloped stair rail (visual) + posts
  {
    const dx = sx1 - sx0;
    const dy = UPPER_Y - UPPER_Y / STEPS;
    const len = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    inst.add('rail', (sx0 + sx1) / 2, (UPPER_Y + UPPER_Y / STEPS) / 2 + 1.0, -10, 1, len, 1, 0, 0, Math.PI / 2 + ang);
    for (let k = 0; k <= STEPS; k += 2) {
      const x = sx1 - k * stepW - stepW / 2;
      const top = ((k + 1) * UPPER_Y) / STEPS;
      inst.add('post', x, top + 0.5, -10, 1, 1.0, 1);
    }
  }

  // floor guide lines
  box(-13.6, 12.6, 0.003, 0.012, -9.66, -9.56, M.yellow, { collide: false, cast: false });
  box(-13.66, -13.56, 0.003, 0.012, -9.6, 12, M.yellow, { collide: false, cast: false });

  // ---------------------------------------------------------------- cafeteria
  const seats = [];
  const tables = [];
  const trayMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  for (const tx of [-9, -2, 5]) {
    for (const tz of [-5, 1, 7]) {
      tables.push({ x: tx, z: tz });
      box(tx - 1.3, tx + 1.3, 0.72, 0.8, tz - 0.5, tz + 0.5, M.tableTop, { collide: false });
      for (const lx of [-0.95, 0.95]) {
        box(tx + lx - 0.06, tx + lx + 0.06, 0, 0.72, tz - 0.06, tz + 0.06, M.leg, { collide: false });
        box(tx + lx - 0.06, tx + lx + 0.06, 0, 0.06, tz - 0.4, tz + 0.4, M.leg, { collide: false });
      }
      for (const lx of [-0.7, 0.55]) box(tx + lx - 0.2, tx + lx + 0.2, 0.8, 0.82, tz - 0.3, tz + 0.05, trayMat, { collide: false, cast: false });
      collision.add(makeBox(tx - 1.3, tx + 1.3, 0, 0.8, tz - 0.5, tz + 0.5, true));
      for (const s of [-1, 1]) {
        const bz = tz + s * 0.85;
        box(tx - 1.3, tx + 1.3, 0.4, 0.46, bz - 0.17, bz + 0.17, M.bench, { walkable: true, collide: false });
        for (const lx of [-1.0, 1.0]) box(tx + lx - 0.05, tx + lx + 0.05, 0, 0.4, bz - 0.05, bz + 0.05, M.leg, { collide: false });
        collision.add(makeBox(tx - 1.3, tx + 1.3, 0, 0.46, bz - 0.17, bz + 0.17, true));
        for (const lx of [-0.85, 0, 0.85]) {
          seats.push({ x: tx + lx, z: bz, y: 0.46, ry: s > 0 ? Math.PI : 0, approach: { x: tx + lx, z: tz + s * 1.5 }, occupant: null });
        }
      }
    }
  }

  // ---------------------------------------------------------------- basketball court
  const rim = new THREE.Vector3(19.15, 3.05, 1);
  const boardTex = canvasTexture(256, 160, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e8572a';
    ctx.lineWidth = 10;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#e8572a';
    ctx.fillRect(w / 2 - 45, h / 2 - 25, 90, 70);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(w / 2 - 33, h / 2 - 13, 66, 46);
  });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.15), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.4 }));
  board.position.set(19.7, 3.55, 1);
  board.rotation.y = -Math.PI / 2;
  board.castShadow = true;
  scene.add(board);
  box(19.72, 20, 3.45, 3.6, 0.9, 1.1, M.bars, { collide: false });
  box(19.38, 19.72, 3.03, 3.07, 0.97, 1.03, M.court, { collide: false });
  const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.022, 8, 24), new THREE.MeshStandardMaterial({ color: 0xe8572a, roughness: 0.4 }));
  rimMesh.rotation.x = Math.PI / 2;
  rimMesh.position.copy(rim);
  scene.add(rimMesh);
  const net = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.15, 0.42, 12, 3, true),
    new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.85 })
  );
  net.position.set(rim.x, rim.y - 0.22, rim.z);
  scene.add(net);
  const lineMat = new THREE.MeshBasicMaterial({ color: COLORS.court });
  const addLine = (geo) => {
    const m = new THREE.Mesh(geo, lineMat);
    m.rotation.x = -Math.PI / 2;
    return m;
  };
  box(15.0, 19.95, 0.004, 0.011, -1.0, -0.9, lineMat, { collide: false, cast: false });
  box(15.0, 19.95, 0.004, 0.011, 2.9, 3.0, lineMat, { collide: false, cast: false });
  box(15.0, 15.1, 0.004, 0.011, -1.0, 3.0, lineMat, { collide: false, cast: false });
  const ft = addLine(new THREE.RingGeometry(1.75, 1.85, 32, 1, Math.PI / 2, Math.PI));
  ft.position.set(15.05, 0.008, 1);
  scene.add(ft);
  const three = addLine(new THREE.RingGeometry(6.4, 6.5, 48, 1, Math.PI / 2 + 0.05, Math.PI - 0.1));
  three.position.set(rim.x, 0.008, 1);
  scene.add(three);

  // 👑 ghế đại ca + thảm đỏ (góc trước-trái sảnh)
  const throne = { x: -9, z: 12.35, y: 0.5, ry: Math.PI, approach: { x: -9, z: 11.2 }, occupant: null };
  {
    const red = new THREE.MeshStandardMaterial({ color: 0xc0262d, roughness: 0.7 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.3, metalness: 0.4, emissive: 0x2a1d00 });
    const tx = throne.x, tz = throne.z;
    box(tx - 0.55, tx + 0.55, 0, 0.5, tz - 0.45, tz + 0.45, red, { walkable: false });
    box(tx - 0.6, tx + 0.6, 0.5, 1.9, tz + 0.38, tz + 0.55, gold, { collide: false });
    box(tx - 0.62, tx - 0.5, 0.5, 0.85, tz - 0.4, tz + 0.45, gold, { collide: false });
    box(tx + 0.5, tx + 0.62, 0.5, 0.85, tz - 0.4, tz + 0.45, gold, { collide: false });
    box(tx - 0.2, tx + 0.2, 1.9, 2.15, tz + 0.4, tz + 0.52, gold, { collide: false });
    box(tx - 0.8, tx + 0.8, 0.003, 0.01, tz - 3.6, tz - 0.45, red, { collide: false, cast: false });
  }

  // 🧑‍🍳 quầy cơm của Đầu Bếp (dưới ban công, giữa hai cột)
  const kitchen = { chef: { x: -3, z: -9.55, ry: 0 }, serveSpots: [{ x: -4, z: -7.85 }, { x: -3, z: -7.85 }, { x: -2, z: -7.85 }] };
  {
    const steel = new THREE.MeshStandardMaterial({ color: 0xb8c0c8, roughness: 0.35, metalness: 0.5 });
    const pot = new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.4, metalness: 0.6 });
    box(-4.6, -1.4, 0, 0.92, -9.15, -8.5, steel);
    box(-4.65, -1.35, 0.92, 0.97, -9.2, -8.45, M.tableTop, { collide: false });
    for (const [px, r] of [[-4.0, 0.22], [-3.0, 0.26], [-2.0, 0.2]]) {
      const geo = new THREE.CylinderGeometry(r, r * 0.92, 0.3, 16);
      geo.translate(px, 1.12, -8.82);
      batch.add(geo, pot, { cast: true, receive: true });
    }
    const sign = signMesh('🍚 BẾP ĂN', 1.6, 0.42, '#c0262d', '#ffffff');
    sign.position.set(-3, 2.55, -9.6);
    scene.add(sign);
  }

  inst.build(scene);
  batch.build(scene, cameraBlockers);

  // ---------------------------------------------------------------- lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9aa3ad, 1.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfffaf0, 1.9);
  sun.position.set(14, 30, 12);
  sun.target.position.set(0, 0, -1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 80 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const lamps = [];
  for (const [x, z] of [[-8, -3], [4, -3], [-8, 8], [4, 8], [15, 2]]) {
    const p = new THREE.PointLight(0xffe2b0, 0, 22, 1.2);
    p.position.set(x, 6.4, z);
    scene.add(p);
    lamps.push(p);
  }
  const dayBg = new THREE.Color(0xdfe6ee);
  const nightBg = new THREE.Color(0x101626);
  scene.background = dayBg.clone();
  const hemiDay = new THREE.Color(0xffffff);
  const hemiNight = new THREE.Color(0x6f80b8);

  /** Blend between day (0) and night (1) lighting. */
  function setNight(f) {
    hemi.intensity = THREE.MathUtils.lerp(1.55, 0.45, f);
    hemi.color.copy(hemiDay).lerp(hemiNight, f);
    sun.intensity = THREE.MathUtils.lerp(1.9, 0.12, f);
    for (const l of lamps) l.intensity = THREE.MathUtils.lerp(0, 9, f);
    M.light.emissiveIntensity = THREE.MathUtils.lerp(0.8, 2.2, f);
    scene.background.copy(dayBg).lerp(nightBg, f);
  }

  // ---------------------------------------------------------------- navigation data
  const rollcallSpots = [];
  for (let z = -6.8; z <= 11.5; z += 1.4) for (const x of [11.2, 12.4, 13.6, 14.8, 16.0, 17.2]) rollcallSpots.push({ x, z });
  const courtSpots = [];
  for (const [x, z] of [[15.5, 1], [16.2, -1.5], [16.2, 3.5], [14.2, 0], [14.2, 2.5], [17.2, 1.8], [17.4, 0.2]]) courtSpots.push({ x, z });

  function cellAt(x, y, z) {
    const level = y > 2 ? 1 : 0;
    return cells.find((c) => c.level === level && x > c.bounds.minX && x < c.bounds.maxX && z > c.bounds.minZ && z < c.bounds.maxZ) ?? null;
  }

  return {
    collision,
    cells,
    cellById: new Map(cells.map((c) => [c.id, c])),
    cellAt,
    seats,
    tables,
    hoop: { rim, net },
    rollcallSpots,
    courtSpots,
    guardPost: { x: 9.6, z: 2.2, ry: Math.PI / 2 },
    throne,
    kitchen,
    gate: { x: 0, z: 12.9 },
    stage: { x: 15.2, z: 1 },
    /** Đóng / mở cửa song sắt của một phòng (phòng biệt giam). */
    setCellLocked(id, on) {
      const c = cells.find((x) => x.id === id);
      if (c) c.doorMesh.visible = !!on;
    },
    freeArea: { minX: -12, maxX: 18, minZ: -8.6, maxZ: 12.6 },
    nav: {
      stairExit: { x: 19.45, z: -8.6 },
      stairBottom: { x: 19.45, z: -11 },
      stairTop: { x: 12.2, z: -11 },
      upperCorner: { x: -15, z: -11 },
    },
    cameraBlockers,
    setNight,
  };
}

/** A flat sign with text on a coloured plate. */
function signMesh(text, w, h, bg, fg) {
  const pxW = Math.round(w * 160);
  const pxH = Math.round(h * 160);
  const tex = canvasTexture(pxW, pxH, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, pxW, pxH);
    ctx.fillStyle = fg;
    let size = pxH * 0.62;
    ctx.font = `800 ${size}px Nunito, sans-serif`;
    while (ctx.measureText(text).width > pxW * 0.92 && size > 8) {
      size -= 2;
      ctx.font = `800 ${size}px Nunito, sans-serif`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, pxW / 2, pxH / 2 + 2);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  return m;
}
