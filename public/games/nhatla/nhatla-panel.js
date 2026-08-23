/* HP Nhặt Lá — app panel */
(function () {
    'use strict';
    const game = window.HpGame.nhatla;
    let socket = null;
    let cfg = null;
    let initialized = false;
    let currentTab = 'display';
    let saveTimer = null;
    let giftPickerEl = null;
    let pickerTarget = null;
    let editingEffectId = null;
    let hotkeysBound = false;
    let topList = [];
    let rescueModalEl = null;
    let rescueModalIndex = null;
    let skinCatalog = { hat: [], thung: [] };
    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
    const esc = value => String(value == null ? '' : value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

    function root() { return $('#view-nhatla'); }

    function overlayUrl() {
        return window.buildOverlayURL ? window.buildOverlayURL('/overlay/nhatla') : `${location.origin}/overlay/nhatla`;
    }

    async function copyOverlayUrl() {
        const url = overlayUrl();
        const ok = window.hpCopyText ? await window.hpCopyText(url) : false;
        const button = $('#nl-btn-copy');
        if (!button) return ok;
        const old = button.dataset.label || button.textContent;
        button.dataset.label = old;
        button.textContent = ok ? '✓ Đã copy' : 'Copy thất bại';
        setTimeout(() => { if (button.isConnected) button.textContent = old; }, 1400);
        return ok;
    }

    function save(immediate) {
        clearTimeout(saveTimer);
        const commit = () => fetch('/api/games/nhatla/config', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg)
        }).then(response => response.json()).then(data => {
            if (data?.config) cfg = game.normalizeConfig(data.config);
        }).catch(() => {});
        if (immediate) return commit();
        saveTimer = setTimeout(commit, 260);
    }

    function setTab(tab) {
        currentTab = tab;
        $$('.nl-tab', root()).forEach(button => button.classList.toggle('active', button.dataset.nlTab === tab));
        $$('.nl-pane', root()).forEach(pane => pane.classList.toggle('active', pane.dataset.nlPane === tab));
    }

    // Trần của thanh "Dọc" đổi theo cỡ thùng (thùng to hơn thì phải đứng cao hơn mới
    // chỉ thò 1/3). Làm tròn XUỐNG để thanh trượt không bao giờ đẩy ra quá trần thật
    // rồi bị overlay kẹp ngược — số trên panel và thùng trên màn luôn khớp nhau.
    function binYSliderMax() {
        return Math.floor(game.binYMaxPercent(cfg.display.binScale));
    }

    function syncBinYMax() {
        const input = $('[data-display-range="binYPercent"]', $('#nl-display-pane'));
        if (!input) return;
        const max = binYSliderMax();
        input.max = max;
        if (Number(input.value) > max) {
            input.value = max;
            cfg.display.binYPercent = max;
            input.nextElementSibling.textContent = max + '%';
        }
    }

    function rangeRow(label, key, min, max, suffix, help) {
        const value = Math.round(Number(cfg.display[key]) || 100);
        return `<label class="nhatla-range-row"><span><b>${label}</b><small>${help || ''}</small></span><input type="range" min="${min}" max="${max}" value="${value}" data-display-range="${key}"><output>${value}${suffix}</output></label>`;
    }

    async function loadSkinCatalog() {
        try {
            const data = await (await fetch('/api/nhatla/skins', { cache: 'no-store' })).json();
            skinCatalog = { hat: data.hat || [], thung: data.thung || [] };
        } catch (e) {
            // Danh mục rỗng thì skinPicker() không vẽ thẻ nào — panel vẫn dùng được đủ các
            // mục còn lại thay vì hiện một ô chọn trống rỗng.
        }
    }

    // Ảnh đại diện một bộ = khung đầu tiên, ảnh trong bộ luôn đánh số 01, 02, …
    function skinThumb(skin) {
        return `${skin.dir}/01.${skin.ext || 'png'}`;
    }

    // Dòng chú thích dưới tên bộ. skin.json còn cờ lowRes nhưng cố tình không hiện ở đây:
    // ảnh gốc nhỏ hơn cỡ hiển thị là đánh đổi đã chọn để nhẹ máy, mờ một chút chấp nhận
    // được — nhắc mãi chỉ thành nhiễu. Ai làm bộ ảnh mới vẫn thấy cảnh báo đó khi chạy
    // tools/build-nhatla-skins.py.
    function skinNote(skin) {
        if (skin.kind === 'hat') return `<em>${skin.count} ảnh · cỡ chuẩn ${skin.baseSize}px</em>`;
        return '<em>chớp sáng tự động khi bỏ lá</em>';
    }

    function skinPicker(kind, key, title, help) {
        const list = skinCatalog[kind] || [];
        if (!list.length) return '';
        const current = cfg.display[key];
        return `
            <div class="nhatla-card">
                <h3>${title}</h3>
                <p class="nhatla-muted">${help}</p>
                <div class="nhatla-skin-grid" data-skin-key="${key}">
                    ${list.map(skin => `
                        <button class="nhatla-skin${skin.id === current ? ' selected' : ''}" data-skin-id="${esc(skin.id)}">
                            <img src="${esc(skinThumb(skin))}" alt="" loading="lazy">
                            <b>${esc(skin.name || skin.id)}</b>
                            ${skinNote(skin)}
                        </button>`).join('')}
                </div>
            </div>`;
    }

    function renderDisplay() {
        $('#nl-display-pane').innerHTML = `
            ${skinPicker('hat', 'hatSkin', '🍂 Bộ ảnh rơi', 'Đổi bộ là đổi luôn đống đang có trên màn hình. Mỗi bộ tự mang cỡ chuẩn riêng nên tuyết vẫn nhỏ hơn lá khi để cùng một mức Kích thước.')}
            ${skinPicker('thung', 'binSkin', '🗑 Bộ ảnh thùng rác', 'Chọn độc lập với bộ ảnh rơi — tuyết đi với thùng Ông già Noel cũng được.')}
            <div class="nhatla-card">
                <h3>🎨 Kích thước vật thể</h3>
                ${rangeRow('Lá khô', 'leafScale', 30, 400, '%', 'Kích thước toàn bộ lá rơi')}
                ${rangeRow('Bàn tay chuột', 'handScale', 30, 400, '%', 'Tay mở / tay nắm khi kéo')}
                ${rangeRow('Thùng rác', 'binScale', 30, 400, '%', 'Thùng rác kéo được ngay trên overlay')}
            </div>
            <div class="nhatla-card">
                <h3>🗑 Vị trí thùng rác mặc định</h3>
                ${rangeRow('Ngang', 'binXPercent', 5, 95, '%', 'Có thể kéo trực tiếp trong Review hoặc cửa sổ Overlay')}
                ${rangeRow('Dọc', 'binYPercent', 5, binYSliderMax(), '%', 'Tính theo tâm thùng — kéo hết cỡ là thùng hạ xuống thò 1/3 dưới mép, hớt được hàng lá sát đáy')}
                <label class="toggle-row nhatla-toggle"><input id="nl-show-hud" type="checkbox" ${cfg.display.showHud !== false ? 'checked' : ''}><span>Hiện Tổng số lá</span></label>
            </div>
            <div class="nhatla-card">
                <h3>🍂 Nhịp lá rơi</h3>
                <label class="nhatla-number-row">Số lá tối đa trên màn hình <input id="nl-max-leaves" type="number" min="50" max="20000" value="${Math.round(cfg.drop.maxLeaves)}"></label>
                <label class="nhatla-number-row">Khoảng cách khi rơi nhiều lá (ms) <input id="nl-spawn-gap" type="number" min="0" max="2000" value="${Math.round(cfg.drop.spawnGapMs)}"></label>
            </div>`;
        $$('.nhatla-skin-grid', $('#nl-display-pane')).forEach(grid => grid.addEventListener('click', event => {
            const button = event.target.closest('[data-skin-id]');
            if (!button || button.classList.contains('selected')) return;
            cfg.display[grid.dataset.skinKey] = button.dataset.skinId;
            renderDisplay();
            // Đường transient chỉ relay được số (xem nhatla:transient trong server.js), nên
            // id bộ skin phải đi đường POST /config — server broadcast gameConfig là overlay
            // đổi ảnh ngay, không cần reload OBS.
            save(true);
        }));
        $$('[data-display-range]', $('#nl-display-pane')).forEach(input => input.addEventListener('input', () => {
            cfg.display[input.dataset.displayRange] = Number(input.value);
            input.nextElementSibling.textContent = input.value + '%';
            // Phóng to thùng là hạ trần của thanh "Dọc" xuống. Sửa tại chỗ thuộc tính max
            // thay vì renderDisplay(): vẽ lại giữa lúc người dùng đang giữ chuột trên thanh
            // Kích thước sẽ thay phần tử đang kéo, đứt luôn thao tác kéo.
            if (input.dataset.displayRange === 'binScale') syncBinYMax();
            socket?.emit('nhatla:transient', { type: 'display', display: { ...cfg.display } });
            save();
        }));
        $('#nl-show-hud').addEventListener('change', event => {
            cfg.display.showHud = event.target.checked;
            socket?.emit('nhatla:transient', { type: 'display', display: { ...cfg.display } });
            save();
        });
        $('#nl-max-leaves').addEventListener('change', event => { cfg.drop.maxLeaves = game.clamp(event.target.value, 50, 20000); save(); });
        $('#nl-spawn-gap').addEventListener('change', event => { cfg.drop.spawnGapMs = game.clamp(event.target.value, 0, 2000); save(); });
    }

    function renderGifts() {
        const rules = cfg.giftRules || [];
        $('#nl-gifts-pane').innerHTML = `
            <div class="nhatla-card">
                <h3>🎁 Quà chỉ định</h3>
                <p class="nhatla-muted">Quà không có rule riêng tự tính theo coin. Vẫn có thể thêm quà riêng để chỉnh số lá theo ý.</p>
                <label class="nhatla-number-row">Quà không nằm trong danh sách: <input id="nl-coins-per-leaf" type="number" min="0" max="5000" value="${Math.round(cfg.coinsPerLeaf)}"> 💎 = 1 lá</label>
                <p class="nhatla-muted">Nhập <b>0</b>: không ghi nhận lá. Nhập <b>1</b>: 1 💎 = 1 lá. Nhập <b>5</b>: 5 💎 = 1 lá.</p>
                <div class="nhatla-gift-head"><span>Quà TikTok</span><span>Số lá rơi</span><span></span></div>
                <div id="nl-gift-rules">${rules.map((rule, index) => `
                    <div class="nhatla-gift-rule" data-rule="${index}">
                        <button class="nhatla-gift-select ${rule.giftId ? 'selected' : ''}" data-rule-select title="Chọn quà TikTok">${giftButtonMarkup(rule)}</button>
                        <input data-rule-count type="number" min="0" max="5000" value="${Math.round(Number(rule.count) || 1)}">
                        <button class="danger tiny" data-rule-remove title="Xóa quà">×</button>
                    </div>`).join('')}</div>
                <div class="nhatla-actions"><button id="nl-add-rule" class="ghost small">+ Thêm quà</button><button id="nl-sync-coin-rules" class="ghost small">↻ Đồng bộ theo 💎</button><button id="nl-save-rules" class="primary small">💾 Lưu quà</button></div>
            </div>
            <div class="nhatla-card">
                <h3>🧪 Test nhanh</h3>
                <p class="nhatla-muted">Nhập đúng số lá muốn thử. Không phụ thuộc vào quà hay Gift ID.</p>
                <div class="nhatla-actions"><input id="nl-test-count" type="number" min="1" max="5000" value="1" title="Số lá cần thả"><button id="nl-test-gift" class="primary small">🍂 Thả lá test</button></div>
            </div>`;
        $('#nl-coins-per-leaf').addEventListener('change', event => { cfg.coinsPerLeaf = game.clamp(event.target.value, 0, 5000); save(); });
        $('#nl-add-rule').addEventListener('click', () => { cfg.giftRules.push({ id: `r${Date.now()}`, giftId: '', giftName: '', giftImage: '', diamond: 0, count: 1 }); renderGifts(); });
        $('#nl-sync-coin-rules').addEventListener('click', () => {
            cfg.giftRules.forEach(rule => { if (Number(rule.diamond) > 0) rule.count = Math.round(Number(rule.diamond)); });
            renderGifts(); save(true);
        });
        $('#nl-save-rules').addEventListener('click', readRulesAndSave);
        $$('[data-rule-select]', $('#nl-gift-rules')).forEach(button => button.addEventListener('click', event => openGiftPicker('rule', Number(event.currentTarget.closest('[data-rule]').dataset.rule))));
        $$('[data-rule-count]', $('#nl-gift-rules')).forEach(input => input.addEventListener('change', event => {
            const index = Number(event.currentTarget.closest('[data-rule]').dataset.rule);
            cfg.giftRules[index].count = game.clamp(event.currentTarget.value, 0, 5000);
            save();
        }));
        $$('[data-rule-remove]', $('#nl-gift-rules')).forEach(button => button.addEventListener('click', event => {
            cfg.giftRules.splice(Number(event.currentTarget.closest('[data-rule]').dataset.rule), 1);
            renderGifts(); save(true);
        }));
        $('#nl-test-gift').addEventListener('click', () => {
            fetch('/api/games/nhatla/cmd', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cmd: 'drop', payload: { count: Number($('#nl-test-count').value) || 1 } })
            }).catch(() => {});
        });
    }

    function renderEffects() {
        const rules = cfg.effects.effectGifts;
        $('#nl-effects-pane').innerHTML = `
            <div class="nhatla-card">
                <h3>🎬 Hiệu ứng theo quà</h3>
                <p class="nhatla-muted">Nhập <b>0 ms</b>: WEBM phát và lá buông ngay. <b>1000 ms = 1 giây</b>.</p>
                <div class="nhatla-effect-head"><span>Quà TikTok</span><span>Tên hiệu ứng</span><span>Buông (ms)</span><span></span></div>
                <div id="nl-effect-gifts">${rules.map((rule, index) => `
                    <div class="nhatla-effect-gift" data-effect-gift="${index}">
                        <button class="nhatla-gift-select nhatla-effect-gift-select ${rule.giftId ? 'selected' : ''}" data-effect-gift-select title="Chọn quà TikTok">${effectGiftButtonMarkup(rule)}</button>
                        <input data-effect-gift-name type="text" maxlength="80" value="${esc(rule.name)}" placeholder="Ví dụ: Đánh tay">
                        <label><input data-effect-gift-release type="number" min="0" max="60000" step="50" value="${Math.round(rule.releaseAfterMs)}"><small>ms</small></label>
                        <button class="danger tiny" data-effect-gift-remove title="Xóa quà hiệu ứng">×</button>
                    </div>
                    <div class="nhatla-effect-media" data-effect-gift="${index}">
                        <span title="${esc(rule.mediaName || 'Dùng TOM mặc định')}">${rule.mediaUrl ? `🎞 ${esc(rule.mediaName || 'WEBM đã chọn')}` : '🐱 TOM mặc định'}</span>
                        <label class="ghost small" title="Chọn file WEBM từ máy">📁 WEBM<input data-effect-media-upload type="file" accept="video/webm,.webm" hidden></label>
                        ${rule.mediaUrl ? '<button class="ghost small" data-effect-media-clear title="Dùng lại TOM mặc định">↺ Mặc định</button>' : ''}
                        <button class="primary small" data-effect-test>▶ Chạy thử</button>
                        <label class="nhatla-effect-hotkey" title="Bấm tổ hợp muốn dùng, hoạt động kể cả khi app không được chọn">⌨ <input data-effect-hotkey type="text" maxlength="80" value="${esc(rule.hotkey || '')}" placeholder="Bấm tổ hợp phím"> </label>
                        <label class="nhatla-effect-lock"><input data-effect-follow-hand type="checkbox" ${rule.followHand !== false ? 'checked' : ''}> 🖐 Bám tay</label>
                        <button class="ghost small" data-effect-position ${rule.followHand !== false ? 'disabled' : ''}>📍 Đặt vị trí</button>
                        <label class="nhatla-effect-lock"><input data-effect-position-lock type="checkbox" ${rule.positionLocked ? 'checked' : ''} ${rule.followHand !== false ? 'disabled' : ''}> 🔒 Khóa</label>
                    </div>`).join('')}</div>
                <div class="nhatla-actions"><button id="nl-add-effect-gift" class="ghost small">+ Thêm quà mới</button></div>
            </div>`;
        $('#nl-add-effect-gift').addEventListener('click', () => {
            cfg.effects.effectGifts.push({ id: `effect-${Date.now()}`, giftId: '', giftName: '', diamond: 0, name: '', releaseAfterMs: 0, mediaUrl: '', mediaName: '', hotkey: '', scale: 100, positionXPercent: 50, positionYPercent: 50, followHand: true, positionLocked: false });
            renderEffects();
        });
        $$('[data-effect-gift-select]', $('#nl-effect-gifts')).forEach(button => button.addEventListener('click', event => openGiftPicker('effect', Number(event.currentTarget.closest('[data-effect-gift]').dataset.effectGift))));
        $$('[data-effect-gift-name]', $('#nl-effect-gifts')).forEach(input => input.addEventListener('change', event => {
            const rule = cfg.effects.effectGifts[Number(event.currentTarget.closest('[data-effect-gift]').dataset.effectGift)];
            rule.name = event.currentTarget.value.trim();
            save();
        }));
        $$('[data-effect-gift-release]', $('#nl-effect-gifts')).forEach(input => input.addEventListener('change', event => {
            const rule = cfg.effects.effectGifts[Number(event.currentTarget.closest('[data-effect-gift]').dataset.effectGift)];
            rule.releaseAfterMs = game.clamp(event.currentTarget.value, 0, 60000);
            event.currentTarget.value = Math.round(rule.releaseAfterMs);
            save();
        }));
        $$('[data-effect-gift-remove]', $('#nl-effect-gifts')).forEach(button => button.addEventListener('click', event => {
            cfg.effects.effectGifts.splice(Number(event.currentTarget.closest('[data-effect-gift]').dataset.effectGift), 1);
            renderEffects();
            save(true);
        }));
        $$('[data-effect-media-upload]', $('#nl-effect-gifts')).forEach(input => input.addEventListener('change', event => uploadEffectMedia(Number(event.currentTarget.closest('[data-effect-gift]').dataset.effectGift), event.currentTarget.files?.[0])));
        $$('[data-effect-media-clear]', $('#nl-effect-gifts')).forEach(button => button.addEventListener('click', event => {
            const rule = cfg.effects.effectGifts[Number(event.currentTarget.closest('[data-effect-gift]').dataset.effectGift)];
            rule.mediaUrl = ''; rule.mediaName = '';
            renderEffects(); save(true);
        }));
        $$('[data-effect-test]', $('#nl-effect-gifts')).forEach(button => button.addEventListener('click', event => {
            const rule = cfg.effects.effectGifts[Number(event.currentTarget.closest('[data-effect-gift]').dataset.effectGift)];
            testEffect(rule);
        }));
        $$('[data-effect-hotkey]', $('#nl-effect-gifts')).forEach(input => input.addEventListener('keydown', event => {
            event.preventDefault();
            const rule = cfg.effects.effectGifts[Number(event.currentTarget.closest('[data-effect-gift]').dataset.effectGift)];
            rule.hotkey = ['Backspace', 'Delete', 'Escape'].includes(event.key) ? '' : hotkeyFromEvent(event);
            event.currentTarget.value = rule.hotkey;
            save();
        }));
        $$('[data-effect-follow-hand]', $('#nl-effect-gifts')).forEach(input => input.addEventListener('change', event => {
            const rule = cfg.effects.effectGifts[Number(event.currentTarget.closest('[data-effect-gift]').dataset.effectGift)];
            rule.followHand = event.currentTarget.checked;
            if (rule.followHand && editingEffectId === rule.id) editingEffectId = null;
            sendEffectEditor(editingEffectId);
            renderEffects();
            save(true);
        }));
        $$('[data-effect-position]', $('#nl-effect-gifts')).forEach(button => button.addEventListener('click', event => {
            const rule = cfg.effects.effectGifts[Number(event.currentTarget.closest('[data-effect-gift]').dataset.effectGift)];
            editingEffectId = rule.id;
            sendEffectEditor(rule.id);
        }));
        $$('[data-effect-position-lock]', $('#nl-effect-gifts')).forEach(input => input.addEventListener('change', event => {
            const rule = cfg.effects.effectGifts[Number(event.currentTarget.closest('[data-effect-gift]').dataset.effectGift)];
            rule.positionLocked = event.currentTarget.checked;
            if (rule.positionLocked && editingEffectId === rule.id) editingEffectId = null;
            sendEffectEditor(editingEffectId);
            save();
        }));
    }

    function effectGiftButtonMarkup(rule) {
        if (!rule?.giftId) return '<span class="nhatla-gift-placeholder">🎁 Chọn quà</span>';
        return rule.giftImage ? `<img src="${esc(rule.giftImage)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'🎁'}))">` : '<span class="nhatla-gift-icon">🎁</span>';
    }

    async function uploadEffectMedia(index, file) {
        if (!file) return;
        if (!/\.webm$/i.test(file.name)) return;
        try {
            const response = await fetch(`/api/games/nhatla/upload?ext=webm&name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
            const data = await response.json();
            if (!data?.ok || !cfg.effects.effectGifts[index]) return;
            cfg.effects.effectGifts[index].mediaUrl = data.url;
            cfg.effects.effectGifts[index].mediaName = file.name;
            renderEffects();
            await save(true);
        } catch (e) {}
    }

    function sendEffectEditor(effectId) {
        const frame = $('#nl-review-frame');
        frame?.contentWindow?.postMessage({ type: 'nhatla:effect-editor', effectId: effectId || null, effectGifts: cfg.effects.effectGifts }, location.origin);
    }

    function testEffect(rule) {
        if (!rule?.id) return;
        fetch('/api/games/nhatla/cmd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd: 'effect', payload: { effectId: rule.id } }) }).catch(() => {});
    }

    // ── Phím tắt dùng chung cho mọi danh sách quà ─────────────────────────────
    // Tab Hiệu ứng có ô phím tắt riêng từ trước (markup khác hẳn), nên giữ nguyên.
    // Ba danh sách còn lại dùng chung đúng một ô + đúng một handler ở đây; thêm tính năng
    // thứ tư chỉ cần khai báo thêm một dòng trong HOTKEY_LISTS.
    const HOTKEY_LISTS = {
        rescue: () => cfg.rescue.actions
    };

    function hotkeyCell(listName, index, rule) {
        return `<label class="nhatla-hk" title="Bấm tổ hợp muốn dùng — chạy cả khi app không được chọn. Backspace để xoá.">⌨ <input data-hk-list="${listName}" data-hk-index="${index}" type="text" maxlength="80" value="${esc(rule.hotkey || '')}" placeholder="Bấm phím"></label>`;
    }

    function bindHotkeyCells(scope) {
        $$('[data-hk-list]', scope).forEach(input => input.addEventListener('keydown', event => {
            event.preventDefault();
            const el = event.currentTarget;
            const list = HOTKEY_LISTS[el.dataset.hkList]?.();
            const rule = list && list[Number(el.dataset.hkIndex)];
            if (!rule) return;
            rule.hotkey = ['Backspace', 'Delete', 'Escape'].includes(event.key) ? '' : hotkeyFromEvent(event);
            el.value = rule.hotkey;
            // Lưu ngay: phím tắt chỉ có hiệu lực sau khi Electron nạp lại config,
            // để debounce 260ms thì người dùng bấm thử liền sẽ tưởng phím không ăn.
            save(true);
        }));
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

    function ensureEffectHotkeys() {
        if (hotkeysBound) return;
        hotkeysBound = true;
        document.addEventListener('keydown', event => {
            const tag = (event.target?.tagName || '').toUpperCase();
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable) return;
            if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || !cfg || cfg.enabled === false) return;
            const rule = cfg.effects.effectGifts.find(item => item.hotkey && item.hotkey === event.key.toUpperCase());
            if (!rule) return;
            event.preventDefault();
            testEffect(rule);
        });
    }

    // Thanh trượt cho khối cfg.wind. Tách khỏi rangeRow() vì rangeRow() gắn cứng cfg.display.
    // ===== 🛟 GIẢI CỨU =====
    // Một danh sách phẳng: mỗi dòng = 1 quà + 1 bộ thông số RIÊNG, chỉnh trong popup.
    // Trước đây gió/lốc/cứu là ba khối riêng, thông số nằm ở khối chung còn quà chỉ trỏ vào —
    // nên gắn quà cứu thứ 2 là không có cách nào cho nó thời lượng khác quà thứ 1.
    const RESCUE_META = {
        wind:      { label: 'Gió', hint: 'Cuốn một vùng lá quanh một điểm rồi thả rơi lại.' },
        tornado:   { label: 'Lốc', hint: 'Cuốn lá quay tròn, hút vào tâm rồi bốc lên, đồng thời trườn ngang.' },
        autoClean: { label: 'Tự nhặt', hint: 'Thùng rác tự hút lá, lá gần thùng nhất bay vào trước.' }
    };
    // Nhãn + gợi ý cho từng thông số. Khoá phải khớp RESCUE_LIMITS bên game.js.
    const RESCUE_FIELDS = {
        wind: [
            ['radius', 'Bán kính vùng gió', 'px', 'Vùng lá bị ảnh hưởng quanh điểm thổi'],
            ['strength', 'Cường độ', '', 'Tốc độ gió tại tâm (px/giây)'],
            ['turbulence', 'Nhiễu xoáy', '%', '0% = bay thẳng đều, cao = cuộn xoáy tự nhiên'],
            ['durationMs', 'Thời gian một cơn', 'ms', ''],
            ['maxLeaves', 'Số lá cuốn lên', '', 'Cần gạt THẨM MỸ, không phải để giảm lag']
        ],
        tornado: [
            ['radius', 'Bán kính lốc', 'px', 'Vùng lá bị cuốn vào xoáy'],
            ['spin', 'Tốc độ quay', '', 'Vận tốc quay ở rìa lốc (px/giây)'],
            ['inward', 'Lực hút vào tâm', '', 'Đây là phần “gom lá”. Thấp quá so với Tốc độ quay thì lá loe ra'],
            ['lift', 'Lực bốc lên', '', 'Nâng lá lên cao trong lúc xoáy'],
            ['drift', 'Lốc trườn ngang', '', '0 = lốc đứng yên một chỗ'],
            ['durationMs', 'Thời gian một cơn', 'ms', ''],
            ['maxLeaves', 'Số lá bị cuốn', '', '']
        ],
        autoClean: [
            ['durationMs', 'Thời gian một lượt', 'ms', ''],
            ['leavesPerSec', 'Tốc độ nhặt', ' lá/giây', '']
        ]
    };

    function rescueActions() {
        if (!cfg.rescue || typeof cfg.rescue !== 'object') cfg.rescue = { actions: [] };
        if (!Array.isArray(cfg.rescue.actions)) cfg.rescue.actions = [];
        return cfg.rescue.actions;
    }

    // Bắn thử một hành động: gửi ĐÚNG thông số của nó chứ không phải thông số khối chung —
    // nếu không thì "Thử" hiện một kiểu còn quà thật lại chạy kiểu khác.
    function sendRescueAction(action) {
        const p = action.params || {};
        let cmd, payload;
        if (action.type === 'tornado') {
            cmd = 'tornado';
            payload = {
                x: Math.round(200 + Math.random() * 680),
                dir: Math.random() < .5 ? 'left' : 'right',
                radius: p.radius, spin: p.spin, inward: p.inward, lift: p.lift,
                durationMs: p.durationMs, maxLeaves: p.maxLeaves, drift: p.drift
            };
        } else if (action.type === 'autoClean') {
            cmd = 'autoClean';
            payload = { durationMs: p.durationMs, leavesPerSec: p.leavesPerSec };
        } else {
            const dir = p.direction || 'random';
            cmd = 'wind';
            payload = {
                x: Math.round(120 + Math.random() * 840),
                dir: dir === 'random' ? (Math.random() < .5 ? 'left' : 'right') : dir,
                radius: p.radius, strength: p.strength, turbulence: p.turbulence,
                durationMs: p.durationMs, maxLeaves: p.maxLeaves
            };
        }
        fetch('/api/games/nhatla/cmd', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cmd, payload })
        }).catch(() => {});
    }

    function addRescueAction(type) {
        const preset = game.RESCUE_PRESET[type];
        rescueActions().push({
            id: `rescue-${Date.now()}`,
            type, icon: preset.icon, name: preset.name, enabled: true,
            giftId: '', giftName: '', giftImage: '', diamond: 0, hotkey: '',
            params: game.rescueDefaultParams(type, cfg)
        });
        renderRescue(); save(true);
    }

    function rescueLeafRange(label, key, min, max, help) {
        const value = Math.round(Number(cfg.wind[key]) || 0);
        return `<label class="nhatla-range-row"><span><b>${label}</b><small>${help || ''}</small></span><input type="range" min="${min}" max="${max}" value="${value}" data-leaf-range="${key}"><output>${value}</output></label>`;
    }

    function renderRescue() {
        const actions = rescueActions();
        $('#nl-rescue-pane').innerHTML = `
            <div class="nhatla-card">
                <h3>🛟 Hành động giải cứu</h3>
                <p class="nhatla-muted">Mỗi dòng là <b>một quà + một bộ thông số riêng</b>. Hai quà cùng loại vẫn chỉnh khác nhau được — bấm <b>⚙</b> để mở thông số của đúng dòng đó.</p>
                ${actions.length ? `
                <div id="nl-rescue-list">${actions.map((action, index) => `
                    <div class="nhatla-rescue-row${action.enabled === false ? ' off' : ''}" data-rescue="${index}">
                        <label class="nhatla-rescue-on" title="Bật/tắt riêng hành động này"><input type="checkbox" data-rescue-on ${action.enabled !== false ? 'checked' : ''}></label>
                        <button class="nhatla-rescue-name" data-rescue-config title="Mở thông số riêng của hành động này">
                            <span class="nhatla-rescue-ico">${esc(action.icon)}</span>
                            <span class="nhatla-rescue-text"><b>${esc(action.name)}</b><small>${esc(RESCUE_META[action.type].label)}</small></span>
                            <span class="nhatla-rescue-gear">⚙</span>
                        </button>
                        <button class="nhatla-gift-select ${action.giftId ? 'selected' : ''}" data-rescue-gift title="Chọn quà TikTok">${giftButtonMarkup(action)}</button>
                        ${hotkeyCell('rescue', index, action)}
                        <button class="ghost small" data-rescue-test title="Chạy thử ngay">▶</button>
                        <button class="danger tiny" data-rescue-remove title="Xoá hành động">×</button>
                    </div>`).join('')}</div>` : '<p class="nhatla-muted">Chưa có hành động nào. Thêm một cái bên dưới.</p>'}
                <div class="nhatla-actions">
                    <button class="ghost small" data-add-rescue="wind">🌬 Thêm Gió</button>
                    <button class="ghost small" data-add-rescue="tornado">🌪 Thêm Lốc</button>
                    <button class="ghost small" data-add-rescue="autoClean">🧹 Thêm Tự nhặt lá</button>
                </div>
            </div>
            <div class="nhatla-card">
                <h3>🍃 Vật lý lá — dùng chung</h3>
                <p class="nhatla-muted">Hai thông số này tả <b>chiếc lá</b> (nặng hay nhẹ), không tả cơn gió, nên dùng chung cho mọi hành động. Trong vòng lặp vật lý, một chiếc lá đang bay không thuộc riêng cơn gió nào — nó có thể bị nhiều cơn chồng lên cùng lúc.</p>
                ${rescueLeafRange('Độ bám gió', 'drag', 2, 120, 'Cao = lá nhẹ, bám gió tức thì. Thấp = lá nặng, ì')}
                ${rescueLeafRange('Lực nâng khi xoay', 'lift', 0, 150, 'Lá xoay nhanh thì được nâng lên — cho nhịp hẫng giống lá thật')}
                <div class="nhatla-rescue-master">
                    <label class="toggle-row nhatla-toggle"><input type="checkbox" data-rescue-master="wind" ${cfg.wind.enabled !== false ? 'checked' : ''}><span>Bật toàn bộ Gió</span></label>
                    <label class="toggle-row nhatla-toggle"><input type="checkbox" data-rescue-master="tornado" ${cfg.tornado.enabled !== false ? 'checked' : ''}><span>Bật toàn bộ Lốc</span></label>
                    <label class="toggle-row nhatla-toggle"><input type="checkbox" data-rescue-master="autoClean" ${cfg.autoClean.enabled !== false ? 'checked' : ''}><span>Bật toàn bộ Tự nhặt lá</span></label>
                </div>
            </div>`;

        const pane = $('#nl-rescue-pane');
        $$('[data-add-rescue]', pane).forEach(button =>
            button.addEventListener('click', () => addRescueAction(button.dataset.addRescue)));
        $$('[data-leaf-range]', pane).forEach(input => input.addEventListener('input', () => {
            cfg.wind[input.dataset.leafRange] = Number(input.value);
            input.nextElementSibling.textContent = input.value;
            save();
        }));
        $$('[data-rescue-master]', pane).forEach(input => input.addEventListener('change', event => {
            cfg[event.currentTarget.dataset.rescueMaster].enabled = event.currentTarget.checked;
            save(true);
        }));
        const rowIndex = event => Number(event.currentTarget.closest('[data-rescue]').dataset.rescue);
        $$('[data-rescue-on]', pane).forEach(input => input.addEventListener('change', event => {
            rescueActions()[rowIndex(event)].enabled = event.currentTarget.checked;
            renderRescue(); save(true);
        }));
        $$('[data-rescue-config]', pane).forEach(button =>
            button.addEventListener('click', event => openRescueModal(rowIndex(event))));
        $$('[data-rescue-gift]', pane).forEach(button =>
            button.addEventListener('click', event => openGiftPicker('rescue', rowIndex(event))));
        $$('[data-rescue-test]', pane).forEach(button =>
            button.addEventListener('click', event => sendRescueAction(rescueActions()[rowIndex(event)])));
        $$('[data-rescue-remove]', pane).forEach(button => button.addEventListener('click', event => {
            rescueActions().splice(rowIndex(event), 1);
            renderRescue(); save(true);
        }));
        bindHotkeyCells(pane);
    }

    // ===== Popup thông số của MỘT hành động =====
    function ensureRescueModal() {
        if (rescueModalEl) return rescueModalEl;
        const modal = document.createElement('div');
        modal.className = 'nhatla-giftpicker-backdrop nhatla-rescue-backdrop';
        modal.hidden = true;
        modal.innerHTML = `
            <div class="nhatla-giftpicker-modal nhatla-rescue-modal" role="dialog" aria-modal="true" aria-label="Thông số hành động giải cứu">
                <div class="nhatla-giftpicker-head"><b data-rescue-modal-title>Thông số</b><button class="ghost small" data-rescue-modal-close>✕</button></div>
                <div class="nhatla-rescue-modal-body"></div>
            </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', event => { if (event.target === modal) closeRescueModal(); });
        $('[data-rescue-modal-close]', modal).addEventListener('click', closeRescueModal);
        rescueModalEl = modal;
        return modal;
    }

    function closeRescueModal() {
        if (rescueModalEl) rescueModalEl.hidden = true;
        rescueModalIndex = null;
    }

    function openRescueModal(index) {
        const action = rescueActions()[index];
        if (!action) return;
        rescueModalIndex = index;
        const modal = ensureRescueModal();
        modal.hidden = false;
        renderRescueModal();
    }

    function renderRescueModal() {
        const action = rescueActions()[rescueModalIndex];
        if (!action || !rescueModalEl) return closeRescueModal();
        const meta = RESCUE_META[action.type];
        const limits = game.RESCUE_LIMITS[action.type];
        $('[data-rescue-modal-title]', rescueModalEl).textContent = `${action.icon} ${action.name}`;
        $('.nhatla-rescue-modal-body', rescueModalEl).innerHTML = `
            <p class="nhatla-muted">${esc(meta.hint)}</p>
            <div class="nhatla-rescue-idrow">
                <label class="nhatla-number-row">Tên hiển thị <input data-rescue-rename type="text" maxlength="60" value="${esc(action.name)}"></label>
                <div class="nhatla-rescue-icons">${game.RESCUE_ICONS.map(icon =>
                    `<button class="nhatla-rescue-icon-pick${icon === action.icon ? ' on' : ''}" data-pick-icon="${esc(icon)}">${icon}</button>`).join('')}</div>
            </div>
            ${RESCUE_FIELDS[action.type].map(([key, label, suffix, help]) => {
                const [min, max] = limits[key];
                const value = Math.round(Number(action.params[key]) || 0);
                return `<label class="nhatla-range-row"><span><b>${label}</b><small>${help || ''}</small></span><input type="range" min="${min}" max="${max}" value="${value}" data-param="${key}"><output>${value}${suffix}</output></label>`;
            }).join('')}
            ${action.type === 'wind' ? `
            <label class="nhatla-number-row">Hướng gió
                <select data-param-direction>
                    <option value="random" ${action.params.direction === 'random' ? 'selected' : ''}>Ngẫu nhiên</option>
                    <option value="left" ${action.params.direction === 'left' ? 'selected' : ''}>Sang trái</option>
                    <option value="right" ${action.params.direction === 'right' ? 'selected' : ''}>Sang phải</option>
                </select>
            </label>` : ''}
            ${action.type === 'tornado' ? '<p class="nhatla-muted">Nếu thấy lá <b>văng ra ngoài</b> thay vì gom lại, hãy tăng <b>Lực hút vào tâm</b> lên ít nhất khoảng ⅔ của <b>Tốc độ quay</b>.</p>' : ''}
            <div class="nhatla-actions"><button class="primary small" data-rescue-modal-test>▶ Chạy thử</button></div>`;

        const body = $('.nhatla-rescue-modal-body', rescueModalEl);
        $$('[data-param]', body).forEach(input => input.addEventListener('input', () => {
            action.params[input.dataset.param] = Number(input.value);
            const suffix = input.nextElementSibling.textContent.replace(/^[\d-]+/, '');
            input.nextElementSibling.textContent = input.value + suffix;
            save();
        }));
        const directionSelect = $('[data-param-direction]', body);
        if (directionSelect) directionSelect.addEventListener('change', event => {
            action.params.direction = event.target.value; save();
        });
        $('[data-rescue-rename]', body).addEventListener('input', event => {
            action.name = event.target.value.slice(0, 60);
            $('[data-rescue-modal-title]', rescueModalEl).textContent = `${action.icon} ${action.name}`;
            renderRescue(); save();
        });
        $$('[data-pick-icon]', body).forEach(button => button.addEventListener('click', () => {
            action.icon = button.dataset.pickIcon;
            renderRescueModal(); renderRescue(); save();
        }));
        $('[data-rescue-modal-test]', body).addEventListener('click', () => sendRescueAction(action));
    }

    function giftButtonMarkup(rule) {
        if (!rule?.giftId) return '<span class="nhatla-gift-placeholder">🎁 Chọn quà</span>';
        const icon = rule.giftImage ? `<img src="${esc(rule.giftImage)}" alt="" onerror="this.remove()">` : '<span class="nhatla-gift-icon">🎁</span>';
        return `${icon}<span class="nhatla-gift-name">${esc(rule.giftName || 'Quà TikTok')}</span><span class="nhatla-gift-coin">${Math.round(Number(rule.diamond) || 0)} 💎</span>`;
    }

    function readRules() {
        cfg.giftRules = $$('.nhatla-gift-rule', root()).map((row, index) => ({
            ...cfg.giftRules[index],
            id: cfg.giftRules[index]?.id || `r${Date.now()}-${index}`,
            count: game.clamp($('[data-rule-count]', row).value, 0, 5000)
        })).filter(rule => rule.giftId);
    }

    function readRulesAndSave() { readRules(); save(true); renderGifts(); }

    function ensureGiftPicker() {
        if (giftPickerEl) return giftPickerEl;
        const modal = document.createElement('div');
        modal.className = 'nhatla-giftpicker-backdrop';
        modal.hidden = true;
        modal.innerHTML = `
            <div class="nhatla-giftpicker-modal" role="dialog" aria-modal="true" aria-label="Chọn quà TikTok">
                <div class="nhatla-giftpicker-head"><b>🎁 Chọn quà TikTok</b><button class="ghost small" data-picker-close>✕</button></div>
                <input class="nhatla-giftpicker-search" type="search" placeholder="Tìm tên quà hoặc số coin...">
                <div class="nhatla-giftpicker-list"></div>
            </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', event => { if (event.target === modal) closeGiftPicker(); });
        $('[data-picker-close]', modal).addEventListener('click', closeGiftPicker);
        $('.nhatla-giftpicker-search', modal).addEventListener('input', event => renderGiftPicker(event.target.value));
        giftPickerEl = modal;
        return modal;
    }

    async function loadGiftSheet() {
        if (Array.isArray(window.__giftSheet) && window.__giftSheet.length) return window.__giftSheet;
        try {
            const response = await fetch('/api/gifts');
            const list = await response.json();
            if (Array.isArray(list)) window.__giftSheet = list.slice().sort((a, b) => (a.diamond || 0) - (b.diamond || 0));
        } catch (e) {}
        return Array.isArray(window.__giftSheet) ? window.__giftSheet : [];
    }

    async function openGiftPicker(type, index) {
        pickerTarget = { type, index };
        const modal = ensureGiftPicker();
        modal.hidden = false;
        const search = $('.nhatla-giftpicker-search', modal);
        search.value = '';
        await loadGiftSheet();
        renderGiftPicker('');
        setTimeout(() => search.focus(), 20);
    }

    function closeGiftPicker() {
        if (giftPickerEl) giftPickerEl.hidden = true;
        pickerTarget = null;
    }

    function renderGiftPicker(query) {
        const host = $('.nhatla-giftpicker-list', giftPickerEl);
        const filter = String(query || '').trim().toLowerCase();
        const sheet = Array.isArray(window.__giftSheet) ? window.__giftSheet : [];
        const gifts = sheet.filter(gift => !filter || `${gift.name || ''} ${gift.diamond || 0}`.toLowerCase().includes(filter)).slice(0, 250);
        if (!gifts.length) {
            host.innerHTML = '<div class="nhatla-giftpicker-empty">Chưa có danh sách quà. Hãy kết nối LIVE hoặc mở Danh sách quà để tải dữ liệu.</div>';
            return;
        }
        host.innerHTML = gifts.map(gift => {
            const image = gift.image ? `<img src="${esc(gift.image)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'🎁'}))">` : '<span>🎁</span>';
            return `<button class="nhatla-picker-gift" data-picker-gift="${esc(gift.id)}">${image}<b>${esc(gift.name || 'Quà TikTok')}</b><em>${Math.round(Number(gift.diamond) || 0)} 💎</em></button>`;
        }).join('');
        $$('[data-picker-gift]', host).forEach(button => button.addEventListener('click', () => {
            const gift = sheet.find(item => String(item.id) === button.dataset.pickerGift);
            if (!gift || !pickerTarget) return;
            if (pickerTarget.type === 'rule' && cfg.giftRules[pickerTarget.index]) {
                cfg.giftRules[pickerTarget.index] = {
                    ...cfg.giftRules[pickerTarget.index],
                    giftId: String(gift.id), giftName: gift.name || 'Quà TikTok', giftImage: gift.image || '', diamond: Number(gift.diamond) || 0,
                    // Giá trị mặc định của rule luôn theo số coin; user vẫn sửa input sau đó nếu muốn.
                    count: Math.max(1, Math.round(Number(gift.diamond) || 0))
                };
            } else if (pickerTarget.type === 'effect' && cfg.effects.effectGifts[pickerTarget.index]) {
                const rule = cfg.effects.effectGifts[pickerTarget.index];
                cfg.effects.effectGifts[pickerTarget.index] = {
                    ...rule,
                    giftId: String(gift.id), giftName: gift.name || 'Quà TikTok', giftImage: gift.image || '', diamond: Number(gift.diamond) || 0,
                    name: rule.name || gift.name || 'Hiệu ứng mới'
                };
            } else if (pickerTarget.type === 'rescue' && cfg.rescue.actions[pickerTarget.index]) {
                cfg.rescue.actions[pickerTarget.index] = {
                    ...cfg.rescue.actions[pickerTarget.index],
                    giftId: String(gift.id), giftName: gift.name || 'Quà TikTok', giftImage: gift.image || '', diamond: Number(gift.diamond) || 0
                };
            } else return;
            closeGiftPicker();
            renderGifts(); renderEffects(); renderRescue();
            save(true);
        }));
    }

    // ===== 🏆 TOP người tặng lá =====
    // Số lá do SERVER cộng dồn theo buổi LIVE (in-memory) — panel chỉ chỉnh cách hiện và xem lại.
    function topRangeRow(label, key, min, max, suffix, help) {
        const value = Math.round(Number(cfg.topDonors[key]) || 0);
        return `<label class="nhatla-range-row"><span><b>${label}</b><small>${help || ''}</small></span><input type="range" min="${min}" max="${max}" value="${value}" data-top-range="${key}"><output>${value}${suffix}</output></label>`;
    }

    function renderTopList() {
        const host = $('#nl-top-list');
        if (!host) return;
        if (!topList.length) {
            host.innerHTML = '<div class="nhatla-muted">Chưa ai tặng lá trong buổi LIVE này.</div>';
            return;
        }
        host.innerHTML = topList.map(entry => `
            <div class="nhatla-top-row">
                <span class="nhatla-top-rank">${['🥇', '🥈', '🥉'][entry.rank - 1] || `#${entry.rank}`}</span>
                <span class="nhatla-top-ava">🍂${entry.avatar ? `<img src="${esc(entry.avatar)}" alt="" onerror="this.remove()">` : ''}</span>
                <b class="nhatla-top-name">${esc(entry.nickname)}</b>
                <em class="nhatla-top-leaves">${Number(entry.leaves || 0).toLocaleString('vi-VN')} 🍂</em>
            </div>`).join('');
    }

    // Đổi cách hiện phải thấy ngay trên khung Review; save() có debounce 260ms nên relay
    // riêng một nhịp transient để thanh trượt không bị giật một nhịp mới nhúc nhích.
    function relayTop() {
        socket?.emit('nhatla:transient', { type: 'topdonors', topDonors: { ...cfg.topDonors } });
    }

    function renderTopDonors() {
        const top = cfg.topDonors;
        $('#nl-topdonors-pane').innerHTML = `
            <div class="nhatla-card">
                <h3>🏆 TOP người tặng lá</h3>
                <p class="nhatla-muted">Server cộng dồn số lá theo <b>buổi LIVE</b>. Bấm <b>Xoá hết lá</b> hoặc <b>Reset TOP</b> là về 0; tắt app cũng mất.</p>
                <label class="toggle-row nhatla-toggle"><input id="nl-top-enabled" type="checkbox" ${top.enabled !== false ? 'checked' : ''}><span>Bật TOP người tặng lá</span></label>
                <label class="nhatla-number-row">TOP mấy người <input id="nl-top-count" type="number" min="1" max="10" value="${Math.round(top.count)}"></label>
                <label class="nhatla-number-row">Tặng tối thiểu bao nhiêu lá mới vào bảng <input id="nl-top-min" type="number" min="0" max="100000" value="${Math.round(top.minLeaves)}"></label>
            </div>
            <div class="nhatla-card">
                <h3>✈️ Chữ bay ngang màn hình</h3>
                <label class="toggle-row nhatla-toggle"><input id="nl-top-fly-enabled" type="checkbox" ${top.flyEnabled !== false ? 'checked' : ''}><span>Bật chữ bay</span></label>
                <label class="nhatla-number-row">Kiểu bay
                    <select id="nl-top-fly-mode">
                        <option value="train" ${top.flyMode !== 'solo' ? 'selected' : ''}>Đoàn tàu — cả TOP nối đuôi 1 lượt</option>
                        <option value="solo" ${top.flyMode === 'solo' ? 'selected' : ''}>Lần lượt — mỗi lượt 1 người, xoay vòng</option>
                    </select>
                </label>
                ${topRangeRow('Bao lâu bay 1 lượt', 'flyIntervalSec', 5, 300, 's', 'Càng lớn càng ít làm phiền khung hình')}
                ${topRangeRow('Thời gian bay hết màn hình', 'flyDurationSec', 4, 60, 's', 'Càng lớn thì chữ trôi càng chậm, dễ đọc')}
                ${topRangeRow('Độ cao', 'flyYPercent', 0, 92, '%', 'Tính từ mép trên overlay')}
                ${topRangeRow('Cỡ chữ', 'flyScale', 40, 250, '%', 'Đổi cả avatar, tên và số lá')}
                <div class="nhatla-actions"><button id="nl-top-fly-test" class="primary small">✈️ Bay thử ngay</button></div>
            </div>
            <div class="nhatla-card">
                <h3>📋 Bảng TOP đứng yên</h3>
                <label class="toggle-row nhatla-toggle"><input id="nl-top-board-enabled" type="checkbox" ${top.boardEnabled === true ? 'checked' : ''}><span>Hiện bảng TOP thường trực</span></label>
                <p class="nhatla-muted">Bật lên rồi có thể <b>kéo thẳng bảng</b> trong khung Review hoặc cửa sổ Overlay.</p>
                ${topRangeRow('Ngang', 'boardXPercent', 0, 92, '%')}
                ${topRangeRow('Dọc', 'boardYPercent', 0, 92, '%')}
                ${topRangeRow('Cỡ chữ', 'boardScale', 40, 250, '%')}
            </div>
            <div class="nhatla-card">
                <h3>📊 Bảng xếp hạng hiện tại</h3>
                <div id="nl-top-list" class="nhatla-top-list"></div>
                <div class="nhatla-actions"><button id="nl-top-reset" class="danger small">♻ Reset TOP</button></div>
            </div>`;
        renderTopList();
        $$('[data-top-range]', $('#nl-topdonors-pane')).forEach(input => input.addEventListener('input', () => {
            cfg.topDonors[input.dataset.topRange] = Number(input.value);
            input.nextElementSibling.textContent = input.value + (['flyIntervalSec', 'flyDurationSec'].includes(input.dataset.topRange) ? 's' : '%');
            relayTop();
            save();
        }));
        $('#nl-top-enabled').addEventListener('change', event => { cfg.topDonors.enabled = event.target.checked; relayTop(); save(); });
        $('#nl-top-fly-enabled').addEventListener('change', event => { cfg.topDonors.flyEnabled = event.target.checked; relayTop(); save(); });
        $('#nl-top-board-enabled').addEventListener('change', event => { cfg.topDonors.boardEnabled = event.target.checked; relayTop(); save(); });
        $('#nl-top-fly-mode').addEventListener('change', event => { cfg.topDonors.flyMode = event.target.value === 'solo' ? 'solo' : 'train'; relayTop(); save(); });
        $('#nl-top-count').addEventListener('change', event => {
            cfg.topDonors.count = game.clamp(event.target.value, 1, 10);
            // count đổi thì DANH SÁCH đổi, không chỉ cách hiện — phải save ngay để server
            // cắt lại top rồi phát 'nhatla:top' mới; relay transient không làm được việc đó.
            save(true);
        });
        $('#nl-top-min').addEventListener('change', event => { cfg.topDonors.minLeaves = game.clamp(event.target.value, 0, 100000); save(true); });
        $('#nl-top-fly-test').addEventListener('click', () => fetch('/api/games/nhatla/cmd', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd: 'topFly' })
        }).catch(() => {}));
        $('#nl-top-reset').addEventListener('click', () => fetch('/api/nhatla/top/reset', { method: 'POST' }).catch(() => {}));
    }

    function bindShell() {
        $$('.nl-tab', root()).forEach(button => button.addEventListener('click', () => setTab(button.dataset.nlTab)));
        $('#nl-cfg-enabled').addEventListener('change', event => { cfg.enabled = event.target.checked; save(true); });
        $('#nl-btn-copy').addEventListener('click', copyOverlayUrl);
        $('#nl-btn-preview').addEventListener('click', () => {
            // Electron bắt preview=1 và tạo BrowserWindow trong suốt 1080×1920.
            // Khi chạy bằng browser thường, URL vẫn mở được trong popup để test.
            window.open('/overlay/nhatla?preview=1', 'hp-nhatla-preview');
        });
        $('#nl-btn-reload').addEventListener('click', () => socket?.emit('overlay:reload', { gameId: 'nhatla' }));
        $('#nl-review-frame').addEventListener('load', () => sendEffectEditor(editingEffectId));
        $('#nl-btn-clear').addEventListener('click', () => fetch('/api/games/nhatla/cmd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd: 'clear' }) }).catch(() => {}));
        $('#nl-btn-drop').addEventListener('click', () => fetch('/api/games/nhatla/cmd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd: 'drop', payload: { count: 1 } }) }).catch(() => {}));
        $('#nl-btn-save').addEventListener('click', () => { readRules(); save(true); });
        socket?.on('gameConfig', ({ gameId, config }) => {
            if (gameId !== 'nhatla') return;
            cfg = game.normalizeConfig(config);
            $('#nl-cfg-enabled').checked = cfg.enabled;
            renderDisplay(); renderGifts(); renderEffects(); renderRescue(); renderTopDonors();
        });
        socket?.on('nhatla:top', data => {
            topList = Array.isArray(data?.list) ? data.list : [];
            renderTopList();
        });
    }

    async function open(sharedSocket) {
        socket = sharedSocket || window.io();
        document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
        root()?.classList.add('active');
        try {
            const response = await fetch('/api/games/nhatla/config');
            cfg = game.normalizeConfig(await response.json());
        } catch (e) { cfg = game.defaultConfig(); }
        // Nạp lại mỗi lần mở tab, không cache: người dùng có thể vừa thả thêm một bộ ảnh
        // vào skins/ hoặc thêm ảnh vào thư mục Tuỳ chỉnh trên Desktop.
        await loadSkinCatalog();
        $('#nl-cfg-enabled').checked = cfg.enabled;
        renderDisplay(); renderGifts(); renderEffects(); renderRescue(); renderTopDonors(); setTab(currentTab);
        // Bảng TOP sống trong RAM server; mở lại tab giữa buổi phải kéo về chứ không đợi quà kế tiếp.
        fetch('/api/nhatla/top').then(r => r.json()).then(data => {
            topList = Array.isArray(data?.list) ? data.list : [];
            renderTopList();
        }).catch(() => {});
        if (!initialized) { initialized = true; bindShell(); }
    }

    window.HpNhatLaPanel = { open };
})();
