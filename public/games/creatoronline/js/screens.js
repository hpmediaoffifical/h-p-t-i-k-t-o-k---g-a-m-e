/**
 * Canvas drawings for every in-world screen: door signs, LED walls, comment
 * boards, monitors, karaoke TVs, game screens, the lucky wheel and the
 * leaderboard. Each draw call ends by flagging the texture for upload.
 */
import { topFans, pkShare, memberCount } from './logic/rooms.js';
import { formatThousands } from './logic/format.js';

const FONT = "'Baloo 2', system-ui, sans-serif";

function done(scr) {
  scr.tex.needsUpdate = true;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Draw text clipped to maxW with an ellipsis. */
function fitText(ctx, text, x, y, maxW) {
  let s = String(text);
  if (ctx.measureText(s).width <= maxW) {
    ctx.fillText(s, x, y);
    return;
  }
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  ctx.fillText(s + '…', x, y);
}

const short = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

/** Door sign: "● LIVE  G1 · STARLIGHT · K-Pop Dance · 👁 120". */
export function drawSign(scr, room, state, genre, accent) {
  const { ctx, w, h } = scr;
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#12131c');
  g.addColorStop(1, '#1d1f2e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, w - 6, h - 6);
  ctx.fillStyle = '#ff2d55';
  rr(ctx, 14, h * 0.22, h * 1.15, h * 0.56, 10);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `900 ${Math.round(h * 0.32)}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText('LIVE', 14 + h * 0.575, h * 0.51);
  ctx.textAlign = 'left';
  ctx.font = `900 ${Math.round(h * 0.36)}px ${FONT}`;
  const x = 30 + h * 1.15;
  ctx.fillStyle = accent;
  ctx.fillText(room.id, x, h * 0.36);
  const idW = ctx.measureText(room.id + '  ').width;
  ctx.fillStyle = '#fff';
  fitText(ctx, state.title, x + idW, h * 0.36, w - x - idW - 16);
  ctx.font = `800 ${Math.round(h * 0.24)}px ${FONT}`;
  ctx.fillStyle = '#c9cfe6';
  const info = state.seatLine ? `${state.seatLine} · ${genre}` : `${genre} · 👁 ${short(state.viewers)} · ❤ ${short(state.hearts)}`;
  fitText(ctx, info, x, h * 0.74, w - x - 16);
  done(scr);
}

/** Big LED wall behind a group stage. */
export function drawLed(scr, room, state, genre, cols, beat, t, pk, rooms) {
  const { ctx, w, h } = scr;
  const pulse = Math.pow(1 - (beat % 1), 2);
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, cols[0]);
  bg.addColorStop(0.5, '#0b0b14');
  bg.addColorStop(1, cols[1 % cols.length]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  // moving diagonal stripes
  ctx.save();
  ctx.globalAlpha = 0.18 + pulse * 0.2;
  ctx.fillStyle = '#fff';
  const off = (t * 60) % 80;
  for (let x = -h; x < w + h; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x + off, 0);
    ctx.lineTo(x + off + 26, 0);
    ctx.lineTo(x + off + 26 - h, h);
    ctx.lineTo(x + off - h, h);
    ctx.fill();
  }
  ctx.restore();
  // equalizer
  const bars = 32;
  for (let i = 0; i < bars; i++) {
    const v = 0.25 + 0.75 * Math.abs(Math.sin(i * 0.7 + t * 3.1 + Math.sin(i * 1.3 + beat * Math.PI)) * (0.6 + pulse * 0.4));
    ctx.fillStyle = cols[i % cols.length];
    const bw = w / bars;
    ctx.fillRect(i * bw + 2, h - 30 - v * 70, bw - 4, v * 70);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = cols[0];
  ctx.shadowBlur = 18;
  ctx.font = `900 ${54 + pulse * 6}px ${FONT}`;
  ctx.fillText(state.title, w / 2, 78);
  ctx.shadowBlur = 0;
  ctx.font = `800 20px ${FONT}`;
  ctx.fillText(`${genre} · ${memberCount(state)} thành viên · 👁 ${short(state.viewers)}`, w / 2, 118);
  // ticker
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, h - 28, w, 28);
  ctx.fillStyle = '#ffd23f';
  ctx.font = `800 16px ${FONT}`;
  const lg = state.lastGift;
  const tick = lg ? `🎁 ${lg.from} tặng ${lg.icon ?? ''} ${lg.name ?? ''} x${lg.count}   ❤ ${formatThousands(state.hearts)} tim   💰 ${formatThousands(state.giftTotal)} xu` : `❤ ${formatThousands(state.hearts)} tim · Tặng quà để chọn MC, Kỹ thuật, Quản lý!`;
  ctx.fillText(tick, w / 2, h - 14);

  if (pk) drawPkBar(ctx, w, pk, rooms, 8);
  done(scr);
}

function drawPkBar(ctx, w, pk, rooms, y) {
  const share = pkShare(pk);
  const left = rooms.get(pk.a);
  const right = rooms.get(pk.b);
  const bw = w - 40;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  rr(ctx, 14, y, w - 28, 40, 12);
  ctx.fill();
  ctx.fillStyle = '#ff3b6b';
  rr(ctx, 20, y + 6, bw * share, 18, 8);
  ctx.fill();
  ctx.fillStyle = '#35a0ff';
  rr(ctx, 20 + bw * share, y + 6, bw * (1 - share), 18, 8);
  ctx.fill();
  ctx.font = `900 13px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.fillText(`${left?.title ?? pk.a} ${formatThousands(pk.scoreA)}`, 26, y + 15);
  ctx.textAlign = 'right';
  ctx.fillText(`${formatThousands(pk.scoreB)} ${right?.title ?? pk.b}`, w - 26, y + 15);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23f';
  ctx.fillText(`⚔ PK · còn ${Math.ceil(pk.left / 1000)}s`, w / 2, y + 32);
}

/** Comment board (right wall of group stages). */
export function drawBoard(scr, state, accent) {
  const { ctx, w, h } = scr;
  ctx.fillStyle = '#0f1019';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, w, 34);
  ctx.fillStyle = '#fff';
  ctx.font = `900 18px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('💬 BÌNH LUẬN TRỰC TIẾP', 12, 18);
  const list = state.comments.slice(-6);
  let y = 50;
  ctx.font = `800 14px ${FONT}`;
  for (const c of list) {
    ctx.fillStyle = c.kind === 'self' ? 'rgba(255,210,63,0.18)' : c.kind === 'answered' ? 'rgba(59,227,143,0.18)' : 'rgba(255,255,255,0.06)';
    rr(ctx, 8, y - 12, w - 16, 26, 8);
    ctx.fill();
    ctx.fillStyle = c.kind === 'self' ? '#ffd23f' : '#8fe3ff';
    const name = `${c.name}: `;
    ctx.fillText(name, 14, y + 1);
    const nw = ctx.measureText(name).width;
    ctx.fillStyle = '#fff';
    fitText(ctx, c.text, 14 + nw, y + 1, w - 30 - nw);
    y += 30;
  }
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, h - 44, w, 44);
  ctx.fillStyle = '#ffd23f';
  ctx.font = `900 13px ${FONT}`;
  const fans = topFans(state, 3);
  const line = fans.length ? fans.map((f, i) => `${['🥇', '🥈', '🥉'][i]} ${f.name} ${short(f.value)}`).join('  ') : 'Chưa có top fan — tặng quà để lên bảng!';
  fitText(ctx, line, 10, h - 22, w - 20);
  done(scr);
}

/** Placeholder "live camera" for group TVs that are not rendering a real feed. */
export function drawTvFallback(scr, state, accent, t) {
  const { ctx, w, h } = scr;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1a1b2c');
  g.addColorStop(1, '#09090f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = accent;
  for (let i = 0; i < 5; i++) {
    const x = w * (0.2 + i * 0.15);
    const y = h * 0.62 + Math.sin(t * 4 + i) * 6;
    ctx.beginPath();
    ctx.arc(x, y - 30, 16, 0, Math.PI * 2);
    ctx.fill();
    rr(ctx, x - 12, y - 12, 24, 40, 8);
    ctx.fill();
  }
  drawLiveBadge(ctx, state);
  done(scr);
}

function drawLiveBadge(ctx, state) {
  ctx.fillStyle = '#ff2d55';
  rr(ctx, 10, 10, 64, 26, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `900 15px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LIVE', 42, 24);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  rr(ctx, 80, 10, 96, 26, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(`👁 ${short(state.viewers)}`, 90, 24);
}

/** Tech mixer desk surface. */
export function drawMixer(scr, t, accent) {
  const { ctx, w, h } = scr;
  ctx.fillStyle = '#16171f';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 12; i++) {
    const x = 10 + i * 20;
    ctx.fillStyle = '#2a2c38';
    ctx.fillRect(x + 6, 14, 4, 70);
    const v = 0.5 + 0.4 * Math.sin(t * 1.3 + i);
    ctx.fillStyle = i % 3 === 0 ? accent : '#d9dce6';
    ctx.fillRect(x, 14 + (1 - v) * 60, 16, 8);
  }
  done(scr);
}

/** Back-wall colour wash thrown by the middle overhead light (one fixed colour per room). */
export function drawWash(scr, color, streamer) {
  const { ctx, w, h } = scr;
  ctx.fillStyle = '#1d1b26';
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w / 2, h * 0.38, 4, w / 2, h * 0.45, w * 0.62);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.12, color);
  g.addColorStop(0.55, color + '88');
  g.addColorStop(1, 'rgba(29,27,38,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 22px ${FONT}`;
  fitText(ctx, streamer, w / 2, h * 0.86, w - 30);
  done(scr);
}

/** Streamer's interactive PC monitor: comments + hearts + a type-specific widget. */
export function drawMonitor(scr, room, state, genre, t) {
  const { ctx, w, h } = scr;
  ctx.fillStyle = '#0d0e16';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1b1d2b';
  ctx.fillRect(0, 0, w, 24);
  ctx.fillStyle = '#ff2d55';
  ctx.beginPath();
  ctx.arc(12, 12, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `900 12px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  fitText(ctx, `${state.streamer} · ${genre}`, 22, 12, w - 90);
  ctx.textAlign = 'right';
  ctx.fillText(`👁${short(state.viewers)} ❤${short(state.hearts)}`, w - 6, 12);
  ctx.textAlign = 'left';
  // widget
  const wx = w * 0.58;
  ctx.fillStyle = '#171927';
  ctx.fillRect(wx, 28, w - wx - 4, h - 32);
  const key = state.genre;
  ctx.font = `900 13px ${FONT}`;
  ctx.fillStyle = '#ffd23f';
  if (key === 'sale') {
    ctx.fillText('🛒 ĐƠN HÀNG', wx + 6, 42);
    ctx.fillStyle = '#fff';
    ctx.font = `900 30px ${FONT}`;
    ctx.fillText(String(120 + (state.giftTotal % 900)), wx + 6, 80);
    ctx.font = `800 11px ${FONT}`;
    ctx.fillText('Mã: CREATOR26', wx + 6, 110);
  } else if (key === 'tarot') {
    ctx.fillText('🔮 LÁ BÀI', wx + 6, 42);
    const flip = Math.abs(Math.sin(t * 0.5));
    ctx.fillStyle = '#7a5cff';
    rr(ctx, wx + 20 + (1 - flip) * 18, 52, 40 * flip + 1, 64, 6);
    ctx.fill();
  } else if (key === 'news') {
    ctx.fillText('📰 TIN NÓNG', wx + 6, 42);
    ctx.fillStyle = '#fff';
    ctx.font = `800 11px ${FONT}`;
    const items = ['Thời tiết đẹp', 'Giá vàng nhích', 'Trend mới', 'Bóng đá tối nay'];
    items.forEach((s, i) => ctx.fillText(`• ${s}`, wx + 6, 62 + i * 18));
  } else if (key === 'comedy') {
    ctx.fillText('😂 CƯỜI', wx + 6, 42);
    ctx.font = `900 36px ${FONT}`;
    ctx.fillText(['😂', '🤣', '😆', '😹'][Math.floor(t) % 4], wx + 20, 90);
  } else if (room.type === 'sing') {
    ctx.fillText('🎵 BÀI HÁT', wx + 6, 42);
    ctx.fillStyle = '#fff';
    ctx.font = `800 11px ${FONT}`;
    fitText(ctx, state.song ?? '—', wx + 6, 62, w - wx - 14);
    for (let i = 0; i < 10; i++) {
      const v = Math.abs(Math.sin(t * 4 + i));
      ctx.fillStyle = '#ff6fb5';
      ctx.fillRect(wx + 6 + i * 9, 120 - v * 36, 6, v * 36);
    }
  } else {
    ctx.fillText('💬 TÂM SỰ', wx + 6, 42);
    ctx.fillStyle = '#fff';
    ctx.font = `800 11px ${FONT}`;
    ctx.fillText(`${formatThousands(state.hearts)} tim`, wx + 6, 62);
    ctx.fillText(`${formatThousands(state.giftTotal)} xu quà`, wx + 6, 80);
  }
  // comments
  ctx.font = `800 11px ${FONT}`;
  let y = 40;
  for (const c of state.comments.slice(-6)) {
    ctx.fillStyle = c.kind === 'self' ? '#ffd23f' : '#8fe3ff';
    const n = `${c.name}: `;
    ctx.fillText(n, 6, y);
    ctx.fillStyle = '#e8eaf2';
    fitText(ctx, c.text, 6 + ctx.measureText(n).width, y, wx - 12 - ctx.measureText(n).width);
    y += 19;
  }
  done(scr);
}

/** Karaoke TV for singing rooms. */
export function drawLyrics(scr, state, genre, beat, t, hue) {
  const { ctx, w, h } = scr;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, `hsl(${hue},55%,22%)`);
  g.addColorStop(1, '#0b0b14');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // floating notes
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.font = `900 22px ${FONT}`;
  for (let i = 0; i < 7; i++) {
    const x = (i * 61 + t * 18) % (w + 40) - 20;
    const y = 40 + ((i * 37) % 90) + Math.sin(t * 2 + i) * 8;
    ctx.fillText(i % 2 ? '♪' : '♫', x, y);
  }
  drawLiveBadge(ctx, state);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd23f';
  ctx.font = `900 18px ${FONT}`;
  fitText(ctx, `🎤 ${state.song ?? genre}`, w / 2, 62, w - 30);
  // lyric line with progress highlight (dots stand in for lyrics)
  const words = ['La', 'la', 'lá', 'la', 'là', 'la', 'la', 'lá'];
  const line = words.join(' ');
  ctx.font = `900 30px ${FONT}`;
  const lw = ctx.measureText(line).width;
  const x0 = (w - lw) / 2;
  const prog = (beat % 8) / 8;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(line, x0, h * 0.6);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, h * 0.6 - 24, lw * prog, 48);
  ctx.clip();
  ctx.fillStyle = '#ff6fb5';
  ctx.fillText(line, x0, h * 0.6);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.font = `800 14px ${FONT}`;
  ctx.fillStyle = '#c9cfe6';
  ctx.fillText(`${genre} · ${state.streamer}`, w / 2, h * 0.78);
  const last = state.comments[state.comments.length - 1];
  if (last) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, h - 28, w, 28);
    ctx.fillStyle = '#8fe3ff';
    fitText(ctx, `💬 ${last.name}: ${last.text}`, w / 2, h - 14, w - 20);
  }
  done(scr);
}

/** Simulated gameplay for game rooms. */
export function drawGame(scr, state, genre, t) {
  const { ctx, w, h } = scr;
  const k = state.genre;
  if (k === 'racing') {
    ctx.fillStyle = '#5ac8ff';
    ctx.fillRect(0, 0, w, h / 2);
    ctx.fillStyle = '#3aa35a';
    ctx.fillRect(0, h / 2, w, h / 2);
    ctx.fillStyle = '#3a3a44';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 12, h / 2);
    ctx.lineTo(w / 2 + 12, h / 2);
    ctx.lineTo(w * 0.95, h);
    ctx.lineTo(w * 0.05, h);
    ctx.fill();
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 6; i++) {
      const p = ((i / 6 + t * 1.2) % 1);
      const y = h / 2 + p * p * (h / 2);
      ctx.fillRect(w / 2 - 2 - p * 6, y, 4 + p * 12, 4 + p * 14);
    }
    const sway = Math.sin(t * 1.7) * 40;
    ctx.fillStyle = '#ff3b3b';
    rr(ctx, w / 2 - 40 + sway, h - 70, 80, 40, 10);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.fillRect(w / 2 - 44 + sway, h - 40, 18, 12);
    ctx.fillRect(w / 2 + 26 + sway, h - 40, 18, 12);
  } else if (k === 'battle') {
    ctx.fillStyle = '#6d9a4a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5a8a3c';
    for (let i = 0; i < 20; i++) ctx.fillRect((i * 53) % w, (i * 31) % h, 30, 18);
    const r = 40 + 70 * (state.match ? state.match.alive / 50 : 1);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w / 2 + Math.sin(t * 0.2) * 20, h / 2, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(80,120,255,0.25)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(w / 2 + Math.cos(t) * 18, h / 2 + Math.sin(t * 1.3) * 14, 7, 0, Math.PI * 2);
    ctx.fill();
  } else if (k === 'moba') {
    ctx.fillStyle = '#244a2e';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c9b27a';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(20, h - 20);
    ctx.lineTo(w - 20, 20);
    ctx.moveTo(20, h - 20);
    ctx.lineTo(20, 20);
    ctx.lineTo(w - 20, 20);
    ctx.moveTo(20, h - 20);
    ctx.lineTo(w - 20, h - 20);
    ctx.lineTo(w - 20, 20);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const p = (t * 0.1 + i / 6) % 1;
      ctx.fillStyle = i % 2 ? '#35a0ff' : '#ff3b3b';
      ctx.beginPath();
      ctx.arc(20 + (w - 40) * p, h - 20 - (h - 40) * p, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (k === 'craft') {
    ctx.fillStyle = '#8fd3ff';
    ctx.fillRect(0, 0, w, h);
    const size = 24;
    for (let x = 0; x < w; x += size) {
      const top = h * 0.55 + Math.round(Math.sin(x * 0.05 + t * 0.2) * 2) * size;
      ctx.fillStyle = '#5cb84a';
      ctx.fillRect(x, top, size, size);
      ctx.fillStyle = '#8a5a34';
      ctx.fillRect(x, top + size, size, h - top);
    }
    ctx.fillStyle = '#ffe066';
    ctx.fillRect(w - 70, 20, 36, 36);
  } else {
    // horror
    const flick = Math.random() < 0.08 ? 0.6 : 0.15;
    ctx.fillStyle = `rgba(30,30,40,1)`;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = `rgba(220,220,180,${flick})`;
    ctx.beginPath();
    ctx.moveTo(w * 0.35, h * 0.2);
    ctx.lineTo(w * 0.65, h * 0.2);
    ctx.lineTo(w * 0.95, h);
    ctx.lineTo(w * 0.05, h);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.fillRect(w * 0.44, h * 0.28, w * 0.12, h * 0.3);
    if (Math.sin(t * 0.7) > 0.97) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 40, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // HUD overlay
  drawLiveBadge(ctx, state);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = `900 15px ${FONT}`;
  const m = state.match;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  rr(ctx, w - 190, 10, 180, 26, 8);
  ctx.fill();
  ctx.fillStyle = '#ffd23f';
  if (m) {
    const label = m.result ? (m.result === 'win' ? '🏆 TOP 1!' : '💀 Bị loại') : `Trận #${m.no} · còn ${m.alive}`;
    ctx.fillText(label, w - 18, 23);
  } else ctx.fillText(genre, w - 18, 23);
  ctx.textAlign = 'left';
  const last = state.comments[state.comments.length - 1];
  if (last) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, h - 26, w, 26);
    ctx.fillStyle = '#8fe3ff';
    ctx.font = `800 13px ${FONT}`;
    fitText(ctx, `💬 ${last.name}: ${last.text}`, 8, h - 13, w - 16);
  }
  done(scr);
}

/** Lucky wheel face. */
export function drawWheel(scr, segments) {
  const { ctx, w } = scr;
  const c = w / 2;
  const n = segments.length;
  const palette = ['#ff4fa3', '#7a5cff', '#35d0ff', '#3be38f', '#ffd23f', '#ff7a2f', '#ff3b6b', '#9b5cff'];
  ctx.clearRect(0, 0, w, w);
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2) / n;
    ctx.fillStyle = palette[i % palette.length];
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, c - 6, a0, a1);
    ctx.fill();
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate((a0 + a1) / 2);
    ctx.fillStyle = '#fff';
    ctx.font = `900 30px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(segments[i].label, c - 26, 0);
    ctx.restore();
  }
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(c, c, c - 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#1b1c26';
  ctx.beginPath();
  ctx.arc(c, c, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd23f';
  ctx.font = `900 22px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('QUAY', c, c);
  done(scr);
}

/** Leaderboard on the east wall. */
export function drawLeaderboard(scr, states, pk, profile, fanRank) {
  const { ctx, w, h } = scr;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#1d1340');
  g.addColorStop(1, '#0b0b16');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 34px ${FONT}`;
  ctx.fillText('🏆 BẢNG XẾP HẠNG LIVE', w / 2, 34);
  const list = [...states.values()].sort((a, b) => b.giftTotal - a.giftTotal || b.hearts - a.hearts).slice(0, 8);
  ctx.textAlign = 'left';
  ctx.font = `800 20px ${FONT}`;
  list.forEach((s, i) => {
    const y = 80 + i * 30;
    ctx.fillStyle = i < 3 ? '#ffd23f' : '#c9cfe6';
    ctx.fillText(`${i + 1}. ${s.id}`, 24, y);
    ctx.fillStyle = '#fff';
    fitText(ctx, s.title, 110, y, 260);
    ctx.fillStyle = '#ff6fb5';
    ctx.textAlign = 'right';
    ctx.fillText(`${formatThousands(s.giftTotal)} xu`, 470, y);
    ctx.textAlign = 'left';
  });
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  rr(ctx, 488, 64, w - 500, 240, 14);
  ctx.fill();
  ctx.fillStyle = '#8fe3ff';
  ctx.font = `900 18px ${FONT}`;
  ctx.fillText('BẠN', 500, 88);
  ctx.fillStyle = '#fff';
  ctx.font = `800 15px ${FONT}`;
  fitText(ctx, profile.name, 500, 116, w - 520);
  ctx.fillText(fanRank, 500, 142);
  ctx.fillText(`🎁 ${formatThousands(profile.gifted)} xu`, 500, 168);
  ctx.fillText(`❤ ${formatThousands(profile.hearts)} tim`, 500, 194);
  ctx.fillText(`💰 ${formatThousands(profile.coins)} xu`, 500, 220);
  if (pk) {
    ctx.fillStyle = '#ffd23f';
    ctx.font = `900 15px ${FONT}`;
    ctx.fillText('⚔ ĐANG PK', 500, 256);
    ctx.fillStyle = '#fff';
    ctx.fillText(`${pk.a} vs ${pk.b}`, 500, 280);
  }
  ctx.fillStyle = '#c9cfe6';
  ctx.textAlign = 'center';
  ctx.font = `800 14px ${FONT}`;
  ctx.fillText('Tặng quà để đưa phòng yêu thích lên top! Vòng quay may mắn ở sảnh Tây.', w / 2, h - 22);
  done(scr);
}

export function drawLabel(scr, text, bg = '#7a5cff') {
  const { ctx, w, h } = scr;
  ctx.fillStyle = bg;
  rr(ctx, 0, 0, w, h, 14);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `900 ${Math.round(h * 0.5)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);
  done(scr);
}
