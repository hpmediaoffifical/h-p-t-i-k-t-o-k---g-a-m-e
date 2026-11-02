/* 🎮 Game Tương Tác — menu nhóm trong app (view-gametuongtac). Danh sách game: registry.js (window.HpTuongTacGames).
 * Chỉ đọc/ghi qua app.js: window.hpGameList() (games[] đã có khoá KEY), window.hpSetGameEnabled(id, on), window.hpOpenGame(id).
 * Không sửa view/panel của game con: nút "← Game Tương Tác" được chèn vào header view-<id> lúc nạp trang.
 */
(function () {
    'use strict';
    const $ = (s) => document.querySelector(s);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const HUB_ID = 'gametuongtac';
    const children = () => window.HpTuongTacGames || [];
    const appGame = (id) => (window.hpGameList?.() || []).find(g => g.id === id);
    let bound = false;

    function viewActive() { return !!$('#view-' + HUB_ID)?.classList.contains('active'); }
    function isOn(g) { const c = g.config || {}; return !g.locked && (!('enabled' in c) || c.enabled !== false); }

    function card(t) {
        const g = appGame(t.id);
        if (g && g.lstate === 'hidden') return '';   // HP KEY: mục Ẩn (chưa ra mắt) không hiện
        const head = (badge) => `<div class="cg-game-head"><span class="cg-ico">${t.icon}</span><b>${esc(t.name)}</b>${badge || ''}</div>
            <div class="cg-desc">${esc(t.desc)}</div>
            ${t.play ? `<div class="cg-track">👥 ${esc(t.play)}</div>` : ''}
            ${t.note ? `<div class="cg-track">💡 ${esc(t.note)}</div>` : ''}`;
        if (t.soon || !g) {
            return `<div class="cg-game gtt-soon" data-id="${esc(t.id)}">${head('<span class="cg-badge">🛠 SẮP RA MẮT</span>')}</div>`;
        }
        if (g.locked || g.lstate === 'off') {
            const paused = g.lstate === 'off';
            return `<div class="cg-game gtt-locked" data-id="${esc(t.id)}">${head(paused
                ? '<span class="cg-badge" title="HP Media sẽ mở lại sớm">⏸ TẠM BẢO TRÌ</span>'
                : '<span class="cg-badge" title="Liên hệ HP Media để mở thêm tính năng này cho KEY">🔒 KEY CHƯA MỞ</span>')}
                <div class="cg-actions"><button class="ghost small" data-settings="${esc(t.id)}">⚙ Cài đặt</button></div></div>`;
        }
        const on = isOn(g);
        return `<div class="cg-game ${on ? 'on' : ''}" data-id="${esc(t.id)}">${head(
            (g.lstate === 'admin' ? '<span class="cg-badge" title="Thử nghiệm — mới mở cho một số KEY dùng thử">🧪 THỬ NGHIỆM</span>' : '') +
            (on ? '<span class="cg-badge">● ĐANG BẬT</span>' : '<span class="cg-badge gtt-off">⏻ ĐANG TẮT</span>'))}
            <div class="cg-actions">
                <button class="btn-outline small" data-settings="${esc(t.id)}">⚙ Cài đặt</button>
                <button class="ghost small" data-power="${esc(t.id)}" title="${on ? 'Tắt: game không nhận quà / bình luận, overlay OBS ẩn' : 'Bật: game nhận quà / bình luận trên OBS'}">${on ? '⏻ Tắt' : '⏻ Bật'}</button>
            </div></div>`;
    }

    function render() {
        const root = $('#gtt-root');
        if (!root) return;
        root.innerHTML = `<div class="cg-grid" id="gtt-grid">${children().map(card).join('')}</div>`;
        root.querySelectorAll('[data-settings]').forEach(b => b.addEventListener('click', () => window.hpOpenGame?.(b.dataset.settings)));
        root.querySelectorAll('[data-power]').forEach(b => b.addEventListener('click', async () => {
            const g = appGame(b.dataset.power);
            if (!g) return;
            b.disabled = true;
            try { await window.hpSetGameEnabled?.(g.id, !isOn(g)); } finally { render(); }
        }));
    }

    // Header game con: nút quay về menu nhóm (như "← Game Camera" của game camera).
    function injectBackButtons() {
        for (const t of children()) {
            if (t.soon) continue;
            const bar = document.querySelector(`#view-${t.id} .game-header .overlay-bar`);
            if (!bar || bar.querySelector('.gtt-back')) continue;
            const b = document.createElement('button');
            b.className = 'ghost small gtt-back';
            b.title = 'Về menu Game Tương Tác';
            b.textContent = '← Game Tương Tác';
            b.addEventListener('click', () => window.hpOpenGame?.(HUB_ID));
            bar.prepend(b);
        }
    }

    function open(socket) {
        if (!bound && socket) {
            bound = true;
            // enabled đổi từ ⏻ / Khởi động nhanh / máy khác → vẽ lại nếu đang mở menu (app.js đã cập nhật games[] trước).
            socket.on('gameConfig', ({ gameId }) => {
                if (viewActive() && children().some(t => t.id === gameId)) setTimeout(render, 0);
            });
        }
        render();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectBackButtons);
    else injectBackButtons();

    window.HpTuongTacPanel = { open, render, HUB_ID };
})();
