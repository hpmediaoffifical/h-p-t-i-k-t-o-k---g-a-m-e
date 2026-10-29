'use strict';
/**
 * Tính năng theo KEY (HP KEY, trường `ft` trong token — SDK: license.features). Hàm THUẦN, không đụng appConfig.
 *
 *  features === null / undefined  → key "Tất cả": mở MỌI tính năng (mọi key cũ, mọi token không có ft).
 *  features = ['caro', ...]       → chỉ mở các id trong danh sách (phân biệt hoa thường, đúng id dưới đây).
 *  features = []                  → khoá hết các mục khoá được; app vẫn chạy, các công cụ luôn mở vẫn dùng được.
 *
 * Danh mục bán theo GAME (chốt 29/10/2026 — mỗi game một giá, mua trọn đời theo KEY; spec
 * docs/superpowers/specs/2026-10-29-mua-game-sepay-design.md §6.0): 9 game đơn + Dịch Thuật LIVE + 6 game con của
 * 🎥 Game Camera + 28 hiệu ứng con của 🧍 Bộ Tách Người. GAME MẸ (HUBS: camgames, body) không bán — mở khi key có ít
 * nhất 1 game con (đệ quy: body mở khi có 1 'body-*', camgames mở khi có 1 con kể cả qua body).
 * Luôn mở cho mọi key: Bảng Quà Tổng (giftboard). (🎬 Hiệu ứng OBS 'obs-effects' đã gỡ 29/10/2026.)
 * catalogText() chính là nội dung dán vào trang quản trị HP KEY › Cài đặt › Game (game tiktok-game) — id ở đây và ở
 * đó phải trùng nhau.
 */

// 🧍 Bộ Tách Người: khoá theo LOẠI + KIỂU kịch bản (public/games/body/core.js saleIdOf), không theo id kịch bản —
// người dùng nhân bản / đổi kiểu kịch bản được. Thứ tự = VIDFX_MOTIONS / MORPH_STYLES trong core.js (test đối chiếu).
const BODY_SIMPLE = [['roiho', 'Rơi Hố'], ['biduoi', 'Bị Đuổi'], ['cry', 'Khóc Lóc'], ['heart', 'Bắn Tim'], ['catch', 'Bắt NPC']];
const BODY_VIDFX = [['portal', 'Cửa Scifi'], ['blast', 'Thiên Thạch Rơi'], ['abduct', 'UFO'], ['knock', 'Đấm Box'], ['crush', 'Đấm Bẹp Dí'],
    ['mario', 'Mario ăn nấm'], ['pickle', 'Pickleball'], ['ninja', 'Ninja'], ['batu', 'Ba Tư']];
const BODY_MORPH = [['ice', 'Đóng băng'], ['pixel', 'Vỡ điểm ảnh'], ['zap', 'Sét đánh'], ['vacuum', 'Ống hút người'], ['bees', 'Ong vỡ tổ'],
    ['slap', 'Tát bay'], ['fly', 'Son Goku'], ['ghost', 'Hồn lìa khỏi xác'], ['clone', 'Phân thân'], ['melt', 'Tan chảy'],
    ['balloon', 'Thổi phồng'], ['lipo', 'Hút mỡ'], ['phone', 'Hút vào điện thoại'], ['anime', 'Biến hoạt hình']];

/** Game mẹ: không bán, mở theo game con. parent = game mẹ cấp trên (null = menu chính). */
const HUBS = Object.freeze({
    camgames: Object.freeze({ name: 'Game Camera', parent: null }),
    body: Object.freeze({ name: 'Bộ Tách Người', parent: 'camgames' }),
});

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
    { id: 'liveTranslate', name: 'Dịch Thuật LIVE' },
    { id: 'touchplay', name: 'Touch & Play', parent: 'camgames' },
    { id: 'chemtraicay', name: 'Chém Trái Cây', parent: 'camgames' },
    { id: 'dapmuoi', name: 'Đập Muỗi', parent: 'camgames' },
    { id: 'bancung', name: 'Bắn Cung', parent: 'camgames' },
    { id: 'level-quest', name: 'Level Quest', parent: 'camgames' },
    { id: 'dacau', name: 'Đá Cầu', parent: 'camgames' },
    ...BODY_SIMPLE.map(([k, name]) => ({ id: 'body-' + k, name, parent: 'body' })),
    ...BODY_VIDFX.map(([k, name]) => ({ id: 'body-vf-' + k, name, parent: 'body' })),
    ...BODY_MORPH.map(([k, name]) => ({ id: 'body-mo-' + k, name, parent: 'body' })),
].map((c) => Object.freeze({ parent: null, ...c })));

const LOCKABLE = Object.freeze(CATALOG.map((c) => c.id));
const HUB_IDS = Object.freeze(Object.keys(HUBS));

/** Game mẹ / null của một id (mục bán hoặc game mẹ). */
function parentOf(id) {
    if (HUBS[id]) return HUBS[id].parent;
    const c = CATALOG.find((x) => x.id === id);
    return c ? c.parent : null;
}
/** Con TRỰC TIẾP của game mẹ: mục bán + game mẹ cấp dưới (theo thứ tự danh mục, game mẹ con đứng cuối). */
function childrenOf(hub) {
    return [...CATALOG.filter((c) => c.parent === hub).map((c) => c.id), ...HUB_IDS.filter((h) => HUBS[h].parent === hub)];
}
/** Mọi mục BÁN nằm dưới game mẹ (đệ quy). */
function leavesOf(hub) {
    const out = [];
    for (const id of childrenOf(hub)) { if (HUBS[id]) out.push(...leavesOf(id)); else out.push(id); }
    return out;
}
// Tương thích: con của Game Camera ngày trước (5 game) — giờ là mọi con trực tiếp + 'body'.
const CAM_CHILDREN = Object.freeze(childrenOf('camgames'));

/** Chuẩn hoá: mảng → mảng chuỗi; còn lại (null, undefined, sai kiểu) → null = mở hết. */
function normalize(features) {
    return Array.isArray(features) ? features.map(String) : null;
}

/** Mục `id` có được dùng với danh sách tính năng này không. Game mẹ: có ≥ 1 mục bán bên dưới. Id ngoài danh mục luôn mở. */
function can(features, id) {
    const f = normalize(features);
    if (f === null) return true;
    if (HUBS[id]) return leavesOf(id).some((c) => f.includes(c));
    if (!LOCKABLE.includes(id)) return true;
    return f.includes(id);
}

/** Danh sách id đang bị khoá (kể cả game mẹ khi không còn con nào). [] khi mở hết. */
function lockedIds(features) {
    const f = normalize(features);
    if (f === null) return [];
    const out = LOCKABLE.filter((id) => !f.includes(id));
    for (const h of HUB_IDS) if (!can(f, h)) out.push(h);
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
 * Game mẹ (camgames, body): còn con dùng được → 'on'; mọi con Ẩn → 'hidden'; không con nào dùng được mà có
 * con Tạm tắt → 'off'; còn lại 'locked'. Tính đệ quy qua con trực tiếp (body là con của camgames).
 * `sellable` (🛒 bán game trong app — danh sách id server HP KEY cho KEY này mua, shop.php shop_items): mục KEY chưa có mà
 * server ký 'hidden' (vì "Mục chưa mở: Ẩn hẳn" — hide_locked) vẫn hiện 'locked' để khách thấy giá và mua. Server đã loại mục
 * bị admin Ẩn / Tạm tắt khỏi danh sách bán nên không bao giờ lộ mục chưa ra mắt.
 */
function stateOf(features, gameState, id, sellable) {
    const gs = normalizeState(gameState);
    const sell = sellable instanceof Set ? sellable : new Set(Array.isArray(sellable) ? sellable.map(String) : []);
    if (HUBS[id]) {
        const kids = childrenOf(id).map((c) => stateOf(features, gs, c, sell));
        if (kids.some((s) => s === 'on' || s === 'admin')) return 'on';
        if (kids.every((s) => s === 'hidden')) return 'hidden';
        if (kids.some((s) => s === 'off') && !kids.some((s) => s === 'locked')) return 'off';
        return 'locked';
    }
    const st = gs[id];
    if (st === 'off') return st;
    if (st === 'hidden') return sell.has(id) && !can(features, id) ? 'locked' : 'hidden';
    if (!can(features, id)) return 'locked';
    return st === 'admin' ? 'admin' : 'on';
}

/** { id: trạng thái } của mọi mục khoá được + các game mẹ, chỉ mục KHÁC 'on'. {} khi mở hết, mọi mục Bật. */
function states(features, gameState, sellable) {
    const out = {};
    const sell = sellable instanceof Set ? sellable : new Set(Array.isArray(sellable) ? sellable.map(String) : []);
    for (const id of [...LOCKABLE, ...HUB_IDS]) {
        const st = stateOf(features, gameState, id, sell);
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

/** Tên hiển thị kèm game mẹ: "Đá Cầu (Game Camera)", "UFO (Bộ Tách Người)". */
function fullName(id) {
    if (HUBS[id]) return HUBS[id].name;
    const c = CATALOG.find((x) => x.id === id);
    if (!c) return String(id);
    return c.parent ? c.name + ' (' + HUBS[c.parent].name + ')' : c.name;
}

/** Nội dung ô danh mục ở trang quản trị HP KEY (mỗi dòng "id|Tên"). */
function catalogText() {
    return CATALOG.map((c) => c.id + '|' + fullName(c.id)).join('\n');
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
    const name = String(fullName(id)).replace(/[<>&"]/g, '');
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
    CATALOG, LOCKABLE, HUBS, HUB_IDS, CAM_CHILDREN, BODY_SIMPLE, BODY_VIDFX, BODY_MORPH,
    parentOf, childrenOf, leavesOf, fullName, normalize, can, lockedIds, same, catalogText,
    normalizeState, stateOf, states, sameState,
    LOCK_RECHECK_MS, lockLifted, lockedPageHtml,
};
