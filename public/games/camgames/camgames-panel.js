/* 🎥 Game Camera — panel trong app (menu mẹ của các game camera).
 *
 * - Chọn game đang chơi trên OBS: "▶ Chơi riêng" (POST {active}) hoặc "＋ Chơi kèm" (POST {actives}) —
 *   tối đa 1 game tay + 1 game trên đầu (khe `slot`, lib/camgames.js). Server tự bật đúng các game đó,
 *   tắt game camera còn lại (camGamesApplyActive) → quà không kích hoạt game đang ẩn.
 * - Nguồn camera CHUNG trong OBS cho mọi game con ({source}). Ô chọn nguồn ở màn Touch & Play / Bắn Cung
 *   đọc/ghi cùng trường này → đổi ở đâu cũng đồng bộ.
 * - "⚙ Cài đặt" mở màn cài đặt riêng của game con. Cài đặt chỉ ở app, overlay OBS không có nút.
 */
(function () {
    'use strict';
    const $ = (s, r = document) => r.querySelector(s);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let cfg = { enabled: true, active: 'touchplay', actives: ['touchplay'], source: '' };
    let feed = null;          // kết quả /api/touchplay/obs-sources
    let overlaps = [];        // quà gán đích danh ở ≥2 game đang chơi (/api/camgames/overlap)
    const soloOn = {};        // game `standalone` (Bắn Cung) đang bật ở link OBS riêng: { id: true }
    const POSE_GAMES = new Set(['bancung', 'level-quest']);   // overlay báo phase = id game; các game này đếm người, không đếm tay
    let socket = null, pollTimer = 0, built = false;

    function viewActive() { return !!$('#view-camgames')?.classList.contains('active'); }

    // ----- chơi nhiều game: cùng luật với lib/camgames.js (mỗi khe giữ game chọn sau cùng) -----
    const games = () => window.HpCamGames || [];
    const gameOf = id => games().find(g => g.id === id);
    const slotOf = id => gameOf(id)?.slot || id;
    const nameOf = id => gameOf(id)?.name || id;
    function norm(list) {
        let out = [];
        for (const id of list) {
            if (!gameOf(id)) continue;
            out = out.filter(x => x !== id && slotOf(x) !== slotOf(id));
            out.push(id);
        }
        return out.length ? out : [games()[0]?.id].filter(Boolean);
    }
    const actives = () => norm(Array.isArray(cfg.actives) && cfg.actives.length ? cfg.actives : [cfg.active]);
    const playing = () => (cfg.enabled !== false ? actives() : []);

    function build() {
        const root = $('#cg-root');
        if (!root || built) return;
        built = true;
        root.innerHTML = `
            <div class="cg-card">
                <h3>📺 TRÊN OBS</h3>
                <div class="cg-status" id="cg-status"><span class="cg-chip dim">Đang kiểm tra…</span></div>
                <div class="cg-row">
                    <label for="cg-source">Nguồn camera trong OBS (chung mọi game)</label>
                    <select id="cg-source"><option value="">— Chọn nguồn camera —</option></select>
                    <button class="ghost small" id="cg-refresh" title="Tải lại danh sách nguồn">🔄</button>
                </div>
                <div class="hint">Trong OBS chỉ cần <b>một Browser Source</b> 1080×1920 với link <b>📋 Link OBS</b> ở trên, đặt <b>phía trên</b> nguồn camera và phủ kín khung hình. Đổi game ở dưới thì OBS đổi theo, không phải sửa scene. Cần kết nối OBS WebSocket ở mục <b>Hiệu ứng OBS</b>.</div>
                <div class="hint"><b>Chơi cùng lúc:</b> bấm <b>＋ Chơi kèm</b> để ghép <b>1 game dùng tay</b> (Touch &amp; Play / Chém Trái Cây / Đập Muỗi) với <b>1 game trên đầu</b> (Bắn Cung / Level Quest). Hai game dùng chung một lần nhận diện nên máy không nặng gấp đôi. Quà đã gán riêng cho game nào thì chỉ game đó nhận; quà chưa gán ở đâu mới vào game nhận mọi quà.</div>
                <div class="cg-status" id="cg-overlap"></div>
            </div>
            <div class="cg-grid" id="cg-grid"></div>`;
        $('#cg-refresh').addEventListener('click', loadFeed);
        $('#cg-source').addEventListener('change', e => save({ source: e.target.value }));
        renderGrid();
    }

    function renderGrid() {
        const grid = $('#cg-grid');
        if (!grid) return;
        const now = playing(), cur = actives();
        grid.innerHTML = games().map(g => {
            const on = now.includes(g.id);
            const solo = !on && g.standalone && soloOn[g.id];
            // Chơi kèm: danh sách mới có >1 game thì mới khác "chơi riêng"; nói rõ ghép với ai, thay ai.
            const withList = on ? null : norm([...cur, g.id]);
            const canWith = !!withList && cfg.enabled !== false && withList.length > 1;
            const partners = canWith ? withList.filter(x => x !== g.id).map(nameOf).join(' + ') : '';
            const replaced = canWith ? cur.filter(x => !withList.includes(x)).map(nameOf).join(', ') : '';
            const withTitle = canWith ? `Chơi cùng lúc với ${partners}${replaced ? ' (thay ' + replaced + ' — cùng khe ' + (g.slot === 'head' ? 'trên đầu' : 'dùng tay') + ')' : ''}` : '';
            return `<div class="cg-game ${on ? 'on' : ''}" data-id="${esc(g.id)}">
                <div class="cg-game-head"><span class="cg-ico">${g.icon}</span><b>${esc(g.name)}</b>
                    ${on ? '<span class="cg-badge">● ĐANG CHƠI TRÊN OBS</span>' : ''}
                    ${solo ? '<span class="cg-badge solo" title="Game vẫn nhận quà qua link OBS riêng của nó">● ĐANG BẬT Ở LINK RIÊNG</span>' : ''}</div>
                <div class="cg-desc">${esc(g.desc)}</div>
                <div class="cg-track">Nhận diện: ${esc(g.track)}</div>
                ${g.note ? `<div class="cg-track">💡 ${esc(g.note)}</div>` : ''}
                <div class="cg-actions">
                    <button class="${on ? 'ghost' : 'primary'} small" data-play="${esc(g.id)}" ${on ? 'disabled' : ''}>${on ? '✓ Đang chơi' : canWith ? '▶ Chơi riêng' : '▶ Chơi game này'}</button>
                    ${canWith ? `<button class="ghost small" data-with="${esc(g.id)}" title="${esc(withTitle)}">＋ Chơi kèm</button>` : ''}
                    ${on && now.length > 1 ? `<button class="ghost small" data-drop="${esc(g.id)}" title="Thôi chơi game này, giữ game còn lại">✕ Bỏ</button>` : ''}
                    <button class="ghost small" data-settings="${esc(g.id)}">⚙ Cài đặt</button>
                    ${solo ? `<button class="ghost small" data-solo-off="${esc(g.id)}" title="Tắt game ở link riêng — quà không còn kích hoạt nó">⏻ Tắt</button>` : ''}
                </div>
            </div>`;
        }).join('');
        grid.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', () => save({ active: b.dataset.play, enabled: true })));
        grid.querySelectorAll('[data-with]').forEach(b => b.addEventListener('click', () => save({ actives: norm([...actives(), b.dataset.with]), enabled: true })));
        grid.querySelectorAll('[data-drop]').forEach(b => b.addEventListener('click', () => save({ actives: actives().filter(x => x !== b.dataset.drop) })));
        grid.querySelectorAll('[data-solo-off]').forEach(b => b.addEventListener('click', async () => {
            const id = b.dataset.soloOff;
            soloOn[id] = false; renderGrid();
            try { await fetch('/api/games/' + encodeURIComponent(id) + '/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: false }) }); } catch (_) {}
        }));
        grid.querySelectorAll('[data-settings]').forEach(b => b.addEventListener('click', () => window.hpOpenGame?.(b.dataset.settings)));
    }

    function renderStatus() {
        const el = $('#cg-status');
        if (!el) return;
        const st = feed?.status;
        const chips = [];
        if (cfg.enabled === false) chips.push('<span class="cg-chip warn">⏻ Game Camera đang TẮT — bấm nút nguồn ở thanh bên để bật</span>');
        if (!st) chips.push('<span class="cg-chip dim">Không đọc được trạng thái</span>');
        else if (!st.obsConnected) chips.push('<span class="cg-chip warn">● Chưa kết nối OBS WebSocket</span>');
        else {
            chips.push('<span class="cg-chip ok">● Đã nối OBS</span>');
            chips.push(st.source ? `<span class="cg-chip ${st.error === 'source-missing' ? 'warn' : 'ok'}">📷 ${esc(st.source)}${st.error === 'source-missing' ? ' — không thấy trong OBS' : ''}</span>` : '<span class="cg-chip warn">📷 Chưa chọn nguồn camera</span>');
            if (st.live) chips.push(`<span class="cg-chip ok">Đang gửi hình ${st.fps} hình/giây${st.camFound ? ' · scene "' + esc(st.scene) + '"' : ''}</span>`);
            // Mỗi game đang chơi một dòng (server giữ theo từng game: status.overlays). Bản cũ chỉ có `overlay`.
            const ovs = st.overlays || {};
            const rows = playing().map(id => {
                const ov = ovs[id] || (st.overlay && st.overlay.phase === id ? st.overlay : null);
                if (!ov) return '';
                // Bắn Cung / Level Quest nhận diện cơ thể (pose) chứ không đếm tay.
                const seen = POSE_GAMES.has(id) ? (ov.pose ? 'thấy người' : 'chưa thấy người') : `thấy ${ov.hands} tay`;
                return `<span class="cg-chip ${ov.fps >= 10 ? 'ok' : 'warn'}">${gameOf(id)?.icon || '🖐'} ${esc(nameOf(id))}: ${ov.fps} lần/giây · AI ${ov.aiMs}ms · ${seen}</span>`;
            }).filter(Boolean);
            if (!rows.length && st.overlay && !Object.keys(ovs).length) {
                const ov = st.overlay;
                rows.push(`<span class="cg-chip ${ov.fps >= 10 ? 'ok' : 'warn'}">🖐 Overlay OBS: ${ov.fps} lần/giây · AI ${ov.aiMs}ms · ${POSE_GAMES.has(ov.phase) ? (ov.pose ? 'thấy người' : 'chưa thấy người') : 'thấy ' + ov.hands + ' tay'}</span>`);
            }
            chips.push(...(rows.length ? rows : ['<span class="cg-chip dim">🖐 Chưa thấy overlay Game Camera chạy trong OBS</span>']));
        }
        el.innerHTML = chips.join('');
        renderOverlap();
    }

    function renderOverlap() {
        const el = $('#cg-overlap');
        if (!el) return;
        const now = playing();
        el.innerHTML = now.length < 2 ? '' :
            `<span class="cg-chip ok">🎮 Đang chơi cùng lúc: ${now.map(id => esc((gameOf(id)?.icon || '') + ' ' + nameOf(id))).join(' + ')}</span>` +
            overlaps.map(o => `<span class="cg-chip warn" title="Một quà kích cả hai game. Muốn tách thì bỏ quà này khỏi danh sách quà của một game.">⚠ Quà trùng: ${esc(o.giftName || ('#' + o.giftId))} (${o.games.map(nameOf).map(esc).join(' + ')})</span>`).join('');
    }
    async function loadOverlap() {
        try { overlaps = (await (await fetch('/api/camgames/overlap', { cache: 'no-store' })).json()).overlaps || []; } catch (_) { overlaps = []; }
        renderOverlap();
    }

    function renderSources() {
        const sel = $('#cg-source');
        if (!sel) return;
        const list = (feed?.sources || []).slice();
        if (cfg.source && !list.some(s => s.name === cfg.source)) list.unshift({ name: cfg.source, camera: true, missing: true });
        const key = JSON.stringify([list.map(s => s.name), cfg.source]);
        if (sel.dataset.key === key) return;      // vẽ lại khi đổi — kẻo đang mở dropdown bị đóng ngang
        sel.dataset.key = key;
        sel.innerHTML = '<option value="">— Chọn nguồn camera —</option>' + list.map(s =>
            `<option value="${esc(s.name)}"${s.name === cfg.source ? ' selected' : ''}>${s.camera ? '📷 ' : ''}${esc(s.name)}${s.missing ? ' (không thấy trong OBS)' : ''}</option>`).join('');
        // Chưa chọn mà OBS chỉ có đúng 1 camera → chọn sẵn cho đỡ một bước (như Touch & Play).
        if (!cfg.source && feed?.sources) {
            const cams = list.filter(s => s.camera);
            if (cams.length === 1) save({ source: cams[0].name });
        }
    }

    async function loadConfig() {
        try { const j = await (await fetch('/api/games/camgames/config', { cache: 'no-store' })).json(); if (j) cfg = { ...cfg, ...j }; } catch (_) {}
        await Promise.all((window.HpCamGames || []).filter(g => g.standalone).map(async g => {
            try { const c = await (await fetch('/api/games/' + encodeURIComponent(g.id) + '/config', { cache: 'no-store' })).json(); soloOn[g.id] = !!c && c.enabled !== false; } catch (_) {}
        }));
        renderGrid(); renderSources(); renderStatus();
        loadOverlap();
    }
    async function loadFeed() {
        try { feed = await (await fetch('/api/touchplay/obs-sources', { cache: 'no-store' })).json(); } catch (_) { feed = null; }
        renderSources(); renderStatus();
    }
    async function save(patch) {
        cfg = { ...cfg, ...patch };
        if (typeof patch.active === 'string' && !patch.actives) cfg.actives = [patch.active];   // chơi riêng
        if (Array.isArray(patch.actives)) cfg.active = norm(patch.actives)[0];
        renderGrid(); renderSources();
        try {
            const r = await fetch('/api/games/camgames/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
            const j = await r.json();
            if (j && j.config) cfg = { ...cfg, ...j.config };
        } catch (_) {}
        renderGrid(); renderStatus();
        if ('active' in patch || 'actives' in patch) loadOverlap();
    }

    function poll() {
        clearTimeout(pollTimer);
        if (!viewActive()) return;              // rời màn → thôi hỏi
        loadFeed().finally(() => { pollTimer = setTimeout(poll, 3000); });
    }

    window.HpCamGamesPanel = {
        open(sock) {
            if (sock && sock !== socket) {
                socket = sock;
                socket.on('gameConfig', d => {
                    if (!d || !d.config) return;
                    if (d.gameId === 'camgames') { cfg = { ...cfg, ...d.config }; renderGrid(); renderSources(); renderStatus(); loadOverlap(); }
                    else if ((window.HpCamGames || []).some(g => g.standalone && g.id === d.gameId)) { soloOn[d.gameId] = d.config.enabled !== false; renderGrid(); }
                });
            }
            build();
            loadConfig();
            setTimeout(poll, 50);
        },
        copyLink(btn) {
            const path = '/overlay/camgames';
            const url = typeof window.buildOverlayURL === 'function' ? window.buildOverlayURL(path) : location.origin + path;
            const done = () => { const o = btn.textContent; btn.textContent = '✓ Đã copy'; setTimeout(() => btn.textContent = o, 1500); };
            const legacy = () => { const ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (_) {} ta.remove(); };
            if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done).catch(legacy); else legacy();
        },
        reloadOverlay() { try { socket?.emit('overlay:reload', { gameId: 'camgames' }); } catch (_) {} }
    };
})();
