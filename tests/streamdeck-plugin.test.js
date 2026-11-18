const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');

const PLUGIN = path.join(__dirname, '..', 'streamdeck', 'media.hpvn.actionlive.sdPlugin');
const Keys = require(path.join(PLUGIN, 'bin', 'lib', 'keys.js'));
const Icons = require(path.join(PLUGIN, 'bin', 'lib', 'icons.js'));
const AppClient = require(path.join(PLUGIN, 'bin', 'lib', 'app-client.js'));
const WsClient = require(path.join(PLUGIN, 'bin', 'lib', 'ws-client.js'));
const manifest = require(path.join(PLUGIN, 'manifest.json'));

const catalog = {
    games: [{ id: 'caro', name: 'Caro Đối Đầu' }, { id: 'bancung', name: 'Bắn Cung', locked: true }],
    gifts: [{ id: '5655', name: 'Rose', coins: 1 }],
    hotkeys: [{ id: 'duongveque', name: 'Đường Về Quê', keys: [{ key: 'jump', label: 'Nhảy' }] },
              { id: 'caption', name: 'Phụ đề', keys: [{ key: 'toggle', label: 'Nghe / Dừng' }] }],
};
const state = { live: { connected: true, username: 'hpmedia' }, games: { caro: { on: true }, bancung: { on: false, locked: true }, duongveque: { on: false } }, caption: { status: 'listening' } };

test('manifest: UUID hành động khớp KIND_BY_UUID, có tiền tố plugin, ảnh tồn tại', () => {
    const fs = require('fs');
    assert.strictEqual(path.basename(PLUGIN), manifest.UUID + '.sdPlugin');
    assert.deepStrictEqual(manifest.Actions.map(a => a.UUID).sort(), Object.keys(Keys.KIND_BY_UUID).sort());
    for (const a of manifest.Actions) {
        assert.ok(a.UUID.startsWith(manifest.UUID + '.'));
        assert.ok(fs.existsSync(path.join(PLUGIN, a.Icon + '.svg')), a.Icon);
        assert.ok(fs.existsSync(path.join(PLUGIN, a.States[0].Image + '.svg')), a.States[0].Image);
    }
    assert.ok(fs.existsSync(path.join(PLUGIN, manifest.CodePath)));
    assert.ok(fs.existsSync(path.join(PLUGIN, manifest.PropertyInspectorPath)));
});

// Luật lấy từ schema chính thức schemas.elgato.com/streamdeck/plugins/manifest.json (SDK 2).
test('manifest: đúng luật schema Elgato (trường bắt buộc, Version 4 số, UUID, icon plugin PNG, Nodejs, State)', () => {
    const fs = require('fs');
    for (const k of ['Actions', 'Author', 'CodePath', 'Description', 'Icon', 'Name', 'OS', 'SDKVersion', 'Software', 'UUID', 'Version']) assert.ok(k in manifest, k);
    assert.match(manifest.Version, /^(0|[1-9]\d*)(\.(0|[1-9]\d*)){3}$/);
    assert.match(manifest.UUID, /^([a-z0-9-]+)(\.[a-z0-9-]+)+$/);
    assert.strictEqual(manifest.SDKVersion, 2);
    assert.deepStrictEqual(manifest.Nodejs, { Version: '20' });
    // Icon plugin: chỉ PNG, 256 + @2x 512
    assert.ok(fs.existsSync(path.join(PLUGIN, manifest.Icon + '.png')));
    assert.ok(fs.existsSync(path.join(PLUGIN, manifest.Icon + '@2x.png')));
    assert.ok(!fs.existsSync(path.join(PLUGIN, manifest.Icon + '.svg')));
    const STATE_KEYS = ['FontFamily', 'FontSize', 'FontStyle', 'FontUnderline', 'Image', 'MultiActionImage', 'Name', 'ShowTitle', 'Title', 'TitleAlignment', 'TitleColor'];
    for (const a of manifest.Actions) {
        for (const k of ['Icon', 'Name', 'States', 'UUID']) assert.ok(k in a, a.UUID + ' ' + k);
        assert.match(a.UUID, /^([a-z0-9-]+)(\.[a-z0-9-]+)+$/);
        for (const s of a.States) for (const k of Object.keys(s)) assert.ok(STATE_KEYS.includes(k), a.UUID + ' State.' + k);
        for (const c of a.Controllers || []) assert.ok(['Keypad', 'Encoder'].includes(c));
    }
});

test('keyView: app chưa chạy → cảnh báo cho mọi loại nút', () => {
    for (const kind of ['game', 'live', 'gift', 'chat', 'hotkey']) {
        const v = Keys.keyView(kind, {}, { online: false });
        assert.strictEqual(v.glyph, 'warn');
        assert.strictEqual(v.label, 'HP chưa chạy');
    }
});

test('keyView: game bật xanh, game khoá KEY, chưa chọn game', () => {
    const on = Keys.keyView('game', { gameId: 'caro' }, { state, catalog, online: true });
    assert.deepStrictEqual([on.bg, on.sub, on.dim], [Keys.COLORS.on, 'ĐANG BẬT', false]);
    const off = Keys.keyView('game', { gameId: 'caro' }, { state: { games: { caro: { on: false } } }, catalog, online: true });
    assert.deepStrictEqual([off.bg, off.sub, off.dim], [Keys.COLORS.off, 'ĐANG TẮT', true]);
    assert.strictEqual(Keys.keyView('game', { gameId: 'bancung' }, { state, catalog, online: true }).glyph, 'lock');
    assert.strictEqual(Keys.keyView('game', {}, { state, catalog, online: true }).label, 'Chọn game');
});

test('keyView: LIVE đỏ / đang nối cam / chưa LIVE xám', () => {
    assert.strictEqual(Keys.keyView('live', {}, { state, catalog, online: true }).bg, Keys.COLORS.live);
    assert.strictEqual(Keys.keyView('live', {}, { state: { live: { connecting: true } }, catalog, online: true }).bg, Keys.COLORS.connecting);
    const idle = Keys.keyView('live', { username: '@abc' }, { state: { live: {} }, catalog, online: true });
    assert.deepStrictEqual([idle.bg, idle.sub], [Keys.COLORS.off, '@abc']);
});

test('keyView: quà/bình luận/phím — tên, số lượng, phụ đề đang nghe, game tắt mờ', () => {
    assert.deepStrictEqual(Keys.keyView('gift', { giftId: '5655', count: 500 }, { state, catalog, online: true }).sub, 'Thả thử ×99');
    assert.strictEqual(Keys.keyView('gift', {}, { state, catalog, online: true }).label, 'Quà ngẫu nhiên');
    assert.strictEqual(Keys.keyView('chat', { comment: '111' }, { state, catalog, online: true }).label, '111');
    const cap = Keys.keyView('hotkey', { group: 'caption', key: 'toggle' }, { state, catalog, online: true });
    assert.deepStrictEqual([cap.bg, cap.sub], [Keys.COLORS.live, 'ĐANG NGHE']);
    const dvq = Keys.keyView('hotkey', { group: 'duongveque', key: 'jump' }, { state, catalog, online: true });
    assert.deepStrictEqual([dvq.label, dvq.dim], ['Nhảy', true]);
    assert.strictEqual(Keys.keyView('hotkey', { group: 'duongveque', key: 'gone' }, { state, catalog, online: true }).label, 'Chọn phím');
});

test('runCommand: chỉ mang trường của loại nút', () => {
    assert.deepStrictEqual(Keys.runCommand('gift', { giftId: '1', count: 2, comment: 'x' }), { kind: 'gift', giftId: '1', count: 2 });
    assert.strictEqual(Keys.runCommand('nope', {}), null);
});

test('renderSvg: escape chữ, màu lạ bị thay, có 2 dòng chữ', () => {
    const svg = Icons.renderSvg({ bg: 'red;"><script>', glyph: 'power', label: '<b>&"x', sub: "a'b" });
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
    assert.ok(!svg.includes('<script>') && !svg.includes('<b>'));
    assert.ok(svg.includes('&lt;b&gt;&amp;&quot;x') && svg.includes('a&#39;b'));
    assert.ok(svg.includes('fill="#3f3f46"'));
    assert.strictEqual((svg.match(/<text /g) || []).length, 2);
    assert.ok(Icons.toDataUri(svg).startsWith('data:image/svg+xml;charset=utf8,<svg'));
});

test('SSE parser: gộp nhiều dòng data, bỏ chú thích, chịu chunk cắt giữa chừng', () => {
    const feed = AppClient.createSseParser();
    assert.deepStrictEqual(feed(': ping\n\nevent: state\nda'), []);
    assert.deepStrictEqual(feed('ta: {"a":1}\n\nretry: 2000\n\ndata: x\ndata: y\r\n\r\n'), [{ event: 'state', data: '{"a":1}' }, { event: 'message', data: 'x\ny' }]);
});

test('ws-client: bắt tay, gửi/nhận text có dấu, khung dài > 64 KB', async () => {
    const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise(r => wss.on('listening', r));
    wss.on('connection', (s) => s.on('message', (m) => s.send('echo:' + m.toString())));
    const c = WsClient.connect(`ws://127.0.0.1:${wss.address().port}`);
    const got = [];
    await new Promise((resolve, reject) => {
        c.on('error', reject);
        c.on('open', () => { c.send('xin chào'); c.send('z'.repeat(70000)); });
        c.on('message', (m) => { got.push(m); if (got.length === 2) resolve(); });
    });
    c.close();
    await new Promise(r => wss.close(r));
    assert.strictEqual(got[0], 'echo:xin chào');
    assert.strictEqual(got[1].length, 5 + 70000);
});

test('ws-client: decodeFrames tách khung không mask + chờ đủ byte', () => {
    const f = Buffer.from([0x81, 0x02, 0x68, 0x69, 0x81]);
    const r = WsClient.decodeFrames(f);
    assert.strictEqual(r.frames.length, 1);
    assert.strictEqual(r.frames[0].payload.toString(), 'hi');
    assert.strictEqual(r.rest.length, 1);
});

// E2E: Stream Deck giả (ws) chạy bin/plugin.js thật, app giả trả catalog/SSE/run.
test('plugin.js: willAppear → vẽ icon theo trạng thái; keyDown → POST run → showOk; request không có Origin', async (t) => {
    const runs = [];
    const seenOrigins = [];
    const app = http.createServer((req, res) => {
        seenOrigins.push(req.headers.origin, req.headers.referer);
        if (req.url === '/api/streamdeck/events') {
            res.writeHead(200, { 'Content-Type': 'text/event-stream' });
            res.write('event: state\ndata: ' + JSON.stringify(state) + '\n\n');
            return;
        }
        if (req.url === '/api/streamdeck/catalog') return res.end(JSON.stringify(catalog));
        if (req.url === '/api/streamdeck/run') {
            let b = '';
            req.on('data', d => b += d).on('end', () => {
                runs.push(JSON.parse(b));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, state: { ...state, games: { ...state.games, caro: { on: false } } } }));
            });
            return;
        }
        res.writeHead(404); res.end();
    });
    await new Promise(r => app.listen(0, '127.0.0.1', r));
    const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise(r => wss.on('listening', r));
    const out = [];
    let sock = null;
    const waitFor = (pred, ms = 8000) => new Promise((resolve, reject) => {
        const t0 = Date.now();
        const iv = setInterval(() => {
            const m = out.find(pred);
            if (m) { clearInterval(iv); resolve(m); } else if (Date.now() - t0 > ms) { clearInterval(iv); reject(new Error('timeout: ' + JSON.stringify(out.map(o => o.event)))); }
        }, 20);
    });
    wss.on('connection', (s) => {
        sock = s;
        s.on('message', (m) => {
            const msg = JSON.parse(m.toString());
            out.push(msg);
            if (msg.event === 'getGlobalSettings') s.send(JSON.stringify({ event: 'didReceiveGlobalSettings', payload: { settings: { port: app.address().port } } }));
        });
    });
    const child = spawn(process.execPath, [path.join(PLUGIN, 'bin', 'plugin.js'), '-port', String(wss.address().port), '-pluginUUID', 'PUUID', '-registerEvent', 'registerPlugin', '-info', '{}'], { stdio: 'ignore' });
    t.after(() => { try { child.kill(); } catch (_) {} wss.close(); app.close(); });

    await waitFor(m => m.event === 'registerPlugin' && m.uuid === 'PUUID');
    await waitFor(m => m.event === 'getGlobalSettings');
    sock.send(JSON.stringify({ event: 'willAppear', action: 'media.hpvn.actionlive.game', context: 'K1', payload: { settings: { gameId: 'caro' } } }));
    const img = await waitFor(m => m.event === 'setImage' && m.context === 'K1' && m.payload.image.includes('ĐANG BẬT'));
    assert.ok(img.payload.image.startsWith('data:image/svg+xml'));

    sock.send(JSON.stringify({ event: 'keyDown', action: 'media.hpvn.actionlive.game', context: 'K1', payload: { settings: { gameId: 'caro' } } }));
    await waitFor(m => m.event === 'showOk' && m.context === 'K1');
    assert.deepStrictEqual(runs[0], { kind: 'game', gameId: 'caro' });
    await waitFor(m => m.event === 'setImage' && m.context === 'K1' && m.payload.image.includes('ĐANG TẮT'));

    sock.send(JSON.stringify({ event: 'propertyInspectorDidAppear', action: 'media.hpvn.actionlive.game', context: 'K1' }));
    const pi = await waitFor(m => m.event === 'sendToPropertyInspector' && m.payload.type === 'catalog');
    assert.strictEqual(pi.payload.online, true);
    assert.strictEqual(pi.payload.catalog.games[0].id, 'caro');
    assert.ok(seenOrigins.every(v => v === undefined), 'plugin không được gửi Origin/Referer');
});
