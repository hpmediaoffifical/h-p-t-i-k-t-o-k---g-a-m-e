// node --test tests/security-hardening.test.js
// Hồi quy cho các đầu mối audit bảo mật (run-1): DNS rebinding (Host), backup/export lộ bí mật,
// feed camera cho socket lạ, shell.openExternal mọi scheme, lua-sync tải qua http, XSS tên người xem ở Timer.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

const ROOT = path.join(__dirname, '..');
const NetGuard = require('../lib/net-guard');

test('isAllowedHost: tên của máy này hợp lệ, tên miền lạ (DNS rebinding) bị chặn', () => {
    const o = { localHosts: ['hpaction.obs'], lan: false, lanHosts: ['192.168.1.5'] };
    for (const h of ['localhost:3000', 'LOCALHOST', '127.0.0.1:3000', '127.8.9.1', '[::1]:3000', 'hpaction.obs:3000', 'localhost.', undefined, ''])
        assert.equal(NetGuard.isAllowedHost(h, o), true, String(h));
    for (const h of ['evil.example:3000', 'localhost.evil.example', '127.0.0.1.nip.io', '192.168.1.5:3000', '[::2]:3000', 'hpaction.obs.evil'])
        assert.equal(NetGuard.isAllowedHost(h, o), false, String(h));
    // LAN bật: IP LAN của máy này hợp lệ, IP khác vẫn không.
    assert.equal(NetGuard.isAllowedHost('192.168.1.5:3000', { ...o, lan: true }), true);
    assert.equal(NetGuard.isAllowedHost('192.168.1.6:3000', { ...o, lan: true }), false);
});

test('redactBackupConfig: bỏ token LAN, mật khẩu OBS, key bản quyền, sign API key; không đụng bản gốc', () => {
    const cfg = {
        network: { lanAccess: true, token: 'T' }, obsBridge: { host: 'x', password: 'P' },
        license: { key: 'K', savedKey: 'K2', role: 'VIP' }, tiktokSignApiKey: 'S',
        shareTokens: { thuytinh: 'uuid' }, games: { thuytinh: { enabled: true } }
    };
    const r = NetGuard.redactBackupConfig(cfg);
    assert.equal(r.network.token, undefined);
    assert.equal(r.obsBridge.password, undefined);
    assert.equal(r.license.key, undefined);
    assert.equal(r.license.savedKey, undefined);
    assert.equal(r.tiktokSignApiKey, undefined);
    assert.equal(r.shareTokens, undefined);
    assert.equal(r.network.lanAccess, true);
    assert.equal(r.license.role, 'VIP');
    assert.deepEqual(r.games, cfg.games);
    assert.equal(cfg.network.token, 'T');
    assert.equal(cfg.obsBridge.password, 'P');
    assert.doesNotMatch(JSON.stringify(r), /"(T|P|K|K2|S)"/);
});

test('isSafeExternalUrl: chỉ http/https', () => {
    assert.equal(NetGuard.isSafeExternalUrl('https://hpvn.media/x'), true);
    assert.equal(NetGuard.isSafeExternalUrl('http://localhost:3000/tracker/a'), true);
    for (const u of ['file:///C:/Windows/System32/calc.exe', 'ms-settings:', 'search-ms:query=x', 'smb://host/share', 'javascript:alert(1)', 'not a url', '', null])
        assert.equal(NetGuard.isSafeExternalUrl(u), false, String(u));
});

test('server.js: chặn Host lạ trước mọi route + socket.io; backup/export che bí mật; phòng feed chỉ cho socket tin cậy', () => {
    const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    const hostMw = src.indexOf("if (!hostAllowed(req.headers.host)) return res.status(403)");
    assert.ok(hostMw > 0, 'thiếu middleware Host');
    for (const later of ["app.use(express.static", "app.get('/api/backup/export'", "app.get('/api/obs-bridge/config'", "app.get('/api/license/status'"]) {
        const i = src.indexOf(later);
        assert.ok(i > hostMw, `${later} phải đăng ký SAU middleware Host`);
    }
    assert.match(src, /allowRequest:[\s\S]{0,200}hostAllowed\(req\.headers\.host\)/);
    const exp = src.slice(src.indexOf("app.get('/api/backup/export'"), src.indexOf("app.post('/api/backup/import'"));
    assert.match(exp, /requestIsTrusted\(req\)/);
    assert.match(exp, /trusted \? appConfig : NetGuard\.redactBackupConfig\(appConfig\)/);
    const sub = src.slice(src.indexOf("socket.on('subscribe'"), src.indexOf("socket.on('subscribe'") + 800);
    assert.match(sub, /TOUCHPLAY_FEED_ROOM[\s\S]*socket\.data\.trusted !== true\) return;[\s\S]*socket\.join\(roomName\)/);
});

test('ObsCameraFeed.attach: socket không tin cậy không vào được phòng hình camera', () => {
    const { ObsCameraFeed } = require('../lib/touchplay-obs-feed');
    const io = { sockets: { adapter: { rooms: new Map() }, sockets: new Map() }, to: () => ({ emit() {} }) };
    const feed = new ObsCameraFeed({ bridge: { connected: false }, io, getOptions: () => ({ source: '', enabled: true }) });
    const mk = trusted => {
        const s = { data: { trusted }, joined: [], handlers: {}, on(e, f) { this.handlers[e] = f; }, join(r) { this.joined.push(r); }, leave() {}, emit() {} };
        feed.attach(s); return s;
    };
    const bad = mk(false); bad.handlers['touchplay:feed'](true); bad.handlers['touchplay:feed']({ id: 'bancung' });
    assert.deepEqual(bad.joined, []);
    const good = mk(true); good.handlers['touchplay:feed'](true);
    assert.deepEqual(good.joined, ['touchplay:feed', 'touchplay:feed:frames']);
});

test('electron-main.js: mọi window-open handler qua openExternalSafe (không gọi thẳng shell.openExternal(url))', () => {
    const src = fs.readFileSync(path.join(ROOT, 'electron-main.js'), 'utf8');
    // shell.openExternal(url) chỉ còn đúng 1 chỗ: bên trong openExternalSafe, sau isSafeExternalUrl.
    assert.equal((src.match(/shell\.openExternal\(url\)/g) || []).length, 1);
    assert.equal(/function openExternalSafe\(url\) \{\s*if \(isSafeExternalUrl\(url\)\) shell\.openExternal\(url\)/.test(src), true);
    assert.ok((src.match(/openExternalSafe\(url\)/g) || []).length >= 8);
    assert.equal(/url\.startsWith\(APP_URL\)\)/.test(src), false);
});

test('LuaSync._fetch: từ chối http:// và redirect hạ cấp https → http', async (t) => {
    const https = require('https'), http = require('http');
    const { LuaSync } = require('../lib/lua-sync');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-luasync-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const ls = new LuaSync({ cacheDir: dir, logger: { log() {}, warn() {}, error() {} } });

    const origHttps = https.get, origHttp = http.get;
    let httpCalls = 0; const httpsUrls = [];
    http.get = () => { httpCalls++; throw new Error('http.get không được gọi'); };
    https.get = (url, opts, cb) => {
        httpsUrls.push(String(url));
        const req = new EventEmitter(); req.destroy = () => {};
        const res = new EventEmitter(); res.resume = () => {};
        res.statusCode = 302; res.headers = { location: 'http://evil.example/x.lua' };
        process.nextTick(() => cb(res));
        return req;
    };
    t.after(() => { https.get = origHttps; http.get = origHttp; });

    await assert.rejects(ls._fetch('http://example.com/manifest.json'), /https/);
    await assert.rejects(ls._fetch('file:///C:/x.lua'), /https/);
    await assert.rejects(ls._fetch('https://example.com/manifest.json'), /https/);
    assert.deepEqual(httpsUrls, ['https://example.com/manifest.json']);
    assert.equal(httpCalls, 0);
});

test('timer.html: tên người xem / tên quà không vào innerHTML thô', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public', '_prototype', 'timer.html'), 'utf8');
    const logFn = src.slice(src.indexOf('function log(msg, cls)'), src.indexOf('function readDurationFromInputs'));
    assert.match(logFn, /line\.textContent = /);
    assert.doesNotMatch(logFn, /innerHTML/);
    const render = src.slice(src.indexOf('function renderUserList()'), src.indexOf('function updateMetaPanel()'));
    assert.doesNotMatch(render, /\$\{u\.(nickname|giftName|avatar|giftImage|repeat)\}/);
    assert.match(render, /escAttr\(u\.nickname\)/);
    assert.match(render, /escAttr\(u\.giftName\)/);

    // Chạy thật renderUserList với tên độc: không sinh ra thẻ <img onerror> từ dữ liệu người xem.
    const escSrc = src.slice(src.indexOf('const escAttr ='), src.indexOf('const pad2'));
    const ul = { innerHTML: '' };
    const state = { userHistory: [{ nickname: '<img src=x onerror=alert(1)>"', giftName: '<b>Rose</b>', avatar: '" onerror="alert(2)', giftImage: '', repeat: 1, delta: 5, coins: 1, ts: 0 }] };
    const fn = new Function('state', '$', `${escSrc}\n${render}\nrenderUserList();`);
    fn(state, () => ul);
    assert.doesNotMatch(ul.innerHTML, /<img src=x/);
    assert.doesNotMatch(ul.innerHTML, /<b>Rose/);
    assert.doesNotMatch(ul.innerHTML, /src="" onerror="alert\(2\)/);
    assert.match(ul.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;&quot;/);
});
