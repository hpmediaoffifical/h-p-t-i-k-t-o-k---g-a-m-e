'use strict';
/* VIP Welcome — bậc thẻ vào phòng + chọn luật cho 1 lần vào phòng.
 * Thứ tự: luật @id (trigger 'join') > bậc. Bậc khớp khi "LV ≥ minLevel HOẶC FAN ≥ minFans"
 * (0 = không xét; cả hai 0 = mọi người). Nhiều bậc khớp → minLevel cao nhất, hoà thì minFans cao nhất. */

const SKINS = ['violet', 'ice', 'amber', 'flame', 'diamond', 'imperial'];   // imperial = Đế vương (cấp 50, cao nhất TikTok)
const USER_RULE_PRIORITY = 1000;
const TIER_PRIORITY_BASE = 100;
const LEGACY_TIER_NAME = 'Tất cả user (cũ)';
const TTS_DEFAULT_MIN_LEVEL = 25;   // giọng đọc mặc định bật từ bậc Đại gia — phòng đông không bị đọc liên tục
const TTS_TIER_TEMPLATE = '{bậc} {tên} đã tới phòng!';
const TTS_USER_TEMPLATE = 'Chào mừng {tên} vào phòng!';

function normalizeTts(tts, defEnabled, defTemplate) {
    const t = tts && typeof tts === 'object' ? tts : {};
    return { enabled: t.enabled == null ? !!defEnabled : !!t.enabled, template: String(t.template || defTemplate).slice(0, 120) };
}

function newTierId() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function normalizeTier(t) {
    t = t || {};
    return {
        id: t.id || newTierId(),
        enabled: t.enabled !== false,
        name: String(t.name || 'Bậc mới'),
        minLevel: Math.max(0, Number(t.minLevel) || 0),
        minFans: Math.max(0, Number(t.minFans) || 0),
        skin: SKINS.includes(t.skin) ? t.skin : 'violet',
        frameUrl: t.frameUrl || '',
        mediaUrl: t.mediaUrl || '', mediaName: t.mediaName || '', mediaType: t.mediaType || '',
        volume: t.volume == null ? 100 : Math.max(0, Math.min(100, Number(t.volume) || 0)),
        rejoinCooldownSec: Math.max(0, Number(t.rejoinCooldownSec) || 0),
        tts: normalizeTts(t.tts, (Number(t.minLevel) || 0) >= TTS_DEFAULT_MIN_LEVEL, TTS_TIER_TEMPLATE)
    };
}

// Thang bậc theo cấp TikTok (1–50; cấp 25 là mốc TikTok bắt đầu có hiệu ứng vào phòng mặc định):
// Hào kiệt 20–24 · Đại gia 25–35 · Huyền thoại 36–40 · Chí tôn 41–49 · Đế vương 50.
const TIER_LADDER_V = 2;
function makeDefaultTiers() {
    return [
        ['Tân binh', 1, 1, 'ice', false],
        ['Hào kiệt', 20, 5, 'violet', true],
        ['Đại gia', 25, 10, 'amber', true],
        ['Huyền thoại', 36, 15, 'flame', true],
        ['Chí tôn', 41, 20, 'diamond', true],
        ['Đế vương', 50, 0, 'imperial', true]
    ].map(([name, minLevel, minFans, skin, enabled]) => normalizeTier({ name, minLevel, minFans, skin, enabled }));
}

// Máy cũ còn thang mặc định v1 (15/25/35/45, chưa sửa tay mốc cấp) → đổi sang v2 + thêm Đế vương. Chạy 1 lần/nhóm
// (p.tierLadderV) — người dùng xoá Đế vương sau đó thì không thêm lại; mốc đã sửa tay thì giữ nguyên.
function upgradeTierLadder(p) {
    if (!p || (Number(p.tierLadderV) || 0) >= TIER_LADDER_V) return;
    const OLD = { 'Hào kiệt': [15, 20], 'Huyền thoại': [35, 36], 'Chí tôn': [45, 41] };
    for (const t of p.joinTiers) {
        const o = OLD[t.name];
        if (o && t.minLevel === o[0]) t.minLevel = o[1];
    }
    if (!p.joinTiers.some(t => t.skin === 'imperial' || t.minLevel >= 50)) {
        p.joinTiers.push(normalizeTier({ name: 'Đế vương', minLevel: 50, minFans: 0, skin: 'imperial', enabled: true }));
    }
    p.tierLadderV = TIER_LADDER_V;
}

function makeDefaultJoinCard() {
    return {
        enabled: true,
        antiDupSec: 10,
        lateWelcome: true,
        mediaMaxWaitSec: 30,
        hideZeroXu: true,
        enterText: 'VÀO PHÒNG',
        diagnostics: false,
        card: { xPercent: 3, yPercent: 60, scale: 100, maxStack: 3, direction: 'up', durationMs: 5000 },
        // Kiểu thẻ: 'bar' = thanh chào gọn sát bình luận (mặc định từ v1.16), 'card' = thẻ to cũ
        style: 'bar',
        // Thanh gọn: yPercent = mép DƯỚI tầng thấp nhất (≈ mép trên khu bình luận TikTok); 3 tầng cố định; WOW = hiệu ứng chữ/viền/avatar lăn
        bar: { xPercent: 2, yPercent: 68, scale: 100, slots: 3, wow: true },
        // Bộ lọc cấp chống spam (áp cho BẬC; người chỉ định theo ID luôn được chào):
        // chào khi LV ≥ minLevel HOẶC FAN ≥ minFans (0 = không xét). Mặc định TẮT để máy cũ không đổi hành vi.
        gate: { enabled: false, minLevel: 20, minFans: 0 },
        // Giai đoạn 3
        batch: { enabled: true, belowTierLevel: 25 },        // phòng đông: gộp người dưới bậc LV này vào thẻ "A, B và N người khác"
        showVisits: true,                                     // chip "Lần đầu ghé" / "Ghé lần thứ N" / "🔥 K buổi liền"
        tts: { enabled: true, volume: 90 },                   // công tắc tổng giọng đọc (từng bậc/luật bật riêng)
        hotkeys: { enabled: false, skip: 'S', clear: 'C' },   // Ctrl+Shift+<phím>, toàn cục (Electron)
        board: { title: 'KHÁCH QUEN CỦA PHÒNG', scope: 'month', skin: 'violet', limit: 10 }
    };
}

function migrateJoinConfig(cfg) {
    if (!cfg) return cfg;
    const def = makeDefaultJoinCard();
    const jc = cfg.joinCard && typeof cfg.joinCard === 'object' ? cfg.joinCard : {};
    const sub = k => ({ ...def[k], ...(jc[k] && typeof jc[k] === 'object' ? jc[k] : {}) });
    cfg.joinCard = { ...def, ...jc, card: sub('card'), bar: sub('bar'), gate: sub('gate'), batch: sub('batch'), tts: sub('tts'), hotkeys: sub('hotkeys'), board: sub('board') };
    const g = cfg.joinCard.gate;
    g.enabled = !!g.enabled;
    g.minLevel = Math.max(0, Math.min(50, Number(g.minLevel) || 0));
    delete g.maxLevel;   // bản thử 15/10 có "đến cấp" — đã bỏ (cấp TikTok tối đa 50)
    g.minFans = Math.max(0, Math.min(99, Number(g.minFans) || 0));
    if (cfg.joinCard.style !== 'card') cfg.joinCard.style = 'bar';
    for (const p of (cfg.profiles || [])) {
        if (!p) continue;
        if (!Array.isArray(p.joinTiers)) {
            p.joinTiers = makeDefaultTiers();
            const g = p.globalJoin;
            if (g && g.enabled && g.mediaUrl) {
                p.joinTiers.push(normalizeTier({
                    name: LEGACY_TIER_NAME, minLevel: g.minLevel, minFans: g.minFansLevel, skin: 'violet',
                    mediaUrl: g.mediaUrl, mediaName: g.mediaName, mediaType: g.mediaType, volume: g.volume
                }));
                g.enabled = false;
            }
        }
        p.joinTiers = p.joinTiers.map(normalizeTier);
        upgradeTierLadder(p);
    }
    return cfg;
}

function cleanUid(s) {
    return String(s || '').replace(/^@/, '').toLowerCase().trim();
}

function tierMatches(t, user) {
    if (!t || t.enabled === false) return false;
    const lv = Number(user.level) || 0, fans = Number(user.fansLevel) || 0;
    const minL = Number(t.minLevel) || 0, minF = Number(t.minFans) || 0;
    if (minL <= 0 && minF <= 0) return true;
    return (minL > 0 && lv >= minL) || (minF > 0 && fans >= minF);
}

// Bộ lọc cấp (joinCard.gate) — true = được chào theo bậc.
function gatePasses(gate, user) {
    if (!gate || !gate.enabled) return true;
    const lv = Number(user && user.level) || 0, fans = Number(user && user.fansLevel) || 0;
    const min = Number(gate.minLevel) || 0, minFans = Number(gate.minFans) || 0;
    return lv >= min || (minFans > 0 && fans >= minFans);
}

function mediaOf(src) {
    if (!src || !src.mediaUrl) return null;
    return { mediaUrl: src.mediaUrl, mediaType: src.mediaType || '', mediaName: src.mediaName || '', volume: src.volume == null ? 100 : src.volume };
}

function matchJoin(cfg, user) {
    if (!cfg || !user) return null;
    const uid = cleanUid(user.uniqueId);
    const userId = String(user.userId || '');
    let bestTier = null, bestTierProfile = null, userHit = null;
    for (const p of (cfg.profiles || [])) {
        if (!p || p.enabled === false) continue;
        if (!userHit) {
            for (const r of (p.userRules || [])) {
                if (!r || r.enabled === false || r.trigger !== 'join') continue;
                const byId = r.userId && userId && String(r.userId) === userId;
                const byUid = uid && cleanUid(r.uniqueId) === uid;
                if (byId || byUid) { userHit = { rule: r, profile: p }; break; }
            }
        }
        for (const t of (p.joinTiers || [])) {
            if (!tierMatches(t, user)) continue;
            if (!bestTier || t.minLevel > bestTier.minLevel || (t.minLevel === bestTier.minLevel && t.minFans > bestTier.minFans)) {
                bestTier = t; bestTierProfile = p;
            }
        }
    }
    if (userHit) {
        const r = userHit.rule;
        return {
            kind: 'user', profileId: userHit.profile.id, userRuleId: r.id, ruleId: 'p:' + userHit.profile.id + ':user:' + r.id,
            title: r.title || bestTier?.name || 'VIP',
            skin: SKINS.includes(r.skin) ? r.skin : (bestTier?.skin || 'violet'),
            frameUrl: r.frameUrl || bestTier?.frameUrl || '',
            media: mediaOf(r),
            cooldownSec: Math.max(0, Number(r.rejoinCooldownSec) || 0),
            priority: USER_RULE_PRIORITY,
            tts: normalizeTts(r.tts, false, TTS_USER_TEMPLATE),
            label: '@' + cleanUid(r.uniqueId)
        };
    }
    if (bestTier && gatePasses(cfg.joinCard && cfg.joinCard.gate, user)) {
        return {
            kind: 'tier', profileId: bestTierProfile.id, ruleId: 'p:' + bestTierProfile.id + ':tier:' + bestTier.id,
            title: bestTier.name, skin: bestTier.skin, frameUrl: bestTier.frameUrl || '',
            media: mediaOf(bestTier),
            cooldownSec: bestTier.rejoinCooldownSec || 0,
            priority: TIER_PRIORITY_BASE + (bestTier.minLevel || 0),
            tts: normalizeTts(bestTier.tts, (bestTier.minLevel || 0) >= TTS_DEFAULT_MIN_LEVEL, TTS_TIER_TEMPLATE),
            label: 'Bậc ' + bestTier.name
        };
    }
    return null;
}

module.exports = { SKINS, makeDefaultTiers, makeDefaultJoinCard, migrateJoinConfig, matchJoin, normalizeTier, gatePasses, upgradeTierLadder, TIER_LADDER_V, TIER_PRIORITY_BASE };
