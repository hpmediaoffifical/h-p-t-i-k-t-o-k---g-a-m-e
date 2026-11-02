/**
 * 🏢 Creator Online — mã bình luận: chọn fan club 1–5 và lệnh của người giữ vai.
 * Logic thuần (không DOM, không three.js) → test bằng `npm test` (tests/creatoronline-codes.test.mjs).
 * Spec: docs/superpowers/specs/2026-11-03-creatoronline-design.md mục 3 (chọn club) + mục 7 (mã vai).
 *
 * Luật chung: CẢ CÂU bình luận phải đúng bằng mã (chỉ bỏ khoảng trắng thừa, không bỏ dấu câu),
 * để "5 sao", "1 tim nè", "đèn đẹp quá" không bị hiểu là lệnh.
 * Server có bản parseClubCode riêng (lib/creatoronline-fans.js) — test bên server so 2 bản trên cùng bộ mẫu.
 */

/** Bỏ dấu tiếng Việt + chữ thường + gộp khoảng trắng: "  Đèn   Đẹp " → "den dep". Không phải chuỗi → ''. */
export function stripVN(text) {
  if (typeof text !== 'string') return '';
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Mã club: "1".."5" hoặc "g1".."g5" (cho phép "g 1"). */
const CLUB_RE = /^(?:g ?)?([1-5])$/;

/** Quản lý gọi PK: "pk 3" / "pk3". */
const PK_RE = /^pk ?([1-5])$/;

/**
 * Lệnh vai: mã không dấu → cách viết CÓ DẤU duy nhất được nhận.
 * Gõ không dấu luôn nhận ("den"); gõ có dấu thì phải đúng chữ của lệnh ("đèn" nhận, "đen" không).
 * Nhờ vậy "đó" (≠ "đồ"), "khỏi" (≠ "khói"), "thèm" (≠ "thêm") không thành lệnh.
 */
const TECH_CMDS = { phao: 'pháo', khoi: 'khói', laser: '', den: 'đèn', chop: 'chớp' };
const MANAGER_CMDS = { them: 'thêm', bot: 'bớt', do: 'đồ' };

/** Chữ thường có dấu (NFC) + gộp khoảng trắng — để so với cách viết có dấu của lệnh. */
function accentedLower(text) {
  return text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Bình luận có dấu tiếng Việt (kể cả chữ đ) hay không. */
function hasDiacritics(text) {
  return /[\p{M}đ]/u.test(text.normalize('NFD').toLowerCase());
}

/** Gõ không dấu → nhận; gõ có dấu → phải đúng `accented` ('' = lệnh không có dạng có dấu). */
function accentOk(text, accented) {
  if (!hasDiacritics(text)) return true;
  return !!accented && accentedLower(text) === accented;
}

/**
 * Đọc mã chọn club. Cả câu phải là mã: '1', ' 3 ', 'G2', 'g 4' → club; '5 sao', '12', '6', 'g6' → null.
 * @param {string} text bình luận
 * @returns {1|2|3|4|5|null}
 */
export function parseClubCode(text) {
  const m = CLUB_RE.exec(stripVN(text));
  return m ? Number(m[1]) : null;
}

/**
 * Đọc lệnh của người giữ vai (chỉ có tác dụng khi người đó đang giữ vai — bên gọi tự kiểm).
 * - Kỹ thuật: phao | khoi | laser | den | chop → { role: 'tech', cmd }
 * - Quản lý: pk N → { role: 'manager', cmd: 'pk', club: N }; them | bot | do → { role: 'manager', cmd }
 * @param {string} text bình luận
 * @returns {{role:'tech'|'manager', cmd:string, club?:number}|null}
 */
export function parseRoleCommand(text) {
  const t = stripVN(text);
  if (!t) return null;
  const pk = PK_RE.exec(t);
  if (pk) return accentOk(text, '') ? { role: 'manager', cmd: 'pk', club: Number(pk[1]) } : null;
  if (Object.hasOwn(TECH_CMDS, t)) return accentOk(text, TECH_CMDS[t]) ? { role: 'tech', cmd: t } : null;
  if (Object.hasOwn(MANAGER_CMDS, t)) return accentOk(text, MANAGER_CMDS[t]) ? { role: 'manager', cmd: t } : null;
  return null;
}

/** Bình luận là mã (club hoặc lệnh vai) → không hiện bong bóng / bảng bình luận như câu thường. */
export function isCommand(text) {
  return parseClubCode(text) !== null || parseRoleCommand(text) !== null;
}
