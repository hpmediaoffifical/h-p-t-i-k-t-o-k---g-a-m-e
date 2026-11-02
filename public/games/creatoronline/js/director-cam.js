/**
 * 🏢 Creator Online (bản LIVE) — đặt camera theo cảnh của đạo diễn (logic/director.js).
 * Spec 2026-11-03-creatoronline-design.md §12: không orbit + raycast như bản đi dạo — mỗi kiểu cảnh có điểm đặt tính
 * sẵn để camera không bao giờ nằm sau biển neon cửa phòng; khung dọc giữ đầu nhân vật chính ở khoảng y 560–650/1920.
 * Chuyển cảnh: lướt ~0,9 giây (ease); trong cảnh camera trôi nhẹ cho đỡ đứng hình.
 */
import * as THREE from 'three';
import { HALL } from './world.js';

const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

export class DirectorCam {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {object} world từ buildWorld
   */
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.shot = null;
    this.pos = new THREE.Vector3(0, 40, 40);
    this.look = new THREE.Vector3(0, 0, 0);
    this.fromPos = new THREE.Vector3();
    this.fromLook = new THREE.Vector3();
    this.toPos = new THREE.Vector3();
    this.toLook = new THREE.Vector3();
    this.blend = 1;
    this.blendDur = 0.9;
    this.drift = 0;
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }

  /** Phòng mà cảnh đang quay (để trộn nhạc, vẽ TV trực tiếp…); null = sảnh / toàn cảnh. */
  get room() {
    const t = this.shot?.target;
    return t ? this.world.byId.get(t) ?? null : null;
  }

  /** Cảnh mới: lướt từ chỗ đang đứng sang điểm đặt của cảnh mới. */
  setShot(shot) {
    if (shot === this.shot) return;
    const prevRoom = this.shot?.target;
    this.shot = shot;
    this.fromPos.copy(this.camera.position);
    this.fromLook.copy(this.look);
    this.blend = 0;
    // cùng phòng thì lướt chậm hơn (đổi góc), khác phòng thì nhanh (gần như cắt cảnh)
    this.blendDur = prevRoom && prevRoom === shot?.target ? 1.4 : 0.8;
    this.drift = Math.random() * 10;
  }

  /**
   * @param {number} dt
   * @param {number} t giây
   * @param {(id:string) => object|null} actorOf người xem → actor (cảnh cận)
   * @param {number} now Date.now() (mốc startAt của cảnh)
   */
  update(dt, t, actorOf, now) {
    const view = this._place(this.shot, t, actorOf, now);
    if (view !== this._view) {
      // đổi kiểu nhìn giữa chừng một cảnh (Gala: toàn cảnh → sân) → lướt như cảnh mới
      if (this._view !== undefined && this.blend >= 1) {
        this.fromPos.copy(this.camera.position);
        this.fromLook.copy(this.look);
        this.blend = 0;
        this.blendDur = 1.6;
      }
      this._view = view;
    }
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / this.blendDur);
      const k = ease(this.blend);
      this.pos.lerpVectors(this.fromPos, this.toPos, k);
      this.look.lerpVectors(this.fromLook, this.toLook, k);
    } else {
      // bám mục tiêu đang di chuyển (người xem đi bộ) mà không giật
      const f = 1 - Math.exp(-dt * 4);
      this.pos.lerp(this.toPos, f);
      this.look.lerp(this.toLook, f);
    }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }

  /** Điểm đặt camera (toPos/toLook) cho cảnh. */
  _place(shot, t, actorOf, now) {
    const P = this.toPos;
    const L = this.toLook;
    const w = this.world;
    const room = shot?.target ? w.byId.get(shot.target) : null;
    const sway = Math.sin(t * 0.13 + this.drift);
    // Gala: 3 giây đầu toàn tòa nhà rồi mới vào sân
    const galaOpen = shot?.kind === 'gala' && now - (shot.startAt ?? now) < 3000;
    const view = galaOpen ? 'overview' : shot?.view ?? 'overview';
    if (view === 'overview' || (!room && view !== 'board' && view !== 'close')) {
      P.set(sway * 4, 78, 34);
      L.set(0, 0, -2);
      return 'overview';
    }
    if (view === 'board') {
      // bảng 10 × 5,6 m trên tường Đông: lùi 18 m mới vừa bề ngang khung dọc (đo: x 66–996, y ~490–1010 / 1920)
      const s = w.leaderboard.spot;
      P.set(HALL.maxX - 18.4, 4.4, s.z + sway * 1.2);
      L.set(HALL.maxX - 0.4, 1.9, s.z);
      return view;
    }
    if (view === 'close') {
      const a = shot.focus ? actorOf(shot.focus) : null;
      if (a && !a.hidden) {
        const p = a.body.pos;
        const fx = Math.sin(a.ry);
        const fz = Math.cos(a.ry);
        // ngang tầm mặt (camera cao thì điệu nhảy cúi đầu chỉ còn thấy đỉnh tóc)
        P.set(p.x + fx * 4.8 + sway * 0.5, p.y + 1.55, p.z + fz * 4.8);
        L.set(p.x, p.y + 1.05, p.z);
        return view;
      }
    }
    if (!room) {
      P.set(sway * 4, 78, 34);
      L.set(0, 0, -2);
      return 'overview';
    }
    if (room.type === 'group') {
      const cx = room.cx;
      if (view === 'slice') {
        // lát sàn 17×30 m: sân G + các phòng trước nó, nhìn nghiêng ~65°
        P.set(cx, 33, -4);
        L.set(cx, 0, -21);
        return view;
      }
      if (view === 'close' && shot.focus) {
        // người xem không còn → cận giữa sân
        P.set(cx + sway, 3.4, -26.5);
        L.set(cx, 1.6, -33);
        return 'stage-close';
      }
      // sân khấu tầm trung từ phía khán giả, đứng TRONG phòng (biển neon ở mặt ngoài cửa): LED ở trên, idol + fan ở dưới
      // đo trong khung 1080×1920: đầu idol ~y 620, chân ~y 860 (vùng an toàn y 500–1040, dưới là bình luận TikTok)
      P.set(cx + sway * 1.0, 6, -22.4);
      L.set(cx, 0.3, -31.5);
      return 'stage';
    }
    // phòng đơn: từ hành lang trước kính, thấp hơn biển neon trên cửa
    const s = room.spots.streamer;
    const out = room.out ?? 1;
    if (view === 'slice') {
      P.set(room.cx, 26, room.frontZ + out * 14);
      L.set(room.cx, 0, room.frontZ);
      return view;
    }
    if (room.type === 'game') {
      // streamer quay lưng ra kính: đứng chếch sau vai để thấy cả TV trận đấu
      // đo ở 1080×1920: đầu streamer ~y 630, màn trận đấu ngay trên (biển cửa không che)
      P.set(s.x + 0.8 + sway * 0.3, 3.4, room.frontZ + out * 4.2);
      L.set(s.x, -0.8, s.z - out * 1);
      return 'room';
    }
    // đo ở 1080×1920: đầu streamer ~y 590, chân ~y 870 (cao hơn dòng hướng dẫn y 940)
    P.set(s.x + sway * 0.5, 3.4, room.frontZ + out * 4.6);
    L.set(s.x, -0.6, s.z);
    return 'room';
  }
}
