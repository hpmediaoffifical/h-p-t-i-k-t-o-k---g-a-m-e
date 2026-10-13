// public/games/bancung/body-track.mjs — Bắn Cung bám theo người thật.
//
// Dùng chung hạ tầng với Touch & Play: server chụp nguồn camera TRONG scene OBS → gửi JPEG qua
// socket ('touchplay:frame' + bố cục 'touchplay:layout') → HpTracker chạy MediaPipe Pose → 33 điểm
// cơ thể theo toạ độ sân khấu (1080×1920). Overlay nền trong suốt, camera thật vẫn do OBS vẽ dưới.
//
// Module này KHÔNG vẽ gì — chỉ trả lời cho overlay:
//   body()             → đầu (tâm, bề rộng, đỉnh đầu) + khung thân (vai, hông) đã lọc mượt, hoặc null
//   pickTarget(head)   → điểm trúng ngẫu nhiên trên thân / đầu, kèm toạ độ CỤC BỘ theo khung cơ thể
//   toStage(mark)      → đổi toạ độ cục bộ đó về sân khấu theo tư thế HIỆN TẠI (vết máu dính người)
//
// Toạ độ cục bộ: P = O + a·u + b·v. Khung THÂN: O = giữa hai vai, u = vai trái→vai phải, v = vai→hông.
// Khung ĐẦU: O = tâm đầu, u = tai trái→tai phải, v = vuông góc hướng xuống. Người xoay/di chuyển
// thì (a,b) giữ nguyên, điểm trên sân khấu đi theo.

import { HpTracker, sharedTracker } from '/lib/hp-tracking.mjs';
import { cameraToStage, apply } from '/lib/obs-scene-map.mjs';
import { smoothMask, toAlpha, downsample2 } from '/games/bancung/mask-smooth.mjs';

const FEED_EVT = 'touchplay:feed';          // tên sự kiện giữ nguyên — cùng feed với Touch & Play
const FRESH_MS = 700;                       // pose cũ hơn mức này coi như mất người
const VIS = 0.5;                            // visibility tối thiểu để tin một điểm

// Tâm (trọng tâm) các điểm có độ tin ≥ thr của mặt nạ w×h, theo điểm ảnh mặt nạ. null nếu gần như trống.
function centroid(v, w, h, thr) {
    let a = 0, sx = 0, sy = 0;
    for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
        const q = v[i];
        if (q >= thr) { a += q; sx += q * x; sy += q * y; }
    }
    return a > 50 ? { x: sx / a, y: sy / a } : null;
}

export class BcBodyTrack {
    constructor({ socket, width = 1080, height = 1920, gameId = 'bancung', onStatus = null } = {}) {
        this.socket = socket; this.W = width; this.H = height; this.gameId = gameId;
        this.onStatus = onStatus || (() => {});
        this.enabled = false;
        this.layout = null; this.feedStatus = null; this.lastFrameAt = 0; this._busy = false;
        // Trong 🎥 Game Camera: bộ nhận diện chung của overlay mẹ (chơi kèm game khác không nhận diện 2 lần).
        this.tracker = sharedTracker(gameId, { width, height }) || new HpTracker({ width, height, mirror: false, quality: 'auto', onStatus: (t, lv) => this.onStatus(t, lv) });
        // Chỉ cần body (bỏ model tay cho nhẹ) + mặt nạ người để tô đỏ / cháy đen đúng hình người.
        this.tracker.want({ hands: false, pose: true, segment: true });
        this._smooth = null;
        this._segCanvas = document.createElement('canvas');
        this._segCtx = this._segCanvas.getContext('2d');
        this._segImg = null; this._segBuiltAt = -1;
        this.maskSmooth = true;             // làm mượt viền người (panel tắt được nếu máy yếu / có lỗi)
        this._ms = {};                      // trạng thái bộ lọc mặt nạ giữa các khung
        this._segRawC = null;               // tâm mặt nạ thô khung trước (điểm ảnh mặt nạ) — để dời bộ đệm lọc
        this._segC = null;                  // tâm mặt nạ đang hiển thị (sân khấu)
        this._segDraw = null;               // vị trí hiển thị đang trượt mượt về _segC                // 33 điểm đã lọc EMA (toạ độ sân khấu)
        this._smoothAt = 0;
        this._lastPoseAt = 0;
        socket.on('touchplay:frame', f => this._onFrame(f));
        socket.on('touchplay:layout', l => { this.layout = l; });
        socket.on('touchplay:feedStatus', st => { this.feedStatus = st; });
        socket.on('connect', () => { if (this.enabled) socket.emit(FEED_EVT, this.gameId); });   // app khởi động lại → nối lại
        this._statTimer = setInterval(() => this._reportStat(), 2000);
    }

    async setEnabled(on) {
        on = !!on;
        if (on === this.enabled) return;
        this.enabled = on;
        if (on) {
            try { await this.tracker.startExternal(); } catch (e) { this.onStatus(e?.message || String(e), 'error'); }
            this.tracker.want({ hands: false, pose: true, segment: true });
            if (this.socket.connected) this.socket.emit(FEED_EVT, this.gameId);   // báo id → server ưu tiên nguồn camera của Bắn Cung
        } else {
            this.socket.emit(FEED_EVT, false);
            this.tracker.stop();
            this._smooth = null;
        }
    }

    async _onFrame(f) {
        if (!this.enabled || this._busy || !f?.img) return;
        if (this.tracker.shared) { this.lastFrameAt = performance.now(); return; }   // overlay mẹ đã giải mã + nhận diện
        this._busy = true;                  // đang giải mã thì bỏ khung mới — luôn dùng hình mới nhất
        try {
            const bmp = await createImageBitmap(new Blob([f.img], { type: 'image/jpeg' }));
            const M = cameraToStage(this.layout, bmp.width, bmp.height, this.W, this.H, this.gameId);
            this.tracker.pushFrame(bmp, M);
            this.lastFrameAt = performance.now();
        } catch (_) {} finally { this._busy = false; }
    }

    // Gọi mỗi khung vẽ: kéo điểm lọc về điểm mới nhất của model (model ~15–24 lần/giây, vẽ 60).
    tick(now = performance.now()) {
        const t = this.tracker;
        const raw = t.pose;
        if (!raw || now - t.poseAt > FRESH_MS) { if (now - this._lastPoseAt > FRESH_MS) this._smooth = null; return; }
        this._lastPoseAt = t.poseAt;
        if (!this._smooth) { this._smooth = raw.map(p => ({ x: p.x, y: p.y, v: p.v })); this._smoothAt = now; return; }
        // Lọc theo thời gian thật để tốc độ mượt không phụ thuộc fps của OBS.
        const dt = Math.min(100, now - this._smoothAt); this._smoothAt = now;
        const k = 1 - Math.exp(-dt / 55);   // ~55ms hằng số thời gian: bám sát mà không rung
        for (let i = 0; i < raw.length; i++) {
            const s = this._smooth[i], r = raw[i];
            s.x += (r.x - s.x) * k; s.y += (r.y - s.y) * k; s.v = r.v;
        }
    }

    get tracking() { return !!this._smooth; }
    // 33 điểm đã lọc (toạ độ sân khấu, kèm v = visibility) — để overlay vẽ bóng người. null khi mất người.
    points() { return this._smooth; }

    // Mặt nạ người dạng ảnh (trắng, alpha = độ tin) + ma trận pixel mặt nạ → sân khấu. null khi chưa có / quá cũ.
    // Chỉ dựng lại ảnh khi model ra mặt nạ mới (~12–20 lần/giây), overlay vẽ lại mỗi khung thì dùng chung.
    segMask(now = performance.now()) {
        const t = this.tracker, s = t.seg;
        if (!s || now - t.segAt > 450 || !this._smooth) return null;
        if (this._segBuiltAt !== t.segAt) {
            this._segBuiltAt = t.segAt;
            const c = this._segCanvas;
            const fit = (w, h) => {
                if (c.width !== w || c.height !== h) { c.width = w; c.height = h; this._segImg = null; this._ms = {}; this._segRawC = null; }
                if (!this._segImg) this._segImg = this._segCtx.createImageData(w, h);
                return this._segImg.data;
            };
            let done = false, cOut = null;
            if (this.maskSmooth) {
                try {
                    // Nửa độ phân giải (mặt nạ của model vốn thô hơn cỡ ảnh) → nhẹ ~4 lần, viền vẫn mịn sau khi phóng.
                    const half = Math.max(s.w, s.h) > 400;
                    const src = half ? downsample2(s.data, s.w, s.h, this._dsSt || (this._dsSt = {})) : { data: s.data, w: s.w, h: s.h };
                    const f = half ? 2 : 1;
                    const px = fit(src.w, src.h);
                    // Dời bộ đệm theo tâm mặt nạ THÔ (khung trước → khung này) để lọc thời gian không làm trễ chuyển động.
                    const cRaw = centroid(src.data, src.w, src.h, 0.5);
                    const shift = cRaw && this._segRawC ? [cRaw.x - this._segRawC.x, cRaw.y - this._segRawC.y] : [0, 0];
                    this._segRawC = cRaw;
                    const radius = Math.max(1, Math.round(Math.max(src.w, src.h) / 160));
                    const vals = smoothMask(this._ms, src.data, src.w, src.h, { radius, temporal: true, shift });
                    toAlpha(vals, px, 0, 1);
                    this._segM = [s.M[0] * f, s.M[1] * f, s.M[2] * f, s.M[3] * f, s.M[4], s.M[5]];
                    cOut = centroid(vals, src.w, src.h, 0.5);
                    done = true;
                } catch (e) {
                    console.warn('[bancung-track] làm mượt mặt nạ lỗi — dùng mặt nạ thô:', e);
                    this.maskSmooth = false;
                }
            }
            // Mặt nạ thô: bờ mềm 0.3 → 0.7 (như bản đầu).
            if (!done) { toAlpha(s.data, fit(s.w, s.h), 0.3, 0.7); this._segM = s.M; }
            this._segCtx.putImageData(this._segImg, 0, 0);
            // Tâm của CHÍNH mặt nạ đang hiển thị, trên sân khấu.
            this._segC = cOut ? apply(this._segM, cOut.x, cOut.y) : null;
        }
        // Model ra mặt nạ 12–20 lần/giây, màn hình vẽ 60. Vị trí hiển thị (_segDraw) trượt mượt về tâm mặt nạ mới
        // nhất; mặt nạ được dời một đoạn (dx,dy) = vị trí hiển thị − tâm thật của nó. Lúc mặt nạ mới tới, nội dung
        // dịch bao nhiêu thì (dx,dy) dịch ngược bấy nhiêu → không nhảy cóc; sau đó lướt dần vào đúng chỗ.
        let dx = 0, dy = 0;
        const C = this.maskSmooth ? this._segC : null;
        if (C) {
            const B = this.body(), lim = B ? B.shoulderW * 0.6 : 80;
            const d = this._segDraw;
            if (!d || Math.hypot(C.x - d.x, C.y - d.y) > lim * 2) this._segDraw = { x: C.x, y: C.y, at: now };
            else {
                const k = 1 - Math.exp(-Math.min(100, now - d.at) / 60);   // ~60ms, cùng nhịp với khung xương
                d.x += (C.x - d.x) * k; d.y += (C.y - d.y) * k; d.at = now;
            }
            dx = Math.max(-lim, Math.min(lim, this._segDraw.x - C.x));
            dy = Math.max(-lim, Math.min(lim, this._segDraw.y - C.y));
        } else this._segDraw = null;
        return { canvas: this._segCanvas, M: this._segM || s.M, dx, dy };
    }

    // Đầu + thân từ 33 điểm đã lọc. null khi không thấy người hoặc thiếu vai.
    body() {
        const P = this._smooth;
        if (!P) return null;
        const ok = i => P[i] && (P[i].v ?? 1) >= VIS;
        if (!ok(11) || !ok(12)) return null;
        // Vai: xếp theo bên MÀN HÌNH (ảnh có thể đã lật), không tin nhãn trái/phải của model.
        const [lS, rS] = P[11].x <= P[12].x ? [P[11], P[12]] : [P[12], P[11]];
        const S = { x: (lS.x + rS.x) / 2, y: (lS.y + rS.y) / 2 };
        const u = { x: rS.x - lS.x, y: rS.y - lS.y };
        const shoulderW = Math.hypot(u.x, u.y) || 1;
        let v;
        if (ok(23) && ok(24)) {
            const hip = { x: (P[23].x + P[24].x) / 2, y: (P[23].y + P[24].y) / 2 };
            v = { x: hip.x - S.x, y: hip.y - S.y };
        } else {
            // Hông ngoài khung (ngồi sát camera) → thân dài ~1.4 lần bề vai, vuông góc với vai, hướng xuống.
            const n = { x: -u.y / shoulderW, y: u.x / shoulderW };
            if (n.y < 0) { n.x = -n.x; n.y = -n.y; }
            v = { x: n.x * shoulderW * 1.4, y: n.y * shoulderW * 1.4 };
        }
        // Đầu: tâm = giữa hai tai (không thì giữa hai mắt), bề rộng = khoảng tai.
        let head = null;
        const ears = ok(7) && ok(8), eyes = ok(2) && ok(5);
        if (ears || eyes || ok(0)) {
            let c, hu, width;
            if (ears) { const [a, b] = P[7].x <= P[8].x ? [P[7], P[8]] : [P[8], P[7]]; c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; hu = { x: b.x - a.x, y: b.y - a.y }; width = Math.hypot(hu.x, hu.y); }
            else if (eyes) { const [a, b] = P[2].x <= P[5].x ? [P[2], P[5]] : [P[5], P[2]]; c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 0 }; width = Math.hypot(b.x - a.x, b.y - a.y) * 2.3; hu = { x: width, y: 0 }; }
            else { c = { x: P[0].x, y: P[0].y - shoulderW * 0.1 }; width = shoulderW * 0.55; hu = { x: width, y: 0 }; }
            // Quay nghiêng thì hai tai chồng nhau → khoảng tai rất nhỏ; đầu người không hẹp hơn ~0.45 bề vai.
            width = Math.max(shoulderW * 0.45, Math.min(shoulderW * 0.9, width || shoulderW * 0.55));
            // Hướng ngang của đầu: theo tai nếu tai đủ xa nhau, không thì theo vai; độ dài = bề rộng đầu.
            const hl = Math.hypot(hu.x, hu.y);
            hu = hl > shoulderW * 0.25 ? { x: hu.x / hl * width, y: hu.y / hl * width } : { x: u.x / shoulderW * width, y: u.y / shoulderW * width };
            // Tai nằm khoảng giữa đầu → đỉnh đầu cao hơn tai ~0.72 bề rộng (tóc tính vào).
            const n = { x: -hu.y, y: hu.x }; const nl = Math.hypot(n.x, n.y) || 1;
            if (n.y < 0) { n.x = -n.x; n.y = -n.y; }
            const crown = { x: c.x - n.x / nl * width * 0.72, y: c.y - n.y / nl * width * 0.72 };
            head = { c, u: hu, v: { x: n.x / nl * width, y: n.y / nl * width }, width, crown };
        }
        return { torso: { O: S, u, v }, head, shoulderW, center: { x: S.x + v.x * 0.45, y: S.y + v.y * 0.45 } };
    }

    // Điểm trúng ngẫu nhiên. preferHead: true → chắc chắn vào đầu; false → 20% đầu, 80% thân.
    pickTarget(preferHead = false) {
        const B = this.body();
        if (!B) return null;
        const useHead = B.head && (preferHead || Math.random() < 0.2);
        const mark = useHead
            ? { frame: 'head', a: (Math.random() * 2 - 1) * 0.38, b: -0.55 + Math.random() * 0.95 }
            : (() => { const b = 0.05 + Math.random() * 0.85; return { frame: 'torso', a: (Math.random() * 2 - 1) * 0.42 * (1 - 0.3 * b), b }; })();   // xuống gần hông thì thon lại
        const p = this.toStage(mark, B);
        return p ? { ...p, ...mark } : null;
    }

    // Toạ độ cục bộ → sân khấu theo tư thế hiện tại. null khi mất người.
    toStage(mark, B = this.body()) {
        if (!B) return null;
        const f = mark.frame === 'head' ? B.head : B.torso;
        if (!f) return null;
        const O = f.O || f.c;
        return { x: O.x + f.u.x * mark.a + f.v.x * mark.b, y: O.y + f.u.y * mark.a + f.v.y * mark.b };
    }

    // Sân khấu → toạ độ cục bộ (dùng khi điểm chạm đã có sẵn, vd mũi tên bay tới điểm cũ).
    toLocal(x, y, frame = 'torso', B = this.body()) {
        if (!B) return null;
        const f = frame === 'head' ? B.head : B.torso;
        if (!f) return null;
        const O = f.O || f.c, det = f.u.x * f.v.y - f.u.y * f.v.x;
        if (Math.abs(det) < 1e-6) return null;
        const dx = x - O.x, dy = y - O.y;
        return { frame, a: (dx * f.v.y - dy * f.v.x) / det, b: (f.u.x * dy - f.u.y * dx) / det };
    }

    // Vì sao chưa chạy — chuỗi cho overlay/panel hiển thị. '' = ổn.
    problem() {
        if (!this.enabled) return '';
        const st = this.feedStatus || {};
        if (st.obsConnected === false) return 'App chưa kết nối OBS WebSocket (mục Hiệu ứng OBS trong app).';
        if (st.source === '') return 'Chưa chọn nguồn camera trong OBS cho Bắn Cung.';
        if (st.error === 'source-missing') return 'Không tìm thấy nguồn "' + st.source + '" trong OBS.';
        if (performance.now() - this.lastFrameAt > 4000) return 'Chưa nhận được hình camera từ OBS.';
        return '';
    }

    _reportStat() {
        if (!this.enabled || !this.socket.connected) return;
        const t = this.tracker;
        this.socket.emit('touchplay:overlayStat', { fps: t.fps, aiMs: t.aiMs, hands: 0, pose: this.tracking ? 1 : 0, delegate: t.delegate, phase: this.gameId });
    }
}
