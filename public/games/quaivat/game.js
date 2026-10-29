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
  doorHp: Number(lsGet('qv_dhp')) || 1200,      // máu cửa nhà
  monsterSpeed: 1.15,     // m/giây (zombie lê chậm)
  punchDmg: 40,           // sát thương mỗi cú đấm (vào vật cản / cửa)
  punchEvery: 0.75,       // giây giữa 2 cú đấm
  winTarget: 20,
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
// Quà của người xem → bẫy / vật cản / đồng minh chống lại quái
const VILLAINS = [
  { names: ['rose', 'hoa hồng'],                   action: 'rose',    emoji: '🌹', gift: 'Hoa hồng',  label: 'Khoai lăn / thùng gỗ', coins: 1 },
  { names: ['lollipop', 'kẹo mút'],               action: 'xbarrel', emoji: '🛢️', gift: 'Kẹo mút',   label: 'Thùng thuốc nổ',     coins: 1 },
  { names: ['tiktok'],                             action: 'trap',    emoji: '🎵', gift: 'TikTok',    label: 'Bẫy kẹp',            coins: 1 },
  { names: ['gg'],                                 action: 'plant',   emoji: '🌱', gift: 'GG',        label: 'Cây bắn đậu',        coins: 1 },
  { names: ['ice cream cone', 'ice cream', 'kem'], action: 'slime',   emoji: '🍦', gift: 'Kem',       label: 'Vũng keo dính',      coins: 1 },
  { names: ['finger heart', 'bắn tim'],            action: 'repair',  emoji: '🫰', gift: 'Bắn tim',   label: 'Sửa cửa +150',       coins: 5 },
  { names: ['perfume', 'nước hoa'],                action: 'fox',     emoji: '🦊', gift: 'Nước hoa',  label: 'Cáo cắn quái',       coins: 20 },
  { names: ['doughnut', 'donut', 'bánh vòng'],     action: 'mine',    emoji: '💥', gift: 'Bánh vòng', label: 'Chôn 3 mìn đất',      coins: 30 },
  { names: ['tiny diny', 'khủng long nhỏ'],        action: 'flower',  emoji: '🌸', gift: 'Tiny Diny', label: 'Hoa gió thổi lùi',   coins: 10 },
  { names: ['paper crane', 'hạc giấy', 'confetti', 'sunglasses', 'kính râm', 'hat and mustache'], action: 'lightning', emoji: '⚡', gift: 'Hạc giấy', label: 'Sét đánh cháy đen', coins: 99 },
  { names: ['hand hearts', 'tay trái tim'],        action: 'balloon', emoji: '🎈', gift: 'Tay trái tim', label: 'Bóng bay kéo về',  coins: 100 },
  { names: ['corgi', 'money gun', 'galaxy', 'lion', 'universe', 'tiktok universe'], action: 'boulder', emoji: '🪨', gift: 'Corgi+', label: 'Tảng đá khổng lồ', coins: 299 },
];
// Quà hỗ trợ quái (streamer) — đổi tên quà tùy ý
const HEROES = [
  { names: ['heart me'],                             action: 'shoes', emoji: '👟', gift: 'Heart Me',  label: 'Giày tốc độ',  coins: 1 },
  { names: ['friendship necklace', 'vòng cổ'],       action: 'shield', emoji: '🚪', gift: 'Vòng cổ',  label: 'Khiên cửa (chặn 8 đòn)', coins: 10 },
  { names: ['rosa', 'hoa hồng nhung'],               action: 'time',  emoji: '⏳', gift: 'Rosa',      label: '+20 giây cho quái', coins: 10 },
];
const SOCIAL = [
  { emoji: '❤️', gift: 'Thả tim', label: 'Ném sỏi' },
  { emoji: '💬', gift: 'Bình luận', label: 'Ném dép' },
  { emoji: '➕', gift: 'Follow', label: 'Hàng rào gỗ' },
  { emoji: '↗️', gift: 'Chia sẻ', label: 'Bom hẹn giờ' },
];
function actionByCoins(c) {
  if (c >= 200) return 'boulder';
  if (c >= 150) return 'lightning';
  if (c >= 99) return pick(['balloon', 'lightning']);
  if (c >= 25) return 'bomb';
  if (c >= 15) return 'fox';
  if (c >= 10) return 'flower';
  if (c >= 5) return 'repair';
  return pick(['rose', 'xbarrel', 'trap', 'tire', 'slime']);
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
let composer = null, bloomPass = null, camBaseFov = 52, fovKick = 0, hitStop = 0;
if (HQ) {
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.55, 0.96); composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass(GradeShader));
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
  { name: 'Mùa Thu', length: 110, mines: 9, prop: 'pumpkin', props: 7,
    sky: ['#4a7fc4', '#8fb9e0', '#f2d7b0', '#f8e6c8'], fog: 0xf0dcc0, sun: 0xffd9a0, sunI: 2.6, hemi: [0xffe6c4, 0x7a5a2a, 0.5],
    lawn: '#a39a3e', lawnSp: ['#8a7f2a', '#c4b45a', '#9a6a2a'], laneA: '#cdc56c', laneB: '#b0a54e', blade: ['110,90,25', '255,240,190'],
    hedge: [0x8a7a2a, 0x9a6a20, 0x7a8a2a, 0xa0782a], hedgeCore: 0x5e5a1e, tree: [0xe07a2a, 0xd4a020, 0xc0502a, 0xe8b040, 0xb83a1e], trunk: 0x5a3a20,
    hill: [0xb0a050, 0xc09040, 0xa08a40], mtn: 0x9a8fb0, flowers: [0xffb040, 0xff7a3a, 0xffe07a, 0xc0502a],
    wall: '#f3dcc0', roof: ['#5a2e1a', '#a0603a', '#8a4e2a', '#4a2412'], sunflowers: true },
  { name: 'Xứ Tuyết', length: 130, mines: 11, prop: 'snowman', props: 8, dust: 0xf4f8ff,
    sky: ['#6a88b0', '#a9bfd8', '#dfe8f2', '#f2f6fa'], fog: 0xe6eef6, sun: 0xeef4ff, sunI: 2.2, hemi: [0xeef4ff, 0x9aa8b8, 0.7],
    lawn: '#eef3f8', lawnSp: ['#d6e0ea', '#ffffff', '#c8d4e2'], laneA: '#f4f8fc', laneB: '#dbe6f1', blade: ['150,170,200', '255,255,255'],
    hedge: [0x2f5a40, 0x3a6a4a, 0xe8eef5, 0xdfe7f0], hedgeCore: 0x2a4a38, tree: [0x2e6b4a, 0x3a7a55, 0xeef3f8, 0xffffff], trunk: 0x4a3426,
    hill: [0xf2f6fa, 0xe4ecf4, 0xdde6f0], mtn: 0xb8c8de, flowers: [0xffffff, 0xd8ecff, 0xbfe0ff],
    wall: '#e9e4dc', roof: ['#aab8c8', '#ffffff', '#eef3f8', '#9aa8b8'], sunflowers: false },
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
  }
}

const world = new THREE.Group(); scene.add(world);
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(480, 40, 20), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { cTop: { value: new THREE.Color() }, cMid: { value: new THREE.Color() }, cLow: { value: new THREE.Color() }, cHor: { value: new THREE.Color() },
    sunDir: { value: new V3(-0.45, 0.32, -1).normalize() } },
  vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 cTop, cMid, cLow, cHor, sunDir; varying vec3 vDir;
    void main(){ float h = vDir.y;
      vec3 col = mix(cHor, cLow, smoothstep(-0.03, 0.025, h)); col = mix(col, cMid, smoothstep(0.025, 0.11, h)); col = mix(col, cTop, smoothstep(0.11, 0.42, h));
      float d = max(dot(normalize(vDir), sunDir), 0.0);
      col += vec3(1.0, 0.93, 0.75) * (pow(d, 900.0) * 3.0 + pow(d, 60.0) * 0.35 + pow(d, 8.0) * 0.12);   // đĩa + quầng mặt trời
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
function buildMap(i) {
  state.map = i; T = MAPS[i]; HOUSE_FRONT = 2 - T.length;
  world.clear();
  scene.background = new THREE.Color(T.sky[3]);
  const su = skyDome.material.uniforms;
  su.cTop.value.set(T.sky[0]); su.cMid.value.set(T.sky[1]); su.cLow.value.set(T.sky[2]); su.cHor.value.set(T.sky[3]);
  scene.fog = new THREE.Fog(T.fog, 95, 330 + T.length);
  hemi.color.setHex(T.hemi[0]); hemi.groundColor.setHex(T.hemi[1]); hemi.intensity = T.hemi[2];
  sun.color.setHex(T.sun); sun.intensity = T.sunI;
  buildWorld(); buildHouse();
  document.getElementById('mapN').textContent = `🗺️ Map ${i + 1}: ${T.name}`;
}
// ---------------- Ngôi nhà ----------------
const door = { hp: CONFIG.doorHp, maxHp: CONFIG.doorHp, open: 0, openUntil: 0, shake: 0, broken: false };
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
    const gr = g.createLinearGradient(0, 0, 0, h);
    const c = new THREE.Color(T.wall); gr.addColorStop(0, '#' + c.clone().offsetHSL(0, 0, 0.04).getHexString()); gr.addColorStop(1, '#' + c.clone().offsetHSL(0, 0.02, -0.08).getHexString());
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    speckle(g, w, h, ['#d8c9a6', '#fff6df', '#e2d4b2', '#cbbb98'], 5000, 1, 2.5);
  }, [4, 1]);
  box(16, 5.2, 10, new THREE.MeshStandardMaterial({ map: plaster, roughness: 0.92, envMapIntensity: 0.5 }), 0, 3.3, 0, H);
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

  // ---- cửa sổ: khung sâu, kính phản chiếu + rèm, lá chống, bậu, hộp hoa ----
  const glassTex = ctex(128, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#cfe9fb'); gr.addColorStop(0.45, '#6fa6cf'); gr.addColorStop(1, '#2d4a66');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(20, 0); g.lineTo(55, 0); g.lineTo(15, h); g.lineTo(-20, h); g.fill();   // vệt phản chiếu
    g.fillStyle = '#f3ead6'; g.fillRect(0, 0, 18, h); g.fillRect(w - 18, 0, 18, h);                                                   // rèm
    g.fillStyle = 'rgba(0,0,0,.12)'; for (let x = 3; x < 18; x += 5) { g.fillRect(x, 0, 2, h); g.fillRect(w - 18 + x, 0, 2, h); }
  });
  const glassMat = new THREE.MeshStandardMaterial({ map: glassTex, roughness: 0.12, metalness: 0.25, envMapIntensity: 1.1 });
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
  box(2.55, 3.55, 0.24, white, 0, 0.7 + 1.775, F + 0.02, H);
  box(1.95, 3.15, 0.1, MS(0x120c08, 1), 0, 0.7 + 1.575, F + 0.08, H);
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
const ZOMBIE_MODELS = { basic: 'zombie_basic.glb', chubby: 'zombie_chubby.glb', arm: 'zombie_arm.glb', ribcage: 'zombie_ribcage.glb' };
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
  Walking: ['Walk'], Running: ['Run_Arms', 'Run'], Idle: ['Idle'], Punch: ['Punch', 'Idle_Attack', 'Run_Attack', 'Idle'],
  Hurt: ['HitReact', 'Idle'], Dizzy: ['No', 'Idle'], Jump: ['Jump_Idle', 'Jump'], Wave: ['Wave', 'Jump_Idle'], Death: ['Death'],
  Dance: ['Yes', 'Wave'], Eat: ['Idle_Attack', 'Punch', 'Yes', 'Idle'], Cheer: ['Wave', 'Yes', 'Jump_Idle'],
};
function glbAnimate(dt) {
  const z = mon.z3; z.mixer.update(dt);
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
  mon.shieldPanel = box(0.9, 1.72, 0.07, new THREE.MeshStandardMaterial({ map: makeShieldTex(), roughness: 0.75 }), 0, 0, 0, sh);
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
    mon.shieldHp--; mon.shieldHit = 0.35; sfx('thud');
    if (knock) mon.kv = Math.min(mon.kv + knock * 4 * 0.35, 36);
    debris(new V3(mon.x, mon.gy + 1.0, mon.z - 0.5), 0x7a4423, 2, 0.1, 3);
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
  debris(p, 0x7a4423, 14, 0.2, 7); debris(p, 0x9fd2f0, 4, 0.1, 5); puff(p, { color: 0xd8c6a0, n: 8, size: 1, speed: 3, life: 0.7 });
  popText(new V3(mon.x, mon.y + mon.gy + MON_H + 0.9, mon.z), '💥 VỠ KHIÊN!', 'big', 1.3); sfx('crack');
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
  if (code === 'KeyF' || code === 'KeyJ') mon.punchBoost = 0.5;
}
function keyUp(code) { keys[code] = false; }
addEventListener('blur', () => CTRL_KEYS.forEach(k => { keys[k] = false; }));
function updateMonster(dt) {
  if (!mon.ready) return;
  zombieAnimate(dt);
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
      const sprint = manual && !CONFIG.lockForward && fwd > 0 && (keys.ShiftLeft || keys.ShiftRight) && mon.stamina > 0.05;
      if (sprint) mon.stamina = Math.max(0, mon.stamina - dt * 0.35); else mon.stamina = Math.min(1, mon.stamina + dt * 0.15);
      const base = CONFIG.monsterSpeed * slimeFactor() * (1 - 0.6 * wind) * (time < mon.speedUntil ? 1.7 : 1);
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
    if (mon.y > 0.05) anim = 'Jump';
  }
  mon.x = clamp(mon.x, -LANE, LANE);
  mon.z = clamp(mon.z, HOUSE_FRONT + 0.6, START_Z + 1.5);
  if (state.phase === 'play') playAnim(anim, 0.18, ts); // ván vừa kết thúc trong khung hình này thì giữ hoạt ảnh nhảy múa/ngã
  applyMon();
}
function punchAt(target, dt) {
  if (mon.cur !== 'Punch') mon.attackT = 0.35;
  mon.attackT -= dt;
  if (mon.attackT > 0) return;
  mon.attackT = CONFIG.punchEvery * (mon.punchBoost > 0 ? 0.5 : 1);
  const hitPos = new V3(mon.x, mon.gy + 1.4, mon.z - 0.8);
  sfx('punch'); camShake = Math.max(camShake, 0.12);
  if (target && target.kind === 'fox') { foxPunched(target); return; }
  if (target) {
    target.hp -= CONFIG.punchDmg;
    puff(hitPos, { color: 0xfff2c0, n: 3, size: 0.6, add: true, life: 0.25 });
    debris(hitPos, target.debrisColor || 0x8a5a2a, 3, 0.12, 4);
    popText(hitPos.clone().setY(2.4), 'RẦM!', 'info', 0.6);
    if (target.bar) target.bar.style.width = Math.max(0, 100 * target.hp / target.maxHp) + '%';
    if (target.hp <= 0) breakItem(target);
    return;
  }
  // đấm cửa
  door.hp -= CONFIG.punchDmg; door.shake = 0.25; sfx('crack');
  const dp = new V3(rand(-0.45, 0.45), rand(1.0, 2.2), HOUSE_FRONT + 0.3);
  debris(dp, 0x7a4423, 4, 0.14, 5); puff(dp, { color: 0xd8c6a0, n: 3, size: 0.8, life: 0.6 });
  popText(dp.clone().setY(4), '-' + CONFIG.punchDmg, 'dmg');
  if (door.hp <= 0) { door.hp = 0; endRound('monster'); }
}
function groundY(x, z) { if (Math.abs(x) > 50) return 0; if (z > 1 && z < 4.6) return 0.14; if (Math.abs(x) > 1.6) return 0; if (z < HOUSE_FRONT + 0.88) return 0.7 * HS; if (z < HOUSE_FRONT + 1.4) return 0.35 * HS; return 0; }
function updateLift(dt) {
  const L = mon.lift; L.t += dt;
  if (L.phase === 'rise') { mon.y += (5.5 - mon.y) * Math.min(1, dt * 2.5); if (L.t > 1.2) L.phase = 'drift'; }
  else if (L.phase === 'drift') {
    mon.y = 5.5 + Math.sin(time * 2) * 0.3; mon.z += 7 * dt; mon.x += (0 - mon.x) * dt;
    if (mon.z >= L.toZ || L.t > 6) { L.phase = 'fall'; mon.vy = 0; popBalloons(L.item); }
  } else {
    mon.vy -= 26 * dt; mon.y += mon.vy * dt;
    if (mon.y <= 0) { mon.y = 0; mon.lift = null; puff(new V3(mon.x, 0.3, mon.z), { color: 0xd8c6a0, n: 10, size: 1.2, speed: 4, life: 0.8 }); sfx('thud'); hitMonster(60, 0, L.item.owner, { stun: 1.2, text: 'RẦM!', unblockable: true }); }
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
  if (!['slime', 'pebble', 'mine'].includes(kind)) addOutline(g, 0.022, 0.12);
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
  for (let i = 0; i < 5; i++) { const sp = sph(0.03, MS(0x9c6a36, 0.6), rand(-0.45, 0.45), rand(-0.3, 0.3), rand(-0.4, -0.2), roll); sp.scale.z = 0.4; }   // mắt khoai sau lưng
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
  } else {
    const m = new THREE.Mesh(geo('rockp', () => blobGeo(1, 0.2, 5.5)), new THREE.MeshStandardMaterial({ map: rockTex, roughness: 0.95, flatShading: true }));
    m.scale.set(0.8, 0.6, 0.7); put(m, 0, 0.45, 0, g);
  }
  return g;
}
const PROP_INFO = { pumpkin: { hp: 80, color: 0xe8761e }, snowman: { hp: 120, color: 0xf6f9fc }, rock: { hp: 120, color: 0x8b8a86 } };
function placeProp(kind) {
  for (let k = 0; k < 25; k++) {
    const x = rand(-LANE + 0.6, LANE - 0.6), z = rand(HOUSE_FRONT + 6, START_Z - 9);
    if (items.some(i => !i.dead && (i.kind === 'mine' || i.kind === 'prop') && Math.hypot(i.g.position.x - x, i.g.position.z - z) < 3.5)) continue;
    const info = PROP_INFO[kind] || PROP_INFO.rock;
    const it = newItem('prop', MINE_OWNER, mkProp(kind), { noLabel: true, blocker: true, hp: info.hp, maxHp: info.hp, halfW: 0.6, halfD: 0.55, debrisColor: info.color });
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
const SPAWN = {
  rose: u => (Math.random() < 0.6 ? SPAWN.potato(u) : SPAWN.barrel(u)),
  plant: u => spawnObstacleFromDoor('plant', u, mkShooter, { blocker: true, hp: 80, maxHp: 80, halfW: 0.45, halfD: 0.45, labelY: 2.0, debrisColor: 0x5ccf3e, minA: 6, maxA: 14, onPath: 0.35, spin: 0 }),
  potato: u => {
    const it = newItem('potato', u, mkPotato(), { labelY: 1.1 });
    launch(it, DOOR_POS(), new V3(rand(-1.2, 1.2), 0.4, HOUSE_FRONT + 3), 0.6, 5); openDoor(); sfx('whoosh');
  },
  xbarrel: u => spawnObstacleFromDoor('xbarrel', u, mkXBarrel, { labelY: 1.6, minA: 2.5, maxA: 6, onPath: 0.9, spin: 6 }),
  barrel: u => Math.random() < CONFIG.xbarrelChance ? SPAWN.xbarrel(u) : spawnObstacleFromDoor('barrel', u, mkBarrel, { blocker: true, hp: 80, maxHp: 80, halfW: 0.6, halfD: 0.6, labelY: 1.6, debrisColor: 0x9a5f2c }),
  fence: u => spawnObstacleFromDoor('fence', u, mkFence, { blocker: true, hp: 160, maxHp: 160, halfW: 6.4, halfD: 0.3, labelY: 1.9, debrisColor: 0xf4efe4, minA: 5, maxA: 9, spin: 0, onPath: 0 }),
  trap: u => spawnObstacleFromDoor('trap', u, mkTrap, { labelY: 0.6, minA: 3.5, maxA: 9, onPath: 0.85, spin: 4 }),
  slime: u => spawnObstacleFromDoor('slime', u, mkSlimeBlob, { labelY: 0.8, minA: 3, maxA: 8, onPath: 0.8, spin: 3 }),
  flower: u => { spawnObstacleFromDoor('flower', u, mkFlower, { labelY: 3.0, minA: 3, maxA: 6, onPath: 0.9, spin: 0 }); },
  lightning: u => startLightning(u),
  // mìn đất do người xem tặng: bay ra từ cửa, cắm xuống đất phía trước quái (3 quả)
  mine: u => { for (let i = 0; i < 3; i++) later(i * 0.3, () => { if (state.phase === 'play') SPAWN.mine1(u); }); },
  mine1: u => spawnObstacleFromDoor('mine', u, mkMine, { labelY: 0.9, minA: 4, maxA: 18, onPath: 0.6, spin: 6 }),
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
    banner('🪨 TẢNG ĐÁ KHỔNG LỒ!', esc(u.name) + ' lăn đá đè quái');
  },
  balloon: u => {
    if (mon.lift || items.some(i => !i.dead && i.kind === 'balloon')) { queueAction('bomb', u); return; }
    const it = newItem('balloon', u, mkBalloons(), { labelY: 1.4 });
    const from = DOOR_POS(); it.g.position.copy(from); it.state = 'seek'; openDoor(); sfx('whoosh');
    banner('🎈 BÓNG BAY!', esc(u.name) + ' kéo quái bay về');
  },
  fox: u => {
    const f = mkFox(); const it = newItem('fox', u, f.g, { labelY: 1.5, mixer: f.mixer, life: 12, hits: 0 });
    it.g.position.set(rand(-0.4, 0.4), 0, HOUSE_FRONT + 0.8); it.state = 'run'; openDoor(); sfx('bite');
  },
  pebble: u => {
    const it = newItem('pebble', u, mkPebble(), { labelY: 0.6, silent: true });
    it.label.style.visibility = 'hidden';
    const from = new V3(pick([-3.6, 3.6]) + rand(-0.4, 0.4), 2.7, HOUSE_FRONT + 0.3);
    const T = flyTime(from, mon.root.position, 24), to = predictMon(T);
    launch(it, from, to, T, 10); it.thrown = { dmg: 2, knock: 0.08 };
  },
  slipper: u => {
    const it = newItem('slipper', u, mkSlipper(), { labelY: 0.8 });
    const from = DOOR_POS(), T = flyTime(from, mon.root.position, 20), to = predictMon(T);
    launch(it, from, to, T, 0); it.thrown = { dmg: 6, knock: 0.35, text: 'BỘP!' }; openDoor(0.5); sfx('whoosh');
  },
};
function breakItem(it) {
  if (it.dead) return;
  const p = it.g.position.clone().setY(0.7);
  if (it.kind === 'barrel') { debris(p, 0x9a5f2c, 12, 0.2, 6); debris(p, 0x3a3a3a, 3, 0.12, 5); }
  else if (it.kind === 'fence') { for (let x = -5; x <= 5; x += 2.5) debris(new V3(x, 0.8, p.z), 0xf4efe4, 5, 0.2, 6); }
  else debris(p, it.debrisColor || 0x888888, 8, 0.15, 5);
  puff(p, { color: 0xd8c6a0, n: 6, size: 1.2, speed: 3, life: 0.8 });
  sfx('crack'); removeItem(it);
}
function removeItem(it) {
  if (it.dead) return; it.dead = true; scene.remove(it.g); it.label.remove();
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
      hitMonster(it.thrown.dmg, it.thrown.knock, it.owner, { text: it.thrown.text });
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
      p.y = 0.58 + Math.abs(Math.sin(it.t * 9)) * it.hop * Math.min(1, it.speed / 6);
      ud.yaw.rotation.y = it.head;
      ud.yaw.rotation.z = Math.sin(it.t * 11) * 0.28;
      ud.roll.rotation.x += it.speed * dt / 0.58;
      it.speed = Math.max(3.2, it.speed - dt * (it.hit ? 1.2 : 0.3));
      if (Math.random() < dt * 8) puff(new V3(p.x, 0.1, p.z), { color: 0xd8c6a0, n: 1, size: 0.45, speed: 0.6, life: 0.5 });
      const dz = mon.z - p.z;
      if (!it.aiSeen && dz < 6 && dz > 0) { it.aiSeen = true; if (!manual && autoDodge && Math.random() < 0.3) it.aiJump = true; }
      if (it.aiJump && dz < 1.6 && dz > 0) { it.aiJump = false; monJump(); }
      if (!it.hit && Math.hypot(p.x - mon.x, p.z - mon.z) < 1.2 && mon.y < 0.85 && !mon.lift && !mon.carry) {
        it.hit = true; hitMonster(18, 2.5, it.owner, { text: 'BỐP!' }); sfx('bonk');
        it.head = (Math.random() < 0.5 ? -1 : 1) * rand(0.5, 1.0); it.speed *= 0.6;   // bật lệch sang bên, vẫn lăn tiếp về đầu đường
        puff(p.clone(), { color: 0xd8c6a0, n: 5, size: 0.8, speed: 3 });
      }
      for (const o of items) if (o !== it && !o.dead && o.blocker && o.state === 'set' && Math.abs(o.g.position.z - p.z) < o.halfD + 0.4 && Math.abs(o.g.position.x - p.x) < o.halfW + 0.4) { it.head += rand(1.6, 2.6) * (Math.random() < 0.5 ? -1 : 1); p.x += Math.sin(it.head) * 0.5; p.z += Math.cos(it.head) * 0.5; sfx('bonk'); break; }
      if (p.z >= it.endZ) { p.z = it.endZ; restPotato(it); }   // lăn tới cuối đường (cột mốc) thì nằm lại
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
        if (mon.carry === it) { mon.z = p.z + 2.9; mon.y = 0.4; if (mon.z >= START_Z) { mon.carry = null; mon.y = 0; mon.kv = 4; mon.stun = 1.2; } }
        if (p.z > START_Z + 18) { if (mon.carry === it) mon.carry = null; removeItem(it); }
      }
    }
    else if (it.kind === 'balloon') {
      const L = it.g.userData.line, lp = L.geometry.attributes.position;
      if (it.state === 'seek') {
        const tgt = new V3(mon.x, mon.y + mon.gy + MON_H + 1.2, mon.z);
        const d = tgt.clone().sub(p), dist = d.length();
        p.addScaledVector(d.normalize(), Math.min(dist, 22 * dt));
        if (dist < 0.4) { it.state = 'lift'; mon.lift = { item: it, t: 0, phase: 'rise', toZ: Math.min(mon.z + 24, START_Z) }; mon.kv = 0; mon.stun = 0; sfx('power'); popText(new V3(mon.x, mon.y + 3.5, mon.z), 'BAY VỀ!', 'big', 1.2); }
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
        if (it.cd <= 0) { it.cd = 0.6; hitMonster(9, 0.1, it.owner, Math.random() < 0.3 ? { text: 'CẮN!' } : {}); sfx('bite'); }
        if (it.t > it.life || mon.lift || mon.carry) { it.state = 'flee'; it.vel.set(rand(-2, 2), 6, -6); }
      } else if (it.state === 'flee') {
        it.vel.y -= G * dt; p.addScaledVector(it.vel, dt); if (p.y < 0) { p.y = 0; it.vel.y = 0; it.vel.x *= 0.9; }
        it.g.rotation.y = Math.atan2(it.vel.x, it.vel.z);
        it.fade = (it.fade || 0) + dt; if (it.fade > 1.6) { puff(p.clone().setY(0.5), { n: 6, size: 1 }); removeItem(it); }
      }
    }
    else if (it.state === 'set') {
      if (it.squash > 0) { it.squash -= dt; const k = it.squash / 0.25; it.g.scale.set(1 + 0.25 * k, 1 - 0.3 * k, 1 + 0.25 * k); } else if (it.kind !== 'slime' && it.kind !== 'xbarrel' && !it.wilt) it.g.scale.setScalar(1);
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
        p.y = it.restT > 25 ? p.y - dt * 0.5 : 0.58;
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
    door.hp = Math.min(door.maxHp, door.hp + 150); openDoor(0.4); sfx('heal'); addPoints(u, 30);
    const dp = new V3(0, 1.8, HOUSE_FRONT + 0.45);
    puff(dp, { color: 0x7dff6a, n: 10, size: 0.7, speed: 3, add: true, life: 0.8, tex: starTex }); popText(dp.clone().setY(4.4), '+150 🔧', 'heal');
    return;
  }
  if (a === 'shoes') { mon.speedUntil = time + 10; sfx('power'); popText(new V3(mon.x, mon.y + 3.6, mon.z), '👟 TĂNG TỐC!', 'info', 1.2); return; }
  if (a === 'shield') { mon.shieldHp = CONFIG.shieldHits; mon.shieldMesh.visible = true; sfx('power'); popText(new V3(mon.x, mon.y + 2.6, mon.z), '🚪 KHIÊN CỬA!', 'info', 1.2); return; }
  if (a === 'time') { state.roundT += 20; sfx('heal'); popText(new V3(mon.x, mon.y + 3.6, mon.z), '⏳ +20 giây', 'heal'); puff(new V3(mon.x, mon.y + 1.6, mon.z), { color: 0x7dff6a, n: 8, tex: starTex, add: true, size: 0.5, speed: 3 }); return; }
  if (state.phase !== 'play') return;
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
const LIMIT = { mine: 5, xbarrel: 20, flower: 4, lightning: 3, boulder: 2, balloon: 2, fox: 5, bomb: 8, repair: 20, shoes: 1, shield: 1, time: 5, plant: 6 };
function onGift(user, giftName, count, coins, forced) {
  const g = forced ? ALL_GIFTS.find(a => a.action === forced) : findGift(giftName);
  const action = forced || (g ? g.action : actionByCoins(coins || 1));
  const total = (coins || g?.coins || 1) * count;
  addPoints(user, total * 10);
  showFeed(user, `đã gửi ${giftName || g?.gift || 'quà'}`, count, g ? g.emoji : '🎁');
  if (total >= 99) gBanner(user, giftName || g?.gift || 'quà', g ? g.label : '');
  const n = Math.min(count, LIMIT[action] || 40);
  for (let i = 0; i < n; i++) queueAction(action, user);
}
let likeShown = 0;
function onLike(user, count) {
  addPoints(user, count);
  for (let i = 0; i < Math.min(count, 15); i++) queueAction('pebble', user);
  if (performance.now() - likeShown > 3000) { likeShown = performance.now(); showFeed(user, 'thả tim → ném sỏi', count, '❤️'); }
}
function onComment(user) { addPoints(user, 3); queueAction('slipper', user); }
function onFollow(user) { addPoints(user, 30); showFeed(user, 'đã follow → hàng rào', 1, '➕'); queueAction('fence', user); }
function onShare(user) { addPoints(user, 30); showFeed(user, 'đã chia sẻ → mìn nổ', 1, '↗️'); queueAction('bomb', user); }

// =====================================================================
// Ván chơi
// =====================================================================
function setPhase(p, t) { state.phase = p; state.t = t; }
function startIntro() {
  setPhase('intro', 3.6); state.count = 4;
  for (let i = 0; i < (T.props || 0); i++) placeProp(T.prop);
  mon.cur = ''; playAnim('Idle');
}
function endRound(who) {
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
    banner('💥 PHÁ ĐƯỢC CỬA RỒI!', 'Zombie vào nhà ăn não...');
    setPhase('end', 999); startWinCut();
  } else {
    state.win--;
    banner('⏰ HẾT GIỜ! KHÁN GIẢ BẢO VỆ THÀNH CÔNG!', mvpName ? `MVP: ${esc(mvpName)}` : 'Ngôi nhà an toàn!');
    mon.cur = ''; playAnim('Death', 0.15); sfx('win');
    for (let i = 0; i < 10; i++) later(i * 0.2, () => puff(new V3(mon.x + rand(-4, 4), rand(3, 7), mon.z - rand(2, 8)), { color: pick([0xffd84a, 0xff5a7a, 0x7dff6a, 0x7fc8ff]), n: 8, size: 0.4, speed: 5, add: true, tex: starTex, grav: 4 }));
  }
  mon.lift = null; mon.carry = null;
}
function resetRound() {
  state.round = (state.round || 1) + 1;
  if (state.nextMap != null && state.nextMap !== state.map) buildMap(state.nextMap);
  state.nextMap = null;
  for (const it of items) removeItem(it); items.length = 0;
  Object.assign(mon, { charT: 0, flip: null, windLean: 0, x: 0, y: 0, gy: 0, z: START_Z, vy: 0, kv: 0, stun: 0, lift: null, carry: null, avoid: null, speedUntil: 0, armorUntil: 0, stamina: 1, yaw: 0, yawT: 0, jerk: 0, shieldHp: 0 });
  if (mon.shieldMesh) mon.shieldMesh.visible = false;
  state.roundT = CONFIG.roundSeconds;
  door.maxHp = CONFIG.doorHp; door.hp = CONFIG.doorHp; door.broken = false; door.pivot.visible = true;
  roundPts.clear(); actionQueue.length = 0;
  for (const L of bolts) { scene.remove(L.cloud); if (L.bolt) scene.remove(L.bolt); } bolts.length = 0;
  camPos.set(0, 5, START_Z + 10); camLook.set(0, 2, START_Z - 12);
  startIntro();
}
let smokeT = 0;
function updatePhase(dt) {
  smokeT -= dt;
  if (smokeT <= 0 && state.phase !== 'loading') {                               // khói ống khói
    smokeT = 0.35;
    puff(new V3(4.5 * HS, 11.4 * HS, HOUSE_FRONT - 5 * HS - 1.8 * HS), { color: 0xe6e6e6, n: 1, size: 0.9, speed: 0.25, up: 1.5, grav: -0.5, life: 3.2, grow: 3, opacity: 0.32 });
  }
  for (let i = timers.length - 1; i >= 0; i--) if (time >= timers[i].t) { const f = timers[i].fn; timers.splice(i, 1); f(); }
  if (state.phase === 'intro') {
    state.t -= dt;
    const c = Math.ceil(state.t - 0.6);
    if (c !== state.count) { state.count = c; if (c > 0) { banner(String(c), `Ván ${state.round || 1} • 🗺️ Map ${state.map + 1}: ${T.name} • ${T.length}m`); sfx('beep'); } else { banner('PHÁ NHÀ!', ''); sfx('go'); } }
    if (state.t <= 0) setPhase('play', 0);
  } else if (state.phase === 'play') {
    state.roundT -= dt;
    if (state.roundT <= 0) { state.roundT = 0; endRound('viewers'); }
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
  const k = door.hp / door.maxHp; door.mat.color.setRGB(0.55 + 0.45 * k, 0.45 + 0.55 * k, 0.4 + 0.6 * k);
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
    if (mon.z < HOUSE_FRONT - 0.3) mon.root.visible = false;
    if (C.t > 1.7) {
      C.stage = 'eat'; C.t = 0; room.g.visible = true; mon.root.visible = true;
      mon.x = ROOM.x; mon.z = ROOM.z + 1.12; mon.y = 0; mon.gy = 0; room.brain.scale.set(0.2, 0.13, 0.16);
      mon.cur = ''; playAnim('Eat'); popText(new V3(mon.x, 2.3, mon.z - 0.4), '😋 Ăn não...', 'info', 1.4);
    }
  } else if (C.stage === 'eat') {                                  // ngồi ăn não
    const k = Math.max(0.05, 1 - C.t / 3.4); room.brain.scale.set(0.2 * k, 0.13 * k, 0.16 * k);
    C.munch = (C.munch || 0) - dt; if (C.munch <= 0) { C.munch = 0.32; sfx('bite'); puff(new V3(ROOM.x + rand(-0.1, 0.1), 1.0, ROOM.z + 0.45), { color: 0xf28fb0, n: 2, size: 0.12, speed: 1.5, life: 0.5, grav: 3 }); }
    if (C.t > 3.8) {
      C.stage = 'cheer'; C.t = 0; mon.z = ROOM.z + 1.75; mon.cur = ''; playAnim('Cheer');
      state.win++; const w = $('win'); w.classList.remove('bump'); void w.offsetWidth; w.classList.add('bump');
      popText(new V3(mon.x, MON_H + 0.7, mon.z), '🧠 NÃO!!!', 'big', 2.2);
      banner('🧠 NÃO NGON QUÁ!', `${esc(CONFIG.streamerName)} +1 WIN • Sang map: ${MAPS[state.nextMap].name}`); sfx('lose');
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
  clearTimeout(camHintT); camHintT = setTimeout(() => { h.textContent = hintText(); }, 2500);
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
  const chip = (g, cls) => `<div class="chip ${cls || ''}"><em>${g.emoji}</em><div>${esc(g.gift)}<small>${esc(g.label)}</small></div></div>`;
  // Đã gán quà trong app → hiện tên quà thật đã gán
  const named = g => { const m = (CONFIG.giftMap || {})[g.action] || []; const n = m.map(x => x && x.giftName).filter(Boolean); return n.length ? { ...g, gift: n.slice(0, 2).join(', ') } : g; };
  $('heroList').innerHTML = HEROES.map(g => chip(named(g), 'hero')).join('');
  $('villList').innerHTML = [...VILLAINS.map(named), ...SOCIAL].map(g => chip(g)).join('');
}
let boardT = 0;
const doorLabel = makeLabel('dlab'); doorLabel.innerHTML = '<div class="dt">🚪 CỬA NHÀ</div><div class="dhp"><i></i></div>';
const doorBarEl = doorLabel.querySelector('i');
function updateHud(dt) {
  $('winN').textContent = state.win; $('winT').textContent = CONFIG.winTarget;
  const dk = door.hp / door.maxHp, rt = Math.max(0, Math.ceil(state.roundT));
  $('timerN').textContent = `${Math.floor(rt / 60)}:${String(rt % 60).padStart(2, '0')}`;
  $('timerN').parentElement.classList.toggle('low', rt <= 20 && state.phase === 'play');
  $('distN').textContent = Math.max(0, Math.round(mon.z - HOUSE_FRONT - 1.3));
  if (mon.ready) {
    mon.bf.textContent = (time < mon.speedUntil ? '👟' : '') + (mon.shieldHp > 0 ? '🚪' + mon.shieldHp : '') + (mon.stun > 0 && state.phase === 'play' ? '💫' : '');
    placeEl(mon.label, mon.x, mon.y + mon.gy + MON_H + 0.45, mon.z, 12, 0.6, 1.2);
  }
  doorBarEl.style.width = (dk * 100) + '%';
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
  if (Number(c.qvDoorHp) > 0) CONFIG.doorHp = Math.max(100, Number(c.qvDoorHp));
  if (Number(c.qvRoundSeconds) > 0) CONFIG.roundSeconds = Math.max(30, Number(c.qvRoundSeconds));
  CONFIG.lockJump = !!c.qvLockJump; CONFIG.lockForward = !!c.qvLockForward;
  autoDodge = c.qvAutoDodge !== false; soundOn = c.qvSound !== false;
  CONFIG.giftMap = c.qvGiftMap && typeof c.qvGiftMap === 'object' ? c.qvGiftMap : {};
  if (typeof c.qvZombieModel === 'string' && c.qvZombieModel && c.qvZombieModel !== CONFIG.zombieModel && !Q.get('zm')) {
    lsSet('qv_zm', c.qvZombieModel); location.reload(); return;   // đổi nhân vật → nạp lại overlay với mô hình mới
  }
  document.body.style.visibility = c.enabled === false ? 'hidden' : '';
  if (!appCfgSeen) {
    appCfgSeen = true;
    const sm = clamp((Number(c.qvStartMap) || 1) - 1, 0, MAPS.length - 1);
    if (!Q.get('map') && sm !== state.map) { if (state.phase === 'loading') buildMap(sm); else { state.nextMap = sm; resetRound(); } }
  }
  if (state.phase === 'loading' || state.phase === 'intro') { door.maxHp = door.hp = CONFIG.doorHp; state.roundT = CONFIG.roundSeconds; }
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
    if (p.action === 'like') onLike(u, 15); else if (p.action === 'comment') onComment(u); else if (p.action === 'follow') onFollow(u); else if (p.action === 'share') onShare(u);
    else { const gg = ALL_GIFTS.find(a => a.action === p.action); if (gg) onGift(u, gg.gift, Math.max(1, Number(p.count) || 1), gg.coins, gg.action); else if (SPAWN[p.action]) queueAction(p.action, u); }
  }
}
function connectApp() {
  const socket = window.io({ reconnection: true, reconnectionDelay: 600, reconnectionDelayMax: 5000 });
  socket.on('connect', async () => {
    setConn(true, '● Đã nối app HP Action LIVE');
    try { const r = await fetch('/api/games/quaivat/config'); if (r.ok) applyServerConfig(await r.json()); } catch {}
    socket.emit('subscribe', 'overlay');
  });
  socket.on('disconnect', () => setConn(false, '● Mất kết nối app (đang thử lại...)'));
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
    if (ev === 'like') onLike(u, 15); else if (ev === 'comment') onComment(u, 'cố lên'); else if (ev === 'follow') onFollow(u); else onShare(u);
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
  $('lockJump').checked = CONFIG.lockJump; $('lockFwd').checked = CONFIG.lockForward;
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
  else if (r < 0.4) onComment(u, 'hay quá');
  else if (r < 0.44) onFollow(u);
  else {
    const pool = [['rose', 24], ['xbarrel', 8], ['trap', 12], ['tire', 14], ['slime', 8], ['repair', 6], ['fox', 5], ['mine', 4], ['flower', 5], ['lightning', 2.5], ['balloon', 1.5], ['boulder', 0.7], ['shoes', 3], ['shield', 2], ['time', 2], ['plant', 8]];
    let x = Math.random() * pool.reduce((s, p) => s + p[1], 0), k = 0; while (x > pool[k][1]) { x -= pool[k][1]; k++; }
    const g = ALL_GIFTS.find(a => a.action === pool[k][0]); onGift(u, g.gift, k < 4 ? pick([1, 1, 2, 3]) : 1, g.coins);
  }
}

// =====================================================================
// Vòng lặp
// =====================================================================
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  if (state.phase !== 'loading') {
    let gdt = dt; if (hitStop > 0) { hitStop -= dt; gdt = 0; }               // khựng hình khi trúng đòn mạnh
    updateDemo(gdt); updateQueue(gdt); updatePhase(gdt); updateMonster(gdt); updateItems(gdt); updatePeas(gdt); updateBolts(gdt); updateCamera(dt);
  }
  updateFx(dt); updatePops(dt); updateHud(dt);
  WIND.value = time;
  if (composer) composer.render(); else renderer.render(scene, camera);
  requestAnimationFrame(frame);
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
window.__game = { get foxGltf() { return foxGltf; }, zombieAnimate, renderer, THREE, scene, camera, state, mon, door, items, onGift, onLike, onFollow, onShare, onComment, onLiveMessage, actionQueue, runAction };
