'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createGiftLedger } = require('../lib/vipwelcome/gift-ledger.js');

function tmpFile() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vw-ledger-'));
    return path.join(dir, 'ledger.json');
}

test('cộng dồn theo kênh + người, kênh khác tách biệt', () => {
    const l = createGiftLedger({ file: tmpFile(), saveDelayMs: 0 });
    l.add('HostA', '1', 5, { uniqueId: 'abc', nickname: 'Abc' });
    l.add('hosta', '1', 330);
    l.add('hostB', '1', 7);
    assert.equal(l.get('hostA', '1'), 335);
    assert.equal(l.get('hostB', '1'), 7);
    assert.equal(l.get('hostA', '2'), 0);
    l.add('hostA', '1', -5);
    l.add('hostA', '1', 'x');
    assert.equal(l.get('hostA', '1'), 335);
});

test('flushSync rồi mở lại đọc đúng', () => {
    const file = tmpFile();
    const l = createGiftLedger({ file, saveDelayMs: 60000 });
    l.add('h', '1', 10, { uniqueId: 'a', nickname: 'A' });
    l.flushSync();
    const l2 = createGiftLedger({ file });
    assert.equal(l2.get('h', '1'), 10);
    assert.equal(l2.list('h')[0].uniqueId, 'a');
});

test('corrupt file: không crash, bắt đầu rỗng, giữ bản hỏng', () => {
    const file = tmpFile();
    fs.writeFileSync(file, '{ hỏng');
    const l = createGiftLedger({ file });
    assert.equal(l.get('h', '1'), 0);
    const bad = fs.readdirSync(path.dirname(file)).filter(f => f.includes('.bad-'));
    assert.equal(bad.length, 1);
});

test('list: sắp giảm dần, lọc theo uniqueId/nickname, giới hạn', () => {
    const l = createGiftLedger({ file: tmpFile(), saveDelayMs: 0 });
    l.add('h', '1', 5, { uniqueId: 'an', nickname: 'An Nguyễn' });
    l.add('h', '2', 50, { uniqueId: 'binh', nickname: 'Bình' });
    l.add('h', '3', 20, { uniqueId: 'chi', nickname: 'Chi' });
    assert.deepEqual(l.list('h').map(x => x.key), ['2', '3', '1']);
    assert.deepEqual(l.list('h', { q: 'nguy' }).map(x => x.key), ['1']);
    assert.deepEqual(l.list('h', { q: 'BINH' }).map(x => x.key), ['2']);
    assert.equal(l.list('h', { limit: 2 }).length, 2);
});

test('host/key "__proto__" không làm bẩn Object.prototype', () => {
    const file = tmpFile();
    const l = createGiftLedger({ file, saveDelayMs: 0 });
    l.set('__proto__', 'enabled', 0);
    l.add('constructor', 'prototype', 5);
    l.add('h', '__proto__', 5);
    assert.equal(({}).enabled, undefined);
    assert.equal(l.get('__proto__', 'enabled'), 0);
    l.flushSync();
    const l2 = createGiftLedger({ file });
    assert.equal(({}).enabled, undefined);
    assert.equal(l2.get('h', '1'), 0);
});

test('set / reset / rekey', () => {
    const l = createGiftLedger({ file: tmpFile(), saveDelayMs: 0 });
    l.add('h', 'u:abc', 9, { uniqueId: 'abc' });
    l.add('h', '1', 1);
    l.rekey('h', 'u:abc', '1');
    assert.equal(l.get('h', '1'), 10);
    assert.equal(l.get('h', 'u:abc'), 0);
    l.set('h', '1', 99);
    assert.equal(l.get('h', '1'), 99);
    l.reset('h');
    assert.equal(l.get('h', '1'), 0);
});
