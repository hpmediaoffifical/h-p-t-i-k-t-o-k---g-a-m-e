// lib/camgames.js — luật thuần của 🎥 Game Camera khi chơi NHIỀU game cùng lúc.
//
// Khe (slot): game dùng TAY (Touch & Play, Chém Trái Cây, Đập Muỗi) chiếm khe 'hands'; game bám
// ĐẦU/NGƯỜI (Bắn Cung: hàng tim trên đỉnh đầu, Level Quest: thanh level trên đầu) chiếm khe 'head'.
// Mỗi khe tối đa 1 game → cử chỉ không đá nhau (vỗ tay không chém quả) và đồ trên đầu không chồng.
// Đồng bộ với `slot` trong public/games/camgames/registry.js.
//
// Quà: "quà riêng trước, quà chung sau" — game gán ĐÍCH DANH một quà thì chỉ game đó nhận; nhánh
// bắt-mọi-quà của game khác (Đập Muỗi xu/con, Bắn Cung bắn tự do, Touch & Play theo mức xu) bỏ qua.
'use strict';

const SLOTS = { touchplay: 'hands', chemtraicay: 'hands', dapmuoi: 'hands', bancung: 'head', 'level-quest': 'head' };
const slotOf = id => SLOTS[id] || id;          // game chưa khai khe: khe riêng (không đụng ai)

// Danh sách game đang chơi: bỏ id lạ/trùng, mỗi khe giữ game đứng SAU (bấm sau cùng), rỗng → game đầu.
function normalizeActives(list, ids) {
    const arr = Array.isArray(list) ? list : (list ? [list] : []);
    let out = [];
    for (const raw of arr) {
        const id = String(raw);
        if (!ids.includes(id)) continue;
        out = out.filter(x => x !== id && slotOf(x) !== slotOf(id));
        out.push(id);
    }
    return out.length ? out : [ids[0]];
}

// Config cũ chỉ có `active` (một game) → [active].
function activesOf(cam, ids) {
    cam = cam || {};
    return normalizeActives(Array.isArray(cam.actives) && cam.actives.length ? cam.actives : [cam.active], ids);
}

// Gộp patch POST vào danh sách: {active:X} = chơi riêng X; {actives:[…]} = danh sách mới; khác = giữ.
// Trả { active, actives } (active luôn = actives[0] cho code/bản cũ chỉ đọc một game).
function applyPatch(prev, patch, ids) {
    patch = patch || {};
    let actives;
    if (Array.isArray(patch.actives)) actives = normalizeActives(patch.actives, ids);
    else if (typeof patch.active === 'string') actives = normalizeActives([patch.active], ids);
    else actives = activesOf(prev, ids);
    return { active: actives[0], actives };
}

const withGame = (actives, id, ids) => normalizeActives([...(actives || []), id], ids);
const withoutGame = (actives, id, ids) => {
    const rest = (actives || []).filter(x => x !== id);
    return rest.length ? normalizeActives(rest, ids) : normalizeActives(actives, ids);
};

// ---------- quà ----------
const gidOf = g => String(g?.giftId ?? '');
const nameOf = g => String(g?.giftName || '').toLowerCase();
const sameGift = (item, gift) => {
    const id = gidOf(item), name = nameOf(item);
    return (!!id && id === gidOf(gift)) || (!!name && name === nameOf(gift));
};

// Các mục quà game gán ĐÍCH DANH (đang bật) — mỗi mục { giftId, giftName }.
function explicitGifts(id, cfg) {
    cfg = cfg || {};
    const list = a => (Array.isArray(a) ? a : []).filter(x => x && (gidOf(x) || nameOf(x)));
    if (id === 'bancung') return [...list(cfg.shieldGifts), ...list(cfg.reviveGifts), ...list(cfg.healGifts), ...list(cfg.shotGifts)];
    if (id === 'chemtraicay') return list(cfg.giftRules).filter(r => r.enabled !== false && r.action);
    if (id === 'dapmuoi') return [
        ...list(cfg.actions).filter(a => a.enabled !== false),
        ...list(cfg.giftRules).filter(r => r.enabled !== false && parseInt(r.count, 10) > 0)
    ];
    return [];
}

// Game đang chơi nào gán đích danh quà này (giữ thứ tự `actives`).
function giftClaims(gift, cfgs, actives) {
    return (actives || []).filter(id => explicitGifts(id, cfgs?.[id]).some(x => sameGift(x, gift)));
}

// Nhánh bắt-mọi-quà của `id` có phải nhường không: đang chơi ≥2 game và có game KHÁC gán đích danh.
function claimedElsewhere(id, claims, activeCount) {
    return activeCount >= 2 && Array.isArray(claims) && claims.length > 0 && !claims.includes(id);
}

// Quà cùng gán đích danh ở ≥2 game đang chơi → 1 quà kích cả hai (panel cảnh báo).
function overlapGifts(cfgs, actives) {
    const map = new Map();
    for (const id of actives || []) {
        for (const g of explicitGifts(id, cfgs?.[id])) {
            const key = gidOf(g) ? 'id:' + gidOf(g) : 'name:' + nameOf(g);
            const e = map.get(key) || { giftId: gidOf(g), giftName: g.giftName || '', games: [] };
            if (!e.giftName && g.giftName) e.giftName = g.giftName;
            if (!e.games.includes(id)) e.games.push(id);
            map.set(key, e);
        }
    }
    return [...map.values()].filter(e => e.games.length >= 2);
}

module.exports = { SLOTS, slotOf, normalizeActives, activesOf, applyPatch, withGame, withoutGame,
    explicitGifts, giftClaims, claimedElsewhere, overlapGifts };
