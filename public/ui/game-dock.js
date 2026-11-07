// 🎨 Giao diện mới — chung cho MỌI game (không sửa code từng game):
//  • Gợi ý 4: ngăn "Xem trước · OBS" cố định bên phải — link OBS (tính lúc bấm), Copy, mở cửa sổ, xem trước 9:16.
//    Khung xem trước CHỈ nạp khi người dùng bấm (overlay trong khung chạy như 1 nguồn OBS) và gỡ khi đóng/đổi màn.
//  • Gợi ý 5: trạng thái lưu thống nhất — game có nút Lưu: thanh "Có thay đổi chưa lưu" + [Lưu] (bấm hộ nút Lưu của game);
//    mọi game: chip "Đã lưu ✓" khi server trả lời OK cho lệnh lưu cấu hình.
(function (root) {
    // Lệnh gọi server nào được coi là "lưu cấu hình" (không tính chạy thử / mô phỏng / bấm phím…)
    function isSaveCall(method, url) {
        const m = String(method || 'GET').toUpperCase();
        if (m === 'GET' || m === 'HEAD') return false;
        const u = String(url || '');
        if (!/\/api\//.test(u)) return false;
        if (/test|simulate|trigger|demo|spawn|fire|preview|copy|reload|reset|queue|session|connect|start|stop|key|hotkey|clear|license|update/i.test(u)) return false;
        return /config|settings|save|rules|layout|profile|gifts|mapping/i.test(u);
    }
    const viewToGame = (vid) => vid === 'live-translate' ? 'liveTranslate' : vid;

    function mount(doc) {
        const main = doc.querySelector('.main');
        if (!main) return {};
        // ----- Ngăn Xem trước · OBS -----
        const tab = doc.createElement('button');
        tab.type = 'button'; tab.className = 'gd-tab'; tab.hidden = true; tab.textContent = 'Xem trước · OBS';
        const dock = doc.createElement('aside');
        dock.className = 'gd-dock'; dock.hidden = true;
        dock.innerHTML = '<div class="gd-head"><b class="gd-title"></b><button type="button" class="gd-close" title="Đóng">✕</button></div>'
            + '<div class="gd-link"><code class="gd-url"></code><button type="button" class="primary small gd-copy">Copy link</button></div>'
            + '<div class="gd-actions"><button type="button" class="ghost small gd-open">Mở cửa sổ</button><button type="button" class="ghost small gd-prev">Hiện xem trước</button></div>'
            + '<div class="gd-frame" hidden><iframe class="gd-iframe" title="Xem trước overlay"></iframe></div>'
            + '<p class="gd-note">Browser Source 1080 × 1920 · nền trong suốt. Xem trước chạy như 1 nguồn OBS - đóng khi xong.</p>';
        doc.body.append(tab, dock);
        const $ = (s) => dock.querySelector(s);
        let cur = null;   // { id, name, overlayPath }
        const url = () => cur && (root.buildOverlayURL ? root.buildOverlayURL(cur.overlayPath) : cur.overlayPath);
        function stopPreview() { const f = $('.gd-iframe'); f.removeAttribute('src'); $('.gd-frame').hidden = true; $('.gd-prev').textContent = 'Hiện xem trước'; }
        function close() { dock.hidden = true; stopPreview(); doc.body.classList.remove('gd-open'); }
        function open() {
            if (!cur) return;
            $('.gd-title').textContent = cur.name;
            const u = url(); $('.gd-url').textContent = u.replace(/^https?:\/\//, ''); $('.gd-url').title = u;
            dock.hidden = false; doc.body.classList.add('gd-open');
        }
        tab.addEventListener('click', () => dock.hidden ? open() : close());
        $('.gd-close').addEventListener('click', close);
        $('.gd-copy').addEventListener('click', (e) => {
            const b = e.currentTarget, u = url();
            const ok = () => { b.textContent = 'Đã copy'; setTimeout(() => { b.textContent = 'Copy link'; }, 1300); };
            (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(ok).catch(() => root.prompt && root.prompt('Link OBS', u));
        });
        $('.gd-open').addEventListener('click', () => root.open(url(), '_blank', 'width=540,height=960'));
        $('.gd-prev').addEventListener('click', () => {
            const fr = $('.gd-frame');
            if (!fr.hidden) return stopPreview();
            $('.gd-iframe').src = url(); fr.hidden = false; $('.gd-prev').textContent = 'Tắt xem trước';
        });

        // ----- Trạng thái lưu -----
        const bar = doc.createElement('div');
        bar.className = 'gd-savebar'; bar.hidden = true;
        bar.innerHTML = '<span>Có thay đổi chưa lưu</span><button type="button" class="primary small gd-save">Lưu</button>';
        main.appendChild(bar);
        const chip = doc.createElement('span');
        chip.className = 'gd-saved'; chip.textContent = 'Đã lưu ✓';
        let chipTimer = null;
        // Nút Lưu của game: có thể nằm trong khung con của phần đầu (vd Trồng Cây) → dò mọi nút, phân loại như header-bar
        function saveBtnOf(view) {
            if (!view) return null;
            const HB = root.HpHeaderBar;
            return [...view.querySelectorAll('.game-header .overlay-bar button')].find(b =>
                b.dataset.hbKind === 'save' || (HB && HB.classify({ text: b.textContent, cls: b.className, tag: 'BUTTON' }) === 'save')) || null;
        }
        function markSaved() {
            bar.hidden = true;
            const head = doc.querySelector('.view.active .game-header');
            if (!head) return;
            (head.querySelector('h2') || head).appendChild(chip);   // nằm ngay sau tên game, không xô các nút
            chip.classList.add('show');
            clearTimeout(chipTimer);
            chipTimer = setTimeout(() => chip.classList.remove('show'), 2200);
        }
        bar.querySelector('.gd-save').addEventListener('click', () => {
            const b = saveBtnOf(doc.querySelector('.view.active'));
            if (b) b.click();
            bar.hidden = true;
        });
        main.addEventListener('input', onEdit, true);
        main.addEventListener('change', onEdit, true);
        function onEdit(e) {
            const view = e.target.closest && e.target.closest('.view.game-view.active');
            if (!view || e.target.closest('.game-header, .gd-savebar')) return;
            if (!/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
            if (saveBtnOf(view)) bar.hidden = false;
        }
        // Lệnh lưu cấu hình thành công → "Đã lưu ✓" (chỉ khi đang ở màn game)
        if (root.fetch && !root.fetch.__hpDock) {
            const orig = root.fetch.bind(root);
            const wrapped = function (input, init) {
                const p = orig(input, init);
                try {
                    const method = (init && init.method) || (input && input.method) || 'GET';
                    const u = typeof input === 'string' ? input : (input && input.url) || '';
                    if (isSaveCall(method, u) && doc.querySelector('.view.game-view.active')) {
                        p.then(r => { if (r && r.ok) markSaved(); }).catch(() => {});
                    }
                } catch (_) {}
                return p;
            };
            wrapped.__hpDock = true;
            root.fetch = wrapped;
        }

        // ----- Theo màn đang mở -----
        let lastView = '';
        function sync() {
            const v = doc.querySelector('.view.active');
            const vid = v ? v.id.replace(/^view-/, '') : '';
            if (vid === lastView) return;
            lastView = vid;
            bar.hidden = true; close();
            const g = vid && vid !== 'home' && root.hpGameIndex ? root.hpGameIndex().find(x => x.id === viewToGame(vid)) : null;
            cur = g && g.overlayPath ? g : null;
            tab.hidden = !cur;
        }
        new MutationObserver(sync).observe(main, { subtree: true, attributes: true, attributeFilter: ['class'] });
        sync();
        return { sync };
    }

    const api = { isSaveCall };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
    root.HpGameDock = api;
    const doc = root.document;
    if (!doc || !doc.body || !doc.body.classList.contains('ui-v2')) return;
    Object.assign(root.HpGameDock, mount(doc));
})(typeof window !== 'undefined' ? window : globalThis);
