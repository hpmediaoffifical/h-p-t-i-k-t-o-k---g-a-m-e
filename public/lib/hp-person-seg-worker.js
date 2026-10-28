// overlays/lib/hp-person-seg-worker.js - chạy model tách người MediaPipe trong luồng riêng (Web Worker cổ điển),
// phục vụ tại /lib/hp-person-seg-worker.js. Luồng chính (overlay) không bị chặn lúc chờ GPU trả mặt nạ (~15–40 ms),
// hoạt cảnh rơi hố vẫn mượt.
// Worker cổ điển (không phải module) vì bộ nạp WASM của MediaPipe gọi importScripts (lỗi mediapipe #5257 với module worker);
// gói ESM vision_bundle nạp bằng import() động.
//
// ← { type:'model', model }                                   → { type:'ready', delegate } | { type:'error', error }
// ← { type:'seg', id, tiles:[ImageBitmap…], overlap }         → { type:'mask', id, data:Uint8Array, w, h, box:[x,y,w,h]|null (0..1 trong vùng cắt), ms }
'use strict';
const BASE = '/lib/mediapipe';
// HP Action LIVE: chỉ giao kèm selfie_segmenter.tflite (multiclass ~16 MB chưa có) → mọi yêu cầu dùng 'selfie'.
const MODELS = { selfie: 'selfie_segmenter.tflite' };
let seg = null, model = '', delegate = '', lastTs = 0, loading = null;

async function load(name) {
    if (!MODELS[name]) name = 'selfie';
    if (seg && model === name) return;
    try { seg?.close(); } catch (_) {}
    seg = null; model = name;
    const vision = await import(BASE + '/vision_bundle.mjs');
    const fileset = { wasmLoaderPath: BASE + '/wasm/vision_wasm_internal.js', wasmBinaryPath: BASE + '/wasm/vision_wasm_internal.wasm' };
    const make = d => vision.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: BASE + '/' + MODELS[name], delegate: d },
        canvas: new OffscreenCanvas(1, 1),
        runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false
    });
    let s;
    try { s = await make('GPU'); delegate = 'GPU'; }
    catch (e) { s = await make('CPU'); delegate = 'CPU'; }
    if (model !== name) { s.close(); return; }
    seg = s;
}

// Một mảnh → Float32 độ tin người (multiclass: 1 − nền; selfie: chính mặt nạ).
function run(bmp) {
    const ts = lastTs = Math.max(lastTs + 1, Math.round(performance.now()));
    const r = seg.segmentForVideo(bmp, ts);
    try {
        const masks = r.confidenceMasks || [];
        if (!masks.length) return null;
        const m = masks[0], a = m.getAsFloat32Array();
        const out = new Float32Array(a.length);
        if (masks.length > 1) for (let i = 0; i < a.length; i++) out[i] = 1 - a[i];
        else out.set(a);
        return { data: out, w: m.width, h: m.height };
    } finally { r.close?.(); }
}

function segment(tiles, overlap) {
    let mw, mh, data;
    if (tiles.length === 2) {
        // nửa trên phủ [0, 1−o0], nửa dưới phủ [o0, 1] (o0 = 1 − phần mỗi mảnh) - trộn tuyến tính ở dải chồng
        const top = run(tiles[0]), bot = run(tiles[1]);
        if (!top || !bot) return null;
        const part = overlap, o0 = 1 - part;
        mw = top.w; mh = Math.round(top.h / part);
        data = new Float32Array(mw * mh);
        for (let y = 0; y < mh; y++) {
            const v = (y + 0.5) / mh;
            const wt = v <= o0 ? 1 : v >= part ? 0 : (part - v) / (part - o0);
            const ty = Math.min(top.h - 1, Math.floor(v / part * top.h));
            const by = Math.max(0, Math.min(bot.h - 1, Math.floor((v - o0) / part * bot.h)));
            const ro = y * mw, rt = ty * top.w, rb = by * bot.w;
            for (let x = 0; x < mw; x++) {
                const bx = bot.w === mw ? x : Math.min(bot.w - 1, Math.floor(x * bot.w / mw));
                data[ro + x] = (wt > 0 ? top.data[rt + x] * wt : 0) + (wt < 1 ? bot.data[rb + bx] * (1 - wt) : 0);
            }
        }
    } else {
        const m = run(tiles[0]);
        if (!m) return null;
        mw = m.w; mh = m.h; data = m.data;
    }
    const u8 = new Uint8Array(mw * mh);
    let x0 = mw, y0 = mh, x1 = -1, y1 = -1, n = 0;
    for (let y = 0; y < mh; y++) {
        const ro = y * mw;
        for (let x = 0; x < mw; x++) {
            const v = data[ro + x];
            u8[ro + x] = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0;
            if (v > 0.5) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
    }
    const box = n > mw * mh * 0.004 ? [x0 / mw, y0 / mh, (x1 - x0 + 1) / mw, (y1 - y0 + 1) / mh] : null;
    return { data: u8, w: mw, h: mh, box };
}

self.onmessage = async (e) => {
    const d = e.data || {};
    if (d.type === 'model') {
        loading = load(d.model);
        try { await loading; self.postMessage({ type: 'ready', delegate, model }); }
        catch (err) { self.postMessage({ type: 'error', error: String(err?.message || err) }); }
        return;
    }
    if (d.type === 'seg') {
        const t0 = performance.now();
        try {
            if (loading) await loading.catch(() => {});
            if (!seg) { self.postMessage({ type: 'mask', id: d.id, data: null }); return; }
            const r = segment(d.tiles, d.overlap || 0.56);
            if (!r) { self.postMessage({ type: 'mask', id: d.id, data: null }); return; }
            self.postMessage({ type: 'mask', id: d.id, ...r, ms: performance.now() - t0 }, [r.data.buffer]);
        } catch (err) {
            self.postMessage({ type: 'mask', id: d.id, data: null, error: String(err?.message || err) });
        } finally { for (const b of d.tiles || []) b.close?.(); }
    }
};
