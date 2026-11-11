'use strict';
/* VIP Welcome — Sổ Fan: chia bậc người xem theo lịch sử với TỪNG KÊNH (sổ xu + sổ ghé phòng).
 * Thuần, không đọc đĩa. 5 bậc cố định thứ tự ưu tiên; người dùng chỉ sửa mốc / chữ / bật tắt / câu đọc.
 * Spec docs/superpowers/specs/2026-11-12-so-fan-design.md. */

const DAY_MS = 86400000;

const DEFAULTS = [
    { id: 'sop', label: 'Khách sộp', icon: '💎', minXu: 1000, forceGreet: true,
        tts: { enabled: true, template: 'Khách sộp {tên} đã tới, cả phòng chào nào!' } },
    { id: 'lau', label: 'Lâu rồi mới gặp', icon: '👋', minAwayDays: 14, minPastSessions: 2, forceGreet: true,
        tts: { enabled: true, template: 'Lâu quá không gặp {tên}, {ngày} ngày rồi đó!' } },
    { id: 'fan', label: 'Fan cứng', icon: '💜', minFans: 10, forceGreet: true,
        tts: { enabled: false, template: 'Fan cứng {tên} đã vào phòng!' } },
    { id: 'quen', label: 'Khách quen', icon: '⭐', minSessions: 5, forceGreet: false,
        tts: { enabled: false, template: '{tên} ghé lần thứ {lần} rồi nè!' } },
    { id: 'moi', label: 'Khách mới', icon: '🌱', forceGreet: false,
        tts: { enabled: false, template: 'Chào bạn mới {tên}!' } }
];
const FAN_TIER_IDS = DEFAULTS.map(t => t.id);
const NUM_KEYS = ['minXu', 'minAwayDays', 'minPastSessions', 'minFans', 'minSessions'];

const nonNeg = (v, def) => {
    const n = Number(v);
    return v == null || v === '' || !Number.isFinite(n) ? def : Math.max(0, Math.floor(n));
};
const str = (v, def, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : def);

function normalizeFanTiers(list) {
    const byId = Object.create(null);
    for (const t of (Array.isArray(list) ? list : [])) if (t && FAN_TIER_IDS.includes(t.id)) byId[t.id] = t;
    return DEFAULTS.map(d => {
        const s = byId[d.id] || {};
        const out = {
            id: d.id,
            enabled: s.enabled !== false,
            label: str(s.label, d.label, 24),
            icon: typeof s.icon === 'string' ? s.icon.trim().slice(0, 8) : d.icon,
            forceGreet: s.forceGreet == null ? d.forceGreet : !!s.forceGreet,
            tts: {
                enabled: s.tts && s.tts.enabled != null ? !!s.tts.enabled : d.tts.enabled,
                template: str(s.tts && s.tts.template, d.tts.template, 120)
            }
        };
        for (const k of NUM_KEYS) if (k in d) out[k] = nonNeg(s[k], d[k]);
        return out;
    });
}

function awayDays(prevAt, now) {
    const p = Number(prevAt) || 0;
    return p > 0 ? Math.max(0, Math.floor(((Number(now) || Date.now()) - p) / DAY_MS)) : 0;
}

function hits(t, s) {
    switch (t.id) {
        case 'sop': return (Number(s.xu) || 0) >= Math.max(1, t.minXu);
        case 'lau': return (Number(s.prevAt) || 0) > 0
            && (Number(s.visitNo) || 0) - 1 >= t.minPastSessions
            && awayDays(s.prevAt, s.now) >= t.minAwayDays;
        case 'fan': return (Number(s.fansLevel) || 0) >= Math.max(1, t.minFans);
        case 'quen': return (Number(s.visitNo) || 0) >= Math.max(1, t.minSessions);
        case 'moi': return !!s.isFirst;
        default: return false;
    }
}

/** stats = { visitNo, isFirst, prevAt, xu, fansLevel, now, noVisit } → bậc (đã normalize) hoặc null. */
function classifyFan(stats, tiers, opts) {
    if (!stats || stats.noVisit || (opts && opts.enabled === false)) return null;
    for (const t of (tiers || normalizeFanTiers())) if (t.enabled && hits(t, stats)) return t;
    return null;
}

/** Bậc fan có forceGreet → match chào khi không bậc cấp / luật ID nào khớp. */
function fanMatch(tier, basePriority) {
    if (!tier || !tier.forceGreet) return null;
    return {
        kind: 'fan', ruleId: 'fan:' + tier.id, title: tier.label, skin: 'violet', frameUrl: '',
        media: null, cooldownSec: 0, priority: (Number(basePriority) || 0) + 25,
        tts: { enabled: false, template: '' }, label: 'Sổ Fan · ' + tier.label
    };
}

function fanBadge(tier) {
    return tier ? { id: tier.id, icon: tier.icon || '', label: tier.label } : null;
}

function fanTts(tier) {
    return tier && tier.tts && tier.tts.enabled && tier.tts.template ? { enabled: true, template: tier.tts.template } : null;
}

function fold(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

/** Gộp sổ ghé (visits.list) + sổ xu (ledger.list) theo key. Bậc tính như lúc người đó vào buổi kế tiếp. */
function buildFanBook({ visits = [], ledger = [] } = {}, tiers, now, { q = '', sort = 'xu', limit = 200 } = {}) {
    const rows = new Map();
    const row = key => {
        if (!rows.has(key)) rows.set(key, { key, uniqueId: '', nickname: '', avatar: '', xu: 0, sessions: 0, lastAt: 0, fansLevel: 0, streak: 0 });
        return rows.get(key);
    };
    for (const v of visits) {
        if (!v || !v.key) continue;
        Object.assign(row(v.key), {
            uniqueId: v.uniqueId || '', nickname: v.nickname || '', avatar: v.avatar || '',
            sessions: v.sessions || 0, lastAt: v.lastAt || 0, fansLevel: v.fansLevel || 0, streak: v.streak || 0
        });
    }
    for (const l of ledger) {
        if (!l || !l.key) continue;
        const r = row(l.key);
        r.xu = l.xu || 0;
        if (!r.uniqueId) r.uniqueId = l.uniqueId || '';
        if (!r.nickname) r.nickname = l.nickname || '';
        if (!r.lastAt) r.lastAt = l.lastAt || 0;
    }
    const needle = fold(q).trim();
    const cmp = {
        xu: (a, b) => (b.xu - a.xu) || (b.sessions - a.sessions),
        sessions: (a, b) => (b.sessions - a.sessions) || (b.xu - a.xu),
        recent: (a, b) => (b.lastAt - a.lastAt)
    }[sort] || ((a, b) => (b.xu - a.xu) || (b.sessions - a.sessions));
    return [...rows.values()]
        .filter(r => !needle || fold(r.uniqueId).includes(needle) || fold(r.nickname).includes(needle))
        .map(r => {
            const visitNo = r.sessions + 1;
            const t = classifyFan({ visitNo, isFirst: visitNo === 1, prevAt: r.sessions > 0 ? r.lastAt : 0, xu: r.xu, fansLevel: r.fansLevel, now }, tiers);
            return { ...r, tier: fanBadge(t) };
        })
        .sort(cmp)
        .slice(0, Math.max(1, Number(limit) || 200));
}

module.exports = { FAN_TIER_IDS, normalizeFanTiers, classifyFan, fanMatch, fanBadge, fanTts, awayDays, buildFanBook };
