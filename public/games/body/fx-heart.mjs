// overlays/camgames/body/fx-heart.mjs - 💗 BẮN TIM (lớp phủ của 🧍 Bộ Tách Người): người tặng quà (mặc định Heart Me) → NPC đưa tay
// hình trái tim → avatar tròn của người tặng hiện TRÊN bàn tay + trái tim bay lên.
//
// Nhận diện: overlay chạy MediaPipe HandLandmarker (hp-tracking.mjs) trên ô vuông quanh nửa trên người, đổi về toạ độ sân khấu của
// NGƯỜI ĐANG VẼ rồi nhận cử chỉ bằng HpBody.detectHeart (core.cjs) - mô-đun này chỉ gọi env.gesture(poses). Không giữ hàng chờ
// (overlay.html giữ: hQueue / heart, hàng 📋, mp3).
//
// Một lượt:
//   wait   - ô gợi ý "Bắn tim cho @tên" + vòng đếm ngược waitSec (chỉ đếm khi model tay đã nạp). Thấy tim giữ ≥ HOLD → show;
//            hết giờ → expire (mờ 0,35 s) → lượt MẤT HIỆU LỰC (result 'expired'), overlay chuyển người kế.
//   show   - avatar bật ra (nảy) trên chỗ chéo ngón (🫰) / trong lòng tim (🫶), bám tay mượt; tim bay lên lắc lư; durSec giây (combo
//            cùng người: dài thêm + tim dày hơn); cuối lượt mờ FADE, chờ tim bay hết.
//   fly    - 🤾 VUNG TAY NÉM (sc.fling): avatar dính theo lòng bàn tay (cả lúc tay đã rời hình tim); tay vung đủ nhanh → avatar
//            văng theo đúng hướng vung, vận tốc theo độ mạnh (trọng lực + cản gió + xoay + bóng mờ đuôi) - hất lên bay vút khỏi
//            khung, hất nhẹ nảy lên rồi rơi. Ra khỏi khung (hoặc 3 s) → lượt xong. Vận tốc tay đo từ env.hands() (toạ độ + mốc giờ).
// Lượt hành động (Rơi Hố / Bị Đuổi / 🎬) đang vẽ lại người → paused: giữ đồng hồ, không vẽ.
//
//   const heart = createHeart({ ctx, W, H, gesture: poses => g | null, ready: () => bool, failed: () => bool,
//                               view?: () => { x, y, w, h }, waiting?: () => số lượt đang chờ, onShow?: () => void,
//                               hands?: () => { at: ms kết quả tay, list: [{ pts }] } (cho 🤾 vung tay ném) });
//   heart.start({ script, units, user: { name, avatar } }, now) · heart.extend(n) · heart.frame(now, dt, paused) → true khi xong
//   heart.stop() · heart.estMs() · heart.fx (phase 'wait' | 'expire' | 'show', result 'shown' | 'expired' | 'nomodel')

const TAU = Math.PI * 2;
const FADE = 0.6;                  // s - mờ cuối lượt (khớp HEART_FADE_MS ở core.cjs)
const HOLD = { finger: 0.6, hands: 0.3 };    // s - giữ tay hình tim theo kiểu tay (khớp HEART_HOLD_MS)
const MISS = 0.15;                 // s - mất tim ngắn hơn mức này vẫn tính là đang giữ
const NOMODEL_SEC = 30;            // model tay chưa nạp được sau ngần này (cộng waitSec) → bỏ lượt
const OUT = 0.35;                  // s - ô gợi ý mờ đi khi hết giờ
const MAX_HEARTS = 160;
// 🤾 Vung tay ném avatar. Tốc độ tay tính theo CỠ TAY / giây (xa gần cam đều như nhau): tay đi lại / NPC bước = 1-3, vung = 6-20.
const FLING = {
    MIN: 3.5,          // cỡ tay / s - vung nhanh hơn mức này mới ném (thử 2026-10-26, model tay thật trên ảnh 🫰 chuyển động:
                       // đứng yên ≤ 0,1 · bước ngang ≤ 1,2 · lắc tay lúc nói ≤ 2,2 · hất nhẹ 3,6-4 · hất mạnh 7+)
    MOVE: 0.35,        // cỡ tay - quãng tay đi trong cửa sổ đo (lọc rung điểm tay)
    WIN: 0.15,         // s - cửa sổ đo vận tốc tay (ngắn: bắt đúng đỉnh cú hất, không bị trung bình hoá)
    GAP: 0.4,          // s - vung nhanh thì model MẤT TAY giữa cú vung (nhoè), chỉ còn điểm trước + sau → nối 2 điểm cách nhau tới ngần này
    JUMP: 40,          // cỡ tay / s - điểm tay "nhảy" nhanh hơn thế = tay ma của khung nhoè (thử: lệch 335 px trong 50 ms) → bỏ
    LOST: 0.16,        // s - tay biến mất ngay sau cú vung (nhoè quá model không bắt) → ném theo vận tốc đo cuối
    ARM: 0.35,         // s - avatar hiện ít nhất ngần này mới ném được (đang nảy ra)
    GAIN: 1.5,         // vận tốc avatar = vận tốc tay × GAIN (hất cổ tay: vật bay nhanh hơn tay)
    VMAX: 3.6,         // trần vận tốc (× chiều cao khung / s)
    G: 0.95,           // trọng lực (× chiều cao khung / s²)
    DRAG: 0.35,        // cản gió (/ s)
    MAXT: 3,           // s - bay quá lâu (rơi chậm trong khung) thì mờ dần, xong
    GHOSTS: 4          // số bóng mờ đuôi
};
const FLING_SAMPLES = 12;
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, k) => a + (b - a) * k;
const rnd = (a, b) => a + Math.random() * (b - a);
const easeOut = t => 1 - (1 - t) * (1 - t);
const easeBack = t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
// 🌐 hpT(): ngôn ngữ chữ trên LIVE (overlays/lib/hp-i18n.js của trang overlay); thiếu thì giữ tiếng Việt.
const hpT = (s, v) => (globalThis.hpT ? globalThis.hpT(s, v) : String(s));

function hexRgb(h) { const n = parseInt(String(h || '#ff4d8d').slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const mix = (c, d, k) => [Math.round(lerp(c[0], d[0], k)), Math.round(lerp(c[1], d[1], k)), Math.round(lerp(c[2], d[2], k))];
const WHITE = [255, 255, 255], DARK = [60, 0, 25];

// Đường trái tim tâm (x, y), bề ngang s (đáy nhọn ở dưới).
function heartPath(ctx, x, y, s) {
    const p = (a, b) => [x + a * s, y + b * s];
    ctx.beginPath();
    ctx.moveTo(...p(0, 0.45));
    ctx.bezierCurveTo(...p(-0.15, 0.32), ...p(-0.5, 0.12), ...p(-0.5, -0.12));
    ctx.bezierCurveTo(...p(-0.5, -0.38), ...p(-0.2, -0.48), ...p(0, -0.26));
    ctx.bezierCurveTo(...p(0.2, -0.48), ...p(0.5, -0.38), ...p(0.5, -0.12));
    ctx.bezierCurveTo(...p(0.5, 0.12), ...p(0.15, 0.32), ...p(0, 0.45));
    ctx.closePath();
}
// Ảnh trái tim vẽ sẵn (gradient + viền sáng + chấm bóng) - tim bay vẽ bằng drawImage cho rẻ (trăm hạt / khung).
function heartSprite(col) {
    const S = 128, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d'), x = S / 2, y = S / 2 + 4, s = S * 0.92;
    const gr = g.createRadialGradient(x - s * 0.18, y - s * 0.2, s * 0.05, x, y, s * 0.62);
    gr.addColorStop(0, rgba(mix(col, WHITE, 0.55), 1)); gr.addColorStop(0.45, rgba(col, 1)); gr.addColorStop(1, rgba(mix(col, DARK, 0.35), 1));
    heartPath(g, x, y, s); g.fillStyle = gr; g.fill();
    g.lineWidth = S * 0.035; g.strokeStyle = 'rgba(255,255,255,0.75)'; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath(); g.ellipse(x - s * 0.24, y - s * 0.17, s * 0.09, s * 0.055, -0.6, 0, TAU); g.fill();
    return c;
}
function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function createHeart(env) {
    const { ctx, W, H } = env;
    const FULL = { x: 0, y: 0, w: W, h: H };
    const viewNow = () => (env.view && env.view()) || FULL;
    const imgs = new Map();            // url avatar → <img> (ảnh TikTok CDN - chỉ vẽ, không đọc pixel nên không cần CORS)
    let fx = null;
    let sprites = { key: '', list: [] };

    function avatarImg(url) {
        if (!url) return null;
        let im = imgs.get(url);
        if (!im) {
            im = new Image();
            im.referrerPolicy = 'no-referrer';
            im.decoding = 'async';
            im.src = url;
            imgs.set(url, im);
            if (imgs.size > 40) imgs.delete(imgs.keys().next().value);
        }
        return im.complete && im.naturalWidth > 0 ? im : null;
    }
    function spritesFor(color) {
        if (sprites.key === color) return sprites.list;
        const c = hexRgb(color);
        sprites = { key: color, list: [c, mix(c, WHITE, 0.35), mix(c, [255, 40, 70], 0.5), mix(c, [255, 140, 200], 0.5)].map(heartSprite) };
        return sprites.list;
    }

    function start({ script, units = 1, user = {} }, now) {
        const sc = script;
        fx = { sc, units: Math.max(1, units), user: { name: String(user.name || '').trim() || hpT('Khán giả'), avatar: String(user.avatar || '') },
            phase: 'wait', result: '', last: now, total: 0, wait: 0, hold: 0, miss: 0, t: 0, dur: sc.durSec, intro: 0,
            g: null, A: null, lostT: 0, acc: 0, hearts: [], col: hexRgb(sc.color), trk: null, fly: null };
        avatarImg(fx.user.avatar);      // nạp ảnh ngay lúc chờ - lúc tim hiện là có ảnh
        spritesFor(sc.color);
    }
    // Combo cùng người: lúc chờ chỉ cộng số (tim dày hơn khi hiện); lúc đang hiện kéo dài thêm nửa thời lượng mỗi lần (trần 3 ×).
    function extend(n) {
        if (!fx) return;
        fx.units += Math.max(1, n || 1);
        if (fx.phase === 'show') fx.dur = Math.min(fx.dur + 0.5 * fx.sc.durSec * Math.max(1, n || 1), fx.sc.durSec * 3);
    }
    function stop() { fx = null; }
    function estMs() {
        if (!fx) return 0;
        if (fx.fly) return Math.max(0, (FLING.MAXT - fx.fly.t + FADE) * 1000);
        if (fx.phase === 'show') return Math.max(0, (fx.dur - fx.t + FADE) * 1000);
        return Math.max(0, (fx.sc.waitSec - fx.wait + fx.sc.durSec + FADE) * 1000);
    }
    const mult = f => Math.min(3, 1 + 0.5 * (f.units - 1));

    // Cử chỉ → avatar (tâm, bán kính) + chỗ tim bay ra. 🫰: TRÊN chỗ chéo ngón · 🫶: TRONG lòng tim như khung ảnh (tim 2 tay hay làm
    // ở ngực - đặt trên đỉnh tim là che mặt NPC), tim bay ra quanh mép trên hình tim.
    function targetOf(f, g) {
        const k = f.sc.avatarSize / 100;
        if (g.pose === 'hands') {
            const R = Math.min(260, Math.max(44, g.r)) * k;
            return { x: g.x, y: g.y, R, ex: g.x, ey: g.y - R * 0.6, spread: Math.max(R * 1.3, 0.8 * g.size) };
        }
        const R = Math.min(260, Math.max(44, 0.62 * g.size)) * k, off = R + 0.3 * g.size;
        return { x: g.x + g.up.x * off, y: g.y + g.up.y * off, R, ex: g.x, ey: g.y - 0.15 * g.size, spread: Math.max(R * 1.1, 0.5 * g.size) };
    }
    function show(f) {
        f.phase = 'show'; f.result = 'shown'; f.t = 0; f.dur = Math.min(f.sc.durSec * (1 + 0.5 * (f.units - 1)), f.sc.durSec * 3);
        f.A = targetOf(f, f.g);
        f.trk = f.sc.fling && env.hands ? { at: -1, cx: f.g.x, cy: f.g.y, s: f.g.size, off: null, pts: [], lostT: 0, v: null } : null;
        const m = mult(f);
        for (let i = 0; i < Math.round(14 * Math.sqrt(m)); i++) spawn(f, true);
        try { env.onShow && env.onShow(); } catch (_) {}
    }
    function spawn(f, burst) {
        if (f.hearts.length >= MAX_HEARTS) return;
        const A = f.A, R = A.R, a = burst ? rnd(-Math.PI * 0.95, -Math.PI * 0.05) : -Math.PI / 2 + rnd(-0.35, 0.35);
        const sp = burst ? rnd(2.2, 4.2) * R : rnd(1.5, 2.5) * R;
        f.hearts.push({ x: A.ex + (burst ? rnd(-0.3, 0.3) * R : rnd(-1, 1) * A.spread), y: A.ey + rnd(-0.2, 0.2) * R,
            vx: Math.cos(a) * sp * (burst ? 1 : 0.35), vy: Math.sin(a) * sp, sway: rnd(0.25, 0.6) * R, swf: rnd(2.2, 4), ph: rnd(0, TAU),
            s: rnd(0.4, 0.75) * R, life: rnd(1.5, 2.4), age: 0, rot: rnd(-0.35, 0.35), spr: Math.floor(Math.random() * 4) });
    }
    function stepHearts(f, dt) {
        for (const h of f.hearts) {
            h.age += dt;
            h.vx *= 1 - Math.min(1, 2.2 * dt); h.vy *= 1 - Math.min(1, 0.35 * dt);
            h.x += (h.vx + Math.cos(h.age * h.swf + h.ph) * h.sway) * dt; h.y += h.vy * dt;
        }
        f.hearts = f.hearts.filter(h => h.age < h.life);
    }
    function drawHearts(f) {
        const list = spritesFor(f.sc.color);
        for (const h of f.hearts) {
            const k = h.age / h.life;
            const a = Math.min(1, h.age / 0.15) * (1 - clamp01((k - 0.55) / 0.45));
            if (a <= 0.01) continue;
            const s = h.s * (0.45 + 0.55 * easeOut(Math.min(1, h.age / 0.35)));
            ctx.save();
            ctx.globalAlpha = a;
            ctx.translate(h.x, h.y); ctx.rotate(h.rot + Math.sin(h.age * h.swf + h.ph) * 0.18);
            ctx.drawImage(list[h.spr], -s / 2, -s / 2, s, s);
            ctx.restore();
        }
    }
    // Avatar tròn: quầng hồng phát sáng + viền trắng + ảnh (không có ảnh → nền gradient + chữ cái đầu) + tim nhỏ đập ở góc.
    function drawAvatar(f, x, y, r, a, beat) {
        if (r <= 1 || a <= 0.01) return;
        const c = f.col, im = avatarImg(f.user.avatar);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.shadowColor = rgba(c, 0.9); ctx.shadowBlur = r * 0.5;
        const ring = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
        ring.addColorStop(0, rgba(mix(c, WHITE, 0.35), 1)); ring.addColorStop(1, rgba(mix(c, [230, 0, 60], 0.45), 1));
        ctx.beginPath(); ctx.arc(x, y, r * 1.14, 0, TAU); ctx.fillStyle = ring; ctx.fill();
        ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(x, y, r * 1.04, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
        if (im) {
            const iw = im.naturalWidth, ih = im.naturalHeight, k = Math.max(2 * r / iw, 2 * r / ih);
            ctx.drawImage(im, x - iw * k / 2, y - ih * k / 2, iw * k, ih * k);
        } else {
            const bg = ctx.createLinearGradient(x, y - r, x, y + r);
            bg.addColorStop(0, rgba(mix(c, WHITE, 0.45), 1)); bg.addColorStop(1, rgba(c, 1));
            ctx.fillStyle = bg; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
            ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(r * 0.95)}px "Segoe UI", system-ui, sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(Array.from(f.user.name)[0].toUpperCase(), x, y + r * 0.04);
        }
        ctx.restore();
        const list = spritesFor(f.sc.color), hs = r * 0.62 * (1 + 0.14 * beat);
        ctx.drawImage(list[0], x + r * 0.7 - hs / 2, y + r * 0.7 - hs / 2, hs, hs);
        ctx.restore();
    }
    function drawName(f, x, y, r, a) {
        if (!f.sc.showName || a <= 0.01) return;
        const fs = Math.round(Math.min(46, Math.max(16, r * 0.4)));
        let name = f.user.name;
        if (Array.from(name).length > 18) name = Array.from(name).slice(0, 17).join('') + '…';
        ctx.save();
        ctx.globalAlpha = a;
        ctx.font = `800 ${fs}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const w = ctx.measureText(name).width + fs * 1.1, h = fs * 1.55, cy = y - r * 1.14 - h * 0.7;
        roundRect(ctx, x - w / 2, cy - h / 2, w, h, h / 2);
        ctx.fillStyle = rgba(mix(f.col, DARK, 0.45), 0.88); ctx.fill();
        ctx.lineWidth = Math.max(2, fs * 0.08); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.fillText(name, x, cy + fs * 0.03);
        ctx.restore();
    }
    // Ô gợi ý lúc chờ (mép trên vùng thấy): mini avatar + vòng đếm ngược · "Bắn tim cho" · tên · số giây · +N người đang chờ.
    function drawHint(f, a, left, ready) {
        if (!f.sc.hint || a <= 0.01) return;
        const v = viewNow(), c = f.col;
        const h = Math.min(116, Math.max(64, v.w * 0.085)), rr = h * 0.36, pad = h * 0.16;
        const fs1 = Math.round(h * 0.22), fs2 = Math.round(h * 0.3), fs3 = Math.round(h * 0.3);
        let name = f.user.name;
        if (Array.from(name).length > 16) name = Array.from(name).slice(0, 15).join('') + '…';
        const line1 = hpT('Bắn tim cho'), secs = ready ? `${Math.max(0, Math.ceil(left))}s` : '…';
        ctx.save();
        ctx.font = `700 ${fs1}px "Segoe UI", system-ui, sans-serif`; const w1 = ctx.measureText(line1).width + fs1 * 1.1;
        ctx.font = `800 ${fs2}px "Segoe UI", system-ui, sans-serif`; const w2 = ctx.measureText(name).width;
        ctx.font = `800 ${fs3}px "Segoe UI", system-ui, sans-serif`; const w3 = ctx.measureText(secs).width + fs3 * 0.9;
        const waitN = env.waiting ? env.waiting() : 0, wq = waitN > 0 ? fs1 * 2.6 : 0;
        const w = pad + 2 * rr + pad * 1.2 + Math.max(w1, w2) + pad + w3 + wq + pad;
        const urgent = ready && left < 5;
        const pulse = 1 + (urgent ? 0.035 : 0.015) * Math.sin(f.total * (urgent ? 10 : 4));
        const cx = v.x + v.w / 2, cy = v.y + v.h * 0.06 + h / 2 - (1 - easeOut(Math.min(1, f.intro / 0.3))) * h;
        ctx.globalAlpha = a * Math.min(1, f.intro / 0.25);
        ctx.translate(cx, cy); ctx.scale(pulse, pulse);
        const x0 = -w / 2;
        ctx.shadowColor = rgba(c, 0.7); ctx.shadowBlur = h * 0.35;
        roundRect(ctx, x0, -h / 2, w, h, h / 2);
        ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = h * 0.045; ctx.strokeStyle = rgba(c, 0.95); ctx.stroke();
        // mini avatar + vòng đếm ngược
        const ax = x0 + pad + rr, frac = ready ? clamp01(left / f.sc.waitSec) : 1;
        const im = avatarImg(f.user.avatar);
        ctx.save();
        ctx.beginPath(); ctx.arc(ax, 0, rr * 0.86, 0, TAU); ctx.clip();
        if (im) { const iw = im.naturalWidth, ih = im.naturalHeight, k = Math.max(2 * rr / iw, 2 * rr / ih); ctx.drawImage(im, ax - iw * k / 2, -ih * k / 2, iw * k, ih * k); }
        else {
            ctx.fillStyle = rgba(c, 1); ctx.fillRect(ax - rr, -rr, 2 * rr, 2 * rr);
            ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(rr)}px "Segoe UI", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(Array.from(f.user.name)[0].toUpperCase(), ax, rr * 0.05);
        }
        ctx.restore();
        ctx.lineCap = 'round'; ctx.lineWidth = rr * 0.16;
        ctx.beginPath(); ctx.arc(ax, 0, rr, 0, TAU); ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.stroke();
        ctx.beginPath(); ctx.arc(ax, 0, rr, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.strokeStyle = urgent ? '#ff2d55' : rgba(c, 1); ctx.stroke();
        // chữ
        const tx = ax + rr + pad * 1.2, list = spritesFor(f.sc.color);
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.drawImage(list[0], tx, -h * 0.2 - fs1 * 0.5, fs1, fs1);
        ctx.font = `700 ${fs1}px "Segoe UI", system-ui, sans-serif`; ctx.fillStyle = rgba(mix(c, DARK, 0.4), 1);
        ctx.fillText(line1, tx + fs1 * 1.1, -h * 0.2);
        ctx.font = `800 ${fs2}px "Segoe UI", system-ui, sans-serif`; ctx.fillStyle = '#1d1320';
        ctx.fillText(name, tx, h * 0.16);
        // số giây
        const sx = tx + Math.max(w1, w2) + pad;
        roundRect(ctx, sx, -fs3 * 0.8, w3, fs3 * 1.6, fs3 * 0.8);
        ctx.fillStyle = urgent ? '#ff2d55' : rgba(c, 1); ctx.fill();
        ctx.font = `800 ${fs3}px "Segoe UI", system-ui, sans-serif`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
        ctx.fillText(secs, sx + w3 / 2, fs3 * 0.04);
        if (waitN > 0) {
            ctx.font = `700 ${fs1}px "Segoe UI", system-ui, sans-serif`; ctx.fillStyle = 'rgba(29,19,32,0.6)';
            ctx.fillText('+' + waitN, sx + w3 + wq / 2, fs1 * 0.04);
        }
        ctx.restore();
    }

    function frame(now, dt, paused) {
        const f = fx;
        if (!f) return true;
        const rdt = Math.min(0.1, Math.max(0, (now - f.last) / 1000));   // đồng hồ riêng (overlay kẹp dt ≤ 0,05 s)
        f.last = now;
        if (paused) return false;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
        try {
            if (f.phase === 'wait') {
                const ready = !!env.ready(), failed = !!(env.failed && env.failed());
                f.total += rdt; f.intro += rdt;
                if (ready) f.wait += rdt;
                if (failed || (!ready && f.total > NOMODEL_SEC + f.sc.waitSec)) { f.result = 'nomodel'; return true; }
                const g = ready ? env.gesture(f.sc.poses) : null;
                if (g) { f.hold += rdt; f.miss = 0; f.g = g; }
                else { f.miss += rdt; if (f.miss > MISS) f.hold = 0; }
                if (f.g && f.hold >= (HOLD[f.g.pose] || 0.3)) { show(f); return frameShow(f, 0); }
                if (f.wait >= f.sc.waitSec) { f.phase = 'expire'; f.t = 0; }
                drawHint(f, 1, f.sc.waitSec - f.wait, ready);
                return false;
            }
            if (f.phase === 'expire') {
                f.t += rdt; f.total += rdt;
                drawHint(f, 1 - f.t / OUT, 0, true);
                if (f.t >= OUT) { f.result = 'expired'; return true; }
                return false;
            }
            return frameShow(f, rdt);
        } finally { ctx.restore(); }
    }
    // 🤾 Bám lòng bàn tay (tâm cổ tay + 4 gốc ngón; 🫶 = trung bình 2 tay) theo từng KẾT QUẢ tay mới (mốc giờ của model, không phải
    // khung vẽ) → vận tốc tay trong cửa sổ WIN. Cỡ tay = max(cổ tay → gốc giữa, bề ngang lòng bàn tay / 0,8): tay chĩa về cam vẫn đúng.
    function palmOf(P) {
        const c = [0, 5, 9, 13, 17].reduce((a, i) => ({ x: a.x + P[i].x / 5, y: a.y + P[i].y / 5 }), { x: 0, y: 0 });
        c.s = Math.max(Math.hypot(P[9].x - P[0].x, P[9].y - P[0].y), Math.hypot(P[17].x - P[5].x, P[17].y - P[5].y) / 0.8);
        return c;
    }
    function trackHand(f, rdt) {
        const T = f.trk, h = env.hands();
        if (!h || !(h.at > T.at)) { T.lostT += rdt; return; }
        T.at = h.at;
        const palms = (h.list || []).filter(x => x && x.pts && x.pts.length >= 21).map(x => palmOf(x.pts))
            .map(p => ({ ...p, d: Math.hypot(p.x - T.cx, p.y - T.cy) })).filter(p => p.d < 3 * Math.max(T.s, p.s)).sort((a, b) => a.d - b.d);
        if (!palms.length) { T.lostT += rdt; return; }
        const use = f.g && f.g.pose === 'hands' && palms.length > 1 ? palms.slice(0, 2) : palms.slice(0, 1);
        const c = { x: use.reduce((a, p) => a + p.x, 0) / use.length, y: use.reduce((a, p) => a + p.y, 0) / use.length, s: use.reduce((a, p) => a + p.s, 0) / use.length };
        const prev = T.pts[T.pts.length - 1];
        if (prev && Math.hypot(c.x - prev.x, c.y - prev.y) / Math.max(0.04, h.at / 1000 - prev.t) > FLING.JUMP * T.s) { T.lostT += rdt; return; }
        T.cx = c.x; T.cy = c.y; T.s = lerp(T.s, c.s, 0.3); T.lostT = 0;
        T.pts.push({ t: h.at / 1000, x: c.x, y: c.y });
        if (T.pts.length > FLING_SAMPLES) T.pts.shift();
        // vận tốc: điểm mới nhất so với điểm cũ nhất còn trong cửa sổ WIN
        const last = T.pts[T.pts.length - 1], prev2 = T.pts[T.pts.length - 2];
        let first = T.pts.find(p => last.t - p.t <= FLING.WIN + 1e-6);
        if (first === last && prev2 && last.t - prev2.t <= FLING.GAP) first = prev2;
        const span = last.t - first.t;
        T.v = span >= 0.05 ? { x: (last.x - first.x) / span, y: (last.y - first.y) / span, move: Math.hypot(last.x - first.x, last.y - first.y) } : null;
    }
    function launch(f, v) {
        const k = FLING.GAIN, vmax = FLING.VMAX * H;
        let vx = v.x * k, vy = v.y * k;
        const sp = Math.hypot(vx, vy);
        if (sp > vmax) { vx *= vmax / sp; vy *= vmax / sp; }
        f.fly = { x: f.A.x, y: f.A.y, vx, vy, rot: 0, vr: vx / Math.max(40, f.A.R) * 0.45, t: 0, R: f.A.R, trail: [], acc: 0 };
        // tia tim bung ra ngược chiều ném (như lực đẩy) - mạnh thì nhiều hơn
        const n = Math.round(Math.min(18, 6 + Math.hypot(vx, vy) / H * 5));
        for (let i = 0; i < n; i++) {
            if (f.hearts.length >= MAX_HEARTS) break;
            const a = Math.atan2(-vy, -vx) + rnd(-0.9, 0.9), sp2 = rnd(0.6, 1.6) * f.A.R * 3;
            f.hearts.push({ x: f.A.x, y: f.A.y, vx: Math.cos(a) * sp2, vy: Math.sin(a) * sp2, sway: rnd(0.1, 0.3) * f.A.R, swf: rnd(2.2, 4), ph: rnd(0, TAU),
                s: rnd(0.3, 0.55) * f.A.R, life: rnd(0.8, 1.4), age: 0, rot: rnd(-0.35, 0.35), spr: Math.floor(Math.random() * 4) });
        }
    }
    function frameFly(f, rdt) {
        const F = f.fly, v = viewNow();
        F.t += rdt;
        F.trail.unshift({ x: F.x, y: F.y, rot: F.rot });
        if (F.trail.length > FLING.GHOSTS * 2) F.trail.length = FLING.GHOSTS * 2;
        // vật bay: trọng lực + cản gió theo vận tốc, xoay theo chiều ngang
        const drag = Math.max(0, 1 - FLING.DRAG * rdt);
        F.vx *= drag; F.vy = F.vy * drag + FLING.G * H * rdt;
        F.x += F.vx * rdt; F.y += F.vy * rdt;
        F.rot += F.vr * rdt; F.vr *= Math.max(0, 1 - 0.6 * rdt);
        const m = F.R * 1.3, out = F.x < v.x - m || F.x > v.x + v.w + m || F.y < v.y - m * 1.6 || F.y > v.y + v.h + m;
        // đuôi tim nhỏ rơi rớt theo đường bay (ra khỏi khung thì thôi)
        if (!out) F.acc += Math.min(40, 12 + Math.hypot(F.vx, F.vy) / H * 14) * rdt;
        while (F.acc >= 1 && f.hearts.length < MAX_HEARTS) {
            F.acc -= 1;
            f.hearts.push({ x: F.x + rnd(-0.4, 0.4) * F.R, y: F.y + rnd(-0.4, 0.4) * F.R, vx: -F.vx * 0.12 + rnd(-0.3, 0.3) * F.R, vy: -F.vy * 0.12 + rnd(-0.3, 0.3) * F.R,
                sway: rnd(0.05, 0.2) * F.R, swf: rnd(2.2, 4), ph: rnd(0, TAU), s: rnd(0.2, 0.4) * F.R, life: rnd(0.5, 0.9), age: 0, rot: rnd(-0.35, 0.35), spr: Math.floor(Math.random() * 4) });
        }
        stepHearts(f, rdt);
        drawHearts(f);
        const a = out ? 0 : clamp01((FLING.MAXT + FADE - F.t) / FADE);
        const sc = 1 - 0.12 * clamp01(F.t / 1.2);              // xa dần
        if (a > 0.01) {
            for (let i = FLING.GHOSTS; i >= 1; i--) {
                const p = F.trail[i * 2 - 1];
                if (!p) continue;
                ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
                drawAvatar(f, 0, 0, F.R * sc * (1 - 0.05 * i), a * 0.32 * (1 - i / (FLING.GHOSTS + 1)), 0);
                ctx.restore();
            }
            ctx.save(); ctx.translate(F.x, F.y); ctx.rotate(F.rot);
            drawAvatar(f, 0, 0, F.R * sc, a, Math.max(0, Math.sin(f.t * 7)));
            ctx.restore();
            drawName(f, F.x, F.y, F.R * sc, a * clamp01(1 - F.t / 0.8));
        }
        f.t += rdt;
        if (f.t > f.dur + FLING.MAXT + 3) return true;     // phao
        return (out || F.t >= FLING.MAXT + FADE) && !f.hearts.length;
    }
    function frameShow(f, rdt) {
        if (f.fly) return frameFly(f, rdt);
        f.t += rdt;
        // bám tay: thấy tim → dời avatar mượt theo; mất tim mà còn thấy lòng bàn tay (🤾 bật) → avatar dính theo tay (giữ khoảng
        // lệch lúc còn tim); mất cả tay → đứng yên chỗ cũ tới hết giờ
        const g = env.gesture(f.sc.poses), T = f.trk;
        if (T) trackHand(f, rdt);
        if (g) {
            const tg = targetOf(f, g), k = Math.min(1, rdt * 10);
            for (const key of ['x', 'y', 'R', 'ex', 'ey', 'spread']) f.A[key] = lerp(f.A[key], tg[key], k);
            f.lostT = 0;
            if (T && T.lostT === 0) T.off = { x: f.A.x - T.cx, y: f.A.y - T.cy };
        } else {
            f.lostT += rdt;
            if (T && T.off && T.lostT === 0) {
                const k = Math.min(1, rdt * 14), x = T.cx + T.off.x, y = T.cy + T.off.y;
                f.A.ex += (x - f.A.x) * k; f.A.ey += (y - f.A.y) * k;
                f.A.x = lerp(f.A.x, x, k); f.A.y = lerp(f.A.y, y, k);
            }
        }
        // 🤾 vung tay: đủ nhanh + đủ xa → ném; tay vừa biến mất ngay sau cú vung nhanh (nhoè) → ném theo vận tốc đo cuối
        if (T && T.v && f.t >= FLING.ARM && f.t < f.dur - FADE * 0.5) {
            const sp = Math.hypot(T.v.x, T.v.y) / Math.max(4, T.s);
            if ((sp >= FLING.MIN && T.v.move >= FLING.MOVE * T.s) || (T.lostT > FLING.LOST && T.lostT < FLING.LOST + 0.3 && sp >= FLING.MIN * 0.8)) {
                launch(f, T.v);
                return frameFly(f, 0);
            }
        }
        const left = f.dur - f.t;
        if (left > FADE) {
            f.acc += 6 * mult(f) * rdt;
            while (f.acc >= 1) { f.acc -= 1; spawn(f, false); }
        }
        stepHearts(f, rdt);
        const a = clamp01(left / FADE), pop = easeBack(Math.min(1, f.t / 0.45)) * (0.85 + 0.15 * a);
        const bob = Math.sin(f.t * 4) * f.A.R * 0.03, beat = Math.max(0, Math.sin(f.t * 7));
        drawHearts(f);
        const r = f.A.R * pop;
        drawAvatar(f, f.A.x, f.A.y + bob, r, a, beat);
        drawName(f, f.A.x, f.A.y + bob, r, a * Math.min(1, f.t / 0.3));
        if (f.t > f.dur + 3) return true;                     // phao: tim còn bay quá 3 s thì xong hẳn
        return left <= 0 && !f.hearts.length;
    }

    return { start, extend, stop, frame, estMs, get fx() { return fx; }, playing: () => [] };
}
