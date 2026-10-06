'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRelay, sceneItemToCamRect } = require('../lib/chemtraicay-relay.js');

const pts42 = () => Array.from({ length: 42 }, (_, i) => (i % 2 ? 0.5 : 0.25));
const good = (over) => ({ id: 'trk_ab12', t: 1000, fps: 30, aspect: 1.777, hands: [{ side: 'R', pts: pts42() }], ...over });

test('validateHand: pts 41 số → null', () => {
    const r = createRelay();
    assert.equal(r.validateHand(good({ hands: [{ side: 'R', pts: pts42().slice(1) }] })), null);
});

test('validateHand: pts có NaN hoặc chuỗi → null', () => {
    const r = createRelay();
    const bad = pts42(); bad[5] = NaN;
    assert.equal(r.validateHand(good({ hands: [{ side: 'R', pts: bad }] })), null);
    const bad2 = pts42(); bad2[0] = '0.3';
    assert.equal(r.validateHand(good({ hands: [{ side: 'L', pts: bad2 }] })), null);
});

test('validateHand: giá trị ngoài 0..1 được clamp, làm tròn 3 chữ số, tay rỗng hợp lệ', () => {
    const r = createRelay();
    const p = pts42(); p[0] = 1.7; p[1] = -0.2; p[2] = 0.123456;
    const out = r.validateHand(good({ hands: [{ side: 'R', pts: p }] }));
    assert.equal(out.hands[0].pts[0], 1); assert.equal(out.hands[0].pts[1], 0); assert.equal(out.hands[0].pts[2], 0.123);
    assert.equal(out.id, 'trk_ab12'); assert.equal(out.fps, 30);
    assert.deepEqual(r.validateHand(good({ hands: [] })).hands, []);
});

test('validateHand: 3 tay, side lạ, id dài, hands không phải mảng → null', () => {
    const r = createRelay();
    const h = { side: 'R', pts: pts42() };
    assert.equal(r.validateHand(good({ hands: [h, h, h] })), null);
    assert.equal(r.validateHand(good({ hands: [{ side: 'X', pts: pts42() }] })), null);
    assert.equal(r.validateHand(good({ id: 'x'.repeat(33) })), null);
    assert.equal(r.validateHand(good({ hands: 'nope' })), null);
    assert.equal(r.validateHand(null), null);
});

test('acceptHand chỉ nhận gói từ tracker active', () => {
    const r = createRelay();
    assert.equal(r.acceptHand(good(), 'sockA'), null);
    r.setActive('trk_ab12', 'sockA');
    assert.equal(r.activeId(), 'trk_ab12');
    assert.ok(r.acceptHand(good(), 'sockA'));
    assert.equal(r.acceptHand(good({ id: 'trk_zz99' }), 'sockB'), null);
});

test('dropSocket của socket active xóa activeId; socket khác thì không', () => {
    const r = createRelay();
    r.setActive('trk_ab12', 'sockA');
    assert.equal(r.dropSocket('sockB'), false); assert.equal(r.activeId(), 'trk_ab12');
    assert.equal(r.dropSocket('sockA'), true); assert.equal(r.activeId(), null);
});

test('sweep xóa tracker im quá staleMs; touch giữ sống', () => {
    let now = 0;
    const r = createRelay({ now: () => now, staleMs: 3000 });
    r.setActive('trk_ab12', 'sockA');
    now = 2000; r.touch('trk_ab12');
    now = 4500; assert.equal(r.sweep(), false); assert.equal(r.activeId(), 'trk_ab12');
    now = 5001; assert.equal(r.sweep(), true); assert.equal(r.activeId(), null);
    assert.equal(r.sweep(), false);
});

const base = { baseWidth: 1080, baseHeight: 1920 };
const tf = (over) => ({ positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, sourceWidth: 1920, sourceHeight: 1080,
    cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0, boundsType: 'OBS_BOUNDS_NONE', boundsWidth: 0, boundsHeight: 0, alignment: 5, rotation: 0, ...over });
const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= (eps || 0.1), `${a} ≠ ${b}`);

test('sceneItemToCamRect: nguồn 16:9 phủ dọc, top-left, không crop', () => {
    const c = sceneItemToCamRect(tf({ scaleX: 1.77778, scaleY: 1.77778, positionX: -1166.7 }), base);
    near(c.xPercent, -108.02); near(c.yPercent, 0); near(c.widthPercent, 316.05); near(c.heightPercent, 100);
});

test('sceneItemToCamRect: crop trái/phải 420, scale 1, top-left', () => {
    const c = sceneItemToCamRect(tf({ cropLeft: 420, cropRight: 420 }), base);
    near(c.xPercent, -38.89); near(c.widthPercent, 177.78); near(c.heightPercent, 56.25); near(c.yPercent, 0);
});

test('sceneItemToCamRect: alignment center, position giữa', () => {
    const c = sceneItemToCamRect(tf({ alignment: 0, positionX: 540, positionY: 960 }), base);
    near(c.xPercent, -38.89); near(c.yPercent, 21.88);
});

test('sceneItemToCamRect: bounds STRETCH 1080×1920 cho nguồn crop vuông', () => {
    const c = sceneItemToCamRect(tf({ cropLeft: 420, cropRight: 420, boundsType: 'OBS_BOUNDS_STRETCH', boundsWidth: 1080, boundsHeight: 1920 }), base);
    // cropW 1080 → sx = 1; cropH 1080 → sy = 1920/1080
    near(c.xPercent, -38.89); near(c.widthPercent, 177.78); near(c.heightPercent, 100); near(c.yPercent, 0);
});

// ---- Vòng sửa sau review: các chế độ bounds của OBS ----
test('sceneItemToCamRect: SCALE_INNER (Fit to screen) 16:9 trong khung dọc → letterbox giữa', () => {
    const c = sceneItemToCamRect(tf({ boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsWidth: 1080, boundsHeight: 1920, boundsAlignment: 0 }), base);
    near(c.xPercent, 0); near(c.yPercent, 34.18); near(c.widthPercent, 100); near(c.heightPercent, 31.64);
});
test('sceneItemToCamRect: SCALE_OUTER → phủ kín, tràn 2 bên', () => {
    const c = sceneItemToCamRect(tf({ boundsType: 'OBS_BOUNDS_SCALE_OUTER', boundsWidth: 1080, boundsHeight: 1920, boundsAlignment: 0 }), base);
    near(c.xPercent, -108.02); near(c.yPercent, 0); near(c.widthPercent, 316.05); near(c.heightPercent, 100);
});
test('sceneItemToCamRect: MAX_ONLY không phóng to nguồn nhỏ', () => {
    const c = sceneItemToCamRect(tf({ sourceWidth: 640, sourceHeight: 360, boundsType: 'OBS_BOUNDS_MAX_ONLY', boundsWidth: 1080, boundsHeight: 1920, boundsAlignment: 0 }), base);
    near(c.xPercent, 20.37); near(c.yPercent, 40.63); near(c.widthPercent, 59.26); near(c.heightPercent, 18.75);
});
test('sceneItemToCamRect: boundsAlignment top-left (5) đặt hình sát góc khung', () => {
    const c = sceneItemToCamRect(tf({ boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsWidth: 1080, boundsHeight: 1920, boundsAlignment: 5 }), base);
    near(c.yPercent, 0); near(c.xPercent, 0);
});
test('sceneItemToCamRect: bounds + alignment center của item', () => {
    const c = sceneItemToCamRect(tf({ alignment: 0, positionX: 540, positionY: 960, boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsWidth: 1080, boundsHeight: 1920, boundsAlignment: 0 }), base);
    near(c.xPercent, 0); near(c.yPercent, 34.18);
});

// ---- heartbeat tracker (I1) ----
test('heartbeat của tracker active chỉ touch, không đổi; id mới mới thay active', () => {
    let now = 0;
    const r = createRelay({ now: () => now, staleMs: 3000 });
    assert.equal(r.heartbeat('trk_a', 'sA'), true);
    now = 2500; assert.equal(r.heartbeat('trk_a', 'sA'), false);
    now = 5000; assert.equal(r.sweep(), false);
    assert.equal(r.heartbeat('trk_b', 'sB'), true); assert.equal(r.activeId(), 'trk_b');
});
test('release(id) bỏ active theo id kể cả khi socketId đã đổi', () => {
    const r = createRelay();
    r.setActive('trk_a', 'sOld');
    assert.equal(r.release('trk_zz'), false);
    assert.equal(r.release('trk_a'), true); assert.equal(r.activeId(), null);
});

// ---- camera lật ngang/dọc trong OBS (scaleX/scaleY âm) ----
test('sceneItemToCamRect: scaleX âm (lật ngang) → width dương, x là mép trái thật, flipX=true', () => {
    // OBS: position là điểm neo top-left của item; scaleX=-1 làm hình vẽ ngược sang trái từ positionX
    const c = sceneItemToCamRect(tf({ scaleX: -1, scaleY: 1, positionX: 1583, positionY: 376 }), base);
    near(c.xPercent, -31.2); near(c.yPercent, 19.58); near(c.widthPercent, 177.78); near(c.heightPercent, 56.25);
    assert.equal(c.flipX, true); assert.equal(c.flipY, false);
});
test('sceneItemToCamRect: không lật → flipX/flipY = false', () => {
    const c = sceneItemToCamRect(tf({}), base);
    assert.equal(c.flipX, false); assert.equal(c.flipY, false);
});

// ---- sao chép transform camera sang Scene quét (chỉ các trường SetSceneItemTransform chấp nhận) ----
const { pickTransformForCopy } = require('../lib/chemtraicay-relay.js');
test('pickTransformForCopy: giữ position/scale/rotation/alignment/crop, bỏ width/height/sourceWidth', () => {
    const t = pickTransformForCopy(tf({ positionX: 10, positionY: 20, scaleX: -1, scaleY: 2, rotation: 0, alignment: 5, cropLeft: 3, cropRight: 4, cropTop: 5, cropBottom: 6, width: -1920, height: 2160 }));
    assert.deepEqual(t, { positionX: 10, positionY: 20, scaleX: -1, scaleY: 2, rotation: 0, alignment: 5, cropLeft: 3, cropRight: 4, cropTop: 5, cropBottom: 6, boundsType: 'OBS_BOUNDS_NONE' });
});
test('pickTransformForCopy: bounds ≠ NONE thì kèm boundsWidth/Height/Alignment (tối thiểu 1)', () => {
    const t = pickTransformForCopy(tf({ boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsWidth: 1080, boundsHeight: 1920, boundsAlignment: 0 }));
    assert.equal(t.boundsType, 'OBS_BOUNDS_SCALE_INNER'); assert.equal(t.boundsWidth, 1080); assert.equal(t.boundsHeight, 1920); assert.equal(t.boundsAlignment, 0);
    const t2 = pickTransformForCopy(tf({ boundsType: 'OBS_BOUNDS_STRETCH', boundsWidth: 0, boundsHeight: 0 }));
    assert.equal(t2.boundsWidth, 1); assert.equal(t2.boundsHeight, 1);
});

// ---- ensureScanScene: dựng Scene quét bằng obs-websocket giả lập ----
const { ensureScanScene } = require('../lib/chemtraicay-relay.js');
function fakeObs(state) {
    const calls = [];
    const call = async (req, data) => {
        calls.push([req, data]);
        switch (req) {
            case 'GetSceneItemId': if (data.sceneName === 'LIVE' && data.sourceName === 'Cam') return { sceneItemId: 31 }; throw new Error('No scene items were found');
            case 'GetSceneItemTransform': return { sceneItemTransform: { positionX: 1583, positionY: 376, scaleX: -1, scaleY: 1, rotation: 0, alignment: 5, cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0, boundsType: 'OBS_BOUNDS_NONE', boundsWidth: 0, boundsHeight: 0, sourceWidth: 1920, sourceHeight: 1080, width: -1920, height: 1080 } };
            case 'GetSceneList': return { scenes: state.scenes.map(n => ({ sceneName: n })) };
            case 'CreateScene': state.scenes.push(data.sceneName); state.items[data.sceneName] = []; return {};
            case 'GetSceneItemList': return { sceneItems: state.items[data.sceneName] || [] };
            case 'CreateSceneItem': { const id = 7; (state.items[data.sceneName] = state.items[data.sceneName] || []).push({ sourceName: data.sourceName, sceneItemId: id, sceneItemEnabled: true }); return { sceneItemId: id }; }
            case 'SetSceneItemEnabled': return {};
            case 'SetSceneItemTransform': state.lastTransform = data; return {};
            default: throw new Error('unexpected ' + req);
        }
    };
    return { call, calls };
}
test('ensureScanScene: tạo Scene mới, thêm camera, sao chép transform (không đụng Scene live)', async () => {
    const st = { scenes: ['LIVE'], items: { LIVE: [{ sourceName: 'Cam', sceneItemId: 31, sceneItemEnabled: true }] } };
    const obs = fakeObs(st);
    const r = await ensureScanScene(obs.call, { liveScene: 'LIVE', source: 'Cam', scanScene: 'CTC Quét' });
    assert.equal(r.created, true); assert.equal(r.sceneItemId, 7); assert.equal(r.scanScene, 'CTC Quét');
    assert.deepEqual(st.lastTransform, { sceneName: 'CTC Quét', sceneItemId: 7, sceneItemTransform: { positionX: 1583, positionY: 376, scaleX: -1, scaleY: 1, rotation: 0, alignment: 5, cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0, boundsType: 'OBS_BOUNDS_NONE' } });
    assert.ok(!obs.calls.some(([req, d]) => (req === 'SetSceneItemTransform' || req === 'SetSceneItemEnabled' || req === 'CreateSceneItem') && d.sceneName === 'LIVE'));
});
test('ensureScanScene: Scene quét đã có camera → chỉ cập nhật transform, không tạo thêm', async () => {
    const st = { scenes: ['LIVE', 'CTC Quét'], items: { LIVE: [], 'CTC Quét': [{ sourceName: 'Cam', sceneItemId: 9, sceneItemEnabled: false }] } };
    const obs = fakeObs(st);
    const r = await ensureScanScene(obs.call, { liveScene: 'LIVE', source: 'Cam', scanScene: 'CTC Quét' });
    assert.equal(r.created, false); assert.equal(r.sceneItemId, 9);
    assert.ok(!obs.calls.some(([req]) => req === 'CreateScene' || req === 'CreateSceneItem'));
    assert.ok(obs.calls.some(([req, d]) => req === 'SetSceneItemEnabled' && d.sceneItemId === 9 && d.sceneItemEnabled === true));
});
test('ensureScanScene: camera không có trong Scene live → ném lỗi, không tạo gì', async () => {
    const st = { scenes: ['LIVE'], items: { LIVE: [] } };
    const obs = fakeObs(st);
    await assert.rejects(() => ensureScanScene(obs.call, { liveScene: 'LIVE', source: 'Khác', scanScene: 'CTC Quét' }));
    assert.ok(!obs.calls.some(([req]) => req === 'CreateScene'));
});
