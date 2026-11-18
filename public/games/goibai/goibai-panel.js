// 🌐 hpT(): ngôn ngữ giao diện (overlays/lib/hp-i18n.js); trang chưa nạp thì giữ tiếng Việt (chỉ thay {biến}).
var hpT = (typeof globalThis !== 'undefined' && globalThis.hpT) || function (s, v) { return String(s).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, function (m, k) { return v && v[k] != null ? String(v[k]) : m; }); };
var hpTA = function (s, v) { return hpT(s, v).replace(/"/g, '&quot;'); };
/* 🎧 Gọi Bài — panel trong app. Tự chèn <section id="view-goibai"> (khuôn dacau-panel.js).
 * Cột trái: điều khiển + đang phát + hàng chờ + lượt + 🧪 giả lập. Cột phải: cài đặt (lưu debounce 350 ms qua
 * /api/games/goibai/config; echo gameConfig chỉ áp khi không phải bản vừa lưu) + yt-dlp + link OBS.
 * Trạng thái sống: socket 'goibai:state' (lib/goi-bai/controller.js publicState). */
(function () {
    'use strict';
    const $ = (sel, root) => (root || document).querySelector(sel);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmtTime = s => { s = Math.max(0, Math.round(Number(s) || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    const COIN = '<img class="hp-coin-ico" src="/coin.svg" alt="">';
    const REASON = { notfound: 'không tìm thấy', toolong: 'bài quá dài', blocked: 'dính từ cấm', playing: 'trùng bài đang phát', error: 'tìm lỗi', noengine: 'chưa có yt-dlp' };
    let cfg = null, st = null, socket = null, bound = false, persistTimer = null;

    function ensureView() {
        if ($('#view-goibai')) return $('#view-goibai');
        const host = $('.view').parentNode;
        const sec = document.createElement('section');
        sec.id = 'view-goibai'; sec.className = 'view game-view gob-view';
        sec.innerHTML = `
            <header class="game-header">
                <div><h2>${hpT('🎧 Gọi Bài')}</h2><div class="game-sub">${hpT('Tặng quà → gõ tên bài → phát ra loa')}</div></div>
                <div class="overlay-bar">
                    <label class="gob-switch" title="${hpTA('Bật/tắt Gọi Bài (tắt = xoá hàng chờ)')}"><input type="checkbox" id="gob-enabled"> <span>${hpT('Bật')}</span></label>
                    <button id="gob-btn-pause" class="ghost small" title="${hpTA('Tạm dừng / phát tiếp')}">⏯</button>
                    <button id="gob-btn-skip" class="ghost small" title="${hpTA('Bỏ bài đang phát')}">${hpT('⏭ Bỏ bài')}</button>
                    <button id="gob-btn-clear" class="danger small" title="${hpTA('Xoá hết hàng chờ và lượt')}">${hpT('Xoá hết')}</button>
                    <span class="nd-bar-spacer"></span>
                    <button id="gob-btn-obs" class="obs-link small" title="${hpTA('Thêm vào Scene đang chiếu — chưa nối OBS thì copy link')}">${hpT('Thêm vào OBS')}</button>
                    <button id="gob-btn-pop" class="ghost small" title="${hpTA('Mở overlay mẫu (dữ liệu giả)')}">${hpT('Xem mẫu')}</button>
                </div>
            </header>
            <div class="game-body gob-body">
                <div class="gob-status" id="gob-status"></div>
                <div class="gob-grid">
                    <div class="gob-col">
                        <div class="gob-box" id="gob-now"></div>
                        <div class="gob-box gob-duelbox" id="gob-duel" hidden></div>
                        <div class="gob-box"><div class="gob-h">${hpT('Hàng chờ')} <span id="gob-qn"></span></div><div id="gob-queue"></div></div>
                        <div class="gob-box" id="gob-passes-box"><div class="gob-h">${hpT('Lượt chờ gõ bài')}</div><div id="gob-passes"></div></div>
                        <div class="gob-box">
                            <div class="gob-h">${hpT('🧪 Thử')}</div>
                            <div class="gob-line"><input id="gob-t-nick" placeholder="${hpTA('Tên người xem')}" value="Người xem thử"><input id="gob-t-coins" type="number" min="1" value="1" title="${hpTA('Số xu')}" style="width:80px"></div>
                            <div class="gob-line"><input id="gob-t-song" placeholder="${hpTA('Tên bài (để trống = chỉ tạo lượt)')}" style="flex:1"></div>
                            <div class="gob-line"><button id="gob-t-call" class="primary small">${hpT('Gọi thử')}</button><button id="gob-t-music" class="ghost small" title="${hpTA('Giả lập quà 🎵 Ca khúc với tên bài ở trên')}">${hpT('Thử Ca khúc')}</button><span id="gob-t-msg" class="gob-muted"></span></div>
                            <div class="gob-line"><span class="gob-muted">${hpT('⚔️ Đấu Bài:')}</span><button id="gob-t-v1" class="ghost small" title="${hpTA('Người xem ở trên bình luận 1')}">${hpT('Bầu 1')}</button><button id="gob-t-v2" class="ghost small" title="${hpTA('Người xem ở trên bình luận 2')}">${hpT('Bầu 2')}</button><span class="gob-muted">${hpT('rồi Gọi thử để tặng quà cho bài đã bầu')}</span></div>
                        </div>
                    </div>
                    <div class="gob-col" id="gob-settings"></div>
                </div>
            </div>`;
        host.appendChild(sec);
        const css = document.createElement('style');
        css.textContent = `
            .gob-body { display: flex; flex-direction: column; gap: 10px; padding: 12px; min-height: 0; flex: 1; overflow: auto; }
            .gob-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 12px; align-items: start; }
            .gob-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
            .gob-box { border: 1px solid rgba(127,127,127,.28); border-radius: 12px; padding: 10px 12px; background: rgba(127,127,127,.06); }
            .gob-h { font-weight: 600; margin-bottom: 6px; display: flex; justify-content: space-between; gap: 8px; }
            .gob-muted { opacity: .65; font-size: 12px; }
            .gob-status { font-size: 13px; display: flex; flex-wrap: wrap; gap: 6px; }
            .gob-pill { padding: 3px 9px; border-radius: 99px; border: 1px solid rgba(127,127,127,.3); }
            .gob-pill.ok { border-color: #2fb36b; color: #2fb36b; } .gob-pill.bad { border-color: #e0644d; color: #e0644d; } .gob-pill.wait { border-color: #d39b16; color: #d39b16; }
            .gob-now { display: grid; grid-template-columns: 72px 1fr; gap: 10px; align-items: center; }
            .gob-now > img { width: 72px; height: 72px; border-radius: 10px; object-fit: cover; background: rgba(127,127,127,.2); }
            .gob-now b { display: block; font-size: 15px; } .gob-bar { height: 5px; border-radius: 4px; background: rgba(127,127,127,.25); margin-top: 6px; overflow: hidden; }
            .gob-bar i { display: block; height: 100%; background: #ff4f8b; }
            .gob-row { display: grid; grid-template-columns: 26px 1fr auto auto; gap: 8px; align-items: center; padding: 5px 0; border-top: 1px solid rgba(127,127,127,.15); }
            .gob-sc { font-style: normal; }
            .gob-row:first-child { border-top: 0; } .gob-row .t { min-width: 0; } .gob-row .t b, .gob-row .t span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .gob-row .t span { opacity: .65; font-size: 12px; } .gob-row .acts { display: flex; gap: 4px; }
            .gob-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 6px 0; }
            .gob-line > label:first-child { min-width: 150px; opacity: .85; }
            .gob-line input[type=number] { width: 80px; }
            .gob-gift { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
            .gob-gift img { width: 30px; height: 30px; object-fit: contain; } .gob-gift b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .gob-switch { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
            .gob-warn { color: #d39b16; font-size: 12px; }
            .gob-clip { margin-left: 6px; padding: 0 6px; border-radius: 6px; background: rgba(255,170,40,.18); color: #d39b16; font-size: 12px; font-weight: 600; }
            .gob-duelbox { border-color: rgba(255,120,60,.55); }
            .gob-duel-vs { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center; }
            .gob-duel-vs > div { min-width: 0; } .gob-duel-vs b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .gob-duel-vs .r { text-align: right; }
            .gob-duel-bar { display: flex; height: 6px; border-radius: 4px; overflow: hidden; margin-top: 6px; background: rgba(127,127,127,.2); }
            .gob-duel-bar i:first-child { background: #ff4f8b; } .gob-duel-bar i:last-child { background: #4f8bff; margin-left: auto; }
            @media (max-width: 900px) { .gob-grid { grid-template-columns: 1fr; } }`;
        document.head.appendChild(css);
        return sec;
    }

    // ── cấu hình ───────────────────────────────────────────────────────────
    async function loadConfig() {
        try { cfg = await fetch('/api/games/goibai/config', { cache: 'no-store' }).then(r => r.json()); } catch (e) { cfg = null; }
        cfg = cfg || {};
        if (!Array.isArray(cfg.gifts)) cfg.gifts = [];
        renderSettings();
    }
    function schedulePersist() { clearTimeout(persistTimer); persistTimer = setTimeout(persistConfig, 350); }
    async function persistConfig() {
        persistTimer = null;
        try { await fetch('/api/games/goibai/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) }); } catch (e) {}
    }
    const control = (cmd, extra) => fetch('/api/goibai/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ cmd }, extra || {})) }).catch(() => {});

    function numField(key, label, min, max, step, hint) {
        return `<div class="gob-line"><label>${label}</label><input type="number" data-k="${key}" min="${min}" max="${max}" step="${step || 1}" value="${esc(cfg[key])}">${hint ? `<span class="gob-muted">${hint}</span>` : ''}</div>`;
    }
    function renderSettings() {
        const box = $('#gob-settings');
        if (!box || !cfg) return;
        $('#gob-enabled').checked = cfg.enabled === true;
        const gifts = cfg.gifts.map((g, i) => `<div class="gob-gift" data-gid="${esc(g.giftId)}">${g.giftImage ? `<img src="${esc(g.giftImage)}" alt="">` : '🎁'}<b>${esc(g.giftName || ('#' + g.giftId))}</b><button class="ghost small" data-del="${i}" title="${hpTA('Bỏ quà này')}">✕</button></div>`).join('')
            || `<div class="gob-warn">${hpT('Chưa chọn quà — chỉ quà Ca khúc gọi được bài.')}</div>`;
        box.innerHTML = `
            <div class="gob-box"><div class="gob-h">${hpT('Quà gọi bài')}</div>${gifts}
                <div class="gob-line"><button class="ghost small" id="gob-add-gift">${hpT('＋ Thêm quà')}</button></div>
                <div class="gob-line"><label><input type="checkbox" data-c="songGifts" ${cfg.songGifts !== false ? 'checked' : ''}> ${hpT('🎵 Quà Ca khúc tự vào hàng')}</label></div>
            </div>
            <div class="gob-box"><div class="gob-h">${hpT('Luật')}</div>
                ${numField('countdownSec', hpT('Đếm ngược (giây)'), 5, 120)}
                ${numField('keepMin', hpT('Giữ lượt (phút)'), 0, 120, 1, hpT('đủ lâu cho người xem kịp gõ'))}
                ${numField('maxPerViewer', hpT('Tối đa / người'), 1, 10)}
                ${numField('maxSongSec', hpT('Bài dài nhất (giây)'), 60, 3600, 30)}
                ${numField('lockFirst', hpT('Khoá bài đầu'), 0, 10)}
                ${numField('waitBonus', hpT('Điểm / phút chờ'), 0, 10000, 5)}
            </div>
            <div class="gob-box"><div class="gob-h">${hpT('⚡ Đoạn hay nhất')}</div>
                <div class="gob-line"><label><input type="checkbox" data-c="clipOn" ${cfg.clipOn !== false ? 'checked' : ''}> ${hpT('Chỉ phát đoạn hay nhất (theo xu)')}</label></div>
                ${numField('clipShortSec', hpT('Dưới mốc 1 (giây)'), 15, 600, 5)}
                ${numField('clipMidCoins', hpT('Mốc 1 (xu)'), 1, 100000)}
                ${numField('clipLongSec', hpT('Từ mốc 1 (giây)'), 15, 1200, 5)}
                ${numField('clipFullCoins', hpT('Mốc 2 = cả bài (xu)'), 1, 1000000)}
                <div class="gob-muted">${hpT('Đoạn lấy theo chỗ người xem YouTube tua lại nhiều nhất. Bài không có dữ liệu → phát từ đầu. Tặng thêm khi đang phát → nối dài.')}</div>
            </div>
            <div class="gob-box"><div class="gob-h">${hpT('⚔️ Đấu Bài')}</div>
                <div class="gob-line"><label><input type="checkbox" data-c="duel" ${cfg.duel !== false ? 'checked' : ''}> ${hpT('2 bài kế tiếp đấu nhau, bài thắng phát trước')}</label></div>
                ${numField('duelSec', hpT('Thời gian trận (giây)'), 5, 60)}
                ${numField('duelVotePts', hpT('Điểm mỗi phiếu'), 0, 1000, 1, hpT('1 xu = 1 điểm'))}
                ${numField('duelSinkAfter', hpT('Thua liên tiếp → cuối hàng'), 0, 10, 1, hpT('0 = không'))}
                <div class="gob-line"><button class="obs-link small" id="gob-btn-obs-duel" title="${hpTA('Link OBS chỉ có thẻ Đấu Bài — đặt riêng trong Scene')}">${hpT('OBS: chỉ thẻ trận')}</button></div>
                <div class="gob-muted">${hpT('Mở trong lúc 1 bài đang phát. Người xem bình luận 1 / 2 (1 phiếu), tặng quà cho bài đã bầu.')}</div>
            </div>
            <div class="gob-box"><div class="gob-h">${hpT('Hiển thị')}</div>
                ${numField('listRows', hpT('Số dòng trên OBS'), 1, 15)}
                <div class="gob-line"><label><input type="checkbox" data-c="idleHint" ${cfg.idleHint !== false ? 'checked' : ''}> ${hpT('Hiện gợi ý khi hàng trống')}</label></div>
                <div class="gob-line"><label>${hpT('Âm lượng')}</label><input type="range" data-k="volume" min="0" max="100" value="${esc(cfg.volume ?? 70)}" style="flex:1"><span id="gob-vol">${esc(cfg.volume ?? 70)}%</span></div>
                <div class="gob-line"><label>${hpT('Phím tắt Bỏ bài')}</label><input data-t="hotkeySkip" placeholder="${hpTA('vd Control+Shift+N')}" value="${esc(cfg.hotkeySkip || '')}"></div>
                <div class="gob-line"><label>${hpT('Phím tắt Tạm dừng')}</label><input data-t="hotkeyPause" placeholder="${hpTA('vd Control+Shift+M')}" value="${esc(cfg.hotkeyPause || '')}"></div>
                <div class="gob-muted">${hpT('Phát ra loa Windows · OBS bắt qua Desktop Audio')}</div>
            </div>
            <div class="gob-box"><div class="gob-h">${hpT('Bộ tìm bài')}</div><div id="gob-ytdlp"></div></div>`;
        box.querySelectorAll('input[data-k]').forEach(el => el.addEventListener(el.type === 'range' ? 'input' : 'change', () => {
            cfg[el.dataset.k] = Number(el.value);
            if (el.dataset.k === 'volume') $('#gob-vol').textContent = el.value + '%';
            schedulePersist();
        }));
        box.querySelectorAll('input[data-c]').forEach(el => el.addEventListener('change', () => { cfg[el.dataset.c] = el.checked; schedulePersist(); }));
        box.querySelectorAll('input[data-t]').forEach(el => el.addEventListener('change', () => { cfg[el.dataset.t] = el.value.trim(); schedulePersist(); }));
        box.querySelectorAll('[data-del]').forEach(el => el.addEventListener('click', () => { cfg.gifts.splice(Number(el.dataset.del), 1); renderSettings(); schedulePersist(); }));
        $('#gob-add-gift').addEventListener('click', openGiftPicker);
        $('#gob-btn-obs-duel').addEventListener('click', () => {
            const url = window.buildOverlayURL('/overlay/goibai') + '?view=duel';
            if (window.hpObsQuick) { window.hpObsQuick(url, 'Gọi Bài — Đấu Bài'); return; }
            navigator.clipboard?.writeText(url);
        });
        renderYtdlp();
    }

    // ── trạng thái sống ────────────────────────────────────────────────────
    function renderYtdlp() {
        const el = $('#gob-ytdlp');
        if (!el || !st) return;
        const y = st.ytdlp || {};
        const label = y.state === 'downloading' ? hpT('Đang tải… {p}%', { p: y.progress || 0 })
            : y.installed ? hpT('yt-dlp {v}', { v: y.version || '?' }) : hpT('Chưa tải — bật game hoặc bấm Tải về');
        el.innerHTML = `<div class="gob-line"><span>${esc(label)}</span>
            <button class="ghost small" id="gob-yt-btn" ${y.state === 'downloading' ? 'disabled' : ''}>${y.installed ? hpT('Cập nhật') : hpT('Tải về')}</button></div>
            ${y.error ? `<div class="gob-warn">⚠ ${esc(y.error)}</div>` : ''}
            <div class="gob-muted">${hpT('Tải yt-dlp từ GitHub, có kiểm SHA-256. Tìm bài lỗi → Cập nhật.')}</div>`;
        $('#gob-yt-btn').addEventListener('click', () => fetch('/api/goibai/ytdlp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: y.installed ? 'update' : 'install' }) }));
    }
    function renderStatus() {
        const el = $('#gob-status');
        if (!el || !st) return;
        const y = st.ytdlp || {};
        const pills = [
            st.enabled ? `<span class="gob-pill ok">${hpT('Đang bật')}</span>` : `<span class="gob-pill">${hpT('Đang tắt')}</span>`,
            st.playerOnline ? `<span class="gob-pill ok">${hpT('Loa sẵn sàng')}</span>` : (st.enabled ? `<span class="gob-pill bad">${hpT('Chưa có trình phát')}</span> <a href="/player/goibai" target="_blank" rel="noopener">${hpT('Mở trình phát')}</a>` : ''),
            // Game tắt + chưa có yt-dlp: KHÔNG tô đỏ — bật game là app tự tải (người dùng từng tưởng là lỗi)
            y.installed ? `<span class="gob-pill ok">${hpT('Bộ tìm bài sẵn sàng')}</span>`
                : y.state === 'downloading' ? `<span class="gob-pill wait">${hpT('Đang tải bộ tìm bài {p}%', { p: y.progress || 0 })}</span>`
                : y.state === 'error' ? `<span class="gob-pill bad">${hpT('Tải bộ tìm bài lỗi')}</span>`
                : st.enabled ? `<span class="gob-pill bad">${hpT('Chưa có bộ tìm bài')}</span>`
                : `<span class="gob-pill">${hpT('Bộ tìm bài: tự tải khi bật')}</span>`,
            st.paused ? `<span class="gob-pill wait">${hpT('⏸ Tạm dừng')}</span>` : ''
        ].filter(Boolean);
        const busy = Array.isArray(st.hotkeyBusy) ? st.hotkeyBusy : [];
        el.innerHTML = pills.join(' ') + (st.lastError ? ` <span class="gob-warn">⚠ ${esc(st.lastError)}</span>` : '')
            + (busy.length ? ` <span class="gob-warn">⚠ ${esc(hpT('Phím {k} đang bị app khác giữ — đổi phím khác', { k: busy.join(', ') }))}</span>` : '');
    }
    function renderLive() {
        if (!st) return;
        renderStatus(); renderYtdlp();
        const p = st.playing;
        const c = p && p.clip && !p.clip.full ? p.clip : null;
        const from = c ? c.start : 0, to = c && c.end != null ? c.end : (p ? (p.dur || p.duration) : 0);
        $('#gob-now').innerHTML = p
            ? `<div class="gob-now"><img src="${esc(p.thumb || '')}" alt=""><div><b>${esc(p.title)}${c ? `<span class="gob-clip">⚡ ${esc(c.len)}s</span>` : ''}</b><span class="gob-muted">${esc(p.nickname)} · ${esc(p.coins)} ${COIN} · ${fmtTime(p.pos)} / ${c ? fmtTime(from) + '→' + fmtTime(to) : fmtTime(to)}</span><div class="gob-bar"><i style="width:${to > from ? Math.max(0, Math.min(100, ((p.pos || 0) - from) * 100 / (to - from))) : 0}%"></i></div></div></div>`
            : `<span class="gob-muted">${hpT('Chưa phát bài nào.')}</span>`;
        const d = st.duel, w = st.lastDuel, db = $('#gob-duel');
        db.hidden = !d && !w;
        if (d) {
            const left = Math.max(0, Math.ceil((d.endsAt - (st.now || Date.now())) / 1000));
            const tot = (d.a.pts || 0) + (d.b.pts || 0), wa = tot ? Math.round(d.a.pts * 100 / tot) : 50;
            db.innerHTML = `<div class="gob-h">${hpT('⚔️ Đấu Bài')} <span class="gob-muted">${hpT('còn {s} giây', { s: left })}</span></div>
                <div class="gob-duel-vs"><div><b>1 · ${esc(d.a.title)}</b><span class="gob-muted">${hpT('{p} điểm · {v} phiếu', { p: d.a.pts, v: d.a.votes })}</span></div><span>VS</span>
                <div class="r"><b>${esc(d.b.title)} · 2</b><span class="gob-muted">${hpT('{p} điểm · {v} phiếu', { p: d.b.pts, v: d.b.votes })}</span></div></div>
                <div class="gob-duel-bar"><i style="width:${wa}%"></i><i style="width:${100 - wa}%"></i></div>`;
        } else if (w) {
            db.innerHTML = `<div class="gob-h">${hpT('⚔️ Đấu Bài')}</div><div>🏆 <b>${esc(w.winnerTitle)}</b> ${hpT('thắng — phát tiếp theo')}${w.sunk ? ` <span class="gob-muted">${esc(hpT('· “{t}” về cuối hàng', { t: w.loserTitle }))}</span>` : ''}</div>`;
        }
        $('#gob-qn').textContent = st.queueTotal ? hpT('{n} bài', { n: st.queueTotal }) : '';
        const qHtml = (st.queue || []).map((r, i) => `<div class="gob-row"><span>${r.locked ? '🔒' : i + 1}</span>
            <div class="t"><b>${esc(r.status === 'searching' ? hpT('đang tìm “{q}”…', { q: r.query }) : r.title)}</b><span>${esc(r.nickname)}${r.backers && r.backers.length ? ' +' + r.backers.length : ''}${r.source === 'music' ? ' · 🎵' : ''}${r.sunk ? ' · ' + hpT('⬇ thua đấu') : ''} · <i class="gob-sc" data-sc="${esc(r.id)}">${hpT('{n} điểm', { n: r.score })}</i></span></div>
            <span>${esc(r.coins)} ${COIN}</span>
            <span class="acts"><button class="ghost small" data-top="${esc(r.id)}" title="${hpTA('Đưa lên đầu hàng')}">⏫</button><button class="ghost small" data-rm="${esc(r.id)}" title="${hpTA('Xoá khỏi hàng chờ')}">✕</button></span></div>`).join('')
            || `<span class="gob-muted">${hpT('Hàng chờ trống')}</span>`;
        const qEl = $('#gob-queue');
        const qSig = qHtml.replace(/<i class="gob-sc"[^>]*>[^<]*<\/i>/g, '');   // điểm chờ tăng mỗi 2 s → không tính vào chữ ký
        if (qEl.dataset.sig !== qSig) {   // trạng thái tới vài lần/giây khi đang phát → chỉ dựng lại khi hàng chờ thật sự đổi
            qEl.dataset.sig = qSig;
            qEl.innerHTML = qHtml;
            qEl.querySelectorAll('[data-top]').forEach(b => b.addEventListener('click', () => control('pinTop', { id: b.dataset.top })));
            qEl.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => control('remove', { id: b.dataset.rm })));
        } else {
            const byId = new Map((st.queue || []).map(r => [String(r.id), r]));
            qEl.querySelectorAll('[data-sc]').forEach(el => { const r = byId.get(el.dataset.sc); if (r) { const t = hpT('{n} điểm', { n: r.score }); if (el.textContent !== t) el.textContent = t; } });
        }
        const now = st.now || Date.now();   // giờ server lúc gửi trạng thái
        const passes = st.passes || [];
        $('#gob-passes-box').hidden = !passes.length;
        $('#gob-passes').innerHTML = passes.map(g => `<div class="gob-row" style="grid-template-columns:1fr auto"><div class="t"><b>${esc(g.nickname)} · ${esc(g.coins)} ${COIN}</b>
            <span>${g.note ? '⚠ ' + esc(hpT(REASON[g.note] || g.note)) + ' · ' : ''}${hpT('còn {m} phút', { m: Math.max(0, Math.ceil((g.validUntil - now) / 60000)) })}</span></div></div>`).join('');
    }

    // ── chọn quà (khung .nd-gp-* chung) ─────────────────────────────────────
    let picker = null;
    async function openGiftPicker() {
        if (!Array.isArray(window.__giftSheet) || !window.__giftSheet.length) {
            try { const r = await fetch('/api/gifts'); if (r.ok) window.__giftSheet = (await r.json()).slice().sort((a, b) => (a.diamond || 0) - (b.diamond || 0)); } catch (e) {}
        }
        if (!picker) {
            picker = document.createElement('div');
            picker.className = 'nd-gp-overlay'; picker.hidden = true;
            picker.innerHTML = `<div class="nd-gp-modal"><div class="nd-gp-head"><div class="nd-gp-title">${hpT('Chọn quà gọi bài')}</div><button class="nd-gp-close ghost small">✕</button></div>
                <input class="nd-gp-search" type="text" placeholder="${hpTA('Tìm quà hoặc ID…')}" /><div class="nd-gp-list"></div>
                <div class="nd-gp-hint">${hpT('Bấm vào quà để thêm. Quà đã chọn có dấu ✓.')}</div></div>`;
            document.body.appendChild(picker);
            picker.addEventListener('click', e => { if (e.target === picker) picker.hidden = true; });
            picker.querySelector('.nd-gp-close').addEventListener('click', () => { picker.hidden = true; });
            picker.querySelector('.nd-gp-search').addEventListener('input', e => renderPicker(e.target.value));
        }
        picker.hidden = false;
        picker.querySelector('.nd-gp-search').value = '';
        renderPicker('');
        setTimeout(() => picker.querySelector('.nd-gp-search').focus(), 30);
    }
    function renderPicker(filter) {
        const list = picker.querySelector('.nd-gp-list');
        const sheet = Array.isArray(window.__giftSheet) ? window.__giftSheet : [];
        const f = String(filter || '').toLowerCase().trim();
        const used = new Set(cfg.gifts.map(g => String(g.giftId)));
        const items = !f ? sheet : sheet.filter(g => (g.name || '').toLowerCase().includes(f) || String(g.id || '').includes(f));
        list.innerHTML = items.map(g => `
            <div class="nd-gp-row${used.has(String(g.id)) ? ' active' : ''}" data-gid="${esc(String(g.id))}" data-gn="${esc(g.name || '')}" data-gi="${esc(g.image || '')}">
                ${g.image ? `<img class="nd-gp-img" loading="lazy" decoding="async" src="${esc(g.image)}" />` : '<span class="nd-gp-icon">🎁</span>'}
                <span class="nd-gp-name">${esc(g.name || hpT('Quà #{id}', { id: g.id }))}</span><span class="nd-gp-dia">${g.diamond || 0}${COIN}</span>
                ${used.has(String(g.id)) ? '<span class="nd-gp-tick">✓</span>' : ''}</div>`).join('') || `<div class="nd-empty">${hpT('Không tìm thấy quà')}</div>`;
        list.querySelectorAll('.nd-gp-row').forEach(r => r.addEventListener('click', () => {
            if (used.has(r.dataset.gid)) return;
            cfg.gifts.push({ giftId: r.dataset.gid, giftName: r.dataset.gn, giftImage: r.dataset.gi });
            renderSettings(); schedulePersist();
            picker.hidden = true;
        }));
    }

    // ── khung ──────────────────────────────────────────────────────────────
    function bindShell() {
        $('#gob-enabled').addEventListener('change', e => { if (!cfg) return; cfg.enabled = e.target.checked; schedulePersist(); });
        $('#gob-btn-pause').addEventListener('click', () => control('togglePause'));
        $('#gob-btn-skip').addEventListener('click', () => control('skip'));
        $('#gob-btn-clear').addEventListener('click', async () => {
            const ok = window.hpConfirm ? await window.hpConfirm({ icon: '🎵', title: hpT('Xoá hết hàng chờ?'), body: hpT('Dừng bài đang phát, xoá hàng chờ và lượt chưa gõ. Không hoàn tác.'), okLabel: hpT('Xoá hết') }) : confirm(hpT('Xoá hết hàng chờ?'));
            if (ok) control('clear');
        });
        $('#gob-btn-obs').addEventListener('click', () => {
            const url = window.buildOverlayURL('/overlay/goibai');
            if (window.hpObsQuick) { window.hpObsQuick(url, 'Gọi Bài'); return; }
            navigator.clipboard?.writeText(url);
        });
        $('#gob-btn-pop').addEventListener('click', () => window.open(window.buildOverlayURL('/overlay/goibai') + '?demo=1', '_blank', 'width=540,height=960'));
        const test = async (music) => {
            const body = { nickname: $('#gob-t-nick').value, coins: Number($('#gob-t-coins').value) || 1, song: $('#gob-t-song').value, music: !!music };
            const msg = $('#gob-t-msg');
            try {
                const r = await fetch('/api/goibai/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(x => x.json());
                msg.textContent = r.ok ? (r.row ? hpT('Đang tìm bài…') : hpT('Đã tạo lượt — điền tên bài rồi thử lại')) : (r.error || hpT('Lỗi'));
            } catch (e) { msg.textContent = hpT('Lỗi kết nối server'); }
        };
        $('#gob-t-call').addEventListener('click', () => test(false));
        $('#gob-t-music').addEventListener('click', () => test(true));
        const vote = async (v) => {
            const msg = $('#gob-t-msg');
            try {
                const r = await fetch('/api/goibai/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname: $('#gob-t-nick').value, vote: v }) }).then(x => x.json());
                msg.textContent = r.ok ? hpT('Đã bầu bài {v}', { v }) : r.reason === 'voted' ? hpT('Người này đã bầu rồi') : (r.error || hpT('Lỗi'));
            } catch (e) { msg.textContent = hpT('Lỗi kết nối server'); }
        };
        $('#gob-t-v1').addEventListener('click', () => vote('1'));
        $('#gob-t-v2').addEventListener('click', () => vote('2'));
    }

    function open(sharedSocket) {
        socket = sharedSocket;
        const view = ensureView();
        document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v === view));
        if (!bound) { bindShell(); bound = true; }
        if (socket && !socket.__gobAttached) {
            socket.__gobAttached = true;
            socket.on('goibai:state', s => { st = s; if ($('#view-goibai.active')) renderLive(); });
            socket.on('gameConfig', ({ gameId, config }) => {
                if (gameId !== 'goibai' || persistTimer) return;
                cfg = Object.assign({}, config); if (!Array.isArray(cfg.gifts)) cfg.gifts = [];
                renderSettings();
            });
        }
        loadConfig();
        fetch('/api/goibai/state', { cache: 'no-store' }).then(r => r.json()).then(s => { st = s; renderLive(); }).catch(() => {});
    }

    window.HpGoiBaiPanel = { open };
})();
