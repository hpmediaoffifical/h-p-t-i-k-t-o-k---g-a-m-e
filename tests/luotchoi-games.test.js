'use strict';
// 🎲 Bộ Trò Chơi Theo Lượt — luật thuần từng trò. Spec docs/superpowers/specs/2026-11-12-luotchoi-design.md §2–3.
const test = require('node:test');
const assert = require('node:assert/strict');
const { GAMES_BY_ID } = require('../lib/luot-choi/games');

// rng xác định: chuỗi số cho trước, lặp lại
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

test('có đủ 4 trò với hợp đồng chung', () => {
    for (const id of ['hama', 'chumcoc', 'thaptre', 'latcap']) {
        const g = GAMES_BY_ID[id];
        assert.ok(g, id);
        assert.equal(g.id, id);
        assert.ok(['trap', 'score'].includes(g.kind));
        for (const fn of ['normalize', 'setup', 'options', 'pick', 'view']) assert.equal(typeof g[fn], 'function', id + '.' + fn);
    }
});

for (const [id, key, lo, hi] of [['hama', 'teeth', 6, 16], ['chumcoc', 'holes', 8, 30]]) {
    test(`${id}: số ${key} chặn trong ${lo}–${hi}, đúng 1 bẫy`, () => {
        const G = GAMES_BY_ID[id];
        assert.equal(G.normalize({ [key]: 2 })[key], lo);
        assert.equal(G.normalize({ [key]: 999 })[key], hi);
        const b = G.setup(G.normalize({ [key]: 12 }), mulberry(1));
        assert.deepEqual(G.options(b), Array.from({ length: 12 }, (_, i) => i + 1));
        assert.ok(b.trap >= 1 && b.trap <= 12);
    });

    test(`${id}: chọn ô an toàn → safe, chọn lại bị từ chối, ngoài khoảng bị từ chối`, () => {
        const G = GAMES_BY_ID[id];
        const b = G.setup(G.normalize({ [key]: 10 }), mulberry(2));
        const safe = G.options(b).find(n => n !== b.trap);
        assert.deepEqual(G.pick(b, safe), { ok: true, outcome: 'safe' });
        assert.equal(G.pick(b, safe).ok, false);
        assert.equal(G.pick(b, 0).ok, false);
        assert.equal(G.pick(b, 11).ok, false);
        assert.ok(!G.options(b).includes(safe));
    });

    test(`${id}: trúng bẫy → trap; view chỉ lộ bẫy sau khi nổ`, () => {
        const G = GAMES_BY_ID[id];
        const b = G.setup(G.normalize({ [key]: 10 }), mulberry(3));
        assert.equal(JSON.stringify(G.view(b)).includes('"trap"'), false);
        assert.deepEqual(G.pick(b, b.trap), { ok: true, outcome: 'trap' });
        assert.equal(G.view(b).trap, b.trap);
    });

    test(`${id}: khiên cứu → bẫy giấu lại vào ô chưa dùng khác`, () => {
        const G = GAMES_BY_ID[id];
        const b = G.setup(G.normalize({ [key]: 10 }), mulberry(4));
        const old = b.trap;
        G.pick(b, old);
        G.save(b, old, mulberry(9));
        assert.notEqual(b.trap, old);
        assert.ok(G.options(b).includes(b.trap));
        assert.ok(!G.options(b).includes(old));   // ô vừa chọn đã dùng
        assert.equal(G.view(b).trap, undefined);  // giấu lại → không lộ
    });
}

test('thaptre: đánh số từ dưới lên, tầng trên cùng không rút được', () => {
    const G = GAMES_BY_ID.thaptre;
    const c = G.normalize({ levels: 6 });
    assert.equal(G.normalize({ levels: 1 }).levels, 6);
    assert.equal(G.normalize({ levels: 99 }).levels, 12);
    const b = G.setup(c, mulberry(1));
    assert.deepEqual(G.options(b), Array.from({ length: 15 }, (_, i) => i + 1));
    assert.equal(G.pick(b, 16).ok, false);
});

test('thaptre: rút để tầng chỉ còn 1 thanh bên → đổ chắc chắn', () => {
    const G = GAMES_BY_ID.thaptre;
    const b = G.setup(G.normalize({ levels: 6 }), mulberry(1));
    // tầng 1 = thanh 1 (trái), 2 (giữa), 3 (phải). rng = 0.999 → không bao giờ đổ do xác suất
    assert.equal(G.pick(b, 2, () => 0.999).outcome, 'safe');
    assert.equal(G.pick(b, 1, () => 0.999).outcome, 'trap');   // còn mỗi thanh 3 (bên) → đổ
    assert.equal(G.view(b).fallen, true);
});

test('thaptre: còn thanh giữa thì vẫn đứng nếu rng cao; rng thấp thì đổ', () => {
    const G = GAMES_BY_ID.thaptre;
    const b = G.setup(G.normalize({ levels: 6 }), mulberry(1));
    assert.equal(G.pick(b, 1, () => 0.999).outcome, 'safe');
    assert.equal(G.pick(b, 3, () => 0.999).outcome, 'safe');   // còn thanh giữa
    assert.equal(G.pick(b, 2, () => 0.999).ok, false);          // thanh cuối của tầng không rút được
    assert.equal(G.pick(b, 4, () => 0).outcome, 'trap');
});

test('thaptre: risk tăng theo số thanh đã rút và tầng thấp rủi ro hơn', () => {
    const G = GAMES_BY_ID.thaptre;
    const b = G.setup(G.normalize({ levels: 9 }), mulberry(1));
    const low = G.risk(b, 1), high = G.risk(b, 3 * 7 + 1);
    assert.ok(low > high, `tầng 1 (${low}) phải rủi ro hơn tầng 8 (${high})`);
    G.pick(b, 4, () => 0.999); G.pick(b, 7, () => 0.999);
    assert.ok(G.risk(b, 3 * 7 + 1) > high);
    assert.ok(G.risk(b, 2) < G.risk(b, 1), 'rút thanh giữa khi 2 bên còn đủ an toàn hơn');
});

test('thaptre: khiên nhét lại thanh vừa rút, tháp đứng lại', () => {
    const G = GAMES_BY_ID.thaptre;
    const b = G.setup(G.normalize({ levels: 6 }), mulberry(1));
    G.pick(b, 2, () => 0.999);
    assert.equal(G.pick(b, 1, () => 0.999).outcome, 'trap');
    G.save(b, 1);
    assert.equal(G.view(b).fallen, false);
    assert.ok(G.options(b).includes(1), 'thanh được nhét lại → rút lại được (dù sẽ đổ)');
    assert.equal(G.view(b).bars.find(x => x.n === 1).out, false);
});

test('latcap: số cặp chặn 4–12, mỗi hình đúng 2 ô', () => {
    const G = GAMES_BY_ID.latcap;
    assert.equal(G.normalize({ pairs: 1 }).pairs, 4);
    assert.equal(G.normalize({ pairs: 99 }).pairs, 12);
    const b = G.setup(G.normalize({ pairs: 6 }), mulberry(5));
    assert.equal(G.options(b).length, 12);
    const counts = {};
    for (const f of b.faces) counts[f] = (counts[f] || 0) + 1;
    assert.ok(Object.values(counts).every(c => c === 2));
    assert.equal(G.perTurn, 2);
});

test('latcap: hình trên thẻ là quà TikTok (id quà) — ô ngửa kèm tên/emoji/xu, ô úp không lộ', () => {
    const G = GAMES_BY_ID.latcap;
    assert.equal(G.name, 'Săn Cặp Quà');
    assert.equal(G.GIFTS.length, 12);
    assert.equal(new Set(G.GIFTS.map(g => g.id)).size, 12);
    for (const g of G.GIFTS) assert.ok(/^\d+$/.test(g.id) && g.name && g.emoji && g.coin >= 1, JSON.stringify(g));
    const b = G.setup(G.normalize({ pairs: 12 }), mulberry(9));
    assert.ok(b.faces.every(f => G.GIFTS.some(g => g.id === f)));
    G.pick(b, 1);
    const v = G.view(b);
    const up = v.cards[0], down = v.cards[1];
    const gift = G.GIFTS.find(g => g.id === b.faces[0]);
    assert.equal(up.face, gift.id);
    assert.deepEqual(up.gift, { id: gift.id, name: gift.name, emoji: gift.emoji, coin: gift.coin });
    assert.equal(down.face, undefined);
    assert.equal(down.gift, undefined);
});

test('latcap: lật ô 1 → pending; ô 2 trùng → match; trật → miss rồi settle úp lại', () => {
    const G = GAMES_BY_ID.latcap;
    const b = G.setup(G.normalize({ pairs: 4 }), mulberry(6));
    const a = 1, mate = b.faces.findIndex((f, i) => i !== 0 && f === b.faces[0]) + 1;
    const other = b.faces.findIndex((f, i) => i !== 0 && f !== b.faces[0]) + 1;
    assert.equal(G.view(b).cards[0].face, undefined, 'ô úp không lộ hình');
    assert.equal(G.pick(b, a).outcome, 'pending');
    assert.equal(G.pick(b, a).ok, false, 'không lật lại ô đang ngửa');
    assert.equal(G.pick(b, other).outcome, 'miss');
    assert.equal(G.pick(b, mate).ok, false, 'đang chờ úp lại thì không lật');
    G.settle(b);
    assert.equal(G.view(b).cards[0].face, undefined);
    assert.equal(G.pick(b, a).outcome, 'pending');
    assert.equal(G.pick(b, mate).outcome, 'match');
    assert.ok(!G.options(b).includes(a) && !G.options(b).includes(mate));
    assert.equal(G.view(b).cards[0].face, b.faces[0]);
});

test('latcap: done khi lật hết cặp', () => {
    const G = GAMES_BY_ID.latcap;
    const b = G.setup(G.normalize({ pairs: 4 }), mulberry(7));
    const seen = new Set();
    for (let i = 0; i < b.faces.length; i++) {
        if (seen.has(i)) continue;
        const j = b.faces.findIndex((f, k) => k !== i && f === b.faces[i]);
        seen.add(i); seen.add(j);
        G.pick(b, i + 1); G.pick(b, j + 1);
    }
    assert.equal(G.done(b), true);
    assert.equal(G.options(b).length, 0);
});

test('seq helper dùng được', () => { assert.equal(seq(0.1, 0.2)(), 0.1); });

test('thaptre: thanh rút ra chồng lên đỉnh; rút mãi không bao giờ hết thanh (không kẹt ván)', () => {
    const G = GAMES_BY_ID.thaptre;
    const b = G.setup(G.normalize({ levels: 6 }), mulberry(1));
    assert.equal(G.pick(b, 2, () => 0.999).outcome, 'safe');
    const top = G.view(b).bars.at(-1);
    assert.equal(top.n, 19);
    assert.equal(top.level, 7);
    assert.ok(!G.options(b).includes(19), 'không rút tầng trên cùng');
    assert.ok(!G.options(b).includes(16), 'tầng trên cùng chưa đủ → tầng dưới nó cũng giữ');
    const r = mulberry(3);
    for (let i = 0; i < 80; i++) {
        const opts = G.options(b).filter(n => G.risk(b, n) < 1);   // né nước đổ chắc
        const all = G.options(b);
        assert.ok(all.length > 0, 'bước ' + i + ' hết thanh để rút');
        if (!opts.length) break;
        G.pick(b, opts[Math.floor(r() * opts.length)], () => 0.999);
    }
});

test('thaptre.wobblePct: 0% lúc dựng, tăng dần theo thanh đã rút, ≤ 99, đổ = 100', () => {
    const G = GAMES_BY_ID.thaptre;
    const b = G.setup(G.normalize({ levels: 9 }), mulberry(1));
    assert.equal(G.wobblePct(b), 0);
    let last = 0;
    const r = mulberry(5);
    for (let i = 0; i < 12; i++) {
        const opts = G.options(b).filter(n => G.risk(b, n) < 1);
        G.pick(b, opts[Math.floor(r() * opts.length)], () => 0.999);
        const w = G.wobblePct(b);
        assert.ok(w > last, `bước ${i}: ${w} phải > ${last}`);
        assert.ok(w <= 99);
        last = w;
    }
    assert.equal(G.view(b).wobblePct, last);
    G.pick(b, G.options(b)[0], () => 0);
    assert.equal(G.wobblePct(b), 100);
});

test('latcap.marked: ô ngửa / đã ghép giữ nhãn, ô úp lại thì bỏ nhãn', () => {
    const G = GAMES_BY_ID.latcap;
    const b = G.setup(G.normalize({ pairs: 4 }), mulberry(6));
    const other = b.faces.findIndex((f, i) => i !== 0 && f !== b.faces[0]) + 1;
    G.pick(b, 1);
    assert.equal(G.marked(b, 1), true);
    G.pick(b, other); G.settle(b);
    assert.equal(G.marked(b, 1), false);
});
