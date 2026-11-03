/* 🛵 Đường Về Quê — overlay OBS 1080×1920 (canvas 2D cuộn ngang + HUD DOM).
 * Luật ở logic.js (thuần, có test). File này: nhận quà/tim/bình luận qua socket.io → game.gift()/like()…, mỗi khung
 * game.step(dt) rồi vẽ cảnh theo game state + sự kiện drainEvents().
 * Thử không cần LIVE: ?demo=1 (người xem ảo tặng quà 2 phe) · bàn phím Space = nhảy, Enter = húc, S = bắt đầu ván.
 * Gỡ lỗi: window.__dvq (game, step(giây), sim(kind,…)).
 */
import { createGame, ACTIONS, ACTION_BY_ID, PENALTIES, metersFor } from './logic.js';

const Q = new URLSearchParams(location.search);
// SX = chỗ xe streamer đứng (lệch trái để thấy xa phía trước — vật cản, xe container, lốc xoáy lao tới từ bên phải)
// PX = điểm ảnh / mét · VS = cỡ xe & vật thể (nhỏ → bản đồ trông rộng) · ROAD_H = bề dày mặt đường
const W = 1080, H = 1920, SX = 230, PX = 26, ROAD = 1150, ROAD_H = 50, LANE = 34, VS = 0.5;
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
const VIEW = { streamerName: 'Streamer', sound: true, showLegend: true, giftMap: {}, bike: 'red', penalties: PENALTIES.slice() };
let gameCfg = {};
function applyServerConfig(c) {
  if (!c || typeof c !== 'object') return;
  const n = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  gameCfg = {
    goal: n(c.dvqGoal, 6000), roundSec: n(c.dvqRoundSec, 240), finalSec: n(c.dvqFinalSec, 30),
    speed: n(c.dvqSpeed, 100) / 3.6, fuelBurn: n(c.dvqFuelBurn, 1.8), meterPerCoin: n(c.dvqMeterPerCoin, 8),
    likePer: n(c.dvqLikePer, 100), ramCd: n(c.dvqRamCd, 12), dodgeMax: Number(c.dvqDodgeMax ?? 10) || 0,
    autoPilot: c.dvqControl !== 'streamer', autoNext: c.dvqAutoNext !== false, defaultSide: c.dvqDefaultSide === 'pha' ? 'pha' : 'cuu',
  };
  if (Q.get('goal')) gameCfg.goal = Number(Q.get('goal'));
  if (Q.get('sec')) gameCfg.roundSec = Number(Q.get('sec'));
  game.setConfig(gameCfg);
  VIEW.streamerName = String(c.dvqStreamerName || '').trim() || 'Streamer';
  VIEW.sound = c.dvqSound !== false;
  VIEW.showLegend = c.dvqShowLegend !== false;
  VIEW.giftMap = c.dvqGiftMap && typeof c.dvqGiftMap === 'object' ? c.dvqGiftMap : {};
  VIEW.bike = c.dvqBike || 'red';
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
function avatar(x, y, r, u, ring = '#fff') {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.fillStyle = ring; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  const im = img(u && u.avatar);
  if (im) ctx.drawImage(im, x - r, y - r, r * 2, r * 2);
  else {
    const name = (u && u.name) || '?';
    ctx.fillStyle = AV_COLORS[(name.charCodeAt(0) || 0) % AV_COLORS.length]; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(r * 1.1)}px 'Baloo 2', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name.trim().charAt(0).toUpperCase() || '?', x, y + r * 0.08);
  }
  ctx.restore();
}
function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function tag(x, y, u, color = 'rgba(22,26,36,.86)', size = 26) {
  const name = String((u && u.name) || '').slice(0, 16);
  ctx.font = `800 ${size}px 'Baloo 2', sans-serif`;
  const tw = ctx.measureText(name).width, r = size * 0.7, w = tw + r * 2 + 26, h = size + 14;
  rrect(x - w / 2, y - h, w, h, h / 2); ctx.fillStyle = color; ctx.fill();
  avatar(x - w / 2 + r + 4, y - h / 2, r, u);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(name, x - w / 2 + r * 2 + 14, y - h / 2 + 2);
}

// ---------------- đường & cảnh ----------------
const roadTop = m => ROAD + 26 * Math.sin(m / 21) + 12 * Math.sin(m / 8.7 + 1.3);
const contactY = m => roadTop(m) + LANE;
const meterAt = x => cam + (x - SX) / PX;
const xAt = m => SX + (m - cam) * PX;
let cam = 0;          // mét của camera (bám xe, mượt)
const STAGES = [
  { name: 'Sài Gòn', top: '#7fb6ea', bot: '#ffd9a8', mtn: '#9fb3c9', mtn2: '#7f97b1', asphalt: '#4b505b', ground: ['#9a9a98', '#7d7d7b'] },
  { name: 'Đồng lúa', top: '#3fa3f0', bot: '#cdeeff', mtn: '#8fb9a6', mtn2: '#6f9e86', asphalt: '#525661', ground: ['#77c043', '#4f9a2c'] },
  { name: 'Đèo biển', top: '#3a8bd6', bot: '#ffe9b8', mtn: '#6e8fae', mtn2: '#55789a', asphalt: '#4f535d', ground: ['#a58a6a', '#7d6550'] },
  { name: 'Làng quê', top: '#ff9d6a', bot: '#ffe48f', mtn: '#c98f7c', mtn2: '#a8705f', asphalt: '#5a5452', ground: ['#c9a35e', '#9d7a3e'] },
];
function hex(c) { const v = parseInt(c.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
function mix(a, b, t) { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`; }
function stageAt(m) { const s = clamp(m / game.cfg.goal, 0, 0.9999) * 4; return { i: Math.floor(s), f: s - Math.floor(s) }; }
function stageColor(m, key) {
  const { i, f } = stageAt(m);
  const a = STAGES[i], b = STAGES[Math.min(3, i + 1)];
  const k = f > 0.8 ? (f - 0.8) / 0.2 : 0;   // chuyển màu ở 20% cuối mỗi chặng
  return mix(a[key], b[key], k);
}
const stageIdx = m => stageAt(m).i;

let T = 0; // giây kể từ khi mở

function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, ROAD);
  g.addColorStop(0, stageColor(cam, 'top')); g.addColorStop(1, stageColor(cam, 'bot'));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, ROAD + 60);
  // mặt trời đi dần theo hành trình (sáng → chiều Tết)
  const p = clamp(cam / game.cfg.goal, 0, 1);
  const sx = lerp(180, 900, p), sy = 640 - Math.sin(p * Math.PI) * 140 + p * 90;
  const sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 170);
  sg.addColorStop(0, 'rgba(255,250,220,.95)'); sg.addColorStop(0.35, 'rgba(255,220,140,.45)'); sg.addColorStop(1, 'rgba(255,220,140,0)');
  ctx.fillStyle = sg; ctx.fillRect(sx - 180, sy - 180, 360, 360);
  ctx.beginPath(); ctx.arc(sx, sy, 58, 0, Math.PI * 2); ctx.fillStyle = p > 0.75 ? '#ffd36e' : '#fff6d6'; ctx.fill();
  // mây
  const off = cam * PX * 0.06 + T * 14;
  for (let i = Math.floor(off / 420) - 1; i < Math.floor(off / 420) + 4; i++) {
    const x = i * 420 - off + hash(i, 1) * 160, y = 470 + hash(i, 2) * 300, s = 0.7 + hash(i, 3) * 0.7;
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(x + k * 34 * s, y - Math.sin(k * 1.3) * 18 * s, (30 + hash(i * 7 + k, 4) * 22) * s, 0, Math.PI * 2); ctx.fill(); }
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
function drawFar() {
  const pass = stageIdx(cam) === 2;
  ridge(0.12, 950, pass ? 300 : 190, stageColor(cam, 'mtn'), 1);
  ridge(0.22, 1030, pass ? 220 : 120, stageColor(cam, 'mtn2'), 4);
}
// lớp giữa (0.45): nhà phố / hàng cây / biển / làng
function drawMid() {
  const f = 0.45, tile = 210, off = cam * PX * f;
  const i0 = Math.floor(off / tile) - 1;
  for (let i = i0; i < i0 + 8; i++) {
    const x = i * tile - off;
    const m = (i * tile) / (PX * f);
    const st = stageIdx(m), r = hash(i, 9);
    const base = 1120;
    if (st === 0) {
      const w = 130 + r * 70, h = 180 + hash(i, 10) * 280;
      const cols = ['#e7b38c', '#d7e3ef', '#f2d17d', '#c9d8a6', '#e6a7a2', '#b8c9e6'];
      ctx.fillStyle = cols[Math.floor(hash(i, 11) * cols.length)]; ctx.fillRect(x, base - h, w, h);
      ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(x + w - 14, base - h, 14, h);
      ctx.fillStyle = 'rgba(60,90,130,.55)';
      for (let yy = base - h + 22; yy < base - 40; yy += 46) for (let xx = x + 16; xx < x + w - 26; xx += 34) ctx.fillRect(xx, yy, 18, 24);
      if (r > 0.55) { ctx.fillStyle = r > 0.8 ? '#e2382c' : '#1f6fd1'; rrect(x + 10, base - h - 34, w - 20, 30, 6); ctx.fill(); }
    } else if (st === 1) {
      ctx.fillStyle = '#5f9e3c';
      for (let k = 0; k < 3; k++) { const tx = x + k * 70 + r * 30, th = 70 + hash(i * 3 + k, 12) * 60; ctx.beginPath(); ctx.ellipse(tx, base - th, 34, th * 0.6, 0, 0, Math.PI * 2); ctx.fill(); }
      if (r > 0.7) { // chòi lá
        ctx.fillStyle = '#8b5e34'; ctx.fillRect(x + 120, base - 60, 60, 60);
        ctx.fillStyle = '#c9a25a'; ctx.beginPath(); ctx.moveTo(x + 105, base - 58); ctx.lineTo(x + 150, base - 108); ctx.lineTo(x + 195, base - 58); ctx.fill();
      }
    } else if (st === 2) {
      const sea = ctx.createLinearGradient(0, base - 90, 0, base);
      sea.addColorStop(0, '#5ec2e8'); sea.addColorStop(1, '#2b86c4');
      ctx.fillStyle = sea; ctx.fillRect(x, base - 90, tile + 1, 100);
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3;
      for (let k = 0; k < 3; k++) { const yy = base - 70 + k * 22, xx = x + ((T * 30 + k * 60 + r * 100) % tile); ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + 28, yy); ctx.stroke(); }
      if (r > 0.75) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x + 80, base - 80); ctx.lineTo(x + 80, base - 130); ctx.lineTo(x + 112, base - 84); ctx.fill(); ctx.fillStyle = '#8b5e34'; ctx.fillRect(x + 62, base - 82, 60, 10); }
    } else {
      // nhà ngói đỏ + bụi tre
      if (r > 0.35) {
        const w = 150, h = 90;
        ctx.fillStyle = '#f3e3c3'; ctx.fillRect(x + 20, base - h, w, h);
        ctx.fillStyle = '#b8432f'; ctx.beginPath(); ctx.moveTo(x + 6, base - h + 4); ctx.lineTo(x + 95, base - h - 60); ctx.lineTo(x + 184, base - h + 4); ctx.fill();
        ctx.fillStyle = '#7a4a2a'; ctx.fillRect(x + 80, base - 54, 30, 54);
        ctx.fillStyle = '#e23a2f'; ctx.beginPath(); ctx.arc(x + 50, base - h + 22, 9, 0, Math.PI * 2); ctx.arc(x + 140, base - h + 22, 9, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.strokeStyle = '#5c9a3a'; ctx.lineWidth = 9;
        for (let k = 0; k < 6; k++) { const bx = x + 40 + k * 18; ctx.beginPath(); ctx.moveTo(bx, base); ctx.quadraticCurveTo(bx + 10, base - 120, bx + 30 + k * 4, base - 220 + k * 10); ctx.stroke(); }
      }
    }
  }
}
// đồ ven đường (lớp 1×, đứng trên mép xa của đường)
function drawRoadside() {
  const step = 6, m0 = Math.floor(meterAt(-120) / step), m1 = Math.ceil(meterAt(W + 120) / step);
  for (let k = m0; k <= m1; k++) {
    const m = k * step; if (m < -40) continue;
    const X = xAt(m), Y = roadTop(m) + 2, r = hash(k, 21), st = stageIdx(m);
    if (r < 0.45) continue;
    ctx.save(); ctx.translate(X, Y); ctx.scale(0.8, 0.8);   // cảnh ven đường nhỏ lại cho đường trông dài
    const x = 0, y = 0;
    if (st === 0) {
      if (r > 0.8) { ctx.strokeStyle = '#6b6b6b'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 260); ctx.stroke(); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x - 30, y - 240); ctx.lineTo(x + 30, y - 240); ctx.stroke(); ctx.strokeStyle = 'rgba(40,40,40,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 30, y - 240); ctx.quadraticCurveTo(x - 200, y - 200, x - 360, y - 240); ctx.stroke(); }
      else if (r > 0.6) tree(x, y, '#3e9a45', 0.8);
      else { ctx.fillStyle = r > 0.52 ? '#e2382c' : '#1f6fd1'; rrect(x - 50, y - 120, 100, 44, 8); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = "800 26px 'Baloo 2'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(r > 0.52 ? 'PHỞ' : 'CÀ PHÊ', x, y - 97); ctx.fillStyle = '#777'; ctx.fillRect(x - 4, y - 76, 8, 76); }
    } else if (st === 1) { if (r > 0.75) palm(x, y); else if (r > 0.6) haystack(x, y); else tree(x, y, '#4f9a2c', 0.7); }
    else if (st === 2) { if (r > 0.7) pine(x, y); else if (r > 0.55) { ctx.fillStyle = '#8c8c8c'; ctx.beginPath(); ctx.ellipse(x, y - 18, 40, 26, 0, 0, Math.PI * 2); ctx.fill(); } }
    else { if (r > 0.75) mai(x, y, k); else if (r > 0.6) lanterns(x, y); else tree(x, y, '#5c9a3a', 0.75); }
    ctx.restore();
  }
  // lan can đèo
  ctx.strokeStyle = '#d9d9d9'; ctx.lineWidth = 6;
  for (let x = -20; x < W + 20; x += 18) {
    const m = meterAt(x); if (stageIdx(m) !== 2) continue;
    ctx.beginPath(); ctx.moveTo(x, roadTop(m) - 22); ctx.lineTo(x + 18, roadTop(meterAt(x + 18)) - 22); ctx.stroke();
  }
}
function tree(x, y, c, s = 1) { ctx.fillStyle = '#7a5230'; ctx.fillRect(x - 7 * s, y - 90 * s, 14 * s, 90 * s); ctx.fillStyle = c; for (const [dx, dy, rr] of [[0, -150, 60], [-40, -110, 44], [40, -112, 46]]) { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, rr * s, 0, Math.PI * 2); ctx.fill(); } }
function palm(x, y) { ctx.strokeStyle = '#8b6234'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 20, y - 120, x + 6, y - 240); ctx.stroke(); ctx.strokeStyle = '#3f9b3c'; ctx.lineWidth = 12; for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + Math.sin(T * 1.5 + x) * 0.05; ctx.beginPath(); ctx.moveTo(x + 6, y - 240); ctx.quadraticCurveTo(x + 6 + Math.cos(a) * 60, y - 270 + Math.sin(a) * 20, x + 6 + Math.cos(a) * 110, y - 220 + Math.abs(Math.sin(a)) * 30); ctx.stroke(); } }
function haystack(x, y) { ctx.fillStyle = '#e0b84f'; ctx.beginPath(); ctx.moveTo(x - 50, y); ctx.quadraticCurveTo(x, y - 160, x + 50, y); ctx.fill(); ctx.strokeStyle = '#b8902e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 30, y - 50); ctx.lineTo(x + 30, y - 50); ctx.stroke(); }
function pine(x, y) { ctx.fillStyle = '#7a5230'; ctx.fillRect(x - 6, y - 40, 12, 40); ctx.fillStyle = '#2f7a4f'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x - 60 + k * 12, y - 30 - k * 50); ctx.lineTo(x, y - 120 - k * 50); ctx.lineTo(x + 60 - k * 12, y - 30 - k * 50); ctx.fill(); } }
function mai(x, y, seed = x) { ctx.strokeStyle = '#6b4226'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y - 110); ctx.lineTo(x - 50, y - 170); ctx.moveTo(x - 6, y - 110); ctx.lineTo(x + 46, y - 180); ctx.stroke(); for (let k = 0; k < 26; k++) { const a = hash(seed * 0.37 + k, 31) * Math.PI * 2, rr = 30 + hash(k, 32) * 60; ctx.fillStyle = k % 5 ? '#ffd23a' : '#ff9f1c'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr, y - 160 + Math.sin(a) * rr * 0.7, 9, 0, Math.PI * 2); ctx.fill(); } }
function lanterns(x, y) { ctx.strokeStyle = '#7a4a2a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 200); ctx.stroke(); for (let k = 0; k < 3; k++) { const ly = y - 180 + k * 52, sw = Math.sin(T * 2 + k) * 4; ctx.fillStyle = '#e8322c'; ctx.beginPath(); ctx.ellipse(x + 22 + sw, ly, 18, 22, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ffd23a'; ctx.fillRect(x + 14 + sw, ly + 20, 16, 6); } }

// nền trước dưới mặt đường — từng khúc 4 m vẽ theo chặng của chính khúc đó (đổi cảnh dần theo đường, không đổi cả màn)
const GROUND_TOP = ROAD + 60;
function drawGround() {
  const CH = 4, m0 = Math.floor(meterAt(-40) / CH) * CH, m1 = meterAt(W + 40);
  for (let m = m0; m < m1; m += CH) {
    const x0 = xAt(m), x1 = xAt(m + CH), k = Math.round(m / CH), st = stageIdx(m);
    ctx.save(); ctx.beginPath(); ctx.rect(x0 - 0.5, GROUND_TOP, x1 - x0 + 1, H - GROUND_TOP); ctx.clip();
    groundChunk(st, k, x0, x1);
    ctx.restore();
  }
}
function groundChunk(st, k, x0, x1) {
  const w = x1 - x0, r = hash(k, 61), r2 = hash(k, 62), cx = x0 + w * 0.5;
  if (st === 0) {            // vỉa hè lát gạch + quán cóc + xe đậu
    // vỉa hè gạch (1240–1500) → bờ kè → kênh nước có thuyền
    ctx.fillStyle = '#d8d0c2'; ctx.fillRect(x0, GROUND_TOP, w + 1, 1500 - GROUND_TOP);
    ctx.fillStyle = 'rgba(150,120,90,.12)';
    for (let y = 1250, j = 0; y < 1500; y += 50, j++) for (let t = 0; t < 2; t++) if ((j + t + k) % 2) ctx.fillRect(x0 + t * w / 2, y, w / 2, 50);
    ctx.fillStyle = '#a49c90'; ctx.fillRect(x0, 1500, w + 1, 22);
    ctx.fillStyle = '#7d766b'; ctx.fillRect(x0, 1522, w + 1, 40);
    const cn = ctx.createLinearGradient(0, 1562, 0, H); cn.addColorStop(0, '#5aa6c4'); cn.addColorStop(1, '#2f7392');
    ctx.fillStyle = cn; ctx.fillRect(x0, 1562, w + 1, H - 1562);
    ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 3;
    for (let j = 0; j < 4; j++) { const yy = 1610 + j * 70, xx = x0 + ((T * 30 + j * 40 + r * 140) % (w + 40)) - 20; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + 36, yy); ctx.stroke(); }
    if (r2 > 0.86) { const bx = cx, by = 1700 + Math.sin(T * 2 + k) * 4; ctx.save(); ctx.translate(bx, by); ctx.scale(VS, VS); ctx.fillStyle = '#8b5e34'; ctx.beginPath(); ctx.moveTo(-110, 0); ctx.lineTo(110, 0); ctx.lineTo(80, 34); ctx.lineTo(-80, 34); ctx.fill(); ctx.fillStyle = '#f1d488'; ctx.beginPath(); ctx.moveTo(-30, -2); ctx.lineTo(0, -40); ctx.lineTo(30, -2); ctx.fill(); ctx.restore(); }
    if (r > 0.78) {
      const cy = 1460;
      ctx.save(); ctx.translate(cx, cy); ctx.scale(VS, VS);
      ctx.fillStyle = '#e8322c'; ctx.beginPath(); ctx.moveTo(-120, -150); ctx.quadraticCurveTo(0, -230, 120, -150); ctx.fill();
      ctx.strokeStyle = '#777'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, -190); ctx.lineTo(0, 0); ctx.stroke();
      ctx.fillStyle = '#2f7de2'; ctx.fillRect(-50, -50, 100, 12); ctx.fillRect(-44, -40, 8, 40); ctx.fillRect(36, -40, 8, 40);
      ctx.fillStyle = '#e8322c'; for (const dx of [-90, 70]) { ctx.fillRect(dx, -26, 30, 8); ctx.fillRect(dx + 2, -18, 6, 18); ctx.fillRect(dx + 22, -18, 6, 18); }
      ctx.restore();
    } else if (r > 0.55) scooter(cx, 1470 + r2 * 20, { color: ['#2f7de2', '#30333b', '#ff6fae', '#22b35e'][Math.floor(r2 * 4)], rider: 'none', gifts: false, scale: VS * 0.85 });
    else if (r > 0.4) { ctx.fillStyle = '#8a8a86'; ctx.beginPath(); ctx.ellipse(cx, 1330 + r2 * 140, 30, 11, 0, 0, Math.PI * 2); ctx.fill(); }
  } else if (st === 1) {     // ruộng lúa bậc, nước phản chiếu trời
    for (let y = GROUND_TOP, j = 0; y < H; y += 76, j++) {
      ctx.fillStyle = j % 2 ? '#6cbd3a' : '#5aab2e'; ctx.fillRect(x0, y, w + 1, 76);
      ctx.fillStyle = 'rgba(170,220,250,.45)'; ctx.fillRect(x0, y + 4, w + 1, 11);
      ctx.strokeStyle = 'rgba(40,110,20,.6)'; ctx.lineWidth = 3;
      for (let t = 0; t < 3; t++) { const xx = x0 + (t + 0.5) * w / 3, yy = y + 58; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx - 6, yy - 20); ctx.moveTo(xx, yy); ctx.lineTo(xx + 6, yy - 20); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy - 24); ctx.stroke(); }
    }
    if (r > 0.84) {          // trâu
      ctx.save(); ctx.translate(cx, 1480 + r2 * 160); ctx.scale(VS, VS);
      ctx.fillStyle = '#4a4a52'; ctx.beginPath(); ctx.ellipse(0, -50, 80, 42, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(84, -64, 26, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(90, -86, 22, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.fillStyle = '#4a4a52'; for (const dx of [-50, -20, 30, 56]) ctx.fillRect(dx, -20, 14, 30);
      ctx.restore();
    } else if (r > 0.66) {   // người làm đồng đội nón lá
      ctx.save(); ctx.translate(cx, 1420 + r2 * 220); ctx.scale(VS, VS);
      ctx.fillStyle = '#4b6fb3'; rrect(-18, -70, 36, 56, 10); ctx.fill();
      ctx.fillStyle = '#ffd3ad'; ctx.beginPath(); ctx.arc(0, -84, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f1d488'; ctx.beginPath(); ctx.moveTo(-44, -86); ctx.lineTo(0, -122); ctx.lineTo(44, -86); ctx.fill();
      ctx.restore();
    }
  } else if (st === 2) {     // vách đá đổ xuống biển
    const g = ctx.createLinearGradient(0, GROUND_TOP, 0, 1580); g.addColorStop(0, '#a58a6a'); g.addColorStop(1, '#6d5644');
    ctx.fillStyle = g; ctx.fillRect(x0, GROUND_TOP, w + 1, 1580 - GROUND_TOP);
    ctx.fillStyle = 'rgba(40,25,15,.22)'; ctx.beginPath(); ctx.moveTo(x0 + r * w, 1260); ctx.lineTo(x0 + r * w + 20, 1420); ctx.lineTo(x0 + r * w - 6, 1560); ctx.lineTo(x0 + r * w - 14, 1560); ctx.lineTo(x0 + r * w + 10, 1420); ctx.fill();
    const sea = ctx.createLinearGradient(0, 1560, 0, H); sea.addColorStop(0, '#4fb6e0'); sea.addColorStop(1, '#1f6fae');
    ctx.fillStyle = sea; ctx.beginPath(); ctx.moveTo(x0, 1580 + Math.sin(k) * 10); ctx.lineTo(x1, 1580 + Math.sin(k + 1) * 10); ctx.lineTo(x1, H); ctx.lineTo(x0, H); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 3;
    for (let j = 0; j < 4; j++) { const yy = 1640 + j * 64, xx = x0 + ((T * 40 + j * 50 + r * 200) % (w + 40)) - 20; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.quadraticCurveTo(xx + 14, yy - 8, xx + 28, yy); ctx.stroke(); }
    if (r > 0.82) { ctx.save(); ctx.translate(cx, 1720 + Math.sin(T * 2 + k) * 5); ctx.scale(VS, VS); ctx.fillStyle = '#8b5e34'; ctx.beginPath(); ctx.moveTo(-70, 0); ctx.lineTo(70, 0); ctx.lineTo(50, 26); ctx.lineTo(-50, 26); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -110); ctx.lineTo(0, -6); ctx.lineTo(60, -6); ctx.fill(); ctx.restore(); }
  } else {                   // làng quê: đường đất, hàng rào tre, ao sen, gà
    ctx.fillStyle = '#d9b46c'; ctx.fillRect(x0, GROUND_TOP, w + 1, 70);
    ctx.fillStyle = '#86c04f'; ctx.fillRect(x0, GROUND_TOP + 70, w + 1, H);
    ctx.strokeStyle = '#a77b3c'; ctx.lineWidth = 5;
    for (let j = 0; j < 3; j++) { const xx = x0 + j * w / 3 + 8; ctx.beginPath(); ctx.moveTo(xx, 1290); ctx.lineTo(xx, 1350); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x0, 1306); ctx.lineTo(x1, 1306); ctx.moveTo(x0, 1332); ctx.lineTo(x1, 1332); ctx.stroke();
    if (r > 0.62) {            // ao sen
      const cy = 1560 + r2 * 120;
      ctx.fillStyle = '#5fb3d6'; ctx.beginPath(); ctx.ellipse(cx, cy, 100, 34, 0, 0, Math.PI * 2); ctx.fill();
      for (let j = 0; j < 4; j++) { ctx.fillStyle = '#3f9b3c'; ctx.beginPath(); ctx.ellipse(cx - 60 + j * 40, cy - 4 + (j % 2) * 10, 16, 7, 0, 0, Math.PI * 2); ctx.fill(); if (j % 2 === 0) { ctx.fillStyle = '#ff7aa8'; ctx.beginPath(); ctx.arc(cx - 60 + j * 40, cy - 12, 7, 0, Math.PI * 2); ctx.fill(); } }
    } else if (r > 0.42) {     // gà
      ctx.save(); ctx.translate(cx + Math.sin(T * 2 + k) * 8, 1470 + r2 * 200); ctx.scale(VS, VS);
      ctx.fillStyle = '#fff2dc'; ctx.beginPath(); ctx.ellipse(0, -26, 28, 22, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(22, -50, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8322c'; ctx.beginPath(); ctx.arc(22, -64, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ff9f1c'; ctx.beginPath(); ctx.moveTo(33, -52); ctx.lineTo(44, -48); ctx.lineTo(33, -44); ctx.fill();
      ctx.restore();
    }
    for (let j = 0; j < 4; j++) { ctx.fillStyle = j % 2 ? '#ff7aa8' : '#ffd23a'; ctx.beginPath(); ctx.arc(x0 + hash(k, 70 + j) * w, 1400 + hash(k, 80 + j) * 480, 6, 0, Math.PI * 2); ctx.fill(); }
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
    ctx.fillStyle = '#fff'; ctx.font = "800 18px 'Baloo 2'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('QUÊ', x, y + 18);
    ctx.fillStyle = '#222'; ctx.font = "800 22px 'Baloo 2'"; ctx.fillText(((goal - m) / 1000).toFixed(1).replace('.', ','), x, y + 50);
  }
  const fe = game.cfg.flagEvery;
  for (let m = Math.max(fe, Math.ceil(meterAt(-60) / fe) * fe); m < meterAt(W + 60); m += fe) {
    if (m >= goal) break;
    const x = xAt(m), y = roadTop(m) + 2, wv = Math.sin(T * 6 + m) * 4;
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 140); ctx.stroke();
    ctx.fillStyle = m <= game.maxDist ? '#ffd23a' : '#e8322c';
    ctx.beginPath(); ctx.moveTo(x, y - 140); ctx.quadraticCurveTo(x + 40, y - 132 + wv, x + 84, y - 128); ctx.lineTo(x + 84, y - 90); ctx.quadraticCurveTo(x + 40, y - 94 + wv, x, y - 98); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = "800 22px 'Baloo 2'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${fmt(m)}m`, x + 42, y - 113);
  }
  for (const f of followFlags) {
    const x = xAt(f.m); if (x < -150 || x > W + 150) continue;
    const y = roadTop(f.m) + 2;
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 110); ctx.stroke();
    ctx.fillStyle = '#ff5fa2'; rrect(x, y - 110, 46, 30, 6); ctx.fill();
    avatar(x + 23, y - 95, 11, f.user);
    ctx.font = "800 18px 'Baloo 2'"; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(String(f.user.name).slice(0, 10), x, y - 120);
  }
  drawGates();
}
function drawGates() {
  // vạch xuất phát
  const xs = xAt(0);
  if (xs > -260 && xs < W + 260) {
    const y = roadTop(0);
    ctx.save(); ctx.translate(xs, y); ctx.scale(0.75, 0.75); ctx.translate(-xs, -y);
    ctx.fillStyle = '#ccc'; ctx.fillRect(xs - 6, y - 260, 12, 260);
    ctx.fillStyle = '#1f6fd1'; rrect(xs - 150, y - 300, 300, 64, 14); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = "800 36px 'Baloo 2'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('SÀI GÒN · XUẤT PHÁT', xs, y - 266);
    ctx.restore();
  }
  // cổng làng
  const goal = game.cfg.goal, xg = xAt(goal);
  if (xg > -380 && xg < W + 380) {
    const y = roadTop(goal) + ROAD_H;
    ctx.save(); ctx.translate(xg, y); ctx.scale(0.8, 0.8); ctx.translate(-xg, -y);
    ctx.fillStyle = '#b8432f';
    ctx.fillRect(xg - 230, y - 330, 40, 420); ctx.fillRect(xg + 190, y - 330, 40, 420);
    ctx.fillStyle = '#7a2b1e'; rrect(xg - 270, y - 400, 540, 90, 18); ctx.fill();
    ctx.fillStyle = '#ffd23a'; ctx.font = "800 46px 'Baloo 2'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('CHÀO MỪNG VỀ QUÊ', xg, y - 354);
    ctx.fillStyle = '#c44a2f'; ctx.beginPath(); ctx.moveTo(xg - 300, y - 400); ctx.lineTo(xg, y - 470); ctx.lineTo(xg + 300, y - 400); ctx.fill();
    for (const dx of [-210, 210]) { const sw = Math.sin(T * 2 + dx) * 5; ctx.fillStyle = '#e8322c'; ctx.beginPath(); ctx.ellipse(xg + dx + sw, y - 280, 24, 30, 0, 0, Math.PI * 2); ctx.fill(); }
    mai(xg - 330, y - ROAD_H, 7); mai(xg + 340, y - ROAD_H, 9);
    ctx.restore();
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
    ctx.font = "800 26px 'Baloo 2'"; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('💦', 40, -230);
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
  ctx.fillStyle = '#fff'; ctx.font = "800 50px 'Baloo 2'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String((u && u.name) || '').slice(0, 12), 350, -95);
  if (mult > 1) { ctx.fillStyle = '#ffe27a'; ctx.font = "800 70px 'Baloo 2'"; ctx.fillText(`×${mult}`, 480, -230); }
  ctx.restore();
  void t;
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
  ctx.fillStyle = '#fff'; ctx.font = "800 30px 'Baloo 2'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('CỨU HỘ', -36, 14);
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
  ctx.fillStyle = '#fff'; ctx.font = "800 34px 'Baloo 2'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♻', 0, -56);
  ctx.restore();
}
function tornado(x, y, t, alpha) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.scale(VS * 1.15, VS * 1.15); x = 0; y = 0;
  for (let k = 0; k < 14; k++) {
    const yy = y - k * 34, r = 40 + k * 16, w = Math.sin(t * 3 + k * 0.6) * 18;
    ctx.strokeStyle = `rgba(110,120,135,${0.5 + k * 0.02})`; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.ellipse(x + w, yy, r, r * 0.22, 0, t * 6 + k, t * 6 + k + Math.PI * 1.4); ctx.stroke();
  }
  for (let k = 0; k < 6; k++) { const a = t * 5 + k, rr = 120 + k * 20; ctx.fillStyle = k % 2 ? '#8b5e34' : '#5f9e3c'; ctx.fillRect(x + Math.cos(a) * rr, y - 120 - k * 40 + Math.sin(a) * 30, 14, 10); }
  ctx.restore();
}

// ---------------- hiệu ứng nổi ----------------
const fx = [];
const followFlags = [];
let shake = 0, hitWobble = 0, spin = 0, bin = null;
function floatText(text, color, x = SX, y = null, size = 46) { fx.push({ k: 'txt', text, color, x, y: y == null ? contactY(cam) - S(300) : y, t: 0, dur: 1.4, size }); }
function confetti(n = 80, x = W / 2, y = 700) { for (let i = 0; i < n; i++) fx.push({ k: 'conf', x, y, vx: (Math.random() - 0.5) * 900, vy: -300 - Math.random() * 700, c: ['#ffd23a', '#e8322c', '#35d07f', '#2fa4e7', '#ff6fae'][i % 5], t: 0, dur: 2.6, r: Math.random() * 6 }); }
function stepFx(dt) {
  for (const f of fx) {
    f.t += dt;
    if (f.k === 'conf') { f.vy += 1200 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.r += dt * 8; }
    if (f.k === 'dust') { f.x -= (game.speed * PX * 0.6 + 40) * dt; f.y -= 30 * dt; }
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
      ctx.font = `800 ${f.size}px 'Baloo 2'`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(f.text, f.x, f.y - p * 120);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - p * 120); ctx.restore();
    } else if (f.k === 'conf') {
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.r); ctx.fillStyle = f.c; ctx.fillRect(-7, -4, 14, 8); ctx.restore();
    } else if (f.k === 'dust') {
      ctx.fillStyle = `rgba(220,210,190,${0.5 * (1 - p)})`; ctx.beginPath(); ctx.arc(f.x, f.y, 10 + p * 22, 0, Math.PI * 2); ctx.fill();
    } else if (f.k === 'trash') {
      // người tặng bay vòng cung vào thùng rác
      const e = ease(p), x = lerp(f.x, f.tx, e), y = lerp(f.y, f.ty, e) - Math.sin(p * Math.PI) * 320;
      ctx.save(); ctx.translate(x, y); ctx.rotate(p * 9); ctx.translate(-x, -y); avatar(x, y, 36, f.user, '#ff5a4f'); ctx.restore();
      if (p < 0.7) { ctx.font = "800 26px 'Baloo 2'"; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(String(f.user.name).slice(0, 12), x, y - 52); }
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
      ctx.fillStyle = '#fff'; ctx.font = "800 30px 'Baloo 2'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⛽', SX, y); ctx.restore();
    }
  }
  if (bin) {
    const open = bin.t < 1.2 ? Math.min(1, bin.t * 3) : Math.max(0, 1 - (bin.t - 1.2) * 3);
    const bounce = bin.t > 1 && bin.t < 1.4 ? Math.sin((bin.t - 1) / 0.4 * Math.PI) * 0.12 : 0;
    trashBin(bin.x, contactY(meterAt(bin.x)), open, 1 + bounce);
  }
}
function throwToTrash(user, fromX, fromY) {
  const tx = SX - S(210);
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
  const show = VIEW.showLegend;
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
  const sec = Math.ceil(game.phase === 'race' ? game.timeLeft : game.cfg.roundSec);
  $('timer').textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  $('timer').classList.toggle('final', game.final);
  $('round').textContent = `Ván ${Math.max(1, game.round + (game.phase === 'lobby' ? 1 : 0))}`;
  $('tfill').style.width = `${p * 100}%`;
  $('tbike').style.left = `${p * 100}%`;
  const km = m => (m / 1000).toFixed(m >= 10000 ? 1 : 2).replace('.', ',');
  $('dist').innerHTML = `<b>${km(game.dist)}</b> / ${km(gl)} km · còn ${km(Math.max(0, gl - game.dist))} km`;
  const kmh = game.phase === 'race' ? Math.round(vel * 3.6) : 0;
  $('speed').textContent = kmh < -5 ? `◀ ${-kmh}` : String(Math.max(0, kmh));
  $('cspeed').classList.toggle('back', kmh < -5);
  $('cspeed').classList.toggle('fast', kmh > 140);
  const track = $('track');
  if (track.dataset.goal !== String(gl)) {
    track.dataset.goal = String(gl);
    track.querySelectorAll('.flag').forEach(e => e.remove());
    for (let m = game.cfg.flagEvery; m < gl; m += game.cfg.flagEvery) { const f = document.createElement('i'); f.className = 'flag'; f.style.left = `${(m / gl) * 100}%`; track.appendChild(f); }
  }
  const tc = game.totals.cuu, tp = game.totals.pha, share = tc + tp > 0 ? tc / (tc + tp) : 0.5;
  $('tcuu').style.width = `${share * 100}%`; $('tknot').style.left = `${share * 100}%`;
  const topC = [...game.users.values()].filter(u => u.cuu > 0).sort((a, b) => b.cuu - a.cuu)[0];
  const topP = [...game.users.values()].filter(u => u.pha > 0).sort((a, b) => b.pha - a.pha)[0];
  $('tl').innerHTML = `${topC ? avHtml(topC) : ''}🛡️ CỨU ${fmt(tc)}`;
  $('tr').innerHTML = `${fmt(tp)} PHÁ ⚔️${topP ? avHtml(topP) : ''}`;
  $('tsl').innerHTML = topC ? `🦸 Ân nhân: <b>${esc(topC.name)}</b>` : 'Bình luận <b>1</b> = phe Cứu';
  $('tsr').innerHTML = topP ? `😈 Kẻ phá: <b>${esc(topP.name)}</b>` : 'Bình luận <b>2</b> = phe Phá';
  $('fuel').style.width = `${game.fuel}%`;
  $('cfuel').classList.toggle('low', game.fuel < 20 && game.phase === 'race');
  $('cshield').classList.toggle('hidden', game.shield <= 0);
  $('shield').textContent = `${fmt(game.shield)}m`;
  $('cram').textContent = game.ramCd > 0 ? `💥 HÚC ${Math.ceil(game.ramCd)}s` : '💥 HÚC sẵn sàng';
  $('cram').classList.toggle('ready', game.ramCd <= 0 && game.phase === 'race');
  // khung cứu nạn
  const rs = $('rescue');
  if (game.rescue) {
    const r = game.rescue;
    rs.classList.remove('hidden');
    $('rtxt').innerHTML = `🌪️ Lốc xoáy của <b>${esc(r.user.name)}</b>! Phe Cứu gom <b>${fmt(r.need)} xu</b>`;
    $('rsec').textContent = `${Math.max(0, Math.ceil(r.left))}s · ${fmt(r.got)}/${fmt(r.need)}`;
    $('rbar').style.width = `${clamp(r.got / r.need, 0, 1) * 100}%`;
  } else if (game.fuelAlarm) {
    rs.classList.remove('hidden');
    $('rtxt').innerHTML = '⛽ HẾT XĂNG! Tặng quà Cứu / chia sẻ để đổ xăng';
    $('rsec').textContent = `${Math.max(0, Math.ceil(game.fuelAlarm.left))}s`;
    $('rbar').style.width = `${(1 - game.fuelAlarm.left / game.cfg.rescueSec) * 100}%`;
  } else rs.classList.add('hidden');
  // màn chờ
  const lob = $('lobby');
  if (game.phase === 'lobby') {
    lob.classList.remove('hidden');
    const left = Math.max(0, Math.ceil(game.cfg.lobbySec - game.phaseT));
    const st = loadStats();
    const fame = Object.values(st.fame || {}).sort((a, b) => b.cuu - a.cuu).slice(0, 3);
    lob.innerHTML = `<h1>🛵 ĐƯỜNG VỀ QUÊ</h1><h2>Ván ${game.round + 1} xuất phát sau</h2><div class="cd">${left}</div>
      <div class="how">🧧 Đưa <b class="y">${esc(VIEW.streamerName)}</b> về quê ăn Tết trong <b class="y">${Math.round(game.cfg.roundSec / 60 * 10) / 10} phút</b>!<br>
      🛡️ Quà <b class="g">CỨU</b>: đẩy xe tới, đổ xăng, che chắn<br>⚔️ Quà <b class="r">PHÁ</b>: vật cản, đẩy lùi, lốc xoáy<br>
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
  el.className = `card ${win ? 'win' : 'lose'}`;
  el.innerHTML = `<h1>${win ? '🎉 VỀ TỚI QUÊ!' : '😭 KẸT GIỮA ĐƯỜNG'}</h1>
    <h2>${win ? `Phe 🛡️ CỨU thắng · ${fmt(r.timeUsed)} giây` : `Phe ⚔️ PHÁ thắng · còn ${fmt(r.goal - r.dist)} m`}</h2>
    <div class="cols"><div class="col cuu"><h3>🦸 Ân nhân</h3>${r.topCuu.map(row).join('') || '<div class="pr">—</div>'}</div>
    <div class="col pha"><h3>😈 Kẻ phá</h3>${r.topPha.map(row).join('') || '<div class="pr">—</div>'}</div></div>
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
};

// ---------------- sự kiện luật → hình / chữ ----------------
const SIDE_COLOR = { cuu: '#5ef09b', pha: '#ff7a70' };
function onEvents(list) {
  for (const e of list) {
    switch (e.type) {
      case 'action': {
        const a = ACTION_BY_ID[e.action];
        toast(e.side, e.user, `${a.emoji} ${a.label}${e.count > 1 ? ` ×${e.count}` : ''}${e.final ? ' 🔥×2' : ''}`);
        if (e.action === 'wind') fx.push({ k: 'wind', t: 0, dur: 0.9 });
        if (e.action === 'fuel') { fx.push({ k: 'can', t: 0, dur: 1.2 }); floatText('+⛽', '#ffe27a', SX, contactY(cam) - S(330)); }
        if (e.action === 'helmet') { floatText(`⛑️ +${dtx(e.meters)}`, '#ffe27a'); SFX.good(); }
        if (['dog', 'ducks', 'rain', 'container'].includes(e.action)) floatText(`-${dtx(e.meters)}`, SIDE_COLOR.pha, SX + S(200), contactY(cam) - S(300), 52);
        if (['nitro', 'convoy', 'tow', 'wind', 'heli'].includes(e.action)) floatText(`+${dtx(e.meters)}`, SIDE_COLOR.cuu, SX + S(60), contactY(cam) - S(260));
        if (e.action === 'heli' || e.action === 'tornado' || e.action === 'container') banner(`${a.emoji} ${esc(a.label)} của <b>${esc(e.user.name)}</b>!`, e.side, 2400, 2);
        if (e.side === 'cuu' && e.action !== 'helmet') SFX.good();
        break;
      }
      case 'pending': toast(e.side, e.user, `${ACTION_BY_ID[e.action].emoji} ⏳ chờ ván mới`); break;
      case 'hit': hitWobble = 1; shake = Math.max(shake, e.kind === 'pothole' ? 10 : 6); if (e.kind === 'banana') spin = 1; floatText(`-${dtx(e.meters)}`, SIDE_COLOR.pha); SFX.hit(); break;
      case 'dodge': floatText('NÉ ĐẸP!', '#7cf0a9', SX, contactY(cam) - S(320)); SFX.good(); break;
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
      case 'roundStart': $('result').classList.add('hidden'); banner(`🏁 VÁN ${e.round} XUẤT PHÁT!<small>Về quê ${(e.goal / 1000).toLocaleString('vi-VN')} km · 100 km/h</small>`, 'gold', 2000, 3); SFX.honk(); followFlags.length = 0; break;
      case 'roundEnd': saveStats(e); showResult(e); if (e.winner === 'cuu') { confetti(160); SFX.win(); } else SFX.lose(); break;
      case 'lobby': $('result').classList.add('hidden'); break;
      case 'join': toast(e.side, e.user, e.side === 'cuu' ? '🛡️ vào phe Cứu' : '⚔️ vào phe Phá'); break;
      case 'likeBurst': if (game.phase === 'race') { fx.push({ k: 'wind', t: 0, dur: 0.7 }); floatText('❤️ +gió', '#ff8fb5', SX - S(80), contactY(cam) - S(250), 36); } break;
      case 'share': toast('cuu', e.user, '↗️ chia sẻ · +⛽'); break;
      case 'follow': toast('cuu', e.user, '➕ follow · cắm cờ'); followFlags.push({ m: game.dist + 14 + Math.random() * 6, user: e.user }); if (followFlags.length > 30) followFlags.shift(); break;
      default: break;
    }
  }
}

// ---------------- vẽ một khung ----------------
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
let wheelRot = 0, lastDist = 0, vel = 0;
function render(dt) {
  // camera bám xe, đẩy lùi/tới mượt
  cam = Math.abs(game.dist - cam) > 400 ? game.dist : lerp(cam, game.dist, 1 - Math.pow(0.0005, dt));
  const dd = game.dist - lastDist; lastDist = game.dist;
  if (dt > 0) vel = lerp(vel, dd / dt, 1 - Math.pow(0.02, dt));   // m/giây thật trên màn (tính cả cú đẩy)
  wheelRot += dd / 0.55;
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  drawSky(); drawFar(); drawMid(); drawRoadside(); drawRoad();
  if (game.phase === 'race') drawSpeed(dt, vel);

  // vật cản trên đường
  for (const o of game.obstacles) {
    const x = SX + S(90) + o.gap * PX; if (x > W + 120) continue;
    const y = contactY(meterAt(x));
    if (o.kind === 'banana') banana(x, y, 0); else pothole(x, y);
    if (x < W - 60) tag(x, y - 46, o.user, 'rgba(170,30,25,.9)', 20);
  }
  const x = game.exclusive;
  // xe streamer
  let lift = 0, ang = Math.atan2(roadTop(cam + 1) - roadTop(cam - 1), 2 * PX);
  if (game.jumpT > 0) lift = Math.sin(Math.PI * (1 - game.jumpT / 0.75)) * S(170);
  if (x && x.kind === 'heli') lift = S(x.stage === 'enter' ? ease(x.t / 1) * 40 : x.stage === 'fly' ? 40 + ease(x.t / 0.6) * 220 + Math.sin(T * 3) * 12 : 260 * (1 - ease(x.t / 0.8)));
  if (x && x.kind === 'tornado') { if (x.stage === 'enter') { lift = S(70 + Math.sin(T * 4) * 20); ang += T * 6; } else if (x.stage === 'throw') { lift = Math.sin(Math.min(1, x.t / (x.push ? x.push.dur : 1.6)) * Math.PI) * S(420); ang += T * 14; } }
  if (hitWobble > 0) ang += Math.sin(T * 30) * 0.12 * hitWobble;
  if (spin > 0) { ang += (1 - spin) * Math.PI * 2; spin = Math.max(0, spin - dt * 1.4); }
  if (game.phase === 'race' && vel > 20 && lift < 1) ang -= 0.03 + Math.sin(T * 22) * 0.008;   // chạy nhanh: hơi bốc đầu + rung
  const cy = contactY(cam) - lift;
  // xe container lao tới từ bên phải
  if (x && x.kind === 'container') {
    const front = SX + S(96);
    const xf = x.stage === 'enter' ? lerp(W + 80, front, ease(x.t)) : x.stage === 'leave' ? lerp(front, W + 500, ease(x.t)) : x.stage === 'bounce' ? front + Math.sin(Math.min(1, x.t) * Math.PI) * S(140) : front;
    container(xf, meterAt(xf + S(200)), x.user, x.t, x.count);
    if (x.stage === 'push') for (let k = 0; k < 2; k++) fx.push({ k: 'dust', x: front + S(20), y: contactY(cam) - S(10), t: 0, dur: 0.5 });
  }
  // hiệu ứng có thời hạn
  for (const e of game.effects) {
    if (e.kind === 'dog') { const dx = SX - S(190) + Math.sin(T * 6) * S(20); dog(dx, contactY(meterAt(dx)), T); if (Math.sin(T * 7) > 0.3) { ctx.font = "800 28px 'Baloo 2'"; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('GÂU!', SX - S(110), contactY(cam) - S(140)); } tag(SX - S(190), contactY(cam) - S(150), e.user, 'rgba(170,30,25,.9)', 20); }
    if (e.kind === 'ducks') { for (let k = 0; k < 6; k++) { const qx = SX + S(160) + k * S(52); duck(qx, contactY(meterAt(qx)) - (k % 2) * S(12), T, k); } tag(SX + S(290), contactY(cam) - S(110), e.user, 'rgba(170,30,25,.9)', 20); }
    if (e.kind === 'tow') {
      const a = Math.min(1, e.t / 0.5, (e.dur - e.t) / 0.4);
      const h = towTruck(SX + S(260), meterAt(SX + S(400)), e.user, clamp(a, 0, 1));
      ctx.strokeStyle = `rgba(60,60,60,${clamp(a, 0, 1)})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(h.hx, h.hy); ctx.quadraticCurveTo(SX + S(170), cy - S(100), SX + S(80), cy - S(70)); ctx.stroke();
    }
    if (e.kind === 'convoy') {
      const a = clamp(Math.min(e.t / 0.6, (e.dur - e.t) / 0.6), 0, 1);
      ctx.save(); ctx.globalAlpha = a;
      [[-210, '#2f7de2'], [-400, '#22b35e'], [-590, '#ff6fae']].forEach(([ox, c], k) => {
        const bx = SX + S(ox) + Math.sin(T * 2 + k) * S(24);
        scooter(bx, contactY(meterAt(bx)) - S(16), { color: c, scale: VS * 0.8, rot: wheelRot, gifts: false, shirt: '#333', helmet: '#fff', face: k === 0 ? e.user : null });
      });
      tag(SX - S(200), contactY(cam) - S(190), e.user, 'rgba(10,120,60,.92)', 20);
      ctx.restore();
    }
  }
  const walking = game.walking && game.phase === 'race';
  const lose = game.phase === 'result' && game.result && game.result.winner === 'pha';
  // nitro / trực thăng: lửa pô
  if (game.effects.some(e => e.kind === 'nitro') || (x && x.kind === 'heli' && x.stage === 'fly')) {
    for (let k = 0; k < 3; k++) { ctx.fillStyle = ['#ffd23a', '#ff7a2f', '#e8322c'][k]; ctx.beginPath(); ctx.ellipse(SX - S(120) - k * S(30) - Math.random() * S(24), cy - S(34), S(46 - k * 8), S(13 - k * 2), 0, 0, Math.PI * 2); ctx.fill(); }
  }
  scooter(SX, cy, { color: BIKES[VIEW.bike] || BIKES.red, rot: wheelRot, ang, rider: lose ? 'none' : walking ? 'walk' : 'ride' });
  if (lose) { const bx = SX - S(190); trashBin(bx, contactY(meterAt(bx)), 0.6); ctx.save(); ctx.translate(bx, contactY(cam) - S(100)); ctx.scale(VS, VS); head(0, -30, '#ffcf33', '#ffd3ad', {}); ctx.restore(); }
  tag(SX, cy - S(260), { name: VIEW.streamerName }, 'rgba(190,110,0,.94)', 24);
  // mũ bảo hiểm: lá chắn vàng
  if (game.shield > 0 && game.phase === 'race') {
    ctx.save(); ctx.globalAlpha = 0.35 + Math.sin(T * 5) * 0.1; ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(SX, cy - S(110), S(170), S(150), 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  // mưa
  const rain = game.effects.find(e => e.kind === 'rain');
  if (rain) {
    ctx.fillStyle = 'rgba(20,30,50,.18)'; ctx.fillRect(0, 0, W, H);
    cloud(SX, cy - S(460), VS * 1.3, true);
    ctx.strokeStyle = 'rgba(190,215,255,.7)'; ctx.lineWidth = 2;
    for (let k = 0; k < 50; k++) { const rx = SX - S(280) + hash(k, 80) * S(560), ry = cy - S(420) + ((T * 900 + hash(k, 81) * 500) % S(440)); ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 6, ry + 22); ctx.stroke(); }
    tag(SX, cy - S(560), rain.user, 'rgba(170,30,25,.9)', 20);
  }
  // trực thăng + dây
  if (x && x.kind === 'heli') {
    const hx = x.stage === 'enter' ? lerp(W + 200, SX, ease(x.t)) : x.stage === 'leave' ? lerp(SX, W + 300, ease(x.t / 0.8)) : SX + Math.sin(T * 2) * S(24);
    const hy = x.stage === 'leave' ? lerp(cy - S(440), 300, ease(x.t / 0.8)) : cy - S(440);
    if (x.stage !== 'leave') { ctx.strokeStyle = '#444'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hx, hy + S(60)); ctx.lineTo(SX, cy - S(230)); ctx.stroke(); }
    heli(hx, hy, x.user, T);
  }
  // lốc xoáy
  if (x && x.kind === 'tornado') {
    const a = x.stage === 'leave' ? 1 - x.t / 0.8 : Math.min(1, x.t * 2);
    tornado(SX + (x.stage === 'leave' ? x.t * 500 : 0), contactY(cam), T, clamp(a, 0, 1));
    if (x.stage === 'enter') tag(SX, contactY(cam) - S(560), x.user, 'rgba(170,30,25,.9)', 22);
  }
  // bụi bánh xe
  if (game.speed > 0 && Math.random() < 0.6 && lift < 5) fx.push({ k: 'dust', x: SX - S(80), y: contactY(cam) - S(10), t: 0, dur: 0.6 });
  if (game.fuelAlarm && Math.random() < 0.2) fx.push({ k: 'dust', x: SX - S(100), y: cy - S(40), t: 0, dur: 1 });
  drawFx();
  ctx.restore();
}

// ---------------- vòng lặp ----------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
  tick(dt);
  requestAnimationFrame(frame);
}
function tick(dt) {
  T += dt;
  if (demo) demoTick(dt);
  game.step(dt);
  onEvents(game.drainEvents());
  stepFx(dt);
  render(dt);
  updateHud(dt);
  if (game.phase !== 'result') $('result').classList.add('hidden');
}
requestAnimationFrame(frame);

// ---------------- người xem ảo (demo) ----------------
let demo = Q.get('demo') === '1', demoT = 0;
const NAMES = ['Minh Anh', 'Tuấn Kiệt', 'Bé Na', 'Hoàng Long', 'Thu Hà', 'Út Mập', 'Khánh Vy', 'Anh Ba', 'Mai Linh', 'Quốc Bảo', 'Ngọc Trâm', 'Chú Tư'];
const COINS = [1, 1, 1, 1, 5, 5, 5, 10, 30, 30, 100, 199, 500, 1000];
function demoTick(dt) {
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
function onAppCmd(d) {
  if (!d || d.gameId !== 'duongveque') return;
  const p = d.payload || {};
  if (d.cmd === 'demo') demo = !!p.on;
  else if (d.cmd === 'start') game.input('start');
  else if (d.cmd === 'reset') { game.reset(); followFlags.length = 0; banner('🧹 Đã làm mới', '', 1500); }
  else if (d.cmd === 'end') game.forceEnd(p.winner);
  else if (d.cmd === 'key' && typeof p.action === 'string') game.input(p.action);
  else if (d.cmd === 'test') {
    const name = p.name || NAMES[Math.floor(Math.random() * NAMES.length)];
    const u = { id: `test_${name}`, name, avatar: '' };
    if (p.kind === 'gift') game.gift(u, { action: p.action, coins: Number(p.coins) || ACTION_BY_ID[p.action]?.min || 1, count: Number(p.count) || 1, giftId: p.giftId, giftName: p.giftName }, VIEW.giftMap);
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
  window.__dvq.step(Number(Q.get('warp')) || 0);
  for (const a of String(Q.get('act') || '').split(',').filter(Boolean)) {
    const [action, coins] = a.split(':');
    window.__dvq.sim('gift', { action, coins: Number(coins) || ACTION_BY_ID[action]?.min || 1, name: action === 'container' || action === 'tornado' ? 'Út Mập' : 'Minh Anh' });
  }
  window.__dvq.step(Number(Q.get('after')) || 0);
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
};
