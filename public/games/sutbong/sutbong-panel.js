// 🌐 hpT(): ngôn ngữ giao diện - overlays/lib/hp-i18n.js; trang chưa nạp thì giữ tiếng Việt (chỉ thay {biến}). hpTA(): như hpT, thoát dấu " cho thuộc tính HTML.
var hpT = (typeof globalThis !== 'undefined' && globalThis.hpT) || function (s, v) { return String(s).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, function (m, k) { return v && v[k] != null ? String(v[k]) : m; }); };
var hpTA = function (s, v) { return hpT(s, v).replace(/"/g, '&quot;'); };
/* ⚽ Sút Bóng - panel trong app (🎥 Game Camera). Tự chèn <section id="view-sutbong">. Mẫu Đá Cầu: open(socket) → nạp config,
 * lưu debounce 350 ms; echo gameConfig chỉ áp khi không phải bản vừa lưu. Bên phải là khung xem thử (thủ môn giả tự chơi). */
(function () {
    'use strict';
    const $ = (sel, root) => (root || document).querySelector(sel);
    const Game = () => (window.HpGame && window.HpGame.sutbong) || null;
    let cfg = null, socket = null, bound = false, persistTimer = null, feedStatus = null, feedPoll = null;

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = v => { const n = Number(v); return Number.isInteger(n) ? String(n) : String(+n.toFixed(2)); };
    const norm = c => (Game() ? Game().normalizeConfig(c) : (c || {}));

    function ensureView() {
        if ($('#view-sutbong')) return $('#view-sutbong');
        const host = ($('#view-dacau') || $('#view-dapmuoi') || $('.view')).parentNode;
        const sec = document.createElement('section');
        sec.id = 'view-sutbong'; sec.className = 'view game-view sb-view-panel';
        sec.innerHTML = `
            <header class="game-header">
                <div><h2>${hpT('⚽ Sút Bóng')}</h2></div>
                <div class="overlay-bar">
                    <button class="ghost small" onclick="hpOpenGame('camgames')" title="${hpTA('Về Game Camera')}">← Game Camera</button>
                    <button id="sb-btn-test" class="primary small" title="${hpTA('Sút thử 1 quả lên OBS')}">${hpT('▶ Sút thử')}</button>
                    <button id="sb-btn-clear" class="ghost small" title="${hpTA('Xoá bóng đang bay và hàng chờ')}">${hpT('Xoá bóng')}</button>
                    <button id="sb-btn-reset" class="danger small" title="${hpTA('Đặt tỷ số, chuỗi cản và bảng ghi bàn về 0')}">${hpT('Đặt lại tỷ số')}</button>
                    <span class="nd-bar-spacer"></span>
                    <button id="sb-btn-copy" class="obs-link small" title="${hpTA('Thêm vào Scene đang chiếu - chưa nối OBS thì copy link')}">${hpT('Thêm vào OBS')}</button>
                    <button id="sb-btn-prev" class="ghost small" title="${hpTA('Bật/tắt khung xem thử - không cần camera')}">${hpT('Xem thử')}</button>
                    <button id="sb-btn-mouse" class="ghost small" title="${hpTA('Mở overlay ở tab mới, thử bằng chuột không cần camera')}">${hpT('Thử bằng chuột')}</button>
                    <button id="sb-btn-reload" class="ghost small" title="${hpTA('Tải lại overlay trong OBS')}">${hpT('Tải lại overlay')}</button>
                </div>
            </header>
            <div class="game-body sb-body">
                <div class="ctc-status" id="sb-status"></div>
                <div class="sb-grid noprev" id="sb-grid">
                    <div class="sb-col" id="sb-settings"></div>
                    <div class="sb-col sb-prev">
                        <div class="sb-prev-bar"><b>${hpT('Xem thử - thủ môn giả')}</b><span><button id="sb-prev-sound" class="ghost small" title="${hpTA('Bật/tắt tiếng khung xem thử')}">🔇</button> <button id="sb-prev-reload" class="ghost small" title="${hpTA('Nạp lại khung xem thử')}">↻</button></span></div>
                        <iframe id="sb-frame" title="${hpTA('Xem trước Sút Bóng')}"></iframe>
                        <div class="hint">${hpT('Chỉ xem thử - không lên OBS, không tính tỷ số')}</div>
                    </div>
                </div>
            </div>`;
        host.appendChild(sec);
        const st = document.createElement('style');
        st.textContent = `
            .sb-body { display: flex; flex-direction: column; gap: 10px; padding: 12px; min-height: 0; flex: 1; overflow: auto; }
            .sb-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 14px; align-items: start; }
            .sb-grid.noprev { grid-template-columns: minmax(0, 1fr); } .sb-grid.noprev .sb-prev { display: none; }
            .sb-prev { position: sticky; top: 0; display: flex; flex-direction: column; gap: 8px; }
            .sb-prev-bar { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 13px; }
            #sb-frame { width: 300px; height: 533px; border: 1px solid rgba(255,255,255,.15); border-radius: 10px; background: #12162a; }
            .sb-gift { display: flex; align-items: center; gap: 10px; padding: 6px 4px; border-top: 1px solid rgba(255,255,255,.08); }
            .sb-gift img { width: 34px; height: 34px; object-fit: contain; } .sb-gift b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .sb-gift select { padding: 5px 6px; }
            .sb-seg { display: inline-flex; border: 1px solid rgba(255,255,255,.18); border-radius: 9px; overflow: hidden; }
            .sb-seg button { border: 0; border-radius: 0; background: transparent; padding: 7px 14px; color: inherit; cursor: pointer; font: inherit; }
            .sb-seg button + button { border-left: 1px solid rgba(255,255,255,.18); }
            .sb-seg button.on { background: #7dffb0; color: #06240f; font-weight: 700; }
            .sb-line { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 8px 0; }
            .sb-line > label:first-child { min-width: 120px; opacity: .85; }
            details.sb-adv { margin-top: 10px; border-top: 1px dashed rgba(255,255,255,.12); padding-top: 8px; }
            details.sb-adv > summary { cursor: pointer; opacity: .8; font-size: 13px; }
            @media (max-width: 900px) { .sb-grid { grid-template-columns: 1fr; } }`;
        document.head.appendChild(st);
        return sec;
    }

    function open(sharedSocket) {
        socket = sharedSocket;
        const view = ensureView();
        document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v === view));
        if (!bound) { bindShell(); bound = true; }
        if (socket && !socket.__sbAttached) {
            socket.__sbAttached = true;
            socket.on('gameConfig', ({ gameId, config }) => {
                if (gameId !== 'sutbong' || persistTimer) return;
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
        const view = $('#view-sutbong');
        if (!view || !view.classList.contains('active')) { clearInterval(feedPoll); feedPoll = null; return; }
        try { feedStatus = (await (await fetch('/api/camgames/feed-status', { cache: 'no-store' })).json()).status || null; }
        catch (e) { feedStatus = null; }
        renderStatus();
    }
    async function loadConfig() {
        try { cfg = norm(await fetch('/api/games/sutbong/config', { cache: 'no-store' }).then(r => r.json())); }
        catch (e) { cfg = norm(null); }
        renderSettings();
    }
    function schedulePersist() { clearTimeout(persistTimer); persistTimer = setTimeout(persistConfig, 350); }
    async function persistConfig() {
        persistTimer = null;
        try { await fetch('/api/games/sutbong/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) }); }
        catch (e) { console.error('[sutbong] lưu config lỗi', e); }
    }
    function flashBtn(btn, text) { const old = btn.textContent; btn.textContent = text; setTimeout(() => { btn.textContent = old; }, 1200); }
    // Khung xem thử: mặc định TẮT mỗi lần mở app cho nhẹ máy; tiếng nhớ theo máy.
    let prevOn = false, prevSound = false;
    try { prevSound = localStorage.getItem('hpal.sutbong.prevSound') === '1'; } catch (_) {}
    function reloadPreview() {
        const f = $('#sb-frame'); if (!f) return;
        $('#sb-grid').classList.toggle('noprev', !prevOn);
        $('#sb-btn-prev').classList.toggle('primary', prevOn);
        $('#sb-prev-sound').textContent = prevSound ? '🔊' : '🔇';
        f.src = prevOn ? '/overlay/sutbong?review=1&demo=1&bg=1' + (prevSound ? '' : '&mute=1') : 'about:blank';
    }
    function savePrev() { try { localStorage.setItem('hpal.sutbong.prevSound', prevSound ? '1' : '0'); } catch (_) {} reloadPreview(); }
    const control = cmd => fetch('/api/sutbong/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd }) }).catch(() => {});

    async function sutThu(type, btn) {
        if (persistTimer) { clearTimeout(persistTimer); await persistConfig(); }
        try {
            const r = await fetch('/api/sutbong/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type }) });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || j.ok === false) window.toast?.(j.error || hpT('Không sút thử được'), 'error');
            else if (btn) flashBtn(btn, '✓');
        } catch (e) { window.toast?.(hpT('Không gọi được server'), 'error'); }
    }
    function bindShell() {
        $('#sb-btn-copy').addEventListener('click', () => {
            const url = window.buildOverlayURL ? window.buildOverlayURL('/overlay/camgames') : (location.origin + '/overlay/camgames');
            if (window.hpObsQuick) { window.hpObsQuick(url, 'Game Camera').then((m) => flashBtn($('#sb-btn-copy'), m)); return; }
            if (window.hpCopyText) window.hpCopyText(url); else navigator.clipboard.writeText(url).catch(() => {});
            flashBtn($('#sb-btn-copy'), hpT('Đã copy'));
        });
        $('#sb-btn-mouse').addEventListener('click', () => window.open('/overlay/sutbong?mouse=1&bg=1', '_blank'));
        $('#sb-btn-reload').addEventListener('click', () => { if (socket) socket.emit('overlay:reload', { gameId: 'sutbong' }); flashBtn($('#sb-btn-reload'), '✓'); });
        $('#sb-btn-clear').addEventListener('click', () => { control('clear'); flashBtn($('#sb-btn-clear'), '✓'); });
        $('#sb-btn-reset').addEventListener('click', () => {
            if (!window.confirm(hpT('Đặt tỷ số, chuỗi cản và bảng ghi bàn về 0?'))) return;
            control('reset'); flashBtn($('#sb-btn-reset'), '✓');
        });
        $('#sb-btn-test').addEventListener('click', () => sutThu((cfg && cfg.gifts[0] && cfg.gifts[0].shot) || 'normal', $('#sb-btn-test')));
        $('#sb-prev-reload').addEventListener('click', reloadPreview);
        $('#sb-btn-prev').addEventListener('click', () => { prevOn = !prevOn; const f = $('#sb-frame'); if (f) f.dataset.hpOff = prevOn ? '0' : '1'; savePrev(); });
        $('#sb-frame').addEventListener('hp-preview-off', () => { prevOn = false; reloadPreview(); });
        $('#sb-prev-sound').addEventListener('click', () => { prevSound = !prevSound; savePrev(); });
    }

    function renderStatus() {
        const el = $('#sb-status'); if (!el) return;
        const chips = [];
        const fs = feedStatus || {};
        if (fs.obsConnected === false) chips.push(`<span class="ctc-chip warn">${hpT('Chưa kết nối OBS')}</span>`);
        else if (!fs.source) chips.push(`<span class="ctc-chip warn">${hpT('Chưa chọn nguồn camera - chọn ở Game Camera')}</span>`);
        else if (fs.error) chips.push(`<span class="ctc-chip warn">📷 ${esc(fs.source)} - ${esc(fs.error)}</span>`);
        else chips.push(`<span class="ctc-chip ${fs.live ? 'ok' : 'warn'}">📷 ${esc(fs.source)}${fs.live ? hpT(' · {v} hình/s', { v: fs.fps || 0 }) : hpT(' - chưa có hình')}</span>`);
        const ov = fs.overlays ? fs.overlays.sutbong : null;
        if (ov) chips.push(`<span class="ctc-chip ${ov.pose ? 'ok' : ''}">${ov.pose ? hpT('thấy người') : hpT('chưa thấy người')}${ov.pose ? (ov.hands ? hpT(' · 🧤 thấy {n} tay', { n: ov.hands }) : hpT(' · 🧤 chưa thấy tay')) : ''} · ${Math.round(ov.fps || 0)} khung/s</span>`);
        else chips.push(`<span class="ctc-chip dim">${hpT('Overlay chưa gửi tín hiệu - mở link Game Camera và chọn Chơi Sút Bóng')}</span>`);
        if (cfg && !cfg.gifts.length) chips.push(`<span class="ctc-chip warn">${hpT('Chưa chọn quà sút bóng')}</span>`);
        el.innerHTML = chips.join(' ');
    }

    function row(key, label, min, max, step, val, unit, hint) {
        return `<div class="ctc-row" data-k="${key}"><label>${label}</label>
            <input type="range" min="${min}" max="${max}" step="${step}" value="${fmt(val)}" />
            <input type="number" min="${min}" max="${max}" step="${step}" value="${fmt(val)}" />
            <span class="unit">${unit}</span>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
    }
    function seg(key, opts, cur) {
        return `<span class="sb-seg" data-seg="${key}">${opts.map(([v, t]) => `<button type="button" data-v="${v}" class="${v === cur ? 'on' : ''}">${t}</button>`).join('')}</span>`;
    }

    function renderSettings() {
        const host = $('#sb-settings'); if (!host || !cfg) return;
        const G = Game();
        const types = G ? G.SHOT_TYPES : { normal: { icon: '⚽', name: 'Sút thường' } };
        const D = cfg.display;
        host.innerHTML = `
            <div class="ctc-card">
                <h3>${hpT('QUÀ SÚT BÓNG')}</h3>
                <div id="sb-gifts">${cfg.gifts.map((g, i) => `<div class="sb-gift" data-gid="${esc(g.giftId)}">${g.giftImage ? `<img src="${esc(g.giftImage)}" alt="">` : '🎁'}<b title="${esc(g.giftName)}">${esc(g.giftName || (hpT('Quà #{giftId}', { giftId: g.giftId })))}</b>
                    <select data-shot="${i}" title="${hpTA('Kiểu sút')}">${Object.entries(types).map(([id, t]) => `<option value="${id}" ${g.shot === id ? 'selected' : ''}>${t.icon} ${esc(t.name)}</option>`).join('')}</select>
                    <button class="ghost small" data-try="${i}" title="${hpTA('Sút thử đúng kiểu của quà này lên OBS')}">▶</button>
                    <button class="ghost small" data-del="${i}" title="${hpTA('Bỏ quà này')}">✕</button></div>`).join('') || `<div class="hint">${hpT('Chưa có quà nào.')}</div>`}</div>
                <button id="sb-gift-add" class="small">${hpT('＋ Thêm quà')}</button>
                <div class="hint">${hpT('Mỗi quà sút 1 quả (combo ×N = N quả, lần lượt). ⚡ Sấm sét bay nhanh ×2 điểm, 🟡 Bóng vàng ×3 điểm, 🌀 Cong lượn rồi bẻ vào góc.')}</div>
            </div>
            <div class="ctc-card">
                <h3>${hpT('CÁCH CHƠI')}</h3>
                <div class="sb-line"><label>${hpT('Độ khó')}</label>${seg('difficulty', [['easy', hpT('Dễ')], ['normal', hpT('Vừa')], ['hard', hpT('Khó')]], cfg.difficulty)}</div>
                ${row('maxBalls', hpT('Bóng bay cùng lúc'), 1, 3, 1, cfg.maxBalls, hpT('quả'), hpT('Quà dồn tới thì xếp hàng, sút lần lượt.'))}
                <label class="ctc-toggle"><input type="checkbox" data-d="showAim" ${D.showAim ? 'checked' : ''}> ${hpT('Báo trước góc sút (vòng đỏ lúc bóng nằm chấm phạt đền)')}</label>
                <div class="hint">${hpT('Đứng giữa khung thành, camera thấy từ')} <b>${hpT('đầu tới hông + hai tay')}</b>${hpT('. Đưa lòng bàn tay tới chỗ bóng bay tới là cản.')}</div>
                <details class="sb-adv"><summary>${hpT('Nâng cao')}</summary>
                    ${row('hitScale', hpT('Tầm tay'), 50, 200, 5, cfg.hitScale, '%', hpT('Lớn: dễ cản hơn.'))}
                    ${row('latencyMs', hpT('Bù trễ camera'), 0, 400, 10, cfg.latencyMs, 'ms', hpT('Cản đúng mà vẫn bị tính vào → tăng lên.'))}
                </details>
            </div>
            <div class="ctc-card">
                <h3>${hpT('KHUNG THÀNH')}</h3>
                ${row('g.width', hpT('Bề rộng'), 30, 100, 1, cfg.goal.width, '%')}
                ${row('g.top', hpT('Xà ngang'), 0, 70, 1, cfg.goal.top, hpT('% từ trên'), hpT('Ngang trên đầu streamer một chút.'))}
                ${row('g.bottom', hpT('Vạch vôi'), 25, 100, 1, cfg.goal.bottom, hpT('% từ trên'), hpT('Ngang đầu gối / mép dưới khung camera.'))}
                <label class="ctc-toggle"><input type="checkbox" data-d="showZones" ${D.showZones ? 'checked' : ''}> ${hpT('Vẽ khung căn chỉnh trên OBS (live thì tắt)')}</label>
            </div>
            <div class="ctc-card">
                <h3>${hpT('HIỂN THỊ')}</h3>
                <label class="ctc-toggle"><input type="checkbox" data-d="showHud" ${D.showHud ? 'checked' : ''}> ${hpT('Bảng tỷ số')}</label>
                ${row('d.hudY', hpT('Vị trí bảng'), 0, 80, 1, D.hudY, hpT('% từ trên'))}
                <label class="ctc-toggle"><input type="checkbox" data-d="showTop" ${D.showTop ? 'checked' : ''}> ${hpT('Top 3 người ghi bàn')}</label>
                <label class="ctc-toggle"><input type="checkbox" data-d="showNames" ${D.showNames ? 'checked' : ''}> ${hpT('Tên người tặng trên quả bóng')}</label>
                <label class="ctc-toggle"><input type="checkbox" data-d="showHands" ${D.showHands ? 'checked' : ''}> ${hpT('Hiện găng 🧤 ở chỗ tay')}</label>
                <label class="ctc-toggle"><input type="checkbox" data-d="showPitch" ${D.showPitch ? 'checked' : ''}> ${hpT('Thảm cỏ dưới vạch vôi (che phần chân)')}</label>
                <label class="ctc-toggle"><input type="checkbox" data-d="showLights" ${D.showLights ? 'checked' : ''}> ${hpT('Dàn đèn sân vận động 2 góc trên')}</label>
                <label class="ctc-toggle"><input type="checkbox" id="sb-sound" ${cfg.sound.enabled ? 'checked' : ''}> ${hpT('Âm thanh')}</label>
                ${row('volume', hpT('Âm lượng'), 0, 1, 0.05, cfg.sound.volume, '')}
            </div>`;
        host.querySelectorAll('[data-try]').forEach(b => b.addEventListener('click', () => sutThu(cfg.gifts[Number(b.dataset.try)].shot, b)));
        host.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { cfg.gifts.splice(Number(b.dataset.del), 1); renderSettings(); schedulePersist(); }));
        host.querySelectorAll('[data-shot]').forEach(s => s.addEventListener('change', () => { cfg.gifts[Number(s.dataset.shot)].shot = s.value; schedulePersist(); }));
        $('#sb-gift-add').addEventListener('click', openGiftPicker);
        host.querySelectorAll('[data-seg]').forEach(el => el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
            cfg[el.dataset.seg] = b.dataset.v;
            el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
            schedulePersist();
        })));
        $('#sb-sound').addEventListener('change', e => { cfg.sound.enabled = e.target.checked; schedulePersist(); });
        host.querySelectorAll('[data-d]').forEach(c => c.addEventListener('change', () => { cfg.display[c.dataset.d] = c.checked; schedulePersist(); }));
        host.querySelectorAll('.ctc-row[data-k]').forEach(r => {
            const key = r.dataset.k, range = r.querySelector('input[type=range]'), numEl = r.querySelector('input[type=number]');
            const apply = v => {
                const n = Number(v); if (!Number.isFinite(n)) return;
                if (key === 'volume') cfg.sound.volume = n;
                else if (key.startsWith('d.')) cfg.display[key.slice(2)] = n;
                else if (key.startsWith('g.')) cfg.goal[key.slice(2)] = n;
                else cfg[key] = n;
                range.value = n; numEl.value = fmt(n); schedulePersist();
            };
            range.addEventListener('input', () => apply(range.value));
            numEl.addEventListener('change', () => apply(numEl.value));
        });
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
            picker.innerHTML = `<div class="nd-gp-modal"><div class="nd-gp-head"><div class="nd-gp-title">${hpT('Chọn quà sút bóng')}</div><button class="nd-gp-close ghost small">✕</button></div>
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
            // gợi ý kiểu sút theo giá quà: ≥ 99 xu → 🟡 vàng, ≥ 20 xu → ⚡ sấm sét; còn lại sút thường (streamer đổi được)
            cfg.gifts.push({ giftId: r.dataset.gid, giftName: r.dataset.gn, giftImage: r.dataset.gi, shot: dia >= 99 ? 'gold' : dia >= 20 ? 'rocket' : 'normal' });
            renderSettings(); schedulePersist();
            picker.hidden = true;
        }));
    }

    window.HpSutBongPanel = { open };
})();
