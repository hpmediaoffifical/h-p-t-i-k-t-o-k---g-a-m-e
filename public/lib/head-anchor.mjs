// public/lib/head-anchor.mjs — đỉnh đầu người thật trên camera OBS, cho game cần đặt thứ gì đó TRÊN ĐẦU
// (Level Quest trong 🎥 Game Camera). Không vẽ gì.
//
// Cùng hạ tầng với Bắn Cung / Đập Muỗi: server chụp nguồn camera TRONG scene OBS → 'touchplay:frame' (JPEG) +
// 'touchplay:layout' → HpTracker chạy MediaPipe Pose (chỉ pose: không model tay, không mặt nạ người cho nhẹ)
// → 33 điểm theo toạ độ trang overlay → bodyFrames() → headAnchor().
//
//   const h = new HeadAnchor({ socket, gameId: 'level-quest', width: innerWidth, height: innerHeight });
//   await h.setEnabled(true);
//   h.get()      → { crown:{x,y}, headW } | null (mất người / pose cũ hơn 700ms)
//   h.problem()  → lý do chưa chạy được ('' = ổn) — panel/console hiển thị, overlay không hiện chữ

import { HpTracker } from '/lib/hp-tracking.mjs';
import { cameraToStage } from '/lib/obs-scene-map.mjs';
import { bodyFrames, headAnchor } from '/lib/body-frames.mjs';

const FEED_EVT = 'touchplay:feed';          // tên sự kiện giữ nguyên — feed chung của mọi game camera
const FRESH_MS = 700;                       // pose cũ hơn mức này coi như mất người

export class HeadAnchor {
    constructor({ socket, gameId = 'level-quest', width = 1080, height = 1920, onStatus = null } = {}) {
        this.socket = socket; this.gameId = gameId; this.W = width; this.H = height;
        this.onStatus = onStatus || (() => {});
        this.enabled = false;
        this.layout = null; this.feedStatus = null; this.lastFrameAt = 0; this._busy = false;
        this.tracker = new HpTracker({ width, height, mirror: false, quality: 'auto', onStatus: (t, lv) => this.onStatus(t, lv) });
        this.tracker.want({ hands: false, pose: true, segment: false });
        this._F = null; this._poseAt = 0; this._anchor = null;
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
            // want() trước startExternal chỉ ghi nhớ — model pose chỉ nạp khi tracker đang chạy.
            this.tracker.want({ hands: false, pose: true, segment: false });
            if (this.socket.connected) this.socket.emit(FEED_EVT, this.gameId);
        } else {
            this.socket.emit(FEED_EVT, false);
            this.tracker.stop();
            this._F = null; this._anchor = null;
        }
    }

    async _onFrame(f) {
        if (!this.enabled || this._busy || !f?.img) return;
        this._busy = true;                  // đang giải mã thì bỏ khung mới — luôn dùng hình mới nhất
        try {
            const bmp = await createImageBitmap(new Blob([f.img], { type: 'image/jpeg' }));
            const M = cameraToStage(this.layout, bmp.width, bmp.height, this.W, this.H, this.gameId);
            this.tracker.pushFrame(bmp, M);
            this.lastFrameAt = performance.now();
        } catch (_) {} finally { this._busy = false; }
    }

    // Gọi mỗi khung vẽ. Chỉ tính lại khi model ra pose mới (~15–24 lần/giây); lọc mượt do overlay (followStep).
    get(now = performance.now()) {
        const t = this.tracker;
        if (!this.enabled || !t.pose || now - t.poseAt > FRESH_MS) { this._F = null; this._anchor = null; return null; }
        if (t.poseAt !== this._poseAt) {
            this._poseAt = t.poseAt;
            this._F = bodyFrames(t.pose, this._F);
            this._anchor = headAnchor(this._F);
        }
        return this._anchor;
    }

    problem() {
        if (!this.enabled) return '';
        const st = this.feedStatus || {};
        if (st.obsConnected === false) return 'App chưa kết nối OBS WebSocket (mục Hiệu ứng OBS trong app).';
        if (st.source === '') return 'Chưa chọn nguồn camera ở 🎥 Game Camera.';
        if (st.error === 'source-missing') return 'Không tìm thấy nguồn "' + st.source + '" trong OBS.';
        if (performance.now() - this.lastFrameAt > 4000) return 'Chưa nhận được hình camera từ OBS.';
        return '';
    }

    _reportStat() {
        if (!this.enabled || !this.socket.connected) return;
        const t = this.tracker;
        this.socket.emit('touchplay:overlayStat', { fps: t.fps, aiMs: t.aiMs, hands: 0, pose: this._anchor ? 1 : 0, delegate: t.delegate, phase: this.gameId });
    }
}
