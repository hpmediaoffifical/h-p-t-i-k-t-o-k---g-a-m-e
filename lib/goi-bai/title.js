'use strict';
/**
 * 🎵 Gọi Bài — rút gọn tên video YouTube thành tên bài (hàm thuần, test: tests/goibai-title.test.js).
 *
 * Tiêu đề YouTube hiếm khi chỉ là tên bài: "Lạc Trôi | Official Music Video | Sơn Tùng M-TP". Bảng trên OBS
 * chỉ có vài chục pixel nên phần bị cắt luôn là phần có nghĩa → rút gọn MỘT lần lúc tìm xong, mọi bề mặt dùng chung.
 *
 * Luật: bỏ cụm ngoặc / đoạn "|" chỉ toàn nhãn (official, mv, lyrics, 4k…), bỏ đoạn trùng tên kênh,
 * lấy đoạn có nghĩa ĐẦU TIÊN. Không còn gì → trả nguyên tên gốc (thà dài còn hơn rỗng).
 */

const MAX_LEN = 80;
// Nhãn chỉ mô tả video (không phải tên bài). Chữ ASCII nên \b dùng được.
const JUNK_WORDS = /\b(official|music|video|mv|lyrics?|audio|visuali[sz]er|4k|hd|hq|1080p|720p|full|live|performance|karaoke|vietsub|engsub|version|ver|clip|teaser|nhạc|chính|thức)\b/giu;

function lettersLeft(s) {
    return String(s)
        .replace(/m\s*\/\s*v/gi, ' ')
        .replace(JUNK_WORDS, ' ')
        .replace(/[^\p{L}\p{N}]+/gu, '');
}
const isJunk = (s) => lettersLeft(s).length === 0;

function normName(s) {
    return String(s || '')
        .replace(/\s*-\s*topic\s*$/i, '')
        .replace(/\b(official|vevo|channel|music)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function cleanSongTitle(title, channel) {
    const orig = String(title == null ? '' : title).replace(/\s+/g, ' ').trim();
    if (!orig) return '';
    // 1) bỏ cụm ngoặc chỉ toàn nhãn: (Official Audio) [4K] 【MV】
    let s = orig.replace(/[\(\[【「‹«]([^\)\]】」›»]*)[\)\]】」›»]/g, (m, inner) => (isJunk(inner) ? ' ' : m)).replace(/\s{2,}/g, ' ');
    // 2) tách đoạn theo | ｜ ‖ ; bỏ đoạn nhãn + đoạn trùng tên kênh
    const ch = normName(channel);
    const parts = s.split(/\s*[|｜‖]\s*/).map(p => p.trim()).filter(Boolean);
    const keep = parts.filter(p => !isJunk(p) && !(ch && normName(p) === ch));
    s = keep.length ? keep[0] : '';
    // 3) đuôi " - HD", " – 4K"
    s = s.replace(/\s*[-–—~]\s*([^-–—~]*)$/, (m, tail) => (isJunk(tail) ? '' : m)).trim();
    if (!s) s = orig;
    if (s.length > MAX_LEN) s = s.slice(0, MAX_LEN - 1).trimEnd() + '…';
    return s;
}

module.exports = { cleanSongTitle };
