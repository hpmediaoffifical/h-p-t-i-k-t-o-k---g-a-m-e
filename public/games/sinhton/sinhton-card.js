/* 🔫 Sinh Tồn — thẻ trong menu 🎮 Game Tương Tác (gametuongtac-panel.js gọi html() / bind()).
 * Game chạy RIÊNG bằng bộ cài Windows, app không gói game: Tải về (cần KEY, kiểm SHA-256) → Cài đặt → Mở game,
 * có bản mới thì Cập nhật. Máy chủ: /api/sinhton/* (lib/sinhton-download.js), tiến độ qua socket 'sinhton:state'.
 * Link tải KHÔNG bao giờ tới giao diện — chỉ phiên bản, dung lượng, tiến độ.
 */
(function () {
    'use strict';
    const OBS_GIFTS = 'http://localhost:8765/overlay-qua.html';   // máy chủ riêng của game (không phải app) — OBS mở được localhost
    let st = null, root = null, t0 = null, socketBound = false, loading = false;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const mb = (n) => (Number(n) / 1048576).toFixed(0) + ' MB';
    const toast = (m, k) => { if (typeof window.toast === 'function') window.toast(m, k || 'success', 3000); };

    function buttons(s) {
        const d = s.download || {}, v = s.latest ? s.latest.version : '';
        if (d.status === 'downloading') {
            const pct = d.total ? Math.min(100, Math.floor(d.received * 100 / d.total)) : 0;
            return `<div class="sinhton-progress"><i style="width:${pct}%"></i></div>
                <div class="sinhton-row"><span>Đang tải ${pct}% · ${mb(d.received)} / ${mb(d.total)}</span><button class="ghost small" data-st="cancel">✕ Huỷ</button></div>`;
        }
        if (d.status === 'verifying') return '<div class="sinhton-row"><span>🔎 Đang kiểm tra file tải về…</span></div>';
        if (!s.licensed || !s.allowed) return `<div class="cg-actions"><button class="ghost small" disabled>🔒 Cần KEY bản quyền để tải</button></div>`;
        const err = d.error || (!s.latest && s.error) ? `<div class="sinhton-err">${esc(d.error || s.error)}</div>` : '';
        let main = '';
        if (s.action === 'open') main = `<button class="btn-outline small" data-st="open">▶ Mở game</button>`;
        else if (s.action === 'install') main = `<button class="btn-outline small" data-st="open">▶ Cài đặt game ${esc(s.setup ? 'v' + s.setup.version : '')}</button>`;
        else if (s.action === 'install-update') main = `<button class="btn-outline small" data-st="open">▶ Cài bản mới v${esc(s.setup ? s.setup.version : v)}</button>`;
        else if (s.action === 'update') main = `<button class="btn-outline small" data-st="download">⬇ Cập nhật lên v${esc(v)} (${mb(s.latest.size)})</button><button class="ghost small" data-st="open-old">▶ Mở bản đang có</button>`;
        else if (s.latest) main = `<button class="btn-outline small" data-st="download">⬇ Tải về v${esc(v)} (${mb(s.latest.size)})</button>`;
        else main = `<button class="ghost small" data-st="check">↻ Kiểm tra lại</button>`;
        return `${err}<div class="cg-actions">${main}</div>`;
    }

    function html(t) {
        if (t) t0 = t;
        t = t0;
        if (!t) return '';
        const s = st || { licensed: true, allowed: true, action: 'check', download: {} };
        if (!st) load();
        const ver = s.installed ? `<span class="cg-badge">✔ ĐÃ CÀI v${esc(s.installed.version || '?')}</span>` : '<span class="cg-badge gtt-off">⬇ TẢI RIÊNG</span>';
        const upd = s.action === 'update' || s.action === 'install-update' ? `<div class="cg-track">🆕 Có bản mới v${esc(s.latest && s.latest.version)}${s.latest && s.latest.notes ? ': ' + esc(s.latest.notes) : ''}</div>` : '';
        return `<div class="cg-game ${s.installed ? 'on' : ''}" data-id="${esc(t.id)}">
            <div class="cg-game-head"><span class="cg-ico">${t.icon}</span><b>${esc(t.name)}</b>${ver}</div>
            <div class="cg-desc">${esc(t.desc)}</div>
            ${t.play ? `<div class="cg-track">👥 ${esc(t.play)}</div>` : ''}
            ${t.note ? `<div class="cg-track">💡 ${esc(t.note)}</div>` : ''}
            ${upd}
            ${s.latest && !s.installed ? `<div class="cg-track">💾 Game cài riêng (${mb(s.latest.size)}), không làm nặng bản cập nhật HP Action LIVE.</div>` : ''}
            <div class="sinhton-row"><span>📋 Bảng quà OBS <small>1080 × 600 · mở game rồi dán vào Browser Source</small></span><button class="ghost small" data-st="copy">Sao chép link</button></div>
            ${buttons(s)}
        </div>`;
    }

    function redraw() {
        const el = root && root.querySelector('[data-id="sinhton"]');
        if (!el) return;
        el.outerHTML = html();
        wire();
    }
    async function load() {
        if (loading) return;
        loading = true;
        try { const r = await fetch('/api/sinhton/state', { cache: 'no-store' }); if (r.ok) { st = await r.json(); redraw(); } } catch (e) {} finally { loading = false; }
    }
    async function post(name) {
        try {
            const r = await fetch('/api/sinhton/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            const j = await r.json().catch(() => ({}));
            if (j.state) { st = j.state; redraw(); }
            if (!j.ok) toast(j.error || 'Không thực hiện được', 'error');
            else if (name === 'open') toast(j.result === 'installer' ? 'Đang mở bộ cài Sinh Tồn — làm theo hướng dẫn trên màn hình' : 'Đang mở Sinh Tồn');
            return j;
        } catch (e) { toast('Không kết nối được HP Action LIVE', 'error'); return {}; }
    }
    function wire() {
        const el = root && root.querySelector('[data-id="sinhton"]');
        if (!el) return;
        el.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', async () => {
            const a = b.dataset.st;
            if (a === 'copy') {
                try { await navigator.clipboard.writeText(OBS_GIFTS); toast('Đã copy link bảng quà OBS (1080 × 600)'); } catch (e) { prompt('Link bảng quà OBS:', OBS_GIFTS); }
                return;
            }
            b.disabled = true;
            if (a === 'open-old') {   // có bản mới nhưng vẫn mở bản đang cài
                const r = await fetch('/api/sinhton/open-installed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((x) => x.json()).catch(() => ({}));
                toast(r.ok ? 'Đang mở Sinh Tồn' : (r.error || 'Không mở được'), r.ok ? 'success' : 'error');
                b.disabled = false;
                return;
            }
            await post(a);
        }));
    }
    function bind(r, socket) {
        root = r;
        if (socket && !socketBound) {
            socketBound = true;
            socket.on('sinhton:state', (s) => { st = s; redraw(); });
        }
        wire();
        load();
    }
    window.HpSinhTonCard = { html, bind };
})();
