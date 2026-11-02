'use strict';
// Kiểm giao diện thẻ "HP Game Hub" bằng cách ĐỌC mã nguồn (không dựng server / trình duyệt: server.js chạm máy chủ giấy phép + Google Sheet).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const HTML = read('public/index.html');
const APP = read('public/app.js');
const QUICK = read('public/quick-launch.html');
const CSS = read('public/style.css');

function between(s, a, b) {
    const i = s.indexOf(a);
    assert.ok(i >= 0, 'không thấy ' + a);
    const j = s.indexOf(b, i + a.length);
    assert.ok(j > i, 'không thấy ' + b + ' sau ' + a);
    return s.slice(i, j);
}

test('index.html: khối #st-hub nằm TRƯỚC khối 🖥 OBS & Overlay, có công tắc / nút / cảnh báo', () => {
    const iHub = HTML.indexOf('id="st-hub"');
    const iObs = HTML.indexOf('🖥 OBS &amp; Overlay');
    assert.ok(iHub > 0 && iObs > iHub, '#st-hub phải đứng trước khối OBS');
    const blk = between(HTML, 'id="st-hub"', '<!-- 🖥 OBS');
    for (const id of ['st-hub-pill', 'st-hub-text', 'st-hub-main', 'st-hub-enabled', 'st-hub-owns', 'st-hub-open-cam', 'st-hub-lq', 'st-hub-hints']) {
        assert.ok(blk.includes('id="' + id + '"'), 'thiếu #' + id);
    }
    assert.ok(blk.includes('Liên kết HP Game Hub'), 'thiếu nhãn công tắc');
    assert.ok(blk.includes('Game Camera đang chạy trên HP Game Hub'));
    assert.ok(blk.includes('class="settings-block'), 'cùng khuôn settings-block');
});

test('index.html: #st-hub-overlays nằm TRONG khối OBS & Overlay, sau dòng Địa chỉ', () => {
    const obs = between(HTML, '🖥 OBS &amp; Overlay', '<!-- 🎁 Danh sách quà');
    assert.ok(obs.includes('id="st-hub-overlays"'));
    assert.ok(obs.indexOf('id="st-overlay-host"') < obs.indexOf('id="st-hub-overlays"'));
    assert.ok(obs.includes('id="st-overlay-host"'), 'dòng Địa chỉ hpaction.obs giữ nguyên');
});

test('chữ giao diện không nói token / WebSocket / Hub Link', () => {
    const blk = between(HTML, 'id="st-hub"', '<!-- 🖥 OBS');
    assert.doesNotMatch(blk, /token|websocket|hub link/i);
    const js = between(APP, '// ===== HP Game Hub (thẻ trong Cài đặt)', '// ===== /HP Game Hub');
    // bỏ tên route / id trong mã; chỉ kiểm chuỗi chữ người dùng thấy (trong nháy đơn có dấu cách hoặc tiếng Việt)
    const strings = js.match(/'[^'\n]*'/g) || [];
    for (const s of strings) assert.doesNotMatch(s, /token|websocket|hub link/i, s);
});

test('app.js: thẻ Hub gọi đúng route, ẩn công tắc khi !allowed, hpOpenHubCard cuộn #st-hub', () => {
    const js = between(APP, '// ===== HP Game Hub (thẻ trong Cài đặt)', '// ===== /HP Game Hub');
    for (const r of ["'/api/hub/state'", "'/api/hub/pair'", "'/api/hub/open'", "'/api/hub/launch'", "'/api/hub/enabled'"]) {
        assert.ok(js.includes(r), 'thiếu ' + r);
    }
    assert.ok(js.includes("hubOpenPage('home')") && js.includes("hubOpenPage('camera')"), 'mở trang home / camera');
    assert.ok(js.includes("window.open(") && js.includes("'_blank'"), 'nút Tải mở trình duyệt ngoài');
    assert.ok(js.includes('navigator.clipboard.writeText'), 'Chép link');
    assert.ok(/allowed/.test(js), 'ẩn công tắc theo allowed');
    assert.ok(js.includes("openGame('level-quest')"), 'nút LEVEL QUEST');
    assert.ok(js.includes('window.hpOpenHubCard'));
    assert.ok(/scrollIntoView\(\{[^}]*block:\s*'center'/.test(js), 'cuộn #st-hub vào giữa');
    assert.ok(js.includes("socket.on('hub:state'") && js.includes("socket.on('hub:owns'"));
    assert.ok(/ownsCamera/.test(js) && /overlays/.test(js) && /hints/.test(js));
    assert.ok(js.includes('Chép link') && js.includes('HP Game Hub - '));
});

test('app.js: tải /api/hub/state khi mở Cài đặt và lúc nạp trang', () => {
    const open = between(APP, 'const openSettingsPopup = () => {', '};');
    assert.ok(open.includes('loadHubCard'), 'mở Cài đặt → tải trạng thái Hub');
});

test('app.js: Game Camera do Hub giữ -> dòng trạng thái trong Thư viện + openGame chuyển sang thẻ Hub', () => {
    const rg = between(APP, 'function renderGameList() {', 'const cfg = g.config');
    assert.ok(rg.includes('hubOwned'), 'renderGameList đọc hubOwned');
    assert.ok(rg.includes('Đang chạy trên HP Game Hub'));
    assert.ok(rg.includes('hpOpenHubCard'));
    const og = between(APP, 'function openGame(gameId) {', 'currentGame = game;');
    assert.ok(og.includes('hpOpenHubCard'));
    const js = between(APP, '// ===== HP Game Hub (thẻ trong Cài đặt)', '// ===== /HP Game Hub');
    const cg = between(js, 'function hubCamGameId(id) {', 'function hubActiveCamView');
    assert.ok(cg.includes('CAM_CHILD_GAMES') && cg.includes("'camgames'"));
    assert.ok(/id !== 'level-quest'/.test(cg), 'level-quest vẫn mở bình thường');
    // loadGames giữ hubOwned từ /api/games (res.json nguyên mảng)
    const lg = between(APP, 'async function loadGames() {', 'renderGameList();');
    assert.ok(lg.includes("fetch('/api/games')"));
});

test('app.js: hub:owns -> loadGames; đang đứng ở màn camera lúc Hub nhận camera -> mở thẻ Hub', () => {
    const js = between(APP, '// ===== HP Game Hub (thẻ trong Cài đặt)', '// ===== /HP Game Hub');
    const h = between(js, "socket.on('hub:owns'", '});');
    assert.ok(h.includes('loadGames'));
    assert.ok(h.includes('hpOpenHubCard'));
    assert.ok(/view-camgames/.test(js));
});

test('quick-launch.html: bỏ thẻ Game Camera khi hubOwned, nghe hub:owns', () => {
    const lg = between(QUICK, 'async function loadGames() {', 'syncRunningFromConfig');
    assert.ok(lg.includes('hubOwned'));
    assert.match(lg, /filter\(.*hubOwned/);
    assert.ok(/socket\.on\('hub:owns',\s*\(\)\s*=>\s*\{\s*try\s*\{\s*loadGames\(\)/.test(QUICK));
});

test('style.css: lớp .st-hub-*', () => {
    for (const c of ['.st-hub-hint', '.st-hub-owns', '.st-hub-ov-row']) assert.ok(CSS.includes(c), 'thiếu ' + c);
});
