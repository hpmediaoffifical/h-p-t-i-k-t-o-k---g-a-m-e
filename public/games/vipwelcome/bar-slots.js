/* HP VIP Welcome — xếp TẦNG cho thanh chào gọn (logic thuần, test: tests/vipwelcome-bar-slots.test.js).
 *
 * slots[0] = tầng DƯỚI CÙNG, đóng đinh sát bình luận. Luật:
 *  - Người mới luôn vào tầng 0; dãy thanh LIỀN KỀ phía trên được đẩy lên 1 tầng tới ô trống đầu tiên.
 *  - Đủ tầng: bỏ thanh ƯU TIÊN THẤP NHẤT (hoà → thanh ở tầng cao nhất = cũ nhất), các thanh dưới nó đẩy lên.
 *    Người mới ưu tiên thấp hơn MỌI thanh đang hiện → không đẩy ai, vào HÀNG CHỜ (chờ có tầng trống).
 *  - Thanh hết giờ: chỉ để trống ô của nó, KHÔNG ai dịch (không nhảy lên xuống, không lấn bình luận).
 *  - Hàng chờ: ưu tiên cao trước, cùng ưu tiên thì đến trước; quá maxWaitMs thì bỏ.
 * Item: { id, priority }. Hàm trả về mô tả thay đổi để overlay áp vào DOM. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.HpBarSlots = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    function createBarSlots(opts) {
        const n = Math.max(1, Math.min(6, Number(opts && opts.slots) || 3));
        const maxWait = Math.max(0, Number(opts && opts.maxWaitMs) || 8000);
        const maxQueue = Math.max(0, Number(opts && opts.maxQueue) || 6);
        const slots = new Array(n).fill(null);
        let waiting = [];   // [{ item, at }]

        // Đặt item vào tầng 0. Trả { shown, moves: [{item, slot}], retired: item|null }
        function insertAtBottom(item, k) {
            const moves = [];
            for (let j = k; j > 0; j--) {
                slots[j] = slots[j - 1];
                if (slots[j]) moves.push({ item: slots[j], slot: j });
            }
            slots[0] = item;
            return moves;
        }

        function place(item, now) {
            let k = slots.indexOf(null);
            if (k === -1) {
                // đầy → tìm thanh ưu tiên thấp nhất; hoà lấy thanh ở tầng cao nhất (cũ nhất)
                let r = 0;
                for (let j = 1; j < n; j++) if ((slots[j].priority || 0) <= (slots[r].priority || 0)) r = j;
                if ((item.priority || 0) < (slots[r].priority || 0)) {
                    enqueue(item, now);
                    return { shown: false, queued: true, moves: [], retired: null };
                }
                const retired = slots[r];
                slots[r] = null;
                return { shown: true, queued: false, moves: insertAtBottom(item, r), retired };
            }
            return { shown: true, queued: false, moves: insertAtBottom(item, k), retired: null };
        }

        function enqueue(item, now) {
            waiting.push({ item, at: now || 0 });
            waiting.sort((a, b) => (b.item.priority || 0) - (a.item.priority || 0) || a.at - b.at);
            while (waiting.length > maxQueue) waiting.pop();   // bỏ người ưu tiên thấp nhất / đến sau
        }

        // Thanh hết giờ → trống ô, không dịch. Trả item chờ (nếu có) để overlay hiện ngay.
        function remove(item, now) {
            const k = slots.indexOf(item);
            if (k >= 0) slots[k] = null;
            return takeWaiting(now);
        }

        function takeWaiting(now) {
            waiting = waiting.filter(w => !now || now - w.at <= maxWait);
            if (!waiting.length || slots.indexOf(null) === -1) return null;
            return waiting.shift().item;
        }

        function clear() { slots.fill(null); waiting = []; }
        function snapshot() { return { slots: slots.slice(), waiting: waiting.map(w => w.item) }; }
        function slotOf(item) { return slots.indexOf(item); }

        return { place, remove, takeWaiting, clear, snapshot, slotOf, size: n };
    }

    // Thời gian giữ thanh theo bậc (rank 0..5 = Tân binh..Đế vương). baseMs = "Hiện mỗi thẻ".
    // Bậc có sao băng cần thêm ~1s vì thanh chỉ giãn đủ ở ~2.4s.
    const HOLD_MULT = [0.75, 1, 1.15, 1.3, 1.5, 1.75];   // … Chí tôn, Đế vương
    function holdMs(rank, baseMs, early) {
        const r = Math.max(0, Math.min(HOLD_MULT.length - 1, Number(rank) || 0));
        const base = Math.max(1500, Number(baseMs) || 5000);
        return Math.round(base * HOLD_MULT[r] + (early ? 0 : 1000));
    }

    // Điểm nhấn thay chữ "VÀO PHÒNG" — chỉ 1 cái, theo độ hiếm.
    function accentOf(card) {
        if (!card) return '';
        if (card.late) return '';
        const v = card.visit, r = card.roles || {};
        if (v && v.isFirst) return '🎉 LẦN ĐẦU GHÉ';
        if (v && v.streak >= 3) return '🔥 ' + v.streak + ' BUỔI LIỀN';
        if (r.top > 0) return '👑 TOP ' + r.top;
        if (r.mod) return '🛡 MOD';
        return '';
    }

    return { createBarSlots, holdMs, accentOf, HOLD_MULT };
});
