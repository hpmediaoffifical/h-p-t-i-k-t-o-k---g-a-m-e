// lib/camgames-session.js — luật thuần của 🎮 PHIÊN GAME THEO QUÀ (🎥 Game Camera). Port từ HP LIVE NPC
// (lib/camgames-session.cjs), bỏ phần Danh sách hiệu ứng / quà thường giữ lại của NPC.
//
// Người xem tặng QUÀ KÍCH HOẠT → game gắn với quà đó chơi ĐỘC QUYỀN N giây trong overlay mẹ: chỉ game đó bật + nhận
// quà, các game camera khác tạm ẩn; hết giờ trả lại như trước. File này chỉ chứa luật (không I/O) để server và test
// dùng chung. Trạng thái phiên ở server.js (khối PHIÊN GAME THEO QUÀ).
'use strict';

// Game chơi được theo phiên (Level Quest không có quà riêng — thanh KPI chạy theo LEVEL QUEST của app).
const TRIGGER_GAMES = ['touchplay', 'chemtraicay', 'dapmuoi', 'bancung', 'dacau'];
const DEFAULT_SECONDS = 300;      // thời lượng mặc định 1 phiên (luật mới / thiếu số)
// Quà kích hoạt GAME KHÁC tới lúc đang có phiên: 'next' ⏭ chơi ngay sau phiên đang chạy (đầu hàng chờ, mặc định) ·
// 'queue' 📋 cuối hàng chờ · 'cut' ✂ dừng phiên đang chạy, mở game mới ngay.
const TRIGGER_QUEUE_MODES = ['next', 'queue', 'cut'];
const DEFAULT_TRIGGER = Object.freeze({ enabled: false, rules: [], maxSec: 300, introSec: 3 });
const QUEUE_MAX = 20;             // hàng chờ phiên tối đa (quà dồn quá thì cộng giây vào phiên cùng game đang chờ)

const clampInt = (v, lo, hi, def) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
};
const str = (v, max = 200) => (v == null ? '' : String(v)).slice(0, max);
const gidOf = g => String(g?.giftId ?? '');
const lname = g => String(g?.giftName || '').trim().toLowerCase();

function normalizeRule(r, i) {
    r = r && typeof r === 'object' ? r : {};
    return {
        id: str(r.id, 40) || ('cgt-' + i),
        enabled: r.enabled !== false,
        giftId: str(r.giftId, 40),
        giftName: str(r.giftName, 80),
        giftImage: str(r.giftImage, 1000),
        gameId: TRIGGER_GAMES.includes(r.gameId) ? r.gameId : TRIGGER_GAMES[0],
        seconds: clampInt(r.seconds, 5, 600, DEFAULT_SECONDS),
        queueMode: TRIGGER_QUEUE_MODES.includes(r.queueMode) ? r.queueMode : 'next'
    };
}

function normalizeTrigger(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const rules = (Array.isArray(src.rules) ? src.rules : []).slice(0, 30).map(normalizeRule)
        .filter(r => r.giftId || r.giftName);
    return {
        enabled: src.enabled === true,
        rules,
        maxSec: clampInt(src.maxSec, 10, 1800, DEFAULT_TRIGGER.maxSec),
        introSec: clampInt(src.introSec, 0, 10, DEFAULT_TRIGGER.introSec)
    };
}

// Luật kích hoạt khớp quà (ưu tiên id; luật chưa có id mới so tên). Tắt tính năng → null.
function matchTrigger(trigger, gift) {
    const t = trigger && trigger.enabled ? trigger : null;
    if (!t) return null;
    const id = gidOf(gift), name = lname(gift);
    return t.rules.find(r => r.enabled && r.giftId && r.giftId === id)
        || t.rules.find(r => r.enabled && !r.giftId && r.giftName && r.giftName.trim().toLowerCase() === name)
        || null;
}

// Mức quà mặc định của Touch & Play (touchplay.html DEFAULT_CFG.tiers) — dùng khi panel chưa đẩy tpCfg.
const TOUCHPLAY_TIERS = [
    { min: 1, action: 'ball', count: 1 }, { min: 5, action: 'food', count: 1 }, { min: 10, action: 'pose', count: 1 },
    { min: 30, action: 'rain', count: 1 }, { min: 99, action: 'freeze', count: 1 }, { min: 199, action: 'shield', count: 3 },
    { min: 299, action: 'rescue', count: 1 }
];
const TOUCHPLAY_ACTIONS = {
    ball: ['🔵', 'Bóng chạm'], food: ['🍔', 'Đồ ăn'], pose: ['🧍', 'Tư thế'], rain: ['🌧', 'Mưa bóng'], freeze: ['❄', 'Đóng băng'],
    slow: ['🐢', 'Chậm'], fast: ['⚡', 'Nhanh'], shield: ['🛡', 'Khiên'], fever: ['🔥', 'Điểm ×2'], rescue: ['🧹', 'Giải cứu']
};
const CHEM_LABELS = {
    apple: '🍎 Táo', orange: '🍊 Cam', lemon: '🍋 Chanh', pear: '🍐 Lê', peach: '🍑 Đào', strawberry: '🍓 Dâu',
    plum: '🟣 Mận', watermelon: '🍉 Dưa hấu', pineapple: '🍍 Dứa', kiwi: '🥝 Kiwi', bomb: '💣 Bom',
    god: '👑 Thần Chém', fast: '⚡ Tăng tốc', slow: '🐢 Giảm tốc', rescue: '🧹 Giải cứu'
};
// Quà chỉ định từng hành động của Touch & Play (tpCfg.gifts; chưa có = bộ quà mẫu) — một nguồn ở lib/camgames.js.
const { touchplayGifts } = require('./camgames');

// Danh sách quà hiện trên overlay trong lúc chơi: [{ giftId, name, image, diamonds, emoji, label }]. Ảnh thiếu thì tra catalog.
function gameGiftList(gameId, cfg, catalog = [], limit = 10) {
    cfg = cfg || {};
    const cat = new Map((Array.isArray(catalog) ? catalog : []).map(g => [String(g.id), g]));
    const out = [];
    const seen = new Set();
    const push = (item, label) => {
        const id = gidOf(item);
        const key = id ? 'id:' + id : 'n:' + lname(item);
        if ((!id && !lname(item)) || seen.has(key)) return;
        seen.add(key);
        const c = id ? cat.get(id) : null;
        out.push({ giftId: id, name: str(item.giftName || c?.name || ('Quà #' + id), 60), image: str(item.giftImage || c?.image || '', 1000),
            diamonds: Number(c?.diamonds) || Number(item.diamond) || 0, emoji: '', label: str(label, 40) });
    };
    const extra = (emoji, name, label, image = '') => out.push({ giftId: '', name, image, diamonds: 0, emoji, label });
    const COIN_IMG = '/coin.svg';
    if (gameId === 'chemtraicay') {
        for (const r of cfg.giftRules || []) if (r && r.enabled !== false && r.action) push(r, (CHEM_LABELS[r.action] || r.action) + (Number(r.count) > 1 ? ' ×' + r.count : ''));
    } else if (gameId === 'dapmuoi') {
        for (const a of cfg.actions || []) if (a && a.enabled !== false) push(a, `${a.icon || ''} ${a.name || a.type || ''}`.trim());
        for (const r of cfg.giftRules || []) if (r && r.enabled !== false && parseInt(r.count, 10) > 0) push(r, '🦟 ×' + parseInt(r.count, 10));
        const per = Number(cfg.coinsPerMosquito ?? 1);
        if (per > 0) extra('', 'Quà khác', `${per} xu = 1 🦟`, COIN_IMG);
    } else if (gameId === 'bancung') {
        for (const g of cfg.shotGifts || []) push(g, '🏹 ×' + Math.max(1, parseInt(g.shots, 10) || 1));
        for (const g of cfg.healGifts || []) push(g, '❤ +' + (Number(g.healHearts) || 1));
        for (const g of cfg.reviveGifts || []) push(g, '✨ Hồi sinh');
        for (const g of cfg.shieldGifts || []) push(g, '🛡 ' + (Number(g.durationSec) || 5) + 's');
        if (cfg.freeFireEnabled === true) extra('', 'Quà khác', 'Bắn theo xu', COIN_IMG);
    } else if (gameId === 'dacau') {
        const BALL = { normal: '🏸 Tung cầu', gold: '🟡 Cầu vàng', big: '🎈 Cầu to', fire: '🔥 Cầu lửa' };
        for (const g of cfg.gifts || []) push(g, BALL[g.ball] || BALL.normal);
    } else if (gameId === 'touchplay') {
        for (const g of touchplayGifts(cfg.tpCfg)) {
            const a = TOUCHPLAY_ACTIONS[g.action];
            if (a && (gidOf(g) || lname(g))) push(g, a[0] + ' ' + a[1] + (Number(g.count) > 1 ? ' ×' + g.count : ''));
        }
        const tiers = Array.isArray(cfg.tpCfg?.tiers) ? cfg.tpCfg.tiers : TOUCHPLAY_TIERS;   // [] = streamer bỏ hết mốc
        for (const t of tiers.slice().sort((a, b) => a.min - b.min)) {
            const a = TOUCHPLAY_ACTIONS[t.action];
            if (a) extra(a[0], `≥ ${t.min} xu`, a[1] + (Number(t.count) > 1 ? ' ×' + t.count : ''));
        }
    }
    return out.slice(0, limit);
}

// Trần AN TOÀN của một phiên (giây còn lại). Combo / quà cộng dồn chạy ĐỦ; trần chỉ chặn số vô lý (combo ×1000).
const SESSION_HARD_MAX_SEC = 6 * 3600;
// Gia hạn phiên: cộng ĐỦ `addMs` (thời gian còn lại ≤ SESSION_HARD_MAX_SEC). Trả mốc hết giờ mới.
function extendUntil(until, addMs, now) {
    const cap = now + SESSION_HARD_MAX_SEC * 1000;
    return Math.max(until, Math.min(until + Math.max(0, addMs), cap));
}
// Combo ×N quà kích hoạt = N lượt → N × giây của luật (emitGift nhận repeatCount = tổng combo sau repeatEnd).
function comboQty(gift) {
    const n = Math.floor(Number(gift?.quantity ?? gift?.repeatCount) || 1);
    return Math.max(1, n);
}
function comboSeconds(rule, gift) {
    const base = Math.max(0, Number(rule?.seconds) || 0);
    return Math.min(Math.max(base, SESSION_HARD_MAX_SEC), base * comboQty(gift));
}

// Đưa phiên vào hàng chờ: cùng game đã chờ thì CỘNG GIÂY vào hàng đó; 'next' chen đầu, 'queue' xếp cuối.
// Trả hàng chờ mới (không sửa mảng cũ).
function enqueue(queue, item, mode) {
    const q = (Array.isArray(queue) ? queue : []).map(x => ({ ...x }));
    const same = q.find(x => x.gameId === item.gameId);
    if (same) { same.seconds = Math.min(SESSION_HARD_MAX_SEC, (Number(same.seconds) || 0) + (Number(item.seconds) || 0)); return q; }
    if (q.length >= QUEUE_MAX) return q;
    if (mode === 'next') q.unshift(item); else q.push(item);
    return q;
}

module.exports = { TRIGGER_GAMES, TRIGGER_QUEUE_MODES, DEFAULT_TRIGGER, SESSION_HARD_MAX_SEC, TOUCHPLAY_TIERS, QUEUE_MAX,
    normalizeTrigger, matchTrigger, gameGiftList, extendUntil, comboQty, comboSeconds, enqueue, touchplayGifts };
