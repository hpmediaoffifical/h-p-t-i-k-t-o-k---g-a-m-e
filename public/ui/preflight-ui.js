// ✅ Kiểm tra trước khi LIVE — nút ở Bảng điều khiển, mở khung danh sách xanh/vàng/đỏ (GET /api/preflight,
// luật thuần lib/preflight.js). Mỗi dòng có nút sửa nhanh: nhập/kết nối TikTok, kết nối OBS, ➕ thêm overlay vào OBS…
(function (root) {
    const doc = root.document;
    const btn = doc.getElementById('btn-preflight');
    if (!btn) return;
    const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const DOT = { ok: '✅', warn: '⚠️', bad: '⛔' };
    const HEAD = { ok: 'Sẵn sàng lên sóng', warn: 'Có vài điểm nên kiểm tra', bad: 'Cần sửa trước khi LIVE' };
    let box = null;

    function close() { if (box) { box.remove(); box = null; } }

    async function runFix(fix, b) {
        switch (fix.action) {
            case 'focusTiktok': { close(); const i = doc.getElementById('username'); if (i) { i.focus(); i.select && i.select(); } return; }
            case 'connectTiktok': { doc.getElementById('btn-connect')?.click(); setTimeout(refresh, 2500); return; }
            case 'openObsSettings':
            case 'openLicense': { close(); doc.getElementById('btn-open-settings')?.click(); return; }
            case 'openGame': { close(); root.hpOpenGame && root.hpOpenGame(fix.gameId); return; }
            case 'addToObs': {
                b.disabled = true; b.textContent = 'Đang thêm…';
                try {
                    const r = await fetch('/api/obs/add-overlay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId: fix.gameId }) });
                    const j = await r.json();
                    if (!j.ok) throw new Error(j.error || 'Không thêm được');
                    b.textContent = 'Đã thêm ✓';
                    setTimeout(refresh, 2500);   // chờ overlay nạp + gửi overlay:hello
                } catch (e) { b.disabled = false; b.textContent = fix.label; b.title = e.message; if (typeof root.toast === 'function') root.toast(e.message, 'error', 3500); }
                return;
            }
        }
    }

    function render(r) {
        if (!box) return;
        const body = box.querySelector('.pf-body');
        body.textContent = '';
        box.dataset.level = r.summary;
        box.querySelector('.pf-title').textContent = DOT[r.summary] + ' ' + HEAD[r.summary];
        for (const it of r.items) {
            const row = el('div', 'pf-row pf-' + it.level);
            const txt = el('div', 'pf-txt');
            txt.append(el('b', '', DOT[it.level] + ' ' + it.title));
            if (it.detail) txt.append(el('span', 'pf-detail', it.detail));
            row.append(txt);
            if (it.fix) {
                const fb = el('button', 'pf-fix', it.fix.label);
                fb.type = 'button';
                fb.addEventListener('click', () => runFix(it.fix, fb));
                row.append(fb);
            }
            body.append(row);
        }
        btn.dataset.level = r.summary;
    }

    async function refresh() {
        try { render(await (await fetch('/api/preflight', { cache: 'no-store' })).json()); } catch (_) {}
    }

    function open() {
        if (box) return close();
        box = el('div', 'pf-box');
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-label', 'Kiểm tra trước khi LIVE');
        const head = el('div', 'pf-head');
        const again = el('button', 'pf-again', '↻ Kiểm tra lại');
        again.type = 'button';
        again.addEventListener('click', refresh);
        const x = el('button', 'pf-x', '×');
        x.type = 'button'; x.setAttribute('aria-label', 'Đóng');
        x.addEventListener('click', close);
        head.append(el('b', 'pf-title', 'Đang kiểm tra…'), again, x);
        box.append(head, el('div', 'pf-body'));
        doc.body.appendChild(box);
        refresh();
    }
    btn.addEventListener('click', open);
    doc.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
})(window);
