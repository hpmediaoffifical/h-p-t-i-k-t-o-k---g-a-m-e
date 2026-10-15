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
        { id: 'tet',     label: '🧧 Tết (mai + lì xì)', scale: 1.45, items: [
            P('mai', 'left:-.55em;top:-.45em', .7, 'sway'), P('lixi', 'right:-.5em;top:-.55em', .62, 'sway'), P('mai', 'right:-.35em;bottom:-.3em', .42, 'tw'),
            P('sparkle', 'left:34%;top:-.5em', .3, 'tw'), P('sparkle', 'left:-.35em;bottom:-.15em', .28, 'tw') ] },
        { id: 'valentine', label: '💘 Valentine (tim)', scale: 1.45, items: [
            P('heart', 'right:-.5em;top:-.5em', .66, 'sway'), P('heart', 'left:-.45em;top:-.3em', .42, 'tw'), P('heart', 'right:22%;bottom:-.42em', .32, 'tw'),
            P('bow', 'left:-.55em;bottom:-.3em', .5, 'sway'), P('sparkle', 'left:38%;top:-.5em', .28, 'tw') ] },
        { id: 'women',   label: '🌷 8/3 · 20/10 (hoa + nơ)', scale: 1.45, items: [
            P('flower', 'left:-.55em;top:-.45em', .66, 'sway'), P('bow', 'right:-.5em;top:-.5em', .6, 'sway'), P('flower', 'right:-.4em;bottom:-.35em', .48, 'sway'),
            P('heart', 'left:-.3em;bottom:-.3em', .32, 'tw'), P('sparkle', 'left:40%;top:-.5em', .28, 'tw') ] },
        { id: 'summer',  label: '🏖 Hè (mặt trời + dưa hấu)', scale: 1.45, items: [
            P('sun', 'right:-.55em;top:-.65em', .78, 'bob'), P('watermelon', 'left:-.55em;bottom:-.4em', .62, 'sway'), P('sparkleBlue', 'left:-.35em;top:-.3em', .32, 'tw'),
            P('sparkle', 'right:24%;bottom:-.42em', .28, 'tw') ] },
        { id: 'trungthu', label: '🏮 Trung Thu (đèn lồng + trăng)', scale: 1.45, items: [
            P('lantern', 'left:-.5em;top:-.75em', .62, 'sway'), P('moon', 'right:-.55em;top:-.6em', .72, 'bob'), P('bunny', 'right:-.4em;bottom:-.55em', .55, 'bob'),
            P('sparkle', 'left:36%;top:-.5em', .28, 'tw'), P('sparkle', 'left:-.35em;bottom:-.2em', .26, 'tw') ] },
        { id: 'halloween', label: '🎃 Halloween (bí ngô + dơi + ma)', scale: 1.45, items: [
            P('pumpkin', 'left:-.6em;bottom:-.45em', .72, 'bob'), P('bat', 'right:-.55em;top:-.55em', .72, 'sway'), P('ghost', 'left:-.45em;top:-.6em', .5, 'bob'),
            P('sparkle', 'right:20%;bottom:-.42em', .26, 'tw') ] },
        { id: 'noel',    label: '🎄 Noel (mũ + thông + tuyết)', scale: 1.45, items: [
            P('santaHat', 'left:-.38em;top:-.62em', .7, 'sway'), P('tree', 'right:-.55em;bottom:-.3em', .62, 'bob'), P('snowflake', 'right:-.3em;top:-.45em', .4, 'tw'),
            P('snowflake', 'left:-.35em;bottom:-.25em', .3, 'tw'), P('snowflake', 'left:46%;top:-.48em', .24, 'tw') ] },
        { id: 'quockhanh', label: '🇻🇳 Quốc khánh (cờ + sao)', scale: 1.45, items: [
            P('flagVN', 'left:-.65em;top:-.6em', .78, 'sway'), P('starFace', 'right:-.5em;top:-.45em', .58, 'bob'), P('sparkle', 'right:-.35em;bottom:-.2em', .3, 'tw'),
            P('sparkle', 'left:40%;top:-.5em', .28, 'tw') ] },
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
    // ===== 🎁 Bộ chữ mẫu theo mùa — bấm 1 lần là có chữ + kiểu + màu + sticker + vị trí =====
    // when(d): true nếu ngày d nằm trong dịp. Tết / Trung Thu theo âm lịch (bảng ngày dương 2026–2030).
    const TET = { 2026: '02-17', 2027: '02-06', 2028: '01-26', 2029: '02-13', 2030: '02-03' };
    const TRUNG_THU = { 2026: '09-25', 2027: '09-15', 2028: '10-03', 2029: '09-22', 2030: '09-12' };
    const md = (d) => (d.getMonth() + 1) * 100 + d.getDate();               // 15/10 → 1015
    const within = (d, from, to) => { const v = md(d); return from <= to ? v >= from && v <= to : v >= from || v <= to; };
    const nearLunar = (d, table, before, after) => [d.getFullYear() - 1, d.getFullYear(), d.getFullYear() + 1].some(y => {
        if (!table[y]) return false;
        const t = new Date(`${y}-${table[y]}T00:00:00`), diff = (d - t) / 864e5;
        return diff >= -before && diff <= after;
    });
    const T = (text, style, deco, extra) => ({ text, style, deco, anim: 'float', x: 50, y: 46, size: 13, rot: -4, ...extra });
    const PRESETS = [
        { id: 'tet', label: '🧧 Tết Nguyên Đán', when: d => nearLunar(d, TET, 14, 10), items: [
            T('Chúc Mừng\nNăm Mới', 'puffy', 'tet', { color: '#ff3b3b', color2: '#ffc21a' }),
            T('An Khang Thịnh Vượng', 'gold', 'none', { y: 78, size: 7, rot: 0, anim: 'shine' }) ] },
        { id: 'valentine', label: '💘 Valentine', when: d => within(d, 207, 215), items: [
            T('Happy\nValentine', 'puffy', 'valentine', { color: '#ff4f8b', color2: '#ff9ec4', anim: 'pulse' }) ] },
        { id: 'women83', label: '🌷 Quốc tế Phụ nữ 8/3', when: d => within(d, 301, 309), items: [
            T('Mừng ngày Phụ Nữ\n8 · 3', 'plaque', 'women', { color: '#ff7eb6', size: 8.5 }) ] },
        { id: 'women2010', label: '🌷 Phụ nữ Việt Nam 20/10', when: d => within(d, 1013, 1021), items: [
            T('Mừng ngày Phụ Nữ\n20 · 10', 'plaque', 'women', { color: '#ff6fa8', size: 8.5 }) ] },
        { id: 'xuan', label: '🌸 Mùa xuân', when: d => within(d, 201, 430), items: [
            T('Hello\nSpring', 'puffy', 'flowers', { color: '#ff8fc0', color2: '#7fcf6e' }) ] },
        { id: 'he', label: '🏖 Mùa hè', when: d => within(d, 501, 831), items: [
            T('Summer\nVibes', 'puffy', 'summer', { color: '#ffa526', color2: '#2fbfff' }) ] },
        { id: 'quockhanh', label: '🇻🇳 Quốc khánh 2/9', when: d => within(d, 828, 903), items: [
            T('Mừng\nQuốc Khánh', 'puffy', 'quockhanh', { color: '#e8202a', color2: '#ffcd00' }),
            T('2 · 9', 'gold', 'none', { y: 77, size: 9, rot: 0, anim: 'shine' }) ] },
        { id: 'trungthu', label: '🏮 Trung Thu', when: d => nearLunar(d, TRUNG_THU, 12, 3), items: [
            T('Trung Thu\nVui Vẻ', 'puffy', 'trungthu', { color: '#ffb31a', color2: '#ff5a3c' }) ] },
        { id: 'halloween', label: '🎃 Halloween', when: d => within(d, 1020, 1101), items: [
            T('Happy\nHalloween', 'puffy', 'halloween', { color: '#ff8a1f', color2: '#9b5cff', anim: 'wiggle' }) ] },
        { id: 'noel', label: '🎄 Giáng sinh', when: d => within(d, 1201, 1226), items: [
            T('Merry\nChristmas', 'puffy', 'noel', { color: '#e8323c', color2: '#27a85a' }) ] },
        { id: 'top', label: '👑 Vinh danh TOP 1 (tự đổi)', items: [
            T('{top1}\nTOP 1 · {top1xu} xu', 'plaque', 'royal', { color: '#f5a300', size: 10, y: 16, rot: 0, anim: 'none' }) ] },
        { id: 'goal', label: '🎯 Mục tiêu (tự đổi)', items: [
            T('Mục tiêu {phantram}', 'sticker', 'sparkle', { color: '#2fb4ff', y: 80, size: 8, rot: 0 }) ] },
        { id: 'thanks', label: '💗 Cảm ơn cả nhà', items: [
            T('Cảm ơn\ncả nhà', 'puffy', 'bunny', { color: '#ff8fc0', color2: '#74c4ff' }) ] },
        { id: 'brand', label: '✨ HP Media', items: [
            T('HP Media', 'puffy', 'duck', { color: '#ff8fc0', y: 16, rot: -3 }) ] }
    ];
    // Danh sách id bộ mẫu ĐÚNG DỊP hôm nay (dịp lễ đứng trước mùa).
    function presetsFor(date) {
        const d = date instanceof Date ? date : new Date();
        return PRESETS.filter(p => p.when && p.when(d)).map(p => p.id);
    }
    // Tạo danh sách chữ từ 1 bộ mẫu (id mới, đã chuẩn hoá).
    function presetItems(id) {
        const p = PRESETS.find(x => x.id === id);
        const t = Date.now().toString(36);
        return p ? p.items.map((it, i) => normalizeItem({ ...it, id: 'jt' + t + i })) : [];
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
            const k = deco.scale || 1;   // bộ theo mùa phóng to cả cỡ lẫn khoảng cách (em) để cân với chữ
            let pos = k === 1 ? d.pos : d.pos.replace(/-?\d*\.?\d+em/g, v => (parseFloat(v) * k).toFixed(3) + 'em');
            if (it.flip) pos = pos.replace(/\b(left|right):/g, (m, q) => (q === 'left' ? 'right:' : 'left:'));
            s.style.cssText = `${pos};width:${(d.w * k).toFixed(3)}em;animation-delay:${(-i * 0.37).toFixed(2)}s`;
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

    return { PRESETS, presetsFor, presetItems, STYLES, ANIMS, DECOS, VARS, DEFAULT_COLOR, DEFAULT_COLOR2, MAX_ITEMS, MAX_LEN, POS_MIN, POS_MAX, normalizeItem, normalizeList, newItem, fillVars, paint };
});
