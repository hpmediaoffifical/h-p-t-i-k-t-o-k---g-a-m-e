// 🎛️ Stream Deck — luật thuần: danh mục nút, trạng thái gộp, và lệnh bấm → route có sẵn của app.
// Không tự chạy gì: server.js gọi planRun() rồi đi đúng route thật qua 127.0.0.1 (giữ mọi middleware:
// khoá game theo KEY, kiểm bản quyền khi kết nối…). Spec: docs/superpowers/specs/2026-11-12-streamdeck-plugin-design.md
'use strict';

const KINDS = ['game', 'live', 'gift', 'chat', 'hotkey'];

// Phím hành động cố định theo game. `run` = route + body gửi đi. Đập Muỗi thêm động từ cfg.actions (hotkeysFor).
const HOTKEY_DEFS = {
    duongveque: [
        { key: 'jump',  label: 'Nhảy',     run: { path: '/api/duongveque/key', body: { action: 'jump' } } },
        { key: 'ram',   label: 'Húc',      run: { path: '/api/duongveque/key', body: { action: 'ram' } } },
        { key: 'start', label: 'Bắt đầu',  run: { path: '/api/duongveque/key', body: { action: 'start' } } },
    ],
    bancung: [
        { key: 'fire',   label: 'Bắn',      run: { path: '/api/games/bancung/control', body: { cmd: 'damage', shots: 1, uniqueId: 'idol', nickname: 'IDOL' } } },
        { key: 'heal',   label: 'Hồi máu',  run: { path: '/api/games/bancung/control', body: { cmd: 'heal', hearts: 1 } } },
        { key: 'shield', label: 'Khiên',    run: { path: '/api/games/bancung/control', body: { cmd: 'shield', durationSec: 5 } } },
        { key: 'revive', label: 'Hồi sinh', run: { path: '/api/games/bancung/control', body: { cmd: 'revive' } } },
        { key: 'kill',   label: 'Kết liễu', run: { path: '/api/games/bancung/control', body: { cmd: 'killshot' } } },
        { key: 'start',  label: 'Bắt đầu',  run: { path: '/api/games/bancung/control', body: { cmd: 'start' } } },
        { key: 'stop',   label: 'Dừng',     run: { path: '/api/games/bancung/control', body: { cmd: 'stop' } } },
    ],
    dapmuoi: [
        { key: 'start', label: 'Bắt đầu', run: { path: '/api/dapmuoi/control', body: { cmd: 'start' } } },
        { key: 'stop',  label: 'Dừng',    run: { path: '/api/dapmuoi/control', body: { cmd: 'stop' } } },
    ],
    caption: [
        { key: 'toggle', label: 'Nghe / Dừng', run: { path: '/api/creator-caption/listener/toggle', body: {} } },
        { key: 'open',   label: 'Mở nghe',     run: { path: '/api/creator-caption/listener/open', body: {} } },
        { key: 'stop',   label: 'Tắt nghe',    run: { path: '/api/creator-caption/listener/stop', body: {} } },
    ],
    pktiktok: [
        { key: 'stop', label: 'Dừng hiệu ứng', run: { path: '/api/games/pktiktok/trigger', body: { type: 'stop' } } },
    ],
};
// Nhóm phím hiện trong ô chọn "game" của nút ⚡ — caption không phải game trong GAMES nên đặt tên riêng.
const HOTKEY_GROUPS = [
    { id: 'duongveque', name: 'Đường Về Quê' },
    { id: 'bancung', name: 'Bắn Cung' },
    { id: 'dapmuoi', name: 'Đập Muỗi' },
    { id: 'pktiktok', name: 'Hiệu ứng PK' },
    { id: 'caption', name: 'Phụ đề giọng nói' },
];

const str = (v, max = 200) => String(v == null ? '' : v).slice(0, max);
const clampInt = (v, lo, hi, dflt) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

// ctx.dapmuoiActions = cfg.actions [{id,type,name,enabled,params}]; ctx.pkEvents = PKTIKTOK_EVENT_DEFS [{key,label}]
function hotkeysFor(group, ctx = {}) {
    const base = (HOTKEY_DEFS[group] || []).map(h => ({ key: h.key, label: h.label }));
    if (group === 'dapmuoi') {
        const acts = (Array.isArray(ctx.dapmuoiActions) ? ctx.dapmuoiActions : []).filter(a => a && a.id && a.enabled !== false);
        return acts.map(a => ({ key: 'act:' + str(a.id, 64), label: str(a.name || a.type, 40) })).concat(base);
    }
    if (group === 'pktiktok') {
        const evs = (Array.isArray(ctx.pkEvents) ? ctx.pkEvents : []).filter(e => e && e.key);
        return evs.map(e => ({ key: 'fx:' + str(e.key, 32), label: str(e.label, 40) })).concat(base);
    }
    return base;
}

function resolveHotkey(group, key, ctx = {}) {
    const k = str(key, 80);
    const fixed = (HOTKEY_DEFS[group] || []).find(h => h.key === k);
    if (fixed) return { label: fixed.label, path: fixed.run.path, body: { ...fixed.run.body } };
    if (group === 'dapmuoi' && k.startsWith('act:')) {
        const id = k.slice(4);
        const a = (ctx.dapmuoiActions || []).find(x => x && String(x.id) === id);
        if (!a) return null;
        if (a.enabled === false) return { error: 'action_disabled' };
        return { label: str(a.name || a.type, 40), path: '/api/dapmuoi/test', body: { action: a.type, params: a.params || {} } };
    }
    if (group === 'pktiktok' && k.startsWith('fx:')) {
        const ev = (ctx.pkEvents || []).find(e => e && e.key === k.slice(3));
        if (!ev) return null;
        return { label: str(ev.label, 40), path: '/api/games/pktiktok/trigger', body: { type: 'trigger', key: ev.key, source: 'streamdeck' } };
    }
    return null;
}

// ctx.games = [{id,name,icon,enabled,locked}], ctx.gifts = giftList [{id,name,diamond}]
function buildCatalog(ctx = {}) {
    const games = (ctx.games || []).map(g => ({ id: g.id, name: str(g.name, 60), icon: str(g.icon, 8), locked: !!g.locked }));
    const gifts = (ctx.gifts || []).filter(g => g && g.id != null).slice(0, 2000)
        .map(g => ({ id: String(g.id), name: str(g.name || g.id, 60), coins: Number(g.diamond || g.coins || 0) || 0 }));
    const gameIds = new Set(games.map(g => g.id));
    const hotkeys = HOTKEY_GROUPS
        .filter(h => h.id === 'caption' || gameIds.has(h.id))
        .map(h => ({ id: h.id, name: h.name, keys: hotkeysFor(h.id, ctx) }));
    return { kinds: KINDS.slice(), games, gifts, hotkeys, lastUsername: str(ctx.lastUsername, 64) };
}

function buildState(ctx = {}) {
    const games = {};
    for (const g of (ctx.games || [])) games[g.id] = { on: g.enabled !== false && !g.locked, locked: !!g.locked };
    return {
        live: { connected: !!ctx.connected, connecting: !!ctx.connecting && !ctx.connected, username: str(ctx.username || '', 64) },
        games,
        caption: { status: str(ctx.captionStatus || 'idle', 20) },
    };
}

// Lệnh bấm nút → { method, path, body, label } | { error }. ctx giống buildCatalog + trạng thái kết nối.
function planRun(cmd, ctx = {}) {
    const c = cmd && typeof cmd === 'object' ? cmd : {};
    const kind = String(c.kind || '');
    if (!KINDS.includes(kind)) return { error: 'unknown_kind' };
    const games = ctx.games || [];
    if (kind === 'game') {
        const g = games.find(x => x.id === String(c.gameId || ''));
        if (!g) return { error: 'unknown_game' };
        if (g.locked) return { error: 'feature_locked' };
        const mode = ['on', 'off'].includes(c.mode) ? c.mode : 'toggle';
        const enabled = mode === 'on' ? true : mode === 'off' ? false : g.enabled === false;
        return { method: 'POST', path: '/api/games/' + encodeURIComponent(g.id) + '/config', body: { enabled }, label: g.name };
    }
    if (kind === 'live') {
        const live = !!ctx.connected || !!ctx.connecting;
        const mode = ['connect', 'disconnect'].includes(c.mode) ? c.mode : (live ? 'disconnect' : 'connect');
        if (mode === 'disconnect') return { method: 'POST', path: '/api/disconnect', body: {}, label: 'Ngắt LIVE' };
        const username = str(c.username || ctx.lastUsername || '', 64).replace(/^@/, '').trim();
        if (!username) return { error: 'missing_username' };
        return { method: 'POST', path: '/api/connect', body: { username }, label: '@' + username };
    }
    if (kind === 'gift') {
        const giftId = str(c.giftId || '', 64).trim();
        const body = { count: clampInt(c.count, 1, 99, 1), nickname: 'Stream Deck' };
        if (giftId) body.giftId = giftId;   // trống = quà ngẫu nhiên như nút thả thử của app
        return { method: 'POST', path: '/api/test-gift', body, label: 'Quà thử' };
    }
    if (kind === 'chat') {
        const comment = str(c.comment || '', 300);
        if (!comment.trim()) return { error: 'missing_comment' };
        return { method: 'POST', path: '/api/test-chat', body: { comment, nickname: str(c.nickname || 'Stream Deck', 64) }, label: 'Bình luận thử' };
    }
    // hotkey
    const group = String(c.group || '');
    if (!HOTKEY_GROUPS.some(h => h.id === group)) return { error: 'unknown_group' };
    if (group !== 'caption') {
        const g = games.find(x => x.id === group);
        if (!g) return { error: 'unknown_game' };
        if (g.locked) return { error: 'feature_locked' };
    }
    const r = resolveHotkey(group, c.key, ctx);
    if (!r) return { error: 'unknown_key' };
    if (r.error) return { error: r.error };
    return { method: 'POST', path: r.path, body: r.body, label: r.label };
}

module.exports = { KINDS, HOTKEY_DEFS, HOTKEY_GROUPS, hotkeysFor, resolveHotkey, buildCatalog, buildState, planRun };
