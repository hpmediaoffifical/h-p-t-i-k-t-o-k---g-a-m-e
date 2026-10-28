// 🧪 Tự kiểm 🏃 BỊ ĐUỔI trong 🎥 Game Camera (nhóm A, thuần Node): lõi overlays/camgames/biduoi/core.cjs (chuẩn hoá kịch bản,
// mốc thời gian, vị trí người từng pha: lấy đà → phóng ra → vòng chạy xa nhỏ dần → chạy về phanh trượt, bốc video ngẫu nhiên
// không lặp / chỉ định) - 🧍 Bộ Tách Người dùng lại lõi này; phần nối server nằm ở scripts/body-selftest.cjs.
// Chạy: node scripts/biduoi-selftest.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../public/games/biduoi/core.js');

const G = { homeX: 540, homeY: 1800, halfW: 200, W: 1080, H: 1920 };

test('chuẩn hoá: mặc định 2 vòng zikzak nhỏ dần, kẹp số, hướng lạ → mặc định, video rỗng bị bỏ, trần 4 vòng', () => {
    const d = B.defaultConfig();
    assert.equal(d.scripts.length, 1);
    const sc = d.scripts[0];
    assert.deepEqual([sc.exitDir, sc.returnDir, sc.pick], ['left', 'right', 'random']);
    assert.deepEqual(sc.passes.map(p => p.dir), ['right', 'left']);              // trái → phải rồi phải → trái
    assert.ok(sc.passes[1].scale < sc.passes[0].scale && sc.passes[1].y < sc.passes[0].y, 'vòng sau nhỏ hơn + xa hơn');
    const n = B.normalizeScript({ exitDir: 'up', timing: { windupSec: 99, exitMs: -5 }, hip: 2,
        videos: ['', { file: '  ' }, 'D:/cho.mp4', { file: '/media/zombie.webm', name: '🧟 Zombie' }],
        passes: Array.from({ length: 9 }, () => ({ scale: 0.5 })) }, 0);
    assert.equal(n.exitDir, 'left');
    assert.equal(n.timing.windupSec, 10); assert.equal(n.timing.exitMs, 100);
    assert.equal(n.hip, 0.75);
    assert.deepEqual(n.videos, [{ file: 'D:/cho.mp4', name: '', fg: '' }, { file: '/media/zombie.webm', name: '🧟 Zombie', fg: '' }]);
    assert.equal(n.passes.length, B.MAX_PASSES);
    assert.deepEqual(n.passes.slice(0, 2).map(p => [p.dir, p.scaleEnd, p.yEnd]), [['right', 0.5, 0.8], ['left', 0.5, 0.8]]);   // thiếu dir → zikzak, thiếu …End = lúc vào
    const ids = B.normalizeScripts({ scripts: [{ id: 'x' }, { id: 'x' }, {}] }).map(s => s.id);
    assert.equal(new Set(ids).size, 3);
    assert.deepEqual(B.normalizeScripts({ scripts: [{ pick: 'fixed', pickIdx: 7, videos: ['a.mp4', 'b.mp4'] }] })[0].pickIdx, 1);
});

test('bốc video: chỉ định luôn 1 video; ngẫu nhiên không lặp liền (đủ mọi video), 1 video / không video', () => {
    const vids = ['cho.mp4', 'baga.mp4', 'zombie.mp4', 'canhsat.mp4'].map(file => ({ file }));
    assert.equal(B.pickVideo({ videos: vids, pick: 'fixed', pickIdx: 2 }, 2), 2);
    assert.equal(B.pickVideo({ videos: [], pick: 'random' }, -1), -1);
    assert.equal(B.pickVideo({ videos: vids.slice(0, 1), pick: 'random' }, 0), 0);
    let last = -1; const seen = new Set();
    for (let i = 0; i < 400; i++) {
        const v = B.pickVideo({ videos: vids, pick: 'random' }, last);
        assert.notEqual(v, last, 'không lặp liền');
        assert.ok(v >= 0 && v < 4);
        seen.add(v); last = v;
    }
    assert.equal(seen.size, 4);
    // biên: rnd sát 1 vẫn trong khoảng
    assert.equal(B.pickVideo({ videos: vids, pick: 'random' }, 3, () => 0.9999), 2);
    assert.equal(B.pickVideo({ videos: vids, pick: 'random' }, 0, () => 0), 1);
});

test('mốc thời gian: chờ → lấy đà → phóng → (chờ + vòng)… → vắng → chạy về → dừng', () => {
    const sc = B.normalizeScript({ timing: { waitSec: 1, windupSec: 1.2, exitMs: 500, awaySec: 2, returnMs: 800, settleMs: 400 },
        passes: [{ gapSec: 1, ms: 1000 }, { gapSec: 0.5, ms: 900 }] }, 0);
    const P = B.plan(sc);
    assert.deepEqual([P.waitEnd, P.windEnd, P.exitEnd], [1000, 2200, 2700]);
    assert.deepEqual(P.passes.map(p => [p.start, p.end]), [[3700, 4700], [5200, 6100]]);
    assert.deepEqual([P.retStart, P.retEnd, P.settleEnd], [8100, 8900, 9300]);
    const none = B.plan(B.normalizeScript({ passes: [], timing: { awaySec: 1 } }, 0));
    assert.equal(none.retStart, none.exitEnd + 1000);                        // không vòng nào: phóng ra → vắng → chạy về
});

test('vị trí từng pha: đứng yên lúc chờ, chân hoá vòng + ngả ngược khi lấy đà, ra khỏi màn đúng phía, vòng xa nhỏ + đúng chỗ chân', () => {
    const sc = B.normalizeScript({ exitDir: 'left', returnDir: 'right', timing: { waitSec: 1, windupSec: 1, exitMs: 500, awaySec: 1, returnMs: 800, settleMs: 400 },
        passes: [{ dir: 'right', gapSec: 1, ms: 1000, scale: 0.6, scaleEnd: 0.5, y: 0.8, yEnd: 0.75 }] }, 0);
    const P = B.plan(sc), at = e => B.stateAt(P, e, G);
    let s = at(500);
    assert.deepEqual([s.phase, s.x, s.y, s.s, s.wheel], ['wait', 540, 1800, 1, 0]);
    s = at(1500);
    assert.equal(s.phase, 'windup'); assert.equal(s.wheel, 1); assert.equal(s.x, 540);
    assert.ok(s.lean > 0, 'sắp chạy sang TRÁI → ngả sang phải lấy đà');
    s = at(2499);
    assert.equal(s.phase, 'exit'); assert.ok(s.x < -G.halfW + 5, 'cuối pha đã ra khỏi mép trái: ' + s.x); assert.equal(s.dir, -1);
    s = at(2800);
    assert.deepEqual([s.phase, s.visible], ['away', false]);
    s = at(3500 + 500);                                                    // giữa vòng 1 (3500–4500)
    assert.equal(s.phase, 'pass'); assert.equal(s.dir, 1);
    assert.ok(Math.abs(s.x - 540) < 20, 'giữa vòng ~ giữa màn: ' + s.x);
    assert.ok(Math.abs(s.s - 0.55) < 1e-9 && Math.abs(s.y - 0.775 * 1920) < 1e-6);
    assert.ok(at(3501).x < 0 && at(4499).x > 1080, 'vào từ trái, ra bên phải');
    s = at(5000);
    assert.deepEqual([s.phase, s.visible], ['away', false]);
    s = at(5500 + 1);                                                      // chạy về từ bên PHẢI
    assert.equal(s.phase, 'return'); assert.ok(s.x > 1080); assert.equal(s.dir, -1);
    const xs = []; for (let e = 5500; e <= 6300; e += 20) xs.push(at(e).x);
    assert.ok(Math.min(...xs) < 540 - 5, 'phanh trượt lố qua chỗ cũ rồi lùi lại');
    assert.ok(Math.abs(at(6299.9).x - 540) < 3);
    s = at(6500);
    assert.equal(s.phase, 'settle'); assert.ok(s.wheel > 0 && s.wheel < 1);
    assert.equal(at(P.endAt + 1).phase, 'done');
    assert.equal(B.stateAt(B.plan({ ...sc, exitDir: 'right' }), 2499, G).x > 1080, true);   // phóng sang phải
});

test('🧊 2.5D: mặc định bật hoà màu / bóng / máy quay, ⚡ nhẹ máy tắt; lớp trước theo video; phối cảnh tính cỡ theo chân trời', () => {
    const c = B.normalizeConfig({});
    assert.deepEqual([c.look.tint, c.look.shadow, c.look.camera, c.look.lite], [true, true, true, false]);
    const l = B.normalizeConfig({ look: { tint: false, tintAmt: 7, lite: true, shadowDir: 9 } }).look;
    assert.deepEqual([l.tint, l.tintAmt, l.lite, l.shadowDir, l.camera], [false, 1, true, 1.5, true]);
    const sc = B.normalizeScript({ videos: [{ file: 'D:/cho.mp4', fg: ' /media/bui-cay.webm ' }, 'D:/x.mp4'] }, 0);
    assert.deepEqual(sc.videos.map(v => v.fg), ['/media/bui-cay.webm', '']);
    assert.deepEqual(sc.persp, { on: false, horizon: 0.42 });
    // phối cảnh: chân ở chỗ thật = cỡ 1, ở chân trời = ~0, giữa = tỉ lệ thẳng; tắt = giữ cỡ đặt tay
    const ps = B.normalizeScript({ persp: { on: true, horizon: 0.4 }, timing: { waitSec: 0, windupSec: 0, exitMs: 100 },
        passes: [{ dir: 'right', gapSec: 0, ms: 1000, scale: 0.9, y: 0.8, yEnd: 0.6 }] }, 0);
    const P = B.plan(ps), hz = 0.4 * G.H;
    const s0 = B.stateAt(P, P.passes[0].start + 1, G), s1 = B.stateAt(P, P.passes[0].end - 1, G);
    assert.ok(Math.abs(s0.s - (0.8 * G.H - hz) / (G.homeY - hz)) < 0.01, String(s0.s));
    assert.ok(s1.s < s0.s && Math.abs(s1.s - (0.6 * G.H - hz) / (G.homeY - hz)) < 0.01);
    assert.equal(B.perspScale(P, G, hz), 0.03);                                              // tại chân trời: kẹp nhỏ nhất
    assert.equal(B.perspScale(P, { ...G, homeY: hz + 10 }, 1000), 0);                         // chân thật sát chân trời → bỏ, dùng cỡ tay
    const off = B.plan({ ...ps, persp: { on: false, horizon: 0.4 } });
    assert.equal(B.stateAt(off, off.passes[0].start + 1, G).s.toFixed(2), '0.90');
});
