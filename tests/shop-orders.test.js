'use strict';
// 🛒 lib/shop-orders.js — bộ theo dõi đơn mua game phía Node (spec 2026-10-29-mua-game-sepay §6.2). Không mạng: api giả + đồng hồ giả.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/shop-orders');

function harness(over = {}) {
    let t = 1_000_000;
    const timers = [];
    const events = [];
    let cache = null, pending = [], rechecks = 0;
    const calls = [];
    let statusReply = { ok: true, order: { code: 'HPGAAAAAAAA', feature: 'thuytinh', amount: 50000, received: 0, status: 'pending' } };
    const api = {
        shopItems: async () => { calls.push('items'); return over.items || { ok: true, on: true, items: [{ id: 'thuytinh', name: 'Hũ', price: 50000 }, { id: 'x', price: 0 }], owned: ['caro'], open: [] }; },
        orderCreate: async (f) => { calls.push('create:' + f); return over.create || { ok: true, order: { code: 'HPGAAAAAAAA', feature: f, name: 'Hũ', amount: 50000, received: 0, status: 'pending' }, pay: { amount: 50000, content: 'HPGAAAAAAAA', qr: ['1'] } }; },
        orderStatus: async (code, opts) => { calls.push('status:' + code + (opts && opts.check ? ':check' : '')); return typeof statusReply === 'function' ? statusReply(code) : statusReply; },
    };
    const shop = S.createShop({
        api, emit: (ev, d) => events.push([ev, d]), recheck: async () => { rechecks++; },
        getCache: () => cache, setCache: (c) => { cache = c; }, getPending: () => pending, setPending: (l) => { pending = l; },
        log: { warn() {} }, now: () => t,
        setTimer: (fn, ms) => { const h = { fn, at: t + ms, ms }; timers.push(h); return h; },
        clearTimer: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); },
    });
    /** Tua đồng hồ tới hẹn gần nhất và chạy nó (chờ promise trong hàm hẹn giờ chạy xong). */
    async function tick() {
        timers.sort((a, b) => a.at - b.at);
        const h = timers.shift();
        if (!h) return null;
        t = h.at;
        h.fn();
        for (let i = 0; i < 10; i++) await Promise.resolve();
        await new Promise((r) => setImmediate(r));
        return h.ms;
    }
    return { shop, events, calls, timers, tick, get cache() { return cache; }, get pending() { return pending; }, get rechecks() { return rechecks; },
        setStatus: (r) => { statusReply = r; }, advance: (ms) => { t += ms; }, now: () => t };
}

test('nhịp hỏi: 4 s trong 10 phút đầu, 15 s tới phút 30, rồi thôi', () => {
    assert.equal(S.pollDelay(0), 4000);
    assert.equal(S.pollDelay(9 * 60e3), 4000);
    assert.equal(S.pollDelay(11 * 60e3), 15000);
    assert.equal(S.pollDelay(30 * 60e3), null);
});

test('danh sách bán: bỏ mục giá 0, cache gọn; lỗi mạng giữ cache cũ; gộp lời gọi + giãn 30 s', async () => {
    const h = harness();
    const c = await h.shop.refreshItems('test', true);
    assert.deepEqual(c.items, [{ id: 'thuytinh', name: 'Hũ', price: 50000 }]);
    assert.deepEqual(h.shop.sellableIds(), ['thuytinh']);
    assert.deepEqual(h.cache.owned, ['caro']);
    await h.shop.refreshItems('again');
    assert.equal(h.calls.filter((x) => x === 'items').length, 1, 'trong 30 s không gọi lại');
    const off = harness({ items: { ok: true, on: false, items: [{ id: 'a', price: 1 }] } });
    await off.shop.refreshItems('x', true);
    assert.deepEqual(off.shop.sellableIds(), [], 'shop tắt → không bán gì');
    const bad = harness({ items: { ok: false, error: 'no_network' } });
    await bad.shop.refreshItems('x', true);
    assert.deepEqual(bad.shop.cached().items, []);
});

test('mua → theo dõi; trả thiếu báo partial; đủ → xác thực lại KEY, làm mới danh sách, báo unlocked; thôi theo dõi', async () => {
    const h = harness();
    const r = await h.shop.create('thuytinh');
    assert.equal(r.ok, true);
    assert.deepEqual(h.pending.map((p) => p.code), ['HPGAAAAAAAA'], 'lưu đơn treo');
    assert.equal(h.timers.length, 1);
    assert.equal(await h.tick(), 4000);
    assert.equal(h.events.length, 0, 'chưa đổi gì → im');
    h.setStatus({ ok: true, order: { code: 'HPGAAAAAAAA', feature: 'thuytinh', amount: 50000, received: 20000, status: 'partial' }, pay: { amount: 30000 } });
    await h.tick();
    assert.deepEqual(h.events.map(([e, d]) => [e, d.status, d.received, d.due]), [['shop:order', 'partial', 20000, 30000]]);
    h.setStatus({ ok: true, order: { code: 'HPGAAAAAAAA', feature: 'thuytinh', amount: 50000, received: 50000, status: 'paid' } });
    await h.tick();
    assert.equal(h.rechecks, 1, 'xác thực KEY ngay');
    assert.deepEqual(h.events.slice(1).map(([, d]) => [d.status, !!d.unlocked]), [['paid', false], ['paid', true]]);
    assert.equal(h.timers.length, 0, 'thôi theo dõi');
    assert.deepEqual(h.pending, [], 'bỏ khỏi đơn treo');
});

test('quá 30 phút chưa trả → thôi hỏi nhưng GIỮ đơn treo (mở app lần sau hỏi lại)', async () => {
    const h = harness();
    await h.shop.create('thuytinh');
    let n = 0;
    while (h.timers.length && n < 500) { await h.tick(); n++; }
    assert.ok(h.now() - 1_000_000 >= 30 * 60e3 - 15000);
    assert.equal(h.shop._watches.size, 0);
    assert.equal(h.pending.length, 1);
    const fast = h.calls.filter((c) => c.startsWith('status')).length;
    assert.ok(fast > 150 && fast < 260, 'khoảng 150 lần nhanh + 80 lần chậm: ' + fast);
});

test('Kiểm tra: gửi check=1, tối đa 1 lần / 10 s; đơn huỷ / hết hạn → thôi theo dõi, bỏ treo, không xác thực lại', async () => {
    const h = harness();
    await h.shop.create('thuytinh');
    await h.shop.check('HPGAAAAAAAA');
    const r2 = await h.shop.check('HPGAAAAAAAA');
    assert.equal(r2.throttled, true);
    assert.equal(h.calls.filter((c) => c.endsWith(':check')).length, 1);
    h.setStatus({ ok: true, order: { code: 'HPGAAAAAAAA', feature: 'thuytinh', amount: 50000, received: 0, status: 'cancelled' } });
    h.advance(11000);
    await h.shop.check('HPGAAAAAAAA');
    assert.equal(h.shop._watches.size, 0);
    assert.deepEqual(h.pending, []);
    assert.equal(h.rechecks, 0);
});

test('mở app: đơn treo được hỏi lại; đã trả trong lúc tắt app → mở game ngay; quá 7 ngày bị bỏ', async () => {
    const h2 = harness();
    await h2.shop.create('thuytinh');
    h2.shop.stopAll();
    h2.advance(8 * 864e5);
    h2.shop.resume();
    assert.deepEqual(h2.pending, [], 'quá 7 ngày → bỏ');
    const h3 = harness();
    await h3.shop.create('thuytinh');
    h3.shop.stopAll();
    h3.setStatus({ ok: true, order: { code: 'HPGAAAAAAAA', feature: 'thuytinh', amount: 50000, received: 50000, status: 'paid' } });
    h3.shop.resume();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await new Promise((r) => setImmediate(r));
    assert.equal(h3.rechecks, 1);
    assert.deepEqual(h3.pending, []);
});

test('lỗi bán hàng (MỀM) trả nguyên cho giao diện, không theo dõi', async () => {
    const h = harness({ create: { ok: false, error: 'already_owned', message: 'KEY đã có mục này rồi.' } });
    const r = await h.shop.create('caro');
    assert.deepEqual([r.ok, r.error], [false, 'already_owned']);
    assert.equal(h.shop._watches.size, 0);
    assert.deepEqual(h.pending, []);
});
