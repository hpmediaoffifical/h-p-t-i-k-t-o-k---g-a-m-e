// 🎨 Giao diện mới — phần đầu mọi game cùng một thứ tự nút:
//   ← Quay lại · Bật/Bắt đầu · (trạng thái) · Link OBS · Chạy thử · Làm mới · [Thêm ▾] · Lưu
// Nút phụ riêng từng game (HD 1080, HŨ MỚI, Reset trại…) gom vào menu "Thêm ▾" khi có từ 2 nút.
// Chỉ DỜI nút (giữ nguyên phần tử, id, sự kiện) — không tạo lại, không đổi logic game.
(function (root) {
    const ORDER = { back: 0, power: 1, status: 2, obs: 3, test: 4, reload: 5, extra: 6, more: 7, save: 8 };
    function classify({ text = '', cls = '', tag = '' }) {
        const t = String(text).trim().toLowerCase();
        const c = String(cls).toLowerCase();
        if (t.startsWith('←')) return 'back';
        if (/\bhp-power\b/.test(c) || /bắt đầu|dừng phiên|kết thúc phiên|^bật|^tắt|đã tắt|đang bật|^⏻/.test(t)) return 'power';
        if (/\bobs-link\b/.test(c) || /link obs|link riêng|copy link/.test(t)) return 'obs';
        if (/lưu/.test(t)) return 'save';
        // Xoá / đặt lại dữ liệu (Làm mới trại, Reset vườn, HŨ MỚI…) → menu Thêm, không đứng cạnh nút Làm mới giao diện
        if (/\bdanger\b/.test(c) || /reset|làm mới trại|xoá|xóa|mới$/.test(t)) return 'extra';
        if (/reload|làm mới|tải lại/.test(t)) return 'reload';
        if (/\btest\b|chạy thử|^▶ thử|demo|xem overlay|mở overlay|xem thử/.test(t)) return 'test';
        if (tag === 'SPAN' || tag === 'DIV') return 'status';
        return 'extra';
    }

    function info(el) {
        return { text: el.textContent || el.getAttribute('title') || '', cls: el.className && el.className.baseVal === undefined ? el.className : '', tag: el.tagName };
    }

    function arrange(bar) {
        if (!bar || bar.dataset.hbBusy) return;
        bar.dataset.hbBusy = '1';
        try {
            let more = bar.querySelector(':scope > .hb-more');
            const kids = [...bar.children].filter(el => el !== more);
            const extras = [];
            for (const el of kids) {
                const k = el.dataset.hbKind || classify(info(el));
                el.dataset.hbKind = k;
                el.style.order = String(ORDER[k]);
                if (k === 'extra') extras.push(el);
            }
            const inMenu = more ? [...more.querySelector('.hb-menu').children] : [];
            if (extras.length + inMenu.length < 2) return;
            if (!more) {
                more = document.createElement('div');
                more.className = 'hb-more';
                more.style.order = String(ORDER.more);
                more.innerHTML = '<button type="button" class="ghost small hb-more-btn" aria-haspopup="true">Thêm ▾</button><div class="hb-menu" hidden></div>';
                bar.appendChild(more);
                const b = more.querySelector('.hb-more-btn'), m = more.querySelector('.hb-menu');
                b.addEventListener('click', (e) => { e.stopPropagation(); m.hidden = !m.hidden; });
                document.addEventListener('click', (e) => { if (!more.contains(e.target)) m.hidden = true; });
                // Bấm 1 nút trong menu thì đóng menu (trừ ô chọn / ô nhập cần thao tác tiếp)
                m.addEventListener('click', (e) => { if (e.target.closest('button')) m.hidden = true; });
            }
            const menu = more.querySelector('.hb-menu');
            for (const el of extras) { el.style.order = ''; menu.appendChild(el); }
        } finally {
            delete bar.dataset.hbBusy;
        }
    }

    function run(doc) { doc.querySelectorAll('.game-header .overlay-bar').forEach(arrange); }

    const api = { classify, ORDER, arrange, run };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
    root.HpHeaderBar = api;
    const doc = root.document;
    if (!doc || !doc.body || !doc.body.classList.contains('ui-v2')) return;
    let queued = false;
    const later = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; run(doc); }, 60); };
    const start = () => {
        run(doc);
        if (root.MutationObserver) new MutationObserver((list) => {
            // Panel game chèn/đổi nút trong phần đầu → xếp lại (bỏ qua thay đổi do chính mình)
            if (list.some(m => m.target.closest && m.target.closest('.game-header') && !m.target.closest('.hb-menu'))) later();
        }).observe(doc.querySelector('.main') || doc.body, { childList: true, subtree: true });
    };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})(typeof window !== 'undefined' ? window : globalThis);
