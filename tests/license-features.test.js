'use strict';
// Tính năng theo KEY (HP KEY ft): lib/license-features.js
const test = require('node:test');
const assert = require('node:assert/strict');
const LF = require('../lib/license-features');

test('key "Tất cả" (null / undefined / sai kiểu): mở mọi thứ, không khoá gì', () => {
    for (const f of [null, undefined, 'caro', 42, {}]) {
        assert.equal(LF.can(f, 'caro'), true);
        assert.equal(LF.can(f, 'camgames'), true);
        assert.equal(LF.can(f, 'liveTranslate'), true);
        assert.deepEqual(LF.lockedIds(f), []);
    }
});

test('danh sách: chỉ mở đúng id có trong danh sách (phân biệt hoa thường)', () => {
    const f = ['caro', 'liveTranslate'];
    assert.equal(LF.can(f, 'caro'), true);
    assert.equal(LF.can(f, 'liveTranslate'), true);
    assert.equal(LF.can(f, 'thuytinh'), false);
    assert.equal(LF.can(f, 'obs-effects'), false);
    assert.equal(LF.can(['LiveTranslate'], 'liveTranslate'), false, 'sai hoa thường = không mở');
});

test('công cụ luôn mở (giftboard, timer) và id ngoài danh mục không bao giờ bị khoá', () => {
    for (const id of ['giftboard', 'timer', 'game-moi-chua-co']) {
        assert.equal(LF.can([], id), true, id);
        assert.equal(LF.lockedIds([]).includes(id), false, id);
    }
});

test('[] = khoá hết các mục khoá được + khung camgames', () => {
    const locked = LF.lockedIds([]);
    assert.deepEqual(locked, [...LF.LOCKABLE, 'camgames']);
    assert.equal(LF.can([], 'camgames'), false);
});

test('Game Camera: khoá từng game con; khung camgames mở khi có ít nhất 1 game con', () => {
    assert.equal(LF.can(['dapmuoi'], 'camgames'), true);
    assert.equal(LF.can(['dapmuoi'], 'dapmuoi'), true);
    assert.equal(LF.can(['dapmuoi'], 'bancung'), false);
    assert.equal(LF.can(['caro'], 'camgames'), false, 'không có game con nào → khung khoá');
    const locked = LF.lockedIds(['dapmuoi', 'caro']);
    assert.equal(locked.includes('camgames'), false);
    assert.equal(locked.includes('touchplay'), true);
});

test('same(): so tác dụng của 2 danh sách', () => {
    assert.equal(LF.same(null, undefined), true);
    assert.equal(LF.same(null, []), false);
    assert.equal(LF.same(['a', 'b'], ['a', 'b']), true);
    assert.equal(LF.same(['a', 'b'], ['b', 'a']), false);
});

test('danh mục: id hợp lệ với HP KEY ([A-Za-z0-9_.-]{1,40}), không trùng, đủ 15 mục; catalogText đúng định dạng id|Tên', () => {
    const ids = LF.CATALOG.map((c) => c.id);
    assert.equal(ids.length, 15);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^[A-Za-z0-9_.-]{1,40}$/);
    for (const c of LF.CAM_CHILDREN) assert.ok(ids.includes(c), c);
    const lines = LF.catalogText().split('\n');
    assert.equal(lines.length, 15);
    assert.equal(lines[0], 'thuytinh|Hũ Thủy Tinh');
    for (const l of lines) assert.match(l, /^[A-Za-z0-9_.-]+\|.+$/);
});
