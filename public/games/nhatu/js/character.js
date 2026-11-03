/**
 * Procedural chibi character: big round head, small body, short limbs.
 *
 * Mỗi nhân vật = 1 SkinnedMesh 6 xương (thân, 2 chân, 2 tay, đầu) + bóng giả + số áo:
 *  - Các khối hình (đầu, mắt, má, tóc, mũ, tay chân…) được gộp sẵn thành 1 hình theo bộ đồ (lookKey) và dùng chung
 *    giữa mọi nhân vật mặc giống nhau. Màu nằm ở màu đỉnh; sọc tù + độ nhám nằm trong 1 atlas nhỏ.
 *    → 1 lệnh vẽ thay vì ~24 (130 nhân vật ở góc toàn cảnh từng tốn ~2.900 lệnh vẽ mỗi khung).
 *  - Số áo lấy từ 1 atlas cố định NUMBER_POOL số (không tạo texture mới cho mỗi người → không rò bộ nhớ).
 *  - Bóng đổ do 1 "bóng thay thế" ít đa giác (~450 tam giác, chung bộ xương) nằm ở SHADOW_LAYER — chỉ pass bóng thấy,
 *    hình chính (~5 nghìn tam giác) không đổ bóng. Trước đây cũng chỉ thân + đầu đổ bóng.
 *  - Gỡ nhân vật khỏi cảnh thì gọi disposeCharacter() để trả texture xương của Skeleton.
 */
import * as THREE from 'three';

const SKIN = 0xf8d0aa;
export const HAIR_COLORS = { brown: 0x6e4325, black: 0x2b221d, blonde: 0xe3b65c, gray: 0xbdbdbd };
export const HAT_COLORS = { red: 0xe5483d, white: 0xf4f4f4 };
const ORANGE = 0xf6a21e;
const GUARD_BLUE = 0x3f80d4;
const NAVY = 0x27355a;
const PINK = 0xff8fc8; // 👗 trò đùa "Mặc váy hồng"
const PINK_DARK = 0xff5fa8;
const SHOE = 0x3a3330;

/** Layer chỉ camera bóng của mặt trời bật (world.js) — đặt bóng thay thế của nhân vật vào đây. */
export const SHADOW_LAYER = 1;

const geo = {};
const mats = new Map();

function g() {
  if (geo.head) return geo;
  geo.head = new THREE.SphereGeometry(0.42, 26, 18);
  geo.eye = new THREE.SphereGeometry(0.048, 8, 6);
  geo.small = new THREE.SphereGeometry(0.06, 8, 6);
  geo.ear = new THREE.SphereGeometry(0.085, 8, 6);
  geo.torso = new THREE.CapsuleGeometry(0.25, 0.14, 6, 16);
  geo.arm = new THREE.CapsuleGeometry(0.075, 0.2, 4, 8);
  geo.leg = new THREE.CapsuleGeometry(0.095, 0.16, 4, 8);
  geo.hand = new THREE.SphereGeometry(0.075, 8, 6);
  geo.shoe = new THREE.SphereGeometry(0.11, 8, 6);
  geo.hair = new THREE.SphereGeometry(0.445, 26, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  geo.fringe = new THREE.SphereGeometry(0.2, 12, 8);
  geo.beanie = new THREE.SphereGeometry(0.465, 26, 10, 0, Math.PI * 2, 0, Math.PI * 0.4);
  geo.fold = new THREE.TorusGeometry(0.44, 0.07, 8, 26);
  geo.pom = new THREE.SphereGeometry(0.09, 8, 6);
  geo.capTop = new THREE.CylinderGeometry(0.38, 0.44, 0.2, 24);
  geo.brim = new THREE.CylinderGeometry(0.3, 0.3, 0.035, 20, 1, false, -Math.PI / 2, Math.PI);
  geo.patch = new THREE.PlaneGeometry(0.2, 0.11);
  geo.belt = new THREE.CylinderGeometry(0.255, 0.255, 0.06, 18);
  geo.shadow = new THREE.CircleGeometry(0.38, 20);
  geo.chain = new THREE.TorusGeometry(0.2, 0.025, 8, 24);
  geo.crownBand = new THREE.CylinderGeometry(0.3, 0.28, 0.14, 20, 1, true);
  geo.crownSpike = new THREE.ConeGeometry(0.06, 0.16, 6);
  geo.cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
  geo.box = new THREE.BoxGeometry(1, 1, 1);
  geo.sphere = new THREE.SphereGeometry(0.5, 14, 10);
  geo.cone = new THREE.ConeGeometry(0.5, 1, 18, 1, true);
  return geo;
}

/** Cached standard material by colour (đạo cụ, thú cưng + khuôn mẫu để gộp hình nhân vật). */
export function mat(color, opts = {}) {
  const key = `${color}|${opts.rough ?? 0.75}|${opts.emissive ?? 0}`;
  if (!mats.has(key)) {
    mats.set(
      key,
      new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.75, metalness: 0, emissive: opts.emissive ?? 0 })
    );
  }
  return mats.get(key);
}

/** Vật liệu đánh dấu "vải sọc" (chỉ dùng trong khuôn mẫu: lúc gộp hình → cột sọc tương ứng trong atlas). */
function stripeMarker(repeatY) {
  const key = `stripe${repeatY}`;
  if (!mats.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    m.userData.stripe = repeatY;
    mats.set(key, m);
  }
  return mats.get(key);
}

function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}

const sharedBlob = { mat: null };
function blobMaterial() {
  if (!sharedBlob.mat) sharedBlob.mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false });
  return sharedBlob.mat;
}

// ------------------------------------------------------------------ atlas màu chung cho mọi nhân vật
// Mỗi cột 1 loại bề mặt: 0–3 trắng trơn theo độ nhám (màu thật ở màu đỉnh), 4–6 vải sọc lặp 4/2/3 lần.
const ATLAS_COLS = 8;
const COL_W = 32;
const ATLAS_H = 256;
const ROUGH_CLASSES = [0.25, 0.6, 0.78, 0.92];
const STRIPE_COL = { 4: 4, 2: 5, 3: 6 };
const STRIPE_ROUGH = 0.8;
let charMat = null;

function charMaterial() {
  if (charMat) return charMat;
  const W = ATLAS_COLS * COL_W;
  const color = document.createElement('canvas');
  color.width = W;
  color.height = ATLAS_H;
  const cc = color.getContext('2d');
  cc.fillStyle = '#ffffff';
  cc.fillRect(0, 0, W, ATLAS_H);
  const rough = document.createElement('canvas');
  rough.width = W;
  rough.height = ATLAS_H;
  const rc = rough.getContext('2d');
  const grey = (v) => {
    const c = Math.round(v * 255);
    return `rgb(${c},${c},${c})`;
  };
  ROUGH_CLASSES.forEach((r, col) => {
    rc.fillStyle = grey(r);
    rc.fillRect(col * COL_W, 0, COL_W, ATLAS_H);
  });
  for (const [rep, col] of Object.entries(STRIPE_COL)) {
    cc.fillStyle = '#f4f4f4';
    cc.fillRect(col * COL_W, 0, COL_W, ATLAS_H);
    cc.fillStyle = '#1f1f24';
    const period = ATLAS_H / (4 * Number(rep)); // như bản cũ: 4 sọc trong ảnh × repeatY
    for (let y = 0; y < ATLAS_H; y += period) cc.fillRect(col * COL_W, y, COL_W, period / 2);
    rc.fillStyle = grey(STRIPE_ROUGH);
    rc.fillRect(col * COL_W, 0, COL_W, ATLAS_H);
  }
  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  const roughnessMap = new THREE.CanvasTexture(rough);
  charMat = new THREE.MeshStandardMaterial({ map, roughnessMap, roughness: 1, metalness: 0, vertexColors: true });
  return charMat;
}

// ------------------------------------------------------------------ số áo: 1 atlas cố định, không rò texture
const NUM_COLS = 8;
const NUM_ROWS = 14;
const NUM_W = 64;
const NUM_H = 36;
/** Các số áo có sẵn trong atlas (cố định theo hạt giống) — NPC/người xem chọn từ đây. */
export const NUMBER_POOL = (() => {
  const out = [];
  const used = new Set();
  let s = 20261102;
  while (out.length < NUM_COLS * NUM_ROWS) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const n = 1000 + (s % 8999);
    if (!used.has(n)) {
      used.add(n);
      out.push(n);
    }
  }
  return out;
})();
const numberSlotOf = new Map(NUMBER_POOL.map((n, i) => [n, i]));
const patchGeos = new Map();
let numMat = null;

function numberMaterial() {
  if (numMat) return numMat;
  const c = document.createElement('canvas');
  c.width = NUM_COLS * NUM_W;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#222';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  NUMBER_POOL.forEach((n, i) => ctx.fillText(String(n), (i % NUM_COLS) * NUM_W + NUM_W / 2, Math.floor(i / NUM_COLS) * NUM_H + 19));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false; // ô số nằm sát nhau — mipmap sẽ lem sang ô bên cạnh
  tex.minFilter = THREE.LinearFilter;
  numMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  return numMat;
}

function patchGeometry(number) {
  const slot = numberSlotOf.get(number) ?? (Math.abs(Math.trunc(number)) % NUMBER_POOL.length);
  if (patchGeos.has(slot)) return patchGeos.get(slot);
  const pg = g().patch.clone();
  const uv = pg.attributes.uv;
  const H = 512;
  const W = NUM_COLS * NUM_W;
  const x0 = ((slot % NUM_COLS) * NUM_W + 0.5) / W;
  const x1 = ((slot % NUM_COLS) * NUM_W + NUM_W - 0.5) / W;
  const yTop = Math.floor(slot / NUM_COLS) * NUM_H;
  const v1 = 1 - (yTop + 0.5) / H;
  const v0 = 1 - (yTop + NUM_H - 0.5) / H;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? x1 : x0, uv.getY(i) ? v1 : v0);
  patchGeos.set(slot, pg);
  return pg;
}

// ------------------------------------------------------------------ bộ xương chung
const BONES = [
  ['body', null, 0, 0, 0],
  ['legL', 'body', -0.12, 0.4, 0],
  ['legR', 'body', 0.12, 0.4, 0],
  ['armL', 'body', -0.31, 0.88, 0],
  ['armR', 'body', 0.31, 0.88, 0],
  ['head', 'body', 0, 0.94, 0],
];
let restInverses = null;

/** Dựng cây nút theo BONES (Bone cho nhân vật thật, Group cho khuôn mẫu gộp hình). */
function makeRig(make) {
  const nodes = {};
  const list = [];
  BONES.forEach(([name, parent, x, y, z], i) => {
    const n = make();
    n.name = name;
    n.userData.boneIndex = i;
    n.position.set(x, y, z);
    if (parent) nodes[parent].add(n);
    nodes[name] = n;
    list.push(n);
  });
  return { nodes, list };
}

function boneInverses() {
  if (!restInverses) {
    const { list } = makeRig(() => new THREE.Group());
    list[0].updateMatrixWorld(true);
    restInverses = list.map((n) => n.matrixWorld.clone().invert());
  }
  return restInverses.map((m) => m.clone());
}

// ------------------------------------------------------------------ khuôn mẫu theo bộ đồ → hình gộp dùng chung
/** Dựng nhân vật kiểu cũ (nhiều khối) trên các Group ở tư thế nghỉ — chỉ để đọc hình, không đưa vào cảnh. */
function buildTemplate(look) {
  const G = g();
  const root = new THREE.Group();
  const { nodes } = makeRig(() => new THREE.Group());
  root.add(nodes.body);
  const guard = look.outfit === 'guard';
  const stripe = look.outfit === 'stripe';
  const civil = look.outfit === 'civil'; // người thân đi thăm nuôi
  const chef = look.outfit === 'chef'; // 🧑‍🍳 đầu bếp: áo trắng, quần caro
  const nurse = look.outfit === 'nurse'; // 🩺 y tá: đồ trắng, quần hồng nhạt
  const pink = look.outfit === 'pink'; // 👗 bị bắt mặc váy hồng (trò đùa)
  const white = mat(0xf7f7f7, { rough: 0.6 });
  const shirt = civil ? mat(look.shirt ?? 0xe86fa0) : null;
  const torsoMat = guard ? mat(GUARD_BLUE) : stripe ? stripeMarker(4) : civil ? shirt : chef || nurse ? white : pink ? mat(PINK) : mat(ORANGE);
  const legMat = guard ? mat(NAVY) : stripe ? stripeMarker(2) : civil ? mat(0x3a4a6b) : chef ? stripeMarker(3) : nurse ? mat(0xf5c6d6) : pink ? mat(0xffc2e0) : mat(ORANGE);
  const armMat = guard ? mat(GUARD_BLUE) : stripe ? stripeMarker(2) : civil ? shirt : chef || nurse ? white : pink ? mat(PINK) : mat(ORANGE);

  const torso = mesh(G.torso, torsoMat, 0, 0.66, 0);
  torso.scale.set(1.05, 1, 0.9);
  nodes.body.add(torso);
  for (const side of ['legL', 'legR']) {
    nodes[side].add(mesh(G.leg, legMat, 0, -0.17, 0));
    const shoe = mesh(G.shoe, mat(SHOE), 0, -0.36, 0.03);
    shoe.scale.set(1, 0.6, 1.3);
    nodes[side].add(shoe);
  }
  for (const side of ['armL', 'armR']) {
    nodes[side].add(mesh(G.arm, armMat, 0, -0.17, 0));
    nodes[side].add(mesh(G.hand, mat(SKIN), 0, -0.36, 0));
  }
  if (guard) {
    const belt = mesh(G.belt, mat(0x222222), 0, 0.44, 0);
    belt.scale.set(1.05, 1, 0.9);
    nodes.body.add(belt);
  }
  if (pink) {
    const skirt = mesh(G.cone, mat(PINK_DARK), 0, 0.47, 0); // váy xoè
    skirt.scale.set(0.76, 0.34, 0.68);
    nodes.body.add(skirt);
  }
  if (look.armband) {
    const armband = mesh(G.cyl, mat(0xe5483d), 0, -0.12, 0);
    armband.scale.set(0.17, 0.08, 0.17);
    nodes.armL.add(armband);
  }

  // Head
  const headPivot = nodes.head;
  headPivot.add(mesh(G.head, mat(SKIN, { rough: 0.6 }), 0, 0.36, 0));
  const face = new THREE.Group();
  face.position.y = 0.36;
  headPivot.add(face);
  const eyeMat = mat(0x1b1b1b, { rough: 0.3 });
  face.add(mesh(G.eye, eyeMat, -0.14, -0.02, 0.39), mesh(G.eye, eyeMat, 0.14, -0.02, 0.39));
  const cheekMat = mat(0xf7a3a0, { rough: 0.9 });
  for (const sx of [-1, 1]) {
    const cheek = mesh(G.small, cheekMat, sx * 0.25, -0.12, 0.31);
    cheek.scale.set(1.1, 0.6, 0.4);
    face.add(cheek);
    face.add(mesh(G.ear, mat(SKIN, { rough: 0.6 }), sx * 0.41, -0.03, 0));
  }
  const mouth = mesh(G.small, mat(0x8a4a3a), 0, -0.17, 0.39);
  mouth.scale.set(0.55, 0.28, 0.3);
  face.add(mouth);
  if (look.cream) {
    // 🎂 bị úp bánh kem: kem trắng phủ mặt + vài đốm + quả anh đào
    const cream = mat(0xfffaf0, { rough: 0.6 });
    const blob = mesh(G.sphere, cream, 0, -0.06, 0.3);
    blob.scale.set(0.72, 0.5, 0.3);
    face.add(blob);
    for (const [x, y] of [[-0.24, 0.12], [0.22, 0.16], [0.05, 0.22]]) {
      const dot = mesh(G.small, cream, x, y, 0.36);
      dot.scale.setScalar(0.9);
      face.add(dot);
    }
    face.add(mesh(G.small, mat(0xd81e3a, { rough: 0.3 }), 0.04, 0.05, 0.47));
  }

  if (look.boss) {
    // kính đen + dây chuyền vàng đại ca
    const lensMat = mat(0x111111, { rough: 0.2 });
    for (const sx of [-1, 1]) {
      const lens = mesh(G.small, lensMat, sx * 0.14, -0.01, 0.4);
      lens.scale.set(1.9, 1.1, 0.35);
      face.add(lens);
    }
    const bridge = mesh(G.small, lensMat, 0, 0.01, 0.415);
    bridge.scale.set(1.2, 0.25, 0.25);
    face.add(bridge);
    const chain = mesh(G.chain, mat(0xf2c230, { rough: 0.25, emissive: 0x3a2a00 }), 0, 0.86, 0.02);
    chain.rotation.x = Math.PI / 2 - 0.25;
    nodes.body.add(chain);
  }

  const hairGroup = new THREE.Group();
  hairGroup.position.y = 0.36;
  headPivot.add(hairGroup);
  if (look.hair && look.hair !== 'bald') {
    const hm = mat(HAIR_COLORS[look.hair] ?? HAIR_COLORS.brown, { rough: 0.85 });
    const cap = mesh(G.hair, hm);
    cap.rotation.x = -0.42;
    const fringe = mesh(G.fringe, hm, 0.05, 0.3, 0.24);
    fringe.scale.set(1.3, 0.55, 0.8);
    fringe.rotation.z = 0.3;
    hairGroup.add(cap, fringe);
  }

  const hatGroup = new THREE.Group();
  hatGroup.position.y = 0.36;
  headPivot.add(hatGroup);
  if (guard) {
    const tilt = new THREE.Group();
    tilt.rotation.x = -0.12;
    tilt.add(mesh(G.capTop, mat(0x2f62b3), 0, 0.36, 0));
    const brim = mesh(G.brim, mat(0x1d2a44), 0, 0.27, 0.12);
    brim.scale.set(1, 1, 1.2);
    tilt.add(brim);
    tilt.add(mesh(G.small, mat(0xf2c230, { emissive: 0x332200 }), 0, 0.38, 0.4));
    hatGroup.add(tilt);
  } else if (look.hat === 'chef') {
    const w = mat(0xffffff, { rough: 0.8 });
    const toque = new THREE.Group();
    toque.position.y = 0.3;
    const band = mesh(G.cyl, w, 0, 0.08, 0);
    band.scale.set(0.62, 0.22, 0.62);
    const puff = mesh(G.sphere, w, 0, 0.3, 0);
    puff.scale.set(0.78, 0.5, 0.78);
    toque.add(band, puff);
    hatGroup.add(toque);
  } else if (look.hat === 'nurse') {
    const cap = new THREE.Group();
    cap.position.set(0, 0.38, 0.05);
    cap.rotation.x = -0.35;
    const base = mesh(G.box, mat(0xffffff, { rough: 0.7 }), 0, 0, 0);
    base.scale.set(0.42, 0.14, 0.24);
    const crossV = mesh(G.box, mat(0xe5483d), 0, 0.01, 0.125);
    crossV.scale.set(0.05, 0.11, 0.01);
    const crossH = mesh(G.box, mat(0xe5483d), 0, 0.01, 0.125);
    crossH.scale.set(0.11, 0.05, 0.01);
    cap.add(base, crossV, crossH);
    hatGroup.add(cap);
  } else if (look.hat === 'bow') {
    // 🎀 nơ hồng trên đỉnh đầu (đi kèm váy hồng)
    const pm = mat(PINK_DARK, { rough: 0.6 });
    const bow = new THREE.Group();
    bow.position.set(0.12, 0.4, 0.05);
    bow.rotation.z = -0.3;
    for (const sx of [-1, 1]) {
      const wing = mesh(G.sphere, pm, sx * 0.13, 0, 0);
      wing.scale.set(0.24, 0.17, 0.09);
      bow.add(wing);
    }
    bow.add(mesh(G.small, pm, 0, 0, 0.02));
    hatGroup.add(bow);
  } else if (look.hat === 'crown') {
    const gold = mat(0xf2c230, { rough: 0.25, emissive: 0x4a3300 });
    const crown = new THREE.Group();
    crown.position.y = 0.36;
    crown.add(mesh(G.crownBand, gold));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      crown.add(mesh(G.crownSpike, gold, Math.sin(a) * 0.25, 0.17, Math.cos(a) * 0.25));
      const gem = mesh(G.small, mat([0xe5483d, 0x3fa0ff, 0x3bc26a][i % 3], { rough: 0.2 }), Math.sin(a) * 0.29, 0.03, Math.cos(a) * 0.29);
      gem.scale.setScalar(0.6);
      crown.add(gem);
    }
    hatGroup.add(crown);
  } else if (look.hat && look.hat !== 'none') {
    const hm = mat(HAT_COLORS[look.hat] ?? HAT_COLORS.red, { rough: 0.95 });
    const tilt = new THREE.Group();
    tilt.rotation.x = -0.22;
    tilt.add(mesh(G.beanie, hm));
    const fold = mesh(G.fold, hm, 0, 0.145, 0);
    fold.rotation.x = Math.PI / 2;
    tilt.add(fold);
    tilt.add(mesh(G.pom, hm, 0, 0.47, 0));
    hatGroup.add(tilt);
  }
  return root;
}

/** Khoá bộ đồ: chỉ các trường làm đổi hình khối (số áo nằm riêng trên miếng vá). */
function lookKey(look) {
  return [look.outfit ?? 'orange', look.outfit === 'civil' ? look.shirt ?? '' : '', look.hair ?? '', look.hat ?? '', look.boss ? 1 : 0, look.armband ? 1 : 0, look.cream ? 1 : 0].join('|');
}

const bakedGeos = new Map();
const tmpV = new THREE.Vector3();
const tmpN = new THREE.Matrix3();
const tmpC = new THREE.Color();

/** Hình gộp theo bộ đồ (cache theo lookKey, dùng chung giữa các nhân vật). */
function bakedGeometry(look) {
  const key = lookKey(look);
  if (!bakedGeos.has(key)) bakedGeos.set(key, bakeTemplate(buildTemplate(look)));
  return bakedGeos.get(key);
}

let proxyGeo = null;
/** Bóng thay thế: thân, đầu, tay chân bằng khối ít đa giác — chung cho mọi bộ đồ. */
function shadowProxyGeometry() {
  if (proxyGeo) return proxyGeo;
  const root = new THREE.Group();
  const { nodes } = makeRig(() => new THREE.Group());
  root.add(nodes.body);
  const m = mat(0x000000);
  const torso = mesh(new THREE.CapsuleGeometry(0.25, 0.14, 2, 8), m, 0, 0.66, 0);
  torso.scale.set(1.05, 1, 0.9);
  nodes.body.add(torso);
  nodes.head.add(mesh(new THREE.SphereGeometry(0.44, 10, 7), m, 0, 0.38, 0));
  const limb = new THREE.CapsuleGeometry(0.09, 0.3, 1, 5);
  for (const side of ['legL', 'legR', 'armL', 'armR']) nodes[side].add(mesh(limb, m, 0, -0.2, 0));
  proxyGeo = bakeTemplate(root);
  return proxyGeo;
}

/** Gộp mọi khối của một cây khuôn mẫu thành 1 BufferGeometry có xương (skinIndex = xương gần nhất phía trên khối). */
function bakeTemplate(root) {
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    let b = o.parent;
    while (b && b.userData.boneIndex === undefined) b = b.parent;
    parts.push({ m: o, bone: b ? b.userData.boneIndex : 0 });
  });
  let vCount = 0;
  let iCount = 0;
  for (const p of parts) {
    vCount += p.m.geometry.attributes.position.count;
    iCount += p.m.geometry.index ? p.m.geometry.index.count : p.m.geometry.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const col = new Float32Array(vCount * 3);
  const skI = new Uint16Array(vCount * 4);
  const skW = new Float32Array(vCount * 4);
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let vo = 0;
  let io = 0;
  for (const { m, bone } of parts) {
    const A = m.geometry.attributes;
    const M = m.material;
    const stripe = M.userData.stripe;
    let column;
    if (stripe) column = STRIPE_COL[stripe];
    else {
      let best = 0;
      ROUGH_CLASSES.forEach((r, i) => {
        if (Math.abs(r - M.roughness) < Math.abs(ROUGH_CLASSES[best] - M.roughness)) best = i;
      });
      column = best;
    }
    const u = (column + 0.5) / ATLAS_COLS;
    tmpC.copy(M.color);
    if (M.emissive) tmpC.add(M.emissive); // vàng đại ca / huy hiệu có chút phát sáng → sáng hơn chút
    tmpN.getNormalMatrix(m.matrixWorld);
    const n = A.position.count;
    for (let i = 0; i < n; i++) {
      const k = vo + i;
      tmpV.fromBufferAttribute(A.position, i).applyMatrix4(m.matrixWorld);
      pos[k * 3] = tmpV.x;
      pos[k * 3 + 1] = tmpV.y;
      pos[k * 3 + 2] = tmpV.z;
      tmpV.fromBufferAttribute(A.normal, i).applyMatrix3(tmpN).normalize();
      nor[k * 3] = tmpV.x;
      nor[k * 3 + 1] = tmpV.y;
      nor[k * 3 + 2] = tmpV.z;
      uvs[k * 2] = u;
      uvs[k * 2 + 1] = stripe ? A.uv.getY(i) : 0.5;
      col[k * 3] = Math.min(1, tmpC.r);
      col[k * 3 + 1] = Math.min(1, tmpC.g);
      col[k * 3 + 2] = Math.min(1, tmpC.b);
      skI[k * 4] = bone;
      skW[k * 4] = 1;
    }
    const index = m.geometry.index;
    if (index) for (let i = 0; i < index.count; i++) idx[io + i] = index.getX(i) + vo;
    else for (let i = 0; i < n; i++) idx[io + i] = vo + i;
    io += index ? index.count : n;
    vo += n;
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  bg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  bg.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  bg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  bg.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skI, 4));
  bg.setAttribute('skinWeight', new THREE.BufferAttribute(skW, 4));
  bg.setIndex(new THREE.BufferAttribute(idx, 1));
  bg.computeBoundingSphere();
  return bg;
}

const patchVisible = (look) => !['guard', 'stripe', 'civil', 'chef', 'nurse', 'pink'].includes(look.outfit);

/**
 * Create a character.
 * @param {{outfit:'orange'|'stripe'|'guard'|'civil'|'chef'|'nurse', hair:string, hat:string, number?:number, boss?:boolean, armband?:boolean, shirt?:number}} look
 */
export function createCharacter(look) {
  const root = new THREE.Group();
  const blob = new THREE.Mesh(g().shadow, blobMaterial());
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.012;
  root.add(blob);

  const { nodes, list } = makeRig(() => new THREE.Bone());
  root.add(nodes.body);
  const skinned = new THREE.SkinnedMesh(bakedGeometry(look), charMaterial());
  // khung bao cố định (đủ cho giơ tay, ngồi, nhảy) — khỏi tính lại theo từng đỉnh mỗi lần đổi tư thế
  skinned.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.85, 0), 1.3);
  root.add(skinned);
  const skeleton = new THREE.Skeleton(list, boneInverses());
  skinned.bind(skeleton, new THREE.Matrix4());
  const shadow = new THREE.SkinnedMesh(shadowProxyGeometry(), charMaterial());
  shadow.castShadow = true;
  shadow.layers.set(SHADOW_LAYER);
  shadow.boundingSphere = skinned.boundingSphere;
  root.add(shadow);
  shadow.bind(skeleton, new THREE.Matrix4());

  const patch = new THREE.Mesh(patchGeometry(look.number ?? 1000), numberMaterial());
  patch.position.set(0.08, 0.7, 0.232);
  nodes.body.add(patch);

  const char = {
    root,
    blob,
    anchor: null, // điểm treo bảng tên khi đang nằm (null = trên đầu lúc đứng)
    body: nodes.body,
    legL: { pivot: nodes.legL },
    legR: { pivot: nodes.legR },
    armL: { pivot: nodes.armL },
    armR: { pivot: nodes.armR },
    headPivot: nodes.head,
    skinned,
    skeleton,
    patch,
    prop: null,
    propName: 'none',
    phase: Math.random() * 10,
    t: Math.random() * 10,
    look: null,
  };
  setLook(char, look);
  return char;
}

/** Re-skin a character (outfit, hair, hat, đồ đại ca, băng tay…). */
export function setLook(char, look) {
  char.look = { ...look };
  char.skinned.geometry = bakedGeometry(look);
  char.patch.visible = patchVisible(look);
  if (char.patch.visible) char.patch.geometry = patchGeometry(look.number ?? 1000);
}

/** Gỡ nhân vật khỏi cảnh và trả tài nguyên GPU riêng của nó (texture xương). Hình/vật liệu là đồ dùng chung — không huỷ. */
export function disposeCharacter(char) {
  char.root.removeFromParent();
  char.skeleton?.dispose();
}

const lerp = (a, b, k) => a + (b - a) * k;

/**
 * Pose the character for this frame.
 * @param {object} char
 * @param {number} dt
 * @param {{mode:string, speed:number, airborne?:boolean}} s
 *   mode: idle | walk | sit | eat | exercise | mop | shoot | sleep | talk | cheer
 */
export function animateCharacter(char, dt, s) {
  char.t += dt;
  const k = Math.min(1, dt * 12);
  const t = char.t;
  let legL = 0, legR = 0, armL = 0, armR = 0, armLz = 0.12, armRz = -0.12, legZ = 0;
  let bob = 0, bodyY = 0, headX = 0, headZ = 0;

  switch (s.mode) {
    case 'walk': {
      char.phase += dt * (4 + s.speed * 2.2);
      const amp = Math.min(0.9, 0.35 + s.speed * 0.11);
      legL = Math.sin(char.phase) * amp;
      legR = -legL;
      armL = -legL * 0.9;
      armR = -legR * 0.9;
      bob = Math.abs(Math.sin(char.phase)) * 0.06;
      break;
    }
    case 'sit':
    case 'eat':
      legL = legR = -1.45;
      bodyY = -0.02;
      armL = armR = -0.5;
      if (s.mode === 'eat') armR = -0.9 - Math.max(0, Math.sin(t * 5)) * 0.8;
      break;
    case 'sleep': // nằm ngửa trên giường (npc.js syncActor xoay cả người) — chân duỗi chạm đệm, tay xuôi, đầu gối cao
      legL = legR = 0.12;
      armL = armR = 0.22;
      armLz = 0.2;
      armRz = -0.2;
      headX = 0.55 + Math.sin(t * 0.9) * 0.03;
      headZ = Math.sin(t * 0.45) * 0.04;
      break;
    case 'exercise': {
      const p = (Math.sin(t * 6) + 1) / 2;
      armLz = 0.2 + p * 2.6;
      armRz = -armLz;
      legZ = p * 0.28;
      bob = p * 0.12;
      break;
    }
    case 'mop':
      armL = armR = -0.9 + Math.sin(t * 7) * 0.35;
      armLz = 0.35;
      armRz = -0.35;
      headX = 0.2;
      bob = Math.abs(Math.sin(t * 7)) * 0.02;
      break;
    case 'shoot':
      armL = armR = -2.9;
      bob = 0.05;
      break;
    case 'cheer':
      armLz = 2.6 + Math.sin(t * 10) * 0.3;
      armRz = -armLz;
      bob = Math.abs(Math.sin(t * 8)) * 0.12;
      break;
    case 'talk':
      armR = -0.6 + Math.sin(t * 6) * 0.25;
      headZ = Math.sin(t * 3) * 0.08;
      break;
    case 'massage': // đấm bóp vai: hai tay đưa ra trước, nhấp lên xuống
      armL = armR = -1.25 + Math.sin(t * 12) * 0.2;
      armLz = 0.05;
      armRz = -0.05;
      bob = Math.abs(Math.sin(t * 12)) * 0.02;
      break;
    case 'kneel': // quỳ lau chân
      legL = legR = -1.45;
      bodyY = -0.28;
      armR = -1.1 + Math.sin(t * 9) * 0.3;
      armL = -0.7;
      headX = 0.35;
      break;
    case 'fan': // quạt mát
      armR = -1.3;
      armRz = -0.4 + Math.sin(t * 14) * 0.5;
      armL = Math.sin(t * 1.8) * 0.05;
      break;
    case 'hold': // che ô / bưng đồ
      armR = -2.4;
      armRz = -0.1;
      break;
    case 'serve':
      armL = armR = -1.4;
      armLz = 0.1;
      armRz = -0.1;
      headX = 0.15;
      break;
    case 'clap': {
      const c = Math.abs(Math.sin(t * 9));
      armL = armR = -1.3;
      armLz = -0.15 + c * 0.45;
      armRz = -armLz;
      bob = c * 0.03;
      break;
    }
    case 'sing':
      armR = -2.2 + Math.sin(t * 3) * 0.1;
      armL = -0.6 + Math.sin(t * 4) * 0.4;
      armLz = 0.6;
      headZ = Math.sin(t * 4) * 0.12;
      bob = Math.abs(Math.sin(t * 4)) * 0.05;
      break;
    case 'wrestle': // vật tay: ngồi, tay phải đưa ra bàn, rung rung
      legL = legR = -1.45;
      bodyY = -0.02;
      armR = -1.45 + Math.sin(t * 25) * 0.05;
      armL = -0.4;
      headX = 0.1 + Math.sin(t * 20) * 0.03;
      break;
    case 'bow': // cúi chào đại ca
      headX = 0.55 + Math.sin(t * 3) * 0.15;
      armL = armR = 0.25;
      bob = -0.03;
      break;
    case 'squat': // ngồi xổm (đi bậy) — rặn rặn
      legL = legR = -1.55;
      legZ = 0.22;
      bodyY = -0.3 - Math.abs(Math.sin(t * 5)) * 0.02;
      armL = armR = -1.0;
      armLz = 0.25;
      armRz = -0.25;
      headX = 0.12 + Math.sin(t * 5) * 0.05;
      break;
    case 'pee': // đứng quay mặt vào tường, run run lúc xong
      armL = armR = -0.45;
      armLz = -0.1;
      armRz = 0.1;
      headX = -0.25;
      bob = Math.sin(t * 22) * 0.006;
      break;
    case 'carry': // vác người qua đầu — chân vẫn bước nếu đang đi
      if (s.speed > 0.1) {
        char.phase += dt * (4 + s.speed * 2.2);
        legL = Math.sin(char.phase) * 0.55;
        legR = -legL;
        bob = Math.abs(Math.sin(char.phase)) * 0.04;
      }
      armL = armR = -2.95;
      armLz = 0.18;
      armRz = -0.18;
      break;
    case 'kick': // bị vác / cắm đầu trong thùng rác: hai chân giãy, hai tay vẫy loạn (dọc thân, không xuyên vỏ thùng)
      legL = Math.sin(t * 14) * 0.9;
      legR = -legL;
      armL = Math.sin(t * 11) * 0.45;
      armR = -armL;
      armLz = 0.05;
      armRz = -0.05;
      break;
    case 'laugh': // ôm bụng cười
      armL = armR = -0.55;
      armLz = -0.35;
      armRz = 0.35;
      headX = -0.25 + Math.sin(t * 16) * 0.06;
      bob = Math.abs(Math.sin(t * 16)) * 0.05;
      break;
    case 'cover': // ôm đầu (diễn tập thoát hiểm / trú mưa)
      armL = armR = -2.55;
      armLz = -0.45;
      armRz = 0.45;
      headX = 0.15;
      bob = Math.abs(Math.sin(t * 9)) * 0.02;
      break;
    case 'pull': // kéo co: chân choãi, hai tay nắm dây phía trước, rung rung
      legL = 0.38;
      legR = -0.28;
      armL = armR = -1.3 + Math.sin(t * 13) * 0.05;
      armLz = -0.08;
      armRz = 0.08;
      headX = -0.18;
      bob = Math.abs(Math.sin(t * 13)) * 0.015;
      break;
    case 'pushup': // hít đất (events.js úp cả người xuống) — hai tay chống thẳng xuống sàn
      armL = armR = -1.4;
      armLz = 0.25;
      armRz = -0.25;
      break;
    case 'fall': // trượt vỏ chuối ngã ngửa: tay chân chới với
      armL = armR = -2.4 + Math.sin(t * 16) * 0.3;
      armLz = 0.6;
      armRz = -0.6;
      legL = -0.7;
      legR = -0.35;
      break;
    case 'pose': // chụp ảnh: tay phải giơ chữ V
      armR = -2.7;
      armRz = -0.35;
      armL = -0.2;
      headZ = 0.12;
      break;
    default: // idle
      armL = Math.sin(t * 1.8) * 0.05;
      armR = -armL;
      headZ = Math.sin(t * 0.7) * 0.05;
      bob = Math.sin(t * 2.2) * 0.01;
  }
  if (s.airborne) {
    legL = -0.5;
    legR = 0.3;
    armLz = 1.2;
    armRz = -1.2;
  }

  // rotation.set 1 lần/khớp (mỗi lần gán .x hay .z riêng là three.js tính lại quaternion 1 lần)
  const rot = (o, x, z) => o.rotation.set(lerp(o.rotation.x, x, k), 0, lerp(o.rotation.z, z, k));
  rot(char.legL.pivot, legL, -legZ);
  rot(char.legR.pivot, legR, legZ);
  rot(char.armL.pivot, armL, -armLz);
  rot(char.armR.pivot, armR, -armRz);
  rot(char.headPivot, headX, headZ);
  char.body.position.y = lerp(char.body.position.y, bob + bodyY, k);
}

/**
 * Cho nhân vật cầm đạo cụ ở tay phải.
 * @param {object} char
 * @param {'none'|'mic'|'bowl'|'fan'|'umbrella'|'mop'|'cup'|'basket'|'cake'} name
 */
export function setProp(char, name = 'none') {
  if (char.propName === name) return;
  const G = g();
  if (char.prop) char.armR.pivot.remove(char.prop);
  char.prop = null;
  char.propName = name;
  if (name === 'none') return;
  const p = new THREE.Group();
  p.position.set(0, -0.38, 0.04);
  const add = (geo, m, x, y, z, sx, sy, sz, rx = 0, rz = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    o.rotation.set(rx, 0, rz);
    p.add(o);
    return o;
  };
  switch (name) {
    case 'mic':
      add(G.cyl, mat(0x222222), 0, -0.05, 0.08, 0.05, 0.22, 0.05, Math.PI / 2);
      add(G.sphere, mat(0x9aa0a8, { rough: 0.3 }), 0, -0.05, 0.22, 0.12, 0.12, 0.12);
      break;
    case 'bowl':
      add(G.cyl, mat(0xffffff, { rough: 0.5 }), 0, -0.06, 0.12, 0.3, 0.12, 0.3);
      add(G.cyl, mat(0xf2b45a), 0, 0.0, 0.12, 0.26, 0.02, 0.26);
      break;
    case 'cup':
      add(G.cyl, mat(0x7fc8ff, { rough: 0.2 }), 0, -0.04, 0.1, 0.12, 0.2, 0.12);
      break;
    case 'fan':
      add(G.box, mat(0x8b5a2b), 0, -0.1, 0.05, 0.03, 0.2, 0.03);
      add(G.sphere, mat(0xe5483d), 0, -0.3, 0.05, 0.36, 0.3, 0.04);
      break;
    case 'umbrella':
      add(G.cyl, mat(0x333333), 0, -0.05, 0.05, 0.025, 1.1, 0.025, Math.PI);
      add(G.cone, mat(0xffcf3f, { rough: 0.6 }), 0, -0.68, 0.05, 1.1, 0.35, 1.1, Math.PI);
      break;
    case 'mop':
      add(G.cyl, mat(0x8b5a2b), 0, -0.25, 0.1, 0.03, 0.9, 0.03, 0.6);
      add(G.box, mat(0xd7d7d7), 0, -0.62, 0.38, 0.28, 0.08, 0.12, 0.6);
      break;
    case 'cake': // 🎂 bánh kem trên đĩa
      add(G.cyl, mat(0xffffff, { rough: 0.4 }), 0, -0.08, 0.16, 0.42, 0.03, 0.42);
      add(G.cyl, mat(0xfff3e0, { rough: 0.7 }), 0, 0.0, 0.16, 0.32, 0.16, 0.32);
      add(G.cyl, mat(PINK, { rough: 0.6 }), 0, 0.09, 0.16, 0.33, 0.04, 0.33);
      add(G.sphere, mat(0xd81e3a, { rough: 0.3 }), 0, 0.14, 0.16, 0.07, 0.07, 0.07);
      break;
    case 'basket':
      add(G.cyl, mat(0xb07a3a, { rough: 0.9 }), 0, -0.12, 0.12, 0.38, 0.22, 0.28);
      add(G.sphere, mat(0xe5483d), -0.06, 0.0, 0.12, 0.1, 0.1, 0.1);
      add(G.sphere, mat(0xf2c230), 0.07, 0.0, 0.1, 0.1, 0.1, 0.1);
      break;
    default:
      return;
  }
  char.prop = p;
  char.armR.pivot.add(p);
}

/**
 * Thú cưng / chó nghiệp vụ dựng từ khối hình học.
 * @param {'dog'|'cat'} kind
 */
export function createAnimal(kind = 'dog') {
  const G = g();
  const dog = kind === 'dog';
  const fur = mat(dog ? 0x5a3a22 : 0xf2a65a);
  const dark = mat(dog ? 0x2b1d12 : 0xd9822b);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const s = dog ? 1 : 0.7;
  const blob = new THREE.Mesh(G.shadow, blobMaterial());
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.012;
  blob.scale.setScalar(s * 1.1);
  root.add(blob);
  const torso = mesh(G.sphere, fur, 0, 0.42 * s, 0);
  torso.scale.set(0.42 * s, 0.38 * s, 0.75 * s);
  torso.castShadow = true;
  body.add(torso);
  const head = new THREE.Group();
  head.position.set(0, 0.62 * s, 0.38 * s);
  body.add(head);
  const skull = mesh(G.sphere, fur, 0, 0, 0);
  skull.scale.setScalar(0.42 * s);
  head.add(skull);
  const snout = mesh(G.sphere, dog ? mat(0x8a6a4a) : mat(0xfff1e0), 0, -0.05 * s, 0.18 * s);
  snout.scale.set(0.2 * s, 0.15 * s, 0.2 * s);
  head.add(snout);
  head.add(mesh(G.eye, mat(0x111111), -0.09 * s, 0.05 * s, 0.17 * s), mesh(G.eye, mat(0x111111), 0.09 * s, 0.05 * s, 0.17 * s));
  const nose = mesh(G.small, mat(0x111111), 0, -0.02 * s, 0.28 * s);
  nose.scale.setScalar(0.6 * s);
  head.add(nose);
  for (const sx of [-1, 1]) {
    const ear = mesh(dog ? G.sphere : G.crownSpike, dark, sx * 0.15 * s, 0.17 * s, -0.02 * s);
    if (dog) ear.scale.set(0.1 * s, 0.22 * s, 0.08 * s);
    else ear.scale.setScalar(1.1 * s);
    ear.rotation.z = sx * (dog ? 0.5 : -0.25);
    head.add(ear);
  }
  if (dog) {
    const vest = mesh(G.sphere, mat(0x27355a), 0, 0.47 * s, 0);
    vest.scale.set(0.44 * s, 0.33 * s, 0.45 * s);
    body.add(vest);
  }
  const legs = [];
  for (const [x, z] of [[-0.14, 0.22], [0.14, 0.22], [-0.14, -0.22], [0.14, -0.22]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x * s, 0.3 * s, z * s);
    const leg = mesh(G.cyl, dark, 0, -0.15 * s, 0);
    leg.scale.set(0.09 * s, 0.3 * s, 0.09 * s);
    pivot.add(leg);
    body.add(pivot);
    legs.push(pivot);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.5 * s, -0.36 * s);
  const tailMesh = mesh(G.cyl, fur, 0, 0.14 * s, 0);
  tailMesh.scale.set(0.05 * s, 0.3 * s, 0.05 * s);
  tail.add(tailMesh);
  tail.rotation.x = -0.6;
  body.add(tail);
  return { root, body, head, legs, tail, kind, phase: 0, t: Math.random() * 10 };
}

/** Hoạt ảnh chó/mèo: đi (speed > 0.1) hoặc ngồi vẫy đuôi. */
export function animateAnimal(a, dt, speed) {
  a.t += dt;
  const moving = speed > 0.1;
  if (moving) a.phase += dt * (6 + speed * 2.5);
  const sw = moving ? Math.sin(a.phase) * 0.6 : 0;
  a.legs[0].rotation.x = sw;
  a.legs[3].rotation.x = sw;
  a.legs[1].rotation.x = -sw;
  a.legs[2].rotation.x = -sw;
  a.tail.rotation.z = Math.sin(a.t * (moving ? 10 : 6)) * 0.5;
  a.body.position.y = moving ? Math.abs(Math.sin(a.phase)) * 0.04 : 0;
  a.head.rotation.x = moving ? 0 : Math.sin(a.t * 0.8) * 0.1;
}
