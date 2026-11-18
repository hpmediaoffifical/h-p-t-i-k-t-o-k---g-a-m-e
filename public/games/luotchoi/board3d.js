/* 🎲 Đấu Trường Mini — bàn chơi 3D (Three.js r160 dùng chung public/games/quaivat/vendor/, nền trong suốt cho OBS).
 *
 * window.LcBoards3D.render(stage, board, { boardId, marks, colorOf }) — cùng chữ ký LcBoards (2D) để overlay.js đổi qua lại.
 *  - Giữ 1 cảnh / 1 canvas trong #stage. boardId đổi (bàn mới) → dựng lại hình; cùng boardId → so khác biệt với lần
 *    trước rồi CHẠY HOẠT CẢNH (ấn răng, cắm que, rút thanh, lật thẻ, ngoạm, dê nhảy, tháp đổ).
 *  - Mỗi ô có 1 điểm neo HTML [data-n] đặt đúng vị trí chiếu ra màn hình → overlay.js cho tay bay tới + dán nhãn tên.
 *  - Chỉ vẽ khi có hoạt cảnh (render theo nhu cầu) → nhẹ cho OBS. Tháp lung lay thì vẽ liên tục ~30 khung/giây.
 *  - Máy không có WebGL → không đặt LcBoards3D.ready, overlay giữ bản 2D (boards.js).
 * Gỡ lỗi / chụp ảnh trong khung xem thử không có rAF: window.__lc3d.step(ms) tua đồng hồ hoạt cảnh.
 * Hình tự dựng bằng khối cơ bản + chất liệu PBR (ánh sáng môi trường RoomEnvironment), không dùng ảnh/model ngoài. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const FONT = "700 {s}px LcFont, 'Be Vietnam Pro', 'Segoe UI', sans-serif";
const font = (s) => FONT.replace('{s}', s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = {
    out: (k) => 1 - Math.pow(1 - k, 3),
    inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    in: (k) => k * k * k,
    back: (k) => { const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); }
};
const hash = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };

// ── renderer / cảnh chung ──────────────────────────────────────────────────
let renderer = null, scene, camera, pmrem, keyLight, ground;
let W = 908, H = 700;
let root = null, game = null, boardId = null, lastBoard = null;
let canvas = null, layer = null, meterEl = null, hostStage = null;
const tweens = [];
let updaters = [];   // hàm chạy mỗi khung (vật lý tháp đổ, lung lay)
let skew = 0, scheduled = false, dirty = true, lastFrame = 0;
const now = () => performance.now() + skew;

function init() {
    canvas = document.createElement('canvas');
    canvas.className = 'lc3-canvas';
    try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    } catch (e) { renderer = null; return false; }
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
    keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
    keyLight.position.set(3.5, 8, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    Object.assign(keyLight.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
    keyLight.shadow.bias = -0.0006;
    keyLight.shadow.radius = 5;
    scene.add(keyLight, keyLight.target);
    scene.add(new THREE.HemisphereLight(0xe6eeff, 0x3b2a44, 0.45));
    // mặt bàn vô hình: chỉ nhận bóng → vật "đứng" trên nền trong suốt của OBS
    ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.34 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    layer = document.createElement('div');
    layer.className = 'lc3-layer';
    meterEl = document.createElement('div');
    meterEl.className = 'tt-meter lc3-meter';
    return true;
}

function resize(stage) {
    const w = stage.clientWidth || 908, h = stage.clientHeight || 700;
    if (w === W && h === H && renderer.domElement.width === w) return;
    W = w; H = h;
    renderer.setSize(W, H, false);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
}

// ── vòng vẽ theo nhu cầu ──────────────────────────────────────────────────
function tween(ms, fn, ez, done) { tweens.push({ t0: now(), ms, fn, ez: ez || ease.out, done }); kick(); }
function kick() {
    dirty = true;
    if (scheduled) return;
    scheduled = true;
    let ran = false;
    requestAnimationFrame(() => { ran = true; frame(); });
    setTimeout(() => { if (!ran) frame(); }, 60);   // trang không có rAF (khung xem thử) vẫn vẽ
}
function frame() {
    scheduled = false;
    if (!renderer) return;
    const t = now();
    const dt = Math.min(0.05, Math.max(0, (t - (lastFrame || t)) / 1000));
    lastFrame = t;
    for (let i = tweens.length - 1; i >= 0; i--) {
        const tw = tweens[i];
        const k = clamp((t - tw.t0) / tw.ms, 0, 1);
        tw.fn(tw.ez(k));
        if (k >= 1) { tweens.splice(i, 1); if (tw.done) tw.done(); }
    }
    let keep = false;
    updaters = updaters.filter(u => { const r = u(dt, t); if (r) keep = true; return r !== false; });
    renderer.render(scene, camera);
    placeAnchors();
    dirty = false;
    if (tweens.length || keep) kick();
}
window.__lc3d = { step(ms) { skew += ms || 16; frame(); }, frame, get tweens() { return tweens.length; }, get root() { return root; } };

// ── chất liệu + chữ trên mặt vật (canvas texture, có bộ nhớ đệm) ─────────────
const texCache = new Map();
function canvasTex(key, w, h, draw, repeat) {
    if (texCache.has(key)) return texCache.get(key);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    texCache.set(key, t);
    return t;
}
function numberTex(n, fg, bg, ring) {
    return canvasTex('num:' + n + fg + bg + (ring || ''), 128, 128, (g, w, h) => {
        if (bg) { g.fillStyle = bg; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2); g.fill(); }
        if (ring) { g.strokeStyle = ring; g.lineWidth = 8; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 6, 0, Math.PI * 2); g.stroke(); }
        g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = font(String(n).length > 1 ? 64 : 76);
        g.fillText(String(n), w / 2, h / 2 + 5);
    });
}
// 🔊 âm thanh hiệu ứng (public/games/luotchoi/sfx.js) — chỉ phát khi đang diễn (animate), không phát lúc dựng lại cảnh
const sfx = (name, o) => { try { window.LcSfx && window.LcSfx.play(name, o); } catch (e) {} };
const decal = (tex, w, h, opacity) => new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: opacity ?? 1, depthWrite: false, toneMapped: false }));
const shadowed = (m) => { m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return m; };
const std = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.5, metalness: 0 }, o || {}));
const phys = (color, o) => new THREE.MeshPhysicalMaterial(Object.assign({ color, roughness: 0.32, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.25 }, o || {}));
const sphere = (mat, sx, sy, sz, seg) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, seg || 40, Math.round((seg || 40) * 0.7)), mat); m.scale.set(sx, sy, sz ?? sx); return m; };

// ── điểm neo HTML (data-n) cho tay bay vào + nhãn tên ─────────────────────
let anchors = [];   // { n, obj (Object3D), offset (Vector3), el }
const _v = new THREE.Vector3();
function setAnchors(list, marks, colorOf) {
    layer.innerHTML = '';
    tags = [];   // nhãn tên thuộc bàn/điểm neo cũ (đã xoá khỏi DOM ở trên) — syncTags dựng lại sau
    const mk = {};
    (marks || []).forEach(m => { mk[m.n] = m; });
    anchors = list.map(a => {
        const el = document.createElement('div');
        el.className = 'lc3-anchor';
        el.dataset.n = a.n;
        if (a.html) el.innerHTML = a.html;
        else if (mk[a.n]) el.innerHTML = tagHtml(mk[a.n], colorOf);
        layer.appendChild(el);
        return Object.assign({ el }, a);
    });
    placeAnchors();
}
function placeAnchors() {
    if (!anchors.length) return;
    camera.updateMatrixWorld();
    for (const a of anchors) {
        if (a.obj) { a.obj.updateWorldMatrix(true, false); _v.copy(a.offset || _v.set(0, 0, 0)).applyMatrix4(a.obj.matrixWorld); }
        else _v.copy(a.pos);
        _v.project(camera);
        const x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
        a.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
    if (tags.length) placeTags();
}
const escH = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function tagHtml(m, colorOf) {
    const color = colorOf ? colorOf(m.key || '') : '#4fb3ff';
    const name = Array.from(String(m.nickname || '')); const short = name.length > 7 ? name.slice(0, 6).join('') + '…' : name.join('');
    const av = m.avatar ? `<img src="${escH(m.avatar)}" alt="">` : escH((name[0] || '?').toUpperCase());
    return `<span class="lc-tag"><i style="background:${color}">${av}</i><em>${escH(short)}</em></span>`;
}

// 🔄 creator xoay mô hình (panel ⟲ ⊙ ⟳ → socket luotchoi:rotate): mỗi lần 45°, 0 = về chính diện. Chỉ trò có vật đứng
// (hà mã, núi đá, tháp); bàn phẳng (lật thẻ, Ô Ăn Quan) xoay sẽ ngược số → bỏ qua. Xoay xong xếp lại nhãn tên.
let spinY = 0, tagArgs = null;
const SPIN_KINDS = { hama: 1, chumcoc: 1, thaptre: 1 };
function rotate(dir, angleDeg) {
    if (!root || !SPIN_KINDS[game]) return;
    const to = angleDeg != null ? angleDeg * Math.PI / 180 : dir === 0 ? 0 : spinY + dir * Math.PI / 4;
    spinTo(to, angleDeg != null ? 140 : 650);
}
let spinTw = 0;
function spinTo(to, ms, done) {
    if (!root) { if (done) done(); return; }
    const from = root.rotation.y, my = ++spinTw, r = root;
    spinY = to;
    tween(ms, k => { if (my === spinTw && root === r) root.rotation.y = from + (to - from) * k; }, ease.inOut, () => { if (my === spinTw && tagArgs) syncTags(tagArgs[0], tagArgs[1]); kick(); if (done) done(); });
    kick();
}
// kéo chuột ngay trên overlay (OBS: chuột phải nguồn → Tương tác) → xoay mô hình
function bindDragSpin(el) {
    let x0 = null, a0 = 0;
    el.addEventListener('pointerdown', e => { if (!root || !SPIN_KINDS[game]) return; x0 = e.clientX; a0 = root.rotation.y; try { el.setPointerCapture(e.pointerId); } catch (er) {} });
    el.addEventListener('pointermove', e => { if (x0 == null || !root) return; root.rotation.y = spinY = a0 + (e.clientX - x0) * 0.012; kick(); });
    const end = () => { if (x0 == null) return; x0 = null; if (tagArgs) syncTags(tagArgs[0], tagArgs[1]); kick(); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
function disposeRoot() {
    if (hand3d) hand3d.visible = false;
    if (!root) return;
    scene.remove(root);
    root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); [].concat(o.material).forEach(m => { if (!m.userData.shared) m.dispose(); }); } });
    root = null;
    tweens.length = 0;
    updaters = [];
}
function frameCamera(pos, target, fov) {
    camera.fov = fov || 30;
    camera.position.copy(pos);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    keyLight.target.position.copy(target);
}

// ═════════════════════════════════════════════════════════════════════════
// 🦛 HÀ MÃ CẮN — đầu hà mã nhựa bóng, hàm trên bản lề phía sau, răng ngà xếp vòng quanh hàm dưới
// ═════════════════════════════════════════════════════════════════════════
// da hà mã: tím oải hương chuyển sắc + đốm nhạt + vùng sáng (tự vẽ canvas)
function hippoSkinTex() {
    return canvasTex('hipposkin', 512, 256, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, '#b9a6ee'); gr.addColorStop(0.5, '#9a84d8'); gr.addColorStop(1, '#7f69c2');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 60; i++) {
            const x = hash(i + 7) * w, y = hash(i + 13) * h, r = 3 + hash(i + 2) * 7;
            g.fillStyle = `rgba(${hash(i) > 0.5 ? '90,70,160' : '225,215,255'},${0.18 + hash(i + 5) * 0.2})`;
            g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        }
    });
}
const HM = {
    // Hà mã đồ chơi vinyl bóng: CẢ ĐẦU (mõm trên + sọ + mắt + tai) là nắp bản lề ngửa ra sau — đúng kiểu đồ chơi há miệng;
    // hàm dưới là cái bát có môi dày, lợi hồng chữ U, răng vuông bo góc có số trên mặt. Cả con hà mã lắc nhẹ khi chờ.
    RING: { rx: 1.6, rz: 1.27, y: 1.44 },
    build(b) {
        const g = new THREE.Group();
        const body = new THREE.Group(); g.add(body);   // phần lắc lư (nhãn tên + điểm neo đi theo)
        const skin = phys(0xa58cf0, { roughness: 0.28, clearcoat: 0.85, clearcoatRoughness: 0.18, sheen: 0.4, sheenColor: new THREE.Color(0xe6dcff) });
        const skinLight = phys(0xcbbcff, { roughness: 0.35, clearcoat: 0.6 });
        const skinDark = phys(0x7d63d0, { roughness: 0.4, clearcoat: 0.5 });
        const inside = std(0xe0507a, { roughness: 0.6, side: THREE.DoubleSide }), gum = phys(0xff8db0, { roughness: 0.35, clearcoat: 0.5 }), tongue = phys(0xff6d95, { roughness: 0.3, clearcoat: 0.6 });
        const white = phys(0xffffff, { roughness: 0.05, clearcoat: 1 }), pupil = phys(0x1c1433, { roughness: 0.05, clearcoat: 1 }), iris = phys(0x5a3fb8, { roughness: 0.1, clearcoat: 1 });
        const blush = std(0xff8fbd, { roughness: 0.8, transparent: true, opacity: 0.75 }), hole = std(0x3a2470, { roughness: 0.7 });
        // ── thân sau đầu (cổ + lưng) + 2 bàn chân trước có móng ──
        const torso = sphere(skin, 1.85, 1.25, 1.55); torso.position.set(0, 1.0, -1.85); body.add(torso);
        [-1, 1].forEach(s => {
            const foot = sphere(skinLight, 0.58, 0.42, 0.62); foot.position.set(1.62 * s, 0.4, 0.45); body.add(foot);
            for (let t = -1; t <= 1; t++) { const nail = sphere(white, 0.11, 0.08, 0.08); nail.position.set(1.62 * s + t * 0.2, 0.3, 1.0 - Math.abs(t) * 0.06); body.add(nail); }
            const ck = sphere(blush, 0.34, 0.2, 0.1); ck.position.set(1.62 * s, 1.0, 0.75); ck.rotation.y = 0.75 * s; body.add(ck);
        });
        // ── hàm dưới: bát + cằm + lòng miệng + lưỡi + lợi + môi dày ──
        const jaw = new THREE.Mesh(new THREE.SphereGeometry(1, 56, 28, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), skin);
        jaw.scale.set(1.95, 1.05, 1.6); jaw.position.y = 1.1; body.add(jaw);
        const chin = sphere(skinLight, 1.5, 0.5, 1.2); chin.position.set(0, 0.45, 0.32); body.add(chin);
        const cav = new THREE.Mesh(new THREE.CircleGeometry(1, 56), inside); cav.rotation.x = -Math.PI / 2; cav.scale.set(1.74, 1.42, 1); cav.position.y = 1.08; body.add(cav);
        const throat = sphere(inside, 1.5, 0.9, 0.4); throat.position.set(0, 1.4, -1.2); body.add(throat);
        const tg = sphere(tongue, 0.92, 0.22, 0.72); tg.position.set(0, 1.13, -0.12); body.add(tg);
        const tgLine = sphere(std(0xe0507a), 0.04, 0.02, 0.5); tgLine.position.set(0, 1.33, -0.1); body.add(tgLine);
        const ridge = new THREE.Mesh(new THREE.TorusGeometry(1, 0.14, 16, 96), gum); ridge.rotation.x = Math.PI / 2; ridge.scale.set(1.6, 1.27, 1); ridge.position.y = 1.18; body.add(ridge);
        const lip = new THREE.Mesh(new THREE.TorusGeometry(1, 0.22, 20, 96), skin); lip.rotation.x = Math.PI / 2; lip.scale.set(1.9, 1.55, 1); lip.position.y = 1.06; body.add(lip);
        // ── răng: khối vuông bo tròn, mặt trên phẳng in số ──
        const teeth = [];
        const ivory = phys(0xfffdf6, { roughness: 0.12, clearcoat: 1 }), ivoryDown = phys(0xd9d2c4, { roughness: 0.5, clearcoat: 0.1 }), red = phys(0xff3b4e, { clearcoat: 0.8, emissive: 0x551018 });
        const R = HM.RING;
        // vòng răng tối đa ~200° → răng đầu/cuối vẫn ở nửa trước, không bị nắp đầu che
        const span = Math.min(200, 110 + b.n * 10) * Math.PI / 180;
        const step = (span * 1.42) / Math.max(1, b.n - 1);
        const tw = clamp(step * 0.8, 0.28, 0.48), th = tw * 0.95;
        for (let i = 0; i < b.n; i++) {
            const a = Math.PI / 2 - span / 2 + span * (b.n === 1 ? 0.5 : i / (b.n - 1));
            const tooth = new THREE.Group(); tooth.position.set(R.rx * Math.cos(a), R.y, R.rz * Math.sin(a));
            tooth.rotation.y = -a + Math.PI / 2;
            const bd = new THREE.Mesh(new RoundedBoxGeometry(tw, th, tw * 0.82, 3, tw * 0.22), ivory); bd.castShadow = true;
            const lbl = decal(numberTex(i + 1, '#3b2a7a'), tw * 0.86, tw * 0.86); lbl.rotation.x = -Math.PI / 2; lbl.position.y = th / 2 + 0.006;
            tooth.add(bd, lbl); body.add(tooth);
            teeth.push({ n: i + 1, a, g: tooth, body: bd, lbl, baseY: R.y, pressed: false, th, tw });
        }
        // ── NẮP ĐẦU (bản lề phía sau): mõm trên + sọ tròn + mắt + tai + lỗ mũi + má + băng cá nhân ──
        const pivot = new THREE.Group(); pivot.position.set(0, 1.12, -1.25); body.add(pivot);
        const up = new THREE.Group(); up.position.z = 1.25; pivot.add(up);
        const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 56, 28, 0, Math.PI * 2, 0, Math.PI / 2), skin); shell.scale.set(1.95, 0.78, 1.6); up.add(shell);
        const roof = new THREE.Mesh(new THREE.CircleGeometry(1, 56), inside); roof.rotation.x = Math.PI / 2; roof.scale.set(1.74, 1.42, 1); roof.position.y = -0.02; up.add(roof);
        const ridge2 = ridge.clone(); ridge2.position.y = -0.06; up.add(ridge2);
        const lip2 = lip.clone(); lip2.position.y = 0; up.add(lip2);
        const skull = sphere(skin, 1.55, 1.15, 1.2); skull.position.set(0, 1.0, -0.85); up.add(skull);
        const snoutTop = sphere(skinLight, 1.25, 0.32, 0.9); snoutTop.position.set(0, 0.62, 0.45); up.add(snoutTop);
        // mắt to bóng: con ngươi lệch xuống-trước để khi nắp ngửa ra, mắt nhìn thẳng máy quay
        const look = new THREE.Vector3(0, -0.44, 0.9).normalize();
        [-1, 1].forEach(s => {
            const ec = new THREE.Vector3(0.62 * s, 1.72, -0.18);
            const lidM = sphere(skin, 0.5, 0.52, 0.44); lidM.position.copy(ec).add(new THREE.Vector3(0, 0.02, -0.06)); up.add(lidM);
            const e = sphere(white, 0.44, 0.47, 0.4); e.position.copy(ec); up.add(e);
            const ir = sphere(iris, 0.27, 0.29, 0.12); ir.position.copy(ec).addScaledVector(look, 0.36); ir.lookAt(ir.position.clone().add(look)); up.add(ir);
            const pu = sphere(pupil, 0.17, 0.19, 0.08); pu.position.copy(ec).addScaledVector(look, 0.41); pu.lookAt(pu.position.clone().add(look)); up.add(pu);
            const h1 = sphere(white, 0.08); h1.position.copy(ec).addScaledVector(look, 0.44).add(new THREE.Vector3(-0.09 * s, 0.1, 0)); up.add(h1);
            const h2 = sphere(white, 0.04); h2.position.copy(ec).addScaledVector(look, 0.44).add(new THREE.Vector3(0.08 * s, -0.08, 0)); up.add(h2);
            const brow = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 8, 24, Math.PI * 0.7), skinDark);
            brow.position.copy(ec).add(new THREE.Vector3(0.02 * s, 0.38, 0.24)); brow.rotation.set(-0.6, 0, Math.PI * 0.15 + (s > 0 ? 0.12 : -0.12)); up.add(brow);
            const ear = sphere(skin, 0.3, 0.36, 0.2); ear.position.set(1.15 * s, 2.0, -1.15); ear.rotation.z = -0.5 * s; up.add(ear);
            const earIn = sphere(blush, 0.17, 0.22, 0.08); earIn.position.set(1.15 * s, 2.0, -1.0); earIn.rotation.z = -0.5 * s; up.add(earIn);
            const nb = sphere(skinLight, 0.3, 0.17, 0.24); nb.position.set(0.5 * s, 0.86, 0.95); up.add(nb);
            const nh = sphere(hole, 0.11, 0.05, 0.075); nh.position.set(0.5 * s, 1.0, 1.0); nh.rotation.x = -0.4; up.add(nh);
            const ck = sphere(blush, 0.36, 0.2, 0.1); ck.position.set(1.45 * s, 0.42, 0.55); ck.rotation.y = 0.8 * s; up.add(ck);
        });
        // băng cá nhân dán trên má (đang đau răng)
        const band = new THREE.Group();
        const strip = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.2, 0.05, 2, 0.05), std(0xf7b98a, { roughness: 0.7 }));
        const pad = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.16, 0.06, 2, 0.03), std(0xfff3e2, { roughness: 0.8 }));
        const strip2 = strip.clone(); strip2.rotation.z = Math.PI / 2;
        band.add(strip, strip2, pad); band.position.set(-1.62, 0.55, 0.2); band.rotation.set(0, -1.0, 0.4);
        up.add(band);
        shadowed(g);
        teeth.forEach(t => { t.lbl.castShadow = false; t.lbl.receiveShadow = false; });
        [cav, roof].forEach(m => { m.castShadow = false; });
        // chờ chọn: lắc lư chậm + thở (dừng lúc tay đang bấm để tay trúng răng)
        const st = { g, body, teeth, pivot, mats: { ivory, ivoryDown, red }, t0: 0 };
        updaters.push((dt, t) => {
            if (!root || root !== g) return false;
            // khung game ẩn (tắt game) / trang ẩn → thôi ép vẽ liên tục (giữ hàm, lần kick sau chạy lại)
            if (document.hidden || (hostStage && hostStage.closest('.lc-hidden'))) return undefined;
            if (hand3d && hand3d.visible) return true;
            body.rotation.y = Math.sin(t * 0.0007) * 0.14;
            body.position.y = Math.sin(t * 0.0021) * 0.03;
            return true;
        });
        return st;
    },
    OPEN: -0.9,
    apply(st, b, prev, animate) {
        const used = new Set(b.used);
        for (const t of st.teeth) {
            const down = used.has(t.n);
            // ngoạm: cả hàm răng thụt hẳn xuống lợi để nắp đầu ngậm kín (răng vuông cao hơn vòm mõm ở phía trước)
            const lvl = b.sprung ? 2 : down ? 1 : 0;
            if (lvl !== t.lvl) {
                t.pressed = down; t.lvl = lvl;
                const y0 = t.g.position.y, y1 = t.baseY - [0, t.th * 0.55, t.th * 1.05][lvl];
                if (animate) tween(220, k => { t.g.position.y = y0 + (y1 - y0) * k; }, ease.back); else t.g.position.y = y1;
                t.body.material = down ? st.mats.ivoryDown : st.mats.ivory;
                t.lbl.material.opacity = down ? 0.35 : 1;
            }
            if (b.trap === t.n) t.body.material = st.mats.red;
        }
        const target = b.sprung ? -0.02 : HM.OPEN;
        if (Math.abs(st.pivot.rotation.x - target) > 0.01) {
            const r0 = st.pivot.rotation.x;
            if (animate && b.sprung) {
                // ngoạm: máy quay dí sát vào mặt rồi lùi lại
                sfx('chomp');
                tween(200, k => { st.pivot.rotation.x = r0 + (target - r0) * k; }, ease.in, () => { shake(root, 0.1, 420); zoomPunch(0.82, 900); });
            } else if (animate) tween(500, k => { st.pivot.rotation.x = r0 + (target - r0) * k; }, ease.inOut);
            else st.pivot.rotation.x = target;
        }
    },
    camera() { frameCamera(new THREE.Vector3(0, 8.0, 11.2), new THREE.Vector3(0, 2.0, -0.4), 29); },
    anchors(st) {
        const R = HM.RING;
        return st.teeth.map(t => ({
            n: t.n, obj: t.g, offset: new THREE.Vector3(0, t.th / 2 + 0.02, 0),
            // nhãn tên đặt NGOÀI vành môi theo tia từ tâm miệng qua răng (toạ độ trong nhóm lắc lư)
            ref: st.body, label: (k) => new THREE.Vector3(R.rx * k * Math.cos(t.a), R.y - 0.25, R.rz * k * Math.sin(t.a)),
            // chân que: mép ngoài mặt răng (không đè số)
            edge: () => { const k = 1 + t.tw * 0.5 / R.rx; return new THREE.Vector3(R.rx * k * Math.cos(t.a), t.g.position.y + t.th / 2, R.rz * k * Math.sin(t.a)); }
        }));
    }
};
// zoom nhanh vào tâm cảnh rồi trả về (dùng FOV để không lệch điểm neo)
function zoomPunch(f, ms) {
    const fov0 = camera.fov;
    tween(ms, k => { camera.fov = fov0 * (1 - (1 - f) * Math.sin(k * Math.PI)); camera.updateProjectionMatrix(); }, (k) => k, () => { camera.fov = fov0; camera.updateProjectionMatrix(); });
}

function shake(obj, amp, ms) {
    const x0 = obj.position.x;
    tween(ms, k => { obj.position.x = x0 + Math.sin(k * Math.PI * 7) * amp * (1 - k); }, (k) => k, () => { obj.position.x = x0; });
}

// ═════════════════════════════════════════════════════════════════════════
// 🐐 DÊ NÚI — mỏm đá núi góc cạnh, hốc có số, que tre cắm chéo, dê núi (con giáp 2027) bật ra từ hang trên đỉnh
// ═════════════════════════════════════════════════════════════════════════
function bambooTex() {
    return canvasTex('bamboo', 64, 512, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, 0);
        gr.addColorStop(0, '#6f9d2e'); gr.addColorStop(0.45, '#b7dc6a'); gr.addColorStop(1, '#5d8a24');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        for (let y = 90; y < h; y += 150) { g.fillStyle = '#4d7419'; g.fillRect(0, y, w, 10); g.fillStyle = '#d6ef9a'; g.fillRect(0, y + 10, w, 3); }
    });
}
// 🐐 DÊ CON (con giáp năm Đinh Mùi 2027) dựng thủ tục — ĐÚNG DÁNG DÊ: mặt dài nhọn hơi cúi, mõm thon, mắt hai bên đầu
// (tròng hổ phách, con ngươi NGANG như dê thật), tai dài chĩa ngang, sừng cong vút ra sau có vân, chòm râu cằm,
// thân lông ngắn mượt (không xoăn như cừu), chân thon móng chẻ, đuôi vểnh; vòng cổ đỏ chuông vàng (Tết).
// Gốc toạ độ ≈ giữa thân, móng chạm y ≈ −0.45 — mặt quay +Z về máy quay.
const GOAT_TURN = 0.6;   // dê đứng nghiêng 3/4 → thấy rõ mặt dài nhọn + sừng cong (nhìn thẳng thì mặt bị dồn ngắn)
function makeGoat() {
    const gltf = goatModel && goatModel.clone(true);
    if (gltf) return shadowed(gltf);
    const f = new THREE.Group();
    const coat = phys(0xf7f2ea, { roughness: 0.55, clearcoat: 0.25, sheen: 0.6, sheenColor: new THREE.Color(0xffffff) });
    const coatShade = phys(0xe9dfd0, { roughness: 0.6, clearcoat: 0.2 });
    const nose = phys(0xcfa79a, { roughness: 0.35, clearcoat: 0.5 });
    const hornM = phys(0xcf9a4c, { roughness: 0.32, clearcoat: 0.7 });
    const hoof = std(0x4a3a2e, { roughness: 0.45 });
    const white = phys(0xffffff, { roughness: 0.05, clearcoat: 1 }), dark = phys(0x16101c, { roughness: 0.05, clearcoat: 1 }), amber = phys(0xd9952b, { roughness: 0.12, clearcoat: 1 });
    const earIn = std(0xf3b0bf, { roughness: 0.7 }), pink = std(0xff9fbf, { roughness: 0.7, transparent: true, opacity: 0.7 });
    const red = phys(0xe0262f, { roughness: 0.35, clearcoat: 0.6 }), gold = phys(0xf2c14e, { roughness: 0.2, metalness: 0.7, clearcoat: 0.6 });

    // ── thân: bầu thuôn dọc (ngực trước to, hông sau), lông ngắn mượt ──
    const body = sphere(coat, 0.4, 0.34, 0.55); body.position.set(0, 0.0, -0.12); f.add(body);
    const chest = sphere(coat, 0.33, 0.33, 0.3); chest.position.set(0, 0.06, 0.22); f.add(chest);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 12), coat); tail.position.set(0, 0.22, -0.66); tail.rotation.x = -0.9; f.add(tail);
    // chân thon + móng chẻ đôi (2 nửa)
    [[-0.2, 0.26], [0.2, 0.26], [-0.19, -0.42], [0.19, -0.42]].forEach(([x, z]) => {
        const up = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.22, 14), coat); up.position.set(x, -0.2, z); f.add(up);
        const low = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.17, 14), coatShade); low.position.set(x, -0.36, z); f.add(low);
        [-1, 1].forEach(h => { const c = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.08), hoof); c.position.set(x + h * 0.022, -0.45, z + 0.01); f.add(c); });
    });
    // ── cổ vươn lên trước ──
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.42, 18), coat); neck.position.set(0, 0.34, 0.3); neck.rotation.x = 0.55; f.add(neck);

    // ── ĐẦU: sọ + mặt dài thuôn nhọn xuống mõm (nhóm đầu nghiêng cúi nhẹ) ──
    const head = new THREE.Group(); head.position.set(0, 0.62, 0.42); head.rotation.x = 0.32; f.add(head);
    const skull = sphere(coat, 0.21, 0.22, 0.23); skull.position.set(0, 0.04, -0.02); head.add(skull);
    // mặt dài: 3 khúc ellipsoid nhỏ dần ra phía mõm → thuôn nhọn
    [[0.17, 0.18, 0.2, 0.15], [0.135, 0.15, 0.17, 0.3], [0.1, 0.115, 0.13, 0.43]].forEach(([sx, sy, sz, z]) => {
        const m = sphere(coat, sx, sy, sz); m.position.set(0, -0.03 - z * 0.12, z); head.add(m);
    });
    const muz = sphere(nose, 0.085, 0.075, 0.07); muz.position.set(0, -0.09, 0.53); head.add(muz);   // đầu mõm hồng nâu
    [-1, 1].forEach(s => {
        const n = sphere(dark, 0.018, 0.012, 0.012); n.position.set(0.035 * s, -0.07, 0.595); n.rotation.z = 0.5 * s; head.add(n);   // lỗ mũi xiên
    });
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 16, Math.PI), dark); mouth.position.set(0, -0.135, 0.55); mouth.rotation.set(0.3, 0, Math.PI); head.add(mouth);
    // râu cằm: chòm lông nhọn rủ xuống dưới hàm
    const beard = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.2, 14), coatShade); beard.position.set(0, -0.24, 0.44); beard.rotation.x = Math.PI - 0.25; head.add(beard);
    [-1, 1].forEach(s => {
        // mắt hai bên đầu, hơi hướng ra trước: lòng trắng + tròng hổ phách + con ngươi NGANG chữ nhật + đốm sáng + mí trên
        const eg = new THREE.Group(); eg.position.set(0.16 * s, 0.07, 0.12); eg.rotation.y = 0.55 * s; head.add(eg);
        const e = sphere(white, 0.075, 0.08, 0.05); eg.add(e);
        const ir = sphere(amber, 0.062, 0.066, 0.02); ir.position.z = 0.04; eg.add(ir);
        const pu = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.026, 0.01, 2, 0.006), dark); pu.position.z = 0.058; eg.add(pu);
        const hl = sphere(white, 0.017); hl.position.set(-0.02 * s, 0.025, 0.062); eg.add(hl);
        const lid = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.32), coatShade); lid.scale.set(0.082, 0.085, 0.058); lid.rotation.x = -0.25; eg.add(lid);
        const ck = sphere(pink, 0.05, 0.03, 0.02); ck.position.set(0.12 * s, -0.08, 0.3); ck.rotation.y = 0.5 * s; head.add(ck);
        // tai dài chĩa ngang hơi rủ, lòng hồng
        const eargrp = new THREE.Group(); eargrp.position.set(0.19 * s, 0.1, -0.06); eargrp.rotation.set(0.1, 0.25 * s, -0.35 * s); head.add(eargrp);
        const ear = sphere(coat, 0.17, 0.05, 0.075); ear.position.x = 0.12 * s; eargrp.add(ear);
        const ei = sphere(earIn, 0.12, 0.02, 0.045); ei.position.set(0.12 * s, 0.015, 0.012); eargrp.add(ei);
        // sừng: ống cong vút từ đỉnh đầu ra sau rồi chúc xuống, có vân
        const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0.07 * s, 0.2, 0.02), new THREE.Vector3(0.1 * s, 0.34, -0.06),
            new THREE.Vector3(0.14 * s, 0.38, -0.22), new THREE.Vector3(0.17 * s, 0.28, -0.34)
        ]);
        const hn = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.035, 10, false), hornM); head.add(hn);
        const cap = sphere(hornM, 0.035); cap.position.copy(curve.getPoint(1)); head.add(cap);
        for (let k = 1; k <= 5; k++) {
            const u = k / 6.5, ring = new THREE.Mesh(new THREE.TorusGeometry(0.037, 0.007, 6, 14), hornM);
            ring.position.copy(curve.getPoint(u)); ring.lookAt(curve.getPoint(Math.min(1, u + 0.02)).applyMatrix4(new THREE.Matrix4())); head.add(ring);
        }
    });
    // chỏm lông giữa 2 sừng
    const tuft = sphere(coatShade, 0.07, 0.05, 0.08); tuft.position.set(0, 0.24, 0.05); head.add(tuft);

    // ── vòng cổ đỏ + chuông vàng (Tết) ──
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 12, 36), red); collar.position.set(0, 0.42, 0.36); collar.rotation.x = Math.PI / 2 - 0.55; f.add(collar);
    const bell = sphere(gold, 0.055, 0.055, 0.055); bell.position.set(0, 0.29, 0.52); f.add(bell);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 0.02), dark); slot.position.set(0, 0.27, 0.575); f.add(slot);
    return shadowed(f);
}
// model vẽ tay thay thế (assets/manifest.json "goat": "goat.glb", hoặc "mascot") — nạp 1 lần, mọi bàn sau dùng bản sao
let goatModel = null;
function loadGoatModel() {
    const A = window.__lcAssets || {}, url = A.goat || A.mascot;
    if (!url || goatModel) return;
    import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => new GLTFLoader().load(url, (g) => {
        const m = g.scene;
        const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3());
        m.scale.setScalar(1.35 / Math.max(size.x, size.y, size.z));   // vừa khung ~1.35 đơn vị như bản dựng sẵn
        const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()); m.position.sub(c);
        const wrap = new THREE.Group(); wrap.add(m); goatModel = wrap;
    })).catch(() => {});
}
window.addEventListener('lc:assets', loadGoatModel);
loadGoatModel();

// ⛰️ MỎM ĐÁ NÚI (trò 🐐 Dê Núi): khối đá nhiều mặt vát góc cạnh (low-poly, đổ bóng phẳng), màu đá xám nâu loang theo mặt,
// thu nhỏ dần lên đỉnh, đỉnh bằng có hang tối cho dê núi bật ra. Hốc có số nằm áp đúng mặt vát (dò bằng tia chiếu).
const ROCK_H = 2.95;
const CC_CAM = new THREE.Vector3(0, 4.7, 10.6);   // máy quay trò Dê Núi (dùng cả để kiểm hốc có bị đá che không)
function rockProfile(y) {   // bán kính trung bình theo độ cao: chân núi loe, lưng núi phình, đỉnh thu nhỏ
    const t = clamp(y / ROCK_H, 0, 1);
    return 1.85 - 0.5 * t - 0.55 * t * t * t;
}
function buildRock() {
    let geo = new THREE.IcosahedronGeometry(1, 2);   // ít mặt hơn → mặt vát to, góc cạnh rõ
    const pos = geo.attributes.position, v = new THREE.Vector3();
    const seen = new Map();   // cùng 1 đỉnh (trùng toạ độ) → cùng độ lồi lõm, không nứt mặt
    for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const key = v.x.toFixed(3) + ',' + v.y.toFixed(3) + ',' + v.z.toFixed(3);
        let out = seen.get(key);
        if (!out) {
            const y = (v.y * 0.5 + 0.5) * ROCK_H * 1.08;
            const h = hash(Math.round((v.x + 2) * 97) * 7 + Math.round((v.y + 2) * 89) * 13 + Math.round((v.z + 2) * 83) * 31);
            const flat = Math.hypot(v.x, v.z) || 1;
            const front = Math.max(0, v.z / Math.max(0.0001, Math.hypot(v.x, v.y, v.z)));   // 1 = mặt hướng người xem
            let r = rockProfile(y) * (0.74 + 0.48 * h - (0.74 + 0.48 * h - 0.98) * 0.7 * front);   // mặt trước gần nhẵn (vẫn vát) → hốc không bị gờ che
            let yy = y + (h - 0.5) * 0.34;
            if (yy > ROCK_H) { yy = ROCK_H + (h - 0.5) * 0.05; r = Math.min(r, 0.95 + h * 0.15); }   // đỉnh bằng (miệng hang)
            if (yy < 0) yy = 0;   // đáy phẳng chạm đất
            out = [v.x / flat * r * Math.min(1, flat * 1.6), yy, v.z / flat * r * Math.min(1, flat * 1.6)];
            seen.set(key, out);
        }
        pos.setXYZ(i, out[0], out[1], out[2]);
    }
    geo = geo.toNonIndexed();
    geo.computeVertexNormals();
    // màu từng mặt: xám đá / nâu đất / xám lạnh xen kẽ, mặt hướng lên sáng hơn (rêu nhạt ở chân)
    const cols = [], c = new THREE.Color(), n = new THREE.Vector3(), a = new THREE.Vector3(), b2 = new THREE.Vector3(), d = new THREE.Vector3();
    const P = geo.attributes.position;
    const tones = [0x5d5853, 0x6c655d, 0x4f4b47, 0x766b5c, 0x625a50, 0x585f63, 0x7a7268];   // đá xám nâu sẫm, xen xám lạnh
    for (let i = 0; i < P.count; i += 3) {
        a.fromBufferAttribute(P, i); b2.fromBufferAttribute(P, i + 1); d.fromBufferAttribute(P, i + 2);
        n.subVectors(b2, a).cross(d.clone().sub(a)).normalize();
        const cy = (a.y + b2.y + d.y) / 3;
        c.setHex(tones[Math.floor(hash(i * 3 + 11) * tones.length)]);
        if (n.y > 0.6) c.lerp(new THREE.Color(0x9a9282), 0.3);           // mặt ngửa: bạc nắng
        if (cy < 0.35 && hash(i + 5) > 0.55) c.lerp(new THREE.Color(0x6f8a4a), 0.45);   // rêu xanh ở chân núi
        for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0.02 }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
}

const CC = {
    build(b) {
        const g = new THREE.Group();
        // ⛰️ mỏm đá núi góc cạnh (tên biến 'jar' giữ cho phần rung/lắc dùng chung)
        const jar = buildRock(); g.add(jar); jar.updateMatrixWorld(true);
        const cave = new THREE.Mesh(new THREE.CircleGeometry(0.62, 9), std(0x15110d, { roughness: 1 })); cave.rotation.x = -Math.PI / 2; cave.position.y = ROCK_H + 0.05; g.add(cave);   // miệng hang trên đỉnh
        // đá vụn + cỏ núi quanh chân
        const pebM = new THREE.MeshStandardMaterial({ color: 0x8a837a, flatShading: true, roughness: 0.95 }), grass = std(0x6f9a3c, { roughness: 0.8 });
        for (let i = 0; i < 9; i++) {
            const an = Math.PI * 0.55 + (i / 9) * Math.PI * 1.9 + hash(i + 40) * 0.3, rr = 2.0 + hash(i + 50) * 0.5, sz = 0.12 + hash(i + 60) * 0.2;
            const pb = new THREE.Mesh(new THREE.DodecahedronGeometry(sz, 0), pebM); pb.position.set(Math.sin(an) * rr, sz * 0.5, Math.cos(an) * rr); pb.rotation.set(hash(i) * 3, hash(i + 1) * 3, 0); pb.castShadow = pb.receiveShadow = true; g.add(pb);
        }
        for (let i = 0; i < 6; i++) {
            const an = (i / 6) * Math.PI * 2 + 0.4, rr = 1.75 + hash(i + 70) * 0.25;
            for (let j = 0; j < 3; j++) { const bl = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.24 + hash(i * 3 + j) * 0.14, 5), grass); bl.position.set(Math.sin(an) * rr + (j - 1) * 0.05, 0.12, Math.cos(an) * rr); bl.rotation.z = (j - 1) * 0.35; g.add(bl); }
        }
        const rc = new THREE.Raycaster();
        // lỗ: các hàng ở nửa trước, mỗi lỗ = đĩa tối có số + vành đất sáng
        // hốc RẢI KHẮP núi (cả mặt khuất — creator xoay cho người xem tìm), cách nhau đủ xa đo trên MẶT ĐÁ THẬT (không đè nhau),
        // số xáo trộn rời rạc. Cùng số hốc → cùng bố cục (bộ sinh số xác định), không nhảy lung tung giữa các lượt.
        const size = b.n > 20 ? 0.15 : 0.18;
        let gap = size * 2 + 0.2;
        let seed = 0;
        const rnd01 = () => hash(++seed * 7.13 + b.n * 101.7);
        const spots = [];
        for (let tries = 0; spots.length < b.n && tries < 6000; tries++) {
            if (tries && tries % 1500 === 0) gap *= 0.9;   // núi nhỏ chưa đủ chỗ → nới khoảng cách dần
            const th = (rnd01() * 2 - 1) * Math.PI, y = 0.5 + rnd01() * 1.95;
            rc.set(new THREE.Vector3(6 * Math.sin(th), y, 6 * Math.cos(th)), new THREE.Vector3(-Math.sin(th), 0, -Math.cos(th)));
            const hit = rc.intersectObject(jar, false)[0];
            if (!hit) continue;
            const radial = new THREE.Vector3(Math.sin(th), 0, Math.cos(th));
            const normal = hit.face.normal.clone().normalize();
            if (normal.y < -0.15 || normal.dot(radial) < 0.3) continue;   // mặt úp xuống / quá xiên → bỏ
            normal.lerp(radial.setY(0.12).normalize(), 0.3).normalize();   // nghiêng nhẹ ra ngoài cho số dễ đọc khi xoay tới
            const pos = hit.point.clone().addScaledVector(normal, 0.045);
            if (spots.some(s => s.pos.distanceTo(pos) < gap)) continue;
            // mặt đá quanh vành có nhô cao hơn mặt hốc không (mặt vát kế bên)? đo 12 điểm trên vành → nâng hốc lên vừa đủ
            const t1 = new THREE.Vector3().crossVectors(normal, Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
            const t2 = new THREE.Vector3().crossVectors(normal, t1);
            let lift = 0;
            for (let a = 0; a < 12; a++) {
                const ang = a / 12 * Math.PI * 2, rr = size + 0.06;
                const q = pos.clone().addScaledVector(t1, Math.cos(ang) * rr).addScaledVector(t2, Math.sin(ang) * rr);
                rc.set(q.clone().addScaledVector(normal, 0.8), normal.clone().negate());
                const h2 = rc.intersectObject(jar, false)[0];
                if (h2 && h2.distance < 0.8) lift = Math.max(lift, 0.8 - h2.distance + 0.03);
            }
            if (lift > 0.14) continue;   // chỗ gồ ghề (phải nâng nhiều, gờ lòi ra như ống) → bỏ, tìm chỗ bằng hơn
            pos.addScaledVector(normal, lift);
            spots.push({ pos, normal, lift });
        }
        // số xáo trộn: hoán vị xác định theo số hốc
        const order = spots.map((_, i) => i);
        for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd01() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        const holes = [];
        const rim = new THREE.MeshStandardMaterial({ color: 0x5f5850, flatShading: true, roughness: 0.85 });
        const collarM = new THREE.MeshStandardMaterial({ color: 0x7b746b, flatShading: true, roughness: 0.92 });   // màu đá núi → gờ hoà vào vách
        spots.forEach((sp, idx) => {
            const n = order[idx] + 1;
            const hole = new THREE.Group(); hole.position.copy(sp.pos); hole.lookAt(sp.pos.clone().add(sp.normal));
            const disc = decal(numberTex(n, '#fff1d6', '#17110c'), size * 2, size * 2); disc.material.depthWrite = true;
            const ring = new THREE.Mesh(new THREE.TorusGeometry(size, 0.035, 10, 32), rim); ring.castShadow = true;
            // gờ đá hình ống từ vành ăn sâu vào núi → hốc như đục vào đá, không phải đĩa dán lơ lửng
            const depth = sp.lift + 0.3;
            const collar = new THREE.Mesh(new THREE.CylinderGeometry(size + 0.03, size + 0.1, depth, 14, 1, true), collarM);
            collar.rotation.x = Math.PI / 2; collar.position.z = -depth / 2; collar.castShadow = true; collar.receiveShadow = true;
            hole.add(disc, ring, collar); g.add(hole);
            holes.push({ n, g: hole, disc, normal: sp.normal, stick: null, size });
        });
        holes.sort((a, c) => a.n - c.n);
        const mascot = makeGoat(); mascot.position.set(0, 2.3, 0); mascot.visible = false; mascot.scale.setScalar(0.85); g.add(mascot);   // 🐐 dê con năm Đinh Mùi
        jar.castShadow = true; jar.receiveShadow = true;
        return { g, holes, mascot, jar };
    },
    apply(st, b, prev, animate) {
        const used = new Set(b.used);
        for (const h of st.holes) {
            if (used.has(h.n) && !h.stick) {
                const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.0, 12), std(0xffffff, { map: bambooTex(), roughness: 0.5 }));
                stick.castShadow = true;
                // que nằm dọc theo pháp tuyến lỗ, nghiêng lên ~25°, 1/5 chiều dài cắm vào trong
                const dir = h.normal.clone().setY(Math.max(0, h.normal.y)).add(new THREE.Vector3(0, 0.6, 0)).normalize();
                const end = h.g.position.clone().add(dir.clone().multiplyScalar(0.36));
                stick.position.copy(end);
                stick.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
                st.g.add(stick); h.stick = stick;
                if (animate) { const from = h.g.position.clone().add(dir.clone().multiplyScalar(1.6)); tween(260, k => { stick.position.lerpVectors(from, end, k); }, ease.in, () => shake(st.jar, 0.025, 200)); }
            }
            if (b.trap === h.n) h.disc.material = new THREE.MeshBasicMaterial({ map: numberTex(h.n, '#ffffff', '#e23b3b'), transparent: true, toneMapped: false });
        }
        if (b.sprung && !st.mascot.visible) {
            st.mascot.visible = true;
            if (animate) {
                sfx('boing'); sfx('bleat', { delay: 0.5 });
                tween(1300, k => {
                    const y = 2.3 + Math.sin(Math.min(1, k * 1.25) * Math.PI) * 1.6 + (k > 0.8 ? 0 : 0) + 0.85 * ease.out(k);
                    st.mascot.position.set(0, k < 0.8 ? y : 3.4, 0.2 * k);
                    st.mascot.rotation.set(-0.3 * Math.sin(k * Math.PI), Math.PI * 2 * ease.out(Math.min(1, k * 1.2)) + GOAT_TURN * k, 0);
                    const s = 1.05 + 0.25 * Math.sin(k * Math.PI);
                    st.mascot.scale.set(s, s * (k > 0.78 && k < 0.9 ? 0.8 : 1), s);
                }, (k) => k, () => { st.mascot.position.set(0, 3.38, 0.15); st.mascot.rotation.set(0, GOAT_TURN, 0); st.mascot.scale.setScalar(1.15); });
                shake(st.jar, 0.06, 500);
            } else { st.mascot.position.set(0, 3.38, 0.15); st.mascot.rotation.set(0, GOAT_TURN, 0); st.mascot.scale.setScalar(1.15); }
        }
    },
    camera() { frameCamera(CC_CAM.clone(), new THREE.Vector3(0, 2.0, 0), 30); },   // đủ cả chân núi (đá vụn, cỏ) lẫn dê núi đứng trên đỉnh (cả sừng)
    anchors(st) { return st.holes.map(h => ({ n: h.n, obj: h.g, offset: new THREE.Vector3(0, 0, 0.02), face: true })); }
};

// ═════════════════════════════════════════════════════════════════════════
// 🎋 THÁP TRE — tầng xếp chéo nhau, đầu thanh có số, thanh rút trượt ra, thanh mới chồng lên đỉnh, đổ = vật lý đơn giản
// ═════════════════════════════════════════════════════════════════════════
const BAR = { L: 1.56, w: 0.5, h: 0.3, gap: 0.02 };
function bambooBarTex(alt) {
    return canvasTex('bbar' + alt, 512, 128, (g, w, h) => {
        const base = alt ? ['#cdbb62', '#e6d690', '#a8953e'] : ['#8fbf4a', '#c4e283', '#6f9a2f'];
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, base[1]); gr.addColorStop(0.5, base[0]); gr.addColorStop(1, base[2]);
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(40,60,10,${0.05 + hash(i) * 0.08})`; g.lineWidth = 1 + hash(i + 3) * 1.5; const y = hash(i + 9) * h; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (hash(i + 4) - 0.5) * 6); g.stroke(); }
        [0.24, 0.76].forEach(x => { g.fillStyle = 'rgba(60,70,20,.55)'; g.fillRect(w * x - 5, 0, 10, h); g.fillStyle = 'rgba(255,255,220,.35)'; g.fillRect(w * x + 5, 0, 3, h); });
    });
}
function endTex(n, alt) {
    return canvasTex('bend' + n + alt, 160, 100, (g, w, h) => {
        g.fillStyle = alt ? '#e9dca0' : '#d7ec9e'; g.fillRect(0, 0, w, h);
        g.strokeStyle = alt ? '#a8953e' : '#6f9a2f'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
        for (let r = 12; r < 60; r += 9) { g.strokeStyle = 'rgba(80,70,20,.12)'; g.lineWidth = 2; g.beginPath(); g.ellipse(w / 2, h / 2, r * 1.5, r, 0, 0, Math.PI * 2); g.stroke(); }
        g.fillStyle = '#2e3a12'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(String(n).length > 1 ? 60 : 68); g.fillText(String(n), w / 2, h / 2 + 4);
    });
}
function barPlace(bar) {
    const alongX = bar.level % 2 === 1;
    const off = (bar.pos - 1) * (BAR.w + BAR.gap);
    const y = (bar.level - 1) * (BAR.h + 0.004) + BAR.h / 2;
    return alongX ? { alongX, pos: new THREE.Vector3(0, y, -off) } : { alongX, pos: new THREE.Vector3(off, y, 0) };
}
const TT = {
    build(b) {
        const g = new THREE.Group();
        const base = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.55, 0.14, 48), std(0x8a5a32, { roughness: 0.6 }));
        base.position.y = -0.07; base.receiveShadow = true; base.castShadow = true; g.add(base);
        const tower = new THREE.Group(); g.add(tower);
        const st = { g, tower, bars: new Map(), levels: 0 };
        for (const bar of b.bars) TT.addBar(st, bar, false);
        return st;
    },
    addBar(st, bar, drop) {
        const pl = barPlace(bar);
        const alt = bar.level % 2 === 0;
        const geo = new RoundedBoxGeometry(pl.alongX ? BAR.L : BAR.w, BAR.h, pl.alongX ? BAR.w : BAR.L, 2, 0.045);
        const mat = std(0xffffff, { map: bambooBarTex(alt), roughness: 0.55 });
        const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.position.copy(pl.pos);
        // nhãn số ở đầu thanh quay về phía máy quay (+X cho tầng dọc X, +Z cho tầng dọc Z)
        const lbl = decal(endTex(bar.n, alt), BAR.w * 0.92, BAR.h * 0.86);
        if (pl.alongX) { lbl.rotation.y = Math.PI / 2; lbl.position.x = BAR.L / 2 + 0.006; }
        else { lbl.position.z = BAR.L / 2 + 0.006; }
        lbl.material.depthWrite = true;
        mesh.add(lbl);
        st.tower.add(mesh);
        const rec = { n: bar.n, mesh, lbl, pl, out: false, level: bar.level, home: pl.pos.clone() };
        st.bars.set(bar.n, rec);
        st.levels = Math.max(st.levels, bar.level);
        if (drop) { const y1 = mesh.position.y; tween(380, k => { mesh.position.y = y1 + (1 - k) * 1.4; }, ease.out); }
        return rec;
    },
    apply(st, b, prev, animate) {
        st.wobble = b.wobble || 0;
        for (const bar of b.bars) {
            let r = st.bars.get(bar.n);
            if (!r) r = TT.addBar(st, bar, animate);
            if (bar.out && !r.out) {
                r.out = true;
                const dir = r.pl.alongX ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
                const from = r.mesh.position.clone(), to = from.clone().add(dir.multiplyScalar(2.6));
                if (animate && !b.fallen) {
                    sfx('pull');
                    tween(520, k => { r.mesh.position.lerpVectors(from, to, k); }, ease.inOut, () => {
                        tween(260, k => { r.mesh.scale.setScalar(1 - k); }, ease.in, () => { r.mesh.visible = false; });
                    });
                } else if (!b.fallen) r.mesh.visible = false;
            }
            if (!bar.out && r.out) {   // 🛡️ khiên nhét thanh lại
                r.out = false; r.mesh.visible = true; r.mesh.scale.setScalar(1);
                const from = r.mesh.position.clone();
                if (animate) tween(380, k => { r.mesh.position.lerpVectors(from, r.home, k); }, ease.out); else r.mesh.position.copy(r.home);
            }
        }
        if (b.fallen && !st.fallen) { st.fallen = true; if (animate) sfx('clatter'); TT.collapse(st, animate); }
        if (!b.fallen && st.wobble > 0.05 && !st.wobbling) {
            st.wobbling = true;
            updaters.push((dt, t) => {
                if (st.fallen || !root || root !== st.g) return false;
                const a = st.wobble * 0.022;
                st.tower.rotation.z = Math.sin(t / 420) * a;
                st.tower.rotation.x = Math.cos(t / 530) * a * 0.6;
                return true;
            });
        }
        TT.frameCam(st);
    },
    collapse(st, animate) {
        const parts = [...st.bars.values()].filter(r => r.mesh.visible);
        st.tower.rotation.set(0, 0, 0);
        const ph = parts.map(r => {
            const h = hash(r.n);
            return { r, v: new THREE.Vector3((h - 0.5) * 5, 1 + hash(r.n + 3) * 3, (hash(r.n + 5) - 0.3) * 4), w: new THREE.Vector3((h - 0.5) * 8, hash(r.n + 1) * 6, (hash(r.n + 2) - 0.5) * 8), rest: false };
        });
        if (!animate) { ph.forEach(p => { p.r.mesh.position.set(p.v.x * 0.5, BAR.h / 2, p.r.mesh.position.z + p.v.z * 0.4); p.r.mesh.rotation.y = p.w.y; }); return; }
        const t0 = now();
        updaters.push((dt, t) => {
            let moving = false;
            for (const p of ph) {
                if (p.rest) continue;
                const m = p.r.mesh;
                p.v.y -= 9.8 * dt;
                m.position.addScaledVector(p.v, dt);
                m.rotation.x += p.w.x * dt; m.rotation.y += p.w.y * dt; m.rotation.z += p.w.z * dt;
                if (m.position.y < BAR.h / 2) {
                    m.position.y = BAR.h / 2; p.v.y = -p.v.y * 0.32; p.v.x *= 0.6; p.v.z *= 0.6; p.w.multiplyScalar(0.5);
                    if (Math.abs(p.v.y) < 0.6) { p.rest = true; m.rotation.x = Math.round(m.rotation.x / (Math.PI / 2)) * (Math.PI / 2); m.rotation.z = Math.round(m.rotation.z / (Math.PI / 2)) * (Math.PI / 2); }
                }
                moving = moving || !p.rest;
            }
            return moving && t - t0 < 3500;
        });
    },
    frameCam(st) {
        const H = st.levels * (BAR.h + 0.004);
        const tgt = new THREE.Vector3(0, Math.max(1.2, H * 0.48), 0);
        const d = Math.max(8.2, H * 2.05);
        const pos = new THREE.Vector3(d * 0.6, tgt.y + d * 0.34, d * 0.72);
        if (!st.camSet) { frameCamera(pos, tgt, 30); st.camSet = { pos, tgt }; return; }
        if (pos.distanceTo(st.camSet.pos) < 0.05) return;
        const p0 = st.camSet.pos.clone(), t0 = st.camSet.tgt.clone();
        st.camSet = { pos, tgt };
        tween(600, k => { frameCamera(p0.clone().lerp(pos, k), t0.clone().lerp(tgt, k), 30); }, ease.inOut);
    },
    camera() {},
    anchors(st) {
        return [...st.bars.values()].map(r => {
            const o = r.pl.alongX ? new THREE.Vector3(BAR.L / 2, 0, 0) : new THREE.Vector3(0, 0, BAR.L / 2);
            return { n: r.n, pos: r.home.clone().add(o) };
        });
    }
};

// ═════════════════════════════════════════════════════════════════════════
// 🎁 LẬT CẶP QUÀ — thẻ bo góc kiểu TikTok: lưng đen bóng sọc hồng/xanh + số lệch màu; mặt = CHỈ ẢNH QUÀ THẬT (/api/gifts theo id). Ảnh chưa tải được → emoji dự phòng của luật. Lật = nhấc + xoay 180°.
// ═════════════════════════════════════════════════════════════════════════
const TT_PINK = '#fe2c55', TT_CYAN = '#25f4ee';
let giftImgUrls = null;   // Promise<Map id → url ảnh>
function giftImageUrl(id) {
    if (!giftImgUrls) giftImgUrls = fetch('/api/gifts').then(r => r.json()).then(list => new Map((list || []).filter(g => g && g.image).map(g => [String(g.id), g.image]))).catch(() => new Map())
        .then(m => { if (!m.size) setTimeout(() => { giftImgUrls = null; }, 15000); return m; });   // server chưa có bảng quà → 15 s sau hỏi lại
    return giftImgUrls.then(m => m.get(String(id)) || null);
}
function cardBackTex(n) {
    return canvasTex('cback2' + n, 256, 320, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, h);
        gr.addColorStop(0, '#1a1a24'); gr.addColorStop(1, '#0b0b12');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.lineWidth = 9;
        for (let x = -h, i = 0; x < w; x += 30, i++) { g.strokeStyle = i % 2 ? 'rgba(37,244,238,.13)' : 'rgba(254,44,85,.13)'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke(); }
        // viền đôi hồng/xanh lệch nhau
        g.lineWidth = 6; g.strokeStyle = TT_CYAN; g.strokeRect(13, 15, w - 28, h - 28); g.strokeStyle = TT_PINK; g.strokeRect(15, 13, w - 28, h - 28);
        g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.arc(w / 2, h / 2, 72, 0, Math.PI * 2); g.fill();
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(String(n).length > 1 ? 96 : 110);
        g.fillStyle = TT_CYAN; g.fillText(String(n), w / 2 - 4, h / 2 + 3);
        g.fillStyle = TT_PINK; g.fillText(String(n), w / 2 + 4, h / 2 + 9);
        g.fillStyle = '#fff'; g.fillText(String(n), w / 2, h / 2 + 6);
    });
}
function cardFaceTex(gift, matched) {
    const id = gift ? gift.id : '?';
    const key = 'cface2' + id + (matched ? 'm' : '');
    if (texCache.has(key)) return texCache.get(key);
    let img = null;
    const tex = canvasTex(key, 256, 320, (g, w, h) => drawFace(g, w, h));
    function drawFace(g, w, h) {
        g.clearRect(0, 0, w, h);
        const gr = g.createRadialGradient(w / 2, h * 0.42, 10, w / 2, h * 0.42, h * 0.75);
        gr.addColorStop(0, matched ? '#2b3d35' : '#2a2340'); gr.addColorStop(1, '#0e0c18');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.lineWidth = matched ? 12 : 7; g.strokeStyle = matched ? '#2bd47a' : TT_PINK; g.strokeRect(9, 9, w - 18, h - 18);
        if (!matched) { g.lineWidth = 3; g.strokeStyle = TT_CYAN; g.strokeRect(18, 18, w - 36, h - 36); }
        // CHỈ ảnh quà (không tên, không xu) — to, giữa thẻ, có quầng sáng phía sau
        const halo = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, 130);
        halo.addColorStop(0, 'rgba(255,255,255,.3)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = halo; g.fillRect(0, 0, w, h);
        if (img) g.drawImage(img, w / 2 - 110, h / 2 - 110, 220, 220);
        else { g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = "170px 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif"; g.fillText(gift ? gift.emoji : '🎁', w / 2, h / 2 + 6); }
        if (matched) { g.fillStyle = '#2bd47a'; g.beginPath(); g.arc(w - 38, 38, 24, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = font(32); g.fillText('✓', w - 38, 40); }
    }
    if (gift) giftImageUrl(gift.id).then(url => {
        if (!url) return;
        const im = new Image(); im.crossOrigin = 'anonymous';
        im.onload = () => { img = im; const c = tex.image; drawFace(c.getContext('2d'), c.width, c.height); tex.needsUpdate = true; kick(); };
        im.src = url;
    });
    return tex;
}
const CARD = { w: 1.0, d: 1.28, t: 0.06 };
const LP = {
    build(b) {
        const g = new THREE.Group();
        const n = b.cards.length;
        const cols = n <= 16 ? 4 : n <= 20 ? 5 : 6;
        const rows = Math.ceil(n / cols);
        const gx = CARD.w + 0.22, gz = CARD.d + 0.22;
        const edge = std(0xf6f1e4, { roughness: 0.6 });
        const cards = b.cards.map((c, i) => {
            const col = i % cols, row = Math.floor(i / cols);
            const grp = new THREE.Group();
            grp.position.set((col - (cols - 1) / 2) * gx, CARD.t / 2, (row - (rows - 1) / 2) * gz);
            const flip = new THREE.Group(); grp.add(flip);
            const body = new THREE.Mesh(new RoundedBoxGeometry(CARD.w, CARD.t, CARD.d, 2, 0.025), edge); body.castShadow = true; body.receiveShadow = true;
            const back = new THREE.Mesh(new THREE.PlaneGeometry(CARD.w * 0.94, CARD.d * 0.95), std(0xffffff, { map: cardBackTex(c.n), roughness: 0.4 }));
            back.rotation.x = -Math.PI / 2; back.position.y = CARD.t / 2 + 0.002;
            const front = new THREE.Mesh(new THREE.PlaneGeometry(CARD.w * 0.94, CARD.d * 0.95), std(0xffffff, { roughness: 0.45 }));
            front.rotation.x = Math.PI / 2; front.rotation.z = Math.PI; front.position.y = -CARD.t / 2 - 0.002;
            flip.add(body, back, front);
            g.add(grp);
            return { n: c.n, grp, flip, front, up: false, matched: false, face: '' };
        });
        // thảm đen viền hồng TikTok bên dưới → cảm giác bàn chơi thật
        const mat = new THREE.Mesh(new RoundedBoxGeometry(cols * gx + 0.5, 0.08, rows * gz + 0.5, 3, 0.04), std(0x15131f, { roughness: 0.9 }));
        mat.position.y = -0.045; mat.receiveShadow = true; g.add(mat);
        const trim = new THREE.Mesh(new RoundedBoxGeometry(cols * gx + 0.68, 0.06, rows * gz + 0.68, 3, 0.03), std(0xfe2c55, { roughness: 0.35, metalness: 0.3 }));
        trim.position.y = -0.07; g.add(trim);
        return { g, cards, cols, rows, gx, gz };
    },
    apply(st, b, prev, animate) {
        b.cards.forEach((c, i) => {
            const k = st.cards[i];
            if (c.face && k.face !== c.face) { k.face = c.face; k.front.material.map = cardFaceTex(c.gift); k.front.material.needsUpdate = true; }
            const wantUp = !!c.face;
            if (wantUp !== k.up) {
                k.up = wantUp;
                const r0 = k.flip.rotation.z, r1 = wantUp ? Math.PI : 0;
                if (animate) sfx('flip');
                if (animate) tween(460, t => { k.flip.rotation.z = r0 + (r1 - r0) * t; k.grp.position.y = CARD.t / 2 + Math.sin(t * Math.PI) * 0.55; }, ease.inOut);
                else k.flip.rotation.z = r1;
            }
            if (c.matched && !k.matched) {
                k.matched = true;
                k.front.material.map = cardFaceTex(c.gift, true); k.front.material.needsUpdate = true;
                k.front.material.emissive = new THREE.Color(0x2bd47a); k.front.material.emissiveIntensity = 0.0;
                if (animate) tween(900, t => { k.front.material.emissiveIntensity = Math.sin(t * Math.PI) * 0.35 + t * 0.08; k.grp.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.1); }, (t) => t);
                else k.front.material.emissiveIntensity = 0.08;
            }
            if (b.pendingMiss && c.open && animate) shake(k.grp, 0.05, 420);
        });
    },
    camera(st) {
        const wdt = st.cols * st.gx, dep = st.rows * st.gz;
        // lùi dần tới khi CẢ 4 góc viền bàn nằm trong khung (cạnh gần bị phối cảnh kéo xuống dưới → trước đây bị cắt mép dưới);
        // chừa mép trên cho nhãn tên hàng đầu. Sát nhất có thể để quà trên thẻ đủ to nhìn trên điện thoại.
        const hx = wdt / 2 + 0.36, hz = dep / 2 + 0.36;
        const corners = [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]].map(([x, z]) => new THREE.Vector3(x, -0.07, z));
        const tgt = new THREE.Vector3(0, 0, 0.25), v = new THREE.Vector3();
        for (let d = Math.max(wdt, dep) * 1.2; d < 60; d *= 1.04) {
            frameCamera(new THREE.Vector3(0, d * 0.9, d * 0.5 + tgt.z), tgt, 30);
            camera.updateMatrixWorld();
            if (corners.every(c => { v.copy(c).project(camera); return Math.abs(v.x) < 0.94 && v.y > -0.93 && v.y < 0.86; })) break;
        }
    },
    // nhãn tên dán ngay mép trên thẻ của chính người lật (thẻ to, sát nhau → không que)
    anchors(st) { return st.cards.map(k => ({ n: k.n, obj: k.grp, offset: new THREE.Vector3(0, 0.1, -CARD.d * 0.38), onCell: new THREE.Vector3(0, 0.12, -CARD.d * 0.5) })); }
};

// ═════════════════════════════════════════════════════════════════════════
// 🪨 Ô ĂN QUAN — bàn gỗ vân, 10 ô dân lõm + 2 ô quan bán nguyệt; sỏi dân nhiều màu, quan = viên ngọc lớn.
// Rải quân diễn lại từng viên theo board.lastMove.trace (take / drop / cap / end) — đúng luật thuần oanquan.js.
// Vòng ô: 0–4 hàng dưới trái→phải, 5 quan phải, 6–10 hàng trên phải→trái, 11 quan trái.
// ═════════════════════════════════════════════════════════════════════════
const OQ_STEP = 170;   // = oanquan.js holdMs: mỗi bước ~170 ms
function woodTex() {
    return canvasTex('wood', 1024, 384, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, '#a8693a'); gr.addColorStop(0.5, '#c08048'); gr.addColorStop(1, '#94592e');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 120; i++) {
            g.strokeStyle = `rgba(${hash(i) > 0.5 ? '70,35,12' : '235,190,140'},${0.06 + hash(i + 3) * 0.1})`;
            g.lineWidth = 1 + hash(i + 5) * 2.5;
            const y0 = hash(i + 9) * h;
            g.beginPath();
            for (let x = 0; x <= w; x += 16) g.lineTo(x, y0 + Math.sin(x / (60 + hash(i) * 90) + i) * (4 + hash(i + 1) * 9));
            g.stroke();
        }
        for (let k = 0; k < 5; k++) {
            const x = hash(k + 40) * w, y = hash(k + 50) * h;
            g.strokeStyle = 'rgba(70,35,12,.25)'; g.lineWidth = 2;
            for (let r = 4; r < 26; r += 5) { g.beginPath(); g.ellipse(x, y, r * 1.8, r, 0, 0, Math.PI * 2); g.stroke(); }
        }
    });
}
const PEB_COLORS = [0x7fd6b1, 0xf2efe6, 0xf1b860, 0xe88fa8, 0x8db6f0, 0xc9a7f2];
function pitPos(i) {
    // ô quan: tâm đống sỏi ở ±3.62; mép phẳng ±3.05 (cách mép ô dân 0.21) → sỏi quan không lấn sang ô 1 / ô 5
    if (i === 5) return new THREE.Vector3(3.62, 0, 0);
    if (i === 11) return new THREE.Vector3(-3.62, 0, 0);
    if (i < 5) return new THREE.Vector3(-2.34 + i * 1.17, 0, 0.62);
    return new THREE.Vector3(-2.34 + (10 - i) * 1.17, 0, -0.62);
}
// vị trí sỏi thứ k trong ô (xoắn ốc góc vàng, xếp tầng khi nhiều)
function pebbleOffset(k, quan) {
    const per = quan ? 22 : 12, lay = Math.floor(k / per), j = k % per;
    const R = quan ? 0.55 : 0.29;
    const r = R * Math.sqrt((j + 0.5) / per), a = j * 2.39996 + lay * 0.9;
    return new THREE.Vector3(Math.cos(a) * r * (quan ? 0.8 : 1), 0.06 + lay * 0.075, Math.sin(a) * r * (quan ? 1.7 : 1));
}
const OQ = {
    build() {
        const g = new THREE.Group();
        const wood = std(0xffffff, { map: woodTex(), roughness: 0.55 });
        const plank = new THREE.Mesh(new RoundedBoxGeometry(9.7, 0.34, 3.3, 4, 0.14), wood);
        plank.position.y = -0.17; g.add(plank);
        const pitMat = std(0x5a3216, { roughness: 0.85, side: THREE.DoubleSide }), rimMat = std(0xd9a066, { roughness: 0.45 });
        const pits = [];
        for (let i = 0; i < 12; i++) {
            const p = pitPos(i), quan = i === 5 || i === 11;
            const grp = new THREE.Group(); grp.position.copy(p); g.add(grp);
            if (quan) {
                // ô quan: nửa đĩa elip, mặt phẳng quay vào giữa bàn
                const right = i === 5;
                const floor = new THREE.Mesh(new THREE.CircleGeometry(1.0, 40, right ? -Math.PI / 2 : Math.PI / 2, Math.PI), pitMat);
                floor.rotation.x = -Math.PI / 2; floor.scale.set(1.15, 1.45, 1); floor.position.set(right ? -0.57 : 0.57, 0.03, 0);
                const rim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.045, 8, 40, Math.PI), rimMat);
                rim.rotation.set(-Math.PI / 2, 0, right ? -Math.PI / 2 : Math.PI / 2); rim.scale.set(1.45, 1.15, 1); rim.position.copy(floor.position);
                grp.add(floor, rim);
            } else {
                const floor = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.05, 1.0, 2, 0.12), pitMat);
                const rim = new THREE.Mesh(new RoundedBoxGeometry(1.08, 0.03, 1.08, 2, 0.14), rimMat);
                rim.position.y = -0.03; floor.position.y = 0.005;
                grp.add(rim, floor);
            }
            const pebs = new THREE.Group(); grp.add(pebs);
            pits.push({ i, grp, pebs, quan, count: -1, hasQuan: false });
        }
        const line = new THREE.Mesh(new RoundedBoxGeometry(5.9, 0.02, 0.05, 1, 0.01), rimMat); line.position.set(0, 0.01, 0); g.add(line);
        shadowed(g);
        const pebGeo = new THREE.SphereGeometry(1, 16, 12);
        const pebMats = PEB_COLORS.map(c => phys(c, { roughness: 0.18, clearcoat: 1 }));
        const quanMat = phys(0xf5c542, { roughness: 0.12, clearcoat: 1, metalness: 0.15, emissive: 0x3a2400, emissiveIntensity: 0.25 });
        const selMat = new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.95, depthWrite: false });
        const st = { g, pits, pebGeo, pebMats, quanMat, shown: null, moveId: 0, busy: false };
        st.selRing = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 8, 40), selMat);
        st.selRing.rotation.x = -Math.PI / 2; st.selRing.visible = false; g.add(st.selRing);
        st.handCluster = new THREE.Group(); st.handCluster.visible = false; g.add(st.handCluster);
        return st;
    },
    // vẽ lại sỏi của 1 ô theo số đếm
    fill(st, i, dan, quan) {
        const pit = st.pits[i];
        if (pit.count === dan && pit.hasQuan === quan) return;
        pit.count = dan; pit.hasQuan = quan;
        pit.pebs.clear();
        const ox = 0;
        if (quan) {
            const q = new THREE.Mesh(st.pebGeo, st.quanMat); q.scale.set(0.34, 0.25, 0.3); q.position.set(ox, 0.24, 0); q.castShadow = true; pit.pebs.add(q);
        }
        const show = Math.min(dan, pit.quan ? 40 : 26);
        for (let k = 0; k < show; k++) {
            const m = new THREE.Mesh(st.pebGeo, st.pebMats[(k * 7 + i * 3) % st.pebMats.length]);
            const o = pebbleOffset(k + (quan ? 5 : 0), pit.quan);
            m.position.set(o.x + ox, o.y, o.z); m.scale.set(0.15, 0.09, 0.125); m.rotation.y = hash(k + i * 31) * 6; m.castShadow = true;
            pit.pebs.add(m);
        }
        OQ.countLabel(i, dan, quan);
    },
    countLabel(i, dan, quan) {
        const el = layer.querySelector(`[data-n="${OQ.key(i)}"] .oq-cnt`);
        if (el) { el.textContent = dan; el.classList.toggle('zero', dan === 0 && !quan); }
    },
    key(i) { return i === 5 ? 'qR' : i === 11 ? 'qL' : (i < 5 ? '0:' + (i + 1) : '1:' + (11 - i)); },
    syncAll(st, b) { b.cells.forEach((c, i) => OQ.fill(st, i, c.dan, c.quan)); st.shown = b.cells.map(c => ({ dan: c.dan, quan: c.quan })); },
    apply(st, b, prev, animate) {
        if (b.sel != null) { const p = pitPos(b.sel); st.selRing.position.set(p.x, 0.05, p.z); st.selRing.visible = true; }
        else st.selRing.visible = false;
        const mv = b.lastMove;
        if (!st.shown || !animate || !mv || mv.id === st.moveId) {
            if (mv) st.moveId = mv.id;
            if (!st.busy) OQ.syncAll(st, b);
            else st.pendingSync = b;
            return;
        }
        st.moveId = mv.id;
        OQ.play(st, mv.trace, () => OQ.syncAll(st, st.pendingSync || b));
        st.pendingSync = null;
    },
    // diễn trace: mỗi bước 1 tween OQ_STEP ms nối đuôi nhau; cụm sỏi trên tay bay theo hình cung
    play(st, trace, done) {
        st.busy = true;
        const cnt = st.shown.map(c => ({ dan: c.dan, quan: c.quan }));
        let inHand = 0;
        const cl = st.handCluster;
        const setCluster = (n) => {
            cl.clear();
            for (let k = 0; k < Math.min(n, 8); k++) {
                const m = new THREE.Mesh(st.pebGeo, st.pebMats[k % st.pebMats.length]);
                m.scale.set(0.12, 0.075, 0.1); m.position.set((hash(k) - 0.5) * 0.3, k * 0.05, (hash(k + 3) - 0.5) * 0.3); m.castShadow = true; cl.add(m);
            }
            cl.visible = n > 0;
        };
        const steps = trace.slice();
        try { window.LcSfx && window.LcSfx.melodyStart(); } catch (e) {}   // 🎹 mỗi nước rải: bài nhạc chơi lại từ đầu
        const next = () => {
            const s = steps.shift();
            if (!s) { cl.visible = false; st.busy = false; OQ.handAt(null); if (done) done(); kick(); return; }
            if (s.k === 'take') {
                inHand = s.n; cnt[s.i].dan = 0; OQ.fill(st, s.i, 0, cnt[s.i].quan); sfx('take');
                cl.position.copy(pitPos(s.i)).setY(0.2); setCluster(inHand);
                tween(OQ_STEP, k => { cl.position.y = 0.2 + 0.7 * k; OQ.handAt(cl.position); }, ease.out, next);
            } else if (s.k === 'drop') {
                const to = pitPos(s.i).setY(0.9), from = cl.position.clone();
                tween(OQ_STEP, k => { cl.position.lerpVectors(from, to, k); cl.position.y = 0.9 + Math.sin(k * Math.PI) * 0.35; OQ.handAt(cl.position); }, ease.inOut, () => {
                    try { window.LcSfx && window.LcSfx.melodyDrop(); } catch (e) {}   // 1 viên sỏi = 1 nốt
                    inHand = Math.max(0, inHand - 1); cnt[s.i].dan++; OQ.fill(st, s.i, cnt[s.i].dan, cnt[s.i].quan); setCluster(inHand); next();
                });
            } else if (s.k === 'cap') {
                const pit = st.pits[s.i], dir = s.side === 1 ? -1 : 1;
                sfx(s.quan ? 'quan' : 'capture');
                const g0 = pit.pebs.position.clone();
                OQ.handAt(null);
                tween(OQ_STEP * 2.4, k => { pit.pebs.position.set(g0.x, g0.y + Math.sin(k * Math.PI) * 1.2, g0.z + dir * 2.6 * k); pit.pebs.scale.setScalar(1 - 0.7 * k); }, ease.in, () => {
                    pit.pebs.position.copy(g0); pit.pebs.scale.setScalar(1);
                    cnt[s.i] = { dan: 0, quan: false }; OQ.fill(st, s.i, 0, false); next();
                });
            } else { tween(OQ_STEP, () => {}, ease.out, next); }
        };
        next();
    },
    // bàn tay rải quân (ảnh HTML) đi theo cụm sỏi — chiếu từ 3D ra màn hình
    handAt(pos) {
        if (renderer) { handFollow(pos); return; }   // tay 3D đi theo cụm sỏi
        let h = layer.querySelector('.lc3-sowhand');
        if (!pos) { if (h) h.remove(); return; }
        if (!h) { h = document.createElement('div'); h.className = 'lc3-sowhand'; h.innerHTML = window.LcHandArt ? window.LcHandArt('sow') : ''; layer.appendChild(h); }
        const v = pos.clone().setY(pos.y + 0.15).project(camera);
        h.style.transform = `translate(${((v.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * H).toFixed(1)}px)`;
    },
    camera() { frameCamera(new THREE.Vector3(0, 7.6, 7.4), new THREE.Vector3(0, -0.2, 0.3), 33); },
    anchors(st, o) {
        const list = st.pits.map(p => {
            const q = p.quan;
            // ô dân: bong bóng ở mép ngoài hàng; ô quan: ở đầu bàn (không đè ô 1 / ô 5)
            const pos = pitPos(p.i).clone().add(new THREE.Vector3(0, 0.05, q ? 1.2 : (p.i < 5 ? 0.62 : -0.62)));
            const lbl = q ? '<b class="oq-qn">QUAN</b>' : `<b class="oq-no">${p.i < 5 ? p.i + 1 : 11 - p.i}</b>`;
            const zero = p.count === 0 && !p.hasQuan;
            return { n: OQ.key(p.i), pos, html: `<span class="oq-badge${q ? ' q' : ''}${p.i >= 6 && p.i <= 10 ? ' top' : ''}">${lbl}<span class="oq-cnt${zero ? ' zero' : ''}">${Math.max(0, p.count)}</span></span>` };
        });
        const pl = (o && o.players) || [];
        const ts = o && o.turnSide;
        if (ts === 0 || ts === 1) {
            const z = ts === 0 ? 2.15 : -2.15, hot = (o.sel != null ? ' hot' : '') + (ts === 1 ? ' top' : '');
            list.push({ n: 'arL', pos: new THREE.Vector3(-3.0, 0, z), html: `<span class="oq-arrow${hot}">⬅ trái <b>1</b></span>` });
            list.push({ n: 'arR', pos: new THREE.Vector3(3.0, 0, z), html: `<span class="oq-arrow${hot}"><b>2</b> phải ➡</span>` });
        }
        list.push({ n: 'row0', pos: new THREE.Vector3(0, 0, 2.15), html: `<span class="oq-owner">▲ ${escH(pl[0] || 'Ghế 1')}</span>` });
        list.push({ n: 'row1', pos: new THREE.Vector3(0, 0, -2.15), html: `<span class="oq-owner top">▼ ${escH(pl[1] || 'Ghế 2')}</span>` });
        return list;
    }
};

// ═════════════════════════════════════════════════════════════════════════
// ✋ BÀN TAY 3D — tự dựng bằng khối bo tròn, cùng ánh sáng + bóng đổ với bàn chơi.
// Gốc toạ độ = ĐẦU NGÓN TRỎ, ngón chỉ xuống (−Y), mu bàn tay quay về máy quay (+Z).
// LcBoards3D.fly(key, tool, ms) → tay bay tới điểm neo [data-n=key] rồi ấn; LcBoards3D.away(tool) → rút đi.
// ═════════════════════════════════════════════════════════════════════════
const SKIN = 0xe8a882;
function makeHand3D() {
    const h = new THREE.Group();
    const skin = new THREE.MeshPhysicalMaterial({ color: SKIN, roughness: 0.5, metalness: 0, sheen: 0.6, sheenColor: new THREE.Color(0xffd2b8), sheenRoughness: 0.6, clearcoat: 0.12 });
    const skinShade = new THREE.MeshPhysicalMaterial({ color: 0xe3a682, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color(0xffc8a8) });
    const nail = new THREE.MeshPhysicalMaterial({ color: 0xffe6dc, roughness: 0.2, clearcoat: 0.8 });
    const sleeve = new THREE.MeshPhysicalMaterial({ color: 0xff5e94, roughness: 0.45, sheen: 0.5, sheenColor: new THREE.Color(0xffc0d6) });
    const white = std(0xffffff, { roughness: 0.5 });
    const seg = (r, len, mat) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), mat || skin);
    // ngón trỏ duỗi thẳng: 3 đốt nối từ đầu ngón (gốc) lên khớp
    const idx = new THREE.Group(); idx.position.x = -0.24; h.add(idx);
    const f1 = seg(0.105, 0.2); f1.position.y = 0.2; idx.add(f1);
    const f2 = seg(0.112, 0.22); f2.position.y = 0.5; idx.add(f2);
    const f3 = seg(0.118, 0.22); f3.position.y = 0.8; idx.add(f3);
    const nl = sphere(nail, 0.075, 0.1, 0.03); nl.position.set(0, 0.16, 0.095); idx.add(nl);
    [0.36, 0.66].forEach(y => { const cr = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.008, 6, 20, Math.PI), skinShade); cr.position.set(0, y, 0); cr.rotation.y = 0; idx.add(cr); });
    // lòng + mu bàn tay
    const palm = new THREE.Mesh(new RoundedBoxGeometry(0.86, 0.72, 0.34, 4, 0.15), skin); palm.position.set(0.02, 1.33, -0.02); h.add(palm);
    // 3 ngón co lại thành nắm (nhìn từ mu tay thấy 3 khớp tròn)
    [[0.03, 1.0], [0.27, 0.95], [0.47, 0.88]].forEach(([x, len], k) => {
        const g = new THREE.Group(); g.position.set(x, 1.0, 0); h.add(g);
        const knuckle = sphere(skin, 0.118, 0.12, 0.13); knuckle.position.set(0, 0, 0.02); g.add(knuckle);
        const a = seg(0.108 - k * 0.006, 0.12); a.position.set(0, -0.12, -0.08); a.rotation.x = 0.9; g.add(a);
        const b = seg(0.1 - k * 0.006, 0.1); b.position.set(0, -0.14, -0.26); b.rotation.x = 2.3; g.add(b);
    });
    // ngón cái ôm bên hông, hướng xuống phía ngón trỏ
    const th = new THREE.Group(); th.position.set(-0.46, 1.32, 0.02); th.rotation.z = -0.65; th.rotation.x = 0.35; h.add(th);
    const t1 = seg(0.13, 0.2); t1.position.y = -0.12; th.add(t1);
    const t2 = seg(0.115, 0.16); t2.position.y = -0.38; th.add(t2);
    const tn = sphere(nail, 0.07, 0.085, 0.03); tn.position.set(0, -0.48, 0.1); th.add(tn);
    // cổ tay + tay áo hồng, sọc trắng
    const wrist = seg(0.3, 0.12); wrist.position.set(0.03, 1.78, -0.02); wrist.scale.z = 0.62; h.add(wrist);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.55, 28), sleeve); cuff.position.set(0.03, 2.15, -0.02); cuff.scale.z = 0.72; h.add(cuff);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.035, 8, 32), white); stripe.rotation.x = Math.PI / 2; stripe.position.set(0.03, 1.98, -0.02); stripe.scale.y = 0.72; h.add(stripe);
    shadowed(h);
    // gốc = đầu ngón trỏ: dời cả bàn tay để đầu ngón (x −0.24, y 0.09) nằm ở (0, 0)
    h.children.forEach(c => { c.position.x += 0.24; c.position.y -= 0.09; });
    const wrap = new THREE.Group(); wrap.add(h);
    wrap.visible = false;
    return wrap;
}
const HAND_SCALE = { hama: 0.75, chumcoc: 0.9, thaptre: 0.85, latcap: 1.05, oanquan: 0.8 };
let hand3d = null, handPress = null, handExit = null;
function getHand() {
    if (!hand3d) { hand3d = makeHand3D(); scene.add(hand3d); }
    hand3d.scale.setScalar(HAND_SCALE[game] || 0.85);
    return hand3d;
}
// tay hơi nghiêng về máy quay để thấy mu bàn tay + ngón chỉ
function handPose(hand, lean) { hand.rotation.set(-0.42 - (lean || 0), -0.25, 0.18); }
function anchorWorld(key) {
    const a = anchors.find(x => String(x.n) === String(key));
    if (!a) return null;
    if (a.obj) { a.obj.updateWorldMatrix(true, false); return (a.offset ? a.offset.clone() : new THREE.Vector3()).applyMatrix4(a.obj.matrixWorld); }
    return a.pos.clone();
}
function fly(key, tool, ms) {
    // Dê Núi: hốc nằm mặt khuất → quay núi đưa hốc ra phía người xem (đường ngắn nhất) rồi mới cho tay bay vào
    if (game === 'chumcoc' && root && state && state.holes) {
        const h = state.holes.find(x => String(x.n) === String(key));
        if (h) {
            const want = -Math.atan2(h.g.position.x, h.g.position.z);   // góc quay để hốc nằm trên trục +Z (về máy quay)
            let d = want - root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
            // xoay đúng mặt có hốc (≤ 0,7 s) → DỪNG ~0,9 s (vòng sáng quanh hốc, người xem thấy số) → mới cắm. Tổng ≤ chumcoc.leadMs (1,6 s)
            const spinMs = Math.abs(d) > 0.05 ? Math.min(700, 260 + Math.abs(d) * 220) : 0;
            return new Promise(res => spinTo(root.rotation.y + d, spinMs || 1, () => setTimeout(() => flyNow(key, tool, ms).then(res), 900)));
        }
    }
    return flyNow(key, tool, ms);
}
function flyNow(key, tool, ms) {
    return new Promise(res => {
        const tgt = renderer && anchorWorld(key);
        if (!tgt) return setTimeout(res, ms);
        const hand = getHand();
        const s = hand.scale.x;
        const start = tgt.clone().add(new THREE.Vector3(3.2 * s + 1.5, 4.5, 3.0));
        const hover = tgt.clone().add(new THREE.Vector3(0, 0.55 * s, 0.1));
        const press = tgt.clone().add(new THREE.Vector3(0, 0.04, 0.02));
        handPress = press.clone();
        hand.visible = true; handPose(hand, 0.25);
        const done = () => { if (tool === 'stick') sfx('stick'); else if (tool !== 'pull') sfx('press'); res(); };
        // 🦛 hà mã: nắp đầu ngửa ra sau che phía trên răng trong → tay KHÔNG bổ từ trên xuống (xuyên mỏ) mà luồn vào từ
        // phía trước qua khe miệng, ngón trỏ chĩa vào trong (nghiêng mạnh), thân tay nằm ngoài miệng về phía máy quay
        if (game === 'hama') {
            const R = HM.RING, mouth = root.localToWorld(new THREE.Vector3(0, R.y, 0));
            const out = tgt.clone().sub(mouth).setY(0).normalize();
            const from = tgt.clone().add(new THREE.Vector3(2.2, 1.6, 5.2));
            const gate = mouth.clone().add(new THREE.Vector3(out.x * 1.2, 0.75, 2.5));   // trước môi dưới, dưới vành mỏ trên
            const hov = tgt.clone().add(new THREE.Vector3(0, 0.3, 0.12));
            const LEAN = 0.88;
            hand.position.copy(from); handPose(hand, LEAN);
            tween(ms * 0.42, k => { hand.position.lerpVectors(from, gate, k); }, ease.out, () => {
                tween(ms * 0.3, k => { hand.position.lerpVectors(gate, hov, k); }, ease.inOut, () => {
                    tween(ms * 0.28, k => { hand.position.lerpVectors(hov, press, k); }, ease.in, done);
                });
            });
            handExit = gate.clone().add(new THREE.Vector3(0, 0, 0.6));
            return;
        }
        handExit = null;
        hand.position.copy(start);
        tween(ms * 0.62, k => { hand.position.lerpVectors(start, hover, k); handPose(hand, 0.25 * (1 - k)); }, ease.out, () => {
            tween(ms * 0.38, k => { hand.position.lerpVectors(hover, press, k); }, ease.in, done);
        });
    });
}
function away(tool) {
    if (!hand3d || !hand3d.visible) return;
    const from = hand3d.position.clone();
    if (handExit) {   // hà mã: rút ra đúng khe miệng rồi mới bay đi (không xuyên mỏ)
        const ex = handExit.clone(), far = ex.clone().add(new THREE.Vector3(2.4, 1.2, 3.5));
        handExit = null;
        tween(260, k => { hand3d.position.lerpVectors(from, ex, k); }, ease.out, () => {
            tween(320, k => { hand3d.position.lerpVectors(ex, far, k); }, ease.in, () => { hand3d.visible = false; });
        });
        return;
    }
    const to = tool === 'pull' ? from.clone().add(new THREE.Vector3(2.2, 0.3, 1.2)) : from.clone().add(new THREE.Vector3(2.6, 3.2, 2.4));
    tween(tool === 'pull' ? 650 : 420, k => { hand3d.position.lerpVectors(from, to, k); }, ease.in, () => { hand3d.visible = false; });
}
// Ô Ăn Quan: tay đi theo cụm sỏi khi rải (đầu ngón chạm đỉnh cụm)
function handFollow(pos) {
    const hand = getHand();
    if (!pos) { hand.visible = false; return; }
    hand.visible = true; handPose(hand, 0.1);
    hand.position.set(pos.x, pos.y + 0.32, pos.z + 0.05);
}

// ═════════════════════════════════════════════════════════════════════════
// 🏷️ NHÃN TÊN: thẻ avatar + tên nối que tới ô đã chọn. Xếp chỗ trên MÀN HÌNH lúc trạng thái đổi: thẻ không đè thẻ khác
// và không che ô nào (kể cả ô bên cạnh). Hà mã: thẻ nằm ngoài vành môi theo tia từ tâm miệng; ô khác: nhấc dần lên trên.
// ═════════════════════════════════════════════════════════════════════════
let tags = [];   // { a (anchor), el, stem, local (Vector3 trong a.ref) | lift (px) }
const _t = new THREE.Vector3();
function scr(v) { _t.copy(v).project(camera); return { x: (_t.x * 0.5 + 0.5) * W, y: (-_t.y * 0.5 + 0.5) * H }; }
function syncTags(marks, colorOf) {
    tags.forEach(t => { t.el.remove(); t.stem.remove(); });
    tags = [];
    if (!marks || !marks.length || !root) return;
    camera.updateMatrixWorld(); root.updateWorldMatrix(true, true);
    const cells = anchors.map(a => scr(anchorWorld(a.n)));
    const boxes = [], PAD = 6, CELL = 26;
    // vùng THẤY ĐƯỢC của sân khấu (khung overlay/cửa sổ có thể hẹp hơn canvas) → nhãn không bị cắt mép
    const sr = hostStage.getBoundingClientRect(), sx = W / Math.max(1, sr.width);
    const vx0 = Math.max(0, -sr.left) * sx + 8, vx1 = Math.min(sr.width, window.innerWidth - sr.left) * sx - 8;
    const vy0 = Math.max(0, -sr.top) * sx + 8, vy1 = Math.min(sr.height, window.innerHeight - sr.top) * sx - 8;
    const free = (r) => !boxes.some(b => r.x < b.x + b.w + PAD && r.x + r.w + PAD > b.x && r.y < b.y + b.h + PAD && r.y + r.h + PAD > b.y)
        && !cells.some(c => c.x > r.x - CELL && c.x < r.x + r.w + CELL && c.y > r.y - CELL && c.y < r.y + r.h + CELL)
        && r.x >= vx0 && r.y >= vy0 && r.x + r.w <= vx1 && r.y + r.h <= vy1;
    for (const m of marks) {
        const a = anchors.find(x => String(x.n) === String(m.n));
        if (!a) continue;
        const color = colorOf ? colorOf(m.key || '') : '#4fb3ff';
        const el = document.createElement('div'); el.className = 'lc3-tag'; el.innerHTML = tagHtml(m, colorOf);
        el.firstChild.style.borderColor = color;
        const stem = document.createElement('div'); stem.className = 'lc3-stem'; stem.style.background = color;
        layer.append(stem, el);
        const w = el.firstChild.offsetWidth || 130, h = el.firstChild.offsetHeight || 36;
        const box = (p) => ({ x: p.x - w / 2, y: p.y - h / 2, w, h });
        const t = { a, el, stem };
        let pick = null;
        if (a.onCell) {
            t.onCell = true; stem.hidden = true;
            pick = { p: scr(a.onCell.clone().applyMatrix4(a.obj.matrixWorld)) };
        } else if (a.label) {
            for (let k = 1.38; k <= 2.6 && !pick; k += 0.12) {
                const local = a.label(k), p = scr(a.ref.localToWorld(local.clone()));
                if (free(box(p))) pick = { local, p };
            }
            if (!pick) { const local = a.label(1.5); pick = { local, p: scr(a.ref.localToWorld(local.clone())) }; }
            t.local = pick.local;
        } else {
            // vòng dần ra quanh ô: ưu tiên phía trên, rồi xiên, ngang, dưới — chỗ gần nhất còn trống và nằm trong khung
            const c = scr(anchorWorld(a.n));
            const DIRS = [-90, -60, -120, -30, -150, 0, 180, 30, 150, 90].map(d => d * Math.PI / 180);
            for (let r = h / 2 + CELL; r < 360 && !pick; r += 12) {
                for (const d of DIRS) {
                    const off = { x: Math.cos(d) * (r + (Math.abs(Math.cos(d)) > 0.3 ? w / 2 - h / 2 : 0)), y: Math.sin(d) * r };
                    const p = { x: c.x + off.x, y: c.y + off.y };
                    if (free(box(p))) { pick = { off, p }; break; }
                }
            }
            if (!pick) { const off = { x: 0, y: -(h / 2 + CELL) }; pick = { off, p: { x: c.x, y: c.y + off.y } }; }
            t.off = pick.off;
        }
        boxes.push(box(pick.p));
        tags.push(t);
    }
    placeTags();
}
function placeTags() {
    for (const t of tags) {
        if (!anchorWorld(t.a.n)) continue;   // ô không còn (đổi trò / bàn nhỏ hơn)
        if (t.onCell) { t.a.obj.updateWorldMatrix(true, false); const q = scr(_l.copy(t.a.onCell).applyMatrix4(t.a.obj.matrixWorld)); t.el.style.transform = `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px)`; continue; }
        if (t.a.face) {   // hốc quay lưng về máy quay (mặt khuất của núi) → ẩn nhãn + que
            t.a.obj.updateWorldMatrix(true, false);
            const nrm = _l.set(0, 0, 1).transformDirection(t.a.obj.matrixWorld), wp = new THREE.Vector3().setFromMatrixPosition(t.a.obj.matrixWorld);
            const vis = nrm.dot(camera.position.clone().sub(wp).normalize()) > 0.15;
            t.el.style.opacity = t.stem.style.opacity = vis ? '' : '0';
        }
        const c0 = scr(anchorWorld(t.a.n));
        const p0 = t.local ? null : { x: c0.x + t.off.x, y: c0.y + t.off.y };
        // chân que ở MÉP ô phía nhãn (hà mã: mép ngoài răng) → không đè số trên ô
        const c = t.a.edge ? scr(t.a.ref.localToWorld(t.a.edge())) : (() => { const dx = p0.x - c0.x, dy = p0.y - c0.y, L = Math.hypot(dx, dy) || 1; return { x: c0.x + dx / L * 22, y: c0.y + dy / L * 22 }; })();
        const p = t.local ? scr(t.a.ref.localToWorld(_l.copy(t.local))) : p0;
        t.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
        const dx = p.x - c.x, dy = p.y - c.y, len = Math.hypot(dx, dy);
        t.stem.style.width = len.toFixed(1) + 'px';
        t.stem.style.transform = `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px) rotate(${Math.atan2(dy, dx).toFixed(4)}rad)`;
    }
}
const _l = new THREE.Vector3();

const KINDS = { hama: HM, chumcoc: CC, thaptre: TT, latcap: LP, oanquan: OQ };
let state = null;

function ensureMounted(stage) {
    if (hostStage !== stage || canvas.parentNode !== stage) {
        hostStage = stage;
        stage.innerHTML = '';
        stage.append(canvas, layer, meterEl);
    }
    // bỏ mọi thứ khác overlay chèn vào lần trước (chữ "chờ người vào ghế"…), giữ canvas + lớp neo
    [...stage.children].forEach(c => { if (c !== canvas && c !== layer && c !== meterEl) c.remove(); });
    resize(stage);
}

function render(stage, b, o) {
    o = o || {};
    if (!renderer) return;
    ensureMounted(stage);
    if (!b || !KINDS[b.kind]) { if (root) { disposeRoot(); kick(); } layer.innerHTML = ''; anchors = []; tags = []; meterEl.hidden = true; return; }
    const K = KINDS[b.kind];
    // Tháp Tre: số tầng đổi khi chồng thanh lên đỉnh → KHÔNG dùng làm khoá (nếu không mỗi lần rút là dựng lại cả tháp)
    const id = b.kind + ':' + (o.boardId ?? 'x') + ':' + (b.kind === 'thaptre' ? 0 : (b.n || (b.cards && b.cards.length) || 0));
    const fresh = id !== boardId || game !== b.kind;
    if (fresh) {
        disposeRoot();
        game = b.kind; boardId = id;
        state = K.build(b);
        root = state.g;
        scene.add(root);
        K.camera(state);
        K.apply(state, b, null, false);
    } else {
        K.apply(state, b, lastBoard, true);
    }
    lastBoard = b;
    setAnchors(K.anchors(state, o), [], o.colorOf);   // nhãn tên: syncTags (thẻ có que nối, tự né nhau)
    // tháp đổ / hà mã ngậm miệng → ẩn nhãn (ai dính bẫy đã có thông báo + giọng đọc)
    tags = [];
    tagArgs = b.kind !== 'oanquan' ? [b.fallen || (b.kind === 'hama' && b.sprung) ? [] : o.marks, o.colorOf] : null;
    if (tagArgs) syncTags(tagArgs[0], tagArgs[1]);
    if (fresh) { spinY = 0; if (root) root.rotation.y = 0; }   // bàn mới → về chính diện
    layer.style.opacity = b.fallen ? '0' : '';   // tháp đổ: chỗ thanh đã rút không còn → ẩn nhãn tên
    // Tháp Tre: thanh "Lung lay %"
    if (b.kind === 'thaptre') {
        const pct = clamp(Number(b.wobblePct) || 0, 0, 100), hue = Math.round(130 - pct * 1.3);
        meterEl.hidden = false;
        meterEl.className = 'tt-meter lc3-meter' + (pct >= 60 ? ' hot' : '');
        meterEl.innerHTML = `<span>Lung lay</span><b>${pct}%</b><div class="bar-in"><i style="width:${pct}%;background:hsl(${hue},85%,52%)"></i></div>`;
    } else meterEl.hidden = true;
    kick();
}

async function boot() {
    if (!init()) return;
    try { await document.fonts.load(font(64)); } catch (e) {}
    window.LcBoards3D = { ready: true, render, fly, away, rotate };
    bindDragSpin(canvas);
    window.dispatchEvent(new Event('lc3d:ready'));
}
boot();
