const test = require('node:test');
const assert = require('node:assert');
const P = require('../lib/overlay-presence');

test('normalizeHello: nhận chuỗi/đối tượng, chặn id lạ', () => {
    assert.deepStrictEqual(P.normalizeHello('caro'), { gameId: 'caro', onAir: null, obs: false });
    assert.deepStrictEqual(P.normalizeHello({ gameId: 'level-quest', onAir: true, obs: true }), { gameId: 'level-quest', onAir: true, obs: true });
    assert.strictEqual(P.normalizeHello({ gameId: '../x' }), null);
    assert.strictEqual(P.normalizeHello({}), null);
    assert.strictEqual(P.normalizeHello({ gameId: 'abc' }, id => id === 'caro'), null);
});

test('touch/snapshot: đếm số trang mỗi game, onAir nếu có trang lên Program', () => {
    const s = P.createPresence();
    P.touch(s, 'a', { gameId: 'caro', onAir: null, obs: true }, 1000);
    P.touch(s, 'b', { gameId: 'caro', onAir: true, obs: true }, 1000);
    P.touch(s, 'c', { gameId: 'thuytinh', onAir: false, obs: false }, 1000);
    assert.deepStrictEqual(P.snapshot(s, 2000), {
        caro: { open: 2, onAir: true, obs: true },
        thuytinh: { open: 1, onAir: false, obs: false }
    });
});

test('touch: heartbeat onAir=null giữ giá trị đã biết', () => {
    const s = P.createPresence();
    P.touch(s, 'a', { gameId: 'caro', onAir: true }, 0);
    P.touch(s, 'a', { gameId: 'caro', onAir: null }, 5000);
    assert.strictEqual(P.snapshot(s, 5000).caro.onAir, true);
});

test('TTL: quá 20s không nhắc lại → coi như đóng; drop khi disconnect', () => {
    const s = P.createPresence();
    P.touch(s, 'a', { gameId: 'caro' }, 0);
    P.touch(s, 'b', { gameId: 'nhatla' }, 15000);
    assert.deepStrictEqual(Object.keys(P.snapshot(s, 21000)), ['nhatla']);
    assert.strictEqual(P.prune(s, 21000), 1);
    assert.strictEqual(P.drop(s, 'b'), true);
    assert.deepStrictEqual(P.snapshot(s, 21000), {});
});

test('sameSnapshot', () => {
    assert.ok(P.sameSnapshot({}, {}));
    assert.ok(P.sameSnapshot({ caro: { open: 1, onAir: false, obs: true } }, { caro: { open: 1, onAir: false, obs: true } }));
    assert.ok(!P.sameSnapshot({ caro: { open: 1, onAir: false, obs: true } }, { caro: { open: 2, onAir: false, obs: true } }));
    assert.ok(!P.sameSnapshot({ caro: { open: 1 } }, {}));
});

test('withHub: hub Game Camera mở → game đang chọn coi như mở', () => {
    const snap = { camgames: { open: 1, onAir: true, obs: true }, dacau: { open: 1, onAir: false, obs: true } };
    const out = P.withHub(snap, true, ['chemtraicay', 'dacau']);
    assert.deepStrictEqual(out.chemtraicay, { open: 1, onAir: true, obs: true, viaHub: true });
    assert.strictEqual(out.dacau.viaHub, true);
    assert.strictEqual(out.dacau.open, 1);
    assert.strictEqual(P.withHub(snap, false, ['chemtraicay']), snap);
});

test('gameIdFromOverlayUrl: link OBS → id game, bỏ link lạ / cổng khác / Bảng Quà Tổng', () => {
    assert.strictEqual(P.gameIdFromOverlayUrl('http://hpaction.obs:3000/overlay/caro'), 'caro');
    assert.strictEqual(P.gameIdFromOverlayUrl('http://localhost:3000/overlay/bancung?cam=1'), 'bancung');
    assert.strictEqual(P.gameIdFromOverlayUrl('http://localhost:3000/_prototype/timer.html?mode=overlay'), 'timer');
    assert.strictEqual(P.gameIdFromOverlayUrl('http://localhost:3000/_prototype/timer.html'), null);
    assert.strictEqual(P.gameIdFromOverlayUrl('http://localhost:3000/_prototype/giftboard.html?mode=overlay'), null);
    assert.strictEqual(P.gameIdFromOverlayUrl('http://localhost:3000/overlay/shared/abc'), null);
    assert.strictEqual(P.gameIdFromOverlayUrl('https://www.youtube.com/watch?v=1'), null);
    assert.strictEqual(P.gameIdFromOverlayUrl('file:///C:/x/overlay/caro'), null);
    assert.strictEqual(P.gameIdFromOverlayUrl('rác'), null);
    assert.strictEqual(P.gameIdFromOverlayUrl('http://localhost:3001/overlay/caro', 3000), null);
    assert.strictEqual(P.gameIdFromOverlayUrl('http://localhost:3000/overlay/caro', 3000), 'caro');
});

test('withObsSources: chỉ chú thích inObs, không đổi open', () => {
    const out = P.withObsSources({ caro: { open: 1, onAir: false, obs: true } }, ['caro', 'nhatla']);
    assert.deepStrictEqual(out.caro, { open: 1, onAir: false, obs: true, inObs: true });
    assert.deepStrictEqual(out.nhatla, { open: 0, onAir: false, obs: false, inObs: true });
    assert.ok(!P.sameSnapshot(out, { ...out, nhatla: { open: 0, onAir: false, obs: false } }));
});
