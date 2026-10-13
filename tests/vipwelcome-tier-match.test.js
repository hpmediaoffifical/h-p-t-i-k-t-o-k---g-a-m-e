'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SKINS, makeDefaultTiers, makeDefaultJoinCard, migrateJoinConfig, matchJoin } = require('../lib/vipwelcome/tier-match.js');

function cfgWith(profileOver) {
    return migrateJoinConfig({ enabled: true, profiles: [{ id: 'p1', name: 'Nhóm', enabled: true, userRules: [], ...profileOver }] });
}
const user = (over) => ({ userId: '1', uniqueId: 'abc', level: 0, fansLevel: 0, ...over });

test('bậc mặc định: 5 bậc, Tân binh tắt, skin hợp lệ', () => {
    const t = makeDefaultTiers();
    assert.equal(t.length, 5);
    assert.deepEqual(t.map(x => x.name), ['Tân binh', 'Hào kiệt', 'Đại gia', 'Huyền thoại', 'Chí tôn']);
    assert.equal(t[0].enabled, false);
    assert.ok(t.every(x => SKINS.includes(x.skin)));
    assert.deepEqual(t.map(x => [x.minLevel, x.minFans]), [[1, 1], [15, 5], [25, 10], [35, 15], [45, 20]]);
    const jc = makeDefaultJoinCard();
    assert.equal(jc.antiDupSec, 10);
    assert.equal(jc.card.maxStack, 3);
    assert.equal(jc.enterText, 'VÀO PHÒNG');
});

test('chọn bậc theo LV hoặc FAN, bậc cao nhất thắng', () => {
    const cfg = cfgWith({});
    assert.equal(matchJoin(cfg, user({ level: 23 })).title, 'Hào kiệt');
    assert.equal(matchJoin(cfg, user({ fansLevel: 12 })).title, 'Đại gia');
    assert.equal(matchJoin(cfg, user({ level: 40, fansLevel: 25 })).title, 'Chí tôn');
    assert.equal(matchJoin(cfg, user({ level: 5 })), null);   // Tân binh đang tắt
    const m = matchJoin(cfg, user({ level: 36 }));
    assert.equal(m.kind, 'tier');
    assert.equal(m.skin, 'flame');
    assert.equal(m.priority, 135);
    assert.equal(m.media, null);
});

test('luật @id thắng bậc, so khớp không phân biệt hoa thường và @', () => {
    const cfg = cfgWith({ userRules: [{ id: 'r1', uniqueId: '@Abc', trigger: 'join', enabled: true, mediaUrl: '/v.mp4', mediaType: 'video', volume: 80, title: 'Đại ca', skin: 'diamond' }] });
    const m = matchJoin(cfg, user({ level: 30 }));
    assert.equal(m.kind, 'user');
    assert.equal(m.priority, 1000);
    assert.equal(m.title, 'Đại ca');
    assert.equal(m.skin, 'diamond');
    assert.equal(m.media.mediaUrl, '/v.mp4');
    assert.equal(m.media.volume, 80);
    assert.equal(m.ruleId, 'p:p1:user:r1');
});

test('luật @id không skin/danh hiệu → mượn của bậc khớp; không media vẫn có thẻ', () => {
    const cfg = cfgWith({ userRules: [{ id: 'r1', uniqueId: 'abc', trigger: 'join', enabled: true }] });
    const m = matchJoin(cfg, user({ level: 26 }));
    assert.equal(m.kind, 'user');
    assert.equal(m.title, 'Đại gia');
    assert.equal(m.skin, 'amber');
    assert.equal(m.media, null);
    const low = matchJoin(cfg, user({ level: 0 }));
    assert.equal(low.title, 'VIP');
    assert.equal(low.skin, 'violet');
});

test('luật lưu userId khớp khi người dùng đổi @id', () => {
    const cfg = cfgWith({ userRules: [{ id: 'r1', uniqueId: 'tencu', userId: '77', trigger: 'join', enabled: true }] });
    assert.equal(matchJoin(cfg, user({ userId: '77', uniqueId: 'tenmoi' })).kind, 'user');
});

test('luật trigger khác join / luật tắt không áp dụng', () => {
    const cfg = cfgWith({ userRules: [
        { id: 'r1', uniqueId: 'abc', trigger: 'gift', enabled: true },
        { id: 'r2', uniqueId: 'abc', trigger: 'join', enabled: false }
    ] });
    assert.equal(matchJoin(cfg, user({ level: 0 })), null);
});

test('bậc 0/0 bắt tất cả; profile tắt bị bỏ qua', () => {
    const cfg = cfgWith({});
    cfg.profiles[0].joinTiers.push({ id: 'all', enabled: true, name: 'Mọi người', minLevel: 0, minFans: 0, skin: 'ice' });
    assert.equal(matchJoin(cfg, user()).title, 'Mọi người');
    assert.equal(matchJoin(cfg, user({ level: 20 })).title, 'Hào kiệt');
    cfg.profiles[0].enabled = false;
    assert.equal(matchJoin(cfg, user({ level: 20 })), null);
});

test('migrate globalJoin: bật + có media → thành bậc, tắt globalJoin, chạy lại không nhân đôi', () => {
    const cfg = { enabled: true, profiles: [{ id: 'p1', enabled: true, userRules: [], globalJoin: { enabled: true, mediaUrl: '/a.mp4', mediaType: 'video', volume: 70, minLevel: 30, minFansLevel: 0 } }] };
    migrateJoinConfig(cfg);
    const tiers = cfg.profiles[0].joinTiers;
    const legacy = tiers.find(t => t.name === 'Tất cả user (cũ)');
    assert.ok(legacy);
    assert.equal(legacy.minLevel, 30);
    assert.equal(legacy.mediaUrl, '/a.mp4');
    assert.equal(legacy.volume, 70);
    assert.equal(cfg.profiles[0].globalJoin.enabled, false);
    migrateJoinConfig(cfg);
    assert.equal(cfg.profiles[0].joinTiers.length, tiers.length);
    assert.equal(matchJoin(cfg, user({ level: 31 })).media.mediaUrl, '/a.mp4');
    assert.ok(cfg.joinCard && cfg.joinCard.card);
});

test('migrate: joinCard thiếu field được bù, skin lạ về violet', () => {
    const cfg = { profiles: [{ id: 'p1', enabled: true, joinTiers: [{ id: 'x', name: 'A', minLevel: 3, skin: 'rainbow' }] }], joinCard: { card: { maxStack: 5 } } };
    migrateJoinConfig(cfg);
    assert.equal(cfg.joinCard.card.maxStack, 5);
    assert.equal(cfg.joinCard.card.durationMs, 5000);
    assert.equal(cfg.joinCard.lateWelcome, true);
    const t = cfg.profiles[0].joinTiers[0];
    assert.equal(t.skin, 'violet');
    assert.equal(t.minFans, 0);
    assert.equal(t.enabled, true);
    assert.equal(t.rejoinCooldownSec, 0);
});
