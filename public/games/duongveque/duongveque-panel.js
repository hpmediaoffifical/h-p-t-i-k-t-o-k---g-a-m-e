/* ============================================================
   🛵 Đường Về Quê — Panel controller (app side)
   ============================================================
   - Cài đặt (khoá dvq*), phím streamer NHẢY / HÚC / BẮT ĐẦU (relay socket 'duongveque:key'), phím tắt toàn cục Electron.
   - 🎁 Gán quà → hành động 2 phe (dvqGiftMap theo giftId), bộ quà gợi ý ở data.json.
   - Lệnh overlay qua POST /api/games/duongveque/cmd (gameCmd): demo / start / reset / end / test.
   Danh sách hành động đọc chung public/games/duongveque/logic.js với overlay.
   Expose: window.HpDuongVeQuePanel.open(socket)
   ============================================================ */
(function () {
    'use strict';

    const GAME_ID = 'duongveque';
    const DEFAULTS = {
        enabled: true, dvqControl: 'auto', dvqStreamerName: '', dvqGoal: 0, dvqRoundSec: 240, dvqFinalSec: 30, dvqSpeed: 100,
        dvqFuelBurn: 3, dvqMeterPerCoin: 5, dvqLikePer: 300, dvqRamCd: 12, dvqDodgeMax: 10, dvqDefaultSide: 'cuu',
        dvqAutoNext: true, dvqVehicle: 'bus', dvqDriverSec: 180, dvqSeats: 14, dvqMaxCars: 5, dvqRestStop: true, dvqGasStop: true, dvqPolice: true, dvqPoliceLikes: 2000, dvqRoadEvents: true, dvqBike: 'green', dvqSound: true, dvqShowLegend: true, dvqPenalties: '',
        dvqKeyJump: 'F7', dvqKeyRam: 'F8', dvqKeyStart: 'F9', dvqGiftMap: {}
    };
    const BIKES = [['red', '🔴 Đỏ'], ['blue', '🔵 Xanh dương'], ['pink', '🩷 Hồng'], ['yellow', '🟡 Vàng'], ['green', '🟢 Xanh lá'], ['black', '⚫ Đen']];
    const GOALS = [[0, 'Tự theo thời gian ván (4 phút = 6 km, 10 phút = 15 km)'], [3000, 'Ngắn · 3 km (phòng ít quà)'], [6000, 'Vừa · 6 km'], [10000, 'Dài · 10 km'], [15000, 'Rất dài · 15 km']];

    let socket = null, cfg = null, actions = [], suggested = {}, initialized = false, pendingSave = null, demoOn = false;
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, k) => { if (typeof window.toast === 'function') window.toast(m, k || 'success', 2500); };

    function open(sharedSocket) {
        socket = sharedSocket || window.io();
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        $('#view-duongveque')?.classList.add('active');
        if (!initialized) { initialized = true; bindShell(); }
        load().then(render);
    }

    async function load() {
        try { const r = await fetch('/api/games/duongveque/config'); cfg = r.ok ? await r.json() : {}; } catch (e) { cfg = {}; }
        cfg = Object.assign({}, DEFAULTS, cfg || {});
        if (!cfg.dvqGiftMap || typeof cfg.dvqGiftMap !== 'object') cfg.dvqGiftMap = {};
        if (!actions.length) {
            try { const m = await import('/games/duongveque/logic.js'); actions = m.ACTIONS; } catch (e) { actions = []; }
            try { const r = await fetch('/games/duongveque/data.json'); if (r.ok) suggested = (await r.json()).suggestedGiftMap || {}; } catch (e) {}
        }
    }
    function schedulePersist() { clearTimeout(pendingSave); pendingSave = setTimeout(() => persist().catch(() => toast('Lưu thất bại', 'error')), 350); }
    async function persist() {
        clearTimeout(pendingSave);
        const r = await fetch('/api/games/duongveque/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
        if (!r.ok) throw new Error('save_fail');
    }
    async function cmd(name, payload) {
        try {
            const r = await fetch('/api/games/duongveque/cmd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd: name, payload: payload || {} }) });
            if (!r.ok) { const j = await r.json().catch(() => ({})); toast(j.message || 'Lệnh bị từ chối', 'error'); }
        } catch (e) { toast('Không gửi được lệnh', 'error'); }
    }
    const key = action => socket && socket.emit('duongveque:key', { action });

    // ---------------- thanh công cụ ----------------
    function bindShell() {
        $('#dvq-btn-copy')?.addEventListener('click', async () => {
            const url = window.buildOverlayURL ? window.buildOverlayURL('/overlay/duongveque') : location.origin + '/overlay/duongveque';
            try { await navigator.clipboard.writeText(url); toast('Đã copy link OBS (Browser Source 1080×1920)'); } catch (e) { prompt('Link OBS:', url); }
        });
        $('#dvq-btn-open')?.addEventListener('click', async () => {
            try {
                const r = await fetch('/api/duongveque/window/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                const j = await r.json().catch(() => ({}));
                toast(j.ok ? 'Đã mở cửa sổ game' : (j.error || 'Không mở được cửa sổ game'), j.ok ? 'success' : 'error');
            } catch (e) { toast('Không mở được cửa sổ game', 'error'); }
        });
        $('#dvq-btn-reload')?.addEventListener('click', () => { socket && socket.emit('overlay:reload', { gameId: GAME_ID }); toast('Đã gửi lệnh tải lại overlay'); });
        $('#dvq-btn-demo')?.addEventListener('click', e => { demoOn = !demoOn; e.currentTarget.classList.toggle('dvq-on', demoOn); e.currentTarget.textContent = demoOn ? '⏸ Tắt demo' : '▶ Demo'; cmd('demo', { on: demoOn }); });
        $('#dvq-btn-start')?.addEventListener('click', () => cmd('start'));
        $('#dvq-btn-reset')?.addEventListener('click', async () => {
            const ok = window.hpConfirm ? await window.hpConfirm('Làm mới: huỷ ván đang chạy, xoá điểm 2 phe và quay về màn chờ?') : confirm('Làm mới?');
            if (ok) cmd('reset');
        });
    }

    // ---------------- vẽ ----------------
    function render() { renderSettings(); renderControl(); renderGifts(); }

    function num(k, label, min, step, title) {
        return `<label class="dvq-row"><span${title ? ` title="${esc(title)}"` : ''}>${label}</span><input type="number" min="${min}" step="${step}" data-k="${k}" data-num="1" value="${esc(cfg[k])}"></label>`;
    }
    function sel(k, label, opts, isNum) {
        return `<label class="dvq-row"><span>${label}</span><select data-k="${k}"${isNum ? ' data-num="1"' : ''}>${opts.map(([v, n]) => `<option value="${esc(v)}"${String(cfg[k]) === String(v) ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
    }
    function renderSettings() {
        const host = $('#dvq-settings');
        if (!host) return;
        const goalOpts = GOALS.some(([v]) => v === Number(cfg.dvqGoal)) ? GOALS : GOALS.concat([[Number(cfg.dvqGoal), `${cfg.dvqGoal} m`]]);
        host.innerHTML = `
            <div class="nd-card-title">⚙ Cài đặt</div>
            ${sel('dvqControl', 'Ai lái', [['auto', '🤖 Tự lái: AI nhảy/húc thay, treo máy được (streamer bấm vẫn ăn)'], ['streamer', '🎮 Streamer tự bấm Nhảy / Húc']])}
            <label class="dvq-row"><span>Tên streamer trên xe</span><input type="text" maxlength="20" data-k="dvqStreamerName" placeholder="Streamer" value="${esc(cfg.dvqStreamerName)}"></label>
            ${sel('dvqVehicle', 'Loại xe', [['bus', '🚌 Xe buýt — chở cả đoàn người xem'], ['oxcart', '🐂 Xe bò có máng — chở cả đoàn'], ['scooter', '🛵 Xe máy — chỉ tài xế']])}
            ${sel('dvqBike', 'Màu xe', BIKES)}
            ${num('dvqDriverSec', '🧑‍✈️ Mỗi lượt tài xế (giây)', 30, 30, 'Tặng quà Lên làm tài xế → lái bấy nhiêu giây (tặng ×N = N lượt). Có người chờ thì hết giờ đổi người; không ai chờ → người đang lái giữ nguyên')}
            ${num('dvqSeats', '🧳 Số ghế hiện trên xe', 4, 1, 'Người bình luận 1 / tặng quà Cứu được lên xe (thấy đầu + vai trong cửa sổ). Đầy ghế thì nối thêm xe')}
            ${num('dvqMaxCars', '🚌 Đoàn xe tối đa (chiếc)', 1, 1, 'Đông người lên xe thì nối thêm xe phía sau, cả cảnh thu nhỏ lại cho vừa khung')}
            ${num('dvqPoliceLikes', '🚓 CSGT: số tim cần thả', 100, 100, 'Bị CSGT giữ: cả phòng thả đủ bấy nhiêu tim mới được đi. Quà Cứu lúc đó: 1 xu = 10 tim. Đồng hồ ván vẫn chạy, quá 45 giây thì được nhắc nhở cho đi')}
            ${sel('dvqGoal', 'Đường về quê dài', goalOpts, true)}
            ${num('dvqRoundSec', 'Giây một ván', 60, 30)}
            ${num('dvqFinalSec', '🔥 Nước rút ×2: bấy nhiêu giây cuối', 0, 5)}
            ${num('dvqMeterPerCoin', '1 xu = bấy nhiêu mét (đẩy tới / lùi)', 1, 1, 'Quà Cứu và quà Phá cùng giá triệt tiêu nhau. Tăng số này → quà tác dụng mạnh hơn, ván ngã ngũ nhanh hơn')}
            ${num('dvqSpeed', 'Tốc độ xe khi còn xăng (km/h)', 20, 10)}
            ${num('dvqFuelBurn', 'Xăng tụt mỗi giây (%)', 0, 0.2, '3 ≈ 33 giây chạy hết bình. Hết xăng 10 giây không ai đổ → dắt bộ')}
            ${num('dvqLikePer', '❤️ Đủ bấy nhiêu tim cả phòng → 1 cơn gió + xăng', 10, 10)}
            ${num('dvqRamCd', '💥 Hồi chiêu HÚC (giây)', 3, 1)}
            ${num('dvqDodgeMax', '⬆️ Vật cản ≤ bấy nhiêu xu thì nhảy né được', 0, 1)}
            ${sel('dvqDefaultSide', 'Quà chưa gán của người chưa chọn phe', [['cuu', '🛡️ tính cho phe Cứu'], ['pha', '⚔️ tính cho phe Phá']])}
            <div class="dvq-keys">
                <label>⬆️ Nhảy <input type="text" maxlength="24" data-k="dvqKeyJump" value="${esc(cfg.dvqKeyJump)}"></label>
                <label>💥 Húc <input type="text" maxlength="24" data-k="dvqKeyRam" value="${esc(cfg.dvqKeyRam)}"></label>
                <label>🏁 Bắt đầu <input type="text" maxlength="24" data-k="dvqKeyStart" value="${esc(cfg.dvqKeyStart)}"></label>
            </div>
            <div class="dvq-hint">Phím tắt toàn cục: bấm được cả khi đang mở TikTok Studio / OBS (vd <b>F7</b>, <b>F8</b>, <b>Control+Shift+J</b>). Để trống = không dùng.</div>
            <label class="dvq-row dvq-row-top"><span title="Phe Phá thắng → người tặng Phá nhiều nhất được chọn 1 hình phạt vui cho streamer (bốc ngẫu nhiên trong danh sách)">😈 Hình phạt khi phe Phá thắng<br><small>mỗi dòng 1 cái · trống = bộ mặc định</small></span><textarea rows="4" data-k="dvqPenalties" placeholder="Hát 1 câu bài Tết&#10;Hít đất 10 cái&#10;Đội nón lá nhảy 15 giây">${esc(cfg.dvqPenalties)}</textarea></label>
            <div class="dvq-checks">
                <label><input type="checkbox" data-k="dvqAutoNext"${cfg.dvqAutoNext !== false ? ' checked' : ''}> 🔁 Hết ván tự sang ván mới (bỏ tick = chờ streamer bấm Bắt đầu)</label>
                <label><input type="checkbox" data-k="dvqShowLegend"${cfg.dvqShowLegend !== false ? ' checked' : ''}> 🎁 Hiện 2 cột quà CỨU / PHÁ trên overlay</label>
                <label><input type="checkbox" data-k="dvqRestStop"${cfg.dvqRestStop !== false ? ' checked' : ''}> 🍜 Trạm dừng chân 30 giây (cả đoàn xuống ăn uống, đồng hồ ván dừng)</label>
                <label><input type="checkbox" data-k="dvqGasStop"${cfg.dvqGasStop !== false ? ' checked' : ''}> ⛽ Trạm xăng 15 giây (đổ đầy bình, đi vệ sinh)</label>
                <label><input type="checkbox" data-k="dvqPolice"${cfg.dvqPolice !== false ? ' checked' : ''}> 🚓 Thỉnh thoảng CSGT kiểm tra (thả tim mới được đi)</label>
                <label><input type="checkbox" data-k="dvqRoadEvents"${cfg.dvqRoadEvents !== false ? ' checked' : ''}> 🚂 Tình huống đường xá: kẹt xe, chắn tàu, đàn bò, thủng lốp, say xe, check-in, lì xì</label>
                <label><input type="checkbox" data-k="dvqSound"${cfg.dvqSound !== false ? ' checked' : ''}> 🔊 Âm thanh</label>
            </div>`;
        host.querySelectorAll('[data-k]').forEach(el => {
            el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
                const k = el.dataset.k;
                cfg[k] = el.type === 'checkbox' ? el.checked : el.dataset.num ? Number(el.value) || 0 : el.value;
                schedulePersist();
            });
        });
    }

    function renderControl() {
        const host = $('#dvq-control');
        if (!host) return;
        const cuu = actions.filter(a => a.side === 'cuu'), pha = actions.filter(a => a.side === 'pha');
        const tbtn = a => `<button class="ghost small" data-try="${esc(a.id)}">${esc(a.emoji)} ${esc(a.label)}</button>`;
        host.innerHTML = `
            <div class="nd-card-title">🎮 Streamer điều khiển</div>
            <div class="dvq-bigkeys">
                <button class="dvq-big" data-key="jump">⬆️ NHẢY<small>né vỏ chuối, ổ gà</small></button>
                <button class="dvq-big ram" data-key="ram">💥 HÚC<small>chó, đàn vịt, container</small></button>
                <button class="dvq-big start" data-key="start">🏁 BẮT ĐẦU<small>khi đang chờ ván</small></button>
            </div>
            <div id="dvq-pad" class="dvq-pad" tabindex="0"><div class="dvq-pad-tip">Bấm vào ô này rồi dùng <b>Space</b> = nhảy · <b>Enter</b> = húc · <b>S</b> = bắt đầu. Hoặc phím tắt toàn cục <b>${esc(cfg.dvqKeyJump || '—')}</b> / <b>${esc(cfg.dvqKeyRam || '—')}</b> / <b>${esc(cfg.dvqKeyStart || '—')}</b>.</div></div>
            <div class="dvq-hint">Xe tự chạy khi còn xăng. Quà <b>CỨU</b> đẩy xe tới / đổ xăng / che chắn, quà <b>PHÁ</b> thả vật cản / đẩy lùi. Mức tác dụng tính theo <b>xu</b> nên quà 2 phe cùng giá triệt tiêu nhau. Về tới cổng làng trước khi hết giờ → phe Cứu thắng. Bị đẩy lùi về tận nơi tập kết (quá vạch xuất phát ¼ quãng đường) hoặc hết giờ → phe Phá thắng.</div>
            <div class="nd-card-title" style="margin-top:8px">🧪 Thử nhanh (không cần LIVE)</div>
            <div class="dvq-cmds"><b class="dvq-side cuu">🛡️ Cứu</b>${cuu.map(tbtn).join('')}</div>
            <div class="dvq-cmds"><b class="dvq-side pha">⚔️ Phá</b>${pha.map(tbtn).join('')}</div>
            <div class="dvq-cmds"><b class="dvq-side" style="background:#2a2f3d;color:#ffe27a">🗺️ Dọc đường</b>
                ${[['rest', '🍜 Trạm dừng'], ['gas', '⛽ Trạm xăng'], ['police', '🚓 CSGT'], ['flat', '🛞 Thủng lốp'], ['train', '🚂 Chắn tàu'], ['cows', '🐄 Đàn bò'], ['jam', '🚗 Kẹt xe'], ['carsick', '🤢 Say xe'], ['photo', '📸 Check-in'], ['lixi', '🧧 Lì xì']].map(([k, n]) => `<button class="ghost small" data-event="${k}">${n}</button>`).join('')}
                <button class="ghost small" data-test="like1000">❤️ 1000 tim</button>
            </div>
            <div class="dvq-cmds">
                <button class="ghost small" data-test="like">❤️ 100 tim</button>
                <button class="ghost small" data-test="share">↗️ Chia sẻ</button>
                <button class="ghost small" data-test="follow">➕ Follow</button>
                <button class="ghost small" data-test="c1">💬 Bình luận 1</button>
                <button class="ghost small" data-test="c2">💬 Bình luận 2</button>
                <button class="ghost small" data-end="cuu">🏆 Cứu thắng ngay</button>
                <button class="ghost small" data-end="pha">😈 Phá thắng ngay</button>
            </div>`;
        host.querySelectorAll('[data-key]').forEach(b => b.addEventListener('click', () => key(b.dataset.key)));
        host.querySelectorAll('[data-try]').forEach(b => b.addEventListener('click', () => cmd('test', { kind: 'gift', action: b.dataset.try })));
        host.querySelectorAll('[data-end]').forEach(b => b.addEventListener('click', () => cmd('end', { winner: b.dataset.end })));
        host.querySelectorAll('[data-event]').forEach(b => b.addEventListener('click', () => cmd('event', { kind: b.dataset.event })));
        host.querySelectorAll('[data-test]').forEach(b => b.addEventListener('click', () => {
            const t = b.dataset.test;
            if (t === 'c1' || t === 'c2') cmd('test', { kind: 'comment', text: t === 'c1' ? '1' : '2' });
            else if (t === 'like1000') cmd('test', { kind: 'like', count: 1000 });
            else cmd('test', { kind: t });
        }));
        const pad = $('#dvq-pad');
        pad?.addEventListener('keydown', e => {
            const a = e.code === 'Space' || e.code === 'ArrowUp' ? 'jump' : e.code === 'Enter' || e.code === 'ArrowRight' ? 'ram' : e.code === 'KeyS' ? 'start' : null;
            if (!a || e.repeat) return;
            e.preventDefault(); key(a);
        });
    }

    // ---------------- 🎁 quà → hành động ----------------
    function renderGifts() {
        const host = $('#dvq-gifts');
        if (!host) return;
        const row = a => {
            const list = cfg.dvqGiftMap[a.id] || [];
            const chips = list.map((g, i) => `<span class="dvq-chip">${g.giftImage ? `<img src="${esc(g.giftImage)}">` : '🎁'}${esc(g.giftName || ('#' + g.giftId))}${g.coins ? `<small class="dvq-coin">${esc(g.coins)}💎</small>` : ''}<button class="dvq-x" data-a="${esc(a.id)}" data-i="${i}" title="Bỏ">✕</button></span>`).join('');
            return `<div class="dvq-grow">
                <div class="dvq-actname"><span class="dvq-emo">${esc(a.emoji)}</span><div><b>${esc(a.label)}</b><small>${Number.isFinite(a.min) ? `quà chưa gán ≥ ${a.min} xu` : "chỉ quà đã gán"}</small></div></div>
                <div class="dvq-chips">${chips}<button class="ghost small dvq-add" data-a="${esc(a.id)}">＋ Chọn quà</button></div>
                <button class="ghost small dvq-try" data-a="${esc(a.id)}" title="Thử trên overlay với người xem ảo">🧪</button>
            </div>`;
        };
        host.innerHTML = `
            <div class="dvq-giftbar"><div class="nd-card-title">🎁 Gán quà → hành động 2 phe</div><button class="ghost small" id="dvq-suggest" title="Gán lại toàn bộ theo bộ quà gợi ý (cặp quà cùng giá cho 2 phe)">🎁 Dùng bộ quà gợi ý</button></div>
            <div class="dvq-hint">Quà đã gán chạy đúng hành động đó, mức tác dụng theo giá xu của quà. Quà <b>chưa gán</b> → tính cho phe người tặng đã chọn (bình luận 1 / 2) và tự chọn hành động theo giá (cột "≥ xu"). Tặng ×N chạy đủ N lần. Quà lúc đang chờ ván không mất, chạy ngay khi ván bắt đầu.</div>
            <div class="dvq-giftcols">
                <div><div class="dvq-side cuu">🛡️ PHE CỨU — đẩy xe về quê</div>${actions.filter(a => a.side === 'cuu').map(row).join('')}</div>
                <div><div class="dvq-side pha">⚔️ PHE PHÁ — cản đường</div>${actions.filter(a => a.side === 'pha').map(row).join('')}</div>
            </div>`;
        host.querySelectorAll('.dvq-try').forEach(b => b.addEventListener('click', () => cmd('test', { kind: 'gift', action: b.dataset.a })));
        host.querySelector('#dvq-suggest')?.addEventListener('click', async () => {
            if (!Object.keys(suggested).length) { toast('Chưa có bộ quà gợi ý', 'error'); return; }
            const has = Object.keys(cfg.dvqGiftMap || {}).length > 0;
            const ok = !has || (window.hpConfirm ? await window.hpConfirm('Thay toàn bộ quà đang gán bằng bộ quà gợi ý?') : confirm('Thay toàn bộ quà đang gán bằng bộ quà gợi ý?'));
            if (!ok) return;
            cfg.dvqGiftMap = JSON.parse(JSON.stringify(suggested));
            renderGifts();
            persist().then(() => toast('Đã gán bộ quà gợi ý')).catch(() => toast('Lưu thất bại', 'error'));
        });
        host.querySelectorAll('.dvq-add').forEach(b => b.addEventListener('click', () => openPicker(b.dataset.a)));
        host.querySelectorAll('.dvq-x').forEach(b => b.addEventListener('click', () => {
            const arr = cfg.dvqGiftMap[b.dataset.a] || [];
            arr.splice(Number(b.dataset.i), 1);
            if (!arr.length) delete cfg.dvqGiftMap[b.dataset.a];
            renderGifts(); persist().catch(() => {});
        }));
    }

    // hộp chọn quà (dùng lại giao diện .nd-gp-* như Zombie Phá Nhà / Nhà Tù)
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
        const a = actions.find(x => x.id === actionId);
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
        const used = new Set((cfg.dvqGiftMap[pickerAction] || []).map(g => String(g.giftId)));
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
            Object.keys(cfg.dvqGiftMap).forEach(k => {   // 1 quà ↔ 1 hành động
                cfg.dvqGiftMap[k] = (cfg.dvqGiftMap[k] || []).filter(g => String(g.giftId) !== id);
                if (!cfg.dvqGiftMap[k].length) delete cfg.dvqGiftMap[k];
            });
            const sg = (Array.isArray(window.__giftSheet) ? window.__giftSheet : []).find(g => String(g.id) === id);
            (cfg.dvqGiftMap[pickerAction] = cfg.dvqGiftMap[pickerAction] || []).push({ giftId: id, giftName: r.dataset.gn, giftImage: r.dataset.gi, coins: sg ? sg.diamond || 0 : 0 });
            pickerEl.hidden = true;
            renderGifts(); persist().catch(() => toast('Lưu thất bại', 'error'));
        }));
    }

    window.HpDuongVeQuePanel = { open };
})();
