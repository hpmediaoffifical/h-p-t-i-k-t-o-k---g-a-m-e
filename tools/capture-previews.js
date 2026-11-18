#!/usr/bin/env node
// 🖼 Chụp ảnh xem trước cho Thư viện Game → public/previews/<id>.webp (≈216×384, vài chục KB/ảnh).
// Cách dùng (server thử đang chạy, KHÔNG dùng app thật vì quà thử sẽ vào game):
//   node tools/capture-previews.js http://localhost:3091 [id1,id2,...]
// Mỗi game: mở /overlay/<id>?mute=1 bằng Edge/Chrome headless (CDP), nền tối, bắn vài quà + bình luận thử
// qua đúng đường thật (/api/test-gift, /api/test-chat), chờ hình dựng rồi chụp thu nhỏ.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const BASE = (process.argv[2] || 'http://localhost:3091').replace(/\/$/, '');
const ONLY = (process.argv[3] || '').split(',').filter(Boolean);
const OUT = path.join(__dirname, '..', 'public', 'previews');
const SCALE = 0.2;   // 1080×1920 → 216×384
const BROWSERS = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe'
];
// Game camera cần người thật trước camera → không chụp được tự động (dùng ảnh mặc định).
const SKIP = new Set(['camgames', 'touchplay', 'chemtraicay', 'dapmuoi', 'bancung', 'dacau', 'body', 'level-quest']);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function json(url, opts) { const r = await fetch(url, opts); return r.json(); }
async function post(p, body) { try { await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); } catch (_) {} }

function cdp(wsUrl) {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const wait = new Map();
    ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } });
    const ready = new Promise(r => ws.addEventListener('open', r));
    return {
        ready,
        send: (method, params) => new Promise((res, rej) => {
            const n = ++id; wait.set(n, (d) => d.error ? rej(new Error(d.error.message)) : res(d.result));
            ws.send(JSON.stringify({ id: n, method, params: params || {} }));
        }),
        close: () => ws.close()
    };
}

(async () => {
    const exe = BROWSERS.find(p => fs.existsSync(p));
    if (!exe) throw new Error('Không tìm thấy Edge/Chrome');
    const games = (await json(BASE + '/api/games')).filter(g => g.overlayPath && !SKIP.has(g.id) && (!ONLY.length || ONLY.includes(g.id)));
    fs.mkdirSync(OUT, { recursive: true });
    const port = 9600 + Math.floor(Math.random() * 300);
    const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-prev-'));
    const br = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1080,1920',
        '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--hide-scrollbars',
        '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore' });
    try {
        let target = null;
        for (let i = 0; i < 40 && !target; i++) { await sleep(250); try { target = (await json(`http://127.0.0.1:${port}/json`)).find(t => t.type === 'page'); } catch (_) {} }
        if (!target) throw new Error('Trình duyệt headless không mở được');
        const c = cdp(target.webSocketDebuggerUrl);
        await c.ready;
        await c.send('Page.enable');
        await c.send('Emulation.setDeviceMetricsOverride', { width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false });
        await c.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 24, g: 27, b: 34, a: 1 } });
        for (const g of games) {
            // game đang TẮT thì overlay trống → tạm bật trong lúc chụp, chụp xong trả lại như cũ
            const wasOff = g.config && g.config.enabled === false;
            if (wasOff) await post('/api/games/' + g.id + '/config', { enabled: true });
            const url = BASE + g.overlayPath + (g.overlayPath.includes('?') ? '&' : '?') + 'mute=1';
            await c.send('Page.navigate', { url });
            await sleep(/quaivat|nhatu|creatoronline|pokemon/.test(g.id) ? 7000 : 3500);
            for (let i = 0; i < 4; i++) { await post('/api/test-gift', { count: 1 + i }); await sleep(350); }
            await post('/api/test-chat', { nickname: 'Khán giả', comment: '1' });
            await post('/api/test-chat', { nickname: 'Fan cứng', comment: 'hay quá' });
            await sleep(3000);
            const shot = await c.send('Page.captureScreenshot', { format: 'webp', quality: 72, clip: { x: 0, y: 0, width: 1080, height: 1920, scale: SCALE } });
            const file = path.join(OUT, g.id + '.webp');
            fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
            // ảnh gần như trống (overlay chỉ hiện khi có PK / người vào phòng…) → bỏ, Thư viện dùng thẻ biểu tượng
            if (fs.statSync(file).size < 3000) { fs.rmSync(file); console.log(`${g.id}: trống — bỏ`); if (wasOff) await post('/api/games/' + g.id + '/config', { enabled: false }); continue; }
            console.log(`${g.id}: ${Math.round(fs.statSync(file).size / 1024)} KB`);
            if (wasOff) await post('/api/games/' + g.id + '/config', { enabled: false });
        }
        c.close();
    } finally {
        br.kill();
        await sleep(500);
        try { fs.rmSync(prof, { recursive: true, force: true }); } catch (_) {}
    }
    // Thư viện chỉ nạp ảnh có trong danh sách (không 404)
    const ids = fs.readdirSync(OUT).filter(f => f.endsWith('.webp')).map(f => f.slice(0, -5)).sort();
    fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(ids));
    const total = fs.readdirSync(OUT).filter(f => f.endsWith('.webp')).reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
    console.log(`Tổng public/previews: ${Math.round(total / 1024)} KB`);
})().catch(e => { console.error(e.message); process.exit(1); });
