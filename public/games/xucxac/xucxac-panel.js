// 🌐 hpT(): ngôn ngữ giao diện (hp-i18n.js); chưa nạp thì giữ tiếng Việt.
var hpT = (typeof globalThis !== 'undefined' && globalThis.hpT) || function (s, v) { return String(s).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, function (m, k) { return v && v[k] != null ? String(v[k]) : m; }); };
/* 🎲 Xúc Xắc 3D — panel trong app. Khung chung ở /lib/gift-turn-panel.js; file này chỉ vẽ thẻ XÚC XẮC, BẢNG KẾT QUẢ, HIỂN THỊ.
 * Luật + normalize ở lib/xucxac.js (server). Spec docs/superpowers/specs/2026-11-12-gapthu-xucxac-design.md §4, §5 */
(function () {
    'use strict';
    if (!window.HpGiftTurnPanel) { console.error('[xucxac] thiếu /lib/gift-turn-panel.js'); return; }
    const COLORS = [['white', hpT('Trắng')], ['red', hpT('Đỏ')], ['black', hpT('Đen')], ['gold', hpT('Vàng')]];

    // Bảng có phủ hết mọi tổng [n, 6n] không — thiếu thì người xem tung ra số "không có việc gì".
    function missingTotals(cfg) {
        const n = Number(cfg.dice) || 1, rows = cfg.outcomes || [], out = [];
        for (let t = n; t <= 6 * n; t++) if (!rows.some(o => t >= o.from && t <= o.to)) out.push(t);
        return out;
    }
    async function loadDefault(cfg, api) {
        try { cfg.outcomes = await fetch('/api/xucxac/default-outcomes?n=' + (Number(cfg.dice) || 1)).then(r => r.json()); api.save(); api.rerender(); }
        catch (e) { window.toast?.(hpT('Không tải được bảng mặc định'), 'error'); }
    }

    function renderCards(cfg, api) {
        const esc = api.esc, D = cfg.display || {}, n = Number(cfg.dice) || 1;
        const miss = missingTotals(cfg);
        return `
            <div class="ctc-card">
                <h3>${hpT('XÚC XẮC')}</h3>
                <div class="hp-gtp-line"><label>${hpT('Số viên')}</label><span class="hp-gtp-seg" data-seg="dice">${[1, 2, 3].map(v => `<button type="button" data-v="${v}" class="${n === v ? 'on' : ''}">${v}</button>`).join('')}</span></div>
                <div class="hp-gtp-line"><label>${hpT('Màu')}</label><span class="hp-gtp-seg" data-seg="color">${COLORS.map(([v, t]) => `<button type="button" data-v="${v}" class="${D.color === v ? 'on' : ''}">${t}</button>`).join('')}</span></div>
                <div class="ctc-row" data-k="turnSec"><label>${hpT('Mỗi lượt')}</label>
                    <input type="range" min="3" max="5" step="0.5" value="${cfg.turnSec}"><input type="number" min="3" max="5" step="0.5" value="${cfg.turnSec}"><span class="unit">${hpT('giây')}</span></div>
            </div>
            <div class="ctc-card">
                <h3>${hpT('BẢNG KẾT QUẢ')} <span style="opacity:.6;font-weight:400">(${hpT('tổng {a}-{b}', { a: n, b: 6 * n })})</span></h3>
                <table class="hp-gtp-table"><tbody>
                ${(cfg.outcomes || []).map((o, i) => `<tr>
                    <td style="width:64px"><input type="number" min="1" max="18" value="${o.from}" data-oi="${i}" data-f="from" title="${esc(hpT('Từ'))}"></td>
                    <td style="width:64px"><input type="number" min="1" max="18" value="${o.to}" data-oi="${i}" data-f="to" title="${esc(hpT('Đến'))}"></td>
                    <td><input type="text" maxlength="60" value="${esc(o.text)}" data-oi="${i}" data-f="text" placeholder="${esc(hpT('Việc phải làm'))}"></td>
                    <td style="width:34px"><button class="ghost small" data-odel="${i}" title="${esc(hpT('Bỏ dòng'))}">✕</button></td></tr>`).join('')}
                </tbody></table>
                <button class="small" id="xucxac-oadd" ${(cfg.outcomes || []).length >= 12 ? 'disabled' : ''}>${hpT('＋ Thêm dòng')}</button>
                <button class="ghost small" id="xucxac-odef">${hpT('Bảng mặc định')}</button>
                ${miss.length ? `<div class="ctc-chip warn" style="margin-top:6px">${hpT('Tổng chưa có việc: {list}', { list: miss.join(', ') })}</div>` : ''}
                <div class="hint">${hpT('Tung ra tổng nằm trong khoảng nào thì hiện việc của dòng đó (dòng trên ưu tiên). Tổng không có dòng nào thì chỉ hiện số.')}</div>
            </div>
            <div class="ctc-card">
                <h3>${hpT('HIỂN THỊ')}</h3>
                ${['x', 'y', 'scale'].map(k => {
                    const meta = { x: [hpT('Ngang'), 0, 100, '%'], y: [hpT('Dọc'), 0, 100, '%'], scale: [hpT('Cỡ'), 30, 200, '%'] }[k];
                    return `<div class="ctc-row" data-k="d.${k}"><label>${meta[0]}</label><input type="range" min="${meta[1]}" max="${meta[2]}" step="1" value="${D[k]}"><input type="number" min="${meta[1]}" max="${meta[2]}" step="1" value="${D[k]}"><span class="unit">${meta[3]}</span></div>`;
                }).join('')}
                <label class="ctc-toggle"><input type="checkbox" data-d="showQueue" ${D.showQueue !== false ? 'checked' : ''}> ${hpT('Hiện "còn N lượt"')}</label>
                <label class="ctc-toggle"><input type="checkbox" id="xucxac-sound" ${cfg.sound?.enabled !== false ? 'checked' : ''}> ${hpT('Âm thanh')}</label>
            </div>`;
    }

    function bindCards(host, cfg, api) {
        host.querySelectorAll('[data-oi]').forEach(inp => inp.addEventListener('change', () => {
            const o = cfg.outcomes[Number(inp.dataset.oi)], f = inp.dataset.f;
            o[f] = f === 'text' ? inp.value : Math.round(Number(inp.value) || 0);
            api.save(); if (f !== 'text') api.rerender();
        }));
        host.querySelectorAll('[data-odel]').forEach(b => b.addEventListener('click', () => { cfg.outcomes.splice(Number(b.dataset.odel), 1); api.save(); api.rerender(); }));
        host.querySelector('#xucxac-oadd')?.addEventListener('click', () => {
            const n = Number(cfg.dice) || 1;
            (cfg.outcomes = cfg.outcomes || []).push({ from: n, to: 6 * n, text: hpT('Việc mới') }); api.save(); api.rerender();
        });
        host.querySelector('#xucxac-odef')?.addEventListener('click', () => loadDefault(cfg, api));
        host.querySelectorAll('[data-seg]').forEach(el => el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
            if (el.dataset.seg === 'dice') {
                cfg.dice = Number(b.dataset.v);
                // đổi số viên mà bảng cũ không phủ được tổng mới → nạp bảng mặc định của số viên đó
                if (missingTotals(cfg).length) { loadDefault(cfg, api); window.toast?.(hpT('Đã đổi sang bảng kết quả mặc định cho {n} viên', { n: cfg.dice }), 'info'); return; }
                api.save(); api.rerender(); return;
            }
            cfg.display[el.dataset.seg] = b.dataset.v;
            el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
            api.save();
        })));
        host.querySelectorAll('[data-d]').forEach(c => c.addEventListener('change', () => { cfg.display[c.dataset.d] = c.checked; api.save(); }));
        host.querySelector('#xucxac-sound')?.addEventListener('change', e => { cfg.sound = { ...(cfg.sound || {}), enabled: e.target.checked }; api.save(); });
        host.querySelectorAll('.ctc-row[data-k]').forEach(r => {
            const key = r.dataset.k, range = r.querySelector('input[type=range]'), num = r.querySelector('input[type=number]');
            const apply = v => {
                const n = Number(v); if (!Number.isFinite(n)) return;
                if (key.startsWith('d.')) cfg.display[key.slice(2)] = n; else cfg[key] = n;
                range.value = n; num.value = n; api.save();
            };
            range.addEventListener('input', () => apply(range.value));
            num.addEventListener('change', () => apply(num.value));
        });
    }

    window.HpXucXacPanel = window.HpGiftTurnPanel.create({
        id: 'xucxac', title: hpT('🎲 Xúc Xắc 3D'), obsName: 'Xúc Xắc 3D', sure: false,
        hint: hpT('Quà to nên gán nhiều lượt.'),
        renderCards, bindCards
    });
})();
