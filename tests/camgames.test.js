const test = require('node:test');
const assert = require('node:assert');
const Cam = require('../lib/camgames');

const IDS = ['touchplay', 'chemtraicay', 'dapmuoi', 'bancung', 'level-quest', 'dacau', 'body'];

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

test('config cũ v1.13 {active} gộp với DEFAULT_CONFIG vẫn giữ game đã chọn (không thành Touch & Play)', () => {
    for (const id of ['dapmuoi', 'chemtraicay', 'level-quest']) {
        const merged = { ...Cam.DEFAULT_CONFIG, ...{ enabled: true, active: id, source: 'Cam' } };
        assert.deepStrictEqual(Cam.applyPatch(merged, {}, IDS), { active: id, actives: [id] });
    }
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
    bancung: { enabled: true, sessionActive: true, shieldGifts: [{ giftId: 5655, giftName: 'Rose' }], shotGifts: [{ giftId: '7934' }], healGifts: [], reviveGifts: [] },
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

test('giftClaims: game không xử lý quà thì không giành (Bắn Cung chưa BẮT ĐẦU / tắt) — kẻo quà mất trắng', () => {
    const on = ['dapmuoi', 'bancung'];
    const stopped = { ...cfgs, bancung: { ...cfgs.bancung, sessionActive: false } };
    assert.deepStrictEqual(Cam.giftClaims({ giftId: 5655 }, stopped, on), []);
    const off = { ...cfgs, bancung: { ...cfgs.bancung, enabled: false } };
    assert.deepStrictEqual(Cam.giftClaims({ giftId: 5655 }, off, on), []);
    const ctOff = { ...cfgs, chemtraicay: { ...cfgs.chemtraicay, enabled: false } };
    assert.deepStrictEqual(Cam.giftClaims({ giftId: 5655 }, ctOff, ['chemtraicay', 'level-quest']), []);
});

test('giftClaims: so khớp như handler của từng game — Bắn Cung/Chém Trái Cây chỉ theo id, Đập Muỗi id hoặc tên', () => {
    // cùng tên Rose nhưng khác id: Bắn Cung (chỉ so id) không nhận
    assert.deepStrictEqual(Cam.giftClaims({ giftId: 999, giftName: 'Rose' }, cfgs, ['dapmuoi', 'bancung']), []);
    // quà thử không có id
    assert.deepStrictEqual(Cam.giftClaims({ giftName: 'Rose' }, cfgs, ['chemtraicay', 'bancung']), []);
    // Đập Muỗi so cả tên
    assert.deepStrictEqual(Cam.giftClaims({ giftId: 999, giftName: 'Heart Me' }, cfgs, ['dapmuoi', 'bancung']), ['dapmuoi']);
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

test('registry.js khai slot khớp SLOTS của lib (game mới phải khai cả hai chỗ)', () => {
    global.window = {};
    delete require.cache[require.resolve('../public/games/camgames/registry.js')];
    require('../public/games/camgames/registry.js');
    const list = global.window.HpCamGames;
    delete global.window;
    assert.ok(list.length >= 5);
    for (const g of list) assert.strictEqual(g.slot, Cam.SLOTS[g.id], g.id);
});

test('phím tắt: chơi 2 game cùng có phím tắt → chỉ game được bấm vào gần nhất giữ phím', () => {
    const cam = { enabled: true, actives: ['dapmuoi', 'bancung'] };
    // chưa bấm game nào: game đầu danh sách giữ phím
    assert.strictEqual(Cam.hotkeysAllowed('dapmuoi', cam, IDS), true);
    assert.strictEqual(Cam.hotkeysAllowed('bancung', cam, IDS), false);
    const picked = { ...cam, hotkeyGame: 'bancung' };
    assert.strictEqual(Cam.hotkeysAllowed('dapmuoi', picked, IDS), false);
    assert.strictEqual(Cam.hotkeysAllowed('bancung', picked, IDS), true);
});

test('phím tắt: không đụng nhau thì không chặn (1 game có phím, chơi riêng, hub tắt, game ngoài hub)', () => {
    assert.strictEqual(Cam.hotkeysAllowed('dapmuoi', { actives: ['dapmuoi', 'level-quest'], hotkeyGame: 'level-quest' }, IDS), true);
    assert.strictEqual(Cam.hotkeysAllowed('bancung', { actives: ['bancung'] }, IDS), true);
    assert.strictEqual(Cam.hotkeysAllowed('bancung', { enabled: false, actives: ['dapmuoi', 'bancung'], hotkeyGame: 'dapmuoi' }, IDS), true);
    assert.strictEqual(Cam.hotkeysAllowed('bancung', { actives: ['chemtraicay', 'level-quest'] }, IDS), true);
});

test('registry.js đánh dấu `hotkeys` khớp HOTKEY_GAMES của lib', () => {
    global.window = {};
    delete require.cache[require.resolve('../public/games/camgames/registry.js')];
    require('../public/games/camgames/registry.js');
    const list = global.window.HpCamGames;
    delete global.window;
    for (const g of list) assert.strictEqual(!!g.hotkeys, Cam.HOTKEY_GAMES.has(g.id), g.id);
});

test('khe kick / body: chơi tối đa 4 game cùng lúc, mỗi khe 1 game', () => {
    assert.deepStrictEqual(Cam.normalizeActives(['dapmuoi', 'bancung', 'dacau', 'body'], IDS), ['dapmuoi', 'bancung', 'dacau', 'body']);
    // thêm game tay khác → chỉ khe tay đổi, 3 khe còn lại giữ
    assert.deepStrictEqual(Cam.normalizeActives(['dapmuoi', 'bancung', 'dacau', 'body', 'touchplay'], IDS), ['bancung', 'dacau', 'body', 'touchplay']);
    assert.strictEqual(Cam.slotOf('dacau'), 'kick');
    assert.strictEqual(Cam.slotOf('body'), 'body');
});

test('Đá Cầu: quà đích danh chỉ so theo id (như handler)', () => {
    const cfgs = { dacau: { gifts: [{ giftId: '5658', giftName: 'Perfume', ball: 'gold' }, { giftName: 'Rose' }] }, dapmuoi: {} };
    assert.deepStrictEqual(Cam.giftClaims({ giftId: '5658', giftName: 'x' }, cfgs, ['dapmuoi', 'dacau']), ['dacau']);
    // mục không id bị bỏ (Đá Cầu không so tên) → quà Rose không bị giành khỏi Đập Muỗi
    assert.deepStrictEqual(Cam.giftClaims({ giftId: '1', giftName: 'Rose' }, cfgs, ['dapmuoi', 'dacau']), []);
});

test('Touch & Play: quà chỉ định từng hành động giành quà khi chơi kèm (chưa lưu gifts = bộ mẫu, so cả tên)', () => {
    const cfgs = { touchplay: { tpCfg: {} }, bancung: { sessionActive: true, shotGifts: [] } };
    assert.deepStrictEqual(Cam.giftClaims({ giftId: '5655', giftName: 'Rose' }, cfgs, ['touchplay', 'bancung']), ['touchplay']);
    assert.deepStrictEqual(Cam.giftClaims({ giftId: 'x', giftName: 'perfume' }, cfgs, ['touchplay', 'bancung']), ['touchplay']);
    // streamer bỏ hết quà chỉ định → không giành gì
    assert.deepStrictEqual(Cam.giftClaims({ giftId: '5655' }, { ...cfgs, touchplay: { tpCfg: { gifts: [] } } }, ['touchplay', 'bancung']), []);
});
