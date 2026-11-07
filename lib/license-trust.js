// 🔐 Bảo mật (v1.25): server chỉ tin bản quyền đọc từ TOKEN ĐÃ KÝ RSA, gắn mã máy (hpkey/index getStatus — không gọi mạng).
// Trước đây vai trò / danh sách ID / tính năng đọc từ app-config.json (file thường): sửa "CREATOR" → "ADMIN" là
// bỏ được ràng buộc ID TikTok, và /api/connect không kiểm key nên gọi thẳng API là dùng chùa.
'use strict';

// Token hợp lệ còn hạn (kể cả hạn offline) → bản quyền chuẩn hoá; ngược lại null.
function view(st) {
    if (!st || !st.licensed || st.expired || st.offlineOk === false) return null;
    return {
        activated: true,
        key: String(st.key || ''),
        role: String(st.role || 'ADMIN').toUpperCase(),
        allowedIds: Array.isArray(st.allowedIds) ? st.allowedIds.map(x => String(x).toLowerCase()) : [],
        features: Array.isArray(st.features) ? st.features.map(String) : null,
        gameState: st.gameState && typeof st.gameState === 'object' ? st.gameState : {},
        expiresAt: Number(st.expiresAt) || 0
    };
}

// Nhớ đệm: getStatus đọc registry (reg.exe) — featureOn() gọi theo từng quà nên không đọc mỗi lần.
function createTrustedLicense({ getStatus, ttlMs = 30000, now = Date.now } = {}) {
    let cache = null, at = -Infinity;
    function get() {
        if (now() - at < ttlMs) return cache;
        let st = null;
        try { st = getStatus(); } catch (_) { st = null; }
        cache = view(st);
        at = now();
        return cache;
    }
    return { get, invalidate() { at = -Infinity; } };
}

// Luật kết nối phòng LIVE theo bản quyền đã ký.
function connectAllowed(lic, username) {
    const name = String(username || '').replace(/^@/, '').trim().toLowerCase();
    if (!lic) return { ok: false, reason: 'no_license' };
    if (lic.role === 'CREATOR' && lic.key) {
        if (name !== String(lic.key).replace(/^@/, '').trim().toLowerCase()) return { ok: false, reason: 'creator_locked' };
    }
    if (lic.role === 'VIP' && lic.allowedIds.length && lic.allowedIds.indexOf(name) < 0) return { ok: false, reason: 'vip_not_allowed' };
    return { ok: true };
}

// KHÔNG VĂNG KEY: token ĐÃ KÝ còn hạn key nhưng vừa quá hạn offline (mất mạng lúc mở app / vừa cập nhật chưa kịp
// xác thực) → vẫn cho chạy thêm 24 h sau offlineUntil. Chỉ đọc từ token đã ký (hpkey getStatus) — KHÔNG dựng từ
// app-config.json (file thường: sửa activated/role/lastValidated là bỏ qua được bản quyền).
const GRACE_MS = 24 * 3600 * 1000;
function offlineGrace(st, now = Date.now()) {
    if (!st || !st.licensed || st.expired) return null;
    if (st.offlineOk !== false) return view(st);
    const until = Number(st.offlineUntil) * 1000;          // giây, nằm trong token đã ký
    if (!until || now - until > GRACE_MS) return null;
    return view(Object.assign({}, st, { offlineOk: true }));
}

module.exports = { createTrustedLicense, connectAllowed, view, offlineGrace };
