// 🎥 Game Camera ↔ OBS (lib/camgames-obs.js) với OBS giả có trạng thái: quét Scene, ＋ Thêm nhanh, program-check.
// KHÔNG chạm OBS thật.
const test = require('node:test');
const assert = require('node:assert/strict');
const { ObsCameraFeed } = require('../lib/touchplay-obs-feed');
const { createCamObs } = require('../lib/camgames-obs');

const HUB = 'http://localhost:3000/overlay/camgames';

// OBS giả: scenes = { tên: [item] } (index 0 = đáy như OBS), inputs = { tên: { kind, settings } }.
function fakeObs({ scenes, inputs, current, groups = {} }) {
    let nextId = 100;
    const calls = [];
    const list = name => scenes[name] || groups[name];
    const withIndex = items => items.map((it, i) => ({ ...it, sceneItemIndex: i, inputKind: it.inputKind || inputs[it.sourceName]?.kind }));
    const call = async (type, d = {}) => {
        calls.push([type, d]);
        switch (type) {
            case 'GetSceneList': return { currentProgramSceneName: current, scenes: Object.keys(scenes).map((n, i) => ({ sceneName: n, sceneIndex: i })) };
            case 'GetSceneItemList': if (!scenes[d.sceneName]) throw new Error('no scene'); return { sceneItems: withIndex(scenes[d.sceneName]) };
            case 'GetGroupSceneItemList': return { sceneItems: withIndex(groups[d.sceneName] || []) };
            case 'GetInputSettings': if (!inputs[d.inputName]) throw new Error('no input'); return { inputSettings: inputs[d.inputName].settings || {} };
            case 'GetInputList': return { inputs: Object.entries(inputs).filter(([, v]) => !d.inputKind || v.kind === d.inputKind).map(([inputName, v]) => ({ inputName, inputKind: v.kind })) };
            case 'GetVideoSettings': return { baseWidth: 1080, baseHeight: 1920 };
            case 'CreateInput': {
                inputs[d.inputName] = { kind: d.inputKind, settings: d.inputSettings };
                const sceneItemId = nextId++;
                scenes[d.sceneName].push({ sceneItemId, sourceName: d.inputName, sceneItemEnabled: true });
                return { sceneItemId };
            }
            case 'CreateSceneItem': {
                const sceneItemId = nextId++;
                scenes[d.sceneName].push({ sceneItemId, sourceName: d.sourceName, sceneItemEnabled: true });
                return { sceneItemId };
            }
            case 'SetSceneItemIndex': {
                const arr = scenes[d.sceneName];
                const i = arr.findIndex(it => it.sceneItemId === d.sceneItemId);
                const [it] = arr.splice(i, 1);
                arr.splice(d.sceneItemIndex, 0, it);
                return {};
            }
            case 'SetSceneItemEnabled': { list(d.sceneName).find(it => it.sceneItemId === d.sceneItemId).sceneItemEnabled = d.sceneItemEnabled; return {}; }
            case 'SetSceneItemTransform': return {};
            default: throw new Error('không hỗ trợ ' + type);
        }
    };
    return { call, calls, scenes, inputs };
}
function setup(state, opts = {}) {
    const o = fakeObs(state);
    const feed = new ObsCameraFeed({ bridge: { connected: true, obs: { call: o.call } }, io: { sockets: { adapter: { rooms: new Map() } } }, getOptions: () => ({}) });
    const cam = createCamObs({ obs: o.call, feed, overlayUrl: () => HUB, cameraName: () => opts.camera || '', savedScene: () => opts.scene || '' });
    return { o, feed, cam };
}
const names = arr => arr.map(it => it.sourceName);

test('programCheck: Scene đang phát có camera, chưa có overlay mẹ → missing', async () => {
    const { cam } = setup({ current: 'Main', scenes: { Main: [{ sceneItemId: 1, sourceName: 'Cam' }], Phụ: [] },
        inputs: { Cam: { kind: 'dshow_input' } } });
    const r = await cam.programCheck();
    assert.equal(r.ok, true);
    assert.equal(r.scene, 'Main');
    assert.equal(r.overlay, 'missing');
    assert.equal(r.camera, true);
    assert.equal(r.dupInputs, false);
});

test('scanScene: overlay mẹ trong group lồng + group tắt 👁 → hidden; 2 Browser Source khác nhau → dupInputs', async () => {
    const state = { current: 'Main',
        scenes: { Main: [{ sceneItemId: 1, sourceName: 'Cam' }, { sceneItemId: 2, sourceName: 'Nhóm', isGroup: true, sceneItemEnabled: false }] },
        groups: { Nhóm: [{ sceneItemId: 3, sourceName: 'GC A' }] },
        inputs: { Cam: { kind: 'dshow_input' }, 'GC A': { kind: 'browser_source', settings: { url: HUB + '?x=1' } } } };
    const { cam, o } = setup(state);
    let r = await cam.programCheck();
    assert.equal(r.overlay, 'hidden');
    assert.deepEqual(r.inputs, ['GC A']);
    // thêm Browser Source thứ 2 cùng link (link chia sẻ khác tên) + 1 Browser Source khác link (không tính)
    o.inputs['GC B'] = { kind: 'browser_source', settings: { url: HUB } };
    o.inputs['Bảng Quà'] = { kind: 'browser_source', settings: { url: 'http://localhost:3000/overlay/giftboard' } };
    o.scenes.Main.push({ sceneItemId: 4, sourceName: 'GC B' }, { sceneItemId: 5, sourceName: 'Bảng Quà' });
    const fresh = setup(state).cam;   // cache URL 3 s của feed cũ → dùng feed mới
    r = await fresh.programCheck();
    assert.equal(r.overlay, 'ok');
    assert.deepEqual(r.inputs.sort(), ['GC A', 'GC B']);
    assert.equal(r.dupInputs, true);
});

test('addHubOverlay: chưa có overlay ở đâu → tạo "HP Game Camera" 1080×1920, nằm NGAY TRÊN camera (dưới Bảng Quà)', async () => {
    const { cam, o } = setup({ current: 'Main',
        scenes: { Main: [{ sceneItemId: 1, sourceName: 'Nền' }, { sceneItemId: 2, sourceName: 'Cam' }, { sceneItemId: 3, sourceName: 'Bảng Quà' }] },
        inputs: { Nền: { kind: 'image_source' }, Cam: { kind: 'dshow_input' }, 'Bảng Quà': { kind: 'browser_source', settings: { url: 'http://localhost:3000/overlay/giftboard' } } } });
    const r = await cam.addHubOverlay();
    assert.equal(r.created, true);
    assert.equal(r.inputName, 'HP Game Camera');
    assert.equal(r.url, HUB);
    assert.deepEqual(r.added, ['Main']);
    assert.deepEqual(o.inputs['HP Game Camera'].settings, { url: HUB, width: 1080, height: 1920, fps_custom: false, shutdown: false, restart_when_active: false, reroute_audio: false });
    assert.deepEqual(names(o.scenes.Main), ['Nền', 'Cam', 'HP Game Camera', 'Bảng Quà']);
    const tf = o.calls.find(c => c[0] === 'SetSceneItemTransform')[1].sceneItemTransform;
    assert.equal(tf.positionX, 540); assert.equal(tf.positionY, 960); assert.equal(tf.scaleX, 1);
    // lần 2: đã đủ → không tạo thêm
    const again = await cam.addHubOverlay();
    assert.deepEqual(again.added, []);
    assert.equal(again.created, false);
    assert.equal(o.calls.filter(c => c[0] === 'CreateInput').length, 1);
});

test('addHubOverlay: tên "HP Game Camera" đã bị nguồn khác dùng → "HP Game Camera 2"', async () => {
    const { cam, o } = setup({ current: 'Main', scenes: { Main: [{ sceneItemId: 1, sourceName: 'Cam' }] },
        inputs: { Cam: { kind: 'dshow_input' }, 'HP Game Camera': { kind: 'image_source' } } });
    const r = await cam.addHubOverlay();
    assert.equal(r.inputName, 'HP Game Camera 2');
    assert.deepEqual(names(o.scenes.Main), ['Cam', 'HP Game Camera 2']);
});

test('addHubOverlay: Browser Source overlay mẹ đã có ở Scene khác → Add Existing (không tạo nguồn mới), co theo cỡ nguồn', async () => {
    const { cam, o } = setup({ current: 'Main',
        scenes: { Main: [{ sceneItemId: 1, sourceName: 'Cam' }, { sceneItemId: 2, sourceName: 'Chữ' }], Cũ: [{ sceneItemId: 9, sourceName: 'Game Cam cũ' }] },
        inputs: { Cam: { kind: 'dshow_input' }, Chữ: { kind: 'text_gdiplus_v2' }, 'Game Cam cũ': { kind: 'browser_source', settings: { url: HUB, width: 540, height: 960 } } } });
    const r = await cam.addHubOverlay();
    assert.equal(r.created, false);
    assert.equal(r.inputName, 'Game Cam cũ');
    assert.deepEqual(r.added, ['Main']);
    assert.equal(o.calls.filter(c => c[0] === 'CreateInput').length, 0);
    assert.deepEqual(names(o.scenes.Main), ['Cam', 'Game Cam cũ', 'Chữ']);
    assert.equal(o.calls.find(c => c[0] === 'SetSceneItemTransform')[1].sceneItemTransform.scaleX, 2);
});

test('addHubOverlay: overlay mẹ có nhưng item tắt 👁 → bật lại, không thêm item', async () => {
    const { cam, o } = setup({ current: 'Main',
        scenes: { Main: [{ sceneItemId: 1, sourceName: 'Cam' }, { sceneItemId: 2, sourceName: 'GC', sceneItemEnabled: false }] },
        inputs: { Cam: { kind: 'dshow_input' }, GC: { kind: 'browser_source', settings: { url: HUB } } } });
    const r = await cam.addHubOverlay();
    assert.deepEqual(r.shown, ['Main']);
    assert.deepEqual(r.added, []);
    assert.equal(o.scenes.Main[1].sceneItemEnabled, true);
    assert.equal(o.calls.filter(c => c[0] === 'CreateSceneItem' || c[0] === 'CreateInput').length, 0);
});

test('sceneCheck: 📌 Scene cố định + Scene đang phát (có camera) đều được xét; onlyScenes chỉ sửa Scene chỉ định', async () => {
    const { cam, o } = setup({ current: 'Live',
        scenes: { Cố: [{ sceneItemId: 1, sourceName: 'Cam' }], Live: [{ sceneItemId: 2, sourceName: 'Cam' }], Intro: [{ sceneItemId: 3, sourceName: 'Ảnh' }] },
        inputs: { Cam: { kind: 'dshow_input' }, Ảnh: { kind: 'image_source' } } }, { scene: 'Cố', camera: 'Cam' });
    const sc = await cam.sceneCheck({ ok: true, scenes: ['Cố', 'Live', 'Intro'], currentScene: 'Live' }, true);
    assert.deepEqual(sc.scenes.map(s => [s.scene, s.current, s.overlay, s.camera]), [['Cố', false, 'missing', 'ok'], ['Live', true, 'missing', 'ok']]);
    assert.deepEqual(sc.missingOverlay, ['Cố', 'Live']);
    const r = await cam.addHubOverlay(['Live']);
    assert.deepEqual(r.added, ['Live']);
    assert.deepEqual(names(o.scenes.Cố), ['Cam']);
    assert.deepEqual(names(o.scenes.Live), ['Cam', 'HP Game Camera']);
});

test('sceneCheck: Scene đang phát không có camera (Intro) → không xét; Scene cố định đã bị xoá → theo Scene đang phát', async () => {
    const { cam } = setup({ current: 'Intro', scenes: { Main: [], Intro: [{ sceneItemId: 3, sourceName: 'Ảnh' }] }, inputs: { Ảnh: { kind: 'image_source' } } }, { scene: 'Main' });
    let sc = await cam.sceneCheck({ ok: true, scenes: ['Main', 'Intro'], currentScene: 'Intro' }, true);
    assert.deepEqual(sc.scenes.map(s => s.scene), ['Main']);
    assert.deepEqual(sc.missingCamera, ['Main']);
    assert.deepEqual(cam.resolveScene({ scenes: ['Intro'], currentScene: 'Intro' }), { scene: 'Intro', follow: true, missing: true });
});

test('OBS chưa nối → programCheck ok:false, addHubOverlay báo lỗi, không gọi OBS', async () => {
    let n = 0;
    const call = async () => { n++; throw new Error('x'); };
    const feed = new ObsCameraFeed({ bridge: { connected: false, obs: { call } }, io: {}, getOptions: () => ({}) });
    const cam = createCamObs({ obs: call, feed });
    assert.deepEqual(await cam.programCheck(), { ok: false, obsConnected: false });
    await assert.rejects(cam.addHubOverlay(), /Chưa kết nối OBS/);
    assert.equal(n, 0);
});
