// lib/touchplay-obs-feed.js — cấp hình camera TRONG OBS cho game webcam (Touch & Play).
//
// Streamer giữ nguồn camera (Video Capture Device…) trong scene OBS như mọi khi. Game KHÔNG mở
// webcam riêng; server chụp chính nguồn đó qua obs-websocket (GetSourceScreenshot) ~20 hình/giây
// rồi gửi JPEG nhị phân cho overlay (room 'touchplay:feed'). Overlay chạy MediaPipe trên ảnh đó.
//
// Kèm "bố cục": vị trí/cỡ/crop/lật/xoay của nguồn camera và của chính Browser Source overlay
// trong scene đang phát (kể cả nằm trong group / scene lồng), để overlay quy đổi điểm tay về
// đúng chỗ camera đang hiện trên màn hình. Kéo camera trong OBS → ≤1 giây là game theo kịp.
//
// Chỉ chụp khi có ít nhất 1 overlay đăng ký nhận hình — không ai xem thì OBS không tốn gì.
//
// Nhiều game dùng chung 1 feed (Touch & Play, Bắn Cung…): bố cục gửi kèm `overlays[gameId]` —
// transform Browser Source của TỪNG game, vì mỗi overlay có thể nằm ở chỗ khác trong scene.

const ROOM = 'touchplay:feed';
// Ai thật sự giải mã khung. Game con trong 🎥 Game Camera dùng bộ nhận diện chung của overlay mẹ: chỉ ở ROOM
// (trạng thái + bố cục scene), không nhận JPEG — kẻo mỗi khung gửi 2–3 lần qua socket trong OBS.
const FRAMES = ROOM + ':frames';
const NON_VIDEO_KIND = /wasapi|pulse|coreaudio|alsa|jack|audio|sck_audio/i;
const CAMERA_KIND = /dshow_input|av_capture_input|macos-avcapture|v4l2_input|decklink|ndi|droidcam|camlink|elgato/i;

class ObsCameraFeed {
    /**
     * @param {object} o
     * @param {import('./obs-bridge').OBSBridge} o.bridge
     * @param {import('socket.io').Server} o.io
     * @param {(activeGames:Set<string>) => {source:string, width:number, fps:number, enabled:boolean}} o.getOptions
     *        activeGames: id các game đang có overlay nhận hình — để chọn nguồn camera của game đang chạy
     * @param {(url:string) => boolean} [o.isOverlayUrl] Browser Source nào là overlay Touch & Play (bản cũ, 1 game)
     * @param {Record<string,(url:string)=>boolean>} [o.overlayMatchers] { gameId: url => boolean } — mỗi game một mẫu URL
     */
    constructor({ bridge, io, getOptions, isOverlayUrl = u => /touchplay/i.test(u), overlayMatchers = null, logger = console }) {
        this.bridge = bridge; this.io = io; this.getOptions = getOptions; this.logger = logger;
        this.isOverlayUrl = isOverlayUrl;   // nhận cả link chia sẻ /overlay/shared/<token> (không có chữ touchplay)
        this.overlayMatchers = overlayMatchers || { touchplay: isOverlayUrl };
        this._urlCache = new Map();         // inputName → { url, at } — URL Browser Source hiếm đổi, hỏi lại mỗi 3 giây
        this.seq = 0; this.inflight = 0; this.fps = 0; this.lastFrameAt = 0;
        this.error = ''; this.layout = null; this._layoutJson = ''; this._layoutAt = 0;
        this._canvas = null; this._canvasAt = 0; this._timer = null; this._lastStatusJson = '';
        this._errCount = 0;
    }

    start() {
        if (this._timer) return;
        const loop = () => { this._timer = setTimeout(loop, this._pump()); };
        this._timer = setTimeout(loop, 500);
    }

    subscribers() { return this.io.sockets.adapter.rooms.get(FRAMES)?.size || 0; }
    // Game nào đang có overlay nhận hình (overlay báo id khi đăng ký; không báo = touchplay).
    activeGames() {
        const out = new Set();
        for (const id of this.io.sockets.adapter.rooms.get(ROOM) || []) out.add(this.io.sockets.sockets.get(id)?.data?.feedGame || 'touchplay');
        return out;
    }

    // Gắn handler cho từng socket (gọi trong io.on('connection')).
    attach(socket) {
        // on: true | 'gameId' | { id, frames:false } (game con dùng chung bộ nhận diện) | false (rời).
        socket.on('touchplay:feed', on => {
            if (on) {
                const id = typeof on === 'string' ? on : typeof on?.id === 'string' ? on.id : 'touchplay';
                socket.data.feedGame = id.slice(0, 24);
                socket.join(ROOM);
                if (on?.frames === false) socket.leave(FRAMES); else socket.join(FRAMES);
                socket.emit('touchplay:feedStatus', this.status());
                if (this.layout) socket.emit('touchplay:layout', this.layout);
            } else { socket.leave(ROOM); socket.leave(FRAMES); }
        });
        // Overlay trong OBS báo sức khoẻ nhận diện (OBS chạy trình duyệt riêng, app không nhìn vào được).
        socket.on('touchplay:overlayStat', d => {
            if (!d || typeof d !== 'object') return;
            const n = v => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
            this.overlayStat = { fps: n(d.fps), aiMs: n(d.aiMs), hands: n(d.hands), pose: n(d.pose), delegate: String(d.delegate || '').slice(0, 8), phase: String(d.phase || '').slice(0, 12), at: Date.now() };
            // Theo từng game: 🎥 Game Camera chơi 2 game cùng lúc thì mỗi game một dòng (overlayStat giữ cho bản cũ).
            this.overlayStats = this.overlayStats || new Map();
            this.overlayStats.set(String(socket.data.feedGame || d.phase || 'touchplay').slice(0, 24), this.overlayStat);
        });
    }

    status() {
        const o = this.getOptions(this.activeGames());
        return {
            obsConnected: !!this.bridge.connected, source: o.source || '', enabled: o.enabled,
            fps: Math.round(this.fps), live: Date.now() - this.lastFrameAt < 2000,
            camFound: !!this.layout?.cam?.found, overlayFound: !!this.layout?.overlay?.found,
            scene: this.layout?.scene || '', error: this.error,
            overlay: this.overlayStat && Date.now() - this.overlayStat.at < 6000 ? this.overlayStat : null,
            overlays: Object.fromEntries([...(this.overlayStats || [])].filter(([, s]) => Date.now() - s.at < 6000))
        };
    }

    _emitStatus(force = false) {
        const s = this.status(), j = JSON.stringify(s);
        if (force || j !== this._lastStatusJson) { this._lastStatusJson = j; this.io.to(ROOM).emit('touchplay:feedStatus', s); }
    }

    // Một nhịp: trả về số ms tới nhịp sau.
    _pump() {
        const o = this.getOptions(this.activeGames());
        const idle = !o.enabled || !o.source || !this.bridge.connected || this.subscribers() === 0;
        if (idle) {
            this.error = !this.bridge.connected ? 'obs-disconnected' : !o.source ? 'no-source' : '';
            this.fps *= 0.5;
            if (this.subscribers()) this._emitStatus();
            return 1000;
        }
        const now = Date.now();
        if (now - this._layoutAt > 1000) { this._layoutAt = now; this._refreshLayout(o.source).catch(() => {}); }
        // 2 yêu cầu song song: OBS chụp ở luồng đồ hoạ, xếp hàng 2 cái thì không phí nhịp render.
        const interval = 1000 / Math.max(5, Math.min(30, o.fps || 20));
        if (this.inflight < 2) this._shot(o).catch(() => {});
        this._emitStatus();
        return interval;
    }

    async _shot(o) {
        this.inflight++;
        const t0 = Date.now();
        try {
            const r = await this.bridge.obs.call('GetSourceScreenshot', {
                sourceName: o.source, imageFormat: 'jpg',
                imageWidth: Math.max(320, Math.min(1920, o.width || 960)), imageCompressionQuality: 75
            });
            const data = String(r.imageData || '');
            const comma = data.indexOf(',');
            if (comma < 0) throw new Error('ảnh rỗng');
            const buf = Buffer.from(data.slice(comma + 1), 'base64');
            const now = Date.now();
            if (this.lastFrameAt) { const dt = now - this.lastFrameAt; if (dt > 0) this.fps = this.fps * 0.85 + (1000 / dt) * 0.15; }
            this.lastFrameAt = now;
            this.error = ''; this._errCount = 0;
            // volatile: overlay đang bận thì bỏ khung cũ, không dồn hàng gây trễ.
            this.io.to(FRAMES).volatile.emit('touchplay:frame', { seq: ++this.seq, ts: now, ms: now - t0, img: buf });
        } catch (e) {
            const msg = e && e.message ? e.message : String(e);
            this.error = /not found|No source|does not exist|600/i.test(msg) ? 'source-missing' : msg;
            if (this._errCount++ % 50 === 0) this.logger.warn('[touchplay-feed] screenshot lỗi:', msg);
        } finally {
            this.inflight--;
        }
    }

    // ---------------- bố cục scene ----------------
    async _refreshLayout(source) {
        const obs = this.bridge.obs;
        // Kích thước canvas hiếm khi đổi — hỏi lại mỗi 10 giây là đủ (streamer đổi 1080×1920 ↔ 1920×1080).
        if (!this._canvas || Date.now() - this._canvasAt > 10000) {
            const v = await obs.call('GetVideoSettings');
            this._canvas = { w: v.baseWidth, h: v.baseHeight }; this._canvasAt = Date.now();
        }
        const { currentProgramSceneName: scene } = await obs.call('GetCurrentProgramScene');
        const cam = await this._findChain(scene, it => it.sourceName === source, 0);
        const overlays = {};
        for (const [id, match] of Object.entries(this.overlayMatchers)) {
            const o = await this._findChain(scene, it => it.inputKind === 'browser_source' && it._url && match(it._url), 0, true);
            overlays[id] = o ? { found: true, chain: o.chain } : { found: false };
        }
        // `overlay` giữ cho client cũ: Touch & Play, không thì overlay đầu tiên tìm thấy.
        const overlay = overlays.touchplay?.found ? overlays.touchplay : Object.values(overlays).find(o => o.found) || { found: false };
        const layout = {
            canvas: this._canvas, scene,
            cam: cam ? { found: true, chain: cam.chain } : { found: false },
            overlay, overlays
        };
        // Không thấy camera trong scene đang phát (đang ở scene hiệu ứng…) → giữ bố cục cũ.
        if (!cam && this.layout?.cam?.found) layout.cam = { ...this.layout.cam, stale: true };
        const j = JSON.stringify(layout);
        if (j !== this._layoutJson) { this._layoutJson = j; this.layout = layout; this.io.to(ROOM).emit('touchplay:layout', layout); }
    }

    // Tìm item trong scene (đệ quy vào group + scene lồng ≤ 3 tầng). Trả về chuỗi transform
    // từ ngoài vào trong để client nhân ma trận lại.
    async _findChain(sceneName, match, depth, needUrl = false, isGroup = false) {
        if (depth > 3) return null;
        const obs = this.bridge.obs;
        const { sceneItems } = isGroup
            ? await obs.call('GetGroupSceneItemList', { sceneName })
            : await obs.call('GetSceneItemList', { sceneName });
        for (const it of sceneItems || []) {
            if (it.sceneItemEnabled === false) continue;
            if (needUrl && it.inputKind === 'browser_source') it._url = await this._browserUrl(it.sourceName);
            if (match(it)) return { chain: [pickTransform(it.sceneItemTransform)] };
        }
        for (const it of sceneItems || []) {
            if (it.sceneItemEnabled === false) continue;
            const nestedScene = it.sourceType === 'OBS_SOURCE_TYPE_SCENE';
            if (!nestedScene && !it.isGroup) continue;
            const sub = await this._findChain(it.sourceName, match, depth + 1, needUrl, !!it.isGroup);
            if (sub) return { chain: [pickTransform(it.sceneItemTransform), ...sub.chain] };
        }
        return null;
    }

    async _browserUrl(inputName) {
        const c = this._urlCache.get(inputName);
        if (c && Date.now() - c.at < 3000) return c.url;
        let url = '';
        try { url = (await this.bridge.obs.call('GetInputSettings', { inputName })).inputSettings?.url || ''; } catch (_) {}
        this._urlCache.set(inputName, { url, at: Date.now() });
        return url;
    }

    async listSources() {
        if (!this.bridge.connected) return { ok: false, reason: 'obs-disconnected', sources: [] };
        const { inputs } = await this.bridge.obs.call('GetInputList');
        const sources = (inputs || [])
            .filter(i => !NON_VIDEO_KIND.test(i.inputKind || ''))
            .map(i => ({ name: i.inputName, kind: i.inputKind, camera: CAMERA_KIND.test(i.inputKind || '') }))
            .sort((a, b) => (b.camera - a.camera) || a.name.localeCompare(b.name));
        return { ok: true, sources };
    }
}

function pickTransform(t = {}) {
    const k = ['positionX', 'positionY', 'rotation', 'scaleX', 'scaleY', 'alignment', 'sourceWidth', 'sourceHeight',
        'cropLeft', 'cropRight', 'cropTop', 'cropBottom', 'boundsType', 'boundsAlignment', 'boundsWidth', 'boundsHeight'];
    const o = {};
    for (const key of k) if (t[key] !== undefined) o[key] = t[key];
    return o;
}

module.exports = { ObsCameraFeed, TOUCHPLAY_FEED_ROOM: ROOM };
