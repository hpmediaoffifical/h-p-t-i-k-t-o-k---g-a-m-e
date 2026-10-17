'use strict';
/**
 * HP KEY - Vân tay máy (HWID) 64 hex, zero-dependency. FILE LÕI — không sửa trong app.
 *
 * Hai thuật toán, chọn bằng config.HWID_ALGO:
 *   'legacy' : tái hiện ĐÚNG BYTE hwid.js cũ của HP Action LIVE / BIGO / Talent Show
 *              (UUID | ProcessorId | BaseBoard | MAC đầu tiên | hostname). Hay trôi khi cắm
 *              VPN / đổi card mạng / đổi tên máy, nhưng app đã có người dùng thì PHẢI giữ.
 *   'stable' : tái hiện ĐÚNG BYTE hwid.cjs của HP NPC LIVE (mg:MachineGuid | uuid | cpu | bb),
 *              có cache từng phần ở ~/.hpkey/hwid-parts.json để lệnh quá hạn không làm trôi.
 *
 * ĐÓNG BĂNG: dù thuật toán nào, giá trị tính được lần đầu (nếu "có chất lượng", tức lấy
 * được ít nhất 1 định danh phần cứng thật) được ghi vào store (file + registry) và các lần
 * sau đọc lại, không tính nữa. Máy đã có hwid trong store (Talent Show) giữ nguyên giá trị.
 *
 * WMI/CIM (UUID / ProcessorId / BaseBoard) chậm vài giây mỗi lệnh, có máy treo hẳn:
 *   • Lệnh Windows là MẢNG [file, ...args] → chạy THẲNG file, không qua cmd.exe: hết giờ Node giết
 *     ĐÚNG powershell.exe. Truyền chuỗi thì Node chạy qua cmd.exe, hết giờ chỉ giết cmd còn
 *     powershell.exe con (treo vì WMI hỏng) mồ côi và treo mãi — mỗi lần tính để lại 3 tiến trình.
 *   • Cache-first: định danh CIM đã có trong cache dùng chung (cùng MachineGuid = cùng bản cài
 *     Windows) thì lấy luôn, không chờ WMI. Cả 2 thuật toán đọc cache; 'legacy' chỉ ghi vào cache
 *     giá trị SẠCH (không rác BIOS) vì 'stable' băm thẳng giá trị trong cache.
 *   • Nhớ định danh đọc hỏng (hwid-cim-fail.json cạnh cache): máy WMI hỏng chỉ chờ ở lần tính đầu,
 *     các lần sau không chờ nữa (HWID y như đọc hỏng); chưa đóng băng được thì dò lại ở NỀN.
 *   Đã đóng băng thì không kiểm lại nữa.
 *
 * Mọi I/O đi qua deps để test không cần máy thật: _setDeps({ run, env, store, algo, cacheFile }).
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, execFileSync, spawn } = require('child_process');

const HEX64 = /^[0-9a-f]{64}$/;

const CMD = {
  uuid: '(Get-CimInstance Win32_ComputerSystemProduct).UUID',
  cpu: '(Get-CimInstance Win32_Processor | Select-Object -First 1).ProcessorId',
  bb: '(Get-CimInstance Win32_BaseBoard | Select-Object -First 1).SerialNumber',
  mg: ['reg.exe', 'query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
  macUuid: "ioreg -rd1 -c IOPlatformExpertDevice | awk -F'\"' '/IOPlatformUUID/{print $4}'",
  linuxMid: 'cat /etc/machine-id 2>/dev/null',
  linuxUuid: 'cat /sys/class/dmi/id/product_uuid 2>/dev/null',
};
const ps = (q) => ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', q];
const CIM_LABELS = ['uuid', 'cpu', 'bb'];

/* ---------------- I/O mặc định ---------------- */
// MẢNG → chạy thẳng file (Windows); CHUỖI → qua shell (macOS/Linux cần pipe/redirect).
function defaultRun(cmd, timeout) {
  const opts = { stdio: ['ignore', 'pipe', 'ignore'], timeout: timeout || 8000 };
  try {
    const out = Array.isArray(cmd)
      ? execFileSync(cmd[0], cmd.slice(1), Object.assign({ windowsHide: true }, opts))
      : execSync(cmd, opts);
    return out.toString().trim();
  } catch (_) { return ''; }
}
function firstMac() {
  const macs = [];
  const ni = os.networkInterfaces();
  for (const name of Object.keys(ni)) {
    for (const a of ni[name] || []) {
      if (!a.internal && a.mac && a.mac !== '00:00:00:00:00:00') macs.push(a.mac);
    }
  }
  macs.sort();
  return macs[0] || '';
}
function defaultEnv() {
  return { platform: process.platform, hostname: os.hostname(), arch: os.arch(), firstMac: firstMac() };
}
const DEFAULT_CACHE_FILE = path.join(os.homedir(), '.hpkey', 'hwid-parts.json');

function hashRaw(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/* ---------------- cache định danh dùng chung ---------------- */
const JUNK = new Set([
  '', '0', 'none', 'invalid', 'default string', 'to be filled by o.e.m.',
  'system serial number', 'not applicable', 'not specified', 'not available',
  'oem', 'o.e.m.', 'na', 'n/a',
  '00000000-0000-0000-0000-000000000000',
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
]);
function clean(v) {
  const s = String(v || '').trim();
  return JUNK.has(s.toLowerCase()) ? '' : s;
}
function loadCache(file) {
  try {
    const o = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (o && typeof o === 'object') ? o : {};
  } catch (_) { return {}; }
}
function saveCache(file, obj) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(obj));
  } catch (_) {}
}
// File dùng chung nhiều app: chỉ ghi khi nội dung đổi (đỡ rủi ro app khác đọc trúng lúc đang ghi dở).
function saveCacheIfChanged(file, merged, cache) {
  if (Object.keys(merged).length && JSON.stringify(merged) !== JSON.stringify(cache)) saveCache(file, merged);
}
function parseMg(out) {
  const m = String(out || '').match(/MachineGuid\s+REG_SZ\s+([\w-]+)/i);
  return m ? clean(m[1]) : '';
}
// Định danh CIM lấy được từ cache cho lần tính này: chỉ khi cache cùng MachineGuid (đọc reg, vài chục ms;
// đọc không được thì tin cache — vẫn là cache của chính máy này).
function cimFromCache(cache, mg) {
  const hits = {};
  if (!mg || mg === cache.mg) for (const k of CIM_LABELS) if (cache[k]) hits[k] = cache[k];
  return hits;
}

/* ---------------- nhớ định danh CIM đọc hỏng (máy WMI hỏng / BIOS trả rác) ---------------- */
// <thư mục cache>/hwid-cim-fail.json = { mg: MachineGuid lúc ghi, <label>: thời điểm } — dùng chung mọi app HP (là tình
// trạng WMI của MÁY). Định danh chưa cache mà đã biết là hỏng (cùng MachineGuid) → lần tính sau KHÔNG chờ nữa: kết quả
// y như đọc hỏng (thiếu định danh đó) nên HWID y như lần trước. Vân tay chưa đóng băng được thì dò lại ở NỀN (getHWID):
// dò được → nạp cache + xoá dấu → lần mở sau có đủ định danh rồi đóng băng (như bản cũ lúc WMI hồi phục, chậm 1 lần mở).
// Trước đây máy WMI hỏng mà chưa có cache thì lần mở NÀO cũng chờ hết giờ (legacy 3 × (8 s + 8 s)).
const failFileFor = (cacheFile) => path.join(path.dirname(cacheFile), 'hwid-cim-fail.json');
// Chỉ tin dấu ghi dưới CÙNG MachineGuid (cài lại Windows / hồ sơ chép sang máy khác → đọc lại như máy mới).
function failedFor(file, mg) {
  const o = loadCache(file);
  return o.mg === (mg || '') ? o : {};
}
// ok: định danh vừa đọc được (xoá dấu); bad: định danh chưa cache vừa đọc hỏng (đánh dấu). mg undefined = giữ nguyên.
function markFail(file, mg, ok, bad) {
  const cur = loadCache(file);
  const next = (mg === undefined || cur.mg === (mg || '')) ? Object.assign({}, cur) : {};
  if (mg !== undefined) next.mg = mg || '';
  for (const k of ok) delete next[k];
  for (const k of bad) if (!next[k]) next[k] = Date.now();
  if (JSON.stringify(next) === JSON.stringify(cur)) return;
  if (!Object.keys(next).some((k) => k !== 'mg')) { try { fs.unlinkSync(file); } catch (_) {} return; }
  saveCache(file, next);
}

/* ---------------- 'legacy' (hwid.js cũ, có retry PowerShell như Talent Show) ---------------- */
// cacheFile (tuỳ chọn): bật cache-first cho 3 định danh CIM + nạp cache bằng giá trị đọc được.
// Giá trị trong cache = giá trị PowerShell trả (đã trim) nên chuỗi băm y hệt lúc đọc trực tiếp.
// failFile (tuỳ chọn): nhớ định danh đọc hỏng để lần sau không chờ (xem failFileFor). probe = định danh còn thiếu.
function computeLegacy(run, env, cacheFile, failFile) {
  const parts = [];
  let quality = false;
  const probe = [];
  if (env.platform === 'win32') {
    const q = (cmd) => run(cmd, 8000) || run(cmd, 8000);   // quá hạn nhất thời không được làm đổi HWID
    const cache = cacheFile ? loadCache(cacheFile) : {};
    const mg = cacheFile ? parseMg(run(CMD.mg, 8000)) : '';
    const hits = cacheFile ? cimFromCache(cache, mg) : {};
    const failed = failFile ? failedFor(failFile, mg) : {};
    const live = {};
    const ok = [];
    const bad = [];
    const cim = CIM_LABELS.map((k) => {
      if (hits[k]) return hits[k];
      if (failed[k]) { probe.push(k); return ''; }   // đã biết hỏng → không chờ (= kết quả đọc hỏng)
      const v = q(ps(CMD[k]));
      (v ? ok : bad).push(k);
      if (v && clean(v) === v) live[k] = v;   // rác BIOS vẫn băm vào 'legacy' nhưng KHÔNG vào cache dùng chung
      return v;
    });
    if (cacheFile) saveCacheIfChanged(cacheFile, Object.assign({}, cache, mg ? { mg } : {}, live), cache);
    if (failFile) markFail(failFile, mg, ok, bad);
    probe.push(...bad);
    quality = cim.some(Boolean);
    parts.push(...cim);
  } else if (env.platform === 'darwin') {
    parts.push(run(CMD.macUuid, 8000));
    quality = parts.some(Boolean);
  } else {
    parts.push(run(CMD.linuxMid, 8000));
    parts.push(run(CMD.linuxUuid, 8000));
    quality = parts.some(Boolean);
  }
  parts.push(env.firstMac || '');
  parts.push(env.hostname);
  const raw = parts.filter(Boolean).join('|') || ('fallback|' + env.hostname + '|' + env.arch);
  return { raw, quality, probe };
}

/* ---------------- 'stable' (hwid.cjs của NPC: nhãn + loại rác + cache từng phần) ---------------- */
function partOrder(platform) {
  if (platform === 'win32') return ['mg', 'uuid', 'cpu', 'bb'];
  if (platform === 'darwin') return ['uuid'];
  return ['mid', 'uuid'];
}
function commandFor(platform, label) {
  if (platform === 'win32') return label === 'mg' ? CMD.mg : ps(CMD[label]);
  if (platform === 'darwin') return CMD.macUuid;
  return label === 'mid' ? CMD.linuxMid : CMD.linuxUuid;
}
function readLiveParts(run, env, cache, labels) {
  const out = {};
  // Đã có cache → đọc nhanh (4 s, không retry); chưa có → kiên nhẫn (12 s + 1 retry).
  const query = (label) => {
    const has = !!cache[label];
    const cmd = commandFor(env.platform, label);
    let v = run(cmd, has ? 4000 : 12000);
    if (!v && !has) v = run(cmd, 12000);
    return v;
  };
  for (const label of labels) {
    const v = label === 'mg' ? parseMg(query(label)) : clean(query(label));
    if (v) out[label] = v;
  }
  return out;
}
function computeStable(run, env, cacheFile, failFile) {
  const cache = loadCache(cacheFile);
  let live;
  let probe = [];
  if (env.platform === 'win32') {
    // Cache-first: mỗi định danh CIM đều đã có lời giải (cache cùng MachineGuid, hoặc biết là hỏng) → không chờ WMI.
    live = readLiveParts(run, env, cache, ['mg']);
    const hits = cimFromCache(cache, live.mg);
    const mg = live.mg || cache.mg || '';   // reg đọc không được → tin cache của chính máy này
    const failed = failFile ? failedFor(failFile, mg) : {};
    const skip = CIM_LABELS.filter((k) => !cache[k] && failed[k]);
    if (CIM_LABELS.some((k) => !hits[k] && !skip.includes(k))) {
      const now = CIM_LABELS.filter((k) => !skip.includes(k));
      const got = readLiveParts(run, env, cache, now);
      Object.assign(live, got);
      if (failFile) markFail(failFile, mg, now.filter((k) => got[k]), now.filter((k) => !got[k] && !cache[k]));
      probe = CIM_LABELS.filter((k) => !got[k] && !hits[k]);
    } else {
      probe = skip;
    }
  } else {
    live = readLiveParts(run, env, cache, partOrder(env.platform));
  }
  const merged = Object.assign({}, cache, live);      // live thắng; thiếu thì lấy cache
  saveCacheIfChanged(cacheFile, merged, cache);
  const parts = [];
  for (const label of partOrder(env.platform)) if (merged[label]) parts.push(label + ':' + merged[label]);
  const raw = parts.length
    ? parts.join('|')
    : ('fallback|' + (env.firstMac || env.hostname) + '|' + env.arch);
  return { raw, quality: parts.length > 0, probe };
}

/* ---------------- dò định danh CIM ở NỀN (không chặn) ---------------- */
// Chỉ khi vân tay CHƯA đóng băng được (WMI hỏng). Hẹn sau khi app đã lên, tuần tự, ưu tiên thấp, timeout rộng; hết giờ
// giết ĐÚNG tiến trình, app thoát giữa chừng thì giết nốt (không để powershell.exe treo mồ côi).
const PROBE_DELAY_MS = 30000;
const PROBE_TIMEOUT_MS = 12000;
let probeJob = null; // { timer, args } khi đang hẹn
const pending = new Set();
let exitHooked = false;
function killPending() {
  for (const child of pending) { try { child.kill(); } catch (_) {} }
  pending.clear();
}
// Bản KHÔNG CHẶN của defaultRun cho lệnh MẢNG: cùng cách lấy đầu ra (stdout, trim; mã thoát ≠ 0 / quá giờ / lỗi = '').
function defaultRunAsync(cmd, timeout) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd[0], cmd.slice(1), { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    } catch (_) { resolve(''); return; }
    if (!exitHooked) { exitHooked = true; process.on('exit', killPending); }
    pending.add(child);
    const chunks = [];
    let done = false;
    const finish = (out) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      pending.delete(child);
      resolve(out);
    };
    const timer = setTimeout(() => { try { child.kill(); } catch (_) {} finish(''); }, timeout);
    child.stdout.on('data', (d) => chunks.push(d));
    child.on('error', () => finish(''));
    child.on('close', (code) => finish(code === 0 ? Buffer.concat(chunks).toString().trim() : ''));
    if (child.pid) { try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (_) {} }
    timer.unref();
    child.unref();
    if (child.stdout.unref) child.stdout.unref();
  });
}
function scheduleProbe(args) {
  if (probeJob || !args[0].length) return;
  const timer = setTimeout(() => { probeJob = null; probeParts(...args).catch(() => {}); }, PROBE_DELAY_MS);
  if (timer.unref) timer.unref();
  probeJob = { timer, args };
}
// Đọc lại các định danh ở nền → nạp cache (chỉ giá trị SẠCH) + xoá dấu hỏng của định danh đọc được.
async function probeParts(labels, algo, env, cacheFile, failFile, timeout) {
  const runAsync = deps.runAsync || defaultRunAsync;
  const got = {};
  const ok = [];
  for (const k of labels) {
    const v = String((await runAsync(commandFor(env.platform, k), timeout || PROBE_TIMEOUT_MS)) || '').trim();
    if (algo === 'legacy' ? v : clean(v)) ok.push(k);   // legacy băm cả rác BIOS → rác vẫn là "đọc được"
    if (v && clean(v) === v) got[k] = v;
  }
  const cache = loadCache(cacheFile);
  saveCacheIfChanged(cacheFile, Object.assign({}, cache, got), cache);
  if (ok.length) markFail(failFile, undefined, ok, []);
  return got;
}
// Cho test: chạy NGAY lượt dò nền đang hẹn → Promise<{label: value}> | null nếu không hẹn.
function _runRecheckNow(timeout) {
  if (!probeJob) return Promise.resolve(null);
  clearTimeout(probeJob.timer);
  const { args } = probeJob;
  probeJob = null;
  return probeParts(...args.slice(0, 5), timeout);
}

/* ---------------- getHWID: đóng băng ---------------- */
const deps = { run: null, env: null, store: null, algo: null, cacheFile: null, failFile: null, runAsync: null };
let cached = null;

function _setDeps(d) { Object.assign(deps, d || {}); }
function _reset() {
  cached = null;
  for (const k of Object.keys(deps)) deps[k] = null;
  if (probeJob) { clearTimeout(probeJob.timer); probeJob = null; }
}

function getHWID() {
  if (cached) return cached;
  const store = deps.store || require('./store');
  const run = deps.run || defaultRun;
  const env = deps.env || defaultEnv();
  let algo = deps.algo || require('./config').HWID_ALGO;
  if (algo !== 'legacy' && algo !== 'stable') {
    // Sai lầm đắt nhất có thể xảy ra: app cũ copy tay hwid.js mà chưa khai HWID_ALGO → đổi HWID
    // của mọi máy khách. Không im lặng: báo rõ rồi mới dùng mặc định.
    console.error('[hpkey] config.HWID_ALGO thiếu hoặc không hợp lệ (' + JSON.stringify(algo) + ') — tạm dùng "stable". ' +
      'App đã có người dùng với hwid.js cũ PHẢI đặt HWID_ALGO: "legacy", nếu không mọi máy khách sẽ đổi HWID.');
    algo = 'stable';
  }
  const cacheFile = deps.cacheFile || DEFAULT_CACHE_FILE;

  let saved = '';
  try { saved = String(store.readHwid() || ''); } catch (_) {}
  if (HEX64.test(saved)) { cached = saved; return cached; }

  const failFile = deps.failFile || failFileFor(cacheFile);
  const r = algo === 'legacy' ? computeLegacy(run, env, cacheFile, failFile) : computeStable(run, env, cacheFile, failFile);
  cached = hashRaw(r.raw);
  // Chỉ đóng băng vân tay "có chất lượng". WMI/PowerShell hỏng → dùng tạm, không ghi đè; định danh CIM còn thiếu
  // được dò ở nền để lần mở sau có đủ rồi đóng băng.
  if (r.quality) { try { store.writeHwid(cached); } catch (_) {} }
  else scheduleProbe([r.probe || [], algo, env, cacheFile, failFile]);
  return cached;
}

module.exports = { getHWID, computeLegacy, computeStable, hashRaw, _setDeps, _reset, _runRecheckNow };
