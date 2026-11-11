'use strict';
/**
 * 🎋 Tháp Tre — `levels` tầng × 3 thanh, đánh số 1…3·levels từ dưới lên (trong tầng: trái, giữa, phải).
 * Thanh rút ra được CHỒNG LÊN ĐỈNH (số mới tiếp theo) → tháp cao dần, không bao giờ hết thanh để rút.
 * Không rút ở tầng trên cùng; tầng trên cùng chưa đủ 3 thanh thì tầng ngay dưới cũng giữ nguyên.
 * Không rút thanh cuối cùng của một tầng. Rút → tháp có thể đổ theo risk() (spec §2).
 */
const { clampInt } = require('./util');

const LO = 6, HI = 12, DFLT = 9;
const BASE = 0.04, PER_PULL = 0.02, LOW_LEVEL = 0.05, MID_SAFE = 0.6, ONLY_MID = 1.6, CAP = 0.9;

const barOf = (b, n) => b.bars[Number(n) - 1];
const remainAfter = (b, bar) => b.bars.filter(x => x.level === bar.level && !x.out && x !== bar).map(x => x.pos);
const topLevel = (b) => b.bars[b.bars.length - 1].level;
const topFull = (b) => b.bars.filter(x => x.level === topLevel(b)).length === 3;

function options(b) {
    if (b.fallen) return [];
    const top = topLevel(b);
    const pullable = (maxLevel) => b.bars.filter(x => !x.out && x.level <= maxLevel && remainAfter(b, x).length >= 1).map(x => x.n);
    // luật chuẩn → nới dần nếu (hiếm) không còn thanh nào, để ván không bao giờ đứng
    const strict = pullable(topFull(b) ? top - 1 : top - 2);
    return strict.length ? strict : pullable(top - 1);
}

function risk(b, n) {
    const bar = barOf(b, n);
    if (!bar) return 0;
    const rest = remainAfter(b, bar);
    if (rest.length === 1 && rest[0] !== 1) return 1;            // chỉ còn 1 thanh bên → đổ chắc
    let p = BASE + PER_PULL * b.pulled + LOW_LEVEL * (1 - bar.level / topLevel(b));
    if (bar.pos === 1 && rest.length === 2) p *= MID_SAFE;        // rút giữa, 2 bên còn đủ
    if (rest.length === 1 && rest[0] === 1) p *= ONLY_MID;        // còn trơ thanh giữa
    return Math.min(CAP, p);
}

function stackOnTop(b) {
    const top = topLevel(b);
    const onTop = b.bars.filter(x => x.level === top).length;
    const level = onTop >= 3 ? top + 1 : top;
    const pos = onTop >= 3 ? 0 : onTop;
    b.bars.push({ n: b.bars.length + 1, level, pos, out: false, stacked: true });
}

module.exports = {
    id: 'thaptre', kind: 'trap', perTurn: 1, sizeKey: 'levels', name: 'Tháp Tre', icon: '🎋', unit: 'thanh',
    normalize(c) { return { levels: clampInt(c && c.levels, LO, HI, DFLT) }; },
    setup(gc) {
        const levels = clampInt(gc && gc.levels, LO, HI, DFLT);
        const bars = [];
        for (let L = 1; L <= levels; L++) for (let pos = 0; pos < 3; pos++) bars.push({ n: bars.length + 1, level: L, pos, out: false });
        return { bars, pulled: 0, fallen: false, last: 0 };
    },
    options, risk,
    pick(b, n, rng) {
        n = Number(n);
        if (b.fallen) return { ok: false, reason: 'busy' };
        if (!options(b).includes(n)) return { ok: false, reason: barOf(b, n) ? 'used' : 'range' };
        const p = risk(b, n);
        barOf(b, n).out = true; b.pulled++; b.last = n;
        if ((rng || Math.random)() < p) { b.fallen = true; return { ok: true, outcome: 'trap' }; }
        stackOnTop(b);
        return { ok: true, outcome: 'safe' };
    },
    // 🛡️ khiên: nhét lại thanh vừa rút (thanh đổ không kịp chồng lên đỉnh), tháp lung lay nhưng đứng
    save(b, n) {
        const bar = barOf(b, n);
        if (bar && bar.out) { bar.out = false; b.pulled = Math.max(0, b.pulled - 1); }
        b.fallen = false;
    },
    view(b) {
        return { kind: 'thaptre', levels: topLevel(b), bars: b.bars.map(x => ({ n: x.n, level: x.level, pos: x.pos, out: x.out })),
            fallen: b.fallen, last: b.last, wobble: Math.min(1, b.pulled / 14) };
    }
};
