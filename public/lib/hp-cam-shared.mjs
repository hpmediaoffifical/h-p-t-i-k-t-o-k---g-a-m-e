// public/lib/hp-cam-shared.mjs — MỘT bộ nhận diện cho mọi game con của 🎥 Game Camera.
//
// Overlay mẹ /overlay/camgames gọi createCamShared({ socket }) → window.__hpCamShared. Game con trong
// iframe (cùng origin) lấy tracker bằng sharedTracker(gameId) (hp-tracking.mjs) thay vì new HpTracker:
// chơi 2 game cùng lúc chỉ giải mã khung + chạy MediaPipe MỘT lần, model gộp theo nhu cầu (tay / mặt /
// body / mặt nạ người) của các game đang mở. Không game con nào cần → rời feed, OBS thôi chụp.
//
// Toạ độ: sân khấu 1080×1920 như game con; bố cục OBS theo Browser Source của overlay mẹ ('camgames').

import { HpTracker } from '/lib/hp-tracking.mjs';
import { cameraToStage } from '/lib/obs-scene-map.mjs';

const FEED_EVT = 'touchplay:feed';
const Q_RANK = { low: 0, auto: 1, high: 2 };

export function createCamShared({ socket, width = 1080, height = 1920 } = {}) {
    const tracker = new HpTracker({ width, height, mirror: false, quality: 'auto' });
    tracker.want({ hands: false, face: false, pose: false, segment: false });
    const needs = new Map();          // gameId → { hands, face, pose, segment }
    const quals = new Map();          // gameId → 'low' | 'auto' | 'high'
    let layout = null, busy = false, on = false;

    const host = {
        W: width, H: height, tracker,
        timeOrigin: performance.timeOrigin,
        lastFrameAt: 0,
        ready: tracker.startExternal().catch(e => console.warn('[cam-shared] start:', e?.message || e)),
        // Game con báo nhu cầu (null = rời). Gộp OR; có ít nhất một game thì nhận khung.
        need(gameId, w) {
            if (w) needs.set(gameId, { hands: !!w.hands, face: !!w.face, pose: !!w.pose, segment: !!w.segment });
            else { needs.delete(gameId); quals.delete(gameId); }
            const u = { hands: false, face: false, pose: false, segment: false };
            for (const v of needs.values()) for (const k in u) u[k] = u[k] || v[k];
            tracker.want(u);
            setOn(needs.size > 0);
        },
        // Chất lượng: lấy mức cao nhất trong các game đang mở.
        quality(gameId, q) {
            if (q in Q_RANK) quals.set(gameId, q); else quals.delete(gameId);
            let best = 'auto', r = -1;
            for (const v of quals.values()) if (Q_RANK[v] > r) { r = Q_RANK[v]; best = v; }
            tracker.quality = best;
        },
        games: () => [...needs.keys()]
    };

    function setOn(v) {
        if (v === on) return;
        on = v;
        if (socket.connected) socket.emit(FEED_EVT, on ? 'camgames' : false);
    }

    socket.on('touchplay:layout', l => { layout = l; });
    socket.on('connect', () => { if (on) socket.emit(FEED_EVT, 'camgames'); });   // app khởi động lại → đăng ký lại
    socket.on('touchplay:frame', async f => {
        if (!on || busy || !f?.img) return;
        busy = true;                  // đang giải mã thì bỏ khung mới — luôn dùng hình mới nhất
        try {
            const bmp = await createImageBitmap(new Blob([f.img], { type: 'image/jpeg' }));
            tracker.pushFrame(bmp, cameraToStage(layout, bmp.width, bmp.height, width, height, 'camgames'));
            host.lastFrameAt = performance.now();
        } catch (_) {} finally { busy = false; }
    });
    return host;
}
