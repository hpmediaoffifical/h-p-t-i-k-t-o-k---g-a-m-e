/* Họa Sĩ — panel trong app (4 tab: Lau sơn / Sơn & Phủ kín / Quà & hành động / Hiển thị).
 * Mẫu theo dapmuoi-panel.js: open(socket) → subscribe preview, load config, lưu debounce 350 ms.
 * Panel chỉ GỬI config; echo gameConfig bị bỏ khi đang có lần lưu chờ (memory relay-cfg). */
(function () {
    'use strict';
    const $ = (sel, root) => (root || document).querySelector(sel);
    const Game = () => window.HpGame && window.HpGame.hoasi;
    let cfg = null;
    let socket = null;
    let bound = false;
    let persistTimer = null;
    let liveState = null, feedStatus = null;
    let feedPoll = null;

    // key có thể lồng ('full.percent') — đọc/ghi qua getK/setK.
    const WIPE_SETTINGS = [
        { group: 'LAU SƠN BẰNG TAY', items: [
            { key: 'wipeSpeed', label: 'Tốc độ lau', min: 25, max: 400, step: 5, unit: '%', hint: '100% = quẹt một lượt sạch ~80%, còn vệt mờ phải lau lại. Tăng nếu streamer lau mỏi tay.' },
            { key: 'minFingers', label: 'Số ngón duỗi tối thiểu để lau', min: 1, max: 5, step: 1, unit: 'ngón', hint: 'Nắm tay (0–1 ngón) không lau — đưa tay qua mặt không xoá sơn.' }
        ] }
    ];
    const PAINT_SETTINGS = [
        { group: 'CỤC SƠN', items: [
            { key: 'paintSize', label: 'Cỡ vết sơn', min: 5, max: 20, step: 0.5, unit: '% bề ngang' },
            { key: 'paintOpacity', label: 'Độ đậm sơn', min: 40, max: 100, step: 1, unit: '%' },
            { key: 'flightMs', label: 'Thời gian bay', min: 200, max: 1500, step: 10, unit: 'ms' },
            { key: 'shotsPerSecond', label: 'Tối đa cục ném mỗi giây', min: 1, max: 30, step: 1, unit: 'cục/s', hint: 'Quà dồn dập thì xếp hàng ném dần (Mưa sơn không tính).' }
        ] },
        { group: 'NƯỚC & KHIÊN', items: [
            { key: 'waterSize', label: 'Cỡ vệt nước rửa', min: 5, max: 25, step: 0.5, unit: '% bề ngang' },
            { key: 'shieldScale', label: 'Cỡ khiên quanh mặt', min: 50, max: 200, step: 5, unit: '%' }
        ] },
        { group: '🏁 PHỦ KÍN', items: [
            { key: 'full.percent', label: 'Phủ bao nhiêu thì tính PHỦ KÍN', min: 50, max: 100, step: 1, unit: '%' },
            { key: 'full.holdSec', label: 'Giữ mức đó trong', min: 0.5, max: 10, step: 0.1, unit: 'giây' },
            { key: 'full.washAfterSec', label: 'Tự rửa sau', min: 1, max: 30, step: 1, unit: 'giây' }
        ] }
    ];
    const GIFT_SETTINGS = [
        { key: 'coinsPerShot', label: 'Quà không gán: N xu = 1 cục sơn (0 = tắt)', min: 0, max: 5000, step: 1, unit: 'xu' },
        { key: 'maxPerGift', label: 'Tối đa cục sơn mỗi lần quà', min: 1, max: 500, step: 1, unit: 'cục' }
    ];
    const PARAM_LABELS = {
        paint: { count: ['Số cục', 'cục'] },
        storm: { seconds: ['Thời gian mưa', 'giây'], percent: ['Phủ bao nhiêu ô', '%'] },
        water: { count: ['Số tia nước', 'tia'] },
        shield: { seconds: ['Thời gian khiên', 'giây'] },
        wash: {}
    };
    const TYPE_HINT = {
        paint: 'Ném N cục sơn — nhắm mặt streamer trước, mặt phủ rồi mới lan ra (nhóm "hành").',
        storm: 'Mưa sơn rải khắp màn trong N giây — dễ PHỦ KÍN (nhóm "hành").',
        water: 'Tia nước rửa chỗ bẩn nhất, xuyên cả khiên (nhóm "cứu").',
        shield: 'Vòm kính quanh mặt: sơn đập vào là tan, không dính (nhóm "cứu"). Cần thấy người qua camera.',
        wash: 'Màn nước rửa sạch toàn màn ngay (nhóm "cứu").'
    };

    function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function fmt(v) { const n = Number(v); return Number.isInteger(n) ? String(n) : String(+n.toFixed(2)); }
    function getK(o, key) { return key.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
    function setK(o, key, v) { const ks = key.split('.'), last = ks.pop(); ks.reduce((a, k) => (a[k] = a[k] || {}), o)[last] = v; }

    // ---------- open ----------
    function open(sharedSocket) {
        socket = sharedSocket;
        const view = $('#view-hoasi'); if (!view) return;
        document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v === view));
        if (!bound) { bindShell(); bound = true; }
        if (socket && !socket.__hoasiAttached) {
            socket.__hoasiAttached = true;
            socket.on('gameConfig', ({ gameId, config }) => {
                if (gameId !== 'hoasi' || persistTimer) return;
                const next = Game().normalizeConfig(config);
                if (cfg && JSON.stringify(next) === JSON.stringify(cfg)) return;
                cfg = next; renderAll();
            });
            socket.on('hoasi:state', (s) => { liveState = s; renderStatus(); });
        }
        if (socket) socket.emit('subscribe', 'preview');
        loadConfig();
        // feedStatus/overlayStat chỉ phát cho room overlay — hỏi route như Đập Muỗi, 2 giây một lần khi đang mở.
        clearInterval(feedPoll);
        feedPoll = setInterval(pollFeed, 2000);
        pollFeed();
    }
    async function pollFeed() {
        const view = $('#view-hoasi');
        if (!view || !view.classList.contains('active')) { clearInterval(feedPoll); feedPoll = null; return; }
        try { feedStatus = (await (await fetch('/api/touchplay/obs-sources', { cache: 'no-store' })).json()).status || null; }
        catch (e) { feedStatus = null; }
        renderStatus();
    }
    async function loadConfig() {
        try { cfg = Game().normalizeConfig(await fetch('/api/games/hoasi/config').then(r => r.json())); }
        catch (e) { cfg = Game().normalizeConfig(null); }
        renderAll();
    }
    function schedulePersist() { clearTimeout(persistTimer); persistTimer = setTimeout(persistConfig, 350); }
    async function persistConfig() {
        persistTimer = null;
        try { await fetch('/api/games/hoasi/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) }); }
        catch (e) { console.error('[hoasi] lưu config lỗi', e); }
    }

    // ---------- shell ----------
    function bindShell() {
        $('#hoasi-btn-copy').addEventListener('click', () => {
            const url = window.buildOverlayURL ? window.buildOverlayURL('/overlay/camgames') : (location.origin + '/overlay/camgames');
            if (window.hpCopyText) window.hpCopyText(url); else navigator.clipboard.writeText(url).catch(() => {});
            flashBtn($('#hoasi-btn-copy'), '✓ Đã copy');
        });
        // review=1: không nạp MediaPipe, không đăng ký feed, không phát hoasi:state — không đụng overlay thật trong OBS.
        $('#hoasi-btn-preview').addEventListener('click', () => window.open(location.origin + '/overlay/hoasi?review=1&mouse=1', '_blank'));
        $('#hoasi-btn-reload').addEventListener('click', () => { if (socket) socket.emit('overlay:reload', { gameId: 'hoasi' }); flashBtn($('#hoasi-btn-reload'), '✓'); });
        $('#hoasi-btn-save').addEventListener('click', async () => { clearTimeout(persistTimer); await persistConfig(); flashBtn($('#hoasi-btn-save'), '✓ Đã lưu'); });
        $('#hoasi-btn-clear').addEventListener('click', () => control('clear'));
        $('#hoasi-btn-reset').addEventListener('click', () => { if (confirm('Xoá sạch sơn, hàng đợi, mưa sơn và khiên?')) control('reset'); });
        document.querySelectorAll('#view-hoasi .ctc-tab').forEach(t => t.addEventListener('click', () => {
            document.querySelectorAll('#view-hoasi .ctc-tab').forEach(x => x.classList.toggle('active', x === t));
            document.querySelectorAll('#view-hoasi .ctc-pane').forEach(p => p.classList.toggle('active', p.dataset.hoasiPane === t.dataset.hoasiTab));
        }));
        $('#hoasi-quick').addEventListener('click', (e) => {
            const b = e.target.closest('[data-test]'); if (!b) return;
            sendTest(b.dataset.test); flashBtn(b, '✓');
        });
    }
    function flashBtn(btn, text) { const old = btn.textContent; btn.textContent = text; setTimeout(() => { btn.textContent = old; }, 1200); }
    function control(cmd) { fetch('/api/hoasi/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd }) }).catch(() => {}); }
    function sendTest(action, params) {
        return fetch('/api/hoasi/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, qty: 1, params }) }).catch(() => {});
    }

    function renderAll() { if (!cfg) return; renderWipe(); renderPaint(); renderGifts(); renderDisplay(); renderStatus(); }

    // ---------- trạng thái sống ----------
    function renderStatus() {
        const el = $('#hoasi-status'); if (!el) return;
        const chips = [];
        const fs = feedStatus || {};
        if (fs.obsConnected === false) chips.push('<span class="ctc-chip warn">📷 Chưa kết nối OBS</span>');
        else if (!fs.source) chips.push('<span class="ctc-chip warn">📷 Chưa chọn nguồn camera (🎥 Game Camera)</span>');
        else if (fs.error) chips.push(`<span class="ctc-chip warn">📷 ${escapeHtml(fs.source)} — ${escapeHtml(fs.error)}</span>`);
        else chips.push(`<span class="ctc-chip ${fs.live ? 'ok' : 'warn'}">📷 ${escapeHtml(fs.source)}${fs.live ? ` · ${fs.fps || 0} hình/s` : ' — chưa có hình'}${fs.camFound === false ? ' · không thấy trong scene đang phát' : ''}</span>`);
        const ov = fs.overlay;
        if (ov) chips.push(`<span class="ctc-chip ${ov.hands ? 'ok' : ''}">🖐 ${ov.hands || 0} tay${ov.pose ? ' · 🧍 thấy người' : ''} · ${Math.round(ov.fps || 0)} lần/s · AI ${Math.round(ov.aiMs || 0)}ms</span>`);
        else chips.push('<span class="ctc-chip dim">🖐 Overlay chưa gửi tín hiệu nhận diện (mở link Game Camera trong OBS)</span>');
        const s = liveState || {};
        chips.push(`<span class="ctc-chip">🎨 Phủ ${Math.round((Number(s.coverage) || 0) * 100)}%${s.queue ? ` · chờ ${s.queue} cục` : ''}</span>`);
        if (s.shieldMs > 0) chips.push(`<span class="ctc-chip ok">🛡 Khiên ${Math.ceil(s.shieldMs / 1000)}s</span>`);
        if (s.phase === 'full') chips.push('<span class="ctc-chip warn">🏁 PHỦ KÍN</span>');
        else if (s.phase === 'washing') chips.push('<span class="ctc-chip ok">🧽 Đang rửa</span>');
        if (s.lastBy) chips.push(`<span class="ctc-chip dim">Vừa ném: ${escapeHtml(s.lastBy)}</span>`);
        el.innerHTML = chips.join(' ');
    }

    // ---------- thanh trượt chung ----------
    function sliderGroups(groups) {
        return groups.map(g => `
            <div class="ctc-card">
                <h3>${g.group}</h3>
                ${g.items.map(it => `
                    <div class="ctc-row" data-key="${it.key}">
                        <label>${it.label}</label>
                        <input type="range" min="${it.min}" max="${it.max}" step="${it.step}" value="${fmt(getK(cfg, it.key))}" />
                        <input type="number" min="${it.min}" max="${it.max}" step="${it.step}" value="${fmt(getK(cfg, it.key))}" />
                        <span class="unit">${it.unit}</span>
                        ${it.hint ? `<div class="hint">${it.hint}</div>` : ''}
                    </div>`).join('')}
            </div>`).join('');
    }
    function bindSliders(host) {
        host.querySelectorAll('.ctc-row[data-key]').forEach(row => {
            const key = row.dataset.key, range = row.querySelector('input[type=range]'), num = row.querySelector('input[type=number]');
            if (!range || !num) return;
            const apply = (v) => { const n = Number(v); if (!Number.isFinite(n)) return; setK(cfg, key, n); range.value = n; num.value = fmt(n); schedulePersist(); };
            range.addEventListener('input', () => apply(range.value));
            num.addEventListener('change', () => apply(num.value));
        });
    }
    function toggle(id, label, checked, hint) {
        return `<label class="ctc-toggle"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}> ${label}</label>${hint ? `<div class="hint">${hint}</div>` : ''}`;
    }
    function resetKeys(groups) {
        const d = Game().defaultConfig();
        for (const g of groups) for (const it of g.items) setK(cfg, it.key, getK(d, it.key));
    }

    // ---------- Tab 1: Lau sơn ----------
    function renderWipe() {
        const host = $('#hoasi-wipe-pane'); if (!host) return;
        host.innerHTML = sliderGroups(WIPE_SETTINGS) + `
            <div class="ctc-card">
                <h3>DỰ PHÒNG & GỠ LỖI</h3>
                ${toggle('hoasi-wristfb', 'Mất bàn tay thì lau bằng cổ tay (từ nhận diện cơ thể)', cfg.wristFallback, 'Model tay hay rớt khi vuốt nhanh — bật để vẫn lau được theo hướng cẳng tay.')}
                ${toggle('hoasi-showwipe', 'Hiện viền vùng đang lau trên overlay', cfg.display.showWipe, 'Giúp streamer canh tay khi mới chơi; tắt khi live cho gọn.')}
                <div class="ctc-actions" style="margin-top:8px"><button class="danger small" id="hoasi-btn-wipe-defaults">↺ Mặc định lau</button></div>
            </div>`;
        bindSliders(host);
        $('#hoasi-wristfb').addEventListener('change', (e) => { cfg.wristFallback = e.target.checked; schedulePersist(); });
        $('#hoasi-showwipe').addEventListener('change', (e) => { cfg.display.showWipe = e.target.checked; schedulePersist(); });
        $('#hoasi-btn-wipe-defaults').addEventListener('click', () => {
            resetKeys(WIPE_SETTINGS); const d = Game().defaultConfig();
            cfg.wristFallback = d.wristFallback; cfg.display.showWipe = d.display.showWipe; renderWipe(); schedulePersist();
        });
    }

    // ---------- Tab 2: Sơn & Phủ kín ----------
    function renderPaint() {
        const host = $('#hoasi-paint-pane'); if (!host) return;
        host.innerHTML = `
            <div class="ctc-card">
                <h3>NHẮM</h3>
                ${toggle('hoasi-aimface', 'Nhắm mặt streamer trước (lấy từ nhận diện cơ thể), mặt phủ rồi mới lan ra cả màn', cfg.aimFace, 'Tắt thì sơn rải đều vào chỗ còn sạch.')}
            </div>
            ${sliderGroups(PAINT_SETTINGS)}
            <div class="ctc-card">
                <h3>KHI PHỦ KÍN</h3>
                ${toggle('hoasi-full-on', 'Bật mốc PHỦ KÍN (sơn chảy + tên người ném cú cuối)', cfg.full.enabled)}
                ${toggle('hoasi-full-wash', 'Tự rửa sạch sau vài giây', cfg.full.autoWash, 'Tắt thì màn đứng ở PHỦ KÍN tới khi streamer lau xuống dưới ngưỡng 10% hoặc có quà Rửa sạch.')}
                <div class="ctc-actions" style="margin-top:8px"><button class="danger small" id="hoasi-btn-paint-defaults">↺ Mặc định sơn</button></div>
            </div>`;
        bindSliders(host);
        $('#hoasi-aimface').addEventListener('change', (e) => { cfg.aimFace = e.target.checked; schedulePersist(); });
        $('#hoasi-full-on').addEventListener('change', (e) => { cfg.full.enabled = e.target.checked; schedulePersist(); });
        $('#hoasi-full-wash').addEventListener('change', (e) => { cfg.full.autoWash = e.target.checked; schedulePersist(); });
        $('#hoasi-btn-paint-defaults').addEventListener('click', () => {
            resetKeys(PAINT_SETTINGS); const d = Game().defaultConfig();
            cfg.aimFace = d.aimFace; cfg.full.enabled = d.full.enabled; cfg.full.autoWash = d.full.autoWash; renderPaint(); schedulePersist();
        });
    }

    // ---------- Tab 3: Quà & hành động ----------
    function paramInputs(a) {
        const G = Game(), limits = G.ACTION_LIMITS[a.type] || {}, labels = PARAM_LABELS[a.type] || {};
        const keys = Object.keys(limits);
        if (!keys.length) return '<span class="hint">Không có tham số.</span>';
        return keys.map(k => `
            <label class="dm-param" title="${escapeHtml((labels[k] || [k])[0])}"><span>${escapeHtml((labels[k] || [k])[0])}</span>
                <input type="number" data-param="${k}" min="${limits[k][0]}" max="${limits[k][1]}" value="${fmt(a.params[k])}"><em>${escapeHtml((labels[k] || ['', ''])[1])}</em></label>`).join('');
    }
    function renderGifts() {
        const host = $('#hoasi-gifts-pane'); if (!host) return;
        const G = Game();
        const rules = Array.isArray(cfg.giftRules) ? cfg.giftRules : (cfg.giftRules = []);
        const actions = Array.isArray(cfg.actions) ? cfg.actions : (cfg.actions = []);
        host.innerHTML = `
            <div class="ctc-card">
                <h3>QUÀ RA SƠN <button class="primary small" id="hoasi-btn-add-gift">+ Thêm quà</button></h3>
                <div class="hint">Quà chỉ định ném N cục (nhân với combo quà). Quà KHÔNG gán thì tính theo xu ở dưới. Quà đã gắn cho hành động thì không ra sơn.</div>
                <div class="ctc-gift-list">
                    ${rules.length ? rules.map((r, i) => `
                        <div class="ctc-gift-row dm-gift-row ${r.enabled === false ? 'off' : ''}" data-idx="${i}">
                            ${r.giftImage ? `<img src="${escapeHtml(r.giftImage)}" alt="">` : '<span class="ctc-gift-ph">🎁</span>'}
                            <span class="ctc-gift-name" title="ID ${escapeHtml(r.giftId)}">${escapeHtml(r.giftName || ('Quà #' + r.giftId))}${r.diamond ? ` <small>${r.diamond}💎</small>` : ''}</span>
                            <span class="dm-gift-unit">cục:</span>
                            <input class="hoasi-gift-count" type="number" min="1" max="1000" value="${Math.max(1, Number(r.count) || 1)}" title="Số cục sơn mỗi quà">
                            <label class="ctc-gift-on" title="Bật/tắt"><input type="checkbox" ${r.enabled === false ? '' : 'checked'}></label>
                            <button class="ghost small hoasi-gift-swap" title="Đổi quà">↻</button>
                            <button class="danger small hoasi-gift-del" title="Xóa">✕</button>
                        </div>`).join('') : '<div class="nd-empty">Chưa gắn quà nào. Bấm "+ Thêm quà" hoặc để tính theo xu.</div>'}
                </div>
                ${GIFT_SETTINGS.map(it => `
                    <div class="ctc-row" data-key="${it.key}">
                        <label>${it.label}</label>
                        <input type="range" min="${it.min}" max="${it.max}" step="${it.step}" value="${fmt(cfg[it.key])}" />
                        <input type="number" min="${it.min}" max="${it.max}" step="${it.step}" value="${fmt(cfg[it.key])}" />
                        <span class="unit">${it.unit}</span>
                    </div>`).join('')}
            </div>
            <div class="ctc-card">
                <h3>HÀNH ĐỘNG — HÀNH & CỨU
                    <span class="dm-add-wrap">${G.ACTION_TYPES.map(t => `<button class="ghost small" data-add="${t}">+ ${G.ACTION_PRESET[t].icon} ${escapeHtml(G.ACTION_PRESET[t].name)}</button>`).join('')}</span>
                </h3>
                <div class="hint">Mỗi hành động gắn 1 quà + phím tắt. Quà gắn ở đây sẽ KHÔNG ra sơn thường. Phím tắt chạy cả khi app không được chọn (Electron).</div>
                <div class="dm-actions">
                    ${actions.map((a, i) => `
                        <div class="dm-action ${a.enabled === false ? 'off' : ''}" data-idx="${i}">
                            <div class="dm-action-head">
                                <select class="hoasi-act-icon" title="Biểu tượng">${G.ACTION_ICONS.concat(G.ACTION_ICONS.includes(a.icon) ? [] : [a.icon]).map(ic => `<option value="${escapeHtml(ic)}" ${ic === a.icon ? 'selected' : ''}>${escapeHtml(ic)}</option>`).join('')}</select>
                                <input class="dm-act-name hoasi-act-name" type="text" maxlength="60" value="${escapeHtml(a.name)}" placeholder="Tên hành động">
                                <select class="hoasi-act-type" title="Loại">${G.ACTION_TYPES.map(t => `<option value="${t}" ${t === a.type ? 'selected' : ''}>${G.ACTION_PRESET[t].icon} ${escapeHtml(G.ACTION_PRESET[t].name)}</option>`).join('')}</select>
                                <label class="ctc-gift-on" title="Bật/tắt"><input type="checkbox" class="hoasi-act-on" ${a.enabled === false ? '' : 'checked'}></label>
                                <button class="danger small hoasi-act-del" title="Xoá hành động">✕</button>
                            </div>
                            <div class="dm-action-body">
                                <button class="ghost small dm-act-gift hoasi-act-gift" title="Chọn quà kích hoạt">${a.giftImage ? `<img src="${escapeHtml(a.giftImage)}" alt="">` : '🎁'} ${a.giftId ? escapeHtml(a.giftName || ('#' + a.giftId)) : 'Chọn quà…'}</button>
                                <label class="dm-hotkey" title="Bấm tổ hợp phím muốn dùng; Backspace để xoá">⌨ <input class="hoasi-act-hotkey" type="text" maxlength="80" value="${escapeHtml(a.hotkey || '')}" placeholder="Phím tắt"></label>
                                <button class="primary small hoasi-act-test" title="Gửi thử lên overlay">🎯 Thử</button>
                            </div>
                            <div class="dm-action-params">${paramInputs(a)}</div>
                            <div class="hint">${TYPE_HINT[a.type] || ''}</div>
                        </div>`).join('')}
                </div>
            </div>`;
        bindSliders(host);
        $('#hoasi-btn-add-gift').addEventListener('click', () => openGiftPicker({ kind: 'rule' }));
        host.querySelectorAll('.dm-gift-row').forEach(row => {
            const i = Number(row.dataset.idx), r = rules[i];
            row.querySelector('.hoasi-gift-count').addEventListener('change', (e) => { r.count = Math.max(1, Math.floor(Number(e.target.value) || 1)); e.target.value = r.count; schedulePersist(); });
            row.querySelector('.ctc-gift-on input').addEventListener('change', (e) => { r.enabled = e.target.checked; row.classList.toggle('off', !r.enabled); schedulePersist(); });
            row.querySelector('.hoasi-gift-swap').addEventListener('click', () => openGiftPicker({ kind: 'rule', idx: i }));
            row.querySelector('.hoasi-gift-del').addEventListener('click', () => { rules.splice(i, 1); renderGifts(); schedulePersist(); });
        });
        host.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
            actions.push(G.normalizeAction({ type: b.dataset.add }, actions.length));
            renderGifts(); schedulePersist();
        }));
        host.querySelectorAll('.dm-action').forEach(row => {
            const i = Number(row.dataset.idx), a = actions[i];
            row.querySelector('.hoasi-act-icon').addEventListener('change', (e) => { a.icon = e.target.value; schedulePersist(); });
            row.querySelector('.hoasi-act-name').addEventListener('change', (e) => { a.name = e.target.value.trim().slice(0, 60) || G.ACTION_PRESET[a.type].name; e.target.value = a.name; schedulePersist(); });
            row.querySelector('.hoasi-act-type').addEventListener('change', (e) => {
                const keepName = a.name === G.ACTION_PRESET[a.type].name, keepIcon = a.icon === G.ACTION_PRESET[a.type].icon;
                actions[i] = G.normalizeAction({ ...a, type: e.target.value, params: {}, name: keepName ? '' : a.name, icon: keepIcon ? '' : a.icon }, i);
                renderGifts(); schedulePersist();
            });
            row.querySelector('.hoasi-act-on').addEventListener('change', (e) => { a.enabled = e.target.checked; row.classList.toggle('off', !a.enabled); schedulePersist(); });
            row.querySelector('.hoasi-act-del').addEventListener('click', () => { if (confirm(`Xoá hành động "${a.name}"?`)) { actions.splice(i, 1); renderGifts(); schedulePersist(); } });
            row.querySelector('.hoasi-act-gift').addEventListener('click', () => openGiftPicker({ kind: 'action', idx: i }));
            row.querySelector('.hoasi-act-test').addEventListener('click', () => { sendTest(a.type, a.params); flashBtn(row.querySelector('.hoasi-act-test'), '✓ Đã gửi'); });
            const hk = row.querySelector('.hoasi-act-hotkey');
            hk.addEventListener('keydown', (e) => {
                e.preventDefault();
                a.hotkey = ['Backspace', 'Delete', 'Escape'].includes(e.key) ? '' : hotkeyFromEvent(e);
                hk.value = a.hotkey; schedulePersist();
            });
            row.querySelectorAll('[data-param]').forEach(inp => inp.addEventListener('change', () => {
                const k = inp.dataset.param, [min, max] = G.ACTION_LIMITS[a.type][k];
                const n = Number(inp.value); a.params[k] = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : a.params[k];
                inp.value = fmt(a.params[k]); schedulePersist();
            }));
        });
    }
    function hotkeyFromEvent(event) {
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return event.currentTarget.value;
        let key = '';
        if (/^Key[A-Z]$/.test(event.code)) key = event.code.slice(3);
        else if (/^Digit[0-9]$/.test(event.code)) key = event.code.slice(5);
        else if (/^F(?:[1-9]|1[0-2])$/.test(event.key)) key = event.key.toUpperCase();
        else if (event.key === ' ') key = 'Space';
        else if (event.key.length === 1) key = event.key.toUpperCase();
        if (!key) return event.currentTarget.value;
        const parts = [];
        if (event.ctrlKey || event.metaKey) parts.push('Control');
        if (event.altKey) parts.push('Alt');
        if (event.shiftKey) parts.push('Shift');
        parts.push(key);
        return parts.join('+');
    }

    // Gift picker modal — mẫu Đập Muỗi (.nd-gp-*); dùng cho cả quà ra sơn lẫn quà hành động.
    let _pickerEl = null, _pickerTarget = null;
    async function openGiftPicker(target) {
        _pickerTarget = target;
        if (!Array.isArray(window.__giftSheet) || !window.__giftSheet.length) {
            try { const r = await fetch('/api/gifts'); if (r.ok) window.__giftSheet = (await r.json()).slice().sort((a, b) => (a.diamond || 0) - (b.diamond || 0)); } catch (e) {}
        }
        const el = ensurePicker();
        el.hidden = false;
        el.querySelector('.nd-gp-search').value = '';
        el.querySelector('.nd-gp-title').textContent = target.kind === 'action' ? `🛟 Chọn quà cho "${(cfg.actions[target.idx] || {}).name || 'hành động'}"` : (target.idx != null ? '↻ ĐỔI quà ra sơn' : '🎨 Chọn quà ra sơn');
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
                <div class="nd-gp-hint">Bấm vào quà để chọn. Quà đã dùng ở chỗ khác có dấu ✓.</div>
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
        const used = new Set([...(cfg.giftRules || []).map(g => String(g.giftId)), ...(cfg.actions || []).map(a => String(a.giftId))].filter(Boolean));
        const items = !f ? sheet : sheet.filter(g => (g.name || '').toLowerCase().includes(f) || String(g.id || '').includes(f));
        list.innerHTML = items.slice(0, 200).map(g => `
            <div class="nd-gp-row${used.has(String(g.id)) ? ' active' : ''}" data-gid="${escapeHtml(String(g.id))}" data-gn="${escapeHtml(g.name || '')}" data-gi="${escapeHtml(g.image || '')}" data-gd="${Number(g.diamond) || 0}">
                ${g.image ? `<img class="nd-gp-img" src="${escapeHtml(g.image)}" />` : '<span class="nd-gp-icon">🎁</span>'}
                <span class="nd-gp-name">${escapeHtml(g.name || ('Quà #' + g.id))}</span>
                <span class="nd-gp-dia">${g.diamond || 0}💎</span>
                ${used.has(String(g.id)) ? '<span class="nd-gp-tick">✓</span>' : ''}
            </div>`).join('') || '<div class="nd-empty">Không tìm thấy quà.</div>';
        list.querySelectorAll('.nd-gp-row').forEach(r => r.addEventListener('click', () => {
            const pick = { giftId: r.dataset.gid, giftName: r.dataset.gn, giftImage: r.dataset.gi, diamond: Number(r.dataset.gd) || 0 };
            const t = _pickerTarget || {};
            if (t.kind === 'action') { if (cfg.actions[t.idx]) Object.assign(cfg.actions[t.idx], pick); }
            else if (t.idx != null && cfg.giftRules[t.idx]) Object.assign(cfg.giftRules[t.idx], pick);
            else { if (used.has(pick.giftId)) return; cfg.giftRules.push(Game().normalizeConfig({ giftRules: [{ ...pick, count: 5, enabled: true }] }).giftRules[0]); }
            renderGifts(); schedulePersist();
            _pickerEl.hidden = true; _pickerTarget = null;
        }));
    }

    // ---------- Tab 4: Hiển thị ----------
    function renderDisplay() {
        const host = $('#hoasi-display-pane'); if (!host) return;
        const d = cfg.display, snd = cfg.sound;
        const row = (key, label, min, max, step, val, unit) => `
            <div class="ctc-row" data-dkey="${key}">
                <label>${label}</label>
                <input type="range" min="${min}" max="${max}" step="${step}" value="${fmt(val)}" />
                <input type="number" min="${min}" max="${max}" step="${step}" value="${fmt(val)}" />
                <span class="unit">${unit}</span>
            </div>`;
        host.innerHTML = `
            <div class="ctc-card">
                <h3>BẢNG % SƠN PHỦ</h3>
                ${toggle('hoasi-showhud', 'Hiện bảng "🎨 Sơn phủ N%"', d.showHud)}
                ${toggle('hoasi-showlast', 'Hiện tên người vừa ném', d.showLastThrower)}
                ${row('hudXPercent', 'Vị trí ngang', 0, 100, 1, d.hudXPercent, '%')}
                ${row('hudYPercent', 'Vị trí dọc', 0, 100, 1, d.hudYPercent, '%')}
                ${row('hudScale', 'Cỡ chữ', 30, 300, 5, d.hudScale, '%')}
            </div>
            <div class="ctc-card">
                <h3>ÂM THANH</h3>
                ${toggle('hoasi-sound', 'Tiếng vút / bẹp sơn / nước / khiên / phủ kín (tổng hợp, không cần file)', snd.enabled)}
                ${row('volume', 'Âm lượng', 0, 1, 0.05, snd.volume, '')}
                <div class="hint">Trong OBS, Browser Source phải bật "Control audio via OBS" hoặc để âm thanh phát ra máy nếu muốn nghe.</div>
            </div>
            <div class="ctc-card">
                <h3>NHẬN DIỆN</h3>
                <div class="ctc-row"><label>Chất lượng hình đưa vào AI</label>
                    <select id="hoasi-quality"><option value="low" ${cfg.quality === 'low' ? 'selected' : ''}>Nhẹ máy</option><option value="auto" ${cfg.quality === 'auto' ? 'selected' : ''}>Tự động</option><option value="high" ${cfg.quality === 'high' ? 'selected' : ''}>Nét (tốn CPU)</option></select>
                    <span></span><span class="unit"></span></div>
                <div class="hint">Nguồn camera lấy từ 🎥 Game Camera (dùng chung cho mọi game camera). Overlay trong OBS là link Game Camera; chọn Họa Sĩ trong Game Camera để OBS chuyển sang.</div>
            </div>`;
        $('#hoasi-showhud').addEventListener('change', (e) => { d.showHud = e.target.checked; schedulePersist(); });
        $('#hoasi-showlast').addEventListener('change', (e) => { d.showLastThrower = e.target.checked; schedulePersist(); });
        $('#hoasi-sound').addEventListener('change', (e) => { snd.enabled = e.target.checked; schedulePersist(); });
        $('#hoasi-quality').addEventListener('change', (e) => { cfg.quality = e.target.value; schedulePersist(); });
        host.querySelectorAll('.ctc-row[data-dkey]').forEach(r => {
            const key = r.dataset.dkey, range = r.querySelector('input[type=range]'), num = r.querySelector('input[type=number]');
            const apply = (v) => { const n = Number(v); if (!Number.isFinite(n)) return; if (key === 'volume') snd.volume = n; else d[key] = n; range.value = n; num.value = fmt(n); schedulePersist(); };
            range.addEventListener('input', () => apply(range.value));
            num.addEventListener('change', () => apply(num.value));
        });
    }

    window.HpHoaSiPanel = { open };
})();
