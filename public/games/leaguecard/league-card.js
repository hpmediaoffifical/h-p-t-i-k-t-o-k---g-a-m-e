/* 🏆 Thẻ Giải Đấu — bộ vẽ dùng chung cho overlay OBS và khung xem trước trong app.
   window.HpLeagueCard = { DEFAULTS, SKINS, STYLES, normalizeCfg, createRenderer(root) }
   createRenderer(root, {baseScale?}) · renderer.setCfg(cfg) · renderer.setGifts(list) · renderer.update(snapshot, events)
   snapshot = lib/league-card.js tracker.snapshot() (gửi qua socket 'league:state').
   CSS: league-card.css · Spec: docs/superpowers/specs/2026-10-30-leaguecard-design.md */
(function () {
    'use strict';
    // Phải khớp makeDefaultLeagueCardConfig() trong server.js
    const DEFAULTS = { enabled: true, style: 'A', skin: 'royal', xPercent: 97, yPercent: 4, scale: 100, maxStars: 5, golden: false,
        autoCollapse: true, collapseAfterSec: 20, convertMode: 'auto', convertGifts: [], rescuer: true, dangerMinutes: 30 };
    const STYLES = { A: 'A · Khiên + bảng', B: 'B · Thanh gọn', C: 'C · Vòng tiến độ' };

    const SHAPES = {
        shield: ['M48 4 L90 17 V54 C90 81 70 98 48 105 C26 98 6 81 6 54 V17 Z', 'M48 15 L79 25 V54 C79 74 65 87 48 93 C31 87 17 74 17 54 V25 Z'],
        hex: ['M48 4 L90 28 V80 L48 104 L6 80 V28 Z', 'M48 16 L80 34 V74 L48 92 L16 74 V34 Z'],
        circle: ['M48 10 a44 44 0 1 0 0.01 0 Z', 'M48 19 a35 35 0 1 0 0.01 0 Z'],
        diamond: ['M48 2 L92 54 L48 106 L4 54 Z', 'M48 16 L80 54 L48 92 L16 54 Z'],
        lantern: ['M30 8 H66 L72 16 C92 30 92 80 72 94 L66 102 H30 L24 94 C4 80 4 30 24 16 Z', 'M48 10 V100 M34 12 C22 40 22 70 34 98 M62 12 C74 40 74 70 62 98'],
        octagon: ['M30 6 H66 L90 30 V78 L66 102 H30 L6 78 V30 Z', 'M34 16 H62 L80 34 V74 L62 92 H34 L16 74 V34 Z'],
        seal: ['M16 10 H80 Q88 10 88 18 V90 Q88 98 80 98 H16 Q8 98 8 90 V18 Q8 10 16 10 Z', 'M19 21 H77 V87 H19 Z'],
        leaf: ['M48 4 C82 22 92 62 48 104 C4 62 14 22 48 4 Z', 'M48 14 V96 M48 40 L66 28 M48 40 L30 28 M48 64 L70 50 M48 64 L26 50'],
        pumpkin: ['M48 20 C70 12 93 28 91 60 C89 94 66 102 48 98 C30 102 7 94 5 60 C3 28 26 12 48 20 Z M44 4 H54 L52 20 H46 Z', 'M48 22 C35 42 35 80 48 97 M48 22 C61 42 61 80 48 97 M28 26 C16 46 18 82 34 96 M68 26 C80 46 78 82 62 96'],
        burst: [(function () { let d = ''; for (let i = 0; i < 28; i++) { const a = i / 28 * 2 * Math.PI - Math.PI / 2, r = i % 2 ? 34 : 50; d += (i ? 'L' : 'M') + (48 + Math.cos(a) * r).toFixed(1) + ' ' + (54 + Math.sin(a) * r).toFixed(1) + ' '; } return d + 'Z'; })(), ''],
        pixel: ['M16 8 H80 V16 H88 V56 H80 V72 H72 V84 H64 V92 H56 V100 H40 V92 H32 V84 H24 V72 H16 V56 H8 V16 H16 Z', ''],
    };
    const SKINS = {
        royal: { name: 'Hoàng gia', shape: 'shield' },
        neon: { name: 'Neon Cyber', shape: 'hex' },
        glass: { name: 'Kính trong', shape: 'circle' },
        esports: { name: 'Esports', shape: 'hex' },
        fire: { name: 'Lửa', shape: 'shield', fx: ['ember', 14] },
        ice: { name: 'Băng giá', shape: 'diamond', fx: ['snow', 14] },
        candy: { name: 'Kẹo ngọt', shape: 'circle', fx: ['heart', 6] },
        tet: { name: 'Tết', shape: 'lantern', fx: ['petal', 9] },
        pixel: { name: 'Pixel 8-bit', shape: 'pixel' },
        galaxy: { name: 'Thiên hà', shape: 'diamond', fx: ['stars', 12] },
        ocean: { name: 'Đại dương', shape: 'circle', fx: ['bubble', 10] },
        jungle: { name: 'Rừng xanh', shape: 'leaf', fx: ['leaf', 8] },
        crystal: { name: 'Pha lê holo', shape: 'diamond', fx: ['stars', 10] },
        synth: { name: 'Synthwave 80s', shape: 'hex' },
        comic: { name: 'Truyện tranh', shape: 'burst' },
        halloween: { name: 'Halloween', shape: 'pumpkin', fx: ['bat', 4] },
        xmas: { name: 'Giáng sinh', shape: 'circle', fx: ['snow', 14] },
        ink: { name: 'Thủy mặc', shape: 'seal' },
        carbon: { name: 'Siêu xe carbon', shape: 'octagon' },
        jade: { name: 'Ngọc bích', shape: 'octagon' },
    };

    function clampNum(v, lo, hi, d) { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; }
    function normalizeCfg(c) {
        const x = Object.assign({}, DEFAULTS, c || {});
        if (!STYLES[x.style]) x.style = 'A';
        if (!SKINS[x.skin]) x.skin = 'royal';
        x.xPercent = clampNum(x.xPercent, 5, 100, 97);
        x.yPercent = clampNum(x.yPercent, 0, 95, 4);
        x.scale = clampNum(x.scale, 40, 250, 100);
        x.maxStars = Math.round(clampNum(x.maxStars, 1, 10, 5));
        x.collapseAfterSec = clampNum(x.collapseAfterSec, 5, 600, 20);
        if (!['auto', 'manual', 'off'].includes(x.convertMode)) x.convertMode = 'auto';
        x.convertGifts = Array.isArray(x.convertGifts) ? x.convertGifts.map(String).slice(0, 2) : [];
        return x;
    }

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');
    function fmtLeft(ms) {
        if (ms == null || !(ms > 0)) return '00:00';
        const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
        const p = (v) => String(v).padStart(2, '0');
        return h ? `${p(h)}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
    }

    let uid = 0;
    function shield(div, skin) {
        const id = 'lcg' + (++uid);
        const [face, inner] = SHAPES[SKINS[skin].shape];
        return `<div class="sh"><div class="halo"></div><svg viewBox="0 0 96 108"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:#fff;stop-opacity:.9"/><stop offset=".2" style="stop-color:var(--c1)"/><stop offset=".75" style="stop-color:var(--c2)"/><stop offset="1" style="stop-color:#140c1c"/></linearGradient></defs><path class="face" fill="url(#${id})" d="${face}"/>${inner ? `<path class="inner" d="${inner}"/>` : ''}</svg><div class="txt"><div class="dv">${esc(div || '?')}</div><div class="sub">GIẢI ĐẤU</div></div><i class="rip"></i><i class="rip"></i></div>`;
    }
    function starsHtml(stars, max, f) {
        const shown = Math.min(max, 5); let h = '';
        for (let i = 0; i < shown; i++) {
            let c = 'st'; if (i < stars) c += ' f'; if (f.gain === i) c += ' gain'; if (f.loss === i) c += ' loss';
            h += `<span class="${c}" style="--i:${i}"><i></i></span>`;
        }
        if (max > 5 || stars > 5) h += `<span class="more">${stars}/${max}</span>`;
        return `<div class="stars">${h}</div>`;
    }
    function fxHtml(skin) {
        const fx = SKINS[skin].fx; if (!fx) return '';
        const [type, n] = fx; let h = '';
        const glyph = type === 'petal' ? '✿' : type === 'heart' ? '❤' : type === 'bat' ? '🦇' : '';
        for (let i = 0; i < n; i++) {
            const left = Math.round(Math.random() * 100), top = Math.round(Math.random() * 100);
            h += `<i style="left:${left}%;${type === 'stars' || type === 'bat' ? `top:${top}%;` : ''}--dx:${Math.round(Math.random() * 60 - 30)}px;animation-delay:-${(Math.random() * 4).toFixed(2)}s">${glyph}</i>`;
        }
        return `<div class="fx fx-${type}">${h}</div>`;
    }
    function confetti() {
        let h = ''; const cols = ['#ffd84a', '#3ee08f', '#ff4d6d', '#b98cff', '#fff', '#6fd9ff'];
        for (let i = 0; i < 34; i++) {
            const a = Math.PI * (0.5 + Math.random()), r = 140 + Math.random() * 220;
            h += `<i style="background:${cols[i % 6]};--x:${Math.cos(a) * r}px;--y:${Math.sin(a) * r * 0.8 + 120}px;--r:${Math.random() * 900}deg;animation-delay:${Math.random() * 0.2}s"></i>`;
        }
        return `<div class="conf">${h}</div>`;
    }

    /** Quy "thiếu X điểm" ra số quà. auto = quà đắt nhất ≤ X + quà rẻ nhất; manual = quà streamer chọn. 1 điểm ≈ 1 xu (giả định). */
    function pickConvert(need, cfg, gifts) {
        if (!(need > 0) || cfg.convertMode === 'off' || !Array.isArray(gifts) || !gifts.length) return [];
        const priced = gifts.filter((g) => g && Number(g.diamond) > 0 && g.image && !g.virtual);
        let picks = [];
        if (cfg.convertMode === 'manual') {
            picks = cfg.convertGifts.map((id) => priced.find((g) => String(g.id) === id)).filter(Boolean);
        } else {
            const sorted = priced.slice().sort((a, b) => a.diamond - b.diamond);
            const big = sorted.filter((g) => g.diamond <= need).pop();
            const small = sorted[0];
            picks = [big, small].filter(Boolean);
            if (picks.length === 2 && picks[0].id === picks[1].id) picks.pop();
        }
        return picks.map((g) => ({ n: Math.ceil(need / g.diamond), img: g.image, name: g.name }));
    }
    function convHtml(list) {
        if (!list.length) return '';
        return `<span class="conv">≈ ${list.map((c) => `<b>${fmt(c.n)}</b><img src="${esc(c.img)}" alt="${esc(c.name)}" title="${esc(c.name)}">`).join('<span class="or">·</span>')}</span>`;
    }
    function avatar(d) {
        if (d.profilePicture) return `<img class="av" src="${esc(d.profilePicture)}" alt="">`;
        return `<span class="av">${esc((d.nickname || d.uniqueId || '?').trim().charAt(0).toUpperCase())}</span>`;
    }

    function createRenderer(root, opts) {
        const fixedBase = opts && opts.baseScale;   // khung xem trước: cỡ cố định thay vì theo bề ngang 1080
        let cfg = normalizeCfg(null), gifts = [], snap = null;
        let shown = false, lastKey = '', prevRank = null, collapseT = null, tickT = null, pending = [], flushT = null;

        function tierCls(l, s) {
            const t = l && l.division ? 't' + l.division[0] : 'tB';
            const warn = !s.danger && s.keepPct != null && s.keepPct < 55;
            const bonusOn = cfg.golden && l && l.bonus && l.bonus.on && (!l.bonus.endTs || l.bonus.endTs > Date.now());
            return `${t}${s.danger ? ' danger' : warn ? ' warn' : ''}${bonusOn ? ' golden' : ''}`;
        }
        function timeHtml(l, prefix) { return l && l.deadlineTs ? `<span class="time">⏱ ${prefix || ''}<span class="tv" data-dl="${l.deadlineTs}">${fmtLeft(l.deadlineTs - Date.now())}</span></span>` : ''; }
        function gapHtml(l, unit) {
            if (!l || l.need == null) return '';
            return l.need <= 0 ? '✅ Đã giữ hạng' : `Thiếu <span class="num gapv">${fmt(l.need)}</span>${unit}`;
        }
        function goldHtml(l) {
            if (!(cfg.golden && l && l.bonus && l.bonus.on)) return '';
            if (l.bonus.endTs && l.bonus.endTs <= Date.now()) return '';
            const g = l.bonus.giftId && gifts.find((x) => String(x.id) === String(l.bonus.giftId));
            const rate = l.bonus.rate > 1 ? ` ×${l.bonus.rate}` : '';
            return `<div class="gold">⚡ GIỜ VÀNG${rate}${g ? ` · tặng <img src="${esc(g.image)}" style="width:22px;height:22px;vertical-align:middle">` : ''}${l.bonus.endTs ? ` · còn <span class="tv" data-dl="${l.bonus.endTs}">${fmtLeft(l.bonus.endTs - Date.now())}</span>` : ''}</div>`;
        }
        function rankHtml(l, big) {
            const r = l && l.rank;
            if (r == null) return { r: '<span class="num">—</span>', dl: '' };
            const changed = prevRank != null && prevRank !== r;
            const rv = changed ? `<span class="roll go"><span>${prevRank}</span><span>${r}</span></span>` : r;
            const d = changed ? prevRank - r : 0;
            const dl = d > 0 ? `<span class="dl up pop">▲${d}</span>` : d < 0 ? `<span class="dl dn pop">▼${-d}</span>` : '';
            return { r: `<span class="num">${big ? '<small>#</small>' : '#'}${rv}</span>`, dl };
        }

        function card(l, s, f) {
            const st = cfg.style, sk = cfg.skin, R = rankHtml(l, st === 'A');
            const stars = starsHtml(l.stars || 0, cfg.maxStars, f);
            const convList = pickConvert(l.need, cfg, gifts);
            const conv = convHtml(st === 'B' ? convList.slice(0, 1) : convList);   // thanh gọn: 1 quà thôi
            const ministars = `<div class="ministars">${starsHtml(l.stars || 0, cfg.maxStars, {})}</div>`;
            if (st === 'A') return `<div class="A">${shield(l.division, sk)}${ministars}<div class="cap"><div class="edge"></div>
                <div class="row1"><span class="rk">${R.r}</span>${R.dl}<span class="ttl">BXH GIẢI ĐẤU</span></div>
                <div class="row2">${stars}${timeHtml(l)}</div>
                ${l.need != null ? `<div class="gap" style="margin-top:6px">${gapHtml(l, ' điểm để giữ hạng')}</div>` : ''}${conv ? `<div>${conv}</div>` : ''}
                ${s.keepPct != null ? `<div class="meter"><i style="width:${s.keepPct}%"></i></div>` : ''}</div>${goldHtml(l)}</div>`;
            if (st === 'B') return `<div class="B">${shield(l.division, sk)}${ministars}<div class="cap"><div class="edge"></div>
                ${l.need != null ? `<span class="gap">${gapHtml(l, '')}</span>` : ''}${conv}${timeHtml(l)}<span class="dot"></span>
                <span class="rk">${R.r}</span>${R.dl}<span class="dot"></span>${stars}</div>${goldHtml(l)}</div>`;
            const Rr = 74, Cf = 2 * Math.PI * Rr; let ticks = '';
            for (let i = 1; i < 4; i++) { const a = i / 4 * 2 * Math.PI; ticks += `<line class="tick" x1="${88 + Math.cos(a) * 66}" y1="${88 + Math.sin(a) * 66}" x2="${88 + Math.cos(a) * 82}" y2="${88 + Math.sin(a) * 82}"/>`; }
            const keep = s.keepPct != null ? s.keepPct : 0;
            return `<div class="C"><div class="cap"><div class="edge"></div></div><div class="body">
                <div class="ring"><svg viewBox="0 0 176 176"><circle class="bg" cx="88" cy="88" r="${Rr}"/>${ticks}<circle class="fg" cx="88" cy="88" r="${Rr}" style="--full:${Cf};stroke-dasharray:${Cf};stroke-dashoffset:${Cf * (1 - keep / 100)}"/></svg>${shield(l.division, sk)}${stars}</div>
                <div class="rk">${R.r} ${R.dl}</div>${l.need != null ? `<div class="gap">${gapHtml(l, ' điểm')}</div>` : ''}${conv}${l.deadlineTs ? `<div>${timeHtml(l, 'chốt sau ')}</div>` : ''}</div>${goldHtml(l)}</div>`;
        }

        function fxFromEvents(events) {
            const f = {};
            for (const ev of events) {
                if (ev.type === 'rank') { const d = ev.from - ev.to; f.toast = d > 0 ? [`▲ Vượt ${d} phòng · lên #${ev.to}`, 'var(--ok)'] : [`▼ Tụt ${-d} bậc · #${ev.to}`, 'var(--bad)']; }
                else if (ev.type === 'star') { if (ev.delta > 0) { f.gain = ev.to - 1; f.toast = [`⭐ +${ev.delta} mảnh`, '#ffd84a']; } else { f.loss = ev.to; f.toast = [`💔 ${ev.delta} mảnh`, 'var(--bad)']; } }
                else if (ev.type === 'promo') { f.cls = 'promo'; f.conf = true; f.ribbon = [`🎉 LÊN HẠNG ${ev.from} → ${ev.to}`, 'up']; }
                else if (ev.type === 'demote') { f.cls = 'demote'; f.ribbon = [`Rớt hạng ${ev.from} → ${ev.to} · cố lên!`, 'dn']; }
                else if (ev.type === 'danger') {
                    const l = snap && snap.league; const left = l && l.deadlineTs ? Math.max(1, Math.round((l.deadlineTs - Date.now()) / 60000)) : null;
                    f.toast = [`⚠ Sắp rớt hạng${left ? ` · còn ${left} phút` : ''}`, 'var(--bad)'];
                }
                else if (ev.type === 'kept') { f.conf = true; f.ribbon = [ev.rescuer && cfg.rescuer ? `🛡 ${ev.rescuer.nickname || ev.rescuer.uniqueId} đã giữ hạng!` : '✅ ĐÃ GIỮ HẠNG!', 'up']; }
                else if (ev.type === 'rescuer') f.rescPop = true;
            }
            return f;
        }

        function scheduleCollapse(s) {
            clearTimeout(collapseT);
            root.classList.remove('mini');
            if (!cfg.autoCollapse || !s || s.danger || (s.rescue && s.rescue.active)) return;
            collapseT = setTimeout(() => root.classList.add('mini'), cfg.collapseAfterSec * 1000);
        }

        function place() {
            const base = fixedBase || (window.innerWidth || 1080) / 1080;
            root.style.right = (100 - cfg.xPercent) + '%';
            root.style.top = cfg.yPercent + '%';
            root.style.transform = `scale(${base * cfg.scale / 100})`;
        }

        function paint(events) {
            const s = snap, l = s && s.league;
            place();
            if (!cfg.enabled || !l) { root.className = 'lg hidden'; root.innerHTML = ''; shown = false; return; }
            const f = fxFromEvents(events || []);
            const key = [cfg.style, cfg.skin, l.division, l.stars, l.rank, l.need, s.danger].join('|');
            const entering = !shown;
            const resc = cfg.rescuer && s.rescue && s.rescue.active && s.rescue.top && s.rescue.top[0];
            root.className = `lg sk-${cfg.skin} ${tierCls(l, s)} ${entering ? 'in' : ''} ${f.cls || ''} ${resc ? 'has-resc' : ''}`;
            root.innerHTML = card(l, s, f) + fxHtml(cfg.skin)
                + (resc ? `<div class="resc ${f.rescPop ? 'pop' : ''}">${avatar(resc)}<span class="lbl">🛡 GIỮ HẠNG</span><span class="nm">${esc(resc.nickname || resc.uniqueId)}</span><span class="xu">+${fmt(resc.coins)} xu</span></div>` : '')
                + (f.toast ? `<div class="toast" style="--tc:${f.toast[1]}">${esc(f.toast[0])}</div>` : '')
                + (f.conf ? confetti() : '')
                + (f.ribbon ? `<div class="ribbon ${f.ribbon[1]}">${esc(f.ribbon[0])}</div>` : '');
            prevRank = l.rank;
            shown = true;
            if (entering || key !== lastKey || (events && events.length)) scheduleCollapse(s);
            lastKey = key;
        }

        function tick() {
            const now = Date.now();
            root.querySelectorAll('.tv[data-dl]').forEach((el) => { el.textContent = fmtLeft(Number(el.dataset.dl) - now); });
        }
        tickT = setInterval(tick, 1000);
        window.addEventListener('resize', place);

        return {
            setCfg(c) { const prev = cfg; cfg = normalizeCfg(c); if (prev.style !== cfg.style || prev.skin !== cfg.skin) shown = false; paint([]); },
            setGifts(list) { gifts = Array.isArray(list) ? list : []; paint([]); },
            // Server gửi 'league:state' rồi 'league:event' liền sau → gom 40ms để vẽ 1 lần kèm hiệu ứng.
            update(s, events) {
                if (s) snap = s;
                if (events && events.length) pending.push(...events);
                clearTimeout(flushT);
                flushT = setTimeout(() => { const ev = pending; pending = []; paint(ev); }, 40);
            },
            replay() { shown = false; paint([]); },
            get state() { return snap; },
            destroy() { clearInterval(tickT); clearTimeout(collapseT); clearTimeout(flushT); window.removeEventListener('resize', place); },
        };
    }

    window.HpLeagueCard = { DEFAULTS, STYLES, SKINS, normalizeCfg, createRenderer, pickConvert };
})();
