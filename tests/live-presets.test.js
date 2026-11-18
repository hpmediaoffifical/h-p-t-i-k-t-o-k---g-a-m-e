'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const LP = require('../public/ui/live-presets.js');

const GAMES = [
    { id: 'pktiktok', on: false }, { id: 'vipwelcome', on: true }, { id: 'thuytinh', on: true },
    { id: 'caro', on: true }, { id: 'quaivat', on: false, togglable: false }
];

test('plan: bật game thiếu, tắt game thừa, bỏ qua game không bật/tắt được', () => {
    assert.deepEqual(LP.plan({ games: ['pktiktok', 'vipwelcome', 'thuytinh', 'quaivat'] }, GAMES), { on: ['pktiktok'], off: ['caro'] });
    assert.deepEqual(LP.plan({ games: [] }, GAMES), { on: [], off: ['vipwelcome', 'thuytinh', 'caro'] });
});

test('activeId: chip khớp đúng bộ đang bật (game không có trong app bị bỏ qua)', () => {
    const presets = [{ id: 'a', games: ['vipwelcome', 'thuytinh'] }, { id: 'b', games: ['caro', 'thuytinh', 'vipwelcome', 'game-da-go'] }];
    assert.equal(LP.activeId(presets, GAMES), 'b');
    assert.equal(LP.activeId(presets, [{ id: 'x', on: true }]), '');
});

test('normalize: mặc định khi chưa có; bỏ mục rỗng, id trùng, game id lạ; tối đa 12', () => {
    assert.equal(LP.normalize(undefined).length, LP.DEFAULTS.length);
    const n = LP.normalize([{ name: 'Buổi Tối' }, { name: 'Buổi Tối', games: ['caro', 'caro', 'x y'] }, { name: '' }, null]);
    assert.deepEqual(n.map(p => p.id), ['buoi-toi', 'buoi-toi-2']);
    assert.deepEqual(n[1].games, ['caro']);
    assert.equal(LP.normalize(Array.from({ length: 20 }, (_, i) => ({ name: 'B' + i }))).length, 12);
    assert.deepEqual(LP.normalize([]), []);
});
