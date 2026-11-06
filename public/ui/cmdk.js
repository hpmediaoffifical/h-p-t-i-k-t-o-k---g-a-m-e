// 🎨 Giao diện mới — bảng lệnh Ctrl K: tìm game/công cụ theo tên (bỏ dấu), Enter mở, nút 🔗 copy link OBS.
// Nguồn: window.hpGameIndex() (app.js). Mở: Ctrl K hoặc nút #nav-search ở sidebar.
(function (root) {
    function fold(s) {
        return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();
    }
    // Hạng: 0 = đầu một từ trong tên, 1 = giữa tên, 2 = khớp id. Không khớp → loại. Cùng hạng giữ thứ tự gốc.
    function match(query, items) {
        const q = fold(query);
        if (!q) return items.slice();
        const ranked = [];
        items.forEach((it, i) => {
            const n = fold(it.name);
            let r = -1;
            if (n.startsWith(q) || n.includes(' ' + q)) r = 0;
            else if (q.length >= 3 && n.includes(q)) r = 1;   // gõ ngắn chỉ khớp đầu từ ("hu" không ra "Dịch Thuật")
            else if (fold(it.id).includes(q.replace(/ /g, ''))) r = 2;
            if (r >= 0) ranked.push({ it, r, i });
        });
        return ranked.sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.it);
    }

    function mount(doc) {
        let box = null, list = null, input = null, items = [], sel = 0;
        function close() { if (box) box.hidden = true; }
        function render() {
            items = match(input.value, (root.hpGameIndex && root.hpGameIndex()) || []);
            sel = Math.min(sel, Math.max(0, items.length - 1));
            list.textContent = '';
            if (!items.length) {
                const e = doc.createElement('div');
                e.className = 'cmdk-empty';
                e.textContent = 'Không thấy game nào khớp';
                list.appendChild(e);
            }
            items.forEach((it, i) => {
                const row = doc.createElement('div');
                row.className = 'cmdk-opt' + (i === sel ? ' sel' : '') + (it.locked ? ' locked' : '');
                row.setAttribute('role', 'option');
                const dot = doc.createElement('span');
                dot.className = 'dot' + (it.on && !it.locked ? ' online' : '');
                const ico = doc.createElement('span');
                ico.className = 'cmdk-ico';
                ico.textContent = it.icon || '';
                const name = doc.createElement('span');
                name.className = 'cmdk-name';
                name.textContent = it.name + (it.locked ? ' 🔒' : '');
                row.append(dot, ico, name);
                if (it.overlayPath && root.buildOverlayURL) {
                    const cp = doc.createElement('button');
                    cp.type = 'button';
                    cp.className = 'ghost small cmdk-copy';
                    cp.title = 'Copy link OBS';
                    cp.textContent = '🔗 Link OBS';
                    cp.addEventListener('click', (e) => { e.stopPropagation(); copy(it); });
                    row.appendChild(cp);
                }
                row.addEventListener('mousemove', () => { if (sel !== i) { sel = i; render(); } });
                row.addEventListener('click', () => open(it));
                list.appendChild(row);
            });
        }
        function open(it) { close(); if (it && root.hpOpenGame) root.hpOpenGame(it.id); }
        function copy(it) {
            const url = root.buildOverlayURL(it.overlayPath);
            const done = () => { if (root.hpToast) root.hpToast('Đã copy link OBS: ' + it.name); };
            (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(done).catch(() => { root.prompt && root.prompt('Link OBS', url); });
        }
        function show() {
            if (!box) {
                box = doc.createElement('div');
                box.className = 'cmdk';
                box.innerHTML = '<div class="cmdk-box" role="dialog" aria-label="Tìm game"><div class="cmdk-in"><svg class="ui-i" aria-hidden="true"><use href="#ui-search"/></svg><input type="text" placeholder="Gõ tên game, công cụ…" autocomplete="off" spellcheck="false" /><kbd>Esc</kbd></div><div class="cmdk-list" role="listbox"></div><div class="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> chọn</span><span><kbd>Enter</kbd> mở</span></div></div>';
                doc.body.appendChild(box);
                input = box.querySelector('input');
                list = box.querySelector('.cmdk-list');
                box.addEventListener('mousedown', (e) => { if (e.target === box) close(); });
                input.addEventListener('input', () => { sel = 0; render(); });
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); render(); }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
                    else if (e.key === 'Enter') { e.preventDefault(); open(items[sel]); }
                    else if (e.key === 'Escape') { e.preventDefault(); close(); }
                });
            }
            box.hidden = false;
            input.value = '';
            sel = 0;
            render();
            input.focus();
        }
        doc.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); show(); }
        });
        doc.getElementById('nav-search')?.addEventListener('click', show);
        return { show, close };
    }

    const api = { fold, match };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
    root.HpCmdk = api;
    if (root.document) {
        const go = () => { root.HpCmdk.ui = mount(root.document); };
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', go); else go();
    }
})(typeof window !== 'undefined' ? window : globalThis);
