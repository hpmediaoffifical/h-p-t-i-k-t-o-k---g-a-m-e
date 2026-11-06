// OBS giả: ➕ Thêm Bảng Quà Tổng vào Scene (lib/obs-add-overlay.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { addOverlayToScene } = require('../lib/obs-add-overlay');

const MINE = 'http://localhost:3000/_prototype/giftboard.html?mode=overlay';
const isMine = url => /\/_prototype\/giftboard\.html\?mode=overlay/.test(url) && url.includes(':3000/');

// scenes: { name: [{ id, source, kind, enabled }] }, inputs: { name: url }
function fakeObs(scenes, inputs, program = 'LIVE') {
    const calls = [];
    let nextId = 100;
    const obs = async (type, d = {}) => {
        calls.push([type, d]);
        switch (type) {
            case 'GetCurrentProgramScene': return { currentProgramSceneName: program };
            case 'GetSceneItemList': return { sceneItems: (scenes[d.sceneName] || []).map((it, i) => ({ sceneItemId: it.id, sourceName: it.source, inputKind: it.kind || 'browser_source', sceneItemEnabled: it.enabled !== false, sceneItemIndex: i })) };
            case 'GetInputSettings': if (!(d.inputName in inputs)) throw new Error('no input'); return { inputSettings: { url: inputs[d.inputName], width: 1080, height: 1920 } };
            case 'GetInputList': return { inputs: Object.keys(inputs).map(n => ({ inputName: n, inputKind: 'browser_source' })) };
            case 'SetSceneItemEnabled': scenes[d.sceneName].find(i => i.id === d.sceneItemId).enabled = d.sceneItemEnabled; return {};
            case 'CreateSceneItem': { const id = nextId++; scenes[d.sceneName].push({ id, source: d.sourceName }); return { sceneItemId: id }; }
            case 'CreateInput': { const id = nextId++; inputs[d.inputName] = d.inputSettings.url; scenes[d.sceneName].push({ id, source: d.inputName }); return { sceneItemId: id }; }
            case 'GetVideoSettings': return { baseWidth: 1080, baseHeight: 1920 };
            case 'SetSceneItemTransform': case 'SetSceneItemIndex': return {};
            default: throw new Error('unexpected ' + type);
        }
    };
    return { obs, calls };
}
const opts = { url: MINE, isMine, inputName: 'HP Bảng Quà Tổng' };

test('chưa có ở đâu → tạo nguồn mới ở Scene đang phát, đặt lớp trên cùng', async () => {
    const scenes = { LIVE: [{ id: 1, source: 'Camera', kind: 'dshow_input' }, { id: 2, source: 'Hũ' }] };
    const { obs, calls } = fakeObs(scenes, { 'Hũ': 'http://localhost:3000/overlay/thuytinh' });
    const r = await addOverlayToScene(obs, opts);
    assert.deepEqual(r, { ok: true, scene: 'LIVE', inputName: 'HP Bảng Quà Tổng', state: 'created' });
    const idx = calls.find(c => c[0] === 'SetSceneItemIndex')[1];
    assert.equal(idx.sceneItemIndex, 2);                     // 3 item → index 2 = trên cùng
});

test('đã có trong Scene mà tắt 👁 → chỉ bật lại; đang bật → không làm gì', async () => {
    const scenes = { LIVE: [{ id: 5, source: 'Bảng', enabled: false }] };
    const { obs, calls } = fakeObs(scenes, { 'Bảng': MINE });
    assert.equal((await addOverlayToScene(obs, opts)).state, 'shown');
    assert.equal(scenes.LIVE[0].enabled, true);
    assert.equal((await addOverlayToScene(obs, opts)).state, 'exists');
    assert.ok(!calls.some(c => c[0] === 'CreateInput' || c[0] === 'CreateSceneItem'));
});

test('có ở Scene khác → đưa chính nguồn đó vào Scene chọn (không tạo trang thứ 2)', async () => {
    const scenes = { LIVE: [], 'Scene 2': [{ id: 7, source: 'Bảng cũ' }] };
    const { obs, calls } = fakeObs(scenes, { 'Bảng cũ': MINE });
    const r = await addOverlayToScene(obs, { ...opts, scene: 'LIVE' });
    assert.deepEqual(r, { ok: true, scene: 'LIVE', inputName: 'Bảng cũ', state: 'added' });
    assert.ok(!calls.some(c => c[0] === 'CreateInput'));
});

test('tên trùng → thêm số; link app khác cổng (HP LIVE NPC) không tính là của mình', async () => {
    const scenes = { LIVE: [{ id: 1, source: 'HP Bảng Quà Tổng' }] };
    const { obs } = fakeObs(scenes, { 'HP Bảng Quà Tổng': 'http://localhost:3001/_prototype/giftboard.html?mode=overlay' });
    const r = await addOverlayToScene(obs, opts);
    assert.equal(r.state, 'created');
    assert.equal(r.inputName, 'HP Bảng Quà Tổng 2');
});
