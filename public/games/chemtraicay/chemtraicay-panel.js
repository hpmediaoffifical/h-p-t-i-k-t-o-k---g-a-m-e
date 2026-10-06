/* Chém Trái Cây — panel controller trong app (4 tab: Cài đặt / Quà / Camera / Hiển thị).
 * Mẫu theo bancung-panel.js: open(socket) → subscribe preview, load config, lưu debounce 350 ms. */
(function () {
    'use strict';
    const $ = (sel, root) => (root || document).querySelector(sel);
    const Game = () => window.HpGame && window.HpGame.chemtraicay;
    let cfg = null;
    let socket = null;
    let bound = false;
    let persistTimer = null;
    let scenesCache = [];
    let liveState = null;
    let activeTracker = null;

    const SETTINGS = [
        { group: 'VÙNG CHÉM', items: [
            { key: 'cutRadius', label: 'Bán kính chém quanh ngón trỏ', min: 0, max: 60, step: 1, unit: 'px', hint: 'Tăng bán kính để dễ chém hơn.' },
            { key: 'holdSeconds', label: 'Giữ ngón trỏ để bắt đầu', min: 0.3, max: 3, step: 0.05, unit: 'giây' }
        ] },
        { group: 'VẬT LÝ & TÍNH ĐIỂM', items: [
            { key: 'baseSpeed', label: 'Tốc độ mặc định', min: 0.25, max: 1.5, step: 0.05, unit: '×' },
            { key: 'objectScale', label: 'Kích thước quả và bom', min: 0.5, max: 2.5, step: 0.1, unit: '×' },
            { key: 'peak', label: 'Độ cao đỉnh bay', min: 30, max: 90, step: 1, unit: '%' },
            { key: 'points', label: 'Điểm mỗi lần chém', min: 1, max: 1000, step: 1, unit: '' },
            { key: 'bombPenalty', label: 'Điểm trừ mỗi bom', min: 0, max: 5000, step: 5, unit: '' },
            { key: 'blast', label: 'Bán kính nổ', min: 5, max: 60, step: 1, unit: '%' },
            { key: 'danger', label: 'Ngưỡng tích tụ thua', min: 15, max: 85, step: 1, unit: '%' },
            { key: 'pileStep', label: 'Mỗi quả rơi cộng vào vườn', min: 1, max: 50, step: 1, unit: '%' },
            { key: 'cuts', label: 'Số lần chém / quả gốc', min: 1, max: 4, step: 1, unit: '' },
            { key: 'spawnPerSecond', label: 'Tốc độ sinh quả', min: 1, max: 10, step: 1, unit: 'quả/giây' },
            { key: 'maxPerGift', label: 'Tối đa quả mỗi lần quà', min: 1, max: 100, step: 1, unit: '' },
            { key: 'idleSpawnSeconds', label: 'Tự sinh quả khi rảnh (0 = tắt)', min: 0, max: 30, step: 0.5, unit: 'giây' }
        ] },
        { group: 'SỨC MẠNH CỘNG DỒN', items: [
            { key: 'godSeconds', label: 'Thần Chém mỗi lượt', min: 1, max: 120, step: 1, unit: 'giây' },
            { key: 'fastFactor', label: 'Hệ số Tăng Tốc', min: 1.1, max: 3, step: 0.1, unit: '×' },
            { key: 'fastSeconds', label: 'Tăng Tốc mỗi lượt', min: 1, max: 120, step: 1, unit: 'giây' },
            { key: 'slowFactor', label: 'Hệ số Giảm Tốc', min: 0.2, max: 0.9, step: 0.05, unit: '×' },
            { key: 'slowSeconds', label: 'Giảm Tốc mỗi lượt', min: 1, max: 120, step: 1, unit: 'giây' },
            { key: 'rescuePercent', label: 'Giải Cứu xả vườn', min: 10, max: 100, step: 5, unit: '%' }
        ], hint: 'Tăng Tốc và Giảm Tốc triệt tiêu thời gian của nhau. Thần Chém biến bom thành quả vàng chém lấy điểm.' }
    ];

    function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function fmt(v) { const n = Number(v); return Number.isInteger(n) ? String(n) : String(+n.toFixed(2)); }

    // ---------- open ----------
    function open(sharedSocket) {
        socket = sharedSocket;
        const view = $('#view-chemtraicay'); if (!view) return;
        document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v === view));
        if (!bound) { bindShell(); bound = true; }
        if (socket && !socket.__ctcAttached) {
            socket.__ctcAttached = true;
            socket.on('gameConfig', ({ gameId, config }) => { if (gameId === 'chemtraicay' && !persistTimer) { cfg = merge(config); renderAll(); } });
            socket.on('chemtraicay:state', (s) => { liveState = s; renderStatus(); });
            socket.on('chemtraicay:trackerStatus', ({ activeId }) => { activeTracker = activeId || null; renderStatus(); });
        }
        if (socket) socket.emit('subscribe', 'preview');
        loadConfig();
        fetch('/api/chemtraicay/state').then(r => r.json()).then(r => { liveState = r.state; activeTracker = r.activeTrackerId; renderStatus(); }).catch(() => {});
    }

    function merge(c) { return Object.assign(Game().defaultConfig(), c || {}); }
    async function loadConfig() {
        try { cfg = merge(await fetch('/api/games/chemtraicay/config').then(r => r.json())); }
        catch (e) { cfg = Game().defaultConfig(); }
        renderAll();
    }
    function schedulePersist() { clearTimeout(persistTimer); persistTimer = setTimeout(persistConfig, 350); }
    async function persistConfig() {
        persistTimer = null;
        try { await fetch('/api/games/chemtraicay/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) }); }
        catch (e) { console.error('[chemtraicay] lưu config lỗi', e); }
    }

    // ---------- shell: header + tabs ----------
    function bindShell() {
        $('#ctc-btn-copy').addEventListener('click', () => {
            const url = window.buildOverlayURL ? window.buildOverlayURL('/overlay/chemtraicay') : (location.origin + '/overlay/chemtraicay');
            if (window.hpCopyText) window.hpCopyText(url); else navigator.clipboard.writeText(url).catch(() => {});
            flashBtn($('#ctc-btn-copy'), '✓ Đã copy');
        });
        $('#ctc-btn-edit').addEventListener('click', () => window.open(location.origin + '/overlay/chemtraicay?edit=1', '_blank'));
        $('#ctc-btn-reload').addEventListener('click', () => { if (socket) socket.emit('overlay:reload', { gameId: 'chemtraicay' }); flashBtn($('#ctc-btn-reload'), '✓'); });
        $('#ctc-btn-save').addEventListener('click', async () => { clearTimeout(persistTimer); await persistConfig(); flashBtn($('#ctc-btn-save'), '✓ Đã lưu'); });
        $('#ctc-btn-start').addEventListener('click', () => control('start'));
        $('#ctc-btn-stop').addEventListener('click', () => control('stop'));
        $('#ctc-btn-reset').addEventListener('click', () => control('reset'));
        document.querySelectorAll('#view-chemtraicay .ctc-tab').forEach(t => t.addEventListener('click', () => {
            document.querySelectorAll('#view-chemtraicay .ctc-tab').forEach(x => x.classList.toggle('active', x === t));
            document.querySelectorAll('#view-chemtraicay .ctc-pane').forEach(p => p.classList.toggle('active', p.dataset.ctcPane === t.dataset.ctcTab));
            if (t.dataset.ctcTab === 'display') loadScenes();
        }));
    }
    function flashBtn(btn, text) { const old = btn.textContent; btn.textContent = text; setTimeout(() => { btn.textContent = old; }, 1200); }
    function control(cmd) { fetch('/api/chemtraicay/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd }) }).catch(() => {}); }

    function renderAll() { if (!cfg) return; renderSettings(); renderGifts(); renderCamera(); renderDisplay(); renderStatus(); }

    // ---------- trạng thái sống ----------
    function renderStatus() {
        const el = $('#ctc-status'); if (!el) return;
        const s = liveState || {};
        const trk = activeTracker ? `<span class="ctc-chip ok">🖐 Tracker ${escapeHtml(activeTracker)}</span>` : '<span class="ctc-chip warn">🖐 Chưa có tracker</span>';
        const play = s.playing ? '<span class="ctc-chip ok">▶ Đang chơi</span>' : '<span class="ctc-chip">⏸ Màn chờ</span>';
        const buffs = s.buffs || {};
        const bf = ['god', 'fast', 'slow'].filter(k => buffs[k] > 0).map(k => ({ god: '⚡', fast: '🔥', slow: '❄' })[k] + Math.ceil(buffs[k] / 1000) + 's').join(' ');
        el.innerHTML = `${trk} ${play} <span class="ctc-chip">🏆 ${Number(s.score) || 0} điểm</span> <span class="ctc-chip">🧺 Vườn ${Math.round(Number(s.pile) || 0)}%</span>${bf ? ` <span class="ctc-chip">${bf}</span>` : ''}${s.fps ? ` <span class="ctc-chip dim">${s.fps} fps</span>` : ''}`;
    }

    // ---------- Tab 1: Cài đặt ----------
    function renderSettings() {
        const host = $('#ctc-settings-pane'); if (!host) return;
        host.innerHTML = SETTINGS.map(g => `
            <div class="ctc-card">
                <h3>${g.group}</h3>
                ${g.items.map(it => `
                    <div class="ctc-row" data-key="${it.key}">
                        <label>${it.label}</label>
                        <input type="range" min="${it.min}" max="${it.max}" step="${it.step}" value="${fmt(cfg[it.key])}" />
                        <input type="number" min="${it.min}" max="${it.max}" step="${it.step}" value="${fmt(cfg[it.key])}" />
                        <span class="unit">${it.unit}</span>
                        ${it.hint ? `<div class="hint">${it.hint}</div>` : ''}
                    </div>`).join('')}
                ${g.hint ? `<div class="hint">${g.hint}</div>` : ''}
            </div>`).join('') + `
            <div class="ctc-card ctc-actions">
                <button class="danger small" id="ctc-btn-defaults">↺ Khôi phục cài đặt mặc định</button>
                <span class="hint">Chỉ đặt lại các tham số chơi, giữ nguyên danh sách quà và nguồn hình.</span>
            </div>`;
        host.querySelectorAll('.ctc-row').forEach(row => {
            const key = row.dataset.key, range = row.querySelector('input[type=range]'), num = row.querySelector('input[type=number]');
            const apply = (v) => { const n = Number(v); if (!Number.isFinite(n)) return; cfg[key] = n; range.value = n; num.value = fmt(n); schedulePersist(); };
            range.addEventListener('input', () => apply(range.value));
            num.addEventListener('change', () => apply(num.value));
        });
        $('#ctc-btn-defaults').addEventListener('click', () => {
            if (!confirm('Khôi phục tất cả tham số chơi về mặc định?')) return;
            const d = Game().defaultConfig();
            for (const g of SETTINGS) for (const it of g.items) cfg[it.key] = d[it.key];
            renderSettings(); schedulePersist();
        });
    }

    // ---------- Tab 2: Quà ----------
    function actionOptions(sel) {
        const G = Game();
        return G.ACTIONS.map(a => `<option value="${a}" ${a === sel ? 'selected' : ''}>${escapeHtml(G.ACTION_LABELS[a] || a)}</option>`).join('');
    }
    function renderGifts() {
        const host = $('#ctc-gifts-pane'); if (!host) return;
        const rules = Array.isArray(cfg.giftRules) ? cfg.giftRules : (cfg.giftRules = []);
        host.innerHTML = `
            <div class="ctc-card">
                <h3>QUÀ → HÀNH ĐỘNG <button class="primary small" id="ctc-btn-add-gift">+ Thêm quà</button></h3>
                <div class="hint">Mỗi quà gắn 1 trong 15 hành động: 10 loại quả, Bom, Thần Chém, Tăng Tốc, Giảm Tốc, Giải Cứu. Số lượng nhân với combo quà (tối đa ${fmt(cfg.maxPerGift)} mỗi lần).</div>
                <div class="ctc-gift-list" id="ctc-gift-list">
                    ${rules.length ? rules.map((r, i) => `
                        <div class="ctc-gift-row ${r.enabled === false ? 'off' : ''}" data-idx="${i}">
                            ${r.giftImage ? `<img src="${escapeHtml(r.giftImage)}" alt="">` : '<span class="ctc-gift-ph">🎁</span>'}
                            <span class="ctc-gift-name" title="ID ${escapeHtml(r.giftId)}">${escapeHtml(r.giftName || ('Quà #' + r.giftId))}</span>
                            <select class="ctc-gift-action">${actionOptions(r.action)}</select>
                            <input class="ctc-gift-count" type="number" min="1" max="100" value="${Math.max(1, Number(r.count) || 1)}" title="Số lượng mỗi quà">
                            <label class="ctc-gift-on" title="Bật/tắt"><input type="checkbox" ${r.enabled === false ? '' : 'checked'}></label>
                            <button class="ghost small ctc-gift-swap" title="Đổi quà">↻</button>
                            <button class="danger small ctc-gift-del" title="Xóa">✕</button>
                        </div>`).join('') : '<div class="nd-empty">Chưa gắn quà nào. Bấm "+ Thêm quà".</div>'}
                </div>
            </div>
            <div class="ctc-card">
                <h3>GỬI THỬ</h3>
                <div class="ctc-test">
                    <select id="ctc-test-action">${actionOptions('watermelon')}</select>
                    <input id="ctc-test-qty" type="number" min="1" max="100" value="3">
                    <button class="primary small" id="ctc-btn-test">🎯 Gửi thử lên overlay</button>
                </div>
                <div class="hint">Overlay phải đang mở (OBS hoặc tab preview). Game cần ở trạng thái Đang chơi mới sinh quả — bấm ▶ Bắt đầu ở trên.</div>
            </div>`;
        $('#ctc-btn-add-gift').addEventListener('click', () => openGiftPicker(-1));
        host.querySelectorAll('.ctc-gift-row').forEach(row => {
            const i = Number(row.dataset.idx), r = rules[i];
            row.querySelector('.ctc-gift-action').addEventListener('change', (e) => { r.action = e.target.value; schedulePersist(); });
            row.querySelector('.ctc-gift-count').addEventListener('change', (e) => { r.count = Math.max(1, Math.floor(Number(e.target.value) || 1)); e.target.value = r.count; schedulePersist(); });
            row.querySelector('.ctc-gift-on input').addEventListener('change', (e) => { r.enabled = e.target.checked; row.classList.toggle('off', !r.enabled); schedulePersist(); });
            row.querySelector('.ctc-gift-swap').addEventListener('click', () => openGiftPicker(i));
            row.querySelector('.ctc-gift-del').addEventListener('click', () => { rules.splice(i, 1); renderGifts(); schedulePersist(); });
        });
        $('#ctc-btn-test').addEventListener('click', async () => {
            const action = $('#ctc-test-action').value, qty = Math.max(1, Number($('#ctc-test-qty').value) || 1);
            try { await fetch('/api/chemtraicay/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, qty }) }); flashBtn($('#ctc-btn-test'), '✓ Đã gửi'); } catch (e) {}
        });
    }

    // Gift picker modal — sao chép mẫu bancung (.nd-gp-*)
    let _pickerEl = null, _pickerSwapIdx = -1;
    async function openGiftPicker(swapIdx) {
        _pickerSwapIdx = typeof swapIdx === 'number' ? swapIdx : -1;
        if (!Array.isArray(window.__giftSheet) || !window.__giftSheet.length) {
            try { const r = await fetch('/api/gifts'); if (r.ok) window.__giftSheet = (await r.json()).slice().sort((a, b) => (a.diamond || 0) - (b.diamond || 0)); } catch (e) {}
        }
        const el = ensurePicker();
        el.hidden = false;
        el.querySelector('.nd-gp-search').value = '';
        el.querySelector('.nd-gp-title').textContent = (_pickerSwapIdx >= 0 ? '↻ ĐỔI: ' : '') + '🍉 Chọn quà cho Chém Trái Cây';
        renderPickerList('');
        setTimeout(() => el.querySelector('.nd-gp-search').focus(), 30);
    }
    function ensurePicker() {
        if (_pickerEl) return _pickerEl;
        const el = document.createElement('div');
        el.className = 'nd-gp-overlay'; el.hidden = true;
        el.innerHTML = `
            <div class="nd-gp-modal">
                <div class="nd-gp-head"><div class="nd-gp-title">🎁 Chọn quà</div><button class="nd-gp-close ghost small">✕</button></div>
                <input class="nd-gp-search" type="text" placeholder="🔍 Tìm tên quà hoặc ID..." />
                <div class="nd-gp-list"></div>
                <div class="nd-gp-hint">Bấm vào quà để thêm vào danh sách. Hành động mặc định: Dưa hấu — đổi ở dòng quà.</div>
            </div>`;
        document.body.appendChild(el);
        el.addEventListener('click', e => { if (e.target === el) el.hidden = true; });
        el.querySelector('.nd-gp-close').addEventListener('click', () => el.hidden = true);
        el.querySelector('.nd-gp-search').addEventListener('input', e => renderPickerList(e.target.value));
        _pickerEl = el;
        return el;
    }
    function renderPickerList(filter) {
        const list = _pickerEl.querySelector('.nd-gp-list');
        const sheet = Array.isArray(window.__giftSheet) ? window.__giftSheet : [];
        const f = String(filter || '').toLowerCase().trim();
        const used = new Set((cfg.giftRules || []).map(g => String(g.giftId)));
        const items = !f ? sheet : sheet.filter(g => (g.name || '').toLowerCase().includes(f) || String(g.id || '').includes(f));
        list.innerHTML = items.slice(0, 200).map(g => `
            <div class="nd-gp-row${used.has(String(g.id)) ? ' active' : ''}" data-gid="${escapeHtml(String(g.id))}" data-gn="${escapeHtml(g.name || '')}" data-gi="${escapeHtml(g.image || '')}">
                ${g.image ? `<img class="nd-gp-img" src="${escapeHtml(g.image)}" />` : '<span class="nd-gp-icon">🎁</span>'}
                <span class="nd-gp-name">${escapeHtml(g.name || ('Quà #' + g.id))}</span>
                <span class="nd-gp-dia">${g.diamond || 0}💎</span>
                ${used.has(String(g.id)) ? '<span class="nd-gp-tick">✓</span>' : ''}
            </div>`).join('') || '<div class="nd-empty">Không tìm thấy quà.</div>';
        list.querySelectorAll('.nd-gp-row').forEach(r => r.addEventListener('click', () => {
            const id = r.dataset.gid;
            cfg.giftRules = cfg.giftRules || [];
            if (_pickerSwapIdx >= 0 && cfg.giftRules[_pickerSwapIdx]) {
                Object.assign(cfg.giftRules[_pickerSwapIdx], { giftId: id, giftName: r.dataset.gn, giftImage: r.dataset.gi });
            } else {
                if (used.has(id)) return;
                cfg.giftRules.push({ giftId: id, giftName: r.dataset.gn, giftImage: r.dataset.gi, action: 'watermelon', count: 1, enabled: true });
            }
            renderGifts(); schedulePersist();
            _pickerEl.hidden = true; _pickerSwapIdx = -1;
        }));
    }

    // ---------- Tab 3: Camera ----------
    function renderCamera() {
        const host = $('#ctc-camera-pane'); if (!host || host.dataset.ready) return;
        host.dataset.ready = '1';
        host.innerHTML = `
            <div class="ctc-card">
                <h3>NGUỒN HÌNH & NHẬN DIỆN TAY</h3>
                <div class="hint">Nguồn hình là <b>Source/Scene OBS</b>: overlay trong OBS <b>tự nhận diện tay</b> từ hình camera trong OBS (cần OBS đã kết nối ở mục Hiệu ứng OBS) và tự khớp vị trí/lật/cỡ camera trong scene — <b>không cần bật tracker bên dưới</b>. Chọn nguồn camera chung ở màn <b>🎥 Game Camera</b>.<br>Tracker bên dưới chỉ dùng khi chọn <b>Webcam</b> (dự phòng, chạy trong app/Chrome).</div>
                <div class="ctc-cam-frame"><iframe id="ctc-tracker-frame" src="/tracker/chemtraicay?embed=1" allow="camera; autoplay" loading="lazy"></iframe></div>
                <div class="ctc-actions">
                    <button class="ghost small" id="ctc-btn-chrome">🌐 Mở tracker trong Chrome</button>
                    <button class="ghost small" id="ctc-btn-obs-rect">📐 Lấy vùng camera từ OBS</button>
                    <span class="hint">Dùng Chrome khi máy yếu: Chrome có GPU nên nhận diện nhẹ hơn. Chỉ một tracker chạy tại một thời điểm, tracker bật sau sẽ thay tracker trước.</span>
                </div>
                <div class="hint" id="ctc-obs-rect-msg"></div>
            </div>`;
        $('#ctc-btn-chrome').addEventListener('click', () => window.open(location.origin + '/tracker/chemtraicay', '_blank'));
        $('#ctc-btn-obs-rect').addEventListener('click', async () => {
            const vs = cfg.videoSource || {};
            const msg = $('#ctc-obs-rect-msg');
            if (vs.mode !== 'obs-source' || !vs.scene || !vs.source) { msg.textContent = 'Chỉ dùng khi nguồn hình là Source OBS và đã chọn Scene + Source trong tracker.'; return; }
            try {
                const r = await fetch(`/api/chemtraicay/obs-transform?scene=${encodeURIComponent(vs.scene)}&source=${encodeURIComponent(vs.source)}`);
                const j = await r.json();
                if (!r.ok || !j.camRect) { msg.textContent = 'Lỗi: ' + (j.error || r.status); return; }
                cfg.camRect = j.camRect; schedulePersist();
                msg.textContent = `Đã lấy vùng camera: x ${j.camRect.xPercent}% · y ${j.camRect.yPercent}% · rộng ${j.camRect.widthPercent}% · cao ${j.camRect.heightPercent}% (so với khung ${j.base.baseWidth}×${j.base.baseHeight}).`;
            } catch (e) { msg.textContent = 'Lỗi: ' + (e && e.message || e); }
        });
    }

    // ---------- Tab 4: Hiển thị ----------
    async function loadScenes() {
        try { const r = await fetch('/api/chemtraicay/obs-scenes').then(r => r.json()); scenesCache = r.scenes || []; }
        catch (e) { scenesCache = []; }
        renderDisplay();
    }
    function sceneOptions(sel) {
        const opts = ['<option value="">— không đổi —</option>'].concat(scenesCache.map(s => `<option value="${escapeHtml(s)}" ${s === sel ? 'selected' : ''}>${escapeHtml(s)}</option>`));
        if (sel && !scenesCache.includes(sel)) opts.push(`<option value="${escapeHtml(sel)}" selected>${escapeHtml(sel)} (không thấy)</option>`);
        return opts.join('');
    }
    function renderDisplay() {
        const host = $('#ctc-display-pane'); if (!host || !cfg) return;
        const sc = cfg.obsScene || (cfg.obsScene = { enabled: false, playScene: '', backScene: '' });
        host.innerHTML = `
            <div class="ctc-card">
                <h3>HUD TRÊN OVERLAY</h3>
                <label class="ctc-toggle"><input type="checkbox" data-k="showScore" ${cfg.showScore !== false ? 'checked' : ''}> Hiện tổng điểm</label>
                <label class="ctc-toggle"><input type="checkbox" data-k="showDanger" ${cfg.showDanger !== false ? 'checked' : ''}> Hiện vạch nguy hiểm</label>
                <label class="ctc-toggle"><input type="checkbox" data-k="showNotices" ${cfg.showNotices !== false ? 'checked' : ''}> Hiện thông báo quà kích hoạt</label>
                <div class="ctc-row" data-key="volume"><label>Âm lượng</label><input type="range" min="0" max="1" step="0.05" value="${fmt(cfg.volume)}"><input type="number" min="0" max="1" step="0.05" value="${fmt(cfg.volume)}"><span class="unit"></span></div>
                <div class="ctc-row"><label>Chất lượng</label>
                    <select id="ctc-quality"><option value="auto" ${cfg.quality === 'auto' ? 'selected' : ''}>Cân bằng</option><option value="low" ${cfg.quality === 'low' ? 'selected' : ''}>Nhẹ</option><option value="high" ${cfg.quality === 'high' ? 'selected' : ''}>Đẹp</option></select></div>
            </div>
            <div class="ctc-card">
                <h3>SCENE OBS KHI CHƠI</h3>
                <label class="ctc-toggle"><input type="checkbox" id="ctc-scene-on" ${sc.enabled ? 'checked' : ''}> Tự chuyển Scene khi ván bắt đầu / kết thúc</label>
                <div class="ctc-row"><label>Scene khi chơi</label><select id="ctc-scene-play">${sceneOptions(sc.playScene)}</select></div>
                <div class="ctc-row"><label>Scene khi kết thúc</label><select id="ctc-scene-back">${sceneOptions(sc.backScene)}</select></div>
                <div class="hint">${scenesCache.length ? `${scenesCache.length} scene từ OBS.` : 'Chưa lấy được danh sách scene — kết nối OBS ở mục Hiệu ứng OBS rồi mở lại tab này.'}</div>
            </div>
            <div class="ctc-card">
                <h3>VÙNG CAMERA</h3>
                <div class="hint">Nguồn hình là <b>Scene OBS</b> → tọa độ tay khớp 1:1 với overlay, không cần chỉnh. Nguồn là Source OBS/Webcam → bấm <b>🎯 Chỉnh vùng camera</b> ở trên để kéo khung trùng vị trí camera trong OBS (thả chuột là lưu), hoặc "📐 Lấy vùng camera từ OBS" ở tab Camera.</div>
                <div class="hint">${cfg.camRect ? `Đang dùng khung tùy chỉnh: x ${cfg.camRect.xPercent}% · y ${cfg.camRect.yPercent}% · rộng ${cfg.camRect.widthPercent}% · cao ${cfg.camRect.heightPercent}%. <button class="ghost small" id="ctc-cam-reset">↺ Về tự động</button>` : 'Đang dùng khung tự động.'}</div>
            </div>`;
        host.querySelectorAll('.ctc-toggle input[data-k]').forEach(i => i.addEventListener('change', () => { cfg[i.dataset.k] = i.checked; schedulePersist(); }));
        const vr = host.querySelector('.ctc-row[data-key=volume]');
        const vrange = vr.querySelector('input[type=range]'), vnum = vr.querySelector('input[type=number]');
        const applyV = (v) => { const n = Math.max(0, Math.min(1, Number(v))); if (!Number.isFinite(n)) return; cfg.volume = n; vrange.value = n; vnum.value = fmt(n); schedulePersist(); };
        vrange.addEventListener('input', () => applyV(vrange.value)); vnum.addEventListener('change', () => applyV(vnum.value));
        $('#ctc-quality').addEventListener('change', (e) => { cfg.quality = e.target.value; schedulePersist(); });
        $('#ctc-scene-on').addEventListener('change', (e) => { sc.enabled = e.target.checked; schedulePersist(); });
        $('#ctc-scene-play').addEventListener('change', (e) => { sc.playScene = e.target.value; schedulePersist(); });
        $('#ctc-scene-back').addEventListener('change', (e) => { sc.backScene = e.target.value; schedulePersist(); });
        const cr = $('#ctc-cam-reset'); if (cr) cr.addEventListener('click', () => { cfg.camRect = null; renderDisplay(); schedulePersist(); });
    }

    window.HpChemTraiCayPanel = { open };
})();
