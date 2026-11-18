// Trang cài đặt nút (Property Inspector). Không gọi HP Action LIVE trực tiếp — xin danh mục qua plugin
// (sendToPlugin → sendToPropertyInspector), lưu lựa chọn bằng setSettings.
/* global WebSocket */
'use strict';
(function () {
    const KIND_BY_UUID = {
        'media.hpvn.actionlive.game': 'game', 'media.hpvn.actionlive.live': 'live', 'media.hpvn.actionlive.gift': 'gift',
        'media.hpvn.actionlive.chat': 'chat', 'media.hpvn.actionlive.hotkey': 'hotkey',
    };
    let ws = null, uuid = '', action = '', kind = '', settings = {}, catalog = null;
    const $ = (id) => document.getElementById(id);

    function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
    function toPlugin(payload) { send({ event: 'sendToPlugin', action, context: uuid, payload }); }
    function rows() { return Array.from(document.querySelectorAll('.hp-row[data-for]')); }

    function fillSelect(sel, items, value) {
        sel.textContent = '';
        for (const it of items) {
            const o = document.createElement('option');
            o.value = it.value; o.textContent = it.text;
            sel.appendChild(o);
        }
        if (value != null && items.some(it => it.value === String(value))) sel.value = String(value);
    }

    function fillKeys() {
        const grp = ((catalog && catalog.hotkeys) || []).find(h => h.id === $('group').value);
        fillSelect($('key'), grp ? grp.keys.map(k => ({ value: k.key, text: k.label })) : [], settings.key);
    }

    function collect() {
        const out = {};
        for (const el of document.querySelectorAll(`.hp-row[data-for="${kind}"] [data-setting]`)) {
            const k = el.dataset.setting;
            out[k] = el.type === 'number' ? Math.floor(Number(el.value) || 0) || '' : el.value;
        }
        return out;
    }
    function save() {
        settings = { ...settings, ...collect() };
        send({ event: 'setSettings', context: uuid, payload: settings });
        $('error').hidden = true;
    }

    function render() {
        for (const r of rows()) r.hidden = r.dataset.for !== kind;
        const c = catalog || { games: [], gifts: [], hotkeys: [] };
        fillSelect($('gameId'), c.games.map(g => ({ value: g.id, text: (g.locked ? '🔒 ' : '') + g.name })), settings.gameId);
        fillSelect($('giftId'), [{ value: '', text: '🎲 Quà ngẫu nhiên' }].concat(c.gifts.map(g => ({ value: g.id, text: g.name + (g.coins ? ` (${g.coins} xu)` : '') }))), settings.giftId);
        fillSelect($('group'), c.hotkeys.map(h => ({ value: h.id, text: h.name })), settings.group);
        fillKeys();
        for (const el of document.querySelectorAll('[data-setting]')) {
            if (el.tagName === 'SELECT') continue;
            const v = settings[el.dataset.setting];
            if (v != null && v !== '') el.value = v;
        }
        $('username').placeholder = c.lastUsername ? `trống = @${c.lastUsername}` : 'trống = ID dùng lần cuối';
        if (!['toggle', 'on', 'off'].includes(settings.mode) && kind === 'game') $('gameMode').value = 'toggle';
        // Lần đầu (nút mới kéo vào): lưu luôn lựa chọn mặc định đang hiện để bấm được ngay.
        const now = collect();
        if (Object.keys(now).some(k => now[k] !== '' && settings[k] === undefined)) save();
    }

    function setStatus(online, port) {
        const s = $('status');
        s.className = 'hp-status ' + (online ? 'ok' : 'bad');
        s.textContent = online ? `✓ Đã nối HP Action LIVE (cổng ${port})` : `⚠ Chưa thấy HP Action LIVE ở cổng ${port} — mở app rồi bấm ↻`;
        $('port').value = port;
    }

    function onMessage(ev) {
        let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
        if (m.event === 'didReceiveSettings') { settings = (m.payload && m.payload.settings) || {}; render(); }
        if (m.event !== 'sendToPropertyInspector') return;
        const p = m.payload || {};
        if (p.type === 'catalog') { catalog = p.catalog; setStatus(!!p.online, p.port); render(); }
        if (p.type === 'error') { const e = $('error'); e.textContent = '⚠ ' + p.error; e.hidden = false; }
    }

    document.addEventListener('change', (e) => {
        if (!e.target.dataset || !e.target.dataset.setting) return;
        if (e.target.id === 'group') { settings.key = undefined; fillKeys(); }
        save();
    });
    document.addEventListener('input', (e) => { if (e.target.tagName === 'INPUT' && e.target.dataset.setting) save(); });
    $('refresh').addEventListener('click', () => toPlugin({ type: 'refresh' }));
    $('savePort').addEventListener('click', () => toPlugin({ type: 'setPort', port: Number($('port').value) || 3000 }));

    // Stream Deck gọi hàm toàn cục này khi mở trang cài đặt nút.
    window.connectElgatoStreamDeckSocket = function (port, inUuid, registerEvent, info, actionInfo) {
        uuid = inUuid;
        try {
            const a = JSON.parse(actionInfo);
            action = a.action; kind = KIND_BY_UUID[action] || '';
            settings = (a.payload && a.payload.settings) || {};
        } catch (_) {}
        render();
        ws = new WebSocket('ws://127.0.0.1:' + port);
        ws.onopen = () => { send({ event: registerEvent, uuid }); toPlugin({ type: 'refresh' }); };
        ws.onmessage = onMessage;
    };
})();
