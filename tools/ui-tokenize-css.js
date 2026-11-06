#!/usr/bin/env node
// 🎨 Giao diện mới — "tokenize" public/style.css:
//   màu cứng trong background*/color/border*/outline → var(--bg|fg|bd-<khoá>, <màu cũ y nguyên>)
// Biến CHỈ khai báo trong public/ui/ui-v2-map.css (sinh ra ở đây, phạm vi body.ui-v2, chỉ index.html nạp).
// Overlay OBS nạp /style.css không khai báo biến → var() rơi về màu cũ → vẽ y hệt cũ.
// Bỏ qua: comment, chuỗi, url(), @keyframes, @font-face, custom property (--x), box-shadow/text-shadow/filter…
// Rule có nền màu nhấn (hồng/xanh… bão hoà) → giữ nguyên `color` (chữ trắng trên nút gradient).
// Chạy: node tools/ui-tokenize-css.js   (idempotent; tự kiểm untokenize(kết quả) === bản gốc trước khi ghi)
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const VAR_RE = /var\(--(bg|fg|bd)-([a-z0-9_]+), ((?:[^()]|\([^()]*\))+?)\)/g;
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\b(?:white|black)\b/g;

function colorKey(text) {
    const t = String(text).trim().toLowerCase();
    if (t[0] === '#') return t.slice(1);
    const m = /^(rgba?)\((.*)\)$/.exec(t);
    if (m) return m[1] + '_' + m[2].replace(/[^0-9a-z]+/g, '_').replace(/^_|_$/g, '');
    return t;
}

function kindOf(prop) {
    const p = prop.trim().toLowerCase();
    if (p.startsWith('--')) return null;
    if (p === 'color') return 'fg';
    if (p === 'background' || p === 'background-color' || p === 'background-image') return 'bg';
    if (/^border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?$/.test(p)) return 'bd';
    if (p === 'outline' || p === 'outline-color') return 'bd';
    return null;
}

function parseColor(text) {
    const t = String(text).trim().toLowerCase();
    if (t === 'white') return { r: 255, g: 255, b: 255, a: 1 };
    if (t === 'black') return { r: 0, g: 0, b: 0, a: 1 };
    if (t[0] === '#') {
        let h = t.slice(1);
        if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
        if (h.length !== 6 && h.length !== 8) return null;
        const n = i => parseInt(h.slice(i, i + 2), 16);
        return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
    }
    const m = /^rgba?\(([^)]*)\)$/.exec(t);
    if (!m) return null;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(x => x.endsWith('%') ? parseFloat(x) * 2.55 : parseFloat(x));
    if (parts.length < 3 || parts.some(Number.isNaN)) return null;
    let a = parts.length > 3 ? parts[3] : 1;
    if (/%\s*\)?$/.test(m[1].split(/[\s,/]+/).filter(Boolean)[3] || '')) a = parts[3] / 255;
    return { r: parts[0], g: parts[1], b: parts[2], a };
}

function hsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return { h: 0, s: 0, l };
    const d = mx - mn;
    const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h * 60, s, l };
}

const isAccent = c => { const x = hsl(c); return c.a > 0.5 && x.s > 0.4 && x.l > 0.3 && x.l < 0.75; };

// Vùng không được đụng trong một giá trị: var() của ta, url(), chuỗi.
function protectedRanges(v) {
    const out = [];
    for (const re of [VAR_RE, /url\([^)]*\)/g, /"[^"]*"|'[^']*'/g]) {
        re.lastIndex = 0;
        for (const m of v.matchAll(re)) out.push([m.index, m.index + m[0].length]);
    }
    return out;
}

function tokenizeValue(value, kind) {
    const prot = protectedRanges(value);
    return value.replace(COLOR_RE, (c, at) => {
        if (prot.some(([a, b]) => at >= a && at < b)) return c;
        const key = colorKey(c);
        if (!/^[a-z0-9_]+$/.test(key) || !parseColor(c)) return c;
        return `var(--${kind}-${key}, ${c})`;
    });
}

// Quét CSS: gom khai báo theo rule, quyết định thay, áp thay thế từ cuối về đầu.
function tokenize(css) {
    const reps = [];
    const stack = [];
    let i = 0, preludeStart = 0, declStart = -1;
    const skipCtx = () => stack.some(f => /^@(-webkit-)?keyframes|^@font-face/i.test(f.prelude));
    function pushDecl(end) {
        const top = stack[stack.length - 1];
        if (!top || declStart < 0) return;
        top.decls.push([declStart, end]);
    }
    function finish(frame) {
        if (!frame.decls.length || frame.skip) return;
        const parsed = [];
        for (const [s, e] of frame.decls) {
            const raw = css.slice(s, e);
            const clean = raw.replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length));
            const ci = clean.indexOf(':');
            if (ci < 0) continue;
            const kind = kindOf(clean.slice(0, ci));
            if (!kind) continue;
            parsed.push({ s: s + ci + 1, e, kind, value: css.slice(s + ci + 1, e) });
        }
        const accentBg = parsed.some(d => d.kind === 'bg' && (d.value.match(COLOR_RE) || []).some(c => { const p = parseColor(c); return p && isAccent(p); }));
        for (const d of parsed) {
            if (d.kind === 'fg' && accentBg) continue;
            if (/\/\*/.test(d.value)) continue;
            const nv = tokenizeValue(d.value, d.kind);
            if (nv !== d.value) reps.push([d.s, d.e, nv]);
        }
    }
    while (i < css.length) {
        const ch = css[i];
        if (ch === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e < 0 ? css.length : e + 2; continue; }
        if (ch === '"' || ch === "'") { let j = i + 1; while (j < css.length && css[j] !== ch) { if (css[j] === '\\') j++; j++; } i = j + 1; continue; }
        if (ch === '(') { // url(...) / var(...) có thể chứa ; — nhảy qua cặp ngoặc
            let d = 1, j = i + 1;
            while (j < css.length && d) { if (css[j] === '(') d++; else if (css[j] === ')') d--; else if (css[j] === '"' || css[j] === "'") { const q = css[j]; j++; while (j < css.length && css[j] !== q) j++; } j++; }
            i = j; continue;
        }
        if (ch === '{') {
            const prelude = css.slice(preludeStart, i).replace(/\/\*[\s\S]*?\*\//g, '').trim();
            const frame = { prelude, decls: [], skip: false };
            frame.skip = skipCtx() || /^@(-webkit-)?keyframes|^@font-face/i.test(prelude);
            stack.push(frame);
            declStart = i + 1; preludeStart = i + 1; i++; continue;
        }
        if (ch === ';') { pushDecl(i); declStart = i + 1; preludeStart = i + 1; i++; continue; }
        if (ch === '}') {
            pushDecl(i);
            const f = stack.pop();
            if (f) finish(f);
            declStart = stack.length ? i + 1 : -1; preludeStart = i + 1; i++; continue;
        }
        i++;
    }
    reps.sort((a, b) => b[0] - a[0]);
    let out = css;
    for (const [s, e, v] of reps) out = out.slice(0, s) + v + out.slice(e);
    const vars = new Map();
    for (const m of out.matchAll(VAR_RE)) vars.set(`--${m[1]}-${m[2]}`, { kind: m[1], key: m[2], color: m[3] });
    return { css: out, vars };
}

function untokenize(css) { return css.replace(VAR_RE, (_, k, key, fb) => fb); }

// ===== Bảng ánh xạ sang tông sáng (HP NPC LIVE) =====
const hex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const ink = a => `rgba(36,27,31,${Math.round(a * 1000) / 1000})`;
function fromHsl(h, s, l) {
    const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return hex({ r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 });
}
function mapColor(kind, text) {
    const c = parseColor(text);
    if (!c) return null;
    const { h, s, l } = hsl(c);
    const neutral = s < 0.28 || l < 0.06;
    if (kind === 'bg') {
        if (c.a < 1) {
            if (neutral && l > 0.6) return ink(Math.min(c.a, 0.5) * 0.9);
            if (neutral && l < 0.3) return c.a >= 0.55 ? ink(0.35) : ink(Math.max(0.03, c.a * 0.25));
            if (!neutral && l < 0.3) return ink(Math.max(0.03, c.a * 0.2));
            return null;
        }
        if (neutral) {
            if (l < 0.08) return '#FBF5F4';
            if (l < 0.13) return '#FFFFFF';
            if (l < 0.2) return '#F8F1EF';
            if (l < 0.3) return '#F2E8E5';
            if (l < 0.45) return '#E7DAD6';
            return null;
        }
        if (l < 0.3) return fromHsl(h, Math.min(s, 0.75), 0.95);
        return null;
    }
    if (kind === 'fg') {
        if (c.a < 1) return neutral && l > 0.6 ? ink(Math.max(c.a, 0.55)) : null;
        if (neutral) {
            if (l > 0.85) return '#241B1F';
            if (l > 0.7) return '#3A2F33';
            if (l > 0.55) return '#54474B';
            if (l > 0.4) return '#6B5E62';
            return null;
        }
        if (l > 0.62) return fromHsl(h, Math.min(1, s), 0.36);
        return null;
    }
    // bd
    if (c.a < 1) {
        if (neutral && l > 0.6) return ink(Math.min(0.3, Math.max(0.06, c.a * 1.4)));
        if (neutral && l < 0.3) return ink(0.1);
        return null;
    }
    if (neutral && l < 0.45) return l < 0.2 ? '#EEE3E0' : '#DFD0CC';
    if (!neutral && l < 0.3) return fromHsl(h, s * 0.6, 0.85);
    return null;
}
function buildMap(vars) {
    const lines = [];
    const names = [];
    for (const [name, v] of [...vars].sort((a, b) => a[0].localeCompare(b[0]))) {
        names.push(name);
        const to = mapColor(v.kind, v.color);
        if (to) lines.push(`    ${name}: ${to};`);
    }
    return `/* SINH TỰ ĐỘNG bởi tools/ui-tokenize-css.js — đừng sửa tay. Ánh xạ màu cũ (tối) → tông sáng.
   Biến không có ở đây = giữ màu cũ (fallback trong style.css). */
body.ui-v2 {
${lines.join('\n')}
}
/* Khung xem trước overlay trong app: giữ đúng màu overlay (biến = initial → dùng fallback). */
body.ui-v2 .ui-keep-colors {
${names.map(n => `    ${n}: initial;`).join('\n')}
}
`;
}

module.exports = { tokenize, untokenize, colorKey, parseColor, mapColor, buildMap, VAR_RE };

if (require.main === module) {
    const root = path.join(__dirname, '..');
    const file = path.join(root, 'public', 'style.css');
    const orig = fs.readFileSync(file, 'utf8');
    const base = untokenize(orig);
    const { css, vars } = tokenize(orig);
    if (untokenize(css) !== base) throw new Error('untokenize(kết quả) khác bản gốc — dừng, không ghi');
    fs.writeFileSync(file, css);
    fs.mkdirSync(path.join(root, 'public', 'ui'), { recursive: true });
    fs.writeFileSync(path.join(root, 'public', 'ui', 'ui-v2-map.css'), buildMap(vars));
    const mapped = [...vars.values()].filter(v => mapColor(v.kind, v.color)).length;
    console.log(`style.css: ${vars.size} biến (${mapped} đổi sang tông sáng)`);
}
