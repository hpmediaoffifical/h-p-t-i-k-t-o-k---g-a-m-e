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

/*
 * Trạng thái mục theo game (HP KEY gs — SDK 2.1: license.gameState). Admin bật/tắt từng mục cho MỌI key:
 *   'off'    = Tạm tắt (bảo trì)     → hiện mờ kèm ⏸ "Tạm bảo trì"
 *   'hidden' = Ẩn (chưa ra mắt)      → không hiện ở Thư viện / Khởi động nhanh / Game Camera / nguồn Bảng Quà Tổng
 *   'admin'  = Dùng thử (chỉ KEY được server cho dùng thử) → dùng bình thường, gắn nhãn 🧪
 * Server ĐÃ trừ mục off/hidden khỏi ft nên KHOÁ vẫn chỉ theo `features` (can/lockedIds); gameState chỉ đổi cách HIỆN.
 */
const GAME_STATES = new Set(['off', 'hidden', 'admin']);

/** gameState → object { id: 'off'|'hidden'|'admin' } (giá trị lạ bị bỏ); thiếu / sai kiểu → {}. */
function normalizeState(gs) {
    const out = {};
    if (!gs || typeof gs !== 'object' || Array.isArray(gs)) return out;
    for (const id of Object.keys(gs)) if (GAME_STATES.has(gs[id])) out[id] = gs[id];
    return out;
}

/**
 * Trạng thái hiển thị của một mục: 'on' | 'locked' (🔒 KEY chưa mở) | 'off' | 'hidden' | 'admin'.
 * Khung camgames: còn game con dùng được → 'on'; mọi game con Ẩn → 'hidden'; không game con nào dùng được mà có
 * game con Tạm tắt → 'off'; còn lại 'locked'.
 */
function stateOf(features, gameState, id) {
    const gs = normalizeState(gameState);
    if (id === 'camgames') {
        const kids = CAM_CHILDREN.map((c) => stateOf(features, gs, c));
        if (kids.some((s) => s === 'on' || s === 'admin')) return 'on';
        if (kids.every((s) => s === 'hidden')) return 'hidden';
        if (kids.some((s) => s === 'off')) return 'off';
        return 'locked';
    }
    const st = gs[id];
    if (st === 'hidden' || st === 'off') return st;
    if (!can(features, id)) return 'locked';
    return st === 'admin' ? 'admin' : 'on';
}

/** { id: trạng thái } của mọi mục khoá được + khung camgames, chỉ mục KHÁC 'on'. {} khi mở hết, mọi mục Bật. */
function states(features, gameState) {
    const out = {};
    for (const id of [...LOCKABLE, 'camgames']) {
        const st = stateOf(features, gameState, id);
        if (st !== 'on') out[id] = st;
    }
    return out;
}

/** Hai gameState có giống nhau không (watcher: ft giữ nguyên mà gs đổi off → hidden vẫn phải vẽ lại). */
function sameState(a, b) {
    const x = normalizeState(a);
    const y = normalizeState(b);
    const kx = Object.keys(x);
    return kx.length === Object.keys(y).length && kx.every((id) => x[id] === y[id]);
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

/*
 * Trang 🔒 / ⏸ thay overlay OBS / trang game của mục bị khoá (server.js licenseLockedHtml). Browser Source trong OBS
 * không tự tải lại → trang tự hỏi /api/license/features mỗi LOCK_RECHECK_MS; mục được mở lại thì location.reload()
 * để server trả game thật. Lỗi mạng (app đang khởi động lại…) thì bỏ qua, lần sau hỏi tiếp.
 */
const LOCK_RECHECK_MS = 15000;

/**
 * Trả lời của /api/license/features cho thấy mục `id` đã mở lại chưa: id không còn trong `locked` VÀ không còn là
 * off / hidden trong `states`. Trả lời lạ / thiếu `locked` → false (chưa chắc thì đứng yên).
 * Trang khoá nhúng NGUYÊN mã nguồn hàm này (toString) → viết kiểu ES5, không dấu so sánh nhỏ hơn.
 */
function lockLifted(id, lf) {
    if (!lf || typeof lf !== 'object' || !Array.isArray(lf.locked)) return false;
    var st = (lf.states && typeof lf.states === 'object') ? lf.states[id] : '';
    return lf.locked.indexOf(id) === -1 && st !== 'off' && st !== 'hidden';
}

/** Đoạn <script> tự tải lại của trang khoá (id = mục đã qua bí danh, vd 'liveTranslate', 'camgames'). */
function lockedPageScript(id) {
    const sid = JSON.stringify(String(id)).replace(/</g, '\\u003c');
    return '<script>(function(){var id=' + sid + ',busy=false,lifted=' + lockLifted.toString() + ';'
        + 'setInterval(function(){if(busy)return;busy=true;'
        + "fetch('/api/license/features',{cache:'no-store'})"
        + '.then(function(r){return r.ok?r.json():null})'
        + '.then(function(d){if(lifted(id,d))location.reload()},function(){})'
        + '.then(function(){busy=false})},' + LOCK_RECHECK_MS + ')})()</script>';
}

/**
 * HTML trang khoá của mục `id` ở trạng thái `state` (stateOf): ⏸ khi 'off' (Tạm bảo trì), 🔒 còn lại. Nền trong suốt
 * (Browser Source OBS), một nhãn nhỏ góc trên trái + script tự tải lại khi mục được mở.
 */
function lockedPageHtml(id, state) {
    const c = CATALOG.find((x) => x.id === id);
    const name = String(id === 'camgames' ? 'Game Camera' : (c ? c.name : id)).replace(/[<>&"]/g, '');
    const ico = state === 'off' ? '⏸' : '🔒';
    const msg = state === 'off' ? 'đang tạm bảo trì — HP Media sẽ mở lại sớm'
        : state === 'hidden' ? 'chưa mở' : 'KEY chưa mở tính năng này — liên hệ HP Media';
    return '<!doctype html><html><head><meta charset="utf-8"><title>' + ico + ' ' + name + '</title><style>'
        + 'html,body{margin:0;background:transparent;font-family:system-ui,Segoe UI,sans-serif}'
        + 'div{position:fixed;left:12px;top:12px;padding:8px 12px;border-radius:8px;background:rgba(0,0,0,.62);color:#fff;font-size:14px}'
        + '</style></head><body><div>' + ico + ' ' + name + ': ' + msg + '</div>'
        + lockedPageScript(id) + '</body></html>';
}

module.exports = {
    CATALOG, LOCKABLE, CAM_CHILDREN, normalize, can, lockedIds, same, catalogText,
    normalizeState, stateOf, states, sameState,
    LOCK_RECHECK_MS, lockLifted, lockedPageHtml,
};
