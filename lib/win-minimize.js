'use strict';
// Thu nhỏ cửa sổ Edge/Chrome của trang nghe theo tiền tố tiêu đề (chế độ "chạy ngầm" của Phụ đề giọng
// Creator). Node không gọi được user32 trực tiếp → nhờ PowerShell (-EncodedCommand để tiêu đề tiếng Việt
// và dấu nháy không phải escape qua dòng lệnh). Nhận diện giọng vẫn chạy khi cửa sổ thu nhỏ.

// DÒ LẠI nhiều lần chứ không chỉ 1 lần: lúc trang vừa báo "đang nghe", cửa sổ Edge thường CHƯA có
// MainWindowHandle/tiêu đề → lượt dò duy nhất trước đây đếm 0 và cửa sổ cứ nằm giữa màn hình. Edge cũng
// có thể tự bung cửa sổ lại ngay sau khi xin micro → chỉ dừng khi cửa sổ đã thu nhỏ YÊN qua vài lượt kiểm.
// Tối đa ~12 s (48 × 250 ms) rồi tự thoát.
function minimizeScript(titlePrefix) {
    const t = String(titlePrefix || '').replace(/'/g, "''");
    return [
        'Add-Type @"',
        'using System; using System.Runtime.InteropServices;',
        'public class HpWin { [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int cmd); [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h); }',
        '"@',
        `$t = '${t}*'`,
        '$n = 0',
        '$calm = 0',
        'for ($i = 0; $i -lt 48; $i++) {',
        '  $found = 0; $open = 0',
        '  foreach ($p in Get-Process msedge,chrome -ErrorAction SilentlyContinue) {',
        '    if ($p.MainWindowHandle -ne 0 -and $p.MainWindowTitle -like $t) {',
        '      $found++',
        '      if (-not [HpWin]::IsIconic($p.MainWindowHandle)) { $open++; [HpWin]::ShowWindowAsync($p.MainWindowHandle, 6) | Out-Null; $n++ }',
        '    }',
        '  }',
        '  if ($found -gt 0 -and $open -eq 0) { $calm++; if ($calm -ge 4) { break } } else { $calm = 0 }',
        '  Start-Sleep -Milliseconds 250',
        '}',
        'Write-Output $n'
    ].join('\n');
}

function minimizeWindowByTitle(titlePrefix, { spawn = require('child_process').spawn } = {}) {
    const encoded = Buffer.from(minimizeScript(titlePrefix), 'utf16le').toString('base64');
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true, stdio: 'ignore' });
    try { child.on('error', () => {}); child.unref(); } catch (e) {}
    return child;
}

module.exports = { minimizeScript, minimizeWindowByTitle };
