// 🎨 Giao diện mới — Trang chủ: "Game đang bật" (link OBS + Copy + công tắc) & "Hoạt động LIVE" (quà, bình luận,
// vào phòng, chia sẻ) + cảnh báo đỏ ở statusbar khi OBS mất kết nối giữa buổi (gợi ý 1/2/8).
// Công tắc gọi lại đúng nút ⏻ của Thư viện ở sidebar → không viết lại logic bật/tắt game.
(function (root) {
    const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
    // 1 sự kiện → 1 dòng { kind, who, what } (null = bỏ qua: quà đang combo dở)
    function feedLine(kind, p) {
        p = p || {};
        const who = cut(p.nickname || p.uniqueId || '', 32);
        if (kind === 'gift') {
            if (p.repeatEnd === false) return null;
            const n = Number(p.repeatCount) || 1;
            return { kind, who, what: 'tặng ' + cut(p.giftName || 'quà', 30) + (n > 1 ? ' × ' + n : '') };
        }
        if (kind === 'chat') return { kind, who, what: cut('bình luận "' + (p.comment || '') + '"', 80) };
        if (kind === 'member') return { kind, who, what: 'vào phòng' };
        if (kind === 'social') return { kind, who, what: cut(p.label || 'tương tác', 40) };
        if (kind === 'blocked') return { kind, who: '', what: '1 bình luận bị chặn (từ cấm)' };
        return null;
    }
    // OBS: chỉ báo đỏ khi phiên này OBS đã từng nối rồi mất (chưa bao giờ nối = chưa cấu hình, không làm phiền)
    function obsAlert(everConnected, st) {
        return !!everConnected && !!st && !st.connected && !st.connecting;
    }

    function mount(doc) {
        const MAX = 8, feed = [];
        const gamesEl = doc.getElementById('home-games-list');
        const feedEl = doc.getElementById('home-feed-list');
        const countEl = doc.getElementById('home-games-count');
        const COLORS = { gift: '#FF5C8A', chat: '#7A5CFF', member: '#1FB357', social: '#2F6FEB', blocked: '#C9B8BC' };

        function renderGames() {
            if (!gamesEl || !root.hpGameIndex) return;
            // Game con của Game Camera chơi qua 1 link chung /overlay/camgames → không liệt kê link riêng
            const list = root.hpGameIndex().filter(g => g.on && !g.locked && g.overlayPath && !g.camChild);
            gamesEl.textContent = '';
            if (countEl) countEl.textContent = String(list.length);
            if (!list.length) {
                const e = doc.createElement('div');
                e.className = 'hl-empty';
                e.textContent = 'Chưa bật game nào - bật ở Thư viện bên trái hoặc Khởi động nhanh';
                gamesEl.appendChild(e);
                return;
            }
            for (const g of list) {
                const row = doc.createElement('div');
                row.className = 'hl-game';
                const ico = doc.createElement('span'); ico.className = 'hl-ico'; ico.textContent = g.icon || '';
                const name = doc.createElement('button'); name.type = 'button'; name.className = 'hl-name'; name.textContent = g.name;
                name.title = 'Mở cài đặt ' + g.name;
                name.addEventListener('click', () => root.hpOpenGame && root.hpOpenGame(g.id));
                const url = root.buildOverlayURL ? root.buildOverlayURL(g.overlayPath) : g.overlayPath;
                const chip = doc.createElement('div'); chip.className = 'hl-link';
                const code = doc.createElement('code'); code.textContent = url.replace(/^https?:\/\//, ''); code.title = url;
                const cp = doc.createElement('button'); cp.type = 'button'; cp.className = 'hl-copy'; cp.textContent = 'Copy';
                cp.addEventListener('click', () => {
                    const live = root.buildOverlayURL ? root.buildOverlayURL(g.overlayPath) : url;   // tính lúc BẤM
                    const ok = () => { cp.textContent = 'Đã copy'; setTimeout(() => { cp.textContent = 'Copy'; }, 1300); };
                    (navigator.clipboard ? navigator.clipboard.writeText(live) : Promise.reject()).then(ok).catch(() => root.prompt && root.prompt('Link OBS', live));
                });
                chip.append(code, cp);
                const sw = doc.createElement('input'); sw.type = 'checkbox'; sw.className = 'ui-switch'; sw.checked = true;
                sw.title = 'Tắt ' + g.name;
                sw.addEventListener('change', () => {
                    const side = doc.querySelector('[data-game-toggle="' + (root.CSS && CSS.escape ? CSS.escape(g.id) : g.id) + '"]');
                    if (side) side.click(); else sw.checked = true;
                });
                row.append(ico, name, chip, sw);
                gamesEl.appendChild(row);
            }
        }

        function renderFeed() {
            if (!feedEl) return;
            feedEl.textContent = '';
            if (!feed.length) {
                const e = doc.createElement('div'); e.className = 'hl-empty';
                e.textContent = 'Chưa có hoạt động - kết nối TikTok LIVE để thấy quà, bình luận, người vào phòng';
                feedEl.appendChild(e);
                return;
            }
            for (const it of feed) {
                const row = doc.createElement('div'); row.className = 'hl-ev hl-' + it.kind; row.dataset.uiRaw = '1';
                const av = doc.createElement('span'); av.className = 'hl-av'; av.style.background = COLORS[it.kind] || '#C9B8BC';
                av.textContent = it.who ? it.who.trim().slice(0, 1).toUpperCase() : '·';
                const tx = doc.createElement('span'); tx.className = 'hl-tx';
                if (it.who) { const b = doc.createElement('b'); b.textContent = it.who + ' '; tx.appendChild(b); }
                tx.appendChild(doc.createTextNode(it.what));
                const tm = doc.createElement('time'); tm.className = 'hl-tm'; tm.dataset.t = String(it.t);
                row.append(av, tx, tm);
                feedEl.appendChild(row);
            }
            tickTimes();
        }
        function tickTimes() {
            if (!feedEl) return;
            const now = Date.now();
            feedEl.querySelectorAll('time[data-t]').forEach(el => {
                const s = Math.round((now - Number(el.dataset.t)) / 1000);
                el.textContent = s < 5 ? 'vừa xong' : s < 60 ? s + 's' : Math.floor(s / 60) + 'p';
            });
        }
        let pending = false;
        function push(kind, p) {
            const l = feedLine(kind, p);
            if (!l) return;
            l.t = Date.now();
            feed.unshift(l);
            if (feed.length > MAX) feed.length = MAX;
            // Phòng đông: gộp vẽ lại tối đa 4 lần/giây
            if (!pending) { pending = true; setTimeout(() => { pending = false; renderFeed(); }, 250); }
        }

        // Statusbar: OBS
        let obsEver = false;
        const sbObs = doc.getElementById('sb-obs');
        async function pollObs() {
            try {
                const r = await fetch('/api/obs-bridge/config');
                const st = (await r.json()).status || {};
                if (st.connected) obsEver = true;
                const alert = obsAlert(obsEver, st);
                if (sbObs) {
                    sbObs.hidden = !obsEver && !st.connected;
                    sbObs.classList.toggle('sb-alert', alert);
                    sbObs.lastElementChild.textContent = st.connected ? 'OBS đã kết nối' : alert ? 'OBS mất kết nối!' : 'OBS chưa kết nối';
                }
            } catch (_) {}
        }
        pollObs();
        setInterval(pollObs, 10000);
        setInterval(tickTimes, 5000);
        renderGames();
        renderFeed();

        return {
            renderGames,
            bind(socket) {
                if (!socket) return;
                socket.on('gift', g => push('gift', g));
                socket.on('chat', c => push('chat', c));
                socket.on('chat:blocked', () => push('blocked', {}));
                socket.on('member', m => push('member', m));
                socket.on('social', s => push('social', s));
            }
        };
    }

    const api = { feedLine, obsAlert };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
    root.HpHomeLive = api;
    const doc = root.document;
    if (!doc || !doc.body || !doc.body.classList.contains('ui-v2')) return;
    // Gắn NGAY (script nằm cuối <body>, khối Trang chủ đã có) — app.js gọi bind(socket) ngay khi chạy,
    // chờ DOMContentLoaded thì bind chưa tồn tại và feed không nhận sự kiện nào.
    Object.assign(root.HpHomeLive, mount(doc));
})(typeof window !== 'undefined' ? window : globalThis);
