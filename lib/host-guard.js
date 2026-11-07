// 🔐 Chống DNS rebinding: trang độc đổi DNS tên miền của nó về 127.0.0.1 rồi ĐỌC API (key bản quyền, mật khẩu OBS…)
// bằng GET — trình duyệt coi là cùng nguồn nên Origin không giúp được. Host của request đó vẫn là tên miền kẻ tấn công
// → chỉ nhận Host là tên nội bộ, địa chỉ IP dạng số (OBS máy khác trong LAN gõ IP) hoặc tên máy tính.
'use strict';
const net = require('net');

function hostAllowed(hostHeader, { localHosts, machineNames = [] } = {}) {
    let raw = String(hostHeader || '').trim().toLowerCase();
    if (!raw) return false;
    let name;
    if (raw.startsWith('[')) name = raw.slice(1, raw.indexOf(']') > 0 ? raw.indexOf(']') : undefined);   // [v6]:port
    else name = raw.replace(/:\d+$/, '');
    if (!name) return false;
    if (localHosts && (localHosts.has(name) || localHosts.has('[' + name + ']'))) return true;
    if (net.isIP(name)) return true;
    const names = machineNames.map(n => String(n).toLowerCase()).filter(Boolean);
    return names.includes(name) || names.some(n => name === n + '.local');
}

module.exports = { hostAllowed };
