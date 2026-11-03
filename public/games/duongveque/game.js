/* 🛵 Đường Về Quê — overlay OBS 1080×1920 (canvas 2D cuộn ngang + HUD DOM).
 * Luật ở logic.js (thuần, có test). File này: nhận quà/tim/bình luận qua socket.io → game.gift()/like()…, mỗi khung
 * game.step(dt) rồi vẽ cảnh theo game state + sự kiện drainEvents().
 * Thử không cần LIVE: ?demo=1 (người xem ảo tặng quà 2 phe) · bàn phím Space = nhảy, Enter = húc, S = bắt đầu ván.
 * Gỡ lỗi: window.__dvq (game, step(giây), sim(kind,…)).
 */
import { createGame, ACTIONS, ACTION_BY_ID, PENALTIES, metersFor, goalFor, roadEventsFor, flagEveryFor, COUNTER } from './logic.js';
import { ROUTE, provinceIndex, partAt } from './route.js';
import { FOOD } from './food.js';

const Q = new URLSearchParams(location.search);
// SX = chỗ xe streamer đứng (lệch trái để thấy xa phía trước — vật cản, xe container, lốc xoáy lao tới từ bên phải)
// PX = điểm ảnh / mét · VS = cỡ xe & vật thể (nhỏ → bản đồ trông rộng) · ROAD_H = bề dày mặt đường
let SX = 330;   // đổi theo loại xe: xe dài đứng lùi vào giữa để cả thân xe nằm trong khung
const W = 1080, H = 1920, ROAD = 1150, ROAD_H0 = 50, LANE0 = 34, PX0 = 26, VS0 = 0.5;
let ROAD_H = ROAD_H0, LANE = LANE0;
let PX = PX0, VS = VS0, zoom = 1;   // đoàn 2–3 xe: thu nhỏ cả cảnh cho vừa khung
const S = v => v * VS;
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Math.round(n).toLocaleString('vi-VN');
const dtx = m => (Math.abs(m) >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${fmt(m)} m`);   // 850 m · 2,4 km
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
function hash(i, s = 0) { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); }

// ---------------- cấu hình ----------------
const VIEW = { vehicle: 'bus', streamerName: 'Streamer', sound: true, showLegend: true, giftMap: {}, bike: 'red', penalties: PENALTIES.slice() };
let gameCfg = {};
function applyServerConfig(c) {
  if (!c || typeof c !== 'object') return;
  const n = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  gameCfg = {
    roundSec: n(c.dvqRoundSec, 240), finalSec: n(c.dvqFinalSec, 30),
    speed: n(c.dvqSpeed, 100) / 3.6, fuelBurn: n(c.dvqFuelBurn, 3), meterPerCoin: n(c.dvqMeterPerCoin, 5),
    likePer: n(c.dvqLikePer, 300), ramCd: n(c.dvqRamCd, 12), dodgeMax: Number(c.dvqDodgeMax ?? 10) || 0,
    autoPilot: c.dvqControl !== 'streamer', driverSec: n(c.dvqDriverSec, 180), seats: n(c.dvqSeats, 14), maxCars: n(c.dvqMaxCars, 3),
    restStop: c.dvqRestStop !== false, gasStop: c.dvqGasStop !== false, police: c.dvqPolice !== false, policeLikes: n(c.dvqPoliceLikes, 2000), autoNext: c.dvqAutoNext !== false, defaultSide: c.dvqDefaultSide === 'pha' ? 'pha' : 'cuu',
  };
  if (Q.get('sec')) gameCfg.roundSec = Number(Q.get('sec'));
  // quãng đường: 0 / trống = tự theo thời gian ván (25 m/giây) → mỗi tỉnh ~1/34 thời gian ván
  gameCfg.goal = Number(Q.get('goal')) || (Number(c.dvqGoal) > 0 ? Number(c.dvqGoal) : goalFor(gameCfg.roundSec));
  gameCfg.roadEvents = c.dvqRoadEvents === false ? 0 : roadEventsFor(gameCfg.roundSec);
  gameCfg.flagEvery = flagEveryFor(gameCfg.goal);
  game.setConfig(gameCfg);
  VIEW.streamerName = String(c.dvqStreamerName || '').trim() || 'Streamer';
  VIEW.sound = c.dvqSound !== false && Q.get('mute') !== '1';
  VIEW.showLegend = c.dvqShowLegend !== false;
  VIEW.giftMap = c.dvqGiftMap && typeof c.dvqGiftMap === 'object' ? c.dvqGiftMap : {};
  VIEW.bike = c.dvqBike || 'green';
  VIEW.vehicle = ['bus', 'oxcart', 'scooter'].includes(c.dvqVehicle) ? c.dvqVehicle : 'bus';
  if (['bus', 'oxcart', 'scooter'].includes(Q.get('veh'))) VIEW.vehicle = Q.get('veh');   // thử nhanh: ?veh=oxcart
  SX = VIEW.vehicle === 'scooter' ? 230 : 330;
  const pen = String(c.dvqPenalties || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  VIEW.penalties = pen.length ? pen : PENALTIES.slice();
  buildLegend();
}

const game = createGame({ lobbySec: Number(Q.get('lobby')) || 8 });

// ---------------- khung 9:16 ----------------
const stage = $('stage');
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  stage.style.left = '0'; stage.style.top = '0';
  stage.style.transform = `translate(${(innerWidth - W * s) / 2}px, ${(innerHeight - H * s) / 2}px) scale(${s})`;
}
addEventListener('resize', fit); fit();
const cv = $('c'), ctx = cv.getContext('2d');

// ---------------- ảnh đại diện ----------------
const IMG = new Map();
function img(url) {
  if (!url) return null;
  let im = IMG.get(url);
  if (!im) {
    im = new Image(); im.crossOrigin = 'anonymous'; im.referrerPolicy = 'no-referrer'; im.src = url; IMG.set(url, im);
    im.onerror = () => { im.bad = true; };
    if (IMG.size > 300) IMG.delete(IMG.keys().next().value);
  }
  return im.complete && !im.bad && im.naturalWidth ? im : null;
}
const AV_COLORS = ['#f6a21e', '#2fa4e7', '#e2557b', '#7b61ff', '#18b37e', '#ff7a2f'];
const AV_SPR = new Map();
function avatarSprite(u, r, ring) {
  const im = img(u && u.avatar), rr = Math.max(4, Math.round(r));
  const key = `${(u && (u.id || u.name)) || '?'}|${rr}|${ring}|${im ? 1 : 0}`;
  let c = AV_SPR.get(key);
  if (c) return c;
  const q = 2, R = (rr + 3) * q;   // vẽ gấp đôi cho nét
  c = document.createElement('canvas'); c.width = c.height = R * 2;
  const x = c.getContext('2d');
  x.beginPath(); x.arc(R, R, R, 0, Math.PI * 2); x.fillStyle = ring; x.fill();
  x.beginPath(); x.arc(R, R, rr * q, 0, Math.PI * 2); x.clip();
  if (im) x.drawImage(im, R - rr * q, R - rr * q, rr * q * 2, rr * q * 2);
  else {
    const name = (u && u.name) || '?';
    x.fillStyle = AV_COLORS[(name.charCodeAt(0) || 0) % AV_COLORS.length]; x.fillRect(0, 0, R * 2, R * 2);
    x.fillStyle = '#fff'; x.font = `800 ${Math.round(rr * q * 1.1)}px 'Be Vietnam Pro', sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText((name.match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase(), R, R + rr * q * 0.08);   // bỏ emoji đầu tên (🧑‍✈️…)
  }
  AV_SPR.set(key, c);
  if (AV_SPR.size > 700) AV_SPR.delete(AV_SPR.keys().next().value);
  return c;
}
function avatar(x, y, r, u, ring = '#fff') {
  const c = avatarSprite(u, r, ring), d = (Math.max(4, Math.round(r)) + 3) * 2;
  ctx.drawImage(c, x - d / 2, y - d / 2, d, d);
}
function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
// ---- lớp xếp nhãn: trong render, nhãn tên + bong bóng thoại được gom vào LBL rồi xếp chống chồng ở cuối khung ----
let LBL = null;
function placeLabel(box, prio, draw) {
  if (!LBL) return draw(0);
  LBL.push({ ...box, prio, draw, i: LBL.length });
}
function layoutLabels() {
  const list = LBL; LBL = null;
  list.sort((a, b) => a.prio - b.prio || a.i - b.i);
  const placed = [];
  const hits = (b, q) => b.x < q.x + q.w + 8 && b.x + b.w + 8 > q.x && b.y < q.y + q.h + 6 && b.y + b.h + 6 > q.y;
  for (const L of list) {
    let dy = 0;
    for (let n = 0; n < 16; n++) {
      const b = { x: L.x, y: L.y + dy, w: L.w, h: L.h };
      const q = placed.find(o => hits(b, o));
      if (!q) break;
      dy = q.y - 8 - L.h - L.y;                 // nhảy lên ngay trên nhãn bị đè
    }
    if (L.y + dy < 470) dy = 470 - L.y;         // không chui lên vùng HUD
    placed.push({ x: L.x, y: L.y + dy, w: L.w, h: L.h });
    L.draw(dy);
  }
}
function tag(x, y, u, color = 'rgba(22,26,36,.86)', size = 26, max = 16, prio = 1) {
  const name = String((u && u.name) || '').slice(0, max);
  ctx.font = `800 ${size}px 'Be Vietnam Pro', sans-serif`;
  const tw = ctx.measureText(name).width, r = size * 0.7, w = tw + r * 2 + 26, h = size + 14;
  placeLabel({ x: x - w / 2, y: y - h, w, h }, prio, dy => tagDraw(x, y + dy, u, name, color, size, w, h, r));
}
function tagDraw(x, y, u, name, color, size, w, h, r) {
  ctx.font = `800 ${size}px 'Be Vietnam Pro', sans-serif`;
  rrect(x - w / 2, y - h, w, h, h / 2); ctx.fillStyle = color; ctx.fill();
  avatar(x - w / 2 + r + 4, y - h / 2, r, u);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(name, x - w / 2 + r * 2 + 14, y - h / 2 + 2);
}

// ---------------- đường & cảnh: tuyến Mũi Cà Mau → Cột cờ Lũng Cú (route.js, 34 tỉnh) ----------------
const roadTop = m => ROAD + 26 * Math.sin(m / 21) + 12 * Math.sin(m / 8.7 + 1.3);
const contactY = m => roadTop(m) + LANE;
const meterAt = x => cam + (x - SX) / PX;
const xAt = m => SX + (m - cam) * PX;
let cam = 0;          // mét của camera (bám xe, mượt)
// bầu trời theo giờ trong ngày (bình minh Cà Mau → hoàng hôn Hà Giang)
const SKY = [
  { top: '#7fb6ea', bot: '#ffd9a8' }, { top: '#3fa3f0', bot: '#cdeeff' },
  { top: '#3a8bd6', bot: '#ffe9b8' }, { top: '#ff9d6a', bot: '#ffe48f' },
];
// màu theo kiểu cảnh
const BIO = {
  delta:    { mtn: '#8fb9a6', mtn2: '#6f9e86', asphalt: '#525661', amp: 70 },
  fields:   { mtn: '#9bbcb0', mtn2: '#7aa48f', asphalt: '#525661', amp: 100 },
  city:     { mtn: '#9fb3c9', mtn2: '#7f97b1', asphalt: '#4b505b', amp: 110 },
  highland: { mtn: '#6f9a80', mtn2: '#4f7d62', asphalt: '#5a4f4a', amp: 210 },
  coast:    { mtn: '#7a9cba', mtn2: '#5d84a6', asphalt: '#4f535d', amp: 230 },
  heritage: { mtn: '#a7a3b8', mtn2: '#8b86a0', asphalt: '#55504e', amp: 110 },
  karst:    { mtn: '#8aa69a', mtn2: '#6a8a7c', asphalt: '#4f5655', amp: 60 },
  mountain: { mtn: '#6d8fa8', mtn2: '#4e7a68', asphalt: '#4d5257', amp: 340 },
};
function hex(c) { const v = parseInt(c.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
function mix(a, b, t) { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`; }
const NP = ROUTE.length;
const provIdx = m => provinceIndex(m, game.cfg.goal);
const biomeAt = m => partAt(m, game.cfg.goal).part.biome;   // cảnh theo TỈNH CŨ đang đi qua (route.js PARTS)
const stageIdx = biomeAt;   // tên cũ, giữ cho đoạn khác gọi
/** màu cảnh tại m: 18% cuối mỗi tỉnh pha dần sang tỉnh kế */
function bioColor(m, key) {
  const goal = game.cfg.goal, P = partAt(m, goal), len = goal / NP / P.n, f = clamp((Math.max(0, m) - P.from) / len, 0, 1);
  const a = BIO[P.part.biome][key], b = BIO[partAt(P.from + len + 0.5, goal).part.biome][key], k = f > 0.82 ? (f - 0.82) / 0.18 : 0;   // 18% cuối đoạn pha sang tỉnh kế
  return typeof a === 'number' ? lerp(a, b, k) : mix(a, b, k);
}
const stageColor = bioColor;

let T = 0; // giây kể từ khi mở

function drawSky() {
  const p = clamp(cam / game.cfg.goal, 0, 1), s = p * 3, i = Math.min(2, Math.floor(s)), f = s - i;
  const g = ctx.createLinearGradient(0, 0, 0, ROAD);
  g.addColorStop(0, mix(SKY[i].top, SKY[i + 1].top, f)); g.addColorStop(1, mix(SKY[i].bot, SKY[i + 1].bot, f));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, ROAD + 60);
  const sx = lerp(180, 900, p), sy = 640 - Math.sin(p * Math.PI) * 140 + p * 90;
  const sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 170);
  sg.addColorStop(0, 'rgba(255,250,220,.95)'); sg.addColorStop(0.35, 'rgba(255,220,140,.45)'); sg.addColorStop(1, 'rgba(255,220,140,0)');
  ctx.fillStyle = sg; ctx.fillRect(sx - 180, sy - 180, 360, 360);
  ctx.beginPath(); ctx.arc(sx, sy, 58, 0, Math.PI * 2); ctx.fillStyle = p > 0.75 ? '#ffd36e' : '#fff6d6'; ctx.fill();
  const off = cam * PX * 0.06 + T * 14;
  for (let i2 = Math.floor(off / 420) - 1; i2 < Math.floor(off / 420) + 4; i2++) {
    const x = i2 * 420 - off + hash(i2, 1) * 160, y = 470 + hash(i2, 2) * 300, sc = 0.7 + hash(i2, 3) * 0.7;
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(x + k * 34 * sc, y - Math.sin(k * 1.3) * 18 * sc, (30 + hash(i2 * 7 + k, 4) * 22) * sc, 0, Math.PI * 2); ctx.fill(); }
  }
}
function ridge(f, base, amp, color, seed) {
  const off = cam * PX * f;
  ctx.beginPath(); ctx.moveTo(0, ROAD + 40);
  for (let x = 0; x <= W; x += 24) {
    const u = (x + off) / 300;
    const y = base - amp * (0.55 + 0.3 * Math.sin(u * 1.7 + seed) + 0.15 * Math.sin(u * 4.1 + seed * 2) + 0.12 * Math.sin(u * 0.6));
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, ROAD + 40); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}
// núi đá vôi dạng tháp (Ninh Bình, Hạ Long, Cao Bằng, Hà Giang)
function karstTowers(f, base, color, seed, hMax) {
  const tile = 150, off = cam * PX * f, i0 = Math.floor(off / tile) - 2;
  ctx.fillStyle = color;
  for (let i = i0; i < i0 + 11; i++) {
    const m = (i * tile) / (PX * f);
    if (biomeAt(m) !== 'karst') continue;
    const x = i * tile - off + hash(i, seed) * 60, w = 70 + hash(i, seed + 1) * 70, h = hMax * (0.45 + hash(i, seed + 2) * 0.55);
    ctx.beginPath(); ctx.moveTo(x - w * 0.62, base);
    ctx.bezierCurveTo(x - w * 0.62, base - h * 0.55, x - w * 0.42, base - h, x, base - h);
    ctx.bezierCurveTo(x + w * 0.42, base - h, x + w * 0.62, base - h * 0.5, x + w * 0.6, base);
    ctx.closePath(); ctx.fill();
  }
}
function drawFar() {
  const amp = bioColor(cam, 'amp');
  ridge(0.12, 950, amp, bioColor(cam, 'mtn'), 1);
  karstTowers(0.16, 1010, bioColor(cam, 'mtn'), 11, 360);
  ridge(0.22, 1030, amp * 0.65, bioColor(cam, 'mtn2'), 4);
  karstTowers(0.3, 1090, bioColor(cam, 'mtn2'), 23, 260);
}
// ---- lớp giữa (0,45): mỗi ô 210 px vẽ theo kiểu cảnh của tỉnh ở ô đó ----
function drawMid() {
  const f = 0.45, tile = 210, off = cam * PX * f;
  const i0 = Math.floor(off / tile) - 1;
  for (let i = i0; i < i0 + 8; i++) {
    const x = i * tile - off, m = (i * tile) / (PX * f), r = hash(i, 9), base = 1120;
    const P = partAt(m, game.cfg.goal).part;
    const fe = hash(i, 15) < 0.62 && FEAT[P.feats[Math.floor(hash(i, 16) * P.feats.length)]];   // nét đặc trưng tỉnh cũ (quạt gió Bạc Liêu, tháp Chăm, đồi chè…)
    (fe || MID[P.biome] || MID.fields)(x, base, r, i, tile);
  }
}
function stiltHouse(x, base, roof = '#8b5e34', s = 1) {
  ctx.save(); ctx.translate(x, base); ctx.scale(s, s);
  ctx.strokeStyle = '#6b4226'; ctx.lineWidth = 6; for (const dx of [8, 40, 72, 104]) { ctx.beginPath(); ctx.moveTo(dx, 0); ctx.lineTo(dx, -40); ctx.stroke(); }
  ctx.fillStyle = '#c9a26a'; ctx.fillRect(0, -88, 112, 48);
  ctx.fillStyle = roof; ctx.beginPath(); ctx.moveTo(-14, -84); ctx.lineTo(56, -140); ctx.lineTo(126, -84); ctx.fill();
  ctx.fillStyle = '#5a3d22'; ctx.fillRect(44, -76, 22, 30);
  ctx.restore();
}
function boat(x, y, s = 1, fruit = false) {
  ctx.save(); ctx.translate(x, y + Math.sin(T * 2 + x) * 2); ctx.scale(s, s);
  ctx.fillStyle = '#7a4a26'; ctx.beginPath(); ctx.moveTo(-70, -10); ctx.quadraticCurveTo(0, 22, 70, -10); ctx.lineTo(56, -2); ctx.quadraticCurveTo(0, 14, -56, -2); ctx.fill();
  ctx.fillStyle = '#5a3418'; ctx.beginPath(); ctx.moveTo(-60, -8); ctx.quadraticCurveTo(0, 10, 60, -8); ctx.lineTo(60, -12); ctx.lineTo(-60, -12); ctx.fill();
  if (fruit) for (let k = 0; k < 6; k++) { ctx.fillStyle = ['#ffb020', '#e8322c', '#7cc04a'][k % 3]; ctx.beginPath(); ctx.arc(-34 + k * 13, -18 - (k % 2) * 6, 8, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#f1d488'; ctx.beginPath(); ctx.moveTo(30, -26); ctx.lineTo(44, -46); ctx.lineTo(58, -26); ctx.fill();   // nón lá người chèo
  ctx.fillStyle = '#4b6fb3'; ctx.fillRect(38, -26, 12, 16);
  ctx.restore();
}
function water(x, y, w, h, c1 = '#5ec2e8', c2 = '#2b86c4') {
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.fillRect(x, y, w + 1, h);
  ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 3;
  for (let k = 0; k < 3; k++) { const yy = y + 10 + k * h / 3, xx = x + ((T * 30 + k * 60 + x * 0.3) % w); ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + 26, yy); ctx.stroke(); }
}
const MID = {
  city(x, base, r, i) {
    const w = 130 + r * 70, h = 180 + hash(i, 10) * 280;
    const cols = ['#e7b38c', '#d7e3ef', '#f2d17d', '#c9d8a6', '#e6a7a2', '#b8c9e6'];
    ctx.fillStyle = cols[Math.floor(hash(i, 11) * cols.length)]; ctx.fillRect(x, base - h, w, h);
    ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(x + w - 14, base - h, 14, h);
    ctx.fillStyle = 'rgba(60,90,130,.55)';
    for (let yy = base - h + 22; yy < base - 40; yy += 46) for (let xx = x + 16; xx < x + w - 26; xx += 34) ctx.fillRect(xx, yy, 18, 24);
    if (r > 0.55) { ctx.fillStyle = r > 0.8 ? '#e2382c' : '#1f6fd1'; rrect(x + 10, base - h - 34, w - 20, 30, 6); ctx.fill(); }
  },
  fields(x, base, r, i) {
    ctx.fillStyle = '#5f9e3c';
    for (let k = 0; k < 3; k++) { const tx = x + k * 70 + r * 30, th = 70 + hash(i * 3 + k, 12) * 60; ctx.beginPath(); ctx.ellipse(tx, base - th, 34, th * 0.6, 0, 0, Math.PI * 2); ctx.fill(); }
    if (r > 0.7) { ctx.fillStyle = '#8b5e34'; ctx.fillRect(x + 120, base - 60, 60, 60); ctx.fillStyle = '#c9a25a'; ctx.beginPath(); ctx.moveTo(x + 105, base - 58); ctx.lineTo(x + 150, base - 108); ctx.lineTo(x + 195, base - 58); ctx.fill(); }
  },
  delta(x, base, r, i, tile) {
    water(x, base - 70, tile, 74, '#7cc3c9', '#3f8f98');
    ctx.fillStyle = '#4f9a2c'; ctx.fillRect(x, base - 80, tile + 1, 12);
    if (r > 0.45) stiltHouse(x + 60, base - 70, '#a0744a', 0.75);
    if (r < 0.35 || r > 0.8) boat(x + 120, base - 30, 0.7, true);
    palm(x + 30, base - 76);
  },
  highland(x, base, r, i) {
    ctx.fillStyle = '#9a4f2e'; ctx.fillRect(x, base - 26, 211, 26);           // đất đỏ bazan
    for (let k = 0; k < 4; k++) { const px = x + 20 + k * 50 + hash(i * 4 + k, 13) * 20; pine(px, base - 20); }
    if (r > 0.72) {                                                             // nhà rông
      ctx.fillStyle = '#6b4226'; ctx.fillRect(x + 120, base - 70, 70, 50);
      ctx.fillStyle = '#c9a25a'; ctx.beginPath(); ctx.moveTo(x + 112, base - 66); ctx.lineTo(x + 155, base - 210); ctx.lineTo(x + 198, base - 66); ctx.fill();
    }
  },
  coast(x, base, r, i, tile) {
    water(x, base - 90, tile, 100);
    if (r > 0.75) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x + 80, base - 80); ctx.lineTo(x + 80, base - 130); ctx.lineTo(x + 112, base - 84); ctx.fill(); ctx.fillStyle = '#8b5e34'; ctx.fillRect(x + 62, base - 82, 60, 10); }
  },
  heritage(x, base, r) {
    ctx.fillStyle = '#d9b65a'; ctx.fillRect(x, base - 70, 211, 70);            // tường thành
    ctx.fillStyle = '#b89640'; for (let k = 0; k < 7; k++) ctx.fillRect(x + k * 32, base - 84, 18, 16);
    if (r > 0.55) {                                                             // cổng mái cong
      ctx.fillStyle = '#9b2d20'; ctx.fillRect(x + 70, base - 140, 70, 70);
      ctx.fillStyle = '#6b4226'; ctx.beginPath(); ctx.moveTo(x + 46, base - 136); ctx.quadraticCurveTo(x + 105, base - 190, x + 164, base - 136); ctx.fill();
      ctx.fillStyle = '#ffd23a'; ctx.fillRect(x + 95, base - 126, 20, 26);
    }
  },
  karst(x, base, r, i, tile) {
    water(x, base - 50, tile, 54, '#6fb3a8', '#3e8478');
    if (r > 0.5) boat(x + 100, base - 18, 0.6);
    ctx.fillStyle = '#6a8a7c';
    const h = 90 + r * 90; ctx.beginPath(); ctx.moveTo(x + 20, base - 50); ctx.bezierCurveTo(x + 20, base - 50 - h, x + 90, base - 50 - h, x + 90, base - 50); ctx.fill();
  },
  mountain(x, base, r, i) {
    for (let k = 0; k < 4; k++) { ctx.fillStyle = k % 2 ? '#7cb342' : '#9ccc65'; ctx.beginPath(); ctx.ellipse(x + 105, base - k * 22, 120 - k * 22, 22, 0, Math.PI, 0); ctx.fill(); }   // ruộng bậc thang
    if (r > 0.55) stiltHouse(x + 30, base - 40, '#5a4632', 0.6);
    if (r < 0.3) { ctx.fillStyle = '#fbe3ea'; for (let k = 0; k < 14; k++) { ctx.beginPath(); ctx.arc(x + 150 + Math.cos(k) * 26, base - 110 + Math.sin(k * 1.7) * 18, 7, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = '#6b4226'; ctx.fillRect(x + 147, base - 100, 6, 60); }
  },
};
// ---- nét đặc trưng theo TỈNH CŨ (route.js PARTS[].feats): vẽ chen vào lớp giữa, mỗi ô 210 px; x = mép trái ô, b = chân ô ----
function fpoly(c, ...pts) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]); ctx.closePath(); ctx.fill(); }
function fcirc(c, x, y, r) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function frect(c, x, y, w, h) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
function fline(c, w, ...pts) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]); ctx.stroke(); }
function fruitTree(x, b, leaf, fruit, s = 1) { tree(x, b, leaf, 0.75 * s); for (let k = 0; k < 9; k++) fcirc(fruit, x + Math.cos(k * 2.1) * 42 * s, b - 120 * s + Math.sin(k * 1.7) * 30 * s, 6 * s); }
function curvedRoof(x, y, w, h, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x - 14, y + 4); ctx.quadraticCurveTo(x + w / 2, y - h * 0.4, x + w + 14, y + 4); ctx.lineTo(x + w - 4, y - h); ctx.lineTo(x + 4, y - h); ctx.closePath(); ctx.fill(); fpoly(c, x - 20, y + 6, x - 6, y - 6, x - 2, y + 4); fpoly(c, x + w + 20, y + 6, x + w + 6, y - 6, x + w + 2, y + 4); }
function seaStrip(x, b, w) { water(x, b - 60, w, 64, '#6ccbe8', '#2f8fc4'); }
const FEAT = {
  mangrove(x, b, r, i, w) { water(x, b - 50, w, 54, '#6fae9a', '#3d7f6c'); for (let k = 0; k < 4; k++) { const cx = x + 25 + k * 52; for (let j = -2; j <= 2; j++) fline('#5a4030', 4, cx + j * 8, b - 30, cx + j * 14, b - 6); fcirc('#2f6e3a', cx, b - 60, 30); fcirc('#3f8a44', cx + 16, b - 74, 22); } },
  fishboats(x, b, r, i, w) { seaStrip(x, b, w); for (let k = 0; k < 2; k++) { const bx = x + 50 + k * 100, by = b - 34 + Math.sin(T * 2 + k) * 3; fpoly(k ? '#2f6bd8' : '#1f9a5a', bx - 44, by - 16, bx + 44, by - 16, bx + 30, by + 6, bx - 30, by + 6); frect('#e8322c', bx - 44, by - 20, 88, 6); fcirc('#fff', bx + 30, by - 8, 5); fcirc('#111', bx + 31, by - 8, 2.5); fline('#7a5a3a', 3, bx, by - 20, bx, by - 70); fpoly('#e8322c', bx, by - 68, bx + 26, by - 56, bx, by - 44); } },
  wind(x, b, r, i) { for (let k = 0; k < 2; k++) { const px = x + 60 + k * 100, top = b - 230 - k * 30; fpoly('#f2f4f7', px - 5, b, px + 5, b, px + 2, top, px - 2, top); for (let j = 0; j < 3; j++) { const a = T * 2.2 + k + j * 2.094; fline('#ffffff', 7, px, top, px + Math.cos(a) * 70, top + Math.sin(a) * 70); } fcirc('#d9dde3', px, top, 7); } },
  salt(x, b, r, i, w) { frect('#b8c7cf', x, b - 30, w, 30); for (let k = 0; k < 5; k++) { const cx = x + 22 + k * 42; fpoly('#ffffff', cx - 20, b - 12, cx + 20, b - 12, cx, b - 46); } fline('#8aa0ac', 3, x, b - 30, x + w, b - 30); },
  mansion(x, b) { frect('#f2d27d', x + 30, b - 120, 150, 120); fpoly('#b8442c', x + 20, b - 120, x + 190, b - 120, x + 105, b - 168); for (let k = 0; k < 5; k++) frect('#fffaf0', x + 40 + k * 30, b - 110, 10, 100); frect('#4a3322', x + 92, b - 60, 26, 60); },
  khmer(x, b) { frect('#f2c14e', x + 50, b - 70, 110, 70); for (let k = 0; k < 3; k++) fpoly(k % 2 ? '#e8822c' : '#d4462c', x + 40 + k * 12, b - 70 - k * 34, x + 170 - k * 12, b - 70 - k * 34, x + 105, b - 110 - k * 34); fline('#ffd23a', 4, x + 105, b - 170, x + 105, b - 215); fpoly('#ffd23a', x + 34, b - 74, x + 44, b - 92, x + 50, b - 72); fpoly('#ffd23a', x + 176, b - 74, x + 166, b - 92, x + 160, b - 72); },
  rice(x, b, r, i, w) { frect('#8cc63f', x, b - 34, w, 34); for (let k = 0; k < 6; k++) fline('#6aa82e', 3, x, b - 30 + k * 6, x + w, b - 30 + k * 6); if (r > 0.4) { const fx = x + 60 + r * 80; fline('#3a5a8a', 6, fx, b - 30, fx, b - 54); fcirc('#ffd3ad', fx, b - 62, 7); fpoly('#eedfaa', fx - 18, b - 62, fx + 18, b - 62, fx, b - 82); } },
  palmyra(x, b) { for (let k = 0; k < 3; k++) { const px = x + 40 + k * 65, top = b - 210 - k * 18; fline('#5a4030', 8, px, b, px, top); for (let j = 0; j < 9; j++) { const a = Math.PI + j / 8 * Math.PI; fline('#3f7f2c', 5, px, top, px + Math.cos(a) * 40, top + Math.sin(a) * 34); } fcirc('#4f8f34', px, top, 18); } },
  coconut(x, b) { palm(x + 40, b); palm(x + 150, b + 6); },
  floating(x, b, r, i, w) { water(x, b - 60, w, 64, '#7cc3c9', '#3f8f98'); boat(x + 60, b - 30, 0.75, true); boat(x + 160, b - 22, 0.6, true); fline('#6b4226', 4, x + 60, b - 44, x + 60, b - 150); for (let k = 0; k < 4; k++) fcirc(['#ffb020', '#7cc04a', '#e8322c', '#c58b2a'][k], x + 60, b - 140 + k * 14, 7); },
  bridge(x, b, r, i, w) { const cx = x + w / 2; fpoly('#d9dde3', cx - 30, b - 30, cx - 6, b - 220, cx + 6, b - 220, cx + 30, b - 30); for (let k = 1; k <= 5; k++) { fline('rgba(240,240,240,.9)', 2, cx, b - 210 + k * 6, cx - k * 22, b - 40); fline('rgba(240,240,240,.9)', 2, cx, b - 210 + k * 6, cx + k * 22, b - 40); } frect('#8a8f99', x, b - 44, w + 1, 12); },
  fruit(x, b, r) { fruitTree(x + 50, b, '#3f8a34', r > 0.5 ? '#ffb020' : '#e8322c'); fruitTree(x + 150, b, '#4f9a3c', '#7cc04a'); },
  island(x, b, r, i, w) { seaStrip(x, b, w); ctx.fillStyle = '#5f9a52'; ctx.beginPath(); ctx.ellipse(x + 110, b - 54, 90, 50, 0, Math.PI, 0); ctx.fill(); frect('#e9d39a', x + 22, b - 58, 176, 8); palm(x + 120, b - 90); },
  beach(x, b, r, i, w) { seaStrip(x, b, w); frect('#f0dca0', x, b - 22, w + 1, 22); for (let k = 0; k < 2; k++) { const ux = x + 60 + k * 90; fline('#7a5a3a', 3, ux, b - 6, ux, b - 70); fpoly(k ? '#2f8fd8' : '#e8322c', ux - 36, b - 64, ux + 36, b - 64, ux, b - 92); } },
  hill(x, b) { ctx.fillStyle = '#6f9a72'; ctx.beginPath(); ctx.moveTo(x - 20, b); ctx.quadraticCurveTo(x + 105, b - 330, x + 230, b); ctx.fill(); fcirc('#e8322c', x + 105, b - 160, 5); },
  lotus(x, b, r, i, w) { water(x, b - 50, w, 54, '#6fb3a8', '#3e8478'); for (let k = 0; k < 7; k++) { const lx = x + 16 + k * 30, ly = b - 34 + (k % 2) * 12; ctx.fillStyle = '#3f9a4a'; ctx.beginPath(); ctx.ellipse(lx, ly, 18, 6, 0, 0, Math.PI * 2); ctx.fill(); if (k % 2 === 0) { fline('#3f8a3a', 3, lx, ly, lx, ly - 34); fpoly('#f48fb6', lx - 10, ly - 34, lx + 10, ly - 34, lx, ly - 56); } } },
  kiln(x, b) { for (let k = 0; k < 2; k++) { const kx = x + 55 + k * 95; ctx.fillStyle = k ? '#b5532e' : '#a3472a'; ctx.beginPath(); ctx.ellipse(kx, b, 44, 64, 0, Math.PI, 0); ctx.fill(); frect('#8a3a22', kx + 18, b - 110, 12, 60); fcirc('rgba(200,200,200,.6)', kx + 24 + Math.sin(T + k) * 6, b - 124 - (T * 20 % 30), 10); } },
  dragonfruit(x, b) { for (let k = 0; k < 4; k++) { const px = x + 25 + k * 50; frect('#b0aca2', px - 4, b - 70, 8, 70); for (let j = 0; j < 6; j++) fline('#4fae46', 5, px, b - 70, px + Math.cos(j * 1.05) * 26, b - 70 + Math.abs(Math.sin(j * 1.05)) * 26); fcirc('#e8327c', px - 14, b - 56, 7); fcirc('#e8327c', px + 16, b - 50, 7); } },
  village(x, b) { frect('#c9b48a', x + 30, b - 100, 80, 100); frect('#5a4030', x + 52, b - 70, 36, 70); curvedRoof(x + 22, b - 100, 96, 26, '#7a3a22'); tree(x + 165, b, '#3f7f34', 1.05); },
  caodai(x, b) { frect('#f2e9c8', x + 40, b - 110, 130, 110); for (const tx of [x + 40, x + 146]) { frect('#f2d27d', tx, b - 190, 24, 190); fpoly('#d4462c', tx - 6, b - 190, tx + 30, b - 190, tx + 12, b - 220); } frect('#2f6bd8', x + 80, b - 80, 50, 50); fcirc('#ffd23a', x + 105, b - 56, 12); },
  rubber(x, b) { for (let k = 0; k < 5; k++) { const tx = x + 15 + k * 44; frect('#9a8a76', tx - 4, b - 120, 8, 120); fcirc('#3f7a3a', tx, b - 140, 30); fcirc('#4a8a44', tx + 12, b - 156, 22); } },
  tower81(x, b) { const cx = x + 105; fpoly('#a9c4dc', cx - 30, b, cx + 30, b, cx + 18, b - 420, cx - 18, b - 420); fpoly('#c4d9ea', cx - 18, b - 420, cx + 18, b - 420, cx + 8, b - 470, cx - 8, b - 470); fline('#e8eef4', 3, cx, b - 470, cx, b - 500); for (let k = 0; k < 14; k++) frect('rgba(60,90,130,.4)', cx - 24 + k * 0.8, b - 30 - k * 28, 48 - k * 1.6, 3); },
  market(x, b) { frect('#f2e2b8', x + 20, b - 90, 170, 90); frect('#e7cf96', x + 82, b - 150, 46, 60); fcirc('#fff', x + 105, b - 128, 14); fline('#333', 2, x + 105, b - 128, x + 105, b - 138); fpoly('#b8442c', x + 76, b - 150, x + 134, b - 150, x + 105, b - 172); for (let k = 0; k < 4; k++) frect('#2f6bd8', x + 30 + k * 40, b - 60, 22, 40); },
  skyline(x, b, r) { const H = [260 + r * 120, 340, 220 + r * 80]; H.forEach((h, k) => { const tx = x + 12 + k * 66; frect(['#8fb2d4', '#a6c1dc', '#7f9fc4'][k], tx, b - h, 56, h); for (let yy = b - h + 14; yy < b - 12; yy += 22) frect('rgba(255,255,255,.35)', tx + 6, yy, 44, 6); }); },
  factory(x, b) { frect('#c7ccd3', x + 14, b - 80, 180, 80); fpoly('#2f6bd8', x + 6, b - 80, x + 200, b - 80, x + 180, b - 104, x + 26, b - 104); frect('#9aa0a8', x + 150, b - 180, 18, 100); fcirc('rgba(220,220,220,.7)', x + 160 + Math.sin(T) * 8, b - 196 - (T * 18 % 30), 14); ctx.fillStyle = '#fff'; ctx.font = "800 18px 'Be Vietnam Pro'"; ctx.textAlign = 'center'; ctx.fillText('KCN', x + 80, b - 40); },
  lighthouse(x, b, r, i, w) { seaStrip(x, b, w); fpoly('#8a8a84', x + 60, b - 20, x + 160, b - 20, x + 140, b - 60, x + 80, b - 60); fpoly('#fff', x + 96, b - 60, x + 124, b - 60, x + 118, b - 220, x + 102, b - 220); for (let k = 0; k < 3; k++) frect('#e8322c', x + 99 + k * 2, b - 100 - k * 40, 22 - k * 4, 14); frect('#ffe27a', x + 100, b - 238, 20, 18); fpoly('rgba(255,240,150,.25)', x + 120, b - 230, x + 260, b - 270, x + 260, b - 190); },
  oilrig(x, b, r, i, w) { seaStrip(x, b, w); frect('#6a6f78', x + 60, b - 110, 110, 14); for (const lx of [x + 70, x + 160]) fline('#5a5f68', 6, lx, b - 96, lx, b - 30); fpoly('#e8822c', x + 120, b - 110, x + 150, b - 110, x + 135, b - 200); fcirc('#ff7a2f', x + 135, b - 206, 6 + Math.sin(T * 9) * 2); },
  forest(x, b) { for (let k = 0; k < 4; k++) tree(x + 20 + k * 55, b, ['#2f6e3a', '#3f7f34', '#2a5f30'][k % 3], 1.1 + (k % 2) * 0.25); },
  cashew(x, b) { fruitTree(x + 55, b, '#4a8a3a', '#e8822c'); fruitTree(x + 155, b, '#3f7f34', '#e8322c', 0.9); },
  pepper(x, b) { for (let k = 0; k < 4; k++) { const px = x + 25 + k * 52; frect('#6b4a2a', px - 3, b - 120, 6, 120); ctx.fillStyle = '#2f7a3a'; ctx.beginPath(); ctx.ellipse(px, b - 66, 16, 58, 0, 0, Math.PI * 2); ctx.fill(); for (let j = 0; j < 4; j++) fcirc('#c3261f', px - 8 + j * 5, b - 90 + j * 14, 3); } },
  dunes(x, b, r, i, w) { ctx.fillStyle = '#e8b56a'; ctx.beginPath(); ctx.moveTo(x - 2, b); ctx.quadraticCurveTo(x + 60, b - 150, x + 130, b - 40); ctx.quadraticCurveTo(x + 170, b - 110, x + w + 2, b - 30); ctx.lineTo(x + w + 2, b); ctx.fill(); ctx.fillStyle = '#f2cf8c'; ctx.beginPath(); ctx.moveTo(x + 20, b); ctx.quadraticCurveTo(x + 80, b - 90, x + 150, b); ctx.fill(); },
  chamtower(x, b) { const cx = x + 105; fpoly('#b5532e', cx - 40, b, cx + 40, b, cx + 34, b - 110, cx - 34, b - 110); fpoly('#a3472a', cx - 30, b - 110, cx + 30, b - 110, cx + 22, b - 160, cx - 22, b - 160); fpoly('#8f3d22', cx - 20, b - 160, cx + 20, b - 160, cx, b - 210); frect('#5a2a18', cx - 12, b - 60, 24, 60); for (const s of [-1, 1]) fpoly('#a3472a', cx + s * 40, b - 110, cx + s * 52, b - 110, cx + s * 46, b - 132); },
  coffee(x, b) { coffeeBush(x + 40, b); coffeeBush(x + 105, b + 4); coffeeBush(x + 170, b); },
  waterfall(x, b) { fpoly('#6f8a7a', x, b, x + 30, b - 220, x + 180, b - 230, x + 210, b); for (let k = 0; k < 5; k++) frect(`rgba(240,250,255,${0.8 - k * 0.1})`, x + 70 + k * 16, b - 220, 12, 220); fcirc('rgba(255,255,255,.6)', x + 110, b - 10, 40 + Math.sin(T * 4) * 4); },
  pine(x, b) { pine(x + 40, b); pine(x + 110, b - 6); pine(x + 175, b); },
  greenhouse(x, b) { for (let k = 0; k < 3; k++) { const gx = x + 8 + k * 68; ctx.fillStyle = 'rgba(245,250,255,.9)'; ctx.beginPath(); ctx.moveTo(gx, b); ctx.lineTo(gx, b - 50); ctx.quadraticCurveTo(gx + 32, b - 80, gx + 64, b - 50); ctx.lineTo(gx + 64, b); ctx.fill(); for (let j = 0; j < 5; j++) fcirc(['#ff5a7a', '#ffd23a', '#c58bff'][j % 3], gx + 8 + j * 12, b - 10, 5); } },
  lake(x, b, r, i, w) { water(x, b - 60, w, 64, '#7fc4e0', '#3f8fb8'); if (r > 0.4) boat(x + 110, b - 26, 0.6); },
  grape(x, b, r, i, w) { frect('#d9c48a', x, b - 20, w + 1, 20); fline('#6b4a2a', 4, x, b - 90, x + w, b - 90); for (let k = 0; k < 5; k++) { const gx = x + 20 + k * 44; fline('#6b4a2a', 4, gx, b - 20, gx, b - 90); ctx.fillStyle = '#4f9a3c'; ctx.beginPath(); ctx.ellipse(gx + 20, b - 94, 26, 10, 0, 0, Math.PI * 2); ctx.fill(); for (let j = 0; j < 6; j++) fcirc('#7b3fa0', gx + 14 + (j % 2) * 8, b - 84 + Math.floor(j / 2) * 8, 5); } },
  sheep(x, b) { frect('#d9c48a', x, b - 14, 211, 14); for (let k = 0; k < 4; k++) { const sx = x + 30 + k * 46, sy = b - 16 - (k % 2) * 6; fcirc('#f6f4ee', sx, sy - 14, 16); fcirc('#f6f4ee', sx + 12, sy - 18, 13); fcirc('#3a3330', sx + 22, sy - 20, 7); fline('#3a3330', 3, sx - 8, sy - 2, sx - 8, sy + 8); fline('#3a3330', 3, sx + 8, sy - 2, sx + 8, sy + 8); } },
  resort(x, b, r, i, w) { seaStrip(x, b, w); for (let k = 0; k < 3; k++) { const h = 150 + k * 40; frect('#f4f6f8', x + 20 + k * 62, b - 60 - h, 52, h); for (let yy = b - 60 - h + 12; yy < b - 66; yy += 16) frect('#7fb2d8', x + 26 + k * 62, yy, 40, 6); } },
  elephant(x, b) { const ex = x + 105, ey = b - 10; ctx.fillStyle = '#8f9196'; ctx.beginPath(); ctx.ellipse(ex, ey - 50, 54, 38, 0, 0, Math.PI * 2); ctx.fill(); fcirc('#8f9196', ex + 52, ey - 66, 26); fline('#8f9196', 12, ex + 70, ey - 56, ex + 80, ey - 20, ex + 72, ey - 6); for (const lx of [-34, -14, 18, 36]) frect('#8f9196', ex + lx - 7, ey - 24, 14, 26); fcirc('#7a7c82', ex + 40, ey - 70, 14); fcirc('#111', ex + 58, ey - 72, 3); frect('#e8322c', ex - 30, ey - 92, 60, 10); },
  nharong(x, b) { frect('#6b4226', x + 70, b - 70, 70, 50); fline('#5a3a20', 5, x + 80, b - 20, x + 80, b); fline('#5a3a20', 5, x + 130, b - 20, x + 130, b); fpoly('#c9a25a', x + 62, b - 66, x + 105, b - 250, x + 148, b - 66); fpoly('#a88540', x + 105, b - 250, x + 148, b - 66, x + 126, b - 66); },
  woodchurch(x, b) { frect('#5a3a22', x + 50, b - 110, 110, 110); fpoly('#3e2616', x + 40, b - 110, x + 170, b - 110, x + 105, b - 160); frect('#5a3a22', x + 90, b - 220, 30, 70); fpoly('#3e2616', x + 84, b - 220, x + 126, b - 220, x + 105, b - 262); fline('#f2d27d', 3, x + 105, b - 262, x + 105, b - 284); fline('#f2d27d', 3, x + 97, b - 276, x + 113, b - 276); for (let k = 0; k < 3; k++) frect('#f2d27d', x + 66 + k * 30, b - 80, 12, 30); },
  garlic(x, b, r, i, w) { frect('#e9d39a', x, b - 24, w + 1, 24); for (let k = 0; k < 9; k++) { const gx = x + 10 + k * 22; for (let j = -1; j <= 1; j++) fline('#5fae46', 3, gx, b - 18, gx + j * 8, b - 50); } },
  oldtown(x, b) { for (let k = 0; k < 2; k++) { const hx = x + 10 + k * 100; frect('#f2c14e', hx, b - 100, 90, 100); curvedRoof(hx, b - 100, 90, 24, '#8a4a2a'); frect('#5a3a22', hx + 30, b - 60, 30, 60); for (let j = 0; j < 3; j++) { ctx.fillStyle = ['#e8322c', '#ffb020', '#c58bff'][j]; ctx.beginPath(); ctx.ellipse(hx + 18 + j * 27, b - 112 + Math.sin(T * 2 + j) * 2, 9, 11, 0, 0, Math.PI * 2); ctx.fill(); } } },
  citadel(x, b) { frect('#d9b65a', x, b - 70, 211, 70); frect('#9b2d20', x + 60, b - 150, 90, 80); curvedRoof(x + 50, b - 150, 110, 30, '#e8b33a'); frect('#5a2a18', x + 92, b - 60, 26, 60); },
  pagoda(x, b) { const cx = x + 105; for (let k = 0; k < 7; k++) { const w = 70 - k * 8, y = b - k * 34; frect('#e9d6b0', cx - w / 2, y - 30, w, 30); curvedRoof(cx - w / 2, y - 30, w, 10, '#8a4a2a'); } fline('#8a6a3a', 3, cx, b - 238, cx, b - 270); },
  dragonboat(x, b, r, i, w) { water(x, b - 50, w, 54, '#7fc4c0', '#3f8f98'); const bx = x + 105; fpoly('#e8b33a', bx - 80, b - 30, bx + 70, b - 30, bx + 60, b - 16, bx - 70, b - 16); fpoly('#d4462c', bx + 64, b - 30, bx + 92, b - 60, bx + 84, b - 30); fcirc('#2f8a3a', bx + 88, b - 62, 8); frect('#d4462c', bx - 30, b - 64, 50, 34); curvedRoof(bx - 30, b - 64, 50, 12, '#8a4a2a'); },
  cave(x, b) { fpoly('#7a8a7c', x, b, x + 20, b - 200, x + 110, b - 260, x + 200, b - 190, x + 211, b); ctx.fillStyle = '#1e2420'; ctx.beginPath(); ctx.ellipse(x + 110, b - 40, 50, 60, 0, Math.PI, 0); ctx.fill(); },
  karst(x, b, r) { ctx.fillStyle = '#6a8a7c'; for (let k = 0; k < 2; k++) { const kx = x + 20 + k * 100, h = 180 + ((r * 7 + k) % 1) * 140; ctx.beginPath(); ctx.moveTo(kx, b); ctx.bezierCurveTo(kx - 10, b - h, kx + 90, b - h, kx + 80, b); ctx.fill(); } fline('#4f9a3c', 4, x + 50, b - 120, x + 60, b - 130); },
  tea(x, b, r, i, w) { ctx.fillStyle = '#7cb342'; ctx.beginPath(); ctx.moveTo(x - 4, b); ctx.quadraticCurveTo(x + w / 2, b - 170, x + w + 4, b); ctx.fill(); for (let k = 1; k < 7; k++) { ctx.strokeStyle = '#5f9a2c'; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(x + w / 2, b, w / 2 - k * 6, 150 - k * 20, 0, Math.PI, 0); ctx.stroke(); } if (r > 0.5) { fcirc('#ffd3ad', x + 60, b - 70, 7); fpoly('#eedfaa', x + 44, b - 70, x + 76, b - 70, x + 60, b - 88); frect('#c58b2a', x + 52, b - 64, 16, 18); } },
  rowboat(x, b, r, i, w) { water(x, b - 50, w, 54, '#6fb3a8', '#3e8478'); boat(x + 105, b - 22, 0.8); },
  church(x, b) { frect('#d9d4c8', x + 40, b - 120, 130, 120); for (const tx of [x + 40, x + 146]) { frect('#cfc9bb', tx, b - 200, 24, 200); fpoly('#8a8476', tx - 4, b - 200, tx + 28, b - 200, tx + 12, b - 250); } fpoly('#cfc9bb', x + 70, b - 120, x + 140, b - 120, x + 105, b - 160); ctx.fillStyle = '#5a6fa0'; ctx.beginPath(); ctx.arc(x + 105, b - 92, 16, 0, Math.PI * 2); ctx.fill(); frect('#5a4030', x + 92, b - 50, 26, 50); },
  temple(x, b) { frect('#c9a26a', x + 30, b - 90, 150, 90); for (let k = 0; k < 4; k++) frect('#9b2d20', x + 40 + k * 40, b - 90, 10, 90); curvedRoof(x + 20, b - 90, 170, 34, '#8a3a22'); fcirc('#ffd23a', x + 105, b - 108, 8); },
  longan(x, b) { fruitTree(x + 55, b, '#3f7a34', '#c9a25a', 1.1); fruitTree(x + 160, b, '#4a8a3a', '#b8902e'); },
  lychee(x, b) { fruitTree(x + 55, b, '#2f7a34', '#e8322c', 1.1); fruitTree(x + 160, b, '#3f8a3a', '#c8202c'); },
  port(x, b, r, i, w) { seaStrip(x, b, w); for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) frect(['#e8322c', '#2f6bd8', '#18b37e', '#f6a21e'][(k + j) % 4], x + 10 + k * 40, b - 92 - j * 22, 36, 20); fline('#e8822c', 7, x + 150, b - 70, x + 150, b - 230, x + 210, b - 230); fline('#e8822c', 5, x + 150, b - 200, x + 100, b - 230); fline('#555', 2, x + 196, b - 230, x + 196, b - 150); },
  flamboyant(x, b) { ctx.fillStyle = '#6b4226'; ctx.fillRect(x + 100, b - 80, 12, 80); for (let k = 0; k < 18; k++) fcirc(k % 3 ? '#e8322c' : '#3f8a34', x + 106 + Math.cos(k * 1.3) * (40 + k * 3), b - 110 + Math.sin(k * 2.1) * 26, 18); },
  junk(x, b, r, i, w) { seaStrip(x, b, w); const bx = x + 105, by = b - 30 + Math.sin(T * 1.5) * 2; fpoly('#6b4226', bx - 60, by - 10, bx + 60, by - 10, bx + 46, by + 8, bx - 46, by + 8); for (let k = 0; k < 3; k++) fpoly('#b5532e', bx - 40 + k * 32, by - 12, bx - 10 + k * 32, by - 12, bx - 16 + k * 32, by - 80 - k * 6, bx - 40 + k * 32, by - 76 - k * 6); },
  quanho(x, b, r, i, w) { water(x, b - 50, w, 54, '#7fc4c0', '#3f8f98'); boat(x + 105, b - 22, 0.8); for (let k = 0; k < 2; k++) { const px = x + 80 + k * 40; frect(k ? '#6b8f3a' : '#8a4a7a', px - 8, b - 70, 16, 34); fcirc('#ffd3ad', px, b - 78, 7); ctx.fillStyle = '#2b221d'; ctx.beginPath(); ctx.ellipse(px, b - 84, 18, 4, 0, 0, Math.PI * 2); ctx.fill(); } },
  turtletower(x, b, r, i, w) { water(x, b - 50, w, 54, '#6fae9a', '#3d7f6c'); fcirc('#5f9a52', x + 105, b - 40, 26); frect('#e9dcc0', x + 88, b - 110, 34, 70); curvedRoof(x + 84, b - 110, 42, 16, '#8a4a2a'); frect('#e9dcc0', x + 96, b - 140, 18, 24); },
  onepillar(x, b, r, i, w) { water(x, b - 40, w, 44, '#6fae9a', '#3d7f6c'); frect('#9a9488', x + 100, b - 110, 12, 80); frect('#8a3a22', x + 70, b - 150, 72, 40); curvedRoof(x + 64, b - 150, 84, 22, '#6b2a1a'); },
  longbien(x, b, r, i, w) { frect('#6b4a3a', x, b - 60, w + 1, 10); for (let k = 0; k < 2; k++) { ctx.strokeStyle = '#7a4a32'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x + k * 105, b - 60); ctx.quadraticCurveTo(x + k * 105 + 52, b - 150, x + k * 105 + 105, b - 60); ctx.stroke(); for (let j = 1; j < 6; j++) fline('#7a4a32', 3, x + k * 105 + j * 17, b - 60, x + k * 105 + j * 17, b - 60 - Math.sin(j / 6 * Math.PI) * 80); } frect('#7a8a99', x, b - 40, w + 1, 40); },
  tubehouse(x, b, r) { for (let k = 0; k < 5; k++) { const h = 110 + ((r * 13 + k * 7) % 1) * 90; frect(['#f2d27d', '#e6a7a2', '#b8c9e6', '#c9d8a6', '#f2b8a0'][k], x + k * 42, b - h, 40, h); frect('rgba(60,90,130,.5)', x + k * 42 + 10, b - h + 16, 20, 18); frect('#4f9a3c', x + k * 42 + 6, b - h + 40, 28, 6); } },
  dam(x, b, r, i, w) { water(x, b - 90, w, 50, '#7fc4e0', '#3f8fb8'); frect('#b8b4aa', x, b - 60, w + 1, 60); for (let k = 0; k < 4; k++) frect(`rgba(240,250,255,${0.7 + Math.sin(T * 6 + k) * 0.1})`, x + 20 + k * 50, b - 56, 18, 56); },
  cows(x, b) { frect('#8cc63f', x, b - 12, 211, 12); for (let k = 0; k < 3; k++) { const cx = x + 40 + k * 66, cy = b - 14; frect('#fff', cx - 26, cy - 34, 52, 26); fcirc('#222', cx - 8, cy - 26, 8); fcirc('#222', cx + 14, cy - 18, 6); frect('#fff', cx + 22, cy - 42, 18, 16); for (const lx of [-20, -6, 10, 22]) frect('#333', cx + lx, cy - 8, 5, 10); } },
  plum(x, b, r, i) { plum(x + 60, b, i); plum(x + 160, b, i + 7); },
  peach(x, b, r, i) { plum(x + 105, b, i * 3 + 1); fcirc('rgba(255,120,170,.35)', x + 105, b - 150, 70); },
  flaghill(x, b) { ctx.fillStyle = '#6f9a5a'; ctx.beginPath(); ctx.moveTo(x - 10, b); ctx.quadraticCurveTo(x + 105, b - 170, x + 220, b); ctx.fill(); fline('#555', 3, x + 105, b - 96, x + 105, b - 170); fpoly('#e8322c', x + 105, b - 170, x + 150, b - 158 + Math.sin(T * 4) * 3, x + 105, b - 146); fcirc('#ffd23a', x + 122, b - 158, 4); },
  terrace(x, b, r, i, w) { MID.mountain(x, b, 0.45, i, w); },
  clouds(x, b, r, i) { ctx.fillStyle = 'rgba(255,255,255,.85)'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(x + 30 + k * 52 + Math.sin(T * 0.3 + i) * 10, b - 90 - (k % 2) * 16, 60, 22, 0, 0, Math.PI * 2); ctx.fill(); } },
  cablecar(x, b, r, i, w) { fline('#555', 2, x, b - 60, x + w, b - 260); const q = (T * 0.05 + r) % 1, cx = x + q * w, cy = b - 60 - q * 200; fline('#555', 2, cx, cy, cx, cy + 16); frect('#e8322c', cx - 12, cy + 16, 24, 20); frect('#bfe3ff', cx - 8, cy + 20, 16, 8); },
  buckwheat(x, b, r, i, w) { frect('#a8c06a', x, b - 40, w + 1, 40); for (let k = 0; k < 40; k++) fcirc(k % 3 ? '#e991c4' : '#f6c3e0', x + (k * 37 % w), b - 6 - (k * 13 % 36), 5); },
  stilt(x, b, r) { stiltHouse(x + 50, b, r > 0.5 ? '#5a4632' : '#8b5e34', 0.85); },
};

// ---- 🍜 quán ăn vỉa hè: mỗi tỉnh cũ 2 quán, mỗi quán 1 món đặc sản (food.js), người bán gọi mời khi đoàn xe tới ----
function foodStall(x, y, dish, k) {
  ctx.save(); ctx.translate(x, y); ctx.scale(0.78, 0.78);
  const col = ['#e8322c', '#2f7de2', '#18b37e', '#f6a21e'][k % 4];
  fline('#7a5a3a', 6, -70, 0, -70, -190);
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-170, -170); ctx.quadraticCurveTo(-70, -250, 30, -170); ctx.closePath(); ctx.fill();   // dù
  ctx.fillStyle = '#fff'; for (let j = -2; j <= 2; j += 2) { ctx.beginPath(); ctx.moveTo(-70 + j * 26 - 9, -176); ctx.lineTo(-70 + j * 26, -222); ctx.lineTo(-70 + j * 26 + 9, -176); ctx.fill(); }
  ctx.fillStyle = '#c98f55'; rrect(-150, -86, 160, 70, 8); ctx.fill();   // xe đẩy
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(-140, -80, 140, 26);
  wheel(-120, -14, 14, 0); wheel(-20, -14, 14, 0);
  ctx.fillStyle = '#fff6d6'; for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.ellipse(-120 + j * 44, -92, 16, 6, 0, 0, Math.PI * 2); ctx.fill(); }
  for (let j = 0; j < 3; j++) { ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(-120 + j * 44 + Math.sin(T * 2 + j) * 4, -110 - ((T * 26 + j * 14) % 40), 6, 0, Math.PI * 2); ctx.fill(); }   // khói thơm
  ctx.font = "800 26px 'Be Vietnam Pro'"; const tw = ctx.measureText(dish).width + 30;   // bảng tên món
  ctx.fillStyle = '#ffe9a8'; rrect(-70 - tw / 2, -296, tw, 44, 8); ctx.fill(); ctx.strokeStyle = '#b8442c'; ctx.lineWidth = 3; rrect(-70 - tw / 2, -296, tw, 44, 8); ctx.stroke();
  ctx.fillStyle = '#7a1f12'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(dish, -70, -273);
  fline('#3a5a8a', 12, 46, 0, 50, -50); fline('#3a5a8a', 12, 62, 0, 58, -50);   // người bán đội nón lá
  ctx.fillStyle = k % 2 ? '#e2557b' : '#f6a21e'; rrect(34, -110, 40, 64, 10); ctx.fill();
  fline(k % 2 ? '#e2557b' : '#f6a21e', 9, 70, -100, 96, -140 - Math.abs(Math.sin(T * 5)) * 16);   // tay vẫy mời
  fcirc('#ffd3ad', 54, -126, 17); fpoly('#eedfaa', 24, -128, 84, -128, 54, -162);
  ctx.restore();
}
function drawFoodStalls() {
  const goal = game.cfg.goal, mL = meterAt(-260), mR = meterAt(W + 260);
  let near = null;
  for (let pi = provIdx(Math.max(0, mL)); pi <= provIdx(Math.max(0, mR)); pi++) {
    const parts = PARTS_OF(pi), seg = goal / NP;
    parts.forEach((p, k) => {
      const F = FOOD[p.name]; if (!F) return;
      const from = (pi + k / parts.length) * seg, len = seg / parts.length;
      F.food.forEach((dish, j) => {
        const ms = from + len * (0.32 + j * 0.42), x = xAt(ms);
        if (x < -260 || x > W + 260) return;
        foodStall(x, roadTop(ms) + 2, dish, pi * 3 + k + j);
        const dx = x - SX;
        if (dx > 60 && dx < 640 && x < W - 60 && (!near || dx < near.dx)) near = { dx, x, y: roadTop(ms) - 250, text: F.invite };
      });
    });
  }
  if (near && game.phase === 'race') bubble(near.x, near.y, `🍜 ${near.text}`, 2);   // chỉ người bán gần nhất phía trước gọi mời
}
const PARTS_OF = pi => { const p = partAt((pi + 0.5) * game.cfg.goal / NP, game.cfg.goal); return PARTS_CACHE[pi] || (PARTS_CACHE[pi] = Array.from({ length: p.n }, (_, k) => partAt((pi + (k + 0.5) / p.n) * game.cfg.goal / NP, game.cfg.goal).part)); };
const PARTS_CACHE = [];
// ---- đồ ven đường (lớp 1×) ----
function drawRoadside() {
  const step = 6, m0 = Math.floor(meterAt(-120) / step), m1 = Math.ceil(meterAt(W + 120) / step);
  for (let k = m0; k <= m1; k++) {
    const m = k * step; if (m < -game.cfg.goal) continue;
    const X = xAt(m), Y = roadTop(m) + 2, r = hash(k, 21), st = biomeAt(m);
    if (r < 0.45) continue;
    ctx.save(); ctx.translate(X, Y); ctx.scale(0.8, 0.8);
    const x = 0, y = 0;
    if (st === 'city') {
      if (r > 0.8) { ctx.strokeStyle = '#6b6b6b'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 260); ctx.stroke(); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x - 30, y - 240); ctx.lineTo(x + 30, y - 240); ctx.stroke(); ctx.strokeStyle = 'rgba(40,40,40,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 30, y - 240); ctx.quadraticCurveTo(x - 200, y - 200, x - 360, y - 240); ctx.stroke(); }
      else if (r > 0.6) tree(x, y, '#3e9a45', 0.8);
      else { const sg = ['PHỞ', 'CÀ PHÊ', 'BÚN BÒ', 'BÁNH MÌ'][Math.floor(hash(k, 22) * 4)]; ctx.fillStyle = r > 0.52 ? '#e2382c' : '#1f6fd1'; rrect(x - 56, y - 120, 112, 44, 8); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = "800 26px 'Be Vietnam Pro'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(sg, x, y - 97); ctx.fillStyle = '#777'; ctx.fillRect(x - 4, y - 76, 8, 76); }
    } else if (st === 'fields') { if (r > 0.75) palm(x, y); else if (r > 0.6) haystack(x, y); else tree(x, y, '#4f9a2c', 0.7); }
    else if (st === 'delta') { if (r > 0.62) palm(x, y); else if (r > 0.52) bananaTree(x, y); else waterJar(x, y); }
    else if (st === 'highland') { if (r > 0.72) pine(x, y); else if (r > 0.58) coffeeBush(x, y); else daQuy(x, y); }
    else if (st === 'coast') { if (r > 0.7) pine(x, y); else if (r > 0.55) { ctx.fillStyle = '#8c8c8c'; ctx.beginPath(); ctx.ellipse(x, y - 18, 40, 26, 0, 0, Math.PI * 2); ctx.fill(); } }
    else if (st === 'heritage') { if (r > 0.75) lanterns(x, y); else if (r > 0.6) stoneLamp(x, y); else tree(x, y, '#4f8a3c', 0.7); }
    else if (st === 'karst') { if (r > 0.7) bamboo(x, y); else if (r > 0.55) tree(x, y, '#5c9a3a', 0.7); else { ctx.fillStyle = '#8c8c8c'; ctx.beginPath(); ctx.ellipse(x, y - 16, 34, 22, 0, 0, Math.PI * 2); ctx.fill(); } }
    else { if (r > 0.72) plum(x, y, k); else if (r > 0.58) pine(x, y); else if (r > 0.5) mai(x, y, k); }
    ctx.restore();
  }
  drawFoodStalls();
  // lan can đèo (núi cao, biển)
  ctx.strokeStyle = '#d9d9d9'; ctx.lineWidth = 6;
  for (let x = -20; x < W + 20; x += 18) {
    const m = meterAt(x), b = biomeAt(m); if (b !== 'mountain' && b !== 'coast') continue;
    ctx.beginPath(); ctx.moveTo(x, roadTop(m) - 22); ctx.lineTo(x + 18, roadTop(meterAt(x + 18)) - 22); ctx.stroke();
  }
  drawProvinceMarks();
}
function tree(x, y, c, s = 1) { ctx.fillStyle = '#7a5230'; ctx.fillRect(x - 7 * s, y - 90 * s, 14 * s, 90 * s); ctx.fillStyle = c; for (const [dx, dy, rr] of [[0, -150, 60], [-40, -110, 44], [40, -112, 46]]) { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, rr * s, 0, Math.PI * 2); ctx.fill(); } }
function palm(x, y) { ctx.strokeStyle = '#8b6234'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 20, y - 120, x + 6, y - 240); ctx.stroke(); ctx.strokeStyle = '#3f9b3c'; ctx.lineWidth = 12; for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + Math.sin(T * 1.5 + x) * 0.05; ctx.beginPath(); ctx.moveTo(x + 6, y - 240); ctx.quadraticCurveTo(x + 6 + Math.cos(a) * 60, y - 270 + Math.sin(a) * 20, x + 6 + Math.cos(a) * 110, y - 220 + Math.abs(Math.sin(a)) * 30); ctx.stroke(); } ctx.fillStyle = '#6b4a1e'; for (const dx of [-8, 8, 0]) { ctx.beginPath(); ctx.arc(x + 6 + dx, y - 232 + (dx ? 0 : 10), 9, 0, Math.PI * 2); ctx.fill(); } }
function haystack(x, y) { ctx.fillStyle = '#e0b84f'; ctx.beginPath(); ctx.moveTo(x - 50, y); ctx.quadraticCurveTo(x, y - 160, x + 50, y); ctx.fill(); ctx.strokeStyle = '#b8902e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 30, y - 50); ctx.lineTo(x + 30, y - 50); ctx.stroke(); }
function pine(x, y) { ctx.fillStyle = '#7a5230'; ctx.fillRect(x - 6, y - 40, 12, 40); ctx.fillStyle = '#2f7a4f'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x - 60 + k * 12, y - 30 - k * 50); ctx.lineTo(x, y - 120 - k * 50); ctx.lineTo(x + 60 - k * 12, y - 30 - k * 50); ctx.fill(); } }
function mai(x, y, seed = x) { ctx.strokeStyle = '#6b4226'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y - 110); ctx.lineTo(x - 50, y - 170); ctx.moveTo(x - 6, y - 110); ctx.lineTo(x + 46, y - 180); ctx.stroke(); for (let k = 0; k < 26; k++) { const a = hash(seed * 0.37 + k, 31) * Math.PI * 2, rr = 30 + hash(k, 32) * 60; ctx.fillStyle = k % 5 ? '#ffd23a' : '#ff9f1c'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr, y - 160 + Math.sin(a) * rr * 0.7, 9, 0, Math.PI * 2); ctx.fill(); } }
function plum(x, y, seed) { ctx.strokeStyle = '#5a3d2a'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 4, y - 100); ctx.lineTo(x - 40, y - 160); ctx.moveTo(x + 4, y - 100); ctx.lineTo(x + 50, y - 170); ctx.stroke(); for (let k = 0; k < 30; k++) { const a = hash(seed * 0.29 + k, 33) * Math.PI * 2, rr = 26 + hash(k, 34) * 62; ctx.fillStyle = k % 3 ? '#fde4ec' : '#f7a8c4'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr, y - 150 + Math.sin(a) * rr * 0.7, 9, 0, Math.PI * 2); ctx.fill(); } }
function lanterns(x, y) { ctx.strokeStyle = '#7a4a2a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 200); ctx.stroke(); for (let k = 0; k < 3; k++) { const ly = y - 180 + k * 52, sw = Math.sin(T * 2 + k) * 4; ctx.fillStyle = '#e8322c'; ctx.beginPath(); ctx.ellipse(x + 22 + sw, ly, 18, 22, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ffd23a'; ctx.fillRect(x + 14 + sw, ly + 20, 16, 6); } }
function bananaTree(x, y) { ctx.fillStyle = '#7a9a3a'; ctx.fillRect(x - 8, y - 120, 16, 120); ctx.fillStyle = '#5fae3a'; for (let k = 0; k < 5; k++) { ctx.save(); ctx.translate(x, y - 120); ctx.rotate(-1.4 + k * 0.7); ctx.beginPath(); ctx.ellipse(0, -50, 18, 60, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); } }
function waterJar(x, y) { ctx.fillStyle = '#8b4a2a'; ctx.beginPath(); ctx.ellipse(x, y - 40, 34, 40, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#6b3a20'; ctx.fillRect(x - 24, y - 84, 48, 10); }
function coffeeBush(x, y) { ctx.fillStyle = '#2f6e3a'; ctx.beginPath(); ctx.arc(x, y - 44, 44, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#c3261f'; for (let k = 0; k < 9; k++) { ctx.beginPath(); ctx.arc(x + Math.cos(k * 1.7) * 28, y - 44 + Math.sin(k * 2.3) * 24, 6, 0, Math.PI * 2); ctx.fill(); } }
function daQuy(x, y) { ctx.fillStyle = '#4f8a3c'; ctx.fillRect(x - 3, y - 70, 6, 70); ctx.fillStyle = '#ffcf1f'; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(x - 30 + k * 15, y - 70 - (k % 2) * 16, 13, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = '#8a5a1a'; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(x - 30 + k * 15, y - 70 - (k % 2) * 16, 5, 0, Math.PI * 2); ctx.fill(); } }
function stoneLamp(x, y) { ctx.fillStyle = '#9a9a92'; ctx.fillRect(x - 10, y - 90, 20, 90); ctx.fillRect(x - 26, y - 118, 52, 28); ctx.fillStyle = '#7a7a72'; ctx.beginPath(); ctx.moveTo(x - 34, y - 118); ctx.lineTo(x, y - 144); ctx.lineTo(x + 34, y - 118); ctx.fill(); }
function bamboo(x, y) { ctx.strokeStyle = '#5c9a3a'; ctx.lineWidth = 9; for (let k = 0; k < 5; k++) { const bx = x - 30 + k * 15; ctx.beginPath(); ctx.moveTo(bx, y); ctx.quadraticCurveTo(bx + 10, y - 120, bx + 26 + k * 4, y - 220 + k * 10); ctx.stroke(); } }

// ---- biển chào mỗi tỉnh + công trình mốc ----
function drawProvinceMarks() {
  const goal = game.cfg.goal, seg = goal / NP;
  const i0 = Math.max(0, Math.floor(meterAt(-500) / seg)), i1 = Math.min(NP - 1, Math.ceil(meterAt(W + 500) / seg));
  for (let i = i0; i <= i1; i++) {
    const p = ROUTE[i];
    const mc = (i + 0.55) * seg;                       // công trình mốc giữa tỉnh
    const xc = xAt(mc);
    if (xc > -420 && xc < W + 420 && p.lm !== 'none' && p.lm !== 'flagtower') { ctx.save(); ctx.translate(xc, roadTop(mc) - 4); ctx.scale(0.62, 0.62); (LM[p.lm] || (() => {}))(); ctx.restore(); }
    const parts = PARTS_OF(i);
    for (let k = 1; k < parts.length; k++) {           // biển nhỏ khi sang tỉnh cũ kế tiếp (63 tỉnh trước 2025)
      const mk = (i + k / parts.length) * seg + 4, xk = xAt(mk);
      if (xk < -260 || xk > W + 260) continue;
      ctx.save(); ctx.translate(xk, roadTop(mk) + 2); ctx.scale(0.62, 0.62);
      ctx.fillStyle = '#7a7a7a'; ctx.fillRect(-6, -230, 12, 230);
      ctx.fillStyle = '#1f5fbf'; rrect(-180, -310, 360, 92, 14); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; rrect(-172, -302, 344, 76, 10); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `800 ${parts[k].name.length > 12 ? 32 : 38}px 'Be Vietnam Pro'`; ctx.fillText(parts[k].name.toUpperCase(), 0, -274);
      ctx.font = "700 20px 'Be Vietnam Pro'"; ctx.fillText(`nay thuộc ${p.name}`, 0, -240);
      ctx.fillStyle = 'rgba(22,26,36,.85)'; rrect(-170, -210, 340, 40, 10); ctx.fill();
      ctx.fillStyle = '#ffe27a'; ctx.font = "800 20px 'Be Vietnam Pro'"; ctx.fillText(parts[k].sign.slice(0, 30), 0, -190);
      ctx.restore();
    }
    if (i === 0) continue;                             // Cà Mau đã có cổng xuất phát
    const ms = i * seg + 6, xs = xAt(ms);
    if (xs < -300 || xs > W + 300) continue;
    const y = roadTop(ms) + 2;
    ctx.save(); ctx.translate(xs, y); ctx.scale(0.7, 0.7);
    ctx.fillStyle = '#7a7a7a'; ctx.fillRect(-150, -250, 12, 250); ctx.fillRect(138, -250, 12, 250);
    ctx.fillStyle = '#0f7a43'; rrect(-190, -330, 380, 96, 16); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; rrect(-182, -322, 364, 80, 12); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = "800 22px 'Be Vietnam Pro'"; ctx.fillText('CHÀO MỪNG ĐẾN', 0, -305);
    ctx.font = `800 ${p.name.length > 12 ? 34 : 40}px 'Be Vietnam Pro'`; ctx.fillText(p.name.toUpperCase(), 0, -268);
    ctx.fillStyle = 'rgba(22,26,36,.85)'; rrect(-170, -228, 340, 44, 12); ctx.fill();
    ctx.fillStyle = '#ffe27a'; ctx.font = "800 22px 'Be Vietnam Pro'"; ctx.fillText(`${p.icon} ${p.landmark}`.slice(0, 30), 0, -206);
    if (p.old.length) { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = "700 18px 'Be Vietnam Pro'"; ctx.fillText(`(gồm ${p.old.join(', ')})`.slice(0, 40), 0, -168); }
    ctx.restore();
  }
}
// công trình mốc — vẽ quanh gốc (0,0) chân công trình, toạ độ chưa thu nhỏ
const LM = {
  mui() { ctx.fillStyle = '#d9d3c4'; ctx.beginPath(); ctx.moveTo(-160, 0); ctx.lineTo(160, 0); ctx.lineTo(120, -60); ctx.lineTo(-140, -60); ctx.fill(); ctx.fillStyle = '#8a8a86'; ctx.fillRect(-10, -260, 12, 200); ctx.fillStyle = '#e8322c'; ctx.beginPath(); ctx.moveTo(2, -260); ctx.lineTo(110, -230); ctx.lineTo(2, -200); ctx.fill(); ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(40, -230, 10, 0, Math.PI * 2); ctx.fill(); },
  market() { water(-220, -60, 440, 60, '#7cc3c9', '#3f8f98'); boat(-120, -20, 1, true); boat(60, -30, 1.1, true); boat(170, -14, 0.9, true); },
  hill() { ctx.fillStyle = '#4f8a3c'; ctx.beginPath(); ctx.ellipse(0, 0, 220, 170, 0, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#c3261f'; ctx.fillRect(-20, -200, 40, 34); ctx.fillStyle = '#8b2d20'; ctx.beginPath(); ctx.moveTo(-34, -198); ctx.lineTo(0, -230); ctx.lineTo(34, -198); ctx.fill(); },
  lotus() { water(-220, -40, 440, 40, '#6fb3a8', '#3e8478'); for (let k = 0; k < 9; k++) { ctx.fillStyle = '#3f9b3c'; ctx.beginPath(); ctx.ellipse(-190 + k * 48, -30, 22, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ff7aa8'; ctx.beginPath(); ctx.moveTo(-190 + k * 48, -40); ctx.lineTo(-200 + k * 48, -60); ctx.lineTo(-190 + k * 48, -74); ctx.lineTo(-180 + k * 48, -60); ctx.fill(); } },
  coconut() { for (let k = 0; k < 4; k++) palm(-150 + k * 100, 0); },
  tower81() { ctx.fillStyle = '#8fb8d8'; ctx.beginPath(); ctx.moveTo(-50, 0); ctx.lineTo(-34, -520); ctx.lineTo(0, -600); ctx.lineTo(34, -520); ctx.lineTo(50, 0); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 3; for (let y = -30; y > -520; y -= 30) { ctx.beginPath(); ctx.moveTo(-44, y); ctx.lineTo(44, y); ctx.stroke(); } ctx.fillStyle = '#d9a441'; ctx.fillRect(-150, -120, 80, 120); ctx.fillStyle = '#b8432f'; ctx.beginPath(); ctx.moveTo(-160, -116); ctx.lineTo(-110, -170); ctx.lineTo(-60, -116); ctx.fill(); },
  forest() { for (let k = 0; k < 5; k++) tree(-180 + k * 90, 0, ['#2f7a4f', '#3e9a45'][k % 2], 1.2); },
  pine() { water(-220, -40, 440, 40, '#8fc9e0', '#4d97c0'); for (let k = 0; k < 5; k++) pine(-180 + k * 90, -40); },
  lighthouse() { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(-20, -260); ctx.lineTo(20, -260); ctx.lineTo(30, 0); ctx.fill(); ctx.fillStyle = '#e8322c'; ctx.fillRect(-26, -180, 52, 30); ctx.fillRect(-24, -90, 48, 30); ctx.fillStyle = '#ffe27a'; ctx.fillRect(-18, -300, 36, 40); ctx.fillStyle = '#333'; ctx.beginPath(); ctx.moveTo(-26, -300); ctx.lineTo(0, -330); ctx.lineTo(26, -300); ctx.fill(); const a = (T * 2) % (Math.PI * 2); ctx.fillStyle = 'rgba(255,240,150,.35)'; ctx.beginPath(); ctx.moveTo(0, -280); ctx.lineTo(Math.cos(a) * 300, -280 + Math.sin(a) * 40 - 30); ctx.lineTo(Math.cos(a) * 300, -280 + Math.sin(a) * 40 + 30); ctx.fill(); },
  nharong() { ctx.strokeStyle = '#6b4226'; ctx.lineWidth = 10; for (const dx of [-70, -20, 30, 80]) { ctx.beginPath(); ctx.moveTo(dx, 0); ctx.lineTo(dx, -60); ctx.stroke(); } ctx.fillStyle = '#8b5e34'; ctx.fillRect(-90, -120, 190, 60); ctx.fillStyle = '#c9a25a'; ctx.beginPath(); ctx.moveTo(-110, -112); ctx.lineTo(5, -380); ctx.lineTo(120, -112); ctx.fill(); ctx.strokeStyle = '#8b5e34'; ctx.lineWidth = 4; for (let k = 1; k < 5; k++) { ctx.beginPath(); ctx.moveTo(-110 + k * 23, -112 - k * 54); ctx.lineTo(120 - k * 23, -112 - k * 54); ctx.stroke(); } },
  bridge() { water(-260, -30, 520, 30); ctx.strokeStyle = '#ffc531'; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(-250, -40); for (let k = 0; k <= 50; k++) { const x = -250 + k * 10; ctx.lineTo(x, -60 - Math.abs(Math.sin(k / 50 * Math.PI * 3)) * 90); } ctx.stroke(); ctx.fillStyle = '#ffc531'; ctx.beginPath(); ctx.arc(-250, -60, 26, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#e8322c'; ctx.beginPath(); ctx.arc(-258, -64, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#888'; ctx.fillRect(-260, -44, 520, 10); },
  gate() { ctx.fillStyle = '#9b2d20'; ctx.fillRect(-200, -170, 400, 170); ctx.fillStyle = '#3a2a1a'; for (const dx of [-120, 0, 120]) { rrect(dx - 30, -110, 60, 110, [30, 30, 0, 0]); ctx.fill(); } ctx.fillStyle = '#d9b65a'; ctx.fillRect(-150, -230, 300, 60); ctx.fillStyle = '#6b4226'; ctx.beginPath(); ctx.moveTo(-190, -228); ctx.quadraticCurveTo(0, -300, 190, -228); ctx.fill(); ctx.beginPath(); ctx.moveTo(-230, -168); ctx.quadraticCurveTo(0, -230, 230, -168); ctx.fill(); },
  cave() { ctx.fillStyle = '#7a8f84'; ctx.beginPath(); ctx.moveTo(-220, 0); ctx.bezierCurveTo(-220, -300, 220, -300, 220, 0); ctx.fill(); ctx.fillStyle = '#1e2a26'; ctx.beginPath(); ctx.ellipse(0, 0, 90, 110, 0, Math.PI, 0); ctx.fill(); water(-90, -24, 180, 24, '#3e8478', '#1e4a40'); },
  port() { ctx.strokeStyle = '#e8322c'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(-120, 0); ctx.lineTo(-120, -300); ctx.lineTo(120, -300); ctx.moveTo(-120, -300); ctx.lineTo(-60, 0); ctx.stroke(); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(60, -300); ctx.lineTo(60, -160); ctx.stroke(); const cols = ['#2f7de2', '#ef7d22', '#22b35e', '#e8322c']; for (let k = 0; k < 8; k++) { ctx.fillStyle = cols[k % 4]; ctx.fillRect(-40 + (k % 4) * 60, -54 - Math.floor(k / 4) * 50, 56, 46); } },
  bay() { water(-280, -50, 560, 50, '#5fb0c8', '#2d7f9e'); ctx.fillStyle = '#6a8a7c'; for (const [dx, h, w] of [[-200, 220, 70], [-80, 320, 90], [60, 260, 80], [190, 180, 60]]) { ctx.beginPath(); ctx.moveTo(dx - w, -40); ctx.bezierCurveTo(dx - w, -40 - h, dx + w, -40 - h, dx + w, -40); ctx.fill(); } boat(-10, -20, 0.9); },
  lake() { water(-260, -40, 520, 40, '#6fb3a8', '#3e8478'); ctx.fillStyle = '#9a8f7a'; ctx.fillRect(-30, -150, 60, 110); ctx.fillStyle = '#7a6f5a'; ctx.fillRect(-40, -170, 80, 22); ctx.beginPath(); ctx.moveTo(-40, -170); ctx.lineTo(0, -200); ctx.lineTo(40, -170); ctx.fill(); ctx.fillStyle = '#3a3226'; for (const dx of [-14, 14]) { rrect(dx - 8, -130, 16, 26, [8, 8, 0, 0]); ctx.fill(); } ctx.strokeStyle = '#c3261f'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(110, -40); ctx.quadraticCurveTo(180, -130, 250, -40); ctx.stroke(); },
  temple() { ctx.fillStyle = '#c9a26a'; for (let k = 0; k < 6; k++) ctx.fillRect(-160 + k * 10, -k * 14, 320 - k * 20, 14); ctx.fillStyle = '#9b2d20'; ctx.fillRect(-80, -190, 160, 106); ctx.fillStyle = '#5a3d22'; ctx.beginPath(); ctx.moveTo(-120, -186); ctx.quadraticCurveTo(0, -260, 120, -186); ctx.fill(); ctx.fillStyle = '#ffd23a'; ctx.fillRect(-20, -150, 40, 50); },
  terrace() { for (let k = 0; k < 7; k++) { ctx.fillStyle = ['#9ccc65', '#c5e1a5', '#7cb342'][k % 3]; ctx.beginPath(); ctx.ellipse(0, -k * 34, 260 - k * 30, 34, 0, Math.PI, 0); ctx.fill(); } ctx.fillStyle = '#e9eef2'; ctx.beginPath(); ctx.moveTo(-60, -240); ctx.lineTo(10, -330); ctx.lineTo(80, -240); ctx.fill(); },
  tea() { for (let k = 0; k < 6; k++) { ctx.fillStyle = k % 2 ? '#3f8f3a' : '#5aab3e'; ctx.beginPath(); ctx.ellipse(0, -k * 26, 250 - k * 26, 26, 0, Math.PI, 0); ctx.fill(); } ctx.fillStyle = '#f1d488'; ctx.beginPath(); ctx.moveTo(60, -170); ctx.lineTo(80, -196); ctx.lineTo(100, -170); ctx.fill(); },
  waterfall() { ctx.fillStyle = '#6a8a7c'; ctx.fillRect(-240, -260, 480, 200); ctx.fillStyle = 'rgba(255,255,255,.92)'; for (let k = 0; k < 5; k++) { const x = -200 + k * 90; ctx.fillRect(x, -250, 46, 200 - (k % 2) * 40); } water(-260, -60, 520, 60, '#7fd0e0', '#3aa0b8'); ctx.fillStyle = 'rgba(255,255,255,.6)'; for (let k = 0; k < 12; k++) { ctx.beginPath(); ctx.arc(-220 + k * 40, -58 + Math.sin(T * 6 + k) * 4, 10, 0, Math.PI * 2); ctx.fill(); } },
};
// Cột cờ Lũng Cú ở đích
function flagTower(x, y, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#6a8a7c'; ctx.beginPath(); ctx.moveTo(-200, 0); ctx.bezierCurveTo(-180, -200, 180, -200, 200, 0); ctx.fill();   // núi Rồng
  ctx.fillStyle = '#c9c1ad'; ctx.beginPath(); ctx.moveTo(-50, -150); ctx.lineTo(-36, -380); ctx.lineTo(36, -380); ctx.lineTo(50, -150); ctx.fill();
  ctx.fillStyle = '#a89f88'; for (let k = 0; k < 6; k++) ctx.fillRect(-40 + k * 2, -170 - k * 36, 80 - k * 4, 6);
  ctx.fillStyle = '#7a7266'; ctx.fillRect(-4, -560, 8, 182);
  const wv = Math.sin(T * 4) * 10;
  ctx.fillStyle = '#da251d'; ctx.beginPath(); ctx.moveTo(4, -556); ctx.quadraticCurveTo(80, -566 + wv, 160, -548); ctx.lineTo(160, -456); ctx.quadraticCurveTo(80, -470 + wv, 4, -460); ctx.fill();
  ctx.fillStyle = '#ffde00'; ctx.beginPath();
  for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 12 : 30; ctx.lineTo(82 + Math.cos(a) * rr, -508 + wv * 0.5 + Math.sin(a) * rr); }
  ctx.fill();
  ctx.restore();
}

// nền trước dưới mặt đường — từng khúc 4 m vẽ theo kiểu cảnh của chính khúc đó
const GROUND_TOP = ROAD + 60;
function drawGround() {
  const CH = 4, m0 = Math.floor(meterAt(-40) / CH) * CH, m1 = meterAt(W + 40);
  for (let m = m0; m < m1; m += CH) {
    const x0 = xAt(m), x1 = xAt(m + CH), k = Math.round(m / CH), st = biomeAt(m);
    ctx.save(); ctx.beginPath(); ctx.rect(x0 - 0.5, GROUND_TOP, x1 - x0 + 1, H - GROUND_TOP); ctx.clip();
    groundChunk(st, k, x0, x1);
    ctx.restore();
  }
}
function groundChunk(st, k, x0, x1) {
  const w = x1 - x0, r = hash(k, 61), r2 = hash(k, 62), cx = x0 + w * 0.5;
  if (st === 'city') {        // vỉa hè gạch → bờ kè → kênh
    ctx.fillStyle = '#d8d0c2'; ctx.fillRect(x0, GROUND_TOP, w + 1, 1500 - GROUND_TOP);
    ctx.fillStyle = 'rgba(150,120,90,.12)';
    for (let y = 1250, j = 0; y < 1500; y += 50, j++) for (let t = 0; t < 2; t++) if ((j + t + k) % 2) ctx.fillRect(x0 + t * w / 2, y, w / 2, 50);
    ctx.fillStyle = '#a49c90'; ctx.fillRect(x0, 1500, w + 1, 22); ctx.fillStyle = '#7d766b'; ctx.fillRect(x0, 1522, w + 1, 40);
    water(x0, 1562, w, H - 1562, '#5aa6c4', '#2f7392');
    if (r > 0.72) scooter(cx, 1470, { color: ['#2f7de2', '#30333b', '#ff6fae', '#22b35e'][Math.floor(r2 * 4)], rider: 'none', gifts: false, scale: VS * 0.85 });
  } else if (st === 'fields') {   // ruộng lúa
    for (let y = GROUND_TOP, j = 0; y < H; y += 76, j++) {
      ctx.fillStyle = j % 2 ? '#6cbd3a' : '#5aab2e'; ctx.fillRect(x0, y, w + 1, 76);
      ctx.fillStyle = 'rgba(170,220,250,.45)'; ctx.fillRect(x0, y + 4, w + 1, 11);
      ctx.strokeStyle = 'rgba(40,110,20,.6)'; ctx.lineWidth = 3;
      for (let t = 0; t < 3; t++) { const xx = x0 + (t + 0.5) * w / 3, yy = y + 58; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx - 6, yy - 20); ctx.moveTo(xx, yy); ctx.lineTo(xx + 6, yy - 20); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy - 24); ctx.stroke(); }
    }
    if (r > 0.86) { ctx.save(); ctx.translate(cx, 1480 + r2 * 160); ctx.scale(VS, VS); ctx.fillStyle = '#4a4a52'; ctx.beginPath(); ctx.ellipse(0, -50, 80, 42, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(84, -64, 26, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(90, -86, 22, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.fillStyle = '#4a4a52'; for (const dx of [-50, -20, 30, 56]) ctx.fillRect(dx, -20, 14, 30); ctx.restore(); }
    else if (r > 0.7) { ctx.save(); ctx.translate(cx, 1420 + r2 * 220); ctx.scale(VS, VS); ctx.fillStyle = '#4b6fb3'; rrect(-18, -70, 36, 56, 10); ctx.fill(); ctx.fillStyle = '#ffd3ad'; ctx.beginPath(); ctx.arc(0, -84, 16, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#f1d488'; ctx.beginPath(); ctx.moveTo(-44, -86); ctx.lineTo(0, -122); ctx.lineTo(44, -86); ctx.fill(); ctx.restore(); }
  } else if (st === 'delta') {    // bờ sông → sông nước, lục bình, ghe
    ctx.fillStyle = '#7aa64a'; ctx.fillRect(x0, GROUND_TOP, w + 1, 120);
    water(x0, GROUND_TOP + 120, w, H - GROUND_TOP - 120, '#8cc7b8', '#3f8f98');
    for (let j = 0; j < 3; j++) { ctx.fillStyle = '#3f9b3c'; ctx.beginPath(); ctx.ellipse(x0 + hash(k, 70 + j) * w, 1440 + hash(k, 80 + j) * 420, 26, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#b48ad8'; ctx.beginPath(); ctx.arc(x0 + hash(k, 70 + j) * w, 1432 + hash(k, 80 + j) * 420, 6, 0, Math.PI * 2); ctx.fill(); }
    if (r > 0.8) boat(cx, 1560 + r2 * 200, VS * 1.4, r2 > 0.5);
  } else if (st === 'highland') { // đất đỏ bazan + hàng cà phê
    ctx.fillStyle = '#a5552e'; ctx.fillRect(x0, GROUND_TOP, w + 1, H);
    for (let y = 1300, j = 0; y < H; y += 120, j++) for (let t = 0; t < 2; t++) {
      const rr = 20 + hash(k * 7 + j * 3 + t, 95) * 18, bx = x0 + (t + 0.3 + hash(k + j, 96) * 0.4) * w / 2, by = y + hash(k * 3 + t, 97) * 30;
      if (hash(k * 5 + j + t, 98) < 0.18) continue;                       // gốc trống, lối đi giữa vườn
      ctx.fillStyle = (j + t) % 3 ? '#2f6e3a' : '#3b7f45'; ctx.beginPath(); ctx.arc(bx, by, rr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c3261f'; for (let q = 0; q < 3; q++) { ctx.beginPath(); ctx.arc(bx + Math.cos(q * 2.1 + k) * rr * 0.6, by + Math.sin(q * 2.1 + j) * rr * 0.5, 4, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(x0, GROUND_TOP, w + 1, 30);
  } else if (st === 'coast') {    // bãi cát → biển
    ctx.fillStyle = '#f0dca6'; ctx.fillRect(x0, GROUND_TOP, w + 1, 1460 - GROUND_TOP);
    water(x0, 1460 + Math.sin(k + T) * 6, w, H - 1460, '#4fb6e0', '#1f6fae');
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(x0, 1456 + Math.sin(k + T) * 6, w + 1, 8);
    if (r > 0.82) { ctx.save(); ctx.translate(cx, 1400); ctx.scale(VS, VS); ctx.fillStyle = r2 > 0.5 ? '#e8322c' : '#2f7de2'; ctx.beginPath(); ctx.moveTo(-60, -80); ctx.quadraticCurveTo(0, -150, 60, -80); ctx.fill(); ctx.fillStyle = '#777'; ctx.fillRect(-3, -110, 6, 110); ctx.restore(); }
    else if (r > 0.65) boat(cx, 1700, VS * 1.4);
  } else if (st === 'heritage') { // hồ sen trước thành
    ctx.fillStyle = '#86c04f'; ctx.fillRect(x0, GROUND_TOP, w + 1, H);
    water(x0, 1380, w, 260, '#6fb3a8', '#3e8478');
    for (let j = 0; j < 3; j++) { const lx = x0 + hash(k, 90 + j) * w, ly = 1400 + hash(k, 91 + j) * 220; ctx.fillStyle = '#3f9b3c'; ctx.beginPath(); ctx.ellipse(lx, ly, 22, 8, 0, 0, Math.PI * 2); ctx.fill(); if (j % 2 === 0) { ctx.fillStyle = '#ff7aa8'; ctx.beginPath(); ctx.arc(lx, ly - 10, 8, 0, Math.PI * 2); ctx.fill(); } }
  } else if (st === 'karst') {    // ruộng + sông có thuyền nan
    ctx.fillStyle = '#7cbf45'; ctx.fillRect(x0, GROUND_TOP, w + 1, 220);
    water(x0, GROUND_TOP + 220, w, H - GROUND_TOP - 220, '#6fb3a8', '#2f6f66');
    if (r > 0.78) boat(cx, 1600 + r2 * 160, VS * 1.4);
  } else {                        // núi cao: ruộng bậc thang
    for (let y = GROUND_TOP, j = 0; y < H; y += 64, j++) {
      ctx.fillStyle = ['#9ccc65', '#8bc34a', '#c5e1a5', '#7cb342'][j % 4];
      ctx.beginPath(); ctx.moveTo(x0, y + Math.sin(k * 0.7 + j) * 8); ctx.lineTo(x1, y + Math.sin((k + 1) * 0.7 + j) * 8); ctx.lineTo(x1, y + 70); ctx.lineTo(x0, y + 70); ctx.fill();
      ctx.strokeStyle = 'rgba(80,60,30,.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0, y + Math.sin(k * 0.7 + j) * 8); ctx.lineTo(x1, y + Math.sin((k + 1) * 0.7 + j) * 8); ctx.stroke();
    }
    if (r > 0.86) { ctx.save(); ctx.translate(cx, 1500 + r2 * 200); ctx.scale(VS * 1.2, VS * 1.2); stiltHouse(-56, 0, '#5a4632'); ctx.restore(); }
  }
}
function drawRoad() {
  const pts = [];
  for (let x = -24; x <= W + 24; x += 12) pts.push([x, roadTop(meterAt(x))]);
  drawGround();
  // mặt đường
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  for (let k = pts.length - 1; k >= 0; k--) ctx.lineTo(pts[k][0], pts[k][1] + ROAD_H);
  ctx.closePath(); ctx.fillStyle = stageColor(cam, 'asphalt'); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 4;
  ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y + 3) : ctx.moveTo(x, y + 3))); ctx.stroke();
  // vạch giữa
  ctx.strokeStyle = '#f4efe1'; ctx.lineWidth = 5;
  const m0 = Math.floor(meterAt(-20) / 4) * 4;
  for (let m = m0; m < meterAt(W + 20); m += 4) { ctx.beginPath(); ctx.moveTo(xAt(m), roadTop(m) + ROAD_H * 0.42); ctx.lineTo(xAt(m + 2), roadTop(m + 2) + ROAD_H * 0.42); ctx.stroke(); }
  // bó vỉa: phủ mép trên của nền trước theo đường cong
  ctx.fillStyle = '#d6d2c8'; ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y + ROAD_H) : ctx.moveTo(x, y + ROAD_H)));
  for (let k = pts.length - 1; k >= 0; k--) ctx.lineTo(pts[k][0], pts[k][1] + ROAD_H + 14);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y + ROAD_H + 14) : ctx.moveTo(x, y + ROAD_H + 14)));
  for (let k = pts.length - 1; k >= 0; k--) ctx.lineTo(pts[k][0], pts[k][1] + ROAD_H + 22);
  ctx.fill();
  // cột cây số + cờ mốc + cờ follow
  const goal = game.cfg.goal;
  for (let m = Math.max(0, Math.ceil(meterAt(-80) / 100) * 100); m < meterAt(W + 80); m += 100) {
    if (m >= goal) break;
    const x = xAt(m), y = roadTop(m) + ROAD_H + 16;
    ctx.fillStyle = '#fff'; rrect(x - 30, y + 4, 60, 70, 12); ctx.fill();
    ctx.fillStyle = '#e8322c'; rrect(x - 30, y + 4, 60, 26, [12, 12, 0, 0]); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = "800 18px 'Be Vietnam Pro'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('L.CÚ', x, y + 18);
    ctx.fillStyle = '#222'; ctx.font = "800 22px 'Be Vietnam Pro'"; ctx.fillText(((goal - m) / 1000).toFixed(1).replace('.', ','), x, y + 50);
  }
  const fe = game.cfg.flagEvery;
  for (let m = Math.max(fe, Math.ceil(meterAt(-60) / fe) * fe); m < meterAt(W + 60); m += fe) {
    if (m >= goal) break;
    const x = xAt(m), y = roadTop(m) + 2, wv = Math.sin(T * 6 + m) * 4;
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 140); ctx.stroke();
    ctx.fillStyle = m <= game.maxDist ? '#ffd23a' : '#e8322c';
    ctx.beginPath(); ctx.moveTo(x, y - 140); ctx.quadraticCurveTo(x + 40, y - 132 + wv, x + 84, y - 128); ctx.lineTo(x + 84, y - 90); ctx.quadraticCurveTo(x + 40, y - 94 + wv, x, y - 98); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = "800 22px 'Be Vietnam Pro'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${fmt(m)}m`, x + 42, y - 113);
  }
  for (const f of followFlags) {
    const x = xAt(f.m); if (x < -150 || x > W + 150) continue;
    const y = roadTop(f.m) + 2;
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 110); ctx.stroke();
    ctx.fillStyle = '#ff5fa2'; rrect(x, y - 110, 46, 30, 6); ctx.fill();
    avatar(x + 23, y - 95, 11, f.user);
    ctx.font = "800 18px 'Be Vietnam Pro'"; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(String(f.user.name).slice(0, 10), x, y - 120);
  }
  drawGates();
}
// 🚏 Bến xe Cà Mau bằng lá dừa (sau vạch xuất phát ¼ quãng đường). Bị đẩy về tới đây → phe Phá thắng → cả bến bốc cháy.
let depotFire = null;   // { t } khi đang cháy
function frond(x, y, len, ang, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.strokeStyle = col; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, -len * 0.08, len, len * 0.12); ctx.stroke();
  ctx.lineWidth = 4;
  for (let k = 1; k < 9; k++) { const u = k / 9, px = len * u, py = -len * 0.08 * 4 * u * (1 - u) + len * 0.12 * u * u; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + len * 0.07, py + len * 0.16); ctx.moveTo(px, py); ctx.lineTo(px + len * 0.08, py - len * 0.1); ctx.stroke(); }
  ctx.restore();
}
// giai đoạn cháy: lan (0–2 giây) → dữ dội (tới 6 giây) → tàn dần (6–9 giây), cháy đen dần từ giây 1,5
function fireStage(t) { return { spread: clamp(t / 2, 0, 1), blaze: t < 6 ? clamp(t / 1.2, 0, 1) : clamp(1 - (t - 6) / 3, 0, 1), char: clamp((t - 1.5) / 4.5, 0, 1) }; }
const CHAR = '#1a1210';
function depot(x, y) {
  const fire = depotFire, F = fire ? fireStage(fire.t) : { spread: 0, blaze: 0, char: 0 }, burn = F.spread;
  ctx.save(); ctx.translate(x, y); ctx.scale(VS * 1.3, VS * 1.3);
  // nền gạch + ghế chờ + võng
  ctx.fillStyle = '#c9a26a'; ctx.fillRect(-720, -30, 1440, 30);
  ctx.strokeStyle = mix('#6b4226', CHAR, F.char); ctx.lineWidth = 16;
  for (let k = -6; k <= 6; k++) { const px = k * 115; ctx.beginPath(); ctx.moveTo(px, -30); ctx.lineTo(px, -360); ctx.stroke(); }      // cột tre
  ctx.strokeStyle = mix('#8a5a2a', CHAR, F.char); ctx.lineWidth = 6;
  for (const px of F.char > 0.7 ? [] : [-520, 180]) { ctx.beginPath(); ctx.moveTo(px, -250); ctx.quadraticCurveTo(px + 57, -150, px + 115, -250); ctx.stroke(); }  // võng
  ctx.fillStyle = mix('#2f7de2', CHAR, F.char); for (const px of [-300, -60, 420]) { ctx.fillRect(px, -96, 150, 14); ctx.fillRect(px + 10, -82, 10, 52); ctx.fillRect(px + 130, -82, 10, 52); }
  // mái lá dừa: nhiều lớp tàu lá, lớp sau đậm hơn
  const cols = ['#7a8f3a', '#93a84a', '#b8b25a', '#a89345'];
  for (let row = 0; row < 4; row++) {
    for (let k = -14; k <= 14; k++) {
      const px = k * 52 + (row % 2) * 26, py = -470 + row * 34 + Math.abs(k) * 6;
      const sway = Math.sin(T * 1.6 + k + row) * 0.04;
      const lit = burn > 0 && Math.abs(k) / 14 < burn;
      if (lit && F.char > 0.85 && hash(k * 7 + row, 41) < (F.char - 0.85) * 4) continue;   // lá cháy rụi, mái thủng lỗ chỗ
      const ca = lit ? mix(cols[(k + row + 20) % 4], CHAR, Math.min(1, F.char * 1.3)) : cols[(k + row + 20) % 4];
      const cb = lit ? mix(cols[(k + row + 21) % 4], CHAR, Math.min(1, F.char * 1.3)) : cols[(k + row + 21) % 4];
      frond(px, py, 120, 0.9 + sway * (lit ? 3 : 1), ca);
      frond(px, py, 120, Math.PI - 0.9 - sway * (lit ? 3 : 1), cb);
    }
  }
  ctx.fillStyle = mix('#6b4226', CHAR, F.char); ctx.fillRect(-760, -360, 1520, 18);                     // xà ngang
  // biển bến xe
  ctx.fillStyle = mix('#b3261e', CHAR, F.char * 0.9); rrect(-330, -640, 660, 120, 18); ctx.fill();
  ctx.strokeStyle = mix('#f2c14e', '#3a2a1a', F.char); ctx.lineWidth = 8; rrect(-318, -628, 636, 96, 12); ctx.stroke();
  ctx.fillStyle = mix('#f2c14e', '#4a3a2a', F.char * 0.8); ctx.font = "64px 'Bungee', 'Be Vietnam Pro'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('BẾN XE CÀ MAU', 0, -578);
  ctx.strokeStyle = '#6b4226'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(-260, -520); ctx.lineTo(-240, -470); ctx.moveTo(260, -520); ctx.lineTo(240, -470); ctx.stroke();
  if (!fire) { ctx.fillStyle = 'rgba(255,244,220,.92)'; ctx.font = "800 30px 'Be Vietnam Pro'"; ctx.fillText('Bị đẩy về tới đây là phe Phá thắng', 0, -400); }
  // lửa dày đặc: 3 tầng lưỡi lửa lởm chởm (đỏ thẫm ở gốc → cam → vàng ở ngọn) + lõi sáng; cộng sáng chỉ cho ánh lửa
  if (fire && F.blaze > 0.01) {
    ctx.save();
    for (let row = 0; row < 3; row++) for (let k = -30; k <= 30; k++) {
      if (Math.abs(k) / 30 > burn) continue;
      const px = k * 24 + row * 9 + (hash(k, 9 + row) - 0.5) * 14, base = -392 + Math.abs(k) * 3 - row * 30;
      const flick = Math.sin(T * (9 + (k & 3)) + k * 1.9) * 0.22 + Math.sin(T * 23 + k) * 0.08;
      const h = (190 + hash(k + row * 50, 7) * 190) * (1 + flick) * F.blaze * [1, 0.8, 0.55][row];
      const w = 26 + hash(k, 8) * 18, sw = Math.sin(T * 5 + k * 0.7) * 22;
      const g = ctx.createLinearGradient(0, base, 0, base - h);
      g.addColorStop(0, 'rgba(150,20,8,.95)'); g.addColorStop(0.25, 'rgba(230,60,12,.95)'); g.addColorStop(0.55, 'rgba(255,140,20,.9)'); g.addColorStop(0.85, 'rgba(255,210,70,.7)'); g.addColorStop(1, 'rgba(255,235,160,0)');
      ctx.fillStyle = g; ctx.beginPath();
      ctx.moveTo(px - w, base);
      ctx.bezierCurveTo(px - w * 1.15, base - h * 0.4, px - w * 0.35 + sw, base - h * 0.72, px + sw * 1.5, base - h);
      ctx.bezierCurveTo(px + w * 0.25 + sw, base - h * 0.62, px + w * 1.15, base - h * 0.38, px + w, base);
      ctx.fill();
      if (row === 0) {                                                  // lõi sáng
        const hc = h * 0.45;
        ctx.fillStyle = 'rgba(255,236,170,.75)'; ctx.beginPath();
        ctx.moveTo(px - w * 0.4, base); ctx.quadraticCurveTo(px - w * 0.3 + sw * 0.5, base - hc * 0.7, px + sw * 0.7, base - hc); ctx.quadraticCurveTo(px + w * 0.3 + sw * 0.5, base - hc * 0.7, px + w * 0.4, base); ctx.fill();
      }
    }
    for (let k = -6; k <= 6; k++) {                                     // cột tre bốc cháy
      if (Math.abs(k) / 6 > burn) continue;
      const px = k * 115, h = (110 + Math.sin(T * 11 + k) * 40) * F.blaze;
      const g = ctx.createLinearGradient(0, -60, 0, -60 - h); g.addColorStop(0, 'rgba(255,110,20,.9)'); g.addColorStop(1, 'rgba(255,210,80,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(px, -60 - h / 2, 26, h / 2, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(0, -380, 60, 0, -380, 900);    // ánh lửa hắt ra xung quanh
    glow.addColorStop(0, `rgba(255,140,40,${0.35 * F.blaze + Math.sin(T * 13) * 0.04})`); glow.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = glow; ctx.fillRect(-1000, -1100, 2000, 1150);
    ctx.restore();
  }
  // tàn: than đỏ lập loè trên đống đen
  if (fire && F.char > 0.5) {
    for (let k = -20; k <= 20; k++) {
      const a = 0.35 + 0.35 * Math.sin(T * 5 + k * 2.3);
      ctx.fillStyle = `rgba(255,${70 + (k & 3) * 20},20,${a * F.char})`;
      ctx.beginPath(); ctx.arc(k * 36, -380 + hash(k, 44) * 50, 6 + hash(k, 45) * 6, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
  if (fire) {
    // khói: vừa đủ dày để thấy cột khói đen, không che lửa (tối đa ~40 cụm cùng lúc)
    const smokes = fx.reduce((n, f) => n + (f.k === 'smoke'), 0);
    if (smokes < 36 && Math.random() < 0.3 + 0.3 * F.blaze) fx.push({ k: 'smoke', x: x + (Math.random() - 0.5) * S(1100) * Math.max(0.3, burn), y: y - S(760 + Math.random() * 120), t: 0, dur: 3 + Math.random(), r: S(60 + Math.random() * 50), dark: 0.5 + 0.25 * F.char });
    if (F.blaze > 0.2) for (let i = 0; i < 2; i++) fx.push({ k: 'ember', x: x + (Math.random() - 0.5) * S(1400) * burn, y: y - S(450), vx: (Math.random() - 0.5) * 60, vy: -120 - Math.random() * 200, t: 0, dur: 1.6 + Math.random() });
  }
}
function drawGates() {
  const md = -game.cfg.goal * game.cfg.backFloor, xd = xAt(md + S(vehOf().mid) / PX);
  if (xd > -900 && xd < W + 900) depot(xd, roadTop(md) + 2);
  // vạch xuất phát
  const xs = xAt(0);
  if (xs > -260 && xs < W + 260) {
    const y = roadTop(0);
    ctx.save(); ctx.translate(xs, y); ctx.scale(0.75, 0.75); ctx.translate(-xs, -y);
    ctx.fillStyle = '#ccc'; ctx.fillRect(xs - 6, y - 260, 12, 260);
    ctx.fillStyle = '#1f6fd1'; rrect(xs - 190, y - 300, 380, 64, 14); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = "800 34px 'Be Vietnam Pro'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🚩 MŨI CÀ MAU · XUẤT PHÁT', xs, y - 266);
    ctx.restore();
  }
  // cổng làng
  const goal = game.cfg.goal, xg = xAt(goal);
  if (xg > -380 && xg < W + 760) {
    const y = roadTop(goal) + ROAD_H;
    ctx.save(); ctx.translate(xg, y); ctx.scale(0.8, 0.8); ctx.translate(-xg, -y);
    ctx.fillStyle = '#b8432f';
    ctx.fillRect(xg - 230, y - 330, 40, 420); ctx.fillRect(xg + 190, y - 330, 40, 420);
    ctx.fillStyle = '#7a2b1e'; rrect(xg - 270, y - 400, 540, 90, 18); ctx.fill();
    ctx.fillStyle = '#ffd23a'; ctx.font = "800 40px 'Be Vietnam Pro'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('LŨNG CÚ · HÀ GIANG — VỀ QUÊ', xg, y - 354);
    ctx.fillStyle = '#c44a2f'; ctx.beginPath(); ctx.moveTo(xg - 300, y - 400); ctx.lineTo(xg, y - 470); ctx.lineTo(xg + 300, y - 400); ctx.fill();
    for (const dx of [-210, 210]) { const sw = Math.sin(T * 2 + dx) * 5; ctx.fillStyle = '#e8322c'; ctx.beginPath(); ctx.ellipse(xg + dx + sw, y - 280, 24, 30, 0, 0, Math.PI * 2); ctx.fill(); }
    mai(xg - 330, y - ROAD_H, 7); mai(xg + 340, y - ROAD_H, 9);
    ctx.restore();
    flagTower(xg + 420, roadTop(goal) - 6, 0.75);
  }
}

// ---------------- xe & nhân vật ----------------
const BIKES = { red: '#e23a2f', blue: '#2f7de2', pink: '#ff6fae', yellow: '#ffc531', green: '#22b35e', black: '#30333b' };
function wheel(x, y, r, rot) {
  ctx.fillStyle = '#1d1f24'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b9bec8'; ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#6d727d'; ctx.lineWidth = 3;
  for (let k = 0; k < 5; k++) { const a = rot + k * Math.PI * 0.4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55); ctx.stroke(); }
  ctx.fillStyle = '#444'; ctx.beginPath(); ctx.arc(x, y, r * 0.16, 0, Math.PI * 2); ctx.fill();
}
/** Xe máy + người lái. (x, y) = điểm giữa 2 bánh chạm đất. o: { color, rot, ang, rider:'ride'|'walk'|'none', helmet, shirt, gifts, scale } */
function scooter(x, y, o = {}) {
  const s = o.scale || VS, col = o.color || BIKES.red;
  ctx.save(); ctx.translate(x, y); ctx.rotate(o.ang || 0); ctx.scale(s, s);
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(0, 2, 100, 12, 0, 0, Math.PI * 2); ctx.fill();
  // ống pô
  ctx.strokeStyle = '#8d939e'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-40, -30); ctx.lineTo(-96, -36); ctx.stroke();
  wheel(-62, -28, 28, o.rot || 0); wheel(62, -28, 28, o.rot || 0);
  // thân xe
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(-92, -52); ctx.quadraticCurveTo(-96, -86, -60, -84); ctx.lineTo(4, -80); ctx.quadraticCurveTo(14, -52, 34, -48);
  ctx.lineTo(40, -48); ctx.quadraticCurveTo(46, -100, 60, -110); ctx.lineTo(72, -104); ctx.quadraticCurveTo(64, -70, 90, -42);
  ctx.quadraticCurveTo(64, -60, 40, -30); ctx.lineTo(-30, -30); ctx.quadraticCurveTo(-60, -60, -92, -52); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.beginPath(); ctx.ellipse(-46, -72, 30, 6, -0.05, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2b2d33'; rrect(-66, -94, 70, 16, 8); ctx.fill();                 // yên
  ctx.strokeStyle = '#3a3d45'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(62, -108); ctx.lineTo(56, -128); ctx.stroke(); // cổ lái
  ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(46, -130); ctx.lineTo(70, -126); ctx.stroke();
  ctx.fillStyle = '#fff6b0'; ctx.beginPath(); ctx.ellipse(76, -108, 9, 7, 0, 0, Math.PI * 2); ctx.fill(); // đèn
  if (o.gifts !== false) {   // quà Tết sau yên
    ctx.fillStyle = '#e8322c'; rrect(-104, -128, 44, 36, 5); ctx.fill();
    ctx.fillStyle = '#ffd23a'; ctx.fillRect(-84, -128, 6, 36); ctx.fillRect(-104, -113, 44, 6);
    ctx.fillStyle = '#ffd23a'; rrect(-98, -156, 34, 28, 5); ctx.fill(); ctx.fillStyle = '#e8322c'; ctx.fillRect(-83, -156, 5, 28);
    ctx.strokeStyle = '#6b4226'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-104, -128); ctx.quadraticCurveTo(-120, -180, -112, -214); ctx.stroke();
    for (let k = 0; k < 7; k++) { ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(-114 + Math.sin(k * 2.1) * 12, -170 - k * 7, 6, 0, Math.PI * 2); ctx.fill(); }
  }
  if (o.rider !== 'none' && o.rider !== 'walk') rider(0, 0, o, 'ride');
  ctx.restore();
  if (o.rider === 'walk') { ctx.save(); ctx.translate(x - 110 * s, y); ctx.scale(s, s); rider(0, 0, o, 'walk'); ctx.restore(); }
}
function rider(x, y, o, pose) {
  const shirt = o.shirt || '#2f6bd8', helm = o.helmet || '#ffcf33', skin = '#ffd3ad';
  ctx.save(); ctx.translate(x, y);
  ctx.lineCap = 'round';
  if (pose === 'ride') {
    ctx.strokeStyle = '#2a3550'; ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(-24, -92); ctx.lineTo(16, -80); ctx.lineTo(22, -50); ctx.stroke();
    ctx.fillStyle = '#222'; rrect(10, -54, 28, 12, 5); ctx.fill();
    ctx.fillStyle = shirt; rrect(-40, -160, 46, 74, 18); ctx.fill();
    ctx.strokeStyle = shirt; ctx.lineWidth = 15; ctx.beginPath(); ctx.moveTo(-8, -146); ctx.lineTo(30, -122); ctx.lineTo(50, -128); ctx.stroke();
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(52, -128, 8, 0, Math.PI * 2); ctx.fill();
    head(-14, -192, helm, skin, o);
  } else {
    const k = Math.sin(T * 9);
    ctx.strokeStyle = '#2a3550'; ctx.lineWidth = 18;
    ctx.beginPath(); ctx.moveTo(0, -84); ctx.lineTo(-14 * k, -40); ctx.lineTo(-18 * k, -4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -84); ctx.lineTo(14 * k, -40); ctx.lineTo(18 * k, -4); ctx.stroke();
    ctx.fillStyle = shirt; rrect(-24, -158, 48, 80, 18); ctx.fill();
    ctx.strokeStyle = shirt; ctx.lineWidth = 15; ctx.beginPath(); ctx.moveTo(10, -140); ctx.lineTo(60, -118); ctx.stroke();
    head(0, -190, helm, skin, o);
    ctx.font = "800 26px 'Be Vietnam Pro'"; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('💦', 40, -230);
  }
  ctx.restore();
}
function head(x, y, helm, skin, o) {
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(x + 12, y + 2, 4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#b35a3c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + 14, y + 10, 7, 0.2, Math.PI * 0.8); ctx.stroke();
  ctx.fillStyle = helm; ctx.beginPath(); ctx.arc(x - 2, y - 6, 33, Math.PI * 1.02, Math.PI * 2.04); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(x - 12, y - 26, 12, 5, -0.4, 0, Math.PI * 2); ctx.fill();
  if (o.face) avatar(x - 4, y - 22, 13, o.face, '#fff');
}
// ---------------- xe chở cả đoàn: 🚌 xe buýt · 🐂 xe bò có máng ----------------
// Toạ độ "local" (chưa nhân VS), gốc = mép trước xe chạm đất lệch SX. rear = đuôi xe phía sau SX, mid = giữa xe, top = nóc.
const VEH = {
  scooter: { rear: 100, mid: 0, top: 230 },
  bus:     { rear: 470, mid: -185, top: 330 },
  oxcart:  { rear: 470, mid: -190, top: 250 },
};
const CAR_GAP = 600;   // khoảng cách 2 xe trong đoàn (đơn vị chưa thu nhỏ)
let carsNow = 1;       // số xe trong đoàn đang vẽ (render cập nhật)
/** Kích thước cả đoàn: rear = đuôi xe cuối, mid = giữa đoàn. */
function vehOf() {
  const v = VEH[VIEW.vehicle] || VEH.bus, n = VIEW.vehicle === 'scooter' ? 1 : carsNow;
  return { rear: v.rear + (n - 1) * CAR_GAP, mid: v.mid - (n - 1) * CAR_GAP / 2, top: v.top };
}
const SHIRTS = ['#2f6bd8', '#e2557b', '#18b37e', '#f6a21e', '#7b61ff', '#e8322c', '#2fa4e7', '#8a5a3a'];
function strHash(s) { let h = 0; for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); }
/** Người ngồi: vai + cổ + đầu (ảnh đại diện làm mặt), áo màu theo người. */
function passenger(x, y, r, u, mood) {
  const c = SHIRTS[strHash(u && u.id) % SHIRTS.length];
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.ellipse(x, y + r * 1.75, r * 1.25, r * 0.8, 0, Math.PI, 0); ctx.fill();
  ctx.fillRect(x - r * 1.25, y + r * 1.74, r * 2.5, r * 0.9);
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x - r * 0.3, y + r * 1.0, r * 0.6, r * 0.5);
  ctx.fillStyle = '#ffd3ad'; ctx.fillRect(x - r * 0.28, y + r * 0.8, r * 0.56, r * 0.5);
  avatar(x, y, r, u, '#fff');
  if (mood === 'sick') { ctx.fillStyle = 'rgba(80,190,90,.45)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
}
/** Người đứng ngoài xe (xuống ăn, đi vệ sinh, check-in): thân + chân + đầu ảnh đại diện. */
function walker(x, y, u, s = 1, phase = 0, still = false) {
  const k = still ? 0 : Math.sin(T * 8 + phase);
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.strokeStyle = '#2a3550'; ctx.lineWidth = 12; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-6, -50); ctx.lineTo(-10 - 8 * k, 0); ctx.moveTo(6, -50); ctx.lineTo(10 + 8 * k, 0); ctx.stroke();
  ctx.restore();
  ctx.save(); ctx.translate(x, y - 50 * s); ctx.scale(s, s);
  passenger(0, -62, 24, u);
  ctx.restore();
}
/** Một xe buýt. carIndex 0 = xe đầu (có tài xế), các xe sau có biển "XE 2"… và móc nối. */
function bus(x, y, o) {
  const col = o.color || '#22b35e', P = o.passengers || { seated: [], extra: 0 }, ci = o.carIndex || 0;
  ctx.save(); ctx.translate(x - S(185), y); ctx.rotate(o.ang || 0); ctx.translate(S(185), 0); ctx.scale(VS, VS);
  ctx.translate(100, 0);
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(-280, 4, 300, 16, 0, 0, Math.PI * 2); ctx.fill();
  if (ci > 0) { ctx.fillStyle = '#3a3d45'; ctx.fillRect(0, -70, 44, 12); }      // móc nối với xe trước
  ctx.fillStyle = col; rrect(-560, -260, 560, 216, [26, 46, 12, 12]); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillRect(-560, -120, 560, 26);
  ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(-560, -60, 560, 16);
  ctx.fillStyle = '#e8322c'; rrect(-470, -112, 250, 40, 8); ctx.fill();
  ctx.fillStyle = '#ffd23a'; ctx.font = "800 30px 'Be Vietnam Pro'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ci ? `ĐOÀN VỀ QUÊ · XE ${ci + 1}` : 'VỀ QUÊ ĂN TẾT', -345, -91);
  ctx.fillStyle = '#bfe3ff'; ctx.beginPath(); ctx.moveTo(-78, -238); ctx.lineTo(-14, -238); ctx.lineTo(-4, -140); ctx.lineTo(-78, -140); ctx.closePath(); ctx.fill();
  if (o.driver) { ctx.save(); rrect(-78, -238, 74, 98, 6); ctx.clip(); passenger(-44, -196, 24, o.driver); ctx.restore(); }
  if (ci > 0 && !o.driver) { ctx.fillStyle = '#ffd23a'; rrect(-70, -214, 58, 40, 6); ctx.fill(); ctx.fillStyle = '#222'; ctx.font = "800 24px 'Be Vietnam Pro'"; ctx.fillText(`XE ${ci + 1}`, -41, -193); }
  ctx.fillStyle = '#2b2d33'; ctx.fillRect(-120, -238, 34, 194);
  ctx.fillStyle = '#fff6b0'; ctx.beginPath(); ctx.ellipse(-6, -76, 10, 14, 0, 0, Math.PI * 2); ctx.fill();
  // 6 cửa sổ: đầu + vai, vai bị mép dưới cửa sổ che
  for (let i = 0; i < 6; i++) {
    const wx = -190 - i * 62;
    ctx.fillStyle = '#bfe3ff'; rrect(wx - 26, -238, 52, 82, 8); ctx.fill();
    const u = P.seated[i];
    if (u) { ctx.save(); rrect(wx - 26, -238, 52, 82, 8); ctx.clip(); passenger(wx, -212 + Math.sin(T * 9 + i) * 2 - PANIC * Math.abs(Math.sin(T * 22 + i * 1.7)) * 34, 18, u, o.sick === u.id ? 'sick' : ''); ctx.restore(); }
    ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(wx - 22, -234, 10, 74);
  }
  // nóc: hành lý + người ngồi trên nóc (thấy đầu + vai)
  const roof = P.seated.slice(6);
  roof.forEach((u, i) => {
    const rx = -380 + i * 40 - (i % 2) * 4, ry = -312 - (i % 2) * 10 + Math.sin(T * 8 + i) * 2 - PANIC * Math.abs(Math.sin(T * 20 + i * 1.3)) * 40;
    passenger(rx, ry, 15, u);
  });
  ctx.fillStyle = '#5b4632'; ctx.fillRect(-530, -278, 440, 14);
  ctx.fillStyle = '#e8322c'; rrect(-520, -318, 70, 40, 6); ctx.fill(); ctx.fillStyle = '#2f7de2'; rrect(-440, -306, 60, 28, 6); ctx.fill();
  if (ci === 0) mai(-100, -262, 3);
  if (P.extra > 0) { ctx.fillStyle = '#ffd23a'; rrect(-560, -380, 120, 44, 22); ctx.fill(); ctx.fillStyle = '#222'; ctx.font = "800 30px 'Be Vietnam Pro'"; ctx.fillText(`+${P.extra}`, -500, -357); }
  const flat = o.flat && ci === 0;
  wheel(-100, -42 + (flat ? 12 : 0), flat ? 34 : 42, o.rot || 0); wheel(-450, -42, 42, o.rot || 0);
  ctx.restore();
}
/** Xe bò: xe đầu có con bò kéo, máng sau móc nối; khách ngồi 2 hàng, thấy đầu + vai trên thành máng. */
function oxcart(x, y, o) {
  const P = o.passengers || { seated: [], extra: 0 }, ci = o.carIndex || 0;
  const run = T * (o.running ? 16 : 3);
  ctx.save(); ctx.translate(x - S(190), y); ctx.rotate(o.ang || 0); ctx.translate(S(190), 0); ctx.scale(VS, VS);
  ctx.translate(100, 0);
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(-260, 4, 300, 14, 0, 0, Math.PI * 2); ctx.fill();
  if (ci === 0) {
    ctx.strokeStyle = '#6b4226'; ctx.lineWidth = 16; ctx.lineCap = 'round';
    for (const [lx, ph] of [[-150, 0], [-120, 2], [-40, 1], [-12, 3]]) { ctx.beginPath(); ctx.moveTo(lx, -90); ctx.lineTo(lx + Math.sin(run + ph) * 18, -6); ctx.stroke(); }
    ctx.fillStyle = '#b5713a'; ctx.beginPath(); ctx.ellipse(-80, -120, 100, 52, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2e6d6'; ctx.beginPath(); ctx.ellipse(-70, -100, 44, 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b5713a'; ctx.beginPath(); ctx.ellipse(28, -160 + Math.sin(run) * 4, 40, 32, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f0c9a8'; ctx.beginPath(); ctx.ellipse(56, -146 + Math.sin(run) * 4, 20, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#efe6d0'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(14, -186); ctx.quadraticCurveTo(0, -218, -18, -210); ctx.moveTo(34, -190); ctx.quadraticCurveTo(44, -224, 60, -214); ctx.stroke();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(36, -168, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#b5713a'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(-178, -130); ctx.quadraticCurveTo(-200, -100 + Math.sin(run) * 10, -192, -80); ctx.stroke();
    ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(-10, -150); ctx.lineTo(-250, -110); ctx.stroke();
  } else { ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(40, -120); ctx.lineTo(-230, -110); ctx.stroke(); }
  // thành sau máng
  ctx.fillStyle = '#7a5230'; rrect(-566, -200, 342, 40, 8); ctx.fill();
  // khách 2 hàng (hàng sau cao hơn) — vẽ trước thành trước máng để thân bị che
  P.seated.slice(0, 12).forEach((u, i) => {
    const row = i % 2, col = Math.floor(i / 2);
    passenger(-520 + col * 52 + row * 24, -214 - row * 30 + Math.sin(T * 10 + i) * 3 - PANIC * Math.abs(Math.sin(T * 22 + i * 1.7)) * 36, 19, u, o.sick === u.id ? 'sick' : '');
  });
  ctx.fillStyle = '#9b6a3a'; rrect(-560, -170, 330, 86, 10); ctx.fill();
  ctx.strokeStyle = '#6b4226'; ctx.lineWidth = 5; for (let k = -540; k < -240; k += 40) { ctx.beginPath(); ctx.moveTo(k, -166); ctx.lineTo(k, -88); ctx.stroke(); }
  ctx.fillStyle = '#c98f55'; ctx.fillRect(-566, -180, 342, 16);
  if (ci > 0) { ctx.fillStyle = '#ffd23a'; rrect(-470, -148, 120, 36, 6); ctx.fill(); ctx.fillStyle = '#222'; ctx.font = "800 24px 'Be Vietnam Pro'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`XE ${ci + 1}`, -410, -129); }
  if (P.extra > 0) { ctx.fillStyle = '#ffd23a'; rrect(-580, -320, 120, 44, 22); ctx.fill(); ctx.fillStyle = '#222'; ctx.font = "800 30px 'Be Vietnam Pro'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`+${P.extra}`, -520, -297); }
  if (ci === 0) {
    if (o.driver) passenger(-242, -262, 24, o.driver); else head(-242, -256, '#f1d488', '#ffd3ad', {});
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-226, -214); ctx.quadraticCurveTo(-120, -180, 20, -150); ctx.stroke();
  }
  const flat = o.flat && ci === 0;
  ctx.fillStyle = '#6b4226'; ctx.beginPath(); ctx.ellipse(-395, -56 + (flat ? 10 : 0), 56, flat ? 44 : 56, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c98f55'; ctx.beginPath(); ctx.arc(-395, -56 + (flat ? 10 : 0), flat ? 34 : 44, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#6b4226'; ctx.lineWidth = 6; for (let k = 0; k < 6; k++) { const a = (o.rot || 0) + k * Math.PI / 3; ctx.beginPath(); ctx.moveTo(-395, -56); ctx.lineTo(-395 + Math.cos(a) * 44, -56 + Math.sin(a) * 44); ctx.stroke(); }
  ctx.restore();
}
/** Vẽ cả đoàn tại (SX, y): xe đầu ở SX, xe sau lùi CAR_GAP; mỗi xe một phần hành khách. */
function drawVehicle(x, y, o) {
  if (VIEW.vehicle === 'scooter') return scooter(x, y, Object.assign({}, o, { face: o.driver && o.driver.avatar ? o.driver : null }));
  const P = o.passengers || { seated: [], extra: 0, cars: 1 }, n = Math.max(1, P.cars || 1), per = game.cfg.seats;
  for (let i = n - 1; i >= 0; i--) {
    const xi = x - S(CAR_GAP) * i;
    const part = { seated: P.seated.slice(i * per, (i + 1) * per), extra: i === n - 1 ? P.extra : 0 };
    const dI = i ? game.drivers[i] : null;   // 🧑‍✈️ tài xế riêng của xe sau
    const oi = Object.assign({}, o, { passengers: part, carIndex: i, ang: (o.ang || 0) + (i ? Math.sin(T * 3 + i) * 0.01 : 0), driver: i ? (dI ? { id: dI.id, name: dI.name, avatar: dI.avatar } : null) : o.driver });
    const yi = i ? contactY(meterAt(xi - S(185))) - (y < contactY(cam) - 1 ? contactY(cam) - y : 0) : y;
    if (VIEW.vehicle === 'oxcart') oxcart(xi, yi, oi); else bus(xi, yi, oi);
  }
}
function driverTag(d, i) { return { name: `🧑‍✈️ XE ${i + 1} · ${String(d.name).slice(0, 12)} ${d.free ? '· giữ lái' : fmtClock(d.left)}`, avatar: d.avatar }; }
function fmtClock(sec) { const s = Math.max(0, Math.ceil(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

function container(xFront, m, u, t, mult) {
  const y = contactY(m);
  ctx.save(); ctx.translate(xFront, y); ctx.scale(VS, VS);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(250, 2, 280, 16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2f6fd1'; rrect(0, -190, 130, 150, [30, 10, 6, 6]); ctx.fill();      // cabin quay trái
  ctx.fillStyle = '#bfe3ff'; rrect(12, -176, 64, 56, 10); ctx.fill();
  ctx.fillStyle = '#ffe27a'; ctx.fillRect(-4, -78, 14, 20);
  ctx.fillStyle = '#ef7d22'; rrect(136, -300, 420, 260, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 4;
  for (let k = 160; k < 550; k += 34) { ctx.beginPath(); ctx.moveTo(k, -290); ctx.lineTo(k, -50); ctx.stroke(); }
  for (const dx of [70, 230, 330, 470]) wheel(dx, -32, 32, -cam * 0.8);
  avatar(250, -200, 60, u, '#fff');
  ctx.fillStyle = '#fff'; ctx.font = "800 50px 'Be Vietnam Pro'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String((u && u.name) || '').slice(0, 12), 350, -95);
  if (mult > 1) { ctx.fillStyle = '#ffe27a'; ctx.font = "800 70px 'Be Vietnam Pro'"; ctx.fillText(`×${mult}`, 480, -230); }
  ctx.restore();
  void t;
}
/** xe ủi quay đầu về bên trái, lưỡi ủi tì vào đầu đoàn xe (xFront = mép lưỡi ủi) */
function bulldozer(xFront, m, alpha) {
  const y = contactY(m);
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(xFront, y); ctx.scale(VS, VS);
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(200, 4, 230, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4a4d55'; rrect(0, -150, 34, 150, 6); ctx.fill();                      // lưỡi ủi
  ctx.strokeStyle = '#6d7079'; ctx.lineWidth = 5; for (let k = 1; k < 5; k++) { ctx.beginPath(); ctx.moveTo(4, -k * 30); ctx.lineTo(30, -k * 30); ctx.stroke(); }
  ctx.strokeStyle = '#3a3d45'; ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(30, -70); ctx.lineTo(110, -90); ctx.stroke();
  ctx.fillStyle = '#2b2d33'; rrect(90, -62, 300, 62, 31); ctx.fill();                      // xích
  ctx.fillStyle = '#55585f'; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(122 + k * 47, -31, 18, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#ffc531'; rrect(100, -170, 280, 110, 14); ctx.fill();                   // thân
  ctx.fillStyle = '#e0a81c'; ctx.fillRect(100, -86, 280, 14);
  ctx.fillStyle = '#ffc531'; rrect(240, -290, 130, 124, 12); ctx.fill();                   // cabin
  ctx.fillStyle = '#bfe3ff'; rrect(256, -276, 98, 64, 8); ctx.fill();
  ctx.fillStyle = '#3a3d45'; ctx.fillRect(160, -230, 18, 62);                              // ống khói
  ctx.restore();
  if (Math.random() < 0.3 * alpha) fx.push({ k: 'smoke', x: xFront + S(169), y: y - S(240), t: 0, dur: 1.4, r: S(18) });
}
function towTruck(xBack, m, u, alpha) {
  const y = contactY(m);
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(xBack, y); ctx.scale(VS, VS);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(150, 2, 170, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffc531'; rrect(0, -110, 190, 70, 8); ctx.fill();
  ctx.fillStyle = '#ffc531'; rrect(190, -180, 110, 140, [8, 34, 6, 6]); ctx.fill();
  ctx.fillStyle = '#bfe3ff'; rrect(228, -166, 60, 52, 10); ctx.fill();
  ctx.fillStyle = '#e8322c'; ctx.fillRect(228, -194, 40, 14);
  ctx.strokeStyle = '#555'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(40, -110); ctx.lineTo(-10, -200); ctx.stroke();
  wheel(60, -30, 30, cam * 0.8); wheel(250, -30, 30, cam * 0.8);
  ctx.restore();
  ctx.save(); ctx.globalAlpha = alpha; tag(xBack + S(160), y - S(210), u, 'rgba(10,120,60,.92)', 22); ctx.restore();
  return { hx: xBack - S(10), hy: y - S(200) };
}
function heli(x, y, u, t) {
  ctx.save(); ctx.translate(x, y); ctx.scale(VS, VS);
  ctx.strokeStyle = '#333'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-70, 60); ctx.lineTo(70, 60); ctx.moveTo(-40, 30); ctx.lineTo(-50, 60); ctx.moveTo(40, 30); ctx.lineTo(50, 60); ctx.stroke();
  ctx.fillStyle = '#e8322c'; ctx.beginPath(); ctx.ellipse(0, 0, 110, 46, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(-200, -14, 110, 22);
  ctx.fillStyle = '#bfe3ff'; ctx.beginPath(); ctx.ellipse(50, -6, 42, 26, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = "800 30px 'Be Vietnam Pro'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('CỨU HỘ', -36, 14);
  const sp = Math.abs(Math.cos(t * 40));
  ctx.fillStyle = '#333'; ctx.fillRect(-6, -64, 12, 22);
  ctx.fillStyle = 'rgba(40,40,40,.7)'; rrect(-170 * sp, -70, 340 * sp, 10, 5); ctx.fill();
  ctx.fillRect(-206, -40 * sp - 4, 12, 80 * sp + 8);
  ctx.restore();
  tag(x, y - S(90), u, 'rgba(10,120,60,.92)', 22);
}
function dog(x, y, t) {
  const k = Math.sin(t * 18);
  ctx.save(); ctx.translate(x, y); ctx.scale(VS, VS);
  ctx.strokeStyle = '#7a4a26'; ctx.lineWidth = 10; ctx.lineCap = 'round';
  for (const [dx, ph] of [[-30, 0], [-14, 1], [22, 0.5], [36, 1.5]]) { ctx.beginPath(); ctx.moveTo(dx, -36); ctx.lineTo(dx + Math.sin(t * 18 + ph * 3) * 10, -4); ctx.stroke(); }
  ctx.fillStyle = '#b8743e'; ctx.beginPath(); ctx.ellipse(0, -52, 50, 26, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(54, -76, 24, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7a4a26'; ctx.beginPath(); ctx.ellipse(46, -98, 9, 16, -0.4 + k * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(62, -80, 4, 0, Math.PI * 2); ctx.arc(78, -72, 5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#b8743e'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(-48, -60); ctx.quadraticCurveTo(-70, -90 + k * 10, -64, -100); ctx.stroke();
  ctx.restore();
}
function duck(x, y, t, ph) {
  const b = Math.abs(Math.sin(t * 8 + ph)) * 4;
  ctx.save(); ctx.translate(x, y - b); ctx.scale(VS, VS);
  ctx.fillStyle = '#ff9f1c'; ctx.fillRect(-8, -12, 6, 12); ctx.fillRect(4, -12, 6, 12);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, -34, 30, 22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(22, -60, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff9f1c'; ctx.beginPath(); ctx.moveTo(34, -62); ctx.lineTo(52, -58); ctx.lineTo(34, -54); ctx.fill();
  ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(26, -64, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function banana(x, y, spin) {
  ctx.save(); ctx.translate(x, y - S(14)); ctx.rotate(spin || 0); ctx.scale(VS, VS);
  ctx.fillStyle = '#ffd23a';
  for (const a of [-0.9, 0, 0.9]) { ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, -18, 10, 22, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  ctx.fillStyle = '#8b6a1e'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function pothole(x, y) {
  ctx.save(); ctx.translate(x, y); ctx.scale(VS, VS); x = 0; y = 0;
  ctx.fillStyle = '#26282d'; ctx.beginPath(); ctx.ellipse(x, y - 6, 56, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2d2f35'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 56, y - 6); ctx.lineTo(x - 80, y - 12); ctx.moveTo(x + 56, y - 6); ctx.lineTo(x + 84, y); ctx.stroke();
  ctx.fillStyle = 'rgba(120,170,220,.5)'; ctx.beginPath(); ctx.ellipse(x, y - 4, 38, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function cloud(x, y, s, dark) {
  ctx.fillStyle = dark ? '#5b6573' : 'rgba(255,255,255,.9)';
  for (const [dx, dy, r] of [[-70, 10, 46], [-20, -14, 60], [44, 0, 52], [90, 16, 38]]) { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); ctx.fill(); }
}
function trashBin(x, y, open, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s * VS, s * VS);
  ctx.fillStyle = '#1f8f4a'; ctx.beginPath(); ctx.moveTo(-44, -110); ctx.lineTo(44, -110); ctx.lineTo(36, 0); ctx.lineTo(-36, 0); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 5; for (const dx of [-18, 0, 18]) { ctx.beginPath(); ctx.moveTo(dx, -96); ctx.lineTo(dx * 0.8, -10); ctx.stroke(); }
  ctx.save(); ctx.translate(-48, -112); ctx.rotate(-open * 0.9);
  ctx.fillStyle = '#167a3d'; rrect(0, -14, 96, 16, 6); ctx.fill(); ctx.fillRect(38, -24, 20, 10);
  ctx.restore();
  ctx.fillStyle = '#fff'; ctx.font = "800 34px 'Be Vietnam Pro'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♻', 0, -56);
  ctx.restore();
}
/** cây bị nhổ bật gốc, tàu dừa, ngói bay vòng quanh phễu lốc */
function tornadoDebris(x, y, t, alpha) {
  ctx.save(); ctx.globalAlpha = alpha;
  for (let k = 0; k < 9; k++) {
    const a = t * (2.2 + k * 0.15) + k * 0.9, rr = S(220 + (k % 3) * 120), hy = y - S(200 + k * 95) + Math.sin(t * 2 + k) * S(30);
    const px = x + Math.cos(a) * rr, front = Math.sin(a) > 0;
    ctx.save(); ctx.translate(px, hy); ctx.rotate(t * (3 + k % 4) + k); ctx.scale(VS * (front ? 0.95 : 0.7), VS * (front ? 0.95 : 0.7));
    if (k % 3 === 0) tree(0, 60, '#4f9a2c', 0.8); else if (k % 3 === 1) palm(0, 120); else { ctx.fillStyle = '#b8432f'; ctx.fillRect(-40, -20, 80, 40); }
    ctx.restore();
  }
  ctx.restore();
}
function tornado(x, y, t, alpha) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.scale(VS * 1.9, VS * 1.9); x = 0; y = 0;
  for (let k = 0; k < 22; k++) {
    const yy = y - k * 34, r = 40 + k * 16, w = Math.sin(t * 3 + k * 0.6) * 18;
    ctx.strokeStyle = `rgba(95,105,122,${0.7 + k * 0.02})`; ctx.lineWidth = 18;
    ctx.beginPath(); ctx.ellipse(x + w, yy, r, r * 0.22, 0, t * 6 + k, t * 6 + k + Math.PI * 1.4); ctx.stroke();
  }
  for (let k = 0; k < 6; k++) { const a = t * 5 + k, rr = 120 + k * 20; ctx.fillStyle = k % 2 ? '#8b5e34' : '#5f9e3c'; ctx.fillRect(x + Math.cos(a) * rr, y - 120 - k * 40 + Math.sin(a) * 30, 14, 10); }
  ctx.restore();
}

// ---------------- hiệu ứng nổi ----------------
const fx = [];
const followFlags = [];
let shake = 0, hitWobble = 0, skid = 0, bump = 0, bin = null, pushA = 0, pushBy = null;
const DOZER_KINDS = new Set(['stash', 'fine', 'dog', 'ducks', 'rain']);   // cú đẩy Phá không có "diễn viên" riêng → xe ủi lái tới chạm rồi mới đẩy
function floatText(text, color, x = SX + S(160), y = null, size = 46) { fx.push({ k: 'txt', text, color, x, y: y == null ? contactY(cam) - S(300) : y, t: 0, dur: 1.4, size }); }
function confetti(n = 80, x = W / 2, y = 700) { for (let i = 0; i < n; i++) fx.push({ k: 'conf', x, y, vx: (Math.random() - 0.5) * 900, vy: -300 - Math.random() * 700, c: ['#ffd23a', '#e8322c', '#35d07f', '#2fa4e7', '#ff6fae'][i % 5], t: 0, dur: 2.6, r: Math.random() * 6 }); }
function stepFx(dt) {
  if (depotFire) {
    depotFire.t += dt;
    if (depotFire.result && depotFire.t >= game.cfg.depotFireSec) { const r = depotFire.result; depotFire.result = null; if (game.phase === 'result') showResult(r); }   // cháy xong mới hiện kết quả
  }
  skid = Math.max(0, skid - dt / 1.3); bump = Math.max(0, bump - dt / 0.5);
  for (const f of fx) {
    f.t += dt;
    if (f.k === 'conf') { f.vy += 1200 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.r += dt * 8; }
    if (f.k === 'dust') { f.x -= (game.speed * PX * 0.6 + 40) * dt; f.y -= 30 * dt; }
    if (f.k === 'skid') f.x -= game.speed * PX * dt;
    if (f.k === 'ember') { f.x += f.vx * dt + Math.sin(f.t * 7) * 30 * dt; f.y += f.vy * dt; }
  }
  for (let i = fx.length - 1; i >= 0; i--) if (fx[i].t >= fx[i].dur) fx.splice(i, 1);
  shake = Math.max(0, shake - dt * 30);
  hitWobble = Math.max(0, hitWobble - dt * 2.2);
  if (bin) { bin.t += dt; if (bin.t > bin.dur) bin = null; }
}
function drawFx() {
  for (const f of fx) {
    const p = f.t / f.dur;
    if (f.k === 'txt') {
      ctx.save(); ctx.globalAlpha = 1 - Math.max(0, p - 0.6) / 0.4;
      ctx.font = `800 ${f.size}px 'Be Vietnam Pro'`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(f.text, f.x, f.y - p * 120);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - p * 120); ctx.restore();
    } else if (f.k === 'conf') {
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.r); ctx.fillStyle = f.c; ctx.fillRect(-7, -4, 14, 8); ctx.restore();
    } else if (f.k === 'smoke') {
      const dk = f.dark || 0.45, c = Math.round(60 - dk * 40);
      ctx.fillStyle = `rgba(${c},${c - 4},${c - 6},${dk * (1 - p) * (p < 0.1 ? p * 10 : 1)})`; ctx.beginPath(); ctx.arc(f.x + Math.sin(p * 5 + f.r) * 30 + p * 160, f.y - p * 700, f.r * (1 + p * 2.4), 0, Math.PI * 2); ctx.fill();
    } else if (f.k === 'ember') {
      ctx.fillStyle = `rgba(255,${150 + Math.round(Math.sin(f.t * 20) * 60)},40,${1 - p})`; ctx.beginPath(); ctx.arc(f.x, f.y, 4, 0, Math.PI * 2); ctx.fill();
    } else if (f.k === 'skid') {
      ctx.strokeStyle = `rgba(30,30,30,${0.55 * (1 - p)})`; ctx.lineWidth = S(10); ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - f.len, f.y + Math.sin(f.x) * 4); ctx.stroke();
    } else if (f.k === 'dust') {
      ctx.fillStyle = `rgba(220,210,190,${0.5 * (1 - p)})`; ctx.beginPath(); ctx.arc(f.x, f.y, 10 + p * 22, 0, Math.PI * 2); ctx.fill();
    } else if (f.k === 'trash') {
      // người tặng bay vòng cung vào thùng rác
      const e = ease(p), x = lerp(f.x, f.tx, e), y = lerp(f.y, f.ty, e) - Math.sin(p * Math.PI) * 320;
      ctx.save(); ctx.translate(x, y); ctx.rotate(p * 9); ctx.translate(-x, -y); avatar(x, y, 36, f.user, '#ff5a4f'); ctx.restore();
      if (p < 0.7) { ctx.font = "800 26px 'Be Vietnam Pro'"; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(String(f.user.name).slice(0, 12), x, y - 52); }
    } else if (f.k === 'kick') {
      const x = f.x + p * 700, y = f.y - Math.sin(p * Math.PI) * 360;
      ctx.save(); ctx.translate(x, y); ctx.rotate(p * 12); ctx.translate(-x, -y);
      if (f.what === 'dog') dog(x, y, T); else if (f.what === 'ducks') duck(x, y, T, 0); else banana(x, y, 0);
      ctx.restore();
    } else if (f.k === 'wind') {
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - p)})`; ctx.lineWidth = 6; ctx.lineCap = 'round';
      for (let k = 0; k < 6; k++) { const y = contactY(cam) - S(60) - k * 40, x = SX - S(300) + p * 500 + k * 30; ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + 60, y - 30, x + 120, y + 30, x + 180, y); ctx.stroke(); }
    } else if (f.k === 'can') {
      const y = lerp(contactY(cam) - S(700), contactY(cam) - S(170), ease(Math.min(1, p * 1.6)));
      ctx.save(); ctx.globalAlpha = p > 0.75 ? (1 - p) / 0.25 : 1; ctx.fillStyle = '#e8322c'; rrect(SX - S(30), y - 40, 60, 74, 10); ctx.fill(); ctx.fillStyle = '#ffd23a'; ctx.fillRect(SX - S(10), y - 54, 22, 16);
      ctx.fillStyle = '#fff'; ctx.font = "800 30px 'Be Vietnam Pro'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⛽', SX, y); ctx.restore();
    }
  }
  if (bin) {
    const open = bin.t < 1.2 ? Math.min(1, bin.t * 3) : Math.max(0, 1 - (bin.t - 1.2) * 3);
    const bounce = bin.t > 1 && bin.t < 1.4 ? Math.sin((bin.t - 1) / 0.4 * Math.PI) * 0.12 : 0;
    trashBin(bin.x, contactY(meterAt(bin.x)), open, 1 + bounce);
  }
}
function throwToTrash(user, fromX, fromY) {
  const tx = SX + S(470);
  bin = { x: tx, t: 0, dur: 2.4 };
  fx.push({ k: 'trash', user, x: fromX, y: fromY, tx, ty: contactY(meterAt(tx)) - S(100), t: 0, dur: 1.1 });
}

// ---------------- HUD ----------------
let bannerT = 0, bannerPrio = 0;
function banner(html, cls = '', ms = 2200, prio = 1) {
  const now = performance.now();
  if (now < bannerT && prio < bannerPrio) return;
  bannerT = now + ms; bannerPrio = prio;
  $('banner').innerHTML = `<div class="b ${cls}">${html}</div>`;
}
const avHtml = u => (u && u.avatar ? `<img class="av" src="${esc(u.avatar)}" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'av',textContent:'${esc(String((u && u.name) || '?').charAt(0).toUpperCase())}'}))">` : `<span class="av">${esc(String((u && u.name) || '?').trim().charAt(0).toUpperCase() || '?')}</span>`);
function toast(side, u, text) {
  const feed = $('feed');
  const el = document.createElement('div');
  el.className = `toast ${side || ''}`;
  el.innerHTML = `${avHtml(u)}<span class="nm">${esc(u && u.name)}</span><span class="x">${text}</span>`;
  feed.prepend(el);
  while (feed.children.length > 4) feed.lastChild.remove();
  setTimeout(() => el.remove(), 3400);
}

let giftSheet = [];
async function loadGiftSheet() { try { const r = await fetch('/api/gifts'); if (r.ok) giftSheet = await r.json(); } catch (e) { /* không có cũng được */ } buildLegend(); }
function giftImage(g) {
  if (g.giftImage) return g.giftImage;
  const s = giftSheet.find(x => String(x.id) === String(g.giftId)) || giftSheet.find(x => (x.name || '').toLowerCase() === String(g.giftName || '').toLowerCase());
  return s ? s.image : '';
}
function buildLegend() {
  const show = VIEW.showLegend && game.phase === 'race';
  $('lgl').classList.toggle('hidden', !show); $('lgr').classList.toggle('hidden', !show);
  for (const side of ['cuu', 'pha']) {
    const rows = [];
    for (const a of ACTIONS.filter(x => x.side === side)) {
      const list = VIEW.giftMap[a.id] || [];
      if (!list.length) continue;
      const im = giftImage(list[0]);
      rows.push(`<div class="lg">${im ? `<img src="${esc(im)}" referrerpolicy="no-referrer">` : `<span class="e">${a.emoji}</span>`}<span>${esc(a.label)}</span></div>`);
    }
    if (!rows.length) for (const a of ACTIONS.filter(x => x.side === side)) rows.push(`<div class="lg"><span class="e">${a.emoji}</span><span>${esc(a.label)}</span></div>`);
    $(side === 'cuu' ? 'lgcuu' : 'lgpha').innerHTML = rows.join('');
  }
}

let hudT = 0;
function updateHud(dt) {
  hudT += dt;
  if (hudT < 0.1) return;
  hudT = 0;
  const gl = game.cfg.goal, p = game.progress;
  const sec = Math.ceil(game.phase === 'lobby' ? game.cfg.roundSec : game.timeLeft);
  $('timer').textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  $('timer').classList.toggle('final', game.final);
  $('round').textContent = `Ván ${Math.max(1, game.round + (game.phase === 'lobby' ? 1 : 0))}`;
  $('tfill').style.width = `${p * 100}%`;
  $('tbike').style.left = `${p * 100}%`;
  const km = m => (m / 1000).toFixed(m >= 10000 ? 1 : 2).replace('.', ',');
  const depot = gl * game.cfg.backFloor;
  $('dist').innerHTML = game.dist >= 0 ? `<b>${km(game.dist)}</b>/${km(gl).replace(/,00$/, '')} km`
    : `<b style="color:var(--persimmon-hi)">lùi ${km(-game.dist)} km</b>, cách bến xe ${km(Math.max(0, depot + game.dist))} km`;
  { const pi = provIdx(Math.max(0, game.dist)), pv = ROUTE[pi], pt = partAt(Math.max(0, game.dist), game.cfg.goal).part; $('prov').innerHTML = `<b>${esc(pv.name)}</b>${pv.icon} ${esc(pt.name !== pv.name ? `${pt.name} · ${pt.sign}` : pt.sign)}<em>${pi + 1}/${NP}</em>`; }
  const kmh = game.phase === 'race' ? Math.round(vel * 3.6) : 0;
  $('speed').textContent = kmh < -5 ? `◀ ${Math.min(999, -kmh)}` : String(Math.min(999, Math.max(0, kmh)));
  $('cspeed').classList.toggle('back', kmh < -5);
  $('cspeed').classList.toggle('fast', kmh > 140);
  const track = $('track');
  if (track.dataset.goal !== String(gl)) {
    track.dataset.goal = String(gl);
    track.querySelectorAll('.flag').forEach(e => e.remove());
    for (let m = game.cfg.flagEvery; m < gl; m += game.cfg.flagEvery) { const f = document.createElement('i'); f.className = 'flag'; f.style.left = `${(m / gl) * 100}%`; track.appendChild(f); }
  }
  const tc = game.totals.cuu, tp = game.totals.pha, share = clamp(tc + tp > 0 ? tc / (tc + tp) : 0.5, 0.2, 0.8);   // chừa chỗ đọc số phe yếu
  $('tcuu').style.width = `${share * 100}%`; $('tknot').style.left = `${share * 100}%`;
  const topC = [...game.users.values()].filter(u => u.cuu > 0).sort((a, b) => b.cuu - a.cuu)[0];
  const topP = [...game.users.values()].filter(u => u.pha > 0).sort((a, b) => b.pha - a.pha)[0];
  $('tl').innerHTML = `${topC ? avHtml(topC) : ''}Cứu <b>${fmt(tc)}</b>`;
  $('tr').innerHTML = `<b>${fmt(tp)}</b> Phá${topP ? avHtml(topP) : ''}`;
  $('tsl').innerHTML = topC ? `Ân nhân <b>${esc(topC.name)}</b>` : 'Bình luận <b>1</b> để lên xe';
  $('tsr').innerHTML = topP ? `Kẻ phá <b>${esc(topP.name)}</b>` : 'Bình luận <b>2</b> để vào phe Phá';
  $('fuel').style.width = `${game.fuel}%`;
  $('cfuel').classList.toggle('low', game.fuel < 20 && game.phase === 'race');
  $('cshield').classList.toggle('hidden', game.shield <= 0);
  $('shield').textContent = `${fmt(game.shield)}m`;
  $('cram').textContent = game.ramCd > 0 ? `💥 Húc sau ${Math.ceil(game.ramCd)}s` : '💥 Húc';
  $('cram').classList.toggle('ready', game.ramCd <= 0 && game.phase === 'race');
  const dv = game.driver, q = game.driverQueue.length, more = game.drivers.filter((x, i) => i > 0 && x).length;
  $('driver').textContent = (dv ? `${dv.name} ${dv.free ? 'giữ lái' : fmtClock(dv.left)}` : VIEW.streamerName) + (more ? ` +${more} xe` : '') + (q ? `, ${q} người chờ` : '');
  const px = game.passengers();
  $('pax').textContent = fmt(px.total + game.drivers.filter(Boolean).length);
  $('cpax').classList.toggle('hidden', VIEW.vehicle === 'scooter');
  // khung cứu nạn
  const rs = $('rescue');
  if (game.finish && game.phase === 'race') {   // 🏁 tới cổng làng: đếm ngược, phe Phá còn đẩy lùi được
    const fl = game.finish.left, tot = game.cfg.finishSec || 15;
    rs.classList.remove('hidden');
    $('rtxt').innerHTML = '🏁 <b>VỀ TỚI CỔNG LÀNG!</b><br><small style="font-size:24px;font-weight:700;color:#cfd9ea">Giữ thêm chút nữa là thắng · phe Phá còn đẩy lùi được!</small>';
    $('rsec').textContent = `${Math.max(0, Math.ceil(fl))}s`;
    $('rbar').style.width = `${clamp(1 - fl / tot, 0, 1) * 100}%`;
  } else if (game.rescue) {
    const r = game.rescue;
    rs.classList.remove('hidden');
    $('rtxt').innerHTML = `🌪️ Lốc xoáy của <b>${esc(r.user.name)}</b>!<br>Phe Cứu gom <b>${fmt(r.need)} xu</b> để thoát`;
    $('rsec').textContent = `${Math.max(0, Math.ceil(r.left))}s · ${fmt(r.got)}/${fmt(r.need)}`;
    $('rbar').style.width = `${clamp(r.got / r.need, 0, 1) * 100}%`;
  } else if (game.halt) {
    const h = game.halt, tx = h.kind === 'police' ? policeTxt(h) : (HALT_TXT[h.kind] || { icon: '⏸', title: 'Dừng xe', sub: '' });
    rs.classList.remove('hidden');
    $('rtxt').innerHTML = `${tx.icon} <b>${tx.title}</b><br><small style="font-size:24px;font-weight:700;color:#cfd9ea">${tx.sub}</small>`;
    if (h.need) { $('rsec').textContent = `❤️ ${fmt(h.got)}/${fmt(h.need)}`; $('rbar').style.width = `${clamp(h.got / h.need, 0, 1) * 100}%`; }
    else { const tot = h.kind === 'rest' ? game.cfg.restSec : h.kind === 'gas' ? game.cfg.gasSec : Math.max(h.left + h.t, 1); $('rsec').textContent = `${Math.max(0, Math.ceil(h.left))}s`; $('rbar').style.width = `${clamp(h.t / tot, 0, 1) * 100}%`; }
  } else if (game.fuelAlarm) {
    rs.classList.remove('hidden');
    $('rtxt').innerHTML = '⛽ HẾT XĂNG! Tặng quà Cứu / chia sẻ để đổ xăng';
    $('rsec').textContent = `${Math.max(0, Math.ceil(game.fuelAlarm.left))}s`;
    $('rbar').style.width = `${(1 - game.fuelAlarm.left / game.cfg.rescueSec) * 100}%`;
  } else rs.classList.add('hidden');
  $('feed').classList.toggle('hidden', !rs.classList.contains('hidden') || game.phase !== 'race');
  // màn chờ
  const lob = $('lobby');
  if (game.phase === 'lobby') {
    lob.classList.remove('hidden');
    const left = Math.max(0, Math.ceil(game.cfg.lobbySec - game.phaseT));
    const st = loadStats();
    const fame = Object.values(st.fame || {}).sort((a, b) => b.cuu - a.cuu).slice(0, 3);
    lob.innerHTML = `<h1>🛵 ĐƯỜNG VỀ QUÊ</h1><h2>Ván ${game.round + 1} xuất phát sau</h2><div class="cd">${left}</div>
      <div class="how">🧧 Đưa cả đoàn cùng <b class="y">${esc(VIEW.streamerName)}</b> về quê ăn Tết trong <b class="y">${Math.round(game.cfg.roundSec / 60 * 10) / 10} phút</b>!<br>
      🗺️ <b class="y">Mũi Cà Mau → Cột cờ Lũng Cú</b>, qua ${NP} tỉnh<br>
      🍜 Trạm dừng chân, ⛽ trạm xăng, 🚓 CSGT dọc đường<br>
      🧑‍✈️ Quà <b class="y">tài xế</b>: lên lái ${fmtClock(game.cfg.driverSec)} · bình luận <b class="g">1</b> là lên xe<br>
      🛡️ Quà <b class="g">CỨU</b>: đẩy xe tới, đổ xăng, che chắn<br>⚔️ Quà <b class="r">PHÁ</b>: vật cản, đẩy lùi về <b class="r">bến xe</b> là thắng<br>
      💬 Bình luận <b class="g">1</b> vào phe Cứu · <b class="r">2</b> vào phe Phá<br>🔥 ${game.cfg.finalSec} giây cuối mọi quà <b class="y">×${game.cfg.finalMult}</b></div>
      <div class="stat">📍 Tổng đã chạy ${(st.km || 0).toFixed(1).replace('.', ',')} km · 🛡️ Cứu thắng ${st.wins?.cuu || 0} · ⚔️ Phá thắng ${st.wins?.pha || 0}</div>
      ${fame.length ? `<div class="stat">🦸 Ân nhân tuần: ${fame.map(f => `<b style="color:#5ef09b">${esc(f.name)}</b>`).join(' · ')}</div>` : ''}`;
  } else lob.classList.add('hidden');
}

function showResult(r) {
  const el = $('result');
  const win = r.winner === 'cuu';
  const row = (u, i) => `<div class="pr">${['🥇', '🥈', '🥉'][i]} ${avHtml(u)}<span class="nm">${esc(u.name)}</span><span class="xu">${fmt(u.coins)}</span></div>`;
  const topPha = r.topPha[0], topCuu = r.topCuu[0];
  const pen = VIEW.penalties[Math.floor(Math.random() * VIEW.penalties.length)] || '';
  el.className = `card ${win ? 'win' : 'lose'}${r.reason === 'depot' ? ' depot' : ''}`;
  $('banner').innerHTML = ''; bannerT = 0;
  el.innerHTML = `<h1>${win ? '🎉 VỀ TỚI QUÊ!' : r.reason === 'depot' ? '🚏 BỊ ĐẨY VỀ BẾN XE!' : '😭 KẸT GIỮA ĐƯỜNG'}</h1>
    <h2>${win ? `Phe 🛡️ CỨU thắng · ${fmt(r.timeUsed)} giây` : r.reason === 'depot' ? `Phe ⚔️ PHÁ thắng · ${fmt(r.timeUsed)} giây` : `Phe ⚔️ PHÁ thắng · còn ${dtx(r.goal - r.dist)}`}</h2>
    <div class="cols"><div class="col cuu"><h3>🦸 Ân nhân</h3>${r.topCuu.map(row).join('') || '<div class="pr">—</div>'}</div>
    <div class="col pha"><h3>😈 Kẻ phá</h3>${r.topPha.map(row).join('') || '<div class="pr">—</div>'}</div></div>
    ${win && r.reason === 'home' ? `<div class="stat">🚩 Đã tới Cột cờ Lũng Cú, qua đủ ${NP} tỉnh</div>` : ''}
    ${win ? (topPha ? `<div class="note trash">🗑️ <b>${esc(topPha.name)}</b> bị ném vào thùng rác!</div>` : '<div class="note trash">🧧 Cả nhà đón ở cổng làng!</div>')
          : `<div class="note trash">🗑️ <b>${esc(VIEW.streamerName)}</b> bị ném vào thùng rác!</div>${topPha ? `<div class="note pen">👑 <b>${esc(topPha.name)}</b> chọn hình phạt: ${esc(pen)}</div>` : ''}`}
    ${r.betrayers.length ? `<div class="stat">🐍 Phản bội: ${r.betrayers.map(b => esc(b.name)).join(', ')}</div>` : ''}
    ${win && topCuu ? '' : ''}`;
  el.classList.remove('hidden');
  if (win && topPha) setTimeout(() => throwToTrash(topPha, SX + S(200), contactY(cam) - S(260)), 600);
}

// ---------------- lưu số liệu (theo tuần) ----------------
function weekKey() { const d = new Date(); const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return `${t.getUTCFullYear()}-W${Math.ceil(((t - y0) / 864e5 + 1) / 7)}`; }
function loadStats() { try { const s = JSON.parse(localStorage.getItem('dvq_stats_v1') || '{}'); if (s.week !== weekKey()) { s.week = weekKey(); s.fame = {}; } return s; } catch (e) { return {}; } }
function saveStats(r) {
  try {
    const s = loadStats();
    s.km = (s.km || 0) + r.dist / 1000; s.rounds = (s.rounds || 0) + 1;
    s.wins = s.wins || { cuu: 0, pha: 0 }; s.wins[r.winner] = (s.wins[r.winner] || 0) + 1;
    s.fame = s.fame || {};
    for (const u of game.users.values()) {
      if (!u.cuu && !u.pha) continue;
      const f = s.fame[u.id] || (s.fame[u.id] = { name: u.name, avatar: u.avatar, cuu: 0, pha: 0 });
      f.name = u.name; f.cuu += u.cuu; f.pha += u.pha;
    }
    const ids = Object.keys(s.fame); if (ids.length > 300) ids.sort((a, b) => (s.fame[a].cuu + s.fame[a].pha) - (s.fame[b].cuu + s.fame[b].pha)).slice(0, ids.length - 300).forEach(k => delete s.fame[k]);
    localStorage.setItem('dvq_stats_v1', JSON.stringify(s));
  } catch (e) { /* trình duyệt chặn lưu → bỏ qua */ }
}

// ---------------- âm thanh (tổng hợp, không cần file) ----------------
let AC = null;
function tone(f, d = 0.15, type = 'square', vol = 0.06, slide = 0) {
  if (!VIEW.sound) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d + 0.02);
  } catch (e) { /* không có âm thanh */ }
}
const SFX = {
  honk: () => { tone(520, 0.12); setTimeout(() => tone(440, 0.16), 130); },
  jump: () => tone(380, 0.18, 'sine', 0.08, 500),
  hit: () => tone(140, 0.25, 'sawtooth', 0.08, -80),
  good: () => { tone(660, 0.1, 'triangle', 0.08); setTimeout(() => tone(990, 0.14, 'triangle', 0.08), 90); },
  alarm: () => tone(880, 0.12, 'square', 0.05),
  win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'triangle', 0.09), i * 140)),
  lose: () => [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.28, 'sawtooth', 0.06), i * 200)),
  spooky: () => { tone(440, 0.9, 'sine', 0.07, -260); setTimeout(() => tone(466, 0.9, 'sine', 0.05, -280), 180); },
  drum: () => [0, 160, 320, 400].forEach(d => setTimeout(() => tone(110, 0.12, 'triangle', 0.12, -40), d)),
  dance: () => [392, 392, 587, 523, 466, 440, 392].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'square', 0.05), i * 170)),
  chomp: () => { tone(90, 0.12, 'sawtooth', 0.1, -30); setTimeout(() => tone(70, 0.16, 'sawtooth', 0.1, -20), 140); },
  boom: () => [0, 260, 520].forEach(d => setTimeout(() => { tone(180, 0.35, 'sawtooth', 0.06, -140); tone(1200, 0.25, 'triangle', 0.03, 600); }, d)),
};

// ---------------- sự kiện luật → hình / chữ ----------------
const SIDE_COLOR = { cuu: '#5ef09b', pha: '#ff7a70' };
function onEvents(list) {
  for (const e of list) {
    switch (e.type) {
      case 'action': {
        if (e.side === 'pha') pushBy = e.user;
        const a = ACTION_BY_ID[e.action];
        toast(e.side, e.user, `${a.emoji} ${a.label}${e.count > 1 ? ` ×${e.count}` : ''}${e.final ? ' 🔥×2' : ''}`);
        if (e.action === 'wind') fx.push({ k: 'wind', t: 0, dur: 0.9 });
        if (e.action === 'fuel') { fx.push({ k: 'can', t: 0, dur: 1.2 }); floatText('+⛽', '#ffe27a', SX, contactY(cam) - S(330)); }
        if (e.action === 'helmet') { floatText(`⛑️ +${dtx(e.meters)}`, '#ffe27a'); SFX.good(); }
        if (['dog', 'ducks', 'rain', 'container', 'crow', 'snake', 'ghost', 'croc', 'possess', 'coffin', 'zombie'].includes(e.action)) floatText(`-${dtx(e.meters)}`, SIDE_COLOR.pha, SX + S(200), contactY(cam) - S(300), 52);
        if (['nitro', 'convoy', 'tow', 'wind', 'heli', 'creditor', 'superman'].includes(e.action)) floatText(`+${dtx(e.meters)}`, SIDE_COLOR.cuu, SX + S(60), contactY(cam) - S(260));
        if (['ghost', 'possess', 'coffin', 'zombie'].includes(e.action)) { banner(`${a.emoji} ${esc(a.label).toUpperCase()}!<small>của <b>${esc(e.user.name)}</b> · phe Cứu tặng quà TRỪ TÀ để xua</small>`, 'pha', 2400, 2); SFX.spooky(); shake = Math.max(shake, 8); }
        if (e.action === 'coffin') SFX.dance();
        if (e.action === 'lion' || e.action === 'buffalo') SFX.drum();
        if (e.action === 'fireworks') { SFX.boom(); banner(`🎆 PHÁO HOA TẾT!<small>của <b>${esc(e.user.name)}</b> · xua sạch xui xẻo</small>`, 'gold', 2200, 2); }
        if (e.action === 'superman') banner(`🦸 SIÊU NHÂN VÁC CẢ ĐOÀN XE!<small>của <b>${esc(e.user.name)}</b></small>`, 'cuu', 2600, 3);
        if (e.action === 'heli' || e.action === 'tornado' || e.action === 'container') banner(`${a.emoji} ${esc(a.label)} của <b>${esc(e.user.name)}</b>!`, e.side, 2400, 2);
        if (e.side === 'cuu' && e.action !== 'helmet') SFX.good();
        break;
      }
      case 'pending': toast(e.side, e.user, `${ACTION_BY_ID[e.action].emoji} ⏳ chờ ván mới`); break;
      case 'hit': hitWobble = 1; shake = Math.max(shake, e.kind === 'pothole' ? 10 : 6); if (e.kind === 'banana') { skid = 1; floatText('Trượt vỏ chuối!', '#ffd23a', SX + S(140), contactY(cam) - S(330), 40); } else if (e.kind === 'pothole') bump = 1; floatText(`-${dtx(e.meters)}`, SIDE_COLOR.pha); SFX.hit(); break;
      case 'dodge': floatText('NÉ ĐẸP!', '#7cf0a9', SX, contactY(cam) - S(320)); SFX.good(); break;
      case 'snatch': if (e.victim) { banner(`🐊 CÁ SẤU ĐỚP <b>${esc(e.victim.name)}</b>!<small>bơi về sau ${game.cfg.crocSec || 12} giây · HÚC hoặc TRỪ TÀ để cứu ngay</small>`, 'pha', 2600, 3); shake = 12; } SFX.chomp(); break;
      case 'victimBack': toast('cuu', e.victim, e.how === 'swim' ? '🏊 bơi về kịp xe!' : e.how === 'ram' ? '💥 được HÚC cứu lên xe!' : '✨ được trừ tà cứu lên xe!'); SFX.good(); break;
      case 'debt': banner(`💸 <b>${esc(e.user.name)}</b> RƯỢT ĐÒI NỢ!<small>${e.debtor ? `con nợ: <b>${esc(e.debtor.name)}</b> 😱` : 'cả xe bỏ chạy'}</small>`, 'cuu', 2200, 2); SFX.honk(); break;
      case 'finishStart': banner(`🏁 VỀ TỚI CỔNG LÀNG!<small>Đếm ngược ${e.sec} giây · phe Phá đẩy lùi được thì chạy tiếp</small>`, 'gold', 2600, 4); SFX.honk(); break;
      case 'finishCancel': banner(`😱 BỊ ĐẨY KHỎI CỔNG LÀNG!<small>lùi ${dtx(e.meters)} · chạy tiếp!</small>`, 'pha', 2400, 4); SFX.lose(); shake = 14; break;
      case 'possessed': floatText('👹 Quỷ giữ tay lái!', '#ff6a5a', SX + S(60), contactY(cam) - S(360), 40); break;
      case 'exorcise': {
        const kinds = [...new Set(e.list.map(h => ACTION_BY_ID[h.kind] ? ACTION_BY_ID[h.kind].emoji : FUN_TXT[h.kind] || h.kind))].join(' ');
        banner(`✨ TRỪ TÀ! ${kinds}<small><b>${esc(e.by.name)}</b> xoá ${dtx(e.saved)} đẩy lùi${e.list.some(h => h.done) ? ' · tà ma chạy mất dép' : ''}</small>`, 'cuu', 2400, 3);
        floatText(`✨ +${dtx(e.saved)}`, '#ffe27a', SX + S(160), contactY(cam) - S(360), 54);
        for (let i = 0; i < 26; i++) fx.push({ k: 'conf', x: SX + S(320), y: contactY(cam) - S(200), vx: (Math.random() - 0.5) * 800, vy: -300 - Math.random() * 600, c: i % 2 ? '#ffe27a' : '#fff6c8', t: 0, dur: 1.6, r: 0 });
        const loser = e.list.find(h => h.done && h.user && h.user.id !== 'road');
        if (loser) throwToTrash(loser.user, SX + S(300), contactY(cam) - S(200));   // kẻ phá thua → vào thùng rác
        SFX.good();
        break;
      }
      case 'jump': SFX.jump(); break;
      case 'ram': SFX.honk(); break;
      case 'ramCd': break;
      case 'ramHit': {
        shake = 14;
        floatText(`💥 HÚC! +${dtx(e.saved)}`, '#ffe27a', SX + S(120), contactY(cam) - S(340), 56);
        if (e.kind !== 'container') fx.push({ k: 'kick', what: e.kind, x: SX + S(140), y: contactY(cam), t: 0, dur: 1.2 });
        throwToTrash(e.user, SX + S(200), contactY(cam) - S(200));
        banner(`💥 HÚC bay <b>${esc(e.user.name)}</b> vào thùng rác!`, 'gold', 1800, 2);
        break;
      }
      case 'shieldBlock': floatText(`⛑️ CHẶN ${dtx(e.meters)}`, '#ffe27a', SX, contactY(cam) - S(360)); break;
      case 'bounce': floatText('⛑️ BẬT LẠI!', '#ffe27a', SX + S(200), contactY(cam) - S(380), 56); shake = 10; break;
      case 'betray': banner(`🐍 <b>${esc(e.user.name)}</b> PHẢN BỘI!<small>từ phe Cứu quay sang Phá</small>`, 'pha', 2600, 3); break;
      case 'rescueStart': banner(`🌪️ LỐC XOÁY!<small>Phe Cứu có ${e.sec} giây gom ${fmt(e.need)} xu</small>`, 'pha', 2000, 3); SFX.alarm(); break;
      case 'rescued': banner(`🦸 CỨU THÀNH CÔNG!<small>${e.heroes.slice(0, 3).map(h => esc(h.name)).join(' · ')}</small>`, 'cuu', 2600, 3); confetti(60, SX, contactY(cam) - S(300)); SFX.win(); break;
      case 'rescueFail': banner(`🌪️ Bị hất lùi ${dtx(e.meters)}!`, 'pha', 2200, 3); shake = 18; SFX.lose(); break;
      case 'fuelOut': banner('⛽ HẾT XĂNG!<small>Tặng quà Cứu / chia sẻ để đổ xăng</small>', 'pha', 2200, 2); SFX.alarm(); break;
      case 'refueled': floatText('⛽ CÓ XĂNG!', '#7cf0a9'); break;
      case 'walking': banner('🚶 Dắt bộ…<small>chờ phe Cứu đổ xăng</small>', '', 2000, 1); break;
      case 'final': banner(`🔥 NƯỚC RÚT ×${e.mult}!<small>${e.sec} giây cuối mọi quà nhân đôi</small>`, 'gold', 2600, 3); SFX.alarm(); break;
      case 'flag': floatText(`🚩 ${dtx(e.meters)}`, '#ffe27a', SX + S(160), contactY(cam) - S(300), 50); break;
      case 'roundStart': depotFire = null; $('result').classList.add('hidden'); banner(`🏁 VÁN ${e.round} XUẤT PHÁT!<small>Mũi Cà Mau → Lũng Cú · ${NP} tỉnh · 100 km/h</small>`, 'gold', 2000, 3); SFX.honk(); followFlags.length = 0; break;
      case 'roundEnd': saveStats(e);
        if (e.reason === 'depot') { depotFire = { t: 0, result: e }; banner('🔥 BẾN XE CÀ MAU BỐC CHÁY!<small>Bị đẩy về tận bến, phe Phá thắng</small>', 'pha', 4200, 4); shake = 16; }
        else showResult(e);
        if (e.winner === 'cuu') { confetti(160); SFX.win(); } else SFX.lose(); break;
      case 'lobby': $('result').classList.add('hidden'); break;
      case 'join': toast(e.side, e.user, e.side === 'cuu' ? '🛡️ vào phe Cứu · lên xe' : '⚔️ vào phe Phá'); break;
      case 'halt': { const tx = e.kind === 'police' ? policeTxt(e) : HALT_TXT[e.kind]; if (tx) banner(`${tx.icon} ${tx.title.toUpperCase()}${e.need ? `<small>Thả ${fmt(e.need)} tim để đi tiếp</small>` : `<small>Dừng ${Math.round(e.sec)} giây · đồng hồ ván tạm dừng</small>`}`, e.kind === 'police' || e.kind === 'flat' ? 'pha' : 'gold', 2600, 3); if (e.kind === 'police') SFX.alarm(); break; }
      case 'haltEnd': { const who = e.helpers && e.helpers[0]; banner(`🚌 XUẤT PHÁT TIẾP!${who ? `<small>❤️ Cảm ơn ${esc(who.name)} đã thả tim</small>` : e.how === 'timeout' && e.kind === 'police' ? '<small>🧾 Nộp phạt rồi đi tiếp</small>' : ''}`, 'cuu', 2000, 2); SFX.honk(); break; }
      case 'stash': banner(`📦 QUÀ DỒN LÚC DỪNG<small>🛡️ +${dtx(e.cuu)} · ⚔️ −${dtx(e.pha)} → ${e.net >= 0 ? 'tiến' : 'lùi'} ${dtx(Math.abs(e.net))}</small>`, e.net >= 0 ? 'cuu' : 'pha', 2600, 3); break;
      case 'fine': pushBy = { name: 'CSGT', id: 'csgt' }; banner(`🧾 NỘP PHẠT!<small>Chưa đủ tim — lùi ${dtx(e.meters)}</small>`, 'pha', 2400, 3); SFX.lose(); break;
      case 'deferred': toast(e.side, e.user, `${ACTION_BY_ID[e.action].emoji} ⏳ chạy khi xe đi`); break;
      case 'roadEvent': if (e.kind === 'jam') banner(`🚗 KẸT XE CỬA NGÕ ${esc(ROUTE[provIdx(game.dist)].name.toUpperCase())}!<small>Chạy chậm 10 giây</small>`, 'pha', 2200, 2); else if (e.kind === 'lixi') { banner('🧧 HỌ HÀNG LÌ XÌ!<small>+30% xăng · đẩy tới</small>', 'cuu', 2200, 2); for (let i = 0; i < 40; i++) fx.push({ k: 'conf', x: SX, y: contactY(cam) - 300, vx: (Math.random() - 0.5) * 700, vy: -400 - Math.random() * 500, c: i % 3 ? '#e8322c' : '#ffd23a', t: 0, dur: 2, r: 0 }); SFX.good(); } break;
      case 'driver': banner(`🧑‍✈️ <b>${esc(e.user.name)}</b> LÊN LÀM TÀI XẾ${e.car ? ` XE ${e.car + 1}` : ''}!<small>lái ${fmtClock(e.sec)}${e.prev ? ` · thay ${esc(e.prev.name)}` : ''}</small>`, 'cuu', 2600, 3); SFX.honk(); break;
      case 'driverQueued': toast('cuu', e.user, `🧑‍✈️ chờ lái · thứ ${e.pos}`); break;
      case 'driverExtend': toast('cuu', e.user, `🧑‍✈️ lái thêm · còn ${fmtClock(e.left)}`); break;
      case 'driverHold': toast('cuu', e.user, '🧑‍✈️ hết giờ · vẫn giữ lái'); break;
      case 'likeBurst': if (game.phase === 'race' && !game.halt) { fx.push({ k: 'wind', t: 0, dur: 0.7 }); floatText('❤️ +gió', '#ff8fb5', SX - S(80), contactY(cam) - S(250), 36); } break;
      case 'share': toast('cuu', e.user, '↗️ chia sẻ · +⛽'); break;
      case 'follow': toast('cuu', e.user, '➕ follow · cắm cờ'); followFlags.push({ m: game.dist + 14 + Math.random() * 6, user: e.user }); if (followFlags.length > 30) followFlags.shift(); break;
      default: break;
    }
  }
}

// ---------------- vẽ một khung ----------------
// ---------------- điểm dừng trên lộ trình (logic: game.plan / game.halt) ----------------
const HALT_TXT = {
  rest:    { icon: '🍜', title: 'Trạm dừng chân', sub: 'Cả đoàn xuống ăn uống, nghỉ ngơi · đồng hồ ván tạm dừng' },
  gas:     { icon: '⛽', title: 'Trạm xăng', sub: 'Đổ đầy bình · ai cần đi vệ sinh thì xuống · đồng hồ tạm dừng' },
  police:  { icon: '🚓', title: 'CSGT kiểm tra hành chính!', sub: 'Thả tim để xuất trình giấy tờ · quà Cứu: 1 xu = 10 tim · quá giờ nộp phạt lùi 150 m' },
  flat:    { icon: '🛞', title: 'Thủng lốp!', sub: 'Thả tim để bơm lốp · quà Cứu: 1 xu = 10 tim' },
  train:   { icon: '🚂', title: 'Chắn tàu', sub: 'Dừng chờ tàu Thống Nhất chạy qua · đồng hồ tạm dừng' },
  cows:    { icon: '🐄', title: 'Đàn bò qua đường', sub: 'Chờ bà con lùa bò qua' },
  carsick: { icon: '🤢', title: 'Có người say xe', sub: 'Dừng hóng gió, uống miếng nước' },
  photo:   { icon: '📸', title: 'Dừng check-in', sub: 'Chụp tấm hình kỷ niệm rồi đi tiếp' },
};
function policeTxt(h) {
  if (h.reason === 'speed') return { icon: '🚓', title: `Chạy quá tốc độ ${h.kmh ? h.kmh + ' km/h' : ''}!`, sub: 'CSGT bắn tốc độ · thả tim nộp phạt · quà Cứu: 1 xu = 10 tim' };
  if (h.reason === 'overload') return { icon: '🚓', title: `Chở quá số người${h.over ? ' (' + h.over + ' người)' : ''}!`, sub: 'Ngồi trên nóc xe là sai luật · thả tim nộp phạt · quà Cứu: 1 xu = 10 tim' };
  return HALT_TXT.police;
}
// ---- 🍜 trạm dừng chân: ai từng thả tim / tặng quà (game.crowd) xuống sân trạm đứng tám chuyện, vài người đi dạo ----
const TET_TALK = ['Có người yêu chưa? 😏', 'Thưởng Tết nhiều hông?', 'Lương nhiêu rồi?', 'Quê ở đâu dzậy?', 'Bao giờ cưới? 💍', 'Mập lên rồi nha 😂',
  'Lâu quá mới gặp!', 'Về quê ở mấy ngày?', 'Lì xì đi chứ! 🧧', 'Phở trạm này ngon!', 'Đi vệ sinh cái đã…', 'Selfie cái nào 📸',
  'Còn xa không tài xế?', 'Nhà có nuôi chó không?', 'Mua quà cho ngoại chưa?', 'Say xe quá trời…', 'Ăn bánh chưng chưa?', 'Ai thả tim nhiều vậy?'];
const LOCALS = ['Cô bán bánh mì', 'Chú xe ôm', 'Bà bán nước', 'Anh bảo vệ', 'Chị bán vé số', 'Ông bán kẹo kéo', 'Bé bán bong bóng', 'Dì bán bắp'];
function plasticTable(x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, -150); ctx.stroke();
  ctx.fillStyle = '#e8322c'; ctx.beginPath(); ctx.moveTo(-90, -130); ctx.quadraticCurveTo(0, -200, 90, -130); ctx.closePath(); ctx.fill();   // dù quán
  ctx.fillStyle = '#fff'; for (let k = -2; k <= 2; k += 2) { ctx.beginPath(); ctx.moveTo(k * 22 - 8, -135); ctx.lineTo(k * 22, -175); ctx.lineTo(k * 22 + 8, -135); ctx.fill(); }
  ctx.fillStyle = '#2f7de2'; ctx.fillRect(-46, -52, 92, 10); ctx.fillRect(-40, -44, 8, 44); ctx.fillRect(32, -44, 8, 44);   // bàn nhựa xanh
  ctx.fillStyle = '#e8322c'; for (const dx of [-70, 70]) { ctx.fillRect(dx - 14, -26, 28, 6); ctx.fillRect(dx - 12, -20, 4, 20); ctx.fillRect(dx + 8, -20, 4, 20); }   // ghế đỏ
  ctx.fillStyle = '#fff6d6'; ctx.beginPath(); ctx.ellipse(-14, -58, 12, 5, 0, 0, Math.PI * 2); ctx.ellipse(16, -58, 12, 5, 0, 0, Math.PI * 2); ctx.fill();   // tô phở
  ctx.restore();
}
function drawRestCrowd(h) {
  const people = game.crowd(game.cfg.crowdMax || 100);
  for (let i = 0; people.length < 40; i++) people.push({ id: `npc${i}`, name: LOCALS[i % LOCALS.length], avatar: '', npc: true });   // ít người xem thì dân quanh trạm cho đủ đông
  const fade = clamp(Math.min(h.t / 1.2, (h.left || 0) / 1.2), 0, 1);
  const y0 = contactY(cam) + 36, hh = 400;
  ctx.save(); ctx.globalAlpha = fade;
  ctx.fillStyle = '#e9dcc0'; ctx.fillRect(0, y0, W, hh);   // sân trạm lát gạch
  ctx.strokeStyle = 'rgba(150,120,80,.25)'; ctx.lineWidth = 2;
  for (let yy = y0 + 40; yy < y0 + hh; yy += 40) { ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke(); }
  for (let k = 0; k < 4; k++) plasticTable(130 + k * 270 + (k % 2) * 40, y0 + 120 + (k % 2) * 170, 0.62);
  const n = people.length, G = Math.ceil(n / 4), gx = Math.min(7, Math.max(3, Math.ceil(Math.sqrt(G * 2.4)))), rows = Math.ceil(G / gx);
  const dots = [];
  people.forEach((u, i) => {
    const gi = Math.floor(i / 4), j = i % 4, r = hash(gi, 70);
    const cx = 70 + (gi % gx + 0.5) * (W - 140) / gx + (r - 0.5) * 50;
    const cyg = y0 + 70 + (Math.floor(gi / gx) + 0.5) * (hh - 90) / rows;
    const a = j / 4 * Math.PI * 2 + r * 6;
    let x = cx + Math.cos(a) * 44, y = cyg + Math.sin(a) * 14;
    const wander = hash(i, 71) < 0.18;   // vài người đi dạo qua lại
    if (wander) x += Math.sin(T * 0.4 + i) * 110;
    dots.push({ u, x, y, still: !wander, i });
  });
  dots.sort((p, q) => p.y - q.y);
  for (const d of dots) walker(d.x, d.y, d.u, 0.58, d.i, d.still);
  ctx.restore();
  // 3 người đang nói (đổi người mỗi 2,5 giây)
  const k0 = Math.floor(h.t / 2.5);
  for (let k = 0; k < 3 && fade > 0.6; k++) {
    const d = dots[(k0 * 7 + k * 13) % dots.length], txt = TET_TALK[(k0 * 5 + k * 3) % TET_TALK.length];
    bubble(d.x, d.y - 120, `${String(d.u.name).slice(0, 10)}: ${txt}`, 3);
  }
}
const EAT = ['🍜 Phở ngon!', '🥖 Bánh mì!', '☕ Cà phê sữa đá!', '🍚 Cơm tấm!', '🥤 Nước mía!', '🍢 Nem nướng!', '🦐 Bánh xèo!'];
const MOM = ['📞 Mẹ: Tới {p} chưa con?', '📞 Mẹ: Ở nhà gói bánh chưng rồi nè!', '📞 Ba: Chạy chậm thôi con!', '📞 Mẹ: Nhớ mua quà cho ngoại nha!', '📞 Bà: Về tới đâu rồi cháu?', '📞 Mẹ: Đi đường nhớ ăn uống nha!'];
/** công trình của điểm dừng đặt tại vị trí trên lộ trình (vẽ cả lúc chưa tới, để thấy từ xa) */
function drawPlanScenery() {
  const V = vehOf(), list = (game.plan || []).slice();
  const hk = game.halt && game.halt.kind;
  // bấm thử tình huống ở chỗ không có trong lộ trình → vẫn dựng công trình tại chỗ xe đang dừng
  if (['rest', 'gas', 'police', 'train'].includes(hk) && !list.some(it => it.kind === hk && it.done && Math.abs(it.at - game.dist) < 120)) list.push({ kind: hk, at: game.dist, done: true });
  for (const it of list) {
    if (!['rest', 'gas', 'police', 'train'].includes(it.kind)) continue;
    const m = it.at + S(V.mid) / PX, x = xAt(m);
    if (x < -500 || x > W + 500) continue;
    const y = roadTop(m) + 2, active = game.halt && game.halt.kind === it.kind && it.done;
    ctx.save(); ctx.translate(x, y); ctx.scale(VS * 1.25, VS * 1.25);
    if (it.kind === 'rest') {
      ctx.fillStyle = '#f3e3c3'; ctx.fillRect(-300, -220, 600, 220);
      ctx.fillStyle = '#b8432f'; ctx.beginPath(); ctx.moveTo(-340, -214); ctx.lineTo(0, -320); ctx.lineTo(340, -214); ctx.fill();
      ctx.fillStyle = '#0f7a43'; rrect(-230, -300, 460, 60, 12); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = "800 36px 'Be Vietnam Pro'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`TRẠM DỪNG CHÂN ${ROUTE[provIdx(it.at)].name.toUpperCase()}`.slice(0, 30), 0, -270);
      for (const dx of [-200, 0, 200]) { ctx.fillStyle = '#e8322c'; ctx.beginPath(); ctx.moveTo(dx - 80, -110); ctx.quadraticCurveTo(dx, -170, dx + 80, -110); ctx.fill(); ctx.fillStyle = '#777'; ctx.fillRect(dx - 3, -130, 6, 130); ctx.fillStyle = '#2f7de2'; ctx.fillRect(dx - 50, -44, 100, 12); }
    } else if (it.kind === 'gas') {
      ctx.fillStyle = '#e8322c'; ctx.fillRect(-320, -300, 640, 50);
      ctx.fillStyle = '#fff'; ctx.font = "800 38px 'Be Vietnam Pro'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⛽ XĂNG DẦU', -120, -275);
      ctx.fillStyle = '#ccc'; ctx.fillRect(-290, -250, 16, 250); ctx.fillRect(274, -250, 16, 250);
      for (const dx of [-120, 60]) { ctx.fillStyle = '#f2f2f2'; rrect(dx - 30, -150, 60, 150, 8); ctx.fill(); ctx.fillStyle = '#e8322c'; ctx.fillRect(dx - 30, -150, 60, 30); ctx.fillStyle = '#222'; ctx.fillRect(dx - 18, -110, 36, 24); }
      ctx.fillStyle = '#5a7fb0'; ctx.fillRect(180, -180, 110, 180); ctx.fillStyle = '#fff'; ctx.font = "800 34px 'Be Vietnam Pro'"; ctx.fillText('WC', 235, -150);
    } else if (it.kind === 'police') {
      ctx.fillStyle = '#e9e4d0'; ctx.fillRect(560, -190, 150, 190); ctx.fillStyle = '#1f4fa0'; ctx.fillRect(546, -226, 178, 40);
      ctx.fillStyle = '#fff'; ctx.font = "800 26px 'Be Vietnam Pro'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('TRẠM CSGT', 635, -206);
      ctx.fillStyle = '#bfe3ff'; ctx.fillRect(585, -160, 100, 60);
      for (const dx of [420, 480]) { ctx.fillStyle = '#ff7a2f'; ctx.beginPath(); ctx.moveTo(dx - 16, 0); ctx.lineTo(dx, -50); ctx.lineTo(dx + 16, 0); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(dx - 9, -30, 18, 8); }
    } else if (it.kind === 'train') {
      ctx.fillStyle = '#5a4a3a'; ctx.fillRect(330, -10, 30, 70); ctx.fillRect(400, -10, 30, 70);       // đường ray cắt ngang
      ctx.fillStyle = '#fff'; ctx.fillRect(296, -200, 12, 200); ctx.fillStyle = '#e8322c'; ctx.beginPath(); ctx.arc(302, -210, 16, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(302, -150); ctx.rotate(active ? 0 : -1.35);
      for (let k = 0; k < 8; k++) { ctx.fillStyle = k % 2 ? '#e8322c' : '#fff'; ctx.fillRect(k * 40, -8, 40, 16); }
      ctx.restore();
      if (active && Math.sin(T * 10) > 0) { ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.arc(302, -210, 22, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }
}
/** tàu Thống Nhất chạy ngang phía sau đường lúc chắn tàu */
function drawTrain() {
  const h = game.halt; if (!h || h.kind !== 'train') return;
  const base = ROAD - 30, x0 = W + 200 - (h.t * 900) % 3400;
  for (let k = 0; k < 9; k++) {
    const x = x0 + k * 230;
    ctx.fillStyle = k === 0 ? '#1f5fbf' : '#2f6fd1'; rrect(x, base - 120, 220, 110, [k === 0 ? 40 : 8, 8, 4, 4]); ctx.fill();
    ctx.fillStyle = '#ffd23a'; ctx.fillRect(x, base - 60, 220, 10);
    ctx.fillStyle = '#bfe3ff'; for (let w = 0; w < 4; w++) ctx.fillRect(x + 20 + w * 50, base - 104, 34, 30);
    ctx.fillStyle = '#222'; for (const dx of [40, 180]) { ctx.beginPath(); ctx.arc(x + dx, base - 6, 14, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.fillStyle = '#fff'; ctx.font = "800 26px 'Be Vietnam Pro'"; ctx.textAlign = 'left'; ctx.fillText('THỐNG NHẤT', x0 + 30, base - 130);
}
/** cảnh xung quanh xe lúc đang dừng */
function drawHaltScene(cy) {
  const h = game.halt, V = vehOf();
  if (!h) return;
  const pax = game.passengers().seated;
  const mid = SX + S(V.mid), gy = contactY(cam) + S(130);         // người xuống đứng ở lề gần (trước đường)
  if (h.kind === 'rest') {
    drawRestCrowd(h);
  } else if (h.kind === 'gas') {
    ctx.strokeStyle = '#222'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(mid - S(150), cy - S(120)); ctx.quadraticCurveTo(mid - S(200), cy - S(20), SX - S(V.rear - 40), cy - S(80)); ctx.stroke();
    pax.slice(0, 4).forEach((u, i) => walker(mid + S(240) + i * S(110), gy, u, VS * 1.3, i));
    bubble(mid + S(260), gy - S(190), '🚻 Xếp hàng vệ sinh!');
  } else if (h.kind === 'police') {
    const px = SX + S(260), py = contactY(cam);
    csgt(px, py, VS * 1.6);
    scooter(px + S(170), py - S(4), { color: '#e9e4d0', rider: 'none', gifts: false, scale: VS * 0.8 });
    const say = h.reason === 'speed' ? [`👮 ${h.kmh || 180} km/h! Quá tốc độ rồi!`, '👮 Thả tim nộp phạt nha!'] : h.reason === 'overload' ? [`👮 Chở quá ${h.over} người!`, '👮 Ngồi trên nóc là sai luật!'] : ['👮 Giấy tờ xe đâu?', '👮 Thả tim mới cho đi nha!'];
    bubble(px + S(120), py - S(520), say[Math.floor(h.t / 3) % 2]);
    if (h.reason === 'speed') { ctx.save(); ctx.translate(px - S(60), py - S(250)); ctx.scale(VS, VS); ctx.fillStyle = '#222'; rrect(-30, -20, 60, 40, 8); ctx.fill(); ctx.fillRect(-10, 18, 16, 40); ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.arc(-30, 0, 12, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  } else if (h.kind === 'cows') {
    for (let k = 0; k < 3; k++) { const x = SX + S(260) + k * S(220) - h.t * S(12); cow(x, contactY(meterAt(x)) - S(6), VS * 1.35, k); }
    bubble(SX + S(380), contactY(cam) - S(220), '👨‍🌾 Từ từ cho bò qua!');
  } else if (h.kind === 'flat') {
    for (let k = 0; k < 3; k++) { ctx.fillStyle = `rgba(230,230,230,${0.5 - k * 0.12})`; ctx.beginPath(); ctx.arc(SX + S(20) + k * S(30) + Math.sin(T * 6 + k) * 6, contactY(cam) - S(40) - k * S(26), S(22 + k * 8), 0, Math.PI * 2); ctx.fill(); }
    bubble(SX, cy - S(V.top + 120), '💨 Xì lốp rồi!');
  } else if (h.kind === 'carsick') {
    const u = pax[0] || { name: 'Khách', id: 'k' };
    walker(SX + S(200), gy, u, VS * 1.35, 0, true);
    bubble(SX + S(200), gy - S(260), '🤢 Cho em xuống hóng gió…');
  } else if (h.kind === 'photo') {
    pax.slice(0, 6).forEach((u, i) => walker(mid - S(300) + i * S(130), gy, u, VS * 1.35, i, true));
    bubble(mid, gy - S(290), `📸 Check-in ${ROUTE[provIdx(cam)].landmark}!`);
    if ((h.t % 1.2) < 0.12) { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(0, 0, W, H); }
  }
}
function bubble(x, y, text, prio = 2) {
  ctx.font = "800 24px 'Be Vietnam Pro'"; const w = ctx.measureText(text).width + 28;
  x = clamp(x, w / 2 + 12, W - w / 2 - 12);   // không tràn mép màn
  placeLabel({ x: x - w / 2, y: y - 22, w, h: 58 }, prio, dy => bubbleDraw(x, y + dy, text, w));
}
function bubbleDraw(x, y, text, w) {
  ctx.font = "800 24px 'Be Vietnam Pro'";
  ctx.fillStyle = 'rgba(255,255,255,.95)'; rrect(x - w / 2, y - 22, w, 44, 22); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 8, y + 20); ctx.lineTo(x, y + 34); ctx.lineTo(x + 8, y + 20); ctx.fill();
  ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 1);
}
/** chú CSGT áo vàng, mũ kê-pi trắng, tay giơ gậy */
function csgt(x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.strokeStyle = '#3b5a3a'; ctx.lineWidth = 16; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-8, -90); ctx.lineTo(-12, -6); ctx.moveTo(8, -90); ctx.lineTo(12, -6); ctx.stroke();
  ctx.fillStyle = '#e8c547'; rrect(-30, -170, 60, 86, 16); ctx.fill();
  ctx.strokeStyle = '#e8c547'; ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(22, -156); ctx.lineTo(52, -200 + Math.sin(T * 6) * 8); ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(52, -200 + Math.sin(T * 6) * 8); ctx.lineTo(70, -250 + Math.sin(T * 6) * 8); ctx.stroke();
  ctx.fillStyle = '#ffd3ad'; ctx.beginPath(); ctx.arc(0, -196, 26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, -220, 34, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-24, -238, 48, 18);
  ctx.fillStyle = '#c3261f'; ctx.fillRect(-24, -226, 48, 5);
  ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(8, -196, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function cow(x, y, s, k) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  const b = Math.sin(T * 5 + k) * 4;
  ctx.fillStyle = '#c8a27a'; ctx.beginPath(); ctx.ellipse(0, -70 + b, 80, 40, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(80, -86 + b, 26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8b6a4a'; for (const dx of [-50, -20, 30, 56]) ctx.fillRect(dx, -40, 14, 40);
  ctx.strokeStyle = '#efe6d0'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(70, -108 + b); ctx.lineTo(60, -126 + b); ctx.moveTo(92, -108 + b); ctx.lineTo(102, -126 + b); ctx.stroke();
  ctx.restore();
}
/** kẹt xe: ô tô nhỏ trước/sau, bấm còi */
function drawJam() {
  const e = game.effects.find(f => f.kind === 'jam'); if (!e) return;
  const cols = ['#e8322c', '#2f7de2', '#ffc531', '#30333b', '#22b35e'];
  for (let k = 0; k < 5; k++) {
    const x = SX + S(180) + k * S(230) + Math.sin(T + k) * 6, y = contactY(meterAt(x)) - S(4);
    ctx.save(); ctx.translate(x, y); ctx.scale(VS, VS);
    ctx.fillStyle = cols[k]; rrect(-100, -110, 200, 80, 18); ctx.fill(); rrect(-60, -150, 120, 50, 14); ctx.fill();
    ctx.fillStyle = '#bfe3ff'; ctx.fillRect(-48, -142, 40, 34); ctx.fillRect(8, -142, 40, 34);
    wheel(-60, -28, 26, 0); wheel(60, -28, 26, 0);
    ctx.restore();
  }
  if (Math.sin(T * 5) > 0) bubble(SX + S(500), contactY(cam) - S(220), '📯 BÍP BÍP!');
}

// vệt gió tốc độ: càng nhanh càng dày, chạy lùi thì vệt đi ngược
const streaks = Array.from({ length: 26 }, (_, i) => ({ x: Math.random() * W, y: 560 + hash(i, 90) * 760, len: 60 + hash(i, 91) * 160 }));
function drawSpeed(dt, vel) {
  const k = clamp(Math.abs(vel) / 28, 0, 2.2);
  if (k < 0.15) return;
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  const n = Math.round(streaks.length * Math.min(1, k * 0.6));
  for (let i = 0; i < n; i++) {
    const st = streaks[i];
    st.x -= vel * PX * 1.6 * dt;
    if (st.x < -300) { st.x = W + Math.random() * 200; st.y = 560 + Math.random() * 760; }
    if (st.x > W + 300) { st.x = -Math.random() * 200; st.y = 560 + Math.random() * 760; }
    ctx.globalAlpha = 0.25 + 0.3 * Math.min(1, k);
    ctx.beginPath(); ctx.moveTo(st.x, st.y); ctx.lineTo(st.x + st.len * Math.min(1.6, k) * Math.sign(vel || 1), st.y); ctx.stroke();
  }
  ctx.restore();
}
// ---------------- 👻 trò kinh dị phe Phá · 🧄 trừ tà phe Cứu (luật ở logic.js: HORROR / COUNTER) ----------------
// Vẽ bằng canvas 2D theo SX / contactY như các hiệu ứng khác → dùng được cả bản 3D (vẽ chồng trên canvas nhãn).
let PANIC = 0, horrorA = 0, possessA = 0;
const HORROR_DARK = new Set(['ghost', 'possess', 'coffin', 'zombie', 'croc']);
function busFront() { return SX + S(100); }
function crowBird(x, y, s, flap) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#1d1b22';
  ctx.beginPath(); ctx.ellipse(0, 0, 26, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(24, -8, 12, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(-30, -26 - flap * 26); ctx.lineTo(10, -6); ctx.fill();     // cánh
  ctx.beginPath(); ctx.moveTo(-22, 2); ctx.lineTo(-44, -6); ctx.lineTo(-40, 10); ctx.fill();                  // đuôi
  ctx.fillStyle = '#f0a020'; ctx.beginPath(); ctx.moveTo(34, -10); ctx.lineTo(48, -6); ctx.lineTo(34, -3); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(27, -11, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8322c'; ctx.beginPath(); ctx.arc(28, -11, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function splat(x, y, r, seed) {
  ctx.fillStyle = 'rgba(250,250,240,.95)';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  for (let k = 0; k < 5; k++) { const a = hash(seed, k) * Math.PI * 2; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 0.9, r * 0.38, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(120,110,60,.6)'; ctx.beginPath(); ctx.arc(x + r * 0.2, y - r * 0.1, r * 0.3, 0, Math.PI * 2); ctx.fill();
}
function drawCrows(e, cy) {
  const V = vehOf(), mid = SX + S(V.mid);
  for (let k = 0; k < 5; k++) {
    const x = mid + Math.sin(e.t * 1.7 + k * 1.3) * S(V.rear * 0.55 + 140), y = cy - S(V.top + 170 + (k % 2) * 70) + Math.sin(e.t * 5 + k) * S(14);
    crowBird(x, y, VS * 1.6, Math.abs(Math.sin(T * 14 + k)));
    const p = (e.t * 1.3 + k * 0.37) % 1;   // cục phân rơi xuống nóc
    ctx.fillStyle = '#f4f2e6'; ctx.beginPath(); ctx.ellipse(x, lerp(y + S(10), cy - S(V.top), p), S(7), S(10), 0, 0, Math.PI * 2); ctx.fill();
  }
  const n = Math.min(7, 1 + Math.floor(e.t * 2.5));   // kính chắn gió dính bẩn
  for (let k = 0; k < n; k++) splat(busFront() - S(46) + (hash(e.id, k) - 0.5) * S(60), cy - S(190) + (hash(e.id, k + 9) - 0.5) * S(80), S(12 + hash(k, e.id) * 9), e.id * 7 + k);
  if (e.t > 0.6 && e.t < 2.6) bubble(busFront() - S(40), cy - S(V.top + 70), '🤮 Ỉa trúng kính rồi!!');
}
function drawSnake(e, cy) {
  const head = lerp(W + 60, busFront() - S(60), ease(e.t / 1.3)), y = cy - S(12);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#2f8a3a'; ctx.lineWidth = S(42); ctx.beginPath();
  for (let k = 0; k <= 14; k++) { const x = head + k * S(26), yy = y - Math.sin(T * 9 - k * 0.8) * S(14); k ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
  ctx.stroke();
  ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = S(8); ctx.setLineDash([S(10), S(16)]); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#2f8a3a'; ctx.beginPath(); ctx.ellipse(head - S(8), y, S(26), S(18), 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffeb3b'; ctx.beginPath(); ctx.arc(head - S(16), y - S(8), S(5), 0, Math.PI * 2); ctx.fill();
  if (Math.sin(T * 16) > 0) { ctx.strokeStyle = '#e8322c'; ctx.lineWidth = S(4); ctx.beginPath(); ctx.moveTo(head - S(32), y + S(2)); ctx.lineTo(head - S(52), y + S(2)); ctx.lineTo(head - S(60), y - S(6)); ctx.moveTo(head - S(52), y + S(2)); ctx.lineTo(head - S(60), y + S(10)); ctx.stroke(); }
  ctx.restore();
  if (e.t > 1) { PANIC = 1; bubble(SX + S(vehOf().mid), cy - S(vehOf().top + 60), '😱 RẮN! RẮN TRONG XE!!'); }
}
function ghostLady(x, y, s, t) {
  ctx.save(); ctx.translate(x, y + Math.sin(t * 2.4) * 10 * s); ctx.scale(s, s);
  const g = ctx.createLinearGradient(0, -260, 0, 20); g.addColorStop(0, 'rgba(250,252,255,.97)'); g.addColorStop(1, 'rgba(230,240,255,0)');
  ctx.fillStyle = g;   // áo dài trắng, vạt dưới tan vào sương
  ctx.beginPath(); ctx.moveTo(-34, -200); ctx.lineTo(34, -200); ctx.quadraticCurveTo(60, -60, 70 + Math.sin(t * 3) * 10, 20);
  for (let k = 0; k < 6; k++) ctx.lineTo(70 - k * 28, 6 + (k % 2) * 18);
  ctx.quadraticCurveTo(-60, -60, -34, -200); ctx.fill();
  const wave = Math.sin(t * 7) * 0.5;   // tay vẫy xe
  ctx.strokeStyle = '#f2f4fa'; ctx.lineWidth = 16; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-26, -190); ctx.lineTo(-74, -240 + wave * 30); ctx.lineTo(-70 + wave * 40, -300); ctx.stroke();
  ctx.fillStyle = '#d9dde8'; ctx.beginPath(); ctx.arc(0, -232, 34, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0b0b10';   // tóc dài xoã che mặt
  ctx.beginPath(); ctx.moveTo(-40, -250); ctx.quadraticCurveTo(0, -300, 40, -250); ctx.lineTo(46, -120); ctx.lineTo(18, -150); ctx.lineTo(4, -110); ctx.lineTo(-14, -150); ctx.lineTo(-44, -118); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ff2a2a'; ctx.shadowColor = '#ff2a2a'; ctx.shadowBlur = 18;
  ctx.beginPath(); ctx.arc(12, -228, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawGhost(e, cy) {
  const flick = e.t < 0.7 ? (Math.random() < 0.5 ? 0.25 : 1) : e.dur - e.t < 0.5 ? (e.dur - e.t) / 0.5 : 1;
  ctx.save(); ctx.globalAlpha = flick;
  ghostLady(busFront() + S(300), cy - S(20), VS * 1.6, T);
  ctx.restore();
  if (e.t > 0.8) bubble(busFront() + S(300), cy - S(560), '👻 Cho… em… đi nhờ… với…');
  if (e.t > 1.4 && e.t < 3.4) bubble(SX + S(vehOf().mid), cy - S(vehOf().top + 60), '😱 MAAAA!!!');
}
function crocBody(x, y, s, jaw, flip = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s * flip, s);
  ctx.fillStyle = '#4f7d2f';
  ctx.beginPath(); ctx.moveTo(-150, 0); ctx.quadraticCurveTo(-60, -40, 40, -26); ctx.lineTo(40, 22); ctx.quadraticCurveTo(-60, 30, -150, 0); ctx.fill();   // thân + đuôi
  ctx.fillStyle = '#3f6a24'; for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.moveTo(-120 + k * 22, -14 - k); ctx.lineTo(-110 + k * 22, -30 - k); ctx.lineTo(-100 + k * 22, -16 - k); ctx.fill(); }
  ctx.save(); ctx.translate(40, -6); ctx.rotate(-jaw);   // hàm trên
  ctx.fillStyle = '#5a8c34'; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(110, -6); ctx.lineTo(110, 4); ctx.lineTo(0, 6); ctx.fill();
  ctx.fillStyle = '#fff'; for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.moveTo(16 + k * 13, 4); ctx.lineTo(22 + k * 13, 14); ctx.lineTo(28 + k * 13, 4); ctx.fill(); }
  ctx.fillStyle = '#ffeb3b'; ctx.beginPath(); ctx.arc(20, -16, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#111'; ctx.fillRect(18, -22, 4, 12);
  ctx.restore();
  ctx.save(); ctx.translate(40, 8); ctx.rotate(jaw * 0.6);   // hàm dưới
  ctx.fillStyle = '#6e9b46'; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(104, 0); ctx.lineTo(100, 10); ctx.lineTo(0, 16); ctx.fill();
  ctx.fillStyle = '#fff'; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(18 + k * 14, 0); ctx.lineTo(24 + k * 14, -10); ctx.lineTo(30 + k * 14, 0); ctx.fill(); }
  ctx.restore();
  ctx.restore();
}
const pondY = () => contactY(cam) + 230;
const WET = new Set(['delta', 'coast', 'karst']);   // vùng có ao / sông / biển phía trước
function drawCroc(e, cy) {
  const V = vehOf(), roofX = SX - S(V.rear * 0.45), roofY = cy - S(V.top + 10), wx = roofX + S(160), wy = pondY();
  let x, y, jaw = 0.5, carry = false;
  if (e.t < 0.7) { const q = ease(e.t / 0.7); x = lerp(wx, roofX, q); y = lerp(wy, roofY, q) - Math.sin(q * Math.PI) * S(120); jaw = 0.75; }
  else if (e.t < 1.6) { const q = (e.t - 0.7) / 0.9; x = lerp(roofX, wx + S(80), q); y = lerp(roofY, wy + S(40), q * q) - Math.sin(q * Math.PI) * S(60); jaw = 0.12; carry = true; }
  else { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3; for (let k = 0; k < 3; k++) { const r = ((e.t * 60 + k * 40) % 120) * VS; ctx.beginPath(); ctx.ellipse(wx + S(80), wy + S(40), r * 1.8, r * 0.5, 0, 0, Math.PI * 2); ctx.stroke(); } return; }
  crocBody(x, y, VS * 2.2, jaw, -1);
  if (carry && e.victim) { avatar(x - S(250), y + S(8), S(40), e.victim, '#ff5a4a'); }
  if (e.t > 0.4 && e.victim) bubble(x - S(120), y - S(120), `🐊 Đớp ${String(e.victim.name).slice(0, 12)}!`);
}
/** Khách bị đớp bơi về xe trong ao phía trước (chạy suốt crocSec). */
function drawSwimmers(cy) {
  game.lost.forEach((l, i) => {
    const u = game.users.get(l.id); if (!u) return;
    const q = clamp(1 - l.left / (game.cfg.crocSec || 12), 0, 1), x = lerp(SX + S(520) + i * S(70), SX - S(60), q), y = pondY() + S(40) + Math.sin(T * 4 + i) * S(6);
    if (!WET.has(biomeAt(cam))) {   // vùng không có ao/sông: chạy bộ đuổi theo xe trên lề đường
      walker(x, contactY(meterAt(x)) + S(70), u, VS * 1.3, i * 2);
      if (Math.sin(T * 1.5 + i) > 0.2) bubble(x, contactY(cam) - S(60), '🏃 Chờ tui với!!', 3);
      return;
    }
    ctx.strokeStyle = '#ffd3ad'; ctx.lineWidth = S(9); ctx.lineCap = 'round';
    for (const s of [-1, 1]) { const a = T * 9 + (s > 0 ? Math.PI : 0); ctx.beginPath(); ctx.moveTo(x + s * S(18), y + S(4)); ctx.lineTo(x + s * S(18) + Math.cos(a) * S(30), y - Math.abs(Math.sin(a)) * S(26)); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y + S(18), S(44), S(9), 0, 0, Math.PI * 2); ctx.stroke();
    avatar(x, y - S(10), S(36), u, '#7cf0a9');
    if (Math.sin(T * 1.5 + i) > 0.2) bubble(x, y - S(70), '🆘 Đợi tui với!!', 3);
  });
}
function drawPossess(e, cy) {
  const V = vehOf(), dx = busFront() - S(44), dy = cy - S(196), p = 0.6 + Math.sin(T * 12) * 0.25;
  ctx.save();
  ctx.globalAlpha = 0.55 * p; ctx.fillStyle = '#ff1d1d'; ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 40;
  ctx.beginPath(); ctx.ellipse(SX + S(V.mid), cy - S(V.top * 0.5), S(V.rear * 0.62 + 120), S(V.top * 0.7), 0, 0, Math.PI * 2); ctx.lineWidth = S(14); ctx.strokeStyle = '#ff2a2a'; ctx.stroke();
  ctx.globalAlpha = 1; ctx.fillStyle = '#c8101a';   // sừng quỷ trên đầu tài xế
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(dx + s * S(14), dy - S(18)); ctx.quadraticCurveTo(dx + s * S(60), dy - S(60), dx + s * S(44), dy - S(120)); ctx.lineTo(dx + s * S(4), dy - S(26)); ctx.fill(); }
  ctx.fillStyle = '#ff2020'; ctx.shadowBlur = 20;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(dx + s * S(9), dy - S(2), S(5), 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  if (e.t > 0.5) bubble(dx + S(30), cy - S(V.top + 80), '👹 Khà khà… quay đầu về BẾN XE!!');
}
function pallbearer(x, y, s, ph, k) {
  const b = Math.abs(Math.sin(T * 9 + ph)) * 14, sw = Math.sin(T * 4.5 + ph);
  ctx.save(); ctx.translate(x, y - b * s); ctx.scale(s, s);
  ctx.strokeStyle = '#16161c'; ctx.lineWidth = 14; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-8, -60); ctx.lineTo(-14 - sw * 16, 0); ctx.moveTo(8, -60); ctx.lineTo(14 + sw * 16, 0); ctx.stroke();
  ctx.fillStyle = '#1f2028'; ctx.beginPath(); ctx.roundRect(-24, -140, 48, 86, 10); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-8, -140); ctx.lineTo(8, -140); ctx.lineTo(0, -104); ctx.fill();
  ctx.strokeStyle = '#1f2028'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(-18, -130); ctx.lineTo(-24, -186); ctx.moveTo(18, -130); ctx.lineTo(24, -186); ctx.stroke();   // tay đỡ quan tài
  ctx.fillStyle = k % 2 ? '#7a4a2a' : '#4a2c18'; ctx.beginPath(); ctx.arc(0, -160, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111'; ctx.fillRect(-18, -166, 36, 10);   // kính đen
  ctx.restore();
}
function drawCoffin(e, cy) {
  const gx = lerp(W + S(300), busFront() + S(160), ease(e.t / 1.3)), y = cy - S(6), s = VS * 1.3;
  const bob = Math.abs(Math.sin(T * 9)) * S(14);
  ctx.save(); ctx.translate(gx + S(130), y - S(196) - bob); ctx.rotate(Math.sin(T * 4.5) * 0.06);
  ctx.fillStyle = '#5a2e14'; ctx.beginPath(); ctx.moveTo(-S(170), -S(30)); ctx.lineTo(S(170), -S(30)); ctx.lineTo(S(160), S(20)); ctx.lineTo(-S(160), S(20)); ctx.fill();
  ctx.fillStyle = '#c0261e'; ctx.fillRect(-S(166), -S(46), S(332), S(18));
  ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = S(5); ctx.strokeRect(-S(150), -S(24), S(300), S(38));
  ctx.fillStyle = '#f2c14e'; ctx.font = `900 ${Math.round(S(26))}px 'Be Vietnam Pro'`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('VỀ BẾN XE', 0, -S(4));
  ctx.restore();
  for (let k = 0; k < 4; k++) pallbearer(gx + k * S(86), y, s, k * 0.6, k);
  if (e.t > 0.9) bubble(gx + S(130), y - S(330), '⚰️♪ Tiễn cả đoàn… lên đường ♪');
}
function zombieGuy(x, y, s, ph) {
  const w = Math.sin(T * 5 + ph);
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(w * 0.06);
  ctx.strokeStyle = '#3d4f6b'; ctx.lineWidth = 13; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-6, -56); ctx.lineTo(-12 + w * 10, 0); ctx.moveTo(6, -56); ctx.lineTo(12 - w * 10, 0); ctx.stroke();
  ctx.fillStyle = '#6b5a8a'; ctx.beginPath(); ctx.moveTo(-22, -126); ctx.lineTo(22, -126); ctx.lineTo(26, -52); ctx.lineTo(10, -60); ctx.lineTo(0, -48); ctx.lineTo(-12, -60); ctx.lineTo(-26, -52); ctx.fill();
  ctx.strokeStyle = '#8fbf6a'; ctx.lineWidth = 11;   // tay giơ thẳng
  ctx.beginPath(); ctx.moveTo(-14, -116); ctx.lineTo(-62, -112 + w * 6); ctx.moveTo(14, -112); ctx.lineTo(-56, -100 - w * 6); ctx.stroke();
  ctx.fillStyle = '#8fbf6a'; ctx.beginPath(); ctx.arc(0, -150, 26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-10, -154, 9, 0, Math.PI * 2); ctx.arc(8, -152, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c0161a'; ctx.beginPath(); ctx.arc(-11, -154, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4a2a2a'; ctx.fillRect(-12, -136, 22, 6);
  ctx.restore();
}
function drawZombies(e, cy) {
  const V = vehOf(), n = e.rammed ? 5 : 9;
  for (let k = 0; k < n; k++) {
    const tgt = k < 4 ? busFront() + S(30 + k * 50) : SX - S(V.rear * (k - 3) / 6) + S(40);
    const onRoof = k >= 4;
    const q = ease((e.t - k * 0.12) / 1.4);
    const x = lerp(W + S(80) + k * S(70), tgt, q), y = onRoof && q > 0.95 ? cy - S(V.top - 10) : cy;
    zombieGuy(x, y, VS * (onRoof ? 1.1 : 1.35), k);
  }
  if (e.t > 1) bubble(busFront() + S(150), cy - S(V.top + 120), '🧟 Nãooo… não người về quê…');
  if (e.t > 1.6 && e.t < 4) bubble(SX + S(V.mid), cy - S(V.top + 60), '😱 Chạy điiii!!', 3);
}
// {n} = tên 1 người trong top 10 tặng quà + thả tim (logic chọn sẵn: e.debtor)
const DEBT_LINES = ['Ê {n}! Mày không trả nợ cho tao à?!', '{n} ơi, Tết rồi trả nợ đi chứ!', 'Đứng lại {n}! Nợ 5 triệu chưa trả!', '{n} về quê trốn nợ hả?!',
  '{n}! Trả tiền hụi đây!!', '{n} mượn 2 năm rồi đó nha!', 'Lãi mẹ đẻ lãi con rồi {n} ơi!', '{n} có tiền tặng quà mà không trả tao?!', '{n}! Tao biết nhà ngoại mày ở đâu nha!', 'Trả nợ rồi hẵng ăn Tết nha {n}!'];
const RUN_LINES = ['😱 {n}: Chạy lẹ tài xế ơiii!', '🙈 {n}: Không phải tui!', '💨 {n}: Đạp ga đi!!', '🫣 {n}: Núp xuống!'];
const debtName = e => String((e.debtor && e.debtor.name) || 'mấy đứa kia').slice(0, 14);
function drawCreditor(e, cy) {
  const V = vehOf(), rear = SX - S(V.rear * 0.55);
  const mx = e.t < 0.8 ? lerp(-S(200), Math.max(S(170), rear), ease(e.t / 0.8)) : Math.max(S(170), rear) - (e.t - 0.8) * S(120);   // dí kịp rồi bị bỏ lại
  scooter(mx, cy + S(46), { color: '#30333b', scale: VS * 0.95, rot: wheelRot, gifts: false, shirt: '#8a5a3a', helmet: '#222', face: e.user });
  if (e.t > 0.3) bubble(mx + S(40), cy - S(130), `💸 ${DEBT_LINES[(e.line || 0) % DEBT_LINES.length].replace('{n}', debtName(e))}`);
  if (e.t > 1.1) { PANIC = 1; bubble(SX + S(V.mid), cy - S(V.top + 70), RUN_LINES[(e.line || 0) % RUN_LINES.length].replace('{n}', debtName(e)), 3); }
}
function lionDance(x, y, s, t) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  const b = Math.abs(Math.sin(t * 8)) * 18;
  ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 12; ctx.lineCap = 'round';   // 4 chân 2 người múa
  for (const [lx, ph] of [[-150, 0], [-110, 1.6], [-20, 0.8], [20, 2.4]]) { ctx.beginPath(); ctx.moveTo(lx, -60); ctx.lineTo(lx + Math.sin(t * 8 + ph) * 14, 0); ctx.stroke(); }
  ctx.fillStyle = '#e8322c'; ctx.beginPath(); ctx.moveTo(-200, -60); ctx.quadraticCurveTo(-100, -150 - b, 0, -90); ctx.lineTo(0, -56); ctx.lineTo(-200, -56); ctx.fill();   // thân vải
  ctx.fillStyle = '#ffd23a'; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(-180 + k * 32, -64, 10, 0, Math.PI); ctx.fill(); }
  ctx.save(); ctx.translate(30, -120 - b); ctx.rotate(Math.sin(t * 6) * 0.15);   // đầu lân
  ctx.fillStyle = '#ffc531'; ctx.beginPath(); ctx.roundRect(-50, -60, 110, 96, 30); ctx.fill();
  ctx.fillStyle = '#e8322c'; ctx.beginPath(); ctx.roundRect(-40, 10, 100, 30, 12); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-6, -22, 16, 0, Math.PI * 2); ctx.arc(34, -22, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-2 + Math.sin(t * 5) * 4, -22, 7, 0, Math.PI * 2); ctx.arc(38 + Math.sin(t * 5) * 4, -22, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#35c06b'; ctx.beginPath(); ctx.moveTo(4, -60); ctx.lineTo(14, -96); ctx.lineTo(24, -60); ctx.fill();   // sừng
  ctx.fillStyle = '#fff'; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(-40 + k * 22, -62, 9, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  ctx.restore();
}
function drawLion(e, cy) {
  const x = lerp(W + S(240), busFront() + S(330), ease(e.t / 1)) + Math.sin(T * 2) * S(30);
  lionDance(x, cy - S(4), VS * 1.4, T);
  if (Math.sin(T * 8) > 0.6) { ctx.font = `900 ${Math.round(S(40))}px 'Be Vietnam Pro'`; ctx.fillStyle = '#ffd23a'; ctx.textAlign = 'center'; ctx.fillText('TÙNG! TÙNG!', x - S(60), cy - S(330)); }
}
function buffaloBody(x, y, s, t) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.strokeStyle = '#2b2b30'; ctx.lineWidth = 16; ctx.lineCap = 'round';
  for (const [lx, ph] of [[-70, 0], [-40, 1.5], [40, 0.7], [64, 2.2]]) { ctx.beginPath(); ctx.moveTo(lx, -50); ctx.lineTo(lx + Math.sin(t * 16 + ph) * 18, 0); ctx.stroke(); }
  ctx.fillStyle = '#3a3a42'; ctx.beginPath(); ctx.ellipse(0, -80, 100, 50, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(104, -84, 40, 30, 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#d9d2c0'; ctx.lineWidth = 11;   // sừng trâu cong
  ctx.beginPath(); ctx.moveTo(96, -104); ctx.quadraticCurveTo(60, -150, 100, -158); ctx.moveTo(116, -106); ctx.quadraticCurveTo(160, -146, 126, -160); ctx.stroke();
  ctx.fillStyle = '#ff3a2a'; ctx.beginPath(); ctx.arc(118, -88, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(146, -74 + Math.sin(t * 20) * 2, 6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawBuffalo(e, cy) {
  const V = vehOf(), stop = Math.max(SX - S(V.rear + 170), S(190));   // đuôi xe sát mép: trâu húc từ làn ngoài
  const x = e.t < 0.6 ? lerp(-S(300), stop, ease(e.t / 0.6)) : stop + Math.abs(Math.sin(e.t * 6)) * S(18);
  buffaloBody(x, cy + S(40), VS * 1.5, T);
  if (e.t > 0.5 && e.t < 2) { ctx.font = `900 ${Math.round(S(44))}px 'Be Vietnam Pro'`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('ỤM BÒOO!', Math.max(x, S(260)), cy - S(200)); }
}
function drawShaman(e, cy) {
  const V = vehOf(), x = SX - S(V.rear * 0.62), y = cy - S(V.top + 60) - Math.abs(Math.sin(T * 5)) * S(16), sw = Math.sin(T * 10);
  ctx.save(); ctx.translate(x, y); ctx.scale(VS * 1.8, VS * 1.8);
  const halo = ctx.createRadialGradient(0, -90, 20, 0, -90, 150); halo.addColorStop(0, 'rgba(255,240,150,.85)'); halo.addColorStop(1, 'rgba(255,200,60,0)');
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, -90, 150 + Math.sin(T * 6) * 12, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#c0261e'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(-34, -120); ctx.lineTo(34, -120); ctx.lineTo(48, 0); ctx.lineTo(-48, 0); ctx.closePath(); ctx.stroke();
  ctx.fillStyle = '#ff9a1f'; ctx.beginPath(); ctx.moveTo(-34, -120); ctx.lineTo(34, -120); ctx.lineTo(48, 0); ctx.lineTo(-48, 0); ctx.fill();   // áo vàng
  ctx.fillStyle = '#ffd3ad'; ctx.beginPath(); ctx.arc(0, -146, 26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c0261e'; ctx.fillRect(-28, -164, 56, 10);   // khăn đỏ
  ctx.fillStyle = '#222'; ctx.fillRect(-12, -150, 7, 4); ctx.fillRect(6, -150, 7, 4);
  ctx.strokeStyle = '#a0522d'; ctx.lineWidth = 9; ctx.lineCap = 'round';   // kiếm gỗ đào múa
  ctx.save(); ctx.translate(30, -100); ctx.rotate(-0.8 + sw * 0.9); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -110); ctx.stroke(); ctx.restore();
  ctx.restore();
  for (let k = 0; k < 6; k++) {   // bùa vàng bay ra phía trước
    const q = ((e.t * 0.9 + k / 6) % 1);
    const bx = x + q * S(700), by = y - S(160) + Math.sin(q * 9 + k) * S(60);
    ctx.save(); ctx.translate(bx, by); ctx.rotate(q * 8 + k);
    ctx.fillStyle = '#ffe14a'; ctx.fillRect(-S(14), -S(24), S(28), S(48)); ctx.fillStyle = '#c0261e'; ctx.fillRect(-S(6), -S(18), S(12), S(36));
    ctx.restore();
  }
  if (e.t > 0.3) bubble(x + S(120), cy - S(V.top + 330), '🧙 Tà ma… TRÁNH RAAA!');
}
function drawGarlic(e, cy) {
  for (let k = 0; k < 6; k++) {
    const q = clamp((e.t - k * 0.1) / 0.9, 0, 1); if (q <= 0 || q >= 1) continue;
    const x = lerp(SX - S(200), busFront() + S(420), q), y = cy - S(200) - Math.sin(q * Math.PI) * S(180) + k * S(14);
    ctx.save(); ctx.translate(x, y); ctx.rotate(q * 10);
    ctx.fillStyle = '#f6f0e2'; ctx.beginPath(); ctx.moveTo(0, -S(22)); ctx.quadraticCurveTo(S(22), -S(4), S(14), S(16)); ctx.lineTo(-S(14), S(16)); ctx.quadraticCurveTo(-S(22), -S(4), 0, -S(22)); ctx.fill();
    ctx.strokeStyle = '#d6c7a6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -S(18)); ctx.lineTo(0, S(14)); ctx.stroke();
    ctx.restore();
  }
}
function drawFireworks(e, cy) {
  const cols = ['#ffd23a', '#ff5a7a', '#5ee0ff', '#7cf0a9', '#ff9f1c', '#c58bff'];
  for (let b = 0; b < 9; b++) {
    const t0 = b * 0.33, q = (e.t - t0) / 1.3; if (q <= 0 || q >= 1) continue;
    const bx = 160 + hash(e.id, b) * 760, by = 520 + hash(e.id, b + 20) * 300, c = cols[b % cols.length];
    if (q < 0.25) { ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.arc(bx, lerp(cy, by, q / 0.25), 5, 0, Math.PI * 2); ctx.fill(); continue; }
    const k = (q - 0.25) / 0.75, r = ease(k) * 150;
    ctx.save(); ctx.globalAlpha = 1 - k; ctx.fillStyle = c;
    ctx.shadowColor = c; ctx.shadowBlur = 16;
    for (let i = 0; i < 30; i++) { const a = i / 30 * Math.PI * 2; for (const rr of [r, r * 0.62]) { ctx.beginPath(); ctx.arc(bx + Math.cos(a) * rr, by + Math.sin(a) * rr + k * k * 40, rr === r ? 8 : 5, 0, Math.PI * 2); ctx.fill(); } }
    ctx.restore();
  }
}
function superHero(x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#d42a2a'; ctx.beginPath(); ctx.moveTo(-20, -120); ctx.quadraticCurveTo(-90 - Math.sin(T * 12) * 20, -40, -110, 20); ctx.lineTo(20, -120); ctx.fill();   // áo choàng
  ctx.strokeStyle = '#2f5fd8'; ctx.lineWidth = 16; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-8, -60); ctx.lineTo(-14, 0); ctx.moveTo(8, -60); ctx.lineTo(14, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-18, -120); ctx.lineTo(-36, -190); ctx.moveTo(18, -120); ctx.lineTo(36, -190); ctx.stroke();   // 2 tay nâng xe
  ctx.fillStyle = '#2f5fd8'; ctx.beginPath(); ctx.roundRect(-26, -130, 52, 74, 12); ctx.fill();
  ctx.fillStyle = '#ffd23a'; ctx.beginPath(); for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * Math.PI * 4 / 5; ctx.lineTo(Math.cos(a) * 16, -96 + Math.sin(a) * 16); } ctx.fill();   // ngôi sao vàng
  ctx.fillStyle = '#ffd3ad'; ctx.beginPath(); ctx.arc(0, -152, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(0, -160, 22, Math.PI, 0); ctx.fill();
  ctx.restore();
}
function superLift(e) { return S(300) * ease(Math.min(1, e.t / 0.8)) * Math.min(1, (e.dur - e.t) / 0.8); }
function drawSuperman(e, cy) {
  const V = vehOf();
  superHero(SX + S(V.mid), cy + S(230), VS * 1.5);
  if (e.t > 0.5 && e.t < 4) bubble(SX + S(V.mid) + S(160), cy + S(40), '🦸 Cả đoàn lên vai anh! Về quê thôiii!');
}
const FUN_DRAW = { crow: drawCrows, snake: drawSnake, ghost: drawGhost, croc: drawCroc, possess: drawPossess, coffin: drawCoffin, zombie: drawZombies,
  creditor: drawCreditor, garlic: drawGarlic, lion: drawLion, buffalo: drawBuffalo, shaman: drawShaman, fireworks: drawFireworks, superman: drawSuperman };
/** Vẽ mọi trò mới đang chạy + khách bơi về; cy = mặt đất dưới xe (đã trừ độ nhấc). */
function drawFun(dt, cy) {
  PANIC = Math.max(0, PANIC - dt * 2);
  let horror = 0, poss = 0;
  for (const e of game.effects) {
    const f = FUN_DRAW[e.kind]; if (!f || e.t >= e.dur) continue;
    if (HORROR_DARK.has(e.kind)) horror = 1;
    if (e.kind === 'possess') poss = 1;
    f(e, cy);
  }
  drawSwimmers(cy);
  horrorA = lerp(horrorA, horror, 1 - Math.pow(0.03, dt)); possessA = lerp(possessA, poss, 1 - Math.pow(0.03, dt));
}
/** Màn tối kinh dị (tím than, chớp sét) + viền đỏ khi bị quỷ nhập — vẽ trước nhãn để chữ vẫn đọc được. */
function drawHorrorVeil() {
  if (horrorA < 0.02 && possessA < 0.02) return;
  const g = ctx.createRadialGradient(W / 2, 1150, 200, W / 2, 1150, 1100);
  g.addColorStop(0, `rgba(20,8,40,${0.15 * horrorA})`); g.addColorStop(1, `rgba(8,2,20,${0.62 * horrorA})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (horrorA > 0.5 && Math.random() < 0.025) { ctx.fillStyle = 'rgba(230,235,255,.35)'; ctx.fillRect(0, 0, W, H); }   // chớp sét
  if (possessA > 0.02) {
    const r = ctx.createRadialGradient(W / 2, H / 2, 500, W / 2, H / 2, 1150);
    r.addColorStop(0, 'rgba(160,0,0,0)'); r.addColorStop(1, `rgba(190,0,0,${0.62 * possessA * (0.75 + Math.sin(T * 10) * 0.25)})`);
    ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
  }
}
const FUN_TXT = { crow: 'Quạ', snake: 'Rắn', ghost: 'Ma', croc: 'Cá sấu', possess: 'Quỷ', coffin: 'Quan tài', zombie: 'Zombie', dog: 'Chó', ducks: 'Vịt', rain: 'Mưa' };

let wheelRot = 0, lastDist = 0, vel = 0;
function render(dt) {
  // camera bám xe, đẩy lùi/tới mượt
  cam = Math.abs(game.dist - cam) > 400 ? game.dist : lerp(cam, game.dist, 1 - Math.pow(0.0005, dt));
  const dd = game.dist - lastDist; lastDist = game.dist;
  if (dt > 0) vel = lerp(vel, dd / dt, 1 - Math.pow(0.02, dt));   // m/giây thật trên màn (tính cả cú đẩy)
  wheelRot += dd / 0.55;
  const PAX = game.passengers();
  carsNow = VIEW.vehicle === 'scooter' ? 1 : PAX.cars;
  // đoàn càng dài càng thu nhỏ: 1 xe ×1 · 2 ×0,79 · 3 ×0,65 · 4 ×0,55 · 5 ×0,48; đầu xe lùi về phải đủ chỗ cho cả đoàn
  const zT = 1 / (1 + 0.27 * (carsNow - 1));
  const sxT = VIEW.vehicle === 'scooter' ? 230 : Math.max(330, 40 + VS0 * zT * (560 + (carsNow - 1) * CAR_GAP - 100));
  const ez = 1 - Math.pow(0.08, dt);
  zoom = lerp(zoom, zT, ez); PX = PX0 * zoom; VS = VS0 * zoom; SX = lerp(SX, sxT, ez); ROAD_H = ROAD_H0 * (0.6 + 0.4 * zoom); LANE = LANE0 * (0.6 + 0.4 * zoom);
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  LBL = [];
  drawSky(); drawFar(); drawMid(); drawRoadside(); drawPlanScenery(); drawTrain(); drawRoad();
  if (game.phase === 'race') drawSpeed(dt, vel);

  // vật cản trên đường
  for (const o of game.obstacles) {
    const x = SX + S(90) + o.gap * PX; if (x > W + 120) continue;
    const y = contactY(meterAt(x));
    if (o.kind === 'banana') banana(x, y, 0); else pothole(x, y);
    if (x < W - 60) tag(x, y - 46, o.user, 'rgba(170,30,25,.9)', 20);
  }
  drawJam();
  const x = game.exclusive;
  // xe streamer
  let lift = 0, ang = Math.atan2(roadTop(cam + 1) - roadTop(cam - 1), 2 * PX);
  if (game.jumpT > 0) lift = Math.sin(Math.PI * (1 - game.jumpT / 0.75)) * S(170);
  if (x && x.kind === 'heli') lift = S(x.stage === 'enter' ? ease(x.t / 1) * 40 : x.stage === 'fly' ? 40 + ease(x.t / 0.6) * 220 + Math.sin(T * 3) * 12 : 260 * (1 - ease(x.t / 0.8)));
  const SKY_LIFT = S(900);   // lốc xoáy nhấc cả đoàn lên trời
  if (x && x.kind === 'tornado') {
    if (x.stage === 'enter') { lift = ease(Math.min(1, x.t / 1.4)) * SKY_LIFT + Math.sin(T * 3) * S(30); ang += T * 5; }
    else if (x.stage === 'throw') { const q = Math.min(1, x.t / (x.push ? x.push.dur : 1.6)); lift = SKY_LIFT * (1 - ease(q)) + Math.sin(q * Math.PI) * S(260); ang += T * 12; }
    else if (x.stage === 'leave') { lift = SKY_LIFT * (1 - ease(Math.min(1, x.t / 0.8))); ang += T * 5 * (1 - Math.min(1, x.t / 0.8)); }
  }
  if (hitWobble > 0) ang += Math.sin(T * 30) * 0.12 * hitWobble;
  // vỏ chuối: lạng đuôi qua lại, bánh để lại vệt trượt + khói lốp; ổ gà: nảy bật lên
  let skidX = 0;
  if (skid > 0) {
    ang += Math.sin(T * 16) * 0.07 * skid; skidX = Math.sin(T * 8) * S(36) * skid;
    if (Math.random() < 0.6) { fx.push({ k: 'skid', x: SX + skidX - S(60), y: contactY(cam) - S(4), len: S(80), t: 0, dur: 1.6 }); fx.push({ k: 'dust', x: SX + skidX - S(vehOf().rear - 40), y: contactY(cam) - S(14), t: 0, dur: 0.8 }); }
  }
  if (bump > 0) { lift += Math.sin(Math.PI * (1 - bump)) * S(110); ang += Math.sin(T * 24) * 0.05 * bump; }
  const sup = game.effects.find(e => e.kind === 'superman' && e.t < e.dur);
  if (sup) { lift += superLift(sup) + Math.sin(T * 3) * S(10); }
  if (game.phase === 'race' && vel > 20 && lift < 1) ang -= 0.03 + Math.sin(T * 22) * 0.008;   // chạy nhanh: hơi bốc đầu + rung
  const cy = contactY(cam) - lift;
  // xe container lao tới từ bên phải
  if (x && x.kind === 'container') {
    const front = SX + S(96);
    const xf = x.stage === 'enter' ? lerp(W + 80, front, ease(x.t)) : x.stage === 'leave' ? lerp(front, W + 500, ease(x.t)) : x.stage === 'bounce' ? front + Math.sin(Math.min(1, x.t) * Math.PI) * S(140) : front;
    container(xf, meterAt(xf + S(200)), x.user, x.t, x.count);
    if (x.stage === 'push') for (let k = 0; k < 2; k++) fx.push({ k: 'dust', x: front + S(20), y: contactY(cam) - S(10), t: 0, dur: 0.5 });
  }
  // xe ủi chạy ngược chiều đẩy lùi
  {
    const own = (x && (x.kind === 'container' || x.kind === 'tornado')) || game.effects.some(e => FUN_DRAW[e.kind] && e.t < e.dur && ACTION_BY_ID[e.kind].side === 'pha');   // trò kinh dị tự có hình, không cần xe ủi
    // xe ủi lái tới theo cú đẩy Phá đang TIẾP CẬN (logic: p.t < 0) — chạm đầu xe đúng lúc cú đẩy bắt đầu, không để xe tự lùi trước
    let near = 0;
    if (game.phase === 'race' && !game.halt && !own) for (const p of game.pushes) if (p.side === 'pha' && DOZER_KINDS.has(p.kind) && p.t < p.dur) near = Math.max(near, p.t < 0 && p.lead ? 1 + p.t / p.lead : 1);
    pushA = near > 0 ? Math.max(near, Math.min(pushA, 1)) : lerp(pushA, 0, 1 - Math.pow(0.002, dt));   // tới: bám đúng tiến độ · đi: lùi ra từ từ
    if (pushA > 0.03) {
      const xf = SX + S(108) + (1 - ease(pushA)) * S(720);
      bulldozer(xf, meterAt(xf + S(200)), clamp(pushA * 1.4, 0, 1));
      if (pushBy && pushA > 0.5) tag(xf + S(220), contactY(cam) - S(330), pushBy, 'rgba(170,30,25,.9)', 20);
      if (pushA > 0.6) fx.push({ k: 'dust', x: SX + S(100), y: contactY(cam) - S(8), t: 0, dur: 0.5 });
    }
  }
  // hiệu ứng có thời hạn
  for (const e of game.effects) {
    if (e.kind === 'dog') { const V = vehOf(), dx = SX - S(V.rear + 30) + Math.sin(T * 6) * S(16); dog(dx, contactY(meterAt(dx)), T); if (Math.sin(T * 7) > 0.3) { ctx.font = "800 28px 'Be Vietnam Pro'"; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('GÂU!', dx + S(60), contactY(cam) - S(140)); } tag(Math.max(110, dx), contactY(cam) - S(150), e.user, 'rgba(170,30,25,.9)', 20); }
    if (e.kind === 'ducks') { for (let k = 0; k < 6; k++) { const qx = SX + S(160) + k * S(52); duck(qx, contactY(meterAt(qx)) - (k % 2) * S(12), T, k); } tag(SX + S(290), contactY(cam) - S(110), e.user, 'rgba(170,30,25,.9)', 20); }
    if (e.kind === 'tow') {
      const a = Math.min(1, e.t / 0.5, (e.dur - e.t) / 0.4);
      const h = towTruck(SX + S(260), meterAt(SX + S(400)), e.user, clamp(a, 0, 1));
      ctx.strokeStyle = `rgba(60,60,60,${clamp(a, 0, 1)})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(h.hx, h.hy); ctx.quadraticCurveTo(SX + S(170), cy - S(100), SX + S(80), cy - S(70)); ctx.stroke();
    }
    if (e.kind === 'convoy') {
      const a = clamp(Math.min(e.t / 0.6, (e.dur - e.t) / 0.6), 0, 1);
      ctx.save(); ctx.globalAlpha = a;
      (VIEW.vehicle === 'scooter' ? [[-220, '#2f7de2'], [-420, '#22b35e'], [260, '#ff6fae']] : [[260, '#2f7de2'], [470, '#22b35e'], [680, '#ff6fae']]).forEach(([ox, c], k) => {
        const bx = SX + S(ox) + Math.sin(T * 2 + k) * S(24);
        scooter(bx, contactY(meterAt(bx)) - S(16), { color: c, scale: VS * 0.8, rot: wheelRot, gifts: false, shirt: '#333', helmet: '#fff', face: k === 0 ? e.user : null });
      });
      tag(SX + S(VIEW.vehicle === 'scooter' ? -220 : 260), contactY(cam) - S(190), e.user, 'rgba(10,120,60,.92)', 20);
      ctx.restore();
    }
  }
  const walking = game.walking && game.phase === 'race';
  const lose = game.phase === 'result' && game.result && game.result.winner === 'pha';
  // nitro / trực thăng: lửa pô
  if (game.effects.some(e => e.kind === 'nitro') || (x && x.kind === 'heli' && x.stage === 'fly')) {
    for (let k = 0; k < 3; k++) { ctx.fillStyle = ['#ffd23a', '#ff7a2f', '#e8322c'][k]; ctx.beginPath(); ctx.ellipse(SX - S(vehOf().rear + 20) - k * S(30) - Math.random() * S(24), cy - S(40), S(46 - k * 8), S(13 - k * 2), 0, 0, Math.PI * 2); ctx.fill(); }
  }
  const V = vehOf();
  const drv = game.driver ? { name: game.driver.name, avatar: game.driver.avatar } : { name: VIEW.streamerName, avatar: '' };
  if (walking) for (let k = 0; k < 3; k++) { ctx.save(); ctx.translate(SX - S(V.rear + 40 + k * 70), contactY(cam)); ctx.scale(VS * 0.8, VS * 0.8); rider(0, 0, { shirt: ['#2f6bd8', '#e2557b', '#18b37e'][k] }, 'walk'); ctx.restore(); }
  const hk = game.halt && game.halt.kind;
  const onBoard = hk === 'rest' || hk === 'photo' ? Object.assign({}, PAX, { seated: [], extra: 0 }) : hk === 'gas' ? Object.assign({}, PAX, { seated: PAX.seated.slice(4) }) : PAX;
  drawVehicle(SX + skidX, cy, { color: BIKES[VIEW.bike] || BIKES.green, rot: wheelRot, ang: ang + (hk === 'flat' ? -0.05 : 0), rider: lose ? 'none' : walking ? 'walk' : 'ride', driver: drv, passengers: onBoard, running: game.speed > 0, flat: hk === 'flat', sick: hk === 'carsick' && PAX.seated[0] ? PAX.seated[0].id : '' });
  drawHaltScene(cy);
  drawFun(dt, cy);
  if (momMsg && momMsg.t > 0 && !game.halt && game.phase === 'race') bubble(SX - S(20), cy - S(vehOf().top + 190), momMsg.text);
  if (lose) { const bx = SX + S(300); trashBin(bx, contactY(meterAt(bx)), 0.6, 1.3); ctx.save(); ctx.translate(bx, contactY(cam) - S(130)); ctx.scale(VS, VS); head(0, -30, '#ffcf33', '#ffd3ad', {}); ctx.restore(); }
  // tài xế (người xem tặng quà lái) + streamer
  const d = game.driver;
  tag(SX - S(V.rear > 200 ? 20 : 0), cy - S(V.top + 40), { name: d ? `🧑‍✈️ ${String(d.name).slice(0, 14)} ${d.free ? '· giữ lái' : fmtClock(d.left)}` : `🧑‍✈️ ${VIEW.streamerName}`, avatar: d ? d.avatar : '' }, 'rgba(190,110,0,.94)', 24, 30, 0);
  if (VIEW.vehicle !== 'scooter') for (let i = 1; i < carsNow; i++) { const di = game.drivers[i]; if (di) tag(SX - S(CAR_GAP * i + 20), cy - S(V.top + 40), driverTag(di, i), 'rgba(190,110,0,.88)', 20, 22, 1); }
  // mũ bảo hiểm: lá chắn vàng
  if (game.shield > 0 && game.phase === 'race') {
    ctx.save(); ctx.globalAlpha = 0.35 + Math.sin(T * 5) * 0.1; ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(SX + S(vehOf().mid), cy - S(vehOf().top * 0.45), S(vehOf().rear * 0.65 + 160), S(vehOf().top * 0.62), 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  // mưa
  const rain = game.effects.find(e => e.kind === 'rain');
  if (rain) {
    ctx.fillStyle = 'rgba(20,30,50,.18)'; ctx.fillRect(0, 0, W, H);
    cloud(SX + S(vehOf().mid), cy - S(vehOf().top + 230), VS * 1.5, true);
    ctx.strokeStyle = 'rgba(190,215,255,.7)'; ctx.lineWidth = 2;
    for (let k = 0; k < 50; k++) { const rx = SX + S(vehOf().mid - 320) + hash(k, 80) * S(640), ry = cy - S(vehOf().top + 190) + ((T * 900 + hash(k, 81) * 500) % S(440)); ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 6, ry + 22); ctx.stroke(); }
    tag(SX + S(vehOf().mid), cy - S(vehOf().top + 330), rain.user, 'rgba(170,30,25,.9)', 20);
  }
  // trực thăng + dây
  if (x && x.kind === 'heli') {
    const hx = x.stage === 'enter' ? lerp(W + 200, SX, ease(x.t)) : x.stage === 'leave' ? lerp(SX, W + 300, ease(x.t / 0.8)) : SX + Math.sin(T * 2) * S(24);
    const hy = x.stage === 'leave' ? lerp(cy - S(440), 300, ease(x.t / 0.8)) : cy - S(440);
    if (x.stage !== 'leave') { ctx.strokeStyle = '#444'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hx, hy + S(60)); ctx.lineTo(SX + S(vehOf().mid), cy - S(vehOf().top)); ctx.stroke(); }
    heli(hx, hy, x.user, T);
  }
  // lốc xoáy
  if (x && x.kind === 'tornado') {
    const a = x.stage === 'leave' ? 1 - x.t / 0.8 : Math.min(1, x.t * 2);
    const tx = SX + S(vehOf().mid) + (x.stage === 'leave' ? x.t * 500 : 0);
    tornado(tx, contactY(cam), T, clamp(a, 0, 1) * 0.85);
    tornadoDebris(tx, contactY(cam), T, clamp(a, 0, 1));
    if (x.stage === 'enter') tag(SX, contactY(cam) - S(560), x.user, 'rgba(170,30,25,.9)', 22);
  }
  // bụi bánh xe
  if (game.speed > 0 && Math.random() < 0.6 && lift < 5) fx.push({ k: 'dust', x: SX - S(vehOf().rear - 20), y: contactY(cam) - S(10), t: 0, dur: 0.6 });
  if (game.fuelAlarm && Math.random() < 0.2) fx.push({ k: 'dust', x: SX - S(100), y: cy - S(40), t: 0, dur: 1 });
  drawHorrorVeil();
  layoutLabels();
  drawFx();
  ctx.restore();
}

// ---------------- bản thử 3D (?r=3d): render3d.js vẽ cảnh + xe; canvas 2D chỉ còn nhãn tên, bong bóng thoại, chữ nổi ----------------
let R3D = null;
if (Q.get('r') === '3d') {
  try {
    const { createRenderer3D } = await import('./render3d.js');
    R3D = createRenderer3D({ stage, before: cv, game, VIEW, env: {
      get pushBy() { return pushBy; }, get shake() { return shake; }, get skid() { return skid; }, get bump() { return bump; }, get wobble() { return hitWobble; },
      get color() { return BIKES[VIEW.bike] || BIKES.green; }, get streamerName() { return VIEW.streamerName; },
    } });
    // driver GPU reset (hay gặp ở GPU tích hợp khi LIVE lâu) → quay về bản 2D thay vì màn đen
    R3D.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); console.warn('[dvq] mất WebGL, quay về 2D'); const r = R3D; R3D = null; try { r.dispose(); } catch (er) { /* đã mất */ } });
  } catch (e) { console.warn('[dvq] không dựng được 3D, quay về 2D', e); R3D = null; }
}
let last3d = 0;
const CAP3D = Q.get('cap') === '0' ? 0 : 1000 / 62;
function render3d(dt) {
  const o = R3D.render(dt);
  SX = o.sx; zoom = o.zoom; PX = PX0 * zoom; VS = VS0 * zoom;   // chữ nổi (floatText) bám đúng chỗ đầu xe
  ctx.clearRect(0, 0, W, H);
  LBL = [];
  const d = game.driver;
  tag(o.driver.x, o.driver.y, { name: d ? `🧑‍✈️ ${String(d.name).slice(0, 14)} ${d.free ? '· giữ lái' : fmtClock(d.left)}` : `🧑‍✈️ ${VIEW.streamerName}`, avatar: d ? d.avatar : '' }, 'rgba(190,110,0,.94)', 24, 30, 0);
  (o.carTags || []).forEach((p, i) => { const di = game.drivers[i + 1]; if (di) tag(p.x, p.y, driverTag(di, i + 1), 'rgba(190,110,0,.88)', 20, 22, 1); });
  if (pushBy && o.push) tag(o.push.x, o.push.y, pushBy, 'rgba(170,30,25,.9)', 20);
  if (o.extra) tag(o.extra.x, o.extra.y, { name: `+${o.extra.n} chờ ghế` }, 'rgba(22,26,36,.86)', 20, 16, 2);
  if (momMsg && momMsg.t > 0 && !game.halt && game.phase === 'race') bubble(o.driver.x + 20, o.driver.y - 70, momMsg.text);
  drawFun(dt, contactY(cam));
  drawHorrorVeil();
  layoutLabels();
  drawFx();
}

// ---------------- vòng lặp ----------------
let last = performance.now();
function frame(now) {
  // bản 3D khoá ~60 khung/giây: màn 144 Hz không vẽ thừa giành GPU với OBS (?cap=0 để đo không khoá)
  if (R3D && CAP3D && now - last3d < CAP3D) { requestAnimationFrame(frame); return; }
  last3d = now;
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
  if (!window.__dvq || !window.__dvq.freeze) tick(dt);   // __dvq.freeze = true: giữ nguyên khung để chụp
  requestAnimationFrame(frame);
}
let lastProv = -1, lastPart = 0, momMsg = null, momT = 40;
function tick(dt) {
  T += dt;
  if (game.phase === 'race') {
    const pi = provIdx(Math.max(0, game.dist));
    const pk = partAt(Math.max(0, game.dist), game.cfg.goal);
    if (pi === lastProv && pk.k !== lastPart && pk.k > 0) banner(`📍 ${esc(pk.part.name.toUpperCase())}<small>${esc(pk.part.sign)} · nay thuộc ${esc(ROUTE[pi].name)}</small>`, 'gold', 1400, 0);
    lastPart = pk.k;
    if (pi !== lastProv) { if (lastProv >= 0 && pi > lastProv) { const pv = ROUTE[pi]; banner(`📍 ${pv.icon} ${esc(pv.name.toUpperCase())}<small>${esc(pv.landmark)}${pv.old.length ? ' · gồm ' + esc(pv.old.join(', ')) : ''}</small>`, 'gold', 1500, 0); } lastProv = pi; }
    momT -= dt; if (momMsg) momMsg.t -= dt;
    if (momT <= 0) { momT = 45 + Math.random() * 35; momMsg = { t: 4, text: MOM[Math.floor(Math.random() * MOM.length)].replace('{p}', ROUTE[Math.min(NP - 1, pi + 2)].name) }; }
  } else lastProv = -1;
  if (demo || Q.get('autolike') === '1' || (game.halt && game.halt.testAuto)) demoTick(dt);
  game.step(dt);
  onEvents(game.drainEvents());
  stepFx(dt);
  if (R3D) render3d(dt); else render(dt);
  updateHud(dt);
  if (game.phase !== 'result') $('result').classList.add('hidden');
  const lg = VIEW.showLegend && game.phase === 'race';
  if (lg === $('lgl').classList.contains('hidden')) { $('lgl').classList.toggle('hidden', !lg); $('lgr').classList.toggle('hidden', !lg); }
}
requestAnimationFrame(frame);

// ---------------- người xem ảo (demo) ----------------
let demo = Q.get('demo') === '1', demoT = 0;   // ?autolike=1: chỉ tự thả tim lúc bị giữ, không tặng quà ảo
const NAMES = ['Minh Anh', 'Tuấn Kiệt', 'Bé Na', 'Hoàng Long', 'Thu Hà', 'Út Mập', 'Khánh Vy', 'Anh Ba', 'Mai Linh', 'Quốc Bảo', 'Ngọc Trâm', 'Chú Tư'];
const COINS = [1, 1, 1, 1, 5, 5, 5, 10, 30, 30, 100, 199, 500, 1000];
let demoLikeT = 0;
function demoTick(dt) {
  // bị CSGT giữ / thủng lốp: người xem ảo thả tim liên tục cho qua (~4 giây)
  const hh = game.halt;
  if (hh && hh.need) {
    demoLikeT -= dt;
    if (demoLikeT <= 0) { demoLikeT = 0.25; const nm = NAMES[Math.floor(Math.random() * NAMES.length)]; game.like({ id: `demo_${nm}`, name: nm, avatar: '' }, Math.ceil(hh.need / 16)); }
    return;
  }
  if (!demo) return;   // ?autolike=1: chỉ tự thả tim, không tặng quà ảo
  demoT -= dt;
  if (demoT > 0) return;
  demoT = 0.5 + Math.random() * 1.1;
  const name = NAMES[Math.floor(Math.random() * NAMES.length)];
  const u = { id: `demo_${name}`, name, avatar: '' };
  const r = Math.random();
  if (r < 0.72) {
    const side = Math.random() < (name.length % 3 === 0 ? 0.3 : 0.62) ? 'cuu' : 'pha';
    const coins = COINS[Math.floor(Math.random() * (Math.random() < 0.9 ? 10 : COINS.length))];
    const acts = ACTIONS.filter(a => a.side === side && a.min <= coins);
    const action = acts[acts.length - 1 - Math.floor(Math.random() * Math.min(2, acts.length))].id;
    game.gift(u, { action, coins, count: Math.random() < 0.12 ? 5 : 1 });
  } else if (r < 0.86) game.like(u, 40);
  else if (r < 0.93) game.comment(u, Math.random() < 0.5 ? '1' : '2');
  else if (r < 0.97) game.share(u);
  else game.follow(u);
}

// ---------------- socket ----------------
function appUser(d) { return { id: String(d.uniqueId || d.userId || d.nickname || 'khach'), name: String(d.nickname || d.uniqueId || 'Khách').slice(0, 24), avatar: d.profilePicture || '' }; }
function testCoins(action) { const m = ACTION_BY_ID[action] && ACTION_BY_ID[action].min; return Number.isFinite(m) && m > 0 ? m : (action === 'driver' ? 99 : 1); }
function onAppCmd(d) {
  if (!d || d.gameId !== 'duongveque') return;
  const p = d.payload || {};
  if (d.cmd === 'demo') demo = !!p.on;
  else if (d.cmd === 'start') game.input('start');
  else if (d.cmd === 'reset') { game.reset(); followFlags.length = 0; banner('🧹 Đã làm mới', '', 1500); }
  else if (d.cmd === 'end') game.forceEnd(p.winner);
  else if (d.cmd === 'key' && typeof p.action === 'string') game.input(p.action);
  else if (d.cmd === 'event' && typeof p.kind === 'string') {
    if (!game.triggerEvent(p.kind)) banner('⚠️ Chỉ thử được khi đang chạy ván, xe không dừng', '', 1500, 1);
    else if (game.halt) game.halt.testAuto = true;   // bấm thử: người xem ảo tự thả tim cho qua
  }
  else if (d.cmd === 'test') {
    const name = p.name || NAMES[Math.floor(Math.random() * NAMES.length)];
    const u = { id: `test_${name}`, name, avatar: '' };
    if (p.kind === 'gift') game.gift(u, { action: p.action, coins: Number(p.coins) || testCoins(p.action), count: Number(p.count) || 1, giftId: p.giftId, giftName: p.giftName }, VIEW.giftMap);
    else if (p.kind === 'like') game.like(u, Number(p.count) || 100);
    else if (p.kind === 'share') game.share(u);
    else if (p.kind === 'follow') game.follow(u);
    else if (p.kind === 'comment') game.comment(u, p.text || '1');
  }
}
if (typeof window.io === 'function') {
  const socket = window.io({ reconnection: true, reconnectionDelay: 600, reconnectionDelayMax: 5000 });
  const WIN = Q.get('win') === '1';
  let winCloseT = WIN ? setTimeout(() => window.close(), 9000) : 0;
  socket.on('disconnect', () => { if (!WIN) return; clearTimeout(winCloseT); winCloseT = setTimeout(() => window.close(), 4000); });
  socket.on('connect', async () => {
    clearTimeout(winCloseT);
    try { const r = await fetch('/api/games/duongveque/config'); if (r.ok) applyServerConfig(await r.json()); } catch (e) { /* mặc định */ }
    socket.emit('subscribe', 'overlay');
  });
  socket.on('gameConfig', d => d && d.gameId === 'duongveque' && applyServerConfig(d.config));
  socket.on('overlay:reload', d => { if (!d || !d.gameId || d.gameId === 'duongveque') location.reload(); });
  socket.on('gameDisabled', d => { if (d && d.gameId === 'duongveque') document.body.style.visibility = 'hidden'; });
  socket.on('gameEnabled', d => { if (d && d.gameId === 'duongveque') document.body.style.visibility = ''; });
  socket.on('gift', g => g && game.gift(appUser(g), { giftId: g.giftId, giftName: g.giftName, coins: Number(g.coinValue || g.diamondCount || 1), count: Math.max(1, Number(g.repeatCount) || 1) }, VIEW.giftMap));
  socket.on('chat', c => c && game.comment(appUser(c), c.comment || ''));
  socket.on('like', l => l && game.like(appUser(l), Math.max(1, Number(l.likeCount) || 1)));
  socket.on('social', d => {
    if (!d) return;
    const t = String(d.label || '');
    if (/theo dõi|follow/i.test(t)) game.follow(appUser(d));
    else if (/chia sẻ|share/i.test(t)) game.share(appUser(d));
  });
  socket.on('gameCmd', onAppCmd);
  socket.on('duongveque:key', k => k && typeof k.action === 'string' && game.input(k.action));
}
loadGiftSheet();
// thử nhanh qua URL: ?warp=giây (tua) · ?act=container,dog (tặng quà ảo) · ?after=giây (tua sau khi tặng)
if (Q.get('warp') || Q.get('act')) setTimeout(() => {
  for (let i = 0; i < (Number(Q.get('riders')) || 0); i++) window.__dvq.sim('comment', { text: '1', name: `${NAMES[i % NAMES.length]}${i >= NAMES.length ? ' ' + i : ''}` });
  window.__dvq.step(Number(Q.get('warp')) || 0);
  if (Q.get('at') && game.phase === 'race') { game.dist = game.maxDist = Number(Q.get('at')); cam = game.dist; lastDist = game.dist; }
  for (const a of String(Q.get('act') || '').split(',').filter(Boolean)) {
    const [action, coins] = a.split(':');
    window.__dvq.sim('gift', { action, coins: Number(coins) || testCoins(action), name: action === 'container' || action === 'tornado' ? 'Út Mập' : 'Minh Anh' });
  }
  if (Q.get('event') && game.triggerEvent(Q.get('event')) && game.halt && Q.get('autolike') !== '0') game.halt.testAuto = Q.get('autolike') === '1';
  window.__dvq.step(Number(Q.get('after')) || 0);
  if (Q.get('end')) { game.forceEnd(Q.get('end')); window.__dvq.step(1.5); }
  if (Q.get('nocard') === '1') { $('result').style.visibility = 'hidden'; $('banner').style.visibility = 'hidden'; }   // chụp cảnh không có thẻ
  if (Q.get('freeze') === '1') window.__dvq.freeze = true;   // chụp đúng khoảnh khắc này
}, 1200);

// bàn phím khi mở trong cửa sổ game / trình duyệt
addEventListener('keydown', e => {
  if (e.repeat) return;
  if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) { game.input('jump'); e.preventDefault(); }
  else if (['Enter', 'ArrowRight', 'KeyD', 'KeyH'].includes(e.code)) { game.input('ram'); e.preventDefault(); }
  else if (e.code === 'KeyS') game.input('start');
});

// gỡ lỗi / test tự động
window.__dvq = {
  game, VIEW, metersFor,
  get demo() { return demo; }, set demo(v) { demo = !!v; },
  /** chạy n giây (bước 1/60) rồi vẽ — dùng khi tab bị ẩn (rAF đứng) */
  step(sec = 1) { for (let t = 0; t < sec; t += 1 / 60) tick(1 / 60); return { phase: game.phase, dist: Math.round(game.dist), fuel: Math.round(game.fuel) }; },
  sim(kind, opts = {}) { onAppCmd({ gameId: 'duongveque', cmd: 'test', payload: Object.assign({ kind }, opts) }); },
  applyServerConfig,
  /** bản 3D: { fps, calls, triangles, passengers, gl } */
  r3d: () => (R3D ? R3D.stats() : null),
};
