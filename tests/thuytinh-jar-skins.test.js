const test = require('node:test');
const assert = require('node:assert/strict');
const { SKINS, byId } = require('../public/games/thuytinh/jar-skins.js');

// 46 kiểu hũ dựng tự động đã gỡ (29/10/2026) — chỉ còn hũ mặc định cho tới khi có khung trang trí mới
// (art-requests/thuytinh/trang-tri/BRIEF-TRANG-TRI.md). Kiểu cũ còn nằm trong config máy khách phải về mặc định.
test('jar-skins: chỉ còn hũ mặc định, id kiểu cũ không còn nhận', () => {
    assert.ok(Array.isArray(SKINS));
    assert.equal(SKINS.length, 0);
    for (const id of ['quoc-khanh', 'mason-co-dien', 'bi-ngo']) assert.equal(byId[id], undefined, id);
});
