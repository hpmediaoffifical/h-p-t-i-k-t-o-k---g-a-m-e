'use strict';
/**
 * HP KEY - SDK client v2 cho app Electron (zero-dependency). FILE LÕI — không sửa trong app.
 *
 *   const hpkey = require('./hpkey');
 *   hpkey.configure({ storeDir: app.getPath('userData') });
 *   const r = await hpkey.ensureLicense();
 *   if (!r.ok && r.error === 'need_activation') { ...form nhập key → hpkey.activate(key)... }
 *   if (r.ok) console.log(r.license.features);   // null = toàn bộ tính năng
 *   hpkey.startWatch({ onRevoked: (code, msg) => { ...đóng app... } });
 *
 * Mô hình bảo mật: token được server KÝ RSA-SHA256, bind product + HWID. App chỉ tin token
 * verify được bằng public-key.js nhúng sẵn → server giả / sửa hosts trả "ok" cũng vô dụng.
 * Token lưu bằng store.js (mã hoá theo HWID, ghi nhiều nơi) nên chạy offline được tới hạn `off`.
 *
 * App cũ dùng shape khác (validate.js) thì dùng adapter trong adapters/, không sửa file này.
 */
const os = require('os');
const crypto = require('crypto');

const cfg = require('./config');
const VERSION = require('./version');
const core = require('./core');
const guard = require('./guard');
const store = require('./store');
const { getHWID } = require('./hwid');

/* ---------------- Cấu hình ---------------- */
/** App gọi 1 lần lúc khởi động. { storeDir, registry, programData, appData, homeDir } */
function configure(opts) {
  const o = Object.assign({}, opts || {});
  if (o.storeDir !== undefined) { o.extraDir = o.storeDir; delete o.storeDir; }
  store.configure(o);
}
function useDir(dir) { if (dir) store.setExtraDir(dir); }

/* ---------------- Lưu kết quả ---------------- */
function fmtDmy(unix) {
  if (!unix) return '';
  const d = new Date(unix * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function persist(hwid, r) {
  try { store.saveToken(hwid, r.token); } catch (_) {}
  try {
    store.saveLicense({
      key: r.license.key, vip: r.license.role, allowedIds: r.license.allowedIds, features: r.license.features,
      gameState: r.license.gameState,
      expiresAt: fmtDmy(r.license.expiresAt), expiresAtUnix: r.license.expiresAt,
    });
  } catch (_) {}
}
function dropToken() { try { store.clearToken(); } catch (_) {} }

/* ---------------- Trạng thái cục bộ ---------------- */
function readLocal(hwid) {
  const token = store.loadToken(hwid);
  const v = token ? core.verifyToken(token, hwid) : null;
  return v ? { token, v, license: core.toLicense(v.payload) } : null;
}

/** Trạng thái từ token đã lưu, KHÔNG gọi mạng. */
function getStatus(dir) {
  useDir(dir);
  const hwid = getHWID();
  const loc = readLocal(hwid);
  if (!loc) return { licensed: false, hwid };
  return Object.assign({}, loc.license, {
    licensed: !loc.v.expired,
    expired: loc.v.expired,
    offlineOk: loc.v.offlineOk,
    expireAt: loc.license.expiresAt ? new Date(loc.license.expiresAt * 1000).toISOString() : null,
    hwid,
  });
}

/* ---------------- Kích hoạt / xác thực ---------------- */
async function activate(key, dir) {
  useDir(dir);
  const r = await core.activate(key);
  if (!r.ok) return r;
  persist(getHWID(), r);
  return { ok: true, license: r.license };
}

/** Kiểm 1 lần với server (action verify). Không có key thì lấy key đã lưu. */
async function verify(key, dir) {
  useDir(dir);
  const k = key || store.readKey() || (getStatus().key || '');
  const r = await core.verifyKey(k);
  if (r.ok) persist(getHWID(), r);
  return r;
}

/**
 * Gọi lúc app khởi động. Trả về:
 *  { ok:true, license }                       → được phép chạy (license.features: null = toàn bộ)
 *  { ok:false, error:'need_activation' }      → chưa có license, mở form nhập key
 *  { ok:false, error:'expired' | 'offline_grace_expired' | <mã lỗi server> }
 *
 * Chỉ XOÁ token khi server trả mã CỨNG (core.HARD_CODES). Lỗi tạm thời / body rỗng / đầy số máy
 * → GIỮ token, chạy tiếp bằng hạn offline; không ép kích hoạt lại (mỗi lần kích hoạt lại là
 * thêm một bản ghi máy trên server, dễ "đốt" số máy của key).
 */
async function ensureLicense(opts) {
  const o = opts || {};
  useDir(o.storeDir);
  const hwid = getHWID();
  const loc = readLocal(hwid);

  if (loc && !loc.v.expired) {
    const refresh = async () => {
      const rr = await core.heartbeat(loc.license.key);
      if (rr.ok) { persist(hwid, rr); return { ok: true, license: rr.license }; }
      const hard = !rr._offline && core.HARD_CODES.has(rr.error);
      if (hard) { dropToken(); return { ok: false, error: rr.error, hard: true }; }
      return { ok: false, error: rr.error, offline: !!rr._offline };
    };
    if (loc.v.offlineOk) {
      const ageH = (Date.now() / 1000 - (loc.license.issuedAt || 0)) / 3600;
      if (ageH >= cfg.HEARTBEAT_HOURS) {
        const rr = await refresh();
        if (rr.ok || !rr.hard) return { ok: true, license: rr.ok ? rr.license : loc.license, stale: !rr.ok };
        return { ok: false, error: rr.error };
      }
      return { ok: true, license: loc.license };
    }
    // Hết hạn chạy offline → bắt buộc xác thực online
    const rr = await refresh();
    if (rr.ok) return { ok: true, license: rr.license };
    if (rr.offline) return { ok: false, error: 'offline_grace_expired' };
    return { ok: false, error: rr.error };
  }
  if (loc && loc.v.expired) return { ok: false, error: 'expired' };
  if (o.key) return activate(o.key, o.storeDir);
  return { ok: false, error: 'need_activation' };
}

/* ---------------- Watcher ---------------- */
/**
 * guard.startWatch với mặc định: onOk lưu token mới (features/hạn mới có hiệu lực ngay),
 * onRevoked xoá token rồi gọi onRevoked của app. getKey mặc định = key đã lưu.
 */
function startWatch(opts) {
  const o = Object.assign({}, opts || {});
  const userOk = o.onOk; const userRevoked = o.onRevoked;
  if (!o.getKey) o.getKey = () => store.readKey() || (getStatus().key || '');
  o.onOk = (payload, license, raw) => {
    if (raw && raw.token) persist(getHWID(), raw);
    if (typeof userOk === 'function') userOk(payload, license, raw);
  };
  o.onRevoked = (code, msg) => {
    dropToken();
    if (typeof userRevoked === 'function') userRevoked(code, msg);
  };
  return guard.startWatch(o);
}

/* ---------------- Gỡ kích hoạt ---------------- */
async function deactivate(dir) {
  useDir(dir);
  const hwid = getHWID();
  const s = getStatus(dir);
  if (s.key) {
    const r = await core.apiCall('deactivate', { key: s.key, hwid, device: os.hostname() });
    if (!r.net) return { ok: false, error: 'no_network' };
    if (!r.body || r.body.ok !== true) return { ok: false, error: (r.body && r.body.error) || 'deactivate_failed' };
  }
  dropToken();
  return { ok: true };
}

/* ---------------- Dữ liệu có kiểm soát license (action 'data') ---------------- */
function verifyDataProof(proof, slug, hwid, bodyStr) {
  if (!proof || proof.indexOf('.') < 0) return false;
  const [msg, sig] = proof.split('.');
  const b64urlToBuf = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  let okSig;
  try { okSig = crypto.verify('sha256', Buffer.from(msg), core._publicKeyPem(), b64urlToBuf(sig)); }
  catch (_) { return false; }
  if (!okSig) return false;
  let p;
  try { p = JSON.parse(b64urlToBuf(msg).toString('utf8')); } catch (_) { return false; }
  if (p.t !== 'data' || p.p !== cfg.PRODUCT || p.slug !== slug || p.h !== hwid) return false;
  return p.sha === crypto.createHash('sha256').update(bodyStr).digest('hex');
}
/** Chỉ máy đã kích hoạt mới nhận; phản hồi có chữ ký RSA + bind HWID + hash nội dung. */
async function fetchData(slug, dir) {
  useDir(dir);
  const hwid = getHWID();
  const s = getStatus(dir);
  if (!s.licensed || !s.key) return { ok: false, error: 'not_licensed' };
  const r = await core.apiCall('data', { key: s.key, hwid, slug: String(slug || '') });
  if (!r.net) return { ok: false, error: 'no_network' };
  if (!r.body || r.body.ok !== true || typeof r.body.body !== 'string' || !r.body.proof) {
    return { ok: false, error: (r.body && r.body.error) || 'data_failed' };
  }
  if (!verifyDataProof(r.body.proof, String(slug || ''), hwid, r.body.body)) return { ok: false, error: 'bad_proof' };
  return { ok: true, format: r.body.format || 'csv', body: r.body.body, ts: r.body.ts };
}

/* ---------------- 🛒 Bán game trong app (shop.php — docs/api-contract.md §7, server/lib/shop.php) ---------------- */
/**
 * Gọi shop.php bằng key + HWID của token đã lưu. → thân trả về của server ({ok:true, …}) | {ok:false, error, message, status?}.
 * Mọi lỗi ở đây là MỀM: KHÔNG bao giờ xoá token / đóng app.
 */
async function shopCall(action, extra, dir) {
  useDir(dir);
  if (!core.configured()) return { ok: false, error: 'not_configured', message: core.errVi('not_configured') };
  const s = getStatus(dir);
  if (!s.key) return { ok: false, error: 'empty_key', message: core.errVi('empty_key') };
  const r = await core.apiCall(action, Object.assign({ key: s.key, hwid: s.hwid }, extra || {}), { url: core.shopUrl() });
  if (!r.net) return { ok: false, error: 'no_network', message: core.errVi('no_network') };
  if (!r.body || r.body.ok !== true) {
    const error = (r.body && r.body.error) || (r.status >= 500 ? 'server_error' : 'shop_failed');
    return { ok: false, error, message: core.errVi(error), status: r.status };
  }
  return r.body;
}
/** Mục KEY này mua được: {ok, on, items:[{id,name,price}], owned:[id], open:[order]}. */
const shopItems = (dir) => shopCall('shop_items', {}, dir);
/** Tạo (hoặc dùng lại) đơn mua mục `feature`: {ok, order, pay}. */
const orderCreate = (feature, dir) => shopCall('order_create', { feature: String(feature || '') }, dir);
/** Trạng thái đơn: {ok, order, pay?}. opts.check = đối soát SePay ngay (nút "Tôi đã chuyển khoản · Kiểm tra"). */
const orderStatus = (code, opts, dir) => shopCall('order_status', Object.assign({ code: String(code || '') }, opts && opts.check ? { check: 1 } : {}), dir);

module.exports = {
  VERSION, configure,
  ensureLicense, activate, verify, getStatus, startWatch, deactivate, fetchData,
  shopItems, orderCreate, orderStatus,
  getHWID, errVi: core.errVi, HARD_CODES: core.HARD_CODES, normalizeKey: core.normalizeKey,
  fmtDmy, _persist: persist,
};
