'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ft = require('../lib/vipwelcome/fan-tiers.js');

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 12, 12);
const tiers = ft.normalizeFanTiers();
const base = { visitNo: 2, isFirst: false, prevAt: NOW - DAY, xu: 0, fansLevel: 0, now: NOW };
const idOf = (s, t = tiers) => ft.classifyFan({ ...base, ...s }, t)?.id || null;

test('normalizeFanTiers: đủ 5 bậc đúng thứ tự, ghép theo id, bỏ id lạ, giữ mốc đã sửa', () => {
    assert.deepEqual(ft.normalizeFanTiers().map(t => t.id), ['sop', 'lau', 'fan', 'quen', 'moi']);
    const n = ft.normalizeFanTiers([{ id: 'quen', minSessions: 9, label: 'Hàng xóm' }, { id: 'xyz' }, { id: 'sop', enabled: false }]);
    assert.deepEqual(n.map(t => t.id), ['sop', 'lau', 'fan', 'quen', 'moi']);
    assert.equal(n[3].minSessions, 9);
    assert.equal(n[3].label, 'Hàng xóm');
    assert.equal(n[0].enabled, false);
    assert.equal(n[0].minXu, 1000);
    assert.equal(n[0].tts.enabled, true);
    assert.equal(n[4].tts.enabled, false);
    // số âm / rác → về mặc định an toàn
    assert.equal(ft.normalizeFanTiers([{ id: 'lau', minAwayDays: -3 }])[1].minAwayDays, 0);
    assert.equal(ft.normalizeFanTiers('rác').length, 5);
});

test('classifyFan: từng bậc theo mốc mặc định', () => {
    assert.equal(idOf({ xu: 1000 }), 'sop');
    assert.equal(idOf({ xu: 999 }), null);
    assert.equal(idOf({ visitNo: 4, prevAt: NOW - 14 * DAY }), 'lau');      // 3 buổi trước đó, vắng 14 ngày
    assert.equal(idOf({ visitNo: 2, prevAt: NOW - 30 * DAY }), null);       // mới ghé 1 buổi trước → chưa tính
    assert.equal(idOf({ visitNo: 4, prevAt: NOW - 13 * DAY }), null);
    assert.equal(idOf({ fansLevel: 10 }), 'fan');
    assert.equal(idOf({ visitNo: 5 }), 'quen');
    assert.equal(idOf({ visitNo: 1, isFirst: true, prevAt: 0 }), 'moi');
});

test('classifyFan: thứ tự ưu tiên sộp > lâu > fan > quen > mới; bậc tắt thì xuống bậc kế', () => {
    const all = { xu: 5000, visitNo: 8, prevAt: NOW - 40 * DAY, fansLevel: 20 };
    assert.equal(idOf(all), 'sop');
    const t = ft.normalizeFanTiers([{ id: 'sop', enabled: false }, { id: 'lau', enabled: false }]);
    assert.equal(idOf(all, t), 'fan');
    assert.equal(idOf({ xu: 5000, visitNo: 1, isFirst: true, prevAt: 0 }), 'sop');   // khách mới mà tặng nhiều → sộp
});

test('classifyFan: ẩn danh / chủ phòng / thiếu stats → null; tắt cả hệ → null', () => {
    assert.equal(ft.classifyFan({ ...base, xu: 9999, noVisit: true }, tiers), null);
    assert.equal(ft.classifyFan(null, tiers), null);
    assert.equal(ft.classifyFan({ ...base, xu: 9999 }, tiers, { enabled: false }), null);
});

test('fanMatch: dựng match chào cho bậc có forceGreet, bậc không forceGreet → null', () => {
    const sop = tiers[0];
    const m = ft.fanMatch(sop, 100);
    assert.equal(m.kind, 'fan');
    assert.equal(m.priority, 125);
    assert.equal(m.title, '');                      // huy hiệu đã ghi bậc → không lặp tên bậc ở chip/tiêu đề
    assert.equal(m.skin, 'amber');                  // khách sộp: thanh vàng
    assert.equal(ft.fanMatch(tiers[1], 100).skin, 'violet');
    assert.equal(m.media, null);
    assert.equal(m.cooldownSec, 0);
    assert.equal(m.ruleId, 'fan:sop');
    assert.equal(ft.fanMatch(tiers[3], 100), null);   // khách quen không tự chào
    assert.equal(ft.fanMatch(null, 100), null);
});

test('fanBadge + fanTts: huy hiệu gọn, câu đọc chỉ khi bậc bật đọc', () => {
    assert.deepEqual(ft.fanBadge(tiers[0]), { id: 'sop', icon: '💎', label: 'Khách sộp' });
    assert.equal(ft.fanBadge(null), null);
    assert.match(ft.fanTts(tiers[0]).template, /\{tên\}/);
    assert.equal(ft.fanTts(tiers[4]), null);
});

test('awayDays: số ngày vắng làm tròn xuống, chưa gặp → 0', () => {
    assert.equal(ft.awayDays(NOW - 20.7 * DAY, NOW), 20);
    assert.equal(ft.awayDays(0, NOW), 0);
});

test('buildFanBook: gộp 2 sổ theo key, bậc tính cho buổi kế tiếp, tìm + sắp xếp + giới hạn', () => {
    const visits = [
        { key: 'u1', uniqueId: 'davina', nickname: 'Davina', sessions: 7, lastAt: NOW - 2 * DAY, fansLevel: 3, streak: 2 },
        { key: 'u2', uniqueId: 'bao', nickname: 'Bảo', sessions: 3, lastAt: NOW - 20 * DAY },
        { key: 'u3', uniqueId: 'cuc', nickname: 'Cúc', sessions: 1, lastAt: NOW - DAY }
    ];
    const ledger = [{ key: 'u1', xu: 300, uniqueId: 'davina', nickname: 'Davina' }, { key: 'u9', xu: 2000, uniqueId: 'sep', nickname: 'Sếp' }];
    const all = ft.buildFanBook({ visits, ledger }, tiers, NOW);
    assert.deepEqual(all.map(r => r.key), ['u9', 'u1', 'u2', 'u3']);    // mặc định theo xu rồi số buổi
    const by = Object.fromEntries(all.map(r => [r.key, r]));
    assert.equal(by.u1.xu, 300);
    assert.equal(by.u1.sessions, 7);
    assert.equal(by.u1.tier.id, 'quen');
    assert.equal(by.u2.tier.id, 'lau');
    assert.equal(by.u3.tier, null);
    assert.equal(by.u9.sessions, 0);
    assert.equal(by.u9.tier.id, 'sop');
    assert.deepEqual(ft.buildFanBook({ visits, ledger }, tiers, NOW, { sort: 'sessions' }).map(r => r.key), ['u1', 'u2', 'u3', 'u9']);
    assert.deepEqual(ft.buildFanBook({ visits, ledger }, tiers, NOW, { sort: 'recent' }).map(r => r.key)[0], 'u3');
    assert.deepEqual(ft.buildFanBook({ visits, ledger }, tiers, NOW, { q: 'bao' }).map(r => r.key), ['u2']);   // tìm bỏ dấu
    assert.equal(ft.buildFanBook({ visits, ledger }, tiers, NOW, { limit: 2 }).length, 2);
    assert.deepEqual(ft.buildFanBook({}, tiers, NOW), []);
});
