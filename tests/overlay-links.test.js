// node --test tests/overlay-links.test.js
// Mọi link overlay đưa cho người dùng (📋 Link OBS, ô link) phải ra dạng http://hpaction.obs:<port>/…
// vì TikTok LIVE Studio chặn "localhost"/"127.0.0.1" ở ô Link nguồn. Đường duy nhất: window.buildOverlayURL()
// (public/app.js) phía client, overlayPublicUrl() phía server. Test này quét mã để game mới không tự ghép
// location.origin / localhost thành link OBS.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['assets', 'vendor', 'mediapipe', 'node_modules']);

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out); }
        else if (/\.(m?js|html)$/.test(e.name)) out.push(path.join(dir, e.name));
    }
    return out;
}

// Dòng ghép link tới trang overlay/OBS từ origin hiện tại hoặc localhost cứng.
const BUILDS_LINK = /(location\.origin|location\.host\b|https?:\/\/(localhost|127\.0\.0\.1))[^\n]*['"`]?\/(overlay|_prototype)\//;
// Được phép: dòng có buildOverlayURL (fallback khi panel chạy ngoài app) hoặc chỉ mở cửa sổ xem thử trong máy.
const ALLOWED = /buildOverlayURL|window\.open\(/;

test('panel/overlay không tự ghép link OBS từ location.origin hay localhost', () => {
    const bad = [];
    for (const file of walk(path.join(ROOT, 'public'))) {
        const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
        lines.forEach((line, i) => {
            // Xét cả 2 dòng trước: ternary xuống dòng `buildOverlayURL(...)\n : location.origin + ...`.
            const ctx = lines.slice(Math.max(0, i - 2), i + 1).join('\n');
            if (BUILDS_LINK.test(line) && !ALLOWED.test(ctx)) bad.push(`${path.relative(ROOT, file)}:${i + 1}: ${line.trim().slice(0, 140)}`);
        });
    }
    assert.deepEqual(bad, [], 'Dùng window.buildOverlayURL(path) để ra link hpaction.obs:\n' + bad.join('\n'));
});

test('server không tạo link overlay dạng localhost cho người dùng / nguồn OBS', () => {
    const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    assert.match(src, /function overlayPublicUrl\(/);
    assert.doesNotMatch(src, /overlayUrl:\s*\(\)\s*=>\s*`http:\/\/localhost/);
});

test('buildOverlayURL ra http://hpaction.obs:<port> ngay từ đầu, chỉ về localhost khi hosts chưa map', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
    const start = src.indexOf("const OBS_HOST = 'hpaction.obs';");
    const end = src.indexOf('    // Expose ra window');
    assert.ok(start > 0 && end > start, 'không tìm thấy khối buildOverlayURL trong app.js');
    const make = (loc, share) => {
        const body = src.slice(start, end).replace(/fetch\('\/api\/overlay\/share-links'\)[\s\S]*?\.catch\(\(\) => \{\}\);/, '');
        // eslint-disable-next-line no-new-func
        return new Function('location', 'getOverlayResolution', 'share',
            body + '\nobsShareInfo = share; return buildOverlayURL;')(loc, () => 'hd', share);
    };
    const local = { hostname: 'localhost', port: '3000', protocol: 'http:', origin: 'http://localhost:3000' };

    // Chưa có trả lời server → vẫn hpaction.obs (không còn khoảnh khắc ra localhost lúc mở app).
    assert.equal(make(local, null)('/overlay/caro'), 'http://hpaction.obs:3000/overlay/caro');
    // Game mới bất kỳ, kể cả có query → tự theo cùng dạng.
    assert.equal(make(local, null)('/overlay/game-moi?x=1'), 'http://hpaction.obs:3000/overlay/game-moi?x=1');
    assert.equal(make(local, { ok: true, mapped: true, host: 'hpaction.obs', port: 3000 })('/_prototype/timer.html?mode=overlay'),
        'http://hpaction.obs:3000/_prototype/timer.html?mode=overlay');
    // Link đầy đủ localhost của chính server → đổi host.
    assert.equal(make(local, null)('http://localhost:3000/overlay/caro'), 'http://hpaction.obs:3000/overlay/caro');
    // Hosts chưa map → localhost (link .obs sẽ không mở được).
    assert.equal(make(local, { ok: true, mapped: false, host: 'hpaction.obs', port: 3000 })('/overlay/caro'), 'http://localhost:3000/overlay/caro');
    // Mở app từ máy khác trong LAN → giữ IP LAN.
    const lan = { hostname: '192.168.1.5', port: '3000', protocol: 'http:', origin: 'http://192.168.1.5:3000' };
    assert.equal(make(lan, null)('/overlay/caro'), 'http://192.168.1.5:3000/overlay/caro');
});
