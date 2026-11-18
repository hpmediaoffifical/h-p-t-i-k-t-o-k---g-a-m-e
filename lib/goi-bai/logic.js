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
 *  - GĐ2 (spec §10): ⚡ đoạn hay — server đặt `playing.clip` qua setClip(); quà của người gọi bài đang phát nối dài đoạn.
 *    ⚔️ Đấu Bài — tick(ctx) mở trận giữa 2 bài ready đầu hàng TRONG LÚC bài khác đang phát; endPlay() chốt trận dở.
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
    hotkeyPause: '',
    // ⚡ đoạn hay nhất (spec §10.1)
    clipOn: true,
    clipShortSec: 45,
    clipLongSec: 90,
    clipMidCoins: 30,         // từ mốc này → clipLongSec
    clipFullCoins: 299,       // từ mốc này → cả bài
    // ⚔️ Đấu Bài (spec §10.4)
    duel: true,
    duelSec: 15,
    duelVotePts: 1,           // điểm trận mỗi phiếu (1 xu = 1 điểm)
    duelSinkAfter: 2,         // thua liên tiếp ngần này trận → về cuối hàng
    duelShowSec: 5
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
    out.clipOn = src.clipOn !== false;
    out.clipShortSec = Math.round(num(src.clipShortSec, 15, 600, DEFAULTS.clipShortSec));
    out.clipLongSec = Math.round(num(src.clipLongSec, out.clipShortSec, 1200, DEFAULTS.clipLongSec));
    out.clipMidCoins = Math.round(num(src.clipMidCoins, 1, 100000, DEFAULTS.clipMidCoins));
    out.clipFullCoins = Math.round(num(src.clipFullCoins, out.clipMidCoins, 1000000, DEFAULTS.clipFullCoins));
    out.duel = src.duel !== false;
    out.duelSec = Math.round(num(src.duelSec, 5, 60, DEFAULTS.duelSec));
    out.duelVotePts = num(src.duelVotePts, 0, 1000, DEFAULTS.duelVotePts);
    out.duelSinkAfter = Math.round(num(src.duelSinkAfter, 0, 10, DEFAULTS.duelSinkAfter));
    out.duelShowSec = Math.round(num(src.duelShowSec, 0, 30, DEFAULTS.duelShowSec));
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
    let duel = null;        // ⚔️ trận đang diễn ra { a, b (id), startedAt, endsAt, votes: Map key→'a'|'b', coins:{a,b}, forPlay }
    let lastDuel = null;    // kết quả trận vừa xong (OBS hiện duelShowSec giây)
    let duelFor = '';       // id bài đang phát đã có trận → mỗi bài phát tối đa 1 trận

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
        // bài chìm (thua Đấu Bài liên tiếp) luôn đứng sau bài chưa chìm
        const free = queue.filter(r => r.lockRank == null)
            .sort((a, b) => ((a.sunk ? 1 : 0) - (b.sunk ? 1 : 0)) || (score(b, t) - score(a, t)) || (a.addedAt - b.addedAt) || (a.n - b.n));
        return locked.concat(free);
    }

    function makeRow(user, coins, query, extra) {
        const t = now();
        const row = Object.assign({
            id: newId(), n: seq, key: user.key, nickname: user.nickname, avatar: user.avatar,
            coins: Math.max(0, Number(coins) || 0), giftImage: '', source: 'gift',
            query: String(query), title: String(query), videoId: '', channel: '', duration: 0, thumb: '',
            status: 'searching', addedAt: t, inTopAt: null, lockRank: null, backers: [], duelLosses: 0, sunk: false
        }, extra || {});
        queue.push(row);
        return row;
    }

    function addBacker(row, u, coins) {
        if (!Array.isArray(row.backers)) row.backers = [];
        if (u.key === row.key) return;
        const b = row.backers.find(x => x.key === u.key);
        if (b) b.coins += coins;
        else row.backers.push({ key: u.key, nickname: u.nickname, avatar: u.avatar, coins });
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
        if (!user.key) return { action: 'ignored' };
        const coins = Math.max(0, Number(ev.coins) || 0);
        const g = passes.get(user.key);
        const isPassGift = ev.force === true || cfg.gifts.some(x => x.giftId === gid);   // force: nút 🧪 Giả lập của panel
        if (g && isPassGift) { g.coins += coins; g.note = ''; refreshPass(g); return { action: 'passAdd', pass: g }; }
        // ⚔️ đã bầu trong trận → MỌI quà vào bài phe đó (lên điểm + đoạn phát dài hơn)
        const side = duel && duel.votes.get(user.key);
        if (side) {
            const row = queue.find(r => r.id === duel[side]);
            if (row) {
                row.coins += coins;
                addBacker(row, user, coins);
                duel.coins[side] += coins;
                return { action: 'duelGift', row, side };
            }
        }
        if (!isPassGift) return { action: 'ignored' };
        // ⚡ người gọi bài đang phát, bài mới phát 1 đoạn → nối dài
        if (cfg.clipOn && playing && playing.key === user.key && !(playing.clip && playing.clip.full)) {   // clip null = đoạn chưa chốt (đang lấy link) → vẫn nối dài
            playing.coins += coins;
            return { action: 'extend', row: playing };
        }
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
        if (text.length < 2 || /^\d{1,3}$/.test(text) || /^#\d+/.test(text) || /^#?\d+(\s+#?\d+)+$/.test(text)) return null;   // cú pháp game khác: 1, 111, #4823, "4823 5120" — 1 số 4+ chữ vẫn là tên bài được ("2002", "1989")
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
        if (playing && playing.videoId === hit.id) {
            // ⚡ bài đang phát mới là 1 đoạn → góp xu nối dài; đã cả bài → trả lượt
            if (!(cfg.clipOn && !(playing.clip && playing.clip.full))) return refund(row, 'playing');   // clip null = đoạn chưa chốt → vẫn góp xu
            playing.coins += row.coins;
            addBacker(playing, row, row.coins);
            queue = queue.filter(r => r !== row);
            return { ok: true, row: playing, mergedInto: playing, extended: true };
        }
        const dup = queue.find(r => r !== row && r.videoId === hit.id);
        if (dup) {
            dup.coins += row.coins;
            addBacker(dup, row, row.coins);
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

    /**
     * Mỗi giây: gỡ lượt hết hạn, khoá top N, ⚔️ mở/chốt Đấu Bài. Trả true nếu có gì đổi.
     * @param {{remainSec?:number|null, paused?:boolean}} [ctx] giây còn lại của đoạn đang phát (server biết vị trí phát)
     */
    function tick(ctx) {
        const t = now();
        let changed = duelStep(ctx || {});
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

    // ── ⚔️ Đấu Bài ─────────────────────────────────────────────────────────
    const readyRows = () => sorted().filter(r => r.status === 'ready');
    function duelValid() {
        if (!duel) return false;
        const a = queue.find(r => r.id === duel.a), b = queue.find(r => r.id === duel.b);
        return !!(a && b && a.status === 'ready' && b.status === 'ready');
    }
    function cancelDuel() { const had = !!duel; duel = null; return had; }
    function duelStep(ctx) {
        if (duel) {
            if (!cfg.duel || !duelValid()) return cancelDuel();
            if (now() >= duel.endsAt) { resolveDuel(); return true; }
            return false;
        }
        if (!cfg.duel || !playing || ctx.paused || duelFor === playing.id) return false;
        if (!(Number(ctx.remainSec) >= cfg.duelSec + 5)) return false;
        const r = readyRows();
        if (r.length < 2) return false;
        const t = now();
        duel = { id: 'd' + t.toString(36), a: r[0].id, b: r[1].id, startedAt: t, endsAt: t + cfg.duelSec * 1000,
            votes: new Map(), coins: { a: 0, b: 0 }, forPlay: playing.id };
        duelFor = playing.id;
        return true;
    }
    const duelVotes = (side) => { let n = 0; for (const v of duel.votes.values()) if (v === side) n++; return n; };
    const duelPts = (side) => duelVotes(side) * cfg.duelVotePts + duel.coins[side];
    function resolveDuel() {
        if (!duel) return null;
        if (!duelValid()) { cancelDuel(); return null; }
        const pa = duelPts('a'), pb = duelPts('b');
        const win = pb > pa ? 'b' : 'a', lose = win === 'a' ? 'b' : 'a';   // hoà → A (đang đứng trước) thắng
        const w = queue.find(r => r.id === duel[win]), l = queue.find(r => r.id === duel[lose]);
        pinTop(w.id);
        w.duelLosses = 0;
        l.duelLosses = (Number(l.duelLosses) || 0) + 1;
        let sunk = false;
        if (cfg.duelSinkAfter > 0 && l.duelLosses >= cfg.duelSinkAfter) {
            Object.assign(l, { sunk: true, lockRank: null, inTopAt: null, addedAt: now() });   // điểm chờ tính lại từ lúc chìm
            sunk = true;
        }
        lastDuel = { winnerId: w.id, loserId: l.id, winnerTitle: w.title, loserTitle: l.title, winnerSide: win,
            pts: { a: pa, b: pb }, sunk, at: now() };
        duel = null;
        return lastDuel;
    }
    /** Bình luận đúng "1" / "2" trong lúc có trận → 1 phiếu/người, không đổi phe. */
    function duelVote(ev) {
        if (!duel) return null;
        const text = String((ev && ev.text) || '').trim();
        if (text !== '1' && text !== '2') return null;
        const user = pickUser(ev && ev.user);
        if (!user.key) return null;
        if (duel.votes.has(user.key)) return { ok: false, reason: 'voted', side: duel.votes.get(user.key) };
        const side = text === '1' ? 'a' : 'b';
        duel.votes.set(user.key, side);
        return { ok: true, side };
    }
    function duelPublic() {
        if (!duel || !duelValid()) return null;
        const side = (k) => {
            const r = queue.find(x => x.id === duel[k]);
            return { id: r.id, title: r.title, thumb: r.thumb, nickname: r.nickname, avatar: r.avatar, coins: r.coins,
                votes: duelVotes(k), giftCoins: duel.coins[k], pts: duelPts(k) };
        };
        return { id: duel.id, a: side('a'), b: side('b'), startedAt: duel.startedAt, endsAt: duel.endsAt, sec: cfg.duelSec };
    }

    function peekNext() { return sorted().find(r => r.status === 'ready') || null; }

    function beginPlay(rowId) {
        const row = queue.find(r => r.id === rowId);
        if (!row) return null;
        if (duel && (duel.a === row.id || duel.b === row.id)) cancelDuel();
        queue = queue.filter(r => r !== row);
        playing = Object.assign(row, { startedAt: now(), sunk: false });
        return playing;
    }
    /** Bài đang phát xong (hết / bỏ / lỗi). Trận dở được chốt luôn với số đang có. */
    function endPlay() { if (duel) resolveDuel(); const p = playing; playing = null; return p; }
    /** Bài vừa vào phát mà không phát được (video bị chặn / giới hạn tuổi…) → kết thúc + TRẢ LƯỢT cho người gọi. */
    function refundPlaying(reason) { const p = endPlay(); return p ? refund(p, reason || 'error') : null; }
    function setClip(rowId, clip) {
        if (!playing || playing.id !== rowId) return null;
        playing.clip = clip ? Object.assign({}, clip) : null;
        return playing;
    }

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
        if (duel && !duelValid()) cancelDuel();
        return queue.length !== before;
    }
    function clear() { queue = []; passes = new Map(); playing = null; duel = null; lastDuel = null; duelFor = ''; }

    function snapshot() {
        const t = now();
        return {
            playing: playing ? Object.assign({}, playing) : null,
            queue: sorted().map(r => Object.assign({}, r, { locked: r.lockRank != null, score: Math.round(score(r, t)) })),
            passes: [...passes.values()].map(g => Object.assign({}, g)),
            duel: duelPublic(),
            lastDuel: lastDuel && t - lastDuel.at < cfg.duelShowSec * 1000 ? Object.assign({}, lastDuel) : null
        };
    }

    function serialize() {
        return { v: 1, queue: queue.map(r => Object.assign({}, r)), passes: [...passes.values()], playing: playing ? Object.assign({}, playing) : null, seq, lockSeq };
    }
    function restore(data) {
        if (!data || typeof data !== 'object') return;
        queue = (Array.isArray(data.queue) ? data.queue : []).filter(r => r && r.id).map(r => Object.assign({ backers: [], duelLosses: 0, sunk: false }, r));
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

    function setConfig(c) { cfg = normalizeConfig(Object.assign({}, cfg, c || {})); if (!cfg.duel) cancelDuel(); }

    return {
        addGift, addSongGift, addComment, applySearch, rejectRow, tick, peekNext, beginPlay, endPlay, refundPlaying,
        pinTop, remove, clear, snapshot, serialize, restore, setConfig, setClip, duelVote, resolveDuel,
        get config() { return cfg; },
        get playing() { return playing; },
        get duelActive() { return !!duel; },
        findRow: (id) => queue.find(r => r.id === id) || (playing && playing.id === id ? playing : null)
    };
}

module.exports = { createGoiBai, normalizeConfig, DEFAULTS };
