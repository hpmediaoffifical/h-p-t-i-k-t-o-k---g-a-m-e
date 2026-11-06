// lib/giftboard-tt.js — 📋 Bảng Quà Tổng: quà → hành động của 🎮 Game Tương Tác (Zombie, Nhà Tù, Pokemon,
// Creator Online, Đường Về Quê). Mỗi game giữ quà trong appConfig.games[id].*GiftMap ({ [action]: [{giftId,…}] });
// nhãn hành động nằm ở data.json (Nhà Tù, Creator Online) hoặc ES module trình duyệt (Zombie gift-data.js,
// Đường Về Quê logic.js) → nạp bằng import() một lần. Mục không có giftId = dòng "mọi quà / theo xu".
// Spec: docs/superpowers/specs/2026-11-06-giftboard-theo-game-dang-chay-design.md
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const TT_IDS = ['quaivat', 'nhatu', 'pokemon', 'creatoronline', 'duongveque'];
const BALL = { POKEBALL: 'Poké Ball', GREAT_BALL: 'Great Ball', ULTRA_BALL: 'Ultra Ball', MASTER_BALL: 'Master Ball' };

// Nhãn hành động: { quaivat: [{action, emoji, label, ids, gift, coins, opt}], nhatu: {id: {emoji,label}}, … }
function loadLabels(gamesDir) {
    const P = f => pathToFileURL(path.join(gamesDir, f)).href;
    const json = f => { try { return JSON.parse(fs.readFileSync(path.join(gamesDir, f), 'utf8')); } catch (_) { return {}; } };
    const byId = list => Object.fromEntries((Array.isArray(list) ? list : []).filter(a => a && a.id).map(a => [a.id, a]));
    const out = { quaivat: [], nhatu: {}, creatoronline: {}, duongveque: {} };
    const nd = json('nhatu/data.json'); out.nhatu = byId([...(nd.actions || []), ...(nd.giftActions || [])]);
    out.creatoronline = byId(json('creatoronline/data.json').giftActions);
    return Promise.all([
        import(P('quaivat/gift-data.js')).then(m => { out.quaivat = [...(m.VILLAINS || []), ...(m.HEROES || [])]; }).catch(e => { out.err = e.message; }),
        import(P('duongveque/logic.js')).then(m => {
            out.duongveque = Object.fromEntries((m.ACTIONS || []).map(a => [a.id, { emoji: a.emoji, label: (a.side === 'pha' ? 'Phá: ' : 'Cứu: ') + a.label }]));
        }).catch(e => { out.err = e.message; })
    ]).then(() => out);
}

// catalog: Map giftId → { name, image, diamonds }
function rowOf(x, label, catalog) {
    const id = String(x && typeof x === 'object' ? (x.giftId ?? '') : (x ?? '')).trim();
    if (!id) return null;
    const c = (catalog && catalog.get(id)) || {};
    const o = x && typeof x === 'object' ? x : {};
    return { giftId: id, name: String(o.giftName || c.name || ''), image: String(o.giftImage || c.image || ''),
        diamonds: Number(o.coins) || Number(c.diamonds) || 0, emoji: '', label: String(label || '').trim() };
}
const labelOf = d => `${d.emoji || ''} ${d.label || ''}`.trim();
// { [action]: [quà] } + bảng nhãn → dòng bảng (action lạ / không nhãn thì bỏ).
function fromMap(map, defs, catalog) {
    const out = [];
    for (const [action, list] of Object.entries(map && typeof map === 'object' ? map : {})) {
        const d = defs && defs[action]; if (!d) continue;
        for (const x of Array.isArray(list) ? list : [list]) { const r = rowOf(x, labelOf(d), catalog); if (r) out.push(r); }
    }
    return out;
}

function quaivatRows(cfg, defs, catalog) {
    cfg = cfg || {};
    const map = cfg.qvGiftMap || {};
    const timerOn = !!cfg.qvTimerOn || cfg.qvHold !== false;
    const out = [];
    for (const d of defs || []) {
        if (d.action === 'time' && !timerOn) continue;
        const mapped = (Array.isArray(map[d.action]) ? map[d.action] : []).filter(Boolean);
        if (mapped.length) { for (const x of mapped) { const r = rowOf(x, labelOf(d), catalog); if (r) out.push(r); } continue; }
        if (d.opt || !Array.isArray(d.ids) || !d.ids.length) continue;   // WIN/THUA ngay chỉ hiện khi đã gán quà
        const r = rowOf({ giftId: d.ids[0], giftName: d.gift, coins: d.coins }, labelOf(d), catalog); if (r) out.push(r);
    }
    return out;
}

function pokemonRows(cfg, catalog) {
    cfg = cfg || {};
    const out = [];
    for (const s of Array.isArray(cfg.specials) ? cfg.specials : []) {
        if (!s || s.enabled === false || !s.giftId) continue;
        const extra = [s.vip && 'Ghế VIP', s.legendary && 'Huyền Thoại', s.weather && 'Đổi thời tiết'].filter(Boolean);
        const ball = BALL[s.ball] || 'bóng';
        const label = `${s.labelVi || ''}: ${s.balls || 1} ${ball}${Number(s.maxLevel) < 100 ? ' Lv.' + s.maxLevel : ''}${extra.length ? ' + ' + extra.join(' + ') : ''}`;
        const r = rowOf({ giftId: s.giftId }, label.replace(/^: /, ''), catalog); if (r) out.push(r);
    }
    const tiers = (Array.isArray(cfg.tiers) ? cfg.tiers : []).filter(t => t && Number(t.minCoins) > 0).sort((a, b) => a.minCoins - b.minCoins);
    tiers.forEach((t, i) => {
        const next = tiers[i + 1];
        out.push({ giftId: '', name: t.labelVi || (next ? `Quà ${t.minCoins} - ${next.minCoins - 1} xu` : `Quà ${t.minCoins}+ xu`), image: '', diamonds: 0, emoji: '',
            label: `${t.balls || 1} bóng Lv.${t.maxLevel}` });
    });
    return out;
}

// → { games: { id: [dòng] }, running: { id: bool } }
function buildTtGifts(gamesCfg, labels, catalog) {
    const G = gamesCfg || {}; const L = labels || {};
    const games = {
        quaivat: quaivatRows(G.quaivat, L.quaivat, catalog),
        nhatu: fromMap(G.nhatu && G.nhatu.ntGiftMap, L.nhatu, catalog),
        pokemon: pokemonRows(G.pokemon, catalog),
        creatoronline: fromMap(G.creatoronline && G.creatoronline.coGiftMap, L.creatoronline, catalog)
            .concat([{ giftId: '', name: 'Quà khác', image: '', diamonds: 0, emoji: '', label: 'Lên sân khấu' }]),
        duongveque: fromMap(G.duongveque && G.duongveque.dvqGiftMap, L.duongveque, catalog)
    };
    const running = {};
    for (const id of TT_IDS) running[id] = !!G[id] && G[id].enabled !== false;
    if (running.nhatu) running.nhatu = G.nhatu.ntMode !== 'off';
    return { games, running };
}

module.exports = { TT_IDS, loadLabels, buildTtGifts, fromMap, quaivatRows, pokemonRows, rowOf };
