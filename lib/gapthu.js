'use strict';
/**
 * 🕹️ Gắp Thú — luật THUẦN (spec docs/superpowers/specs/2026-11-12-gapthu-xucxac-design.md §3.1).
 * Server gọi rollGrab() mỗi lượt rồi phát kết quả; overlay chỉ diễn theo kết quả nhận được.
 */

const THEMES = ['pink', 'mint', 'night'];
const MAX_PRIZES = 12;

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

function defaultPrizes() {
    return [
        { id: 'p1', name: 'Gấu bông', icon: '🧸', weight: 3 },
        { id: 'p2', name: 'Hát 1 câu', icon: '🎤', weight: 2 },
        { id: 'p3', name: 'Hít đất 10 cái', icon: '💪', weight: 2 },
        { id: 'p4', name: 'Nhảy 15 giây', icon: '💃', weight: 2 },
        { id: 'p5', name: 'Gọi tên cảm ơn', icon: '📢', weight: 3 },
        { id: 'p6', name: 'Chúc may mắn', icon: '🍀', weight: 3 }
    ];
}

const DANCE_ID = '__dance';
const DANCE_TEXT = '{name} gắp trúng! Streamer nhảy ngay!';
function defaultDance() {
    return { enabled: true, pct: 6, sec: 30, cooldownSec: 120, text: DANCE_TEXT, sound: true, image: '' };
}
const DANCE_PRIZE = Object.freeze({ id: DANCE_ID, name: 'Streamer nhảy', icon: '💃', dance: true });

function defaultConfig() {
    return {
        enabled: true,
        winRate: 35,        // % gắp trúng mỗi lượt
        pity: 5,            // trượt liên tiếp đủ số này → lượt sau chắc trúng (0 = tắt)
        turnSec: 4,         // 3–5 giây / lượt (hàng chờ dài tự nhanh hơn)
        anyGift: true,      // quà không gán = 1 lượt
        steerMinCoins: 99,  // quà ≥ ngần này xu / 1 món → lượt TỰ LÁI cho người tặng (0 = tắt)
        steerSec: 15,       // giây tự lái tối đa, hết giờ tự gắp tại chỗ
        steerSteps: 8,      // ngân sách bước mỗi lượt tự lái
        steerBonus: 15,     // % lực kẹp cộng thêm khi kẹp đúng ô dưới càng (phần thưởng kỹ năng)
        dance: defaultDance(),   // 💃 giải "Streamer nhảy" (spec §3.4)
        gifts: [],          // [{ giftId, giftName, giftImage, turns, sure }]
        prizes: defaultPrizes(),
        sound: { enabled: true, volume: 0.6 },
        display: { x: 50, y: 55, scale: 100, theme: 'pink', showQueue: true }
    };
}

function normalizeConfig(c) {
    const d = defaultConfig();
    if (!c || typeof c !== 'object') return d;
    const out = { ...d, ...c };
    out.enabled = c.enabled !== false;
    out.anyGift = c.anyGift !== false;
    out.winRate = clamp(Math.round(num(c.winRate, d.winRate)), 0, 100);
    out.pity = clamp(Math.round(num(c.pity, d.pity)), 0, 50);
    out.turnSec = clamp(num(c.turnSec, d.turnSec), 3, 5);
    out.steerMinCoins = clamp(Math.round(num(c.steerMinCoins, d.steerMinCoins)), 0, 100000);
    out.steerSec = clamp(Math.round(num(c.steerSec, d.steerSec)), 8, 30);
    out.steerSteps = clamp(Math.round(num(c.steerSteps, d.steerSteps)), 3, 20);
    out.steerBonus = clamp(Math.round(num(c.steerBonus, d.steerBonus)), 0, 50);
    let seq = 0;
    out.prizes = (Array.isArray(c.prizes) ? c.prizes : d.prizes)
        .filter(p => p && str(p.name, 40))
        .slice(0, MAX_PRIZES)
        .map(p => ({
            id: str(p.id, 24) || ('p' + Date.now().toString(36) + (seq++)),
            name: str(p.name, 40),
            icon: str(p.icon, 8) || '🎁',
            weight: clamp(num(p.weight, 1), 0, 1000)
        }));
    out.gifts = (Array.isArray(c.gifts) ? c.gifts : [])
        .filter(g => g && str(g.giftId, 40))
        .map(g => ({
            giftId: str(g.giftId, 40),
            giftName: str(g.giftName, 60),
            giftImage: str(g.giftImage, 500),
            turns: clamp(Math.round(num(g.turns, 1)), 1, 10),
            sure: !!g.sure
        }));
    const dn = c.dance && typeof c.dance === 'object' ? c.dance : {}, dd = defaultDance();
    out.dance = {
        enabled: dn.enabled !== false,
        pct: clamp(num(dn.pct, dd.pct), 0, 30),
        sec: clamp(Math.round(num(dn.sec, dd.sec)), 5, 120),
        cooldownSec: clamp(Math.round(num(dn.cooldownSec, dd.cooldownSec)), 0, 3600),
        text: str(dn.text, 80) || dd.text,
        sound: dn.sound !== false,
        // chỉ nhận ảnh do server lưu (route riêng) — không cho chèn URL/giao thức lạ vào overlay
        image: /^\/api\/gapthu\/dance-image(\?v=\w+)?$/.test(String(dn.image || '')) ? String(dn.image) : ''
    };
    const s = c.sound && typeof c.sound === 'object' ? c.sound : {};
    out.sound = { enabled: s.enabled !== false, volume: clamp(num(s.volume, d.sound.volume), 0, 1) };
    const disp = c.display && typeof c.display === 'object' ? c.display : {};
    out.display = {
        x: clamp(num(disp.x, d.display.x), 0, 100),
        y: clamp(num(disp.y, d.display.y), 0, 100),
        scale: clamp(num(disp.scale, d.display.scale), 30, 200),
        theme: THEMES.includes(disp.theme) ? disp.theme : d.display.theme,
        showQueue: disp.showQueue !== false
    };
    return out;
}

/** Chọn 1 giải theo trọng số (weight 0 bị bỏ). Không còn giải → null. */
function pickPrize(prizes, rng) {
    const list = (prizes || []).filter(p => p && num(p.weight, 0) > 0);
    const total = list.reduce((s, p) => s + num(p.weight, 0), 0);
    if (!total) return null;
    let r = clamp(Number(rng()) || 0, 0, 0.999999) * total;
    for (const p of list) { r -= num(p.weight, 0); if (r < 0) return p; }
    return list[list.length - 1];
}

/** % thực của từng giải (khi đã trúng), làm tròn 1 số lẻ. */
function prizeOdds(prizes) {
    const ws = (prizes || []).map(p => Math.max(0, num(p?.weight, 0)));
    const total = ws.reduce((a, b) => a + b, 0);
    return ws.map(w => total ? Math.round(w / total * 1000) / 10 : 0);
}

/**
 * 1 lượt gắp. state = { sure, misses }. rng gọi theo thứ tự: vị trí càng, cú quyết, (trúng) chọn giải | (trượt) chỗ tuột.
 * → { win, prize, clawX, slipAt, pityHit }
 */
function rollGrab(cfg, state, rng) {
    const c = cfg || defaultConfig();
    const st = state || {};
    const clawX = 0.12 + clamp(Number(rng()) || 0, 0, 1) * 0.76;
    const rateWin = Number(rng()) < c.winRate / 100;
    // 💃 giải Streamer: chỉ tung khi server báo sẵn sàng (bật + hết hồi); không truyền thì thứ tự rng như cũ
    if (st.dance && c.dance && Number(rng()) < c.dance.pct / 100) {
        return { win: true, prize: { ...DANCE_PRIZE }, clawX: Math.round(clawX * 1000) / 1000, slipAt: 0, pityHit: false, dance: true };
    }
    const pityReady = c.pity > 0 && num(st.misses, 0) >= c.pity;
    let win = !!st.sure || rateWin || pityReady;
    const pityHit = win && !st.sure && !rateWin;
    let prize = null, slipAt = 0;
    if (win) {
        const p = pickPrize(c.prizes, rng);
        if (p) prize = { id: p.id, name: p.name, icon: p.icon };
        else win = false;
    }
    if (!win) slipAt = 0.25 + clamp(Number(rng()) || 0, 0, 1) * 0.5;
    return { win, prize, clawX: Math.round(clawX * 1000) / 1000, slipAt: Math.round(slipAt * 1000) / 1000, pityHit: win && pityHit };
}

// ───────────── 🎮 TỰ LÁI (quà lớn) — spec §3.3 ─────────────
// Lưới giải 7 cột × 3 hàng do server giữ (hàng 0 sát kính, 2 trong cùng); mỗi ô = id 1 giải (hoặc null = trống).
const GRID = Object.freeze({ cols: 7, rows: 3 });
const CELLS = GRID.cols * GRID.rows;
const START = Object.freeze({ col: 3, row: 1 });
const MAX_STEPS_PER_COMMENT = 5;

const cellIndex = p => p.row * GRID.cols + p.col;
const cellPos = i => ({ col: i % GRID.cols, row: Math.floor(i / GRID.cols) });

/** Quà lớn (giá 1 món ≥ steerMinCoins) → 'steer', còn lại 'auto'. Ngưỡng 0 = tắt tự lái. */
function turnMode(cfg, coins) {
    const min = num(cfg?.steerMinCoins, 0);
    return min > 0 && num(coins, 0) >= min ? 'steer' : 'auto';
}

const liveIds = prizes => new Set((prizes || []).filter(p => p && num(p.weight, 0) > 0).map(p => p.id));

/** Đủ 21 ô; ô nào trống/giải đã xoá/tỉ trọng 0 thì bốc giải mới theo tỉ trọng. */
function fixLayout(layout, prizes, rng) {
    const ok = liveIds(prizes);
    const src = Array.isArray(layout) ? layout : [];
    const out = [];
    for (let i = 0; i < CELLS; i++) {
        const id = src[i];
        out.push(ok.has(id) || id === DANCE_ID ? id : (pickPrize(prizes, rng)?.id ?? null));
    }
    return out;
}

/** Bù giải mới vào 1 ô (sau khi bị gắp mất). Trả mảng MỚI. */
function refillCell(layout, idx, prizes, rng) {
    const out = (layout || []).slice();
    out[idx] = pickPrize(prizes, rng)?.id ?? null;
    return out;
}

/** Lượt tự gắp: chọn ô cho càng hạ xuống. Trúng → ô đang có đúng giải đó (không có thì đặt giải vào 1 ô). */
function autoCell(layout, result, rng) {
    const l = (layout || []).slice();
    const r = () => clamp(Number(rng()) || 0, 0, 0.999999);
    if (result && result.win && result.prize) {
        const cells = [];
        l.forEach((id, i) => { if (id === result.prize.id) cells.push(i); });
        if (cells.length) return { cell: cells[Math.floor(r() * cells.length)], layout: l };
        const cell = Math.floor(r() * CELLS);
        l[cell] = result.prize.id;
        return { cell, layout: l };
    }
    const full = [];
    l.forEach((id, i) => { if (id) full.push(i); });
    return { cell: full.length ? full[Math.floor(r() * full.length)] : Math.floor(r() * CELLS), layout: l };
}

// Lệnh bình luận — so trên chữ đã bỏ dấu, chữ thường
const DIRS = {
    left: { dx: -1, dz: 0, words: ['trai', 'left', 'a', '<'] },
    right: { dx: 1, dz: 0, words: ['phai', 'right', 'd', '>'] },
    in: { dx: 0, dz: 1, words: ['vao', 'len', 'tren', 'up', 'w', '^'] },
    out: { dx: 0, dz: -1, words: ['ra', 'xuong', 'duoi', 'down', 's', 'v'] }
};
const WORD_DIR = {};
for (const d of Object.values(DIRS)) for (const w of d.words) WORD_DIR[w] = [d.dx, d.dz];
const KEY_DIR = { a: WORD_DIR.a, d: WORD_DIR.d, w: WORD_DIR.w, s: WORD_DIR.s };
const GRAB = new Set(['gap', 'tha', 'chot', 'g', 'ok', 'grab', 'drop']);
const FILLER = new Set(['qua', 'sang', 'di', 'nua', 'them', 'buoc', 'nhe', 'nha', 'chut', 'xiu']);

function foldText(text) {
    return String(text == null ? '' : text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
        .replace(/[!?.,;:"'()]+/g, ' ').trim();
}

/**
 * Bình luận → { moves: [[dx, dz]…], grab } hoặc null (= trò chuyện). Có 1 từ lạ là cả câu thành trò chuyện.
 * Tối đa 5 bước / bình luận.
 */
function parseSteer(text) {
    const toks = foldText(text).split(/\s+/).filter(Boolean);
    if (!toks.length) return null;
    const moves = [];
    let grab = false, last = null;
    for (const t of toks) {
        if (GRAB.has(t)) { grab = true; continue; }
        if (WORD_DIR[t]) { last = WORD_DIR[t]; moves.push(last); continue; }
        if (/^[1-9]$/.test(t)) {
            if (!last) return null;
            for (let k = 1; k < Number(t); k++) moves.push(last);
            continue;
        }
        if (/^[adws]{2,}$/.test(t)) { for (const ch of t) moves.push(KEY_DIR[ch]); last = KEY_DIR[t[t.length - 1]]; continue; }
        if (FILLER.has(t)) continue;
        return null;
    }
    if (!moves.length && !grab) return null;
    return { moves: moves.slice(0, MAX_STEPS_PER_COMMENT).map(m => m.slice()), grab };
}

/** Đi từng bước trong ngân sách; bước va vách không tốn. → { pos, used, last } */
function applyMoves(pos, moves, budget) {
    let p = { col: pos.col, row: pos.row }, used = 0, last = null;
    for (const [dx, dz] of moves || []) {
        if (used >= budget) break;
        const n = { col: p.col + dx, row: p.row + dz };
        if (n.col < 0 || n.col >= GRID.cols || n.row < 0 || n.row >= GRID.rows) continue;
        p = n; used++; last = [dx, dz];
    }
    return { pos: p, used, last };
}

const prizeById = (cfg, id) => {
    if (id === DANCE_ID) return { ...DANCE_PRIZE };
    const p = (cfg.prizes || []).find(x => x.id === id); return p ? { id: p.id, name: p.name, icon: p.icon } : null;
};

/** 💃 Giải Streamer ra được không: bật, không đang nhảy, đã hết hồi (tính từ lúc lần trước KẾT THÚC). */
function danceReady(cfg, st) {
    const d = cfg && cfg.dance;
    if (!d || !d.enabled || !st || st.active) return false;
    return num(st.now, 0) - num(st.lastEndAt, -Infinity) >= d.cooldownSec * 1000;
}

/** Lưới có đúng 1 ô Streamer khi on (giữ chỗ cũ nếu có), không ô nào khi off. Trả mảng MỚI. */
function syncDance(layout, prizes, on, rng) {
    const out = (layout || []).slice();
    const cells = [];
    out.forEach((id, i) => { if (id === DANCE_ID) cells.push(i); });
    const keep = on ? (cells.length ? cells[0] : Math.floor(clamp(Number(rng()) || 0, 0, 0.999999) * CELLS)) : -1;
    cells.forEach(i => { if (i !== keep) out[i] = pickPrize(prizes, rng)?.id ?? null; });
    if (keep >= 0) out[keep] = DANCE_ID;
    return out;
}

/** Ảnh giải Streamer tải lên: chỉ PNG, ≤ 2 MB, ≤ 2048×2048 (đọc khung IHDR). */
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function checkPng(buf, maxBytes = 2 * 1024 * 1024, maxDim = 2048) {
    if (!buf || buf.length < 24 || PNG_SIG.some((b, i) => buf[i] !== b) || buf.toString('ascii', 12, 16) !== 'IHDR') return { ok: false, error: 'not_png' };
    if (buf.length > maxBytes) return { ok: false, error: 'too_big_file' };
    const width = buf.readUInt32BE(16), height = buf.readUInt32BE(20);
    if (!width || !height || width > maxDim || height > maxDim) return { ok: false, error: 'too_big_dim' };
    return { ok: true, width, height };
}

/**
 * Thả càng tại pos → { win, prize, cell, kind: 'grab'|'slip'|'empty', slipAt, pityHit }.
 * rng theo thứ tự: bốc vật bị kẹp, lực kẹp, (tuột) chỗ tuột.
 */
function resolveSteer(cfg, layout, pos, state, rng) {
    const c = cfg || defaultConfig();
    const st = state || {};
    const l = Array.isArray(layout) ? layout : [];
    const own = cellIndex(pos);
    const cands = [];
    if (l[own]) cands.push({ cell: own, w: 1, near: true }); else cands.push({ cell: own, w: 0.6, empty: true });
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const p = { col: pos.col + dx, row: pos.row + dz };
        if (p.col < 0 || p.col >= GRID.cols || p.row < 0 || p.row >= GRID.rows) continue;
        const i = cellIndex(p);
        if (l[i]) cands.push({ cell: i, w: dx && dz ? 0.04 : 0.12 });
    }
    const total = cands.reduce((s, x) => s + x.w, 0);
    let r = clamp(Number(rng()) || 0, 0, 0.999999) * total, pick = cands[cands.length - 1];
    for (const x of cands) { r -= x.w; if (r < 0) { pick = x; break; } }
    const grip = clamp(c.winRate + c.steerBonus, 0, 95) / 100 * (pick.near ? 1 : 0.5);
    const gripWin = !pick.empty && Number(rng()) < grip;
    const forced = !!st.sure || (c.pity > 0 && num(st.misses, 0) >= c.pity);
    if (pick.empty && forced) {
        // chắc trúng mà bốc phải khoảng trống → ô có giải gần nhất
        let best = null, bd = 1e9;
        l.forEach((id, i) => { if (!id) return; const q = cellPos(i), d = Math.abs(q.col - pos.col) + Math.abs(q.row - pos.row) * 1.01; if (d < bd) { bd = d; best = i; } });
        if (best != null) pick = { cell: best, w: 0 };
    }
    const prize = !pick.empty ? prizeById(c, l[pick.cell]) : null;
    const win = !!prize && (gripWin || forced);
    if (win) return { win, prize, cell: pick.cell, kind: 'grab', slipAt: 0, pityHit: !st.sure && !gripWin };
    if (pick.empty) return { win: false, prize: null, cell: pick.cell, kind: 'empty', slipAt: 0, pityHit: false };
    const slipAt = Math.round((0.25 + clamp(Number(rng()) || 0, 0, 1) * 0.5) * 1000) / 1000;
    return { win: false, prize: null, cell: pick.cell, kind: 'slip', slipAt, pityHit: false };
}
function nextMisses(misses, result) { return result && result.win ? 0 : Math.max(0, num(misses, 0)) + 1; }

module.exports = { THEMES, GRID, START, defaultConfig, defaultPrizes, normalizeConfig, pickPrize, prizeOdds, rollGrab, nextMisses,
    turnMode, cellIndex, cellPos, fixLayout, refillCell, autoCell, parseSteer, applyMoves, resolveSteer,
    DANCE_ID, danceReady, syncDance, checkPng };
