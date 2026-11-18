/* 🔨 Đấu Giá — bộ vẽ overlay 2.5D (dùng chung overlay OBS + khung xem trước ?demo=1).
   Luật nằm ở server (lib/dau-gia.js); file này CHỈ vẽ snapshot nhận qua socket 'daugia:state'.
   - Khung dựng 1 lần theo pha (live/tie ↔ done); quà mới chỉ CẬP NHẬT tại chỗ: hàng giữ theo id, trượt
     tới vị trí mới (transform), số xu chạy dần → ảnh đại diện không tải lại, thanh tỉ lệ chạy mượt.
   - Đồng hồ tự đếm từ endsAt (bù lệch giờ bằng serverNow) — server không đẩy mỗi giây.
   - Hình vẽ bằng SVG/CSS (búa gỗ đai đồng, khối gõ, thùng rác kim loại, vòng nguyệt quế) — không ảnh ngoài. */
(function (root) {
    'use strict';

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
    const HUES = [12, 38, 160, 200, 262, 320, 95, 280];
    function hue(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return HUES[h % HUES.length]; }
    function initials(name) {
        const w = String(name || '?').replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).filter(Boolean);
        const s = w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2);
        return s.toLocaleUpperCase('vi');
    }
    function avatarInner(p) {
        const fb = `<span class="dg-ava-fb" style="--h:${hue(p.id)}">${esc(initials(p.name))}</span>`;
        return p.avatar ? fb + `<img src="${esc(p.avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : fb;
    }
    function clock(ms) {
        const s = Math.max(0, Math.ceil(ms / 1000));
        const m = Math.floor(s / 60);
        return m > 0 ? m + ':' + String(s % 60).padStart(2, '0') : String(s);
    }

    // ===== Hình SVG dùng chung (id gradient có tiền tố dg- để không đụng trang khác) =====
    const DEFS = `
<svg class="dg-defs" width="0" height="0" aria-hidden="true"><defs>
  <linearGradient id="dg-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a2a10"/><stop offset=".28" stop-color="#b8692f"/><stop offset=".5" stop-color="#e09a55"/><stop offset=".72" stop-color="#a65a26"/><stop offset="1" stop-color="#4a210c"/></linearGradient>
  <linearGradient id="dg-wood-h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4a210c"/><stop offset=".35" stop-color="#c47838"/><stop offset=".55" stop-color="#e3a462"/><stop offset="1" stop-color="#5a2a10"/></linearGradient>
  <linearGradient id="dg-brass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4c4"/><stop offset=".35" stop-color="#f0c24b"/><stop offset=".65" stop-color="#b07b16"/><stop offset="1" stop-color="#6e4806"/></linearGradient>
  <linearGradient id="dg-brass-h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7a520c"/><stop offset=".4" stop-color="#ffe9a0"/><stop offset=".6" stop-color="#e2ad34"/><stop offset="1" stop-color="#6e4806"/></linearGradient>
  <linearGradient id="dg-steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3b434b"/><stop offset=".22" stop-color="#8d99a4"/><stop offset=".42" stop-color="#e3eaf0"/><stop offset=".6" stop-color="#9aa6b1"/><stop offset="1" stop-color="#363d44"/></linearGradient>
  <radialGradient id="dg-hole" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#0b0d10"/><stop offset="1" stop-color="#2a3036"/></radialGradient>
  <linearGradient id="dg-leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0a8"/><stop offset=".5" stop-color="#e8b33a"/><stop offset="1" stop-color="#8a5c0e"/></linearGradient>
</defs></svg>`;

    // Búa: đầu gỗ nằm ngang có 2 đai đồng + cán. Tâm xoay ở chuôi cán (cuối) để vung xuống.
    const GAVEL = `
<svg class="dg-gavel-svg" viewBox="0 0 220 220" aria-hidden="true">
  <g class="dg-gavel-arm">
    <rect x="98" y="62" width="22" height="150" rx="11" fill="url(#dg-wood-h)"/>
    <rect x="96" y="70" width="26" height="12" rx="4" fill="url(#dg-brass-h)"/>
    <rect x="98" y="196" width="22" height="16" rx="8" fill="url(#dg-brass-h)"/>
    <rect x="22" y="14" width="174" height="62" rx="18" fill="url(#dg-wood)"/>
    <rect x="22" y="14" width="174" height="62" rx="18" fill="none" stroke="#2c1205" stroke-opacity=".5" stroke-width="2"/>
    <rect x="44" y="11" width="16" height="68" rx="5" fill="url(#dg-brass)"/>
    <rect x="158" y="11" width="16" height="68" rx="5" fill="url(#dg-brass)"/>
    <rect x="30" y="20" width="158" height="9" rx="4.5" fill="#fff" fill-opacity=".22"/>
  </g>
</svg>`;
    // Khối gõ tròn (trụ gỗ thấp) — búa đập vào đây lúc chốt.
    const BLOCK = `
<svg class="dg-block-svg" viewBox="0 0 200 80" aria-hidden="true">
  <ellipse cx="100" cy="58" rx="92" ry="18" fill="#000" fill-opacity=".35"/>
  <path d="M10 34 v14 a90 18 0 0 0 180 0 v-14 z" fill="url(#dg-wood-h)"/>
  <ellipse cx="100" cy="34" rx="90" ry="18" fill="url(#dg-wood)"/>
  <ellipse cx="100" cy="34" rx="62" ry="11" fill="none" stroke="#2c1205" stroke-opacity=".35" stroke-width="2"/>
  <ellipse cx="100" cy="30" rx="70" ry="8" fill="#fff" fill-opacity=".14"/>
</svg>`;
    // Thùng rác kim loại hình trụ có gân + nắp bản lề trái.
    const BIN = `
<svg class="dg-bin-svg" viewBox="0 0 140 170" aria-hidden="true">
  <ellipse cx="70" cy="160" rx="58" ry="9" fill="#000" fill-opacity=".4"/>
  <path d="M18 48 L30 152 a40 10 0 0 0 80 0 L122 48 z" fill="url(#dg-steel)"/>
  <g stroke="#2b3238" stroke-opacity=".45" stroke-width="3">
    <path d="M42 56 L48 150"/><path d="M58 58 L61 154"/><path d="M82 58 L79 154"/><path d="M98 56 L92 150"/>
  </g>
  <ellipse cx="70" cy="48" rx="52" ry="12" fill="url(#dg-hole)"/>
  <ellipse cx="70" cy="48" rx="52" ry="12" fill="none" stroke="#c9d3db" stroke-width="4"/>
  <g class="dg-bin-lid">
    <ellipse cx="70" cy="40" rx="58" ry="13" fill="url(#dg-steel)"/>
    <ellipse cx="70" cy="37" rx="54" ry="10" fill="#fff" fill-opacity=".18"/>
    <rect x="55" y="20" width="30" height="12" rx="6" fill="url(#dg-steel)"/>
  </g>
</svg>`;
    function laurel() {
        let leaves = '';
        for (let side = -1; side <= 1; side += 2) {
            for (let i = 0; i < 8; i++) {
                // θ tính từ đáy vòng (0°) đi ngược lên 2 bên; lá nằm theo tiếp tuyến, chĩa lên trên.
                const deg = 22 + i * 16, a = deg * Math.PI / 180;
                const x = 120 + side * Math.sin(a) * 104, y = 120 + Math.cos(a) * 104;
                const rot = side * deg;
                leaves += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="9" ry="22" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})" fill="url(#dg-leaf)" stroke="#6b4508" stroke-opacity=".4"/>`;
            }
        }
        return `<svg class="dg-laurel" viewBox="0 0 240 240" aria-hidden="true">${leaves}</svg>`;
    }
    const LAUREL = laurel();

    function createRenderer(el, opts) {
        const o = opts || {};
        let cfg = { enabled: true, rows: 5, xPercent: 50, yPercent: 6, scale: 100, trashOn: true };
        let st = null, skew = 0, view = '', lastExtend = 0, doneKey = '', timer = null;
        const rowEls = new Map();   // id → { el, coins, shown }
        const ROW_H = 96;

        el.classList.add('dg-root');
        el.innerHTML = DEFS + '<div class="dg-beams"><i></i><i></i></div><div class="dg-board"><div class="dg-plate"></div></div>';
        const plate = el.querySelector('.dg-plate');
        const board = el.querySelector('.dg-board');

        function place() {
            const sc = (Number(cfg.scale) || 100) / 100 * (o.baseScale || 1);
            el.style.left = (Number(cfg.xPercent) || 50) + '%';
            el.style.top = (Number(cfg.yPercent) || 0) + '%';
            el.style.transform = `translateX(-50%) scale(${sc})`;
        }
        const visible = () => cfg.enabled !== false && st && st.phase !== 'idle';

        function phaseLabel(s) {
            if (s.phase === 'live') return 'Đang trả giá';
            if (s.phase === 'tie') return `Hiệp phụ ${s.tieRound}/${s.rules ? s.rules.tieRounds : s.tieRound} · đang hoà`;
            return 'Đã chốt';
        }
        function hint(s) {
            const r = s.rules || {};
            if (s.phase !== 'live' && s.phase !== 'tie') return '';
            if (r.snipeOn && s.extendCount < r.snipeMax) return `Giành đầu bảng ở ${r.snipeWindowSec}s cuối → +${r.snipeAddSec}s`;
            if (s.phase === 'live' && r.tieSec > 0 && r.tieRounds > 0) return `Hoà đầu bảng → hiệp phụ ${r.tieSec}s`;
            return '';
        }

        // ---------- Khung pha ĐANG TRẢ GIÁ ----------
        function buildLive() {
            rowEls.clear();
            plate.innerHTML = `
<div class="dg-head">
  <div class="dg-ribbon"><span>ĐẤU GIÁ</span></div>
  <div class="dg-title"></div>
  <div class="dg-phase"></div>
</div>
<div class="dg-dial">
  <svg viewBox="0 0 120 120"><circle class="rim" cx="60" cy="60" r="56"/><circle class="trk" cx="60" cy="60" r="47"/><circle class="arc" cx="60" cy="60" r="47"/></svg>
  <span class="dg-time">0</span><span class="dg-plus"></span>
</div>
<div class="dg-gavel">${GAVEL}</div>
<div class="dg-hint"></div>
<div class="dg-rows"></div>
<div class="dg-empty">Tặng quà bất kỳ để trả giá — quà càng nhiều xu càng lên cao</div>
<div class="dg-foot"></div>`;
        }

        function tween(node, from, to) {
            if (from === to) { node.textContent = fmt(to); return; }
            const t0 = performance.now(), dur = 600, tok = (node._tw = (node._tw || 0) + 1);
            const step = (t) => {
                if (node._tw !== tok) return;   // có lượt chạy mới hơn
                const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
                node.textContent = fmt(from + (to - from) * e);
                if (k < 1 && node.isConnected) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
            // rAF bị hãm (nguồn OBS ẩn / trang nền) → số kẹt giữa chừng; luôn chốt số cuối bằng hẹn giờ.
            setTimeout(() => { if (node._tw === tok) node.textContent = fmt(to); }, dur + 80);
        }

        function updateLive(s) {
            plate.querySelector('.dg-title').textContent = s.title || 'Món đặc biệt';
            plate.querySelector('.dg-phase').textContent = phaseLabel(s);
            const h = hint(s);
            const hn = plate.querySelector('.dg-hint');
            hn.textContent = h; hn.hidden = !h;
            plate.querySelector('.dg-foot').textContent = `${fmt(s.bidders)} người trả giá · tổng ${fmt(s.total)} xu`;
            board.classList.toggle('is-tie', s.phase === 'tie');

            const n = Math.max(3, Math.min(10, Number(cfg.rows) || 5));
            const list = (s.rows || []).slice(0, n);
            const box = plate.querySelector('.dg-rows');
            plate.querySelector('.dg-empty').hidden = list.length > 0;
            box.style.height = (list.length * ROW_H) + 'px';
            const top = (list[0] && list[0].coins) || 1;
            const tie = new Set(s.phase === 'tie' ? s.tieIds || [] : []);
            const keep = new Set();
            list.forEach((p, i) => {
                keep.add(p.id);
                let r = rowEls.get(p.id);
                if (!r) {
                    const d = document.createElement('div');
                    d.className = 'dg-row enter';
                    d.innerHTML = `<span class="dg-medal"><b></b></span><span class="dg-ava">${avatarInner(p)}</span><span class="dg-name"></span><span class="dg-chip">HOÀ</span><span class="dg-coins"><b>0</b><small>xu</small></span><span class="dg-gauge"><i></i></span>`;
                    d.style.transform = `translateY(${i * ROW_H}px)`;
                    box.appendChild(d);
                    d.querySelector('.dg-coins b').textContent = fmt(p.coins);   // hàng mới / OBS tải lại: hiện số ngay
                    r = { el: d, coins: p.coins, avatar: p.avatar };
                    rowEls.set(p.id, r);
                    requestAnimationFrame(() => d.classList.remove('enter'));
                }
                const e = r.el;
                if (p.avatar && p.avatar !== r.avatar) { e.querySelector('.dg-ava').innerHTML = avatarInner(p); r.avatar = p.avatar; }
                e.querySelector('.dg-name').textContent = p.name;
                e.querySelector('.dg-medal b').textContent = i + 1;
                e.className = 'dg-row' + (i < 3 ? ' r' + (i + 1) : '') + (tie.has(p.id) ? ' tie' : '');
                e.style.transform = `translateY(${i * ROW_H}px)`;
                e.style.zIndex = String(20 - i);
                e.querySelector('.dg-gauge i').style.width = Math.max(3, Math.round(p.coins / top * 100)) + '%';
                if (p.coins !== r.coins) {
                    tween(e.querySelector('.dg-coins b'), r.coins, p.coins);
                    if (r.coins) { e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); }
                    r.coins = p.coins;
                }
            });
            for (const [id, r] of rowEls) if (!keep.has(id)) { r.el.remove(); rowEls.delete(id); }

            if (s.lastExtendAt && s.lastExtendAt !== lastExtend) {
                const fresh = lastExtend !== 0 || (Date.now() + skew - s.lastExtendAt < 3000);
                lastExtend = s.lastExtendAt;
                if (fresh) {
                    const plus = plate.querySelector('.dg-plus');
                    plus.textContent = '+' + ((s.rules && s.rules.snipeAddSec) || 10) + 's';
                    plus.classList.remove('go'); void plus.offsetWidth; plus.classList.add('go');
                    const g = plate.querySelector('.dg-gavel');
                    g.classList.remove('knock'); void g.offsetWidth; g.classList.add('knock');
                }
            }
            tickClock();
        }

        // ---------- Khung CHỐT ĐƠN ----------
        function buildDone(s) {
            rowEls.clear();
            const w = s.winner;
            const head = `
<div class="dg-head">
  <div class="dg-ribbon"><span>ĐẤU GIÁ</span></div>
  <div class="dg-title">${esc(s.title || 'Món đặc biệt')}</div>
  <div class="dg-phase">Đã chốt</div>
</div>`;
            if (!w) {
                plate.innerHTML = head + '<div class="dg-nowin">Hết giờ — chưa ai trả giá</div>';
                return;
            }
            const gifts = (w.gifts || []).map((g) => `<span class="dg-gift">${g.icon ? `<img src="${esc(g.icon)}" alt="" referrerpolicy="no-referrer">` : '<i>🎁</i>'}<b>×${fmt(g.count)}</b></span>`).join('');
            const ru = s.runnerUp;
            const trash = cfg.trashOn !== false && ru ? `
<div class="dg-trash">
  <div class="dg-trash-cap"><b>${esc(ru.name)}</b><span>hụt món · ${fmt(ru.coins)} xu</span><em> → vào thùng rác!</em></div>
  <div class="dg-fly"><span class="dg-ava sm">${avatarInner(ru)}</span></div>
  <div class="dg-bin">${BIN}</div>
</div>` : '';
            plate.innerHTML = `${head}
<div class="dg-win">
  <div class="dg-spot"></div>
  <div class="dg-pedestal"></div>
  <div class="dg-medallion">${LAUREL}<span class="dg-ava big">${avatarInner(w)}</span><span class="dg-crown">👑</span></div>
  <div class="dg-strike">
    <div class="dg-block">${BLOCK}</div>
    <div class="dg-gavel slam">${GAVEL}</div>
    <div class="dg-shock"></div>
  </div>
  <div class="dg-stamp">CHỐT ĐƠN</div>
  <div class="dg-win-name">${esc(w.name)}</div>
  <div class="dg-win-coins">${fmt(w.coins)}<small>xu</small></div>
  ${gifts ? `<div class="dg-gifts">${gifts}</div>` : ''}
</div>${trash}
<div class="dg-foot">${fmt(s.bidders)} người trả giá · tổng ${fmt(s.total)} xu</div>`;
        }

        function render() {
            el.classList.toggle('dg-hidden', !visible());
            if (!st) return;
            const s = st;
            const want = s.phase === 'done' ? 'done' : (s.phase === 'idle' ? 'idle' : 'live');
            board.className = 'dg-board ph-' + s.phase;
            if (want === 'done') {
                // Chỉ dựng lại (và diễn lại búa/thùng rác) khi sang lượt chốt mới hoặc đổi cấu hình hiển thị.
                const key = [s.title, s.winner && s.winner.id, s.winner && s.winner.coins, s.runnerUp && s.runnerUp.id, cfg.trashOn].join('|');   // không dùng s.seq: lưu cấu hình cũng tăng seq → diễn lại búa
                if (view !== 'done' || key !== doneKey) { buildDone(s); doneKey = key; }
            } else if (want === 'live') {
                if (view !== 'live') { buildLive(); lastExtend = s.lastExtendAt || 0; }
                updateLive(s);
            }
            view = want;
        }

        function tickClock() {
            const t = plate.querySelector('.dg-time');
            if (!t || !st || !st.endsAt) return;
            const left = st.endsAt - (Date.now() + skew);
            t.textContent = clock(left);
            const arc = plate.querySelector('.dg-dial .arc');
            const total = st.totalMs || 1;
            if (arc) arc.style.strokeDashoffset = String(295.3 * (1 - Math.max(0, Math.min(1, left / total))));
            board.classList.toggle('hurry', left <= 10_000);
        }

        timer = setInterval(tickClock, 200);
        place();
        return {
            setCfg(c) { cfg = Object.assign({}, cfg, c || {}); place(); if (view === 'live' && st) { updateLive(st); el.classList.toggle('dg-hidden', !visible()); } else render(); },   // bật/tắt game giữa phiên → ẩn/hiện ngay; không xoá view để khỏi diễn lại búa
            update(s) {
                if (!s) return;
                if (s.serverNow) skew = s.serverNow - Date.now();
                st = s;
                render();
            },
            destroy() { clearInterval(timer); }
        };
    }

    /** Kịch bản giả cho khung xem trước (không cần LIVE). Trả về state theo bước k. */
    const DEMO_NAMES = [['lan', 'Lan Anh 🌸', 4200], ['kiet', 'Tuấn Kiệt', 3990], ['mai', 'Mai Mai', 1500], ['long', 'Hoàng Long', 860], ['vy', 'Khánh Vy', 300], ['an', 'Bình An', 99]];
    function demoState(k, now) {
        const t = now || Date.now();
        const rules = { snipeOn: true, snipeWindowSec: 10, snipeAddSec: 10, snipeMax: 20, tieSec: 15, tieRounds: 3, minCoins: 0 };
        const rows = DEMO_NAMES.map(([id, name, c]) => ({ id, name, avatar: '', coins: c, gifts: [] }));
        const base = { title: 'Áo khoác ký tên', rules, serverNow: t, bidders: rows.length, total: rows.reduce((s, r) => s + r.coins, 0), seq: k, extendCount: 0, lastExtendAt: 0, tieIds: [], tieRound: 0, winner: null, runnerUp: null };
        const step = k % 3;
        if (step === 0) return Object.assign({}, base, { phase: 'live', endsAt: t + 47_000, totalMs: 120_000, rows });
        if (step === 1) {
            const r2 = rows.map((r) => (r.id === 'kiet' ? Object.assign({}, r, { coins: 4200 }) : r));
            return Object.assign({}, base, { phase: 'tie', tieRound: 1, tieIds: ['lan', 'kiet'], endsAt: t + 9_000, totalMs: 15_000, rows: r2, extendCount: 1, lastExtendAt: t });
        }
        const w = Object.assign({}, rows[0], { coins: 5200, gifts: [{ name: 'Galaxy', icon: '', count: 2 }, { name: 'Rose', icon: '', count: 99 }] });
        return Object.assign({}, base, { phase: 'done', endsAt: 0, totalMs: 0, rows, winner: w, runnerUp: rows[1] });
    }

    root.HpDauGia = { createRenderer, demoState };
})(typeof window !== 'undefined' ? window : globalThis);
