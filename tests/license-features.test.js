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

test('công cụ luôn mở (giftboard) và id ngoài danh mục không bao giờ bị khoá', () => {
    for (const id of ['giftboard', 'game-moi-chua-co']) {
        assert.equal(LF.can([], id), true, id);
        assert.equal(LF.lockedIds([]).includes(id), false, id);
    }
});

test('THỜI GIAN (timer) khoá theo key như game thường', () => {
    assert.equal(LF.can(['thuytinh'], 'timer'), false);
    assert.equal(LF.can(['timer'], 'timer'), true);
    assert.equal(LF.can(null, 'timer'), true, 'key Tất cả vẫn mở');
    assert.equal(LF.lockedIds(['thuytinh']).includes('timer'), true);
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

// Trạng thái mục theo game (HP KEY gs, SDK 2.1). Server đã trừ mục off/hidden khỏi ft — các ca dưới dựng ft đúng như vậy.
const ALL = LF.LOCKABLE.slice();
const minus = (...ids) => ALL.filter((id) => !ids.includes(id));

test('gameState rỗng / sai kiểu: stateOf chỉ còn on / locked như trước, states() = chỉ mục bị khoá', () => {
    for (const gs of [undefined, null, {}, [], 'caro|off', 5]) {
        assert.equal(LF.stateOf(null, gs, 'caro'), 'on');
        assert.equal(LF.stateOf(['thuytinh'], gs, 'caro'), 'locked');
        assert.deepEqual(LF.states(null, gs), {});
    }
    const st = LF.states(['caro'], {});
    assert.deepEqual(Object.keys(st).sort(), LF.lockedIds(['caro']).sort(), 'states() khoá đúng các mục lockedIds');
    assert.ok(Object.values(st).every((s) => s === 'locked'));
});

test('stateOf: off / hidden thắng locked; admin chỉ khi mục dùng được; giá trị lạ bị bỏ', () => {
    const gs = { caro: 'off', nhatla: 'hidden', timer: 'admin', thuytinh: 'bao-tri' };
    const ft = minus('caro', 'nhatla');
    assert.equal(LF.stateOf(ft, gs, 'caro'), 'off');
    assert.equal(LF.stateOf(ft, gs, 'nhatla'), 'hidden');
    assert.equal(LF.stateOf(ft, gs, 'timer'), 'admin');
    assert.equal(LF.stateOf(ft, gs, 'thuytinh'), 'on', 'trạng thái lạ = Bật');
    assert.equal(LF.stateOf(minus('caro', 'nhatla', 'timer'), gs, 'timer'), 'locked', 'admin mà key không có → locked');
    assert.deepEqual(LF.normalizeState(gs), { caro: 'off', nhatla: 'hidden', timer: 'admin' });
    assert.deepEqual(LF.states(ft, gs), { caro: 'off', nhatla: 'hidden', timer: 'admin' });
    assert.equal(LF.can(ft, 'caro'), false, 'khoá vẫn theo ft');
});

test('stateOf camgames: còn game con dùng được → on; mọi game con ẩn → hidden; không còn mà có tạm tắt → off', () => {
    const kids = LF.CAM_CHILDREN;
    assert.equal(LF.stateOf(minus('touchplay'), { touchplay: 'off' }, 'camgames'), 'on');
    const allHidden = Object.fromEntries(kids.map((k) => [k, 'hidden']));
    assert.equal(LF.stateOf(minus(...kids), allHidden, 'camgames'), 'hidden');
    const oneOff = { ...allHidden, dapmuoi: 'off' };
    assert.equal(LF.stateOf(minus(...kids), oneOff, 'camgames'), 'off');
    assert.equal(LF.stateOf(minus(...kids), {}, 'camgames'), 'locked');
    assert.equal(LF.stateOf(minus(...kids.filter((k) => k !== 'bancung')), { bancung: 'admin' }, 'camgames'), 'on', 'chỉ còn game Chỉ ADMIN → vẫn mở');
    assert.equal(LF.states(minus(...kids), allHidden).camgames, 'hidden');
});

test('sameState(): so trạng thái (ft giữ nguyên mà gs đổi off → hidden vẫn phải vẽ lại)', () => {
    assert.equal(LF.sameState(undefined, {}), true);
    assert.equal(LF.sameState({ caro: 'off' }, { caro: 'off' }), true);
    assert.equal(LF.sameState({ caro: 'off' }, { caro: 'hidden' }), false);
    assert.equal(LF.sameState({ caro: 'off' }, {}), false);
    assert.equal(LF.sameState({ caro: 'off', x: 'lạ' }, { caro: 'off' }), true, 'giá trị lạ bị bỏ trước khi so');
});

test('danh mục: id hợp lệ với HP KEY ([A-Za-z0-9_.-]{1,40}), không trùng, đủ 16 mục; catalogText đúng định dạng id|Tên', () => {
    const ids = LF.CATALOG.map((c) => c.id);
    assert.equal(ids.length, 16);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^[A-Za-z0-9_.-]{1,40}$/);
    for (const c of LF.CAM_CHILDREN) assert.ok(ids.includes(c), c);
    const lines = LF.catalogText().split('\n');
    assert.equal(lines.length, 16);
    assert.equal(lines[0], 'thuytinh|Hũ Thủy Tinh');
    for (const l of lines) assert.match(l, /^[A-Za-z0-9_.-]+\|.+$/);
});
