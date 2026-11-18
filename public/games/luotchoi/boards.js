/* 🎲 Đấu Trường Mini — vẽ bàn của 4 trò từ `board` (view() phía server, không lộ bẫy khi đang chơi).
 * LcBoards.render(stage, board, { fresh, marks, colorOf })
 *  - fresh = vừa có lượt chọn mới → chạy hiệu ứng; false → vẽ tĩnh (đẩy lại trạng thái không chạy lại hiệu ứng).
 *  - marks = nhãn tên người đã chọn ô ([{ n, key, nickname, avatar }]) → dán lên đúng ô, giữ tới hết bàn.
 * Mỗi ô có data-n để overlay.js cho tay bay tới đúng chỗ. */
(function () {
    'use strict';
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    // giả ngẫu nhiên theo số thanh → tháp đổ mỗi lần vẽ giống nhau
    const hash = (n) => { let x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
    const short = (s, k) => { const a = Array.from(String(s || '')); return a.length > k ? a.slice(0, k - 1).join('') + '…' : a.join(''); };

    // Nhãn tên: avatar tròn nhỏ (hoặc chữ cái đầu trên nền màu riêng) + tên rút gọn
    function tagHtml(m, o, k) {
        if (!m) return '';
        const color = o.colorOf ? o.colorOf(m.key || '') : '#4fb3ff';
        const av = m.avatar ? `<img src="${esc(m.avatar)}" alt="">` : esc((Array.from(m.nickname || '?')[0] || '?').toUpperCase());
        return `<span class="lc-tag"><i style="background:${color}">${av}</i><em>${esc(short(m.nickname, k || 7))}</em></span>`;
    }
    const markMap = (o) => { const m = {}; (o.marks || []).forEach(x => { m[x.n] = x; }); return m; };

    function hama(b, o) {
        const used = new Set(b.used), mk = markMap(o);
        const teeth = Array.from({ length: b.n }, (_, i) => {
            const n = i + 1;
            const cls = ['tooth', used.has(n) ? 'used' : '', o.fresh && b.last === n ? 'last' : '', b.trap === n ? 'trap' : ''].join(' ');
            return `<div class="tw" data-n="${n}"><div class="${cls}">${n}</div>${tagHtml(mk[n], o, 6)}</div>`;
        }).join('');
        return `<div class="hm${b.sprung ? ' snap' : ''}${b.sprung && !o.fresh ? ' still' : ''}">
            <div class="lower"></div><div class="mouth"></div><div class="teeth">${teeth}</div>
            <div class="upper"><div class="eye l"></div><div class="eye r"></div><div class="nose l"></div><div class="nose r"></div>
                <div class="cheek l"></div><div class="cheek r"></div><div class="lip"></div></div></div>`;
    }

    function chumcoc(b, o) {
        const used = new Set(b.used), mk = markMap(o);
        const size = b.n > 20 ? 52 : 62;
        const holes = Array.from({ length: b.n }, (_, i) => {
            const n = i + 1;
            const cls = ['hole', used.has(n) ? 'used' : '', o.fresh && b.last === n ? 'last' : '', b.trap === n ? 'trap' : ''].join(' ');
            return `<div class="${cls}" data-n="${n}" style="width:${size}px;height:${size}px">${n}${tagHtml(mk[n], o, 6)}</div>`;
        }).join('');
        return `<div class="cc${b.sprung ? ' pop' : ''}${b.sprung && !o.fresh ? ' still' : ''}">
            <div class="body"><div class="band"></div></div><div class="neck"></div><div class="rim"></div>
            <div class="holes">${holes}</div><div class="frog">🐸</div></div>`;
    }

    function thaptre(b, o) {
        const mk = markMap(o);
        const h = Math.min(56, Math.floor(600 / b.levels) - 4);
        const rows = [];
        for (let L = 1; L <= b.levels; L++) {
            const lv = b.bars.filter(x => x.level === L);
            // tầng đỉnh đang xếp dở: giữ đủ 3 chỗ để thanh không bị kéo giãn
            const slots = [0, 1, 2].map(p => lv.find(x => x.pos === p) || null);
            const bars = slots.map(x => {
                if (!x) return '<div class="bar gap"></div>';
                const cls = ['bar', x.out ? 'out' : '', o.fresh && b.last === x.n && x.out && !b.fallen ? 'last' : ''].join(' ');
                const r = hash(x.n);
                const fall = b.fallen ? `--dx:${Math.round((r - 0.5) * 900)}px;--dy:${Math.round(380 + r * 300 - L * 10)}px;--rot:${Math.round((r - 0.5) * 540)}deg;--dl:${((b.levels - L) * 0.04).toFixed(2)}s` : '';
                const label = x.out && !(o.fresh && b.last === x.n) ? tagHtml(mk[x.n], o, 9) : x.n;
                return `<div class="${cls}" data-n="${x.n}" style="${fall}">${label}</div>`;
            }).join('');
            rows.push(`<div class="lv${L === b.levels ? ' top' : ''}" style="height:${h}px">${bars}</div>`);
        }
        const w = b.wobble || 0, pct = Math.max(0, Math.min(100, Number(b.wobblePct) || 0));
        const hue = Math.round(130 - pct * 1.3);   // xanh → vàng → đỏ
        const meter = `<div class="tt-meter${pct >= 60 ? ' hot' : ''}"><span>${'Lung lay'}</span><b>${pct}%</b><div class="bar-in"><i style="width:${pct}%;background:hsl(${hue},85%,52%)"></i></div></div>`;
        return meter + `<div class="tt${b.fallen ? ' fallen' : (w > 0.05 ? ' wob' : '')}${b.fallen && !o.fresh ? ' still' : ''}" style="--wob:${(w * 2).toFixed(2)};--wobT:${(2.6 - w * 1.4).toFixed(2)}s">${rows.join('')}</div>`;
    }

    function latcap(b, o) {
        const mk = markMap(o);
        const n = b.cards.length;
        const cols = n <= 16 ? 4 : n <= 20 ? 5 : 6;
        const rowsN = Math.ceil(n / cols);
        const cw = Math.min(170, Math.floor((900 - (cols - 1) * 14) / cols));
        const ch = Math.min(Math.round(cw * 1.2), Math.floor((660 - (rowsN - 1) * 14) / rowsN));
        const last = new Set(b.last || []);
        const cards = b.cards.map(c => {
            const cls = ['cardc', c.face ? 'up' : '', c.matched ? 'matched' : '', b.pendingMiss && c.open ? 'miss' : '', o.fresh && c.matched && last.has(c.n) ? 'just' : ''].join(' ');
            return `<div class="${cls}" data-n="${c.n}" style="width:${cw}px;height:${ch}px"><div class="flip"><div class="back">${c.n}</div><div class="face">${esc(c.face || '')}${tagHtml(mk[c.n], o, 8)}</div></div></div>`;
        }).join('');
        return `<div class="lp" style="grid-template-columns:repeat(${cols}, ${cw}px)">${cards}</div>`;
    }

    const R = { hama, chumcoc, thaptre, latcap };
    function render(stage, b, o) {
        if (!b || !R[b.kind]) { stage.innerHTML = ''; return; }
        stage.innerHTML = R[b.kind](b, o || {});
    }
    window.LcBoards = { render, renderers: R };
})();
