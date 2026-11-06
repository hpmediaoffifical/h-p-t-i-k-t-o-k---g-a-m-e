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

// 'kick' = Đá Cầu (đỡ cầu bằng đầu/đùi), 'body' = Bộ Tách Người (vẽ lại người tách nền, lớp dưới cùng) — chơi tối đa 4 game.
const SLOTS = { touchplay: 'hands', chemtraicay: 'hands', dapmuoi: 'hands', bancung: 'head', 'level-quest': 'head', dacau: 'kick', body: 'body' };
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
const BY_ID_ONLY = new Set(['bancung', 'chemtraicay', 'dacau', 'body']);
function giftMatches(id, item, gift) {
    const iid = gidOf(item);
    if (iid && iid === gidOf(gift)) return true;
    if (BY_ID_ONLY.has(id)) return false;
    const name = nameOf(item);
    return !!name && name === nameOf(gift);
}

// 🔵 Touch & Play: quà CHỈ ĐỊNH cho từng hành động (tpCfg.gifts) — đồng bộ DEFAULT_CFG.gifts trong public/_prototype/touchplay.html
// (bộ quà mẫu từ HP LIVE NPC). Máy chưa có trường `gifts` (cấu hình cũ) = dùng bộ này; đã có mảng (kể cả rỗng) = giữ nguyên.
// Touch & Play so khớp cả id lẫn tên (không vào BY_ID_ONLY).
const TP_IMG = 'https://p16-webcast.tiktokcdn.com/img/';
const TOUCHPLAY_GIFTS = Object.freeze([
    { action: 'ball',   giftId: '5655',   giftName: 'Rose',                diamond: 1,  count: 1, giftImage: TP_IMG + 'maliva/webcast-va/eba3a9bb85c33e017f3648eaf88d7189~tplv-obj.webp' },
    { action: 'food',   giftId: '5487',   giftName: 'Finger Heart',        diamond: 5,  count: 1, giftImage: TP_IMG + 'maliva/webcast-va/a4c4dc437fd3a6632aba149769491f49.png~tplv-obj.webp' },
    { action: 'pose',   giftId: '626064', giftName: 'G.O.A.T. Busker',     diamond: 20, count: 1, giftImage: TP_IMG + 'alisg/webcast-sg/resource/a9ff60f42b278cc1e8278139dfebfca2.png~tplv-obj.webp' },
    { action: 'rain',   giftId: '9947',   giftName: 'Friendship Necklace', diamond: 10, count: 1, giftImage: TP_IMG + 'maliva/webcast-va/resource/e033c3f28632e233bebac1668ff66a2f.png~tplv-obj.webp' },
    { action: 'freeze', giftId: '7412',   giftName: 'Ice cream',           diamond: 5,  count: 1, giftImage: TP_IMG + 'maliva/webcast-va/a40b91f7a11d4cbce780989e2d20a1f4~tplv-obj.webp' },
    { action: 'slow',   giftId: '5658',   giftName: 'Perfume',             diamond: 20, count: 1, giftImage: TP_IMG + 'maliva/webcast-va/20b8f61246c7b6032777bb81bf4ee055~tplv-obj.webp' },
    { action: 'fast',   giftId: '8913',   giftName: 'Rosa',                diamond: 10, count: 1, giftImage: TP_IMG + 'maliva/webcast-va/eb77ead5c3abb6da6034d3cf6cfeb438~tplv-obj.webp' },
    { action: 'shield', giftId: '9875',   giftName: 'Shamrock',            diamond: 10, count: 1, giftImage: TP_IMG + 'maliva/webcast-va/resource/312f721603de550519983ca22f5cc445.png~tplv-obj.webp' },
    { action: 'fever',  giftId: '19443',  giftName: 'Bravo!',              diamond: 15, count: 1, giftImage: TP_IMG + 'alisg/webcast-sg/resource/075e206d6da035f10ff5f8fecd82abcc.png~tplv-obj.webp' },
    { action: 'rescue', giftId: '5879',   giftName: 'Doughnut',            diamond: 30, count: 1, giftImage: TP_IMG + 'maliva/webcast-va/4e7ad6bdf0a1d860c538f38026d4e812~tplv-obj.webp' }
].map(g => Object.freeze(g)));
const touchplayGifts = tp => (Array.isArray(tp?.gifts) ? tp.gifts : TOUCHPLAY_GIFTS).filter(x => x && x.action);

// Các mục quà game gán ĐÍCH DANH (đang bật) — mỗi mục { giftId, giftName }.
function explicitGifts(id, cfg) {
    cfg = cfg || {};
    const list = a => (Array.isArray(a) ? a : []).filter(x => x && (gidOf(x) || (!BY_ID_ONLY.has(id) && nameOf(x))));
    if (id === 'bancung') return [...list(cfg.shieldGifts), ...list(cfg.reviveGifts), ...list(cfg.healGifts), ...list(cfg.shotGifts)];
    if (id === 'chemtraicay') return list(cfg.giftRules).filter(r => r.enabled !== false && r.action);
    if (id === 'dacau') return list(cfg.gifts);
    if (id === 'body') return list(require('./body-server').explicitGifts(cfg));
    if (id === 'touchplay') return list(touchplayGifts(cfg.tpCfg));
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

module.exports = { SLOTS, DEFAULT_CONFIG, HOTKEY_GAMES, TOUCHPLAY_GIFTS, touchplayGifts, slotOf, normalizeActives, activesOf, applyPatch, withGame, withoutGame,
    explicitGifts, actsOnGifts, giftClaims, claimedElsewhere, overlapGifts, hotkeyOwner, hotkeysAllowed };
