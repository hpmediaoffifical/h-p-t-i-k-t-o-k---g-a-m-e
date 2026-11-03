/* 🔴 Săn Pokemon LIVE — màn cài đặt trong app.
   Bảng điều khiển của game (/overlay/pokemon?panel=1) là điều khiển TỪ XA: thử sự kiện, thời tiết, dọn ghế… gửi lệnh
   POST /api/games/pokemon/cmd → gameCmd → overlay OBS làm (không chạy bản game thứ 2 trong cửa sổ đó).
   Màn này chỉ hiện 2 link OBS + nút mở bảng điều khiển + đèn trạng thái, không trùng việc với overlay.
   Cấu hình lưu qua /api/games/pokemon/config (chung cho mọi overlay). */
(function () {
    const OVERLAY_PATH = '/overlay/pokemon';
    // ?obs=1: ẩn nút ⚙, không chạy người xem giả. ?mute=1: cửa sổ xem trước trong app không kêu đôi với OBS.
    const OBS_QUERY = '?obs=1';
    const PREVIEW_QUERY = '?mute=1';
    const PANEL_QUERY = '?panel=1';
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
        const overlay = base() + OVERLAY_PATH + OBS_QUERY;
        const preview = base() + OVERLAY_PATH + PREVIEW_QUERY;
        const panel = base() + OVERLAY_PATH + PANEL_QUERY;
        const gifts = base() + GIFTS_PATH;
        host.innerHTML = `
            <div class="pokemon-card">
                <h3>📺 Link OBS (Browser Source 1080×1920)</h3>
                <p>Game chạy ngay khi app nối phòng LIVE: tim, bình luận, chia sẻ, quà của người xem tự chảy vào game. Không cần cấu hình thêm trong app. Link đã kèm <b>?obs=1</b>: không có nút ⚙ và người xem giả trên sóng.</p>
                <div class="pokemon-link"><label>Màn chơi chính</label><input readonly value="${overlay}" /><button data-copy="${overlay}">📋 Copy</button><button data-open="${preview}" title="Xem trước (tắt tiếng)">🪟 Mở</button></div>
                <div class="pokemon-link"><label>Bảng quà (nguồn riêng)</label><input readonly value="${gifts}" /><button data-copy="${gifts}">📋 Copy</button><button data-open="${gifts}">🪟 Mở</button></div>
                <div class="pokemon-status" id="pokemon-status">Đang kiểm tra trạng thái…</div>
            </div>
            <div class="pokemon-card">
                <h3>🎛 Bảng điều khiển game</h3>
                <p>Thử sự kiện (tim · chat 111 / 1-9 · tặng quà theo danh mục quà của app), cấu hình <b>quà → bóng</b> (bậc theo xu, quà đặc biệt, VIP, triệu hồi huyền thoại), link OBS, dọn ghế, xóa thống kê. Mọi nút <b>gửi thẳng tới overlay OBS</b> đang mở. Cấu hình lưu chung cho mọi overlay.</p>
                <div class="pokemon-actions">
                    <button class="primary" data-open="${panel}">🎛 MỞ BẢNG ĐIỀU KHIỂN</button>
                    <button class="ghost" data-test-gift title="Chỉ gửi tới game Săn Pokemon">🎁 Thử tặng quà ngẫu nhiên</button>
                </div>
            </div>
            <div class="pokemon-card">
                <h3>🎮 Cách chơi (nói cho người xem)</h3>
                <ol class="pokemon-steps">
                    <li>Gõ <b>111</b> để vào ghế thi đấu (nhận 1 Poké Ball).</li>
                    <li>Táp tim: mỗi 30 tim = 1 cầu Lv.6, tự ném. Chia sẻ (mỗi người 2 phút/lần) / theo dõi nhận 1 cầu Lv.20.</li>
                    <li>Mỗi quà = đúng 1 quả cầu; giá quà quyết định cấp cầu (cầu đủ cấp bắt ≥ 90%): 1 xu Lv.12 · 5 xu Lv.20 · 10 xu Lv.25 · 20 xu Lv.30 · 30 xu Lv.35 · 99 xu Lv.40 · … · 5000 xu Lv.100 (Master Ball, bắt 100%). Bóng quà được ném trước bóng tim.</li>
                    <li>Quà tạo sự kiện cho cả phòng: 50 xu mồi hiếm · 88-99 xu đổi thời tiết · 100 xu đổi lượt Pokemon · 199 xu đóng băng · 299 xu x2 điểm · 500 xu mưa cầu mọi ghế · 1000 xu triệu hồi Huyền Thoại.</li>
                    <li>Cả phòng xong hết nhiệm vụ → top 3 bảng xếp hạng nhận 1 cầu quý Lv.85, hạng 4-20 nhận cầu Lv.40, nhiệm vụ làm lại (tối đa 3 vòng/ngày). Người tặng quà được vinh danh trên màn.</li>
                    <li>Quà triệu hồi Huyền Thoại: con đó khoá 10 giây cho người tặng, bóng của quà tự nhắm vào nó. Huyền Thoại tự nhiên rất hiếm (0,5%).</li>
                    <li>Thời tiết (tự đổi mỗi 2 phút, quà 88-99 xu đổi ngay): hệ hợp trời ra nhiều gấp 3 và dễ bắt hơn — Nắng: Lửa/Cỏ/Đất · Mưa: Nước/Điện/Bọ · Tuyết: Băng/Thép/Tiên.</li>
                    <li>Màn chơi chia theo vùng TikTok không che: dải luật / Top 3 / nhiệm vụ / gợi ý quà xoay vòng trên đầu sân, ghế nổi bật ngay dưới sân, phần dưới cùng để trống cho khung bình luận.</li>
                    <li><b>⚔️ Tranh Huyền Thoại</b> (mỗi 5 phút, hoặc quà ≥ 300 xu mở ngay): gõ <b>tranh</b> để đăng ký miễn phí (1 vé; tim tối đa 5 vé; chia sẻ/theo dõi 3 vé). <b>Quà mới quyết định: 1 xu = 1 vé, Hoa hồng (quà chỉ định) ×3, 10 giây cuối ×2.</b> Hết giờ quay số theo vé — nhiều vé cơ hội cao nhưng không chắc thắng; ai thua mà đã tặng được 🍀 bùa may mắn cho trận sau.</li>
                    <li><b>👑 Hạng vinh danh</b> theo xu tặng trong tuần: Đồng 10 · Bạc 100 · Vàng 500 · Bạch Kim 2.000 · Kim Cương 10.000 xu — có khung, chip hạng và được giữ chỗ trên dải ghế lâu hơn.</li>
                    <li>Gõ <b>1</b>-<b>9</b> để khóa Pokemon muốn bắt. Bảng xếp hạng tuần tính theo điểm Pokemon bắt được.</li>
                </ol>
            </div>`;
        host.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copy(b.dataset.copy, b)));
        host.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => window.open(b.dataset.open, '_blank', 'width=560,height=996')));
        host.querySelector('[data-test-gift]')?.addEventListener('click', () => {
            // Chỉ game Pokemon nhận (lệnh sim trên overlay), không phát quà thử cho mọi game khác như /api/test-gift.
            fetch('/api/games/pokemon/cmd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd: 'sim', payload: { kind: 'gift' } }) }).catch(() => {});
        });
        document.getElementById('btn-pokemon-copy')?.addEventListener('click', (e) => copy(overlay, e.currentTarget));
        document.getElementById('btn-pokemon-pop')?.addEventListener('click', () => window.open(preview, '_blank', 'width=540,height=960'));
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
