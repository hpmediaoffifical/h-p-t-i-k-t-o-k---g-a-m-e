/**
 * Lightweight character physics for a mostly-flat level: axis-aligned boxes act
 * as walls and as walkable tops. Characters are vertical cylinders (circle in
 * XZ + height). Pure logic so it can be unit tested in Node.
 */

/** Max height a character walks up without jumping (stair steps are 0.283). */
export const STEP_UP = 0.32;

/**
 * @typedef {{minX:number,maxX:number,minY:number,maxY:number,minZ:number,maxZ:number,walkable:boolean}} Box
 */

/** Create a box from min/max extents. */
export function makeBox(minX, maxX, minY, maxY, minZ, maxZ, walkable = true) {
  return { minX, maxX, minY, maxY, minZ, maxZ, walkable };
}

/** Uniform grid spatial hash over boxes. */
export class CollisionWorld {
  constructor(cellSize = 4) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.boxes = [];
    this._out = [];
    this._stamp = 0;
  }

  /** Khoá số cho ô lưới (không tạo chuỗi mỗi lần tra). */
  _key(ix, iz) {
    return (ix + 4096) * 8192 + (iz + 4096);
  }

  /** Register a box. */
  add(box) {
    this.boxes.push(box);
    const s = this.cellSize;
    for (let ix = Math.floor(box.minX / s); ix <= Math.floor(box.maxX / s); ix++) {
      for (let iz = Math.floor(box.minZ / s); iz <= Math.floor(box.maxZ / s); iz++) {
        const k = this._key(ix, iz);
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(box);
      }
    }
    return box;
  }

  /**
   * Boxes whose grid cells touch the circle (x, z, r).
   * Trả về MẢNG DÙNG LẠI giữa các lần gọi (gọi mỗi bước cho mọi nhân vật — không cấp phát): duyệt ngay, đừng giữ lại.
   */
  near(x, z, r) {
    const s = this.cellSize;
    const out = this._out;
    out.length = 0;
    const stamp = ++this._stamp;
    for (let ix = Math.floor((x - r) / s); ix <= Math.floor((x + r) / s); ix++) {
      for (let iz = Math.floor((z - r) / s); iz <= Math.floor((z + r) / s); iz++) {
        const list = this.cells.get(this._key(ix, iz));
        if (!list) continue;
        for (const b of list) {
          if (b._near === stamp) continue; // hộp nằm trên nhiều ô — chỉ lấy 1 lần
          b._near = stamp;
          out.push(b);
        }
      }
    }
    return out;
  }

  /** Highest walkable top under (x, z) reachable from feet height y (step-up allowed). Floor is 0. */
  groundHeight(x, z, y) {
    let h = 0;
    for (const b of this.near(x, z, 0)) {
      if (!b.walkable) continue;
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      if (b.maxY <= y + STEP_UP && b.maxY > h) h = b.maxY;
    }
    return h;
  }

  /** Is this box an obstacle for a body standing at feet height y? */
  blocks(b, y, height) {
    if (b.walkable && b.maxY <= y + STEP_UP) return false; // can step onto it
    if (b.maxY <= y + 0.001) return false; // below our feet
    if (b.minY >= y + height) return false; // above our head
    return true;
  }

  /** Push a circle body (mutates pos {x,y,z}) out of blocking boxes. Returns true if it collided. */
  resolve(pos, radius, height) {
    let hit = false;
    for (const b of this.near(pos.x, pos.z, radius)) {
      if (!this.blocks(b, pos.y, height)) continue;
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      hit = true;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        const push = radius - d;
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
      } else {
        // Centre is inside the box: leave by the shallowest side.
        const exits = [
          [pos.x - b.minX + radius, -1, 0],
          [b.maxX - pos.x + radius, 1, 0],
          [pos.z - b.minZ + radius, 0, -1],
          [b.maxZ - pos.z + radius, 0, 1],
        ].sort((a, c) => a[0] - c[0]);
        const [dist, sx, sz] = exits[0];
        pos.x += sx * dist;
        pos.z += sz * dist;
      }
    }
    return hit;
  }

  /** True if a body at this spot would overlap any blocking box. */
  isFree(x, y, z, radius, height) {
    for (const b of this.near(x, z, radius)) {
      if (!this.blocks(b, y, height)) continue;
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) return false;
    }
    return true;
  }
}

/**
 * Advance a body one tick: horizontal move, collision, ground snap, gravity.
 * body: {pos:{x,y,z}, vy, grounded, radius, height}
 * Returns true when the body bumped into something.
 */
export function stepBody(body, vx, vz, dt, world, gravity) {
  const p = body.pos;
  p.x += vx * dt;
  p.z += vz * dt;
  const hit = world.resolve(p, body.radius, body.height);
  world.resolve(p, body.radius, body.height);
  const g = world.groundHeight(p.x, p.z, p.y);
  if (body.vy <= 0 && body.grounded && p.y >= g && p.y - g <= STEP_UP) {
    p.y = g; // walk down stairs without hopping
    body.vy = 0;
    body.grounded = true;
  } else if (p.y > g || body.vy > 0) {
    body.vy -= gravity * dt;
    p.y += body.vy * dt;
    if (p.y <= g) {
      p.y = g;
      body.vy = 0;
      body.grounded = true;
    } else {
      body.grounded = false;
    }
  } else {
    p.y = g;
    body.vy = 0;
    body.grounded = true;
  }
  return hit;
}
