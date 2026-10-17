'use strict';
/**
 * HP KEY - Sinh van tay may (HWID), zero-dependency. Ket qua: sha256 hex 64 ky tu,
 * co dinh tren cung 1 may (bat buoc 64 hex - server yeu cau).
 *
 * Cong thuc GIU NGUYEN (doi = may cu phai kich hoat lai): UUID | ProcessorId | BaseBoard | MAC dau tien |
 * hostname, bo phan rong. 3 thong so phan cung doc qua WMI/CIM - cham vai giay moi lenh, co may treo han:
 *  - Lenh Windows la MANG [file, ...args] -> chay THANG file, khong qua cmd.exe: het gio Node giet DUNG
 *    powershell.exe. Truyen chuoi thi Node chay qua cmd.exe, het gio chi giet cmd, con powershell.exe
 *    (treo vi WMI hong) bi bo lai mo coi va treo mai - moi lan mo app de lai 3 tien trinh.
 *  - Cache-first: thong so da co trong cache dung chung ~/.hpkey/hwid-parts.json (moi app HP tren may; chi
 *    tin khi cung MachineGuid = cung ban cai Windows) thi dung ngay, khong cho WMI luc mo app. Thong so lay
 *    tu cache duoc kiem lai o NEN (30 s sau, tuan tu, uu tien thap): gia tri moi (doi phan cung that) ghi
 *    vao cache, co hieu luc tu lan mo app sau. Chua co trong cache -> doc dong bo nhu cu (8 s) roi nap cache.
 *    Truoc day WMI qua han = thong so bi rot = HWID doi = "van key"; nay co cache thi khong rot nua.
 *  - Cache chi nhan gia tri SACH (khong rac BIOS): app dung thuat toan 'stable' (HP NPC LIVE) bam thang gia
 *    tri trong cache. Rac BIOS van duoc bam vao HWID cua app nay nhu cu, chi khong duoc cache.
 *  - May WMI hong ma chua co cache: chi lan dau cho het gio; thong so doc hong duoc ghi nho (hwid-cim-fail.json)
 *    nen cac lan sau khong cho nua (HWID y nhu doc hong), do lai o nen (xem FAIL_FILE).
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, execFileSync, spawn } = require('child_process');

function run(cmd, timeout) {
  const opts = { stdio: ['ignore', 'pipe', 'ignore'], timeout: timeout || 8000 };
  try {
    const out = Array.isArray(cmd)
      ? execFileSync(cmd[0], cmd.slice(1), Object.assign({ windowsHide: true }, opts))
      : execSync(cmd, opts);
    return out.toString().trim();
  } catch (_) { return ''; }
}

// Ban KHONG CHAN cua run() cho luot kiem lai o nen: cung lenh, cung cach lay dau ra (stdout, trim; thoat ma
// khac 0 / qua gio / loi = ''). Het gio giet DUNG tien trinh; app thoat giua chung thi giet not (killPending).
const pending = new Set();
let exitHooked = false;
function killPending() {
  for (const child of pending) { try { child.kill(); } catch (_) {} }
  pending.clear();
}
function runAsync(cmd, timeout) {
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
    // Moi lan PowerShell+CIM ton ~1,8 s CPU - ha uu tien de khong tranh voi OBS/live.
    if (child.pid) { try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (_) {} }
    // Luot kiem nen khong duoc giu tien trinh song (con con do bi killPending giet luc 'exit').
    timer.unref();
    child.unref();
    if (child.stdout.unref) child.stdout.unref();
  });
}

// Gia tri rac/placeholder hay gap tu BIOS: KHONG duoc vao cache dung chung (xem dau file).
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

const CACHE_FILE = path.join(os.homedir(), '.hpkey', 'hwid-parts.json');
function loadCache() {
  try {
    const o = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    return (o && typeof o === 'object') ? o : {};
  } catch (_) { return {}; }
}
// Nap gia tri doc duoc (live thang) - chi gia tri SACH; chi ghi khi noi dung doi (file dung chung nhieu app).
function cacheLive(live) {
  const cache = loadCache();
  const add = {};
  for (const k of Object.keys(live)) if (live[k] && clean(live[k]) === live[k]) add[k] = live[k];
  const merged = Object.assign({}, cache, add);
  if (JSON.stringify(merged) === JSON.stringify(cache)) return;
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(merged));
  } catch (_) {}
}

// Thong so CIM doc HONG (may WMI hong): ~/.hpkey/hwid-cim-fail.json = { mg: MachineGuid luc ghi, <ten>: thoi diem },
// dung chung moi app HP (la tinh trang WMI cua MAY). Thong so chua co trong cache ma da biet la hong (cung MachineGuid)
// -> lan mo sau KHONG cho nua: ket qua y nhu doc hong (thieu thong so do) nen HWID y nhu lan truoc - ma do o NEN; do
// duoc thi nap cache + xoa dau, tu lan mo sau HWID co du thong so: giong ban cu luc WMI hoi phuc, chi cham 1 lan mo.
// Truoc day may WMI hong ma chua co cache thi lan mo NAO cung cho 3 x 8 s.
const FAIL_FILE = path.join(path.dirname(CACHE_FILE), 'hwid-cim-fail.json');
function readJson(file) {
  try {
    const o = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (o && typeof o === 'object') ? o : {};
  } catch (_) { return {}; }
}
// Chi tin dau ghi duoi CUNG MachineGuid (cai lai Windows / ho so chep sang may khac -> doc lai nhu may moi).
function failedFor(mg) {
  const o = readJson(FAIL_FILE);
  return o.mg === (mg || '') ? o : {};
}
// ok: thong so vua doc duoc (xoa dau); bad: thong so vua doc hong (danh dau). mg undefined = giu nguyen.
function markFail(mg, ok, bad) {
  const cur = readJson(FAIL_FILE);
  const next = (mg === undefined || cur.mg === (mg || '')) ? Object.assign({}, cur) : {};
  if (mg !== undefined) next.mg = mg || '';
  for (const k of ok) delete next[k];
  for (const k of bad) if (!next[k]) next[k] = Date.now();
  if (JSON.stringify(next) === JSON.stringify(cur)) return;
  try {
    if (!Object.keys(next).some((k) => k !== 'mg')) { fs.unlinkSync(FAIL_FILE); return; }
    fs.mkdirSync(path.dirname(FAIL_FILE), { recursive: true });
    fs.writeFileSync(FAIL_FILE, JSON.stringify(next));
  } catch (_) {}
}

const ps = (q) => ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', q];
const CIM = {
  uuid: ps('(Get-CimInstance Win32_ComputerSystemProduct).UUID'),
  cpu: ps('(Get-CimInstance Win32_Processor | Select-Object -First 1).ProcessorId'),
  bb: ps('(Get-CimInstance Win32_BaseBoard | Select-Object -First 1).SerialNumber'),
};
const CIM_LABELS = ['uuid', 'cpu', 'bb'];
const REG_MG = ['reg.exe', 'query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'];

function machineGuid() {
  const m = run(REG_MG).match(/MachineGuid\s+REG_SZ\s+([\w-]+)/i);
  return m ? clean(m[1]) : '';
}

// Luot kiem lai o NEN cho thong so lay tu cache: hen sau khi app da len, tuan tu, timeout rong.
const RECHECK_DELAY_MS = 30000;
const RECHECK_TIMEOUT_MS = 12000;
let recheck = null; // { timer, labels } khi dang hen
function scheduleRecheck(labels) {
  if (recheck || !labels.length) return;
  const timer = setTimeout(() => {
    recheck = null;
    recheckParts(labels, RECHECK_TIMEOUT_MS).catch(() => {});
  }, RECHECK_DELAY_MS);
  timer.unref();
  recheck = { timer, labels };
}
async function recheckParts(labels, timeout) {
  const live = {};
  for (const k of labels) {
    const v = await runAsync(CIM[k], timeout);
    if (v) live[k] = v;
  }
  cacheLive(live);
  markFail(undefined, Object.keys(live), []);
  return live;
}
// Cho selftest: chay NGAY luot kiem nen dang hen -> Promise<{label: value}> | null neu khong hen.
function _runRecheckNow(timeout) {
  if (!recheck) return Promise.resolve(null);
  clearTimeout(recheck.timer);
  const { labels } = recheck;
  recheck = null;
  return recheckParts(labels, timeout || RECHECK_TIMEOUT_MS);
}

// 3 thong so CIM (gia tri tho da trim, dung nhu PowerShell tra): cache-first, da biet hong thi khong cho, con lai doc
// dong bo nhu cu. Thong so lay tu cache / chua doc duoc deu duoc kiem lai o nen.
function cimValues() {
  const cache = loadCache();
  const mg = machineGuid();
  const sameMachine = !mg || mg === cache.mg;
  const failed = failedFor(mg || (sameMachine ? cache.mg : ''));
  const vals = {};
  const recheckLabels = [];
  const live = mg ? { mg } : {};
  const ok = [];
  const bad = [];
  for (const k of CIM_LABELS) {
    if (sameMachine && cache[k]) { vals[k] = cache[k]; recheckLabels.push(k); continue; }
    if (failed[k]) { vals[k] = ''; recheckLabels.push(k); continue; }   // = ket qua doc hong, khong cho nua
    vals[k] = run(CIM[k]);
    live[k] = vals[k];
    if (vals[k]) ok.push(k);
    else { bad.push(k); recheckLabels.push(k); }
  }
  cacheLive(live);
  markFail(mg || (sameMachine ? cache.mg : ''), ok, bad);
  scheduleRecheck(recheckLabels);
  return vals;
}

function hwParts() {
  const parts = [];
  if (process.platform === 'win32') {
    const v = cimValues();
    parts.push(v.uuid, v.cpu, v.bb);
  } else if (process.platform === 'darwin') {
    parts.push(run("ioreg -rd1 -c IOPlatformExpertDevice | awk -F'\"' '/IOPlatformUUID/{print $4}'"));
  } else {
    parts.push(run('cat /etc/machine-id 2>/dev/null'));
    parts.push(run('cat /sys/class/dmi/id/product_uuid 2>/dev/null'));
  }
  const macs = [];
  const ni = os.networkInterfaces();
  for (const name of Object.keys(ni)) {
    for (const a of ni[name] || []) {
      if (!a.internal && a.mac && a.mac !== '00:00:00:00:00:00') macs.push(a.mac);
    }
  }
  macs.sort();
  parts.push(macs[0] || '');
  parts.push(os.hostname());
  return parts.filter(Boolean).join('|');
}

let cached = null;
function getHWID() {
  if (cached) return cached;
  const raw = hwParts() || ('fallback|' + os.hostname() + '|' + os.arch());
  cached = crypto.createHash('sha256').update(raw).digest('hex');
  return cached;
}

module.exports = { getHWID, _runRecheckNow };
