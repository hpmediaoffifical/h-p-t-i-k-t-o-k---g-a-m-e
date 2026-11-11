/* 🔨 Đấu Giá — bộ vẽ overlay (dùng chung overlay OBS + khung xem trước ?demo=1).
   Luật nằm ở server (lib/dau-gia.js); file này CHỈ vẽ snapshot nhận qua socket 'daugia:state'.
   Đồng hồ tự đếm từ endsAt (bù lệch giờ bằng serverNow) — server không đẩy mỗi giây. */
(function (root) {
    'use strict';

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
    const HUES = [12, 38, 160, 200, 262, 320, 95, 280];
    function hue(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return HUES[h % HUES.length]; }
    function initials(name) {
        const w = String(name || '?').trim().split(/\s+/).filter(Boolean);
        const s = w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2);
        return s.toLocaleUpperCase('vi');
    }
    function avatar(p, cls) {
        const fb = `<span class="dg-ava-fb" style="--h:${hue(p.id)}">${esc(initials(p.name))}</span>`;
        if (!p.avatar) return `<span class="dg-ava ${cls || ''}">${fb}</span>`;
        return `<span class="dg-ava ${cls || ''}">${fb}<img src="${esc(p.avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()"></span>`;
    }
    function clock(ms) {
        const s = Math.max(0, Math.ceil(ms / 1000));
        const m = Math.floor(s / 60);
        return m > 0 ? m + ':' + String(s % 60).padStart(2, '0') : String(s);
    }

    function createRenderer(el, opts) {
        const o = opts || {};
        let cfg = { enabled: true, rows: 5, xPercent: 50, yPercent: 6, scale: 100, trashOn: true };
        let st = null, skew = 0, lastExtend = 0, doneSeqShown = '', timer = null;

        el.classList.add('dg-root');
        el.innerHTML = '<div class="dg-card"></div>';
        const card = el.firstChild;

        function place() {
            const sc = (Number(cfg.scale) || 100) / 100 * (o.baseScale || 1);
            el.style.left = (Number(cfg.xPercent) || 50) + '%';
            el.style.top = (Number(cfg.yPercent) || 0) + '%';
            el.style.transform = `translateX(-50%) scale(${sc})`;
        }
        function visible() { return cfg.enabled !== false && st && st.phase !== 'idle'; }

        function phaseLabel(s) {
            if (s.phase === 'live') return 'Đang trả giá';
            if (s.phase === 'tie') return `Hiệp phụ ${s.tieRound}/${s.rules ? s.rules.tieRounds : s.tieRound} · đang hoà`;
            return 'Đã chốt';
        }
        function hint(s) {
            const r = s.rules || {};
            if (s.phase !== 'live' && s.phase !== 'tie') return '';
            if (r.snipeOn && s.extendCount < r.snipeMax) return `Giành đầu bảng ở ${r.snipeWindowSec}s cuối: +${r.snipeAddSec}s`;
            if (s.phase === 'live' && r.tieSec > 0 && r.tieRounds > 0) return `Hoà đầu bảng → hiệp phụ ${r.tieSec}s`;
            return '';
        }

        function rowsHtml(s) {
            const n = Math.max(3, Math.min(10, Number(cfg.rows) || 5));
            const list = (s.rows || []).slice(0, n);
            if (!list.length) return '<div class="dg-empty">Tặng quà bất kỳ để trả giá — quà càng nhiều xu càng lên cao</div>';
            const top = list[0].coins || 1;
            const tie = new Set(s.phase === 'tie' ? s.tieIds || [] : []);
            return list.map((p, i) => `
<div class="dg-row ${i === 0 ? 'lead' : ''} ${tie.has(p.id) ? 'tie' : ''}">
  <span class="dg-rank">${i + 1}</span>
  ${avatar(p)}
  <span class="dg-name">${esc(p.name)}${tie.has(p.id) ? '<i class="dg-chip">HOÀ</i>' : ''}</span>
  <span class="dg-coins">${fmt(p.coins)}<small> xu</small></span>
  <span class="dg-bar" style="--w:${Math.max(4, Math.round(p.coins / top * 100))}%"></span>
</div>`).join('');
        }

        function doneHtml(s) {
            const w = s.winner;
            if (!w) return '<div class="dg-nowin">Hết giờ — chưa ai trả giá</div>';
            const gifts = (w.gifts || []).map((g) => `<span class="dg-gift">${g.icon ? `<img src="${esc(g.icon)}" alt="" referrerpolicy="no-referrer">` : '🎁'}<b>×${fmt(g.count)}</b></span>`).join('');
            const ru = s.runnerUp;
            const trash = cfg.trashOn !== false && ru ? `
<div class="dg-trash">
  <div class="dg-bin"><span class="dg-lid"></span><span class="dg-can"></span></div>
  <div class="dg-fly">${avatar(ru, 'sm')}</div>
  <div class="dg-trash-cap"><b>${esc(ru.name)}</b> hụt món · ${fmt(ru.coins)} xu → vào thùng rác!</div>
</div>` : '';
            return `
<div class="dg-win">
  <div class="dg-crown">👑</div>
  ${avatar(w, 'big')}
  <div class="dg-win-lbl">CHỐT ĐƠN</div>
  <div class="dg-win-name">${esc(w.name)}</div>
  <div class="dg-win-coins">${fmt(w.coins)} <small>xu</small></div>
  ${gifts ? `<div class="dg-gifts">${gifts}</div>` : ''}
</div>${trash}`;
        }

        function render() {
            el.classList.toggle('dg-hidden', !visible());
            if (!st) return;
            const s = st;
            const running = s.phase === 'live' || s.phase === 'tie';
            const h = hint(s);
            card.className = 'dg-card ph-' + s.phase;
            card.innerHTML = `
<div class="dg-head">
  <div class="dg-head-l">
    <span class="dg-tag">🔨 ĐẤU GIÁ</span>
    <div class="dg-title">${esc(s.title || 'Món đặc biệt')}</div>
    <div class="dg-phase">${esc(phaseLabel(s))}</div>
  </div>
  ${running ? '<div class="dg-clock"><svg viewBox="0 0 100 100"><circle class="trk" cx="50" cy="50" r="44"/><circle class="arc" cx="50" cy="50" r="44"/></svg><span class="dg-time">0</span><span class="dg-plus"></span></div>' : ''}
</div>
${h ? `<div class="dg-hint">${esc(h)}</div>` : ''}
${s.phase === 'done' ? doneHtml(s) : `<div class="dg-rows">${rowsHtml(s)}</div>`}
<div class="dg-foot">${fmt(s.bidders)} người trả giá · tổng ${fmt(s.total)} xu</div>`;
            if (s.phase === 'done' && doneSeqShown !== String(s.seq)) {
                doneSeqShown = String(s.seq);
                card.classList.add('fresh');
            }
            if (s.lastExtendAt && s.lastExtendAt !== lastExtend) {
                const fresh = lastExtend !== 0 || (Date.now() + skew - s.lastExtendAt < 3000);
                lastExtend = s.lastExtendAt;
                const plus = card.querySelector('.dg-plus');
                if (plus && fresh) { plus.textContent = '+' + ((s.rules && s.rules.snipeAddSec) || 10) + 's'; plus.classList.add('go'); }
            }
            tickClock();
        }

        function tickClock() {
            const t = card.querySelector('.dg-time');
            if (!t || !st || !st.endsAt) return;
            const left = st.endsAt - (Date.now() + skew);
            t.textContent = clock(left);
            const arc = card.querySelector('.arc');
            const total = st.totalMs || 1;
            if (arc) arc.style.strokeDashoffset = String(276.5 * (1 - Math.max(0, Math.min(1, left / total))));
            card.classList.toggle('hurry', left <= 10_000);
        }

        timer = setInterval(tickClock, 200);
        place();
        return {
            setCfg(c) { cfg = Object.assign({}, cfg, c || {}); place(); render(); },
            update(s) {
                if (!s) return;
                if (s.serverNow) skew = s.serverNow - Date.now();
                if (!st || st.phase !== s.phase) lastExtend = s.lastExtendAt || 0;
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
