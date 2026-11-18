'use strict';
// 🔨 ĐẤU GIÁ — luật thuần (không I/O, đồng hồ tiêm `now`). server.js nối quà + nhịp + socket.
// Spec: docs/superpowers/specs/2026-11-12-daugia-top3tran-design.md
//
// Pha: idle → live → (tie ×≤tieRounds, chỉ khi hoà ở đỉnh lúc hết giờ) → done.
// Gỡ hoà bằng BỘ ĐẾM `reachedAt` (ai lên tới mức xu hiện tại trước đứng trên) — KHÔNG dùng Date.now():
// combo quà chạy đồng bộ, hàng trăm lượt cùng một mili-giây sẽ gỡ hoà sai.

const GIFT_SLOTS = 3;     // số loại quà giữ lại cho mỗi người (hiện dưới thẻ người thắng)
const MAX_ROWS = 10;      // số hàng gửi sang overlay (overlay chỉ vẽ cfg.rows)

const DEFAULTS = Object.freeze({
    enabled: true,
    title: '',
    durationSec: 120,
    minCoins: 0,
    tieSec: 15,           // hiệp phụ khi hoà ở đỉnh; 0 = không hiệp phụ
    tieRounds: 3,
    snipeOn: true,        // chống cướp giây chót: chỉ khi quà làm ĐỔI người dẫn
    snipeWindowSec: 10,
    snipeAddSec: 10,
    snipeMax: 20,
    trashOn: true,        // người về nhì bị ném vào thùng rác lúc chốt (luật chung trò thi đấu HP)
    rows: 5,
    xPercent: 50,
    yPercent: 6,
    scale: 100
});

function int(v, d, lo, hi) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return d;
    return Math.min(hi, Math.max(lo, n));
}

function normalizeCfg(c) {
    const s = Object.assign({}, DEFAULTS, c || {});
    return {
        enabled: s.enabled !== false,
        title: String(s.title == null ? '' : s.title).trim().slice(0, 120),
        durationSec: int(s.durationSec, DEFAULTS.durationSec, 10, 3600),
        minCoins: int(s.minCoins, 0, 0, 1e9),
        tieSec: int(s.tieSec, DEFAULTS.tieSec, 0, 120),
        tieRounds: int(s.tieRounds, DEFAULTS.tieRounds, 0, 5),
        snipeOn: s.snipeOn !== false,
        snipeWindowSec: int(s.snipeWindowSec, 10, 1, 60),
        snipeAddSec: int(s.snipeAddSec, 10, 1, 60),
        snipeMax: int(s.snipeMax, 20, 0, 50),
        trashOn: s.trashOn !== false,
        rows: int(s.rows, DEFAULTS.rows, 3, MAX_ROWS),
        xPercent: int(s.xPercent, 50, 0, 100),
        yPercent: int(s.yPercent, 6, 0, 95),
        scale: int(s.scale, 100, 40, 200)
    };
}

function createAuction(opts) {
    const now = (opts && opts.now) || Date.now;
    let cfg = normalizeCfg();
    let phase = 'idle';
    let title = '';
    let endsAt = 0, totalMs = 0;
    let tieRound = 0, tieIds = [];
    let extendCount = 0, lastExtendAt = 0;
    let winner = null, runnerUp = null;
    let bidders = new Map();
    let tick = 0;     // bộ đếm đơn điệu cho reachedAt
    let seq = 0;

    const running = () => phase === 'live' || phase === 'tie';

    function ranked() {
        return Array.from(bidders.values()).sort((a, b) => (b.coins - a.coins) || (a.reachedAt - b.reachedAt));
    }
    function leaderId() {
        const r = ranked();
        return r.length && r[0].coins > 0 ? r[0].id : null;
    }
    function pub(b) {
        if (!b) return null;
        const gifts = Array.from(b.gifts.entries())
            .map(([name, g]) => ({ name, icon: g.icon, count: g.count, coins: g.coins }))
            .sort((x, y) => y.coins - x.coins)
            .slice(0, GIFT_SLOTS);
        return { id: b.id, name: b.name, avatar: b.avatar, coins: b.coins, gifts };
    }

    function enter(p, ms) {
        phase = p;
        totalMs = ms;
        endsAt = now() + ms;
        extendCount = 0;     // mỗi pha có quỹ gia hạn riêng
        lastExtendAt = 0;
        seq++;
    }

    function finish() {
        const r = ranked().filter((b) => b.coins > 0);
        winner = r[0] || null;
        runnerUp = r[1] || null;
        phase = 'done';
        endsAt = 0;
        totalMs = 0;
        tieIds = [];
        seq++;
    }

    function afterTime() {
        const r = ranked();
        const top = r.length ? r[0].coins : 0;
        const leaders = top > 0 ? r.filter((b) => b.coins === top) : [];
        if (leaders.length > 1 && cfg.tieSec > 0 && tieRound < cfg.tieRounds) {
            tieRound++;
            tieIds = leaders.map((b) => b.id);
            enter('tie', cfg.tieSec * 1000);
            return;
        }
        finish();
    }

    return {
        setConfig(c) { cfg = normalizeCfg(c); seq++; return cfg; },
        getConfig() { return cfg; },
        isRunning: running,
        start(t) {
            bidders = new Map();
            tick = 0;
            winner = null; runnerUp = null;
            tieRound = 0; tieIds = [];
            title = String(t == null || t === '' ? cfg.title : t).trim().slice(0, 120);
            enter('live', cfg.durationSec * 1000);
        },
        end() { if (phase !== 'idle' && phase !== 'done') finish(); },
        reset() {
            phase = 'idle'; title = ''; endsAt = 0; totalMs = 0;
            tieRound = 0; tieIds = []; extendCount = 0; lastExtendAt = 0;
            winner = null; runnerUp = null; bidders = new Map(); tick = 0;
            seq++;
        },
        setTitle(t) {
            const v = String(t == null ? '' : t).trim().slice(0, 120);
            if (v !== title) { title = v; seq++; }
            return title;
        },
        /** g = { uniqueId, nickname, avatar, coins (đã nhân combo), giftName, giftIcon, count } */
        gift(g) {
            const res = { changed: false, extended: false };
            if (!running() || !g) return res;
            const add = Math.round(Number(g.coins) || 0);
            if (!(add > 0) || add < cfg.minCoins) return res;
            const id = String(g.uniqueId || g.userId || '').trim();
            if (!id) return res;
            const before = leaderId();
            let b = bidders.get(id);
            if (!b) {
                b = { id, name: id, avatar: '', coins: 0, reachedAt: 0, gifts: new Map() };
                bidders.set(id, b);
            }
            if (g.nickname) b.name = String(g.nickname);
            if (g.avatar) b.avatar = String(g.avatar);
            b.coins += add;
            b.reachedAt = ++tick;
            const gname = String(g.giftName || '');
            if (gname) {
                const it = b.gifts.get(gname) || { icon: '', count: 0, coins: 0 };
                if (g.giftIcon) it.icon = String(g.giftIcon);
                it.count += Math.max(1, Math.round(Number(g.count) || 1));
                it.coins += add;
                b.gifts.set(gname, it);
            }
            res.changed = true;
            seq++;
            const t = now();
            if (cfg.snipeOn && endsAt && endsAt - t <= cfg.snipeWindowSec * 1000 &&
                leaderId() !== before && extendCount < cfg.snipeMax) {
                endsAt += cfg.snipeAddSec * 1000;
                totalMs += cfg.snipeAddSec * 1000;
                extendCount++;
                lastExtendAt = t;
                res.extended = true;
            }
            return res;
        },
        /** Gọi đều (250 ms). Hết giờ → chuyển pha. */
        tick() {
            if (!running() || !endsAt || now() < endsAt) return { changed: false };
            afterTime();
            return { changed: true };
        },
        snapshot() {
            const r = ranked();
            return {
                phase, title, endsAt, totalMs, tieRound, tieIds: tieIds.slice(),
                extendCount, lastExtendAt,
                rows: r.slice(0, MAX_ROWS).map(pub),
                winner: pub(winner), runnerUp: pub(runnerUp),
                total: r.reduce((s, b) => s + b.coins, 0),
                bidders: r.length,
                rules: {
                    snipeOn: cfg.snipeOn, snipeWindowSec: cfg.snipeWindowSec, snipeAddSec: cfg.snipeAddSec,
                    snipeMax: cfg.snipeMax, tieSec: cfg.tieSec, tieRounds: cfg.tieRounds, minCoins: cfg.minCoins
                },
                serverNow: now(),
                seq
            };
        }
    };
}

module.exports = { DEFAULTS, normalizeCfg, createAuction, MAX_ROWS };
