'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const GI = require('../public/ui/game-icons.js');

function serverGameIds() {
    const s = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const i = s.indexOf('const GAMES = {');
    const block = s.slice(i, s.indexOf('\n};', i));
    return [...block.matchAll(/^    ([a-zA-Z]+): \{/gm)].map(m => m[1]);
}

test('mọi game trong GAMES + mục ảo ở sidebar đều có biểu tượng riêng', () => {
    const ids = [...serverGameIds(), 'gametuongtac', 'liveTranslate', 'timer', 'giftboard', 'leaguecard'];
    assert.ok(ids.length > 15);
    const missing = ids.filter(id => !GI.has(id));
    assert.deepEqual(missing, []);
});

test('game chưa khai báo dùng biểu tượng mặc định, vẫn là SVG hợp lệ', () => {
    const s = GI.svg('game-moi-chua-co');
    assert.match(s, /^<svg [^>]*viewBox="0 0 24 24"[^>]*>.*<\/svg>$/);
    assert.equal(s, GI.svg('_default').replace('_default', 'game-moi-chua-co'));
    assert.equal(GI.has('_default'), false);
});

test('svg dùng currentColor để ăn màu theo nhóm / mục đang chọn', () => {
    assert.match(GI.svg('caro', 20), /stroke="currentColor"/);
    assert.match(GI.svg('caro', 20), /width="20"/);
});
