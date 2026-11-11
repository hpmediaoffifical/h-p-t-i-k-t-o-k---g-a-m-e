'use strict';
/**
 * 🎧 Gọi Bài — ⚡ CHỈ PHÁT ĐOẠN HAY NHẤT (hàm thuần). Test: tests/goibai-clip.test.js. Spec §10.1.
 *
 * Xu của bài → thời lượng đoạn (clipLength). Heatmap YouTube (`yt-dlp -j` → `heatmap`, ~100 khúc) → đoạn có tổng
 * nhiệt cao nhất (pickSegment). Nối dài khi được tặng thêm (growClip).
 *
 * Bẫy: nhiều video có "đỉnh" giả ở giây 0 (người xem mở video) → bỏ 10% đầu.
 * Đoạn: { start, end|null, len|null, full, src:'heat'|'head'|'full' } — end null = phát hết bài.
 */

const SKIP_HEAD = 0.1;

/** Thời lượng đoạn (giây) theo xu; null = cả bài. */
function clipLength(coins, cfg) {
    if (!cfg || cfg.clipOn === false) return null;
    const c = Number(coins) || 0;
    if (c >= cfg.clipFullCoins) return null;
    return c >= cfg.clipMidCoins ? cfg.clipLongSec : cfg.clipShortSec;
}

function normalizeHeatmap(h) {
    if (!Array.isArray(h)) return [];
    return h.map(x => ({ s: Number(x && x.start_time), e: Number(x && x.end_time), v: Number(x && x.value) }))
        .filter(x => Number.isFinite(x.s) && Number.isFinite(x.e) && Number.isFinite(x.v) && x.e > x.s && x.v >= 0)
        .sort((a, b) => a.s - b.s);
}

const FULL = Object.freeze({ start: 0, end: null, len: null, full: true, src: 'full' });
const r1 = (x) => Math.round(x * 10) / 10;

/**
 * @param {Array} heatmap  dạng thô của yt-dlp hoặc đã normalize
 * @param {number} duration  giây
 * @param {number|null} len  thời lượng đoạn; null = cả bài
 */
function pickSegment(heatmap, duration, len) {
    const dur = Number(duration) || 0;
    if (len == null || !(len > 0) || (dur > 0 && len >= dur)) return Object.assign({}, FULL);
    const h = heatmap && heatmap.length && heatmap[0] && 's' in heatmap[0] ? heatmap : normalizeHeatmap(heatmap);
    if (!h.length || !(dur > 0)) return { start: 0, end: len, len, full: false, src: 'head' };

    const maxStart = dur - len;
    const lo = Math.min(dur * SKIP_HEAD, maxStart);
    const sum = (s) => {
        const e = s + len;
        let t = 0;
        for (const k of h) { const o = Math.min(e, k.e) - Math.max(s, k.s); if (o > 0) t += o * k.v; }
        return t;
    };
    const starts = [];
    for (let s = lo; s < maxStart; s += 1) starts.push(s);
    starts.push(maxStart);
    let best = -Infinity;
    const vals = starts.map(s => { const v = sum(s); if (v > best) best = v; return v; });
    // Nhiều cửa sổ hoà (đỉnh hẹp hơn đoạn) → lấy cửa sổ GIỮA để đỉnh nằm giữa đoạn, không sát mép.
    const ties = starts.filter((s, i) => vals[i] >= best - 1e-9 * Math.max(1, best));
    let start = ties[Math.floor((ties.length - 1) / 2)];
    // Lùi về đầu khúc nhiệt chứa điểm đầu (khúc ~1% bài) — đỡ cắt ngang câu hát hơn một mốc giây bất kỳ.
    const seg = h.find(k => k.s <= start && start < k.e);
    if (seg && seg.s >= lo) start = seg.s;
    start = r1(start);
    return { start, end: r1(start + len), len, full: false, src: 'heat' };
}

/** Nối dài đoạn đang phát. Trả đoạn mới, hoặc null nếu không đổi (không bao giờ rút ngắn). */
function growClip(clip, newLen, duration) {
    if (!clip || clip.full) return null;
    const dur = Number(duration) || 0;
    if (newLen == null) return Object.assign({}, clip, { end: null, len: null, full: true });
    if (!(newLen > (clip.len || 0))) return null;
    const end = r1(clip.start + newLen);
    if (dur > 0 && end >= dur) return Object.assign({}, clip, { end: null, len: null, full: true });
    return Object.assign({}, clip, { end, len: newLen });
}

module.exports = { clipLength, pickSegment, growClip, normalizeHeatmap, SKIP_HEAD };
