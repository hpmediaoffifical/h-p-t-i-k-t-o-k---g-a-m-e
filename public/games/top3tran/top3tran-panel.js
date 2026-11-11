/* 🏆 Top 3 Kết Thúc Trận — trang điều khiển trong app (view-top3tran).
   Panel chỉ GỬI cấu hình (POST /api/games/top3tran/config, debounce). Mở/đóng trận, ẩn bục, xem thử,
   quà thử: POST /api/top3tran/cmd. Trạng thái: socket 'top3tran:state'. Xem trước = iframe overlay ?demo=1. */
(function () {
    'use strict';
    const GAME_ID = 'top3tran';
    const OVERLAY_PATH = '/overlay/top3tran';
    let cfg = null, built = false, saveT = null, st = null;

    const $ = (sel) => document.querySelector('#top3tran-panel ' + sel);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
    const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then((r) => r.json()).catch(() => null);
    function overlayUrl() { return typeof window.buildOverlayURL === 'function' ? window.buildOverlayURL(OVERLAY_PATH) : location.origin + OVERLAY_PATH; }

    function pushPreview() {
        const f = $('.rkp-preview iframe');
        try { f && f.contentWindow && f.contentWindow.postMessage({ type: 'top3tran:cfg', cfg }, location.origin); } catch (e) {}
    }
    function save(patch) {
        Object.assign(cfg, patch);
        pushPreview();
        clearTimeout(saveT);
        saveT = setTimeout(() => post('/api/games/' + GAME_ID + '/config', cfg), 400);
    }
    function cmd(c, extra) { return post('/api/top3tran/cmd', Object.assign({ cmd: c }, extra || {})).then((d) => { if (d && d.state) show(d.state); return d; }); }
    const range = (id, label, min, max) => `<label class="rkp-row">${label}<input type="range" id="${id}" min="${min}" max="${max}" step="1"><span id="${id}-v"></span></label>`;

    function build() {
        const root = document.getElementById('top3tran-panel');
        if (!root) return;
        root.innerHTML = `
<div class="rkp-grid">
  <div class="rkp-col">
    <div class="rkp-card">
      <label class="rkp-switch"><input type="checkbox" id="t3p-enabled"> <b>Bật Top 3</b> <small>— tắt thì không tính điểm, không công bố</small></label>
      <label class="rkp-switch"><input type="checkbox" id="t3p-pk"> <b>Tự theo PK</b> <small>— PK bắt đầu là mở trận, PK kết thúc là công bố</small></label>
      <div class="rkp-btns">
        <button class="rkp-go" id="t3p-start">▶ Mở trận</button>
        <button id="t3p-end">🏁 Kết thúc &amp; công bố</button>
        <button id="t3p-hide">🙈 Ẩn bục</button>
        <button class="ghost" id="t3p-reset">↺ Xoá</button>
      </div>
      <div class="rkp-status" id="t3p-status"></div>
      <ol class="rkp-list" id="t3p-list"></ol>
    </div>
    <div class="rkp-card">
      <h4>Luật</h4>
      <div class="rkp-nums">
        <label class="rkp-num">Trận tay hẹn giờ (giây)<input type="number" id="t3p-dur" min="0" max="7200"><small>0 = tới khi bấm Kết thúc</small></label>
        <label class="rkp-num">Tối thiểu mỗi lượt (xu)<input type="number" id="t3p-min" min="0"><small>0 = mọi quà</small></label>
        <label class="rkp-num">Bục hiện (giây)<input type="number" id="t3p-hold" min="0" max="120"><small>0 = tới khi bấm Ẩn</small></label>
      </div>
      <label class="rkp-switch"><input type="checkbox" id="t3p-bar"> <b>Thanh "Top trận" trong lúc đấu</b></label>
      <p class="rkp-note">Mọi quà trong trận cộng xu cho người tặng (đã nhân combo). Đang có trận bấm tay thì PK không cướp trận. Không ai tặng thì không công bố.</p>
    </div>
    <div class="rkp-card">
      <h4>Hiển thị trên OBS</h4>
      ${range('t3p-y', 'Bục — dọc', 0, 90)}
      ${range('t3p-by', 'Thanh — dọc', 0, 95)}
      ${range('t3p-scale', 'Cỡ', 40, 200)}
    </div>
    <div class="rkp-card">
      <h4>Thử không cần LIVE</h4>
      <div class="rkp-btns">
        <input type="text" id="t3p-tn" placeholder="Tên người thử" maxlength="40">
        <input type="number" id="t3p-tc" value="100" min="1" style="width:90px">
        <button id="t3p-bid">🎁 Quà thử</button>
        <button id="t3p-demo">🎬 Công bố mẫu trên OBS</button>
      </div>
      <p class="rkp-note">Công bố mẫu dùng 3 tên giả, không đụng điểm trận đang tính.</p>
    </div>
  </div>
  <div class="rkp-col rkp-side">
    <div class="rkp-preview ui-keep-colors"><iframe src="${OVERLAY_PATH}?demo=1" title="Xem trước Top 3"></iframe></div>
    <p class="rkp-note">Xem trước dùng số giả. Thêm Browser Source 1080×1920 bằng nút 📋 Link OBS.</p>
  </div>
</div>`;
        root.addEventListener('click', onClick);
        root.addEventListener('input', onInput);
        root.addEventListener('change', onInput);
        $('.rkp-preview iframe').addEventListener('load', pushPreview);
        window.addEventListener('message', (e) => { if (e.origin === location.origin && e.data && e.data.type === 'top3tran:ready') pushPreview(); });
        document.getElementById('btn-top3tran-copy')?.addEventListener('click', copyLink);
        document.getElementById('btn-top3tran-pop')?.addEventListener('click', () => window.open(OVERLAY_PATH, '_blank', 'width=540,height=960'));
        built = true;
    }

    const RANGE_KEYS = { 't3p-y': 'yPercent', 't3p-by': 'barYPercent', 't3p-scale': 'scale' };
    const NUM_KEYS = { 't3p-dur': 'durationSec', 't3p-min': 'minCoins', 't3p-hold': 'holdSec' };
    function fill() {
        $('#t3p-enabled').checked = cfg.enabled !== false;
        $('#t3p-pk').checked = cfg.autoPk !== false;
        $('#t3p-bar').checked = cfg.liveBar !== false;
        for (const [id, k] of Object.entries(NUM_KEYS)) $('#' + id).value = cfg[k];
        for (const [id, k] of Object.entries(RANGE_KEYS)) { $('#' + id).value = cfg[k]; $('#' + id + '-v').textContent = cfg[k] + '%'; }
    }
    function onInput(e) {
        const t = e.target, id = t.id;
        if (id === 't3p-enabled') save({ enabled: t.checked });
        else if (id === 't3p-pk') save({ autoPk: t.checked });
        else if (id === 't3p-bar') save({ liveBar: t.checked });
        else if (NUM_KEYS[id] && e.type === 'change') save({ [NUM_KEYS[id]]: Number(t.value) || 0 });
        else if (RANGE_KEYS[id]) { save({ [RANGE_KEYS[id]]: +t.value }); $('#' + id + '-v').textContent = t.value + '%'; }
    }
    function onClick(e) {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.id === 't3p-start') {
            if (st && st.open && !confirm('Trận đang tính điểm — mở trận mới sẽ xoá điểm hiện tại?')) return;
            clearTimeout(saveT);
            post('/api/games/' + GAME_ID + '/config', cfg).then(() => cmd('start'));
        } else if (b.id === 't3p-end') cmd('end');
        else if (b.id === 't3p-hide') cmd('hide');
        else if (b.id === 't3p-reset') cmd('reset');
        else if (b.id === 't3p-demo') cmd('demo');
        else if (b.id === 't3p-bid') {
            cmd('bid', { name: $('#t3p-tn').value || undefined, coins: Number($('#t3p-tc').value) || 10 }).then((d) => { if (d && !d.ok) flash(d.error || 'Lỗi'); });
        }
    }
    function flash(msg) { const el = $('#t3p-status'); if (el) { el.textContent = '⚠ ' + msg; el.classList.add('warn'); setTimeout(() => show(st), 1800); } }

    function show(s) {
        st = s || st;
        const el = $('#t3p-status');
        if (!el || !st) return;
        el.classList.remove('warn');
        const src = st.source === 'pk' ? 'theo PK' : 'bấm tay';
        const head = st.open ? `🟢 Đang tính điểm (${src})` : (st.announce ? '🏆 Đang công bố trên OBS' : '⏸ Chưa mở trận');
        el.innerHTML = `${head} · ${fmt(st.players)} người · ${fmt(st.total)} xu`;
        el.classList.toggle('live', !!st.open);
        const rows = st.announce ? st.announce.rows : st.top;
        $('#t3p-list').innerHTML = (rows || []).map((r) => `<li><b>${esc(r.name)}</b><span>${fmt(r.coins)} xu</span></li>`).join('');
    }

    function copyLink() {
        const btn = document.getElementById('btn-top3tran-copy'), url = overlayUrl();
        const done = (ok) => { if (!btn) return; btn.textContent = ok ? '✓ Đã copy' : '⚠ Copy lỗi'; setTimeout(() => { btn.textContent = '📋 Link OBS'; }, 1500); };
        const legacy = () => { try { const ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(true); } catch (e) { done(false); } };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => done(true)).catch(legacy); else legacy();
    }

    function open(socket) {
        if (!built) {
            build();
            if (socket) socket.on('top3tran:state', show);
        }
        fetch('/api/games/' + GAME_ID + '/config').then((r) => r.json()).then((c) => { cfg = c || {}; fill(); pushPreview(); }).catch(() => {});
        fetch('/api/top3tran/state').then((r) => r.json()).then((d) => d && d.state && show(d.state)).catch(() => {});
    }

    window.HpTop3TranPanel = { open };
})();
