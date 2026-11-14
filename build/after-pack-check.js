// electron-builder afterPack: kiểm app.asar vừa đóng gói có đủ thư viện. Thiếu → build hỏng,
// không sinh file cài. Xem build/check-asar-deps.js.
'use strict';
const path = require('path');
const fs = require('fs');
const { checkAsar, report } = require('./check-asar-deps');

exports.default = async function afterPack(context) {
  const asarPath = path.join(context.appOutDir, 'resources', 'app.asar');
  if (!fs.existsSync(asarPath)) throw new Error(`afterPack: không thấy ${asarPath}`);
  const r = checkAsar(asarPath);
  const ok = report('Kiểm thư viện trong app.asar', r.errors, `${r.files} file, ${r.modules} thư viện`);
  if (!ok) throw new Error('app.asar thiếu thư viện — dừng build (xem danh sách ở trên).');
};
