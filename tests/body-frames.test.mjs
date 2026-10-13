// node --test tests/body-frames.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyFrames, toStage, toLocal, biteSpots, BITE_ZONES, headAnchor, placeAbove, homePlace, followStep, rescaleAnchor } from '../public/lib/body-frames.mjs';

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

// ---------- Level Quest bám đầu: đỉnh đầu, đặt chỗ thanh, lọc mượt ----------
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const BOX = { w: 1012, h: 260 };
const HEAD = { crown: { x: 540, y: 546 }, headW: 200 };

test('đỉnh đầu (crown) = tâm đầu lùi ngược hướng v một đoạn 0.72 × bề rộng đầu', () => {
    const c = bodyFrames(fakePose(), null).head.crown;
    assert.ok(near(c.x, 540) && near(c.y, 546), JSON.stringify(c));
});

test('headAnchor: có đầu → crown + bề rộng đầu; chỉ có thân → ước lượng từ vai; không thấy người → null', () => {
    const a = headAnchor(bodyFrames(fakePose(), null));
    assert.ok(near(a.crown.x, 540) && near(a.crown.y, 546) && near(a.headW, 200));
    const noHead = { 0: { v: 0 }, 2: { v: 0 }, 5: { v: 0 }, 7: { v: 0 }, 8: { v: 0 } };
    const b = headAnchor(bodyFrames(fakePose(noHead), null));
    assert.ok(near(b.crown.x, 540) && near(b.crown.y, 520) && near(b.headW, 220), JSON.stringify(b));
    assert.equal(headAnchor(bodyFrames(null, null)), null);
    assert.equal(headAnchor(null), null);
});

test('placeAbove: căn giữa đỉnh đầu, mép dưới cách đỉnh gap + 8% đầu, cỡ = scale × headW/180', () => {
    const p = placeAbove(HEAD, BOX, 1080, 1920, { scale: 0.55, gap: 20 });
    assert.ok(near(p.x, 540) && near(p.yBottom, 510) && near(p.s, 0.55 * 200 / 180), JSON.stringify(p));
});

test('placeAbove: đứng sát mép trái/phải thì thanh bị chặn trong khung (lề 6px)', () => {
    const bw = BOX.w * 0.55 * 200 / 180;
    const L = placeAbove({ ...HEAD, crown: { x: 50, y: 546 } }, BOX, 1080, 1920, { scale: 0.55, gap: 20 });
    const R = placeAbove({ ...HEAD, crown: { x: 1060, y: 546 } }, BOX, 1080, 1920, { scale: 0.55, gap: 20 });
    assert.ok(near(L.x, bw / 2 + 6) && near(R.x, 1080 - bw / 2 - 6), JSON.stringify([L, R]));
});

test('placeAbove: hệ số cỡ đầu kẹp trong 0.65–1.4', () => {
    assert.ok(near(placeAbove({ ...HEAD, headW: 50 }, BOX, 1080, 1920, { scale: 0.55 }).s, 0.55 * 0.65));
    assert.ok(near(placeAbove({ ...HEAD, headW: 400 }, BOX, 1080, 1920, { scale: 0.55 }).s, 0.55 * 1.4));
});

test('placeAbove: cụm rộng hơn khung thì căn giữa khung', () => {
    const p = placeAbove({ crown: { x: 200, y: 900 }, headW: 252 }, BOX, 1080, 1920, { scale: 1.5, gap: 20 });
    assert.ok(near(p.x, 540) && near(p.s, 2.1), JSON.stringify(p));
});

test('placeAbove: người sát mép trên thì thanh không ra ngoài khung (mép trên ≥ 6px)', () => {
    const p = placeAbove({ ...HEAD, crown: { x: 540, y: 100 } }, BOX, 1080, 1920, { scale: 0.55, gap: 20 });
    assert.ok(near(p.yBottom, 6 + BOX.h * p.s), JSON.stringify(p));
});

test('homePlace: giữa ngang, mép trên cụm cách mép trên khung 30px, cỡ = scale', () => {
    const p = homePlace(BOX, 1080, 1920, { scale: 0.55 });
    assert.ok(near(p.x, 540) && near(p.yBottom, 30 + 260 * 0.55) && near(p.s, 0.55), JSON.stringify(p));
});

test('followStep: lần đầu nhận target; lọc mũ theo thời gian thật (tau 90ms)', () => {
    const t = { x: 10, yBottom: 20, s: 0.5 };
    assert.deepEqual(followStep(null, t, 16), t);
    const p = followStep({ x: 0, yBottom: 0, s: 1 }, { x: 100, yBottom: 0, s: 1 }, 90);
    assert.ok(near(p.x, 100 * (1 - Math.exp(-1))), JSON.stringify(p));
});

test('followStep: rung nhỏ (< 2px, < 0.01 cỡ) bỏ qua — trả lại đúng object cũ', () => {
    const prev = { x: 100, yBottom: 100, s: 0.5 };
    assert.equal(followStep(prev, { x: 101, yBottom: 100.5, s: 0.505 }, 16), prev);
});

test('followStep: 60 khung × 16ms thì tới gần đích (≤ 2px)', () => {
    let p = { x: 0, yBottom: 0, s: 1 };
    for (let i = 0; i < 60; i++) p = followStep(p, { x: 100, yBottom: 0, s: 1 }, 16);
    assert.ok(Math.abs(p.x - 100) <= 2, JSON.stringify(p));
});

test('headAnchor: ngồi sát camera, hai vai ra ngoài khung → vẫn có đỉnh đầu từ tai (không mất người)', () => {
    const noBody = { 11: { v: 0 }, 12: { v: 0 }, 23: { v: 0 }, 24: { v: 0 } };
    const F = bodyFrames(fakePose(noBody), null);
    assert.equal(F.seen, false, 'Đập Muỗi vẫn coi là không thấy người (cần vai)');
    const a = headAnchor(F);
    assert.ok(a && near(a.crown.x, 540) && near(a.crown.y, 546) && near(a.headW, 200), JSON.stringify(a));
});

test('headAnchor: không vai, không tai → ước lượng từ hai mắt (bề rộng đầu = 2.3 × khoảng mắt)', () => {
    const P = { 7: { v: 0 }, 8: { v: 0 }, 11: { v: 0 }, 12: { v: 0 }, 23: { v: 0 }, 24: { v: 0 } };
    const a = headAnchor(bodyFrames(fakePose(P), null));
    assert.ok(a && near(a.crown.x, 540) && near(a.headW, 184) && near(a.crown.y, 690 - 0.72 * 184), JSON.stringify(a));
});

test('headAnchor: không vai, chỉ thấy mũi → null (không đoán được cỡ đầu)', () => {
    const P = { 2: { v: 0 }, 5: { v: 0 }, 7: { v: 0 }, 8: { v: 0 }, 11: { v: 0 }, 12: { v: 0 }, 23: { v: 0 }, 24: { v: 0 } };
    assert.equal(headAnchor(bodyFrames(fakePose(P), null)), null);
});

test('rescaleAnchor: đổi toạ độ đỉnh đầu từ cỡ khung cũ sang cỡ trang hiện tại (đổi cỡ Browser Source)', () => {
    const a = rescaleAnchor({ crown: { x: 540, y: 546 }, headW: 200 }, 1080, 1920, 2160, 3840);
    assert.ok(near(a.crown.x, 1080) && near(a.crown.y, 1092) && near(a.headW, 400), JSON.stringify(a));
    const same = { crown: { x: 1, y: 2 }, headW: 3 };
    assert.equal(rescaleAnchor(same, 1080, 1920, 1080, 1920), same, 'cùng cỡ → trả lại nguyên object');
    assert.equal(rescaleAnchor(null, 1080, 1920, 540, 960), null);
});
