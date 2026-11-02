/**
 * ⛓️ Nhà Tù Online — bảng tên + bong bóng chat nổi trên đầu nhân vật.
 * Chiếu toạ độ 3D → màn hình mỗi khung hình (không cần CSS2DRenderer), chữ to dần khi lại gần camera.
 */
import * as THREE from 'three';

let layer = null;
const tmp = new THREE.Vector3();

/** Lớp DOM chứa mọi bảng tên. Gọi setLabelLayer() một lần lúc khởi động. */
export class LabelLayer {
  /** @param {HTMLElement} container phần tử phủ kín khung game */
  constructor(container) {
    this.el = container;
    this.items = new Set();
  }

  /** Cập nhật vị trí + cỡ chữ cho mọi bảng tên. */
  render(camera, width, height, dt) {
    for (const it of this.items) {
      if (it.bubbleTime > 0) {
        it.bubbleTime -= dt;
        if (it.bubbleTime <= 0) it.bubble.classList.remove('show');
      }
      const root = it.char.root;
      tmp.set(root.position.x, root.position.y + it.height, root.position.z);
      const dist = camera.position.distanceTo(tmp);
      tmp.project(camera);
      const visible = it.hidden !== true && tmp.z < 1 && tmp.z > -1 && dist < it.maxDist && Math.abs(tmp.x) < 1.3 && Math.abs(tmp.y) < 1.3;
      if (!visible) {
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
      const x = (tmp.x * 0.5 + 0.5) * width;
      const y = (-tmp.y * 0.5 + 0.5) * height;
      const s = Math.max(0.38, Math.min(1.5, (it.boost * 9.5) / Math.max(dist, 0.1)));
      it.wrap.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${s.toFixed(3)})`;
      it.wrap.style.zIndex = String(100000 - Math.round(dist * 100));
    }
  }
}

export function setLabelLayer(l) {
  layer = l;
}

/**
 * Gắn bảng tên lên một nhân vật.
 * @param {object} char từ createCharacter
 * @param {string} name
 * @param {'npc'|'guard'|'player'|'viewer'|'spot'} kind
 * @param {string} [avatar] link ảnh đại diện TikTok (không bắt buộc)
 */
export function attachLabel(char, name, kind = 'npc', avatar = '') {
  const wrap = document.createElement('div');
  wrap.className = 'nt-lab';
  const bubble = document.createElement('div');
  bubble.className = 'nt-bubble';
  const tag = document.createElement('div');
  const nameEl = document.createElement('span');
  nameEl.textContent = name;
  let img = null;
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
  tag.append(nameEl);
  wrap.append(bubble, tag);
  const item = {
    char,
    wrap,
    bubble,
    tag,
    height: 1.9,
    boost: 1,
    maxDist: 60,
    bubbleTime: 0,
    shown: true,
    hidden: false,
  };
  const setKind = (k) => {
    tag.className = `nt-tag ${k}`;
    item.boost = k === 'spot' ? 1.35 : k === 'viewer' ? 1.1 : 1;
  };
  setKind(kind);
  setAvatar(avatar);
  layer?.el.append(wrap);
  layer?.items.add(item);
  return {
    say(text, seconds = 4.5) {
      bubble.textContent = text;
      bubble.classList.remove('show');
      void bubble.offsetWidth;
      bubble.classList.add('show');
      item.bubbleTime = seconds;
    },
    setName(n) {
      nameEl.textContent = n;
    },
    setKind,
    setAvatar,
    setHidden(h) {
      item.hidden = h;
    },
    /** độ cao bảng tên so với chân (người 1.9 m, chó mèo thấp hơn) */
    setHeight(h) {
      item.height = h;
    },
    /** giữ API cũ (CSS2D) — vị trí giờ do LabelLayer.render lo */
    update() {},
    dispose() {
      layer?.items.delete(item);
      wrap.remove();
    },
  };
}
