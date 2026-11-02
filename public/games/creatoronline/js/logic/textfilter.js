/**
 * 🏢 Creator Online — lọc chữ người xem trước khi lên màn LED, TV phòng, miệng MC.
 * Logic thuần (không DOM, không three.js) → test bằng `npm test` (tests/creatoronline-textfilter.test.mjs).
 * Spec: docs/superpowers/specs/2026-11-03-creatoronline-design.md mục 10 (Lọc chữ).
 *
 * - Danh sách mặc định CHỈ gồm dạng có dấu (lồn, cặc, đéo…) và teencode không dấu không gây nhầm (dm, vcl…).
 *   Dạng không dấu mơ hồ (lon = lớn/lon bia, cac = các, buoi = buổi, deo = đeo, du = dù) KHÔNG được thêm:
 *   so khớp có dấu nên "các bạn", "lớn quá", "buổi live" không bị che.
 * - Từ streamer tự thêm (`coBadWords`, cách nhau bằng dấu phẩy): gõ không dấu → so khớp không dấu
 *   ("lon" che cả "lớn", "lon"); gõ có dấu → chỉ che đúng chữ có dấu đó.
 * - So khớp cả từ (biên chữ Unicode), không phân biệt hoa thường; từ cấm → `***`.
 */

import { stripVN } from './codes.js';

const MASK = '***';

/** Từ cấm mặc định (tiếng Việt có dấu + teencode không nhầm + tiếng Anh). Cụm nhiều chữ được che trọn cụm. */
export const DEFAULT_BAD_WORDS = [
  // tiếng Việt — luôn có dấu
  'lồn', 'lìn', 'cặc', 'cặk', 'kặc', 'buồi', 'đéo', 'đụ', 'địt', 'đĩ', 'cứt', 'nứng', 'chịch',
  'đụ má', 'đù má', 'địt mẹ', 'óc chó', 'chó đẻ',
  // teencode không dấu, không trùng chữ thường
  'dm', 'dmm', 'dcm', 'dkm', 'đm', 'đmm', 'đcm', 'đkm', 'vcl', 'vkl', 'vl', 'vcc', 'clm', 'cmm', 'cmn', 'cmnr',
  'clgt', 'loz', 'dit me',
  // tiếng Anh
  'fuck', 'fucking', 'fucker', 'fucked', 'motherfucker', 'fck', 'fuk', 'wtf', 'stfu', 'shit', 'bullshit',
  'bitch', 'cunt', 'asshole', 'pussy', 'slut', 'whore', 'dickhead', 'nigger', 'nigga', 'faggot',
];

/** Ký tự điều khiển (trừ khoảng trắng), gạch mềm, ký tự rộng-0 và ký tự đảo chiều chữ — bỏ hẳn. */
const JUNK_CHARS = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f­​⁠﻿‪-‮⁦-⁩]/g;

/** Biên chữ: trước/sau từ cấm không được là chữ, số, dấu kết hợp hay '_'. */
const WORD_CHAR = '[\\p{L}\\p{N}\\p{M}_]';

/** Mọi chữ cái tiếng Việt (dựng sẵn, NFC) → gom theo chữ không dấu để so khớp không dấu. */
const VN_LETTERS = 'aàáảãạăằắẳẵặâầấẩẫậeèéẻẽẹêềếểễệiìíỉĩịoòóỏõọôồốổỗộơờớởỡợuùúủũụưừứửữựyỳýỷỹỵdđ';
const FOLD = {};
for (const ch of VN_LETTERS) {
  const base = stripVN(ch);
  FOLD[base] = (FOLD[base] ?? '') + ch;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Chuẩn hoá một từ cấm: NFC, chữ thường, gộp khoảng trắng. */
function normWord(word) {
  return String(word ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Mẫu so khớp đúng chữ (có dấu), khoảng trắng trong cụm khớp 1+ khoảng trắng. */
function exactPattern(word) {
  return word.split(' ').map(escapeRe).join('\\s+');
}

/** Mẫu so khớp không dấu: mỗi chữ cái → nhóm mọi cách viết có dấu của nó ("lon" → l[oòó…ợ]n). */
function foldPattern(word) {
  return word.split(' ').map((part) => {
    let out = '';
    for (const ch of part) out += FOLD[ch] ? `[${FOLD[ch]}]` : escapeRe(ch);
    return out;
  }).join('\\s+');
}

/** Tách danh sách streamer nhập: dấu phẩy (hoặc xuống dòng) ngăn cách; nhận cả mảng. */
function splitExtra(extra) {
  const list = Array.isArray(extra) ? extra : String(extra ?? '').split(/[,\r\n]+/);
  return list.map(normWord).filter(Boolean);
}

/** NFC, bỏ ký tự rác, gộp khoảng trắng, cắt hai đầu. */
function normalizeText(text) {
  if (typeof text !== 'string') return '';
  return text.normalize('NFC').replace(JUNK_CHARS, '').replace(/\s+/g, ' ').trim();
}

/** Cắt còn tối đa `maxLen` ký tự (tính cả '…'), không cắt đôi emoji. */
function truncate(s, maxLen) {
  let lim = Math.floor(Number(maxLen));
  if (!(lim >= 1)) lim = 60;
  const chars = Array.from(s);
  if (chars.length <= lim) return s;
  return chars.slice(0, lim - 1).join('').trimEnd() + '…';
}

/**
 * Tạo bộ lọc chữ.
 * @param {string|string[]} [extra] từ cấm streamer thêm (`coBadWords`), cách nhau bằng dấu phẩy
 * @returns {(text:string, maxLen?:number) => string} hàm lọc: chuẩn hoá → che từ cấm → cắt độ dài
 */
export function makeTextFilter(extra = '') {
  const patterns = new Map(); // mẫu regex → độ dài từ gốc (từ dài thử trước để cụm "địt mẹ" che trọn)
  const add = (src, len) => {
    if (src && !patterns.has(src)) patterns.set(src, len);
  };
  for (const w of DEFAULT_BAD_WORDS.map(normWord).filter(Boolean)) add(exactPattern(w), w.length);
  for (const w of splitExtra(extra)) {
    const plain = stripVN(w) === w; // không dấu (kể cả không có 'đ') → so khớp không dấu
    add(plain ? foldPattern(w) : exactPattern(w), w.length);
  }
  const alts = [...patterns.entries()].sort((a, b) => b[1] - a[1]).map(([src]) => src);
  const re = new RegExp(`(?<!${WORD_CHAR})(?:${alts.join('|')})(?!${WORD_CHAR})`, 'giu');

  return function filterText(text, maxLen = 60) {
    const s = normalizeText(text).replace(re, MASK);
    return truncate(s, maxLen);
  };
}
