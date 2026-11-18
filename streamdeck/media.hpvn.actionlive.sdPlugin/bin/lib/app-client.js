// Nói chuyện với HP Action LIVE qua http://127.0.0.1:<port>/api/streamdeck/*.
// Dùng http thuần (không fetch) → request KHÔNG có header Origin/Referer, Host = 127.0.0.1:<port>
// — đúng đường server cho phép với client không phải trình duyệt trên chính máy này.
'use strict';
const http = require('http');

const HOST = '127.0.0.1';

function request(port, method, path, body, { timeoutMs = 8000 } = {}) {
    return new Promise((resolve, reject) => {
        const data = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
        const req = http.request({
            host: HOST, port, path, method,
            headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {},
        }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                let json = null;
                try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) {}
                resolve({ status: res.statusCode, json });
            });
        });
        req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

// Tách luồng SSE thành các sự kiện { event, data }. Thuần — feed(chunk) trả mảng sự kiện đã đủ.
function createSseParser() {
    let buf = '';
    return function feed(chunk) {
        buf += String(chunk).replace(/\r\n/g, '\n');
        const out = [];
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i);
            buf = buf.slice(i + 2);
            let event = 'message';
            const data = [];
            for (const line of block.split('\n')) {
                if (!line || line.startsWith(':')) continue;
                const c = line.indexOf(':');
                const field = c < 0 ? line : line.slice(0, c);
                const val = c < 0 ? '' : line.slice(c + 1).replace(/^ /, '');
                if (field === 'event') event = val;
                else if (field === 'data') data.push(val);
            }
            if (data.length) out.push({ event, data: data.join('\n') });
        }
        return out;
    };
}

// Theo dõi trạng thái app. onState(state) mỗi khi đổi, onOnline(bool) khi mất / có kết nối.
// Tự nối lại: 1 s, 2 s… tối đa 5 s. Trả { stop(), setPort(p) }.
function watchState({ getPort, onState, onOnline, setTimer = setTimeout, clearTimer = clearTimeout }) {
    let stopped = false, req = null, timer = null, delay = 1000, online = null;
    const setOnline = (v) => { if (online !== v) { online = v; onOnline(v); } };
    const retry = () => {
        if (stopped) return;
        setOnline(false);
        clearTimer(timer);
        timer = setTimer(open, delay);
        delay = Math.min(5000, delay + 1000);
    };
    function open() {
        if (stopped) return;
        const parse = createSseParser();
        req = http.get({ host: HOST, port: getPort(), path: '/api/streamdeck/events', headers: { Accept: 'text/event-stream' } }, (res) => {
            if (res.statusCode !== 200) { res.resume(); return retry(); }
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                for (const e of parse(chunk)) {
                    if (e.event !== 'state') continue;
                    try { delay = 1000; setOnline(true); onState(JSON.parse(e.data)); } catch (_) {}
                }
            });
            res.on('end', retry);
            res.on('error', retry);
        });
        req.on('error', retry);
        // Server gửi ": ping" 15 s/lần — im quá 40 s coi như treo (máy ngủ dậy…) → nối lại.
        req.setTimeout(40000, () => { req.destroy(); });
    }
    open();
    return {
        stop() { stopped = true; clearTimer(timer); try { req && req.destroy(); } catch (_) {} },
        reconnect() { try { req && req.destroy(); } catch (_) {} },
    };
}

module.exports = { request, createSseParser, watchState };
