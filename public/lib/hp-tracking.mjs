// public/lib/hp-tracking.mjs — lớp nhận diện dùng chung cho game webcam.
//
// Chạy MediaPipe Tasks (tự host ở /lib/mediapipe, không cần mạng) và trả về tay / miệng /
// cơ thể theo TOẠ ĐỘ SÂN KHẤU (vd 1080×1920) — game chỉ việc đọc.
//
// Hai nguồn hình:
//   1. OBS (mặc định): server chụp nguồn camera trong scene OBS → pushFrame(bitmap, M).
//      M là ma trận ảnh → sân khấu tính từ transform scene item (obs-scene-map.mjs).
//      Overlay trong suốt, camera thật vẫn do OBS hiển thị bên dưới.
//   2. Webcam trực tiếp (dự phòng, thử trong app): startWebcam() — tự mở getUserMedia.
//
//   trk.want({ face:true, pose:false })  // model mặt/body chỉ chạy khi game cần
//   trk.want({ hands:false })            // game không cần tay (Bắn Cung) → không nạp/không chạy model tay
//   trk.want({ segment:true })           // kèm mặt nạ người từ model body (gọi TRƯỚC khi model pose nạp)
//   trk.seg   → { w, h, data:Float32Array(w*h) 0..1, M } | null   M: pixel mặt nạ → sân khấu
//   trk.hands → [{ id, pts:[{x,y}×21], tip, palm, pinch, pinching, size }]
//   trk.face  → { mouth:{x,y}, open:0..1, width } | null
//   trk.pose  → [{x,y,v}×33] | null      (có thể nằm ngoài sân khấu)
//
// Tay/mặt chạy trên phần ảnh ĐANG HIỆN trên sân khấu (cắt sát → tay to → bắt tốt hơn).
// Body chạy trên ảnh nguyên khung: dang tay chữ T là cổ tay đã ra ngoài khung dọc.

import { inv, apply } from './obs-scene-map.mjs';

const BASE = '/lib/mediapipe';
const RATE = { low: 15, auto: 24, high: 30 };        // lần nhận diện / giây tối đa
const INPUT = { low: 384, auto: 480, high: 640 };     // cạnh dài ảnh cắt đưa vào model tay/mặt

let visionModule = null;
async function loadVision() {
    if (!visionModule) visionModule = await import(BASE + '/vision_bundle.mjs');
    return visionModule;
}

export class HpTracker {
    constructor({ width = 1080, height = 1920, video = null, mirror = true, quality = 'auto', onStatus = null } = {}) {
        this.W = width; this.H = height;
        this.video = video || Object.assign(document.createElement('video'), { muted: true, playsInline: true });
        this.video.muted = true; this.video.playsInline = true;
        this.mirror = mirror; this.quality = quality;
        this.onStatus = onStatus || (() => {});
        this.mode = '';                 // '' | 'webcam' | 'external'
        this.stream = null;
        this.ext = null;                // { bitmap, M, seq } — khung mới nhất từ OBS
        this._doneSeq = -1;
        this.models = { hand: null, face: null, pose: null };
        this.loading = {}; this.failed = {};
        this.delegate = softwareGpu() ? 'CPU' : 'GPU';
        this.wanted = { hands: true, face: false, pose: false, segment: false };
        this.seg = null; this.segAt = 0;
        this.hands = []; this.face = null; this.pose = null;
        this.handsAt = 0; this.faceAt = 0; this.poseAt = 0;
        this.fps = 0; this.aiMs = 0; this.tick = 0;
        this.running = false; this.timer = 0; this.lastTs = 0;
        this.crop = document.createElement('canvas');
        this.full = document.createElement('canvas');
        this.cropCtx = this.crop.getContext('2d');
        this.fullCtx = this.full.getContext('2d');
        this._tracks = new Map();
    }

    status(text, level = 'info') { this.statusText = text; this.onStatus(text, level); }
    get active() { return this.running; }

    async listCameras() {
        try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput'); }
        catch (_) { return []; }
    }

    // ---------- nguồn 1: khung hình từ OBS ----------
    async startExternal() {
        this.stop();
        this.mode = 'external';
        if (this.wanted.hands) { this.status('Đang nạp mô hình nhận diện tay…'); await this._ensure('hand'); }
        this.running = true;
        this.status('Chờ hình camera từ OBS…');
        this._loop();
    }
    // bitmap: ImageBitmap ảnh chụp nguồn camera; M: ma trận pixel ảnh → sân khấu.
    pushFrame(bitmap, M) {
        if (this.mode !== 'external') { bitmap.close?.(); return; }
        const old = this.ext?.bitmap;
        this.ext = { bitmap, M, seq: (this.ext?.seq || 0) + 1 };
        if (old && old !== bitmap) old.close?.();
    }

    // ---------- nguồn 2: webcam trực tiếp ----------
    async startWebcam(deviceId = '') {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Trang này không được phép mở camera (cần localhost/https).');
        this.stop();
        this.mode = 'webcam';
        this.status('Đang mở camera…');
        const video = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
        if (deviceId) video.deviceId = { exact: deviceId };
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
        } catch (e) {
            if (deviceId && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
            else { this.mode = ''; throw new Error(cameraErrorText(e)); }
        }
        this.video.srcObject = this.stream;
        await this.video.play().catch(() => {});
        this.stream.getVideoTracks()[0]?.addEventListener('ended', () => { this.hands = []; this.face = null; this.pose = null; this.status('Camera đã ngắt — bấm bật lại.', 'error'); });
        this.status('Đang nạp mô hình nhận diện tay…');
        await this._ensure('hand');
        this.running = true;
        this.status('Đang nhận diện (' + this.delegate + ')', 'ok');
        this._loop();
        return this.stream.getVideoTracks()[0]?.getSettings()?.deviceId || '';
    }

    stop() {
        this.running = false; this.mode = '';
        clearTimeout(this.timer);
        if (this.stream) { for (const t of this.stream.getTracks()) t.stop(); this.stream = null; }
        if (this.video) this.video.srcObject = null;
        this.ext?.bitmap?.close?.(); this.ext = null;
        this.hands = []; this.face = null; this.pose = null; this.seg = null; this._tracks.clear();
    }

    want(opts) {
        Object.assign(this.wanted, opts);
        if (!this.running) return;
        if (this.wanted.face && !this.failed.face) this._ensure('face').catch(() => {});
        if (this.wanted.pose && !this.failed.pose) this._ensure('pose').catch(() => {});
    }

    async _create(kind) {
        const vision = await loadVision();
        const fileset = { wasmLoaderPath: BASE + '/wasm/vision_wasm_internal.js', wasmBinaryPath: BASE + '/wasm/vision_wasm_internal.wasm' };
        const spec = {
            hand: [vision.HandLandmarker, BASE + '/hand_landmarker.task', { numHands: 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 }],
            face: [vision.FaceLandmarker, BASE + '/face_landmarker.task', { numFaces: 1, outputFaceBlendshapes: true }],
            pose: [vision.PoseLandmarker, BASE + '/pose_landmarker_lite.task', { numPoses: 1, outputSegmentationMasks: !!this.wanted.segment }]
        }[kind];
        const make = delegate => spec[0].createFromOptions(fileset, { baseOptions: { modelAssetPath: spec[1], delegate }, runningMode: 'VIDEO', ...spec[2] });
        // GPU trước (OBS bật tăng tốc phần cứng); Electron của app tắt GPU → rơi về CPU.
        if (this.delegate === 'GPU') {
            try { return await make('GPU'); }
            catch (e) { console.warn('[hp-tracking] GPU delegate lỗi, chuyển CPU:', e?.message || e); this.delegate = 'CPU'; }
        }
        return make('CPU');
    }

    async _ensure(kind) {
        if (this.models[kind]) return this.models[kind];
        if (!this.loading[kind]) {
            this.loading[kind] = this._create(kind).then(m => { this.models[kind] = m; return m; })
                .catch(e => { this.loading[kind] = null; if (kind !== 'hand') this.failed[kind] = true; this.status('Không nạp được mô hình ' + kind + ': ' + (e?.message || e), 'error'); throw e; });
        }
        return this.loading[kind];
    }

    _loop() {
        if (!this.running) return;
        const interval = 1000 / (RATE[this.quality] || RATE.auto);
        const t0 = performance.now();
        let worked = false;
        try { worked = this._step(t0); } catch (e) { console.warn('[hp-tracking] step lỗi:', e); }
        const spent = performance.now() - t0;
        if (worked) this.aiMs = this.aiMs * 0.85 + spent * 0.15;
        // Nguồn OBS: chưa có khung mới thì hỏi lại sớm thay vì chờ trọn nhịp.
        this.timer = setTimeout(() => this._loop(), worked ? Math.max(4, interval - spent) : 8);
    }

    // Lấy ảnh + ma trận (pixel ảnh → sân khấu) của khung hiện tại.
    _source() {
        if (this.mode === 'external') {
            const e = this.ext;
            if (!e || e.seq === this._doneSeq) return null;
            this._doneSeq = e.seq;
            return { img: e.bitmap, w: e.bitmap.width, h: e.bitmap.height, M: e.M };
        }
        const v = this.video;
        if (!v || v.readyState < 2 || !v.videoWidth) return null;
        const w = v.videoWidth, h = v.videoHeight, s = Math.max(this.W / w, this.H / h);
        const ox = (this.W - w * s) / 2, oy = (this.H - h * s) / 2;
        // cover + lật gương khớp với <video style="object-fit:cover; transform:scaleX(-1)">
        const M = this.mirror ? [-s, 0, 0, s, this.W - ox, oy] : [s, 0, 0, s, ox, oy];
        return { img: v, w, h, M };
    }

    _step(now) {
        const src = this._source();
        if (!src) return false;
        if (this.mode === 'external' && this.statusText !== 'Đang nhận diện (' + this.delegate + ')') this.status('Đang nhận diện (' + this.delegate + ')', 'ok');
        const ts = Math.max(this.lastTs + 1, Math.round(now));
        this.lastTs = ts;
        this.tick++;
        const { img, w, h, M } = src;
        const Minv = inv(M);

        // Vùng ảnh đang hiện trên sân khấu (ngược 4 góc sân khấu về ảnh) → cắt cho tay/mặt.
        let x0 = 0, y0 = 0, x1 = w, y1 = h;
        if (Minv) {
            const cs = [[0, 0], [this.W, 0], [0, this.H], [this.W, this.H]].map(([x, y]) => apply(Minv, x, y));
            x0 = Math.max(0, Math.min(...cs.map(p => p.x))); x1 = Math.min(w, Math.max(...cs.map(p => p.x)));
            y0 = Math.max(0, Math.min(...cs.map(p => p.y))); y1 = Math.min(h, Math.max(...cs.map(p => p.y)));
            if (x1 - x0 < 8 || y1 - y0 < 8) { x0 = 0; y0 = 0; x1 = w; y1 = h; }   // camera không nằm trên sân khấu
        }
        const cw = x1 - x0, ch = y1 - y0, lim = INPUT[this.quality] || INPUT.auto;
        const k = Math.min(1, lim / Math.max(cw, ch));
        const iw = Math.max(16, Math.round(cw * k)), ih = Math.max(16, Math.round(ch * k));
        if (this.crop.width !== iw || this.crop.height !== ih) { this.crop.width = iw; this.crop.height = ih; }
        this.cropCtx.drawImage(img, x0, y0, cw, ch, 0, 0, iw, ih);
        // điểm chuẩn hoá trên ảnh cắt → sân khấu
        const cropTo = (nx, ny) => apply(M, x0 + nx * cw, y0 + ny * ch);

        if (this.wanted.hands && this.models.hand) this._readHands(this.models.hand.detectForVideo(this.crop, ts), now, cropTo);
        else if (!this.wanted.hands) this.hands = [];

        // Mặt và body chạy xen kẽ để không nhân đôi tải.
        const odd = this.tick % 2 === 1;
        if (this.wanted.face && this.models.face && (odd || !this.wanted.pose)) this._readFace(this.models.face.detectForVideo(this.crop, ts), now, cropTo);
        else if (!this.wanted.face) this.face = null;
        if (this.wanted.pose && this.models.pose && (!odd || !this.wanted.face)) {
            // Cần mặt nạ người (Bắn Cung) → ảnh vào lớn hơn chút cho viền mặt nạ mịn hơn.
            const kf = Math.min(1, (this.wanted.segment ? 640 : 512) / Math.max(w, h)), fw = Math.round(w * kf), fh = Math.round(h * kf);
            if (this.full.width !== fw || this.full.height !== fh) { this.full.width = fw; this.full.height = fh; }
            this.fullCtx.drawImage(img, 0, 0, fw, fh);
            const r = this.models.pose.detectForVideo(this.full, ts);
            try {
                this._readPose(r, now, (nx, ny) => apply(M, nx * w, ny * h));
                this._readSeg(r, now, M, w, h);
            } finally { r?.close?.(); }     // mặt nạ nằm trong bộ nhớ WASM/GPU — không đóng là rò
        } else if (!this.wanted.pose) this.pose = null;

        const dt = this._lastStep ? now - this._lastStep : 0;
        this._lastStep = now;
        if (dt > 0) this.fps = this.fps * 0.9 + (1000 / dt) * 0.1;
        return true;
    }

    _readHands(r, now, to) {
        const seen = new Set(), out = [];
        const list = r?.landmarks || [];
        for (let i = 0; i < list.length; i++) {
            const id = r.handedness?.[i]?.[0]?.categoryName || ('h' + i);
            if (seen.has(id)) continue;
            seen.add(id);
            const raw = list[i].map(p => to(p.x, p.y));
            let tr = this._tracks.get(id);
            if (!tr) { tr = raw.map(p => ({ ...p })); this._tracks.set(id, tr); }
            // EMA nhẹ: khử rung mà tay vẫn "dính" ngón, không trễ như lọc nặng.
            for (let j = 0; j < 21; j++) { tr[j].x += (raw[j].x - tr[j].x) * 0.6; tr[j].y += (raw[j].y - tr[j].y) * 0.6; }
            const size = Math.hypot(tr[0].x - tr[9].x, tr[0].y - tr[9].y) || 1;
            const pinchD = Math.hypot(tr[4].x - tr[8].x, tr[4].y - tr[8].y);
            const prev = this.hands.find(h => h.id === id);
            // Trễ (hysteresis): chụm < 0.35 cỡ bàn tay mới bắt, > 0.55 mới thả — khỏi rơi đồ giữa chừng.
            const pinching = prev?.pinching ? pinchD < size * 0.55 : pinchD < size * 0.35;
            const palm = [0, 5, 9, 13, 17];
            out.push({
                id, pts: tr, size, pinching, tip: tr[8],
                pinch: { x: (tr[4].x + tr[8].x) / 2, y: (tr[4].y + tr[8].y) / 2 },
                palm: { x: palm.reduce((s, j) => s + tr[j].x, 0) / 5, y: palm.reduce((s, j) => s + tr[j].y, 0) / 5 }
            });
        }
        for (const id of [...this._tracks.keys()]) if (!seen.has(id)) this._tracks.delete(id);
        this.hands = out;
        this.handsAt = now;
    }

    _readFace(r, now, to) {
        const lm = r?.faceLandmarks?.[0];
        if (!lm) { this.face = null; return; }
        const P = i => to(lm[i].x, lm[i].y);
        const up = P(13), lo = P(14), l = P(61), rr = P(291);
        const width = Math.hypot(l.x - rr.x, l.y - rr.y);
        const jaw = r.faceBlendshapes?.[0]?.categories?.find(c => c.categoryName === 'jawOpen')?.score;
        // Có blendshape thì tin jawOpen; không thì đo khe môi so với bề rộng miệng.
        const open = Number.isFinite(jaw) ? jaw : Math.min(1, Math.hypot(up.x - lo.x, up.y - lo.y) / Math.max(1, width) * 2);
        this.face = { mouth: { x: (up.x + lo.x) / 2, y: (up.y + lo.y) / 2 }, open, width };
        this.faceAt = now;
    }

    // Mặt nạ người (độ tin 0..1 mỗi pixel) cùng cỡ ảnh đưa vào model body → chép ra để dùng sau khi đóng kết quả.
    _readSeg(r, now, M, imgW, imgH) {
        const mk = r?.segmentationMasks?.[0];
        if (!mk || !r.landmarks?.[0]) { if (this.wanted.segment) this.seg = null; return; }
        const w = mk.width, h = mk.height;
        const src = mk.getAsFloat32Array();
        const data = this.seg && this.seg.data.length === src.length ? this.seg.data : new Float32Array(src.length);
        data.set(src);
        // pixel mặt nạ → pixel ảnh gốc → sân khấu
        const sx = imgW / w, sy = imgH / h;
        this.seg = { w, h, data, M: [M[0] * sx, M[1] * sx, M[2] * sy, M[3] * sy, M[4], M[5]] };
        this.segAt = now;
    }

    _readPose(r, now, to) {
        const lm = r?.landmarks?.[0];
        if (!lm) { this.pose = null; return; }
        this.pose = lm.map(p => ({ ...to(p.x, p.y), v: p.visibility ?? 1 }));
        this.poseAt = now;
    }
}

// WebGL chạy bằng phần mềm (SwiftShader / llvmpipe / Basic Render — OBS tắt "tăng tốc phần cứng",
// máy không driver) thì delegate GPU chậm hơn CPU nhiều lần → dùng CPU luôn.
function softwareGpu() {
    try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /swiftshader|llvmpipe|software|basic render/i.test(name);
    } catch (_) { return true; }
}

function cameraErrorText(e) {
    switch (e?.name) {
        case 'NotAllowedError': case 'SecurityError': return 'Bị chặn quyền camera.';
        case 'NotReadableError': case 'TrackStartError': case 'AbortError':
            return 'Camera đang bị chương trình khác giữ (OBS, TikTok LIVE Studio…). Dùng nguồn "Camera trong OBS" thay vì webcam trực tiếp.';
        case 'NotFoundError': case 'DevicesNotFoundError': return 'Không tìm thấy camera nào.';
        default: return (e?.name ? e.name + ': ' : '') + (e?.message || 'Không mở được camera');
    }
}

// ---- Tư thế: so GÓC tay thay vì toạ độ — không phụ thuộc người cao/thấp, đứng xa/gần. ----
// 4 góc (độ, hệ màn hình: 0 = sang phải, 90 = xuống, -90 = lên):
//   [cánh tay trái-màn-hình, cẳng tay trái-màn-hình, cánh tay phải-màn-hình, cẳng tay phải-màn-hình]
export function poseAngles(pose, minVis = 0.35) {
    if (!pose || pose.length < 17) return null;
    for (const i of [11, 12, 13, 14, 15, 16]) if ((pose[i].v ?? 1) < minVis) return null;
    // Không tin nhãn trái/phải của model (ảnh có thể đã lật) — xếp theo vai nào nằm bên trái màn hình.
    const leftFirst = pose[11].x <= pose[12].x;
    const A = leftFirst ? [11, 13, 15] : [12, 14, 16];
    const B = leftFirst ? [12, 14, 16] : [11, 13, 15];
    const ang = (a, b) => Math.atan2(pose[b].y - pose[a].y, pose[b].x - pose[a].x) * 180 / Math.PI;
    return [ang(A[0], A[1]), ang(A[1], A[2]), ang(B[0], B[1]), ang(B[1], B[2])];
}

export function angleDiff(a, b) {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
}

// Sai lệch lớn nhất trong 4 đoạn tay (độ). Nhỏ hơn ngưỡng ⇒ khớp.
export function poseError(live, target) {
    if (!live || !target) return 999;
    let worst = 0;
    for (let i = 0; i < 4; i++) worst = Math.max(worst, angleDiff(live[i], target[i]));
    return worst;
}
