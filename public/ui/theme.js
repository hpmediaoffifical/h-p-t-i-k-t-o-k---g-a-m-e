// 🌙 Giao diện Sáng / Tối cho app (chỉ trang có body.ui-v2; overlay OBS không đổi).
// Nạp NGAY sau thẻ <body> (đồng bộ) → áp lớp trước khi vẽ, không nháy trắng.
// Lưu localStorage 'hp.theme' = 'light' | 'dark' | 'system'. Trang chủ nhúng Khởi động nhanh (cùng origin)
// nghe sự kiện 'storage' nên đổi ở app là khung nhúng đổi theo ngay.
(function (root) {
    const KEY = 'hp.theme';
    const mq = root.matchMedia ? root.matchMedia('(prefers-color-scheme: dark)') : null;
    function get() {
        try { const v = root.localStorage.getItem(KEY); return v === 'dark' || v === 'system' ? v : 'light'; } catch (_) { return 'light'; }
    }
    function resolved(pref) { return pref === 'system' ? (mq && mq.matches ? 'dark' : 'light') : pref; }
    function apply(body) {
        const b = body || root.document.body;
        if (!b || !b.classList.contains('ui-v2')) return;
        const dark = resolved(get()) === 'dark';
        b.classList.toggle('theme-dark', dark);
        root.document.documentElement.classList.toggle('theme-dark', dark);   // Khởi động nhanh nhúng đè biến ở html.embed.ui-v2
        const btn = root.document.getElementById('btn-theme');
        if (btn) btn.title = dark ? 'Giao diện Tối — bấm để chuyển Sáng' : 'Giao diện Sáng — bấm để chuyển Tối';
    }
    function set(pref) {
        try { root.localStorage.setItem(KEY, pref); } catch (_) {}
        apply();
    }
    function toggle() { set(resolved(get()) === 'dark' ? 'light' : 'dark'); }
    root.HpTheme = { get, set, toggle, apply };
    apply();
    if (mq && mq.addEventListener) mq.addEventListener('change', () => apply());
    root.addEventListener('storage', (e) => { if (e.key === KEY) apply(); });
    root.document.addEventListener('DOMContentLoaded', () => {
        apply();
        const btn = root.document.getElementById('btn-theme');
        if (btn) btn.addEventListener('click', toggle);
    });
})(window);
