'use strict';
/* VIP Welcome — hàng đợi video/âm thanh. Thẻ vào phòng hiện song song; media thì phát lần lượt:
 * ưu tiên cao trước (luật @id > bậc cao), cùng ưu tiên thì ai đến trước; 1 mục/người (vào lại thì thay);
 * mục chờ quá lâu bị bỏ lúc lấy ra — thẻ của người đó đã hiện rồi nên không ai bị sót. */

function createMediaQueue() {
    let items = [];   // { key, priority, ts, payload }

    function sort() {
        items.sort((a, b) => (b.priority - a.priority) || (a.ts - b.ts));
    }

    return {
        push(item) {
            if (item.key) items = items.filter(x => x.key !== item.key);
            items.push({ ...item, priority: Number(item.priority) || 0, ts: Number(item.ts) || 0 });
            sort();
        },
        next(now, maxWaitMs) {
            const expired = [];
            while (items.length) {
                const it = items.shift();
                if (maxWaitMs > 0 && now - it.ts > maxWaitMs) { expired.push(it); continue; }
                return { item: it, expired };
            }
            return { item: null, expired };
        },
        // Hàng quá dài → bỏ mục ưu tiên thấp nhất (cuối hàng). Trả các mục bị bỏ.
        trim(maxLen) {
            const dropped = [];
            while (items.length > Math.max(0, maxLen)) dropped.push(items.pop());
            return dropped;
        },
        size() { return items.length; },
        clear() { items = []; },
        list() { return items.slice(); }
    };
}

module.exports = { createMediaQueue };
