#!/usr/bin/env node
// Kiểm tra gói app.asar có ĐỦ thư viện chạy (dependencies của package.json + mọi thư viện con).
//
// Vì sao có file này: bản 1.26.0 build từ worktree mà node_modules là junction trỏ sang thư mục
// khác → `npm ls` coi mọi gói là "extraneous" → electron-builder chỉ gom thư viện cấp đầu,
// thiếu body-parser/raw-body/qs… → app mở lên báo "Cannot find module 'body-parser'".
//
// Dùng:
//   node build/check-asar-deps.js --preflight [thư mục] # trước khi build: node_modules thật + npm ls sạch
//   node build/check-asar-deps.js <đường dẫn app.asar>  # sau khi build: kiểm gói
//   (tự chạy trong electron-builder qua build.afterPack = build/after-pack-check.js)
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let ROOT = path.resolve(__dirname, '..');

function readRootPkg() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
}

// ---------- Trước khi build ----------
function preflight() {
  const errors = [];
  const nm = path.join(ROOT, 'node_modules');
  let st;
  try { st = fs.lstatSync(nm); } catch { errors.push('Không có node_modules — chạy `npm ci` trước.'); }
  if (st) {
    let real = nm;
    try { real = fs.realpathSync(nm); } catch {}
    if (st.isSymbolicLink() || path.resolve(real).toLowerCase() !== path.resolve(nm).toLowerCase()) {
      errors.push(`node_modules là liên kết (symlink/junction) → ${real}. electron-builder sẽ bỏ sót thư viện con. Xoá liên kết và chạy \`npm ci\` ngay trong thư mục này.`);
    }
  }
  if (!errors.length) {
    try {
      execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ls', '--omit=dev', '--all'], {
        cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], shell: process.platform === 'win32',
      });
    } catch (e) {
      const msg = String(e.stderr || e.message).split('\n').filter(Boolean).slice(0, 8).join('\n  ');
      errors.push(`\`npm ls --omit=dev\` báo lỗi (cây thư viện không khớp package-lock) — chạy \`npm ci\`:\n  ${msg}`);
    }
  }
  return errors;
}

// ---------- Sau khi build: kiểm app.asar ----------
function loadAsar() {
  try { return require('@electron/asar'); } catch {}
  return require(path.join(ROOT, 'node_modules', '@electron', 'asar'));
}

function checkAsar(asarPath) {
  const asar = loadAsar();
  const files = new Set(asar.listPackage(asarPath).map((p) => p.split('\\').join('/')));
  const unpackedRoot = asarPath + '.unpacked';
  const exists = (rel) => files.has(rel) || fs.existsSync(path.join(unpackedRoot, rel));
  const readJson = (rel) => {
    // extractFile cần dấu phân cách của hệ điều hành (Windows: "\").
    try { return JSON.parse(asar.extractFile(asarPath, rel.slice(1).split('/').join(path.sep)).toString('utf8')); } catch {}
    try { return JSON.parse(fs.readFileSync(path.join(unpackedRoot, rel), 'utf8')); } catch {}
    return null;
  };

  // Giải tên gói theo luật Node: <dir>/node_modules/<name>, rồi đi ngược lên thư mục cha.
  function resolvePkg(fromDir, name) {
    let dir = fromDir;
    for (;;) {
      const cand = (dir === '' ? '' : dir) + '/node_modules/' + name + '/package.json';
      if (exists(cand)) return cand.slice(0, -'/package.json'.length);
      if (dir === '') return null;
      const idx = dir.lastIndexOf('/node_modules/');
      dir = idx <= 0 ? '' : dir.slice(0, idx);
    }
  }

  const rootPkg = readRootPkg();
  const errors = [];
  const seen = new Set();
  const queue = Object.keys(rootPkg.dependencies || {}).map((n) => ({ from: '', name: n, chain: [n], optional: false }));
  for (const n of Object.keys(rootPkg.optionalDependencies || {})) queue.push({ from: '', name: n, chain: [n], optional: true });

  while (queue.length) {
    const { from, name, chain, optional } = queue.shift();
    const dir = resolvePkg(from, name);
    if (!dir) {
      if (!optional) errors.push(`THIẾU ${name}  (cần bởi: ${chain.join(' → ')})`);
      continue;
    }
    if (seen.has(dir)) continue;
    seen.add(dir);
    const pkg = readJson(dir + '/package.json');
    if (!pkg) { errors.push(`Không đọc được ${dir}/package.json`); continue; }
    const mainRel = pkg.main ? dir + '/' + pkg.main.replace(/^\.\//, '') : null;
    if (mainRel && !pkg.exports && !(exists(mainRel) || exists(mainRel + '.js') || exists(mainRel + '/index.js'))) {
      errors.push(`${name}: thiếu file main "${pkg.main}" trong gói`);
    }
    for (const dep of Object.keys(pkg.dependencies || {})) queue.push({ from: dir, name: dep, chain: [...chain, dep], optional: false });
    for (const dep of Object.keys(pkg.optionalDependencies || {})) queue.push({ from: dir, name: dep, chain: [...chain, dep], optional: true });
  }

  // Mọi file mã của app phải có trong gói.
  for (const f of ['/package.json', '/' + (rootPkg.main || 'index.js'), '/server.js']) {
    if (!exists(f)) errors.push(`Gói thiếu file ${f}`);
  }
  return { errors, modules: seen.size, files: files.size };
}

function report(title, errors, extra) {
  if (errors.length) {
    console.error(`\n✗ ${title}: ${errors.length} lỗi${extra ? ' (' + extra + ')' : ''}`);
    for (const e of errors.slice(0, 40)) console.error('  - ' + e);
    if (errors.length > 40) console.error(`  … và ${errors.length - 40} lỗi nữa`);
    return false;
  }
  console.log(`✓ ${title}${extra ? ' (' + extra + ')' : ''}`);
  return true;
}

module.exports = { preflight, checkAsar, report };

if (require.main === module) {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Dùng: node build/check-asar-deps.js --preflight | <app.asar>');
    process.exit(2);
  }
  if (arg === '--preflight') {
    if (process.argv[3]) ROOT = path.resolve(process.argv[3]);
    process.exit(report('Kiểm node_modules trước khi build', preflight()) ? 0 : 1);
  }
  const r = checkAsar(path.resolve(arg));
  process.exit(report(`Kiểm thư viện trong ${arg}`, r.errors, `${r.files} file, ${r.modules} thư viện`) ? 0 : 1);
}
