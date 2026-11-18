'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { check } = require('../lib/preflight');

const READY = {
    tiktok: { username: 'meo', connected: true },
    obs: { connected: true },
    license: { ok: true, daysLeft: 200 },
    games: [{ id: 'caro', name: 'Caro', on: true, overlay: true }],
    presence: { caro: { open: 1 } }
};

test('mọi thứ sẵn sàng → xanh hết', () => {
    const r = check(READY);
    assert.equal(r.summary, 'ok');
    assert.ok(r.items.every(x => x.level === 'ok'));
});

test('game bật mà chưa có trong OBS → đỏ + nút Thêm vào OBS (khi OBS đã nối); chưa nối OBS → nút lấy link', () => {
    const r = check({ ...READY, presence: {} });
    const g = r.items.find(x => x.id === 'game:caro');
    assert.equal(g.level, 'bad');
    assert.deepEqual(g.fix, { action: 'addToObs', gameId: 'caro', label: '➕ Thêm vào OBS' });
    assert.equal(r.summary, 'bad');
    assert.equal(r.items[0].id, 'game:caro', 'dòng đỏ lên đầu');
    const r2 = check({ ...READY, obs: { connected: false }, presence: {} });
    assert.equal(r2.items.find(x => x.id === 'game:caro').fix.action, 'openGame');
});

test('có trong OBS nhưng chưa chạy → vàng; game khoá/tắt/không có link riêng không kiểm', () => {
    const r = check({ ...READY, games: [...READY.games, { id: 'x', name: 'X', on: true, locked: true, overlay: true }, { id: 'y', name: 'Y', on: false, overlay: true }, { id: 'bancung', name: 'BC', on: true, overlay: false }], presence: { caro: { open: 0, inObs: true } } });
    assert.equal(r.items.find(x => x.id === 'game:caro').level, 'warn');
    assert.ok(!r.items.some(x => ['game:x', 'game:y', 'game:bancung'].includes(x.id)));
});

test('TikTok: chưa có ID → đỏ; có ID chưa nối → vàng', () => {
    assert.equal(check({ ...READY, tiktok: {} }).items.find(x => x.id === 'tiktok').fix.action, 'focusTiktok');
    const w = check({ ...READY, tiktok: { username: 'meo' } }).items.find(x => x.id === 'tiktok');
    assert.equal(w.level, 'warn');
    assert.equal(w.fix.action, 'connectTiktok');
});

test('bản quyền: chưa hợp lệ → đỏ, ≤3 ngày → vàng', () => {
    assert.equal(check({ ...READY, license: { ok: false } }).items.find(x => x.id === 'license').level, 'bad');
    assert.equal(check({ ...READY, license: { ok: true, daysLeft: 2.4 } }).items.find(x => x.id === 'license').detail, 'Còn 2 ngày — gia hạn để không bị gián đoạn.');
});

test('Game Camera: chỉ kiểm khi bật; thiếu nguồn → đỏ; chưa có hình → vàng', () => {
    assert.ok(!check(READY).items.some(x => x.id === 'cam'));
    assert.equal(check({ ...READY, cam: { on: true } }).items.find(x => x.id === 'cam').level, 'bad');
    assert.equal(check({ ...READY, cam: { on: true, source: 'Cam', live: false } }).items.find(x => x.id === 'cam').level, 'warn');
    assert.equal(check({ ...READY, cam: { on: true, source: 'Cam', live: true } }).items.find(x => x.id === 'cam').level, 'ok');
});

test('chưa bật game nào → vàng', () => {
    assert.equal(check({ ...READY, games: [] }).items.find(x => x.id === 'games').level, 'warn');
});
