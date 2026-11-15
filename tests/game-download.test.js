// node --test tests/game-download.test.js
// 🎮 Game tải riêng (lib/game-download.js): manifest, KEY, SHA-256, chọn nút, bộ cài exe (Sinh Tồn) + gói web zip (HP Đại Chiến).
// Không mạng, không registry: fetch / tìm bản cài / giải nén đều giả.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const G = require('../lib/game-download');

const BODY = Buffer.from('MZ' + 'x'.repeat(5000));
const SHA = crypto.createHash('sha256').update(BODY).digest('hex');
const manifest = (over = {}) => ({ version: '1.1.0', url: 'https://hpvn.media/sinhton/HP-Sinh-Ton-Setup-1.1.0.exe', sha256: SHA, size: BODY.length, notes: 'Bản đầu', ...over });
const EXE = 'HP Sinh Tồn.exe';

// fetch giả: manifest JSON + file chia 3 khúc
function fakeFetch(m, body = BODY) {
    return async (url) => {
        if (url.endsWith('manifest.json')) return { ok: true, json: async () => m };
        const parts = [body.subarray(0, 100), body.subarray(100, 3000), body.subarray(3000)];
        return { ok: true, url, body: (async function* () { for (const p of parts) yield p; })() };
    };
}
function setup(over = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlgame-'));
    const ran = [];
    let installed = null, licensed = true;
    const api = G.createGameDownload({
        id: 'sinhton', kind: 'exe', dir, manifestUrl: 'https://hpvn.media/sinhton/manifest.json',
        fileName: (v) => `HP-Sinh-Ton-Setup-${v}.exe`,
        isLicensed: () => licensed, fetchImpl: fakeFetch(manifest()), findInstalled: async () => installed,
        spawnImpl: (f) => ran.push(path.basename(f)), ...over,
    });
    return { api, dir, ran, setInstalled: (v) => { installed = v; }, setLicensed: (v) => { licensed = v; } };
}

test('validateManifest: chỉ nhận https, SHA-256 đủ 64 ký tự, phiên bản x.y.z, dung lượng hợp lý', () => {
    assert.equal(G.validateManifest(manifest()).version, '1.1.0');
    assert.equal(G.validateManifest(manifest({ url: 'http://hpvn.media/a.exe' })), null);
    assert.equal(G.validateManifest(manifest({ sha256: 'abc' })), null);
    assert.equal(G.validateManifest(manifest({ version: '1.1' })), null);
    assert.equal(G.validateManifest(manifest({ size: 0 })), null);
    assert.equal(G.validateManifest(manifest({ size: 700 * 1048576 })), null);
    assert.equal(G.validateManifest([]), null);
    assert.equal(G.validateManifest(manifest({ notes: '<b>x</b>' })).notes, 'b x /b');
});

test('compareVersions so từng số', () => {
    assert.equal(G.compareVersions('1.10.0', '1.9.9'), 1);
    assert.equal(G.compareVersions('1.1.0', '1.1.0'), 0);
    assert.equal(G.compareVersions('1.0.9', '1.1.0'), -1);
});

test('pickInstalled lấy exe từ DisplayIcon / thư mục cài, bỏ dòng không còn file', () => {
    const exe = 'C:\\Program Files\\HP Sinh Tồn\\HP Sinh Tồn.exe';
    const has = (p) => p === exe;
    assert.deepEqual(G.pickInstalled([{ DisplayVersion: '1.1.0', DisplayIcon: exe + ',0' }], EXE, has), { version: '1.1.0', exe });
    assert.deepEqual(G.pickInstalled([{ DisplayVersion: '1.1.0', DisplayIcon: 'C:\\Program Files\\HP Sinh Tồn\\uninstallerIcon.ico' }], EXE, has), { version: '1.1.0', exe });
    assert.deepEqual(G.pickInstalled([{ DisplayVersion: '1.0.0', UninstallString: '"C:\\Program Files\\HP Sinh Tồn\\Uninstall HP Sinh Tồn.exe" /currentuser' }], EXE, has), { version: '1.0.0', exe });
    assert.equal(G.pickInstalled([{ DisplayVersion: '1.1.0', DisplayIcon: 'D:\\mất\\HP Sinh Tồn.exe,0' }], EXE, has), null);
});

test('chưa có KEY: không đọc manifest, không tải', async () => {
    const t = setup();
    t.setLicensed(false);
    const s = await t.api.checkManifest();
    assert.equal(s.licensed, false);
    assert.equal(s.latest, null);
    await assert.rejects(t.api.download(), /KEY/);
});

test('exe: tải đủ + đúng SHA-256 → nút Cài đặt; trạng thái không bao giờ chứa link tải', async () => {
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

test('exe đã cài cùng bản → Mở game; có bản mới → Cập nhật, tải xong → Cài bản mới, vẫn mở được bản cũ', async () => {
    const t = setup();
    t.setInstalled({ version: '1.1.0', exe: 'C:\\G\\' + EXE });
    await t.api.checkManifest();
    assert.equal(t.api.state().action, 'open');
    assert.deepEqual(await t.api.open(), { ok: true, ran: 'game' });
    t.setInstalled({ version: '1.0.0', exe: 'C:\\G\\' + EXE });
    await t.api.refreshInstalled(true);
    assert.equal(t.api.state().action, 'update');
    await t.api.download();
    assert.equal(t.api.state().action, 'install-update');
    await t.api.openInstalled();
    assert.deepEqual(t.ran, [EXE, EXE]);
});

test('tải dư byte so với khai báo → dừng', async () => {
    const t = setup({ fetchImpl: fakeFetch(manifest({ size: 4000 })) });
    await t.api.checkManifest();
    await assert.rejects(t.api.download(), /lớn hơn/);
});

// ---- gói web (HP Đại Chiến) ----
function webSetup(extract) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlweb-'));
    const opened = [];
    let m = manifest({ url: 'https://hpvn.media/daichien/x.zip' });
    const api = G.createGameDownload({
        id: 'daichien', kind: 'web', entry: 'index.html', dir, manifestUrl: 'https://hpvn.media/daichien/manifest.json',
        fileName: (v) => `hp-dai-chien-web-${v}.zip`,
        fetchImpl: (url, o) => fakeFetch(m)(url, o),
        extract: extract || (async (zip, dest) => { fs.writeFileSync(path.join(dest, 'index.html'), '<h1>' + fs.statSync(zip).size); fs.mkdirSync(path.join(dest, 'src')); }),
        openWeb: async (entry) => opened.push(entry),
    });
    return { api, dir, opened, setManifest: (x) => { m = x; } };
}

test('web: tải + giải nén → Mở game, phục vụ thư mục web-<phiên bản>, không giữ zip; bản mới thay bản cũ', async () => {
    const t = webSetup();
    await t.api.checkManifest();
    assert.equal(t.api.state().action, 'download');
    assert.equal(t.api.webRoot(), null);
    const s = await t.api.download();
    assert.equal(s.action, 'open');
    assert.deepEqual(s.installed, { version: '1.1.0' });
    assert.equal(path.basename(t.api.webRoot()), 'web-1.1.0');
    assert.deepEqual(fs.readdirSync(t.dir).sort(), ['setup.json', 'web-1.1.0']);
    assert.deepEqual(await t.api.open(), { ok: true, ran: 'game' });
    assert.deepEqual(t.opened, ['index.html']);
    t.setManifest(manifest({ version: '1.2.0', url: 'https://hpvn.media/daichien/y.zip' }));
    await t.api.checkManifest();
    assert.equal(t.api.state().action, 'update');
    await t.api.download();
    assert.deepEqual(fs.readdirSync(t.dir).sort(), ['setup.json', 'web-1.2.0']);
    assert.equal(t.api.state().action, 'open');
});

test('web: gói thiếu index.html hoặc có symlink → lỗi, không thay bản đang có', async () => {
    const t = webSetup(async (zip, dest) => { fs.writeFileSync(path.join(dest, 'main.html'), 'x'); });
    await t.api.checkManifest();
    await assert.rejects(t.api.download(), /thiếu index\.html/);
    assert.equal(t.api.webRoot(), null);
    assert.deepEqual(fs.readdirSync(t.dir), []);
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-'));
    fs.writeFileSync(path.join(d, 'a.txt'), 'x');
    let linked = true;
    try { fs.symlinkSync(os.tmpdir(), path.join(d, 'out'), 'junction'); } catch (e) { linked = false; }
    if (linked) assert.throws(() => G.checkTree(d), /đường dẫn lạ/);
});

test('strictFetch chỉ đi https (không mạng)', async () => {
    await assert.rejects(G.strictFetch('http://hpvn.media/sinhton/manifest.json'), /https/);
    await assert.rejects(G.strictFetch('không phải link'));
});
