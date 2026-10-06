/* Chém Trái Cây — tracker: lấy hình (Scene/Source OBS qua server, hoặc webcam), chạy MediaPipe HandLandmarker,
 * gửi 21 điểm mỗi tay qua socket 'chemtraicay:hand'. Trọng tài: chỉ 1 tracker active (server quyết). */
import { FilesetResolver, HandLandmarker } from '/lib/mediapipe/vision_bundle.mjs';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
if (qs.get('embed') === '1') document.body.classList.add('embed');

const HAND_LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

let trackerId = sessionStorage.getItem('ctc-tracker-id');
if (!trackerId) { trackerId = 'trk_' + Math.random().toString(36).slice(2, 6); sessionStorage.setItem('ctc-tracker-id', trackerId); }

const socket = io({ transports: ['websocket', 'polling'] });
let cfg = { videoSource: { mode: 'obs-source', scene: '', source: '', fps: 15, width: 640 }, mirror: true };
let landmarker = null;
let running = false;        // người dùng đã bật
let paused = false;         // tracker khác đang active
let activeId = null;
let loopToken = 0;          // huỷ vòng cũ khi đổi nguồn
let stream = null;
let lastSend = 0, lastHadHands = false;
const smooth = { L: null, R: null };
let fpsCount = 0, fpsAt = performance.now();
let sourceAspect = 16 / 9;
let scenesCache = [];

const video = $('video'), frameCv = $('frame'), drawCv = $('draw');
const fctx = frameCv.getContext('2d'), dctx = drawCv.getContext('2d');

// ---------- trạng thái ----------
const st = { obs: '', src: '', model: '', sock: '', trk: '', rect: '' };
function renderStatus() {
    $('status').innerHTML = [
        st.sock, st.model, st.src, st.rect, st.obs, st.trk
    ].filter(Boolean).join('<br>');
}
function setStatus(k, html) { st[k] = html; renderStatus(); }
function msg(text) { const el = $('msg'); el.textContent = text || ''; el.classList.toggle('hidden', !text); }

// ---------- cấu hình ----------
async function loadConfig() {
    try {
        const c = await fetch('/api/games/chemtraicay/config').then(r => r.json());
        applyConfig(c, true);
    } catch (e) { /* giữ mặc định */ }
}
function applyConfig(c, first) {
    if (!c || typeof c !== 'object') return;
    const prev = JSON.stringify(cfg.videoSource);
    cfg = { ...cfg, ...c, videoSource: { mode: 'obs-scene', scene: '', source: '', fps: 15, width: 640, ...(c.videoSource || {}) } };
    renderSourceUI();
    if (!first && running && JSON.stringify(cfg.videoSource) !== prev) restartSource();
}
let saveTimer = null;
function saveVideoSource(patch) {
    cfg.videoSource = { ...cfg.videoSource, ...patch };
    renderSourceUI();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        try {
            const cur = await fetch('/api/games/chemtraicay/config').then(r => r.json());
            const body = { ...cur, videoSource: cfg.videoSource, mirror: $('chk-mirror').checked };
            const rect = await autoCamRect();
            if (rect) body.camRect = rect;
            await fetch('/api/games/chemtraicay/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        } catch (e) { /* non-fatal */ }
        if (running) restartSource();
    }, 350);
}
// Mode Source OBS: vùng camera trên overlay = transform của source trong scene (giống Touch & Play), lấy tự động.
async function autoCamRect() {
    const vs = cfg.videoSource;
    if (vs.mode !== 'obs-source' || !vs.scene || !vs.source) return null;
    try {
        const r = await fetch(`/api/chemtraicay/obs-transform?scene=${encodeURIComponent(vs.scene)}&source=${encodeURIComponent(vs.source)}`);
        const j = await r.json();
        if (!r.ok || !j.camRect) { setStatus('rect', `Vùng camera: <span class="warn">${j.error || r.status}</span>`); return null; }
        setStatus('rect', `Vùng camera: <span class="ok">tự lấy từ OBS</span> (x ${j.camRect.xPercent}% · y ${j.camRect.yPercent}% · rộng ${j.camRect.widthPercent}% · cao ${j.camRect.heightPercent}%)`);
        return j.camRect;
    } catch (e) { return null; }
}

// ---------- UI nguồn ----------
function renderSourceUI() {
    const vs = cfg.videoSource;
    document.querySelectorAll('.modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === vs.mode));
    $('obs-opts').classList.toggle('hidden', vs.mode === 'webcam');
    $('cam-opts').classList.toggle('hidden', vs.mode !== 'webcam');
    $('row-source').classList.toggle('hidden', vs.mode !== 'obs-source');
    $('sel-fps').value = String(vs.fps || 15);
    $('sel-width').value = String(vs.width || 640);
    if (typeof cfg.mirror === 'boolean') $('chk-mirror').checked = cfg.mirror;
    fillSelect($('sel-scene'), scenesCache, vs.scene, '— chọn scene —');
}
function fillSelect(sel, items, value, placeholder) {
    const cur = value || '';
    sel.innerHTML = '';
    const o0 = document.createElement('option'); o0.value = ''; o0.textContent = placeholder; sel.appendChild(o0);
    for (const it of items) { const o = document.createElement('option'); o.value = it.value; o.textContent = it.label; sel.appendChild(o); }
    if (cur && !items.some(i => i.value === cur)) { const o = document.createElement('option'); o.value = cur; o.textContent = cur + ' (không thấy)'; sel.appendChild(o); }
    sel.value = cur;
}
async function loadScenes() {
    try {
        const r = await fetch('/api/chemtraicay/obs-scenes').then(r => r.json());
        const list = Array.isArray(r) ? r : (r.scenes || r.items || r.list || []);
        scenesCache = list.map(s => { const n = typeof s === 'string' ? s : (s.sceneName || s.name || ''); return { value: n, label: n }; }).filter(s => s.value);
        setStatus('obs', scenesCache.length ? `OBS: <span class="ok">đã kết nối</span> (${scenesCache.length} scene)` : 'OBS: <span class="warn">chưa kết nối hoặc chưa có scene</span>');
    } catch (e) { scenesCache = []; setStatus('obs', 'OBS: <span class="bad">chưa kết nối</span> — vào mục Hiệu ứng OBS để kết nối'); }
    renderSourceUI();
    await loadSources();
}
async function loadSources() {
    const vs = cfg.videoSource;
    if (vs.mode !== 'obs-source' || !vs.scene) { fillSelect($('sel-source'), [], vs.source, '— chọn source —'); return; }
    try {
        const r = await fetch('/api/chemtraicay/obs-sources?scene=' + encodeURIComponent(vs.scene)).then(r => r.json());
        const items = (r.items || []).map(it => ({ value: it.name, label: it.name + (it.kind ? ` (${it.kind})` : '') }));
        fillSelect($('sel-source'), items, vs.source, '— chọn source —');
    } catch (e) { fillSelect($('sel-source'), [], vs.source, '— chọn source —'); }
}
async function loadCams() {
    try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const cams = devs.filter(d => d.kind === 'videoinput').map((d, i) => ({ value: d.deviceId, label: d.label || ('Camera ' + (i + 1)) }));
        fillSelect($('sel-cam'), cams, localStorage.getItem('ctc-cam') || (cams[0] && cams[0].value) || '', '— chọn camera —');
    } catch (e) { fillSelect($('sel-cam'), [], '', 'Không liệt kê được camera'); }
}

document.querySelectorAll('.modes button').forEach(b => b.addEventListener('click', () => saveVideoSource({ mode: b.dataset.mode })));
$('sel-scene').addEventListener('change', (e) => { saveVideoSource({ scene: e.target.value, source: '' }); loadSources(); });
$('sel-source').addEventListener('change', (e) => saveVideoSource({ source: e.target.value }));
$('sel-fps').addEventListener('change', (e) => saveVideoSource({ fps: Number(e.target.value) }));
$('sel-width').addEventListener('change', (e) => saveVideoSource({ width: Number(e.target.value) }));
$('btn-refresh').addEventListener('click', loadScenes);
$('sel-cam').addEventListener('change', (e) => { localStorage.setItem('ctc-cam', e.target.value); if (running) restartSource(); });
$('sel-res').addEventListener('change', (e) => { localStorage.setItem('ctc-res', e.target.value); if (running) restartSource(); });
$('chk-mirror').addEventListener('change', () => { video.classList.toggle('mirror', $('chk-mirror').checked); saveVideoSource({}); });
$('btn-toggle').addEventListener('click', () => (running ? stop() : start()));

// ---------- MediaPipe ----------
async function ensureModel() {
    if (landmarker) return landmarker;
    setStatus('model', 'Model: đang nạp…');
    const vision = await FilesetResolver.forVisionTasks('/lib/mediapipe/wasm');
    const mk = (delegate) => HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: '/lib/mediapipe/hand_landmarker.task', delegate },
        runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5
    });
    try { landmarker = await mk('GPU'); setStatus('model', 'Model: <span class="ok">sẵn sàng (GPU)</span>'); }
    catch (e) {
        try { landmarker = await mk('CPU'); setStatus('model', 'Model: <span class="ok">sẵn sàng (CPU)</span>'); }
        catch (e2) { setStatus('model', 'Model: <span class="bad">không nạp được</span> — ' + (e2 && e2.message || e2)); throw e2; }
    }
    return landmarker;
}

// ---------- gửi ----------
function emitHands(hands, w, h) {
    const now = performance.now();
    if (!hands.length) {
        if (lastHadHands) { socket.emit('chemtraicay:hand', { id: trackerId, t: Date.now(), fps: 0, aspect: w / h, hands: [] }); lastHadHands = false; }
        smooth.L = null; smooth.R = null;
        return;
    }
    if (now - lastSend < 16) return;
    lastSend = now; lastHadHands = true;
    socket.emit('chemtraicay:hand', { id: trackerId, t: Date.now(), fps: curFps, aspect: w / h, hands });
}
let curFps = 0;
function tickFps() { fpsCount++; const now = performance.now(); if (now - fpsAt >= 1000) { curFps = fpsCount; fpsCount = 0; fpsAt = now; $('fps').textContent = curFps + ' fps'; } }

function processResult(res, w, h, mirror) {
    const hands = [];
    const seen = { L: false, R: false };
    const lms = res && res.landmarks || [];
    for (let i = 0; i < lms.length && i < 2; i++) {
        const cat = res.handedness && res.handedness[i] && res.handedness[i][0] && res.handedness[i][0].categoryName || 'Right';
        let side = cat === 'Left' ? 'L' : 'R';
        if (mirror) side = side === 'L' ? 'R' : 'L';
        if (seen[side]) side = side === 'L' ? 'R' : 'L';
        seen[side] = true;
        const pts = new Array(42);
        const prev = smooth[side];
        for (let k = 0; k < 21; k++) {
            let x = lms[i][k].x, y = lms[i][k].y;
            if (mirror) x = 1 - x;
            if (prev) { x = prev[k * 2] * 0.5 + x * 0.5; y = prev[k * 2 + 1] * 0.5 + y * 0.5; }
            pts[k * 2] = Math.min(1, Math.max(0, x)); pts[k * 2 + 1] = Math.min(1, Math.max(0, y));
        }
        smooth[side] = pts;
        hands.push({ side, pts });
    }
    for (const s of ['L', 'R']) if (!seen[s]) smooth[s] = null;
    drawSkeleton(hands, w, h);
    if (!paused) emitHands(hands, w, h);
    tickFps();
}

function drawSkeleton(hands, w, h) {
    if (drawCv.width !== w || drawCv.height !== h) { drawCv.width = w; drawCv.height = h; }
    dctx.clearRect(0, 0, w, h);
    for (const hd of hands) {
        const col = hd.side === 'L' ? '#8cdcff' : '#ffffff';
        dctx.strokeStyle = col; dctx.lineWidth = Math.max(2, w / 320);
        for (const [a, b] of HAND_LINKS) { dctx.beginPath(); dctx.moveTo(hd.pts[a * 2] * w, hd.pts[a * 2 + 1] * h); dctx.lineTo(hd.pts[b * 2] * w, hd.pts[b * 2 + 1] * h); dctx.stroke(); }
        dctx.fillStyle = col;
        for (let k = 0; k < 21; k++) { dctx.beginPath(); dctx.arc(hd.pts[k * 2] * w, hd.pts[k * 2 + 1] * h, k === 8 ? w / 80 : w / 200, 0, Math.PI * 2); dctx.fill(); }
        dctx.strokeStyle = '#ff6b3d'; dctx.lineWidth = 3; dctx.beginPath(); dctx.arc(hd.pts[16] * w, hd.pts[17] * h, w / 40, 0, Math.PI * 2); dctx.stroke();
    }
}

// ---------- nguồn: OBS ----------
async function runObs(token) {
    const vs = cfg.videoSource;
    const name = vs.mode === 'obs-scene' ? vs.scene : vs.source;
    video.classList.add('hidden'); frameCv.classList.remove('hidden');
    if (!name) { msg(vs.mode === 'obs-scene' ? 'Chọn Scene OBS để bắt đầu.' : 'Chọn Scene rồi chọn Source camera.'); setStatus('src', 'Nguồn: <span class="warn">chưa chọn</span>'); return; }
    setStatus('src', `Nguồn: ${vs.mode === 'obs-scene' ? 'Scene' : 'Source'} <b>${name}</b> @ ${vs.fps} hình/giây`);
    msg('');
    const interval = 1000 / Math.max(5, Math.min(30, Number(vs.fps) || 15));
    while (token === loopToken && running) {
        const t0 = performance.now();
        try {
            const r = await fetch('/api/chemtraicay/obs-frame?source=' + encodeURIComponent(name) + '&w=' + (Number(vs.width) || 640), { cache: 'no-store' });
            if (!r.ok) {
                let err = 'OBS lỗi ' + r.status; try { err = (await r.json()).error || err; } catch (e) {}
                msg(err + ' — thử lại sau 2 giây'); setStatus('obs', `OBS: <span class="bad">${err}</span>`);
                await sleep(2000); continue;
            }
            const blob = await r.blob();
            const bmp = await createImageBitmap(blob);
            if (token !== loopToken) { bmp.close(); break; }
            sourceAspect = bmp.width / bmp.height;
            if (frameCv.width !== bmp.width || frameCv.height !== bmp.height) { frameCv.width = bmp.width; frameCv.height = bmp.height; }
            fctx.drawImage(bmp, 0, 0);
            msg('');
            if (st.obs.includes('bad')) setStatus('obs', 'OBS: <span class="ok">đã kết nối</span>');
            const res = landmarker.detectForVideo(bmp, performance.now());
            processResult(res, bmp.width, bmp.height, false);
            bmp.close();
        } catch (e) {
            msg('Lỗi lấy hình: ' + (e && e.message || e)); await sleep(2000); continue;
        }
        const rest = interval - (performance.now() - t0);
        if (rest > 0) await sleep(rest);
    }
}

// ---------- nguồn: webcam ----------
async function runWebcam(token) {
    frameCv.classList.add('hidden'); video.classList.remove('hidden');
    video.classList.toggle('mirror', $('chk-mirror').checked);
    const [rw, rh] = (localStorage.getItem('ctc-res') || '640x360').split('x').map(Number);
    const deviceId = $('sel-cam').value || localStorage.getItem('ctc-cam') || '';
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: rw }, height: { ideal: rh }, frameRate: { ideal: 30 } }, audio: false });
    } catch (e) {
        const n = e && e.name;
        const text = n === 'NotFoundError' ? 'Không tìm thấy camera.' : n === 'NotAllowedError' ? 'Bị từ chối quyền camera.'
            : n === 'NotReadableError' ? 'Camera đang bị ứng dụng khác giữ (OBS?). Tắt nguồn camera trong OBS hoặc chọn camera khác.' : 'Không mở được camera: ' + (e && e.message || e);
        msg(text); setStatus('src', `Nguồn: <span class="bad">${text}</span>`); running = false; updateToggle(); return;
    }
    video.srcObject = stream; await video.play().catch(() => {});
    await loadCams();
    setStatus('src', `Nguồn: Webcam <b>${$('sel-cam').selectedOptions[0] && $('sel-cam').selectedOptions[0].textContent || ''}</b>`);
    msg('');
    let lastVt = -1;
    const tick = () => {
        if (token !== loopToken || !running) return;
        if (video.readyState >= 2 && video.currentTime !== lastVt) {
            lastVt = video.currentTime;
            sourceAspect = video.videoWidth / video.videoHeight;
            const res = landmarker.detectForVideo(video, performance.now());
            processResult(res, video.videoWidth, video.videoHeight, $('chk-mirror').checked);
            if ($('chk-mirror').checked) drawCv.style.transform = 'scaleX(-1)'; else drawCv.style.transform = '';
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

function stopStream() { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } video.srcObject = null; drawCv.style.transform = ''; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------- bật / tắt / đổi nguồn ----------
async function start() {
    running = true; updateToggle();
    try { await ensureModel(); } catch (e) { running = false; updateToggle(); msg('Không nạp được model nhận diện. Bấm Bật lại để thử.'); return; }
    socket.emit('chemtraicay:tracker', { id: trackerId, active: true });
    restartSource();
    // Source OBS: làm mới vùng camera mỗi lần bật (streamer có thể vừa dời/đổi cỡ camera trong OBS)
    autoCamRect().then(async (rect) => {
        if (!rect) return;
        try {
            const cur = await fetch('/api/games/chemtraicay/config').then(r => r.json());
            if (JSON.stringify(cur.camRect) === JSON.stringify(rect)) return;
            await fetch('/api/games/chemtraicay/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...cur, camRect: rect }) });
        } catch (e) { /* non-fatal */ }
    });
}
function stop() {
    running = false; loopToken++; stopStream(); updateToggle();
    socket.emit('chemtraicay:tracker', { id: trackerId, active: false });
    emitHands([], 16, 9);
    msg('Đã tắt nhận diện.'); $('fps').textContent = '0 fps';
    dctx.clearRect(0, 0, drawCv.width, drawCv.height);
}
function restartSource() {
    loopToken++; stopStream();
    const token = loopToken;
    if (!running) return;
    if (cfg.videoSource.mode === 'webcam') runWebcam(token); else runObs(token);
}
function updateToggle() {
    const b = $('btn-toggle');
    b.textContent = running ? '■ Tắt nhận diện' : '▶ Bật nhận diện';
    b.classList.toggle('stop', running);
}

// ---------- socket ----------
socket.on('connect', () => { setStatus('sock', 'App: <span class="ok">đã kết nối</span> · tracker <b>' + trackerId + '</b>'); socket.emit('subscribe', 'preview'); if (running) socket.emit('chemtraicay:tracker', { id: trackerId, active: true }); });
socket.on('disconnect', () => setStatus('sock', 'App: <span class="bad">mất kết nối</span>'));
socket.on('gameConfig', ({ gameId, config }) => { if (gameId === 'chemtraicay') applyConfig(config, false); });
socket.on('chemtraicay:trackerStatus', ({ activeId: id }) => {
    activeId = id || null;
    const wasPaused = paused;
    if (running && activeId && activeId !== trackerId) {
        // Tracker khác vừa lên active → dừng hẳn lấy hình/nhận diện (không tốn OBS/webcam), chờ tiếp quản.
        paused = true;
        if (!wasPaused) { loopToken++; stopStream(); msg('Đang dùng tracker khác — tạm dừng.'); }
        setStatus('trk', `Tracker: <span class="warn">tạm dừng — đang dùng tracker khác (${activeId})</span>`);
    } else if (running && !activeId) {
        paused = false; socket.emit('chemtraicay:tracker', { id: trackerId, active: true });
        if (wasPaused) restartSource();   // tiếp quản: bật lại lấy hình ngay, không chờ echo trạng thái
    } else {
        paused = false;
        if (wasPaused && running) restartSource();
        setStatus('trk', running ? 'Tracker: <span class="ok">đang gửi tay lên overlay</span>' : 'Tracker: chưa bật');
    }
});
// Nhịp tim: giữ quyền active khi tay ra khỏi khung lâu (server xóa active sau 3 s im lặng).
setInterval(() => { if (running && !paused && socket.connected) socket.emit('chemtraicay:tracker', { id: trackerId, active: true }); }, 1000);

(async () => {
    updateToggle(); renderStatus();
    await loadConfig();
    await loadScenes();
    if (cfg.videoSource.mode === 'webcam') loadCams();
    setStatus('trk', 'Tracker: chưa bật');
})();
