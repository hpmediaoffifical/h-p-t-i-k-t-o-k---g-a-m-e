/**
 * 🏢 Creator Online (bản LIVE) — GĐ2 "người xem chơi với nhau" (spec 2026-11-03-creatoronline-design.md mục 21).
 * Phần chạy (hình, camera, HUD) của các luật thuần trong logic/social.js:
 * - số người chơi #N trên bảng tên → `ném 12`, `ghép 12`, `ôm 12`, `thách 12`, `bạn 12` (không gõ số: nhắm người đang lên hình);
 * - quà nhắm người khác (ném bánh / bắn tim / ném trứng, ôm, ghép đôi, thách đấu 1–1 ở Sàn Giao Lưu quanh logo sảnh);
 * - miễn phí: áo 1–8, tóc 1–6, biểu cảm nhảy/vẫy/tim/lắc, kết bạn, cổ vũ đồng thanh, A/B chọn phe thách đấu;
 * - điểm lên hình (bình luận/chia sẻ/follow/tim) → cận 5 giây "⭐ fan nổi bật" khi đạo diễn rảnh; quà luôn cắt ngang;
 * - ⭐ Center (top quà nhóm 5 phút qua: đứng giữa sân khấu) · 🎖️ đội trưởng (top quà nhóm buổi này: gọi PK, đổi nhạc);
 * - đồ VIP giữ trọn đời (lưu ở server, lib/creatoronline-fans.js) + hành động riêng (pháo hoa, bay, khổng lồ).
 * game.js giữ chỗ đứng (desiredPlace: vai > phòng > sàn giao lưu > Center > sân khấu > khán giả); module này chỉ nói
 * "người này nên ở sàn giao lưu chỗ nào / có phải Center không" và lo hiệu ứng.
 */
import * as THREE from 'three';
import { setExtras, setLook } from './character.js';
import { parseSocialCommand, TagBook, CameraScore, Chorus, CenterBoard, Bonds, Duel, Pranks } from './logic/social.js';
import { stripVN } from './logic/codes.js';

// Sàn Giao Lưu: vòng logo sảnh Nam (world.js: logo tâm (0, 19) bán kính 5,5; sofa ở x ±8). Camera 'duo' đứng phía +z.
const DUEL_SPOTS = [
  { x: -1.15, z: 19.3, ry: Math.PI * 0.32 },
  { x: 1.15, z: 19.3, ry: -Math.PI * 0.32 },
];
const COUPLE_SLOTS = [
  { x: -3.3, z: 17.4 },
  { x: 3.3, z: 17.4 },
  { x: -3.3, z: 21.3 },
  { x: 3.3, z: 21.3 },
];
const THROW_ITEM = { throwCake: 'cake', throwHeart: 'heart', throwEgg: 'egg' };
const ITEM_EMOJI = { cake: '🎂', heart: '💘', egg: '🍳' };
const ITEM_VERB = { cake: 'ném bánh kem vào', heart: 'bắn tim tới', egg: 'ném trứng vào' };
const AIM_ACTION = { throw: 'throwCake', pair: 'pair', hug: 'hug', duel: 'duel' };
const AIM_VERB = { throw: 'ném', pair: 'ghép đôi', hug: 'ôm', duel: 'thách đấu' };
const EMOTE_MODE = { dance: 'dance1', wave: 'wave', heart: 'heartPose', shake: 'shake' };
const VIP_KEY = { vipHat: 'hat', vipGlasses: 'glasses', vipWings: 'wings' };
const VIP_NAME = { hat: '🪶 Vương miện lông vũ', glasses: '🤩 Kính ngôi sao', wings: '🧚 Đôi cánh tiên' };
const GOLD = 0xffd23f;

const emojiTex = new Map();
function emojiTexture(e) {
  if (emojiTex.has(e)) return emojiTex.get(e);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '96px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(e, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  emojiTex.set(e, t);
  return t;
}
const hexOf = (c) => {
  try {
    return new THREE.Color(c).getHex();
  } catch {
    return 0xff4fa3;
  }
};

export class SocialPlay {
  /**
   * @param {object} ctx cầu nối tới game.js — xem chỗ `new SocialPlay({...})` trong game.js (viewers, CFG, director,
   *   hud, effects, audio, scene, clubRoom, clubColor, CLUB_NO, chipFor, reconcile, npcSay, npcs, states, setTicker,
   *   requestPk, applyGenre, pkActive, shotNow, baseLook, bodyChars, placeKind, reseatNear, giftEntry, vol, LOW, S, shotSec)
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.flying = [];
    this.reset();
  }

  get S() {
    return this.ctx.S;
  }

  /** Buổi LIVE mới: xoá mọi trạng thái chơi với nhau. */
  reset() {
    const S = this.S;
    const C = this.ctx.CFG;
    this.tags = new TagBook({ max: 99 });
    this.score = new CameraScore({ halfLifeMs: S.fanHalfLifeSec * 1000, minScore: S.fanMinScore });
    this.chorus = new Chorus({ windowMs: S.chorusWindowSec * 1000, minPeople: C.coChorusMin, cooldownMs: S.chorusCooldownSec * 1000 });
    this.center = new CenterBoard({ windowMs: S.centerWindowSec * 1000 });
    this.bonds = new Bonds({ pairMs: C.coPairSec * 1000, pairMaxMs: S.pairMaxSec * 1000, friendMs: S.friendSec * 1000 });
    this.duel = this._newDuel();
    this.pranks = new Pranks({ splatMs: S.splatSec * 1000, revengeMs: S.revengeSec * 1000 });
    this.couples = COUPLE_SLOTS.map(() => null); // { a, b, kind: 'pair'|'hug', until }
    this.centers = {}; // club → id
    this.captains = {}; // club → id
    this.captainT = 0;
    this.nextFanAt = Date.now() + 15000;
    this.duelSeen = false;
    for (const f of this.flying) this.ctx.scene.remove(f.s);
    this.flying = [];
  }

  _newDuel() {
    const S = this.S;
    return new Duel({ durMs: this.ctx.CFG.coDuelSec * 1000, finalMs: S.duelFinalSec * 1000, cooldownMs: S.duelCooldownSec * 1000, cheerLikes: S.duelCheerLikes });
  }

  /** Cấu hình đổi giữa buổi: dựng lại phần có thông số (giữ trạng thái). */
  applyConfig() {
    const C = this.ctx.CFG;
    const S = this.S;
    this.chorus = new Chorus({ windowMs: S.chorusWindowSec * 1000, minPeople: C.coChorusMin, cooldownMs: S.chorusCooldownSec * 1000 });
    this.bonds = Bonds.fromJSON(this.bonds.toJSON(), { pairMs: C.coPairSec * 1000, pairMaxMs: S.pairMaxSec * 1000, friendMs: S.friendSec * 1000 });
    if (!this.duel.active(Date.now())) this.duel = this._newDuel();
  }

  // ------------------------------------------------------------------ người xem vào / rời
  onJoin(v) {
    if (v.no == null) v.no = this.tags.assign(v.id);
  }

  onLeave(v, now) {
    this.tags.release(v.id);
    this.score.remove(v.id);
    this.center.remove(v.id);
    this.pranks.remove(v.id);
    const ended = this.bonds.remove(v.id) || [];
    const res = this.duel.remove(v.id, now);
    for (let i = 0; i < this.couples.length; i++) {
      const c = this.couples[i];
      if (c && (c.a === v.id || c.b === v.id)) {
        this.couples[i] = null;
        this._reconcileId(c.a === v.id ? c.b : c.a);
      }
    }
    for (const e of ended) this._reconcileId(e.a === v.id ? e.b : e.a);
    if (res) this._endDuel(res, now, true);
  }

  _reconcileId(id) {
    const w = this.ctx.viewers.get(id);
    if (w) {
      this.ctx.reconcile(w);
      this.dress(w);
    }
  }

  // ------------------------------------------------------------------ ngoại hình
  /** Look gốc (theo tên) + áo/tóc người xem tự chọn. */
  lookOf(v, type = 'stand') {
    const base = this.ctx.baseLook(v, type);
    const S = this.S;
    const look = { ...base };
    if (v.pick?.outfit) look.outfit = S.outfits[v.pick.outfit - 1] ?? look.outfit;
    if (v.pick?.hair) Object.assign(look, S.hairs[v.pick.hair - 1] ?? {});
    return look;
  }

  extrasOf(v, now = Date.now()) {
    const vip = v.vip ?? [];
    const center = this.isCenter(v);
    const captain = v.club && this.captains[v.club] === v.id;
    const giant = (v.giantUntil ?? 0) > now;
    return {
      vipHat: vip.includes('hat'),
      glasses: vip.includes('glasses'),
      wings: vip.includes('wings'),
      splat: this.pranks.splatOf(v.id, now),
      armband: captain ? hexOf(this.ctx.clubColor(v.club)) : null,
      scale: giant ? 1.5 : 1,
      aura: center || giant ? GOLD : null,
    };
  }

  /** Áp ngoại hình + đồ VIP + bánh dính mặt… lên mọi thân đang đại diện người xem (nhân vật + chủ phòng NPC). */
  dress(v, { look = false } = {}) {
    const ex = this.extrasOf(v);
    for (const { char, type } of this.ctx.bodyChars(v)) {
      if (look || v.pick) setLook(char, this.lookOf(v, type));
      setExtras(char, ex);
    }
  }

  // ------------------------------------------------------------------ chỗ đứng
  /** Chỗ ở Sàn Giao Lưu (null = không). key đổi → game.js reconcile đặt lại. */
  placeOf(v, now = Date.now()) {
    if (this.duel.active(now) && this.duelSeen) {
      if (this.duel.a === v.id) return { kind: 'plaza', spot: 'duelA', key: 'plaza:duelA' };
      if (this.duel.b === v.id) return { kind: 'plaza', spot: 'duelB', key: 'plaza:duelB' };
    }
    for (let i = 0; i < this.couples.length; i++) {
      const c = this.couples[i];
      if (!c) continue;
      if (c.a === v.id) return { kind: 'plaza', spot: `c${i}a`, key: `plaza:c${i}a:${c.kind}` };
      if (c.b === v.id) return { kind: 'plaza', spot: `c${i}b`, key: `plaza:c${i}b:${c.kind}` };
    }
    return null;
  }

  plazaSpot(place) {
    if (place.spot === 'duelA') return { ...DUEL_SPOTS[0] };
    if (place.spot === 'duelB') return { ...DUEL_SPOTS[1] };
    const i = Number(place.spot[1]);
    const side = place.spot[2] === 'a' ? -1 : 1;
    const s = COUPLE_SLOTS[i];
    const hug = this.couples[i]?.kind === 'hug';
    return hug ? { x: s.x + side * 0.36, z: s.z, ry: -side * Math.PI * 0.5 } : { x: s.x + side * 0.55, z: s.z, ry: -side * 0.35 };
  }

  isCenter(v) {
    return !!v.club && this.centers[v.club] === v.id;
  }

  isCaptain(v) {
    return !!v.club && this.captains[v.club] === v.id;
  }

  /** Người này đang bận chỗ cố định (vai / phòng) → không kéo ra Sàn Giao Lưu được. */
  _busy(v) {
    const k = this.ctx.placeKind(v);
    return k === 'role' || k === 'room' || !v.actor;
  }

  /** Động tác ghi đè (null = để game.js tự chọn). */
  modeOf(v, now, beat) {
    if (v.emote && v.emote.until > now) return v.emote.mode;
    if ((v.loserUntil ?? 0) > now) return 'cry';
    if ((v.flyUntil ?? 0) > now) return 'fly';
    if (v.place?.kind === 'plaza') {
      if (v.place.spot.startsWith('duel')) return 'fight';
      if (v.place.key.endsWith(':hug')) return 'hug';
      return ['dance1', 'dance2', 'dance4', 'dance3'][Math.floor(beat / 16) % 4];
    }
    if ((v.cheerUntil ?? 0) > now) return 'cheer';
    return null;
  }

  // ------------------------------------------------------------------ nhắm người
  _target(v, now) {
    const { viewers } = this.ctx;
    if (v.aim && now - v.aim.at < this.S.aimSec * 1000) {
      const w = viewers.get(v.aim.id);
      if (w && w.id !== v.id) return w;
    }
    const shot = this.ctx.shotNow();
    for (const id of [shot?.focus, shot?.focus2, shot?.gifter]) {
      if (id && id !== v.id && viewers.has(id)) return viewers.get(id);
    }
    let best = null;
    for (const w of viewers.values()) {
      if (w.id === v.id || !w.actor || now - (w.lastCommentAt ?? 0) > this.S.lastCommenterSec * 1000) continue;
      if (!best || w.lastCommentAt > best.lastCommentAt) best = w;
    }
    return best;
  }

  /** Kiểu nhìn camera cho 1 người theo chỗ đứng. */
  _viewFor(w) {
    const k = this.ctx.placeKind(w);
    if (k === 'room') return { view: 'room', target: w.place.roomId };
    if (k === 'plaza') return { view: 'duo', target: 'plaza', face: 0 };
    if (k === 'stage' || k === 'center' || k === 'role') return { view: 'close', target: `G${w.place?.club ?? w.club}` };
    return { view: 'over', target: `G${w.club}` };
  }

  _giftLabel(action) {
    const g = this.ctx.giftEntry(action);
    return g ? g.giftName : '';
  }

  // ------------------------------------------------------------------ bình luận / tim / chia sẻ
  /** @returns {boolean} true = bình luận là lệnh, game.js không hiện bong bóng/LED */
  onComment(v, raw, now) {
    const C = this.ctx.CFG;
    this.score.comment(v.id, now);
    if (!C.coSocial) return false;
    const cmd = parseSocialCommand(raw);
    if (!cmd) {
      const hit = this.chorus.add(v.id, raw, now, Math.min(8, Math.ceil(this._activeCount(now) * 0.15)));
      if (hit) this._chorus(hit, now);
      return false;
    }
    const { chipFor, viewers } = this.ctx;
    if (cmd.target != null) {
      const id = this.tags.idOf(cmd.target);
      const w = id ? viewers.get(id) : null;
      if (!w) return chipFor(v, `❓ không có #${cmd.target}`), true;
      if (w.id === v.id) return chipFor(v, '🙃 chọn người khác nhé'), true;
      if (cmd.kind === 'friend') {
        const r = this.bonds.befriend(v.id, w.id, now);
        if (r === 'ok') {
          chipFor(v, `🤝 bạn của #${w.no} ${w.name}`);
          chipFor(w, `🤝 #${v.no} ${v.name} kết bạn`);
          this.ctx.reseatNear(v, w);
        }
        return true;
      }
      v.aim = { kind: cmd.kind, id: w.id, at: now };
      const gift = this._giftLabel(AIM_ACTION[cmd.kind]);
      chipFor(v, `🎯 ${AIM_VERB[cmd.kind]} #${w.no}${gift ? ` · tặng ${gift}` : ''}`);
      return true;
    }
    if (cmd.kind === 'outfit' || cmd.kind === 'hair') {
      // áo và tóc chờ riêng (gõ "áo 3" rồi "tóc 2" liền nhau vẫn đổi cả hai)
      v.lookAt ??= {};
      if (now - (v.lookAt[cmd.kind] ?? 0) < C.coLookSec * 1000) return chipFor(v, '⏳ chờ chút mới đổi đồ'), true;
      v.lookAt[cmd.kind] = now;
      v.pick = { ...(v.pick ?? {}), [cmd.kind]: cmd.value };
      this.dress(v, { look: true });
      chipFor(v, cmd.kind === 'outfit' ? `👕 áo ${cmd.value}` : `💇 tóc ${cmd.value}`);
      return true;
    }
    if (cmd.kind === 'emote') {
      if (now - (v.emoteAt ?? 0) < C.coEmoteSec * 1000) return true;
      v.emoteAt = now;
      v.emote = { mode: EMOTE_MODE[cmd.emote] ?? 'wave', until: now + 4000 };
      if (cmd.emote === 'heart') this._floatAround(v, ['❤️', '💖', '💗'], 5);
      return true;
    }
    if (cmd.kind === 'cheerSide') {
      if (!this.duel.active(now)) return false;
      this.duel.cheer(v.id, cmd.side, now);
      v.cheerUntil = now + 3000;
      chipFor(v, `📣 phe ${cmd.side.toUpperCase()}`);
      return true;
    }
    return false;
  }

  onLike(v, n, now) {
    this.score.likes(v.id, n, now);
    if (this.duel.active(now)) this.duel.likes(v.id, n, now);
  }

  onShare(v, now) {
    this.score.share(v.id, now);
  }

  onFollow(v, now) {
    this.score.follow(v.id, now);
  }

  _activeCount(now) {
    let n = 0;
    for (const v of this.ctx.viewers.values()) if (now - v.lastActive < 180000) n++;
    return n;
  }

  /** Cổ vũ đồng thanh: sóng biểu tượng trên đầu những người hô, điểm PK nhỏ, cảnh khán giả nhóm đông nhất. */
  _chorus(hit, now) {
    const { viewers, hud, director, pkActive } = this.ctx;
    const clubs = {};
    for (const id of hit.ids) {
      const w = viewers.get(id);
      if (!w) continue;
      clubs[w.club] = (clubs[w.club] ?? 0) + 1;
      w.cheerUntil = now + 4000;
      this._floatAround(w, ['📣', '✨'], 2);
    }
    const club = Number(Object.keys(clubs).sort((a, b) => clubs[b] - clubs[a])[0]) || 1;
    hud.chip(`📣 ${hit.ids.length} người cùng hô "${hit.key.toUpperCase()}"!`);
    if (pkActive()) for (const [c, n] of Object.entries(clubs)) this.ctx.pkLikes(Number(c), n * this.S.chorusPkLikes);
    director().push({ kind: 'chorus', target: `G${club}`, gifter: null, view: 'stage', focus: null, durMs: this.ctx.shotSec.chorus * 1000 }, now);
    this.ctx.audio.cheer(0.7, 0);
  }

  // ------------------------------------------------------------------ quà
  /** Mọi quà (kể cả quà thường): Center, thách đấu, bạn bè nhảy theo. */
  onAnyGift(v, xu, now) {
    const { chipFor, viewers } = this.ctx;
    if (v.club) {
      this.center.add(v.club, v.id, xu, now);
      this._updateCenters(now);
      if (this.ctx.CFG.coSocial) {
        const need = this.center.needXu(v.club, v.id, now);
        if (need > 0) setTimeout(() => chipFor(v, `⭐ cần ${need.toLocaleString('vi-VN')} xu lên Center`), 1200);
      }
    }
    if (this.duel.active(now)) this.duel.gift(v.id, xu, now);
    for (const w of viewers.values()) {
      if (w.id !== v.id && this.bonds.friendOf(w.id, now) === v.id) {
        w.cheerUntil = now + 3000;
        if (w.actor?.label.onScreen) w.actor.label.flash(`🎉 #${v.no}`);
      }
    }
  }

  /**
   * Quà đã gán hành động GĐ2. @returns {boolean} false = không làm được (không có người để nhắm, người kia bận…) →
   * game.js cho người tặng lên sân khấu như quà thường.
   */
  onGiftAction(v, action, res, p, now) {
    const { chipFor } = this.ctx;
    if (!this.ctx.CFG.coSocial) return false;
    if (VIP_KEY[action]) return this._vip(v, VIP_KEY[action], p, now);
    if (action === 'fireworks' || action === 'fly' || action === 'transform') return this._solo(v, action, now);
    const target = this._target(v, now);
    if (!target) {
      chipFor(v, `💡 gõ "${action === 'pair' ? 'ghép' : action === 'hug' ? 'ôm' : action === 'duel' ? 'thách' : 'ném'} 12" trước để chọn người`);
      return false;
    }
    v.aim = null;
    if (THROW_ITEM[action]) return this._throw(v, target, THROW_ITEM[action], now);
    if (action === 'hug') return this._hug(v, target, now);
    if (action === 'pair') return this._pair(v, target, now);
    if (action === 'duel') return this._startDuel(v, target, res, now);
    return false;
  }

  _vip(v, key, p, now) {
    const vip = new Set(v.vip ?? []);
    const fresh = !vip.has(key);
    vip.add(key);
    v.vip = [...vip].sort();
    this.dress(v);
    this.ctx.chipFor(v, `${VIP_NAME[key]}${fresh ? ' — giữ trọn đời!' : ''}`);
    this._floatAround(v, ['✨', '👑', '💎'], 6);
    const pos = this._pos(v);
    if (pos) this.ctx.effects.confetti(pos.x, pos.y + 2.4, pos.z, this.ctx.LOW ? 40 : 90, 1.6);
    this._push({ kind: 'act', gifter: v.id, focus: v.id, durMs: this.ctx.shotSec.solo * 1000, ...this._viewFor(v) }, now);
    return true;
  }

  _solo(v, action, now) {
    const { effects, LOW, shotSec, chipFor } = this.ctx;
    const pos = this._pos(v);
    if (action === 'fireworks') {
      if (pos) {
        for (let i = 0; i < 3; i++) setTimeout(() => effects.confetti(pos.x + (i - 1) * 1.2, pos.y + 3 + i * 0.4, pos.z, LOW ? 60 : 140, 2.2), i * 450);
        this._floatAround(v, ['🎆', '🎇', '✨'], 8);
      }
      this.ctx.audio.play('confetti', 0.8);
      chipFor(v, '🎆 pháo hoa!');
    } else if (action === 'fly') {
      v.flyUntil = now + this.S.flySec * 1000;
      this._floatAround(v, ['🎈', '🎈', '💖'], 4);
      chipFor(v, '🎈 bay lên!');
    } else {
      v.giantUntil = now + this.S.transformSec * 1000;
      this.dress(v);
      chipFor(v, '🦸 biến khổng lồ!');
    }
    this._push({ kind: 'act', gifter: v.id, focus: v.id, durMs: shotSec.solo * 1000, ...this._viewFor(v) }, now);
    return true;
  }

  _throw(v, w, item, now) {
    const { chipFor, states, setTicker, clubRoom, npcSay, npcs } = this.ctx;
    const r = this.pranks.hit(w.id, item, v.id, now);
    const from = this._pos(v);
    const to = this._pos(w);
    if (to) this._launch(ITEM_EMOJI[item], from, to, () => this._splash(w, item));
    else this._splash(w, item);
    chipFor(w, `${ITEM_EMOJI[item]} từ #${v.no} ${v.name}`);
    const line = r.revenge ? `${v.name} trả đũa ${w.name}! 🔥` : `${v.name} ${ITEM_VERB[item]} ${w.name}!`;
    const room = clubRoom(w.club);
    setTicker(states.get(room.id), `${ITEM_EMOJI[item]} ${line}`, 6);
    npcSay(npcs.speaker(room.id), r.revenge ? `Ối, ${w.name} bị trả đũa rồi!` : `Ối! ${line}`, room);
    if (r.revenge) this.ctx.hud.chip(`🔥 ${v.name} trả đũa ${w.name}!`);
    // trúng cùng 1 người liên tục: chỉ hiệu ứng, không xếp thêm cảnh
    if (now - (w.hitShotAt ?? 0) > 8000) {
      w.hitShotAt = now;
      this._push({ kind: 'act', gifter: v.id, focus: w.id, durMs: this.ctx.shotSec.throw * 1000, ...this._viewFor(w) }, now);
    }
    return true;
  }

  _splash(w, item) {
    this.dress(w);
    const p = this._pos(w);
    if (p) this.ctx.effects.float(item === 'heart' ? '💖' : '💥', p.x, p.y + 2, p.z, { size: 0.9, rise: 0.8, life: 1.2 });
    this.ctx.audio.play(item === 'heart' ? 'heart' : 'whoosh', this.ctx.vol(this.ctx.clubRoom(w.club)) * 0.8);
  }

  /** Cặp ở Sàn Giao Lưu (ôm / nhảy đôi). Hết chỗ hoặc 1 trong 2 bận → chỉ hiệu ứng tại chỗ. */
  _couple(a, b, kind, until) {
    let i = this.couples.findIndex((c) => c && ((c.a === a.id && c.b === b.id) || (c.a === b.id && c.b === a.id)));
    if (i >= 0) {
      this.couples[i] = { ...this.couples[i], kind, until: Math.max(until, this.couples[i].until) };
    } else {
      if (this._busy(a) || this._busy(b)) return false;
      // mỗi người 1 cặp: rời cặp cũ
      for (let j = 0; j < this.couples.length; j++) {
        const c = this.couples[j];
        if (c && [c.a, c.b].some((id) => id === a.id || id === b.id)) {
          this.couples[j] = null;
          for (const id of [c.a, c.b]) if (id !== a.id && id !== b.id) this._reconcileId(id);
        }
      }
      i = this.couples.findIndex((c) => !c);
      if (i < 0) return false;
      this.couples[i] = { a: a.id, b: b.id, kind, until };
    }
    for (const w of [a, b]) {
      this.ctx.reconcile(w);
      this._floatAround(w, ['✨', '💫'], 3); // dịch chuyển tới sàn (khói che kín khung cận nên không dùng)
    }
    return true;
  }

  _hug(v, w, now) {
    const ok = this._couple(v, w, 'hug', now + this.S.hugSec * 1000);
    this._floatAround(w, ['💗', '🤗', '💞'], 6);
    if (ok) this._floatAround(v, ['💗', '🤗'], 3);
    this.ctx.chipFor(w, `🤗 #${v.no} ${v.name} ôm bạn`);
    this.ctx.hud.chip(`🤗 ${v.name} ôm ${w.name}`);
    this._push(ok ? { kind: 'act', gifter: v.id, focus: v.id, focus2: w.id, durMs: this.ctx.shotSec.hug * 1000, view: 'duo', target: 'plaza', face: 0 } : { kind: 'act', gifter: v.id, focus: w.id, durMs: this.ctx.shotSec.hug * 1000, ...this._viewFor(w) }, now);
    return true;
  }

  _pair(v, w, now) {
    const r = this.bonds.pair(v.id, w.id, now);
    if (r === 'self') return false;
    if (r === 'busy') {
      const other = this.bonds.pairOf(w.id, now) ?? this.bonds.pairOf(v.id, now);
      this.ctx.chipFor(v, `💔 #${w.no} đang ghép với #${this.ctx.viewers.get(other)?.no ?? '?'}`);
      return false;
    }
    const pair = this.bonds.pairs(now).find((x) => (x.a === v.id && x.b === w.id) || (x.a === w.id && x.b === v.id));
    const ok = this._couple(v, w, 'pair', pair?.until ?? now + this.ctx.CFG.coPairSec * 1000);
    this._floatAround(w, ['💞', '💖', '💘'], 6);
    this._floatAround(v, ['💞', '💖'], 4);
    this.ctx.hud.chip(r === 'extended' ? `💞 ${v.name} & ${w.name} nhảy thêm!` : `💞 ${v.name} ghép đôi ${w.name}!`);
    this._push(ok ? { kind: 'act', gifter: v.id, focus: v.id, focus2: w.id, durMs: this.ctx.shotSec.pair * 1000, view: 'duo', target: 'plaza', face: 0 } : { kind: 'act', gifter: v.id, focus: w.id, durMs: this.ctx.shotSec.pair * 1000, ...this._viewFor(w) }, now);
    return true;
  }

  // ------------------------------------------------------------------ thách đấu 1–1
  _startDuel(v, w, res, now) {
    const { chipFor, hud, pkActive } = this.ctx;
    if (pkActive()) return chipFor(v, '⏳ thách đấu sau PK nhóm'), false;
    if (this._busy(v) || this._busy(w)) return chipFor(v, `⏳ #${this._busy(v) ? v.no : w.no} đang bận`), false;
    if (!this.duel.active(now) && this.duel.durMs !== undefined && this.duel.durMs !== this.ctx.CFG.coDuelSec * 1000) this.duel = this._newDuel();
    const r = this.duel.start(v.id, w.id, v.club, now);
    if (r !== 'start') {
      chipFor(v, r === 'busy' ? '⏳ đang có thách đấu' : r === 'cooldown' ? '⏳ chờ chút mới thách tiếp' : '🙃 chọn người khác');
      return false;
    }
    this.duelSeen = true;
    // rời cặp ôm / nhảy để ra giữa sàn
    for (let i = 0; i < this.couples.length; i++) {
      const c = this.couples[i];
      if (c && [c.a, c.b].some((id) => id === v.id || id === w.id)) {
        this.couples[i] = null;
        for (const id of [c.a, c.b]) if (id !== v.id && id !== w.id) this._reconcileId(id);
      }
    }
    this.duel.gift(v.id, res.xu, now);
    for (const x of [v, w]) this.ctx.reconcile(x);
    hud.banner({ avatar: v.avatar, name: `🥊 #${v.no} ${v.name} thách #${w.no} ${w.name}`, text: `${this.ctx.CFG.coDuelSec} giây — gõ A ủng hộ ${v.name}, B ủng hộ ${w.name}; quà tính điểm!`, tier: 5 }, now, 4500);
    this.ctx.audio.play('whoosh', 0.8);
    this._push({ kind: 'duel', gifter: null, focus: v.id, focus2: w.id, durMs: this.ctx.CFG.coDuelSec * 1000, view: 'duo', target: 'plaza', face: 0 }, now);
    return true;
  }

  _endDuel(res, now, forfeit = false) {
    const { viewers, hud, effects, LOW } = this.ctx;
    this.duelSeen = false;
    const W = res.winner ? viewers.get(res.winner) : null;
    const Lo = res.loser ? viewers.get(res.loser) : null;
    const sa = Math.floor(res.scores?.a ?? 0);
    const sb = Math.floor(res.scores?.b ?? 0);
    if (!W) hud.banner({ name: '🥊 HÒA!', text: `${sa.toLocaleString('vi-VN')} – ${sb.toLocaleString('vi-VN')}`, tier: 5 }, now, 4500);
    else {
      W.duelWinUntil = now + this.S.duelWinnerMin * 60000;
      hud.banner({ avatar: W.avatar, name: `🏆 #${W.no} ${W.name} THẮNG!`, text: forfeit ? 'đối thủ đã rời đi' : `${sa.toLocaleString('vi-VN')} – ${sb.toLocaleString('vi-VN')}`, sub: Lo ? `${Lo.name} nhảy phạt 😵` : '', tier: 6 }, now, 5500);
      const p = this._pos(W);
      if (p) effects.confetti(p.x, p.y + 3, p.z, LOW ? 80 : 180, 2.5);
      this.ctx.audio.play('win', 0.85);
    }
    if (Lo) Lo.loserUntil = now + this.S.loserDanceSec * 1000;
    for (const id of [res.winner, res.loser]) if (id) this._reconcileId(id);
    // trận vừa dứt: cả 2 về chỗ cũ
    for (const v of viewers.values()) if (v.place?.kind === 'plaza' && !this.placeOf(v, now)) this.ctx.reconcile(v);
    this.ctx.onDuelEnd?.(now);
  }

  /** HUD thanh thách đấu (null = không có). */
  duelHud(now) {
    if (!this.duel.active(now)) return null;
    const { viewers } = this.ctx;
    const A = viewers.get(this.duel.a);
    const B = viewers.get(this.duel.b);
    const sc = this.duel.scores();
    const tot = sc.a + sc.b;
    const trailing = sc.a < sc.b ? 'a' : sc.b < sc.a ? 'b' : null;
    return {
      kind: 'duel', aNo: `#${A?.no ?? '?'}`, bNo: `#${B?.no ?? '?'}`, aName: A?.name ?? '?', bName: B?.name ?? '?', aAv: A?.avatar, bAv: B?.avatar,
      aScore: sc.a, bScore: sc.b, share: tot > 0 ? sc.a / tot : 0.5, left: Math.ceil(this.duel.remaining(now) / 1000),
      final: this.duel.isFinal(now), needXu: trailing ? this.duel.needXu() : 0, trailing, topA: [], topB: [], hint: 'gõ A hoặc B để cổ vũ',
    };
  }

  /** Thách đấu đang chạy: PK nhóm chờ (game.js hỏi trước khi mở PK). */
  duelActive(now) {
    return this.duel.active(now);
  }

  // ------------------------------------------------------------------ nhịp hệ thống (4 lần/giây)
  tick(now, dt = 0.25) {
    const { viewers } = this.ctx;
    // thách đấu hết giờ
    if (this.duelSeen && this.duel.isOver(now)) {
      const r = this.duel.finish(now);
      this.duelSeen = false;
      if (r) this._endDuel(r, now);
    }
    // cặp ôm / nhảy đôi hết giờ
    for (const e of this.bonds.tick(now)) {
      for (let i = 0; i < this.couples.length; i++) {
        const c = this.couples[i];
        if (c?.kind === 'pair' && ((c.a === e.a && c.b === e.b) || (c.a === e.b && c.b === e.a))) this.couples[i] = null;
      }
      this._reconcileId(e.a);
      this._reconcileId(e.b);
    }
    for (let i = 0; i < this.couples.length; i++) {
      const c = this.couples[i];
      if (c && now > c.until) {
        this.couples[i] = null;
        this._reconcileId(c.a);
        this._reconcileId(c.b);
      }
    }
    for (const id of this.pranks.tick(now)) {
      const w = viewers.get(id);
      if (w) this.dress(w);
    }
    for (const v of viewers.values()) {
      if (v.giantUntil && now > v.giantUntil) {
        v.giantUntil = 0;
        this.dress(v);
      }
      if (v.flyUntil && now > v.flyUntil) v.flyUntil = 0;
    }
    this._updateCenters(now);
    this.captainT -= dt;
    if (this.captainT <= 0) {
      this.captainT = 2;
      this._updateCaptains();
    }
    this._fanSpot(now);
  }

  _updateCenters(now) {
    const { viewers, clubRoom, states, setTicker } = this.ctx;
    for (const c of [1, 2, 3, 4, 5]) {
      const h = this.center.holder(c, now);
      // Center cần tối thiểu centerMinXu trong 5 phút (1 bánh 1 xu không thành Center)
      const id = h && h.xu >= (this.S.centerMinXu ?? 30) && viewers.get(h.id)?.club === c ? h.id : null;
      if (this.centers[c] === id) continue;
      const prev = this.centers[c];
      this.centers[c] = id;
      if (prev) this._reconcileId(prev);
      if (id) {
        const v = viewers.get(id);
        this._reconcileId(id);
        setTicker(states.get(clubRoom(c).id), `⭐ ${v.name} giành vị trí CENTER!`, 8);
        this.ctx.chipFor(v, '⭐ bạn là CENTER!');
      }
    }
  }

  _updateCaptains() {
    const { viewers, clubRoom, states, setTicker } = this.ctx;
    const best = {};
    for (const v of viewers.values()) {
      if (!v.club || (v.sessionXu ?? 0) < this.S.captainMinXu) continue;
      const b = best[v.club];
      if (!b || v.sessionXu > b.sessionXu || (v.sessionXu === b.sessionXu && v.id === this.captains[v.club])) best[v.club] = v;
    }
    for (const c of [1, 2, 3, 4, 5]) {
      const id = best[c]?.id ?? null;
      if (this.captains[c] === id) continue;
      const prev = this.captains[c];
      this.captains[c] = id;
      if (prev) {
        const p = viewers.get(prev);
        if (p) this.dress(p);
      }
      if (id) {
        const v = viewers.get(id);
        this.dress(v);
        setTicker(states.get(clubRoom(c).id), `🎖️ ${v.name} là ĐỘI TRƯỞNG — gõ "pk 3" gọi PK, "nhạc" đổi nhạc`, 8);
        this.ctx.chipFor(v, '🎖️ đội trưởng: "pk 1–5" · "nhạc"');
      }
    }
  }

  /** Lệnh đội trưởng (bình luận nguyên câu). @returns {boolean} đã xử lý */
  captainCommand(v, raw, roleCmd, now) {
    if (!this.ctx.CFG.coSocial || !this.isCaptain(v)) return false;
    const s = stripVN(raw);
    const gap = this.S.captainCmdSec * 1000;
    if (roleCmd?.cmd === 'pk') {
      if (now - (v.capPkAt ?? 0) < gap) return this.ctx.chipFor(v, '⏳ chờ chút mới gọi PK'), true;
      if (roleCmd.club === v.club) return this.ctx.chipFor(v, '⚔️ chọn nhóm khác'), true;
      v.capPkAt = now;
      this.ctx.requestPk({ club: v.club, vs: roleCmd.club, by: v.name }, now);
      return true;
    }
    if (s === 'nhac' || s === 'doi nhac') {
      if (raw.trim().toLowerCase() !== s && !['nhạc', 'đổi nhạc'].includes(raw.trim().toLowerCase())) return false;
      if (now - (v.capSongAt ?? 0) < gap) return this.ctx.chipFor(v, '⏳ chờ chút mới đổi nhạc'), true;
      v.capSongAt = now;
      this.ctx.applyGenre(this.ctx.clubRoom(v.club));
      this.ctx.chipFor(v, '🎵 đổi nhạc');
      return true;
    }
    return false;
  }

  /** Cận 5 giây "⭐ fan nổi bật" khi đạo diễn đang rảnh (không chen cảnh quà). */
  _fanSpot(now) {
    const sec = this.ctx.CFG.coFanSpotSec;
    if (!sec || now < this.nextFanAt) return;
    const d = this.ctx.director();
    const cur = d.current;
    if ((cur && cur.kind !== 'idle' && now < cur.endAt) || d.queue.length) return;
    this.nextFanAt = now + sec * 1000;
    const exclude = new Set();
    for (const v of this.ctx.viewers.values()) if (!v.actor || v.actor.hidden || this.ctx.placeKind(v) === 'room') exclude.add(v.id);
    const top = this.score.top(now, { exclude });
    if (!top) return;
    const v = this.ctx.viewers.get(top.id);
    if (!v) return;
    this.score.consume(v.id, now);
    v.fanSpot = now;
    this._push({ kind: 'fan', gifter: null, focus: v.id, durMs: this.ctx.shotSec.fan * 1000, ...this._viewFor(v) }, now);
    this.ctx.chipFor(v, '⭐ fan nổi bật!');
  }

  _push(shot, now) {
    return this.ctx.director().push(shot, now);
  }

  /** Còn quay được không (người còn trong tòa nhà; cảnh thách đấu: trận còn chạy). */
  shotAlive(s, now) {
    if (s.kind === 'duel') return this.duel.active(now);
    if (s.kind === 'act' || s.kind === 'fan') return this.ctx.viewers.has(s.focus) && (!s.focus2 || this.ctx.viewers.has(s.focus2));
    return true;
  }

  /** Dòng "đang lên hình" cho HUD (null = để game.js tự ghi). */
  onAirLabel(v, shot, now) {
    if (shot?.kind === 'fan') return '⭐ fan nổi bật · bình luận, chia sẻ, thả tim';
    if (shot?.kind === 'duel') return `🥊 thách đấu #${this.ctx.viewers.get(shot.focus2)?.no ?? '?'}`;
    if (v.place?.kind === 'plaza') {
      const c = this.couples.find((x) => x && (x.a === v.id || x.b === v.id));
      const o = c ? this.ctx.viewers.get(c.a === v.id ? c.b : c.a) : null;
      if (c) return `${c.kind === 'hug' ? '🤗 ôm' : '💞 nhảy đôi với'} #${o?.no ?? '?'} ${o?.name ?? ''}`;
    }
    if (this.isCenter(v)) return `⭐ CENTER ${this.ctx.CLUB_NO[v.club]} ${this.ctx.clubRoom(v.club).def.name}`;
    return null;
  }

  /** Huy hiệu thêm sau tên. */
  badgeOf(v, now) {
    let b = '';
    if (this.isCenter(v)) b += '⭐';
    if (this.isCaptain(v)) b += '🎖️';
    if ((v.duelWinUntil ?? 0) > now) b += '🏆';
    if (this.bonds.pairOf(v.id, now)) b += '💞';
    return b;
  }

  // ------------------------------------------------------------------ hình mỗi khung
  _pos(v) {
    const bodies = this.ctx.bodyChars(v);
    const c = bodies.find((x) => x.char.root.visible) ?? bodies[0];
    if (!c) return null;
    const p = c.char.root.position;
    return { x: p.x, y: p.y, z: p.z };
  }

  _floatAround(v, emojis, n) {
    const p = this._pos(v);
    if (!p) return;
    for (let i = 0; i < n; i++) this.ctx.effects.float(emojis[i % emojis.length], p.x + (Math.random() - 0.5) * 1.4, p.y + 1.8 + Math.random() * 0.6, p.z + (Math.random() - 0.5) * 1.0, { size: 0.55, rise: 1.1, life: 2 });
  }

  /** Món ném bay vòng cung tới đầu người bị ném (không có người ném trên hình: rơi từ trên cao xuống). */
  _launch(emoji, from, to, onHit) {
    if (this.flying.length > 12) return onHit();
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(emoji), transparent: true, depthWrite: false }));
    s.renderOrder = 6;
    s.scale.set(0.7, 0.7, 0.7);
    const a = from && Math.hypot(from.x - to.x, from.z - to.z) < 40 ? { x: from.x, y: from.y + 1.6, z: from.z } : { x: to.x + 3, y: to.y + 6, z: to.z + 3 };
    const b = { x: to.x, y: to.y + 1.35, z: to.z };
    this.ctx.scene.add(s);
    this.flying.push({ s, a, b, t: 0, dur: 0.8, onHit });
  }

  /** Gọi mỗi khung sau syncActor: món ném bay, nhân vật bay lên bằng bóng bay. */
  frame(dt, now) {
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.s.position.set(f.a.x + (f.b.x - f.a.x) * k, f.a.y + (f.b.y - f.a.y) * k + Math.sin(k * Math.PI) * 2.2, f.a.z + (f.b.z - f.a.z) * k);
      f.s.material.rotation = k * 6;
      if (k >= 1) {
        this.ctx.scene.remove(f.s);
        f.s.material.dispose();
        this.flying.splice(i, 1);
        f.onHit();
      }
    }
    for (const v of this.ctx.viewers.values()) {
      const a = v.actor;
      if (!a || a.hidden || !v.flyUntil || now > v.flyUntil) continue;
      const left = (v.flyUntil - now) / 1000;
      const up = Math.min(1, (this.S.flySec - left) / 1.5) * Math.min(1, left / 1.5);
      a.char.root.position.y += up * (1.4 + Math.sin(now / 400) * 0.15);
    }
  }

  // ------------------------------------------------------------------ lưu / khôi phục buổi LIVE
  toJSON() {
    return {
      tags: this.tags.toJSON(),
      bonds: this.bonds.toJSON(),
      duel: this.duel.toJSON(),
      duelSeen: this.duelSeen,
      pranks: this.pranks.toJSON(),
      center: this.center.toJSON(),
      couples: this.couples,
    };
  }

  load(o) {
    if (!o || typeof o !== 'object') return;
    const C = this.ctx.CFG;
    const S = this.S;
    this.tags = TagBook.fromJSON(o.tags, { max: 99 });
    this.bonds = Bonds.fromJSON(o.bonds, { pairMs: C.coPairSec * 1000, pairMaxMs: S.pairMaxSec * 1000, friendMs: S.friendSec * 1000 });
    this.duel = Duel.fromJSON(o.duel, { durMs: C.coDuelSec * 1000, finalMs: S.duelFinalSec * 1000, cooldownMs: S.duelCooldownSec * 1000, cheerLikes: S.duelCheerLikes });
    this.duelSeen = !!o.duelSeen;
    this.pranks = Pranks.fromJSON(o.pranks, { splatMs: S.splatSec * 1000, revengeMs: S.revengeSec * 1000 });
    this.center = CenterBoard.fromJSON(o.center, { windowMs: S.centerWindowSec * 1000 });
    if (Array.isArray(o.couples)) this.couples = COUPLE_SLOTS.map((_, i) => (o.couples[i] && o.couples[i].a && o.couples[i].b ? { ...o.couples[i] } : null));
    for (const v of this.ctx.viewers.values()) {
      const n = this.tags.numOf(v.id);
      v.no = n ?? this.tags.assign(v.id);
    }
  }
}
