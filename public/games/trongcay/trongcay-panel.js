/* HP Trồng Cây — app panel */
(function () {
    'use strict';
    let socket = null;
    let cfg = null;
    let liveState = null;
    let initialized = false;
    let currentTab = 'growth';
    let pendingSave = null;
    let popoutWindow = null;
    let giftPickerSearch = '';
    let giftPickerList = 'specificGifts';
    let pickerOpen = false;   // popup chọn quà (badge hiệu ứng + tìm + lưới quà) — chỉ hiện khi cần cho gọn
    let growthOpen = { health: false, pests: false };   // 2 card nâng cao ở tab Tăng trưởng — mặc định thu gọn
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
    const GIFT_ACTIONS = [
        { listKey: 'specificGifts', title: 'Tạo cây', icon: '🌱', valueKey: 'growth', valueLabel: 'Cao thêm %', defVal: 8, testAction: 'grow' },
        { listKey: 'waterGifts', title: 'Tưới nước', icon: '💧', valueKey: 'water', valueLabel: 'Nước +', defVal: 8, testAction: 'water' },
        { listKey: 'sunGifts', title: 'Nắng', icon: '☀️', valueKey: 'sun', valueLabel: 'Nắng +', defVal: 20, testAction: 'sun' },
        { listKey: 'cutGifts', title: 'Cắt cây', icon: '✂️', valueKey: 'cut', valueLabel: 'Cắt %', defVal: 12, testAction: 'cut' },
        { listKey: 'butterflyGifts', title: 'Thả bướm', icon: '🦋', valueKey: 'lifeSeconds', valueLabel: 'Sống giây', defVal: 45, testAction: 'butterfly' },
        { listKey: 'beeGifts', title: 'Ong mật', icon: '🐝', valueKey: 'bees', valueLabel: 'Số ong', defVal: 3, testAction: 'bee' },
        { listKey: 'caterpillarGifts', title: 'Thả sâu', icon: '🐛', valueKey: 'count', valueLabel: 'Số sâu', defVal: 2, testAction: 'caterpillar' },
        { listKey: 'sprayGifts', title: 'Phun thuốc', icon: '🧴', valueKey: 'protectSeconds', valueLabel: 'Bảo vệ giây', defVal: 30, testAction: 'spray' },
        { listKey: 'dragonGifts', title: 'Rồng lửa', icon: '🐉', valueKey: 'burnSeconds', valueLabel: 'Cháy đen giây', defVal: 10, testAction: 'dragon' }
    ];

    function open(sharedSocket) {
        socket = sharedSocket || window.io();
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        $('#view-trongcay')?.classList.add('active');
        if (!initialized) {
            initialized = true;
            bindShell();
            ensureSocketSubscribed();
        }
        currentTab = 'growth';
        document.querySelectorAll('#view-trongcay .tc-tab').forEach(x => x.classList.toggle('active', x.dataset.tcTab === currentTab));
        document.querySelectorAll('#view-trongcay .tc-pane').forEach(p => p.classList.toggle('active', p.dataset.tcPane === currentTab));
        loadAll().then(renderAll);
    }

    function toast(msg, kind) {
        if (typeof window.toast === 'function') window.toast(msg, kind || 'info', 2200);
    }
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }
    function giftSheet() {
        return Array.isArray(window.__giftSheet) ? window.__giftSheet : [];
    }
    function ensureArrays() {
        ['specificGifts','waterGifts','sunGifts','cutGifts','butterflyGifts','beeGifts','caterpillarGifts','sprayGifts','carnivorousGifts','dragonGifts'].forEach(k => { if (!Array.isArray(cfg[k])) cfg[k] = []; });
    }
    async function loadAll() {
        try {
            const r = await fetch('/api/games/trongcay/config');
            cfg = r.ok ? await r.json() : window.HpGame.trongcay.defaultConfig();
        } catch (e) { cfg = window.HpGame.trongcay.defaultConfig(); }
        const def = window.HpGame.trongcay.defaultConfig();
        cfg = Object.assign({}, def, cfg || {});
        cfg.display = Object.assign({}, def.display, cfg.display || {});
        ensureArrays();
        try {
            const r = await fetch('/api/games/trongcay/livestate');
            liveState = r.ok ? await r.json() : null;
        } catch (e) {}
    }
    function schedulePersist() {
        clearTimeout(pendingSave);
        pendingSave = setTimeout(() => persistConfig().catch(() => {}), 350);
    }
    async function persistConfig() {
        clearTimeout(pendingSave);
        const r = await fetch('/api/games/trongcay/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
        if (!r.ok) throw new Error('save_fail');
    }
    async function sendControl(body) {
        const r = await fetch('/api/games/trongcay/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.ok === false) throw new Error(j.error || 'control_fail');
        liveState = j.state || liveState;
        renderLive();
        return j;
    }
    function ensureSocketSubscribed() {
        if (!socket) return;
        socket.emit('subscribe', 'preview');
        if (socket.__tcAttached) return;
        socket.__tcAttached = true;
        socket.on('trongcay:state', s => {
            liveState = s;
            if (cfg && s && typeof s.sessionActive === 'boolean' && cfg.sessionActive !== s.sessionActive) {
                cfg.sessionActive = s.sessionActive;
                updateSessionBtn();
            }
            renderLive();
        });
        socket.on('gameConfig', ({ gameId, config }) => {
            if (gameId !== 'trongcay') return;
            const oldDisplay = cfg ? cfg.display : null;
            cfg = Object.assign({}, cfg || {}, config || {});
            if (oldDisplay && config?.display) {
                Object.keys(oldDisplay).forEach(k => delete oldDisplay[k]);
                Object.assign(oldDisplay, config.display);
                cfg.display = oldDisplay;
            }
            ensureArrays();
            renderAll();
        });
    }
    function bindShell() {
        document.querySelectorAll('#view-trongcay .tc-tab').forEach(t => {
            t.addEventListener('click', () => {
                currentTab = t.dataset.tcTab;
                document.querySelectorAll('#view-trongcay .tc-tab').forEach(x => x.classList.toggle('active', x === t));
                document.querySelectorAll('#view-trongcay .tc-pane').forEach(p => p.classList.toggle('active', p.dataset.tcPane === currentTab));
            });
        });
        $('#tc-cfg-enabled')?.addEventListener('change', e => { cfg.enabled = !!e.target.checked; schedulePersist(); });
        $('#tc-btn-copy')?.addEventListener('click', async () => {
            const url = window.buildOverlayURL ? window.buildOverlayURL('/overlay/trongcay') : (location.origin + '/overlay/trongcay');
            const ok = window.hpCopyText ? await window.hpCopyText(url) : false;
            toast(ok ? 'Đã copy link OBS' : ('Copy thất bại: ' + url), ok ? 'success' : 'warn');
        });
        $('#tc-btn-reload')?.addEventListener('click', () => { socket && socket.emit('overlay:reload', { gameId: 'trongcay' }); toast('Đã reload overlay', 'success'); });
        $('#tc-btn-popout-edit')?.addEventListener('click', () => openPopoutWindow(true));
        $('#tc-btn-reset')?.addEventListener('click', () => sendControl({ cmd: 'reset' }));
        $('#tc-btn-session')?.addEventListener('click', async () => {
            const cur = cfg.sessionActive !== false;
            await sendControl({ cmd: cur ? 'stop' : 'start' });
            cfg.sessionActive = !cur;
            updateSessionBtn();
        });
        $('#tc-btn-save')?.addEventListener('click', async () => { await persistConfig(); toast('Đã lưu Trồng Cây', 'success'); });
    }
    function openPopoutWindow(editMode) {
        const url = '/overlay/trongcay' + (editMode ? '?edit=1' : '');
        if (popoutWindow && !popoutWindow.closed) { popoutWindow.location.href = url; popoutWindow.focus(); return; }
        popoutWindow = window.open(url, 'hp-tc-popout', 'popup=yes,resizable=yes,scrollbars=no,width=540,height=960,left=220,top=80');
    }
    function updateSessionBtn() {
        const btn = $('#tc-btn-session');
        const st = $('#tc-session-status');
        if (!btn || !cfg) return;
        const active = cfg.sessionActive !== false;
        btn.textContent = active ? '⏸ KẾT THÚC' : '▶ BẮT ĐẦU';
        btn.className = active ? 'danger small' : 'primary small';
        if (st) { st.textContent = active ? '● Đang chạy' : '⏸ Đã dừng'; st.className = 'nd-session-status ' + (active ? 'active' : 'stopped'); }
    }

    function renderAll() {
        if (!cfg) return;
        const en = $('#tc-cfg-enabled'); if (en) en.checked = cfg.enabled !== false;
        updateSessionBtn();
        renderGrowth();
        renderGifts();
        renderDisplay();
        renderLive();
    }
    const GROWTH_MODES = [
        { value: 'perCoin', icon: '🪙', title: 'Theo xu quà', desc: 'Cây cao theo tổng xu (KC) của quà — quà to cây vọt nhanh.' },
        { value: 'perGift', icon: '🎁', title: 'Mỗi quà', desc: 'Mỗi quà bất kỳ cộng một mức cố định, không phân biệt giá trị.' },
        { value: 'specificGifts', icon: '🌱', title: 'Chỉ quà chỉ định', desc: 'Chỉ những quà bạn gán ở tab “Quà đặc biệt” mới làm cây cao.' }
    ];
    function renderGrowth() {
        const host = $('#tc-growth-pane');
        if (!host) return;
        const mode = cfg.growthMode || 'perCoin';
        const activeMode = GROWTH_MODES.find(m => m.value === mode) || GROWTH_MODES[0];
        let modeField = '';
        if (mode === 'perCoin') modeField = numRow('Độ nhạy theo xu', 'perCoinGrowth', cfg.perCoinGrowth, 0, 3, .05, '× xu');
        else if (mode === 'perGift') modeField = numRow('Mỗi quà cao thêm', 'perGiftGrowth', cfg.perGiftGrowth, 0, 25, .5, '%');
        else modeField = `<div class="nd-help" style="padding:8px 0">⤵ Vào tab <b>🎁 Quà đặc biệt</b> để chọn quà làm cây cao.</div>`;
        host.innerHTML = `
            <div class="nd-card"><div class="nd-card-title">🌱 Cách cây cao lên</div>
                <div class="tc-mode-grid">
                    ${GROWTH_MODES.map(m => `<label class="tc-mode-card ${m.value === mode ? 'active' : ''}">
                        <input type="radio" name="tc-growth-mode" value="${m.value}" ${m.value === mode ? 'checked' : ''}>
                        <span class="tc-mode-ico">${m.icon}</span>
                        <b>${escapeHtml(m.title)}</b>
                        <small>${escapeHtml(m.desc)}</small>
                    </label>`).join('')}
                </div>
                <div class="tc-fieldset">
                    ${modeField}
                    ${numRow('Chiều cao ban đầu', 'initialHeight', cfg.initialHeight, 0, 100, 1, '%')}
                </div>
            </div>
            <details class="nd-card tc-collapse" data-growth-card="health" ${growthOpen.health ? 'open' : ''}><summary class="nd-card-title">💧 Sức khỏe cây (nước &amp; héo)</summary>
                <div class="nd-help">Không tưới → cây mất nước rồi héo dần. Tưới lại sẽ hồi héo. Số càng lớn cây càng “khó tính”.</div>
                <div class="tc-fieldset">
                    ${numRow('Mất nước / giây', 'waterLossPerSecond', cfg.waterLossPerSecond, 0, 3, .05, '/ s')}
                    ${numRow('Tốc độ héo / giây', 'wiltGainPerSecond', cfg.wiltGainPerSecond, 0, 4, .05, '/ s')}
                    ${numRow('Tốc độ hồi héo / giây', 'wiltRecoverPerSecond', cfg.wiltRecoverPerSecond, 0, 4, .05, '/ s')}
                    ${numRow('Trái rụng khi héo ≥', 'fruitDropWilt', cfg.fruitDropWilt == null ? 55 : cfg.fruitDropWilt, 0, 100, 1, 'héo')}
                </div>
                <div class="nd-help">🍎 Cây héo tới mức trên → trái chín rụng xuống đất. Ong vẫn nhặt trái dưới đất được (cộng điểm cho chủ cây).</div>
            </details>
            <details class="nd-card tc-collapse" data-growth-card="pests" ${growthOpen.pests ? 'open' : ''}><summary class="nd-card-title">🐛 Tỉ lệ sâu phá cây</summary>
                <div class="nd-help">Sâu xanh ăn lá làm cây thấp dần. Thấy phá nhiều → GIẢM “Ăn mỗi lần” hoặc TĂNG “Nhịp ăn” (sâu ăn chậm lại). Giảm “Sâu sống” để sâu sớm bỏ đi.</div>
                <div class="tc-fieldset">
                    ${numRow('Chờ rồi mới phá', 'caterpillarStartDelaySec', cfg.caterpillarStartDelaySec == null ? 3 : cfg.caterpillarStartDelaySec, 0, 30, .5, 's')}
                    ${numRow('Ăn mỗi lần (% chiều cao)', 'caterpillarBite', cfg.caterpillarBite == null ? 3 : cfg.caterpillarBite, 0, 30, .5, '%')}
                    ${numRow('Nhịp ăn (giây / lần)', 'caterpillarBiteEverySec', cfg.caterpillarBiteEverySec == null ? 1.6 : cfg.caterpillarBiteEverySec, 0.4, 8, .1, 's')}
                    ${numRow('Sâu sống tối đa', 'caterpillarLifeSeconds', cfg.caterpillarLifeSeconds == null ? 75 : cfg.caterpillarLifeSeconds, 5, 300, 5, 's')}
                </div>
                <div class="nd-help">🐛 Sâu xuất hiện xong sẽ chờ “Chờ rồi mới phá” giây mới bắt đầu ăn → kịp xịt thuốc cứu cây.</div>
            </details>`;
        $$('input[name="tc-growth-mode"]', host).forEach(r => r.addEventListener('change', e => { cfg.growthMode = e.target.value; schedulePersist(); renderGrowth(); }));
        $$('details[data-growth-card]', host).forEach(d => d.addEventListener('toggle', () => { growthOpen[d.dataset.growthCard] = d.open; }));
        bindNumberInputs(host);
    }
    function numRow(label, key, val, min, max, step, suffix) {
        return `<div class="nd-field"><label>${label}</label><input data-key="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${escapeHtml(val)}"><span>${suffix || ''}</span></div>`;
    }
    function bindNumberInputs(host) {
        $$('input[data-key]', host).forEach(inp => inp.addEventListener('input', e => {
            const key = e.target.dataset.key;
            cfg[key] = Number(e.target.value);
            schedulePersist();
        }));
    }
    function renderGifts() {
        const host = $('#tc-gifts-pane');
        if (!host) return;
        const action = currentGiftAction();
        host.innerHTML = `
            <div class="nd-card"><div class="nd-card-title">🎁 Gán quà cho hiệu ứng</div>
                <div class="nd-help">Bấm <b>➕ Thêm quà</b> để mở bảng chọn quà cho từng hiệu ứng. Bấm icon quà ở dưới để đổi quà. Chỉnh số ngay trên từng dòng.</div>
                <div class="tc-gift-actions-row">
                    <button class="primary small tc-add-gift" data-open-picker>➕ Thêm quà cho hiệu ứng</button>
                    <button class="ghost small tc-auto-badge" data-auto-badge title="Tự đẩy toàn bộ quà đã gán sang “🏷 Badge hiệu ứng quà” của Hũ Thủy Tinh — vào danh sách Badge thủ công bổ sung (có tick hiện / nút xoá riêng).">🏷 Auto → Badge Hũ Thủy Tinh</button>
                </div>
                <div class="tc-assigned-title">🔖 Quà đã gán <span class="tc-assigned-count">${assignedTotalCount()}</span></div>
                <div class="tc-assigned-groups">${assignedGroupsHtml()}</div>
            </div>
            ${pickerOpen ? pickerModalHtml(action) : ''}`;
        // Mở / đóng popup chọn quà
        $('[data-open-picker]', host)?.addEventListener('click', () => { pickerOpen = true; renderGifts(); });
        $('[data-auto-badge]', host)?.addEventListener('click', exportToThuytinhBadges);
        $$('[data-close-picker]', host).forEach(b => b.addEventListener('click', () => { pickerOpen = false; renderGifts(); }));
        $('[data-picker-backdrop]', host)?.addEventListener('click', e => { if (e.target === e.currentTarget) { pickerOpen = false; renderGifts(); } });
        // Bấm icon quà ở 1 dòng → mở popup đúng hiệu ứng đó để đổi/thêm quà
        $$('[data-edit-effect]', host).forEach(b => b.addEventListener('click', () => { giftPickerList = b.dataset.editEffect; pickerOpen = true; renderGifts(); }));
        // (trong popup) tìm quà + đổi nhóm hiệu ứng + chọn quà
        $('[data-tc-gift-search]', host)?.addEventListener('input', e => {
            giftPickerSearch = e.target.value;
            renderGiftGrid(host);
        });
        $$('[data-action-list]', host).forEach(btn => btn.addEventListener('click', () => {
            giftPickerList = btn.dataset.actionList;
            renderGifts();
        }));
        bindGiftGrid(host);
        // Chỉnh số ngay trên dòng (inline) — KHÔNG render lại để giữ con trỏ trong ô.
        $$('[data-row-val]', host).forEach(inp => inp.addEventListener('input', e => {
            const list = cfg[e.target.dataset.list] || [];
            const item = list.find(x => String(x.giftId) === String(e.target.dataset.gift));
            if (item) { item[e.target.dataset.key] = Number(e.target.value) || 0; schedulePersist(); }
        }));
        $$('[data-tc-key]', host).forEach(inp => inp.addEventListener('input', e => {
            const key = e.target.dataset.tcKey;
            cfg[key] = e.target.type === 'checkbox' ? !!e.target.checked : (e.target.type === 'number' ? Number(e.target.value) : e.target.value);
            schedulePersist();
        }));
        $$('[data-del-list]', host).forEach(btn => btn.addEventListener('click', () => {
            const list = cfg[btn.dataset.delList] || [];
            list.splice(Number(btn.dataset.idx), 1);
            schedulePersist(); renderGifts();
        }));
        $$('[data-test-list]', host).forEach(btn => btn.addEventListener('click', async () => {
            const list = cfg[btn.dataset.testList] || [];
            const g = list[Number(btn.dataset.testIdx)];
            if (!g) return;
            btn.disabled = true;
            const old = btn.textContent;
            btn.textContent = '⏳';
            try {
                await sendControl({
                    cmd: 'testgift',
                    action: btn.dataset.testAction,
                    ...g,                 // truyền ĐÚNG số đã chốt (count/bees/protectSeconds/lifeSeconds…) → chạy thử khớp số thật
                    giftName: g.giftName || '',
                    giftImage: g.giftImage || '',
                    coinValue: 40
                });
                toast('Đã chạy thử: ' + (g.giftName || g.giftId), 'success');
            } catch (e) {
                toast('Lỗi chạy thử: ' + e.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = old;
            }
        }));
    }
    function currentGiftAction() {
        return GIFT_ACTIONS.find(a => a.listKey === giftPickerList) || GIFT_ACTIONS[0];
    }
    function giftId(g) {
        return String(g?.id ?? g?.giftId ?? '');
    }
    function giftName(g) {
        const id = giftId(g);
        return g?.name || g?.giftName || (id ? ('Gift ' + id) : 'Gift');
    }
    function giftImage(g) {
        return g?.image || g?.giftImage || '';
    }
    function giftDiamond(g) {
        return Number(g?.diamond ?? g?.coin ?? g?.cost ?? 0) || 0;
    }
    function findGift(id) {
        const sid = String(id || '');
        return giftSheet().find(g => giftId(g) === sid) || null;
    }
    function filteredGifts() {
        const q = giftPickerSearch.trim().toLowerCase();
        const gifts = giftSheet();
        if (!q) return gifts.slice(0, 80);
        return gifts.filter(g => {
            const hay = `${giftName(g)} ${giftId(g)} ${giftDiamond(g)}`.toLowerCase();
            return hay.includes(q);
        }).slice(0, 80);
    }
    function giftGridCountText() {
        const total = giftSheet().length;
        const shown = filteredGifts().length;
        if (!total) return 'Chưa có gift sheet';
        return `Hiện ${shown}/${total}`;
    }
    function assignedIconsForGift(id) {
        const sid = String(id || '');
        return GIFT_ACTIONS.filter(a => (cfg[a.listKey] || []).some(x => String(x.giftId) === sid)).map(a => a.icon).join('');
    }
    // Popup chọn quà: badge hiệu ứng + tìm + lưới quà (toàn bộ phần "cồng kềnh" dồn vào đây cho gọn panel)
    function pickerModalHtml(action) {
        return `<div class="tc-picker-backdrop" data-picker-backdrop>
            <div class="tc-picker">
                <div class="tc-picker-head">
                    <b>🎁 Chọn quà cho hiệu ứng</b>
                    <button class="tc-picker-close" data-close-picker title="Đóng">✕</button>
                </div>
                <div class="tc-badge-strip">
                    ${GIFT_ACTIONS.map(a => {
                        const n = (cfg[a.listKey] || []).length;
                        return `<button type="button" class="tc-badge ${a.listKey === action.listKey ? 'active' : ''}" data-action-list="${a.listKey}" title="${escapeHtml(a.title)}">
                            <span class="tc-badge-ico">${a.icon}</span><span class="tc-badge-txt">${escapeHtml(a.title)}</span>${n ? `<span class="tc-badge-num">${n}</span>` : ''}
                        </button>`;
                    }).join('')}
                </div>
                <div class="tc-gift-tools">
                    <input data-tc-gift-search type="text" value="${escapeHtml(giftPickerSearch)}" placeholder="Tìm quà cho “${escapeHtml(action.icon + ' ' + action.title)}”: tên, ID, số KC...">
                    <span id="tc-gift-count">${giftGridCountText()}</span>
                </div>
                <div id="tc-gift-grid" class="tc-gift-grid">${giftGridHtml()}</div>
                <div class="tc-picker-foot">
                    <span class="nd-help">Bấm quà để gán/bỏ cho “${escapeHtml(action.icon + ' ' + action.title)}”. ✓ = đã gán.</span>
                    <button class="primary small" data-close-picker>Xong</button>
                </div>
            </div>
        </div>`;
    }
    function giftGridHtml() {
        const items = filteredGifts();
        if (!giftSheet().length) return '<div class="tc-gift-empty">Chưa tải được gift sheet. Hãy mở danh sách quà hoặc kết nối LIVE để app có dữ liệu quà.</div>';
        if (!items.length) return '<div class="tc-gift-empty">Không tìm thấy quà phù hợp.</div>';
        const curList = cfg[currentGiftAction().listKey] || [];
        return items.map(g => {
            const id = giftId(g);
            const badges = assignedIconsForGift(id);
            const inCur = curList.some(x => String(x.giftId) === id);
            return `<button type="button" class="tc-gift-card ${inCur ? 'in-current' : ''} ${badges ? 'assigned' : ''}" data-pick-gift="${escapeHtml(id)}" title="${escapeHtml(giftName(g))}">
                ${badges ? `<span class="tc-gift-badges">${escapeHtml(badges)}</span>` : ''}
                ${inCur ? '<span class="tc-gift-check">✓</span>' : ''}
                <img src="${escapeHtml(giftImage(g))}" onerror="this.style.display='none'">
                <b>${escapeHtml(giftName(g))}</b>
                <span>${escapeHtml(giftDiamond(g))} KC</span>
            </button>`;
        }).join('');
    }
    function renderGiftGrid(host) {
        const grid = $('#tc-gift-grid', host);
        const count = $('#tc-gift-count', host);
        if (grid) grid.innerHTML = giftGridHtml();
        if (count) count.textContent = giftGridCountText();
        bindGiftGrid(host);
    }
    function bindGiftGrid(host) {
        $$('[data-pick-gift]', host).forEach(btn => btn.addEventListener('click', () => {
            toggleGiftInAction(currentGiftAction(), btn.dataset.pickGift);
        }));
    }
    // Bấm icon quà = bật/tắt gán cho hiệu ứng đang chọn. Thêm mới dùng số mặc định, chỉnh số ở dòng "Quà đã gán".
    function toggleGiftInAction(action, id) {
        const gift = findGift(id);
        if (!gift) return toast('Chưa có gift sheet — mở danh sách quà hoặc kết nối LIVE', 'warn');
        const list = cfg[action.listKey] = (cfg[action.listKey] || []);
        const idx = list.findIndex(x => String(x.giftId) === String(id));
        if (idx >= 0) {
            list.splice(idx, 1);
        } else {
            const item = { giftId: giftId(gift), giftName: giftName(gift), giftImage: giftImage(gift) };
            item[action.valueKey] = action.defVal;
            list.push(item);
        }
        schedulePersist();
        renderGifts();
    }
    function assignedTotalCount() {
        return GIFT_ACTIONS.reduce((n, a) => n + (cfg[a.listKey] || []).length, 0);
    }
    // 🏷 Auto: đẩy quà đã gán ở Trồng Cây → danh sách "Badge thủ công bổ sung" của Hũ Thủy Tinh
    //    (config.badges.extras). Dạng mục giống badge thủ công → tự có tick hiện + nút xoá.
    //    Merge theo giftId: chỉ thêm quà CHƯA có, giữ nguyên mục cũ (kể cả trạng thái tick).
    async function exportToThuytinhBadges(ev) {
        const btn = ev && ev.currentTarget;
        // Gom theo giftId; mỗi quà kèm danh sách hiệu ứng (icon + tên) để đặt làm NHÃN badge.
        const byGift = new Map();
        GIFT_ACTIONS.forEach(a => (cfg[a.listKey] || []).forEach(g => {
            const id = String(g.giftId || '');
            if (!id) return;
            if (!byGift.has(id)) byGift.set(id, { id, name: g.giftName || ('Gift ' + id), image: g.giftImage || '', labels: [] });
            byGift.get(id).labels.push(`${a.icon} ${a.title}`);
        }));
        const gifts = [...byGift.values()];
        if (!gifts.length) return toast('Chưa gán quà nào để đẩy sang Badge', 'warn');
        if (btn) { btn.disabled = true; var old = btn.textContent; btn.textContent = '⏳ Đang đẩy...'; }
        try {
            const r = await fetch('/api/games/thuytinh/config');
            if (!r.ok) throw new Error('Không đọc được cấu hình Hũ Thủy Tinh');
            const tcfg = await r.json();
            tcfg.badges = tcfg.badges || {};
            const extras = Array.isArray(tcfg.badges.extras) ? tcfg.badges.extras : [];
            const have = new Set(extras.map(e => String(e.id)));
            let added = 0;
            for (const g of gifts) {
                if (have.has(g.id)) continue;
                extras.push({ id: g.id, name: g.name, image: g.image, customLabel: g.labels.join(' · '), enabled: true });
                have.add(g.id); added++;
            }
            tcfg.badges.extras = extras;
            const sr = await fetch('/api/games/thuytinh/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tcfg) });
            if (!sr.ok) throw new Error('Lưu Badge thất bại');
            toast(added ? `✓ Đã đẩy ${added} quà sang Badge (đặt tên theo hiệu ứng)` : 'Tất cả quà đã có sẵn trong Badge rồi', added ? 'success' : 'info');
        } catch (e) {
            toast('Lỗi Auto Badge: ' + e.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = old; }
        }
    }
    function giftIconCell(image, name, cls) {
        const nm = name || '';
        return image
            ? `<img class="${cls}" src="${escapeHtml(image)}" alt="${escapeHtml(nm)}" title="${escapeHtml(nm)}" onerror="this.classList.add('tc-ico-broken')">`
            : `<span class="${cls} tc-ico-text" title="${escapeHtml(nm)}">${escapeHtml(nm)}</span>`;
    }
    // Mỗi quà đã gán = đúng 1 hàng gọn. Cụm 💬 Comment tự tưới được nhét NGAY TRÊN CÙNG HÀNG
    // với quà Tưới nước đầu tiên (không tách card/dòng riêng). Nếu chưa gán quà tưới nào thì
    // hiện 1 dòng gọn để vẫn cấu hình được — comment-tưới chạy độc lập với quà.
    function assignedGroupsHtml() {
        const blocks = [];
        GIFT_ACTIONS.forEach(a => {
            const list = cfg[a.listKey] || [];
            list.forEach((g, i) => {
                const nm = g.giftName || ('Gift ' + g.giftId);
                const cmt = (a.listKey === 'waterGifts' && i === 0) ? commentInlineHtml() : '';
                blocks.push(`<div class="tc-row" title="${escapeHtml(nm)}">
                    <button type="button" class="tc-row-iconbtn" data-edit-effect="${a.listKey}" title="Đổi quà cho ${escapeHtml(a.title)}">${giftIconCell(g.giftImage, nm, 'tc-row-ico')}</button>
                    <span class="tc-row-chip">${a.icon} ${escapeHtml(a.title)}</span>
                    <label class="tc-row-val"><span>${escapeHtml(a.valueLabel)}</span><input type="number" step="1" data-row-val data-list="${a.listKey}" data-key="${a.valueKey}" data-gift="${escapeHtml(g.giftId)}" value="${escapeHtml(g[a.valueKey] ?? a.defVal)}"></label>
                    ${cmt}
                    <button class="tc-test-btn" data-test-list="${a.listKey}" data-test-action="${a.testAction}" data-test-idx="${i}" title="Chạy thử hiệu ứng quà này lên overlay">▶ Thử</button>
                    <button class="danger tiny" data-del-list="${a.listKey}" data-idx="${i}" title="Bỏ gán ${escapeHtml(nm)}">✕</button>
                </div>`);
            });
            if (a.listKey === 'waterGifts' && !list.length) {
                blocks.push(`<div class="tc-row tc-row--cmt">
                    <span class="tc-row-cmtico">💧</span>
                    <span class="tc-row-chip">💧 Tưới nước</span>
                    ${commentInlineHtml()}
                </div>`);
            }
        });
        const hasAny = GIFT_ACTIONS.some(a => (cfg[a.listKey] || []).length);
        const lead = hasAny ? '' : '<div class="nd-help" style="padding:4px 0 8px">Chưa gán quà nào. Bấm “➕ Thêm quà” để chọn quà cho hiệu ứng.</div>';
        return `<div class="tc-assigned-list">${lead}${blocks.join('')}</div>`;
    }
    // 💬 Cụm "Comment tự tưới" gọn dạng pill — nằm cùng hàng với Tưới nước.
    function commentInlineHtml() {
        const kw = cfg.waterCommentKeyword || 'tuoicay';
        const amt = cfg.waterCommentAmount ?? 6;
        const cd = cfg.waterCommentCooldownSeconds ?? 8;
        const on = cfg.waterCommentAutoWater !== false;
        return `<span class="tc-cmt-inline ${on ? '' : 'off'}" title="Comment chứa “${escapeHtml(kw)}” → vườn +${escapeHtml(amt)} nước. Mỗi người tưới lại sau ${escapeHtml(cd)} giây (chống spam/lag). Chỉ chạy khi phiên đang BẮT ĐẦU.">
            <label class="tc-cmt-chk" title="Bật/tắt comment tự tưới"><input data-tc-key="waterCommentAutoWater" type="checkbox" ${on ? 'checked' : ''}>💬</label>
            <input class="tc-cmt-kw" data-tc-key="waterCommentKeyword" type="text" value="${escapeHtml(kw)}" placeholder="tuoicay" title="Từ khóa comment">
            <span class="tc-cmt-lbl">Nước +</span><input class="tc-cmt-n" data-tc-key="waterCommentAmount" type="number" min="1" max="100" step="1" value="${escapeHtml(amt)}" title="Nước cộng mỗi comment">
            <span class="tc-cmt-lbl">Chống spam</span><input class="tc-cmt-n" data-tc-key="waterCommentCooldownSeconds" type="number" min="1" max="120" step="1" value="${escapeHtml(cd)}" title="Giây/người"><span class="tc-cmt-lbl">s</span>
        </span>`;
    }
    function renderDisplay() {
        const host = $('#tc-display-pane');
        if (!host) return;
        const d = cfg.display;
        host.innerHTML = `<div class="nd-card"><div class="nd-card-title">🎨 Hiển thị overlay</div>
            ${displayNum('Vị trí ngang', 'gardenXPercent', d.gardenXPercent, 0, 100, 1, '%')}
            ${displayNum('Vị trí dọc', 'gardenYPercent', d.gardenYPercent, 0, 100, 1, '%')}
            ${displayNum('Scale', 'scale', d.scale, 35, 220, 5, '%')}
            ${displayNum('Số thân cây', 'stemCount', d.stemCount, 1, 12, 1, '')}
            ${checkRow('Hiện bảng chỉ số', 'showStatus', d.showStatus !== false)}
            ${checkRow('Hiện tên trên bướm', 'showNames', d.showNames !== false)}
            ${checkRow('Hiện bướm avatar', 'showButterflies', d.showButterflies !== false)}
            ${checkRow('🐝 Hiện ong hái trái', 'showBees', d.showBees !== false)}
            ${checkRow('🐛 Hiện sâu ăn lá & xác sâu', 'showCaterpillars', d.showCaterpillars !== false)}
            ${checkRow('Hiện hoa icon quà', 'showFlowers', d.showFlowers !== false)}
            ${checkRow('🐉 Hiện rồng lửa thiêu vườn', 'showDragon', d.showDragon !== false)}
            ${checkRow('🏆 Hiện Top người chăm cây', 'showLeaderboard', d.showLeaderboard !== false)}
            ${checkRow('🎯 Ăn mừng khi đạt mốc 25/50/75/100% & khi cây kết trái', 'showMilestones', d.showMilestones !== false)}
            ${checkRow('🔊 Âm thanh hiệu ứng', 'soundEnabled', d.soundEnabled !== false)}
        </div>`;
        $$('input[data-dkey]', host).forEach(inp => inp.addEventListener('input', e => {
            const key = e.target.dataset.dkey;
            const v = Number(e.target.value);
            d[key] = v;
            const span = host.querySelector('span[data-dval="' + key + '"]');
            if (span) span.textContent = Math.round(v) + (span.dataset.dsuffix || '');
            schedulePersist();
        }));
        $$('input[data-ckey]', host).forEach(inp => inp.addEventListener('change', e => { d[e.target.dataset.ckey] = !!e.target.checked; schedulePersist(); }));
    }
    function displayNum(label, key, val, min, max, step, suffix) {
        const shown = Math.round(Number(val) || 0);   // làm tròn % hiển thị (vị trí kéo từ overlay có thể là số lẻ dài)
        const sfx = suffix || '';
        return `<div class="nd-field"><label>${label}</label><input data-dkey="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${escapeHtml(val)}"><span data-dval="${key}" data-dsuffix="${escapeHtml(sfx)}">${shown}${escapeHtml(sfx)}</span></div>`;
    }
    function checkRow(label, key, checked) {
        return `<label class="toggle-row"><input data-ckey="${key}" type="checkbox" ${checked ? 'checked' : ''}><span>${label}</span></label>`;
    }
    function renderLive() {
        const host = $('#tc-live-pane');
        if (!host) return;
        const s = liveState || {};
        host.innerHTML = `<div class="nd-card"><div class="nd-card-title">🎮 Live & Test</div>
            <div class="nd-live-grid">
                ${stat('Cao', s.height)}${stat('Nước', s.water)}${stat('Nắng', s.sun)}${stat('Héo', s.wilt)}${stat('Hoa', (s.flowers || []).length)}
            </div>
            <div class="nd-row" style="margin-top:12px;gap:8px;flex-wrap:wrap">
                <button class="primary small" data-cmd="testgift">🎲 Test live quà ngẫu nhiên</button>
                <button class="ghost small" data-cmd="water">💧 Tưới nước</button>
                <button class="ghost small" data-cmd="sun">☀ Nắng mạnh</button>
                <button class="danger small" data-cmd="cut">✂ Cắt cây</button>
                <button class="ghost small" data-cmd="grow">🌱 Cao lên</button>
            </div>
        </div>`;
        $$('[data-cmd]', host).forEach(btn => btn.addEventListener('click', async () => {
            try { await sendControl({ cmd: btn.dataset.cmd }); }
            catch (e) { toast('Lỗi test: ' + e.message, 'error'); }
        }));
    }
    function stat(label, val) {
        return `<div class="nd-live-stat"><b>${escapeHtml(val == null ? 0 : Math.round(Number(val) * 10) / 10)}</b><span>${label}</span></div>`;
    }

    window.HpTrongCayPanel = { open };
})();
