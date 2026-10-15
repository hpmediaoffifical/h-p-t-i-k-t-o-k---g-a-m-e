'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SKINS, makeDefaultTiers, makeDefaultJoinCard, migrateJoinConfig, matchJoin } = require('../lib/vipwelcome/tier-match.js');

function cfgWith(profileOver) {
    return migrateJoinConfig({ enabled: true, profiles: [{ id: 'p1', name: 'Nhóm', enabled: true, userRules: [], ...profileOver }] });
}
const user = (over) => ({ userId: '1', uniqueId: 'abc', level: 0, fansLevel: 0, ...over });

test('bậc mặc định: 6 bậc (20–24 / 25–35 / 36–40 / 41–49 / 50), Tân binh tắt, skin hợp lệ', () => {
    const t = makeDefaultTiers();
    assert.equal(t.length, 6);
    assert.deepEqual(t.map(x => x.name), ['Tân binh', 'Hào kiệt', 'Đại gia', 'Huyền thoại', 'Chí tôn', 'Đế vương']);
    assert.equal(t[0].enabled, false);
    assert.ok(t.every(x => SKINS.includes(x.skin)));
    assert.deepEqual(t.map(x => [x.minLevel, x.minFans]), [[1, 1], [20, 5], [25, 10], [36, 15], [41, 20], [50, 0]]);
    assert.equal(t[5].skin, 'imperial');
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
    assert.equal(m.priority, 136);
    assert.equal(matchJoin(cfg, user({ level: 50 })).title, 'Đế vương');
    assert.equal(matchJoin(cfg, user({ level: 49 })).title, 'Chí tôn');
    assert.equal(matchJoin(cfg, user({ level: 35 })).title, 'Đại gia');
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
    assert.equal(m.userRuleId, 'r1');
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

test('Giai đoạn 3: TTS mặc định bật từ Đại gia, matchJoin trả tts; joinCard có batch/tts/hotkeys/board', () => {
    const t = makeDefaultTiers();
    assert.deepEqual(t.map(x => x.tts.enabled), [false, false, true, true, true, true]);
    assert.equal(t[2].tts.template, '{bậc} {tên} đã tới phòng!');
    const jc = makeDefaultJoinCard();
    assert.deepEqual(jc.batch, { enabled: true, belowTierLevel: 25 });
    assert.equal(jc.showVisits, true);
    assert.deepEqual(jc.tts, { enabled: true, volume: 90 });
    assert.deepEqual(jc.hotkeys, { enabled: false, skip: 'S', clear: 'C' });
    assert.equal(jc.board.limit, 10);
    const cfg = cfgWith({ userRules: [{ id: 'r1', uniqueId: 'abc', trigger: 'join', enabled: true, tts: { enabled: true, template: 'Chào {tên}' } }] });
    assert.deepEqual(matchJoin(cfg, user({ level: 30 })).tts, { enabled: true, template: 'Chào {tên}' });
    assert.equal(matchJoin(cfg, user({ uniqueId: 'khac', userId: '2', level: 30 })).tts.enabled, true);
    const noTts = cfgWith({ userRules: [{ id: 'r1', uniqueId: 'abc', trigger: 'join', enabled: true }] });
    assert.equal(matchJoin(noTts, user({ level: 30 })).tts.enabled, false);
});

test('migrate Giai đoạn 3: joinCard v1.10 cũ được bù field con, bậc cũ có tts theo minLevel', () => {
    const cfg = { profiles: [{ id: 'p1', enabled: true, joinTiers: [{ id: 'a', name: 'Cao', minLevel: 30 }, { id: 'b', name: 'Thấp', minLevel: 5 }] }],
        joinCard: { enabled: true, card: { maxStack: 4 }, tts: { volume: 50 } } };
    migrateJoinConfig(cfg);
    assert.equal(cfg.joinCard.tts.volume, 50);
    assert.equal(cfg.joinCard.tts.enabled, true);
    assert.equal(cfg.joinCard.batch.belowTierLevel, 25);
    assert.equal(cfg.joinCard.board.scope, 'month');
    assert.equal(cfg.profiles[0].joinTiers[0].tts.enabled, true);
    assert.equal(cfg.profiles[0].joinTiers[1].tts.enabled, false);
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

test('thanh chào gọn: mặc định style=bar + bar{}; cấu hình cũ được bù, giữ "card" nếu đã chọn', () => {
    const jc = makeDefaultJoinCard();
    assert.equal(jc.style, 'bar');
    assert.deepEqual(jc.bar, { xPercent: 2, yPercent: 68, scale: 100, slots: 3, wow: true });
    const old = migrateJoinConfig({ profiles: [], joinCard: { enabled: true, card: { maxStack: 4 } } });
    assert.equal(old.joinCard.style, 'bar');
    assert.equal(old.joinCard.bar.yPercent, 68);
    const keep = migrateJoinConfig({ profiles: [], joinCard: { style: 'card', bar: { yPercent: 70 } } });
    assert.equal(keep.joinCard.style, 'card');
    assert.equal(keep.joinCard.bar.yPercent, 70);
    assert.equal(keep.joinCard.bar.slots, 3);
    const bad = migrateJoinConfig({ profiles: [], joinCard: { style: 'xyz' } });
    assert.equal(bad.joinCard.style, 'bar');
});

test('bộ lọc "từ cấp X trở lên": chặn dưới mức, fan club vượt qua, người chỉ định theo ID luôn được chào', () => {
    const { gatePasses } = require('../lib/vipwelcome/tier-match.js');
    const cfg = migrateJoinConfig({ profiles: [{ id: 'p', enabled: true, userRules: [{ id: 'r', trigger: 'join', uniqueId: 'vip_me', enabled: true }] }] });
    cfg.profiles[0].joinTiers.forEach(t => { t.enabled = true; });   // bật cả Tân binh (LV ≥ 1)
    assert.equal(cfg.joinCard.gate.enabled, false);
    assert.equal(cfg.joinCard.gate.minLevel, 20);
    assert.ok(matchJoin(cfg, { uniqueId: 'a', level: 3 }), 'tắt lọc: LV3 vẫn khớp Tân binh');
    cfg.joinCard.gate = { enabled: true, minLevel: 20, minFans: 0 };
    assert.equal(matchJoin(cfg, { uniqueId: 'a', level: 3 }), null, 'LV3 < 20 bị chặn');
    assert.equal(matchJoin(cfg, { uniqueId: 'a', level: 19, fansLevel: 12 }), null, 'FAN của bậc không vượt lọc khi chưa bật fan club');
    assert.equal(matchJoin(cfg, { uniqueId: 'a', level: 50 }).title, 'Đế vương');
    assert.equal(matchJoin(cfg, { uniqueId: 'vip_me', level: 1 }).kind, 'user', 'ID chỉ định luôn qua');
    cfg.joinCard.gate.minFans = 10;
    assert.ok(matchJoin(cfg, { uniqueId: 'a', level: 3, fansLevel: 12 }), 'fan club ≥ 10 vượt lọc');
    assert.equal(gatePasses({ enabled: false, minLevel: 40 }, { level: 1 }), true);
    const m = migrateJoinConfig({ profiles: [], joinCard: { gate: { enabled: 1, minLevel: 99, maxLevel: 40 } } });
    assert.equal(m.joinCard.gate.minLevel, 50, 'kẹp ≤ 50 (cấp TikTok tối đa)');
    assert.equal('maxLevel' in m.joinCard.gate, false, '"đến cấp" đã bỏ');
});

test('nâng thang bậc cũ (15/25/35/45) → 20/25/36/41 + thêm Đế vương 50, chỉ 1 lần, giữ mốc đã sửa tay', () => {
    const { upgradeTierLadder, normalizeTier } = require('../lib/vipwelcome/tier-match.js');
    const old = [['Tân binh', 1], ['Hào kiệt', 15], ['Đại gia', 25], ['Huyền thoại', 35], ['Chí tôn', 45]]
        .map(([name, minLevel]) => normalizeTier({ name, minLevel }));
    const cfg = migrateJoinConfig({ profiles: [{ id: 'p', joinTiers: old }] });
    const t = cfg.profiles[0].joinTiers;
    assert.deepEqual(t.map(x => [x.name, x.minLevel]), [['Tân binh', 1], ['Hào kiệt', 20], ['Đại gia', 25], ['Huyền thoại', 36], ['Chí tôn', 41], ['Đế vương', 50]]);
    assert.equal(t[5].skin, 'imperial');
    t.pop(); migrateJoinConfig(cfg);
    assert.equal(cfg.profiles[0].joinTiers.length, 5, 'đã xoá Đế vương thì không thêm lại');
    const custom = { joinTiers: [normalizeTier({ name: 'Hào kiệt', minLevel: 18 }), normalizeTier({ name: 'Chí tôn', minLevel: 44 })] };
    upgradeTierLadder(custom);
    assert.deepEqual(custom.joinTiers.map(x => x.minLevel), [18, 44, 50], 'mốc sửa tay giữ nguyên');
});
