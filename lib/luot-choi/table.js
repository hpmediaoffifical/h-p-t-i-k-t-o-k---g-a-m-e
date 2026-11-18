'use strict';
/**
 * 🎲 Bộ Đấu Trường Mini — KHUNG GHẾ + LƯỢT (luật thuần, đồng hồ + rng truyền vào, không I/O).
 * Test: tests/luotchoi-table.test.js. Spec: docs/superpowers/specs/2026-11-12-luotchoi-design.md §2–3.
 *
 * Pha: lobby (ngồi ghế, đếm ngược) → playing (lượt) → result (vinh danh) → lobby (hàng chờ vào ghế).
 * Trong lúc `holdUntil` (hiệu ứng ấn răng / úp ô / ném thùng rác) không nhận bình luận, đồng hồ lượt đứng.
 *
 * Bẫy cần nhớ:
 *  - Combo quà đã gộp ở emitGift (server.js) → mỗi addGift là MỘT lần tặng.
 *  - Mỗi ván người chơi phải tặng lại để ngồi; người trong hàng chờ vào trước theo thứ tự tặng.
 *  - Người vừa bị loại được "người đi trước" (người còn sống ngay trước trong vòng) ném vào thùng rác.
 */
const { GAMES_BY_ID } = require('./games');
const { clampInt, randInt } = require('./games/util');

// Khoá ghế Chủ LIVE: '#' không có trong TikTok uniqueId → người xem không mạo danh được; quà/bình luận mang khoá này bị bỏ.
const HOST_KEY = '#host';
const FULL_START_MS = 3000;     // đủ ghế → chạy sau 3 s
// Nhịp hồi hộp: overlay cho tay bay vào ô vừa chọn rồi mới lộ kết quả (event.t + SUSPENSE_MS). Mọi khoảng giữ
// sau một lượt chọn đều cộng thêm khoảng này để người xem kịp thấy kết quả trước khi tới lượt kế.
const SUSPENSE_MS = 800;
const SAFE_HOLD_MS = 900 + SUSPENSE_MS;       // hiệu ứng ấn răng / cắm que / rút thanh
const TRAP_HOLD_MS = 2800 + SUSPENSE_MS;      // hà mã ngoạm / cóc nhảy / tháp đổ + ném thùng rác
const SHIELD_HOLD_MS = 2000 + SUSPENSE_MS;
const MAX_SHIELDS = 3;
const MAX_EVENTS = 24;

const DEFAULTS = Object.freeze({
    enabled: false,
    game: 'hama',
    seats: 4, minPlayers: 2,
    lobbySec: 20, turnSec: 20, resultSec: 8, revealMs: 1800,
    maxQueue: 10,
    seatGifts: [], shieldGifts: [],
    hostName: 'Chủ LIVE',
    voice: true, voiceVolume: 80,   // giọng đọc trên overlay: "Tới lượt …", "… chọn số 7", "… dính bẫy!"
    teeth: 10, holes: 16, levels: 9, pairs: 8
});

const giftList = (a) => (Array.isArray(a) ? a : [])
    .filter(g => g && g.giftId != null && String(g.giftId).trim() !== '')
    .map(g => ({ giftId: String(g.giftId), giftName: String(g.giftName || ''), giftImage: String(g.giftImage || '') }));

function normalizeConfig(c) {
    const s = c && typeof c === 'object' ? c : {};
    const out = Object.assign({}, DEFAULTS, s);
    out.enabled = s.enabled === true;
    out.game = GAMES_BY_ID[s.game] ? s.game : DEFAULTS.game;
    out.seats = clampInt(s.seats, 2, 4, DEFAULTS.seats);
    out.minPlayers = clampInt(s.minPlayers, 2, out.seats, Math.min(DEFAULTS.minPlayers, out.seats));
    out.lobbySec = clampInt(s.lobbySec, 5, 120, DEFAULTS.lobbySec);
    out.turnSec = clampInt(s.turnSec, 8, 60, DEFAULTS.turnSec);
    out.resultSec = clampInt(s.resultSec, 3, 30, DEFAULTS.resultSec);
    out.revealMs = clampInt(s.revealMs, 600, 5000, DEFAULTS.revealMs);
    out.maxQueue = clampInt(s.maxQueue, 0, 30, DEFAULTS.maxQueue);
    out.seatGifts = giftList(s.seatGifts);
    out.shieldGifts = giftList(s.shieldGifts);
    out.voice = s.voice !== false;
    out.voiceVolume = clampInt(s.voiceVolume, 0, 100, DEFAULTS.voiceVolume);
    out.hostName = String(s.hostName || DEFAULTS.hostName).trim().slice(0, 30) || DEFAULTS.hostName;
    for (const G of Object.values(GAMES_BY_ID)) Object.assign(out, G.normalize(s));
    return out;
}

/** Bình luận CHỈ gồm 1–2 số (có thể có # và dấu cách/phẩy/gạch ở giữa) → mảng số; còn lại → []. */
function parseNumbers(text) {
    const m = /^\s*#?(\d{1,3})(?:\s*[\s,.\-/+]\s*#?(\d{1,3}))?\s*$/.exec(String(text || ''));
    if (!m) return [];
    return m[2] != null ? [Number(m[1]), Number(m[2])] : [Number(m[1])];
}

const pickUser = (x) => ({ key: String((x && x.key) || ''), nickname: String((x && (x.nickname || x.key)) || '').slice(0, 40), avatar: String((x && x.avatar) || '') });

function createTable(opts = {}) {
    const now = typeof opts.now === 'function' ? opts.now : Date.now;
    const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
    let cfg = normalizeConfig(opts.config);

    let phase = 'lobby';
    let seats = [];            // { key, nickname, avatar, host, shields, out, score, outOrder }
    let queue = [];
    let lobbyUntil = 0, turnUntil = 0, holdUntil = 0, resultUntil = 0;
    let turn = -1;
    let board = null, gameId = cfg.game;
    let boardSeq = 0;          // tăng mỗi lần dựng bàn → overlay 3D biết dựng lại cảnh
    let marks = [];            // nhãn tên trên ô đã chọn của bàn hiện tại: { n, key, nickname, avatar }
    let after = null;          // việc chạy khi hết holdUntil
    let result = null;
    let outCount = 0;
    let champs = new Map();    // key → { key, nickname, avatar, wins }
    let events = [], evSeq = 0;

    const G = () => GAMES_BY_ID[gameId];
    const gcfg = () => G().normalize(cfg);
    const emit = (type, data) => { events.push(Object.assign({ seq: ++evSeq, t: now(), type }, data || {})); if (events.length > MAX_EVENTS) events.shift(); };
    // số ghế thật = min(cấu hình, giới hạn của trò) — Ô Ăn Quan chỉ 2 người
    const capSeats = () => Math.min(cfg.seats, GAMES_BY_ID[phase === 'lobby' ? cfg.game : gameId].maxSeats || 4);
    const minNeed = () => Math.min(cfg.minPlayers, capSeats());
    const ctx = () => ({ side: turn });   // trò cần biết lượt của bên nào (Ô Ăn Quan: ghế 0 = hàng dưới)
    const seatOf = (key) => seats.find(s => s.key === key);
    const alive = () => seats.filter(s => !s.out);
    const giftIn = (list, id) => list.some(g => g.giftId === String(id));
    const pub = (s) => s && { key: s.key, nickname: s.nickname, avatar: s.avatar };

    function makeSeat(user, host) {
        return Object.assign(pickUser(user), { host: !!host, shields: 0, out: false, score: 0, outOrder: 0 });
    }

    // ── sảnh ───────────────────────────────────────────────────────────────
    function syncLobby() {
        if (phase !== 'lobby') return;
        if (seats.length < minNeed()) { lobbyUntil = 0; return; }
        const t = now();
        if (!lobbyUntil) lobbyUntil = t + cfg.lobbySec * 1000;
        if (seats.length >= capSeats()) lobbyUntil = Math.min(lobbyUntil, t + FULL_START_MS);
    }
    function fillFromQueue() {
        while (seats.length < capSeats() && queue.length) {
            const q = queue.shift();
            seats.push(makeSeat(q, q.key === HOST_KEY));
            emit('seat', { key: q.key, nickname: q.nickname, fromQueue: true });
        }
    }
    function toLobby(keepSeats) {
        phase = 'lobby';
        board = null; marks = []; after = null; result = null; turn = -1;
        holdUntil = turnUntil = resultUntil = lobbyUntil = 0;
        if (keepSeats) seats = seats.filter(s => !s.kicked).map(s => Object.assign(s, { out: false, score: 0, outOrder: 0 }));
        else seats = [];
        fillFromQueue();
        syncLobby();
    }

    // ── ván ────────────────────────────────────────────────────────────────
    function start() {
        if (phase !== 'lobby' || seats.length < 2) return { ok: false, reason: 'players' };
        gameId = cfg.game;
        board = G().setup(gcfg(), rng); marks = []; boardSeq++;
        phase = 'playing';
        outCount = 0;
        seats.forEach(s => { s.out = false; s.score = 0; s.outOrder = 0; });
        lobbyUntil = 0;
        turn = 0;
        emit('start', { game: gameId, players: seats.map(pub) });
        beginTurn();
        return { ok: true };
    }
    function beginTurn() {
        holdUntil = 0; after = null;
        // Ô Ăn Quan: hết dân bên mình → rải lại 5 dân đã ăn / vay; hết hẳn quân → hết ván
        if (board && G().startTurn) {
            const ev = G().startTurn(board, turn);
            syncScores();
            if (ev && ev.over) return finish();
            if (ev && ev.refill) emit('refill', { key: seats[turn].key, nickname: seats[turn].nickname, borrowed: ev.borrowed });
        }
        turnUntil = now() + cfg.turnSec * 1000;
        emit('turn', { key: seats[turn] && seats[turn].key });
    }
    function syncScores() { if (board && G().scores) { const sc = G().scores(board, gcfg()); seats.forEach((s, i) => { s.score = sc[i] ?? s.score; }); } }
    function nextAliveFrom(i) {
        for (let k = 1; k <= seats.length; k++) { const j = (i + k) % seats.length; if (!seats[j].out) return j; }
        return -1;
    }
    function prevAliveFrom(i) {
        for (let k = 1; k <= seats.length; k++) { const j = (i - k + seats.length * 2) % seats.length; if (!seats[j].out && j !== i) return j; }
        return -1;
    }
    function hold(ms, fn) { holdUntil = now() + ms; after = fn; turnUntil = 0; }
    function keepMarks() { if (board && G().marked) marks = marks.filter(m => G().marked(board, m.n)); }
    function passTurn() { if (board && G().endTurn) { G().endTurn(board); keepMarks(); } turn = nextAliveFrom(turn); beginTurn(); }

    function eliminate(idx, info) {
        const s = seats[idx];
        s.out = true; s.outOrder = ++outCount;
        const by = info && info.kicked ? null : seats[prevAliveFrom(idx)];
        emit('out', { key: s.key, nickname: s.nickname, byKey: by ? by.key : '', byNickname: by ? by.nickname : '', kicked: !!(info && info.kicked) });
    }

    function finish() {
        const g = G();
        let winners, losers, draw = false;
        if (g.kind === 'score') {
            const inGame = seats.filter(s => !s.kicked);
            const max = Math.max(...inGame.map(s => s.score));
            const min = Math.min(...inGame.map(s => s.score));
            if (inGame.length < 2 || max === min) { winners = inGame.length === 1 ? inGame : []; losers = []; draw = inGame.length !== 1; }
            else { winners = inGame.filter(s => s.score === max); losers = inGame.filter(s => s.score === min); }
        } else {
            winners = alive();
            losers = seats.filter(s => s.out && !s.kicked).sort((a, b) => a.outOrder - b.outOrder);
        }
        for (const w of winners) {
            const c = champs.get(w.key) || { key: w.key, nickname: w.nickname, avatar: w.avatar, wins: 0 };
            c.wins++; c.nickname = w.nickname; c.avatar = w.avatar || c.avatar;
            champs.set(w.key, c);
        }
        result = { winners: winners.map(s => Object.assign(pub(s), { score: s.score })), losers: losers.map(s => Object.assign(pub(s), { score: s.score })), draw };
        emit(draw ? 'draw' : 'win', { winners: result.winners, losers: result.losers });
        phase = 'result';
        holdUntil = turnUntil = 0; after = null;
        resultUntil = now() + cfg.resultSec * 1000;
    }

    function afterOut() {
        if (alive().length <= 1) return finish();
        board = G().setup(gcfg(), rng); marks = []; boardSeq++;   // bàn mới, bẫy mới cho người còn lại
        emit('rebuild', {});
        passTurn();
    }

    function applyPick(n, auto) {
        const g = G();
        const s = seats[turn];
        const r = g.pick(board, n, rng, ctx());
        if (!r.ok) return false;
        marks = marks.filter(m => m.n !== n).concat([{ n, key: s.key, nickname: s.nickname, avatar: s.avatar }]);
        emit('pick', { key: s.key, nickname: s.nickname, avatar: s.avatar, n, auto: !!auto, outcome: r.outcome });
        switch (r.outcome) {
            case 'pending': break;
            case 'move':   // Ô Ăn Quan: 1 nước rải trọn → giữ đủ lâu cho overlay diễn từng viên
                syncScores();
                emit('move', { key: s.key, nickname: s.nickname, scores: seats.map(q => q.score) });
                hold((g.holdMs ? g.holdMs(board) : 0) + SUSPENSE_MS, () => (g.done(board) ? finish() : passTurn()));
                break;
            case 'safe': hold(SAFE_HOLD_MS, passTurn); break;
            case 'match':
                s.score++;
                emit('match', { key: s.key, score: s.score });
                hold(Math.round(cfg.revealMs * 0.6) + SUSPENSE_MS, () => (g.done(board) ? finish() : beginTurn()));
                break;
            case 'miss':
                emit('miss', { key: s.key });
                hold(cfg.revealMs + SUSPENSE_MS, () => { g.settle(board); keepMarks(); passTurn(); });
                break;
            case 'trap':
                if (s.shields > 0) {
                    s.shields--;
                    emit('shield', { key: s.key, nickname: s.nickname, left: s.shields });
                    hold(SHIELD_HOLD_MS, () => {
                        g.save(board, n, rng);
                        if (!g.options(board, ctx()).length) { board = g.setup(gcfg(), rng); marks = []; boardSeq++; emit('rebuild', {}); }
                        passTurn();
                    });
                } else {
                    const idx = turn;
                    eliminate(idx);
                    hold(TRAP_HOLD_MS, afterOut);
                }
                break;
        }
        return true;
    }

    function autoPick() {
        const g = G();
        let guard = 0;
        do {
            const opts = g.options(board, ctx());
            if (!opts.length) break;
            applyPick(opts[randInt(rng, opts.length)], true);
        } while (phase === 'playing' && !holdUntil && ++guard < 3);
    }

    function pickBy(key, nums) {
        if (phase !== 'playing' || holdUntil || !board) return false;
        const s = seats[turn];
        if (!s || s.key !== key || s.out) return false;
        const want = G().perTurn;
        let any = false;
        for (const n of nums.slice(0, want)) {
            if (phase !== 'playing' || holdUntil || seats[turn] !== s) break;
            if (!applyPick(n, false)) break;
            any = true;
        }
        return any;
    }

    // ── API ────────────────────────────────────────────────────────────────
    function addGift({ user, giftId, as } = {}) {   // as: 'seat'|'shield' = quà thử từ panel (bỏ kiểm giftId)
        if (!cfg.enabled) return { action: 'ignored' };
        const usr = pickUser(user);
        if (!usr.key || usr.key === HOST_KEY) return { action: 'ignored' };
        const isSeat = as ? as === 'seat' : giftIn(cfg.seatGifts, giftId);
        const isShield = as ? as === 'shield' : giftIn(cfg.shieldGifts, giftId);
        if (!isSeat && !isShield) return { action: 'ignored' };
        const s = seatOf(usr.key);
        const seated = s && !s.out && phase !== 'result';
        if (isShield && seated && G().kind === 'trap') {
            if (s.shields >= MAX_SHIELDS) return { action: 'ignored' };
            s.shields++;
            emit('shieldAdd', { key: s.key, nickname: s.nickname, shields: s.shields });
            return { action: 'shield' };
        }
        if (!isSeat) return { action: 'ignored' };
        return join(usr, false);
    }
    function join(usr, host) {
        const s = seatOf(usr.key);
        if (s && !s.out && phase !== 'result') return { action: 'ignored' };
        if (queue.some(q => q.key === usr.key)) return { action: 'ignored' };
        if (phase === 'lobby' && seats.length < capSeats()) {
            seats.push(makeSeat(usr, host));
            emit('seat', { key: usr.key, nickname: usr.nickname });
            syncLobby();
            return { action: 'seat' };
        }
        if (host) { queue.unshift(usr); emit('queue', { key: usr.key, nickname: usr.nickname }); return { action: 'queue' }; }
        if (queue.length >= cfg.maxQueue) return { action: 'full' };
        queue.push(usr);
        emit('queue', { key: usr.key, nickname: usr.nickname });
        return { action: 'queue' };
    }
    function hostJoin() {
        if (!cfg.enabled) return { action: 'ignored' };
        return join({ key: HOST_KEY, nickname: cfg.hostName, avatar: '' }, true);
    }
    function kick(key) {
        key = String(key || '');
        queue = queue.filter(q => q.key !== key);
        const idx = seats.findIndex(s => s.key === key);
        if (idx < 0) return { ok: false };
        if (phase === 'lobby') { seats.splice(idx, 1); syncLobby(); return { ok: true }; }
        const s = seats[idx];
        if (phase !== 'playing' || s.out) return { ok: false };
        s.kicked = true;
        eliminate(idx, { kicked: true });
        if (alive().length <= 1) hold(600, finish);
        else if (idx === turn) hold(600, passTurn);
        return { ok: true };
    }
    function comment({ user, text } = {}) {
        if (!cfg.enabled || phase !== 'playing') return false;
        const nums = parseNumbers(text);
        const key = String((user && user.key) || '');
        if (!nums.length || !key || key === HOST_KEY) return false;
        return pickBy(key, nums);
    }
    function hostPick(n) { return pickBy(HOST_KEY, [Number(n)]); }

    function tick() {
        const t = now();
        if (phase === 'lobby') {
            syncLobby();
            if (lobbyUntil && t >= lobbyUntil) start();
        } else if (phase === 'playing') {
            if (holdUntil) { if (t >= holdUntil) { const fn = after; holdUntil = 0; after = null; if (fn) fn(); } }
            else if (turnUntil && t >= turnUntil) autoPick();
        } else if (phase === 'result') {
            if (t >= resultUntil) toLobby(false);
        }
    }

    function setConfig(c) {
        const prevGame = cfg.game;
        cfg = normalizeConfig(c);
        if (!cfg.enabled) { clearRound(); return; }
        if (cfg.game !== prevGame && phase !== 'lobby') toLobby(true);
        if (phase === 'lobby') {
            gameId = cfg.game;
            while (seats.length > capSeats()) queue.unshift(seats.pop());
            syncLobby();
        }
    }
    function cancel() {
        if (phase === 'lobby') return { ok: false };
        emit('cancel', {});
        toLobby(true);
        return { ok: true };
    }
    function clearRound() {   // tắt game: bỏ ván + ghế + hàng chờ (giữ bảng vô địch)
        seats = []; queue = [];
        toLobby(false);
    }
    function clear() { clearRound(); champs = new Map(); events = []; }

    function snapshot() {
        const g = GAMES_BY_ID[phase === 'lobby' ? cfg.game : gameId];
        const cur = phase === 'playing' ? seats[turn] : null;
        return {
            phase, now: now(),
            game: { id: g.id, name: g.name, icon: g.icon, unit: g.unit, kind: g.kind, perTurn: g.perTurn },
            seats: seats.map((s, i) => ({ key: s.key, nickname: s.nickname, avatar: s.avatar, host: s.host, shields: s.shields, out: s.out, score: s.score, turn: phase === 'playing' && i === turn })),
            turnKey: cur ? cur.key : '', turnUntil, holdUntil, lobbyUntil, resultUntil,
            queue: queue.map(q => ({ key: q.key, nickname: q.nickname, avatar: q.avatar })),
            board: board ? g.view(board) : null,
            boardId: boardSeq,
            marks: marks.map(m => Object.assign({}, m)),
            preview: board ? null : g.view(g.setup(g.normalize(cfg), () => 0.5)),   // sảnh: bàn mẫu (bẫy không lộ)
            options: phase === 'playing' && !holdUntil && board ? g.options(board, ctx()) : [],
            result,
            champs: [...champs.values()].sort((a, b) => b.wins - a.wins).slice(0, 5).map(c => Object.assign({}, c)),
            events: events.slice(),
            cfg: { enabled: cfg.enabled, seats: capSeats(), minPlayers: minNeed(), turnSec: cfg.turnSec, lobbySec: cfg.lobbySec,
                seatGifts: cfg.seatGifts, shieldGifts: cfg.shieldGifts, hostName: cfg.hostName,
                voice: cfg.voice, voiceVolume: cfg.voiceVolume }
        };
    }

    return { setConfig, addGift, hostJoin, kick, startNow: start, cancel, comment, hostPick, tick, snapshot, clear,
        get config() { return cfg; }, _board: () => board };
}

module.exports = { createTable, normalizeConfig, parseNumbers, DEFAULTS, HOST_KEY, SUSPENSE_MS };
