'use strict';
/* Chém Trái Cây — phần thuần của relay tay: validate gói landmarks, trọng tài "một tracker active",
 * và quy đổi transform scene item của OBS ra vùng camera (%). Không phụ thuộc socket.io. */

const MAX_ID = 32;
const PTS_LEN = 42;

function round3(v) { return Math.round(v * 1000) / 1000; }

function createRelay(opts) {
    opts = opts || {};
    const now = typeof opts.now === 'function' ? opts.now : Date.now;
    const staleMs = Number.isFinite(opts.staleMs) ? opts.staleMs : 3000;
    let active = null; // { id, socketId, lastSeen }

    function validateHand(data) {
        if (!data || typeof data !== 'object') return null;
        if (typeof data.id !== 'string' || !data.id || data.id.length > MAX_ID) return null;
        if (!Array.isArray(data.hands) || data.hands.length > 2) return null;
        const hands = [];
        for (const h of data.hands) {
            if (!h || typeof h !== 'object') return null;
            if (h.side !== 'L' && h.side !== 'R') return null;
            if (!Array.isArray(h.pts) || h.pts.length !== PTS_LEN) return null;
            const pts = new Array(PTS_LEN);
            for (let i = 0; i < PTS_LEN; i++) {
                const v = h.pts[i];
                if (typeof v !== 'number' || !Number.isFinite(v)) return null;
                pts[i] = round3(Math.min(1, Math.max(0, v)));
            }
            hands.push({ side: h.side, pts });
        }
        const t = Number.isFinite(data.t) ? data.t : now();
        const fps = Number.isFinite(data.fps) ? Math.max(0, Math.min(240, Math.round(data.fps))) : 0;
        const aspect = Number.isFinite(data.aspect) && data.aspect > 0 ? Math.min(10, data.aspect) : 16 / 9;
        return { id: data.id, t, fps, aspect, hands };
    }

    function setActive(trackerId, socketId) { active = { id: trackerId, socketId, lastSeen: now() }; }
    function activeId() { return active ? active.id : null; }
    function touch(trackerId) { if (active && active.id === trackerId) active.lastSeen = now(); }
    function dropSocket(socketId) { if (active && active.socketId === socketId) { active = null; return true; } return false; }
    function sweep() { if (active && now() - active.lastSeen > staleMs) { active = null; return true; } return false; }
    function acceptHand(data, socketId) {
        const v = validateHand(data);
        if (!v || !active || v.id !== active.id) return null;
        active.lastSeen = now();
        if (socketId) active.socketId = socketId;
        return v;
    }

    return { validateHand, setActive, activeId, touch, dropSocket, sweep, acceptHand };
}

const ALIGN_LEFT = 1, ALIGN_RIGHT = 2, ALIGN_TOP = 4, ALIGN_BOTTOM = 8;

// transform = GetSceneItemTransform().sceneItemTransform; base = GetVideoSettings() {baseWidth, baseHeight}
function sceneItemToCamRect(tr, base) {
    const n = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const srcW = n(tr.sourceWidth, 0), srcH = n(tr.sourceHeight, 0);
    const cropL = n(tr.cropLeft, 0), cropR = n(tr.cropRight, 0), cropT = n(tr.cropTop, 0), cropB = n(tr.cropBottom, 0);
    const cropW = Math.max(1, srcW - cropL - cropR), cropH = Math.max(1, srcH - cropT - cropB);
    let sx = n(tr.scaleX, 1), sy = n(tr.scaleY, 1);
    const bt = String(tr.boundsType || 'OBS_BOUNDS_NONE');
    let dispW, dispH;
    if (bt === 'OBS_BOUNDS_NONE') {
        dispW = cropW * sx; dispH = cropH * sy;
    } else {
        const bw = Math.max(1, n(tr.boundsWidth, cropW)), bh = Math.max(1, n(tr.boundsHeight, cropH));
        let fx = bw / cropW, fy = bh / cropH;
        if (bt === 'OBS_BOUNDS_SCALE_INNER' || bt === 'OBS_BOUNDS_MAX_ONLY') { const f = Math.min(fx, fy); fx = fy = f; }
        else if (bt === 'OBS_BOUNDS_SCALE_OUTER') { const f = Math.max(fx, fy); fx = fy = f; }
        else if (bt === 'OBS_BOUNDS_SCALE_TO_WIDTH') { fy = fx; }
        else if (bt === 'OBS_BOUNDS_SCALE_TO_HEIGHT') { fx = fy; }
        sx = fx; sy = fy;
        dispW = cropW * sx; dispH = cropH * sy;
    }
    const al = tr.alignment == null ? 5 : n(tr.alignment, 5);
    const px = n(tr.positionX, 0), py = n(tr.positionY, 0);
    const ox = (al & ALIGN_LEFT) ? px : (al & ALIGN_RIGHT) ? px - dispW : px - dispW / 2;
    const oy = (al & ALIGN_TOP) ? py : (al & ALIGN_BOTTOM) ? py - dispH : py - dispH / 2;
    const x = ox - cropL * sx, y = oy - cropT * sy;
    const w = srcW * sx, h = srcH * sy;
    const bw = Math.max(1, n(base && base.baseWidth, 1080)), bh = Math.max(1, n(base && base.baseHeight, 1920));
    const pct = (v, d) => Math.round((v / d) * 10000) / 100;
    return { xPercent: pct(x, bw), yPercent: pct(y, bh), widthPercent: pct(w, bw), heightPercent: pct(h, bh) };
}

module.exports = { createRelay, sceneItemToCamRect };
