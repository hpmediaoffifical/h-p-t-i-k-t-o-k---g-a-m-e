// 🏸 Đá Cầu — engine thuần public/games/dacau/game.js (port từ HP LIVE NPC scripts/dacau-selftest.cjs, phần engine):
// vật lý cầu, luật chạm "nhấc lên", combo / đổi chân, rơi sàn, hàng chờ, đội đầu. Phần phiên quà / server / Rổ PHẠT là của NPC.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const D = require('../public/games/dacau/game.js');

const fixed = () => 0.5;
// Bước engine tới khi cầu RƠI xuống ngang y (hoặc hết giờ). Trả quả cầu (hoặc undefined nếu đã chết).
function fallTo(e, y, maxMs = 8000) {
    for (let t = 0; t < maxMs; t += 16) {
        e.step(16);
        const b = e.balls[0];
        if (!b) return undefined;
        if (b.vy > 0 && b.y >= y) return b;
    }
    return e.balls[0];
}
const thighAt = (b, up, side = 'L') => ({ kind: 'thigh', side, ax: b.x - 10, ay: b.y + 30, bx: b.x + 10, by: b.y + 200, r: 60, up, sw: 300 });
const headAt = (b, up) => ({ kind: 'head', x: b.x, y: b.y + 60, r: 80, up, sw: 300 });

test('normalizeConfig: mặc định, kẹp số, quà trùng / loại cầu lạ', () => {
    const c = D.normalizeConfig({ difficulty: 'xx', parts: 'tay', floorPercent: 999, maxBalls: 9, hitScale: 1,
        gifts: [{ giftId: 5655, ball: 'rocket' }, { giftId: '5655', ball: 'gold' }, { giftName: 'không id' }, { giftId: '1', ball: 'fire' }] });
    assert.equal(c.difficulty, 'normal');
    assert.equal(c.parts, 'both');
    assert.equal(c.floorPercent, 100);
    assert.equal(c.maxBalls, 5);
    assert.equal(D.normalizeConfig(null).maxBalls, 3, 'mặc định 3 quả cùng lúc');
    assert.equal(c.hitScale, 50);
    assert.deepEqual(c.gifts.map(g => [g.giftId, g.ball]), [['5655', 'normal'], ['1', 'fire']]);
    assert.equal(D.normalizeConfig(null).enabled, true);
    assert.equal(D.normalizeConfig({ requireLift: false }).requireLift, false);
});

test('ballsForGift: chỉ quà đã chọn (so id), combo ×N = N quả (×99 = 99 quả), trần an toàn 999', () => {
    const c = D.normalizeConfig({ gifts: [{ giftId: '5655', ball: 'gold' }] });
    assert.deepEqual(D.ballsForGift(c, '5655', 3), { type: 'gold', count: 3 });
    assert.deepEqual(D.ballsForGift(c, 5655, 99), { type: 'gold', count: 99 });
    assert.equal(D.ballsForGift(c, 5655, 5000).count, 999);
    assert.equal(D.ballsForGift(c, '1', 1), null);
    assert.equal(D.ballsForGift(c, '', 1), null);
});

test('tung cầu: bay lên từ dưới đáy tới gần mép trên, rồi rơi chậm (vận tốc rơi giới hạn)', () => {
    const e = D.createEngine({}, { random: fixed });
    e.enqueue('normal', 1, { nickname: 'An' });
    e.step(16);
    const ev = e.snapshot().events;
    assert.equal(ev[0].type, 'launch');
    let minY = Infinity, maxVy = 0;
    for (let t = 0; t < 4000 && e.balls.length; t += 16) { e.step(16); const b = e.balls[0]; if (!b) break; minY = Math.min(minY, b.y); maxVy = Math.max(maxVy, b.vy); }
    assert.ok(minY > 100 && minY < 400, 'đỉnh ~10–16 % chiều cao: ' + minY);
    assert.ok(maxVy <= D.DIFFICULTY.normal.vt + 1, 'rơi không vượt vt: ' + maxVy);
});

test('chạm: đùi ĐỨNG YÊN thì cầu rơi xuyên qua; NHẤC LÊN thì cầu bay lên lại', () => {
    const e = D.createEngine({}, { random: fixed });
    e.enqueue('normal', 1, {});
    let b = fallTo(e, 1100);
    assert.equal(e.contact([thighAt(b, 0)], NaN), 0, 'đứng yên không tính');
    assert.equal(e.contact([thighAt(b, 120)], NaN), 0, 'nhấc chậm dưới ngưỡng không tính');
    assert.equal(e.contact([thighAt(b, 900)], NaN), 1);
    assert.ok(e.balls[0].vy < -1500, 'bật lên mạnh');
    const k = e.snapshot().events.find(x => x.type === 'kick');
    assert.equal(k.touches, 1);
    assert.equal(k.part, 'thigh');
    // tắt "phải nhấc lên" → đứng yên cũng đỡ được
    const e2 = D.createEngine({ requireLift: false }, { random: fixed });
    e2.enqueue('normal', 1, {});
    b = fallTo(e2, 1100);
    assert.equal(e2.contact([thighAt(b, 0)], NaN), 1);
});

test('chạm: cầu đang BAY LÊN không tính; chạm xong có nghỉ 260 ms (không đỡ 2 lần một cú)', () => {
    const e = D.createEngine({}, { random: fixed });
    e.enqueue('normal', 1, {});
    e.step(100);
    const up = e.balls[0];
    assert.ok(up.vy < -100);
    assert.equal(e.contact([thighAt(up, 900)], NaN), 0);
    const b = fallTo(e, 1100);
    assert.equal(e.contact([thighAt(b, 900)], NaN), 1);
    b.vy = 50;   // giả như vẫn đang rơi ngay sau cú đỡ
    assert.equal(e.contact([thighAt(b, 900)], NaN), 0);
});

test('chạm: cầu ở DƯỚI đùi (đập mặt dưới) không tính; ngưỡng nhấc theo bề vai (đứng xa camera)', () => {
    const e = D.createEngine({}, { random: fixed });
    e.enqueue('normal', 1, {});
    const b = fallTo(e, 1100);
    const below = { kind: 'thigh', side: 'L', ax: b.x - 100, ay: b.y - 120, bx: b.x + 100, by: b.y - 120, r: 60, up: 900, sw: 300 };
    assert.equal(e.contact([below], NaN), 0);
    // người đứng xa (bề vai 150 px) → ngưỡng nhấc giảm một nửa: 130 px/s đủ (≥ 110), người gần (600 px) thì chưa
    assert.equal(e.contact([{ ...thighAt(b, 130), sw: 600 }], NaN), 0);
    assert.equal(e.contact([{ ...thighAt(b, 130), sw: 150 }], NaN), 1);
});

test('chế độ "Chỉ đầu" bỏ qua đùi; đầu được 2 điểm; đổi chân trái ↔ phải được ×2', () => {
    const e = D.createEngine({ parts: 'head' }, { random: fixed });
    e.enqueue('normal', 1, {});
    let b = fallTo(e, 900);
    assert.equal(e.contact([thighAt(b, 900)], NaN), 0);
    assert.equal(e.contact([headAt(b, 300)], NaN), 1);
    assert.equal(e.snapshot().events.find(x => x.type === 'kick').points, 2);

    const e2 = D.createEngine({}, { random: fixed });
    e2.enqueue('gold', 1, {});
    const pts = [];
    for (const side of ['L', 'R', 'R']) {
        b = fallTo(e2, 1100);
        assert.equal(e2.contact([thighAt(b, 900, side)], NaN), 1);
        pts.push(e2.snapshot().events.find(x => x.type === 'kick').points);
    }
    assert.deepEqual(pts, [3, 6, 3], 'cầu vàng ×3, đổi chân ×2');
});

test('độ trễ camera: so cả vị trí cầu lúc camera chụp (lịch sử 0,6 s)', () => {
    const e = D.createEngine({}, { random: fixed });
    e.enqueue('normal', 1, {});
    const b = fallTo(e, 1000);
    const then = { x: b.x, y: b.y }, clockThen = e.snapshot().clock;
    for (let i = 0; i < 14; i++) e.step(16);    // cầu đã rơi thêm ~160 px
    const part = { kind: 'head', x: then.x, y: then.y + 60, r: 50, up: 300, sw: 300 };
    assert.ok(e.balls[0].y - then.y > 50 * D.DIFFICULTY.normal.hit + 46, 'cầu hiện tại đã ra khỏi vùng đầu');
    assert.equal(e.contact([part], NaN), 0, 'chỉ vị trí hiện tại → trượt');
    assert.equal(e.contact([part], clockThen), 1, 'vị trí lúc camera chụp → trúng');
});

test('rơi qua vạch sàn: sự kiện drop kèm vé phạt; miễn phạt khi đỡ đủ N chạm; tắt phạt', () => {
    const run = (cfg, kicks) => {
        const e = D.createEngine(cfg, { random: fixed });
        e.enqueue('normal', 1, { nickname: 'An', fxIds: ['ve1'] });
        e.step(16);
        for (let i = 0; i < kicks; i++) { const b = fallTo(e, 1100); e.contact([thighAt(b, 900)], NaN); e.snapshot(); }
        for (let t = 0; t < 10000 && e.balls.length; t += 16) e.step(16);
        return e.snapshot().events.find(x => x.type === 'drop');
    };
    const d = run({}, 0);
    assert.equal(d.fxId, 've1');
    assert.equal(d.by, 'An');
    assert.ok(d.y >= 1920 * 0.92 - 1);
    assert.equal(run({ safeAfter: 2 }, 2).fxId, '', 'đủ 2 chạm → không phạt');
    assert.equal(run({ safeAfter: 2 }, 2).safe, true);
    assert.equal(run({ safeAfter: 2 }, 1).fxId, 've1');
    assert.equal(run({ fxOnDrop: false }, 0).fxId, '');
});

test('cùng lúc: mặc định tung tối đa 3 quả (cách nhau 0,7 s), quả dư xếp hàng', () => {
    const e = D.createEngine({}, { random: fixed });
    e.enqueue('normal', 5, {});
    for (let t = 0; t < 2000; t += 16) e.step(16);
    assert.equal(e.balls.length, 3);
    assert.equal(e.snapshot().queue, 2);
    assert.equal(e.snapshot().combo, 0);
});

test('hàng chờ: chỉnh 1 quả trên không, quả sau tung khi quả trước rơi; trần hàng chờ', () => {
    const e = D.createEngine({ queueMax: 3, maxBalls: 1 }, { random: fixed });
    assert.equal(e.enqueue('normal', 5, {}), 3);
    assert.ok(e.snapshot().events.some(x => x.type === 'queueFull'));
    e.step(16);
    assert.equal(e.balls.length, 1);
    assert.equal(e.snapshot().queue, 2);
    for (let t = 0; t < 10000 && e.balls.length; t += 16) e.step(16);   // quả đầu rơi
    for (let t = 0; t < 1500; t += 16) e.step(16);
    assert.equal(e.balls.length, 1, 'quả thứ hai đã tung');
    assert.equal(e.snapshot().queue, 1);
    // chưa thấy người: giữ cầu tối đa 8 s rồi vẫn tung (quà không mất trắng)
    const e2 = D.createEngine({ maxBalls: 1 }, { random: fixed });
    e2.setReady(false); e2.enqueue('normal', 1, {});
    for (let t = 0; t < 7000; t += 16) e2.step(16);
    assert.equal(e2.balls.length, 0);
    for (let t = 0; t < 1200; t += 16) e2.step(16);
    assert.equal(e2.balls.length, 1);
});

test('đội đầu: cầu rơi qua đầu chỉ nảy khi có CÚ ĐỘI ĐẦU thật (đủ tốc độ + quãng nhấc), lắc nhẹ / đi bộ thì rơi xuyên qua', () => {
    const mk = (cfg = {}) => { const e = D.createEngine(cfg, { random: fixed }); e.enqueue('normal', 1, {}); return [e, fallTo(e, 700)]; };
    let [e, b] = mk();
    assert.equal(e.contact([{ ...headAt(b, 100), rise: 40 }], NaN), 0, 'nhấc chậm (ngưỡng cũ 70 px/s) không còn tính');
    assert.equal(e.contact([{ ...headAt(b, 400), rise: 8 }], NaN), 0, 'giật nhanh nhưng quãng chỉ vài px (rung nhận diện) không tính');
    assert.equal(e.contact([{ ...headAt(b, 400), rise: 60 }], NaN), 1, 'đội đầu thật: nhanh + nhấc ~60 px');
    [e, b] = mk({ headPower: 200 });
    assert.equal(e.contact([{ ...headAt(b, 400), rise: 60 }], NaN), 0, 'Độ mạnh đội đầu 200 % → phải đội mạnh gấp đôi');
    assert.equal(e.contact([{ ...headAt(b, 500), rise: 90 }], NaN), 1);
    [e, b] = mk({ headPower: 50 });
    assert.equal(e.contact([{ ...headAt(b, 120), rise: 25 }], NaN), 1, '50 % → đội nhẹ cũng ăn');
    assert.equal(D.normalizeConfig({ headPower: 999 }).headPower, 250);
});
