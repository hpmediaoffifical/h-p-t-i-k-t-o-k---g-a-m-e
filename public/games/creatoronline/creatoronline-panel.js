/* ============================================================
   🏢 Creator Online — Panel controller (app side)
   ============================================================
   - Cài đặt co* (POST /api/games/creatoronline/config) — spec docs/superpowers/specs/2026-11-03-creatoronline-design.md §17.3.
   - Lệnh overlay qua POST /api/games/creatoronline/cmd (gameCmd {cmd, payload}): test / pk / skip / cut / reset.
   - 🎁 Gán quà → hành động (coGiftMap theo giftId), cảnh báo quà trùng với Nhà Tù / Zombie đang bật.
   - 📌 Câu ghim bình luận TikTok, 🏆 Top fan trọn đời (/api/creatoronline/fans/top).
   Danh sách hành động + bộ quà gợi ý đọc chung public/games/creatoronline/data.json với overlay.
   Expose: window.HpCreatorOnlinePanel.open(socket)
   ============================================================ */
(function () {
    'use strict';

    const GAME_ID = 'creatoronline';
    const DEFAULTS = {
        enabled: true, coQuality: 'high', coMaxViewers: 40, coNpcCount: 20, coViewerIdleMin: 30, coClubSwitchSec: 60,
        coStageBaseSec: 12, coStagePerCoinSec: 3, coStageMaxSec: 120, coStageSlots: 12, coRoomHoldSec: 60, coRoomQueueMax: 6,
        coRoleSec: 180, coRoleLockSec: 45, coRoleMaxSec: 300, coPkEveryMin: 5, coPkSec: 90, coPkFinalSec: 30, coMvpMin: 10,
        coCamMaxPer5Min: 90, coTierFallback: true, coLikeMilestone: 300, coSound: true, coMusic: true, coMusicVol: 0.35,
        coLiveTv: true, coShowGiftLegend: true, coShowJoinHint: true, coBadWords: '', coGiftMap: {}
    };
    // game Tương Tác khác có bảng gán quà riêng (cấu trúc khác nhau → mỗi game 1 hàm lấy danh sách giftId)
    const OTHER_MAPS = [
        { id: 'nhatu', name: 'Nhà Tù Online', ids: c => mapIds(c && c.ntGiftMap) },
        { id: 'quaivat', name: 'Zombie Phá Nhà', ids: c => mapIds(c && c.qvGiftMap) }
    ];

    let socket = null, cfg = null, giftActions = [], suggested = {}, initialized = false, pendingSave = null;
    let others = new Map();   // giftId → [tên game đang bật cũng gán quà này]
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, k) => { if (typeof window.toast === 'function') window.toast(m, k || 'success', 2500); };
    function mapIds(m) {
        const out = [];
        if (m && typeof m === 'object') for (const list of Object.values(m)) for (const g of (Array.isArray(list) ? list : [])) if (g && g.giftId != null) out.push(String(g.giftId));
        return out;
    }

    function open(sharedSocket) {
        socket = sharedSocket || window.io();
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        $('#view-creatoronline')?.classList.add('active');
        if (!initialized) { initialized = true; bindShell(); }
        load().then(render);
    }

    async function load() {
        try { const r = await fetch('/api/games/creatoronline/config'); cfg = r.ok ? await r.json() : {}; } catch (e) { cfg = {}; }
        cfg = Object.assign({}, DEFAULTS, cfg || {});
        if (!cfg.coGiftMap || typeof cfg.coGiftMap !== 'object') cfg.coGiftMap = {};
        if (!giftActions.length) {
            try { const r = await fetch('/games/creatoronline/data.json'); if (r.ok) { const d = await r.json(); giftActions = d.giftActions || []; suggested = d.suggestedGiftMap || {}; } } catch (e) {}
        }
        others = new Map();
        await Promise.all(OTHER_MAPS.map(async g => {
            try {
                const r = await fetch(`/api/games/${g.id}/config`);
                if (!r.ok) return;
                const c = await r.json();
                if (!c || c.enabled === false) return;
                for (const id of g.ids(c)) others.set(id, (others.get(id) || []).concat(g.name));
            } catch (e) {}
        }));
    }
    function schedulePersist() { clearTimeout(pendingSave); pendingSave = setTimeout(() => persist().catch(() => toast('Lưu thất bại', 'error')), 350); }
    async function persist() {
        clearTimeout(pendingSave);
        const r = await fetch('/api/games/creatoronline/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
        if (!r.ok) throw new Error('save_fail');
    }
    async function cmd(name, payload) {
        try {
            const r = await fetch('/api/games/creatoronline/cmd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd: name, payload: payload || {} }) });
            if (!r.ok) { const j = await r.json().catch(() => ({})); toast(j.message || 'Lệnh bị từ chối', 'error'); }
        } catch (e) { toast('Không gửi được lệnh', 'error'); }
    }
    async function openWindow(demo) {     // Edge/Chrome --app (Electron của app tắt GPU → game 3D chạy ngoài)
        try {
            const r = await fetch('/api/creatoronline/window/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demo: !!demo }) });
            const j = await r.json().catch(() => ({}));
            toast(j.ok ? (demo ? 'Đã mở Bản đi dạo' : 'Đã mở cửa sổ game') : (j.error || 'Không mở được cửa sổ game'), j.ok ? 'success' : 'error');
        } catch (e) { toast('Không mở được cửa sổ game', 'error'); }
    }

    // ---------------- thanh công cụ ----------------
    function bindShell() {
        $('#co-btn-copy')?.addEventListener('click', async () => {
            const path = '/overlay/creatoronline' + (cfg && cfg.coQuality === 'low' ? '?q=low' : '');
            const url = window.buildOverlayURL ? window.buildOverlayURL(path) : location.origin + path;
            try { await navigator.clipboard.writeText(url); toast('Đã copy link OBS (Browser Source 1080×1920)'); } catch (e) { prompt('Link OBS:', url); }
        });
        $('#co-btn-open')?.addEventListener('click', () => openWindow(false));
        $('#co-btn-demo')?.addEventListener('click', () => openWindow(true));
        $('#co-btn-reload')?.addEventListener('click', () => { socket && socket.emit('overlay:reload', { gameId: GAME_ID }); toast('Đã gửi lệnh tải lại overlay'); });
        $('#co-btn-skip')?.addEventListener('click', () => cmd('skip'));
        $('#co-btn-pk')?.addEventListener('click', () => cmd('pk', {}));
        $('#co-btn-reset')?.addEventListener('click', async () => {
            const ok = window.hpConfirm ? await window.hpConfirm('Làm mới buổi LIVE: xoá PK, vai, phòng mang tên, khách trên sân và top fan của buổi này? (Cấp fan trọn đời giữ nguyên.)') : confirm('Làm mới buổi LIVE?');
            if (ok) cmd('reset');
        });
    }

    // ---------------- vẽ ----------------
    function render() { renderSettings(); renderControl(); renderFans(); renderGifts(); }

    function num(k, label, min, max, step, title) {
        return `<label class="co-row"><span${title ? ` title="${esc(title)}"` : ''}>${label}</span><input type="number" min="${min}"${max != null ? ` max="${max}"` : ''} step="${step}" data-k="${k}" data-num="1" value="${esc(cfg[k])}"></label>`;
    }
    function chk(k, label) { return `<label><input type="checkbox" data-k="${k}"${cfg[k] !== false ? ' checked' : ''}> ${label}</label>`; }
    function renderSettings() {
        const host = $('#co-settings');
        if (!host) return;
        host.innerHTML = `
            <div class="nd-card-title">⚙ Cài đặt</div>
            <label class="co-row"><span>Chất lượng hình</span><select data-k="coQuality">
                <option value="high"${cfg.coQuality !== 'low' ? ' selected' : ''}>✨ Đẹp (máy mạnh)</option>
                <option value="low"${cfg.coQuality === 'low' ? ' selected' : ''}>⚡ Nhẹ (máy yếu: 30 FPS, ít người, tắt TV trực tiếp)</option>
            </select></label>
            ${num('coMaxViewers', 'Tối đa người xem có nhân vật', 5, 120, 5, 'Người tặng quà luôn được vào (vượt tạm tối đa +20)')}
            ${num('coNpcCount', 'Đám đông NPC khi vắng', 0, 60, 2)}
            ${num('coPkEveryMin', '⚔️ PK tự động mỗi (phút, 0 = tắt)', 0, 15, 1)}
            ${num('coPkSec', '⚔️ Mỗi trận PK (giây)', 60, 300, 10)}
            ${num('coPkFinalSec', '⚔️ Nước rút cuối trận (giây, tim bên thua ×2)', 0, 150, 5)}
            ${num('coStageBaseSec', '💃 Lên sân khấu: giây cho quà 1 xu', 5, 60, 1)}
            ${num('coStagePerCoinSec', '💃 + Giây cho mỗi xu thêm', 0, 30, 1)}
            ${num('coStageMaxSec', '💃 Tối đa giây trên sân', 12, 300, 10)}
            ${num('coRoomHoldSec', '🎟️ Phòng mang tên: giữ chắc (giây)', 10, 300, 10)}
            ${num('coRoleSec', '🎙️ Vai MC / Kỹ thuật / Quản lý (giây)', 30, 300, 10)}
            ${num('coCamMaxPer5Min', '🎥 Giây lên hình tối đa / người / 5 phút', 10, 300, 10)}
            ${num('coLikeMilestone', '❤️ Mỗi bao nhiêu tim = sóng tim', 50, 5000, 50)}
            ${num('coClubSwitchSec', '🔁 Đổi nhóm tối đa 1 lần mỗi (giây)', 0, 600, 10)}
            ${num('coViewerIdleMin', '🚪 Im lặng bao lâu thì rời tòa nhà (phút)', 5, 240, 5)}
            <label class="co-row"><span title="Ngoài danh sách có sẵn; cách nhau bằng dấu phẩy">🚫 Từ cấm thêm</span><input type="text" data-k="coBadWords" placeholder="từ 1, từ 2" value="${esc(cfg.coBadWords)}"></label>
            <label class="co-row"><span>🎵 Âm lượng nhạc</span><input type="range" min="0" max="1" step="0.05" data-k="coMusicVol" data-num="1" value="${esc(cfg.coMusicVol)}"></label>
            <div class="co-checks">
                ${chk('coTierFallback', '💎 Quà chưa gán chạy theo bậc xu (vé, vai, quà lớn, Gala)')}
                ${chk('coShowGiftLegend', '🎁 Hiện bảng "Tặng quà để…" trên overlay')}
                ${chk('coShowJoinHint', '💬 Hiện dòng hướng dẫn "Gõ 1–5 chọn nhóm"')}
                ${chk('coLiveTv', '📺 TV trực tiếp trong sân khấu nhóm (tắt cho nhẹ máy)')}
                ${chk('coSound', '🔊 Hiệu ứng âm thanh')}
                ${chk('coMusic', '🎵 Nhạc theo phòng đang quay')}
            </div>`;
        host.querySelectorAll('[data-k]').forEach(el => {
            el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'range' ? 'change' : 'input', () => {
                const k = el.dataset.k;
                cfg[k] = el.type === 'checkbox' ? el.checked : el.dataset.num ? Number(el.value) || 0 : el.value;
                schedulePersist();
                if (k === 'coGiftMap') renderGifts();
            });
        });
    }

    function ticketName() {
        const t = (cfg.coGiftMap.ticket || [])[0];
        return t ? t.giftName : 'Vé';
    }
    function pinText() {
        return `💬 Gõ 1–5 chọn nhóm · 🌹 Tặng quà bất kỳ = lên sân khấu · 🎟️ ${ticketName()} = phòng LIVE mang tên bạn`;
    }
    function renderControl() {
        const host = $('#co-control');
        if (!host) return;
        host.innerHTML = `
            <div class="nd-card-title">🧪 Thử nhanh (không cần LIVE)</div>
            <div class="co-cmds">
                <button class="ghost small" data-gift="1">🌹 Quà 1 xu<small>lên sân khấu</small></button>
                <button class="ghost small" data-gift="10">🎁 Quà 10 xu<small>hiệu ứng + gọi tên</small></button>
                <button class="ghost small" data-gift="30">🎟️ Quà 30 xu<small>phòng mang tên</small></button>
                <button class="ghost small" data-gift="99">🎙️ Quà 99 xu<small>nhận vai</small></button>
                <button class="ghost small" data-gift="299">⚔️ Quà 299 xu<small>quà lớn + PK</small></button>
                <button class="ghost small" data-gift="1000">🌌 Quà 1.000 xu<small>tâm điểm</small></button>
                <button class="ghost small" data-gift="30000">👑 Quà 30.000 xu<small>Gala</small></button>
                <button class="ghost small" data-test="club">💬 Bình luận "1"<small>vào nhóm ①</small></button>
                <button class="ghost small" data-test="comment">💬 Bình luận<small>bong bóng chữ</small></button>
                <button class="ghost small" data-test="like">❤️ Thả tim</button>
                <button class="ghost small" data-test="follow">➕ Follow</button>
            </div>
            <div class="nd-card-title" style="margin-top:8px">📌 Câu ghim bình luận</div>
            <div class="co-pin"><span id="co-pin-text">${esc(pinText())}</span><button class="ghost small" id="co-pin-copy">📋 Copy</button></div>
            <div class="co-hint">Ghim câu này trên TikTok để người mới vào biết cách chơi. Dòng hướng dẫn trên overlay cũng xoay vòng 3 câu này.</div>
            <div class="co-hint co-warn">⚠ Chỉ dùng <b>một</b> trong hai: nguồn Browser Source trong OBS <b>hoặc</b> cửa sổ game. Mở cả hai thì mỗi bên tự chạy PK, vai, phòng riêng và có thể lệch nhau.</div>`;
        host.querySelectorAll('[data-gift]').forEach(b => b.addEventListener('click', () => cmd('test', { kind: 'gift', coins: Number(b.dataset.gift) })));
        host.querySelectorAll('[data-test]').forEach(b => b.addEventListener('click', () => {
            const t = b.dataset.test;
            if (t === 'club') cmd('test', { kind: 'comment', text: '1' });
            else cmd('test', { kind: t });
        }));
        host.querySelector('#co-pin-copy')?.addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(pinText()); toast('Đã copy câu ghim'); } catch (e) { prompt('Câu ghim:', pinText()); }
        });
    }

    // ---------------- 🏆 top fan trọn đời ----------------
    async function renderFans() {
        const host = $('#co-fans');
        if (!host) return;
        let top = null;
        try { const r = await fetch('/api/creatoronline/fans/top?n=20'); if (r.ok) top = (await r.json()).top || []; } catch (e) {}
        const ranks = ['', '⭐', '💎', '👑', '🏆'];
        host.innerHTML = `
            <div class="co-giftbar"><div class="nd-card-title">🏆 Top fan trọn đời</div><button class="ghost small" id="co-fans-reset" title="Xoá toàn bộ cấp fan đã lưu">🗑 Làm mới</button></div>
            <div class="co-hint">Tổng xu người xem đã tặng trong Creator Online, giữ qua mọi buổi LIVE. Chỉ ghi khi overlay đang chạy. Cấp: Fan mới · ⭐ Fan cứng 100 · 💎 Fan VIP 500 · 👑 Đại gia 2.000 · 🏆 Thần tài 10.000 xu.</div>
            ${top === null ? '<div class="nd-empty">Chưa đọc được danh sách.</div>' : top.length ? `<ol class="co-fans">${top.map(f => `<li><span>${ranks[f.rank] || ''} ${esc(f.name || f.id)}</span><small>${f.club ? `nhóm ${esc(f.club)} · ` : ''}${Number(f.xu).toLocaleString('vi-VN')} xu</small></li>`).join('')}</ol>` : '<div class="nd-empty">Chưa có ai tặng quà.</div>'}`;
        host.querySelector('#co-fans-reset')?.addEventListener('click', async () => {
            const ok = window.hpConfirm ? await window.hpConfirm('Xoá toàn bộ cấp fan trọn đời của Creator Online?') : confirm('Xoá toàn bộ cấp fan?');
            if (!ok) return;
            try { const r = await fetch('/api/creatoronline/fans/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); toast(r.ok ? 'Đã xoá cấp fan' : 'Không xoá được', r.ok ? 'success' : 'error'); } catch (e) { toast('Không xoá được', 'error'); }
            renderFans();
        });
    }

    // ---------------- 🎁 quà → hành động ----------------
    function renderGifts() {
        const host = $('#co-gifts');
        if (!host) return;
        const row = a => {
            const list = cfg.coGiftMap[a.id] || [];
            const chips = list.map((g, i) => {
                const dup = others.get(String(g.giftId));
                return `<span class="co-chip${dup ? ' co-dup' : ''}"${dup ? ` title="Quà này cũng đang gán ở ${esc(dup.join(', '))}: tặng 1 lần sẽ chạy ở cả hai game"` : ''}>${g.giftImage ? `<img src="${esc(g.giftImage)}">` : '🎁'}${esc(g.giftName || ('#' + g.giftId))}${g.coins ? `<small class="co-coin">${esc(g.coins)}💎</small>` : ''}${dup ? '<small class="co-dupmark">⚠ trùng</small>' : ''}<button class="co-x" data-a="${esc(a.id)}" data-i="${i}" title="Bỏ">✕</button></span>`;
            }).join('');
            return `<div class="co-grow">
                <div class="co-actname"><span class="co-emo">${esc(a.emoji)}</span><div><b>${esc(a.label)}</b><small>${esc(a.desc || '')}</small></div></div>
                <div class="co-chips">${chips}<button class="ghost small co-add" data-a="${esc(a.id)}">＋ Chọn quà</button></div>
                <button class="ghost small co-try" data-a="${esc(a.id)}" title="Thử trên overlay với người xem ảo">🧪 Thử</button>
            </div>`;
        };
        const groups = [['place', '🎟️ Phòng'], ['role', '🎙️ Vai trong nhóm'], ['stage', '💃 Trên sân khấu'], ['event', '🎉 Sự kiện lớn']];
        host.innerHTML = `
            <div class="co-giftbar"><div class="nd-card-title">🎁 Gán quà → hành động</div><button class="ghost small" id="co-suggest" title="Gán lại toàn bộ theo bộ quà gợi ý">🎁 Dùng bộ quà gợi ý</button></div>
            <div class="co-hint"><b>Quà bất kỳ</b> (kể cả Hoa hồng) đều cho người tặng lên sân khấu nhóm của họ. Gán thêm quà để món đó chạy một hành động bên dưới. Quà chưa gán thì chạy theo bậc xu: 30–98 xu → phòng mang tên · 99–298 → vai · 299–999 → quà lớn + PK · 1.000–9.999 → tâm điểm · từ 10.000 → Gala.</div>
            ${groups.map(([g, title]) => `<div class="nd-card-title" style="margin-top:8px">${title}</div>${giftActions.filter(a => a.group === g).map(row).join('')}`).join('')}`;
        host.querySelectorAll('.co-try').forEach(b => b.addEventListener('click', () => cmd('test', { kind: 'action', action: b.dataset.a })));
        host.querySelector('#co-suggest')?.addEventListener('click', async () => {
            if (!Object.keys(suggested).length) { toast('Chưa có bộ quà gợi ý', 'error'); return; }
            const has = Object.keys(cfg.coGiftMap || {}).length > 0;
            const ok = !has || (window.hpConfirm ? await window.hpConfirm('Thay toàn bộ quà đang gán bằng bộ quà gợi ý?') : confirm('Thay toàn bộ quà đang gán bằng bộ quà gợi ý?'));
            if (!ok) return;
            cfg.coGiftMap = JSON.parse(JSON.stringify(suggested));
            renderGifts(); renderControl();
            persist().then(() => toast('Đã gán bộ quà gợi ý')).catch(() => toast('Lưu thất bại', 'error'));
        });
        host.querySelectorAll('.co-add').forEach(b => b.addEventListener('click', () => openPicker(b.dataset.a)));
        host.querySelectorAll('.co-x').forEach(b => b.addEventListener('click', () => {
            const arr = cfg.coGiftMap[b.dataset.a] || [];
            arr.splice(Number(b.dataset.i), 1);
            if (!arr.length) delete cfg.coGiftMap[b.dataset.a];
            renderGifts(); renderControl(); persist().catch(() => {});
        }));
    }

    // hộp chọn quà (dùng lại giao diện .nd-gp-* như Nhà Tù / Zombie)
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
                <div class="nd-gp-hint">Mỗi quà chỉ gán cho 1 hành động.</div></div>`;
            document.body.appendChild(pickerEl);
            pickerEl.addEventListener('click', e => { if (e.target === pickerEl) pickerEl.hidden = true; });
            pickerEl.querySelector('.nd-gp-close').addEventListener('click', () => { pickerEl.hidden = true; });
            pickerEl.querySelector('.nd-gp-search').addEventListener('input', e => renderPicker(e.target.value));
        }
        const a = giftActions.find(x => x.id === actionId);
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
        const used = new Set((cfg.coGiftMap[pickerAction] || []).map(g => String(g.giftId)));
        const items = !f ? sheet : sheet.filter(g => (g.name || '').toLowerCase().includes(f) || String(g.id || '').includes(f));
        list.innerHTML = items.slice(0, 200).map(g => `
            <div class="nd-gp-row${used.has(String(g.id)) ? ' active' : ''}" data-gid="${esc(g.id)}" data-gn="${esc(g.name || '')}" data-gi="${esc(g.image || '')}">
                ${g.image ? `<img class="nd-gp-img" src="${esc(g.image)}" />` : '<span class="nd-gp-icon">🎁</span>'}
                <span class="nd-gp-name">${esc(g.name || ('Quà #' + g.id))}</span>
                <span class="nd-gp-dia">${g.diamond || 0}💎</span>
                ${others.has(String(g.id)) ? `<span class="nd-gp-tick" title="Đang gán ở ${esc(others.get(String(g.id)).join(', '))}">⚠</span>` : ''}
                ${used.has(String(g.id)) ? '<span class="nd-gp-tick">✓</span>' : ''}
            </div>`).join('') || '<div class="nd-empty">Chưa có danh sách quà (kết nối LIVE để tải).</div>';
        list.querySelectorAll('.nd-gp-row').forEach(r => r.addEventListener('click', () => {
            const id = r.dataset.gid;
            Object.keys(cfg.coGiftMap).forEach(k => {   // 1 quà ↔ 1 hành động
                cfg.coGiftMap[k] = (cfg.coGiftMap[k] || []).filter(g => String(g.giftId) !== id);
                if (!cfg.coGiftMap[k].length) delete cfg.coGiftMap[k];
            });
            const sg = (Array.isArray(window.__giftSheet) ? window.__giftSheet : []).find(g => String(g.id) === id);
            (cfg.coGiftMap[pickerAction] = cfg.coGiftMap[pickerAction] || []).push({ giftId: id, giftName: r.dataset.gn, giftImage: r.dataset.gi, coins: sg ? sg.diamond || 0 : 0 });
            pickerEl.hidden = true;
            renderGifts(); renderControl(); persist().catch(() => toast('Lưu thất bại', 'error'));
        }));
    }

    window.HpCreatorOnlinePanel = { open };
})();
