/* 🎲 Đấu Trường Mini — bàn chơi 3D (Three.js r160 dùng chung public/games/quaivat/vendor/, nền trong suốt cho OBS).
 *
 * window.LcBoards3D.render(stage, board, { boardId, marks, colorOf }) — cùng chữ ký LcBoards (2D) để overlay.js đổi qua lại.
 *  - Giữ 1 cảnh / 1 canvas trong #stage. boardId đổi (bàn mới) → dựng lại hình; cùng boardId → so khác biệt với lần
 *    trước rồi CHẠY HOẠT CẢNH (ấn răng, cắm que, rút thanh, lật thẻ, ngoạm, cóc nhảy, tháp đổ).
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
}
const escH = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function tagHtml(m, colorOf) {
    const color = colorOf ? colorOf(m.key || '') : '#4fb3ff';
    const name = Array.from(String(m.nickname || '')); const short = name.length > 7 ? name.slice(0, 6).join('') + '…' : name.join('');
    const av = m.avatar ? `<img src="${escH(m.avatar)}" alt="">` : escH((name[0] || '?').toUpperCase());
    return `<span class="lc-tag"><i style="background:${color}">${av}</i><em>${escH(short)}</em></span>`;
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
    build(b) {
        const g = new THREE.Group();
        // pastel mịn, bóng nhẹ (kiểu đồ chơi vinyl chibi) — không đốm, không nanh
        const skin = phys(0xb9a5f3, { roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 });
        const skinLight = phys(0xd9ccff, { roughness: 0.4, clearcoat: 0.4 });
        const inside = std(0xff8fb1, { roughness: 0.6, side: THREE.DoubleSide }), gum = std(0xff9dbb, { roughness: 0.5 }), tongue = std(0xff6f97, { roughness: 0.45 });
        const white = std(0xffffff, { roughness: 0.08 }), pupil = std(0x20183a, { roughness: 0.05 }), blush = std(0xff9cc4, { roughness: 0.8, transparent: true, opacity: 0.7 });
        // ── đầu tròn to ĐỨNG YÊN phía sau: mắt to nhìn thẳng người xem, tai, má hồng ──
        const head = sphere(skin, 1.8, 1.5, 1.35); head.position.set(0, 2.65, -1.85); g.add(head);
        [-1, 1].forEach(s => {
            const ear = sphere(skin, 0.32, 0.36, 0.2); ear.position.set(1.32 * s, 3.9, -2.1); ear.rotation.z = -0.5 * s; g.add(ear);
            const earIn = sphere(blush, 0.18, 0.22, 0.08); earIn.position.set(1.32 * s, 3.9, -1.96); earIn.rotation.z = -0.5 * s; g.add(earIn);
            const e = sphere(white, 0.46, 0.5, 0.36); e.position.set(0.66 * s, 3.33, -0.72); g.add(e);
            const p = sphere(pupil, 0.3, 0.34, 0.16); p.position.set(0.62 * s, 3.29, -0.43); g.add(p);
            const h1 = sphere(white, 0.1); h1.position.set(0.52 * s, 3.45, -0.3); g.add(h1);
            const h2 = sphere(white, 0.05); h2.position.set(0.7 * s, 3.17, -0.3); g.add(h2);
            const ck = sphere(blush, 0.36, 0.2, 0.12); ck.position.set(1.3 * s, 2.62, -0.85); g.add(ck);
            // 2 bàn chân trước tròn
            const foot = sphere(skinLight, 0.55, 0.4, 0.6); foot.position.set(1.55 * s, 0.38, 0.35); g.add(foot);
        });
        // ── hàm dưới (cái bát) + lòng miệng hồng + lưỡi + lợi; răng xếp trên lợi ──
        const jaw = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), skin);
        jaw.scale.set(1.9, 1.0, 1.55); jaw.position.y = 1.1; g.add(jaw);
        const chin = sphere(skinLight, 1.45, 0.45, 1.15); chin.position.set(0, 0.42, 0.3); g.add(chin);
        const cav = new THREE.Mesh(new THREE.CircleGeometry(1, 48), inside); cav.rotation.x = -Math.PI / 2; cav.scale.set(1.72, 1.4, 1); cav.position.y = 1.08; g.add(cav);
        const throat = sphere(inside, 1.5, 0.9, 0.4); throat.position.set(0, 1.4, -1.2); g.add(throat);
        const tg = sphere(tongue, 0.95, 0.22, 0.75); tg.position.set(0, 1.12, -0.1); g.add(tg);
        const ridge = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 14, 80), gum); ridge.rotation.x = Math.PI / 2; ridge.scale.set(1.6, 1.27, 1); ridge.position.y = 1.16; g.add(ridge);
        const lip = new THREE.Mesh(new THREE.TorusGeometry(1, 0.16, 16, 80), skin); lip.rotation.x = Math.PI / 2; lip.scale.set(1.86, 1.52, 1); lip.position.y = 1.02; g.add(lip);
        const teeth = [];
        const ivory = phys(0xffffff, { roughness: 0.18, clearcoat: 0.8 }), ivoryDown = phys(0xe4ddd0, { roughness: 0.45, clearcoat: 0.2 }), red = phys(0xff4a4a, { clearcoat: 0.6 });
        const span = Math.min(300, 120 + b.n * 12) * Math.PI / 180;
        const step = (span * 1.42) / Math.max(1, b.n - 1);
        const tw = clamp(step * 0.78, 0.3, 0.46);
        for (let i = 0; i < b.n; i++) {
            const a = Math.PI / 2 - span / 2 + span * (b.n === 1 ? 0.5 : i / (b.n - 1));
            const x = 1.6 * Math.cos(a), z = 1.27 * Math.sin(a);
            const tooth = new THREE.Group(); tooth.position.set(x, 1.44, z);
            const body2 = new THREE.Mesh(new THREE.CapsuleGeometry(tw * 0.5, 0.26, 6, 16), ivory);
            body2.scale.z = 0.8; body2.rotation.y = -a + Math.PI / 2; body2.castShadow = true;
            const lbl = decal(numberTex(i + 1, '#4a3a86'), tw * 1.02, tw * 1.02); lbl.rotation.x = -Math.PI / 2; lbl.position.y = 0.39;
            tooth.add(body2, lbl); g.add(tooth);
            teeth.push({ n: i + 1, g: tooth, body: body2, lbl, baseY: 1.44, pressed: false });
        }
        // ── mõm trên (bản lề sát đầu): trơn, 2 lỗ mũi nhỏ, mặt dưới hồng ──
        const pivot = new THREE.Group(); pivot.position.set(0, 1.12, -1.25); g.add(pivot);
        const up = new THREE.Group(); up.position.z = 1.25; pivot.add(up);
        const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), skin); shell.scale.set(1.9, 0.62, 1.55); up.add(shell);
        const roof = new THREE.Mesh(new THREE.CircleGeometry(1, 48), inside); roof.rotation.x = Math.PI / 2; roof.scale.set(1.72, 1.4, 1); roof.position.y = -0.02; up.add(roof);
        const ridge2 = ridge.clone(); ridge2.position.y = -0.04; up.add(ridge2);
        const lip2 = lip.clone(); lip2.position.y = 0; up.add(lip2);
        [-1, 1].forEach(s => { const nose = sphere(std(0x8f78d8, { roughness: 0.5 }), 0.13, 0.07, 0.1); nose.position.set(0.42 * s, 0.6, 0.85); nose.rotation.x = -0.6; up.add(nose); });
        // băng cá nhân dán trên má (đang đau răng) — trên đầu (đứng yên) cho luôn thấy
        const band = new THREE.Group();
        const strip = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.2, 0.05, 2, 0.05), std(0xf7b98a, { roughness: 0.7 }));
        const pad = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.16, 0.06, 2, 0.03), std(0xfff3e2, { roughness: 0.8 }));
        const strip2 = strip.clone(); strip2.rotation.z = Math.PI / 2;
        band.add(strip, strip2, pad); band.position.set(-1.38, 2.9, -0.85); band.rotation.set(0, -0.7, 0.5);
        g.add(band);
        shadowed(g);
        teeth.forEach(t => { t.lbl.castShadow = false; t.lbl.receiveShadow = false; });
        [cav, roof].forEach(m => { m.castShadow = false; });
        return { g, teeth, pivot, mats: { ivory, ivoryDown, red } };
    },
    OPEN: -0.85,
    apply(st, b, prev, animate) {
        const used = new Set(b.used);
        for (const t of st.teeth) {
            const down = used.has(t.n);
            if (down !== t.pressed) {
                t.pressed = down;
                const y0 = t.g.position.y, y1 = t.baseY - (down ? 0.2 : 0);
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
                tween(200, k => { st.pivot.rotation.x = r0 + (target - r0) * k; }, ease.in, () => shake(root, 0.08, 420));
            } else if (animate) tween(500, k => { st.pivot.rotation.x = r0 + (target - r0) * k; }, ease.inOut);
            else st.pivot.rotation.x = target;
        }
    },
    camera() { frameCamera(new THREE.Vector3(0, 8.4, 10.8), new THREE.Vector3(0, 2.15, -0.55), 29); },
    anchors(st) { return st.teeth.map(t => ({ n: t.n, obj: t.g, offset: new THREE.Vector3(0, 0.42, 0) })); }
};

function shake(obj, amp, ms) {
    const x0 = obj.position.x;
    tween(ms, k => { obj.position.x = x0 + Math.sin(k * Math.PI * 7) * amp * (1 - k); }, (k) => k, () => { obj.position.x = x0; });
}

// ═════════════════════════════════════════════════════════════════════════
// 🐸 CHUM CÓC — chum đất nung tiện tròn, lỗ có số, que tre cắm chéo, cóc bật ra từ miệng chum
// ═════════════════════════════════════════════════════════════════════════
const JAR_PROFILE = [[0.0, 0], [0.95, 0.02], [1.3, 0.22], [1.6, 0.75], [1.72, 1.3], [1.62, 1.9], [1.32, 2.35], [0.92, 2.62], [0.82, 2.78], [0.95, 2.86], [0.98, 2.95], [0.86, 3.0]];
function jarRadius(y) {
    for (let i = 1; i < JAR_PROFILE.length; i++) {
        const [r0, y0] = JAR_PROFILE[i - 1], [r1, y1] = JAR_PROFILE[i];
        if (y >= y0 && y <= y1) return r0 + (r1 - r0) * ((y - y0) / Math.max(1e-6, y1 - y0));
    }
    return 1;
}
function clayTex() {
    return canvasTex('clay', 512, 256, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, '#9a5a2e'); gr.addColorStop(0.5, '#c27a44'); gr.addColorStop(1, '#8b4c24');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${hash(i) > 0.5 ? '60,30,10' : '255,220,170'},${0.05 + hash(i + 7) * 0.08})`; g.fillRect(hash(i + 1) * w, hash(i + 2) * h, 1.5, 1.5); }
        // dải men + hoa văn sóng tự vẽ
        const band = (y, c) => { g.fillStyle = c; g.fillRect(0, y, w, 10); };
        band(h * 0.70, '#5b2e14'); band(h * 0.78, '#e6b27a');
        g.strokeStyle = '#5b2e14'; g.lineWidth = 4; g.beginPath();
        for (let x = 0; x <= w; x += 4) g.lineTo(x, h * 0.74 + Math.sin(x / w * Math.PI * 16) * 6);
        g.stroke();
    }, true);
}
function bambooTex() {
    return canvasTex('bamboo', 64, 512, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, 0);
        gr.addColorStop(0, '#6f9d2e'); gr.addColorStop(0.45, '#b7dc6a'); gr.addColorStop(1, '#5d8a24');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        for (let y = 90; y < h; y += 150) { g.fillStyle = '#4d7419'; g.fillRect(0, y, w, 10); g.fillStyle = '#d6ef9a'; g.fillRect(0, y + 10, w, 3); }
    });
}
function frogSkinTex() {
    return canvasTex('frogskin', 256, 256, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, '#8fe35a'); gr.addColorStop(0.55, '#47b83a'); gr.addColorStop(1, '#2f8a2a');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 46; i++) {
            const x = hash(i + 11) * w, y = hash(i + 23) * h * 0.8, r = 4 + hash(i + 5) * 11;
            g.fillStyle = `rgba(28,92,30,${0.35 + hash(i) * 0.3})`; g.beginPath(); g.ellipse(x, y, r, r * 0.8, hash(i) * 3, 0, Math.PI * 2); g.fill();
            g.fillStyle = 'rgba(200,255,150,.35)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2); g.fill();
        }
    });
}
// 🐸 cóc dựng thủ tục: thân dẹt rộng có đốm, mắt lồi có mí + con ngươi ngang, miệng cười rộng, chân gập + bàn chân màng
function makeFrog() {
    const gltf = frogModel && frogModel.clone(true);
    if (gltf) return shadowed(gltf);
    const f = new THREE.Group();
    const skin = phys(0xffffff, { map: frogSkinTex(), roughness: 0.28, clearcoat: 0.9 });
    const green = phys(0x45b83a, { roughness: 0.3, clearcoat: 0.8 });
    const belly = phys(0xf3f0b8, { roughness: 0.45, clearcoat: 0.3 });
    const white = std(0xffffff, { roughness: 0.08 });
    const iris = std(0xf1b31c, { roughness: 0.2 });
    const dark = std(0x0d120b, { roughness: 0.05 });
    const pink = std(0xff8fae, { roughness: 0.6 });
    const mouthMat = std(0x1f3d14, { roughness: 0.6 });
    // thân + đầu (gộp thành dáng cóc ngồi: thấp, rộng, đầu nhô về trước)
    const body = sphere(skin, 0.78, 0.46, 0.66); body.position.set(0, 0.0, -0.08); f.add(body);
    const head = sphere(skin, 0.64, 0.4, 0.5); head.position.set(0, 0.16, 0.3); f.add(head);
    const bl = sphere(belly, 0.55, 0.3, 0.42); bl.position.set(0, -0.12, 0.3); f.add(bl);
    // miệng cười rộng + lưỡi hồng chớm ra
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.022, 8, 40, Math.PI * 0.86), mouthMat);
    mouth.rotation.set(Math.PI / 2 + 0.25, 0, Math.PI + Math.PI * 0.07); mouth.position.set(0, 0.07, 0.36); f.add(mouth);
    const tongue = sphere(pink, 0.09, 0.03, 0.07); tongue.position.set(0.08, 0.02, 0.79); f.add(tongue);
    [-1, 1].forEach(s => {
        // mắt lồi trên đỉnh: ụ da + lòng trắng + tròng vàng + con ngươi ngang + mí trên
        const mound = sphere(green, 0.22, 0.2, 0.22); mound.position.set(0.3 * s, 0.46, 0.28); f.add(mound);
        const eye = sphere(white, 0.19); eye.position.set(0.3 * s, 0.53, 0.36); f.add(eye);
        const ir = sphere(iris, 0.13, 0.13, 0.05); ir.position.set(0.3 * s, 0.54, 0.535); f.add(ir);
        const pu = sphere(dark, 0.1, 0.045, 0.03); pu.position.set(0.3 * s, 0.54, 0.575); f.add(pu);
        const hl = sphere(white, 0.045); hl.position.set(0.25 * s, 0.6, 0.585); f.add(hl);
        const lid = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.26), green);
        lid.scale.setScalar(0.205); lid.position.set(0.3 * s, 0.535, 0.36); lid.rotation.x = -0.5; f.add(lid);
        const ck = sphere(pink, 0.1, 0.05, 0.04); ck.position.set(0.48 * s, 0.14, 0.58); f.add(ck);
        // chân trước + 3 ngón tròn
        const arm = sphere(green, 0.1, 0.22, 0.1); arm.position.set(0.36 * s, -0.24, 0.52); arm.rotation.x = 0.4; f.add(arm);
        for (let t = -1; t <= 1; t++) { const toe = sphere(belly, 0.055, 0.04, 0.07); toe.position.set(0.36 * s + t * 0.07, -0.43, 0.64 + Math.abs(t) * -0.02); f.add(toe); }
        // chân sau gập hai bên + bàn chân màng
        const thigh = sphere(skin, 0.3, 0.24, 0.42); thigh.position.set(0.62 * s, -0.16, -0.18); thigh.rotation.y = 0.35 * s; f.add(thigh);
        const foot = sphere(green, 0.2, 0.05, 0.28); foot.position.set(0.7 * s, -0.42, 0.18); foot.rotation.y = -0.4 * s; f.add(foot);
        for (let t = -1; t <= 1; t++) { const toe = sphere(belly, 0.05, 0.035, 0.06); toe.position.set(0.7 * s + t * 0.09 + 0.06 * s, -0.43, 0.42); f.add(toe); }
    });
    return shadowed(f);
}
// model vẽ tay thay thế (assets/manifest.json "frog": "frog.glb") — nạp 1 lần, mọi bàn sau dùng bản sao
let frogModel = null;
function loadFrogModel() {
    const url = (window.__lcAssets || {}).frog;
    if (!url || frogModel) return;
    import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => new GLTFLoader().load(url, (g) => {
        const m = g.scene;
        const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3());
        m.scale.setScalar(1.3 / Math.max(size.x, size.y, size.z));   // vừa khung ~1.3 đơn vị như bản dựng sẵn
        const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()); m.position.sub(c);
        const wrap = new THREE.Group(); wrap.add(m); frogModel = wrap;
    })).catch(() => {});
}
window.addEventListener('lc:assets', loadFrogModel);
loadFrogModel();

const CC = {
    build(b) {
        const g = new THREE.Group();
        const pts = JAR_PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
        const clay = std(0xffffff, { map: clayTex(), roughness: 0.78 });
        const jar = new THREE.Mesh(new THREE.LatheGeometry(pts, 72), clay); g.add(jar);
        const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.84, 48), std(0x1e0d04, { roughness: 1 })); mouth.rotation.x = -Math.PI / 2; mouth.position.y = 2.94; g.add(mouth);
        // lỗ: các hàng ở nửa trước, mỗi lỗ = đĩa tối có số + vành đất sáng
        const rows = b.n <= 10 ? 2 : b.n <= 18 ? 3 : b.n <= 24 ? 4 : 5;
        const per = Math.ceil(b.n / rows);
        const holes = [];
        const rim = std(0xe0a46c, { roughness: 0.7 });
        let k = 0;
        for (let r = 0; r < rows; r++) {
            const y = rows === 1 ? 1.3 : 2.05 - (1.45 * r) / (rows - 1);
            const cnt = Math.min(per, b.n - k);
            const spread = Math.min(1.25, 0.24 * (cnt - 1) + 0.1);
            for (let i = 0; i < cnt; i++, k++) {
                const th = cnt === 1 ? 0 : -spread + (2 * spread * i) / (cnt - 1);
                // pháp tuyến theo đúng độ cong thân chum (dr/dy) → đĩa lỗ áp sát mặt, không chìm nửa vào trong
                const slope = (jarRadius(y + 0.05) - jarRadius(y - 0.05)) / 0.1;
                const normal = new THREE.Vector3(Math.sin(th), -slope, Math.cos(th)).normalize();
                const rad = jarRadius(y);
                const pos = new THREE.Vector3(rad * Math.sin(th), y, rad * Math.cos(th)).addScaledVector(normal, 0.035);
                const hole = new THREE.Group(); hole.position.copy(pos); hole.lookAt(pos.clone().add(normal));
                const size = b.n > 20 ? 0.15 : 0.18;
                const disc = decal(numberTex(k + 1, '#ffe2b8', '#1f0d04'), size * 2, size * 2); disc.material.depthWrite = true;
                const ring = new THREE.Mesh(new THREE.TorusGeometry(size, 0.035, 10, 32), rim); ring.castShadow = true;
                hole.add(disc, ring); g.add(hole);
                holes.push({ n: k + 1, g: hole, disc, normal, stick: null, size });
            }
        }
        const frog = makeFrog(); frog.position.set(0, 2.3, 0); frog.visible = false; frog.scale.setScalar(0.85); g.add(frog);
        jar.castShadow = true; jar.receiveShadow = true;
        return { g, holes, frog, jar };
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
        if (b.sprung && !st.frog.visible) {
            st.frog.visible = true;
            if (animate) {
                tween(1300, k => {
                    const y = 2.3 + Math.sin(Math.min(1, k * 1.25) * Math.PI) * 1.6 + (k > 0.8 ? 0 : 0) + 0.85 * ease.out(k);
                    st.frog.position.set(0, k < 0.8 ? y : 3.4, 0.2 * k);
                    st.frog.rotation.set(-0.3 * Math.sin(k * Math.PI), Math.PI * 2 * ease.out(Math.min(1, k * 1.2)), 0);
                    const s = 0.85 + 0.25 * Math.sin(k * Math.PI);
                    st.frog.scale.set(s, s * (k > 0.78 && k < 0.9 ? 0.8 : 1), s);
                }, (k) => k, () => { st.frog.position.set(0, 3.38, 0.15); st.frog.rotation.set(0, 0, 0); st.frog.scale.setScalar(0.95); });
                shake(st.jar, 0.06, 500);
            } else { st.frog.position.set(0, 3.38, 0.15); st.frog.scale.setScalar(0.95); }
        }
    },
    camera() { frameCamera(new THREE.Vector3(0, 4.3, 8.2), new THREE.Vector3(0, 1.72, 0), 30); },
    anchors(st) { return st.holes.map(h => ({ n: h.n, obj: h.g, offset: new THREE.Vector3(0, 0, 0.02) })); }
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
        if (b.fallen && !st.fallen) { st.fallen = true; TT.collapse(st, animate); }
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
// 🍉 LẬT CẶP — thẻ bo góc nằm trên bàn, lưng hoa văn có số, mặt trái cây; lật = nhấc + xoay 180°
// ═════════════════════════════════════════════════════════════════════════
function cardBackTex(n) {
    return canvasTex('cback' + n, 256, 320, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, h);
        gr.addColorStop(0, '#3a7bf0'); gr.addColorStop(1, '#2547b8');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 10;
        for (let x = -h; x < w; x += 34) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke(); }
        g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 8; g.strokeRect(14, 14, w - 28, h - 28);
        g.fillStyle = 'rgba(15,25,80,.55)'; g.beginPath(); g.arc(w / 2, h / 2, 70, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(String(n).length > 1 ? 92 : 104); g.fillText(String(n), w / 2, h / 2 + 6);
    });
}
function cardFaceTex(face, matched) {
    return canvasTex('cface' + face + (matched ? 'm' : ''), 256, 320, (g, w, h) => {
        const gr = g.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, h * 0.7);
        gr.addColorStop(0, matched ? '#f2fff6' : '#fffdf4'); gr.addColorStop(1, matched ? '#c9f2d8' : '#f3e6c4');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.strokeStyle = matched ? '#22b866' : '#e2b84a'; g.lineWidth = matched ? 16 : 8; g.strokeRect(10, 10, w - 20, h - 20);
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = "190px 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif";
        g.fillText(face, w / 2, h / 2 + 4);
        if (matched) { g.fillStyle = '#22b866'; g.beginPath(); g.arc(w - 40, 40, 26, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.font = font(34); g.fillText('✓', w - 40, 42); }
    });
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
        // thảm nỉ xanh viền vàng bên dưới → cảm giác bàn chơi thật
        const mat = new THREE.Mesh(new RoundedBoxGeometry(cols * gx + 0.5, 0.08, rows * gz + 0.5, 3, 0.04), std(0x1d6b4a, { roughness: 0.95 }));
        mat.position.y = -0.045; mat.receiveShadow = true; g.add(mat);
        const trim = new THREE.Mesh(new RoundedBoxGeometry(cols * gx + 0.68, 0.06, rows * gz + 0.68, 3, 0.03), std(0xd9a93a, { roughness: 0.35, metalness: 0.6 }));
        trim.position.y = -0.07; g.add(trim);
        return { g, cards, cols, rows, gx, gz };
    },
    apply(st, b, prev, animate) {
        b.cards.forEach((c, i) => {
            const k = st.cards[i];
            if (c.face && k.face !== c.face) { k.face = c.face; k.front.material.map = cardFaceTex(c.face); k.front.material.needsUpdate = true; }
            const wantUp = !!c.face;
            if (wantUp !== k.up) {
                k.up = wantUp;
                const r0 = k.flip.rotation.z, r1 = wantUp ? Math.PI : 0;
                if (animate) tween(460, t => { k.flip.rotation.z = r0 + (r1 - r0) * t; k.grp.position.y = CARD.t / 2 + Math.sin(t * Math.PI) * 0.55; }, ease.inOut);
                else k.flip.rotation.z = r1;
            }
            if (c.matched && !k.matched) {
                k.matched = true;
                k.front.material.map = cardFaceTex(c.face, true); k.front.material.needsUpdate = true;
                k.front.material.emissive = new THREE.Color(0x2bd47a); k.front.material.emissiveIntensity = 0.0;
                if (animate) tween(900, t => { k.front.material.emissiveIntensity = Math.sin(t * Math.PI) * 0.35 + t * 0.08; k.grp.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.1); }, (t) => t);
                else k.front.material.emissiveIntensity = 0.08;
            }
            if (b.pendingMiss && c.open && animate) shake(k.grp, 0.05, 420);
        });
    },
    camera(st) {
        const wdt = st.cols * st.gx, dep = st.rows * st.gz;
        const d = Math.max(wdt * 1.7, dep * 2.05, 8.6);
        frameCamera(new THREE.Vector3(0, d * 0.82, d * 0.62), new THREE.Vector3(0, 0, 0.15), 30);
    },
    anchors(st) { return st.cards.map(k => ({ n: k.n, obj: k.grp, offset: new THREE.Vector3(0, 0.1, -CARD.d * 0.38) })); }
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
        const next = () => {
            const s = steps.shift();
            if (!s) { cl.visible = false; st.busy = false; OQ.handAt(null); if (done) done(); kick(); return; }
            if (s.k === 'take') {
                inHand = s.n; cnt[s.i].dan = 0; OQ.fill(st, s.i, 0, cnt[s.i].quan);
                cl.position.copy(pitPos(s.i)).setY(0.2); setCluster(inHand);
                tween(OQ_STEP, k => { cl.position.y = 0.2 + 0.7 * k; OQ.handAt(cl.position); }, ease.out, next);
            } else if (s.k === 'drop') {
                const to = pitPos(s.i).setY(0.9), from = cl.position.clone();
                tween(OQ_STEP, k => { cl.position.lerpVectors(from, to, k); cl.position.y = 0.9 + Math.sin(k * Math.PI) * 0.35; OQ.handAt(cl.position); }, ease.inOut, () => {
                    inHand = Math.max(0, inHand - 1); cnt[s.i].dan++; OQ.fill(st, s.i, cnt[s.i].dan, cnt[s.i].quan); setCluster(inHand); next();
                });
            } else if (s.k === 'cap') {
                const pit = st.pits[s.i], dir = s.side === 1 ? -1 : 1;
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
let hand3d = null, handPress = null;
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
        hand.position.copy(start);
        tween(ms * 0.62, k => { hand.position.lerpVectors(start, hover, k); handPose(hand, 0.25 * (1 - k)); }, ease.out, () => {
            tween(ms * 0.38, k => { hand.position.lerpVectors(hover, press, k); }, ease.in, res);
        });
    });
}
function away(tool) {
    if (!hand3d || !hand3d.visible) return;
    const from = hand3d.position.clone();
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
// 🏷️ NHÃN DÁN 3D: avatar + tên người đã chọn, gắn ngay trên răng / lỗ / thanh / thẻ (sprite trong cảnh — luôn quay về
// người xem, bị che đúng như vật thật). Thay thẻ chữ HTML nổi lơ lửng trong bản 3D.
// ═════════════════════════════════════════════════════════════════════════
const MARK_SIZE = { hama: 0.4, chumcoc: 0.44, thaptre: 0.44, latcap: 0.5 };
const markTexCache = new Map();
function markTex(m, color) {
    const key = (m.key || '') + '|' + (m.nickname || '') + '|' + color + '|' + (m.avatar || '');
    if (markTexCache.has(key)) return markTexCache.get(key);
    const c = document.createElement('canvas'); c.width = 320; c.height = 120;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const name = Array.from(String(m.nickname || '')); const short = name.length > 9 ? name.slice(0, 8).join('') + '…' : name.join('');
    const draw = (img) => {
        const g = c.getContext('2d');
        g.clearRect(0, 0, c.width, c.height);
        // viên thuốc trắng viền màu người chơi + bóng nhẹ
        g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 10; g.shadowOffsetY = 4;
        g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(8, 10, 304, 96, 48); g.fill();
        g.shadowColor = 'transparent';
        g.lineWidth = 8; g.strokeStyle = color; g.beginPath(); g.roundRect(8, 10, 304, 96, 48); g.stroke();
        // avatar tròn (ảnh thật nếu tải được, không thì chữ cái đầu trên màu riêng)
        g.save(); g.beginPath(); g.arc(58, 58, 38, 0, Math.PI * 2); g.clip();
        if (img) g.drawImage(img, 20, 20, 76, 76);
        else { g.fillStyle = color; g.fillRect(20, 20, 76, 76); g.fillStyle = '#fff'; g.font = font(44); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText((name[0] || '?').toUpperCase(), 58, 62); }
        g.restore();
        g.fillStyle = '#1f1d33'; g.font = font(40); g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText(short, 108, 60, 196);
        tex.needsUpdate = true;
        kick();
    };
    draw(null);
    if (m.avatar) {
        const img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = () => { try { draw(img); } catch (e) { draw(null); } };   // ảnh không cho CORS → giữ chữ cái đầu
        img.src = m.avatar;
    }
    markTexCache.set(key, tex);
    if (markTexCache.size > 120) markTexCache.delete(markTexCache.keys().next().value);
    return tex;
}
let markGroup = null;
function syncMarks(marks, colorOf) {
    if (!root) return;
    if (!markGroup || markGroup.parent !== root) { markGroup = new THREE.Group(); root.add(markGroup); }
    markGroup.children.slice().forEach(s => { markGroup.remove(s); s.material.dispose(); });
    const size = MARK_SIZE[game] || 0.6;
    for (const m of marks || []) {
        const p = anchorWorld(m.n);
        if (!p) continue;
        root.worldToLocal(p);
        const color = colorOf ? colorOf(m.key || '') : '#4fb3ff';
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex(m, color), depthTest: false, depthWrite: false, toneMapped: false }));
        sp.scale.set(size * 2.67, size, 1);
        sp.position.copy(p).add(new THREE.Vector3(0, size * 0.15, 0.08));   // dán sát mặt ô (không nổi cao)
        sp.renderOrder = 5;
        markGroup.add(sp);
    }
}

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
    if (!b || !KINDS[b.kind]) { if (root) { disposeRoot(); kick(); } layer.innerHTML = ''; anchors = []; meterEl.hidden = true; return; }
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
    setAnchors(K.anchors(state, o), [], o.colorOf);   // 3D: nhãn tên là sprite dán trong cảnh (syncMarks), không dùng thẻ HTML
    // tháp đổ / hà mã ngậm miệng → ẩn nhãn (ai dính bẫy đã có thông báo + giọng đọc)
    if (b.kind !== 'oanquan') syncMarks(b.fallen || (b.kind === 'hama' && b.sprung) ? [] : o.marks, o.colorOf);
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
    window.LcBoards3D = { ready: true, render, fly, away };
    window.dispatchEvent(new Event('lc3d:ready'));
}
boot();
