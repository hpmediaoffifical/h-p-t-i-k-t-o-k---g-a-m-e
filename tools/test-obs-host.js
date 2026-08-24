// Kiểm tra nhanh lib/obs-host.js đọc hosts file có đúng không. Chỉ ĐỌC, không sửa gì.
//   node tools/test-obs-host.js
const h = require('../lib/obs-host');

console.log('HOSTS_PATH :', h.HOSTS_PATH);
console.log('OBS_HOST   :', h.OBS_HOST);
console.log('');
const cases = [
    [h.OBS_HOST, null],
    ['hpnpc.obs', true],          // do phần mềm overlay khác thêm sẵn
    ['hpstudio.obs', true],
    ['khong-co-that.obs', false]
];
for (const [host, expected] of cases) {
    const got = h.isHostMapped(host);
    const verdict = expected === null ? '' : (got === expected ? '  OK' : '  ❌ MONG ĐỢI ' + expected);
    console.log(`  ${host.padEnd(20)} -> ${got}${verdict}`);
}
