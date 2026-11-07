// 🔐 Bảo mật — server chỉ tin bản quyền từ token ĐÃ KÝ RSA gắn mã máy (hpkey getStatus), không tin app-config.json
const test = require('node:test');
const assert = require('node:assert');
const { createTrustedLicense, connectAllowed } = require('../lib/license-trust.js');

const token = (o) => Object.assign({ licensed: true, offlineOk: true, key: 'hpmedia.official', role: 'CREATOR', allowedIds: [], features: null, gameState: {} }, o);

test('chỉ nhận token hợp lệ: chưa có / hết hạn / quá hạn offline → null', () => {
    assert.strictEqual(createTrustedLicense({ getStatus: () => ({ licensed: false }) }).get(), null);
    assert.strictEqual(createTrustedLicense({ getStatus: () => token({ licensed: false, expired: true }) }).get(), null);
    assert.strictEqual(createTrustedLicense({ getStatus: () => token({ offlineOk: false }) }).get(), null);
    assert.strictEqual(createTrustedLicense({ getStatus: () => { throw new Error('reg'); } }).get(), null);
    const ok = createTrustedLicense({ getStatus: () => token({ role: 'VIP', allowedIds: ['A', 'b'] }) }).get();
    assert.deepStrictEqual([ok.role, ok.allowedIds, ok.features], ['VIP', ['a', 'b'], null]);
});

test('nhớ đệm theo TTL (không gọi reg.exe mỗi quà); invalidate() đọc lại ngay', () => {
    let n = 0, now = 1000;
    const t = createTrustedLicense({ getStatus: () => { n++; return token(); }, ttlMs: 30000, now: () => now });
    t.get(); t.get();
    assert.strictEqual(n, 1);
    now += 30001; t.get();
    assert.strictEqual(n, 2);
    t.invalidate(); t.get();
    assert.strictEqual(n, 3);
});

test('offlineGrace: không văng key — chỉ từ token ĐÃ KÝ, quá hạn offline ≤ 24h; KHÔNG BAO GIỜ dựng từ app-config', () => {
    const { offlineGrace } = require('../lib/license-trust.js');
    const now = Date.parse('2026-11-07T12:00:00Z');
    const st = (hOver, extra) => token(Object.assign({ offlineOk: false, offlineUntil: Math.floor((now - hOver * 3600e3) / 1000) }, extra));
    assert.ok(offlineGrace(st(2), now));
    assert.strictEqual(offlineGrace(st(2, { role: 'VIP' }), now).role, 'VIP', 'vai trò lấy từ token');
    assert.strictEqual(offlineGrace(st(25), now), null, 'quá 24h sau hạn offline → cần mạng');
    assert.strictEqual(offlineGrace(st(2, { licensed: false, expired: true }), now), null, 'key hết hạn');
    assert.strictEqual(offlineGrace(st(2, { offlineUntil: 0 }), now), null);
    assert.strictEqual(offlineGrace({ licensed: false }, now), null);
    assert.strictEqual(offlineGrace(null, now), null);
    // Lỗ cũ: app-config.json sửa tay (không chữ ký) → KHÔNG được ân hạn
    assert.strictEqual(offlineGrace({ activated: true, key: 'k', role: 'ADMIN', lastValidated: now }, now), null);
});

test('connectAllowed: không key → chặn; CREATOR chỉ đúng ID của key; VIP theo danh sách; ADMIN tự do', () => {
    assert.strictEqual(connectAllowed(null, 'abc').ok, false);
    assert.strictEqual(connectAllowed(null, 'abc').reason, 'no_license');
    const creator = token();
    assert.strictEqual(connectAllowed(creator, '@HPMedia.Official').ok, true);
    assert.strictEqual(connectAllowed(creator, 'nguoikhac').reason, 'creator_locked');
    const vip = token({ role: 'VIP', allowedIds: ['a1', 'b2'] });
    assert.strictEqual(connectAllowed(vip, 'a1').ok, true);
    assert.strictEqual(connectAllowed(vip, 'zz').reason, 'vip_not_allowed');
    assert.strictEqual(connectAllowed(token({ role: 'VIP', allowedIds: [] }), 'zz').ok, true);
    assert.strictEqual(connectAllowed(token({ role: 'ADMIN' }), 'bat_ky').ok, true);
});
