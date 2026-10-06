// public/games/bancung/bow-anim.js — cây cung Bắn Cung: hình vẽ SVG + hoạt cảnh theo nhịp bắn thật.
//
//   LẮP TÊN  → mũi tên trượt vào dây (sau mỗi phát, tự lắp lại)
//   KÉO CĂNG → dây lùi về sau, hai cành uốn vào, đầu cung khẽ run khi giữ
//   BUÔNG    → dây bật về quá đà rồi rung tắt dần, cành bật lại, cung giật nhẹ về trước
//   NGHỈ     → tên đã lắp sẵn, cung "thở" rất nhẹ
//
// Toạ độ cung (viewBox 0 0 200 200): tay cầm quanh (120,100), mũi tên hướng +x. Overlay xoay cả cung
// quanh tay cầm để ngắm. Màu lấy từ biến CSS của skin: --bow-color, --string-color, --arrow-color,
// --skin-glow. Phần tính toán (geometry, createController) không đụng DOM → kiểm thử bằng Node.
(function (root) {
    'use strict';

    const ARROW_LEN = 130;          // khấc → mũi nhọn (đơn vị cung)
    const RISER_FRONT = 127;        // mép trước tay cầm (chỗ đặt tên)
    const DRAW_LEN = 56;            // dây lùi tối đa khi kéo hết
    const CY = 100;

    const r1 = v => Math.round(v * 10) / 10;

    // Bézier bậc 2 tại t và tiếp tuyến.
    function qb(p0, p1, p2, t) {
        const u = 1 - t;
        return {
            x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
            tx: 2 * u * (p1.x - p0.x) + 2 * t * (p2.x - p1.x), ty: 2 * u * (p1.y - p0.y) + 2 * t * (p2.y - p1.y)
        };
    }

    // Cành trên: từ đầu tay cầm vươn lên, ôm về phía người bắn rồi VỂNH ngọn ra trước (recurve).
    // Trả về đường bao kín (thon dần: 8 → 3 → 2) để tô màu.
    function limbTop(f) {
        const p0 = { x: 118, y: 66 }, p1 = { x: 130 - 2 * f, y: 32 + 3 * f }, p2 = { x: 84 - 8 * f, y: 16 + 9 * f };
        const c1 = { x: p2.x - 3, y: p2.y - 8 }, p3 = { x: p2.x + 8, y: p2.y - 9 + f };
        const pts = [];
        const N = 14;
        for (let i = 0; i <= N; i++) { const t = i / N; pts.push({ ...qb(p0, p1, p2, t), w: 8 - 5 * t }); }
        for (let i = 1; i <= 5; i++) { const t = i / 5; pts.push({ ...qb(p2, c1, p3, t), w: 3 - 1 * t }); }
        const L = [], R = [];
        for (const p of pts) {
            const n = Math.hypot(p.tx, p.ty) || 1, nx = -p.ty / n, ny = p.tx / n;
            L.push(r1(p.x + nx * p.w / 2) + ',' + r1(p.y + ny * p.w / 2));
            R.push(r1(p.x - nx * p.w / 2) + ',' + r1(p.y - ny * p.w / 2));
        }
        return { d: 'M' + L.join(' L') + ' L' + R.reverse().join(' L') + ' Z', tip: p2 };
    }
    const mirror = d => d.replace(/(-?[\d.]+),(-?[\d.]+)/g, (m, x, y) => x + ',' + r1(200 - Number(y)));

    // Hình cung tại độ kéo `draw` (0..1); `flex` cộng thêm độ uốn (âm = bật quá đà khi buông); `vib` rung dây.
    function geometry(draw, flex = 0, vib = 0) {
        const f = draw + flex;
        const top = limbTop(f);
        const tipTop = { x: r1(top.tip.x), y: r1(top.tip.y) };
        const sTop = { x: r1(tipTop.x + 1), y: tipTop.y }, sBot = { x: sTop.x, y: r1(200 - tipTop.y) };
        const nock = { x: r1(sTop.x - DRAW_LEN * draw + vib), y: CY };
        return {
            limbTop: top.d, limbBot: mirror(top.d),
            tips: { top: tipTop, bot: { x: tipTop.x, y: r1(200 - tipTop.y) } },
            string: { top: sTop, bot: sBot, d: `M${sTop.x},${sTop.y} L${nock.x},${nock.y} L${sBot.x},${sBot.y}` },
            nock
        };
    }

    // Mũi tên: khấc ở x=0, mũi nhọn ở x=L, nằm trên trục y=0. Dùng chung cho tên trên cung / đang bay / cắm.
    function arrowSvg(L = ARROW_LEN) {
        const h = L - 16;
        // Lông đuôi đúng chiều: mép trước THẤP (phía mũi nhọn) vút cao dần về sau, mép sau cao gần khấc.
        return '<path class="fletch" d="M30,-1 C22,-2 13,-6 8,-10 L4,-10 L6,-1 Z"/>'
             + '<path class="fletch" d="M30,1 C22,2 13,6 8,10 L4,10 L6,1 Z"/>'
             + `<line class="shaft" x1="2" y1="0" x2="${h + 4}" y2="0"/>`
             + '<rect class="nock" x="-1" y="-2.2" width="6" height="4.4" rx="1.2"/>'
             + `<path class="head" d="M${h},-6 L${L},0 L${h},6 L${h + 4},0 Z"/>`
             + `<path class="head-hi" d="M${h + 3},-2.6 L${L - 2},0"/>`;
    }

    // ===== Nhịp hoạt cảnh — máy trạng thái, bước theo đồng hồ ngoài (rAF hoặc đồng hồ giả trong test) =====
    const easeOut = t => 1 - Math.pow(1 - t, 3);
    function createController() {
        const c = {
            phase: 'idle', t0: 0, from: 0, dur: 110, hold: 30, until: 0,
            draw: 0, flex: 0, vib: 0, recoil: 0, tremble: 0, arrowOpacity: 1, arrowOff: 0,
            queue: [], lastShotAt: -1e9,
            // onRelease(leadMs): gọi đúng lúc buông dây — leadMs = đã trễ bao lâu so với lúc nhận lệnh bắn
            shoot(onRelease, opts = {}) {
                const now = opts.now ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
                // Bắn dồn dập (phát trước < 250ms) → kéo nhanh, không giữ — nhịp phải ngắn hơn khoảng cách 2 phát.
                const rapid = now - c.lastShotAt < 250;
                c.lastShotAt = now;
                const want = Math.max(40, opts.drawMs || 110);
                c.queue.push({ cb: onRelease, at: now, drawMs: rapid ? Math.min(want, 55) : want, rapid });
                // Dồn quá nhiều (combo lớn) → xả bớt ngay, chỉ giữ 2 phát cuối để cung còn kịp diễn.
                while (c.queue.length > 3) { const it = c.queue.shift(); it.cb(now - it.at); }
            },
            startDraw(now) {
                const it = c.queue[0];
                const busy = c.queue.length > 1;
                c.phase = 'draw'; c.t0 = now; c.from = c.draw;
                c.dur = busy ? 45 : it.drawMs; c.hold = busy || it.rapid ? 0 : 30;
            },
            release(now) {
                const it = c.queue.shift();
                c.phase = 'release'; c.t0 = now; c.draw = 0; c.arrowOpacity = 0;
                if (it) it.cb(now - it.at);
            },
            step(now) {
                const t = now - c.t0;
                c.tremble = 0;
                if (c.phase === 'idle') {
                    c.draw = 0; c.flex = 0; c.vib = 0; c.recoil = 0; c.arrowOpacity = 1; c.arrowOff = 0;
                    if (c.queue.length) c.startDraw(now);
                } else if (c.phase === 'draw') {
                    const k = Math.min(1, t / c.dur);
                    c.draw = c.from + (1 - c.from) * easeOut(k);
                    // Tên mới lắp kịp trong lúc kéo (bắn liên thanh): hiện dần + trượt vào
                    if (c.arrowOpacity < 1) { c.arrowOpacity = Math.min(1, c.arrowOpacity + 0.25); c.arrowOff = -14 * (1 - c.arrowOpacity); }
                    c.flex *= 0.6; c.vib *= 0.6; c.recoil *= 0.6;
                    if (k >= 1) { c.phase = 'hold'; c.until = now + c.hold; }
                } else if (c.phase === 'hold') {
                    c.draw = 1; c.arrowOpacity = 1; c.arrowOff = 0;
                    c.tremble = Math.sin(now / 9) * 0.6;
                    if (now >= c.until) c.release(now);
                } else if (c.phase === 'release') {
                    // Dây bật quá đà về trước rồi rung tắt dần; cành bật lại; cung giật nhẹ về trước.
                    c.vib = 9 * Math.exp(-t / 70) * Math.cos(2 * Math.PI * t / 58);
                    c.flex = -0.16 * Math.exp(-t / 90) * Math.cos(2 * Math.PI * t / 85);
                    c.recoil = 3.5 * Math.exp(-t / 55) * Math.sin(Math.PI * Math.min(1, t / 60));
                    c.arrowOpacity = 0;
                    if (c.queue.length && t >= 25) c.startDraw(now);
                    else if (t >= 300) { c.phase = 'reload'; c.t0 = now; }
                } else if (c.phase === 'reload') {
                    const k = Math.min(1, t / 180);
                    c.vib *= 0.8; c.flex *= 0.8; c.recoil *= 0.8;
                    c.arrowOpacity = easeOut(k); c.arrowOff = -26 * (1 - easeOut(k));
                    if (c.queue.length) c.startDraw(now);
                    else if (k >= 1) c.phase = 'idle';
                }
                return c;
            }
        };
        return c;
    }

    // ===== Gắn vào DOM: dựng SVG, chạy rAF, vẽ theo controller =====
    function mount(host) {
        const NS = 'http://www.w3.org/2000/svg';
        host.innerHTML = `
<svg class="bw" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <defs>
    <linearGradient id="bw-limb" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="var(--bow-color)" stop-opacity="1"/>
      <stop offset="0.55" stop-color="var(--bow-color)" stop-opacity="1"/>
      <stop offset="1" stop-color="var(--bow-color)" stop-opacity="0.7"/>
    </linearGradient>
  </defs>
  <g class="bw-body">
    <path class="bw-string"/>
    <path class="bw-limb" data-l="top"/>
    <path class="bw-limb" data-l="bot"/>
    <path class="bw-limb-hi" data-l="top"/>
    <path class="bw-limb-hi" data-l="bot"/>
    <path class="bw-riser" d="M116,62 C123,62 127,69 127,79 L127,91 C131,95 131,105 127,109 L127,121 C127,131 123,138 116,138 C112,138 111,133 112,127 L114,109 C111,105 111,95 114,91 L112,73 C111,67 112,62 116,62 Z"/>
    <rect class="bw-grip" x="111.5" y="87" width="15" height="26" rx="4"/>
    <path class="bw-grip-wrap" d="M112,92 L126,90 M112,97 L126,95 M112,102 L126,100 M112,107 L126,105 M112,112 L126,110"/>
    <path class="bw-rest" d="M127,97.5 L131,99 L127,100.5 Z"/>
    <circle class="bw-nockpt" data-l="top" r="1.8"/>
    <circle class="bw-nockpt" data-l="bot" r="1.8"/>
    <g class="bw-arrow">${arrowSvg(ARROW_LEN)}</g>
    <circle class="bw-anchor" cx="${RISER_FRONT}" cy="${CY}" r="0.01"/>
  </g>
</svg>`;
        const svg = host.querySelector('svg');
        const q = (s, l) => svg.querySelector(l ? `${s}[data-l="${l}"]` : s);
        const el = {
            body: q('.bw-body'), string: q('.bw-string'), arrow: q('.bw-arrow'),
            limbT: q('.bw-limb', 'top'), limbB: q('.bw-limb', 'bot'), hiT: q('.bw-limb-hi', 'top'), hiB: q('.bw-limb-hi', 'bot'),
            nT: q('.bw-nockpt', 'top'), nB: q('.bw-nockpt', 'bot')
        };
        const ctrl = createController();
        let lastKey = '', raf = 0, stopped = false;
        function render(now) {
            ctrl.step(now);
            // nghỉ: "thở" rất nhẹ cho cung khỏi chết đứng
            const breath = ctrl.phase === 'idle' ? Math.sin(now / 900) * 0.8 : 0;
            const g = geometry(ctrl.draw, ctrl.flex, ctrl.vib);
            const key = g.string.d + ctrl.arrowOpacity.toFixed(2) + ctrl.arrowOff.toFixed(1) + r1(ctrl.recoil + breath) + r1(ctrl.tremble);
            if (key !== lastKey) {
                lastKey = key;
                el.limbT.setAttribute('d', g.limbTop); el.limbB.setAttribute('d', g.limbBot);
                el.hiT.setAttribute('d', g.limbTop); el.hiB.setAttribute('d', g.limbBot);
                el.string.setAttribute('d', g.string.d);
                el.nT.setAttribute('cx', g.string.top.x); el.nT.setAttribute('cy', g.string.top.y);
                el.nB.setAttribute('cx', g.string.bot.x); el.nB.setAttribute('cy', g.string.bot.y);
                el.arrow.setAttribute('transform', `translate(${r1(g.nock.x + ctrl.arrowOff)},${r1(CY + ctrl.tremble)})`);
                el.arrow.style.opacity = ctrl.arrowOpacity.toFixed(2);
                el.body.setAttribute('transform', `translate(${r1(ctrl.recoil)},${r1(breath)})`);
            }
            if (!stopped) raf = requestAnimationFrame(render);
        }
        raf = requestAnimationFrame(render);
        return {
            ctrl,
            // Bắn: kéo → buông → onRelease(leadMs). drawMs: thời gian kéo mong muốn.
            shoot: (onRelease, drawMs) => ctrl.shoot(onRelease, { drawMs }),
            // Điểm đặt tên trên tay cầm (toạ độ màn hình) — mũi tên bay xuất phát từ đây.
            anchor: () => { const r = svg.querySelector('.bw-anchor').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
            setCharge: p => host.style.setProperty('--bow-charge', Math.max(0, Math.min(1, p / 100)).toFixed(3)),
            destroy: () => { stopped = true; cancelAnimationFrame(raf); }
        };
    }

    const api = { ARROW_LEN, RISER_FRONT, DRAW_LEN, geometry, arrowSvg, createController, mount };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.HpBow = api;
})(typeof window !== 'undefined' ? window : null);
