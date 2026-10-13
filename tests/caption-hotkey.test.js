// node --test tests/caption-hotkey.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib/caption-listener');

test('normalizeHotkey: 1 ký tự → Control+Shift+<KÝ TỰ>, chuỗi khác giữ nguyên (≤80), rỗng → rỗng', () => {
    assert.equal(L.normalizeHotkey('l'), 'Control+Shift+L');
    assert.equal(L.normalizeHotkey('9'), 'Control+Shift+9');
    assert.equal(L.normalizeHotkey(' F9 '), 'F9');
    assert.equal(L.normalizeHotkey('Alt+Q'), 'Alt+Q');
    assert.equal(L.normalizeHotkey(''), '');
    assert.equal(L.normalizeHotkey(undefined), '');
    assert.equal(L.normalizeHotkey('x'.repeat(100)).length, 80);
});

test('state: open với startWhenReady → trang báo idle lần đầu nhận action start; đang nghe thì không', () => {
    const changes = [];
    const st = L.createListenerState({ now: () => 1, setTimer: () => 1, clearTimer: () => {}, onChange: (s) => changes.push(s) });
    assert.equal(st.open({ browser: 'edge', startWhenReady: true }).action, 'spawn');
    assert.equal(st.snapshot().pendingStart, true);
    st.attach('s1');
    assert.deepEqual(st.report('s1', { state: 'idle' }), { action: 'start', socketId: 's1' });
    assert.equal(st.snapshot().pendingStart, false);
    assert.equal(st.report('s1', { state: 'idle' }), null);          // chỉ gửi 1 lần
    st.report('s1', { state: 'listening' });
    assert.equal(st.report('s1', { state: 'listening' }), null);
});

test('state: open thường không đặt pendingStart; trang báo listening xoá pendingStart', () => {
    const st = L.createListenerState({ now: () => 1, setTimer: () => 1, clearTimer: () => {} });
    st.open({ browser: 'edge' });
    assert.equal(st.snapshot().pendingStart, false);
    st.stop();
    st.open({ browser: 'edge', startWhenReady: true });
    st.attach('s1');
    assert.equal(st.report('s1', { state: 'listening' }), null);
    assert.equal(st.snapshot().pendingStart, false);
});

test('state: toggle — đang nghe → pause (socket); nghỉ có socket → start; không cửa sổ → spawn + pendingStart', () => {
    const st = L.createListenerState({ now: () => 1, setTimer: () => 1, clearTimer: () => {} });
    assert.deepEqual(st.toggle({ browser: 'chrome' }), { action: 'spawn', state: st.snapshot() });
    assert.equal(st.snapshot().pendingStart, true);
    st.attach('s1');
    st.report('s1', { state: 'listening' });
    assert.deepEqual(st.toggle({}), { action: 'pause', socketId: 's1' });
    st.report('s1', { state: 'idle' });
    assert.deepEqual(st.toggle({}), { action: 'start', socketId: 's1' });
});
