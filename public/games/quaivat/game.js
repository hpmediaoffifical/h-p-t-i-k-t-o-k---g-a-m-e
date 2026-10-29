/* ============================================================
   🧟 Zombie Phá Nhà — engine overlay (Three.js r160, vendor/)
   Zombie = streamer đi dọc đường tới phá cửa; người xem tặng quà gài bẫy/ném đồ/gọi đồng minh.
   Trong app: nhận gift/chat/like/social + gameConfig + gameCmd + quaivat:key qua socket.io.
   Mở file ngoài app: dùng TikFinity WebSocket + bảng ⚙ (phím P).
   ============================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { VILLAINS, HEROES, SOCIAL } from './gift-data.js';

const V3 = THREE.Vector3;
const Q = new URLSearchParams(location.search);
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

// =====================================================================
// CẤU HÌNH — chỉnh tại đây
// =====================================================================
const CONFIG = {
  wsUrl: Q.get('ws') || lsGet('qv_ws') || 'ws://localhost:21213/',
  streamerName: Q.get('name') || lsGet('qv_name') || 'Streamer',
  streamerAvatar: Q.get('avatar') || lsGet('qv_avatar') || '',
  roundSeconds: Number(lsGet('qv_round')) || 180, // thời gian mỗi ván: hết giờ quái chưa phá được cửa → người xem thắng
  doorHp: Number(lsGet('qv_dhp')) || 600,      // máu cửa nhà
  monsterSpeed: 1.35,     // m/giây (zombie lê chậm — nhanh hơn chút cho đỡ sốt ruột)
  punchDmg: 40,           // sát thương mỗi cú đấm (vào vật cản / cửa)
  punchEvery: 0.75,       // giây giữa 2 cú đấm
  winTarget: 20,
  likePer: 100,           // thả tim: cộng dồn cả phòng, đủ bấy nhiêu tim → 1 cục đá
  commentKey: '111',      // bình luận có chứa từ khóa này mới ném dép ('' = mọi bình luận)
  timerOn: Q.get('timer') === '1' || lsGet('qv_timer') === '1',   // đồng hồ mỗi ván — mặc định TẮT: chơi tới khi zombie phá được cửa
  checkpoint: lsGet('qv_cp') !== '0',      // cột mốc giữa đường: zombie qua mốc rồi thì không bị đẩy lùi quá mốc
  zombieModel: Q.get('zm') || lsGet('qv_zm') || 'basic',   // basic | chubby | arm | ribcage | classic (zombie dựng tay)
  shieldHits: 8,          // khiên cửa chịu được bấy nhiêu đòn rồi vỡ
  lockJump: Q.get('nojump') === '1' || lsGet('qv_lockJump') === '1',      // khóa nhảy (Space)
  lockForward: Q.get('nofwd') === '1' || lsGet('qv_lockFwd') === '1',    // khóa tiến tới: chỉ đi ngang
  monsterColor: 0x8a4dff,
  mineCount: 7,           // số mìn đất đặt ngẫu nhiên mỗi ván
  windSeconds: 6,         // hoa gió thổi trong N giây
  windPush: 1.8,          // sức gió đẩy lùi (m/giây)
  xbarrelChance: 0.25,    // tỉ lệ thùng gỗ (Hoa hồng) là thùng thuốc nổ
};
function actionByCoins(c) {
  if (c >= 1000) return 'quake';
  if (c >= 500) return 'hand';
  if (c >= 200) return pick(['boulder', 'meteor']);
  if (c >= 150) return 'lightning';
  if (c >= 99) return 'lightning';                       // bóng bay giờ là quà CỨU zombie → không tự quy vào phe chặn
  if (c >= 25) return pick(['bomb', 'crows']);
  if (c >= 15) return pick(['fox', 'crows']);
  if (c >= 10) return pick(['flower', 'bees']);
  if (c >= 5) return pick(['repair', 'net']);
  return pick(['rose', 'barrel', 'xbarrel', 'trap', 'tire', 'slime', 'banana']);
}

// =====================================================================
// Tiện ích
// =====================================================================
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = a => a[Math.floor(Math.random() * a.length)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function colorFor(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return `hsl(${h},65%,48%)`; }
function avatarEl(user, cls) {
  const d = document.createElement('div'); d.className = 'av' + (cls ? ' ' + cls : '');
  d.style.background = colorFor(user.name);
  d.textContent = (String(user.name || '?').trim().charAt(0) || '?').toUpperCase();
  if (user.avatar) {
    const img = new Image(); img.referrerPolicy = 'no-referrer';
    img.onload = () => { d.textContent = ''; d.appendChild(img); };
    img.src = user.avatar;
  }
  return d;
}
function ctex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
function speckle(g, w, h, colors, n, s0, s1) {
  for (let i = 0; i < n; i++) { g.globalAlpha = rand(0.08, 0.3); g.fillStyle = pick(colors); const s = rand(s0, s1); g.fillRect(Math.random() * w, Math.random() * h, s, s); }
  g.globalAlpha = 1;
}
const geoCache = new Map();
const geo = (k, f) => { if (!geoCache.has(k)) geoCache.set(k, f()); return geoCache.get(k); };
const msCache = new Map();
function MS(color, rough = 0.85, metal = 0, extra) {
  const k = color + '|' + rough + '|' + metal + '|' + (extra ? JSON.stringify(extra) : '');
  if (!msCache.has(k)) msCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, envMapIntensity: 0.35, ...(extra || {}) }));
  return msCache.get(k);
}
const GBOX = new THREE.BoxGeometry(1, 1, 1), GSPH = new THREE.SphereGeometry(1, 20, 14);
function put(m, x, y, z, parent, shadow = true) { m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; if (parent) parent.add(m); return m; }
function box(w, h, d, mat, x = 0, y = 0, z = 0, parent) { const m = new THREE.Mesh(GBOX, mat); m.scale.set(w, h, d); return put(m, x, y, z, parent); }
function sph(r, mat, x = 0, y = 0, z = 0, parent) { const m = new THREE.Mesh(GSPH, mat); m.scale.setScalar(r); return put(m, x, y, z, parent); }
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, parent, seg = 16) { return put(new THREE.Mesh(geo(`cy${rt}_${rb}_${h}_${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), mat), x, y, z, parent); }
function blobGeo(detail, amp, seed = 0) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const p = g.attributes.position, v = new V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 1 + amp * (Math.sin(v.x * 4.1 + seed) + Math.sin(v.y * 5.3 + seed * 2) + Math.sin(v.z * 3.7 + seed * 3)) / 3;
    v.multiplyScalar(n); p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); return g;
}
// đo chiều cao model có khung xương (Box3 không đúng với SkinnedMesh)
function boneTop(model) { model.updateMatrixWorld(true); let m = 0; const v = new V3(); model.traverse(o => { if (o.isBone) { o.getWorldPosition(v); m = Math.max(m, v.y); } }); return m; }
// Viền nét kiểu hoạt hình: bản sao mặt sau phóng to một chút, tô màu nâu đậm
const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x1d130c, side: THREE.BackSide });
function addOutline(root, thick = 0.02, minR = 0.02) {
  root.updateMatrixWorld(true); const ws = new V3(), list = [];
  root.traverse(o => { if (o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && !o.userData.isOutline && !(o.material && o.material.transparent)) list.push(o); });
  for (const m of list) {
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    m.getWorldScale(ws); const bs = m.geometry.boundingSphere, r = bs.radius * Math.max(ws.x, ws.y, ws.z);
    if (r < minR || r > 3) continue;
    const k = 1 + thick / r, o = new THREE.Mesh(m.geometry, OUTLINE_MAT);
    o.userData.isOutline = true; o.castShadow = o.receiveShadow = false; o.scale.setScalar(k); o.position.copy(bs.center).multiplyScalar(1 - k);
    m.add(o);
  }
}
function b64ToBuf(b64) { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
function loadModel(name, url) {
  const loader = new GLTFLoader();
  if (window.GAME_MODELS && window.GAME_MODELS[name]) return new Promise((res, rej) => loader.parse(b64ToBuf(window.GAME_MODELS[name]), '', res, rej));
  return loader.loadAsync(url);
}

// =====================================================================
// Âm thanh tổng hợp
// =====================================================================
const AC = window.AudioContext ? new AudioContext() : null;
let soundOn = true;
const sfxLast = {};
function tone(f, dur, type = 'sine', vol = 0.12, slide = 0, delay = 0) {
  if (!AC || !soundOn || AC.state !== 'running') return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, freq = 0) {
  if (!AC || !soundOn || AC.state !== 'running') return;
  const n = Math.floor(AC.sampleRate * dur), b = AC.createBuffer(1, n, AC.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
  const s = AC.createBufferSource(), g = AC.createGain(); s.buffer = b; g.gain.value = vol;
  if (freq) { const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; s.connect(f).connect(g); } else s.connect(g);
  g.connect(AC.destination); s.start();
}
function sfx(name) {
  const now = performance.now(); if (now - (sfxLast[name] || 0) < 70) return; sfxLast[name] = now;
  ({
    whoosh: () => noise(0.25, 0.12, 900),
    thud: () => { tone(120, 0.18, 'sine', 0.25, -60); noise(0.1, 0.12, 300); },
    punch: () => { noise(0.12, 0.3, 500); tone(90, 0.12, 'square', 0.08, -40); },
    crack: () => { noise(0.3, 0.3, 1800); tone(220, 0.2, 'sawtooth', 0.05, -150); },
    bonk: () => { tone(420, 0.12, 'triangle', 0.18, -250); },
    hit: () => { tone(180, 0.12, 'square', 0.1, -100); noise(0.08, 0.15, 700); },
    boom: () => { noise(0.9, 0.45, 0); tone(70, 0.6, 'sine', 0.4, -40); },
    pop: () => { noise(0.08, 0.35, 2500); tone(900, 0.06, 'square', 0.06, -500); },
    snap: () => { tone(1200, 0.05, 'square', 0.12, -800); noise(0.12, 0.25, 3000); },
    creak: () => tone(160, 0.35, 'sawtooth', 0.04, 90),
    heal: () => { tone(660, 0.12, 'sine', 0.09, 300); tone(990, 0.15, 'sine', 0.08, 200, 0.09); },
    power: () => { [440, 554, 659, 880].forEach((f, i) => tone(f, 0.12, 'square', 0.05, 0, i * 0.06)); },
    bite: () => { tone(500, 0.06, 'square', 0.07, -200); },
    beep: () => tone(660, 0.15, 'square', 0.08),
    step: () => tone(85, 0.07, 'sine', 0.05, -30),
    groan: () => { tone(rand(95, 130), 1.1, 'sawtooth', 0.045, -35); tone(rand(140, 170), 0.9, 'triangle', 0.03, -50, 0.15); },
    rumble: () => { noise(1.3, 0.18, 120); tone(55, 1.1, 'sawtooth', 0.04, -15); },
    thunder: () => { noise(0.25, 0.5, 2500); noise(1.6, 0.5, 0); tone(50, 1.2, 'sine', 0.35, -20); },
    wind: () => noise(0.6, 0.1, 600),
    pea: () => tone(620, 0.07, 'square', 0.04, -250),
    splat: () => { noise(0.12, 0.2, 900); tone(240, 0.08, 'triangle', 0.08, -120); },
    hiss: () => { noise(1.4, 0.1, 4500); tone(300, 1.4, 'sine', 0.03, 600); },
    go: () => tone(990, 0.4, 'square', 0.08),
    win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.28, 'triangle', 0.13, 0, i * 0.13)),
    lose: () => [400, 330, 260, 180].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.07, 0, i * 0.18)),
  }[name] || (() => {}))();
}
addEventListener('pointerdown', () => AC && AC.resume());
addEventListener('keydown', () => AC && AC.resume());

// =====================================================================
// Renderer / Scene
// =====================================================================
const RATIO = (() => { const r = Q.get('ratio') || '1:1'; if (r === 'full') return 0; const [a, b] = r.split(':').map(Number); return a / b || 0; })();
const gameEl = document.getElementById('game'), labelsEl = document.getElementById('labels');
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), 0.04).texture;
scene.background = ctex(4, 512, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#2f7fdc'); gr.addColorStop(0.45, '#6fb6f0'); gr.addColorStop(0.75, '#bfe2fb'); gr.addColorStop(1, '#e2f3ff');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
scene.fog = new THREE.Fog(0xcde8fb, 95, 330);
const camera = new THREE.PerspectiveCamera(58, 9 / 16, 0.1, 600);
// ?q=low: tắt hậu kỳ + cỏ dày cho máy yếu
const HQ = Q.get('q') !== 'low';
const WIND = { value: 0 };   // thời gian chung cho gió (cỏ, tán cây)
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1.14 }, uContrast: { value: 1.05 }, uVig: { value: 0.28 }, uTint: { value: new THREE.Vector3(1.02, 1.0, 0.97) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat, uContrast, uVig; uniform vec3 uTint; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec3 col = c.rgb;
      float l = dot(col, vec3(0.299, 0.587, 0.114)); col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uContrast + 0.5; col *= uTint;
      float v = smoothstep(0.95, 0.35, length(vUv - 0.5) * 1.35); col *= mix(1.0 - uVig, 1.0, v);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a); }`
};
let composer = null, bloomPass = null, gradePass = null, camBaseFov = 52, fovKick = 0, hitStop = 0;
if (HQ) {
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.55, 0.96); composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  composer.addPass(gradePass = new ShaderPass(GradeShader));
}
let GW = 1, GH = 1;
function resize() {
  const W = innerWidth, H = innerHeight;
  let w = W, h = H;
  if (RATIO) { h = W / RATIO; if (h > H) { h = H; w = H * RATIO; } }
  w = Math.floor(w); h = Math.floor(h);
  gameEl.style.width = w + 'px'; gameEl.style.height = h + 'px';
  gameEl.style.fontSize = (Math.min(w, h * 0.75) / 28) + 'px';
  renderer.setSize(w, h, false); camera.aspect = w / h; if (composer) composer.setSize(w, h);
  camBaseFov = camera.aspect < 0.85 ? 60 : 52; camera.fov = camBaseFov; camera.updateProjectionMatrix(); GW = w; GH = h;
}
addEventListener('resize', resize);

const hemi = new THREE.HemisphereLight(0xd6ecff, 0x4d7a2a, 0.45); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 3.0);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 120 });
const fill = new THREE.DirectionalLight(0xbcd6ff, 0.55); fill.position.set(-14, 9, -24); scene.add(fill);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// =====================================================================
// Thế giới: đường nhựa, vỉa hè, đường cỏ caro, hàng rào, cây, nhà
// =====================================================================
const START_Z = 7;        // điểm xuất phát (trên lòng đường nhựa, như clip gốc)
const MON_H = 1.85;       // chiều cao zombie
const HS = 0.74;          // tỉ lệ ngôi nhà (cửa cao ~2.3m → người cao ~80% cửa như ngoài đời)
let HOUSE_FRONT = -88;    // mặt trước ngôi nhà (đổi theo độ dài map)
// ===== CÁC MAP: mỗi map dài hơn, đổi khung cảnh + chướng ngại riêng (thêm map mới vào đây) =====
const MAPS = [
  { name: 'Vườn Xanh', length: 90, mines: 7, prop: 'rock', props: 4,
    sky: ['#2f7fdc', '#6fb6f0', '#bfe2fb', '#e2f3ff'], fog: 0xcde8fb, sun: 0xfff0d8, sunI: 2.8, hemi: [0xd6ecff, 0x4d7a2a, 0.45],
    lawn: '#6db53e', lawnSp: ['#4f9a2a', '#8fd25a', '#5ea835'], laneA: '#a5d96a', laneB: '#86c550', blade: ['50,110,25', '230,255,190'],
    hedge: [0x3f8a2a, 0x4a9a32, 0x3a7f26, 0x52a538], hedgeCore: 0x2f6e22, tree: [0x4f9e2f, 0x5bb337, 0x3f8a28, 0x6cc040, 0x4a9a35], trunk: 0x6b4527,
    hill: [0x78c060, 0x6db455, 0x84c86a], mtn: 0x86a6cf, flowers: [0xffffff, 0xfff27a, 0xff9ec4, 0xc9a7ff],
    wall: '#efe3c6', roof: ['#8e2a1a', '#d9573a', '#c84a30', '#7c2214'], sunflowers: true },
  { name: 'Mùa Thu', style: 'autumn', length: 110, mines: 9, prop: 'pumpkin', props: 7, haz: 'leafpile', hazN: 6,
    sky: ['#4a7fc4', '#8fb9e0', '#f2d7b0', '#f8e6c8'], fog: 0xf0dcc0, sun: 0xffd9a0, sunI: 2.6, hemi: [0xffe6c4, 0x7a5a2a, 0.5],
    lawn: '#a39a3e', lawnSp: ['#8a7f2a', '#c4b45a', '#9a6a2a'], laneA: '#cdc56c', laneB: '#b0a54e', blade: ['110,90,25', '255,240,190'],
    hedge: [0x8a7a2a, 0x9a6a20, 0x7a8a2a, 0xa0782a], hedgeCore: 0x5e5a1e, tree: [0xe07a2a, 0xd4a020, 0xc0502a, 0xe8b040, 0xb83a1e], trunk: 0x5a3a20,
    hill: [0xb0a050, 0xc09040, 0xa08a40], mtn: 0x9a8fb0, flowers: [0xffb040, 0xff7a3a, 0xffe07a, 0xc0502a],
    wall: '#f3dcc0', roof: ['#5a2e1a', '#a0603a', '#8a4e2a', '#4a2412'], sunflowers: true },
  { name: 'Xứ Tuyết', style: 'snow', length: 130, mines: 11, prop: 'snowman', props: 8, dust: 0xf4f8ff, haz: 'ice', hazN: 7,
    sky: ['#6a88b0', '#a9bfd8', '#dfe8f2', '#f2f6fa'], fog: 0xe6eef6, sun: 0xeef4ff, sunI: 2.2, hemi: [0xeef4ff, 0x9aa8b8, 0.7],
    lawn: '#eef3f8', lawnSp: ['#d6e0ea', '#ffffff', '#c8d4e2'], laneA: '#f4f8fc', laneB: '#dbe6f1', blade: ['150,170,200', '255,255,255'],
    hedge: [0x2f5a40, 0x3a6a4a, 0xe8eef5, 0xdfe7f0], hedgeCore: 0x2a4a38, tree: [0x2e6b4a, 0x3a7a55, 0xeef3f8, 0xffffff], trunk: 0x4a3426,
    hill: [0xf2f6fa, 0xe4ecf4, 0xdde6f0], mtn: 0xb8c8de, flowers: [0xffffff, 0xd8ecff, 0xbfe0ff],
    wall: '#e9e4dc', roof: ['#aab8c8', '#ffffff', '#eef3f8', '#9aa8b8'], sunflowers: false },
  { name: 'Nghĩa Trang Đêm', style: 'haunted', length: 140, prop: 'grave', props: 9, side: true, haz: 'ghosthand', hazN: 7, dyn: ['crows'], dynEvery: 26, night: true, dust: 0x9a9aa8,
    fogNear: 55, fogFar: 230, tint: [0.95, 0.98, 1.12], glow: [0.7, 0.8, 1.0], clouds: 0.18,
    sky: ['#070a1e', '#141a3c', '#2c2a52', '#3e3560'], fog: 0x262a44, sun: 0xa8bcff, sunI: 1.5, hemi: [0x7a88d0, 0x1c1c2c, 0.75],
    lawn: '#33422a', lawnSp: ['#28361f', '#46563a', '#3a3a2a'], laneA: '#55663f', laneB: '#465533', blade: ['25,35,18', '150,170,130'],
    hedge: [0x24321f, 0x2c3a26, 0x1f2a1c, 0x34402a], hedgeCore: 0x161f14, tree: [0x2a3424, 0x343a2a, 0x22301f, 0x3a3226], trunk: 0x2e2219,
    hill: [0x252e24, 0x2c3329, 0x20281f], mtn: 0x323a58, flowers: [0xb080ff, 0x80ffc0, 0xe8e8ff],
    wall: '#b9b2c6', roof: ['#221c30', '#4a3a60', '#3a2e4c', '#1a1426'], sunflowers: false },
  { name: 'Sa Mạc', style: 'adobe', length: 150, prop: 'cactus', props: 9, side: true, haz: 'quicksand', hazN: 6, dyn: ['tornado'], dynEvery: 14, dust: 0xe0c48a,
    tint: [1.04, 1.0, 0.94],
    sky: ['#3a7bd5', '#7fb3e8', '#f0d9a8', '#f6e3b8'], fog: 0xf0dcb0, sun: 0xfff0c8, sunI: 3.0, hemi: [0xfff0d0, 0xa08050, 0.5],
    lawn: '#d9b878', lawnSp: ['#c9a462', '#e8cc90', '#b8935a'], laneA: '#e6c88a', laneB: '#d4b274', blade: ['150,110,50', '255,240,200'],
    hedge: [0x8a9a40, 0x7a8a38, 0x9aa84a, 0x6a7a30], hedgeCore: 0x5a6a28, tree: [0x6a8a30, 0x7a9a3a, 0x5a7a2a, 0x8aa040], trunk: 0x8a6a40,
    hill: [0xe0c080, 0xd4b070, 0xc8a060], mtn: 0xc89a68, flowers: [0xff6a3a, 0xffd040, 0xff9ac0],
    wall: '#f0dcb4', roof: ['#8a4a1a', '#d08040', '#c07030', '#7a3a12'], sunflowers: false },
  { name: 'Núi Lửa', style: 'volcano', length: 165, prop: 'lavarock', props: 9, side: true, haz: 'lavacrack', hazN: 7, dyn: ['meteor1'], dynEvery: 6, dust: 0x5a4a44,
    fogNear: 70, fogFar: 260, tint: [1.08, 0.97, 0.92], glow: [1.0, 0.55, 0.3], clouds: 0.3,
    sky: ['#2a0e0a', '#5a1e10', '#a8401a', '#c86a30'], fog: 0x6a2a18, sun: 0xffa060, sunI: 2.3, hemi: [0xffa070, 0x3a1a10, 0.6],
    lawn: '#3a2a26', lawnSp: ['#2a1e1a', '#4a3630', '#5a2a1a'], laneA: '#54443c', laneB: '#433630', blade: ['40,20,15', '255,140,60'],
    hedge: [0x3a2a24, 0x4a3028, 0x2e2420, 0x553326], hedgeCore: 0x221814, tree: [0x2a2220, 0x3a2a24, 0x4a2a1a], trunk: 0x1e1612,
    hill: [0x3a2a26, 0x4a3028, 0x2e2220], mtn: 0x4a2418, flowers: [0xff6a20, 0xffb040, 0xff3a10],
    wall: '#cbb8a8', roof: ['#2a1a14', '#5a3022', '#4a281c', '#1e120e'], sunflowers: false },
  { name: 'Lâu Đài Hoang', length: 180, house: 'castle', doorMul: 2, winBonus: 3, warn: '🏰 MAP BOSS', prop: 'grave', props: 10, side: true, haz: ['ghosthand', 'lavacrack'], hazN: 9, dyn: ['meteor1', 'meteor1', 'meteor1', 'crows'], dynEvery: 10,
    night: true, dust: 0x8a8494,
    fogNear: 60, fogFar: 250, tint: [1.0, 0.95, 1.1], glow: [0.85, 0.8, 1.0], clouds: 0.25,
    sky: ['#120a24', '#2e1a46', '#5e3458', '#7e4458'], fog: 0x3a2a44, sun: 0xd0b0ff, sunI: 1.7, hemi: [0x9a88d0, 0x2a1a2a, 0.75],
    lawn: '#45452e', lawnSp: ['#383824', '#55553a', '#4a3a2a'], laneA: '#5e5c3e', laneB: '#4e4c32', blade: ['40,38,20', '170,160,120'],
    hedge: [0x2e3324, 0x262c1e, 0x343a28, 0x2a2420], hedgeCore: 0x1a1e14, tree: [0x3a3428, 0x2e2a22, 0x46402e, 0x2a3020], trunk: 0x2a2018,
    hill: [0x2e2a30, 0x26222a, 0x34303a], mtn: 0x3a2a4a, flowers: [0x9a6aff, 0xff6a6a, 0xd0d0ff],
    wall: '#8a8494', roof: ['#2a1e30', '#4a3658', '#3a2a48', '#1e1424'], sunflowers: false },
];
let T = MAPS[0];
const LANE = 5.3;         // giới hạn ngang của quái
const G = 22;             // trọng lực đồ vật bay
const greens = [0x4f9e2f, 0x5bb337, 0x3f8a28, 0x6cc040, 0x4a9a35];

function buildWorld() {
  // bãi cỏ nền
  const lawnTex = ctex(256, 256, (g, w, h) => {
    g.fillStyle = T.lawn; g.fillRect(0, 0, w, h);
    speckle(g, w, h, T.lawnSp, 3000, 1, 3);
  }, [120, 120]);
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: lawnTex, roughness: 1, envMapIntensity: 0.3 }));
  lawn.rotation.x = -Math.PI / 2; lawn.position.set(0, -0.02, -60); lawn.receiveShadow = true; world.add(lawn);

  // đường cỏ caro (mỗi ô 2m)
  const laneTex = ctex(1024, 1024, (g) => {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? T.laneB : T.laneA; g.fillRect(i * 512, j * 512, 512, 512);
      for (let y = 0; y < 512; y += 16) { g.fillStyle = `rgba(255,255,255,${0.025 + 0.03 * Math.abs(Math.sin(y * 0.11 + i))})`; g.fillRect(i * 512, j * 512 + y, 512, 8); }   // vệt máy cắt cỏ
    }
    for (let k = 0; k < 52000; k++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      g.strokeStyle = Math.random() < 0.5 ? `rgba(${T.blade[0]},${rand(0.06, 0.2)})` : `rgba(${T.blade[1]},${rand(0.05, 0.16)})`;
      g.lineWidth = rand(1, 2); g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-2, 2), y - rand(3, 8)); g.stroke();
    }
  }, [3, (1 - HOUSE_FRONT) / 4]);
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(12, 1 - HOUSE_FRONT), new THREE.MeshStandardMaterial({ map: laneTex, bumpMap: laneTex, bumpScale: 0.6, roughness: 0.92, envMapIntensity: 0.3 }));
  lane.rotation.x = -Math.PI / 2; lane.position.set(0, 0.005, (HOUSE_FRONT + 1) / 2); lane.receiveShadow = true; world.add(lane);

  // vỉa hè + bó vỉa + đường nhựa
  const walkTex = ctex(128, 128, (g, w, h) => {
    g.fillStyle = '#d9d9d4'; g.fillRect(0, 0, w, h); speckle(g, w, h, ['#bdbdb6', '#efefe9'], 500, 1, 3);
    g.strokeStyle = 'rgba(90,90,85,.55)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
  }, [100, 1.5]);
  const walk = box(300, 0.14, 3.6, new THREE.MeshStandardMaterial({ map: walkTex, roughness: 0.9, envMapIntensity: 0.3 }), 0, 0.07, 2.8, world);
  walk.castShadow = false;
  box(300, 0.2, 0.25, MS(0xb8b8b2, 0.8), 0, 0.1, 4.7, world).castShadow = false;
  const asphalt = ctex(256, 256, (g, w, h) => { g.fillStyle = '#45484d'; g.fillRect(0, 0, w, h); speckle(g, w, h, ['#2e3034', '#5d6066', '#6b6e74'], 6000, 1, 2.5); }, [60, 2.5]);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(300, 12), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95, envMapIntensity: 0.3 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0.0, 10.8); road.receiveShadow = true; world.add(road);
  for (let x = -150; x < 150; x += 6) box(3, 0.02, 0.22, MS(0xf2f2ea, 0.6), x, 0.01, 11, world).castShadow = false;
  box(300, 0.2, 0.25, MS(0xb8b8b2, 0.8), 0, 0.1, 16.9, world);
  const walk2 = box(300, 0.14, 3.6, new THREE.MeshStandardMaterial({ map: walkTex, roughness: 0.9, envMapIntensity: 0.3 }), 0, 0.07, 18.8, world); walk2.castShadow = false;

  // hàng rào cây cắt tỉa: khối bo góc, vân lá, vài chùm lá nhô lên cho tự nhiên
  const leafTex = ctex(256, 256, (g, w, h) => {
    g.fillStyle = '#' + new THREE.Color(T.hedgeCore).getHexString(); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { g.fillStyle = '#' + new THREE.Color(pick(T.hedge)).offsetHSL(0, 0, rand(-0.06, 0.08)).getHexString(); g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, rand(3, 7), rand(2, 4), rand(0, 3.14), 0, 7); g.fill(); }
    for (let i = 0; i < 500; i++) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  }, [2, 1.2]);
  const hedgeMat = new THREE.MeshStandardMaterial({ map: leafTex, bumpMap: leafTex, bumpScale: 2.5, roughness: 0.92, envMapIntensity: 0.3 });
  const hedgeGeo = geo('hedgebox', () => new RoundedBoxGeometry(1.3, 1.35, 3.02, 3, 0.22));
  const segs = []; for (const sx of [-1, 1]) for (let z = HOUSE_FRONT + 3.5; z < 0.2; z += 3) segs.push([sx * 7, z]);
  const hedge = new THREE.InstancedMesh(hedgeGeo, hedgeMat, segs.length);
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), col = new THREE.Color();
  segs.forEach(([x, z], i) => { m4.compose(new V3(x, 0.675, z), qq.identity(), new V3(1, rand(0.97, 1.04), 1)); hedge.setMatrixAt(i, m4); hedge.setColorAt(i, col.setRGB(rand(0.92, 1.05), 1, rand(0.92, 1.02))); });
  hedge.castShadow = true; hedge.receiveShadow = true; world.add(hedge);
  const tufts = []; for (const sx of [-1, 1]) for (let z = HOUSE_FRONT + 2.2; z < 0.4; z += rand(1.2, 2.6)) tufts.push([sx * 7 + rand(-0.35, 0.35), rand(1.25, 1.38), z]);
  const tuft = new THREE.InstancedMesh(geo('tuft', () => blobGeo(1, 0.18, 3.3)), new THREE.MeshStandardMaterial({ map: leafTex, roughness: 0.92, envMapIntensity: 0.3 }), tufts.length);
  tufts.forEach((p, i) => { const r = rand(0.22, 0.38); m4.compose(new V3(...p), qq.setFromEuler(new THREE.Euler(rand(0, 6), rand(0, 6), 0)), new V3(r, r * 0.7, r)); tuft.setMatrixAt(i, m4); });
  tuft.castShadow = true; world.add(tuft);

  // cỏ thật: hàng chục nghìn ngọn cỏ đung đưa (ven đường + bãi ngoài hàng rào)
  if (HQ) {
    const bladeGeo = geo('blade', () => {
      const g = new THREE.BufferGeometry(), w = 0.05;
      g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, -w * 0.6, 0.5, 0.01, w * 0.6, 0.5, 0.01, 0, 1, 0.03], 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0.3, 0, 1, 0.3, 0, 1, 0.3, 0, 1, 0.3, 0, 1, 0.3], 3));
      g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]); return g;
    });
    const spots = [];
    const zA = HOUSE_FRONT - 12, zB = 1;
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 2600; i++) spots.push([sx * rand(6.02, 6.42), rand(zA + 12, zB)]);                       // dải cỏ ven đường
      for (let i = 0; i < 14000; i++) { const t = Math.pow(Math.random(), 1.8); spots.push([sx * (7.75 + t * 22), rand(zA, 22)]); }   // bãi cỏ ngoài, dày gần hàng rào
    }
    const grass = new THREE.InstancedMesh(bladeGeo, windify(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.85, envMapIntensity: 0.25 }), 0.12, true), spots.length);
    const pal = [T.lawn, ...T.lawnSp].map(c => new THREE.Color(c));
    spots.forEach(([x, z], i) => {
      const hgt = rand(0.22, 0.5) * (Math.abs(x) < 7 ? 0.8 : 1);
      m4.compose(new V3(x, 0, z), qq.setFromEuler(new THREE.Euler(rand(-0.2, 0.2), rand(0, 6.28), rand(-0.2, 0.2))), new V3(rand(0.8, 1.3), hgt, 1));
      grass.setMatrixAt(i, m4); grass.setColorAt(i, col.copy(pick(pal)).offsetHSL(0, rand(-0.03, 0.05), rand(-0.04, 0.06)));
    });
    grass.receiveShadow = true; grass.frustumCulled = false; world.add(grass);
    // hoa dại lấm tấm trên bãi cỏ
    const fs = []; for (let i = 0; i < 900; i++) { const sx = Math.random() < 0.5 ? -1 : 1; fs.push([sx * rand(7.8, 26), rand(0.18, 0.32), rand(zA, 22)]); }
    const wild = new THREE.InstancedMesh(geo('flw', () => new THREE.IcosahedronGeometry(1, 0)), new THREE.MeshStandardMaterial({ roughness: 0.7 }), fs.length);
    fs.forEach((p, i) => { m4.compose(new V3(...p), qq.identity(), new V3(0.07, 0.05, 0.07)); wild.setMatrixAt(i, m4); wild.setColorAt(i, col.setHex(pick(T.flowers))); });
    world.add(wild);
  }

  // hoa nhỏ dưới chân hàng rào
  const fl = []; for (let i = 0; i < 320; i++) { const sx = Math.random() < 0.5 ? -1 : 1; fl.push([sx * rand(6.25, 6.45), rand(0.05, 0.25), rand(HOUSE_FRONT + 2, 0)]); }
  const flowers = new THREE.InstancedMesh(geo('flw', () => new THREE.IcosahedronGeometry(1, 0)), new THREE.MeshStandardMaterial({ roughness: 0.8 }), fl.length);
  fl.forEach((p, i) => { m4.compose(new V3(...p), qq.identity(), new V3(0.11, 0.08, 0.11)); flowers.setMatrixAt(i, m4); flowers.setColorAt(i, col.setHex(pick(T.flowers))); });
  world.add(flowers);

  // cây hai bên đường
  const trees = [];
  for (const sx of [-1, 1]) {
    for (let z = HOUSE_FRONT - 36; z < 26; z += rand(5.5, 7)) trees.push([sx * rand(10, 11.2), z, rand(1, 1.25)]);
    for (let z = HOUSE_FRONT - 32; z < 26; z += rand(6, 8)) trees.push([sx * rand(15, 17), z, rand(1, 1.3)]);
    for (let z = HOUSE_FRONT - 26; z < 20; z += rand(8, 11)) trees.push([sx * rand(22, 30), z, rand(1.1, 1.5)]);
  }
  for (let x = -40; x < 40; x += rand(6, 9)) trees.push([x, rand(HOUSE_FRONT - 22, HOUSE_FRONT - 16), rand(1.1, 1.5)]);
  const trunkMesh = new THREE.InstancedMesh(geo('trunk', () => new THREE.CylinderGeometry(0.28, 0.42, 1, 8)), MS(T.trunk, 0.95), trees.length);
  const canopyGeo = geo('canopy2', () => {
    const g = blobGeo(2, 0.14, 2.1), p = g.attributes.position, c = [];
    for (let i = 0; i < p.count; i++) { const k = 0.5 + 0.5 * THREE.MathUtils.clamp((p.getY(i) + 0.9) / 1.9, 0, 1); c.push(k, k, k * 0.95); }   // dưới tối, trên sáng
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); return g;
  });
  const blobs = [];
  trees.forEach(([x, z, s], i) => {
    m4.compose(new V3(x, 2.2 * s, z), qq.identity(), new V3(s, 4.4 * s, s)); trunkMesh.setMatrixAt(i, m4);
    const n = 10;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 * 1.618, r = k === 0 ? 0 : (k < 4 ? 0.8 : 1.6) * s;
      blobs.push([x + Math.cos(a) * r * rand(0.7, 1), (k === 0 ? 6.3 : rand(4.6, 5.6)) * s, z + Math.sin(a) * r * rand(0.7, 1), rand(1.6, 2.2) * s]);
    }
  });
  trunkMesh.castShadow = true; world.add(trunkMesh);
  const canopy = new THREE.InstancedMesh(canopyGeo, windify(new THREE.MeshStandardMaterial({ roughness: 0.8, vertexColors: true, envMapIntensity: 0.5 }), 0.05, false), blobs.length);
  blobs.forEach((b, i) => { qq.setFromEuler(new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6))); m4.compose(new V3(b[0], b[1], b[2]), qq, new V3(b[3], b[3] * 0.85, b[3])); canopy.setMatrixAt(i, m4); canopy.setColorAt(i, col.setHex(pick(T.tree))); });
  canopy.castShadow = true; canopy.receiveShadow = true; world.add(canopy);
  world.userData.treeSpots = trees; world.userData.procTrees = [trunkMesh, canopy];   // có mô hình cây tải về thì thay ở đúng các chỗ này

  // cột đèn
  for (const sx of [-1, 1]) {   // cột mốc đầu đường — khoai tây lăn về đây
    const mk = new THREE.Group(); mk.position.set(sx * 6.1, 0, 1.3); world.add(mk);
    box(0.46, 0.75, 0.22, MS(0xf4f4ee, 0.6), 0, 0.375, 0, mk);
    const top = cyl(0.23, 0.23, 0.22, MS(0xd8281e, 0.6), 0, 0.75, 0, mk, 16); top.rotation.x = Math.PI / 2;
    box(0.47, 0.06, 0.23, MS(0x2a2a2a, 0.6), 0, 0.1, 0, mk);
  }
  for (const sx of [-1, 1]) for (let z = HOUSE_FRONT + 8; z < 2; z += 12) {
    cyl(0.07, 0.09, 3.4, MS(0x2b2b2b, 0.5, 0.6), sx * 8, 1.7, z, world, 8);
    box(0.36, 0.5, 0.36, MS(0x2b2b2b, 0.5, 0.6), sx * 8, 3.55, z, world);
    box(0.28, 0.4, 0.28, new THREE.MeshStandardMaterial({ color: 0xfff1b8, emissive: 0xffd36a, emissiveIntensity: 0.8 }), sx * 8, 3.55, z, world);
  }
  // đồi, núi, mây
  for (let i = 0; i < 8; i++) { const h = sph(rand(18, 30), MS(pick(T.hill), 1), -120 + i * 34 + rand(-8, 8), -10, HOUSE_FRONT - 86 - rand(0, 30), world); h.scale.y *= 0.55; h.castShadow = false; }
  for (let i = 0; i < 7; i++) {
    const x = -180 + i * 60 + rand(-10, 10), r = rand(30, 45), h = rand(45, 70);
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), new THREE.MeshStandardMaterial({ color: T.mtn, roughness: 1, flatShading: true }));
    mtn.position.set(x, h / 2 - 8, HOUSE_FRONT - 216); world.add(mtn);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.32, h * 0.32, 7), new THREE.MeshStandardMaterial({ color: 0xf4f8ff, roughness: 1, flatShading: true }));
    cap.position.set(x, h - 8 - h * 0.16, HOUSE_FRONT - 216); world.add(cap);
  }
  const cloudTex = ctex(256, 128, (g) => {
    for (let i = 0; i < 14; i++) {
      const x = rand(50, 206), y = rand(50, 90), r = rand(22, 42);
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  });
  for (let i = 0; i < 15; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, fog: false, transparent: true, depthWrite: false, opacity: rand(0.6, 0.95) }));
    s.position.set(rand(-200, 200), rand(35, 70), rand(HOUSE_FRONT - 196, HOUSE_FRONT - 96)); s.scale.set(rand(50, 80), rand(22, 32), 1); world.add(s);
    s.material.opacity *= T.clouds ?? 1;
  }
  // map đặc biệt: bia mộ / xương rồng / đá lửa trang trí hai bên đường
  if (T.side) for (const sx of [-1, 1]) for (let z = HOUSE_FRONT + 6; z < START_Z - 2; z += rand(5, 9)) {
    const d = mkProp(T.prop); d.position.set(sx * rand(8.2, 9.6), 0, z); d.rotation.y = rand(-0.7, 0.7); d.scale.setScalar(rand(0.8, 1.25));
    d.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); world.add(d);
  }
}

const world = new THREE.Group(); scene.add(world);
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(480, 40, 20), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { cTop: { value: new THREE.Color() }, cMid: { value: new THREE.Color() }, cLow: { value: new THREE.Color() }, cHor: { value: new THREE.Color() },
    sunDir: { value: new V3(-0.45, 0.32, -1).normalize() }, sunCol: { value: new THREE.Color(1, 0.93, 0.75) } },
  vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 cTop, cMid, cLow, cHor, sunDir, sunCol; varying vec3 vDir;
    void main(){ float h = vDir.y;
      vec3 col = mix(cHor, cLow, smoothstep(-0.03, 0.025, h)); col = mix(col, cMid, smoothstep(0.025, 0.11, h)); col = mix(col, cTop, smoothstep(0.11, 0.42, h));
      float d = max(dot(normalize(vDir), sunDir), 0.0);
      col += sunCol * (pow(d, 900.0) * 3.0 + pow(d, 60.0) * 0.35 + pow(d, 8.0) * 0.12);   // đĩa + quầng mặt trời
      gl_FragColor = vec4(col, 1.0); }`
}));
skyDome.renderOrder = -1; skyDome.frustumCulled = false; scene.add(skyDome);
// ---- vật liệu có gió (cỏ, tán cây) ----
function windify(mat, amp, tip) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = WIND;
    sh.vertexShader = 'uniform float uTime;\nvarying float vH;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vH = clamp(position.y, 0.0, 1.0);
      vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float w = sin(uTime * 1.7 + ip.x * 0.35 + ip.z * 0.27) * ${amp.toFixed(3)} + sin(uTime * 3.3 + ip.z * 0.9 + ip.x) * ${(amp * 0.35).toFixed(3)};
      float k = ${tip ? 'vH * vH' : '(position.y + 1.0) * 0.5'};
      transformed.x += w * k; transformed.z += w * 0.6 * k;`);
    if (tip) sh.fragmentShader = 'varying float vH;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= mix(0.5, 1.18, vH);');
  };
  return mat;
}
// ===== Đồ họa tải về (CC0 — Quaternius / Kenney / KayKit, xem models/env/CREDITS.txt): cây, đá, đồ trang trí, nhà hàng xóm theo map =====
// Nạp sau khi dựng map (cây tự vẽ hiện trước, có mô hình thì thay) → mạng chậm / thiếu file vẫn chơi được.
const ENV_DIR = '/games/quaivat/models/env/';
// trees: [file, cao min, cao max] · decor: [file, cao min, cao max, tỉ lệ] · bld: [file, x, z (tính từ mặt nhà), cao, xoay]
const ENV = {
  'Vườn Xanh': {
    trees: [['rocks-and-trees__common-tree-1', 6, 8], ['rocks-and-trees__common-tree-3', 7, 9], ['rocks-and-trees__birch-tree-1', 7, 9], ['rocks-and-trees__willow-1', 6, 8]],
    decor: [['rocks-and-trees__bush-1', 1.2, 1.8, 4], ['rocks-and-trees__bush-berries-1', 1.2, 1.8, 3], ['rocks-and-trees__flowers', 0.6, 0.9, 4], ['rocks-and-trees__rock-1', 0.8, 1.4, 2], ['rocks-and-trees__rock-moss-1', 0.8, 1.3, 2], ['rocks-and-trees__tree-stump', 0.5, 0.7, 1], ['rocks-and-trees__wood-log', 0.5, 0.7, 1], ['nature__mushroom-red-group', 0.4, 0.6, 2], ['medieval-village__well', 2.2, 2.6, 0.3], ['medieval-village__cart', 1.8, 2.2, 0.3]],
    bld: [['city-kit-suburban__building-type-a', -21, -3, 7, 0.25], ['city-kit-suburban__building-type-f', 21, -3, 7.5, -0.25], ['city-kit-suburban__building-type-c', -33, -9, 7, 0.4], ['farm-buildings__barn', 33, -10, 8, -0.4]],
  },
  'Mùa Thu': {
    trees: [['rocks-and-trees__common-tree-autumn-1', 6, 8], ['rocks-and-trees__common-tree-autumn-3', 7, 9], ['rocks-and-trees__birch-tree-autumn-2', 7, 9], ['rocks-and-trees__pine-tree-autumn-1', 6, 8], ['rocks-and-trees__willow-autumn-1', 6, 8], ['halloween-pack__tree-pine-orange-large', 7, 9], ['halloween-pack__tree-pine-yellow-medium', 6, 8]],
    decor: [['rocks-and-trees__bush-1', 1.2, 1.7, 2], ['rocks-and-trees__rock-3', 0.7, 1.2, 2], ['rocks-and-trees__tree-stump', 0.5, 0.7, 2], ['rocks-and-trees__wood-log', 0.5, 0.7, 2], ['nature__stump-old', 0.6, 0.9, 1], ['nature__crop-pumpkin', 0.6, 0.9, 3], ['halloween-pack__pumpkin-orange', 0.6, 0.9, 3], ['halloween-pack__pumpkin-yellow', 0.5, 0.8, 2], ['medieval-village__cart', 1.8, 2.2, 0.4]],
    bld: [['medieval-village__house-1', -22, -4, 8, 0.25], ['farm-buildings__barn', 23, -6, 8, -0.3], ['city-kit-suburban__building-type-f', -34, -10, 7, 0.4]],
  },
  'Xứ Tuyết': {
    trees: [['rocks-and-trees__common-tree-snow-1', 6, 8], ['rocks-and-trees__pine-tree-snow-1', 6, 8.5], ['rocks-and-trees__pine-tree-snow-3', 7, 9.5], ['rocks-and-trees__birch-tree-snow-1', 7, 9], ['rocks-and-trees__common-tree-dead-snow-1', 5, 7]],
    decor: [['rocks-and-trees__bush-snow-1', 1.2, 1.7, 3], ['rocks-and-trees__rock-snow-1', 0.8, 1.3, 2], ['rocks-and-trees__rock-snow-3', 0.7, 1.1, 2], ['rocks-and-trees__tree-stump-snow', 0.5, 0.7, 1], ['rocks-and-trees__wood-log-snow', 0.5, 0.7, 1], ['holiday-kit__snowman-hat', 1.6, 2.0, 1], ['holiday-kit__snow-pile', 0.4, 0.6, 3], ['holiday-kit__sled', 0.7, 0.9, 0.5], ['holiday-kit__rocks-small', 0.6, 0.9, 1], ['holiday-kit__lantern', 2.2, 2.6, 0.6]],
    bld: [['city-kit-suburban__building-type-a', -21, -3, 7, 0.25], ['classical-buildings__house-2', 22, -5, 8, -0.3], ['city-kit-suburban__building-type-c', -33, -9, 7, 0.4]],
  },
  'Nghĩa Trang Đêm': {
    trees: [['halloween-pack__tree-dead-large', 6, 8.5], ['halloween-pack__tree-dead-large-decorated', 6, 8], ['halloween-pack__tree-dead-medium', 5, 7], ['rocks-and-trees__willow-dead-1', 6, 8], ['rocks-and-trees__common-tree-dead-1', 5, 7]],
    decor: [['graveyard-kit__gravestone-cross', 1.1, 1.5, 3], ['graveyard-kit__gravestone-round', 1.0, 1.3, 3], ['graveyard-kit__gravestone-decorative', 1.1, 1.5, 2], ['graveyard-kit__gravestone-broken', 0.8, 1.1, 2], ['graveyard-kit__gravestone-wide', 1.0, 1.3, 2], ['graveyard-kit__cross-wood', 1.2, 1.6, 2], ['graveyard-kit__coffin-old', 0.5, 0.7, 1], ['graveyard-kit__lightpost-single', 2.6, 3.2, 1], ['graveyard-kit__fire-basket', 1.0, 1.3, 0.6], ['graveyard-kit__urn-round', 0.5, 0.7, 1], ['halloween-pack__skull', 0.35, 0.5, 1], ['halloween-pack__ribcage', 0.5, 0.7, 0.6], ['halloween-pack__pumpkin-orange-jackolantern', 0.7, 0.9, 1], ['rocks-and-trees__rock-moss-1', 0.8, 1.2, 1]],
    bld: [['classical-buildings__house-2', -22, -4, 8.5, 0.3], ['halloween-pack__crypt', 21, -3, 6, -0.3], ['graveyard-kit__crypt-large', -32, -9, 5, 0.4], ['halloween-pack__crypt', 32, -10, 6, -0.4]],
  },
  'Sa Mạc': {
    trees: [['rocks-and-trees__palm-tree-1', 7, 9], ['rocks-and-trees__palm-tree-3', 6, 8], ['rocks-and-trees__cactus-1', 2.5, 3.5], ['rocks-and-trees__cactus-3', 3, 4.5], ['rocks-and-trees__cactus-flowers-2', 3, 4], ['rocks-and-trees__willow-dead-1', 5, 7]],
    decor: [['survival__rock-sand-a', 0.6, 1.0, 3], ['survival__rock-sand-b', 0.7, 1.2, 3], ['survival__rock-sand-c', 0.7, 1.1, 3], ['rocks-and-trees__rock-5', 0.8, 1.3, 2], ['halloween-pack__skull', 0.35, 0.5, 1], ['halloween-pack__bone-a', 0.25, 0.35, 2], ['halloween-pack__ribcage', 0.5, 0.7, 0.8], ['survival__campfire', 0.5, 0.7, 0.5], ['survival__signpost', 1.4, 1.8, 0.5], ['survival__box', 0.6, 0.8, 0.6], ['rocks-and-trees__cactus-1', 1.2, 1.8, 2]],
    bld: [['polypizza-quaternius__houses-flatroof', -22, -4, 7, 0.25], ['medieval-builder-pack__house', 22, -4, 6.5, -0.25], ['polypizza-quaternius__houses-flatroof', 33, -10, 7, -0.4]],
  },
  'Núi Lửa': {
    trees: [['polypizza-quaternius__tree-lava-1', 5, 7], ['polypizza-quaternius__tree-lava-2', 5, 7], ['rocks-and-trees__common-tree-dead-1', 5, 7], ['halloween-pack__tree-dead-medium', 5, 7]],
    decor: [['nature__rock-large-a', 1.2, 2.2, 3, 0x5a3a30], ['nature__stone-large-a', 1.0, 1.8, 3, 0x4a302a], ['nature__stone-large-c', 1.0, 1.8, 3, 0x5a3a30], ['nature__stone-tall-a', 2.0, 3.2, 2, 0x4a302a], ['halloween-pack__skull', 0.35, 0.5, 1], ['halloween-pack__bone-a', 0.25, 0.35, 2], ['graveyard-kit__fire-basket', 1.0, 1.3, 1], ['survival__campfire', 0.5, 0.7, 1]],
    bld: [['medieval-village__house-3', -22, -4, 9, 0.25], ['medieval-builder-pack__watchtower', 22, -5, 10, -0.25]],
  },
  'Lâu Đài Hoang': {
    trees: [['halloween-pack__tree-dead-large', 7, 9], ['halloween-pack__tree-dead-large-decorated', 7, 9], ['rocks-and-trees__willow-dead-1', 6, 8]],
    decor: [['graveyard-kit__gravestone-cross', 1.1, 1.5, 2], ['graveyard-kit__gravestone-broken', 0.8, 1.1, 2], ['graveyard-kit__cross-wood', 1.2, 1.6, 2], ['halloween-pack__skull', 0.35, 0.5, 1.5], ['halloween-pack__ribcage', 0.5, 0.7, 1], ['halloween-pack__post-lantern', 3.0, 3.6, 1], ['graveyard-kit__fire-basket', 1.0, 1.3, 1], ['rocks-and-trees__rock-moss-1', 0.8, 1.3, 2], ['castle-kit__siege-catapult-demolished', 2.5, 3.2, 0.3], ['zombie-apocalypse__barrel', 1.0, 1.2, 1]],
    bld: [['fantasy-rts__wall-towers-second-age', -24, -3, 11, 0], ['fantasy-rts__wall-towers-second-age', 24, -3, 11, 0], ['fantasy-rts__watch-tower-second-age-level-3', -38, -8, 15, 0.3], ['fantasy-rts__watch-tower-second-age-level-3', 38, -8, 15, -0.3]],
  },
};
const envCache = new Map();
function loadEnv(name) {
  if (!envCache.has(name)) envCache.set(name, new GLTFLoader().loadAsync(ENV_DIR + name + '.glb').then(g => {
    const root = g.scene; root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root), c = box.getCenter(new V3()), sz = box.getSize(new V3());
    const parts = []; root.traverse(o => { if (o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { m.envMapIntensity = 0.45; }); parts.push({ geo: o.geometry, mat: o.material, m: o.matrixWorld.clone() }); } });
    return { parts, c, minY: box.min.y, h: Math.max(1e-4, sz.y), w: Math.max(sz.x, sz.z) };
  }).catch(e => { console.warn('Không tải được mô hình', name, e); return null; }));
  return envCache.get(name);
}
// gom các bản sao của 1 mô hình thành InstancedMesh (ít lệnh vẽ) — spots: [{x, y, z, h, ry}]
const tintCache = new Map();
function tintMat(mat, hex) {
  const k = mat.uuid + hex; if (!tintCache.has(k)) { const m = mat.clone(); m.color.multiply(new THREE.Color(hex)).multiplyScalar(1.6); m.emissive = new THREE.Color(0x3a0800); tintCache.set(k, m); }
  return tintCache.get(k);
}
function plantEnv(info, spots, parent, tint) {
  if (!info || !spots.length) return;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), base = new THREE.Matrix4(), sc = new V3(), pos = new V3();
  for (const pt of info.parts) {
    const im = new THREE.InstancedMesh(pt.geo, tint && !Array.isArray(pt.mat) ? tintMat(pt.mat, tint) : pt.mat, spots.length);
    spots.forEach((s, i) => {
      const k = s.h / info.h; q.setFromEuler(e.set(0, s.ry || 0, 0));
      base.makeTranslation(-info.c.x, -info.minY, -info.c.z).premultiply(new THREE.Matrix4().makeScale(k, k, k));
      m4.compose(pos.set(s.x, s.y || 0, s.z), q, sc.set(1, 1, 1)).multiply(base).multiply(pt.m); im.setMatrixAt(i, m4);
    });
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); parent.add(im);
  }
}
let mapToken = 0;
async function decorateMap() {
  const E = ENV[T.name]; if (!E) return;
  const token = ++mapToken, W = world, ud = W.userData;
  const COMMON = ['zombie-apocalypse__street-lights', 'zombie-apocalypse__town-sign', 'zombie-apocalypse__trash-bag-1', 'zombie-apocalypse__barrel', 'zombie-apocalypse__pallet'];
  const names = [...new Set([...E.trees, ...E.decor, ...(E.bld || [])].map(x => x[0]).concat(COMMON))];
  const info = {}; await Promise.all(names.map(async n => { info[n] = await loadEnv(n); }));
  if (token !== mapToken || !ud.treeSpots) return;                 // đã đổi map trong lúc tải
  const g = new THREE.Group(); W.add(g);
  // nhà hàng xóm / tường thành hai bên
  const blds = (E.bld || []).map(([n, x, dz, h, ry]) => ({ n, x, z: HOUSE_FRONT + dz, h, ry }));
  for (const b of blds) plantEnv(info[b.n], [b], g);
  // cột đèn hai bên đường (cần đèn chĩa vào lòng đường), so le mỗi 13m, chừa cột mốc
  const lamps = [];
  for (let z = START_Z - 3, k = 0; z > HOUSE_FRONT + 9; z -= 13, k++) { if (Math.abs(z - cpZ) < 3) continue; const sx = k % 2 ? 1 : -1; lamps.push({ x: sx * (6.2 - 1.25), z, h: 6, ry: -sx * Math.PI / 2 }); }
  plantEnv(info['zombie-apocalypse__street-lights'], lamps, g);
  // đầu đường: biển thị trấn + đống rác, thùng phuy, pallet trên vỉa hè (đúng chất phim zombie)
  plantEnv(info['zombie-apocalypse__town-sign'], [{ x: -11, z: START_Z + 1.5, h: 4.2, ry: 0.35 }], g);
  plantEnv(info['zombie-apocalypse__trash-bag-1'], [{ x: 7.6, z: START_Z + 0.6, h: 0.75, ry: 1 }, { x: 8.2, z: START_Z + 1.2, h: 0.6, ry: 2 }, { x: 7.9, z: START_Z + 1.6, h: 0.7, ry: 0.3 }, { x: -7.8, z: START_Z + 0.4, h: 0.65, ry: 2.5 }], g);
  plantEnv(info['zombie-apocalypse__barrel'], [{ x: 9.2, z: START_Z + 0.8, h: 1.15, ry: 0.4 }, { x: -9.4, z: START_Z - 1.5, h: 1.15, ry: 1.2 }], g);
  plantEnv(info['zombie-apocalypse__pallet'], [{ x: 10.2, z: START_Z + 1.4, h: 0.16, ry: 0.5 }], g);
  const nearBld = (x, z, r) => blds.some(b => Math.hypot(b.x - x, b.z - z) < r);
  // cây: thay cây tự vẽ ở đúng các chỗ cũ
  const okTrees = E.trees.filter(t => info[t[0]]);
  if (okTrees.length) {
    const byKind = new Map();
    for (const [x, z, s] of ud.treeSpots) {
      if (nearBld(x, z, 9)) continue;
      const t = pick(okTrees), arr = byKind.get(t) || []; arr.push({ x: x + rand(-0.6, 0.6), z, h: rand(t[1], t[2]) * s, ry: rand(0, 6.28) }); byKind.set(t, arr);
    }
    for (const [t, arr] of byKind) plantEnv(info[t[0]], arr, g);
    for (const m of ud.procTrees || []) m.visible = false;
  }
  // đồ trang trí rải hai bên đường (ngoài hàng rào cây xanh) + quanh nhà
  const dec = E.decor.filter(d => info[d[0]]), tot = dec.reduce((a, d) => a + d[3], 0);
  if (dec.length) {
    const byKind = new Map(), n = Math.round(90 + T.length * 0.5);
    for (let i = 0; i < n; i++) {
      const sx = Math.random() < 0.5 ? -1 : 1, x = sx * (Math.random() < 0.55 ? rand(8.3, 13) : rand(13, 42)), z = rand(HOUSE_FRONT - 14, START_Z + 6);
      if (z > HOUSE_FRONT - 12 && z < HOUSE_FRONT + 4 && Math.abs(x) < 15) continue;   // chừa chỗ ngôi nhà + hàng rào
      if (nearBld(x, z, 7)) continue;
      if (z > 0.2 && z < 5 && Math.abs(x) < 42) continue;                              // chừa lòng đường nhựa
      let r = Math.random() * tot, k = 0; while (r > dec[k][3]) { r -= dec[k][3]; k++; }
      const d = dec[k], arr = byKind.get(d) || []; arr.push({ x, z, h: rand(d[1], d[2]), ry: rand(0, 6.28) }); byKind.set(d, arr);
    }
    for (const [d, arr] of byKind) plantEnv(info[d[0]], arr, g, d[4]);
  }
}
function buildMap(i) {
  state.map = i; T = MAPS[i]; HOUSE_FRONT = 2 - T.length;
  world.clear();
  scene.background = new THREE.Color(T.sky[3]);
  const su = skyDome.material.uniforms;
  su.cTop.value.set(T.sky[0]); su.cMid.value.set(T.sky[1]); su.cLow.value.set(T.sky[2]); su.cHor.value.set(T.sky[3]);
  scene.fog = new THREE.Fog(T.fog, T.fogNear || 95, (T.fogFar || 330) + T.length);
  su.sunCol.value.setRGB(...(T.glow || [1, 0.93, 0.75]));
  if (gradePass) gradePass.uniforms.uTint.value.set(...(T.tint || [1.02, 1.0, 0.97]));
  if (bloomPass) bloomPass.strength = T.night ? 0.42 : 0.2;
  hemi.color.setHex(T.hemi[0]); hemi.groundColor.setHex(T.hemi[1]); hemi.intensity = T.hemi[2];
  sun.color.setHex(T.sun); sun.intensity = T.sunI;
  buildWorld(); houseFx.lights = []; houseFx.bats = null;
  (T.house === 'castle' ? buildCastle : buildHouse)(); buildCheckpoint(); decorateMap();
  document.getElementById('mapN').textContent = `🗺️ Map ${i + 1}: ${T.name}`;
}
// ---------------- Ngôi nhà ----------------
const door = { hp: CONFIG.doorHp, maxHp: CONFIG.doorHp, open: 0, openUntil: 0, shake: 0, broken: false, tier: 0, over: 0 };
const DOOR_TINT = [[1, 1, 1], [0.62, 0.68, 0.8], [0.48, 0.52, 0.6]], DOOR_NAME = ['🚪 CỬA GỖ', '🛡️ CỬA SẮT', '🛡️ CỬA THÉP'];
function hipRoof(w, d, h, over) {
  const W = w / 2 + over, D = d / 2 + over, r = Math.max(0.01, W - D);
  const A = [-W, 0, D], B = [W, 0, D], C = [W, 0, -D], E = [-W, 0, -D], R1 = [-r, h, 0], R2 = [r, h, 0];
  const tris = [[A, B, R2], [A, R2, R1], [B, C, R2], [C, E, R1], [C, R1, R2], [E, A, R1]], side = [0, 0, 1, 0, 0, 1];
  const slope = Math.hypot(h, D), p = [], uv = [];
  tris.forEach((t, i) => { for (const v of t) { p.push(...v); uv.push((side[i] ? v[2] : v[0]) / 2.4, (v[1] / h) * slope / 2.4); } });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals(); return g;
}
function sunflower(x, z, h, parent) {
  const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
  cyl(0.05, 0.06, h, MS(0x2f8a2a), 0, h / 2, 0, g, 6);
  for (const s of [-1, 1]) { const l = sph(0.25, MS(0x3a9a30), s * 0.2, h * 0.45, 0, g); l.scale.set(0.28, 0.06, 0.16); l.rotation.z = s * 0.4; }
  const head = new THREE.Group(); head.position.y = h; head.rotation.x = -0.25; g.add(head);
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; const p = sph(0.2, MS(0xffcf1f, 0.7), Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0, head); p.scale.set(0.2, 0.1, 0.04); p.rotation.z = a; }
  const d = sph(0.24, MS(0x6a3d14, 0.9), 0, 0, 0.04, head); d.scale.z = 0.35;
}
// ---- sảnh trong nhà (sau lỗ cửa): sàn gỗ, thảm đỏ, giấy dán tường, đèn vàng ấm, bàn ăn có NÃO phát sáng ở cuối ----
function buildFoyer(H, F) {
  const D = 3.6, W = 4.6, Y0 = 0.74, Y1 = 4.4, z0 = F - D, zc = F - D / 2, Ym = (Y0 + Y1) / 2;
  const wallTex = ctex(128, 128, (g, w, h) => {
    g.fillStyle = '#ead7b2'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(170,110,70,.2)'; g.fillRect(x, 0, 12, h); }
    g.fillStyle = 'rgba(150,90,50,.28)'; for (let y = 16; y < h; y += 32) for (let x = 22; x < w; x += 32) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
  }, [3, 2]);
  const wm = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 }), wood = MS(0x6e4524, 0.75), woodL = MS(0x8a5a32, 0.7);
  const floorTex = ctex(256, 256, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#8a5530' : '#9c6439'; g.fillRect(i * 32, 0, 32, h); g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(i * 32, 0, 2, h); g.fillRect(i * 32, rand(0, h), 32, 2); }
  }, [2, 2]);
  box(W, 0.14, D, new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55 }), 0, Y0 - 0.07, zc, H);
  box(W, 0.12, D, MS(0xf3ecdf, 0.9), 0, Y1, zc, H);
  for (const sx of [-1, 1]) {
    box(0.12, Y1 - Y0, D, wm, sx * W / 2, Ym, zc, H);
    box(0.06, 0.45, D, wood, sx * (W / 2 - 0.08), Y0 + 0.22, zc, H);                                         // ván chân tường
    box(0.05, 0.08, D, MS(0xffffff, 0.6), sx * (W / 2 - 0.08), Y1 - 0.12, zc, H);                             // phào trần
    // tranh treo tường
    box(0.06, 0.8, 1.0, MS(0xc9a24a, 0.4, 0.5), sx * (W / 2 - 0.08), 2.6, F - 1.2, H);
    box(0.04, 0.62, 0.82, MS(sx < 0 ? 0x3a7a8a : 0x8a3a4a, 0.8), sx * (W / 2 - 0.12), 2.6, F - 1.2, H);
    // đèn tường
    box(0.08, 0.3, 0.16, MS(0xc9a24a, 0.35, 0.6), sx * (W / 2 - 0.1), 3.1, F - 2.6, H);
    sph(0.13, MS(0xfff2c8, 0.3, 0, { emissive: 0xffc870, emissiveIntensity: 2.2 }), sx * (W / 2 - 0.25), 3.35, F - 2.6, H);
  }
  box(W, Y1 - Y0, 0.12, wm, 0, Ym, z0, H);
  box(W, 0.45, 0.06, wood, 0, Y0 + 0.22, z0 + 0.08, H);
  box(1.3, 0.02, D - 0.4, MS(0xb3202e, 0.95), 0, Y0 + 0.01, zc + 0.1, H);                                         // thảm đỏ
  for (const sx of [-1, 1]) box(0.08, 0.025, D - 0.4, MS(0xe8c24a, 0.6), sx * 0.62, Y0 + 0.015, zc + 0.1, H);
  // đồng hồ quả lắc góc trái + giá treo áo góc phải
  box(0.55, 1.9, 0.4, wood, -1.85, Y0 + 0.95, z0 + 0.45, H); cyl(0.2, 0.2, 0.05, MS(0xfff6e0, 0.4), -1.85, Y0 + 1.55, z0 + 0.67, H, 20).rotation.x = Math.PI / 2;
  cyl(0.04, 0.05, 1.8, wood, 1.85, Y0 + 0.9, z0 + 0.6, H, 8); sph(0.18, MS(0x3a5a8a, 0.8), 1.95, Y0 + 1.55, z0 + 0.65, H).scale.set(0.16, 0.35, 0.12);
  // bàn ăn + não
  const clothTex = ctex(64, 64, (g) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#d8283a' : '#f8f4ec'; g.fillRect(i * 16, j * 16, 16, 16); } }, [3, 3]);
  const cloth = new THREE.MeshStandardMaterial({ map: clothTex, roughness: 0.85 }), tz = z0 + 1.0;
  cyl(0.75, 0.75, 0.05, cloth, 0, Y0 + 0.95, tz, H, 28); cyl(0.75, 0.86, 0.45, cloth, 0, Y0 + 0.72, tz, H, 28); cyl(0.08, 0.1, 0.5, woodL, 0, Y0 + 0.25, tz, H, 8);
  cyl(0.28, 0.25, 0.03, MS(0xffffff, 0.3), 0, Y0 + 0.99, tz + 0.15, H, 24);
  const brain = put(new THREE.Mesh(geo('brain', () => blobGeo(3, 0.22, 11)), MS(0xf28fb0, 0.45, 0, { emissive: 0x6a1030, emissiveIntensity: 1.4 })), 0, Y0 + 1.1, tz + 0.15, H);
  brain.scale.set(0.2, 0.13, 0.16);
  for (const sx of [-1, 1]) { cyl(0.04, 0.05, 0.3, MS(0xf6efe0, 0.6), sx * 0.45, Y0 + 1.12, tz - 0.1, H, 8); sph(0.05, MS(0xffd070, 0.3, 0, { emissive: 0xffa020, emissiveIntensity: 3 }), sx * 0.45, Y0 + 1.32, tz - 0.1, H); }   // nến
  const lamp = new THREE.PointLight(0xffcf90, 14, 7, 1.6); lamp.position.set(0, Y1 - 0.5, zc); H.add(lamp);
  const glow = new THREE.PointLight(0xff6aa0, 4, 2.6, 1.6); glow.position.set(0, Y0 + 1.5, tz + 0.3); H.add(glow);
  cyl(0.02, 0.02, 0.5, MS(0x333333, 0.5), 0, Y1 - 0.3, zc, H, 6); sph(0.2, MS(0xfff2c8, 0.3, 0, { emissive: 0xffd090, emissiveIntensity: 2 }), 0, Y1 - 0.6, zc, H);   // đèn trần
}
// ---- LÂU ĐÀI HOANG (map boss): cổng gỗ bọc sắt cùng kích thước cửa nhà → dùng chung logic cửa/bậc/sảnh ----
const houseFx = { lights: [], bats: null };
function buildCastle() {
  const H = new THREE.Group(); H.scale.setScalar(HS); H.position.set(0, 0, HOUSE_FRONT - 5 * HS); world.add(H);
  const F = 5.0, W = 18, HT = 9.7;
  const stoneTex = ctex(256, 256, (g, w, h) => {
    g.fillStyle = '#4e4856'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? -32 : 0; x < w; x += 64) { g.fillStyle = `hsl(${rand(250, 285)}, ${rand(4, 10)}%, ${rand(36, 50)}%)`; g.beginPath(); g.roundRect(x + 2, y + 2, 60, 28, 4); g.fill(); }
    speckle(g, w, h, ['#34303c', '#7a7484', '#4a5a3a'], 1600, 1, 3);
    for (let i = 0; i < 6; i++) { g.strokeStyle = 'rgba(18,14,24,.65)'; g.lineWidth = 2; g.beginPath(); let x = rand(0, w), y = rand(0, h * 0.6); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += rand(-14, 14); y += rand(6, 16); g.lineTo(x, y); } g.stroke(); }   // vết nứt
    for (let i = 0; i < 50; i++) { g.fillStyle = `rgba(60,${Math.round(rand(85, 120))},40,${rand(0.25, 0.5)})`; g.beginPath(); g.arc(rand(0, w), rand(h * 0.55, h), rand(3, 10), 0, 7); g.fill(); }   // rêu
  }, [6, 3]);
  const stone = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95, envMapIntensity: 0.35 });
  const tTex = stoneTex.clone(); tTex.repeat.set(5, 4); tTex.needsUpdate = true;
  const stoneT = new THREE.MeshStandardMaterial({ map: tTex, roughness: 0.95, envMapIntensity: 0.35 });
  const dark = MS(0x2a2530, 0.9), iron = MS(0x3a3a42, 0.45, 0.7), roofM = MS(new THREE.Color(T.roof[1]).getHex(), 0.7);
  // thân lâu đài: mặt trước dựng riêng có lỗ cổng
  box(W, HT, 10, [stone, stone, stone, stone, new THREE.MeshBasicMaterial({ visible: false }), stone], 0, HT / 2, 0, H);
  const DX = 0.975, DY = 3.85;
  const facade = (x0, x1, y0, y1) => {
    const gq = new THREE.PlaneGeometry(x1 - x0, y1 - y0), uv = gq.attributes.uv, ps = gq.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (ps.getX(i) + (x0 + x1) / 2 + W / 2) / W, (ps.getY(i) + (y0 + y1) / 2) / HT);
    put(new THREE.Mesh(gq, stone), (x0 + x1) / 2, (y0 + y1) / 2, F, H);
  };
  facade(-W / 2, -DX, 0, HT); facade(DX, W / 2, 0, HT); facade(-DX, DX, DY, HT); facade(-DX, DX, 0, 0.7);
  buildFoyer(H, F);
  // lỗ châu mai trên đỉnh tường + lối đi
  box(W + 0.6, 0.35, 1.1, stone, 0, HT + 0.1, F - 0.3, H);
  for (let x = -W / 2 + 0.4; x <= W / 2 - 0.3; x += 1.3) { if (Math.random() < 0.12) continue; box(0.75, rand(0.75, 1.0), 0.8, stone, x, HT + 0.7, F - 0.25, H); }   // vài chỗ sứt mẻ
  // cổng: khung đá + vòm + răng song sắt + gỗ bọc sắt
  for (const sx of [-1, 1]) { box(0.5, 3.5, 0.5, stone, sx * 1.22, 0.7 + 1.75, F + 0.1, H); box(0.06, 3.15, 0.6, dark, sx * 1.0, 2.275, F - 0.25, H); }
  const arch = new THREE.Mesh(geo('carch', () => new THREE.TorusGeometry(1.25, 0.3, 8, 18, Math.PI)), stone); put(arch, 0, 3.95, F + 0.1, H);
  put(new THREE.Mesh(geo('ckey', () => new THREE.BoxGeometry(0.5, 0.6, 0.6)), MS(0x6a6474, 0.9)), 0, 5.3, F + 0.12, H);
  box(2.0, 0.06, 0.6, dark, 0, 3.88, F - 0.25, H);
  for (let x = -0.85; x <= 0.86; x += 0.34) { cyl(0.035, 0.035, 0.7, iron, x, 4.25, F + 0.2, H, 6); const tip = new THREE.Mesh(geo('pcTip', () => new THREE.ConeGeometry(0.06, 0.2, 6)), iron); tip.rotation.x = Math.PI; put(tip, x, 3.82, F + 0.2, H); }
  box(1.95, 0.06, 0.06, iron, 0, 4.55, F + 0.2, H);
  const gateTex = ctex(128, 256, (g, w, h) => {
    for (let x = 0; x < w; x += 21) { g.fillStyle = `hsl(25, ${rand(30, 45)}%, ${rand(16, 24)}%)`; g.fillRect(x, 0, 20, h); g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(x + 19, 0, 2, h); }
    for (const y of [40, 128, 216]) { g.fillStyle = '#3a3a42'; g.fillRect(0, y, w, 16); g.fillStyle = '#6a6a74'; for (let x = 8; x < w; x += 24) { g.beginPath(); g.arc(x, y + 8, 3, 0, 7); g.fill(); } }
  });
  door.mat = new THREE.MeshStandardMaterial({ map: gateTex, roughness: 0.75, envMapIntensity: 0.4 });
  door.pivot = new THREE.Group(); door.pivot.position.set(-0.95, 0.7, F + 0.15); H.add(door.pivot);
  door.panel = box(1.9, 3.12, 0.14, door.mat, 0.95, 1.56, 0, door.pivot);
  const ring = new THREE.Mesh(geo('cring', () => new THREE.TorusGeometry(0.16, 0.035, 6, 14)), iron); put(ring, 1.55, 1.5, 0.12, door.pivot);
  door.baseX = -0.95;
  // đuốc hai bên cổng (lửa lập loè)
  houseFx.lights = [];
  for (const sx of [-1, 1]) {
    box(0.14, 0.3, 0.3, iron, sx * 1.95, 3.0, F + 0.18, H);
    const st = cyl(0.05, 0.07, 0.55, MS(0x4a3020, 0.9), sx * 1.95, 3.35, F + 0.4, H, 6); st.rotation.x = 0.35;
    sph(0.16, MS(0xffd070, 0.3, 0, { emissive: 0xff7a10, emissiveIntensity: 3 }), sx * 1.95, 3.7, F + 0.5, H).scale.set(0.14, 0.24, 0.14);
    const L = new THREE.PointLight(0xff8a30, 8, 7, 1.6); L.position.set(sx * 1.95, 3.9, F + 0.8); H.add(L); houseFx.lights.push(L);
  }
  // cửa sổ vòm: cái sáng vàng, cái xanh ma quái, cái tối om (vỡ)
  const winM = [MS(0x2a1a08, 0.4, 0, { emissive: 0xffa030, emissiveIntensity: 1.8 }), MS(0x0a2a14, 0.4, 0, { emissive: 0x5aff9a, emissiveIntensity: 1.6 }), MS(0x0c0a10, 0.9)];
  const archWin = (x, y, z, m, s = 1) => { box(0.9 * s, 1.3 * s, 0.12, m, x, y, z, H); const c = cyl(0.45 * s, 0.45 * s, 0.12, m, x, y + 0.65 * s, z, H, 14); c.rotation.x = Math.PI / 2; box(1.1 * s, 0.14, 0.3, stone, x, y - 0.68 * s, z + 0.05, H); };
  for (const [x, y] of [[-3.6, 5.6], [3.6, 5.6], [-6.6, 5.6], [6.6, 5.6], [-3.6, 8.0], [3.6, 8.0], [0, 7.4]]) archWin(x, y, F + 0.02, pick(winM));
  // tháp tròn hai bên + tháp chính phía sau, mái nhọn sứt mẻ
  const tower = (x, z, r, h, roofH) => {
    cyl(r, r * 1.08, h, stoneT, x, h / 2, z, H, 18);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; if (Math.random() < 0.15) continue; box(0.6, 0.8, 0.6, stone, x + Math.cos(a) * r, h + 0.4, z + Math.sin(a) * r, H).rotation.y = -a; }
    const rf = new THREE.Mesh(geo(`croof${r}_${roofH}`, () => new THREE.ConeGeometry(r * 1.2, roofH, 14)), roofM); rf.rotation.z = rand(-0.08, 0.08); put(rf, x, h + 0.2 + roofH / 2, z, H);
    for (let y = 3.5; y < h - 1; y += 3.2) archWin(x, y, z + r * 1.04, pick(winM), 0.7);
  };
  tower(-10.4, 2.6, 2.6, 13, 5.5); tower(10.4, 2.6, 2.6, 13, 5.5); tower(0, -2.5, 2.3, 17.5, 6.5);
  // cờ rách trên tháp chính + băng rôn đỏ rủ tường
  cyl(0.05, 0.05, 2.4, iron, 0, 25.4, -2.5, H, 6);
  const flag = box(1.5, 0.8, 0.03, MS(0x7a1420, 0.85), 0.78, 26.1, -2.5, H); flag.rotation.y = 0.2;
  for (const sx of [-1, 1]) { box(1.3, 3.4, 0.05, MS(0x6a1420, 0.85), sx * 5.2, 7.7, F + 0.06, H); sph(0.32, MS(0xc9a24a, 0.4, 0.6), sx * 5.2, 8.3, F + 0.1, H).scale.set(0.32, 0.32, 0.05); }
  // dây leo
  for (let i = 0; i < 60; i++) { const x = pick([-1, 1]) * rand(2, 8.6), y = rand(0.5, 6.5); if (Math.random() < 0.6 && y > 4) continue; sph(1, MS(pick([0x2e4a22, 0x3a5a2a, 0x24401c]), 0.9), x, y, F + 0.05, H).scale.set(rand(0.25, 0.55), rand(0.2, 0.45), 0.12); }
  // bậc đá + gờ đá (giữ đúng kích thước bậc nhà để zombie bước lên đúng chân) + sân đá
  const stoneB = MS(0x6a6472, 0.9), stoneC = MS(0x7e7886, 0.85);
  box(4.2, 0.7, 1.2, stoneB, 0, 0.35, F + 0.6, H); box(4.32, 0.06, 1.28, stoneC, 0, 0.71, F + 0.62, H);
  box(4.6, 0.35, 0.7, stoneB, 0, 0.175, F + 1.55, H); box(4.72, 0.06, 0.78, stoneC, 0, 0.36, F + 1.57, H);
  for (const sx of [-1, 1]) box(5.0, 0.18, 1.0, stoneB, sx * 5.1, 0.09, F + 0.65, H);
  const yardTex = ctex(128, 128, (g, w, h) => { g.fillStyle = '#5a5462'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? -16 : 0; x < w; x += 32) { g.fillStyle = `hsl(260, 6%, ${rand(30, 44)}%)`; g.fillRect(x + 1, y + 1, 30, 30); } speckle(g, w, h, ['#3a5a2a', '#2a2630'], 300, 1, 3); }, [3, 2]);
  box(8, 0.1, 4.5, new THREE.MeshStandardMaterial({ map: yardTex, roughness: 0.95 }), 0, 0.05, F + 2.6, H).castShadow = false;
  // gạch vụn chân tường + hàng rào sắt nhọn hai bên
  for (let i = 0; i < 14; i++) { const r = new THREE.Mesh(geo('rockp', () => blobGeo(1, 0.2, 5.5)), MS(0x5e5866, 0.95, 0, { flatShading: true })); r.scale.setScalar(rand(0.2, 0.5)); put(r, pick([-1, 1]) * rand(7.8, 11), 0.15, F + rand(0.3, 2.2), H); }
  for (const s2 of [-1, 1]) {
    for (let x = 13.2; x < 20; x += 0.45) { cyl(0.04, 0.04, 1.6, iron, s2 * x, 0.8, F + 0.6, H, 5); put(new THREE.Mesh(geo('fTip', () => new THREE.ConeGeometry(0.08, 0.25, 5)), iron), s2 * x, 1.7, F + 0.6, H); }
    box(6.8, 0.07, 0.07, iron, s2 * 16.6, 1.35, F + 0.6, H); box(6.8, 0.07, 0.07, iron, s2 * 16.6, 0.4, F + 0.6, H);
  }
  // đàn dơi bay quanh tháp
  const bats = new THREE.Group(); H.add(bats); houseFx.bats = bats;
  const bm = MS(0x141018, 0.8);
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Group(); bats.add(b); sph(1, bm, 0, 0, 0, b).scale.set(0.16, 0.14, 0.24);
    const wing = sx => { const pv = new THREE.Group(); pv.position.x = sx * 0.12; b.add(pv); const w = box(0.55, 0.02, 0.3, bm, sx * 0.28, 0, 0, pv); w.castShadow = false; return pv; };
    b.userData = { wl: wing(-1), wr: wing(1), cx: pick([-10.4, 10.4, 0]), r: rand(3.4, 5.5), y: rand(13, 20), ph: rand(0, 6.28), sp: rand(0.6, 1.1) * pick([-1, 1]) };
  }
  H.updateMatrixWorld(true);
  door.house = H;
}
function updateHouseFx(dt) {
  for (const L of houseFx.lights) L.intensity = 6 + Math.sin(time * 17 + L.position.x) * 1.2 + Math.random() * 1.5;
  if (houseFx.bats) for (const b of houseFx.bats.children) {
    const u = b.userData, a = time * u.sp + u.ph;
    b.position.set(u.cx + Math.cos(a) * u.r, u.y + Math.sin(time * 2 + u.ph) * 0.6, 2.6 + Math.sin(a) * u.r);
    b.rotation.y = -a + (u.sp > 0 ? 0 : Math.PI);
    u.wl.rotation.z = Math.sin(time * 18 + u.ph) * 0.9; u.wr.rotation.z = -u.wl.rotation.z;
  }
}
// trang trí riêng cho ngôi nhà theo phong cách map
function houseDeco(H, F) {
  const st = T.style;
  if (st === 'snow') {                                            // băng nhũ dưới mái, tuyết đọng
    const snowM = MS(0xf8fbff, 0.6), ice = MS(0xd8f2ff, 0.15, 0.1, { transparent: true, opacity: 0.85 });
    for (let x = -8.8; x <= 8.8; x += 0.32) { if (Math.random() < 0.25) continue; const L = rand(0.25, 0.8); const c = new THREE.Mesh(geo('icicle', () => new THREE.ConeGeometry(0.06, 1, 6)), ice); c.scale.y = L; c.rotation.x = Math.PI; put(c, x, 5.58 - L / 2, 6.22, H, false); }
    box(1.95, 0.32, 1.95, snowM, 4.5, 11.45, -1.8, H); box(3.3, 0.2, 1.35, snowM, 0, 5.32, F + 0.55, H);
    for (const x of [-4.9, 4.9]) box(2.9, 0.16, 0.5, snowM, x, 2.62, F + 0.42, H);
    for (let i = 0; i < 14; i++) { const x = pick([-1, 1]) * rand(2.6, 8.2); sph(1, snowM, x, 0.1, F + rand(0.2, 0.9), H).scale.set(rand(0.5, 1.0), rand(0.2, 0.35), rand(0.35, 0.6)); }
  } else if (st === 'autumn') {                                   // lá rụng trên mái + chân tường, bí ngô trên bậc
    const cols = [0xe07a2a, 0xd4a020, 0xc0502a, 0xb83a1e];
    for (let i = 0; i < 70; i++) { const l = sph(1, MS(pick(cols), 0.9), rand(-8.6, 8.6), 5.95 + rand(0, 0.35), 5.9 + rand(0, 0.5), H); l.scale.set(0.22, 0.05, 0.15); l.rotation.set(rand(-0.5, 0.5), rand(0, 6), rand(-0.5, 0.5)); }
    for (let i = 0; i < 60; i++) { const l = sph(1, MS(pick(cols), 0.9), pick([-1, 1]) * rand(2.7, 8.5), 0.06 + rand(0, 0.12), F + rand(1.2, 2.2), H); l.scale.set(0.22, 0.05, 0.15); l.rotation.y = rand(0, 6); }
    for (const [x, y, z, r] of [[1.75, 0.74, F + 0.55, 0.3], [-1.8, 0.74, F + 0.5, 0.24], [2.05, 0.39, F + 1.5, 0.26]]) {
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const s = sph(1, MS(0xe8761e, 0.6), x + Math.cos(a) * r * 0.45, y + r * 0.8, z + Math.sin(a) * r * 0.45, H); s.scale.set(r * 0.6, r * 0.8, r * 0.6); }
      cyl(0.04, 0.06, 0.2, MS(0x4a6a20, 0.8), x, y + r * 1.7, z, H, 6);
    }
  } else if (st === 'haunted') {                                  // nhà ma: ván đóng chéo cửa sổ, biển "CẤM VÀO"
    const wood = MS(0x5a4030, 0.95);
    for (const x of [-4.9, 4.9]) for (const r of [0.55, -0.6]) { const b = box(2.7, 0.24, 0.07, wood, x, 3.6, F + 0.24, H); b.rotation.z = r; }
    const signTex = ctex(256, 96, (g, w, h) => { g.fillStyle = '#6a4a2a'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 3; for (let y = 24; y < h; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } g.font = 'bold 54px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#c81e1e'; g.fillText('CẤM VÀO!', w / 2, h / 2 + 2); });
    cyl(0.07, 0.08, 2.2, wood, 4.2, 1.1, F + 3.4, H, 6);
    const sg = box(2.0, 0.75, 0.08, new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.9 }), 4.2, 1.9, F + 3.45, H); sg.rotation.z = 0.12;
  } else if (st === 'volcano') {                                  // vết nứt dung nham phát sáng trên tường + tro trên mái
    const lava = MS(0x2a0a00, 0.6, 0, { emissive: 0xff5a10, emissiveIntensity: 2.4 });
    for (let k = 0; k < 9; k++) {
      let x = pick([-1, 1]) * rand(1.6, 7.6), y = rand(1.0, 5.4);
      for (let i = 0; i < 5; i++) { const nx = x + rand(-0.4, 0.4), ny = y - rand(0.2, 0.45); const L = Math.hypot(nx - x, ny - y); const c = box(0.07, L, 0.03, lava, (x + nx) / 2, (y + ny) / 2, F + 0.03, H, false); c.rotation.z = Math.atan2(x - nx, ny - y); x = nx; y = ny; if (y < 0.8) break; }
    }
    for (let i = 0; i < 40; i++) sph(1, MS(0x3a3432, 0.95), rand(-8.5, 8.5), 6.0 + rand(0, 0.2), 5.9 + rand(0, 0.4), H).scale.set(rand(0.3, 0.6), 0.1, rand(0.2, 0.4));
  } else if (st === 'adobe') {                                    // mái hiên sọc, chuỗi ớt đỏ, chum đất
    const stripe = ctex(64, 64, (g, w, h) => { for (let x = 0; x < w; x += 16) { g.fillStyle = (x / 16) % 2 ? '#f2e6c8' : '#c8502a'; g.fillRect(x, 0, 16, h); } });
    for (const x of [-4.9, 4.9]) { const a = box(2.9, 0.06, 1.1, new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.9 }), x, 4.85, F + 0.5, H); a.rotation.x = 0.35; }
    for (let i = 0; i < 8; i++) { const c = new THREE.Mesh(geo('chili', () => new THREE.ConeGeometry(0.07, 0.3, 6)), MS(0xc81e1e, 0.5)); c.rotation.x = Math.PI; put(c, 1.75 + (i % 2) * 0.08, 3.9 - i * 0.22, F + 0.22, H, false); }
    for (const [x, z, r] of [[2.4, F + 1.9, 0.38], [-2.6, F + 2.0, 0.32], [-3.1, F + 1.6, 0.26]]) { const j = sph(1, MS(0xb5653a, 0.85), x, r, z, H); j.scale.set(r, r * 1.1, r); cyl(r * 0.45, r * 0.5, r * 0.4, MS(0xa0552e, 0.85), x, r * 2.1, z, H, 10); }
  }
}
function buildHouse() {
  const H = new THREE.Group(); H.scale.setScalar(HS); H.position.set(0, 0, HOUSE_FRONT - 5 * HS); world.add(H);
  const F = 5.0;                                   // mặt trước (toạ độ cục bộ)
  const white = MS(0xf7f4ec, 0.6), whiteD = MS(0xe2ddd0, 0.7), metal = MS(0x8a8f96, 0.45, 0.6), darkM = MS(0x2c2a28, 0.5, 0.5);
  const shutterCol = { 'Vườn Xanh': 0x3d6f96, 'Mùa Thu': 0x55703a, 'Xứ Tuyết': 0x9a3b2c }[T.name] || 0x3d6f96;

  // ---- móng đá + tường vữa (sáng dần lên trên) + đá góc nhà ----
  const stoneTex = ctex(256, 128, (g, w, h) => {
    g.fillStyle = '#8f877a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? -24 : 0; x < w; x += 48) {
      g.fillStyle = `hsl(36, ${rand(6, 12)}%, ${rand(52, 66)}%)`; g.beginPath(); g.roundRect(x + 2, y + 2, 44, 28, 6); g.fill();
    }
    speckle(g, w, h, ['#6d665c', '#b8b0a2'], 900, 1, 2);
  }, [8, 1]);
  box(16.5, 0.7, 10.5, new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95 }), 0, 0.35, 0, H);
  const plaster = ctex(256, 512, (g, w, h) => {
    if (T.style === 'haunted') {                                   // nhà ma: ván gỗ mục xám
      for (let x = 0; x < w; x += 32) { g.fillStyle = `hsl(${rand(220, 260)}, ${rand(6, 12)}%, ${rand(30, 40)}%)`; g.fillRect(x, 0, 32, h); g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x, 0, 2, h); for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + rand(4, 28), rand(0, h), 1.5, rand(20, 80)); } }
      speckle(g, w, h, ['#2a2a34', '#5a5a66'], 1500, 1, 2); return;
    }
    if (T.style === 'volcano') {                                   // nhà đá đen
      g.fillStyle = '#2e2622'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 40) for (let x = (y / 40) % 2 ? -32 : 0; x < w; x += 64) { g.fillStyle = `hsl(${rand(10, 25)}, ${rand(8, 16)}%, ${rand(22, 32)}%)`; g.beginPath(); g.roundRect(x + 2, y + 2, 60, 36, 5); g.fill(); }
      speckle(g, w, h, ['#1a1412', '#4a3a34'], 1500, 1, 2.5); return;
    }
    const gr = g.createLinearGradient(0, 0, 0, h);
    const c = new THREE.Color(T.wall); gr.addColorStop(0, '#' + c.clone().offsetHSL(0, 0, 0.04).getHexString()); gr.addColorStop(1, '#' + c.clone().offsetHSL(0, 0.02, -0.08).getHexString());
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    speckle(g, w, h, ['#d8c9a6', '#fff6df', '#e2d4b2', '#cbbb98'], 5000, 1, 2.5);
  }, [4, 1]);
  const plasterMat = new THREE.MeshStandardMaterial({ map: plaster, roughness: 0.92, envMapIntensity: 0.5 });
  box(16, 5.2, 10, [plasterMat, plasterMat, plasterMat, plasterMat, new THREE.MeshBasicMaterial({ visible: false }), plasterMat], 0, 3.3, 0, H);   // mặt trước dựng riêng (có lỗ cửa)
  // mặt tiền có LỖ CỬA THẬT → cửa mở / bị phá thì nhìn thấy sảnh bên trong nhà
  const DX = 0.975, DY = 3.85;
  const facade = (x0, x1, y0, y1) => {
    const gq = new THREE.PlaneGeometry(x1 - x0, y1 - y0), uv = gq.attributes.uv, ps = gq.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (ps.getX(i) + (x0 + x1) / 2 + 8) / 16, (ps.getY(i) + (y0 + y1) / 2 - 0.7) / 5.2);
    put(new THREE.Mesh(gq, plasterMat), (x0 + x1) / 2, (y0 + y1) / 2, F, H);
  };
  facade(-8, -DX, 0.7, 5.9); facade(DX, 8, 0.7, 5.9); facade(-DX, DX, DY, 5.9);
  buildFoyer(H, F);
  for (const x of [-8.02, 8.02]) for (const z of [-5.02, 5.02]) for (let i = 0; i < 7; i++) {   // đá góc (quoin) so le
    const big = i % 2 === 0; box(big ? 0.62 : 0.42, 0.66, big ? 0.62 : 0.42, whiteD, x, 1.05 + i * 0.72, z, H);
  }
  box(16.3, 0.32, 10.3, white, 0, 5.62, 0, H);                                    // diềm trắng dưới mái

  // ---- mái ngói ống: so le, sống ngói bắt sáng, bóng hàng trên ----
  const roofTex = ctex(512, 512, (g, w, h) => {
    g.fillStyle = T.roof[3]; g.fillRect(0, 0, w, h);
    const rows = 8, cols = 10, rh = h / rows, cw = w / cols;
    for (let r = rows - 1; r >= 0; r--) for (let c = 0; c <= cols; c++) {
      const x = c * cw - (r % 2 ? cw / 2 : 0), y = r * rh;
      const gr = g.createLinearGradient(x, 0, x + cw, 0);
      gr.addColorStop(0, T.roof[3]); gr.addColorStop(0.3, T.roof[1]); gr.addColorStop(0.55, T.roof[2]); gr.addColorStop(1, T.roof[0]);
      g.fillStyle = gr; g.beginPath(); g.roundRect(x + 2, y + 1, cw - 4, rh + 8, [2, 2, cw / 2.2, cw / 2.2]); g.fill();
      g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(x + cw * 0.34, y + 6, cw * 0.09, rh - 4);
      g.fillStyle = `rgba(0,0,0,${rand(0, 0.14)})`; g.beginPath(); g.roundRect(x + 2, y + 1, cw - 4, rh + 8, [2, 2, cw / 2.2, cw / 2.2]); g.fill();
    }
    for (let r = 0; r < rows; r++) { g.fillStyle = 'rgba(0,0,0,.32)'; g.fillRect(0, r * rh, w, 4); }
  }, [0.62, 0.62]);
  if (T.style !== 'adobe') {
  put(new THREE.Mesh(hipRoof(16, 10, 4.6, 1.0), new THREE.MeshStandardMaterial({ map: roofTex, bumpMap: roofTex, bumpScale: 1.2, roughness: 0.6, envMapIntensity: 0.6, side: THREE.DoubleSide })), 0, 5.9, 0, H);
  box(18.2, 0.34, 0.22, white, 0, 5.82, 6.02, H); box(18.2, 0.34, 0.22, white, 0, 5.82, -6.02, H);
  box(0.22, 0.34, 12.2, white, 9.02, 5.82, 0, H); box(0.22, 0.34, 12.2, white, -9.02, 5.82, 0, H);
  for (const z of [6.18, -6.18]) { const gt = cyl(0.13, 0.13, 18.3, metal, 0, 5.7, z, H, 10); gt.rotation.z = Math.PI / 2; }   // máng xối
  for (const x of [-8.85, 8.85]) { cyl(0.07, 0.07, 5.4, metal, x, 3.05, 6.15, H, 8); box(0.16, 0.12, 0.3, metal, x, 0.4, 6.25, H); }   // ống thoát nước
  const ridge = cyl(0.24, 0.24, 6.3, MS(new THREE.Color(T.roof[3]).getHex(), 0.55), 0, 10.5, 0, H, 12); ridge.rotation.z = Math.PI / 2;
  for (const x of [-3.15, 3.15]) sph(0.26, MS(new THREE.Color(T.roof[3]).getHex(), 0.55), x, 10.5, 0, H);
  // ống khói gạch
  const brick = ctex(128, 128, (g, w, h) => {
    g.fillStyle = '#d9c7b5'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? -16 : 0; x < w; x += 32) { g.fillStyle = `hsl(${rand(6, 14)}, ${rand(45, 60)}%, ${rand(33, 44)}%)`; g.fillRect(x + 1.5, y + 1.5, 29, 13); }
  }, [2, 3]);
  box(1.4, 3.4, 1.4, new THREE.MeshStandardMaterial({ map: brick, roughness: 0.9 }), 4.5, 9.4, -1.8, H);
  box(1.75, 0.28, 1.75, MS(0x9a948a, 0.8), 4.5, 11.15, -1.8, H); box(0.9, 0.2, 0.9, darkM, 4.5, 11.35, -1.8, H);
  cyl(0.04, 0.04, 2.6, metal, -3.5, 11.6, -1, H, 6); const ant = cyl(0.03, 0.03, 2.2, metal, -3.5, 12.6, -1, H, 6); ant.rotation.z = Math.PI / 2;
  } else {                                                        // nhà đất sa mạc: mái bằng, tường chắn mái, đầu xà gỗ nhô ra, gác nhỏ
    const adobeD = MS(new THREE.Color(T.wall).offsetHSL(0, 0, -0.1).getHex(), 0.95);
    box(16.4, 0.5, 10.4, adobeD, 0, 6.1, 0, H);
    for (const [w, d, x, z] of [[16.4, 0.35, 0, 5.03], [16.4, 0.35, 0, -5.03], [0.35, 10.4, 8.03, 0], [0.35, 10.4, -8.03, 0]]) box(w, 0.8, d, adobeD, x, 6.75, z, H);
    for (let x = -7.2; x <= 7.3; x += 1.2) { const b = cyl(0.14, 0.14, 1.0, MS(0x6a4422, 0.9), x, 5.5, F + 0.3, H, 8); b.rotation.x = Math.PI / 2; }
    box(4.2, 2.2, 3.2, adobeD, -3.5, 7.4, -1.5, H); box(1.0, 1.3, 0.1, MS(0x3a2a1a, 0.9), -3.5, 7.3, 0.12, H);
    for (const x of [-5.2, -1.8]) { const b = cyl(0.11, 0.11, 0.7, MS(0x6a4422, 0.9), x, 8.3, 0.2, H, 8); b.rotation.x = Math.PI / 2; }
    for (const x of [3.2, 4.4, 5.6]) cyl(0.32, 0.25, 0.55, MS(0xb5653a, 0.85), x, 6.62, 3.6, H, 12);
  }

  // ---- cửa sổ: khung sâu, kính phản chiếu + rèm, lá chống, bậu, hộp hoa ----
  const glassTex = ctex(128, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#cfe9fb'); gr.addColorStop(0.45, '#6fa6cf'); gr.addColorStop(1, '#2d4a66');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(20, 0); g.lineTo(55, 0); g.lineTo(15, h); g.lineTo(-20, h); g.fill();   // vệt phản chiếu
    g.fillStyle = '#f3ead6'; g.fillRect(0, 0, 18, h); g.fillRect(w - 18, 0, 18, h);                                                   // rèm
    g.fillStyle = 'rgba(0,0,0,.12)'; for (let x = 3; x < 18; x += 5) { g.fillRect(x, 0, 2, h); g.fillRect(w - 18 + x, 0, 2, h); }
  });
  const glassMat = new THREE.MeshStandardMaterial({ map: glassTex, roughness: 0.12, metalness: 0.25, envMapIntensity: 1.1 });
  if (T.style === 'haunted') { glassMat.emissive = new THREE.Color(0x3aff8a); glassMat.emissiveIntensity = 0.4; }      // ánh xanh ma quái trong nhà
  else if (T.night || T.style === 'volcano') { glassMat.emissive = new THREE.Color(0xffa040); glassMat.emissiveIntensity = 0.35; }
  const shutterTex = ctex(64, 128, (g, w, h) => {
    g.fillStyle = '#' + new THREE.Color(shutterCol).getHexString(); g.fillRect(0, 0, w, h);
    for (let y = 8; y < h - 6; y += 7) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(6, y, w - 12, 2); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(6, y + 2, w - 12, 1); }
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
  });
  const shutterMat = new THREE.MeshStandardMaterial({ map: shutterTex, roughness: 0.7 });
  const flowerCols = [0xff4d6d, 0xffd21f, 0xff8a3a, 0xffffff, 0xd36bff];
  function windowAt(x, y, z, ry, wdt, hgt, withBox) {
    const Wd = new THREE.Group(); Wd.position.set(x, y, z); Wd.rotation.y = ry; H.add(Wd);
    box(wdt, hgt, 0.08, glassMat, 0, 0, -0.06, Wd);
    box(wdt + 0.36, 0.18, 0.26, white, 0, hgt / 2 + 0.09, 0.04, Wd); box(wdt + 0.36, 0.18, 0.26, white, 0, -hgt / 2 - 0.09, 0.04, Wd);
    box(0.18, hgt, 0.26, white, -wdt / 2 - 0.09, 0, 0.04, Wd); box(0.18, hgt, 0.26, white, wdt / 2 + 0.09, 0, 0.04, Wd);
    box(0.09, hgt, 0.12, white, 0, 0, 0.0, Wd); box(wdt, 0.09, 0.12, white, 0, 0.1, 0.0, Wd);           // song cửa
    box(wdt + 0.6, 0.14, 0.42, white, 0, -hgt / 2 - 0.22, 0.14, Wd);                                     // bậu
    box(0.5, 0.3, 0.3, whiteD, 0, hgt / 2 + 0.3, 0.06, Wd);                                               // đá khoá đầu cửa
    for (const sx of [-1, 1]) { const sh = box(wdt * 0.48, hgt + 0.2, 0.06, shutterMat, sx * (wdt / 2 + 0.18 + wdt * 0.24), 0, 0.08, Wd); sh.rotation.y = sx * -0.12; }
    if (withBox) {
      box(wdt + 0.3, 0.36, 0.42, MS(0x7a4a24, 0.85), 0, -hgt / 2 - 0.48, 0.24, Wd);
      for (let i = 0; i < 9; i++) { const fx = -wdt / 2 + 0.05 + i * (wdt / 8); sph(0.12, MS(0x3f8f2e, 0.8), fx, -hgt / 2 - 0.26, 0.26, Wd); sph(0.1, MS(pick(flowerCols), 0.6), fx + rand(-0.04, 0.04), -hgt / 2 - 0.16, 0.32, Wd); }
    }
  }
  for (const x of [-4.9, 4.9]) windowAt(x, 3.6, F + 0.06, 0, 2.3, 1.9, true);
  for (const sx of [-1, 1]) windowAt(sx * 8.06, 3.6, 0, sx * Math.PI / 2, 2.0, 1.7, false);       // cửa sổ tường bên

  // ---- cửa chính: khung, ô kính trên, mái che, đèn lồng, số nhà ----
  for (const sx of [-1, 1]) box(0.3, 3.55, 0.24, white, sx * 1.125, 0.7 + 1.775, F + 0.02, H);   // khung cửa: 2 bên + đầu
  box(2.55, 0.4, 0.24, white, 0, 4.05, F + 0.02, H);
  for (const sx of [-1, 1]) box(0.06, 3.15, 0.5, whiteD, sx * 1.0, 2.275, F - 0.22, H);            // độ dày tường ở mép lỗ cửa
  box(2.0, 0.06, 0.5, whiteD, 0, 3.88, F - 0.22, H);
  box(2.0, 0.5, 0.08, glassMat, 0, 4.15, F + 0.06, H); box(2.55, 0.14, 0.26, white, 0, 4.47, F + 0.06, H);   // ô kính trên cửa
  const woodTex = ctex(128, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#6e3c1e'); gr.addColorStop(0.5, '#8a4f28'); gr.addColorStop(1, '#6e3c1e');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 3) { g.fillStyle = `rgba(40,20,8,${rand(0.04, 0.16)})`; g.fillRect(x, 0, 1.5, h); }
    g.strokeStyle = 'rgba(25,12,4,.55)'; g.lineWidth = 6; g.strokeRect(16, 112, 44, 62); g.strokeRect(68, 112, 44, 62); g.strokeRect(16, 184, 44, 58); g.strokeRect(68, 184, 44, 58);
    g.strokeStyle = 'rgba(255,220,180,.18)'; g.lineWidth = 2; g.strokeRect(19, 115, 38, 56); g.strokeRect(71, 115, 38, 56);
    g.fillStyle = '#9fd2f0'; g.fillRect(18, 18, 92, 72); g.strokeStyle = '#f7f3ea'; g.lineWidth = 6; g.strokeRect(18, 18, 92, 72); g.beginPath(); g.moveTo(64, 18); g.lineTo(64, 90); g.moveTo(18, 54); g.lineTo(110, 54); g.stroke();
  });
  door.mat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.6, envMapIntensity: 0.5 });
  door.pivot = new THREE.Group(); door.pivot.position.set(-0.95, 0.7, F + 0.15); H.add(door.pivot);
  door.panel = box(1.9, 3.12, 0.12, door.mat, 0.95, 1.56, 0, door.pivot);
  sph(0.08, MS(0xffd36a, 0.25, 0.9), 1.65, 1.45, 0.1, door.pivot); box(0.05, 0.3, 0.04, MS(0xffd36a, 0.25, 0.9), 1.65, 1.6, 0.08, door.pivot);
  door.baseX = -0.95;
  // mái che nhỏ trên cửa (2 mái dốc) + công-xon
  const canopy = new THREE.Group(); canopy.position.set(0, 4.85, F + 0.55); H.add(canopy);
  const cMat = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.6 });
  for (const sx of [-1, 1]) { const pl = box(1.75, 0.12, 1.2, cMat, sx * 0.78, 0.32, 0, canopy); pl.rotation.z = sx * -0.42; }
  box(3.1, 0.16, 1.25, white, 0, -0.02, 0, canopy);
  for (const sx of [-1, 1]) { const br = box(0.12, 0.6, 0.12, white, sx * 1.35, -0.32, -0.25, canopy); br.rotation.x = 0.6; }
  // đèn lồng hai bên cửa
  for (const sx of [-1, 1]) {
    const L = new THREE.Group(); L.position.set(sx * 1.75, 3.25, F + 0.3); H.add(L);
    box(0.34, 0.5, 0.34, darkM, 0, 0, 0, L); box(0.26, 0.38, 0.36, new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffc04a, emissiveIntensity: 2.2 }), 0, 0, 0, L);
    const capL = new THREE.Mesh(geo('lampcap', () => new THREE.ConeGeometry(0.3, 0.22, 4)), darkM); capL.rotation.y = Math.PI / 4; put(capL, 0, 0.36, 0, L);
    box(0.1, 0.14, 0.2, darkM, 0, 0, -0.22, L);
  }
  const plate = box(0.5, 0.32, 0.05, MS(0x1f3b5a, 0.4, 0.3), 1.75, 2.45, F + 0.06, H);   // biển số nhà
  plate.material = new THREE.MeshStandardMaterial({ map: ctex(128, 80, (g, w, h) => { g.fillStyle = '#1f3b5a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#f7f3ea'; g.lineWidth = 5; g.strokeRect(5, 5, w - 10, h - 10); g.fillStyle = '#f7f3ea'; g.font = 'bold 46px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('69', w / 2, h / 2 + 3); }), roughness: 0.4 });

  // ---- bậc thềm có viền mép, chậu cây cắt tròn, thảm chùi chân ----
  box(4.2, 0.7, 1.2, MS(0xdcd8cf, 0.85), 0, 0.35, F + 0.6, H); box(4.32, 0.06, 1.28, white, 0, 0.71, F + 0.62, H);
  box(4.6, 0.35, 0.7, MS(0xd0ccc2, 0.85), 0, 0.175, F + 1.55, H); box(4.72, 0.06, 0.78, white, 0, 0.36, F + 1.57, H);
  box(1.5, 0.03, 0.8, MS(0x8a5a2e, 0.95), 0, 0.745, F + 0.55, H);
  for (const sx of [-1, 1]) {
    cyl(0.32, 0.24, 0.55, MS(0xa8502c, 0.8), sx * 2.75, 0.28, F + 1.35, H, 14); cyl(0.33, 0.33, 0.06, MS(0x8a3e20, 0.8), sx * 2.75, 0.56, F + 1.35, H, 14);
    cyl(0.04, 0.05, 0.6, MS(0x5a3a20, 0.9), sx * 2.75, 0.85, F + 1.35, H, 6);
    const ball = new THREE.Mesh(geo('topi', () => blobGeo(2, 0.08, 6.1)), MS(0x3f8f2e, 0.85)); ball.scale.setScalar(0.42); put(ball, sx * 2.75, 1.35, F + 1.35, H);
  }
  const patioTex = ctex(128, 128, (g, w, h) => { g.fillStyle = '#e8e4dc'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(120,115,105,.45)'; g.lineWidth = 2; for (let i = 0; i <= w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } speckle(g, w, h, ['#d2cdc2', '#f4f1ea'], 300, 1, 2); }, [4, 2.25]);
  const patio = box(8, 0.1, 4.5, new THREE.MeshStandardMaterial({ map: patioTex, roughness: 0.85 }), 0, 0.05, F + 2.6, H); patio.castShadow = false;

  // ---- bồn hoa viền gạch dọc tường + hướng dương + bụi tròn góc nhà ----
  for (const sx of [-1, 1]) {
    const cx = sx * 5.1;
    box(5.0, 0.18, 1.0, MS(0x4a3020, 1), cx, 0.09, F + 0.65, H);
    box(5.1, 0.24, 0.12, MS(0xb5654a, 0.85), cx, 0.12, F + 1.17, H);
    for (let i = 0; i < 16; i++) { const fx = cx + rand(-2.3, 2.3), fz = F + rand(0.3, 1.0); sph(0.13, MS(0x3a8a2c, 0.85), fx, 0.24, fz, H); sph(0.09, MS(pick(flowerCols), 0.6), fx + rand(-0.05, 0.05), 0.36, fz, H); }
    const bush = new THREE.Mesh(geo('cbush', () => blobGeo(2, 0.12, 7.7)), MS(0x3a7f2a, 0.85)); bush.scale.set(0.95, 0.8, 0.95); put(bush, sx * 7.6, 0.75, F + 0.7, H);
  }
  if (T.sunflowers) for (let i = 0; i < 4; i++) for (const s2 of [-1, 1]) sunflower(s2 * (3.3 + i * 1.15 + rand(-0.12, 0.12)), F + 0.55 + rand(-0.1, 0.2), rand(1.6, 2.3), H);
  // ---- hàng rào trắng đầu nhọn hai bên nhà ----
  for (const s2 of [-1, 1]) {
    for (let x = 8.8; x < 15; x += 0.4) { box(0.16, 1.0, 0.07, white, s2 * x, 0.55, F + 0.6, H); const tp = new THREE.Mesh(geo('picktip', () => new THREE.ConeGeometry(0.115, 0.2, 4)), white); tp.rotation.y = Math.PI / 4; tp.scale.z = 0.4; put(tp, s2 * x, 1.15, F + 0.6, H); }
    box(6.4, 0.1, 0.06, white, s2 * 11.9, 0.85, F + 0.55, H); box(6.4, 0.1, 0.06, white, s2 * 11.9, 0.35, F + 0.55, H);
  }
  houseDeco(H, F);
  H.updateMatrixWorld(true);
  door.house = H;
}

// =====================================================================
// Hiệu ứng: bụi, mảnh vỡ, nổ, chữ bay
// =====================================================================
const softTex = ctex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
const starTex = ctex(64, 64, (g) => { g.fillStyle = '#fff'; g.translate(32, 32); g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 9 : 30, a = i / 10 * Math.PI * 2 - Math.PI / 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill(); });
const parts = [], debrisList = [];
function puff(pos, o = {}) {
  const { color = 0xffffff, n = 6, speed = 2, size = 0.8, life = 0.8, up = 1, grav = 0, add = false, tex = softTex, grow = 1.8, opacity = 0.85 } = o;
  for (let i = 0; i < n; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
    const s = new THREE.Sprite(mat); s.position.copy(pos); const sz = size * rand(0.7, 1.3); s.scale.setScalar(sz); scene.add(s);
    parts.push({ s, mat, v: new V3(rand(-1, 1), rand(0.1, 1) * up, rand(-1, 1)).multiplyScalar(speed).add(o.vel || new V3()), t: 0, life: life * rand(0.7, 1.2), sz, grow, grav, op: opacity });
  }
}
function debris(pos, color, n = 8, size = 0.16, speed = 6) {
  for (let i = 0; i < n; i++) {
    const m = box(size * rand(0.6, 1.6), size * rand(0.4, 1), size * rand(0.6, 2), MS(color, 0.85), pos.x, pos.y, pos.z, scene);
    debrisList.push({ m, v: new V3(rand(-1, 1) * speed * 0.6, rand(0.5, 1.2) * speed, rand(-1, 1) * speed * 0.6), w: new V3(rand(-10, 10), rand(-10, 10), rand(-10, 10)), t: 0, life: rand(1.2, 1.8), s0: m.scale.clone() });
  }
}
const flash = new THREE.PointLight(0xffa040, 0, 18); scene.add(flash);
function explosion(pos, scale = 1) {
  puff(pos.clone().setY(1), { color: 0xffa030, n: 14, speed: 6 * scale, size: 2.2 * scale, life: 0.5, add: true, grow: 2.2 });
  puff(pos.clone().setY(1.2), { color: 0xfff1a0, n: 6, speed: 3 * scale, size: 1.6 * scale, life: 0.3, add: true });
  puff(pos.clone().setY(1.5), { color: 0x555555, n: 12, speed: 3 * scale, size: 2.6 * scale, life: 1.4, up: 1.5, opacity: 0.7 });
  debris(pos.clone().setY(0.5), 0x4a3a2a, 10, 0.2, 9);
  const ring = new THREE.Mesh(geo('ring', () => new THREE.RingGeometry(0.85, 1, 40)), new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.copy(pos).setY(0.1); scene.add(ring);
  parts.push({ ring, t: 0, life: 0.45, r: 5 * scale });
  flash.color.setHex(0xffa040); flash.position.copy(pos).setY(2); flash.intensity = 120 * scale;
  camShake = Math.max(camShake, 0.6 * scale); sfx('boom');
}
function updateFx(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.t += dt; const k = p.t / p.life;
    if (p.ring) { p.ring.scale.setScalar(0.2 + p.r * k); p.ring.material.opacity = 0.9 * (1 - k); if (k >= 1) { scene.remove(p.ring); p.ring.material.dispose(); parts.splice(i, 1); } continue; }
    p.v.y -= p.grav * dt; p.v.multiplyScalar(Math.exp(-1.8 * dt)); p.s.position.addScaledVector(p.v, dt);
    p.s.scale.setScalar(p.sz * (1 + (p.grow - 1) * k)); p.mat.opacity = p.op * (1 - k);
    if (k >= 1) { scene.remove(p.s); p.mat.dispose(); parts.splice(i, 1); }
  }
  for (let i = debrisList.length - 1; i >= 0; i--) {
    const d = debrisList[i]; d.t += dt;
    d.v.y -= 24 * dt; d.m.position.addScaledVector(d.v, dt);
    if (d.m.position.y < 0.05) { d.m.position.y = 0.05; d.v.y *= -0.3; d.v.x *= 0.6; d.v.z *= 0.6; d.w.multiplyScalar(0.6); }
    d.m.rotation.x += d.w.x * dt; d.m.rotation.y += d.w.y * dt; d.m.rotation.z += d.w.z * dt;
    const k = d.t / d.life; if (k > 0.7) d.m.scale.copy(d.s0).multiplyScalar((1 - k) / 0.3);
    if (k >= 1) { scene.remove(d.m); debrisList.splice(i, 1); }
  }
  flash.intensity *= Math.exp(-dt * 12);
}
// ----- nhãn HTML chiếu từ 3D -----
const tv = new V3();
function placeEl(el, x, y, z, base = 12, mn = 0.35, mx = 1.25) {
  tv.set(x, y, z); const d = tv.distanceTo(camera.position); tv.project(camera);
  if (tv.z > 1 || tv.z < -1 || Math.abs(tv.x) > 1.3) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.style.transform = `translate(${(tv.x * 0.5 + 0.5) * GW}px,${(-tv.y * 0.5 + 0.5) * GH}px) translate(-50%,-100%) scale(${clamp(base / d, mn, mx)})`;
}
function makeLabel(cls) { const el = document.createElement('div'); el.className = 'lab ' + (cls || ''); labelsEl.appendChild(el); return el; }
function ownerLabel(user, hpBar) {
  const el = makeLabel('itag'); el.appendChild(avatarEl(user));
  const sp = document.createElement('span'); sp.textContent = user.name; el.appendChild(sp);
  let bar = null; if (hpBar) { const b = document.createElement('div'); b.className = 'ihp'; b.innerHTML = '<i></i>'; el.appendChild(b); bar = b.firstChild; }
  return { el, bar };
}
const pops = [];
function popText(pos, text, cls = 'dmg', life = 0.95) {
  if (pops.length > 40) { const o = pops.shift(); o.el.remove(); }
  const el = document.createElement('div'); el.className = 'pt ' + cls; el.textContent = text; labelsEl.appendChild(el);
  pops.push({ el, p: pos.clone().add(new V3(rand(-0.5, 0.5), 0, 0)), t: 0, life });
}
function updatePops(dt) {
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i]; p.t += dt; const k = p.t / p.life;
    tv.set(p.p.x, p.p.y + p.t * 1.6, p.p.z); const d = tv.distanceTo(camera.position); tv.project(camera);
    const s = clamp(14 / d, 0.5, 1.4) * (p.t < 0.12 ? 0.6 + p.t / 0.12 * 0.6 : 1.2 - Math.min(0.2, (p.t - 0.12)));
    p.el.style.transform = `translate(${(tv.x * 0.5 + 0.5) * GW}px,${(-tv.y * 0.5 + 0.5) * GH}px) translate(-50%,-100%) scale(${s})`;
    p.el.style.opacity = String(k > 0.7 ? (1 - k) / 0.3 : 1);
    if (k >= 1) { p.el.remove(); pops.splice(i, 1); }
  }
}

// =====================================================================
// Trạng thái
// =====================================================================
const state = { phase: 'loading', t: 0, win: 0, count: 0, roundT: CONFIG.roundSeconds };
const players = new Map(), roundPts = new Map();
let time = 0, camShake = 0;
const timers = [];
const later = (d, fn) => timers.push({ t: time + d, fn });
function addPoints(user, pts) {
  if (!user || !user.id) return;
  let p = players.get(user.id); if (!p) { p = { id: user.id, name: user.name, avatar: user.avatar, pts: 0 }; players.set(user.id, p); }
  if (user.avatar) p.avatar = user.avatar; p.pts += pts;
  roundPts.set(user.id, (roundPts.get(user.id) || 0) + pts);
}

// =====================================================================
// QUÁI VẬT (streamer)
// =====================================================================
const mon = {
  root: new THREE.Group(), tilt: new THREE.Group(), ready: false, actions: {}, cur: '',
  x: 0, y: 0, gy: 0, z: START_Z, vy: 0, kv: 0, charT: 0, flip: null, windLean: 0,
  stun: 0, lastHurt: -99, flash: 0, lift: null, carry: null, attackT: 0, avoid: null,
  aiX: 0, aiT: 0, speedUntil: 0, armorUntil: 0, stamina: 1, punchBoost: 0, mats: [], blocker: null,
};
mon.root.add(mon.tilt); scene.add(mon.root);
// ----- ZOMBIE (streamer): dựng bằng khối bo tròn, chuyển động lê bước khập khiễng -----
const zPlaid = ctex(128, 128, (g, w, h) => {
  g.fillStyle = '#b8322a'; g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.55; g.fillStyle = '#2a1414';
  for (let i = 0; i < w; i += 32) { g.fillRect(i + 10, 0, 9, h); g.fillRect(0, i + 10, w, 9); }
  g.globalAlpha = 0.35; g.fillStyle = '#f2d6c0';
  for (let i = 0; i < w; i += 32) { g.fillRect(i + 26, 0, 2, h); g.fillRect(0, i + 26, w, 2); }
  g.globalAlpha = 1; speckle(g, w, h, ['#5a1a14', '#e0705a'], 300, 1, 2);
}, [2, 2]);
const zSkinTex = ctex(128, 128, (g, w, h) => {             // da zombie loang lổ
  g.fillStyle = '#8fc15a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) { g.fillStyle = Math.random() < 0.6 ? `rgba(90,130,50,${rand(0.15, 0.35)})` : `rgba(190,225,140,${rand(0.15, 0.3)})`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, rand(6, 18), rand(4, 12), rand(0, 3), 0, 7); g.fill(); }
  speckle(g, w, h, ['#5f8a38', '#a6d47a', '#6e7a3a'], 500, 1, 2.5);
  g.strokeStyle = 'rgba(80,60,90,.25)'; g.lineWidth = 1.2; for (let i = 0; i < 5; i++) { g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += rand(-12, 12); y += rand(-12, 12); g.lineTo(x, y); } g.stroke(); }   // gân tím
});
const zDenim = ctex(128, 128, (g, w, h) => {
  g.fillStyle = '#41639a'; g.fillRect(0, 0, w, h); speckle(g, w, h, ['#2e4a78', '#6a8cc4', '#5577aa'], 2500, 1, 2);
  g.fillStyle = '#7c96c0'; g.fillRect(70, 60, 26, 22); g.strokeStyle = '#e8c070'; g.setLineDash([3, 3]); g.strokeRect(70, 60, 26, 22);
}, [1, 2]);
function buildZombie() {
  const mats = [];
  const M = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.72, envMapIntensity: 0.45, ...o }); mats.push(m); return m; };
  const skin = M(0xffffff, { map: zSkinTex, roughness: 0.68 }), skinD = M(0x5f8c3a), shirt = M(0xffffff, { map: zPlaid }), pants = M(0xffffff, { map: zDenim }),
    shoe = M(0x4a2e1c), hair = M(0x33241a), white = M(0xf6f2e2, { roughness: 0.35 }), black = M(0x101010, { roughness: 0.25 }),
    mouthM = M(0x3a0c10), tooth = M(0xeee6c8, { roughness: 0.4 });
  const cap = (r, l) => geo(`zcap${r}_${l}`, () => new THREE.CapsuleGeometry(r, l, 6, 14));
  const mk = (g, m, par, x = 0, y = 0, z = 0) => put(new THREE.Mesh(g, m), x, y, z, par);
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.86; root.add(hips);
  const legs = [];
  for (const sx of [-1, 1]) {
    const thigh = new THREE.Group(); thigh.position.set(sx * 0.12, -0.02, 0); hips.add(thigh);
    mk(cap(0.095, 0.24), pants, thigh, 0, -0.2, 0);
    const knee = new THREE.Group(); knee.position.y = -0.42; thigh.add(knee);
    mk(cap(0.085, 0.24), pants, knee, 0, -0.18, 0);
    const cuff = mk(geo('zcuff', () => new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12)), pants, knee, 0, -0.33, 0);
    const f = mk(GSPH, shoe, knee, 0, -0.4, 0.05); f.scale.set(0.095, 0.065, 0.16);
    void cuff; legs.push({ thigh, knee, foot: f });
  }
  const torso = new THREE.Group(); hips.add(torso);
  const body = mk(cap(0.2, 0.2), shirt, torso, 0, 0.27, 0); body.scale.set(1.18, 1, 0.8);
  const belt = mk(GSPH, pants, torso, 0, 0.04, 0); belt.scale.set(0.235, 0.09, 0.17);
  for (let i = 0; i < 4; i++) { const r = mk(GBOX, black, torso, rand(-0.18, 0.18), rand(0.12, 0.42), 0.165); r.scale.set(rand(0.03, 0.06), rand(0.02, 0.05), 0.01); } // chỗ áo rách
  const neck = new THREE.Group(); neck.position.y = 0.56; torso.add(neck);
  mk(cap(0.055, 0.05), skinD, neck, 0, 0.03, 0);
  for (const sx of [-1, 1]) { const c = mk(GBOX, shirt, torso, sx * 0.08, 0.535, 0.1); c.scale.set(0.12, 0.03, 0.1); c.rotation.set(-0.35, 0, sx * -0.5); }   // cổ áo
  const head = new THREE.Group(); head.position.y = 0.1; neck.add(head);
  const skull = mk(GSPH, skin, head, 0, 0.18, -0.005); skull.scale.set(0.205, 0.235, 0.2);
  const browR = mk(GSPH, skin, head, 0, 0.258, 0.11); browR.scale.set(0.178, 0.05, 0.09);        // trán gồ
  const chin = mk(GSPH, skin, head, 0.012, 0.055, 0.04); chin.scale.set(0.15, 0.085, 0.135);      // cằm hơi lệch
  for (const sx of [-1, 1]) {
    const hollow = mk(GSPH, skinD, head, sx * 0.118, 0.118, 0.125); hollow.scale.set(0.045, 0.035, 0.03);   // má hóp
    const ear = mk(GSPH, skin, head, sx * 0.205, 0.17, -0.01); ear.scale.set(0.03, 0.062, 0.046);
    const earIn = mk(GSPH, skinD, head, sx * 0.222, 0.17, 0.002); earIn.scale.set(0.012, 0.04, 0.028);
  }
  // hốc mắt thâm + mắt to/nhỏ, mí trĩu, con ngươi lác
  const sockL = mk(GSPH, skinD, head, -0.076, 0.2, 0.132); sockL.scale.set(0.088, 0.082, 0.05);
  const sockR = mk(GSPH, skinD, head, 0.08, 0.196, 0.138); sockR.scale.set(0.066, 0.062, 0.042);
  const eyeW = M(0xefe8c4, { roughness: 0.28 }), glintM = M(0xffffff, { roughness: 0.1 });
  mk(GSPH, eyeW, head, -0.076, 0.205, 0.15).scale.setScalar(0.07);
  mk(GSPH, black, head, -0.097, 0.198, 0.213).scale.setScalar(0.024);
  mk(GSPH, glintM, head, -0.089, 0.209, 0.233).scale.setScalar(0.008);
  mk(GSPH, eyeW, head, 0.08, 0.198, 0.157).scale.setScalar(0.047);
  mk(GSPH, black, head, 0.086, 0.21, 0.199).scale.setScalar(0.016);
  mk(GSPH, glintM, head, 0.091, 0.216, 0.212).scale.setScalar(0.006);
  const lidGeo = geo('zlid', () => new THREE.SphereGeometry(1, 18, 9, 0, Math.PI * 2, 0, Math.PI * 0.5));
  const lidL = mk(lidGeo, skin, head, -0.076, 0.205, 0.15); lidL.scale.setScalar(0.075); lidL.rotation.x = 0.62;
  const lidR = mk(lidGeo, skin, head, 0.08, 0.198, 0.157); lidR.scale.setScalar(0.051); lidR.rotation.x = 0.3;
  const bL = mk(GBOX, hair, head, -0.08, 0.285, 0.165); bL.scale.set(0.105, 0.024, 0.026); bL.rotation.z = 0.22;   // lông mày lệch
  const bR = mk(GBOX, hair, head, 0.085, 0.272, 0.165); bR.scale.set(0.085, 0.022, 0.024); bR.rotation.z = -0.45;
  const nose = mk(GSPH, skinD, head, 0.012, 0.148, 0.195); nose.scale.set(0.028, 0.036, 0.034); nose.rotation.z = 0.2;   // mũi lệch
  for (const sx of [-1, 1]) mk(GSPH, black, head, 0.012 + sx * 0.012, 0.127, 0.215).scale.set(0.007, 0.005, 0.005);
  // vết khâu trên trán
  const scar = mk(GBOX, black, head, 0.07, 0.33, 0.145); scar.scale.set(0.1, 0.006, 0.006); scar.rotation.set(-0.5, 0, -0.32);
  for (let i = 0; i < 4; i++) { const st = mk(GBOX, black, head, 0.035 + i * 0.024, 0.342 - i * 0.008, 0.143); st.scale.set(0.004, 0.026, 0.006); st.rotation.set(-0.5, 0, -0.32); }
  // miệng há: răng lởm chởm sứt 1 chiếc, lưỡi, môi dưới trề (hàm động)
  const jaw = new THREE.Group(); jaw.position.set(0.005, 0.075, 0.16); head.add(jaw);
  const mouth = mk(GSPH, mouthM, jaw, 0, 0, 0); mouth.scale.set(0.08, 0.038, 0.03);
  mk(GSPH, M(0xb0465a, { roughness: 0.4 }), jaw, 0.012, -0.018, 0.008).scale.set(0.045, 0.014, 0.02);
  [[-0.05, 0.024, 0.018], [-0.022, 0.026, 0.022], [0.026, 0.025, 0.016], [0.05, 0.022, 0.02]].forEach(([x, y, hh]) => { const t = mk(GBOX, tooth, jaw, x, y, 0.02); t.scale.set(0.02, hh, 0.01); t.rotation.z = rand(-0.2, 0.2); });
  for (const x of [-0.03, 0.035]) { const t = mk(GBOX, tooth, jaw, x, -0.026, 0.02); t.scale.set(0.017, 0.016, 0.01); }
  const lip = mk(GSPH, skinD, jaw, 0, -0.04, 0.012); lip.scale.set(0.072, 0.014, 0.022);
  // tóc dựng từng nhúm
  for (let i = 0; i < 3; i++) { const hb = mk(GSPH, hair, head, rand(-0.09, 0.09), 0.37, rand(-0.1, 0.02)); hb.scale.set(0.085, 0.045, 0.085); }
  const strandG = geo('zstrand', () => new THREE.ConeGeometry(1, 1, 6));
  for (let i = 0; i < 11; i++) { const st = mk(strandG, hair, head, rand(-0.12, 0.12), rand(0.38, 0.42), rand(-0.13, 0.06)); st.scale.set(0.032, rand(0.08, 0.15), 0.032); st.rotation.set(rand(-0.7, 0.4), 0, rand(-0.8, 0.8)); }
  const arms = [];
  for (const sx of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(sx * 0.28, 0.46, 0); torso.add(sh);
    mk(cap(0.07, 0.18), shirt, sh, 0, -0.14, 0);
    const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
    mk(cap(0.055, 0.18), skin, el, 0, -0.13, 0);
    const hand = mk(GSPH, skin, el, 0, -0.28, 0.01); hand.scale.set(0.06, 0.075, 0.05);
    for (let k = -1; k <= 1; k++) { const fg = mk(cap(0.017, 0.06), skinD, el, k * 0.03, -0.36, 0.015); fg.rotation.x = 0.2; }
    arms.push({ sh, el });
  }
  root.scale.setScalar(MON_H / 1.95);
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, hips, torso, neck, head, jaw, legs, arms, mats };
}
// tư thế mục tiêu theo trạng thái → khớp xương nội suy mượt về đó
function zTarget(name, t, wph) {
  const P = { hipsY: 0.86, hipsZ: 0, torsoX: 0.16, torsoZ: 0, torsoY: 0, neckX: 0.15, neckZ: 0.12, legL: 0, legR: 0, kneeL: 0.08, kneeR: 0.08, legSpread: 0,
    shLX: -0.12, shLZ: 0.1, shRX: -0.12, shRZ: 0.1, elL: -0.5, elR: -0.5, jaw: 1, rootX: 0, rootY: 0 };
  if (name === 'Walking' || name === 'Running') {
    // zombie: lưng gù, đầu thò tới ngoẹo, tay lủng lẳng trễ nhịp, gối khuỵu, chân phải lết (bước ngắn, nhấc thấp)
    const run = name === 'Running', ph = wph, sn = Math.sin(ph), cs = Math.cos(ph), A = run ? 0.55 : 0.4;
    P.legL = sn * A; P.legR = -sn * A * 0.6;                                   // chân phải lết: bước ngắn
    P.kneeL = 0.25 + Math.max(0, -cs) * (run ? 1.1 : 0.75);                   // gối luôn khuỵu, nhấc chân thấp
    P.kneeR = 0.22 + Math.max(0, cs) * (run ? 0.5 : 0.25);                    // chân lết gần như không nhấc
    P.hipsY = 0.82 - Math.abs(sn) * 0.045 - (sn < 0 ? 0.05 : 0);              // sụp hông mỗi khi dồn lên chân lết
    P.hipsZ = sn * 0.12 + (sn < 0 ? -0.06 : 0); P.torsoZ = -sn * 0.12; P.torsoY = sn * 0.15;
    P.torsoX = (run ? 0.55 : 0.48) + Math.abs(sn) * 0.06;                     // gù lưng
    const lag = Math.sin(ph - 0.7);                                            // tay đánh trễ như bị kéo theo
    P.shLX = -0.38 - lag * 0.22; P.shRX = -0.28 + lag * 0.16; P.shLZ = 0.08; P.shRZ = 0.22;   // tay phải xệ, chìa ra ngoài
    P.elL = -0.3 - Math.abs(lag) * 0.15; P.elR = -0.15;
    P.neckX = 0.38 + Math.abs(cs) * 0.08; P.neckZ = 0.32 + Math.sin(ph * 0.5) * 0.12;   // đầu thò ra trước, ngoẹo sang bên
    P.jaw = 1.5 + Math.sin(t * 3) * 0.4;
  } else if (name === 'Punch') {
    const ph = t * 7;
    P.shLX = -1.5 - 1.15 * Math.max(0, Math.sin(ph)); P.shRX = -1.5 - 1.15 * Math.max(0, Math.sin(ph + Math.PI));
    P.elL = 0.2 + 0.4 * Math.max(0, -Math.sin(ph)); P.elR = 0.2 + 0.4 * Math.max(0, Math.sin(ph));
    P.torsoX = 0.32 + 0.12 * Math.abs(Math.sin(ph)); P.legL = 0.25; P.legR = -0.2; P.kneeL = 0.3; P.kneeR = 0.2;
    P.jaw = 1.8; P.neckZ = 0.15;
  } else if (name === 'Jump') {
    P.legL = -0.8; P.legR = -0.5; P.kneeL = 1.4; P.kneeR = 1.1; P.shLX = -2.7; P.shRX = -2.5; P.shLZ = 0.3; P.shRZ = 0.3; P.torsoX = 0.05; P.jaw = 2;
  } else if (name === 'Wave') {                                                          // bị bóng bay kéo: vùng vẫy
    P.shLX = -2.8 + Math.sin(t * 9) * 0.5; P.shRX = -2.8 + Math.cos(t * 9) * 0.5; P.shLZ = 0.45; P.shRZ = 0.45;
    P.legL = Math.sin(t * 10) * 0.6; P.legR = -Math.sin(t * 10) * 0.6; P.kneeL = 0.6; P.kneeR = 0.6; P.torsoX = 0; P.jaw = 2.2; P.neckZ = Math.sin(t * 4) * 0.3;
  } else if (name === 'Death') {
    P.rootX = -1.45; P.shLX = -0.4; P.shRX = -0.2; P.shLZ = 1.3; P.shRZ = 1.2; P.torsoX = 0; P.neckZ = 0.6; P.legL = -0.2; P.legR = 0.15; P.kneeL = 0.3; P.jaw = 2;
  } else if (name === 'Dance') {                                                         // điệu nhảy zombie
    const ph = t * 6;
    P.shLX = -1.5 + Math.sin(ph) * 0.7; P.shRX = -1.5 - Math.sin(ph) * 0.7; P.shLZ = 0.3 + Math.cos(ph) * 0.3; P.shRZ = 0.3 - Math.cos(ph) * 0.3;
    P.hipsZ = Math.sin(ph) * 0.2; P.torsoZ = -Math.sin(ph) * 0.15; P.hipsY = 0.86 - Math.abs(Math.sin(ph)) * 0.06;
    P.legL = Math.max(0, Math.sin(ph)) * 0.5; P.legR = Math.max(0, -Math.sin(ph)) * 0.5; P.kneeL = P.legL; P.kneeR = P.legR;
    P.neckZ = Math.sin(ph * 0.5) * 0.4; P.jaw = 1.5; P.rootY = Math.sin(ph * 0.25) * 0.6; P.torsoX = 0.1;
  } else if (name === 'Eat') {                                                          // ngồi ghế ăn não
    const ph = t * 6;
    P.hipsY = 0.55; P.legL = P.legR = -1.45; P.kneeL = P.kneeR = 1.45; P.torsoX = 0.4 + Math.sin(t * 12) * 0.04;
    P.shLX = -1.25 - 0.45 * Math.max(0, Math.sin(ph)); P.shRX = -1.25 - 0.45 * Math.max(0, -Math.sin(ph)); P.shLZ = P.shRZ = -0.05;
    P.elL = -1.1 - 0.4 * Math.max(0, Math.sin(ph)); P.elR = -1.1 - 0.4 * Math.max(0, -Math.sin(ph));
    P.neckX = 0.35 + Math.sin(t * 12) * 0.1; P.neckZ = Math.sin(t * 2) * 0.12; P.jaw = 0.6 + Math.abs(Math.sin(t * 12)) * 1.7;
  } else if (name === 'Cheer') {                                                        // đứng dậy giơ 2 tay "NÃO!"
    P.shLX = -2.9 + Math.sin(t * 8) * 0.18; P.shRX = -2.9 - Math.sin(t * 8) * 0.18; P.shLZ = P.shRZ = 0.35; P.elL = P.elR = -0.3;
    P.torsoX = -0.12; P.neckX = -0.25; P.jaw = 2.3; P.hipsY = 0.86 + Math.abs(Math.sin(t * 8)) * 0.05; P.legSpread = 0.12;
  } else if (name === 'Hurt') {                                                          // bị hất lùi: ngả ra sau, tay quơ
    P.shLX = -1.1 + Math.sin(t * 14) * 0.3; P.shRX = -0.9 - Math.sin(t * 14) * 0.3; P.shLZ = 0.8; P.shRZ = 0.8; P.elL = P.elR = -0.3;
    P.torsoX = -0.25; P.neckX = -0.3; P.legL = -0.35; P.legR = 0.2; P.kneeL = 0.5; P.kneeR = 0.2; P.jaw = 2.1;
  } else if (name === 'Dizzy') {                                                         // choáng: lảo đảo vòng tròn
    P.hipsZ = Math.sin(t * 4) * 0.12; P.torsoZ = Math.cos(t * 4) * 0.15; P.torsoX = 0.2 + Math.sin(t * 4) * 0.1; P.neckZ = Math.sin(t * 4 + 1) * 0.45;
    P.shLX = -0.3; P.shRX = -0.25; P.shLZ = 0.25; P.shRZ = 0.25; P.elL = P.elR = -0.2; P.kneeL = P.kneeR = 0.25; P.legSpread = 0.1; P.jaw = 1.6; P.hipsY = 0.83;
  } else {                                                                               // Idle — đứng tại chỗ theo clip
    const sw = Math.sin(t * 1.3);
    P.legSpread = 0.09; P.kneeL = 0.08 + Math.max(0, sw) * 0.12; P.kneeR = 0.08 + Math.max(0, -sw) * 0.12;
    P.hipsZ = sw * 0.06; P.hipsY = 0.83; P.torsoZ = -sw * 0.06; P.torsoX = 0.38; P.torsoY = Math.sin(t * 0.6) * 0.1;
    P.shLX = -0.1 + Math.sin(t * 1.1) * 0.05; P.shRX = -0.1; P.shLZ = 0.12; P.shRZ = 0.12; P.elL = P.elR = -0.4;
    P.neckZ = 0.3 + 0.2 * Math.sin(t * 0.7); P.neckX = 0.35; P.jaw = 1.4 + Math.sin(t * 1.7) * 0.4; P.shLX = -0.3; P.shRX = -0.2; P.shRZ = 0.2; P.elL = P.elR = -0.2;
    const sc = t % 7;                                                                    // thỉnh thoảng đưa tay gãi ngực
    if (sc > 4.6 && sc < 6.2) { const k = Math.sin((sc - 4.6) / 1.6 * Math.PI); P.shRX = -0.1 - 0.9 * k; P.elR = -0.4 - 1.3 * k + Math.sin(t * 18) * 0.15 * k; P.shRZ = 0.12 - 0.5 * k; }
  }
  return P;
}
function zombieAnimate(dt) {
  const z = mon.z3; if (!z) return;
  if (z.glb) return glbAnimate(dt);
  mon.animT += dt * (mon.ts || 1);
  const walking = mon.cur === 'Walking' || mon.cur === 'Running';
  const P = zTarget(mon.cur, mon.animT, mon.walkPh || 0), k = Math.min(1, dt * (walking ? 40 : 12));
  if (mon.shieldHp > 0 && !['Eat', 'Cheer', 'Death', 'Wave', 'Jump', 'Dance'].includes(mon.cur)) {
    // ôm cánh cửa trước người: 2 tay đưa ra nắm 2 mép; đập cửa nhà = húc khiên tới
    P.shLX = P.shRX = -1.15; P.shLZ = P.shRZ = 0.08; P.elL = P.elR = -0.85; P.torsoY *= 0.4;
    if (mon.cur === 'Punch') P.torsoX = 0.15 + 0.3 * Math.max(0, Math.sin(mon.animT * 7));
  }
  if (mon.cur === 'Walking' || mon.cur === 'Running' || mon.cur === 'Idle') {
    mon.twT = (mon.twT ?? 2) - dt;
    if (mon.twT <= 0) { mon.twT = rand(1.2, 4); mon.tw = { k: pick(['head', 'head', 'armL', 'armR', 'body']), t: 0, d: rand(0.16, 0.26), a: rand(0.5, 0.9) * (Math.random() < 0.5 ? -1 : 1) }; }
    if (mon.tw) {
      const w = mon.tw; w.t += dt; const q = Math.sin(Math.min(1, w.t / w.d) * Math.PI) * w.a;
      if (w.k === 'head') { P.neckZ += q * 0.8; P.neckX -= Math.abs(q) * 0.3; }
      else if (w.k === 'armL') { P.shLX -= Math.abs(q) * 0.9; P.elL -= Math.abs(q) * 0.6; }
      else if (w.k === 'armR') { P.shRX -= Math.abs(q) * 0.9; P.shRZ += Math.abs(q) * 0.4; }
      else { P.torsoX -= Math.abs(q) * 0.3; P.torsoZ += q * 0.25; P.neckZ -= q * 0.4; }
      if (w.t >= w.d) mon.tw = null;
    }
  }
  mon.jerk = Math.max(0, (mon.jerk || 0) - dt * 3.5);
  if (mon.jerk > 0) { const j = mon.jerk; P.torsoX -= j * 0.55; P.neckX -= j * 0.7; P.shLZ += j * 0.35; P.shRZ += j * 0.35; P.jaw += j; }
  mon.shieldHit = Math.max(0, (mon.shieldHit || 0) - dt * 3);
  if (mon.shieldMesh) { mon.shieldMesh.rotation.x = -mon.shieldHit * 0.7; mon.shieldMesh.position.z = 0.46 - mon.shieldHit * 0.25; }
  const L = (o, key, v) => { o[key] += (v - o[key]) * k; };
  L(z.hips.position, 'y', P.hipsY); L(z.hips.rotation, 'z', P.hipsZ);
  L(z.torso.rotation, 'x', P.torsoX); L(z.torso.rotation, 'z', P.torsoZ); L(z.torso.rotation, 'y', P.torsoY);
  L(z.legs[0].thigh.rotation, 'z', -P.legSpread); L(z.legs[1].thigh.rotation, 'z', P.legSpread);
  L(z.neck.rotation, 'x', P.neckX); L(z.neck.rotation, 'z', P.neckZ);
  L(z.legs[0].thigh.rotation, 'x', P.legL); L(z.legs[1].thigh.rotation, 'x', P.legR);
  L(z.legs[0].knee.rotation, 'x', P.kneeL); L(z.legs[1].knee.rotation, 'x', P.kneeR);
  L(z.arms[0].sh.rotation, 'x', P.shLX); L(z.arms[0].sh.rotation, 'z', -P.shLZ);
  L(z.arms[1].sh.rotation, 'x', P.shRX); L(z.arms[1].sh.rotation, 'z', P.shRZ);
  L(z.arms[0].el.rotation, 'x', P.elL); L(z.arms[1].el.rotation, 'x', P.elR);
  L(z.jaw.scale, 'y', P.jaw);
  z.root.rotation.x += (P.rootX - z.root.rotation.x) * Math.min(1, dt * 5);
  z.root.rotation.y += (P.rootY - z.root.rotation.y) * k;
  // thỉnh thoảng rên "ư ư"
  if (state.phase === 'play' && (mon.cur === 'Walking' || mon.cur === 'Punch' || mon.cur === 'Idle')) { mon.groanT -= dt; if (mon.groanT <= 0) { mon.groanT = rand(4, 8); sfx('groan'); } }
}
// ===== Zombie mô hình có xương + hoạt ảnh (Quaternius "Zombie Apocalypse Kit", CC0) =====
const ZOMBIE_MODELS = { basic: 'zombie_basic.glb', chubby: 'zombie_chubby.glb', arm: 'zombie_arm.glb', ribcage: 'zombie_basic.glb' };   // lộ sườn = zombie thường + bộ sườn hở gắn vào ngực (bản tải về thiếu đầu, tay)
async function loadZombieGLB() {
  const f = ZOMBIE_MODELS[CONFIG.zombieModel]; if (!f) return null;
  try { return await new GLTFLoader().loadAsync('/games/quaivat/models/zombie/' + f); }
  catch (e) { console.warn('Không tải được zombie GLB → dùng zombie dựng tay', e); return null; }
}
// viền nét cho mô hình có xương: bản sao mặt sau, đẩy đỉnh theo pháp tuyến SAU khi skin
function skinnedOutline(root, thickWorld) {
  const list = []; root.traverse(o => { if (o.isSkinnedMesh && !o.userData.isOutline) list.push(o); });
  const ws = new V3();
  for (const m of list) {
    m.getWorldScale(ws); const th = thickWorld / Math.max(1e-6, ws.x);
    const mat = new THREE.MeshBasicMaterial({ color: 0x1d130c, side: THREE.BackSide });
    mat.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <skinning_vertex>', `#include <skinning_vertex>\n  transformed += normalize(objectNormal) * ${th.toFixed(5)};`); };
    const o = new THREE.SkinnedMesh(m.geometry, mat);
    o.userData.isOutline = true; o.castShadow = o.receiveShadow = false; o.frustumCulled = false;
    o.position.copy(m.position); o.quaternion.copy(m.quaternion); o.scale.copy(m.scale);
    m.parent.add(o); o.bind(m.skeleton, m.bindMatrix);
  }
}
// "Zombie lộ sườn": hốc ngực tối + 4 xương sườn cong + xương ức, gắn vào xương Torso (đi theo động tác), da tái hơn
function addRibcage(model, wrap, mats) {
  const torso = model.getObjectByName('Torso'), hips = model.getObjectByName('Hips'); let mesh = null;
  model.traverse(o => { if (o.isSkinnedMesh && !mesh && o.geometry.attributes.position.count > 1000) mesh = o; });
  if (!torso || !hips || !mesh) return;
  model.updateMatrixWorld(true);
  const hy = hips.getWorldPosition(new V3()).y, ny = (model.getObjectByName('Neck') || torso).getWorldPosition(new V3()).y;
  const si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight, p = mesh.geometry.attributes.position, w = new V3();
  const boneM = MS(0xeee3c6, 0.5), cav = MS(0x3a0a10, 0.9);
  // dò mặt thân (trước: side=1 → z lớn nhất, sau: side=-1 → z nhỏ nhất) trong dải cao [y0, y1], chỉ đỉnh thuộc các xương cho trước
  const surface = (bones, y0, y1, side) => {
    const ids = bones.map(b => mesh.skeleton.bones.indexOf(b)).filter(i => i >= 0), pts = [];
    for (let i = 0; i < p.count; i++) {
      let wt = 0; for (let k = 0; k < 4; k++) if (ids.includes(si.getComponent(i, k))) wt += sw.getComponent(i, k);
      if (wt < 0.6) continue;
      w.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
      if (Math.abs(w.x) < 0.07 && w.y > y0 && w.y < y1) pts.push(w.clone());
    }
    if (pts.length < 4) return null;
    const cy = pts.reduce((a, q) => a + q.y, 0) / pts.length; let z = side > 0 ? -9 : 9;
    for (const q of pts) if (Math.abs(q.y - cy) < 0.08) z = side > 0 ? Math.max(z, q.z) : Math.min(z, q.z);
    return { cy, z };
  };
  const patch = (s, spine) => {                                                                     // hốc tối + sườn cong + xương ức / xương sống
    const g = new THREE.Group();
    sph(1, cav, 0, 0, -0.012 * s, g).scale.set(0.13 * s, 0.12 * s, 0.035 * s);
    [[0.06, 0.1], [0.022, 0.106], [-0.016, 0.1], [-0.052, 0.088]].forEach(([y, r], i) => {
      const rib = new THREE.Mesh(geo('rib' + i, () => new THREE.TorusGeometry(r, 0.014, 6, 14, Math.PI * 0.8)), boneM);
      rib.scale.setScalar(s); rib.rotation.set(Math.PI / 2, 0, 0.1 * Math.PI); rib.position.set(0, y * s, -r * 0.8 * s); g.add(rib);
    });
    if (spine) for (let i = 0; i < 6; i++) sph(1, boneM, 0, (0.09 - i * 0.036) * s, 0.012 * s, g).scale.set(0.022 * s, 0.014 * s, 0.018 * s);   // đốt sống
    else box(0.03 * s, 0.15 * s, 0.03 * s, boneM, 0, 0.005 * s, 0.012 * s, g);                       // xương ức
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  };
  const front = surface([hips], hy + 0.03, ny, 1);                                                  // bụng trên thắt lưng (đầu to che ngực)
  if (front) { const g = patch(1, false); g.position.set(0, front.cy, front.z - 0.005); wrap.add(g); wrap.updateMatrixWorld(true); hips.attach(g); }
  const back = surface([torso, hips, model.getObjectByName('Abdomen')].filter(Boolean), hy + 0.08, ny + 0.05, -1);   // lưng: camera luôn ở sau → thấy rõ nhất
  if (back) { const g = patch(1.35, true); g.rotation.y = Math.PI; g.position.set(0, back.cy, back.z + 0.005); wrap.add(g); wrap.updateMatrixWorld(true); torso.attach(g); }
  for (const m of mats) m.color.multiply(new THREE.Color(0xc4d2bc));                                  // da tái xám
}
function setupZombieGLB(gltf) {
  const model = gltf.scene, wrap = new THREE.Group(); wrap.add(model);
  const mats = [];
  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.material = o.material.clone(); o.material.envMapIntensity = 0.55; mats.push(o.material); } });
  // chuẩn hoá chiều cao theo MON_H, chân chạm y=0
  model.updateMatrixWorld(true);
  const box = new THREE.Box3();
  model.traverse(o => { if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
  let h = box.max.y - box.min.y;
  if (!(h > 0.05 && h < 1e5)) { h = boneTop(model) * 1.1; box.min.y = 0; }
  const k = MON_H / h; model.scale.multiplyScalar(k); model.position.y = -box.min.y * k;
  wrap.updateMatrixWorld(true);
  if (CONFIG.zombieModel === 'ribcage') addRibcage(model, wrap, mats);
  const feet = []; model.traverse(o => { if (o.isBone && /foot/i.test(o.name) && !/end|toe/i.test(o.name)) feet.push(o); });
  const fv = new V3(); let footRest = Infinity; for (const f of feet) { f.getWorldPosition(fv); footRest = Math.min(footRest, fv.y); }
  const mixer = new THREE.AnimationMixer(model), actions = {};
  for (const clip of gltf.animations) {
    const a = mixer.clipAction(clip);
    if (['Death', 'Jump', 'Jump_Land'].includes(clip.name)) { a.loop = THREE.LoopOnce; a.clampWhenFinished = true; }
    actions[clip.name] = a;
  }
  // chỗ ôm khiên cửa: khung giống thân zombie dựng tay (để dùng chung code khiên)
  const torso = new THREE.Group(); torso.position.set(0, 0.86 * MON_H / 1.95, 0); torso.scale.setScalar(MON_H / 1.95); wrap.add(torso);
  skinnedOutline(model, 0.014);
  return { glb: true, root: wrap, model, mats, torso, mixer, actions, cur: '', feet, footRest: isFinite(footRest) ? footRest : 0 };
}
const GLB_MAP = {
  Walking: ['Walk'], Running: ['Run', 'Run_Arms'], Idle: ['Idle'], Punch: ['Punch', 'Idle_Attack', 'Run_Attack', 'Idle'],
  Hurt: ['HitReact', 'Idle'], Dizzy: ['No', 'Idle'], Jump: ['Jump_Idle', 'Jump'], Wave: ['Wave', 'Jump_Idle'], Death: ['Death'],
  Dance: ['Yes', 'Wave'], Eat: ['Idle_Attack', 'Punch', 'Yes', 'Idle'], Cheer: ['Wave', 'Yes', 'Jump_Idle'],
};
function glbAnimate(dt) {
  const z = mon.z3; z.mixer.update(dt); holdShieldIK(z, dt);
  mon.hitAnimT = Math.max(0, (mon.hitAnimT || 0) - dt);
  let target = 'Idle';
  for (const n of (GLB_MAP[mon.cur] || ['Idle'])) if (z.actions[n]) { target = n; break; }
  if (mon.hitAnimT > 0 && ['Walking', 'Idle', 'Running', 'Punch'].includes(mon.cur) && z.actions.HitReact) target = 'HitReact';   // trúng đòn: giật người
  const a = z.actions[target]; if (!a) return;
  if (target !== z.cur) { const prev = z.actions[z.cur]; a.reset().setEffectiveWeight(1).fadeIn(0.18).play(); if (prev) prev.fadeOut(0.18); z.cur = target; }
  let ts = 1;
  if (target === 'Walk') ts = clamp((mon.moveSpeed || 1.1) / 1.1, -1.6, 1.6);       // đi lùi = chạy ngược clip
  else if (target === 'Run_Arms' || target === 'Run') ts = clamp(Math.abs(mon.moveSpeed || 2) / 2.6, 0.7, 1.5);
  else if (target === 'Idle_Attack' && mon.cur === 'Eat') ts = 0.75;
  a.setEffectiveTimeScale(ts);
  if (state.phase === 'play' && (mon.cur === 'Walking' || mon.cur === 'Punch' || mon.cur === 'Idle')) { mon.groanT -= dt; if (mon.groanT <= 0) { mon.groanT = rand(4, 8); sfx('groan'); } }
}
async function setupMonster() {
  const gl = CONFIG.zombieModel !== 'classic' ? await loadZombieGLB() : null;
  const z = gl ? setupZombieGLB(gl) : buildZombie(); mon.z3 = z;
  const model = z.root; mon.mats.push(...z.mats);
  mon.tilt.add(model);
  mon.tilt.position.y = MON_H * 0.45; model.position.y = -MON_H * 0.45; // xoay/lộn nhào quanh hông
  mon.baseColors = mon.mats.map(m => m.color.clone());
  mon.animT = 0; mon.ts = 1; mon.groanT = 3;
  // khiên giáp (khi được tặng) + sao choáng
  const sh = new THREE.Group(); sh.position.set(0, 0.12, 0.46); sh.visible = false; z.torso.add(sh);
  mon.shieldPanel = box(0.9, 1.72, 0.07, new THREE.MeshStandardMaterial({ map: makeShieldTex(), roughness: 0.75, alphaTest: 0.5 }), 0, 0, 0, sh);   // alphaTest: chỗ mẻ thành lỗ thủng
  sph(0.05, MS(0xffd36a, 0.3, 0.9), 0.36, -0.05, 0.05, sh);
  for (const x of [-0.42, 0.42]) box(0.06, 0.12, 0.08, MS(0x3a2a1a, 0.6, 0.4), x, 0.05, -0.07, sh);   // chỗ tay nắm
  mon.shieldMesh = sh; mon.shieldHp = 0;
  if (!z.glb) addOutline(z.root, 0.016, 0.02);
  mon.shield = new THREE.Mesh(new THREE.SphereGeometry(MON_H * 0.62, 28, 18), new THREE.MeshStandardMaterial({ color: 0x5fb8ff, transparent: true, opacity: 0.22, emissive: 0x2a7fff, emissiveIntensity: 0.6, depthWrite: false }));
  mon.shield.position.y = MON_H * 0.5; mon.shield.visible = false; mon.root.add(mon.shield);
  mon.stars = new THREE.Group(); mon.stars.position.y = MON_H + 0.25; mon.root.add(mon.stars);
  for (let i = 0; i < 3; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, color: 0xffe14a, depthWrite: false })); s.scale.setScalar(0.45); mon.stars.add(s); }
  mon.stars.visible = false;
  // nhãn trên đầu
  mon.label = makeLabel('mlab');
  mon.label.innerHTML = `<div class="bf"></div>`;   // không hiện tên trên đầu zombie, chỉ icon trạng thái
  mon.bf = mon.label.querySelector('.bf');
  refreshStreamer();
  mon.ready = true;
}
function refreshStreamer() {
  const u = { name: CONFIG.streamerName, avatar: CONFIG.streamerAvatar };

  if (mon.shieldPanel) mon.shieldPanel.material.map = makeShieldTex();
  void u;
}
function playAnim(name, fade = 0.2, ts = 1) {
  mon.ts = ts;
  if (mon.cur !== name) { mon.cur = name; mon.animT = 0; }
}
function monJump() {
  if (CONFIG.lockJump) return;
  if (state.phase !== 'play' || mon.y > 0 || mon.lift || mon.carry || mon.stun > 0 || mon.kv > 1) return;
  mon.vy = 6.2; mon.cur = ''; playAnim('Jump', 0.08, 1.3);   // cao ~0.75m: vừa qua khoai/lốp/bẫy sfx('whoosh');
}
function hitMonster(dmg, knock, owner, opts = {}) {
  if (state.phase !== 'play' || !mon.ready) return false;
  // quái KHÔNG có máu: đòn chỉ đẩy lùi / làm choáng; dmg dùng tính điểm chặn quái cho người xem
  mon.hitAnimT = 0.45;
  mon.lastHurt = time; mon.flash = 0.15; mon.jerk = Math.min(1, 0.55 + (knock || 0) * 0.15);   // giật người
  addPoints(owner, dmg);
  const hp = new V3(mon.x, mon.y + mon.gy + MON_H + 0.3, mon.z);
  // khiên cửa chặn đòn trực diện (đồ lăn/ném/đạn cây); mìn, sét, vụ nổ, bóng bay, đá tảng thì không chặn được
  if (mon.shieldHp > 0 && !opts.unblockable) {
    mon.shieldHp--; mon.shieldHit = 0.35; sfx('thud');                          // có khiên: đỡ trọn, KHÔNG bị đẩy lùi
    debris(new V3(mon.x, mon.gy + 1.0, mon.z - 0.5), 0x7a4423, 3, 0.1, 3); chipShield();
    if (mon.shieldHp <= 0) breakShield(); else popText(hp.clone().setY(hp.y + 0.4), `🚪 ${mon.shieldHp}`, 'info', 0.7);
    camShake = Math.max(camShake, 0.12);
    return true;
  }
  if (knock) mon.kv = Math.min(mon.kv + knock * 4, 36);
  if (opts.stun) mon.stun = Math.max(mon.stun, opts.stun);
  if (opts.text) popText(hp.clone().setY(hp.y + 0.6), opts.text, 'big', 1.1);
  if (dmg >= 60 || (knock || 0) >= 4) { hitStop = Math.max(hitStop, 0.08); fovKick = Math.min(7, fovKick + 4); }   // khựng hình + giật ống kính
  camShake = Math.max(camShake, Math.min(0.5, 0.08 + dmg / 300));
  return true;
}
function breakShield() {
  mon.shieldHp = 0; mon.shieldMesh.visible = false;
  const p = new V3(mon.x, mon.gy + 1.0, mon.z - 0.5);
  debris(p, 0x7a4423, 18, 0.24, 8); debris(p, 0x5a3014, 8, 0.4, 6); debris(p, 0x9fd2f0, 5, 0.1, 5);   // ván gỗ, nẹp, kính vỡ tung
  puff(p, { color: 0xd8c6a0, n: 10, size: 1.2, speed: 3.5, life: 0.8 });
  popText(new V3(mon.x, mon.y + mon.gy + MON_H + 0.9, mon.z), mon.shieldStock > 0 ? `💥 VỠ KHIÊN! (còn ${mon.shieldStock})` : '💥 VỠ KHIÊN!', 'big', 1.3); sfx('crack');
  if (mon.shieldStock > 0) { mon.shieldStock--; later(0.45, () => { if (state.phase === 'play') equipShield(); }); }
}
// đeo khiên mới (cửa nguyên vẹn, bật ra to dần)
function equipShield() {
  const tex = mon.shieldPanel.material.map, c = tex.image, g = c.getContext('2d');
  if (!mon.shieldPristine) { mon.shieldPristine = document.createElement('canvas'); mon.shieldPristine.width = c.width; mon.shieldPristine.height = c.height; mon.shieldPristine.getContext('2d').drawImage(c, 0, 0); }
  else { g.clearRect(0, 0, c.width, c.height); g.drawImage(mon.shieldPristine, 0, 0); tex.needsUpdate = true; }
  mon.shieldHp = CONFIG.shieldHits; mon.shieldMesh.visible = true; mon.shieldPop = 0; sfx('power');
  puff(new V3(mon.x, mon.gy + 1.1, mon.z - 0.5), { color: 0xffe08a, n: 8, size: 0.5, speed: 3, add: true, life: 0.6, tex: starTex });
}
// mỗi đòn: thêm vết nứt + mẻ một miếng ở mép cửa (đục trong suốt)
function chipShield() {
  const tex = mon.shieldPanel.material.map, c = tex.image, g = c.getContext('2d'), W = c.width, H = c.height;
  g.strokeStyle = 'rgba(20,10,4,.85)'; g.lineWidth = 2.5; g.beginPath(); let x = rand(10, W - 10), y = rand(10, H - 10); g.moveTo(x, y);
  for (let k = 0; k < 5; k++) { x += rand(-20, 20); y += rand(-24, 24); g.lineTo(x, y); } g.stroke();
  g.save(); g.globalCompositeOperation = 'destination-out';
  const ex = Math.random() < 0.5 ? rand(-4, 12) : rand(W - 12, W + 4), ey = rand(0, H), r = rand(8, 16);
  g.beginPath(); for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; g.lineTo(ex + Math.cos(a) * r * rand(0.5, 1.2), ey + Math.sin(a) * r * rand(0.5, 1.2)); } g.fill(); g.restore();
  tex.needsUpdate = true;
}
// khiên: bật ra khi đeo, giật khi trúng đòn, húc tới khi đấm
function updateShield(dt) {
  const sh = mon.shieldMesh; if (!sh) return;
  mon.shieldHit = Math.max(0, (mon.shieldHit || 0) - dt * 3);
  mon.shieldPop = Math.min(1, (mon.shieldPop ?? 1) + dt * 4);
  const q = mon.shieldPop; sh.scale.setScalar(q < 1 ? 0.3 + 0.7 * (1 - (1 - q) ** 3) + 0.12 * Math.sin(q * Math.PI) : 1);
  const shove = mon.cur === 'Punch' ? 0.14 * Math.max(0, Math.sin(time * 9)) : 0;
  sh.rotation.x = -mon.shieldHit * 0.7; sh.position.z = 0.46 - mon.shieldHit * 0.25 + shove;
}
// zombie mô hình có xương: 2 tay đưa ra nắm 2 tay nắm của khiên (IK 2 khớp: vai → khuỷu → cổ tay)
const _ikA = new V3(), _ikB = new V3(), _ikC = new V3(), _ikQ = new THREE.Quaternion(), _ikQ2 = new THREE.Quaternion(), _ikQ3 = new THREE.Quaternion();
function aimBone(bone, child, target, w) {
  bone.updateMatrixWorld(true);
  bone.getWorldPosition(_ikA); child.getWorldPosition(_ikB);
  const cur = _ikB.sub(_ikA).normalize(), want = _ikC.copy(target).sub(_ikA).normalize();
  _ikQ.setFromUnitVectors(cur, want);
  bone.getWorldQuaternion(_ikQ2); _ikQ2.premultiply(_ikQ);
  bone.parent.getWorldQuaternion(_ikQ3).invert(); _ikQ3.multiply(_ikQ2);
  bone.quaternion.slerp(_ikQ3, w);
}
function holdShieldIK(z, dt) {
  const hold = mon.shieldHp > 0 && mon.shieldMesh && mon.shieldMesh.visible && !mon.carry && !mon.lift && !['Eat', 'Cheer', 'Death', 'Wave', 'Dance'].includes(mon.cur);
  mon.holdW = clamp((mon.holdW || 0) + (hold ? dt * 6 : -dt * 6), 0, 1);
  if (mon.holdW <= 0.001) return;
  if (!z.arms) {
    const get = n => z.model.getObjectByName(n);
    z.arms = ['L', 'R'].map(sd => { const up = get('UpperArm' + sd), lo = get('LowerArm' + sd); const hand = lo && lo.children.find(c => c.isBone); return up && lo && hand ? { up, lo, hand, sd } : null; }).filter(Boolean);
    z.chest = get('Torso');
  }
  if (z.arms.length < 2) return;
  z.root.updateMatrixWorld(true);
  const sh = mon.shieldMesh, cen = z.chest ? z.chest.getWorldPosition(new V3()) : sh.getWorldPosition(new V3());
  for (const a of z.arms) {
    const S = a.up.getWorldPosition(new V3());
    const grip = new V3(a.sd === 'L' ? 0.42 : -0.42, 0.05, 0.02);                // tay nắm 2 bên mép khiên
    sh.localToWorld(grip);
    const tryL = new V3(0.42, 0.05, 0.02); sh.localToWorld(tryL); const tryR = new V3(-0.42, 0.05, 0.02); sh.localToWorld(tryR);
    const H = S.distanceTo(tryL) < S.distanceTo(tryR) ? tryL : tryR;           // tay nào nắm mép gần vai đó
    const out = S.clone().sub(cen).setY(0).normalize();
    const E = S.clone().lerp(H, 0.5).addScaledVector(out, 0.12).add(new V3(0, -0.12, 0));   // khuỷu hơi bè ra + chùng xuống
    aimBone(a.up, a.lo, E, mon.holdW); a.lo.updateMatrixWorld(true);
    aimBone(a.lo, a.hand, H, mon.holdW);
  }
}

// mặt khiên = cánh cửa gỗ có ô kính in avatar streamer (như clip gốc)
function makeShieldTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#7a4423'; g.fillRect(0, 0, 128, 256);
  for (let x = 0; x < 128; x += 4) { g.fillStyle = `rgba(40,20,8,${rand(0.05, 0.2)})`; g.fillRect(x, 0, 2, 256); }
  g.strokeStyle = 'rgba(30,14,4,.6)'; g.lineWidth = 5; g.strokeRect(14, 120, 100, 56); g.strokeRect(14, 186, 100, 56);
  g.fillStyle = '#9fd2f0'; g.fillRect(16, 16, 96, 90); g.strokeStyle = '#f7f3ea'; g.lineWidth = 5; g.strokeRect(16, 16, 96, 90);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const name = CONFIG.streamerName || '?';
  g.fillStyle = colorFor(name); g.beginPath(); g.arc(64, 61, 30, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 32px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name.trim().charAt(0).toUpperCase(), 64, 63);
  if (CONFIG.streamerAvatar) {
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => { try { g.save(); g.beginPath(); g.arc(64, 61, 30, 0, 7); g.clip(); g.drawImage(im, 34, 31, 60, 60); g.restore(); t.needsUpdate = true; } catch {} };
    im.src = CONFIG.streamerAvatar;
  }
  return t;
}
function findBlocker() {
  let best = null, bd = 99;
  for (const it of items) {
    if (it.dead || !it.blocker || it.state !== 'set') continue;
    const dz = mon.z - it.g.position.z, dx = Math.abs(mon.x - it.g.position.x);
    if (dz > -0.4 && dz < it.halfD + 0.8 && dx < it.halfW + 0.55 && dz < bd) { best = it; bd = dz; }
  }
  for (const f of items) {
    if (f.dead || f.kind !== 'fox' || f.state !== 'bite') continue;
    if (Math.hypot(f.g.position.x - mon.x, f.g.position.z - mon.z) < 1.8) return f;
  }
  return best;
}
function slimeFactor() {
  for (const it of items) if (!it.dead && it.kind === 'slime' && it.state === 'set' && Math.hypot(it.g.position.x - mon.x, it.g.position.z - mon.z) < 1.9) return 0.35;
  return 1;
}
const keys = {}; let lastInput = -99, autoDodge = true;
const CTRL_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space', 'KeyF', 'KeyJ', 'ShiftLeft', 'ShiftRight'];
function keyDown(code) {
  if (!CTRL_KEYS.includes(code)) return;
  const was = keys[code]; keys[code] = true; lastInput = time;
  if (!was && code === 'Space') monJump();
  if (code === 'KeyF' || code === 'KeyJ') { mon.punchBoost = 0.5; if (!was) mon.wantPunch = true; }
}
function keyUp(code) { keys[code] = false; }
addEventListener('blur', () => CTRL_KEYS.forEach(k => { keys[k] = false; }));
function updateMonster(dt) {
  if (!mon.ready) return;
  zombieAnimate(dt); updateShield(dt);
  mon.flash -= dt;
  const fl = mon.flash > 0 ? 0.7 : 0;
  for (const m of mon.mats) m.emissive.setRGB(fl, fl * 0.12, fl * 0.08);
  // bị sét đánh: cháy đen người rồi hồi màu dần
  mon.charT = Math.max(0, mon.charT - dt);
  const ck = Math.min(1, mon.charT / 1.5);
  mon.mats.forEach((m, i) => m.color.copy(mon.baseColors[i]).lerp(CHAR_COL, ck * 0.93));
  if (ck > 0 && Math.random() < dt * 12) puff(new V3(mon.x + rand(-0.35, 0.35), mon.y + mon.gy + MON_H * rand(0.5, 1), mon.z), { color: 0x2b2b2b, n: 1, size: 0.7, up: 2.5, speed: 1, life: 1.3, opacity: 0.55 });
  mon.shield.visible = time < mon.armorUntil;
  if (mon.shield.visible) mon.shield.material.opacity = 0.18 + Math.sin(time * 6) * 0.06;
  mon.stars.visible = mon.stun > 0 && state.phase === 'play';
  if (mon.stars.visible) mon.stars.children.forEach((s, i) => { const a = time * 5 + i * 2.1; s.position.set(Math.cos(a) * 0.6, Math.sin(time * 8 + i) * 0.08, Math.sin(a) * 0.6); });
  if (state.phase !== 'play') { applyMon(); return; }

  const manual = true;   // luôn do streamer điều khiển bằng bàn phím — không bấm thì đứng yên (Khóa tiến/lùi = tự đi tới, chỉ lái ngang)
  let anim = 'Walking', ts = 1;
  mon.punchBoost -= dt;
  const wind = windOn(); mon.windLean = wind;
  if (mon.carry) { anim = 'Jump'; }
  else if (mon.lift) { updateLift(dt); anim = mon.lift && mon.lift.phase === 'fall' ? 'Jump' : 'Wave'; }
  else {
    if (mon.y > 0 || mon.vy > 0) {
      mon.vy -= 26 * dt; mon.y += mon.vy * dt;
      if (mon.flip) mon.flip.t += dt;
      if (mon.y <= 0) {
        mon.y = 0; mon.vy = 0; puff(new V3(mon.x, 0.2, mon.z), { color: 0xd8c6a0, n: 5, size: 0.9, speed: 2, life: 0.6 });
        if (mon.flip) { mon.flip = null; mon.tilt.rotation.x = 0; mon.stun = Math.max(mon.stun, 0.9); sfx('thud'); camShake = Math.max(camShake, 0.35); puff(new V3(mon.x, 0.3, mon.z), { color: 0xd8c6a0, n: 10, size: 1.3, speed: 4, life: 0.9 }); }
      }
    }
    mon.blocker = null;
    if (mon.kv > 0.5) {
      mon.z += mon.kv * dt; mon.kv *= Math.exp(-4 * dt); anim = 'Hurt';
      if (Math.random() < dt * 20) puff(new V3(mon.x + rand(-0.4, 0.4), 0.15, mon.z), { color: 0xd8c6a0, n: 1, size: 0.7, speed: 1, life: 0.5 });
    } else if (mon.stun > 0) {
      mon.kv = 0; mon.stun -= dt; anim = 'Dizzy';
    } else {
      mon.kv = 0;
      const b = findBlocker(); mon.blocker = b;
      const atDoor = mon.z <= HOUSE_FRONT + 0.75 && Math.abs(mon.x) < 0.65;
      const atWall = mon.z <= HOUSE_FRONT + 0.75 && !atDoor;
      // ý muốn di chuyển: streamer điều khiển (W/S tới-lùi, A/D ngang) hoặc tự đi khi không bấm phím
      let fwd, side;
      if (manual) {
        side = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
        fwd = CONFIG.lockForward ? 1 : (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
      } else {
        mon.aiT -= dt;
        if (mon.aiT <= 0 && !mon.avoid) { mon.aiT = rand(2.5, 5); mon.aiX = mon.z < HOUSE_FRONT + 9 ? 0 : rand(-1.6, 1.6); }
        if (mon.z < HOUSE_FRONT + 7 && !mon.avoid) mon.aiX = 0;
        const gap = mon.aiX - mon.x; side = Math.abs(gap) < 0.06 ? 0 : clamp(gap * 1.6, -1, 1);
        fwd = 1;
      }
      const sprint = manual && !CONFIG.lockForward && fwd > 0 && (keys.ShiftLeft || keys.ShiftRight) && !mon.tired;
      if (sprint) mon.stamina = Math.max(0, mon.stamina - dt * 0.35); else mon.stamina = Math.min(1, mon.stamina + dt * 0.15);
      if (mon.stamina <= 0.02) mon.tired = true; else if (mon.stamina >= 0.35) mon.tired = false;
      const base = CONFIG.monsterSpeed * slimeFactor() * terrainFactor() * (1 - 0.6 * wind) * (time < mon.speedUntil ? 1.7 : 1);
      let vF = fwd > 0 ? base * (sprint ? 1.6 : 1) : fwd < 0 ? -base * 0.85 : 0;   // + = tiến về nhà, − = quay lại đi về đầu đường
      let vX = side * base * 1.1;
      let punching = false;
      if (vF > 0 && b && !(mon.avoid === b && !manual)) {
        if (!b.aiSeen) { b.aiSeen = true; if (!manual && autoDodge && b.kind !== 'fence' && b.kind !== 'fox' && Math.random() < 0.45) { const sd = mon.x < b.g.position.x ? -1 : 1; let nx = b.g.position.x + sd * (b.halfW + 1.0); if (Math.abs(nx) > LANE) nx = b.g.position.x - sd * (b.halfW + 1.0); mon.avoid = b; mon.aiX = clamp(nx, -LANE, LANE); } }
        if (mon.avoid !== b || manual) { vF = 0; punching = true; punchAt(b, dt); }
      } else if (vF > 0 && atDoor) { vF = 0; vX = clamp(-mon.x * 2, -1, 1); punching = true; punchAt(null, dt); }
      else if (vF > 0 && atWall) { vF = 0; vX = clamp(-mon.x * 3, -2, 2); mon.aiX = 0; }
      if (mon.avoid && mon.avoid === b && !manual) vF = Math.min(vF, base * 0.3);
      if (!b) mon.avoid = null;
      if ((keys.KeyF || keys.KeyJ) && !(mon.airPunchT > 0)) mon.wantPunch = true;
      if (!punching && (mon.wantPunch || mon.airPunchT > 0)) {                 // đấm chủ động bằng phím F
        if (mon.wantPunch) { mon.airPunchT = CONFIG.punchEvery * 0.6; airPunch(); }
        punching = true; vF *= 0.25; vX *= 0.25;
      }
      mon.wantPunch = false; mon.airPunchT = Math.max(0, (mon.airPunchT || 0) - dt);
      const lurch = 0.3 + 1.4 * Math.cos(mon.walkPh || 0) ** 2;               // dồn tới lúc 2 chân khép, khựng lúc chân dang
      mon.z -= vF * lurch * dt; mon.x += vX * lurch * dt;
      const speed = Math.hypot(vF, vX), running = vF > CONFIG.monsterSpeed * 1.4;
      const dirSign = 1;                                                          // luôn quay mặt theo hướng đi → chân luôn bước tới
      mon.moveSpeed = dirSign * speed;                 // đi lùi: chân bước ngược
      mon.walkPh = (mon.walkPh || 0) + dirSign * speed * lurch * dt * Math.PI * 2 / (running ? 1.7 : 1.1); // 1 chu kỳ 2 bước lê ≈ 1.1m
      if (punching) mon.yawT = 0;                                                 // đấm cửa/vật cản: quay mặt tới trước
      else if (speed > 0.05) mon.yawT = Math.atan2(vX, vF);                      // quay mặt theo hướng đi (lùi = quay hẳn lại); dừng thì GIỮ hướng
      anim = punching ? 'Punch' : speed > 0.05 ? (running ? 'Running' : 'Walking') : 'Idle'; ts = 1;
      const stepI = Math.floor(mon.walkPh / Math.PI);                         // mỗi lần đặt chân: bụi + tiếng bước
      if (stepI !== mon.lastStep) { mon.lastStep = stepI; if (speed > 0.05 && mon.y <= 0) { const sd = stepI % 2 ? 1 : -1; puff(new V3(mon.x + sd * 0.13, mon.gy + 0.06, mon.z + 0.1), { color: T.dust || 0xcdb98e, n: 3, size: 0.32, speed: 0.6, up: 0.35, life: 0.65, opacity: 0.5 }); sfx('step'); } }
      if (time < mon.speedUntil && speed > 0.05 && Math.random() < dt * 15) puff(new V3(mon.x, 0.3, mon.z + 0.4), { color: 0x6fd0ff, n: 1, size: 0.6, add: true, life: 0.5 });
    }
    if (wind > 0) mon.z += CONFIG.windPush * wind * dt; // gió hoa thổi lùi
    terrainPush(dt);
    if (mon.y > 0.05) anim = 'Jump';
  }
  mon.x = clamp(mon.x, -LANE, LANE);
  if (CONFIG.checkpoint && !state.cp && state.phase === 'play' && mon.z < cpZ - 0.3) reachCp();
  mon.z = clamp(mon.z, HOUSE_FRONT + 0.6, state.cp ? cpZ : START_Z + 1.5);
  if (state.phase === 'play') playAnim(anim, 0.18, ts); // ván vừa kết thúc trong khung hình này thì giữ hoạt ảnh nhảy múa/ngã
  applyMon();
}
// đấm khi bấm F: trúng vật cản / cáo / cửa ngay trước mặt, không có gì thì đấm gió
function airPunch() {
  let best = null, bd = 99;
  for (const it of items) {
    if (it.dead || it.state !== 'set' || !(it.blocker || it.kind === 'fox')) continue;
    const dz = mon.z - it.g.position.z, dx = Math.abs(mon.x - it.g.position.x);
    if (dz > -0.5 && dz < (it.halfD || 0.5) + 1.3 && dx < (it.halfW || 0.5) + 0.8 && dz < bd) { best = it; bd = dz; }
  }
  for (const f of items) if (!f.dead && f.kind === 'fox' && f.state === 'bite' && Math.hypot(f.g.position.x - mon.x, f.g.position.z - mon.z) < 1.8) best = f;
  if (best) return punchHit(best);
  if (mon.z <= HOUSE_FRONT + 1.2 && Math.abs(mon.x) < 0.9) return punchHit(null);
  sfx('whoosh');
}
function punchAt(target, dt) {
  if (mon.cur !== 'Punch') mon.attackT = 0.35;
  mon.attackT -= dt;
  if (mon.attackT > 0) return;
  mon.attackT = CONFIG.punchEvery * (mon.punchBoost > 0 ? 0.5 : 1);
  punchHit(target);
}
function punchHit(target) {
  const hitPos = new V3(mon.x, mon.gy + 1.4, mon.z - 0.8);
  sfx('punch'); camShake = Math.max(camShake, 0.12);
  if (target && target.kind === 'fox') { foxPunched(target); return; }
  if (target) {
    if (target.spiky) later(0.05, () => hitMonster(4, 0.8, MAP_OWNER, { text: 'ÁI GAI!' }));
    target.hp -= CONFIG.punchDmg;
    puff(hitPos, { color: 0xfff2c0, n: 3, size: 0.6, add: true, life: 0.25 });
    debris(hitPos, target.debrisColor || 0x8a5a2a, 3, 0.12, 4);
    popText(hitPos.clone().setY(2.4), 'RẦM!', 'info', 0.6);
    if (target.bar) target.bar.style.width = Math.max(0, 100 * target.hp / target.maxHp) + '%';
    if (target.hp <= 0) breakItem(target);
    return;
  }
  // đấm cửa
  door.hp -= CONFIG.punchDmg; door.shake = 0.25; door.lastHit = time; sfx('crack');
  const dp = new V3(rand(-0.45, 0.45), rand(1.0, 2.2), HOUSE_FRONT + 0.3);
  debris(dp, 0x7a4423, 4, 0.14, 5); puff(dp, { color: 0xd8c6a0, n: 3, size: 0.8, life: 0.6 });
  popText(dp.clone().setY(4), '-' + CONFIG.punchDmg, 'dmg');
  if (door.hp <= 0) { door.hp = 0; endRound('monster'); }
}
// độ cao mặt đất dưới chân (khớp đúng hình bậc thềm/sân/bồn hoa trong buildHouse, tính theo mặt trên của viền đá)
// F = nửa bàn chân: mũi chân chạm mép bậc là bước lên luôn → chân không bao giờ lọt vào trong bậc
function groundY(x, z) {
  if (sandAt(x, z)) return -0.42;
  if (Math.abs(x) > 50) return 0;
  if (z > 1 - 0.5 && z < 4.83 + 0.5) return z > 4.3 ? 0.2 : 0.14;   // vỉa hè 0.14 + bó vỉa 0.2 (chừa mép bàn chân)
  const ax = Math.abs(x), dz = z - HOUSE_FRONT, F = 0.5;    // bước chân vươn tới ~0.4m: chân trước chạm bậc là cả người lên bậc
  if (ax < 1.6 + F && dz < 0.95 + F) return 0.74 * HS;          // bậc trên (+ viền)
  if (ax < 1.75 + F && dz < 1.45 + F) return 0.39 * HS;         // bậc dưới (+ viền)
  if (ax > 1.85 && ax < 5.7 && dz < 0.9) return 0.18 * HS;      // bồn hoa sát tường
  if (ax < 2.96 + F && dz < 3.6 + F) return 0.1 * HS;           // sân lát gạch
  return 0;
}
function updateLift(dt) {
  const L = mon.lift; L.t += dt;
  if (L.phase === 'rise') { mon.y += (4.5 - mon.y) * Math.min(1, dt * 3); if (L.t > 0.8) { L.phase = 'drift'; L.t = 0; } }
  else if (L.phase === 'drift') {                                                  // bay về phía nhà 3 giây (vượt qua bẫy bên dưới)
    mon.y = 4.5 + Math.sin(time * 2) * 0.3; mon.z -= 5.5 * dt; mon.x += (0 - mon.x) * dt; mon.yawT = 0;
    if (L.t > 3 || mon.z <= HOUSE_FRONT + 4) { L.phase = 'fall'; mon.vy = 0; L.t = 0; }
  } else {                                                                            // hạ xuống nhẹ nhàng, bóng nổ khi chạm đất
    mon.y = Math.max(0, mon.y - dt * 4.5); mon.z = Math.max(HOUSE_FRONT + 2, mon.z - 1.5 * dt);
    if (mon.y <= 0) { mon.y = 0; mon.lift = null; popBalloons(L.item); puff(new V3(mon.x, 0.3, mon.z), { color: 0xd8c6a0, n: 8, size: 1, speed: 3, life: 0.7 }); sfx('thud'); }
  }
}
function applyMon() {
  const gt = groundY(mon.x, mon.z); mon.gy += (gt - mon.gy) * 0.25;
  mon.root.position.set(mon.x, mon.y + mon.gy, mon.z);
  { const d = Math.atan2(Math.sin((mon.yawT || 0) - (mon.yaw || 0)), Math.cos((mon.yawT || 0) - (mon.yaw || 0))); mon.yaw = (mon.yaw || 0) + d * 0.15; }   // xoay theo đường ngắn nhất
  mon.root.rotation.y = Math.PI - mon.yaw;
  if (mon.flip) mon.tilt.rotation.x = -Math.PI * 2 * clamp(mon.flip.t / mon.flip.dur, 0, 1); // lộn nhào ra sau
  else {
    const tiltT = mon.kv > 0.5 ? -0.45 * Math.min(1, mon.kv / 8) : (mon.windLean > 0 ? 0.3 * mon.windLean : 0);
    mon.tilt.rotation.x += (tiltT - mon.tilt.rotation.x) * 0.2;
  }
  mon.tilt.rotation.z = mon.lift && mon.lift.phase !== 'rise' ? Math.sin(time * 3) * 0.15 : 0;
  groundFeet();
}
// Bám đất: đo đế giày thấp nhất rồi nâng/hạ cả người cho đế giày chạm đúng mặt đất (không lún, không lơ lửng)
const _fv = new V3();
function groundFeet() {
  const z = mon.z3; if (!z) return;
  const free = mon.y > 0.02 || mon.lift || mon.carry || mon.flip || ['Jump', 'Wave', 'Death', 'Eat', 'Cheer', 'Dance'].includes(mon.cur);
  if (free) { mon.footAdj = (mon.footAdj || 0) * 0.85; z.root.position.y = -MON_H * 0.45 + mon.footAdj; return; }
  z.root.position.y = -MON_H * 0.45 + (mon.footAdj || 0);
  mon.root.updateMatrixWorld(true);
  if (z.glb) {
    if (!z.feet.length) return;
    let lowB = Infinity; for (const f of z.feet) { f.getWorldPosition(_fv); lowB = Math.min(lowB, _fv.y); }
    const errB = (lowB - z.footRest) - mon.root.position.y;
    mon.footAdj = clamp((mon.footAdj || 0) - errB, -0.2, 0.2); z.root.position.y = -MON_H * 0.45 + mon.footAdj;
    return;
  }
  let low = Infinity;
  for (const L of z.legs) { L.foot.getWorldPosition(_fv); _fv.y -= 0.065 * L.foot.parent.getWorldScale(new V3()).y * 1.0; low = Math.min(low, _fv.y); }
  const err = low - mon.root.position.y;                                     // >0 lơ lửng, <0 lún
  mon.footAdj = clamp((mon.footAdj || 0) - err, -0.3, 0.45);
  z.root.position.y = -MON_H * 0.45 + mon.footAdj;
}

// =====================================================================
// ĐỒ VẬT bay ra từ cửa nhà
// =====================================================================
const items = [];
const DOOR_POS = () => new V3(rand(-0.25, 0.25), 1.3, HOUSE_FRONT + 0.45);
function newItem(kind, owner, g, o = {}) {
  const it = Object.assign({ kind, owner, g, t: 0, dead: false, state: 'fly', vel: new V3(), hp: 1, maxHp: 1, halfW: 0.5, halfD: 0.5, blocker: false, labelY: 1.6 }, o);
  g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  if (!['slime', 'pebble', 'mine', 'net', 'netwrap', 'bees', 'crow', 'meteor', 'ice', 'quicksand', 'lavacrack', 'tornado', 'leafpile', 'hand', 'ghosthand'].includes(kind)) addOutline(g, 0.022, 0.12);
  scene.add(g); items.push(it);
  const lb = it.noLabel ? { el: makeLabel(), bar: null } : ownerLabel(owner, it.blocker); it.label = lb.el; it.bar = lb.bar;
  return it;
}
function launch(it, from, to, T, spin = 0) {
  it.g.position.copy(from); it.from = from.clone(); it.to = to.clone(); it.T = T; it.ft = 0; it.spin = spin;
  it.vel.set((to.x - from.x) / T, (to.y - from.y) / T + 0.5 * G * T, (to.z - from.z) / T);
  it.state = 'fly';
}
function flyTime(from, to, k = 16) { return clamp(from.distanceTo(to) / k, 0.7, 2.4); }
function openDoor(d = 0.9) { if (!door.broken) { if (time > door.openUntil) sfx('creak'); door.openUntil = Math.max(door.openUntil, time + d); } }
// chọn chỗ rơi phía trước quái, tính cả quãng quái đi được trong lúc đồ vật đang bay
function aheadSpot(minA = 4, maxA = 13, onPath = 0.75) {
  const moving = !mon.blocker && mon.kv < 0.5 && !mon.lift && mon.stun <= 0;
  const mz = moving ? mon.z - CONFIG.monsterSpeed * flyTime(DOOR_POS(), mon.root.position) : mon.z;
  const room = mz - (HOUSE_FRONT + 2.6);
  if (room < minA) return null;
  const d = rand(minA, Math.min(maxA, room));
  const x = Math.random() < onPath ? mon.x + rand(-0.6, 0.6) : rand(-LANE, LANE);
  return new V3(clamp(x, -LANE, LANE), 0, mz - d);
}
function predictMon(T, y = 1.3) {
  let z = mon.z; if (!mon.blocker && mon.kv < 0.5 && !mon.lift && mon.stun <= 0) z -= CONFIG.monsterSpeed * T * 0.9;
  return new V3(mon.x, mon.y + mon.gy + y, Math.max(z, HOUSE_FRONT + 1));
}
function obstacleCount() { return items.filter(i => !i.dead && i.blocker).length; }

// ----- mô hình đồ vật -----
const woodStave = ctex(128, 128, (g, w, h) => { g.fillStyle = '#a0662f'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 16) { g.fillStyle = 'rgba(60,30,10,.45)'; g.fillRect(x, 0, 2, h); g.fillStyle = `rgba(255,220,170,${rand(0.05, 0.15)})`; g.fillRect(x + 4, 0, 8, h); } speckle(g, w, h, ['#6b3f18', '#c08a50'], 300, 1, 3); });
function mkBarrel() {
  const g = new THREE.Group();
  const pts = []; for (let i = 0; i <= 12; i++) { const y = 1.25 * i / 12; pts.push(new THREE.Vector2(0.5 + 0.09 * Math.sin(Math.PI * y / 1.25), y)); }
  put(new THREE.Mesh(geo('barrel', () => new THREE.LatheGeometry(pts, 22)), new THREE.MeshStandardMaterial({ map: woodStave, roughness: 0.8 })), 0, 0, 0, g);
  const top = new THREE.Mesh(geo('bcap', () => new THREE.CircleGeometry(0.5, 22)), MS(0x7a4a22, 0.9)); top.rotation.x = -Math.PI / 2; put(top, 0, 1.25, 0, g);
  for (const y of [0.2, 1.05]) { const t = new THREE.Mesh(geo('band', () => new THREE.TorusGeometry(0.56, 0.035, 6, 26)), MS(0x3a3a3a, 0.4, 0.8)); t.rotation.x = Math.PI / 2; put(t, 0, y, 0, g); }
  return g;
}
function mkTire() {
  const g = new THREE.Group(), roll = new THREE.Group(); g.add(roll);
  const inner = new THREE.Group(); inner.rotation.y = Math.PI / 2; roll.add(inner);
  put(new THREE.Mesh(geo('tire', () => new THREE.TorusGeometry(0.44, 0.19, 14, 30)), MS(0x1e1e1e, 0.9)), 0, 0, 0, inner);
  const hub = cyl(0.26, 0.26, 0.26, MS(0xc9ccd2, 0.3, 0.8), 0, 0, 0, inner, 16); hub.rotation.x = Math.PI / 2;
  g.userData.roll = roll; return g;
}
function mkTrap() {
  const g = new THREE.Group();
  cyl(0.62, 0.62, 0.05, MS(0x555a60, 0.5, 0.7), 0, 0.03, 0, g, 24);
  cyl(0.18, 0.18, 0.1, MS(0xb33a2a, 0.5, 0.4), 0, 0.08, 0, g, 12);
  const jaws = [];
  for (const s of [1, -1]) {
    const piv = new THREE.Group(); piv.rotation.y = s > 0 ? 0 : Math.PI; g.add(piv);
    const j = new THREE.Group(); piv.add(j); j.position.y = 0.06;
    const arc = new THREE.Mesh(geo('jaw', () => new THREE.TorusGeometry(0.55, 0.04, 6, 18, Math.PI)), MS(0x8a9097, 0.35, 0.9)); arc.rotation.x = -Math.PI / 2; put(arc, 0, 0, 0, j);
    for (let i = 1; i < 8; i++) { const a = i / 8 * Math.PI; const tooth = new THREE.Mesh(geo('tooth', () => new THREE.ConeGeometry(0.05, 0.16, 5)), MS(0xdfe3e8, 0.3, 0.9)); put(tooth, Math.cos(a) * 0.55, 0.08, -Math.sin(a) * 0.55, j); }
    jaws.push(j);
  }
  g.userData.jaws = jaws; return g;
}
function mkSlimeBlob() { return sph(0.55, MS(0x6be04a, 0.15, 0, { emissive: 0x1a5a10 }), 0, 0, 0, new THREE.Group()).parent; }
function mkPuddle() {
  const g = new THREE.Group();
  const p = cyl(1.9, 2.0, 0.08, MS(0x5fd63e, 0.12, 0, { emissive: 0x174f0c, transparent: true, opacity: 0.92 }), 0, 0.05, 0, g, 28); p.castShadow = false;
  for (let i = 0; i < 7; i++) sph(rand(0.12, 0.3), MS(0x8af06a, 0.1), rand(-1.3, 1.3), 0.1, rand(-1.3, 1.3), g);
  return g;
}
function mkFence() {
  const g = new THREE.Group(), w = MS(0xf4efe4, 0.75);
  for (let x = -6.1; x <= 6.11; x += 0.5) { box(0.3, 1.3, 0.08, w, x, 0.65, 0, g); const tip = new THREE.Mesh(geo('ftip', () => new THREE.ConeGeometry(0.21, 0.25, 4)), w); tip.rotation.y = Math.PI / 4; tip.scale.z = 0.27; put(tip, x, 1.42, 0, g); }
  box(12.6, 0.14, 0.08, MS(0xe0d8c8, 0.75), 0, 0.4, -0.08, g); box(12.6, 0.14, 0.08, MS(0xe0d8c8, 0.75), 0, 1.0, -0.08, g);
  return g;
}
function mkBomb() {
  const g = new THREE.Group();
  sph(0.5, MS(0x1d1d22, 0.25, 0.6), 0, 0.5, 0, g);
  cyl(0.15, 0.15, 0.2, MS(0x777777, 0.3, 0.8), 0, 1.02, 0, g, 10);
  const f = cyl(0.03, 0.03, 0.35, MS(0xc9a46a, 0.9), 0.08, 1.25, 0, g, 5); f.rotation.z = -0.4;
  const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, color: 0xffd060, blending: THREE.AdditiveBlending, depthWrite: false }));
  spark.position.set(0.16, 1.42, 0); spark.scale.setScalar(0.5); g.add(spark); g.userData.spark = spark;
  return g;
}
function mkBalloons() {
  const g = new THREE.Group();
  [[0, 0, 0xff2b3b], [-0.75, -0.3, 0xff4fa0], [0.75, -0.25, 0xffcf1f]].forEach(([x, y, c]) => {
    const b = sph(0.7, MS(c, 0.2, 0, { emissive: c, emissiveIntensity: 0.12 }), x, y, 0, g); b.scale.y = 0.82;
    const k = new THREE.Mesh(geo('knot', () => new THREE.ConeGeometry(0.1, 0.18, 6)), MS(c, 0.3)); k.rotation.x = Math.PI; put(k, x, y - 0.65, 0, g);
  });
  const lm = new THREE.LineBasicMaterial({ color: 0xffffff });
  const lg = new THREE.BufferGeometry().setFromPoints([new V3(), new V3(), new V3(), new V3(), new V3(), new V3()]);
  const line = new THREE.LineSegments(lg, lm); line.frustumCulled = false; scene.add(line);
  g.userData.line = line; return g;
}
const rockTex = ctex(128, 128, (g, w, h) => { g.fillStyle = '#8b8a86'; g.fillRect(0, 0, w, h); speckle(g, w, h, ['#5d5c58', '#b3b1ab', '#6f6e69'], 1500, 1, 4); });
function mkBoulder() {
  const g = new THREE.Group(), roll = new THREE.Group(); g.add(roll);
  const m = new THREE.Mesh(geo('boulder', () => blobGeo(2, 0.16, 4.2)), new THREE.MeshStandardMaterial({ map: rockTex, roughness: 0.95, flatShading: true }));
  m.scale.setScalar(2.2); put(m, 0, 0, 0, roll);
  g.userData.roll = roll; return g;
}
function mkPebble() { const g = new THREE.Group(); const m = new THREE.Mesh(geo('pebble', () => blobGeo(0, 0.2, 7)), MS(pick([0x8b8a86, 0x9a9488, 0x77746e]), 0.9)); m.scale.setScalar(rand(0.12, 0.2)); put(m, 0, 0, 0, g); return g; }
function mkSlipper() {
  const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
  box(0.3, 0.06, 0.7, MS(0x2f6fe0, 0.6), 0, 0, 0, inner); box(0.3, 0.03, 0.7, MS(0xffffff, 0.6), 0, 0.045, 0, inner);
  const s = new THREE.Mesh(geo('strap', () => new THREE.TorusGeometry(0.16, 0.035, 6, 14, Math.PI)), MS(0x2f6fe0, 0.6)); s.rotation.y = Math.PI / 2; put(s, 0, 0.05, 0.12, inner);
  g.userData.inner = inner; return g;
}
let foxGltf = null;
function mkFox() {
  if (!foxGltf) { const g = new THREE.Group(); sph(0.4, MS(0xd2702a), 0, 0.45, 0, g); return { g, mixer: null }; }
  const m = SkeletonUtils.clone(foxGltf.scene);
  m.scale.setScalar(0.8 / (boneTop(m) * 1.2));
  const g = new THREE.Group(); g.add(m);
  const mixer = new THREE.AnimationMixer(m);
  const run = foxGltf.animations.find(a => a.name === 'Run'); if (run) mixer.clipAction(run).play();
  return { g, mixer };
}

// ----- cây bắn đậu: cắm trên đường, bắn liên tục đẩy zombie lùi -----
function mkShooter() {
  const g = new THREE.Group();
  cyl(0.32, 0.24, 0.4, MS(0x9a5a2c, 0.85), 0, 0.2, 0, g, 14);
  cyl(0.3, 0.3, 0.04, MS(0x4a2e1c, 1), 0, 0.4, 0, g, 14);
  cyl(0.06, 0.08, 0.9, MS(0x2f8a2a), 0, 0.85, 0, g, 8);
  for (const sx of [-1, 1]) { const l = sph(0.35, MS(0x3aa832), sx * 0.28, 0.6, 0, g); l.scale.set(0.35, 0.07, 0.18); l.rotation.z = sx * 0.5; }
  const head = new THREE.Group(); head.position.y = 1.38; g.add(head);
  sph(0.34, MS(0x5ccf3e, 0.55), 0, 0, 0, head);
  const tube = cyl(0.13, 0.17, 0.42, MS(0x5ccf3e, 0.55), 0, 0.02, 0.35, head, 14); tube.rotation.x = Math.PI / 2;
  cyl(0.1, 0.1, 0.03, MS(0x103010, 1), 0, 0.02, 0.57, head, 12).rotation.x = Math.PI / 2;
  for (const sx of [-1, 1]) { sph(0.08, MS(0xffffff, 0.4), sx * 0.14, 0.14, 0.24, head); sph(0.04, MS(0x111111, 0.3), sx * 0.14, 0.15, 0.31, head); }
  const crest = sph(0.2, MS(0x3aa832), 0, 0.18, -0.3, head); crest.scale.set(0.12, 0.2, 0.3);
  g.userData.head = head; return g;
}
const peas = [];
function firePea(it) {
  const h = it.g.userData.head; h.updateMatrixWorld(true);
  const from = new V3(0, 0.02, 0.6).applyMatrix4(h.matrixWorld);
  const m = sph(0.12, MS(0x7ee04a, 0.3, 0, { emissive: 0x2a6a10 }), from.x, from.y, from.z, scene); m.castShadow = false;
  const aim = new V3(mon.x, from.y, mon.z).sub(from); aim.y = 0;                  // nhắm chỗ zombie đứng lúc bắn
  peas.push({ m, owner: it.owner, t: 0, v: aim.normalize().multiplyScalar(14) }); it.recoil = 1; sfx('pea');
}
function updatePeas(dt) {
  for (let i = peas.length - 1; i >= 0; i--) {
    const pe = peas[i], p = pe.m.position; pe.t += dt;
    p.addScaledVector(pe.v, dt);                                                   // bay thẳng, không đuổi theo
    const dx = p.x - mon.x, dz = p.z - mon.z, dy = p.y - (mon.y + mon.gy + MON_H * 0.55);
    if (Math.hypot(dx, dz) < 0.42 && Math.abs(dy) < MON_H * 0.55 && state.phase === 'play' && !mon.lift && !mon.carry) {
      puff(p.clone(), { color: 0x9cf06a, n: 7, size: 0.35, speed: 3, life: 0.4, add: true }); sfx('splat');
      hitMonster(6, 1.3, pe.owner, Math.random() < 0.25 ? { text: 'PẰNG!' } : {});
      scene.remove(pe.m); peas.splice(i, 1); continue;
    }
    if (pe.t > 3 || Math.abs(p.x) > 8 || state.phase !== 'play') { puff(p.clone(), { color: 0x9cf06a, n: 2, size: 0.2, speed: 1, life: 0.3 }); scene.remove(pe.m); peas.splice(i, 1); }
  }
}
// ----- khoai tây lăn -----
const potatoTex = ctex(256, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#dcaa6c'); gr.addColorStop(0.5, '#c78f52'); gr.addColorStop(1, '#ad7740');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  speckle(g, w, h, ['#b07a42', '#e6bb82', '#9c6a36'], 700, 1, 2.5);
  for (let i = 0; i < 7; i++) { g.fillStyle = 'rgba(120,76,36,.35)'; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, rand(2, 4), rand(1.5, 3), rand(0, 3), 0, 7); g.fill(); }
});
// khoai tây: thuôn tròn, một đầu nhỏ hơn (lăn lệch lung tung), mặt to: mắt tròn lồi + lông mày chau
function mkPotato() {
  const g = new THREE.Group(), yaw = new THREE.Group(), roll = new THREE.Group(); g.add(yaw); yaw.add(roll);
  const body = new THREE.Mesh(geo('potato3', () => {
    const pts = [];
    for (let i = 0; i <= 28; i++) { const t = i / 28; pts.push(new THREE.Vector2(Math.max(0.001, 0.42 * Math.pow(Math.sin(Math.PI * t), 0.55) * (1 - 0.18 * t)), -0.56 + 1.12 * t)); }
    return new THREE.LatheGeometry(pts, 32);
  }), new THREE.MeshStandardMaterial({ map: potatoTex, roughness: 0.42, envMapIntensity: 0.75 }));
  body.rotation.z = Math.PI / 2; body.castShadow = true; roll.add(body);   // trục dài nằm ngang, đầu to về +x
  const face = new THREE.Group(); face.position.x = 0.08; roll.add(face);
  const white = MS(0xfbf8f0, 0.25), pupil = MS(0x141010, 0.15), browM = MS(0x3b2210, 0.7), mouthM = MS(0x5a2a14, 0.7);
  for (const sx of [-1, 1]) {
    const e = sph(0.13, white, sx * 0.135, 0.12, 0.33, face); e.scale.set(0.12, 0.14, 0.08);     // mắt tròn lồi
    sph(0.06, pupil, sx * 0.12, 0.1, 0.405, face);
    sph(0.018, white, sx * 0.12 + 0.02, 0.125, 0.455, face);                                       // ánh mắt
    const b = box(0.22, 0.06, 0.07, browM, sx * 0.14, 0.29, 0.33, face); b.rotation.z = sx * 0.45; b.rotation.x = -0.4;   // lông mày chau
  }
  const mouth = box(0.16, 0.035, 0.035, mouthM, 0, -0.08, 0.4, face); mouth.rotation.z = 0.1;
  roll.scale.setScalar(1.4); // to cỡ nửa người như clip gốc
  g.userData.yaw = yaw; g.userData.roll = roll;
  return g;
}
function restPotato(it) {
  // lăn chậm dần rồi nằm lại trên sân làm chướng ngại (đấm 1 phát là vỡ)
  Object.assign(it, { state: 'set', blocker: true, hp: 40, maxHp: 40, halfW: 0.8, halfD: 0.6, debrisColor: 0xb47c45, restT: 0 });
  const resting = items.filter(i => !i.dead && i.kind === 'potato' && i.state === 'set');
  if (resting.length > 25) breakItem(resting[0]);
}
// ----- thùng thuốc nổ -----
function mkXBarrel() {
  const g = mkBarrel();
  g.userData.body = g.children[0].material;
  cyl(0.6, 0.6, 0.22, MS(0xd8281e, 0.6), 0, 0.62, 0, g, 22);
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; box(0.16, 0.24, 0.03, MS(0xffd21f, 0.6), Math.sin(a) * 0.61, 0.62, Math.cos(a) * 0.61, g).rotation.y = a; }
  return g;
}
function barrelBoom(it) {
  const p = it.g.position.clone();
  explosion(p, 1.3); debris(p.clone().setY(0.8), 0x9a5f2c, 14, 0.2, 9); debris(p.clone().setY(0.8), 0xd8281e, 5, 0.15, 8);
  for (const o of items) if (o !== it && !o.dead && o.state === 'set' && o.kind !== 'fence' && o.kind !== 'mine' && o.g.position.distanceTo(p) < 2.5) breakItem(o);
  const R = 5.5, d = Math.hypot(p.x - mon.x, p.z - mon.z);
  if (d < R && mon.y < 3 && !mon.lift && !mon.carry) {
    const k = 1 - d / R;                      // càng gần → càng đau, văng càng xa
    mon.vy = Math.max(mon.vy, 3 + 9 * k);
    if (k > 0.55) { mon.flip = { t: 0, dur: 2 * mon.vy / 26 }; mon.cur = ''; }
    mon.x = clamp(mon.x + clamp(mon.x - p.x, -1, 1) * 1.2 * k, -LANE, LANE);
    hitMonster(Math.round(30 + 170 * k), 1 + 6 * k, it.owner, { text: k > 0.6 ? 'ĐÙNG!!!' : 'ĐÙNG!', unblockable: true });
  }
  removeItem(it);
}
// ----- mìn đất (đặt ngẫu nhiên mỗi ván) -----
const CHAR_COL = new THREE.Color(0x141414);
const MINE_OWNER = { id: '', name: 'Mìn' };
function mkMine() {
  const g = new THREE.Group();
  const mound = sph(0.62, MS(0x7a5530, 1), 0, 0, 0, g); mound.scale.set(1, 0.3, 1);
  for (let i = 0; i < 6; i++) sph(0.1, MS(0x5e3f22, 1), rand(-0.55, 0.55), 0.04, rand(-0.55, 0.55), g);
  cyl(0.24, 0.28, 0.12, MS(0x3c4248, 0.4, 0.8), 0, 0.19, 0, g, 14);
  const led = sph(0.07, new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 2 }), 0, 0.28, 0, g);
  g.userData.led = led; return g;
}
function placeMine(minDist = 7) {
  for (let k = 0; k < 25; k++) {
    const x = rand(-LANE + 0.4, LANE - 0.4), z = rand(HOUSE_FRONT + 6, START_Z - 7);
    if (Math.hypot(x - mon.x, z - mon.z) < minDist) continue;
    if (items.some(i => !i.dead && i.kind === 'mine' && Math.hypot(i.g.position.x - x, i.g.position.z - z) < 4)) continue;
    const it = newItem('mine', MINE_OWNER, mkMine(), { noLabel: true });
    it.g.position.set(x, 0, z); it.state = 'set'; return it;
  }
}
// ----- chướng ngại riêng của từng map (đá / bí ngô / người tuyết), quái phải đấm vỡ -----
function mkProp(kind) {
  const g = new THREE.Group();
  if (kind === 'pumpkin') {
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; const r = sph(0.4, MS(0xe8761e, 0.6), Math.cos(a) * 0.2, 0.42, Math.sin(a) * 0.2, g); r.scale.set(0.34, 0.42, 0.34); }
    cyl(0.05, 0.07, 0.25, MS(0x4a6a20, 0.8), 0, 0.9, 0, g, 6);
    const glow = new THREE.MeshStandardMaterial({ color: 0x3a1a00, emissive: 0xffb020, emissiveIntensity: 1.2 });
    for (const sx of [-1, 1]) { const e = box(0.12, 0.1, 0.05, glow, sx * 0.14, 0.52, 0.5, g); e.rotation.z = sx * 0.5; }
    box(0.3, 0.07, 0.05, glow, 0, 0.32, 0.52, g);
  } else if (kind === 'snowman') {
    const snow = MS(0xf6f9fc, 0.7);
    sph(0.5, snow, 0, 0.45, 0, g); sph(0.37, snow, 0, 1.12, 0, g); sph(0.26, snow, 0, 1.62, 0, g);
    for (const sx of [-1, 1]) { sph(0.035, MS(0x111111, 0.4), sx * 0.09, 1.68, 0.23, g); const arm = cyl(0.025, 0.025, 0.7, MS(0x5a3a20, 0.9), sx * 0.55, 1.2, 0, g, 5); arm.rotation.z = sx * 1.0; }
    const nose = new THREE.Mesh(geo('carrot', () => new THREE.ConeGeometry(0.05, 0.25, 8)), MS(0xff7a1a, 0.6)); nose.rotation.x = Math.PI / 2; put(nose, 0, 1.6, 0.33, g);
    cyl(0.2, 0.2, 0.28, MS(0x1d1d22, 0.5), 0, 1.95, 0, g, 14); cyl(0.3, 0.3, 0.04, MS(0x1d1d22, 0.5), 0, 1.82, 0, g, 14);
    box(0.5, 0.08, 0.32, MS(0xd8281e, 0.7), 0, 1.4, 0.05, g);
  } else if (kind === 'grave') {
    const st = MS(0x8a8a96, 0.95);
    box(0.85, 0.9, 0.2, st, 0, 0.45, 0, g); const top = cyl(0.425, 0.425, 0.2, st, 0, 0.9, 0, g, 16); top.rotation.x = Math.PI / 2; top.scale.y = 1;
    box(0.5, 0.06, 0.03, MS(0x55555f, 0.9), 0, 0.82, 0.11, g); box(0.06, 0.4, 0.03, MS(0x55555f, 0.9), 0, 0.72, 0.11, g);
    const mound = sph(0.6, MS(0x3a2e22, 1), 0, 0, 0.55, g); mound.scale.set(0.5, 0.16, 0.7);
    sph(0.12, MS(0x4a6a3a, 1), 0.3, 0.08, 0.3, g);
  } else if (kind === 'cactus') {
    const gm = MS(0x3f8a36, 0.7), sp = MS(0xf4efd8, 0.6);
    cyl(0.24, 0.28, 1.7, gm, 0, 0.85, 0, g, 10); sph(0.24, gm, 0, 1.7, 0, g);
    for (const sx of [-1, 1]) { const a = cyl(0.13, 0.13, 0.55, gm, sx * 0.42, 1.0 + sx * 0.12, 0, g, 8); sph(0.13, gm, sx * 0.42, 1.28 + sx * 0.12, 0, g); const c = cyl(0.12, 0.12, 0.3, gm, sx * 0.28, 0.75 + sx * 0.12, 0, g, 8); c.rotation.z = Math.PI / 2; a.position.y += 0.1; }
    for (let i = 0; i < 26; i++) { const a = rand(0, 6.28), y = rand(0.2, 1.8); const s = box(0.02, 0.02, 0.14, sp, Math.cos(a) * 0.27, y, Math.sin(a) * 0.27, g); s.rotation.y = -a + Math.PI / 2; s.castShadow = false; }
    sph(0.09, MS(0xff6aa8, 0.5), 0, 1.95, 0, g);
  } else if (kind === 'lavarock') {
    const m = new THREE.Mesh(geo('rockp', () => blobGeo(1, 0.2, 5.5)), new THREE.MeshStandardMaterial({ map: rockTex, color: 0x6a5a54, roughness: 0.95, flatShading: true }));
    m.scale.set(0.85, 0.65, 0.75); put(m, 0, 0.45, 0, g);
    const glow = new THREE.MeshStandardMaterial({ color: 0x2a0a00, emissive: 0xff5a10, emissiveIntensity: 2.2 });
    for (let i = 0; i < 5; i++) { const a = rand(0, 6.28); const c = box(0.05, rand(0.25, 0.5), 0.05, glow, Math.cos(a) * 0.62, rand(0.3, 0.7), Math.sin(a) * 0.55, g); c.rotation.z = rand(-0.6, 0.6); c.castShadow = false; }
  } else {
    const m = new THREE.Mesh(geo('rockp', () => blobGeo(1, 0.2, 5.5)), new THREE.MeshStandardMaterial({ map: rockTex, roughness: 0.95, flatShading: true }));
    m.scale.set(0.8, 0.6, 0.7); put(m, 0, 0.45, 0, g);
  }
  return g;
}
const PROP_INFO = { pumpkin: { hp: 80, color: 0xe8761e }, snowman: { hp: 120, color: 0xf6f9fc }, rock: { hp: 120, color: 0x8b8a86 },
  grave: { hp: 120, color: 0x8a8a96 }, cactus: { hp: 100, color: 0x4a8a3a, spiky: true }, lavarock: { hp: 140, color: 0x3a2a24 } };
function placeProp(kind) {
  for (let k = 0; k < 25; k++) {
    const x = rand(-LANE + 0.6, LANE - 0.6), z = rand(HOUSE_FRONT + 6, START_Z - 9);
    if (items.some(i => !i.dead && (i.kind === 'mine' || i.kind === 'prop') && Math.hypot(i.g.position.x - x, i.g.position.z - z) < 3.5)) continue;
    const info = PROP_INFO[kind] || PROP_INFO.rock;
    const it = newItem('prop', MINE_OWNER, mkProp(kind), { noLabel: true, blocker: true, hp: info.hp, maxHp: info.hp, halfW: 0.6, halfD: 0.55, debrisColor: info.color, spiky: !!info.spiky });
    it.g.position.set(x, 0, z); it.g.rotation.y = rand(-0.4, 0.4); it.state = 'set'; return it;
  }
}
// ----- hoa gió nhiều cánh -----
function mkFlower() {
  const g = new THREE.Group();
  cyl(0.09, 0.14, 1.9, MS(0x2f8a2a), 0, 0.95, 0, g, 8);
  for (const s of [-1, 1]) { const l = sph(0.5, MS(0x3a9a30), s * 0.42, 0.55, 0, g); l.scale.set(0.55, 0.08, 0.3); l.rotation.z = s * 0.5; }
  const head = new THREE.Group(); head.position.y = 2.1; g.add(head);
  const petals = new THREE.Group(); head.add(petals);
  for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; const pt = sph(0.44, MS(i % 2 ? 0xff5fa8 : 0xc86bff, 0.5), Math.cos(a) * 0.64, Math.sin(a) * 0.64, 0, petals); pt.scale.set(0.44, 0.14, 0.05); pt.rotation.z = a; }
  for (let i = 0; i < 12; i++) { const a = (i + 0.5) / 12 * Math.PI * 2; const pt = sph(0.3, MS(0xffa6d6, 0.5), Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0.05, petals); pt.scale.set(0.3, 0.12, 0.05); pt.rotation.z = a; }
  const c = sph(0.33, MS(0xffd21f, 0.6), 0, 0, 0.09, head); c.scale.z = 0.5;
  for (const sx of [-1, 1]) sph(0.055, MS(0x111111, 0.3), sx * 0.12, 0.08, 0.26, head);
  put(new THREE.Mesh(geo('blowmouth', () => new THREE.TorusGeometry(0.07, 0.03, 6, 14)), MS(0x8a2a10, 0.6)), 0, -0.11, 0.25, head);
  g.userData.petals = petals; g.userData.head = head;
  return g;
}
function windOn() {
  let w = 0;
  for (const it of items) {
    if (it.dead || it.kind !== 'flower' || !(it.blowT > 0)) continue;
    const dz = mon.z - it.g.position.z, dx = Math.abs(mon.x - it.g.position.x);
    if (dz > 0.3 && dz < 16 && dx < 4.5) w = Math.max(w, 1 - dz / 22);
  }
  return mon.lift || mon.carry ? 0 : w;
}
// ----- sét đánh -----
const bolts = [];
function startLightning(u) {
  const cloud = new THREE.Group(); scene.add(cloud);
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: pick([0x2a2d36, 0x3a3e48, 0x22252c]), transparent: true, opacity: 0, depthWrite: false }));
    s.position.set(rand(-2.6, 2.6), rand(-0.5, 0.6), rand(-1.5, 1.5)); s.scale.setScalar(rand(2.6, 4.2)); cloud.add(s);
  }
  cloud.position.set(mon.x, mon.y + mon.gy + 9, mon.z);
  bolts.push({ cloud, t: 0, owner: u, bolt: null, bt: 0 });
  sfx('rumble');
}
function makeBolt(a, b) {
  const g = new THREE.Group();
  const core = new THREE.MeshBasicMaterial({ color: 0xf2f8ff });
  const glow = new THREE.MeshBasicMaterial({ color: 0x7fb8ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  const cg = geo('boltcyl', () => new THREE.CylinderGeometry(1, 1, 1, 6));
  const seg = (p, q, r) => {
    const d = q.clone().sub(p), len = d.length(), mid = p.clone().addScaledVector(d, 0.5), dir = d.normalize();
    for (const [m, rr] of [[core, r], [glow, r * 3.5]]) {
      const c = new THREE.Mesh(cg, m); c.scale.set(rr, len, rr); c.position.copy(mid);
      c.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir); g.add(c);
    }
  };
  const pts = [a.clone()], n = 10;
  for (let i = 1; i < n; i++) pts.push(new V3().lerpVectors(a, b, i / n).add(new V3(rand(-0.8, 0.8), 0, rand(-0.8, 0.8))));
  pts.push(b.clone());
  for (let i = 0; i < pts.length - 1; i++) {
    seg(pts[i], pts[i + 1], 0.06);
    if (i > 1 && Math.random() < 0.35) seg(pts[i], pts[i].clone().add(new V3(rand(-2, 2), rand(-2.5, -1), rand(-1, 1))), 0.03);
  }
  return g;
}
function screenFlash() {
  const f = document.getElementById('flashScr');
  f.style.transition = 'none'; f.style.opacity = '0.85'; void f.offsetWidth;
  f.style.transition = 'opacity .45s'; f.style.opacity = '0';
}
function updateBolts(dt) {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const L = bolts[i]; L.t += dt;
    if (!L.bolt) L.cloud.position.lerp(tv.set(mon.x, mon.y + mon.gy + 9, mon.z), Math.min(1, dt * 5));
    const op = L.t < 1 ? L.t * 0.9 : Math.max(0, 0.9 - (L.t - 1.8) * 0.9);
    L.cloud.children.forEach(s => { s.material.opacity = op; });
    L.cloud.rotation.y += dt * 0.5;
    if (!L.bolt && L.t > 1.2) {
      const top = L.cloud.position.clone(), hit = new V3(mon.x, mon.y + mon.gy + MON_H * 0.9, mon.z);
      L.bolt = makeBolt(top, hit); scene.add(L.bolt);
      flash.color.setHex(0x9fd0ff); flash.position.copy(hit); flash.intensity = 260;
      screenFlash(); sfx('thunder'); camShake = Math.max(camShake, 0.7);
      puff(hit, { color: 0x9fd0ff, n: 14, add: true, tex: starTex, speed: 6, size: 0.5, life: 0.5, grav: 6 });
      if (state.phase === 'play') { mon.charT = 6; hitMonster(120, 3.5, L.owner, { stun: 1.6, text: '⚡ ZẸT!', unblockable: true }); }
    }
    if (L.bolt) { L.bt += dt; L.bolt.visible = L.bt < 0.4 && Math.random() > 0.25; }
    if (L.t > 2.8) { scene.remove(L.cloud); L.cloud.children.forEach(s => s.material.dispose()); if (L.bolt) scene.remove(L.bolt); bolts.splice(i, 1); }
  }
}
// ----- tạo từng loại -----
function spawnObstacleFromDoor(kind, owner, mk, o) {
  const from = DOOR_POS();
  let to = aheadSpot(o.minA ?? 4, o.maxA ?? 13, o.onPath ?? 0.75), onMon = false;
  if (!to || obstacleCount() >= 45) { to = new V3(mon.x, 0, mon.z); onMon = true; }
  if (kind === 'fence') to.x = 0;
  const it = newItem(kind, owner, mk(), o);
  it.onMon = onMon;
  launch(it, from, to, flyTime(from, to), o.spin ?? 6);
  openDoor(); sfx('whoosh');
  return it;
}
// mọc từ dưới đất lên ở chỗ ngẫu nhiên phía trước zombie (bẫy thì nằm đó tới khi bị dẫm)
function spawnFromGround(kind, owner, mk, o) {
  const minA = o.minA ?? 4, maxA = (o.maxA ?? 14) + 8, room = mon.z - (HOUSE_FRONT + 2.5);
  let x = 0, z = 0;
  for (let k = 0; k < 12; k++) {
    z = room > minA ? mon.z - rand(minA, Math.min(maxA, room)) : mon.z - rand(0.6, 1.8);
    x = kind === 'fence' ? 0 : Math.random() < (o.onPath ?? 0.6) * 0.55 ? clamp(mon.x + rand(-1, 1), -LANE, LANE) : rand(-LANE + 0.4, LANE - 0.4);
    if (!items.some(i => !i.dead && i.state === 'set' && Math.hypot(i.g.position.x - x, i.g.position.z - z) < 1.3)) break;
  }
  const it = newItem(kind, owner, mk(), o);
  it.g.position.set(x, -1.2, z); it.g.rotation.y = rand(-0.4, 0.4); it.g.scale.setScalar(0.4); it.state = 'rise'; it.t = 0; it.noRescale0 = it.noRescale; it.noRescale = true;
  puff(new V3(x, 0.15, z), { color: T.dust || 0x8a6a40, n: 8, size: 0.8, speed: 2.5, up: 2, life: 0.7 }); debris(new V3(x, 0.2, z), 0x6a4a2a, 4, 0.1, 4); sfx('pop');
  return it;
}
const SPAWN = {
  rose: u => SPAWN.potato(u),                                                   // quà khoai (id cũ 'rose' giữ để quà đã gán không mất)
  plant: u => spawnFromGround('plant', u, mkShooter, { blocker: true, hp: 80, maxHp: 80, halfW: 0.45, halfD: 0.45, labelY: 2.0, debrisColor: 0x5ccf3e, minA: 6, maxA: 14, onPath: 0.35, spin: 0 }),
  potato: (u, mega) => {
    const it = newItem('potato', u, mkPotato(), { labelY: mega ? 2.6 : 1.1 });
    if (mega) { it.mega = true; it.R = 0.58 * 2.2; it.g.scale.setScalar(2.2); popText(DOOR_POS().setY(4.5), '🥔 KHOAI KHỔNG LỒ!', 'big', 1.4); camShake = 0.3; }
    launch(it, DOOR_POS(), new V3(rand(-1.2, 1.2), mega ? 1.2 : 0.4, HOUSE_FRONT + 3), 0.6, 5); openDoor(); sfx('whoosh');
  },
  xbarrel: u => spawnObstacleFromDoor('xbarrel', u, mkXBarrel, { labelY: 1.6, minA: 2.5, maxA: 6, onPath: 0.9, spin: 6 }),
  barrel: u => spawnObstacleFromDoor('barrel', u, mkBarrel, { blocker: true, hp: 80, maxHp: 80, halfW: 0.6, halfD: 0.6, labelY: 1.6, debrisColor: 0x9a5f2c }),
  fence: u => spawnObstacleFromDoor('fence', u, mkFence, { blocker: true, hp: 160, maxHp: 160, halfW: 6.4, halfD: 0.3, labelY: 1.9, debrisColor: 0xf4efe4, minA: 5, maxA: 9, spin: 0, onPath: 0 }),
  trap: u => spawnFromGround('trap', u, mkTrap, { labelY: 0.6, minA: 3.5, maxA: 9, onPath: 0.85, spin: 4 }),
  slime: u => spawnFromGround('slime', u, mkSlimeBlob, { labelY: 0.8, minA: 3, maxA: 8, onPath: 0.8, spin: 3 }),
  flower: u => { spawnFromGround('flower', u, mkFlower, { labelY: 3.0, minA: 3, maxA: 6, onPath: 0.9, spin: 0 }); },
  lightning: u => startLightning(u),
  // mìn đất do người xem tặng: bay ra từ cửa, cắm xuống đất phía trước quái (3 quả)
  mine: u => { for (let i = 0; i < 3; i++) later(i * 0.3, () => { if (state.phase === 'play') SPAWN.mine1(u); }); },
  mine1: u => spawnFromGround('mine', u, mkMine, { labelY: 0.9, minA: 4, maxA: 18, onPath: 0.6, spin: 6 }),
  bomb: u => spawnObstacleFromDoor('bomb', u, mkBomb, { labelY: 1.7, minA: 3, maxA: 8, onPath: 0.8, spin: 5 }),
  tire: u => {
    const it = newItem('tire', u, mkTire(), { labelY: 1.9 });
    const from = DOOR_POS(); launch(it, from, new V3(rand(-1, 1), 0.63, HOUSE_FRONT + 3), 0.6, 0);
    openDoor(); sfx('whoosh');
  },
  boulder: u => {
    const it = newItem('boulder', u, mkBoulder(), { labelY: 4.8 });
    it.g.position.set(0, 2.2, HOUSE_FRONT + 0.5); it.g.scale.setScalar(0.2); it.state = 'grow';
    door.openUntil = time + 1.5; sfx('creak'); camShake = 0.4;
    banner('🪨 TẢNG ĐÁ KHỔNG LỒ!', esc(u.name) + ' lăn đá khổng lồ');
  },
  balloon: u => {
    if (mon.lift || mon.carry || items.some(i => !i.dead && i.kind === 'balloon')) { runAction('shoes', u); return; }
    const it = newItem('balloon', u, mkBalloons(), { labelY: 1.4 });
    it.g.position.set(mon.x + rand(-1, 1), 8, mon.z + 5); it.state = 'seek'; sfx('whoosh');      // bóng bay từ phía sau tới cứu
    banner('🎈 BÓNG BAY CỨU!', esc(u.name) + ' đưa zombie bay tới');
  },
  fox: u => {
    const f = mkFox(); const it = newItem('fox', u, f.g, { labelY: 1.5, mixer: f.mixer, life: 12, hits: 0 });
    it.g.position.set(rand(-0.4, 0.4), 0, HOUSE_FRONT + 0.8); it.state = 'run'; openDoor(); sfx('bite');
  },
  pebble: u => {
    const it = newItem('pebble', u, mkPebble(), { labelY: 1.1 });
    it.g.scale.setScalar(3.2); it.noRescale = true;                               // cục đá (đủ tim cả phòng mới có)
    const from = new V3(pick([-3.6, 3.6]) + rand(-0.4, 0.4), 2.7, HOUSE_FRONT + 0.3);
    const T = flyTime(from, mon.root.position, 24), to = predictMon(T);
    launch(it, from, to, T, 10); it.thrown = { dmg: 15, knock: 1.4, text: 'CỐP!' };
  },
  banana: u => spawnFromGround('banana', u, mkBanana, { labelY: 0.6, minA: 2.5, maxA: 7, onPath: 0.9, spin: 8 }),
  net: u => {
    const it = newItem('net', u, mkNet(), { labelY: 0.9 });
    const from = DOOR_POS(), T = flyTime(from, mon.root.position, 18), to = predictMon(T, 1.2);
    launch(it, from, to, T, 4); it.thrown = { dmg: 12, knock: 0, text: 'DÍNH LƯỚI!', stun: 2.5, unblockable: true }; openDoor(0.5); sfx('whoosh');
  },
  bees: u => {
    const it = newItem('bees', u, mkBees(), { labelY: 1.0, life: 6.5, cd: 0 });
    it.g.position.copy(DOOR_POS()); it.state = 'chase'; openDoor(0.6); sfx('hiss');
  },
  crows: u => { for (let i = 0, n = u === MAP_OWNER ? 3 : 5; i < n; i++) later(i * 0.3, () => { if (state.phase === 'play') SPAWN.crow1(u); }); if (u !== MAP_OWNER) banner('🐦 ĐÀN QUẠ!', esc(u.name) + ' thả quạ'); else popText(new V3(mon.x, mon.y + 3.6, mon.z), '🐦 QUẠ!', 'info', 1); },
  crow1: u => {
    const it = newItem('crow', u, mkCrow(), { noLabel: true, noRescale: true });
    const from = new V3(mon.x + rand(-7, 7), rand(8, 11), mon.z - rand(8, 15)), T = rand(1.0, 1.35), to = predictMon(T, 1.5);
    it.g.position.copy(from); it.vel.copy(to).sub(from).divideScalar(T); it.state = 'dive'; sfx('whoosh');   // bay thẳng tới chỗ quái SẼ đứng — không đổi hướng đuổi theo
  },
  meteor: u => { banner('☄️ MƯA THIÊN THẠCH!', esc(u.name) + ' gọi thiên thạch'); for (let i = 0; i < 5; i++) later(i * 0.55, () => { if (state.phase === 'play') SPAWN.meteor1(u); }); },
  meteor1: u => {
    const spot = new V3(clamp(mon.x + rand(-1.6, 1.6), -LANE, LANE), 0, Math.max(HOUSE_FRONT + 3, mon.z - rand(-0.5, 3.5)));
    const it = newItem('meteor', u, mkMeteor(), { noLabel: true, fall: 1.4, noRescale: true });
    it.g.position.copy(spot); it.state = 'fall'; sfx('rumble');
  },
  hand: u => {
    if (items.some(i => !i.dead && i.kind === 'hand') || mon.lift || mon.carry) { queueAction('meteor', u); return; }
    const it = newItem('hand', u, mkHand(), { labelY: 2.2, noRescale: true });
    it.spot = new V3(mon.x, 0, mon.z); it.g.position.set(mon.x, 26, mon.z); it.state = 'aim'; it.t = 0;
    it.shadow = new THREE.Mesh(geo('handsh', () => new THREE.CircleGeometry(1.5, 28)), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }));
    it.shadow.rotation.x = -Math.PI / 2; it.shadow.position.copy(it.spot).setY(0.04); scene.add(it.shadow);
    banner('🫳 BÀN TAY KHỔNG LỒ!', esc(u.name) + ' — streamer né mau!'); sfx('rumble');
  },
  quake: u => {
    banner('🌋 ĐỘNG ĐẤT!!!', esc(u.name) + ' làm rung chuyển mặt đất'); screenFlash(); sfx('boom'); sfx('rumble');
    state.quakeT = 3; hitMonster(150, 9, u, { stun: 1.6, text: 'RUNG CHUYỂN!', unblockable: true });
    door.hp = Math.min(door.maxHp, door.hp + 300); popText(new V3(0, 4.4, HOUSE_FRONT + 0.45), '+300 🔧', 'heal');
    for (let i = 0; i < 6; i++) later(0.4 + i * 0.25, () => { if (state.phase === 'play') placePropAhead(T.prop); });
    later(1.2, () => { if (state.phase === 'play') SPAWN.meteor1(u); });
  },
  tornado: u => {
    const it = newItem('tornado', u, mkTornado(), { noLabel: true, noRescale: true });
    const sd = Math.random() < 0.5 ? -1 : 1;
    it.g.position.set(sd * (LANE + 1.5), 0, Math.max(HOUSE_FRONT + 4, mon.z - rand(4, 8))); it.vx = -sd * rand(2.4, 3.2); it.state = 'spin';
    popText(new V3(it.g.position.x, 4.5, it.g.position.z), '🌪️ LỐC XOÁY!', 'big', 1.4); sfx('wind');
  },
  slipper: u => {
    const it = newItem('slipper', u, mkSlipper(), { labelY: 0.8 });
    const from = DOOR_POS(), T = flyTime(from, mon.root.position, 20), to = predictMon(T);
    launch(it, from, to, T, 0); it.thrown = { dmg: 6, knock: 0.35, text: 'BỘP!' }; openDoor(0.5); sfx('whoosh');
  },
};
// =====================================================================
// BẪY MỚI + BẪY ĐẶC SẢN TỪNG MAP + CỘT MỐC + NÂNG CẤP CỬA
// =====================================================================
const MAP_OWNER = { id: '', name: '☠️ Bản đồ' };
// ----- cột mốc giữa đường -----
let cpZ = 0; const cp = { g: null, tex: null };
function restZ() { return state.cp ? cpZ : START_Z; }   // bị đẩy lùi / bị ném về tối đa tới đây
function drawCp(ok) {
  if (!cp.tex) return; const c = cp.tex.image, g = c.getContext('2d');
  g.fillStyle = ok ? '#22a04a' : '#d2342a'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(255,255,255,.16)'; for (let x = 0; x < c.width; x += 48) g.fillRect(x, 0, 24, c.height);
  g.font = 'bold 46px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,.45)'; g.fillStyle = '#fff';
  const t = ok ? '✅ ĐÃ QUA CỘT MỐC' : '🚩 CỘT MỐC'; g.strokeText(t, c.width / 2, c.height / 2 + 3); g.fillText(t, c.width / 2, c.height / 2 + 3);
  cp.tex.needsUpdate = true; if (cp.ban && !ok) cp.ban.visible = true;
}
function buildCheckpoint() {
  cpZ = Math.round((START_Z + HOUSE_FRONT) / 2);
  const g = new THREE.Group(); g.position.set(0, 0, cpZ); world.add(g); cp.g = g; g.visible = CONFIG.checkpoint;
  const pole = MS(0xf4f4f4, 0.5, 0.2);
  for (const sx of [-1, 1]) { cyl(0.1, 0.12, 3.7, pole, sx * 6.1, 1.85, 0, g, 10); sph(0.17, MS(0xffd84a, 0.35, 0.4), sx * 6.1, 3.78, 0, g); }
  const c = document.createElement('canvas'); c.width = 1024; c.height = 80;
  cp.tex = new THREE.CanvasTexture(c); cp.tex.colorSpace = THREE.SRGBColorSpace;
  cp.ban = put(new THREE.Mesh(new THREE.PlaneGeometry(12.2, 0.95), new THREE.MeshStandardMaterial({ map: cp.tex, side: THREE.DoubleSide, roughness: 0.8 })), 0, 3.15, 0, g);
  const chk = ctex(256, 32, (q, w) => { for (let i = 0; i < w / 16; i++) for (let j = 0; j < 2; j++) { q.fillStyle = (i + j) % 2 ? '#151515' : '#ffffff'; q.fillRect(i * 16, j * 16, 16, 16); } });
  const ln = new THREE.Mesh(new THREE.PlaneGeometry(LANE * 2 + 0.8, 0.5), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.9 }));
  ln.rotation.x = -Math.PI / 2; ln.position.y = 0.025; ln.receiveShadow = true; g.add(ln);
  drawCp(false);
}
function reachCp() {
  state.cp = true; drawCp(true); sfx('power');
  later(1.5, () => { if (cp.ban) cp.ban.visible = false; });   // camera sẽ ở sau mốc → ẩn băng rôn cho khỏi che màn hình
  banner('🚩 QUA CỘT MỐC!', 'Từ giờ không bị đẩy lùi quá mốc này nữa');
  for (let i = 0; i < 8; i++) puff(new V3(rand(-6, 6), rand(2, 4), cpZ), { color: pick([0xffd84a, 0x7dff6a, 0x7fc8ff, 0xff5a7a]), n: 4, size: 0.4, speed: 5, add: true, tex: starTex, grav: 4 });
}
// ----- cửa nâng cấp: sửa cửa khi đã đầy máu → tích điểm → gỗ → sắt → thép -----
function upgradeDoor(u) {
  door.tier++; door.maxHp = Math.round(door.maxHp * 1.4); door.hp = door.maxHp; door.shake = 0.4;
  doorLabel.querySelector('.dt').textContent = DOOR_NAME[door.tier];
  banner(`🛡️ NÂNG CẤP ${['', 'CỬA SẮT', 'CỬA THÉP'][door.tier]}!`, esc(u.name) + ' gia cố cửa nhà'); sfx('power'); addPoints(u, 60);
  puff(new V3(0, 1.8, HOUSE_FRONT + 0.6), { color: 0xcfe0ff, n: 16, size: 0.7, speed: 4, add: true, life: 1, tex: starTex });
}
// ----- mô hình bẫy mới -----
function mkBanana() {
  const g = new THREE.Group(), y = MS(0xffd23a, 0.55), br = MS(0x6a4a1a, 0.8);
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; const p = sph(1, y, Math.cos(a) * 0.2, 0.05, Math.sin(a) * 0.2, g); p.scale.set(0.24, 0.045, 0.1); p.rotation.y = -a; }
  sph(1, y, 0, 0.09, 0, g).scale.set(0.12, 0.08, 0.12); cyl(0.03, 0.04, 0.12, br, 0, 0.17, 0, g, 6);
  g.scale.setScalar(1.6); return g;
}
function mkNet() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo('netball', () => new THREE.IcosahedronGeometry(0.4, 1)), new THREE.MeshBasicMaterial({ color: 0xf0e6c0, wireframe: true })));
  for (const sx of [-1, 1]) sph(0.07, MS(0x777777, 0.4, 0.6), sx * 0.38, 0, 0, g);
  return g;
}
function attachNet(owner, dur) {
  if (state.phase !== 'play' || mon.lift || mon.carry) return;
  for (const o of items) if (!o.dead && o.kind === 'netwrap') removeItem(o);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo('netwrap', () => new THREE.SphereGeometry(1, 12, 10)), new THREE.MeshBasicMaterial({ color: 0xf0e6c0, wireframe: true, transparent: true, opacity: 0.9 })));
  const it = newItem('netwrap', owner, g, { noLabel: true, life: dur || 2.5, noRescale: true }); it.state = 'wrap';
}
function mkBees() {
  const g = new THREE.Group(), body = MS(0xffc21a, 0.5), dark = MS(0x1a1a1a, 0.6);
  const wingM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
  g.userData.bees = [];
  for (let i = 0; i < 8; i++) {
    const b = new THREE.Group(); g.add(b);
    sph(1, body, 0, 0, 0, b).scale.set(0.13, 0.13, 0.19);
    sph(1, dark, 0, 0, -0.05, b).scale.set(0.135, 0.135, 0.05); sph(1, dark, 0, 0, 0.07, b).scale.set(0.12, 0.12, 0.04);
    const w = [-1, 1].map(sx => { const m = new THREE.Mesh(geo('beewing', () => new THREE.PlaneGeometry(0.22, 0.13)), wingM); m.position.set(sx * 0.13, 0.11, 0); m.rotation.x = -Math.PI / 2; b.add(m); return m; });
    g.userData.bees.push({ b, w, ph: rand(0, 6.28), r: rand(0.3, 0.75), h: rand(-0.35, 0.35) });
  }
  return g;
}
function mkCrow() {
  const g = new THREE.Group(), blk = MS(0x1c1c22, 0.6), wm = MS(0x26262e, 0.7);
  sph(1, blk, 0, 0, 0, g).scale.set(0.2, 0.18, 0.38);
  sph(0.15, blk, 0, 0.08, 0.36, g);
  const beak = new THREE.Mesh(geo('beak', () => new THREE.ConeGeometry(0.05, 0.2, 6)), MS(0xf0b020, 0.5)); beak.rotation.x = Math.PI / 2; put(beak, 0, 0.06, 0.55, g);
  for (const sx of [-1, 1]) sph(0.03, MS(0xff3020, 0.3, 0, { emissive: 0xff2010, emissiveIntensity: 2 }), sx * 0.08, 0.13, 0.46, g);   // mắt đỏ
  box(0.22, 0.03, 0.25, wm, 0, 0.02, -0.45, g);
  const mkW = sx => { const pv = new THREE.Group(); pv.position.set(sx * 0.14, 0.06, 0); g.add(pv); box(0.6, 0.03, 0.26, wm, sx * 0.3, 0, 0, pv); return pv; };
  g.userData.wl = mkW(-1); g.userData.wr = mkW(1);
  g.scale.setScalar(1.5); return g;
}
function mkMeteor() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(geo('mring', () => new THREE.RingGeometry(1.5, 1.85, 32)), new THREE.MeshBasicMaterial({ color: 0xff3a20, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
  const dot = new THREE.Mesh(geo('mdot', () => new THREE.CircleGeometry(1.5, 32)), new THREE.MeshBasicMaterial({ color: 0xff3a20, transparent: true, opacity: 0.18, depthWrite: false }));
  dot.rotation.x = -Math.PI / 2; dot.position.y = 0.045; g.add(dot);
  const rock = new THREE.Mesh(geo('rockp', () => blobGeo(1, 0.2, 5.5)), new THREE.MeshStandardMaterial({ color: 0x3a2a24, emissive: 0xff4a10, emissiveIntensity: 1.6, flatShading: true, roughness: 0.9 }));
  rock.scale.setScalar(0.75); g.add(rock);
  g.userData.ring = ring; g.userData.rock = rock; return g;
}
function mkHand() {
  const g = new THREE.Group(), skin = MS(0xf1c27d, 0.65), sleeve = MS(0xd23a2a, 0.7);
  box(1.7, 0.45, 1.6, skin, 0, 0, 0, g);
  cyl(0.62, 0.72, 0.5, skin, 0, 0.35, 0, g, 14);
  cyl(0.95, 0.95, 0.5, MS(0xffffff, 0.8), 0, 0.75, 0, g, 16);
  cyl(0.8, 0.9, 16, sleeve, 0, 8.9, 0, g, 16);
  const fingers = [];
  [-0.6, -0.2, 0.2, 0.6].forEach((x, i) => {
    const pv = new THREE.Group(); pv.position.set(x, -0.12, 0.66); pv.userData.sgn = 1; g.add(pv);
    const L = i === 0 || i === 3 ? 1.05 : 1.3; cyl(0.17, 0.19, L, skin, 0, -L / 2, 0, pv, 10); sph(0.17, skin, 0, -L, 0, pv); fingers.push(pv);
  });
  const th = new THREE.Group(); th.position.set(0.2, -0.12, -0.66); th.userData.sgn = -1; g.add(th);
  cyl(0.2, 0.22, 1.0, skin, 0, -0.5, 0, th, 10); sph(0.2, skin, 0, -1.0, 0, th); fingers.push(th);
  g.userData.fingers = fingers; g.userData.curl = 0;
  return g;
}
function mkTornado() {
  const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(T.dust || 0xe8d6b0).lerp(new THREE.Color(0xffffff), 0.25), transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
  const rings = [];
  for (let i = 0; i < 10; i++) { const r = 0.3 + i * 0.24; const m = new THREE.Mesh(geo('tor' + i, () => new THREE.CylinderGeometry(r + 0.24, r, 0.78, 20, 1, true)), mat); m.position.y = 0.4 + i * 0.72; g.add(m); rings.push(m); }
  g.userData.rings = rings; return g;
}
// ----- bẫy đặc sản của map (đặt sẵn lúc đầu ván) -----
function mkLeafpile() {
  const g = new THREE.Group(), cols = [0xe07a2a, 0xd4a020, 0xc0502a, 0xb83a1e, 0x9a6a20];
  for (let i = 0; i < 40; i++) {
    const a = rand(0, 6.28), r = Math.sqrt(Math.random()) * 0.95;
    const l = sph(1, MS(pick(cols), 0.9), Math.cos(a) * r, 0.04 + (0.95 - r) * 0.4 * Math.random(), Math.sin(a) * r, g);
    l.scale.set(0.2, 0.05, 0.13); l.rotation.set(rand(-0.5, 0.5), rand(0, 6), rand(-0.5, 0.5));
  }
  return g;
}
function mkIce() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo('icedisc', () => new THREE.CircleGeometry(1, 30)), new THREE.MeshStandardMaterial({ color: 0xc4ecff, roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.88, envMapIntensity: 1.4 }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.025; m.scale.set(1.8, 1.25, 1); g.add(m);
  const cm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 });
  for (let i = 0; i < 6; i++) { const c = box(rand(0.4, 1.2), 0.004, 0.025, cm, rand(-0.8, 0.8), 0.032, rand(-0.6, 0.6), g); c.rotation.y = rand(0, 3); }
  return g;
}
function mkGhostHand() {
  const g = new THREE.Group();
  sph(1, MS(0x2e261e, 1), 0, 0, 0, g).scale.set(0.75, 0.13, 0.75);
  const ring = new THREE.Mesh(geo('ghring', () => new THREE.RingGeometry(0.55, 0.8, 28)), new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.35, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
  const hand = new THREE.Group(); hand.position.y = -1.9; g.add(hand);
  const sk = MS(0x8fae8a, 0.8, 0, { emissive: 0x0a2a14 });
  cyl(0.22, 0.24, 0.45, MS(0x3a3448, 0.9), 0, 0.22, 0, hand, 8);                 // tay áo rách
  cyl(0.13, 0.16, 1.1, sk, 0, 0.6, 0, hand, 8); box(0.44, 0.42, 0.15, sk, 0, 1.3, 0, hand);
  [-0.16, -0.055, 0.055, 0.16].forEach(x => { const f = cyl(0.035, 0.045, 0.45, sk, x, 1.7, 0.03, hand, 6); f.rotation.x = 0.3; });
  const th = cyl(0.04, 0.05, 0.3, sk, -0.26, 1.3, 0.04, hand, 6); th.rotation.z = 0.7;
  g.userData.hand = hand; g.userData.ring = ring; return g;
}
let sandTex = null;
function mkQuicksand() {
  if (!sandTex) sandTex = ctex(256, 256, (q, w, h) => {
    const gr = q.createRadialGradient(128, 128, 8, 128, 128, 128); gr.addColorStop(0, '#6a4a22'); gr.addColorStop(0.65, '#a5814c'); gr.addColorStop(1, 'rgba(205,170,115,0)');
    q.fillStyle = gr; q.fillRect(0, 0, w, h); q.strokeStyle = 'rgba(70,45,15,.5)'; q.lineWidth = 4;
    for (let k = 0; k < 3; k++) { q.beginPath(); for (let a = 0; a < 13; a += 0.1) { const r = a * 8.5; q.lineTo(128 + Math.cos(a + k * 2.1) * r, 128 + Math.sin(a + k * 2.1) * r); } q.stroke(); }
  });
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo('qsdisc', () => new THREE.CircleGeometry(1, 36)), new THREE.MeshStandardMaterial({ map: sandTex, transparent: true, roughness: 1, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.03; m.scale.setScalar(2.0); g.add(m); g.userData.disc = m; return g;
}
let lavaTex = null;
function mkLavacrack() {
  if (!lavaTex) lavaTex = ctex(256, 64, (q, w, h) => {
    q.fillStyle = '#140804'; q.fillRect(0, 0, w, h); q.strokeStyle = '#ffb040'; q.lineCap = 'round'; q.lineJoin = 'round';
    for (let k = 0; k < 3; k++) { q.lineWidth = rand(5, 11); q.beginPath(); let y = h / 2 + rand(-8, 8); q.moveTo(0, y); for (let x = 0; x <= w; x += 14) { y = clamp(y + rand(-10, 10), 10, h - 10); q.lineTo(x, y); } q.stroke(); }
  });
  const g = new THREE.Group(), w = rand(3.6, 5);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: lavaTex, emissive: 0xff5a10, emissiveMap: lavaTex, emissiveIntensity: 1, roughness: 1 });
  const m = new THREE.Mesh(geo('lavapl', () => new THREE.PlaneGeometry(1, 1)), mat); m.rotation.x = -Math.PI / 2; m.position.y = 0.03; m.scale.set(w, 0.9, 1); g.add(m);
  for (const sz of [-1, 1]) for (let x = -w / 2; x < w / 2; x += 0.5) { const r = sph(1, MS(0x2a1e1a, 1), x + rand(-0.1, 0.1), 0.02, sz * 0.5, g); r.scale.set(rand(0.18, 0.3), rand(0.06, 0.12), rand(0.12, 0.2)); }
  g.userData.mat = mat; g.userData.w = w; return g;
}
const HAZ_MK = { leafpile: mkLeafpile, ice: mkIce, ghosthand: mkGhostHand, quicksand: mkQuicksand, lavacrack: mkLavacrack };
function placeHazard(kind) {
  const mk = HAZ_MK[kind]; if (!mk) return;
  for (let k = 0; k < 30; k++) {
    const x = kind === 'lavacrack' ? rand(-2.4, 2.4) : rand(-LANE + 1, LANE - 1), z = rand(HOUSE_FRONT + 7, START_Z - 10);
    if (Math.abs(z - cpZ) < 2.5) continue;
    if (items.some(i => !i.dead && i.state === 'set' && Math.hypot(i.g.position.x - x, i.g.position.z - z) < 3.6)) continue;
    const it = newItem(kind, MAP_OWNER, mk(), { noLabel: true, noRescale: true, fixed: true });
    it.g.position.set(x, 0, z); it.state = 'set'; return it;
  }
}
function placePropAhead(kind) {   // động đất: vật cản rơi từ trên xuống phía trước zombie
  const info = PROP_INFO[kind] || PROP_INFO.rock;
  for (let k = 0; k < 20; k++) {
    const x = rand(-LANE + 0.6, LANE - 0.6), z = mon.z - rand(4, 16);
    if (z < HOUSE_FRONT + 4) continue;
    if (items.some(i => !i.dead && i.blocker && Math.hypot(i.g.position.x - x, i.g.position.z - z) < 2.2)) continue;
    const it = newItem('prop', MAP_OWNER, mkProp(kind), { noLabel: true, blocker: true, hp: info.hp, maxHp: info.hp, halfW: 0.6, halfD: 0.55, debrisColor: info.color, spiky: !!info.spiky });
    launch(it, new V3(x, 9, z), new V3(x, 0, z), 0.5, 0); return it;
  }
}
// ----- địa hình: băng trơn / cát lún -----
function terrainAt(x, z) {
  for (const it of items) {
    if (it.dead || it.state !== 'set') continue;
    if (it.kind !== 'quicksand' && it.kind !== 'ice') continue;
    const dx = x - it.g.position.x, dz = z - it.g.position.z;
    if (it.kind === 'quicksand' ? dx * dx + dz * dz < 2.56 : (dx / 1.8) ** 2 + (dz / 1.25) ** 2 < 1) return it;
  }
  return null;
}
function sandAt(x, z) { const t = terrainAt(x, z); return !!t && t.kind === 'quicksand'; }
function terrainFactor() { const t = terrainAt(mon.x, mon.z); return !t ? 1 : t.kind === 'quicksand' ? 0.3 : 0.6; }
function terrainPush(dt) {
  if (mon.y > 0.05) return;
  const t = terrainAt(mon.x, mon.z); if (!t) { mon.inTer = null; return; }
  if (mon.inTer !== t) { mon.inTer = t; popText(new V3(mon.x, mon.y + 3.2, mon.z), t.kind === 'ice' ? '🧊 TRƠN QUÁ!' : '🏜️ CÁT LÚN!', 'info', 1); sfx(t.kind === 'ice' ? 'whoosh' : 'splat'); }
  if (t.kind === 'ice') { mon.z += 1.7 * dt; mon.x += Math.sin(time * 2.3 + t.g.position.z) * 1.6 * dt; }   // trượt lùi + lạng lách
  else {                                                                                                  // cát lún hút vào giữa
    mon.x += (t.g.position.x - mon.x) * 0.9 * dt; mon.z += (t.g.position.z - mon.z) * 0.9 * dt;
    if (Math.random() < dt * 10) puff(new V3(mon.x, 0.1, mon.z), { color: 0xa88450, n: 1, size: 0.6, speed: 0.6, life: 0.6 });
  }
}
// ----- cập nhật bẫy mới mỗi khung hình (trả về true nếu đã xử lý) -----
function updateNewItem(it, p, dt) {
  const k = it.kind, live = state.phase === 'play' && !mon.lift && !mon.carry;
  if (it.state === 'rise') {                                         // trồi lên khỏi mặt đất
    const f = Math.min(1, it.t / 0.45), e = 1 - (1 - f) ** 3; p.y = -1.2 * (1 - e); it.g.scale.setScalar(0.4 + 0.6 * e);
    if (Math.random() < dt * 25) puff(new V3(p.x + rand(-0.4, 0.4), 0.1, p.z + rand(-0.4, 0.4)), { color: T.dust || 0x8a6a40, n: 1, size: 0.5, speed: 1, life: 0.5 });
    if (f >= 1) { p.y = 0; it.g.scale.setScalar(1); it.noRescale = it.noRescale0; onLand(it); }
    return true;
  }
  if (k === 'netwrap') {
    it.life -= dt; p.set(mon.x, mon.y + mon.gy + MON_H * 0.5, mon.z);
    const s = Math.min(1, it.t * 5); it.g.scale.set(0.62 * s, 1.05 * s, 0.62 * s); it.g.rotation.y += dt * 0.6;
    if (it.life <= 0 || !live) { puff(p.clone(), { color: 0xf0e6c0, n: 6, size: 0.5, speed: 3, life: 0.5 }); removeItem(it); }
    return true;
  }
  if (k === 'bees') {
    const ud = it.g.userData;
    ud.bees.forEach(b => { b.b.position.set(Math.cos(it.t * 9 + b.ph) * b.r, Math.sin(it.t * 13 + b.ph) * 0.25 + b.h, Math.sin(it.t * 8 + b.ph * 1.3) * b.r); b.w.forEach(w => { w.scale.y = 0.25 + 0.75 * Math.abs(Math.sin(it.t * 60 + b.ph)); }); });
    if (it.state === 'chase') {
      const d = new V3(mon.x, mon.y + mon.gy + MON_H * 0.85, mon.z).sub(p), dist = d.length();
      p.addScaledVector(d.normalize(), Math.min(dist, (dist > 1.2 ? 6.5 : 3) * dt));
      it.life -= dt;
      if (dist < 1.1) { it.cd -= dt; if (it.cd <= 0) { it.cd = 0.55; hitMonster(4, 0.3, it.owner, Math.random() < 0.35 ? { text: 'ÁI DA!', unblockable: true } : { unblockable: true }); sfx('bite'); } }
      if (it.life <= 0 || !live) it.state = 'leave';
    } else { p.y += 4 * dt; p.z -= 3 * dt; if (p.y > 9) removeItem(it); }
    return true;
  }
  if (k === 'crow') {
    const ud = it.g.userData; ud.wl.rotation.z = Math.sin(it.t * 22) * 0.7; ud.wr.rotation.z = -ud.wl.rotation.z;
    p.addScaledVector(it.vel, dt); it.g.lookAt(p.x + it.vel.x, p.y + it.vel.y, p.z + it.vel.z);
    if (it.state === 'dive') {
      if (!it.hit && live && Math.hypot(p.x - mon.x, p.z - mon.z) < 0.9 && Math.abs(p.y - (mon.y + mon.gy + 1.4)) < 1.0) {
        it.hit = true; hitMonster(8, 1.3, it.owner, { text: 'CỐC!' }); sfx('bite'); puff(p.clone(), { color: 0x222222, n: 4, size: 0.3, speed: 3, life: 0.5 });
        it.state = 'away'; it.vel.set(rand(-3, 3), 7, 7);
      } else if (p.y < 0.4) { it.state = 'away'; it.vel.set(it.vel.x * 0.5, 6, Math.abs(it.vel.z) + 4); }
    } else if (p.y > 15) removeItem(it);
    return true;
  }
  if (k === 'meteor') {
    const ud = it.g.userData, f = clamp(it.t / it.fall, 0, 1);
    ud.ring.material.opacity = 0.3 + 0.5 * Math.abs(Math.sin(it.t * 12)) * f; ud.ring.scale.setScalar(1.6 - 0.6 * f);
    ud.rock.position.set(7 * (1 - f), 24 * (1 - f) + 0.4, -12 * (1 - f)); ud.rock.rotation.x += dt * 6;
    if (Math.random() < dt * 45) puff(ud.rock.getWorldPosition(new V3()), { color: pick([0xff7a20, 0xffc040, 0xff3a10]), n: 1, size: 1, speed: 0.5, life: 0.5, add: true });
    if (f >= 1) {
      explosion(p.clone(), 1.0);
      const d = Math.hypot(p.x - mon.x, p.z - mon.z);
      if (d < 2.4 && mon.y < 2.5 && live) { hitMonster(Math.round(90 * (1 - d / 3.2)), 6, it.owner, { text: 'THIÊN THẠCH!', unblockable: true }); mon.charT = 1.6; }
      for (const o of items) if (o !== it && !o.dead && o.state === 'set' && o.blocker && o.kind !== 'fence' && o.g.position.distanceTo(p) < 2.2) breakItem(o);
      removeItem(it);
    }
    return true;
  }
  if (k === 'hand') {
    const ud = it.g.userData;
    if (it.state === 'aim') {                       // bóng tay lớn dần trên đất 1.1 giây rồi đập xuống ĐÚNG chỗ đó → streamer né được
      it.shadow.material.opacity = Math.min(0.5, it.t * 0.45); it.shadow.scale.setScalar(0.6 + it.t * 0.4);
      p.set(it.spot.x, 26 - it.t * 6, it.spot.z);
      if (it.t > 1.1) { it.state = 'slam'; it.t = 0; }
    } else if (it.state === 'slam') {
      p.y = Math.max(2.5, p.y - 42 * dt);
      if (p.y <= 2.5) {
        it.shadow.visible = false; camShake = Math.max(camShake, 0.4); sfx('thud');
        puff(it.spot.clone().setY(0.2), { color: T.dust || 0xcdb98e, n: 12, size: 1.5, speed: 4, life: 0.9 });
        if (Math.hypot(mon.x - it.spot.x, mon.z - it.spot.z) < 1.5 && live && mon.y < 1.5) {
          it.state = 'carry'; it.t = 0; mon.carry = it; mon.kv = 0; mon.stun = 0; if (mon.shieldHp > 0) breakShield();
          hitMonster(100, 0, it.owner, { text: 'TÓM ĐƯỢC!', unblockable: true });
        } else { it.state = 'leave'; it.t = 0; popText(it.spot.clone().setY(3), 'HỤT RỒI!', 'info', 1); }
      }
    } else if (it.state === 'carry') {               // nhấc lên rồi ném về cột mốc / đầu đường
      ud.curl = Math.min(1, ud.curl + dt * 5);
      const tz = restZ();
      p.y += (6.5 - p.y) * Math.min(1, dt * 2); p.x += (0 - p.x) * Math.min(1, dt * 1.5);
      if (it.t > 0.6) p.z = Math.min(tz, p.z + 13 * dt);
      mon.x = p.x; mon.z = p.z; mon.y = Math.max(0, p.y - 2.5);
      if (state.phase !== 'play') { mon.carry = null; it.state = 'leave'; }
      else if (p.z >= tz - 0.05 && it.t > 0.8) {
        it.state = 'leave'; it.t = 0; mon.carry = null; mon.vy = 1; mon.flip = { t: 0, dur: 0.85 }; mon.cur = ''; sfx('whoosh');
        popText(new V3(mon.x, mon.y + 3, mon.z), 'VÈOOO!', 'big', 1);
      }
    } else { ud.curl = Math.max(0, ud.curl - dt * 3); p.y += 14 * dt; if (p.y > 32) removeItem(it); }
    ud.fingers.forEach(f => { f.rotation.x = f.userData.sgn * ud.curl * 0.9; });
    return true;
  }
  if (k === 'tornado') {
    it.g.userData.rings.forEach((r, i) => { r.rotation.y += dt * (9 - i * 0.5); r.position.x = Math.sin(it.t * 3 + i * 0.6) * 0.07 * i; });
    p.x += it.vx * dt; p.z += Math.sin(it.t * 1.3) * 0.8 * dt;
    if (Math.random() < dt * 25) puff(new V3(p.x + rand(-1, 1), 0.2, p.z + rand(-1, 1)), { color: T.dust || 0xd8c6a0, n: 1, size: 1.1, speed: 2, life: 0.7 });
    it.sfxT = (it.sfxT || 0) - dt; if (it.sfxT <= 0) { it.sfxT = 0.55; sfx('wind'); }
    if (!it.hit && live && Math.hypot(p.x - mon.x, p.z - mon.z) < 1.3 && mon.y < 1) {
      it.hit = true; mon.vy = 11; mon.kv = 16; mon.stun = 0; mon.flip = { t: 0, dur: 2 * 11 / 26 }; mon.cur = '';
      hitMonster(60, 0, it.owner, { text: 'LỐC XOÁY!', unblockable: true });
    }
    if (Math.abs(p.x) > LANE + 2.5 && it.t > 1) removeItem(it);
    return true;
  }
  if (it.state !== 'set') return false;
  const near = r => live && mon.y < 0.3 && Math.hypot(mon.x - p.x, mon.z - p.z) < r;
  if (k === 'banana') {
    if (near(0.65)) {
      mon.vy = 8; mon.kv = 9; mon.stun = 0; mon.flip = { t: 0, dur: 2 * 8 / 26 }; mon.cur = '';
      hitMonster(20, 0, it.owner, { text: 'TRƯỢT VỎ CHUỐI!', unblockable: true }); sfx('bonk'); removeItem(it);
    }
    return true;
  }
  if (k === 'leafpile') {
    if (near(0.95)) {
      for (let i = 0; i < 3; i++) puff(p.clone().setY(0.4), { color: pick([0xe07a2a, 0xd4a020, 0xc0502a]), n: 6, size: 0.35, speed: 4, up: 3, life: 1.2, grav: 3 });
      const r = Math.random();
      if (r < 0.45) { sfx('snap'); hitMonster(30, 0, MAP_OWNER, { stun: 1.8, text: 'BẪY KẸP!', unblockable: true }); }
      else if (r < 0.75) { explosion(p.clone(), 0.7); mon.vy = 9; mon.kv = 12; mon.stun = 0; mon.flip = { t: 0, dur: 2 * 9 / 26 }; mon.cur = ''; hitMonster(50, 0, MAP_OWNER, { text: 'BẪY LÁ!', unblockable: true }); }
      else popText(p.clone().setY(2.2), 'PHÙ… KHÔNG CÓ GÌ', 'info', 1);
      removeItem(it);
    }
    return true;
  }
  if (k === 'ghosthand') {
    const ud = it.g.userData, dx = mon.x - p.x;
    ud.ring.material.opacity = 0.22 + 0.18 * Math.sin(time * 3 + p.z);
    it.cd = Math.max(0, (it.cd || 0) - dt);
    if (it.grab > 0) {
      it.grab -= dt; ud.hand.position.y += (0 - ud.hand.position.y) * Math.min(1, dt * 14); ud.hand.rotation.z = Math.sin(time * 14) * 0.08;
      if (it.grab <= 0) it.cd = 5;
    } else ud.hand.position.y += (-1.9 - ud.hand.position.y) * Math.min(1, dt * 4);
    if (!(it.grab > 0) && it.cd <= 0 && near(1.05)) {
      it.grab = 2.2; sfx('snap'); sfx('groan');
      puff(p.clone().setY(0.3), { color: 0x3a2e22, n: 10, size: 0.8, speed: 3, life: 0.7 });
      mon.x = p.x + dx * 0.4; mon.z = p.z + 0.15;
      hitMonster(25, 0, MAP_OWNER, { stun: 2.0, text: 'TAY MA!', unblockable: true });
    }
    return true;
  }
  if (k === 'quicksand') { it.g.userData.disc.rotation.z += dt * 0.7; return true; }
  if (k === 'ice') return true;
  if (k === 'lavacrack') {
    const ud = it.g.userData; if (it.cyc == null) { it.cyc = rand(1, 3.5); it.ph = 'idle'; }
    it.cyc -= dt; const close = Math.abs(mon.z - p.z) < 30;
    if (it.ph === 'idle') { ud.mat.emissiveIntensity = 0.8 + 0.25 * Math.sin(time * 2 + p.z); if (it.cyc <= 0) { it.ph = 'warn'; it.cyc = 1.0; if (close) sfx('hiss'); } }
    else if (it.ph === 'warn') {
      ud.mat.emissiveIntensity = 1.5 + 1.5 * Math.abs(Math.sin(time * 16));
      if (Math.random() < dt * 20) puff(new V3(p.x + rand(-ud.w / 2, ud.w / 2), 0.2, p.z), { color: 0xff7a20, n: 1, size: 0.3, up: 2, speed: 1, life: 0.5, add: true });
      if (it.cyc <= 0) { it.ph = 'fire'; it.cyc = 0.9; it.hitDone = false; if (close) sfx('thud'); }
    } else {
      ud.mat.emissiveIntensity = 3.5;
      if (Math.random() < dt * 70) puff(new V3(p.x + rand(-ud.w / 2, ud.w / 2), rand(0.2, 1), p.z + rand(-0.3, 0.3)), { color: pick([0xff5a10, 0xffa030, 0xffe070]), n: 1, size: rand(0.7, 1.3), up: 6, speed: 1, life: 0.6, add: true, grow: 1.5 });
      if (!it.hitDone && state.phase === 'play' && !mon.carry && Math.abs(mon.z - p.z) < 0.7 && Math.abs(mon.x - p.x) < ud.w / 2 + 0.3 && mon.y < 1.6) {
        it.hitDone = true; mon.charT = 1.4; hitMonster(45, 5, MAP_OWNER, { text: 'NÓNG QUÁ!', unblockable: true });
      }
      if (it.cyc <= 0) { it.ph = 'idle'; it.cyc = rand(2.5, 4.5); }
    }
    return true;
  }
  return false;
}

function breakItem(it) {
  if (it.dead || it.fixed) return;   // bẫy đặc sản của map không bị phá
  const p = it.g.position.clone().setY(0.7);
  if (it.kind === 'barrel') { debris(p, 0x9a5f2c, 12, 0.2, 6); debris(p, 0x3a3a3a, 3, 0.12, 5); }
  else if (it.kind === 'fence') { for (let x = -5; x <= 5; x += 2.5) debris(new V3(x, 0.8, p.z), 0xf4efe4, 5, 0.2, 6); }
  else debris(p, it.debrisColor || 0x888888, 8, 0.15, 5);
  puff(p, { color: 0xd8c6a0, n: 6, size: 1.2, speed: 3, life: 0.8 });
  sfx('crack'); removeItem(it);
}
function removeItem(it) {
  if (it.dead) return; it.dead = true; scene.remove(it.g); it.label.remove();
  if (it.shadow) scene.remove(it.shadow);
  if (mon.carry === it) mon.carry = null;
  if (it.g.userData.line) scene.remove(it.g.userData.line);
}
function popBalloons(it) {
  if (!it || it.dead) return;
  it.g.children.forEach(c => { if (c.isMesh && c.geometry === GSPH) puff(c.getWorldPosition(new V3()), { color: c.material.color.getHex(), n: 5, size: 0.5, speed: 4, life: 0.4 }); });
  sfx('pop'); removeItem(it);
}
function foxPunched(f) {
  f.hits++; sfx('bite');
  popText(f.g.position.clone().setY(1.6), 'ÁI!', 'info', 0.6);
  if (f.hits >= 3) { f.state = 'flee'; f.vel.set(rand(-2, 2), 7, -6); }
}
function onLand(it) {
  const p = it.g.position;
  puff(p.clone().setY(0.2), { color: 0xd8c6a0, n: it.kind === 'fence' ? 12 : 5, size: 1, speed: 2.5, life: 0.7 });
  if (it.thrown) {
    if (Math.hypot(p.x - mon.x, p.z - mon.z) < 1.5 && Math.abs(p.y - (mon.y + mon.gy + 1.3)) < 1.8) {
      hitMonster(it.thrown.dmg, it.thrown.knock, it.owner, { text: it.thrown.text, stun: it.thrown.stun, unblockable: it.thrown.unblockable });
      if (it.kind === 'net') attachNet(it.owner, it.thrown.stun);
      sfx(it.kind === 'pebble' ? 'bonk' : 'hit');
      if (it.kind === 'pebble') debris(p, 0x8b8a86, 2, 0.08, 3);
    }
    removeItem(it); return;
  }
  sfx('thud');
  it.squash = 0.25;
  if (it.onMon && Math.hypot(p.x - mon.x, p.z - mon.z) < 1.6) hitMonster(25, 2.5, it.owner, { text: 'BỊCH!' });
  it.state = 'set'; it.t = 0;
  if (it.kind === 'slime') { const pd = mkPuddle(); pd.position.copy(p).setY(0); scene.remove(it.g); it.g = pd; scene.add(pd); it.life = 14; }
  if (it.kind === 'bomb') it.fuse = 6;
  if (it.kind === 'plant') { it.life = 18; it.cd = 0.8; }
  if (it.kind === 'mine') puff(p.clone().setY(0.2), { color: 0x7a5530, n: 8, size: 0.6, speed: 3, life: 0.7 });
  if (it.kind === 'flower') { it.blowT = CONFIG.windSeconds; sfx('power'); popText(p.clone().setY(3.4), '🌬️ GIÓ!', 'info', 1); }
}

function updateItems(dt) {
  const manual = true;   // không có AI tự né
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.dead) { items.splice(i, 1); continue; }
    it.t += dt;
    const p = it.g.position;
    if (it.mixer) it.mixer.update(dt);
    if (it.state === 'fly') {
      it.ft += dt; it.vel.y -= G * dt; p.addScaledVector(it.vel, dt);
      if (it.spin) { it.g.rotation.x += it.spin * dt; it.g.rotation.z += it.spin * 0.4 * dt; }
      if (it.kind === 'fence') it.g.scale.setScalar(Math.min(1, 0.15 + it.ft / it.T));
      if (it.ft >= it.T) { p.copy(it.to); it.g.rotation.set(0, it.kind === 'fence' ? 0 : rand(-0.3, 0.3), 0); it.g.scale.setScalar(1);
        if (it.kind === 'tire') { it.state = 'roll'; it.vz = 11; it.vx = 0; puff(p.clone().setY(0.2), { color: 0xd8c6a0, n: 4 }); sfx('thud'); }
        else if (it.kind === 'potato') { it.endZ = rand(-1.6, 0.6); it.state = 'roll'; it.head = rand(-0.35, 0.35); it.speed = rand(7.5, 9); it.bumpT = 0; it.curv = 0; it.hop = 0; it.g.rotation.set(0, 0, 0); puff(p.clone().setY(0.2), { color: 0xd8c6a0, n: 4 }); sfx('thud'); }
        else onLand(it);
      }
    }
    else if (it.kind === 'tire' && it.state === 'roll') {
      const dz = mon.z - p.z, tt = Math.max(0.2, dz / it.vz);
      if (dz > 1) it.vx = clamp((mon.x - p.x) / tt * 0.8, -6, 6);
      p.z += it.vz * dt; p.x = clamp(p.x + it.vx * dt, -LANE - 0.3, LANE + 0.3);
      p.y = 0.63 + Math.abs(Math.sin(it.t * 7)) * 0.4;
      it.g.userData.roll.rotation.x += it.vz * dt / 0.63;
      // né (AI)
      if (!it.aiSeen && dz < 7 && dz > 0) { it.aiSeen = true; if (!manual && autoDodge && Math.random() < 0.4) { if (Math.random() < 0.5) it.aiJump = true; else { mon.aiX = clamp(p.x + (mon.x < p.x ? -2.6 : 2.6), -LANE, LANE); mon.aiT = 2; } } }
      if (it.aiJump && dz < 2 && dz > 0) { it.aiJump = false; monJump(); }
      if (!it.hit && Math.abs(dz) < 0.9 && Math.abs(p.x - mon.x) < 1.1 && mon.y < 0.7 && !mon.lift) {
        it.hit = true; hitMonster(25, 4, it.owner, { text: 'TRÚNG!' }); sfx('hit'); it.vx = rand(-6, 6); it.vz = 8;
        puff(p.clone(), { color: 0xd8c6a0, n: 6, size: 1, speed: 3 });
      }
      for (const o of items) if (o !== it && !o.dead && o.blocker && o.state === 'set' && o.kind !== 'fence' && Math.abs(o.g.position.z - p.z) < 0.8 && Math.abs(o.g.position.x - p.x) < 1) { it.vx = -it.vx + rand(-2, 2); }
      if (p.z > START_Z + 10) removeItem(it);
    }
    else if (it.kind === 'potato' && it.state === 'roll') {
      // khoai tây một đầu nhọn: lăn cong theo vòng quanh đầu nhọn, đổi hướng lung tung, vẫn nhắm về phía quái
      const ud = it.g.userData;
      it.bumpT -= dt;
      if (it.bumpT <= 0) { it.bumpT = rand(0.25, 0.8); it.curv = rand(-0.6, 0.6); it.hop = Math.random() < 0.35 ? rand(0.15, 0.4) : 0; }
      it.head += it.curv * it.speed * 0.35 * dt;                                       // không đuổi người: chỉ cong lung tung do đầu nhọn
      it.head = clamp(Math.atan2(Math.sin(it.head), Math.cos(it.head)), -1.1, 1.1);   // luôn hướng về đầu đường (+z)
      p.x += Math.sin(it.head) * it.speed * dt; p.z += Math.cos(it.head) * it.speed * dt;
      if (Math.abs(p.x) > LANE + 0.4) { p.x = Math.sign(p.x) * (LANE + 0.4); it.head = -it.head; sfx('bonk'); }
      p.y = (it.R || 0.58) + Math.abs(Math.sin(it.t * 9)) * it.hop * Math.min(1, it.speed / 6);
      ud.yaw.rotation.y = it.head;
      ud.yaw.rotation.z = Math.sin(it.t * 11) * 0.28;
      ud.roll.rotation.x += it.speed * dt / (it.R || 0.58);
      it.speed = Math.max(3.2, it.speed - dt * (it.hit ? 1.2 : 0.3));
      if (Math.random() < dt * 8) puff(new V3(p.x, 0.1, p.z), { color: 0xd8c6a0, n: 1, size: 0.45, speed: 0.6, life: 0.5 });
      const dz = mon.z - p.z;
      if (!it.aiSeen && dz < 6 && dz > 0) { it.aiSeen = true; if (!manual && autoDodge && Math.random() < 0.3) it.aiJump = true; }
      if (it.aiJump && dz < 1.6 && dz > 0) { it.aiJump = false; monJump(); }
      if (!it.hit && Math.hypot(p.x - mon.x, p.z - mon.z) < (it.mega ? 2.3 : 1.2) && mon.y < (it.mega ? 1.8 : 0.85) && !mon.lift && !mon.carry) {
        it.hit = true; if (it.mega) { hitMonster(80, 7, it.owner, { text: 'KHOAI KHỔNG LỒ!', unblockable: true, stun: 0.8 }); camShake = 0.5; } else hitMonster(18, 2.5, it.owner, { text: 'BỐP!' }); sfx('bonk');
        it.head = (Math.random() < 0.5 ? -1 : 1) * rand(0.5, 1.0); it.speed *= 0.6;   // bật lệch sang bên, vẫn lăn tiếp về đầu đường
        puff(p.clone(), { color: 0xd8c6a0, n: 5, size: 0.8, speed: 3 });
      }
      for (const o of items) if (o !== it && !o.dead && o.blocker && o.state === 'set' && Math.abs(o.g.position.z - p.z) < o.halfD + 0.4 && Math.abs(o.g.position.x - p.x) < o.halfW + 0.4) { if (it.mega) { breakItem(o); continue; } it.head += rand(1.6, 2.6) * (Math.random() < 0.5 ? -1 : 1); p.x += Math.sin(it.head) * 0.5; p.z += Math.cos(it.head) * 0.5; sfx('bonk'); break; }
      if (p.z >= it.endZ) { puff(p.clone().setY(0.4), { color: 0xd8c6a0, n: 6, size: 0.9, speed: 2.5, life: 0.6 }); sfx('pop'); removeItem(it); }   // lăn tới cuối map thì biến mất
    }
    else if (it.kind === 'boulder') {
      if (it.state === 'grow') { const s = Math.min(1, it.g.scale.x + dt * 2.5); it.g.scale.setScalar(s); p.z = HOUSE_FRONT + 0.5 + s * 2; if (s >= 1) { it.state = 'roll'; it.vz = 13; sfx('thud'); camShake = 0.5; } }
      else {
        p.z += it.vz * dt; p.x += clamp(mon.x - p.x, -2 * dt, 2 * dt); p.y = 2.2;
        it.g.userData.roll.rotation.x += it.vz * dt / 2.2;
        if (Math.random() < dt * 25) puff(new V3(p.x + rand(-1.5, 1.5), 0.3, p.z - 1.5), { color: 0xc9b48a, n: 1, size: 1.4, life: 0.8 });
        camShake = Math.max(camShake, 0.15);
        for (const o of items) if (o !== it && !o.dead && o.state === 'set' && Math.abs(o.g.position.z - p.z) < 2.4 && (o.kind === 'fence' || Math.abs(o.g.position.x - p.x) < 2.6)) breakItem(o);
        if (!it.hit && !mon.lift && mon.z - p.z < 2.8 && mon.z - p.z > -1) { it.hit = true; hitMonster(300, 0, it.owner, { text: 'BẸP DÍ!', unblockable: true }); if (mon.shieldHp > 0) breakShield(); mon.carry = it; mon.kv = 0; }
        if (mon.carry === it) { mon.z = p.z + 2.9; mon.y = 0.4; if (mon.z >= restZ() - 0.05) { mon.carry = null; mon.y = 0; mon.kv = 4; mon.stun = 1.2; } }
        if (p.z > START_Z + 18) { if (mon.carry === it) mon.carry = null; removeItem(it); }
      }
    }
    else if (it.kind === 'balloon') {
      const L = it.g.userData.line, lp = L.geometry.attributes.position;
      if (it.state === 'seek') {
        const tgt = new V3(mon.x, mon.y + mon.gy + MON_H + 1.2, mon.z);
        const d = tgt.clone().sub(p), dist = d.length();
        p.addScaledVector(d.normalize(), Math.min(dist, 22 * dt));
        if (dist < 0.4) { it.state = 'lift'; mon.lift = { item: it, t: 0, phase: 'rise', toZ: 0 }; mon.kv = 0; mon.stun = 0; sfx('power'); popText(new V3(mon.x, mon.y + 3.5, mon.z), 'BAY LÊN!', 'big', 1.2); }
      } else if (it.state === 'lift') {
        p.set(mon.x, mon.y + mon.gy + MON_H + 1.2 + Math.sin(time * 3) * 0.1, mon.z);
        if (!mon.lift || mon.lift.item !== it) removeItem(it);
      }
      it.g.rotation.z = Math.sin(time * 2) * 0.08;
      const hand = it.state === 'lift' ? new V3(mon.x, mon.y + mon.gy + 1.9, mon.z) : p.clone().setY(p.y - 1.6);
      [[0, 0], [-0.75, -0.3], [0.75, -0.25]].forEach(([x, y], k) => { lp.setXYZ(k * 2, p.x + x, p.y + y - 0.7, p.z); lp.setXYZ(k * 2 + 1, hand.x, hand.y, hand.z); });
      lp.needsUpdate = true;
    }
    else if (it.kind === 'fox') {
      const tx = mon.x, tz = mon.z - 1.0;
      if (it.state === 'run') {
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
        p.x += dx / d * Math.min(d, 9 * dt); p.z += dz / d * Math.min(d, 9 * dt);
        it.g.rotation.y = Math.atan2(dx, dz);
        if (d < 0.5) { it.state = 'bite'; it.cd = 0.3; it.t = 0; }
      } else if (it.state === 'bite') {
        p.x += (tx - p.x) * Math.min(1, dt * 6); p.z += (tz - p.z) * Math.min(1, dt * 6);
        it.g.rotation.y = Math.atan2(mon.x - p.x, mon.z - p.z);
        it.cd -= dt; p.y = Math.max(0, Math.sin(it.t * 10)) * 0.35;
        if (it.cd <= 0) { it.cd = 0.6; hitMonster(9, 0.1, it.owner, Math.random() < 0.3 ? { text: 'NGOẠM!' } : {}); sfx('bite'); }
        if (it.t > it.life || mon.lift || mon.carry) { it.state = 'flee'; it.vel.set(rand(-2, 2), 6, -6); }
      } else if (it.state === 'flee') {
        it.vel.y -= G * dt; p.addScaledVector(it.vel, dt); if (p.y < 0) { p.y = 0; it.vel.y = 0; it.vel.x *= 0.9; }
        it.g.rotation.y = Math.atan2(it.vel.x, it.vel.z);
        it.fade = (it.fade || 0) + dt; if (it.fade > 1.6) { puff(p.clone().setY(0.5), { n: 6, size: 1 }); removeItem(it); }
      }
    }
    else if (updateNewItem(it, p, dt)) { /* bẫy mới + bẫy đặc sản map */ }
    else if (it.state === 'set') {
      if (it.squash > 0) { it.squash -= dt; const k = it.squash / 0.25; it.g.scale.set(1 + 0.25 * k, 1 - 0.3 * k, 1 + 0.25 * k); } else if (it.kind !== 'slime' && it.kind !== 'xbarrel' && !it.wilt && !it.mega && !it.noRescale) it.g.scale.setScalar(1);
      const dx = Math.abs(p.x - mon.x), dz = mon.z - p.z;
      if (it.kind === 'trap') {
        if (!it.aiSeen && dz > 0 && dz < 6 && dx < 1.2) { it.aiSeen = true; if (!manual && autoDodge && Math.random() < 0.35) { mon.aiX = clamp(p.x + (mon.x < p.x ? -1.8 : 1.8), -LANE, LANE); mon.aiT = 2; } }
        if (!it.snapped && dx < 0.75 && Math.abs(dz) < 0.75 && mon.y < 0.3 && !mon.lift) {
          it.snapped = true; it.t = 0; sfx('snap'); hitMonster(30, 0, it.owner, { stun: 1.8, text: 'KẸP!', unblockable: true });
        }
        if (it.snapped) { const k = Math.min(1, it.t * 12); it.g.userData.jaws.forEach(j => j.rotation.x = k * Math.PI / 2 * 0.95); if (it.t > 2) { debris(p.clone().setY(0.3), 0x8a9097, 4, 0.1, 3); removeItem(it); } }
      } else if (it.kind === 'slime') {
        it.life -= dt; const s = it.life < 1 ? Math.max(0.01, it.life) : 1; it.g.scale.set(s, 1, s);
        it.g.children.forEach((c, k) => { if (k > 0) c.position.y = 0.1 + Math.abs(Math.sin(time * 2 + k)) * 0.08; });
        if (it.life <= 0) removeItem(it);
      } else if (it.kind === 'potato') {
        const ud = it.g.userData; it.restT += dt;
        const tgt = Math.round(ud.roll.rotation.x / (Math.PI * 2)) * Math.PI * 2;
        ud.roll.rotation.x += (tgt - ud.roll.rotation.x) * Math.min(1, dt * 4);
        const a = Math.atan2(Math.sin(ud.yaw.rotation.y), Math.cos(ud.yaw.rotation.y));
        ud.yaw.rotation.y = a - a * Math.min(1, dt * 3); ud.yaw.rotation.z *= 0.9;
        p.y = it.restT > 25 ? p.y - dt * 0.5 : (it.R || 0.58);
        if (p.y < -0.5) removeItem(it);
      } else if (it.kind === 'plant') {
        const ud = it.g.userData, dzm = mon.z - p.z; it.life -= dt;
        it.recoil = Math.max(0, (it.recoil || 0) - dt * 5); ud.head.scale.set(1 + it.recoil * 0.2, 1 - it.recoil * 0.12, 1 + it.recoil * 0.2);
        if (dzm > 0.6 && dzm < 26 && !mon.lift && !mon.carry) {                // chỉ bắn khi zombie ở phía trước (giữa cây và đầu đường)
          ud.head.rotation.y = Math.atan2(mon.x - p.x, dzm);
          it.cd -= dt; if (it.cd <= 0) { it.cd = 1.15; firePea(it); }
        }
        if (it.life <= 0) breakItem(it);
      } else if (it.kind === 'xbarrel') {
        // sau 1 giây: phình to + đỏ dần rồi nổ
        const k = clamp((it.t - 1) / 1.4, 0, 1), b = it.g.userData.body;
        b.color.setRGB(1, 1 - 0.78 * k, 1 - 0.82 * k);
        b.emissive.setRGB(k * (0.55 + 0.45 * Math.sin(time * (10 + 30 * k))), 0.04 * k, 0);
        const sc = 1 + 0.6 * k * k + Math.sin(time * 34) * 0.05 * k;
        it.g.scale.set(sc, sc * (1 + 0.08 * k), sc);
        if (k > 0 && !it.hiss) { it.hiss = true; sfx('hiss'); }
        if (k > 0 && Math.random() < dt * 20) puff(p.clone().setY(1.4 * sc), { color: 0xeeeeee, n: 1, size: 0.3, up: 2, speed: 1.5, life: 0.5, opacity: 0.6 });
        if (k >= 1) barrelBoom(it);
      } else if (it.kind === 'mine') {
        it.g.userData.led.material.emissiveIntensity = Math.sin(time * 7 + p.x * 3) > 0.3 ? 3 : 0.15;
        if (dx < 0.85 && Math.abs(dz) < 0.85 && mon.y < 0.3 && !mon.lift && !mon.carry) {
          explosion(p.clone(), 1.1);
          mon.vy = 14; mon.kv = 22; mon.stun = 0; mon.flip = { t: 0, dur: 2 * 14 / 26 }; mon.cur = '';
          hitMonster(70, 0, it.owner, { text: 'BÙMMM!', unblockable: true });
          removeItem(it);
        }
      } else if (it.kind === 'flower') {
        const ud = it.g.userData;
        if (it.blowT > 0) {
          it.blowT -= dt; ud.petals.rotation.z += dt * 16;
          ud.head.scale.setScalar(1 + Math.sin(time * 22) * 0.04);
          const hp = p.clone().setY(2.1);
          if (Math.random() < dt * 40) puff(new V3(p.x + rand(-1.6, 1.6), rand(0.3, 2.8), p.z + 0.8), { color: 0xffffff, n: 1, size: 0.3, speed: 0.6, up: 0.2, life: 0.9, opacity: 0.75, grow: 1.3, vel: new V3(rand(-1, 1), 0, 15) });
          if (Math.random() < dt * 6) puff(hp, { color: pick([0xff5fa8, 0xc86bff]), n: 1, size: 0.22, speed: 1, life: 1.2, vel: new V3(0, 0.5, 9), tex: starTex });
          it.windSfx = (it.windSfx || 0) - dt; if (it.windSfx <= 0) { it.windSfx = 0.5; sfx('wind'); }
        } else {
          it.wilt = (it.wilt || 0) + dt * 0.8; it.g.scale.setScalar(Math.max(0.01, 1 - it.wilt)); ud.head.rotation.x = it.wilt;
          if (it.wilt >= 1) removeItem(it);
        }
      } else if (it.kind === 'bomb') {
        it.fuse -= dt; const sp = it.g.userData.spark; sp.scale.setScalar(0.4 + Math.random() * 0.4);
        it.g.scale.setScalar(1 + (it.fuse < 1.5 ? Math.abs(Math.sin(it.t * 18)) * 0.12 : 0));
        if (!it.aiSeen && dz > 0 && dz < 6 && dx < 1.5) { it.aiSeen = true; if (!manual && autoDodge && Math.random() < 0.3) { mon.aiX = clamp(p.x + (mon.x < p.x ? -2.6 : 2.6), -LANE, LANE); mon.aiT = 2; } }
        if (Math.hypot(p.x - mon.x, p.z - mon.z) < 1.6 || it.fuse <= 0) {
          explosion(p.clone()); const d = Math.hypot(p.x - mon.x, p.z - mon.z);
          if (d < 3.6 && mon.y < 2) hitMonster(Math.round(130 * (1 - d / 6)), 7, it.owner, { stun: 0.6, text: 'BÙM!', unblockable: true });
          for (const o of items) if (o !== it && !o.dead && o.state === 'set' && o.kind !== 'fence' && o.g.position.distanceTo(p) < 3) breakItem(o);
          removeItem(it);
        }
      }
    }
    if (!it.dead) placeEl(it.label, p.x, p.y + it.labelY, p.z, 8, 0.28, 0.85);
  }
}

// =====================================================================
// Hàng đợi hành động từ quà
// =====================================================================
const actionQueue = []; let actionT = 0;
function queueAction(a, user) { if (actionQueue.length < 400) actionQueue.push([a, user]); }
function runAction(a, u) {
  if (!mon.ready) return;
  if (a === 'repair') {
    if (door.hp >= door.maxHp - 1 && door.tier < 2 && !door.broken) { door.over += 150; if (door.over >= 600) { door.over = 0; return upgradeDoor(u); } }
    door.hp = Math.min(door.maxHp, door.hp + 150); openDoor(0.4); sfx('heal'); addPoints(u, 30);
    const dp = new V3(0, 1.8, HOUSE_FRONT + 0.45);
    puff(dp, { color: 0x7dff6a, n: 10, size: 0.7, speed: 3, add: true, life: 0.8, tex: starTex }); popText(dp.clone().setY(4.4), '+150 🔧', 'heal');
    return;
  }
  if (a === 'shoes') { mon.speedUntil = time + 5; sfx('power'); popText(new V3(mon.x, mon.y + 3.6, mon.z), '👟 TĂNG TỐC!', 'info', 1.2); return; }
  if (a === 'shield') {                                                        // khiên cộng dồn: đang có khiên thì cất vào kho, vỡ cái này dùng cái kia
    if (mon.shieldHp > 0) { mon.shieldStock = (mon.shieldStock || 0) + 1; popText(new V3(mon.x, mon.y + 2.6, mon.z), `🚪 +1 khiên (kho ${mon.shieldStock})`, 'info', 1.1); sfx('heal'); }
    else { equipShield(); popText(new V3(mon.x, mon.y + 2.6, mon.z), '🚪 KHIÊN!', 'info', 1.2); }
    return;
  }
  if (a === 'time' && !CONFIG.timerOn) return runAction('shoes', u);
  if (a === 'time') { state.roundT += 20; sfx('heal'); popText(new V3(mon.x, mon.y + 3.6, mon.z), '⏳ +20 giây', 'heal'); puff(new V3(mon.x, mon.y + 1.6, mon.z), { color: 0x7dff6a, n: 8, tex: starTex, add: true, size: 0.5, speed: 3 }); return; }
  if (state.phase !== 'play') return;
  if (a === 'win') { door.hp = 0; return endRound('monster', u); }    // quà WIN ngay: phá cửa, vào nhà ăn não
  if (a === 'lose') return endRound('viewers', u);                     // quà THUA ngay: chết tại chỗ, về xuất phát
  (SPAWN[a] || (() => {}))(u);
}
function updateQueue(dt) {
  actionT -= dt;
  while (actionT <= 0 && actionQueue.length) {
    const [a, u] = actionQueue.shift(); runAction(a, u);
    actionT += a === 'pebble' ? 0.06 : a === 'slipper' ? 0.12 : 0.28;
  }
  if (!actionQueue.length) actionT = Math.max(actionT, 0);
}
const ALL_GIFTS = [...VILLAINS, ...HEROES];
function actionForGiftId(id) {
  const m = CONFIG.giftMap || {};
  for (const a of Object.keys(m)) if ((m[a] || []).some(x => String(x && x.giftId != null ? x.giftId : x) === String(id))) return a;
  return null;
}
function findGift(name) { const n = String(name || '').toLowerCase().trim(); return ALL_GIFTS.find(g => g.names.includes(n)); }
const LIMIT = { shield: 60, win: 1, lose: 1, banana: 20, net: 5, bees: 4, crows: 4, meteor: 2, hand: 1, quake: 1, mine: 5, xbarrel: 20, flower: 4, lightning: 3, boulder: 2, balloon: 2, fox: 5, bomb: 8, repair: 20, shoes: 1, shield: 1, time: 5, plant: 6 };
function onGift(user, giftName, count, coins, forced) {
  const g = forced ? ALL_GIFTS.find(a => a.action === forced) : findGift(giftName);
  const action = forced || (g ? g.action : actionByCoins(coins || 1));
  const total = (coins || g?.coins || 1) * count;
  addPoints(user, total * 10);
  showFeed(user, `đã gửi ${giftName || g?.gift || 'quà'}`, count, g ? g.emoji : '🎁');
  if (total >= 99) gBanner(user, giftName || g?.gift || 'quà', g ? g.label : '');
  const n = Math.min(count, LIMIT[action] || 40);
  for (let i = 0; i < n; i++) queueAction(action, user);
  trackCombo(action, user, count);
}
// COMBO: cùng 1 loại bẫy được tặng ≥5 lần trong 10 giây → bản SIÊU (khoai khổng lồ / thêm 3 cái)
const comboLog = new Map(), comboCd = new Map();
const NO_COMBO = new Set(['win', 'lose', 'boulder', 'balloon', 'lightning', 'meteor', 'hand', 'quake', 'repair', 'shoes', 'shield', 'time']);
function trackCombo(action, user, n) {
  if (NO_COMBO.has(action) || state.phase !== 'play') return;
  const L = (comboLog.get(action) || []).filter(e => time - e.t < 10); L.push({ t: time, n }); comboLog.set(action, L);
  const sum = L.reduce((a, e) => a + e.n, 0);
  if (sum < 5 || time < (comboCd.get(action) || 0)) return;
  comboCd.set(action, time + 12); comboLog.set(action, []);
  const g = ALL_GIFTS.find(x => x.action === action);
  banner(`🔥 COMBO x${sum}!`, `${g ? g.emoji + ' SIÊU ' + g.label.toUpperCase() : 'SIÊU BẪY'} — cảm ơn ${esc(user.name)}`); sfx('power');
  later(0.7, () => { if (state.phase !== 'play') return; if (action === 'rose') SPAWN.potato(user, true); else for (let i = 0; i < 3; i++) queueAction(action, user); });
}
let likeAcc = 0;
function onLike(user, count) {   // tim cộng dồn cả phòng: đủ CONFIG.likePer tim → 1 cục đá (người thả tim chạm mốc được tính)
  addPoints(user, count);
  likeAcc += count;
  let n = 0;
  while (likeAcc >= CONFIG.likePer && n < 5) { likeAcc -= CONFIG.likePer; n++; queueAction('pebble', user); }
  if (likeAcc >= CONFIG.likePer) likeAcc = likeAcc % CONFIG.likePer;
  if (n) showFeed(user, `đủ ${CONFIG.likePer} tim → ném đá`, n, '❤️');
}
function onComment(user, text) {
  const key = String(CONFIG.commentKey || '').trim().toLowerCase();
  if (key && !String(text || '').toLowerCase().includes(key)) return;   // chỉ bình luận có từ khóa mới ném dép
  addPoints(user, 3); queueAction('slipper', user);
}
function onFollow(user) { addPoints(user, 30); showFeed(user, 'đã follow → hàng rào', 1, '➕'); queueAction('fence', user); }
function onShare(user) { addPoints(user, 30); showFeed(user, 'đã chia sẻ → pháo hẹn giờ', 1, '↗️'); queueAction('bomb', user); }

// =====================================================================
// Ván chơi
// =====================================================================
function setPhase(p, t) { state.phase = p; state.t = t; }
function mapDoorHp() { return Math.round(CONFIG.doorHp * (1 + 0.15 * (state.map || 0)) * (T.doorMul || 1) / 10) * 10; }   // mỗi map cửa trâu hơn 15%
function mapRoundT() { return CONFIG.roundSeconds + 20 * (state.map || 0); }                               // ...và thêm 20 giây
function startIntro() {
  setPhase('intro', 3.6); state.count = 4;
  door.tier = 0; door.over = 0; door.maxHp = door.hp = mapDoorHp(); state.roundT = mapRoundT();
  doorLabel.querySelector('.dt').textContent = T.house === 'castle' ? '🏰 CỔNG LÂU ĐÀI' : DOOR_NAME[0];
  state.cp = false; drawCp(false); state.dynT = T.dynEvery || 0; state.quakeT = 0;
  for (let i = 0; i < (T.props || 0); i++) placeProp(T.prop);
  for (let i = 0; i < (T.hazN || 0); i++) placeHazard(Array.isArray(T.haz) ? pick(T.haz) : T.haz);
  mon.cur = ''; playAnim('Idle');
}
function endRound(who, by) {
  if (state.phase !== 'play') return;
  setPhase('end', 7);
  const mvp = [...roundPts.entries()].sort((a, b) => b[1] - a[1])[0];
  const mvpName = mvp ? players.get(mvp[0])?.name : '';
  if (who === 'monster') {
    door.broken = true; door.pivot.visible = false;
    for (let i = 0; i < 4; i++) debris(new V3(rand(-0.8, 0.8), rand(0.8, 3), HOUSE_FRONT + 0.5), 0x7a4423, 6, 0.25, 8);
    puff(new V3(0, 2, HOUSE_FRONT + 0.6), { color: 0xd8c6a0, n: 14, size: 2, speed: 5, life: 1.2 });
    explosion(new V3(0, 0, HOUSE_FRONT + 0.8), 0.6);
    state.nextMap = (state.map + 1) % MAPS.length;
    if (by) banner('🏆 WIN NGAY!', `${esc(by.name)} tặng quà WIN NGAY`); else banner('💥 PHÁ ĐƯỢC CỬA RỒI!', 'Zombie vào nhà ăn não...');
    setPhase('end', 999); startWinCut();
  } else {
    state.win--;
    if (by) { banner('😵 ZOMBIE THUA!', `${esc(by.name)} tặng quà THUA NGAY`); explosion(new V3(mon.x, 0, mon.z), 0.5); }
    else banner('⏰ HẾT GIỜ! KHÁN GIẢ BẢO VỆ THÀNH CÔNG!', mvpName ? `MVP: ${esc(mvpName)}` : 'Ngôi nhà an toàn!');
    mon.cur = ''; playAnim('Death', 0.15); sfx('win');
    for (let i = 0; i < 10; i++) later(i * 0.2, () => puff(new V3(mon.x + rand(-4, 4), rand(3, 7), mon.z - rand(2, 8)), { color: pick([0xffd84a, 0xff5a7a, 0x7dff6a, 0x7fc8ff]), n: 8, size: 0.4, speed: 5, add: true, tex: starTex, grav: 4 }));
  }
  mon.lift = null; mon.carry = null;
}
function resetRound() {
  state.round = (state.round || 1) + 1;
  if (state.nextMap != null && state.nextMap !== state.map) buildMap(state.nextMap);
  state.nextMap = null;
  for (const it of items) removeItem(it); items.length = 0; comboLog.clear();
  Object.assign(mon, { charT: 0, flip: null, windLean: 0, x: 0, y: 0, gy: 0, z: START_Z, vy: 0, kv: 0, stun: 0, lift: null, carry: null, avoid: null, speedUntil: 0, armorUntil: 0, stamina: 1, yaw: 0, yawT: 0, jerk: 0, shieldHp: 0 });
  if (mon.shieldMesh) mon.shieldMesh.visible = false; mon.shieldStock = 0;
  door.broken = false; door.pivot.visible = true;
  roundPts.clear(); actionQueue.length = 0;
  for (const L of bolts) { scene.remove(L.cloud); if (L.bolt) scene.remove(L.bolt); } bolts.length = 0;
  camPos.set(0, 5, START_Z + 10); camLook.set(0, 2, START_Z - 12);
  startIntro();
}
let smokeT = 0;
function updatePhase(dt) {
  smokeT -= dt;
  if (smokeT <= 0 && state.phase !== 'loading' && T.house !== 'castle' && T.style !== 'adobe') {                               // khói ống khói
    smokeT = 0.35;
    puff(new V3(4.5 * HS, 11.4 * HS, HOUSE_FRONT - 5 * HS - 1.8 * HS), { color: T.style === 'volcano' ? 0x3a302c : 0xe6e6e6, n: 1, size: 0.9, speed: 0.25, up: 1.5, grav: -0.5, life: 3.2, grow: 3, opacity: T.style === 'volcano' ? 0.55 : 0.32 });
  }
  for (let i = timers.length - 1; i >= 0; i--) if (time >= timers[i].t) { const f = timers[i].fn; timers.splice(i, 1); f(); }
  if (state.phase === 'intro') {
    state.t -= dt;
    const c = Math.ceil(state.t - 0.6);
    if (c !== state.count) { state.count = c; if (c > 0) { banner(String(c), `Ván ${state.round || 1} • 🗺️ Map ${state.map + 1}: ${T.name} • ${T.length}m`); sfx('beep'); } else { banner('PHÁ NHÀ!', T.warn || ''); sfx('go'); } }
    if (state.t <= 0) setPhase('play', 0);
  } else if (state.phase === 'play') {
    if (CONFIG.timerOn) { state.roundT -= dt; if (state.roundT <= 0) { state.roundT = 0; endRound('viewers'); } }
    if (T.dyn) { state.dynT -= dt; if (state.dynT <= 0) { state.dynT = T.dynEvery * rand(0.75, 1.25); const k = pick(T.dyn); if (SPAWN[k]) SPAWN[k](MAP_OWNER); } }   // hiểm họa tự nhiên của map
    if (state.quakeT > 0) {                                                                                                      // động đất
      state.quakeT -= dt; camShake = Math.max(camShake, 0.55);
      if (Math.random() < dt * 14) puff(new V3(rand(-LANE, LANE), 0.2, mon.z - rand(-4, 14)), { color: T.dust || 0xcdb98e, n: 3, size: 1.6, speed: 3, life: 1 });
    }
  } else if (state.phase === 'end') {
    if (state.cut) updateWinCut(dt);
    else { state.t -= dt; if (state.t <= 0) resetRound(); }
  }
  // cửa
  const target = time < door.openUntil && !door.broken ? 1 : 0;
  door.open += (target - door.open) * Math.min(1, dt * 9);
  door.pivot.rotation.y = -1.75 * door.open;
  door.shake = Math.max(0, door.shake - dt);
  door.pivot.position.x = door.baseX + (door.shake > 0 ? Math.sin(time * 70) * 0.06 : 0);
  // cửa tự hồi máu khi 3 giây liền không bị đấm (8% máu/giây)
  door.regen = state.phase === 'play' && !door.broken && door.hp < door.maxHp && time - (door.lastHit || -9) > 3;
  if (door.regen) {
    door.hp = Math.min(door.maxHp, door.hp + door.maxHp * 0.08 * dt);
    if (Math.random() < dt * 4) puff(new V3(rand(-0.6, 0.6), rand(1, 2.6), HOUSE_FRONT + 0.4), { color: 0x7dff6a, n: 1, size: 0.35, speed: 1, up: 2, life: 0.7, add: true, tex: starTex });
  }
  const k = door.hp / door.maxHp, tn = DOOR_TINT[door.tier || 0]; door.mat.color.setRGB((0.55 + 0.45 * k) * tn[0], (0.45 + 0.55 * k) * tn[1], (0.4 + 0.6 * k) * tn[2]);
}

// =====================================================================
// THẮNG: phá cửa → đi vào nhà → ngồi ăn não → đứng dậy "NÃO!" → +1 WIN → về đầu đường
// =====================================================================
const ROOM = new V3(400, 0, 0);   // phòng đặt xa khỏi đường đi, camera "cắt cảnh" sang đây
const room = {};
function buildRoom() {
  const g = new THREE.Group(); g.position.copy(ROOM); g.visible = false; scene.add(g); room.g = g;
  const floorTex = ctex(256, 256, (c, w, h) => { c.fillStyle = '#8a5a32'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 32) { c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(0, y, w, 2); for (let x = (y / 32 % 2) * 64; x < w; x += 128) c.fillRect(x, y, 2, 32); } speckle(c, w, h, ['#6e4524', '#a87448'], 900, 1, 3); }, [3, 3]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.75 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01; floor.receiveShadow = true; g.add(floor);
  const wallTex = ctex(128, 128, (c, w, h) => { c.fillStyle = '#ecdfc2'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(190,150,105,.35)'; for (let x = 0; x < w; x += 16) c.fillRect(x, 0, 6, h); }, [4, 1.5]);
  const wm = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 }), wood = MS(0x6e4524, 0.8);
  box(10, 3.2, 0.2, wm, 0, 1.6, -5, g); box(0.2, 3.2, 10, wm, -5, 1.6, 0, g); box(0.2, 3.2, 10, wm, 5, 1.6, 0, g);
  box(10, 0.9, 0.24, wood, 0, 0.45, -4.97, g); box(0.24, 0.9, 10, wood, -4.97, 0.45, 0, g); box(0.24, 0.9, 10, wood, 4.97, 0.45, 0, g);
  box(2.2, 1.5, 0.08, MS(0xf7f3ea, 0.6), 1.8, 1.95, -4.88, g); box(1.9, 1.2, 0.1, MS(0x9fd2f0, 0.1, 0.3, { emissive: 0x2a4a66 }), 1.8, 1.95, -4.84, g);
  box(0.6, 0.9, 0.06, MS(0x3a7a55, 0.7), -2.4, 1.9, -4.86, g);                       // tranh treo tường
  const rugTex = ctex(256, 256, (c, w, h) => { for (let r = 128; r > 0; r -= 16) { c.fillStyle = (r / 16) % 2 ? '#c8283a' : '#f3ece0'; c.beginPath(); c.arc(128, 128, r, 0, 7); c.fill(); } });
  const rug = cyl(2.6, 2.6, 0.02, new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }), 0, 0.02, 0.4, g, 40); rug.castShadow = false;
  const clothTex = ctex(128, 128, (c, w, h) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { c.fillStyle = (i + j) % 2 ? '#d8283a' : '#f8f4ec'; c.fillRect(i * 16, j * 16, 16, 16); } }, [3, 3]);
  const cloth = new THREE.MeshStandardMaterial({ map: clothTex, roughness: 0.85 });
  cyl(1.0, 1.0, 0.05, cloth, 0, 0.8, 0, g, 32); cyl(1.0, 1.12, 0.5, cloth, 0, 0.55, 0, g, 32);
  cyl(0.3, 0.27, 0.03, MS(0xffffff, 0.3), 0, 0.84, 0.38, g, 24);                     // đĩa
  box(0.03, 0.01, 0.32, MS(0xd8dde4, 0.25, 0.9), -0.4, 0.84, 0.38, g); box(0.05, 0.01, 0.34, MS(0xd8dde4, 0.25, 0.9), 0.4, 0.84, 0.38, g); // nĩa, dao
  room.brain = put(new THREE.Mesh(geo('brain', () => blobGeo(3, 0.22, 11)), MS(0xf28fb0, 0.45, 0, { emissive: 0x3a0a18 })), 0, 0.93, 0.38, g);
  room.brain.scale.set(0.2, 0.13, 0.16);
  const teal = MS(0x3aa8a0, 0.6);                                                     // ghế
  box(0.62, 0.08, 0.6, teal, 0, 0.48, 1.12, g); box(0.62, 0.9, 0.08, teal, 0, 0.95, 1.42, g);
  for (const [x, z] of [[-0.26, 0.88], [0.26, 0.88], [-0.26, 1.38], [0.26, 1.38]]) cyl(0.03, 0.03, 0.48, teal, x, 0.24, z, g, 6);
  const lamp = new THREE.PointLight(0xffe2b0, 40, 14); lamp.position.set(0.5, 2.8, 1.5); g.add(lamp);
}
function startWinCut() { state.cut = { t: 0, stage: 'enter' }; }
function updateWinCut(dt) {
  const C = state.cut; if (!C) return; C.t += dt;
  if (C.stage === 'enter') {                                       // bước vào cửa nhà
    mon.x += clamp(-mon.x, -dt, dt); mon.z -= 1.1 * dt; mon.walkPh = (mon.walkPh || 0) + 1.1 * dt * Math.PI * 2 / 1.3; mon.yawT = 0;
    playAnim('Walking');
    if (mon.z < HOUSE_FRONT - 1.7) mon.root.visible = false;     // đi hẳn vào sảnh, tới gần bàn ăn mới khuất
    if (C.t > 2.9) {
      C.stage = 'eat'; C.t = 0; room.g.visible = true; mon.root.visible = true;
      mon.x = ROOM.x; mon.z = ROOM.z + 1.12; mon.y = 0; mon.gy = 0; room.brain.scale.set(0.2, 0.13, 0.16);
      mon.cur = ''; playAnim('Eat'); popText(new V3(mon.x, 2.3, mon.z - 0.4), '😋 Ăn não...', 'info', 1.4);
    }
  } else if (C.stage === 'eat') {                                  // ngồi ăn não
    const k = Math.max(0.05, 1 - C.t / 3.4); room.brain.scale.set(0.2 * k, 0.13 * k, 0.16 * k);
    C.munch = (C.munch || 0) - dt; if (C.munch <= 0) { C.munch = 0.32; sfx('bite'); puff(new V3(ROOM.x + rand(-0.1, 0.1), 1.0, ROOM.z + 0.45), { color: 0xf28fb0, n: 2, size: 0.12, speed: 1.5, life: 0.5, grav: 3 }); }
    if (C.t > 3.8) {
      C.stage = 'cheer'; C.t = 0; mon.z = ROOM.z + 1.75; mon.cur = ''; playAnim('Cheer');
      state.win += T.winBonus || 1; const w = $('win'); w.classList.remove('bump'); void w.offsetWidth; w.classList.add('bump');
      popText(new V3(mon.x, MON_H + 0.7, mon.z), '🧠 NÃO!!!', 'big', 2.2);
      banner(T.winBonus ? '🏰 HẠ ĐƯỢC LÂU ĐÀI!' : '🧠 NÃO NGON QUÁ!', `${esc(CONFIG.streamerName)} +${T.winBonus || 1} WIN • Sang map: ${MAPS[state.nextMap].name}`); sfx('lose');
    }
  } else if (C.stage === 'cheer') {
    if (C.t > 2.4) { state.cut = null; room.g.visible = false; resetRound(); }
  }
}
// =====================================================================
// Camera bám sau lưng quái
// =====================================================================
const camPos = new V3(0, 5, START_Z + 10), camLook = new V3(0, 2, START_Z - 12);
// Chuột phải kéo lên/xuống: đổi độ cao camera • Cuộn chuột: gần/xa • Phím C: về mặc định (tự lưu)
const camAdj = { up: Number(lsGet('qv_camUp')) || 0, back: Number(lsGet('qv_camBack')) || 0 };
let rDrag = null, camHintT = 0;
function camHint() {
  const h = document.getElementById('hint');
  h.textContent = `📷 Độ cao ${camAdj.up >= 0 ? '+' : ''}${camAdj.up.toFixed(1)}m • Khoảng cách ${camAdj.back >= 0 ? '+' : ''}${camAdj.back.toFixed(1)}m • Phím C: mặc định`;
  h.classList.add('show');                                       // dòng chữ dưới game chỉ hiện chốc lát khi chỉnh camera
  clearTimeout(camHintT); camHintT = setTimeout(() => { h.textContent = hintText(); h.classList.remove('show'); }, 2500);
}
function saveCam() { lsSet('qv_camUp', camAdj.up.toFixed(2)); lsSet('qv_camBack', camAdj.back.toFixed(2)); }
{
  const cv = renderer.domElement;
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => { if (e.button === 2) { rDrag = { y: e.clientY }; cv.setPointerCapture(e.pointerId); } });
  cv.addEventListener('pointermove', e => {
    if (!rDrag) return;
    camAdj.up = clamp(camAdj.up + (rDrag.y - e.clientY) * 0.03, -3, 14); rDrag.y = e.clientY; camHint();
  });
  const end = () => { if (rDrag) { rDrag = null; saveCam(); } };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('wheel', e => { e.preventDefault(); camAdj.back = clamp(camAdj.back + e.deltaY * 0.01, -6, 16); saveCam(); camHint(); }, { passive: false });
  addEventListener('keydown', e => { if ((e.key === 'c' || e.key === 'C') && e.target.tagName !== 'INPUT') { camAdj.up = 0; camAdj.back = 0; saveCam(); camHint(); } });
}
function updateCamera(dt) {
  if (state.cut && state.cut.stage !== 'enter') {                 // cảnh trong nhà
    camera.position.set(ROOM.x + 2.3, 2.15, ROOM.z + 3.3); camera.lookAt(ROOM.x, 0.95, ROOM.z + 0.55);
    sun.position.set(ROOM.x + 6, 30, ROOM.z + 10); sun.target.position.copy(ROOM); return;
  }
  const portrait = camera.aspect < 0.85;
  // càng gần nhà camera càng lùi/nâng nhẹ để thấy trọn ngôi nhà (như video mẫu)
  const near = clamp(1 - (mon.z - HOUSE_FRONT - 1) / 20, 0, 1), e = near * near * (3 - 2 * near);
  const back = Math.max(3, (portrait ? 12.5 : 11) - e * 5.5 + camAdj.back), up = Math.max(1.2, (portrait ? 6 : 5.2) - e * 2.6 + camAdj.up);
  const ahead = Math.max(2.5, ((portrait ? 12 : 11) - camAdj.up * 0.6) * (1 - 0.6 * e));
  const fast = mon.kv > 2 || mon.flip || mon.carry || mon.lift;
  const k = 1 - Math.exp(-dt * (fast ? 9 : 3.2));
  camPos.lerp(tv.set(mon.x * (0.55 + 0.4 * e), up + mon.gy + mon.y * 0.9, mon.z + back + mon.y * 0.6), k);
  camLook.lerp(tv.set(mon.x * (0.3 + 0.6 * e), 1.5 + mon.gy + mon.y * 1.15, mon.z - ahead), k);
  camShake = Math.max(0, camShake - dt * 1.6);
  const s = camShake * 0.35;
  camera.position.set(camPos.x + rand(-s, s), camPos.y + rand(-s, s), camPos.z);
  fovKick *= Math.exp(-dt * 6); camera.fov = camBaseFov + fovKick; camera.updateProjectionMatrix();
  camera.lookAt(camLook);
  skyDome.position.copy(camera.position);
  sun.position.set(mon.x + 16, 34, mon.z + 10); sun.target.position.set(mon.x, 0, mon.z - 10);
}

// =====================================================================
// HUD
// =====================================================================
const $ = id => document.getElementById(id);
const hintText = () => `🎮 Streamer: ${CONFIG.lockForward ? 'A/D ← → đi ngang' : 'W/S tới-lùi • A/D trái-phải • Shift chạy'}${CONFIG.lockJump ? '' : ' • Space nhảy'} • F đấm • 🖱️ chuột phải kéo: camera`;
document.getElementById('hint').textContent = hintText();
let bannerTimer = 0, gTimer = 0;
function banner(t, sub) { const b = $('banner'); b.innerHTML = t + (sub ? `<small>${sub}</small>` : ''); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.remove('show'), 2200); }
function gBanner(user, gift, label) {
  const b = $('gbanner'); b.innerHTML = ''; b.appendChild(avatarEl(user));
  const s = document.createElement('span'); s.textContent = `${user.name} đã gửi ${gift}${label ? ' → ' + label : ''}`; b.appendChild(s);
  b.classList.add('show'); clearTimeout(gTimer); gTimer = setTimeout(() => b.classList.remove('show'), 4000);
}
function showFeed(user, text, count, emoji) {
  const f = $('feed'), c = document.createElement('div'); c.className = 'fc';
  c.appendChild(avatarEl(user));
  const tx = document.createElement('div'); tx.className = 'tx'; tx.innerHTML = `${esc(user.name)}<small>${esc(text)}</small>`; c.appendChild(tx);
  const gi = document.createElement('div'); gi.className = 'gi'; gi.textContent = emoji; c.appendChild(gi);
  const x = document.createElement('div'); x.className = 'x'; x.textContent = 'x' + count; c.appendChild(x);
  f.prepend(c); while (f.children.length > 3) f.lastChild.remove();
  setTimeout(() => { c.classList.add('out'); setTimeout(() => c.remove(), 500); }, 4200);
}
function buildLegends() {
  const chip = (g, cls) => `<div class="chip ${cls || ''}"><em>${g.img ? `<img src="${esc(g.img)}" alt="">` : g.emoji}</em><div>${esc(g.label)}</div></div>`;   // chỉ tên tác dụng, icon to
  // Đã gán quà trong app → hiện tên + ẢNH quà thật đã gán
  const mapped = g => ((CONFIG.giftMap || {})[g.action] || []).filter(x => x && (x.giftName || x.giftId != null));
  const named = g => { const m = mapped(g), n = m.map(x => x.giftName).filter(Boolean), img = (m.find(x => x.giftImage) || {}).giftImage; return n.length ? { ...g, gift: n.slice(0, 2).join(', '), img } : g; };
  $('heroList').innerHTML = HEROES.filter(g => (g.action !== 'time' || CONFIG.timerOn) && (!g.opt || mapped(g).length)).map(g => chip(named(g), 'hero')).join('');
  $('villList').innerHTML = [...VILLAINS.filter(g => !g.opt || mapped(g).length).map(named), ...SOCIAL.map(g => g.gift === 'Thả tim' ? { ...g, label: `Ném đá (${CONFIG.likePer} tim)` } : g.gift === 'Bình luận' && CONFIG.commentKey ? { ...g, label: `Ném dép (gõ ${CONFIG.commentKey})` } : g)].map(g => chip(g)).join('');
}
let boardT = 0;
const doorLabel = makeLabel('dlab'); doorLabel.innerHTML = '<div class="dt">🚪 CỬA NHÀ</div><div class="dhp"><i></i></div>';
const doorBarEl = doorLabel.querySelector('i');
function updateHud(dt) {
  $('winN').textContent = state.win; $('winT').textContent = CONFIG.winTarget;
  const dk = door.hp / door.maxHp, rt = Math.max(0, Math.ceil(state.roundT));
  $('timerN').textContent = `${Math.floor(rt / 60)}:${String(rt % 60).padStart(2, '0')}`;
  $('tmrW').classList.toggle('low', rt <= 20 && state.phase === 'play'); $('tmrW').style.display = CONFIG.timerOn ? '' : 'none';
  { const L = START_Z - HOUSE_FRONT, f = q => clamp((START_Z - q) / L, 0, 1) * 100;   // thanh đường đi: đầu đường → cửa nhà
    $('rtZ').style.left = f(mon.z) + '%'; $('rtFill').style.width = f(mon.z) + '%';
    $('rtCp').style.left = f(cpZ) + '%'; $('rtCp').style.display = CONFIG.checkpoint ? '' : 'none'; $('rtCp').textContent = state.cp ? '✅' : '🚩'; }
  $('distN').textContent = Math.max(0, Math.round(mon.z - HOUSE_FRONT - 1.3));
  if (mon.ready) {
    mon.bf.textContent = (time < mon.speedUntil ? '👟' : '') + (mon.shieldHp > 0 ? '🚪' + mon.shieldHp + (mon.shieldStock ? ` +${mon.shieldStock}` : '') : '') + (mon.stun > 0 && state.phase === 'play' ? '💫' : '');
    placeEl(mon.label, mon.x, mon.y + mon.gy + MON_H + 0.45, mon.z, 12, 0.6, 1.2);
  }
  doorBarEl.style.width = (dk * 100) + '%'; doorLabel.classList.toggle('regen', !!door.regen);
  placeEl(doorLabel, 0, 3.5, HOUSE_FRONT + 0.3, 14, 0.45, 1.1);
  boardT -= dt;
  if (boardT <= 0) {
    boardT = 0.5;
    const list = [...players.values()].sort((a, b) => b.pts - a.pts).slice(0, 5), B = $('board'); B.innerHTML = '';
    list.forEach((p, i) => {
      const r = document.createElement('div'); r.className = 'br';
      const rk = document.createElement('span'); rk.textContent = ['🥇', '🥈', '🥉', '4', '5'][i];
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = p.name;
      const pt = document.createElement('span'); pt.className = 'p'; pt.textContent = Math.round(p.pts);
      r.append(rk, avatarEl(p), nm, pt); B.appendChild(r);
    });
    const pill = (el, p) => { el.innerHTML = ''; if (!p) return; el.appendChild(avatarEl(p)); const s = document.createElement('span'); s.textContent = 'x' + Math.round(p.pts / 10); el.appendChild(s); };
    pill($('pillL'), list[0]); pill($('pillR'), list[1]);
  }
}

// =====================================================================
// HP Action LIVE: overlay /overlay/quaivat nhận sự kiện LIVE + cấu hình + lệnh qua socket.io của app
// =====================================================================
const IN_APP = typeof window.io === 'function';
let appCfgSeen = false;
function applyServerConfig(c) {
  if (!c || typeof c !== 'object') return;
  if (typeof c.qvStreamerName === 'string' && c.qvStreamerName.trim()) CONFIG.streamerName = c.qvStreamerName.trim();
  if (typeof c.qvStreamerAvatar === 'string') CONFIG.streamerAvatar = c.qvStreamerAvatar.trim();
  if (Number(c.qvLikePer) > 0) CONFIG.likePer = Math.max(1, Math.round(Number(c.qvLikePer)));
  if (typeof c.qvCommentKey === 'string') CONFIG.commentKey = c.qvCommentKey.trim().slice(0, 40);
  if (Number(c.qvDoorHp) > 0) CONFIG.doorHp = Math.max(100, Number(c.qvDoorHp) === 1200 && !c.qvHpV2 ? 600 : Number(c.qvDoorHp));   // máu mặc định cũ 1200 → 600 (giờ cửa tự hồi máu)
  document.body.classList.toggle('nolegend', c.qvShowLegend === false);
  if (Number(c.qvRoundSeconds) > 0) CONFIG.roundSeconds = Math.max(30, Number(c.qvRoundSeconds));
  CONFIG.lockJump = !!c.qvLockJump; CONFIG.lockForward = !!c.qvLockForward;
  CONFIG.timerOn = !!c.qvTimerOn; CONFIG.checkpoint = c.qvCheckpoint !== false; if (cp.g) cp.g.visible = CONFIG.checkpoint;
  autoDodge = c.qvAutoDodge !== false; soundOn = c.qvSound !== false;
  CONFIG.giftMap = c.qvGiftMap && typeof c.qvGiftMap === 'object' ? c.qvGiftMap : {};
  if (typeof c.qvZombieModel === 'string' && /^[a-z]+$/.test(c.qvZombieModel) && c.qvZombieModel !== CONFIG.zombieModel) {
    lsSet('qv_zm', c.qvZombieModel);                               // đổi nhân vật → nạp lại với ?zm=<mới> (không lặp kể cả khi localStorage hỏng)
    const u = new URL(location.href); u.searchParams.set('zm', c.qvZombieModel); location.replace(u.href); return;
  }
  document.body.style.visibility = c.enabled === false ? 'hidden' : '';
  if (!appCfgSeen) {
    appCfgSeen = true;
    const sm = clamp((Number(c.qvStartMap) || 1) - 1, 0, MAPS.length - 1);
    if (!Q.get('map') && sm !== state.map) { if (state.phase === 'loading') buildMap(sm); else { state.nextMap = sm; resetRound(); } }
  }
  if (state.phase === 'loading' || state.phase === 'intro') { door.maxHp = door.hp = mapDoorHp(); state.roundT = mapRoundT(); }
  refreshStreamer(); $('hint').textContent = hintText(); buildLegends();
}
function appUser(d) { return { id: String(d.uniqueId || d.userId || d.nickname || 'khach'), name: d.nickname || d.uniqueId || 'Khách', avatar: d.profilePicture || '' }; }
function onAppGift(g) {
  if (!g) return;   // server đã gộp combo: 1 sự kiện / combo, repeatCount = tổng
  onGift(appUser(g), g.giftName || 'Quà', Math.max(1, Number(g.repeatCount) || 1), Number(g.coinValue || g.diamondCount || 1), actionForGiftId(g.giftId));
}
function onAppCmd(d) {
  if (!d || d.gameId !== 'quaivat') return;
  const p = d.payload || {};
  if (d.cmd === 'reset') resetRound();
  else if (d.cmd === 'demo') demo = !!p.on;
  else if (d.cmd === 'map') { state.nextMap = clamp(Number(p.index) || 0, 0, MAPS.length - 1); resetRound(); }
  else if (d.cmd === 'test') {
    const u = { id: 'test_' + (p.name || 'Test'), name: p.name || pick(FAKE), avatar: '' };
    if (p.action === 'like') onLike(u, CONFIG.likePer); else if (p.action === 'comment') onComment(u, CONFIG.commentKey); else if (p.action === 'follow') onFollow(u); else if (p.action === 'share') onShare(u);
    else { const gg = ALL_GIFTS.find(a => a.action === p.action); if (gg) onGift(u, gg.gift, Math.max(1, Number(p.count) || 1), gg.coins, gg.action); else if (SPAWN[p.action]) queueAction(p.action, u); }
  }
}
function connectApp() {
  const socket = window.io({ reconnection: true, reconnectionDelay: 600, reconnectionDelayMax: 5000 });
  // cửa sổ game (Edge/Chrome --app): app tắt / mất kết nối quá 4 giây → tự đóng cửa sổ game theo
  const WIN = Q.get('win') === '1'; let winCloseT = WIN ? setTimeout(() => window.close(), 9000) : 0;
  socket.on('connect', async () => {
    clearTimeout(winCloseT);
    setConn(true, '● Đã nối app HP Action LIVE');
    try { const r = await fetch('/api/games/quaivat/config'); if (r.ok) applyServerConfig(await r.json()); } catch {}
    socket.emit('subscribe', 'overlay');
  });
  socket.on('disconnect', () => { setConn(false, '● Mất kết nối app (đang thử lại...)'); if (WIN) { clearTimeout(winCloseT); winCloseT = setTimeout(() => window.close(), 4000); } });
  socket.on('gameConfig', d => { if (d && d.gameId === 'quaivat') applyServerConfig(d.config); });
  socket.on('overlay:reload', d => { if (!d || !d.gameId || d.gameId === 'quaivat') location.reload(); });
  socket.on('gameDisabled', d => { if (d && d.gameId === 'quaivat') document.body.style.visibility = 'hidden'; });
  socket.on('gameEnabled', d => { if (d && d.gameId === 'quaivat') document.body.style.visibility = ''; });
  socket.on('gift', onAppGift);   // chỉ nghe 'gift' (không nghe thêm 'gameGift' → khỏi xử lý 1 quà 2 lần)
  socket.on('chat', c => c && onComment(appUser(c), c.comment || ''));
  socket.on('like', l => l && onLike(appUser(l), Math.max(1, Number(l.likeCount) || 1)));
  socket.on('social', d => { if (!d) return; const t = String(d.label || ''); if (/theo dõi|follow/i.test(t)) onFollow(appUser(d)); else if (/chia sẻ|share/i.test(t)) onShare(appUser(d)); });
  socket.on('gameCmd', onAppCmd);
  socket.on('quaivat:key', k => { if (k && typeof k.code === 'string') (k.down ? keyDown : keyUp)(k.code); });
}
if (Q.get('win') === '1' && IN_APP) {
  let lastB = '';
  const sendB = (beacon) => {
    const b = { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight, shape: Q.get('shape') || '' }, k = JSON.stringify(b);
    if (k === lastB || b.w < 200 || b.h < 200) return; lastB = k;
    if (beacon && navigator.sendBeacon) navigator.sendBeacon('/api/quaivat/window/bounds', new Blob([k], { type: 'application/json' }));
    else fetch('/api/quaivat/window/bounds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: k }).catch(() => {});
  };
  setTimeout(() => { lastB = ''; setInterval(() => sendB(false), 1500); }, 2500);   // chờ cửa sổ dựng xong mới bắt đầu lưu
  addEventListener('beforeunload', () => sendB(true));
}
function startConnection() {
  if (!IN_APP) return connect();
  connectApp();
  if (!Q.get('panel')) document.body.classList.add('clean', 'inapp');   // OBS: ẩn nút ⚙ + chữ hướng dẫn
}
// =====================================================================
// TikFinity WebSocket (khi mở file game ngoài app)
// =====================================================================
let ws = null, wsTimer = 0;
const streaks = new Map();
function setConn(on, txt) {
  $('conn').className = on ? 'on' : ''; $('conn').textContent = on ? '● LIVE đã kết nối' : '● Chưa kết nối LIVE';
  $('connState').textContent = txt || (on ? '● Đã kết nối ' + CONFIG.wsUrl : '● Chưa kết nối (đang thử lại...)');
  $('connState').style.color = on ? '#7dff6a' : '#ff8a8a';
}
function connect() {
  clearTimeout(wsTimer);
  if (ws) { ws.onclose = null; try { ws.close(); } catch {} ws = null; }
  try { ws = new WebSocket(CONFIG.wsUrl); } catch { setConn(false, '● Địa chỉ WebSocket không hợp lệ'); return; }
  ws.onopen = () => setConn(true);
  ws.onclose = () => { setConn(false); wsTimer = setTimeout(connect, 4000); };
  ws.onerror = () => {};
  ws.onmessage = m => { let j; try { j = JSON.parse(m.data); } catch { return; } try { onLiveMessage(j); } catch (e) { console.warn(e); } };
}
function userFrom(d) {
  let av = d.profilePictureUrl || d.profilePicture || d.userDetails?.profilePictureUrls?.[0] || '';
  if (av && typeof av === 'object') av = av.urls?.[0] || av.url?.[0] || '';
  return { id: String(d.uniqueId || d.userId || d.nickname || 'khach'), name: d.nickname || d.uniqueId || 'Khách', avatar: av };
}
function onLiveMessage(j) {
  const ev = String(j.event || j.type || '').toLowerCase(), d = j.data || j, user = userFrom(d);
  if (ev === 'gift') {
    const key = user.id + ':' + (d.giftId ?? d.giftName);
    const total = Number(d.repeatCount || d.giftCount || 1);
    const streaking = Number(d.giftType) === 1 && d.repeatEnd === false;
    const prev = streaks.get(key) || 0, delta = total - prev;
    if (streaking) streaks.set(key, total); else streaks.delete(key);
    if (delta > 0) onGift(user, d.giftName || d.extendedGiftInfo?.name || 'Quà', delta, Number(d.diamondCount || 1));
  } else if (ev === 'like') onLike(user, Number(d.likeCount || 1));
  else if (ev === 'chat' || ev === 'comment') onComment(user, d.comment || '');
  else if (ev === 'follow') onFollow(user);
  else if (ev === 'share') onShare(user);
  else if (ev === 'social') { const t = String(d.displayType || d.label || ''); if (/follow/i.test(t)) onFollow(user); else if (/share/i.test(t)) onShare(user); }
}

// =====================================================================
// Bảng điều khiển + demo
// =====================================================================
const FAKE = ['Lan Trang', 'Kyra_Khoa', 'yuyui', 'Mr. Hưng', 'Dũng', 'Hồng Nhi', 'Khanhlinh', 'Tấn Phát', 'nguyễn sơn', 'X-DORA', 'bao_98A', 'Cường Thái', 'đạt vi vu', 'Hoàng Hà'];
function simUser() { const n = $('simName').value.trim() || pick(FAKE); return { id: 'sim_' + n, name: n, avatar: '' }; }
function simCount() { return Number($('simCnt').value) || 1; }
let demo = !!Q.get('demo'), demoT = 2;
function buildPanel() {
  $('wsUrl').value = CONFIG.wsUrl; $('inName').value = CONFIG.streamerName; $('inAvatar').value = CONFIG.streamerAvatar;
  $('inRound').value = CONFIG.roundSeconds; $('inDoorHp').value = CONFIG.doorHp;
  const gb = $('giftBtns');
  ALL_GIFTS.forEach((g, i) => {
    const b = document.createElement('button'); b.textContent = `${i < 9 ? (i + 1) + '. ' : ''}${g.emoji} ${g.gift}`; b.title = g.label;
    if (HEROES.includes(g)) b.className = 'hero';
    b.onclick = () => onGift(simUser(), g.gift, simCount(), g.coins); gb.appendChild(b);
  });
  document.querySelectorAll('[data-ev]').forEach(b => b.onclick = () => {
    const u = simUser(), ev = b.dataset.ev;
    if (ev === 'like') onLike(u, CONFIG.likePer); else if (ev === 'comment') onComment(u, CONFIG.commentKey); else if (ev === 'follow') onFollow(u); else onShare(u);
  });
  $('btnConn').onclick = () => { CONFIG.wsUrl = $('wsUrl').value.trim(); lsSet('qv_ws', CONFIG.wsUrl); connect(); };
  $('btnSave').onclick = () => {
    CONFIG.streamerName = $('inName').value.trim() || 'Streamer'; CONFIG.streamerAvatar = $('inAvatar').value.trim();
    CONFIG.roundSeconds = Math.max(30, Number($('inRound').value) || 180); CONFIG.doorHp = Math.max(100, Number($('inDoorHp').value) || 1200);
    lsSet('qv_name', CONFIG.streamerName); lsSet('qv_avatar', CONFIG.streamerAvatar); lsSet('qv_round', CONFIG.roundSeconds); lsSet('qv_dhp', CONFIG.doorHp);
    refreshStreamer(); resetRound();
  };
  $('btnSound').onclick = e => { soundOn = !soundOn; e.target.classList.toggle('on', soundOn); };
  $('btnDemo').onclick = e => { demo = !demo; e.target.classList.toggle('on', demo); };
  $('btnAuto').onclick = e => { autoDodge = !autoDodge; e.target.classList.toggle('on', autoDodge); };
  $('btnReset').onclick = () => resetRound();
  $('lockJump').checked = CONFIG.lockJump; $('lockFwd').checked = CONFIG.lockForward; $('timerOn').checked = CONFIG.timerOn;
  $('timerOn').onchange = e => { CONFIG.timerOn = e.target.checked; lsSet('qv_timer', CONFIG.timerOn ? '1' : '0'); buildLegends(); };
  $('lockJump').onchange = e => { CONFIG.lockJump = e.target.checked; lsSet('qv_lockJump', CONFIG.lockJump ? '1' : '0'); $('hint').textContent = hintText(); };
  $('lockFwd').onchange = e => { CONFIG.lockForward = e.target.checked; lsSet('qv_lockFwd', CONFIG.lockForward ? '1' : '0'); $('hint').textContent = hintText(); };
  $('inMap').innerHTML = MAPS.map((m, i) => `<option value="${i}">Map ${i + 1}: ${m.name} (${m.length}m)</option>`).join('');
  $('inMap').value = String(state.map);
  $('inMap').onchange = e => { state.nextMap = Number(e.target.value); resetRound(); };
  $('gear').onclick = () => $('panel').classList.toggle('hidden');
  if (demo) $('btnDemo').classList.add('on');
  if (Q.get('clean')) document.body.classList.add('clean');
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (CTRL_KEYS.includes(e.code)) { e.preventDefault(); keyDown(e.code); } else keys[e.code] = true;
    if (e.key === 'p' || e.key === 'P') $('panel').classList.toggle('hidden');
    const n = Number(e.key); if (n >= 1 && n <= 9) { const g = ALL_GIFTS[n - 1]; onGift(simUser(), g.gift, simCount(), g.coins); }
  });
  addEventListener('keyup', e => keyUp(e.code));
}
function updateDemo(dt) {
  if (!demo || state.phase !== 'play') return;
  demoT -= dt; if (demoT > 0) return; demoT = rand(0.7, 1.9);
  const name = pick(FAKE), u = { id: 'demo_' + name, name, avatar: '' }, r = Math.random();
  if (r < 0.3) onLike(u, Math.floor(rand(3, 12)));
  else if (r < 0.4) onComment(u, CONFIG.commentKey || 'hay quá');
  else if (r < 0.44) onFollow(u);
  else {
    const pool = [['rose', 24], ['xbarrel', 8], ['trap', 12], ['tire', 14], ['slime', 8], ['repair', 6], ['fox', 5], ['mine', 4], ['flower', 5], ['lightning', 2.5], ['balloon', 1.5], ['boulder', 0.7], ['shoes', 3], ['shield', 2], ['time', 2], ['plant', 8],
      ['banana', 6], ['net', 3], ['bees', 3], ['crows', 2], ['meteor', 0.6], ['hand', 0.4], ['quake', 0.15]];
    let x = Math.random() * pool.reduce((s, p) => s + p[1], 0), k = 0; while (x > pool[k][1]) { x -= pool[k][1]; k++; }
    const g = ALL_GIFTS.find(a => a.action === pool[k][0]); onGift(u, g.gift, k < 4 ? pick([1, 1, 2, 3]) : 1, g.coins);
  }
}

// =====================================================================
// Vòng lặp
// =====================================================================
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  tick(dt);
  requestAnimationFrame(frame);
}
function tick(dt) {
  time += dt;
  if (state.phase !== 'loading') {
    let gdt = dt; if (hitStop > 0) { hitStop -= dt; gdt = 0; }               // khựng hình khi trúng đòn mạnh
    updateDemo(gdt); updateQueue(gdt); updatePhase(gdt); updateMonster(gdt); updateItems(gdt); updatePeas(gdt); updateBolts(gdt); updateCamera(dt);
  }
  updateFx(dt); updateHouseFx(dt); updatePops(dt); updateHud(dt);
  WIND.value = time;
  if (composer) composer.render(); else renderer.render(scene, camera);
}
resize(); buildMap(clamp((Number(Q.get('map')) || 1) - 1, 0, MAPS.length - 1)); buildRoom(); buildLegends(); buildPanel(); startConnection();
camera.position.copy(camPos); camera.lookAt(camLook);
requestAnimationFrame(frame);
try {
  await setupMonster();
  try { foxGltf = await loadModel('fox', 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/Fox/glTF-Binary/Fox.glb'); } catch (e) { console.warn('Không tải được cáo', e); }
  $('loading').remove();
  startIntro();
} catch (e) {
  console.error(e);
  $('loading').textContent = '❌ Không tải được mô hình 3D (models.js).';
}
window.__game = { step: (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) tick(dt); }, get foxGltf() { return foxGltf; }, zombieAnimate, renderer, THREE, scene, camera, state, mon, door, items, onGift, onLike, onFollow, onShare, onComment, onLiveMessage, actionQueue, runAction };
