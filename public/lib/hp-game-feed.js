// 🎥 DANH SÁCH NGƯỜI TẶNG QUÀ + ICON NÉT dùng chung cho overlay Game Camera (Đập Muỗi, Chém Trái Cây, Đá Cầu…).
// Mẫu gốc: Đập Muỗi (user chốt 2026-10-24) - thẻ kính tối gọn 1 dòng [avatar] [icon] Tên · hành động (màu theo hành động),
// không gãy dòng; icon nét HP Media (overlays/lib/hp-icons.js) KHÔNG nền, tô màu + bóng đổ cho rõ trên video.
// Vị trí / cỡ chỉnh ở panel từng game: { x, y, scale } (% khung cam thấy được, % cỡ) - sát mép trái / phải tự canh theo mép đó.
//
// Nạp SAU /lib/hp-icons.js:
//   const list = HpGameFeed.createList(boxEl, { max: 4, life: 2600 });
//   list.push({ icon: '🦟', who: 'Rowan', text: 'Thả muỗi 20 con', image: avatarUrl });   // icon = emoji (có trong HpIcons) hoặc tên icon
//   list.place(viewRect, { x: 50, y: 12, scale: 70 });     // viewRect = vùng thấy {x,y,w,h} cùng hệ toạ độ với khối cha của boxEl
//   HpGameFeed.icoHtml('🛡') / icoLabel('⚡ Thần Chém 5s') / drawLabel(ctx, '👑 HẠ GỤC!', x, y, size, color)   (canvas)
(function (root) {
  if (root.HpGameFeed) return;
  var hi = function () { return root.HpIcons || null; };
  // Màu icon theo loại (nét không nền nên màu phải sáng, đọc được trên video tối lẫn sáng nhờ bóng đổ).
  var COLOR = {
    mosquito: '#ff5a6e', hand: '#ffd54a', spray: '#2dd4bf', racket: '#ffd54a', bednet: '#7fd7ff', cream: '#5fe0c4',
    droplet: '#ff5a6e', crown: '#ffc93c', burst: '#c084fc', alert: '#ffd54a', timer: '#ffffff', hourglass: '#ffffff',
    shield: '#8fe8ff', snow: '#9be8ff', zap: '#ffd54a', flame: '#ff8a3d', star: '#ffd54a', trophy: '#ffc93c', skull: '#e5e7eb',
    bow: '#ffd54a', heart: '#ff5a7a', sparkles: '#ffe27a', target: '#ff6b6b', shuttle: '#ffffff', melon: '#7ee081', gift: '#ff7ab6',
    user: '#ffffff', gamepad: '#ffffff', turtle: '#bca1ff', cloudRain: '#7fd7ff', ball: '#55efff', utensils: '#ffbe64', eraser: '#55efff'
  };
  var esc = function (v) { return String(v == null ? '' : v).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); };
  // emoji đầu chuỗi (hoặc tên icon) → tên icon trong HpIcons.PATHS; không có → null
  function icoName(e) {
    var H = hi(); if (!H || !e) return null;
    if (H.PATHS[e]) return e;
    var sp = H.split(String(e));
    return sp && H.PATHS[sp.name] ? sp.name : null;
  }
  // icon nét màu (emoji chưa có icon - người dùng tự đặt - giữ nguyên chữ)
  function icoHtml(e, color) {
    if (!cssDone && typeof document !== 'undefined') injectCss(document);   // trang chỉ dùng icon (không tạo danh sách) vẫn có CSS .hpf-ico
    var n = icoName(e);
    if (n) return '<span class="hpf-ico" style="--c:' + (color || COLOR[n] || '#fff') + '">' + hi().svg(n) + '</span>';
    return e ? '<span class="hpf-ico txt">' + esc(e) + '</span>' : '';
  }
  // "⚡ Thần Chém 5s" → icon + chữ (đã thoát HTML)
  function icoLabel(label, color) {
    var H = hi(), sp = H && H.split(String(label));
    return sp && H.PATHS[sp.name] ? icoHtml(label, color) + esc(sp.rest) : esc(label);
  }
  // ---- canvas ----
  var imgs = {};
  function icoImg(name, color) {
    var k = name + color; if (imgs[k]) return imgs[k].complete && imgs[k].naturalWidth ? imgs[k] : null;
    var H = hi(); if (!H || !H.PATHS[name]) return null;
    var g = function (stroke, w) { return '<g fill="none" stroke="' + stroke + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round">' + H.PATHS[name] + '</g>'; };
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 28 28" width="112" height="112">' + g('rgba(0,0,0,.75)', 5.2) + g(color, 2.4) + '</svg>';
    var im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); imgs[k] = im; return null;
  }
  // Chữ nổi: emoji đầu → icon; emoji lẻ khác (💥 cuối câu) bỏ; ♥ ✓ là chữ thường, giữ.
  var STRAY = /\s*[\u{1F300}-\u{1FAFF}]\uFE0F?/gu;
  function splitLabel(text) {
    var H = hi(), sp = H && H.split(String(text)), name = sp && H.PATHS[sp.name] ? sp.name : null;
    // emoji CUỐI câu ("ĐÓNG BĂNG ❄") cũng thành icon đầu
    var t = name ? sp.rest : String(text);
    if (!name && H) {
      var m = /\s*((?:\p{Extended_Pictographic})\uFE0F?)\s*$/u.exec(t);
      if (m) { var n2 = icoName(m[1]); if (n2) { name = n2; t = t.slice(0, m.index); } }
    }
    return { ico: name, text: t.replace(STRAY, '').trim() };
  }
  // Vẽ icon + chữ canh giữa tại (x, y = đường chân chữ). Người gọi đặt sẵn ctx.font / lineWidth / strokeStyle.
  function drawLabel(ctx, text, x, y, size, color) {
    var sl = typeof text === 'string' ? splitLabel(text) : text;
    var im = sl.ico && icoImg(sl.ico, COLOR[sl.ico] || color);
    ctx.fillStyle = color;
    if (!im) { ctx.textAlign = 'center'; ctx.strokeText(sl.text, x, y); ctx.fillText(sl.text, x, y); return; }
    var is = size * 1.15, gap = sl.text ? size * 0.25 : 0, tw = sl.text ? ctx.measureText(sl.text).width : 0, x0 = x - (is + gap + tw) / 2;
    ctx.drawImage(im, x0, y - size * 0.92, is, is);
    if (sl.text) { ctx.textAlign = 'left'; ctx.strokeText(sl.text, x0 + is + gap, y); ctx.fillText(sl.text, x0 + is + gap, y); }
  }

  // ---- danh sách người tặng ----
  var CSS = ''
    + '.hpf-ico{display:inline-block;flex:none;width:1.1em;height:1.1em;color:var(--c,#fff);vertical-align:-.18em;'
    + 'filter:drop-shadow(0 2px 2px rgba(0,0,0,.75)) drop-shadow(0 0 6px rgba(0,0,0,.45))}'
    + '.hpf-ico svg{display:block;width:100%;height:100%;stroke-width:2.4}'
    + '.hpf-ico.txt{width:auto;height:auto;filter:none}'
    + '.hpf-list{position:absolute;left:50%;top:12%;width:max-content;transform:translateX(-50%);transform-origin:50% 0;'
    + 'display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;z-index:20}'
    + '.hpf-row{--c:#fff;display:flex;align-items:center;gap:12px;height:60px;padding:0 22px 0 8px;border-radius:16px;white-space:nowrap;'
    + 'background:linear-gradient(180deg,rgba(30,32,46,.86),rgba(12,14,22,.86));box-shadow:inset 0 1px 0 rgba(255,255,255,.16),0 6px 16px rgba(0,0,0,.35);'
    + 'font:600 28px "Segoe UI",Arial,sans-serif;color:rgba(255,255,255,.88);animation:hpfIn .3s cubic-bezier(.2,1.25,.4,1)}'
    + '.hpf-row.noav{padding-left:18px}'
    + '.hpf-row img{width:44px;height:44px;border-radius:50%;object-fit:cover;flex:none;box-shadow:0 0 0 2px rgba(255,255,255,.22);background:#222}'
    + '.hpf-row .hpf-ico{width:34px;height:34px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.6))}'
    + '.hpf-row b{font-weight:800;color:#fff;max-width:280px;overflow:hidden;text-overflow:ellipsis}'
    + '.hpf-row .act{color:var(--c);font-weight:700}'
    + '.hpf-row.out{opacity:0;transform:translateY(-6px);transition:opacity .4s,transform .4s}'
    + '@keyframes hpfIn{from{transform:translateY(14px) scale(.92);opacity:0}to{transform:none;opacity:1}}';
  var cssDone = false;
  function injectCss(doc) {
    doc = doc || document; if (cssDone || !doc.head) return; cssDone = true;
    var st = doc.createElement('style'); st.setAttribute('data-hp-game-feed', ''); st.textContent = CSS; doc.head.appendChild(st);
  }
  function createList(box, opts) {
    opts = opts || {};
    var max = opts.max || 4, life = opts.life || 2600;
    injectCss(box.ownerDocument);
    box.classList.add('hpf-list');
    // o = { icon, who, text, image, color } - who giữ nguyên chữ / emoji của người tặng (data-no-icon)
    function push(o) {
      o = o || {};
      var n = icoName(o.icon), el = box.ownerDocument.createElement('div');
      el.className = 'hpf-row' + (o.image ? '' : ' noav');
      el.style.setProperty('--c', o.color || COLOR[n] || '#ffd54a');
      el.innerHTML = (o.image ? '<img src="' + esc(o.image) + '" alt="">' : '') + icoHtml(o.icon, o.color)
        + (o.who ? '<b data-no-icon>' + esc(o.who) + '</b>' : '') + '<span class="act">' + esc(o.text || '') + '</span>';
      box.appendChild(el);
      while (box.children.length > max) box.removeChild(box.firstChild);
      setTimeout(function () { el.classList.add('out'); }, life); setTimeout(function () { el.remove(); }, life + 500);
      return el;
    }
    // Sát mép trái / phải (< 34 % / > 66 %) → các dòng canh theo mép đó; luôn giữ trọn trong vùng thấy (không tràn khỏi khung).
    function place(view, p) {
      p = p || {};
      var ls = (Number(p.scale) || 100) / 100, lx = p.x == null ? 50 : Number(p.x), ly = p.y == null ? 12 : Number(p.y);
      var al = lx < 34 ? 0 : lx > 66 ? 1 : 0.5, bw = box.childElementCount ? box.offsetWidth * ls : 0;
      var ax = Math.max(view.x + bw * al, Math.min(view.x + view.w - bw * (1 - al), view.x + lx / 100 * view.w));
      box.style.left = ax + 'px'; box.style.top = (view.y + ly / 100 * view.h) + 'px';
      box.style.alignItems = al === 0 ? 'flex-start' : al === 1 ? 'flex-end' : 'center';
      box.style.transformOrigin = (al * 100) + '% 0';
      box.style.transform = 'translateX(' + (-al * 100) + '%) scale(' + ls + ')';
    }
    return { push: push, place: place, el: box };
  }

  root.HpGameFeed = { COLOR: COLOR, esc: esc, icoName: icoName, icoHtml: icoHtml, icoLabel: icoLabel, icoImg: icoImg,
    splitLabel: splitLabel, drawLabel: drawLabel, createList: createList, injectCss: injectCss };
})(typeof window !== 'undefined' ? window : globalThis);
