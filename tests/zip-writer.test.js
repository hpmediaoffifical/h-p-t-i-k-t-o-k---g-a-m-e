const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const Zip = require('../lib/zip-writer');

test('crc32 khớp giá trị chuẩn', () => {
    assert.strictEqual(Zip.crc32(Buffer.from('123456789')), 0xCBF43926);
    assert.strictEqual(Zip.crc32(Buffer.alloc(0)), 0);
});

test('zipDirectory: tar giải nén ra đúng nội dung, tên tiếng Việt, thư mục con', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hpzip-'));
    try {
        const src = path.join(tmp, 'src');
        fs.mkdirSync(path.join(src, 'bin', 'lib'), { recursive: true });
        fs.writeFileSync(path.join(src, 'manifest.json'), '{"a":1}');
        fs.writeFileSync(path.join(src, 'bin', 'lib', 'Đường.txt'), 'xin chào '.repeat(200));
        fs.writeFileSync(path.join(src, 'empty.txt'), '');
        const zipFile = path.join(tmp, 'out.zip');
        fs.writeFileSync(zipFile, Zip.zipDirectory(src, 'x.sdPlugin/'));
        const out = path.join(tmp, 'out');
        fs.mkdirSync(out);
        // Windows: Expand-Archive (.NET, đọc cờ UTF-8 của tên file); nơi khác: tar/bsdtar.
        if (process.platform === 'win32') {
            execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipFile}' -DestinationPath '${out}'`]);
        } else execFileSync('tar', ['-xf', zipFile, '-C', out]);
        assert.strictEqual(fs.readFileSync(path.join(out, 'x.sdPlugin', 'manifest.json'), 'utf8'), '{"a":1}');
        assert.strictEqual(fs.readFileSync(path.join(out, 'x.sdPlugin', 'bin', 'lib', 'Đường.txt'), 'utf8'), 'xin chào '.repeat(200));
        assert.strictEqual(fs.readFileSync(path.join(out, 'x.sdPlugin', 'empty.txt'), 'utf8'), '');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
