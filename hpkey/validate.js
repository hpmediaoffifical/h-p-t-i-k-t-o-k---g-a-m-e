'use strict';
/**
 * HP KEY adapter cho HP Action LIVE (product tiktok-game). Được sync-client copy thành
 * <app>/hpkey/validate.js — GIỮ NGUYÊN interface server.js đang gọi:
 *   validateLicenseKey(rawKey) → { ok, key, role, allowedIds, features, gameState, vip, expiry, expiryISO, status, note }
 *   verifyKey(rawKey)          → { ok, payload, license } | { ok:false, error, _offline }
 *   startWatch(opts)           → hàm stop() (có thêm .state)
 *   getHWID()
 *
 * Khác bản cũ:
 *   - Có token hợp lệ cho đúng key này → gọi `verify` thay vì `activate` mỗi lần mở app.
 *   - Server lỗi mơ hồ (502/HTML/rỗng) mà token cục bộ còn hạn → vẫn ok (kèm _stale:true),
 *     không bắt người dùng nhập lại key; chỉ lỗi CỨNG mới báo thất bại.
 *   - Watcher đi qua guard (3 lần cứng liên tiếp mới thu hồi), lưu token mới mỗi lần ok.
 */
const path = require('path');
// Trong repo HP KEY file nằm ở adapters/, trong app nằm cạnh lõi → nạp lõi tương đối.
const L = (m) => require(path.join(__dirname, path.basename(__dirname) === 'adapters' ? '..' : '.', m + path.extname(__filename)));
const core = L('core');
const guard = L('guard');
const index = L('index');
const { getHWID } = L('hwid');

function okShape(lic, extra) {
  return Object.assign({
    ok: true,
    key: lic.key,                          // CREATOR: chính là TikTok ID
    role: lic.role || 'ADMIN',             // ADMIN | CREATOR | VIP
    allowedIds: lic.allowedIds || [],      // VIP: chỉ kết nối các ID này (rỗng = không giới hạn)
    features: lic.features === undefined ? null : lic.features, // null = toàn bộ tính năng
    gameState: lic.gameState || {},        // SDK 2.1: { id: 'off'|'hidden'|'admin' } — mục tắt theo game (gs)
    vip: lic.role || '',
    expiry: index.fmtDmy(lic.expiresAt),   // '' nếu vĩnh viễn
    expiryISO: lic.expiresAt ? new Date(lic.expiresAt * 1000).toISOString() : null,
    status: 'Đang sử dụng',
    note: '',
  }, extra || {});
}
function failShape(r) {
  const kind = guard.classify(r).kind;
  // server.js chỉ hiểu _offline (ân hạn 24 h khi đã từng kích hoạt), không hiểu _soft. validate.js cũ
  // coi 5xx/429/body không JSON là mất mạng → giữ đúng ngữ nghĩa: mọi lỗi MỀM đều là _offline.
  const soft = kind === 'soft';
  return { ok: false, error: core.errVi(r.error), _code: r.error, _offline: !!r._offline || soft, _soft: soft };
}

async function validateLicenseKey(rawKey) {
  const key = core.normalizeKey(rawKey);
  if (!key) return failShape({ ok: false, error: 'empty_key' });
  const hwid = getHWID();
  const local = index.getStatus();
  const haveLocal = local.licensed && local.key === key;

  const r = haveLocal ? await core.verifyKey(key) : await core.activate(key);
  if (r.ok) { index._persist(hwid, r); return okShape(r.license); }

  // Lỗi mơ hồ nhưng token cục bộ còn hạn chạy offline → cho chạy, đánh dấu stale.
  if (haveLocal && local.offlineOk && guard.classify(r).kind === 'soft') {
    return okShape(local, { _stale: true, _code: r.error });
  }
  return failShape(r);
}

/** Check 1 lần (action 'verify'). Shape cũ: { ok, payload } */
async function verifyKey(rawKey) {
  const r = await core.verifyKey(rawKey);
  if (r.ok) index._persist(getHWID(), r);
  return r;
}

/** Watcher qua guard. Trả về hàm stop() để tương thích chữ ký cũ; stop.state = trạng thái. */
function startWatch(opts) {
  const w = index.startWatch(opts || {});
  const stop = function stop() { w.stop(); };
  stop.state = w.state;
  stop.stop = stop;
  return stop;
}

module.exports = { validateLicenseKey, verifyKey, startWatch, getHWID };
