// 🆕 "Có gì mới" — sau khi cập nhật lên phiên bản mới, hiện 1 khung gọn liệt kê điểm mới.
// Nội dung: public/whats-new.json  { "<version>": { "title": "...", "items": ["...", ...] } }
// → mỗi lần release CHỈ sửa file đó. Mở lại bất cứ lúc nào: bấm số phiên bản ở chân app.
// Phần thuần (cmp/pick) chạy cả node test: tests/whats-new.test.js
(function (root) {
    const SEEN_KEY = 'hp.whatsNew.seen';
    const MAX_VERSIONS = 3;

    function cmp(a, b) {
        const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0);
        const pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const d = (pa[i] || 0) - (pb[i] || 0);
            if (d) return d < 0 ? -1 : 1;
        }
        return 0;
    }

    // Các bản (mới nhất trước) có ghi chú, nằm trong (lastSeen, current]. lastSeen rỗng = máy mới cài → không hiện.
    function pick(data, current, lastSeen, opts = {}) {
        if (!data || typeof data !== 'object' || !current) return [];
        if (!lastSeen && !opts.all) return [];
        return Object.keys(data)
            .filter(v => cmp(v, current) <= 0 && (opts.all || cmp(v, lastSeen) > 0))
            .filter(v => data[v] && Array.isArray(data[v].items) && data[v].items.length)
            .sort((a, b) => cmp(b, a))
            .slice(0, MAX_VERSIONS)
            .map(v => ({ version: v, title: String(data[v].title || ''), items: data[v].items.map(String) }));
    }

    const api = { cmp, pick, SEEN_KEY };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
    root.HpWhatsNew = api;

    // ===== Trình duyệt =====
    const doc = root.document;
    const store = {
        get() { try { return root.localStorage.getItem(SEEN_KEY) || ''; } catch { return ''; } },
        set(v) { try { root.localStorage.setItem(SEEN_KEY, v); } catch { /* bỏ qua */ } }
    };
    let cache = null;
    async function load() {
        if (cache) return cache;
        const [ver, data] = await Promise.all([
            fetch('/api/version').then(r => r.json()).catch(() => null),
            fetch('/whats-new.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null)
        ]);
        cache = { current: ver && ver.version, data };
        return cache;
    }

    function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

    function show(entries, current) {
        if (!entries.length) return;
        const old = doc.getElementById('whats-new'); if (old) old.remove();
        const box = doc.createElement('div');
        box.id = 'whats-new';
        box.className = 'wn-box';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-label', 'Có gì mới');
        box.innerHTML = `<div class="wn-head"><b>🆕 Có gì mới</b><span class="wn-ver">v${esc(current)}</span>
            <button type="button" class="wn-x" aria-label="Đóng">×</button></div>
            <div class="wn-body">${entries.map(e => `<section>
                ${entries.length > 1 || e.title ? `<h4>${esc(e.title || 'Bản ' + e.version)}${entries.length > 1 ? ` <small>v${esc(e.version)}</small>` : ''}</h4>` : ''}
                <ul>${e.items.map(it => `<li>${esc(it)}</li>`).join('')}</ul></section>`).join('')}</div>`;
        const close = () => { box.remove(); store.set(current); doc.removeEventListener('keydown', onKey); };
        const onKey = (ev) => { if (ev.key === 'Escape') close(); };
        box.querySelector('.wn-x').addEventListener('click', close);
        doc.addEventListener('keydown', onKey);
        doc.body.appendChild(box);
    }

    async function check() {
        const { current, data } = await load();
        if (!current) return;
        const seen = store.get();
        if (!seen) { store.set(current); return; }          // máy mới cài: chỉ ghi nhận
        if (cmp(seen, current) >= 0) return;
        const list = pick(data, current, seen);
        if (list.length) show(list, current); else store.set(current);
    }

    async function open() {
        const { current, data } = await load();
        if (current) show(pick(data, current, '', { all: true }), current);
    }
    api.open = open;

    function wire() {
        const v = doc.getElementById('sb-version');
        if (v) { v.classList.add('wn-link'); v.title = 'Xem có gì mới'; v.addEventListener('click', open); }
        setTimeout(() => { check().catch(() => {}); }, 1500);   // để app vẽ xong trước
    }
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', wire); else wire();
})(typeof window !== 'undefined' ? window : globalThis);
