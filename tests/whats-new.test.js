'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const WN = require('../public/ui/whats-new.js');

const DATA = {
    '1.26.0': { title: 'A', items: ['a1'] },
    '1.27.0': { title: 'B', items: ['b1', 'b2'] },
    '1.28.0': { title: 'C', items: ['c1'] },
    '1.27.5': { title: 'rỗng', items: [] }
};

test('cmp so phiên bản theo số, không theo chữ', () => {
    assert.equal(WN.cmp('1.10.0', '1.9.9'), 1);
    assert.equal(WN.cmp('1.27.0', '1.27'), 0);
    assert.equal(WN.cmp('1.2.3', '1.2.4'), -1);
});

test('pick: chỉ các bản sau bản đã xem tới bản đang chạy, mới nhất trước, bỏ bản không có ghi chú', () => {
    const r = WN.pick(DATA, '1.28.0', '1.26.0');
    assert.deepEqual(r.map(e => e.version), ['1.28.0', '1.27.0']);
    assert.deepEqual(r[1].items, ['b1', 'b2']);
});

test('pick: máy mới cài (chưa xem bản nào) không hiện; bản chưa phát hành không hiện', () => {
    assert.deepEqual(WN.pick(DATA, '1.28.0', ''), []);
    assert.deepEqual(WN.pick(DATA, '1.27.0', '1.26.0').map(e => e.version), ['1.27.0']);
    assert.deepEqual(WN.pick(DATA, '1.27.0', '1.27.0'), []);
});

test('pick all: mở lại từ chân app hiện tối đa 3 bản gần nhất', () => {
    const big = {};
    for (let i = 0; i < 6; i++) big['1.' + i + '.0'] = { items: ['x'] };
    assert.deepEqual(WN.pick(big, '1.5.0', '', { all: true }).map(e => e.version), ['1.5.0', '1.4.0', '1.3.0']);
});

test('public/whats-new.json hợp lệ và có ghi chú cho bản trong package.json', () => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'whats-new.json'), 'utf8'));
    const ver = require('../package.json').version;
    assert.ok(data[ver] && data[ver].items.length >= 1 && data[ver].items.length <= 6, 'thiếu ghi chú cho v' + ver);
    for (const [v, e] of Object.entries(data)) {
        assert.match(v, /^\d+\.\d+\.\d+$/);
        assert.ok(Array.isArray(e.items));
    }
});
