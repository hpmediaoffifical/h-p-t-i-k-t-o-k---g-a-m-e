// 🌐 hpT(): ngôn ngữ giao diện - overlays/lib/hp-i18n.js; trang chưa nạp thì giữ tiếng Việt (chỉ thay {biến}). hpTA(): như hpT, thoát dấu " cho thuộc tính HTML.
var hpT = (typeof globalThis !== 'undefined' && globalThis.hpT) || function (s, v) { return String(s).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, function (m, k) { return v && v[k] != null ? String(v[k]) : m; }); };
var hpTA = function (s, v) { return hpT(s, v).replace(/"/g, '&quot;'); };
/* 🏸 Đá Cầu - panel trong app (🎥 Game Camera). Tự chèn <section id="view-dacau"> vào panel.html.
 * Mẫu theo roiho-panel.js: open(socket) → subscribe preview, nạp config, lưu debounce 350 ms; echo gameConfig chỉ áp khi
 * không phải bản vừa lưu. Bên phải là khung xem trước overlay (review=1&demo=1): người giả tự đá cầu theo cài đặt đang chỉnh.
 * Bảng gọn: 4 thẻ chính luôn hiện, chỉnh sâu nằm trong "▸ Nâng cao". */
(function () {
    'use strict';
    const $ = (sel, root) => (root || document).querySelector(sel);
    const Game = () => (window.HpGame && window.HpGame.dacau) || null;
    let cfg = null, socket = null, bound = false, persistTimer = null, feedStatus = null, feedPoll = null;

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = v => { const n = Number(v); return Number.isInteger(n) ? String(n) : String(+n.toFixed(2)); };
    const norm = c => (Game() ? Game().normalizeConfig(c) : (c || {}));

    function ensureView() {
        if ($('#view-dacau')) return $('#view-dacau');
        const host = ($('#view-dapmuoi') || $('.view')).parentNode;
        const sec = document.createElement('section');
        sec.id = 'view-dacau'; sec.className = 'view game-view dc-view';
        sec.innerHTML = `
            <header class="game-header">
                <div><h2>${hpT('🏸 Đá Cầu')}</h2></div>
                <div class="overlay-bar">
                    <button class="ghost small" onclick="hpOpenGame('camgames')" title="${hpTA('Về Game Camera')}">← Game Camera</button>
                    <button id="dc-btn-test" class="primary small" title="${hpTA('Tung thử 1 quả lên OBS')}">${hpT('▶ Tung thử')}</button>
                    <button id="dc-btn-clear" class="ghost small" title="${hpTA('Xoá cầu đang bay và hàng chờ')}">${hpT('Xoá cầu')}</button>
                    <button id="dc-btn-reset" class="danger small" title="${hpTA('Đặt lại kỷ lục + điểm về 0')}">${hpT('Đặt lại')}</button>
                    <span class="nd-bar-spacer"></span>
                    <button id="dc-btn-copy" class="obs-link small" title="${hpTA('Thêm vào Scene đang chiếu - chưa nối OBS thì copy link')}">${hpT('Thêm vào OBS')}</button>
                    <button id="dc-btn-prev" class="ghost small" title="${hpTA('Bật/tắt khung xem thử - không cần camera')}">${hpT('Xem thử')}</button>
                    <button id="dc-btn-mouse" class="ghost small" title="${hpTA('Mở overlay ở tab mới, thử bằng chuột không cần camera')}">${hpT('Thử bằng chuột')}</button>
                    <button id="dc-btn-reload" class="ghost small" title="${hpTA('Tải lại overlay trong OBS')}">${hpT('Tải lại overlay')}</button>
                </div>
            </header>
            <div class="game-body dc-body">
                <div class="ctc-status" id="dc-status"></div>
                <div class="dc-grid" id="dc-grid">
                    <div class="dc-col" id="dc-settings"></div>
                    <div class="dc-col dc-prev">
                        <div class="dc-prev-bar"><b>${hpT('Xem thử - người giả tự đá')}</b><span><button id="dc-prev-sound" class="ghost small" title="${hpTA('Bật/tắt tiếng khung xem thử')}">🔇</button> <button id="dc-prev-reload" class="ghost small" title="${hpTA('Nạp lại khung xem thử')}">↻</button></span></div>
                        <iframe id="dc-frame" title="${hpTA('Xem trước Đá Cầu')}"></iframe>
                        <div class="hint">${hpT('Chỉ xem thử - không lên OBS, không phạt, không tiếng')}</div>
                    </div>
                </div>
            </div>`;
        host.appendChild(sec);
        const st = document.createElement('style');
        st.textContent = `
            .dc-body { display: flex; flex-direction: column; gap: 10px; padding: 12px; min-height: 0; flex: 1; overflow: auto; }
            .dc-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 14px; align-items: start; }
            .dc-grid.noprev { grid-template-columns: minmax(0, 1fr); } .dc-grid.noprev .dc-prev { display: none; }
            .dc-prev { position: sticky; top: 0; display: flex; flex-direction: column; gap: 8px; }
            .dc-prev-bar { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 13px; }
            #dc-frame { width: 300px; height: 533px; border: 1px solid rgba(255,255,255,.15); border-radius: 10px; background: #12162a; }
            .dc-gift { display: flex; align-items: center; gap: 10px; padding: 6px 4px; border-top: 1px solid rgba(255,255,255,.08); }
            .dc-gift img { width: 34px; height: 34px; object-fit: contain; } .dc-gift b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .dc-gift select { padding: 5px 6px; }
            .dc-seg { display: inline-flex; border: 1px solid rgba(255,255,255,.18); border-radius: 9px; overflow: hidden; }
            .dc-seg button { border: 0; border-radius: 0; background: transparent; padding: 7px 14px; color: inherit; cursor: pointer; font: inherit; }
            .dc-seg button + button { border-left: 1px solid rgba(255,255,255,.18); }
            .dc-seg button.on { background: #ffd54a; color: #1b1405; font-weight: 700; }
            .dc-line { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 8px 0; }
            .dc-line > label:first-child { min-width: 120px; opacity: .85; }
            details.dc-adv { margin-top: 10px; border-top: 1px dashed rgba(255,255,255,.12); padding-top: 8px; }
            details.dc-adv > summary { cursor: pointer; opacity: .8; font-size: 13px; }
            @media (max-width: 900px) { .dc-grid { grid-template-columns: 1fr; } }`;
        document.head.appendChild(st);
        return sec;
    }

    function open(sharedSocket) {
        socket = sharedSocket;
        const view = ensureView();
        document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v === view));
        if (!bound) { bindShell(); bound = true; }
        if (socket && !socket.__dcAttached) {
            socket.__dcAttached = true;
            socket.on('gameConfig', ({ gameId, config }) => {
                if (gameId !== 'dacau' || persistTimer) return;
                const next = norm(config);
                if (cfg && JSON.stringify(next) === JSON.stringify(cfg)) return;
                cfg = next; renderSettings();
            });
        }
        if (socket) socket.emit('subscribe', 'preview');
        loadConfig().then(reloadPreview);
        clearInterval(feedPoll);
        feedPoll = setInterval(pollFeed, 2000);
        pollFeed();
    }
    async function pollFeed() {
        const view = $('#view-dacau');
        if (!view || !view.classList.contains('active')) { clearInterval(feedPoll); feedPoll = null; return; }
        try { feedStatus = (await (await fetch('/api/camgames/feed-status', { cache: 'no-store' })).json()).status || null; }
        catch (e) { feedStatus = null; }
        renderStatus();
    }
    async function loadConfig() {
        try { cfg = norm(await fetch('/api/games/dacau/config', { cache: 'no-store' }).then(r => r.json())); }
        catch (e) { cfg = norm(null); }
        renderSettings();
    }
    function schedulePersist() { clearTimeout(persistTimer); persistTimer = setTimeout(persistConfig, 350); }
    async function persistConfig() {
        persistTimer = null;
        try { await fetch('/api/games/dacau/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) }); }
        catch (e) { console.error('[dacau] lưu config lỗi', e); }
    }
    function flashBtn(btn, text) { const old = btn.textContent; btn.textContent = text; setTimeout(() => { btn.textContent = old; }, 1200); }
    // Khung xem thử: mặc định ẨN + CÂM (nhớ theo máy). Ẩn thì gỡ trang (không tốn CPU, không kêu).
    // Xem thử mặc định TẮT mỗi lần mở app (không nhớ) cho nhẹ máy; rời trang / ẩn menu thì panel.html tự tắt lại (hp-preview-off).
    let prevOn = false, prevSound = false;
    try { prevSound = localStorage.getItem('hpal.dacau.prevSound') === '1'; } catch (_) {}
    function reloadPreview() {
        const f = $('#dc-frame'); if (!f) return;
        $('#dc-grid').classList.toggle('noprev', !prevOn);
        $('#dc-btn-prev').classList.toggle('primary', prevOn);
        $('#dc-prev-sound').textContent = prevSound ? '🔊' : '🔇';
        f.src = prevOn ? '/overlay/dacau?review=1&demo=1&bg=1' + (prevSound ? '' : '&mute=1') : 'about:blank';
    }
    function savePrev() { try { localStorage.setItem('hpal.dacau.prevSound', prevSound ? '1' : '0'); } catch (_) {} reloadPreview(); }
    const control = cmd => fetch('/api/dacau/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd }) }).catch(() => {});

    // Tung thử ĐÚNG loại cầu (trước đây gửi body rỗng → server luôn tung cầu thường dù quà đã chọn loại khác).
    async function tungThu(type, btn) {
        if (persistTimer) { clearTimeout(persistTimer); await persistConfig(); }   // vừa đổi loại cầu → lưu trước rồi mới tung
        try {
            const r = await fetch('/api/dacau/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type }) });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || j.ok === false) window.toast?.(j.error || hpT('Không tung thử được'), 'error');
            else if (btn) flashBtn(btn, '✓');
        } catch (e) { window.toast?.(hpT('Không gọi được server'), 'error'); }
    }
    function bindShell() {
        $('#dc-btn-copy').addEventListener('click', () => {
            const url = window.buildOverlayURL ? window.buildOverlayURL('/overlay/camgames') : (location.origin + '/overlay/camgames');
            if (window.hpObsQuick) { window.hpObsQuick(url, 'Game Camera').then((m) => flashBtn($('#dc-btn-copy'), m)); return; }
            if (window.hpCopyText) window.hpCopyText(url); else navigator.clipboard.writeText(url).catch(() => {});
            flashBtn($('#dc-btn-copy'), hpT('Đã copy'));
        });
        $('#dc-btn-mouse').addEventListener('click', () => window.open('/overlay/dacau?mouse=1&bg=1', '_blank'));
        $('#dc-btn-reload').addEventListener('click', () => { if (socket) socket.emit('overlay:reload', { gameId: 'dacau' }); flashBtn($('#dc-btn-reload'), '✓'); });
        $('#dc-btn-clear').addEventListener('click', () => { control('clear'); flashBtn($('#dc-btn-clear'), '✓'); });
        $('#dc-btn-reset').addEventListener('click', () => { control('reset'); flashBtn($('#dc-btn-reset'), '✓'); });
        // ▶ Tung thử (đầu trang) = loại cầu của quà ĐẦU TIÊN trong danh sách; chưa có quà thì cầu thường.
        $('#dc-btn-test').addEventListener('click', () => tungThu((cfg && cfg.gifts[0] && cfg.gifts[0].ball) || 'normal', $('#dc-btn-test')));
        $('#dc-prev-reload').addEventListener('click', reloadPreview);
        $('#dc-btn-prev').addEventListener('click', () => { prevOn = !prevOn; const f = $('#dc-frame'); if (f) f.dataset.hpOff = prevOn ? '0' : '1'; savePrev(); });
        $('#dc-frame').addEventListener('hp-preview-off', () => { prevOn = false; reloadPreview(); });
        $('#dc-prev-sound').addEventListener('click', () => { prevSound = !prevSound; savePrev(); });
    }

    function renderStatus() {
        const el = $('#dc-status'); if (!el) return;
        const chips = [];
        const fs = feedStatus || {};
        if (fs.obsConnected === false) chips.push(`<span class="ctc-chip warn">${hpT('Chưa kết nối OBS')}</span>`);
        else if (!fs.source) chips.push(`<span class="ctc-chip warn">${hpT('Chưa chọn nguồn camera - chọn ở Game Camera')}</span>`);
        else if (fs.error) chips.push(`<span class="ctc-chip warn">📷 ${esc(fs.source)} - ${esc(fs.error)}</span>`);
        else chips.push(`<span class="ctc-chip ${fs.live ? 'ok' : 'warn'}">📷 ${esc(fs.source)}${fs.live ? hpT(' · {v} hình/s', { v: fs.fps || 0 }) : hpT(' - chưa có hình')}</span>`);
        const ov = fs.overlays ? fs.overlays.dacau : null;
        if (ov) chips.push(`<span class="ctc-chip ${ov.pose ? 'ok' : ''}">${ov.pose ? hpT('thấy người') : hpT('chưa thấy người')}${ov.pose ? (ov.knees ? hpT(' · 🦵 thấy đầu gối') : hpT(' · 🦵 chưa thấy đầu gối (chỉ đỡ bằng đầu)')) : ''} · ${Math.round(ov.fps || 0)} khung/s</span>`);
        else chips.push(`<span class="ctc-chip dim">${hpT('Overlay chưa gửi tín hiệu - mở link Game Camera và chọn Chơi Đá Cầu')}</span>`);
        if (cfg && !cfg.gifts.length) chips.push(`<span class="ctc-chip warn">${hpT('Chưa chọn quà tung cầu')}</span>`);
        el.innerHTML = chips.join(' ');
    }

    function row(key, label, min, max, step, val, unit, hint) {
        return `<div class="ctc-row" data-k="${key}"><label>${label}</label>
            <input type="range" min="${min}" max="${max}" step="${step}" value="${fmt(val)}" />
            <input type="number" min="${min}" max="${max}" step="${step}" value="${fmt(val)}" />
            <span class="unit">${unit}</span>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
    }
    function seg(key, opts, cur) {
        return `<span class="dc-seg" data-seg="${key}">${opts.map(([v, t]) => `<button type="button" data-v="${v}" class="${v === cur ? 'on' : ''}">${t}</button>`).join('')}</span>`;
    }

    function renderSettings() {
        const host = $('#dc-settings'); if (!host || !cfg) return;
        const G = Game();
        const types = G ? G.BALL_TYPES : { normal: { icon: '🏸', name: 'Cầu thường' } };
        const D = cfg.display;
        host.innerHTML = `
            <div class="ctc-card">
                <h3>${hpT('QUÀ TUNG CẦU')}</h3>
                <div id="dc-gifts">${cfg.gifts.map((g, i) => `<div class="dc-gift">${g.giftImage ? `<img src="${esc(g.giftImage)}" alt="">` : '🎁'}<b title="${esc(g.giftName)}">${esc(g.giftName || (hpT('Quà #{giftId}', { giftId: g.giftId })))}</b>
                    <select data-ball="${i}" title="${hpTA('Loại cầu')}">${Object.entries(types).map(([id, t]) => `<option value="${id}" ${g.ball === id ? 'selected' : ''}>${t.icon} ${esc(t.name)}</option>`).join('')}</select>
                    <button class="ghost small" data-try="${i}" title="${hpTA('Tung thử đúng loại cầu của quà này lên OBS')}">▶</button>
                    <button class="ghost small" data-del="${i}" title="${hpTA('Bỏ quà này')}">✕</button></div>`).join('') || `<div class="hint">${hpT('Chưa có quà nào.')}</div>`}</div>
                <button id="dc-gift-add" class="small">${hpT('＋ Thêm quà')}</button>
                <div class="hint">${hpT('Mỗi quà tung 1 quả từ dưới lên (combo ×N = N quả, tối đa 5). Tên người tặng + số chạm bay theo quả cầu. Quà to nên chọn 🟡 vàng / 🔥 lửa; 🎈 khổng lồ để chủ live dễ gỡ điểm.')}</div>
            </div>
            <div class="ctc-card">
                <h3>${hpT('CÁCH CHƠI')}</h3>
                <div class="dc-line"><label>${hpT('Độ khó')}</label>${seg('difficulty', [['easy', hpT('Dễ')], ['normal', hpT('Vừa')], ['hard', hpT('Khó')]], cfg.difficulty)}</div>
                <div class="dc-line"><label>${hpT('Đỡ bằng')}</label>${seg('parts', [['both', hpT('🙆 Đầu + 🦵 Đùi')], ['head', hpT('Chỉ đầu')], ['thigh', hpT('Chỉ đùi')]], cfg.parts)}</div>
                <label class="ctc-toggle"><input type="checkbox" id="dc-lift" ${cfg.requireLift ? 'checked' : ''}> ${hpT('Phải')} <b>${hpT('nhấc lên')}</b> ${hpT('mới tính (đứng yên thì cầu rơi xuyên qua)')}</label>
                ${row('maxBalls', hpT('Cầu bay cùng lúc'), 1, 5, 1, cfg.maxBalls, hpT('quả'), hpT('Nhiều quà dồn tới: tung tối đa từng ấy quả cùng lúc, quả dư xếp hàng (hiện ⏳ trên màn).'))}
                ${row('floorPercent', hpT('Vạch sàn'), 50, 100, 1, cfg.floorPercent, '% cao', hpT('Cầu rơi qua vạch này là chết. Camera không thấy chân thì kéo lên ngang đầu gối.'))}
                <div class="hint">${hpT('Camera cần thấy')} <b>${hpT('đầu + hông + đầu gối')}</b>${hpT('. Không thấy đầu gối thì game tự báo "đỡ bằng ĐẦU" - vẫn chơi được.')}</div>
                <details class="dc-adv"><summary>${hpT('Nâng cao')}</summary>
                    ${row('hitScale', hpT('Vùng chạm'), 50, 200, 5, cfg.hitScale, '%', hpT('Lớn: dễ trúng hơn.'))}
                    ${row('headPower', hpT('Độ mạnh đội đầu'), 30, 250, 10, cfg.headPower, '%', hpT('Cầu rơi qua đầu trước - chỉ cú ĐỘI ĐẦU rõ ràng mới đỡ. Hay nảy nhầm khi lắc đầu → tăng; đội mà không ăn → giảm.'))}
                    ${row('latencyMs', hpT('Bù trễ camera'), 0, 400, 10, cfg.latencyMs, 'ms', hpT('Đỡ đúng mà không ăn → tăng lên.'))}
                    ${row('rampEvery', hpT('Tăng tốc mỗi'), 0, 50, 1, cfg.rampEvery, hpT('chạm'), hpT('0 = không tăng.'))}
                    ${row('rampPct', hpT('Mỗi lần nhanh thêm'), 0, 30, 1, cfg.rampPct, '%')}
                </details>
            </div>
            ${window.HpCamFxPool ? `            <div class="ctc-card">
                <label class="ctc-toggle" style="margin-bottom:6px"><input type="checkbox" id="dc-fxon" ${cfg.fxOnDrop ? 'checked' : ''}> <b>${hpT('Cầu rơi xuống sàn → bật hiệu ứng phạt')}</b> ${hpT('(Rổ PHẠT bên dưới, để trống = chơi bình thường)')}</label>
                ${row('safeAfter', hpT('Miễn phạt khi đỡ đủ'), 0, 200, 1, cfg.safeAfter, hpT('chạm'), hpT('Đỡ được từng ấy chạm rồi mới rơi thì không phạt. 0 = lần rơi nào cũng phạt.'))}
                <div id="dc-fx"></div>
            </div>` : ''}
            <div class="ctc-card">
                <h3>${hpT('HIỂN THỊ')}</h3>
                <label class="ctc-toggle"><input type="checkbox" data-d="showHud" ${D.showHud ? 'checked' : ''}> ${hpT('Số chạm trên màn')}</label>
                <label class="ctc-toggle"><input type="checkbox" data-d="showStats" ${D.showStats ? 'checked' : ''}> ${hpT('Dòng 🏆 Kỷ lục - ⭐ điểm')}</label>
                ${row('d.hudY', hpT('Vị trí lên ↕ xuống'), 0, 80, 1, D.hudY, hpT('% từ trên'), hpT('Kéo để đặt số chạm + kỷ lục cao / thấp trên màn (0 = sát mép trên). Mặt lọt vào chỗ đó thì chữ vẫn tự dạt sang góc.'))}
                <label class="ctc-toggle"><input type="checkbox" data-d="showGuide" ${D.showGuide ? 'checked' : ''}> ${hpT('Vòng báo chỗ cầu sắp rơi')}</label>
                <label class="ctc-toggle"><input type="checkbox" data-d="showNames" ${D.showNames ? 'checked' : ''}> ${hpT('Tên người tặng trên quả cầu')}</label>
                <label class="ctc-toggle"><input type="checkbox" data-d="showZones" ${D.showZones ? 'checked' : ''}> ${hpT('Vẽ vùng chạm + vạch sàn trên OBS (để căn chỉnh, live thì tắt)')}</label>
                <label class="ctc-toggle"><input type="checkbox" id="dc-sound" ${cfg.sound.enabled ? 'checked' : ''}> ${hpT('Âm thanh "bộp"')}</label>
                ${row('volume', hpT('Âm lượng'), 0, 1, 0.05, cfg.sound.volume, '')}
            </div>
            <div class="ctc-card">
                <h3>${hpT('DANH SÁCH NGƯỜI TẶNG QUÀ')}</h3>
                ${row('d.listXPercent', hpT('Vị trí ngang'), 0, 100, 1, D.listXPercent ?? 50, '%')}
                ${row('d.listYPercent', hpT('Vị trí dọc'), 0, 95, 1, D.listYPercent ?? 80, '%')}
                ${row('d.listScale', hpT('Cỡ chữ'), 30, 300, 5, D.listScale ?? 90, '%')}
            </div>`;
        host.querySelectorAll('[data-try]').forEach(b => b.addEventListener('click', () => tungThu(cfg.gifts[Number(b.dataset.try)].ball, b)));
        host.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { cfg.gifts.splice(Number(b.dataset.del), 1); renderSettings(); schedulePersist(); }));
        host.querySelectorAll('[data-ball]').forEach(s => s.addEventListener('change', () => { cfg.gifts[Number(s.dataset.ball)].ball = s.value; schedulePersist(); }));
        $('#dc-gift-add').addEventListener('click', openGiftPicker);
        host.querySelectorAll('[data-seg]').forEach(el => el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
            cfg[el.dataset.seg] = b.dataset.v;
            el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
            schedulePersist();
        })));
        $('#dc-lift').addEventListener('change', e => { cfg.requireLift = e.target.checked; schedulePersist(); });
        $('#dc-fxon')?.addEventListener('change', e => { cfg.fxOnDrop = e.target.checked; schedulePersist(); });
        $('#dc-sound').addEventListener('change', e => { cfg.sound.enabled = e.target.checked; schedulePersist(); });
        host.querySelectorAll('[data-d]').forEach(c => c.addEventListener('change', () => { cfg.display[c.dataset.d] = c.checked; schedulePersist(); }));
        host.querySelectorAll('.ctc-row[data-k]').forEach(r => {
            const key = r.dataset.k, range = r.querySelector('input[type=range]'), numEl = r.querySelector('input[type=number]');
            const apply = v => {
                const n = Number(v); if (!Number.isFinite(n)) return;
                if (key === 'volume') cfg.sound.volume = n; else if (key.startsWith('d.')) cfg.display[key.slice(2)] = n; else cfg[key] = n;
                range.value = n; numEl.value = fmt(n); schedulePersist();
            };
            range.addEventListener('input', () => apply(range.value));
            numEl.addEventListener('change', () => apply(numEl.value));
        });
        if (window.HpCamFxPool) window.HpCamFxPool.render($('#dc-fx'), { game: 'dacau', cfg, onChange: schedulePersist });
        renderStatus();
    }

    // Chọn quà - cùng khung .nd-gp-* của các panel khác.
    let picker = null;
    async function openGiftPicker() {
        if (!Array.isArray(window.__giftSheet) || !window.__giftSheet.length) {
            try { const r = await fetch('/api/gifts'); if (r.ok) window.__giftSheet = (await r.json()).slice().sort((a, b) => (a.diamond || 0) - (b.diamond || 0)); } catch (e) {}
        }
        if (!picker) {
            picker = document.createElement('div');
            picker.className = 'nd-gp-overlay'; picker.hidden = true;
            picker.innerHTML = `<div class="nd-gp-modal"><div class="nd-gp-head"><div class="nd-gp-title">${hpT('Chọn quà tung cầu')}</div><button class="nd-gp-close ghost small">✕</button></div>
                <input class="nd-gp-search" type="text" placeholder="${hpTA('Tìm quà hoặc ID…')}" /><div class="nd-gp-list"></div>
                <div class="nd-gp-hint">${hpT('Bấm vào quà để thêm. Quà đã chọn có dấu ✓.')}</div></div>`;
            document.body.appendChild(picker);
            picker.addEventListener('click', e => { if (e.target === picker) picker.hidden = true; });
            picker.querySelector('.nd-gp-close').addEventListener('click', () => { picker.hidden = true; });
            picker.querySelector('.nd-gp-search').addEventListener('input', e => renderPicker(e.target.value));
        }
        picker.hidden = false;
        picker.querySelector('.nd-gp-search').value = '';
        renderPicker('');
        setTimeout(() => picker.querySelector('.nd-gp-search').focus(), 30);
    }
    function renderPicker(filter) {
        const list = picker.querySelector('.nd-gp-list');
        const sheet = Array.isArray(window.__giftSheet) ? window.__giftSheet : [];
        const f = String(filter || '').toLowerCase().trim();
        const used = new Set(cfg.gifts.map(g => String(g.giftId)));
        const items = !f ? sheet : sheet.filter(g => (g.name || '').toLowerCase().includes(f) || String(g.id || '').includes(f));
        list.innerHTML = items.map(g => `
            <div class="nd-gp-row${used.has(String(g.id)) ? ' active' : ''}" data-gid="${esc(String(g.id))}" data-gn="${esc(g.name || '')}" data-gi="${esc(g.image || '')}" data-dia="${Number(g.diamond) || 0}">
                ${g.image ? `<img class="nd-gp-img" loading="lazy" decoding="async" src="${esc(g.image)}" />` : '<span class="nd-gp-icon">🎁</span>'}
                <span class="nd-gp-name">${esc(g.name || (hpT('Quà #{id}', { id: g.id })))}</span><span class="nd-gp-dia">${g.diamond || 0}<img class="hp-coin-ico" src="/coin.svg" alt=""></span>
                ${used.has(String(g.id)) ? '<span class="nd-gp-tick">✓</span>' : ''}</div>`).join('') || `<div class="nd-empty">${hpT('Không tìm thấy quà')}</div>`;
        list.querySelectorAll('.nd-gp-row').forEach(r => r.addEventListener('click', () => {
            if (used.has(r.dataset.gid)) return;
            const dia = Number(r.dataset.dia) || 0;
            // gợi ý loại cầu theo giá quà: ≥ 99 xu → 🟡 vàng; còn lại cầu thường (streamer đổi được)
            cfg.gifts.push({ giftId: r.dataset.gid, giftName: r.dataset.gn, giftImage: r.dataset.gi, ball: dia >= 99 ? 'gold' : 'normal' });
            renderSettings(); schedulePersist();
            picker.hidden = true;
        }));
    }

    window.HpDaCauPanel = { open };
})();
