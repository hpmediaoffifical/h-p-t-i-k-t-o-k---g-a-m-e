/* ============================================================
   🧟 Zombie Phá Nhà — Panel controller (app side)
   ============================================================
   - Cài đặt ván (tên/avatar streamer, máu cửa, giờ mỗi ván, map đầu, khóa nhảy/tiến tới…)
   - 🎮 Bàn điều khiển: OBS không nhận bàn phím → streamer bấm phím trong app,
     panel relay qua socket 'quaivat:key' tới overlay.
   - 🎁 Gán quà → hành động (qvGiftMap theo giftId); trống thì overlay khớp theo tên quà mặc định.
   - Lệnh: chơi lại / demo / thử hành động qua POST /api/games/quaivat/cmd (gameCmd).
   Expose: window.HpQuaiVatPanel.open(socket)
   ============================================================ */
(function () {
    'use strict';

    const GAME_ID = 'quaivat';
    // Phải khớp action trong public/games/quaivat/game.js (VILLAINS / HEROES)
    const ACTIONS = [
        { id: 'rose',      emoji: '🌹', label: 'Khoai lăn / thùng gỗ',  def: 'Hoa hồng', side: 'viewer' },
        { id: 'xbarrel',   emoji: '🛢️', label: 'Thùng thuốc nổ',        def: 'Kẹo mút',  side: 'viewer' },
        { id: 'trap',      emoji: '🪤', label: 'Bẫy kẹp',               def: 'TikTok',   side: 'viewer' },
        { id: 'plant',     emoji: '🌱', label: 'Cây bắn đậu',           def: 'GG',       side: 'viewer' },
        { id: 'tire',      emoji: '🛞', label: 'Lốp xe lăn',            def: '',         side: 'viewer' },
        { id: 'slime',     emoji: '🍦', label: 'Vũng keo dính',         def: 'Kem',      side: 'viewer' },
        { id: 'repair',    emoji: '🔧', label: 'Sửa cửa +150',          def: 'Bắn tim',  side: 'viewer' },
        { id: 'fox',       emoji: '🦊', label: 'Cáo cắn quái',          def: 'Nước hoa', side: 'viewer' },
        { id: 'mine',      emoji: '💥', label: 'Chôn 3 mìn đất',        def: 'Bánh vòng', side: 'viewer' },
        { id: 'flower',    emoji: '🌸', label: 'Hoa gió thổi lùi',      def: 'Tiny Diny', side: 'viewer' },
        { id: 'lightning', emoji: '⚡', label: 'Sét đánh cháy đen',     def: 'Hạc giấy', side: 'viewer' },
        { id: 'balloon',   emoji: '🎈', label: 'Bóng bay kéo về',       def: 'Tay trái tim', side: 'viewer' },
        { id: 'boulder',   emoji: '🪨', label: 'Tảng đá khổng lồ',      def: 'Corgi, Galaxy…', side: 'viewer' },
        { id: 'bomb',      emoji: '💣', label: 'Bom hẹn giờ',           def: '(Chia sẻ)', side: 'viewer' },
        { id: 'shoes',     emoji: '👟', label: 'Giày tốc độ',           def: 'Heart Me', side: 'hero' },
        { id: 'shield',    emoji: '🚪', label: 'Khiên cửa (chặn 8 đòn)', def: 'Vòng cổ', side: 'hero' },
        { id: 'time',      emoji: '⏳', label: '+20 giây cho quái',     def: 'Rosa',     side: 'hero' },
    ];
    const SOCIAL = [
        { id: 'like', emoji: '❤️', label: 'Thả tim → ném sỏi' },
        { id: 'comment', emoji: '💬', label: 'Bình luận → ném dép' },
        { id: 'follow', emoji: '➕', label: 'Follow → hàng rào gỗ' },
        { id: 'share', emoji: '↗️', label: 'Chia sẻ → bom hẹn giờ' },
    ];
    const MAPS = ['Vườn Xanh (90m)', 'Mùa Thu (110m)', 'Xứ Tuyết (130m)'];
    const ZOMBIES = [['basic', '🧟 Zombie thường'], ['chubby', '🧟 Zombie béo'], ['arm', '🧟 Zombie cụt tay'], ['ribcage', '💀 Zombie lộ sườn'], ['classic', '🧩 Zombie tự dựng (bản cũ)']];
    const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyF', 'KeyJ', 'ShiftLeft', 'ShiftRight'];

    let socket = null, cfg = null, initialized = false, pendingSave = null, demoOn = false;
    const held = new Set();
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, k) => { if (typeof window.toast === 'function') window.toast(m, k || 'success', 2500); };

    function open(sharedSocket) {
        socket = sharedSocket || window.io();
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        $('#view-quaivat')?.classList.add('active');
        if (!initialized) { initialized = true; bindShell(); }
        load().then(render);
    }

    async function load() {
        try { const r = await fetch('/api/games/quaivat/config'); cfg = r.ok ? await r.json() : {}; } catch (e) { cfg = {}; }
        cfg = Object.assign({ enabled: true, qvStreamerName: '', qvStreamerAvatar: '', qvDoorHp: 1200, qvRoundSeconds: 180, qvStartMap: 1,
            qvLockJump: false, qvLockForward: false, qvAutoDodge: true, qvSound: true, qvZombieModel: 'basic', qvGiftMap: {} }, cfg || {});
        if (!cfg.qvGiftMap || typeof cfg.qvGiftMap !== 'object') cfg.qvGiftMap = {};
    }
    function schedulePersist() { clearTimeout(pendingSave); pendingSave = setTimeout(() => persist().catch(() => toast('Lưu thất bại', 'error')), 350); }
    async function persist() {
        clearTimeout(pendingSave);
        const r = await fetch('/api/games/quaivat/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
        if (!r.ok) throw new Error('save_fail');
    }
    async function cmd(name, payload) {
        try {
            const r = await fetch('/api/games/quaivat/cmd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd: name, payload: payload || {} }) });
            if (!r.ok) { const j = await r.json().catch(() => ({})); toast(j.message || 'Lệnh bị từ chối', 'error'); }
        } catch (e) { toast('Không gửi được lệnh', 'error'); }
    }

    // ---------------- thanh công cụ ----------------
    function bindShell() {
        $('#qv-btn-copy')?.addEventListener('click', async () => {
            const url = window.buildOverlayURL ? window.buildOverlayURL('/overlay/quaivat') : location.origin + '/overlay/quaivat';
            try { await navigator.clipboard.writeText(url); toast('Đã copy link OBS (1080×1920 hoặc 1080×1080)'); } catch (e) { prompt('Link OBS:', url); }
        });
        $('#qv-btn-open')?.addEventListener('click', () => window.open('/overlay/quaivat?panel=1', 'qv-preview', 'width=760,height=820'));
        $('#qv-btn-reload')?.addEventListener('click', () => { socket && socket.emit('overlay:reload', { gameId: GAME_ID }); toast('Đã gửi lệnh tải lại overlay'); });
        $('#qv-btn-reset')?.addEventListener('click', () => cmd('reset'));
        $('#qv-btn-demo')?.addEventListener('click', e => { demoOn = !demoOn; e.currentTarget.classList.toggle('qv-on', demoOn); cmd('demo', { on: demoOn }); });
        bindPad();
    }

    // ---------------- 🎮 bàn điều khiển (relay phím) ----------------
    function sendKey(code, down) {
        if (down ? held.has(code) : !held.has(code)) return;
        if (down) held.add(code); else held.delete(code);
        socket && socket.emit('quaivat:key', { code, down });
    }
    function releaseAll() { [...held].forEach(c => sendKey(c, false)); }
    function bindPad() {
        const pad = $('#qv-pad');
        if (!pad) return;
        pad.addEventListener('keydown', e => { if (!KEYS.includes(e.code)) return; e.preventDefault(); sendKey(e.code, true); });
        pad.addEventListener('keyup', e => { if (!KEYS.includes(e.code)) return; e.preventDefault(); sendKey(e.code, false); });
        pad.addEventListener('blur', releaseAll);
        window.addEventListener('blur', releaseAll);
        pad.querySelectorAll('[data-qv-key]').forEach(b => {
            const code = b.dataset.qvKey;
            b.addEventListener('pointerdown', e => { e.preventDefault(); pad.focus(); sendKey(code, true); });
            ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => sendKey(code, false)));
        });
    }

    // ---------------- vẽ ----------------
    function render() { renderSettings(); renderGifts(); }

    function renderSettings() {
        const host = $('#qv-settings');
        if (!host) return;
        host.innerHTML = `
            <div class="nd-card-title">⚙ Cài đặt ván</div>
            <label class="qv-row"><span>Nhân vật zombie</span><select data-k="qvZombieModel">${ZOMBIES.map(([v, n]) => `<option value="${v}"${cfg.qvZombieModel === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
            <label class="qv-row"><span>Tên streamer (zombie)</span><input type="text" data-k="qvStreamerName" placeholder="Streamer" value="${esc(cfg.qvStreamerName)}"></label>
            <label class="qv-row"><span>Link avatar</span><input type="text" data-k="qvStreamerAvatar" placeholder="https://… (không bắt buộc)" value="${esc(cfg.qvStreamerAvatar)}"></label>
            <label class="qv-row"><span>Máu cửa nhà</span><input type="number" min="100" step="100" data-k="qvDoorHp" data-num="1" value="${esc(cfg.qvDoorHp)}"></label>
            <label class="qv-row"><span>Giờ mỗi ván (giây)</span><input type="number" min="30" step="10" data-k="qvRoundSeconds" data-num="1" value="${esc(cfg.qvRoundSeconds)}"></label>
            <label class="qv-row"><span>Map bắt đầu</span><select data-k="qvStartMap" data-num="1">${MAPS.map((m, i) => `<option value="${i + 1}"${Number(cfg.qvStartMap) === i + 1 ? ' selected' : ''}>Map ${i + 1}: ${m}</option>`).join('')}</select></label>
            <div class="qv-checks">
                <label><input type="checkbox" data-k="qvLockJump"${cfg.qvLockJump ? ' checked' : ''}> 🔒 Khóa nhảy (Space)</label>
                <label><input type="checkbox" data-k="qvLockForward"${cfg.qvLockForward ? ' checked' : ''}> 🔒 Khóa tiến/lùi — zombie tự đi tới, streamer chỉ lái ngang (khó hơn)</label>
                <label><input type="checkbox" data-k="qvSound"${cfg.qvSound ? ' checked' : ''}> 🔊 Âm thanh trong overlay</label>
            </div>
            <div class="qv-hint">Luật: zombie (streamer) KHÔNG có máu — người xem tặng quà để chặn, đẩy lùi. Phá được cửa trước khi hết giờ → zombie vào nhà ăn não, <b>+1 WIN</b>, sang map dài hơn. Hết giờ → người xem thắng, <b>−1 WIN</b>.</div>`;
        host.querySelectorAll('[data-k]').forEach(el => {
            el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
                const k = el.dataset.k;
                cfg[k] = el.type === 'checkbox' ? el.checked : el.dataset.num ? Number(el.value) || 0 : el.value;
                schedulePersist();
            });
        });
    }

    function renderGifts() {
        const host = $('#qv-gifts');
        if (!host) return;
        const row = a => {
            const list = cfg.qvGiftMap[a.id] || [];
            const chips = list.map((g, i) => `<span class="qv-chip">${g.giftImage ? `<img src="${esc(g.giftImage)}">` : '🎁'}${esc(g.giftName || ('#' + g.giftId))}<button class="qv-x" data-a="${a.id}" data-i="${i}" title="Bỏ">✕</button></span>`).join('');
            return `<div class="qv-grow ${a.side === 'hero' ? 'qv-hero' : ''}">
                <div class="qv-act"><span class="qv-emo">${a.emoji}</span><div><b>${esc(a.label)}</b><small>${list.length ? 'Đã gán quà riêng' : (a.def ? 'Mặc định: ' + esc(a.def) : 'Chưa gán quà')}</small></div></div>
                <div class="qv-chips">${chips}<button class="ghost small qv-add" data-a="${a.id}">＋ Chọn quà</button></div>
                <button class="ghost small qv-test" data-t="${a.id}" title="Thả thử trên overlay">🧪 Thử</button>
            </div>`;
        };
        host.innerHTML = `
            <div class="nd-card-title">🎁 Quà người xem → bẫy & vật cản</div>
            ${ACTIONS.filter(a => a.side === 'viewer').map(row).join('')}
            <div class="nd-card-title" style="margin-top:8px">⚡ Quà hỗ trợ zombie (streamer)</div>
            ${ACTIONS.filter(a => a.side === 'hero').map(row).join('')}
            <div class="nd-card-title" style="margin-top:8px">💬 Tương tác (không cần quà)</div>
            ${SOCIAL.map(s => `<div class="qv-grow"><div class="qv-act"><span class="qv-emo">${s.emoji}</span><div><b>${esc(s.label)}</b></div></div><div class="qv-chips"></div><button class="ghost small qv-test" data-t="${s.id}">🧪 Thử</button></div>`).join('')}
            <div class="qv-hint">Quà chưa gán vẫn chạy: khớp theo tên quà mặc định, quà lạ thì quy theo số xu (≥200 đá tảng, ≥150 sét, ≥99 bóng bay/sét, ≥25 bom, ≥15 cáo, ≥10 hoa gió, ≥5 sửa cửa, còn lại đồ rẻ).</div>`;
        host.querySelectorAll('.qv-add').forEach(b => b.addEventListener('click', () => openPicker(b.dataset.a)));
        host.querySelectorAll('.qv-x').forEach(b => b.addEventListener('click', () => {
            const arr = cfg.qvGiftMap[b.dataset.a] || [];
            arr.splice(Number(b.dataset.i), 1);
            if (!arr.length) delete cfg.qvGiftMap[b.dataset.a];
            renderGifts(); persist().catch(() => {});
        }));
        host.querySelectorAll('.qv-test').forEach(b => b.addEventListener('click', () => cmd('test', { action: b.dataset.t })));
    }

    // ---------------- hộp chọn quà (dùng lại giao diện .nd-gp-*) ----------------
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
                <div class="nd-gp-hint">Một quà chỉ gán cho một hành động — chọn ở đây sẽ gỡ khỏi hành động cũ.</div></div>`;
            document.body.appendChild(pickerEl);
            pickerEl.addEventListener('click', e => { if (e.target === pickerEl) pickerEl.hidden = true; });
            pickerEl.querySelector('.nd-gp-close').addEventListener('click', () => { pickerEl.hidden = true; });
            pickerEl.querySelector('.nd-gp-search').addEventListener('input', e => renderPicker(e.target.value));
        }
        const a = ACTIONS.find(x => x.id === actionId);
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
        const used = new Set((cfg.qvGiftMap[pickerAction] || []).map(g => String(g.giftId)));
        const items = !f ? sheet : sheet.filter(g => (g.name || '').toLowerCase().includes(f) || String(g.id || '').includes(f));
        list.innerHTML = items.slice(0, 200).map(g => `
            <div class="nd-gp-row${used.has(String(g.id)) ? ' active' : ''}" data-gid="${esc(g.id)}" data-gn="${esc(g.name || '')}" data-gi="${esc(g.image || '')}">
                ${g.image ? `<img class="nd-gp-img" src="${esc(g.image)}" />` : '<span class="nd-gp-icon">🎁</span>'}
                <span class="nd-gp-name">${esc(g.name || ('Quà #' + g.id))}</span>
                <span class="nd-gp-dia">${g.diamond || 0}💎</span>
                ${used.has(String(g.id)) ? '<span class="nd-gp-tick">✓</span>' : ''}
            </div>`).join('') || '<div class="nd-empty">Không tìm thấy quà — kết nối LIVE để tải danh sách quà.</div>';
        list.querySelectorAll('.nd-gp-row').forEach(r => r.addEventListener('click', () => {
            const id = r.dataset.gid;
            Object.keys(cfg.qvGiftMap).forEach(k => {   // 1 quà ↔ 1 hành động
                cfg.qvGiftMap[k] = (cfg.qvGiftMap[k] || []).filter(g => String(g.giftId) !== id);
                if (!cfg.qvGiftMap[k].length) delete cfg.qvGiftMap[k];
            });
            (cfg.qvGiftMap[pickerAction] = cfg.qvGiftMap[pickerAction] || []).push({ giftId: id, giftName: r.dataset.gn, giftImage: r.dataset.gi });
            pickerEl.hidden = true;
            renderGifts(); persist().catch(() => toast('Lưu thất bại', 'error'));
        }));
    }

    window.HpQuaiVatPanel = { open };
})();
