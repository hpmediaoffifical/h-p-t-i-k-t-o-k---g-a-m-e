// lib/camgames-gift-seed.js — 🎥 BỘ QUÀ MẪU Game Camera (port từ HP LIVE NPC lib/camgames-gift-seed.cjs).
// Dữ liệu ở lib/camgames-gift-seed.json (quà chỉ định kèm ảnh của Chém Trái Cây, Đập Muỗi, Bắn Cung, Đá Cầu + 🎮 Quà kích
// hoạt game). Áp MỘT lần mỗi phiên bản bộ mẫu (cờ camgames.giftSeedV) và CHỈ điền vào game còn TRỐNG quà — quà streamer đã
// gắn giữ nguyên (user chốt 28/10/2026, khác NPC ép mọi máy). Quà kích hoạt gieo sẵn luật nhưng KHÔNG tự bật tính năng.
// Touch & Play không có ở đây: trang touchplay.html tự dùng bộ quà mẫu khi chưa có `gifts` (lib/camgames.js TOUCHPLAY_GIFTS).
'use strict';

const SEED = require('./camgames-gift-seed.json');

const clone = v => JSON.parse(JSON.stringify(v));
const arr = a => (Array.isArray(a) ? a : []);
const hasGift = x => !!(x && (String(x.giftId || '') || String(x.giftName || '')));
const none = a => !arr(a).some(hasGift);

let ruleSeq = 0;
// games: appConfig.games. makeDefault(id) → config mặc định của game (game chưa có config thì tạo để có chỗ gieo).
// Sửa tại chỗ; trả danh sách phần vừa được áp.
function applyGiftSeed(games, makeDefault, seed = SEED) {
    if (!games || typeof games !== 'object') return [];
    const cam = games.camgames = games.camgames && typeof games.camgames === 'object' ? games.camgames : {};
    const v = Number(seed.v) || 1;
    if (Number(cam.giftSeedV) >= v) return [];
    const done = [];
    const obj = id => {
        if (!games[id] || typeof games[id] !== 'object') { const d = makeDefault ? makeDefault(id) : null; if (!d) return null; games[id] = d; }
        return games[id];
    };
    const st = seed.trigger && typeof seed.trigger === 'object' ? seed.trigger : { rules: [] };
    if (arr(st.rules).length) {
        const cur = cam.trigger && typeof cam.trigger === 'object' ? cam.trigger : null;
        if (!cur || none(cur.rules)) {
            const rules = st.rules.map(r => ({ id: 'cgt-s' + (++ruleSeq) + '-' + Date.now().toString(36), ...clone(r) }));
            cam.trigger = { enabled: false, maxSec: 300, introSec: 3, ...(cur || {}), rules };
            done.push('trigger');
        }
    }
    const ct = obj('chemtraicay');
    if (ct && arr(seed.chemtraicay).length && none(ct.giftRules)) { ct.giftRules = clone(seed.chemtraicay); done.push('chemtraicay'); }
    const dm = obj('dapmuoi'), sd = seed.dapmuoi || {};
    if (dm && (arr(sd.actions).some(hasGift) || arr(sd.giftRules).length) && none(dm.actions) && none(dm.giftRules)) {
        if (arr(sd.actions).length) dm.actions = clone(sd.actions);
        dm.giftRules = clone(arr(sd.giftRules));
        done.push('dapmuoi');
    }
    const bc = obj('bancung'), sb = seed.bancung || {};
    const BC = ['shotGifts', 'healGifts', 'reviveGifts', 'shieldGifts'];
    if (bc && BC.some(k => arr(sb[k]).length) && BC.every(k => none(bc[k]))) {
        for (const k of BC) bc[k] = clone(arr(sb[k]));
        done.push('bancung');
    }
    const dc = obj('dacau');
    if (dc && arr(seed.dacau).length && none(dc.gifts)) { dc.gifts = clone(seed.dacau); done.push('dacau'); }
    cam.giftSeedV = v;
    return done;
}

module.exports = { SEED, applyGiftSeed };
