/* 🏆 Top 3 Kết Thúc Trận — bộ vẽ overlay 2.5D (dùng chung overlay OBS + khung xem trước ?demo=1).
   Luật ở server (lib/top3-tran.js); file này CHỈ vẽ snapshot 'top3tran:state':
   · trận đang mở + liveBar → thanh "Top trận" (viên nang kính, cập nhật tại chỗ, đồng hồ nếu trận tay hẹn giờ);
   · announce → sân khấu bục 2-1-3: khối kim loại có mặt trên/mặt trước, bệ đá, đèn chiếu từng bậc, tia sáng sau
     hạng 1, huy chương + ruy băng tên, confetti lật 3D. Diễn lại mỗi khi announce.seq đổi. Chỉ CSS/HTML. */
(function (root) {
    'use strict';

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
    // thanh Top trận gọn: ≥ 100.000 xu → 299,9K / 1,2M (thanh có đồng hồ không bị cắt chữ)
    const fmtShort = (n) => { n = Math.round(Number(n) || 0); return n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',').replace(/,0$/, '') + 'M' : n >= 1e5 ? (n / 1e3).toFixed(1).replace('.', ',').replace(/,0$/, '') + 'K' : fmt(n); };
    const HUES = [12, 38, 160, 200, 262, 320, 95, 280];
    function hue(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return HUES[h % HUES.length]; }
    function initials(name) {
        const w = String(name || '?').replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).filter(Boolean);
        const s = w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2);
        return s.toLocaleUpperCase('vi');
    }
    function avatar(p, cls) {
        const fb = `<span class="t3-ava-fb" style="--h:${hue(p.id)}">${esc(initials(p.name))}</span>`;
        return `<span class="t3-ava ${cls || ''}">${fb}${p.avatar ? `<img src="${esc(p.avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>`;
    }
    const PLACE = [
        { cls: 'p2', idx: 1, label: '2' },
        { cls: 'p1', idx: 0, label: '1' },
        { cls: 'p3', idx: 2, label: '3' }
    ];
    const CONF_COLORS = ['#ffd34d', '#ff6fa8', '#5fd3ff', '#7dff9a', '#ffffff', '#c38bff'];

    function createRenderer(el, opts) {
        const o = opts || {};
        let cfg = { enabled: true, liveBar: true, yPercent: 30, barYPercent: 4, scale: 100 };
        let st = null, skew = 0, shownSeq = 0, timer = null, barKey = '';

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
            // Dựng lại chỉ khi đổi người/thứ tự (ảnh không tải lại mỗi lượt quà); số xu cập nhật tại chỗ.
            const top = s.top || [];
            const key = top.map((p) => p.id + '|' + p.avatar).join(',') + '|' + !!s.endsAt;
            if (key !== barKey) {
                barKey = key;
                const items = top.map((p, i) => `<span class="t3-it m${i + 1}"><i class="t3-medal">${i + 1}</i>${avatar(p, 'xs')}<b></b><em></em></span>`).join('');
                bar.innerHTML = `<span class="t3-bar-tag"><i>🏆</i>TOP TRẬN</span>${items || '<span class="t3-wait">Tặng quà để lên bục</span>'}${s.endsAt ? '<span class="t3-left"></span>' : ''}`;
            }
            bar.querySelectorAll('.t3-it').forEach((n, i) => {
                const p = top[i];
                if (!p) return;
                n.querySelector('b').textContent = p.name;
                n.querySelector('em').textContent = fmtShort(p.coins);
            });
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
                const block = `<div class="t3-block"><div class="t3-top"><i class="t3-pool"></i></div><div class="t3-front"><span>${P.label}</span></div></div>`;
                if (!p) return `<div class="t3-col ${P.cls} empty"><div class="t3-who"></div>${block}</div>`;
                return `
<div class="t3-col ${P.cls}">
  <div class="t3-who">
    <div class="t3-medallion">${P.idx === 0 ? '<span class="t3-crown">👑</span>' : ''}<span class="t3-ring"></span>${avatar(p, 'big')}</div>
    <div class="t3-ribbon"><span>${esc(p.name)}</span></div>
    <div class="t3-xu">${fmt(p.coins)}<small>xu</small></div>
  </div>
  ${block}
</div>`;
            }).join('');
            let conf = '';
            for (let i = 0; i < 44; i++) {
                const x = (i * 23.7) % 100, d = (i % 11) * 0.16, dur = 2.6 + (i % 5) * 0.35, w = i % 3 === 0 ? 10 : 14, h = i % 3 === 0 ? 10 : 24;
                conf += `<i style="--x:${x.toFixed(1)}%;--d:${d.toFixed(2)}s;--t:${dur.toFixed(2)}s;--w:${w}px;--hh:${h}px;--c:${CONF_COLORS[i % CONF_COLORS.length]};--r:${i % 3 === 0 ? '50%' : '3px'};--sx:${(i % 7) - 3}"></i>`;
            }
            pod.innerHTML = `
<div class="t3-glow"></div>
<div class="t3-rays"></div>
<div class="t3-beams"><i class="b2"></i><i class="b1"></i><i class="b3"></i></div>
<div class="t3-banner"><div class="t3-kick">TRẬN ĐẤU KẾT THÚC</div><div class="t3-ttl">TOP 3 GÓP SỨC</div></div>
<div class="t3-scene">
  <div class="t3-base"><i class="t3-base-top"></i><i class="t3-base-front"></i></div>
  <div class="t3-cols">${cols}</div>
</div>
<div class="t3-sum">Cả trận <b>${fmt(a.total)}</b> xu từ người xem</div>
<div class="t3-conf">${conf}</div>`;
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
            setCfg(c) { cfg = Object.assign({}, cfg, c || {}); place(); barKey = ''; render(); },   // không đặt lại shownSeq: lưu cấu hình không được diễn lại bục + confetti
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
