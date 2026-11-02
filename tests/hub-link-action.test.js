const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../lib/hub-link-action');

test('HUB_PAGES: danh sách trang đông cứng', () => {
    assert.deepEqual([...H.HUB_PAGES], ['home', 'camera', 'fxlib', 'obs', 'link', 'setup', 'settings', 'info']);
    assert.ok(Object.isFrozen(H.HUB_PAGES));
});

test('resolveHubEnv: công tắc và id app', () => {
    assert.deepEqual(H.resolveHubEnv({}), { allowed: false, appId: 'hp-action-live-dev', probe: true });
    const inst = H.resolveHubEnv({ HP_ACTION_HUB_APP_ID: 'hp-action-live' });
    assert.equal(inst.allowed, true);
    assert.equal(inst.appId, 'hp-action-live');
    const dev = H.resolveHubEnv({ HP_ACTION_HUB_LINK: '1' });
    assert.equal(dev.allowed, true);
    assert.equal(dev.appId, 'hp-action-live-dev');
    assert.equal(H.resolveHubEnv({ HP_ACTION_HUB_LINK: '0', HP_ACTION_HUB_APP_ID: 'x' }).allowed, false);
    assert.equal(H.resolveHubEnv({ HP_ACTION_HUB_PROBE: '0' }).probe, false);
});

test('hubGiftPayload: gói quà §4.4', () => {
    const p = H.hubGiftPayload(
        { giftId: 'music', songGiftId: '7311', repeatCount: '3', source: 'tiktok', uniqueId: 'a', nickname: 'A', profilePicture: 'p' },
        { id: 'a_1', coins: 199, now: () => 1234 }
    );
    assert.equal(p.id, 'a_1');
    assert.equal(p.giftId, 'music');
    assert.equal(p.songGiftId, '7311');
    assert.equal(p.quantity, 3);
    assert.equal(p.coins, 199);
    assert.equal(p.totalCoins, 597);
    assert.equal(p.user.avatar, 'p');
    assert.equal(p.user.uniqueId, 'a');
    assert.equal(p.profileId, 'common');
    assert.equal(p.source, 'tiktok');
    assert.equal(p.streaking, false);
    assert.equal(p.receivedAt, 1234);
    for (const k of ['tier', 'pair', 'kpiOnly']) assert.equal(k in p, false, k);

    assert.equal(H.hubGiftPayload({ giftId: 'x', source: 'test' }, { id: 'i', coins: 1 }).source, 'test');
    assert.equal(H.hubGiftPayload({ giftId: 'x' }, { id: 'i', coins: 1 }).quantity, 1);
    assert.equal('songGiftId' in H.hubGiftPayload({ giftId: 'x' }, { id: 'i', coins: 1 }), false);
});

test('hubGiftPayload: coins lấy từ diamondCount khi không truyền', () => {
    const p = H.hubGiftPayload({ giftId: 5655, diamondCount: 5, repeatCount: 2, giftPicture: 'img' }, { id: 'i' });
    assert.equal(p.coins, 5);
    assert.equal(p.totalCoins, 10);
    assert.equal(p.giftImage, 'img');
    assert.equal(p.giftId, '5655');
});

test('hubGiftToAction: quà Thử quà trên Hub -> emitGift', () => {
    const g = H.hubGiftToAction({ id: 'ht1', giftId: 5655, quantity: 12, coins: 1, user: { uniqueId: 'u1', nickname: 'U1' } });
    assert.equal(g.repeatCount, 12);
    assert.equal(g.source, 'test');
    assert.equal(g.hubGiftId, 'ht1');
    assert.equal(g.giftId, '5655');
    assert.equal(g.uniqueId, 'u1');
    assert.equal(g.diamondCount, 1);
    assert.equal(H.hubGiftToAction({ id: 'z', giftId: 1, coins: 1 }).uniqueId, 'hp-game-hub');
    assert.equal(H.hubGiftToAction({ id: 'z', giftId: 1, coins: 1 }).repeatCount, 1);
});

test('hubStatusPayload: không có vtube, queue false', () => {
    const s = H.hubStatusPayload({ connected: false });
    assert.equal(s.live, false);
    assert.equal(s.demo, false);
    assert.deepEqual(s.capabilities, { queue: false });
    const t = H.hubStatusPayload({ connected: true, uniqueId: 'u', roomId: 'r', viewers: 5, since: 9 });
    assert.equal(t.live, true);
    assert.equal(t.viewers, 5);
});

test('HUB_PROFILE: hồ sơ chung, đông cứng', () => {
    assert.deepEqual(H.HUB_PROFILE, {
        profileId: 'common', name: 'MẶC ĐỊNH', sceneName: '',
        all: [{ profileId: 'common', name: 'MẶC ĐỊNH' }]
    });
    assert.ok(Object.isFrozen(H.HUB_PROFILE));
});

test('hubCatalogPayload: danh mục quà + sig', () => {
    const list = [
        { id: 'music', name: 'Ca khúc', image: 'm.png', diamond: 199, virtual: true },
        { id: '5655', name: 'Rose', nameVi: 'Hoa hồng', image: 'r.png', diamond: 1 },
        { name: 'thiếu id', diamond: 3 },
        { id: '9' }
    ];
    const c = H.hubCatalogPayload(list);
    assert.equal(c.gifts.length, 2);
    const music = c.gifts.find(x => x.giftId === 'music');
    assert.equal(music.virtual, true);
    assert.equal(music.coins, 199);
    assert.equal(c.gifts.find(x => x.giftId === '5655').nameVi, 'Hoa hồng');
    assert.equal(H.hubCatalogPayload(list).sig, c.sig);
    const list2 = list.map(x => ({ ...x }));
    list2[1].diamond = 2;
    assert.notEqual(H.hubCatalogPayload(list2).sig, c.sig);
    assert.match(c.sig, /^[0-9a-f]{40}$/);
});

test('hubOwns: Hub sở hữu trang khi nối + provides', () => {
    assert.equal(H.hubOwns({ enabled: true, connected: false, provides: ['camera'] }, 'camera'), false);
    assert.equal(H.hubOwns({ enabled: true, connected: true, provides: [] }, 'camera'), false);
    const pub = { enabled: true, connected: true, provides: ['camera'] };
    assert.equal(H.hubOwns(pub, 'camera'), true);
    assert.equal(H.hubOwns(pub, 'fxlib'), false);
    assert.equal(H.hubOwns({ ...pub, enabled: false }, 'camera'), false);
    assert.equal(H.hubOwns(null, 'camera'), false);
});

test('camRouteForGift: Hub nắm camera thì không chạy cam cục bộ', () => {
    assert.deepEqual(H.camRouteForGift(true, ['dapmuoi']), { runLocalCam: false, camClaims: ['hub'] });
    assert.deepEqual(H.camRouteForGift(false, ['dapmuoi']), { runLocalCam: true, camClaims: ['dapmuoi'] });
});

test('createSlowCounter: cửa sổ trượt, nhật ký 1 lần / phút', () => {
    let t = 1000;
    const logs = [];
    const c = H.createSlowCounter({ now: () => t, onLog: n => logs.push(n) });
    assert.equal(c.slow(), false);
    for (let i = 0; i < 5; i++) c.hit();
    assert.equal(c.slow(), false);
    c.hit();
    assert.equal(c.count(), 6);
    assert.equal(c.slow(), true);
    assert.equal(logs.length, 1);
    c.hit(); c.hit();
    assert.equal(logs.length, 1);
    t += 60001;
    assert.equal(c.slow(), false);
    assert.equal(c.count(), 0);
});

test('hubCardModel: bảng điều kiện', () => {
    const base = { allowed: true, enabled: true };
    const M = H.hubCardModel;
    assert.deepEqual([M({ allowed: false }).tone, M({ allowed: false }).text, M({ allowed: false }).action],
        ['off', 'Liên kết HP Game Hub chỉ chạy trong app HP Action LIVE', null]);
    const off = M({ allowed: true, enabled: false });
    assert.deepEqual([off.tone, off.text, off.action], ['off', 'Đã tắt liên kết HP Game Hub', null]);
    const ok = M({ ...base, connected: true, version: '0.3.0' });
    assert.deepEqual([ok.tone, ok.text, ok.action], ['ok', 'Đã nối · 0.3.0', 'open']);
    const game = M({ ...base, connected: true, version: '0.3.0', games: [{ name: 'Đập Muỗi' }] });
    assert.equal(game.text, 'Đã nối · 0.3.0 · Đập Muỗi đang chạy');
    const slow = M({ ...base, connected: true, version: '0.3.0', slow: true });
    assert.deepEqual([slow.tone, slow.text], ['warn', 'Đã nối · 0.3.0 · phản hồi chậm']);
    const pair = M({ ...base, pairing: { code: '123456' } });
    assert.deepEqual([pair.tone, pair.text, pair.action], ['warn', 'Chờ cho phép trên HP Game Hub (mã 123456)', 'open']);
    const rev = M({ ...base, lastError: 'token_revoked' });
    assert.deepEqual([rev.tone, rev.text, rev.action], ['warn', 'Cần cho phép lại trên HP Game Hub', 'pair']);
    const den = M({ ...base, lastError: 'pair_denied' });
    assert.deepEqual([den.tone, den.text, den.action], ['warn', 'Đã bị từ chối trên HP Game Hub', 'pair']);
    const run = M({ ...base, running: true, installed: true });
    assert.deepEqual([run.tone, run.text, run.action], ['warn', 'HP Game Hub đang mở, chưa liên kết', 'pair']);
    const ins = M({ ...base, installed: true });
    assert.deepEqual([ins.tone, ins.text, ins.action], ['idle', 'Đã cài, chưa mở', 'launch']);
    const none = M({ ...base });
    assert.deepEqual([none.tone, none.text, none.action], ['idle', 'Chưa cài', 'download']);
    // dòng đầu khớp thắng: connected thắng running/lastError
    assert.equal(M({ ...base, connected: true, running: true, lastError: 'pair_denied', version: '1' }).tone, 'ok');
    for (const p of [{ allowed: false }, { ...base, enabled: false }, { ...base, connected: true, version: '1', slow: true, games: [{ name: 'A' }] },
        { ...base, pairing: { code: '1' } }, { ...base, lastError: 'token_revoked' }, { ...base, lastError: 'pair_denied' },
        { ...base, running: true }, { ...base, installed: true }, base]) {
        assert.doesNotMatch(M(p).text, /token|WebSocket|Hub Link/i);
    }
});

test('hubCardModel: chữ nút', () => {
    assert.equal(H.HUB_ACTION_LABELS.open, 'Mở HP Game Hub');
    assert.equal(H.HUB_ACTION_LABELS.launch, 'Mở HP Game Hub');
    assert.equal(H.HUB_ACTION_LABELS.pair, 'Cho phép lại');
    assert.equal(H.HUB_ACTION_LABELS.download, 'Tải HP Game Hub');
});

test('hubCardHints: gợi ý từ needs và camera chạy đôi', () => {
    const h = H.hubCardHints({ needs: [{ kind: 'overlay_missing', message: 'OBS chưa mở link Game Camera của HP Game Hub', action: { page: 'camera' } }] });
    assert.equal(h.length, 1);
    assert.equal(h[0].tone, 'warn');
    assert.equal(h[0].page, 'camera');
    assert.equal(h[0].text, 'OBS chưa mở link Game Camera của HP Game Hub');
    assert.deepEqual(H.hubCardHints({}), []);
    const both = H.hubCardHints({ ownsCamera: true, localCamOverlayOnline: true });
    assert.equal(both.length, 1);
    assert.match(both[0].text, /gỡ link/);
    assert.equal(H.hubCardHints({ ownsCamera: false, localCamOverlayOnline: true }).length, 0);
});
