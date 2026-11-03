/**
 * Builds the Creator building: one big hall with 25 live rooms.
 *
 *   North row  (z -38..-22): 5 group stages "G1..G5"  (17 m wide, open door, truss + moving heads, LED wall, live TV)
 *   Island     (x ±21.25):   5 singing rooms "S1..S5" facing north, 5 game rooms "P1..P5" facing south
 *   South row  (z 30..38):   10 standing rooms "N01..N10"
 *   West plaza: lucky wheel + wardrobe.  East plaza: leaderboard.  South corridor: spawn + logo.
 *
 * Static boxes are merged per material; every solid box is also registered in
 * the CollisionWorld. Screens are canvas textures drawn by screens.js.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CollisionWorld, makeBox } from './logic/physics.js';
import { inRect, distToRect } from './logic/rooms.js';

export const HALL = { minX: -42.5, maxX: 42.5, minZ: -38, maxZ: 38, height: 9 };
export const GROUP = { w: 17, back: -38, front: -22, stageFront: -30, stageY: 0.55, wallH: 8 };
export const SMALL = { w: 8.5, wallH: 4.2, glassTop: 3.0 };
export const ISLAND = { minX: -21.25, maxX: 21.25, minZ: -8, maxZ: 8 };
export const SOUTH = { front: 30, back: 38 };

const COLORS = {
  hallFloor: 0x1c1e2d,
  hallWall: 0x2a2d42,
  groupWall: 0x17181f,
  groupFloor: 0x24263a,
  stageTop: 0x0d0e14,
  frame: 0x343852,
  standWall: 0x2c2a38,
  standFloor: 0x463a40,
  singWall: 0x3a3050,
  singFloor: 0x5c4060,
  gameWall: 0x1f2233,
  gameFloor: 0x26283a,
  truss: 0x9aa0ad,
  black: 0x121216,
  desk: 0x2a2c35,
  wood: 0xb98a5e,
  white: 0xf4f4f6,
  ceiling: 0x14151f,
  pot: 0xe9e4dc,
  leaf: 0x3fae5a,
  sofa: 0x7a5cff,
};

/** A canvas + texture pair; screens.js draws on the canvas. */
export function makeScreen(w, h, scale = 1) {
  // scale > 1: canvas nét hơn (bản LIVE quay khung dọc 1080×1920) — screens.js vẫn vẽ theo kích thước logic w×h
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // màn hình vẽ lại liên tục: không tạo mipmap mỗi lần tải lên GPU (đắt), lọc tuyến tính là đủ
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  const ctx = canvas.getContext('2d');
  if (scale !== 1) ctx.scale(scale, scale);
  return { canvas, ctx, tex, w, h };
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
  build(scene, blockers, { staticShadows = true } = {}) {
    for (const g of this.groups.values()) {
      const merged = mergeGeometries(g.list, false);
      const m = new THREE.Mesh(merged, g.material);
      // khối gộp trải cả tòa nhà → đổ bóng thì pass bóng vẽ lại cả tòa mỗi khung; bản LIVE tắt (cfg.staticShadows = false)
      m.castShadow = g.cast && staticShadows;
      m.receiveShadow = g.receive;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      scene.add(m);
      if (g.blocker) blockers.push(m);
      for (const geo of g.list) geo.dispose();
    }
  }
}

function floorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1c1e2d';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#22253a';
  ctx.fillRect(4, 4, 120, 120);
  ctx.fillRect(132, 132, 120, 120);
  ctx.strokeStyle = 'rgba(155,92,255,0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 254, 254);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set((HALL.maxX - HALL.minX) / 4, (HALL.maxZ - HALL.minZ) / 4);
  tex.anisotropy = 8;
  return tex;
}

/** Write `text` along a circle: on the top arc (reads left to right) or the bottom arc. */
function arcText(ctx, text, cx, cy, r, top, spacing = 0) {
  const widths = [...text].map((ch) => ctx.measureText(ch).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0) / r;
  ctx.save();
  ctx.translate(cx, cy);
  let a = top ? -Math.PI / 2 - total / 2 : Math.PI / 2 + total / 2;
  [...text].forEach((ch, i) => {
    const half = widths[i] / 2 / r;
    a += top ? half : -half;
    ctx.save();
    ctx.rotate(top ? a + Math.PI / 2 : a - Math.PI / 2);
    ctx.fillText(ch, 0, top ? -r : r);
    ctx.restore();
    a += top ? half : -half;
  });
  ctx.restore();
}

function logoTexture() {
  const S = 1024;
  const C = S / 2;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const base = () => {
    ctx.clearRect(0, 0, S, S);
    const g = ctx.createRadialGradient(C, C, 80, C, C, C);
    g.addColorStop(0, 'rgba(246,195,168,0.85)');
    g.addColorStop(0.7, 'rgba(230,162,208,0.6)');
    g.addColorStop(1, 'rgba(183,140,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(C, C, C, 0, Math.PI * 2);
    ctx.fill();
    // outer ring, with the lettering curved inside it
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(C, C, 470, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(C, C, 300, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(80,30,90,0.45)';
    ctx.shadowBlur = 10;
    ctx.font = '112px Impact, "Arial Black", sans-serif';
    arcText(ctx, 'CREATOR ONLINE', C, C, 385, true, 6);
    ctx.font = '64px Impact, "Arial Black", sans-serif';
    arcText(ctx, '★ BY HP MEDIA ★', C, C, 385, false, 8);
    ctx.shadowBlur = 0;
  };
  base();
  // the HP Media mark in the middle once the SVG has loaded
  const img = new Image();
  img.onload = () => {
    base();
    ctx.drawImage(img, C - 200, C - 200, 400, 400);
    tex.needsUpdate = true;
  };
  img.src = '/games/creatoronline/assets/logo-mark.svg'; // tuyệt đối: overlay chạy ở /overlay/creatoronline
  return tex;
}

/**
 * Build the whole level.
 * @param {THREE.Scene} scene
 * @param {object} cfg game-config.json
 * @returns world description used by gameplay systems
 */
export function buildWorld(scene, cfg) {
  const hiRes = cfg.screenScale ?? 1; // bản LIVE: 2 → LED, biển phòng, bảng xếp hạng nét gấp đôi
  const collision = new CollisionWorld(4);
  const batch = new StaticBatch();
  const cameraBlockers = [];
  const M = {};
  for (const [k, c] of Object.entries(COLORS)) M[k] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
  M.stageTop.roughness = 0.25;
  M.stageTop.metalness = 0.3;
  M.truss.metalness = 0.6;
  M.truss.roughness = 0.35;
  M.glass = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, depthWrite: false });
  M.lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3dd, emissiveIntensity: 1.2 });
  M.warm = new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffe2b0, emissiveIntensity: 1.1 });
  M.neonPink = new THREE.MeshStandardMaterial({ color: 0xff4fa3, emissive: 0xff4fa3, emissiveIntensity: 1.4 });
  M.neonCyan = new THREE.MeshStandardMaterial({ color: 0x35d0ff, emissive: 0x35d0ff, emissiveIntensity: 1.4 });
  M.foam = new THREE.MeshStandardMaterial({ color: 0x2a2140, roughness: 1 });
  M.screenOff = new THREE.MeshStandardMaterial({ color: 0x0a0b10, roughness: 0.3 });

  /** Add an axis-aligned box in world coordinates. */
  function box(x0, x1, y0, y1, z0, z1, material, opts = {}) {
    const { collide = true, walkable = false, cast = true, receive = true, blocker = false, invisible = false } = opts;
    if (!invisible) {
      const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
      geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      batch.add(geo, material, { cast, receive, blocker });
    }
    if (collide) collision.add(makeBox(Math.min(x0, x1), Math.max(x0, x1), y0, y1, Math.min(z0, z1), Math.max(z0, z1), walkable));
  }

  /** A canvas screen plane. ry: 0 faces +z, PI faces -z, PI/2 faces +x, -PI/2 faces -x. */
  function screenPlane(screen, w, h, x, y, z, ry) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: screen.tex, toneMapped: false }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    scene.add(m);
    return m;
  }

  // ------------------------------------------------------------------ hall shell
  const W = HALL.maxX - HALL.minX;
  const D = HALL.maxZ - HALL.minZ;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.55, metalness: 0.15 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.ceiling);
  ceil.rotation.x = Math.PI / 2; // faces down: invisible from above so the overview camera sees in
  ceil.position.y = HALL.height;
  scene.add(ceil);
  // ceiling light panels over the corridors (face down only, like the ceiling)
  const lightSpots = [];
  for (let x = -38; x <= 38; x += 8) for (const z of [-15, 19]) lightSpots.push([x, z]);
  for (const z of [-4, 4]) for (const x of [-33, 33]) lightSpots.push([x, z]);
  const panels = mergeGeometries(lightSpots.map(([x, z]) => {
    const g = new THREE.PlaneGeometry(3.2, 1.2);
    g.rotateX(Math.PI / 2);
    g.translate(x, HALL.height - 0.05, z);
    return g;
  }));
  scene.add(new THREE.Mesh(panels, M.lamp));

  // outer walls
  const T = 0.3;
  box(HALL.minX - T, HALL.minX, 0, HALL.height, HALL.minZ, HALL.maxZ, M.hallWall, { blocker: true });
  box(HALL.maxX, HALL.maxX + T, 0, HALL.height, HALL.minZ, HALL.maxZ, M.hallWall, { blocker: true });
  box(HALL.minX, HALL.maxX, 0, HALL.height, HALL.minZ - T, HALL.minZ, M.hallWall, { blocker: true });
  box(HALL.minX, HALL.maxX, 0, HALL.height, HALL.maxZ, HALL.maxZ + T, M.hallWall, { blocker: true });

  const logo = new THREE.Mesh(new THREE.CircleGeometry(5.5, 64), new THREE.MeshBasicMaterial({ map: logoTexture(), transparent: true, depthWrite: false }));
  logo.rotation.x = -Math.PI / 2;
  logo.position.set(0, 0.015, 19);
  scene.add(logo);

  /**
   * Front wall with a door gap: low base + glass up to glassTop, solid header above.
   * Door spans [doorA, doorB] on x.
   */
  function frontWall(x0, x1, z, doorA, doorB, height, glassTop, frameMat) {
    for (const [a, b] of [[x0, doorA], [doorB, x1]]) {
      if (b - a < 0.05) continue;
      box(a, b, 0, 0.5, z - 0.1, z + 0.1, frameMat, { collide: false, blocker: true });
      box(a, b, 0.5, glassTop, z - 0.05, z + 0.05, M.glass, { collide: false, cast: false, receive: false, blocker: true });
      collision.add(makeBox(a, b, 0, glassTop, z - 0.12, z + 0.12, false));
      // glass mullions, kept clear of the middle so the streamer is never cut in half
      for (let x = a + 2.4; x < b - 0.3; x += 2.4) {
        if (Math.abs(x - (x0 + x1) / 2) < 1.2) continue;
        box(x - 0.05, x + 0.05, 0.5, glassTop, z - 0.08, z + 0.08, frameMat, { collide: false });
      }
    }
    box(doorA - 0.08, doorA + 0.08, 0, glassTop, z - 0.12, z + 0.12, frameMat);
    box(doorB - 0.08, doorB + 0.08, 0, glassTop, z - 0.12, z + 0.12, frameMat);
    box(x0, x1, glassTop, height, z - 0.12, z + 0.12, frameMat, { blocker: true });
  }

  /** Neon sign above a door, facing `out` (+1 = +z, -1 = -z). */
  function sign(cx, z, out, y, w, h) {
    const scr = makeScreen(512, Math.round((512 * h) / w), hiRes);
    const mesh = screenPlane(scr, w, h, cx, y, z + out * 0.14, out > 0 ? 0 : Math.PI);
    return { ...scr, mesh };
  }

  const rooms = [];
  const byId = new Map();
  const addRoom = (r) => {
    rooms.push(r);
    byId.set(r.id, r);
    return r;
  };

  // ------------------------------------------------------------------ group stages (north row)
  const beamGeo = new THREE.ConeGeometry(1.15, 7.4, 18, 1, true);
  beamGeo.translate(0, -3.7, 0);
  const lensGeo = new THREE.CylinderGeometry(0.2, 0.26, 0.42, 12);
  const poolGeo = new THREE.CircleGeometry(1.25, 28);
  const fixtureMat = new THREE.MeshStandardMaterial({ color: 0x1b1c22, roughness: 0.4, metalness: 0.5 });

  cfg.groupRooms.forEach((def, i) => {
    const x0 = HALL.minX + i * GROUP.w;
    const x1 = x0 + GROUP.w;
    const cx = (x0 + x1) / 2;
    const zb = GROUP.back;
    const zf = GROUP.front;
    const accent = new THREE.Color(def.accent);
    const accentMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.5 });

    // walls between rooms
    box(x0 - 0.12, x0 + 0.12, 0, GROUP.wallH, zb, zf, M.groupWall, { blocker: true });
    if (i === cfg.groupRooms.length - 1) box(x1 - 0.12, x1 + 0.12, 0, GROUP.wallH, zb, zf, M.groupWall, { blocker: true });
    frontWall(x0 + 0.12, x1 - 0.12, zf, cx - 2.5, cx + 2.5, GROUP.wallH, 3.4, M.frame);
    // floor carpet + neon strip at the front header
    box(x0 + 0.12, x1 - 0.12, 0, 0.02, GROUP.stageFront, zf - 0.12, M.groupFloor, { collide: false, cast: false });
    box(x0 + 0.3, x1 - 0.3, 3.45, 3.6, zf + 0.12, zf + 0.2, accentMat, { collide: false, cast: false });

    // stage + step
    const sy = GROUP.stageY;
    box(x0 + 0.12, x1 - 0.12, 0, sy, zb, GROUP.stageFront, M.stageTop, { walkable: true });
    box(x0 + 0.12, x1 - 0.12, 0, 0.28, GROUP.stageFront, GROUP.stageFront + 0.6, M.stageTop, { walkable: true });
    box(x0 + 0.3, x1 - 0.3, sy - 0.12, sy - 0.02, GROUP.stageFront - 0.02, GROUP.stageFront + 0.02, accentMat, { collide: false, cast: false });

    // speakers
    for (const sx of [x0 + 0.6, x1 - 1.9]) {
      box(sx, sx + 1.3, sy, sy + 2.7, -33.2, -31.6, M.black);
      box(sx + 0.15, sx + 1.15, sy + 0.3, sy + 2.4, -31.62, -31.58, M.frame, { collide: false });
    }

    // LED wall
    const led = makeScreen(512, 220, hiRes);
    const ledMesh = screenPlane(led, 13, 5.6, cx, sy + 3.3, zb + 0.32, 0);
    box(cx - 6.8, cx + 6.8, sy + 0.3, sy + 6.3, zb + 0.12, zb + 0.28, M.black, { collide: false });

    // truss
    const tY = 7.3;
    for (const tz of [-30.6, -36.4]) {
      box(x0 + 0.9, x1 - 0.9, tY - 0.14, tY + 0.14, tz - 0.14, tz + 0.14, M.truss, { collide: false });
      for (const tx of [x0 + 0.9, x1 - 0.9]) box(tx - 0.12, tx + 0.12, sy, tY, tz - 0.12, tz + 0.12, M.truss);
    }
    for (const tx of [x0 + 0.9, x1 - 0.9]) box(tx - 0.12, tx + 0.12, tY - 0.12, tY + 0.12, -36.4, -30.6, M.truss, { collide: false });

    // moving heads with beams + light pools
    const themeMats = [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const poolMats = [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    const beams = [];
    const fxs = [-6.2, -3.7, -1.25, 1.25, 3.7, 6.2];
    fxs.forEach((dx, k) => {
      for (const tz of [-30.6, -36.4]) {
        if (tz === -36.4 && k % 2 === 1) continue;
        const pivot = new THREE.Group();
        pivot.position.set(cx + dx, tY - 0.3, tz);
        const lens = new THREE.Mesh(lensGeo, fixtureMat);
        pivot.add(lens);
        const beam = new THREE.Mesh(beamGeo, themeMats[k % 3]);
        beam.renderOrder = 2;
        pivot.add(beam);
        scene.add(pivot);
        beams.push({ pivot, k: k + (tz === -36.4 ? 10 : 0), back: tz === -36.4 });
      }
    });
    const pools = [];
    for (const [px, pz, k] of [[-4.5, -32.4, 0], [-1.5, -32.4, 1], [1.5, -32.4, 2], [4.5, -32.4, 0], [-3, -34.8, 1], [3, -34.8, 2]]) {
      const p = new THREE.Mesh(poolGeo, poolMats[k]);
      p.rotation.x = -Math.PI / 2;
      p.position.set(cx + px, sy + 0.012, pz);
      p.renderOrder = 1;
      scene.add(p);
      pools.push(p);
    }

    // live TV (left wall) + comment board (right wall)
    const tvFallback = makeScreen(384, 216);
    const tvMesh = screenPlane(tvFallback, 6.4, 3.6, x0 + 0.26, 4.0, -26.6, Math.PI / 2);
    box(x0 + 0.12, x0 + 0.22, 2.0, 6.0, -30.2, -23.0, M.black, { collide: false });
    const board = makeScreen(320, 256);
    screenPlane(board, 5.0, 4.0, x1 - 0.26, 4.0, -26.6, -Math.PI / 2);
    box(x1 - 0.22, x1 - 0.12, 1.8, 6.2, -29.3, -23.9, M.black, { collide: false });

    // tech console (audience side, right) facing the stage
    box(cx + 4.4, cx + 6.8, 0, 0.95, -24.7, -23.9, M.desk);
    const mixer = makeScreen(256, 96);
    const mixerMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.75), new THREE.MeshBasicMaterial({ map: mixer.tex, toneMapped: false }));
    mixerMesh.position.set(cx + 5.6, 0.97, -24.3);
    mixerMesh.rotation.x = -Math.PI / 2 + 0.25;
    mixerMesh.rotation.z = Math.PI;
    scene.add(mixerMesh);

    const signScr = sign(cx, zf, 1, 4.6, 9, 1.4);
    const onAir = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.1), new THREE.MeshStandardMaterial({ color: 0xff2d55, emissive: 0xff2d55, emissiveIntensity: 2 }));
    onAir.position.set(cx + 5.4, 4.6, zf + 0.2);
    scene.add(onAir);

    const audienceSpots = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 6; col++) {
        const x = cx - 5.5 + col * 2.05 + (row % 2) * 0.5;
        const z = -28.6 + row * 1.6;
        if (x > cx + 3.8 && z > -25.8) continue; // tech desk
        audienceSpots.push({ x, z, ry: Math.PI });
      }
    }

    addRoom({
      id: def.id,
      type: 'group',
      index: i,
      def,
      rect: { minX: x0 + 0.12, maxX: x1 - 0.12, minZ: zb, maxZ: zf },
      cx,
      cz: -30,
      out: 1,
      frontZ: zf,
      door: { in: { x: cx, z: zf - 1.2 }, out: { x: cx, z: zf + 1.6 } },
      stageY: sy,
      spots: {
        mc: { x: cx - 6.0, z: -30.9, y: sy, ry: 0.35 },
        tech: { x: cx + 5.6, z: -23.3, y: 0, ry: Math.PI },
        manager: { x: x0 + 2.0, z: -23.4, y: 0, ry: Math.PI * 0.8 },
        idols: [
          { x: cx - 1.5, z: -32.4 }, { x: cx + 1.5, z: -32.4 }, { x: cx - 4.5, z: -32.4 },
          { x: cx + 4.5, z: -32.4 }, { x: cx - 3, z: -34.8 }, { x: cx + 3, z: -34.8 },
        ].map((p) => ({ ...p, y: sy, ry: 0 })),
      },
      audienceSpots,
      viewSpots: [],
      screens: { sign: signScr, led, board, tv: tvFallback, mixer },
      tv: { mesh: tvMesh, fallback: tvFallback.tex },
      ledMesh,
      tvCams: [
        { pos: [cx, 3.4, -23.6], look: [cx, 1.9, -33] },
        { pos: [cx + 3.2, 2.1, -29.2], look: [cx - 0.5, 1.6, -33] },
        { pos: [cx - 4, 6.6, -27], look: [cx, 0.6, -33.5] },
      ],
      beams,
      pools,
      themeMats,
      poolMats,
      accentMat,
      onAir,
    });
  });

  // ------------------------------------------------------------------ small rooms
  /**
   * Shared shell for 8.5 m rooms.
   * @param {number} zFront z of the glass front
   * @param {number} zBack z of the back wall
   * @param {number} out +1 if the room opens toward +z, -1 toward -z
   */
  function smallShell(x0, x1, zFront, zBack, out, wallMat, floorMat, firstWall, lastWall) {
    const cx = (x0 + x1) / 2;
    const zMin = Math.min(zFront, zBack);
    const zMax = Math.max(zFront, zBack);
    if (firstWall) box(x0 - 0.12, x0 + 0.12, 0, SMALL.wallH, zMin, zMax, wallMat, { blocker: true });
    if (lastWall) box(x1 - 0.12, x1 + 0.12, 0, SMALL.wallH, zMin, zMax, wallMat, { blocker: true });
    box(x0 + 0.12, x1 - 0.12, 0, 0.02, zMin, zMax, floorMat, { collide: false, cast: false });
    // door on the right as seen from outside
    const doorA = out < 0 ? x0 + 0.6 : x1 - 2.4;
    const doorB = doorA + 1.8;
    frontWall(x0 + 0.12, x1 - 0.12, zFront, doorA, doorB, SMALL.wallH, SMALL.glassTop, M.frame);
    const doorX = (doorA + doorB) / 2;
    const into = -out; // direction from front toward the back wall
    return {
      cx,
      door: { in: { x: doorX, z: zFront + into * 1.2 }, out: { x: doorX, z: zFront + out * 1.5 } },
      rect: { minX: x0 + 0.12, maxX: x1 - 0.12, minZ: zMin, maxZ: zMax },
      viewSpots: [-2.6, -1.0, 0.6].map((dx) => ({ x: cx + (out < 0 ? -dx : dx), z: zFront + out * (2.4 + Math.abs(dx) * 0.15), ry: out > 0 ? Math.PI : 0 })),
      // waiting line right against the glass, starting beside the door: they watch while they wait
      queueSpots: [0, 1, 2, 3, 4, 5].map((k) => ({
        x: doorX + (out < 0 ? 1 : -1) * (1.25 + k * 0.95),
        z: zFront + out * 0.85,
        ry: out > 0 ? Math.PI : 0,
      })),
    };
  }

  /** Light stand with a glowing head. */
  function lightStand(x, z, h, headMat, kind) {
    box(x - 0.03, x + 0.03, 0, h, z - 0.03, z + 0.03, M.black, { collide: false });
    box(x - 0.25, x + 0.25, 0, 0.04, z - 0.25, z + 0.25, M.black, { collide: false });
    if (kind === 'ring') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 10, 36), headMat);
      ring.position.set(x, h + 0.42, z);
      scene.add(ring);
      return ring;
    }
    box(x - 0.42, x + 0.42, h, h + 0.7, z - 0.16, z + 0.16, headMat, { collide: false, cast: false });
    return null;
  }

  /** Desk with a monitor facing direction ry. */
  function pcDesk(x, z, ry, monitorScr, wide = false) {
    const along = Math.abs(Math.sin(ry)) > 0.5; // monitor faces ±x -> desk runs along z
    const hw = wide ? 1.4 : 0.6;
    const hd = 0.4;
    if (along) box(x - hd, x + hd, 0, 0.78, z - hw, z + hw, M.desk);
    else box(x - hw, x + hw, 0, 0.78, z - hd, z + hd, M.desk);
    const mw = wide ? 2.4 : 1.15;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(mw, mw * 0.5), new THREE.MeshBasicMaterial({ map: monitorScr.tex, toneMapped: false }));
    const off = 0.18;
    m.position.set(x - Math.sin(ry) * off * 0, 1.32, z);
    m.rotation.y = ry;
    scene.add(m);
    const back = new THREE.Mesh(new THREE.BoxGeometry(mw + 0.08, mw * 0.5 + 0.08, 0.05), M.black);
    back.position.set(x - Math.sin(ry) * 0.04, 1.32, z - Math.cos(ry) * 0.04);
    back.rotation.y = ry;
    scene.add(back);
    return m;
  }

  const standDefs = [];
  for (let i = 0; i < 10; i++) standDefs.push({ id: `N${String(i + 1).padStart(2, '0')}`, i });

  // South row: standing streamers (front at z=30 facing -z), laid out like the sketch:
  //   back wall  : light bar with 3 heads — the middle one washes the wall in the room's
  //                fixed colour, the two side ones hit the streamer from behind (rim light)
  //   centre     : the streamer, facing the front
  //   front L/R  : two softbox key lights aimed at the streamer
  //   front      : the interactive TV the streamer talks to (double-sided, so fans outside see it too)
  const unitCone = new THREE.ConeGeometry(1, 1, 20, 1, true);
  unitCone.translate(0, -0.5, 0);
  unitCone.rotateX(-Math.PI / 2); // apex at origin, opening toward +z (for lookAt)
  const fixtureGeo = new THREE.CylinderGeometry(0.13, 0.17, 0.3, 12);
  fixtureGeo.rotateX(Math.PI / 2);
  /** A fixture at `from` throwing a soft additive beam onto `to`. */
  function aimedBeam(from, to, radius, material) {
    const g = new THREE.Group();
    g.position.set(from.x, from.y, from.z);
    g.lookAt(to.x, to.y, to.z);
    const len = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    const beam = new THREE.Mesh(unitCone, material);
    beam.scale.set(radius, radius, len);
    beam.renderOrder = 2;
    g.add(new THREE.Mesh(fixtureGeo, fixtureMat), beam);
    scene.add(g);
    return g;
  }
  const rimMat = new THREE.MeshBasicMaterial({ color: 0xfff3e0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const keyMat = new THREE.MeshBasicMaterial({ color: 0xfff8ee, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const softGeo = new THREE.BoxGeometry(0.8, 0.8, 0.22);

  for (const { id, i } of standDefs) {
    const x0 = HALL.minX + i * SMALL.w;
    const x1 = x0 + SMALL.w;
    const shell = smallShell(x0, x1, SOUTH.front, SOUTH.back, -1, M.standWall, M.standFloor, true, i === 9);
    const { cx } = shell;
    const hue = (i / 10) * 360;
    const accent = new THREE.Color(`hsl(${hue}, 85%, 62%)`);
    const accentMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.3 });
    const washMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const npc = { x: cx, y: 0, z: 35.0 };

    // coloured wash painted on the back wall
    const wash = makeScreen(256, 160);
    screenPlane(wash, 7.2, 3.9, cx, 2.0, SOUTH.back - 0.06, Math.PI);

    // overhead bar with 3 heads, hung from the back wall
    const barZ = 36.8;
    box(cx - 2.3, cx + 2.3, 3.66, 3.76, barZ - 0.05, barZ + 0.05, M.black, { collide: false, cast: false });
    for (const dx of [-2.1, 2.1]) box(cx + dx - 0.03, cx + dx + 0.03, 3.72, 3.78, barZ, SOUTH.back, M.black, { collide: false, cast: false });
    aimedBeam({ x: cx, y: 3.5, z: barZ }, { x: cx, y: 1.6, z: SOUTH.back - 0.05 }, 1.6, washMat);
    aimedBeam({ x: cx - 1.7, y: 3.5, z: barZ }, { x: npc.x - 0.25, y: 1.35, z: npc.z + 0.15 }, 0.55, rimMat);
    aimedBeam({ x: cx + 1.7, y: 3.5, z: barZ }, { x: npc.x + 0.25, y: 1.35, z: npc.z + 0.15 }, 0.55, rimMat);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.15, 28), new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(npc.x, 0.025, npc.z);
    scene.add(pool);

    // two front softboxes aimed at the streamer
    for (const sx of [-1, 1]) {
      const lx = cx + sx * 2.55;
      const lz = 32.9;
      box(lx - 0.03, lx + 0.03, 0, 1.75, lz - 0.03, lz + 0.03, M.black, { collide: false });
      box(lx - 0.3, lx + 0.3, 0, 0.04, lz - 0.3, lz + 0.3, M.black, { collide: false });
      const head = new THREE.Mesh(softGeo, M.warm);
      head.position.set(lx, 2.0, lz);
      head.lookAt(npc.x, 1.55, npc.z);
      scene.add(head);
      aimedBeam({ x: lx, y: 2.0, z: lz }, { x: npc.x, y: 1.45, z: npc.z }, 0.6, keyMat);
    }

    // interactive TV at the front, facing the streamer; its back mirrors the screen for fans outside
    // low "confidence monitor" tilted up toward the streamer so it never hides them from the glass
    const monitor = makeScreen(256, 160);
    const tvZ = 31.8;
    const tv = new THREE.Group();
    tv.position.set(cx, 0.66, tvZ);
    tv.rotation.x = -0.22;
    const tvW = 1.5;
    const tvH = 0.84;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(tvW, tvH), new THREE.MeshBasicMaterial({ map: monitor.tex, toneMapped: false }));
    face.position.z = 0.04;
    const rear = face.clone();
    rear.position.z = -0.04;
    rear.rotation.y = Math.PI;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(tvW + 0.08, tvH + 0.08, 0.06), M.black);
    tv.add(frame, face, rear);
    scene.add(tv);
    box(cx - 0.04, cx + 0.04, 0, 0.26, tvZ - 0.04, tvZ + 0.04, M.black, { collide: false });
    box(cx - 0.4, cx + 0.4, 0, 0.05, tvZ - 0.25, tvZ + 0.25, M.black);

    const signScr = sign(cx, SOUTH.front, -1, 3.62, 7.4, 1.0);
    addRoom({
      id,
      type: 'stand',
      index: i,
      rect: shell.rect,
      cx,
      cz: 34,
      out: -1,
      frontZ: SOUTH.front,
      door: shell.door,
      spots: { streamer: { x: npc.x, z: npc.z, y: 0, ry: Math.PI } },
      audienceSpots: [],
      viewSpots: shell.viewSpots,
      queueSpots: shell.queueSpots,
      screens: { sign: signScr, wash, monitor },
      accentMat,
      washColor: `#${accent.getHexString()}`,
    });
  }

  // Island: singing rooms (front z=-8, facing -z) and game rooms (front z=8, facing +z)
  box(ISLAND.minX, ISLAND.maxX, 0, SMALL.wallH, -0.12, 0.12, M.singWall, { blocker: true });
  for (let i = 0; i < 5; i++) {
    const x0 = ISLAND.minX + i * SMALL.w;
    const x1 = x0 + SMALL.w;

    // --- singing room
    {
      const shell = smallShell(x0, x1, ISLAND.minZ, 0, -1, M.singWall, M.singFloor, true, i === 4);
      const { cx } = shell;
      const id = `S${i + 1}`;
      // acoustic foam panels on the side walls
      for (let k = 0; k < 3; k++) {
        const z = -6 + k * 1.8;
        box(x0 + 0.12, x0 + 0.22, 1.0, 3.2, z - 0.7, z + 0.7, M.foam, { collide: false });
        box(x1 - 0.22, x1 - 0.12, 1.0, 3.2, z - 0.7, z + 0.7, M.foam, { collide: false });
      }
      // karaoke TV on the back wall
      const lyrics = makeScreen(384, 216);
      screenPlane(lyrics, 4.4, 2.48, cx, 2.75, -0.2, Math.PI);
      box(cx - 2.3, cx + 2.3, 1.45, 4.05, -0.2, -0.13, M.black, { collide: false });
      // stool
      box(cx - 0.28, cx + 0.28, 0, 0.6, -2.3, -1.74, M.wood);
      // keyboard on a stand + softboxes
      box(cx - 2.9, cx - 1.7, 0.7, 0.82, -3.2, -2.8, M.black, { collide: false });
      box(cx - 2.85, cx - 1.75, 0.82, 0.86, -3.1, -2.85, M.white, { collide: false });
      box(cx - 2.85, cx - 2.75, 0, 0.7, -3.05, -2.95, M.black);
      box(cx - 1.85, cx - 1.75, 0, 0.7, -3.05, -2.95, M.black);
      lightStand(cx - 3.2, -5.2, 1.6, M.warm, 'box');
      lightStand(cx + 1.4, -5.6, 1.2, M.lamp, 'ring');
      const monitor = makeScreen(256, 160);
      pcDesk(x1 - 0.75, -3.0, -Math.PI / 2, monitor);
      const signScr = sign(cx, ISLAND.minZ, -1, 3.62, 7.4, 1.0);
      addRoom({
        id,
        type: 'sing',
        index: i,
        rect: shell.rect,
        cx,
        cz: -4,
        out: -1,
        frontZ: ISLAND.minZ,
        door: shell.door,
        spots: { streamer: { x: cx, z: -2.0, y: 0.2, ry: Math.PI } },
        audienceSpots: [],
        viewSpots: shell.viewSpots,
        queueSpots: shell.queueSpots,
        screens: { sign: signScr, lyrics, monitor },
      });
    }

    // --- game room
    {
      const shell = smallShell(x0, x1, ISLAND.maxZ, 0, 1, M.gameWall, M.gameFloor, true, i === 4);
      const { cx } = shell;
      const id = `P${i + 1}`;
      const rgbMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1.6 });
      for (const sx of [x0 + 0.2, x1 - 0.2]) box(sx - 0.04, sx + 0.04, 3.3, 3.42, 0.3, 7.6, rgbMat, { collide: false, cast: false });
      box(x0 + 0.3, x1 - 0.3, 3.3, 3.42, 0.14, 0.22, rgbMat, { collide: false, cast: false });
      // big stream TV on the back wall shows the game
      const game = makeScreen(384, 216);
      screenPlane(game, 5.2, 2.93, cx, 2.35, 0.2, 0);
      box(cx - 2.7, cx + 2.7, 0.8, 3.9, 0.13, 0.2, M.black, { collide: false });
      // desk + dual monitors facing the gamer (gamer faces the back wall)
      box(cx - 1.4, cx + 1.4, 0, 0.78, 1.2, 1.9, M.desk);
      for (const dx of [-0.65, 0.65]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.65), new THREE.MeshBasicMaterial({ map: game.tex, toneMapped: false }));
        m.position.set(cx + dx, 1.25, 1.55);
        m.rotation.y = dx < 0 ? 0.12 : -0.12;
        scene.add(m);
      }
      // gaming chair: seat + low back in the accent colour
      box(cx - 0.32, cx + 0.32, 0, 0.55, 2.35, 2.95, M.black);
      box(cx - 0.34, cx + 0.34, 0.55, 1.25, 2.95, 3.12, rgbMat, { collide: false });
      // PC tower
      box(cx + 1.6, cx + 2.0, 0, 0.9, 1.3, 1.9, M.black);
      box(cx + 1.6, cx + 1.61, 0.1, 0.8, 1.35, 1.85, rgbMat, { collide: false, cast: false });
      lightStand(x0 + 0.9, 6.3, 1.5, M.lamp, 'ring');
      const signScr = sign(cx, ISLAND.maxZ, 1, 3.62, 7.4, 1.0);
      addRoom({
        id,
        type: 'game',
        index: i,
        rect: shell.rect,
        cx,
        cz: 4,
        out: 1,
        frontZ: ISLAND.maxZ,
        door: shell.door,
        spots: { streamer: { x: cx, z: 2.6, y: 0.15, ry: Math.PI } },
        audienceSpots: [],
        viewSpots: shell.viewSpots,
        queueSpots: shell.queueSpots,
        screens: { sign: signScr, game },
        rgbMat,
      });
    }
  }
  // neon trims along the top of the island
  box(ISLAND.minX, ISLAND.maxX, SMALL.wallH - 0.15, SMALL.wallH, ISLAND.minZ - 0.18, ISLAND.minZ - 0.12, M.neonPink, { collide: false, cast: false });
  box(ISLAND.minX, ISLAND.maxX, SMALL.wallH - 0.15, SMALL.wallH, ISLAND.maxZ + 0.12, ISLAND.maxZ + 0.18, M.neonCyan, { collide: false, cast: false });

  // ------------------------------------------------------------------ plazas
  // Lucky wheel (west wall)
  const wheelScr = makeScreen(512, 512);
  const wheelMesh = new THREE.Mesh(new THREE.CircleGeometry(2.3, 64), new THREE.MeshBasicMaterial({ map: wheelScr.tex, toneMapped: false }));
  wheelMesh.position.set(HALL.minX + 0.45, 3.4, 0);
  wheelMesh.rotation.y = Math.PI / 2;
  scene.add(wheelMesh);
  box(HALL.minX, HALL.minX + 0.35, 0.6, 6.0, -2.8, 2.8, M.frame, { collide: false });
  const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 3), M.neonPink);
  pointer.position.set(HALL.minX + 0.6, 6.0, 0);
  pointer.rotation.z = Math.PI;
  scene.add(pointer);
  box(HALL.minX, HALL.minX + 1.2, 0, 0.9, -1.2, 1.2, M.frame);

  // Wardrobe (west wall, north of the wheel)
  box(HALL.minX, HALL.minX + 0.9, 0, 2.6, -7.6, -4.4, M.desk);
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.2), new THREE.MeshStandardMaterial({ color: 0xcfe9ff, roughness: 0.05, metalness: 0.9 }));
  mirror.position.set(HALL.minX + 0.92, 1.5, -6);
  mirror.rotation.y = Math.PI / 2;
  scene.add(mirror);
  for (let k = 0; k < 6; k++) {
    const c = [0xff6fb5, 0x5b6cff, 0xffd23f, 0x31d0a0, 0xd23c4b, 0xf4f4f4][k];
    box(HALL.minX + 0.95, HALL.minX + 1.25, 1.2, 2.2, -4.2 + k * 0.32, -4.0 + k * 0.32, new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }), { collide: false });
  }
  const wardrobeSign = makeScreen(256, 64);
  screenPlane(wardrobeSign, 3, 0.75, HALL.minX + 0.4, 3.2, -6, Math.PI / 2);

  // Leaderboard (east wall)
  const boardScr = makeScreen(640, 360, hiRes);
  screenPlane(boardScr, 10, 5.6, HALL.maxX - 0.4, 4.0, 0, -Math.PI / 2);
  box(HALL.maxX - 0.35, HALL.maxX, 0.9, 7.1, -5.4, 5.4, M.black, { collide: false });

  // plants in plaza corners
  const potGeo = new THREE.CylinderGeometry(0.42, 0.32, 0.7, 14);
  const leafGeo = new THREE.SphereGeometry(0.75, 14, 10);
  for (const [x, z] of [[-41.4, -20.5], [41.4, -20.5], [-41.4, 28.5], [41.4, 28.5], [-23, -9.5], [23, -9.5], [-23, 9.5], [23, 9.5], [-41.4, 9.5], [41.4, 9.5]]) {
    const pot = new THREE.Mesh(potGeo, M.pot);
    pot.position.set(x, 0.35, z);
    pot.castShadow = true;
    const leaf = new THREE.Mesh(leafGeo, M.leaf);
    leaf.position.set(x, 1.25, z);
    leaf.scale.set(1, 1.2, 1);
    leaf.castShadow = true;
    scene.add(pot, leaf);
    collision.add(makeBox(x - 0.45, x + 0.45, 0, 1.8, z - 0.45, z + 0.45, false));
  }

  // sofas around the logo
  const seats = [];
  for (const [x, z, ry] of [[-8, 19, Math.PI / 2], [8, 19, -Math.PI / 2]]) {
    box(x - 0.6, x + 0.6, 0, 0.45, z - 1.8, z + 1.8, M.sofa, { walkable: true });
    const bx = ry > 0 ? x - 0.6 : x + 0.45;
    box(bx, bx + 0.15, 0.45, 1.05, z - 1.8, z + 1.8, M.sofa);
    for (const dz of [-1.1, 0, 1.1]) seats.push({ x: x + (ry > 0 ? 0.1 : -0.1), z: z + dz, y: 0.45, ry, approach: { x: x + (ry > 0 ? 1.2 : -1.2), z: z + dz } });
  }

  batch.build(scene, cameraBlockers, { staticShadows: cfg.staticShadows !== false });

  // ------------------------------------------------------------------ lights
  const hemi = new THREE.HemisphereLight(0xc8cfff, 0x2a2238, 1.25);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 1.35);
  sun.position.set(10, 30, 12);
  sun.castShadow = true;
  const shadowSize = cfg.shadowMapSize ?? 2048; // bản LIVE ?q=low: 1024
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  scene.background = new THREE.Color(0x0e0f18);
  scene.fog = new THREE.Fog(0x0e0f18, 70, 140);

  const themeColors = (key) => (cfg.lightThemes[key] ?? cfg.lightThemes.neon).colors.map((c) => new THREE.Color(c));

  const world = {
    collision,
    cameraBlockers,
    rooms,
    byId,
    seats,
    wheel: { mesh: wheelMesh, screen: wheelScr, spot: { x: HALL.minX + 2.6, z: 0 }, angle: 0, spinning: null },
    wardrobe: { spot: { x: HALL.minX + 2.4, z: -6 }, screen: wardrobeSign },
    leaderboard: { screen: boardScr, spot: { x: HALL.maxX - 3, z: 0 } },
    spawn: { x: 0, z: 15 },
    /** Room whose walls contain (x, z). */
    roomAt(x, z) {
      for (const r of rooms) if (inRect(r.rect, x, z)) return r;
      return null;
    },
    /** Closest room within maxDist of (x, z) (0 when inside). */
    nearestRoom(x, z, maxDist = 4) {
      let best = null;
      let bd = maxDist;
      for (const r of rooms) {
        const d = distToRect(r.rect, x, z);
        if (d < bd) {
          bd = d;
          best = r;
        }
      }
      return best;
    },
    /** Apply a light theme to a group room. */
    setTheme(room, key) {
      if (room.type !== 'group') return;
      const cols = themeColors(key);
      room.themeCols = cols;
      room.themeMats.forEach((m, k) => m.color.copy(cols[k % cols.length]));
      room.poolMats.forEach((m, k) => m.color.copy(cols[(k + 1) % cols.length]));
      room.accentMat.color.copy(cols[0]);
      room.accentMat.emissive.copy(cols[0]);
    },
    /** Keep the shadow camera centred on the player. */
    followShadow(x, z) {
      sun.position.set(x + 10, 30, z + 12);
      sun.target.position.set(x, 0, z);
    },
    /**
     * Animate lights. beats: Map roomId -> beats elapsed; boost: Map roomId -> 0..1 flash.
     */
    update(dt, t, beats, boost) {
      for (const r of rooms) {
        const beat = beats.get(r.id) ?? t * 2;
        if (r.type === 'group') {
          const b = boost.get(r.id) ?? 0;
          for (const f of r.beams) {
            const s = f.k * 1.37;
            f.pivot.rotation.x = (f.back ? 0.45 : -0.42) + Math.sin(t * 0.7 + s) * 0.38;
            f.pivot.rotation.z = Math.sin(t * 0.55 + s * 1.7) * 0.55;
          }
          const pulse = Math.pow(1 - (beat % 1), 2);
          for (const m of r.themeMats) m.opacity = 0.1 + pulse * 0.08 + b * 0.18;
          for (const m of r.poolMats) m.opacity = 0.22 + pulse * 0.3 + b * 0.3;
          r.onAir.material.emissiveIntensity = 1 + Math.abs(Math.sin(t * 2)) * 1.5;
          if (r.themeCols && r.themeCols.length > 2 && Math.floor(beat / 4) !== r.colorBar) {
            r.colorBar = Math.floor(beat / 4);
            const cols = r.themeCols;
            r.themeMats.forEach((m, k) => m.color.copy(cols[(k + r.colorBar) % cols.length]));
          }
        } else if (r.type === 'game') {
          r.rgbMat.color.setHSL((t * 0.08 + r.index * 0.2) % 1, 0.9, 0.55);
          r.rgbMat.emissive.copy(r.rgbMat.color);
        }
      }
      const w = world.wheel;
      if (w.spinning) {
        const s = w.spinning;
        s.t = Math.min(s.dur, s.t + dt);
        const k = s.t / s.dur;
        const ease = 1 - Math.pow(1 - k, 3);
        w.angle = s.from + (s.to - s.from) * ease;
        if (k >= 1) {
          w.spinning = null;
          s.done?.();
        }
      }
      w.mesh.rotation.z = w.angle;
    },
  };
  for (const r of rooms) if (r.type === 'group') world.setTheme(r, r.def.theme ?? 'neon');
  return world;
}
