// 📷 Tự nhận camera: listScenes / listSceneSources của ObsCameraFeed với OBS giả (đệ quy group, camera lên đầu).
const test = require('node:test');
const assert = require('node:assert/strict');
const { ObsCameraFeed } = require('../lib/touchplay-obs-feed');

function fakeBridge() {
    const scenes = {
        Main: [
            { sourceName: 'Mic', inputKind: 'wasapi_input_capture', sceneItemEnabled: true },
            { sourceName: 'Khung', isGroup: true, sourceType: 'OBS_SOURCE_TYPE_INPUT' },
            { sourceName: 'Ảnh nền', inputKind: 'image_source', sceneItemEnabled: true }
        ],
        Khung: [{ sourceName: 'Cam Logi', inputKind: 'dshow_input', sceneItemEnabled: true }]
    };
    return {
        connected: true,
        obs: { call: async (type, d) => {
            if (type === 'GetSceneList') return { currentProgramSceneName: 'Main', scenes: [{ sceneName: 'Main', sceneIndex: 1 }, { sceneName: 'Phụ', sceneIndex: 0 }] };
            if (type === 'GetSceneItemList' || type === 'GetGroupSceneItemList') return { sceneItems: scenes[d.sceneName] || [] };
            throw new Error('không hỗ trợ ' + type);
        } }
    };
}

test('listScenes: thứ tự như OBS (trên cùng trước) + scene đang phát; listSceneSources: camera trong group lên đầu, bỏ âm thanh', async () => {
    const feed = new ObsCameraFeed({ bridge: fakeBridge(), io: { sockets: { adapter: { rooms: new Map() } } }, getOptions: () => ({}) });
    const sc = await feed.listScenes();
    assert.deepEqual(sc, { ok: true, scenes: ['Main', 'Phụ'], currentScene: 'Main' });
    const r = await feed.listSceneSources('Main');
    assert.deepEqual(r.sources.map(s => [s.name, s.camera]), [['Cam Logi', true], ['Ảnh nền', false]]);
});

test('OBS chưa nối → ok:false, không gọi OBS', async () => {
    const feed = new ObsCameraFeed({ bridge: { connected: false, obs: { call: () => { throw new Error('x'); } } }, io: {}, getOptions: () => ({}) });
    assert.equal((await feed.listScenes()).ok, false);
    assert.equal((await feed.listSceneSources('Main')).ok, false);
});
