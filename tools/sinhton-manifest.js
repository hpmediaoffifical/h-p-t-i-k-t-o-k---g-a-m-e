#!/usr/bin/env node
// 🔫 Sinh Tồn — sinh manifest.json cho bộ cài game (đặt cạnh bộ cài trên hpvn.media). Xem docs/sinhton-tai-rieng.md.
//
//   node tools/sinhton-manifest.js "<đường dẫn HP-Sinh-Ton-Setup-X.Y.Z.exe>" [link thư mục trên web] [ghi chú]
//   vd: node tools/sinhton-manifest.js "F:\PHAT TRIEN GAME\Game HP CS 3D\dist\HP-Sinh-Ton-Setup-1.1.0.exe" https://hpvn.media/sinhton "Quà giúp Idol, bảng đo lag"
//
// Ghi manifest.json cạnh bộ cài và in nội dung ra màn hình. KHÔNG tự tải lên đâu cả.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateManifest } = require('../lib/sinhton-download');

const [file, base = 'https://hpvn.media/sinhton', notes = ''] = process.argv.slice(2);
if (!file || !fs.existsSync(file)) {
    console.error('Cách dùng: node tools/sinhton-manifest.js "<HP-Sinh-Ton-Setup-X.Y.Z.exe>" [link thư mục] [ghi chú]');
    process.exit(1);
}
const name = path.basename(file);
const m = name.match(/^HP-Sinh-Ton-Setup-(\d+\.\d+\.\d+)\.exe$/);
if (!m) { console.error('Tên file phải dạng HP-Sinh-Ton-Setup-X.Y.Z.exe'); process.exit(1); }
const hash = crypto.createHash('sha256');
fs.createReadStream(file).on('data', (c) => hash.update(c)).on('end', () => {
    const manifest = { version: m[1], url: base.replace(/\/+$/, '') + '/' + encodeURIComponent(name), sha256: hash.digest('hex'), size: fs.statSync(file).size, notes };
    if (!validateManifest(manifest)) { console.error('Manifest không hợp lệ (link phải https)'); process.exit(1); }
    const out = path.join(path.dirname(file), 'manifest.json');
    fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
    console.log(JSON.stringify(manifest, null, 2));
    console.log('\nĐã ghi ' + out + '\nTải lên CÙNG thư mục trên web: ' + name + ' và manifest.json');
});
