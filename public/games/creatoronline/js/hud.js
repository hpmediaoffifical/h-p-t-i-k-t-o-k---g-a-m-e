/**
 * DOM HUD: info panel, toolbar, room bar, PK bar, rhythm meter, chat, prompts,
 * toasts, gift banners and modal panels.
 * Every user-provided string is inserted with textContent (never innerHTML).
 */

const ICONS = {
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  shirt: '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>',
  expand: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
  mute: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
  camera: '<path d="m22 8-6 4 6 4V8z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  screen: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  coin: '<circle cx="12" cy="12" r="9" fill="#ffd34d" stroke="#c98a00"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" stroke="#8a5a00"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ''}</svg>`;
}

const $ = (id) => document.getElementById(id);

export class Hud {
  /**
   * @param {object} handlers {onSend(text), onButton(name)}
   */
  constructor(handlers) {
    this.h = handlers;
    this.notifications = [];
    this.unread = 0;
    for (const el of document.querySelectorAll('[data-icon]')) el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon));
    for (const el of document.querySelectorAll('[data-btn]')) {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.h.onButton?.(el.dataset.btn, el);
      });
    }
    const input = $('chat-input');
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = input.value.trim();
        input.value = '';
        input.blur();
        if (text) this.h.onSend?.(text);
      } else if (e.key === 'Escape') {
        input.value = '';
        input.blur();
      }
    });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    $('panel-close').addEventListener('click', () => this.closePanel());
    $('panel').addEventListener('click', (e) => {
      if (e.target.id === 'panel') this.closePanel();
    });
  }

  show() {
    $('hud').classList.remove('hidden');
  }

  isTyping() {
    return document.activeElement === $('chat-input');
  }

  focusChat() {
    $('chat').classList.remove('collapsed');
    $('chat-input').focus();
  }

  toggleChat() {
    $('chat').classList.toggle('collapsed');
  }

  setChatTarget(text) {
    $('chat-input').placeholder = text;
  }

  /** Update the info panel. */
  setInfo({ time, where, rank, role, hearts, coins, online, hint, net }) {
    const set = (id, v) => {
      const el = $(id);
      if (el.textContent !== v) el.textContent = v;
    };
    set('clock', time);
    set('where', where);
    set('rank', rank);
    set('role', role);
    set('hearts', hearts);
    set('coins', coins);
    set('online-count', online);
    set('online-count2', online);
    set('hint', hint);
    set('net-status', net);
  }

  /** Bottom room bar (null hides it). */
  setRoomBar(info) {
    const bar = $('roombar');
    if (!info) {
      bar.classList.remove('show');
      return;
    }
    bar.classList.add('show');
    const t = $('roombar-title');
    if (t.textContent !== info.title) t.textContent = info.title;
    const s = $('roombar-sub');
    if (s.textContent !== info.sub) s.textContent = info.sub;
    bar.style.setProperty('--accent', info.accent);
    $('rb-role').style.display = info.group ? '' : 'none';
    $('rb-seat').style.display = info.group ? 'none' : '';
  }

  /** PK bar at the top (null hides it). */
  setPk(pk) {
    const el = $('pkbar');
    if (!pk) {
      el.classList.remove('show');
      return;
    }
    el.classList.add('show');
    $('pk-left').textContent = `${pk.leftName} ${pk.scoreA}`;
    $('pk-right').textContent = `${pk.scoreB} ${pk.rightName}`;
    $('pk-fill').style.width = `${Math.round(pk.share * 100)}%`;
    $('pk-time').textContent = `⚔ PK · ${pk.left}s`;
  }

  /** Rhythm meter for idols (null hides it). phase 0..1 within the beat. */
  setRhythm(r) {
    const el = $('rhythm');
    if (!r) {
      el.classList.remove('show');
      return;
    }
    el.classList.add('show');
    const ring = $('rhythm-ring');
    const s = 1 + (1 - r.phase) * 1.4;
    ring.style.transform = `scale(${s.toFixed(3)})`;
    $('rhythm-combo').textContent = r.combo > 1 ? `Combo x${r.combo}` : 'Nhấn F đúng nhịp!';
  }

  rhythmGrade(grade) {
    const el = $('rhythm-grade');
    el.textContent = grade === 'perfect' ? 'PERFECT!' : grade === 'good' ? 'GOOD' : 'MISS';
    el.className = `grade ${grade}`;
    void el.offsetWidth;
    el.classList.add('pop');
  }

  /** Append a chat line. kind: npc | system | self | remote | gift | room */
  chat(name, text, kind = 'npc', tag = '') {
    const log = $('chat-log');
    const row = document.createElement('div');
    row.className = `chat-row ${kind}`;
    if (tag) {
      const t = document.createElement('i');
      t.textContent = tag;
      row.append(t);
    }
    const n = document.createElement('b');
    n.textContent = `${name}: `;
    const t = document.createElement('span');
    t.textContent = text;
    row.append(n, t);
    log.append(row);
    while (log.children.length > 40) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  /** Bottom-center interaction prompt (null hides it). */
  prompt(text) {
    const el = $('prompt');
    if (!text) {
      el.classList.remove('show');
      return;
    }
    el.classList.add('show');
    if ($('prompt-text').textContent !== text) $('prompt-text').textContent = text;
  }

  toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    $('toasts').append(el);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
    setTimeout(() => el.classList.add('out'), 2300);
    setTimeout(() => el.remove(), 2800);
  }

  /** Big centred banner (gift / PK result). */
  banner(text, sub = '') {
    const el = $('banner');
    el.replaceChildren();
    const b = document.createElement('div');
    b.textContent = text;
    el.append(b);
    if (sub) {
      const s = document.createElement('small');
      s.textContent = sub;
      el.append(s);
    }
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  notify(text) {
    this.notifications.unshift({ text, at: new Date() });
    this.notifications.length = Math.min(this.notifications.length, 40);
    this.unread++;
    const b = $('notif-badge');
    b.textContent = this.unread > 9 ? '9+' : String(this.unread);
    b.style.display = '';
  }

  clearUnread() {
    this.unread = 0;
    $('notif-badge').style.display = 'none';
  }

  setButtonIcon(btn, name) {
    const el = document.querySelector(`[data-btn="${btn}"]`);
    if (!el) return;
    el.querySelector('svg')?.remove();
    el.insertAdjacentHTML('afterbegin', icon(name));
  }

  setToggle(btn, on) {
    document.querySelector(`[data-btn="${btn}"]`)?.classList.toggle('off', !on);
  }

  /** Open a modal panel; `build(body)` fills it with DOM nodes. */
  openPanel(title, build, key = null) {
    $('panel-title').textContent = title;
    const body = $('panel-body');
    body.replaceChildren();
    build(body);
    $('panel').classList.add('show');
    this.panelOpen = true;
    this.panelKey = key;
  }

  closePanel() {
    $('panel').classList.remove('show');
    this.panelOpen = false;
    this.panelKey = null;
  }
}

/** Tiny DOM helper: el('div', {className:'x'}, child, 'text') */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'onclick') node.addEventListener('click', v);
    else if (k === 'style') Object.assign(node.style, v);
    else node[k] = v;
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}
