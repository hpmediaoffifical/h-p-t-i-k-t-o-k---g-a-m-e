// 🌐 hpT(): ngôn ngữ giao diện - overlays/lib/hp-i18n.js; trang chưa nạp thì giữ tiếng Việt (chỉ thay {biến}). hpTA(): như hpT, thoát dấu " cho thuộc tính HTML.
var hpT = (typeof globalThis !== 'undefined' && globalThis.hpT) || function (s, v) { return String(s).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, function (m, k) { return v && v[k] != null ? String(v[k]) : m; }); };
var hpTA = function (s, v) { return hpT(s, v).replace(/"/g, '&quot;'); };
/* 🎮 PHIÊN GAME THEO QUÀ - thẻ cài đặt trong panel 🎥 Game Camera.
 *
 * Người xem tặng QUÀ KÍCH HOẠT → game gắn với quà hiện trên overlay mẹ N giây và chơi ĐỘC QUYỀN: chỉ game nhận quà,
 * các game camera khác tạm ẩn, hết giờ trở lại như trước. (Port từ HP LIVE NPC.)
 * Cấu hình ở games.camgames.trigger (server chuẩn hoá - lib/camgames-session.js normalizeTrigger).
 * Phiên đang chạy: GET /api/camgames/session + socket 'camgames:session'; ⏹ /api/camgames/session/stop; ▶ thử /session/test.
 */
(function () {
    'use strict';
    const $ = (s, r = document) => r.querySelector(s);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const GAMES = [['touchplay', '🖐 Touch & Play'], ['chemtraicay', hpT('🍉 Chém Trái Cây')], ['dapmuoi', hpT('🦟 Đập Muỗi')], ['bancung', hpT('🏹 Bắn Cung')], ['dacau', hpT('🏸 Đá Cầu')]];
    // 🚦 Game bị Ẩn theo game (gs 'hidden' của HP KEY - camgames-panel.js đặt window.HpCamLicenseStates) không có trong ô chọn; trừ
    // game mà một quà đang dùng sẵn (giữ nguyên lựa chọn cũ, không tự đổi cấu hình).
    const shownGames = keep => GAMES.filter(([id]) => id === keep || (window.HpCamLicenseStates || {})[id] !== 'hidden');
    // 🔑 Game ⏸ Tạm tắt / 🔒 KEY chưa mở (HpCamLicenseStates chỉ chứa mục KHÁC 'on'): vẫn có trong ô chọn + dòng quà nhưng gắn
    // nhãn (server không mở phiên game đó - quà kích hoạt chạy như quà thường). Quà mới / ▶ thử mặc định game ĐẦU TIÊN dùng được.
    const licSt = id => (window.HpCamLicenseStates || {})[id] || 'on';
    const licBlocked = id => licSt(id) === 'off' || licSt(id) === 'locked';
    function licTag(id) {
        const st = licSt(id);
        return st === 'off' ? hpT('⏸ Bảo trì') : st === 'locked' ? hpT('🔒 KEY chưa mở') : st === 'admin' ? '🧪' : '';
    }
    function licTip(id) {
        const st = licSt(id);
        return st === 'off' ? hpT('Mục này đang tạm bảo trì - HP Media sẽ mở lại sớm.') : st === 'locked' ? hpT('KEY chưa mở tính năng này - liên hệ HP Media để mở thêm.') : '';
    }
    const gameOpt = ([id, n]) => (licTag(id) ? `${n} · ${licTag(id)}` : n);   // ô chọn chỉ nhận chữ thuần
    const firstUsable = () => shownGames().find(([id]) => !licBlocked(id)) || shownGames()[0] || GAMES[0];
    function renderTestGames() {
        const sel = $('#cgt-test-game');
        if (!sel) return;
        const cur = sel.value && !licBlocked(sel.value) ? sel.value : firstUsable()[0];
        sel.innerHTML = shownGames(cur).map(([id, n]) => `<option value="${id}"${id === cur ? ' selected' : ''}>${esc(gameOpt([id, n]))}</option>`).join('');
    }
    let trig = { enabled: false, rules: [], maxSec: 300, introSec: 3, otherGifts: 'defer' };
    let session = null, hubOnline = null, skew = 0;
    let socket = null, built = false, saveTimer = 0, tickTimer = 0, pollTimer = 0;
    let pickerEl = null, pickerSwap = -1;

    // Đang có phiên GAME KHÁC thì quà này làm gì (lib/camgames-session.js TRIGGER_QUEUE_MODES) - mặc định ⏭ Kế tiếp.
    const QUEUE_MODES = [['next', hpT('⏭ Chơi kế tiếp (sau phiên đang chạy)')], ['queue', hpT('📋 Xếp hàng (cuối hàng chờ)')], ['cut', hpT('✂ Cắt ngang phiên đang chạy')]];
    function injectStyle() {
        if ($('#cgt-style')) return;
        const st = document.createElement('style');
        st.id = 'cgt-style';
        st.textContent = `
            .cgt-card { margin-top: 12px; }
            .cgt-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
            .cgt-switch { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; color: #cdd3e0; cursor: pointer; }
            .cgt-rules { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
            .cgt-rule { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 6px 8px; border-radius: 10px; background: #10141f; border: 1px solid #262c3b; }
            .cgt-rule.off { opacity: .5; }
            .cgt-rule.lic { border-color: #4b4330; }
            .cgt-rule.lic select[data-k=gameId] { opacity: .72; }
            .cgt-lic { font-size: 11px; font-weight: 700; color: #ffd166; white-space: nowrap; }
            .cgt-rule img { width: 34px; height: 34px; object-fit: contain; }
            .cgt-rule .gname { min-width: 110px; max-width: 180px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .cgt-rule select, .cgt-rule input[type=number], .cgt-opts select, .cgt-opts input[type=number] { padding: 5px 8px; height: auto; }
            .cgt-rule input[type=number] { width: 70px; }
            .cgt-opts { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; margin-top: 10px; font-size: 13px; color: #cdd3e0; }
            .cgt-opts input[type=number] { width: 70px; }
            .cgt-live { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px; }
            .cgt-empty { color: #8b93a8; font-size: 12px; padding: 6px 2px; }
            .cgt-rule select[data-k=queueMode] { max-width: 210px; }
            .cgt-note { font-size: 12px; color: #8b93a8; margin-top: 6px; line-height: 1.45; }
        `;
        document.head.appendChild(st);
    }

    function build() {
        const root = $('#cg-trigger');
        if (!root || built) return;
        built = true;
        injectStyle();
        root.innerHTML = `
            <div class="cg-card cgt-card cg-compact">
                <div class="cg-head-row">
                    <h3>${hpT('Quà kích hoạt game')}</h3>
                    <div class="cg-sum" id="cgt-sum"></div>
                    <button class="ghost small cg-more-btn" id="cgt-toggle" title="${hpTA('Quà kích hoạt, số giây, thử phiên')}">${hpT('Cài đặt')}</button>
                    <label class="cgt-switch" title="${hpTA('Bật/tắt quà kích hoạt game (chơi riêng N giây)')}"><input type="checkbox" id="cgt-on"> ${hpT('Bật')}</label>
                </div>
                <div class="cgt-live" id="cgt-live"></div>
                <div class="cg-more" id="cgt-more" hidden>
                <div class="cgt-rules" id="cgt-rules" style="margin-top:0"></div>
                <div class="cg-row"><button class="btn-outline small" id="cgt-add">${hpT('Thêm quà')}</button></div>
                <div class="cgt-note">${hpT('Tặng quà → game đó chơi riêng trên OBS đúng số giây (combo ×N = N lần số giây), các game camera khác tạm ẩn. Tặng thêm quà của game đang chơi = cộng giây. Quà của GAME KHÁC lúc đang có phiên:')} <b>${hpT('⏭ Kế tiếp')}</b> ${hpT('- chơi ngay sau phiên đang chạy ·')} <b>${hpT('📋 Xếp hàng')}</b> ${hpT('- cuối hàng chờ ·')} <b>${hpT('✂ Cắt ngang')}</b> ${hpT('- dừng phiên đang chạy, mở game mới ngay. Overlay 🎥 Game Camera phải đang mở trên OBS, không thì quà chạy như quà thường.')}</div>
                <div class="cgt-opts">
                    <label>${hpT('Màn mở đầu')} <input type="number" id="cgt-intro" min="0" max="10"> ${hpT('giây')}</label>
                </div>
                <div class="cg-row">
                    <select id="cgt-test-game"></select>
                    <input type="number" id="cgt-test-sec" min="5" max="600" value="20" style="width:70px;padding:5px 8px;height:auto"> ${hpT('giây')}
                    <button class="ghost small" id="cgt-test">${hpT('Thử phiên')}</button>
                </div>
                </div>
            </div>`;
        $('#cgt-on').addEventListener('change', e => { trig.enabled = e.target.checked; persist(true); });
        $('#cgt-add').addEventListener('click', () => openPicker(-1));
        $('#cgt-intro').addEventListener('change', e => { trig.introSec = Math.max(0, Number(e.target.value) || 0); persist(true); });
        $('#cgt-test').addEventListener('click', testSession);
        $('#cgt-toggle').addEventListener('click', () => { open = !open; memo('cgt-open', open); applyOpen(); });
        renderTestGames();
        applyOpen();
        render();
    }

    // ⚙ Cài đặt: mặc định đóng (cài 1 lần) - nhớ theo máy.
    const memo = (k, v) => { try { if (v === undefined) return localStorage.getItem(k) === '1'; localStorage.setItem(k, v ? '1' : '0'); } catch (_) {} return false; };
    let open = memo('cgt-open');
    function applyOpen() {
        $('#cgt-more').hidden = !open;
        const b = $('#cgt-toggle');
        b.classList.toggle('open', open);
        b.textContent = open ? hpT('Thu gọn') : hpT('Cài đặt');
        renderLive();
    }
    // Một dòng: các quà kích hoạt đang bật (icon → game · giây).
    function renderSum() {
        const el = $('#cgt-sum');
        if (!el) return;
        const on = (trig.rules || []).filter(r => r.enabled !== false);
        const icon = id => (GAMES.find(g => g[0] === id)?.[1] || '').split(' ')[0];
        el.innerHTML = !on.length ? `<span class="cg-chip dim">${hpT('Chưa có quà kích hoạt')}</span>`
            : on.map(r => `<span class="cg-chip ${trig.enabled && !licBlocked(r.gameId) ? 'ok' : 'dim'}" title="${hpTA('{v} → {v2} {v3} giây', { v: esc(r.giftName || (hpT('Quà #{giftId}', { giftId: r.giftId }))), v2: esc((GAMES.find(g => g[0] === r.gameId) || [])[1] || r.gameId), v3: Number(r.seconds) || 300 })}${licTip(r.gameId) ? esc(' - ' + licTip(r.gameId)) : ''}">${r.giftImage ? `<img src="${esc(r.giftImage)}" alt="">` : '🎁'} → ${icon(r.gameId)} ${Number(r.seconds) || 300}s${licBlocked(r.gameId) ? ' ' + esc(licTag(r.gameId)) : ''}</span>`).join('')
              + (trig.enabled ? '' : `<span class="cg-chip dim">${hpT('đang tắt')}</span>`);
    }

    function render() {
        if (!built) return;
        renderSum();
        $('#cgt-on').checked = !!trig.enabled;
        $('#cgt-intro').value = trig.introSec;
        const box = $('#cgt-rules');
        const rules = trig.rules || [];
        box.innerHTML = rules.length ? rules.map((r, i) => `
            <div class="cgt-rule ${r.enabled === false ? 'off' : ''}${licBlocked(r.gameId) ? ' lic' : ''}" data-i="${i}">
                <input type="checkbox" data-k="enabled" ${r.enabled !== false ? 'checked' : ''} title="${hpTA('Bật/tắt quà này')}">
                ${r.giftImage ? `<img src="${esc(r.giftImage)}" alt="">` : '<span style="font-size:24px">🎁</span>'}
                <span class="gname" title="${esc(r.giftName)} (#${esc(r.giftId)})">${esc(r.giftName || (hpT('Quà #{giftId}', { giftId: r.giftId })))}</span>
                <button class="ghost small" data-swap="${i}" title="${hpTA('Đổi quà')}">↻</button>
                → <select data-k="gameId">${shownGames(r.gameId).map(([id, n]) => `<option value="${id}" ${r.gameId === id ? 'selected' : ''}>${esc(gameOpt([id, n]))}</option>`).join('')}</select>
                ${licBlocked(r.gameId) ? `<span class="cgt-lic" title="${esc(licTip(r.gameId) + ' ' + hpT('Quà này tạm chạy như quà thường.'))}">${esc(licTag(r.gameId))}</span>` : ''}
                <input type="number" data-k="seconds" min="5" max="600" value="${Number(r.seconds) || 300}"> ${hpT('giây')}
                <select data-k="queueMode" title="${hpTA('Đang có phiên game khác thì quà này làm gì')}">${QUEUE_MODES.map(([v, n]) => `<option value="${v}" ${(r.queueMode || 'next') === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
                <button class="ghost small" data-del="${i}" title="${hpTA('Xoá')}">✕</button>
            </div>`).join('') : `<div class="cgt-empty">${hpT('Chưa có quà kích hoạt - bấm Thêm quà')}</div>`;
        box.querySelectorAll('.cgt-rule').forEach(row => {
            const i = Number(row.dataset.i);
            row.querySelectorAll('[data-k]').forEach(inp => inp.addEventListener('change', () => {
                const k = inp.dataset.k;
                trig.rules[i][k] = k === 'enabled' ? inp.checked : k === 'seconds' ? (Number(inp.value) || 300) : inp.value;
                persist(k !== 'seconds');
            }));
        });
        box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { trig.rules.splice(Number(b.dataset.del), 1); persist(true); }));
        box.querySelectorAll('[data-swap]').forEach(b => b.addEventListener('click', () => openPicker(Number(b.dataset.swap))));
        renderLive();
    }

    function renderLive() {
        const el = $('#cgt-live');
        if (!el) return;
        clearTimeout(tickTimer);
        const chips = [];
        if (hubOnline === false && (trig.enabled || open)) chips.push(`<span class="cg-chip warn">${hpT('Overlay chưa mở trên OBS - quà chạy như thường')}</span>`);
        else if (hubOnline && open) chips.push(`<span class="cg-chip ok">${hpT('Overlay Game Camera đang mở trên OBS')}</span>`);
        const now = Date.now() + skew;
        if (session && session.active && session.until > now - 1000) {
            const left = Math.max(0, Math.ceil((session.until - now) / 1000));
            chips.push(`<span class="cg-chip ok">${hpT('Đang chơi {v} {v2} - còn {left} s{v3}', { v: esc(session.icon || ''), v2: esc(session.gameName || ''), left, v3: session.by?.nickname ? ' · @' + esc(session.by.nickname) : '' })}</span>`);
            chips.push(`<button class="btn-outline small" id="cgt-stop">${hpT('Kết thúc')}</button>`);
            tickTimer = setTimeout(renderLive, 1000);
        }
        el.innerHTML = chips.join('');
        $('#cgt-stop')?.addEventListener('click', async () => {
            try { await fetch('/api/camgames/session/stop', { method: 'POST' }); } catch (_) {}
            loadSession();
        });
    }

    function persist(now) {
        render();
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
            saveTimer = 0;
            try {
                const r = await fetch('/api/games/camgames/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trigger: trig }) });
                const j = await r.json();
                if (j && j.config && j.config.trigger) { trig = j.config.trigger; render(); }
            } catch (_) { window.toast?.(hpT('Không lưu được quà kích hoạt'), 'error'); }
        }, now ? 50 : 500);
    }

    async function testSession() {
        const gameId = $('#cgt-test-game').value;
        const seconds = Number($('#cgt-test-sec').value) || 20;
        try {
            const r = await fetch('/api/camgames/session/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId, seconds }) });
            const j = await r.json();
            if (!j.ok) window.toast?.('⚠ ' + (j.error || hpT('Không mở được phiên thử')), 'error');
        } catch (_) {}
        loadSession();
    }

    async function loadConfig() {
        try { const j = await (await fetch('/api/games/camgames/config', { cache: 'no-store' })).json(); if (j && j.trigger) trig = j.trigger; } catch (_) {}
        render();
    }
    async function loadSession() {
        try {
            const j = await (await fetch('/api/camgames/session', { cache: 'no-store' })).json();
            session = j.session; hubOnline = !!j.hubOnline;
        } catch (_) { hubOnline = null; }
        renderLive();
    }
    function poll() {
        clearTimeout(pollTimer);
        if (!$('#view-camgames')?.classList.contains('active')) return;
        loadSession().finally(() => { pollTimer = setTimeout(poll, 3000); });
    }

    // ----- chọn quà (cùng kiểu .nd-gp-* của các game) -----
    async function openPicker(swapIdx) {
        pickerSwap = swapIdx;
        if (!Array.isArray(window.__giftSheet) || !window.__giftSheet.length) {
            try { const r = await fetch('/api/gifts'); if (r.ok) window.__giftSheet = (await r.json()).slice().sort((a, b) => (a.diamond || 0) - (b.diamond || 0)); } catch (_) {}
        }
        if (!pickerEl) {
            pickerEl = document.createElement('div');
            pickerEl.className = 'nd-gp-overlay'; pickerEl.hidden = true;
            pickerEl.innerHTML = `
                <div class="nd-gp-modal">
                    <div class="nd-gp-head"><div class="nd-gp-title">${hpT('Chọn quà kích hoạt game')}</div><button class="nd-gp-close ghost small">✕</button></div>
                    <input class="nd-gp-search" type="text" placeholder="${hpTA('Tìm quà hoặc ID…')}" />
                    <div class="nd-gp-list"></div>
                    <div class="nd-gp-hint">${hpT('Bấm vào quà để thêm. Game + số giây đổi ở dòng quà.')}</div>
                </div>`;
            document.body.appendChild(pickerEl);
            pickerEl.addEventListener('click', e => { if (e.target === pickerEl) pickerEl.hidden = true; });
            pickerEl.querySelector('.nd-gp-close').addEventListener('click', () => pickerEl.hidden = true);
            pickerEl.querySelector('.nd-gp-search').addEventListener('input', e => renderPicker(e.target.value));
        }
        pickerEl.hidden = false;
        pickerEl.querySelector('.nd-gp-search').value = '';
        renderPicker('');
        setTimeout(() => pickerEl.querySelector('.nd-gp-search').focus(), 30);
    }
    function renderPicker(filter) {
        const list = pickerEl.querySelector('.nd-gp-list');
        const sheet = Array.isArray(window.__giftSheet) ? window.__giftSheet : [];
        const f = String(filter || '').toLowerCase().trim();
        const used = new Set((trig.rules || []).map(r => String(r.giftId)));
        const items = !f ? sheet : sheet.filter(g => (g.name || '').toLowerCase().includes(f) || String(g.id || '').includes(f));
        list.innerHTML = items.map(g => `
            <div class="nd-gp-row${used.has(String(g.id)) ? ' active' : ''}" data-gid="${esc(g.id)}" data-gn="${esc(g.name || '')}" data-gi="${esc(g.image || '')}">
                ${g.image ? `<img class="nd-gp-img" loading="lazy" decoding="async" src="${esc(g.image)}" />` : '<span class="nd-gp-icon">🎁</span>'}
                <span class="nd-gp-name">${esc(g.name || (hpT('Quà #{id}', { id: g.id })))}</span>
                <span class="nd-gp-dia">${g.diamond || 0}<img class="hp-coin-ico" src="/coin.svg" alt=""></span>
                ${used.has(String(g.id)) ? '<span class="nd-gp-tick">✓</span>' : ''}
            </div>`).join('') || `<div class="nd-empty">${hpT('Không tìm thấy quà')}</div>`;
        list.querySelectorAll('.nd-gp-row').forEach(row => row.addEventListener('click', () => {
            const id = row.dataset.gid;
            const pick = { giftId: id, giftName: row.dataset.gn, giftImage: row.dataset.gi };
            trig.rules = trig.rules || [];
            if (pickerSwap >= 0 && trig.rules[pickerSwap]) Object.assign(trig.rules[pickerSwap], pick);
            else {
                if (used.has(id)) return;
                trig.rules.push({ ...pick, gameId: firstUsable()[0], seconds: 300, enabled: true, queueMode: 'next' });
            }
            pickerEl.hidden = true; pickerSwap = -1;
            persist(true);
        }));
    }

    window.HpCamTrigger = {
        open(sock) {
            if (sock && sock !== socket) {
                socket = sock;
                socket.on('gameConfig', d => { if (d && d.gameId === 'camgames' && d.config?.trigger && !saveTimer) { trig = d.config.trigger; render(); } });
                socket.on('camgames:session', s => {
                    session = s && s.active ? s : null;
                    if (s && Number.isFinite(s.serverNow)) skew = s.serverNow - Date.now();
                    renderLive();
                });
            }
            build();
            loadConfig();
            loadSession();
            setTimeout(poll, 3000);
        },
        // Panel nhận trạng thái mục theo KEY mới (/api/license/features hoặc socket license:features) → vẽ lại ô chọn game.
        refreshLicense() { if (!built) return; renderTestGames(); render(); }
    };
})();
