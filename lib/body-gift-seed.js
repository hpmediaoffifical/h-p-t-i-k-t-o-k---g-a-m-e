// 🧍 Áp QUÀ MẪU Bộ Tách Người - MỘT lần mỗi phiên bản bộ mẫu trên mỗi máy (cờ camGames.body.giftSeedV), dữ liệu ở
// lib/body-gift-seed.json (sinh từ máy dev: node scripts/dump-body-gift-seed.cjs).
// CHỈ ĐIỀN CHỖ TRỐNG (user chốt 2026-10-28 "máy nào chưa gắn thì lấy làm mẫu, máy nào gắn trước đó rồi thì bỏ qua để ưu tiên quà ở
// máy đó"). Khớp theo LOẠI game (slotOf), KHÔNG theo mã: mã game 🎬 khác nhau giữa các máy (máy cũ vf_scifi / vf_ufo…, máy cài mới
// vft_portal / vft_abduct…):
//   🎬 Video Hành Động = kiểu chuyển động (vidfx:portal…) · 😭 = kiểu khóc / cười (cry:cry) · ✨ = kiểu biến hình (morph:ice…) · còn lại = loại (roiho, biduoi, heart, catch).
//   · máy đã có game CÙNG LOẠI gắn quà → bỏ qua loại đó;
//   · không thì gắn vào game "Mọi NPC" (profileId rỗng) đầu tiên của loại; máy không còn game loại đó → bỏ qua (không tạo lại);
//   · quà mẫu mà máy đã gắn cho game KHÁC của Bộ Tách Người → bỏ quà đó (một quà không kích hoạt 2 game).
// 🦊 Hậu Cảnh gắn hồ sơ NPC riêng của máy dev → không có trong bộ mẫu.
'use strict';

const SEED = require('./body-gift-seed.json');
const KINDS = ['roiho', 'biduoi', 'vidfx', 'cry', 'heart', 'catch', 'morph'];
const slotOf = (kind, sc) => kind === 'vidfx' ? 'vidfx:' + (sc.motion || '') : kind === 'cry' ? 'cry:' + (sc.mood || 'cry') : kind === 'morph' ? 'morph:' + (sc.style || 'ice') : kind;
const clone = v => JSON.parse(JSON.stringify(v));
const gid = g => String((g && g.giftId) || '');

// Có quà streamer tự gắn không: mọi kịch bản + 🦊 Hậu Cảnh; quà mặc định của lõi (Heart Me 7934 trên Bắn Tim) không tính.
const DEFAULT_HEART_GIFT = '7934';
function hasOwnGifts(body) {
    for (const k of KINDS) for (const sc of (body[k] && body[k].scripts) || []) for (const g of sc.gifts || []) {
        if (gid(g) && !(k === 'heart' && gid(g) === DEFAULT_HEART_GIFT)) return true;
    }
    for (const it of (body.haucanh && body.haucanh.items) || []) if ((it.gifts || []).some(gid)) return true;
    return false;
}

// body: nhánh camGames.body ĐÃ chuẩn hoá (Body.normalizeConfig). Sửa tại chỗ; trả danh sách "slot→mã game" vừa được gắn quà.
function applyBodyGiftSeed(body, seed = SEED) {
    if (!body || typeof body !== 'object') return [];
    const v = Number(seed && seed.v) || 1;
    if (Number(body.giftSeedV) >= v) return [];
    // HP Action LIVE: chỉ gieo khi Bộ Tách Người CHƯA gắn quà nào (ngoài 💗 Heart Me mặc định của Bắn Tim) - streamer đã gắn quà
    // bất kỳ thì giữ nguyên toàn bộ, không điền thêm (đánh dấu đã xét để không thử lại).
    if (hasOwnGifts(body)) { body.giftSeedV = v; return []; }
    const used = new Set(), gifted = new Set(), target = new Map();
    for (const k of KINDS) for (const sc of (body[k] && body[k].scripts) || []) {
        const slot = slotOf(k, sc);
        if ((sc.gifts || []).length) gifted.add(slot);
        for (const g of sc.gifts || []) if (gid(g)) used.add(gid(g));
        if (!sc.profileId && !target.has(slot)) target.set(slot, sc);
    }
    for (const it of (body.haucanh && body.haucanh.items) || []) for (const g of it.gifts || []) if (gid(g)) used.add(gid(g));
    const done = [];
    for (const [slot, gifts] of Object.entries((seed && seed.slots) || {})) {
        const sc = target.get(slot);
        if (!sc || gifted.has(slot) || !Array.isArray(gifts)) continue;
        const add = gifts.filter(g => gid(g) && !used.has(gid(g)));
        if (!add.length) continue;
        sc.gifts = clone(add);
        for (const g of add) used.add(gid(g));
        done.push(slot + '→' + sc.id);
    }
    body.giftSeedV = v;
    return done;
}

module.exports = { SEED, slotOf, applyBodyGiftSeed, hasOwnGifts };
