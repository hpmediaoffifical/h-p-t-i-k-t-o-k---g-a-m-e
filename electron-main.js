/*
 * HP Action LIVE — Electron Desktop Wrapper
 * Khởi động server Express + mở cửa sổ Chromium tới http://localhost:PORT
 */
const { app, BrowserWindow, Menu, Tray, shell, nativeImage, dialog, ipcMain, globalShortcut, session, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const APP_URL = `http://localhost:${PORT}`;
const APP_NAME = 'HP Action LIVE';

let mainWindow = null;
let splashWindow = null;
let quickLaunchWindow = null;
let tray = null;
let serverStarted = false;
let isQuitting = false;

// ============================================================
// PROCESS HYGIENE — Đảm bảo MỌI electron.exe terminate sạch
// ============================================================
// Architecture insight: OBS overlay tự động ẩn (trống/trong suốt) khi socket disconnect.
// Socket chỉ disconnect khi server process (main electron) chết. Nếu helper processes
// (GPU, Crashpad, NetworkService, Utility...) lingering → server vẫn chạy → socket vẫn live
// → OBS không tự ẩn được. Vì vậy MỌI process phải terminate khi user đóng app.
//
// Nghiên cứu Electron + Chromium docs:
//  1. GPU process: tắt bằng disableHardwareAcceleration + --disable-gpu*
//  2. Crashpad handler: --disable-features=Crashpad
//  3. Network service utility: chỉ exit khi main process exit (handled by app.exit(0))
//  4. Renderer processes: BrowserWindow.destroy() kill renderer
//  5. Hard fallback: taskkill /F /T /PID <main> kill cả tree con cháu (Windows)
// ============================================================
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-gpu-sandbox');
// Tắt Crashpad handler process (giảm bớt 1 helper process)
app.commandLine.appendSwitch('disable-features', 'Crashpad,DialMediaRouteProvider');
// Giảm renderer code integrity check → renderer thoát nhanh hơn
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

// === Single-instance lock ===
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); return; }

app.setName(APP_NAME);
app.setAppUserModelId('com.hpmedia.actionlive');

app.on('second-instance', () => {
    if (mainWindow) {
        // Re-launch khi app đang ở tray → mở lại window (restore taskbar icon nữa)
        mainWindow.setSkipTaskbar(false);
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    }
});

function startServer() {
    if (serverStarted) return;
    serverStarted = true;
    try {
        process.env.PORT = String(PORT);
        // Khi đóng gói (asar archive), __dirname là read-only. Đặt data dir ở userData
        // (vd: C:\Users\<user>\AppData\Roaming\HP Action LIVE\data) để ghi được + persist
        const userDataDir = app.getPath('userData');
        const writableDataDir = path.join(userDataDir, 'data');
        if (!fs.existsSync(writableDataDir)) fs.mkdirSync(writableDataDir, { recursive: true });
        process.env.HP_DATA_DIR = writableDataDir;
        require('./server.js');
    } catch (err) {
        dialog.showErrorBox('Lỗi khởi động server', String(err && err.stack || err));
        app.quit();
    }
}

function waitForServerReady(timeoutMs = 15000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const tick = () => {
            http.get(APP_URL, (res) => {
                res.destroy();
                resolve();
            }).on('error', () => {
                if (Date.now() - start > timeoutMs) reject(new Error('Server timeout'));
                else setTimeout(tick, 200);
            });
        };
        tick();
    });
}

function getIcon() {
    const p = path.join(__dirname, 'hp-logo.png');
    return nativeImage.createFromPath(p);
}

function createSplash() {
    splashWindow = new BrowserWindow({
        width: 420,
        height: 220,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: true,
        backgroundColor: '#00000000',
        icon: getIcon(),
        webPreferences: { contextIsolation: true }
    });
    const html = `
        <!doctype html><html><head><meta charset="utf-8"><style>
            body{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:transparent;
                display:flex;align-items:center;justify-content:center;height:100vh;-webkit-app-region:drag;}
            .card{background:linear-gradient(135deg,#161a23,#0f1218);
                border:1px solid #2c3243;border-radius:16px;
                padding:24px 28px;color:#e6e8ee;text-align:center;
                box-shadow:0 20px 60px rgba(0,0,0,0.6);width:360px;}
            .logo{width:64px;height:64px;border-radius:14px;margin:0 auto 12px;
                background:linear-gradient(135deg,#7c3aed,#3b82f6);
                display:flex;align-items:center;justify-content:center;
                font-size:24px;font-weight:800;color:#fff;letter-spacing:1px;
                box-shadow:0 8px 24px rgba(124,58,237,0.45);}
            .title{font-size:18px;font-weight:800;letter-spacing:0.4px;}
            .sub{font-size:12px;color:#8b93a8;margin-top:4px;}
            .bar{margin-top:14px;height:3px;background:#1f2533;border-radius:999px;overflow:hidden;}
            .fill{height:100%;background:linear-gradient(90deg,#ff6b3d,#ff2d55);
                animation:run 1.4s ease-in-out infinite;width:30%;}
            @keyframes run{0%{margin-left:-30%}100%{margin-left:100%}}
        </style></head><body>
        <div class="card">
            <div class="logo">hp</div>
            <div class="title">HP Action LIVE</div>
            <div class="sub">Đang khởi động máy chủ...</div>
            <div class="bar"><div class="fill"></div></div>
        </div></body></html>`;
    splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    splashWindow.center();
}

function createMainWindow() {
    try {
        session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
            if (permission !== 'media' && permission !== 'microphone') return false;
            return String(requestingOrigin || '').startsWith(APP_URL);
        });
        session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
            if (permission !== 'media' && permission !== 'microphone') return callback(false);
            const origin = String(details?.requestingUrl || webContents.getURL() || '');
            callback(origin.startsWith(APP_URL));
        });
    } catch (_) {}

    mainWindow = new BrowserWindow({
        width: 1180,
        height: 760,
        minWidth: 960,
        minHeight: 620,
        backgroundColor: '#0b0d12',
        title: APP_NAME,
        icon: getIcon(),
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
            contextIsolation: true,
            sandbox: false
        }
    });
    Menu.setApplicationMenu(null);
    mainWindow.loadURL(APP_URL);

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        if (splashWindow) { splashWindow.close(); splashWindow = null; }
    });

    // Hyperlinks trỏ ra ngoài → mở bằng trình duyệt mặc định
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        // /soundfx → mở app HP SoundEffects.exe (WPF) đóng gói kèm
        if (url === `${APP_URL}/soundfx` || url.startsWith(`${APP_URL}/soundfx`)) {
            openSoundfxApp();
            return { action: 'deny' };
        }
        // /quick-launch → cửa sổ điều khiển nhanh tách rời (always-on-top)
        if (url === `${APP_URL}/quick-launch` || url.startsWith(`${APP_URL}/quick-launch`)) {
            openQuickLaunchWindow();
            return { action: 'deny' };
        }
        // /gift-list → cửa sổ Danh sách quà tách rời, ghim trên cùng (test quà mọi game)
        if (url === `${APP_URL}/gift-list` || url.startsWith(`${APP_URL}/gift-list`)) {
            openGiftListWindow();
            return { action: 'deny' };
        }
        // /overlay/caro?popout=1 → cửa sổ Overlay Review trong suốt + frameless để
        // OBS dùng Window Capture (WGC) bắt sắc nét hơn so với Browser Source URL.
        if (url.startsWith(`${APP_URL}/overlay/caro`) && url.includes('popout=1')) {
            openCaroPreviewWindow();
            return { action: 'deny' };
        }
        // /overlay/nhietdo → cửa sổ overlay nhiệt độ (nền trong suốt + frame title bar để kéo).
        // Hỗ trợ 2 mode: bình thường, hoặc ?pin=1 (luôn nổi trên top).
        if (url.startsWith(`${APP_URL}/overlay/nhietdo`)) {
            const pin = url.includes('pin=1');
            const edit = url.includes('edit=1');
            openNhietDoPopoutWindow({ pin, edit });
            return { action: 'deny' };
        }
        // /overlay/nhatla?preview=1 → overlay 1080×1920 trong suốt, kéo lá trực tiếp.
        // OBS có thể Window Capture cửa sổ này thay cho Browser Source URL.
        if (url.startsWith(`${APP_URL}/overlay/nhatla`) && url.includes('preview=1')) {
            openNhatLaPreviewWindow();
            return { action: 'deny' };
        }
        if (url.startsWith(APP_URL)) {
            return { action: 'allow' };
        }
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // X (close) hoặc minimize → ẨN xuống tray, KHÔNG quit.
    // Server tiếp tục chạy → socket OBS vẫn connect → overlay overlay nhận quà/state bình
    // thường khi user đang dọn màn hình hoặc nhường focus cho app khác trong livestream.
    // Muốn thoát thực sự: chuột phải tray icon → "Thoát" (gọi fullQuit).
    let trayBalloonShown = false;
    mainWindow.on('close', (e) => {
        if (isQuitting) return;
        e.preventDefault();
        mainWindow.hide();
        if (process.platform === 'win32') {
            mainWindow.setSkipTaskbar(true);
            // Lần đầu ẩn → bóng nhắc nhở user app đang chạy ở tray (1 lần / phiên)
            if (!trayBalloonShown && tray && !tray.isDestroyed()) {
                trayBalloonShown = true;
                try {
                    tray.displayBalloon({
                        title: 'HP Action LIVE vẫn đang chạy',
                        content: 'App đã thu xuống tray. OBS overlay vẫn hoạt động bình thường. Chuột phải tray để Thoát.',
                        iconType: 'info'
                    });
                } catch (_) {}
            }
        }
    });
    // Minimize cũng nên xuống tray cho nhất quán (tuỳ chọn — user có thể thích minimize bình
    // thường xuống taskbar). Giữ minimize MẶC ĐỊNH = taskbar (không can thiệp) để không phá
    // workflow của user. Chỉ X mới gửi xuống tray.
}

function showMainWindow() {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.setSkipTaskbar(false);
    mainWindow.show();
    mainWindow.focus();
}
function buildTray() {
    try {
        tray = new Tray(getIcon().resize({ width: 16, height: 16 }));
        const contextMenu = Menu.buildFromTemplate([
            { label: 'Mở HP Action LIVE', click: showMainWindow },
            { label: '🔊 Mở Sound Effects', click: () => openSoundfxApp() },
            { label: 'Mở overlay OBS trong trình duyệt', click: () => shell.openExternal(`${APP_URL}/overlay/thuytinh`) },
            { type: 'separator' },
            { label: 'Thoát', click: () => fullQuit() }
        ]);
        tray.setToolTip(`${APP_NAME} (đang chạy — overlay OBS hoạt động)`);
        tray.setContextMenu(contextMenu);
        tray.on('double-click', showMainWindow);
        tray.on('click', showMainWindow);   // single click cũng mở (UX nhanh hơn)
    } catch (e) {}
}

// ============================================================
// fullQuit() — Cleanup TỔNG + force exit MỌI process con
// ============================================================
// 5-tier shutdown để đảm bảo 0 electron.exe sót trong Task Manager:
//   Tier 1: Socket.IO close → disconnect tất cả OBS browser sources
//   Tier 2: forcefullyCrashRenderer + destroy → kill renderer processes
//   Tier 3: tray destroy → release tray icon slot
//   Tier 4: httpServer close → release port + giải phóng node socket lib
//   Tier 5: app.exit(0) → main process exit chính thức
//   Hard fallback: taskkill /F /T /PID → kill TREE (kể cả grandchildren) sau 1.5s
// ============================================================
// Custom confirm popup styled cùng theme app — thay cho dialog.showMessageBoxSync xấu xí.
// Sử dụng BrowserWindow frameless + transparent + IPC để communicate.
function confirmQuitAsync() {
    return new Promise((resolve) => {
        let resolved = false;
        const finish = (v) => { if (resolved) return; resolved = true; resolve(v); };
        try {
            const parent = (mainWindow && !mainWindow.isDestroyed()) ? mainWindow : undefined;
            const win = new BrowserWindow({
                width: 460, height: 280,
                frame: false, transparent: true,
                resizable: false, minimizable: false, maximizable: false,
                alwaysOnTop: true, skipTaskbar: true,
                parent, modal: !!parent,
                show: false,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false,
                    sandbox: false
                }
            });
            const html = `<!doctype html><html><head><meta charset="utf-8"><style>
                html,body { margin: 0; padding: 0; height: 100%; background: transparent; font-family: 'Segoe UI', Roboto, sans-serif; overflow: hidden; user-select: none; -webkit-app-region: drag; }
                .overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; }
                .card {
                    -webkit-app-region: drag;
                    background: linear-gradient(155deg, #1f2230 0%, #181b25 100%);
                    border: 1px solid rgba(239, 68, 68, 0.4);
                    border-radius: 14px;
                    padding: 22px 26px;
                    width: 420px; max-width: 92vw;
                    box-shadow: 0 22px 64px rgba(0,0,0,0.75), 0 0 0 1px rgba(239, 68, 68, 0.18);
                    animation: pop 0.25s cubic-bezier(.34,1.56,.64,1);
                }
                @keyframes pop { from { transform: translateY(20px) scale(0.92); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
                .head { display: flex; align-items: center; gap: 14px; margin-bottom: 12px; }
                .ico {
                    width: 44px; height: 44px; flex-shrink: 0;
                    display: flex; align-items: center; justify-content: center;
                    background: linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(255, 107, 61, 0.18));
                    border-radius: 12px; font-size: 22px;
                }
                .title { font-size: 16px; font-weight: 800; color: #f3f5fa; }
                .body { font-size: 13px; color: #d6dae6; line-height: 1.55; padding: 4px 0 16px; }
                .body .hint { color: #8b93a8; font-size: 12px; }
                .actions { display: flex; justify-content: flex-end; gap: 10px; -webkit-app-region: no-drag; }
                button {
                    -webkit-app-region: no-drag;
                    padding: 9px 22px; font-size: 13px; font-weight: 700;
                    border-radius: 8px; cursor: pointer;
                    transition: transform 0.1s, box-shadow 0.15s;
                    border: 1px solid transparent;
                    font-family: inherit;
                }
                button:hover { transform: translateY(-1px); }
                .cancel { background: rgba(255,255,255,0.07); color: #d6dae6; border-color: rgba(255,255,255,0.12); }
                .cancel:hover { background: rgba(255,255,255,0.14); }
                .ok { background: linear-gradient(135deg, #ef4444, #f97316); color: #fff; box-shadow: 0 4px 14px rgba(239, 68, 68, 0.4); }
                .ok:hover { box-shadow: 0 6px 20px rgba(239, 68, 68, 0.55); }
            </style></head><body>
                <div class="overlay">
                    <div class="card">
                        <div class="head">
                            <div class="ico">⏻</div>
                            <div class="title">Xác nhận thoát HP Action LIVE</div>
                        </div>
                        <div class="body">
                            Bạn có chắc muốn thoát?<br>
                            <span class="hint">Mọi OBS overlay đang kết nối sẽ ngừng nhận tín hiệu khi app thoát. Bấm "Giữ chạy ngầm" để app tiếp tục hoạt động ở tray.</span>
                        </div>
                        <div class="actions">
                            <button id="cancel" class="cancel" autofocus>Giữ chạy ngầm</button>
                            <button id="ok" class="ok">Thoát hẳn</button>
                        </div>
                    </div>
                </div>
                <script>
                    const { ipcRenderer } = require('electron');
                    document.getElementById('ok').addEventListener('click', () => ipcRenderer.send('hp-quit-confirm', true));
                    document.getElementById('cancel').addEventListener('click', () => ipcRenderer.send('hp-quit-confirm', false));
                    document.addEventListener('keydown', (e) => {
                        if (e.key === 'Escape') ipcRenderer.send('hp-quit-confirm', false);
                        else if (e.key === 'Enter') ipcRenderer.send('hp-quit-confirm', false);   // Enter default = huỷ
                    });
                    // Focus cancel để Enter mặc định = huỷ
                    setTimeout(() => document.getElementById('cancel').focus(), 50);
                </script>
            </body></html>`;
            win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
            win.once('ready-to-show', () => win.show());
            const { ipcMain } = require('electron');
            const handler = (_evt, result) => { try { win.close(); } catch (e) {} finish(!!result); };
            ipcMain.once('hp-quit-confirm', handler);
            win.on('closed', () => { ipcMain.removeListener('hp-quit-confirm', handler); finish(false); });
        } catch (e) {
            // Fallback dialog nếu BrowserWindow fail
            const choice = dialog.showMessageBoxSync({
                type: 'question', buttons: ['Thoát hẳn', 'Huỷ'], defaultId: 1, cancelId: 1,
                title: 'Xác nhận thoát', message: 'Bạn có chắc muốn thoát HP Action LIVE?'
            });
            finish(choice === 0);
        }
    });
}

function fullQuit(opts) {
    if (isQuitting) return;
    const skipConfirm = !!(opts && opts.skipConfirm);
    if (!skipConfirm) {
        confirmQuitAsync().then((confirmed) => {
            if (confirmed) actualFullQuit();
        });
        return;
    }
    actualFullQuit();
}

function actualFullQuit() {
    if (isQuitting) return;
    isQuitting = true;

    // === Tier 0: Chốt prefs MỌI cửa sổ nổi TRƯỚC khi destroy (destroy không bắn 'close'/'beforeunload') ===
    try { flushQuickLaunchPrefs(); } catch (e) {}
    try { flushCaroPreviewPrefs(); } catch (e) {}
    try { flushGiftListPrefs(); } catch (e) {}
    try { flushNhietDoPinPrefs(); } catch (e) {}

    // === Tier 1: Đóng Socket.IO (disconnect mọi OBS client) ===
    try {
        const srv = require('./server.js');
        if (srv && srv.io && typeof srv.io.close === 'function') {
            srv.io.close();           // disconnect all sockets
        }
    } catch (e) {}

    // === Tier 2: Crash + destroy renderer processes ===
    try {
        for (const w of BrowserWindow.getAllWindows()) {
            try {
                if (!w.isDestroyed()) {
                    // forcefullyCrashRenderer() ép renderer process exit ngay
                    if (w.webContents && typeof w.webContents.forcefullyCrashRenderer === 'function') {
                        try { w.webContents.forcefullyCrashRenderer(); } catch (e) {}
                    }
                    w.destroy();
                }
            } catch (e) {}
        }
    } catch (e) {}

    // === Tier 3: Destroy tray ===
    if (tray && !tray.isDestroyed()) {
        try { tray.destroy(); } catch (e) {}
        tray = null;
    }

    // === Tier 4: Close HTTP server ===
    try {
        const srv = require('./server.js');
        if (srv && srv.httpServer && typeof srv.httpServer.close === 'function') {
            srv.httpServer.close();
        }
    } catch (e) {}

    // === Tier 5: app.exit(0) sau 200ms (cho cleanup async hoàn tất) ===
    setTimeout(() => {
        try { app.exit(0); } catch (e) {}

        // === Hard fallback (Windows-specific): taskkill /F /T /PID <main>
        // Kill TREE — terminate main process + tất cả descendants
        // (helper electron.exe, GPU process nếu còn, utility processes, v.v.)
        setTimeout(() => {
            try {
                if (process.platform === 'win32') {
                    const { spawn } = require('child_process');
                    spawn('taskkill', ['/F', '/T', '/PID', String(process.pid)], {
                        detached: true,
                        stdio: 'ignore',
                        windowsHide: true
                    }).unref();
                }
            } catch (e) {}
            // Hard process exit nếu trên đây vẫn không kill được
            try { process.exit(0); } catch (e) {}
        }, 800);
    }, 200);
}

// ============================================================
// 🛟 Chống popup "kẹt ngoài màn hình"
// ============================================================
// Bounds đã lưu (x,y) có thể trỏ vào màn phụ đã rút, hoặc "vùng chết" giữa 2 màn
// (vd taskbar thumbnail thấy cửa sổ nhưng desktop không hiện). Helper này nhận toạ
// độ mong muốn + kích thước, trả về {x,y} ĐÃ đảm bảo nhìn thấy trên một màn đang nối;
// nếu không cứu được → trả {} để Electron tự canh giữa màn chính.
function clampBoundsToVisible(x, y, width, height) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return {};
    try {
        const w = Math.max(1, parseInt(width, 10) || 1);
        const h = Math.max(1, parseInt(height, 10) || 1);
        const displays = screen.getAllDisplays();
        // Tổng diện tích cửa sổ thực sự nằm trong workArea của tất cả màn
        let visible = 0;
        for (const d of displays) {
            const a = d.workArea;
            const ix = Math.max(0, Math.min(x + w, a.x + a.width)  - Math.max(x, a.x));
            const iy = Math.max(0, Math.min(y + h, a.y + a.height) - Math.max(y, a.y));
            visible += ix * iy;
        }
        // Đủ thấy = ≥30% diện tích, hoặc tối thiểu một mảng ~120×80 để tóm & kéo
        const minVisible = Math.min(w * h * 0.30, 120 * 80);
        if (visible >= minVisible) return { x: Math.round(x), y: Math.round(y) };
        // Không đủ thấy → kẹp vào màn giao nhiều nhất (getDisplayMatching fallback màn gần nhất)
        const a = screen.getDisplayMatching({ x, y, width: w, height: h }).workArea;
        const cx = Math.max(a.x, Math.min(x, a.x + a.width  - Math.min(w, a.width)));
        const cy = Math.max(a.y, Math.min(y, a.y + a.height - Math.min(h, a.height)));
        return { x: Math.round(cx), y: Math.round(cy) };
    } catch { return {}; }
}

// ============================================================
// 🔊 SoundFX — mở app HP SoundEffects (WPF). Cài từ GitHub khi chưa có.
// ============================================================
// KHÔNG bundle app vào installer (nhẹ hơn ~33MB). Bấm 🎵:
//   - Đã cài (%LocalAppData%\HP SoundEffects) → mở luôn.
//   - Chưa cài → tải bản cài từ GitHub (link ẩn trong main process, không lộ ra UI)
//     → chạy installer bình thường (Inno Setup, cài %LocalAppData%, không cần admin)
//     → mở app. Sau đó app TỰ CẬP NHẬT qua UpdateChecker riêng của nó — HP Action LIVE
//     không cần quản lý version. Installer giữ nguyên DB.sqlite/Settings.ini khi update.
const SFX_MANIFEST_URL =
    'https://raw.githubusercontent.com/hpmediaoffifical/HP-SoundEffects-Releases/main/version.json';
let _sfxBusy = false;
function getSoundfxPaths() {
    const localAppData = process.env.LOCALAPPDATA
        || path.join(app.getPath('home'), 'AppData', 'Local');
    const dir = path.join(localAppData, 'HP SoundEffects');
    return { dir, exe: path.join(dir, 'HP SoundEffects.exe') };
}
function launchSoundfxExe() {
    const { dir, exe } = getSoundfxPaths();
    try {
        // WPF có Mutex single-instance: chạy lần 2 tự đưa cửa sổ đang mở lên trước.
        const child = spawn(exe, [], { cwd: dir, detached: true, stdio: 'ignore' });
        child.on('error', (err) => {
            try { dialog.showErrorBox('HP SoundEffects', 'Không mở được app:\n' + err.message); } catch (_) {}
        });
        child.unref();
    } catch (e) {
        try { dialog.showErrorBox('HP SoundEffects', 'Lỗi khi mở app:\n' + e.message); } catch (_) {}
    }
}
// GET JSON (chống cache) — dùng để đọc version.json.
function sfxFetchJson(url) {
    return new Promise((resolve, reject) => {
        const bust = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
        https.get(bust, { headers: { 'User-Agent': 'HP-Action-LIVE', 'Cache-Control': 'no-cache' } }, (res) => {
            if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
        }).on('error', reject);
    });
}
// Tải file, tự đi theo redirect của GitHub. onProgress(percent|null).
function sfxDownload(url, dest, onProgress, redirects = 0) {
    return new Promise((resolve, reject) => {
        if (redirects > 6) return reject(new Error('Quá nhiều redirect'));
        const req = https.get(url, { headers: { 'User-Agent': 'HP-Action-LIVE' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                return resolve(sfxDownload(res.headers.location, dest, onProgress, redirects + 1));
            }
            if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
            const total = parseInt(res.headers['content-length'] || '0', 10);
            let got = 0;
            const out = fs.createWriteStream(dest);
            res.on('data', (c) => { got += c.length; if (onProgress) onProgress(total ? Math.round(got * 100 / total) : null); });
            res.pipe(out);
            out.on('finish', () => out.close(() => resolve(dest)));
            out.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(60000, () => req.destroy(new Error('Hết thời gian tải')));
    });
}
// Cửa sổ nhỏ báo tiến trình tải (self-contained, main tự cập nhật qua executeJavaScript).
function makeSfxProgressWindow() {
    const w = new BrowserWindow({
        width: 380, height: 160, resizable: false, minimizable: false, maximizable: false,
        fullscreenable: false, title: 'HP SoundEffects', icon: getIcon(),
        alwaysOnTop: true, autoHideMenuBar: true, backgroundColor: '#ffffff',
        parent: (mainWindow && !mainWindow.isDestroyed()) ? mainWindow : undefined,
        webPreferences: { contextIsolation: true }
    });
    const html = '<!doctype html><meta charset=utf-8>'
        + '<body style="font-family:Segoe UI,system-ui;margin:0;padding:20px 22px;background:#fff;color:#222">'
        + '<div style="font-size:14px;font-weight:600;margin-bottom:14px">Đang tải HP SoundEffects…</div>'
        + '<div style="height:10px;background:#eee;border-radius:6px;overflow:hidden">'
        + '<div id="bar" style="height:100%;width:0;background:#e11d48;transition:width .2s"></div></div>'
        + '<div id="pct" style="font-size:12px;color:#666;margin-top:10px">Đang kết nối…</div></body>';
    w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    return w;
}
async function downloadAndInstallSoundfx() {
    if (_sfxBusy) return;
    _sfxBusy = true;
    let progWin = null;
    try {
        const { response } = await dialog.showMessageBox(
            (mainWindow && !mainWindow.isDestroyed()) ? mainWindow : undefined, {
            type: 'question', buttons: ['Tải & cài ngay', 'Để sau'], defaultId: 0, cancelId: 1,
            title: 'HP SoundEffects', message: 'Chưa cài HP SoundEffects.',
            detail: 'Tải bản mới nhất và cài đặt ngay bây giờ?'
        });
        if (response !== 0) return;

        const info = await sfxFetchJson(SFX_MANIFEST_URL);
        if (!info || !info.url) throw new Error('Không lấy được thông tin bản cài (version.json).');

        const setupPath = path.join(app.getPath('temp'), 'HP-SoundEffects-Setup.exe');
        try { if (fs.existsSync(setupPath)) fs.unlinkSync(setupPath); } catch (_) {}

        progWin = makeSfxProgressWindow();
        let ready = false;
        progWin.webContents.on('did-finish-load', () => { ready = true; });

        await sfxDownload(info.url, setupPath, (pct) => {
            try {
                if (!progWin || progWin.isDestroyed()) return;
                progWin.setProgressBar(pct == null ? 2 : pct / 100); // 2 = indeterminate
                if (ready) progWin.webContents.executeJavaScript(
                    "(function(){var b=document.getElementById('bar'),p=document.getElementById('pct');"
                    + "if(b)b.style.width='" + (pct == null ? 40 : pct) + "%';"
                    + "if(p)p.textContent='" + (pct == null ? 'Đang tải…' : pct + '%') + "';})()"
                ).catch(() => {});
            } catch (_) {}
        });

        try { if (progWin && !progWin.isDestroyed()) progWin.close(); } catch (_) {}
        progWin = null;

        // Chạy installer bình thường (wizard hiện, cài %LocalAppData%, không cần admin).
        await new Promise((resolve) => {
            const inst = spawn(setupPath, [], { detached: false, stdio: 'ignore' });
            inst.on('error', () => resolve());
            inst.on('exit', () => resolve());
        });

        const { exe } = getSoundfxPaths();
        if (fs.existsSync(exe)) launchSoundfxExe();
        else dialog.showMessageBox((mainWindow && !mainWindow.isDestroyed()) ? mainWindow : undefined, {
            type: 'info', title: 'HP SoundEffects',
            message: 'Cài đặt chưa hoàn tất.', detail: 'Sau khi cài xong, bấm nút 🎵 lần nữa để mở.'
        });
    } catch (e) {
        try { if (progWin && !progWin.isDestroyed()) progWin.close(); } catch (_) {}
        try { dialog.showErrorBox('HP SoundEffects', 'Không tải/cài được:\n' + e.message); } catch (_) {}
    } finally {
        _sfxBusy = false;
    }
}
function openSoundfxApp() {
    const { exe } = getSoundfxPaths();
    if (fs.existsSync(exe)) { launchSoundfxExe(); return; }
    downloadAndInstallSoundfx();
}
// Main app mở SoundFX qua IPC
ipcMain.on('open-soundfx', () => openSoundfxApp());

// ============================================================
// 🚀 Quick Launch — cửa sổ điều khiển nhanh tách rời, always-on-top
// ============================================================
// Nhỏ gọn, pin-able, lưu bounds + alwaysOnTop qua phiên (file disk dưới userData).
// User minimize main window → vẫn dùng được cửa sổ này để chạy nhanh nút Bắt đầu/Tắt.
function getQuickLaunchPrefsPath() {
    try { return path.join(app.getPath('userData'), 'data', 'quick-launch.json'); }
    catch { return null; }
}
// Cache trong bộ nhớ = nguồn chuẩn → đọc-sau-ghi luôn đúng (debounce chỉ để hạ tần ghi disk).
let qlPrefsCache = null;
function loadQuickLaunchPrefs() {
    if (qlPrefsCache) return qlPrefsCache;
    try {
        const p = getQuickLaunchPrefsPath();
        qlPrefsCache = (p && fs.existsSync(p)) ? (JSON.parse(fs.readFileSync(p, 'utf8')) || {}) : {};
    } catch { qlPrefsCache = {}; }
    return qlPrefsCache;
}
let qlSaveTimer = null;
function saveQuickLaunchPrefs(patch) {
    const cur = loadQuickLaunchPrefs();
    qlPrefsCache = { ...cur, ...(patch || {}) };   // merge ngay vào cache
    // Debounce 250ms — move/resize emit liên tục, tránh ghi disk dồn dập
    if (qlSaveTimer) clearTimeout(qlSaveTimer);
    qlSaveTimer = setTimeout(() => {
        try {
            const p = getQuickLaunchPrefsPath();
            if (!p) return;
            const dir = path.dirname(p);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(p, JSON.stringify(qlPrefsCache, null, 2), 'utf8');
        } catch (e) { /* swallow */ }
    }, 250);
}
// Bounds lưu RIÊNG theo từng bố cục: prefs.doc / prefs.ngang = {x,y,w,h}.
// qlLayout = bố cục đang dùng → persistBounds ghi vào đúng slot này.
let qlLayout = 'doc';
function qlDefaultSize(layout) {
    return layout === 'ngang' ? { w: 760, h: 240 } : { w: 380, h: 560 };
}
function qlSlotOf(prefs, layout, useLegacy = false) {
    const s = prefs && prefs[layout];
    if (s && Number.isFinite(s.w) && Number.isFinite(s.h)) return { ...s };
    // Tương thích bản cũ (prefs phẳng {x,y,w,h}) → CHỈ mồi cho bố cục đang mở, không lây sang bố cục kia
    if (useLegacy && Number.isFinite(prefs.w) && Number.isFinite(prefs.h)) {
        return { x: prefs.x, y: prefs.y, w: prefs.w, h: prefs.h };
    }
    return {};
}
// Ghi ĐỒNG BỘ ngay (không debounce) — gọi lúc app thoát/đóng cửa sổ. Thoát app destroy()
// cửa sổ (KHÔNG bắn 'close') rồi app.exit(0) sau 200ms → timer debounce 250ms không kịp chạy
// → mất thay đổi cuối (vd bề rộng Ngang vừa kéo). Hàm này chốt bounds sống vào đúng slot rồi flush.
function flushQuickLaunchPrefs() {
    try {
        if (quickLaunchWindow && !quickLaunchWindow.isDestroyed()) {
            const b = quickLaunchWindow.getBounds();
            saveQuickLaunchPrefs({ [qlLayout]: { x: b.x, y: b.y, w: b.width, h: b.height } });
        }
    } catch {}
    if (qlSaveTimer) { clearTimeout(qlSaveTimer); qlSaveTimer = null; }
    if (!qlPrefsCache) return;
    try {
        const p = getQuickLaunchPrefsPath();
        if (!p) return;
        const dir = path.dirname(p);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(p, JSON.stringify(qlPrefsCache, null, 2), 'utf8');
    } catch {}
}
function openQuickLaunchWindow() {
    if (quickLaunchWindow && !quickLaunchWindow.isDestroyed()) {
        quickLaunchWindow.show(); quickLaunchWindow.focus(); return;
    }
    const prefs = loadQuickLaunchPrefs();
    qlLayout = prefs.layout === 'ngang' ? 'ngang' : 'doc';
    const slot = qlSlotOf(prefs, qlLayout, true);   // mở cửa sổ → cho phép mồi từ prefs bản cũ
    const def = qlDefaultSize(qlLayout);
    const opts = {
        width: Math.max(320, parseInt(slot.w, 10) || def.w),
        height: Math.max(150, parseInt(slot.h, 10) || def.h),
        minWidth: 320,
        minHeight: 150,   // cho phép bố cục Ngang thấp gọn (ôm sát card)
        resizable: true,
        maximizable: false,
        fullscreenable: false,
        title: 'HP — Khởi động nhanh',
        icon: getIcon(),
        backgroundColor: '#0b0d12',
        alwaysOnTop: prefs.alwaysOnTop !== false,   // mặc định Pin = on
        autoHideMenuBar: true,
        frame: false,
        skipTaskbar: false,
        show: false,
        webPreferences: {
            contextIsolation: true,
            sandbox: false,
            preload: path.join(__dirname, 'quick-launch-preload.js')
        }
    };
    Object.assign(opts, clampBoundsToVisible(slot.x, slot.y, opts.width, opts.height));
    quickLaunchWindow = new BrowserWindow(opts);
    // Truyền chế độ bố cục qua QUERY PARAM → renderer đọc đồng bộ lúc load (không bị race như IPC).
    quickLaunchWindow.loadURL(`${APP_URL}/quick-launch?layout=${qlLayout}`);
    quickLaunchWindow.once('ready-to-show', () => {
        // Báo renderer biết trạng thái Pin lúc khởi tạo để sync UI nút 📌
        try { quickLaunchWindow.webContents.send('quick-launch:initPin', opts.alwaysOnTop); } catch {}
        // Áp bố cục đã lưu + ôm sát chiều cao theo bề rộng đã khôi phục (giữ đúng vị trí)
        try { quickLaunchWindow.webContents.send('quick-launch:applyLayout', { mode: qlLayout, w: opts.width }); } catch {}
        quickLaunchWindow.show();
    });
    const persistBounds = () => {
        if (!quickLaunchWindow || quickLaunchWindow.isDestroyed()) return;
        try {
            const b = quickLaunchWindow.getBounds();
            // Lưu bounds vào slot của bố cục đang dùng → đổi qua lại không mất vị trí/size
            saveQuickLaunchPrefs({ [qlLayout]: { x: b.x, y: b.y, w: b.width, h: b.height } });
        } catch {}
    };
    quickLaunchWindow.on('moved',  persistBounds);
    quickLaunchWindow.on('resize', persistBounds);
    quickLaunchWindow.on('close', () => { persistBounds(); flushQuickLaunchPrefs(); });
    quickLaunchWindow.on('closed', () => { quickLaunchWindow = null; });
    quickLaunchWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url); return { action: 'deny' };
    });
}
ipcMain.on('quick-launch:setAlwaysOnTop', (e, on) => {
    if (quickLaunchWindow && !quickLaunchWindow.isDestroyed()) {
        quickLaunchWindow.setAlwaysOnTop(!!on);
        saveQuickLaunchPrefs({ alwaysOnTop: !!on });
    }
});
ipcMain.on('quick-launch:setLayout', (e, mode) => {
    const next = mode === 'ngang' ? 'ngang' : 'doc';
    const win = quickLaunchWindow;
    const alive = win && !win.isDestroyed();
    if (next === qlLayout) { saveQuickLaunchPrefs({ layout: next }); return; }
    // 1) Lưu bounds của bố cục ĐANG dùng trước khi đổi
    if (alive) {
        try { const b = win.getBounds(); saveQuickLaunchPrefs({ [qlLayout]: { x: b.x, y: b.y, w: b.width, h: b.height } }); } catch {}
    }
    // 2) Chuyển bố cục
    qlLayout = next;
    saveQuickLaunchPrefs({ layout: next });
    if (!alive) return;
    // 3) Khôi phục vị trí + bề rộng của bố cục mới (chiều cao để renderer ôm sát theo nội dung)
    const slot = qlSlotOf(loadQuickLaunchPrefs(), next);
    const def = qlDefaultSize(next);
    const w = Math.max(320, parseInt(slot.w, 10) || def.w);
    const h = Math.max(150, parseInt(slot.h, 10) || def.h);
    try {
        const cur = win.getBounds();
        const pos = clampBoundsToVisible(
            Number.isFinite(slot.x) ? slot.x : cur.x,
            Number.isFinite(slot.y) ? slot.y : cur.y,
            w, h
        );
        win.setBounds({
            x: Number.isFinite(pos.x) ? pos.x : cur.x,
            y: Number.isFinite(pos.y) ? pos.y : cur.y,
            width: w, height: h
        }, true);
    } catch {}
    // renderer áp CSS + ôm sát chiều cao theo bề rộng w (không tự đổi vị trí)
    try { win.webContents.send('quick-launch:applyLayout', { mode: next, w }); } catch {}
});
ipcMain.on('quick-launch:setSize', (e, size) => {
    if (!quickLaunchWindow || quickLaunchWindow.isDestroyed()) return;
    const w = Math.max(320, Math.round(Number(size?.w) || 0));
    const h = Math.max(150, Math.round(Number(size?.h) || 0));
    if (!w || !h) return;
    try { quickLaunchWindow.setSize(w, h, true); } catch {}
});
ipcMain.on('quick-launch:close', () => {
    if (quickLaunchWindow && !quickLaunchWindow.isDestroyed()) quickLaunchWindow.close();
});
ipcMain.on('open-quick-launch', () => openQuickLaunchWindow());

// ============================================================
// 🎯 Caro Overlay Review — cửa sổ trong suốt + frameless cho OBS Window Capture
// ============================================================
// Mục đích: link OBS Browser Source render Caro overlay bị mờ do CEF của OBS down-scale
// canvas 1080×1920 nhỏ hơn nguồn → blur. Cửa sổ rời này render 1:1 ở native DPI →
// OBS dùng "Window Capture (WGC)" bắt pixel trực tiếp → sắc nét hơn. Transparent +
// frameless → OBS WGC giữ alpha → overlay vẫn trong suốt như Browser Source.
let caroPreviewWindow = null;
function getCaroPreviewPrefsPath() {
    try { return path.join(app.getPath('userData'), 'data', 'caro-preview.json'); }
    catch { return null; }
}
function loadCaroPreviewPrefs() {
    try {
        const p = getCaroPreviewPrefsPath();
        if (!p || !fs.existsSync(p)) return {};
        return JSON.parse(fs.readFileSync(p, 'utf8')) || {};
    } catch { return {}; }
}
let cpSaveTimer = null;
function saveCaroPreviewPrefs(patch) {
    if (cpSaveTimer) clearTimeout(cpSaveTimer);
    cpSaveTimer = setTimeout(() => {
        try {
            const p = getCaroPreviewPrefsPath();
            if (!p) return;
            const dir = path.dirname(p);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const cur = loadCaroPreviewPrefs();
            const next = { ...cur, ...patch };
            fs.writeFileSync(p, JSON.stringify(next, null, 2), 'utf8');
        } catch (e) { /* swallow */ }
    }, 250);
}
// Ghi ĐỒNG BỘ ngay — chốt vị trí/size cuối lúc thoát app/đóng (destroy không bắn 'close',
// timer debounce bị app.exit giết → nếu không flush sẽ mất thay đổi cuối).
function flushCaroPreviewPrefs() {
    if (cpSaveTimer) { clearTimeout(cpSaveTimer); cpSaveTimer = null; }
    if (!caroPreviewWindow || caroPreviewWindow.isDestroyed()) return;
    try {
        const b = caroPreviewWindow.getBounds();
        const p = getCaroPreviewPrefsPath(); if (!p) return;
        const next = { ...loadCaroPreviewPrefs(), x: b.x, y: b.y, w: b.width, h: b.height, alwaysOnTop: caroPreviewWindow.isAlwaysOnTop() };
        const dir = path.dirname(p);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(p, JSON.stringify(next, null, 2), 'utf8');
    } catch {}
}
function openCaroPreviewWindow() {
    if (caroPreviewWindow && !caroPreviewWindow.isDestroyed()) {
        caroPreviewWindow.show(); caroPreviewWindow.focus(); return;
    }
    const prefs = loadCaroPreviewPrefs();
    // Default 540×960 = 1080×1920 portrait /2 — fitScale() trong overlay tự adapt theo size
    const opts = {
        width:  Math.max(270, parseInt(prefs.w, 10) || 540),
        height: Math.max(480, parseInt(prefs.h, 10) || 960),
        minWidth: 270,
        minHeight: 480,
        resizable: true,
        maximizable: true,
        fullscreenable: false,
        title: 'HP Caro — Overlay Review (OBS Window Capture)',
        icon: getIcon(),
        backgroundColor: '#00000000',   // alpha 00 = transparent — OBS WGC giữ alpha
        transparent: true,
        frame: false,
        hasShadow: false,
        alwaysOnTop: prefs.alwaysOnTop === true,
        skipTaskbar: false,
        show: false,
        webPreferences: {
            contextIsolation: true,
            sandbox: false,
            preload: path.join(__dirname, 'caro-preview-preload.js')
        }
    };
    Object.assign(opts, clampBoundsToVisible(prefs.x, prefs.y, opts.width, opts.height));
    caroPreviewWindow = new BrowserWindow(opts);
    caroPreviewWindow.loadURL(`${APP_URL}/overlay/caro?popout=1`);
    caroPreviewWindow.once('ready-to-show', () => caroPreviewWindow.show());
    const persistBounds = () => {
        if (!caroPreviewWindow || caroPreviewWindow.isDestroyed()) return;
        try {
            const b = caroPreviewWindow.getBounds();
            saveCaroPreviewPrefs({ x: b.x, y: b.y, w: b.width, h: b.height });
        } catch {}
    };
    caroPreviewWindow.on('moved',  persistBounds);
    caroPreviewWindow.on('resize', persistBounds);
    caroPreviewWindow.on('close',  () => { persistBounds(); flushCaroPreviewPrefs(); });
    caroPreviewWindow.on('closed', () => { caroPreviewWindow = null; });
    caroPreviewWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url); return { action: 'deny' };
    });
}
ipcMain.on('caro-preview:setAlwaysOnTop', (e, on) => {
    if (caroPreviewWindow && !caroPreviewWindow.isDestroyed()) {
        caroPreviewWindow.setAlwaysOnTop(!!on);
        saveCaroPreviewPrefs({ alwaysOnTop: !!on });
    }
});
ipcMain.on('caro-preview:close', () => {
    if (caroPreviewWindow && !caroPreviewWindow.isDestroyed()) caroPreviewWindow.close();
});
ipcMain.on('open-caro-preview', () => openCaroPreviewWindow());

// ============================================================
// 🍂 Nhặt Lá — cửa sổ desktop tương tác cho canvas 1080×1920
// ============================================================
let nhatLaPreviewWindow = null;
let nhatLaPreviewToolbarWindow = null;
let nhatLaPreviewSaveTimer = null;
let nhatLaPreviewDragOrigin = null;
let nhatLaPreviewIsClosing = false;
let nhatLaPreviewPrefs = null;
function getNhatLaPreviewPrefsPath() {
    try { return path.join(app.getPath('userData'), 'data', 'nhatla-preview.json'); }
    catch { return null; }
}
function loadNhatLaPreviewPrefs() {
    if (nhatLaPreviewPrefs) return { ...nhatLaPreviewPrefs };
    try {
        const prefsPath = getNhatLaPreviewPrefsPath();
        nhatLaPreviewPrefs = prefsPath && fs.existsSync(prefsPath)
            ? (JSON.parse(fs.readFileSync(prefsPath, 'utf8')) || {})
            : {};
    } catch { nhatLaPreviewPrefs = {}; }
    return { ...nhatLaPreviewPrefs };
}
function saveNhatLaPreviewPrefs(bounds) {
    nhatLaPreviewPrefs = { ...loadNhatLaPreviewPrefs(), ...(bounds || {}) };
    if (nhatLaPreviewSaveTimer) clearTimeout(nhatLaPreviewSaveTimer);
    nhatLaPreviewSaveTimer = setTimeout(() => {
        try {
            const prefsPath = getNhatLaPreviewPrefsPath();
            if (!prefsPath) return;
            const dir = path.dirname(prefsPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(prefsPath, JSON.stringify(nhatLaPreviewPrefs, null, 2), 'utf8');
        } catch {}
    }, 250);
}
function nhatLaPreviewState() {
    const prefs = loadNhatLaPreviewPrefs();
    return { pinned: prefs.pinned === true, locked: prefs.locked === true };
}
function saveCurrentNhatLaPreviewBounds() {
    if (!nhatLaPreviewWindow || nhatLaPreviewWindow.isDestroyed()) return;
    try {
        const b = nhatLaPreviewWindow.getBounds();
        saveNhatLaPreviewPrefs({ ...loadNhatLaPreviewPrefs(), x: b.x, y: b.y, w: b.width, h: b.height });
    } catch {}
}
function syncNhatLaPreviewToolbar() {
    if (!nhatLaPreviewWindow || nhatLaPreviewWindow.isDestroyed() || !nhatLaPreviewToolbarWindow || nhatLaPreviewToolbarWindow.isDestroyed()) return;
    try {
        const b = nhatLaPreviewWindow.getBounds();
        const workArea = screen.getDisplayMatching(b).workArea;
        const barHeight = 42;
        nhatLaPreviewToolbarWindow.setBounds({
            x: b.x,
            y: Math.max(workArea.y, b.y - barHeight - 4),
            width: b.width,
            height: barHeight
        });
        nhatLaPreviewToolbarWindow.webContents.send('nhatla-preview:state', nhatLaPreviewState());
    } catch {}
}
function setNhatLaPreviewPinned(pinned) {
    if (!nhatLaPreviewWindow || nhatLaPreviewWindow.isDestroyed()) return;
    try {
        nhatLaPreviewWindow.setAlwaysOnTop(!!pinned, pinned ? 'floating' : 'normal');
        if (nhatLaPreviewToolbarWindow && !nhatLaPreviewToolbarWindow.isDestroyed()) nhatLaPreviewToolbarWindow.setAlwaysOnTop(!!pinned, pinned ? 'floating' : 'normal');
        saveNhatLaPreviewPrefs({ ...loadNhatLaPreviewPrefs(), pinned: !!pinned });
        syncNhatLaPreviewToolbar();
    } catch {}
}
function setNhatLaPreviewLocked(locked) {
    if (!nhatLaPreviewWindow || nhatLaPreviewWindow.isDestroyed()) return;
    try {
        nhatLaPreviewWindow.setMovable(!locked);
        nhatLaPreviewWindow.setResizable(!locked);
        saveNhatLaPreviewPrefs({ ...loadNhatLaPreviewPrefs(), locked: !!locked });
        syncNhatLaPreviewToolbar();
    } catch {}
}
function openNhatLaPreviewWindow() {
    if (nhatLaPreviewWindow && !nhatLaPreviewWindow.isDestroyed()) {
        if (!nhatLaPreviewToolbarWindow || nhatLaPreviewToolbarWindow.isDestroyed()) {
            nhatLaPreviewWindow.once('closed', () => openNhatLaPreviewWindow());
            nhatLaPreviewWindow.close();
            return;
        }
        nhatLaPreviewWindow.show();
        nhatLaPreviewToolbarWindow.show();
        nhatLaPreviewWindow.focus();
        syncNhatLaPreviewToolbar();
        return;
    }
    nhatLaPreviewIsClosing = false;
    const prefs = loadNhatLaPreviewPrefs();
    const area = screen.getPrimaryDisplay().workArea;
    // Default 9:16 vừa laptop. Nội dung overlay tự scale từ stage gốc 1080×1920.
    const defaultHeight = Math.min(900, Math.max(480, area.height - 110));
    const maxHeight = Math.max(480, Math.min(area.height - 50, Math.floor((area.width - 50) * 16 / 9)));
    // Chỉ lưu chiều cao làm nguồn; prefs cũ từ cửa sổ có titlebar có thể không đúng 9:16.
    const height = Math.max(480, Math.min(parseInt(prefs.h, 10) || defaultHeight, maxHeight));
    const width = Math.round(height * 9 / 16);
    const opts = {
        width,
        height,
        minWidth: 270,
        minHeight: 480,
        useContentSize: true,
        resizable: true,
        movable: true,
        maximizable: false,
        title: 'HP Nhặt Lá — Overlay Canvas',
        icon: getIcon(),
        backgroundColor: '#00000000',
        transparent: true,
        // Canvas này là mục duy nhất OBS Window Capture cần chọn: không titlebar, không toolbar.
        frame: false,
        hasShadow: false,
        skipTaskbar: false,
        show: false,
        webPreferences: { contextIsolation: true, sandbox: false }
    };
    Object.assign(opts, clampBoundsToVisible(prefs.x, prefs.y, width, height));
    nhatLaPreviewWindow = new BrowserWindow(opts);
    // Resize tại góc trái/phải dưới vẫn giữ chuẩn 9:16 tương ứng canvas 1080×1920.
    nhatLaPreviewWindow.setAspectRatio(9 / 16);
    nhatLaPreviewWindow.loadURL(`${APP_URL}/overlay/nhatla?preview=1`);
    nhatLaPreviewToolbarWindow = new BrowserWindow({
        width,
        height: 42,
        frame: false,
        transparent: true,
        resizable: false,
        movable: false,
        focusable: true,
        skipTaskbar: true,
        hasShadow: false,
        show: false,
        webPreferences: {
            contextIsolation: true,
            sandbox: false,
            preload: path.join(__dirname, 'nhatla-preview-toolbar-preload.js')
        }
    });
    nhatLaPreviewToolbarWindow.loadURL(`${APP_URL}/games/nhatla/preview-toolbar.html`);
    nhatLaPreviewWindow.once('ready-to-show', () => {
        const state = nhatLaPreviewState();
        setNhatLaPreviewPinned(state.pinned);
        setNhatLaPreviewLocked(state.locked);
        nhatLaPreviewWindow.show();
        syncNhatLaPreviewToolbar();
        nhatLaPreviewToolbarWindow?.show();
    });
    nhatLaPreviewToolbarWindow.once('ready-to-show', syncNhatLaPreviewToolbar);
    nhatLaPreviewWindow.on('moved', () => { saveCurrentNhatLaPreviewBounds(); syncNhatLaPreviewToolbar(); });
    nhatLaPreviewWindow.on('resize', () => { saveCurrentNhatLaPreviewBounds(); syncNhatLaPreviewToolbar(); });
    nhatLaPreviewWindow.on('close', () => {
        nhatLaPreviewIsClosing = true;
        nhatLaPreviewDragOrigin = null;
        saveCurrentNhatLaPreviewBounds();
        if (nhatLaPreviewToolbarWindow && !nhatLaPreviewToolbarWindow.isDestroyed()) nhatLaPreviewToolbarWindow.close();
    });
    nhatLaPreviewWindow.on('closed', () => {
        nhatLaPreviewWindow = null;
        nhatLaPreviewToolbarWindow = null;
        nhatLaPreviewIsClosing = false;
    });
    nhatLaPreviewToolbarWindow.on('closed', () => {
        nhatLaPreviewDragOrigin = null;
        if (!nhatLaPreviewIsClosing && nhatLaPreviewWindow && !nhatLaPreviewWindow.isDestroyed()) nhatLaPreviewWindow.close();
    });
    nhatLaPreviewWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
}

ipcMain.on('nhatla-preview:dragStart', () => {
    if (!nhatLaPreviewWindow || nhatLaPreviewWindow.isDestroyed() || nhatLaPreviewState().locked) return;
    try { nhatLaPreviewDragOrigin = nhatLaPreviewWindow.getBounds(); } catch {}
});
ipcMain.on('nhatla-preview:dragMove', (_event, payload) => {
    if (!nhatLaPreviewWindow || nhatLaPreviewWindow.isDestroyed() || !nhatLaPreviewDragOrigin || nhatLaPreviewState().locked) return;
    const origin = nhatLaPreviewDragOrigin;
    const dx = Number(payload?.dx) || 0;
    const dy = Number(payload?.dy) || 0;
    const safe = clampBoundsToVisible(origin.x + dx, origin.y + dy, origin.width, origin.height);
    // Khóa đúng size gốc trong lúc kéo thanh, tránh DPI/aspect ratio làm canvas nở hoặc trôi.
    try {
        nhatLaPreviewWindow.setBounds({
            x: safe.x ?? origin.x + dx,
            y: safe.y ?? origin.y + dy,
            width: origin.width,
            height: origin.height
        });
    } catch {}
});
ipcMain.on('nhatla-preview:dragEnd', () => { nhatLaPreviewDragOrigin = null; saveCurrentNhatLaPreviewBounds(); });
ipcMain.on('nhatla-preview:togglePin', () => setNhatLaPreviewPinned(!nhatLaPreviewState().pinned));
ipcMain.on('nhatla-preview:toggleLock', () => setNhatLaPreviewLocked(!nhatLaPreviewState().locked));
ipcMain.on('nhatla-preview:close', () => {
    if (nhatLaPreviewWindow && !nhatLaPreviewWindow.isDestroyed()) nhatLaPreviewWindow.close();
});

// ============================================================
// 📦 Danh sách quà — cửa sổ tách rời, ghim trên cùng
// ============================================================
// User mở để test quà mọi game mà KHÔNG cần ở lại tab Hũ Thủy Tinh. Click 1 quà →
// POST /api/games/thuytinh/test-gift → emitGift broadcast toàn cục → main window
// route vào game đang bật. Lưu bounds + alwaysOnTop qua phiên (file disk dưới userData).
let giftListWindow = null;
function getGiftListPrefsPath() {
    try { return path.join(app.getPath('userData'), 'data', 'gift-list.json'); }
    catch { return null; }
}
function loadGiftListPrefs() {
    try {
        const p = getGiftListPrefsPath();
        if (!p || !fs.existsSync(p)) return {};
        return JSON.parse(fs.readFileSync(p, 'utf8')) || {};
    } catch { return {}; }
}
let glSaveTimer = null;
function saveGiftListPrefs(patch) {
    if (glSaveTimer) clearTimeout(glSaveTimer);
    glSaveTimer = setTimeout(() => {
        try {
            const p = getGiftListPrefsPath();
            if (!p) return;
            const dir = path.dirname(p);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const cur = loadGiftListPrefs();
            const next = { ...cur, ...patch };
            fs.writeFileSync(p, JSON.stringify(next, null, 2), 'utf8');
        } catch (e) { /* swallow */ }
    }, 250);
}
// Ghi ĐỒNG BỘ ngay — chốt vị trí/size cuối lúc thoát app/đóng (xem flushCaroPreviewPrefs).
function flushGiftListPrefs() {
    if (glSaveTimer) { clearTimeout(glSaveTimer); glSaveTimer = null; }
    if (!giftListWindow || giftListWindow.isDestroyed()) return;
    try {
        const b = giftListWindow.getBounds();
        const p = getGiftListPrefsPath(); if (!p) return;
        const next = { ...loadGiftListPrefs(), x: b.x, y: b.y, w: b.width, h: b.height, alwaysOnTop: giftListWindow.isAlwaysOnTop() };
        const dir = path.dirname(p);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(p, JSON.stringify(next, null, 2), 'utf8');
    } catch {}
}
function openGiftListWindow() {
    if (giftListWindow && !giftListWindow.isDestroyed()) {
        giftListWindow.show(); giftListWindow.focus(); return;
    }
    const prefs = loadGiftListPrefs();
    const opts = {
        width:  Math.max(300, parseInt(prefs.w, 10) || 420),
        height: Math.max(320, parseInt(prefs.h, 10) || 620),
        minWidth: 300,
        minHeight: 320,
        resizable: true,
        maximizable: true,
        fullscreenable: false,
        title: 'HP — Danh sách quà',
        icon: getIcon(),
        backgroundColor: '#0b0d12',
        alwaysOnTop: prefs.alwaysOnTop !== false,   // mặc định Pin = on
        autoHideMenuBar: true,
        frame: false,
        skipTaskbar: false,
        show: false,
        webPreferences: {
            contextIsolation: true,
            sandbox: false,
            preload: path.join(__dirname, 'gift-list-preload.js')
        }
    };
    Object.assign(opts, clampBoundsToVisible(prefs.x, prefs.y, opts.width, opts.height));
    giftListWindow = new BrowserWindow(opts);
    giftListWindow.loadURL(`${APP_URL}/gift-list`);
    giftListWindow.once('ready-to-show', () => {
        try { giftListWindow.webContents.send('gift-list:initPin', opts.alwaysOnTop); } catch {}
        giftListWindow.show();
    });
    const persistBounds = () => {
        if (!giftListWindow || giftListWindow.isDestroyed()) return;
        try {
            const b = giftListWindow.getBounds();
            saveGiftListPrefs({ x: b.x, y: b.y, w: b.width, h: b.height });
        } catch {}
    };
    giftListWindow.on('moved',  persistBounds);
    giftListWindow.on('resize', persistBounds);
    giftListWindow.on('close',  () => { persistBounds(); flushGiftListPrefs(); });
    giftListWindow.on('closed', () => { giftListWindow = null; });
    giftListWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url); return { action: 'deny' };
    });
}
ipcMain.on('gift-list:setAlwaysOnTop', (e, on) => {
    if (giftListWindow && !giftListWindow.isDestroyed()) {
        giftListWindow.setAlwaysOnTop(!!on);
        saveGiftListPrefs({ alwaysOnTop: !!on });
    }
});
ipcMain.on('gift-list:close', () => {
    if (giftListWindow && !giftListWindow.isDestroyed()) giftListWindow.close();
});
ipcMain.on('open-gift-list', () => openGiftListWindow());

app.whenReady().then(async () => {
    startServer();
    createSplash();
    try {
        await waitForServerReady();
    } catch (e) {
        dialog.showErrorBox('Server không phản hồi', 'Không thể kết nối tới ' + APP_URL);
        fullQuit({ skipConfirm: true });
        return;
    }
    createMainWindow();
    buildTray();
    // Auto-mở cửa sổ Khởi động nhanh sau khi main window sẵn sàng.
    // Mặc định BẬT. User có thể tắt qua prefs file (quick-launch.json: autoOpen: false).
    setTimeout(() => {
        try {
            const prefs = loadQuickLaunchPrefs();
            if (prefs.autoOpen === false) return;   // user explicitly disabled
            openQuickLaunchWindow();
        } catch (e) {}
    }, 1500);
});

// ============================================================
// NHIỆT ĐỘ — cửa sổ overlay popout (transparent + title bar để kéo)
// 2 mode: bình thường (frame), hoặc pin (frame + alwaysOnTop)
// ============================================================
let nhietDoPinWindow = null;
let nhietDoPopoutWindow = null;
const NHIETDO_PIN_PREFS_FILE = path.join(app.getPath('userData'), 'nhietdo-pin-prefs.json');
function loadNhietDoPinPrefs() {
    try { return JSON.parse(fs.readFileSync(NHIETDO_PIN_PREFS_FILE, 'utf8')); } catch { return {}; }
}
function saveNhietDoPinPrefs(patch) {
    try {
        const cur = loadNhietDoPinPrefs();
        fs.writeFileSync(NHIETDO_PIN_PREFS_FILE, JSON.stringify({ ...cur, ...patch }, null, 2));
    } catch {}
}
// Chốt vị trí/size cuối của cả 2 cửa sổ (pin + popout) lúc thoát app — saveNhietDoPinPrefs
// vốn ghi đồng bộ theo từng move, đây là lưới an toàn cho lần thoát.
function flushNhietDoPinPrefs() {
    const grab = (win, slotKey) => {
        if (!win || win.isDestroyed()) return null;
        try { const b = win.getBounds(); return { [slotKey]: { x: b.x, y: b.y, w: b.width, h: b.height } }; }
        catch { return null; }
    };
    const patch = { ...(grab(nhietDoPinWindow, 'pin') || {}), ...(grab(nhietDoPopoutWindow, 'popout') || {}) };
    if (Object.keys(patch).length) saveNhietDoPinPrefs(patch);
}
function openNhietDoPopoutWindow({ pin = false, edit = false } = {}) {
    // Reuse target window theo mode
    const slotKey = pin ? 'pin' : 'popout';
    let target = pin ? nhietDoPinWindow : nhietDoPopoutWindow;
    if (target && !target.isDestroyed()) {
        try { target.focus(); return; } catch {}
    }
    const prefs = loadNhietDoPinPrefs();
    const sub = prefs[slotKey] || {};
    const opts = {
        width:  Math.max(200, parseInt(sub.w, 10) || (pin ? 360 : 540)),
        height: Math.max(360, parseInt(sub.h, 10) || (pin ? 640 : 960)),
        minWidth: 200, minHeight: 360,
        title: pin ? 'HP Nhiệt Độ — Pinned' : 'HP Nhiệt Độ — Overlay',
        icon: getIcon(),
        backgroundColor: '#00000000',   // alpha 00 = nền hoàn toàn trong suốt
        transparent: true,
        frame: true,                    // title bar để KÉO + đóng cửa sổ (fix bug pin không kéo được)
        hasShadow: false,
        alwaysOnTop: pin,
        skipTaskbar: false,
        show: false,
        webPreferences: { contextIsolation: true, sandbox: false }
    };
    Object.assign(opts, clampBoundsToVisible(sub.x, sub.y, opts.width, opts.height));
    const win = new BrowserWindow(opts);
    // Pin (Sửa Overlay): ghim NỔI TRÊN MỌI cửa sổ — kể cả OBS / projector always-on-top.
    // Dùng level 'screen-saver' (cao hơn 'floating' mặc định) để không bị OBS che khi user
    // bấm qua lại. Chỉnh xong bấm chuột phải trong overlay là tự đóng (handler trong overlay.html).
    if (pin) { try { win.setAlwaysOnTop(true, 'screen-saver'); } catch {} }
    const params = [];
    if (pin) params.push('pin=1');
    if (edit) params.push('edit=1');
    win.loadURL(`${APP_URL}/overlay/nhietdo${params.length ? '?' + params.join('&') : ''}`);
    win.once('ready-to-show', () => win.show());
    const persist = () => {
        if (!win || win.isDestroyed()) return;
        try {
            const b = win.getBounds();
            saveNhietDoPinPrefs({ [slotKey]: { x: b.x, y: b.y, w: b.width, h: b.height } });
        } catch {}
    };
    win.on('moved', persist);
    win.on('resize', persist);
    win.on('close', persist);
    win.on('closed', () => {
        if (pin) nhietDoPinWindow = null;
        else nhietDoPopoutWindow = null;
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url); return { action: 'deny' };
    });
    if (pin) nhietDoPinWindow = win;
    else nhietDoPopoutWindow = win;
}

// ============================================================
// BẮN CUNG — global hotkeys (work even when app not focused)
// Server.js calls global.__bancungApplyHotkeys(cfg) khi config update.
// Mỗi hotkey fired → POST tới /api/games/bancung/control (cùng REST như UI).
// ============================================================
let _bancungAccels = [];
function unregisterBancungHotkeys() {
    for (const a of _bancungAccels) { try { globalShortcut.unregister(a); } catch (_) {} }
    _bancungAccels = [];
}
async function _bancungCallApi(body) {
    try {
        const fetch = require('node-fetch');
        await fetch(`${APP_URL}/api/games/bancung/control`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch (e) { console.warn('[bancung-hotkey] api fail:', e.message); }
}
function applyBancungHotkeys(cfg) {
    unregisterBancungHotkeys();
    const d = cfg?.display || {};
    if (cfg?.enabled === false || cfg?.sessionActive === false) return;
    if (d.globalHotkeys !== true) return;   // only when explicitly enabled
    // Auto-prefix with CommandOrControl+Shift+ so single keys (X, H, B, R) become
    // Ctrl+Shift+X etc. Tránh chặn typing thông thường ở app khác.
    const PREFIX = 'CommandOrControl+Shift+';
    const reg = (key, body) => {
        if (!key) return;
        const accel = PREFIX + key.toUpperCase();
        try {
            if (globalShortcut.register(accel, () => _bancungCallApi(body))) {
                _bancungAccels.push(accel);
            }
        } catch (e) { console.warn('[bancung-hotkey] register fail:', accel, e.message); }
    };
    reg(d.hotkeyFire,   { cmd: 'damage', shots: 1, uniqueId: 'idol', nickname: 'IDOL' });
    reg(d.hotkeyHeal,   { cmd: 'heal', hearts: 1 });
    reg(d.hotkeyShield, { cmd: 'shield', durationSec: 5 });
    reg(d.hotkeyRevive, { cmd: 'revive' });
    reg(d.hotkeyKill,   { cmd: 'killshot' });
    if (_bancungAccels.length) console.log(`[bancung] global hotkeys registered (Ctrl+Shift+): ${_bancungAccels.join(', ')}`);
}
global.__bancungApplyHotkeys = applyBancungHotkeys;

// ============================================================
// NHẶT LÁ — global test hotkeys cho từng hiệu ứng quà.
// UI ghi nhận trực tiếp tổ hợp người dùng bấm (vd Control+Shift+1, Alt+Q, F6).
// ============================================================
let _nhatlaAccels = [];
function unregisterNhatLaHotkeys() {
    for (const accel of _nhatlaAccels) { try { globalShortcut.unregister(accel); } catch (_) {} }
    _nhatlaAccels = [];
}
async function nhatLaCmd(cmd, payload) {
    try {
        const fetch = require('node-fetch');
        await fetch(`${APP_URL}/api/games/nhatla/cmd`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cmd, payload: payload || null })
        });
    } catch (e) { console.warn('[nhatla-hotkey] api fail:', e.message); }
}

// Mỗi tính năng khai báo: lấy danh sách quà ở đâu, và một phím tắt sẽ bắn lệnh gì.
// Thêm tính năng mới chỉ cần thêm một dòng vào bảng này, không phải viết lại vòng đăng ký.
// Toạ độ do MAIN PROCESS bốc rồi gửi kèm, không để overlay tự random — nếu không overlay
// và cửa sổ preview mỗi bên dựng một trường khác nhau, hai màn hình lệch hẳn nhau.
const NHATLA_HOTKEY_SOURCES = [
    {
        label: 'effect',
        list: cfg => cfg?.effects?.effectGifts,
        cmd: rule => ['effect', { effectId: rule.id }]
    },
    // GIẢI CỨU gộp gió + lốc + tự nhặt vào MỘT danh sách phẳng, mỗi hành động mang thông số
    // riêng. Trước đây ba nguồn tách rời và cmd() lấy thông số từ khối chung của cfg, nên hai
    // phím tắt cùng loại buộc phải chạy y hệt nhau. Giờ đọc thẳng từ action.params.
    // Công tắc tắt cả loại vẫn nằm ở ba khối cũ; kiểm tra theo type của từng hành động.
    {
        label: 'rescue',
        list: cfg => cfg?.rescue?.actions,
        cmd: (action, cfg) => {
            const p = action?.params || {};
            const type = action?.type;
            const block = type === 'autoClean' ? cfg?.autoClean : type === 'tornado' ? cfg?.tornado : cfg?.wind;
            if (action?.enabled === false || block?.enabled === false) return [null, null];
            if (type === 'tornado') {
                return ['tornado', {
                    x: Math.round(200 + Math.random() * 680),
                    dir: Math.random() < .5 ? 'left' : 'right',
                    seed: Math.floor(Math.random() * 1e9),
                    radius: p.radius, spin: p.spin, inward: p.inward, lift: p.lift,
                    durationMs: p.durationMs, maxLeaves: p.maxLeaves, drift: p.drift
                }];
            }
            if (type === 'autoClean') {
                return ['autoClean', { durationMs: p.durationMs, leavesPerSec: p.leavesPerSec }];
            }
            const dir = p.direction || 'random';
            return ['wind', {
                x: Math.round(120 + Math.random() * 840),
                dir: dir === 'random' ? (Math.random() < .5 ? 'left' : 'right') : dir,
                seed: Math.floor(Math.random() * 1e9),
                radius: p.radius, strength: p.strength, turbulence: p.turbulence,
                durationMs: p.durationMs, maxLeaves: p.maxLeaves
            }];
        }
    }
];

function applyNhatLaHotkeys(cfg) {
    unregisterNhatLaHotkeys();
    if (cfg?.enabled === false) return;
    // Phím trùng nhau thì phím đăng ký TRƯỚC thắng. Báo ra log thay vì im lặng bỏ qua,
    // vì người dùng gán trùng sẽ thấy "phím không ăn" mà không hiểu vì sao.
    const taken = new Map();
    for (const source of NHATLA_HOTKEY_SOURCES) {
        if (source.enabled && !source.enabled(cfg)) continue;
        const rules = Array.isArray(source.list(cfg)) ? source.list(cfg) : [];
        for (const rule of rules) {
            let accel = String(rule?.hotkey || '').trim();
            // Config cũ chỉ lưu 1 phím, trước đây được tự thêm Ctrl+Shift.
            if (/^[a-z0-9]$/i.test(accel)) accel = `Control+Shift+${accel.toUpperCase()}`;
            if (!accel) continue;
            if (source.label === 'effect' && !rule?.id) continue;
            if (taken.has(accel)) {
                console.warn(`[nhatla-hotkey] "${accel}" trùng: ${taken.get(accel)} giữ, bỏ qua ${source.label}`);
                continue;
            }
            try {
                const ok = globalShortcut.register(accel, () => {
                    // cmd() trả [null, null] khi hành động (hoặc cả loại) đang tắt — phím vẫn
                    // giữ chỗ nhưng không bắn lệnh, thay vì phải đăng ký/gỡ lại mỗi lần bật tắt.
                    const [cmd, payload] = source.cmd(rule, cfg);
                    if (cmd) nhatLaCmd(cmd, payload);
                });
                if (ok) { _nhatlaAccels.push(accel); taken.set(accel, source.label); }
                else console.warn('[nhatla-hotkey] accelerator unavailable:', accel);
            } catch (e) { console.warn('[nhatla-hotkey] register fail:', accel, e.message); }
        }
    }
    if (_nhatlaAccels.length) console.log(`[nhatla] global hotkeys registered: ${_nhatlaAccels.join(', ')}`);
}
global.__nhatlaApplyHotkeys = applyNhatLaHotkeys;

app.on('before-quit', () => { isQuitting = true; try { unregisterBancungHotkeys(); unregisterNhatLaHotkeys(); } catch (_) {} });
app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch (_) {} });
app.on('window-all-closed', () => {
    // Theo behavior cũ: macOS auto-quit, Windows giữ ở tray.
    // KHÔNG fullQuit ở đây — nếu GPU crash khiến windows đóng trước khi tray dựng xong,
    // fullQuit sẽ bị trigger nhầm. fullQuit() chỉ từ tray menu "Thoát" hoặc signal.
    if (process.platform === 'darwin') app.quit();
});
app.on('activate', () => {
    if (!mainWindow) createMainWindow();
    else { mainWindow.setSkipTaskbar(false); mainWindow.show(); mainWindow.focus(); }
});

// Kéo signal ctrl+c / kill từ terminal về fullQuit để cleanup đầy đủ
// SIGINT/SIGTERM = user dứt khoát muốn thoát (ctrl+c terminal, OS shutdown) → bỏ qua confirm dialog
process.on('SIGINT', () => fullQuit({ skipConfirm: true }));
process.on('SIGTERM', () => fullQuit({ skipConfirm: true }));
