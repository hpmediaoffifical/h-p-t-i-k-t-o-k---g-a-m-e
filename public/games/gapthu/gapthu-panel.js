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
        const DN = cfg.dance || (cfg.dance = { enabled: true, pct: 6, sec: 30, cooldownSec: 120, text: '{name} gắp trúng! Streamer nhảy ngay!', sound: true, image: '' });
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
                <h3>${hpT('🎮 TỰ LÁI (QUÀ LỚN)')}</h3>
                <div class="ctc-row" data-k="steerMinCoins"><label>${hpT('Quà từ')}</label>
                    <input type="range" min="0" max="1000" step="1" value="${Math.min(1000, cfg.steerMinCoins)}"><input type="number" min="0" max="100000" step="1" value="${cfg.steerMinCoins}"><span class="unit">${hpT('xu / món')}</span>
                    <div class="hint">${hpT('Người tặng quà từ mức này tự lái càng bằng bình luận: trái / phải / vào / ra (hoặc a d w s, "trái 3"), "gắp" để thả. 0 = tắt.')}</div></div>
                <div class="ctc-row" data-k="steerSec"><label>${hpT('Thời gian lái')}</label>
                    <input type="range" min="8" max="30" step="1" value="${cfg.steerSec}"><input type="number" min="8" max="30" step="1" value="${cfg.steerSec}"><span class="unit">${hpT('giây')}</span></div>
                <div class="ctc-row" data-k="steerSteps"><label>${hpT('Số bước')}</label>
                    <input type="range" min="3" max="20" step="1" value="${cfg.steerSteps}"><input type="number" min="3" max="20" step="1" value="${cfg.steerSteps}"><span class="unit">${hpT('bước')}</span></div>
                <div class="ctc-row" data-k="steerBonus"><label>${hpT('Thưởng nhắm đúng')}</label>
                    <input type="range" min="0" max="50" step="1" value="${cfg.steerBonus}"><input type="number" min="0" max="50" step="1" value="${cfg.steerBonus}"><span class="unit">%</span>
                    <div class="hint">${hpT('Kẹp đúng ô dưới càng: {a}% · kẹp lệch sang ô bên: {b}%. Hết giờ thì tự gắp tại chỗ.', { a: Math.min(95, win + (Number(cfg.steerBonus) || 0)), b: Math.round(Math.min(95, win + (Number(cfg.steerBonus) || 0)) / 2) })}</div></div>
                <button class="small" id="gapthu-steer-test">${hpT('▶ Thử 1 lượt tự lái')}</button>
                <button class="ghost small" id="gapthu-steer-drop" title="${esc(hpT('Thả càng ngay cho người đang lái'))}">${hpT('✊ Thả hộ')}</button>
            </div>
            <div class="ctc-card">
                <h3>${hpT('💃 GIẢI "STREAMER NHẢY"')}</h3>
                <label class="ctc-toggle"><input type="checkbox" id="gapthu-dance-on" ${DN.enabled ? 'checked' : ''}> <b>${hpT('Bật giải Streamer trong máy')}</b></label>
                <div class="ctc-row" data-dk="pct"><label>${hpT('Tỉ lệ ra')}</label>
                    <input type="range" min="0" max="30" step="0.5" value="${DN.pct}"><input type="number" min="0" max="30" step="0.5" value="${DN.pct}"><span class="unit">${hpT('% lượt tự gắp')}</span>
                    <div class="hint">${hpT('Lượt tự lái: trong máy có 1 ô hình streamer, ai nhắm trúng + kẹp chắc thì trúng.')}</div></div>
                <div class="ctc-row" data-dk="sec"><label>${hpT('Nhảy trong')}</label>
                    <input type="range" min="5" max="120" step="5" value="${DN.sec}"><input type="number" min="5" max="120" step="1" value="${DN.sec}"><span class="unit">${hpT('giây')}</span></div>
                <div class="ctc-row" data-dk="cooldownSec"><label>${hpT('Hồi tối thiểu')}</label>
                    <input type="range" min="0" max="900" step="15" value="${Math.min(900, DN.cooldownSec)}"><input type="number" min="0" max="3600" step="1" value="${DN.cooldownSec}"><span class="unit">${hpT('giây')}</span>
                    <div class="hint">${hpT('Nhảy xong phải chờ từng ấy giây giải này mới ra lại (không nhảy liền 2 lần).')}</div></div>
                <div class="hp-gtp-line"><label>${hpT('Câu hiện')}</label><input type="text" id="gapthu-dance-text" maxlength="80" style="flex:1;min-width:200px" value="${esc(DN.text)}"></div>
                <div class="hint">${hpT('{name} = tên người gắp trúng.')}</div>
                <label class="ctc-toggle"><input type="checkbox" id="gapthu-dance-sound" ${DN.sound ? 'checked' : ''}> ${hpT('Âm báo bắt đầu / kết thúc')}</label>
                <div class="hp-gtp-line"><label>${hpT('Ảnh streamer')}</label>
                    ${DN.image ? `<img src="${esc(DN.image)}" alt="" style="height:64px;max-width:120px;object-fit:contain;background:repeating-conic-gradient(#8884 0 25%,transparent 0 50%) 0 0/16px 16px;border-radius:8px">` : `<span class="hint">${hpT('Chưa có - dùng hình mặc định 💃')}</span>`}
                    <label class="small ghost" style="cursor:pointer;border:1px solid rgba(255,255,255,.2);border-radius:8px;padding:5px 10px">${hpT('Tải PNG…')}<input type="file" id="gapthu-dance-file" accept="image/png" hidden></label>
                    ${DN.image ? `<button class="ghost small" id="gapthu-dance-noimg">${hpT('Gỡ ảnh')}</button>` : ''}</div>
                <div class="hint">${hpT('PNG nền trong, tối đa 2 MB, 2048×2048.')}</div>
                <button class="small" id="gapthu-dance-force">${hpT('🧪 Ép trúng Streamer')}</button>
                <div class="hp-gtp-hist" id="gapthu-dance-log" style="margin-top:8px"></div>
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
        const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
        host.querySelector('#gapthu-steer-test')?.addEventListener('click', e => { post('/api/gapthu/test', { steer: true, nickname: hpT('Thử tự lái') }); e.currentTarget.textContent = '✓'; });
        host.querySelector('#gapthu-steer-drop')?.addEventListener('click', e => { post('/api/gapthu/control', { cmd: 'drop' }); e.currentTarget.textContent = '✓'; });
        // 💃 giải Streamer
        const DN = cfg.dance;
        host.querySelector('#gapthu-dance-on')?.addEventListener('change', e => { DN.enabled = e.target.checked; api.save(); });
        host.querySelector('#gapthu-dance-sound')?.addEventListener('change', e => { DN.sound = e.target.checked; api.save(); });
        host.querySelector('#gapthu-dance-text')?.addEventListener('change', e => { DN.text = e.target.value; api.save(); });
        host.querySelectorAll('.ctc-row[data-dk]').forEach(r => {
            const key = r.dataset.dk, range = r.querySelector('input[type=range]'), num = r.querySelector('input[type=number]');
            const apply = v => { const n = Number(v); if (!Number.isFinite(n)) return; DN[key] = n; range.value = n; num.value = n; api.save(); };
            range.addEventListener('input', () => apply(range.value));
            num.addEventListener('change', () => apply(num.value));
        });
        host.querySelector('#gapthu-dance-force')?.addEventListener('click', async e => {
            const b = e.currentTarget; await api.saveNow();
            post('/api/gapthu/control', { cmd: 'forceDance', nickname: hpT('Tập nhảy') }).then(() => api.refreshLive());
            b.textContent = '✓'; setTimeout(() => { b.textContent = hpT('🧪 Ép trúng Streamer'); }, 1200);
        });
        host.querySelector('#gapthu-dance-file')?.addEventListener('change', async e => {
            const file = e.target.files && e.target.files[0]; if (!file) return;
            if (file.type !== 'image/png') { window.toast?.(hpT('Chỉ nhận ảnh PNG'), 'error'); return; }
            if (file.size > 2 * 1024 * 1024) { window.toast?.(hpT('Ảnh quá 2 MB'), 'error'); return; }
            try {
                const r = await fetch('/api/gapthu/dance-image', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: file });
                const j = await r.json().catch(() => ({}));
                if (!r.ok || !j.ok) { window.toast?.(j.error || hpT('Không tải được ảnh'), 'error'); return; }
                DN.image = j.image; await api.saveNow(); api.rerender();
            } catch (err) { window.toast?.(hpT('Không gọi được server'), 'error'); }
        });
        host.querySelector('#gapthu-dance-noimg')?.addEventListener('click', async () => {
            await fetch('/api/gapthu/dance-image', { method: 'DELETE' }).catch(() => {});
            DN.image = ''; await api.saveNow(); api.rerender();
        });
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
                if ((key === 'winRate' || key === 'steerBonus') && done) api.rerender();
            };
            range.addEventListener('input', () => apply(range.value, false));
            range.addEventListener('change', () => apply(range.value, true));
            num.addEventListener('change', () => apply(num.value, true));
        });
    }

    const panel = window.HpGiftTurnPanel.create({
        id: 'gapthu', title: hpT('🕹️ Gắp Thú'), obsName: 'Gắp Thú', sure: true,
        hint: hpT('Quà gán "chắc trúng" luôn gắp được giải - hợp cho quà to.'),
        renderCards, bindCards,
        // 💃 dòng trạng thái: đang nhảy (đếm ngược + Xong / Bỏ qua) hoặc đang hồi
        statusExtra(live, cfg, api) {
            const passed = Math.floor((Date.now() - (live._at || Date.now())) / 1000);
            const d = live.dance;
            if (d && d.phase === 'on') {
                const left = Math.max(0, (d.secLeft || 0) - passed);
                return `<span class="ctc-chip warn" style="font-weight:700">${hpT('💃 Đang nhảy… còn {n}s', { n: left })} - ${api.esc(d.nickname || '?')}</span>
                    <button class="primary small" data-gtp-cmd="danceDone">${hpT('✓ Xong')}</button> <button class="ghost small" data-gtp-cmd="danceSkip">${hpT('Bỏ qua')}</button>`;
            }
            if (d && d.phase === 'wait') return `<span class="ctc-chip warn">${hpT('💃 Sắp nhảy…')}</span> <button class="ghost small" data-gtp-cmd="danceSkip">${hpT('Bỏ qua')}</button>`;
            const cd = Math.max(0, (live.danceCooldown || 0) - passed);
            if (cfg.dance && cfg.dance.enabled && cd > 0) return `<span class="ctc-chip dim">${hpT('💃 hồi còn {n}s', { n: cd })}</span>`;
            return cfg.dance && cfg.dance.enabled ? `<span class="ctc-chip dim">${hpT('💃 sẵn sàng')}</span>` : '';
        },
        // lịch sử ai đã gắp trúng Streamer trong buổi
        onLive(live, cfg, api) {
            const el = document.getElementById('gapthu-dance-log'); if (!el) return;
            const log = live.danceLog || [];
            const hhmm = ts => { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
            const why = { done: hpT('nhảy xong'), timeout: hpT('hết giờ'), skip: hpT('bỏ qua') };
            const html = log.length ? `<b>${hpT('Đã gắp trúng trong buổi:')}</b>` + log.map(x => `<div><time>${hhmm(x.ts)}</time><b>${api.esc(x.nickname || '?')}${x.test ? ' 🧪' : ''}</b><span>${why[x.reason] || ''}</span></div>`).join('') : '';
            if (el.innerHTML !== html) el.innerHTML = html;
        }
    });
    window.HpGapThuPanel = panel;
})();
