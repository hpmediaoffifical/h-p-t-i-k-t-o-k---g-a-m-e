// lib/overlay-presence.js — luật thuần: overlay game nào đang MỞ (trong OBS / TikTok LIVE Studio).
//
// Mỗi overlay gửi `overlay:hello {gameId, obs, onAir}` lúc nối và nhắc lại mỗi ~8s (public/lib/overlay-hello.js).
// Server giữ 1 dòng / socket: rớt mạng ngầm thì socket.io phải ~45s mới bắn disconnect → tự coi là đã đóng
// sau TTL_MS không nghe nhắc lại. Bảng Quà Tổng dùng snapshot để hiện game "🔗 Đang mở kèm".
// Spec: docs/superpowers/specs/2026-11-06-giftboard-theo-game-dang-chay-design.md
'use strict';

const TTL_MS = 20000;
const GAME_ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/i;

function createPresence() { return new Map(); }   // socketId → { gameId, lastSeen, onAir, obs }

// Gói hello từ client → { gameId, onAir, obs } hoặc null nếu sai. `known` (tuỳ chọn): chỉ nhận id game có thật.
function normalizeHello(raw, known) {
    const r = raw && typeof raw === 'object' ? raw : { gameId: raw };
    const gameId = String(r.gameId || '');
    if (!GAME_ID_RE.test(gameId)) return null;
    if (known && !known(gameId)) return null;
    return { gameId, onAir: r.onAir === true ? true : r.onAir === false ? false : null, obs: r.obs === true };
}

function touch(state, socketId, info, now) {
    if (!socketId || !info || !info.gameId) return;
    const prev = state.get(socketId);
    // onAir null = trang chưa biết (OBS chưa bắn sự kiện) → giữ giá trị đã biết của chính socket đó.
    const onAir = info.onAir == null ? (prev && prev.gameId === info.gameId ? prev.onAir : null) : info.onAir;
    state.set(socketId, { gameId: info.gameId, lastSeen: now, onAir, obs: !!info.obs });
}

function drop(state, socketId) { return state.delete(socketId); }

// Xoá dòng quá hạn. Trả về số dòng đã xoá.
function prune(state, now, ttl = TTL_MS) {
    let n = 0;
    for (const [sid, e] of state) if (now - e.lastSeen > ttl) { state.delete(sid); n++; }
    return n;
}

// { gameId: { open: số trang, onAir: true nếu có trang báo đang lên Program, obs: có trang chạy trong OBS } }
function snapshot(state, now, ttl = TTL_MS) {
    const out = {};
    for (const e of state.values()) {
        if (now - e.lastSeen > ttl) continue;
        const g = out[e.gameId] || (out[e.gameId] = { open: 0, onAir: false, obs: false });
        g.open++;
        if (e.onAir === true) g.onAir = true;
        if (e.obs) g.obs = true;
    }
    return out;
}

function sameSnapshot(a, b) {
    const ka = Object.keys(a || {}), kb = Object.keys(b || {});
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
        const x = a[k], y = b && b[k];
        if (!y || x.open !== y.open || x.onAir !== y.onAir || x.obs !== y.obs || !!x.viaHub !== !!y.viaHub || !!x.inObs !== !!y.inObs) return false;
    }
    return true;
}

// Hub 🎥 Game Camera đang mở → các game camera đang chọn coi như đang mở (con chạy trong iframe, không tự hello).
function withHub(snap, hubOnline, actives) {
    if (!hubOnline) return snap;
    const out = { ...snap };
    for (const id of actives || []) {
        const g = out[id];
        out[id] = g ? { ...g, viaHub: true } : { open: 1, onAir: !!(snap.camgames && snap.camgames.onAir), obs: !!(snap.camgames && snap.camgames.obs), viaHub: true };
    }
    return out;
}

// URL Browser Source trong OBS → id game (null nếu không phải overlay game của app).
// /overlay/<id>[?…] | /_prototype/<id>.html?mode=overlay (timer, touchplay, level-quest). Bảng Quà Tổng tự bỏ.
// `port` (tuỳ chọn): chỉ nhận URL đúng cổng app — tránh overlay app khác cùng máy (HP LIVE NPC :3001).
function gameIdFromOverlayUrl(url, port) {
    let u;
    try { u = new URL(String(url || '')); } catch (_) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    if (port != null && port !== '' && String(u.port || (u.protocol === 'https:' ? 443 : 80)) !== String(port)) return null;
    let m = /^\/overlay\/([a-z0-9][a-z0-9_-]{0,31})\/?$/i.exec(u.pathname);
    if (m) return m[1] === 'shared' ? null : m[1];
    m = /^\/_prototype\/([a-z0-9][a-z0-9_-]{0,31})\.html$/i.exec(u.pathname);
    if (m && u.searchParams.get('mode') === 'overlay' && m[1] !== 'giftboard') return m[1];
    return null;
}

// Đánh dấu game có Browser Source trong OBS (kể cả nguồn đang bị "Shutdown when not visible" chưa tải trang).
// Chỉ là chú thích — không đổi `open`. Game chưa có trong snap thì thêm { open: 0, inObs: true }.
function withObsSources(snap, ids) {
    if (!ids || !ids.length) return snap;
    const out = { ...snap };
    for (const id of ids) out[id] = out[id] ? { ...out[id], inObs: true } : { open: 0, onAir: false, obs: false, inObs: true };
    return out;
}

module.exports = { TTL_MS, createPresence, gameIdFromOverlayUrl, withObsSources, normalizeHello, touch, drop, prune, snapshot, sameSnapshot, withHub };
