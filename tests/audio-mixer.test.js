'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../lib/audio-mixer');

test('normalize: mặc định 100%, kẹp 0–100, bỏ id lạ và kênh mặc định', () => {
    assert.deepEqual(M.normalize(null), { master: { vol: 100, mute: false }, games: {} });
    const s = M.normalize({ master: { vol: 250 }, games: { caro: { vol: -5 }, thuytinh: { vol: 100 }, 'x y': { vol: 3 } } });
    assert.equal(s.master.vol, 100);
    assert.deepEqual(s.games, { caro: { vol: 0, mute: false } });
});

test('merge: kéo 1 thanh không làm mất kênh khác', () => {
    let s = M.merge({}, { games: { caro: { vol: 40 } } });
    s = M.merge(s, { games: { thuytinh: { mute: true } } });
    s = M.merge(s, { master: { vol: 80 } });
    assert.deepEqual(s, { master: { vol: 80, mute: false }, games: { caro: { vol: 40, mute: false }, thuytinh: { vol: 100, mute: true } } });
});

test('gainFor: Tổng × kênh game; tắt tiếng Tổng hoặc kênh → 0', () => {
    const s = { master: { vol: 50 }, games: { caro: { vol: 40 }, pk: { vol: 100, mute: true } } };
    assert.equal(M.gainFor(s, 'caro'), 0.2);
    assert.equal(M.gainFor(s, 'chuaco'), 0.5);
    assert.equal(M.gainFor(s, 'pk'), 0);
    assert.equal(M.gainFor({ master: { vol: 100, mute: true } }, 'caro'), 0);
});

test('injectScript: chèn ngay sau <head> trước script của game, chỉ 1 lần, lọc id', () => {
    const html = '<!doctype html><html><head><meta charset="utf-8"><script src="game.js"></script></head><body></body></html>';
    const out = M.injectScript(html, 'caro');
    assert.ok(out.indexOf('/lib/hp-mixer.js') < out.indexOf('game.js'));
    assert.match(out, /<head><script src="\/lib\/hp-mixer.js" data-game="caro"><\/script><meta/);
    assert.equal(M.injectScript(out, 'caro'), out);
    assert.match(M.injectScript('<HEAD lang="vi"></HEAD>', 'a"><b'), /data-game="ab"/);
    assert.match(M.injectScript('<p>x</p>', 'z'), /^<script src="\/lib\/hp-mixer.js" data-game="z"><\/script><p>/);
});
