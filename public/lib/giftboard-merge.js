/* 📋 Bảng Quà Tổng — luật thuần: game nào lên bảng, game "đang mở kèm" gộp hay tách, quà trùng.
 * Dùng chung trình duyệt (window.HpGiftboardMerge) và node test (tests/giftboard-merge.test.js).
 * Spec: docs/superpowers/specs/2026-11-06-giftboard-theo-game-dang-chay-design.md
 */
(function (root) {
    'use strict';
    var GRACE_MS = 30000;   // game mất tín hiệu overlay vẫn giữ 30s — OBS hay tải lại trang khi đổi scene
    var VIS = ['auto', 'always', 'never'];

    // Trạng thái 1 game: 'running' (danh sách chính) | 'linked' (overlay đang mở) | 'off' (ẩn).
    // o: { visibility, running, open, lastOpenAt, now, graceMs }
    function gameStatus(o) {
        o = o || {};
        var vis = VIS.indexOf(o.visibility) >= 0 ? o.visibility : 'auto';
        if (vis === 'never') return 'off';
        if (vis === 'always' || o.running) return 'running';
        if (o.open) return 'linked';
        var grace = o.graceMs == null ? GRACE_MS : o.graceMs;
        if (o.lastOpenAt && o.now - o.lastOpenAt < grace) return 'linked';
        return 'off';
    }

    // entries: [{ gameId, giftId, generic, giftName, … }] · status: { gameId: 'running'|'linked'|'off' }
    // → { main, linked, linkedGames, overlaps: [{ giftId, giftName, games }], overlapOf: { giftId: [gameId] }, clashOf: { giftId: [gameId] } }
    // Game 'linked' KHÔNG trùng quà nào với game đang chạy → gộp vào danh sách chính; có trùng → cả game sang
    // mục "Đang mở kèm". Quà trùng chỉ để CẢNH BÁO (server vẫn phát quà cho mọi game — cả hai cùng chạy).
    function mergeBoard(entries, status) {
        status = status || {};
        var st = function (id) { return status[id] || 'off'; };
        var live = (entries || []).filter(function (e) { return e && st(e.gameId) !== 'off'; });
        var runGifts = {}, byGift = {}, nameOf = {};
        live.forEach(function (e) {
            if (e.generic || !e.giftId) return;
            var g = String(e.giftId);
            if (st(e.gameId) === 'running') runGifts[g] = true;
            (byGift[g] = byGift[g] || []);
            if (byGift[g].indexOf(e.gameId) < 0) byGift[g].push(e.gameId);
            if (!nameOf[g] && e.giftName) nameOf[g] = e.giftName;
        });
        var split = {};   // game linked có quà trùng game đang chạy → tách riêng
        live.forEach(function (e) {
            if (st(e.gameId) === 'linked' && !e.generic && e.giftId && runGifts[String(e.giftId)]) split[e.gameId] = true;
        });
        var main = [], linked = [];
        live.forEach(function (e) { (split[e.gameId] ? linked : main).push(e); });
        // overlaps: quà gán ở ≥2 game ĐANG CHẠY — nhận quà là cả hai cùng chạy.
        // clashOf: quà của game "đang mở kèm" trùng game đang chạy → [game đang chạy] (game mở kèm đang tắt nên chưa chạy).
        var overlaps = [], overlapOf = {}, clashOf = {};
        Object.keys(byGift).forEach(function (g) {
            var run = byGift[g].filter(function (id) { return st(id) === 'running'; });
            if (run.length >= 2) {
                overlapOf[g] = run;
                overlaps.push({ giftId: g, giftName: nameOf[g] || ('#' + g), games: run.slice() });
            }
            if (run.length && run.length < byGift[g].length) clashOf[g] = run;
        });
        return { main: main, linked: linked, linkedGames: Object.keys(split), overlaps: overlaps, overlapOf: overlapOf, clashOf: clashOf };
    }

    var api = { GRACE_MS: GRACE_MS, gameStatus: gameStatus, mergeBoard: mergeBoard };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.HpGiftboardMerge = api;
})(typeof window !== 'undefined' ? window : this);
