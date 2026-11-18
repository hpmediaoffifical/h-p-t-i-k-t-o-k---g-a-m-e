/* HP VIP Welcome — huy hiệu Sổ Fan (test: tests/vipwelcome-fan-badge.test.js).
 * Huân chương lục giác SVG: vành kim loại vát cạnh → mặt đá quý nhiều lớp + giác cắt → biểu tượng vẽ tay (không
 * emoji) có bóng → vệt phản chiếu; ghép với tấm chữ kim loại. Không dùng filter SVG / ảnh → nhẹ cho OBS.
 * Dùng chung: thanh chào gọn, thẻ to (overlay.html) và danh sách Sổ Fan trong panel. CSS tự chèn 1 lần. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.HpFanBadge = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    // rim: vành (sáng → tối từ trên xuống); gem: mặt đá (tâm sáng → mép tối); glyph: biểu tượng (trên → dưới)
    const THEMES = {
        sop: {
            rim: ['#fff6c2', '#f2c14e', '#a8700f', '#5a3505'], gem: ['#ffffff', '#bfe9ff', '#2f86c8', '#0b2f5a'],
            glyph: ['#ffffff', '#cdf3ff'], glyphEdge: '#2a6fa8',
            plate: 'linear-gradient(180deg,#fff6cf 0%,#f7d466 44%,#c98a12 56%,#f2c24c 100%)', ink: '#3a2200',
            ts: '0 1px 0 rgba(255,255,255,.55)', edge: '#7a4c06', sparkle: true
        },
        lau: {
            rim: ['#ffffff', '#d3dde8', '#7d8ea0', '#38434f'], gem: ['#effcff', '#6ad8f0', '#137aa8', '#062d47'],
            glyph: ['#fffbe0', '#ffcf4a'], glyphEdge: '#8a5a00',
            plate: 'linear-gradient(180deg,#dcfbff 0%,#66d5ec 44%,#137ea3 56%,#3cb7d6 100%)', ink: '#ffffff',
            ts: '0 1px 1px rgba(0,40,60,.85)', edge: '#0b4a66'
        },
        fan: {
            rim: ['#fff1f7', '#f0a6c7', '#ae5381', '#55163a'], gem: ['#f9e9ff', '#c983ff', '#7a26d6', '#2e0756'],
            glyph: ['#ffd8ee', '#ff3d9a'], glyphEdge: '#8a0d4c',
            plate: 'linear-gradient(180deg,#f5e0ff 0%,#c67fff 44%,#7a2ccf 56%,#a65cf0 100%)', ink: '#ffffff',
            ts: '0 1px 1px rgba(40,0,70,.85)', edge: '#4a128a', sparkle: true
        },
        quen: {
            rim: ['#ffecd0', '#e3a660', '#8d531c', '#472405'], gem: ['#fff7db', '#ffcc52', '#d27a00', '#663000'],
            glyph: ['#fffef2', '#ffe27a'], glyphEdge: '#8a4a00',
            plate: 'linear-gradient(180deg,#fff1cf 0%,#ffc65f 44%,#c9750f 56%,#f0a83a 100%)', ink: '#3b1c00',
            ts: '0 1px 0 rgba(255,255,255,.5)', edge: '#6e3a05'
        },
        moi: {
            rim: ['#f3fff6', '#acdfbb', '#4f8c64', '#1f402b'], gem: ['#ecfff2', '#74e2a0', '#1c9a55', '#09401f'],
            glyph: ['#f6ffec', '#a6f27e'], glyphEdge: '#1d5e14',
            plate: 'linear-gradient(180deg,#e8fff0 0%,#82e4a8 44%,#1f9d5b 56%,#4cc985 100%)', ink: '#ffffff',
            ts: '0 1px 1px rgba(0,50,25,.85)', edge: '#0f5a33'
        }
    };

    function hex(r, cx = 24, cy = 24) {   // lục giác đỉnh nhọn ở trên
        const p = [];
        for (let i = 0; i < 6; i++) {
            const a = (-90 + i * 60) * Math.PI / 180;
            p.push((cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2));
        }
        return p;
    }
    function star(cx, cy, ro, ri) {
        const p = [];
        for (let i = 0; i < 10; i++) {
            const r = i % 2 ? ri : ro, a = (-90 + i * 36) * Math.PI / 180;
            p.push((cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2));
        }
        return p.join(' ');
    }
    const OUT = hex(21.5), BEV = hex(18.2), FACE = hex(15.4);
    const GLYPH = {
        sop: '<polygon points="15.5,20.5 19.6,15.2 28.4,15.2 32.5,20.5 24,33.6"/>',
        lau: '<path d="M27.6 14.4a10 10 0 1 0 6.6 15.7a8.2 8.2 0 0 1-6.6-15.7z"/><polygon points="' + star(31.2, 16.8, 3.4, 1.4) + '"/>',
        fan: '<path d="M24 33.6C15.2 27.2 13.4 20.6 17.4 17.4c2.8-2.2 5.7-.9 6.6 1.7c.9-2.6 3.8-3.9 6.6-1.7C34.6 20.6 32.8 27.2 24 33.6z"/>',
        quen: '<polygon points="' + star(24, 24.8, 10.6, 4.5) + '"/>',
        moi: '<path d="M23 33.6h2V25.2h-2z"/><path d="M24 25.8C23.6 20.2 19.6 17 14.4 17.4C14.4 22.6 18.4 25.8 24 25.8z"/><path d="M24 23.4C24.4 17.8 28.4 14.6 33.6 15C33.6 20.2 29.6 23.4 24 23.4z"/>'
    };
    // giác cắt riêng của viên kim cương (Khách sộp)
    const SOP_FACETS = '<path d="M15.5 20.5H32.5M19.6 15.2L22 20.5L24 33.6L26 20.5L28.4 15.2M22 20.5L24 15.2L26 20.5" fill="none" stroke-width=".8" stroke-linejoin="round"/>';

    function esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    let seq = 0;
    function medalSvg(id, uid) {
        const t = THEMES[id] || THEMES.quen;
        const g = GLYPH[THEMES[id] ? id : 'quen'];
        const u = esc(uid);
        const stops = (cols) => cols.map((c, i) => `<stop offset="${(i / (cols.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join('');
        const tri = (a, b, fill) => `<polygon points="24,24 ${FACE[a]} ${FACE[b]}" fill="${fill}"/>`;
        return `<svg class="fb-medal" viewBox="0 0 48 48" aria-hidden="true">`
            + `<defs>`
            + `<linearGradient id="fb-rim-${u}" x1="0" y1="0" x2="0" y2="1">${stops(t.rim)}</linearGradient>`
            + `<linearGradient id="fb-bev-${u}" x1="0" y1="0" x2="0" y2="1">${stops([t.rim[3], t.rim[2], t.rim[1], t.rim[0]])}</linearGradient>`
            + `<radialGradient id="fb-gem-${u}" cx=".38" cy=".3" r=".78">${stops(t.gem)}</radialGradient>`
            + `<linearGradient id="fb-gly-${u}" x1="0" y1="0" x2="0" y2="1">${stops(t.glyph)}</linearGradient>`
            + `</defs>`
            + `<polygon points="${OUT.join(' ')}" fill="url(#fb-rim-${u})" stroke="rgba(0,0,0,.45)" stroke-width=".9"/>`
            + `<polygon points="${BEV.join(' ')}" fill="url(#fb-bev-${u})"/>`
            + `<polygon points="${FACE.join(' ')}" fill="url(#fb-gem-${u})"/>`
            + tri(5, 0, 'rgba(255,255,255,.22)') + tri(0, 1, 'rgba(255,255,255,.12)')
            + tri(2, 3, 'rgba(0,0,0,.16)') + tri(3, 4, 'rgba(0,0,0,.24)')
            + `<g transform="translate(0 1.4)" fill="rgba(0,0,0,.42)">${g}</g>`
            + `<g fill="url(#fb-gly-${u})" stroke="${t.glyphEdge}" stroke-width=".7" stroke-linejoin="round">${g}${id === 'sop' ? SOP_FACETS : ''}</g>`
            + `<ellipse cx="17.5" cy="11.6" rx="8.6" ry="3" transform="rotate(-30 17.5 11.6)" fill="rgba(255,255,255,.55)"/>`
            + `<polyline points="${OUT[5]} ${OUT[0]} ${OUT[1]}" fill="none" stroke="rgba(255,255,255,.85)" stroke-width=".9"/>`
            + (t.sparkle ? `<polygon class="fb-twk" points="${star(40.5, 8.5, 4.2, 1.1)}" fill="#fff"/><polygon class="fb-twk fb-twk2" points="${star(8, 38.5, 3, .8)}" fill="#fff"/>` : '')
            + `</svg>`;
    }

    function badgeHtml(tier, opts) {
        if (!tier) return '';
        const o = opts || {};
        const id = THEMES[tier.id] ? tier.id : 'quen';
        const uid = o.uid != null ? String(o.uid) : 'b' + (++seq);
        return `<span class="fb fb-${id}${o.size === 'sm' ? ' fb-sm' : ''}">${medalSvg(id, uid)}<span class="fb-plate">${esc(tier.label || '')}</span></span>`;
    }

    const CSS = `
.fb{display:inline-flex;align-items:center;vertical-align:middle;position:relative;line-height:1;--fb-d:0ms}
.fb-medal{width:46px;height:46px;flex:0 0 auto;position:relative;z-index:2;overflow:visible;
  filter:drop-shadow(0 2px 2px rgba(0,0,0,.55));animation:fbFlip 900ms cubic-bezier(.2,.9,.3,1.2) var(--fb-d) both}
.fb-plate{position:relative;z-index:1;margin-left:-15px;padding:0 15px 0 22px;height:31px;display:inline-flex;align-items:center;
  border-radius:3px 16px 16px 3px;font:900 17px/1 'Segoe UI','Roboto','Inter',Arial,sans-serif;letter-spacing:.07em;text-transform:uppercase;
  white-space:nowrap;overflow:hidden;color:var(--fb-ink);background:var(--fb-plate);text-shadow:var(--fb-ts);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.8),inset 0 -2px 0 rgba(0,0,0,.28),0 0 0 1px var(--fb-edge),0 0 0 2.5px rgba(0,0,0,.3),0 3px 6px rgba(0,0,0,.5);
  animation:fbPlate 520ms cubic-bezier(.2,.9,.3,1) calc(var(--fb-d) + 220ms) both}
.fb-plate::after{content:'';position:absolute;top:-6px;bottom:-6px;left:0;width:30px;
  background:linear-gradient(100deg,transparent,rgba(255,255,255,.85),transparent);transform:translateX(-50px) skewX(-20deg);
  animation:fbGlint 2600ms ease-out calc(var(--fb-d) + 700ms) var(--fb-glints,1) both}
.fb-sop,.fb-fan{--fb-glints:3}
.fb-twk{transform-box:fill-box;transform-origin:center;animation:fbTwk 1600ms ease-in-out calc(var(--fb-d) + 600ms) infinite both}
.fb-twk2{animation-delay:calc(var(--fb-d) + 1400ms)}
.fb-sm .fb-medal{width:28px;height:28px}
.fb-sm .fb-plate{height:20px;font-size:11.5px;margin-left:-9px;padding:0 9px 0 13px;border-radius:3px 10px 10px 3px}
@keyframes fbFlip{0%{transform:perspective(160px) rotateY(-260deg) scale(.4);opacity:0}55%{opacity:1}100%{transform:perspective(160px) rotateY(0) scale(1);opacity:1}}
@keyframes fbPlate{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes fbGlint{0%{transform:translateX(-50px) skewX(-20deg)}40%,100%{transform:translateX(320px) skewX(-20deg)}}
@keyframes fbTwk{0%,100%{transform:scale(.2) rotate(0);opacity:0}45%{transform:scale(1) rotate(45deg);opacity:1}}
` + Object.keys(THEMES).map(k => `.fb-${k}{--fb-plate:${THEMES[k].plate};--fb-ink:${THEMES[k].ink};--fb-ts:${THEMES[k].ts};--fb-edge:${THEMES[k].edge}}`).join('\n');

    function injectCss(doc) {
        doc = doc || (typeof document !== 'undefined' ? document : null);
        if (!doc || doc.getElementById('hp-fan-badge-css')) return;
        const s = doc.createElement('style');
        s.id = 'hp-fan-badge-css';
        s.textContent = CSS;
        (doc.head || doc.documentElement).appendChild(s);
    }

    /** Phần tử DOM; delayMs = lúc huy hiệu bắt đầu lật vào (khớp nhịp thanh chào). */
    function badgeEl(tier, opts) {
        injectCss();
        const wrap = document.createElement('span');
        wrap.innerHTML = badgeHtml(tier, opts);
        const node = wrap.firstChild;
        if (node && opts && opts.delayMs) node.style.setProperty('--fb-d', Math.max(0, opts.delayMs) + 'ms');
        return node;
    }

    return { THEMES, badgeHtml, badgeEl, injectCss };
});
