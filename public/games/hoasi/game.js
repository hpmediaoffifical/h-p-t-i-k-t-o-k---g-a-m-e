/* Họa Sĩ — engine thuần (không DOM). Dùng chung cho overlay (browser), server (luật quà) và test (node).
 * Đơn vị: px sân khấu 1080×1920, thời gian ms, y tăng xuống dưới.
 * Quà ném cục sơn lên màn (nhắm mặt trước), streamer lau bằng tay (overlay), phủ kín thì tự rửa.
 * Spec: docs/superpowers/specs/2026-10-13-hoasi-design.md — thông số gốc từ HP LIVE Studio painter_game.h. */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else { root.HpGame = root.HpGame || {}; root.HpGame.hoasi = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const COLS = 12, ROWS = 18;     // lưới đích 216 ô như Studio
    const PALETTE = ['#ff3b5c', '#ff8a1f', '#ffd21f', '#7ee03a', '#1fd6a8', '#22c7ff', '#3d7bff', '#8f5cff',
        '#e04bff', '#ff5ca8', '#ff6f4d', '#b8ff3d'];

    const ACTION_TYPES = ['paint', 'storm', 'water', 'shield', 'wash'];
    const ACTION_PRESET = {
        paint:  { icon: '🎨', name: 'Ném sơn' },
        storm:  { icon: '🌧', name: 'Mưa sơn' },
        water:  { icon: '💧', name: 'Xô nước' },
        shield: { icon: '🛡', name: 'Khiên che mặt' },
        wash:   { icon: '🧽', name: 'Rửa sạch' }
    };
    const ACTION_DEFAULT_PARAMS = {
        paint: { count: 5 }, storm: { seconds: 10, percent: 100 }, water: { count: 3 }, shield: { seconds: 10 }, wash: {}
    };
    // Giới hạn tham số theo loại — cũng là danh sách KHOÁ hợp lệ: khoá lạ bị bỏ.
    const ACTION_LIMITS = {
        paint: { count: [1, 100] }, storm: { seconds: [2, 30], percent: [10, 100] }, water: { count: [1, 30] },
        shield: { seconds: [1, 60] }, wash: {}
    };
    const ACTION_ICONS = ['🎨', '🌧', '💧', '🛡', '🧽', '🖌', '🪣', '🌈'];
    const STORM_MAX_SEC = 30, SHIELD_MAX_SEC = 60;

    const NUM_LIMITS = {
        paintSize: [5, 20], waterSize: [5, 25], paintOpacity: [40, 100], flightMs: [200, 1500], shotsPerSecond: [1, 30],
        shieldScale: [50, 200], wipeSpeed: [25, 400], minFingers: [1, 5], maxPerGift: [1, 500], coinsPerShot: [0, 5000]
    };
    const FULL_LIMITS = { percent: [50, 100], holdSec: [0.5, 10], washAfterSec: [1, 30] };

    function num(v, fallback) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
    function clamp(v, min, max) { const n = Number(v); if (!Number.isFinite(n)) return min; return Math.min(max, Math.max(min, n)); }
    function str(v, max) { return String(v == null ? '' : v).slice(0, max); }
    // Có giá trị số hợp lệ → kẹp; rỗng/chữ/null → mặc định (không kẹp về min — bài học Đập Muỗi).
    function pick(v, [min, max], def) { return (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v))) ? clamp(v, min, max) : def; }

    function normalizeAction(raw, index) {
        raw = raw && typeof raw === 'object' ? raw : {};
        const type = ACTION_TYPES.includes(raw.type) ? raw.type : 'paint';
        const saved = raw.params && typeof raw.params === 'object' ? raw.params : {};
        const params = {};
        for (const [k, lim] of Object.entries(ACTION_LIMITS[type])) params[k] = pick(saved[k], lim, ACTION_DEFAULT_PARAMS[type][k]);
        return {
            id: str(raw.id || ('act-' + index + '-' + Date.now()), 60),
            type, icon: str(raw.icon || ACTION_PRESET[type].icon, 8), name: str(raw.name || ACTION_PRESET[type].name, 60),
            enabled: raw.enabled !== false,
            giftId: str(raw.giftId, 40), giftName: str(raw.giftName, 80), giftImage: str(raw.giftImage, 600),
            diamond: clamp(raw.diamond, 0, 1000000), hotkey: str(raw.hotkey, 80), params
        };
    }

    function normalizeRule(raw, index) {
        raw = raw && typeof raw === 'object' ? raw : {};
        return {
            id: str(raw.id || ('rule-' + index + '-' + Date.now()), 60),
            giftId: str(raw.giftId, 40), giftName: str(raw.giftName, 80), giftImage: str(raw.giftImage, 600),
            diamond: clamp(raw.diamond, 0, 1000000), count: Math.floor(clamp(raw.count != null ? raw.count : 1, 1, 1000)),
            enabled: raw.enabled !== false
        };
    }

    function defaultActions() {
        return ACTION_TYPES.map(type => ({
            id: 'act-' + type, type, icon: ACTION_PRESET[type].icon, name: ACTION_PRESET[type].name,
            enabled: true, giftId: '', giftName: '', giftImage: '', diamond: 0, hotkey: '',
            params: { ...ACTION_DEFAULT_PARAMS[type] }
        }));
    }

    function defaultConfig() {
        return {
            enabled: true,
            aimFace: true, paintSize: 10.5, waterSize: 14.5, paintOpacity: 92,   // % W, % W, %
            flightMs: 460, shotsPerSecond: 6, shieldScale: 100,
            wipeSpeed: 100, minFingers: 2, wristFallback: true,
            full: { enabled: true, percent: 95, holdSec: 1.5, autoWash: true, washAfterSec: 4 },
            maxPerGift: 50, coinsPerShot: 1, giftRules: [],
            actions: defaultActions(),
            sound: { enabled: true, volume: 0.5 },
            display: { showHud: true, hudXPercent: 50, hudYPercent: 8, hudScale: 100, showLastThrower: true, showWipe: false },
            quality: 'auto'
        };
    }

    function normalizeConfig(raw) {
        const def = defaultConfig();
        raw = raw && typeof raw === 'object' ? raw : {};
        const cfg = { ...def };
        cfg.enabled = raw.enabled !== false;
        cfg.aimFace = raw.aimFace !== false;
        cfg.wristFallback = raw.wristFallback !== false;
        for (const [k, lim] of Object.entries(NUM_LIMITS)) cfg[k] = pick(raw[k], lim, def[k]);
        cfg.minFingers = Math.round(cfg.minFingers);
        const f = raw.full && typeof raw.full === 'object' ? raw.full : {};
        cfg.full = {
            enabled: f.enabled !== false,
            percent: pick(f.percent, FULL_LIMITS.percent, def.full.percent),
            holdSec: pick(f.holdSec, FULL_LIMITS.holdSec, def.full.holdSec),
            autoWash: f.autoWash !== false,
            washAfterSec: pick(f.washAfterSec, FULL_LIMITS.washAfterSec, def.full.washAfterSec)
        };
        cfg.quality = ['low', 'auto', 'high'].includes(raw.quality) ? raw.quality : 'auto';
        cfg.giftRules = Array.isArray(raw.giftRules) ? raw.giftRules.map(normalizeRule) : [];
        // Thiếu khoá (config cũ/rác) → 5 hành động mặc định; mảng rỗng là người dùng đã xoá hết → giữ rỗng.
        cfg.actions = Array.isArray(raw.actions)
            ? raw.actions.filter(a => a && typeof a === 'object').map((a, i) => normalizeAction(a, i))
            : defaultActions();
        const snd = raw.sound && typeof raw.sound === 'object' ? raw.sound : {};
        cfg.sound = { enabled: snd.enabled !== false, volume: pick(snd.volume, [0, 1], def.sound.volume) };
        const d = raw.display && typeof raw.display === 'object' ? raw.display : {};
        cfg.display = {
            showHud: d.showHud !== false,
            hudXPercent: pick(d.hudXPercent, [0, 100], 50),
            hudYPercent: pick(d.hudYPercent, [0, 100], 8),
            hudScale: pick(d.hudScale, [30, 300], 100),
            showLastThrower: d.showLastThrower !== false,
            showWipe: d.showWipe === true
        };
        return cfg;
    }

    function matches(item, id, name) {
        return (id && String(item.giftId || '') === id) || (name && String(item.giftName || '').toLowerCase() === name);
    }

    // Hành động đang bật khớp quà: ưu tiên id, dự phòng tên không phân biệt hoa thường.
    function actionForGift(cfg, giftId, giftName) {
        if (!cfg || !Array.isArray(cfg.actions)) return null;
        const id = String(giftId == null ? '' : giftId), name = String(giftName || '').toLowerCase();
        return cfg.actions.find(a => a && a.enabled !== false && matches(a, id, name)) || null;
    }

    // Số cục sơn một quà: quà thuộc hành động → 0; rule → count×repeat (rule tắt → 0);
    // không rule → xu/coinsPerShot; trần maxPerGift.
    function shotsForGift(cfg, giftId, giftName, coinValue, repeatCount) {
        if (!cfg) return 0;
        if (actionForGift(cfg, giftId, giftName)) return 0;
        const repeat = Math.max(1, parseInt(repeatCount, 10) || 1);
        const max = Math.max(1, Math.floor(num(cfg.maxPerGift, 50)));
        const id = String(giftId == null ? '' : giftId), name = String(giftName || '').toLowerCase();
        const rule = (Array.isArray(cfg.giftRules) ? cfg.giftRules : []).find(r => r && matches(r, id, name));
        if (rule) {
            if (rule.enabled === false) return 0;
            const c = parseInt(rule.count, 10);
            return c > 0 ? Math.min(max, c * repeat) : 0;
        }
        const perOne = num(cfg.coinsPerShot, 1);
        if (!(perOne > 0)) return 0;
        const coins = Math.max(0, Math.round(num(coinValue, 0))) * repeat;
        return Math.min(max, Math.floor(coins / perOne));
    }

    // Quà → việc overlay phải làm (đã nhân combo + trần). null = quà không làm gì.
    function giftPlan(cfg, gift) {
        if (!cfg || cfg.enabled === false) return null;
        gift = gift || {};
        const repeat = Math.max(1, parseInt(gift.repeatCount, 10) || 1);
        const max = Math.max(1, Math.floor(num(cfg.maxPerGift, 50)));
        const act = actionForGift(cfg, gift.giftId, gift.giftName);
        if (act) {
            const p = act.params || {}, d = ACTION_DEFAULT_PARAMS[act.type];
            let params;
            if (act.type === 'paint' || act.type === 'water') params = { count: Math.min(max, Math.floor(num(p.count, d.count)) * repeat) };
            else if (act.type === 'storm') params = { seconds: Math.min(STORM_MAX_SEC, num(p.seconds, d.seconds) * repeat), percent: num(p.percent, d.percent) };
            else if (act.type === 'shield') params = { seconds: Math.min(SHIELD_MAX_SEC, num(p.seconds, d.seconds) * repeat) };
            else params = {};
            return { action: act.type, params, name: act.name, icon: act.icon };
        }
        const n = shotsForGift(cfg, gift.giftId, gift.giftName, gift.coinValue, repeat);
        return n > 0 ? { action: 'paint', params: { count: n }, name: ACTION_PRESET.paint.name, icon: ACTION_PRESET.paint.icon } : null;
    }

    return {
        COLS, ROWS, PALETTE, ACTION_TYPES, ACTION_PRESET, ACTION_DEFAULT_PARAMS, ACTION_LIMITS, ACTION_ICONS,
        defaultConfig, normalizeConfig, normalizeAction, actionForGift, shotsForGift, giftPlan
    };
});
