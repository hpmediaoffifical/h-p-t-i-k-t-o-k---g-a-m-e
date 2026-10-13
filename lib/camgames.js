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
// Config mặc định — KHÔNG có `actives`: server gộp {...DEFAULT_CONFIG, ...đã lưu}, có sẵn actives thì config cũ
// chỉ có `active` (v1.13) bị đè thành game mặc định lúc khởi động.
const DEFAULT_CONFIG = Object.freeze({ enabled: true, active: 'touchplay', source: '' });
// Game có phím tắt toàn cục (electron-main.js). Đồng bộ với `hotkeys: true` trong registry.js.
const HOTKEY_GAMES = new Set(['bancung', 'dapmuoi']);

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
// So khớp ĐÚNG như handler của game: Bắn Cung / Chém Trái Cây chỉ so id; Đập Muỗi so id hoặc tên.
// Giành quà bằng cách so khác handler → game khác nhường mà game này lại không xử lý → quà mất trắng.
const BY_ID_ONLY = new Set(['bancung', 'chemtraicay']);
function giftMatches(id, item, gift) {
    const iid = gidOf(item);
    if (iid && iid === gidOf(gift)) return true;
    if (BY_ID_ONLY.has(id)) return false;
    const name = nameOf(item);
    return !!name && name === nameOf(gift);
}

// Các mục quà game gán ĐÍCH DANH (đang bật) — mỗi mục { giftId, giftName }.
function explicitGifts(id, cfg) {
    cfg = cfg || {};
    const list = a => (Array.isArray(a) ? a : []).filter(x => x && (gidOf(x) || (!BY_ID_ONLY.has(id) && nameOf(x))));
    if (id === 'bancung') return [...list(cfg.shieldGifts), ...list(cfg.reviveGifts), ...list(cfg.healGifts), ...list(cfg.shotGifts)];
    if (id === 'chemtraicay') return list(cfg.giftRules).filter(r => r.enabled !== false && r.action);
    if (id === 'dapmuoi') return [
        ...list(cfg.actions).filter(a => a.enabled !== false),
        ...list(cfg.giftRules).filter(r => r.enabled !== false && parseInt(r.count, 10) > 0)
    ];
    return [];
}

// Game có đang XỬ LÝ quà không (handler server bỏ qua thì đừng giành): Bắn Cung phải bật + đã ▶ BẮT ĐẦU.
function actsOnGifts(id, cfg) {
    cfg = cfg || {};
    if (cfg.enabled === false) return false;
    if (id === 'bancung') return cfg.sessionActive !== false;
    return true;
}

// Game đang chơi nào gán đích danh quà này VÀ sẽ xử lý nó (giữ thứ tự `actives`).
function giftClaims(gift, cfgs, actives) {
    return (actives || []).filter(id => actsOnGifts(id, cfgs?.[id]) && explicitGifts(id, cfgs?.[id]).some(x => giftMatches(id, x, gift)));
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

// ---------- phím tắt ----------
// Chơi 2 game cùng có phím tắt toàn cục → phím có thể trùng (đăng ký sau thì hỏng, không ai biết). Chỉ một game
// giữ phím: game streamer BẤM VÀO gần nhất trong Game Camera (`hotkeyGame`), chưa bấm thì game đầu danh sách.
// Game còn lại tạm nhả phím — quà vẫn chạy bình thường (quà chỉ định / xu không cần phím tắt).
function hotkeyOwner(cam, ids) {
    if (!cam || cam.enabled === false) return null;
    const withKeys = activesOf(cam, ids).filter(id => HOTKEY_GAMES.has(id));
    if (withKeys.length < 2) return null;
    return withKeys.includes(cam.hotkeyGame) ? cam.hotkeyGame : withKeys[0];
}
function hotkeysAllowed(id, cam, ids) {
    const owner = hotkeyOwner(cam, ids);
    return !owner || owner === id;
}

module.exports = { SLOTS, DEFAULT_CONFIG, HOTKEY_GAMES, slotOf, normalizeActives, activesOf, applyPatch, withGame, withoutGame,
    explicitGifts, giftClaims, claimedElsewhere, overlapGifts, hotkeyOwner, hotkeysAllowed };
