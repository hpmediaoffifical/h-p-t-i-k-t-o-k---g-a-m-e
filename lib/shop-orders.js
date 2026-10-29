'use strict';
/**
 * 🛒 Mua game trong app — phía Node (spec docs/superpowers/specs/2026-10-29-mua-game-sepay-design.md §6.2).
 *
 * Server HP KEY (shop.php) qua SDK hpkey/validate: shopItems / orderCreate / orderStatus. Mọi lỗi ở đây là MỀM — không bao giờ
 * đụng tới bản quyền (token) hay đóng app.
 *   - Danh sách bán (items / owned / on) cache vào appConfig.license.shop: mở app offline vẫn biết giá; làm mới ≤ 10 phút/lần.
 *   - MỘT bộ hỏi trạng thái cho mọi đơn đang theo dõi: 4 s/lần trong 10 phút đầu → 15 s/lần tới phút 30 → dừng (watcher 60 s
 *     của bản quyền vẫn bắt được game mở). Đổi trạng thái → emit('shop:order'). Giao diện chỉ nghe socket, không gọi HP KEY.
 *   - Đơn 'paid' → recheck() (xác thực KEY ngay → token mới có game → applyLicenseLocks → 'license:features') → làm mới danh
 *     sách bán → emit('shop:order', {…, unlocked: true}).
 *   - Đơn đang theo dõi lưu ở appConfig.shopPending: đóng app giữa chừng, lần mở sau hỏi lại (≤ 7 ngày).
 * Hàm tạo nhận phụ thuộc (api, emit, recheck, cache, pending, đồng hồ) → test bằng tests/shop-orders.test.js không cần mạng.
 */

const POLL_FAST_MS = 4000;
const POLL_SLOW_MS = 15000;
const FAST_FOR_MS = 10 * 60 * 1000;
const WATCH_FOR_MS = 30 * 60 * 1000;
const CHECK_GAP_MS = 10 * 1000;           // nút "Tôi đã chuyển khoản · Kiểm tra": tối đa 1 lần / 10 s / đơn
const ITEMS_MIN_GAP_MS = 30 * 1000;       // làm mới danh sách bán không quá 1 lần / 30 s (trừ force)
const ITEMS_TTL_MS = 10 * 60 * 1000;
const PENDING_DAYS = 7;
const FINAL = new Set(['paid', 'cancelled', 'expired']);
const EMPTY = Object.freeze({ on: false, items: [], owned: [], open: [], at: 0 });

/** Thân shop_items của server → cache gọn (chỉ trường cần, kiểu chuẩn). */
function normalizeItems(body, at) {
    const items = Array.isArray(body && body.items) ? body.items
        .filter((i) => i && typeof i.id === 'string' && Number(i.price) > 0)
        .map((i) => ({ id: i.id, name: String(i.name || i.id), price: Math.round(Number(i.price)) })) : [];
    return {
        on: !!(body && body.on),
        items,
        owned: Array.isArray(body && body.owned) ? body.owned.map(String) : [],
        open: Array.isArray(body && body.open) ? body.open.filter((o) => o && o.code).map(normalizeOrder) : [],
        at: at || 0,
    };
}
/** Đơn của server → dạng gửi giao diện. */
function normalizeOrder(o) {
    return {
        code: String(o.code || ''), feature: String(o.feature || ''), name: String(o.name || o.feature || ''),
        amount: Math.round(Number(o.amount) || 0), received: Math.round(Number(o.received) || 0),
        status: String(o.status || 'pending'), created: Number(o.created) || 0, expires: Number(o.expires) || 0, paid: Number(o.paid) || 0,
    };
}
/** Nhịp hỏi theo tuổi đơn: null = thôi theo dõi. */
function pollDelay(ageMs) {
    if (ageMs >= WATCH_FOR_MS) return null;
    return ageMs < FAST_FOR_MS ? POLL_FAST_MS : POLL_SLOW_MS;
}

function createShop(deps) {
    const api = deps.api;
    const emit = deps.emit || (() => {});
    const recheck = deps.recheck || (async () => {});
    const getCache = deps.getCache || (() => null);
    const setCache = deps.setCache || (() => {});
    const getPending = deps.getPending || (() => []);
    const setPending = deps.setPending || (() => {});
    const log = deps.log || console;
    const now = deps.now || Date.now;
    const setTimer = deps.setTimer || setTimeout;
    const clearTimer = deps.clearTimer || clearTimeout;
    const watches = new Map();     // code → { order, pay, startedAt, timer, lastCheck }
    let itemsAt = 0, itemsBusy = null;

    const cached = () => { const c = getCache(); return c && typeof c === 'object' ? { ...EMPTY, ...c } : { ...EMPTY }; };
    const sellableIds = () => { const c = cached(); return c.on ? c.items.map((i) => i.id) : []; };

    /** Làm mới danh sách bán từ server (gộp lời gọi đang chạy). Lỗi → giữ cache cũ. */
    function refreshItems(reason, force) {
        if (itemsBusy) return itemsBusy;
        if (!force && now() - itemsAt < ITEMS_MIN_GAP_MS) return Promise.resolve(cached());
        itemsBusy = (async () => {
            try {
                const r = await api.shopItems();
                itemsAt = now();
                if (!r || r.ok !== true) {
                    if (r && r.error && r.error !== 'no_network') log.warn && log.warn('[shop] danh sách bán lỗi:', r.error, reason || '');
                    return cached();
                }
                const c = normalizeItems(r, now());
                setCache(c);
                for (const o of c.open) if (!watches.has(o.code) && pendingHas(o.code)) watch(o, null, false);
                return c;
            } catch (e) { log.warn && log.warn('[shop] danh sách bán lỗi:', e && e.message); return cached(); }
            finally { itemsBusy = null; }
        })();
        return itemsBusy;
    }
    function itemsStale() { return now() - itemsAt > ITEMS_TTL_MS; }

    function pendingHas(code) { return getPending().some((p) => p && p.code === code); }
    function pendingAdd(o) {
        const list = getPending().filter((p) => p && p.code !== o.code && now() - (p.at || 0) < PENDING_DAYS * 864e5);
        list.push({ code: o.code, feature: o.feature, at: now() });
        setPending(list.slice(-20));
    }
    function pendingDrop(code) {
        const list = getPending();
        if (list.some((p) => p && p.code === code)) setPending(list.filter((p) => p && p.code !== code));
    }

    function publicOf(w, extra) {
        return { ...w.order, ...(w.pay ? { due: w.pay.amount } : {}), ...(extra || {}) };
    }
    function stop(code) {
        const w = watches.get(code);
        if (!w) return;
        if (w.timer) clearTimer(w.timer);
        watches.delete(code);
    }
    function schedule(code) {
        const w = watches.get(code);
        if (!w) return;
        const delay = pollDelay(now() - w.startedAt);
        if (delay === null) { stop(code); return; }          // vẫn để trong pending: lần mở app sau / watcher bắt tiếp
        w.timer = setTimer(() => { poll(code).catch(() => {}).then(() => { if (watches.has(code)) schedule(code); }); }, delay);
    }
    function watch(order, pay, fresh) {
        const o = normalizeOrder(order);
        if (!o.code) return null;
        const w = watches.get(o.code);
        if (w) { w.order = o; if (pay) w.pay = pay; if (fresh) w.startedAt = now(); return w; }
        const nw = { order: o, pay: pay || null, startedAt: now(), timer: null, lastCheck: 0 };
        watches.set(o.code, nw);
        schedule(o.code);
        return nw;
    }

    /** Một trạng thái mới từ server: báo giao diện nếu đổi; paid → xác thực lại KEY + làm mới danh sách bán. */
    async function onOrder(order, pay) {
        const o = normalizeOrder(order);
        const w = watches.get(o.code) || { order: {}, pay: null };
        const changed = w.order.status !== o.status || w.order.received !== o.received;
        if (watches.has(o.code)) { w.order = o; if (pay) w.pay = pay; }
        if (changed) emit('shop:order', publicOf({ order: o, pay: pay || w.pay }));
        if (!FINAL.has(o.status)) return;
        stop(o.code);
        pendingDrop(o.code);
        if (o.status !== 'paid') return;
        try { await recheck('shop:' + o.code); } catch (e) { log.warn && log.warn('[shop] xác thực lại KEY lỗi:', e && e.message); }
        try { await refreshItems('paid', true); } catch (_) {}
        emit('shop:order', { ...o, unlocked: true });
    }

    async function poll(code, opts) {
        const r = await api.orderStatus(code, opts);
        if (r && r.ok === true && r.order) await onOrder(r.order, r.pay || null);
        return r;
    }

    /** Bấm Mua: tạo / dùng lại đơn ở server, bắt đầu theo dõi. → thân server {ok, order, pay} | {ok:false, error, message}. */
    async function create(feature) {
        const r = await api.orderCreate(String(feature || ''));
        if (!r || r.ok !== true || !r.order) return r || { ok: false, error: 'shop_failed' };
        const o = normalizeOrder(r.order);
        pendingAdd(o);
        watch(o, r.pay || null, true);
        if (FINAL.has(o.status)) await onOrder(o, r.pay);
        return { ok: true, order: o, pay: r.pay || null };
    }

    /** Trạng thái đang giữ (không gọi mạng); chưa theo dõi thì hỏi server 1 lần. */
    async function status(code) {
        const w = watches.get(code);
        if (w) return { ok: true, order: w.order, pay: w.pay };
        const r = await api.orderStatus(code);
        if (r && r.ok === true && r.order) {
            const o = normalizeOrder(r.order);
            if (pendingHas(o.code)) {
                if (FINAL.has(o.status)) await onOrder(o, r.pay || null);   // trả xong lúc app tắt → mở game ngay, bỏ treo
                else watch(o, r.pay || null, false);
            }
            return { ok: true, order: o, pay: r.pay || null };
        }
        return r || { ok: false, error: 'shop_failed' };
    }

    /** Nút "Tôi đã chuyển khoản · Kiểm tra": hỏi server kèm đối soát SePay (≤ 1 lần / 10 s / đơn); theo dõi lại nhịp nhanh. */
    async function check(code) {
        const w = watches.get(code);
        const t = now();
        if (w && t - w.lastCheck < CHECK_GAP_MS) return { ok: true, order: w.order, pay: w.pay, throttled: true };
        if (w) { w.lastCheck = t; w.startedAt = Math.max(w.startedAt, t - FAST_FOR_MS + 2 * 60 * 1000); }
        const r = await poll(code, { check: true });
        if (r && r.ok === true && r.order && !FINAL.has(r.order.status) && !watches.has(code)) watch(r.order, r.pay || null, true);
        const ww = watches.get(code);
        return r && r.ok === true ? { ok: true, order: ww ? ww.order : normalizeOrder(r.order), pay: ww ? ww.pay : (r.pay || null) } : r;
    }

    /** Mở app: hỏi lại các đơn còn treo (≤ 7 ngày) — đã trả thì mở game, còn chờ thì theo dõi tiếp. */
    function resume() {
        const list = getPending().filter((p) => p && p.code && now() - (p.at || 0) < PENDING_DAYS * 864e5);
        if (list.length !== getPending().length) setPending(list);
        for (const p of list) status(p.code).catch(() => {});
    }

    function stopAll() { for (const code of [...watches.keys()]) stop(code); }

    return { refreshItems, itemsStale, cached, sellableIds, create, status, check, resume, stopAll, _watches: watches };
}

module.exports = { createShop, normalizeItems, normalizeOrder, pollDelay, POLL_FAST_MS, POLL_SLOW_MS, FAST_FOR_MS, WATCH_FOR_MS, CHECK_GAP_MS };
