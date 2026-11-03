/**
 * 🏢 Creator Online — trang trí cho tòa nhà bớt trống (spec 2026-11-03-creatoronline-design.md §20).
 *
 *   ngoài tòa nhà : thành phố đêm (sàn phố + đường vành đai, ~300 khối nhà cửa sổ sáng, xe chạy, 3 đèn rọi trời)
 *   trên cao      : dây bóng đèn + cờ đuôi nheo 5 màu club, cột đèn LED, 2 dải LED chữ chạy
 *   sàn           : thảm đỏ vào cửa mỗi nhóm + logo club, vũng đèn màu dọc hành lang
 *   đạo cụ        : máy bán nước, quầy trà sữa / bắp rang, ghế chờ, góc check-in chụp ảnh, thùng loa + cuộn dây
 *   sân khấu nhóm : rào chắn + bảng cổ vũ, loa kiểm âm, đèn hắt; biển lightstick ở các ô đám đông còn trống
 *   nhân viên     : bảo vệ cửa nhóm, quay phim, lao công (tự ẩn khi xa camera)
 *
 * Gộp hình theo vật liệu hoặc InstancedMesh, không đổ bóng → ~35 lệnh vẽ ở toàn cảnh. Đạo cụ đứng trên sàn có
 * hộp va chạm (không chắn tuyến đi x ±25,5 / z ±11 của NPC). Dấu vết quà tặng (chỉ bản LIVE) ở gift-decor.js.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeBox } from './logic/physics.js';
import { mulberry32 } from './logic/rng.js';
import { HALL, GROUP, ISLAND } from './world.js';
import { makeActor } from './npc.js';
import { animateCharacter, setProps } from './character.js';

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const _v = new THREE.Vector3();
const FONT = '"Baloo 2", system-ui, sans-serif';

/** Ô lưới đám đông trước sân khấu nhóm — cùng công thức crowdSpots() trong game.js (bản đi dạo không có hàm đó). */
export function crowdGrid(room) {
  const list = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 11; col++) {
      const x = room.cx - 5.8 + col * 1.16 + (row % 2) * 0.4;
      const z = -28.9 + row * 1.2;
      if (x > room.cx + 3.6 && z > -25.9) continue; // bàn kỹ thuật
      if (x < room.cx - 5.6 && z > -24.6) continue; // chỗ quản lý
      list.push({ x, z, ry: Math.PI, occ: null });
    }
  }
  return list;
}

/** Canvas + texture; mips = true cho hình tĩnh nhìn xa (đỡ lấp lánh). */
export function canvasTex(w, h, draw, { mips = false, wrap = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw?.(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (wrap) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (!mips) {
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
  }
  return { canvas, ctx, tex };
}

function boxGeo(x0, x1, y0, y1, z0, z1) {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}
/** Xoay (thứ tự Y → X → Z) rồi dời hình tới (x, y, z). */
function xform(g, x, y, z, ry = 0, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ');
  _m.makeRotationFromEuler(_e).setPosition(x, y, z);
  return g.applyMatrix4(_m);
}
/** UV 0..1 của hình → ô [u0, v0]–[u1, v1] trong atlas. */
function remapUv(g, u0, v0, u1, v1) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return g;
}
/** Mặt phẳng w×h quay mặt theo ry (0 = +z, PI/2 = +x), tâm (x, y, z), UV đổi sang ô atlas nếu có. */
function quad(w, h, x, y, z, ry = 0, rx = 0, cell = null) {
  const g = new THREE.PlaneGeometry(w, h);
  if (cell) remapUv(g, ...cell);
  return xform(g, x, y, z, ry, rx);
}
/** Ô thứ i trong atlas cols × rows (hàng 0 ở trên cùng canvas). */
function atlasCell(i, cols, rows) {
  const c = i % cols;
  const r = Math.floor(i / cols);
  return [c / cols, 1 - (r + 1) / rows, (c + 1) / cols, 1 - r / rows];
}

/** Gom hình theo vật liệu → mỗi vật liệu 1 lệnh vẽ. Không đổ bóng (spec §20). */
class Batch {
  constructor() {
    this.groups = new Map();
  }
  add(geo, mat) {
    let list = this.groups.get(mat);
    if (!list) this.groups.set(mat, (list = []));
    list.push(geo);
    return geo;
  }
  build(scene) {
    const meshes = [];
    for (const [mat, list] of this.groups) {
      const m = new THREE.Mesh(mergeGeometries(list, false), mat);
      m.castShadow = false;
      m.receiveShadow = !mat.isMeshBasicMaterial;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      scene.add(m);
      meshes.push(m);
      for (const g of list) g.dispose();
    }
    this.groups.clear();
    return meshes;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
/** Chữ thu nhỏ cho vừa bề ngang maxW. */
function fitText(ctx, text, x, y, maxW, size, weight = 800) {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (s > 10 && ctx.measureText(text).width > maxW) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
  ctx.fillText(text, x, y);
}

// ================================================================== thành phố đêm quanh tòa nhà
const CITY = 480; // cạnh sàn phố (m)
const ROADS_X = [-150, -90, 90, 150];
const ROADS_Z = [-145, -85, 85, 145];

function drawGround(ctx, px) {
  const X = (v) => (v + CITY / 2) * px;
  const S = (v) => v * px;
  const rect = (x0, z0, x1, z1) => ctx.fillRect(X(x0), X(z0), S(x1 - x0), S(z1 - z0));
  ctx.fillStyle = '#0e1224';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  // vỉa hè các khối phố (sáng hơn nền một chút)
  ctx.fillStyle = '#141a31';
  for (let x = -230; x < 230; x += 20) for (let z = -230; z < 230; z += 20) if ((x * 7 + z * 13) % 3 === 0) rect(x + 1, z + 1, x + 19, z + 19);
  // đường vành đai quanh tòa nhà + vỉa hè sát tường
  ctx.fillStyle = '#1b1f2e';
  rect(-60, -56, 60, 56);
  for (const v of ROADS_X) rect(v - 6, -CITY / 2, v + 6, CITY / 2);
  for (const v of ROADS_Z) rect(-CITY / 2, v - 6, CITY / 2, v + 6);
  ctx.fillStyle = '#2b3048';
  rect(-47, -43, 47, 43);
  // vạch kẻ đường
  ctx.setLineDash([S(3), S(3)]);
  ctx.lineWidth = Math.max(1, S(0.35));
  ctx.strokeStyle = 'rgba(255,214,110,0.6)';
  ctx.strokeRect(X(-53.5), X(-49.5), S(107), S(99));
  ctx.strokeStyle = 'rgba(235,240,255,0.35)';
  ctx.beginPath();
  for (const v of ROADS_X) ctx.moveTo(X(v), 0), ctx.lineTo(X(v), ctx.canvas.height);
  for (const v of ROADS_Z) ctx.moveTo(0, X(v)), ctx.lineTo(ctx.canvas.width, X(v));
  ctx.stroke();
  ctx.setLineDash([]);
  // quầng đèn đường vàng dọc vành đai
  const glow = (x, z, r) => {
    const g = ctx.createRadialGradient(X(x), X(z), 0, X(x), X(z), S(r));
    g.addColorStop(0, 'rgba(255,196,120,0.42)');
    g.addColorStop(1, 'rgba(255,196,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(X(x) - S(r), X(z) - S(r), S(r * 2), S(r * 2));
  };
  for (let x = -56; x <= 56; x += 14) for (const z of [-58, 58]) glow(x, z, 6);
  for (let z = -42; z <= 42; z += 14) for (const x of [-62, 62]) glow(x, z, 6);
  for (const v of ROADS_X) for (let z = -220; z <= 220; z += 26) glow(v + 7, z, 5);
}

function drawFacade(rng) {
  return (ctx) => {
    // 16 m × 12 m: 4 tầng × 8 ô cửa; góc trên-trái 6×6 px là màu mái (shader lấy mẫu ở đó)
    ctx.fillStyle = '#0d1122';
    ctx.fillRect(0, 0, 256, 256);
    for (let f = 0; f < 4; f++) {
      for (let c = 0; c < 8; c++) {
        const r = rng();
        ctx.fillStyle = r < 0.28 ? '#ffd27a' : r < 0.4 ? '#cfe6ff' : r < 0.44 ? '#ff9fd0' : r < 0.47 ? '#8fffe0' : '#1a2140';
        ctx.fillRect(c * 32 + 7, f * 64 + 14, 18, 36);
      }
      ctx.fillStyle = '#070912';
      ctx.fillRect(0, f * 64 + 60, 256, 4);
    }
    ctx.fillStyle = '#232a44';
    ctx.fillRect(0, 0, 6, 6);
  };
}

/** Điểm trên chu vi chữ nhật ±hx × ±hz cách góc Tây Bắc s mét (đi theo chiều kim đồng hồ nhìn từ trên). */
function rectPoint(hx, hz, s, out) {
  const P = 4 * (hx + hz);
  let d = ((s % P) + P) % P;
  if (d < 2 * hx) return out.set(-hx + d, 0, -hz);
  d -= 2 * hx;
  if (d < 2 * hz) return out.set(hx, Math.PI / 2, -hz + d);
  d -= 2 * hz;
  if (d < 2 * hx) return out.set(hx - d, 0, hz);
  d -= 2 * hx;
  return out.set(-hx, Math.PI / 2, hz - d);
}

function buildCity(scene, rng, low) {
  const PX = (low ? 768 : 1024) / CITY;
  const ground = canvasTex(Math.round(CITY * PX), Math.round(CITY * PX), (ctx) => drawGround(ctx, PX), { mips: true });
  ground.tex.anisotropy = 8;
  const gmesh = new THREE.Mesh(new THREE.PlaneGeometry(CITY, CITY), new THREE.MeshBasicMaterial({ map: ground.tex }));
  gmesh.rotation.x = -Math.PI / 2;
  gmesh.position.y = -0.06; // dưới sàn sảnh (y 0)
  gmesh.matrixAutoUpdate = false;
  gmesh.updateMatrix();
  scene.add(gmesh);

  // khối nhà: InstancedMesh hộp 1×1×1; UV cửa sổ tính theo toạ độ thế giới trong shader → ô cửa không méo theo cỡ nhà
  const R = low ? 150 : 200;
  const blocks = [];
  const onRoad = (v, size, roads) => roads.some((r) => Math.abs(v - r) < size / 2 + 7);
  for (let gx = -R; gx <= R; gx += 18) {
    for (let gz = -R; gz <= R; gz += 18) {
      const w = 9 + rng() * 6;
      const d = 9 + rng() * 6;
      const x = gx + (rng() - 0.5) * 3;
      const z = gz + (rng() - 0.5) * 3;
      const dist = Math.hypot(x, z);
      if (dist > R || rng() < 0.1) continue;
      if (Math.abs(x) - w / 2 < 64 && Math.abs(z) - d / 2 < 60) continue; // tòa nhà + đường vành đai
      if (onRoad(x, w, ROADS_X) || onRoad(z, d, ROADS_Z)) continue;
      const tall = rng() < 0.08 ? 1.8 : 1;
      const h = (dist < 95 ? 8 + rng() * 16 : 14 + rng() * 30) * tall;
      blocks.push({ x, z, w, d, h });
    }
  }
  const facade = canvasTex(256, 256, drawFacade(rng), { mips: true, wrap: true });
  const bmat = new THREE.MeshBasicMaterial({ map: facade.tex });
  bmat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      {
        vec4 coWp = modelMatrix * instanceMatrix * vec4( position, 1.0 );
        vec3 coN = abs( normal );
        float coU = coN.x > 0.5 ? coWp.z : coWp.x;
        vMapUv = coN.y > 0.5 ? vec2( 0.01, 0.99 ) : vec2( coU / 16.0 + instanceMatrix[3].x * 0.031, coWp.y / 12.0 );
      }`,
    );
  };
  const bgeo = new THREE.BoxGeometry(1, 1, 1);
  bgeo.translate(0, 0.5, 0);
  const buildings = new THREE.InstancedMesh(bgeo, bmat, blocks.length);
  const towers = [];
  blocks.forEach((b, i) => {
    _m.makeScale(b.w, b.h, b.d).setPosition(b.x, 0, b.z);
    buildings.setMatrixAt(i, _m);
    buildings.setColorAt(i, _c.setHSL(0.58 + rng() * 0.2, 0.3, 0.72 + rng() * 0.28));
    if (b.h > 34) towers.push(b);
  });
  buildings.matrixAutoUpdate = false;
  buildings.computeBoundingSphere();
  scene.add(buildings);

  // đèn báo không đỏ trên nóc nhà cao (nhấp nháy chung)
  const redMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false });
  const reds = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 0), redMat, Math.max(1, towers.length));
  reds.count = towers.length;
  towers.forEach((b, i) => reds.setMatrixAt(i, _m.makeTranslation(b.x, b.h + 0.6, b.z)));
  reds.matrixAutoUpdate = false;
  scene.add(reds);

  // 3 đèn rọi trời quét qua lại (nón mở, mờ dần theo chiều cao bằng màu đỉnh)
  const LEN = 150;
  const cone = new THREE.ConeGeometry(7, LEN, 18, 6, true);
  cone.rotateX(Math.PI);
  cone.translate(0, LEN / 2, 0); // đỉnh nón ở gốc (bóng đèn), loe lên trời
  const cp = cone.attributes.position;
  const col = new Float32Array(cp.count * 3);
  for (let i = 0; i < cp.count; i++) {
    const k = 1 - cp.getY(i) / LEN;
    col.fill(0.02 + k * k * 0.26, i * 3, i * 3 + 3);
  }
  cone.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const sMat = new THREE.MeshBasicMaterial({ color: 0xb8ccff, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
  const SEARCH = [
    { x: -78, z: -84, yaw: 0.6 },
    { x: 84, z: -72, yaw: -0.7 },
    { x: 8, z: -128, yaw: 0 },
  ];
  const search = new THREE.InstancedMesh(cone, sMat, SEARCH.length);
  search.frustumCulled = false;
  search.renderOrder = 3;
  scene.add(search);

  // xe chạy trên vành đai: làn trong vàng (đèn pha), làn ngoài đỏ (đèn hậu)
  const nCars = low ? 14 : 28;
  const carGeo = new THREE.BoxGeometry(3.4, 0.6, 1.3);
  carGeo.translate(0, 0.4, 0);
  const cars = new THREE.InstancedMesh(carGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), nCars);
  cars.frustumCulled = false;
  const lanes = [
    { hx: 50.5, hz: 46.5, dir: 1, color: 0xfff0c8 },
    { hx: 56, hz: 52, dir: -1, color: 0xff4040 },
  ];
  const carData = [];
  for (let i = 0; i < nCars; i++) {
    const lane = lanes[i % 2];
    carData.push({ lane, s: rng() * 4 * (lane.hx + lane.hz), v: 8 + rng() * 5 });
    cars.setColorAt(i, _c.set(lane.color).multiplyScalar(0.75 + rng() * 0.25));
  }
  scene.add(cars);
  const cpt = new THREE.Vector3();

  return {
    update(dt, t) {
      for (let i = 0; i < SEARCH.length; i++) {
        const s = SEARCH[i];
        _e.set(0.34 + Math.sin(t * 0.37 + i * 2.1) * 0.14, s.yaw + Math.sin(t * 0.23 + i * 1.7) * 1.1, 0, 'YXZ');
        _m.makeRotationFromEuler(_e).setPosition(s.x, 0, s.z);
        search.setMatrixAt(i, _m);
      }
      search.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < nCars; i++) {
        const c = carData[i];
        c.s += c.v * dt * c.lane.dir;
        rectPoint(c.lane.hx, c.lane.hz, c.s, cpt);
        _m.makeRotationY(cpt.y).setPosition(cpt.x, 0, cpt.z);
        cars.setMatrixAt(i, _m);
      }
      cars.instanceMatrix.needsUpdate = true;
      redMat.color.setScalar(Math.sin(t * 2.4) > 0.2 ? 1 : 0.15).multiply(_c.set(0xff2a2a));
    },
  };
}

// ================================================================== dây bóng đèn + cờ đuôi nheo + cột đèn
/** Điểm trên dây võng (parabol) từ a tới b, cách nhau ~step mét. */
function strandPoints(a, b, sag, step) {
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const n = Math.max(2, Math.round(len / step));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    pts.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k - sag * 4 * k * (1 - k), z: a.z + (b.z - a.z) * k });
  }
  return pts;
}

const POST_TOP = 4.55;
const SOUTH_POST_Z = 25.2;
const SOUTH_POSTS = [-34, -25.5, -17, -8.5, 0, 8.5, 17, 25.5, 34];
const NORTH_POSTS = [-38.5, -29.5, 29.5, 38.5];
const NORTH_POST_Z = -9.6;

function strandDefs() {
  const W = (x) => ({ x, y: 7.9, z: GROUP.front + 0.16 }); // đỉnh tường trước dãy phòng nhóm
  const NI = (x) => ({ x, y: 4.32, z: ISLAND.minZ - 0.2 }); // mép trên đảo giữa (phía Bắc)
  const SI = (x) => ({ x, y: 4.32, z: ISLAND.maxZ + 0.2 }); // mép trên đảo giữa (phía Nam)
  const NP = (x) => ({ x, y: POST_TOP, z: NORTH_POST_Z });
  const SP = (x) => ({ x, y: POST_TOP, z: SOUTH_POST_Z });
  const defs = [];
  const chain = (pts, sag) => {
    for (let i = 0; i + 1 < pts.length; i++) defs.push([pts[i], pts[i + 1], sag]);
  };
  // hành lang Bắc: dây zigzag giữa tường phòng nhóm và đảo giữa
  chain([W(-20.5), NI(-15.4), W(-10.25), NI(-5.1), W(0), NI(5.1), W(10.25), NI(15.4), W(20.5)], 1.2);
  for (const s of [-1, 1]) {
    chain([W(s * 24.5), NP(s * 29.5), W(s * 34), NP(s * 38.5), W(s * 41.6)], 1.0);
    defs.push([NP(s * 29.5), NI(s * 21.4), 0.5]);
  }
  // hành lang Nam: dây nối các cột đèn + tán đèn zigzag trên sảnh (cột ↔ đảo giữa)
  chain([{ x: -42.35, y: 5.4, z: SOUTH_POST_Z }, ...SOUTH_POSTS.map(SP), { x: 42.35, y: 5.4, z: SOUTH_POST_Z }], 0.45);
  chain([SP(-17), SI(-12.75), SP(-8.5), SI(-4.25), SP(0), SI(4.25), SP(8.5), SI(12.75), SP(17)], 1.2);
  return defs;
}

function buildStrands(scene, wires, clubColors, low) {
  const step = low ? 1.15 : 0.8;
  const bulbs = [];
  const flags = [];
  const warm = new THREE.Color(0xffd9a0);
  const palette = clubColors.map((c) => new THREE.Color(c));
  let fk = 0;
  for (const [a, b, sag] of strandDefs()) {
    const pts = strandPoints(a, b, sag, step);
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      wires.push(p.x, p.y, p.z, q.x, q.y, q.z);
      if (i > 0) bulbs.push({ p, base: (bulbs.length % 3 === 1 ? palette[bulbs.length % palette.length] : warm).clone() });
      if (i % 2 === 0) {
        const dx = q.x - p.x;
        const dz = q.z - p.z;
        flags.push({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: (p.z + q.z) / 2, yaw: Math.atan2(-dz, dx), slope: Math.atan2(q.y - p.y, Math.hypot(dx, dz)), color: palette[fk++ % palette.length] });
      }
    }
  }
  const bulbMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.13, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), bulbs.length);
  bulbs.forEach((b, i) => {
    bulbMesh.setMatrixAt(i, _m.makeTranslation(b.p.x, b.p.y - 0.06, b.p.z));
    bulbMesh.setColorAt(i, b.base);
  });
  bulbMesh.matrixAutoUpdate = false;
  bulbMesh.computeBoundingSphere();
  scene.add(bulbMesh);

  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.24, 0, 0, 0.24, 0, 0, 0, -0.55, 0], 3));
  const flagMesh = new THREE.InstancedMesh(tri, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), flags.length);
  flags.forEach((f, i) => {
    _e.set(0, f.yaw, f.slope, 'YZX');
    flagMesh.setMatrixAt(i, _m.makeRotationFromEuler(_e).setPosition(f.x, f.y - 0.02, f.z));
    flagMesh.setColorAt(i, _c.copy(f.color).multiplyScalar(0.85));
  });
  flagMesh.matrixAutoUpdate = false;
  flagMesh.computeBoundingSphere();
  scene.add(flagMesh);

  let acc = 0;
  return {
    count: bulbs.length,
    update(dt, t) {
      // đèn chạy đuổi ~15 lần/giây (chỉ đổi màu instance, không dựng lại hình)
      acc += dt;
      if (acc < 1 / 15) return;
      acc = 0;
      for (let i = 0; i < bulbs.length; i++) {
        const k = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * 3 - i * 0.55));
        bulbMesh.setColorAt(i, _c.copy(bulbs[i].base).multiplyScalar(k));
      }
      bulbMesh.instanceColor.needsUpdate = true;
    },
  };
}

// ================================================================== dải LED chữ chạy (trượt texture.offset, chỉ vẽ lại khi đổi chữ)
const TICKER_H = 64; // px trên 1 m chiều cao dải
function buildTickers(scene, batch, M, wires) {
  const PANELS = [
    { x: 0, y: 6.5, z: -15.2, w: 24, h: 1.0, tilt: -0.34 }, // ngửa lên cho camera toàn cảnh đọc được
    // sảnh: treo giữa (trên logo) — đặt sát dãy phòng Nam / đảo giữa thì che cảnh lát cắt của phòng đơn
    // gần đứng: camera lát cắt phòng đơn ở phía Bắc nhìn từ sau lưng thì mặt sau bị bỏ (không thấy chữ ngược)
    { x: 0, y: 7.2, z: 19, w: 24, h: 1.0, tilt: -0.15 },
  ];
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const geos = PANELS.map((p) => quad(p.w, p.h, p.x, p.y, p.z, 0, p.tilt));
  const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
  geos.forEach((g) => g.dispose());
  mesh.renderOrder = 1;
  scene.add(mesh);
  for (const p of PANELS) {
    // vỏ đen phía sau + 2 dây treo lên trần
    batch.add(xform(new THREE.BoxGeometry(p.w + 0.3, p.h + 0.24, 0.14), p.x, p.y, p.z - 0.09, 0, p.tilt), M.black);
    for (const sx of [-1, 1]) wires.push(p.x + sx * (p.w / 2 - 0.5), p.y + 0.55, p.z - 0.2, p.x + sx * (p.w / 2 - 0.5), HALL.height, p.z - 0.2);
  }
  const panelPx = PANELS[0].w * TICKER_H;
  let tex = null;
  let lines = ['★ CREATOR ONLINE ★'];
  let gifts = [];
  let pendingAt = 0;
  let lastDraw = -1e9;
  const draw = () => {
    const items = [...gifts, ...lines];
    const sep = '      ✦      ';
    const font = `800 ${Math.round(TICKER_H * 0.68)}px ${FONT}`;
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = font;
    let text = items.join(sep) + sep;
    while (probe.measureText(text).width > 4000 && items.length > 1) {
      items.pop();
      text = items.join(sep) + sep;
    }
    const w = Math.max(256, Math.ceil(probe.measureText(text).width));
    const t = canvasTex(w, TICKER_H, (ctx) => {
      ctx.fillStyle = '#07070d';
      ctx.fillRect(0, 0, w, TICKER_H);
      // lưới điểm LED mờ
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (let x = 2; x < w; x += 6) for (let y = 2; y < TICKER_H; y += 6) ctx.fillRect(x, y, 2, 2);
      ctx.font = font;
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ff4fa3';
      ctx.shadowBlur = 10;
      let x = 0;
      items.forEach((it, i) => {
        ctx.fillStyle = i < gifts.length ? '#ffd23f' : '#ffffff';
        ctx.fillText(it, x, TICKER_H / 2 + 2);
        x += ctx.measureText(it).width;
        ctx.fillStyle = '#ff4fa3';
        ctx.fillText(sep, x, TICKER_H / 2 + 2);
        x += ctx.measureText(sep).width;
      });
    });
    t.tex.wrapS = THREE.RepeatWrapping;
    t.tex.repeat.set(panelPx / w, 1);
    if (tex) t.tex.offset.x = tex.offset.x;
    tex?.dispose();
    tex = t.tex;
    mat.map = tex;
    mat.needsUpdate = true;
  };
  draw();
  const now = () => performance.now();
  const request = () => {
    pendingAt = pendingAt || now();
  };
  return {
    setLines(list) {
      // gọi được mỗi khung HUD: chỉ vẽ lại khi chữ thật sự đổi
      if (!list?.length || list.join('\n') === lines.join('\n')) return;
      lines = list.map(String);
      request();
    },
    push(line) {
      gifts.unshift(String(line));
      gifts = gifts.slice(0, 4);
      request();
    },
    clearGifts() {
      gifts = [];
      request();
    },
    update(dt) {
      if (tex) tex.offset.x = (tex.offset.x + (dt * 150) / tex.image.width) % 1;
      // vẽ lại tối đa 1 lần / 2,5 giây (quà dồn dập)
      if (pendingAt && now() - lastDraw > 2500) {
        pendingAt = 0;
        lastDraw = now();
        draw();
      }
    },
  };
}

// ================================================================== sàn: thảm đỏ + logo club + vũng đèn màu
function buildFloor(scene, groups) {
  const carpetTex = canvasTex(128, 512, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, '#7c0f24');
    g.addColorStop(0.5, '#b3193a');
    g.addColorStop(1, '#7c0f24');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 512);
    ctx.fillStyle = '#e8b64c';
    ctx.fillRect(6, 0, 5, 512);
    ctx.fillRect(117, 0, 5, 512);
    ctx.fillStyle = 'rgba(255,214,140,0.16)';
    for (let y = 16; y < 512; y += 40) {
      ctx.beginPath();
      ctx.moveTo(64, y);
      ctx.lineTo(76, y + 12);
      ctx.lineTo(64, y + 24);
      ctx.lineTo(52, y + 12);
      ctx.fill();
    }
  }, { mips: true });
  const cz0 = GROUP.front + 0.13;
  const cz1 = -15.6;
  const carpetGeos = groups.map((r) => xform(new THREE.PlaneGeometry(3.2, cz1 - cz0), r.cx, 0.012, (cz0 + cz1) / 2, 0, -Math.PI / 2));
  const carpets = new THREE.Mesh(mergeGeometries(carpetGeos), new THREE.MeshStandardMaterial({ map: carpetTex.tex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 }));
  carpets.receiveShadow = true;
  scene.add(carpets);

  const logo = canvasTex(256 * groups.length, 256, (ctx) => {
    groups.forEach((r, i) => {
      const cx = i * 256 + 128;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = r.def.accent;
      ctx.beginPath();
      ctx.arc(cx, 128, 120, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, 128, 104, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 8;
      ctx.font = `800 118px ${FONT}`;
      ctx.fillText(String(i + 1), cx, 112);
      fitText(ctx, r.def.name, cx, 188, 170, 30);
      ctx.shadowBlur = 0;
    });
  }, { mips: true });
  const logoGeos = groups.map((r, i) => {
    const g = new THREE.CircleGeometry(1.35, 40);
    remapUv(g, i / groups.length, 0, (i + 1) / groups.length, 1);
    return xform(g, r.cx, 0.016, -14.15, 0, -Math.PI / 2);
  });
  const logos = new THREE.Mesh(mergeGeometries(logoGeos), new THREE.MeshBasicMaterial({ map: logo.tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  logos.renderOrder = 1;
  scene.add(logos);

  // vũng đèn màu (cộng sáng) dọc các hành lang, đổi màu chậm giữa các màu club
  const spots = [
    [-38.5, -15], [-25.5, -17.5], [-8.5, -17.5], [8.5, -17.5], [25.5, -17.5], [38.5, -15],
    [-31, -3.5], [-31, 3.5], [31, -3.5], [31, 3.5],
    [-34, 21.5], [-25.5, 21.5], [-17, 21.5], [17, 21.5], [25.5, 21.5], [34, 21.5],
    [-29.75, 12.5], [29.75, 12.5],
  ];
  const pools = new THREE.InstancedMesh(
    new THREE.CircleGeometry(1.6, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    spots.length,
  );
  const cols = groups.map((r) => new THREE.Color(r.def.accent));
  spots.forEach(([x, z], i) => {
    pools.setMatrixAt(i, _m.makeTranslation(x, 0.02, z));
    pools.setColorAt(i, cols[i % cols.length]);
  });
  pools.matrixAutoUpdate = false;
  pools.computeBoundingSphere();
  pools.renderOrder = 1;
  scene.add(pools);
  let acc = 0;
  return {
    update(dt, t) {
      acc += dt;
      if (acc < 0.1) return;
      acc = 0;
      for (let i = 0; i < spots.length; i++) {
        const k = 0.5 + 0.5 * Math.sin(t * 0.35 + i * 1.3);
        pools.setColorAt(i, _c.copy(cols[i % cols.length]).lerp(cols[(i + 2) % cols.length], k).multiplyScalar(0.7 + 0.3 * Math.sin(t * 1.1 + i)));
      }
      pools.instanceColor.needsUpdate = true;
    },
  };
}

// ================================================================== đạo cụ (gộp theo vật liệu, có hộp va chạm)
function vendingTex() {
  return canvasTex(384, 256, (ctx) => {
    const themes = [
      ['#ff4fa3', '#ffd1e6', 'TRÀ SỮA'],
      ['#35b8ff', '#d4f1ff', 'NƯỚC SUỐI'],
      ['#ff5a3c', '#ffe0d6', 'COLA'],
    ];
    themes.forEach(([c, light, name], i) => {
      const x0 = i * 128;
      ctx.fillStyle = c;
      ctx.fillRect(x0, 0, 128, 256);
      ctx.fillStyle = '#10131f';
      ctx.fillRect(x0 + 10, 40, 80, 150);
      for (let r = 0; r < 4; r++) {
        for (let k = 0; k < 4; k++) {
          ctx.fillStyle = [light, '#ffffff', c, '#ffe27a'][(r + k) % 4];
          roundRect(ctx, x0 + 15 + k * 19, 50 + r * 36, 13, 26, 4);
          ctx.fill();
        }
      }
      ctx.fillStyle = '#e6e9f2';
      ctx.fillRect(x0 + 96, 60, 24, 60);
      ctx.fillStyle = '#10131f';
      ctx.fillRect(x0 + 18, 205, 64, 28);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      fitText(ctx, name, x0 + 64, 26, 116, 26);
    });
  }, { mips: true });
}

function kioskTex() {
  return canvasTex(512, 256, (ctx) => {
    ctx.fillStyle = '#2b1a2f';
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#ff6fb5';
    ctx.fillRect(0, 0, 512, 66);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(ctx, '🧋 TRÀ SỮA · 🍿 BẮP RANG', 256, 36, 480, 40);
    const menu = [['Trà sữa trân châu', '25K'], ['Trà đào cam sả', '30K'], ['Bắp rang bơ', '20K'], ['Combo LIVE 🎤', '45K']];
    ctx.textAlign = 'left';
    menu.forEach(([n, p], i) => {
      ctx.fillStyle = '#ffe9f3';
      fitText(ctx, n, 28, 98 + i * 40, 340, 28, 700);
      ctx.fillStyle = '#ffd23f';
      ctx.textAlign = 'right';
      fitText(ctx, p, 484, 98 + i * 40, 100, 28);
      ctx.textAlign = 'left';
    });
  }, { mips: true });
}

function awningTex() {
  const t = canvasTex(256, 64, (ctx) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#ffffff' : '#ff4fa3';
      ctx.fillRect(i * 32, 0, 32, 64);
    }
  }, { mips: true });
  return t;
}

function boothTex(onReady) {
  const t = canvasTex(512, 384, null, { mips: true });
  const draw = (img) => {
    const ctx = t.ctx;
    const g = ctx.createLinearGradient(0, 0, 512, 384);
    g.addColorStop(0, '#2a1050');
    g.addColorStop(0.55, '#7a2a8c');
    g.addColorStop(1, '#ff6fb5');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 384);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    for (let i = 0; i < 40; i++) {
      const x = (i * 97) % 512;
      const y = (i * 53) % 384;
      ctx.beginPath();
      ctx.arc(x, y, 3 + (i % 4), 0, Math.PI * 2);
      ctx.fill();
    }
    if (img) ctx.drawImage(img, 196, 52, 120, 120);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 10;
    fitText(ctx, 'CREATOR ONLINE', 256, 214, 470, 64);
    fitText(ctx, '📸 CHECK-IN · LIVE CÙNG IDOL', 256, 280, 460, 30, 700);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, 484, 356);
    t.tex.needsUpdate = true;
    onReady?.();
  };
  draw(null);
  const img = new Image();
  img.onload = () => draw(img);
  img.src = '/games/creatoronline/assets/logo-mark.svg';
  return t;
}

/** Atlas bảng cổ vũ: 4 bảng / nhóm. */
function cheerTex(groups) {
  const COLS = 4;
  const rows = groups.length;
  return canvasTex(256 * COLS, 112 * rows, (ctx) => {
    groups.forEach((r, gi) => {
      const texts = [`${r.def.name}`, 'FIGHTING!', `♥ ${gi + 1} ♥`, 'SARANGHAE'];
      texts.forEach((txt, k) => {
        const x = k * 256;
        const y = gi * 112;
        ctx.fillStyle = k % 2 ? '#ffffff' : r.def.accent;
        roundRect(ctx, x + 6, y + 6, 244, 100, 16);
        ctx.fill();
        ctx.fillStyle = k % 2 ? r.def.accent : '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        fitText(ctx, txt, x + 128, y + 58, 220, 48);
      });
    });
  }, { mips: true });
}

function buildProps(scene, world, batch, M, groups, low) {
  const col = world.collision;
  const solid = (x0, x1, y0, y1, z0, z1) => col.add(makeBox(Math.min(x0, x1), Math.max(x0, x1), y0, y1, Math.min(z0, z1), Math.max(z0, z1), false));

  // --- 3 máy bán nước tựa tường Đông của đảo giữa (quầy hướng ra quảng trường Đông)
  const vend = vendingTex();
  const vendMat = new THREE.MeshBasicMaterial({ map: vend.tex, toneMapped: false });
  const vx0 = ISLAND.maxX + 0.13;
  [-5.4, -4.15, -2.9].forEach((z, i) => {
    batch.add(boxGeo(vx0, vx0 + 0.85, 0, 2.05, z - 0.58, z + 0.58), M.white);
    batch.add(quad(1.0, 1.9, vx0 + 0.86, 1.0, z, Math.PI / 2, 0, [i / 3, 0, (i + 1) / 3, 1]), vendMat);
    batch.add(boxGeo(vx0 + 0.6, vx0 + 0.88, 2.05, 2.12, z - 0.58, z + 0.58), M.lamp);
  });
  solid(ISLAND.maxX, vx0 + 0.9, 0, 2.1, -6.0, -2.3);

  // --- quầy trà sữa / bắp rang sát tường Tây (nam vòng quay)
  {
    const x0 = HALL.minX;
    const z0 = 4.1;
    const z1 = 7.1;
    const menu = kioskTex();
    const menuMat = new THREE.MeshBasicMaterial({ map: menu.tex, toneMapped: false });
    batch.add(quad(2.9, 1.45, x0 + 0.06, 2.05, (z0 + z1) / 2, Math.PI / 2), menuMat);
    batch.add(boxGeo(x0 + 1.25, x0 + 1.9, 0, 1.02, z0 + 0.1, z1 - 0.1), M.pinkBody);
    batch.add(boxGeo(x0 + 1.18, x0 + 1.98, 1.02, 1.08, z0 + 0.05, z1 - 0.05), M.wood);
    // vách hai bên chỉ sâu tới quầy (không che menu khi nhìn chéo)
    for (const z of [z0, z1]) batch.add(boxGeo(x0, x0 + 1.15, 0, 2.75, z - 0.06, z + 0.06), M.white);
    const aw = awningTex();
    const awMat = new THREE.MeshStandardMaterial({ map: aw.tex, roughness: 0.8, side: THREE.DoubleSide });
    batch.add(xform(new THREE.PlaneGeometry(3.2, 2.2), x0 + 1.05, 2.95, (z0 + z1) / 2, Math.PI / 2, -Math.PI / 2 + 0.28), awMat);
    // máy bắp rang (hộp kính vàng) + ly trà sữa trên quầy
    batch.add(boxGeo(x0 + 1.3, x0 + 1.8, 1.08, 1.62, z1 - 0.75, z1 - 0.25), M.glowYellow);
    for (let k = 0; k < 4; k++) batch.add(xform(new THREE.CylinderGeometry(0.06, 0.045, 0.18, 8), x0 + 1.55, 1.17, z0 + 0.45 + k * 0.28), k % 2 ? M.white : M.pinkBody);
    solid(x0, x0 + 2.0, 0, 2.8, z0 - 0.06, z1 + 0.06);
  }

  // --- ghế chờ ở 4 góc hành lang Nam (tựa tường Đông / Tây)
  for (const s of [-1, 1]) {
    for (const [za, zb] of [[12.5, 15.5], [21.5, 24.5]]) {
      const xw = s * HALL.maxX;
      const xi = xw - s * 0.85;
      const xb = xw - s * 0.2;
      batch.add(boxGeo(xi, xb, 0.42, 0.5, za, zb), M.wood);
      batch.add(boxGeo(xb, xb - s * 0.08, 0.5, 1.02, za, zb), M.wood);
      for (const z of [za + 0.25, zb - 0.25]) batch.add(boxGeo(xi + s * 0.05, xb, 0, 0.42, z - 0.04, z + 0.04), M.metal);
      solid(xi, xw, 0, 1.05, za, zb);
    }
  }

  // --- cột đèn LED: dọc hành lang Nam (giữ dây đèn) + 4 cột quảng trường phía Bắc
  const posts = [...SOUTH_POSTS.map((x) => [x, SOUTH_POST_Z]), ...NORTH_POSTS.map((x) => [x, NORTH_POST_Z])];
  for (const [x, z] of posts) {
    batch.add(xform(new THREE.CylinderGeometry(0.26, 0.3, 0.12, 12), x, 0.06, z), M.metal);
    batch.add(xform(new THREE.CylinderGeometry(0.06, 0.08, POST_TOP, 8), x, POST_TOP / 2, z), M.metal);
    batch.add(xform(new THREE.SphereGeometry(0.22, 12, 8), x, POST_TOP + 0.15, z), M.lamp);
    batch.add(xform(new THREE.TorusGeometry(0.2, 0.03, 6, 18), x, 2.6, z, 0, Math.PI / 2), M.glowPink);
    solid(x - 0.16, x + 0.16, 0, POST_TOP, z - 0.16, z + 0.16);
  }

  // --- góc check-in chụp ảnh (phía Đông hành lang Nam)
  {
    const bx = 38.6;
    const z0 = 18.2;
    const z1 = 21.8;
    const tex = boothTex();
    batch.add(quad(3.4, 2.55, bx - 0.06, 1.42, (z0 + z1) / 2, -Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex.tex, toneMapped: false }));
    batch.add(boxGeo(bx - 0.02, bx + 0.12, 0, 2.8, z0, z1), M.black);
    for (const z of [z0 - 0.08, z1 + 0.08]) batch.add(boxGeo(bx - 0.1, bx + 0.12, 0, 2.95, z - 0.08, z + 0.08), M.glowPink);
    batch.add(boxGeo(bx - 0.1, bx + 0.12, 2.8, 2.95, z0 - 0.16, z1 + 0.16), M.glowPink);
    batch.add(xform(new THREE.PlaneGeometry(2.4, 3.2), bx - 1.3, 0.013, (z0 + z1) / 2, 0, -Math.PI / 2), M.matPink);
    // đèn vòng trên chân đứng, quay vào phông
    batch.add(xform(new THREE.CylinderGeometry(0.03, 0.03, 1.7, 6), bx - 3.0, 0.85, z1 - 0.2), M.metal);
    batch.add(xform(new THREE.TorusGeometry(0.36, 0.04, 8, 28), bx - 3.0, 2.05, z1 - 0.2, Math.PI / 2), M.lamp);
    solid(bx - 0.12, bx + 0.14, 0, 2.95, z0 - 0.16, z1 + 0.16);
    solid(bx - 3.12, bx - 2.88, 0, 1.8, z1 - 0.32, z1 - 0.08);
  }

  // --- sân khấu nhóm: rào chắn 2 cánh (chừa lối giữa), bảng cổ vũ, loa kiểm âm, đèn hắt; thùng loa ở 2 góc cửa
  const cheer = cheerTex(groups);
  const cheerMat = new THREE.MeshBasicMaterial({ map: cheer.tex, color: 0xe8e8e8 });
  const fixtureGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.26, 10);
  const upCone = new THREE.ConeGeometry(0.85, 5.6, 14, 1, true);
  upCone.rotateX(Math.PI);
  upCone.translate(0, 2.8, 0);
  const BZ = -29.32; // giữa mép bậc sân khấu (-29.4) và hàng đám đông đầu (-28.9)
  groups.forEach((r, gi) => {
    const { cx } = r;
    const x0 = cx - GROUP.w / 2;
    const x1 = cx + GROUP.w / 2;
    const sy = GROUP.stageY;
    let board = 0;
    for (const [a, b] of [[cx - 5.4, cx - 1.3], [cx + 1.3, cx + 5.4]]) {
      batch.add(boxGeo(a, b, 1.02, 1.1, BZ - 0.04, BZ + 0.04), M.silver);
      batch.add(boxGeo(a, b, 0.1, 0.16, BZ - 0.03, BZ + 0.03), M.silver);
      for (let x = a; x <= b + 1e-3; x += (b - a) / 14) batch.add(boxGeo(x - 0.018, x + 0.018, 0.1, 1.04, BZ - 0.018, BZ + 0.018), M.silver);
      for (const x of [a, b]) batch.add(boxGeo(x - 0.05, x + 0.05, 0, 0.04, BZ - 0.32, BZ + 0.32), M.metal);
      for (const k of [0.27, 0.73]) {
        const x = a + (b - a) * k;
        batch.add(quad(1.15, 0.5, x, 0.62, BZ + 0.05, 0, 0, atlasCell(gi * 4 + board++, 4, groups.length)), cheerMat);
      }
    }
    // loa kiểm âm nghiêng về phía người biểu diễn
    for (const dx of [-2.2, 2.2]) batch.add(xform(new THREE.BoxGeometry(0.9, 0.34, 0.5), cx + dx, sy + 0.2, -30.32, 0, 0.42), M.black);
    // đèn hắt: 2 ở góc trước sân khấu (soi cột giàn), 2 hai bên màn LED (soi tường)
    const ups = [[x0 + 0.55, -30.25], [x1 - 0.55, -30.25], [cx - 7.25, GROUP.back + 0.7], [cx + 7.25, GROUP.back + 0.7]];
    const cones = ups.map(([x, z]) => {
      batch.add(xform(fixtureGeo.clone(), x, sy + 0.13, z), M.metal);
      return upCone.clone().translate(x, sy + 0.2, z);
    });
    const um = new THREE.Mesh(mergeGeometries(cones), r.themeMats[1]);
    cones.forEach((g) => g.dispose());
    um.renderOrder = 2;
    scene.add(um);
    // thùng loa (flight case) + cuộn dây ở 2 góc trong cửa phòng
    const zf = GROUP.front - 0.14;
    for (const [a, b] of [[x0 + 0.3, x0 + 1.35], [x1 - 1.35, x1 - 0.3]]) {
      batch.add(boxGeo(a, b, 0, 0.62, zf - 0.75, zf), M.black);
      batch.add(boxGeo(a + 0.08, b - 0.12, 0.62, 1.12, zf - 0.68, zf - 0.08), M.black);
      for (const y of [0.04, 0.6, 1.1]) batch.add(boxGeo(a - 0.01, b + 0.01, y - 0.025, y + 0.025, zf - 0.76, zf + 0.01), M.silver);
      solid(a, b, 0, 1.15, zf - 0.76, zf);
    }
    if (!low) {
      for (const x of [x0 + 1.75, x1 - 1.75]) batch.add(xform(new THREE.TorusGeometry(0.24, 0.05, 6, 16), x, 0.05, zf - 0.4, 0, -Math.PI / 2), M.metal);
    }
  });
  fixtureGeo.dispose();
  upCone.dispose();
}

// ================================================================== biển lightstick: bóng người ở các ô đám đông còn trống
function buildCrowd(scene, groups, spotsOf, low) {
  const slots = [];
  groups.forEach((room, ri) => {
    spotsOf(room).forEach((spot, k) => {
      if (low && k % 2) return; // ?q=low: nửa mật độ
      slots.push({ room, ri, spot, hidden: false, phase: (k * 0.37) % 1, arm: k % 2 ? 1 : -1 });
    });
  });
  const body = new THREE.CapsuleGeometry(0.2, 0.42, 1, 6); // bóng tối màu: ít đa giác là đủ
  body.translate(0, 0.55, 0);
  const head = new THREE.SphereGeometry(0.3, 7, 5);
  head.translate(0, 1.27, 0);
  const silGeo = mergeGeometries([body, head]);
  body.dispose();
  head.dispose();
  const sil = new THREE.InstancedMesh(silGeo, new THREE.MeshBasicMaterial({ color: 0x15172a }), slots.length);
  // lightstick giơ cao hơn đầu (nhìn từ sau lưng vẫn thấy), đầu tròn sáng
  const stickGeo = mergeGeometries([new THREE.CylinderGeometry(0.045, 0.04, 0.5, 6).translate(0, 0.25, 0), new THREE.SphereGeometry(0.1, 6, 4).translate(0, 0.55, 0)]);
  const sticks = new THREE.InstancedMesh(stickGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), slots.length);
  slots.forEach((s, i) => sticks.setColorAt(i, _c.set(s.room.def.accent).lerp(new THREE.Color(0xffffff), 0.25)));
  for (const m of [sil, sticks]) {
    m.matrixAutoUpdate = false;
    scene.add(m);
  }
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const setSlot = (i, beat) => {
    const s = slots[i];
    if (s.hidden) {
      sil.setMatrixAt(i, ZERO);
      sticks.setMatrixAt(i, ZERO);
      return;
    }
    const b = beat == null ? 0 : beat + s.phase * 0.5;
    const bob = beat == null ? 0 : Math.abs(Math.sin(b * Math.PI)) * 0.07;
    const { x, z } = s.spot;
    sil.setMatrixAt(i, _m.makeTranslation(x, bob, z));
    const wave = beat == null ? s.arm * 0.25 : s.arm * (0.15 + Math.sin(b * Math.PI) * 0.45);
    _m.makeRotationZ(wave).setPosition(x - s.arm * 0.24, 1.08 + bob, z);
    sticks.setMatrixAt(i, _m);
  };
  slots.forEach((_, i) => setSlot(i, null));
  sil.computeBoundingSphere();
  sticks.computeBoundingSphere();
  let occT = 0;
  let lastFocus = null;
  return {
    count: slots.length,
    /** @param actors danh sách nhân vật (NPC + người xem) — ô có người đứng gần thì ẩn bóng */
    update(dt, t, beats, focus, actors) {
      occT -= dt;
      let dirty = false;
      if (occT <= 0) {
        occT = 0.3;
        const near = [];
        for (const a of actors ?? []) {
          if (a.hidden) continue;
          const p = a.body.pos;
          if (p.z > -29.6 && p.z < -22 && p.y < 0.3) near.push(p);
        }
        for (const s of slots) {
          let hide = !!s.spot.occ;
          if (!hide) {
            for (const p of near) {
              const dx = p.x - s.spot.x;
              const dz = p.z - s.spot.z;
              if (dx * dx + dz * dz < 0.36) {
                hide = true;
                break;
              }
            }
          }
          if (hide !== s.hidden) {
            s.hidden = hide;
            dirty = true;
          }
        }
      }
      const fRoom = focus?.type === 'group' ? focus : null;
      if (dirty || fRoom || lastFocus !== fRoom) {
        const beat = fRoom ? beats?.get(fRoom.id) ?? t * 2 : null;
        for (let i = 0; i < slots.length; i++) {
          const inFocus = slots[i].room === fRoom;
          // phòng đang quay: nhún theo nhịp mỗi khung; phòng khác chỉ cập nhật khi ô đổi trạng thái / vừa hết quay
          if (inFocus || dirty || slots[i].room === lastFocus) setSlot(i, inFocus ? beat : null);
        }
        sil.instanceMatrix.needsUpdate = true;
        sticks.instanceMatrix.needsUpdate = true;
        lastFocus = fRoom;
      }
    },
  };
}

// ================================================================== nhân viên: bảo vệ cửa nhóm, quay phim, lao công
function buildStaff(scene, world, groups, { low, labelKind }) {
  const staff = [];
  const guardLook = { outfit: 'idolBlack', hair: 'black', hairStyle: 'short', hat: 'cap' };
  for (const r of groups) {
    const x = r.cx + 2.15;
    const z = GROUP.front + 0.8;
    const a = makeActor(scene, { name: '🛡️ Bảo vệ', look: guardLook, kind: labelKind, x, z });
    a.ry = 0;
    world.collision.add(makeBox(x - 0.3, x + 0.3, 0, 1.8, z - 0.3, z + 0.3, false));
    staff.push({ a, kind: 'guard', mode: 'idle', modeT: 4 + Math.random() * 8 });
  }
  if (!low) {
    // quay phim: đi dọc hành lang Bắc, dừng 4 giây quay vào cửa từng nhóm
    const cam = makeActor(scene, { name: '🎥 Quay phim', look: { outfit: 'tech', hair: 'brown', hairStyle: 'short', hat: 'cap' }, kind: labelKind, x: -17, z: -17.2 });
    setProps(cam.char, { headset: true });
    const camGeo = mergeGeometries([new THREE.BoxGeometry(0.22, 0.24, 0.46), new THREE.CylinderGeometry(0.08, 0.1, 0.2, 10).rotateX(Math.PI / 2).translate(0, 0, 0.32)]);
    const camMesh = new THREE.Mesh(camGeo, new THREE.MeshStandardMaterial({ color: 0x1c1d24, roughness: 0.4, metalness: 0.5 }));
    camMesh.position.set(0.36, 1.22, 0.12);
    cam.char.root.children[0].add(camMesh);
    staff.push({ a: cam, kind: 'walker', path: [[-17, -17.2], [0, -17.2], [17, -17.2], [0, -17.2]], face: Math.PI, speed: 1.1, pause: 4, i: 0, wait: 2 });
    // lao công: đi chậm qua lại hành lang Nam với cây lau nhà
    const clean = makeActor(scene, { name: '🧹 Lao công', look: { outfit: 'gamer', hair: 'black', hairStyle: 'bun', hat: 'none' }, kind: labelKind, x: -28, z: 13.2 });
    const mop = mergeGeometries([new THREE.CylinderGeometry(0.025, 0.025, 1.25, 6).rotateX(0.55).translate(0, 0.62, 0.17), new THREE.BoxGeometry(0.42, 0.06, 0.16).translate(0, 0.03, 0.5)]);
    const mopMesh = new THREE.Mesh(mop, new THREE.MeshStandardMaterial({ color: 0x5fa8d3, roughness: 0.8 }));
    mopMesh.position.set(0.3, 0, 0.12);
    clean.char.root.children[0].add(mopMesh);
    staff.push({ a: clean, kind: 'walker', path: [[-28, 13.2], [28, 13.2]], face: null, speed: 0.7, pause: 3, i: 0, wait: 1 });
  }
  return {
    actors: staff.map((s) => s.a),
    update(dt, camera) {
      for (const s of staff) {
        const a = s.a;
        const p = a.body.pos;
        // tự ẩn khi xa camera (mỗi nhân vật ~25 lệnh vẽ)
        const show = !!camera && camera.position.distanceToSquared(_v.set(p.x, p.y, p.z)) < 32 * 32;
        a.char.root.visible = show;
        if (s.kind === 'walker') {
          let moving = false;
          if (s.wait > 0) s.wait -= dt;
          else {
            const [tx, tz] = s.path[s.i];
            const dx = tx - p.x;
            const dz = tz - p.z;
            const d = Math.hypot(dx, dz);
            if (d < 0.05) {
              s.i = (s.i + 1) % s.path.length;
              s.wait = s.pause;
            } else {
              const st = Math.min(d, s.speed * dt);
              p.x += (dx / d) * st;
              p.z += (dz / d) * st;
              a.ry = Math.atan2(dx, dz);
              moving = true;
            }
          }
          if (!moving && s.face != null) a.ry = s.face;
          a.char.root.position.set(p.x, p.y, p.z);
          a.char.root.rotation.y = a.ry;
          if (show) animateCharacter(a.char, dt, { mode: moving ? 'walk' : 'idle', speed: moving ? s.speed : 0 });
        } else if (show) {
          s.modeT -= dt;
          if (s.modeT <= 0) {
            s.mode = s.mode === 'idle' ? 'talk' : 'idle'; // thỉnh thoảng nói vào bộ đàm
            s.modeT = s.mode === 'talk' ? 2.5 : 6 + Math.random() * 10;
          }
          animateCharacter(a.char, dt, { mode: s.mode, speed: 0 });
        }
      }
    },
  };
}

// ================================================================== lắp ráp
/**
 * @param {THREE.Scene} scene
 * @param {object} world từ buildWorld
 * @param {{low?:boolean, spotsOf?:(room)=>Array, staff?:boolean, labelKind?:string, seed?:number}} [opts]
 *   spotsOf: ô đám đông của phòng nhóm (bản LIVE truyền crowdSpots của game.js để biết ô có người xem — spot.occ)
 */
export function buildDecor(scene, world, { low = false, spotsOf = null, staff = true, labelKind = 'crowd', seed = 20261103 } = {}) {
  const rng = mulberry32(seed);
  const groups = world.rooms.filter((r) => r.type === 'group');
  const clubColors = groups.map((r) => r.def.accent);
  // trời đêm xanh thẫm; sương bắt đầu xa hơn để thấy phố quanh tòa nhà ở cảnh toàn cảnh
  scene.background = new THREE.Color(0x10162c);
  scene.fog = new THREE.Fog(0x10162c, 115, 250);

  const M = {
    metal: new THREE.MeshStandardMaterial({ color: 0x2b2e3a, roughness: 0.45, metalness: 0.6 }),
    silver: new THREE.MeshStandardMaterial({ color: 0xb9bdc9, roughness: 0.35, metalness: 0.7 }),
    black: new THREE.MeshStandardMaterial({ color: 0x15161c, roughness: 0.6 }),
    white: new THREE.MeshStandardMaterial({ color: 0xe9ecf4, roughness: 0.5 }),
    wood: new THREE.MeshStandardMaterial({ color: 0xb98a5e, roughness: 0.8 }),
    pinkBody: new THREE.MeshStandardMaterial({ color: 0xff8cc4, roughness: 0.6 }),
    matPink: new THREE.MeshStandardMaterial({ color: 0x8a2c60, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xfff1d6, toneMapped: false }),
    glowPink: new THREE.MeshBasicMaterial({ color: 0xff4fa3, toneMapped: false }),
    glowYellow: new THREE.MeshBasicMaterial({ color: 0xffd860, toneMapped: false }),
  };
  const batch = new Batch();
  const wires = [];

  const city = buildCity(scene, rng, low);
  const strands = buildStrands(scene, wires, clubColors, low);
  const ticker = buildTickers(scene, batch, M, wires);
  const floor = buildFloor(scene, groups);
  buildProps(scene, world, batch, M, groups, low);
  const crowd = buildCrowd(scene, groups, spotsOf ?? ((r) => (r._decorCrowd ??= crowdGrid(r))), low);
  const people = staff ? buildStaff(scene, world, groups, { low, labelKind }) : { actors: [], update() {} };

  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  const wireMesh = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x2c2f3f }));
  wireMesh.matrixAutoUpdate = false;
  scene.add(wireMesh);
  batch.build(scene);

  return {
    staff: people.actors,
    stats: { bulbs: strands.count, crowd: crowd.count },
    /**
     * @param {number} dt
     * @param {number} t giây
     * @param {{camera?:THREE.Camera, beats?:Map, focus?:object|null, actors?:Array}} ctx
     *   focus = phòng camera đang quay (biển lightstick nhún theo nhịp phòng đó)
     */
    update(dt, t, { camera, beats, focus, actors } = {}) {
      city.update(dt, t);
      strands.update(dt, t);
      ticker.update(dt);
      floor.update(dt, t);
      crowd.update(dt, t, beats, focus, actors);
      people.update(dt, camera);
    },
    /** Các câu chạy cố định trên dải LED (hướng dẫn tham gia). */
    setTickerLines(lines) {
      ticker.setLines(lines);
    },
    /** Thêm 1 dòng quà mới (vàng) lên đầu dải LED; giữ 4 dòng gần nhất. */
    pushTicker(line) {
      ticker.push(line);
    },
    clearTicker() {
      ticker.clearGifts();
    },
  };
}
