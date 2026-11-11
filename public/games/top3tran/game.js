/* 🏆 Top 3 Kết Thúc Trận — bộ vẽ overlay (dùng chung overlay OBS + khung xem trước ?demo=1).
   Luật ở server (lib/top3-tran.js); file này CHỈ vẽ snapshot 'top3tran:state':
   · trận đang mở + liveBar → thanh "Top trận" nhỏ (3 người dẫn, đồng hồ nếu trận tay có hẹn giờ);
   · announce → bục 2-1-3 mọc lần lượt 3 → 2 → 1, diễn lại mỗi khi announce.seq đổi. */
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
        const fb = `<span class="t3-ava-fb" style="--h:${hue(p.id)}">${esc(initials(p.name))}</span>`;
        return `<span class="t3-ava ${cls || ''}">${fb}${p.avatar ? `<img src="${esc(p.avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>`;
    }
    const MEDAL = ['🥇', '🥈', '🥉'];
    const PLACE = [
        { cls: 'p2', idx: 1, label: '2' },
        { cls: 'p1', idx: 0, label: '1' },
        { cls: 'p3', idx: 2, label: '3' }
    ];

    function createRenderer(el, opts) {
        const o = opts || {};
        let cfg = { enabled: true, liveBar: true, yPercent: 30, barYPercent: 4, scale: 100 };
        let st = null, skew = 0, shownSeq = 0, timer = null;

        el.classList.add('t3-root');
        el.innerHTML = '<div class="t3-bar t3-off"></div><div class="t3-pod t3-off"></div>';
        const bar = el.querySelector('.t3-bar');
        const pod = el.querySelector('.t3-pod');

        function place() {
            const sc = (Number(cfg.scale) || 100) / 100 * (o.baseScale || 1);
            bar.style.top = (Number(cfg.barYPercent) || 0) + '%';
            pod.style.top = (Number(cfg.yPercent) || 0) + '%';
            bar.style.transform = `translateX(-50%) scale(${sc})`;
            pod.style.transform = `translateX(-50%) scale(${sc})`;
        }

        function renderBar() {
            const s = st;
            const on = cfg.enabled !== false && cfg.liveBar !== false && s && s.open && !s.announce;
            bar.classList.toggle('t3-off', !on);
            if (!on) return;
            const items = (s.top || []).map((p, i) => `<span class="t3-it">${MEDAL[i]}${avatar(p, 'xs')}<b>${esc(p.name)}</b><em>${fmt(p.coins)}</em></span>`).join('');
            bar.innerHTML = `<span class="t3-bar-tag">🏆 TOP TRẬN</span>${items || '<span class="t3-wait">Tặng quà để lên bục</span>'}${s.endsAt ? '<span class="t3-left"></span>' : ''}`;
            tickClock();
        }

        function renderPod() {
            const a = st && st.announce;
            const on = cfg.enabled !== false && !!a;
            pod.classList.toggle('t3-off', !on);
            if (!on) return;
            if (a.seq === shownSeq) return;   // cùng lượt công bố → không diễn lại
            shownSeq = a.seq;
            const cols = PLACE.map((P) => {
                const p = a.rows[P.idx];
                if (!p) return `<div class="t3-col ${P.cls} empty"></div>`;
                return `
<div class="t3-col ${P.cls}">
  <div class="t3-who">${P.idx === 0 ? '<span class="t3-crown">👑</span>' : ''}${avatar(p, 'big')}
    <div class="t3-nm">${esc(p.name)}</div><div class="t3-xu">${fmt(p.coins)} <small>xu</small></div></div>
  <div class="t3-step"><span>${P.label}</span></div>
</div>`;
            }).join('');
            const conf = Array.from({ length: 26 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i % 7) * 0.18}s;--c:${['#ffd34d', '#ff6fa8', '#5fd3ff', '#7dff9a', '#ffffff'][i % 5]}"></i>`).join('');
            pod.innerHTML = `
<div class="t3-conf">${conf}</div>
<div class="t3-kick">TRẬN ĐẤU KẾT THÚC</div>
<div class="t3-ttl">TOP 3 GÓP SỨC</div>
<div class="t3-cols">${cols}</div>
<div class="t3-sum">Cả trận: <b>${fmt(a.total)}</b> xu từ người xem</div>`;
            pod.classList.remove('go'); void pod.offsetWidth; pod.classList.add('go');
        }

        function tickClock() {
            const t = bar.querySelector('.t3-left');
            if (!t || !st || !st.endsAt) return;
            const s = Math.max(0, Math.ceil((st.endsAt - (Date.now() + skew)) / 1000));
            t.textContent = '⏱ ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        }

        function render() { renderBar(); renderPod(); }
        timer = setInterval(tickClock, 250);
        place();
        return {
            setCfg(c) { cfg = Object.assign({}, cfg, c || {}); place(); shownSeq = 0; render(); },
            update(s) {
                if (!s) return;
                if (s.serverNow) skew = s.serverNow - Date.now();
                st = s;
                render();
            },
            replay() { shownSeq = 0; render(); },
            destroy() { clearInterval(timer); }
        };
    }

    const DEMO_TOP = [
        { id: 'a', name: 'Bảo Ngọc', avatar: '', coins: 52800 },
        { id: 'b', name: 'Trường Giang', avatar: '', coins: 31450 },
        { id: 'c', name: 'Khánh Vy', avatar: '', coins: 18900 }
    ];
    /** Kịch bản giả cho khung xem trước: chẵn = trận đang mở (thanh), lẻ = công bố bục. */
    function demoState(k, now) {
        const t = now || Date.now();
        if (k % 2 === 0) return { open: true, source: 'pk', endsAt: 0, players: 23, total: 110000, top: DEMO_TOP, announce: null, serverNow: t, seq: k };
        return { open: false, source: '', endsAt: 0, players: 23, total: 110000, top: DEMO_TOP,
            announce: { seq: k, at: t, hideAt: 0, rows: DEMO_TOP, total: 110000, demo: true }, serverNow: t, seq: k };
    }

    root.HpTop3Tran = { createRenderer, demoState };
})(typeof window !== 'undefined' ? window : globalThis);
