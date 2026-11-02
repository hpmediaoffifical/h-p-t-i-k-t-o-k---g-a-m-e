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
        { id: 'rose',      emoji: '🌹', label: 'Khoai lăn',          def: 'Hoa hồng',        side: 'viewer' },
        { id: 'xbarrel',   emoji: '🛢️', label: 'Thùng phình',        def: 'Que phát sáng',   side: 'viewer' },
        { id: 'trap',      emoji: '🪤', label: 'Bẫy kẹp',            def: 'TikTok',          side: 'viewer' },
        { id: 'plant',     emoji: '🌱', label: 'Cây bắn đậu',        def: 'GG',              side: 'viewer' },
        { id: 'slime',     emoji: '🍦', label: 'Keo dính',           def: 'Kem ốc quế',      side: 'viewer' },
        { id: 'barrel',    emoji: '🪵', label: 'Thùng gỗ',           def: 'Bánh sinh nhật',  side: 'viewer' },
        { id: 'banana',    emoji: '🍌', label: 'Vỏ chuối',           def: 'Đỉnh',            side: 'viewer' },
        { id: 'tire',      emoji: '🛞', label: 'Lốp xe lăn',         def: '',                side: 'viewer' },
        { id: 'repair',    emoji: '🔧', label: 'Sửa cửa',            def: 'Bắn tim',         side: 'viewer' },
        { id: 'net',       emoji: '🕸️', label: 'Ném lưới',           def: 'OK',              side: 'viewer' },
        { id: 'flower',    emoji: '🌸', label: 'Hoa gió',            def: 'Cỏ bốn lá',       side: 'viewer' },
        { id: 'mystery',   emoji: '🎁', label: 'Túi mù (ngẫu nhiên)', def: 'Chú heo may mắn', side: 'viewer' },
        { id: 'bees',      emoji: '🐝', label: 'Đàn ong',            def: 'Cà phê phin',     side: 'viewer' },
        { id: 'crows',     emoji: '🐦', label: 'Đàn quạ',            def: 'Hoan hô!',        side: 'viewer' },
        { id: 'fox',       emoji: '🦊', label: 'Cáo đuổi',           def: 'Nước hoa',        side: 'viewer' },
        { id: 'mine',      emoji: '🍩', label: 'Bẫy bật',            def: 'Bánh vòng',       side: 'viewer' },
        { id: 'lightning', emoji: '⚡', label: 'Sấm sét',            def: 'Hạc giấy',        side: 'viewer' },
        { id: 'meteor',    emoji: '☄️', label: 'Mưa thiên thạch',    def: 'Sao đêm',         side: 'viewer' },
        { id: 'boulder',   emoji: '🪨', label: 'Đá lăn',             def: 'Chó Corgi',       side: 'viewer' },
        { id: 'hand',      emoji: '🫳', label: 'Bàn tay khổng lồ',   def: 'San hô',          side: 'viewer' },
        { id: 'quake',     emoji: '🌋', label: 'Động đất',           def: 'Tàu hỏa',         side: 'viewer' },
        { id: 'bomb',      emoji: '💣', label: 'Pháo hẹn giờ',       def: '(Chia sẻ)',       side: 'viewer' },
        { id: 'lose',      emoji: '💀', label: 'THUA NGAY',          def: '',                side: 'viewer' },
        { id: 'shoes',     emoji: '👟', label: 'Tăng tốc',           def: 'Thả tim cho tôi', side: 'hero' },
        { id: 'shield',    emoji: '🚪', label: 'Khiên chắn',         def: 'Vòng cổ tình bạn', side: 'hero' },
        { id: 'time',      emoji: '⏳', label: '+20 giây',           def: 'Rosa',            side: 'hero' },
        { id: 'minions',   emoji: '🧟', label: 'Zombie con dọn đường', def: 'Gia đình',      side: 'hero' },
        { id: 'armor',     emoji: '🛡️', label: 'Giáp vàng (8 giây)', def: 'Vương miện nhỏ',  side: 'hero' },
        { id: 'balloon',   emoji: '🎈', label: 'Bóng bay cứu',       def: 'Hộp quà bóng bay', side: 'hero' },
        { id: 'fist',      emoji: '👊', label: 'Nắm đấm vàng (×2, 30 giây)', def: 'Găng tay đấm bốc', side: 'hero' },
        { id: 'dozer',     emoji: '🚜', label: 'Xe ủi tới cửa',      def: 'Mũ đua xe',       side: 'hero' },
        { id: 'win',       emoji: '🏆', label: 'WIN NGAY',           def: '',                side: 'hero' },
    ];
    const SOCIAL = [
        { id: 'like', emoji: '❤️', label: 'Thả tim → ném đá' },
        { id: 'comment', emoji: '💬', label: 'Bình luận → ném dép' },
        { id: 'follow', emoji: '➕', label: 'Follow → hàng rào' },
        { id: 'share', emoji: '↗️', label: 'Chia sẻ → pháo hẹn giờ' },
    ];
    const MAPS = ['Vườn Xanh (90m)', 'Mùa Thu (110m)', 'Xứ Tuyết (130m)', 'Nghĩa Trang Đêm (140m)', 'Sa Mạc (150m)', 'Núi Lửa (165m)', 'Lâu Đài Hoang (180m) 🏰 BOSS', 'Đầm Sen (125m) 🦆 lội nước'];
    const ZOMBIES = [['basic', '🧟 Zombie thường'], ['chubby', '🧟 Zombie béo'], ['arm', '🧟 Zombie cụt tay'], ['ribcage', '💀 Zombie lộ sườn'], ['classic', '🧩 Zombie tự dựng (bản cũ)']];
    const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyF', 'KeyJ', 'ShiftLeft', 'ShiftRight'];

    let socket = null, cfg = null, initialized = false, pendingSave = null, demoOn = false;
    const held = new Set();
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, k) => { if (typeof window.toast === 'function') window.toast(m, k || 'success', 2500); };

    function open(sharedSocket) {
        socket = sharedSocket || window.io();
        if (!socket.__qvCue) {                                       // game nhắc lời dẫn (chỉ hiện trong app)
            socket.__qvCue = true;
            socket.on('quaivat:cue', d => {
                const el = $('#qv-cue'); if (!el || !d || !d.text) return;
                el.textContent = '🎙️ ' + d.text; el.style.display = '';
                clearTimeout(el.__t); el.__t = setTimeout(() => { el.style.display = 'none'; }, 20000);
            });
        }
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        $('#view-quaivat')?.classList.add('active');
        if (!initialized) { initialized = true; bindShell(); }
        load().then(render);
    }

    async function load() {
        try { const r = await fetch('/api/games/quaivat/config'); cfg = r.ok ? await r.json() : {}; } catch (e) { cfg = {}; }
        cfg = Object.assign({ enabled: true, qvStreamerName: '', qvStreamerAvatar: '', qvDoorHp: 600, qvRoundSeconds: 180, qvStartMap: 1,
            qvLockJump: false, qvLockForward: false, qvSound: true, qvZombieModel: 'basic', qvTimerOn: false, qvCheckpoint: true, qvShowLegend: true, qvWinShape: '9:16', qvLikePer: 100, qvCommentKey: '111', qvGiftMap: {} }, cfg || {});
        if (!Array.isArray(window.__giftSheet)) fetch('/api/gifts').then(r => r.ok ? r.json() : []).then(l => { window.__giftSheet = (l || []).slice().sort((a, b) => (a.diamond || 0) - (b.diamond || 0)); if (cfg) renderGifts(); }).catch(() => {});   // giá quà cho cảnh báo WIN/THUA ngay
        if (Number(cfg.qvDoorHp) === 1200 && !cfg.qvHpV2) { cfg.qvDoorHp = 600; cfg.qvHpV2 = true; schedulePersist(); }   // cửa giờ tự hồi máu → hạ máu mặc định cũ một lần
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
        $('#qv-btn-open')?.addEventListener('click', async () => {      // Edge/Chrome --app (app tắt GPU nên game 3D không chạy trong cửa sổ Electron)
            try {
                const r = await fetch('/api/quaivat/window/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shape: cfg.qvWinShape || '9:16', quality: cfg.qvQuality || 'high' }) });
                const j = await r.json().catch(() => ({}));
                if (j.ok) toast('Đã mở cửa sổ game');
                else toast(j.error || 'Không mở được cửa sổ game', 'error');
            } catch (e) { toast('Không mở được cửa sổ game', 'error'); }
        });
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
            <div style="background:rgba(255,216,74,.12);border:1px solid rgba(255,216,74,.35);border-radius:8px;padding:6px 8px;margin-bottom:6px;font-size:12px;line-height:1.5">
                <b>Bắt đầu 3 bước:</b> ① <b>🎮 Mở cửa sổ game</b> ② OBS thêm nguồn <b>Window Capture</b> bắt cửa sổ đó ③ Gán quà bên dưới rồi bấm <b>🧪 Thử</b></div>
            <div class="nd-card-title">⚙ Cài đặt ván</div>
            <label class="qv-row"><span title="OBS: nguồn Window Capture bắt cửa sổ game">Khung cửa sổ game</span><select data-k="qvWinShape">${[['9:16', '📱 Dọc 9:16 (TikTok)'], ['1:1', '⬛ Vuông 1:1'], ['16:9', '🖥 Ngang 16:9']].map(([v, n]) => `<option value="${v}"${(cfg.qvWinShape || '9:16') === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
            <label class="qv-row"><span title="Máy yếu / OBS giật: chọn Nhẹ rồi mở lại cửa sổ game">Chất lượng hình</span><select data-k="qvQuality">${[['high', '✨ Đẹp'], ['low', '⚡ Nhẹ (máy yếu)']].map(([v, n]) => `<option value="${v}"${(cfg.qvQuality || 'high') === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
            <label class="qv-row"><span title="Đồ trang trí theo mùa: tự bật Noel (10/12–2/1) và Tết (2 tuần quanh mùng 1)">Trang trí mùa</span><select data-k="qvSeason">${[['auto', '📅 Tự theo ngày'], ['off', 'Tắt'], ['noel', '🎄 Noel'], ['tet', '🧧 Tết']].map(([v, n]) => `<option value="${v}"${(cfg.qvSeason || 'auto') === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
            <label class="qv-row"><span>Nhân vật zombie</span><select data-k="qvZombieModel">${ZOMBIES.map(([v, n]) => `<option value="${v}"${cfg.qvZombieModel === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
            <label class="qv-row"><span>Tên streamer (zombie)</span><input type="text" data-k="qvStreamerName" placeholder="Streamer" value="${esc(cfg.qvStreamerName)}"></label>
            <label class="qv-row"><span>Link avatar</span><input type="text" data-k="qvStreamerAvatar" placeholder="https://… (không bắt buộc)" value="${esc(cfg.qvStreamerAvatar)}"></label>
            <label class="qv-row"><span title="Cửa tự hồi máu sau 3 giây không bị đấm">Máu cửa nhà</span><input type="number" min="100" step="100" data-k="qvDoorHp" data-num="1" value="${esc(cfg.qvDoorHp)}"></label>
            ${cfg.qvTimerOn ? `<label class="qv-row"><span title="Chỉ dùng khi bật đồng hồ">Giờ mỗi ván (giây)</span><input type="number" min="30" step="10" data-k="qvRoundSeconds" data-num="1" value="${esc(cfg.qvRoundSeconds)}"></label>` : ''}
            <label class="qv-row"><span>Mục tiêu mỗi chặng</span><select data-k="qvWinTarget" data-num="1">${[10, 20, 30, 50].map(v => `<option value="${v}"${Number(cfg.qvWinTarget || 20) === v ? ' selected' : ''}>${v} WIN</option>`).join('')}</select></label>
            <label class="qv-row"><span title="Đủ (số tim/đá × hệ số) tim trong 1 ván → mưa đá thưởng; 0 = tắt">Thanh tim cả phòng</span><select data-k="qvLikeGoal" data-num="1">${[[0, 'Tắt'], [10, '×10'], [20, '×20'], [50, '×50']].map(([v, n]) => `<option value="${v}"${Number(cfg.qvLikeGoal ?? 20) === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
            <label class="qv-row"><span>Map bắt đầu</span><select data-k="qvStartMap" data-num="1">${MAPS.map((m, i) => `<option value="${i + 1}"${Number(cfg.qvStartMap) === i + 1 ? ' selected' : ''}>Map ${i + 1}: ${m}</option>`).join('')}</select></label>
            <div class="qv-checks">
                <label><input type="checkbox" data-k="qvTimerOn"${cfg.qvTimerOn ? ' checked' : ''}> ⏱ Đồng hồ ván</label>
                <label><input type="checkbox" data-k="qvCheckpoint"${cfg.qvCheckpoint !== false ? ' checked' : ''}> 🚩 Cột mốc giữa đường</label>
                <label><input type="checkbox" data-k="qvShowLegend"${cfg.qvShowLegend !== false ? ' checked' : ''}> 🎁 Hiện 2 cột quà hai bên (bỏ tick = chỉ còn game)</label>
                <label><input type="checkbox" data-k="qvLockJump"${cfg.qvLockJump ? ' checked' : ''}> 🔒 Khóa nhảy (Space)</label>
                <label><input type="checkbox" data-k="qvLockForward"${cfg.qvLockForward ? ' checked' : ''}> 🔒 Khóa tiến/lùi</label>
                <label><input type="checkbox" data-k="qvSound"${cfg.qvSound ? ' checked' : ''}> 🔊 Âm thanh</label>
                <label title="Zombie qua cột mốc → đếm ngược; hết giờ mà cửa còn = khán giả thắng"><input type="checkbox" data-k="qvHold"${cfg.qvHold !== false ? ' checked' : ''}> ⏳ Giữ nhà</label>
                <label title="Bị đẩy lùi nhiều → zombie lên cơn vài giây (đi nhanh, đấm mạnh)"><input type="checkbox" data-k="qvHunger"${cfg.qvHunger !== false ? ' checked' : ''}> 🧠 Cơn đói</label>
                <label title="Khoảng 30 phút có 1 ván chỉ cần nửa số tim để ném đá"><input type="checkbox" data-k="qvGolden"${cfg.qvGolden !== false ? ' checked' : ''}> 🌟 Giờ vàng</label>
                <label title="Từ vòng map thứ 2, mỗi ván bốc 1 luật: gió ngược, sương dày, cửa vàng…"><input type="checkbox" data-k="qvMods"${cfg.qvMods !== false ? ' checked' : ''}> 🎲 Biến thể ván</label>
                <label title="Khe giữa màn rảnh thì hiện 1 dòng hướng dẫn tặng gì ra gì"><input type="checkbox" data-k="qvTips"${cfg.qvTips !== false ? ' checked' : ''}> 💡 Hướng dẫn người mới</label>
                <label title="Hiện ở ô bên dưới, không lên hình"><input type="checkbox" data-k="qvCues"${cfg.qvCues !== false ? ' checked' : ''}> 🎙️ Nhắc lời dẫn</label>
            </div>
            <div class="qv-row"><span title="WIN về 0, chặng 1, về map bắt đầu (phiên tự lưu 6 giờ: tải lại OBS không mất)">Phiên chơi</span><button type="button" class="nd-btn" id="qv-newsession">🔄 Làm mới phiên</button></div>
            <div id="qv-cue" style="display:none;margin:4px 0;padding:6px 8px;border-radius:8px;background:rgba(80,160,255,.14);border:1px solid rgba(80,160,255,.4);font-size:12.5px;line-height:1.45"></div>
            <div class="qv-row"><span title="Nguồn Browser riêng. Thêm ?cols=1 · &amp;scale=1.3 · &amp;side=viewer · &amp;side=hero">Bảng quà OBS</span><button type="button" class="nd-btn" id="qv-copy-gifts">📋 Copy link bảng quà</button></div>`;
        host.querySelector('#qv-newsession')?.addEventListener('click', () => {
            if (!confirm('Làm mới phiên? WIN về 0, chặng 1, về map bắt đầu.')) return;
            cmd('newsession', { map: Math.max(0, (Number(cfg.qvStartMap) || 1) - 1) });
        });
        host.querySelector('#qv-copy-gifts')?.addEventListener('click', async () => {
            const url = window.buildOverlayURL ? window.buildOverlayURL('/overlay/quaivat-gifts') : location.origin + '/overlay/quaivat-gifts';
            try { await navigator.clipboard.writeText(url); toast('Đã copy link bảng quà OBS'); } catch (e) { prompt('Link bảng quà OBS:', url); }
        });
        host.querySelectorAll('[data-k]').forEach(el => {
            el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
                const k = el.dataset.k;
                cfg[k] = el.type === 'checkbox' ? el.checked : el.dataset.num ? Number(el.value) || 0 : el.value;
                schedulePersist();
                if (k === 'qvTimerOn') renderSettings();                     // hiện/ẩn ô "Giờ mỗi ván"
            });
        });
    }

    // tên quà mặc định của từng hành động (dùng chung gift-data.js với game) → phát hiện quà bị trùng / bị chiếm
    let DEF = null;
    import('/games/quaivat/gift-data.js').then(m => { DEF = {}; for (const g of [...m.VILLAINS, ...m.HEROES]) DEF[g.action] = g.names || []; if (cfg) renderGifts(); }).catch(() => {});
    const actLabel = id => (ACTIONS.find(a => a.id === id) || {}).label || id;
    function giftConflicts() {
        const warn = {}, add = (a, m) => { (warn[a] = warn[a] || []).includes(m) || warn[a].push(m); };
        const map = cfg.qvGiftMap || {}, byGift = new Map();
        for (const [aid, list] of Object.entries(map)) for (const g of list || []) { const k = String(g.giftId != null ? g.giftId : g.giftName); if (!byGift.has(k)) byGift.set(k, { name: g.giftName, acts: [] }); byGift.get(k).acts.push(aid); }
        for (const { name, acts } of byGift.values()) if (acts.length > 1) for (const a of acts) add(a, `"${name}" bị gán trùng với: ${acts.filter(x => x !== a).map(actLabel).join(', ')}`);
        if (DEF) for (const [aid, list] of Object.entries(map)) for (const g of list || []) {
            const nm = String(g.giftName || '').toLowerCase().trim(); if (!nm) continue;
            for (const [other, names] of Object.entries(DEF)) if (other !== aid && names.includes(nm) && !(map[other] || []).length) {
                add(other, `Quà mặc định "${g.giftName}" đã gán cho ${actLabel(aid)} → dòng này chưa có quà`);
                add(aid, `"${g.giftName}" vốn là quà mặc định của ${actLabel(other)}`);
            }
        }
        // WIN / THUA ngay gán vào quà rẻ → bị troll vô hạn (hàng chờ còn giữ qua ván)
        const sheet = Array.isArray(window.__giftSheet) ? window.__giftSheet : [];
        for (const aid of ['win', 'lose']) for (const g of map[aid] || []) {
            const it = sheet.find(x => String(x.id) === String(g.giftId)), c = it ? Number(it.diamond) || 0 : null;
            if (c != null && c < 1000) add(aid, `"${g.giftName}" chỉ ${c} xu — nên gán quà ≥ 5.000 xu kẻo bị troll`);
        }
        return warn;
    }
    function renderGifts() {
        const host = $('#qv-gifts');
        if (!host) return;
        const warn = giftConflicts(), nWarn = Object.keys(warn).length;
        const row = a => {
            const list = cfg.qvGiftMap[a.id] || [];
            const chips = list.map((g, i) => `<span class="qv-chip">${g.giftImage ? `<img src="${esc(g.giftImage)}">` : '🎁'}${esc(g.giftName || ('#' + g.giftId))}<button class="qv-x" data-a="${a.id}" data-i="${i}" title="Bỏ">✕</button></span>`).join('');
            return `<div class="qv-grow ${a.side === 'hero' ? 'qv-hero' : ''} ${warn[a.id] ? 'qv-warn' : ''}">
                <div class="qv-act"><span class="qv-emo">${a.emoji}</span><div><b>${esc(a.label)}</b><small>${list.length ? 'Đã gán quà riêng' : (a.def ? 'Mặc định: ' + esc(a.def) : 'Chưa gán quà')}</small>${(warn[a.id] || []).map(m => `<small class="qv-warnmsg">⚠️ ${esc(m)}</small>`).join('')}</div></div>
                <div class="qv-chips">${chips}<button class="ghost small qv-add" data-a="${a.id}">＋ Chọn quà</button></div>
                <button class="ghost small qv-test" data-t="${a.id}" title="Thả thử trên overlay">🧪 Thử</button>
            </div>`;
        };
        host.innerHTML = `
            ${nWarn ? `<div class="qv-warnbox">⚠️ Có ${nWarn} hành động bị trùng / mất quà — xem các dòng tô đỏ bên dưới</div>` : ''}
            <div class="nd-card-title">🎁 Quà người xem → bẫy & vật cản</div>
            ${ACTIONS.filter(a => a.side === 'viewer').map(row).join('')}
            <div class="nd-card-title" style="margin-top:8px">⚡ Quà giúp zombie (fan streamer)</div>
            ${ACTIONS.filter(a => a.side === 'hero').map(row).join('')}
            <div class="nd-card-title" style="margin-top:8px">💬 Tương tác (không cần quà)</div>
            ${SOCIAL.map(s => `<div class="qv-grow"><div class="qv-act"><span class="qv-emo">${s.emoji}</span><div><b>${esc(s.label)}</b></div></div><div class="qv-chips">${s.id === 'like' ? `<label class="qv-inl">Mỗi <input type="number" min="1" step="10" data-k2="qvLikePer" value="${esc(cfg.qvLikePer)}"> tim cả phòng = 1 cục đá</label>` : s.id === 'comment' ? `<label class="qv-inl">Từ khóa <input type="text" maxlength="40" data-k2="qvCommentKey" placeholder="trống = mọi bình luận" value="${esc(cfg.qvCommentKey)}"></label>` : ''}</div><button class="ghost small qv-test" data-t="${s.id}">🧪 Thử</button></div>`).join('')}
            <div class="qv-hint">Quà chưa gán: khớp theo tên quà mặc định, quà lạ quy theo số xu. Quà đắt hơn giá món thì chạy đủ theo xu (Lion = 100 Đá lăn).</div>`;
        host.querySelectorAll('[data-k2]').forEach(el => el.addEventListener('input', () => { cfg[el.dataset.k2] = el.type === 'number' ? Math.max(1, Number(el.value) || 1) : el.value.trim(); schedulePersist(); }));
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
                <div class="nd-gp-hint">Mỗi quà chỉ gán cho 1 hành động.</div></div>`;
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
            </div>`).join('') || '<div class="nd-empty">Chưa có danh sách quà (kết nối LIVE để tải).</div>';
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
