const test = require('node:test');
const assert = require('node:assert');
const SD = require('../lib/streamdeck-actions');

const ctx = {
    games: [
        { id: 'thuytinh', name: 'Hũ Thủy Tinh', icon: '🫙', enabled: true, locked: false },
        { id: 'caro', name: 'Cờ Caro', icon: '⭕', enabled: false, locked: false },
        { id: 'bancung', name: 'Bắn Cung', icon: '🏹', enabled: true, locked: true },
        { id: 'duongveque', name: 'Đường Về Quê', icon: '🛵' },
        { id: 'dapmuoi', name: 'Đập Muỗi', icon: '🦟', enabled: true },
        { id: 'pktiktok', name: 'PK', icon: '⚔️', enabled: true },
    ],
    gifts: [{ id: 5655, name: 'Rose', diamond: 1 }, { id: 'music', name: 'Ca khúc' }],
    dapmuoiActions: [
        { id: 'a1', type: 'spray', name: 'Bình xịt', enabled: true, params: { sec: 3 } },
        { id: 'a2', type: 'net', name: 'Mắc màn', enabled: false },
    ],
    pkEvents: [{ key: 'start', label: 'BẮT ĐẦU PK' }, { key: 'win', label: 'THẮNG' }],
    lastUsername: 'hpmedia',
};

test('catalog: game, quà, nhóm phím chỉ của game có mặt + phụ đề', () => {
    const c = SD.buildCatalog(ctx);
    assert.deepStrictEqual(c.kinds, ['game', 'live', 'gift', 'chat', 'hotkey']);
    assert.strictEqual(c.games.length, 6);
    assert.strictEqual(c.games[2].locked, true);
    assert.deepStrictEqual(c.gifts[0], { id: '5655', name: 'Rose', coins: 1 });
    assert.deepStrictEqual(c.hotkeys.map(h => h.id), ['duongveque', 'bancung', 'dapmuoi', 'pktiktok', 'caption']);
    const dm = c.hotkeys.find(h => h.id === 'dapmuoi').keys.map(k => k.key);
    assert.deepStrictEqual(dm, ['act:a1', 'start', 'stop']);   // hành động tắt không hiện
    const pk = c.hotkeys.find(h => h.id === 'pktiktok').keys.map(k => k.key);
    assert.deepStrictEqual(pk, ['fx:start', 'fx:win', 'stop']);
    assert.strictEqual(c.lastUsername, 'hpmedia');
});

test('catalog: thiếu game thì không có nhóm phím', () => {
    const c = SD.buildCatalog({ games: [{ id: 'caro', name: 'Caro' }] });
    assert.deepStrictEqual(c.hotkeys.map(h => h.id), ['caption']);
});

test('state: game bị khoá KEY coi như tắt; connecting chỉ khi chưa connected', () => {
    const s = SD.buildState({ ...ctx, connected: false, connecting: true, username: 'hpmedia', captionStatus: 'listening' });
    assert.deepStrictEqual(s.games.thuytinh, { on: true, locked: false });
    assert.deepStrictEqual(s.games.caro, { on: false, locked: false });
    assert.deepStrictEqual(s.games.bancung, { on: false, locked: true });
    assert.strictEqual(s.games.duongveque.on, true);   // enabled thiếu = bật (như server)
    assert.deepStrictEqual(s.live, { connected: false, connecting: true, username: 'hpmedia' });
    assert.strictEqual(s.caption.status, 'listening');
    assert.strictEqual(SD.buildState({ connected: true, connecting: true }).live.connecting, false);
});

test('game: đảo / bật / tắt; game lạ / khoá báo lỗi', () => {
    assert.deepStrictEqual(SD.planRun({ kind: 'game', gameId: 'thuytinh' }, ctx).body, { enabled: false });
    assert.deepStrictEqual(SD.planRun({ kind: 'game', gameId: 'caro' }, ctx).body, { enabled: true });
    assert.deepStrictEqual(SD.planRun({ kind: 'game', gameId: 'thuytinh', mode: 'on' }, ctx).body, { enabled: true });
    assert.deepStrictEqual(SD.planRun({ kind: 'game', gameId: 'caro', mode: 'off' }, ctx).body, { enabled: false });
    assert.strictEqual(SD.planRun({ kind: 'game', gameId: 'caro' }, ctx).path, '/api/games/caro/config');
    assert.strictEqual(SD.planRun({ kind: 'game', gameId: 'xx' }, ctx).error, 'unknown_game');
    assert.strictEqual(SD.planRun({ kind: 'game', gameId: 'bancung' }, ctx).error, 'feature_locked');
    assert.strictEqual(SD.planRun({ kind: 'game', gameId: '__proto__' }, ctx).error, 'unknown_game');
});

test('live: đảo theo trạng thái, @ID trống dùng lần cuối, thiếu ID báo lỗi', () => {
    assert.deepStrictEqual(SD.planRun({ kind: 'live' }, ctx), { method: 'POST', path: '/api/connect', body: { username: 'hpmedia' }, label: '@hpmedia' });
    assert.strictEqual(SD.planRun({ kind: 'live' }, { ...ctx, connected: true }).path, '/api/disconnect');
    assert.strictEqual(SD.planRun({ kind: 'live' }, { ...ctx, connecting: true }).path, '/api/disconnect');
    assert.strictEqual(SD.planRun({ kind: 'live', mode: 'connect', username: '@other' }, { ...ctx, connected: true }).body.username, 'other');
    assert.strictEqual(SD.planRun({ kind: 'live', mode: 'connect' }, { games: [] }).error, 'missing_username');
});

test('gift / chat: kẹp số lượng, quà trống = ngẫu nhiên, bình luận trống lỗi', () => {
    assert.deepStrictEqual(SD.planRun({ kind: 'gift', giftId: '5655', count: 500 }, ctx).body, { count: 99, nickname: 'Stream Deck', giftId: '5655' });
    assert.deepStrictEqual(SD.planRun({ kind: 'gift', count: 'x' }, ctx).body, { count: 1, nickname: 'Stream Deck' });
    assert.strictEqual(SD.planRun({ kind: 'chat', comment: '  ' }, ctx).error, 'missing_comment');
    const c = SD.planRun({ kind: 'chat', comment: 'x'.repeat(400) }, ctx);
    assert.strictEqual(c.path, '/api/test-chat');
    assert.strictEqual(c.body.comment.length, 300);
});

test('hotkey: phím cố định, Đập Muỗi theo cfg, PK theo sự kiện, phụ đề không cần game', () => {
    assert.deepStrictEqual(SD.planRun({ kind: 'hotkey', group: 'duongveque', key: 'ram' }, ctx).body, { action: 'ram' });
    assert.strictEqual(SD.planRun({ kind: 'hotkey', group: 'bancung', key: 'fire' }, ctx).error, 'feature_locked');
    const dm = SD.planRun({ kind: 'hotkey', group: 'dapmuoi', key: 'act:a1' }, ctx);
    assert.deepStrictEqual(dm, { method: 'POST', path: '/api/dapmuoi/test', body: { action: 'spray', params: { sec: 3 } }, label: 'Bình xịt' });
    assert.strictEqual(SD.planRun({ kind: 'hotkey', group: 'dapmuoi', key: 'act:a2' }, ctx).error, 'action_disabled');
    assert.strictEqual(SD.planRun({ kind: 'hotkey', group: 'dapmuoi', key: 'act:zz' }, ctx).error, 'unknown_key');
    assert.deepStrictEqual(SD.planRun({ kind: 'hotkey', group: 'pktiktok', key: 'fx:win' }, ctx).body, { type: 'trigger', key: 'win', source: 'streamdeck' });
    assert.strictEqual(SD.planRun({ kind: 'hotkey', group: 'caption', key: 'toggle' }, { games: [] }).path, '/api/creator-caption/listener/toggle');
    assert.strictEqual(SD.planRun({ kind: 'hotkey', group: 'nope', key: 'x' }, ctx).error, 'unknown_group');
    assert.strictEqual(SD.planRun({ kind: 'hotkey', group: 'duongveque', key: 'fly' }, ctx).error, 'unknown_key');
});

test('hotkey: body trả về là bản sao, sửa không làm hỏng bảng gốc', () => {
    const r = SD.planRun({ kind: 'hotkey', group: 'duongveque', key: 'jump' }, ctx);
    r.body.action = 'hack';
    assert.strictEqual(SD.HOTKEY_DEFS.duongveque[0].run.body.action, 'jump');
});

test('kind lạ / không phải object', () => {
    assert.strictEqual(SD.planRun({ kind: 'rm' }, ctx).error, 'unknown_kind');
    assert.strictEqual(SD.planRun(null, ctx).error, 'unknown_kind');
});
