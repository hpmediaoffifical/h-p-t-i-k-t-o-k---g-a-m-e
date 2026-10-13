const test = require('node:test');
const assert = require('node:assert');
const Cam = require('../lib/camgames');

const IDS = ['touchplay', 'chemtraicay', 'dapmuoi', 'bancung', 'level-quest'];

test('normalizeActives: mỗi khe giữ game bấm sau cùng', () => {
    assert.deepStrictEqual(Cam.normalizeActives(['dapmuoi', 'bancung'], IDS), ['dapmuoi', 'bancung']);
    // hai game tay → game sau thay game trước
    assert.deepStrictEqual(Cam.normalizeActives(['dapmuoi', 'bancung', 'chemtraicay'], IDS), ['bancung', 'chemtraicay']);
    // hai game đầu → game sau thay
    assert.deepStrictEqual(Cam.normalizeActives(['bancung', 'touchplay', 'level-quest'], IDS), ['touchplay', 'level-quest']);
});

test('normalizeActives: bỏ id lạ, trùng, rỗng → game đầu', () => {
    assert.deepStrictEqual(Cam.normalizeActives(['xyz', 'dapmuoi', 'dapmuoi'], IDS), ['dapmuoi']);
    assert.deepStrictEqual(Cam.normalizeActives([], IDS), ['touchplay']);
    assert.deepStrictEqual(Cam.normalizeActives('bancung', IDS), ['bancung']);
    assert.deepStrictEqual(Cam.normalizeActives(null, IDS), ['touchplay']);
});

test('activesOf: config cũ chỉ có active', () => {
    assert.deepStrictEqual(Cam.activesOf({ active: 'dapmuoi' }, IDS), ['dapmuoi']);
    assert.deepStrictEqual(Cam.activesOf({ active: 'dapmuoi', actives: ['bancung', 'chemtraicay'] }, IDS), ['bancung', 'chemtraicay']);
    assert.deepStrictEqual(Cam.activesOf({}, IDS), ['touchplay']);
});

test('applyPatch: {active} = chơi riêng, {actives} = danh sách mới; active luôn = actives[0]', () => {
    const prev = { enabled: true, active: 'dapmuoi', actives: ['dapmuoi', 'bancung'] };
    assert.deepStrictEqual(Cam.applyPatch(prev, { active: 'chemtraicay' }, IDS), { active: 'chemtraicay', actives: ['chemtraicay'] });
    assert.deepStrictEqual(Cam.applyPatch(prev, { actives: ['dapmuoi', 'level-quest'] }, IDS), { active: 'dapmuoi', actives: ['dapmuoi', 'level-quest'] });
    // patch không đụng tới game → giữ danh sách cũ (vd chỉ đổi nguồn camera)
    assert.deepStrictEqual(Cam.applyPatch(prev, { source: 'Cam' }, IDS), { active: 'dapmuoi', actives: ['dapmuoi', 'bancung'] });
    assert.deepStrictEqual(Cam.applyPatch({ active: 'bancung' }, {}, IDS), { active: 'bancung', actives: ['bancung'] });
});

test('slotOf + toggleWith: chơi kèm thay game cùng khe, bỏ thì giữ phần còn lại', () => {
    assert.strictEqual(Cam.slotOf('dapmuoi'), 'hands');
    assert.strictEqual(Cam.slotOf('level-quest'), 'head');
    assert.deepStrictEqual(Cam.withGame(['dapmuoi'], 'bancung', IDS), ['dapmuoi', 'bancung']);
    assert.deepStrictEqual(Cam.withGame(['dapmuoi', 'bancung'], 'level-quest', IDS), ['dapmuoi', 'level-quest']);
    assert.deepStrictEqual(Cam.withoutGame(['dapmuoi', 'bancung'], 'dapmuoi', IDS), ['bancung']);
    assert.deepStrictEqual(Cam.withoutGame(['dapmuoi'], 'dapmuoi', IDS), ['dapmuoi']);   // không bỏ game cuối cùng
});

const cfgs = {
    bancung: { shieldGifts: [{ giftId: 5655, giftName: 'Rose' }], shotGifts: [{ giftId: '7934' }], healGifts: [], reviveGifts: [] },
    chemtraicay: { giftRules: [{ giftId: '5655', action: 'fruit', enabled: true }, { giftId: '111', action: 'bomb', enabled: false }] },
    dapmuoi: {
        actions: [{ type: 'spray', enabled: true, giftId: '8888', giftName: '' }, { type: 'racket', enabled: false, giftId: '9999' }],
        giftRules: [{ giftId: '', giftName: 'Heart Me', count: 30 }, { giftId: '222', count: 0 }]
    }
};

test('giftClaims: chỉ game đang chơi gán đích danh mới tính', () => {
    const on = ['dapmuoi', 'bancung'];
    assert.deepStrictEqual(Cam.giftClaims({ giftId: 5655 }, cfgs, on), ['bancung']);
    assert.deepStrictEqual(Cam.giftClaims({ giftId: 8888 }, cfgs, on), ['dapmuoi']);
    assert.deepStrictEqual(Cam.giftClaims({ giftId: 1, giftName: 'heart me' }, cfgs, on), ['dapmuoi']);
    assert.deepStrictEqual(Cam.giftClaims({ giftId: 9999 }, cfgs, on), []);    // hành động tắt
    assert.deepStrictEqual(Cam.giftClaims({ giftId: 222 }, cfgs, on), []);     // rule 0 con = không nhận
    assert.deepStrictEqual(Cam.giftClaims({ giftId: 1234 }, cfgs, on), []);    // quà chung
    assert.deepStrictEqual(Cam.giftClaims({ giftId: 5655 }, cfgs, ['chemtraicay', 'bancung']), ['chemtraicay', 'bancung']);
    assert.deepStrictEqual(Cam.giftClaims({ giftId: 111 }, cfgs, ['chemtraicay']), []);   // rule tắt
});

test('claimedElsewhere: chỉ chặn khi ≥2 game và game khác gán đích danh', () => {
    assert.strictEqual(Cam.claimedElsewhere('dapmuoi', ['bancung'], 2), true);
    assert.strictEqual(Cam.claimedElsewhere('dapmuoi', ['bancung', 'dapmuoi'], 2), false);
    assert.strictEqual(Cam.claimedElsewhere('dapmuoi', [], 2), false);
    assert.strictEqual(Cam.claimedElsewhere('dapmuoi', ['bancung'], 1), false);
});

test('overlapGifts: quà cùng gán đích danh ở ≥2 game đang chơi', () => {
    const r = Cam.overlapGifts(cfgs, ['chemtraicay', 'bancung']);
    assert.strictEqual(r.length, 1);
    assert.strictEqual(String(r[0].giftId), '5655');
    assert.deepStrictEqual(r[0].games, ['chemtraicay', 'bancung']);
    assert.deepStrictEqual(Cam.overlapGifts(cfgs, ['dapmuoi', 'bancung']), []);
});
