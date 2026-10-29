/* 🏆 Thẻ Giải Đấu — trang cài đặt trong app (view-leaguecard).
   Panel là nguồn cấu hình duy nhất: chỉ GỬI POST /api/games/leaguecard/config (debounce), KHÔNG nghe
   gameConfig để ghi đè ô đang sửa (bài học relay-cfg). Xem trước = iframe overlay.html?demo=1 nhận cfg qua postMessage.
   Nút "Thử trên OBS" gọi POST /api/leaguecard/simulate — gói giả đi qua đúng bộ đọc như gói TikTok thật. */
(function () {
    'use strict';
    const GAME_ID = 'leaguecard';
    const OVERLAY_PATH = '/overlay/leaguecard';
    const LC = () => window.HpLeagueCard;
    const DIVISIONS = ['S', 'A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5', 'C1', 'C2', 'C3', 'C4', 'C5', 'D1', 'D2', 'D3', 'D4', 'D5'];
    let cfg = null, gifts = [], built = false, saveT = null, socketRef = null;

    const $ = (sel) => document.querySelector('#leaguecard-panel ' + sel);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');

    function overlayUrl() { return typeof window.buildOverlayURL === 'function' ? window.buildOverlayURL(OVERLAY_PATH) : location.origin + OVERLAY_PATH; }
    function pushPreview() {
        const f = $('.lcp-preview iframe');
        try { f && f.contentWindow && f.contentWindow.postMessage({ type: 'leaguecard:cfg', cfg }, location.origin); } catch (e) {}
    }
    function save(patch) {
        Object.assign(cfg, patch);
        cfg = LC().normalizeCfg(cfg);
        pushPreview();
        clearTimeout(saveT);
        saveT = setTimeout(() => {
            fetch('/api/games/' + GAME_ID + '/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(Object.entries(cfg).filter(([k]) => k !== 'manual' && k !== 'manualOn'))) }).catch(() => {});   // số nhập tay đi route riêng (quà trừ dần, đừng đè)
        }, 400);
    }

    function giftOptions(selected) {
        const list = gifts.filter((g) => g && Number(g.diamond) > 0 && !g.virtual).slice().sort((a, b) => a.diamond - b.diamond);
        return '<option value="">— chọn quà —</option>' + list.map((g) => `<option value="${esc(g.id)}" ${String(g.id) === selected ? 'selected' : ''}>${esc(g.name)} · ${fmt(g.diamond)} xu</option>`).join('');
    }

    function build() {
        const root = document.getElementById('leaguecard-panel');
        if (!root) return;
        const { STYLES, SKINS } = LC();
        root.innerHTML = `
<div class="lcp-grid">
  <div class="lcp-col">
    <div class="lcp-card">
      <label class="lcp-switch"><input type="checkbox" id="lcp-enabled"> <b>Hiện thẻ trên OBS</b></label>
      <div class="lcp-status" id="lcp-status">Chưa nhận dữ liệu giải đấu từ TikTok — kết nối LIVE rồi chờ TikTok gửi bảng xếp hạng.</div>
    </div>
    <div class="lcp-card">
      <label class="lcp-switch"><input type="checkbox" id="lcp-man-on"> <b>Nhập tay số giải đấu</b> <small>— TikTok không gửi số giải đấu cho kết nối của app, hãy đọc trong app TikTok rồi nhập vào đây</small></label>
      <div class="lcp-man" id="lcp-man">
        <label>Bậc <select id="lcp-m-div">${DIVISIONS.map((d) => `<option>${d}</option>`).join('')}</select></label>
        <label>Mảnh <input type="number" id="lcp-m-stars" min="0" max="20"></label>
        <label>Hạng BXH <input type="number" id="lcp-m-rank" min="0" placeholder="bỏ trống"></label>
        <label>Còn thiếu <input type="number" id="lcp-m-need" min="0" placeholder="điểm"></label>
        <label>Giờ chốt <input type="time" id="lcp-m-dl"></label>
        <button id="lcp-m-apply" class="lcp-apply">Cập nhật lên OBS</button>
      </div>
      <p class="lcp-note">Quà trong phòng tự trừ dần số "còn thiếu" (1 xu ≈ 1 điểm). Về 0 là thẻ báo đã giữ hạng và vinh danh người tặng nhiều nhất lúc sắp rớt.</p>
    </div>
    <div class="lcp-card">
      <h4>Kiểu</h4>
      <div class="lcp-seg" id="lcp-style">${Object.entries(STYLES).map(([k, v]) => `<button data-v="${k}">${esc(v)}</button>`).join('')}</div>
      <h4>Skin</h4>
      <div class="lcp-skins" id="lcp-skin">${Object.entries(SKINS).map(([k, v]) => `<button data-v="${k}">${esc(v.name)}</button>`).join('')}</div>
    </div>
    <div class="lcp-card">
      <h4>Vị trí &amp; cỡ <small>(thẻ mọc sang trái từ khiên)</small></h4>
      <label class="lcp-row">Mép phải <input type="range" id="lcp-x" min="20" max="100" step="1"><span id="lcp-x-v"></span></label>
      <label class="lcp-row">Mép trên <input type="range" id="lcp-y" min="0" max="90" step="1"><span id="lcp-y-v"></span></label>
      <label class="lcp-row">Cỡ <input type="range" id="lcp-scale" min="50" max="200" step="5"><span id="lcp-scale-v"></span></label>
    </div>
    <div class="lcp-card">
      <h4>Quy đổi "thiếu bao nhiêu" ra quà</h4>
      <div class="lcp-seg" id="lcp-conv"><button data-v="auto">Tự chọn</button><button data-v="manual">Tôi chọn quà</button><button data-v="off">Tắt</button></div>
      <div id="lcp-conv-manual" class="lcp-row2">
        <select id="lcp-g1"></select><select id="lcp-g2"></select>
      </div>
      <p class="lcp-note">Tự chọn: quà đắt nhất không vượt số điểm còn thiếu + quà rẻ nhất. Tính 1 điểm ≈ 1 xu (sẽ kiểm lại khi có dữ liệu LIVE thật).</p>
    </div>
    <div class="lcp-card">
      <h4>Sắp rớt hạng &amp; người giữ hạng</h4>
      <label class="lcp-row">Báo sắp rớt khi còn ≤ <input type="number" id="lcp-danger" min="1" max="600" style="width:70px"> phút tới giờ chốt mà vẫn thiếu điểm</label>
      <label class="lcp-switch"><input type="checkbox" id="lcp-rescuer"> Vinh danh người giữ hạng (người tặng nhiều nhất lúc sắp rớt)</label>
    </div>
    <div class="lcp-card">
      <h4>Hiển thị</h4>
      <label class="lcp-switch"><input type="checkbox" id="lcp-collapse"> Tự thu gọn còn khiên + mảnh sau <input type="number" id="lcp-collapse-s" min="5" max="600" style="width:60px"> giây yên ắng</label>
      <label class="lcp-row">Số mảnh tối đa mỗi bậc <input type="number" id="lcp-max" min="1" max="10" style="width:60px"></label>
      <label class="lcp-switch"><input type="checkbox" id="lcp-golden"> Giờ vàng <small>— chỉ hiện khi TikTok có gửi khung giờ thưởng (chưa xác nhận có thật)</small></label>
    </div>
  </div>
  <div class="lcp-col lcp-side">
    <div class="lcp-card">
      <h4>Xem trước <small>(số giả lập, tự chạy)</small></h4>
      <div class="lcp-preview"><iframe src="/overlay/leaguecard?demo=1" title="Xem trước Thẻ Giải Đấu"></iframe></div>
    </div>
    <div class="lcp-card">
      <h4>Thử trên OBS <small>(gói giả → overlay thật)</small></h4>
      <div class="lcp-tests">
        <button data-k="reset">Hiện thẻ</button><button data-k="rankUp">▲ Vượt hạng</button><button data-k="rankDown">▼ Tụt hạng</button>
        <button data-k="star">⭐ +1 mảnh</button><button data-k="danger">⚠ Sắp rớt</button><button data-k="gift">🎁 Có người tặng</button>
        <button data-k="kept">🛡 Đã giữ hạng</button><button data-k="promo">🎉 Lên hạng</button><button data-k="demote">💔 Rớt hạng</button>
        <button data-k="bonus">⚡ Giờ vàng</button><button data-k="clear" class="ghost">✖ Xoá</button>
      </div>
      <p class="lcp-note">Nút thử dùng số giả và đè lên số thật cho tới khi TikTok gửi bảng xếp hạng mới.</p>
    </div>
  </div>
</div>`;
        root.addEventListener('click', onClick);
        root.addEventListener('input', onInput);
        root.addEventListener('change', onInput);
        $('.lcp-preview iframe').addEventListener('load', pushPreview);
        window.addEventListener('message', (e) => { if (e.origin === location.origin && e.data && e.data.type === 'leaguecard:ready') pushPreview(); });
        document.getElementById('btn-leaguecard-copy')?.addEventListener('click', copyLink);
        document.getElementById('btn-leaguecard-pop')?.addEventListener('click', () => window.open(OVERLAY_PATH, '_blank', 'width=540,height=960'));
        built = true;
    }

    function fill() {
        const seg = (id, v) => document.querySelectorAll(`#leaguecard-panel #${id} button`).forEach((b) => b.classList.toggle('on', b.dataset.v === v));
        $('#lcp-enabled').checked = cfg.enabled !== false;
        seg('lcp-style', cfg.style); seg('lcp-skin', cfg.skin); seg('lcp-conv', cfg.convertMode);
        $('#lcp-x').value = cfg.xPercent; $('#lcp-x-v').textContent = cfg.xPercent + '%';
        $('#lcp-y').value = cfg.yPercent; $('#lcp-y-v').textContent = cfg.yPercent + '%';
        $('#lcp-scale').value = cfg.scale; $('#lcp-scale-v').textContent = cfg.scale + '%';
        $('#lcp-g1').innerHTML = giftOptions(cfg.convertGifts[0] || '');
        $('#lcp-g2').innerHTML = giftOptions(cfg.convertGifts[1] || '');
        $('#lcp-conv-manual').hidden = cfg.convertMode !== 'manual';
        $('#lcp-danger').value = cfg.dangerMinutes;
        $('#lcp-rescuer').checked = cfg.rescuer !== false;
        $('#lcp-collapse').checked = !!cfg.autoCollapse; $('#lcp-collapse-s').value = cfg.collapseAfterSec;
        $('#lcp-max').value = cfg.maxStars;
        $('#lcp-golden').checked = !!cfg.golden;
        const m = cfg.manual || {};
        $('#lcp-man-on').checked = !!cfg.manualOn;
        $('#lcp-man').classList.toggle('off', !cfg.manualOn);
        $('#lcp-m-div').value = m.division || 'B2';
        $('#lcp-m-stars').value = m.stars ?? 0;
        $('#lcp-m-rank').value = m.rank ?? '';
        $('#lcp-m-need').value = m.need ?? '';
        $('#lcp-m-dl').value = m.deadline || '';
    }

    function onClick(e) {
        const b = e.target.closest('button');
        if (!b) return;
        const seg = b.closest('.lcp-seg, .lcp-skins');
        if (seg) {
            const key = { 'lcp-style': 'style', 'lcp-skin': 'skin', 'lcp-conv': 'convertMode' }[seg.id];
            if (key) { save({ [key]: b.dataset.v }); fill(); }
            return;
        }
        if (b.id === 'lcp-m-apply') { sendManual({ on: true }); return; }
        if (b.dataset.k) {
            fetch('/api/leaguecard/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: b.dataset.k }) }).catch(() => {});
        }
    }
    function onInput(e) {
        const t = e.target, id = t.id;
        if (id === 'lcp-man-on') { sendManual({ on: t.checked }); return; }
        if (id === 'lcp-enabled') save({ enabled: t.checked });
        else if (id === 'lcp-x') { save({ xPercent: +t.value }); $('#lcp-x-v').textContent = t.value + '%'; }
        else if (id === 'lcp-y') { save({ yPercent: +t.value }); $('#lcp-y-v').textContent = t.value + '%'; }
        else if (id === 'lcp-scale') { save({ scale: +t.value }); $('#lcp-scale-v').textContent = t.value + '%'; }
        else if (id === 'lcp-g1' || id === 'lcp-g2') save({ convertGifts: [$('#lcp-g1').value, $('#lcp-g2').value].filter(Boolean) });
        else if (id === 'lcp-danger' && e.type === 'change') save({ dangerMinutes: Math.max(1, +t.value || 30) });
        else if (id === 'lcp-rescuer') save({ rescuer: t.checked });
        else if (id === 'lcp-collapse') save({ autoCollapse: t.checked });
        else if (id === 'lcp-collapse-s' && e.type === 'change') save({ collapseAfterSec: +t.value || 20 });
        else if (id === 'lcp-max' && e.type === 'change') save({ maxStars: +t.value || 5 });
        else if (id === 'lcp-golden') save({ golden: t.checked });
    }

    function sendManual(extra) {
        const body = Object.assign({
            division: $('#lcp-m-div').value, stars: $('#lcp-m-stars').value, rank: $('#lcp-m-rank').value,
            need: $('#lcp-m-need').value, deadline: $('#lcp-m-dl').value,
        }, extra);
        fetch('/api/leaguecard/manual', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            .then((r) => r.json()).then((d) => {
                if (!d || !d.ok) return;
                cfg.manualOn = d.manualOn; cfg.manual = d.manual;
                $('#lcp-man').classList.toggle('off', !cfg.manualOn);
                showStatus(d.state);
                const btn = $('#lcp-m-apply'); if (btn && extra.on) { btn.textContent = '✓ Đã cập nhật'; setTimeout(() => { btn.textContent = 'Cập nhật lên OBS'; }, 1400); }
            }).catch(() => {});
    }

    function copyLink() {
        const btn = document.getElementById('btn-leaguecard-copy'), url = overlayUrl();
        const done = (ok) => { if (!btn) return; btn.textContent = ok ? '✓ Đã copy' : '⚠ Copy lỗi'; setTimeout(() => { btn.textContent = '📋 Link OBS'; }, 1500); };
        const legacy = () => { try { const ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(true); } catch (e) { done(false); } };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => done(true)).catch(legacy); else legacy();
    }

    function showStatus(s) {
        const el = $('#lcp-status'); if (!el) return;
        const l = s && s.league;
        if (!l) { el.textContent = 'Chưa nhận dữ liệu giải đấu từ TikTok — kết nối LIVE rồi chờ TikTok gửi bảng xếp hạng.'; el.classList.remove('live'); return; }
        const parts = [`Bậc <b>${esc(l.division || '?')}</b>`, `<b>${l.stars}</b> mảnh`];
        if (l.rank != null) parts.push(`hạng <b>#${l.rank}</b>`);
        if (l.need != null) parts.push(l.need > 0 ? `thiếu <b>${fmt(l.need)}</b> điểm` : 'đã giữ hạng');
        if (s.danger) parts.push('<b class="lcp-bad">⚠ sắp rớt</b>');
        el.innerHTML = '● ' + parts.join(' · ') + (l.source === 'manual' ? ' <small>(nhập tay)</small>' : ' <small>(từ TikTok)</small>');
        const needEl = $('#lcp-m-need');   // quà trừ dần → cập nhật ô "còn thiếu" (trừ khi đang gõ)
        if (l.source === 'manual' && needEl && document.activeElement !== needEl && l.need != null) needEl.value = l.need;
        el.classList.add('live');
    }

    async function open(socket) {
        if (!LC()) return;
        if (!built) build();
        try {
            const [games, list, st] = await Promise.all([
                fetch('/api/games').then((r) => r.json()),
                window.__giftSheet && window.__giftSheet.length ? Promise.resolve(window.__giftSheet) : fetch('/api/gifts').then((r) => r.json()).catch(() => []),
                fetch('/api/leaguecard/state').then((r) => r.json()).catch(() => null),
            ]);
            const g = (games || []).find((x) => x.id === GAME_ID);
            cfg = LC().normalizeCfg(g && g.config);
            gifts = Array.isArray(list) ? list : [];
            fill();
            pushPreview();
            showStatus(st && st.state);
        } catch (e) { console.warn('[leaguecard] mở panel lỗi:', e); }
        if (socket && socket !== socketRef) {
            socketRef = socket;
            socket.on('league:state', showStatus);
        }
    }

    window.HpLeagueCardPanel = { open };
})();
