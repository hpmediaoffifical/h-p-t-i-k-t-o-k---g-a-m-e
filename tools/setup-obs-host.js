// Thêm "127.0.0.1 hpaction.obs" vào hosts file Windows (bật popup UAC).
// Chạy tay khi cần; trong app đóng gói việc này tự chạy ở electron-main.js.
//   node tools/setup-obs-host.js
const h = require('../lib/obs-host');

(async () => {
    if (h.isHostMapped()) {
        console.log(`✅ ${h.OBS_HOST} đã trỏ về 127.0.0.1 rồi — không cần làm gì.`);
        return;
    }
    console.log(`Đang thêm ${h.OBS_HOST} vào ${h.HOSTS_PATH} ...`);
    console.log('👉 Bấm "Yes" ở cửa sổ UAC của Windows.');
    const r = await h.ensureHostMapping();
    if (r.ok) console.log(`✅ Xong. ${h.OBS_HOST} đã trỏ về 127.0.0.1.`);
    else console.log(`❌ Chưa thêm được: ${r.error}`);
})();
