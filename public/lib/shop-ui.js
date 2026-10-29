/**
 * 🛒 Logic THUẦN của cửa sổ mua game (public/shop-modal.js) — chạy cả trình duyệt (window.HpShopUI) lẫn node --test
 * (tests/shop-ui.test.js). Spec docs/superpowers/specs/2026-10-29-mua-game-sepay-design.md §6.3.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.HpShopUI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /** 50000 → "50.000đ" (không phụ thuộc Intl). */
    function vnd(n) {
        return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
    }

    /** Số tiền CÒN phải chuyển (trả thiếu thì phần thiếu). */
    function due(order, pay) {
        if (pay && Number.isFinite(Number(pay.amount))) return Math.max(0, Math.round(Number(pay.amount)));
        if (order && Number.isFinite(Number(order.due))) return Math.max(0, Math.round(Number(order.due)));
        return Math.max(0, Math.round(Number(order && order.amount) || 0) - Math.round(Number(order && order.received) || 0));
    }

    /**
     * Dòng trạng thái của đơn: { tone: wait|warn|ok|bad, text, final, done }.
     * done = đã mở khoá xong (hiện màn ✅); final = thôi chờ (không còn nút Kiểm tra).
     */
    function statusView(order, opts) {
        const o = order || {};
        const name = (opts && opts.name) || o.name || 'game';
        switch (o.status) {
            case 'partial':
                return { tone: 'warn', final: false, done: false,
                    text: 'Đã nhận ' + vnd(o.received) + ' — còn thiếu ' + vnd(due(o, opts && opts.pay)) + '. Chuyển thêm với CÙNG nội dung.' };
            case 'paid':
                return o.unlocked
                    ? { tone: 'ok', final: true, done: true, text: 'Đã mở khoá ' + name + '. Dùng trọn đời với KEY này.' }
                    : { tone: 'ok', final: false, done: false, text: 'Đã nhận tiền — đang mở khoá…' };
            case 'expired':
                return { tone: 'bad', final: true, done: false, text: 'Đơn đã hết hạn. Tạo đơn mới để mua — nếu bạn đã chuyển tiền, game vẫn được mở khi tiền tới.' };
            case 'cancelled':
                return { tone: 'bad', final: true, done: false, text: 'Đơn đã huỷ. Nếu bạn đã chuyển tiền, liên hệ HP Media để được hỗ trợ.' };
            default:
                return { tone: 'wait', final: false, done: false, text: 'Đang chờ thanh toán… Game tự mở khi nhận được tiền.' };
        }
    }

    /** Câu báo lỗi cho người dùng từ trả lời của /api/shop/* (server đã kèm message tiếng Việt khi có). */
    function errorText(r) {
        if (r && r.message) return String(r.message);
        const map = {
            shop_off: 'Chưa mở bán trong app — liên hệ HP Media để mua.',
            not_for_sale: 'Mục này hiện không bán trong app.',
            already_owned: 'KEY đã có mục này rồi — tải lại danh sách game.',
            too_many_orders: 'Bạn đang có nhiều đơn chưa thanh toán — thanh toán hoặc đợi vài phút rồi thử lại.',
            no_network: 'Không kết nối được hệ thống bán hàng — kiểm tra mạng rồi thử lại.',
            not_activated: 'Chưa kích hoạt KEY.',
        };
        return map[r && r.error] || 'Không tạo được đơn — thử lại sau.';
    }

    /**
     * Kích thước vẽ QR: rows = các hàng "0101…" (server), viền trắng 4 ô mỗi cạnh. Trả { n, cell, size } với size ≤ maxPx,
     * cell nguyên (điểm ảnh sắc nét). Hàng hỏng / rỗng → null.
     */
    function qrLayout(rows, maxPx) {
        if (!Array.isArray(rows) || !rows.length) return null;
        const n = rows.length;
        if (!rows.every((r) => typeof r === 'string' && r.length === n && /^[01]+$/.test(r))) return null;
        const cell = Math.max(1, Math.floor((maxPx || 280) / (n + 8)));
        return { n, cell, size: (n + 8) * cell };
    }

    /** Sau khi mở khoá: mở game nào (game con của 🎥 Game Camera / 🧍 Bộ Tách Người → trang Game Camera). */
    function openTarget(item) {
        if (!item) return null;
        if (item.parent === 'camgames' || item.parent === 'body') return item.parent === 'body' ? 'camgames' : item.id;
        return item.id;
    }

    return { vnd, due, statusView, errorText, qrLayout, openTarget };
});
