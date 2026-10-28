// overlays/lib/hp-person-seg.mjs - mặt nạ người (độ tin 0..255) cho hp-matte.mjs, phục vụ tại /lib/hp-person-seg.mjs.
//
// Model MediaPipe Image Segmenter (tự host /lib/mediapipe, không cần mạng), chạy trong Web Worker
// (/lib/hp-person-seg-worker.js) - luồng chính không bị chặn lúc chờ GPU:
//   'multiclass' selfie_multiclass_256x256 - có lớp TÓC riêng, viền tóc/vai tốt hơn (~16 MB, chậm hơn)
//   'selfie'     selfie_segmenter           - nhanh, nhẹ (250 KB)
// Model chỉ nhìn ảnh 256×256: đưa NGUYÊN khung dọc 1080×1920 vào thì người chỉ còn ~80 px bề ngang. Nên:
//   - cắt SÁT vùng có người (khung người của lần trước, nới lề) rồi mới đưa vào model → người to gấp 2–3 lần;
//   - tiles=2: chia vùng người thành nửa trên / nửa dưới chồng mép, chạy 2 lần rồi ghép → tóc + bàn chân rõ hơn.
// Mất người → về nguyên khung để bắt lại.
//
//   const seg = new HpPersonSeg({ model, tiles }); await seg.ready();
//   const m = await seg.request(img, w, h);   // null = đang bận khung trước / không có kết quả
//   m → { data:Uint8Array, w, h, rect:[x,y,w,h] (0..1 trong ảnh), box:[x,y,w,h] px trong ảnh | null }

// 🌐 hpT(): ngôn ngữ của trang (overlays/lib/hp-i18n.js); trang chưa nạp thì giữ tiếng Việt (chỉ thay {biến}).
var hpT = (typeof globalThis !== 'undefined' && globalThis.hpT) || function (s, v) { return String(s).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, function (m, k) { return v && v[k] != null ? String(v[k]) : m; }); };

const INPUT = 384;      // cạnh dài mảnh cắt đưa vào model (model tự thu về 256; mặt nạ trả về đúng cỡ mảnh)
const PART = 0.56;      // tiles=2: mỗi mảnh cao 56 % vùng người (chồng 12 % ở giữa)

// HP Action LIVE chỉ giao kèm selfie_segmenter (250 KB) - model multiclass (~16 MB) chưa có trong bản cài → luôn dùng 'selfie'.
const pickModel = () => 'selfie';

export class HpPersonSeg {
    constructor({ model = 'multiclass', tiles = 1 } = {}) {
        this.model = pickModel(model);
        this.tiles = tiles === 2 ? 2 : 1;
        this.delegate = ''; this.error = '';
        this.box = null;            // khung người lần trước (0..1 trong ảnh, đã làm mượt) - null = chưa thấy
        this.found = false; this.ms = 0;
        this.busy = false;
        this._seq = 0; this._wait = new Map();
        this._ready = null; this._readyRes = null;
        this.worker = new Worker('/lib/hp-person-seg-worker.js');
        this.worker.onmessage = e => this._onMsg(e.data || {});
        this.worker.onerror = e => { this.error = e.message || hpT('worker lỗi'); };
        this._load();
    }
    get seg() { return this.delegate ? this : null; }     // tương thích chỗ cũ kiểm "đã nạp model"

    _load() {
        this.delegate = '';
        this._ready = new Promise((res, rej) => { this._readyRes = res; this._readyRej = rej; });
        this._ready.catch(() => {});
        this.worker.postMessage({ type: 'model', model: this.model });
    }
    ready() { return this._ready; }
    async setModel(model) {
        model = pickModel(model);
        if (model === this.model) return this.ready();
        this.model = model; this.box = null;
        this._load();
        return this.ready();
    }

    _onMsg(d) {
        if (d.type === 'ready') { if (d.model === this.model) { this.delegate = d.delegate; this.error = ''; this._readyRes?.(); } return; }
        if (d.type === 'error') { this.error = d.error; this._readyRej?.(new Error(d.error)); return; }
        if (d.type === 'mask') {
            const w = this._wait.get(d.id);
            if (!w) return;
            this._wait.delete(d.id);
            w(d);
        }
    }

    // Vùng cắt (0..1 trong ảnh): khung người lần trước nới lề; chưa có → nguyên khung.
    _roi() {
        const b = this.box;
        if (!b) return [0, 0, 1, 1];
        const mx = b[2] * 0.22 + 0.03, mt = b[3] * 0.12 + 0.03, mb = b[3] * 0.08 + 0.02;
        const x0 = Math.max(0, b[0] - mx), y0 = Math.max(0, b[1] - mt);
        const x1 = Math.min(1, b[0] + b[2] + mx), y1 = Math.min(1, b[1] + b[3] + mb);
        return [x0, y0, x1 - x0, y1 - y0];
    }

    async request(img, iw, ih) {
        if (this.busy || !this.delegate) return null;
        this.busy = true;
        const t0 = performance.now();
        try {
            const rect = this._roi();
            const rx = rect[0] * iw, ry = rect[1] * ih, rw = rect[2] * iw, rh = rect[3] * ih;
            const two = this.tiles === 2 && rh > rw * 1.2;
            const parts = two ? [[rx, ry, rw, rh * PART], [rx, ry + rh * (1 - PART), rw, rh * PART]] : [[rx, ry, rw, rh]];
            const tiles = await Promise.all(parts.map(([sx, sy, sw, sh]) => {
                const k = INPUT / Math.max(sw, sh);
                return createImageBitmap(img, Math.round(sx), Math.round(sy), Math.max(1, Math.round(sw)), Math.max(1, Math.round(sh)),
                    { resizeWidth: Math.max(16, Math.round(sw * k)), resizeHeight: Math.max(16, Math.round(sh * k)), resizeQuality: 'medium' });
            }));
            const id = ++this._seq;
            const d = await new Promise(res => {
                this._wait.set(id, res);
                this.worker.postMessage({ type: 'seg', id, tiles, overlap: PART }, tiles);
                setTimeout(() => { if (this._wait.delete(id)) res({ data: null }); }, 3000);
            });
            if (!d.data) return null;
            if (d.box) {
                const nb = [rect[0] + d.box[0] * rect[2], rect[1] + d.box[1] * rect[3], d.box[2] * rect[2], d.box[3] * rect[3]];
                this.box = this.box ? nb.map((v, i) => this.box[i] + (v - this.box[i]) * 0.6) : nb;
                this.found = true;
            } else { this.box = null; this.found = false; }
            this.ms = this.ms * 0.85 + (performance.now() - t0) * 0.15;
            const box = d.box ? [rx + d.box[0] * rw, ry + d.box[1] * rh, d.box[2] * rw, d.box[3] * rh] : null;
            return { data: d.data, w: d.w, h: d.h, rect, box };
        } catch (e) {
            this.error = String(e?.message || e);
            return null;
        } finally { this.busy = false; }
    }

    close() { try { this.worker.terminate(); } catch (_) {} }
}
