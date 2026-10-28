// 🧪 Lõi 🧍 BỘ TÁCH NGƯỜI (public/games/body/core.js) + file hiệu ứng / overlay / panel - chuyển từ HP LIVE NPC
// scripts/body-selftest.cjs @1e884fe (chỉ phần thuần; phần server NPC thay bằng tests/body-server.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const B = require('../public/games/body/core.js');
const GROUPS = [
    { id: 'common', name: 'MẶC ĐỊNH', enabled: true },
    { id: 'g_cas', name: 'Caspian', enabled: false, activatedAt: 5 },
    { id: 'g_yuna', name: 'Yuna', enabled: true, activatedAt: 7 }
];
// queueMode 'now' (⚡ Phát ngay): các bài nối server cũ kiểm đường phát NGAY; chế độ vào 📋 DANH SÁCH có bài riêng (QCFG).
const CFG = (mode = 'now') => B.normalizeConfig({
    profiles: [{ id: 'all', groupId: '' }, { id: 'yuna', groupId: 'g_yuna', scale: 80 }, { id: 'cas', groupId: 'g_cas' }],
    haucanh: { items: [
        { id: 'x1', name: 'Pháo', gifts: [{ giftId: '5655' }, { giftId: '9' }], queueMode: mode },
        { id: 'y1', name: 'Hồ ly', profileId: 'yuna', file: '/media/duoi.webm', gifts: [{ giftId: '5655' }], queueMode: mode },
        { id: 'c1', profileId: 'cas', gifts: [{ giftId: '77' }], queueMode: mode }] },
    roiho: { scripts: [{ id: 'r1', name: 'Hố chung', gifts: [{ giftId: '5655' }], queueMode: mode }, { id: 'r2', name: 'Hố Yuna', profileId: 'yuna', gifts: [{ giftId: '5655' }, { giftId: '11' }], queueMode: mode }] },
    biduoi: { scripts: [{ id: 'b1', name: 'Chó đuổi', videos: ['G:/cho.mp4', 'G:/ba.mp4'], gifts: [{ giftId: '5655' }, { giftId: '12' }], queueMode: mode }, { id: 'b2', profileId: 'cas', gifts: [{ giftId: '12' }], queueMode: mode }] }
});

test('normalizeConfig: mặc định đủ 3 nhánh + hồ sơ, kẹp số, id trùng; nền mặc định 🏠 Phòng thật (nâng 1 lần effect cũ)', () => {
    const d = B.normalizeConfig(null);
    assert.deepEqual([d.roiho.bgMode, d.biduoi.bgMode], ['room', 'room']);
    assert.equal(B.normalizeConfig({ roiho: { bgMode: 'effect' } }).roiho.bgMode, 'room');                  // lưu từ trước: mặc định cũ
    assert.equal(B.normalizeConfig({ roiho: { bgMode: 'effect', bgModeV: 2 } }).roiho.bgMode, 'effect');    // streamer đã tự chọn
    assert.equal(B.normalizeConfig({ biduoi: { bgMode: 'none' } }).biduoi.bgMode, 'none');
    assert.deepEqual([d.enabled, d.profiles.length, d.roiho.scripts.length, d.biduoi.scripts.length, d.haucanh.items.length, d.matte.model], [true, 0, 1, 1, 2, 'selfie']);   // 🦊 2 = Hồ ly trắng + Hồ ly đen mẫu giao kèm
    const c = B.normalizeConfig({ comboMax: 99, profiles: [{ id: 'a', scale: 5 }, { id: 'a' }], roiho: { bgMode: 'always', scripts: [{ id: 's', shake: 999 }, { id: 's' }] },
        biduoi: { bgMode: 'room', scripts: [] }, haucanh: { items: [{ id: 'i', durSec: -1, gifts: [{ giftName: 'không id' }, { giftId: 3 }] }] } });
    assert.equal(c.comboMax, 10);
    assert.deepEqual(c.profiles.map(p => [p.id, p.scale]), [['a', 30], ['a_', 100]]);
    assert.deepEqual([c.roiho.bgMode, c.roiho.scripts.map(s => s.id), c.roiho.scripts[0].shake], ['effect', ['s', 's_'], 80]);
    assert.deepEqual([c.biduoi.bgMode, c.biduoi.scripts.length], ['room', 0]);          // xoá hết kịch bản = giữ rỗng
    assert.deepEqual(c.haucanh.items[0].gifts, [{ giftId: '3', giftName: '', giftImage: '' }]);
});

test('quà → Hậu Cảnh + hành động: hồ sơ NPC đang bật thắng "mọi hồ sơ"; NPC tắt không nhận; quà ở cả Rơi Hố lẫn Bị Đuổi = 2 lượt', () => {
    const c = CFG();
    let h = B.pickForGift(c, ['g_yuna'], '5655');
    assert.deepEqual([h.haucanh.item.id, h.haucanh.profile.id], ['y1', 'yuna']);
    assert.deepEqual(h.actions.map(a => [a.kind, a.script.id]), [['roiho', 'r2'], ['biduoi', 'b1']]);
    h = B.pickForGift(c, [], '5655');                                    // không NPC nào bật → chỉ "mọi hồ sơ"
    assert.deepEqual([h.haucanh.item.id, h.haucanh.profile.id, h.actions.map(a => a.script.id).join()], ['x1', 'all', 'r1,b1']);
    h = B.pickForGift(c, ['g_yuna'], '77');                              // Caspian tắt
    assert.deepEqual([h.haucanh, h.actions.length], [null, 0]);
    h = B.pickForGift(c, ['g_cas', 'g_yuna'], '12');                     // Caspian bật sau cùng → kịch bản riêng của Caspian
    assert.deepEqual(h.actions.map(a => a.script.id), ['b2']);
    assert.deepEqual(B.pickForGift(c, ['g_yuna'], ''), { haucanh: null, actions: [] });
    // hồ sơ đã xoá: kịch bản gắn với nó KHÔNG chạy cho mọi NPC
    const gone = B.normalizeConfig({ roiho: { scripts: [{ id: 'z', profileId: 'mat', gifts: [{ giftId: '1' }] }] } });
    assert.equal(B.pickForGift(gone, ['g_yuna'], '1').actions.length, 0);
});

// ---------- nối server ----------
test('🎬 kiểu game 🍄 Mario / 🏓 Pickleball: thông số riêng + kẹp số, mốc cú đánh, hết lượt theo video nền', () => {
    assert.deepEqual(B.VIDFX_GAMES, ['mario', 'pickle', 'ninja', 'batu']);
    const m = B.normalizeVidFx({ motion: 'mario', mSize: 999, m3x: -5 }, 0);
    assert.deepEqual([m.layer, m.mSize, m.m3x, m.mArrive, m.mGround, m.pAx], ['back', 60, 0, 1.75, 64.6, undefined]);
    assert.deepEqual([m.mGrow, m.mGrowX, m.mGrowAdd, m.mGrowMs], [5.95, 3, 0.8, 270]);  // ✨ chớp phóng to dần theo tiếng nhấp nháy
    assert.deepEqual([B.normalizeVidFx({ motion: 'mario', mGrowX: -1, mGrowMs: 5 }, 0).mGrowX, B.normalizeVidFx({ motion: 'mario', mGrowMs: 5 }, 0).mGrowMs], [0, 80]);
    assert.equal(B.vidFxPlan(m, 8750).end, 8750);                                   // hết lượt = hết video nền
    assert.ok(B.vidFxPlan(m, NaN).end >= m.backSec * 1000 + m.inMs);
    const p = B.normalizeVidFx({ motion: 'pickle', pHits: '0 1 lạ 0.5 2' }, 0);
    assert.deepEqual([p.pHits, p.pAsz, p.pFace, p.mSize], ['0 1 2', 55, 9, undefined]);
    assert.equal(B.normalizeVidFx({ motion: 'pickle', pHits: '3' }, 0).pHits, B.VIDFX_EXTRA.pickle.pHits);   // < 2 mốc → mẫu
    const P = B.vidFxPlan(p, NaN);
    assert.deepEqual([P.hits, P.back, P.land], [[0, 1, 2], 2000, 2000 + p.inMs]);   // cú cuối = bắt đầu về cỡ thật
    assert.deepEqual(B.parseHits('0, 1.02; 2.02'), [0, 1.02, 2.02]);
    assert.equal(B.parseHits(''), null);
    // kiểu thường không mang thông số game
    assert.equal(B.normalizeVidFx({ motion: 'blast', pAx: 5 }, 0).pAx, undefined);
});

test('🥷 Ninja: thông số + kẹp số, mốc né (j / f / h / d), hết lượt theo video nền, đĩa chân chạy giao kèm, overlay vẽ mây + đĩa chân', () => {
    const n = B.normalizeVidFx({ motion: 'ninja', nSize: 999, nTreeX: -5, nDuck: 1 }, 0);
    assert.deepEqual([n.layer, n.nSize, n.nTreeX, n.nDuck, n.nX, n.nGround, n.backSec, n.mSize, n.pAx], ['back', 80, 0, 20, 50, 89, 9.72, undefined, undefined]);
    assert.equal(n.nMoves, B.VIDFX_EXTRA.ninja.nMoves);
    const mv = B.parseMoves(n.nMoves);
    assert.equal(mv.map(m => m.t).join(''), 'djdshhhj');                            // cúi trên cây · lốc · lửa · Bowser (s trượt háng + đạp lưng) · 3 phi tiêu · đá
    assert.ok(B.normalizeVidFx({ motion: 'ninja', nMoves: 'd0.55-0.9 j1.55-2.3 d3.1-3.75 f4.6-5.35 h6.12-6.5 h6.56-6.93 h7.08-7.48 j8.65-9.28' }, 0).nMoves.includes('s4.65-5.45'), 'mốc mẫu 1.3.2 → mốc mẫu mới');
    assert.equal(B.normalizeVidFx({ motion: 'ninja', nMoves: 'f4.6-5.35' }, 0).nMoves, 'f4.6-5.35');                 // streamer tự chỉnh thì giữ
    assert.ok(mv.every((m, i) => m.b > m.a && (!i || m.a >= mv[i - 1].b)), 'mốc né tăng dần, không chồng');
    assert.ok(mv.some(m => m.t === 'd' && m.a <= 3.42 && m.b >= 3.42), 'cầu lửa ngang ngực 3,42 s: CÚI (user chốt 2026-10-23)');
    // chuỗi lạ: bỏ mục sai, mục chồng lên mục trước, xếp theo giờ; xoá hết = không né
    assert.deepEqual(B.parseMoves('j1-2 x3-4 d1.5-3 h5-4 F3-3.5 d6-7'), [{ t: 'j', a: 1, b: 2 }, { t: 'f', a: 3, b: 3.5 }, { t: 'd', a: 6, b: 7 }]);
    assert.equal(B.normalizeVidFx({ motion: 'ninja', nMoves: 'd3-4 j1-2 lạ' }, 0).nMoves, 'j1-2 d3-4');
    assert.equal(B.normalizeVidFx({ motion: 'ninja', nMoves: '' }, 0).nMoves, '');
    // 🏁 3 kiểu chơi, mặc định 🎲 ngẫu nhiên: WIN (bảng sau hết video) · ⭐ dính phi tiêu 6,3 s · 🪨 đá đè 8,85 s → GAME OVER; bảng giữ nOverSec
    assert.deepEqual([n.nEnd, n.nStarHit, n.nRockHit, n.nOverSec, B.NINJA_OUTCOMES.join()], ['random', 6.3, 8.85, 3, 'win,twister,burnt,matrix,bonk,ride,pole,star,rock,gone']);
    assert.equal(B.normalizeVidFx({ motion: 'ninja', nEnd: 'lạ' }, 0).nEnd, 'random');
    const pw = B.vidFxPlan(n, 9720, 'win'), ps = B.vidFxPlan(n, 9720, 'star'), pr = B.vidFxPlan(n, 9720, 'rock');
    assert.deepEqual([pw.ko, pw.over, pw.back, pw.end], [null, 9720, 12720, 13520]);
    assert.deepEqual([ps.ko, ps.over, ps.back, ps.end], [6300, 7300, 10300, 11100]);           // GAME OVER không chờ hết video (đứng hình)
    assert.deepEqual([pr.ko, pr.over, pr.back, pr.end], [8850, 9450, 12450, 13250]);
    assert.equal(B.vidFxPlan(n, 9720).end, 13520);                                  // ngẫu nhiên: DANH SÁCH giữ hàng theo lượt dài nhất
    assert.equal(B.vidFxPlan({ ...n, nEnd: 'star' }, 9720).end, 11100);
    // 7 kiểu thêm 2026-10-23: 5 WIN (bảng sau hết video) + 🌠 bay mất GAME OVER (ko = lúc lốc cuốn, bảng sau 1,7 s); 🕶 Matrix chậm → lượt thật dài thêm
    for (const x of ['burnt', 'matrix', 'bonk', 'ride', 'pole']) assert.equal(B.vidFxPlan(n, 9720, x).over, 9720, x);
    const pg = B.vidFxPlan(n, 9720, 'gone');
    assert.deepEqual([pg.ko, pg.over, B.ninjaWin('gone'), B.ninjaWin('pole')], [1750, 3450, false, true]);
    const pm = B.vidFxPlan(n, 9720, 'matrix');
    assert.ok(pm.real > pm.end && Math.abs(pm.real - pm.end - 1500 * (100 / n.nSlow - 1)) < 1, 'Matrix: real = end + thời gian chạy chậm');
    assert.equal(B.estimateMs('vidfx', { ...n, durSec: 9.72 }), Math.round(pm.real));          // ngẫu nhiên → giữ hàng theo lượt dài nhất
    // 🌪 bị lốc cuốn: vẫn WIN (bảng sau hết video), mốc cuốn 1,75 s · rơi bịch 2,95 s (trước cú cúi 3,1 s)
    const pt = B.vidFxPlan(n, 9720, 'twister');
    assert.deepEqual([pt.ending, pt.ko, pt.over, pt.end, n.nTwistHit, n.nTwistLand, B.ninjaWin('twister'), B.ninjaWin('rock')], ['twister', null, 9720, 13520, 1.75, 2.95, true, false]);
    assert.equal(B.vidFxPlan(n, 20000).end, 20000);
    assert.equal(B.makeVidFx({ motion: 'ninja' }).runMode, 'background');
    // 🦶 2 chế độ chân giả: ✂ cắt chân (mặc định) · 🧍 full người (đĩa che lên chân, nFeetLeg)
    assert.deepEqual([n.nFeetMode, n.nFeetUp, n.nFeetLeg], ['cut', 35, 30]);
    assert.deepEqual([B.normalizeVidFx({ motion: 'ninja', nFeetMode: 'full', nFeetLeg: 500 }, 0).nFeetMode, B.normalizeVidFx({ motion: 'ninja', nFeetLeg: 500 }, 0).nFeetLeg, B.normalizeVidFx({ motion: 'ninja', nFeetMode: 'lạ' }, 0).nFeetMode], ['full', 100, 'cut']);
    // đĩa chân chạy giao kèm: .webm trong suốt có thật trong public/games/body/samples
    const root = path.join(__dirname, '..');
    assert.equal(B.NINJA_FEET_FILE, '/games/body/samples/ninja-chan.webm');
    // 🎵 nhạc mẫu giao kèm (user 2026-10-23: bản 1.3.5 sót nhạc vì nằm trong data/media): máy mới có sẵn, máy cũ chưa nhạc nhận MỘT lần
    const tn = B.normalizeConfig({}).vidfx.scripts.find(s => s.id === 'vft_ninja');
    assert.deepEqual([tn.sfxFile, tn.sfxVol], ['/games/body/samples/ninja-nhac.mp3', 52]);
    assert.ok(fs.existsSync(path.join(root, 'public/games/body/samples/ninja-nhac.mp3')), 'thiếu nhạc mẫu Ninja');
    assert.equal(B.normalizeConfig({ vidfx: { tplV: 2, scripts: [{ id: 'vft_ninja', motion: 'ninja' }] } }).vidfx.scripts[0].sfxFile, '/games/body/samples/ninja-nhac.mp3');
    assert.equal(B.normalizeConfig({ vidfx: { tplV: 2, scripts: [{ id: 'vft_ninja', motion: 'ninja', sfxFile: '/media/rieng.mp3' }] } }).vidfx.scripts[0].sfxFile, '/media/rieng.mp3');
    assert.equal(B.normalizeConfig({ vidfx: { tplV: 2, sndV: 1, scripts: [{ id: 'vft_ninja', motion: 'ninja', sfxFile: '' }] } }).vidfx.scripts[0].sfxFile, '');   // đã xoá nhạc → giữ
    assert.ok(!('sndV' in B.defaultConfig().vidfx), 'cờ sndV không nằm trong defaultConfig');
    assert.ok(fs.existsSync(path.join(root, 'public', B.NINJA_FEET_FILE)), 'thiếu đĩa chân chạy');
    const dir = path.join(root, 'public/games/body');
    const fx = fs.readFileSync(path.join(dir, 'fx-vidfx.mjs'), 'utf8');
    for (const k of ['function ninjaAt(', 'function drawCloud(', 'env.drawAt(fx.feet', 'HB.NINJA_FEET_FILE', "if (m === 'ninja')", 'function ninjaDead(', 'function drawEndBoard(', 'function twistAt(', 'function slideAt(', 'function goneAt(', 'function bonkAt(', 'function rideAt(', 'function poleAt(', 'function matrixAt(', 'function burnDecor(', 'function ninjaRevive(', 'el.playbackRate = rate', '/games/body/samples/hp-logo.png', 'el.pause(); }', 'rockAt(e / 1000)']) assert.ok(fx.includes(k), 'fx-vidfx: ' + k);
    const ov = fs.readFileSync(path.join(dir, 'overlay.html'), 'utf8');
    assert.ok(ov.includes('function drawAt(') && /drawCover: [^\n]+,\s*drawAt,/.test(ov) && ov.includes('takeContinue: sc =>'), 'overlay: env.drawAt + takeContinue (CONTINUE)');
    assert.ok(ov.includes('want.add(HB.NINJA_FEET_FILE)'), 'overlay: nạp sẵn đĩa chân khi Ninja đã gắn quà');
    const panel = fs.readFileSync(path.join(dir, 'body-panel.js'), 'utf8');
    for (const k of ["['ninja', hpT('🥷 Ninja')]", 'data-act="nmoves"', "ninja: '🥷'"]) assert.ok(panel.includes(k), 'panel: ' + k);
});

test('🪢 Ba Tư: 3 lớp (webm trên · NPC · video nền dưới), mốc cắt cảnh / roi quất, mép cam dưới miệng bao, gieo đợt 3, overlay giữ khớp nền', () => {
    const G = '/games/body/samples/';
    const t = B.normalizeConfig({}).vidfx.scripts.find(s => s.id === 'vft_batu');
    assert.deepEqual([t.file, t.bgFile, t.layer, t.durSec], [G + 'batu.webm', G + 'batu-nen.webm', 'front', 4.05]);
    assert.ok(B.isAlphaSample(t.file) && B.isOpaqueSample(t.bgFile));
    for (const f of [t.file, t.bgFile]) assert.ok(fs.existsSync(path.join(__dirname, '../public', f)), 'thiếu ' + f);
    // mốc đo trên video: cắt cận 1,033 s / chu kỳ 2,033 s, roi trúng 1,40 · 3,40 s; mép cam ngay dưới miệng bao (toàn 60,5 % · cận 72 %)
    assert.deepEqual([t.bCut, t.bPeriod, t.bHits, t.bAbot, t.bBbot], [1.033, 2.033, '1.4 3.4', 60.5, 72]);
    const P = B.vidFxPlan(t, 4048);
    assert.deepEqual([P.hits, P.back, P.end], [[1.4, 3.4], 4040, 4048]);
    assert.equal(B.estimateMs('vidfx', t), 4050);       // theo độ dài video (durSec 4,05)
    // kẹp số + mốc roi: rỗng = không quất, sai = mẫu; bgFile mọi kiểu, mẫu .mp4 cũ → .webm
    const x = B.normalizeVidFx({ motion: 'batu', bAsz: 999, bHits: '3 1 x 2', bgFile: ' D:/nen.mp4 ' }, 0);
    assert.deepEqual([x.bAsz, x.bHits, x.bgFile], [200, '3', 'D:/nen.mp4']);
    assert.equal(B.normalizeVidFx({ motion: 'batu', bHits: '' }, 0).bHits, '');
    assert.equal(B.normalizeConfig({ vidfx: { tplV: 3, sndV: 1, scripts: [{ id: 'q', motion: 'batu', bgFile: G + 'batu-nen.mp4' }] } }).vidfx.scripts[0].bgFile, G + 'batu-nen.webm');
    // máy đã gieo đợt 2 (Ninja) chỉ nhận THÊM Ba Tư
    const seeded = B.normalizeConfig({ vidfx: { tplV: 2, sndV: 1, scripts: [{ id: 'mine', motion: 'knock' }] } }).vidfx.scripts.map(s => s.id);
    assert.deepEqual(seeded, ['mine', 'vft_batu']);
    const fx = fs.readFileSync(path.join(__dirname, '../public/games/body/fx-vidfx.mjs'), 'utf8');
    assert.ok(fx.includes('function batuAt(') && fx.includes('function syncBg(') && fx.includes('env.backdrop(margin, fx.bg ||'), 'overlay: tư thế Ba Tư + video nền khớp giờ, vẽ dưới người');
    const panel = fs.readFileSync(path.join(__dirname, '../public/games/body/body-panel.js'), 'utf8');
    assert.ok(panel.includes("data-drop=vfbg") && panel.includes("k('bAbot')") && panel.includes('data-act="bhits"'), 'panel: ô video nền + thông số Ba Tư');
});

test('🔊 âm thanh riêng: sfxFile / sfxVol / sfx mỗi game + âm lượng giả lập theo loại; tiếng video + mp3 phát cùng lúc, không có cả hai mới giả lập; panel có ô mp3', () => {
    const c = B.normalizeConfig({ roiho: { sfxVolume: 3, scripts: [{ id: 'r', sfxFile: ' /media/a.mp3 ', sfxVol: 250, sfx: false }] },
        vidfx: { scripts: [{ id: 'v', motion: 'blast', sfxVol: -5 }] }, haucanh: { items: [{ id: 'h', sfxFile: '/media/h.mp3' }] }, biduoi: { scripts: [{ id: 'b', sfxFile: '/media/b.mp3' }] } });
    assert.deepEqual([c.roiho.sfxVolume, c.roiho.scripts[0].sfxFile, c.roiho.scripts[0].sfxVol, c.roiho.scripts[0].sfx], [1, '/media/a.mp3', 100, false]);
    assert.deepEqual([c.vidfx.sfxVolume, c.vidfx.scripts[0].sfxVol, c.vidfx.scripts[0].sfx, c.vidfx.scripts[0].sfxFile], [0.7, 0, true, '']);
    assert.deepEqual([c.haucanh.items[0].sfxFile, c.haucanh.items[0].sfxVol, c.biduoi.scripts[0].sfxFile, c.biduoi.scripts[0].sfx], ['/media/h.mp3', 100, '/media/b.mp3', true]);
    assert.deepEqual([B.makeRoiHo({}).sfx, B.makeVidFx({}).sfxFile, B.makeItem({}).sfxVol, B.makeBiDuoi({}).sfxFile], [true, '', 100, '']);
    const dir = path.join(__dirname, '../public/games/body');
    const ov = fs.readFileSync(path.join(dir, 'overlay.html'), 'utf8');
    for (const s of ["/games/body/sfx-real.mjs", 'mp3Start(sc,', 'mp3Start(it,', 'mp3Stop(act.mp3)', 'function hasAudio(', 'function runVideoSound(', '!runVideoSound(x)', 'el.muted = MUTE || !sound;', 'sound: !!it.sound']) assert.ok(ov.includes(s), s);
    // mp3 KHÔNG còn làm câm video (user 2026-10-19: "ưu tiên âm thanh của video nếu có + âm thanh mp3")
    for (const s of ['!!it.sfxFile', 'sound && !(act && act.sc.sfxFile)']) assert.ok(!ov.includes(s), 'còn câm video vì mp3: ' + s);
    const sfx = fs.readFileSync(path.join(dir, 'sfx-real.mjs'), 'utf8');
    for (const f of ['thud', 'whoosh', 'wind', 'crack', 'debris', 'rumble', 'portal', 'rustle', 'steps']) assert.ok(sfx.includes(`function ${f}(`), f);
    for (const f of ['fx-roiho.mjs', 'fx-vidfx.mjs']) assert.ok(fs.readFileSync(path.join(dir, f), 'utf8').includes('env.sfxOn(') , f + ' gọi tiếng giả lập theo mốc');
    const bd = fs.readFileSync(path.join(dir, 'fx-biduoi.mjs'), 'utf8');
    assert.ok(bd.includes('env.sfxOn(sc)'), 'Bị Đuổi: cùng quy tắc tiếng giả lập');
    assert.ok(['X.steps(', "far(P.exitEnd", "far(p.end"].every(k => bd.includes(k)), 'Bị Đuổi: tiếng chân chạy cả lượt (không chỉ khúc đầu)');
    assert.ok(sfx.includes('makeup.gain.value') && sfx.includes('lim.threshold.value'), 'tiếng giả lập: bù âm lượng + chặn đỉnh');
    const panel = fs.readFileSync(path.join(dir, 'body-panel.js'), 'utf8');
    assert.ok(panel.includes('function sndBox(') && panel.includes('bindSnd(card, x)') && panel.includes('bt-vsnd'), 'panel: ô mp3 + dấu 🔊');
});

test('📦 overlay OBS không nạp sẵn video game 🎬 CHƯA gắn quà (7 game mẫu ~49 MB); đổi kiểu giữ mp3 riêng', () => {
    const dir = path.join(__dirname, '../public/games/body');
    const ov = fs.readFileSync(path.join(dir, 'overlay.html'), 'utf8');
    assert.ok(ov.includes('for (const sc of cfg.vidfx.scripts) if (forProfile(sc, p) && (isReview || (sc.gifts && sc.gifts.length))) { if (sc.file) want.add(sc.file); if (sc.bgFile) want.add(sc.bgFile); }'), 'syncMedia: vidfx chỉ nạp sẵn khi đã gắn quà (hoặc khung xem trước)');
    const panel = fs.readFileSync(path.join(dir, 'body-panel.js'), 'utf8');
    assert.ok(/data-act=motion\][\s\S]{0,400}sfxFile: sc\.sfxFile, sfxVol: sc\.sfxVol, sfx: sc\.sfx/.test(panel), 'đổi Kiểu NPC diễn giữ sfxFile / sfxVol / sfx');
});

const HAND = (list, ox = 500, oy = 1000, s = 100) => list.map(([x, y]) => ({ x: ox + x * s, y: oy + y * s }));
const FINGER_HEART = [[0, 0], [0.25, -0.3], [0.45, -0.6], [0.55, -1.0], [0.5, -1.45], [0.3, -0.95], [0.38, -1.4], [0.55, -1.5], [0.66, -1.48],
    [0, -1], [0.05, -1.3], [0.12, -1.05], [0.1, -0.85], [-0.25, -0.92], [-0.2, -1.2], [-0.12, -1.0], [-0.12, -0.8], [-0.45, -0.8], [-0.42, -1.02], [-0.33, -0.88], [-0.32, -0.7]];
const withPts = (base, over) => base.map((p, i) => over[i] || p);
const FIST = withPts(FINGER_HEART, { 3: [0.5, -0.7], 4: [0.3, -0.95], 6: [0.38, -1.2], 7: [0.42, -0.98], 8: [0.35, -0.82] });      // nắm đấm, ngón cái gác lên ngón trỏ
const OK_SIGN = withPts(FINGER_HEART, { 4: [0.55, -1.3], 8: [0.5, -1.3], 10: [0, -1.5], 11: [0, -1.75], 12: [0, -1.95], 14: [-0.28, -1.4], 15: [-0.3, -1.62],
    16: [-0.3, -1.8], 18: [-0.5, -1.15], 19: [-0.53, -1.35], 20: [-0.55, -1.5] });                                                     // 👌 3 ngón duỗi
const POINT = withPts(FINGER_HEART, { 4: [0.15, -1.1], 6: [0.32, -1.4], 7: [0.33, -1.65], 8: [0.34, -1.9] });                    // ☝ chỉ tay, ngón cái gác ngón giữa
// 🫶 tim 2 tay: tay A bên trái, tay B soi gương quanh x = 540 (2 cái chạm ở đáy tim, 2 trỏ chạm ở đỉnh, gốc ngón trỏ cách 280 px)
const HAND_A = [[380, 1080], [410, 1050], [450, 1030], [490, 1010], [530, 1000], [400, 960], [420, 880], [460, 840], [530, 840],
    [385, 970], [395, 890], [420, 850], [450, 830], [370, 975], [370, 900], [385, 860], [405, 840], [355, 985], [350, 930], [360, 895], [375, 875]].map(([x, y]) => ({ x, y }));
const mirror = (pts, k = 1) => pts.map(p => ({ x: 540 + (540 - p.x) * k, y: p.y }));
const squeeze = (pts, k) => pts.map(p => ({ x: 540 + (p.x - 540) * k, y: p.y }));

test('💗 Bắn Tim: nhận cử chỉ - 🫰 1 tay / 🫶 2 tay; nắm đấm, 👌, ☝, chắp tay KHÔNG tính; theo kiểu được bật', () => {
    const fh = B.fingerHeart({ pts: HAND(FINGER_HEART) });
    assert.ok(fh && fh.pose === 'finger', '🫰 bắn tim 1 tay');
    assert.ok(Math.abs(fh.size - 100) < 1e-6 && fh.up.y < -0.5, 'cỡ tay + hướng lên');
    assert.ok(Math.abs(fh.x - 557) < 2 && Math.abs(fh.y - 852) < 2, 'điểm chéo ngón ≈ giữa đầu cái / đốt trỏ');
    assert.ok(B.fingerHeart(HAND(FINGER_HEART, 200, 300, 40)), 'tay nhỏ (xa cam) vẫn bắt');
    for (const [name, P] of [['nắm đấm', FIST], ['👌', OK_SIGN], ['☝ chỉ tay', POINT]]) assert.equal(B.fingerHeart(HAND(P)), null, name);
    const two = B.handsHeart(HAND_A, mirror(HAND_A));
    assert.ok(two && two.pose === 'hands' && Math.abs(two.x - 540) < 1 && Math.abs(two.y - 920) < 1, '🫶 tim 2 tay: tâm tim');
    assert.ok(two.r > 60 && two.r < 80, '🫶 avatar trong lòng tim: bán kính theo trục / bề ngang tim');
    assert.equal(B.handsHeart(squeeze(HAND_A, 0.15), squeeze(mirror(HAND_A), 0.15)), null, 'chắp tay (không có lỗ) không tính');
    assert.equal(B.handsHeart(HAND_A, HAND_A.map(p => ({ x: p.x + 400, y: p.y }))), null, '2 tay xa nhau');
    // detectHeart: 2 tay thắng; tắt 🫶 thì tim 2 tay không tính; tắt 🫰 thì 1 tay không tính
    const hands = [{ id: 'Left', pts: HAND_A }, { id: 'Right', pts: mirror(HAND_A) }];
    assert.equal(B.detectHeart(hands, ['finger', 'hands']).pose, 'hands');
    assert.equal(B.detectHeart(hands, ['finger']), null);
    assert.equal(B.detectHeart([{ pts: HAND(FINGER_HEART) }], ['hands']), null);
    assert.equal(B.detectHeart([{ pts: HAND(FIST) }, { pts: HAND(FINGER_HEART, 700) }], ['finger']).x > 700, true, 'tay nào bắn tim thì lấy tay đó');
    assert.equal(B.detectHeart([], ['finger', 'hands']), null);
});

test('💗 Bắn Tim: 🤾 vung tay ném avatar - mặc định bật, tắt được; panel + overlay cấp tay kèm mốc giờ', () => {
    assert.equal(B.defaultConfig().heart.scripts[0].fling, true);
    assert.equal(B.normalizeConfig({ heart: { scripts: [{ id: 'a', fling: false }, { id: 'b' }] } }).heart.scripts.map(x => x.fling).join(), 'false,true');
    const root = path.join(__dirname, '..');
    const fx = fs.readFileSync(path.join(root, 'public/games/body/fx-heart.mjs'), 'utf8');
    for (const k of ['const FLING = {', 'function trackHand(', 'function launch(', 'function frameFly(', 'f.sc.fling && env.hands']) assert.ok(fx.includes(k), 'fx-heart: ' + k);
    const ov = fs.readFileSync(path.join(root, 'public/games/body/overlay.html'), 'utf8');
    assert.ok(ov.includes('hands: () => (handTrk && handTrk.active ? { at: handTrk.handsAt, list: handsNow() } : null)'), 'overlay cấp tay + mốc giờ');
    const panel = fs.readFileSync(path.join(root, 'public/games/body/body-panel.js'), 'utf8');
    assert.ok(panel.includes('data-act="fling"') && panel.includes("['showName', 'hint', 'fling']"), 'panel: công tắc Vung tay ném');
});

test('🦊 Hậu Cảnh mẫu giao kèm "Hồ ly trắng": máy mới có sẵn (Mọi NPC, chưa quà), gieo MỘT lần, máy đã có cùng tên không thêm, xoá rồi không hiện lại', () => {
    const d = B.normalizeConfig(null);
    assert.equal(d.haucanh.tplV, B.HC_TPL_V);
    const fox = d.haucanh.items.find(x => x.id === 'hct_holy');
    assert.deepEqual([fox.name, fox.file, fox.layers.map(L => L.file), fox.startMs, fox.alpha, fox.hideCam, fox.sound, fox.queueMode, fox.profileId, fox.gifts.length],
        ['Hồ ly trắng', '/games/body/samples/ho-ly-trang.webm', ['/games/body/samples/canh-hoa-dao.webm'], 700, true, true, false, 'attach', '', 0]);
    for (const f of [fox.file, fox.layers[0].file]) assert.ok(fs.existsSync(path.join(__dirname, '../public/games/body/samples', path.basename(f))), 'giao kèm ' + f);
    assert.deepEqual(B.normalizeConfig({ haucanh: { items: [{ id: 'mine', name: '  hồ ly TRẮNG ', file: '/media/x.mp4' }] } }).haucanh.items.map(x => x.id), ['mine', 'hct_holyden'], 'máy đã tự dựng cùng tên: không thêm Hồ ly trắng');
    assert.equal(B.normalizeConfig({ haucanh: { tplV: B.HC_TPL_V, items: [] } }).haucanh.items.length, 0, 'xoá rồi không hiện lại');
    const twice = B.normalizeConfig(B.normalizeConfig({ haucanh: { items: [{ id: 'a', name: 'Pháo' }] } }));
    assert.deepEqual(twice.haucanh.items.map(x => x.id), ['a', 'hct_holy', 'hct_holyden'], 'xếp sau game của streamer, không nhân đôi');
    // 🦊 Hồ ly đen (đợt 2, "cài đầy đủ như bản dev"): giao kèm, có tiếng, ⏭ Kế tiếp, 🔔 chạy nền; máy đợt 1 nhận thêm; máy đã có game cùng nguồn file thì thôi
    const den = d.haucanh.items.find(x => x.id === 'hct_holyden');
    assert.deepEqual([den.name, den.file, den.sound, den.queueMode, den.runMode, den.hideCam, den.alpha], ['Hồ ly đen', '/games/body/samples/ho-ly-den.webm', true, 'next', 'background', true, true]);
    assert.ok(fs.existsSync(path.join(__dirname, '../public/games/body/samples/ho-ly-den.webm')), 'giao kèm Hồ ly đen');
    assert.deepEqual(B.normalizeConfig({ haucanh: { tplV: 1, items: [{ id: 'hct_holy', name: 'Hồ ly trắng' }] } }).haucanh.items.map(x => x.id), ['hct_holy', 'hct_holyden']);
    assert.deepEqual(B.normalizeConfig({ haucanh: { tplV: 1, items: [{ id: 'hc1', name: 'Hiệu ứng 1', file: '/media/179-9_duoi_den.webm' }] } }).haucanh.items.map(x => x.id), ['hc1'], 'máy dev đã có (cùng nguồn file)');
    assert.ok(B.hcSampleOf({ name: 'Hiệu ứng 1', file: '/media/179-9_duoi_den.webm' }) && !B.hcSampleOf({ name: 'Khác', file: '/media/a.webm' }));
    // máy cũ qua lib/body-server.js normalizeConfig vẫn được gieo
    assert.ok(require('../lib/body-server.js').normalizeConfig({ haucanh: { items: [] } }).haucanh.items.some(x => x.id === 'hct_holy'));
    // overlay OBS không nạp sẵn video Hậu Cảnh CHƯA gắn quà
    const ov = fs.readFileSync(path.join(__dirname, '../public/games/body/overlay.html'), 'utf8');
    assert.ok(ov.includes('for (const it of cfg.haucanh.items) if (forProfile(it, p) && (isReview || (it.gifts && it.gifts.length)))'));
});

// 📦 Bản mặc định theo máy user (2026-10-23, cờ body.defaultsV) đẩy sang máy đã cài: 🎵 nhạc nền ÉP mọi kịch bản; phần còn lại chỉ
// kịch bản CHƯA gắn quà; Hậu Cảnh không đụng; áp MỘT lần; máy mới ra đúng mặc định. (NPC: qua normalizeGamesConfig).
test('🔴 Bắt NPC: kind "catch" (hàng hành động) - mặc định, kẹp số, quà → lượt catch, ước lượng; màu mặc định đỏ - trắng (user chốt)', () => {
    const d = B.defaultConfig();
    assert.ok(B.ACTION_KINDS.includes('catch') && B.KINDS.includes('catch'));
    assert.equal(d.catch.bgMode, 'room');
    const s0 = d.catch.scripts[0];
    assert.deepEqual([s0.id, s0.outcome, s0.winPct, s0.shakes, s0.failMode, s0.queueMode], ['bc1', 'random', 50, 3, 'self', 'next']);
    assert.deepEqual([s0.ballColor, s0.ballColor2, s0.bandColor], ['#e3262f', '#f5f5f5', '#161616']);
    const n = B.normalizeCatch({ shakes: 99, winPct: -5, outcome: 'x', failMode: 'video', ballColor: 'đỏ', timing: { suckMs: 1 } }, 0);
    assert.deepEqual([n.shakes, n.winPct, n.outcome, n.failMode, n.ballColor, n.timing.suckMs], [5, 0, 'random', 'video', B.CATCH_COLORS.ballColor, 50]);
    const cfg = B.normalizeConfig({ catch: { scripts: [{ id: 'bcA', gifts: [{ giftId: '5655', giftName: 'Rose' }] }] } });
    assert.deepEqual(B.pickForGift(cfg, [], '5655').actions.map(a => a.kind), ['catch']);
    assert.ok(B.estimateMs('catch', cfg.catch.scripts[0]) > 8000);
    assert.ok(fs.readFileSync(path.join(__dirname, '../public/games/body/overlay.html'), 'utf8').includes("catch: createCatch("));
});

test('🖐 Tát bay: bộ ảnh bàn tay nhiều góc giao kèm có đủ file + chỉ nạp khi dùng bàn tay giao kèm', () => {
    const sc = B.makeMorph({ style: 'slap' }), files = B.morphMediaFiles(sc);
    assert.equal(sc.handFile, B.SLAP_HAND_FILE);
    assert.equal(files.length, 1 + Object.keys(B.SLAP_HAND_SET).length);
    for (const f of files) assert.ok(fs.existsSync(path.join(__dirname, '../public', f)), f);
    for (const h of Object.values(B.SLAP_HAND_SET)) assert.ok(h.k > 0 && h.a.length === 2, h.file);
    assert.deepEqual(B.morphMediaFiles(B.makeMorph({ style: 'slap', handFile: '/media/tay-rieng.png' })), ['/media/tay-rieng.png']);   // ảnh riêng = 1 ảnh
    assert.deepEqual(B.morphMediaFiles(B.makeMorph({ style: 'slap', handFile: '' })), []);
    assert.deepEqual(B.morphMediaFiles(B.makeMorph({ style: 'ice' })), []);
});

test('✨ Biến Hình: kind "morph" (hàng hành động) - 7 game mẫu chưa gắn quà, kẹp số, mốc lượt, quà → lượt morph, máy cũ nhận mẫu', () => {
    const d = B.defaultConfig();
    assert.ok(B.ACTION_KINDS.includes('morph') && B.KINDS.includes('morph'));
    assert.equal(d.morph.bgMode, 'room');
    assert.deepEqual(d.morph.scripts.map(s => s.id), ['mot_ice', 'mot_pixel', 'mot_zap', 'mot_vacuum', 'mot_bees', 'mot_slap', 'mot_fly']);
    // máy đã có 5 game ✨ đợt đầu (chưa cờ tplV) → nhận thêm 🖐 + 🐉 một lần; đợt 2 (có 🖐) chỉ nhận 🐉; đã có cờ mới thì không gieo lại
    const old5 = d.morph.scripts.filter(s => s.style !== 'slap' && s.style !== 'fly');
    assert.deepEqual(B.normalizeConfig({ morph: { scripts: old5 } }).morph.scripts.slice(5).map(s => s.style), ['slap', 'fly']);
    assert.deepEqual(B.normalizeConfig({ morph: { tplV: 2, scripts: old5 } }).morph.scripts.slice(5).map(s => s.style), ['fly']);
    assert.ok(!B.normalizeConfig({ morph: { tplV: B.MORPH_TPL_V, scripts: old5 } }).morph.scripts.some(s => s.style === 'slap' || s.style === 'fly'));
    assert.ok(d.morph.scripts.every(s => !s.gifts.length && !s.profileId && s.queueMode === 'next'));
    // máy cũ (không có nhánh morph) nhận đủ 7 mẫu; xoá hết = giữ rỗng (đợt mẫu mới vẫn gieo một lần)
    assert.equal(B.normalizeConfig({ roiho: { scripts: [] } }).morph.scripts.length, 7);
    assert.deepEqual(B.normalizeConfig({ morph: { scripts: [] } }).morph.scripts.map(s => s.style), ['slap', 'fly']);
    assert.equal(B.normalizeConfig({ morph: { tplV: B.MORPH_TPL_V, scripts: [] } }).morph.scripts.length, 0);
    const n = B.normalizeMorph({ style: 'x', durSec: 1, power: 9, color: 'xanh' }, 0);
    assert.deepEqual([n.style, n.durSec, n.power, n.color], ['ice', B.MORPH_MIN.ice, 3, B.MORPH_COLOR.ice]);
    // mốc: mọi kiểu kết thúc đúng durSec, các pha nối tiếp nhau kể cả ở thời lượng tối thiểu
    for (const st of B.MORPH_STYLES) for (const dur of [B.MORPH_MIN[st], B.MORPH_DUR[st], 20]) {
        const P = B.morphPlan(B.normalizeMorph({ style: st, durSec: dur }, 0));
        if (st === 'bees' || st === 'fly') assert.equal(P.end, Math.round(dur * 1000), st + ' end');      // 🧊 👾 🌀 dài theo waitSec, ⚡ 🖐 theo power
        const seq = st === 'ice' ? [P.freezeA, P.freezeB, P.crack, P.shatter, P.reform, P.end]
            : st === 'pixel' ? [P.pixA, P.pixB, P.fall, P.rebuild, P.rebuildB, P.end]
            : st === 'zap' ? [P.cloudB, ...P.strikes, P.drop, P.leave, P.end]
            : st === 'vacuum' ? [P.drop, P.down, P.suckB, P.gone, P.upA, P.upB, P.lowA, P.lowB, P.spit, P.land, P.back, P.backB, P.end]
            : st === 'slap' ? [...P.hits, P.backA, P.land, P.end]
            : st === 'fly' ? [P.sceneB, P.hide, P.riseA, P.riseB, P.actB, P.land, P.end] : [P.drop, P.land, P.leave, P.end];
        assert.equal(B.normalizeMorph({ style: 'tires' }, 0).style, 'vacuum');         // bản thử đầu gọi Ống hút là tires
        for (let i = 1; i < seq.length; i++) assert.ok(seq[i] > seq[i - 1], `${st} ${dur}s: mốc ${i} tăng dần (${seq.join(' ')})`);
    }
    assert.equal(B.morphPlan({ style: 'vacuum', waitSec: 5 }).lowA - B.morphPlan({ style: 'vacuum', waitSec: 2 }).lowA, 3000);   // 🌀 chờ trong ống
    assert.deepEqual([1, 2, 3].map(power => B.morphPlan({ style: 'zap', power }).strikes.length), [2, 3, 4]);      // ⚡ số tia theo power
    // 🐉 kiểu ra đòn: mặc định ngẫu nhiên, lạ → ngẫu nhiên; chỉ kiểu fly mới có trường act; ra đòn có ≥ 3 s ở thời lượng tối thiểu
    assert.equal(B.makeMorph({ style: 'fly' }).act, 'random');
    assert.deepEqual(['beam', 'dive', 'fight', 'xx'].map(act => B.normalizeMorph({ style: 'fly', act }, 0).act), ['beam', 'dive', 'fight', 'random']);
    assert.ok(!('act' in B.normalizeMorph({ style: 'ice', act: 'beam' }, 0)));
    // 🎵 nhạc Son Goku giao kèm: mặc định; game cũ chưa có cờ musV nhận một lần; user đã bỏ (có cờ, sfxFile rỗng) thì giữ rỗng; mp3 tự chọn giữ
    assert.equal(B.makeMorph({ style: 'fly' }).sfxFile, B.FLY_MUSIC);
    assert.equal(B.normalizeMorph({ style: 'fly' }, 0).sfxFile, B.FLY_MUSIC);
    assert.equal(B.normalizeMorph({ style: 'fly', musV: 1, sfxFile: '' }, 0).sfxFile, '');
    assert.equal(B.normalizeMorph({ style: 'fly', sfxFile: '/media/x.mp3' }, 0).sfxFile, '/media/x.mp3');
    assert.ok(!('musV' in B.normalizeMorph({ style: 'ice' }, 0)));
    assert.ok(fs.existsSync(path.join(__dirname, '../public/games/body/samples/son-goku.mp3')));
    // 🎧 sfxMix: Son Goku + 🥷 Ninja mặc định chạy giả lập CÙNG mp3; game khác mặc định tắt; chọn tay giữ; overlay dùng đúng trường
    assert.equal(B.normalizeMorph({ style: 'fly' }, 0).sfxMix, true);
    assert.equal(B.normalizeMorph({ style: 'ice', sfxFile: '/media/a.mp3' }, 0).sfxMix, false);
    assert.equal(B.normalizeMorph({ style: 'ice', sfxFile: '/media/a.mp3', sfxMix: true }, 0).sfxMix, true);
    assert.equal(B.normalizeMorph({ style: 'fly', sfxMix: false }, 0).sfxMix, false);
    assert.equal(B.normalizeConfig({ vidfx: { scripts: [{ id: 'v', motion: 'ninja' }, { id: 'w', motion: 'blast', sfxFile: '/media/b.mp3' }] } }).vidfx.scripts.slice(0, 2).map(x => x.sfxMix).join(), 'true,false');     // (sau 2 game là mẫu gieo thêm)
    assert.ok(fs.readFileSync(path.join(__dirname, '../public/games/body/overlay.html'), 'utf8').includes('x.sfxMix === true'));
    assert.ok(fs.readFileSync(path.join(__dirname, '../public/games/body/body-panel.js'), 'utf8').includes('data-act="sfxmix"'));
    const fp = B.morphPlan({ style: 'fly', durSec: B.MORPH_MIN.fly });
    assert.ok(fp.actB - fp.actA >= 3000 && fp.backA === fp.actB && fp.act === 'random');
    const fly = fs.readFileSync(path.join(__dirname, '../public/games/body/fx-morph.mjs'), 'utf8');
    assert.ok(fly.includes("import { createFly } from './fx-morph-fly.mjs'") && fly.includes('fly: (f, e, dt, g) => fly.frame('));
    assert.ok(fs.readFileSync(path.join(__dirname, '../public/games/body/fx-morph-fly.mjs'), 'utf8').includes("import { createFlyVfx } from './fx-fly-vfx.mjs'"));
    assert.ok(fs.existsSync(path.join(__dirname, '../public/games/body/fx-fly-vfx.mjs')));
    for (const f of ['bay-chuong-nen.webp', 'bay-chuong-toa-nha.webp']) assert.ok(fs.existsSync(path.join(__dirname, '../public/games/body/samples', f)), '🐉 ảnh cảnh ' + f);
    const cfg = B.normalizeConfig({ morph: { scripts: [{ id: 'moA', style: 'zap', gifts: [{ giftId: '5655', giftName: 'Rose' }] }] } });
    assert.deepEqual(B.pickForGift(cfg, [], '5655').actions.map(a => a.kind), ['morph']);
    assert.equal(B.estimateMs('morph', cfg.morph.scripts[0]), B.morphPlan(cfg.morph.scripts[0]).end + 200);
    const { slotOf } = require('../lib/body-gift-seed.js');
    assert.equal(slotOf('morph', { style: 'bees' }), 'morph:bees');
    const ov = fs.readFileSync(path.join(__dirname, '../public/games/body/overlay.html'), 'utf8');
    assert.ok(ov.includes('morph: createMorph(') && ov.includes("import { createMorph } from '/games/body/fx-morph.mjs'"));
});

test('🧍 quà mẫu Bộ Tách Người (lib/body-gift-seed.json): CHỈ máy chưa gắn quà nào (Heart Me mặc định không tính), theo LOẠI game, một lần', () => {
    const { applyBodyGiftSeed, slotOf, hasOwnGifts } = require('../lib/body-gift-seed.js');
    const seed = { v: 3, slots: { roiho: [{ giftId: '1', giftName: 'A' }], catch: [{ giftId: '2', giftName: 'B' }], 'vidfx:abduct': [{ giftId: '3', giftName: 'C' }],
        'vidfx:portal': [{ giftId: '5', giftName: 'E' }], 'cry:laugh': [{ giftId: '6' }], heart: [{ giftId: '7934', giftName: 'Heart Me' }] } };
    // HP Action LIVE: streamer đã gắn quà bất kỳ → KHÔNG gieo gì (không đè, không điền thêm), chỉ đánh dấu đã xét
    const own = B.normalizeConfig({});
    own.roiho.scripts[0].gifts = [{ giftId: '9', giftName: 'Của máy' }];
    assert.equal(hasOwnGifts(own), true);
    assert.deepEqual(applyBodyGiftSeed(own, seed), []);
    assert.deepEqual([own.roiho.scripts[0].gifts.map(g => g.giftId), own.catch.scripts[0].gifts.length, own.giftSeedV], [['9'], 0, 3]);
    const hc = B.normalizeConfig({}); hc.haucanh.items[0].gifts = [{ giftId: '8' }];
    assert.equal(hasOwnGifts(hc), true);                                                       // quà ở 🦊 Hậu Cảnh cũng tính
    // máy mới: chỉ có 💗 Heart Me mặc định → coi như chưa gắn; gieo theo LOẠI (mã game khác vẫn khớp theo kiểu)
    const body = B.normalizeConfig({});
    assert.equal(hasOwnGifts(body), false);
    body.vidfx.scripts.find(x => x.motion === 'portal').id = 'vf_scifi';
    const done = applyBodyGiftSeed(body, seed);
    assert.deepEqual(done.sort(), ['catch→bc1', 'roiho→ks1', 'vidfx:abduct→vft_abduct', 'vidfx:portal→vf_scifi']);   // cry:laugh: không có game cười; heart đã có
    assert.deepEqual(body.heart.scripts[0].gifts.map(g => g.giftId), ['7934']);
    assert.equal(body.giftSeedV, 3);
    body.catch.scripts[0].gifts = [];                                                          // streamer xoá quà sau khi áp → không gắn lại
    assert.deepEqual(applyBodyGiftSeed(body, seed), []);
    // bộ mẫu thật: máy MỚI cài nhận đủ mọi loại (heart đã có Heart Me mặc định)
    const real = require('../lib/body-gift-seed.json'), fresh = B.normalizeConfig({});
    assert.equal(applyBodyGiftSeed(fresh, real).length, Object.keys(real.slots).length - 1);
    assert.equal(slotOf('vidfx', { motion: 'ninja' }), 'vidfx:ninja');
});
