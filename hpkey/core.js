'use strict';
/**
 * HP KEY - Lõi chung, zero-dependency. FILE LÕI — không sửa trong app.
 *   - ký HMAC-SHA256 request (canonical JSON khớp PHP json_encode UNESCAPED_UNICODE|UNESCAPED_SLASHES)
 *   - verify token RSA-SHA256 bằng public key nhúng sẵn, bind product + HWID
 *   - đổi payload token thành object `license` CHUẨN dùng chung cho mọi app:
 *       { key, role, plan, allowedIds, features, expiresAt, offlineUntil, issuedAt, raw }
 *     features = null nghĩa là dùng TOÀN BỘ tính năng (key cũ không có trường ft).
 *   - bảng mã lỗi cứng (thu hồi thật) + thông điệp tiếng Việt
 * Mọi I/O mạng đi qua _setTransport để test không cần server.
 */
const https = require('https');
const { URL } = require('url');
const os = require('os');
const crypto = require('crypto');

const cfg = require('./config');
const { getHWID } = require('./hwid');

let PUBLIC_KEY_B64 = '';
try { PUBLIC_KEY_B64 = require('./public-key'); } catch (_) {}
let publicKeyPem = null;

const b64urlToBuf = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/* ---------------- Mã lỗi ---------------- */
/** Server TỪ CHỐI CÓ CHỦ ĐÍCH → xoá token cục bộ, đóng app (sau đủ số lần ở guard). */
const HARD_CODES = new Set([
  'key_blocked', 'key_invalid', 'invalid_key', 'key_not_found',
  'key_expired', 'expired', 'device_revoked', 'not_activated', 'product_mismatch',
]);

const ERR_VI = {
  empty_key: 'Vui lòng nhập KEY bản quyền.',
  not_configured: 'App chưa cấu hình HP KEY (thiếu HMAC secret / public key) — liên hệ HP Media.',
  no_network: 'Không kết nối được hệ thống bản quyền — kiểm tra mạng và thử lại.',
  invalid_key: 'KEY không tồn tại trong hệ thống.',
  key_not_found: 'KEY không tồn tại trong hệ thống.',
  key_invalid: 'KEY không còn hợp lệ (đã bị khóa hoặc xóa) — liên hệ HP Media.',
  key_blocked: 'KEY đã bị khóa — liên hệ HP Media.',
  key_expired: 'KEY đã hết hạn.',
  expired: 'KEY đã hết hạn.',
  device_limit_reached: 'KEY đã đạt giới hạn số máy — liên hệ HP Media để thêm/đổi máy.',
  device_revoked: 'Thiết bị này đã bị thu hồi quyền — liên hệ HP Media.',
  not_activated: 'Máy này không còn chỗ trong KEY (đã bị thu hồi hoặc máy khác đang dùng) — liên hệ HP Media.',
  product_mismatch: 'KEY này thuộc sản phẩm khác — liên hệ HP Media.',
  bad_signature: 'Cấu hình bản quyền sai (HMAC secret) — liên hệ HP Media.',
  unknown_product: 'Game chưa được cấu hình trên hệ thống bản quyền — liên hệ HP Media.',
  request_expired: 'Đồng hồ máy sai lệch — chỉnh lại giờ hệ thống rồi thử lại.',
  rate_limited: 'Hệ thống đang tạm chặn kích hoạt từ địa chỉ mạng này — thử lại sau 1 giờ.',
  bad_token: 'Phản hồi kích hoạt không hợp lệ (sai chữ ký) — liên hệ HP Media.',
  activate_failed: 'KEY không hợp lệ.',
  revoked: 'KEY đã bị thu hồi hoặc không còn hợp lệ trên thiết bị này.',
  // Lỗi giao thức (app gửi sai) / server ký lỗi — mã MỀM, không đóng app. Xem docs/api-contract.md.
  bad_request: 'Yêu cầu bản quyền thiếu thông tin — cập nhật app hoặc liên hệ HP Media.',
  bad_params: 'Yêu cầu kích hoạt thiếu KEY hoặc mã máy — cập nhật app hoặc liên hệ HP Media.',
  method_not_allowed: 'App gửi lệnh bản quyền không hợp lệ — cập nhật app hoặc liên hệ HP Media.',
  no_action: 'App gửi lệnh bản quyền không hợp lệ — cập nhật app hoặc liên hệ HP Media.',
  unknown_action: 'App gửi lệnh bản quyền không hợp lệ — cập nhật app hoặc liên hệ HP Media.',
  sign_failed: 'Hệ thống bản quyền đang lỗi (không ký được license) — thử lại sau.',
};
function errVi(code) { return ERR_VI[code] || ('Lỗi kích hoạt: ' + code); }

/* ---------------- Chuẩn hoá key ---------------- */
function normalizeKey(rawKey) {
  return String(rawKey || '')
    .normalize('NFKC')
    .replace(/[\s​-‍﻿]/g, '')
    .trim();
}

/* ---------------- Ký request ---------------- */
function canonical(body) {
  const o = {};
  Object.keys(body).filter((k) => k !== 'sig').sort().forEach((k) => { o[k] = body[k]; });
  return JSON.stringify(o);
}
function signBody(body) {
  return crypto.createHmac('sha256', cfg.HMAC_SECRET).update(canonical(body)).digest('hex');
}

/* ---------------- Transport ---------------- */
function defaultTransport(data) {
  const u = new URL(cfg.API_URL);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        timeout: 12000,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => resolve({ status: res.statusCode, raw }));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}
let transport = defaultTransport;
function _setTransport(fn) { transport = fn || defaultTransport; }

/** → { net:false } | { net:true, status, body } (body = {} nếu không phải JSON) */
async function apiCall(action, extra) {
  const body = Object.assign({ action, p: cfg.PRODUCT, ts: Math.floor(Date.now() / 1000) }, extra || {});
  body.sig = signBody(body);
  let r;
  try { r = await transport(JSON.stringify(body)); }
  catch (_) { return { net: false }; }
  let parsed = {};
  try { parsed = JSON.parse(r.raw); } catch (_) { parsed = {}; }
  if (!parsed || typeof parsed !== 'object') parsed = {};
  return { net: true, status: r.status, body: parsed };
}

/* ---------------- Token ---------------- */
function rsaPubKey() {
  if (publicKeyPem) return publicKeyPem;
  return Buffer.from(PUBLIC_KEY_B64, 'base64').toString('utf8');
}
function _setPublicKeyPem(pem) { publicKeyPem = pem || null; }

/** → { payload, expired, offlineOk } | null (sai chữ ký / sai product / sai HWID / v khác 1) */
function verifyToken(token, hwid) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const [msg, sig] = token.split('.');
  let okSig;
  try { okSig = crypto.verify('sha256', Buffer.from(msg), rsaPubKey(), b64urlToBuf(sig)); }
  catch (_) { return null; }
  if (!okSig) return null;
  let p;
  try { p = JSON.parse(b64urlToBuf(msg).toString('utf8')); } catch (_) { return null; }
  if (!p || p.v !== 1 || p.p !== cfg.PRODUCT || p.h !== hwid) return null;
  const now = Math.floor(Date.now() / 1000);
  return {
    payload: p,
    expired: p.exp !== 0 && now > p.exp,
    offlineOk: typeof p.off === 'number' ? now <= p.off : true,
  };
}

/** Payload token → license chuẩn. */
function toLicense(p) {
  return {
    key: p.k,
    role: p.r || 'ADMIN',
    plan: p.pl || '',
    allowedIds: Array.isArray(p.ids) ? p.ids.map(String) : [],
    features: Array.isArray(p.ft) ? p.ft.map(String) : null,
    expiresAt: Number(p.exp) || 0,
    offlineUntil: Number(p.off) || 0,
    issuedAt: Number(p.iat) || 0,
    raw: p,
  };
}

function configured() {
  return !!cfg.HMAC_SECRET && cfg.HMAC_SECRET.indexOf('DAN_') !== 0
    && (!!publicKeyPem || (!!PUBLIC_KEY_B64 && String(PUBLIC_KEY_B64).indexOf('DAN_') !== 0));
}

/** Gọi activate/verify/heartbeat và kiểm token. → {ok, payload, license, token} | {ok:false, error, _offline?} */
async function request(action, rawKey, fallbackError) {
  const key = normalizeKey(rawKey);
  if (!key) return { ok: false, error: 'empty_key' };
  if (!configured()) return { ok: false, error: 'not_configured' };
  const hwid = getHWID();
  const r = await apiCall(action, { key, hwid, device: os.hostname() });
  if (!r.net) return { ok: false, error: 'no_network', _offline: true };
  if (!r.body || r.body.ok !== true || !r.body.token) {
    return { ok: false, error: (r.body && r.body.error) || fallbackError };
  }
  const v = verifyToken(r.body.token, hwid);
  if (!v) return { ok: false, error: 'bad_token' };
  if (v.expired) return { ok: false, error: 'key_expired' };
  return { ok: true, payload: v.payload, license: toLicense(v.payload), token: r.body.token };
}
const activate = (rawKey) => request('activate', rawKey, 'activate_failed');
const verifyKey = (rawKey) => request('verify', rawKey, 'revoked');
const heartbeat = (rawKey) => request('heartbeat', rawKey, 'revoked');

module.exports = {
  HARD_CODES, ERR_VI, errVi,
  normalizeKey, canonical, signBody, apiCall,
  verifyToken, toLicense, configured,
  activate, verifyKey, heartbeat,
  _setTransport, _setPublicKeyPem, _publicKeyPem: rsaPubKey,
};
