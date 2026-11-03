'use strict';
// 🚫 Từ cấm CHUNG cho mọi game: bình luận chứa từ cấm (cột A sheet quy tắc bình luận, tải trong server.js
// loadCommentRulesSheet) bị chặn ngay ở server — không phát 'chat' cho overlay nào nên không game nào đọc (TTS)
// hay hiển thị. Thay vào đó phát 'chat:blocked' chỉ có tên người (không có chữ) để game vẫn tính là có tương tác.
// Tên người xem có từ cấm thì CHE bằng *** (maskForbidden) ngay khi đọc gói TikTok — mọi game nhận tên đã che.
// Dịch Thuật LIVE dùng chung bộ so khớp này.
//
// So khớp NGUYÊN VĂN có dấu (chỉ bỏ hoa/thường, chuẩn NFC), theo ranh giới từ:
// - "chó" không chặn "cho", "mông" không chặn "mong", "cac" không chặn "các" — danh sách đã liệt kê sẵn biến thể
//   không dấu / teen code (cac, buoi, djt, l0n…) nên không bỏ dấu khi so (bỏ dấu là chặn nhầm cả câu bình thường).
// - "chim" không chặn "chimmm"/"bachim"; cụm nhiều chữ ("con chó", "l o n") khớp cả khi cách nhiều dấu cách.
// - Từ có ký tự đặc biệt ("18+", "l*n", "d!t") vẫn khớp đúng nguyên văn.
// - Từ ≤ 2 ký tự chỉ chặn khi CẢ bình luận / CẢ tên đúng bằng từ đó (luật cũ của Dịch Thuật): cột A có nhiều từ
//   ngắn rất thông dụng ("ăn", "sẽ", "to", "đá", "3q") — so như từ thường là mất cả câu bình thường.
//   Muốn chặn cụm có từ ngắn ở giữa câu thì thêm cả cụm vào sheet (vd "vl thật").
// - Bình luận CHỈ GỒM CHỮ SỐ là cú pháp chơi game (111 vào ghế, 222 VIP, 1-9 chọn mục tiêu, mã số tù nhân 4 chữ số,
//   "#4823", nhiều mã "4823 5120"…) → game KHÔNG lọc (isNumberOnly), dù sheet có "111", "222", "1111"… (các mục đó
//   để Dịch Thuật không đọc số spam).

const ESC = /[.*+?^${}()|[\]\\]/g;
const SHORT_MAX = 2;

function normalizeText(s) {
    return String(s ?? '').normalize('NFC').toLowerCase();
}

/** Chuẩn hoá để so cả câu với từ ngắn: NFC, thường, gộp khoảng trắng. */
function wholeKey(s) {
    return normalizeText(s).trim().replace(/\s+/g, ' ');
}

/**
 * Dựng bộ so khớp từ danh sách từ cấm (bỏ trùng, bỏ rỗng). null = danh sách rỗng.
 * @param {string[]} words
 * @returns {{ re: RegExp | null, reAll: RegExp | null, short: Set<string>, size: number } | null}
 */
function compileForbidden(words) {
    const list = [...new Set((Array.isArray(words) ? words : [])
        .map((w) => wholeKey(w))
        .filter(Boolean))];
    if (!list.length) return null;
    const short = new Set(list.filter((w) => [...w].length <= SHORT_MAX));
    const long = list.filter((w) => !short.has(w));
    long.sort((a, b) => b.length - a.length); // cụm dài khớp trước ("con chó" trước "chó")
    const src = long.length
        ? `(?<![\\p{L}\\p{M}\\p{N}])(?:${long.map((w) => w.replace(ESC, '\\$&').replace(/ /g, '\\s+')).join('|')})(?![\\p{L}\\p{M}\\p{N}])`
        : '';
    return {
        re: src ? new RegExp(src, 'u') : null,
        // Che trong tên: chạy trên chữ GỐC (giữ hoa/thường phần còn lại) nên cần cờ i.
        reAll: src ? new RegExp(src, 'giu') : null,
        short,
        size: list.length,
    };
}

/**
 * Từ cấm đầu tiên có trong bình luận ('' = sạch).
 * @param {string} text
 * @param {ReturnType<typeof compileForbidden>} compiled từ compileForbidden
 */
function findForbidden(text, compiled) {
    if (!compiled || !text) return '';
    const whole = wholeKey(text);
    if (!whole) return '';
    if (compiled.short.has(whole)) return whole;
    if (!compiled.re) return '';
    const m = compiled.re.exec(normalizeText(text));
    return m ? m[0] : '';
}

/**
 * Che từ cấm trong chuỗi (tên người xem): mỗi từ cấm → `mask`, phần còn lại giữ nguyên.
 * Cả chuỗi chỉ là 1 từ cấm ngắn → che hết.
 * @param {string} text
 * @param {ReturnType<typeof compileForbidden>} compiled
 * @param {string} [mask]
 */
function maskForbidden(text, compiled, mask = '***') {
    const s = String(text ?? '');
    if (!compiled || !s) return s;
    if (compiled.short.has(wholeKey(s))) return mask;
    if (!compiled.reAll) return s;
    compiled.reAll.lastIndex = 0;
    return s.normalize('NFC').replace(compiled.reAll, mask);
}

/** Bình luận chỉ gồm các số (mỗi số có thể có "#" phía trước, cách nhau bằng khoảng trắng) — cú pháp chơi game. */
function isNumberOnly(text) {
    return /^#?\p{Nd}+(?:\s+#?\p{Nd}+)*$/u.test(String(text ?? '').trim());
}

module.exports = { compileForbidden, findForbidden, maskForbidden, isNumberOnly, normalizeText };
