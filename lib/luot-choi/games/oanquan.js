'use strict';
/**
 * 🪨 Ô Ăn Quan — trò dân gian 2 người (luật thống nhất từ nhiều nguồn, spec §2.2).
 *
 * Vòng ô (ring) 0..11: 0–4 = hàng dưới (bên 0) trái→phải màn hình, 5 = ô quan PHẢI, 6–10 = hàng trên (bên 1)
 * phải→trái màn hình, 11 = ô quan TRÁI. Đi theo +1 trên vòng = ngược chiều kim đồng hồ (nhìn từ trên xuống).
 *
 * Người chơi đánh số ô bên mình 1–5 TRÁI→PHẢI MÀN HÌNH, hướng 1 = rải sang trái màn hình, 2 = sang phải.
 * Một lượt = 2 số: chọn ô (outcome 'pending') rồi chọn hướng (outcome 'move'). Bình luận "3 2" là cả 2 bước.
 *
 * Luật: bốc hết ô → rải mỗi ô 1 (kể cả ô quan). Hết quân trong tay → xét ô kế N:
 *   N là ô dân còn quân → bốc rải tiếp · N là ô quan → mất lượt ·
 *   N trống → ô sau M có quân thì ĂN M (quan non = quan + dưới 5 dân thì không ăn, mất lượt), rồi lặp lại
 *   "trống → có quân" để ăn liên tiếp · N, M cùng trống → mất lượt.
 * Đầu lượt hết dân 5 ô bên mình → lấy 5 dân đã ăn rải lại, thiếu thì vay đối thủ (trừ lại khi tính điểm).
 * Hết ván khi 2 ô quan trống → dân còn trên bàn về bên đang giữ ô. Điểm = dân + quan × quanValue (10 hoặc 5).
 */
const MAX_STEPS = 1500;
const QUAN_R = 5, QUAN_L = 11;
const isQuanCell = (i) => i === QUAN_R || i === QUAN_L;
const ownCells = (side) => (side === 0 ? [0, 1, 2, 3, 4] : [6, 7, 8, 9, 10]);
const ringOf = (side, k) => (side === 0 ? k - 1 : 11 - k);
const screenOf = (side, i) => (side === 0 ? i + 1 : 11 - i);
const stepOf = (side, dir) => (side === 0 ? (dir === 2 ? 1 : -1) : (dir === 2 ? -1 : 1));
const wrap = (i) => ((i % 12) + 12) % 12;
const sideOf = (ctx) => (ctx && ctx.side === 1 ? 1 : 0);

/**
 * Bình luận của Ô Ăn Quan → [ô, hướng] | [ô] | [hướng] | []. Cách chính: 2 chữ số liền "52" = ô 5 rải phải
 * (ô 1–5 hàng của mình, hướng 1 = trái, 2 = phải). Nhận thêm "5 2", "5 phải", "5p", "5" rồi "phải" (có/không dấu).
 * Câu có chữ khác ("3 trái nhé") → bỏ qua.
 */
function parseComment(text) {
    const t = String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
    const dirOf = (w) => (w === 'trai' || w === 't' || w === '<' || w === '1' ? 1 : w === 'phai' || w === 'p' || w === '>' || w === '2' ? 2 : 0);
    let m = /^(trai|phai)$/.exec(t);
    if (m) return [dirOf(m[1])];
    m = /^#?([1-5])\s*(trai|phai|t|p|<|>|1|2)?$/.exec(t);
    if (!m) return [];
    return m[2] ? [Number(m[1]), dirOf(m[2])] : [Number(m[1])];
}

function normalize(c) {
    const s = c || {};
    return { quanValue: Number(s.quanValue) === 5 ? 5 : 10, quanNon: s.quanNon !== false };
}

function setup(gc) {
    const cells = [];
    for (let i = 0; i < 12; i++) cells.push({ dan: isQuanCell(i) ? 0 : 5, quan: isQuanCell(i) });
    return { cells, captured: [{ dan: 0, quan: 0 }, { dan: 0, quan: 0 }], debt: [0, 0], sel: null, over: false,
        quanNon: (gc || {}).quanNon !== false, quanValue: (gc || {}).quanValue === 5 ? 5 : 10, lastMove: null, moveSeq: 0, lastRefill: null };
}

const empty = (c) => c.dan === 0 && !c.quan;

function options(b, ctx) {
    if (b.over) return [];
    const side = sideOf(ctx);
    if (b.sel != null) return [1, 2];
    return ownCells(side).filter(i => b.cells[i].dan > 0).map(i => screenOf(side, i)).sort((a, c) => a - c);
}

// Rải từ ô `from` theo bước `step` (±1). Trả trace để overlay diễn lại từng viên.
function sow(b, side, from, step) {
    const trace = [];
    let hand = b.cells[from].dan;
    b.cells[from].dan = 0;
    trace.push({ k: 'take', i: from, n: hand });
    let pos = from, steps = 0;
    for (;;) {
        while (hand > 0) {
            pos = wrap(pos + step);
            b.cells[pos].dan++; hand--;
            trace.push({ k: 'drop', i: pos });
            if (++steps > MAX_STEPS) { trace.push({ k: 'end', why: 'limit' }); return trace; }
        }
        const n = wrap(pos + step);
        const cn = b.cells[n];
        if (isQuanCell(n) && !empty(cn)) { trace.push({ k: 'end', why: 'quan' }); return trace; }
        if (!empty(cn)) {   // ô dân còn quân → bốc rải tiếp
            hand = cn.dan; cn.dan = 0; pos = n;
            trace.push({ k: 'take', i: n, n: hand });
            continue;
        }
        // ô kế trống → xét ăn (có thể ăn liên tiếp)
        let gap = n;
        for (;;) {
            const m = wrap(gap + step), cm = b.cells[m];
            if (empty(cm)) { trace.push({ k: 'end', why: 'empty2' }); return trace; }
            if (cm.quan && b.quanNon && cm.dan < 5) { trace.push({ k: 'end', why: 'quannon' }); return trace; }
            const got = { k: 'cap', i: m, dan: cm.dan, quan: cm.quan ? 1 : 0, side };
            b.captured[side].dan += cm.dan; b.captured[side].quan += got.quan;
            cm.dan = 0; cm.quan = false;
            trace.push(got);
            const nx = wrap(m + step);
            if (!empty(b.cells[nx])) { trace.push({ k: 'end', why: 'captured' }); return trace; }
            gap = nx;
        }
    }
}

function finishIfOver(b) {
    if (!(empty(b.cells[QUAN_R]) && empty(b.cells[QUAN_L]))) return;
    for (const s of [0, 1]) for (const i of ownCells(s)) { b.captured[s].dan += b.cells[i].dan; b.cells[i].dan = 0; }
    b.over = true;
}

function pick(b, n, rng, ctx) {
    n = Number(n);
    const side = sideOf(ctx);
    if (b.over) return { ok: false, reason: 'busy' };
    if (!options(b, ctx).includes(n)) return { ok: false, reason: 'range' };
    if (b.sel == null) { b.sel = ringOf(side, n); return { ok: true, outcome: 'pending' }; }
    const from = b.sel, step = stepOf(side, n);
    b.sel = null;
    const trace = sow(b, side, from, step);
    b.lastMove = { id: ++b.moveSeq, side, from, dir: n, trace };
    finishIfOver(b);
    return { ok: true, outcome: 'move' };
}

/** Đầu lượt: hết dân 5 ô bên mình → rải lại 5 dân đã ăn (thiếu vay đối thủ). null = không cần; {over:true} = hết cờ. */
function startTurn(b, side) {
    if (b.over) return { over: true };
    const own = ownCells(side);
    if (own.some(i => b.cells[i].dan > 0)) return null;
    const mine = Math.min(5, b.captured[side].dan);
    const borrow = Math.min(5 - mine, b.captured[1 - side].dan);
    if (mine + borrow < 5) {   // không đủ 5 để rải lại → kết thúc, gom dân còn lại
        for (const s of [0, 1]) for (const i of ownCells(s)) { b.captured[s].dan += b.cells[i].dan; b.cells[i].dan = 0; }
        b.over = true;
        return { over: true };
    }
    b.captured[side].dan -= mine;
    b.captured[1 - side].dan -= borrow;
    b.debt[side] += borrow;
    own.forEach(i => { b.cells[i].dan = 1; });
    b.lastRefill = { side, borrowed: borrow, seq: b.moveSeq };
    return { refill: 5, borrowed: borrow };
}

function scores(b, gc) {
    const qv = (gc && gc.quanValue) || b.quanValue || 10;
    return [0, 1].map(s => b.captured[s].dan + b.captured[s].quan * qv - b.debt[s] + b.debt[1 - s]);
}

function view(b) {
    const row = (side) => [1, 2, 3, 4, 5].map(k => { const i = ringOf(side, k); return { n: k, ring: i, dan: b.cells[i].dan }; });
    return {
        kind: 'oanquan', rows: [row(0), row(1)],
        quanL: { dan: b.cells[QUAN_L].dan, quan: b.cells[QUAN_L].quan }, quanR: { dan: b.cells[QUAN_R].dan, quan: b.cells[QUAN_R].quan },
        cells: b.cells.map(c => ({ dan: c.dan, quan: c.quan })),
        captured: b.captured.map(c => ({ dan: c.dan, quan: c.quan })), debt: b.debt.slice(), scores: scores(b),
        sel: b.sel, selSide: b.sel == null ? null : (b.sel < 5 ? 0 : 1), over: b.over, quanValue: b.quanValue,
        lastMove: b.lastMove ? { id: b.lastMove.id, side: b.lastMove.side, from: b.lastMove.from, dir: b.lastMove.dir, trace: b.lastMove.trace.slice(0, 400) } : null,
        lastRefill: b.lastRefill
    };
}

module.exports = {
    id: 'oanquan', kind: 'score', perTurn: 2, maxSeats: 2, sizeKey: 'quanValue', name: 'Ô Ăn Quan', icon: '🪨', unit: 'ô',
    normalize, setup, options, pick, startTurn, scores, view, parseComment,
    done: (b) => b.over,
    endTurn: (b) => { b.sel = null; },   // đổi người giữa chừng (mời khỏi ghế) → bỏ ô đã chọn dở
    // trận đã có quân đi trước → giữ lượt diễn rải quân đủ lâu cho overlay (mỗi viên ~170 ms)
    holdMs: (b) => (b.lastMove ? Math.min(14000, 600 + b.lastMove.trace.length * 170) : 0),
    ringOf, stepOf, screenOf, MAX_STEPS
};
