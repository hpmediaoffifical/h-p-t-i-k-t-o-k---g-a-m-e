/* 🔨 Đấu Giá — trang điều khiển trong app (view-daugia).
   Panel chỉ GỬI cấu hình (POST /api/games/daugia/config, debounce) — không nghe gameConfig để đè ô đang sửa.
   Mở/chốt/xoá phiên + quà thử: POST /api/daugia/cmd. Trạng thái phiên: socket 'daugia:state'.
   Xem trước = iframe overlay ?demo=1 nhận cfg qua postMessage. */
(function () {
    'use strict';
    const GAME_ID = 'daugia';
    const OVERLAY_PATH = '/overlay/daugia';
    let cfg = null, built = false, saveT = null, st = null, tickT = null;

    const $ = (sel) => document.querySelector('#daugia-panel ' + sel);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
    const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then((r) => r.json()).catch(() => null);
    function overlayUrl() { return typeof window.buildOverlayURL === 'function' ? window.buildOverlayURL(OVERLAY_PATH) : location.origin + OVERLAY_PATH; }

    function pushPreview() {
        const f = $('.rkp-preview iframe');
        try { f && f.contentWindow && f.contentWindow.postMessage({ type: 'daugia:cfg', cfg }, location.origin); } catch (e) {}
    }
    function save(patch) {
        Object.assign(cfg, patch);
        pushPreview();
        clearTimeout(saveT);
        saveT = setTimeout(() => post('/api/games/' + GAME_ID + '/config', cfg), 400);
    }
    function cmd(c, extra) { return post('/api/daugia/cmd', Object.assign({ cmd: c }, extra || {})).then((d) => { if (d && d.state) show(d.state); return d; }); }

    const num = (id, label, min, max, note) => `<label class="rkp-num">${label}<input type="number" id="${id}" min="${min}" max="${max}">${note ? `<small>${note}</small>` : ''}</label>`;
    const range = (id, label, min, max) => `<label class="rkp-row">${label}<input type="range" id="${id}" min="${min}" max="${max}" step="1"><span id="${id}-v"></span></label>`;

    function build() {
        const root = document.getElementById('daugia-panel');
        if (!root) return;
        root.innerHTML = `
<div class="rkp-grid">
  <div class="rkp-col">
    <div class="rkp-card">
      <label class="rkp-switch"><input type="checkbox" id="dgp-enabled"> <b>Bật Đấu Giá</b> <small>— tắt thì không nhận quà, OBS ẩn bảng</small></label>
      <label class="rkp-field">Món đang bán<input type="text" id="dgp-title" maxlength="120" placeholder="VD: Áo khoác ký tên"></label>
      <div class="rkp-btns">
        <button class="rkp-go" id="dgp-start">▶ Mở phiên</button>
        <button id="dgp-end">⏹ Chốt ngay</button>
        <button class="ghost" id="dgp-reset">↺ Xoá bảng</button>
      </div>
      <div class="rkp-status" id="dgp-status"></div>
      <ol class="rkp-list" id="dgp-list"></ol>
    </div>
    <div class="rkp-card">
      <h4>Luật</h4>
      <div class="rkp-nums">
        ${num('dgp-dur', 'Thời gian (giây)', 10, 3600)}
        ${num('dgp-min', 'Tối thiểu mỗi lượt (xu)', 0, 1000000, '0 = mọi quà')}
        ${num('dgp-tie', 'Hiệp phụ khi hoà (giây)', 0, 120, '0 = không có')}
        ${num('dgp-tier', 'Số hiệp phụ tối đa', 0, 5)}
      </div>
      <label class="rkp-switch"><input type="checkbox" id="dgp-snipe"> <b>Chống cướp giây chót</b> <small>— chỉ cộng giờ khi quà làm ĐỔI người đứng đầu</small></label>
      <div class="rkp-nums" id="dgp-snipe-box">
        ${num('dgp-sw', 'Trong (giây cuối)', 1, 60)}
        ${num('dgp-sa', 'Cộng thêm (giây)', 1, 60)}
        ${num('dgp-sm', 'Tối đa (lần)', 0, 50)}
      </div>
      <label class="rkp-switch"><input type="checkbox" id="dgp-trash"> <b>Người về nhì vào thùng rác</b> <small>— lúc chốt đơn</small></label>
      <p class="rkp-note">Mọi quà tính theo xu (đã nhân combo). Hết giờ mà 2 người bằng xu ở đầu bảng → hiệp phụ; hết số hiệp phụ vẫn hoà thì ai đạt mức đó trước thắng.</p>
    </div>
    <div class="rkp-card">
      <h4>Hiển thị trên OBS</h4>
      ${range('dgp-rows', 'Số hàng', 3, 10)}
      ${range('dgp-x', 'Ngang', 0, 100)}
      ${range('dgp-y', 'Dọc', 0, 90)}
      ${range('dgp-scale', 'Cỡ', 40, 200)}
    </div>
    <div class="rkp-card">
      <h4>Thử không cần LIVE</h4>
      <div class="rkp-btns">
        <input type="text" id="dgp-tn" placeholder="Tên người thử" maxlength="40">
        <input type="number" id="dgp-tc" value="100" min="1" style="width:90px">
        <button id="dgp-bid">🎁 Trả giá thử</button>
      </div>
      <p class="rkp-note">Quà thử đi đúng luật (chống cướp, tối thiểu xu…) và hiện trên OBS như quà thật.</p>
    </div>
  </div>
  <div class="rkp-col rkp-side">
    <div class="rkp-preview ui-keep-colors"><iframe src="${OVERLAY_PATH}?demo=1" title="Xem trước Đấu Giá"></iframe></div>
    <p class="rkp-note">Xem trước dùng số giả. Thêm Browser Source 1080×1920 bằng nút 📋 Link OBS.</p>
  </div>
</div>`;
        root.addEventListener('click', onClick);
        root.addEventListener('input', onInput);
        root.addEventListener('change', onInput);
        $('.rkp-preview iframe').addEventListener('load', pushPreview);
        window.addEventListener('message', (e) => { if (e.origin === location.origin && e.data && e.data.type === 'daugia:ready') pushPreview(); });
        document.getElementById('btn-daugia-copy')?.addEventListener('click', copyLink);
        document.getElementById('btn-daugia-pop')?.addEventListener('click', () => window.open(OVERLAY_PATH, '_blank', 'width=540,height=960'));
        built = true;
    }

    function fill() {
        const set = (id, v) => { const el = $('#' + id); if (el) el.value = v; };
        $('#dgp-enabled').checked = cfg.enabled !== false;
        set('dgp-title', cfg.title || '');
        set('dgp-dur', cfg.durationSec); set('dgp-min', cfg.minCoins); set('dgp-tie', cfg.tieSec); set('dgp-tier', cfg.tieRounds);
        $('#dgp-snipe').checked = cfg.snipeOn !== false;
        set('dgp-sw', cfg.snipeWindowSec); set('dgp-sa', cfg.snipeAddSec); set('dgp-sm', cfg.snipeMax);
        $('#dgp-snipe-box').classList.toggle('off', cfg.snipeOn === false);
        $('#dgp-trash').checked = cfg.trashOn !== false;
        [['dgp-rows', 'rows', ''], ['dgp-x', 'xPercent', '%'], ['dgp-y', 'yPercent', '%'], ['dgp-scale', 'scale', '%']].forEach(([id, k, u]) => {
            set(id, cfg[k]); $('#' + id + '-v').textContent = cfg[k] + u;
        });
    }

    const NUM_KEYS = { 'dgp-dur': 'durationSec', 'dgp-min': 'minCoins', 'dgp-tie': 'tieSec', 'dgp-tier': 'tieRounds', 'dgp-sw': 'snipeWindowSec', 'dgp-sa': 'snipeAddSec', 'dgp-sm': 'snipeMax' };
    const RANGE_KEYS = { 'dgp-rows': ['rows', ''], 'dgp-x': ['xPercent', '%'], 'dgp-y': ['yPercent', '%'], 'dgp-scale': ['scale', '%'] };
    function onInput(e) {
        const t = e.target, id = t.id;
        if (id === 'dgp-enabled') save({ enabled: t.checked });
        else if (id === 'dgp-snipe') { save({ snipeOn: t.checked }); $('#dgp-snipe-box').classList.toggle('off', !t.checked); }
        else if (id === 'dgp-trash') save({ trashOn: t.checked });
        else if (id === 'dgp-title') {
            save({ title: t.value });
            if (e.type === 'change' && st && (st.phase === 'live' || st.phase === 'tie')) cmd('title', { title: t.value });
        } else if (NUM_KEYS[id] && e.type === 'change') save({ [NUM_KEYS[id]]: Number(t.value) || 0 });
        else if (RANGE_KEYS[id]) { const [k, u] = RANGE_KEYS[id]; save({ [k]: +t.value }); $('#' + id + '-v').textContent = t.value + u; }
    }
    function onClick(e) {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.id === 'dgp-start') {
            if (st && (st.phase === 'live' || st.phase === 'tie') && !confirm('Phiên đang chạy — mở phiên mới sẽ xoá bảng hiện tại?')) return;
            clearTimeout(saveT);
            post('/api/games/' + GAME_ID + '/config', cfg).then(() => cmd('start', { title: $('#dgp-title').value }));
        } else if (b.id === 'dgp-end') cmd('end');
        else if (b.id === 'dgp-reset') cmd('reset');
        else if (b.id === 'dgp-bid') {
            cmd('bid', { name: $('#dgp-tn').value || undefined, coins: Number($('#dgp-tc').value) || 10 }).then((d) => {
                if (d && !d.ok) flash(d.error || 'Lỗi');
            });
        }
    }
    function flash(msg) { const el = $('#dgp-status'); if (el) { el.textContent = '⚠ ' + msg; el.classList.add('warn'); setTimeout(() => show(st), 1800); } }

    function show(s) {
        st = s || st;
        const el = $('#dgp-status');
        if (!el || !st) return;
        el.classList.remove('warn');
        const left = st.endsAt ? Math.max(0, Math.ceil((st.endsAt - (Date.now() + ((st.serverNow || Date.now()) - (st._recv || Date.now())))) / 1000)) : 0;
        const lbl = { idle: '⏸ Chưa mở phiên', live: `🟢 Đang trả giá · còn ${left}s`, tie: `🔴 Hiệp phụ ${st.tieRound} · còn ${left}s`, done: '✅ Đã chốt' }[st.phase] || '';
        const ext = st.extendCount ? ` · đã gia hạn ${st.extendCount} lần` : '';
        const win = st.phase === 'done' ? (st.winner ? ` · thắng: <b>${esc(st.winner.name)}</b> (${fmt(st.winner.coins)} xu)` : ' · không ai trả giá') : '';
        el.innerHTML = `${lbl}${ext}${win} · ${fmt(st.bidders)} người · ${fmt(st.total)} xu`;
        el.classList.toggle('live', st.phase === 'live' || st.phase === 'tie');
        $('#dgp-list').innerHTML = (st.rows || []).slice(0, 5).map((r) => `<li><b>${esc(r.name)}</b><span>${fmt(r.coins)} xu</span></li>`).join('');
    }

    function copyLink() {
        const btn = document.getElementById('btn-daugia-copy'), url = overlayUrl();
        const done = (ok) => { if (!btn) return; btn.textContent = ok ? '✓ Đã copy' : '⚠ Copy lỗi'; setTimeout(() => { btn.textContent = '📋 Link OBS'; }, 1500); };
        const legacy = () => { try { const ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(true); } catch (e) { done(false); } };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => done(true)).catch(legacy); else legacy();
    }

    function open(socket) {
        if (!built) {
            build();
            if (socket) socket.on('daugia:state', (s) => { if (s) { s._recv = Date.now(); show(s); } });
            tickT = setInterval(() => { if (st && st.endsAt) show(st); }, 1000);
        }
        fetch('/api/games/' + GAME_ID + '/config').then((r) => r.json()).then((c) => { cfg = c || {}; fill(); pushPreview(); }).catch(() => {});
        fetch('/api/daugia/state').then((r) => r.json()).then((d) => { if (d && d.state) { d.state._recv = Date.now(); show(d.state); } }).catch(() => {});
    }

    window.HpDauGiaPanel = { open };
})();
