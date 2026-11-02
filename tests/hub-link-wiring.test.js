'use strict';
// Kiểm "dây nối" server.js / electron-main.js bằng cách ĐỌC mã nguồn (không dựng server.js: sẽ chạm máy chủ giấy phép + Google Sheet).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SERVER = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const ELECTRON = fs.readFileSync(path.join(__dirname, '..', 'electron-main.js'), 'utf8');

function emitGiftBody() {
    const a = SERVER.indexOf('function emitGift(g) {');
    const b = SERVER.indexOf('\nfunction makeTikTokConnectOptions', a);
    assert.ok(a >= 0 && b > a, 'không cắt được thân emitGift');
    return SERVER.slice(a, b);
}
// Cắt khối `if (camRoute.runLocalCam) { ... }` (đếm ngoặc) bắt đầu ở vị trí `from`.
function blockAt(body, from) {
    const open = body.indexOf('{', from);
    let depth = 0;
    for (let i = open; i < body.length; i++) {
        if (body[i] === '{') depth++;
        else if (body[i] === '}' && --depth === 0) return body.slice(open, i + 1);
    }
    throw new Error('khối không đóng');
}

test('emitGift: hỏi Hub trước, rồi mới chạy Game Camera cục bộ', () => {
    const body = emitGiftBody();
    const iHub = body.indexOf('actionHub.onGift(');
    assert.ok(iHub >= 0, 'thiếu actionHub.onGift(');
    assert.ok(iHub < body.indexOf('camSessionGift('), 'onGift phải đứng trước camSessionGift(');
    assert.ok(body.includes('camRouteForGift('));
});

test('emitGift: đúng 2 khối runLocalCam, quà camera nằm trong đó', () => {
    const body = emitGiftBody();
    const marks = [];
    let i = -1;
    while ((i = body.indexOf('if (camRoute.runLocalCam)', i + 1)) >= 0) marks.push(i);
    assert.equal(marks.length, 2);
    const first = blockAt(body, marks[0]);
    const second = blockAt(body, marks[1]);
    assert.ok(first.includes('camSessionGift(g)'));
    for (const f of ['handleBanCungGift(', 'handleChemTraiCayGift(', 'handleDapMuoiGift(', 'handleDaCauGift(', 'bodyApi.handleGift(']) {
        assert.ok(second.includes(f), 'khối 2 thiếu ' + f);
    }
    for (const f of ['handleTrongCayGift(', 'handleVipWelcomeEvent(']) {
        assert.ok(!second.includes(f), 'khối 2 không được chứa ' + f);
    }
});

test('emitGift: camClaims lấy từ camRoute', () => {
    const body = emitGiftBody();
    assert.ok(body.includes('camClaims: camRoute.camClaims'));
    assert.ok(!body.includes('camClaims: camGiftClaims(g)'));
});

test('server.js: route công tắc, dừng Hub, sự kiện LIVE, chặn khi Hub giữ camera', () => {
    assert.ok(SERVER.includes("app.post('/api/hub/enabled'"));
    assert.ok(SERVER.includes('hubStop'));
    for (const r of ["app.get('/api/hub/state'", "app.post('/api/hub/pair'", "app.post('/api/hub/open'", "app.post('/api/hub/launch'"]) {
        assert.ok(SERVER.includes(r), 'thiếu ' + r);
    }
    assert.ok(SERVER.includes('Game Camera đang chạy trên HP Game Hub'));
    assert.ok(SERVER.includes('hubOwned:'));
    for (const k of ["sendLive('comment'", "sendLive('like'", "sendLive('follow'", "sendLive('share'", "sendLive('member'"]) {
        assert.ok(SERVER.includes(k), 'thiếu ' + k);
    }
    assert.ok(SERVER.includes('actionHub.start()'));
    assert.equal((SERVER.match(/actionHub\.start\(\)/g) || []).length, 1, 'start() đúng một chỗ');
});

test('server.js: không tự đọc HP_ACTION_HUB_LINK ngoài chú thích (chỉ lib đọc env)', () => {
    const code = SERVER.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    assert.ok(!code.includes('HP_ACTION_HUB_LINK'));
});

test('electron-main.js: đặt HP_ACTION_HUB_APP_ID trước khi require server.js, dừng Hub khi thoát', () => {
    const s = ELECTRON.indexOf('function startServer');
    assert.ok(s >= 0, 'không thấy startServer');
    const iEnv = ELECTRON.indexOf('HP_ACTION_HUB_APP_ID', s);
    const iReq = ELECTRON.indexOf("require('./server.js')", s);
    assert.ok(iEnv >= 0 && iReq >= 0 && iEnv < iReq, 'HP_ACTION_HUB_APP_ID phải xuất hiện trước require server.js');
    assert.ok(ELECTRON.includes("'hp-action-live-dev'") && ELECTRON.includes("'hp-action-live'"));
    assert.ok((ELECTRON.match(/hubStop/g) || []).length >= 2, 'hai đường thoát phải gọi hubStop');
});
