/* Đập Muỗi — panel trong app (4 tab: Cách đập / Muỗi / Quà / Hiển thị).
 * Mẫu theo chemtraicay-panel.js: open(socket) → subscribe preview, load config, lưu debounce 350 ms.
 * Panel chỉ GỬI config; echo gameConfig chỉ dùng khi không phải bản vừa lưu (memory relay-cfg). */
(function () {
    'use strict';
    const $ = (sel, root) => (root || document).querySelector(sel);
    const Game = () => window.HpGame && window.HpGame.dapmuoi;
    let cfg = null;
    let socket = null;
    let bound = false;
    let persistTimer = null;
    let liveState = null, overlayStat = null, feedStatus = null;

    const HIT_SETTINGS = [
        { group: 'ĐỘ NHẠY VỖ TAY', items: [
            { key: 'clapDistance', label: 'Khoảng cách 2 lòng bàn tay tính là chập', min: 0.6, max: 3, step: 0.1, unit: '× cỡ tay', hint: 'Tăng nếu vỗ không ăn; giảm nếu chỉ đưa tay gần nhau đã tính.' },
            { key: 'clapSpeed', label: 'Tốc độ khép tối thiểu', min: 200, max: 3000, step: 50, unit: 'px/s' },
            { key: 'slapSpeed', label: 'Tốc độ tát 1 tay tối thiểu', min: 300, max: 4000, step: 50, unit: 'px/s' },
            { key: 'clapCooldownMs', label: 'Nghỉ giữa 2 cú', min: 100, max: 1000, step: 10, unit: 'ms' },
            { key: 'hitRadius', label: 'Bán kính đập', min: 4, max: 40, step: 1, unit: '% màn', hint: 'Muỗi trong vòng này quanh điểm vỗ sẽ chết (cộng thêm cỡ bàn tay).' }
        ] }
    ];
    const MOSQ_SETTINGS = [
        { group: 'MUỖI BAY', items: [
            { key: 'speed', label: 'Tốc độ bay', min: 40, max: 600, step: 10, unit: 'px/s' },
            { key: 'mosquitoScale', label: 'Cỡ muỗi', min: 40, max: 250, step: 5, unit: '%' },
            { key: 'gentlePercent', label: 'Tỉ lệ con bay nhẹ (lững lờ)', min: 0, max: 100, step: 5, unit: '%' },
            { key: 'crowdFrom', label: 'Đông từ ngần này con thì cả đàn chậm lại', min: 20, max: 300, step: 10, unit: 'con' },
            { key: 'faceRadius', label: 'Bán kính bám quanh mặt', min: 100, max: 600, step: 10, unit: 'px' }
        ] },
        { group: 'MUỖI THÔNG MINH', items: [
            { key: 'smartPercent', label: 'Tỉ lệ con thông minh', min: 0, max: 100, step: 5, unit: '%', hint: 'Con thông minh to hơn, mắt vàng, bị đập thì né vụt đi.' },
            { key: 'smartLives', label: 'Số lần phải đập', min: 2, max: 6, step: 1, unit: 'lần' }
        ] },
        { group: 'SINH MUỖI', items: [
            { key: 'spawnPerSecond', label: 'Tốc độ xả muỗi từ hàng đợi', min: 1, max: 30, step: 1, unit: 'con/giây' },
            { key: 'maxOnScreen', label: 'Tối đa muỗi trên màn', min: 20, max: 600, step: 10, unit: 'con', hint: 'Dư thì xếp hàng đợi, xả dần khi có chỗ.' },
            { key: 'idleSpawnSeconds', label: 'Sinh nền: mỗi N giây thêm 1 con (0 = tắt)', min: 0, max: 60, step: 1, unit: 'giây' }
        ] }
    ];
    const GIFT_SETTINGS = [
        { key: 'coinsPerMosquito', label: 'Quà không gán: N xu = 1 con (0 = tắt)', min: 0, max: 5000, step: 1, unit: 'xu' },
        { key: 'maxPerGift', label: 'Tối đa muỗi mỗi lần quà', min: 1, max: 1000, step: 1, unit: 'con' }
    ];
    const PARAM_LABELS = {
        release: { count: ['Số con', 'con'] },
        spray: { radius: ['Bán kính mây', 'px'], ms: ['Thời gian nở', 'ms'], count: ['Giết tối đa', 'con'], percent: ['Hoặc % đàn (0 = theo số)', '%'] },
        racket: { seconds: ['Thời gian vợt', 'giây'] },
        net: { seconds: ['Ngừng sinh muỗi', 'giây'] }
    };
    const TYPE_HINT = {
        release: 'Thả thêm muỗi ngay (nhóm "hành").',
        spray: 'Đám mây xịt lan ra giữa đàn, giết dần — kể cả muỗi thông minh (nhóm "cứu").',
        racket: 'Tay streamer thành vợt điện: lướt qua muỗi là chết, không cần vỗ (nhóm "cứu").',
        net: 'Mắc màn: ngừng sinh muỗi mới, muỗi đang bay vẫn bay (nhóm "cứu").'
    };

    function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function fmt(v) { const n = Number(v); return Number.isInteger(n) ? String(n) : String(+n.toFixed(2)); }

    // ---------- open ----------
    function open(sharedSocket) {
        socket = sharedSocket;
        const view = $('#view-dapmuoi'); if (!view) return;
        document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v === view));
        if (!bound) { bindShell(); bound = true; }
        if (socket && !socket.__dmAttached) {
            socket.__dmAttached = true;
            socket.on('gameConfig', ({ gameId, config }) => {
                if (gameId !== 'dapmuoi' || persistTimer) return;
                const next = Game().normalizeConfig(config);
                if (cfg && JSON.stringify(next) === JSON.stringify(cfg)) return;
                cfg = next; renderAll();
            });
            socket.on('dapmuoi:state', (s) => { liveState = s; renderStatus(); });
            socket.on('touchplay:overlayStat', (s) => { overlayStat = { ...s, at: Date.now() }; renderStatus(); });
            socket.on('touchplay:feedStatus', (s) => { feedStatus = s; renderStatus(); });
        }
        if (socket) socket.emit('subscribe', 'preview');
        loadConfig();
    }

    async function loadConfig() {
        try { cfg = Game().normalizeConfig(await fetch('/api/games/dapmuoi/config').then(r => r.json())); }
        catch (e) { cfg = Game().normalizeConfig(null); }
        renderAll();
    }
    function schedulePersist() { clearTimeout(persistTimer); persistTimer = setTimeout(persistConfig, 350); }
    async function persistConfig() {
        persistTimer = null;
        try { await fetch('/api/games/dapmuoi/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) }); }
        catch (e) { console.error('[dapmuoi] lưu config lỗi', e); }
    }

    // ---------- shell ----------
    function bindShell() {
        $('#dm-btn-copy').addEventListener('click', () => {
            const url = window.buildOverlayURL ? window.buildOverlayURL('/overlay/camgames') : (location.origin + '/overlay/camgames');
            if (window.hpCopyText) window.hpCopyText(url); else navigator.clipboard.writeText(url).catch(() => {});
            flashBtn($('#dm-btn-copy'), '✓ Đã copy');
        });
        // review=1: không nạp MediaPipe, không đăng ký feed, không phát dapmuoi:state — không đụng overlay thật trong OBS.
        $('#dm-btn-preview').addEventListener('click', () => window.open(location.origin + '/overlay/dapmuoi?review=1&mouse=1', '_blank'));
        $('#dm-btn-reload').addEventListener('click', () => { if (socket) socket.emit('overlay:reload', { gameId: 'dapmuoi' }); flashBtn($('#dm-btn-reload'), '✓'); });
        $('#dm-btn-save').addEventListener('click', async () => { clearTimeout(persistTimer); await persistConfig(); flashBtn($('#dm-btn-save'), '✓ Đã lưu'); });
        $('#dm-btn-clear').addEventListener('click', () => control('clear'));
        $('#dm-btn-reset').addEventListener('click', () => { if (confirm('Đặt lại Đã đập về 0 và xoá hết muỗi?')) control('reset'); });
        document.querySelectorAll('#view-dapmuoi .ctc-tab').forEach(t => t.addEventListener('click', () => {
            document.querySelectorAll('#view-dapmuoi .ctc-tab').forEach(x => x.classList.toggle('active', x === t));
            document.querySelectorAll('#view-dapmuoi .ctc-pane').forEach(p => p.classList.toggle('active', p.dataset.dmPane === t.dataset.dmTab));
        }));
    }
    function flashBtn(btn, text) { const old = btn.textContent; btn.textContent = text; setTimeout(() => { btn.textContent = old; }, 1200); }
    function control(cmd) { fetch('/api/dapmuoi/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd }) }).catch(() => {}); }
    function sendTest(action, params) {
        return fetch('/api/dapmuoi/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, qty: 1, params }) }).catch(() => {});
    }

    function renderAll() { if (!cfg) return; renderHit(); renderMosquito(); renderGifts(); renderDisplay(); renderStatus(); }

    // ---------- trạng thái sống ----------
    function renderStatus() {
        const el = $('#dm-status'); if (!el) return;
        const chips = [];
        const fs = feedStatus || {};
        if (fs.obsConnected === false) chips.push('<span class="ctc-chip warn">📷 Chưa kết nối OBS</span>');
        else if (fs.source) chips.push(`<span class="ctc-chip ok">📷 ${escapeHtml(fs.source)}</span>`);
        else chips.push('<span class="ctc-chip warn">📷 Chưa chọn nguồn camera (🎥 Game Camera)</span>');
        if (overlayStat && Date.now() - overlayStat.at < 6000) {
            chips.push(`<span class="ctc-chip ${overlayStat.hands ? 'ok' : ''}">🖐 ${overlayStat.hands || 0} tay · ${Math.round(overlayStat.fps || 0)} lần/s · AI ${Math.round(overlayStat.aiMs || 0)}ms</span>`);
        } else chips.push('<span class="ctc-chip dim">🖐 Overlay chưa gửi tín hiệu nhận diện</span>');
        const s = liveState || {};
        chips.push(`<span class="ctc-chip">🦟 Còn ${Number(s.flying) || 0}${s.queue ? ` (+${s.queue})` : ''}</span>`);
        chips.push(`<span class="ctc-chip">✋ Đã đập ${Number(s.killed) || 0}</span>`);
        if (s.racketMs > 0) chips.push(`<span class="ctc-chip ok">🏸 Vợt ${Math.ceil(s.racketMs / 1000)}s</span>`);
        if (s.netMs > 0) chips.push(`<span class="ctc-chip ok">🛏 Màn ${Math.ceil(s.netMs / 1000)}s</span>`);
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
                        <input type="range" min="${it.min}" max="${it.max}" step="${it.step}" value="${fmt(cfg[it.key])}" />
                        <input type="number" min="${it.min}" max="${it.max}" step="${it.step}" value="${fmt(cfg[it.key])}" />
                        <span class="unit">${it.unit}</span>
                        ${it.hint ? `<div class="hint">${it.hint}</div>` : ''}
                    </div>`).join('')}
                ${g.hint ? `<div class="hint">${g.hint}</div>` : ''}
            </div>`).join('');
    }
    function bindSliders(host) {
        host.querySelectorAll('.ctc-row[data-key]').forEach(row => {
            const key = row.dataset.key, range = row.querySelector('input[type=range]'), num = row.querySelector('input[type=number]');
            if (!range || !num) return;
            const apply = (v) => { const n = Number(v); if (!Number.isFinite(n)) return; cfg[key] = n; range.value = n; num.value = fmt(n); schedulePersist(); };
            range.addEventListener('input', () => apply(range.value));
            num.addEventListener('change', () => apply(num.value));
        });
    }
    function toggle(id, label, checked, hint) {
        return `<label class="ctc-toggle"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}> ${label}</label>${hint ? `<div class="hint">${hint}</div>` : ''}`;
    }

    // ---------- Tab 1: Cách đập ----------
    function renderHit() {
        const host = $('#dm-hit-pane'); if (!host) return;
        const modes = [['clap', '👏 Vỗ 2 tay', 'Hai lòng bàn tay chập vào nhau nhanh. Có dự phòng bằng cổ tay khi model tay mất dấu lúc chập.'], ['slap', '✋ Tát 1 tay', 'Một tay vụt nhanh qua muỗi.'], ['both', '👏✋ Cả hai', 'Vỗ hoặc tát đều tính.']];
        host.innerHTML = `
            <div class="ctc-card">
                <h3>CÁCH ĐẬP</h3>
                <div class="dm-modes">${modes.map(([v, t, h]) => `
                    <label class="dm-mode ${cfg.hitMode === v ? 'on' : ''}"><input type="radio" name="dm-hitmode" value="${v}" ${cfg.hitMode === v ? 'checked' : ''}><b>${t}</b><small>${h}</small></label>`).join('')}
                </div>
            </div>
            ${sliderGroups(HIT_SETTINGS)}
            <div class="ctc-card">
                <h3>GỠ LỖI</h3>
                ${toggle('dm-showring', 'Hiện vòng sóng tại điểm đập (kể cả hụt) — giúp streamer canh tay', cfg.display.showHitRing)}
                ${toggle('dm-showskel', 'Hiện chấm lòng bàn tay / cổ tay nhận diện được', cfg.display.showSkeleton)}
                <div class="ctc-actions" style="margin-top:8px"><button class="danger small" id="dm-btn-hit-defaults">↺ Mặc định độ nhạy</button></div>
            </div>`;
        host.querySelectorAll('input[name=dm-hitmode]').forEach(r => r.addEventListener('change', () => { cfg.hitMode = r.value; renderHit(); schedulePersist(); }));
        bindSliders(host);
        $('#dm-showring').addEventListener('change', (e) => { cfg.display.showHitRing = e.target.checked; schedulePersist(); });
        $('#dm-showskel').addEventListener('change', (e) => { cfg.display.showSkeleton = e.target.checked; schedulePersist(); });
        $('#dm-btn-hit-defaults').addEventListener('click', () => {
            const d = Game().defaultConfig();
            for (const g of HIT_SETTINGS) for (const it of g.items) cfg[it.key] = d[it.key];
            cfg.hitMode = d.hitMode; renderHit(); schedulePersist();
        });
    }

    // ---------- Tab 2: Muỗi ----------
    function renderMosquito() {
        const host = $('#dm-mosq-pane'); if (!host) return;
        host.innerHTML = sliderGroups(MOSQ_SETTINGS) + `
            <div class="ctc-card">
                <h3>BÁM MẶT</h3>
                ${toggle('dm-faceattract', 'Muỗi hay bay quanh mặt streamer (lấy từ nhận diện cơ thể)', cfg.faceAttract, 'Tắt thì muỗi bay đều khắp màn.')}
                <div class="ctc-actions" style="margin-top:8px"><button class="danger small" id="dm-btn-mosq-defaults">↺ Mặc định muỗi</button></div>
            </div>`;
        bindSliders(host);
        $('#dm-faceattract').addEventListener('change', (e) => { cfg.faceAttract = e.target.checked; schedulePersist(); });
        $('#dm-btn-mosq-defaults').addEventListener('click', () => {
            const d = Game().defaultConfig();
            for (const g of MOSQ_SETTINGS) for (const it of g.items) cfg[it.key] = d[it.key];
            cfg.faceAttract = d.faceAttract; renderMosquito(); schedulePersist();
        });
    }

    // ---------- Tab 3: Quà ----------
    function paramInputs(a) {
        const G = Game(), limits = G.ACTION_LIMITS[a.type] || {}, labels = PARAM_LABELS[a.type] || {};
        return Object.keys(limits).map(k => `
            <label class="dm-param" title="${escapeHtml((labels[k] || [k])[0])}"><span>${escapeHtml((labels[k] || [k])[0])}</span>
                <input type="number" data-param="${k}" min="${limits[k][0]}" max="${limits[k][1]}" value="${fmt(a.params[k])}"><em>${escapeHtml((labels[k] || ['', ''])[1])}</em></label>`).join('');
    }
    function renderGifts() {
        const host = $('#dm-gifts-pane'); if (!host) return;
        const G = Game();
        const rules = Array.isArray(cfg.giftRules) ? cfg.giftRules : (cfg.giftRules = []);
        const actions = Array.isArray(cfg.actions) ? cfg.actions : (cfg.actions = []);
        host.innerHTML = `
            <div class="ctc-card">
                <h3>QUÀ RA MUỖI <button class="primary small" id="dm-btn-add-gift">+ Thêm quà</button></h3>
                <div class="hint">Quà chỉ định rơi N con (nhân với combo quà). Quà KHÔNG gán thì tính theo xu ở dưới. Quà đã gắn cho hành động thì không ra muỗi.</div>
                <div class="ctc-gift-list" id="dm-gift-list">
                    ${rules.length ? rules.map((r, i) => `
                        <div class="ctc-gift-row dm-gift-row ${r.enabled === false ? 'off' : ''}" data-idx="${i}">
                            ${r.giftImage ? `<img src="${escapeHtml(r.giftImage)}" alt="">` : '<span class="ctc-gift-ph">🎁</span>'}
                            <span class="ctc-gift-name" title="ID ${escapeHtml(r.giftId)}">${escapeHtml(r.giftName || ('Quà #' + r.giftId))}${r.diamond ? ` <small>${r.diamond}💎</small>` : ''}</span>
                            <span class="dm-gift-unit">muỗi:</span>
                            <input class="dm-gift-count" type="number" min="1" max="1000" value="${Math.max(1, Number(r.count) || 1)}" title="Số con mỗi quà">
                            <label class="ctc-gift-on" title="Bật/tắt"><input type="checkbox" ${r.enabled === false ? '' : 'checked'}></label>
                            <button class="ghost small dm-gift-swap" title="Đổi quà">↻</button>
                            <button class="danger small dm-gift-del" title="Xóa">✕</button>
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
                <h3>HÀNH ĐỘNG — CỨU & HÀNH
                    <span class="dm-add-wrap">${G.ACTION_TYPES.map(t => `<button class="ghost small" data-add="${t}">+ ${G.ACTION_PRESET[t].icon} ${escapeHtml(G.ACTION_PRESET[t].name)}</button>`).join('')}</span>
                </h3>
                <div class="hint">Mỗi hành động gắn 1 quà + phím tắt. Quà gắn ở đây sẽ KHÔNG ra muỗi. Phím tắt chạy cả khi app không được chọn (Electron).</div>
                <div class="dm-actions">
                    ${actions.map((a, i) => `
                        <div class="dm-action ${a.enabled === false ? 'off' : ''}" data-idx="${i}">
                            <div class="dm-action-head">
                                <select class="dm-act-icon" title="Biểu tượng">${G.ACTION_ICONS.concat(G.ACTION_ICONS.includes(a.icon) ? [] : [a.icon]).map(ic => `<option value="${escapeHtml(ic)}" ${ic === a.icon ? 'selected' : ''}>${escapeHtml(ic)}</option>`).join('')}</select>
                                <input class="dm-act-name" type="text" maxlength="60" value="${escapeHtml(a.name)}" placeholder="Tên hành động">
                                <select class="dm-act-type" title="Loại">${G.ACTION_TYPES.map(t => `<option value="${t}" ${t === a.type ? 'selected' : ''}>${G.ACTION_PRESET[t].icon} ${escapeHtml(G.ACTION_PRESET[t].name)}</option>`).join('')}</select>
                                <label class="ctc-gift-on" title="Bật/tắt"><input type="checkbox" class="dm-act-on" ${a.enabled === false ? '' : 'checked'}></label>
                                <button class="danger small dm-act-del" title="Xoá hành động">✕</button>
                            </div>
                            <div class="dm-action-body">
                                <button class="ghost small dm-act-gift" title="Chọn quà kích hoạt">${a.giftImage ? `<img src="${escapeHtml(a.giftImage)}" alt="">` : '🎁'} ${a.giftId ? escapeHtml(a.giftName || ('#' + a.giftId)) : 'Chọn quà…'}</button>
                                <label class="dm-hotkey" title="Bấm tổ hợp phím muốn dùng; Backspace để xoá">⌨ <input class="dm-act-hotkey" type="text" maxlength="80" value="${escapeHtml(a.hotkey || '')}" placeholder="Phím tắt"></label>
                                <button class="primary small dm-act-test" title="Gửi thử lên overlay">🎯 Thử</button>
                            </div>
                            <div class="dm-action-params">${paramInputs(a)}</div>
                            <div class="hint">${TYPE_HINT[a.type] || ''}</div>
                        </div>`).join('')}
                </div>
            </div>`;
        bindSliders(host);
        $('#dm-btn-add-gift').addEventListener('click', () => openGiftPicker({ kind: 'rule' }));
        host.querySelectorAll('.dm-gift-row').forEach(row => {
            const i = Number(row.dataset.idx), r = rules[i];
            row.querySelector('.dm-gift-count').addEventListener('change', (e) => { r.count = Math.max(1, Math.floor(Number(e.target.value) || 1)); e.target.value = r.count; schedulePersist(); });
            row.querySelector('.ctc-gift-on input').addEventListener('change', (e) => { r.enabled = e.target.checked; row.classList.toggle('off', !r.enabled); schedulePersist(); });
            row.querySelector('.dm-gift-swap').addEventListener('click', () => openGiftPicker({ kind: 'rule', idx: i }));
            row.querySelector('.dm-gift-del').addEventListener('click', () => { rules.splice(i, 1); renderGifts(); schedulePersist(); });
        });
        host.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
            actions.push(G.normalizeAction({ type: b.dataset.add }, actions.length));
            renderGifts(); schedulePersist();
        }));
        host.querySelectorAll('.dm-action').forEach(row => {
            const i = Number(row.dataset.idx), a = actions[i];
            row.querySelector('.dm-act-icon').addEventListener('change', (e) => { a.icon = e.target.value; schedulePersist(); });
            row.querySelector('.dm-act-name').addEventListener('change', (e) => { a.name = e.target.value.trim().slice(0, 60) || G.ACTION_PRESET[a.type].name; e.target.value = a.name; schedulePersist(); });
            row.querySelector('.dm-act-type').addEventListener('change', (e) => {
                const keepName = a.name === G.ACTION_PRESET[a.type].name, keepIcon = a.icon === G.ACTION_PRESET[a.type].icon;
                actions[i] = G.normalizeAction({ ...a, type: e.target.value, params: {}, name: keepName ? '' : a.name, icon: keepIcon ? '' : a.icon }, i);
                renderGifts(); schedulePersist();
            });
            row.querySelector('.dm-act-on').addEventListener('change', (e) => { a.enabled = e.target.checked; row.classList.toggle('off', !a.enabled); schedulePersist(); });
            row.querySelector('.dm-act-del').addEventListener('click', () => { if (confirm(`Xoá hành động "${a.name}"?`)) { actions.splice(i, 1); renderGifts(); schedulePersist(); } });
            row.querySelector('.dm-act-gift').addEventListener('click', () => openGiftPicker({ kind: 'action', idx: i }));
            row.querySelector('.dm-act-test').addEventListener('click', () => { sendTest(a.type, a.params); flashBtn(row.querySelector('.dm-act-test'), '✓ Đã gửi'); });
            const hk = row.querySelector('.dm-act-hotkey');
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

    // Gift picker modal — sao chép mẫu chemtraicay (.nd-gp-*); dùng cho cả quà ra muỗi lẫn quà hành động.
    let _pickerEl = null, _pickerTarget = null;
    async function openGiftPicker(target) {
        _pickerTarget = target;
        if (!Array.isArray(window.__giftSheet) || !window.__giftSheet.length) {
            try { const r = await fetch('/api/gifts'); if (r.ok) window.__giftSheet = (await r.json()).slice().sort((a, b) => (a.diamond || 0) - (b.diamond || 0)); } catch (e) {}
        }
        const el = ensurePicker();
        el.hidden = false;
        el.querySelector('.nd-gp-search').value = '';
        el.querySelector('.nd-gp-title').textContent = target.kind === 'action' ? `🛟 Chọn quà cho "${(cfg.actions[target.idx] || {}).name || 'hành động'}"` : (target.idx != null ? '↻ ĐỔI quà ra muỗi' : '🦟 Chọn quà ra muỗi');
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
            else { if (used.has(pick.giftId)) return; cfg.giftRules.push(Game().normalizeConfig({ giftRules: [{ ...pick, count: 10, enabled: true }] }).giftRules[0]); }
            renderGifts(); schedulePersist();
            _pickerEl.hidden = true; _pickerTarget = null;
        }));
    }

    // ---------- Tab 4: Hiển thị ----------
    function renderDisplay() {
        const host = $('#dm-display-pane'); if (!host) return;
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
                <h3>BẢNG ĐIỂM</h3>
                ${toggle('dm-showhud', 'Hiện bảng "Còn lại / Đã đập / Combo"', d.showHud)}
                ${row('hudXPercent', 'Vị trí ngang', 0, 100, 1, d.hudXPercent, '%')}
                ${row('hudYPercent', 'Vị trí dọc', 0, 100, 1, d.hudYPercent, '%')}
                ${row('hudScale', 'Cỡ chữ', 30, 300, 5, d.hudScale, '%')}
            </div>
            <div class="ctc-card">
                <h3>ÂM THANH</h3>
                ${toggle('dm-sound', 'Tiếng vo ve theo số muỗi + tiếng đập / xịt / vợt (tổng hợp, không cần file)', snd.enabled)}
                ${row('volume', 'Âm lượng', 0, 1, 0.05, snd.volume, '')}
                <div class="hint">Trong OBS, Browser Source phải bật "Control audio via OBS" hoặc để âm thanh phát ra máy nếu muốn nghe.</div>
            </div>
            <div class="ctc-card">
                <h3>NHẬN DIỆN</h3>
                <div class="ctc-row"><label>Chất lượng hình đưa vào AI</label>
                    <select id="dm-quality"><option value="low" ${cfg.quality === 'low' ? 'selected' : ''}>Nhẹ máy</option><option value="auto" ${cfg.quality === 'auto' ? 'selected' : ''}>Tự động</option><option value="high" ${cfg.quality === 'high' ? 'selected' : ''}>Nét (tốn CPU)</option></select>
                    <span></span><span class="unit"></span></div>
                <div class="hint">Nguồn camera lấy từ 🎥 Game Camera (dùng chung cho mọi game camera). Overlay trong OBS là link Game Camera; chọn "▶ Chơi game này" ở Đập Muỗi để OBS chuyển sang.</div>
            </div>`;
        $('#dm-showhud').addEventListener('change', (e) => { d.showHud = e.target.checked; schedulePersist(); });
        $('#dm-sound').addEventListener('change', (e) => { snd.enabled = e.target.checked; schedulePersist(); });
        $('#dm-quality').addEventListener('change', (e) => { cfg.quality = e.target.value; schedulePersist(); });
        host.querySelectorAll('.ctc-row[data-dkey]').forEach(r => {
            const key = r.dataset.dkey, range = r.querySelector('input[type=range]'), num = r.querySelector('input[type=number]');
            const apply = (v) => { const n = Number(v); if (!Number.isFinite(n)) return; if (key === 'volume') snd.volume = n; else d[key] = n; range.value = n; num.value = fmt(n); schedulePersist(); };
            range.addEventListener('input', () => apply(range.value));
            num.addEventListener('change', () => apply(num.value));
        });
    }

    window.HpDapMuoiPanel = { open };
})();
