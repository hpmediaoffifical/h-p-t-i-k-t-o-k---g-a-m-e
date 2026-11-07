// 🔐 Chống DNS rebinding: header Host phải là tên nội bộ / địa chỉ IP / tên máy — tên miền lạ bị chặn (lib/host-guard.js)
const test = require('node:test');
const assert = require('node:assert');
const { hostAllowed } = require('../lib/host-guard.js');

const opts = { localHosts: new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'hpaction.obs']), machineNames: ['may-hp'] };

test('cho qua: localhost, hpaction.obs, IP v4/v6 (OBS máy khác trong LAN), tên máy; có / không cổng', () => {
    for (const h of ['localhost:3000', 'LOCALHOST', '127.0.0.1:3000', '[::1]:3000', 'hpaction.obs:3000', '192.168.1.19:3000', '10.0.0.5', '[fe80::1]:3000', 'may-hp:3000', 'MAY-HP.local:3000'])
        assert.strictEqual(hostAllowed(h, opts), true, h);
});

test('chặn: tên miền lạ (trang độc đổi DNS về máy này), Host rỗng', () => {
    for (const h of ['evil.example.com:3000', 'localhost.evil.com', 'hpaction.obs.evil.net', '', undefined])
        assert.strictEqual(hostAllowed(h, opts), false, String(h));
});
