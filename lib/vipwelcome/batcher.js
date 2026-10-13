'use strict';
/* VIP Welcome — gộp thẻ khi phòng đông: "A, B và 5 người khác vào phòng".
 * Chỉ gộp khi trong windowMs gần nhất đã gửi đủ maxStack thẻ VÀ người mới thuộc bậc thấp (priority < threshold).
 * Người chỉ định / bậc cao luôn có thẻ riêng. Nhóm mở groupMs rồi phát 1 thẻ gộp. */

function createBatcher({ windowMs = 3000, groupMs = 2500, maxAvatars = 3 } = {}) {
    let sent = [];        // mốc gửi thẻ (riêng + gộp) trong cửa sổ
    let group = null;     // { openedAt, flushAt, items: [] }

    function prune(now) {
        sent = sent.filter(t => now - t < windowMs);
    }

    return {
        noteSent(now) { prune(now); sent.push(now); },
        decide(now, { priority = 0, threshold = 0, maxStack = 3, enabled = true } = {}) {
            if (!enabled || priority >= threshold) return 'single';
            prune(now);
            return sent.length >= Math.max(1, maxStack) ? 'batch' : 'single';
        },
        add(member, now) {
            if (!group) group = { openedAt: now, flushAt: now + groupMs, items: [] };
            if (!group.items.some(m => m.key === member.key)) group.items.push(member);
            return { flushAt: group.flushAt };
        },
        due(now) {
            if (!group || now < group.flushAt) return null;
            const g = group;
            group = null;
            return {
                keys: g.items.map(m => m.key),
                members: g.items.slice(0, maxAvatars),
                total: g.items.length,
                topPriority: Math.max(...g.items.map(m => Number(m.priority) || 0)),
                items: g.items
            };
        },
        pendingFlushAt() { return group ? group.flushAt : 0; },
        clear() { group = null; sent = []; }
    };
}

module.exports = { createBatcher };
