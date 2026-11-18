'use strict';
/**
 * 🎚 Bàn trộn âm chung — luật thuần (test: tests/audio-mixer.test.js).
 *
 * Âm lượng từng game lưu đủ kiểu (0–1, 0–100, lồng theo từng mục…) nên bàn trộn KHÔNG sửa config game:
 * mỗi overlay được chèn `public/lib/hp-mixer.js` ngay đầu <head>; lớp đó nhân MỌI âm thanh của trang
 * (thẻ audio/video, Web Audio, giọng đọc) với hệ số = Tổng × kênh của game. Config game giữ nguyên.
 *
 * State lưu ở appConfig.mixer: { master: {vol, mute}, games: { <gameId>: {vol, mute} } }, vol 0–100.
 */

function clampVol(v, dflt = 100) {
    const n = Number(v);
    if (!Number.isFinite(n)) return dflt;
    return Math.max(0, Math.min(100, Math.round(n)));
}

function normChannel(c) {
    const x = c && typeof c === 'object' ? c : {};
    return { vol: clampVol(x.vol), mute: !!x.mute };
}

function normalize(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const games = {};
    if (r.games && typeof r.games === 'object') {
        for (const [id, c] of Object.entries(r.games)) {
            if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id)) continue;
            const ch = normChannel(c);
            if (ch.vol !== 100 || ch.mute) games[id] = ch;   // kênh mặc định không cần lưu
        }
    }
    return { master: normChannel(r.master), games };
}

// Gộp 1 thay đổi (vd panel kéo 1 thanh) vào state hiện có.
function merge(cur, patch) {
    const a = normalize(cur);
    const p = patch && typeof patch === 'object' ? patch : {};
    const out = { master: a.master, games: { ...a.games } };
    if (p.master) out.master = normChannel({ ...a.master, ...p.master });
    if (p.games && typeof p.games === 'object') {
        for (const [id, c] of Object.entries(p.games)) out.games[id] = { ...(a.games[id] || { vol: 100, mute: false }), ...(c || {}) };
    }
    return normalize(out);
}

// Hệ số 0–1 áp cho overlay của gameId.
function gainFor(state, gameId) {
    const s = normalize(state);
    const g = s.games[gameId] || { vol: 100, mute: false };
    if (s.master.mute || g.mute) return 0;
    return (s.master.vol / 100) * (g.vol / 100);
}

// Chèn thẻ script ngay sau <head> (trước mọi script của game) để lớp trộn bắt được cả âm tạo lúc tải trang.
function injectScript(html, gameId) {
    const id = String(gameId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    const tag = `<script src="/lib/hp-mixer.js" data-game="${id}"></script>`;
    const s = String(html || '');
    if (s.includes('/lib/hp-mixer.js')) return s;
    const m = s.match(/<head[^>]*>/i);
    if (m) return s.slice(0, m.index + m[0].length) + tag + s.slice(m.index + m[0].length);
    const h = s.match(/<html[^>]*>/i);
    if (h) return s.slice(0, h.index + h[0].length) + tag + s.slice(h.index + h[0].length);
    return tag + s;
}

module.exports = { clampVol, normalize, merge, gainFor, injectScript };
