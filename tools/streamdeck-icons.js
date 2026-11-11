// Sinh icon tĩnh của plugin Stream Deck (imgs/*.svg) từ bộ vẽ dùng chung bin/lib/icons.js.
// Chạy lại khi đổi hình: node tools/streamdeck-icons.js
// Icon chính của plugin BẮT BUỘC PNG (schema Elgato): imgs/plugin.png 256px + plugin@2x.png 512px, thu nhỏ từ hp-logo-512.png.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'streamdeck', 'media.hpvn.actionlive.sdPlugin');
const Icons = require(path.join(ROOT, 'bin', 'lib', 'icons.js'));
const { COLORS } = require(path.join(ROOT, 'bin', 'lib', 'keys.js'));

// Icon danh sách hành động / danh mục: chỉ hình, nền trong suốt, nét trắng → Stream Deck tự tô theo giao diện.
function glyphOnly(glyph, size = 40) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="22 14 100 100">${Icons.GLYPHS[glyph]}</svg>`;
}

const files = {
    'imgs/category.svg': glyphOnly('bolt', 56),
    'imgs/actions/game.svg': glyphOnly('power'),
    'imgs/actions/live.svg': glyphOnly('live'),
    'imgs/actions/gift.svg': glyphOnly('gift'),
    'imgs/actions/chat.svg': glyphOnly('chat'),
    'imgs/actions/hotkey.svg': glyphOnly('bolt'),
    'imgs/keys/game.svg': Icons.renderSvg({ bg: COLORS.on, glyph: 'power', label: 'Game', sub: 'Bật / tắt' }),
    'imgs/keys/live.svg': Icons.renderSvg({ bg: COLORS.live, glyph: 'live', label: 'LIVE', sub: 'Kết nối' }),
    'imgs/keys/gift.svg': Icons.renderSvg({ bg: COLORS.gift, glyph: 'gift', label: 'Quà thử', sub: 'Thả thử' }),
    'imgs/keys/chat.svg': Icons.renderSvg({ bg: COLORS.chat, glyph: 'chat', label: 'Bình luận', sub: 'Gửi thử' }),
    'imgs/keys/hotkey.svg': Icons.renderSvg({ bg: COLORS.group.duongveque, glyph: 'bolt', label: 'Phím game', sub: 'Hành động' }),
};
for (const [rel, svg] of Object.entries(files)) {
    const f = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, svg + '\n');
}
console.log('Đã sinh', Object.keys(files).length, 'icon trong', ROOT);
