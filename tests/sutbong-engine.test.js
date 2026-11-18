// ⚽ Sút Bóng Vào Gôn — engine thuần public/games/sutbong/game.js: phối cảnh cú sút, cản bằng tay (cửa sổ + bù trễ),
// vào lưới, điểm / chuỗi / top ghi bàn, hàng chờ, tay từ pose. Spec docs/superpowers/specs/2026-11-12-sutbong-design.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../public/games/sutbong/game.js');

const fixed = v => () => v;
const mk = (cfg = {}, opts = {}) => {
    const e = S.createEngine({ difficulty: 'normal', gifts: [], ...cfg }, { random: fixed(0.5), ...opts });
    e.setReady(true);
    return e;
};
// Bước tới khi cú sút đầu tiên đạt tiến độ u (pha fly). Trả quả bóng.
function stepToU(e, u, maxMs = 6000) {
    for (let t = 0; t < maxMs; t += 16) {
        e.step(16);
        const b = e.balls[0];
        if (b && b.phase === 'fly' && b.u >= u) return b;
    }
    return e.balls[0];
}
function eventsOf(e) { return e.snapshot().events; }
function runUntil(e, type, maxMs = 8000) {
    const got = [];
    for (let t = 0; t < maxMs; t += 16) {
        e.step(16);
        const ev = e.snapshot().events;
        got.push(...ev);
        if (ev.some(x => x.type === type)) break;
    }
    return got;
}

test('normalizeConfig: mặc định, kẹp số, quà trùng / kiểu sút lạ / thiếu id', () => {
    const c = S.normalizeConfig({ difficulty: 'xx', maxBalls: 9, hitScale: 1, latencyMs: 9999,
        goal: { width: 500, top: -3, bottom: 20 },
        gifts: [{ giftId: 5655, shot: 'bazooka' }, { giftId: '5655', shot: 'gold' }, { giftName: 'không id' }, { giftId: '1', shot: 'rocket' }] });
    assert.equal(c.difficulty, 'normal');
    assert.equal(c.maxBalls, 3);
    assert.equal(c.hitScale, 50);
    assert.equal(c.latencyMs, 400);
    assert.equal(c.goal.width, 100);
    assert.equal(c.goal.top, 0);
    assert.ok(c.goal.bottom > c.goal.top + 20, 'vạch vôi luôn dưới xà ngang đủ xa');
    assert.deepEqual(c.gifts.map(g => [g.giftId, g.shot]), [['5655', 'normal'], ['1', 'rocket']]);
    const d = S.normalizeConfig(null);
    assert.equal(d.enabled, true);
    assert.equal(d.maxBalls, 1);
    assert.deepEqual(d.gifts, []);
    assert.deepEqual(S.SHOT_IDS, ['normal', 'curve', 'rocket', 'gold']);
});

test('shotsForGift: chỉ so id, combo ×N = N cú, trần MAX_PER_GIFT', () => {
    const cfg = S.normalizeConfig({ gifts: [{ giftId: '7', giftName: 'Rose', shot: 'curve' }] });
    assert.deepEqual(S.shotsForGift(cfg, 7, 3), { type: 'curve', count: 3 });
    assert.deepEqual(S.shotsForGift(cfg, '7'), { type: 'curve', count: 1 });
    assert.equal(S.shotsForGift(cfg, '8', 1), null);
    assert.equal(S.shotsForGift(cfg, '', 1), null);
    assert.equal(S.shotsForGift(cfg, '7', 99999).count, S.MAX_PER_GIFT);
});

test('phối cảnh: bắt đầu ở mép dưới to, tới đích nhỏ; bán kính giảm dần, đi nhanh lúc đầu', () => {
    const e = mk();
    e.enqueue('normal', 1, { nickname: 'A' });
    e.step(16);
    const b = e.balls[0];
    assert.equal(b.phase, 'spot', 'bóng nằm chấm phạt đền trước khi sút');
    const p0 = S.shotPos(b, 0), p1 = S.shotPos(b, 1), pm = S.shotPos(b, 0.5);
    assert.ok(p0.y > 1920 * 0.9, 'điểm đầu ở mép dưới');
    assert.ok(Math.abs(p1.x - b.tx) < 1e-6 && Math.abs(p1.y - b.ty) < 1e-6, 'u=1 đúng đích');
    assert.ok(p0.r > p1.r * 2, 'bóng gần camera to hơn hẳn');
    let last = Infinity;
    for (let u = 0; u <= 1.0001; u += 0.1) { const r = S.shotPos(b, u).r; assert.ok(r < last + 1e-9); last = r; }
    // đi nhanh lúc đầu: nửa thời gian đầu đi quá nửa quãng đường màn hình
    const full = Math.hypot(p1.x - p0.x, p1.y - p0.y), half = Math.hypot(pm.x - p0.x, pm.y - p0.y);
    assert.ok(half > full * 0.5, 'phối cảnh: nửa đầu đi xa hơn nửa sau');
});

test('đích luôn nằm trong khung thành (trừ lề bán kính bóng)', () => {
    for (const r of [0, 0.17, 0.34, 0.5, 0.67, 0.83, 0.999]) {
        const e = mk({}, { random: fixed(r) });
        e.enqueue('normal', 1);
        e.step(16);
        const b = e.balls[0], g = e.goalRect();
        assert.ok(b.tx - b.r1 >= g.x - 1e-6 && b.tx + b.r1 <= g.x + g.w + 1e-6, 'x trong khung, r=' + r);
        assert.ok(b.ty - b.r1 >= g.y - 1e-6 && b.ty + b.r1 <= g.y + g.h + 1e-6, 'y trong khung, r=' + r);
    }
});

test('sút cong: giữa đường lệch hẳn khỏi đường thẳng, cuối vẫn trúng đích', () => {
    const e = mk({}, { random: fixed(0.9) });
    e.enqueue('curve', 1);
    e.step(16);
    const b = e.balls[0];
    const p0 = S.shotPos(b, 0), p1 = S.shotPos(b, 1), pm = S.shotPos(b, 0.5);
    // khoảng cách điểm giữa tới đường thẳng p0→p1
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    const off = Math.abs((pm.x - p0.x) * dy - (pm.y - p0.y) * dx) / Math.hypot(dx, dy);
    assert.ok(off > 60, 'cong lệch > 60 px, được ' + off.toFixed(1));
    assert.ok(Math.abs(p1.x - b.tx) < 1e-6);
});

test('thời gian bay: sấm sét nhanh hơn thường, khó nhanh hơn dễ', () => {
    const flight = (type, difficulty) => { const e = mk({ difficulty }); e.enqueue(type, 1); e.step(16); return e.balls[0].T; };
    assert.ok(flight('rocket', 'normal') < flight('normal', 'normal') * 0.7);
    assert.ok(flight('normal', 'hard') < flight('normal', 'easy'));
});

test('cản: tay đúng chỗ bóng khi bóng đã tới gần → save, cộng điểm thủ môn + chuỗi', () => {
    const e = mk();
    e.enqueue('normal', 1, { nickname: 'Lan' });
    const b = stepToU(e, 0.9);
    eventsOf(e);
    const n = e.contact([{ x: b.x, y: b.y, r: 50 }], NaN);
    assert.equal(n, 1);
    const ev = eventsOf(e).find(x => x.type === 'save');
    assert.ok(ev, 'có sự kiện save');
    assert.equal(ev.by, 'Lan');
    const s = e.stats();
    assert.equal(s.keeper, 1);
    assert.equal(s.viewers, 0);
    assert.equal(s.streak, 1);
    assert.equal(e.balls[0].phase, 'saved');
    assert.equal(e.contact([{ x: b.x, y: b.y, r: 50 }], NaN), 0, 'đã cản rồi không tính lần 2');
});

test('không cản sớm: bóng còn xa (u nhỏ) thì tay chạm cũng không tính', () => {
    const e = mk();
    e.enqueue('normal', 1);
    const b = stepToU(e, 0.3);
    assert.equal(e.contact([{ x: b.x, y: b.y, r: 50 }], NaN), 0);
    assert.equal(e.balls[0].phase, 'fly');
});

test('tay xa bóng → không cản; không ai chạm → vào lưới, cộng điểm khán giả + bảng ghi bàn', () => {
    const e = mk();
    e.enqueue('rocket', 1, { nickname: 'Minh', avatar: 'a.png' });
    const b = stepToU(e, 0.95);
    assert.equal(e.contact([{ x: b.x + 400, y: b.y, r: 50 }], NaN), 0);
    const ev = runUntil(e, 'goal');
    const g = ev.find(x => x.type === 'goal');
    assert.ok(g, 'có sự kiện goal');
    assert.equal(g.points, 2, 'sấm sét ×2');
    const s = e.stats();
    assert.equal(s.viewers, 2);
    assert.equal(s.streak, 0);
    assert.deepEqual(e.topScorers(3).map(x => [x.name, x.points, x.goals]), [['Minh', 2, 1]]);
});

test('bù trễ: tới đích rồi vẫn chờ latency; khung camera cũ (atClock) so với vị trí bóng lúc đó → vẫn cản', () => {
    // sút cong: cuối đường bóng còn dạt ngang → vị trí lúc u≈0,82 cách đích ~100 px (lớn hơn tầm tay 20 px + bóng)
    const e = mk({ latencyMs: 200 }, { random: fixed(0.9) });
    e.enqueue('curve', 1);
    const b = stepToU(e, 0.82);
    const clockThen = e.clock, xThen = b.x, yThen = b.y;
    // bóng bay tiếp tới đích (u=1) — chưa phán vào lưới
    for (let i = 0; i < 40 && e.balls[0].phase === 'fly' && e.balls[0].u < 1; i++) e.step(16);
    e.step(16);
    assert.equal(e.balls[0].phase, 'fly', 'đang chờ bù trễ, chưa vào lưới');
    // giờ khung camera chụp lúc clockThen mới tới: tay ở chỗ bóng LÚC ĐÓ
    assert.equal(e.contact([{ x: xThen, y: yThen, r: 20 }], NaN), 0, 'so với vị trí HIỆN TẠI thì trượt');
    assert.equal(e.contact([{ x: xThen, y: yThen, r: 20 }], clockThen), 1, 'so với vị trí lúc camera chụp thì cản');
    assert.equal(e.balls[0].phase, 'saved');
});

test('bóng vàng ×3 khi cản; chuỗi + kỷ lục + mốc chuỗi', () => {
    const e = mk({ maxBalls: 1 });
    e.enqueue('gold', 1);
    const b = stepToU(e, 0.9);
    e.contact([{ x: b.x, y: b.y, r: 50 }], NaN);
    assert.equal(e.stats().keeper, 3);
    // 4 cú nữa → mốc 5
    let milestone = 0;
    for (let k = 0; k < 4; k++) {
        e.enqueue('normal', 1);
        let ball = null;
        for (let t = 0; t < 8000; t += 16) {
            e.step(16);
            const ev = e.snapshot().events;
            for (const x of ev) if (x.type === 'save' && x.milestone) milestone = x.milestone;
            ball = e.balls.find(z => z.phase === 'fly' && z.u >= 0.9);
            if (ball) break;
        }
        e.contact([{ x: ball.x, y: ball.y, r: 50 }], NaN);
        for (const x of e.snapshot().events) if (x.type === 'save' && x.milestone) milestone = x.milestone;
    }
    const s = e.stats();
    assert.equal(s.streak, 5);
    assert.equal(s.best, 5);
    assert.equal(milestone, 5);
});

test('hàng chờ: maxBalls=1 sút từng quả; đầy → queueFull; chưa thấy người thì giữ hàng ≤ 8 s', () => {
    const e = mk({ maxBalls: 1, queueMax: 3 });
    assert.equal(e.enqueue('normal', 5), 3);
    assert.ok(eventsOf(e).some(x => x.type === 'queueFull'));
    e.step(16);
    assert.equal(e.balls.length, 1);
    assert.equal(e.snapshot().queue, 2);
    const w = mk();
    w.setReady(false);
    w.enqueue('normal', 1);
    for (let t = 0; t < 4000; t += 16) w.step(16);
    assert.equal(w.balls.length, 0, 'chưa thấy người: chờ');
    for (let t = 0; t < 4500; t += 16) w.step(16);
    assert.equal(w.balls.length, 1, 'quá 8 s vẫn sút');
});

test('stats / loadStats / reset; topScorers xếp theo điểm', () => {
    const e = mk();
    e.loadStats({ keeper: 4, viewers: 7, streak: 2, best: 6, scorers: [{ name: 'A', points: 3, goals: 2 }, { name: 'B', points: 5, goals: 1 }, { name: 'C', points: 1, goals: 1 }, { name: 'D', points: 4, goals: 4 }] });
    const s = e.stats();
    assert.deepEqual([s.keeper, s.viewers, s.streak, s.best], [4, 7, 2, 6]);
    assert.deepEqual(e.topScorers(3).map(x => x.name), ['B', 'D', 'A']);
    e.loadStats({ keeper: 'x', viewers: -5, scorers: 'rác' });
    assert.equal(e.stats().keeper, 0);
    assert.equal(e.stats().viewers, 0);
    e.loadStats({ keeper: 2 });
    e.reset();
    assert.deepEqual([e.stats().keeper, e.topScorers(3).length], [0, 0]);
});

test('handsFromPose: tâm lòng bàn tay lệch từ cổ tay về phía ngón, bỏ tay không rõ', () => {
    const P = Array.from({ length: 33 }, () => ({ x: 0, y: 0, v: 0 }));
    const set = (i, x, y, v = 1) => { P[i] = { x, y, v }; };
    set(11, 400, 700); set(12, 700, 700);                  // bề vai 300
    set(15, 300, 500); set(17, 300, 420); set(19, 320, 420); // tay trái giơ lên
    set(16, 800, 900, 0.2);                                 // tay phải mờ
    const hands = S.handsFromPose(P);
    assert.equal(hands.length, 1);
    const h = hands[0];
    assert.ok(h.y < 500 && h.y > 420, 'tâm nằm giữa cổ tay và ngón');
    assert.ok(Math.abs(h.r - 90) < 1e-6, 'r = 0,3 × bề vai');
    assert.equal(h.side, 'L');
    assert.deepEqual(S.handsFromPose(null), []);
    // không có ngón: dùng cổ tay, r tối thiểu 40 khi bề vai không đo được
    const Q = Array.from({ length: 33 }, () => ({ x: 0, y: 0, v: 0 }));
    Q[16] = { x: 600, y: 600, v: 1 };
    const q = S.handsFromPose(Q);
    assert.equal(q.length, 1);
    assert.equal(q[0].r, 40);
    assert.deepEqual([q[0].x, q[0].y], [600, 600]);
});

test('setArea: khung thành theo vùng thấy trên OBS', () => {
    const e = mk({ goal: { width: 50, top: 20, bottom: 80 } });
    e.setArea({ x: 100, y: 200, w: 400, h: 1000 });
    const g = e.goalRect();
    assert.deepEqual([g.x, g.y, g.w, g.h], [200, 400, 200, 600]);
    e.setArea(null);
    assert.equal(e.goalRect().w, 540);
});

test('clear xoá bóng + hàng chờ nhưng giữ tỷ số', () => {
    const e = mk();
    e.loadStats({ keeper: 3 });
    e.enqueue('normal', 3);
    e.step(16);
    e.clear();
    assert.equal(e.balls.length, 0);
    assert.equal(e.snapshot().queue, 0);
    assert.equal(e.stats().keeper, 3);
});
