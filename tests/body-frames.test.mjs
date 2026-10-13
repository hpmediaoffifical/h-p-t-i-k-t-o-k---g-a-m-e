// node --test tests/body-frames.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyFrames, toStage, toLocal, biteSpots, BITE_ZONES } from '../public/lib/body-frames.mjs';

// Pose giả: người đứng thẳng giữa sân khấu 1080×1920, nhìn vào camera.
function fakePose(opts = {}) {
    const p = Array.from({ length: 33 }, () => ({ x: 0, y: 0, v: 0 }));
    const set = (i, x, y, v = 1) => { p[i] = { x, y, v }; };
    set(0, 540, 700);              // mũi
    set(2, 500, 670); set(5, 580, 670);   // mắt
    set(7, 440, 690); set(8, 640, 690);   // tai → bề rộng đầu 200
    set(9, 515, 760); set(10, 565, 760);  // miệng
    set(11, 340, 900); set(12, 740, 900); // vai → bề vai 400
    set(23, 380, 1500); set(24, 700, 1500); // hông
    for (const [i, q] of Object.entries(opts)) p[i] = { ...p[i], ...q };
    return p;
}

test('khung đầu: O = giữa 2 tai, |u| = width = khoảng tai; khung thân: O = giữa 2 vai, v = vai→hông', () => {
    const F = bodyFrames(fakePose(), null);
    assert.equal(F.seen, true);
    assert.deepEqual({ x: Math.round(F.head.O.x), y: Math.round(F.head.O.y) }, { x: 540, y: 690 });
    assert.ok(Math.abs(Math.hypot(F.head.u.x, F.head.u.y) - 200) < 1e-6);
    assert.ok(Math.abs(F.head.width - 200) < 1e-6);
    assert.deepEqual({ x: Math.round(F.torso.O.x), y: Math.round(F.torso.O.y) }, { x: 540, y: 900 });
    assert.ok(Math.abs(F.torso.v.y - 600) < 1e-6 && Math.abs(F.torso.v.x) < 1e-6);
    assert.ok(Math.abs(F.shoulderW - 400) < 1e-6);
});

test('toStage(toLocal(p)) ≈ p cho cả khung đầu và thân', () => {
    const F = bodyFrames(fakePose(), null);
    for (const [frame, p] of [['head', { x: 600, y: 650 }], ['torso', { x: 450, y: 1100 }]]) {
        const m = toLocal(p.x, p.y, frame, F);
        const q = toStage(m, F);
        assert.ok(Math.abs(q.x - p.x) < 1e-6 && Math.abs(q.y - p.y) < 1e-6, frame);
    }
});

test('mất 1 tai (quay nghiêng) → khung đầu dự phòng từ mắt, vẫn có head; không pose → seen false', () => {
    const F = bodyFrames(fakePose({ 8: { v: 0.1 } }), null);
    assert.ok(F.head && F.head.width >= 400 * 0.45);
    const N = bodyFrames(null, F);
    assert.equal(N.seen, false); assert.equal(N.head, null); assert.equal(N.torso, null);
});

test('EMA 0.6: pose nhảy 100px thì khung lần 2 đi được 60%', () => {
    const F1 = bodyFrames(fakePose(), null);
    const F2 = bodyFrames(fakePose({ 7: { x: 540 }, 8: { x: 740 }, 0: { x: 640 }, 2: { x: 600 }, 5: { x: 680 } }), F1);
    assert.ok(Math.abs(F2.head.O.x - 600) < 1e-6, `O.x=${F2.head.O.x}`);
});

test('biteSpots: 7 vùng × 3 = 21 điểm, tắt cheeks còn 15, mỗi điểm có frame/a/b/zone và toạ độ sân khấu', () => {
    const F = bodyFrames(fakePose(), null);
    const all = biteSpots(F, { forehead: true, cheeks: true, chin: true, neck: true, shoulders: true });
    assert.equal(all.length, 21);
    assert.deepEqual([...new Set(all.map(s => s.zone))].sort(), [...BITE_ZONES].sort());
    for (const s of all) { assert.ok(['head', 'torso'].includes(s.frame)); assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y)); }
    const forehead = all.find(s => s.zone === 'forehead');
    assert.ok(forehead.y < 690, 'trán phía trên tai');
    const sh = all.find(s => s.zone === 'shoulderL');
    assert.ok(Math.abs(sh.x - (540 - 160)) < 1e-6 && Math.abs(sh.y - 930) < 1e-6);
    assert.equal(biteSpots(F, { forehead: true, cheeks: false, chin: true, neck: true, shoulders: true }).length, 15);
    assert.deepEqual(biteSpots(bodyFrames(null, null), {}), []);
});

test('biteSpots có 3 biến thể mỗi vùng (lệch nhau, ổn định giữa 2 lần gọi) để nốt không chồng lên nhau', () => {
    const F = bodyFrames(fakePose(), null);
    const all = biteSpots(F, { forehead: true, cheeks: true, chin: true, neck: true, shoulders: true });
    assert.equal(all.length, 21);
    const fh = all.filter(s => s.zone === 'forehead');
    assert.equal(fh.length, 3);
    assert.ok(new Set(fh.map(s => s.a + ',' + s.b)).size === 3, 'a,b khác nhau');
    assert.ok(fh.every(s => Math.hypot(s.x - fh[0].x, s.y - fh[0].y) < 60), 'vẫn trong vùng trán');
    const again = biteSpots(F, { forehead: true, cheeks: true, chin: true, neck: true, shoulders: true });
    assert.deepEqual(again.map(s => [s.a, s.b]), all.map(s => [s.a, s.b]));
});
