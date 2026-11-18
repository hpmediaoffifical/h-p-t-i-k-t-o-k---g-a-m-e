// 🎬 Kiểu buổi LIVE (hàng chip ở Bảng điều khiển) + 🎚 Trộn âm (nút ở topbar).
// Bật/tắt game đi qua CHÍNH công tắc ở thanh bên ([data-game-toggle]) → giữ nguyên hộp hỏi khi tắt game mất dữ liệu.
// Âm lượng: PUT /api/mixer → server phát 'mixer:state' → lớp public/lib/hp-mixer.js trong từng overlay áp ngay.
(function (root) {
    const doc = root.document;
    const LP = root.HpLivePresets;
    const GI = root.HpGameIcons;
    const $ = (id) => doc.getElementById(id);
    const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    function gameIndex() {
        const list = root.hpGameIndex ? root.hpGameIndex() : [];
        // Game con 🎮 Game Tương Tác không có công tắc ở thanh bên → bật/tắt thẳng qua API config.
        // Game con 🎥 Game Camera do mục Game Camera điều khiển (khe tay/đầu) → không đụng riêng.
        const tt = new Set((root.HpTuongTacGames || []).filter(x => !x.soon).map(x => x.id));
        return list.map(g => {
            const sw = doc.querySelector('[data-game-toggle="' + (root.CSS && CSS.escape ? CSS.escape(g.id) : g.id) + '"]');
            const viaApi = !sw && tt.has(g.id);
            return { ...g, on: sw ? !sw.classList.contains('off') : g.on, togglable: !g.locked && (!!sw || viaApi), viaApi };
        });
    }

    // ================= 🎬 Kiểu buổi =================
    let presets = LP ? LP.normalize(undefined) : [];
    let busy = false;
    const row = $('live-presets');

    async function savePresets(next) {
        presets = LP.normalize(next);
        render();
        try {
            const r = await fetch('/api/live-presets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presets }) });
            const j = await r.json();
            if (j && Array.isArray(j.presets)) { presets = j.presets; render(); }
        } catch (_) {}
    }

    async function applyPreset(p) {
        if (busy) return;
        const { on, off } = LP.plan(p, gameIndex());
        if (!on.length && !off.length) return;
        busy = true;
        row && row.classList.add('is-busy');
        try {
            // tắt trước (đỡ chồng âm/hình), rồi bật; mỗi lần bấm chờ công tắc xử lý xong (có thể hỏi xác nhận)
            const idx = new Map(gameIndex().map(g => [g.id, g]));
            for (const id of [...off, ...on]) {
                if (idx.get(id)?.viaApi) {
                    await fetch('/api/games/' + encodeURIComponent(id) + '/config', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: on.includes(id) })
                    }).catch(() => {});
                    continue;
                }
                const sw = doc.querySelector('[data-game-toggle="' + (root.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
                if (!sw) continue;
                const was = !sw.classList.contains('off');
                sw.click();
                for (let i = 0; i < 100; i++) {          // tối đa ~30 giây cho hộp xác nhận
                    await sleep(i < 5 ? 60 : 300);
                    if (!sw.isConnected || sw.classList.contains('off') === was) break;
                    if (i > 5 && !doc.querySelector('#hp-confirm-overlay.show')) break;   // không có hộp hỏi đang mở → xong
                }
            }
        } finally {
            busy = false;
            row && row.classList.remove('is-busy');
            render();
        }
    }

    function render() {
        if (!row || !LP) return;
        row.textContent = '';
        row.appendChild(el('span', 'lp-label', 'Kiểu buổi'));
        const act = LP.activeId(presets, gameIndex());
        for (const p of presets) {
            const chip = el('button', 'lp-chip' + (p.id === act ? ' is-on' : ''), p.name);
            chip.type = 'button';
            chip.title = p.id === act ? 'Đang dùng bộ game này' : 'Bật: ' + (p.games.join(', ') || '(không game nào)') + ' — tắt các game khác';
            chip.addEventListener('click', () => applyPreset(p));
            const x = el('span', 'lp-x', '×');
            x.title = 'Xoá kiểu buổi này';
            x.addEventListener('click', (e) => { e.stopPropagation(); savePresets(presets.filter(q => q.id !== p.id)); });
            chip.appendChild(x);
            row.appendChild(chip);
        }
        const add = el('button', 'lp-add', '+ Lưu bộ đang bật');
        add.type = 'button';
        add.title = 'Lưu các game đang bật thành 1 kiểu buổi mới';
        add.addEventListener('click', () => {
            const inp = el('input', 'lp-input');
            inp.placeholder = 'Tên kiểu buổi, Enter để lưu';
            inp.maxLength = 32;
            add.replaceWith(inp);
            inp.focus();
            const done = (ok) => {
                const name = inp.value.trim();
                if (ok && name) {
                    const games = gameIndex().filter(g => g.togglable && g.on).map(g => g.id);
                    savePresets([...presets, { id: LP.slug(name) + '-' + Date.now().toString(36).slice(-3), name, games }]);
                } else render();
            };
            inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); });
            inp.addEventListener('blur', () => done(!!inp.value.trim()));
        });
        row.appendChild(add);
    }

    if (row && LP) {
        fetch('/api/live-presets').then(r => r.json()).then(j => { presets = LP.normalize(j.presets); render(); }).catch(render);
        // bật/tắt ở thanh bên → tô lại chip đang khớp
        const list = $('game-list');
        if (list && root.MutationObserver) {
            let t = null;
            new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => { if (!busy) render(); }, 150); })
                .observe(list, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
        }
        render();
    }

    // ================= 🎚 Trộn âm =================
    const btn = $('btn-mixer');
    let mix = { master: { vol: 100, mute: false }, games: {} };
    let pop = null;
    let putTimer = null, pending = {};

    function chan(id) { return id === '__master' ? mix.master : (mix.games[id] || { vol: 100, mute: false }); }
    function setChan(id, patch) {
        if (id === '__master') { mix.master = { ...mix.master, ...patch }; pending.master = { ...(pending.master || {}), ...patch }; }
        else {
            mix.games[id] = { ...chan(id), ...patch };
            pending.games = pending.games || {};
            pending.games[id] = { ...(pending.games[id] || {}), ...patch };
        }
        clearTimeout(putTimer);
        putTimer = setTimeout(() => {
            const body = pending; pending = {};
            fetch('/api/mixer', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
        }, 120);
    }

    function rowEl(id, name, iconHtml) {
        const c = chan(id);
        const r = el('div', 'mx-row' + (id === '__master' ? ' mx-master' : ''));
        const ico = el('span', 'mx-ico');
        if (iconHtml) ico.innerHTML = iconHtml;   // SVG hằng từ game-icons.js
        const nm = el('span', 'mx-name', name);
        const range = el('input', 'mx-range');
        range.type = 'range'; range.min = '0'; range.max = '100'; range.step = '1'; range.value = String(c.vol);
        range.setAttribute('aria-label', 'Âm lượng ' + name);
        const val = el('span', 'mx-val', c.vol + '%');
        const mute = el('button', 'mx-mute' + (c.mute ? ' is-muted' : ''), c.mute ? '🔇' : '🔊');
        mute.type = 'button';
        mute.title = c.mute ? 'Đang tắt tiếng — bấm để bật' : 'Tắt tiếng';
        range.addEventListener('input', () => { val.textContent = range.value + '%'; setChan(id, { vol: Number(range.value) }); });
        mute.addEventListener('click', () => {
            const m = !chan(id).mute;
            setChan(id, { mute: m });
            mute.classList.toggle('is-muted', m); mute.textContent = m ? '🔇' : '🔊';
            mute.title = m ? 'Đang tắt tiếng — bấm để bật' : 'Tắt tiếng';
        });
        r.append(ico, nm, range, val, mute);
        return r;
    }

    function renderMixer() {
        if (!pop) return;
        const body = pop.querySelector('.mx-body');
        body.textContent = '';
        body.appendChild(rowEl('__master', 'Tổng', '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>'));
        const games = (root.hpGameIndex ? root.hpGameIndex() : []).filter(g => g.on && !g.locked && g.overlayPath && !g.camChild);
        if (!games.length) body.appendChild(el('div', 'mx-empty', 'Chưa bật game nào có âm thanh'));
        for (const g of games) body.appendChild(rowEl(g.id, g.name, GI ? GI.svg(g.id, 16) : ''));
    }

    function closeMixer() { if (pop) { pop.remove(); pop = null; doc.removeEventListener('mousedown', outside, true); } }
    function outside(e) { if (pop && !pop.contains(e.target) && !btn.contains(e.target)) closeMixer(); }
    async function openMixer() {
        if (pop) return closeMixer();
        pop = el('div', 'mx-pop');
        pop.setAttribute('role', 'dialog');
        pop.setAttribute('aria-label', 'Trộn âm');
        const head = el('div', 'mx-head');
        head.append(el('b', '', '🎚 Trộn âm'), el('span', 'mx-sub', 'Âm lượng game trên OBS, áp ngay'));
        pop.append(head, el('div', 'mx-body'));
        doc.body.appendChild(pop);
        const r = btn.getBoundingClientRect();
        pop.style.top = Math.round(r.bottom + 8) + 'px';
        pop.style.right = Math.max(8, Math.round(root.innerWidth - r.right)) + 'px';
        doc.addEventListener('mousedown', outside, true);
        try { mix = await (await fetch('/api/mixer')).json(); } catch (_) {}
        renderMixer();
    }
    if (btn) btn.addEventListener('click', openMixer);
    doc.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMixer(); });
})(window);
