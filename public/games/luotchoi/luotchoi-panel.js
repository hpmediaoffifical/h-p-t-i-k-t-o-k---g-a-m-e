// 🌐 hpT(): ngôn ngữ giao diện; trang chưa nạp thì giữ tiếng Việt (chỉ thay {biến}).
var hpT = (typeof globalThis !== 'undefined' && globalThis.hpT) || function (s, v) { return String(s).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, function (m, k) { return v && v[k] != null ? String(v[k]) : m; }); };
/* 🎲 Đấu Trường Mini — panel trong app. Tự chèn <section id="view-luotchoi"> (khuôn goibai/dacau).
 * Cột trái: chọn trò + bàn (ghế, bấm số cho Chủ LIVE) + hàng chờ + vô địch + 🧪 thử.
 * Cột phải: cài đặt, lưu debounce 350 ms qua /api/games/luotchoi/config. Trạng thái sống: socket 'luotchoi:state'.
 * Spec docs/superpowers/specs/2026-11-12-luotchoi-design.md. */
(function () {
    'use strict';
    const $ = (sel, root) => (root || document).querySelector(sel);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const COIN = '<img class="hp-coin-ico" src="/coin.svg" alt="">';
    const PHASE = { lobby: 'Sảnh chờ', playing: 'Đang chơi', result: 'Kết quả' };
    const SIZE = { hama: ['teeth', 'Số răng', 6, 16], chumcoc: ['holes', 'Số lỗ chum', 8, 30], thaptre: ['levels', 'Số tầng', 6, 12], latcap: ['pairs', 'Số cặp', 4, 12], oanquan: ['quanValue', 'Quan = mấy dân (5 hoặc 10)', 5, 10] };
    const API = (cmd, extra) => fetch('/api/luotchoi/cmd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ cmd }, extra || {})) }).then(r => r.json()).catch(() => ({ ok: false }));
    let cfg = null, st = null, socket = null, bound = false, persistTimer = null, clockOff = 0, cdTimer = null;

    function ensureView() {
        if ($('#view-luotchoi')) return $('#view-luotchoi');
        const host = $('.view').parentNode;
        const sec = document.createElement('section');
        sec.id = 'view-luotchoi'; sec.className = 'view game-view lc-view';
        sec.innerHTML = `
            <header class="game-header">
                <div><h2>${hpT('🎲 Đấu Trường Mini')}</h2><div class="game-sub">${hpT('Tặng quà vào ghế · tới lượt bình luận số')}</div></div>
                <div class="overlay-bar">
                    <label class="lc-switch"><input type="checkbox" id="lc-enabled"> <span>${hpT('Bật')}</span></label>
                    <button id="lc-btn-host" class="ghost small">${hpT('🙋 Tôi vào chơi')}</button>
                    <button id="lc-btn-start" class="primary small">${hpT('▶ Bắt đầu')}</button>
                    <button id="lc-btn-cancel" class="danger small">${hpT('Huỷ ván')}</button>
                    <span class="nd-bar-spacer"></span>
                    <button id="lc-btn-obs" class="obs-link small">${hpT('Thêm vào OBS')}</button>
                    <button id="lc-btn-pop" class="ghost small">${hpT('Xem mẫu')}</button>
                </div>
            </header>
            <div class="game-body lc-body">
                <div class="lc-games" id="lc-games"></div>
                <div class="lc-grid">
                    <div class="lc-col">
                        <div class="lc-box"><div class="lc-h"><span id="lc-phase"></span><span id="lc-clock" class="lc-muted"></span></div>
                            <div id="lc-seats"></div><div id="lc-board"></div></div>
                        <div class="lc-box" id="lc-queue-box"><div class="lc-h">${hpT('Hàng chờ ván sau')}</div><div id="lc-queue"></div></div>
                        <div class="lc-box" id="lc-champ-box"><div class="lc-h">${hpT('🏆 Vô địch buổi này')}</div><div id="lc-champs"></div></div>
                        <div class="lc-box"><div class="lc-h">${hpT('🧪 Thử')}</div>
                            <div class="lc-line"><input id="lc-t-nick" value="Người xem thử" placeholder="${esc(hpT('Tên người xem'))}">
                                <button id="lc-t-seat" class="ghost small">${hpT('Vào ghế')}</button><button id="lc-t-shield" class="ghost small">${hpT('🛡️ Khiên')}</button></div>
                            <div class="lc-line"><input id="lc-t-text" placeholder="${esc(hpT('Bình luận, vd 7'))}" style="width:120px">
                                <button id="lc-t-chat" class="ghost small">${hpT('Gửi bình luận')}</button><span id="lc-t-msg" class="lc-muted"></span></div>
                        </div>
                    </div>
                    <div class="lc-col" id="lc-settings"></div>
                </div>
            </div>`;
        host.appendChild(sec);
        const css = document.createElement('style');
        css.textContent = `
            .lc-body { display: flex; flex-direction: column; gap: 10px; padding: 12px; min-height: 0; flex: 1; overflow: auto; }
            .lc-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 12px; align-items: start; }
            .lc-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
            .lc-box { border: 1px solid rgba(127,127,127,.28); border-radius: 12px; padding: 10px 12px; background: rgba(127,127,127,.06); }
            .lc-h { font-weight: 600; margin-bottom: 6px; display: flex; justify-content: space-between; gap: 8px; }
            .lc-muted { opacity: .65; font-size: 12px; font-weight: 400; }
            .lc-games { display: flex; gap: 8px; flex-wrap: wrap; }
            .lc-game { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 99px; border: 1px solid rgba(127,127,127,.3); background: transparent; cursor: pointer; font: inherit; color: inherit; }
            .lc-game.on { border-color: #ff4f8b; background: rgba(255,79,139,.12); font-weight: 600; }
            .lc-seat { display: grid; grid-template-columns: 22px 1fr auto auto; gap: 8px; align-items: center; padding: 5px 0; border-top: 1px solid rgba(127,127,127,.15); }
            .lc-seat:first-child { border-top: 0; } .lc-seat.turn b { color: #ff4f8b; } .lc-seat.out { opacity: .45; text-decoration: line-through; }
            .lc-seat b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .lc-nums { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
            .lc-nums button { min-width: 34px; padding: 4px 0; }
            .lc-nums button:disabled { opacity: .3; }
            .lc-nums .face { font-size: 16px; }
            .lc-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 6px 0; }
            .lc-line > label:first-child { min-width: 150px; opacity: .85; }
            .lc-line input[type=number] { width: 72px; }
            .lc-gift { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
            .lc-gift img { width: 28px; height: 28px; object-fit: contain; } .lc-gift b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .lc-switch { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
            .lc-warn { color: #d39b16; font-size: 12px; }
            .lc-chip { display: inline-block; padding: 2px 8px; border-radius: 99px; background: rgba(127,127,127,.14); margin: 2px; font-size: 12px; }
            @media (max-width: 900px) { .lc-grid { grid-template-columns: 1fr; } }`;
        document.head.appendChild(css);
        return sec;
    }

    // ── cấu hình ───────────────────────────────────────────────────────────
    async function loadConfig() {
        try { cfg = await fetch('/api/games/luotchoi/config', { cache: 'no-store' }).then(r => r.json()); } catch (e) { cfg = null; }
        fixCfg();
        renderSettings(); renderGames();
    }
    function fixCfg() {
        cfg = cfg || {};
        if (!Array.isArray(cfg.seatGifts)) cfg.seatGifts = [];
        if (!Array.isArray(cfg.shieldGifts)) cfg.shieldGifts = [];
    }
    function schedulePersist() { clearTimeout(persistTimer); persistTimer = setTimeout(persistConfig, 350); }
    async function persistConfig() {
        persistTimer = null;
        try { await fetch('/api/games/luotchoi/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) }); } catch (e) {}
    }
    const numField = (key, label, min, max, hint) =>
        `<div class="lc-line"><label>${label}</label><input type="number" data-k="${key}" min="${min}" max="${max}" value="${esc(cfg[key])}">${hint ? `<span class="lc-muted">${hint}</span>` : ''}</div>`;
    const giftRows = (list, key, empty) => list.map((g, i) => `<div class="lc-gift" data-gid="${esc(g.giftId)}">${g.giftImage ? `<img src="${esc(g.giftImage)}" alt="">` : '🎁'}<b>${esc(g.giftName || ('#' + g.giftId))}</b><button class="ghost small" data-del="${key}:${i}">✕</button></div>`).join('')
        || `<div class="lc-warn">${empty}</div>`;

    function renderSettings() {
        const box = $('#lc-settings');
        if (!box || !cfg) return;
        $('#lc-enabled').checked = cfg.enabled === true;
        const size = SIZE[cfg.game || 'hama'];
        box.innerHTML = `
            <div class="lc-box"><div class="lc-h">${hpT('🎁 Quà vào ghế')}</div>${giftRows(cfg.seatGifts, 'seatGifts', hpT('Chưa chọn quà — người xem chưa vào ghế được.'))}
                <div class="lc-line"><button class="ghost small" data-add="seatGifts">${hpT('＋ Thêm quà')}</button></div></div>
            <div class="lc-box"><div class="lc-h">${hpT('🛡️ Quà khiên')} <span class="lc-muted">${hpT('người đang ngồi tặng → đỡ 1 lần trúng bẫy')}</span></div>${giftRows(cfg.shieldGifts, 'shieldGifts', hpT('Không dùng khiên.'))}
                <div class="lc-line"><button class="ghost small" data-add="shieldGifts">${hpT('＋ Thêm quà')}</button></div></div>
            <div class="lc-box"><div class="lc-h">${hpT('Luật')}</div>
                ${numField('seats', hpT('Số ghế'), 2, 4)}
                ${numField('minPlayers', hpT('Tối thiểu để chạy'), 2, 4)}
                ${numField('lobbySec', hpT('Chờ người vào (giây)'), 5, 120)}
                ${numField('turnSec', hpT('Mỗi lượt (giây)'), 8, 60, hpT('hết giờ máy chọn hộ'))}
                ${numField('resultSec', hpT('Hiện kết quả (giây)'), 3, 30)}
                ${numField(size[0], hpT(size[1]), size[2], size[3])}
                ${numField('maxQueue', hpT('Hàng chờ tối đa'), 0, 30)}
                <div class="lc-line"><label>${hpT('Tên Chủ LIVE')}</label><input data-t="hostName" value="${esc(cfg.hostName || 'Chủ LIVE')}" maxlength="30"></div>
            </div>
            <div class="lc-box"><div class="lc-h">${hpT('🖼️ Hiển thị trên LIVE')} <span class="lc-muted">${hpT('không che creator')}</span></div>
                <div class="lc-line"><label>${hpT('Kiểu hiển thị')}</label><select data-s="frame">${[['hud', 'HUD nổi (mặc định)'], ['card', 'Khung kính']].map(([v, l]) => `<option value="${v}" ${(cfg.frame || 'hud') === v ? 'selected' : ''}>${hpT(l)}</option>`).join('')}</select></div>
                <div class="lc-line"><label>${hpT('Vị trí khung')}</label><select data-s="layout">${[['bottom', 'Dưới (mặc định)'], ['middle', 'Giữa'], ['top', 'Trên']].map(([v, l]) => `<option value="${v}" ${(cfg.layout || 'bottom') === v ? 'selected' : ''}>${hpT(l)}</option>`).join('')}</select></div>
                <div class="lc-line"><label>${hpT('Nền mờ')}</label><input type="range" data-k="glass" min="0" max="90" value="${esc(cfg.glass ?? 35)}" style="flex:1"><span id="lc-glass">${esc(cfg.glass ?? 35)}%</span></div>
                <div class="lc-line"><label>${hpT('Cỡ khung')}</label><input type="range" data-k="cardScale" min="55" max="100" value="${esc(cfg.cardScale ?? 85)}" style="flex:1"><span id="lc-scale">${esc(cfg.cardScale ?? 85)}%</span></div>
            </div>
            <div class="lc-box"><div class="lc-h">${hpT('🔊 Giọng đọc')} <span class="lc-muted">${hpT('phát trong OBS: tới lượt, số đã chọn, dính bẫy')}</span></div>
                <div class="lc-line"><label><input type="checkbox" data-c="voice" ${cfg.voice !== false ? 'checked' : ''}> ${hpT('Đọc tên người chơi')}</label></div>
                <div class="lc-line"><label>${hpT('Âm lượng')}</label><input type="range" data-k="voiceVolume" min="0" max="100" value="${esc(cfg.voiceVolume ?? 80)}" style="flex:1"><span id="lc-vol">${esc(cfg.voiceVolume ?? 80)}%</span></div>
            </div>`;
        box.querySelectorAll('input[data-k]').forEach(el => el.addEventListener(el.type === 'range' ? 'input' : 'change', () => {
            cfg[el.dataset.k] = Number(el.value);
            if (el.dataset.k === 'voiceVolume') $('#lc-vol').textContent = el.value + '%';
            if (el.dataset.k === 'glass') $('#lc-glass').textContent = el.value + '%';
            if (el.dataset.k === 'cardScale') $('#lc-scale').textContent = el.value + '%';
            schedulePersist();
        }));
        box.querySelectorAll('select[data-s]').forEach(el => el.addEventListener('change', () => { cfg[el.dataset.s] = el.value; schedulePersist(); }));
        box.querySelectorAll('input[data-c]').forEach(el => el.addEventListener('change', () => { cfg[el.dataset.c] = el.checked; schedulePersist(); }));
        box.querySelectorAll('input[data-t]').forEach(el => el.addEventListener('change', () => { cfg[el.dataset.t] = el.value.trim(); schedulePersist(); }));
        box.querySelectorAll('[data-del]').forEach(el => el.addEventListener('click', () => {
            const [k, i] = el.dataset.del.split(':'); cfg[k].splice(Number(i), 1); renderSettings(); schedulePersist();
        }));
        box.querySelectorAll('[data-add]').forEach(el => el.addEventListener('click', () => openGiftPicker(el.dataset.add)));
    }
    function renderGames() {
        const box = $('#lc-games');
        if (!box || !cfg) return;
        const list = (st && st.games) || [];
        box.innerHTML = list.map(g => `<button class="lc-game${(cfg.game || 'hama') === g.id ? ' on' : ''}" data-g="${esc(g.id)}">${esc(g.icon)} ${esc(hpT(g.name))}</button>`).join('');
        box.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', async () => {
            if (b.dataset.g === cfg.game) return;
            if (st && st.phase === 'playing') {
                const ok = window.hpConfirm ? await window.hpConfirm({ icon: '🎲', title: hpT('Đổi trò?'), body: hpT('Ván đang chơi sẽ bị huỷ, người đang ngồi giữ ghế.'), okLabel: hpT('Đổi trò') }) : confirm(hpT('Đổi trò?'));
                if (!ok) return;
            }
            cfg.game = b.dataset.g; renderGames(); renderSettings(); schedulePersist();
        }));
    }

    // ── trạng thái sống ────────────────────────────────────────────────────
    function renderClock() {
        const el = $('#lc-clock');
        if (!el || !st) return;
        const t = Date.now() + clockOff;
        const left = (u) => Math.max(0, Math.ceil((u - t) / 1000));
        el.textContent = st.phase === 'lobby' && st.lobbyUntil ? hpT('chạy sau {s}s', { s: left(st.lobbyUntil) })
            : st.phase === 'playing' && st.turnUntil ? hpT('còn {s}s', { s: left(st.turnUntil) })
            : st.phase === 'result' ? hpT('ván mới sau {s}s', { s: left(st.resultUntil) }) : '';
    }
    function renderLive() {
        if (!st) return;
        clockOff = (st.now || Date.now()) - Date.now();
        renderGames();
        const g = st.game || {};
        $('#lc-phase').innerHTML = `${esc(g.icon || '')} ${esc(hpT(g.name || ''))} · ${esc(hpT(PHASE[st.phase] || ''))}${st.cfg && !st.cfg.enabled ? ` <span class="lc-warn">${hpT('(đang tắt)')}</span>` : ''}`;
        const need = Math.max(0, (st.cfg?.minPlayers || 2) - st.seats.length);
        $('#lc-seats').innerHTML = st.seats.map((s, i) => `<div class="lc-seat${s.turn ? ' turn' : ''}${s.out ? ' out' : ''}"><span>${i + 1}</span>
            <b>${s.turn ? '👉 ' : ''}${s.host ? '🎙️ ' : ''}${esc(s.nickname)}</b>
            <span>${s.shields ? '🛡️'.repeat(s.shields) : ''}${g.kind === 'score' && st.phase !== 'lobby' ? ` ${s.score} ${hpT('cặp')}` : ''}</span>
            <button class="ghost small" data-kick="${esc(s.key)}" title="${esc(hpT('Mời khỏi ghế'))}">✕</button></div>`).join('')
            + (st.phase === 'lobby' && need ? `<div class="lc-muted">${hpT('Cần thêm {n} người để chạy', { n: need })}</div>` : '')
            + (st.phase === 'result' && st.result ? `<div class="lc-line">${st.result.draw ? hpT('🤝 Hoà') : '🏆 ' + esc(st.result.winners.map(w => w.nickname).join(', '))}${st.result.losers.length ? ' · 🗑️ ' + esc(st.result.losers.map(w => w.nickname).join(', ')) : ''}</div>` : '');
        $('#lc-seats').querySelectorAll('[data-kick]').forEach(b => b.addEventListener('click', () => API('kick', { key: b.dataset.kick })));
        renderBoard();
        $('#lc-queue-box').hidden = !st.queue.length;
        $('#lc-queue').innerHTML = st.queue.map((q, i) => `<span class="lc-chip">${i + 1}. ${esc(q.nickname)}</span>`).join('');
        $('#lc-champ-box').hidden = !st.champs.length;
        $('#lc-champs').innerHTML = st.champs.map((c, i) => `<span class="lc-chip">${['🥇', '🥈', '🥉'][i] || (i + 1) + '.'} ${esc(c.nickname)} · ${c.wins}</span>`).join('');
        $('#lc-btn-start').disabled = !(st.phase === 'lobby' && st.seats.length >= 2);
        $('#lc-btn-cancel').disabled = st.phase === 'lobby';
        renderClock();
    }
    // Bàn số: Chủ LIVE tới lượt thì bấm được; còn lại chỉ để xem ô nào đã dùng.
    function renderBoard() {
        const el = $('#lc-board');
        const b = st.board;
        if (!b || st.phase === 'lobby') { el.innerHTML = ''; return; }
        const hostTurn = !!(st.seats.find(s => s.turn) || {}).host;
        const opts = new Set(st.options || []);
        let cells = [];
        // Ô Ăn Quan: chưa chọn ô → nút ô 1–5 hàng của mình; đã chọn ô → 2 nút hướng
        if (b.kind === 'oanquan') cells = b.sel != null
            ? [{ n: 1, label: '⬅ Trái' }, { n: 2, label: 'Phải ➡' }]
            : [1, 2, 3, 4, 5].map(n => ({ n, label: 'Ô ' + n }));
        else if (b.kind === 'latcap') cells = b.cards.map(c => ({ n: c.n, label: c.face ? `<span class="face">${c.face}</span>` : c.n }));
        else if (b.kind === 'thaptre') cells = b.bars.filter(x => x.level < b.levels).map(x => ({ n: x.n, label: x.n }));
        else cells = Array.from({ length: b.n }, (_, i) => ({ n: i + 1, label: i + 1 }));
        el.innerHTML = `<div class="lc-nums">${cells.map(c => `<button class="ghost small" data-n="${c.n}" ${hostTurn && opts.has(c.n) ? '' : 'disabled'}>${c.label}</button>`).join('')}</div>`
            + (hostTurn ? `<div class="lc-muted">${hpT('Tới lượt bạn — bấm một số')}</div>` : '');
        el.querySelectorAll('[data-n]').forEach(x => x.addEventListener('click', () => API('pick', { n: Number(x.dataset.n) })));
    }

    // ── chọn quà (khung .nd-gp-* chung) ─────────────────────────────────────
    let picker = null, pickFor = 'seatGifts';
    async function openGiftPicker(key) {
        pickFor = key;
        if (!Array.isArray(window.__giftSheet) || !window.__giftSheet.length) {
            try { const r = await fetch('/api/gifts'); if (r.ok) window.__giftSheet = (await r.json()).slice().sort((a, b) => (a.diamond || 0) - (b.diamond || 0)); } catch (e) {}
        }
        if (!picker) {
            picker = document.createElement('div');
            picker.className = 'nd-gp-overlay'; picker.hidden = true;
            picker.innerHTML = `<div class="nd-gp-modal"><div class="nd-gp-head"><div class="nd-gp-title"></div><button class="nd-gp-close ghost small">✕</button></div>
                <input class="nd-gp-search" type="text" placeholder="${esc(hpT('Tìm quà hoặc ID…'))}" /><div class="nd-gp-list"></div>
                <div class="nd-gp-hint">${hpT('Bấm vào quà để thêm. Quà đã chọn có dấu ✓.')}</div></div>`;
            document.body.appendChild(picker);
            picker.addEventListener('click', e => { if (e.target === picker) picker.hidden = true; });
            picker.querySelector('.nd-gp-close').addEventListener('click', () => { picker.hidden = true; });
            picker.querySelector('.nd-gp-search').addEventListener('input', e => renderPicker(e.target.value));
        }
        picker.querySelector('.nd-gp-title').textContent = key === 'seatGifts' ? hpT('Chọn quà vào ghế') : hpT('Chọn quà khiên');
        picker.hidden = false;
        picker.querySelector('.nd-gp-search').value = '';
        renderPicker('');
        setTimeout(() => picker.querySelector('.nd-gp-search').focus(), 30);
    }
    function renderPicker(filter) {
        const list = picker.querySelector('.nd-gp-list');
        const sheet = Array.isArray(window.__giftSheet) ? window.__giftSheet : [];
        const f = String(filter || '').toLowerCase().trim();
        const used = new Set(cfg[pickFor].map(g => String(g.giftId)));
        const other = new Set(cfg[pickFor === 'seatGifts' ? 'shieldGifts' : 'seatGifts'].map(g => String(g.giftId)));
        const items = !f ? sheet : sheet.filter(g => (g.name || '').toLowerCase().includes(f) || String(g.id || '').includes(f));
        list.innerHTML = items.map(g => `
            <div class="nd-gp-row${used.has(String(g.id)) ? ' active' : ''}" data-gid="${esc(String(g.id))}" data-gn="${esc(g.name || '')}" data-gi="${esc(g.image || '')}">
                ${g.image ? `<img class="nd-gp-img" loading="lazy" decoding="async" src="${esc(g.image)}" />` : '<span class="nd-gp-icon">🎁</span>'}
                <span class="nd-gp-name">${esc(g.name || hpT('Quà #{id}', { id: g.id }))}${other.has(String(g.id)) ? ' <small>' + esc(pickFor === 'seatGifts' ? hpT('(đang là quà khiên)') : hpT('(đang là quà vào ghế)')) + '</small>' : ''}</span><span class="nd-gp-dia">${g.diamond || 0}${COIN}</span>
                ${used.has(String(g.id)) ? '<span class="nd-gp-tick">✓</span>' : ''}</div>`).join('') || `<div class="nd-empty">${hpT('Không tìm thấy quà')}</div>`;
        list.querySelectorAll('.nd-gp-row').forEach(r => r.addEventListener('click', () => {
            if (used.has(r.dataset.gid)) return;
            cfg[pickFor].push({ giftId: r.dataset.gid, giftName: r.dataset.gn, giftImage: r.dataset.gi });
            renderSettings(); schedulePersist();
            picker.hidden = true;
        }));
    }

    // ── khung ──────────────────────────────────────────────────────────────
    const testKey = () => 'test_' + ($('#lc-t-nick').value.trim() || 'Người xem thử').replace(/\s+/g, '_');
    function bindShell() {
        $('#lc-enabled').addEventListener('change', e => { if (!cfg) return; cfg.enabled = e.target.checked; schedulePersist(); });
        $('#lc-btn-host').addEventListener('click', () => API('host'));
        $('#lc-btn-start').addEventListener('click', () => API('start'));
        $('#lc-btn-cancel').addEventListener('click', () => API('cancel'));
        $('#lc-btn-obs').addEventListener('click', () => {
            const url = window.buildOverlayURL('/overlay/luotchoi');
            if (window.hpObsQuick) { window.hpObsQuick(url, 'Đấu Trường Mini'); return; }
            navigator.clipboard?.writeText(url);
        });
        $('#lc-btn-pop').addEventListener('click', () => window.open(window.buildOverlayURL('/overlay/luotchoi') + '?demo=' + encodeURIComponent(cfg?.game || 'hama'), '_blank', 'width=540,height=960'));
        const msg = (t) => { $('#lc-t-msg').textContent = t; };
        const test = async (kind) => {
            const nickname = $('#lc-t-nick').value.trim() || 'Người xem thử';
            const r = await API('test', { kind, nickname, uniqueId: testKey() });
            msg({ seat: hpT('Đã vào ghế'), queue: hpT('Vào hàng chờ'), shield: hpT('+1 khiên'), full: hpT('Hàng chờ đầy') }[r.action] || (cfg?.enabled ? hpT('Không đổi (đã ngồi / chưa ngồi)') : hpT('Game đang tắt')));
        };
        $('#lc-t-seat').addEventListener('click', () => test('seat'));
        $('#lc-t-shield').addEventListener('click', () => test('shield'));
        // Bình luận thử đi đúng đường thật (/api/test-chat → lọc từ cấm → handleTikTokChat → bàn)
        $('#lc-t-chat').addEventListener('click', async () => {
            const comment = $('#lc-t-text').value.trim();
            if (!comment) return;
            try {
                const r = await fetch('/api/test-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uniqueId: testKey(), nickname: $('#lc-t-nick').value.trim(), comment }) }).then(x => x.json());
                msg(r.blocked ? hpT('Bị chặn: dính từ cấm') : hpT('Đã gửi'));
            } catch (e) { msg(hpT('Lỗi kết nối server')); }
        });
    }

    function open(sharedSocket) {
        socket = sharedSocket;
        const view = ensureView();
        document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v === view));
        if (!bound) { bindShell(); bound = true; }
        if (!cdTimer) cdTimer = setInterval(() => { if ($('#view-luotchoi.active')) renderClock(); }, 500);
        if (socket && !socket.__lcAttached) {
            socket.__lcAttached = true;
            socket.on('luotchoi:state', s => { st = s; if ($('#view-luotchoi.active')) renderLive(); });
            socket.on('gameConfig', ({ gameId, config }) => {
                if (gameId !== 'luotchoi' || persistTimer) return;
                cfg = Object.assign({}, config); fixCfg();
                renderSettings(); renderGames();
            });
        }
        loadConfig();
        fetch('/api/luotchoi/state', { cache: 'no-store' }).then(r => r.json()).then(s => { st = s; renderLive(); }).catch(() => {});
    }

    window.HpLuotChoiPanel = { open };
})();
