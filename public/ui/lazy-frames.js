// ⚡ App nhẹ hơn: iframe chỉ dùng để XEM/CÀI ĐẶT (không phải bộ đếm chạy nền) khai báo `data-lazy-src`
// thay cho `src` → chỉ nạp khi màn chứa nó mở lần đầu (view có class active). Trước đây mọi iframe nạp ngay
// lúc mở app: mỗi cái 1 kết nối socket + hình động chạy ngầm dù người dùng chưa từng mở màn đó.
// KHÔNG dùng cho #lq-frame / #timer-frame (chính là bộ đếm KPI / đồng hồ, phải chạy từ đầu).
(function (root) {
    const doc = root.document;
    function wake(view) {
        for (const f of view.querySelectorAll('iframe[data-lazy-src]')) {
            f.src = f.dataset.lazySrc;
            f.removeAttribute('data-lazy-src');
        }
    }
    function init() {
        const views = doc.querySelectorAll('.view');
        const mo = new MutationObserver((list) => {
            for (const m of list) if (m.target.classList.contains('active')) wake(m.target);
        });
        for (const v of views) {
            if (!v.querySelector('iframe[data-lazy-src]')) continue;
            if (v.classList.contains('active')) wake(v);
            else mo.observe(v, { attributes: true, attributeFilter: ['class'] });
        }
    }
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(window);
