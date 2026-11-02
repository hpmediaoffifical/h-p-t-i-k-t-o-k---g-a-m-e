'use strict';
// Vòng nối createActionHub với Hub GIẢ (fake-hub.cjs): cổng 0 trên 127.0.0.1, thư mục tạm, không đụng Hub thật / OBS / server.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { startFakeHub } = require('../lib/hub-link-client/fake-hub.cjs');
const { createHubLink } = require('../lib/hub-link-client/index.cjs');
const { createActionHub } = require('../lib/hub-link-action');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        try { if (fn()) return true; } catch { /* thử lại */ }
        await sleep(50);
    }
    return !!fn();
}

const CATALOG = [
    { id: '5655', name: 'Rose', image: '', diamond: 1 },
    { id: 'music', name: 'Ca khúc', image: '', diamond: 199, virtual: true }
];
const APP_ENV = { HP_ACTION_HUB_APP_ID: 'hp-action-live-dev' };
const APP_ID = 'hp-action-live-dev';
const names = (fake) => fake.received.map((m) => m.name);
const find = (fake, name) => fake.received.filter((m) => m.name === name);

const cleanups = [];
test.after(async () => {
    for (const fn of cleanups.reverse()) { try { await fn(); } catch { /* bỏ qua */ } }
});

// Dựng 1 ca: Hub giả + createActionHub nối vào đó, mọi thứ trong thư mục tạm.
async function setup({ env = APP_ENV, fakeOpts = {}, hubOpts = {}, noStart = false, noFake = false } = {}) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-action-hub-'));
    const fake = noFake ? null : await startFakeHub(fakeOpts);
    const calls = { owns: [], test: [], pub: [] };
    const warns = [];
    const logger = { info() {}, warn: (...a) => warns.push(a.join(' ')) };
    const hub = createActionHub({
        env, createHubLink, dataDir: tmp, version: '1.2.3',
        getStatus: () => ({ connected: true, uniqueId: 'kenh_thu', roomId: 'r1', viewers: 9, since: 1 }),
        getCatalog: () => CATALOG,
        onOwnsChange: (b) => calls.owns.push(b),
        onTestGift: (g) => calls.test.push(g),
        onPublic: (p) => calls.pub.push(p),
        logger,
        syncMs: 100,
        sdk: {
            discoveryFile: fake ? fake.discoveryFile : path.join(tmp, 'khong-co-hub.json'),
            installFile: path.join(tmp, 'khong-co.json'),
            probePorts: [], pollMs: 200, backoffMinMs: 100, backoffMaxMs: 300
        },
        ...hubOpts
    });
    cleanups.push(async () => { hub.stop(); if (fake) await fake.close(); fs.rmSync(tmp, { recursive: true, force: true }); });
    if (!noStart) hub.start();
    return { tmp, fake, hub, calls, warns };
}

test('(iso) không có công tắc: không tạo SDK, không ghép đôi, không gửi gì', async () => {
    let made = 0;
    const spy = (o) => { made++; return createHubLink(o); };
    const { fake, hub } = await setup({ env: {}, hubOpts: { createHubLink: spy } });
    assert.equal(hub.allowed, false);
    assert.equal(hub.publicState().allowed, false);
    assert.equal(hub.ownsCamera(), false);
    assert.equal(hub.onGift({ giftId: '5655' }, { coins: 1 }), false);
    hub.sendLive('like', { count: 1 });
    await sleep(1500);
    assert.equal(fake.pairCount, 0);
    assert.equal(fake.received.length, 0);
    assert.equal(made, 0);
});

test('(off) HP_ACTION_HUB_LINK=0: như cách ly', async () => {
    let made = 0;
    const spy = (o) => { made++; return createHubLink(o); };
    const { fake, hub } = await setup({
        env: { HP_ACTION_HUB_LINK: '0', HP_ACTION_HUB_APP_ID: APP_ID },
        hubOpts: { createHubLink: spy }
    });
    assert.equal(hub.allowed, false);
    await sleep(1500);
    assert.equal(fake.pairCount, 0);
    assert.equal(fake.received.length, 0);
    assert.equal(made, 0);
});

test('(pair) tự ghép đôi, đồng bộ trạng thái / hồ sơ / danh mục', async () => {
    const { fake, hub, tmp } = await setup();
    assert.ok(await until(() => hub.publicState().connected), 'phải nối được');
    const pub = hub.publicState();
    assert.equal(pub.appId, APP_ID);
    assert.equal(pub.allowed, true);
    assert.equal(pub.paired, true);
    assert.ok(await until(() => find(fake, 'catalog.gifts').length >= 1 && find(fake, 'live.status').length >= 1 && find(fake, 'profile.changed').length >= 1));
    const st = find(fake, 'live.status')[0].data;
    assert.equal(st.capabilities.queue, false);
    assert.equal(st.uniqueId, 'kenh_thu');
    assert.equal(find(fake, 'profile.changed')[0].data.profileId, 'common');
    const gifts = find(fake, 'catalog.gifts')[0].data.gifts;
    assert.ok(gifts.some((g) => g.giftId === '5655'));
    assert.equal(gifts.find((g) => g.giftId === 'music').virtual, true);
    const saved = JSON.parse(fs.readFileSync(path.join(tmp, 'hub-link.json'), 'utf8'));
    assert.ok(saved.token);
    assert.deepEqual(fake.scopesOf(APP_ID).sort(), ['gift.plan', 'live.send', 'state.read']);
    // thẻ trạng thái có đủ trường cho giao diện
    for (const k of ['allowed', 'enabled', 'installed', 'running', 'pairing', 'lastError', 'version', 'games', 'provides', 'slow', 'ownsCamera', 'localCamOverlayOnline', 'needs', 'card', 'hints', 'overlays', 'download']) {
        assert.ok(k in pub, 'thiếu ' + k);
    }
    assert.equal(pub.version, '0.0.0-fake');
    assert.equal(pub.card.tone, 'ok');
    assert.ok(!/·\s*$/.test(pub.card.text));
});

test('(provides-empty) Hub chưa nhận việc camera: onGift giữ đường cũ, không gửi gì', async () => {
    const { fake, hub } = await setup();
    assert.ok(await until(() => hub.publicState().connected));
    assert.equal(hub.ownsCamera(), false);
    assert.equal(hub.onGift({ giftId: '5655', repeatCount: 1 }, { coins: 1 }), false);
    await sleep(300);
    assert.equal(names(fake).includes('live.gift'), false);
    assert.equal(names(fake).includes('gift.plan'), false);
});

test('(owns) provides có camera: đổi trạng thái đúng 1 lần, gửi live.gift + gift.plan cùng id', async () => {
    const { fake, hub, calls } = await setup();
    assert.ok(await until(() => hub.publicState().connected));
    fake.emit(APP_ID, 'hub.state', { provides: ['camera'], running: [], needs: [], lights: {}, features: {}, version: 'x' });
    assert.ok(await until(() => hub.ownsCamera()));
    await sleep(300);
    assert.deepEqual(calls.owns, [true]);
    assert.equal(hub.onGift({ giftId: '5655', repeatCount: 3, uniqueId: 'a', nickname: 'A', source: 'tiktok' }, { coins: 1 }), true);
    assert.ok(await until(() => find(fake, 'live.gift').length === 1 && find(fake, 'gift.plan').length === 1));
    const g = find(fake, 'live.gift')[0].data;
    const p = find(fake, 'gift.plan')[0].data;
    assert.match(g.id, /^a_/);
    assert.equal(p.id, g.id);
    assert.equal(g.quantity, 3);
    assert.equal(g.totalCoins, 3);
    assert.equal(g.source, 'tiktok');
    assert.ok(names(fake).indexOf('live.gift') < names(fake).indexOf('gift.plan'));
    // quà thiếu giftId: không ném, không gửi
    assert.equal(hub.onGift({ repeatCount: 1 }, { coins: 1 }), false);
    assert.equal(hub.onGift(null, {}), false);
    assert.equal(find(fake, 'live.gift').length, 1);
    assert.equal(hub.publicState().ownsCamera, true);
});

test('(nowait) gift.plan chậm: onGift không chờ, 6 lần quá hạn = thẻ vàng, nhật ký 1 dòng', async () => {
    const { fake, hub, warns } = await setup({
        fakeOpts: { handlers: { 'gift.plan': async () => { await sleep(600); return { decision: 'pass' }; } } }
    });
    assert.ok(await until(() => hub.publicState().connected));
    fake.emit(APP_ID, 'hub.state', { provides: ['camera'], running: [], needs: [] });
    assert.ok(await until(() => hub.ownsCamera()));
    let worst = 0;
    for (let i = 0; i < 6; i++) {
        const t0 = performance.now();
        assert.equal(hub.onGift({ giftId: '5655', repeatCount: 1 }, { coins: 1 }), true);
        worst = Math.max(worst, performance.now() - t0);
    }
    assert.ok(worst < 50, 'onGift phải trả về ngay, đo được ' + worst + ' ms');
    assert.ok(await until(() => hub.publicState().slow, 2000), 'phải báo chậm');
    const pub = hub.publicState();
    assert.ok(pub.card.text.includes('phản hồi chậm'), pub.card.text);
    assert.equal(pub.card.tone, 'warn');
    assert.equal(warns.filter((l) => l.includes('chậm')).length, 1);
});

test('(test-from-hub) quà từ Thử quà trên Hub giữ id của Hub, không tạo id mới', async () => {
    const { fake, hub, calls } = await setup();
    assert.ok(await until(() => hub.publicState().connected));
    fake.emit(APP_ID, 'hub.state', { provides: ['camera'], running: [], needs: [] });
    assert.ok(await until(() => hub.ownsCamera()));
    fake.emit(APP_ID, 'gift.test', { id: 'ht1', giftId: '5655', giftName: 'Rose', quantity: 12, coins: 1, user: { uniqueId: 'u1', nickname: 'U1' }, source: 'test' });
    assert.ok(await until(() => calls.test.length === 1));
    assert.equal(calls.test[0].hubGiftId, 'ht1');
    assert.equal(calls.test[0].repeatCount, 12);
    assert.equal(calls.test[0].source, 'test');
    assert.equal(hub.onGift(calls.test[0], { coins: 1 }), true);
    assert.ok(await until(() => find(fake, 'gift.plan').length === 1));
    assert.equal(find(fake, 'gift.plan')[0].data.id, 'ht1');
    assert.equal(find(fake, 'live.gift')[0].data.id, 'ht1');
});

test('(catalog-request) Hub xin danh mục: gửi lại dù chữ ký không đổi', async () => {
    const { fake, hub } = await setup();
    assert.ok(await until(() => find(fake, 'catalog.gifts').length >= 1));
    await sleep(400); // để các nhịp đồng bộ trôi qua: chữ ký không đổi thì không gửi thêm
    const before = find(fake, 'catalog.gifts').length;
    assert.equal(before, 1);
    fake.emit(APP_ID, 'catalog.request', {});
    assert.ok(await until(() => find(fake, 'catalog.gifts').length === before + 1, 1000));
    assert.ok(hub.publicState().connected);
});

test('(live) sendLive gửi live.like với hồ sơ chung', async () => {
    const { fake, hub } = await setup();
    assert.ok(await until(() => hub.publicState().connected));
    hub.sendLive('like', { user: { uniqueId: 'a' }, count: 5, total: 9 });
    hub.sendLive('khong-biet', { x: 1 });
    assert.ok(await until(() => find(fake, 'live.like').length === 1));
    assert.equal(find(fake, 'live.like')[0].data.profileId, 'common');
    assert.equal(find(fake, 'live.like')[0].data.count, 5);
    assert.equal(names(fake).includes('live.khong-biet'), false);
});

test('(resync) Hub chết rồi sống lại: về đường cũ, tự ghép lại, gửi lại đủ ba gói', async () => {
    const { fake, hub, calls, tmp } = await setup();
    assert.ok(await until(() => hub.publicState().connected));
    fake.emit(APP_ID, 'hub.state', { provides: ['camera'], running: [], needs: [] });
    assert.ok(await until(() => hub.ownsCamera()));
    await fake.close();
    assert.ok(await until(() => !hub.publicState().connected, 3000));
    assert.ok(await until(() => calls.owns[calls.owns.length - 1] === false, 3000));
    assert.equal(hub.ownsCamera(), false);
    assert.deepEqual(calls.owns, [true, false]);
    const fake2 = await startFakeHub({ discoveryFile: fake.discoveryFile });
    cleanups.push(() => fake2.close());
    assert.ok(await until(() => hub.publicState().connected, 6000), 'phải tự nối lại');
    assert.ok(await until(() => ['live.status', 'profile.changed', 'catalog.gifts'].every((n) => find(fake2, n).length >= 1), 3000));
    assert.ok(fs.existsSync(path.join(tmp, 'hub-link.json')));
});

test('(enabled) tắt công tắc ngắt kết nối, bật lại thì nối lại', async () => {
    const { hub } = await setup();
    assert.ok(await until(() => hub.publicState().connected));
    hub.setEnabled(false);
    assert.ok(await until(() => !hub.publicState().connected, 3000));
    assert.equal(hub.publicState().card.tone, 'off');
    assert.equal(hub.publicState().enabled, false);
    assert.equal(hub.ownsCamera(), false);
    hub.setEnabled(true);
    assert.ok(await until(() => hub.publicState().connected, 5000));
    assert.equal(hub.publicState().card.tone, 'ok');
});

test('(revoke) Hub thu hồi: cần cho phép lại, không tự xin ghép', async () => {
    const { fake, hub } = await setup();
    assert.ok(await until(() => hub.publicState().connected));
    assert.equal(fake.revoke(APP_ID), true);
    assert.ok(await until(() => !hub.publicState().paired, 3000));
    const pub = hub.publicState();
    assert.equal(pub.lastError, 'token_revoked');
    assert.equal(pub.card.action, 'pair');
    const n = fake.pairCount;
    await sleep(3000);
    assert.equal(fake.pairCount, n);
});

test('(launch) chưa cài Hub: launch() = false; open() trang lạ = failed', async () => {
    const { fake, hub } = await setup();
    assert.equal(hub.launch(), false);
    assert.equal(await hub.open('trang-la'), 'failed');
    assert.ok(await until(() => hub.publicState().connected));
    assert.equal(await hub.open('camera'), 'opened');
    assert.equal(fake.opened[fake.opened.length - 1].page, 'camera');
});

test('(onPublic) chỉ báo khi giao diện thực sự đổi', async () => {
    const { fake, hub, calls } = await setup();
    assert.ok(await until(() => hub.publicState().connected));
    await sleep(300);
    const n = calls.pub.length;
    assert.ok(n >= 1);
    for (let i = 0; i < 5; i++) fake.emit(APP_ID, 'hub.state', { provides: [], running: [], needs: [] });
    await sleep(400);
    const afterSame = calls.pub.length;
    assert.ok(afterSame <= n + 1, `hub.state lặp không đổi không được báo thêm (${n} -> ${afterSame})`);
    fake.emit(APP_ID, 'hub.state', { provides: ['camera'], running: [{ name: 'Đập Muỗi' }], needs: [] });
    assert.ok(await until(() => calls.pub.length > afterSame));
    assert.ok(calls.pub[calls.pub.length - 1].ownsCamera);
});

test('(throw) getStatus / getCatalog ném lỗi: bỏ qua nhịp, không gửi gói rỗng', async () => {
    let failStatus = true;
    let failCat = true;
    const { fake, hub } = await setup({
        hubOpts: {
            getStatus: () => { if (failStatus) throw new Error('status hỏng'); return { connected: true, uniqueId: 'kenh_thu', roomId: 'r1', viewers: 9, since: 1 }; },
            getCatalog: () => { if (failCat) throw new Error('catalog hỏng'); return CATALOG; }
        }
    });
    assert.ok(await until(() => hub.publicState().connected));
    await sleep(500);
    assert.equal(find(fake, 'live.status').length, 0, 'không gửi live.status khi getStatus ném');
    assert.equal(find(fake, 'catalog.gifts').length, 0, 'không gửi catalog rỗng khi getCatalog ném');
    failStatus = false; failCat = false;
    assert.ok(await until(() => find(fake, 'live.status').length >= 1 && find(fake, 'catalog.gifts').length >= 1));
    assert.ok(find(fake, 'catalog.gifts')[0].data.gifts.length > 0);
    assert.equal(find(fake, 'live.status')[0].data.connected, true);
});

test('(catalog-new) mảng danh mục mới => gửi lại gói mới', async () => {
    let cat = CATALOG;
    const { fake, hub } = await setup({ hubOpts: { getCatalog: () => cat } });
    assert.ok(await until(() => find(fake, 'catalog.gifts').length >= 1));
    cat = CATALOG.concat([{ id: '7777', name: 'Heart', image: '', diamond: 5 }]);
    assert.ok(await until(() => find(fake, 'catalog.gifts').length >= 2));
    assert.ok(find(fake, 'catalog.gifts')[1].data.gifts.some((g) => g.giftId === '7777'));
    assert.ok(hub.publicState());
});

test('(download-cache) đường nóng publicState / ownsCamera không đọc links.json mỗi lần', async () => {
    let reads = 0;
    const spy = (o) => {
        const l = createHubLink(o);
        return new Proxy(l, { get(t, k) { if (k === 'links') reads++; return t[k]; } });
    };
    const { hub } = await setup({ hubOpts: { createHubLink: spy } });
    for (let i = 0; i < 50; i++) { hub.publicState(); hub.ownsCamera(); }
    assert.ok(reads <= 1, `links đọc ${reads} lần, mong tối đa 1`);
});
