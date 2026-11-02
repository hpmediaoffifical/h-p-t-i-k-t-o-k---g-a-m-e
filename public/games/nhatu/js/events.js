/**
 * ⛓️ Nhà Tù Online — vai trò (Đại Ca, Cán Bộ), luật biệt giam và các sự kiện quà cho cả trại.
 * Mọi hành động ở đây được gán quà trong panel (ntGiftMap) hoặc thử bằng nút 🧪.
 */
import * as THREE from 'three';
import { setLook, setProp, createAnimal, animateAnimal, animateCharacter, disposeCharacter } from './character.js';
import { makeActor, syncActor, turnToward } from './npc.js';
import { attachLabel } from './labels.js';
import { stepBody } from './logic/physics.js';
import { pick, range } from './logic/rng.js';
import { ENTOURAGE_SLOTS, slotWorld, shouldJail, pickJailCell } from './logic/roles.js';
import { Fireworks, MessSystem, RainSystem, makeBanana, makeMouse, makeRope } from './effects.js';
import { findCatcher, pickReportTarget, pickTrashVictim, cleanPoints, mmss } from './logic/mischief.js';
import { tugShift } from './logic/live.js';

const R = Math.random;
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * @param {object} ctx {scene, world, npcs, DATA, CFG, viewers, chatLine, banner, sfx, addPoints, doAction, spot}
 */
export function createEvents(ctx) {
  const { scene, world, npcs, DATA, CFG, chatLine, banner, sfx, addPoints, spot, dirt, viewers, camera, flash } = ctx;
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
    jobs: new Map(), // id → {v, kind, until, t, team, busy, k} — Đầu Bếp / Tổ Trưởng / Y Tá
    later: [], // {at, fn}
    offenses: [], // {v, mess, at, caught, cleaned} — lần đi bậy gần đây (cho quà 📢 Tố cáo)
    offenders: new Set(), // người xem đang bị giam vì đi bậy (v.offense = {until, reason})
    trash: [], // {v, carrier, victim, bin, slot, phase, t, until, from, to, q0}
    pranks: [], // 😂 trò đùa đang chạy tới nạn nhân: {kind, v, actor, victim, phase, t}
    poses: [], // tư thế do sự kiện giữ (ngã vỏ chuối, hít đất): {n, kind, t, dur, x, y, z, ry}
    peels: [], // 🍌 vỏ chuối trên sàn
    mice: [], // 🐀 chuột đang chạy
    race: null, // 🏃 cuộc thi chạy đang diễn ra
    tug: null, // 🪢 kéo co theo PK
    rainUntil: 0,
    prankT: 0,
    cleanT: 0,
    smellT: 3,
  };
  const defs = Object.fromEntries((DATA.giftActions || []).map((a) => [a.id, a]));

  /** Phạm nhân "rảnh" để kéo vào sự kiện (không phải người đang có lượt, không bị nhốt, không đang bận). */
  function freeInmates({ npcOnly = false, level = 0, crowd = false } = {}) {
    const pnow = performance.now();
    return npcs.inmates.filter(
      (n) =>
        // crowd: sự kiện tập thể được giành cả người đang dở sự kiện tập thể khác (chạy đồng loạt, không phải chờ)
        (!n.locked || (crowd && n.crowdUntil > pnow)) &&
        !n.puppet &&
        !n.carried &&
        !n.isBoss &&
        !n.isFollower &&
        !n.jobRole &&
        n.role !== 'guard' &&
        !n.viewerRec?.jailed &&
        !(n.viewerRec && spot.current?.id === n.viewerRec.id) &&
        (!npcOnly || !n.viewer) &&
        (level === null || (n.body.pos.y > 2 ? 1 : 0) === level)
    );
  }
  const after = (sec, fn) => st.later.push({ at: performance.now() + sec * 1000, fn });
  const present = (v) => !!v?.npc?.char.root.parent;
  /** Thân nhân vật của người tặng nếu đang rảnh để góp mặt (không bị giam / không bị vác). */
  const selfOf = (v) => (v.jailed || v.npc.carried ? null : v.npc);

  /** Lệnh cho 1 người tham gia sự kiện tập thể (đánh dấu để sự kiện tập thể sau giành được ngay). */
  function crowdCommand(m, opts) {
    npcs.release(m);
    m.crowdUntil = performance.now() + ((opts.stay ?? 3) + 5) * 1000;
    npcs.command(m, opts);
  }

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
    if (st.jobs.has(v.id)) endJob(v.id);
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
    if (st.jobs.has(v.id)) endJob(v.id);
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

  // ------------------------------------------------------------ 🧑‍🍳 🧹 🩺 chức vụ trong trại
  const JOBS = {
    chef: { emoji: '🧑‍🍳', title: 'Đầu bếp', look: (l) => ({ ...l, outfit: 'chef', hat: 'chef', boss: false, armband: false }) },
    leader: { emoji: '🧹', title: 'Tổ trưởng', look: (l) => ({ ...l, armband: true, boss: false }) },
    nurse: { emoji: '🩺', title: 'Y tá', look: (l) => ({ ...l, outfit: 'nurse', hat: 'nurse', boss: false, armband: false }) },
  };

  /** Mỗi người chỉ giữ 1 chức vụ: nhận chức mới thì bỏ chức cũ. */
  function endAnyRole(v) {
    if (st.boss === v) endBoss();
    if (st.guards.has(v.id)) endGuard(v.id);
    if (st.jobs.has(v.id)) endJob(v.id);
  }

  function becomeJob(kind, v) {
    const J = JOBS[kind];
    const now = Date.now();
    const cur = st.jobs.get(v.id);
    if (cur && cur.kind === kind) {
      cur.until += CFG.jobSec * 1000;
      v.npc.label.say(`${J.emoji} Thêm giờ làm ${J.title.toLowerCase()}!`, 3);
      return;
    }
    endAnyRole(v);
    const n = v.npc;
    v.lookBeforeRole = { ...n.char.look };
    setLook(n.char, J.look(n.char.look));
    n.label.setName(`${J.emoji} ${J.title} ${v.name}`);
    n.label.setKind('job');
    n.jobRole = kind;
    npcs.release(n);
    const job = { v, kind, until: now + CFG.jobSec * 1000, t: 1, team: [], busy: new Set(), k: 0 };
    st.jobs.set(v.id, job);
    banner(`${J.emoji} ${v.name} nhận chức ${J.title}!`);
    chatLine('Hệ thống', `${v.name} được giao làm ${J.title} của trại!`, 'gift');
    sfx('bell');
    if (kind === 'leader') {
      for (let i = 0; i < 5; i++) dirt.spawn();
      const team = freeInmates({ npcOnly: true })
        .sort((a, b) => d2(a.body.pos, n.body.pos) - d2(b.body.pos, n.body.pos))
        .slice(0, 4);
      for (const m of team) {
        m.isFollower = true;
        setProp(m.char, 'mop');
      }
      job.team = team;
    }
  }

  function endJob(id) {
    const job = st.jobs.get(id);
    if (!job) return;
    st.jobs.delete(id);
    for (const m of job.team) {
      m.isFollower = false;
      setProp(m.char, 'none');
      if (m.char.root.parent) npcs.release(m);
    }
    const v = job.v;
    const n = v.npc;
    n.jobRole = null;
    if (!n.char.root.parent) return;
    setProp(n.char, 'none');
    setLook(n.char, { ...(v.lookBeforeRole ?? n.char.look), armband: false });
    n.label.setName(v.star ? `⭐ ${v.name}` : v.name);
    n.label.setKind('viewer');
    npcs.release(n);
  }

  function updateChef(job, dt) {
    const n = job.v.npc;
    const K = world.kitchen;
    const atStation = d2(n.body.pos, K.chef) < 0.7 && n.locked && !n.path.length;
    if (!n.locked) {
      // đi vòng qua đầu quầy gần nhất rồi mới vào sau quầy (đi chéo sẽ kẹt góc quầy)
      const sx = n.body.pos.x < K.chef.x ? -5.05 : -0.95;
      const via = n.body.pos.z < -9.2 ? [] : [{ x: sx, z: -8.1 }, { x: sx, z: K.chef.z }];
      npcs.command(n, { dest: { level: 0, x: K.chef.x, z: K.chef.z }, via, mode: 'serve', stay: 600, ry: K.chef.ry, then: () => setProp(n.char, 'bowl') });
      return;
    }
    if (!atStation) return;
    job.t -= dt;
    if (job.t > 0 || job.busy.size >= 3) return;
    job.t = currentMeal() ? 2.2 : 4.5;
    const c = freeInmates({ npcOnly: true }).filter((m) => d2(m.body.pos, K.chef) < 20 && m.char.propName === 'none')[0];
    if (!c) return;
    const sp = K.serveSpots[job.k++ % K.serveSpots.length];
    job.busy.add(c);
    npcs.command(c, {
      dest: { level: 0, ...sp },
      mode: 'idle',
      stay: 1.3,
      ry: Math.PI,
      then: () => {
        setProp(c.char, 'bowl');
        n.label.say(lines('chef', c.name), 2.5);
      },
      done: () => {
        job.busy.delete(c);
        addPoints(job.v, 1, '🍚');
        const seat = world.seats.filter((x) => !x.occupant).sort((a, b) => d2(a, c.body.pos) - d2(b, c.body.pos))[0];
        if (!seat) return setProp(c.char, 'none');
        npcs.command(c, { dest: { level: 0, ...seat.approach }, seat, mode: 'eat', stay: 8, done: () => setProp(c.char, 'none') });
      },
    });
  }

  function updateLeader(job, dt) {
    const n = job.v.npc;
    job.team = job.team.filter((m) => m.char.root.parent);
    if (dirt.spots.length < 3) dirt.spawn();
    for (const m of job.team) {
      if (m.locked) continue;
      ctx.doAction(m, 'mop', null);
      setProp(m.char, 'mop');
    }
    job.t -= dt;
    if (job.t > 0 || n.locked) return;
    job.t = 6;
    const m = pick(R, job.team);
    if (!m) return;
    npcs.command(n, {
      dest: { level: 0, x: m.body.pos.x + 1.1, z: m.body.pos.z + 0.4 },
      mode: 'talk',
      stay: 3,
      ry: Math.atan2(-1.1, -0.4),
      then: () => {
        n.label.say(lines('leader'), 2.5);
        addPoints(job.v, 1, '🧹');
      },
    });
  }

  function updateNurse(job, dt) {
    const n = job.v.npc;
    job.t -= dt;
    if (job.t > 0 || n.locked) return;
    job.t = 7;
    const p = pick(R, freeInmates().filter((m) => m !== n && d2(m.body.pos, n.body.pos) < 22));
    if (!p) return;
    const dx = n.body.pos.x - p.body.pos.x;
    const dz = n.body.pos.z - p.body.pos.z;
    const dl = Math.hypot(dx, dz) || 1;
    npcs.command(p, { inPlace: true, mode: 'idle', stay: 9 }); // bệnh nhân đứng chờ y tá tới
    npcs.command(n, {
      dest: { level: p.body.pos.y > 2 ? 1 : 0, x: p.body.pos.x + (dx / dl) * 0.9, z: p.body.pos.z + (dz / dl) * 0.9 },
      mode: 'serve',
      stay: 3,
      ry: Math.atan2(-dx, -dz),
      then: () => {
        setProp(n.char, 'cup');
        n.label.say(lines('nurse'), 2.5);
        p.faceActor = n;
        after(1.2, () => p.char.root.parent && p.label.say(lines('patient'), 2.5));
        addPoints(job.v, 1, '🩺');
      },
      done: () => setProp(n.char, 'none'),
    });
  }

  function currentMeal() {
    return npcs.phaseKey === 'meal';
  }

  function updateJobs(dt, now) {
    for (const [id, job] of st.jobs) {
      if (now > job.until || !job.v.npc.char.root.parent) {
        if (job.v.npc.char.root.parent) chatLine('Hệ thống', `${job.v.name} hết ca ${JOBS[job.kind].title.toLowerCase()}.`, 'system');
        endJob(id);
        continue;
      }
      if (job.kind === 'chef') updateChef(job, dt);
      else if (job.kind === 'leader') updateLeader(job, dt);
      else updateNurse(job, dt);
    }
  }

  // ------------------------------------------------------------ 🔒 biệt giam (luật ngầm)
  /**
   * Nhốt vào phòng trên lầu. offense = {sec, reason} → án đi bậy có hạn: bình luận / tương tác KHÔNG được thả,
   * chỉ hết hạn hoặc quà (🔓 Bảo lãnh, quà cần ra ngoài làm) — ra tù vẫn phải dọn bãi của mình.
   * Không offense = luật ngầm im lặng (tương tác lại là được thả).
   */
  function jail(v, offense = null) {
    if (v.jailed) {
      if (offense && !v.offense) startOffense(v, offense); // đang biệt giam vì im lặng → thành án đi bậy
      return;
    }
    if (offense) {
      if (st.boss === v) endBoss();
      if (v.guardRole) endGuard(v.id);
      if (st.jobs.has(v.id)) endJob(v.id);
    } else if (st.boss === v || v.guardRole || st.jobs.has(v.id)) return;
    const cell = pickJailCell(world.cells, st.jailOcc, 3);
    if (!cell) return;
    abortTrashFor(v.npc);
    v.jailed = true;
    v.jailCell = cell;
    st.jailOcc.set(cell.id, (st.jailOcc.get(cell.id) ?? 0) + 1);
    if (offense) startOffense(v, offense);
    holdInCell(v, true);
    v.npc.label.setKind('jailed');
  }

  /** Đưa / giữ người đang bị giam ở giường trong phòng giam. */
  function holdInCell(v, announce = false) {
    const n = v.npc;
    const cell = v.jailCell;
    const bed = cell.beds.find((b) => !b.occupant || b.occupant === n);
    if (bed) bed.occupant = n;
    npcs.command(n, {
      dest: { level: 1, cell },
      seat: bed ? { ...bed, approach: cell.inside, ref: bed } : undefined,
      mode: bed ? 'sleep' : 'idle',
      stay: 1e9,
      then: () => {
        if (v.jailed) world.setCellLocked(cell.id, true);
        if (announce) n.label.say(lines(v.offense ? 'offenseJailed' : 'jailed'), 3);
      },
    });
  }

  function startOffense(v, { sec, reason }) {
    v.offense = { until: Date.now() + sec * 1000, reason };
    st.offenders.add(v);
  }

  function free(v, { force = false } = {}) {
    if (!v.jailed) return;
    if (v.offense && !force) return; // án đi bậy: chỉ hết hạn / quà mới ra
    if (v.offense) {
      v.offense = null;
      st.offenders.delete(v);
      v.npc.label.setBadge('');
    }
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
  const MAX_PETS = 6; // quà gọi thú dồn dập: con cũ nhất về chuồng sớm để nhường chỗ (quà vẫn có thú mới)
  const MAX_WALKERS = 6;

  function spawnPet(kind, v) {
    if (st.pets.length >= MAX_PETS) st.pets.reduce((a, b) => (a.until < b.until ? a : b)).until = 0;
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
    const going = st.walkers.filter((w) => w.phase !== 'out');
    if (st.walkers.length >= MAX_WALKERS && going.length) going[0].phase = 'out'; // người thăm cũ nhất ra về
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
        disposeCharacter(a.char);
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
    const me = selfOf(v);
    const eaters = [...(me ? [me] : []), ...freeInmates({ crowd: true }).filter((n) => n !== me)].slice(0, seats.length);
    eaters.forEach((n, i) => {
      const seat = seats.sort((a, b) => d2(a, n.body.pos) - d2(b, n.body.pos)).shift();
      if (!seat) return;
      npcs.release(n);
      if (n !== me) n.crowdUntil = performance.now() + 14000;
      npcs.command(n, {
        dest: { level: 0, x: seat.approach.x, z: seat.approach.z },
        seat,
        mode: 'eat',
        stay: 8,
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
      stay: 10,
      ry: -Math.PI / 2,
      then: () => {
        setProp(n.char, 'mic');
        st.karaoke = { v, until: performance.now() + 10000, lineT: 0 };
      },
      done: () => {
        setProp(n.char, 'none');
        addPoints(v, 5, '🎤');
      },
    });
    const fans = freeInmates({ crowd: true }).filter((m) => m !== n).slice(0, 12);
    fans.forEach((m, i) => {
      const ang = Math.PI / 2 + (i / Math.max(1, fans.length - 1) - 0.5) * 2.4;
      const r = 2.6 + (i % 2) * 1.1;
      const x = Math.min(19, s.x + Math.cos(ang + Math.PI / 2) * r - 1.5);
      const z = s.z + Math.sin(ang + Math.PI / 2) * r;
      crowdCommand(m, { dest: { level: 0, x, z }, mode: i % 3 === 0 ? 'clap' : 'cheer', stay: 9, ry: Math.atan2(s.x - x, s.z - z), then: () => R() < 0.3 && m.label.say(lines('cheer'), 2.5) });
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
        // luật chung: thua là vào thùng rác
        after(1.2, () => startTrash(winner, loser, { reason: `💪 ${winner.name} thắng vật tay — vác ${loser.name} ném vào thùng rác!` }));
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
    freeInmates({ level: null, crowd: true }).forEach((m, i) => {
      const p = spots[i % spots.length];
      crowdCommand(m, { dest: { level: 0, ...p }, mode: 'idle', stay: 8, ry: -Math.PI / 2 });
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
    const me = selfOf(v);
    for (const m of [...(me ? [me] : []), ...freeInmates({ level: null, crowd: true })]) {
      crowdCommand(m, { inPlace: true, mode: R() < 0.5 ? 'cheer' : 'exercise', stay: 6 });
    }
    addPoints(v, 3, '🕺');
  }

  function lightsout(v) {
    st.nightUntil = performance.now() + 8000;
    banner(`🌙 ${v.name} tắt đèn — cả trại ngủ gật!`);
    for (const m of freeInmates({ level: null, crowd: true })) {
      crowdCommand(m, { inPlace: true, mode: 'bow', stay: 7, then: () => R() < 0.3 && m.label.say('Zzz...', 3) });
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

  // ------------------------------------------------------------ 💩 💦 đi bậy · 📢 tố cáo · 🔓 bảo lãnh · 🧼 dọn vệ sinh
  const messes = new MessSystem(scene, 14);
  const guardsNow = () => npcs.guards.concat([...st.guards.values()].map((g) => g.v.npc));
  const messDest = (m) => (m.cell ? { level: m.cell.level, cell: m.cell, x: m.x, z: m.z } : { level: m.y > 2 ? 1 : 0, x: m.x, z: m.z });
  const isClaimed = (m) => !!m.claimed && performance.now() - m.claimedAt < 20000 && !!m.claimed.char.root.parent;
  const offenseName = (kind) => (kind === 'poop' ? 'đi bậy' : 'tè bậy');

  function mischief(kind, v) {
    const n = v.npc;
    const poop = kind === 'poop';
    const act = poop ? 'squat' : 'pee';
    const stay = poop ? 3.5 : 3;
    const start = () => {
      const fx = Math.sin(n.ry);
      const fz = Math.cos(n.ry);
      const p = n.body.pos;
      // 💩 ngồi xổm quay mặt vào tường → bãi phía sau; 💦 đứng quay vào tường → vũng phía trước
      const mess = poop ? messes.add('poop', p.x - fx * 0.32, p.y, p.z - fz * 0.32, v, stay) : messes.add('pee', p.x + fx * 0.5, p.y, p.z + fz * 0.5, v, stay);
      mess.cell = world.cellAt(mess.x, mess.y + 0.5, mess.z);
      n.label.say(lines(poop ? 'poop' : 'pee'), stay);
      sfx('pop');
      const rec = { v, mess, at: Date.now(), caught: false, cleaned: false };
      st.offenses.push(rec);
      if (st.offenses.length > 40) st.offenses.shift();
      if (v.jailed) return; // làm bậy ngay trong phòng giam
      const g = findCatcher(guardsNow().filter((x) => x !== n), p);
      if (g) {
        rec.caught = true;
        after(stay * 0.6, () => {
          if (!present(v)) return;
          g.label.say(lines('caught', v.name), 3);
          chatLine(g.name, `❗ Bắt quả tang ${v.name} ${offenseName(kind)}!`, 'guard');
          n.label.say(lines('caughtSelf'), 2.5);
          sfx('bell');
          if (!g.viewerRec) {
            npcs.release(g);
            npcs.command(g, { dest: { level: p.y > 2 ? 1 : 0, x: p.x + 0.9, z: p.z }, mode: 'talk', stay: 2, then: () => (g.faceActor = n) });
          }
          after(1.2, () => present(v) && !v.jailed && arrest(v, kind));
        });
      } else {
        after(stay, () => {
          for (const m of freeInmates().filter((x) => x !== n && d2(x.body.pos, p) < 5).slice(0, 3)) m.label.say(lines('smell'), 2.5);
        });
      }
    };
    if (v.jailed) {
      // đang bị nhốt: làm ngay trong phòng, xong lại về giường
      npcs.command(n, { inPlace: true, mode: act, stay, then: start, done: () => v.jailed && holdInCell(v) });
      return;
    }
    npcs.release(n);
    const near = world.mischiefSpots.slice().sort((a, b) => d2(a, n.body.pos) - d2(b, n.body.pos)).slice(0, 4);
    const sp = pick(R, near);
    npcs.command(n, { dest: { level: 0, x: sp.x, z: sp.z }, mode: act, stay, ry: sp.ry, then: start, done: () => n.label.say(lines('relief'), 2) });
  }

  function arrest(v, kind) {
    jail(v, { sec: CFG.offenseJailSec, reason: offenseName(kind) });
    if (!v.offense) return; // hết phòng giam trống
    banner(`🚔 ${v.name} bị giam ${CFG.offenseJailSec} giây vì ${offenseName(kind)}!`);
    chatLine('Hệ thống', `🔒 ${v.name} bị giam ${CFG.offenseJailSec} giây — ra tù phải tự dọn vệ sinh!`, 'system');
  }

  /** Ra tù (mãn hạn / được bảo lãnh / tặng quà cần ra ngoài) — bãi của mình vẫn phải tự dọn. */
  function releaseOffender(v, how) {
    if (!v.offense) return;
    free(v, { force: true });
    const left = messes.items.filter((m) => m.owner === v).length;
    if (left) {
      v.mustClean = true;
      v.npc.label.setBadge('🧹');
      v.npc.label.say(lines('mustClean'), 3);
      chatLine('Hệ thống', `${how} ${v.name} ra tù — phải đi dọn ${left} bãi bẩn của mình!`, 'system');
    } else chatLine('Hệ thống', `${how} ${v.name} ra tù (bãi đã có người dọn giúp).`, 'system');
  }

  function report(v) {
    const me = selfOf(v);
    if (me && !me.locked) npcs.command(me, { inPlace: true, mode: 'talk', stay: 2 });
    v.npc.label.say(lines('report'), 2.5);
    const rec = pickReportTarget(st.offenses, Date.now(), (x) => x !== v && present(x) && !x.jailed);
    if (!rec) {
      banner(`📢 ${v.name} đi tố cáo… nhưng trại đang sạch sẽ!`);
      addPoints(v, 1, '📢');
      return;
    }
    rec.caught = true;
    const off = rec.v;
    banner(`📢 ${v.name} tố cáo ${off.name} ${offenseName(rec.mess.kind)}!`);
    chatLine('Hệ thống', `📢 ${v.name} báo cán bộ: ${off.name} làm bậy!`, 'gift');
    addPoints(v, 5, '📢');
    const p = off.npc.body.pos;
    const g = npcs.guards.slice().sort((a, b) => d2(a.body.pos, p) - d2(b.body.pos, p))[0];
    if (!g) return arrest(off, rec.mess.kind);
    npcs.release(g);
    npcs.command(g, {
      dest: { level: p.y > 2 ? 1 : 0, x: p.x + 0.9, z: p.z + 0.3 },
      mode: 'talk',
      stay: 1.5,
      then: () => {
        g.faceActor = off.npc;
        g.label.say(lines('caught', off.name), 2.5);
        if (present(off) && !off.jailed) arrest(off, rec.mess.kind);
      },
    });
  }

  function bail(v) {
    const target = v.offense ? v : [...st.offenders].filter(present).sort((a, b) => a.offense.until - b.offense.until).pop();
    if (!target) {
      v.npc.label.say('Trại chưa ai bị giam!', 2);
      addPoints(v, 1, '🔓');
      return;
    }
    banner(target === v ? `🔓 ${v.name} nộp tiền bảo lãnh ra tù!` : `🔓 ${v.name} bảo lãnh ${target.name} ra tù!`);
    if (target !== v) addPoints(v, 8, '🔓');
    releaseOffender(target, '🔓');
  }

  /** Cho `n` (của người xem `v`) đi dọn bãi `m`. */
  function goClean(n, m, v) {
    m.claimed = n;
    m.claimedAt = performance.now();
    npcs.release(n);
    npcs.command(n, {
      dest: messDest(m),
      mode: 'mop',
      stay: 2.5,
      then: () => {
        setProp(n.char, 'mop');
        sfx('scrub');
      },
      done: () => {
        setProp(n.char, 'none');
        cleanMess(m, v);
      },
    });
  }

  /** Dọn xong bãi `m` (v = người dọn, có thể null). Điểm cống hiến: dọn giúp người khác > dọn bãi của mình. */
  function cleanMess(m, v) {
    if (!messes.items.includes(m)) return false;
    messes.remove(m);
    const rec = st.offenses.find((o) => o.mess === m);
    if (rec) rec.cleaned = true;
    if (!v) return true;
    const owner = m.owner;
    const pts = cleanPoints(v.id, owner?.id);
    addPoints(v, pts, '🧼 Cống hiến');
    if (owner === v) chatLine('Hệ thống', `🧹 ${v.name} đã dọn sạch bãi của mình (+${pts})`, 'system');
    else chatLine('Hệ thống', owner ? `🧼 ${v.name} dọn giúp bãi của ${owner.name} — cống hiến +${pts}!` : `🧼 ${v.name} dọn vệ sinh trại — cống hiến +${pts}!`, 'gift');
    sfx('swish');
    return true;
  }

  /** Lệnh "Lau sàn" của người xem: còn bãi bẩn thì đi dọn bãi (cống hiến cao) — true = đã nhận việc. */
  function cleanJob(n, v) {
    let best = null;
    let bd = Infinity;
    for (const m of messes.items) {
      if (isClaimed(m)) continue;
      const d = d2(m, n.body.pos) + Math.abs(m.y - n.body.pos.y) * 6;
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    if (!best) return false;
    goClean(n, best, v);
    return true;
  }

  /** Ra tù rồi thì tự đi dọn bãi của mình (chạy 2 lần/giây). */
  function updateCleaners() {
    for (const v of viewers.values()) {
      if (!v.mustClean) continue;
      const n = v.npc;
      const own = messes.items.filter((m) => m.owner === v);
      if (!own.length) {
        v.mustClean = false;
        n.label.setBadge('');
        n.label.say(lines('cleanDone'), 2.5);
        continue;
      }
      if (v.jailed || n.locked || n.puppet || n.carried || n.isBoss || n.jobRole || v.guardRole) continue;
      const m = own.find((x) => !isClaimed(x));
      if (m) goClean(n, m, v);
    }
  }

  function updateOffenders(now) {
    for (const v of st.offenders) {
      if (!present(v)) {
        st.offenders.delete(v);
        continue;
      }
      const left = (v.offense.until - now) / 1000;
      if (left <= 0) releaseOffender(v, '⏰ Mãn hạn —');
      else v.npc.label.setBadge(`⏱${mmss(left)}`);
    }
  }

  // ------------------------------------------------------------ 🗑️ vác người ném vào thùng rác
  const UP = new THREE.Vector3(0, 1, 0);
  const tv = new THREE.Vector3();
  const tq = new THREE.Quaternion();

  const busyTrash = (m) => st.trash.some((j) => j.victim === m || j.carrier === m);

  /** Quà 🗑️: người tặng (hoặc đàn em làm hộ) vác 1 bạn tù ném vào thùng. Combo (power 2–3) → ném 2–3 người cùng lúc. */
  function trash(v, power = 1) {
    let done = 0;
    for (let i = 0; i < Math.min(3, power); i++) {
      let carrier = i === 0 ? selfOf(v) : null;
      if (!carrier || carrier.isBoss || carrier.puppet || busyTrash(carrier)) carrier = pick(R, freeInmates({ npcOnly: true, crowd: true }).filter((m) => !busyTrash(m))); // bị giam / bận → đàn em làm hộ
      if (!carrier) break;
      // crowd: quà cá nhân được kéo người ra khỏi sự kiện tập thể đang chạy (mưa, flashmob…)
      const victim = pickTrashVictim(freeInmates({ crowd: true }).filter((m) => m !== carrier && !busyTrash(m)), v.id, R);
      if (!victim) break;
      const proxy = carrier !== v.npc;
      if (startTrash(carrier, victim, { reason: proxy ? `🗑️ Đàn em của ${v.name} vác ${victim.name} ném vào thùng rác!` : `🗑️ ${v.name} vác ${victim.name} ném vào thùng rác!` })) done++;
    }
    if (!done) return v.npc.label.say('Không bắt được ai!', 2);
    addPoints(v, 2 * done, '🗑️');
  }

  /**
   * Người thắng (`carrier`) vác người thua (`victim`) ném vào thùng rác — dùng chung cho quà 🗑️, vật tay, thi chạy, kéo co PK.
   * Luật chung mọi trò thi đấu: ai thua là vào thùng rác.
   */
  function startTrash(carrier, victim, { reason = '' } = {}) {
    if (!carrier?.char.root.parent || !victim?.char.root.parent || carrier === victim) return false;
    abortTrashFor(carrier);
    abortTrashFor(victim);
    endPoseFor(carrier);
    endPoseFor(victim);
    const bins = world.bins.slice().sort((a, b) => d2(a, victim.body.pos) - d2(b, victim.body.pos));
    let bin = bins.find((b) => b.used.includes(null)) ?? bins[0];
    if (!bin.used.includes(null)) {
      // thùng đầy → người kẹt lâu nhất được ra sớm nhường chỗ
      const old = st.trash.filter((j) => j.bin === bin && j.phase === 'stuck').sort((a, b) => a.until - b.until)[0];
      if (old) endTrash(old, 'out');
    }
    const slot = bin.used.indexOf(null);
    if (slot < 0) return false;
    bin.used[slot] = victim;
    npcs.release(carrier);
    npcs.puppetize(victim);
    victim.puppetFace = Math.atan2(carrier.body.pos.x - victim.body.pos.x, carrier.body.pos.z - victim.body.pos.z);
    victim.label.say(lines('trashVictim'), 2);
    const job = { carrier, victim, bin, slot, phase: 'approach', t: 0, until: 0, at: performance.now() };
    st.trash.push(job);
    const vp = victim.body.pos;
    const dx = carrier.body.pos.x - vp.x;
    const dz = carrier.body.pos.z - vp.z;
    const dl = Math.hypot(dx, dz) || 1;
    npcs.command(carrier, { dest: { level: 0, x: vp.x + (dx / dl) * 0.75, z: vp.z + (dz / dl) * 0.75 }, mode: 'idle', stay: 0.3, then: () => grab(job) });
    if (reason) banner(reason);
    sfx('pop');
    return true;
  }

  const trashAlive = (j) => j.victim.char.root.parent && j.carrier.char.root.parent;

  function grab(job) {
    if (job.phase !== 'approach') return;
    if (!trashAlive(job)) return endTrash(job, 'drop');
    job.phase = 'carry';
    job.victim.carried = true;
    job.victim.animMode = 'kick';
    job.carrier.label.say(lines('trashGrab'), 2);
    const b = job.bin;
    npcs.command(job.carrier, { dest: { level: 0, x: b.approach.x, z: b.approach.z }, mode: 'idle', stay: 0.5, ry: 0, then: () => throwIn(job) });
    job.carrier.animMode = 'carry';
  }

  function throwIn(job) {
    if (job.phase !== 'carry') return;
    job.phase = 'fly';
    job.t = 0;
    job.carrier.animMode = null;
    job.carrier.mode = 'shoot';
    job.from = job.victim.char.root.position.clone();
    job.q0 = job.victim.char.root.quaternion.clone();
    const s = job.bin.slots[job.slot];
    // đầu (to hơn đáy thùng) nằm ở phần miệng rộng, thân + chân chổng lên khỏi miệng thùng
    job.to = new THREE.Vector3(job.bin.x + s.dx, job.bin.rim + 0.85, job.bin.z + s.dz);
    job.q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, R() * Math.PI * 2, 0)); // cắm đầu, chân chổng lên
    sfx('jump');
  }

  function startStuck(job) {
    job.phase = 'stuck';
    job.stuckAt = performance.now();
    job.until = job.stuckAt + CFG.trashSec * 1000;
    Object.assign(job.victim.body.pos, { x: job.to.x, y: 0, z: job.to.z }); // camera + bảng tên bám đúng chỗ thùng
    job.victim.label.setHeight(0.5);
    job.victim.label.say(lines('trashStuck'), 3);
    chatLine('Hệ thống', `🗑️ ${job.victim.name} bị kẹt trong thùng rác ${CFG.trashSec} giây! 😂`, 'gift');
    sfx('bounce');
    laughAt(job.to, [job.victim, job.carrier]);
    job.carrier.label.say(lines('laugh'), 2);
  }

  /** Người xung quanh ôm bụng cười haha. */
  function laughAt(pos, except = []) {
    const fans = freeInmates({ crowd: true }).filter((m) => !except.includes(m) && d2(m.body.pos, pos) < 10).slice(0, 8);
    for (const m of fans) {
      crowdCommand(m, {
        inPlace: true,
        mode: 'laugh',
        stay: 3,
        ry: Math.atan2(pos.x - m.body.pos.x, pos.z - m.body.pos.z),
        then: () => R() < 0.7 && m.label.say(lines('laugh'), 2),
      });
    }
  }

  /** Kết thúc 1 vụ thùng rác. how: 'out' (hết giờ, chui ra) | 'drop' (bị huỷ giữa chừng). */
  function endTrash(job, how) {
    const i = st.trash.indexOf(job);
    if (i >= 0) st.trash.splice(i, 1);
    if (job.bin.used[job.slot] === job.victim) job.bin.used[job.slot] = null;
    const n = job.victim;
    if (job.carrier.animMode === 'carry') job.carrier.animMode = null;
    if (how === 'drop' && (job.phase === 'approach' || job.phase === 'carry') && job.carrier.char.root.parent) npcs.release(job.carrier); // khỏi đi tiếp tới chỗ trống
    if (!n.char.root.parent) return;
    n.carried = false;
    n.animMode = null;
    npcs.unpuppet(n);
    n.char.root.quaternion.identity();
    n.label.setHeight(1.9);
    n.label.setBadge('');
    const out = how === 'out' ? { x: job.bin.approach.x + (job.slot - 1) * 0.6, z: job.bin.approach.z } : { x: job.carrier.body.pos.x + 0.6, z: job.carrier.body.pos.z };
    Object.assign(n.body.pos, { x: out.x, y: 0, z: out.z });
    n.body.vy = 0;
    n.body.grounded = true;
    n.ry = Math.PI;
    if (how === 'out') n.label.say(lines('trashOut'), 2.5);
  }

  function abortTrashFor(n) {
    for (const j of st.trash.slice()) if (j.victim === n || j.carrier === n) endTrash(j, 'drop');
  }

  function updateTrash(dt) {
    const pnow = performance.now();
    for (const j of st.trash.slice()) {
      if (!trashAlive(j) && j.phase !== 'stuck') {
        endTrash(j, 'drop');
        continue;
      }
      const root = j.victim.char.root;
      if (j.phase === 'approach') {
        // tới gần là vác luôn (người khác chen giữa có thể làm không bao giờ đứng đúng điểm hẹn)
        if (d2(j.carrier.body.pos, j.victim.body.pos) < 1.15 && Math.abs(j.carrier.body.pos.y - j.victim.body.pos.y) < 1) grab(j);
      } else if (j.phase === 'carry') {
        if (j.carrier.animMode !== 'carry') {
          endTrash(j, 'drop'); // người vác bị gọi đi làm việc khác giữa đường
          continue;
        }
        // nằm ngang trên đầu người vác, vuông góc hướng đi
        const c = j.carrier;
        tv.set(Math.cos(c.ry), 0, -Math.sin(c.ry));
        tq.setFromUnitVectors(UP, tv);
        root.quaternion.copy(tq);
        root.position.set(c.body.pos.x - tv.x * 0.8, c.body.pos.y + 1.95, c.body.pos.z - tv.z * 0.8);
        Object.assign(j.victim.body.pos, { x: c.body.pos.x, y: c.body.pos.y, z: c.body.pos.z });
      } else if (j.phase === 'fly') {
        j.t += dt / 0.6;
        const k = Math.min(1, j.t);
        root.position.lerpVectors(j.from, j.to, k);
        root.position.y += Math.sin(Math.PI * k) * 0.9;
        root.quaternion.slerpQuaternions(j.q0, j.q1, k);
        if (k >= 1) startStuck(j);
      } else if (j.phase === 'stuck') {
        if (!j.victim.char.root.parent) {
          endTrash(j, 'drop');
          continue;
        }
        root.position.copy(j.to);
        root.quaternion.copy(j.q1);
        const left = (j.until - pnow) / 1000;
        j.victim.label.setBadge(`🗑️${mmss(left)}`);
        if (left <= 0) endTrash(j, 'out');
      }
    }
  }

  // ------------------------------------------------------------ 📸 chụp ảnh tập thể · 🧼 tổng vệ sinh · 🧧 lì xì
  function photo(v, power = 1) {
    banner(v ? `📸 ${v.name} chụp ảnh tập thể — cười lên nào!` : '📸 Chụp ảnh tập thể — cười lên nào!');
    const me = v ? selfOf(v) : null;
    const c = (me ?? v?.npc ?? { body: { pos: { x: 4, y: 0, z: 4 } } }).body.pos;
    const crowd = [...(me ? [me] : []), ...freeInmates({ crowd: true, level: null }).filter((m) => m !== me && d2(m.body.pos, c) < 14)].slice(0, 24);
    for (const m of crowd) {
      const ry = camera ? Math.atan2(camera.position.x - m.body.pos.x, camera.position.z - m.body.pos.z) : 0;
      crowdCommand(m, { inPlace: true, mode: R() < 0.6 ? 'pose' : 'cheer', stay: 3.5, ry });
    }
    after(2.4, () => {
      flash?.();
      sfx('swish');
      for (let k = 0; k < power - 1; k++) after(0.3 + k * 0.4, () => fireworks.burst(c.x + range(R, -3, 3), range(R, 4, 6), c.z + range(R, -3, 3)));
    });
    if (v) addPoints(v, 3, '📸');
  }

  function cleanupAll(v) {
    banner(`🧼 ${v.name} phát động TỔNG VỆ SINH!`);
    chatLine('Hệ thống', `🧼 Tổng vệ sinh — cả trại cùng dọn!`, 'gift');
    const workers = freeInmates({ crowd: true, level: null });
    const take = (pos) => {
      let best = -1;
      let bd = Infinity;
      workers.forEach((w, i) => {
        const d = d2(w.body.pos, pos);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return best >= 0 ? workers.splice(best, 1)[0] : null;
    };
    for (const m of messes.items.filter((x) => !isClaimed(x))) {
      const w = take(m);
      if (!w) break;
      m.claimed = w;
      m.claimedAt = performance.now();
      crowdCommand(w, {
        dest: messDest(m),
        mode: 'mop',
        stay: 2.5,
        then: () => setProp(w.char, 'mop'),
        done: () => {
          setProp(w.char, 'none');
          if (cleanMess(m, w.viewerRec ?? null) && !w.viewerRec) addPoints(v, 2, '🧼');
        },
      });
    }
    for (const d of dirt.spots.filter((x) => !x.claimed)) {
      const w = take(d);
      if (!w) break;
      d.claimed = w;
      crowdCommand(w, {
        dest: { level: 0, x: d.x, z: d.z },
        mode: 'mop',
        stay: 2.5,
        then: () => setProp(w.char, 'mop'),
        done: () => {
          setProp(w.char, 'none');
          if (dirt.spots.includes(d)) dirt.remove(d);
          if (w.viewerRec) addPoints(w.viewerRec, 2, '🧼');
        },
      });
    }
    for (const w of workers.slice(0, 10)) crowdCommand(w, { inPlace: true, mode: 'mop', stay: 3 }); // ai không có chỗ dọn thì lau quanh mình
    addPoints(v, 5, '🧼');
  }

  function lixi(v, power = 1) {
    const others = [...viewers.values()].filter((x) => x !== v && present(x));
    const lucky = [];
    while (lucky.length < 3 * Math.min(3, power) && others.length) lucky.push(others.splice(Math.floor(R() * others.length), 1)[0]);
    banner(lucky.length ? `🧧 ${v.name} lì xì cho ${lucky.map((x) => x.name).join(', ')}!` : `🧧 ${v.name} lì xì cả trại!`);
    for (const x of lucky) {
      addPoints(x, 5, `🧧 từ ${v.name}`);
      const n = selfOf(x);
      if (n && !n.locked) npcs.command(n, { inPlace: true, mode: 'cheer', stay: 2 });
    }
    addPoints(v, 3, '🧧');
    const me = selfOf(v);
    if (me) {
      npcs.release(me);
      npcs.command(me, { inPlace: true, mode: 'cheer', stay: 2.5 });
    }
  }

  // ------------------------------------------------------------ 😂 trò đùa ngắn: chạy tới 1 bạn tù → làm trò ~2 giây → hiệu ứng → cả trại cười
  const PRANKS = {
    shave: { act: 'massage', look: () => ({ hair: 'bald', hat: 'none' }), sec: () => CFG.prankSec, text: (a, b) => `💇 ${a} cạo trọc đầu ${b}!` },
    dress: { act: 'serve', look: () => ({ outfit: 'pink', hat: 'bow' }), sec: () => CFG.prankSec, text: (a, b) => `👗 ${a} bắt ${b} mặc váy hồng!` },
    cake: { act: 'serve', prop: 'cake', look: () => ({ cream: true }), sec: () => 30, text: (a, b) => `🎂 ${a} úp bánh kem vào mặt ${b}!` },
  };
  const busyPrank = (m) => st.pranks.some((j) => j.victim === m || j.actor === m);

  function prank(kind, v, power = 1) {
    const def = PRANKS[kind];
    const names = [];
    for (let i = 0; i < Math.min(3, power); i++) {
      let actor = i === 0 ? selfOf(v) : null;
      if (!actor || actor.isBoss || actor.puppet || busyPrank(actor) || busyTrash(actor)) actor = pick(R, freeInmates({ npcOnly: true, crowd: true }).filter((m) => !busyPrank(m)));
      if (!actor) break;
      const pool = freeInmates({ crowd: true }).filter((m) => m !== actor && !busyPrank(m) && !busyTrash(m) && !(m.prankUntil > performance.now() && m.prankKinds?.has(kind)));
      const victim = pickTrashVictim(pool, v.id, R);
      if (!victim) break;
      npcs.release(actor);
      npcs.puppetize(victim);
      victim.puppetFace = Math.atan2(actor.body.pos.x - victim.body.pos.x, actor.body.pos.z - victim.body.pos.z);
      if (def.prop) setProp(actor.char, def.prop);
      const job = { kind, v, actor, victim, phase: 'approach', t: 0 };
      st.pranks.push(job);
      const vp = victim.body.pos;
      const dx = actor.body.pos.x - vp.x;
      const dz = actor.body.pos.z - vp.z;
      const dl = Math.hypot(dx, dz) || 1;
      npcs.command(actor, { dest: { level: 0, x: vp.x + (dx / dl) * 0.75, z: vp.z + (dz / dl) * 0.75 }, mode: 'idle', stay: 0.3, then: () => doPrank(job) });
      names.push(victim.name);
    }
    if (!names.length) return v.npc.label.say('Không bắt được ai!', 2);
    banner(def.text(v.name, names.join(', ')));
    sfx('pop');
    addPoints(v, 2 * names.length, '😂');
  }

  function doPrank(job) {
    if (job.phase !== 'approach') return;
    job.phase = 'act';
    const { actor, victim } = job;
    npcs.command(actor, { inPlace: true, mode: PRANKS[job.kind].act, stay: 1.8, ry: Math.atan2(victim.body.pos.x - actor.body.pos.x, victim.body.pos.z - actor.body.pos.z) });
    after(1.1, () => applyPrank(job));
    after(2.0, () => finishPrank(job));
  }

  function applyPrank(job) {
    const n = job.victim;
    if (!n.char.root.parent) return;
    const def = PRANKS[job.kind];
    const L = n.char.look;
    if (!n.prankOrig) n.prankOrig = { hair: L.hair, hat: L.hat, outfit: L.outfit, shirt: L.shirt, cream: false };
    n.prankKinds = n.prankKinds ?? new Set();
    n.prankKinds.add(job.kind);
    n.prankUntil = Math.max(n.prankUntil ?? 0, performance.now() + def.sec() * 1000);
    setLook(n.char, { ...L, ...def.look() });
    if (def.prop) setProp(job.actor.char, 'none');
    n.label.say(lines(`prank_${job.kind}`), 2.5);
    laughAt(n.body.pos, [n, job.actor]);
    sfx('swish');
  }

  function finishPrank(job) {
    const i = st.pranks.indexOf(job);
    if (i >= 0) st.pranks.splice(i, 1);
    if (job.victim.char.root.parent) npcs.unpuppet(job.victim);
  }

  /** Hết giờ trò đùa → trả lại tóc / mũ / đồ cũ (chờ xong chức vụ nếu đang làm đại ca, cán bộ…). */
  function updatePrankLooks() {
    const pnow = performance.now();
    for (const n of npcs.inmates) {
      if (!n.prankUntil || pnow < n.prankUntil || n.isBoss || n.jobRole || n.role === 'guard' || busyPrank(n)) continue;
      setLook(n.char, { ...n.char.look, ...n.prankOrig });
      n.prankOrig = null;
      n.prankUntil = 0;
      n.prankKinds = null;
    }
  }

  function updatePranks() {
    for (const j of st.pranks.slice()) {
      if (!j.actor.char.root.parent || !j.victim.char.root.parent) {
        finishPrank(j);
        continue;
      }
      if (j.phase !== 'approach') continue;
      j.t += 1;
      const near = d2(j.actor.body.pos, j.victim.body.pos) < 1.15;
      if (near) doPrank(j);
      else if (j.t > 60 * 12) finishPrank(j); // ~12 giây không tới được → bỏ
    }
  }

  // ------------------------------------------------------------ tư thế do sự kiện giữ: ngã vỏ chuối, hít đất
  const AX = new THREE.Vector3(1, 0, 0);
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();

  function holdPose(n, kind, dur, extra = {}) {
    abortTrashFor(n);
    endPoseFor(n);
    npcs.puppetize(n);
    n.carried = true;
    n.animMode = kind;
    const p = n.body.pos;
    const ps = { n, kind, t: 0, dur, x: p.x, y: p.y, z: p.z, ry: n.ry, count: 0, ...extra };
    st.poses.push(ps);
    return ps;
  }

  function endPose(ps) {
    const i = st.poses.indexOf(ps);
    if (i >= 0) st.poses.splice(i, 1);
    const n = ps.n;
    if (!n.char.root.parent) return;
    n.carried = false;
    n.animMode = null;
    npcs.unpuppet(n);
    n.char.root.quaternion.identity();
    ps.onEnd?.(n);
  }

  function endPoseFor(n) {
    for (const ps of st.poses.slice()) if (ps.n === n) endPose(ps);
  }

  function updatePoses(dt) {
    for (const ps of st.poses.slice()) {
      ps.t += dt;
      const n = ps.n;
      if (!n.char.root.parent) {
        st.poses.splice(st.poses.indexOf(ps), 1);
        continue;
      }
      let a = 0;
      let y = ps.y;
      if (ps.kind === 'fall') {
        // ngã ngửa: 0,25 s đổ xuống, nằm, 0,4 s cuối bật dậy (xoay quanh gót chân)
        const k = Math.min(1, ps.t / 0.25) - Math.max(0, (ps.t - (ps.dur - 0.4)) / 0.4);
        a = (-Math.PI / 2) * 0.95 * k;
        y = ps.y + 0.16 * k;
      } else if (ps.kind === 'pushup') {
        // úp mặt, chống tay: đầu nhấp lên xuống theo nhịp, đếm 1, 2, 3…
        const ph = ps.t * 6;
        a = Math.PI / 2 - (0.16 + 0.14 * (0.5 + 0.5 * Math.sin(ph)));
        y = ps.y + 0.05;
        const c = Math.floor((ph + Math.PI / 2) / (Math.PI * 2));
        if (c > ps.count) {
          ps.count = c;
          n.label.say(`${c}…`, 0.8);
        }
      }
      qa.setFromAxisAngle(UP, ps.ry);
      qb.setFromAxisAngle(AX, a);
      n.char.root.quaternion.copy(qa).multiply(qb);
      n.char.root.position.set(ps.x, y, ps.z);
      if (ps.t >= ps.dur) endPose(ps);
    }
  }

  // ------------------------------------------------------------ 🍌 vỏ chuối · 🏋️ phạt hít đất
  function banana(v, power = 1) {
    const me = selfOf(v);
    if (me && !me.locked) npcs.command(me, { inPlace: true, mode: 'shoot', stay: 0.8 });
    const walkers = npcs.inmates.filter((n) => n.path.length && !n.puppet && !n.carried && !n.seat && n.body.pos.y < 1 && n !== me);
    let placed = 0;
    for (let i = 0; i < Math.min(3, power); i++) {
      const w = walkers.splice(Math.floor(R() * walkers.length), 1)[0];
      let x;
      let z;
      if (w) {
        // ném ngay trước mặt 1 người đang đi → giẫm trúng trong 1–2 giây
        const wp = w.path[0];
        const dx = wp.x - w.body.pos.x;
        const dz = wp.z - w.body.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        const k = Math.min(1.4, d * 0.7);
        x = w.body.pos.x + (dx / d) * k;
        z = w.body.pos.z + (dz / d) * k;
      } else {
        const p = npcs.randomPoint();
        x = p.x;
        z = p.z;
      }
      const mesh = makeBanana();
      mesh.position.set(x, 0.01, z);
      mesh.rotation.y = R() * Math.PI * 2;
      scene.add(mesh);
      st.peels.push({ mesh, x, z, by: v, until: performance.now() + 25000 });
      placed++;
    }
    if (placed) banner(`🍌 ${v.name} ném vỏ chuối — coi chừng trượt!`);
    addPoints(v, 2, '🍌');
  }

  function updatePeels() {
    const pnow = performance.now();
    for (const pl of st.peels.slice()) {
      let victim = null;
      if (pnow < pl.until) {
        victim = npcs.inmates.find((n) => !n.carried && !n.seat && !n.puppet && n.body.pos.y < 0.5 && n.speed > 0.3 && Math.hypot(n.body.pos.x - pl.x, n.body.pos.z - pl.z) < 0.42);
        if (!victim) continue;
      }
      st.peels.splice(st.peels.indexOf(pl), 1);
      scene.remove(pl.mesh);
      if (!victim) continue;
      holdPose(victim, 'fall', 1.9);
      victim.label.say(lines('slip'), 2);
      sfx('bounce');
      laughAt(victim.body.pos, [victim]);
      if (pl.by && present(pl.by)) {
        addPoints(pl.by, 3, '🍌');
        chatLine('Hệ thống', `🍌 ${victim.name} trượt vỏ chuối của ${pl.by.name}! 😂`, 'gift');
      }
    }
  }

  function pushup(v, power = 1) {
    const pool = freeInmates({ crowd: true }).filter((m) => m !== v.npc && !busyTrash(m) && !busyPrank(m));
    const names = [];
    for (let i = 0; i < Math.min(3, power); i++) {
      const n = pickTrashVictim(pool, v.id, R);
      if (!n) break;
      pool.splice(pool.indexOf(n), 1);
      const g = npcs.guards.slice().sort((a, b) => d2(a.body.pos, n.body.pos) - d2(b.body.pos, n.body.pos))[0];
      if (g) g.label.say(`${n.name}! Hít đất 5 cái!`, 2.5);
      holdPose(n, 'pushup', 5.2, { onEnd: (m) => m.label.say('Mệt quá…', 1.8) });
      names.push(n.name);
    }
    if (!names.length) return;
    banner(`🏋️ ${v.name} báo cán bộ phạt ${names.join(', ')} hít đất!`);
    sfx('bell');
    addPoints(v, 2 * names.length, '🏋️');
  }

  // ------------------------------------------------------------ 🎉 sự kiện tập thể mới (chạy đồng loạt, không chờ lượt)
  function birthday(v, power = 1) {
    const me = selfOf(v);
    const c = (me ?? v.npc).body.pos;
    banner(`🎂 Chúc mừng sinh nhật ${v.name}!`);
    if (me) {
      npcs.release(me);
      setProp(me.char, 'cake');
      npcs.command(me, { inPlace: true, mode: 'cheer', stay: 6, done: () => setProp(me.char, 'none') });
    }
    const guests = freeInmates({ crowd: true, level: c.y > 2 ? 1 : 0 })
      .filter((m) => m !== me)
      .sort((a, b) => d2(a.body.pos, c) - d2(b.body.pos, c))
      .slice(0, 14);
    guests.forEach((m, i) => {
      const ang = (i / Math.max(1, guests.length)) * Math.PI * 2;
      const r = 1.6 + (i % 2) * 0.9;
      const x = c.x + Math.cos(ang) * r;
      const z = c.z + Math.sin(ang) * r;
      if (!world.collision.isFree(x, c.y, z, 0.34, 1.6)) return;
      crowdCommand(m, { dest: { level: c.y > 2 ? 1 : 0, x, z }, mode: 'clap', stay: 5, ry: Math.atan2(c.x - x, c.z - z), then: () => R() < 0.45 && m.label.say(lines('birthday', v.name), 2.5) });
    });
    after(3, () => {
      sfx('swish');
      for (let k = 0; k < 2 + power * 2; k++) after(k * 0.35, () => fireworks.burst(c.x + range(R, -2, 2), c.y + range(R, 4, 6), c.z + range(R, -2, 2)));
    });
    addPoints(v, 5, '🎂');
  }

  function race(v, power = 1) {
    if (st.race) {
      v.npc.label.say('Đang có cuộc đua — cổ vũ thôi!', 2);
      return;
    }
    const me = selfOf(v);
    const pool = freeInmates({ crowd: true }).filter((m) => m !== me);
    const viewersFirst = pool.filter((m) => m.viewerRec).concat(pool.filter((m) => !m.viewerRec));
    const racers = [...(me ? [me] : []), ...viewersFirst].slice(0, world.raceLanes.length);
    if (racers.length < 2) return v.npc.label.say('Không đủ người thi!', 2);
    const R0 = { v, racers, order: [], startAt: performance.now(), done: false };
    st.race = R0;
    banner(`🏃 ${v.name} tổ chức THI CHẠY — về chót là vào thùng rác!`);
    sfx('bell');
    racers.forEach((m, i) => {
      const lane = world.raceLanes[i];
      npcs.release(m);
      m.crowdUntil = performance.now() + 16000;
      Object.assign(m.body.pos, { x: lane.x0, y: 0, z: lane.z }); // về vạch xuất phát
      m.ry = Math.PI / 2;
      m.speedMul = range(R, 0.78, 1.25); // ai nhanh hơn là hên
      npcs.command(m, {
        inPlace: true,
        mode: 'idle',
        stay: 1.6,
        ry: Math.PI / 2,
        then: () => i === 0 && m.label.say('3… 2… 1…', 1.5),
        done: () =>
          npcs.command(m, {
            dest: { level: 0, x: lane.x1, z: lane.z },
            mode: 'cheer',
            stay: 2.5,
            then: () => {
              m.speedMul = null;
              R0.order.push(m);
              if (R0.order.length === 1) m.label.say('Về nhất!!', 2);
              if (R0.order.length === racers.length) finishRace(R0);
            },
          }),
      });
    });
    // khán giả đứng dọc đường đua cổ vũ
    const fans = freeInmates({ crowd: true }).filter((m) => !racers.includes(m) && m.body.pos.z > 2).slice(0, 10);
    fans.forEach((m, i) => {
      const x = -5 + (i / Math.max(1, fans.length - 1)) * 15;
      crowdCommand(m, { dest: { level: 0, x, z: 12.4 }, mode: 'cheer', stay: 8, ry: Math.PI, then: () => R() < 0.3 && m.label.say(lines('cheer'), 2) });
    });
    after(14, () => finishRace(R0)); // ai chưa về sau 14 giây coi như về chót
    addPoints(v, 3, '🏃');
  }

  function finishRace(R0) {
    if (R0.done) return;
    R0.done = true;
    if (st.race === R0) st.race = null;
    const alive = R0.racers.filter((m) => m.char.root.parent);
    for (const m of alive) m.speedMul = null;
    const notIn = alive.filter((m) => !R0.order.includes(m)).sort((a, b) => a.body.pos.x - b.body.pos.x);
    const ranking = R0.order.filter((m) => m.char.root.parent).concat(notIn.reverse());
    const winner = ranking[0];
    const loser = ranking[ranking.length - 1];
    if (!winner || winner === loser) return;
    banner(`🏆 ${winner.name} về nhất! ${loser.name} về chót → vào thùng rác!`);
    if (winner.viewerRec) addPoints(winner.viewerRec, 10, '🏃');
    after(1.2, () => startTrash(winner, loser));
  }

  function firedrill(v) {
    banner(`🚒 DIỄN TẬP THOÁT HIỂM${v ? ` (${v.name})` : ''} — mọi người ra sân!`);
    sfx('bell');
    after(0.5, () => sfx('bell'));
    after(1, () => sfx('bell'));
    const spots = world.rollcallSpots;
    freeInmates({ level: null, crowd: true }).forEach((m, i) => {
      const p = spots[i % spots.length];
      crowdCommand(m, { dest: { level: 0, ...p }, mode: 'cover', stay: 4, ry: -Math.PI / 2, then: () => R() < 0.25 && m.label.say(lines('drill'), 2) });
    });
    for (const g of npcs.guards) g.label.say('Bình tĩnh! Ra sân tập trung!', 3);
    if (v) addPoints(v, 3, '🚒');
  }

  const rainFx = new RainSystem(scene);
  function rain(v, power = 1) {
    const sec = 12 + 6 * Math.min(3, power);
    st.rainUntil = performance.now() + sec * 1000;
    rainFx.set(true);
    banner(v ? `☔ ${v.name} gọi mưa rào!` : '☔ Mưa rào bất chợt!');
    const spots = world.shelterSpots.slice();
    for (const m of freeInmates({ crowd: true })) {
      if (!spots.length) break;
      let bi = 0;
      spots.forEach((sp, i) => {
        if (d2(sp, m.body.pos) < d2(spots[bi], m.body.pos)) bi = i;
      });
      const sp = spots.splice(bi, 1)[0];
      crowdCommand(m, { dest: { level: 0, x: sp.x, z: sp.z }, mode: 'cover', stay: Math.max(3, sec - 4), ry: sp.ry + Math.PI, then: () => R() < 0.3 && m.label.say(lines('rain'), 2) });
    }
    if (v) addPoints(v, 3, '☔');
  }

  function mouse(v, power = 1) {
    const A = world.freeArea;
    for (let i = 0; i < Math.min(3, power); i++) {
      const left = R() < 0.5;
      const z = range(R, A.minZ + 2, A.maxZ - 2);
      const from = { x: left ? A.minX : A.maxX, z };
      const to = { x: left ? A.maxX : A.minX, z: range(R, A.minZ + 2, A.maxZ - 2) };
      const mesh = makeMouse();
      mesh.visible = false;
      scene.add(mesh);
      st.mice.push({ mesh, from, to, t: -i * 0.7, dur: 6, scared: new Set() });
    }
    banner(v ? `🐀 ${v.name} thả chuột vào trại!` : '🐀 Có chuột chạy qua sân!');
    if (v) addPoints(v, 3, '🐀');
  }

  function updateMice(dt) {
    for (const mo of st.mice.slice()) {
      mo.t += dt;
      if (mo.t < 0) continue;
      const k = mo.t / mo.dur;
      if (k >= 1) {
        scene.remove(mo.mesh);
        st.mice.splice(st.mice.indexOf(mo), 1);
        continue;
      }
      const x = mo.from.x + (mo.to.x - mo.from.x) * k;
      const z = mo.from.z + (mo.to.z - mo.from.z) * k + Math.sin(mo.t * 9) * 0.25;
      mo.mesh.visible = true;
      mo.mesh.position.set(x, 0, z);
      mo.mesh.rotation.y = Math.atan2(mo.to.x - mo.from.x, mo.to.z - mo.from.z);
      for (const m of npcs.inmates) {
        if (mo.scared.has(m) || m.carried || m.body.pos.y > 1 || Math.hypot(m.body.pos.x - x, m.body.pos.z - z) > 2.3) continue;
        mo.scared.add(m);
        m.label.say(lines('mouse'), 1.6);
        if (!m.locked && !m.puppet && !m.seat) crowdCommand(m, { inPlace: true, mode: 'cheer', stay: 1.5 });
      }
    }
  }

  // ------------------------------------------------------------ 🪢 kéo co theo PK (tín hiệu thật pk:state từ server)
  function startTug() {
    if (st.tug || !CFG.pkTug) return;
    const pool = freeInmates({ crowd: true });
    const hostTeam = pool.filter((m) => m.viewerRec).slice(0, 6);
    for (const m of pool) if (hostTeam.length < 6 && !m.viewerRec && !hostTeam.includes(m)) hostTeam.push(m);
    const oppTeam = pool.filter((m) => !hostTeam.includes(m) && !m.viewerRec).slice(0, 6);
    if (hostTeam.length < 2 || oppTeam.length < 2) return;
    const rope = makeRope(9.5);
    rope.position.set(world.tug.x, 0.95, world.tug.z);
    scene.add(rope);
    const T = { host: 0, opp: 0, shift: 0, hostTeam, oppTeam, rope, startAt: performance.now(), lastAt: performance.now() };
    const join = (m, side, i) => {
      abortTrashFor(m);
      endPoseFor(m);
      npcs.puppetize(m);
      m.carried = true;
      m.animMode = 'pull';
      m.tug = { side, i };
    };
    hostTeam.forEach((m, i) => join(m, 'host', i));
    oppTeam.forEach((m, i) => join(m, 'opp', i));
    st.tug = T;
    banner('🪢 PK BẮT ĐẦU — KÉO CO! Tặng quà để đội mình kéo thắng!');
    sfx('bell');
  }

  function releaseTugMember(m) {
    m.tug = null;
    if (!m.char.root.parent) return;
    m.carried = false;
    m.animMode = null;
    npcs.unpuppet(m);
    m.char.root.quaternion.identity();
  }

  function endTug(result) {
    const T = st.tug;
    if (!T) return;
    st.tug = null;
    scene.remove(T.rope);
    const all = T.hostTeam.concat(T.oppTeam);
    for (const m of all) releaseTugMember(m);
    const winners = (result === 'win' ? T.hostTeam : result === 'lose' ? T.oppTeam : []).filter(present0);
    const losers = (result === 'win' ? T.oppTeam : result === 'lose' ? T.hostTeam : []).filter(present0);
    if (!winners.length) return;
    banner(result === 'win' ? '🏆 ĐỘI MÌNH THẮNG PK! Đội bạn vào thùng rác!' : '😭 Thua PK rồi… đội mình vào thùng rác!');
    sfx(result === 'win' ? 'swish' : 'miss');
    for (const w of winners) npcs.command(w, { inPlace: true, mode: 'cheer', stay: 2 });
    // luật chung: thua là vào thùng rác — mỗi người thắng vác 1 người thua (tối đa 3)
    const n = Math.min(3, winners.length, losers.length);
    for (let i = 0; i < n; i++) after(1.2 + i * 0.3, () => startTrash(winners[i], losers[i]));
    for (const w of winners) if (w.viewerRec) addPoints(w.viewerRec, 10, '🪢');
  }
  const present0 = (m) => !!m.char.root.parent;

  function updateTug(dt) {
    const T = st.tug;
    if (!T) return;
    if (performance.now() - T.lastAt > 6 * 60 * 1000) return endTug(null); // mất tín hiệu PK lâu → dẹp
    T.shift += (tugShift(T.host, T.opp) - T.shift) * Math.min(1, dt * 1.5);
    const cx = world.tug.x - T.shift; // đội mình bên trái (−x): mình dẫn điểm → dây kéo về phía mình
    const z = world.tug.z;
    T.rope.position.x = cx;
    const t = performance.now() / 1000;
    for (const m of T.hostTeam.concat(T.oppTeam)) {
      if (!m.char.root.parent || !m.tug) continue;
      const dir = m.tug.side === 'host' ? -1 : 1;
      const x = cx + dir * (0.9 + m.tug.i * 0.62) + Math.sin(t * 7 + m.tug.i) * 0.03;
      const zz = z + (m.tug.i % 2 ? 0.22 : -0.22);
      Object.assign(m.body.pos, { x, y: 0, z: zz });
      m.ry = dir < 0 ? Math.PI / 2 : -Math.PI / 2;
      qa.setFromAxisAngle(UP, m.ry);
      qb.setFromAxisAngle(AX, -0.28); // ngả người ra sau
      m.char.root.quaternion.copy(qa).multiply(qb);
      m.char.root.position.set(x, 0, zz);
    }
  }

  /** Tín hiệu PK thật từ server (io 'pk:state'): start · score · end {host, opp, result}. */
  function pkState(d) {
    if (!d || !CFG.pkTug) return;
    if (d.phase === 'start' || (d.active && !st.tug && d.phase === 'score')) startTug();
    const T = st.tug;
    if (T) {
      T.host = Number(d.host) || 0;
      T.opp = Number(d.opp) || 0;
      T.lastAt = performance.now();
    }
    if (d.phase === 'end') endTug(d.result);
  }

  // ------------------------------------------------------------ ❤️ mốc tim · trại vắng quà → sự kiện tự chạy
  function likeEvent(total) {
    const kind = pick(R, ['flashmobAll', 'photo', 'rain', 'mouse']);
    // banner để cho chính sự kiện (banner "gạch thêm ngày" của tim hay chạy cùng lúc) — mốc tim ghi vào khung chat
    chatLine('Hệ thống', `❤️ Cả phòng thả đủ ${total} tim → sự kiện cả trại!`, 'gift');
    after(0.6, () => runCrowdless(kind));
  }

  function autoEvent() {
    runCrowdless(pick(R, ['rain', 'mouse', 'mouse']));
  }

  function runCrowdless(kind) {
    if (kind === 'photo') photo(null);
    else if (kind === 'rain') rain(null);
    else if (kind === 'mouse') mouse(null);
    else {
      banner('🕺 FLASHMOB cả trại!');
      sfx('coin');
      for (const m of freeInmates({ level: null, crowd: true })) crowdCommand(m, { inPlace: true, mode: R() < 0.5 ? 'cheer' : 'exercise', stay: 6 });
    }
  }

  // ------------------------------------------------------------ API
  /** Quà cần nhân vật ra ngoài làm: người đang bị giam vì đi bậy tặng → được thả (vẫn phải dọn bãi). */
  const NEEDS_SELF = new Set(['boss', 'guard', 'chef', 'leader', 'nurse', 'karaoke', 'armwrestle', 'pardon']);

  /**
   * Kích hoạt vai trò / sự kiện `id` cho người xem `v`. Trả false nếu không phải hành động của module này.
   * power 1–3: combo quà (×5 → 2, ×10 → 3) — trò đùa / thùng rác trúng nhiều người hơn, pháo hoa nhiều hơn…
   */
  function trigger(id, v, power = 1) {
    if (!defs[id]) return false;
    if (v.jailed && v.offense && NEEDS_SELF.has(id)) releaseOffender(v, '🎁');
    else if (v.jailed && !v.offense) free(v);
    switch (id) {
      case 'poop':
      case 'pee': mischief(id, v); break;
      case 'report': report(v); break;
      case 'bail': bail(v); break;
      case 'trash': trash(v, power); break;
      case 'photo': photo(v, power); break;
      case 'cleanup': cleanupAll(v); break;
      case 'lixi': lixi(v, power); break;
      case 'shave':
      case 'dress':
      case 'cake': prank(id, v, power); break;
      case 'banana': banana(v, power); break;
      case 'pushup': pushup(v, power); break;
      case 'birthday': birthday(v, power); break;
      case 'race': race(v, power); break;
      case 'firedrill': firedrill(v); break;
      case 'rain': rain(v, power); break;
      case 'mouse': mouse(v, power); break;
      case 'boss': becomeBoss(v); break;
      case 'guard': becomeGuard(v); break;
      case 'chef':
      case 'leader':
      case 'nurse': becomeJob(id, v); break;
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
    updateJobs(dt, now);
    updatePets(dt);
    updateWalkers(dt);
    updateOffenders(now);
    updateTrash(dt);
    updatePranks();
    updatePoses(dt);
    updatePeels();
    updateMice(dt);
    updateTug(dt);
    rainFx.update(dt);
    if (st.rainUntil && pnow > st.rainUntil) {
      st.rainUntil = 0;
      rainFx.set(false);
      banner('🌈 Tạnh mưa rồi!');
    }
    messes.update(dt);
    st.cleanT -= dt;
    if (st.cleanT <= 0) {
      st.cleanT = 0.5;
      updateCleaners();
      updatePrankLooks();
    }
    st.smellT -= dt;
    if (st.smellT <= 0 && messes.items.length) {
      // ai đi ngang bãi bẩn thì kêu thối
      st.smellT = range(R, 3, 6);
      const m = pick(R, messes.items);
      const near = npcs.inmates.find((x) => !x.viewer && !x.carried && d2(x.body.pos, m) < 2.2 && Math.abs(x.body.pos.y - m.y) < 1);
      if (near) near.label.say(lines('smell'), 2.5);
    }
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
      if (v.jailed || st.boss === v || v.guardRole || st.jobs.has(v.id) || spot.current?.id === v.id || spot.queue.some((q) => q.id === v.id)) continue;
      if (shouldJail(v.lastActive, now, CFG.jailIdleSec)) jail(v);
    }
  }

  /** Người xem bị gỡ khỏi trại → dọn vai trò / phòng giam. */
  function onViewerRemoved(v) {
    abortTrashFor(v.npc);
    endPoseFor(v.npc);
    for (const j of st.pranks.slice()) if (j.actor === v.npc || j.victim === v.npc) finishPrank(j);
    st.offenders.delete(v);
    v.offense = null;
    v.mustClean = false;
    for (const m of messes.items) if (m.owner === v) m.owner = null; // bãi vẫn nằm đó, ai dọn được cống hiến
    if (st.boss === v) endBoss();
    if (st.guards.has(v.id)) endGuard(v.id);
    if (st.jobs.has(v.id)) endJob(v.id);
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
    for (const id of [...st.jobs.keys()]) endJob(id);
    for (const p of st.pets) {
      scene.remove(p.a.root);
      p.label.dispose();
    }
    st.pets = [];
    for (const w of st.walkers) {
      disposeCharacter(w.a.char);
      w.a.label.dispose();
    }
    st.walkers = [];
    for (const j of st.trash.slice()) endTrash(j, 'drop');
    for (const j of st.pranks.slice()) finishPrank(j);
    for (const ps of st.poses.slice()) endPose(ps);
    for (const pl of st.peels) scene.remove(pl.mesh);
    st.peels = [];
    for (const mo of st.mice) scene.remove(mo.mesh);
    st.mice = [];
    if (st.race) st.race.done = true;
    st.race = null;
    endTug(null);
    st.rainUntil = 0;
    rainFx.set(false);
    for (const m of messes.items.slice()) messes.remove(m);
    st.offenses = [];
    for (const v of st.offenders) v.offense = null;
    st.offenders.clear();
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
    isRaining: () => st.rainUntil > 0,
    pkState,
    likeEvent,
    autoEvent,
    /** Kéo co PK đang chạy (cho HUD): {host, opp} | null */
    tugInfo: () => (st.tug ? { host: st.tug.host, opp: st.tug.opp } : null),
    /**
     * Cảnh camera nên bám ngay (vụ thùng rác mới nhất): người vác lúc chạy tới bắt + vác đi,
     * người bị ném lúc bay vào thùng + 3,5 giây đầu cắm đầu giãy giụa. null = không có cảnh nào.
     */
    focusActor() {
      const pnow = performance.now();
      if (st.tug && pnow - st.tug.startAt < 4000) return { body: { pos: st.tug.rope.position } };
      if (st.race && !st.race.done && pnow - st.race.startAt < 12000) {
        const lead = st.race.racers.filter(present0).sort((a, b) => b.body.pos.x - a.body.pos.x)[0];
        if (lead) return lead;
      }
      for (let i = st.trash.length - 1; i >= 0; i--) {
        const j = st.trash[i];
        if (j.phase === 'approach' || j.phase === 'carry') return j.carrier;
        if (j.phase === 'fly' || (j.phase === 'stuck' && pnow < j.stuckAt + 3500)) return j.victim;
      }
      return null;
    },
    cleanJob,
    /** Người đang bị giam vì đi bậy (lệnh bình luận / phím số bị chặn). */
    isOffender: (v) => !!v?.offense,
    /** Quà cần ra ngoài làm (nhiệm vụ) của người đang bị giam → thả, vẫn phải dọn. */
    bailOut: (v) => releaseOffender(v, '🎁'),
    /** Streamer đứng gần bãi bẩn bấm Lau sàn → dọn luôn (không cộng điểm). */
    cleanNear(x, y, z) {
      const m = messes.nearest(x, y, z, 1.4, { includeClaimed: true });
      return m ? cleanMess(m, null) : false;
    },
    /** Biểu tượng chức vụ hiện tại của người xem (cho bảng điểm). */
    roleEmoji(v) {
      if (st.boss === v) return '👑';
      if (st.guards.has(v.id)) return '👮';
      const j = st.jobs.get(v.id);
      return j ? JOBS[j.kind].emoji : v.star ? '⭐' : '';
    },
    /** Thông tin cho HUD: đại ca + cán bộ hiện tại. */
    roles: () => ({
      boss: st.boss ? { name: st.boss.name, left: Math.max(0, (st.bossUntil - Date.now()) / 1000) } : null,
      guards: [...st.guards.values()].map((g) => ({ name: g.v.name, left: Math.max(0, (g.until - Date.now()) / 1000) })),
      jobs: [...st.jobs.values()].map((j) => ({ name: j.v.name, emoji: JOBS[j.kind].emoji, title: JOBS[j.kind].title, left: Math.max(0, (j.until - Date.now()) / 1000) })),
      jailed: [...st.jailOcc.values()].reduce((a, b) => a + b, 0),
      offenders: [...st.offenders].map((v) => ({ name: v.name, left: Math.max(0, (v.offense.until - Date.now()) / 1000) })),
    }),
    burst: (x, y, z) => fireworks.burst(x, y, z),
  };
}
