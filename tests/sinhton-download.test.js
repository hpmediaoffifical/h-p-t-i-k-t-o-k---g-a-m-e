// node --test tests/sinhton-download.test.js
// 🔫 Sinh Tồn tải riêng (lib/sinhton-download.js): manifest, KEY, SHA-256, chọn nút, mở game / bộ cài — không mạng, không registry.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const S = require('../lib/sinhton-download');

const BODY = Buffer.from('MZ' + 'x'.repeat(5000));
const SHA = crypto.createHash('sha256').update(BODY).digest('hex');
const URL_ = 'https://hpvn.media/sinhton/HP-Sinh-Ton-Setup-1.1.0.exe';
const manifest = (over = {}) => ({ version: '1.1.0', url: URL_, sha256: SHA, size: BODY.length, notes: 'Bản đầu', ...over });

// fetch giả: manifest JSON + bộ cài chia 3 khúc
function fakeFetch(m, body = BODY) {
    return async (url) => {
        if (url.endsWith('manifest.json')) return { ok: true, json: async () => m };
        const parts = [body.subarray(0, 100), body.subarray(100, 3000), body.subarray(3000)];
        return { ok: true, url, body: (async function* () { for (const p of parts) yield p; })() };
    };
}
function setup(over = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sinhton-dl-'));
    const ran = [];
    let installed = null, licensed = true;
    const api = S.createSinhTon({
        dir, manifestUrl: 'https://hpvn.media/sinhton/manifest.json',
        isLicensed: () => licensed, fetchImpl: fakeFetch(manifest()), findInstalled: async () => installed,
        spawnImpl: (f) => ran.push(path.basename(f)), ...over,
    });
    return { api, dir, ran, setInstalled: (v) => { installed = v; }, setLicensed: (v) => { licensed = v; } };
}

test('validateManifest: chỉ nhận https, SHA-256 đủ 64 ký tự, phiên bản x.y.z, dung lượng hợp lý', () => {
    assert.equal(S.validateManifest(manifest()).version, '1.1.0');
    assert.equal(S.validateManifest(manifest({ url: 'http://hpvn.media/a.exe' })), null);
    assert.equal(S.validateManifest(manifest({ sha256: 'abc' })), null);
    assert.equal(S.validateManifest(manifest({ version: '1.1' })), null);
    assert.equal(S.validateManifest(manifest({ size: 0 })), null);
    assert.equal(S.validateManifest(manifest({ size: 700 * 1048576 })), null);
    assert.equal(S.validateManifest([]), null);
    assert.equal(S.validateManifest(manifest({ notes: '<b>x</b>' })).notes, 'b x /b');
});

test('compareVersions so từng số', () => {
    assert.equal(S.compareVersions('1.10.0', '1.9.9'), 1);
    assert.equal(S.compareVersions('1.1.0', '1.1.0'), 0);
    assert.equal(S.compareVersions('1.0.9', '1.1.0'), -1);
});

test('pickInstalled lấy exe từ DisplayIcon / thư mục cài, bỏ dòng không còn file', () => {
    const exe = 'C:\\Program Files\\HP Sinh Tồn\\HP Sinh Tồn.exe';
    const has = (p) => p === exe;
    assert.deepEqual(S.pickInstalled([{ DisplayVersion: '1.1.0', DisplayIcon: exe + ',0' }], has), { version: '1.1.0', exe });
    assert.deepEqual(S.pickInstalled([{ DisplayVersion: '1.1.0', DisplayIcon: 'C:\\Program Files\\HP Sinh Tồn\\uninstallerIcon.ico' }], has), { version: '1.1.0', exe });
    assert.deepEqual(S.pickInstalled([{ DisplayVersion: '1.0.0', UninstallString: '"C:\\Program Files\\HP Sinh Tồn\\Uninstall HP Sinh Tồn.exe" /currentuser' }], has), { version: '1.0.0', exe });
    assert.equal(S.pickInstalled([{ DisplayVersion: '1.1.0', DisplayIcon: 'D:\\mất\\HP Sinh Tồn.exe,0' }], has), null);
});

test('chưa có KEY: không đọc manifest, không tải', async () => {
    const t = setup();
    t.setLicensed(false);
    const s = await t.api.checkManifest();
    assert.equal(s.licensed, false);
    assert.equal(s.latest, null);
    await assert.rejects(t.api.download(), /KEY/);
});

test('tải đủ + đúng SHA-256 → nút Cài đặt; trạng thái không bao giờ chứa link tải', async () => {
    const t = setup();
    let s = await t.api.checkManifest();
    assert.equal(s.action, 'download');
    assert.deepEqual(s.latest, { version: '1.1.0', size: BODY.length, notes: 'Bản đầu' });
    s = await t.api.download();
    assert.equal(s.download.status, 'done');
    assert.equal(s.action, 'install');
    assert.ok(!JSON.stringify(s).includes('hpvn.media'), 'state lộ link tải');
    assert.deepEqual(fs.readdirSync(t.dir).sort(), ['HP-Sinh-Ton-Setup-1.1.0.exe', 'setup.json']);
    assert.deepEqual(await t.api.open(), { ok: true, ran: 'installer' });
    assert.deepEqual(t.ran, ['HP-Sinh-Ton-Setup-1.1.0.exe']);
});

test('SHA-256 sai → báo lỗi, không để lại file', async () => {
    const t = setup({ fetchImpl: fakeFetch(manifest(), Buffer.from('MZ' + 'y'.repeat(5000))) });
    await t.api.checkManifest();
    await assert.rejects(t.api.download(), /SHA-256/);
    assert.equal(t.api.state().download.status, 'error');
    assert.deepEqual(fs.readdirSync(t.dir), []);
});

test('bộ cài bị sửa sau khi tải → không chạy', async () => {
    const t = setup();
    await t.api.checkManifest();
    await t.api.download();
    const f = path.join(t.dir, 'HP-Sinh-Ton-Setup-1.1.0.exe');
    const buf = fs.readFileSync(f); buf[10] = 0x41; fs.writeFileSync(f, buf);
    await assert.rejects(t.api.open(), /hỏng/);
    assert.deepEqual(t.ran, []);
});

test('đã cài cùng bản → Mở game; manifest có bản mới → Cập nhật, tải xong → Cài bản mới, vẫn mở được bản cũ', async () => {
    const t = setup();
    t.setInstalled({ version: '1.1.0', exe: 'C:\\G\\HP Sinh Tồn.exe' });
    await t.api.checkManifest();
    assert.equal(t.api.state().action, 'open');
    assert.deepEqual(await t.api.open(), { ok: true, ran: 'game' });
    t.setInstalled({ version: '1.0.0', exe: 'C:\\G\\HP Sinh Tồn.exe' });
    await t.api.refreshInstalled(true);
    assert.equal(t.api.state().action, 'update');
    await t.api.download();
    assert.equal(t.api.state().action, 'install-update');
    await t.api.openInstalled();
    assert.deepEqual(t.ran, ['HP Sinh Tồn.exe', 'HP Sinh Tồn.exe']);
});

test('tải dư byte so với khai báo → dừng', async () => {
    const t = setup({ fetchImpl: fakeFetch(manifest({ size: 4000 })) });
    await t.api.checkManifest();
    await assert.rejects(t.api.download(), /lớn hơn/);
});
