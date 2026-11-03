/**
 * ⛓️ Nhà Tù Online — bảng tên + bong bóng chat nổi trên đầu nhân vật.
 * Chiếu toạ độ 3D → màn hình mỗi khung hình (không cần CSS2DRenderer), chữ to dần khi lại gần camera.
 */
import * as THREE from 'three';

let layer = null;
const tmp = new THREE.Vector3();
/**
 * Trần số bảng tên hiện cùng lúc. Trại 140+ người: ghi vị trí 140 phần tử DOM mỗi khung tốn ~8 ms/khung
 * (đo bằng CDP), mà 140 cái tên chồng lên nhau cũng không ai đọc nổi. Ưu tiên: đang lên sóng → đang nói /
 * có huy hiệu (bị giam, thùng rác, chờ lượt) → người xem thật → cán bộ → gần camera.
 */
export const MAX_LABELS = 45;
const cand = [];

/** Lớp DOM chứa mọi bảng tên. Gọi setLabelLayer() một lần lúc khởi động. */
export class LabelLayer {
  /** @param {HTMLElement} container phần tử phủ kín khung game */
  constructor(container) {
    this.el = container;
    this.items = new Set();
  }

  /** Cập nhật vị trí + cỡ chữ cho các bảng tên đang thấy (tối đa MAX_LABELS cái, chỉ ghi DOM khi đổi). */
  render(camera, width, height, dt) {
    cand.length = 0;
    for (const it of this.items) {
      if (it.bubbleTime > 0) {
        it.bubbleTime -= dt;
        if (it.bubbleTime <= 0) it.bubble.classList.remove('show');
      }
      const root = it.char.root;
      const a = it.char.anchor; // đang nằm ngủ: treo trên đầu
      if (a) tmp.set(a.x, a.y + 0.55, a.z);
      else tmp.set(root.position.x, root.position.y + it.height, root.position.z);
      const dist = camera.position.distanceTo(tmp);
      tmp.project(camera);
      const visible = it.hidden !== true && tmp.z < 1 && tmp.z > -1 && dist < it.maxDist && Math.abs(tmp.x) < 1.3 && Math.abs(tmp.y) < 1.3;
      if (!visible) {
        hide(it);
        continue;
      }
      it.sx = (tmp.x * 0.5 + 0.5) * width;
      it.sy = (-tmp.y * 0.5 + 0.5) * height;
      it.dist = dist;
      // điểm ưu tiên (nhỏ = hiện trước): đang lên sóng, đang nói / có huy hiệu, người xem, cán bộ, rồi tới khoảng cách
      it.rank = dist - (it.kind === 'spot' ? 1e6 : 0) - (it.bubbleTime > 0 || it.badged ? 1e4 : 0) - (it.kind === 'viewer' || it.kind === 'jailed' || it.kind === 'job' ? 1e3 : it.kind === 'guard' ? 500 : 0);
      cand.push(it);
    }
    if (cand.length > MAX_LABELS) cand.sort((p, q) => p.rank - q.rank);
    for (let i = 0; i < cand.length; i++) {
      const it = cand[i];
      if (i >= MAX_LABELS) {
        hide(it);
        continue;
      }
      if (!it.shown) {
        it.wrap.style.display = '';
        it.shown = true;
      }
      const s = Math.max(0.38, Math.min(1.5, (it.boost * 9.5) / Math.max(it.dist, 0.1)));
      const tf = `translate(${it.sx.toFixed(0)}px, ${it.sy.toFixed(0)}px) translate(-50%, -100%) scale(${s.toFixed(2)})`;
      if (tf !== it.tf) {
        it.tf = tf; // đứng yên thì khỏi ghi lại (mỗi lần ghi = trình duyệt tính lại style)
        it.wrap.style.transform = tf;
      }
      const z = 100000 - Math.round(it.dist * 20); // bậc 5 cm: đủ xếp trước/sau, ít ghi DOM hơn
      if (z !== it.z) {
        it.z = z;
        it.wrap.style.zIndex = String(z);
      }
    }
  }
}

function hide(it) {
  if (!it.shown) return;
  it.wrap.style.display = 'none';
  it.shown = false;
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
  const badgeEl = document.createElement('b');
  badgeEl.className = 'nt-badge';
  badgeEl.hidden = true;
  // mã số tù nhân (in trên áo) — người xem bình luận số này để chọn người chơi khăm sau khi tặng quà
  const noEl = document.createElement('i');
  noEl.className = 'nt-no';
  noEl.hidden = true;
  tag.append(noEl, nameEl, badgeEl);
  wrap.append(bubble, tag);
  let badgeText = '';
  const item = {
    char,
    wrap,
    bubble,
    tag,
    height: 1.9,
    boost: 1,
    maxDist: 60,
    bubbleTime: 0,
    kind,
    badged: false,
    tf: '',
    z: 0,
    shown: true,
    hidden: false,
  };
  const setKind = (k) => {
    tag.className = `nt-tag ${k}`;
    item.kind = k;
    item.boost = k === 'spot' ? 1.35 : k === 'viewer' ? 1.1 : 1;
    // tên NPC chỉ hiện khi camera ở gần (góc toàn cảnh 130 bảng tên che kín trại); tên người xem luôn hiện
    item.maxDist = k === 'npc' ? 24 : k === 'guard' ? 32 : 60;
  };
  setKind(kind);
  setAvatar(avatar);
  layer?.el.append(wrap);
  layer?.items.add(item);
  return {
    say(text, seconds = 4.5) {
      bubble.textContent = text;
      bubble.classList.add('show');
      // chạy lại hiệu ứng nảy bằng Web Animations — không dùng mẹo offsetWidth (ép trình duyệt tính lại layout mỗi câu nói)
      bubble.animate?.([{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 250, easing: 'ease-out' });
      item.bubbleTime = seconds;
    },
    setName(n) {
      nameEl.textContent = n;
    },
    /** Mã số tù nhân trước tên (null = ẩn). */
    setNumber(no) {
      noEl.textContent = no ? String(no) : '';
      noEl.hidden = !no;
    },
    /** 🏠 Phòng-đội (P1…): mã số đổi màu theo phòng; 0 = không đội. */
    setTeam(no) {
      if (no) noEl.dataset.team = String(no);
      else delete noEl.dataset.team;
    },
    /** Huy hiệu nhỏ sau tên ('🔒 2:31', '⏳2', '🧹'…); '' = ẩn. Chỉ ghi DOM khi đổi. */
    setBadge(text = '') {
      if (text === badgeText) return;
      badgeText = text;
      badgeEl.textContent = text;
      badgeEl.hidden = !text;
      item.badged = !!text;
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
