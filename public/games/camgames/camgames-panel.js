/* 🎥 Game Camera — panel trong app (menu mẹ của các game camera).
 *
 * - Chọn game đang chơi trên OBS: "▶ Chơi riêng" (POST {active}) hoặc "＋ Chơi kèm" (POST {actives}) —
 *   tối đa 1 game tay + 1 game trên đầu (khe `slot`, lib/camgames.js). Server tự bật đúng các game đó,
 *   tắt game camera còn lại (camGamesApplyActive) → quà không kích hoạt game đang ẩn.
 * - Nguồn camera CHUNG trong OBS cho mọi game con ({source}). Ô chọn nguồn ở màn Touch & Play / Bắn Cung
 *   đọc/ghi cùng trường này → đổi ở đâu cũng đồng bộ.
 * - "⚙ Cài đặt" mở màn cài đặt riêng của game con. Cài đặt chỉ ở app, overlay OBS không có nút.
 */
(function () {
    'use strict';
    const $ = (s, r = document) => r.querySelector(s);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let cfg = { enabled: true, active: 'touchplay', actives: ['touchplay'], source: '' };
    let feed = null;          // kết quả /api/touchplay/obs-sources
    let overlaps = [];        // quà gán đích danh ở ≥2 game đang chơi (/api/camgames/overlap)
    const soloOn = {};        // game `standalone` (Bắn Cung) đang bật ở link OBS riêng: { id: true }
    let locked = new Set();   // 🔒 tính năng theo KEY: game con KEY chưa mở (/api/license/features) — server cũng lọc khi lưu
    let lstates = {};         // HP KEY gs: { id: 'off' (⏸ Tạm bảo trì) | 'hidden' (không hiện) | 'admin' (🧪) | 'locked' }
    function setLicense(d) {
        locked = new Set(d && Array.isArray(d.locked) ? d.locked : []);
        lstates = (d && d.states && typeof d.states === 'object') ? d.states : {};
        // thẻ 🎮 Quà kích hoạt game (camgames-trigger.js): game ⏸ / 🔒 / Ẩn gắn nhãn hoặc bỏ khỏi ô chọn
        const st = { ...lstates };
        for (const id of locked) st[id] = st[id] && st[id] !== 'on' ? st[id] : 'locked';
        window.HpCamLicenseStates = Object.fromEntries(Object.entries(st).filter(([, v]) => v && v !== 'on'));
        try { window.HpCamTrigger?.refreshLicense?.(); } catch (_) {}
    }
    // 🛒 Bán theo từng game (spec 2026-10-29-mua-game-sepay): giá KEY này mua được — app.js đặt window.HpShop, đổi → 'hp-shop'.
    const priceOf = (id) => { const i = window.HpShop && window.HpShop.items && window.HpShop.items.get(id); return i ? i.price : 0; };
    const vnd = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
    const POSE_GAMES = new Set(['bancung', 'level-quest']);   // overlay báo phase = id game; các game này đếm người, không đếm tay
    let socket = null, pollTimer = 0, built = false;

    function viewActive() { return !!$('#view-camgames')?.classList.contains('active'); }

    // ----- chơi nhiều game: cùng luật với lib/camgames.js (mỗi khe giữ game chọn sau cùng) -----
    const games = () => window.HpCamGames || [];
    const gameOf = id => games().find(g => g.id === id);
    const slotOf = id => gameOf(id)?.slot || id;
    const nameOf = id => gameOf(id)?.name || id;
    function norm(list) {
        let out = [];
        for (const id of list) {
            if (!gameOf(id)) continue;
            out = out.filter(x => x !== id && slotOf(x) !== slotOf(id));
            out.push(id);
        }
        return out.length ? out : [games()[0]?.id].filter(Boolean);
    }
    const actives = () => norm(Array.isArray(cfg.actives) && cfg.actives.length ? cfg.actives : [cfg.active]);
    const playing = () => (cfg.enabled !== false ? actives() : []);
    // Phím tắt toàn cục: chơi 2 game cùng có phím thì chỉ game bấm vào gần nhất giữ phím (lib/camgames.js hotkeyOwner).
    function hotkeyOwner() {
        const withKeys = playing().filter(id => gameOf(id)?.hotkeys);
        if (withKeys.length < 2) return null;
        return withKeys.includes(cfg.hotkeyGame) ? cfg.hotkeyGame : withKeys[0];
    }

    function build() {
        const root = $('#cg-root');
        if (!root || built) return;
        built = true;
        root.innerHTML = `
            <div class="cg-card">
                <h3>📺 TRÊN OBS</h3>
                <div class="cg-status" id="cg-status"><span class="cg-chip dim">Đang kiểm tra…</span></div>
                <div class="cg-guard" id="cg-guard" hidden></div>
                <div class="cg-row">
                    <label for="cg-source">Nguồn camera trong OBS (chung mọi game)</label>
                    <select id="cg-source"><option value="">— Chọn nguồn camera —</option></select>
                    <button class="ghost small" id="cg-refresh" title="Tải lại danh sách nguồn">🔄</button>
                </div>
                <details class="cg-howto">
                    <summary>ⓘ Cách dùng — 1 link OBS cho mọi game, chơi tối đa 4 game cùng lúc</summary>
                <div class="hint">Trong OBS chỉ cần <b>một Browser Source</b> 1080×1920 với link <b>📋 Link OBS</b> ở trên, đặt <b>phía trên</b> nguồn camera và phủ kín khung hình. Đổi game ở dưới thì OBS đổi theo, không phải sửa scene. Cần kết nối OBS WebSocket ở <b>⚙ Cài đặt › Kết nối OBS WebSocket</b>.</div>
                <div class="hint"><b>Chơi cùng lúc:</b> bấm <b>＋ Chơi kèm</b> để ghép <b>1 game dùng tay</b> (Touch &amp; Play / Chém Trái Cây / Đập Muỗi) với <b>1 game trên đầu</b> (Bắn Cung / Level Quest) , <b>Đá Cầu</b> và <b>Bộ Tách Người</b> — tối đa 1 game mỗi loại. Hai game dùng chung một lần nhận diện nên máy không nặng gấp đôi. Quà đã gán riêng cho game nào thì chỉ game đó nhận; quà chưa gán ở đâu mới vào game nhận mọi quà.</div>
                </details>
                <div class="cg-status" id="cg-overlap"></div>
            </div>
            <div id="cg-trigger"></div>
            <div class="cg-grid" id="cg-grid"></div>`;
        $('#cg-refresh').addEventListener('click', loadFeed);
        $('#cg-source').addEventListener('change', e => save({ source: e.target.value }));
        renderGrid();
    }

    // 🖼 Ảnh bìa hoạt hình 2.5D/3D (bộ của HP LIVE NPC) thay icon: public/games/camgames/thumb/<id game>.webp (270×480).
    // Nạp xong mới thay icon (.has-art); thiếu file thì giữ icon như cũ, nhớ URL lỗi để vẽ lại lưới không hỏi lại server.
    const artBad = new Set();
    const artUrl = id => { const u = '/games/camgames/thumb/' + encodeURIComponent(id) + '.webp'; return artBad.has(u) ? '' : u; };
    const artImg = id => (artUrl(id) ? `<img class="cg-art" src="${esc(artUrl(id))}" alt="" decoding="async">` : '');
    function bindArt(root) {
        root.querySelectorAll('img.cg-art').forEach(im => {
            const card = im.closest('.cg-game');
            const ok = () => card && card.classList.add('has-art');
            const bad = () => { artBad.add(im.getAttribute('src')); im.remove(); };
            if (im.complete) { if (im.naturalWidth) ok(); else bad(); return; }
            im.addEventListener('load', ok, { once: true });
            im.addEventListener('error', bad, { once: true });
        });
    }
    function renderGrid() {
        const grid = $('#cg-grid');
        if (!grid) return;
        const now = playing(), cur = actives(), keyOwner = hotkeyOwner();
        // 🧍 Bộ Tách Người không là thẻ: các game con của nó trải thành lưới ô riêng bên dưới (bodySection) để chọn nhanh như HP LIVE NPC.
        grid.innerHTML = games().filter(g => lstates[g.id] !== 'hidden').filter(g => g.id !== 'body').map(g => {   // HP KEY: game con Ẩn không hiện
            const on = now.includes(g.id);
            if (locked.has(g.id)) {
                const paused = lstates[g.id] === 'off';
                const price = paused ? 0 : priceOf(g.id);
                return `<div class="cg-game" data-id="${esc(g.id)}" style="opacity:${price ? '.8' : '.55'}">${artImg(g.id)}
                <div class="cg-game-head"><span class="cg-ico">${g.iconSvg || g.icon}</span><b>${esc(g.name)}</b>
                    ${paused ? '<span class="cg-badge" title="HP Media sẽ mở lại sớm">⏸ TẠM BẢO TRÌ</span>'
                        : price ? '<span class="cg-badge" title="Mua một lần, dùng trọn đời với KEY này">🔒 CHƯA MỞ</span>'
                        : '<span class="cg-badge" title="Liên hệ HP Media để mở thêm tính năng này cho KEY">🔒 KEY CHƯA MỞ</span>'}</div>
                <div class="cg-desc">${esc(g.desc)}</div>
                <div class="cg-actions">${price ? `<button class="shop-buy-btn" data-buy="${esc(g.id)}" title="Mua một lần, dùng trọn đời">🛒 Mua ${vnd(price)}</button>` : ''}<button class="ghost small" data-settings="${esc(g.id)}">⚙ Cài đặt</button></div>
            </div>`;
            }
            const solo = !on && g.standalone && soloOn[g.id];
            // Chơi kèm: danh sách mới có >1 game thì mới khác "chơi riêng"; nói rõ ghép với ai, thay ai.
            const withList = on ? null : norm([...cur, g.id]);
            const canWith = !!withList && cfg.enabled !== false && withList.length > 1;
            const partners = canWith ? withList.filter(x => x !== g.id).map(nameOf).join(' + ') : '';
            const replaced = canWith ? cur.filter(x => !withList.includes(x)).map(nameOf).join(', ') : '';
            const withTitle = canWith ? `Chơi cùng lúc với ${partners}${replaced ? ' (thay ' + replaced + ' — cùng khe ' + (g.slot === 'head' ? 'trên đầu' : 'dùng tay') + ')' : ''}` : '';
            return `<div class="cg-game ${on ? 'on' : ''}" data-id="${esc(g.id)}">${artImg(g.id)}
                <div class="cg-game-head"><span class="cg-ico">${g.iconSvg || g.icon}</span><b>${esc(g.name)}</b>
                    ${lstates[g.id] === 'admin' ? '<span class="cg-badge" title="Thử nghiệm — mới mở cho một số KEY dùng thử">🧪 THỬ NGHIỆM</span>' : ''}
                    ${on ? '<span class="cg-badge">● ĐANG CHƠI TRÊN OBS</span>' : ''}
                    ${keyOwner === g.id ? '<span class="cg-badge keys" title="Phím tắt toàn cục đang thuộc game này; game chơi cùng tạm nhả phím (quà vẫn chạy bình thường)">⌨ GIỮ PHÍM TẮT</span>' : ''}
                    ${solo ? '<span class="cg-badge solo" title="Game vẫn nhận quà qua link OBS riêng của nó">● ĐANG BẬT Ở LINK RIÊNG</span>' : ''}</div>
                <div class="cg-desc">${esc(g.desc)}</div>
                <div class="cg-track">Nhận diện: ${esc(g.track)}</div>
                ${g.note ? `<div class="cg-track">💡 ${esc(g.note)}</div>` : ''}
                <div class="cg-actions">
                    <button class="${on ? 'ghost' : 'btn-outline'} small" data-play="${esc(g.id)}" ${on ? 'disabled' : ''}>${on ? '✓ Đang chơi' : canWith ? '▶ Chơi riêng' : '▶ Chơi game này'}</button>
                    ${canWith ? `<button class="ghost small" data-with="${esc(g.id)}" title="${esc(withTitle)}">＋ Chơi kèm</button>` : ''}
                    ${on && now.length > 1 ? `<button class="ghost small" data-drop="${esc(g.id)}" title="Thôi chơi game này, giữ game còn lại">✕ Bỏ</button>` : ''}
                    ${keyOwner && on && g.hotkeys && keyOwner !== g.id ? `<button class="ghost small" data-keys="${esc(g.id)}" title="Chuyển phím tắt toàn cục sang game này (game kia tạm nhả phím)">⌨ Nhận phím tắt</button>` : ''}
                    <button class="ghost small" data-settings="${esc(g.id)}">⚙ Cài đặt</button>
                    ${solo ? `<button class="ghost small" data-solo-off="${esc(g.id)}" title="Tắt game ở link riêng — quà không còn kích hoạt nó">⏻ Tắt</button>` : ''}
                </div>
            </div>`;
        }).join('') + bodySection();
        bindArt(grid);
        bindBody();
        grid.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', () => save({ active: b.dataset.play, enabled: true })));
        grid.querySelectorAll('.cg-game [data-buy]').forEach(b => b.addEventListener('click', () => window.hpBuyGame?.(b.dataset.buy)));
        // Bấm vào game nào thì game đó giữ phím tắt (chơi kèm / ⚙ Cài đặt / ⌨ Nhận phím tắt).
        grid.querySelectorAll('[data-with]').forEach(b => b.addEventListener('click', () => save({ actives: norm([...actives(), b.dataset.with]), enabled: true, hotkeyGame: b.dataset.with })));
        grid.querySelectorAll('[data-keys]').forEach(b => b.addEventListener('click', () => save({ hotkeyGame: b.dataset.keys })));
        grid.querySelectorAll('[data-drop]').forEach(b => b.addEventListener('click', () => save({ actives: actives().filter(x => x !== b.dataset.drop) })));
        grid.querySelectorAll('[data-solo-off]').forEach(b => b.addEventListener('click', async () => {
            const id = b.dataset.soloOff;
            soloOn[id] = false; renderGrid();
            try { await fetch('/api/games/' + encodeURIComponent(id) + '/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: false }) }); } catch (_) {}
        }));
        grid.querySelectorAll('[data-settings]').forEach(b => b.addEventListener('click', () => {
            const id = b.dataset.settings;
            if (playing().includes(id) && gameOf(id)?.hotkeys && cfg.hotkeyGame !== id) save({ hotkeyGame: id });
            window.hpOpenGame?.(id);
        }));
    }

    // ---------- 🧍 GAME TÁCH NGƯỜI: lưới ô mọi game con (Rơi Hố, Bị Đuổi, Video Hành Động, Khóc Lóc, Bắn Tim, Bắt NPC, Biến Hình…) ----------
    // Lõi ô / menu / thêm game nằm trong public/games/body/body-panel.js (window.HpBodyPanel.hub). Bấm ô = ▶ chạy thử,
    // chuột phải = ⚙ Cài đặt / 🎁 Gắn quà / Nhân bản / Xoá. Nút Bật = chơi KÈM game đang chơi (khe 'body' riêng, không đá game khác).
    function bodySection() {
        const B = window.HpBodyPanel?.hub, g = gameOf('body');
        if (!B || !g || lstates.body === 'hidden') return '';
        // Chưa có hiệu ứng tách người nào: có hiệu ứng đang bán → vẫn hiện lưới (ô 🔒 + giá, bấm = mua từng hiệu ứng); không thì chỉ nhãn.
        const from = (window.HpShop && window.HpShop.from && window.HpShop.from.body) || 0;
        if (locked.has('body') && !(from > 0)) return `<div class="cg-sec"><div class="cg-sec-head"><b>🧍 Game tách người</b><span class="cg-badge">${lstates.body === 'off' ? '⏸ TẠM BẢO TRÌ' : '🔒 KEY CHƯA MỞ'}</span></div></div>`;
        if (locked.has('body')) return `<div class="cg-sec">
                <div class="cg-sec-head"><b>🧍 Game tách người</b><em>${B.count()}</em><span class="cg-badge" title="Mỗi hiệu ứng mua riêng, dùng trọn đời với KEY này">🔒 MUA TỪNG HIỆU ỨNG · TỪ ${vnd(from)}</span></div>
                <div class="cg-sec-hint">Bấm ô 🔒 để mua hiệu ứng đó — mở ngay khi chuyển khoản xong</div>
                <div class="bt-vgrid cg-body-grid" id="cg-body-grid">${B.grid()}</div>
            </div>`;
        const on = playing().includes('body');
        return `<div class="cg-sec">
                <div class="cg-sec-head"><b>🧍 Game tách người</b><em>${B.count()}</em>
                    <button class="cg-power${on ? ' on' : ''}" id="cg-body-power" title="Bật = các game tách người chạy theo quà trên OBS (chơi kèm game đang chơi). Tắt = quà không chạy các game này.">${on ? '● Đang bật' : '⏻ Bật'}</button>
                    <button class="ghost small" id="cg-body-cfg" title="Cỡ người - tách nền - cài đặt chung">⚙ Cài đặt</button>
                    <span class="cg-sec-sp"></span>
                    <select id="cg-body-new" title="Loại game mới">${B.types().map(([v, n]) => `<option value="${esc(v)}">${esc(n)}</option>`).join('')}</select>
                    <button class="small primary" id="cg-body-add">＋ Thêm</button>
                </div>
                <div class="cg-sec-hint">Bấm ô = chạy thử trên OBS · chuột phải = Gắn quà / Cài đặt / Nhân bản / Xoá</div>
                <div class="bt-vgrid cg-body-grid${on ? '' : ' off'}" id="cg-body-grid">${B.grid()}</div>
            </div>`;
    }
    function bindBody() {
        const B = window.HpBodyPanel?.hub, bg = $('#cg-body-grid');
        if (!B || !bg) return;
        B.bind(bg);
        if (!$('#cg-body-add')) return;   // 🔒 chưa có hiệu ứng nào: lưới chỉ để mua
        $('#cg-body-add').addEventListener('click', () => B.add($('#cg-body-new').value));
        $('#cg-body-cfg').addEventListener('click', () => window.hpOpenGame?.('body'));
        $('#cg-body-power').addEventListener('click', () => {
            if (playing().includes('body')) {
                const rest = actives().filter(x => x !== 'body');
                return save(rest.length ? { actives: rest } : { enabled: false });
            }
            return cfg.enabled === false ? save({ active: 'body', enabled: true }) : save({ actives: norm([...actives(), 'body']), enabled: true });
        });
    }
    // Lõi Bộ Tách Người nạp sau panel này / game tách người đổi (thêm, xoá, gắn quà) → vẽ lại lưới.
    let bodyHooked = false;
    function hookBody() {
        const B = window.HpBodyPanel?.hub;
        if (!B || bodyHooked || !socket) return;
        bodyHooked = true;
        B.onChange(() => { if (viewActive()) renderGrid(); });
        B.ready(socket).then(renderGrid).catch(() => { bodyHooked = false; });   // nạp lỗi → lần mở màn sau thử lại
    }
    window.addEventListener('hp-body-panel-ready', () => { if (built) hookBody(); });
    window.addEventListener('hp-shop', () => { if (built && viewActive()) renderGrid(); });   // 🛒 giá / mục bán đổi → vẽ lại

    function renderStatus() {
        const el = $('#cg-status');
        if (!el) return;
        const st = feed?.status;
        const chips = [];
        if (cfg.enabled === false) chips.push('<span class="cg-chip warn">⏻ Game Camera đang TẮT — bấm nút nguồn ở thanh bên để bật</span>');
        if (!st) chips.push('<span class="cg-chip dim">Không đọc được trạng thái</span>');
        else if (!st.obsConnected) chips.push('<span class="cg-chip warn">● Chưa kết nối OBS WebSocket</span>');
        else {
            chips.push('<span class="cg-chip ok">● Đã nối OBS</span>');
            chips.push(st.source ? `<span class="cg-chip ${st.error === 'source-missing' ? 'warn' : 'ok'}">📷 ${esc(st.source)}${st.error === 'source-missing' ? ' — không thấy trong OBS' : ''}</span>` : '<span class="cg-chip warn">📷 Chưa chọn nguồn camera</span>');
            if (st.live) chips.push(`<span class="cg-chip ok">Đang gửi hình ${st.fps} hình/giây${st.camFound ? ' · scene "' + esc(st.scene) + '"' : ''}</span>`);
            // Mỗi game đang chơi một dòng (server giữ theo từng game: status.overlays). Bản cũ chỉ có `overlay`.
            const ovs = st.overlays || {};
            const rows = playing().map(id => {
                const ov = ovs[id] || (st.overlay && st.overlay.phase === id ? st.overlay : null);
                if (!ov) return '';
                // Bắn Cung / Level Quest nhận diện cơ thể (pose) chứ không đếm tay.
                const seen = POSE_GAMES.has(id) ? (ov.pose ? 'thấy người' : 'chưa thấy người') : `thấy ${ov.hands} tay`;
                return `<span class="cg-chip ${ov.fps >= 10 ? 'ok' : 'warn'}">${gameOf(id)?.icon || '🖐'} ${esc(nameOf(id))}: ${ov.fps} lần/giây · AI ${ov.aiMs}ms · ${seen}</span>`;
            }).filter(Boolean);
            if (!rows.length && st.overlay && !Object.keys(ovs).length) {
                const ov = st.overlay;
                rows.push(`<span class="cg-chip ${ov.fps >= 10 ? 'ok' : 'warn'}">🖐 Overlay OBS: ${ov.fps} lần/giây · AI ${ov.aiMs}ms · ${POSE_GAMES.has(ov.phase) ? (ov.pose ? 'thấy người' : 'chưa thấy người') : 'thấy ' + ov.hands + ' tay'}</span>`);
            }
            chips.push(...(rows.length ? rows : ['<span class="cg-chip dim">🖐 Chưa thấy overlay Game Camera chạy trong OBS</span>']));
        }
        el.innerHTML = chips.join('');
        renderOverlap();
    }

    function renderOverlap() {
        const el = $('#cg-overlap');
        if (!el) return;
        const now = playing();
        el.innerHTML = now.length < 2 ? '' :
            `<span class="cg-chip ok">🎮 Đang chơi cùng lúc: ${now.map(id => esc((gameOf(id)?.icon || '') + ' ' + nameOf(id))).join(' + ')}</span>` +
            overlaps.map(o => `<span class="cg-chip warn" title="Một quà kích cả hai game. Muốn tách thì bỏ quà này khỏi danh sách quà của một game.">⚠ Quà trùng: ${esc(o.giftName || ('#' + o.giftId))} (${o.games.map(nameOf).map(esc).join(' + ')})</span>`).join('');
    }
    async function loadOverlap() {
        try { overlaps = (await (await fetch('/api/camgames/overlap', { cache: 'no-store' })).json()).overlaps || []; } catch (_) { overlaps = []; }
        renderOverlap();
    }

    function renderSources() {
        const sel = $('#cg-source');
        if (!sel) return;
        const list = (feed?.sources || []).slice();
        if (cfg.source && !list.some(s => s.name === cfg.source)) list.unshift({ name: cfg.source, camera: true, missing: true });
        const key = JSON.stringify([list.map(s => s.name), cfg.source]);
        if (sel.dataset.key === key) return;      // vẽ lại khi đổi — kẻo đang mở dropdown bị đóng ngang
        sel.dataset.key = key;
        sel.innerHTML = '<option value="">— Chọn nguồn camera —</option>' + list.map(s =>
            `<option value="${esc(s.name)}"${s.name === cfg.source ? ' selected' : ''}>${s.camera ? '📷 ' : ''}${esc(s.name)}${s.missing ? ' (không thấy trong OBS)' : ''}</option>`).join('');
        // Chưa chọn mà OBS chỉ có đúng 1 camera → chọn sẵn cho đỡ một bước (như Touch & Play).
        if (!cfg.source && feed?.sources) {
            const cams = list.filter(s => s.camera);
            if (cams.length === 1) save({ source: cams[0].name });
        }
    }

    async function loadConfig() {
        try { const j = await (await fetch('/api/games/camgames/config', { cache: 'no-store' })).json(); if (j) cfg = { ...cfg, ...j }; } catch (_) {}
        try { setLicense(await (await fetch('/api/license/features', { cache: 'no-store' })).json()); } catch (_) {}
        await Promise.all((window.HpCamGames || []).filter(g => g.standalone).map(async g => {
            try { const c = await (await fetch('/api/games/' + encodeURIComponent(g.id) + '/config', { cache: 'no-store' })).json(); soloOn[g.id] = !!c && c.enabled !== false; } catch (_) {}
        }));
        renderGrid(); renderSources(); renderStatus();
        loadOverlap();
    }
    async function loadFeed() {
        try { feed = await (await fetch('/api/touchplay/obs-sources', { cache: 'no-store' })).json(); } catch (_) { feed = null; }
        renderSources(); renderStatus();
    }
    async function save(patch) {
        cfg = { ...cfg, ...patch };
        if (typeof patch.active === 'string' && !patch.actives) cfg.actives = [patch.active];   // chơi riêng
        if (Array.isArray(patch.actives)) cfg.active = norm(patch.actives)[0];
        renderGrid(); renderSources();
        try {
            const r = await fetch('/api/games/camgames/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
            const j = await r.json();
            if (j && j.config) cfg = { ...cfg, ...j.config };
        } catch (_) {}
        renderGrid(); renderStatus();
        if ('active' in patch || 'actives' in patch) loadOverlap();
    }

    // ----- 🛰 Scene ĐANG PHÁT có overlay Game Camera chưa? (/api/camgames/obs/program-check) -----
    // Khung xem thử trong app chạy game ngay trong cửa sổ app — nhìn thì "chạy", nhưng LIVE chỉ thấy cái Browser Source
    // trong OBS vẽ. Scene đang phát có camera mà thiếu link Game Camera (tắt 👁 / trang chưa chạy) → báo + nút sửa 1 bấm.
    // × ẩn 10 phút cho đúng Scene + lỗi đó.
    let guard = null, guardBusy = false;
    const snoozeKey = (scene, kind) => 'hp.cgguard.' + kind + '.' + scene;
    const snoozed = (scene, kind) => { try { return Number(localStorage.getItem(snoozeKey(scene, kind)) || 0) > Date.now(); } catch (_) { return false; } };
    const toast = (msg, kind, ms) => { try { window.toast?.(msg, kind, ms); } catch (_) {} };
    function renderGuard() {
        const el = $('#cg-guard');
        if (!el) return;
        const d = guard;
        let kind = '', msg = '', btn = '', tip = '';
        if (d && d.ok && d.camera && d.actives && d.actives.length) {
            const sc = '«' + esc(d.scene) + '»';
            if (d.overlay === 'missing') { kind = 'missing'; msg = `⚠ Scene đang phát ${sc} chưa có overlay <b>🎥 Game Camera</b> — LIVE không thấy game`; btn = `＋ Thêm nhanh vào ${sc}`; tip = 'Thêm Browser Source Game Camera đã có vào Scene này (chưa có thì tạo mới 1080×1920), đặt ngay trên camera, phủ kín khung'; }
            else if (d.overlay === 'hidden') { kind = 'hidden'; msg = `⚠ Overlay <b>🎥 Game Camera</b> ở Scene ${sc} đang <b>TẮT 👁</b> — LIVE không thấy game`; btn = '👁 Bật lại'; tip = 'Bật lại nguồn overlay Game Camera trong Scene này'; }
            else if (!d.hubOnline) { kind = 'offline'; msg = `⚠ Scene ${sc} có overlay <b>🎥 Game Camera</b> nhưng trang chưa chạy`; btn = '↻ Tải lại overlay'; tip = 'Buộc Browser Source Game Camera tải lại'; }
        }
        const dup = d && d.ok && d.dupInputs ? `<span class="cg-chip warn" title="Hai Browser Source khác nhau cùng mở Game Camera → game chạy 2 lần (2 tiếng, đếm quà 2 lần). Xoá bớt, chỉ giữ 1.">⚠ Scene «${esc(d.scene)}» có ${d.inputs.length} Browser Source Game Camera khác nhau: ${d.inputs.map(esc).join(', ')}</span>` : '';
        if (kind && snoozed(d.scene, kind)) kind = '';
        if (!kind && !dup) { el.hidden = true; el.innerHTML = ''; return; }
        el.hidden = false;
        el.className = 'cg-guard' + (kind === 'offline' || !kind ? ' soft' : '');
        el.innerHTML = (kind ? `<span class="cg-guard-msg">${msg}</span>
            <button type="button" class="btn-outline small" id="cg-guard-go" title="${esc(tip)}" ${guardBusy ? 'disabled' : ''}>${guardBusy ? '⏳ Đang sửa…' : btn}</button>
            <button type="button" class="ghost small" id="cg-guard-x" title="Ẩn 10 phút">×</button>` : '') + dup;
        $('#cg-guard-go')?.addEventListener('click', () => fixGuard(d, kind));
        $('#cg-guard-x')?.addEventListener('click', () => { try { localStorage.setItem(snoozeKey(d.scene, kind), String(Date.now() + 10 * 60 * 1000)); } catch (_) {} renderGuard(); });
    }
    async function fixGuard(d, kind) {
        if (guardBusy) return;
        guardBusy = true; renderGuard();
        try {
            if (kind === 'offline') { window.HpCamGamesPanel.reloadOverlay(); toast('Đã yêu cầu overlay Game Camera tải lại', 'info', 2500); }
            else {
                const j = await (await fetch('/api/camgames/obs/add-overlay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenes: [d.scene] }) })).json();
                if (!j.ok) throw new Error(j.error || 'Không thêm được');
                toast('✓ Overlay Game Camera: ' + (j.created ? 'tạo «' + j.inputName + '» · ' : '') + (j.added?.length ? 'thêm vào ' + j.added.join(', ') : j.shown?.length ? 'bật lại ở ' + j.shown.join(', ') : 'đã đủ'), 'success', 4000);
            }
        } catch (e) { toast('⚠ ' + (e.message || e), 'error', 5000); }
        guardBusy = false;
        await loadGuard();
    }
    async function loadGuard() {
        try { guard = await (await fetch('/api/camgames/obs/program-check', { cache: 'no-store' })).json(); } catch (_) { guard = null; }
        renderGuard();
    }

    function poll() {
        clearTimeout(pollTimer);
        if (!viewActive()) return;              // rời màn → thôi hỏi
        Promise.all([loadFeed(), loadGuard()]).finally(() => { pollTimer = setTimeout(poll, 3000); });
    }

    window.HpCamGamesPanel = {
        open(sock) {
            if (sock && sock !== socket) {
                socket = sock;
                socket.on('gameConfig', d => {
                    if (!d || !d.config) return;
                    if (d.gameId === 'camgames') { cfg = { ...cfg, ...d.config }; renderGrid(); renderSources(); renderStatus(); loadOverlap(); }
                    else if ((window.HpCamGames || []).some(g => g.standalone && g.id === d.gameId)) { soloOn[d.gameId] = d.config.enabled !== false; renderGrid(); }
                });
                socket.on('license:features', d => { setLicense(d); renderGrid(); });
            }
            build();
            hookBody();
            window.HpCamTrigger?.open(socket);   // 🎮 quà kích hoạt game (camgames-trigger.js)
            loadConfig();
            setTimeout(poll, 50);
        },
        copyLink(btn) {
            const path = '/overlay/camgames';
            const url = typeof window.buildOverlayURL === 'function' ? window.buildOverlayURL(path) : location.origin + path;
            const done = () => { const o = btn.textContent; btn.textContent = '✓ Đã copy'; setTimeout(() => btn.textContent = o, 1500); };
            const legacy = () => { const ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (_) {} ta.remove(); };
            if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done).catch(legacy); else legacy();
        },
        reloadOverlay() { try { socket?.emit('overlay:reload', { gameId: 'camgames' }); } catch (_) {} }
    };
})();
