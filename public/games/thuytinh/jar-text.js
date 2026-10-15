// ✍️ Chữ trang trí Hũ Thủy Tinh — dùng chung cho overlay (game.js) và panel (app.js).
// Mỗi chữ: { id, text, style, anim, deco, flip, x, y, size, rot, color?, color2? }
//   flip  = đảo sticker trái ↔ phải.  text có thể chứa BIẾN tự điền: {top1} {top2} {top3} {top1xu} {tong} {qua} {muctieu} {phantram}.
//   x, y  = TÂM chữ, % khung ảnh hũ (−50…150: được kéo ra ngoài hũ, vd vắt ngang miệng hũ)
//           → chữ đi theo hũ khi hũ lắc/nghiêng/bị trộm.
//   size  = cỡ chữ, % bề ngang hũ (cqw của lớp chữ). rot = độ xoay (−45…45).
//   deco  = bộ sticker bám quanh chữ (linh vật thò đầu, sao, tim, nơ…) — SVG vẽ bằng code, không cần ảnh.
// Kiểu "khối" (puffy, plaque, candy, bubble, gold, sticker, retro, ice, rainbow) vẽ 3D bằng canvas ở jar-text-3d.js
// (font Baloo 2 đóng gói sẵn /lib/fonts/baloo2 → OBS chạy offline); kiểu phát sáng vẽ bằng CSS (jar-text.css).
// Sticker 3D cũng ở jar-text-3d.js (HpJarText3D.sticker).
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.HpJarText = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Thứ tự = thứ tự hiện trong panel. `hue` = cho đổi màu chủ đạo.
    // `sub`   = dòng 2 trở đi là DÒNG PHỤ chữ nhỏ (mẫu "Min Min / thanks").
    // `lines` = mỗi dòng cùng cỡ, dòng chẵn dùng MÀU 2 (mẫu "Hiên / Anh" hồng + xanh).
    const STYLES = [
        { id: 'puffy',   label: '☁️ Chữ phồng pastel', hue: true, lines: true },
        { id: 'plaque',  label: '🎀 Bảng tên dễ thương', hue: true, sub: true },
        { id: 'candy',   label: '🍬 Kẹo ngọt 3D',     hue: true },
        { id: 'bubble',  label: '🫧 Bong bóng',        hue: true },
        { id: 'gold',    label: '🏆 Vàng kim 3D',      hue: false },
        { id: 'sticker', label: '🏷 Sticker viền trắng', hue: true },
        { id: 'neon',    label: '💡 Đèn neon',          hue: true },
        { id: 'rainbow', label: '🌈 Cầu vồng',          hue: false },
        { id: 'retro',   label: '🕹 Retro 3D',          hue: true },
        { id: 'ice',     label: '🧊 Băng tuyết',        hue: false },
        { id: 'fire',    label: '🔥 Lửa',               hue: false },
        { id: 'glitter', label: '✨ Kim tuyến',         hue: false },
        { id: 'chalk',   label: '🖍 Phấn viết tay',     hue: true },
        { id: 'script',  label: '💌 Chữ ký mềm',        hue: true }
    ];
    const ANIMS = [
        { id: 'none',   label: 'Đứng yên' },
        { id: 'float',  label: 'Bồng bềnh' },
        { id: 'bounce', label: 'Nhún nhảy' },
        { id: 'pulse',  label: 'Nhịp tim' },
        { id: 'wiggle', label: 'Lắc lư' },
        { id: 'shine',  label: 'Vệt sáng quét' }
    ];
    // Màu chủ đạo mặc định của kiểu đổi màu được (người dùng chọn màu khác → --jt-c / --jt-c2).
    const DEFAULT_COLOR = { puffy: '#ff8fc0', plaque: '#ff6fa8', candy: '#ff5d8f', bubble: '#4fb3ff', sticker: '#ff7a3d', neon: '#ff3df2', retro: '#ffd23f', chalk: '#ffffff', script: '#ff8fb8' };
    const DEFAULT_COLOR2 = '#74c4ff';
    const MAX_ITEMS = 8;
    const MAX_LEN = 40;
    const POS_MIN = -50, POS_MAX = 150;

    // Vị trí tính theo em (cỡ chữ) quanh khối chữ. `back` = nằm SAU chữ (linh vật thò đầu, chữ che nửa dưới).
    // anim: tw = lấp lánh, bob = nhún, sway = đung đưa.
    const P = (piece, pos, w, anim, back) => ({ piece, pos, w, anim: anim || '', back: !!back });
    const DECOS = [
        { id: 'none',    label: 'Không trang trí', items: [] },
        { id: 'sparkle', label: '✨ Lấp lánh + sao', items: [
            P('starFace', 'left:-.5em;top:-.45em', .72, 'bob'), P('sparkle', 'left:30%;top:-.5em', .32, 'tw'), P('sparkle', 'right:-.42em;top:20%', .36, 'tw'),
            P('sparkle', 'left:-.3em;bottom:-.25em', .26, 'tw'), P('sparkle', 'right:18%;bottom:-.4em', .3, 'tw') ] },
        { id: 'duck',    label: '🐥 Vịt hướng dương + sao', items: [
            P('duck', 'right:-.3em;top:-.72em', 1.1, 'bob'), P('starFace', 'left:-.5em;top:-.5em', .7, 'bob'), P('heart', 'right:-.42em;bottom:-.18em', .46, 'sway'),
            P('sparkle', 'left:26%;top:-.5em', .3, 'tw'), P('sparkle', 'left:-.35em;bottom:-.2em', .26, 'tw'), P('bow', 'right:-.5em;top:38%', .42, 'sway') ] },
        { id: 'bunny',   label: '🐰 Thỏ + mây + nơ', items: [
            P('bunny', 'right:-.28em;top:-.8em', 1, 'bob'), P('bow', 'left:-.55em;top:-.42em', .66, 'sway'), P('cloud', 'left:-.75em;top:42%', .72, 'bob'),
            P('heartBlue', 'left:-.3em;bottom:-.35em', .34, 'tw'), P('heartBlue', 'right:-.32em;bottom:-.3em', .34, 'tw'), P('heart', 'right:22%;top:-.38em', .3, 'tw'),
            P('sparkleBlue', 'right:-.45em;top:40%', .3, 'tw') ] },
        { id: 'cat',     label: '🐱 Mèo con + tim', items: [
            P('cat', 'left:-.25em;top:-.78em', .95, 'bob'), P('heart', 'right:-.4em;top:-.3em', .5, 'sway'), P('heart', 'right:12%;bottom:-.38em', .32, 'tw'),
            P('sparkle', 'left:-.38em;bottom:-.2em', .28, 'tw'), P('sparkle', 'right:-.32em;bottom:20%', .26, 'tw') ] },
        { id: 'bear',    label: '🧸 Gấu bông + nơ', items: [
            P('bear', 'right:-.25em;top:-.78em', .95, 'bob'), P('bow', 'left:-.55em;top:-.4em', .62, 'sway'), P('sparkle', 'left:30%;top:-.48em', .3, 'tw'),
            P('heart', 'left:-.35em;bottom:-.3em', .36, 'tw'), P('sparkle', 'right:-.4em;bottom:-.1em', .3, 'tw') ] },
        { id: 'flowers', label: '🌸 Hoa xuân', items: [
            P('flower', 'left:-.5em;top:-.4em', .62, 'sway'), P('flower', 'right:-.45em;bottom:-.35em', .55, 'sway'), P('flower', 'right:28%;top:-.42em', .34, 'tw'),
            P('sparkle', 'right:-.38em;top:-.25em', .3, 'tw'), P('sparkle', 'left:-.3em;bottom:-.2em', .26, 'tw') ] },
        { id: 'royal',   label: '👑 Vương miện', items: [
            P('crown', 'left:2%;top:-.66em', .74, 'sway'), P('sparkle', 'left:-.4em;top:10%', .34, 'tw'), P('sparkle', 'right:-.4em;top:-.3em', .38, 'tw'),
            P('sparkle', 'right:20%;bottom:-.4em', .28, 'tw'), P('starFace', 'right:-.5em;bottom:-.35em', .5, 'bob') ] }
    ];

    const STYLE_IDS = new Set(STYLES.map(s => s.id));
    const ANIM_IDS = new Set(ANIMS.map(a => a.id));
    const DECO_IDS = new Set(DECOS.map(d => d.id));
    const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
    const hex = (v) => /^#[0-9a-f]{6}$/i.test(v || '') ? v.toLowerCase() : '';

    function normalizeItem(it, i) {
        it = it && typeof it === 'object' ? it : {};
        return {
            id: String(it.id || ('jt' + Date.now().toString(36) + i)).slice(0, 24),
            text: String(it.text ?? '').replace(/\r/g, '').slice(0, MAX_LEN),
            style: STYLE_IDS.has(it.style) ? it.style : 'candy',
            anim: ANIM_IDS.has(it.anim) ? it.anim : 'none',
            deco: DECO_IDS.has(it.deco) ? it.deco : 'none',
            flip: !!it.flip,
            x: clamp(it.x, POS_MIN, POS_MAX, 50),
            y: clamp(it.y, POS_MIN, POS_MAX, 60),
            size: clamp(it.size, 4, 30, 12),
            rot: clamp(it.rot, -45, 45, 0),
            color: hex(it.color),
            color2: hex(it.color2)
        };
    }
    function normalizeList(list) {
        return (Array.isArray(list) ? list : []).slice(0, MAX_ITEMS).map(normalizeItem);
    }
    // ===== Biến tự điền theo LIVE (engine Hũ gọi fillVars với số liệu hiện tại) =====
    const VARS = [
        { k: '{top1}', label: 'Tên TOP 1' }, { k: '{top2}', label: 'Tên TOP 2' }, { k: '{top3}', label: 'Tên TOP 3' },
        { k: '{top1xu}', label: 'Xu của TOP 1' }, { k: '{tong}', label: 'Tổng xu' }, { k: '{qua}', label: 'Số quà' },
        { k: '{muctieu}', label: 'Mục tiêu' }, { k: '{phantram}', label: '% mục tiêu' }
    ];
    const fmtNum = (n) => { n = Math.round(Number(n) || 0); return n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + 'Tr' : n >= 1e4 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace('.', ',') + 'K' : n.toLocaleString('vi-VN'); };
    const shortName = (s) => { s = String(s || '').trim(); return s.length > 14 ? s.slice(0, 13) + '…' : s; };
    // data: { top: [{name, xu}], tong, qua, muctieu }
    function fillVars(text, data) {
        if (!text || text.indexOf('{') < 0) return text;
        const d = data || {}, top = d.top || [];
        const pct = d.muctieu ? Math.min(999, Math.floor((d.tong || 0) / d.muctieu * 100)) : 0;
        const map = {
            '{top1}': shortName(top[0]?.name) || '???', '{top2}': shortName(top[1]?.name) || '???', '{top3}': shortName(top[2]?.name) || '???',
            '{top1xu}': fmtNum(top[0]?.xu), '{tong}': fmtNum(d.tong), '{qua}': fmtNum(d.qua), '{muctieu}': fmtNum(d.muctieu), '{phantram}': pct + '%'
        };
        return text.replace(/\{[a-z0-9]+\}/gi, (m) => (m.toLowerCase() in map ? map[m.toLowerCase()] : m)).slice(0, MAX_LEN + 20);
    }
    function newItem(n) {
        return normalizeItem({ id: 'jt' + Date.now().toString(36), text: 'HP Media', style: 'puffy', anim: 'float', deco: 'sparkle', x: 50, y: 55 + (n || 0) * 8 % 30, size: 12 });
    }

    // Vẽ 1 chữ vào phần tử `el` (div.tt-jt).
    // Cấu trúc: .tt-jt (vị trí + xoay) > .tt-jt-box (hiệu ứng động + nền nhãn + sticker .tt-jt-d)
    //           > .tt-jt-in (mỗi dòng; ::before = viền/khối 3D) > span (màu tô).
    function paint(el, it) {
        el.className = `tt-jt tt-jt-${it.style}` + (it.anim !== 'none' ? ` tt-jt-a-${it.anim}` : '');
        el.dataset.id = it.id;
        el.style.left = it.x + '%';
        el.style.top = it.y + '%';
        el.style.setProperty('--jt-s', String(it.size));
        el.style.setProperty('--jt-r', it.rot + 'deg');
        const c = it.color || DEFAULT_COLOR[it.style];
        if (c) el.style.setProperty('--jt-c', c); else el.style.removeProperty('--jt-c');
        el.style.setProperty('--jt-c2', it.color2 || DEFAULT_COLOR2);
        const text = it.text || ' ';
        const st = STYLES.find(s => s.id === it.style) || {};
        const raw = text.split('\n');
        const canvasStyle = typeof self !== 'undefined' && self.HpJarText3D && self.HpJarText3D.CANVAS_STYLES.has(it.style);
        const lines = st.sub ? (raw.length > 1 ? [raw[0], raw.slice(1).join(' ')] : raw) : (st.lines || canvasStyle) ? raw : [text];
        const key = [it.style, it.deco, it.flip, it.anim === 'shine', it.color, it.color2, lines.join('\u0001')].join('|');
        let box = el.firstElementChild;
        if (!box || box.className !== 'tt-jt-box') { el.textContent = ''; box = document.createElement('div'); box.className = 'tt-jt-box'; el.appendChild(box); }
        if (box.dataset.k === key) return;
        box.dataset.k = key;
        box.textContent = '';
        const R3 = typeof self !== 'undefined' ? self.HpJarText3D : null;
        const deco = DECOS.find(d => d.id === it.deco);
        (deco && R3 ? deco.items : []).forEach((d, i) => {
            const s = document.createElement('img');
            s.className = `tt-jt-d${d.back ? ' back' : ''}${d.anim ? ' ' + d.anim : ''}`;
            const pos = it.flip ? d.pos.replace(/\b(left|right):/g, (m, k) => (k === 'left' ? 'right:' : 'left:')) : d.pos;
            s.style.cssText = `${pos};width:${d.w}em;animation-delay:${(-i * 0.37).toFixed(2)}s`;
            s.alt = '';
            s.draggable = false;
            s.src = R3.sticker(d.piece);
            box.appendChild(s);
        });
        // Kiểu khối → 1 canvas 3D (vẽ lại khi font Baloo 2 nạp xong)
        if (R3 && R3.CANVAS_STYLES.has(it.style)) {
            el._jtIt = it;
            const c1 = it.color || DEFAULT_COLOR[it.style] || '#ff8fc0', c2 = it.color2 || DEFAULT_COLOR2;
            const rows = lines.map((t, i) => ({ text: t || ' ', scale: st.sub && i ? 0.45 : 1, color: st.lines && i % 2 ? c2 : c1 }));
            const out = R3.render(it.style, rows, c1);
            const cv = out.canvas;
            cv.className = 'tt-jt-cv';
            cv.style.width = (cv.width / out.F).toFixed(3) + 'em';
            cv.style.margin = (-out.pad / out.F).toFixed(3) + 'em';
            box.appendChild(cv);
            if (it.anim === 'shine') {
                const sh = document.createElement('div');
                sh.className = 'tt-jt-shine';
                const u = `url(${cv.toDataURL()})`;
                sh.style.cssText = `left:${(-out.pad / out.F).toFixed(3)}em;top:${(-out.pad / out.F).toFixed(3)}em;width:${(cv.width / out.F).toFixed(3)}em;height:${(cv.height / out.F).toFixed(3)}em;-webkit-mask-image:${u};mask-image:${u}`;
                box.appendChild(sh);
            }
            if (typeof document !== 'undefined' && document.fonts && !document.fonts.check(R3.FONT(1))) {
                document.fonts.load(R3.FONT(1), text).then(() => {
                    if (!el.isConnected || !document.fonts.check(R3.FONT(1))) return;
                    box.dataset.k = '';
                    paint(el, el._jtIt);
                }).catch(() => {});
            }
            return;
        }
        lines.forEach((line, i) => {
            const inner = document.createElement('div');
            inner.className = 'tt-jt-in' + (st.sub && i ? ' tt-jt-sub' : '') + (st.lines && i % 2 ? ' tt-jt-alt' : '');
            inner.dataset.t = line || ' ';
            const span = document.createElement('span');
            span.textContent = line || ' ';
            inner.appendChild(span);
            box.appendChild(inner);
        });
    }

    return { STYLES, ANIMS, DECOS, VARS, DEFAULT_COLOR, DEFAULT_COLOR2, MAX_ITEMS, MAX_LEN, POS_MIN, POS_MAX, normalizeItem, normalizeList, newItem, fillVars, paint };
});
