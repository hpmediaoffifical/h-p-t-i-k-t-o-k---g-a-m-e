'use strict';
/**
 * HP KEY - Cau hinh client (HP Action LIVE / tiktok-game).
 * HMAC secret KHONG hardcode o day (tranh lo khi push public repo).
 * No nam o hpkey/secret.local.js (da .gitignore) - tao file do tren may build.
 */
let local = {};
let localFound = false;
try { local = require('./secret.local'); localFound = true; } catch (_) {}

const HMAC_SECRET = local.HMAC_SECRET || process.env.HPKEY_HMAC || '';

// Warn rõ ràng khi dev chạy `node server.js` thiếu secret — tránh user mất time đoán
// "Hệ thống bản quyền chưa cấu hình" là do code mới hay regression. Xem CLAUDE.md / hpkey/README.md
// cho cách fix (copy hpkey/secret.local.js từ project gốc vào worktree).
if (!HMAC_SECRET) {
  console.warn('');
  console.warn('═══════════════════════════════════════════════════════════════');
  console.warn('[hpkey] ⚠  HMAC_SECRET TRỐNG — license activation sẽ FAIL.');
  if (!localFound) console.warn('[hpkey]    File hpkey/secret.local.js KHÔNG TỒN TẠI.');
  console.warn('[hpkey]    Nếu chạy từ git worktree: copy file secret từ project gốc.');
  console.warn('[hpkey]    Xem CLAUDE.md hoặc hpkey/README.md cho lệnh fix.');
  console.warn('═══════════════════════════════════════════════════════════════');
  console.warn('');
}

module.exports = {
  API_URL: 'https://hpvn.media/hpkey/api.php',
  PRODUCT: 'tiktok-game',
  HMAC_SECRET,
  HEARTBEAT_HOURS: 24,
  // Chu ky check key real-time (giay). Cam key tren admin -> user bi dong app trong <= so nay.
  RECHECK_SECONDS: 60,
  // SDK v2: app da co nguoi dung voi hwid.js cu (UUID|CPU|BaseBoard|MAC|hostname) -> GIU 'legacy'.
  // Doi sang 'stable' = doi HWID cua MOI may khach (key 1 may bi "dat gioi han so may").
  HWID_ALGO: 'legacy',
};
