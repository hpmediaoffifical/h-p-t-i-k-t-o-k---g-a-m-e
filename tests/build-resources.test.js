// node --test tests/build-resources.test.js
// Gói bộ cài (package.json build.extraResources): thư mục data/ của máy dev không được mang dữ liệu riêng vào bộ cài.
const test = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../package.json');

test('extraResources data/: bỏ profile trình duyệt caption-listener (app chỉ dùng <HP_DATA_DIR>/caption-listener ở userData)', () => {
    const data = (pkg.build.extraResources || []).find((r) => r && r.from === 'data');
    assert.ok(data, 'có mục from: data');
    assert.ok(Array.isArray(data.filter), 'mục data có filter');
    assert.ok(data.filter.includes('!caption-listener/**'), 'phải lọc !caption-listener/**');
    // Dữ liệu riêng của máy dev vẫn bị lọc như trước
    for (const f of ['!app-config.json', '!config-backups/**', '!game-state.json', '!gift-sheet-cache.json',
        '!unknown-gifts.json', '!soundfx.json', '!vipwelcome-usermap.json']) {
        assert.ok(data.filter.includes(f), f);
    }
    assert.equal(data.filter[0], '**/*', 'vẫn mang các thư mục asset mặc định');
});
