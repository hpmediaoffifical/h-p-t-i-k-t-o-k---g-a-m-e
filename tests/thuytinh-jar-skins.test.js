const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SKINS, byId } = require('../public/games/thuytinh/jar-skins.js');

test('jar-skins: đủ kiểu hũ, id không trùng, có ảnh front/back WebP', () => {
    assert.ok(SKINS.length >= 30);
    assert.equal(new Set(SKINS.map(s => s.id)).size, SKINS.length);
    for (const s of SKINS) {
        for (const f of [s.front, s.back]) assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', f)), f);
        assert.equal(byId[s.id], s);
    }
});

test('jar-skins: hình học hợp lệ cho engine (SHAPE đủ mốc, thành trong từ miệng xuống tâm đáy)', () => {
    const KEYS = ['neckTopY', 'neckLeftX', 'neckRightX', 'bodyLeftX', 'bodyRightX', 'bodyTopY', 'bodyBottomY', 'shoulderY'];
    for (const s of SKINS) {
        for (const k of KEYS) assert.ok(s.shape[k] >= 0 && s.shape[k] <= 1, `${s.id}.${k}`);
        assert.ok(s.shape.neckLeftX < s.shape.neckRightX && s.shape.neckTopY < s.shape.bodyBottomY, s.id);
        const pts = s.innerRight;
        assert.ok(pts.length >= 3, s.id);
        for (const [x, y] of pts) assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1, `${s.id} điểm ngoài khung`);
        assert.ok(Math.abs(pts[0][1] - s.shape.neckTopY) < 0.02, `${s.id}: điểm đầu phải ở mép miệng`);
        assert.ok(Math.abs(pts[pts.length - 1][0] - s.cx) < 0.01, `${s.id}: điểm cuối phải ở tâm đáy`);
        // lối vào đủ rộng cho quà (≥ 50% bề ngang hũ)
        assert.ok((pts[0][0] - s.cx) * 2 >= 0.5, `${s.id}: miệng quá hẹp`);
    }
});
