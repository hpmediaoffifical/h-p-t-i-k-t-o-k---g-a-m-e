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
    let skinCatalog = { hat: [], thung: [], tui: [] };
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
        // Ô xem trước bảng quà scale theo bề ngang thật của nó. Pane đang ẩn thì bề ngang
        // đo ra 0 và sân khấu co về vô hình, nên phải đo LẠI đúng lúc pane vừa hiện ra.
        if (tab === 'giftboard') renderBoardPreview();
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

    // Cùng khuôn với rangeRow nhưng đọc/ghi cfg.bags. Không gộp làm một hàm nhận tên khối:
    // hai nhóm này đi hai đường relay khác nhau (display vs bags) nên handler cũng phải khác,
    // gộp lại rồi vẫn phải tách ở chỗ nghe sự kiện.
    function bagsRangeRow(label, key, min, max, suffix, help) {
        const value = Math.round(Number(cfg.bags[key]) || 0);
        return `<label class="nhatla-range-row"><span><b>${label}</b><small>${help || ''}</small></span><input type="range" min="${min}" max="${max}" value="${value}" data-bags-range="${key}"><output>${value}${suffix}</output></label>`;
    }

    async function loadSkinCatalog() {
        try {
            const data = await (await fetch('/api/nhatla/skins', { cache: 'no-store' })).json();
            skinCatalog = { hat: data.hat || [], thung: data.thung || [], tui: data.tui || [] };
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

    // Ảnh túi cố tình KHÔNG dùng skinPicker(): thẻ to như bộ lá/thùng sẽ chiếm hết thẻ Túi
    // nợ vốn đã dài, mà đây chỉ là một icon nhỏ xíu trên overlay. Đổi lấy một nút hiện ảnh
    // đang dùng, bấm mới xổ hàng ảnh ra chọn.
    function bagSkinPicker() {
        const list = skinCatalog.tui || [];
        if (!list.length) return '';
        const current = list.find(s => s.id === cfg.display.bagSkin) || list[0];
        return `
            <div class="nhatla-bagskin">
                <button id="nl-bag-skin" class="nhatla-bagskin-now" title="Bấm để đổi ảnh túi" aria-expanded="false">
                    <img src="${esc(skinThumb(current))}" alt="">
                    <span>Ảnh túi: <b>${esc(current.name || current.id)}</b></span>
                    <i>▾</i>
                </button>
                <div id="nl-bag-skin-list" class="nhatla-bagskin-list" hidden>
                    ${list.map(skin => `
                        <button class="nhatla-bagskin-item${skin.id === current.id ? ' selected' : ''}" data-bag-skin="${esc(skin.id)}" title="${esc(skin.name || skin.id)}">
                            <img src="${esc(skinThumb(skin))}" alt="" loading="lazy">
                        </button>`).join('')}
                </div>
            </div>`;
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
                ${rangeRow('Đầy màn hình khi đạt trần', 'pileFillPercent', 30, 100, '%', 'Đủ <b>Số lá tối đa</b> ở dưới thì đống lá cao bằng ngần này màn hình — lá tự chồng thưa hay khít cho vừa mốc đó, không phải chỉnh tay. Đặt trần càng thấp thì lá càng phải nằm thưa, dưới ~700 lá sẽ bắt đầu nhìn thủng xuống nền')}
                <label class="nhatla-number-row">Số lá tối đa trên màn hình <input id="nl-max-leaves" type="number" min="50" max="20000" value="${Math.round(cfg.drop.maxLeaves)}"></label>
                <label class="nhatla-number-row">Khoảng cách khi rơi nhiều lá (ms) <input id="nl-spawn-gap" type="number" min="0" max="2000" value="${Math.round(cfg.drop.spawnGapMs)}"></label>
            </div>
            <div class="nhatla-card">
                <h3>🗑 Túi nợ</h3>
                <p class="nhatla-muted">Lá vượt quá <b>Số lá tối đa trên màn hình</b> ở trên không rơi thêm mà được đóng thành từng bọc rác đen chờ sẵn. Idol dọn sạch màn hình thì bọc kế tiếp tự bung ra, đổ lá xuống rồi biến khỏi danh sách. Đây là cần gạt chống lag mạnh nhất: máy chỉ bao giờ vẽ đúng số lá bạn cho phép, dù có nhận về bao nhiêu quà.</p>
                ${bagSkinPicker()}
                <label class="toggle-row nhatla-toggle"><input id="nl-bags-enabled" type="checkbox" ${cfg.bags.enabled !== false ? 'checked' : ''}><span>Bật túi nợ</span></label>
                <label class="toggle-row nhatla-toggle"><input id="nl-bags-show" type="checkbox" ${cfg.bags.showList !== false ? 'checked' : ''}><span>Hiện danh sách túi trên overlay</span></label>
                <label class="nhatla-number-row">Số lá mỗi túi <input id="nl-bags-size" type="number" min="100" max="20000" value="${Math.round(cfg.bags.size)}"></label>
                <label class="nhatla-number-row">Bung túi khi màn hình còn ≤ <input id="nl-bags-open" type="number" min="0" max="${Math.max(0, Math.round(cfg.drop.maxLeaves) - 1)}" value="${Math.round(cfg.bags.openAtLeaves)}"> lá</label>
                <label class="nhatla-number-row">Khoảng cách khi đổ túi (ms) <input id="nl-bags-pour" type="number" min="0" max="200" value="${Math.round(cfg.bags.pourGapMs)}"></label>
                <label class="nhatla-number-row">Vẽ tối đa bao nhiêu túi <input id="nl-bags-icons" type="number" min="1" max="40" value="${Math.round(cfg.bags.maxIcons)}"></label>
                <label class="nhatla-number-row">Xếp túi
                    <select id="nl-bags-orient">
                        <option value="horizontal" ${cfg.bags.orientation !== 'vertical' ? 'selected' : ''}>Ngang</option>
                        <option value="vertical" ${cfg.bags.orientation === 'vertical' ? 'selected' : ''}>Dọc</option>
                    </select>
                </label>
                ${bagsRangeRow('Ngang', 'xPercent', 0, 95, '%', 'Kéo trực tiếp được trong Review hoặc cửa sổ Overlay')}
                ${bagsRangeRow('Dọc', 'yPercent', 0, 95, '%', 'Kéo trực tiếp được trong Review hoặc cửa sổ Overlay')}
                ${bagsRangeRow('Kích thước', 'scale', 30, 300, '%', 'Phóng cả cụm túi lẫn chữ đếm')}
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
        $('#nl-max-leaves').addEventListener('change', event => {
            cfg.drop.maxLeaves = game.clamp(event.target.value, 50, 20000);
            // Ngưỡng bung túi phải nhỏ hơn trần màn hình, nếu không điều kiện bung luôn đúng
            // ngay cả lúc màn hình đang đầy — kho xả thẳng ra, mất sạch tác dụng chống lag.
            // Sửa tại chỗ thuộc tính max thay vì renderDisplay() vì lý do như syncBinYMax().
            const open = $('#nl-bags-open');
            open.max = Math.max(0, cfg.drop.maxLeaves - 1);
            if (Number(open.value) > Number(open.max)) {
                open.value = open.max;
                cfg.bags.openAtLeaves = Number(open.max);
            }
            save();
        });
        $('#nl-spawn-gap').addEventListener('change', event => { cfg.drop.spawnGapMs = game.clamp(event.target.value, 0, 2000); save(); });
        // Toạ độ/cỡ đi đường transient cho overlay nhúc nhích ngay theo thanh trượt; số lá mỗi
        // túi và ngưỡng bung cũng đi đường đó vì overlay cần đếm lại số túi tức thì.
        const relayBags = () => socket?.emit('nhatla:transient', { type: 'bags', bags: { ...cfg.bags } });
        $$('[data-bags-range]', $('#nl-display-pane')).forEach(input => input.addEventListener('input', () => {
            cfg.bags[input.dataset.bagsRange] = Number(input.value);
            input.nextElementSibling.textContent = input.value + '%';
            relayBags();
            save();
        }));
        $('#nl-bags-enabled').addEventListener('change', event => { cfg.bags.enabled = event.target.checked; relayBags(); save(); });
        $('#nl-bags-show').addEventListener('change', event => { cfg.bags.showList = event.target.checked; relayBags(); save(); });
        $('#nl-bags-size').addEventListener('change', event => { cfg.bags.size = game.clamp(event.target.value, 100, 20000); relayBags(); save(); });
        $('#nl-bags-open').addEventListener('change', event => { cfg.bags.openAtLeaves = game.clamp(event.target.value, 0, Math.max(0, cfg.drop.maxLeaves - 1)); relayBags(); save(); });
        $('#nl-bags-pour').addEventListener('change', event => { cfg.bags.pourGapMs = game.clamp(event.target.value, 0, 200); relayBags(); save(); });
        $('#nl-bags-icons').addEventListener('change', event => { cfg.bags.maxIcons = game.clamp(event.target.value, 1, 40); relayBags(); save(); });
        $('#nl-bags-orient').addEventListener('change', event => { cfg.bags.orientation = event.target.value; relayBags(); save(); });
        bindBagSkinPicker();
    }

    function bindBagSkinPicker() {
        const button = $('#nl-bag-skin');
        const list = $('#nl-bag-skin-list');
        if (!button || !list) return;
        button.addEventListener('click', () => {
            list.hidden = !list.hidden;
            button.setAttribute('aria-expanded', String(!list.hidden));
        });
        list.addEventListener('click', event => {
            const item = event.target.closest('[data-bag-skin]');
            if (!item) return;
            list.hidden = true;
            button.setAttribute('aria-expanded', 'false');
            if (item.classList.contains('selected')) return;
            cfg.display.bagSkin = item.dataset.bagSkin;
            // Cập nhật tại chỗ thay vì renderDisplay(): vẽ lại cả thẻ Túi nợ chỉ để đổi một
            // cái ảnh sẽ ném người dùng về đầu danh sách, mà thẻ này nằm cuối tab.
            const skin = (skinCatalog.tui || []).find(s => s.id === item.dataset.bagSkin);
            $('img', button).src = skinThumb(skin);
            $('b', button).textContent = skin.name || skin.id;
            $$('[data-bag-skin]', list).forEach(el => el.classList.toggle('selected', el === item));
            // Cùng lý do với hai bộ skin kia: id là chuỗi, đường transient chỉ relay được số
            // nên phải đi POST /config để server broadcast cho overlay đổi ảnh ngay.
            save(true);
        });
    }

    function renderGifts() {
        const rules = cfg.giftRules || [];
        $('#nl-gifts-pane').innerHTML = `
            <div class="nhatla-card">
                <h3>🎁 Quà chỉ định</h3>
                <p class="nhatla-muted">Quà không có rule riêng tự tính theo coin. Vẫn có thể thêm quà riêng để chỉnh số lá theo ý.</p>
                <label class="nhatla-number-row">Quà không nằm trong danh sách: <input id="nl-coins-per-leaf" type="number" min="0" max="5000" value="${Math.round(cfg.coinsPerLeaf)}"> 💎 = 1 lá</label>
                <p class="nhatla-muted">Nhập <b>0</b>: không ghi nhận lá. Nhập <b>1</b>: 1 💎 = 1 lá. Nhập <b>5</b>: 5 💎 = 1 lá.</p>
                <div class="nhatla-gift-head"><span>Quà TikTok</span><span>Số lá rơi</span><span></span><span></span></div>
                <div id="nl-gift-rules">${rules.map((rule, index) => `
                    <div class="nhatla-gift-rule" data-rule="${index}">
                        <button class="nhatla-gift-select ${rule.giftId ? 'selected' : ''}" data-rule-select title="Chọn quà TikTok">${giftButtonMarkup(rule)}</button>
                        <input data-rule-count type="number" min="0" max="5000" value="${Math.round(Number(rule.count) || 1)}">
                        <button class="ghost tiny" data-rule-test title="Thả thử đúng số lá của dòng này — test hoặc bù lá cho người chơi khi lag">🍂</button>
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
        // Thả thử ngay trên từng dòng quà: đọc số lá đang gõ trong ô (chưa cần bấm Lưu quà) nên
        // vừa dùng để test rule mới, vừa bù lá tay cho người chơi khi LIVE lag mất quà.
        $$('[data-rule-test]', $('#nl-gift-rules')).forEach(button => button.addEventListener('click', event => {
            const row = event.currentTarget.closest('[data-rule]');
            dropLeaves(Number($('[data-rule-count]', row).value));
        }));
        $('#nl-test-gift').addEventListener('click', () => dropLeaves(Number($('#nl-test-count').value)));
    }

    function dropLeaves(count) {
        const total = game.clamp(count, 1, 5000);
        fetch('/api/games/nhatla/cmd', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cmd: 'drop', payload: { count: total } })
        }).catch(() => {});
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
                        <button class="nhatla-gift-select nhatla-gift-compact ${action.giftId ? 'selected' : ''}" data-rescue-gift title="${action.giftId ? `Quà kích hoạt: ${esc(action.giftName || 'Quà TikTok')} — bấm để đổi` : 'Chọn quà TikTok'}">${giftButtonMarkup(action, true)}</button>
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

    // compact = chỉ icon + số kim cương (dòng Giải cứu đã có tên hành động riêng, tên quà chỉ tổ chật).
    function giftButtonMarkup(rule, compact) {
        if (!rule?.giftId) return `<span class="nhatla-gift-placeholder">🎁${compact ? '' : ' Chọn quà'}</span>`;
        const icon = rule.giftImage ? `<img src="${esc(rule.giftImage)}" alt="" onerror="this.remove()">` : '<span class="nhatla-gift-icon">🎁</span>';
        const name = compact ? '' : `<span class="nhatla-gift-name">${esc(rule.giftName || 'Quà TikTok')}</span>`;
        return `${icon}${name}<span class="nhatla-gift-coin">${Math.round(Number(rule.diamond) || 0)} 💎</span>`;
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

    /* ====================================================================
       📋 BẢNG QUÀ
       ====================================================================
       Bảng hiện ở overlay RIÊNG /overlay/nhatla-gifts (browser source thứ hai
       trong OBS) — xem ghi chú giftBoard trong game.js về lý do không nhét
       chung với overlay lá.

       Tab này KHÔNG có danh sách quà riêng: nó soi lại ba nguồn đã gán quà
       sẵn ở các tab khác. Mỗi dòng cho sửa nhãn hiển thị và hai công tắc:
         👁  boardHidden — chỉ giấu khỏi bảng, quà VẪN kích hoạt bình thường
         ⏻  enabled     — tắt hẳn, quà không kích hoạt gì nữa (dùng khi quà lỗi)
       ==================================================================== */

    // Ba nguồn quà, kèm cách suy ra nhãn mặc định khi người dùng chưa đặt nhãn riêng.
    function boardGroups() {
        return [
            {
                key: 'rule', title: '🍂 Quà rơi lá', list: cfg.giftRules || [],
                autoLabel: rule => (Number(rule.count) > 0 ? `${Math.round(rule.count)} lá` : '(chưa đặt số lá)')
            },
            {
                key: 'effect', title: '✨ Hiệu ứng', list: cfg.effects.effectGifts || [],
                autoLabel: rule => rule.name || rule.giftName || '(chưa đặt tên)'
            },
            {
                key: 'rescue', title: '🛟 Giải cứu', list: cfg.rescue.actions || [],
                autoLabel: action => action.name || '(chưa đặt tên)'
            }
        ];
    }

    function boardRangeRow(label, key, min, max, help) {
        const value = Math.round(Number(cfg.giftBoard[key]) || 0);
        return `<label class="nhatla-range-row"><span><b>${label}</b><small>${help || ''}</small></span><input type="range" min="${min}" max="${max}" value="${value}" data-board-range="${key}"><output>${value}%</output></label>`;
    }

    function boardOverlayUrl() {
        return window.buildOverlayURL
            ? window.buildOverlayURL('/overlay/nhatla-gifts')
            : `${location.origin}/overlay/nhatla-gifts`;
    }

    // Đẩy thẳng sang overlay bảng, không đợi save() (debounce 260ms). Gửi kèm entries đã
    // tính sẵn vì server chưa có config mới trên đĩa lúc người dùng còn đang gõ.
    function relayBoard() {
        socket?.emit('nhatla:transient', {
            type: 'giftboard',
            giftBoard: { ...cfg.giftBoard },
            entries: game.giftBoardEntries(cfg)
        });
    }

    // Vẽ lại RIÊNG ô xem trước. Gọi hàm này thay vì renderGiftBoard() sau mỗi phím gõ —
    // vẽ lại cả pane sẽ thay luôn ô input đang có con trỏ, mất focus giữa chừng.
    function renderBoardPreview() {
        const host = $('#nl-board-preview');
        if (!host) return;
        const entries = game.giftBoardEntries(cfg);
        game.giftBoardPaint($('#nl-board-preview-board'), cfg, entries);
        // Sân khấu xem trước là bản 1080×1920 thu nhỏ, nhờ vậy vị trí và cỡ chữ trong ô
        // khớp đúng tỉ lệ với bảng thật trên OBS.
        //
        // Chặn theo CHIỀU CAO chứ không chỉ theo bề ngang: sân khấu cao 1920, vừa hết bề
        // ngang một cột panel ~940px là ô cao hơn 1600px — cao hơn cả màn hình, phải cuộn
        // mãi mới thấy bảng nằm ở góc trên. PREVIEW_MAX_H giữ ô luôn liếc một cái là thấy.
        //
        // Đo bề ngang của THẺ CHA, không đo chính `host`: bên dưới có gán lại width cho
        // host, đo lại chính nó là lần vẽ sau ăn theo lần trước rồi co dần về 0.
        const PREVIEW_MAX_H = 460;
        const avail = host.parentElement?.clientWidth || 320;
        const scale = Math.min(avail / 1080, PREVIEW_MAX_H / 1920);
        $('#nl-board-preview-stage').style.transform = `scale(${scale})`;
        host.style.width = `${Math.round(1080 * scale)}px`;
        host.style.height = `${Math.round(1920 * scale)}px`;
        $('#nl-board-empty').hidden = entries.length > 0;
    }

    function renderGiftBoard() {
        const board = cfg.giftBoard;
        const scroll = board.autoScroll;
        const groups = boardGroups();
        const rows = groups.map(group => {
            if (!group.list.length) return '';
            return `<div class="nhatla-board-group"><h4>${group.title}</h4>${group.list.map((item, index) => {
                const auto = group.autoLabel(item);
                const off = item.enabled === false;
                const hidden = item.boardHidden === true;
                return `<div class="nhatla-board-row ${off ? 'is-off' : ''}" data-board-src="${group.key}" data-board-index="${index}">
                    <img class="nhatla-board-ico" src="${esc(item.giftImage || '/hp-logo.png')}" alt="" onerror="this.onerror=null;this.src='/hp-logo.png'">
                    <span class="nhatla-board-gift" title="${esc(item.giftName || 'Chưa gán quà')}">${esc(item.giftName || '— chưa gán quà —')}</span>
                    <input class="nhatla-board-label" data-board-label type="text" maxlength="60" value="${esc(item.label || '')}" placeholder="${esc(auto)}" title="Tên người xem thấy trên bảng. Để trống thì dùng: ${esc(auto)}">
                    <button class="ghost tiny ${hidden ? '' : 'is-on'}" data-board-eye title="${hidden ? 'Đang ẩn khỏi bảng — bấm để hiện lại' : 'Đang hiện trên bảng — bấm để ẩn (quà vẫn chạy)'}">${hidden ? '🙈' : '👁'}</button>
                    <button class="ghost tiny ${off ? '' : 'is-on'}" data-board-power title="${off ? 'Đã TẮT HẲN — quà không kích hoạt gì. Bấm để bật lại' : 'Đang chạy — bấm để TẮT HẲN (quà lỗi thì dùng cái này)'}">${off ? '⭘' : '⏻'}</button>
                </div>`;
            }).join('')}</div>`;
        }).join('');

        $('#nl-giftboard-pane').innerHTML = `
            <div class="nhatla-card">
                <h3>📋 Bảng quà cho người xem</h3>
                <p class="nhatla-muted">Bảng liệt kê <b>icon + tên</b> những quà đang có tác dụng, để người xem biết tặng gì thì được gì. Bảng chạy ở <b>browser source riêng</b> trong OBS nên không làm nặng overlay lá.</p>
                <label class="toggle-row nhatla-toggle"><input id="nl-board-enabled" type="checkbox" ${board.enabled !== false ? 'checked' : ''}><span>Bật bảng quà</span></label>
                <div class="nhatla-actions">
                    <button id="nl-board-copy" class="primary small">📋 COPY link bảng quà</button>
                    <button id="nl-board-open" class="ghost small">🪟 Mở thử</button>
                </div>
                <p class="nhatla-muted">Dán link vào OBS → <b>Nguồn → Trình duyệt</b>, cỡ <b>1080 × 1920</b>, nền trong suốt.</p>
            </div>
            <div class="nhatla-card">
                <h3>🎨 Kiểu hiển thị</h3>
                <label class="nhatla-number-row">Xếp thẻ
                    <select id="nl-board-layout">
                        <option value="vertical" ${board.layout === 'vertical' ? 'selected' : ''}>Dọc — xếp chồng từ trên xuống</option>
                        <option value="horizontal" ${board.layout === 'horizontal' ? 'selected' : ''}>Ngang — xếp hàng từ trái sang</option>
                    </select>
                </label>
                <label class="nhatla-number-row">Chữ nằm
                    <select id="nl-board-namepos">
                        <option value="right" ${board.namePos === 'right' ? 'selected' : ''}>Bên phải icon</option>
                        <option value="left" ${board.namePos === 'left' ? 'selected' : ''}>Bên trái icon</option>
                        <option value="bottom" ${board.namePos === 'bottom' ? 'selected' : ''}>Dưới icon</option>
                        <option value="top" ${board.namePos === 'top' ? 'selected' : ''}>Trên icon</option>
                    </select>
                </label>
                <label class="toggle-row nhatla-toggle"><input id="nl-board-diamond" type="checkbox" ${board.showDiamond === true ? 'checked' : ''}><span>Hiện giá quà (💎)</span></label>
                ${boardRangeRow('Cỡ tổng thể', 'scale', 40, 250, 'Phóng to/thu nhỏ cả bảng')}
                ${boardRangeRow('Cỡ icon', 'iconScale', 40, 250, 'Riêng ảnh quà')}
                ${boardRangeRow('Cỡ chữ', 'nameScale', 40, 250, 'Riêng phần chữ')}
                ${boardRangeRow('Giãn cách', 'gap', 0, 400, 'Khoảng hở giữa hai thẻ')}
                ${boardRangeRow('Ngang', 'xPercent', 0, 92, 'Tính từ mép trái overlay')}
                ${boardRangeRow('Dọc', 'yPercent', 0, 92, 'Tính từ mép trên overlay')}
            </div>
            <div class="nhatla-card">
                <h3>🎞 Cuộn tự động</h3>
                <p class="nhatla-muted">Nhiều quà quá thì cho danh sách chạy vòng thay vì kéo dài hết màn hình.</p>
                <label class="toggle-row nhatla-toggle"><input id="nl-board-scroll" type="checkbox" ${scroll.enabled ? 'checked' : ''}><span>Bật cuộn</span></label>
                <label class="nhatla-number-row">Hiện mấy thẻ một lúc <input id="nl-board-visible" type="number" min="2" max="30" value="${Math.round(scroll.visibleCount)}"></label>
                <label class="nhatla-number-row">Chiều chạy
                    <select id="nl-board-dir">
                        <option value="up" ${scroll.direction === 'up' ? 'selected' : ''}>Lên</option>
                        <option value="down" ${scroll.direction === 'down' ? 'selected' : ''}>Xuống</option>
                        <option value="left" ${scroll.direction === 'left' ? 'selected' : ''}>Sang trái</option>
                        <option value="right" ${scroll.direction === 'right' ? 'selected' : ''}>Sang phải</option>
                    </select>
                </label>
                <label class="nhatla-number-row">Mỗi thẻ trôi hết vòng trong <input id="nl-board-speed" type="number" min="0.5" max="20" step="0.5" value="${scroll.speed}"> giây</label>
            </div>
            <div class="nhatla-card">
                <h3>👀 Xem trước</h3>
                <p class="nhatla-muted">Đúng bằng những gì OBS đang hiện. Sửa tên bên dưới là đổi ngay ở đây <b>và</b> trên OBS.</p>
                <div id="nl-board-preview" class="nhatla-board-preview">
                    <div id="nl-board-preview-stage" class="nlb-stage">
                        <div id="nl-board-preview-board" class="nlb-board"></div>
                    </div>
                </div>
                <div id="nl-board-empty" class="nhatla-muted" hidden>Chưa có quà nào để hiện. Gán quà ở tab <b>🎁 Quà chỉ định</b>, <b>✨ Hiệu ứng</b> hoặc <b>🛟 Giải cứu</b> trước.</div>
            </div>
            <div class="nhatla-card">
                <h3>🎁 Quà trên bảng</h3>
                <p class="nhatla-muted"><b>👁</b> chỉ giấu khỏi bảng — quà <b>vẫn chạy</b> bình thường. <b>⏻</b> tắt hẳn — quà không kích hoạt gì nữa, dùng khi quà bị lỗi.</p>
                ${rows || '<div class="nhatla-muted">Chưa gán quà nào.</div>'}
            </div>`;

        renderBoardPreview();

        // ── Thanh trượt & lựa chọn: relay ngay cho OBS bám theo tay, save() có debounce ──
        $$('[data-board-range]', $('#nl-giftboard-pane')).forEach(input => input.addEventListener('input', () => {
            cfg.giftBoard[input.dataset.boardRange] = Number(input.value);
            input.nextElementSibling.textContent = input.value + '%';
            renderBoardPreview(); relayBoard(); save();
        }));
        const pick = (id, apply) => $(id).addEventListener('change', event => {
            apply(event.target);
            renderBoardPreview(); relayBoard(); save();
        });
        pick('#nl-board-enabled', el => { cfg.giftBoard.enabled = el.checked; });
        pick('#nl-board-diamond', el => { cfg.giftBoard.showDiamond = el.checked; });
        pick('#nl-board-layout', el => { cfg.giftBoard.layout = el.value; });
        pick('#nl-board-namepos', el => { cfg.giftBoard.namePos = el.value; });
        pick('#nl-board-scroll', el => { cfg.giftBoard.autoScroll.enabled = el.checked; });
        pick('#nl-board-dir', el => { cfg.giftBoard.autoScroll.direction = el.value; });
        pick('#nl-board-visible', el => { cfg.giftBoard.autoScroll.visibleCount = game.clamp(el.value, 2, 30); });
        pick('#nl-board-speed', el => { cfg.giftBoard.autoScroll.speed = game.clamp(el.value, 0.5, 20); });

        $('#nl-board-copy').addEventListener('click', async event => {
            const button = event.currentTarget;
            const ok = window.hpCopyText ? await window.hpCopyText(boardOverlayUrl()) : false;
            const old = button.dataset.label || button.textContent;
            button.dataset.label = old;
            button.textContent = ok ? '✓ Đã copy' : 'Copy thất bại';
            setTimeout(() => { if (button.isConnected) button.textContent = old; }, 1400);
        });
        $('#nl-board-open').addEventListener('click', () => window.open('/overlay/nhatla-gifts', 'hp-nhatla-board'));

        // ── Từng dòng quà ──
        const itemAt = element => {
            const row = element.closest('[data-board-src]');
            const group = boardGroups().find(entry => entry.key === row.dataset.boardSrc);
            return { row, item: group.list[Number(row.dataset.boardIndex)] };
        };
        // 'input' chứ không phải 'change': người dùng gõ tới đâu OBS đổi tới đó, đúng yêu
        // cầu "sửa tên là tự đổi trong app và OBS". Chỉ vẽ lại ô xem trước, KHÔNG vẽ lại cả
        // pane — vẽ lại pane sẽ thay chính ô đang gõ và cướp mất con trỏ.
        $$('[data-board-label]', $('#nl-giftboard-pane')).forEach(input => input.addEventListener('input', event => {
            itemAt(event.currentTarget).item.label = event.currentTarget.value.slice(0, 60);
            renderBoardPreview(); relayBoard(); save();
        }));
        $$('[data-board-eye]', $('#nl-giftboard-pane')).forEach(button => button.addEventListener('click', event => {
            const { item } = itemAt(event.currentTarget);
            item.boardHidden = !item.boardHidden;
            renderGiftBoard(); relayBoard(); save(true);
        }));
        $$('[data-board-power]', $('#nl-giftboard-pane')).forEach(button => button.addEventListener('click', event => {
            const { item } = itemAt(event.currentTarget);
            item.enabled = item.enabled === false;
            // save(true) không debounce: tắt hẳn thường là lúc quà đang bắn lỗi trên sóng,
            // chậm 260ms là thêm một lượt hiệu ứng hỏng nữa lọt ra.
            renderGiftBoard(); relayBoard(); save(true);
        }));
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
            renderDisplay(); renderGifts(); renderEffects(); renderRescue(); renderTopDonors(); renderGiftBoard();
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
        renderDisplay(); renderGifts(); renderEffects(); renderRescue(); renderTopDonors(); renderGiftBoard(); setTab(currentTab);
        // Bảng TOP sống trong RAM server; mở lại tab giữa buổi phải kéo về chứ không đợi quà kế tiếp.
        fetch('/api/nhatla/top').then(r => r.json()).then(data => {
            topList = Array.isArray(data?.list) ? data.list : [];
            renderTopList();
        }).catch(() => {});
        if (!initialized) { initialized = true; bindShell(); }
    }

    window.HpNhatLaPanel = { open };
})();
