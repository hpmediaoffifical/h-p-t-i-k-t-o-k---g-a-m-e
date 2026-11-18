// Vẽ icon nút 144×144 bằng SVG (data URI cho setImage). Hình vẽ tự làm bằng path đơn giản —
// Stream Deck vẽ SVG không có emoji màu nên không dùng emoji.
'use strict';

const GLYPHS = {
    // nút nguồn
    power: '<path d="M72 30v30" stroke="#fff" stroke-width="9" stroke-linecap="round" fill="none"/>'
        + '<path d="M52 40a28 28 0 1 0 40 0" stroke="#fff" stroke-width="9" stroke-linecap="round" fill="none"/>',
    // chấm LIVE + sóng
    live: '<circle cx="72" cy="50" r="13" fill="#fff"/>'
        + '<path d="M48 26a34 34 0 0 0 0 48M96 26a34 34 0 0 1 0 48" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none"/>',
    // hộp quà
    gift: '<rect x="44" y="40" width="56" height="40" rx="5" fill="#fff"/>'
        + '<rect x="40" y="30" width="64" height="14" rx="4" fill="#fff"/>'
        + '<rect x="68" y="30" width="8" height="50" fill="rgba(0,0,0,.35)"/>'
        + '<path d="M72 30c-6-12-22-12-20-2 2 6 12 4 20 2zM72 30c6-12 22-12 20-2-2 6-12 4-20 2z" fill="#fff"/>',
    // bong bóng chat
    chat: '<path d="M38 30h68a8 8 0 0 1 8 8v30a8 8 0 0 1-8 8H66l-16 12v-12H38a8 8 0 0 1-8-8V38a8 8 0 0 1 8-8z" fill="#fff"/>'
        + '<circle cx="54" cy="53" r="5" fill="rgba(0,0,0,.4)"/><circle cx="72" cy="53" r="5" fill="rgba(0,0,0,.4)"/><circle cx="90" cy="53" r="5" fill="rgba(0,0,0,.4)"/>',
    // tia sét
    bolt: '<path d="M80 22L50 62h20l-8 30 32-42H74z" fill="#fff"/>',
    // ổ khoá
    lock: '<rect x="48" y="50" width="48" height="36" rx="6" fill="#fff"/>'
        + '<path d="M58 50V40a14 14 0 0 1 28 0v10" stroke="#fff" stroke-width="8" fill="none"/>',
    // tam giác cảnh báo
    warn: '<path d="M72 24l32 56H40z" fill="#facc15"/><rect x="69" y="42" width="6" height="22" fill="#18181b"/><circle cx="72" cy="71" r="4" fill="#18181b"/>',
    // micro
    mic: '<rect x="60" y="24" width="24" height="42" rx="12" fill="#fff"/>'
        + '<path d="M50 54a22 22 0 0 0 44 0M72 76v12" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none"/>',
};

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const safeColor = (c, dflt) => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : dflt);

// view = { bg, glyph, label, sub, ring?, dim? } (keys.keyView)
function renderSvg(view = {}) {
    const bg = safeColor(view.bg, '#3f3f46');
    const glyph = GLYPHS[view.glyph] || '';
    const ring = view.ring ? `<rect x="4" y="4" width="136" height="136" rx="18" fill="none" stroke="${safeColor(view.ring, '#facc15')}" stroke-width="6"/>` : '';
    const label = esc(view.label);
    const size = String(view.label || '').length > 11 ? 17 : 20;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">'
        + `<rect width="144" height="144" rx="20" fill="${bg}"/>`
        + `<g opacity="${view.dim ? 0.55 : 1}">${glyph}</g>`
        + ring
        + `<text x="72" y="114" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="${size}" font-weight="700" fill="#fff">${label}</text>`
        + `<text x="72" y="134" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="14" fill="rgba(255,255,255,.82)">${esc(view.sub)}</text>`
        + '</svg>';
}

// Stream Deck nhận SVG thô sau tiền tố (không URL-encode) — kiểu mẫu trong tài liệu SDK.
function toDataUri(svg) { return 'data:image/svg+xml;charset=utf8,' + svg; }

module.exports = { GLYPHS, esc, renderSvg, toDataUri };
