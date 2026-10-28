/* 🏃 BỊ ĐUỔI - lõi dùng chung: server (require) + overlay + panel (<script src="/games/biduoi/core.js"> → window.HpBiDuoi).
 *
 * Một lượt (kịch bản): chờ biểu diễn → chân hoá VÒNG TRÒN quay tít kiểu hoạt hình (lấy đà) → phóng ra khỏi màn theo
 * hướng chọn (khói dưới chân) → [vòng chạy xa: chạy ngang qua màn, người nhỏ dần như chạy theo con đường vào sâu] →
 * vắng N giây (video đuổi bắt) → chạy về lại từ hướng chọn, phanh trượt → chân trở lại bình thường.
 * Mỗi kịch bản có nhiều VIDEO nền (chó đuổi, bà già đuổi, zombie, cảnh sát…): ngẫu nhiên (không lặp liền) hoặc chỉ định 1.
 * Server chọn video (pickVideo) rồi gửi kèm sự kiện → OBS và khung xem trước phát cùng một video.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.HpBiDuoi = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const TIMING = { waitSec: 1, windupSec: 1.2, exitMs: 550, awaySec: 1.5, returnMs: 800, settleMs: 450 };
    // Một vòng chạy xa: chạy ngang qua màn theo `dir` (right = trái → phải). scale / y lúc vào màn → scaleEnd / yEnd lúc ra
    // (y = chỗ CHÂN, phần màn hình tính từ trên xuống) - khớp con đường to → nhỏ trong video nền.
    const PASS = { dir: 'right', gapSec: 1, ms: 1100, scale: 0.6, scaleEnd: 0.6, y: 0.8, yEnd: 0.8 };
    const MAX_PASSES = 4, MAX_VIDEOS = 20;
    const MATTE = { model: 'selfie', tiles: 2, radius: 6, eps: 0.003, lo: 0.28, hi: 0.72, still: 0.3, decon: 0.7 };
    // 🧊 2.5D (bật/tắt từng món; ⚡ lite = tắt hết phần thêm + bóng mờ khi máy yếu):
    //   tint   - hoà màu / độ sáng người theo video nền (người không còn như dán lên nền), tintAmt = mức hoà
    //   shadow - bóng đổ dài trên mặt đất theo hướng sáng shadowDir (−1 bóng ngả trái, +1 ngả phải)
    //   camera - máy quay động: dồn vào mặt lúc lấy đà, giật về khi phóng, lia theo khi chạy xa, rung khi phanh
    const LOOK = { tint: true, tintAmt: 0.3, shadow: true, shadowDir: -1, camera: true, lite: false };
    // 📐 Phối cảnh: bật thì CỠ người ở vòng chạy xa tự tính theo chỗ chân so với đường chân trời (horizon, phần màn hình từ trên)
    const PERSP = { on: false, horizon: 0.42 };

    const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
    const side = (v, d) => (v === 'left' || v === 'right' ? v : d);
    const flip = d => (d === 'left' ? 'right' : 'left');
    const rid = p => p + Math.random().toString(36).slice(2, 8);

    function defaultPasses() {
        return [{ ...PASS }, { ...PASS, dir: 'left', scale: 0.38, scaleEnd: 0.38, y: 0.7, yEnd: 0.7 }];
    }
    function normPass(p, i) {
        const s = p && typeof p === 'object' ? p : {};
        const scale = num(s.scale, PASS.scale, 0.05, 1.5), y = num(s.y, PASS.y, 0.05, 1.2);
        return { dir: side(s.dir, i % 2 ? 'left' : 'right'), gapSec: num(s.gapSec, PASS.gapSec, 0, 30), ms: num(s.ms, PASS.ms, 150, 10000),
            scale, scaleEnd: num(s.scaleEnd, scale, 0.02, 1.5), y, yEnd: num(s.yEnd, y, 0.05, 1.2) };
    }
    function normVideo(v) {
        const s = typeof v === 'string' ? { file: v } : (v && typeof v === 'object' ? v : {});
        const file = String(s.file || '').slice(0, 1000).trim();
        // fg = lớp TRƯỚC người (webm trong suốt / png) phát cùng nhịp video nền: kẻ đuổi lao ngang trước mặt, bụi cây che người…
        return file ? { file, name: String(s.name || '').slice(0, 60), fg: String(s.fg || '').slice(0, 1000).trim() } : null;
    }
    function makeScript(over = {}) {
        return { id: rid('bd'), name: 'Bị đuổi', gifts: [], videos: [], pick: 'random', pickIdx: 0, bgSound: true,
            exitDir: 'left', returnDir: 'right', passes: defaultPasses(),
            wheel: true, smoke: true, lines: true, sfx: true, hip: 0.52, persp: { ...PERSP },
            ...over, timing: { ...TIMING, ...(over.timing || {}) } };
    }
    function normalizeScript(x, i) {
        const s = x && typeof x === 'object' ? x : {};
        const d = makeScript({ id: 'bd' + (i + 1) });
        const T = s.timing && typeof s.timing === 'object' ? s.timing : {};
        const videos = (Array.isArray(s.videos) ? s.videos : []).map(normVideo).filter(Boolean).slice(0, MAX_VIDEOS);
        return {
            id: String(s.id || d.id).slice(0, 24), name: String(s.name || d.name).slice(0, 60),
            gifts: Array.isArray(s.gifts) ? s.gifts.filter(g => g && g.giftId) : [],
            videos, pick: s.pick === 'fixed' ? 'fixed' : 'random',
            pickIdx: Math.min(Math.max(0, videos.length - 1), Math.max(0, Math.floor(Number(s.pickIdx) || 0))),
            bgSound: s.bgSound !== false,
            exitDir: side(s.exitDir, d.exitDir), returnDir: side(s.returnDir, d.returnDir),
            passes: (Array.isArray(s.passes) ? s.passes : d.passes).slice(0, MAX_PASSES).map(normPass),
            wheel: s.wheel !== false, smoke: s.smoke !== false, lines: s.lines !== false, sfx: s.sfx !== false,
            hip: num(s.hip, d.hip, 0.3, 0.75),
            persp: { on: !!(s.persp && s.persp.on), horizon: num(s.persp && s.persp.horizon, PERSP.horizon, 0.02, 0.9) },
            timing: {
                waitSec: num(T.waitSec, TIMING.waitSec, 0, 30), windupSec: num(T.windupSec, TIMING.windupSec, 0, 10),
                exitMs: num(T.exitMs, TIMING.exitMs, 100, 5000), awaySec: num(T.awaySec, TIMING.awaySec, 0, 60),
                returnMs: num(T.returnMs, TIMING.returnMs, 150, 5000), settleMs: num(T.settleMs, TIMING.settleMs, 100, 3000)
            }
        };
    }
    function normalizeScripts(cfg) {
        const src = cfg && typeof cfg === 'object' ? cfg : {};
        let list = Array.isArray(src.scripts) ? src.scripts.filter(x => x && typeof x === 'object') : [];
        if (!list.length) list = [{ id: 'bd1' }];
        const seen = new Set();
        return list.map((x, i) => {
            const sc = normalizeScript(x, i);
            while (seen.has(sc.id)) sc.id += '_';
            seen.add(sc.id);
            return sc;
        });
    }
    function defaultConfig() {
        // 🏠 Phòng thật là mặc định (user chốt 2026-10-17, như Rơi Hố). bgModeV 2: cấu hình cũ còn mặc định 'effect' → 'room' một lần.
        return { enabled: true, queueMax: 10, bgMode: 'room', bgModeV: 2, sfxVolume: 0.6, look: { ...LOOK }, scripts: [makeScript({ id: 'bd1' })], matte: { ...MATTE } };
    }
    function normalizeConfig(c) {
        const src = c && typeof c === 'object' ? c : {};
        const d = defaultConfig();
        const valid = ['effect', 'always', 'none', 'room'].includes(src.bgMode) ? src.bgMode : d.bgMode;
        return { ...d, ...src, bgMode: src.bgModeV === 2 ? valid : (valid === 'effect' ? 'room' : valid), bgModeV: 2,
            queueMax: num(src.queueMax, d.queueMax, 1, 50), sfxVolume: num(src.sfxVolume, d.sfxVolume, 0, 1),
            look: normalizeLook(src.look), scripts: normalizeScripts(src), matte: { ...d.matte, ...(src.matte || {}) } };
    }
    function normalizeLook(l) {
        const s = l && typeof l === 'object' ? l : {};
        return { tint: s.tint !== false, tintAmt: num(s.tintAmt, LOOK.tintAmt, 0, 1), shadow: s.shadow !== false,
            shadowDir: num(s.shadowDir, LOOK.shadowDir, -1.5, 1.5), camera: s.camera !== false, lite: s.lite === true };
    }

    // Chọn video nền cho một lượt. last = chỉ số lần trước của kịch bản này (ngẫu nhiên thì không lặp liền khi có ≥2 video).
    function pickVideo(sc, last, rnd = Math.random) {
        const n = sc && Array.isArray(sc.videos) ? sc.videos.length : 0;
        if (!n) return -1;
        if (sc.pick === 'fixed') return Math.min(n - 1, Math.max(0, sc.pickIdx | 0));
        if (n === 1) return 0;
        let i = Math.floor(rnd() * (n - (last >= 0 && last < n ? 1 : 0)));
        if (last >= 0 && last < n && i >= last) i++;
        return i;
    }

    // Mốc thời gian (ms tính từ lúc bắt đầu lượt).
    function plan(sc) {
        const T = sc.timing;
        const P = { exitDir: sc.exitDir, returnDir: sc.returnDir, persp: sc.persp || { on: false } };
        P.waitEnd = T.waitSec * 1000;
        P.windEnd = P.waitEnd + T.windupSec * 1000;
        P.exitEnd = P.windEnd + T.exitMs;
        let t = P.exitEnd;
        P.passes = sc.passes.map(p => { const start = t + p.gapSec * 1000, end = start + p.ms; t = end; return { ...p, start, end }; });
        P.retStart = t + T.awaySec * 1000;
        P.retEnd = P.retStart + T.returnMs;
        P.settleEnd = P.retEnd + T.settleMs;
        P.endAt = P.settleEnd + 250;
        return P;
    }

    // 📐 Cỡ người theo phối cảnh: 1 ở chỗ chân thật, 0 ở đường chân trời (tỉ lệ thẳng theo khoảng cách tới chân trời).
    // 0 = không áp (tắt / chân thật nằm trên chân trời - cấu hình vô nghĩa thì giữ cỡ đặt tay).
    function perspScale(P, g, y) {
        if (!P.persp || !P.persp.on) return 0;
        const hz = (g.vy || 0) + P.persp.horizon * (g.vh || g.H), base = g.homeY - hz;
        if (base < 40) return 0;
        return Math.min(1.5, Math.max(0.03, (y - hz) / base));
    }
    const clamp01 = t => (t < 0 ? 0 : t > 1 ? 1 : t);
    const lerp = (a, b, k) => a + (b - a) * k;
    const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    // Phanh trượt: lố qua chỗ cũ một chút rồi lùi về.
    const easeOutBack = (t, c = 1.25) => { t = clamp01(t) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };

    /* Người ở đâu tại mốc e (ms). g = { homeX, homeY, halfW, W, H, vy?, vh? } - chỗ chân thật trên sân khấu + nửa bề ngang người;
     * vy / vh = 👁 dải dọc sân khấu còn thấy trên OBS (Scene PK cắt ô) - y vòng chạy xa / chân trời tính theo dải này (thiếu = cả H).
     * Trả { phase, visible, x, y, s, wheel (0..1 độ hoá vòng tròn), spin (tốc độ quay 0..1), lean (rad), dir (+1 phải, −1 trái, 0 đứng),
     *       k (tiến độ pha), pass (chỉ số vòng chạy xa) }. x, y = chỗ đặt CHÂN; s = tỉ lệ người. */
    function stateAt(P, e, g) {
        const off = (d, s) => (d === 'left' ? -(g.halfW * s + 60) : g.W + g.halfW * s + 60);
        const sgn = d => (d === 'left' ? -1 : 1);
        const home = { visible: true, x: g.homeX, y: g.homeY, s: 1, wheel: 0, spin: 0, lean: 0, dir: 0, k: 0, pass: -1 };
        if (e < P.waitEnd) return { ...home, phase: 'wait', k: P.waitEnd ? e / P.waitEnd : 1 };
        if (e < P.windEnd) {
            const k = clamp01((e - P.waitEnd) / (P.windEnd - P.waitEnd));
            // lấy đà: chân hoá vòng tròn trong ~300 ms đầu, quay nhanh dần, người ngả NGƯỢC hướng sắp chạy
            return { ...home, phase: 'windup', k, wheel: clamp01((e - P.waitEnd) / 300), spin: 0.35 + 0.65 * k, lean: -sgn(P.exitDir) * 0.07 * Math.sin(Math.min(1, k * 1.4) * Math.PI / 2) };
        }
        if (e < P.exitEnd) {
            const k = clamp01((e - P.windEnd) / (P.exitEnd - P.windEnd));
            const u = Math.pow(k, 1.6);              // phóng: chậm đúng một nhịp rồi vút
            return { ...home, phase: 'exit', k, x: lerp(g.homeX, off(P.exitDir, 1), u), wheel: 1, spin: 1, lean: sgn(P.exitDir) * 0.13, dir: sgn(P.exitDir) };
        }
        for (let i = 0; i < P.passes.length; i++) {
            const p = P.passes[i];
            if (e < p.start) return { ...home, phase: 'away', visible: false, k: 0, pass: i };
            if (e < p.end) {
                const k = clamp01((e - p.start) / (p.end - p.start));
                const y = (g.vy || 0) + lerp(p.y, p.yEnd, k) * (g.vh || g.H);
                const s = perspScale(P, g, y) || lerp(p.scale, p.scaleEnd, k);
                const x = lerp(off(flip(p.dir), s), off(p.dir, s), k);
                return { ...home, phase: 'pass', k, pass: i, x, y, s, wheel: 1, spin: 1, lean: sgn(p.dir) * 0.13, dir: sgn(p.dir) };
            }
        }
        if (e < P.retStart) return { ...home, phase: 'away', visible: false, k: clamp01((e - (P.passes.length ? P.passes[P.passes.length - 1].end : P.exitEnd)) / Math.max(1, P.retStart - (P.passes.length ? P.passes[P.passes.length - 1].end : P.exitEnd))) };
        if (e < P.retEnd) {
            const k = clamp01((e - P.retStart) / (P.retEnd - P.retStart));
            const from = off(P.returnDir, 1), d = -sgn(P.returnDir);      // vào từ bên trái thì chạy sang phải
            // gần tới nơi: ngả ngược ra sau như đang phanh
            return { ...home, phase: 'return', k, x: lerp(from, g.homeX, easeOutBack(k)), wheel: 1, spin: 1 - 0.4 * clamp01((k - 0.7) / 0.3),
                lean: k < 0.7 ? d * 0.13 : d * lerp(0.13, -0.09, easeInOut((k - 0.7) / 0.3)), dir: d };
        }
        if (e < P.settleEnd) {
            const k = clamp01((e - P.retEnd) / (P.settleEnd - P.retEnd));
            return { ...home, phase: 'settle', k, wheel: 1 - k, spin: 0.6 * (1 - k), lean: sgn(P.returnDir) * 0.09 * (1 - easeInOut(k)) };   // hết ngả phanh (cùng dấu cuối pha return)
        }
        return { ...home, phase: 'done', k: 1 };
    }

    return { TIMING, PASS, MAX_PASSES, MAX_VIDEOS, MATTE, LOOK, PERSP, normalizeLook, perspScale, defaultPasses, makeScript, normalizeScript, normalizeScripts,
        defaultConfig, normalizeConfig, pickVideo, plan, stateAt };
});
