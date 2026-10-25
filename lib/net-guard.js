// lib/net-guard.js — các phép kiểm thuần (không phụ thuộc Express/Electron) cho làm cứng mạng.
//
// - hostFromHostHeader / isAllowedHost: chống DNS rebinding. Trang lạ trỏ tên miền của nó về 127.0.0.1
//   thì kết nối tới từ loopback (được coi là "tin cậy") nhưng header Host vẫn là tên miền lạ → chặn.
// - redactBackupConfig: bản sao cấu hình bỏ các bí mật, cho người gọi không tin cậy.
// - isSafeExternalUrl: chỉ http/https mới được giao cho shell.openExternal (Electron).

const LOOPBACK_V4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

// "localhost:3000" → "localhost"; "[::1]:3000" → "::1"; "Example.COM" → "example.com".
function hostFromHostHeader(value) {
    let h = String(value == null ? '' : value).trim().toLowerCase();
    if (!h) return '';
    if (h.startsWith('[')) {
        const end = h.indexOf(']');
        return end > 0 ? h.slice(1, end) : '';
    }
    const colon = h.indexOf(':');
    if (colon >= 0) {
        // Nhiều dấu ':' mà không có [] = IPv6 trần (không hợp lệ trong Host) → giữ nguyên để so khớp.
        if (h.indexOf(':', colon + 1) >= 0) return h;
        h = h.slice(0, colon);
    }
    return h.replace(/\.$/, '');
}

/**
 * Header Host có thuộc máy này không.
 * @param {string|undefined} hostHeader
 * @param {object} o
 * @param {Iterable<string>} [o.localHosts]  tên luôn hợp lệ (localhost, hpaction.obs…)
 * @param {boolean} [o.lan]                  đang cho máy khác trong LAN vào (lanAccess / HP_BIND_HOST)
 * @param {string[]} [o.lanHosts]            IP LAN + tên máy của chính máy này
 */
function isAllowedHost(hostHeader, { localHosts = [], lan = false, lanHosts = [] } = {}) {
    // Thiếu Host: chỉ HTTP/1.0 / client tự viết — trình duyệt luôn gửi Host nên không phải đường rebinding.
    if (hostHeader === undefined || hostHeader === null || hostHeader === '') return true;
    const h = hostFromHostHeader(hostHeader);
    if (!h) return false;
    if (h === 'localhost' || h === '::1' || LOOPBACK_V4.test(h)) return true;
    for (const x of localHosts) if (hostFromHostHeader(x) === h) return true;
    if (lan) for (const x of lanHosts) if (hostFromHostHeader(x) === h) return true;
    return false;
}

// Đường dẫn bí mật trong appConfig — không bao giờ gửi cho người gọi không tin cậy.
const SECRET_PATHS = [
    ['network', 'token'],
    ['obsBridge', 'password'],
    ['license', 'key'],
    ['license', 'savedKey'],
    ['tiktokSignApiKey'],
    ['shareTokens']   // link /overlay/shared/<uuid>
];

function redactBackupConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return cfg;
    const out = JSON.parse(JSON.stringify(cfg));
    for (const p of SECRET_PATHS) {
        let o = out;
        for (let i = 0; i < p.length - 1 && o && typeof o === 'object'; i++) o = o[p[i]];
        const k = p[p.length - 1];
        if (o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k)) delete o[k];
    }
    return out;
}

// shell.openExternal với file:, ms-*, search-ms:, smb:… có thể mở/chạy thứ trên máy → chỉ web.
function isSafeExternalUrl(url) {
    try {
        const u = new URL(String(url));
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (_) { return false; }
}

module.exports = { hostFromHostHeader, isAllowedHost, redactBackupConfig, isSafeExternalUrl, SECRET_PATHS };
