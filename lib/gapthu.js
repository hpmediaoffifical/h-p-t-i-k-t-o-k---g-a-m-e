'use strict';
/**
 * 🕹️ Gắp Thú — luật THUẦN (spec docs/superpowers/specs/2026-11-12-gapthu-xucxac-design.md §3.1).
 * Server gọi rollGrab() mỗi lượt rồi phát kết quả; overlay chỉ diễn theo kết quả nhận được.
 */

const THEMES = ['pink', 'mint', 'night'];
const MAX_PRIZES = 12;

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

function defaultPrizes() {
    return [
        { id: 'p1', name: 'Gấu bông', icon: '🧸', weight: 3 },
        { id: 'p2', name: 'Hát 1 câu', icon: '🎤', weight: 2 },
        { id: 'p3', name: 'Hít đất 10 cái', icon: '💪', weight: 2 },
        { id: 'p4', name: 'Nhảy 15 giây', icon: '💃', weight: 2 },
        { id: 'p5', name: 'Gọi tên cảm ơn', icon: '📢', weight: 3 },
        { id: 'p6', name: 'Chúc may mắn', icon: '🍀', weight: 3 }
    ];
}

function defaultConfig() {
    return {
        enabled: true,
        winRate: 35,        // % gắp trúng mỗi lượt
        pity: 5,            // trượt liên tiếp đủ số này → lượt sau chắc trúng (0 = tắt)
        turnSec: 4,         // 3–5 giây / lượt (hàng chờ dài tự nhanh hơn)
        anyGift: true,      // quà không gán = 1 lượt
        gifts: [],          // [{ giftId, giftName, giftImage, turns, sure }]
        prizes: defaultPrizes(),
        sound: { enabled: true, volume: 0.6 },
        display: { x: 50, y: 55, scale: 100, theme: 'pink', showQueue: true }
    };
}

function normalizeConfig(c) {
    const d = defaultConfig();
    if (!c || typeof c !== 'object') return d;
    const out = { ...d, ...c };
    out.enabled = c.enabled !== false;
    out.anyGift = c.anyGift !== false;
    out.winRate = clamp(Math.round(num(c.winRate, d.winRate)), 0, 100);
    out.pity = clamp(Math.round(num(c.pity, d.pity)), 0, 50);
    out.turnSec = clamp(num(c.turnSec, d.turnSec), 3, 5);
    let seq = 0;
    out.prizes = (Array.isArray(c.prizes) ? c.prizes : d.prizes)
        .filter(p => p && str(p.name, 40))
        .slice(0, MAX_PRIZES)
        .map(p => ({
            id: str(p.id, 24) || ('p' + Date.now().toString(36) + (seq++)),
            name: str(p.name, 40),
            icon: str(p.icon, 8) || '🎁',
            weight: clamp(num(p.weight, 1), 0, 1000)
        }));
    out.gifts = (Array.isArray(c.gifts) ? c.gifts : [])
        .filter(g => g && str(g.giftId, 40))
        .map(g => ({
            giftId: str(g.giftId, 40),
            giftName: str(g.giftName, 60),
            giftImage: str(g.giftImage, 500),
            turns: clamp(Math.round(num(g.turns, 1)), 1, 10),
            sure: !!g.sure
        }));
    const s = c.sound && typeof c.sound === 'object' ? c.sound : {};
    out.sound = { enabled: s.enabled !== false, volume: clamp(num(s.volume, d.sound.volume), 0, 1) };
    const disp = c.display && typeof c.display === 'object' ? c.display : {};
    out.display = {
        x: clamp(num(disp.x, d.display.x), 0, 100),
        y: clamp(num(disp.y, d.display.y), 0, 100),
        scale: clamp(num(disp.scale, d.display.scale), 30, 200),
        theme: THEMES.includes(disp.theme) ? disp.theme : d.display.theme,
        showQueue: disp.showQueue !== false
    };
    return out;
}

/** Chọn 1 giải theo trọng số (weight 0 bị bỏ). Không còn giải → null. */
function pickPrize(prizes, rng) {
    const list = (prizes || []).filter(p => p && num(p.weight, 0) > 0);
    const total = list.reduce((s, p) => s + num(p.weight, 0), 0);
    if (!total) return null;
    let r = clamp(Number(rng()) || 0, 0, 0.999999) * total;
    for (const p of list) { r -= num(p.weight, 0); if (r < 0) return p; }
    return list[list.length - 1];
}

/** % thực của từng giải (khi đã trúng), làm tròn 1 số lẻ. */
function prizeOdds(prizes) {
    const ws = (prizes || []).map(p => Math.max(0, num(p?.weight, 0)));
    const total = ws.reduce((a, b) => a + b, 0);
    return ws.map(w => total ? Math.round(w / total * 1000) / 10 : 0);
}

/**
 * 1 lượt gắp. state = { sure, misses }. rng gọi theo thứ tự: vị trí càng, cú quyết, (trúng) chọn giải | (trượt) chỗ tuột.
 * → { win, prize, clawX, slipAt, pityHit }
 */
function rollGrab(cfg, state, rng) {
    const c = cfg || defaultConfig();
    const st = state || {};
    const clawX = 0.12 + clamp(Number(rng()) || 0, 0, 1) * 0.76;
    const rateWin = Number(rng()) < c.winRate / 100;
    const pityReady = c.pity > 0 && num(st.misses, 0) >= c.pity;
    let win = !!st.sure || rateWin || pityReady;
    const pityHit = win && !st.sure && !rateWin;
    let prize = null, slipAt = 0;
    if (win) {
        const p = pickPrize(c.prizes, rng);
        if (p) prize = { id: p.id, name: p.name, icon: p.icon };
        else win = false;
    }
    if (!win) slipAt = 0.25 + clamp(Number(rng()) || 0, 0, 1) * 0.5;
    return { win, prize, clawX: Math.round(clawX * 1000) / 1000, slipAt: Math.round(slipAt * 1000) / 1000, pityHit: win && pityHit };
}

function nextMisses(misses, result) { return result && result.win ? 0 : Math.max(0, num(misses, 0)) + 1; }

module.exports = { THEMES, defaultConfig, defaultPrizes, normalizeConfig, pickPrize, prizeOdds, rollGrab, nextMisses };
