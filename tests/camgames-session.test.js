// 🎮 Phiên game theo quà — luật thuần lib/camgames-session.js (port từ HP LIVE NPC).
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/camgames-session');

test('normalizeTrigger: mặc định tắt, kẹp số giây / mở đầu, bỏ luật không có quà, game lạ → game đầu', () => {
    const t = S.normalizeTrigger({ enabled: true, introSec: 99, rules: [
        { giftId: 5655, gameId: 'dacau', seconds: 9999, queueMode: 'cut' },
        { gameId: 'xx', giftName: 'Rose', seconds: 1 },
        { gameId: 'dapmuoi' }
    ] });
    assert.equal(t.enabled, true);
    assert.equal(t.introSec, 10);
    assert.equal(t.rules.length, 2);
    assert.deepEqual([t.rules[0].giftId, t.rules[0].gameId, t.rules[0].seconds, t.rules[0].queueMode], ['5655', 'dacau', 600, 'cut']);
    assert.deepEqual([t.rules[1].gameId, t.rules[1].seconds, t.rules[1].queueMode], [S.TRIGGER_GAMES[0], 5, 'next']);
    assert.equal(S.normalizeTrigger(null).enabled, false);
    assert.equal(S.normalizeTrigger({ rules: [{ giftId: '1', seconds: 'abc' }] }).rules[0].seconds, 300, 'thiếu số → 300 s');
});

test('matchTrigger: so id trước, luật không id mới so tên; tắt tính năng / luật tắt → null', () => {
    const t = S.normalizeTrigger({ enabled: true, rules: [
        { giftId: '5655', gameId: 'dacau' }, { giftName: 'Rose', gameId: 'dapmuoi' }, { giftId: '7', gameId: 'bancung', enabled: false }
    ] });
    assert.equal(S.matchTrigger(t, { giftId: '5655', giftName: 'Rose' }).gameId, 'dacau');
    assert.equal(S.matchTrigger(t, { giftId: '1', giftName: ' rose ' }).gameId, 'dapmuoi', 'tên so không phân biệt hoa thường, bỏ khoảng trắng');
    assert.equal(S.matchTrigger(t, { giftId: '1', giftName: 'Rosé' }), null);
    assert.equal(S.matchTrigger(t, { giftId: '1', giftName: 'Rose' }).gameId, 'dapmuoi');
    assert.equal(S.matchTrigger(t, { giftId: '7' }), null);
    assert.equal(S.matchTrigger({ ...t, enabled: false }, { giftId: '5655' }), null);
});

test('combo ×N = N lần số giây (trần an toàn 6 giờ); gia hạn cộng đủ', () => {
    const rule = { seconds: 60 };
    assert.equal(S.comboSeconds(rule, { repeatCount: 1 }), 60);
    assert.equal(S.comboSeconds(rule, { repeatCount: 5 }), 300);
    assert.equal(S.comboSeconds(rule, { quantity: 3, repeatCount: 9 }), 180, 'quantity ưu tiên');
    assert.equal(S.comboSeconds(rule, { repeatCount: 100000 }), S.SESSION_HARD_MAX_SEC);
    const now = 1000;
    assert.equal(S.extendUntil(now + 10000, 5000, now), now + 15000);
    assert.equal(S.extendUntil(now + 10000, 1e12, now), now + S.SESSION_HARD_MAX_SEC * 1000);
});

test('hàng chờ: next chen đầu, queue xếp cuối, cùng game thì cộng giây', () => {
    let q = S.enqueue([], { gameId: 'dacau', seconds: 60 }, 'queue');
    q = S.enqueue(q, { gameId: 'dapmuoi', seconds: 30 }, 'queue');
    q = S.enqueue(q, { gameId: 'bancung', seconds: 20 }, 'next');
    assert.deepEqual(q.map(x => x.gameId), ['bancung', 'dacau', 'dapmuoi']);
    const q2 = S.enqueue(q, { gameId: 'dacau', seconds: 40 }, 'next');
    assert.deepEqual(q2.map(x => [x.gameId, x.seconds]), [['bancung', 20], ['dacau', 100], ['dapmuoi', 30]]);
    assert.equal(q.find(x => x.gameId === 'dacau').seconds, 60, 'không sửa mảng cũ');
});

test('gameGiftList: quà từng game hiện trên overlay, tra ảnh trong catalog', () => {
    const cat = [{ id: '5658', name: 'Perfume', image: 'p.png', diamonds: 20 }];
    const dc = S.gameGiftList('dacau', { gifts: [{ giftId: '5658', ball: 'gold' }] }, cat);
    assert.deepEqual([dc[0].name, dc[0].image, dc[0].label], ['Perfume', 'p.png', '🟡 Cầu vàng']);
    const bc = S.gameGiftList('bancung', { shotGifts: [{ giftId: '1', giftName: 'A', shots: 3 }], freeFireEnabled: true }, []);
    assert.deepEqual(bc.map(x => x.label), ['🏹 ×3', 'Bắn theo xu']);
    const tp = S.gameGiftList('touchplay', { tpCfg: { gifts: [{ giftId: '9', giftName: 'X', action: 'rain' }], tiers: [] } }, []);
    assert.deepEqual(tp.map(x => x.label), ['🌧 Mưa bóng']);
    assert.ok(S.gameGiftList('touchplay', {}, []).length >= 5, 'chưa có tpCfg → mốc xu mặc định');
});
