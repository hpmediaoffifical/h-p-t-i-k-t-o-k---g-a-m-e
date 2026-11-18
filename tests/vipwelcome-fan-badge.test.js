'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { badgeHtml, THEMES } = require('../public/games/vipwelcome/fan-badge.js');

test('badgeHtml: huân chương SVG + tấm chữ, đủ 5 bậc có chủ đề riêng', () => {
    assert.deepEqual(Object.keys(THEMES), ['sop', 'lau', 'fan', 'quen', 'moi']);
    const h = badgeHtml({ id: 'sop', icon: '💎', label: 'Khách sộp' }, { uid: 'a1' });
    assert.match(h, /class="fb fb-sop"/);
    assert.match(h, /<svg[^>]*class="fb-medal"/);
    assert.match(h, /<span class="fb-plate">Khách sộp<\/span>/);
    assert.doesNotMatch(h, /💎/);                       // không dùng emoji — glyph vẽ bằng SVG
});

test('badgeHtml: id gradient riêng theo uid (nhiều huy hiệu cùng trang không giẫm nhau)', () => {
    const a = badgeHtml({ id: 'fan', label: 'Fan cứng' }, { uid: 'x1' });
    const b = badgeHtml({ id: 'fan', label: 'Fan cứng' }, { uid: 'x2' });
    assert.match(a, /id="fb-rim-x1"/);
    assert.match(a, /url\(#fb-rim-x1\)/);
    assert.doesNotMatch(b, /fb-\w+-x1/);
    assert.match(b, /url\(#fb-gem-x2\)/);
});

test('badgeHtml: thoát HTML trong tên bậc, bậc lạ dùng chủ đề Khách quen, cỡ nhỏ, null → rỗng', () => {
    assert.match(badgeHtml({ id: 'lau', label: '<b>&' }, { uid: 'q' }), />&lt;b&gt;&amp;</);
    assert.match(badgeHtml({ id: 'zzz', label: 'X' }, { uid: 'q' }), /fb-quen/);
    assert.match(badgeHtml({ id: 'moi', label: 'Mới' }, { uid: 'q', size: 'sm' }), /class="fb fb-moi fb-sm"/);
    assert.equal(badgeHtml(null), '');
});
