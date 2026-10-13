'use strict';
/* VIP Welcome — bậc thẻ vào phòng + chọn luật cho 1 lần vào phòng.
 * Thứ tự: luật @id (trigger 'join') > bậc. Bậc khớp khi "LV ≥ minLevel HOẶC FAN ≥ minFans"
 * (0 = không xét; cả hai 0 = mọi người). Nhiều bậc khớp → minLevel cao nhất, hoà thì minFans cao nhất. */

const SKINS = ['violet', 'ice', 'amber', 'flame', 'diamond'];
const USER_RULE_PRIORITY = 1000;
const TIER_PRIORITY_BASE = 100;
const LEGACY_TIER_NAME = 'Tất cả user (cũ)';

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
        rejoinCooldownSec: Math.max(0, Number(t.rejoinCooldownSec) || 0)
    };
}

function makeDefaultTiers() {
    return [
        ['Tân binh', 1, 1, 'ice', false],
        ['Hào kiệt', 15, 5, 'violet', true],
        ['Đại gia', 25, 10, 'amber', true],
        ['Huyền thoại', 35, 15, 'flame', true],
        ['Chí tôn', 45, 20, 'diamond', true]
    ].map(([name, minLevel, minFans, skin, enabled]) => normalizeTier({ name, minLevel, minFans, skin, enabled }));
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
        card: { xPercent: 3, yPercent: 60, scale: 100, maxStack: 3, direction: 'up', durationMs: 5000 }
    };
}

function migrateJoinConfig(cfg) {
    if (!cfg) return cfg;
    const def = makeDefaultJoinCard();
    const jc = cfg.joinCard && typeof cfg.joinCard === 'object' ? cfg.joinCard : {};
    cfg.joinCard = { ...def, ...jc, card: { ...def.card, ...(jc.card || {}) } };
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
            label: '@' + cleanUid(r.uniqueId)
        };
    }
    if (bestTier) {
        return {
            kind: 'tier', profileId: bestTierProfile.id, ruleId: 'p:' + bestTierProfile.id + ':tier:' + bestTier.id,
            title: bestTier.name, skin: bestTier.skin, frameUrl: bestTier.frameUrl || '',
            media: mediaOf(bestTier),
            cooldownSec: bestTier.rejoinCooldownSec || 0,
            priority: TIER_PRIORITY_BASE + (bestTier.minLevel || 0),
            label: 'Bậc ' + bestTier.name
        };
    }
    return null;
}

module.exports = { SKINS, makeDefaultTiers, makeDefaultJoinCard, migrateJoinConfig, matchJoin, normalizeTier };
