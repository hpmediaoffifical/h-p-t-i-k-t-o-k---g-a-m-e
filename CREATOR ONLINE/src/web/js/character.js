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
export function createCharacter(look) {
  const G = g();
  const root = new THREE.Group();
  const body = new THREE.Group(); // bob / sway / spin offset
  root.add(body);

  const blob = new THREE.Mesh(G.shadow, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
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
  let bob = 0, bodyY = 0, headX = 0, headZ = 0, sway = 0, spin = 0;

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
  // spin is set directly so the turn reads crisply
  char.body.rotation.y = spin ? spin : lerp(char.body.rotation.y, 0, k);
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
