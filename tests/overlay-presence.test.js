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
