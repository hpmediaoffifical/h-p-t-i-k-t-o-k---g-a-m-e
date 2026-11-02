/* ============================================================
   ⛓️ Nhà Tù Online — Panel controller (app side)
   ============================================================
   - Cài đặt chế độ: TỰ CHƠI (quà → lượt lên sóng, bình luận mã để ra lệnh) | STREAMER (tự đi lại bằng phím).
   - Ra lệnh thay người đang có lượt / phím điều khiển streamer (relay socket 'nhatu:key').
   - 🎁 Gán quà → nhiệm vụ làm ngay (ntGiftMap theo giftId).
   - Lệnh overlay qua POST /api/games/nhatu/cmd (gameCmd): demo / skip / act / reset / test.
   Danh sách nhiệm vụ đọc chung public/games/nhatu/data.json với overlay.
   Expose: window.HpNhaTuPanel.open(socket)
   ============================================================ */
(function () {
    'use strict';

    const GAME_ID = 'nhatu';
    const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight',
        'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];
    const DEFAULTS = {
        enabled: true, ntMode: 'auto', ntStreamerName: '', ntTurnBase: 25, ntTurnPerCoin: 1, ntTurnMax: 90, ntMinTurn: 15, ntPreempt: true,
        ntQueueMax: 20, ntIdleAuto: 6, ntAnyoneAct: false, ntJoinOnComment: true, ntMaxViewers: 40, ntNpcCount: 28, ntMinuteMs: 1000,
        ntLikePerDay: 300, ntShowMenu: true, ntSound: true, ntMusic: false, ntGiftMap: {},
        ntBossSec: 180, ntGuardSec: 180, ntJobSec: 180, ntBossFollowers: 6, ntJailIdleSec: 180, ntJoinOnLike: true,
        ntBossCoins: 0, ntGuardCoins: 0, ntShowGiftLegend: true
    };

    let socket = null, cfg = null, actions = [], giftActions = [], suggested = {}, initialized = false, pendingSave = null, demoOn = false;
    const held = new Set();
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, k) => { if (typeof window.toast === 'function') window.toast(m, k || 'success', 2500); };

    function open(sharedSocket) {
        socket = sharedSocket || window.io();
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        $('#view-nhatu')?.classList.add('active');
        if (!initialized) { initialized = true; bindShell(); }
        load().then(render);
    }

    async function load() {
        try { const r = await fetch('/api/games/nhatu/config'); cfg = r.ok ? await r.json() : {}; } catch (e) { cfg = {}; }
        cfg = Object.assign({}, DEFAULTS, cfg || {});
        if (!cfg.ntGiftMap || typeof cfg.ntGiftMap !== 'object') cfg.ntGiftMap = {};
        if (!actions.length) {
            try { const r = await fetch('/games/nhatu/data.json'); if (r.ok) { const d = await r.json(); actions = d.actions || []; giftActions = d.giftActions || []; suggested = d.suggestedGiftMap || {}; } } catch (e) {}
        }
    }
    function schedulePersist() { clearTimeout(pendingSave); pendingSave = setTimeout(() => persist().catch(() => toast('Lưu thất bại', 'error')), 350); }
    async function persist() {
        clearTimeout(pendingSave);
        const r = await fetch('/api/games/nhatu/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
        if (!r.ok) throw new Error('save_fail');
    }
    async function cmd(name, payload) {
        try {
            const r = await fetch('/api/games/nhatu/cmd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd: name, payload: payload || {} }) });
            if (!r.ok) { const j = await r.json().catch(() => ({})); toast(j.message || 'Lệnh bị từ chối', 'error'); }
        } catch (e) { toast('Không gửi được lệnh', 'error'); }
    }

    // ---------------- thanh công cụ ----------------
    function bindShell() {
        $('#nt-btn-copy')?.addEventListener('click', async () => {
            const url = window.buildOverlayURL ? window.buildOverlayURL('/overlay/nhatu') : location.origin + '/overlay/nhatu';
            try { await navigator.clipboard.writeText(url); toast('Đã copy link OBS (Browser Source 1080×1920)'); } catch (e) { prompt('Link OBS:', url); }
        });
        $('#nt-btn-open')?.addEventListener('click', async () => {      // Edge/Chrome --app (Electron của app tắt GPU → game 3D chạy ngoài)
            try {
                const r = await fetch('/api/nhatu/window/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                const j = await r.json().catch(() => ({}));
                toast(j.ok ? 'Đã mở cửa sổ game' : (j.error || 'Không mở được cửa sổ game'), j.ok ? 'success' : 'error');
            } catch (e) { toast('Không mở được cửa sổ game', 'error'); }
        });
        $('#nt-btn-reload')?.addEventListener('click', () => { socket && socket.emit('overlay:reload', { gameId: GAME_ID }); toast('Đã gửi lệnh tải lại overlay'); });
        $('#nt-btn-demo')?.addEventListener('click', e => { demoOn = !demoOn; e.currentTarget.classList.toggle('nt-on', demoOn); e.currentTarget.textContent = demoOn ? '⏸ Tắt demo' : '▶ Demo'; cmd('demo', { on: demoOn }); });
        $('#nt-btn-skip')?.addEventListener('click', () => cmd('skip'));
        $('#nt-btn-reset')?.addEventListener('click', async () => {
            const ok = window.hpConfirm ? await window.hpConfirm('Làm mới trại: xoá người xem trong trại, hàng chờ và bảng TOP?') : confirm('Làm mới trại?');
            if (ok) cmd('reset');
        });
    }

    // ---------------- vẽ ----------------
    function render() { renderSettings(); renderControl(); renderGifts(); }

    function num(k, label, min, step, title) {
        return `<label class="nt-row"><span${title ? ` title="${esc(title)}"` : ''}>${label}</span><input type="number" min="${min}" step="${step}" data-k="${k}" data-num="1" value="${esc(cfg[k])}"></label>`;
    }
    function renderSettings() {
        const host = $('#nt-settings');
        if (!host) return;
        const speeds = [[500, '30 giây'], [1000, '1 phút (mặc định)'], [2000, '2 phút'], [5000, '5 phút']];
        host.innerHTML = `
            <div class="nd-card-title">⚙ Cài đặt</div>
            <label class="nt-row"><span>Chế độ</span><select data-k="ntMode">
                <option value="auto"${cfg.ntMode === 'auto' ? ' selected' : ''}>🤖 Tự chơi — treo máy, quà → lượt lên sóng</option>
                <option value="streamer"${cfg.ntMode === 'streamer' ? ' selected' : ''}>🎮 Streamer điều khiển nhân vật</option>
            </select></label>
            <label class="nt-row"><span>Tên nhân vật streamer</span><input type="text" maxlength="24" data-k="ntStreamerName" placeholder="Streamer" value="${esc(cfg.ntStreamerName)}"></label>
            ${num('ntTurnBase', 'Giây mỗi lượt (quà 1 xu)', 5, 5)}
            ${num('ntTurnPerCoin', '+ Giây cho mỗi xu thêm', 0, 1)}
            ${num('ntTurnMax', 'Tối đa giây một lượt', 10, 10)}
            ${num('ntMinTurn', 'Có người chờ: giữ lượt tối thiểu (giây)', 3, 1, 'Quà mới của người khác → người đang chơi giữ ít nhất bấy nhiêu giây rồi nhường lượt')}
            ${num('ntIdleAuto', 'Im lặng bao lâu thì tự chơi (giây, 0 = tắt)', 0, 1)}
            ${num('ntMaxViewers', 'Tối đa người xem trong trại', 5, 5)}
            ${num('ntNpcCount', 'Dân số NPC khi trại vắng', 6, 2)}
            ${num('ntLikePerDay', 'Số tim cả phòng = gạch thêm 1 ngày', 0, 50)}
            ${num('ntBossSec', '👑 Đại Ca giữ ghế (giây)', 20, 30)}
            ${num('ntBossFollowers', '👑 Số đàn em bu quanh đại ca', 0, 1)}
            ${num('ntGuardSec', '👮 Cán Bộ trực (giây)', 20, 30)}
            ${num('ntJobSec', '🧑‍🍳🧹🩺 Đầu Bếp / Tổ Trưởng / Y Tá làm (giây)', 20, 30)}
            ${num('ntBossCoins', '👑 Quà chưa gán ≥ xu → Đại Ca (0 = tắt)', 0, 10)}
            ${num('ntGuardCoins', '👮 Quà chưa gán ≥ xu → Cán Bộ (0 = tắt)', 0, 10)}
            ${num('ntJailIdleSec', '🔒 Im lặng bao lâu thì nhốt biệt giam (giây, 0 = tắt)', 0, 30, 'Luật ngầm: người xem không bình luận / thả tim / tặng quà quá lâu → tự bị nhốt vào phòng trên lầu, thả tim lại là được thả')}
            <label class="nt-row"><span>1 phút trong trại =</span><select data-k="ntMinuteMs" data-num="1">${speeds.map(([v, n]) => `<option value="${v}"${Number(cfg.ntMinuteMs) === v ? ' selected' : ''}>${n} ngoài đời</option>`).join('')}</select></label>
            <div class="nt-checks">
                <label><input type="checkbox" data-k="ntPreempt"${cfg.ntPreempt !== false ? ' checked' : ''}> ⏭ Quà mới → nhường lượt (bỏ tick = chơi hết giờ mới tới người kế)</label>
                <label><input type="checkbox" data-k="ntAnyoneAct"${cfg.ntAnyoneAct ? ' checked' : ''}> 💬 Ai cũng ra lệnh được (mỗi người 8 giây/lần)</label>
                <label><input type="checkbox" data-k="ntJoinOnComment"${cfg.ntJoinOnComment !== false ? ' checked' : ''}> 🚪 Bình luận là vào trại</label>
                <label><input type="checkbox" data-k="ntJoinOnLike"${cfg.ntJoinOnLike !== false ? ' checked' : ''}> ❤️ Thả tim là vào trại (và được thả khỏi biệt giam)</label>
                <label><input type="checkbox" data-k="ntShowGiftLegend"${cfg.ntShowGiftLegend !== false ? ' checked' : ''}> 🎁 Hiện bảng "Tặng quà để…" trên overlay</label>
                <label><input type="checkbox" data-k="ntShowMenu"${cfg.ntShowMenu !== false ? ' checked' : ''}> 📋 Hiện bảng lệnh trên overlay</label>
                <label><input type="checkbox" data-k="ntSound"${cfg.ntSound !== false ? ' checked' : ''}> 🔊 Âm thanh</label>
                <label><input type="checkbox" data-k="ntMusic"${cfg.ntMusic ? ' checked' : ''}> 🎵 Nhạc nền lo-fi</label>
            </div>`;
        host.querySelectorAll('[data-k]').forEach(el => {
            el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
                const k = el.dataset.k;
                cfg[k] = el.type === 'checkbox' ? el.checked : el.dataset.num ? Number(el.value) || 0 : el.value;
                schedulePersist();
                if (k === 'ntMode') renderControl();
            });
        });
    }

    function renderControl() {
        const host = $('#nt-control');
        if (!host) return;
        const streamerMode = cfg.ntMode === 'streamer';
        const codes = actions.map((a, i) => `<button class="ghost small nt-cmd" data-act="${esc(a.id)}" title="Phím ${i + 1}">${esc(a.emoji)} ${esc(a.label)}<small>gõ ${esc(a.keys[0])} hoặc ${esc(String(a.keys[1] || '').toUpperCase())}</small></button>`).join('');
        host.innerHTML = `
            <div class="nd-card-title">${streamerMode ? '🎮 Điều khiển nhân vật streamer' : '🎥 Ra lệnh thay người đang có lượt'}</div>
            <div class="nt-cmds">${codes}</div>
            ${streamerMode ? `
            <div id="nt-pad" class="nt-pad" tabindex="0">
                <div class="nt-pad-tip">Bấm vào ô này rồi dùng <b>W A S D</b> / mũi tên · <b>Space</b> nhảy · <b>Shift</b> chạy · phím số <b>1–${actions.length}</b> làm nhiệm vụ.</div>
            </div>` : `
            <div class="nt-hint">Người xem bình luận <b>số</b> hoặc <b>chữ cái</b> (vd <b>1</b> hoặc <b>B</b> = ném bóng) khi tới lượt. Ai tặng quà thì được lên sóng: camera bám theo người đó. Không ai tặng quà → camera tự lia quanh trại, NPC tự sinh hoạt theo lịch.</div>`}
            <div class="nd-card-title" style="margin-top:8px">🧪 Thử nhanh (không cần LIVE)</div>
            <div class="nt-cmds">
                <button class="ghost small" data-test="gift">🎁 Tặng quà</button>
                <button class="ghost small" data-test="gift10">💎 Quà 10 xu</button>
                <button class="ghost small" data-test="comment">💬 Bình luận</button>
                <button class="ghost small" data-test="like">❤️ Thả tim</button>
                <button class="ghost small" data-test="follow">➕ Follow</button>
            </div>`;
        host.querySelectorAll('.nt-cmd').forEach(b => b.addEventListener('click', () => cmd('act', { action: b.dataset.act })));
        host.querySelectorAll('[data-test]').forEach(b => b.addEventListener('click', () => {
            const t = b.dataset.test;
            if (t === 'gift') cmd('test', { kind: 'gift', coins: 1 });
            else if (t === 'gift10') cmd('test', { kind: 'gift', coins: 10, giftName: 'Kem' });
            else cmd('test', { kind: t });
        }));
        if (streamerMode) bindPad();
    }

    function sendKey(code, down) {
        if (down ? held.has(code) : !held.has(code)) return;
        if (down) held.add(code); else held.delete(code);
        socket && socket.emit('nhatu:key', { code, down });
    }
    function releaseAll() { [...held].forEach(c => sendKey(c, false)); }
    function bindPad() {
        const pad = $('#nt-pad');
        if (!pad) return;
        pad.addEventListener('keydown', e => { if (!KEYS.includes(e.code)) return; e.preventDefault(); sendKey(e.code, true); });
        pad.addEventListener('keyup', e => { if (!KEYS.includes(e.code)) return; e.preventDefault(); sendKey(e.code, false); });
        pad.addEventListener('blur', releaseAll);
    }
    window.addEventListener('blur', releaseAll);

    // ---------------- 🎁 quà → nhiệm vụ ----------------
    function renderGifts() {
        const host = $('#nt-gifts');
        if (!host) return;
        const row = a => {
            const list = cfg.ntGiftMap[a.id] || [];
            const chips = list.map((g, i) => `<span class="nt-chip">${g.giftImage ? `<img src="${esc(g.giftImage)}">` : '🎁'}${esc(g.giftName || ('#' + g.giftId))}${g.coins ? `<small class="nt-coin">${esc(g.coins)}💎</small>` : ''}<button class="nt-x" data-a="${esc(a.id)}" data-i="${i}" title="Bỏ">✕</button></span>`).join('');
            const sub = a.keys ? `Bình luận: gõ ${a.keys[0]} hoặc ${String(a.keys[1] || '').toUpperCase()}` : (a.desc || '');
            return `<div class="nt-grow nt-grow3">
                <div class="nt-actname"><span class="nt-emo">${esc(a.emoji)}</span><div><b>${esc(a.label)}</b><small>${esc(sub)}</small></div></div>
                <div class="nt-chips">${chips}<button class="ghost small nt-add" data-a="${esc(a.id)}">＋ Chọn quà</button></div>
                <button class="ghost small nt-try" data-a="${esc(a.id)}" title="Thử trên overlay với người xem ảo">🧪 Thử</button>
            </div>`;
        };
        const roles = giftActions.filter(a => a.group === 'role');
        const evts = giftActions.filter(a => a.group === 'event');
        host.innerHTML = `
            <div class="nt-giftbar"><div class="nd-card-title">🎁 Gán quà → chức vụ, sự kiện, nhiệm vụ</div><button class="ghost small" id="nt-suggest" title="Gán lại toàn bộ theo bộ quà gợi ý (nhiệm vụ 1–10 xu, chức vụ 99 xu, sự kiện 88–299 xu)">🎁 Dùng bộ quà gợi ý</button></div>
            <div class="nt-hint">Mọi món quà đều cho người tặng 1 lượt lên sóng. Gán thêm quà để món đó kích hoạt ngay một vai trò / sự kiện bên dưới. Quà đã gán hiện trên overlay trong bảng "🎁 Tặng quà để…".</div>
            <div class="nd-card-title" style="margin-top:6px">👑 Chức vụ</div>
            ${roles.map(row).join('')}
            <div class="nd-card-title" style="margin-top:8px">🎉 Sự kiện cả trại</div>
            ${evts.map(row).join('')}
            <div class="nd-card-title" style="margin-top:8px">🎯 Nhiệm vụ cá nhân</div>
            ${actions.map(row).join('')}`;
        host.querySelectorAll('.nt-try').forEach(b => b.addEventListener('click', () => cmd('test', { kind: 'action', action: b.dataset.a })));
        host.querySelector('#nt-suggest')?.addEventListener('click', async () => {
            if (!Object.keys(suggested).length) { toast('Chưa có bộ quà gợi ý', 'error'); return; }
            const has = Object.keys(cfg.ntGiftMap || {}).length > 0;
            const ok = !has || (window.hpConfirm ? await window.hpConfirm('Thay toàn bộ quà đang gán bằng bộ quà gợi ý?') : confirm('Thay toàn bộ quà đang gán bằng bộ quà gợi ý?'));
            if (!ok) return;
            cfg.ntGiftMap = JSON.parse(JSON.stringify(suggested));
            renderGifts();
            persist().then(() => toast('Đã gán bộ quà gợi ý')).catch(() => toast('Lưu thất bại', 'error'));
        });
        host.querySelectorAll('.nt-add').forEach(b => b.addEventListener('click', () => openPicker(b.dataset.a)));
        host.querySelectorAll('.nt-x').forEach(b => b.addEventListener('click', () => {
            const arr = cfg.ntGiftMap[b.dataset.a] || [];
            arr.splice(Number(b.dataset.i), 1);
            if (!arr.length) delete cfg.ntGiftMap[b.dataset.a];
            renderGifts(); persist().catch(() => {});
        }));
    }

    // hộp chọn quà (dùng lại giao diện .nd-gp-* như Zombie Phá Nhà)
    let pickerEl = null, pickerAction = null;
    async function openPicker(actionId) {
        pickerAction = actionId;
        if (!Array.isArray(window.__giftSheet) || !window.__giftSheet.length) {
            try { const r = await fetch('/api/gifts'); if (r.ok) window.__giftSheet = (await r.json()).slice().sort((a, b) => (a.diamond || 0) - (b.diamond || 0)); } catch (e) {}
        }
        if (!pickerEl) {
            pickerEl = document.createElement('div');
            pickerEl.className = 'nd-gp-overlay';
            pickerEl.hidden = true;
            pickerEl.innerHTML = `<div class="nd-gp-modal">
                <div class="nd-gp-head"><div class="nd-gp-title"></div><button class="nd-gp-close ghost small">✕</button></div>
                <input class="nd-gp-search" type="text" placeholder="🔍 Tìm tên quà hoặc ID..." />
                <div class="nd-gp-list"></div>
                <div class="nd-gp-hint">Mỗi quà chỉ gán cho 1 nhiệm vụ.</div></div>`;
            document.body.appendChild(pickerEl);
            pickerEl.addEventListener('click', e => { if (e.target === pickerEl) pickerEl.hidden = true; });
            pickerEl.querySelector('.nd-gp-close').addEventListener('click', () => { pickerEl.hidden = true; });
            pickerEl.querySelector('.nd-gp-search').addEventListener('input', e => renderPicker(e.target.value));
        }
        const a = actions.concat(giftActions).find(x => x.id === actionId);
        pickerEl.querySelector('.nd-gp-title').textContent = `🎁 Chọn quà cho: ${a ? a.emoji + ' ' + a.label : actionId}`;
        pickerEl.querySelector('.nd-gp-search').value = '';
        pickerEl.hidden = false;
        renderPicker('');
        setTimeout(() => pickerEl.querySelector('.nd-gp-search').focus(), 30);
    }
    function renderPicker(filter) {
        const list = pickerEl.querySelector('.nd-gp-list');
        const sheet = Array.isArray(window.__giftSheet) ? window.__giftSheet : [];
        const f = String(filter || '').toLowerCase().trim();
        const used = new Set((cfg.ntGiftMap[pickerAction] || []).map(g => String(g.giftId)));
        const items = !f ? sheet : sheet.filter(g => (g.name || '').toLowerCase().includes(f) || String(g.id || '').includes(f));
        list.innerHTML = items.slice(0, 200).map(g => `
            <div class="nd-gp-row${used.has(String(g.id)) ? ' active' : ''}" data-gid="${esc(g.id)}" data-gn="${esc(g.name || '')}" data-gi="${esc(g.image || '')}">
                ${g.image ? `<img class="nd-gp-img" src="${esc(g.image)}" />` : '<span class="nd-gp-icon">🎁</span>'}
                <span class="nd-gp-name">${esc(g.name || ('Quà #' + g.id))}</span>
                <span class="nd-gp-dia">${g.diamond || 0}💎</span>
                ${used.has(String(g.id)) ? '<span class="nd-gp-tick">✓</span>' : ''}
            </div>`).join('') || '<div class="nd-empty">Chưa có danh sách quà (kết nối LIVE để tải).</div>';
        list.querySelectorAll('.nd-gp-row').forEach(r => r.addEventListener('click', () => {
            const id = r.dataset.gid;
            Object.keys(cfg.ntGiftMap).forEach(k => {   // 1 quà ↔ 1 nhiệm vụ
                cfg.ntGiftMap[k] = (cfg.ntGiftMap[k] || []).filter(g => String(g.giftId) !== id);
                if (!cfg.ntGiftMap[k].length) delete cfg.ntGiftMap[k];
            });
            const sg = (Array.isArray(window.__giftSheet) ? window.__giftSheet : []).find(g => String(g.id) === id);
            (cfg.ntGiftMap[pickerAction] = cfg.ntGiftMap[pickerAction] || []).push({ giftId: id, giftName: r.dataset.gn, giftImage: r.dataset.gi, coins: sg ? sg.diamond || 0 : 0 });
            pickerEl.hidden = true;
            renderGifts(); persist().catch(() => toast('Lưu thất bại', 'error'));
        }));
    }

    window.HpNhaTuPanel = { open };
})();
