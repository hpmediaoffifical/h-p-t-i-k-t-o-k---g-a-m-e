// 🔐 Tự cập nhật phải có SHA-256 hợp lệ từ GitHub (asset.digest) mới được chạy file cài
const test = require('node:test');
const assert = require('node:assert');
const { assetSha256 } = require('../lib/update-integrity.js');

test('assetSha256 đọc digest sha256 của asset GitHub; thiếu / sai dạng → rỗng', () => {
    const hex = '7882ad5caa34ec926caeb6c7f04b284453f1108f7e946352960c957a4d8df4cb';
    assert.strictEqual(assetSha256({ digest: 'sha256:' + hex }), hex);
    assert.strictEqual(assetSha256({ digest: 'SHA256:' + hex.toUpperCase() }), hex);
    assert.strictEqual(assetSha256({}), '');
    assert.strictEqual(assetSha256({ digest: 'sha512:abc' }), '');
    assert.strictEqual(assetSha256({ digest: 'sha256:1234' }), '');
    assert.strictEqual(assetSha256(null), '');
});
