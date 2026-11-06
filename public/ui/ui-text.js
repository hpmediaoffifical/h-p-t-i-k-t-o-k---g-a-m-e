// 🎨 Giao diện mới — chuẩn hoá chữ giao diện app (không sửa chuỗi trong code từng game):
//   gạch dài "—" / "–" → "-"; chính tả mặc định TikTok · LIVE · Creator.
// Chạy trên DOM lúc nạp + sau mỗi lần mở màn (hpOpenGame) + khi có phần tử mới chèn vào .main.
// BỎ QUA: ô nhập, code/kbd, script/style, và vùng dữ liệu người xem (bình luận, luồng quà, tên…) có
// [data-ui-raw] hoặc nằm trong danh sách RAW dưới đây — tên người xem không bị đổi chữ.
(function (root) {
    const EDGE = '(?<![\\w./:-])';
    const END = '(?![\\w./:-])';
    const RULES = [
        [/\s*[—–]\s*/g, (m) => (/^\s/.test(m) || /\s$/.test(m) ? ' - ' : '-')],
        [new RegExp(EDGE + 'tik\\s?tok' + END, 'gi'), 'TikTok'],
        [new RegExp(EDGE + 'live' + END, 'gi'), 'LIVE'],
        [new RegExp(EDGE + 'creator' + END, 'gi'), 'Creator']
    ];
    function normalizeText(s) {
        if (typeof s !== 'string' || !s) return s;
        let out = s;
        for (const [re, to] of RULES) out = out.replace(re, to);
        return out;
    }

    const RAW = '[data-ui-raw], input, textarea, select, code, kbd, pre, script, style, svg, canvas, iframe, '
        + '#comments, #gift-stream, .comments-popup, .user-sugg, .lt-feed, .cc-feed, [contenteditable="true"]';
    const ATTRS = ['title', 'placeholder', 'aria-label'];
    function fixTree(node) {
        if (!node || (node.nodeType === 1 && node.closest(RAW))) return;
        if (node.nodeType === 3) {
            const v = node.nodeValue, n = normalizeText(v);
            if (n !== v) node.nodeValue = n;
            return;
        }
        if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
        const doc = node.ownerDocument || node;
        const w = doc.createTreeWalker(node, 1 | 4, {
            acceptNode: (n) => n.nodeType === 1 && n.matches(RAW) ? 2 /* REJECT cả nhánh */ : 1
        });
        for (let n = w.currentNode; n; n = w.nextNode()) {
            if (n.nodeType === 3) {
                const v = n.nodeValue, t = normalizeText(v);
                if (t !== v) n.nodeValue = t;
            } else if (n.nodeType === 1) {
                for (const a of ATTRS) {
                    const v = n.getAttribute && n.getAttribute(a);
                    if (v) { const t = normalizeText(v); if (t !== v) n.setAttribute(a, t); }
                }
            }
        }
    }

    // Header game gọn: dòng giải thích dài (.game-sub) → tooltip trên tiêu đề
    function compactHeaders(doc) {
        doc.querySelectorAll('.game-header .game-sub').forEach((sub) => {
            const h = sub.parentElement && sub.parentElement.querySelector('h2');
            const t = sub.textContent.trim();
            if (h && t && !h.title) h.title = t;
        });
    }

    // Dòng giải thích trong panel: CSS cắt còn 1 dòng (ui-v2.css .ui-clamp) → đủ chữ ở tooltip
    const HINTS = '.main .hint, .main .nd-hint, .main .nd-help, .main .nt-hint, .main .qv-hint, .main .cg-sec-hint, '
        + '.main .lcp-note, .main .caro-music-hint, .main .vw-ov-sub, .main .vc-scoring-hint, .main .vc-section-hint, '
        + '.main .nhatla-muted, .main .obse-queue-hint, .main .cg-desc, .main .gtt-desc';
    function compactHints(doc) {
        doc.querySelectorAll(HINTS).forEach((el) => {
            if (!el.title) { const t = el.textContent.replace(/\s+/g, ' ').trim(); if (t.length > 40) el.title = t; }
        });
    }

    function run(doc) {
        compactHeaders(doc);
        compactHints(doc);
        fixTree(doc.body);
    }

    const api = { normalizeText, fixTree, run };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
    root.HpUiText = api;
    const doc = root.document;
    if (!doc || !doc.body || !doc.body.classList.contains('ui-v2')) return;
    // Panel game dựng HTML khi mở màn → chỉ quét phần MỚI chèn (số liệu LIVE đổi liên tục không quét lại cả trang)
    let pending = new Set(), queued = false;
    const flush = () => {
        queued = false;
        const nodes = [...pending]; pending = new Set();
        for (const n of nodes) if (n.isConnected) fixTree(n);
        compactHeaders(doc);
        compactHints(doc);
    };
    const start = () => {
        run(doc);
        if (!root.MutationObserver) return;
        new MutationObserver((list) => {
            for (const m of list) for (const n of m.addedNodes) pending.add(n);
            if (pending.size && !queued) { queued = true; setTimeout(flush, 80); }
        }).observe(doc.body, { childList: true, subtree: true });
    };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})(typeof window !== 'undefined' ? window : globalThis);
