'use strict';
/**
 * 🎧 Gọi Bài — LUẬT CHƠI THUẦN (lượt · điểm · hàng chờ). Không đụng file / mạng / socket; đồng hồ truyền vào.
 * Test: tests/goibai-logic.test.js. Spec: docs/superpowers/specs/2026-11-11-goibai-design.md §2.
 *
 * Luồng: quà mở lượt → bình luận tên bài → (server gọi yt-dlp) applySearch(items) → hàng chờ theo điểm → phát.
 *
 * Bẫy cần nhớ:
 *  - cdUntil ≠ validUntil: OBS đếm 15 s cho kịch tính, lượt thật giữ keepMin phút vì TikTok trễ 3–8 s tới người xem.
 *  - Combo quà đã gộp tới repeatEnd ở emitGift (server.js) → mỗi lần gọi addGift là MỘT lượt tặng trọn vẹn.
 *  - Bị loại (không tìm thấy / quá dài / từ cấm…) → TRẢ LƯỢT, người xem đã trả tiền thật.
 */

const { cleanSongTitle } = require('./title');

const DEFAULTS = Object.freeze({
    enabled: false,
    gifts: [],              // [{ giftId, giftName, giftImage }] — quà mở lượt
    songGifts: true,       // 🎵 quà Ca khúc TikTok tự vào hàng
    countdownSec: 15,          // đếm ngược trên OBS
    keepMin: 10,            // hạn thật của lượt (phút); 0 = bằng đếm ngược
    maxPerViewer: 1,          // số bài 1 người giữ trong hàng chờ
    maxSongSec: 420,
    lockFirst: 3,
    lockAfterSec: 8,
    waitBonus: 30,          // chống bỏ đói: điểm cộng mỗi phút chờ
    listRows: 5,               // số dòng hàng chờ trên OBS
    volume: 70,
    idleHint: true,
    hotkeySkip: '',
    hotkeyPause: ''
});

function num(v, lo, hi, dflt) {
    const n = Number(v);
    if (!Number.isFinite(n)) return dflt;
    return Math.min(hi, Math.max(lo, n));
}

function normalizeConfig(c) {
    const src = c && typeof c === 'object' ? c : {};
    const out = Object.assign({}, DEFAULTS, src);
    out.enabled = src.enabled === true;
    out.gifts = (Array.isArray(src.gifts) ? src.gifts : [])
        .filter(g => g && g.giftId != null && String(g.giftId).trim() !== '')
        .map(g => ({ giftId: String(g.giftId), giftName: String(g.giftName || ''), giftImage: String(g.giftImage || '') }));
    out.songGifts = src.songGifts !== false;
    out.countdownSec = Math.round(num(src.countdownSec, 5, 120, DEFAULTS.countdownSec));
    out.keepMin = num(src.keepMin, 0, 120, DEFAULTS.keepMin);
    out.maxPerViewer = Math.round(num(src.maxPerViewer, 1, 10, DEFAULTS.maxPerViewer));
    out.maxSongSec = Math.round(num(src.maxSongSec, 60, 3600, DEFAULTS.maxSongSec));
    out.lockFirst = Math.round(num(src.lockFirst, 0, 10, DEFAULTS.lockFirst));
    out.lockAfterSec = num(src.lockAfterSec, 0, 120, DEFAULTS.lockAfterSec);
    out.waitBonus = num(src.waitBonus, 0, 10000, DEFAULTS.waitBonus);
    out.listRows = Math.round(num(src.listRows, 1, 15, DEFAULTS.listRows));
    out.volume = Math.round(num(src.volume, 0, 100, DEFAULTS.volume));
    out.idleHint = src.idleHint !== false;
    out.hotkeySkip = String(src.hotkeySkip || '').slice(0, 40);
    out.hotkeyPause = String(src.hotkeyPause || '').slice(0, 40);
    return out;
}

const pickUser = (u) => ({
    key: String((u && u.key) || ''),
    nickname: String((u && u.nickname) || (u && u.key) || ''),
    avatar: String((u && u.avatar) || '')
});

/**
 * @param {{config?:object, now?:()=>number, isBlocked?:(title:string)=>boolean}} opts
 */
function createGoiBai(opts = {}) {
    const now = typeof opts.now === 'function' ? opts.now : Date.now;
    const isBlocked = typeof opts.isBlocked === 'function' ? opts.isBlocked : () => false;
    let cfg = normalizeConfig(opts.config);
    let passes = new Map();   // key → lượt
    let queue = [];          // hàng chờ (không gồm bài đang phát)
    let playing = null;
    let seq = 0;
    let lockSeq = 0;

    const newId = () => 'so' + now().toString(36) + '-' + (++seq);
    const holdMs = () => (cfg.keepMin > 0 ? cfg.keepMin * 60000 : cfg.countdownSec * 1000);

    function makePass(user, coins, extra) {
        const t = now();
        const g = Object.assign({ key: user.key, nickname: user.nickname, avatar: user.avatar, coins: Math.max(0, Number(coins) || 0),
            giftImage: '', createdAt: t, cdUntil: t + cfg.countdownSec * 1000, validUntil: t + Math.max(holdMs(), cfg.countdownSec * 1000), note: '' }, extra || {});
        passes.set(user.key, g);
        return g;
    }
    function refreshPass(g) {
        const t = now();
        g.cdUntil = t + cfg.countdownSec * 1000;
        g.validUntil = Math.max(g.validUntil, t + Math.max(holdMs(), cfg.countdownSec * 1000));
    }

    const ownedRows = (key) => queue.filter(r => r.key === key);

    function score(r, t) {
        return r.coins + cfg.waitBonus * Math.max(0, t - r.addedAt) / 60000;
    }
    function sorted() {
        const t = now();
        const locked = queue.filter(r => r.lockRank != null).sort((a, b) => a.lockRank - b.lockRank);
        const free = queue.filter(r => r.lockRank == null)
            .sort((a, b) => (score(b, t) - score(a, t)) || (a.addedAt - b.addedAt) || (a.n - b.n));
        return locked.concat(free);
    }

    function makeRow(user, coins, query, extra) {
        const t = now();
        const row = Object.assign({
            id: newId(), n: seq, key: user.key, nickname: user.nickname, avatar: user.avatar,
            coins: Math.max(0, Number(coins) || 0), giftImage: '', source: 'gift',
            query: String(query), title: String(query), videoId: '', channel: '', duration: 0, thumb: '',
            status: 'searching', addedAt: t, inTopAt: null, lockRank: null, backers: []
        }, extra || {});
        queue.push(row);
        return row;
    }

    function refund(row, reason) {
        queue = queue.filter(r => r !== row);
        const user = { key: row.key, nickname: row.nickname, avatar: row.avatar };
        const g = passes.get(row.key);
        if (g) { g.coins += row.coins; g.note = reason; refreshPass(g); }
        else makePass(user, row.coins, { giftImage: row.giftImage, note: reason });
        return { ok: false, reason, row };
    }

    // ── sự kiện ────────────────────────────────────────────────────────────
    function addGift(ev) {
        const user = pickUser(ev && ev.user);
        const gid = String((ev && ev.giftId) ?? '');
        // force: nút 🧪 Giả lập của panel — thử được cả khi chưa chọn quà mở lượt
        if (!user.key || (ev.force !== true && !cfg.gifts.some(g => g.giftId === gid))) return { action: 'ignored' };
        const coins = Math.max(0, Number(ev.coins) || 0);
        const g = passes.get(user.key);
        if (g) { g.coins += coins; g.note = ''; refreshPass(g); return { action: 'passAdd', pass: g }; }
        const owned = ownedRows(user.key);
        if (owned.length >= cfg.maxPerViewer) {
            const last = owned.reduce((a, b) => (b.addedAt >= a.addedAt ? b : a));
            last.coins += coins;
            return { action: 'boost', row: last };
        }
        return { action: 'pass', pass: makePass(user, coins, { giftImage: String(ev.giftImage || '') }) };
    }

    function addSongGift(ev) {
        if (!cfg.songGifts) return null;
        const user = pickUser(ev && ev.user);
        const song = String((ev && ev.song) || '').trim();
        if (!user.key || !song) return null;
        const query = [song, String(ev.artist || '').trim()].filter(Boolean).join(' ');
        return makeRow(user, ev.coins, query, { source: 'music', title: song, giftImage: String(ev.giftImage || '') });
    }

    function addComment(ev) {
        const user = pickUser(ev && ev.user);
        const g = user.key ? passes.get(user.key) : null;
        if (!g) return null;
        if (g.validUntil <= now()) { passes.delete(user.key); return null; }
        const text = String((ev && ev.text) || '').replace(/\s+/g, ' ').trim().slice(0, 100);
        if (text.length < 2 || /^\d{1,3}$/.test(text)) return null;   // cú pháp game khác: 1, 111
        passes.delete(user.key);
        return makeRow(user, g.coins, text, { giftImage: g.giftImage, source: ev.source || 'gift' });
    }

    /** Server gọi sau khi yt-dlp tìm xong. items: [{id,title,channel,duration,isLive,thumb}] */
    function applySearch(rowId, items) {
        const row = queue.find(r => r.id === rowId);
        if (!row) return { ok: false, reason: 'gone' };
        const list = Array.isArray(items) ? items : [];
        const hit = list.find(it => it && it.id && !it.isLive && Number(it.duration) > 0 && Number(it.duration) <= cfg.maxSongSec);
        if (!hit) {
            const tooLong = list.some(it => it && it.id && !it.isLive && Number(it.duration) > cfg.maxSongSec);
            return refund(row, tooLong ? 'toolong' : 'notfound');
        }
        if (isBlocked(String(hit.title || ''))) return refund(row, 'blocked');
        if (playing && playing.videoId === hit.id) return refund(row, 'playing');
        const dup = queue.find(r => r !== row && r.videoId === hit.id);
        if (dup) {
            dup.coins += row.coins;
            dup.backers.push({ key: row.key, nickname: row.nickname, avatar: row.avatar, coins: row.coins });
            queue = queue.filter(r => r !== row);
            return { ok: true, row: dup, mergedInto: dup };
        }
        row.videoId = String(hit.id);
        row.channel = String(hit.channel || '');
        row.duration = Number(hit.duration) || 0;
        row.thumb = String(hit.thumb || '');
        row.title = cleanSongTitle(hit.title, hit.channel) || row.title;
        row.status = 'ready';
        return { ok: true, row };
    }

    function rejectRow(rowId, reason) {
        const row = queue.find(r => r.id === rowId);
        if (!row) return { ok: false, reason: 'gone' };
        return refund(row, reason || 'error');
    }

    /** Mỗi giây: gỡ lượt hết hạn, khoá top N. Trả true nếu có gì đổi. */
    function tick() {
        const t = now();
        let changed = false;
        for (const [k, g] of passes) if (g.validUntil <= t) { passes.delete(k); changed = true; }
        const order = sorted();
        order.forEach((r, i) => {
            if (r.lockRank != null) return;
            if (i < cfg.lockFirst) {
                if (r.inTopAt == null) r.inTopAt = t;
                if (t - r.inTopAt >= cfg.lockAfterSec * 1000) { r.lockRank = ++lockSeq; changed = true; }
            } else if (r.inTopAt != null) r.inTopAt = null;
        });
        return changed;
    }

    function peekNext() { return sorted().find(r => r.status === 'ready') || null; }

    function beginPlay(rowId) {
        const row = queue.find(r => r.id === rowId);
        if (!row) return null;
        queue = queue.filter(r => r !== row);
        playing = Object.assign(row, { startedAt: now() });
        return playing;
    }
    function endPlay() { const p = playing; playing = null; return p; }

    function pinTop(rowId) {
        const row = queue.find(r => r.id === rowId);
        if (!row) return null;
        const min = queue.reduce((m, r) => (r.lockRank != null ? Math.min(m, r.lockRank) : m), 1);
        row.lockRank = min - 1;
        return row;
    }
    function remove(rowId) {
        const before = queue.length;
        queue = queue.filter(r => r.id !== rowId);
        return queue.length !== before;
    }
    function clear() { queue = []; passes = new Map(); playing = null; }

    function snapshot() {
        const t = now();
        return {
            playing: playing ? Object.assign({}, playing) : null,
            queue: sorted().map(r => Object.assign({}, r, { locked: r.lockRank != null, score: Math.round(score(r, t)) })),
            passes: [...passes.values()].map(g => Object.assign({}, g))
        };
    }

    function serialize() {
        return { v: 1, queue: queue.map(r => Object.assign({}, r)), passes: [...passes.values()], playing: playing ? Object.assign({}, playing) : null, seq, lockSeq };
    }
    function restore(data) {
        if (!data || typeof data !== 'object') return;
        queue = (Array.isArray(data.queue) ? data.queue : []).filter(r => r && r.id).map(r => Object.assign({ backers: [] }, r));
        passes = new Map((Array.isArray(data.passes) ? data.passes : []).filter(g => g && g.key).map(g => [g.key, Object.assign({}, g)]));
        seq = Math.max(seq, Number(data.seq) || 0);
        lockSeq = Math.max(lockSeq, Number(data.lockSeq) || 0);
        const p = data.playing;
        if (p && p.id) {
            const min = queue.reduce((m, r) => (r.lockRank != null ? Math.min(m, r.lockRank) : m), 1);
            delete p.startedAt;
            queue.push(Object.assign({ backers: [] }, p, { lockRank: min - 1 }));
        }
        playing = null;
    }

    function setConfig(c) { cfg = normalizeConfig(Object.assign({}, cfg, c || {})); }

    return {
        addGift, addSongGift, addComment, applySearch, rejectRow, tick, peekNext, beginPlay, endPlay,
        pinTop, remove, clear, snapshot, serialize, restore, setConfig,
        get config() { return cfg; },
        get playing() { return playing; },
        findRow: (id) => queue.find(r => r.id === id) || (playing && playing.id === id ? playing : null)
    };
}

module.exports = { createGoiBai, normalizeConfig, DEFAULTS };
