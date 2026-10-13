import test from 'node:test';
import assert from 'node:assert';

// HpSharedTracker sống trong iframe con: cần innerWidth/innerHeight + addEventListener của trang.
globalThis.addEventListener = () => {};
const { HpSharedTracker } = await import('../public/lib/hp-tracking.mjs');

function makeHost(over = {}) {
    const needs = new Map();
    return {
        W: 1080, H: 1920, timeOrigin: performance.timeOrigin, lastFrameAt: 0, needs,
        tracker: { hands: [], face: null, pose: null, seg: null, handsAt: 0, poseAt: 0 },
        need(key, w) { if (w) needs.set(key, { ...w }); else needs.delete(key); },
        quality() {}, ready: Promise.resolve(), ...over
    };
}
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('trang 9:16, con cùng cỡ sân khấu mẹ → trả nguyên đối tượng của mẹ (không đổi)', async () => {
    globalThis.innerWidth = 1080; globalThis.innerHeight = 1920;
    const host = makeHost();
    host.tracker.pose = [{ x: 10, y: 20, v: 1 }];
    const t = new HpSharedTracker(host, 'dapmuoi', { width: 1080, height: 1920 });
    t.want({ pose: true }); await t.startExternal();
    assert.strictEqual(t.pose, host.tracker.pose);
});

test('Browser Source ngang 1920×1080: con dùng sân khấu = cỡ trang → đổi bằng contain, không kéo giãn từng trục', async () => {
    globalThis.innerWidth = 1920; globalThis.innerHeight = 1080;
    const host = makeHost();
    // điểm (100, 200) của trang → sân khấu mẹ 1080×1920 contain: tỉ lệ 0.5625, dời y 656.25
    host.tracker.pose = [{ x: 100 * 0.5625, y: 656.25 + 200 * 0.5625, v: 0.9 }];
    host.tracker.seg = { w: 2, h: 2, data: new Float32Array(4), M: [0.5625, 0, 0, 0.5625, 0, 656.25] };
    const t = new HpSharedTracker(host, 'bancung', { width: 1920, height: 1080 });
    t.want({ hands: false, pose: true, segment: true }); await t.startExternal();
    near(t.pose[0].x, 100); near(t.pose[0].y, 200); assert.strictEqual(t.pose[0].v, 0.9);
    // mặt nạ: pixel (0,0) → điểm (0,0) của trang
    const M = t.seg.M;
    near(M[0], 1); near(M[3], 1); near(M[4], 0); near(M[5], 0);
    assert.strictEqual(t.pose, t.pose);   // nhớ theo đối tượng gốc, đọc lại không tính lại
});

test('mốc thời gian đổi sang đồng hồ iframe; chỉ trả phần game đã xin', async () => {
    globalThis.innerWidth = 1080; globalThis.innerHeight = 1920;
    const host = makeHost({ timeOrigin: performance.timeOrigin - 500 });   // mẹ mở trước con 500ms
    host.tracker.poseAt = 1500; host.tracker.handsAt = 0; host.lastFrameAt = 1600;
    host.tracker.hands = [{ id: 'Left' }];
    const t = new HpSharedTracker(host, 'level-quest', { width: 1080, height: 1920 });
    t.want({ hands: false, pose: true });
    assert.strictEqual(t.pose, null);                       // chưa start
    await t.startExternal();
    assert.strictEqual(t.poseAt, 1000);
    assert.strictEqual(t.lastFrameAt, 1100);
    assert.strictEqual(t.handsAt, 0);                       // 0 giữ là "chưa có"
    assert.deepStrictEqual(t.hands, []);                    // không xin tay
});

test('mỗi bản một khoá: stop() muộn của bản cũ không gỡ bản mới cùng game', async () => {
    globalThis.innerWidth = 1080; globalThis.innerHeight = 1920;
    const host = makeHost();
    const a = new HpSharedTracker(host, 'dapmuoi'), b = new HpSharedTracker(host, 'dapmuoi');
    await a.startExternal(); await b.startExternal();
    a.stop();
    assert.ok(host.needs.has(b.key));
    assert.ok(!host.needs.has(a.key));
});
