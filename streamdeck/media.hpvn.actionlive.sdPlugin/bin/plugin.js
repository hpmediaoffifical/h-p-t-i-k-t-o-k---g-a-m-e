// 🎛️ Plugin Stream Deck của HP Action LIVE — vòng chính.
// Stream Deck chạy file này bằng Node với tham số: -port <n> -pluginUUID <id> -registerEvent <ev> -info <json>.
// Plugin nói 2 chiều: (1) WebSocket tới app Stream Deck (nút, cài đặt nút), (2) HTTP tới HP Action LIVE
// tại 127.0.0.1:<cổng> (mặc định 3000) — đọc trạng thái qua SSE, bấm nút → POST /api/streamdeck/run.
'use strict';
const WS = require('./lib/ws-client');
const App = require('./lib/app-client');
const Keys = require('./lib/keys');
const Icons = require('./lib/icons');

function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length - 1; i++) if (argv[i].startsWith('-')) out[argv[i].replace(/^-+/, '')] = argv[i + 1];
    return out;
}
const args = parseArgs(process.argv.slice(2));
if (!args.port || !args.pluginUUID || !args.registerEvent) {
    console.error('Thiếu tham số Stream Deck (-port/-pluginUUID/-registerEvent) — file này do Stream Deck chạy.');
    process.exit(1);
}

const keys = new Map();          // context → { kind, action, settings, lastImage }
let globalSettings = { port: 3000 };
let appState = null, catalog = null, online = false;
let sd = null;

const appPort = () => {
    const p = Math.floor(Number(globalSettings.port));
    return p > 0 && p < 65536 ? p : 3000;
};

function sendSd(obj) { if (sd) sd.send(JSON.stringify(obj)); }

function paint(ctx) {
    const k = keys.get(ctx);
    if (!k) return;
    const view = Keys.keyView(k.kind, k.settings, { state: appState, catalog, online });
    const image = Icons.toDataUri(Icons.renderSvg(view));
    if (image === k.lastImage) return;
    k.lastImage = image;
    sendSd({ event: 'setImage', context: ctx, payload: { image, target: 0 } });
}
function paintAll() { for (const ctx of keys.keys()) paint(ctx); }

async function loadCatalog() {
    try {
        const r = await App.request(appPort(), 'GET', '/api/streamdeck/catalog');
        if (r.status === 200 && r.json) { catalog = r.json; paintAll(); return catalog; }
    } catch (_) {}
    return null;
}

function sendToPi(ctx, action, payload) {
    sendSd({ event: 'sendToPropertyInspector', action, context: ctx, payload });
}

async function piRefresh(ctx, action) {
    const cat = await loadCatalog();
    sendToPi(ctx, action, { type: 'catalog', online: !!cat, catalog: cat, port: appPort() });
}

async function press(ctx) {
    const k = keys.get(ctx);
    if (!k) return;
    const cmd = Keys.runCommand(k.kind, k.settings);
    try {
        const r = await App.request(appPort(), 'POST', '/api/streamdeck/run', cmd);
        const ok = r.status === 200 && r.json && r.json.ok;
        sendSd({ event: ok ? 'showOk' : 'showAlert', context: ctx });
        if (r.json && r.json.state) { appState = r.json.state; paintAll(); }
        if (!ok) sendToPi(ctx, k.action, { type: 'error', error: (r.json && (r.json.message || r.json.error)) || ('HTTP ' + r.status) });
    } catch (e) {
        sendSd({ event: 'showAlert', context: ctx });
    }
}

let watcher = null;
function startWatch() {
    if (watcher) watcher.stop();
    watcher = App.watchState({
        getPort: appPort,
        onState: (st) => { appState = st; paintAll(); },
        onOnline: (v) => { online = v; if (v) loadCatalog(); paintAll(); },
    });
}

function onSdMessage(raw) {
    let m;
    try { m = JSON.parse(raw); } catch (_) { return; }
    const ctx = m.context, p = m.payload || {};
    switch (m.event) {
        case 'willAppear': {
            const kind = Keys.KIND_BY_UUID[m.action];
            if (!kind) return;
            keys.set(ctx, { kind, action: m.action, settings: p.settings || {}, lastImage: '' });
            paint(ctx);
            break;
        }
        case 'willDisappear': keys.delete(ctx); break;
        case 'didReceiveSettings': {
            const k = keys.get(ctx);
            if (k) { k.settings = p.settings || {}; k.lastImage = ''; paint(ctx); }
            break;
        }
        case 'keyDown': press(ctx); break;
        case 'propertyInspectorDidAppear': piRefresh(ctx, m.action); break;
        case 'sendToPlugin': {
            if (p.type === 'refresh') piRefresh(ctx, m.action);
            if (p.type === 'setPort') {
                globalSettings = { ...globalSettings, port: Math.floor(Number(p.port)) || 3000 };
                sendSd({ event: 'setGlobalSettings', context: args.pluginUUID, payload: globalSettings });
                catalog = null; online = false; paintAll(); startWatch();
                setTimeout(() => piRefresh(ctx, m.action), 800);
            }
            break;
        }
        case 'didReceiveGlobalSettings': {
            const gs = (p.settings && typeof p.settings === 'object') ? p.settings : {};
            const changed = gs.port && Number(gs.port) !== appPort();
            globalSettings = { port: 3000, ...gs };
            if (changed || !watcher) startWatch();
            break;
        }
        default: break;
    }
}

function connectSd() {
    sd = WS.connect(`ws://127.0.0.1:${args.port}`);
    sd.on('open', () => {
        sd.send(JSON.stringify({ event: args.registerEvent, uuid: args.pluginUUID }));
        sd.send(JSON.stringify({ event: 'getGlobalSettings', context: args.pluginUUID }));
    });
    sd.on('message', onSdMessage);
    sd.on('error', () => {});
    // Stream Deck đóng kết nối = tắt plugin.
    sd.on('close', () => { try { watcher && watcher.stop(); } catch (_) {} process.exit(0); });
}

connectSd();
// Chờ cài đặt chung (cổng) từ Stream Deck rồi mới nối app; không có trả lời sau 2 s → dùng cổng mặc định.
setTimeout(() => { if (!watcher) startWatch(); }, 2000);
