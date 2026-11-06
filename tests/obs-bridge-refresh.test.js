// node --test tests/obs-bridge-refresh.test.js
// Startup auto-refresh chỉ được bấm Refresh Browser Source của app NÀY (đúng cổng) — không đụng overlay
// HP LIVE NPC (:3001) chạy cùng máy. OBS giả: thay bridge.obs.call, không mở kết nối thật.
const test = require('node:test');
const assert = require('node:assert/strict');
const { OBSBridge, urlOnPort } = require('../lib/obs-bridge');

function fakeBridge(sources) {
    const bridge = new OBSBridge({ autoReconnect: false, logger: { log() {} } });
    const pressed = [];
    bridge.connected = true;
    bridge.obs.call = async (type, data) => {
        if (type === 'GetInputList') {
            return { inputs: Object.keys(sources).map(n => ({ inputName: n, inputKind: sources[n].kind || 'browser_source' })) };
        }
        if (type === 'GetInputSettings') {
            const s = sources[data.inputName];
            if (s.fail) throw new Error('boom');
            return { inputSettings: { url: s.url } };
        }
        if (type === 'PressInputPropertiesButton') { pressed.push(data.inputName); return {}; }
        throw new Error('unexpected ' + type);
    };
    return { bridge, pressed };
}

// Đúng cấu hình server.js obsBridgeAutoRefreshOverlays.
const PORT = 3000;
const startupOpts = { urlIncludes: ['/overlay/', '/_prototype/', `localhost:${PORT}`, `127.0.0.1:${PORT}`], port: PORT };

test('chỉ refresh overlay đúng cổng app — bỏ qua overlay HP LIVE NPC :3001 và nguồn khác', async () => {
    const { bridge, pressed } = fakeBridge({
        'Hũ': { url: 'http://localhost:3000/overlay/thuytinh' },
        'Caro LAN': { url: 'http://192.168.1.20:3000/overlay/caro' },
        'PK obs host': { url: 'http://hpaction.obs:3000/overlay/pktiktok?x=1' },
        'Link chia sẻ': { url: 'http://127.0.0.1:3000/overlay/shared/abc123' },
        'Prototype': { url: 'http://localhost:3000/_prototype/giftboard.html' },
        'Gốc app': { url: 'http://localhost:3000/games/x/overlay.html' },
        'NPC main': { url: 'http://localhost:3001/overlay/main' },
        'NPC hub': { url: 'http://hpnpc.obs:3001/overlay/camgames' },
        'NPC 127': { url: 'http://127.0.0.1:3001/overlay/shared/zzz' },
        'BEAUTY': { url: 'https://beauty.example.com/' },
        'Web khác có /overlay/': { url: 'https://streamlabs.com/overlay/abc' },
        'Trống': { url: '' },
        'Lỗi đọc': { url: 'http://localhost:3000/overlay/caro', fail: true },
        'Camera': { kind: 'dshow_input', url: 'http://localhost:3000/overlay/caro' },
    });
    const r = await bridge.refreshBrowserSources(startupOpts);
    assert.equal(r.ok, true);
    assert.deepEqual(pressed, ['Hũ', 'Caro LAN', 'PK obs host', 'Link chia sẻ', 'Prototype', 'Gốc app']);
    assert.deepEqual(r.refreshed, pressed);
});

test('PORT lấy từ env là chuỗi vẫn khớp', async () => {
    const { bridge, pressed } = fakeBridge({
        'A': { url: 'http://localhost:4000/overlay/caro' },
        'B': { url: 'http://localhost:3000/overlay/caro' },
    });
    await bridge.refreshBrowserSources({ urlIncludes: ['/overlay/'], port: '4000' });
    assert.deepEqual(pressed, ['A']);
});

test('không truyền port → giữ hành vi cũ (chỉ lọc chuỗi URL)', async () => {
    const { bridge, pressed } = fakeBridge({
        'A': { url: 'http://localhost:3000/overlay/caro' },
        'NPC': { url: 'http://localhost:3001/overlay/main' },
    });
    await bridge.refreshBrowserSources({ urlIncludes: ['/overlay/'] });
    assert.deepEqual(pressed, ['A', 'NPC']);
});

test('chưa nối OBS → không gọi gì', async () => {
    const { bridge, pressed } = fakeBridge({ 'A': { url: 'http://localhost:3000/overlay/caro' } });
    bridge.connected = false;
    const r = await bridge.refreshBrowserSources(startupOpts);
    assert.deepEqual(r, { ok: false, reason: 'disconnected' });
    assert.deepEqual(pressed, []);
});

test('urlOnPort', () => {
    assert.equal(urlOnPort('http://localhost:3000/overlay/x', 3000), true);
    assert.equal(urlOnPort('http://localhost:3001/overlay/x', 3000), false);
    assert.equal(urlOnPort('http://localhost/overlay/x', 80), true);
    assert.equal(urlOnPort('https://a.com/overlay/x', 443), true);
    assert.equal(urlOnPort('http://localhost/overlay/x', 3000), false);
    assert.equal(urlOnPort('file:///C:/x/overlay/a.html', 3000), false);
    assert.equal(urlOnPort('không phải url', 3000), false);
    assert.equal(urlOnPort('', 3000), false);
});

// 📋 Bảng Quà Tổng: đọc URL mọi Browser Source → id game (lib/overlay-presence gameIdFromOverlayUrl, đúng cổng app).
test('listBrowserSourceUrls + gameIdFromOverlayUrl: link game nào nằm trong OBS', async () => {
    const { gameIdFromOverlayUrl } = require('../lib/overlay-presence');
    const { bridge, pressed } = fakeBridge({
        'Caro': { url: 'http://hpaction.obs:3000/overlay/caro' },
        'Hub': { url: 'http://localhost:3000/overlay/camgames' },
        'Giờ': { url: 'http://localhost:3000/_prototype/timer.html?mode=overlay' },
        'Bảng quà': { url: 'http://localhost:3000/_prototype/giftboard.html?mode=overlay' },
        'NPC hub': { url: 'http://hpnpc.obs:3001/overlay/camgames' },
        'Lỗi đọc': { url: 'http://localhost:3000/overlay/nhatla', fail: true },
        'Camera': { kind: 'dshow_input', url: 'x' },
    });
    const r = await bridge.listBrowserSourceUrls();
    assert.equal(r.ok, true);
    assert.deepEqual(pressed, []);                                    // chỉ đọc, không bấm gì
    assert.equal(r.sources.length, 5);
    const ids = r.sources.map(s => gameIdFromOverlayUrl(s.url, PORT)).filter(Boolean);
    assert.deepEqual(ids, ['caro', 'camgames', 'timer']);
});

test('listBrowserSourceUrls: chưa nối OBS → ok:false, danh sách rỗng', async () => {
    const { bridge } = fakeBridge({});
    bridge.connected = false;
    assert.deepEqual(await bridge.listBrowserSourceUrls(), { ok: false, reason: 'disconnected', sources: [] });
});
