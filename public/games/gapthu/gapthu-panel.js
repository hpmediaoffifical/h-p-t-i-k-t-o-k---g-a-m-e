// 🌐 hpT(): ngôn ngữ giao diện (hp-i18n.js); chưa nạp thì giữ tiếng Việt.
var hpT = (typeof globalThis !== 'undefined' && globalThis.hpT) || function (s, v) { return String(s).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, function (m, k) { return v && v[k] != null ? String(v[k]) : m; }); };
/* 🕹️ Gắp Thú — panel trong app. Khung chung ở /lib/gift-turn-panel.js; file này chỉ vẽ thẻ GIẢI THƯỞNG, TỈ LỆ, HIỂN THỊ.
 * Luật + normalize ở lib/gapthu.js (server). Spec docs/superpowers/specs/2026-11-12-gapthu-xucxac-design.md §3, §5 */
(function () {
    'use strict';
    if (!window.HpGiftTurnPanel) { console.error('[gapthu] thiếu /lib/gift-turn-panel.js'); return; }
    const THEMES = [['pink', hpT('Hồng')], ['mint', hpT('Bạc hà')], ['night', hpT('Đêm neon')]];
    const odds = prizes => {
        const ws = prizes.map(p => Math.max(0, Number(p.weight) || 0)), total = ws.reduce((a, b) => a + b, 0);
        return ws.map(w => total ? Math.round(w / total * 1000) / 10 : 0);
    };

    function renderCards(cfg, api) {
        const esc = api.esc, D = cfg.display || {};
        const prizes = cfg.prizes || [], pct = odds(prizes), win = Number(cfg.winRate) || 0;
        return `
            <div class="ctc-card">
                <h3>${hpT('GIẢI THƯỞNG')}</h3>
                <table class="hp-gtp-table"><tbody>
                ${prizes.map((p, i) => `<tr>
                    <td style="width:56px"><input type="text" maxlength="8" value="${esc(p.icon)}" data-pi="${i}" data-f="icon" title="${esc(hpT('Biểu tượng (emoji)'))}"></td>
                    <td><input type="text" maxlength="40" value="${esc(p.name)}" data-pi="${i}" data-f="name" placeholder="${esc(hpT('Tên giải'))}"></td>
                    <td style="width:64px"><input type="number" min="0" max="1000" step="1" value="${Number(p.weight) || 0}" data-pi="${i}" data-f="weight" title="${esc(hpT('Tỉ trọng - càng lớn càng hay ra'))}"></td>
                    <td class="pct" style="width:64px" title="${esc(hpT('Xác suất ra giải này mỗi lượt'))}">${Math.round(pct[i] * win / 10) / 10}%</td>
                    <td style="width:34px"><button class="ghost small" data-pdel="${i}" title="${esc(hpT('Bỏ giải'))}">✕</button></td></tr>`).join('')}
                </tbody></table>
                <button class="small" id="gapthu-padd" ${prizes.length >= 12 ? 'disabled' : ''}>${hpT('＋ Thêm giải')}</button>
                <div class="hint">${hpT('Tỉ trọng chia nhau phần trúng: giải tỉ trọng 3 ra gấp 3 giải tỉ trọng 1. Cột % = xác suất ra giải đó mỗi lượt. Tỉ trọng 0 = tạm cất.')}</div>
            </div>
            <div class="ctc-card">
                <h3>${hpT('TỈ LỆ')}</h3>
                <div class="ctc-row" data-k="winRate"><label>${hpT('Gắp trúng')}</label>
                    <input type="range" min="0" max="100" step="1" value="${win}"><input type="number" min="0" max="100" step="1" value="${win}"><span class="unit">%</span></div>
                <div class="ctc-row" data-k="pity"><label>${hpT('Bảo hiểm')}</label>
                    <input type="range" min="0" max="20" step="1" value="${cfg.pity}"><input type="number" min="0" max="20" step="1" value="${cfg.pity}"><span class="unit">${hpT('lượt trượt')}</span>
                    <div class="hint">${hpT('Trượt liền từng ấy lượt thì lượt kế chắc trúng (cả phòng tính chung). 0 = tắt.')}</div></div>
                <div class="ctc-row" data-k="turnSec"><label>${hpT('Mỗi lượt')}</label>
                    <input type="range" min="3" max="5" step="0.5" value="${cfg.turnSec}"><input type="number" min="3" max="5" step="0.5" value="${cfg.turnSec}"><span class="unit">${hpT('giây')}</span></div>
                <button class="ghost small" id="gapthu-pity-reset">${hpT('Đặt lại bộ đếm bảo hiểm')}</button>
            </div>
            <div class="ctc-card">
                <h3>${hpT('HIỂN THỊ')}</h3>
                <div class="hp-gtp-line"><label>${hpT('Màu tủ')}</label><span class="hp-gtp-seg" data-seg="theme">${THEMES.map(([v, t]) => `<button type="button" data-v="${v}" class="${D.theme === v ? 'on' : ''}">${t}</button>`).join('')}</span></div>
                ${['x', 'y', 'scale'].map(k => {
                    const meta = { x: [hpT('Ngang'), 0, 100, '%'], y: [hpT('Dọc'), 0, 100, '%'], scale: [hpT('Cỡ'), 30, 200, '%'] }[k];
                    return `<div class="ctc-row" data-k="d.${k}"><label>${meta[0]}</label><input type="range" min="${meta[1]}" max="${meta[2]}" step="1" value="${D[k]}"><input type="number" min="${meta[1]}" max="${meta[2]}" step="1" value="${D[k]}"><span class="unit">${meta[3]}</span></div>`;
                }).join('')}
                <label class="ctc-toggle"><input type="checkbox" data-d="showQueue" ${D.showQueue !== false ? 'checked' : ''}> ${hpT('Hiện "còn N lượt" dưới tủ')}</label>
                <label class="ctc-toggle"><input type="checkbox" id="gapthu-sound" ${cfg.sound?.enabled !== false ? 'checked' : ''}> ${hpT('Âm thanh')}</label>
            </div>`;
    }

    function bindCards(host, cfg, api) {
        host.querySelectorAll('[data-pi]').forEach(inp => inp.addEventListener('change', () => {
            const p = cfg.prizes[Number(inp.dataset.pi)], f = inp.dataset.f;
            p[f] = f === 'weight' ? Math.max(0, Number(inp.value) || 0) : inp.value;
            api.save(); if (f === 'weight') api.rerender();
        }));
        host.querySelectorAll('[data-pdel]').forEach(b => b.addEventListener('click', () => { cfg.prizes.splice(Number(b.dataset.pdel), 1); api.save(); api.rerender(); }));
        host.querySelector('#gapthu-padd')?.addEventListener('click', () => { cfg.prizes.push({ id: 'p' + Date.now().toString(36), name: hpT('Giải mới'), icon: '🎁', weight: 1 }); api.save(); api.rerender(); });
        host.querySelector('#gapthu-pity-reset')?.addEventListener('click', e => {
            fetch('/api/gapthu/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd: 'resetPity' }) }).catch(() => {});
            e.currentTarget.textContent = '✓';
        });
        host.querySelectorAll('[data-seg]').forEach(el => el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
            cfg.display[el.dataset.seg] = b.dataset.v;
            el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
            api.save();
        })));
        host.querySelectorAll('[data-d]').forEach(c => c.addEventListener('change', () => { cfg.display[c.dataset.d] = c.checked; api.save(); }));
        host.querySelector('#gapthu-sound')?.addEventListener('change', e => { cfg.sound = { ...(cfg.sound || {}), enabled: e.target.checked }; api.save(); });
        host.querySelectorAll('.ctc-row[data-k]').forEach(r => {
            const key = r.dataset.k, range = r.querySelector('input[type=range]'), num = r.querySelector('input[type=number]');
            const apply = (v, done) => {
                const n = Number(v); if (!Number.isFinite(n)) return;
                if (key.startsWith('d.')) cfg.display[key.slice(2)] = n; else cfg[key] = n;
                range.value = n; num.value = n; api.save();
                if (key === 'winRate' && done) api.rerender();
            };
            range.addEventListener('input', () => apply(range.value, false));
            range.addEventListener('change', () => apply(range.value, true));
            num.addEventListener('change', () => apply(num.value, true));
        });
    }

    const panel = window.HpGiftTurnPanel.create({
        id: 'gapthu', title: hpT('🕹️ Gắp Thú'), obsName: 'Gắp Thú', sure: true,
        hint: hpT('Quà gán "chắc trúng" luôn gắp được giải - hợp cho quà to.'),
        renderCards, bindCards
    });
    window.HpGapThuPanel = panel;
})();
