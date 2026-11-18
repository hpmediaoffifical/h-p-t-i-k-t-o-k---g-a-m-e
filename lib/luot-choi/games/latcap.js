'use strict';
/**
 * 🍉 Săn Cặp Trái Cây — `pairs` cặp hình trái cây úp ngẫu nhiên. Mỗi lượt lật 2 ô: trùng → giữ ngửa (+1 điểm, đi tiếp),
 * trật → chờ settle() úp lại. view() không lộ hình ô đang úp.
 */
const { clampInt, shuffle } = require('./util');

const FACES = ['🍉', '🍎', '🍌', '🍇', '🍓', '🍍', '🥝', '🍑', '🍒', '🥥', '🍋', '🥭'];
const LO = 4, HI = 12, DFLT = 8;

function options(b) {
    if (b.pendingMiss) return [];
    const out = [];
    b.faces.forEach((_, i) => { if (!b.matched[i] && !b.open.includes(i)) out.push(i + 1); });
    return out;
}

module.exports = {
    id: 'latcap', kind: 'score', perTurn: 2, sizeKey: 'pairs', name: 'Săn Cặp Trái Cây', icon: '🍉', unit: 'ô', FACES,
    normalize(c) { return { pairs: clampInt(c && c.pairs, LO, HI, DFLT) }; },
    setup(gc, rng) {
        const pairs = clampInt(gc && gc.pairs, LO, HI, DFLT);
        const pool = shuffle(FACES.slice(), rng).slice(0, pairs);
        const faces = shuffle(pool.concat(pool), rng);
        return { pairs, faces, matched: faces.map(() => false), open: [], pendingMiss: false, last: [] };
    },
    options,
    pick(b, n) {
        n = Number(n);
        if (b.pendingMiss) return { ok: false, reason: 'busy' };
        if (!Number.isInteger(n) || n < 1 || n > b.faces.length) return { ok: false, reason: 'range' };
        const i = n - 1;
        if (b.matched[i] || b.open.includes(i)) return { ok: false, reason: 'used' };
        b.open.push(i);
        if (b.open.length === 1) { b.last = [n]; return { ok: true, outcome: 'pending' }; }
        const [a, c] = b.open;
        b.last = [a + 1, c + 1];
        if (b.faces[a] === b.faces[c]) { b.matched[a] = b.matched[c] = true; b.open = []; return { ok: true, outcome: 'match' }; }
        b.pendingMiss = true;
        return { ok: true, outcome: 'miss' };
    },
    // đổi người giữa chừng (bị mời khỏi ghế) → úp ô lẻ đang ngửa
    endTurn(b) { if (!b.pendingMiss) b.open = []; },
    // nhãn tên chỉ giữ trên ô đang ngửa / đã ghép (ô úp lại thì bỏ)
    marked(b, n) { const i = Number(n) - 1; return !!b.matched[i] || b.open.includes(i); },
    settle(b) { if (b.pendingMiss) { b.open = []; b.pendingMiss = false; } },
    done(b) { return b.matched.every(Boolean); },
    view(b) {
        return { kind: 'latcap', pairs: b.pairs, last: b.last.slice(), pendingMiss: b.pendingMiss,
            cards: b.faces.map((f, i) => {
                const c = { n: i + 1, matched: b.matched[i], open: b.open.includes(i) };
                if (c.matched || c.open) c.face = f;
                return c;
            }) };
    }
};
