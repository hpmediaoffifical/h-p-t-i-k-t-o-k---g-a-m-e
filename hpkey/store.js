'use strict';
/**
 * HP KEY - Kho lưu KEY + HWID + TOKEN bền vững, zero-dependency. FILE LÕI — không sửa trong app.
 *
 * Một bản ghi JSON { key, hwid, token, vip, allowedIds, features, expiresAt, savedAt, product }
 * được ghi ra NHIỀU nơi độc lập với thư mục app (gỡ cài / hỏng settings.json không mất key):
 *   1) <extraDir>/license.json                      — app đặt bằng setExtraDir(userData)
 *   2) %ProgramData%\HP Media\<PRODUCT>\license.json
 *   3) %AppData%\HP Media\<PRODUCT>\license.json
 *   4) Registry HKCU\Software\HP Media\<PRODUCT>, giá trị "data" = base64(JSON)   (chỉ Windows)
 * Đọc: lấy bản MỚI NHẤT (savedAt) trong các bản có key. Ghi/đọc best-effort, không ném lỗi.
 * Tương thích nguyên vẹn với store.js của HP Talent Show (cùng tên file, cùng khoá registry).
 *
 * Token license (chuỗi đã ký RSA) được mã hoá AES-256-GCM bằng khoá dẫn xuất từ HWID trước khi
 * đặt vào record.token → copy sang máy khác không giải mã được. Cùng định dạng với
 * license.dat của SDK cũ (HP NPC LIVE), nên loadToken() đọc được file cũ và di trú sang record.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const PRODUCT = require('./config').PRODUCT;
const REG_KEY = 'HKCU\\Software\\HP Media\\' + PRODUCT;
const FILE_NAME = 'license.json';
const LEGACY_TOKEN_FILE = 'license.dat';

const opt = { extraDir: '', registry: null, programData: null, appData: null, homeDir: null };

/** App gọi 1 lần lúc khởi động. registry:false / các thư mục dùng cho test. */
function configure(o) { Object.assign(opt, o || {}); }
function setExtraDir(dir) { opt.extraDir = String(dir || ''); }

function useRegistry() { return opt.registry === null ? process.platform === 'win32' : !!opt.registry; }
function homeDir() { return opt.homeDir || os.homedir(); }

function baseDirs() {
  const dirs = [];
  if (opt.extraDir) dirs.push(opt.extraDir);
  const pd = opt.programData || process.env.ProgramData || process.env.PROGRAMDATA || '';
  if (pd) dirs.push(path.join(pd, 'HP Media', PRODUCT));
  const ad = opt.appData || process.env.APPDATA || path.join(homeDir(), 'AppData', 'Roaming');
  if (ad) dirs.push(path.join(ad, 'HP Media', PRODUCT));
  return dirs;
}

function readFileRec(file) {
  try {
    const o = JSON.parse(fs.readFileSync(file, 'utf8'));
    return o && typeof o === 'object' ? o : null;
  } catch (_) { return null; }
}
function writeFileRec(file, rec) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(rec, null, 2), 'utf8');
    fs.renameSync(tmp, file);                       // thay thế nguyên tử
    return true;
  } catch (_) {
    try { fs.writeFileSync(file, JSON.stringify(rec, null, 2), 'utf8'); return true; }
    catch (_e) { return false; }
  }
}

/* --- Registry (Windows). execFileSync → không qua shell, khỏi lo escape. --- */
function regRead() {
  if (!useRegistry()) return null;
  try {
    const out = execFileSync('reg', ['query', REG_KEY, '/v', 'data'],
      { stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).toString();
    const m = out.match(/\bdata\s+REG_SZ\s+(\S+)/i);
    if (!m) return null;
    const o = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
    return o && typeof o === 'object' ? o : null;
  } catch (_) { return null; }
}
function regWrite(rec) {
  if (!useRegistry()) return false;
  try {
    const b64 = Buffer.from(JSON.stringify(rec), 'utf8').toString('base64');
    execFileSync('reg', ['add', REG_KEY, '/v', 'data', '/t', 'REG_SZ', '/d', b64, '/f'],
      { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch (_) { return false; }
}
function regClear() {
  if (!useRegistry()) return;
  try { execFileSync('reg', ['delete', REG_KEY, '/f'], { stdio: 'ignore', timeout: 5000 }); } catch (_) {}
}

/** Đọc mọi nơi, trả bản MỚI NHẤT (ưu tiên bản có key). */
function readRecord() {
  const recs = [];
  for (const d of baseDirs()) {
    const r = readFileRec(path.join(d, FILE_NAME));
    if (r) recs.push(r);
  }
  const r = regRead();
  if (r) recs.push(r);
  if (!recs.length) return null;
  const withKey = recs.filter((x) => x && x.key);
  const pool = withKey.length ? withKey : recs;
  pool.sort((a, b) => (Number(b.savedAt) || 0) - (Number(a.savedAt) || 0));
  return pool[0];
}

/** Ghi ra MỌI nơi, gộp với bản cũ (chỉ cập nhật hwid thì vẫn giữ key). Trả số nơi ghi được. */
function writeRecord(patch) {
  const cur = readRecord() || {};
  const rec = Object.assign({}, cur, patch || {}, { savedAt: Date.now(), product: PRODUCT });
  for (const k of Object.keys(rec)) if (rec[k] === undefined) delete rec[k];
  let n = 0;
  for (const d of baseDirs()) { if (writeFileRec(path.join(d, FILE_NAME), rec)) n++; }
  if (regWrite(rec)) n++;
  return n;
}

function clearRecord() {
  for (const d of baseDirs()) { try { fs.unlinkSync(path.join(d, FILE_NAME)); } catch (_) {} }
  regClear();
  clearLegacyTokenFiles();
}

function readKey() { const r = readRecord(); return (r && r.key) || ''; }
function readHwid() { const r = readRecord(); return (r && r.hwid) || ''; }
function writeHwid(hwid) { return writeRecord({ hwid: String(hwid || '') }); }

/** Lưu thông tin bản quyền sau khi kích hoạt / xác thực thành công (shape Talent Show + features). */
function saveLicense(license) {
  const l = license || {};
  if (!l.key) return 0;
  return writeRecord({
    key: l.key,
    vip: l.vip || l.role || '',
    expiresAt: l.expiresAt || '',
    allowedIds: Array.isArray(l.allowedIds) ? l.allowedIds : [],
    features: Array.isArray(l.features) ? l.features : null,
    activatedAt: l.activatedAt || Date.now(),
    checkedAt: Date.now(),
  });
}

/* ---------------- Token mã hoá (định dạng license.dat của SDK cũ) ---------------- */
function keyFromHwid(hwid) {
  return crypto.createHash('sha256').update('hpkey:' + hwid).digest();
}
function _encrypt(token, hwid) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyFromHwid(hwid), iv);
  const enc = Buffer.concat([c.update(Buffer.from(token, 'utf8')), c.final()]);
  const tag = c.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}
function _decrypt(b64, hwid) {
  try {
    const buf = Buffer.from(String(b64 || ''), 'base64');
    const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), enc = buf.subarray(28);
    const d = crypto.createDecipheriv('aes-256-gcm', keyFromHwid(hwid), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch (_) { return null; }
}

function legacyTokenFiles() {
  const files = [];
  if (opt.extraDir) files.push(path.join(opt.extraDir, LEGACY_TOKEN_FILE));
  files.push(path.join(homeDir(), '.hpkey', LEGACY_TOKEN_FILE));
  return files;
}
function clearLegacyTokenFiles() {
  for (const f of legacyTokenFiles()) { try { fs.unlinkSync(f); } catch (_) {} }
}

function saveToken(hwid, token) {
  return writeRecord({ token: _encrypt(String(token), hwid) });
}

/** Token đã lưu cho HWID này, hoặc null. Tự di trú từ license.dat của SDK cũ. */
function loadToken(hwid) {
  const r = readRecord();
  if (r && r.token) {
    const t = _decrypt(r.token, hwid);
    if (t) return t;
  }
  for (const f of legacyTokenFiles()) {
    let raw = null;
    try { raw = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    const t = _decrypt(raw, hwid);
    if (t) { saveToken(hwid, t); return t; }
  }
  return null;
}

function clearToken() {
  const cur = readRecord();
  if (cur && cur.token) { delete cur.token; writeRecord(Object.assign({}, cur, { token: undefined })); }
  clearLegacyTokenFiles();
}

module.exports = {
  configure, setExtraDir,
  readRecord, writeRecord, clearRecord,
  readKey, readHwid, writeHwid, saveLicense,
  saveToken, loadToken, clearToken,
  _encrypt, _decrypt,
};
