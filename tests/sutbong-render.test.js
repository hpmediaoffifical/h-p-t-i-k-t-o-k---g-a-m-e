// ⚽ Sút Bóng — phần hình học thuần của bộ vẽ public/games/sutbong/render.js (bóng 32 mặt xoay 3D, phối cảnh khung gôn)
// và góc bàn tay trong handsFromPose (găng xoay theo hướng ngón).
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../public/games/sutbong/render.js');
const S = require('../public/games/sutbong/game.js');

test('ballGeometry: khối cầu 32 mặt — 60 đỉnh, 90 cạnh, 12 ngũ giác, mọi đỉnh trên mặt cầu đơn vị', () => {
    const g = R.ballGeometry();
    assert.equal(g.verts.length, 60);
    assert.equal(g.edges.length, 90);
    assert.equal(g.pents.length, 12);
    for (const v of g.verts) assert.ok(Math.abs(Math.hypot(v[0], v[1], v[2]) - 1) < 1e-9);
    for (const p of g.pents) assert.equal(new Set(p).size, 5);
    // mỗi đỉnh thuộc đúng 1 ngũ giác (bóng đá: mỗi đỉnh = 1 ngũ giác + 2 lục giác)
    const seen = new Map();
    for (const p of g.pents) for (const i of p) seen.set(i, (seen.get(i) || 0) + 1);
    assert.equal(seen.size, 60);
    assert.ok([...seen.values()].every(n => n === 1));
    assert.strictEqual(R.ballGeometry(), g, 'dựng 1 lần rồi dùng lại');
});

test('rotate: ma trận xoay giữ độ dài, xoay 2π về chỗ cũ', () => {
    const v = [0.3, -0.5, 0.81];
    const L = Math.hypot(...v);
    const a = R.rotate(v, 0.7, -1.3);
    assert.ok(Math.abs(Math.hypot(...a) - L) < 1e-9);
    const b = R.rotate(v, Math.PI * 2, Math.PI * 2);
    v.forEach((x, i) => assert.ok(Math.abs(b[i] - x) < 1e-9));
});

test('goalBox: mặt sau khung gôn co về tâm phối cảnh, nhỏ hơn và nằm trong mặt trước', () => {
    const g = { x: 100, y: 600, w: 880, h: 900 };
    const b = R.goalBox(g, { x: 540, y: 760 }, 0.8);
    assert.ok(b.back.w < g.w && b.back.h < g.h);
    assert.ok(b.back.x > g.x && b.back.x + b.back.w < g.x + g.w);
    assert.ok(b.back.y > g.y && b.back.y + b.back.h < g.y + g.h);
    assert.deepEqual(b.front, g);
});

test('handsFromPose: có góc `a` từ cổ tay về phía ngón (radian), không có ngón → hướng lên', () => {
    const P = Array.from({ length: 33 }, () => ({ x: 0, y: 0, v: 0 }));
    P[15] = { x: 300, y: 500, v: 1 }; P[19] = { x: 400, y: 500, v: 1 };   // ngón chĩa sang phải
    P[16] = { x: 700, y: 500, v: 1 };                                      // không ngón
    const [l, r] = S.handsFromPose(P);
    assert.ok(Math.abs(l.a - 0) < 1e-9);
    assert.ok(Math.abs(r.a - (-Math.PI / 2)) < 1e-9);
});
