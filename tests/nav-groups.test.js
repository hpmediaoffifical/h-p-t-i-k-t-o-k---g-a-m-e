// 🎨 Giao diện mới — Thư viện Game ở sidebar chia nhóm (public/ui/nav-groups.js).
const test = require('node:test');
const assert = require('node:assert');
const NG = require('../public/ui/nav-groups.js');

test('groupOf xếp đúng nhóm, id lạ về Game quà', () => {
    assert.strictEqual(NG.groupOf('thuytinh'), 'gift');
    // 2 mục nhóm (Game Camera, Game Tương Tác) chung 1 tiêu đề — tránh "GAME CAMERA / Game Camera" lặp chữ
    assert.strictEqual(NG.groupOf('camgames'), 'hubs');
    assert.strictEqual(NG.groupOf('gametuongtac'), 'hubs');
    assert.strictEqual(NG.groupOf('pktiktok'), 'fx');
    assert.strictEqual(NG.groupOf('liveTranslate'), 'tools');
    assert.strictEqual(NG.groupOf('timer'), 'tools');
    assert.strictEqual(NG.groupOf('game-moi-chua-biet'), 'gift');
});

test('group() theo thứ tự GROUPS, giữ thứ tự game trong nhóm, bỏ nhóm rỗng', () => {
    const games = [{ id: 'pktiktok' }, { id: 'thuytinh' }, { id: 'liveTranslate' }, { id: 'caro' }];
    const out = NG.group(games);
    assert.deepStrictEqual(out.map(g => g.id), ['gift', 'fx', 'tools']);
    assert.deepStrictEqual(out[0].items.map(g => g.id), ['thuytinh', 'caro']);
    assert.ok(out[0].label.length > 0);
});

test('GROUPS có đủ 4 nhóm theo thứ tự', () => {
    assert.deepStrictEqual(NG.GROUPS.map(g => g.id), ['gift', 'hubs', 'fx', 'tools']);
});
