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

    // Nhịp tim từ tracker: cùng id → chỉ gia hạn (trả false = không đổi); id khác → thay active (true).
    function heartbeat(trackerId, socketId) {
        if (active && active.id === trackerId) { active.lastSeen = now(); if (socketId) active.socketId = socketId; return false; }
        setActive(trackerId, socketId);
        return true;
    }
    function release(trackerId) { if (active && active.id === trackerId) { active = null; return true; } return false; }

    return { validateHand, setActive, activeId, touch, dropSocket, sweep, acceptHand, heartbeat, release };
}

const ALIGN_LEFT = 1, ALIGN_RIGHT = 2, ALIGN_TOP = 4, ALIGN_BOTTOM = 8;

// transform = GetSceneItemTransform().sceneItemTransform; base = GetVideoSettings() {baseWidth, baseHeight}
function sceneItemToCamRect(tr, base) {
    const n = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const srcW = n(tr.sourceWidth, 0), srcH = n(tr.sourceHeight, 0);
    const cropL = n(tr.cropLeft, 0), cropR = n(tr.cropRight, 0), cropT = n(tr.cropTop, 0), cropB = n(tr.cropBottom, 0);
    const cropW = Math.max(1, srcW - cropL - cropR), cropH = Math.max(1, srcH - cropT - cropB);
    // scale âm = OBS lật ngang/dọc: hình vẽ ngược từ điểm neo. Tính với |scale| rồi dời gốc, nhớ cờ flip.
    const flipX = n(tr.scaleX, 1) < 0, flipY = n(tr.scaleY, 1) < 0;
    let sx = Math.abs(n(tr.scaleX, 1)), sy = Math.abs(n(tr.scaleY, 1));
    const bt = String(tr.boundsType || 'OBS_BOUNDS_NONE');
    const al = tr.alignment == null ? 5 : n(tr.alignment, 5);
    const px = n(tr.positionX, 0), py = n(tr.positionY, 0);
    // Gốc (ox,oy) của HÌNH ĐÃ CROP trên canvas OBS.
    let ox, oy, dispW, dispH;
    if (bt === 'OBS_BOUNDS_NONE') {
        dispW = cropW * sx; dispH = cropH * sy;
        ox = (al & ALIGN_LEFT) ? px : (al & ALIGN_RIGHT) ? px - dispW : px - dispW / 2;
        oy = (al & ALIGN_TOP) ? py : (al & ALIGN_BOTTOM) ? py - dispH : py - dispH / 2;
    } else {
        // Hộp bounds bw×bh đặt theo `alignment`; hình scale f nằm trong hộp theo `boundsAlignment` (0 = giữa).
        const bw = Math.max(1, n(tr.boundsWidth, cropW)), bh = Math.max(1, n(tr.boundsHeight, cropH));
        let fx = bw / cropW, fy = bh / cropH;
        if (bt === 'OBS_BOUNDS_SCALE_INNER') { const f = Math.min(fx, fy); fx = fy = f; }
        else if (bt === 'OBS_BOUNDS_MAX_ONLY') { const f = Math.min(1, fx, fy); fx = fy = f; }
        else if (bt === 'OBS_BOUNDS_SCALE_OUTER') { const f = Math.max(fx, fy); fx = fy = f; }
        else if (bt === 'OBS_BOUNDS_SCALE_TO_WIDTH') { fy = fx; }
        else if (bt === 'OBS_BOUNDS_SCALE_TO_HEIGHT') { fx = fy; }
        // OBS_BOUNDS_STRETCH: fx, fy riêng
        sx = fx; sy = fy;
        dispW = cropW * sx; dispH = cropH * sy;
        const bx = (al & ALIGN_LEFT) ? px : (al & ALIGN_RIGHT) ? px - bw : px - bw / 2;
        const by = (al & ALIGN_TOP) ? py : (al & ALIGN_BOTTOM) ? py - bh : py - bh / 2;
        const ba = n(tr.boundsAlignment, 0);
        const kx = (ba & ALIGN_LEFT) ? 0 : (ba & ALIGN_RIGHT) ? 1 : 0.5;
        const ky = (ba & ALIGN_TOP) ? 0 : (ba & ALIGN_BOTTOM) ? 1 : 0.5;
        ox = bx + (bw - dispW) * kx;
        oy = by + (bh - dispH) * ky;
    }
    // Lật: toàn bộ hình vẽ soi gương quanh điểm neo (px,py); phần crop trái/phải (trên/dưới) đổi chỗ.
    if (flipX) ox = 2 * px - ox - dispW;
    if (flipY) oy = 2 * py - oy - dispH;
    const x = ox - (flipX ? cropR : cropL) * sx, y = oy - (flipY ? cropB : cropT) * sy;
    const w = srcW * sx, h = srcH * sy;
    const bw = Math.max(1, n(base && base.baseWidth, 1080)), bh = Math.max(1, n(base && base.baseHeight, 1920));
    const pct = (v, d) => Math.round((v / d) * 10000) / 100;
    return { xPercent: pct(x, bw), yPercent: pct(y, bh), widthPercent: pct(w, bw), heightPercent: pct(h, bh), flipX, flipY };
}

// Lấy đúng các trường SetSceneItemTransform chấp nhận để sao chép vị trí camera sang Scene quét.
// width/height/sourceWidth/sourceHeight là trường chỉ đọc → bỏ. bounds chỉ gửi khi khác NONE (OBS đòi ≥ 1).
function pickTransformForCopy(tr) {
    const n = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const out = {
        positionX: n(tr.positionX, 0), positionY: n(tr.positionY, 0),
        scaleX: n(tr.scaleX, 1), scaleY: n(tr.scaleY, 1), rotation: n(tr.rotation, 0),
        alignment: tr.alignment == null ? 5 : n(tr.alignment, 5),
        cropLeft: n(tr.cropLeft, 0), cropRight: n(tr.cropRight, 0), cropTop: n(tr.cropTop, 0), cropBottom: n(tr.cropBottom, 0),
        boundsType: String(tr.boundsType || 'OBS_BOUNDS_NONE')
    };
    if (out.boundsType !== 'OBS_BOUNDS_NONE') {
        out.boundsWidth = Math.max(1, n(tr.boundsWidth, 1));
        out.boundsHeight = Math.max(1, n(tr.boundsHeight, 1));
        out.boundsAlignment = n(tr.boundsAlignment, 0);
    }
    return out;
}

// Dựng Scene quét riêng: Scene chỉ chứa tham chiếu camera với transform y hệt Scene live.
// `call(requestType, data)` = obs-websocket. Không bao giờ ghi vào Scene live; lỗi (camera không có
// trong Scene live, OBS từ chối) ném ra trước khi tạo bất cứ thứ gì.
async function ensureScanScene(call, { liveScene, source, scanScene }) {
    const idr = await call('GetSceneItemId', { sceneName: liveScene, sourceName: source });
    const tr = (await call('GetSceneItemTransform', { sceneName: liveScene, sceneItemId: idr.sceneItemId })).sceneItemTransform || {};
    const scenes = (await call('GetSceneList')).scenes || [];
    let created = false;
    if (!scenes.some(sc => sc.sceneName === scanScene)) { await call('CreateScene', { sceneName: scanScene }); created = true; }
    const items = (await call('GetSceneItemList', { sceneName: scanScene })).sceneItems || [];
    const item = items.find(it => it.sourceName === source);
    let sceneItemId;
    if (!item) sceneItemId = (await call('CreateSceneItem', { sceneName: scanScene, sourceName: source, sceneItemEnabled: true })).sceneItemId;
    else {
        sceneItemId = item.sceneItemId;
        if (item.sceneItemEnabled === false) await call('SetSceneItemEnabled', { sceneName: scanScene, sceneItemId, sceneItemEnabled: true });
    }
    const transform = pickTransformForCopy(tr);
    await call('SetSceneItemTransform', { sceneName: scanScene, sceneItemId, sceneItemTransform: transform });
    return { scanScene, sceneItemId, created, transform };
}

module.exports = { createRelay, sceneItemToCamRect, pickTransformForCopy, ensureScanScene };
