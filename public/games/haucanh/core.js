/* 🦊 HẬU CẢNH NPC - lõi dùng chung: server (require) + overlay + panel (<script src="/games/haucanh/core.js"> → window.HpHauCanh).
 *
 * Tracking OBS tách người: overlay Game Camera vẽ lại NPC đã tách nền (cỡ / vị trí chỉnh được) đè lên VIDEO SAU LƯNG.
 * Mỗi HỒ SƠ gắn với một NPC đã tạo ở 🎁 Hồ sơ NPC (groupId; rỗng = mọi NPC), có nhiều HIỆU ỨNG: video/ảnh sau lưng +
 * quà chỉ định riêng. Quà vẫn đi tiếp vào 🎁 BẢNG QUÀ như thường → quà trùng icon thì hiệu ứng Bảng Quà (overlay chính,
 * TRÊN cam) và hiệu ứng Hậu Cảnh (DƯỚI người) chạy CÙNG LÚC - NPC kẹp giữa 2 lớp (vd đuôi hồ ly xoè sau lưng + webm trước).
 *
 * Hồ sơ đang dùng = hồ sơ của NPC đang BẬT (theo Scene OBS / công tắc Bật ở Hồ sơ NPC), NPC bật sau cùng ưu tiên;
 * không có thì hồ sơ "Mọi NPC".
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.HpHauCanh = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MATTE = { model: 'selfie', tiles: 2, radius: 6, eps: 0.003, lo: 0.28, hi: 0.72, still: 0.3, decon: 0.7 };
    const MAX_PROFILES = 40, MAX_ITEMS = 30, MAX_LAYERS = 2;
    const FITS = ['cover', 'contain', 'stretch'];

    const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
    const str = (v, max) => String(v == null ? '' : v).slice(0, max);
    const rid = p => p + Math.random().toString(36).slice(2, 8);
    const VIDEO_EXT = /\.(mp4|webm|mov|mkv|m4v)(\?|$)/i;
    const isVideo = f => VIDEO_EXT.test(String(f || ''));

    // Một hiệu ứng sau lưng NPC.
    //   file   video / ảnh (tải vào app → /media/…, hoặc đường dẫn tuyệt đối trên máy)
    //   alpha  video có nền trong suốt (webm alpha): KHÔNG che camera gốc, chỉ chèn giữa nền camera và người
    //   startMs / endMs ⏱ MỌI video có mốc BẮT ĐẦU + KẾT THÚC (ms kể từ đầu lượt, 1 giây = 1000 ms - user 2026-10-23): video chính hiện
    //           từ startMs; endMs 0 = KẾT THÚC Ở CUỐI VIDEO (phát một lần, ảnh: 6 giây) · >0 = tắt đúng mốc (video ngắn hơn thì lặp).
    //           durSec (cũ, giây) chỉ còn là bản chiếu của endMs để config / mã cũ đọc được.
    //   scale  0 = theo cỡ NPC của hồ sơ · 30..200 = cỡ NPC riêng lúc chạy hiệu ứng này (%)
    //   hideCam ẩn cam gốc lúc chạy (server dời camera ra ngoài khung OBS, overlay vẽ lại cả nền phòng + người từ cùng ảnh chụp)
    //   layers  🎞 LỚP SAU XA HƠN (user 2026-10-23: 3 lớp hồ ly = nền hoa đào · 9 đuôi · ho ly cưỡi): tối đa MAX_LAYERS lớp
    //           { file, startMs, endMs } vẽ DƯỚI `file`: `file` = Lớp 1 (gần cam nhất), layers[0] = Lớp 2 ngay dưới, layers[1] = Lớp 3
    //           dưới nữa (đầu danh sách = GẦN nhất - user 2026-10-23), cùng fit / mờ vào-ra; luôn câm, luôn
    //           coi là trong suốt (webm alpha / .pack.mp4). Mốc như video chính - streamer tự căn lúc xuất hiện của từng lớp; lớp quá
    //           lượt thì cắt theo lượt. Lớp TRƯỚC NPC = webm của 🎁 Bảng Quà cùng quà (overlay trên cam) + 🔗 Kèm Bảng Quà.
    function makeItem(over = {}) {
        return { id: rid('hc'), name: 'Hiệu ứng', gifts: [], file: '', layers: [], sound: true, alpha: false, hideCam: true, fit: 'cover', startMs: 0, endMs: 0, durSec: 0, scale: 0, ...over };
    }
    const MAX_MS = 600000;
    const ms = (v, d = 0) => Math.round(num(v, d, 0, MAX_MS));
    const makeLayer = (file = '', over = {}) => ({ file: str(file, 1000).trim(), startMs: 0, endMs: 0, ...over });
    function normalizeLayer(x) {
        const s = typeof x === 'string' ? { file: x } : (x && typeof x === 'object' ? x : {});
        const file = str(s.file, 1000).trim();
        return file ? { file, startMs: ms(s.startMs), endMs: ms(s.endMs) } : null;
    }
    const layersOf = v => (Array.isArray(v) ? v : []).map(normalizeLayer).filter(Boolean).slice(0, MAX_LAYERS);
    function makeProfile(over = {}) {
        return { id: rid('hs'), groupId: '', scale: 100, x: 0, y: 0, idleFile: '', idleAlpha: false, fadeMs: 350, items: [makeItem({ name: 'Hiệu ứng 1' })], ...over };
    }
    function defaultConfig() {
        return { enabled: true, queueMax: 6, comboMax: 3, profiles: [], matte: { ...MATTE } };
    }

    function normalizeGift(g) {
        if (!g || typeof g !== 'object' || !g.giftId) return null;
        return { giftId: str(g.giftId, 40), giftName: str(g.giftName, 80), giftImage: str(g.giftImage, 600) };
    }
    function normalizeItem(x, i) {
        const s = x && typeof x === 'object' ? x : {};
        const d = makeItem({ id: 'hc' + (i + 1) });
        const scale = num(s.scale, 0, 0, 200);
        // config cũ chỉ có durSec (giây) → endMs; có endMs thì endMs là chuẩn.
        const endMs = ms(s.endMs, num(s.durSec, 0, 0, 600) * 1000);
        return {
            id: str(s.id || d.id, 24), name: str(s.name || ('Hiệu ứng ' + (i + 1)), 60),
            gifts: (Array.isArray(s.gifts) ? s.gifts : []).map(normalizeGift).filter(Boolean).slice(0, 40),
            file: str(s.file, 1000).trim(), layers: layersOf(s.layers), sound: s.sound !== false, alpha: s.alpha === true, hideCam: s.hideCam !== false,
            fit: FITS.includes(s.fit) ? s.fit : 'cover', startMs: ms(s.startMs), endMs, durSec: endMs / 1000,
            scale: scale > 0 && scale < 30 ? 30 : scale
        };
    }
    function uniqIds(list) {
        const seen = new Set();
        for (const x of list) { while (seen.has(x.id)) x.id += '_'; seen.add(x.id); }
        return list;
    }
    function normalizeProfile(p, i) {
        const s = p && typeof p === 'object' ? p : {};
        const d = makeProfile({ id: 'hs' + (i + 1) });
        const items = (Array.isArray(s.items) ? s.items : []).filter(x => x && typeof x === 'object').slice(0, MAX_ITEMS).map(normalizeItem);
        return {
            id: str(s.id || d.id, 24), groupId: str(s.groupId, 80),
            scale: num(s.scale, 100, 30, 200), x: num(s.x, 0, -60, 60), y: num(s.y, 0, -60, 60),
            idleFile: str(s.idleFile, 1000).trim(), idleAlpha: s.idleAlpha === true, fadeMs: num(s.fadeMs, 350, 0, 3000),
            items: uniqIds(items)
        };
    }
    function normalizeConfig(c) {
        const src = c && typeof c === 'object' ? c : {};
        const d = defaultConfig();
        const profiles = (Array.isArray(src.profiles) ? src.profiles : []).filter(x => x && typeof x === 'object').slice(0, MAX_PROFILES).map(normalizeProfile);
        return { ...d, ...src, enabled: src.enabled !== false, queueMax: num(src.queueMax, d.queueMax, 1, 30), comboMax: num(src.comboMax, d.comboMax, 1, 10),
            profiles: uniqIds(profiles), matte: { ...d.matte, ...(src.matte && typeof src.matte === 'object' ? src.matte : {}) } };
    }

    // NPC đang bật (không tính MẶC ĐỊNH), bật sau cùng đứng trước - cùng luật activeNpcGroupId (lib/shared-effect-rules.mjs).
    function enabledNpcIds(groups) {
        return (Array.isArray(groups) ? groups : [])
            .filter(g => g && g.id && g.id !== 'common' && g.enabled !== false)
            .sort((a, b) => Number(b.activatedAt || 0) - Number(a.activatedAt || 0))
            .map(g => String(g.id));
    }
    // Hồ sơ áp dụng lúc này: hồ sơ của các NPC đang bật (theo thứ tự trên), rồi tới hồ sơ "Mọi NPC" (groupId rỗng).
    function candidates(cfg, npcIds) {
        const profiles = (cfg && cfg.profiles) || [];
        const out = [];
        for (const id of npcIds || []) for (const p of profiles) if (p.groupId === id && !out.includes(p)) out.push(p);
        for (const p of profiles) if (!p.groupId && !out.includes(p)) out.push(p);
        return out;
    }
    function activeProfile(cfg, npcIds) { return candidates(cfg, npcIds)[0] || null; }
    // Quà → hiệu ứng đầu tiên (theo thứ tự hồ sơ ở trên, trong hồ sơ thì hiệu ứng trên cùng) có quà đó. So theo id quà.
    function pickForGift(cfg, npcIds, giftId) {
        const gid = String(giftId || '');
        if (!gid) return null;
        for (const p of candidates(cfg, npcIds)) {
            for (const it of p.items) {
                const gift = it.gifts.find(g => String(g.giftId) === gid);
                if (gift) return { profile: p, item: it, gift };
            }
        }
        return null;
    }

    // Thời lượng một lượt (ms) = mốc kết thúc của video chính: endMs (hoặc durSec cũ) nếu đặt; không thì startMs + hết video
    // (ảnh: 6 giây). dur = độ dài video (giây) nếu đã biết.
    function runMs(item, dur) {
        const end = item.endMs > 0 ? item.endMs : item.durSec > 0 ? item.durSec * 1000 : 0;
        if (end > 0) return end;
        const start = Number(item.startMs) || 0;
        if (isVideo(item.file)) return Number.isFinite(dur) && dur > 0 ? start + Math.min(600, dur) * 1000 : NaN;
        return start + 6000;
    }

    return { MATTE, FITS, MAX_LAYERS, defaultConfig, makeItem, makeLayer, makeProfile, normalizeItem, normalizeProfile, normalizeConfig,
        enabledNpcIds, candidates, activeProfile, pickForGift, runMs, isVideo };
});
