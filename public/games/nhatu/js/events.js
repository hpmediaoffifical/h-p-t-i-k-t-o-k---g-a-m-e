/**
 * ⛓️ Nhà Tù Online — vai trò (Đại Ca, Cán Bộ), luật biệt giam và các sự kiện quà cho cả trại.
 * Mọi hành động ở đây được gán quà trong panel (ntGiftMap) hoặc thử bằng nút 🧪.
 */
import { setLook, setProp, createAnimal, animateAnimal, animateCharacter } from './character.js';
import { makeActor, syncActor, turnToward } from './npc.js';
import { attachLabel } from './labels.js';
import { stepBody } from './logic/physics.js';
import { pick, range } from './logic/rng.js';
import { ENTOURAGE_SLOTS, slotWorld, shouldJail, pickJailCell } from './logic/roles.js';
import { Fireworks } from './effects.js';

const R = Math.random;
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * @param {object} ctx {scene, world, npcs, DATA, CFG, viewers, chatLine, banner, sfx, addPoints, doAction, spot}
 */
export function createEvents(ctx) {
  const { scene, world, npcs, DATA, CFG, chatLine, banner, sfx, addPoints, spot } = ctx;
  const lines = (k, name = '') => pick(R, DATA.chat[k] ?? ['...']).replace('{name}', name);
  const fireworks = new Fireworks(scene);
  const st = {
    boss: null, // bản ghi người xem đang làm đại ca
    bossUntil: 0,
    followers: [], // {n, slot}
    flatterT: 2,
    guards: new Map(), // id → {v, until}
    salutedAt: new WeakMap(),
    pets: [], // {a, label, body, owner, until, kind, barkT}
    walkers: [], // người thân thăm nuôi
    karaoke: null,
    nightUntil: 0,
    jailOcc: new Map(), // id phòng → số người bị nhốt
    later: [], // {at, fn}
  };
  const defs = Object.fromEntries((DATA.giftActions || []).map((a) => [a.id, a]));

  /** Phạm nhân "rảnh" để kéo vào sự kiện (không phải người đang có lượt, không bị nhốt, không đang bận). */
  function freeInmates({ npcOnly = false, level = 0 } = {}) {
    return npcs.inmates.filter(
      (n) =>
        !n.locked &&
        !n.puppet &&
        !n.isBoss &&
        !n.isFollower &&
        n.role !== 'guard' &&
        !n.viewerRec?.jailed &&
        !(n.viewerRec && spot.current?.id === n.viewerRec.id) &&
        (!npcOnly || !n.viewer) &&
        (level === null || (n.body.pos.y > 2 ? 1 : 0) === level)
    );
  }
  const after = (sec, fn) => st.later.push({ at: performance.now() + sec * 1000, fn });

  // ------------------------------------------------------------ 👑 ĐẠI CA
  function becomeBoss(v) {
    const now = Date.now();
    if (st.boss === v) {
      st.bossUntil += CFG.bossSec * 1000;
      v.npc.label.say('👑 Thêm giờ làm đại ca!', 3);
      return;
    }
    if (st.boss) {
      const old = st.boss;
      endBoss();
      banner(`👑 ${v.name} cướp ngôi đại ca của ${old.name}!`);
      old.npc.label.say('Mất ghế rồi...', 3);
    } else banner(`👑 ${v.name} lên làm Đại Ca!`);
    if (v.guardRole) endGuard(v.id);
    st.boss = v;
    st.bossUntil = now + CFG.bossSec * 1000;
    const n = v.npc;
    v.lookBeforeRole = { ...n.char.look };
    setLook(n.char, { ...n.char.look, hat: 'crown', boss: true });
    n.label.setName(`👑 Đại ca ${v.name}`);
    n.isBoss = true;
    goThrone(n);
    sfx('bell');
    fireworks.burst(n.body.pos.x, 3, n.body.pos.z, 70);
    chatLine('Hệ thống', `${v.name} lên làm Đại Ca! Cả trại phải nịnh 👑`, 'gift');
    // gom đàn em (NPC gần nhất, kể cả đang trong phòng — tự tìm đường qua cửa / cầu thang)
    const pool = freeInmates({ npcOnly: true, level: null })
      .sort((a, b) => d2(a.body.pos, n.body.pos) - d2(b.body.pos, n.body.pos))
      .slice(0, Math.min(CFG.bossFollowers, ENTOURAGE_SLOTS.length));
    st.followers = pool.map((f, i) => {
      f.isFollower = true;
      setProp(f.char, ENTOURAGE_SLOTS[i].prop);
      return { n: f, slot: ENTOURAGE_SLOTS[i], tgt: null };
    });
    st.followT = 0;
  }

  function goThrone(n) {
    const t = world.throne;
    if (t.occupant && t.occupant !== n) t.occupant = null;
    npcs.command(n, { dest: { level: 0, x: t.approach.x, z: t.approach.z }, seat: t, mode: 'sit', stay: 9999 });
  }

  function endBoss() {
    const v = st.boss;
    if (!v) return;
    st.boss = null;
    for (const f of st.followers) {
      setProp(f.n.char, 'none');
      f.n.isFollower = false;
      if (f.n.char.root.parent) npcs.release(f.n);
    }
    st.followers = [];
    const n = v.npc;
    n.isBoss = false;
    if (world.throne.occupant === n) world.throne.occupant = null;
    if (n.char.root.parent) {
      npcs.release(n);
      setLook(n.char, { ...(v.lookBeforeRole ?? n.char.look), boss: false, hat: v.lookBeforeRole?.hat ?? 'none' });
      n.label.setName(v.star ? `⭐ ${v.name}` : v.name);
    }
  }

  function updateBoss(dt, now) {
    const v = st.boss;
    if (!v) return;
    const n = v.npc;
    if (now > st.bossUntil || !n.char.root.parent) {
      chatLine('Hệ thống', `${v.name} hết nhiệm kỳ đại ca.`, 'system');
      endBoss();
      return;
    }
    // làm xong lệnh khác thì về lại ghế
    if (!n.locked && !n.path.length && !n.seat) goThrone(n);
    // đàn em bám theo chỗ đứng quanh đại ca (đi bằng đường tìm lối của NPC, không đi xuyên tường)
    st.followers = st.followers.filter((f) => f.n.char.root.parent);
    st.followT -= dt;
    if (st.followT <= 0) {
      st.followT = 0.8;
      const pose = { x: n.body.pos.x, z: n.body.pos.z, ry: n.seat ? n.seat.ry : n.ry };
      const level = n.body.pos.y > 2 ? 1 : 0;
      for (const f of st.followers) {
        const tgt = slotWorld(pose, f.slot);
        const moved = !f.tgt || Math.hypot(tgt.x - f.tgt.x, tgt.z - f.tgt.z) > 0.7;
        if (!f.n.locked || moved) {
          f.tgt = tgt;
          npcs.command(f.n, { dest: { level, x: tgt.x, z: tgt.z }, mode: f.slot.mode, stay: 600, ry: tgt.ry });
        }
      }
    }
    st.flatterT -= dt;
    if (st.flatterT <= 0 && st.followers.length) {
      st.flatterT = range(R, 2.5, 4.5);
      const f = pick(R, st.followers);
      const line = lines('boss');
      f.n.label.say(line, 3);
      if (R() < 0.35) chatLine(f.n.name, line, 'npc');
      if (R() < 0.3) after(1.2, () => st.boss && st.boss.npc.label.say(lines('bossSelf'), 2.5));
    }
  }

  // ------------------------------------------------------------ 👮 CÁN BỘ
  function becomeGuard(v) {
    const now = Date.now();
    const g = st.guards.get(v.id);
    if (g) {
      g.until += CFG.guardSec * 1000;
      v.npc.label.say('👮 Gia hạn nhiệm vụ!', 3);
      return;
    }
    if (st.boss === v) endBoss();
    const n = v.npc;
    v.guardRole = true;
    v.lookBeforeRole = { ...n.char.look };
    setLook(n.char, { ...n.char.look, outfit: 'guard', hat: 'none', boss: false });
    n.label.setName(`👮 Cán bộ ${v.name}`);
    n.label.setKind('guard');
    n.role = 'guard';
    n.index = 100 + st.guards.size;
    npcs.release(n);
    st.guards.set(v.id, { v, until: now + CFG.guardSec * 1000 });
    banner(`👮 ${v.name} nhận chức Cán Bộ!`);
    chatLine('Hệ thống', `${v.name} được phong làm Cán Bộ — cả trại nghiêm!`, 'gift');
    sfx('bell');
    for (const f of freeInmates().filter((m) => d2(m.body.pos, n.body.pos) < 7).slice(0, 6)) salute(f, v);
  }

  function salute(f, v) {
    st.salutedAt.set(f, performance.now());
    npcs.command(f, { inPlace: true, mode: 'bow', stay: 2, ry: Math.atan2(v.npc.body.pos.x - f.body.pos.x, v.npc.body.pos.z - f.body.pos.z) });
    f.label.say(lines('salute'), 2.5);
  }

  function endGuard(id) {
    const g = st.guards.get(id);
    if (!g) return;
    st.guards.delete(id);
    const v = g.v;
    v.guardRole = false;
    const n = v.npc;
    if (!n.char.root.parent) return;
    n.role = 'inmate';
    setLook(n.char, { ...(v.lookBeforeRole ?? n.char.look) });
    n.label.setName(v.star ? `⭐ ${v.name}` : v.name);
    n.label.setKind('viewer');
    npcs.release(n);
  }

  function updateGuards(now) {
    for (const [id, g] of st.guards) {
      if (now > g.until || !g.v.npc.char.root.parent) {
        if (g.v.npc.char.root.parent) chatLine('Hệ thống', `${g.v.name} hết ca trực cán bộ.`, 'system');
        endGuard(id);
        continue;
      }
      const gp = g.v.npc.body.pos;
      for (const m of freeInmates()) {
        if (d2(m.body.pos, gp) > 2.3) continue;
        const last = st.salutedAt.get(m) ?? -1e9;
        if (performance.now() - last > 25000) salute(m, g.v);
      }
    }
  }

  // ------------------------------------------------------------ 🔒 biệt giam (luật ngầm)
  function jail(v) {
    if (v.jailed || st.boss === v || v.guardRole) return;
    const cell = pickJailCell(world.cells, st.jailOcc, 3);
    if (!cell) return;
    v.jailed = true;
    v.jailCell = cell;
    st.jailOcc.set(cell.id, (st.jailOcc.get(cell.id) ?? 0) + 1);
    const n = v.npc;
    const bed = cell.beds.find((b) => !b.occupant);
    if (bed) bed.occupant = n;
    npcs.command(n, {
      dest: { level: 1, cell },
      seat: bed ? { ...bed, approach: cell.inside, ref: bed } : undefined,
      mode: bed ? 'sleep' : 'idle',
      stay: 1e9,
      then: () => {
        if (v.jailed) world.setCellLocked(cell.id, true);
        n.label.say(lines('jailed'), 3);
      },
    });
    n.label.setKind('jailed');
  }

  function free(v) {
    if (!v.jailed) return;
    v.jailed = false;
    const cell = v.jailCell;
    v.jailCell = null;
    const left = Math.max(0, (st.jailOcc.get(cell.id) ?? 1) - 1);
    st.jailOcc.set(cell.id, left);
    world.setCellLocked(cell.id, false); // mở cửa cho ra
    if (left > 0) after(4, () => (st.jailOcc.get(cell.id) ?? 0) > 0 && world.setCellLocked(cell.id, true));
    npcs.release(v.npc);
    v.npc.label.setKind(spot.current?.id === v.id ? 'spot' : 'viewer');
    v.npc.label.say(lines('freed'), 3);
  }

  // ------------------------------------------------------------ 🐕 🐈 thú cưng + người thân (đi bộ tự do, không theo lịch trại)
  function spawnPet(kind, v) {
    const a = createAnimal(kind);
    const g = world.gate;
    a.root.position.set(g.x, 0, g.z);
    scene.add(a.root);
    const label = attachLabel(a, kind === 'dog' ? `🐕 Chó của ${v.name}` : `🐈 Mèo của ${v.name}`, 'npc');
    label.setHeight(kind === 'dog' ? 1.15 : 0.85);
    const body = { pos: { x: g.x, y: 0, z: g.z }, vy: 0, grounded: true, radius: 0.3, height: 0.8 };
    st.pets.push({ a, label, body, owner: v.npc, until: performance.now() + (kind === 'dog' ? 90 : 120) * 1000, kind, barkT: 2, ry: 0, side: R() < 0.5 ? -1 : 1 });
    banner(kind === 'dog' ? `🐕 ${v.name} gọi chó nghiệp vụ!` : `🐈 ${v.name} nhận nuôi mèo trại!`);
  }

  function updatePets(dt) {
    for (const p of st.pets.slice()) {
      if (performance.now() > p.until || !p.owner.char.root.parent) {
        scene.remove(p.a.root);
        p.label.dispose();
        st.pets.splice(st.pets.indexOf(p), 1);
        continue;
      }
      const o = p.owner.body.pos;
      const oy = p.owner.ry;
      const tx = o.x + Math.cos(oy) * 0.8 * p.side - Math.sin(oy) * 0.6;
      const tz = o.z - Math.sin(oy) * 0.8 * p.side - Math.cos(oy) * 0.6;
      const dx = tx - p.body.pos.x;
      const dz = tz - p.body.pos.z;
      const dist = Math.hypot(dx, dz);
      let vx = 0;
      let vz = 0;
      if (dist > 0.4) {
        const sp = Math.min(6.5, 1.5 + dist * 1.6);
        vx = (dx / dist) * sp;
        vz = (dz / dist) * sp;
        p.ry += Math.atan2(Math.sin(Math.atan2(vx, vz) - p.ry), Math.cos(Math.atan2(vx, vz) - p.ry)) * Math.min(1, dt * 10);
      }
      if (dist > 14) Object.assign(p.body.pos, { x: tx, y: p.owner.body.pos.y, z: tz }); // chủ lên lầu / đi xa → chạy theo
      stepBody(p.body, vx, vz, dt, world.collision, 18);
      p.a.root.position.set(p.body.pos.x, p.body.pos.y, p.body.pos.z);
      p.a.root.rotation.y = p.ry;
      animateAnimal(p.a, dt, Math.hypot(vx, vz));
      p.barkT -= dt;
      if (p.barkT <= 0) {
        p.barkT = range(R, 4, 8);
        p.label.say(p.kind === 'dog' ? pick(R, ['Gâu gâu!', 'Gâu!', 'Grrr...']) : pick(R, ['Meo~', 'Meo meo!', 'Rừ rừ...']), 2);
        if (p.kind === 'dog') {
          const scared = npcs.inmates.find((m) => m !== p.owner && !m.puppet && d2(m.body.pos, p.body.pos) < 2);
          if (scared) scared.label.say(lines('dogNear'), 2);
        }
      }
    }
  }

  function spawnVisitor(v) {
    const g = world.gate;
    const shirts = [0xe86fa0, 0x6fc2e8, 0x9ad17a, 0xf6d55c, 0xb48cf2];
    const a = makeActor(scene, { name: `Người nhà ${v.name}`, look: { outfit: 'civil', shirt: pick(R, shirts), hair: pick(R, ['black', 'gray', 'brown']), hat: 'none' }, kind: 'npc', x: g.x, z: g.z });
    setProp(a.char, 'basket');
    st.walkers.push({ a, v, phase: 'in', t: 0 });
    banner(`🧺 Người nhà tới thăm ${v.name}!`);
    chatLine('Hệ thống', `Có người nhà tới thăm nuôi ${v.name}`, 'gift');
    sfx('bell');
  }

  function updateWalkers(dt) {
    for (const w of st.walkers.slice()) {
      const a = w.a;
      const target = w.phase === 'out' ? world.gate : w.v.npc.body.pos;
      const dx = target.x - a.body.pos.x;
      const dz = target.z - a.body.pos.z;
      const dist = Math.hypot(dx, dz);
      let vx = 0;
      let vz = 0;
      if (w.phase === 'in' && (!w.v.npc.char.root.parent || w.v.npc.body.pos.y > 2)) w.phase = 'out'; // người được thăm đã rời / đang trên lầu
      if ((w.phase === 'in' && dist > 1.1) || (w.phase === 'out' && dist > 0.4)) {
        vx = (dx / dist) * 3.2;
        vz = (dz / dist) * 3.2;
        turnToward(a, Math.atan2(vx, vz), dt, 8);
        a.mode = 'walk';
      } else if (w.phase === 'in') {
        w.phase = 'talk';
        w.t = 5;
        const n = w.v.npc;
        npcs.command(n, { inPlace: true, mode: 'talk', stay: 6 });
        n.ry = Math.atan2(a.body.pos.x - n.body.pos.x, a.body.pos.z - n.body.pos.z);
        a.mode = 'talk';
        a.label.say(lines('visit'), 4);
      } else if (w.phase === 'talk') {
        turnToward(a, Math.atan2(w.v.npc.body.pos.x - a.body.pos.x, w.v.npc.body.pos.z - a.body.pos.z), dt, 6);
        w.t -= dt;
        if (w.t <= 0) {
          w.phase = 'out';
          setProp(a.char, 'none');
          setProp(w.v.npc.char, 'basket');
          addPoints(w.v, 10, '🧺');
          after(15, () => w.v.npc.char.root.parent && w.v.npc.char.propName === 'basket' && setProp(w.v.npc.char, 'none'));
        }
      } else {
        scene.remove(a.char.root);
        a.label.dispose();
        st.walkers.splice(st.walkers.indexOf(w), 1);
        continue;
      }
      stepBody(a.body, vx, vz, dt, world.collision, 18);
      a.speed = Math.hypot(vx, vz);
      animateCharacter(a.char, dt, { mode: a.speed > 0.1 ? 'walk' : a.mode, speed: a.speed });
      syncActor(a);
    }
  }

  // ------------------------------------------------------------ sự kiện cả trại
  function party(v) {
    banner(`🍜 ${v.name} khao cả trại mì tôm!`);
    chatLine('Hệ thống', `${v.name} mở tiệc mì tôm cho cả trại!`, 'gift');
    sfx('coin');
    const seats = world.seats.filter((s) => !s.occupant);
    const eaters = [v.npc, ...freeInmates().filter((n) => n !== v.npc)].slice(0, seats.length);
    eaters.forEach((n, i) => {
      const seat = seats.sort((a, b) => d2(a, n.body.pos) - d2(b, n.body.pos)).shift();
      if (!seat) return;
      if (n !== v.npc) npcs.release(n);
      npcs.command(n, {
        dest: { level: 0, x: seat.approach.x, z: seat.approach.z },
        seat,
        mode: 'eat',
        stay: 14,
        then: () => {
          setProp(n.char, 'bowl');
          if (R() < 0.25) n.label.say(lines('party', v.name), 3);
        },
        done: () => setProp(n.char, 'none'),
      });
      if (i === 0) addPoints(v, 5, '🍜');
    });
  }

  function karaoke(v) {
    const s = world.stage;
    const n = v.npc;
    banner(`🎤 ${v.name} lên sân khấu hát!`);
    chatLine('Hệ thống', `${v.name} hát karaoke tặng cả trại 🎤`, 'gift');
    npcs.release(n);
    npcs.command(n, {
      dest: { level: 0, x: s.x, z: s.z },
      mode: 'sing',
      stay: 15,
      ry: -Math.PI / 2,
      then: () => {
        setProp(n.char, 'mic');
        st.karaoke = { v, until: performance.now() + 15000, lineT: 0 };
      },
      done: () => {
        setProp(n.char, 'none');
        addPoints(v, 5, '🎤');
      },
    });
    const fans = freeInmates().filter((m) => m !== n).slice(0, 12);
    fans.forEach((m, i) => {
      const ang = Math.PI / 2 + (i / Math.max(1, fans.length - 1) - 0.5) * 2.4;
      const r = 2.6 + (i % 2) * 1.1;
      const x = Math.min(19, s.x + Math.cos(ang + Math.PI / 2) * r - 1.5);
      const z = s.z + Math.sin(ang + Math.PI / 2) * r;
      npcs.command(m, { dest: { level: 0, x, z }, mode: i % 3 === 0 ? 'clap' : 'cheer', stay: 13, ry: Math.atan2(s.x - x, s.z - z), then: () => R() < 0.3 && m.label.say(lines('cheer'), 2.5) });
    });
  }

  function armwrestle(v) {
    const n = v.npc;
    const opp = pick(R, freeInmates().filter((m) => m !== n)) ?? null;
    if (!opp) return false;
    const tables = world.tables.map((t, i) => ({ t, i })).sort((a, b) => d2(a.t, n.body.pos) - d2(b.t, n.body.pos));
    let pair = null;
    for (const { i } of tables) {
      const a = world.seats[i * 6 + 1];
      const b = world.seats[i * 6 + 4];
      if (a && b && !a.occupant && !b.occupant) {
        pair = [a, b];
        break;
      }
    }
    if (!pair) return false;
    banner(`💪 ${v.name} vật tay với ${opp.name}!`);
    npcs.release(n);
    npcs.release(opp);
    let seated = 0;
    const startDuel = () => {
      seated++;
      if (seated < 2) return;
      after(4.5, () => {
        const win = R() < 0.55;
        const winner = win ? n : opp;
        const loser = win ? opp : n;
        banner(`💪 ${winner.name} thắng vật tay!`);
        chatLine('Hệ thống', `💪 ${winner.name} vật ngã ${loser.name}!`, 'system');
        winner.label.say('Thắng rồi!!', 2.5);
        loser.label.say('Ui da...', 2.5);
        if (win) addPoints(v, 8, '💪');
        sfx(win ? 'swish' : 'miss');
      });
    };
    npcs.command(n, { dest: { level: 0, ...pair[0].approach }, seat: pair[0], mode: 'wrestle', stay: 7, then: startDuel });
    npcs.command(opp, { dest: { level: 0, ...pair[1].approach }, seat: pair[1], mode: 'wrestle', stay: 7, then: startDuel });
    return true;
  }

  function inspect(v) {
    banner(`🚨 KHÁM PHÒNG! (${v.name} báo cán bộ)`);
    chatLine('Hệ thống', '🚨 Còi báo động — cả trại xếp hàng!', 'system');
    sfx('bell');
    after(0.5, () => sfx('bell'));
    const spots = world.rollcallSpots;
    freeInmates({ level: null }).forEach((m, i) => {
      const p = spots[i % spots.length];
      npcs.command(m, { dest: { level: 0, ...p }, mode: 'idle', stay: 14, ry: -Math.PI / 2 });
    });
    const upper = world.cells.filter((c) => c.level === 1);
    npcs.guards.forEach((g, i) => {
      const c = pick(R, i % 2 ? upper : world.cells);
      npcs.command(g, { dest: { level: c.level, cell: c }, mode: 'idle', stay: 4, then: () => g.label.say('Khám phòng! Không có gì lạ.', 3) });
    });
    addPoints(v, 3, '🚨');
  }

  function flashmob(v) {
    banner(`🕺 FLASHMOB! (${v.name})`);
    sfx('coin');
    for (const m of [v.npc, ...freeInmates({ level: null })]) {
      if (m !== v.npc) npcs.release(m);
      npcs.command(m, { inPlace: true, mode: R() < 0.5 ? 'cheer' : 'exercise', stay: 10 });
    }
    addPoints(v, 3, '🕺');
  }

  function lightsout(v) {
    st.nightUntil = performance.now() + 15000;
    banner(`🌙 ${v.name} tắt đèn — cả trại ngủ gật!`);
    for (const m of freeInmates({ level: null })) {
      npcs.command(m, { inPlace: true, mode: 'bow', stay: 14, then: () => R() < 0.3 && m.label.say('Zzz...', 3) });
    }
    addPoints(v, 2, '🌙');
  }

  function pardon(v) {
    const n = v.npc;
    const g = world.gate;
    banner(`🎆 ${v.name} được ÂN XÁ!`);
    chatLine('Hệ thống', `🎆 ${v.name} cải tạo tốt, được tuyên dương tù nhân gương mẫu!`, 'gift');
    npcs.release(n);
    npcs.command(n, {
      dest: { level: 0, x: g.x, z: g.z - 0.6 },
      mode: 'cheer',
      stay: 6,
      ry: 0,
      then: () => {
        v.star = true;
        n.label.setName(st.boss === v ? `👑 Đại ca ${v.name}` : `⭐ ${v.name}`);
        n.label.say(lines('pardon'), 4);
        addPoints(v, 50, '🎆');
        sfx('swish');
        for (let i = 0; i < 4; i++) after(i * 0.45, () => fireworks.burst(g.x + range(R, -3, 3), range(R, 4, 6), g.z - range(R, 1, 3)));
        for (const m of freeInmates().filter((x) => d2(x.body.pos, n.body.pos) < 10).slice(0, 8)) {
          npcs.command(m, { inPlace: true, mode: 'clap', stay: 5, ry: Math.atan2(n.body.pos.x - m.body.pos.x, n.body.pos.z - m.body.pos.z) });
        }
      },
    });
  }

  // ------------------------------------------------------------ API
  /** Kích hoạt vai trò / sự kiện `id` cho người xem `v`. Trả false nếu không phải hành động của module này. */
  function trigger(id, v) {
    if (!defs[id]) return false;
    if (v.jailed) free(v);
    switch (id) {
      case 'boss': becomeBoss(v); break;
      case 'guard': becomeGuard(v); break;
      case 'party': party(v); break;
      case 'karaoke': karaoke(v); break;
      case 'armwrestle': if (!armwrestle(v)) v.npc.label.say('Hết bàn trống rồi!', 2); break;
      case 'dog': spawnPet('dog', v); break;
      case 'cat': spawnPet('cat', v); break;
      case 'visit': spawnVisitor(v); break;
      case 'inspect': inspect(v); break;
      case 'flashmob': flashmob(v); break;
      case 'lightsout': lightsout(v); break;
      case 'pardon': pardon(v); break;
      default: return false;
    }
    return true;
  }

  function update(dt) {
    const now = Date.now();
    const pnow = performance.now();
    for (const l of st.later.slice()) {
      if (pnow >= l.at) {
        st.later.splice(st.later.indexOf(l), 1);
        try {
          l.fn();
        } catch (e) {
          console.warn('[nhatu] hẹn giờ lỗi', e);
        }
      }
    }
    updateBoss(dt, now);
    updateGuards(now);
    updatePets(dt);
    updateWalkers(dt);
    fireworks.update(dt);
    if (st.karaoke) {
      const k = st.karaoke;
      if (pnow > k.until || !k.v.npc.char.root.parent) st.karaoke = null;
      else if ((k.lineT -= dt) <= 0) {
        k.lineT = 3;
        k.v.npc.label.say(lines('karaoke'), 2.8);
      }
    }
  }

  /** Luật ngầm: người xem im lặng quá CFG.jailIdleSec → nhốt biệt giam trên lầu (gọi mỗi giây). */
  function checkJail(viewers, now) {
    for (const v of viewers.values()) {
      if (v.jailed || st.boss === v || v.guardRole || spot.current?.id === v.id || spot.queue.some((q) => q.id === v.id)) continue;
      if (shouldJail(v.lastActive, now, CFG.jailIdleSec)) jail(v);
    }
  }

  /** Người xem bị gỡ khỏi trại → dọn vai trò / phòng giam. */
  function onViewerRemoved(v) {
    if (st.boss === v) endBoss();
    if (st.guards.has(v.id)) endGuard(v.id);
    if (v.jailed) {
      const c = v.jailCell;
      const left = Math.max(0, (st.jailOcc.get(c.id) ?? 1) - 1);
      st.jailOcc.set(c.id, left);
      if (!left) world.setCellLocked(c.id, false);
      v.jailed = false;
    }
  }

  function reset() {
    endBoss();
    for (const id of [...st.guards.keys()]) endGuard(id);
    for (const p of st.pets) {
      scene.remove(p.a.root);
      p.label.dispose();
    }
    st.pets = [];
    for (const w of st.walkers) {
      scene.remove(w.a.char.root);
      w.a.label.dispose();
    }
    st.walkers = [];
    st.jailOcc.clear();
    for (const c of world.cells) world.setCellLocked(c.id, false);
  }

  return {
    defs,
    trigger,
    update,
    free,
    checkJail,
    onViewerRemoved,
    reset,
    isNight: () => performance.now() < st.nightUntil,
    /** Thông tin cho HUD: đại ca + cán bộ hiện tại. */
    roles: () => ({
      boss: st.boss ? { name: st.boss.name, left: Math.max(0, (st.bossUntil - Date.now()) / 1000) } : null,
      guards: [...st.guards.values()].map((g) => ({ name: g.v.name, left: Math.max(0, (g.until - Date.now()) / 1000) })),
      jailed: [...st.jailOcc.values()].reduce((a, b) => a + b, 0),
    }),
    burst: (x, y, z) => fireworks.burst(x, y, z),
  };
}
