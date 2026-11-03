/**
 * Procedural chibi creator: big round head, small body, short limbs, outfits,
 * hats and hand-held props (mic, lightstick, headset, clipboard).
 * Built from primitives with shared geometries/materials so 80+ characters stay cheap.
 */
import * as THREE from 'three';

const SKIN = 0xf8d0aa;
const SHOE = 0x2f2a28;
export const HAIR_COLORS = { brown: 0x6e4325, black: 0x2b221d, blonde: 0xe3b65c, gray: 0xbdbdbd, pink: 0xff8fc8, blue: 0x5aa9ff, silver: 0xe4e7ee, red: 0xd6463a };
export const HAT_COLORS = { red: 0xe5483d, white: 0xf4f4f4, cap: 0x2f6df0, crown: 0xffc93a };

/** top / legs colours plus an optional belt colour. */
export const OUTFITS = {
  hoodie: { top: 0x5b6cff, legs: 0x2b2f3a },
  tee: { top: 0xf6f6f6, legs: 0x3a5a9a },
  street: { top: 0xff7a3d, legs: 0x26262c },
  idolPink: { top: 0xff6fb5, legs: 0xfafafa, belt: 0xffffff },
  idolWhite: { top: 0xf4f4f4, legs: 0xb9c6ff, belt: 0x9fb2ff },
  idolBlack: { top: 0x24242a, legs: 0x24242a, belt: 0xffc93a },
  idolRed: { top: 0xe33a4c, legs: 0x26262c, belt: 0xffffff },
  idolMint: { top: 0x5fe3c0, legs: 0xf4f4f4, belt: 0x2a9d7f },
  mcSuit: { top: 0xd23c4b, legs: 0x1d1f27, belt: 0x111111 },
  tech: { top: 0x2d3340, legs: 0x23272f },
  manager: { top: 0x3d4250, legs: 0x3d4250, belt: 0x111111 },
  gamer: { top: 0x31d0a0, legs: 0x22252c },
  singer: { top: 0xf2e2c4, legs: 0x7d5c40 },
  cozy: { top: 0xffb8d0, legs: 0xf4f4f4 },
  purple: { top: 0x8a5cf0, legs: 0x2b2f3a },
  yellow: { top: 0xffd23f, legs: 0x3a5a9a },
  // dance group uniforms
  boyOrange: { top: 0xff9f1c, legs: 0x26262c, belt: 0x111111 },
  boyWhite: { top: 0xf4f4f4, legs: 0x2b3a67, belt: 0xff9f1c },
  idolPurple: { top: 0xb36bff, legs: 0xf4f4f4, belt: 0xffc93a },
  idolCandy: { top: 0xff7ac0, legs: 0x7fe0ff, belt: 0xffe066 },
  idolSwan: { top: 0xf4f4f4, legs: 0x24242a, belt: 0x24242a },
};

const geo = {};
const mats = new Map();

function g() {
  if (geo.head) return geo;
  geo.head = new THREE.SphereGeometry(0.42, 24, 18);
  geo.eye = new THREE.SphereGeometry(0.048, 10, 8);
  geo.small = new THREE.SphereGeometry(0.06, 10, 8);
  geo.ear = new THREE.SphereGeometry(0.085, 10, 8);
  geo.torso = new THREE.CapsuleGeometry(0.25, 0.14, 6, 16);
  geo.arm = new THREE.CapsuleGeometry(0.075, 0.2, 4, 8);
  geo.leg = new THREE.CapsuleGeometry(0.095, 0.16, 4, 8);
  geo.hand = new THREE.SphereGeometry(0.075, 8, 6);
  geo.shoe = new THREE.SphereGeometry(0.11, 10, 8);
  geo.hair = new THREE.SphereGeometry(0.445, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  geo.fringe = new THREE.SphereGeometry(0.2, 12, 8);
  geo.backHair = new THREE.SphereGeometry(0.4, 20, 14);
  geo.tail = new THREE.SphereGeometry(0.15, 12, 10);
  geo.beanie = new THREE.SphereGeometry(0.465, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.4);
  geo.fold = new THREE.TorusGeometry(0.44, 0.07, 8, 24);
  geo.pom = new THREE.SphereGeometry(0.09, 10, 8);
  geo.capTop = new THREE.SphereGeometry(0.455, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.42);
  geo.brim = new THREE.CylinderGeometry(0.3, 0.3, 0.035, 20, 1, false, -Math.PI / 2, Math.PI);
  geo.crownRing = new THREE.CylinderGeometry(0.27, 0.29, 0.14, 18, 1, true);
  geo.crownSpike = new THREE.ConeGeometry(0.055, 0.14, 6);
  geo.belt = new THREE.CylinderGeometry(0.255, 0.255, 0.06, 18);
  geo.shadow = new THREE.CircleGeometry(0.38, 20);
  geo.micBody = new THREE.CylinderGeometry(0.026, 0.02, 0.2, 8);
  geo.micHead = new THREE.SphereGeometry(0.055, 10, 8);
  geo.stick = new THREE.CylinderGeometry(0.03, 0.03, 0.34, 8);
  geo.band = new THREE.TorusGeometry(0.46, 0.025, 6, 20, Math.PI);
  geo.cup = new THREE.CylinderGeometry(0.11, 0.11, 0.07, 14);
  geo.boom = new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6);
  geo.board = new THREE.BoxGeometry(0.22, 0.3, 0.025);
  return geo;
}

/** Cached standard material by colour. */
export function mat(color, opts = {}) {
  const key = `${color}|${opts.rough ?? 0.75}|${opts.emissive ?? 0}|${opts.metal ?? 0}`;
  if (!mats.has(key)) {
    mats.set(
      key,
      new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.75, metalness: opts.metal ?? 0, emissive: opts.emissive ?? 0 })
    );
  }
  return mats.get(key);
}

function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}

/**
 * Create a character.
 * @param {{outfit:string, hair:string, hat:string}} look
 */
// vòng bóng dưới chân dùng chung 1 material (trước đây mỗi nhân vật 1 cái, gỡ nhân vật không giải phóng → rò GPU)
let blobMat = null;

/**
 * Giải phóng phần riêng của 1 nhân vật khi gỡ hẳn (người xem rời tòa nhà): chỉ material lightstick là riêng,
 * geometry + material còn lại dùng chung (cache) nên KHÔNG được dispose.
 */
export function disposeCharacter(char) {
  char.root.parent?.remove(char.root);
  char.stickMat?.dispose();
  char.stickMat = null;
  // phụ kiện setExtras chỉ dùng geometry/material chung → không dispose, chỉ bỏ tham chiếu
  char.xp = null;
}

export function createCharacter(look) {
  const G = g();
  const root = new THREE.Group();
  const body = new THREE.Group(); // bob / sway / spin offset
  root.add(body);

  blobMat ??= new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
  const blob = new THREE.Mesh(G.shadow, blobMat);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.012;
  root.add(blob);

  const torso = mesh(G.torso, mat(0xffffff), 0, 0.66, 0);
  torso.castShadow = true;
  torso.scale.set(1.05, 1, 0.9);
  body.add(torso);

  const mkLimb = (geometry, x, y, len) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const limb = mesh(geometry, mat(0xffffff), 0, -len / 2, 0);
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
    face.add(cheek);
    face.add(mesh(G.ear, mat(SKIN, { rough: 0.6 }), sx * 0.41, -0.03, 0));
  }
  const mouth = mesh(G.small, mat(0x8a4a3a), 0, -0.17, 0.39);
  mouth.scale.set(0.55, 0.28, 0.3);
  face.add(mouth);

  const hairGroup = new THREE.Group();
  hairGroup.position.y = 0.36;
  headPivot.add(hairGroup);
  const hatGroup = new THREE.Group();
  hatGroup.position.y = 0.36;
  headPivot.add(hatGroup);

  // Props (hidden until setProps)
  const mic = new THREE.Group();
  mic.position.y = -0.36;
  mic.add(mesh(G.micBody, mat(0x1c1c1f, { rough: 0.4 }), 0, -0.08, 0));
  mic.add(mesh(G.micHead, mat(0xc9ccd2, { rough: 0.3, metal: 0.6 }), 0, -0.2, 0));
  mic.visible = false;
  armR.pivot.add(mic);

  const stickMat = new THREE.MeshStandardMaterial({ color: 0xff7ac0, emissive: 0xff4fa3, emissiveIntensity: 1.6, roughness: 0.4 });
  const stick = mesh(G.stick, stickMat, 0, -0.5, 0);
  stick.visible = false;
  armR.pivot.add(stick);

  const headset = new THREE.Group();
  headset.position.y = 0.36;
  const hsMat = mat(0x1d1f25, { rough: 0.5 });
  const band = mesh(G.band, hsMat);
  band.rotation.y = Math.PI / 2;
  band.rotation.z = 0;
  headset.add(band);
  for (const sx of [-1, 1]) {
    const cup = mesh(G.cup, mat(0x31d0a0, { emissive: 0x0a4a3a }), sx * 0.44, -0.02, 0);
    cup.rotation.z = Math.PI / 2;
    headset.add(cup);
  }
  const boom = mesh(G.boom, hsMat, -0.38, -0.2, 0.18);
  boom.rotation.x = Math.PI / 2.6;
  boom.rotation.z = 0.5;
  headset.add(boom);
  headset.visible = false;
  headPivot.add(headset);

  const clipboard = mesh(G.board, mat(0xf0e6c8), 0, -0.42, 0.06);
  clipboard.rotation.x = 0.3;
  clipboard.visible = false;
  armL.pivot.add(clipboard);

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
    belt,
    props: { mic, stick, headset, clipboard },
    stickMat,
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
  const o = OUTFITS[look.outfit] ?? OUTFITS.hoodie;
  char.torso.material = mat(o.top);
  char.legL.limb.material = char.legR.limb.material = mat(o.legs);
  char.armL.limb.material = char.armR.limb.material = mat(o.top);
  char.belt.visible = !!o.belt;
  if (o.belt) char.belt.material = mat(o.belt, { rough: 0.4, metal: o.belt === 0xffc93a ? 0.6 : 0 });

  char.hairGroup.clear();
  if (look.hair && look.hair !== 'bald') {
    const hm = mat(HAIR_COLORS[look.hair] ?? HAIR_COLORS.brown, { rough: 0.85 });
    const cap = mesh(G.hair, hm);
    cap.rotation.x = -0.42;
    const fringe = mesh(G.fringe, hm, 0.05, 0.3, 0.24);
    fringe.scale.set(1.3, 0.55, 0.8);
    fringe.rotation.z = 0.3;
    char.hairGroup.add(cap, fringe);
    // hair styles: short (default) | long | twin (pigtails) | bun
    const style = look.hairStyle ?? 'short';
    if (style === 'long') {
      const back = mesh(G.backHair, hm, 0, -0.2, -0.13);
      back.scale.set(1.08, 1.3, 0.78);
      char.hairGroup.add(back);
    } else if (style === 'twin') {
      for (const sx of [-1, 1]) {
        const tail = mesh(G.tail, hm, sx * 0.44, -0.12, -0.06);
        tail.scale.set(0.9, 1.7, 0.9);
        tail.rotation.z = sx * 0.35;
        char.hairGroup.add(tail);
      }
    } else if (style === 'bun') {
      const bun = mesh(G.tail, hm, 0, 0.4, -0.16);
      bun.scale.set(1.15, 1, 1.15);
      char.hairGroup.add(bun);
    }
  }

  char.hatGroup.clear();
  const hat = look.hat ?? 'none';
  if (hat === 'red' || hat === 'white') {
    const hm = mat(HAT_COLORS[hat], { rough: 0.95 });
    const tilt = new THREE.Group();
    tilt.rotation.x = -0.22;
    tilt.add(mesh(G.beanie, hm));
    const fold = mesh(G.fold, hm, 0, 0.145, 0);
    fold.rotation.x = Math.PI / 2;
    tilt.add(fold);
    tilt.add(mesh(G.pom, hm, 0, 0.47, 0));
    char.hatGroup.add(tilt);
  } else if (hat === 'cap') {
    const hm = mat(HAT_COLORS.cap, { rough: 0.8 });
    const tilt = new THREE.Group();
    tilt.rotation.x = -0.18;
    tilt.add(mesh(G.capTop, hm, 0, 0.02, 0));
    const brim = mesh(G.brim, hm, 0, 0.1, 0.32);
    brim.scale.set(1.1, 1, 1.25);
    tilt.add(brim);
    char.hatGroup.add(tilt);
  } else if (hat === 'crown') {
    const gold = mat(HAT_COLORS.crown, { rough: 0.25, metal: 0.8, emissive: 0x3a2800 });
    const c = new THREE.Group();
    c.position.y = 0.42;
    c.rotation.x = -0.12;
    c.add(mesh(G.crownRing, gold));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      c.add(mesh(G.crownSpike, gold, Math.sin(a) * 0.27, 0.13, Math.cos(a) * 0.27));
    }
    c.add(mesh(G.small, mat(0xff3b6b, { emissive: 0x550018 }), 0, 0.02, 0.29));
    char.hatGroup.add(c);
  }
  // đang đội vương miện lông vũ → giấu mũ thường + chỉnh vương miện theo kiểu tóc mới
  if (char.extras) applyVipHat(char);
}

/** Show/hide hand props. */
export function setProps(char, { mic = false, stick = false, headset = false, clipboard = false, stickColor } = {}) {
  char.props.mic.visible = mic;
  char.props.stick.visible = stick;
  char.props.headset.visible = headset;
  char.props.clipboard.visible = clipboard;
  if (stickColor !== undefined) {
    char.stickMat.color.set(stickColor);
    char.stickMat.emissive.set(stickColor);
  }
}

// ===== Phụ kiện thêm (setExtras) — dựng lười lần bật đầu, giữ group để bật/tắt lại; mọi geometry/material dùng chung =====
const EXTRA_DEFAULTS = Object.freeze({ vipHat: false, glasses: false, wings: false, splat: null, armband: null, scale: 1, aura: null });
const SPLATS = ['cake', 'egg', 'heart'];
const GOLD = { rough: 0.25, metal: 0.8, emissive: 0x3a2800 };
const xgeo = {};
let xmats = null; // material trong suốt/phát sáng dùng chung (mat() không có tuỳ chọn trong suốt)
const auraMats = new Map(); // màu → material vòng sáng

/** Sao n cánh, đỉnh hướng lên. */
function starShape(outer, inner, n = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = Math.PI / 2 + (i * Math.PI) / n;
    if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

function gx() {
  if (xgeo.star) return xgeo;
  // kính ngôi sao: tròng đặc + gọng sao rỗng ruột
  xgeo.star = new THREE.ShapeGeometry(starShape(0.104, 0.05));
  const frame = starShape(0.126, 0.063);
  frame.holes.push(starShape(0.1, 0.048));
  xgeo.starFrame = new THREE.ShapeGeometry(frame);
  xgeo.bridge = new THREE.CylinderGeometry(0.012, 0.012, 0.06, 6).rotateZ(Math.PI / 2);
  xgeo.temple = new THREE.BoxGeometry(0.018, 0.018, 0.41);
  // vương miện lông vũ: vành loe + chùm lông (cầu kéo dài, gốc ở y=0)
  xgeo.vipRing = new THREE.CylinderGeometry(0.31, 0.25, 0.11, 20, 1, true);
  xgeo.plume = new THREE.SphereGeometry(0.07, 10, 8).translate(0, 0.07, 0);
  // dính mặt: kem bánh / trứng ốp / tim
  xgeo.blob = new THREE.SphereGeometry(0.2, 18, 12);
  xgeo.eggWhite = new THREE.CylinderGeometry(0.19, 0.19, 0.022, 22).rotateX(Math.PI / 2);
  const h = new THREE.Shape();
  h.moveTo(0, 0.025);
  h.bezierCurveTo(0, 0.05, -0.05, 0.06, -0.06, 0.03);
  h.bezierCurveTo(-0.07, 0, -0.03, -0.03, 0, -0.06);
  h.bezierCurveTo(0.03, -0.03, 0.07, 0, 0.06, 0.03);
  h.bezierCurveTo(0.05, 0.06, 0, 0.05, 0, 0.025);
  xgeo.heart = new THREE.ExtrudeGeometry(h, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2, curveSegments: 8 }).center();
  // băng đội trưởng ôm bắp tay (vòng nằm ngang)
  xgeo.armband = new THREE.TorusGeometry(0.083, 0.024, 6, 18).rotateX(Math.PI / 2);
  // cánh tiên (cánh phải, gốc ở 0,0): thùy trên lớn + thùy dưới nhỏ
  const up = new THREE.Shape();
  up.moveTo(0, 0);
  up.bezierCurveTo(0.05, 0.25, 0.3, 0.55, 0.52, 0.5);
  up.bezierCurveTo(0.66, 0.46, 0.62, 0.25, 0.45, 0.15);
  up.bezierCurveTo(0.3, 0.06, 0.12, 0.02, 0, 0);
  xgeo.wingUp = new THREE.ShapeGeometry(up, 10);
  const low = new THREE.Shape();
  low.moveTo(0, 0);
  low.bezierCurveTo(0.15, -0.02, 0.36, -0.08, 0.38, -0.22);
  low.bezierCurveTo(0.39, -0.33, 0.24, -0.34, 0.15, -0.24);
  low.bezierCurveTo(0.08, -0.16, 0.03, -0.07, 0, 0);
  xgeo.wingLow = new THREE.ShapeGeometry(low, 10);
  // vòng sáng dưới chân: màu đỉnh mờ dần 2 mép (cộng màu → đen = trong suốt)
  const ring = new THREE.RingGeometry(0.3, 0.75, 40, 4).rotateX(-Math.PI / 2);
  const pos = ring.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    const b = Math.sin((Math.PI * (r - 0.3)) / 0.45) ** 2;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = b;
  }
  ring.setAttribute('color', new THREE.BufferAttribute(col, 3));
  xgeo.aura = ring;
  return xgeo;
}

function xm() {
  if (xmats) return xmats;
  const glow = (color, emissive, opacity, emissiveIntensity) =>
    new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity, roughness: 0.3, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
  xmats = {
    lens: glow(0xff5fb8, 0xff2f9a, 0.55, 0.72),
    wingUp: glow(0xbff3ff, 0x5fd6ff, 0.75, 0.6),
    wingLow: glow(0xffc4e6, 0xff7ac0, 0.75, 0.6),
  };
  return xmats;
}

function auraMat(color) {
  if (!auraMats.has(color)) {
    auraMats.set(
      color,
      new THREE.MeshBasicMaterial({ color, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    );
  }
  return auraMats.get(color);
}

function normExtras(e = {}) {
  const sc = Number(e.scale);
  return {
    vipHat: !!e.vipHat,
    glasses: !!e.glasses,
    wings: !!e.wings,
    splat: SPLATS.includes(e.splat) ? e.splat : null,
    armband: typeof e.armband === 'number' && Number.isFinite(e.armband) ? e.armband : null,
    scale: Number.isFinite(sc) && sc > 0 ? Math.min(2, Math.max(0.5, sc)) : 1,
    aura: typeof e.aura === 'number' && Number.isFinite(e.aura) ? e.aura : null,
  };
}

function buildVipHat(char) {
  const X = gx();
  const G = g();
  const wrap = new THREE.Group(); // tâm đầu
  wrap.position.y = 0.36;
  const crown = new THREE.Group();
  wrap.add(crown);
  const gold = mat(0xffc93a, GOLD);
  crown.add(mesh(X.vipRing, gold));
  // đá quý phía trước
  const gem = mesh(G.small, mat(0xff3b9a, { rough: 0.3, emissive: 0x5a0030 }), 0, -0.005, 0.285);
  gem.scale.set(1, 1, 0.6);
  crown.add(gem);
  for (const sx of [-1, 1]) {
    const a = sx * 0.6;
    const side = mesh(G.small, mat(0x5fe3ff, { rough: 0.3, emissive: 0x0d3a48 }), Math.sin(a) * 0.282, -0.005, Math.cos(a) * 0.282);
    side.scale.setScalar(0.6);
    crown.add(side);
  }
  // 5 chùm lông xòe ở nửa sau vành: hồng / xanh / trắng
  const fm = [
    mat(0xff7ac8, { rough: 0.9, emissive: 0x40102a }),
    mat(0x7fe8ff, { rough: 0.9, emissive: 0x0d3a48 }),
    mat(0xffffff, { rough: 0.9, emissive: 0x303030 }),
  ];
  const plan = [
    [-0.9, 0, 0.78],
    [-0.45, 1, 0.92],
    [0, 2, 1.05],
    [0.45, 1, 0.92],
    [0.9, 0, 0.78],
  ];
  for (const [off, ci, hgt] of plan) {
    const a = Math.PI + off;
    const pg = new THREE.Group();
    pg.position.set(Math.sin(a) * 0.29, 0.04, Math.cos(a) * 0.29);
    pg.rotation.y = a; // +z cục bộ hướng ra ngoài
    const p = mesh(X.plume, fm[ci]);
    p.scale.set(0.75, 2.6 * hgt, 0.35);
    p.rotation.x = 0.5; // ngả ra ngoài
    pg.add(p);
    crown.add(pg);
  }
  wrap.userData.crown = crown;
  char.headPivot.add(wrap);
  return wrap;
}

/** Bật/tắt vương miện lông vũ: giấu hatGroup, tóc búi thì nới vành ôm quanh búi. */
function applyVipHat(char) {
  const on = !!char.extras?.vipHat;
  char.hatGroup.visible = !on;
  const xp = (char.xp ??= {});
  if (on && !xp.vipHat) xp.vipHat = buildVipHat(char);
  if (!xp.vipHat) return;
  xp.vipHat.visible = on;
  if (!on) return;
  const look = char.look ?? {};
  const bun = look.hair && look.hair !== 'bald' && look.hairStyle === 'bun';
  const crown = xp.vipHat.userData.crown;
  crown.position.set(0, 0.43, bun ? -0.06 : -0.03);
  crown.scale.setScalar(bun ? 1.18 : 1);
}

function buildGlasses(char) {
  const X = gx();
  const gold = mat(0xffc93a, GOLD);
  const grp = new THREE.Group();
  grp.position.y = 0.36; // = nhóm mặt
  for (const sx of [-1, 1]) {
    const s = new THREE.Group();
    s.position.set(sx * 0.14, -0.02, 0.46);
    s.rotation.y = sx * 0.25; // ôm theo mặt cong
    s.add(mesh(X.starFrame, gold, 0, 0, 0.002), mesh(X.star, xm().lens, 0, 0, -0.002));
    grp.add(s);
    const tmp = mesh(X.temple, gold, sx * 0.34, 0.01, 0.245);
    tmp.rotation.y = -sx * 0.376;
    grp.add(tmp);
  }
  grp.add(mesh(X.bridge, gold, 0, 0.02, 0.485));
  char.headPivot.add(grp);
  return grp;
}

function buildWings(char) {
  const X = gx();
  const M = xm();
  const group = new THREE.Group();
  const mk = (sx) => {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.06, 0.78, -0.23); // lưng (−z)
    const w = new THREE.Group();
    w.scale.x = sx; // cánh trái = soi gương
    w.add(mesh(X.wingUp, M.wingUp), mesh(X.wingLow, M.wingLow));
    pivot.add(w);
    pivot.rotation.y = sx * 0.35;
    group.add(pivot);
    return pivot;
  };
  const r = mk(1);
  const l = mk(-1);
  char.body.add(group);
  return { group, l, r };
}

function buildSplat(char, kind) {
  const X = gx();
  const G = g();
  const grp = new THREE.Group();
  grp.position.y = 0.36; // tâm đầu
  if (kind === 'cake') {
    const cream = mat(0xfff6ea, { rough: 0.9 });
    const main = mesh(X.blob, cream, 0, -0.04, 0.36);
    main.scale.set(1.5, 1.2, 0.5);
    const pink = mesh(X.blob, mat(0xffa6c9, { rough: 0.8 }), 0.04, 0.04, 0.42);
    pink.scale.set(0.75, 0.5, 0.35);
    const cherry = mesh(G.small, mat(0xd81e3c, { rough: 0.3, emissive: 0x3a0010 }), 0.05, 0.12, 0.475);
    cherry.scale.setScalar(0.9);
    const stem = mesh(X.bridge, mat(0x3d7a2a), 0.07, 0.19, 0.475);
    stem.rotation.z = Math.PI / 2 - 0.4;
    grp.add(main, pink, cherry, stem);
    for (const [x, y, z] of [[-0.2, -0.24, 0.32], [0.1, -0.27, 0.34], [0.22, -0.18, 0.31]]) {
      const d = mesh(G.small, cream, x, y, z);
      d.scale.set(0.6, 1.1, 0.6);
      grp.add(d);
    }
  } else if (kind === 'egg') {
    const n = new THREE.Vector3(0.06, 0.12, 0.99).normalize();
    const egg = new THREE.Group();
    egg.position.copy(n).multiplyScalar(0.448);
    egg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    egg.rotateZ(0.35); // lệch xéo
    const white = mesh(X.eggWhite, mat(0xfffdf6, { rough: 0.5 }));
    white.scale.set(1.1, 0.9, 1);
    const yolk = mesh(X.blob, mat(0xffb81f, { rough: 0.3, emissive: 0x3a2200 }), 0.02, 0.01, 0.02);
    yolk.scale.set(0.42, 0.4, 0.22);
    egg.add(white, yolk);
    grp.add(egg);
  } else {
    // má hồng to + 3 tim bay vòng quanh đầu
    const rosy = mat(0xff6f9a, { rough: 0.9 });
    for (const sx of [-1, 1]) {
      const c = mesh(G.small, rosy, sx * 0.25, -0.12, 0.33);
      c.scale.set(1.6, 0.9, 0.45);
      grp.add(c);
    }
    const orbit = new THREE.Group();
    orbit.position.y = 0.46;
    const hm = mat(0xff5fa2, { rough: 0.4, emissive: 0x5a0f2e });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const ht = mesh(X.heart, hm, Math.sin(a) * 0.44, 0, Math.cos(a) * 0.44);
      ht.rotation.y = a;
      ht.scale.setScalar(1.2);
      orbit.add(ht);
    }
    grp.add(orbit);
    grp.userData.orbit = orbit;
  }
  char.headPivot.add(grp);
  return grp;
}

function buildArmband(char) {
  const X = gx();
  const grp = new THREE.Group();
  grp.position.y = -0.09; // bắp tay sát vai
  const band = mesh(X.armband, mat(0xffffff, { rough: 0.55 }));
  const star = mesh(X.star, mat(0xffc93a, GOLD), -0.0764, 0, 0.0764);
  star.rotation.y = -Math.PI / 4; // quay ra ngoài-trước
  star.scale.setScalar(0.4);
  grp.add(band, star);
  char.armL.pivot.add(grp);
  return { group: grp, band };
}

function buildAura(char) {
  const m = new THREE.Mesh(gx().aura, auraMat(0xffffff));
  m.position.y = 0.02;
  m.renderOrder = 1;
  char.root.add(m);
  return m;
}

/**
 * Gắn phụ kiện thêm cho nhân vật. Truyền TRỌN trạng thái mỗi lần (khoá thiếu = tắt);
 * gọi lại bao nhiêu lần cũng được — chỉ dựng/đổi phần khác với lần trước, phần tắt chỉ ẩn để dùng lại.
 * @param {object} char nhân vật từ createCharacter
 * @param {{vipHat?:boolean, glasses?:boolean, wings?:boolean, splat?:null|'cake'|'egg'|'heart',
 *          armband?:null|number, scale?:number, aura?:null|number}} [extras]
 *   vipHat = vương miện lông vũ (thay look.hat), glasses = kính ngôi sao, wings = cánh tiên,
 *   splat = thứ dính trên mặt sau khi bị ném, armband = màu băng đội trưởng (tay armL),
 *   scale = phóng to char.body (0.5..2), aura = màu vòng sáng dưới chân.
 * @returns {object} char.extras (đã chuẩn hoá)
 */
export function setExtras(char, extras = {}) {
  const prev = char.extras ?? EXTRA_DEFAULTS;
  const next = normExtras(extras ?? {});
  char.extras = next;
  const xp = (char.xp ??= {});

  if (next.vipHat !== prev.vipHat) applyVipHat(char);

  if (next.splat !== prev.splat) {
    xp.splat ??= {};
    for (const k of SPLATS) if (xp.splat[k]) xp.splat[k].visible = false;
    if (next.splat) (xp.splat[next.splat] ??= buildSplat(char, next.splat)).visible = true;
  }

  // kính bị kem/trứng che → ẩn (tránh 2 mặt chồng nhau nhấp nháy)
  const glassesOn = next.glasses && next.splat !== 'cake' && next.splat !== 'egg';
  if (glassesOn && !xp.glasses) xp.glasses = buildGlasses(char);
  if (xp.glasses) xp.glasses.visible = glassesOn;

  if (next.wings !== prev.wings) {
    if (next.wings && !xp.wings) xp.wings = buildWings(char);
    if (xp.wings) xp.wings.group.visible = next.wings;
  }

  if (next.armband !== prev.armband) {
    if (next.armband !== null && !xp.armband) xp.armband = buildArmband(char);
    if (xp.armband) {
      xp.armband.group.visible = next.armband !== null;
      if (next.armband !== null) xp.armband.band.material = mat(next.armband, { rough: 0.55 });
    }
  }

  if (next.aura !== prev.aura) {
    if (next.aura !== null && !xp.aura) xp.aura = buildAura(char);
    if (xp.aura) {
      xp.aura.visible = next.aura !== null;
      if (next.aura !== null) xp.aura.material = auraMat(next.aura);
    }
  }

  if (next.scale !== prev.scale) char.body.scale.setScalar(next.scale);
  return next;
}

/** Nhịp động của phụ kiện: cánh vỗ, tim xoay, vòng sáng thở. */
function animateExtras(char, dt, mode, t) {
  const xp = char.xp;
  if (xp.wings?.group.visible) {
    const f = mode === 'fly' ? Math.sin(t * 9) * 0.6 : Math.sin(t * 3) * 0.25;
    xp.wings.r.rotation.y = 0.35 + f;
    xp.wings.l.rotation.y = -(0.35 + f);
  }
  const hs = xp.splat?.heart;
  if (hs?.visible) {
    const orbit = hs.userData.orbit;
    orbit.rotation.y = (orbit.rotation.y + dt * 2.4) % (Math.PI * 2);
    orbit.children.forEach((h, i) => (h.position.y = Math.sin(t * 4 + i * 2.1) * 0.03));
  }
  if (xp.aura?.visible) xp.aura.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
}

const lerp = (a, b, k) => a + (b - a) * k;

/**
 * Pose the character for this frame.
 * @param {object} char
 * @param {number} dt
 * @param {{mode:string, speed:number, airborne?:boolean, beat?:number}} s
 *   beat = beats elapsed on the room's music clock (keeps a group in sync)
 */
export function animateCharacter(char, dt, s) {
  char.t += dt;
  const k = Math.min(1, dt * 12);
  const t = char.t;
  const beat = s.beat ?? t * 2;
  const bp = beat * Math.PI; // half a cycle per beat
  let legL = 0, legR = 0, armL = 0, armR = 0, armLz = 0.12, armRz = -0.12, legZ = 0;
  let bob = 0, bodyY = 0, headX = 0, headZ = 0, sway = 0, spin = 0, lean = 0;

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
      legL = legR = -1.45;
      armL = armR = -0.5;
      break;
    case 'game': {
      legL = legR = -1.45;
      armL = armR = -1.25 + Math.sin(t * 22) * 0.04;
      armLz = -0.25;
      armRz = 0.25;
      headX = 0.12 + Math.max(0, Math.sin(bp)) * 0.06;
      sway = Math.sin(t * 0.9) * 0.05;
      break;
    }
    case 'singSit':
    case 'sing': {
      if (s.mode === 'singSit') legL = legR = -1.45;
      armR = -2.1;
      armRz = 0.5;
      armL = -0.6 - Math.max(0, Math.sin(bp * 0.5)) * 0.9;
      armLz = 0.5 + Math.max(0, Math.sin(bp * 0.5)) * 0.6;
      sway = Math.sin(bp * 0.5) * 0.08;
      headZ = Math.sin(bp * 0.5) * 0.1;
      headX = -0.1;
      break;
    }
    case 'mc':
      armR = -2.1;
      armRz = 0.5;
      armL = -0.9 + Math.sin(t * 3) * 0.4;
      armLz = 0.7 + Math.sin(t * 2.2) * 0.3;
      headZ = Math.sin(t * 2.5) * 0.07;
      bob = Math.abs(Math.sin(bp)) * 0.03;
      break;
    case 'type':
      armL = armR = -1.15 + Math.sin(t * 20) * 0.05;
      armLz = -0.2;
      armRz = 0.2;
      headX = 0.25;
      break;
    case 'present': {
      const a = Math.sin(t * 2.4);
      armL = -0.7 - Math.max(0, a) * 0.7;
      armR = -0.7 - Math.max(0, -a) * 0.7;
      armLz = 0.4;
      armRz = -0.4;
      headZ = Math.sin(t * 1.7) * 0.08;
      bob = Math.abs(Math.sin(t * 2.4)) * 0.02;
      break;
    }
    case 'manager':
      armL = armR = -1.25;
      armLz = -0.95;
      armRz = 0.95;
      headX = Math.max(0, Math.sin(bp)) * 0.08;
      break;
    case 'clap': {
      const c = Math.abs(Math.sin(t * 9));
      armL = armR = -1.35;
      armLz = -0.05 - c * 0.45;
      armRz = -armLz;
      bob = c * 0.03;
      break;
    }
    case 'wave': {
      armRz = 2.5 + Math.sin(bp) * 0.45;
      armL = -0.4;
      bob = Math.abs(Math.sin(bp)) * 0.08;
      headZ = Math.sin(bp) * 0.06;
      break;
    }
    case 'dance1': {
      // arm pumps, knees bounce
      const up = Math.sin(bp);
      armL = -2.7 * Math.max(0, up);
      armR = -2.7 * Math.max(0, -up);
      armLz = 0.3;
      armRz = -0.3;
      legL = Math.max(0, up) * -0.5;
      legR = Math.max(0, -up) * -0.5;
      bob = Math.abs(up) * 0.12;
      headX = -Math.abs(up) * 0.1;
      break;
    }
    case 'dance2': {
      // side wave with body sway
      const w = Math.sin(bp * 0.5);
      armLz = 1.4 + Math.sin(bp) * 0.35;
      armRz = -(1.4 - Math.sin(bp) * 0.35);
      sway = w * 0.16;
      legZ = Math.abs(w) * 0.25;
      bob = Math.abs(Math.sin(bp)) * 0.06;
      headZ = -w * 0.12;
      break;
    }
    case 'dance3': {
      // hop and spin once every 4 beats
      const cyc = (beat % 4) / 4;
      spin = cyc < 0.25 ? (cyc / 0.25) * Math.PI * 2 : 0;
      bob = Math.abs(Math.sin(bp)) * 0.22;
      armLz = 2.4;
      armRz = -2.4;
      legL = -Math.abs(Math.sin(bp)) * 0.4;
      legR = legL;
      break;
    }
    case 'dance4': {
      // point up to alternating corners
      const side = Math.floor(beat) % 2 === 0 ? 1 : -1;
      if (side > 0) {
        armR = -2.6;
        armRz = -0.7;
        armL = -0.3;
        armLz = -0.6;
      } else {
        armL = -2.6;
        armLz = 0.7;
        armR = -0.3;
        armRz = 0.6;
      }
      sway = side * 0.1;
      headZ = side * 0.12;
      bob = Math.abs(Math.sin(bp)) * 0.05;
      legZ = 0.2;
      break;
    }
    case 'cheer':
      armLz = 2.6 + Math.sin(t * 10) * 0.3;
      armRz = -armLz;
      bob = Math.abs(Math.sin(t * 8)) * 0.12;
      break;
    case 'talk':
      armR = -0.6 + Math.sin(t * 6) * 0.25;
      headZ = Math.sin(t * 3) * 0.08;
      break;
    case 'hug':
      // 2 tay đưa ra trước ngang ngực, khép vào trong; hơi chúi người
      armL = armR = -1.5;
      armLz = -0.55;
      armRz = 0.55;
      lean = 0.1;
      sway = Math.sin(t * 1.6) * 0.06;
      headZ = Math.sin(t * 1.6) * 0.06;
      break;
    case 'fight': {
      // thủ thế quyền anh, đấm thẳng luân phiên theo nhịp
      const jab = Math.sin(bp);
      const jr = Math.max(0, jab) ** 2;
      const jl = Math.max(0, -jab) ** 2;
      armR = -1.85 + jr * 0.3;
      armL = -1.85 + jl * 0.3;
      armRz = 0.32 - jr * 0.27;
      armLz = -0.32 + jl * 0.27;
      legL = -0.22;
      legR = 0.18;
      legZ = 0.14;
      bob = Math.abs(Math.sin(bp * 2)) * 0.04;
      headX = 0.1;
      sway = jab * 0.05;
      lean = 0.06;
      break;
    }
    case 'fly':
      // dang tay 2 bên, chân buông ra sau; độ cao do bên gọi lo
      armLz = 1.5 + Math.sin(t * 6) * 0.2;
      armRz = -armLz;
      legL = 0.35 + Math.sin(t * 3) * 0.1;
      legR = 0.45 + Math.sin(t * 3 + 1) * 0.1;
      bob = Math.sin(t * 3) * 0.04;
      lean = 0.15;
      headX = -0.1;
      break;
    case 'cry':
      // thua: cúi gằm, vai xuôi, run run
      headX = 0.45;
      armL = armR = -0.15;
      armLz = -0.05;
      armRz = 0.05;
      bob = -0.03;
      lean = 0.1;
      sway = Math.sin(t * 18) * 0.03;
      headZ = Math.sin(t * 14) * 0.05;
      break;
    case 'heartPose':
      // giơ 2 tay lên ôm đầu thành hình tim
      armLz = 2.6;
      armRz = -2.6;
      armL = armR = 0.35;
      bob = Math.abs(Math.sin(bp)) * 0.04;
      headZ = Math.sin(bp * 0.5) * 0.06;
      break;
    case 'shake':
      // lắc hông nhanh, tay co
      sway = Math.sin(t * 22) * 0.14;
      spin = Math.sin(t * 22 + 1) * 0.22;
      armL = armR = -1.0;
      armLz = 0.6;
      armRz = -0.6;
      legZ = 0.12;
      bob = Math.abs(Math.sin(t * 11)) * 0.03;
      headZ = -sway * 0.6;
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
  char.body.rotation.z = lerp(char.body.rotation.z, sway, k);
  char.body.rotation.x = lerp(char.body.rotation.x, lean, k);
  // spin is set directly so the turn reads crisply
  char.body.rotation.y = spin ? spin : lerp(char.body.rotation.y, 0, k);
  if (char.xp) animateExtras(char, dt, s.mode, t);
}

/** Draw a tiny chibi face portrait to a canvas (HUD avatar). */
export function drawAvatar(canvas, look = { hair: 'brown', hat: 'none' }) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#ff4fa3');
  grad.addColorStop(1, '#7a5cff');
  ctx.fillStyle = grad;
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
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  const hairHex = look.hat && look.hat !== 'none' && look.hat !== 'crown'
    ? hex(HAT_COLORS[look.hat] ?? 0xe5483d)
    : hex(HAIR_COLORS[look.hair] ?? HAIR_COLORS.brown);
  ctx.fillStyle = hairHex;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.04, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fill();
  if (look.hat === 'crown') {
    ctx.fillStyle = '#ffc93a';
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.6, cy - r * 0.85);
    for (let i = 0; i <= 4; i++) {
      ctx.lineTo(cx - r * 0.6 + i * r * 0.3, cy - r * (i % 2 ? 1.05 : 1.45));
    }
    ctx.lineTo(cx + r * 0.6, cy - r * 0.85);
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
