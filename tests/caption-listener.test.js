// node --test tests/caption-listener.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib/caption-listener');

const env = { ProgramFiles: 'C:\\PF', 'ProgramFiles(x86)': 'C:\\PF86', LOCALAPPDATA: 'C:\\LAD' };
const EDGE86 = 'C:\\PF86\\Microsoft\\Edge\\Application\\msedge.exe';
const CHROME = 'C:\\PF\\Google\\Chrome\\Application\\chrome.exe';

test('normalizeBrowser: chỉ edge/chrome, mặc định edge', () => {
    assert.equal(L.normalizeBrowser('chrome'), 'chrome');
    assert.equal(L.normalizeBrowser('EDGE'), 'edge');
    assert.equal(L.normalizeBrowser('firefox'), 'edge');
    assert.equal(L.normalizeBrowser(undefined), 'edge');
});

test('candidatePaths: đường dẫn chuẩn theo thứ tự spec', () => {
    assert.deepEqual(L.candidatePaths('edge', env), [
        EDGE86,
        'C:\\PF\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\LAD\\Microsoft\\Edge\\Application\\msedge.exe'
    ]);
    assert.deepEqual(L.candidatePaths('chrome', env), [
        CHROME,
        'C:\\PF86\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\LAD\\Google\\Chrome\\Application\\chrome.exe'
    ]);
});

test('resolveBrowserExe: ưu tiên trình duyệt được chọn', () => {
    const r = L.resolveBrowserExe('edge', { exists: p => p === EDGE86 || p === CHROME, env, regQuery: () => '' });
    assert.deepEqual(r, { browser: 'edge', exe: EDGE86, fallback: false });
});

test('resolveBrowserExe: thiếu trình duyệt được chọn → dùng trình duyệt kia, fallback:true', () => {
    const r = L.resolveBrowserExe('edge', { exists: p => p === CHROME, env, regQuery: () => '' });
    assert.deepEqual(r, { browser: 'chrome', exe: CHROME, fallback: true });
});

test('resolveBrowserExe: không có file chuẩn → registry App Paths', () => {
    const calls = [];
    const r = L.resolveBrowserExe('chrome', {
        exists: p => p === 'D:\\Custom\\chrome.exe', env,
        regQuery: (name) => { calls.push(name); return name === 'chrome.exe' ? 'D:\\Custom\\chrome.exe' : ''; }
    });
    assert.deepEqual(r, { browser: 'chrome', exe: 'D:\\Custom\\chrome.exe', fallback: false });
    assert.deepEqual(calls, ['chrome.exe']);
});

test('resolveBrowserExe: không tìm thấy gì → null', () => {
    assert.equal(L.resolveBrowserExe('edge', { exists: () => false, env, regQuery: () => '' }), null);
});

test('buildLaunchArgs: --app + profile riêng + cỡ cửa sổ', () => {
    assert.deepEqual(L.buildLaunchArgs({ url: 'http://127.0.0.1:3000/listen/caption?browser=edge', profileDir: 'D:\\p' }), [
        '--app=http://127.0.0.1:3000/listen/caption?browser=edge',
        '--user-data-dir=D:\\p',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-sync',
        '--disable-features=TranslateUI',
        '--window-size=460,340'
    ]);
});

function makeState(opts = {}) {
    const timers = [];
    const changes = [];
    let now = 1000;
    const st = L.createListenerState({
        now: () => now,
        connectTimeoutMs: 15000,
        setTimer: (fn, ms) => { timers.push({ fn, ms, cleared: false }); return timers.length; },
        clearTimer: (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; },
        onChange: (s) => changes.push(s),
        ...opts
    });
    return { st, timers, changes, tick: (ms) => { now += ms; } };
}

test('state: open từ idle → spawn, status opening, onChange 1 lần, timer 15s', () => {
    const { st, timers, changes } = makeState();
    const r = st.open({ browser: 'edge' });
    assert.equal(r.action, 'spawn');
    assert.equal(r.state.status, 'opening');
    assert.equal(r.state.browser, 'edge');
    assert.equal(changes.length, 1);
    assert.equal(timers.length, 1);
    assert.equal(timers[0].ms, 15000);
});

test('state: open khi đang opening → none, không spawn thêm', () => {
    const { st, timers } = makeState();
    st.open({ browser: 'edge' });
    const r = st.open({ browser: 'edge' });
    assert.equal(r.action, 'none');
    assert.equal(timers.length, 1);
});

test('state: attach + report listening → listening, timer timeout bị huỷ', () => {
    const { st, timers } = makeState();
    st.open({ browser: 'edge' });
    st.attach('s1');
    st.report('s1', { state: 'listening', lang: 'vi-VN', micLabel: 'Mic A', browser: 'edge' });
    const s = st.snapshot();
    assert.equal(s.status, 'listening');
    assert.equal(s.socketId, 's1');
    assert.equal(s.lang, 'vi-VN');
    assert.equal(s.micLabel, 'Mic A');
    assert.equal(timers[0].cleared, true);
    assert.equal(st.open({ browser: 'edge' }).action, 'none');
});

test('state: report starting cũng tính là listening', () => {
    const { st } = makeState();
    st.open({ browser: 'edge' });
    st.attach('s1');
    st.report('s1', { state: 'starting' });
    assert.equal(st.snapshot().status, 'listening');
});

test('state: trang còn nối nhưng idle → open trả start (không spawn)', () => {
    const { st, timers } = makeState();
    st.open({ browser: 'edge' });
    st.attach('s1');
    st.report('s1', { state: 'listening' });
    st.report('s1', { state: 'idle' });
    assert.equal(st.snapshot().status, 'idle');
    const r = st.open({ browser: 'edge' });
    assert.equal(r.action, 'start');
    assert.equal(r.socketId, 's1');
    assert.equal(timers.length, 1);
});

test('state: detach của socket cũ không hạ trạng thái; detach socket đang giữ → idle', () => {
    const { st } = makeState();
    st.open({ browser: 'edge' });
    st.attach('s1');
    st.report('s1', { state: 'listening' });
    st.attach('s2');
    st.report('s2', { state: 'listening', micLabel: 'Mic B' });
    st.detach('s1');
    assert.equal(st.snapshot().status, 'listening');
    assert.equal(st.snapshot().socketId, 's2');
    st.detach('s2');
    assert.equal(st.snapshot().status, 'idle');
    assert.equal(st.snapshot().socketId, null);
});

test('state: timeout 15s không ai attach → error listener_timeout', () => {
    const { st, timers } = makeState();
    st.open({ browser: 'chrome' });
    timers[0].fn();
    const s = st.snapshot();
    assert.equal(s.status, 'error');
    assert.equal(s.error, 'listener_timeout');
});

test('state: report error → error kèm mã', () => {
    const { st } = makeState();
    st.open({ browser: 'edge' });
    st.attach('s1');
    st.report('s1', { state: 'error', error: 'not-allowed' });
    assert.equal(st.snapshot().status, 'error');
    assert.equal(st.snapshot().error, 'not-allowed');
});

test('state: stop → action stop với socketId, status idle', () => {
    const { st } = makeState();
    st.open({ browser: 'edge' });
    st.attach('s1');
    st.report('s1', { state: 'listening' });
    const r = st.stop();
    assert.deepEqual(r, { action: 'stop', socketId: 's1' });
    assert.equal(st.snapshot().status, 'idle');
});

test('state: fail (server không tìm thấy trình duyệt) → error kèm mã, huỷ timer', () => {
    const { st, timers } = makeState();
    st.open({ browser: 'edge' });
    st.fail('browser_not_found');
    assert.equal(timers[0].cleared, true);
    assert.equal(st.snapshot().status, 'error');
    assert.equal(st.snapshot().error, 'browser_not_found');
});

test('state: stop khi đang opening huỷ timer', () => {
    const { st, timers } = makeState();
    st.open({ browser: 'edge' });
    st.stop();
    assert.equal(timers[0].cleared, true);
    assert.equal(st.snapshot().status, 'idle');
});
