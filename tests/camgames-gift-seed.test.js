// 🎥 Bộ quà mẫu Game Camera: một lần, chỉ điền game còn trống quà, không tự bật quà kích hoạt.
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyGiftSeed, SEED } = require('../lib/camgames-gift-seed');

const mk = id => ({ dacau: { gifts: [] }, chemtraicay: { giftRules: [] }, dapmuoi: { actions: [{ type: 'spray' }], giftRules: [] },
    bancung: { shotGifts: [], healGifts: [], reviveGifts: [], shieldGifts: [] } }[id] || null);

test('máy mới: gieo đủ game + luật quà kích hoạt (tắt sẵn), một lần', () => {
    const games = {};
    const done = applyGiftSeed(games, mk);
    assert.deepEqual(done.sort(), ['bancung', 'chemtraicay', 'dacau', 'dapmuoi', 'trigger']);
    assert.equal(games.camgames.trigger.enabled, false);
    assert.equal(games.camgames.trigger.rules.length, SEED.trigger.rules.length);
    assert.equal(games.dacau.gifts.length, SEED.dacau.length);
    assert.ok(games.dapmuoi.actions.some(a => a.type === 'boss'));
    assert.deepEqual(applyGiftSeed(games, mk), [], 'đã gieo thì thôi');
});

test('Đập Muỗi: gắn quà vào hành động cùng loại, GIỮ phím tắt / thông số streamer đã chỉnh; loại chưa có thì thêm', () => {
    const games = { dapmuoi: { actions: [{ type: 'spray', hotkey: 'Ctrl+1', params: { seconds: 9 } }], giftRules: [] } };
    applyGiftSeed(games, mk);
    const spray = games.dapmuoi.actions.find(a => a.type === 'spray');
    assert.equal(spray.hotkey, 'Ctrl+1');
    assert.deepEqual(spray.params, { seconds: 9 });
    const seedSpray = SEED.dapmuoi.actions.find(a => a.type === 'spray');
    if (seedSpray && seedSpray.giftId) assert.equal(spray.giftId, seedSpray.giftId);
    assert.ok(games.dapmuoi.actions.some(a => a.type === 'boss'), 'Muỗi Chúa thêm vào config cũ');
    assert.equal(games.dapmuoi.actions.filter(a => a.type === 'spray').length, 1, 'không nhân đôi hành động');
});

test('máy đã gắn quà: giữ nguyên quà của streamer, chỉ điền game còn trống', () => {
    const games = { dacau: { gifts: [{ giftId: '1', ball: 'gold' }] }, bancung: { shotGifts: [{ giftId: '2' }] },
        camgames: { trigger: { enabled: true, rules: [{ giftId: '3', gameId: 'dacau' }] } } };
    const done = applyGiftSeed(games, mk);
    assert.deepEqual(done.sort(), ['chemtraicay', 'dapmuoi']);
    assert.deepEqual(games.dacau.gifts, [{ giftId: '1', ball: 'gold' }]);
    assert.deepEqual(games.bancung.shotGifts, [{ giftId: '2' }]);
    assert.equal(games.camgames.trigger.enabled, true);
    assert.equal(games.camgames.trigger.rules.length, 1);
});
