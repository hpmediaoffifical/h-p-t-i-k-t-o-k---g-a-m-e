'use strict';
// Phụ đề giọng Creator — tìm Edge/Chrome, dựng tham số mở cửa sổ nghe, và máy trạng thái phía
// server của cửa sổ đó. Hàm thuần (tiêm exists/regQuery/timer) để test bằng node --test
// (tests/caption-listener.test.js). Server (server.js) mới spawn tiến trình thật.
//
// Vì sao mở Edge/Chrome đích danh thay vì "trình duyệt mặc định": Web Speech API chỉ nghe được
// trong Chrome/Edge (có khoá dịch vụ của Google/Microsoft); Electron, Cốc Cốc, Firefox đều không.

const BROWSERS = ['edge', 'chrome'];
const EXE_NAME = { edge: 'msedge.exe', chrome: 'chrome.exe' };
const SUBPATH = {
    edge: ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
    chrome: ['Google', 'Chrome', 'Application', 'chrome.exe']
};

function normalizeBrowser(v) {
    const s = String(v || '').toLowerCase();
    return BROWSERS.includes(s) ? s : 'edge';
}

// Đường dẫn cài đặt chuẩn trên Windows, theo thứ tự thử.
function candidatePaths(browser, env = process.env) {
    const b = normalizeBrowser(browser);
    const roots = b === 'edge'
        ? [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA]
        : [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA];
    return roots.filter(Boolean).map(root => [root, ...SUBPATH[b]].join('\\'));
}

// Registry "App Paths" — nơi Windows ghi exe của trình duyệt dù cài ở chỗ lạ.
function defaultRegQuery(exeName) {
    const { execFileSync } = require('child_process');
    for (const hive of ['HKLM', 'HKCU']) {
        try {
            const out = execFileSync('reg', ['query', `${hive}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`, '/ve'],
                { encoding: 'utf8', windowsHide: true, timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
            const m = /REG_SZ\s+(.+)$/m.exec(out);
            if (m && m[1].trim()) return m[1].trim();
        } catch (e) { /* không có khoá */ }
    }
    return '';
}

function findExe(browser, { exists, env, regQuery }) {
    for (const p of candidatePaths(browser, env)) if (exists(p)) return p;
    const reg = regQuery ? String(regQuery(EXE_NAME[browser]) || '').trim() : '';
    if (reg && exists(reg)) return reg;
    return '';
}

// → { browser, exe, fallback } | null. Thử trình duyệt được chọn trước, không có thì trình duyệt kia.
function resolveBrowserExe(preferred, { exists, env = process.env, regQuery = defaultRegQuery } = {}) {
    const first = normalizeBrowser(preferred);
    const order = [first, ...BROWSERS.filter(b => b !== first)];
    for (const b of order) {
        const exe = findExe(b, { exists, env, regQuery });
        if (exe) return { browser: b, exe, fallback: b !== first };
    }
    return null;
}

// Cửa sổ --app (không thanh địa chỉ) + profile riêng của HP: quyền micro chỉ xin một lần và
// không đụng profile cá nhân của streamer.
function buildLaunchArgs({ url, profileDir }) {
    return [
        '--app=' + url,
        '--user-data-dir=' + profileDir,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-sync',
        '--disable-features=TranslateUI',
        '--window-size=460,340'
    ];
}

// Máy trạng thái cửa sổ nghe (1 cửa sổ cho cả app).
// status: idle | opening | listening | error. socketId = socket của trang nghe đang giữ.
function createListenerState({ now = Date.now, connectTimeoutMs = 15000, setTimer = setTimeout, clearTimer = clearTimeout, onChange = () => {} } = {}) {
    const s = { status: 'idle', browser: 'edge', lang: '', micLabel: '', error: '', openedAt: 0, socketId: null, updatedAt: 0, everListened: false };
    let timer = null;
    let lastKey = '';
    const snapshot = () => ({ ...s });
    const key = () => [s.status, s.browser, s.lang, s.micLabel, s.error, s.socketId].join('|');
    // Chỉ phát khi có gì đổi — trang nghe gửi nhịp tim 5s/lần, không cần dội lại popup mỗi lần.
    const emit = (force) => {
        const k = key();
        if (!force && k === lastKey) return;
        lastKey = k;
        s.updatedAt = now();
        onChange(snapshot());
    };
    const clearT = () => { if (timer != null) { clearTimer(timer); timer = null; } };

    return {
        snapshot,
        open({ browser } = {}) {
            if (browser) s.browser = normalizeBrowser(browser);
            if (s.status === 'opening' || s.status === 'listening') return { action: 'none', state: snapshot() };
            s.error = '';
            if (s.socketId) {
                // Trang còn mở (người dùng bấm DỪNG trong cửa sổ) → bảo nó nghe lại, không mở cửa sổ mới.
                s.status = 'opening';
                emit();
                return { action: 'start', socketId: s.socketId, state: snapshot() };
            }
            s.status = 'opening';
            s.openedAt = now();
            s.micLabel = '';
            clearT();
            timer = setTimer(() => {
                timer = null;
                if (s.status === 'opening' && !s.socketId) { s.status = 'error'; s.error = 'listener_timeout'; emit(); }
            }, connectTimeoutMs);
            emit();
            return { action: 'spawn', state: snapshot() };
        },
        attach(socketId) {
            if (!socketId) return;
            s.socketId = socketId;
            clearT();
        },
        report(socketId, info = {}) {
            if (!socketId) return;
            // Trang báo gần nhất là trang đang giữ (F5 trong cửa sổ Edge → socket mới thay socket cũ).
            s.socketId = socketId;
            clearT();
            if (info.browser) s.browser = normalizeBrowser(info.browser);
            if (info.lang != null) s.lang = String(info.lang);
            if (info.micLabel != null) s.micLabel = String(info.micLabel);
            const st = String(info.state || '');
            if (st === 'starting' || st === 'listening') { s.status = 'listening'; s.error = ''; s.everListened = true; }
            else if (st === 'idle') { s.status = 'idle'; s.error = ''; }
            else if (st === 'error') { s.status = 'error'; s.error = String(info.error || 'listener_error'); }
            else return;
            emit();
        },
        detach(socketId) {
            if (!socketId || s.socketId !== socketId) return;
            s.socketId = null;
            s.status = 'idle';
            s.error = '';
            emit();
        },
        stop() {
            const socketId = s.socketId;
            clearT();
            s.status = 'idle';
            s.error = '';
            emit();
            return { action: 'stop', socketId };
        }
    };
}

module.exports = { BROWSERS, EXE_NAME, normalizeBrowser, candidatePaths, defaultRegQuery, resolveBrowserExe, buildLaunchArgs, createListenerState };
