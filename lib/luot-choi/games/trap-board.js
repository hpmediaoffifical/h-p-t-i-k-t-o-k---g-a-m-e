'use strict';
/**
 * Bàn "1 ô bẫy giấu trong N ô" dùng chung cho 🦛 Hà Mã Cắn (răng) và 🐐 Dê Núi (hốc đá).
 * board = { n, used: number[], trap, sprung, last }. view() KHÔNG có `trap` cho tới khi bẫy nổ.
 */
const { clampInt, randInt } = require('./util');

function makeTrapGame({ id, key, lo, hi, dflt }) {
    function options(b) {
        const out = [];
        for (let i = 1; i <= b.n; i++) if (!b.used.includes(i)) out.push(i);
        return out;
    }
    const placeTrap = (b, rng) => {
        const free = options(b);
        b.trap = free.length ? free[randInt(rng, free.length)] : 0;
    };
    return {
        id, kind: 'trap', perTurn: 1, sizeKey: key,
        normalize(c) { return { [key]: clampInt(c && c[key], lo, hi, dflt) }; },
        setup(gc, rng) {
            const b = { n: clampInt(gc && gc[key], lo, hi, dflt), used: [], trap: 0, sprung: false, last: 0 };
            placeTrap(b, rng);
            return b;
        },
        options,
        pick(b, n) {
            n = Number(n);
            if (b.sprung) return { ok: false, reason: 'busy' };
            if (!Number.isInteger(n) || n < 1 || n > b.n) return { ok: false, reason: 'range' };
            if (b.used.includes(n)) return { ok: false, reason: 'used' };
            b.used.push(n); b.last = n;
            if (n === b.trap) { b.sprung = true; return { ok: true, outcome: 'trap' }; }
            return { ok: true, outcome: 'safe' };
        },
        // 🛡️ khiên cứu: ô vừa ấn vẫn tính là đã dùng, bẫy được giấu lại vào ô còn trống
        save(b, n, rng) { b.sprung = false; placeTrap(b, rng); },
        view(b) {
            const v = { kind: id, n: b.n, used: b.used.slice(), last: b.last, sprung: b.sprung };
            if (b.sprung) v.trap = b.trap;
            return v;
        }
    };
}
module.exports = { makeTrapGame };
