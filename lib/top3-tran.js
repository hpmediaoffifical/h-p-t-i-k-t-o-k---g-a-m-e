'use strict';
// 🏆 TOP 3 KẾT THÚC TRẬN — luật thuần (không I/O, đồng hồ tiêm `now`). server.js nối quà + PK + socket.
// Spec: docs/superpowers/specs/2026-11-12-daugia-top3tran-design.md
//
// Trận mở (tay hoặc theo PK thật) → mọi quà cộng xu cho người tặng → trận đóng → công bố 3 người
// góp nhiều nhất (bục vàng/bạc/đồng), tự ẩn sau holdSec. Gỡ hoà bằng bộ đếm (ai lên mức đó trước).

const MAX_BOOK = 2000;   // sổ chỉ để chọn ra 3 người — vượt trần thì cắt, giữ người điểm cao
const TRIM_TO = 1500;
const TOP_N = 3;

const DEFAULTS = Object.freeze({
    enabled: true,
    autoPk: true,         // tự mở/đóng theo PK thật (pk:state start/end)
    durationSec: 0,       // trận tay: 0 = tới khi bấm Kết thúc
    minCoins: 0,
    holdSec: 12,          // bục hiện bao lâu; 0 = tới khi bấm Ẩn
    liveBar: true,        // thanh "Top trận" nhỏ trong lúc trận đang mở
    yPercent: 30,
    barYPercent: 4,
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
        autoPk: s.autoPk !== false,
        durationSec: int(s.durationSec, 0, 0, 7200),
        minCoins: int(s.minCoins, 0, 0, 1e9),
        holdSec: int(s.holdSec, DEFAULTS.holdSec, 0, 120),
        liveBar: s.liveBar !== false,
        yPercent: int(s.yPercent, 30, 0, 90),
        barYPercent: int(s.barYPercent, 4, 0, 95),
        scale: int(s.scale, 100, 40, 200)
    };
}

const DEMO_ROWS = [
    { id: '_d1', name: 'Bảo Ngọc', avatar: '', coins: 52800 },
    { id: '_d2', name: 'Trường Giang', avatar: '', coins: 31450 },
    { id: '_d3', name: 'Khánh Vy', avatar: '', coins: 18900 }
];

function createMatchTop(opts) {
    const now = (opts && opts.now) || Date.now;
    let cfg = normalizeCfg();
    let open = false, source = '', openedAt = 0, endsAt = 0;
    let book = new Map();
    let tick = 0;
    let announce = null;
    let annSeq = 0;
    let seq = 0;

    const cmp = (a, b) => (b.coins - a.coins) || (a.reachedAt - b.reachedAt);
    const ranked = () => Array.from(book.values()).filter((r) => r.coins > 0).sort(cmp);
    const pub = (r) => ({ id: r.id, name: r.name, avatar: r.avatar, coins: r.coins });

    function doOpen(src) {
        open = true;
        source = src;
        openedAt = now();
        endsAt = src === 'manual' && cfg.durationSec > 0 ? openedAt + cfg.durationSec * 1000 : 0;
        book = new Map();
        tick = 0;
        announce = null;
        seq++;
    }

    function makeAnnounce(rows, total, demo) {
        announce = {
            seq: ++annSeq,
            at: now(),
            hideAt: cfg.holdSec > 0 ? now() + cfg.holdSec * 1000 : 0,
            rows, total, demo: !!demo
        };
    }

    function doClose() {
        if (!open) return false;
        open = false;
        source = '';
        endsAt = 0;
        seq++;
        const r = ranked();
        if (!r.length) return false;
        makeAnnounce(r.slice(0, TOP_N).map(pub), r.reduce((s, x) => s + x.coins, 0), false);
        return true;
    }

    return {
        setConfig(c) { cfg = normalizeCfg(c); seq++; return cfg; },
        getConfig() { return cfg; },
        isOpen: () => open,
        open(o) { doOpen((o && o.source) === 'pk' ? 'pk' : 'manual'); },
        close: doClose,
        hide() { if (!announce) return false; announce = null; seq++; return true; },
        reset() { open = false; source = ''; endsAt = 0; book = new Map(); tick = 0; announce = null; seq++; },
        demo() {
            makeAnnounce(DEMO_ROWS.map((r) => Object.assign({}, r)), DEMO_ROWS.reduce((s, r) => s + r.coins, 0), true);
            seq++;
        },
        /** Tín hiệu PK thật mở trận. Không cướp trận tay; gói mở báo 2 lần không xoá sổ. */
        pkStart() {
            // Trận PK trước bị kẹt mở (rớt mạng / hết LIVE giữa PK, không nhận được gói kết thúc) mà đã quá 90 s:
            // đóng trận cũ rồi mở trận mới, để PK này không cộng dồn quà của PK trước. Gói mở báo lặp (< 90 s) vẫn bỏ qua.
            if (cfg.autoPk && open && source === 'pk' && now() - openedAt > 90000) { doClose(); doOpen('pk'); return true; }
            if (!cfg.autoPk || open) return false;
            doOpen('pk');
            return true;
        },
        /** PK kết thúc: chỉ đóng trận do PK mở. */
        pkEnd() {
            if (!cfg.autoPk || !open || source !== 'pk') return false;
            doClose();
            return true;
        },
        /** g = { uniqueId, nickname, avatar, coins (đã nhân combo) } */
        gift(g) {
            const res = { changed: false };
            if (!open || !g) return res;
            const add = Math.round(Number(g.coins) || 0);
            if (!(add > 0) || add < cfg.minCoins) return res;
            const id = String(g.uniqueId || g.userId || '').trim();
            if (!id) return res;
            let r = book.get(id);
            if (!r) { r = { id, name: id, avatar: '', coins: 0, reachedAt: 0 }; book.set(id, r); }
            if (g.nickname) r.name = String(g.nickname);
            if (g.avatar) r.avatar = String(g.avatar);
            r.coins += add;
            r.reachedAt = ++tick;
            if (book.size > MAX_BOOK) {
                book = new Map(Array.from(book.values()).sort(cmp).slice(0, TRIM_TO).map((x) => [x.id, x]));
            }
            res.changed = true;
            seq++;
            return res;
        },
        /** Gọi đều (250 ms): trận hẹn giờ hết giờ → đóng; công bố quá hạn → ẩn. */
        tick() {
            const t = now();
            let changed = false;
            if (open && endsAt && t >= endsAt) { doClose(); changed = true; }
            if (announce && announce.hideAt && t >= announce.hideAt) { announce = null; seq++; changed = true; }
            return { changed };
        },
        snapshot() {
            const r = ranked();
            return {
                open, source, openedAt, endsAt,
                players: book.size,
                total: r.reduce((s, x) => s + x.coins, 0),
                top: r.slice(0, TOP_N).map(pub),
                announce: announce ? Object.assign({}, announce, { rows: announce.rows.map((x) => Object.assign({}, x)) }) : null,
                serverNow: now(),
                seq
            };
        }
    };
}

module.exports = { DEFAULTS, normalizeCfg, createMatchTop, MAX_BOOK, TRIM_TO, TOP_N };
