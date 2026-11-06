// lib/obs-add-overlay.js — ➕ Thêm 1 overlay của app vào Scene OBS bằng 1 nút (📋 Bảng Quà Tổng).
// Scene = scene được chọn, không thì Scene đang phát. Đã có Browser Source đúng link trong Scene → chỉ bật 👁 nếu
// đang tắt; có ở Scene khác → đưa CHÍNH nguồn đó vào (Add Existing: 1 trang chạy, đổi Scene không nạp lại);
// chưa có ở đâu → tạo mới 1080×1920. Phủ kín khung hình, đặt LỚP TRÊN CÙNG (bảng quà phải nằm trên mọi thứ).
// Chỉ nói obs-websocket v5 qua `obs(type, data)` → test bằng OBS giả (tests/obs-add-overlay.test.js).
'use strict';

/**
 * @param {(type:string, data?:object)=>Promise<any>} obs
 * @param {object} o
 * @param {string} o.url              link tạo Browser Source mới
 * @param {(url:string)=>boolean} o.isMine   URL Browser Source là overlay này (đã lọc đúng cổng app)
 * @param {string} o.inputName        tên nguồn mới (trùng thì thêm " 2", " 3"…)
 * @param {string} [o.scene]          Scene đích ('' = Scene đang phát)
 */
async function addOverlayToScene(obs, o) {
    const urlOf = async name => {
        try { const s = await obs('GetInputSettings', { inputName: name }); return String((s.inputSettings && s.inputSettings.url) || ''); } catch (_) { return ''; }
    };
    let scene = String(o.scene || '');
    if (!scene) { const p = await obs('GetCurrentProgramScene'); scene = String(p.currentProgramSceneName || p.sceneName || ''); }
    if (!scene) throw new Error('Không đọc được Scene đang phát');
    const { sceneItems } = await obs('GetSceneItemList', { sceneName: scene });
    const items = sceneItems || [];
    // 1) Đã có trong Scene
    for (const it of items) {
        if (it.inputKind !== 'browser_source' || !o.isMine(await urlOf(it.sourceName))) continue;
        if (it.sceneItemEnabled === false) {
            await obs('SetSceneItemEnabled', { sceneName: scene, sceneItemId: it.sceneItemId, sceneItemEnabled: true });
            return { ok: true, scene, inputName: it.sourceName, state: 'shown' };
        }
        return { ok: true, scene, inputName: it.sourceName, state: 'exists' };
    }
    // 2) Có ở Scene khác → đưa chính nguồn đó vào; 3) chưa có → tạo mới
    let inputName = '';
    const { inputs } = await obs('GetInputList', { inputKind: 'browser_source' });
    for (const i of inputs || []) if (o.isMine(await urlOf(i.inputName))) { inputName = i.inputName; break; }
    let sceneItemId, state, srcW = 1080, srcH = 1920;
    if (inputName) {
        ({ sceneItemId } = await obs('CreateSceneItem', { sceneName: scene, sourceName: inputName, sceneItemEnabled: true }));
        try { const st = await obs('GetInputSettings', { inputName }); srcW = Number(st.inputSettings && st.inputSettings.width) || 800; srcH = Number(st.inputSettings && st.inputSettings.height) || 600; } catch (_) {}
        state = 'added';
    } else {
        const all = new Set(((await obs('GetInputList')).inputs || []).map(i => i.inputName));
        inputName = o.inputName;
        for (let n = 2; all.has(inputName); n++) inputName = `${o.inputName} ${n}`;
        ({ sceneItemId } = await obs('CreateInput', { sceneName: scene, inputName, inputKind: 'browser_source',
            inputSettings: { url: o.url, width: 1080, height: 1920, fps_custom: false, shutdown: false, restart_when_active: false, reroute_audio: false },
            sceneItemEnabled: true }));
        state = 'created';
    }
    const v = await obs('GetVideoSettings');
    const cw = Number(v.baseWidth) || 1080, ch = Number(v.baseHeight) || 1920;
    const scale = Math.min(cw / Math.max(1, srcW), ch / Math.max(1, srcH));
    await obs('SetSceneItemTransform', { sceneName: scene, sceneItemId, sceneItemTransform: { positionX: cw / 2, positionY: ch / 2, alignment: 0,
        rotation: 0, scaleX: scale, scaleY: scale, boundsType: 'OBS_BOUNDS_NONE', cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0 } });
    // Lớp trên cùng: OBS đánh sceneItemIndex từ DƯỚI lên → index lớn nhất = trên cùng.
    try {
        const { sceneItems: now } = await obs('GetSceneItemList', { sceneName: scene });
        await obs('SetSceneItemIndex', { sceneName: scene, sceneItemId, sceneItemIndex: Math.max(0, (now || []).length - 1) });
    } catch (_) {}
    return { ok: true, scene, inputName, state };
}

module.exports = { addOverlayToScene };
