/* 🔴 Săn Pokemon LIVE — màn cài đặt trong app.
   Game tự có bảng điều khiển riêng (trong overlay, ?panel=1): thử sự kiện, cấu hình quà & thưởng, link OBS, dọn ghế.
   Màn này chỉ hiện 2 link OBS + nút mở bảng điều khiển + đèn trạng thái, không trùng việc với overlay.
   Cấu hình lưu qua /api/games/pokemon/config (chung cho mọi overlay). */
(function () {
    const OVERLAY_PATH = '/overlay/pokemon';
    const GIFTS_PATH = '/overlay/pokemon-gifts';
    const base = () => location.origin;
    let mounted = false;

    const css = `
    .pokemon-panel { display: flex; flex-direction: column; gap: 14px; max-width: 760px; }
    .pokemon-card { background: #12151d; border: 1px solid #222a3a; border-radius: 12px; padding: 14px 16px; }
    .pokemon-card h3 { margin: 0 0 6px; font-size: 14px; color: #ffd166; }
    .pokemon-card p { margin: 0 0 10px; font-size: 12.5px; color: #aab2c5; line-height: 1.5; }
    .pokemon-link { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
    .pokemon-link label { width: 150px; font-size: 12px; color: #c8cee0; font-weight: 700; flex: none; }
    .pokemon-link input { flex: 1; min-width: 0; background: #0b0d12; border: 1px solid #2a3142; border-radius: 6px; color: #e6e8ee; padding: 6px 8px; font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
    .pokemon-link button { background: #1a1f2b; border: 1px solid #2a3142; border-radius: 6px; color: #e6e8ee; padding: 6px 10px; font-size: 12px; cursor: pointer; white-space: nowrap; }
    .pokemon-link button:hover { background: #232b3a; }
    .pokemon-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .pokemon-actions .primary { background: linear-gradient(90deg, #f59e0b, #ef4444, #a855f7); border: 0; color: #fff; font-weight: 800; padding: 9px 16px; border-radius: 8px; cursor: pointer; }
    .pokemon-actions .ghost { background: #1a1f2b; border: 1px solid #2a3142; color: #e6e8ee; padding: 9px 14px; border-radius: 8px; cursor: pointer; }
    .pokemon-steps { margin: 0; padding-left: 18px; font-size: 12.5px; color: #aab2c5; line-height: 1.7; }
    .pokemon-steps b { color: #ffd166; }
    .pokemon-status { font-size: 12px; color: #8b93a7; margin-top: 6px; }
    .pokemon-status.on { color: #34d399; }
    `;

    function copy(text, btn) {
        const done = (ok) => { if (!btn) return; const t = btn.textContent; btn.textContent = ok ? '✅ Đã copy' : '❌ Lỗi'; setTimeout(() => { btn.textContent = t; }, 1400); };
        const legacy = () => { try { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(true); } catch (_) { done(false); } };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => done(true)).catch(legacy); else legacy();
    }

    function render() {
        const host = document.getElementById('pokemon-panel');
        if (!host || mounted) return;
        mounted = true;
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
        const overlay = base() + OVERLAY_PATH;
        const gifts = base() + GIFTS_PATH;
        host.innerHTML = `
            <div class="pokemon-card">
                <h3>📺 Link OBS (Browser Source 1080×1920)</h3>
                <p>Game chạy ngay khi app nối phòng LIVE: tim, bình luận, chia sẻ, quà của người xem tự chảy vào game. Không cần cấu hình thêm trong app.</p>
                <div class="pokemon-link"><label>Màn chơi chính</label><input readonly value="${overlay}" /><button data-copy="${overlay}">📋 Copy</button><button data-open="${overlay}?panel=1">🪟 Mở</button></div>
                <div class="pokemon-link"><label>Bảng quà (nguồn riêng)</label><input readonly value="${gifts}" /><button data-copy="${gifts}">📋 Copy</button><button data-open="${gifts}">🪟 Mở</button></div>
                <div class="pokemon-status" id="pokemon-status">Đang kiểm tra trạng thái…</div>
            </div>
            <div class="pokemon-card">
                <h3>🎛 Bảng điều khiển game</h3>
                <p>Thử sự kiện (tim · chat 111 / 1-9 · tặng quà theo danh mục quà của app), cấu hình <b>quà → bóng</b> (bậc theo xu, quà đặc biệt, VIP, triệu hồi huyền thoại), link OBS, dọn ghế, xóa thống kê. Cấu hình lưu chung cho mọi overlay.</p>
                <div class="pokemon-actions">
                    <button class="primary" data-open="${overlay}?panel=1">🎛 MỞ BẢNG ĐIỀU KHIỂN</button>
                    <button class="ghost" data-test-gift>🎁 Thử tặng quà ngẫu nhiên</button>
                </div>
            </div>
            <div class="pokemon-card">
                <h3>🎮 Cách chơi (nói cho người xem)</h3>
                <ol class="pokemon-steps">
                    <li>Gõ <b>111</b> để vào ghế thi đấu (nhận 1 Poké Ball).</li>
                    <li>Táp tim: mỗi 10 tim = 1 cầu Lv.10, tự ném. Chia sẻ / theo dõi nhận 1 cầu Lv.20.</li>
                    <li>Mỗi quà = đúng 1 quả cầu; giá quà quyết định cấp cầu (bắt chắc Pokemon tới cấp đó): 1 xu Lv.10 · 5 xu Lv.20 · 10 xu Lv.25 · 20 xu Lv.30 · 30 xu Lv.35 · 99 xu Lv.40 · … · 5000 xu Lv.100 (Master Ball, bắt 100%).</li>
                    <li>Quà tạo sự kiện cho cả phòng: 50 xu mồi hiếm · 88-99 xu đổi thời tiết · 100 xu đổi lượt Pokemon · 199 xu đóng băng · 299 xu x2 điểm · 500 xu mưa cầu mọi ghế · 1000 xu triệu hồi Huyền Thoại.</li>
                    <li>Cả phòng xong hết nhiệm vụ → top 20 bảng xếp hạng nhận 1 cầu quý, nhiệm vụ làm lại. Người tặng quà được vinh danh trên màn.</li>
                    <li>Gõ <b>1</b>-<b>9</b> để khóa Pokemon muốn bắt. Bảng xếp hạng tuần tính theo điểm Pokemon bắt được.</li>
                </ol>
            </div>`;
        host.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copy(b.dataset.copy, b)));
        host.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => window.open(b.dataset.open, '_blank', 'width=560,height=996')));
        host.querySelector('[data-test-gift]')?.addEventListener('click', () => {
            fetch('/api/test-gift', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
        });
        document.getElementById('btn-pokemon-copy')?.addEventListener('click', (e) => copy(overlay, e.currentTarget));
        document.getElementById('btn-pokemon-pop')?.addEventListener('click', () => window.open(overlay, '_blank', 'width=540,height=960'));
    }

    function refreshStatus() {
        const el = document.getElementById('pokemon-status');
        if (!el) return;
        fetch('/api/games/pokemon/config').then((r) => r.ok ? r.json() : null).then((cfg) => {
            if (!cfg) { el.textContent = 'Chưa đọc được cấu hình game.'; el.classList.remove('on'); return; }
            const tiers = Array.isArray(cfg.tiers) ? cfg.tiers.length : 0;
            const specials = Array.isArray(cfg.specials) ? cfg.specials.filter((s) => s && s.enabled !== false).length : 0;
            el.textContent = `Game ${cfg.enabled === false ? 'đang TẮT' : 'đang BẬT'} · ${tiers} bậc xu · ${specials} quà đặc biệt · cấu hình lưu chung trong app.`;
            el.classList.toggle('on', cfg.enabled !== false);
        }).catch(() => { el.textContent = 'Chưa đọc được cấu hình game.'; });
    }

    window.HpPokemonPanel = {
        open() { render(); refreshStatus(); }
    };
})();
