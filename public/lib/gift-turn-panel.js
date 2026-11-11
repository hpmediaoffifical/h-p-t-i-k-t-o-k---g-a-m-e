// 🌐 hpT(): ngôn ngữ giao diện (hp-i18n.js); chưa nạp thì giữ tiếng Việt.
var hpT = (typeof globalThis !== 'undefined' && globalThis.hpT) || function (s, v) { return String(s).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, function (m, k) { return v && v[k] != null ? String(v[k]) : m; }); };
/* Khung panel dùng chung cho game "quà = lượt chơi" (🕹️ Gắp Thú, 🎲 Xúc Xắc 3D — lib/gift-turns.js phía server).
 * HpGiftTurnPanel.create({ id, title, sure, renderCards(cfg, api) → html, bindCards(host, cfg, api), hint }) → { open(socket) }
 * Tự chèn <section id="view-<id>">: thanh nút (Thử, Xoá hàng chờ, Thêm vào OBS, Xem thử, Tải lại), thẻ QUÀ + LƯỢT GẦN ĐÂY,
 * khung xem thử /overlay/<id>?review=1. Lưu config POST /api/games/<id>/config (debounce 350 ms), server normalize.
 * Spec docs/superpowers/specs/2026-11-12-gapthu-xucxac-design.md §5 */
(function () {
    'use strict';
    const $ = (sel, root) => (root || document).querySelector(sel);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let cssDone = false;
    function injectCss() {
        if (cssDone) return; cssDone = true;
        const st = document.createElement('style');
        st.textContent = `
            .hp-gtp-body { display: flex; flex-direction: column; gap: 10px; padding: 12px; min-height: 0; flex: 1; overflow: auto; }
            .hp-gtp-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 14px; align-items: start; }
            .hp-gtp-grid.noprev { grid-template-columns: minmax(0, 1fr); } .hp-gtp-grid.noprev .hp-gtp-prev { display: none; }
            .hp-gtp-prev { position: sticky; top: 0; display: flex; flex-direction: column; gap: 8px; }
            .hp-gtp-prev iframe { width: 300px; height: 533px; border: 1px solid rgba(255,255,255,.15); border-radius: 10px; background: #12162a; }
            .hp-gtp-gift { display: flex; align-items: center; gap: 10px; padding: 6px 4px; border-top: 1px solid rgba(255,255,255,.08); }
            .hp-gtp-gift img { width: 34px; height: 34px; object-fit: contain; }
            .hp-gtp-gift b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .hp-gtp-gift input[type=number] { width: 58px; }
            .hp-gtp-gift label { display: flex; align-items: center; gap: 4px; font-size: 13px; white-space: nowrap; }
            .hp-gtp-hist { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
            .hp-gtp-hist div { display: flex; gap: 8px; padding: 4px 2px; border-top: 1px solid rgba(255,255,255,.06); }
            .hp-gtp-hist time { opacity: .55; flex: none; } .hp-gtp-hist b { flex: none; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .hp-gtp-hist span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .hp-gtp-hist .win { color: #7ee2a8; font-weight: 700; }
            .hp-gtp-line { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 6px 0; }
            .hp-gtp-line > label:first-child { min-width: 110px; opacity: .85; }
            .hp-gtp-seg { display: inline-flex; border: 1px solid rgba(255,255,255,.18); border-radius: 9px; overflow: hidden; }
            .hp-gtp-seg button { border: 0; border-radius: 0; background: transparent; padding: 6px 12px; color: inherit; cursor: pointer; font: inherit; }
            .hp-gtp-seg button + button { border-left: 1px solid rgba(255,255,255,.18); }
            .hp-gtp-seg button.on { background: #ffd54a; color: #1b1405; font-weight: 700; }
            .hp-gtp-table { width: 100%; border-collapse: collapse; }
            .hp-gtp-table td { padding: 3px 4px; } .hp-gtp-table input[type=text] { width: 100%; box-sizing: border-box; }
            .hp-gtp-table input[type=number] { width: 58px; } .hp-gtp-table .pct { opacity: .7; font-size: 12px; white-space: nowrap; }
            @media (max-width: 900px) { .hp-gtp-grid { grid-template-columns: 1fr; } }`;
        document.head.appendChild(st);
    }

    function create(opts) {
        const id = opts.id, P = 'hp-gtp-' + id;
        let cfg = null, socket = null, bound = false, persistTimer = null, live = { queue: 0, history: [] };
        let prevOn = false;

        function ensureView() {
            if ($('#view-' + id)) return $('#view-' + id);
            injectCss();
            const host = ($('#view-nhietdo') || $('.view')).parentNode;
            const sec = document.createElement('section');
            sec.id = 'view-' + id; sec.className = `view game-view ${id}-view`;
            sec.innerHTML = `
                <header class="game-header">
                    <div><h2>${esc(opts.title)}</h2></div>
                    <div class="overlay-bar">
                        <button id="${P}-test" class="primary small" title="${esc(hpT('Chạy thử 1 lượt lên OBS'))}">${hpT('▶ Thử 1 lượt')}</button>
                        <button id="${P}-clear" class="ghost small" title="${esc(hpT('Xoá các lượt đang chờ'))}">${hpT('Xoá hàng chờ')}</button>
                        <span class="nd-bar-spacer"></span>
                        <button id="${P}-copy" class="obs-link small" title="${esc(hpT('Thêm vào Scene đang chiếu - chưa nối OBS thì copy link'))}">${hpT('Thêm vào OBS')}</button>
                        <button id="${P}-prev" class="ghost small" title="${esc(hpT('Bật/tắt khung xem thử'))}">${hpT('Xem thử')}</button>
                        <button id="${P}-reload" class="ghost small" title="${esc(hpT('Tải lại overlay trong OBS'))}">${hpT('Tải lại overlay')}</button>
                    </div>
                </header>
                <div class="game-body hp-gtp-body">
                    <div class="ctc-status" id="${P}-status"></div>
                    <div class="hp-gtp-grid noprev" id="${P}-grid">
                        <div id="${P}-settings"></div>
                        <div class="hp-gtp-prev">
                            <div class="hint"><b>${hpT('Xem thử')}</b> - ${hpT('bấm ▶ Thử để xem 1 lượt')}</div>
                            <iframe id="${P}-frame" title="${esc(opts.title)}"></iframe>
                        </div>
                    </div>
                </div>`;
            host.appendChild(sec);
            return sec;
        }

        const api = {
            get cfg() { return cfg; },
            save: () => schedulePersist(),
            rerender: () => renderSettings(),
            esc
        };

        function open(sharedSocket) {
            socket = sharedSocket;
            const view = ensureView();
            document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v === view));
            if (!bound) { bindShell(); bound = true; }
            if (socket && !socket['__gtp_' + id]) {
                socket['__gtp_' + id] = true;
                socket.on('gameConfig', ({ gameId, config }) => {
                    if (gameId !== id || persistTimer) return;
                    if (cfg && JSON.stringify(config) === JSON.stringify(cfg)) return;
                    cfg = config; renderSettings();
                });
                socket.on(id + ':state', s => { live = s || live; renderStatus(); renderHistory(); });
            }
            if (socket) socket.emit('subscribe', 'preview');
            loadConfig();
            fetch(`/api/${id}/state`, { cache: 'no-store' }).then(r => r.json()).then(s => { live = s; renderStatus(); renderHistory(); }).catch(() => {});
            reloadPreview();
        }
        async function loadConfig() {
            try { cfg = await fetch(`/api/games/${id}/config`, { cache: 'no-store' }).then(r => r.json()); } catch (e) { cfg = cfg || {}; }
            renderSettings();
        }
        function schedulePersist() { clearTimeout(persistTimer); persistTimer = setTimeout(persistConfig, 350); }
        async function persistConfig() {
            persistTimer = null;
            try {
                const r = await fetch(`/api/games/${id}/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
                const j = await r.json().catch(() => null);
                if (j && j.config) cfg = j.config;
            } catch (e) { console.error(`[${id}] lưu config lỗi`, e); }
        }
        function flash(btn, text) { const old = btn.textContent; btn.textContent = text; setTimeout(() => { btn.textContent = old; }, 1200); }
        async function runTest(giftId, btn) {
            if (persistTimer) { clearTimeout(persistTimer); await persistConfig(); }
            try {
                const r = await fetch(`/api/${id}/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ giftId }) });
                const j = await r.json().catch(() => ({}));
                if (!r.ok || j.ok === false) window.toast?.(j.error || hpT('Không chạy thử được'), 'error');
                else if (btn) flash(btn, '✓');
            } catch (e) { window.toast?.(hpT('Không gọi được server'), 'error'); }
        }
        function reloadPreview() {
            const f = $(`#${P}-frame`); if (!f) return;
            $(`#${P}-grid`).classList.toggle('noprev', !prevOn);
            $(`#${P}-prev`).classList.toggle('primary', prevOn);
            f.src = prevOn ? `/overlay/${id}?review=1&bg=1&mute=1` : 'about:blank';
        }
        function bindShell() {
            $(`#${P}-test`).addEventListener('click', e => runTest('', e.currentTarget));
            $(`#${P}-clear`).addEventListener('click', e => {
                fetch(`/api/${id}/control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd: 'clear' }) }).catch(() => {});
                flash(e.currentTarget, '✓');
            });
            $(`#${P}-copy`).addEventListener('click', e => {
                const btn = e.currentTarget;
                const url = window.buildOverlayURL ? window.buildOverlayURL('/overlay/' + id) : (location.origin + '/overlay/' + id);
                if (window.hpObsQuick) { window.hpObsQuick(url, opts.obsName || opts.title).then(m => flash(btn, m)); return; }
                if (window.hpCopyText) window.hpCopyText(url); else navigator.clipboard.writeText(url).catch(() => {});
                flash(btn, hpT('Đã copy'));
            });
            $(`#${P}-reload`).addEventListener('click', e => { if (socket) socket.emit('overlay:reload', { gameId: id }); flash(e.currentTarget, '✓'); });
            $(`#${P}-prev`).addEventListener('click', () => { prevOn = !prevOn; const f = $(`#${P}-frame`); if (f) f.dataset.hpOff = prevOn ? '0' : '1'; reloadPreview(); });
            $(`#${P}-frame`).addEventListener('hp-preview-off', () => { prevOn = false; reloadPreview(); });
        }

        function renderStatus() {
            const el = $(`#${P}-status`); if (!el || !cfg) return;
            const chips = [];
            chips.push(cfg.enabled === false ? `<span class="ctc-chip warn">${hpT('Đang tắt - quà thật không chạy')}</span>` : `<span class="ctc-chip ok">${hpT('Đang nhận quà')}</span>`);
            chips.push(`<span class="ctc-chip ${live.queue ? 'warn' : 'dim'}">${hpT('⏳ Hàng chờ: {n} lượt', { n: live.queue || 0 })}</span>`);
            if (cfg.anyGift === false && !(cfg.gifts || []).length) chips.push(`<span class="ctc-chip warn">${hpT('Chưa chọn quà nào - bật "Mọi quà" hoặc thêm quà')}</span>`);
            el.innerHTML = chips.join(' ');
        }
        function renderHistory() {
            const el = $(`#${P}-hist`); if (!el) return;
            const rows = (live.history || []).slice(0, 10);
            const hhmm = ts => { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0'); };
            el.innerHTML = rows.map(h => `<div><time>${hhmm(h.ts)}</time><b>${esc(h.nickname || '?')}${h.test ? ' 🧪' : ''}</b><span class="${h.result && h.result.win ? 'win' : ''}">${esc(h.brief || '')}</span></div>`).join('')
                || `<div class="hint">${hpT('Chưa có lượt nào.')}</div>`;
        }

        function giftCard() {
            const gifts = cfg.gifts || [];
            return `<div class="ctc-card">
                <h3>${hpT('QUÀ')}</h3>
                <label class="ctc-toggle"><input type="checkbox" id="${P}-enabled" ${cfg.enabled !== false ? 'checked' : ''}> <b>${hpT('Bật nhận quà')}</b></label>
                <label class="ctc-toggle"><input type="checkbox" id="${P}-any" ${cfg.anyGift !== false ? 'checked' : ''}> ${hpT('Mọi quà = 1 lượt (quà chưa gán bên dưới)')}</label>
                <div id="${P}-gifts">${gifts.map((g, i) => `<div class="hp-gtp-gift">${g.giftImage ? `<img src="${esc(g.giftImage)}" alt="">` : '🎁'}<b title="${esc(g.giftName)}">${esc(g.giftName || ('#' + g.giftId))}</b>
                    <label>${hpT('lượt')} <input type="number" min="1" max="10" step="1" value="${Number(g.turns) || 1}" data-turns="${i}"></label>
                    ${opts.sure ? `<label title="${esc(hpT('Lượt của quà này luôn gắp trúng'))}"><input type="checkbox" data-sure="${i}" ${g.sure ? 'checked' : ''}> ${hpT('chắc trúng')}</label>` : ''}
                    <button class="ghost small" data-try="${i}" title="${esc(hpT('Chạy thử quà này'))}">▶</button>
                    <button class="ghost small" data-del="${i}" title="${esc(hpT('Bỏ quà này'))}">✕</button></div>`).join('')}</div>
                <button id="${P}-gift-add" class="small">${hpT('＋ Gán quà')}</button>
                <div class="hint">${esc(opts.hint || '')} ${hpT('Combo ×N = N lần số lượt (tối đa 10 lượt/lần tặng, hàng chờ 30). Mỗi lượt 3-5 giây, hàng chờ dài tự nhanh hơn.')}</div>
            </div>`;
        }
        function renderSettings() {
            const host = $(`#${P}-settings`); if (!host || !cfg) return;
            host.innerHTML = `${opts.renderCards(cfg, api)}${giftCard()}
                <div class="ctc-card"><h3>${hpT('LƯỢT GẦN ĐÂY')}</h3><div class="hp-gtp-hist" id="${P}-hist"></div></div>`;
            $(`#${P}-enabled`).addEventListener('change', e => { cfg.enabled = e.target.checked; schedulePersist(); renderStatus(); });
            $(`#${P}-any`).addEventListener('change', e => { cfg.anyGift = e.target.checked; schedulePersist(); renderStatus(); });
            host.querySelectorAll('[data-turns]').forEach(inp => inp.addEventListener('change', () => {
                cfg.gifts[Number(inp.dataset.turns)].turns = Math.min(10, Math.max(1, Math.round(Number(inp.value) || 1))); schedulePersist();
            }));
            host.querySelectorAll('[data-sure]').forEach(c => c.addEventListener('change', () => { cfg.gifts[Number(c.dataset.sure)].sure = c.checked; schedulePersist(); }));
            host.querySelectorAll('[data-try]').forEach(b => b.addEventListener('click', () => runTest(cfg.gifts[Number(b.dataset.try)].giftId, b)));
            host.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { cfg.gifts.splice(Number(b.dataset.del), 1); renderSettings(); schedulePersist(); }));
            $(`#${P}-gift-add`).addEventListener('click', openPicker);
            opts.bindCards(host, cfg, api);
            renderStatus(); renderHistory();
        }

        // Chọn quà - cùng khung .nd-gp-* của các panel khác (data-gid → nhãn "⚠ đang dùng ở" của Bảng Quà Tổng).
        let picker = null;
        async function openPicker() {
            if (!Array.isArray(window.__giftSheet) || !window.__giftSheet.length) {
                try { const r = await fetch('/api/gifts'); if (r.ok) window.__giftSheet = (await r.json()).slice().sort((a, b) => (a.diamond || 0) - (b.diamond || 0)); } catch (e) {}
            }
            if (!picker) {
                picker = document.createElement('div');
                picker.className = 'nd-gp-overlay'; picker.hidden = true;
                picker.innerHTML = `<div class="nd-gp-modal"><div class="nd-gp-head"><div class="nd-gp-title">${hpT('Gán quà')} - ${esc(opts.title)}</div><button class="nd-gp-close ghost small">✕</button></div>
                    <input class="nd-gp-search" type="text" placeholder="${esc(hpT('Tìm quà hoặc ID…'))}" /><div class="nd-gp-list"></div>
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
            const used = new Set((cfg.gifts || []).map(g => String(g.giftId)));
            const items = !f ? sheet : sheet.filter(g => (g.name || '').toLowerCase().includes(f) || String(g.id || '').includes(f));
            list.innerHTML = items.map(g => `
                <div class="nd-gp-row${used.has(String(g.id)) ? ' active' : ''}" data-gid="${esc(String(g.id))}" data-gn="${esc(g.name || '')}" data-gi="${esc(g.image || '')}" data-dia="${Number(g.diamond) || 0}">
                    ${g.image ? `<img class="nd-gp-img" loading="lazy" decoding="async" src="${esc(g.image)}" />` : '<span class="nd-gp-icon">🎁</span>'}
                    <span class="nd-gp-name">${esc(g.name || ('#' + g.id))}</span><span class="nd-gp-dia">${g.diamond || 0}<img class="hp-coin-ico" src="/coin.svg" alt=""></span>
                    ${used.has(String(g.id)) ? '<span class="nd-gp-tick">✓</span>' : ''}</div>`).join('') || `<div class="nd-empty">${hpT('Không tìm thấy quà')}</div>`;
            list.querySelectorAll('.nd-gp-row').forEach(r => r.addEventListener('click', () => {
                if (used.has(r.dataset.gid)) return;
                const dia = Number(r.dataset.dia) || 0;
                // gợi ý theo giá: ≥ 99 xu → 3 lượt (Gắp Thú: chắc trúng); streamer đổi được
                (cfg.gifts = cfg.gifts || []).push({ giftId: r.dataset.gid, giftName: r.dataset.gn, giftImage: r.dataset.gi, turns: dia >= 99 ? 3 : 1, sure: !!opts.sure && dia >= 99 });
                renderSettings(); schedulePersist();
                picker.hidden = true;
            }));
        }

        return { open };
    }

    window.HpGiftTurnPanel = { create };
})();
