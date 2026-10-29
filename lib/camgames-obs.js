// 🎥 Game Camera ↔ OBS: kiểm Scene có overlay mẹ /overlay/camgames chưa + ＋ Thêm nhanh (port HP LIVE NPC
// lib/camgames-server.cjs, bỏ "Scene theo NPC" — app này chỉ xét Scene cố định `camgames.scene` hoặc Scene đang phát).
// Chỉ nói obs-websocket v5 qua `obs(type, data)`; mọi thứ khác bơm vào → test bằng OBS giả (tests/camgames-obs.test.js).
'use strict';

// Cùng danh sách kind với lib/touchplay-obs-feed.js CAMERA_KIND.
const CAMERA_KIND = /dshow_input|av_capture_input|macos-avcapture|v4l2_input|decklink|ndi|droidcam|camlink|elgato/i;
const HUB_URL = /\/overlay\/camgames(?:[/?#]|$)/i;
const INPUT_NAME = 'HP Game Camera';

// Browser Source trỏ đúng app này? Cùng máy thường chạy cả HP LIVE NPC (cổng 3001, cũng có /overlay/camgames) →
// chỉ so đường dẫn là nhận nhầm overlay của app kia thành "đã có". Không đọc được URL / không biết cổng → không chặn.
function urlOnPort(url, port) {
    if (!port) return true;
    try {
        const u = new URL(String(url || ''));
        return String(u.port || (u.protocol === 'https:' ? 443 : 80)) === String(port);
    } catch (_) { return true; }
}

/**
 * @param {object} o
 * @param {(type:string, data?:object)=>Promise<any>} o.obs   gọi obs-websocket v5
 * @param {{listScenes:Function, _browserUrl:Function}} o.feed  ObsCameraFeed (lib/touchplay-obs-feed.js)
 * @param {(url:string)=>boolean} [o.isHubUrl]   URL Browser Source là overlay mẹ (gồm link chia sẻ /overlay/shared/<token>)
 * @param {()=>string} [o.cameraName]            nguồn camera đang dùng (đã chọn / tự nhận)
 * @param {()=>string} [o.savedScene]            📌 Scene cố định ('' = Scene đang phát)
 * @param {()=>string} [o.overlayUrl]            link tạo Browser Source mới
 * @param {number|string} [o.port]               cổng app này — overlay mẹ trỏ cổng khác (app HP LIVE NPC) không tính
 */
function createCamObs(o) {
    const obs = o.obs, feed = o.feed;
    const matchUrl = o.isHubUrl || (url => HUB_URL.test(url || ''));
    const isHubUrl = url => matchUrl(url) && urlOnPort(url, o.port);
    const cameraName = () => String((o.cameraName && o.cameraName()) || '');
    const savedScene = () => String((o.savedScene && o.savedScene()) || '');
    const overlayUrl = () => (o.overlayUrl && o.overlayUrl()) || 'http://localhost:3000/overlay/camgames';

    // Scene dùng thật: Scene cố định còn trong OBS → không thì Scene đang phát. missing = Scene cố định đã bị xoá/đổi tên.
    function resolveScene(sc, wanted = savedScene()) {
        if (wanted && (sc.scenes || []).includes(wanted)) return { scene: wanted, follow: false, missing: false };
        return { scene: sc.currentScene || '', follow: true, missing: !!wanted };
    }

    // Quét 1 Scene (đệ quy group / scene lồng ≤ 3 tầng): Browser Source overlay mẹ + camera.
    // shown = thật sự hiện (item + mọi group/scene cha đều bật 👁); own = chỉ riêng item đó bật.
    async function scanScene(name) {
        const out = { overlay: [], cameras: [], names: new Set() };
        const walk = async (host, depth, isGroup, shown) => {
            if (depth > 3) return;
            let items = [];
            try { ({ sceneItems: items } = await obs(isGroup ? 'GetGroupSceneItemList' : 'GetSceneItemList', { sceneName: host })); } catch (_) { return; }
            for (const it of items || []) {
                const vis = shown && it.sceneItemEnabled !== false;
                if (it.sourceType === 'OBS_SOURCE_TYPE_SCENE' || it.isGroup) { await walk(it.sourceName, depth + 1, !!it.isGroup, vis); continue; }
                out.names.add(it.sourceName);
                const hit = { host, id: it.sceneItemId, name: it.sourceName, shown: vis, own: it.sceneItemEnabled !== false };
                if (it.inputKind === 'browser_source' && isHubUrl(await feed._browserUrl(it.sourceName))) out.overlay.push(hit);
                else if (CAMERA_KIND.test(it.inputKind || '')) out.cameras.push(hit);
            }
        };
        await walk(name, 0, false, true);
        return out;
    }
    const overlayState = s => s.overlay.some(h => h.shown) ? 'ok' : s.overlay.length ? 'hidden' : 'missing';
    const hasCamera = s => { const cam = cameraName(); return !!((cam && s.names.has(cam)) || s.cameras.length); };

    // Kiểm Scene dùng thật (+ Scene ĐANG PHÁT nếu khác và có camera — người xem đang thấy Scene đó): thiếu overlay mẹ /
    // thiếu camera / overlay mẹ là 2 Browser Source KHÁC nhau (trang chạy 2 lần → 2 tiếng, đếm quà 2 lần).
    let checkCache = null;
    async function sceneCheck(sc, fresh = false) {
        if (!fresh && checkCache && Date.now() - checkCache.at < 4000) return checkCache.data;
        const list = [resolveScene(sc).scene].filter(Boolean);
        const scanned = new Map();
        const cur = sc.currentScene;
        if (cur && !list.includes(cur)) {
            const s = await scanScene(cur);
            if (hasCamera(s)) { list.push(cur); scanned.set(cur, s); }
        }
        const scenes = [], inputs = new Set();
        const saved = cameraName();
        for (const scene of list) {
            const s = scanned.get(scene) || await scanScene(scene);
            s.overlay.forEach(h => inputs.add(h.name));
            const cam = saved && s.names.has(saved) ? { status: 'ok', name: saved }
                : s.cameras.length ? { status: 'auto', name: (s.cameras.find(h => h.shown) || s.cameras[0]).name }
                : { status: 'missing', name: '' };
            scenes.push({ scene, current: scene === cur, overlay: overlayState(s), overlayItems: s.overlay, camera: cam.status, cameraName: cam.name });
        }
        const data = { scenes, inputs: [...inputs],
            missingOverlay: scenes.filter(s => s.overlay !== 'ok').map(s => s.scene),
            missingCamera: scenes.filter(s => s.camera === 'missing').map(s => s.scene),
            dupInputs: inputs.size > 1 };
        checkCache = { at: Date.now(), data };
        return data;
    }

    // Lớp: NGAY TRÊN camera (dưới các overlay khác như Bảng Quà) — để hiệu ứng của overlay khác vẫn đè lên trên.
    // OBS đánh sceneItemIndex từ DƯỚI lên (0 = đáy).
    async function placeAboveCamera(sceneName, sceneItemId) {
        try {
            const { sceneItems } = await obs('GetSceneItemList', { sceneName });
            const cam = cameraName();
            const cams = (sceneItems || []).filter(it => it.sceneItemId !== sceneItemId && ((cam && it.sourceName === cam) || CAMERA_KIND.test(it.inputKind || '')));
            if (!cams.length) return false;
            const top = Math.max(...cams.map(it => Number(it.sceneItemIndex) || 0));
            const me = (sceneItems || []).find(it => it.sceneItemId === sceneItemId);
            const want = me && Number(me.sceneItemIndex) > top ? top + 1 : top;   // dời item xuống → các item ở giữa tụt 1 bậc
            await obs('SetSceneItemIndex', { sceneName, sceneItemId, sceneItemIndex: want });
            return true;
        } catch (_) { return false; }
    }

    // ＋ Thêm nhanh: đưa CHÍNH Browser Source overlay mẹ đã có vào Scene còn thiếu (Add Existing — 1 trang chạy, chuyển
    // Scene không nạp lại, không đè tiếng); chưa có ở đâu thì tạo mới "HP Game Camera" 1080×1920. Phủ kín khung, đặt
    // ngay trên camera. Overlay có nhưng item tắt 👁 → bật lại. onlyScenes: chỉ xử lý các Scene này (thanh cảnh báo).
    async function addHubOverlay(onlyScenes = null) {
        const sc = await feed.listScenes();
        if (!sc.ok) throw new Error('Chưa kết nối OBS WebSocket — mở ⚙ Cài đặt › Kết nối OBS WebSocket');
        const chk = await sceneCheck(sc, true);
        let inputName = chk.inputs[0] || '';
        if (!inputName) {
            const { inputs } = await obs('GetInputList', { inputKind: 'browser_source' });
            for (const i of inputs || []) if (isHubUrl(await feed._browserUrl(i.inputName))) { inputName = i.inputName; break; }
        }
        const v = await obs('GetVideoSettings');
        const cw = Number(v.baseWidth) || 1080, ch = Number(v.baseHeight) || 1920;
        let srcW = 1080, srcH = 1920, created = false, url = '';
        if (inputName) {
            try { const st = await obs('GetInputSettings', { inputName }); srcW = Number(st.inputSettings?.width) || 800; srcH = Number(st.inputSettings?.height) || 600; } catch (_) {}
        }
        const added = [], shown = [];
        for (const s of chk.scenes) {
            if (s.overlay === 'ok') continue;
            if (Array.isArray(onlyScenes) && onlyScenes.length && !onlyScenes.includes(s.scene)) continue;
            const off = s.overlayItems.filter(h => !h.own);
            if (off.length) {
                for (const h of off) await obs('SetSceneItemEnabled', { sceneName: h.host, sceneItemId: h.id, sceneItemEnabled: true });
                shown.push(s.scene);
                continue;
            }
            let sceneItemId;
            if (!inputName) {
                const all = new Set(((await obs('GetInputList')).inputs || []).map(i => i.inputName));
                inputName = INPUT_NAME;
                for (let n = 2; all.has(inputName); n++) inputName = `${INPUT_NAME} ${n}`;
                url = overlayUrl();
                ({ sceneItemId } = await obs('CreateInput', { sceneName: s.scene, inputName, inputKind: 'browser_source',
                    inputSettings: { url, width: 1080, height: 1920, fps_custom: false, shutdown: false, restart_when_active: false, reroute_audio: false }, sceneItemEnabled: true }));
                created = true;
            } else {
                ({ sceneItemId } = await obs('CreateSceneItem', { sceneName: s.scene, sourceName: inputName, sceneItemEnabled: true }));
            }
            const scale = Math.min(cw / Math.max(1, srcW), ch / Math.max(1, srcH));
            await obs('SetSceneItemTransform', { sceneName: s.scene, sceneItemId, sceneItemTransform: { positionX: cw / 2, positionY: ch / 2, alignment: 0, rotation: 0, scaleX: scale, scaleY: scale, boundsType: 'OBS_BOUNDS_NONE', cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0 } });
            await placeAboveCamera(s.scene, sceneItemId);
            added.push(s.scene);
        }
        checkCache = null;
        return { inputName, created, url, added, shown };
    }

    // 🛰 Scene ĐANG PHÁT có overlay mẹ chưa — thanh cảnh báo panel Game Camera. overlay: ok | hidden | missing;
    // camera: Scene có nguồn camera; inputs/dupInputs: Browser Source overlay mẹ khác nhau trong Scene đó.
    async function programCheck() {
        const sc = await feed.listScenes();
        if (!sc.ok) return { ok: false, obsConnected: false };
        const scene = sc.currentScene || '';
        const s = scene ? await scanScene(scene) : { overlay: [], cameras: [], names: new Set() };
        const inputs = [...new Set(s.overlay.map(h => h.name))];
        return { ok: true, obsConnected: true, scene, overlay: overlayState(s), camera: hasCamera(s), camName: cameraName(), inputs, dupInputs: inputs.length > 1 };
    }

    return { resolveScene, scanScene, sceneCheck, placeAboveCamera, addHubOverlay, programCheck, invalidate: () => { checkCache = null; } };
}

module.exports = { createCamObs, urlOnPort, CAMERA_KIND, HUB_URL };
