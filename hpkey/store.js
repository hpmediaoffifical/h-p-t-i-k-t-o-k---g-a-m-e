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
 * Tự chữa: lần đọc đầu của mỗi tiến trình ghi bù bản mới nhất vào nơi đang thiếu / giữ bản cũ hơn. Ca thật: app
 * được mở từ bên trong một app MSIX (vd. bấm link bộ cài trong Claude desktop → bộ cài mở app) thì Windows ảo hoá
 * mọi lần ghi HKCU vào registry riêng của gói đó — app tự đọc lại vẫn thấy, nhưng lần mở bình thường thì registry
 * thật trống; khi đó bản registry được ghi bù ở lần mở sau.
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
let execReg = execFileSync;   // test thay bằng _setRegExec(fake)
let healed = false;           // đã tự chữa (hoặc vừa ghi ra mọi nơi) trong tiến trình này
let warned = false;           // lỗi registry chỉ console.warn 1 lần

/** App gọi 1 lần lúc khởi động. registry:false / các thư mục dùng cho test. */
function configure(o) { Object.assign(opt, o || {}); healed = false; }
function setExtraDir(dir) {
  const d = String(dir || '');
  if (d !== opt.extraDir) healed = false;
  opt.extraDir = d;
}

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

/* --- Registry (Windows). execFileSync → không qua shell, khỏi lo escape. Gọi thẳng %SystemRoot%\System32\reg.exe
   (không dò PATH / thư mục hiện hành), ẩn cửa sổ console. --- */
function regExe() {
  return path.join(process.env.SystemRoot || process.env.windir || 'C:\\Windows', 'System32', 'reg.exe');
}
function warnOnce(what, e) {
  if (warned) return;
  warned = true;
  const why = e ? [e.code, e.status != null ? 'exit ' + e.status : '', e.signal, String(e.stderr || '').trim()]
    .filter(Boolean).join(' ') || String(e.message || e) : '';
  try { console.warn('[hpkey] store: ' + what + ' lỗi' + (why ? ' (' + why + ')' : '')); } catch (_) {}
}
/** Chạy reg.exe; thử lại 1 lần khi không chạy được / hết giờ, hoặc khi `add` lỗi.
 *  query/delete trả exit 1 = không có khoá → bình thường, không thử lại. */
function runReg(args, capture) {
  const o = { stdio: ['ignore', capture ? 'pipe' : 'ignore', 'pipe'], timeout: 5000, windowsHide: true };
  let err;
  for (let i = 0; i < 2; i++) {
    try { return String(execReg(regExe(), args, o) || ''); } catch (e) {
      err = e;
      if (args[0] !== 'add' && e && e.status != null) break;
    }
  }
  throw err;
}
function regRead() {
  if (!useRegistry()) return null;
  try {
    const out = runReg(['query', REG_KEY, '/v', 'data'], true);
    const m = out.match(/\bdata\s+REG_SZ\s+(\S+)/i);
    if (!m) return null;
    const o = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
    return o && typeof o === 'object' ? o : null;
  } catch (e) {
    if (!e || e.status !== 1) warnOnce('đọc registry ' + REG_KEY, e);
    return null;
  }
}
function regWrite(rec) {
  if (!useRegistry()) return false;
  try {
    const b64 = Buffer.from(JSON.stringify(rec), 'utf8').toString('base64');
    runReg(['add', REG_KEY, '/v', 'data', '/t', 'REG_SZ', '/d', b64, '/f']);
    return true;
  } catch (e) { warnOnce('ghi registry ' + REG_KEY, e); return false; }
}
function regClear() {
  if (!useRegistry()) return;
  try { runReg(['delete', REG_KEY, '/f']); } catch (_) {}
}

/** Mọi nơi lưu, theo thứ tự: các file license.json rồi registry. */
function places() {
  const list = baseDirs().map((d) => {
    const f = path.join(d, FILE_NAME);
    return { read: () => readFileRec(f), write: (rec) => writeFileRec(f, rec) };
  });
  if (useRegistry()) list.push({ read: regRead, write: regWrite });
  return list;
}

/** Bản MỚI NHẤT, ưu tiên bản có key. */
function pickBest(recs) {
  const all = recs.filter(Boolean);
  if (!all.length) return null;
  const withKey = all.filter((x) => x.key);
  const pool = withKey.length ? withKey : all;
  pool.sort((a, b) => (Number(b.savedAt) || 0) - (Number(a.savedAt) || 0));
  return pool[0];
}

/** Ghi bù bản tốt nhất (giữ nguyên savedAt) vào nơi đang thiếu hoặc giữ bản cũ hơn. */
function heal(ps, recs, best) {
  const t = Number(best.savedAt) || 0;
  ps.forEach((p, i) => { if (!recs[i] || (Number(recs[i].savedAt) || 0) < t) p.write(best); });
}

/** Đọc mọi nơi, trả bản MỚI NHẤT (ưu tiên bản có key). Lần đọc đầu của tiến trình tự chữa nơi thiếu/cũ. */
function readRecord() {
  const ps = places();
  const recs = ps.map((p) => p.read());
  const best = pickBest(recs);
  if (best && !healed) { healed = true; heal(ps, recs, best); }
  return best;
}

/** Ghi ra MỌI nơi, gộp với bản cũ (chỉ cập nhật hwid thì vẫn giữ key). Trả số nơi ghi được. */
function writeRecord(patch) {
  const ps = places();
  const cur = pickBest(ps.map((p) => p.read())) || {};
  healed = true;                                    // ngay sau đây ghi ra mọi nơi → khỏi tự chữa
  const rec = Object.assign({}, cur, patch || {}, { savedAt: Date.now(), product: PRODUCT });
  for (const k of Object.keys(rec)) if (rec[k] === undefined) delete rec[k];
  let n = 0;
  for (const p of ps) { if (p.write(rec)) n++; }
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
  /** Test: thay execFileSync của reg.exe (null = trả lại bản thật), xoá cờ đã-cảnh-báo. */
  _setRegExec(fn) { execReg = fn || execFileSync; warned = false; },
};
