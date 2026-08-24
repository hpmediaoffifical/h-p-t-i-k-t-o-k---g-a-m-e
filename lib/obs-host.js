// lib/obs-host.js
// Map "hpaction.obs" -> 127.0.0.1 trong hosts file Windows.
//
// TẠI SAO CẦN: TikTok LIVE Studio (và vài phần mềm nhận "Link" nguồn khác) từ chối thẳng
// chuỗi "localhost"/"127.0.0.1" trong ô URL — validator của họ vốn viết để chống SSRF cho
// dashboard cloud, nên chặn theo TÊN chứ không theo khả năng kết nối. Một hostname bình
// thường trỏ về loopback thì qua được bộ lọc đó mà traffic vẫn chạy nội bộ, không mở cổng
// nào ra internet. Các phần mềm overlay khác trên máy user cũng làm đúng vậy — hosts file
// thường đã có sẵn hpstudio.obs / hpnpc.obs / hpbar.obs của họ.
//
// AN TOÀN: chỉ APPEND một dòng có marker, không bao giờ viết đè hay xoá dòng của app khác.
// Backup hosts -> hosts.hpaction.bak trước khi sửa. Idempotent: đã có thì không làm gì.
//
// Ghi hosts file cần quyền Administrator, nên phần sửa chạy qua PowerShell elevated
// (Start-Process -Verb RunAs => 1 popup UAC). Dùng -EncodedCommand thay vì file .ps1 để
// khỏi vướng ExecutionPolicy và khỏi phải escape quote nhiều tầng.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const OBS_HOST = 'hpaction.obs';
const HOSTS_PATH = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts');
const MARKER = '# HP Action LIVE';

/** Đọc hosts file. Đọc được không cần admin; lỗi thì coi như rỗng. */
function readHosts() {
    try { return fs.readFileSync(HOSTS_PATH, 'utf8'); } catch (e) { return ''; }
}

/**
 * hpaction.obs đã trỏ về loopback chưa?
 * Bỏ qua dòng comment (#) để không nhận nhầm dòng đã bị user comment out.
 */
function isHostMapped(hostname = OBS_HOST) {
    const re = new RegExp(`^\\s*127\\.0\\.0\\.1\\s+${hostname.replace(/\./g, '\\.')}(\\s|$)`, 'im');
    return readHosts()
        .split(/\r?\n/)
        .filter(line => !line.trim().startsWith('#'))
        .some(line => re.test(line));
}

/**
 * Thêm mapping vào hosts file (bật popup UAC). Trả Promise<{ok, alreadyMapped, error}>.
 * KHÔNG throw — hỏng thì app vẫn chạy bình thường qua localhost, chỉ mất domain .obs.
 */
function ensureHostMapping({ hostname = OBS_HOST, timeoutMs = 60000 } = {}) {
    return new Promise((resolve) => {
        if (process.platform !== 'win32') {
            return resolve({ ok: false, alreadyMapped: false, error: 'not_windows' });
        }
        if (isHostMapped(hostname)) {
            return resolve({ ok: true, alreadyMapped: true });
        }

        // Script chạy trong tiến trình elevated. Tự kiểm tra lại lần nữa (tránh race khi
        // user bấm 2 lần) rồi mới append.
        const inner = `
$ErrorActionPreference = 'Stop'
$hosts = Join-Path $env:WINDIR 'System32\\drivers\\etc\\hosts'
$existing = @(Get-Content -Path $hosts -ErrorAction SilentlyContinue)
$already = $existing | Where-Object { $_ -notmatch '^\\s*#' -and $_ -match '^\\s*127\\.0\\.0\\.1\\s+${hostname.replace(/\./g, '\\.')}(\\s|$)' }
if (-not $already) {
    Copy-Item -Path $hosts -Destination "$hosts.hpaction.bak" -Force -ErrorAction SilentlyContinue
    Add-Content -Path $hosts -Value "\`r\`n127.0.0.1\`t${hostname}\`t${MARKER}" -Encoding ASCII
}
ipconfig /flushdns | Out-Null
`.trim();

        const encoded = Buffer.from(inner, 'utf16le').toString('base64');
        // Lớp ngoài KHÔNG elevated: nó chỉ gọi Start-Process -Verb RunAs để bật UAC, rồi
        // -Wait để mình biết lúc nào xong mà verify lại hosts file.
        const outer = `Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','${encoded}'`;

        const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', outer], {
            windowsHide: true,
            stdio: ['ignore', 'ignore', 'pipe']
        });

        let stderr = '';
        child.stderr?.on('data', (d) => { stderr += String(d); });

        const timer = setTimeout(() => {
            try { child.kill(); } catch (e) {}
            resolve({ ok: false, alreadyMapped: false, error: 'timeout' });
        }, timeoutMs);

        child.on('error', (err) => {
            clearTimeout(timer);
            resolve({ ok: false, alreadyMapped: false, error: err.message });
        });

        child.on('exit', () => {
            clearTimeout(timer);
            // Nguồn sự thật là hosts file, không phải exit code: user bấm "No" ở UAC thì
            // Start-Process throw và exit code khác 0, nhưng cũng có trường hợp ghi xong mà
            // vẫn có stderr rác. Cứ đọc lại file cho chắc.
            if (isHostMapped(hostname)) return resolve({ ok: true, alreadyMapped: false });
            resolve({
                ok: false,
                alreadyMapped: false,
                error: /canceled|cancelled|denied/i.test(stderr) ? 'uac_declined' : (stderr.trim() || 'not_written')
            });
        });
    });
}

module.exports = { OBS_HOST, HOSTS_PATH, isHostMapped, ensureHostMapping };
