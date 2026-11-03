/**
 * 🏢 Creator Online (bản LIVE) — bảng tên + bong bóng chat + chip nổi trên đầu nhân vật.
 * Chiếu toạ độ 3D → màn hình mỗi khung (không cần CSS2DRenderer) — chép/chỉnh từ Nhà Tù js/labels.js
 * (working tree 03/11/2026). Thêm so với Nhà Tù (spec 2026-11-03-creatoronline-design.md §3, §13):
 * - trần số nhãn mỗi khung (`maxShown`, 8 / cảnh rộng 5) theo ưu tiên: người đang được quay → người tặng quà
 *   60 giây qua → người vừa bình luận → người xem → NPC (chỉ ở cảnh gần); bong bóng đang hiện được cộng ưu tiên;
 * - cỡ tối thiểu theo loại (người xem không nhỏ hơn ~34 px ở bề ngang 1080);
 * - `flash(text)`: chip ngắn ("+15 ❤", "✓ → ③") bật trên bảng tên 2 giây;
 * - `obj.visible` giả để npc.js (setHidden) dùng chung với bản CSS2D.
 */
import * as THREE from 'three';

let layer = null;
const tmp = new THREE.Vector3();

// kind → { cỡ chữ tương đối, khoảng cách tối đa, ưu tiên gốc, cỡ nhỏ nhất, cỡ lớn nhất }
const KINDS = {
  crowd: { boost: 1, maxDist: 0, prio: 0, min: 0.5, max: 1 }, // đám đông NPC vô danh: không hiện tên
  npc: { boost: 0.8, maxDist: 20, prio: 10, min: 0.55, max: 1.1 },
  viewer: { boost: 1.05, maxDist: 70, prio: 40, min: 0.8, max: 1.35 },
  host: { boost: 1.15, maxDist: 70, prio: 70, min: 0.85, max: 1.45 }, // giữ vai / chủ phòng / khách trên sân
  gifter: { boost: 1.2, maxDist: 80, prio: 80, min: 0.9, max: 1.5 }, // nhãn vàng sau quà lớn
  spot: { boost: 1.35, maxDist: 90, prio: 100, min: 1.1, max: 1.7 }, // người đang được quay
};

/** Lớp DOM chứa mọi bảng tên. Gọi setLabelLayer() một lần lúc khởi động. */
export class LabelLayer {
  /** @param {HTMLElement} container phần tử phủ kín khung game */
  constructor(container, { maxShown = 8 } = {}) {
    this.el = container;
    this.items = new Set();
    this.maxShown = maxShown;
    this._cand = []; // dùng lại mỗi khung (không cấp phát)
  }

  /** Cập nhật vị trí + cỡ chữ; chỉ `maxShown` nhãn ưu tiên cao nhất được hiện. */
  render(camera, width, height, dt) {
    const cand = this._cand;
    cand.length = 0;
    for (const it of this.items) {
      if (it.bubbleTime > 0) {
        it.bubbleTime -= dt;
        if (it.bubbleTime <= 0) it.bubble.classList.remove('show');
      }
      if (it.flashTime > 0) {
        it.flashTime -= dt;
        if (it.flashTime <= 0) it.flashEl.classList.remove('show');
      }
      it.want = false;
      const k = KINDS[it.kind] ?? KINDS.npc;
      if (it.hidden || k.maxDist <= 0 || !it.char.root.visible) continue;
      const root = it.char.root;
      tmp.set(root.position.x, root.position.y + it.height, root.position.z);
      const dist = camera.position.distanceTo(tmp);
      if (dist > k.maxDist) continue;
      tmp.project(camera);
      if (tmp.z >= 1 || tmp.z <= -1 || Math.abs(tmp.x) > 1.15 || Math.abs(tmp.y) > 1.15) continue;
      it.sx = (tmp.x * 0.5 + 0.5) * width;
      it.sy = (-tmp.y * 0.5 + 0.5) * height;
      it.dist = dist;
      it.score = k.prio + it.extra + (it.bubbleTime > 0 || it.flashTime > 0 ? 15 : 0) - dist * 0.05;
      cand.push(it);
    }
    cand.sort((a, b) => b.score - a.score);
    const n = Math.min(this.maxShown, cand.length);
    for (let i = 0; i < n; i++) cand[i].want = true;
    for (const it of this.items) {
      if (!it.want) {
        if (it.shown) {
          it.wrap.style.display = 'none';
          it.shown = false;
        }
        continue;
      }
      if (!it.shown) {
        it.wrap.style.display = '';
        it.shown = true;
      }
      const k = KINDS[it.kind] ?? KINDS.npc;
      const s = Math.max(k.min, Math.min(k.max, (k.boost * 9.5) / Math.max(it.dist, 0.1)));
      it.wrap.style.transform = `translate(${it.sx.toFixed(1)}px, ${it.sy.toFixed(1)}px) translate(-50%, -100%) scale(${s.toFixed(3)})`;
      const z = 100000 - Math.round(it.dist * 20) + Math.round(it.score);
      if (z !== it.z) {
        it.z = z;
        it.wrap.style.zIndex = String(z);
      }
    }
  }

  /** Số nhãn đang hiện (cho ?debug=1). */
  get shownCount() {
    let n = 0;
    for (const it of this.items) if (it.shown) n++;
    return n;
  }
}

export function setLabelLayer(l) {
  layer = l;
}

/**
 * Gắn bảng tên lên một nhân vật.
 * @param {object} char từ createCharacter
 * @param {string} name
 * @param {'npc'|'crowd'|'viewer'|'host'|'gifter'|'spot'} kind
 * @param {string} [avatar] link ảnh đại diện TikTok (không bắt buộc)
 */
export function attachLabel(char, name, kind = 'npc', avatar = '') {
  const wrap = document.createElement('div');
  wrap.className = 'co-lab';
  wrap.style.display = 'none';
  const bubble = document.createElement('div');
  bubble.className = 'co-bubble';
  const flashEl = document.createElement('div');
  flashEl.className = 'co-flash';
  const tag = document.createElement('div');
  const nameEl = document.createElement('span');
  nameEl.className = 'co-name';
  const badgeEl = document.createElement('b');
  badgeEl.className = 'co-badge';
  badgeEl.hidden = true;
  const noEl = document.createElement('b'); // GĐ2: số người chơi (#12) để người khác gõ "ném 12"
  noEl.className = 'co-no';
  noEl.hidden = true;
  tag.append(noEl, nameEl, badgeEl);
  wrap.append(bubble, flashEl, tag);
  let img = null;
  let badgeText = '';
  let nameText = '';
  let noKey = '';
  const item = { char, wrap, bubble, flashEl, tag, kind: 'npc', height: 1.95, extra: 0, bubbleTime: 0, flashTime: 0, z: 0, shown: false, hidden: false, want: false, sx: 0, sy: 0, dist: 0, score: 0 };
  const setName = (n) => {
    const t = String(n ?? '');
    if (t === nameText) return;
    nameText = t;
    nameEl.textContent = t.length > 14 ? `${t.slice(0, 12)}…` : t; // tên dài cắt ở 12 ký tự (spec §3)
  };
  const setAvatar = (url) => {
    if (img) img.remove();
    img = null;
    if (!url || !/^https?:\/\//i.test(url)) return;
    img = document.createElement('img');
    img.referrerPolicy = 'no-referrer';
    img.alt = '';
    img.src = url;
    img.onerror = () => img && img.remove();
    tag.prepend(img);
  };
  const setKind = (k) => {
    if (!KINDS[k]) k = 'npc';
    item.kind = k;
    tag.className = `co-tag ${k}`;
  };
  setName(name);
  setKind(kind);
  setAvatar(avatar);
  layer?.el.append(wrap);
  layer?.items.add(item);
  return {
    /** setHidden() của npc.js ghi `label.obj.visible` (API CSS2D cũ). */
    obj: {
      get visible() {
        return !item.hidden;
      },
      set visible(v) {
        item.hidden = !v;
      },
    },
    say(text, seconds = 4.5) {
      bubble.textContent = text;
      bubble.classList.remove('show');
      void bubble.offsetWidth;
      bubble.classList.add('show');
      item.bubbleTime = seconds;
    },
    /** Chip ngắn trên bảng tên ("+15 ❤", "✓ → ③"), mặc định 2 giây. */
    flash(text, seconds = 2) {
      flashEl.textContent = text;
      flashEl.classList.remove('show');
      void flashEl.offsetWidth;
      flashEl.classList.add('show');
      item.flashTime = seconds;
    },
    setName,
    /** Huy hiệu nhỏ sau tên ('👑', '⭐', '⏳2'…); '' = ẩn. Chỉ ghi DOM khi đổi. */
    setBadge(text = '') {
      if (text === badgeText) return;
      badgeText = text;
      badgeEl.textContent = text;
      badgeEl.hidden = !text;
    },
    /** Số người chơi trước tên (#12) theo màu nhóm; n rỗng/null = ẩn. Chỉ ghi DOM khi đổi. */
    setNo(n, color = '') {
      const key = `${n ?? ''}|${color}`;
      if (key === noKey) return;
      noKey = key;
      noEl.hidden = n == null || n === '';
      noEl.textContent = noEl.hidden ? '' : String(n);
      noEl.style.background = color || '';
    },
    setKind,
    get kind() {
      return item.kind;
    },
    setAvatar,
    /** Cộng thêm ưu tiên (vd. cấp fan, vừa bình luận). */
    setPriority(extra) {
      item.extra = extra;
    },
    setHidden(h) {
      item.hidden = h;
    },
    setHeight(h) {
      item.height = h;
    },
    /** Đang hiện trên màn hình không (để biết có nên dùng chip HUD thay thế). */
    get onScreen() {
      return item.shown;
    },
    /** giữ API CSS2D cũ — vị trí giờ do LabelLayer.render lo */
    update() {},
    dispose() {
      layer?.items.delete(item);
      wrap.remove();
    },
  };
}
