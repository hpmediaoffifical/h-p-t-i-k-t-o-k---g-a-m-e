/**
 * 🏢 Creator Online (bản LIVE) — HUD khung 1080×1920 cho người xem điện thoại.
 * Bố cục vùng an toàn theo spec 2026-11-03-creatoronline-design.md §13 (toạ độ x, y, rộng, cao ở 1080×1920):
 *   tên phòng (120,240,800,96) · thanh PK thay chỗ (120,240,800,180) · người đang được quay (120,432,520,132)
 *   ô quà / chú giải (660,432,260,300) · chip (660,750,260,170) · hướng dẫn (120,940,800,84) · banner (120,600,800,260)
 * Đơn vị --u = min(rộng/1080, cao/1920) px → giữ tỉ lệ ở mọi cỡ cửa sổ. Chỉ ghi DOM khi nội dung đổi.
 */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const img = (url, cls) => (url && /^https?:\/\//i.test(url) ? `<img class="${cls}" src="${esc(url)}" referrerpolicy="no-referrer" alt="" onerror="this.remove()">` : '');
const fmt = (n) => Math.floor(Number(n) || 0).toLocaleString('vi-VN');

export class LiveHud {
  /** @param {HTMLElement} root phần tử #hud phủ kín cửa sổ */
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="co-frame">
        <div class="co-box co-title"><img class="co-title-logo" src="/games/creatoronline/assets/logo-mark.svg" alt="" hidden><b class="co-title-name"></b><span class="co-chip-genre"></span></div>
        <div class="co-box co-pk" hidden></div>
        <div class="co-box co-onair" hidden></div>
        <div class="co-box co-feed"></div>
        <div class="co-chips"></div>
        <div class="co-box co-join"><span></span></div>
        <div class="co-banner" hidden></div>
        <div class="co-debug" hidden></div>
      </div>`;
    this.frame = root.querySelector('.co-frame');
    this.el = {
      title: root.querySelector('.co-title'),
      titleName: root.querySelector('.co-title-name'),
      titleLogo: root.querySelector('.co-title-logo'),
      genre: root.querySelector('.co-chip-genre'),
      pk: root.querySelector('.co-pk'),
      onair: root.querySelector('.co-onair'),
      feed: root.querySelector('.co-feed'),
      chips: root.querySelector('.co-chips'),
      join: root.querySelector('.co-join'),
      joinText: root.querySelector('.co-join span'),
      banner: root.querySelector('.co-banner'),
      debug: root.querySelector('.co-debug'),
    };
    this._cache = {};
    this.feedRows = []; // [{key, name, avatar, giftName, giftImage, count, at}]
    this.legend = [];
    this.topFans = [];
    this.joinLines = [];
    this.joinIdx = 0;
    this.joinT = 0;
    this.idleIdx = 0;
    this.idleT = 0;
    this.bannerUntil = 0;
    this.showLegend = true;
    this.showJoin = true;
    this.resize();
  }

  resize() {
    // đặt ở :root để cả bảng tên (#labels) dùng chung đơn vị
    const u = Math.min(window.innerWidth / 1080, window.innerHeight / 1920);
    document.documentElement.style.setProperty('--u', `${u}px`);
  }

  _set(key, el, html) {
    if (this._cache[key] === html) return;
    this._cache[key] = html;
    el.innerHTML = html;
  }

  /** Tên phòng đang quay + chip thể loại (ẩn khi đang PK — thanh PK thay chỗ). t.logo = hiện logo [hp] trước tên. */
  setTitle(t) {
    if (!t) {
      this.el.title.hidden = true;
      return;
    }
    this.el.title.hidden = !!this._pkOn;
    if (this.el.titleLogo.hidden !== !t.logo) this.el.titleLogo.hidden = !t.logo;
    if (this._cache.titleName !== t.title) {
      this._cache.titleName = t.title;
      this.el.titleName.textContent = t.title;
    }
    if (this._cache.genre !== t.genre) {
      this._cache.genre = t.genre;
      this.el.genre.textContent = t.genre || '';
      this.el.genre.hidden = !t.genre;
    }
    if (this._cache.accent !== t.accent) {
      this._cache.accent = t.accent;
      this.el.title.style.setProperty('--accent', t.accent || '#ff4fa3');
    }
  }

  /**
   * Thanh PK. null = tắt.
   * @param {null|{aName, bName, aNo, bNo, aScore, bScore, share, left, final, needXu, trailing:'a'|'b'|null, topA:[], topB:[], hint}} p
   */
  setPk(p) {
    this._pkOn = !!p;
    this.el.pk.hidden = !p;
    this.el.title.hidden = !!p || this.el.title.hidden;
    if (!p) return;
    // GĐ2: cùng ô cho thách đấu 1–1 (kind 'duel': số người chơi + avatar thay cho mã nhóm)
    const duel = p.kind === 'duel';
    if (this.el.pk.classList.contains('duel') !== duel) this.el.pk.classList.toggle('duel', duel);
    const tops = (list) => list.map((f) => `<span class="co-pk-top">${img(f.avatar, 'co-av')}${esc(f.name)}</span>`).join('');
    const x2 = (side) => (p.final && p.trailing === side ? '<em class="co-x2">❤ ×2</em>' : '');
    const html = `
      <div class="co-pk-row1"><span class="co-pk-a">${img(p.aAv, 'co-av')}${esc(p.aNo)} ${esc(p.aName)}</span><span class="co-pk-time${p.final ? ' final' : ''}">${duel ? '🥊' : '⚔'} ${esc(p.left)}s</span><span class="co-pk-b">${esc(p.bName)} ${esc(p.bNo)}${img(p.bAv, 'co-av')}</span></div>
      <div class="co-pk-row2"><b>${fmt(p.aScore)}</b><div class="co-pk-bar"><i style="width:${(p.share * 100).toFixed(1)}%"></i></div><b>${fmt(p.bScore)}</b></div>
      <div class="co-pk-row3"><span class="co-pk-tops">${x2('a')}${tops(p.topA)}</span><span class="co-pk-need">${p.needXu ? `cần ${fmt(p.needXu)} xu để lật kèo` : esc(p.hint || '')}</span><span class="co-pk-tops r">${tops(p.topB)}${x2('b')}</span></div>`;
    this._set('pk', this.el.pk, html);
  }

  /** Người đang được quay: avatar + tên + "<vai/phòng> · 0:18" + thanh thời gian. */
  setOnAir(o) {
    this.el.onair.hidden = !o;
    if (!o) {
      this._cache.onair = '';
      return;
    }
    const sec = Math.max(0, Math.ceil(o.remainSec));
    const time = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    const html = `${img(o.avatar, 'co-onair-av') || '<span class="co-onair-av co-av-empty">🎥</span>'}<div class="co-onair-txt"><b>${esc(o.name)}</b><small>${esc(o.label)} · ${time}</small><div class="co-onair-bar"><i style="width:${(Math.max(0, Math.min(1, o.progress)) * 100).toFixed(0)}%"></i></div></div>`;
    this._set('onair', this.el.onair, html);
  }

  /** Quà mới: cùng người + cùng quà trong 10 giây thì cập nhật dòng cũ (x5 → x10). */
  pushGift(g, now) {
    const row = this.feedRows.find((r) => r.key === g.key && now - r.at < 10000);
    if (row) {
      row.count += g.count;
      row.at = now;
    } else {
      this.feedRows.unshift({ ...g, at: now });
      this.feedRows.length = Math.min(this.feedRows.length, 3);
    }
    this._feedDirty = true;
  }

  setLegend(rows, show) {
    this.legend = rows || [];
    this.showLegend = show !== false;
  }

  setTopFans(list) {
    this.topFans = list || [];
  }

  setJoinLines(lines, show) {
    this.joinLines = lines || [];
    this.showJoin = show !== false;
  }

  /** Dòng hướng dẫn đang hiện (để lặp lại trên dòng chữ chạy của màn LED). */
  get joinLine() {
    return this.joinLines[this.joinIdx % Math.max(1, this.joinLines.length)] ?? '';
  }

  /** Banner quà lớn ~5 giây; ô quà ẩn trong lúc banner hiện (chồng vùng). */
  banner({ avatar, name, text, sub, giftImage, tier = 5 }, now, ms = 5000) {
    this.el.banner.className = `co-banner t${tier}`;
    this.el.banner.innerHTML = `${img(avatar, 'co-banner-av')}<div class="co-banner-txt"><b>${esc(name)}</b><span>${esc(text)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</div>${img(giftImage, 'co-banner-gift')}`;
    this.el.banner.hidden = false;
    this.el.banner.classList.remove('show');
    void this.el.banner.offsetWidth;
    this.el.banner.classList.add('show');
    this.bannerUntil = now + ms;
  }

  /** Chip HUD khi bảng tên của người đó không có trên màn hình. Tối đa 3. */
  chip(text) {
    const c = document.createElement('div');
    c.className = 'co-hchip';
    c.textContent = text;
    this.el.chips.prepend(c);
    while (this.el.chips.children.length > 3) this.el.chips.lastChild.remove();
    setTimeout(() => c.remove(), 2600);
  }

  debug(text) {
    this.el.debug.hidden = !text;
    if (text) this.el.debug.textContent = text;
  }

  /** Gọi ~4 lần/giây: xoay câu hướng dẫn, đổi ô quà ↔ chú giải ↔ top fan, tắt banner. */
  tick(now, dt) {
    // hướng dẫn: 1 dòng, xoay mỗi 6 giây
    this.el.join.hidden = !this.showJoin || !this.joinLines.length;
    this.joinT += dt;
    if (this.joinT >= 6) {
      this.joinT = 0;
      this.joinIdx = (this.joinIdx + 1) % Math.max(1, this.joinLines.length);
    }
    const jl = this.joinLine;
    if (this._cache.join !== jl) {
      this._cache.join = jl;
      this.el.joinText.textContent = jl;
      this.el.join.classList.remove('flip');
      void this.el.join.offsetWidth;
      this.el.join.classList.add('flip');
    }
    // banner
    if (this.bannerUntil && now >= this.bannerUntil) {
      this.bannerUntil = 0;
      this.el.banner.hidden = true;
    }
    const bannerOn = this.bannerUntil > 0;
    // ô quà: có quà trong 20 giây qua → 3 dòng quà; rảnh → từng mục chú giải (4 giây) ↔ top 3 fan (6 giây)
    const recent = this.feedRows.length && now - this.feedRows[0].at < 20000;
    let html;
    if (recent) {
      html = `<div class="co-feed-title">🎁 Quà mới</div>${this.feedRows
        .map((r) => `<div class="co-feed-row">${img(r.giftImage, 'co-feed-gift') || '<span class="co-feed-gift">🎁</span>'}<div><b>${esc(r.name)}</b><small>${esc(r.giftName)}${r.count > 1 ? ` x${r.count}` : ''}</small></div></div>`)
        .join('')}`;
    } else {
      this.idleT += dt;
      const items = [];
      if (this.showLegend) for (const l of this.legend) items.push({ kind: 'legend', l, dur: 4 });
      if (this.topFans.length) items.push({ kind: 'top', dur: 6 });
      if (!items.length) html = '';
      else {
        let cur = items[this.idleIdx % items.length];
        if (this.idleT >= cur.dur) {
          this.idleT = 0;
          this.idleIdx = (this.idleIdx + 1) % items.length;
          cur = items[this.idleIdx];
        }
        html =
          cur.kind === 'legend'
            ? `<div class="co-feed-title">🎁 Tặng quà để…</div><div class="co-legend">${img(cur.l.giftImage, 'co-legend-gift') || `<span class="co-legend-icon">${esc(cur.l.icon)}</span>`}<span>${esc(cur.l.text)}</span></div>`
            : `<div class="co-feed-title">🏆 Top fan buổi này</div>${this.topFans
                .slice(0, 3)
                .map((f, i) => `<div class="co-feed-row">${img(f.avatar, 'co-feed-gift') || `<span class="co-feed-gift">${['🥇', '🥈', '🥉'][i]}</span>`}<div><b>${esc(f.name)}</b><small>${fmt(f.xu)} xu</small></div></div>`)
                .join('')}`;
      }
    }
    this.el.feed.hidden = bannerOn || !html;
    if (html !== undefined) this._set('feed', this.el.feed, html);
  }
}
