// 🅷 Logo hp đánh dấu bản quyền trên ĐỒ VẬT LỚN của các game vẽ bằng mã (user 2026-10-28): máy hút mỡ, điện thoại, bơm tay, đồng hồ
// nhiệt, khung truyện, ống hút, nút cầu Bắt NPC. Ảnh = public/games/body/samples/hp-logo.png (415×410, cùng logo màn GAME OVER) - nạp MỘT lần.
let IMG = null;
export function hpLogo() {
    if (!IMG && typeof Image !== 'undefined') { IMG = new Image(); IMG.decoding = 'async'; IMG.src = '/games/body/samples/hp-logo.png'; IMG.decode?.().catch(() => {}); }
    return IMG && IMG.complete && IMG.naturalWidth ? IMG : null;
}
// Vẽ logo cạnh s, tâm (x, y). round = cắt tròn (nút cầu); gloss = vệt bóng chéo như in trên mặt nhựa / kim loại.
export function drawLogo(ctx, x, y, s, { alpha = 1, rot = 0, round = false, gloss = true } = {}) {
    const im = hpLogo();
    if (!im || s < 6 || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha *= alpha; ctx.translate(x, y); if (rot) ctx.rotate(rot);
    const h = s / 2, r = s * 0.22;
    ctx.beginPath();
    if (round) ctx.arc(0, 0, h, 0, Math.PI * 2);
    else { ctx.moveTo(-h + r, -h); ctx.arcTo(h, -h, h, h, r); ctx.arcTo(h, h, -h, h, r); ctx.arcTo(-h, h, -h, -h, r); ctx.arcTo(-h, -h, h, -h, r); ctx.closePath(); }
    ctx.clip();
    ctx.drawImage(im, -h, -h, s, s);
    if (gloss) {
        const g = ctx.createLinearGradient(-h, -h, h, h);
        g.addColorStop(0, 'rgba(255,255,255,0.38)'); g.addColorStop(0.42, 'rgba(255,255,255,0.06)'); g.addColorStop(0.43, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.14)');
        ctx.fillStyle = g; ctx.fillRect(-h, -h, s, s);
    }
    ctx.restore();
}

// 🔤 Font chữ Việt chuẩn cho chữ vẽ trên canvas (user 2026-10-28: "BỤP!" bằng Arial Black lỗi dấu Ụ). Dùng font giao kèm (/games/body/fonts,
// vn-fonts.css): Baloo 2 = chữ hiệu ứng tròn đậm, Be Vietnam Pro = chữ giao diện. Canvas KHÔNG tự tải font → nạp sẵn ở đây.
export const VN_FONT = '"Baloo 2", "Be Vietnam Pro", "Segoe UI", sans-serif';
export const VN_UI = '"Be Vietnam Pro", "Segoe UI", sans-serif';
let FONTS = null;
export function vnFonts(onReady) {
    if (typeof document === 'undefined') return;
    if (!FONTS) {
        // chờ bảng @font-face nạp XONG rồi mới tải font (tải trước thì trình duyệt chưa biết font → trả rỗng ngay)
        let l = document.querySelector('link[data-hp-vnfont]');
        const sheet = l && l.sheet ? Promise.resolve() : new Promise(res => {
            if (!l) { l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/games/body/fonts/vn-fonts.css'; l.dataset.hpVnfont = '1'; document.head.appendChild(l); }
            l.addEventListener('load', res, { once: true }); l.addEventListener('error', res, { once: true }); setTimeout(res, 4000);
        });
        const sample = 'BỤP! Ụ Ắ Ặ Ữ Đ đang xem NHIỆT ĐỘ Hừm… thú vị đấy';
        FONTS = sheet.then(() => Promise.all(['700 48px "Baloo 2"', '400 48px "Baloo 2"', '700 48px "Be Vietnam Pro"', '400 48px "Be Vietnam Pro"']
            .map(f => document.fonts.load(f, sample).catch(() => [])))).catch(() => {});
    }
    if (onReady) FONTS.then(onReady);
}
