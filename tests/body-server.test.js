// 🧪 lib/body-server.js (🧍 Bộ Tách Người): cấu hình một hồ sơ + quà mẫu, quà → body:play / body:run (luôn chạy ngay), ▶ Thử /
// ⏹ Ngưng, file mẫu thiếu, tải file lên + /api/body/file chỉ trong thư mục cho phép, và chạy thật trên express (cổng ngẫu nhiên).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const BS = require('../lib/body-server.js');
const B = require('../public/games/body/core.js');

const apis = [];
test.after(() => { for (const a of apis) a._test.stop(); });

function harness({ config, enabled = true, trusted = true } = {}) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpal-body-'));
    const routes = {}, sent = [];
    const app = { get: (p, ...f) => { routes['GET ' + p] = f[f.length - 1]; }, post: (p, ...f) => { routes['POST ' + p] = f; } };
    const io = { to() { return this; }, emit: (ev, d) => sent.push([ev, d]), on() {} };
    let cfg = config, saves = 0;
    const api = BS.installBody({
        app, io, express: { raw: () => (req, res, next) => next() }, path, dataDir,
        getConfig: () => cfg, setConfig: c => { cfg = c; }, saveConfig: () => { saves++; },
        obsBridge: null, touchplayFeed: null, gameEnabled: () => enabled, logger: { log() {}, warn() {} },
        isTrusted: () => trusted
    });
    apis.push(api);
    const call = (key, body = {}, extra = {}) => {
        let out = null, code = 200;
        const res = { json: d => { out = d; return res; }, status: c => { code = c; return res; }, end: () => { out = out || {}; return res; },
            sendFile: (p, o, cb) => { out = { file: p }; if (typeof cb === 'function') cb(); else if (typeof o === 'function') o(); return res; }, setHeader() {} };
        const req = { body, query: extra.query || {}, params: extra.params || {}, headers: extra.headers || {}, socket: { remoteAddress: '127.0.0.1' } };
        const fns = [].concat(routes[key]);
        fns[fns.length - 1](req, res);
        return { ...(out || {}), _code: code };
    };
    return { api, routes, sent, call, cfg: () => cfg, set: c => { cfg = c; }, saves: () => saves, dataDir };
}
const gift = (o = {}) => ({ uniqueId: 'an', nickname: 'An', profilePicture: '', giftId: '5655', giftName: 'Rose', giftImage: '', coinValue: 1, repeatCount: 1, source: 'tiktok', ...o });

test('cấu hình: MỘT hồ sơ "Mọi NPC", kịch bản không gắn hồ sơ, KHÔNG tự gắn quà mẫu (theo NPC be67192); cài là ghi lại bản chuẩn', () => {
    const d = BS.defaultConfig();
    assert.equal(d.profiles.length, 1);
    assert.equal(d.profiles[0].groupId, '');
    assert.equal(d.roiho.scripts[0].gifts.length, 0, 'máy mới: game chưa gắn quà (quà mẫu trùng quà game khác)');
    const many = BS.normalizeConfig({ profiles: [{ id: 'a', groupId: 'g1', scale: 70 }, { id: 'b' }], roiho: { scripts: [{ id: 'k', profileId: 'b', gifts: [{ giftId: '1' }] }] } });
    assert.deepEqual(many.profiles.map(p => [p.id, p.groupId, p.scale]), [['a', '', 70]]);
    assert.equal(many.roiho.scripts[0].profileId, '');
    assert.deepEqual(many.roiho.scripts[0].gifts.map(g => g.giftId), ['1']);
    assert.equal(many.vidfx.scripts.filter(s => s.gifts.length).length, 0, 'đã gắn quà → không gieo thêm');
    const h = harness({ config: undefined });
    assert.equal(h.cfg().profiles.length, 1);
    assert.equal(h.saves(), 1);
    const h2 = harness({ config: BS.defaultConfig() });
    assert.equal(h2.saves(), 0, 'đã chuẩn → không ghi lại');
    assert.ok(BS.explicitGifts(d).some(g => g.giftId === '7934'), 'explicitGifts có Heart Me');
});

test('quà → chạy NGAY: Hậu Cảnh body:play + hành động body:run (tặng bao nhiêu chạy bấy nhiêu); game tắt / không chọn chơi → im', () => {
    const c = BS.normalizeConfig({ comboMax: 3, haucanh: { comboMax: 2, items: [{ id: 'h1', name: 'Nền', file: '/media/a.webm', gifts: [{ giftId: '5655' }] }] },
        roiho: { scripts: [{ id: 'k1', gifts: [{ giftId: '5655' }] }] }, biduoi: { scripts: [{ id: 'b1', videos: [{ file: '/media/x.mp4' }], gifts: [{ giftId: '5655' }] }] } });
    const h = harness({ config: c });
    const out = h.api.handleGift(gift({ repeatCount: 9 }));
    assert.deepEqual(out.map(x => [x.kind, x.id, x.qty, x.ok]), [['haucanh', 'h1', 9, true], ['roiho', 'k1', 9, true], ['biduoi', 'b1', 9, true]]);
    const play = h.sent.find(([e]) => e === 'body:play')[1];
    assert.deepEqual([play.itemId, play.qty, play.nickname, play.profileId], ['h1', 9, 'An', h.cfg().profiles[0].id]);
    const runs = h.sent.filter(([e]) => e === 'body:run').map(([, d]) => d);
    assert.deepEqual(runs.map(r => [r.kind, r.scriptId, r.videoIdx, r.qty]), [['roiho', 'k1', -1, 9], ['biduoi', 'b1', 0, 9]]);
    assert.equal(h.api.handleGift(gift({ repeatCount: 5000 }))[0].qty, 999, 'trần an toàn 999 lượt');
    assert.equal(runs.some(r => r.rowId), false, 'không có mã hàng Danh sách hiệu ứng');
    assert.deepEqual(h.api.handleGift(gift({ giftId: '999' })), []);
    const off = harness({ config: { ...c, enabled: false } });
    assert.deepEqual(off.api.handleGift(gift()), []);
    const notPlaying = harness({ config: c, enabled: false });
    assert.deepEqual(notPlaying.api.handleGift(gift()), []);
    assert.equal(notPlaying.sent.length, 0);
    // 💗 Heart Me mặc định
    const hh = harness({ config: BS.defaultConfig() });
    hh.api.handleGift(gift({ giftId: '7934' }));
    assert.ok(hh.sent.some(([e, d]) => e === 'body:run' && d.kind === 'heart'));
});

test('▶ Thử / ⏹ Ngưng: từng loại; kind lạ → 400; Bị Đuổi chỉ định video', () => {
    const h = harness({ config: BS.defaultConfig() });
    for (const kind of B.KINDS) {
        const r = h.call('POST /api/body/test', { kind });
        assert.equal(r.ok, true, kind + ' ' + JSON.stringify(r));
        assert.equal(h.sent.at(-1)[1].kind, kind);
    }
    assert.equal(h.call('POST /api/body/test', { kind: 'haucanh' }).ok, true);
    assert.equal(h.sent.at(-1)[0], 'body:play');
    assert.equal(h.call('POST /api/body/test', { kind: 'xx' })._code, 400);
    const bd = harness({ config: BS.normalizeConfig({ biduoi: { scripts: [{ id: 'b', videos: [{ file: '/media/1.mp4' }, { file: '/media/2.mp4' }] }] } }) });
    assert.equal(bd.call('POST /api/body/test', { kind: 'biduoi', id: 'b', videoIdx: 1 }).videoIdx, 1);
    const st = h.call('POST /api/body/stop', { kind: 'cry', id: 'cr1' });
    assert.deepEqual([st.ok, h.sent.at(-1)[0], h.sent.at(-1)[1].kind], [true, 'body:stop', 'cry']);
    assert.equal(h.call('POST /api/body/stop', { kind: 'nope' })._code, 400);
});

test('📦 file mẫu: mọi mẫu giao kèm có thật; mẫu thiếu → ▶ Thử báo lỗi, quà bỏ qua, /api/body/meta liệt kê', () => {
    assert.deepEqual(BS.missingSamples(BS.defaultConfig()), [], 'đủ video / ảnh / nhạc mẫu trong public/games/body/samples');
    for (const t of B.vidFxTemplates()) for (const f of [t.file, t.bgFile, t.sfxFile].filter(Boolean)) assert.ok(fs.existsSync(path.join(__dirname, '../public', f)), f);
    const c = BS.normalizeConfig({ vidfx: { tplV: 99, scripts: [{ id: 'v', motion: 'blast', file: '/games/body/samples/khong-co.webm', gifts: [{ giftId: '77' }] }] } });
    const h = harness({ config: c });
    const r = h.call('POST /api/body/test', { kind: 'vidfx', id: 'v' });
    assert.equal(r.ok, false);
    assert.match(r.error, /khong-co\.webm/);
    const before = h.sent.length;
    const out = h.api.handleGift(gift({ giftId: '77' }));
    assert.deepEqual([out[0].ok, h.sent.length], [false, before]);
    const meta = h.call('GET /api/body/meta');
    assert.ok(meta.missingSamples.includes('/games/body/samples/khong-co.webm'));
    assert.deepEqual([meta.groups, meta.activeProfileId], [[], h.cfg().profiles[0].id]);
});

test('📁 tải file lên <dataDir>/body-assets → /api/body/asset; /api/body/file chỉ file đã tải / đã đăng ký, chỉ máy này', () => {
    const h = harness({ config: BS.defaultConfig() });
    const up = h.call('POST /api/body/upload', Buffer.from('abc'), { headers: { 'x-file-name': encodeURIComponent('Hồ ly đẹp.pack.mp4') } });
    assert.equal(up.ok, true);
    assert.match(up.url, /^\/api\/body\/asset\/\d+-Ho-ly-dep\.pack\.mp4$/);
    const fn = decodeURIComponent(up.url.split('/').pop());
    assert.ok(fs.existsSync(path.join(h.dataDir, 'body-assets', fn)));
    assert.equal(h.call('GET /api/body/asset/:fn', {}, { params: { fn } }).file, path.join(h.dataDir, 'body-assets', fn));
    assert.equal(h.call('GET /api/body/asset/:fn', {}, { params: { fn: '../app-config.json' } })._code, 404);
    assert.equal(h.call('POST /api/body/upload', Buffer.from('x'), { headers: { 'x-file-name': 'a.exe' } })._code, 400);
    assert.equal(h.call('POST /api/body/upload', Buffer.alloc(0), { headers: { 'x-file-name': 'a.mp4' } })._code, 400);
    const inAssets = path.join(h.dataDir, 'body-assets', fn);
    assert.equal(h.call('GET /api/body/file', {}, { query: { path: inAssets } }).file, path.resolve(inAssets));
    const outside = path.join(h.dataDir, 'khac.mp4');
    fs.writeFileSync(outside, 'x');
    assert.equal(h.call('GET /api/body/file', {}, { query: { path: outside } })._code, 403);
    assert.equal(h.call('GET /api/body/file', {}, { query: { path: path.join(h.dataDir, 'app-config.json') } })._code, 400);   // không phải video / ảnh
    assert.equal(h.call('POST /api/body/test-video', { path: outside }).ok, true);
    assert.equal(h.call('GET /api/body/file', {}, { query: { path: outside } }).file, path.resolve(outside));
    assert.equal(h.call('POST /api/body/test-video', { path: '\\\\may-khac\\share\\a.mp4' })._code, 400);
    const lan = harness({ config: BS.defaultConfig(), trusted: false });
    assert.equal(lan.call('GET /api/body/file', {}, { query: { path: inAssets } })._code, 403);
    assert.equal(lan.call('POST /api/body/upload', Buffer.from('abc'), { headers: { 'x-file-name': 'a.mp4' } })._code, 403);
});

test('chạy thật trên express: /overlay/body, /api/body/meta, /api/body/test (cổng ngẫu nhiên)', async () => {
    const app = express();
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '..', 'public')));
    const sent = [];
    const io = { to() { return this; }, emit: (ev, d) => sent.push([ev, d]), on() {} };
    let cfg;
    const api = BS.installBody({ app, io, express, path, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'hpal-body-')),
        getConfig: () => cfg, setConfig: c => { cfg = c; }, saveConfig() {}, logger: { log() {}, warn() {} } });
    apis.push(api);
    const srv = http.createServer(app);
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + srv.address().port;
    try {
        const ov = await fetch(base + '/overlay/body');
        assert.equal(ov.status, 200);
        assert.match(await ov.text(), /Bộ Tách Người|HpBody/);
        for (const p of ['/games/body/core.js', '/games/biduoi/core.js', '/games/haucanh/core.js', '/games/body/fx-vidfx.mjs', '/lib/hp-person-seg.mjs',
            '/lib/mediapipe/selfie_segmenter.tflite', '/games/body/samples/ninja.webm', '/games/body/fonts/bungee.css']) assert.equal((await fetch(base + p)).status, 200, p);
        const meta = await (await fetch(base + '/api/body/meta')).json();
        assert.deepEqual(meta.missingSamples, []);
        const t = await (await fetch(base + '/api/body/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'morph' }) })).json();
        assert.equal(t.ok, true);
        assert.equal(sent.at(-1)[1].kind, 'morph');
        const up = await (await fetch(base + '/api/body/upload', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': 'nen.webm' }, body: Buffer.from('webm') })).json();
        assert.equal(up.ok, true);
        assert.equal(await (await fetch(base + up.url)).text(), 'webm');
    } finally { await new Promise(r => srv.close(r)); }
});

test('overlay + panel: tên sự kiện feed của app (touchplay:*), khoá localStorage hpal.*, không còn bộ chọn quà NPC / Danh sách hiệu ứng', () => {
    const dir = path.join(__dirname, '../public/games/body');
    const ov = fs.readFileSync(path.join(dir, 'overlay.html'), 'utf8');
    const panel = fs.readFileSync(path.join(dir, 'body-panel.js'), 'utf8');
    for (const s of [ov, panel]) { assert.ok(!s.includes('camfeed:'), 'camfeed:'); assert.ok(!s.includes('hpnpc.'), 'hpnpc.'); assert.ok(!/['"`]\/glassets\//.test(s), '/glassets/'); }
    for (const ev of ['touchplay:feed', 'touchplay:frame', 'touchplay:layout', 'touchplay:feedStatus', 'touchplay:overlayStat', 'touchplay:boost']) assert.ok(ov.includes(`'${ev}'`), ev);
    assert.ok(!panel.includes('HpBoardGiftPicker'));
    assert.ok(panel.includes("fetch('/api/gifts')"));
    assert.ok(panel.includes("'/api/body/upload'"));
    assert.ok(panel.includes("hpOpenGame('camgames')"));
    assert.ok(panel.includes('window.HpBodyPanel = { open'));
});
