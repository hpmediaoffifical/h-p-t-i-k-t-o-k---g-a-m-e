'use strict';
/**
 * Tính năng theo KEY (HP KEY, trường `ft` trong token — SDK: license.features). Hàm THUẦN, không đụng appConfig.
 *
 *  features === null / undefined  → key "Tất cả": mở MỌI tính năng (mọi key cũ, mọi token không có ft).
 *  features = ['caro', ...]       → chỉ mở các id trong danh sách (phân biệt hoa thường, đúng id dưới đây).
 *  features = []                  → khoá hết các mục khoá được; app vẫn chạy, các công cụ luôn mở vẫn dùng được.
 *
 * Danh mục bán theo key (chốt 18/10/2026): mọi game (kể cả THỜI GIAN — timer) + Dịch Thuật LIVE + Hiệu ứng OBS.
 * Luôn mở cho mọi key: Bảng Quà Tổng (giftboard). Game Camera khoá theo TỪNG game con; khung camgames mở khi
 * key có ít nhất 1 game con. CATALOG chính là nội dung dán vào trang quản trị HP KEY › Cài đặt › Game
 * (game tiktok-game) — id ở đây và ở đó phải trùng nhau.
 */

const CATALOG = Object.freeze([
    { id: 'thuytinh', name: 'Hũ Thủy Tinh' },
    { id: 'caro', name: 'Caro Đối Đầu' },
    { id: 'pktiktok', name: 'Hiệu ứng PK' },
    { id: 'vipwelcome', name: 'Chào Mừng VIP' },
    { id: 'votecomment', name: 'Vote Bình Luận' },
    { id: 'nhietdo', name: 'Biểu Cảm Nhiệt' },
    { id: 'trongcay', name: 'Trồng Cây' },
    { id: 'nhatla', name: 'Nhặt Lá' },
    { id: 'timer', name: 'Thời Gian' },
    { id: 'touchplay', name: 'Touch & Play (Game Camera)' },
    { id: 'chemtraicay', name: 'Chém Trái Cây (Game Camera)' },
    { id: 'dapmuoi', name: 'Đập Muỗi (Game Camera)' },
    { id: 'bancung', name: 'Bắn Cung (Game Camera)' },
    { id: 'level-quest', name: 'Level Quest (Game Camera)' },
    { id: 'liveTranslate', name: 'Dịch Thuật LIVE' },
    { id: 'obs-effects', name: 'Hiệu ứng OBS' },
].map(Object.freeze));

const LOCKABLE = Object.freeze(CATALOG.map((c) => c.id));
const CAM_CHILDREN = Object.freeze(['touchplay', 'chemtraicay', 'dapmuoi', 'bancung', 'level-quest']);

/** Chuẩn hoá: mảng → mảng chuỗi; còn lại (null, undefined, sai kiểu) → null = mở hết. */
function normalize(features) {
    return Array.isArray(features) ? features.map(String) : null;
}

/** Mục `id` có được dùng với danh sách tính năng này không. Id ngoài danh mục (công cụ, game mới) luôn mở. */
function can(features, id) {
    const f = normalize(features);
    if (f === null) return true;
    if (id === 'camgames') return CAM_CHILDREN.some((c) => f.includes(c));
    if (!LOCKABLE.includes(id)) return true;
    return f.includes(id);
}

/** Danh sách id đang bị khoá (kể cả khung camgames khi không còn game con nào). [] khi mở hết. */
function lockedIds(features) {
    const f = normalize(features);
    if (f === null) return [];
    const out = LOCKABLE.filter((id) => !f.includes(id));
    if (!can(f, 'camgames')) out.push('camgames');
    return out;
}

/** Hai danh sách có cùng tác dụng không (để khỏi áp khoá lại khi watcher nhận token giống hệt). */
function same(a, b) {
    const x = normalize(a);
    const y = normalize(b);
    if (x === null || y === null) return x === y;
    return x.length === y.length && x.every((id, i) => id === y[i]);
}

/** Nội dung ô danh mục ở trang quản trị HP KEY (mỗi dòng "id|Tên"). */
function catalogText() {
    return CATALOG.map((c) => c.id + '|' + c.name).join('\n');
}

module.exports = { CATALOG, LOCKABLE, CAM_CHILDREN, normalize, can, lockedIds, same, catalogText };
