/**
 * 🛒 Cửa sổ MUA GAME trong app — window.hpBuyGame(id). Spec docs/superpowers/specs/2026-10-29-mua-game-sepay-design.md §6.3.
 *
 * POST /api/shop/orders (tạo / dùng lại đơn ở HP KEY) → QR VietQR (server gửi các hàng "0101…", vẽ canvas — không nhận HTML từ
 * server) + ngân hàng / STK / nội dung (= mã đơn) có nút Sao chép. Trạng thái đơn đến qua socket 'shop:order' (window.hpSocket —
 * một bộ hỏi duy nhất ở server, lib/shop-orders.js). Trả xong → server xác thực KEY lại → ✅ + "Mở game ngay".
 * Đóng cửa sổ giữa chừng vẫn được: tiền tới thì toast "✅ Đã mở khoá …". Logic thuần: public/lib/shop-ui.js (HpShopUI).
 */
(function () {
    'use strict';
    const UI = window.HpShopUI;
    if (!UI) return;
    let ov = null;            // overlay DOM
    let cur = null;           // { id, item, order, pay }
    let checkUntil = 0;

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, k) => { if (typeof window.toast === 'function') window.toast(m, k || 'success', 3500); };
    const shopItem = (id) => (window.HpShop && window.HpShop.items && window.HpShop.items.get(id)) || null;
    const gameName = (id, item) => {
        const n = typeof window.hpGameName === 'function' ? window.hpGameName(id) : '';
        const cam = (window.HpCamGames || []).find((g) => g.id === id);
        return n || (cam && cam.name) || (item && item.name) || id;
    };

    function build() {
        if (ov) return ov;
        ov = document.createElement('div');
        ov.className = 'shop-ov';
        ov.hidden = true;
        ov.innerHTML = `
<div class="shop-card" role="dialog" aria-modal="true" aria-labelledby="shop-title">
  <div class="shop-head">
    <div><div class="shop-kicker">MỞ KHOÁ GAME</div><div class="shop-title" id="shop-title"></div>
      <div class="shop-sub">Mua một lần · dùng trọn đời với KEY này</div></div>
    <button type="button" class="shop-x" data-act="close" aria-label="Đóng">✕</button>
  </div>
  <div class="shop-body" data-pane="pay">
    <div class="shop-qr"><canvas width="264" height="264" aria-label="Mã QR chuyển khoản"></canvas><div class="shop-qr-cap">Quét bằng ứng dụng ngân hàng</div></div>
    <div class="shop-info">
      <div class="shop-row"><span>Số tiền</span><b data-f="amount"></b></div>
      <div class="shop-row"><span>Ngân hàng</span><b data-f="bank"></b></div>
      <div class="shop-row"><span>Chủ tài khoản</span><b data-f="holder"></b></div>
      <div class="shop-row"><span>Số tài khoản</span><b class="mono" data-f="acct"></b><button type="button" class="shop-copy" data-copy="acct">Sao chép</button></div>
      <div class="shop-row"><span>Nội dung</span><b class="mono" data-f="content"></b><button type="button" class="shop-copy" data-copy="content">Sao chép</button></div>
      <div class="shop-note">Chuyển <b>đúng số tiền</b> và giữ nguyên <b>nội dung</b>. Game tự mở khi nhận được tiền — đóng cửa sổ này vẫn được.</div>
      <div class="shop-status" data-tone="wait"><span class="shop-dot"></span><span data-f="status"></span></div>
      <div class="shop-actions"><button type="button" class="shop-btn" data-act="check">Tôi đã chuyển khoản · Kiểm tra</button></div>
    </div>
  </div>
  <div class="shop-body shop-msg" data-pane="msg" hidden>
    <div class="shop-msg-ico" data-f="msgIco">⏳</div>
    <div class="shop-msg-text" data-f="msgText"></div>
    <div class="shop-actions"><button type="button" class="shop-btn primary" data-act="retry" hidden>Thử lại</button>
      <button type="button" class="shop-btn primary" data-act="open" hidden>Mở game ngay</button>
      <button type="button" class="shop-btn" data-act="close">Đóng</button></div>
  </div>
</div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', (e) => {
            if (e.target === ov) return close();
            const a = e.target.closest('[data-act]');
            if (a) {
                const act = a.dataset.act;
                if (act === 'close') close();
                else if (act === 'check') check();
                else if (act === 'retry' && cur) start(cur.id);
                else if (act === 'open') openNow();
                return;
            }
            const c = e.target.closest('[data-copy]');
            if (c && cur && cur.pay) {
                const v = String(cur.pay[c.dataset.copy] || '');
                const done = typeof window.hpCopyText === 'function' ? window.hpCopyText(v) : (navigator.clipboard && navigator.clipboard.writeText(v), true);
                Promise.resolve(done).then(() => { c.textContent = 'Đã chép'; setTimeout(() => { c.textContent = 'Sao chép'; }, 1500); });
            }
        });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ov && !ov.hidden) close(); });
        return ov;
    }
    const $ = (sel) => ov.querySelector(sel);
    const f = (name) => ov.querySelector('[data-f="' + name + '"]');

    function showPane(name) {
        for (const p of ov.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== name;
    }
    function msg(ico, text, buttons) {
        showPane('msg');
        f('msgIco').textContent = ico;
        f('msgText').textContent = text;
        $('[data-act="retry"]').hidden = !(buttons && buttons.retry);
        $('[data-act="open"]').hidden = !(buttons && buttons.open);
    }
    function drawQr(rows) {
        const cv = $('canvas');
        const L = UI.qrLayout(rows, 264);
        const ctx = cv.getContext('2d');
        if (!L) { cv.width = cv.height = 264; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 264, 264); return; }
        cv.width = cv.height = L.size;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, L.size, L.size);
        ctx.fillStyle = '#000';
        for (let y = 0; y < L.n; y++) {
            const r = rows[y];
            for (let x = 0; x < L.n; x++) if (r.charCodeAt(x) === 49) ctx.fillRect((x + 4) * L.cell, (y + 4) * L.cell, L.cell, L.cell);
        }
    }
    function render() {
        if (!cur || !cur.order) return;
        const o = cur.order, p = cur.pay || {};
        const v = UI.statusView(o, { name: cur.name, pay: cur.pay });
        if (v.done) {
            msg('✅', v.text, { open: true });
            return;
        }
        if (v.final) { msg(o.status === 'expired' ? '⌛' : '⚠', v.text, { retry: o.status === 'expired' }); return; }
        showPane('pay');
        f('amount').textContent = UI.vnd(UI.due(o, cur.pay));
        f('bank').textContent = p.bank || '—';
        f('holder').textContent = p.holder || '—';
        f('acct').textContent = p.acct || '—';
        f('content').textContent = p.content || o.code;
        const st = $('.shop-status');
        st.dataset.tone = v.tone;
        f('status').textContent = v.text;
        if (p.qr) drawQr(p.qr);
        const btn = $('[data-act="check"]');
        btn.disabled = Date.now() < checkUntil;
    }

    async function start(id) {
        build();
        const item = shopItem(id);
        cur = { id, item, name: gameName(id, item), order: null, pay: null };
        $('#shop-title').textContent = cur.name + (item ? ' — ' + UI.vnd(item.price) : '');
        ov.hidden = false;
        msg('⏳', 'Đang tạo đơn…');
        let r;
        try {
            r = await (await fetch('/api/shop/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature: id }) })).json();
        } catch (e) { r = { ok: false, error: 'no_network' }; }
        if (!cur || cur.id !== id) return;
        if (!r || r.ok !== true || !r.order) {
            msg('⚠', UI.errorText(r), { retry: true });
            if (r && r.error === 'already_owned' && typeof window.hpReloadGames === 'function') window.hpReloadGames();
            return;
        }
        cur.order = r.order;
        cur.pay = r.pay || null;
        render();
    }
    async function check() {
        if (!cur || !cur.order || Date.now() < checkUntil) return;
        checkUntil = Date.now() + 10000;
        const btn = $('[data-act="check"]');
        btn.disabled = true;
        btn.textContent = 'Đang kiểm tra…';
        try {
            const r = await (await fetch('/api/shop/orders/' + encodeURIComponent(cur.order.code) + '/check', { method: 'POST' })).json();
            if (r && r.ok && r.order && cur && r.order.code === cur.order.code) {
                cur.order = { ...cur.order, ...r.order };
                if (r.pay) cur.pay = r.pay;
                if (r.order.status === 'pending') toast('Chưa thấy tiền về — ngân hàng có thể chậm vài phút. App tự kiểm tiếp.', 'info');
            }
        } catch (_) {}
        btn.textContent = 'Tôi đã chuyển khoản · Kiểm tra';
        render();
        setTimeout(render, 10100);
    }
    function close() {
        if (ov) ov.hidden = true;
        if (cur && cur.order && !['paid', 'cancelled', 'expired'].includes(cur.order.status)) {
            toast('Đơn ' + cur.order.code + ' vẫn chờ tiền — game tự mở khi nhận được.', 'info');
        }
    }
    async function openNow() {
        const c = cur;
        close();
        if (!c) return;
        const target = UI.openTarget(c.item || { id: c.id });
        const isCam = c.item && (c.item.parent === 'camgames' || c.item.parent === 'body');
        if (!isCam && target !== 'liveTranslate') {
            try { await fetch('/api/games/' + encodeURIComponent(target) + '/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true }) }); } catch (_) {}
        }
        if (typeof window.hpReloadGames === 'function') await window.hpReloadGames();
        if (typeof window.hpOpenGame === 'function') window.hpOpenGame(target);
    }

    // Trạng thái đơn từ server (một bộ hỏi duy nhất): cửa sổ đang mở đúng đơn → vẽ lại; đơn khác / cửa sổ đã đóng → toast khi mở khoá.
    function onOrder(d) {
        if (!d || !d.code) return;
        if (cur && cur.order && d.code === cur.order.code) {
            cur.order = { ...cur.order, ...d };
            if (d.due !== undefined && cur.pay) cur.pay = { ...cur.pay, amount: d.due };
            if (ov && !ov.hidden) render();
            else if (d.unlocked) toast('✅ Đã mở khoá ' + (cur.name || d.name) + ' — dùng trọn đời với KEY này!', 'success');
            return;
        }
        if (d.unlocked) toast('✅ Đã mở khoá ' + (d.name || d.feature) + ' — dùng trọn đời với KEY này!', 'success');
    }
    (function hook(tries) {
        if (window.hpSocket) { window.hpSocket.on('shop:order', onOrder); return; }
        if (tries < 50) setTimeout(() => hook(tries + 1), 200);
    })(0);

    window.hpBuyGame = (id) => { start(String(id || '')); };
})();
