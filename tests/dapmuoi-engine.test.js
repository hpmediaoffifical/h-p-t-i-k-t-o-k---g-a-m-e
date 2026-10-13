'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine, defaultConfig, normalizeConfig, normalizeAction, actionForGift, mosquitoesForGift, ACTION_TYPES } = require('../public/games/dapmuoi/game.js');
// rng tất định (mulberry32) cho các test thống kê — số đo với seed 7 ghi trong từng test.
const seeded = (seed) => { let t = seed; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ t >>> 15, 1 | t); r ^= r + Math.imul(r ^ r >>> 7, 61 | r); return ((r ^ r >>> 14) >>> 0) / 4294967296; }; };

// ---------- Task 1: config, sinh, bay ----------

test('defaultConfig đúng số spec và là bản sao', () => {
    const a = defaultConfig(), b = defaultConfig();
    assert.equal(a.hitMode, 'clap'); assert.equal(a.clapDistance, 1.2); assert.equal(a.clapSpeed, 900);
    assert.equal(a.hitRadius, 14); assert.equal(a.speed, 180); assert.equal(a.spawnPerSecond, 6);
    assert.equal(a.maxOnScreen, 300); assert.equal(a.idleSpawnSeconds, 8); assert.equal(a.maxPerGift, 100);
    assert.equal(a.coinsPerMosquito, 1); assert.equal(a.gentlePercent, 35); assert.equal(a.crowdFrom, 120);
    assert.equal(a.smartPercent, 10); assert.equal(a.smartLives, 3);
    assert.equal(a.actions.length, 5); assert.deepEqual(a.actions.map(x => x.type), ['release', 'spray', 'racket', 'net', 'cream']);
    a.speed = 1; a.actions.length = 0; assert.equal(b.speed, 180); assert.equal(b.actions.length, 5);
});

test('enqueue xả spawnPerSecond/giây, không vượt maxOnScreen, hàng đợi trần 2000', () => {
    const eng = createEngine({ ...defaultConfig(), spawnPerSecond: 6, maxOnScreen: 10, idleSpawnSeconds: 0 });
    assert.equal(eng.enqueue(5000), 2000);
    eng.step(1000); assert.equal(eng.snapshot().flying, 6);
    eng.step(1000); assert.equal(eng.snapshot().flying, 10);
    assert.equal(eng.snapshot().queue, 1990);
});

test('muỗi mới vào từ mép trái/phải, y trải 0–100%, dir theo vx', () => {
    const eng = createEngine({ ...defaultConfig(), spawnPerSecond: 1e6, idleSpawnSeconds: 0 });
    eng.enqueue(60); eng.step(16);
    const m = eng.snapshot().mosquitoes;
    assert.equal(m.length, 60);
    // sau 1 khung muỗi đã nhích ≤ 10px khỏi mép
    assert.ok(m.every(o => (o.x <= 10 && o.dir === 1) || (o.x >= 1070 && o.dir === -1)));
    assert.ok(m.some(o => o.x <= 10) && m.some(o => o.x >= 1070));
    assert.ok(m.every(o => o.y >= 0 && o.y <= 1920) && m.some(o => o.y < 300) && m.some(o => o.y > 1620));
});

test('sinh nền: idleSpawnSeconds=2 → sau 4s có 2 con khi hàng đợi rỗng', () => {
    const eng = createEngine({ ...defaultConfig(), idleSpawnSeconds: 2 });
    for (let i = 0; i < 250; i++) eng.step(16);
    assert.equal(eng.snapshot().flying, 2);
});

test('gentlePercent: speedMul bay nhẹ 0.25–0.5, còn lại 0.8–1.3; smartPercent gán smart + livesLeft', () => {
    const eng = createEngine({ ...defaultConfig(), spawnPerSecond: 1000, idleSpawnSeconds: 0, gentlePercent: 50, smartPercent: 50, smartLives: 3 });
    eng.enqueue(200); eng.step(16);
    const m = eng.snapshot().mosquitoes;
    assert.ok(m.every(x => (x.speedMul >= 0.25 && x.speedMul <= 0.5) || (x.speedMul >= 0.8 && x.speedMul <= 1.3)));
    assert.ok(m.some(x => x.speedMul <= 0.5) && m.some(x => x.speedMul >= 0.8));
    assert.ok(m.filter(x => x.smart).every(x => x.livesLeft === 3) && m.some(x => x.smart) && m.some(x => !x.smart));
});

test('muỗi bay về đích khắp sân: sau 60s có con ở 4 góc phần tư, không văng xa khỏi sân', () => {
    const eng = createEngine({ ...defaultConfig(), spawnPerSecond: 1000, idleSpawnSeconds: 0 });
    eng.enqueue(80); for (let i = 0; i < 3600; i++) eng.step(16);
    const m = eng.snapshot().mosquitoes;
    for (const [qx, qy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) assert.ok(m.some(o => (o.x > 540) === !!qx && (o.y > 960) === !!qy), `góc ${qx},${qy}`);
    assert.ok(m.every(o => o.x > -130 && o.x < 1210 && o.y > -130 && o.y < 2050));
});

test('hệ số đàn: flying > crowdFrom thì tốc độ trung bình giảm, sàn 0.4', () => {
    const mk = (n) => {
        const e = createEngine({ ...defaultConfig(), spawnPerSecond: 1e6, maxOnScreen: 5000, idleSpawnSeconds: 0, crowdFrom: 120, gentlePercent: 0, smartPercent: 0 });
        e.enqueue(n); e.step(16); e.step(16);
        const m = e.snapshot().mosquitoes; assert.equal(m.length, n);
        return m.reduce((s, o) => s + Math.hypot(o.vx, o.vy), 0) / m.length;
    };
    assert.ok(mk(240) < mk(60) * 0.7); assert.ok(mk(2000) > mk(60) * 0.3);
});

test('setFace: faceAttract bật → có muỗi ghé mặt (≥15/100 sau 20s) và nhiều hơn khi tắt', () => {
    const near = (faceAttract) => {
        const eng = createEngine({ ...defaultConfig(), spawnPerSecond: 1e6, idleSpawnSeconds: 0, faceRadius: 260, faceAttract }, { random: seeded(3) });   // seed 3: on 21, off 12
        eng.enqueue(100); for (let i = 0; i < 1200; i++) { eng.setFace(540, 500); eng.step(16); }
        return eng.snapshot().mosquitoes.filter(o => Math.hypot(o.x - 540, o.y - 500) <= 260).length;
    };
    const on = near(true), off = near(false);
    assert.ok(on >= 15, `on=${on}`); assert.ok(on > off, `on=${on} off=${off}`);
});

// ---------- Task 2: đập, chết, combo, muỗi thông minh ----------

function one(cfgExtra = {}) {
    const e = createEngine({ ...defaultConfig(), spawnPerSecond: 1e6, idleSpawnSeconds: 0, smartPercent: 0, ...cfgExtra });
    e.enqueue(1); e.step(16); return e;
}

test('hit trúng trong r + nửa cỡ muỗi: chết, score/killed +1, event kill; hụt → event miss', () => {
    const e = one(); const m = e.snapshot().mosquitoes[0];
    assert.equal(e.hit(m.x + 9999, m.y, 100), 0); assert.equal(e.snapshot().events[0].type, 'miss');
    assert.equal(e.hit(m.x + 150 + 70, m.y, 150), 1);
    const s = e.snapshot(); assert.equal(s.score, 1); assert.equal(s.killed, 1); assert.equal(s.flying, 0);
    assert.equal(s.mosquitoes[0].state, 'dead'); assert.equal(s.events[0].type, 'kill'); assert.equal(s.events[0].n, 1);
});

test('muỗi chết rơi với g=1600, xoá khi y > H+100 hoặc sau 2.5s', () => {
    const e = one(); const m = e.snapshot().mosquitoes[0]; e.hit(m.x, m.y, 10);
    e.step(16); const vy1 = e.snapshot().mosquitoes[0].vy;
    for (let i = 0; i < 12; i++) e.step(16);                   // ~200ms: vẫn còn trên sân (chưa quá 2.5s, chưa rơi khỏi đáy)
    const vy2 = e.snapshot().mosquitoes[0].vy;
    assert.ok(vy2 > vy1); for (let i = 0; i < 200; i++) e.step(16);
    assert.equal(e.snapshot().mosquitoes.length, 0);
});

test('combo đếm theo CÚ đập: 1 cú giết 2 con (killMode all) vẫn là combo 1', () => {
    const e = createEngine({ ...defaultConfig(), killMode: 'all', spawnPerSecond: 1e6, idleSpawnSeconds: 0, smartPercent: 0 });
    e.enqueue(2); e.step(16);
    const [a, b] = e.snapshot().mosquitoes;
    assert.equal(e.hit((a.x + b.x) / 2, (a.y + b.y) / 2, 3000), 2);
    assert.equal(e.snapshot().combo, 1);
});

test('combo: 2 cú trúng cách < 1.5s → combo 2; cách 2s → về 1', () => {
    const e = createEngine({ ...defaultConfig(), spawnPerSecond: 1e6, idleSpawnSeconds: 0, smartPercent: 0 });
    e.enqueue(3); e.step(16);
    const fly = () => e.snapshot().mosquitoes.find(o => o.state === 'fly');   // đọc toạ độ MỚI trước mỗi cú
    let m = fly(); e.hit(m.x, m.y, 1); e.step(500); m = fly(); e.hit(m.x, m.y, 1); assert.equal(e.snapshot().combo, 2);
    e.step(2000); m = fly(); e.hit(m.x, m.y, 1); assert.equal(e.snapshot().combo, 1);
});

test('muỗi thông minh né smartLives−1 lần rồi chết; lúc dodge bất tử, vụt xa ≥ 300px', () => {
    const e = one({ smartPercent: 100, smartLives: 3 });
    let m = e.snapshot().mosquitoes[0]; assert.equal(m.livesLeft, 3);
    assert.equal(e.hit(m.x, m.y, 1), 0);
    let s = e.snapshot(); assert.equal(s.events[0].type, 'dodge'); assert.equal(s.mosquitoes[0].state, 'dodge'); assert.equal(s.mosquitoes[0].livesLeft, 2);
    assert.equal(e.hit(s.mosquitoes[0].x, s.mosquitoes[0].y, 2000), 0);   // bất tử lúc né
    for (let i = 0; i < 25; i++) e.step(16);
    m = e.snapshot().mosquitoes[0]; assert.equal(m.state, 'fly'); assert.ok(Math.hypot(m.x - s.mosquitoes[0].x, m.y - s.mosquitoes[0].y) >= 300);
    assert.equal(e.hit(m.x, m.y, 1), 0); for (let i = 0; i < 25; i++) e.step(16);
    m = e.snapshot().mosquitoes[0]; assert.equal(m.livesLeft, 1);
    assert.equal(e.hit(m.x, m.y, 1), 1);
});

// ---------- Task 3: hành động, chuẩn hoá config, luật quà ----------

test('normalizeConfig: config rỗng/rác → mặc định; actions params clamp; type lạ → release', () => {
    const c = normalizeConfig({ bite: {}, speed: 'abc', actions: [{ type: 'laser', params: { count: 99999, junk: 1 } }], giftRules: null });   // bite:{} = config sau GĐ2
    assert.equal(c.speed, 180); assert.equal(c.actions.length, 1); assert.equal(c.actions[0].type, 'release');
    assert.deepEqual(c.actions[0].params, { count: 1000 }); assert.deepEqual(c.giftRules, []);
    assert.equal(normalizeConfig({}).actions.length, 5);
    assert.equal(normalizeConfig(null).actions.length, 5);
});

test('actionForGift ưu tiên id, dự phòng tên; action tắt bỏ qua', () => {
    const c = normalizeConfig({ actions: [{ type: 'spray', giftId: '5655', giftName: 'Rose', enabled: true }, { type: 'net', giftId: '1', giftName: 'GG', enabled: false }] });
    assert.equal(actionForGift(c, '5655', '').type, 'spray'); assert.equal(actionForGift(c, '', 'rose').type, 'spray'); assert.equal(actionForGift(c, '1', 'GG'), null);
});

test('mosquitoesForGift: action → 0; rule → count×repeat; rule tắt → 0; xu/con; trần maxPerGift', () => {
    const c = normalizeConfig({ coinsPerMosquito: 5, maxPerGift: 100, actions: [{ type: 'spray', giftId: '9' }], giftRules: [{ giftId: '7', count: 3, enabled: true }, { giftId: '8', count: 3, enabled: false }] });
    assert.equal(mosquitoesForGift(c, '9', '', 500, 1), 0); assert.equal(mosquitoesForGift(c, '7', '', 1, 4), 12);
    assert.equal(mosquitoesForGift(c, '8', '', 500, 1), 0); assert.equal(mosquitoesForGift(c, '1', '', 23, 2), 9);
    assert.equal(mosquitoesForGift(c, '1', '', 5000, 1), 100); assert.equal(mosquitoesForGift({ ...c, coinsPerMosquito: 0 }, '1', '', 500, 1), 0);
});

test('spray: mây nở tới radius trong ms, giết tối đa count (kể cả smart), không combo', () => {
    const e = createEngine({ ...defaultConfig(), spawnPerSecond: 1e6, idleSpawnSeconds: 0, smartPercent: 100 });
    e.enqueue(100); e.step(16);
    e.spray({ radius: 3000, ms: 1000, count: 30, percent: 0 });
    assert.ok(e.snapshot().spray && e.snapshot().spray.r < 3000);
    for (let i = 0; i < 70; i++) e.step(16);
    const s = e.snapshot(); assert.equal(s.killed, 30); assert.equal(s.combo, 0); assert.equal(s.spray, null);
});

test('spray percent=50 giết nửa số đang bay', () => {
    const e = createEngine({ ...defaultConfig(), spawnPerSecond: 1e6, idleSpawnSeconds: 0 }); e.enqueue(40); e.step(16);
    e.spray({ radius: 3000, ms: 100, count: 0, percent: 50 }); for (let i = 0; i < 10; i++) e.step(16);
    assert.equal(e.snapshot().killed, 20);
});

test('racket: sweep chỉ giết khi racketMs>0, giết cả smart, cộng dồn trần 60s', () => {
    const e = createEngine({ ...defaultConfig(), spawnPerSecond: 1e6, idleSpawnSeconds: 0, smartPercent: 100 }); e.enqueue(1); e.step(16);
    const m = e.snapshot().mosquitoes[0];
    assert.equal(e.sweep(m.x, m.y, 100), 0);
    e.racket(50); e.racket(50); assert.equal(e.snapshot().racketMs, 60000);
    assert.equal(e.sweep(m.x, m.y, 100), 1);
});

test('net cộng dồn, trần 120s', () => {
    const e = createEngine(defaultConfig());
    e.net(2); e.net(200); assert.equal(e.snapshot().netMs, 120000);
});

test('net: chặn xả hàng đợi và sinh nền, hết màn xả tiếp (quà trong lúc màn không mất)', () => {
    const e = createEngine({ ...defaultConfig(), spawnPerSecond: 10, idleSpawnSeconds: 1 });
    e.net(2); e.enqueue(5); for (let i = 0; i < 100; i++) e.step(16);                 // 1.6s còn màn
    assert.equal(e.snapshot().flying, 0); assert.equal(e.snapshot().queue, 5);
    for (let i = 0; i < 100; i++) e.step(16); assert.equal(e.snapshot().flying, 5);   // 3.2s: hết màn, xả 5
});

test('applyAction × qty', () => {
    const e = createEngine({ ...defaultConfig(), idleSpawnSeconds: 0 });
    e.applyAction(normalizeAction({ type: 'release', params: { count: 7 } }, 0), 3); assert.equal(e.snapshot().queue, 21);
    e.applyAction(normalizeAction({ type: 'racket', params: { seconds: 10 } }, 1), 2); assert.equal(e.snapshot().racketMs, 20000);
});

// ---------- Sửa sau review ----------

test('màn đầy không tích spawnAcc: giết xong, lấp lại theo spawnPerSecond chứ không bùng ngay', () => {
    const e = createEngine({ ...defaultConfig(), spawnPerSecond: 6, maxOnScreen: 20, idleSpawnSeconds: 0, smartPercent: 0 });
    e.enqueue(500);
    for (let i = 0; i < 600; i++) e.step(16);                         // ~10s màn đầy
    assert.equal(e.snapshot().flying, 20);
    e.spray({ radius: 3000, ms: 100, count: 15, percent: 0 });
    for (let i = 0; i < 10; i++) e.step(16);                          // mây giết 15 trong 0.16s
    assert.ok(e.snapshot().flying <= 7, 'sau xịt còn ≤ 7');
    for (let i = 0; i < 20; i++) e.step(16);                          // +0.32s → tối đa thêm ~2–3 con
    assert.ok(e.snapshot().flying <= 10, `0.3s sau xịt chỉ được lấp ≤ 3 con, thấy ${e.snapshot().flying}`);
});

test('normalizeAction: params rác → mặc định của loại (không về min)', () => {
    const a = normalizeAction({ type: 'spray', params: { count: 'abc', ms: 'x', radius: 99999 } }, 0);
    assert.deepEqual(a.params, { radius: 1500, ms: 2500, count: 50, percent: 0 });
});

test('normalizeConfig: actions [] giữ rỗng (người dùng xoá hết), phần tử rác bị bỏ, thiếu khoá → 5 mặc định', () => {
    assert.equal(normalizeConfig({ actions: [] }).actions.length, 0);
    assert.equal(normalizeConfig({ bite: {}, actions: [null, 5, { type: 'net' }] }).actions.length, 1);
    assert.equal(normalizeConfig({}).actions.length, 5);
});

test('muỗi thông minh vùng trúng to hơn 15% như hình vẽ', () => {
    const e = createEngine({ ...defaultConfig(), spawnPerSecond: 1e6, idleSpawnSeconds: 0, smartPercent: 100, smartLives: 2 });
    e.enqueue(1); e.step(16);
    const m = e.snapshot().mosquitoes[0];
    // bán kính đập 0 + nửa cỡ 75×1.15 = 86.25 → điểm cách 80 phải CHẠM (con thông minh còn 2 mạng thì né, không chết)
    assert.equal(e.hit(m.x + 80, m.y, 0), 0);
    assert.equal(e.snapshot().events[0].type, 'dodge');
    const n = createEngine({ ...defaultConfig(), spawnPerSecond: 1e6, idleSpawnSeconds: 0, smartPercent: 0 });
    n.enqueue(1); n.step(16); const k = n.snapshot().mosquitoes[0];
    assert.equal(n.hit(k.x + 80, k.y, 0), 0); assert.equal(n.snapshot().events[0].type, 'miss');   // con thường cùng khoảng cách: hụt
});

// ---------- Phản hồi sau khi chơi thật 13/10 ----------

test('killMode one (mặc định): 1 cú vỗ chỉ giết 1 con gần điểm đập nhất; all: giết hết trong vòng', () => {
    const mk = (killMode) => { const e = createEngine({ ...defaultConfig(), killMode, spawnPerSecond: 1e6, idleSpawnSeconds: 0, smartPercent: 0 }); e.enqueue(12); e.step(16); return e; };
    assert.equal(defaultConfig().killMode, 'one');
    const one = mk('one');
    const m = one.snapshot().mosquitoes;
    const target = m.reduce((a, b) => Math.hypot(a.x - 540, a.y - 960) < Math.hypot(b.x - 540, b.y - 960) ? a : b);
    assert.equal(one.hit(540, 960, 5000), 1);
    assert.equal(one.snapshot().mosquitoes.find(o => o.state === 'dead').id, target.id);
    assert.equal(mk('all').hit(540, 960, 5000), 12);
});

test('ít muỗi: phần lớn ở hai bên mép, không dồn giữa mặt; vẫn có con bay sang bên kia', () => {
    const e = createEngine({ ...defaultConfig(), spawnPerSecond: 1e6, idleSpawnSeconds: 0 }, { random: seeded(3) });   // seed 3: mép 14/20, qua lại 20
    e.enqueue(20);
    const crossed = new Set(), side = new Map();
    for (let i = 0; i < 2500; i++) {
        e.setFace(540, 700); e.step(16);
        if (i % 25 === 0) for (const o of e.snapshot().mosquitoes) { const s = o.x < 540 ? 'L' : 'R'; if (side.has(o.id) && side.get(o.id) !== s) crossed.add(o.id); side.set(o.id, s); }
    }
    const m = e.snapshot().mosquitoes;
    const onSides = m.filter(o => Math.abs(o.x - 540) > 0.22 * 1080).length;
    assert.ok(onSides >= m.length * 0.5, `ở hai bên ${onSides}/${m.length}`);
    assert.ok(crossed.size >= 5, `qua lại ${crossed.size}`);
});

// ---------- GĐ2: muỗi chích + kem ----------

const SPOTS = [
    { x: 540, y: 600, frame: 'head', a: 0, b: -0.45, zone: 'forehead' },
    { x: 470, y: 720, frame: 'head', a: -0.35, b: 0.15, zone: 'cheekL' },
    { x: 380, y: 930, frame: 'torso', a: -0.4, b: 0.05, zone: 'shoulderL' }
];
// Engine với 1 con, thấy người, afterSec ngắn, không ngẫu nhiên thời gian (rng cố định 0.5 → ×1.0)
function biter(extra = {}) {
    const e = createEngine({ ...defaultConfig(), spawnPerSecond: 1e6, idleSpawnSeconds: 0, smartPercent: 0, gentlePercent: 0,
        bite: { ...defaultConfig().bite, afterSec: 2, landSec: 1 }, ...extra }, { random: () => 0.5 });
    e.enqueue(1); e.step(16);
    return e;
}
function run(e, ms, seen = true) { for (let t = 0; t < ms; t += 16) { e.setPersonSeen(seen); e.setBiteSpots(SPOTS); e.step(16); } }
// chạy tới khi con đầu tiên đậu (tối đa 15 s)
function untilLanded(e) { for (let t = 0; t < 15000; t += 16) { run(e, 16); if (e.snapshot().mosquitoes[0].state === 'landed') return; } throw new Error('không đậu'); }

test('config bite mặc định + ACTION_TYPES có cream + 5 hành động mặc định', () => {
    const c = defaultConfig();
    assert.deepEqual(c.bite, { enabled: true, afterSec: 20, landSec: 1.2, gapSec: 3, bumpSec: 30, maxBumps: 12, maxLanded: 3, zones: { forehead: true, cheeks: true, chin: true, neck: true, shoulders: true } });
    assert.ok(ACTION_TYPES.includes('cream'));
    assert.equal(c.actions.length, 5); assert.equal(c.actions[4].type, 'cream'); assert.deepEqual(c.actions[4].params, { seconds: 30 });
    assert.deepEqual(normalizeConfig({}).bite, c.bite);
    assert.equal(normalizeConfig({ bite: { afterSec: 'x', zones: { cheeks: false } } }).bite.afterSec, 20);
    assert.equal(normalizeConfig({ bite: { zones: { cheeks: false } } }).bite.zones.cheeks, false);
});

test('bay quá afterSec và thấy người → seek → tới điểm đậu → landed → hết landSec → event bite, về fly', () => {
    const e = biter();
    run(e, 1500); assert.equal(e.snapshot().mosquitoes[0].state, 'fly');
    run(e, 700); assert.equal(e.snapshot().mosquitoes[0].state, 'seek');
    untilLanded(e);
    let s = e.snapshot(); const m = s.mosquitoes[0];
    assert.equal(m.state, 'landed'); assert.ok(Math.hypot(m.x - m.spot.x, m.y - m.spot.y) < 1, 'đậu đúng điểm');
    assert.equal(s.landed, 1);
    run(e, 1100);
    s = e.snapshot();
    assert.equal(s.mosquitoes[0].state, 'fly'); assert.equal(s.bites, 1);
});

test('event bite mang frame/a/b/zone của điểm đậu; muỗi sau chích bay chậm 0.7×', () => {
    const e = biter();
    let ev = [];
    for (let t = 0; t < 12000 && !ev.length; t += 16) { e.setPersonSeen(true); e.setBiteSpots(SPOTS); e.step(16); ev = e.snapshot().events.filter(x => x.type === 'bite'); }
    assert.equal(ev.length, 1);
    assert.ok(['head', 'torso'].includes(ev[0].frame)); assert.ok(Number.isFinite(ev[0].a) && Number.isFinite(ev[0].b)); assert.ok(ev[0].zone);
    const m = e.snapshot().mosquitoes[0]; assert.ok(m.slowUntil > 0);
});

test('không thấy người → không seek; đang đậu mà mất người → dừng đếm, không chích', () => {
    const e = biter();
    run(e, 5000, false); assert.equal(e.snapshot().mosquitoes[0].state, 'fly');
    untilLanded(e);
    run(e, 5000, false); assert.equal(e.snapshot().bites, 0);
    assert.equal(e.snapshot().mosquitoes[0].state, 'landed');
});

test('bite.enabled false → không bao giờ seek', () => {
    const e = biter({ bite: { ...defaultConfig().bite, enabled: false, afterSec: 1 } });
    run(e, 6000); assert.equal(e.snapshot().mosquitoes[0].state, 'fly');
});

test('maxLanded: tối đa 3 con đậu cùng lúc', () => {
    const e = createEngine({ ...defaultConfig(), spawnPerSecond: 1e6, idleSpawnSeconds: 0, smartPercent: 0, bite: { ...defaultConfig().bite, afterSec: 1, landSec: 60, maxLanded: 3 } }, { random: () => 0.5 });
    e.enqueue(10); e.step(16); run(e, 15000);
    const s = e.snapshot(); assert.equal(s.landed, 3); assert.equal(s.mosquitoes.filter(m => m.state === 'seek').length, 0);
});

test('đập trúng con đang đậu: chết, +2 điểm, event kill caught', () => {
    const e = biter(); untilLanded(e);
    const m = e.snapshot().mosquitoes[0]; assert.equal(m.state, 'landed');
    assert.equal(e.hit(m.x, m.y, 10), 1);
    const s = e.snapshot(); assert.equal(s.score, 2); assert.equal(s.events[0].caught, true); assert.equal(s.bites, 0);
});

test('cream: cộng dồn trần 120s; đẩy văng con đang seek/landed; không seek khi kem còn', () => {
    const e = biter(); untilLanded(e); assert.equal(e.snapshot().mosquitoes[0].state, 'landed');
    e.cream(100); e.cream(100); let s = e.snapshot(); assert.equal(s.creamMs, 120000);
    assert.ok(s.events.some(x => x.type === 'repel' && x.n === 1));
    assert.equal(s.mosquitoes[0].state, 'dodge');
    run(e, 20000); assert.equal(e.snapshot().mosquitoes[0].state, 'fly');
    const c = createEngine({ ...defaultConfig(), idleSpawnSeconds: 0 });
    c.applyAction(normalizeAction({ type: 'cream', params: { seconds: 10 } }, 0), 2); assert.equal(c.snapshot().creamMs, 20000);
});

test('config lưu trước GĐ2 (không có bite) → tự thêm hành động Kem; config đã có bite thì giữ nguyên danh sách', () => {
    const old = normalizeConfig({ actions: [{ type: 'release' }, { type: 'spray' }] });
    assert.deepEqual(old.actions.map(a => a.type), ['release', 'spray', 'cream']);
    const kept = normalizeConfig({ bite: { enabled: true }, actions: [{ type: 'release' }] });
    assert.deepEqual(kept.actions.map(a => a.type), ['release']);
    assert.equal(normalizeConfig({ actions: [] }).actions.length, 0, 'xoá hết thì không thêm');
});

test('bite.gapSec: sau một cú chích, không con nào bắt đầu tìm người trong gapSec', () => {
    const e = createEngine({ ...defaultConfig(), spawnPerSecond: 1e6, idleSpawnSeconds: 0, smartPercent: 0, bite: { ...defaultConfig().bite, afterSec: 1, landSec: 0.5, maxLanded: 1, gapSec: 5 } }, { random: () => 0.5 });
    assert.equal(defaultConfig().bite.gapSec, 3);
    e.enqueue(4); e.step(16);
    let firstBiteAt = -1, secondBiteAt = -1;
    for (let t = 0; t < 30000 && secondBiteAt < 0; t += 16) {
        e.setPersonSeen(true); e.setBiteSpots(SPOTS); e.step(16);
        if (e.snapshot().events.some(x => x.type === 'bite')) { if (firstBiteAt < 0) firstBiteAt = t; else secondBiteAt = t; }
    }
    assert.ok(firstBiteAt > 0 && secondBiteAt > 0, `bite lần 1 ${firstBiteAt} lần 2 ${secondBiteAt}`);
    assert.ok(secondBiteAt - firstBiteAt >= 5000, `cách nhau ${secondBiteAt - firstBiteAt}ms`);
});
