/* 📋 Cảnh báo quà trùng NGAY LÚC GÁN QUÀ: mọi bộ chọn quà trong app (mỗi panel một bản riêng) có dòng mang
 * data-gid / data-picker-gift / data-pick-gift → gắn nhãn "⚠ <game>: <hành động>" nếu quà đó đang dùng ở GAME KHÁC
 * đang bật. Dữ liệu: cùng bộ đọc với Bảng Quà Tổng (public/lib/giftboard-collect.js) — không sửa từng panel.
 * Chỉ báo: server vẫn phát quà cho mọi game, quà trùng = các game cùng chạy.
 * Cần nạp trước: /lib/giftboard-collect.js, /games/nhatla/game.js (nhãn Nhặt Lá).
 */
(function () {
    'use strict';
    var ROW_SEL = '[data-gid],[data-picker-gift],[data-pick-gift]';
    var TTL_MS = 4000;
    var NAME_SEL = '.nd-gp-name,.cgp-name,.vc-gp-name,.obse-gp-nm,.pg-name,.gp-name,b,[class*="-name"]';
    var state = { at: 0, loading: null, games: {}, index: new Map() };
    var VIRTUAL = { obsEffects: { icon: '🎬', name: 'Hiệu ứng OBS' } };

    function getJson(url) { return fetch(url, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
    function meta(id) { var g = state.games[id]; return g ? { icon: g.icon || '🎮', name: g.name || id } : (VIRTUAL[id] || { icon: '🎮', name: id }); }

    function load() {
        if (state.loading) return state.loading;
        state.loading = Promise.all([getJson('/api/games'), getJson('/api/gifts'), getJson('/api/obs-bridge/config'),
            getJson('/api/giftboard/cam-gifts'), getJson('/api/giftboard/tt-gifts')]).then(function (r) {
            var gl = r[0], gifts = r[1], ob = r[2], cam = r[3], tt = r[4];
            var games = {}; (Array.isArray(gl) ? gl : []).forEach(function (g) { if (g && g.id) games[g.id] = g; });
            var catalog = {}; (Array.isArray(gifts) ? gifts : []).forEach(function (g) { if (g && g.id != null) catalog[String(g.id)] = g; });
            var obsCfg = ob ? { enabled: ob.enabled !== false, mapping: ob.mapping || [], groupsDisabled: ob.groupsDisabled || [] } : null;
            var on = function (id) {
                if (id === 'obsEffects') return !!obsCfg && obsCfg.enabled !== false;
                if (cam && cam.running && id in cam.running) return !!cam.running[id];
                if (tt && tt.running && id in tt.running) return !!tt.running[id];
                return !!games[id] && (games[id].config || {}).enabled !== false;
            };
            var rows = window.HpGiftboardCollect ? window.HpGiftboardCollect.collect({ games: games, catalog: catalog, obsCfg: obsCfg, camData: cam, ttData: tt }) : [];
            var index = new Map();
            rows.forEach(function (e) {
                if (e.generic || !e.giftId || !on(e.gameId)) return;
                var list = index.get(e.giftId) || [];
                if (!list.some(function (x) { return x.gameId === e.gameId && x.label === e.label; })) list.push({ gameId: e.gameId, label: e.label });
                index.set(e.giftId, list);
            });
            state.games = games; state.index = index; state.at = Date.now();
        }).finally(function () { state.loading = null; });
        return state.loading;
    }

    // Game của bộ chọn: section #view-<id> chứa dòng quà, không thì view đang hiện.
    function currentGame(el) {
        var sec = el.closest && el.closest('section[id^="view-"]');
        if (!sec) { var vis = [].slice.call(document.querySelectorAll('section[id^="view-"]')).filter(function (s) { return s.offsetParent !== null; }); sec = vis[0]; }
        var id = sec ? sec.id.slice(5) : '';
        return id === 'obs-effects' || id === 'obseffects' ? 'obsEffects' : id;
    }
    function giftIdOf(el) { return String(el.dataset.gid || el.dataset.pickerGift || el.dataset.pickGift || ''); }

    function decorate(rows) {
        rows.forEach(function (row) {
            var gid = giftIdOf(row); if (!gid) return;
            var old = row.querySelector('.hp-gu'); if (old) old.remove();
            var me = currentGame(row);
            var uses = (state.index.get(gid) || []).filter(function (u) { return u.gameId !== me; });
            row.dataset.gu = '1';
            if (!uses.length) return;
            var title = uses.map(function (u) { var m = meta(u.gameId); return m.icon + ' ' + m.name + ': ' + u.label; }).join('\n');
            var text = uses.length === 1 ? meta(uses[0].gameId).icon + ' ' + meta(uses[0].gameId).name : uses.length + ' game';
            var b = document.createElement('span');
            b.className = 'hp-gu';
            b.title = 'Quà này đang dùng ở game khác (cùng chạy khi nhận quà):\n' + title;
            b.textContent = '⚠ ' + text;
            // Ngay sau tên quà (dòng chia cột cố định → gắn cuối dòng bị ép mất chữ).
            var name = row.querySelector(NAME_SEL);
            (name || row).appendChild(b);
        });
    }

    var pending = false;
    function scan(force) {
        if (pending) return; pending = true;
        setTimeout(function () {
            pending = false;
            var sel = force ? ROW_SEL : ROW_SEL.split(',').map(function (s) { return s + ':not([data-gu])'; }).join(',');
            var rows = [].slice.call(document.querySelectorAll(sel)).filter(function (r) { return !r.closest('.hp-gu-off'); });
            if (!rows.length) return;
            var go = function () { decorate(rows); };
            if (Date.now() - state.at > TTL_MS) load().then(go); else go();
        }, 80);
    }

    var css = document.createElement('style');
    css.textContent = '.hp-gu{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:999px;background:#fff1d6;color:#8a4b00;' +
        'border:1px solid #ffc46b;font-size:10.5px;font-weight:700;line-height:1.5;white-space:nowrap;vertical-align:middle;max-width:100%;overflow:hidden;text-overflow:ellipsis}';
    document.head.appendChild(css);
    new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) if (muts[i].addedNodes.length) { scan(false); return; }
    }).observe(document.body, { childList: true, subtree: true });
    window.HpGiftUsage = { refresh: function () { state.at = 0; scan(true); }, lookup: function (gid) { return state.index.get(String(gid)) || []; }, load: load };
})();
