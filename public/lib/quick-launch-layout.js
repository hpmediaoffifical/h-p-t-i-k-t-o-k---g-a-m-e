/* Khởi động nhanh — luật thuần (không DOM) cho thứ tự thẻ game và bề rộng cửa sổ.
 *
 * Thứ tự lưu theo bố cục: { doc: [ids] | null, ngang: [ids] | null }
 *   - mảng   = thứ tự user đã kéo-thả cho bố cục đó
 *   - null   = user bấm "Khôi phục mặc định" → dùng thứ tự gốc, KHÔNG theo bố cục kia
 *   - thiếu  = chưa từng sắp riêng → theo bố cục kia (nếu có), không thì thứ tự gốc
 * Game mới (chưa có trong thứ tự đã lưu) luôn nối cuối, id lạ/trùng bị bỏ.
 *
 * Bề rộng: "tự ôm sát" — Dọc rộng đúng bằng thẻ dài nhất; Ngang gọt khít N cột. */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.HpQlLayout = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const LAYOUTS = ['doc', 'ngang'];
    const otherOf = (layout) => (layout === 'ngang' ? 'doc' : 'ngang');
    const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

    // Ghép thứ tự đã lưu với danh sách game hiện có (ids = thứ tự gốc).
    function mergeOrder(list, ids) {
        const known = new Set(ids);
        const out = [];
        const seen = new Set();
        for (const id of (Array.isArray(list) ? list : [])) {
            if (typeof id !== 'string' || !known.has(id) || seen.has(id)) continue;
            seen.add(id); out.push(id);
        }
        for (const id of ids) if (!seen.has(id)) out.push(id);
        return out;
    }

    function resolveOrder(saved, layout, ids) {
        const s = isObj(saved) ? saved : {};
        const own = s[layout];
        if (own === null) return ids.slice();
        if (Array.isArray(own)) return mergeOrder(own, ids);
        const other = s[otherOf(layout)];
        if (Array.isArray(other)) return mergeOrder(other, ids);
        return ids.slice();
    }

    function setLayoutOrder(saved, layout, order) {
        return { ...(isObj(saved) ? saved : {}), [layout]: order.slice() };
    }
    function resetLayoutOrder(saved, layout) {
        return { ...(isObj(saved) ? saved : {}), [layout]: null };
    }

    // full = thứ tự đầy đủ (kể cả game đang ẩn); visible = thứ tự mới của các thẻ đang hiện.
    // Game ẩn giữ nguyên ô của nó; các ô của game hiện lần lượt nhận thứ tự mới.
    function applyVisibleOrder(full, visible) {
        const inFull = new Set(full);
        const queue = visible.filter((id, i) => inFull.has(id) && visible.indexOf(id) === i);
        const moving = new Set(queue);
        return full.map(id => (moving.has(id) ? queue.shift() : id));
    }

    function moveId(order, id, delta) {
        const i = order.indexOf(id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= order.length) return order.slice();
        const out = order.slice();
        out.splice(i, 1);
        out.splice(j, 0, id);
        return out;
    }

    // Ngang: số cột lọt trong bề rộng hiện tại (≥1, ≤ số thẻ) → bề rộng khít đúng N cột.
    function snapColumns(width, { colW, gap, chrome, count }) {
        const fit = Math.floor((width - chrome + gap) / (colW + gap));
        const cols = Math.max(1, Math.min(fit, Math.max(1, count)));
        return { cols, width: Math.ceil(chrome + cols * colW + (cols - 1) * gap) };
    }

    // Dọc: bề rộng tự nhiên của thẻ dài nhất + lề, không hẹp hơn min (ô nhập ID còn đọc được).
    function fitWidth({ colW, chrome, min }) {
        return Math.max(min, Math.ceil((colW || 0) + chrome));
    }

    return { LAYOUTS, resolveOrder, setLayoutOrder, resetLayoutOrder, applyVisibleOrder, moveId, snapColumns, fitWidth };
});
