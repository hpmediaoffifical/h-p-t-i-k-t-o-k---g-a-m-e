// 🌐 hpT(): ngôn ngữ giao diện (overlays/lib/hp-i18n.js); trang chưa nạp thì giữ tiếng Việt (chỉ thay {biến}).
var hpT = (typeof globalThis !== 'undefined' && globalThis.hpT) || function (s, v) { return String(s).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, function (m, k) { return v && v[k] != null ? String(v[k]) : m; }); };
var hpTA = function (s, v) { return hpT(s, v).replace(/"/g, '&quot;'); };
/* 🎧 Gọi Bài — panel trong app. Tự chèn <section id="view-goibai"> (khuôn dacau-panel.js).
 * Cột trái: điều khiển + đang phát + hàng chờ + lượt + 🧪 giả lập. Cột phải: cài đặt (lưu debounce 350 ms qua
 * /api/games/goibai/config; echo gameConfig chỉ áp khi không phải bản vừa lưu) + yt-dlp + link OBS.
 * Trạng thái sống: socket 'goibai:state' (lib/goi-bai/controller.js publicState). */
(function () {
    'use strict';
    const $ = (sel, root) => (root || document).querySelector(sel);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmtTime = s => { s = Math.max(0, Math.round(Number(s) || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    const COIN = '<img class="hp-coin-ico" src="/coin.svg" alt="">';
    const REASON = { notfound: 'không tìm thấy', toolong: 'bài quá dài', blocked: 'dính từ cấm', playing: 'trùng bài đang phát', error: 'tìm lỗi', noengine: 'chưa có yt-dlp' };
    let cfg = null, st = null, socket = null, bound = false, persistTimer = null;

    function ensureView() {
        if ($('#view-goibai')) return $('#view-goibai');
        const host = $('.view').parentNode;
        const sec = document.createElement('section');
        sec.id = 'view-goibai'; sec.className = 'view game-view gob-view';
        sec.innerHTML = `
            <header class="game-header">
                <div><h2>${hpT('🎧 Gọi Bài')}</h2><div class="game-sub">${hpT('Tặng quà → gõ tên bài → phát ra loa')}</div></div>
                <div class="overlay-bar">
                    <label class="gob-switch" title="${hpTA('Bật/tắt Gọi Bài (tắt = xoá hàng chờ)')}"><input type="checkbox" id="gob-enabled"> <span>${hpT('Bật')}</span></label>
                    <button id="gob-btn-pause" class="ghost small" title="${hpTA('Tạm dừng / phát tiếp')}">⏯</button>
                    <button id="gob-btn-skip" class="ghost small" title="${hpTA('Bỏ bài đang phát')}">${hpT('⏭ Bỏ bài')}</button>
                    <button id="gob-btn-clear" class="danger small" title="${hpTA('Xoá hết hàng chờ và lượt')}">${hpT('Xoá hết')}</button>
                    <span class="nd-bar-spacer"></span>
                    <button id="gob-btn-obs" class="obs-link small" title="${hpTA('Thêm vào Scene đang chiếu — chưa nối OBS thì copy link')}">${hpT('Thêm vào OBS')}</button>
                    <button id="gob-btn-pop" class="ghost small" title="${hpTA('Mở overlay mẫu (dữ liệu giả)')}">${hpT('Xem mẫu')}</button>
                </div>
            </header>
            <div class="game-body gob-body">
                <div class="gob-status" id="gob-status"></div>
                <div class="gob-grid">
                    <div class="gob-col">
                        <div class="gob-box" id="gob-now"></div>
                        <div class="gob-box"><div class="gob-h">${hpT('Hàng chờ')} <span id="gob-qn"></span></div><div id="gob-queue"></div></div>
                        <div class="gob-box" id="gob-passes-box"><div class="gob-h">${hpT('Lượt chờ gõ bài')}</div><div id="gob-passes"></div></div>
                        <div class="gob-box">
                            <div class="gob-h">${hpT('🧪 Thử')}</div>
                            <div class="gob-line"><input id="gob-t-nick" placeholder="${hpTA('Tên người xem')}" value="Người xem thử"><input id="gob-t-coins" type="number" min="1" value="1" title="${hpTA('Số xu')}" style="width:80px"></div>
                            <div class="gob-line"><input id="gob-t-song" placeholder="${hpTA('Tên bài (để trống = chỉ tạo lượt)')}" style="flex:1"></div>
                            <div class="gob-line"><button id="gob-t-call" class="primary small">${hpT('Gọi thử')}</button><button id="gob-t-music" class="ghost small" title="${hpTA('Giả lập quà 🎵 Ca khúc với tên bài ở trên')}">${hpT('Thử Ca khúc')}</button><span id="gob-t-msg" class="gob-muted"></span></div>
                        </div>
                    </div>
                    <div class="gob-col" id="gob-settings"></div>
                </div>
            </div>`;
        host.appendChild(sec);
        const css = document.createElement('style');
        css.textContent = `
            .gob-body { display: flex; flex-direction: column; gap: 10px; padding: 12px; min-height: 0; flex: 1; overflow: auto; }
            .gob-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 12px; align-items: start; }
            .gob-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
            .gob-box { border: 1px solid rgba(127,127,127,.28); border-radius: 12px; padding: 10px 12px; background: rgba(127,127,127,.06); }
            .gob-h { font-weight: 600; margin-bottom: 6px; display: flex; justify-content: space-between; gap: 8px; }
            .gob-muted { opacity: .65; font-size: 12px; }
            .gob-status { font-size: 13px; display: flex; flex-wrap: wrap; gap: 6px; }
            .gob-pill { padding: 3px 9px; border-radius: 99px; border: 1px solid rgba(127,127,127,.3); }
            .gob-pill.ok { border-color: #2fb36b; color: #2fb36b; } .gob-pill.bad { border-color: #e0644d; color: #e0644d; } .gob-pill.wait { border-color: #d39b16; color: #d39b16; }
            .gob-now { display: grid; grid-template-columns: 72px 1fr; gap: 10px; align-items: center; }
            .gob-now > img { width: 72px; height: 72px; border-radius: 10px; object-fit: cover; background: rgba(127,127,127,.2); }
            .gob-now b { display: block; font-size: 15px; } .gob-bar { height: 5px; border-radius: 4px; background: rgba(127,127,127,.25); margin-top: 6px; overflow: hidden; }
            .gob-bar i { display: block; height: 100%; background: #ff4f8b; }
            .gob-row { display: grid; grid-template-columns: 26px 1fr auto auto; gap: 8px; align-items: center; padding: 5px 0; border-top: 1px solid rgba(127,127,127,.15); }
            .gob-row:first-child { border-top: 0; } .gob-row .t { min-width: 0; } .gob-row .t b, .gob-row .t span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .gob-row .t span { opacity: .65; font-size: 12px; } .gob-row .acts { display: flex; gap: 4px; }
            .gob-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 6px 0; }
            .gob-line > label:first-child { min-width: 150px; opacity: .85; }
            .gob-line input[type=number] { width: 80px; }
            .gob-gift { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
            .gob-gift img { width: 30px; height: 30px; object-fit: contain; } .gob-gift b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .gob-switch { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
            .gob-warn { color: #d39b16; font-size: 12px; }
            @media (max-width: 900px) { .gob-grid { grid-template-columns: 1fr; } }`;
        document.head.appendChild(css);
        return sec;
    }

    // ── cấu hình ───────────────────────────────────────────────────────────
    async function loadConfig() {
        try { cfg = await fetch('/api/games/goibai/config', { cache: 'no-store' }).then(r => r.json()); } catch (e) { cfg = null; }
        cfg = cfg || {};
        if (!Array.isArray(cfg.gifts)) cfg.gifts = [];
        renderSettings();
    }
    function schedulePersist() { clearTimeout(persistTimer); persistTimer = setTimeout(persistConfig, 350); }
    async function persistConfig() {
        persistTimer = null;
        try { await fetch('/api/games/goibai/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) }); } catch (e) {}
    }
    const control = (cmd, extra) => fetch('/api/goibai/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ cmd }, extra || {})) }).catch(() => {});

    function numField(key, label, min, max, step, hint) {
        return `<div class="gob-line"><label>${label}</label><input type="number" data-k="${key}" min="${min}" max="${max}" step="${step || 1}" value="${esc(cfg[key])}">${hint ? `<span class="gob-muted">${hint}</span>` : ''}</div>`;
    }
    function renderSettings() {
        const box = $('#gob-settings');
        if (!box || !cfg) return;
        $('#gob-enabled').checked = cfg.enabled === true;
        const gifts = cfg.gifts.map((g, i) => `<div class="gob-gift" data-gid="${esc(g.giftId)}">${g.giftImage ? `<img src="${esc(g.giftImage)}" alt="">` : '🎁'}<b>${esc(g.giftName || ('#' + g.giftId))}</b><button class="ghost small" data-del="${i}" title="${hpTA('Bỏ quà này')}">✕</button></div>`).join('')
            || `<div class="gob-warn">${hpT('Chưa chọn quà — chỉ quà Ca khúc gọi được bài.')}</div>`;
        box.innerHTML = `
            <div class="gob-box"><div class="gob-h">${hpT('Quà gọi bài')}</div>${gifts}
                <div class="gob-line"><button class="ghost small" id="gob-add-gift">${hpT('＋ Thêm quà')}</button></div>
                <div class="gob-line"><label><input type="checkbox" data-c="songGifts" ${cfg.songGifts !== false ? 'checked' : ''}> ${hpT('🎵 Quà Ca khúc tự vào hàng')}</label></div>
            </div>
            <div class="gob-box"><div class="gob-h">${hpT('Luật')}</div>
                ${numField('countdownSec', hpT('Đếm ngược (giây)'), 5, 120)}
                ${numField('keepMin', hpT('Giữ lượt (phút)'), 0, 120, 1, hpT('đủ lâu cho người xem kịp gõ'))}
                ${numField('maxPerViewer', hpT('Tối đa / người'), 1, 10)}
                ${numField('maxSongSec', hpT('Bài dài nhất (giây)'), 60, 3600, 30)}
                ${numField('lockFirst', hpT('Khoá bài đầu'), 0, 10)}
                ${numField('waitBonus', hpT('Điểm / phút chờ'), 0, 10000, 5)}
            </div>
            <div class="gob-box"><div class="gob-h">${hpT('Hiển thị')}</div>
                ${numField('listRows', hpT('Số dòng trên OBS'), 1, 15)}
                <div class="gob-line"><label><input type="checkbox" data-c="idleHint" ${cfg.idleHint !== false ? 'checked' : ''}> ${hpT('Hiện gợi ý khi hàng trống')}</label></div>
                <div class="gob-line"><label>${hpT('Âm lượng')}</label><input type="range" data-k="volume" min="0" max="100" value="${esc(cfg.volume ?? 70)}" style="flex:1"><span id="gob-vol">${esc(cfg.volume ?? 70)}%</span></div>
                <div class="gob-line"><label>${hpT('Phím tắt Bỏ bài')}</label><input data-t="hotkeySkip" placeholder="${hpTA('vd Control+Shift+N')}" value="${esc(cfg.hotkeySkip || '')}"></div>
                <div class="gob-line"><label>${hpT('Phím tắt Tạm dừng')}</label><input data-t="hotkeyPause" placeholder="${hpTA('vd Control+Shift+M')}" value="${esc(cfg.hotkeyPause || '')}"></div>
                <div class="gob-muted">${hpT('Phát ra loa Windows · OBS bắt qua Desktop Audio')}</div>
            </div>
            <div class="gob-box"><div class="gob-h">${hpT('Bộ tìm bài')}</div><div id="gob-ytdlp"></div></div>`;
        box.querySelectorAll('input[data-k]').forEach(el => el.addEventListener(el.type === 'range' ? 'input' : 'change', () => {
            cfg[el.dataset.k] = Number(el.value);
            if (el.dataset.k === 'volume') $('#gob-vol').textContent = el.value + '%';
            schedulePersist();
        }));
        box.querySelectorAll('input[data-c]').forEach(el => el.addEventListener('change', () => { cfg[el.dataset.c] = el.checked; schedulePersist(); }));
        box.querySelectorAll('input[data-t]').forEach(el => el.addEventListener('change', () => { cfg[el.dataset.t] = el.value.trim(); schedulePersist(); }));
        box.querySelectorAll('[data-del]').forEach(el => el.addEventListener('click', () => { cfg.gifts.splice(Number(el.dataset.del), 1); renderSettings(); schedulePersist(); }));
        $('#gob-add-gift').addEventListener('click', openGiftPicker);
        renderYtdlp();
    }

    // ── trạng thái sống ────────────────────────────────────────────────────
    function renderYtdlp() {
        const el = $('#gob-ytdlp');
        if (!el || !st) return;
        const y = st.ytdlp || {};
        const label = y.state === 'downloading' ? hpT('Đang tải… {p}%', { p: y.progress || 0 })
            : y.installed ? hpT('yt-dlp {v}', { v: y.version || '?' }) : hpT('Chưa tải — bật game hoặc bấm Tải về');
        el.innerHTML = `<div class="gob-line"><span>${esc(label)}</span>
            <button class="ghost small" id="gob-yt-btn" ${y.state === 'downloading' ? 'disabled' : ''}>${y.installed ? hpT('Cập nhật') : hpT('Tải về')}</button></div>
            ${y.error ? `<div class="gob-warn">⚠ ${esc(y.error)}</div>` : ''}
            <div class="gob-muted">${hpT('Tải yt-dlp từ GitHub, có kiểm SHA-256. Tìm bài lỗi → Cập nhật.')}</div>`;
        $('#gob-yt-btn').addEventListener('click', () => fetch('/api/goibai/ytdlp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: y.installed ? 'update' : 'install' }) }));
    }
    function renderStatus() {
        const el = $('#gob-status');
        if (!el || !st) return;
        const y = st.ytdlp || {};
        const pills = [
            st.enabled ? `<span class="gob-pill ok">${hpT('Đang bật')}</span>` : `<span class="gob-pill">${hpT('Đang tắt')}</span>`,
            st.playerOnline ? `<span class="gob-pill ok">${hpT('Loa sẵn sàng')}</span>` : (st.enabled ? `<span class="gob-pill bad">${hpT('Chưa có trình phát')}</span> <a href="/player/goibai" target="_blank" rel="noopener">${hpT('Mở trình phát')}</a>` : ''),
            // Game tắt + chưa có yt-dlp: KHÔNG tô đỏ — bật game là app tự tải (người dùng từng tưởng là lỗi)
            y.installed ? `<span class="gob-pill ok">${hpT('Bộ tìm bài sẵn sàng')}</span>`
                : y.state === 'downloading' ? `<span class="gob-pill wait">${hpT('Đang tải bộ tìm bài {p}%', { p: y.progress || 0 })}</span>`
                : y.state === 'error' ? `<span class="gob-pill bad">${hpT('Tải bộ tìm bài lỗi')}</span>`
                : st.enabled ? `<span class="gob-pill bad">${hpT('Chưa có bộ tìm bài')}</span>`
                : `<span class="gob-pill">${hpT('Bộ tìm bài: tự tải khi bật')}</span>`,
            st.paused ? `<span class="gob-pill wait">${hpT('⏸ Tạm dừng')}</span>` : ''
        ].filter(Boolean);
        el.innerHTML = pills.join(' ') + (st.lastError ? ` <span class="gob-warn">⚠ ${esc(st.lastError)}</span>` : '');
    }
    function renderLive() {
        if (!st) return;
        renderStatus(); renderYtdlp();
        const p = st.playing;
        $('#gob-now').innerHTML = p
            ? `<div class="gob-now"><img src="${esc(p.thumb || '')}" alt=""><div><b>${esc(p.title)}</b><span class="gob-muted">${esc(p.nickname)} · ${esc(p.coins)} ${COIN} · ${fmtTime(p.pos)} / ${fmtTime(p.dur || p.duration)}</span><div class="gob-bar"><i style="width:${(p.dur || p.duration) ? Math.min(100, (p.pos || 0) * 100 / (p.dur || p.duration)) : 0}%"></i></div></div></div>`
            : `<span class="gob-muted">${hpT('Chưa phát bài nào.')}</span>`;
        $('#gob-qn').textContent = st.queueTotal ? hpT('{n} bài', { n: st.queueTotal }) : '';
        $('#gob-queue').innerHTML = (st.queue || []).map((r, i) => `<div class="gob-row"><span>${r.locked ? '🔒' : i + 1}</span>
            <div class="t"><b>${esc(r.status === 'searching' ? hpT('đang tìm “{q}”…', { q: r.query }) : r.title)}</b><span>${esc(r.nickname)}${r.backers && r.backers.length ? ' +' + r.backers.length : ''}${r.source === 'music' ? ' · 🎵' : ''} · ${hpT('{n} điểm', { n: r.score })}</span></div>
            <span>${esc(r.coins)} ${COIN}</span>
            <span class="acts"><button class="ghost small" data-top="${esc(r.id)}" title="${hpTA('Đưa lên đầu hàng')}">⏫</button><button class="ghost small" data-rm="${esc(r.id)}" title="${hpTA('Xoá khỏi hàng chờ')}">✕</button></span></div>`).join('')
            || `<span class="gob-muted">${hpT('Hàng chờ trống')}</span>`;
        $('#gob-queue').querySelectorAll('[data-top]').forEach(b => b.addEventListener('click', () => control('pinTop', { id: b.dataset.top })));
        $('#gob-queue').querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => control('remove', { id: b.dataset.rm })));
        const now = st.now || Date.now();   // giờ server lúc gửi trạng thái
        const passes = st.passes || [];
        $('#gob-passes-box').hidden = !passes.length;
        $('#gob-passes').innerHTML = passes.map(g => `<div class="gob-row" style="grid-template-columns:1fr auto"><div class="t"><b>${esc(g.nickname)} · ${esc(g.coins)} ${COIN}</b>
            <span>${g.note ? '⚠ ' + esc(hpT(REASON[g.note] || g.note)) + ' · ' : ''}${hpT('còn {m} phút', { m: Math.max(0, Math.ceil((g.validUntil - now) / 60000)) })}</span></div></div>`).join('');
    }

    // ── chọn quà (khung .nd-gp-* chung) ─────────────────────────────────────
    let picker = null;
    async function openGiftPicker() {
        if (!Array.isArray(window.__giftSheet) || !window.__giftSheet.length) {
            try { const r = await fetch('/api/gifts'); if (r.ok) window.__giftSheet = (await r.json()).slice().sort((a, b) => (a.diamond || 0) - (b.diamond || 0)); } catch (e) {}
        }
        if (!picker) {
            picker = document.createElement('div');
            picker.className = 'nd-gp-overlay'; picker.hidden = true;
            picker.innerHTML = `<div class="nd-gp-modal"><div class="nd-gp-head"><div class="nd-gp-title">${hpT('Chọn quà gọi bài')}</div><button class="nd-gp-close ghost small">✕</button></div>
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
            <div class="nd-gp-row${used.has(String(g.id)) ? ' active' : ''}" data-gid="${esc(String(g.id))}" data-gn="${esc(g.name || '')}" data-gi="${esc(g.image || '')}">
                ${g.image ? `<img class="nd-gp-img" loading="lazy" decoding="async" src="${esc(g.image)}" />` : '<span class="nd-gp-icon">🎁</span>'}
                <span class="nd-gp-name">${esc(g.name || hpT('Quà #{id}', { id: g.id }))}</span><span class="nd-gp-dia">${g.diamond || 0}${COIN}</span>
                ${used.has(String(g.id)) ? '<span class="nd-gp-tick">✓</span>' : ''}</div>`).join('') || `<div class="nd-empty">${hpT('Không tìm thấy quà')}</div>`;
        list.querySelectorAll('.nd-gp-row').forEach(r => r.addEventListener('click', () => {
            if (used.has(r.dataset.gid)) return;
            cfg.gifts.push({ giftId: r.dataset.gid, giftName: r.dataset.gn, giftImage: r.dataset.gi });
            renderSettings(); schedulePersist();
            picker.hidden = true;
        }));
    }

    // ── khung ──────────────────────────────────────────────────────────────
    function bindShell() {
        $('#gob-enabled').addEventListener('change', e => { if (!cfg) return; cfg.enabled = e.target.checked; schedulePersist(); });
        $('#gob-btn-pause').addEventListener('click', () => control('togglePause'));
        $('#gob-btn-skip').addEventListener('click', () => control('skip'));
        $('#gob-btn-clear').addEventListener('click', async () => {
            const ok = window.hpConfirm ? await window.hpConfirm({ icon: '🎵', title: hpT('Xoá hết hàng chờ?'), body: hpT('Dừng bài đang phát, xoá hàng chờ và lượt chưa gõ. Không hoàn tác.'), okLabel: hpT('Xoá hết') }) : confirm(hpT('Xoá hết hàng chờ?'));
            if (ok) control('clear');
        });
        $('#gob-btn-obs').addEventListener('click', () => {
            const url = window.buildOverlayURL('/overlay/goibai');
            if (window.hpObsQuick) { window.hpObsQuick(url, 'Gọi Bài'); return; }
            navigator.clipboard?.writeText(url);
        });
        $('#gob-btn-pop').addEventListener('click', () => window.open(window.buildOverlayURL('/overlay/goibai') + '?demo=1', '_blank', 'width=540,height=960'));
        const test = async (music) => {
            const body = { nickname: $('#gob-t-nick').value, coins: Number($('#gob-t-coins').value) || 1, song: $('#gob-t-song').value, music: !!music };
            const msg = $('#gob-t-msg');
            try {
                const r = await fetch('/api/goibai/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(x => x.json());
                msg.textContent = r.ok ? (r.row ? hpT('Đang tìm bài…') : hpT('Đã tạo lượt — điền tên bài rồi thử lại')) : (r.error || hpT('Lỗi'));
            } catch (e) { msg.textContent = hpT('Lỗi kết nối server'); }
        };
        $('#gob-t-call').addEventListener('click', () => test(false));
        $('#gob-t-music').addEventListener('click', () => test(true));
    }

    function open(sharedSocket) {
        socket = sharedSocket;
        const view = ensureView();
        document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v === view));
        if (!bound) { bindShell(); bound = true; }
        if (socket && !socket.__gobAttached) {
            socket.__gobAttached = true;
            socket.on('goibai:state', s => { st = s; if ($('#view-goibai.active')) renderLive(); });
            socket.on('gameConfig', ({ gameId, config }) => {
                if (gameId !== 'goibai' || persistTimer) return;
                cfg = Object.assign({}, config); if (!Array.isArray(cfg.gifts)) cfg.gifts = [];
                renderSettings();
            });
        }
        loadConfig();
        fetch('/api/goibai/state', { cache: 'no-store' }).then(r => r.json()).then(s => { st = s; renderLive(); }).catch(() => {});
    }

    window.HpGoiBaiPanel = { open };
})();
