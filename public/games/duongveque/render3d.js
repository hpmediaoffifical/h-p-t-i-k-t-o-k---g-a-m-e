/* 🛵 Đường Về Quê — renderer 3D THỬ NGHIỆM (bật bằng ?r=3d; canvas 2D trong game.js vẫn là mặc định).
 * Chibi low-poly góc nhìn ngang 2.5D: camera phối cảnh FOV thấp đặt xa + hơi cao, bám đoàn xe; đoàn càng dài càng lùi.
 * Chỉ VẼ — luật vẫn ở logic.js. game.js gọi render(dt) mỗi khung rồi tự vẽ nhãn tên / chữ nổi lên canvas 2D phía trên
 * theo toạ độ màn hình trả về (sx, driver, push, extra).
 *
 * Ngân sách lệnh vẽ (đo bằng renderer.info): cảnh dựng bằng InstancedMesh theo loại đồ vật (1 lệnh vẽ / loại dù bao nhiêu
 * cây), màu nằm trong màu đỉnh. Mỗi xe buýt 1 lệnh vẽ; mọi hành khách = 2 lệnh vẽ (đầu + vai) dù 14 hay 70 người —
 * mặt là ảnh đại diện trong 1 atlas 2048×1024 (128 ô), mỗi người chọn ô qua thuộc tính instance aCell.
 * Vùng cảnh trong bản thử: miệt vườn Cà Mau (đường, sông, dừa, dừa nước, nhà sàn, xuồng ba lá, cột điện).
 */
import * as THREE from 'three';

const W = 1080, H = 1920;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
function hash(i, s = 0) { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); }
function strHash(s) { let h = 0; for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); }

// ---- kích thước thế giới (mét) ----
const BUS_L = 10.4, GAP = 11.0, LANE_Z = 1.6, ROAD_HALF = 3.4;
const RIVER_NEAR = -11, RIVER_FAR = -58, WATER_Y = -0.35, POND_Z = 14;
const BUS_SY = 1.3;   // chibi: xe buýt cao ×1,3 + bánh to ×1,3 (mập, dễ đọc trên điện thoại)
const TILE = 40;
const DOZER_KINDS = new Set(['stash', 'fine', 'dog', 'ducks', 'rain']);   // cú đẩy Phá không có "diễn viên" riêng → xe ủi
const FUN_PHA = new Set(['crow', 'snake', 'ghost', 'croc', 'possess', 'coffin', 'zombie']);
const SHIRTS = ['#2f6bd8', '#e2557b', '#18b37e', '#f6a21e', '#7b61ff', '#e8322c', '#2fa4e7', '#8a5a3a'];
const AV_COLORS = ['#f6a21e', '#2fa4e7', '#e2557b', '#7b61ff', '#18b37e', '#ff7a2f'];

// ================= hình gộp có màu đỉnh =================
const _c = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}
/** Một khối của hình gộp: geo + màu + ma trận (có thể nhân chuỗi). */
function P(geo, color, ...mats) {
  const g = (geo.index ? geo.toNonIndexed() : geo.clone());
  const m = new THREE.Matrix4(); for (const k of mats) m.multiply(k);
  g.applyMatrix4(m);
  const n = g.attributes.position.count, col = new Float32Array(n * 3); _c.set(color);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function merge(parts) {
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: n => new THREE.CylinderGeometry(0.5, 0.5, 1, n),
  cone: n => new THREE.ConeGeometry(0.5, 1, n),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  ico1: new THREE.IcosahedronGeometry(0.5, 1),
  sph: new THREE.SphereGeometry(0.5, 10, 7),
};
/** hộp theo mép: x0..x1, y0..y1, z0..z1 */
function B(color, x0, x1, y0, y1, z0, z1) { return P(G.box, color, M((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0, 0, 0, x1 - x0, y1 - y0, z1 - z0)); }

// ---------------- đồ vật miệt vườn ----------------
function palmGeo(variant = 0) {
  const parts = [], bend = variant ? -0.9 : 1.1;
  let x = 0, y = 0; const seg = 6, segH = 1.2;
  for (let i = 0; i < seg; i++) {
    const t0 = i / seg, t1 = (i + 1) / seg;
    const x0 = bend * t0 * t0, x1 = bend * t1 * t1, rz = -Math.atan2(x1 - x0, segH);
    const r = lerp(0.24, 0.15, t0);
    parts.push(P(G.cyl(7), i % 2 ? '#8b6234' : '#7d5630', M((x0 + x1) / 2, y + segH / 2, 0, 0, 0, rz, r * 2, segH * 1.04, r * 2)));
    x = x1; y += segH;
  }
  const top = new THREE.Vector3(x, y, 0);
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2 + variant * 0.3, droop = 1.75 + (k % 3) * 0.18;
    parts.push(P(G.cone(4), k % 2 ? '#3f9b3c' : '#55b347', M(top.x, top.y, top.z, 0, a, 0), M(0, 0, 0, 0, 0, -droop), M(0, 1.6, 0, 0, 0, 0, 0.55, 3.4, 0.12)));
  }
  for (let k = 0; k < 4; k++) parts.push(P(G.ico, k % 2 ? '#6b7a1e' : '#5a6a1a', M(top.x + Math.cos(k * 1.6) * 0.28, top.y - 0.35, Math.sin(k * 1.6) * 0.28, 0, 0, 0, 0.42, 0.46, 0.42)));
  return merge(parts);
}
function nipaGeo() {   // dừa nước: bụi lá dài vươn lên từ mép nước
  const parts = [];
  for (let k = 0; k < 9; k++) {
    const a = k / 9 * Math.PI * 2, tilt = 0.35 + (k % 3) * 0.2;
    parts.push(P(G.cone(4), k % 2 ? '#4c9a3e' : '#63b04d', M(0, 0, 0, 0, a, 0), M(0, 0, 0, 0, 0, -tilt), M(0, 1.4, 0, 0, 0, 0, 0.45, 2.8, 0.1)));
  }
  return merge(parts);
}
function bushGeo() {
  return merge([
    P(G.ico, '#4f9a3a', M(0, 0.55, 0, 0, 0, 0, 1.5, 1.1, 1.3)),
    P(G.ico, '#62b04a', M(0.7, 0.45, 0.2, 0, 0.5, 0, 1.1, 0.9, 1.0)),
    P(G.ico, '#3f8a34', M(-0.6, 0.4, -0.1, 0, 1, 0, 1.0, 0.8, 1.0)),
  ]);
}
function bananaGeo() {
  const parts = [P(G.cyl(6), '#7a9a3a', M(0, 1.1, 0, 0, 0, 0, 0.3, 2.2, 0.3))];
  for (let k = 0; k < 6; k++) parts.push(P(G.cone(4), k % 2 ? '#5fae3a' : '#77c24a', M(0, 2.2, 0, 0, k * 1.05, 0), M(0, 0, 0, 0, 0, -0.9 - (k % 2) * 0.3), M(0, 0.9, 0, 0, 0, 0, 0.6, 2.0, 0.08)));
  return merge(parts);
}
function treeBlobGeo() {   // hàng cây xa (mờ trong sương)
  return merge([
    P(G.cyl(5), '#6b4a2a', M(0, 1.5, 0, 0, 0, 0, 0.5, 3, 0.5)),
    P(G.ico, '#6fa255', M(0, 4.2, 0, 0, 0, 0, 5, 4.2, 4.4)),
    P(G.ico, '#82b25e', M(1.9, 3.4, 0.8, 0, 0.7, 0, 3.6, 3.2, 3.4)),
    P(G.ico, '#64974e', M(-1.8, 3.2, -0.4, 0, 1.3, 0, 3.4, 3.0, 3.2)),
  ]);
}
function stiltHouseGeo() {   // nhà sàn ven sông, mái lá dừa nước
  const parts = [];
  for (const sx of [-2.1, 0, 2.1]) for (const sz of [-1.4, 1.4]) parts.push(P(G.cyl(5), '#6b4a2a', M(sx, 0.05, sz, 0, 0, 0, 0.16, 2.6, 0.16)));
  parts.push(B('#7a5230', -2.6, 2.6, 1.2, 1.4, -1.8, 1.8));               // sàn
  parts.push(B('#cfa86a', -2.2, 2.2, 1.4, 3.2, -1.5, 1.5));               // vách tre
  parts.push(B('#4a3322', -0.4, 0.4, 1.4, 2.8, 1.5, 1.56));               // cửa
  parts.push(B('#4a3322', -1.8, -1.0, 2.1, 2.7, 1.5, 1.56));              // cửa sổ
  parts.push(B('#4a3322', 1.0, 1.8, 2.1, 2.7, 1.5, 1.56));
  parts.push(B('#8b6234', -2.6, 2.6, 1.4, 1.95, 1.75, 1.85));             // lan can hiên
  // mái: lăng trụ tam giác (trụ 3 cạnh nằm ngang)
  parts.push(P(G.cyl(3), '#a07a42', M(0, 3.73, 0, 0, Math.PI / 2, 0), M(0, 0, 0, -Math.PI / 2, 0, 0), M(0, 0, 0, 0, 0, 0, 4.6, 5.8, 2.1)));
  parts.push(P(G.cyl(3), '#8a6534', M(0, 3.62, 0, 0, Math.PI / 2, 0), M(0, 0, 0, -Math.PI / 2, 0, 0), M(0, 0, 0, 0, 0, 0, 4.9, 6.0, 1.7)));
  parts.push(B('#e8322c', 1.9, 2.3, 2.2, 2.65, 1.56, 1.62));              // câu đối đỏ
  parts.push(P(G.ico, '#e8322c', M(-2.4, 2.9, 1.7, 0, 0, 0, 0.32, 0.4, 0.32)));   // lồng đèn
  return merge(parts);
}
function boatGeo() {   // xuồng ba lá + người đội nón lá chèo
  const parts = [];
  parts.push(P(G.cyl(6), '#6b4226', M(0, 0.1, 0, 0, 0, Math.PI / 2, 0.9, 4.2, 1.1), M(0, 0, 0, 0, 0, 0, 1, 1, 1)));
  parts.push(B('#8b5e3a', -1.7, 1.7, 0.25, 0.32, -0.38, 0.38));
  parts.push(P(G.cone(5), '#2f6bd8', M(0.6, 0.85, 0, 0, 0, 0, 0.62, 0.9, 0.55)));
  parts.push(P(G.sph, '#ffd3ad', M(0.6, 1.45, 0, 0, 0, 0, 0.42, 0.42, 0.42)));
  parts.push(P(G.cone(10), '#eedfaa', M(0.6, 1.78, 0, 0, 0, 0, 0.95, 0.38, 0.95)));      // nón lá
  parts.push(P(G.cyl(4), '#a0784a', M(1.05, 0.8, 0.35, 0.4, 0, -0.5, 0.06, 2.2, 0.06)));  // mái chèo
  parts.push(B('#f6a21e', -1.4, -0.4, 0.32, 0.75, -0.3, 0.3));              // sọt trái cây
  parts.push(P(G.ico, '#e8322c', M(-0.9, 0.85, 0, 0, 0, 0, 0.5, 0.35, 0.45)));
  return merge(parts);
}
function lilyGeo() {   // lá sen + hoa trên ao tiền cảnh
  return merge([
    P(new THREE.CircleGeometry(0.5, 9), '#3f9a4a', M(0, 0, 0, -Math.PI / 2, 0, 0, 1.6, 1.6, 1)),
    P(new THREE.CircleGeometry(0.5, 7), '#52b05a', M(0.5, 0.02, 0.6, -Math.PI / 2, 0, 0, 1.0, 1.0, 1)),
    P(G.cyl(4), '#3f8a3a', M(-0.1, 0.25, 0.05, 0, 0, 0, 0.05, 0.5, 0.05)),
    P(G.ico, '#f48fb6', M(-0.1, 0.62, 0.05, 0, 0, 0, 0.42, 0.5, 0.42)),
    P(G.ico, '#fde4ec', M(-0.1, 0.78, 0.05, 0, 0.6, 0, 0.24, 0.3, 0.24)),
  ]);
}
function hillGeo() {   // dãy đồi xa (chìm trong sương → màu nhạt như bản 2D)
  return merge([P(G.ico1, '#7fae95', M(0, 0, 0, 0, 0, 0, 90, 34, 40)), P(G.ico1, '#8fb9a6', M(60, -4, 10, 0, 0.6, 0, 70, 26, 30))]);
}
function poleGeo() {
  return merge([
    B('#b7b2a8', -0.13, 0.13, 0, 8.5, -0.13, 0.13),
    B('#8d887e', -0.9, 0.9, 7.6, 7.78, -0.08, 0.08),
    P(G.cyl(6), '#6a6a6a', M(-0.6, 7.95, 0, 0, 0, 0, 0.12, 0.3, 0.12)),
    P(G.cyl(6), '#6a6a6a', M(0.6, 7.95, 0, 0, 0, 0, 0.12, 0.3, 0.12)),
  ]);
}
function cloudGeo() {
  const parts = [];
  for (let k = 0; k < 6; k++) parts.push(P(G.ico1, '#ffffff', M(k * 9 - 22, Math.sin(k * 1.3) * 3, Math.cos(k) * 4, 0, k, 0, 13 + (k % 3) * 5, 10 + (k % 2) * 4, 9)));
  return merge(parts);
}

// ---------------- xe buýt "VỀ QUÊ ĂN TẾT" ----------------
// Gốc toạ độ = mép trước xe chạm đất, thân xe kéo về -x. Cửa sổ là hốc sâu (kính đặt lùi vào ở z=0.4) để đầu + vai
// hành khách ngồi giữa kính và trụ cửa: mép dưới cửa sổ tự che phần thân dưới (không cần clip).
const WIN_Y0 = 1.95, WIN_Y1 = 2.95, BODY_Z = 1.25;
const WIN_X = Array.from({ length: 6 }, (_, i) => -2.75 - i * 1.31);
function busGeo(color, lead) {
  const parts = [], z0 = -BODY_Z, z1 = BODY_Z;
  parts.push(B(color, -BUS_L, 0, 0.5, WIN_Y0, z0, z1));                   // thân dưới
  parts.push(B('#ffffff', -BUS_L, 0, 1.72, 1.95, z1, z1 + 0.02));          // sọc trắng
  parts.push(B(color, -BUS_L, 0, WIN_Y1, 3.3, z0, z1));                    // nóc
  parts.push(B('#d8e8f2', -BUS_L + 0.15, -0.15, WIN_Y0, WIN_Y1, -0.4, 0.4));   // kính / nội thất (lùi sâu)
  // trụ cửa sổ: trước kính lái, cửa, giữa các ô, đuôi
  const pill = (xa, xb, c = color) => parts.push(B(c, xa, xb, WIN_Y0, WIN_Y1, 0.4, z1), B(c, xa, xb, WIN_Y0, WIN_Y1, z0, -0.4));
  pill(-0.12, 0); pill(-1.42, -1.25); pill(-2.23, -1.42, '#2b2d33');
  for (let i = 0; i < 6; i++) pill(WIN_X[i] - 0.52 - 0.27, WIN_X[i] - 0.52);
  pill(-BUS_L, WIN_X[5] - 0.79);
  parts.push(B('#2b2d33', -2.23, -1.42, 0.55, WIN_Y0, z1, z1 + 0.02));      // cửa lên xuống
  parts.push(B('#bfe3ff', -0.02, 0.02, WIN_Y0 - 0.1, WIN_Y1, -1.1, 1.1));   // kính chắn gió
  parts.push(B('#3a3d45', -0.05, 0.12, 0.45, 0.85, z0, z1));               // cản trước
  parts.push(B('#fff6b0', 0, 0.06, 0.95, 1.2, 0.75, 1.1));                 // đèn pha
  parts.push(B('#fff6b0', 0, 0.06, 0.95, 1.2, -1.1, -0.75));
  parts.push(B('#3a3d45', -BUS_L - 0.08, -BUS_L + 0.05, 0.45, 0.85, z0, z1));
  parts.push(B('#e8322c', -BUS_L - 0.05, -BUS_L, 0.95, 1.25, 0.8, 1.1));   // đèn hậu
  for (const wx of [-1.75, -8.65]) parts.push(B('#24262b', wx - 0.75, wx + 0.75, 0.3, 1.15, z1 - 0.05, z1 + 0.015));  // hốc bánh
  parts.push(B('#2b2d33', 0.05, 0.2, 2.3, 2.5, 1.25, 1.55));               // gương
  // giá nóc + hành lý (đuôi xe; phần trước để khách ngồi nóc)
  parts.push(B('#5b4632', -BUS_L + 0.4, -1.4, 3.3, 3.42, -1.15, -1.0), B('#5b4632', -BUS_L + 0.4, -1.4, 3.3, 3.42, 1.0, 1.15));
  parts.push(B('#e8322c', -BUS_L + 0.5, -BUS_L + 1.6, 3.3, 4.0, -0.9, 0.2), B('#2f7de2', -BUS_L + 0.7, -BUS_L + 1.5, 3.3, 3.75, 0.25, 0.95));
  parts.push(B('#f6a21e', -BUS_L + 1.7, -BUS_L + 2.3, 3.3, 3.62, -0.6, 0.4));
  if (lead) {   // cành mai vàng trên nóc đầu xe
    parts.push(P(G.cyl(5), '#6b4226', M(-0.9, 3.75, 0, 0, 0, 0.3, 0.1, 0.9, 0.1)), P(G.cyl(5), '#6b4226', M(-0.7, 3.9, 0.1, 0, 0, -0.5, 0.08, 0.8, 0.08)));
    for (let k = 0; k < 16; k++) {
      const a = hash(k, 31) * Math.PI * 2, r = 0.2 + hash(k, 32) * 0.55;
      parts.push(P(G.ico, k % 5 ? '#ffd23a' : '#ff9f1c', M(-0.85 + Math.cos(a) * r, 4.3 + Math.sin(a) * r * 0.6, (hash(k, 33) - 0.5) * 0.7, 0, 0, 0, 0.2, 0.2, 0.2)));
    }
  } else parts.push(B('#3a3d45', 0, 0.55, 0.65, 0.8, -0.1, 0.1));          // móc nối
  return merge(parts);
}
function wheelGeo() {
  const parts = [P(G.cyl(14), '#202227', M(0, 0, 0, Math.PI / 2, 0, 0, 1.1, 0.42, 1.1))];
  parts.push(P(G.cyl(10), '#c9ccd3', M(0, 0, 0.12, Math.PI / 2, 0, 0, 0.6, 0.24, 0.6)));
  parts.push(B('#7c8089', -0.28, 0.28, -0.05, 0.05, 0.22, 0.26), B('#7c8089', -0.05, 0.05, -0.28, 0.28, 0.22, 0.26));
  return merge(parts);
}
// ---------------- xe ủi (quay đầu về -x, lưỡi ủi ở x=0) ----------------
function dozerGeo() {
  const parts = [];
  parts.push(B('#4a4d55', 0, 0.32, 0.1, 2.0, -1.55, 1.55));                // lưỡi ủi
  for (let k = 1; k < 5; k++) parts.push(B('#6d7079', 0.3, 0.36, k * 0.38, k * 0.38 + 0.06, -1.5, 1.5));
  parts.push(B('#3a3d45', 0.3, 1.2, 0.7, 0.95, 0.9, 1.1), B('#3a3d45', 0.3, 1.2, 0.7, 0.95, -1.1, -0.9));   // tay đẩy
  parts.push(B('#2b2d33', 1.0, 5.4, 0.0, 0.95, 0.85, 1.45), B('#2b2d33', 1.0, 5.4, 0.0, 0.95, -1.45, -0.85));  // xích
  parts.push(B('#ffc531', 1.1, 5.2, 0.95, 2.1, -1.15, 1.15));              // thân
  parts.push(B('#e0a81c', 1.1, 5.2, 0.95, 1.15, -1.17, 1.17));
  parts.push(B('#ffc531', 3.2, 5.1, 2.1, 3.85, -1.0, 1.0));                // cabin
  parts.push(B('#bfe3ff', 3.4, 4.9, 2.55, 3.55, 1.0, 1.02), B('#bfe3ff', 3.18, 3.2, 2.55, 3.55, -0.8, 0.8));
  parts.push(B('#ffc531', 3.1, 5.2, 3.85, 4.0, -1.1, 1.1));
  parts.push(P(G.cyl(8), '#3a3d45', M(2.2, 2.7, 0.4, 0, 0, 0, 0.22, 1.3, 0.22)));   // ống khói
  parts.push(P(G.cyl(8), '#ff7a2f', M(4.2, 4.12, 0, 0, 0, 0, 0.3, 0.25, 0.3)));      // đèn xoay
  return merge(parts);
}

// ================= atlas ảnh đại diện + vật liệu chọn ô theo instance =================
function atlasMaterial(map, cols, rows, Base = THREE.MeshLambertMaterial, extra = {}) {
  const m = new Base(Object.assign({ map }, extra));
  m.onBeforeCompile = sh => {
    sh.uniforms.uCell = { value: new THREE.Vector2(1 / cols, 1 / rows) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aCell;\nuniform vec2 uCell;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvMapUv = (aCell + 0.02 + clamp(uv, 0.0, 1.0) * 0.96) * uCell;');
  };
  m.customProgramCacheKey = () => `dvqAtlas${cols}x${rows}`;
  return m;
}
/** Đầu chibi: cầu, UV chiếu phẳng từ phía trước → ảnh đại diện phủ mặt cầu như mặt người, rìa ô trắng thành viền. */
function headGeo() {
  const g = new THREE.SphereGeometry(0.5, 14, 10), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / 0.98, 0.5 + p.getY(i) / 0.98);
  return g;
}

export function createRenderer3D({ stage, before, game, VIEW, env }) {
  const Q = new URLSearchParams(location.search);
  const canvas = document.createElement('canvas');
  canvas.id = 'c3d'; canvas.width = W; canvas.height = H;
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: W + 'px', height: H + 'px', display: 'block',
    background: 'radial-gradient(circle at 78% 31%, rgba(255,250,220,.95) 0 46px, rgba(255,230,160,.45) 47px, rgba(255,230,160,0) 150px), linear-gradient(180deg, #3f9ff0 0%, #7cc3f5 22%, #cdeeff 38%, #e6f6ff 44%)' });
  stage.insertBefore(canvas, before);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.get('aa') !== '0', alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.setClearColor(0x000000, 0);
  renderer.info.autoReset = true;

  const scene = new THREE.Scene();
  const HORIZON = new THREE.Color('#e3f4ff');
  scene.fog = new THREE.Fog(HORIZON, 260, 700);
  scene.add(new THREE.HemisphereLight('#e8f5ff', '#6f9550', 1.35));
  const sun = new THREE.DirectionalLight('#fff1d6', 1.9); sun.position.set(-30, 60, 50); scene.add(sun);
  const FOV = Number(Q.get('fov')) || 24;
  const camera = new THREE.PerspectiveCamera(FOV, W / H, 4, 1400);
  const HZ = Number(Q.get('hz')) || 640;   // hàng chân trời trên màn (px)
  const TF = Math.tan(THREE.MathUtils.degToRad(FOV / 2)), TFX = TF * W / H;

  const flat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const smooth = new THREE.MeshLambertMaterial({ vertexColors: true });
  const disposables = [flat, smooth];

  // ---------- mặt đất / đường / sông: tấm lớn bám camera, nhảy theo bước hoạ tiết để hoạ tiết đứng yên trên đất ----------
  function canvasTex(w, h, draw, rx, ry) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4;
    disposables.push(t); return t;
  }
  const GROUND_P = 16, GROUND_LEN = 1600;
  const grassTex = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#7bbf52'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? 'rgba(255,255,200,.07)' : 'rgba(30,80,20,.08)'; x.fillRect(0, i * 16, w, 9); }   // luống ruộng
    for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(${40 + (i % 3) * 30},${110 + (i % 5) * 18},40,.25)`; x.fillRect(hash(i, 1) * w, hash(i, 2) * h, 3, 6); }
  }, GROUND_LEN / GROUND_P, 900 / GROUND_P);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_LEN, 900), new THREE.MeshLambertMaterial({ map: grassTex }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -40); scene.add(ground);
  const ROAD_P = 8;
  const roadTex = canvasTex(256, 128, (x, w, h) => {
    x.fillStyle = '#585c66'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { x.fillStyle = i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.08)'; x.fillRect(hash(i, 5) * w, hash(i, 6) * h, 2, 2); }
    x.fillStyle = '#f2efe6'; x.fillRect(0, 6, w, 5); x.fillRect(0, h - 11, w, 5);   // vạch mép
    x.fillRect(0, h / 2 - 3, w * 0.55, 6);                                         // vạch giữa đứt
  }, GROUND_LEN / ROAD_P, 1);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_LEN, ROAD_HALF * 2), new THREE.MeshLambertMaterial({ map: roadTex }));
  road.rotation.x = -Math.PI / 2; road.position.y = 0.03; scene.add(road);
  const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_LEN, 1), new THREE.MeshLambertMaterial({ color: '#c2a271' }));
  shoulder.rotation.x = -Math.PI / 2; shoulder.position.set(0, 0.02, 0); scene.add(shoulder);
  const shoulderBack = shoulder.clone(); scene.add(shoulderBack);
  shoulder.scale.y = 1.3; shoulder.position.z = ROAD_HALF + 0.6; shoulderBack.position.z = -ROAD_HALF - 0.5;
  const waterTex = canvasTex(256, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3f9fc9'); g.addColorStop(1, '#5ec2e8'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 3;
    for (let i = 0; i < 26; i++) { const yy = hash(i, 7) * h, xx = hash(i, 8) * w; x.beginPath(); x.moveTo(xx, yy); x.lineTo(xx + 20 + hash(i, 9) * 40, yy); x.stroke(); }
  }, GROUND_LEN / 24, 1.4);
  // sông Cà Mau màu phù sa (nâu xanh) để tách khỏi ao sen màu ngọc phía trước đường
  const river = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_LEN, RIVER_NEAR - RIVER_FAR), new THREE.MeshLambertMaterial({ map: waterTex, color: '#c9b98a' }));
  river.rotation.x = -Math.PI / 2; river.position.set(0, 0.012, (RIVER_NEAR + RIVER_FAR) / 2); scene.add(river);
  const pondTex = waterTex.clone(); pondTex.repeat.set(GROUND_LEN / 24, 600 / 34); pondTex.needsUpdate = true; disposables.push(pondTex);
  const pond = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_LEN, 600), new THREE.MeshLambertMaterial({ map: pondTex, color: '#bfe6d8' })); disposables.push(pond.material);
  pond.rotation.x = -Math.PI / 2; pond.position.set(0, 0.012, POND_Z + 300); scene.add(pond);
  const bankPond = new THREE.Mesh(merge([B('#9a7a4c', -GROUND_LEN / 2, GROUND_LEN / 2, -0.6, 0.08, -0.6, 0.6)]), flat); bankPond.position.z = POND_Z; scene.add(bankPond);
  disposables.push(pond.geometry, bankPond.geometry);
  const bankGeo = merge([B('#9a7a4c', -GROUND_LEN / 2, GROUND_LEN / 2, -0.6, 0.06, -0.5, 0.5)]);
  const bankNear = new THREE.Mesh(bankGeo, flat); bankNear.position.z = RIVER_NEAR; scene.add(bankNear);
  const bankFar = new THREE.Mesh(bankGeo, flat); bankFar.position.z = RIVER_FAR; scene.add(bankFar);
  for (const m of [ground, road, river, shoulder, shoulderBack]) disposables.push(m.geometry, m.material);
  disposables.push(bankGeo);

  // ---------- đồ vật cảnh theo ô 40 m (instancing, hash theo chỉ số ô → cảnh cố định khi đi lùi lại) ----------
  const KINDS = {
    palm0: { geo: palmGeo(0), cap: 160 }, palm1: { geo: palmGeo(1), cap: 160 },
    nipa: { geo: nipaGeo(), cap: 200 }, bush: { geo: bushGeo(), cap: 220 }, banana: { geo: bananaGeo(), cap: 120 },
    tree: { geo: treeBlobGeo(), cap: 220 }, house: { geo: stiltHouseGeo(), cap: 40 }, boat: { geo: boatGeo(), cap: 30 },
    pole: { geo: poleGeo(), cap: 40 }, lily: { geo: lilyGeo(), cap: 220 },
  };
  for (const [k, K] of Object.entries(KINDS)) {
    K.mesh = new THREE.InstancedMesh(K.geo, flat, K.cap); K.mesh.frustumCulled = false; K.mesh.count = 0; K.mesh.name = k;
    K.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(K.mesh); disposables.push(K.geo);
  }
  const wireMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.04, 0.04), new THREE.MeshLambertMaterial({ color: '#2d2f33' }), 120);
  wireMesh.frustumCulled = false; wireMesh.count = 0;   // không thêm vào cảnh (đã bỏ dây điện) disposables.push(wireMesh.geometry, wireMesh.material);
  let boats = [];
  function put(K, x, y, z, ry, s, sy = s) {
    if (K.mesh.count >= K.cap) return;
    K.mesh.setMatrixAt(K.mesh.count++, _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(s, sy, s)));
  }
  function tileItems(k) {
    const x0 = k * TILE, r = i => hash(k * 1.37 + 11, i);
    // bờ trước sông (sau đường): dừa, chuối, bụi
    for (let i = 0; i < 4; i++) { const pk = r(i) < 0.5 ? KINDS.palm0 : KINDS.palm1; put(pk, x0 + r(10 + i) * TILE, 0, -6.5 - r(20 + i) * 4.5, r(30 + i) * 6.28, 0.85 + r(40 + i) * 0.35); }
    for (let i = 0; i < 3; i++) put(KINDS.banana, x0 + r(50 + i) * TILE, 0, -5.5 - r(60 + i) * 4, r(70 + i) * 6.28, 0.8 + r(80 + i) * 0.4);
    for (let i = 0; i < 4; i++) put(KINDS.bush, x0 + r(90 + i) * TILE, 0, -5 - r(100 + i) * 6, r(110 + i) * 6.28, 0.7 + r(120 + i) * 0.5);
    // nhà sàn chân cắm xuống sông
    if (r(130) < 0.75) put(KINDS.house, x0 + 6 + r(131) * (TILE - 12), WATER_Y, RIVER_NEAR - 1.2, (r(132) - 0.5) * 0.3, 1);
    // dừa nước 2 mép sông
    for (let i = 0; i < 4; i++) put(KINDS.nipa, x0 + r(140 + i) * TILE, WATER_Y, RIVER_NEAR - 0.6 - r(150 + i), r(160 + i) * 6.28, 0.8 + r(170 + i) * 0.5);
    for (let i = 0; i < 4; i++) put(KINDS.nipa, x0 + r(180 + i) * TILE, WATER_Y, RIVER_FAR + 0.8 + r(190 + i), r(200 + i) * 6.28, 0.9 + r(210 + i) * 0.5);
    // bờ xa: nhà + dừa dày
    if (r(220) < 0.6) put(KINDS.house, x0 + r(221) * TILE, 0, RIVER_FAR - 4, (r(222) - 0.5) * 0.4, 1.1);
    for (let i = 0; i < 7; i++) { const pk = r(230 + i) < 0.5 ? KINDS.palm0 : KINDS.palm1; put(pk, x0 + r(240 + i) * TILE, 0, RIVER_FAR - 3 - r(250 + i) * 14, r(260 + i) * 6.28, 0.9 + r(270 + i) * 0.4); }
    // hàng cây xa
    for (let i = 0; i < 7; i++) put(KINDS.tree, x0 + r(280 + i) * TILE, 0, -70 - r(290 + i) * 110, r(300 + i) * 6.28, 1 + r(310 + i) * 0.7);
    // tiền cảnh thấp (không che xe): bờ cỏ + bụi, rồi ao sen (lá sen thưa dần ra xa)
    for (let i = 0; i < 3; i++) put(KINDS.bush, x0 + r(320 + i) * TILE, 0, 5 + r(330 + i) * 3, r(340 + i) * 6.28, 0.6 + r(350 + i) * 0.4, 0.45 + r(355 + i) * 0.25);
    for (let i = 0; i < 2; i++) put(KINDS.nipa, x0 + r(360 + i) * TILE, 0, POND_Z + 0.5, r(380 + i) * 6.28, 0.6, 0.45);
    for (let i = 0; i < 14; i++) { const zz = POND_Z + 4 + Math.pow(r(500 + i), 1.6) * 150; put(KINDS.lily, x0 + r(540 + i) * TILE, 0.03, zz, r(580 + i) * 6.28, 0.8 + r(620 + i) * 0.6); }
    // miệt vườn là đất phẳng: không đồi (hillGeo để dành cho cao nguyên / núi phía Bắc)
    // cột điện mỗi 20 m bên kia đường (bỏ dây: cắt ngang hàng khách ngồi nóc)
    for (let i = 0; i < 2; i++) {
      const px = x0 + i * 20 + 3;
      put(KINDS.pole, px, 0, -ROAD_HALF - 1.6, 0, 1);
    }
    // xuồng trên sông (trôi nhẹ mỗi khung)
    if (r(400) < 0.7) boats.push({ x: x0 + r(401) * TILE, z: RIVER_NEAR - 6 - r(402) * 22, dir: r(403) < 0.5 ? 1 : -1, sp: 0.6 + r(404) * 1.2, ph: r(405) * 6.28 });
  }
  let tileKey = '';
  function rebuildTiles(k0, k1) {
    const key = `${k0}:${k1}`; if (key === tileKey) return; tileKey = key;
    for (const K of Object.values(KINDS)) K.mesh.count = 0;
    wireMesh.count = 0; boats = [];
    for (let k = k0; k <= k1; k++) tileItems(k);
    for (const K of Object.values(KINDS)) K.mesh.instanceMatrix.needsUpdate = true;
    wireMesh.instanceMatrix.needsUpdate = true;
  }
  function stepBoats(T) {
    const K = KINDS.boat; K.mesh.count = 0;
    for (const b of boats) {
      if (K.mesh.count >= K.cap) break;
      const x = b.x + Math.sin(T * 0.05 * b.sp + b.ph) * 6;
      K.mesh.setMatrixAt(K.mesh.count++, _m.compose(_p.set(x, WATER_Y + 0.25 + Math.sin(T * 1.6 + b.ph) * 0.06, b.z),
        _q.setFromEuler(_e.set(Math.sin(T * 1.3 + b.ph) * 0.04, b.dir > 0 ? 0 : Math.PI, Math.sin(T * 1.1 + b.ph) * 0.03)), _s.set(1, 1, 1)));
    }
    K.mesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- mây (con của camera, trôi chậm) ----------
  const cloudGeom = cloudGeo(); disposables.push(cloudGeom);
  const cloudMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false, emissive: '#c8d8e8' }); disposables.push(cloudMat);
  const clouds = new THREE.InstancedMesh(cloudGeom, cloudMat, 4); clouds.frustumCulled = false; camera.add(clouds); scene.add(camera);

  // ---------- đoàn xe ----------
  let busColor = '', busGeoLead = null, busGeoFollow = null;
  const buses = [];
  for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(undefined, smooth); m.visible = false; scene.add(m); buses.push(m); }
  function ensureBusGeo(color) {
    if (color === busColor) return;
    busColor = color;
    if (busGeoLead) { busGeoLead.dispose(); busGeoFollow.dispose(); }
    busGeoLead = busGeo(color, true); busGeoFollow = busGeo(color, false);
    buses.forEach((m, i) => { m.geometry = i ? busGeoFollow : busGeoLead; });
  }
  const wheelG = wheelGeo(); disposables.push(wheelG);
  const wheels = new THREE.InstancedMesh(wheelG, smooth, 24); wheels.frustumCulled = false; scene.add(wheels);
  const shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false }); disposables.push(shadowMat);
  const shadowG = new THREE.CircleGeometry(0.5, 20); disposables.push(shadowG);
  const shadows = new THREE.InstancedMesh(shadowG, shadowMat, 8); shadows.frustumCulled = false; shadows.renderOrder = 1; scene.add(shadows);
  const dozerG = dozerGeo(); disposables.push(dozerG);
  const dozer = new THREE.Mesh(dozerG, smooth); dozer.visible = false; scene.add(dozer);

  // biển "VỀ QUÊ ĂN TẾT" — atlas 6 hàng (xe 1…5), 1 lệnh vẽ cho mọi biển
  const signCanvas = document.createElement('canvas'); signCanvas.width = 1024; signCanvas.height = 1024;
  const signTex = new THREE.CanvasTexture(signCanvas); signTex.colorSpace = THREE.SRGBColorSpace; signTex.anisotropy = 8; disposables.push(signTex);
  function drawSigns() {
    const x = signCanvas.getContext('2d'), rh = 1024 / 6;
    x.clearRect(0, 0, 1024, 1024);
    for (let i = 0; i < 6; i++) {
      const y = i * rh + 10;
      x.fillStyle = '#c42f25'; x.beginPath(); x.roundRect(8, y, 1008, rh - 20, 24); x.fill();
      x.strokeStyle = '#f2c14e'; x.lineWidth = 8; x.beginPath(); x.roundRect(20, y + 12, 984, rh - 44, 16); x.stroke();
      x.fillStyle = '#ffd23a'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = `900 ${i ? 74 : 92}px 'Be Vietnam Pro', sans-serif`;
      x.fillText(i ? `ĐOÀN VỀ QUÊ · XE ${i + 1}` : 'VỀ QUÊ ĂN TẾT', 512, y + (rh - 20) / 2 + 4);
    }
    signTex.needsUpdate = true;
  }
  drawSigns(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { drawSigns(); repaintAll(); });
  const signG = new THREE.PlaneGeometry(4.6, 0.8); disposables.push(signG);
  signG.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(10), 2));
  const signMat = atlasMaterial(signTex, 1, 6); disposables.push(signMat);
  const signs = new THREE.InstancedMesh(signG, signMat, 5); signs.frustumCulled = false; scene.add(signs);

  // ---------- hành khách: đầu (ảnh đại diện) + vai, mỗi thứ 1 InstancedMesh ----------
  const ACOLS = 16, AROWS = 8, CELL = 64, MAXP = 96;   // atlas 1024×512: tải lại rẻ gấp 4 (đầu chỉ cao ~20–40 px trên màn)
  const atlas = document.createElement('canvas'); atlas.width = ACOLS * CELL; atlas.height = AROWS * CELL;
  const actx = atlas.getContext('2d');
  actx.fillStyle = '#fff'; actx.fillRect(0, 0, atlas.width, atlas.height);
  const atlasTex = new THREE.CanvasTexture(atlas); atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.anisotropy = 4; disposables.push(atlasTex);
  const slots = new Map();   // id → { slot, u, used }
  const freeSlots = Array.from({ length: ACOLS * AROWS }, (_, i) => i);
  const IMG = new Map();
  let atlasDirty = true, atlasUpT = 0, frameNo = 0;
  function paintSlot(slot, u) {
    const cx = (slot % ACOLS) * CELL, cy = Math.floor(slot / ACOLS) * CELL, R = CELL * 0.43;
    actx.save();
    actx.fillStyle = '#ffffff'; actx.fillRect(cx, cy, CELL, CELL);
    actx.beginPath(); actx.arc(cx + CELL / 2, cy + CELL / 2, R, 0, Math.PI * 2); actx.clip();
    const im = u.avatar ? IMG.get(u.avatar) : null;
    if (im && im.ok) actx.drawImage(im, cx + CELL / 2 - R, cy + CELL / 2 - R, R * 2, R * 2);
    else {
      const name = u.name || '?';
      actx.fillStyle = AV_COLORS[(name.charCodeAt(0) || 0) % AV_COLORS.length]; actx.fillRect(cx, cy, CELL, CELL);
      actx.fillStyle = '#fff'; actx.font = `800 ${Math.round(R * 1.15)}px 'Be Vietnam Pro', sans-serif`; actx.textAlign = 'center'; actx.textBaseline = 'middle';
      actx.fillText((name.match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase(), cx + CELL / 2, cy + CELL / 2 + R * 0.08);
    }
    actx.restore();
    atlasDirty = true;
  }
  function repaintAll() { for (const s of slots.values()) paintSlot(s.slot, s.u); }
  function slotFor(u) {
    const id = String(u.id || u.name || '?');
    let s = slots.get(id);
    if (s && (s.u.avatar !== u.avatar || s.u.name !== u.name)) { s.u = u; paintSlot(s.slot, u); }
    if (!s) {
      let slot = freeSlots.pop();
      if (slot == null) {   // đầy: lấy lại ô lâu không dùng nhất
        let old = null; for (const [k, v] of slots) if (!old || v.used < old[1].used) old = [k, v];
        slot = old[1].slot; slots.delete(old[0]);
      }
      s = { slot, u, used: 0 }; slots.set(id, s); paintSlot(slot, u);
      if (u.avatar && !IMG.has(u.avatar)) {   // ảnh TikTok phải cho CORS mới vào được WebGL; lỗi thì giữ chữ cái đầu
        const im = new Image(); im.crossOrigin = 'anonymous'; im.referrerPolicy = 'no-referrer'; IMG.set(u.avatar, im);
        im.onload = () => { im.ok = true; for (const v of slots.values()) if (v.u.avatar === u.avatar) paintSlot(v.slot, v.u); };
        im.src = u.avatar;
        if (IMG.size > 300) IMG.delete(IMG.keys().next().value);
      }
    }
    s.used = frameNo;
    return s.slot;
  }
  const headG = headGeo(); disposables.push(headG);
  const cellAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 2), 2); cellAttr.setUsage(THREE.DynamicDrawUsage);
  headG.setAttribute('aCell', cellAttr);
  const headMat = atlasMaterial(atlasTex, ACOLS, AROWS, THREE.MeshBasicMaterial);   // không chịu ánh sáng: ảnh đại diện giữ nguyên độ sáng disposables.push(headMat);
  const heads = new THREE.InstancedMesh(headG, headMat, MAXP); heads.frustumCulled = false; scene.add(heads);
  const bodyG = merge([P(G.sph, '#ffffff', M(0, 0, 0, 0, 0, 0, 1.25, 0.95, 0.85))]); disposables.push(bodyG);
  const bodies = new THREE.InstancedMesh(bodyG, smooth, MAXP); bodies.frustumCulled = false; scene.add(bodies);
  bodies.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 3), 3);
  let nP = 0;
  function addPerson(u, x, y, z, s, bob) {
    if (nP >= MAXP || !u) return;
    const slot = slotFor(u), i = nP++;
    const hy = y + bob;
    heads.setMatrixAt(i, _m.compose(_p.set(x, hy, z), _q.identity(), _s.set(0.74 * s, 0.74 * s, 0.6 * s)));
    cellAttr.setXY(i, slot % ACOLS, AROWS - 1 - Math.floor(slot / ACOLS));
    bodies.setMatrixAt(i, _m.compose(_p.set(x, hy - 0.62 * s, z - 0.1 * s), _q.identity(), _s.set(0.62 * s, 0.62 * s, 0.62 * s)));
    _c.set(SHIRTS[strHash(u.id) % SHIRTS.length]); bodies.setColorAt(i, _c);
  }

  // ---------- bụi / khói (pool, instanceColor) ----------
  const NPART = 64;
  const partMat = new THREE.MeshLambertMaterial({ flatShading: true, transparent: true, opacity: 0.75, depthWrite: false }); disposables.push(partMat);
  const puffs = new THREE.InstancedMesh(G.ico, partMat, NPART); puffs.frustumCulled = false; puffs.renderOrder = 2; scene.add(puffs);
  puffs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NPART * 3), 3);
  const parts = Array.from({ length: NPART }, () => ({ life: 0 }));
  let partI = 0;
  function puff(x, y, z, vx, vy, size, color, life = 0.8) {
    const p = parts[partI = (partI + 1) % NPART];
    Object.assign(p, { x, y, z, vx, vy, size, t: 0, life }); _c.set(color); puffs.setColorAt(partI, _c);
  }
  function stepParts(dt) {
    for (let i = 0; i < NPART; i++) {
      const p = parts[i];
      if (p.t >= p.life) { puffs.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const k = p.t / p.life, s = p.size * (0.5 + k) * (1 - k * k);
      puffs.setMatrixAt(i, _m.compose(_p.set(p.x, p.y, p.z), _q.identity(), _s.set(s, s, s)));
    }
    puffs.instanceMatrix.needsUpdate = true; if (puffs.instanceColor) puffs.instanceColor.needsUpdate = true;
  }

  // ---------- trạng thái camera / đoàn ----------
  let cam = game.dist, lastDist = game.dist, vel = 0, wheelRot = 0, zoom = 1, sx = 330, pushA = 0, T = 0;
  const v3 = new THREE.Vector3();
  function toScreen(x, y, z) { v3.set(x, y, z).project(camera); return { x: (v3.x + 1) / 2 * W, y: (1 - v3.y) / 2 * H }; }
  let statT = 0, frames = 0, fps = 0, lastInfo = { calls: 0, triangles: 0 };

  function render(dt) {
    T += dt; frameNo++;
    // camera bám xe như bản 2D
    cam = Math.abs(game.dist - cam) > 400 ? game.dist : lerp(cam, game.dist, 1 - Math.pow(0.0005, dt));
    const dd = game.dist - lastDist; lastDist = game.dist;
    if (dt > 0) vel = lerp(vel, dd / dt, 1 - Math.pow(0.02, dt));
    wheelRot -= dd / 0.55;
    const PAX = game.passengers();
    const n = VIEW.vehicle === 'scooter' ? 1 : Math.max(1, Math.min(5, PAX.cars || 1));
    // đoàn càng dài càng lùi camera: bề ngang nhìn thấy ở mặt đường = 41,5 m × (1 + 0,27 × (số xe − 1))
    const zT = 1 / (1 + 0.27 * (n - 1)), ez = 1 - Math.pow(0.08, dt);
    zoom = lerp(zoom, zT, ez);
    const Wv = 41.5 / zoom, wpp = Wv / W, pxm = W / Wv;
    const sxT = Math.max(330, 40 + pxm * (BUS_L + (n - 1) * GAP));
    sx = lerp(sx, sxT, ez);
    // đặt camera: mặt đường dưới đầu xe ở (sx, 1184), đường chân trời ở y≈760
    const pitch = Math.atan((960 - HZ) * TF / 960), betaR = pitch + Math.atan((1184 - 960) * TF / 960);
    const D = Wv / (2 * TFX);
    const front = cam;
    const Rx = front + (W / 2 - sx) * wpp;
    const shake = env.shake || 0;
    camera.position.set(Rx + (Math.random() - 0.5) * shake * wpp, D * Math.tan(betaR) + (Math.random() - 0.5) * shake * wpp, LANE_Z + D);
    camera.rotation.set(-pitch, 0, 0);
    camera.updateMatrixWorld();
    scene.fog.near = D + 25; scene.fog.far = D + 420;
    // mặt đất bám camera theo bước hoạ tiết
    ground.position.x = Math.round(Rx / GROUND_P) * GROUND_P;
    road.position.x = Math.round(Rx / ROAD_P) * ROAD_P;
    river.position.x = Math.round(Rx / 24) * 24; waterTex.offset.x = (T * 0.012) % 1; pondTex.offset.y = (T * 0.004) % 1;
    shoulder.position.x = shoulderBack.position.x = bankNear.position.x = bankFar.position.x = bankPond.position.x = Rx;
    pond.position.x = river.position.x;
    // ô cảnh trong tầm nhìn (tính ở độ sâu hàng cây xa nhất)
    const hwFar = (D + 190) * TFX + 10;   // đồi xa (z −300) chỉ đặt ở ô chia hết cho 6, rộng ~180 m nên vẫn phủ kín
    rebuildTiles(Math.floor((Rx - hwFar) / TILE), Math.floor((Rx + hwFar) / TILE));
    stepBoats(T);
    // mây: lớp xa trôi chậm, nằm trong dải trời giữa HUD và hàng cây
    for (let i = 0; i < 4; i++) {
      const depth = 900, span = 2 * depth * TFX * 1.4;
      let lx = ((hash(i, 50) * span - cam * 0.08 - T * 1.2) % span + span) % span - span / 2;
      const sy = 390 + hash(i, 51) * 170, ly = depth * (960 - sy) * TF / 960;
      clouds.setMatrixAt(i, _m.compose(_p.set(lx, ly, -depth), _q.identity(), _s.set(1, 0.6, 1).multiplyScalar(0.9 + hash(i, 52) * 0.8)));
    }
    clouds.instanceMatrix.needsUpdate = true;

    // ---- đoàn xe ----
    ensureBusGeo(env.color || '#22b35e');
    const x = game.exclusive;
    let lift = 0, ang = 0;
    if (game.jumpT > 0) lift = Math.sin(Math.PI * (1 - game.jumpT / 0.75)) * 3.2;
    if (env.bump > 0) { lift += Math.sin(Math.PI * (1 - env.bump)) * 2.1; ang += Math.sin(T * 24) * 0.05 * env.bump; }
    if (env.wobble > 0) ang += Math.sin(T * 30) * 0.08 * env.wobble;
    if (game.phase === 'race' && vel > 20 && lift < 0.05) ang += 0.02 + Math.sin(T * 22) * 0.006;   // chạy nhanh: hơi bốc đầu + rung
    const skidX = env.skid > 0 ? Math.sin(T * 8) * 0.7 * env.skid : 0;
    if (env.skid > 0) ang += Math.sin(T * 16) * 0.05 * env.skid;
    const hk = game.halt && game.halt.kind;
    const seated = hk === 'rest' || hk === 'photo' ? [] : hk === 'gas' ? PAX.seated.slice(4) : PAX.seated;
    const per = Math.max(1, game.cfg.seats || 14);
    nP = 0; let nw = 0, ns = 0;
    const drv = game.driver ? { id: game.driver.id || 'driver', name: game.driver.name, avatar: game.driver.avatar } : { id: '__streamer', name: env.streamerName || 'Streamer', avatar: '' };
    for (let i = 0; i < 5; i++) {
      const m = buses[i];
      if (i >= n || VIEW.vehicle === 'scooter') { m.visible = false; continue; }
      m.visible = true;
      const fx = front - i * GAP + skidX * (i ? 0.3 : 1), sway = i ? Math.sin(T * 3 + i) * 0.006 : 0;
      const y = lift * (i ? 0.85 : 1) + (game.speed > 0 ? Math.sin(T * 17 + i * 2) * 0.02 : 0);
      m.position.set(fx, y, LANE_Z); m.rotation.set(0, 0, ang + sway); m.scale.set(1, BUS_SY, 1);
      m.updateMatrix(); m.updateMatrixWorld();
      // bánh xe (bên gần camera) theo ma trận xe
      for (const wx of [-1.75, -8.65]) {
        _p.set(wx, 0.55 - (hk === 'flat' && !i && wx > -2 ? 0.12 : 0), BODY_Z - 0.12).applyMatrix4(m.matrixWorld);
        wheels.setMatrixAt(nw++, _m.compose(_p, _q.setFromEuler(_e.set(0, 0, wheelRot + ang)), _s.setScalar(BUS_SY)));
      }
      shadows.setMatrixAt(ns++, _m.compose(_p.set(fx - BUS_L / 2, 0.06, LANE_Z), _q.setFromEuler(_e.set(-Math.PI / 2, 0, 0)), _s.set(BUS_L * 1.08 * (1 - Math.min(0.5, lift / 8)), 3.2, 1)));
      signs.setMatrixAt(i, _m.compose(_p.set(-5.25, 1.2, BODY_Z + 0.03), _q.identity(), _s.set(1, 1, 1)).premultiply(m.matrixWorld));
      signs.geometry.attributes.aCell.setXY(i, 0, 5 - i);
      // khách: 6 ô cửa sổ rồi tới nóc; xe đầu có tài xế ở cửa lái
      const mine = seated.slice(i * per, (i + 1) * per);
      const local = (lx, ly, lz) => _p.set(lx, ly, lz).applyMatrix4(m.matrixWorld).clone();
      if (i === 0) { const q = local(-0.7, 2.47, 1.0); addPerson(drv, q.x, q.y, q.z, 1.3, 0); }
      mine.forEach((u, k) => {
        const bob = Math.sin(T * 9 + k + i) * 0.03;
        if (k < 6) { const q = local(WIN_X[k], 2.5, 1.0); addPerson(u, q.x, q.y, q.z, 1.35, bob); }   // nhô ra khỏi khung cửa sổ một chút cho rõ mặt
        else {
          const r = k - 6, row = r % 2, col = Math.floor(r / 2);
          const q = local(-2.0 - col * 1.1 - row * 0.55, 3.3 + 0.48 / BUS_SY, row ? -0.35 : 0.45);
          addPerson(u, q.x, q.y + 0.18, q.z, 1.15, bob * 1.3);
        }
      });
    }
    signs.count = VIEW.vehicle === 'scooter' ? 0 : n; signs.instanceMatrix.needsUpdate = true; signs.geometry.attributes.aCell.needsUpdate = true;

    // ---- xe ủi chạy ngược đẩy lùi (giống bản 2D: đang lùi nhanh, không phải container / lốc / điểm dừng) ----
    const own = (x && (x.kind === 'container' || x.kind === 'tornado')) || game.effects.some(e => FUN_PHA.has(e.kind) && e.t < e.dur);   // trò kinh dị tự có hình (vẽ 2D chồng lên)
    // xe ủi lái tới theo cú đẩy Phá đang TIẾP CẬN (logic: p.t < 0) — chạm đầu xe đúng lúc cú đẩy bắt đầu, không để xe tự lùi trước
    let near = 0;
    if (game.phase === 'race' && !game.halt && !own) for (const p of game.pushes) if (p.side === 'pha' && DOZER_KINDS.has(p.kind) && p.t < p.dur) near = Math.max(near, p.t < 0 && p.lead ? 1 + p.t / p.lead : 1);
    pushA = near > 0 ? Math.max(near, Math.min(pushA, 1)) : lerp(pushA, 0, 1 - Math.pow(0.002, dt));   // tới: bám đúng tiến độ · đi: lùi ra từ từ
    let pushTag = null;
    if (pushA > 0.03) {
      const dx = front + 0.35 + (1 - ease(pushA)) * 26;
      dozer.visible = true; dozer.position.set(dx, Math.abs(Math.sin(T * 14)) * 0.04, LANE_Z); dozer.rotation.set(0, 0, Math.sin(T * 9) * 0.01); dozer.scale.setScalar(BUS_SY);
      dozer.updateMatrixWorld();
      for (const wx of [1.6, 2.6, 3.6, 4.6]) {
        _p.set(wx, 0.42, 1.46).applyMatrix4(dozer.matrixWorld);
        wheels.setMatrixAt(nw++, _m.compose(_p, _q.setFromEuler(_e.set(0, 0, -T * 6)), _s.set(0.62 * BUS_SY, 0.62 * BUS_SY, 0.5)));
      }
      shadows.setMatrixAt(ns++, _m.compose(_p.set(dx + 2.7 * BUS_SY, 0.06, LANE_Z), _q.setFromEuler(_e.set(-Math.PI / 2, 0, 0)), _s.set(6 * BUS_SY, 3.6, 1)));
      if (env.pushBy) { const q = _p.set(4.15, 3.05, 1.08).applyMatrix4(dozer.matrixWorld).clone(); addPerson(env.pushBy, q.x, q.y, q.z, 1.0, 0); }
      if (pushA > 0.6 && Math.random() < 0.5) puff(front + 0.4, 0.5, LANE_Z + 1.3, vel + 2 + Math.random() * 3, 1.2 + Math.random(), 1.6, '#eadfc8', 0.6);   // bụi văng ở chỗ lưỡi ủi tì
      if (Math.random() < 0.18 * pushA) puff(dx + 2.2 * BUS_SY, 4.0 * BUS_SY, LANE_Z + 0.4, vel * 0.97, 2.6, 1.3, '#c9ccd2', 1.0);   // khói ống xả
      pushTag = pushA > 0.5 ? toScreen(dx + 3.6 * BUS_SY, 6.6, LANE_Z) : null;
    } else dozer.visible = false;
    wheels.count = nw; wheels.instanceMatrix.needsUpdate = true;
    shadows.count = ns; shadows.instanceMatrix.needsUpdate = true;
    // bụi bánh khi chạy
    if (game.speed > 0 && vel > 5 && lift < 0.1 && Math.random() < 0.4) puff(front - (n - 1) * GAP - BUS_L + 0.4, 0.4, LANE_Z + 1.2, vel * 0.85, 0.9, 1.3, '#efe6d2', 0.5);   // bụi sau đuôi (bay theo xe một chút)
    stepParts(dt);

    heads.count = bodies.count = nP;
    heads.instanceMatrix.needsUpdate = bodies.instanceMatrix.needsUpdate = true; cellAttr.needsUpdate = true;
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    atlasUpT -= dt;
    if (atlasDirty && atlasUpT <= 0) { atlasTex.needsUpdate = true; atlasDirty = false; atlasUpT = 0.25; }   // tải lại atlas tối đa 4 lần/giây

    renderer.render(scene, camera);
    lastInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    const now = performance.now(); frames++; if (now - statT >= 1000) { fps = frames * 1000 / (now - statT || 1); frames = 0; statT = now; }   // đồng hồ thật (không theo dt mô phỏng)

    const extra = PAX.extra > 0 && VIEW.vehicle !== 'scooter' ? { n: PAX.extra, ...toScreen(front - (n - 1) * GAP - BUS_L + 1, 6.2 + lift, LANE_Z) } : null;
    return {
      sx, zoom,
      driver: toScreen(front - 1.2, 6.0 + lift, LANE_Z),
      push: pushTag, pushA, extra,
    };
  }

  function stats() {
    return { fps: Math.round(fps * 10) / 10, ...lastInfo, passengers: nP, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      gl: (() => { try { const gl = renderer.getContext(), d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : ''; } catch (e) { return ''; } })() };
  }
  function dispose() {
    for (const d of disposables) d && d.dispose && d.dispose();
    if (busGeoLead) { busGeoLead.dispose(); busGeoFollow.dispose(); }
    renderer.dispose(); canvas.remove();
  }
  return { render, stats, dispose, renderer, scene, camera, canvas };
}
