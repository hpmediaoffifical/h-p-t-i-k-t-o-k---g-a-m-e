// 🖼 Xem trước game: rê chuột vào game ở Thư viện (thanh bên) → thẻ nhỏ có ảnh overlay + mô tả.
// Ảnh: public/previews/<id>.webp (chụp bằng tools/capture-previews.js), danh sách ở public/previews/index.json —
// game chưa có ảnh (overlay chỉ hiện khi có PK / người vào phòng, game camera…) dùng thẻ biểu tượng.
// Ảnh chỉ tải khi rê chuột tới (không tốn gì lúc mở app).
(function (root) {
    const doc = root.document;
    const list = doc.getElementById('game-list');
    if (!list) return;
    const GI = root.HpGameIcons;
    let shots = null, meta = null, card = null, timer = null, curId = '';

    const load = () => Promise.all([
        shots || fetch('/previews/index.json').then(r => r.json()).then(a => (shots = new Set(a))).catch(() => (shots = new Set())),
        meta || fetch('/api/games').then(r => r.json()).then(a => (meta = new Map(a.map(g => [g.id, g])))).catch(() => (meta = new Map()))
    ]);

    function hide() {
        clearTimeout(timer); timer = null; curId = '';
        if (card) card.hidden = true;
    }

    async function show(item) {
        const id = item.dataset.id;
        if (!id || id === curId) return;
        curId = id;
        await load();
        if (curId !== id) return;
        const g = meta.get(id) || {};
        if (!card) {
            card = doc.createElement('div');
            card.className = 'gp-card';
            card.setAttribute('role', 'tooltip');
            doc.body.appendChild(card);
        }
        card.textContent = '';
        const pic = doc.createElement('div');
        pic.className = 'gp-pic';
        if (shots.has(id)) {
            const img = doc.createElement('img');
            img.alt = ''; img.decoding = 'async'; img.width = 216; img.height = 384;
            img.src = '/previews/' + encodeURIComponent(id) + '.webp';
            pic.appendChild(img);
        } else {
            pic.classList.add('gp-icon');
            if (GI) pic.innerHTML = GI.svg(id, 56);   // SVG hằng từ game-icons.js
        }
        const name = doc.createElement('b');
        name.className = 'gp-name';
        name.textContent = (item.querySelector('.gn')?.firstChild?.textContent || g.name || id).trim();
        card.append(pic, name);
        const desc = String(g.description || '').trim();
        if (desc) { const d = doc.createElement('p'); d.className = 'gp-desc'; d.textContent = desc; card.appendChild(d); }
        const r = item.getBoundingClientRect();
        card.hidden = false;
        const h = card.offsetHeight;
        card.style.left = Math.round(r.right + 10) + 'px';
        card.style.top = Math.round(Math.max(8, Math.min(root.innerHeight - h - 8, r.top + r.height / 2 - h / 2))) + 'px';
    }

    list.addEventListener('mouseover', (e) => {
        const item = e.target.closest('.game-item[data-id]');
        if (!item || item.querySelector('.gtt-side-arrow') || item.dataset.id === curId) return;
        clearTimeout(timer);
        timer = setTimeout(() => show(item), 350);
    });
    list.addEventListener('mouseleave', hide);
    list.addEventListener('click', hide);
    root.addEventListener('scroll', hide, true);
})(window);
