#!/usr/bin/env node
// 🎮 Sinh manifest.json cho game tải riêng (đặt cạnh file game trên hpvn.media). Xem docs/game-tai-rieng.md.
//
//   node tools/game-manifest.js "<file game>" <link thư mục trên web> [ghi chú]
//   Sinh Tồn:     node tools/game-manifest.js "F:\PHAT TRIEN GAME\Game HP CS 3D\dist\HP-Sinh-Ton-Setup-1.1.0.exe" https://hpvn.media/sinhton "Ghi chú"
//   HP Đại Chiến: node tools/game-manifest.js "F:\PHAT TRIEN GAME\HP Dai Chien\dist\hp-dai-chien-web-0.1.0.zip" https://hpvn.media/daichien "Ghi chú"
//
// Tên file phải kết thúc bằng -X.Y.Z.exe hoặc -X.Y.Z.zip (phiên bản lấy từ tên). Ghi manifest.json cạnh file và in ra màn hình.
// KHÔNG tự tải lên đâu cả.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateManifest } = require('../lib/game-download');

const [file, base, notes = ''] = process.argv.slice(2);
if (!file || !base || !fs.existsSync(file)) {
    console.error('Cách dùng: node tools/game-manifest.js "<file game -X.Y.Z.exe|.zip>" <link thư mục https> [ghi chú]');
    process.exit(1);
}
const name = path.basename(file);
const m = name.match(/-(\d+\.\d+\.\d+)\.(exe|zip)$/i);
if (!m) { console.error('Tên file phải kết thúc bằng -X.Y.Z.exe hoặc -X.Y.Z.zip'); process.exit(1); }
const hash = crypto.createHash('sha256');
fs.createReadStream(file).on('data', (c) => hash.update(c)).on('end', () => {
    const manifest = { version: m[1], url: base.replace(/\/+$/, '') + '/' + encodeURIComponent(name), sha256: hash.digest('hex'), size: fs.statSync(file).size, notes };
    if (!validateManifest(manifest)) { console.error('Manifest không hợp lệ (link phải https, file ≤ 600 MB)'); process.exit(1); }
    const out = path.join(path.dirname(file), 'manifest.json');
    fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
    console.log(JSON.stringify(manifest, null, 2));
    console.log('\nĐã ghi ' + out + '\nTải lên CÙNG thư mục trên web: ' + name + ' TRƯỚC, manifest.json SAU CÙNG.');
});
