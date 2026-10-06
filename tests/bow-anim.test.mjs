// node --test tests/bow-anim.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const HpBow = require('../public/games/bancung/bow-anim.js');

test('geometry: dây nối đúng 2 đầu cành, nghỉ thì dây thẳng', () => {
    const g = HpBow.geometry(0, 0);
    assert.equal(g.string.top.x, g.tips.top.x + 1);
    assert.equal(g.string.top.y, g.tips.top.y);
    assert.equal(g.string.bot.y, 200 - g.tips.top.y);          // đối xứng trên/dưới
    assert.equal(g.nock.x, g.string.top.x, 'nghỉ: điểm lắp tên nằm trên đường dây thẳng');
});

test('geometry: kéo căng → dây lùi về sau, cành uốn vào, mũi tên vẫn nhô qua tay cầm', () => {
    const rest = HpBow.geometry(0, 0), full = HpBow.geometry(1, 0);
    assert.ok(full.nock.x < rest.nock.x - 45, 'dây kéo lùi ≥ 45');
    assert.ok(full.tips.top.y > rest.tips.top.y, 'đầu cành trên bị kéo xuống (uốn)');
    assert.ok(full.nock.x + HpBow.ARROW_LEN > HpBow.RISER_FRONT + 15, 'mũi tên nhô qua tay cầm khi kéo hết');
    assert.ok(/^M[\d.\-]+,[\d.\-]+ /.test(full.limbTop) && full.limbTop.endsWith('Z'), 'cành là hình kín');
});

// Đồng hồ giả: bước 16ms (60fps), trả về các mốc buông dây.
function run(ctrl, shotsAt, untilMs) {
    const releases = [];
    let qi = 0;
    for (let t = 0; t <= untilMs; t += 16) {
        while (qi < shotsAt.length && shotsAt[qi] <= t) {
            const at = shotsAt[qi++];
            ctrl.shoot(lead => releases.push({ at, rel: at + lead, lead }), { drawMs: 110, now: t });
        }
        ctrl.step(t);
    }
    return releases;
}

test('timeline: 1 phát → kéo rồi mới buông (~110–200ms), sau đó lắp tên mới và về nghỉ', () => {
    const c = HpBow.createController();
    const r = run(c, [0], 1200);
    assert.equal(r.length, 1);
    assert.ok(r[0].rel >= 100 && r[0].rel <= 200, 'buông lúc ' + r[0].rel);
    assert.equal(r[0].lead, r[0].rel - r[0].at, 'báo đúng độ trễ cho phần bay bù lại');
    assert.equal(c.phase, 'idle');
    assert.equal(c.arrowOpacity, 1, 'đã lắp tên mới');
    assert.equal(c.draw, 0);
});

test('timeline: bắn liên thanh 20 phát cách 120ms → đủ 20 lần buông, trễ không dồn', () => {
    const c = HpBow.createController();
    const shots = Array.from({ length: 20 }, (_, i) => i * 120);
    const r = run(c, shots, 4000);
    assert.equal(r.length, 20);
    const maxLead = Math.max(...r.map(x => x.lead));
    assert.ok(maxLead <= 160, 'trễ lớn nhất ' + maxLead + 'ms (phát đầu kéo đủ)');
    const lastLeads = r.slice(-10).map(x => x.lead);
    assert.ok(Math.max(...lastLeads) <= 100, 'cuối loạt vẫn không dồn: ' + lastLeads);
});

test('timeline: dồn 10 phát cùng lúc → xả bớt ngay, không treo hàng đợi', () => {
    const c = HpBow.createController();
    const r = run(c, Array(10).fill(0), 2000);
    assert.equal(r.length, 10);
    assert.ok(Math.max(...r.map(x => x.rel)) <= 600, 'xong cả loạt trong 600ms');
});

test('ARROW_SVG: có đủ thân, đầu, lông, khấc — mũi nhọn đúng chiều dài', () => {
    const s = HpBow.arrowSvg(100);
    for (const cls of ['shaft', 'head', 'fletch', 'nock']) assert.ok(s.includes('class="' + cls + '"'), cls);
    assert.ok(s.includes('L100,0'), 'mũi nhọn ở x = chiều dài');
});

test('lông đuôi đúng chiều: chỗ cao nhất nằm phía khấc (sau), phía trước thấp dần', () => {
    const s = HpBow.arrowSvg(100);
    const d = s.match(/class="fletch" d="([^"]+)"/)[1];
    const pts = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(m => ({ x: +m[1], y: +m[2] }));
    const tallest = pts.reduce((a, p) => (Math.abs(p.y) > Math.abs(a.y) ? p : a));
    const front = pts.reduce((a, p) => (p.x > a.x ? p : a));
    assert.ok(tallest.x < 12, 'chỗ cao nhất phải sát khấc, đang ở x=' + tallest.x);
    assert.ok(Math.abs(front.y) <= 2, 'mép trước phải thấp, đang cao ' + front.y);
});
