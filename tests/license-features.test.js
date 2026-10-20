'use strict';
// Tính năng theo KEY (HP KEY ft): lib/license-features.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const LF = require('../lib/license-features');

test('key "Tất cả" (null / undefined / sai kiểu): mở mọi thứ, không khoá gì', () => {
    for (const f of [null, undefined, 'caro', 42, {}]) {
        assert.equal(LF.can(f, 'caro'), true);
        assert.equal(LF.can(f, 'camgames'), true);
        assert.equal(LF.can(f, 'liveTranslate'), true);
        assert.deepEqual(LF.lockedIds(f), []);
    }
});

test('danh sách: chỉ mở đúng id có trong danh sách (phân biệt hoa thường)', () => {
    const f = ['caro', 'liveTranslate'];
    assert.equal(LF.can(f, 'caro'), true);
    assert.equal(LF.can(f, 'liveTranslate'), true);
    assert.equal(LF.can(f, 'thuytinh'), false);
    assert.equal(LF.can(f, 'obs-effects'), false);
    assert.equal(LF.can(['LiveTranslate'], 'liveTranslate'), false, 'sai hoa thường = không mở');
});

test('công cụ luôn mở (giftboard) và id ngoài danh mục không bao giờ bị khoá', () => {
    for (const id of ['giftboard', 'game-moi-chua-co']) {
        assert.equal(LF.can([], id), true, id);
        assert.equal(LF.lockedIds([]).includes(id), false, id);
    }
});

test('THỜI GIAN (timer) khoá theo key như game thường', () => {
    assert.equal(LF.can(['thuytinh'], 'timer'), false);
    assert.equal(LF.can(['timer'], 'timer'), true);
    assert.equal(LF.can(null, 'timer'), true, 'key Tất cả vẫn mở');
    assert.equal(LF.lockedIds(['thuytinh']).includes('timer'), true);
});

test('[] = khoá hết các mục khoá được + khung camgames', () => {
    const locked = LF.lockedIds([]);
    assert.deepEqual(locked, [...LF.LOCKABLE, 'camgames']);
    assert.equal(LF.can([], 'camgames'), false);
});

test('Game Camera: khoá từng game con; khung camgames mở khi có ít nhất 1 game con', () => {
    assert.equal(LF.can(['dapmuoi'], 'camgames'), true);
    assert.equal(LF.can(['dapmuoi'], 'dapmuoi'), true);
    assert.equal(LF.can(['dapmuoi'], 'bancung'), false);
    assert.equal(LF.can(['caro'], 'camgames'), false, 'không có game con nào → khung khoá');
    const locked = LF.lockedIds(['dapmuoi', 'caro']);
    assert.equal(locked.includes('camgames'), false);
    assert.equal(locked.includes('touchplay'), true);
});

test('same(): so tác dụng của 2 danh sách', () => {
    assert.equal(LF.same(null, undefined), true);
    assert.equal(LF.same(null, []), false);
    assert.equal(LF.same(['a', 'b'], ['a', 'b']), true);
    assert.equal(LF.same(['a', 'b'], ['b', 'a']), false);
});

// Trạng thái mục theo game (HP KEY gs, SDK 2.1). Server đã trừ mục off/hidden khỏi ft — các ca dưới dựng ft đúng như vậy.
const ALL = LF.LOCKABLE.slice();
const minus = (...ids) => ALL.filter((id) => !ids.includes(id));

test('gameState rỗng / sai kiểu: stateOf chỉ còn on / locked như trước, states() = chỉ mục bị khoá', () => {
    for (const gs of [undefined, null, {}, [], 'caro|off', 5]) {
        assert.equal(LF.stateOf(null, gs, 'caro'), 'on');
        assert.equal(LF.stateOf(['thuytinh'], gs, 'caro'), 'locked');
        assert.deepEqual(LF.states(null, gs), {});
    }
    const st = LF.states(['caro'], {});
    assert.deepEqual(Object.keys(st).sort(), LF.lockedIds(['caro']).sort(), 'states() khoá đúng các mục lockedIds');
    assert.ok(Object.values(st).every((s) => s === 'locked'));
});

test('stateOf: off / hidden thắng locked; admin chỉ khi mục dùng được; giá trị lạ bị bỏ', () => {
    const gs = { caro: 'off', nhatla: 'hidden', timer: 'admin', thuytinh: 'bao-tri' };
    const ft = minus('caro', 'nhatla');
    assert.equal(LF.stateOf(ft, gs, 'caro'), 'off');
    assert.equal(LF.stateOf(ft, gs, 'nhatla'), 'hidden');
    assert.equal(LF.stateOf(ft, gs, 'timer'), 'admin');
    assert.equal(LF.stateOf(ft, gs, 'thuytinh'), 'on', 'trạng thái lạ = Bật');
    assert.equal(LF.stateOf(minus('caro', 'nhatla', 'timer'), gs, 'timer'), 'locked', 'admin mà key không có → locked');
    assert.deepEqual(LF.normalizeState(gs), { caro: 'off', nhatla: 'hidden', timer: 'admin' });
    assert.deepEqual(LF.states(ft, gs), { caro: 'off', nhatla: 'hidden', timer: 'admin' });
    assert.equal(LF.can(ft, 'caro'), false, 'khoá vẫn theo ft');
});

test('stateOf camgames: còn game con dùng được → on; mọi game con ẩn → hidden; không còn mà có tạm tắt → off', () => {
    const kids = LF.CAM_CHILDREN;
    assert.equal(LF.stateOf(minus('touchplay'), { touchplay: 'off' }, 'camgames'), 'on');
    const allHidden = Object.fromEntries(kids.map((k) => [k, 'hidden']));
    assert.equal(LF.stateOf(minus(...kids), allHidden, 'camgames'), 'hidden');
    const oneOff = { ...allHidden, dapmuoi: 'off' };
    assert.equal(LF.stateOf(minus(...kids), oneOff, 'camgames'), 'off');
    assert.equal(LF.stateOf(minus(...kids), {}, 'camgames'), 'locked');
    assert.equal(LF.stateOf(minus(...kids.filter((k) => k !== 'bancung')), { bancung: 'admin' }, 'camgames'), 'on', 'chỉ còn game dùng thử (admin) → vẫn mở');
    assert.equal(LF.states(minus(...kids), allHidden).camgames, 'hidden');
});

test('sameState(): so trạng thái (ft giữ nguyên mà gs đổi off → hidden vẫn phải vẽ lại)', () => {
    assert.equal(LF.sameState(undefined, {}), true);
    assert.equal(LF.sameState({ caro: 'off' }, { caro: 'off' }), true);
    assert.equal(LF.sameState({ caro: 'off' }, { caro: 'hidden' }), false);
    assert.equal(LF.sameState({ caro: 'off' }, {}), false);
    assert.equal(LF.sameState({ caro: 'off', x: 'lạ' }, { caro: 'off' }), true, 'giá trị lạ bị bỏ trước khi so');
});

test('danh mục: id hợp lệ với HP KEY ([A-Za-z0-9_.-]{1,40}), không trùng, đủ 16 mục; catalogText đúng định dạng id|Tên', () => {
    const ids = LF.CATALOG.map((c) => c.id);
    assert.equal(ids.length, 16);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^[A-Za-z0-9_.-]{1,40}$/);
    for (const c of LF.CAM_CHILDREN) assert.ok(ids.includes(c), c);
    const lines = LF.catalogText().split('\n');
    assert.equal(lines.length, 16);
    assert.equal(lines[0], 'thuytinh|Hũ Thủy Tinh');
    for (const l of lines) assert.match(l, /^[A-Za-z0-9_.-]+\|.+$/);
});

// Trang 🔒 / ⏸ của overlay OBS tự tải lại khi mục được mở (server.js licenseLockedHtml → lockedPageHtml).
test('lockLifted(): mở lại khi id không còn trong locked và không còn off / hidden; trả lời lạ → đứng yên', () => {
    assert.equal(LF.lockLifted('caro', { locked: [], states: {} }), true);
    assert.equal(LF.lockLifted('caro', { locked: ['thuytinh'], states: { thuytinh: 'locked', timer: 'admin' } }), true);
    assert.equal(LF.lockLifted('caro', { locked: ['caro'], states: { caro: 'locked' } }), false, 'vẫn khoá theo KEY');
    assert.equal(LF.lockLifted('caro', { locked: ['caro'], states: { caro: 'off' } }), false, 'vẫn tạm bảo trì');
    assert.equal(LF.lockLifted('caro', { locked: [], states: { caro: 'off' } }), false, 'off trong states → chưa mở');
    assert.equal(LF.lockLifted('caro', { locked: [], states: { caro: 'hidden' } }), false, 'hidden trong states → chưa mở');
    assert.equal(LF.lockLifted('caro', { locked: [], states: { caro: 'admin' } }), true, 'dùng thử = dùng được');
    assert.equal(LF.lockLifted('caro', { locked: [] }), true, 'thiếu states vẫn đọc theo locked');
    for (const bad of [null, undefined, 'x', 5, {}, { locked: 'caro' }, { states: {} }]) {
        assert.equal(LF.lockLifted('caro', bad), false, JSON.stringify(bad));
    }
    // Khung Game Camera dùng id 'camgames' (lockedIds thêm khi không còn game con nào)
    const lf = (features, gs) => ({ locked: LF.lockedIds(features), states: LF.states(features, gs) });
    assert.equal(LF.lockLifted('camgames', lf(['caro'], {})), false);
    assert.equal(LF.lockLifted('camgames', lf(['caro', 'dapmuoi'], {})), true);
    assert.equal(LF.lockLifted('liveTranslate', lf(minus('liveTranslate'), { liveTranslate: 'off' })), false);
    assert.equal(LF.lockLifted('liveTranslate', lf(null, {})), true, 'key Tất cả → mở');
});

test('lockedPageHtml(): giữ chữ + nền trong suốt như cũ, thêm script tự tải lại', () => {
    const locked = LF.lockedPageHtml('caro', 'locked');
    assert.match(locked, /<title>🔒 Caro Đối Đầu<\/title>/);
    assert.ok(locked.includes('<div>🔒 Caro Đối Đầu: KEY chưa mở tính năng này — liên hệ HP Media</div>'));
    assert.ok(locked.includes('html,body{margin:0;background:transparent;'));
    assert.ok(LF.lockedPageHtml('timer', 'off').includes('<div>⏸ Thời Gian: đang tạm bảo trì — HP Media sẽ mở lại sớm</div>'));
    assert.ok(LF.lockedPageHtml('nhatla', 'hidden').includes('<div>🔒 Nhặt Lá: chưa mở</div>'));
    assert.ok(LF.lockedPageHtml('camgames', 'locked').includes('🔒 Game Camera: '));
    assert.ok(LF.lockedPageHtml('lạ<b>', 'locked').includes('🔒 lạb: '), 'tên lạ bỏ ký tự HTML');
    assert.equal(LF.LOCK_RECHECK_MS, 15000);
    assert.equal((locked.match(/<script>/g) || []).length, 1);
    assert.ok(locked.includes("fetch('/api/license/features',{cache:'no-store'})"));
    assert.ok(locked.includes('location.reload()'));
    assert.ok(locked.indexOf('<script>') > locked.indexOf('</div>') && locked.endsWith('</script></body></html>'));
    assert.ok(!LF.lockedPageHtml('</script><b>', 'locked').includes('</script><b>'), 'id không phá được thẻ script');
});

// Chạy đúng đoạn script nhúng trong trang khoá với fetch / setInterval / location giả.
function runLockedPage(id, answer) {
    const html = LF.lockedPageHtml(id, 'locked');
    const src = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
    const ticks = [];
    const seen = { reloads: 0, fetches: [] };
    const ctx = {
        setInterval: (fn, ms) => { ticks.push({ fn, ms }); return 1; },
        fetch: (url, opt) => { seen.fetches.push({ url, opt }); return answer(); },
        location: { reload: () => { seen.reloads++; } },
    };
    vm.runInNewContext(src, ctx);
    const tick = async () => { ticks[0].fn(); for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); };
    return { ticks, seen, tick };
}
const reply = (body, ok = true) => () => Promise.resolve({ ok, json: () => Promise.resolve(body) });

test('trang khoá: cứ 15 s hỏi /api/license/features (no-store); mục mở lại → location.reload()', async () => {
    let body = { locked: ['caro'], states: { caro: 'locked' } };
    const p = runLockedPage('caro', () => reply(body)());
    assert.equal(p.ticks.length, 1);
    assert.equal(p.ticks[0].ms, 15000);
    await p.tick();
    assert.equal(p.seen.fetches[0].url, '/api/license/features');
    assert.equal(p.seen.fetches[0].opt.cache, 'no-store');
    assert.equal(p.seen.reloads, 0, 'còn khoá → đứng yên');
    body = { locked: [], states: { caro: 'off' } };
    await p.tick();
    assert.equal(p.seen.reloads, 0, 'còn tạm bảo trì → đứng yên');
    body = { locked: [], states: {} };
    await p.tick();
    assert.equal(p.seen.reloads, 1, 'mở lại → tải lại trang');
});

test('trang khoá: lỗi mạng / HTTP lỗi / JSON hỏng thì bỏ qua, lần sau hỏi tiếp', async () => {
    let mode = 'net';
    const p = runLockedPage('timer', () => {
        if (mode === 'net') return Promise.reject(new Error('ECONNREFUSED'));
        if (mode === 'http') return reply({ locked: [] }, false)();
        if (mode === 'json') return Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError('bad')) });
        return reply({ locked: [], states: {} })();
    });
    for (const m of ['net', 'http', 'json']) { mode = m; await p.tick(); }
    assert.equal(p.seen.reloads, 0);
    assert.equal(p.seen.fetches.length, 3, 'mỗi nhịp hỏi một lần, lỗi không làm kẹt');
    mode = 'ok';
    await p.tick();
    assert.equal(p.seen.reloads, 1);
});

test('nhãn 🧪 trung tính: không còn "chỉ key ADMIN" trong giao diện', () => {
    const root = path.join(__dirname, '..');
    for (const f of ['public/app.js', 'public/quick-launch.html', 'public/games/camgames/camgames-panel.js']) {
        const src = fs.readFileSync(path.join(root, f), 'utf8');
        assert.doesNotMatch(src, /key ADMIN thấy/i, f);
        assert.match(src, /Thử nghiệm — mới mở cho một số KEY dùng thử/, f);
    }
});

// Rà các chỗ liệt kê game cho người dùng chọn / mở: mục Ẩn không hiện, mục Tạm tắt có ⏸ (kiểm tĩnh mã nguồn).
test('mục Ẩn không hiện ở mọi danh sách game; server trả trang khoá qua lockedPageHtml', () => {
    const root = path.join(__dirname, '..');
    const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
    const app = read('public/app.js');
    assert.match(app, /if \(g\.lstate === 'hidden'\) continue;/, 'Thư viện Game bỏ mục Ẩn');
    assert.match(app, /games\.some\(g => g\.id === last && g\.lstate !== 'hidden'\)/, 'không mở lại màn đã nhớ của mục Ẩn');
    assert.match(read('public/quick-launch.html'), /games = games\.filter\(g => g\.lstate !== 'hidden'\)/, 'Khởi động nhanh (thẻ + ⚙ thứ tự)');
    assert.match(read('public/games/camgames/camgames-panel.js'), /filter\(g => lstates\[g\.id\] !== 'hidden'\)/, 'Game Camera');
    const gb = read('public/_prototype/giftboard.html');
    assert.match(gb, /fetch\('\/api\/license\/features'/, 'Bảng Quà Tổng đọc trạng thái mục');
    assert.match(gb, /socket\.on\('license:features'/, 'Bảng Quà Tổng cập nhật khi admin đổi');
    assert.match(gb, /SOURCE_ORDER\.filter\(id => \(games\[id\] \|\| id === 'obsEffects'\) && !srcHidden\(id\)\)/, 'nguồn Ẩn không hiện');
    assert.match(gb, /if \(srcHidden\(id\)\) return false;/, 'quà của nguồn Ẩn không lên bảng');
    assert.match(gb, /⏸ Tạm bảo trì/, 'nguồn Tạm tắt ghi ⏸');
    assert.match(read('server.js'), /return LicFeat\.lockedPageHtml\(id, licenseStateOf\(id\)\);/);
});

// 📦 Danh sách quà thả thử với MỌI KEY: route chung không gắn game (không dính khoá theo game của Hũ Thủy Tinh),
// đi đúng đường quà thật (emitGift) nên game bị khoá tự bỏ qua; server lỗi thì toast báo lỗi.
test('Danh sách quà: thả thử qua /api/test-gift, không qua khoá của một game cụ thể', () => {
    const root = path.join(__dirname, '..');
    const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
    const gl = read('public/gift-list.html');
    assert.match(gl, /fetch\('\/api\/test-gift'/);
    assert.doesNotMatch(gl, /\/api\/games\/[a-z]+\/test-gift/);
    assert.match(gl, /if \(!r\.ok \|\| j\.ok === false\) throw/, 'lỗi server → không báo "Đã thả thử"');
    const srv = read('server.js');
    const route = srv.match(/app\.post\('\/api\/test-gift', \(req, res\) => \{([\s\S]*?)\n\}\);/);
    assert.ok(route, 'có route /api/test-gift');
    assert.match(route[1], /emitTestGift\(/);
    assert.match(srv, /function emitTestGift\(body\) \{[\s\S]*?emitGift\(\{/, 'đi đúng đường quà thật');
    // Khoá theo game ở middleware vẫn chặn quà thử gắn id game bị khoá
    const re = new RegExp(srv.match(/req\.path\.match\(\/(\^\\\/api\\\/games[^\n]*?\$)\/\)/)[1]);
    assert.ok(re.test('/api/games/thuytinh/test-gift'));
    assert.ok(!re.test('/api/test-gift'));
});
