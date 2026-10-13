// node --test tests/win-minimize.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../lib/win-minimize');

test('minimizeScript: tìm cửa sổ theo tiền tố tiêu đề (escape nháy đơn) và ShowWindowAsync(…, 6)', () => {
    const s = W.minimizeScript("HP Phụ đề giọng — it's");
    assert.match(s, /ShowWindowAsync/);
    assert.match(s, /, 6\)/);
    assert.ok(s.includes("'HP Phụ đề giọng — it''s*'"), 'tiền tố phải được escape và thêm *');
    assert.match(s, /msedge.*chrome|chrome.*msedge/);
});

test('minimizeWindowByTitle: chạy powershell.exe với -EncodedCommand (UTF-16LE base64) của script', () => {
    const calls = [];
    const fakeSpawn = (exe, args, opts) => { calls.push({ exe, args, opts }); return { on() {}, unref() {} }; };
    W.minimizeWindowByTitle('HP Phụ đề giọng', { spawn: fakeSpawn });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].exe, 'powershell.exe');
    const i = calls[0].args.indexOf('-EncodedCommand');
    assert.ok(i > 0);
    const decoded = Buffer.from(calls[0].args[i + 1], 'base64').toString('utf16le');
    assert.equal(decoded, W.minimizeScript('HP Phụ đề giọng'));
    assert.equal(calls[0].opts.windowsHide, true);
});
