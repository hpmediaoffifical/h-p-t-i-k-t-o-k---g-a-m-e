'use strict';
/* VIP Welcome — thuật toán vào / ra / vào lại.
 * TikTok không có sự kiện "rời phòng", và cũng không cần: mỗi tín hiệu vào phòng (member/barrage) là
 * một lần vào THẬT. Chỉ chặn trùng trong cửa sổ ngắn (member + barrage cho cùng 1 lần vào) và cooldown
 * do người dùng tự đặt. Hoạt động (chat/tim/quà) không bao giờ là "vào lại" — chỉ dùng để chào muộn
 * người mà TikTok không gửi tín hiệu vào phòng. "Đã chào" chỉ ghi khi overlay báo thẻ đã hiện. */

function createPresence() {
    const users = new Map();   // key → { lastSignalAt, lastWelcomedAt, joinCount, lateFired }

    function entry(key) {
        let e = users.get(key);
        if (!e) { e = { lastSignalAt: 0, lastWelcomedAt: 0, joinCount: 0, lateFired: false }; users.set(key, e); }
        return e;
    }

    return {
        onJoinSignal(key, now, { antiDupMs = 0, cooldownMs = 0 } = {}) {
            const e = entry(key);
            if (e.lastSignalAt && now - e.lastSignalAt < antiDupMs) return 'dup';
            e.lastSignalAt = now;
            e.joinCount++;
            if (cooldownMs > 0 && e.lastWelcomedAt && now - e.lastWelcomedAt < cooldownMs) return 'cooldown';
            return 'welcome';
        },
        onActivity(key, now, { lateEnabled = true } = {}) {
            if (!lateEnabled) return null;
            const e = entry(key);
            if (e.lastSignalAt || e.lastWelcomedAt || e.lateFired) return null;
            e.lateFired = true;
            return 'late';
        },
        markWelcomed(key, now) { entry(key).lastWelcomedAt = now; },
        get(key) { const e = users.get(key); return e ? { ...e } : undefined; },
        reset() { users.clear(); },
        size() { return users.size; }
    };
}

/* Thẻ đã quyết định hiện nhưng overlay chưa xác nhận (chưa mở OBS / đang reload). 1 thẻ/người. */
function createPendingCards({ maxAgeMs = 60000 } = {}) {
    const byId = new Map();    // id → { card, putAt, sentAt }
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
            const old = idByKey.get(card.key);
            if (old) drop(old);
            byId.set(card.id, { card, putAt: now, sentAt: 0 });
            idByKey.set(card.key, card.id);
        },
        take(now) { prune(now); return [...byId.values()].map(it => it.card); },
        ack(id) { return drop(id); },
        markSent(id, now) { const it = byId.get(id); if (it) it.sentAt = now; },
        unackedOlderThan(ms, now) {
            prune(now);
            return [...byId.values()].filter(it => it.sentAt && now - it.sentAt > ms).map(it => it.card);
        },
        clear() { byId.clear(); idByKey.clear(); },
        size() { return byId.size; }
    };
}

module.exports = { createPresence, createPendingCards };
