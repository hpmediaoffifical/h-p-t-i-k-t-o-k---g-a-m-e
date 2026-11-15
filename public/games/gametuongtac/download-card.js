/* 🎮 Thẻ game TẢI RIÊNG trong menu Game Tương Tác (gametuongtac-panel.js gọi html(t) / bind()) — Sinh Tồn, HP Đại Chiến…
 * Game không gói trong app: Tải về (cần KEY, kiểm SHA-256) → Cài đặt (bộ cài exe) / tự giải nén (gói web) → Mở game,
 * có bản mới thì Cập nhật. Máy chủ: /api/dlgames/<id>/* (lib/game-download.js), tiến độ qua socket 'dlgame:state'.
 * Link tải KHÔNG bao giờ tới giao diện — chỉ phiên bản, dung lượng, tiến độ.
 * Dòng registry: { id, name, icon, desc, play, note, download: true, obs?: link bảng quà riêng của game, obsSize?: 'rộng × cao' }
 *   Gói web (kind 'web') tự có nút "Link OBS" trỏ /dl/<id>/index.html (qua buildOverlayURL).
 */
(function () {
    'use strict';
    const states = {}, tdefs = {};
    let root = null, socketBound = false;
    const loading = new Set();
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const mb = (n) => (Number(n) / 1048576).toFixed(0) + ' MB';
    const toast = (m, k) => { if (typeof window.toast === 'function') window.toast(m, k || 'success', 3000); };
    const api = (id, a) => '/api/dlgames/' + encodeURIComponent(id) + '/' + a;

    function buttons(s) {
        const d = s.download || {}, v = s.latest ? s.latest.version : '', web = s.kind === 'web';
        if (d.status === 'downloading') {
            const pct = d.total ? Math.min(100, Math.floor(d.received * 100 / d.total)) : 0;
            return `<div class="dlg-progress"><i style="width:${pct}%"></i></div>
                <div class="dlg-row"><span>Đang tải ${pct}% · ${mb(d.received)} / ${mb(d.total)}</span><button class="ghost small" data-dl="cancel">✕ Huỷ</button></div>`;
        }
        if (d.status === 'verifying') return `<div class="dlg-row"><span>🔎 Đang kiểm tra${web ? ' + giải nén' : ''} file tải về…</span></div>`;
        if (!s.licensed || !s.allowed) return `<div class="cg-actions"><button class="ghost small" disabled>🔒 Cần KEY bản quyền để tải</button></div>`;
        const err = d.error || (!s.latest && s.error) ? `<div class="dlg-err">${esc(d.error || s.error)}</div>` : '';
        let main = '';
        if (s.action === 'open') main = `<button class="btn-outline small" data-dl="open">▶ Mở game</button>`;
        else if (s.action === 'install') main = `<button class="btn-outline small" data-dl="open">▶ Cài đặt game ${esc(s.setup ? 'v' + s.setup.version : '')}</button>`;
        else if (s.action === 'install-update') main = `<button class="btn-outline small" data-dl="open">▶ Cài bản mới v${esc(s.setup ? s.setup.version : v)}</button>`;
        else if (s.action === 'update') main = `<button class="btn-outline small" data-dl="download">⬇ Cập nhật lên v${esc(v)} (${mb(s.latest.size)})</button><button class="ghost small" data-dl="open-installed">▶ Mở bản đang có</button>`;
        else if (s.latest) main = `<button class="btn-outline small" data-dl="download">⬇ Tải về v${esc(v)} (${mb(s.latest.size)})</button>`;
        else main = `<button class="ghost small" data-dl="check">↻ Kiểm tra lại</button>`;
        return `${err}<div class="cg-actions">${main}</div>`;
    }

    function html(t) {
        if (t) tdefs[t.id] = t;
        const s = states[t.id] || { licensed: true, allowed: true, action: 'check', download: {} };
        if (!states[t.id]) load(t.id);
        const ver = s.installed ? `<span class="cg-badge">✔ ĐÃ ${s.kind === 'web' ? 'TẢI' : 'CÀI'} v${esc(s.installed.version || '?')}</span>` : '<span class="cg-badge gtt-off">⬇ TẢI RIÊNG</span>';
        const upd = s.action === 'update' || s.action === 'install-update' ? `<div class="cg-track">🆕 Có bản mới v${esc(s.latest && s.latest.version)}${s.latest && s.latest.notes ? ': ' + esc(s.latest.notes) : ''}</div>` : '';
        const obs = t.obs ? `<div class="dlg-row"><span>📋 Bảng quà OBS <small>${esc(t.obsSize || '')} · mở game rồi dán vào Browser Source</small></span><button class="ghost small" data-dl="copy-obs">Sao chép link</button></div>`
            : s.kind === 'web' && s.installed ? `<div class="dlg-row"><span>📋 Link OBS <small>Browser Source${t.obsSize ? ' ' + esc(t.obsSize) : ''} · dùng link HOẶC cửa sổ game</small></span><button class="ghost small" data-dl="copy-obs">Sao chép link</button></div>` : '';
        return `<div class="cg-game ${s.installed ? 'on' : ''}" data-id="${esc(t.id)}" data-dlgame="1">
            <div class="cg-game-head"><span class="cg-ico">${t.icon}</span><b>${esc(t.name)}</b>${ver}</div>
            <div class="cg-desc">${esc(t.desc)}</div>
            ${t.play ? `<div class="cg-track">👥 ${esc(t.play)}</div>` : ''}
            ${t.note ? `<div class="cg-track">💡 ${esc(t.note)}</div>` : ''}
            ${upd}
            ${s.latest && !s.installed ? `<div class="cg-track">💾 Game tải riêng (${mb(s.latest.size)}), không làm nặng bản cập nhật HP Action LIVE.</div>` : ''}
            ${obs}
            ${buttons(s)}
        </div>`;
    }

    function obsLink(id) {
        const t = tdefs[id];
        if (t && t.obs) return t.obs;   // máy chủ riêng của game (localhost:<cổng>) — OBS mở được localhost
        const p = '/dl/' + id + '/index.html';
        return window.buildOverlayURL ? window.buildOverlayURL(p) : p;
    }
    function redraw(id) {
        const el = root && root.querySelector(`[data-dlgame][data-id="${CSS.escape(id)}"]`);
        if (!el || !tdefs[id]) return;
        el.outerHTML = html(tdefs[id]);
        wire(id);
    }
    async function load(id) {
        if (loading.has(id)) return;
        loading.add(id);
        try { const r = await fetch(api(id, 'state'), { cache: 'no-store' }); if (r.ok) { states[id] = await r.json(); redraw(id); } } catch (e) {} finally { loading.delete(id); }
    }
    async function post(id, a) {
        try {
            const r = await fetch(api(id, a), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            const j = await r.json().catch(() => ({}));
            if (j.state) { states[id] = j.state; redraw(id); }
            if (!j.ok) toast(j.error || 'Không thực hiện được', 'error');
            else if (a === 'open' || a === 'open-installed') {
                const name = (tdefs[id] && tdefs[id].name) || 'game';
                toast(j.result === 'installer' ? `Đang mở bộ cài ${name} — làm theo hướng dẫn trên màn hình` : `Đang mở ${name}`);
            }
        } catch (e) { toast('Không kết nối được HP Action LIVE', 'error'); }
    }
    function wire(id) {
        const el = root && root.querySelector(`[data-dlgame][data-id="${CSS.escape(id)}"]`);
        if (!el) return;
        el.querySelectorAll('[data-dl]').forEach((b) => b.addEventListener('click', async () => {
            const a = b.dataset.dl;
            if (a === 'copy-obs') {
                const url = obsLink(id);
                try { await navigator.clipboard.writeText(url); toast('Đã copy link OBS'); } catch (e) { prompt('Link OBS:', url); }
                return;
            }
            b.disabled = true;
            await post(id, a);
            b.disabled = false;
        }));
    }
    function bind(r, socket) {
        root = r;
        if (socket && !socketBound) {
            socketBound = true;
            socket.on('dlgame:state', (s) => { if (s && s.id) { states[s.id] = s; redraw(s.id); } });
        }
        for (const id of Object.keys(tdefs)) { wire(id); load(id); }
    }
    window.HpDownloadCard = { html, bind };
})();
