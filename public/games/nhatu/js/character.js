/**
 * Procedural chibi character: big round head, small body, short limbs.
 * Built from primitives with shared geometries/materials so 50+ characters stay cheap.
 */
import * as THREE from 'three';

const SKIN = 0xf8d0aa;
export const HAIR_COLORS = { brown: 0x6e4325, black: 0x2b221d, blonde: 0xe3b65c, gray: 0xbdbdbd };
export const HAT_COLORS = { red: 0xe5483d, white: 0xf4f4f4 };
const ORANGE = 0xf6a21e;
const GUARD_BLUE = 0x3f80d4;
const NAVY = 0x27355a;
const SHOE = 0x3a3330;

const geo = {};
const mats = new Map();
const numberTex = new Map();

function g() {
  if (geo.head) return geo;
  geo.head = new THREE.SphereGeometry(0.42, 28, 20);
  geo.eye = new THREE.SphereGeometry(0.048, 10, 8);
  geo.small = new THREE.SphereGeometry(0.06, 10, 8);
  geo.ear = new THREE.SphereGeometry(0.085, 10, 8);
  geo.torso = new THREE.CapsuleGeometry(0.25, 0.14, 6, 16);
  geo.arm = new THREE.CapsuleGeometry(0.075, 0.2, 4, 8);
  geo.leg = new THREE.CapsuleGeometry(0.095, 0.16, 4, 8);
  geo.hand = new THREE.SphereGeometry(0.075, 8, 6);
  geo.shoe = new THREE.SphereGeometry(0.11, 10, 8);
  geo.hair = new THREE.SphereGeometry(0.445, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
  geo.fringe = new THREE.SphereGeometry(0.2, 12, 8);
  geo.beanie = new THREE.SphereGeometry(0.465, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.4);
  geo.fold = new THREE.TorusGeometry(0.44, 0.07, 10, 28);
  geo.pom = new THREE.SphereGeometry(0.09, 10, 8);
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

/** Cached standard material by colour. */
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

function stripeMaterial(repeatY) {
  const key = `stripe${repeatY}`;
  if (mats.has(key)) return mats.get(key);
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f4f4';
  ctx.fillRect(0, 0, 16, 64);
  ctx.fillStyle = '#1f1f24';
  for (let y = 0; y < 64; y += 16) ctx.fillRect(0, y, 16, 8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, repeatY);
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
  mats.set(key, m);
  return m;
}

function numberMaterial(n) {
  if (numberTex.has(n)) return numberTex.get(n);
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 36;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 36);
  ctx.fillStyle = '#222';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 32, 19);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  numberTex.set(n, m);
  return m;
}

function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}

/**
 * Create a character.
 * @param {{outfit:'orange'|'stripe'|'guard', hair:string, hat:string, number?:number}} look
 */
export function createCharacter(look) {
  const G = g();
  const root = new THREE.Group();
  const body = new THREE.Group(); // bob / sit offset
  root.add(body);

  const blob = new THREE.Mesh(G.shadow, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.012;
  root.add(blob);

  const torso = mesh(G.torso, mat(ORANGE), 0, 0.66, 0);
  torso.castShadow = true;
  torso.scale.set(1.05, 1, 0.9);
  body.add(torso);

  const mkLimb = (geometry, x, y, len) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const limb = mesh(geometry, mat(ORANGE), 0, -len / 2, 0);
    pivot.add(limb);
    body.add(pivot);
    return { pivot, limb };
  };
  const legL = mkLimb(G.leg, -0.12, 0.4, 0.34);
  const legR = mkLimb(G.leg, 0.12, 0.4, 0.34);
  for (const leg of [legL, legR]) {
    const shoe = mesh(G.shoe, mat(SHOE), 0, -0.36, 0.03);
    shoe.scale.set(1, 0.6, 1.3);
    leg.pivot.add(shoe);
  }
  const armL = mkLimb(G.arm, -0.31, 0.88, 0.34);
  const armR = mkLimb(G.arm, 0.31, 0.88, 0.34);
  for (const arm of [armL, armR]) arm.pivot.add(mesh(G.hand, mat(SKIN), 0, -0.36, 0));

  const belt = mesh(G.belt, mat(0x222222), 0, 0.44, 0);
  belt.scale.set(1.05, 1, 0.9);
  belt.visible = false;
  body.add(belt);

  const patch = new THREE.Mesh(G.patch, numberMaterial(look.number ?? 1000));
  patch.position.set(0.08, 0.7, 0.232);
  body.add(patch);

  // Head
  const headPivot = new THREE.Group();
  headPivot.position.y = 0.94;
  body.add(headPivot);
  const head = mesh(G.head, mat(SKIN, { rough: 0.6 }), 0, 0.36, 0);
  head.castShadow = true;
  headPivot.add(head);
  const face = new THREE.Group();
  face.position.y = 0.36;
  headPivot.add(face);
  const eyeMat = mat(0x1b1b1b, { rough: 0.3 });
  face.add(mesh(G.eye, eyeMat, -0.14, -0.02, 0.39), mesh(G.eye, eyeMat, 0.14, -0.02, 0.39));
  const cheekMat = mat(0xf7a3a0, { rough: 0.9 });
  for (const sx of [-1, 1]) {
    const cheek = mesh(G.small, cheekMat, sx * 0.25, -0.12, 0.31);
    cheek.scale.set(1.1, 0.6, 0.4);
    cheek.castShadow = false;
    face.add(cheek);
    face.add(mesh(G.ear, mat(SKIN, { rough: 0.6 }), sx * 0.41, -0.03, 0));
  }
  const mouth = mesh(G.small, mat(0x8a4a3a), 0, -0.17, 0.39);
  mouth.scale.set(0.55, 0.28, 0.3);
  face.add(mouth);

  const glasses = new THREE.Group(); // kính đen đại ca
  const lensMat = mat(0x111111, { rough: 0.2 });
  for (const sx of [-1, 1]) {
    const lens = mesh(G.small, lensMat, sx * 0.14, -0.01, 0.4);
    lens.scale.set(1.9, 1.1, 0.35);
    glasses.add(lens);
  }
  const bridge = mesh(G.small, lensMat, 0, 0.01, 0.415);
  bridge.scale.set(1.2, 0.25, 0.25);
  glasses.add(bridge);
  glasses.visible = false;
  face.add(glasses);
  const armband = mesh(G.cyl, mat(0xe5483d), 0, -0.12, 0);
  armband.scale.set(0.17, 0.08, 0.17);
  armband.visible = false;
  armL.pivot.add(armband);
  const chain = mesh(G.chain, mat(0xf2c230, { rough: 0.25, emissive: 0x3a2a00 }), 0, 0.86, 0.02);
  chain.rotation.x = Math.PI / 2 - 0.25;
  chain.visible = false;
  body.add(chain);

  const hairGroup = new THREE.Group();
  hairGroup.position.y = 0.36;
  headPivot.add(hairGroup);
  const hatGroup = new THREE.Group();
  hatGroup.position.y = 0.36;
  headPivot.add(hatGroup);

  const char = {
    root,
    body,
    torso,
    legL,
    legR,
    armL,
    armR,
    headPivot,
    hairGroup,
    hatGroup,
    patch,
    belt,
    glasses,
    chain,
    armband,
    prop: null,
    propName: 'none',
    phase: Math.random() * 10,
    t: Math.random() * 10,
    look: null,
  };
  setLook(char, look);
  return char;
}

/** Re-skin a character (outfit, hair, hat). */
export function setLook(char, look) {
  const G = g();
  char.look = { ...look };
  const guard = look.outfit === 'guard';
  const stripe = look.outfit === 'stripe';
  const civil = look.outfit === 'civil'; // người thân đi thăm nuôi
  const chef = look.outfit === 'chef'; // 🧑‍🍳 đầu bếp: áo trắng, quần caro
  const nurse = look.outfit === 'nurse'; // 🩺 y tá: đồ trắng, quần hồng nhạt
  const white = mat(0xf7f7f7, { rough: 0.6 });
  const shirt = civil ? mat(look.shirt ?? 0xe86fa0) : null;
  char.torso.material = guard ? mat(GUARD_BLUE) : stripe ? stripeMaterial(4) : civil ? shirt : chef || nurse ? white : mat(ORANGE);
  const legMat = guard ? mat(NAVY) : stripe ? stripeMaterial(2) : civil ? mat(0x3a4a6b) : chef ? stripeMaterial(3) : nurse ? mat(0xf5c6d6) : mat(ORANGE);
  const armMat = guard ? mat(GUARD_BLUE) : stripe ? stripeMaterial(2) : civil ? shirt : chef || nurse ? white : mat(ORANGE);
  char.legL.limb.material = char.legR.limb.material = legMat;
  char.armL.limb.material = char.armR.limb.material = armMat;
  char.patch.visible = !guard && !stripe && !civil && !chef && !nurse;
  char.armband.visible = !!look.armband;
  char.belt.visible = guard;
  char.glasses.visible = !!look.boss;
  char.chain.visible = !!look.boss;

  char.hairGroup.clear();
  if (look.hair && look.hair !== 'bald') {
    const hm = mat(HAIR_COLORS[look.hair] ?? HAIR_COLORS.brown, { rough: 0.85 });
    const cap = mesh(G.hair, hm);
    cap.rotation.x = -0.42;
    const fringe = mesh(G.fringe, hm, 0.05, 0.3, 0.24);
    fringe.scale.set(1.3, 0.55, 0.8);
    fringe.rotation.z = 0.3;
    char.hairGroup.add(cap, fringe);
  }

  char.hatGroup.clear();
  if (guard) {
    const tilt = new THREE.Group();
    tilt.rotation.x = -0.12;
    const capMat = mat(0x2f62b3);
    tilt.add(mesh(G.capTop, capMat, 0, 0.36, 0));
    const brim = mesh(G.brim, mat(0x1d2a44), 0, 0.27, 0.12);
    brim.scale.set(1, 1, 1.2);
    tilt.add(brim);
    tilt.add(mesh(G.small, mat(0xf2c230, { emissive: 0x332200 }), 0, 0.38, 0.4));
    char.hatGroup.add(tilt);
  } else if (look.hat === 'chef') {
    const w = mat(0xffffff, { rough: 0.8 });
    const toque = new THREE.Group();
    toque.position.y = 0.3;
    const band = mesh(G.cyl, w, 0, 0.08, 0);
    band.scale.set(0.62, 0.22, 0.62);
    const puff = mesh(G.sphere, w, 0, 0.3, 0);
    puff.scale.set(0.78, 0.5, 0.78);
    toque.add(band, puff);
    char.hatGroup.add(toque);
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
    char.hatGroup.add(cap);
  } else if (look.hat === 'crown') {
    const gold = mat(0xf2c230, { rough: 0.25, emissive: 0x4a3300 });
    const crown = new THREE.Group();
    crown.position.y = 0.36;
    crown.add(mesh(G.crownBand, gold));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spike = mesh(G.crownSpike, gold, Math.sin(a) * 0.25, 0.17, Math.cos(a) * 0.25);
      crown.add(spike);
      const gem = mesh(G.small, mat([0xe5483d, 0x3fa0ff, 0x3bc26a][i % 3], { rough: 0.2 }), Math.sin(a) * 0.29, 0.03, Math.cos(a) * 0.29);
      gem.scale.setScalar(0.6);
      crown.add(gem);
    }
    char.hatGroup.add(crown);
  } else if (look.hat && look.hat !== 'none') {
    const hm = mat(HAT_COLORS[look.hat] ?? HAT_COLORS.red, { rough: 0.95 });
    const tilt = new THREE.Group();
    tilt.rotation.x = -0.22;
    tilt.add(mesh(G.beanie, hm));
    const fold = mesh(G.fold, hm, 0, 0.145, 0);
    fold.rotation.x = Math.PI / 2;
    tilt.add(fold);
    tilt.add(mesh(G.pom, hm, 0, 0.47, 0));
    char.hatGroup.add(tilt);
  }
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
    case 'sleep':
      legL = legR = -1.45;
      armL = armR = -0.3;
      headX = 0.45;
      headZ = Math.sin(t * 0.8) * 0.06;
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

  char.legL.pivot.rotation.x = lerp(char.legL.pivot.rotation.x, legL, k);
  char.legR.pivot.rotation.x = lerp(char.legR.pivot.rotation.x, legR, k);
  char.legL.pivot.rotation.z = lerp(char.legL.pivot.rotation.z, -legZ, k);
  char.legR.pivot.rotation.z = lerp(char.legR.pivot.rotation.z, legZ, k);
  char.armL.pivot.rotation.x = lerp(char.armL.pivot.rotation.x, armL, k);
  char.armR.pivot.rotation.x = lerp(char.armR.pivot.rotation.x, armR, k);
  char.armL.pivot.rotation.z = lerp(char.armL.pivot.rotation.z, -armLz, k);
  char.armR.pivot.rotation.z = lerp(char.armR.pivot.rotation.z, -armRz, k);
  char.headPivot.rotation.x = lerp(char.headPivot.rotation.x, headX, k);
  char.headPivot.rotation.z = lerp(char.headPivot.rotation.z, headZ, k);
  char.body.position.y = lerp(char.body.position.y, bob + bodyY, k);
}

/** Draw a tiny chibi face portrait to a canvas (HUD avatar). */
export function drawAvatar(canvas, look = { hair: 'brown', hat: 'none' }) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#7fb2ea';
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, w * 0.22);
  ctx.fill();
  const cx = w / 2;
  const cy = h * 0.58;
  const r = w * 0.34;
  ctx.fillStyle = '#f8d0aa';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  const hairHex = look.hat && look.hat !== 'none'
    ? '#' + (HAT_COLORS[look.hat] ?? 0xe5483d).toString(16).padStart(6, '0')
    : look.hair === 'bald' ? null : '#' + (HAIR_COLORS[look.hair] ?? HAIR_COLORS.brown).toString(16).padStart(6, '0');
  if (hairHex) {
    ctx.fillStyle = hairHex;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.04, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
  }
  ctx.fillStyle = '#1b1b1b';
  ctx.beginPath();
  ctx.arc(cx - r * 0.35, cy + r * 0.05, r * 0.11, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.35, cy + r * 0.05, r * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(247,140,140,.7)';
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.58, cy + r * 0.32, r * 0.14, r * 0.08, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + r * 0.58, cy + r * 0.32, r * 0.14, r * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Cho nhân vật cầm đạo cụ ở tay phải.
 * @param {object} char
 * @param {'none'|'mic'|'bowl'|'fan'|'umbrella'|'mop'|'cup'|'basket'} name
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
  const blob = new THREE.Mesh(G.shadow, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
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
