/**
 * ⛓️ Nhà Tù Online — vai trò Đại Ca / Cán Bộ + luật biệt giam.
 * Logic thuần (test: tests/nhatu-roles.test.mjs).
 */

/**
 * Chỗ đứng + việc nịnh bợ của đàn em quanh Đại Ca, toạ độ theo hướng nhìn của đại ca
 * (dz > 0 = trước mặt, dx > 0 = bên phải). face: 'boss' = quay vào đại ca, 'forward' = nhìn cùng hướng.
 */
export const ENTOURAGE_SLOTS = [
  { duty: 'massage', label: 'Massa vai', mode: 'massage', prop: 'none', dx: 0, dz: -0.72, face: 'forward' },
  { duty: 'feet', label: 'Lau chân', mode: 'kneel', prop: 'none', dx: 0.05, dz: 0.78, face: 'boss' },
  { duty: 'fan', label: 'Quạt mát', mode: 'fan', prop: 'fan', dx: -0.85, dz: 0.15, face: 'boss' },
  { duty: 'umbrella', label: 'Che ô', mode: 'hold', prop: 'umbrella', dx: 0.62, dz: -0.42, face: 'forward' },
  { duty: 'serve', label: 'Bưng mì tôm', mode: 'serve', prop: 'bowl', dx: -0.8, dz: 0.85, face: 'boss' },
  { duty: 'clap', label: 'Vỗ tay khen', mode: 'clap', prop: 'none', dx: 0.9, dz: 0.75, face: 'boss' },
  { duty: 'drink', label: 'Mời nước', mode: 'serve', prop: 'cup', dx: 1.05, dz: 0.05, face: 'boss' },
  { duty: 'bow', label: 'Cúi chào', mode: 'bow', prop: 'none', dx: -0.2, dz: 1.55, face: 'boss' },
];

/**
 * Toạ độ thế giới của một chỗ đứng quanh đại ca.
 * @param {{x:number, z:number, ry:number}} boss
 * @param {{dx:number, dz:number, face:string}} slot
 * @returns {{x:number, z:number, ry:number}}
 */
export function slotWorld(boss, slot) {
  const c = Math.cos(boss.ry);
  const s = Math.sin(boss.ry);
  const x = boss.x + slot.dx * c + slot.dz * s;
  const z = boss.z - slot.dx * s + slot.dz * c;
  const ry = slot.face === 'boss' ? Math.atan2(boss.x - x, boss.z - z) : boss.ry;
  return { x, z, ry };
}

/** Đã im lặng đủ lâu để bị nhốt biệt giam? idleSec = 0 → tắt luật. */
export function shouldJail(lastActive, now, idleSec) {
  return idleSec > 0 && now - lastActive >= idleSec * 1000;
}

/**
 * Chọn phòng biệt giam trên lầu còn chỗ (ít người nhất trước).
 * @param {{id:string, level:number}[]} cells
 * @param {Map<string, number>} occupancy id phòng → số người đang bị nhốt
 * @param {number} maxPerCell
 */
export function pickJailCell(cells, occupancy, maxPerCell = 2) {
  let best = null;
  let bestN = Infinity;
  for (const c of cells) {
    if (c.level !== 1) continue;
    const n = occupancy.get(c.id) ?? 0;
    if (n < maxPerCell && n < bestN) {
      best = c;
      bestN = n;
    }
  }
  return best;
}
