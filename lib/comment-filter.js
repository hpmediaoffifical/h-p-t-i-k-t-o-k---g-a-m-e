'use strict';
// 🚫 Từ cấm CHUNG cho mọi game: bình luận chứa từ cấm (cột A sheet quy tắc bình luận, tải trong server.js
// loadCommentRulesSheet) bị chặn ngay ở server — không phát 'chat' cho overlay nào nên không game nào đọc (TTS)
// hay hiển thị. Thay vào đó phát 'chat:blocked' chỉ có tên người (không có chữ) để game vẫn tính là có tương tác.
//
// So khớp NGUYÊN VĂN có dấu (chỉ bỏ hoa/thường, chuẩn NFC), theo ranh giới từ:
// - "chó" không chặn "cho", "mông" không chặn "mong", "cac" không chặn "các" — danh sách đã liệt kê sẵn biến thể
//   không dấu / teen code (cac, buoi, djt, l0n…) nên không bỏ dấu khi so (bỏ dấu là chặn nhầm cả câu bình thường).
// - "chim" không chặn "chimmm"/"bachim"; cụm nhiều chữ ("con chó", "l o n") khớp cả khi cách nhiều dấu cách.
// - Từ có ký tự đặc biệt ("18+", "l*n", "d!t") vẫn khớp đúng nguyên văn.

const ESC = /[.*+?^${}()|[\]\\]/g;

function normalizeText(s) {
    return String(s ?? '').normalize('NFC').toLowerCase();
}

/**
 * Dựng bộ so khớp từ danh sách từ cấm (bỏ trùng, bỏ rỗng). null = danh sách rỗng.
 * @param {string[]} words
 * @returns {{ re: RegExp, size: number } | null}
 */
function compileForbidden(words) {
    const list = [...new Set((Array.isArray(words) ? words : [])
        .map((w) => normalizeText(w).trim().replace(/\s+/g, ' '))
        .filter(Boolean))];
    if (!list.length) return null;
    list.sort((a, b) => b.length - a.length); // cụm dài khớp trước ("con chó" trước "chó")
    const body = list.map((w) => w.replace(ESC, '\\$&').replace(/ /g, '\\s+')).join('|');
    return { re: new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(?:${body})(?![\\p{L}\\p{M}\\p{N}])`, 'u'), size: list.length };
}

/**
 * Từ cấm đầu tiên có trong bình luận ('' = sạch).
 * @param {string} text
 * @param {{ re: RegExp } | null} compiled từ compileForbidden
 */
function findForbidden(text, compiled) {
    if (!compiled || !text) return '';
    const m = compiled.re.exec(normalizeText(text));
    return m ? m[0] : '';
}

module.exports = { compileForbidden, findForbidden, normalizeText };
