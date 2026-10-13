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

// Phím tắt Nghe/Dừng (accelerator Electron). 1 ký tự → Control+Shift+<KÝ TỰ> như Nhặt Lá; rỗng = không đăng ký.
function normalizeHotkey(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    if (/^[a-z0-9]$/i.test(s)) return `Control+Shift+${s.toUpperCase()}`;
    return s.slice(0, 80);
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
        '--disable-features=TranslateUI,Translate',   // tên cờ đổi giữa các bản Chromium → tắt cả hai
        '--window-size=460,340'
    ];
}

// Máy trạng thái cửa sổ nghe (1 cửa sổ cho cả app).
// status: idle | opening | listening | error. socketId = socket của trang nghe đang giữ.
function createListenerState({ now = Date.now, connectTimeoutMs = 15000, setTimer = setTimeout, clearTimer = clearTimeout, onChange = () => {} } = {}) {
    // detail: chẩn đoán từ trang nghe (pha, lỗi gần nhất, bộ đếm) — popup hiện khi cần, không ảnh hưởng status.
    // pendingStart: cửa sổ mở bởi phím tắt (chế độ Bấm/Dừng) → trang báo idle lần đầu thì bảo nghe luôn.
    const s = { status: 'idle', browser: 'edge', lang: '', micLabel: '', error: '', detail: null, openedAt: 0, socketId: null, updatedAt: 0, everListened: false, pendingStart: false };
    let timer = null;
    let lastKey = '';
    const snapshot = () => ({ ...s, detail: s.detail ? { ...s.detail } : null });
    const key = () => [s.status, s.browser, s.lang, s.micLabel, s.error, s.socketId, s.pendingStart, JSON.stringify(s.detail)].join('|');
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
        open({ browser, startWhenReady = false } = {}) {
            if (browser) s.browser = normalizeBrowser(browser);
            if (s.status === 'opening' || s.status === 'listening') return { action: 'none', state: snapshot() };
            s.error = '';
            if (s.socketId) {
                // Trang còn mở (đang nghỉ/tạm dừng) → bảo nó nghe lại, không mở cửa sổ mới.
                s.status = 'opening';
                emit();
                return { action: 'start', socketId: s.socketId, state: snapshot() };
            }
            s.status = 'opening';
            s.openedAt = now();
            s.micLabel = '';
            s.pendingStart = !!startWhenReady;
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
            if (info.detail && typeof info.detail === 'object') s.detail = { ...info.detail };
            const st = String(info.state || '');
            let action = null;
            if (st === 'starting' || st === 'listening') { s.status = 'listening'; s.error = ''; s.everListened = true; s.pendingStart = false; }
            else if (st === 'idle') {
                s.status = 'idle'; s.error = '';
                // Cửa sổ vừa mở theo phím tắt (chế độ Bấm/Dừng không tự nghe) → bảo nghe ngay, chỉ một lần.
                if (s.pendingStart) { s.pendingStart = false; action = { action: 'start', socketId };
                }
            }
            else if (st === 'error') { s.status = 'error'; s.error = String(info.error || 'listener_error'); }
            else return null;
            emit();
            return action;
        },
        // Phím tắt Nghe/Dừng: đang nghe → tạm dừng (cửa sổ vẫn mở); đang nghỉ mà còn cửa sổ → nghe lại;
        // chưa có cửa sổ → mở và nghe ngay khi trang sẵn sàng.
        toggle({ browser } = {}) {
            if (s.status === 'listening' && s.socketId) {
                s.status = 'idle';
                emit();
                return { action: 'pause', socketId: s.socketId };
            }
            if (s.socketId && s.status !== 'opening') {
                const r = this.open({ browser });
                return { action: r.action, socketId: r.socketId };
            }
            return this.open({ browser, startWhenReady: true });
        },
        detach(socketId) {
            if (!socketId || s.socketId !== socketId) return;
            s.socketId = null;
            s.status = 'idle';
            s.error = '';
            emit();
        },
        // Server không mở được cửa sổ (không có Edge/Chrome…) → báo lỗi cho popup, huỷ chờ nối.
        fail(code) {
            clearT();
            s.status = 'error';
            s.error = String(code || 'listener_error');
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

module.exports = { BROWSERS, EXE_NAME, normalizeBrowser, normalizeHotkey, candidatePaths, defaultRegQuery, resolveBrowserExe, buildLaunchArgs, createListenerState };
