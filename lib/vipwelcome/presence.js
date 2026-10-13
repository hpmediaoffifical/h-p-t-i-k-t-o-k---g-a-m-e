'use strict';
/* VIP Welcome — thuật toán vào / ra / vào lại.
 * TikTok không có sự kiện "rời phòng", và cũng không cần: mỗi tín hiệu vào phòng (member/barrage) là
 * một lần vào THẬT. Chỉ gộp khi CÙNG một lần vào đến từ HAI nguồn khác nhau (member + banner barrage)
 * trong cửa sổ ngắn; cùng nguồn lặp lại (member → member) = người đó ra rồi vào lại → chào tiếp.
 * Cooldown do người dùng tự đặt. Hoạt động (chat/tim/quà) không bao giờ là "vào lại" — chỉ dùng để
 * chào muộn người mà TikTok không gửi tín hiệu vào phòng. "Đã chào" chỉ ghi khi overlay báo thẻ đã hiện. */

// Mỗi nguồn là 1 họ riêng (1 lần vào có thể đến cả member + banner cấp + banner fan + superfan);
// host tự vào phòng tính như member.
function sourceFamily(source) {
    return (!source || source === 'host') ? 'member' : String(source);
}

function createPresence() {
    // key → { lastSignalAt, lastWelcomedAt, joinCount, lateFired, lastDecision, families }
    const users = new Map();

    function entry(key) {
        let e = users.get(key);
        if (!e) {
            e = { lastSignalAt: 0, lastWelcomedAt: 0, joinCount: 0, lateFired: false, lastDecision: '', families: new Set() };
            users.set(key, e);
        }
        return e;
    }

    return {
        onJoinSignal(key, now, { antiDupMs = 0, cooldownMs = 0, source } = {}) {
            const e = entry(key);
            const fam = sourceFamily(source);
            if (e.lastSignalAt && now - e.lastSignalAt < antiDupMs && !e.families.has(fam)) {
                e.families.add(fam);
                return (e.lastDecision = 'dup');
            }
            e.lastSignalAt = now;
            e.families = new Set([fam]);
            e.joinCount++;
            if (cooldownMs > 0 && e.lastWelcomedAt && now - e.lastWelcomedAt < cooldownMs) return (e.lastDecision = 'cooldown');
            return (e.lastDecision = 'welcome');
        },
        onActivity(key, now, { lateEnabled = true } = {}) {
            if (!lateEnabled) return null;
            const e = entry(key);
            if (e.lastSignalAt || e.lastWelcomedAt || e.lateFired) return null;
            e.lateFired = true;
            return 'late';
        },
        markWelcomed(key, now) { entry(key).lastWelcomedAt = now; },
        get(key) {
            const e = users.get(key);
            if (!e) return undefined;
            const { families, ...rest } = e;
            return rest;
        },
        reset() { users.clear(); },
        size() { return users.size; }
    };
}

/* Thẻ đã quyết định hiện nhưng overlay chưa xác nhận (chưa mở OBS / đang reload). 1 thẻ/người,
 * tự bỏ thẻ quá maxAgeMs và chặn trần maxItems (bỏ thẻ cũ nhất) để không phình khi không mở overlay. */
function createPendingCards({ maxAgeMs = 60000, maxItems = 500 } = {}) {
    const byId = new Map();    // id → { card, putAt, sentAt } — Map giữ thứ tự chèn = cũ trước
    const idByKey = new Map(); // key → id

    function drop(id) {
        const it = byId.get(id);
        if (!it) return null;
        byId.delete(id);
        if (idByKey.get(it.card.key) === id) idByKey.delete(it.card.key);
        return it.card;
    }
    function prune(now) {
        for (const [id, it] of byId) if (now - it.putAt > maxAgeMs) drop(id);
    }

    return {
        put(card, now) {
            prune(now);
            const old = idByKey.get(card.key);
            if (old) drop(old);
            byId.set(card.id, { card, putAt: now, sentAt: 0 });
            idByKey.set(card.key, card.id);
            while (byId.size > maxItems) drop(byId.keys().next().value);
        },
        take(now) { prune(now); return [...byId.values()].map(it => it.card); },
        ack(id) { return drop(id); },
        has(id) { return byId.has(id); },
        markSent(id, now) { const it = byId.get(id); if (it) it.sentAt = now; },
        unackedOlderThan(ms, now) {
            prune(now);
            return [...byId.values()].filter(it => it.sentAt && now - it.sentAt > ms).map(it => it.card);
        },
        clear() { byId.clear(); idByKey.clear(); },
        size() { return byId.size; }
    };
}

module.exports = { createPresence, createPendingCards, sourceFamily };
