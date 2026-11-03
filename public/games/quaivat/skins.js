/* 🧟 Zombie Phá Nhà — TRANG PHỤC cho zombie GLB (Quaternius): không cần tải mô hình mới.
   1) Đổi màu quần áo: nhân đôi bề rộng ảnh bảng màu (atlas) — nửa trái = ảnh gốc, nửa phải = ô màu mới;
      đỉnh lưới thuộc thân / tay / chân trỏ UV sang ô màu mới (thân zombie gốc là da trần → "mặc áo" được).
   2) Phụ kiện dựng từ khối cơ bản, gắn vào xương (bone.attach) để đi theo hoạt ảnh.
   Đổi trang phục lúc đang chơi được: applySkin() trả về { remove() } khôi phục UV + ảnh gốc.
   Tạo hình lấy cảm hứng từ các kiểu nhân vật quen thuộc nhưng KHÔNG chép nhân vật có bản quyền. */

export const SKINS = [
  { id: '', name: '🧟 Zombie gốc' },
  { id: 'sieunhan', name: '🦸 Siêu Nhân Zombie' },
  { id: 'quyong', name: '🧸 Quý Ông Vụng Về' },
  { id: 'caibang', name: '🥢 Cái Bang' },
  { id: 'nonla', name: '👒 Nón Lá Áo Bà Ba' },
  { id: 'noicom', name: '🍚 Đội Nồi Cơm Điện' },
  { id: 'baohiem', name: '🛵 Mũ Bảo Hiểm' },
  { id: 'daubep', name: '👨‍🍳 Đầu Bếp' },
  { id: 'docbao', name: '📰 Ông Đọc Báo' },
  { id: 'camco', name: '🚩 Zombie Cầm Cờ' },
  { id: 'phihanh', name: '🧑‍🚀 Phi Hành Gia' },
];

// màu quần áo theo trang phục: torso = thân + vai + bắp tay; sleeve = cẳng tay; pants; belt; shoe
const OUTFIT = {
  sieunhan: { torso: '#2456d6', sleeve: '#2456d6', pants: '#2456d6', belt: '#ffd21f', shoe: '#d42a1e' },
  quyong:   { torso: '#7a5a3a', sleeve: '#7a5a3a', pants: '#3a3a3e', belt: '#2a2a2a', shoe: '#1a1a1a', tweed: true },
  caibang:  { torso: '#8a7d64', pants: '#6a5640', belt: '#c9a46a', shoe: 'skin', patches: true },
  nonla:    { torso: '#2a2a2a', sleeve: '#2a2a2a', pants: '#2a2a2a', belt: '#2a2a2a', shoe: '#6a4a2a' },
  noicom:   { torso: '#e8e2d6', pants: '#3f5363' },
  baohiem:  { torso: '#2a9d5a', pants: '#2a3a5a', shoe: '#e8e8e8' },
  daubep:   { torso: '#f4f2ee', sleeve: '#f4f2ee', pants: '#2a2a2e', belt: '#2a2a2e', shoe: '#1a1a1a' },
  docbao:   { torso: '#c8b48a', sleeve: '#c8b48a', pants: '#5a4a3a', belt: '#3a2a1a', shoe: '#3a2a1a' },
  camco:    { torso: '#d8261c', pants: '#3f5363' },
  phihanh:  { torso: '#f2f2f4', sleeve: '#f2f2f4', pants: '#f2f2f4', belt: '#8a8f96', shoe: '#8a8f96' },
};

const hex = (r, g, b) => (r << 16) | (g << 8) | b;
const BONE_GROUP = n => /^(Torso|Abdomen|Neck|Shoulder[LR]|UpperArm[LR])$/.test(n) ? 'torso' : /^LowerArm[LR]$/.test(n) ? 'sleeve'
  : /^(Pinky|Middle|Index|Thumb)/.test(n) ? 'hand' : /^(Head|Tongue|Eyelid)/.test(n) ? 'head' : n === 'Hips' ? 'hips'
  : /^(UpperLeg|LowerLeg)/.test(n) ? 'leg' : /^Foot/.test(n) ? 'foot' : 'other';

export function applySkin(id, k) {
  const { THREE, model, MS, sph, box, cyl, geo } = k;
  const added = [], updates = [], restores = [];
  const done = { id, remove() { for (const f of restores) f(); for (const o of added) { if (o.parent) o.parent.remove(o); if (k.dispose) k.dispose(o); } added.length = 0; updates.length = 0; restores.length = 0; }, update(dt, t) { for (const f of updates) f(dt, t); } };
  if (!id || !OUTFIT[id]) return done;
  const V3 = THREE.Vector3;
  let mesh = null; model.traverse(o => { if (o.isSkinnedMesh && (!mesh || o.geometry.attributes.position.count > mesh.geometry.attributes.position.count)) mesh = o; });
  if (!mesh || !mesh.material.map || !mesh.material.map.image) return done;
  model.traverse(o => { if (o.isSkinnedMesh) o.skeleton.pose(); });                // tư thế gốc (đang chơi thì xương đang múa) → đo + gắn cho đúng
  const root = model.parent || model;                                                  // dựng ở toạ độ của nhân vật (wrap) rồi attach vào xương
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const bone = n => model.getObjectByName(n);
  const wp = b => b ? b.getWorldPosition(new V3()).applyMatrix4(inv) : new V3();

  // ---------- 1) đổi màu quần áo qua bảng màu ----------
  const O = OUTFIT[id] || {};
  const src = mesh.material.map, img = src.image, W = img.width, H = img.height;
  const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H; const cx = cv.getContext('2d');
  cx.drawImage(img, 0, 0);
  const orig = document.createElement('canvas'); orig.width = W; orig.height = H; orig.getContext('2d').drawImage(img, 0, 0);
  const od = orig.getContext('2d').getImageData(0, 0, W, H).data;
  const colorAt = (u, v) => { const x = Math.min(W - 1, Math.max(0, Math.floor(u * W))), y = Math.min(H - 1, Math.max(0, Math.floor(v * H))), i = (y * W + x) * 4; return hex(od[i], od[i + 1], od[i + 2]); };
  // phân loại màu theo xương: da = màu nhiều nhất ở đầu; quần = nhiều nhất ở đùi (khác da); thắt lưng = ở hông (khác da, quần); giày = ở bàn chân
  const uv = mesh.geometry.attributes.uv, si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight, names = mesh.skeleton.bones.map(b => b.name);
  const grpOf = new Array(uv.count), colOf = new Array(uv.count), cnt = {};
  for (let i = 0; i < uv.count; i++) {
    let best = 0, bi = 0; for (let q = 0; q < 4; q++) { const w = sw.getComponent(i, q); if (w > best) { best = w; bi = si.getComponent(i, q); } }
    const gname = BONE_GROUP(names[bi] || ''), c = colorAt(uv.getX(i), uv.getY(i));
    grpOf[i] = gname; colOf[i] = c; (cnt[gname] ||= new Map()).set(c, (cnt[gname].get(c) || 0) + 1);
  }
  const topOf = (g, skip) => { let bc = null, bn = -1; for (const [c, n] of cnt[g] || []) if (!skip.includes(c) && n > bn) { bn = n; bc = c; } return bc; };
  const skinC = topOf('head', []), skinSet = new Set([skinC]);
  for (const [c, n] of cnt.torso || []) if (n > 20) skinSet.add(c);                      // thân trần: mọi màu chính ở thân là da
  const pantsC = topOf('leg', [...skinSet]), beltC = topOf('hips', [...skinSet, pantsC]);
  const shoeCols = new Set([...(cnt.foot || new Map()).keys()].filter(c => !skinSet.has(c)));
  // vẽ ô màu mới ở nửa phải
  const cells = {}; let ci = 0;
  const cell = css => {
    if (cells[css]) return cells[css];
    const x = W + (ci % 16) * (W / 16), y = Math.floor(ci / 16) * (H / 16); ci++;
    cx.fillStyle = css; cx.fillRect(x, y, W / 16, H / 16);
    if (css === O.torso && O.tweed) { cx.globalAlpha = 0.25; for (let k2 = 0; k2 < 40; k2++) { cx.fillStyle = k2 % 2 ? '#3a2a1a' : '#a88a64'; cx.fillRect(x + Math.random() * W / 16, y + Math.random() * H / 16, 2, 2); } cx.globalAlpha = 1; }
    return (cells[css] = { u: (x + W / 32) / (W * 2), v: (y + H / 32) / H });
  };
  const origUV = uv.array.slice();
  const others = []; model.traverse(o => { if (o.isSkinnedMesh && o !== mesh && o.material && o.material.map === src) others.push({ o, a: o.geometry.attributes.uv.array.slice() }); });
  const target = i => {
    const g = grpOf[i], c = colOf[i], isSkin = skinSet.has(c);
    if (g === 'torso' && isSkin && O.torso) return O.torso;
    if (g === 'sleeve' && isSkin && O.sleeve) return O.sleeve;
    if ((g === 'leg' || g === 'hips') && c === pantsC && O.pants) return O.pants;
    if (g === 'hips' && c === beltC && O.belt) return O.belt;
    if (g === 'foot' && shoeCols.has(c) && O.shoe) return O.shoe === 'skin' ? null : O.shoe;
    return null;
  };
  for (let i = 0; i < uv.count; i++) {
    const css = target(i);
    if (css) { const p = cell(css); uv.setXY(i, p.u, p.v); }
    else uv.setX(i, uv.getX(i) * 0.5);                                                  // giữ màu gốc ở nửa trái
  }
  if (O.shoe === 'skin') for (let i = 0; i < uv.count; i++) if (grpOf[i] === 'foot' && shoeCols.has(colOf[i])) { const p = cell('#' + skinC.toString(16).padStart(6, '0')); uv.setXY(i, p.u, p.v); }   // đi chân đất
  uv.needsUpdate = true;
  for (const e of others) { const a = e.o.geometry.attributes.uv; for (let i = 0; i < a.count; i++) a.setX(i, a.getX(i) * 0.5); a.needsUpdate = true; }
  const tex = new THREE.CanvasTexture(cv); tex.flipY = src.flipY; tex.colorSpace = src.colorSpace; tex.magFilter = src.magFilter; tex.minFilter = src.minFilter; tex.generateMipmaps = src.generateMipmaps; tex.wrapS = src.wrapS; tex.wrapT = src.wrapT;
  const mats = []; model.traverse(o => { if (o.isSkinnedMesh && o.material && o.material.map === src) mats.push(o.material); });
  for (const m of mats) { m.map = tex; m.needsUpdate = true; }
  restores.push(() => {
    uv.array.set(origUV); uv.needsUpdate = true;
    for (const e of others) { const a = e.o.geometry.attributes.uv; a.array.set(e.a); a.needsUpdate = true; }
    for (const m of mats) { m.map = src; m.needsUpdate = true; }
    tex.dispose();
  });

  // ---------- 2) phụ kiện gắn xương ----------
  const head = bone('Head'), neck = bone('Neck') || head, torso = bone('Torso') || neck, hips = bone('Hips') || torso;
  const handR = bone('Middle1R') || bone('LowerArmR'), handL = bone('Middle1L') || bone('LowerArmL'), armR = bone('LowerArmR'), armL = bone('LowerArmL');
  // đo đầu: tâm, đỉnh, bán kính theo các đỉnh lưới thuộc xương đầu
  const pa = mesh.geometry.attributes.position, w = new V3(), hb = new THREE.Box3();
  for (let i = 0; i < pa.count; i++) if (grpOf[i] === 'head') { w.fromBufferAttribute(pa, i); (mesh.applyBoneTransform || mesh.boneTransform).call(mesh, i, w); w.applyMatrix4(mesh.matrixWorld).applyMatrix4(inv); hb.expandByPoint(w); }
  const hc = hb.getCenter(new V3()), hs = hb.getSize(new V3()), hr = Math.max(hs.x, hs.z) / 2, htop = hb.max.y;
  const nk = wp(neck), ch = wp(torso), hp = wp(hips), pR = wp(handR), pL = wp(handL);
  const at = (obj, b) => { root.add(obj); root.updateMatrixWorld(true); obj.updateMatrixWorld(true); (b || root).attach(obj); obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); added.push(obj); return obj; };
  const G = () => new THREE.Group();
  const M = (c, r = 0.6, m = 0, e) => MS(c, r, m, e);

  const hat = {
    nonla: () => { const g = G(); const c = new THREE.Mesh(geo('nonla', () => new THREE.ConeGeometry(1, 0.42, 24, 1, true)), new THREE.MeshStandardMaterial({ color: 0xe8d29a, roughness: 0.9, side: THREE.DoubleSide })); c.scale.setScalar(hr * 1.4); c.position.y = 0.42 * hr * 1.4 / 2; g.add(c); for (let r2 = 0.3; r2 < 1; r2 += 0.23) { const ring = new THREE.Mesh(geo('nlring', () => new THREE.TorusGeometry(1, 0.012, 4, 24)), M(0xc9b070, 0.9)); ring.rotation.x = Math.PI / 2; ring.scale.setScalar(hr * 1.4 * r2); ring.position.y = 0.42 * hr * 1.4 * (1 - r2); g.add(ring); } g.position.set(hc.x, htop - hr * 0.22, hc.z); return g; },
    noicom: () => { const g = G(); cyl(hr * 1.05, hr * 1.0, hr * 1.1, M(0xf4f4f0, 0.35, 0.1), 0, hr * 0.55, 0, g, 22); cyl(hr * 1.1, hr * 1.1, hr * 0.12, M(0xd8dde2, 0.25, 0.7), 0, hr * 1.12, 0, g, 22); sph(hr * 0.16, M(0x2a2a2a, 0.4), 0, hr * 1.22, 0, g).scale.y = 0.6; box(hr * 0.35, hr * 0.12, hr * 0.06, M(0xff3a2a, 0.4, 0, { emissive: 0x880000 }), 0, hr * 0.45, -hr * 1.04, g); for (const sx of [-1, 1]) box(hr * 0.15, hr * 0.12, hr * 0.4, M(0x8a8f96, 0.4, 0.6), sx * hr * 1.1, hr * 0.9, 0, g); g.position.set(hc.x, htop - hr * 0.55, hc.z); return g; },
    baohiem: () => { const g = G(); const shell = new THREE.Mesh(geo('helmet', () => new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.56)), new THREE.MeshStandardMaterial({ color: 0xd8261c, roughness: 0.25, metalness: 0.15, side: THREE.DoubleSide })); shell.scale.set(hs.x / 2 * 1.1, hs.y * 0.6, hs.z / 2 * 1.1); g.add(shell); const st = new THREE.Mesh(geo('helmstripe', () => new THREE.SphereGeometry(1.004, 24, 10, -0.12, 0.24, 0, Math.PI * 0.56)), M(0xffffff, 0.4)); st.scale.copy(shell.scale); st.rotation.y = Math.PI; g.add(st); const vz = new THREE.Mesh(geo('visor', () => new THREE.SphereGeometry(1.01, 16, 8, -0.9, 1.8, Math.PI * 0.42, Math.PI * 0.2)), new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.1, metalness: 0.5, side: THREE.DoubleSide })); vz.scale.copy(shell.scale); g.add(vz); g.position.set(hc.x, hc.y + hs.y * 0.02, hc.z); return g; },   // nửa vỏ mũ ôm đầu + sọc trắng sau gáy + kính chắn phía trước
    daubep: () => { const g = G(); cyl(hr * 0.95, hr * 0.95, hr * 0.5, M(0xffffff, 0.8), 0, hr * 0.25, 0, g, 18); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; sph(hr * 0.55, M(0xffffff, 0.8), Math.cos(a) * hr * 0.5, hr * 0.85, Math.sin(a) * hr * 0.5, g); } sph(hr * 0.6, M(0xffffff, 0.8), 0, hr * 1.0, 0, g); g.position.set(hc.x, htop - hr * 0.35, hc.z); return g; },
    caibang: () => { const g = G(); const t = new THREE.Mesh(geo('band', () => new THREE.TorusGeometry(1, 0.12, 8, 24)), M(0xc4161c, 0.7)); t.rotation.x = Math.PI / 2; t.scale.setScalar(hr * 1.02); g.add(t); for (const sx of [-0.25, 0.25]) box(hr * 0.12, hr * 0.7, hr * 0.04, M(0xc4161c, 0.7), sx * hr, -hr * 0.3, -hr * 1.05, g).rotation.z = sx; g.position.set(hc.x, hc.y + hr * 0.25, hc.z); return g; },
    phihanh: () => { const g = G(); sph(hr * 1.45, new THREE.MeshStandardMaterial({ color: 0xcfe8ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false }), 0, 0, 0, g); const r2 = new THREE.Mesh(geo('astring', () => new THREE.TorusGeometry(1, 0.08, 8, 28)), M(0xbfc4cc, 0.4, 0.6)); r2.rotation.x = Math.PI / 2; r2.scale.setScalar(hr * 1.2); r2.position.y = -hr * 1.1; g.add(r2); g.position.set(hc.x, hc.y, hc.z); return g; },
    docbao: () => { const g = G(); for (const sx of [-1, 1]) { const l = new THREE.Mesh(geo('glass', () => new THREE.TorusGeometry(1, 0.15, 6, 16)), M(0x2a2a2a, 0.4, 0.6)); l.scale.setScalar(hr * 0.24); l.position.set(sx * hr * 0.32, 0, hr * 0.95); g.add(l); } g.position.set(hc.x, hc.y + hr * 0.08, hc.z); return g; },
    sieunhan: () => { const g = G(), tilt = G(); tilt.rotation.x = Math.PI / 2; g.add(tilt); const m = new THREE.Mesh(geo('mask2', () => new THREE.TorusGeometry(1, 0.07, 6, 24, Math.PI * 0.8)), M(0x111111, 0.5)); m.rotation.z = Math.PI * 0.1; tilt.add(m); tilt.scale.set(hs.x / 2 * 1.02, hs.z / 2 * 1.02, hr * 1.4); g.position.set(hc.x, hc.y + hs.y * 0.08, hc.z); return g; },   // mặt nạ chỉ che phía trước mắt
  };
  if (hat[id]) at(hat[id](), head);

  // áo choàng siêu nhân (đỏ, phía sau — camera luôn ở sau nên người xem thấy rõ) + huy hiệu ngực
  if (id === 'sieunhan') {
    // ÁO CHOÀNG vải: lưới 10×14, hẹp ở vai (túm) → xoè ở gấu, cong ôm lưng, gấu lượn sóng; luôn rủ theo trọng lực
    // (zombie đi khom — gắn cứng vào xương lưng thì áo chĩa ngang như tấm ván), bay ra sau theo tốc độ, gợn chạy dọc áo
    const piv = G(); piv.position.set(nk.x, nk.y - 0.03, ch.z - 0.12);
    const L = Math.max(0.7, nk.y - hp.y + 0.45), W0 = 0.34, W1 = 0.66, SX = 10, SY = 14;
    const cg = new THREE.PlaneGeometry(1, 1, SX, SY), cp = cg.attributes.position, base = [];
    for (let i = 0; i < cp.count; i++) base.push([cp.getX(i) + 0.5, 0.5 - cp.getY(i)]);       // u: trái→phải, t: vai→gấu
    const capeTex = new THREE.CanvasTexture((() => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 256; const q = c.getContext('2d');
      const gr = q.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#8e0f16'); gr.addColorStop(0.25, '#d0222a'); gr.addColorStop(0.85, '#c01c24'); gr.addColorStop(1, '#7a0a10');
      q.fillStyle = gr; q.fillRect(0, 0, 64, 256);
      q.fillStyle = 'rgba(0,0,0,.18)'; for (let x = 6; x < 64; x += 13) q.fillRect(x, 20, 3, 236);                  // nếp gấp dọc
      q.fillStyle = '#ffcc3a'; q.fillRect(0, 236, 64, 9); q.fillRect(0, 0, 4, 256); q.fillRect(60, 0, 4, 256);      // viền vàng
      return c;
    })());
    capeTex.colorSpace = THREE.SRGBColorSpace;
    const cape = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ map: capeTex, roughness: 0.62, side: THREE.DoubleSide }));
    cape.castShadow = true; piv.add(cape);
    const deform = (time, sp) => {
      for (let i = 0; i < cp.count; i++) {
        const [u, t] = base[i], w = W0 + (W1 - W0) * Math.pow(t, 0.8), x = (u - 0.5) * w;
        const bulge = 0.05 + 0.1 * (1 - Math.pow(2 * u - 1, 2)) * (0.4 + t);                                    // cong ôm lưng
        const flow = t * t * (0.06 + 0.42 * sp);                                                                 // bay ra sau khi chạy
        const wave = Math.sin(time * (6 + 4 * sp) - t * 6 + u * 2.4) * 0.045 * t * (0.5 + sp);
        const hem = t > 0.93 ? Math.sin(u * Math.PI * 5) * 0.025 : 0;                                            // gấu lượn sóng
        cp.setXYZ(i, x, -t * L + hem + flow * 0.35, -(bulge + flow + wave));
      }
      cp.needsUpdate = true; cg.computeVertexNormals();
    };
    deform(0, 0); at(piv, torso);
    for (const sx of [-1, 1]) { const cl = sph(0.045, M(0xffcc3a, 0.3, 0.7), nk.x + sx * 0.17, nk.y - 0.05, ch.z - 0.05, G()); at(cl.parent, torso); }   // khoá vàng ở vai
    const qP = new THREE.Quaternion(), qM = new THREE.Quaternion(), qW = new THREE.Quaternion(), eu = new THREE.Euler(0, 0, 0, 'YXZ'), fw = new V3();
    let spS = 0;
    updates.push((dt, t) => {
      spS += (Math.min(1, (k.speed ? k.speed() : 0) / 3) - spS) * Math.min(1, dt * 4);
      model.getWorldQuaternion(qM); fw.set(0, 0, 1).applyQuaternion(qM);
      eu.set(0.04 + Math.sin(t * 2.3) * 0.02, Math.atan2(fw.x, fw.z), 0); qW.setFromEuler(eu);               // đứng thẳng theo trọng lực, quay theo hướng zombie
      piv.parent.getWorldQuaternion(qP); piv.quaternion.copy(qP.invert().multiply(qW));
      deform(t, spS);
    });
    restores.push(() => capeTex.dispose());
    const em = G(); sph(hr * 0.42, M(0xffd21f, 0.4, 0.3), 0, 0, 0, em).scale.z = 0.15; box(hr * 0.42, hr * 0.08, hr * 0.06, M(0xd42a1e, 0.4), 0, hr * 0.14, hr * 0.06, em); box(hr * 0.42, hr * 0.08, hr * 0.06, M(0xd42a1e, 0.4), 0, -hr * 0.14, hr * 0.06, em); const d = box(hr * 0.08, hr * 0.42, hr * 0.06, M(0xd42a1e, 0.4), 0, 0, hr * 0.06, em); d.rotation.z = -0.6;
    em.scale.setScalar(0.45); em.position.set(ch.x, ch.y + 0.04, ch.z + 0.3); at(em, torso);
  }
  // quý ông: cổ áo trắng + cà vạt đỏ + gấu bông tay trái
  if (id === 'quyong') {
    const t = G(); box(0.22, 0.08, 0.03, M(0xffffff, 0.6), 0, 0, 0, t); box(0.06, 0.32, 0.03, M(0xb0201a, 0.5), 0, -0.18, 0.015, t);
    t.position.set(nk.x, nk.y - 0.08, ch.z + 0.3); at(t, torso);
    const bear = G(), fur = M(0x9a6a3a, 0.9), hr0 = hr; { const hr = 0.2;
    sph(hr * 0.42, fur, 0, 0, 0, bear); sph(hr * 0.32, fur, 0, hr * 0.55, 0, bear); for (const sx of [-1, 1]) { sph(hr * 0.12, fur, sx * hr * 0.24, hr * 0.82, 0, bear); sph(hr * 0.15, fur, sx * hr * 0.35, -hr * 0.3, hr * 0.1, bear); }
    sph(hr * 0.12, M(0xe8d0b0, 0.8), 0, hr * 0.5, hr * 0.28, bear); sph(hr * 0.05, M(0x111111, 0.3), 0, hr * 0.54, hr * 0.4, bear);
    } bear.position.set(pL.x, pL.y - 0.08, pL.z + 0.1); at(bear, handL ? armL : root);
  }
  // Cái Bang: gậy tre tay phải + hồ lô bên hông + miếng vá trên lưng
  if (id === 'caibang') {
    const st = G(), bam = M(0x7fa83a, 0.6), node = M(0x5a7a2a, 0.7), L = 1.7;
    cyl(0.035, 0.04, L, bam, 0, 0, 0, st, 8); for (let y = -L / 2 + 0.2; y < L / 2; y += 0.32) cyl(0.045, 0.045, 0.03, node, 0, y, 0, st, 8);
    st.position.set(pR.x, pR.y - 0.15, pR.z + 0.05); at(st, armR || root);
    const gd = G(), gm = M(0xd9a03a, 0.45, 0.1); sph(0.12, gm, 0, 0, 0, gd); sph(0.085, gm, 0, 0.15, 0, gd); cyl(0.02, 0.025, 0.06, M(0xc4161c, 0.6), 0, 0.24, 0, gd, 6);
    gd.position.set(hp.x + 0.27, hp.y - 0.02, hp.z + 0.02); at(gd, hips);
    for (const [x, y, c] of [[-0.1, 0.1, 0x6a8a5a], [0.12, -0.08, 0x8a5a6a], [0.02, -0.22, 0x5a6a8a]]) { const pz = box(0.13, 0.11, 0.015, M(c, 0.9), 0, 0, 0, G()); pz.rotation.z = (x + y) * 2; const pg = pz.parent; pg.position.set(ch.x + x, ch.y + y, ch.z - 0.17); at(pg, torso); }
  }
  // đầu bếp: muôi tay phải
  if (id === 'daubep') { const l = G(); cyl(0.02, 0.02, 0.55, M(0x8a8f96, 0.3, 0.8), 0, 0, 0, l, 6); const b = sph(0.09, M(0x8a8f96, 0.3, 0.8), 0, -0.3, 0.04, l); b.scale.y = 0.5; l.position.set(pR.x, pR.y - 0.1, pR.z + 0.05); at(l, armR || root); }
  // đọc báo: tờ báo cầm 2 tay trước ngực
  if (id === 'docbao') {
    const nt = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = 128; c.height = 96; const q = c.getContext('2d'); q.fillStyle = '#efe9dc'; q.fillRect(0, 0, 128, 96); q.fillStyle = '#222'; q.font = 'bold 16px sans-serif'; q.fillText('TIN NÓNG', 8, 20); q.fillStyle = '#888'; for (let y = 30; y < 92; y += 7) q.fillRect(8, y, 112 * (0.6 + Math.random() * 0.4), 3); return c; })());
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.46), new THREE.MeshStandardMaterial({ map: nt, side: THREE.DoubleSide, roughness: 0.9 }));
    const g = G(); g.add(p); g.position.set(ch.x, ch.y + 0.05, ch.z + 0.55); g.rotation.x = -0.25; at(g, torso);
    restores.push(() => nt.dispose());
  }
  // cầm cờ: cán + lá cờ đuôi nheo (không dùng quốc kỳ) bay phấp phới
  if (id === 'camco') {
    const f = G(); cyl(0.022, 0.022, 1.9, M(0x6a4a2a, 0.8), 0, 0.5, 0, f, 6); sph(0.05, M(0xffd21f, 0.3, 0.6), 0, 1.47, 0, f);
    const fg = new THREE.PlaneGeometry(0.75, 0.5, 8, 1); fg.translate(0.375, 0, 0);
    const ft = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = 96; c.height = 64; const q = c.getContext('2d'); const cols = ['#ff3d7f', '#ffd21f', '#2ad1a0', '#3d8bff']; for (let i = 0; i < 4; i++) { q.fillStyle = cols[i]; q.fillRect(0, i * 16, 96, 16); } q.fillStyle = '#fff'; q.font = 'bold 26px sans-serif'; q.fillText('🧠', 34, 44); return c; })());
    const flag = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide, roughness: 0.8 })); flag.position.set(0.02, 1.2, 0); f.add(flag);
    f.position.set(pR.x, pR.y - 0.25, pR.z); at(f, armR || root);
    const base = fg.attributes.position.array.slice();
    updates.push((dt, t) => { const a = fg.attributes.position; for (let i = 0; i < a.count; i++) { const x = base[i * 3]; a.setZ(i, Math.sin(t * 7 + x * 6) * 0.06 * x); } a.needsUpdate = true; });
    restores.push(() => ft.dispose());
  }
  // phi hành gia: ba lô dưỡng khí sau lưng
  if (id === 'phihanh') { const b = G(); box(0.4, 0.46, 0.18, M(0xe8e8ec, 0.5, 0.2), 0, 0, 0, b); for (const sx of [-1, 1]) cyl(0.06, 0.06, 0.42, M(0x8a8f96, 0.35, 0.7), sx * 0.12, 0, -0.1, b, 10); b.position.set(ch.x, ch.y + 0.02, ch.z - 0.27); at(b, torso); }
  // nón lá: áo bà ba có hàng cúc trắng phía trước (đã đổi màu áo đen)
  return done;
}
