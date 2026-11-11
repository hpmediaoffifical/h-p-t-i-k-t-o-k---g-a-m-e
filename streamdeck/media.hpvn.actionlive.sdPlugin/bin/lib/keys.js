// Nút Stream Deck: settings + trạng thái app → mô tả icon (thuần, không đụng Stream Deck/SVG).
'use strict';

const KIND_BY_UUID = {
    'media.hpvn.actionlive.game': 'game',
    'media.hpvn.actionlive.live': 'live',
    'media.hpvn.actionlive.gift': 'gift',
    'media.hpvn.actionlive.chat': 'chat',
    'media.hpvn.actionlive.hotkey': 'hotkey',
};

const C = {
    on: '#15803d', off: '#3f3f46', live: '#dc2626', connecting: '#d97706', offline: '#18181b',
    gift: '#7c3aed', chat: '#2563eb', locked: '#27272a',
    group: { duongveque: '#0e7490', bancung: '#b45309', dapmuoi: '#4d7c0f', pktiktok: '#be185d', caption: '#475569' },
};

const short = (s, n) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

function findGame(catalog, id) { return ((catalog && catalog.games) || []).find(g => g.id === id) || null; }
function findGift(catalog, id) { return ((catalog && catalog.gifts) || []).find(g => String(g.id) === String(id)) || null; }
function findHotkey(catalog, group, key) {
    const grp = ((catalog && catalog.hotkeys) || []).find(h => h.id === group);
    return { group: grp, key: grp ? grp.keys.find(k => k.key === key) || null : null };
}

// → { bg, glyph, label, sub, ring?, dim? }. glyph ∈ power | live | gift | chat | bolt | lock | warn | mic
function keyView(kind, settings = {}, { state = null, catalog = null, online = false } = {}) {
    const s = settings || {};
    if (!online) return { bg: C.offline, ring: '#facc15', glyph: 'warn', label: 'HP chưa chạy', sub: 'Mở HP Action LIVE' };
    if (kind === 'game') {
        const g = findGame(catalog, s.gameId);
        if (!s.gameId || !g) return { bg: C.off, glyph: 'power', label: 'Chọn game', sub: 'trong cài đặt nút' };
        const st = (state && state.games && state.games[s.gameId]) || { on: false, locked: g.locked };
        if (st.locked) return { bg: C.locked, glyph: 'lock', label: short(g.name, 14), sub: 'KEY chưa mở', dim: true };
        return { bg: st.on ? C.on : C.off, glyph: 'power', label: short(g.name, 14), sub: st.on ? 'ĐANG BẬT' : 'ĐANG TẮT', dim: !st.on };
    }
    if (kind === 'live') {
        const l = (state && state.live) || {};
        const who = l.username ? '@' + short(l.username, 13) : (s.username ? '@' + short(String(s.username).replace(/^@/, ''), 13) : '');
        if (l.connected) return { bg: C.live, glyph: 'live', label: 'ĐANG LIVE', sub: who };
        if (l.connecting) return { bg: C.connecting, glyph: 'live', label: 'Đang nối…', sub: who };
        return { bg: C.off, glyph: 'live', label: 'Chưa LIVE', sub: who || 'Bấm để kết nối', dim: true };
    }
    if (kind === 'gift') {
        const g = s.giftId ? findGift(catalog, s.giftId) : null;
        const n = Math.max(1, Math.min(99, Math.floor(Number(s.count) || 1)));
        return { bg: C.gift, glyph: 'gift', label: g ? short(g.name, 14) : (s.giftId ? '#' + short(s.giftId, 12) : 'Quà ngẫu nhiên'), sub: 'Thả thử ×' + n };
    }
    if (kind === 'chat') {
        return { bg: C.chat, glyph: 'chat', label: s.comment ? short(s.comment, 14) : 'Nhập câu', sub: 'Bình luận thử' };
    }
    if (kind === 'hotkey') {
        const { group, key } = findHotkey(catalog, s.group, s.key);
        if (!group || !key) return { bg: C.off, glyph: 'bolt', label: 'Chọn phím', sub: 'trong cài đặt nút' };
        const bg = C.group[group.id] || C.off;
        if (group.id === 'caption') {
            const listening = state && state.caption && state.caption.status === 'listening';
            return { bg: listening ? C.live : bg, glyph: 'mic', label: short(key.label, 14), sub: listening ? 'ĐANG NGHE' : 'Phụ đề' };
        }
        const gs = state && state.games && state.games[group.id];
        if (gs && gs.locked) return { bg: C.locked, glyph: 'lock', label: short(key.label, 14), sub: 'KEY chưa mở', dim: true };
        const off = gs && !gs.on;
        return { bg, glyph: 'bolt', label: short(key.label, 14), sub: short(group.name, 16) + (off ? ' (tắt)' : ''), dim: !!off };
    }
    return { bg: C.off, glyph: 'warn', label: '?', sub: '' };
}

// Lệnh gửi /api/streamdeck/run từ settings của nút.
function runCommand(kind, settings = {}) {
    const s = settings || {};
    if (kind === 'game') return { kind, gameId: s.gameId, mode: s.mode };
    if (kind === 'live') return { kind, mode: s.mode, username: s.username };
    if (kind === 'gift') return { kind, giftId: s.giftId, count: s.count };
    if (kind === 'chat') return { kind, comment: s.comment, nickname: s.nickname };
    if (kind === 'hotkey') return { kind, group: s.group, key: s.key };
    return null;
}

module.exports = { KIND_BY_UUID, COLORS: C, keyView, runCommand };
