'use strict';
/**
 * 🎲 Xúc Xắc 3D — luật THUẦN (spec docs/superpowers/specs/2026-11-12-gapthu-xucxac-design.md §4.1).
 * Server tung (rollTurn) rồi phát số; overlay 3D chỉ xoay xúc xắc dừng đúng mặt đã nhận.
 */

const COLORS = ['white', 'red', 'black', 'gold'];
const MAX_ROWS = 12;

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

/** Bảng kết quả mặc định theo số viên — phủ kín mọi tổng [n, 6n]. */
function defaultOutcomes(n) {
    n = clamp(Math.round(num(n, 1)), 1, 3);
    if (n === 1) return [
        { from: 1, to: 1, text: 'Hít đất 10 cái' },
        { from: 2, to: 2, text: 'Hát 1 câu' },
        { from: 3, to: 3, text: 'Uống 1 ngụm nước' },
        { from: 4, to: 4, text: 'Nhảy 10 giây' },
        { from: 5, to: 5, text: 'Cảm ơn tên người tặng' },
        { from: 6, to: 6, text: '🎉 Làm theo yêu cầu người tặng' }
    ];
    if (n === 2) return [
        { from: 2, to: 4, text: 'Hít đất 10 cái' },
        { from: 5, to: 6, text: 'Hát 1 câu' },
        { from: 7, to: 7, text: '🍀 Số 7 may mắn - cảm ơn to' },
        { from: 8, to: 9, text: 'Nhảy 15 giây' },
        { from: 10, to: 12, text: '🎉 Làm theo yêu cầu người tặng' }
    ];
    return [
        { from: 3, to: 7, text: 'Hít đất 10 cái' },
        { from: 8, to: 10, text: 'Hát 1 câu' },
        { from: 11, to: 11, text: 'Nhảy 15 giây' },
        { from: 12, to: 14, text: 'Cảm ơn tên người tặng' },
        { from: 15, to: 18, text: '🎉 Làm theo yêu cầu người tặng' }
    ];
}

function defaultConfig() {
    return {
        enabled: true,
        dice: 1,
        turnSec: 4,
        anyGift: true,
        gifts: [],          // [{ giftId, giftName, giftImage, turns }]
        outcomes: defaultOutcomes(1),
        sound: { enabled: true, volume: 0.6 },
        display: { x: 50, y: 55, scale: 100, color: 'white', showQueue: true }
    };
}

function normalizeConfig(c) {
    const d = defaultConfig();
    if (!c || typeof c !== 'object') return d;
    const out = { ...d, ...c };
    out.enabled = c.enabled !== false;
    out.anyGift = c.anyGift !== false;
    out.dice = clamp(Math.round(num(c.dice, d.dice)), 1, 3);
    out.turnSec = clamp(num(c.turnSec, d.turnSec), 3, 5);
    out.outcomes = (Array.isArray(c.outcomes) ? c.outcomes : defaultOutcomes(out.dice))
        .map(o => ({ from: Math.round(num(o?.from, NaN)), to: Math.round(num(o?.to, NaN)), text: str(o?.text, 60) }))
        .filter(o => Number.isFinite(o.from) && Number.isFinite(o.to) && o.from <= o.to && o.text)
        .slice(0, MAX_ROWS);
    out.gifts = (Array.isArray(c.gifts) ? c.gifts : [])
        .filter(g => g && str(g.giftId, 40))
        .map(g => ({
            giftId: str(g.giftId, 40),
            giftName: str(g.giftName, 60),
            giftImage: str(g.giftImage, 500),
            turns: clamp(Math.round(num(g.turns, 1)), 1, 10)
        }));
    const s = c.sound && typeof c.sound === 'object' ? c.sound : {};
    out.sound = { enabled: s.enabled !== false, volume: clamp(num(s.volume, d.sound.volume), 0, 1) };
    const disp = c.display && typeof c.display === 'object' ? c.display : {};
    out.display = {
        x: clamp(num(disp.x, d.display.x), 0, 100),
        y: clamp(num(disp.y, d.display.y), 0, 100),
        scale: clamp(num(disp.scale, d.display.scale), 30, 200),
        color: COLORS.includes(disp.color) ? disp.color : d.display.color,
        showQueue: disp.showQueue !== false
    };
    return out;
}

function rollDice(n, rng) {
    n = clamp(Math.round(num(n, 1)), 1, 3);
    const out = [];
    for (let i = 0; i < n; i++) out.push(1 + Math.min(5, Math.floor(clamp(Number(rng()) || 0, 0, 0.999999) * 6)));
    return out;
}

function outcomeFor(cfg, total) {
    const row = (cfg && Array.isArray(cfg.outcomes) ? cfg.outcomes : []).find(o => total >= o.from && total <= o.to);
    return row ? row.text : '';
}

/** 1 lượt tung → { values, total, text }. */
function rollTurn(cfg, rng) {
    const values = rollDice(cfg?.dice, rng);
    const total = values.reduce((a, b) => a + b, 0);
    return { values, total, text: outcomeFor(cfg, total) };
}

module.exports = { COLORS, defaultConfig, defaultOutcomes, normalizeConfig, rollDice, outcomeFor, rollTurn };
