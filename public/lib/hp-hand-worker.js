// overlays/lib/hp-hand-worker.js - chạy model TAY MediaPipe (HandLandmarker) trong luồng riêng (Web Worker cổ điển), phục vụ tại
// /lib/hp-hand-worker.js. Dùng bởi HpTracker({ handWorker: true }) (hp-tracking.mjs) - 💗 Bắn Tim của Bộ Tách Người.
// VÌ SAO (đo 2026-10-24, so 1.3.0 / 1.3.3 / 1.5.2 cùng máy): detectForVideo của model tay trên LUỒNG CHÍNH mất ~30-200 ms mỗi lần →
// lúc có lượt Heart Me (quà rẻ, mọi máy tự gắn từ 1.3.3) trang Bộ Tách Người tụt ~20 → 10-12 khung/s, tách người chập chờn, game giật.
// Worker cổ điển (không phải module) vì bộ nạp WASM của MediaPipe gọi importScripts (lỗi mediapipe #5257) - như hp-person-seg-worker.js.
//
// ← { type:'load', delegate:'GPU'|'CPU' }        → { type:'ready', delegate } | { type:'error', error }
// ← { type:'hand', id, bmp:ImageBitmap, ts }      → { type:'hands', id, landmarks:[[{x,y,z}×21]], handedness:[[{categoryName,score}]], ms }
'use strict';
const BASE = '/lib/mediapipe';
let hand = null, delegate = '', lastTs = 0;

async function load(want) {
    const vision = await import(BASE + '/vision_bundle.mjs');
    const fileset = { wasmLoaderPath: BASE + '/wasm/vision_wasm_internal.js', wasmBinaryPath: BASE + '/wasm/vision_wasm_internal.wasm' };
    // cùng thông số với HpTracker._create('hand') - kết quả y hệt bản chạy luồng chính
    const make = d => vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: BASE + '/hand_landmarker.task', delegate: d },
        canvas: new OffscreenCanvas(1, 1),
        runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5
    });
    if (want !== 'CPU') { try { hand = await make('GPU'); delegate = 'GPU'; return; } catch (e) { console.warn('[hp-hand-worker] GPU lỗi, chuyển CPU:', e && e.message || e); } }
    hand = await make('CPU'); delegate = 'CPU';
}

self.onmessage = async e => {
    const d = e.data || {};
    if (d.type === 'load') {
        try { await load(d.delegate); self.postMessage({ type: 'ready', delegate }); }
        catch (err) { self.postMessage({ type: 'error', error: String(err && err.message || err) }); }
        return;
    }
    if (d.type === 'hand') {
        const t0 = performance.now();
        let landmarks = [], handedness = [];
        try {
            if (hand && d.bmp) {
                const ts = lastTs = Math.max(lastTs + 1, Math.round(Number(d.ts) || performance.now()));
                const r = hand.detectForVideo(d.bmp, ts);
                landmarks = (r.landmarks || []).map(l => l.map(p => ({ x: p.x, y: p.y, z: p.z })));
                handedness = (r.handedness || []).map(h => h.map(c => ({ categoryName: c.categoryName, score: c.score })));
            }
        } catch (err) { console.warn('[hp-hand-worker] lỗi:', err && err.message || err); }
        finally { try { d.bmp && d.bmp.close(); } catch (_) {} }
        self.postMessage({ type: 'hands', id: d.id, landmarks, handedness, ms: performance.now() - t0 });
    }
};
