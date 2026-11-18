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
window.__lc3d = { step(ms) { skew += ms || 16; frame(); }, frame, get tweens() { return tweens.length; } };

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
        if (mk[a.n]) el.innerHTML = tagHtml(mk[a.n], colorOf);
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
const HM = {
    build(b) {
        const g = new THREE.Group();
        const skin = phys(0x9a84d8), skinDark = phys(0x7d68bd), gum = std(0xb73552, { roughness: 0.6 }), tongue = std(0xe86b88, { roughness: 0.55 });
        // thân phía sau
        const body = sphere(skin, 2.15, 1.25, 1.5); body.position.set(0, 0.95, -2.0); g.add(body);
        // hàm dưới: nửa dưới khối elip + môi + nền miệng + lưỡi
        const jaw = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), skin);
        jaw.scale.set(1.85, 0.88, 1.45); jaw.position.y = 0.92; g.add(jaw);
        const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 48), gum); floor.rotation.x = -Math.PI / 2; floor.scale.set(1.7, 1.32, 1); floor.position.y = 0.9; g.add(floor);
        const tg = sphere(tongue, 0.85, 0.2, 0.62); tg.position.set(0, 0.92, 0.15); g.add(tg);
        const lip = new THREE.Mesh(new THREE.TorusGeometry(1, 0.1, 14, 72), skinDark); lip.rotation.x = Math.PI / 2; lip.scale.set(1.8, 1.4, 1); lip.position.y = 0.92; g.add(lip);
        // răng: vòng 300° quanh mép hàm, mặt trên có số (đọc được từ góc máy cao)
        const teeth = [];
        const ivory = phys(0xfff7ea, { roughness: 0.22, clearcoat: 0.5 }), ivoryDown = phys(0xd9d0c0, { roughness: 0.5, clearcoat: 0 }), red = phys(0xff4a4a);
        const span = Math.min(300, 120 + b.n * 12) * Math.PI / 180;
        const step = (span * 1.34) / Math.max(1, b.n - 1);   // khoảng cách 2 răng trên vòng hàm
        const tw = clamp(step * 0.8, 0.3, 0.46);
        for (let i = 0; i < b.n; i++) {
            const a = Math.PI / 2 - span / 2 + span * (b.n === 1 ? 0.5 : i / (b.n - 1));
            const x = 1.52 * Math.cos(a), z = 1.16 * Math.sin(a);
            const tooth = new THREE.Group(); tooth.position.set(x, 1.02, z);
            const body = new THREE.Mesh(new RoundedBoxGeometry(tw, 0.44, tw * 0.75, 3, 0.08), ivory);
            body.rotation.y = -a + Math.PI / 2; body.castShadow = true;
            const lbl = decal(numberTex(i + 1, '#3d2c6e'), tw * 1.05, tw * 1.05); lbl.rotation.x = -Math.PI / 2; lbl.position.y = 0.226;
            tooth.add(body, lbl); g.add(tooth);
            teeth.push({ n: i + 1, g: tooth, body, lbl, baseY: 1.02, pressed: false });
        }
        // hàm trên + đầu: xoay quanh bản lề sau
        const pivot = new THREE.Group(); pivot.position.set(0, 0.92, -1.3); g.add(pivot);
        const up = new THREE.Group(); up.position.z = 1.3; pivot.add(up);
        const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), skin); shell.scale.set(1.85, 0.8, 1.45); up.add(shell);
        const roof = new THREE.Mesh(new THREE.CircleGeometry(1, 48), gum); roof.rotation.x = Math.PI / 2; roof.scale.set(1.7, 1.32, 1); roof.position.y = -0.005; up.add(roof);
        const lip2 = lip.clone(); lip2.position.y = 0; up.add(lip2);
        const fang = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.3, 0.18, 2, 0.06), ivory);
        [-0.55, 0.55].forEach(x => { const f = fang.clone(); f.position.set(x, -0.12, 1.15); up.add(f); });
        const head = sphere(skin, 1.4, 1.05, 1.0); head.position.set(0, 0.95, -0.55); up.add(head);
        const white = std(0xffffff, { roughness: 0.15 }), pupil = std(0x161226, { roughness: 0.1 }), ear = std(0xf4a0c0, { roughness: 0.45 });
        [-1, 1].forEach(s => {
            // mắt + tai nằm trên đỉnh đầu, đủ cao để vẫn thấy khi hàm trên đang mở
            // hàm trên ngửa ra sau → mắt đặt lệch về trước sống mũi để vẫn nhìn về phía máy quay
            const eb = sphere(skin, 0.4, 0.4, 0.4); eb.position.set(0.62 * s, 1.5, 0.55); up.add(eb);
            const e = sphere(white, 0.31); e.position.set(0.62 * s, 1.6, 0.78); up.add(e);
            const p = sphere(pupil, 0.15); p.position.set(0.6 * s, 1.7, 1.03); up.add(p);
            const hl = sphere(white, 0.05); hl.position.set(0.54 * s, 1.8, 1.12); up.add(hl);
            const er = sphere(skinDark, 0.24, 0.17, 0.13); er.position.set(1.08 * s, 1.85, -0.75); up.add(er);
            const ei = sphere(ear, 0.14, 0.1, 0.06); ei.position.set(1.08 * s, 1.85, -0.66); up.add(ei);
            const no = sphere(std(0x4a3a7a, { roughness: 0.6 }), 0.13, 0.08, 0.1); no.position.set(0.42 * s, 0.7, 1.08); up.add(no);
            const ck = sphere(std(0xff9cc4, { roughness: 0.8, transparent: true, opacity: 0.55 }), 0.26, 0.12, 0.12); ck.position.set(1.3 * s, 0.38, 0.7); up.add(ck);
        });
        // miếng băng cá nhân trên má (hà mã đang đau răng)
        const band = new THREE.Group();
        const strip = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.2, 0.04, 2, 0.05), std(0xf2c99a, { roughness: 0.7 }));
        const pad = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.16, 0.05, 2, 0.03), std(0xfff3e2, { roughness: 0.8 }));
        const strip2 = strip.clone(); strip2.rotation.z = Math.PI / 2;
        strip.material.color.set(0xf7b98a); band.add(strip, strip2, pad); band.position.set(1.32, 0.55, 0.72); band.rotation.set(0, 0.95, 0.5);
        up.add(band);
        shadowed(g);
        teeth.forEach(t => { t.lbl.castShadow = false; t.lbl.receiveShadow = false; });
        return { g, teeth, pivot, mats: { ivory, ivoryDown, red } };
    },
    OPEN: -0.72,
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
    camera() { frameCamera(new THREE.Vector3(0, 6.3, 8.4), new THREE.Vector3(0, 1.72, 0.1), 28); },
    anchors(st) { return st.teeth.map(t => ({ n: t.n, obj: t.g, offset: new THREE.Vector3(0, 0.3, 0) })); }
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
function makeFrog() {
    const f = new THREE.Group();
    const green = phys(0x45c252, { roughness: 0.3 }), belly = phys(0xc8f08a, { roughness: 0.4 }), white = std(0xffffff, { roughness: 0.15 }), dark = std(0x10160d, { roughness: 0.1 }), pink = std(0xff7aa2);
    const body = sphere(green, 0.62, 0.48, 0.55); f.add(body);
    const bl = sphere(belly, 0.46, 0.34, 0.3); bl.position.set(0, -0.06, 0.32); f.add(bl);
    [-1, 1].forEach(s => {
        const eb = sphere(green, 0.22); eb.position.set(0.3 * s, 0.42, 0.18); f.add(eb);
        const e = sphere(white, 0.17); e.position.set(0.3 * s, 0.47, 0.3); f.add(e);
        const p = sphere(dark, 0.08); p.position.set(0.3 * s, 0.49, 0.45); f.add(p);
        const leg = sphere(green, 0.22, 0.12, 0.3); leg.position.set(0.45 * s, -0.36, 0.22); f.add(leg);
        const ck = sphere(pink, 0.08, 0.05, 0.03); ck.position.set(0.42 * s, 0.1, 0.48); f.add(ck);
    });
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 8, 24, Math.PI), dark); mouth.rotation.z = Math.PI; mouth.position.set(0, 0.12, 0.53); f.add(mouth);
    return shadowed(f);
}
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
                }, (k) => k, () => { st.frog.position.set(0, 3.4, 0.2); st.frog.rotation.set(0, 0, 0); st.frog.scale.setScalar(0.95); });
                shake(st.jar, 0.06, 500);
            } else { st.frog.position.set(0, 3.4, 0.2); st.frog.scale.setScalar(0.95); }
        }
    },
    camera() { frameCamera(new THREE.Vector3(0, 4.6, 9.6), new THREE.Vector3(0, 1.85, 0), 30); },
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

const KINDS = { hama: HM, chumcoc: CC, thaptre: TT, latcap: LP };
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
    const id = b.kind + ':' + (o.boardId ?? 'x') + ':' + (b.n || b.levels || (b.cards && b.cards.length) || 0);
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
    setAnchors(K.anchors(state), o.marks, o.colorOf);
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
    window.LcBoards3D = { ready: true, render };
    window.dispatchEvent(new Event('lc3d:ready'));
}
boot();
