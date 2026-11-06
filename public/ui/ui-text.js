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

    // Ô ID TikTok: chữ thường, chỉ a-z 0-9 . _ (bỏ @, dấu, khoảng trắng, ký tự đặc biệt)
    function sanitizeTiktokId(s) {
        return String(s || '').toLowerCase().replace(/[^a-z0-9._]/g, '');
    }

    // Vùng hiện tên/quà/bình luận của người xem → không đổi chữ
    const RAW = '[data-ui-raw], input, textarea, select, option, code, kbd, pre, script, style, svg, canvas, iframe, '
        + '#comments, #gift-stream, .comments-popup, .user-sugg, .conn-name, #hr-tiktok, #gift-catalog, '
        + '#vw-log, #vw-queue-list, #caro-log, #pktiktok-log, #unknown-list, #jar-history-list, [contenteditable="true"]';
    const ATTRS = ['title', 'placeholder', 'aria-label'];
    function fixTree(node) {
        if (!node) return;
        const host = node.nodeType === 1 ? node : node.parentElement;
        if (host && host.closest(RAW)) return;
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
    // Nhãn ô cài đặt bị cắt 1 dòng (ui-v2.css "Form gọn") → đủ chữ ở tooltip
    const LABELS = '.main .nt-row > span, .main .qv-row > span, .main .ctc-row > label, .main .cfg-row > label';
    function compactHints(scope) {
        const sel = HINTS + ', ' + LABELS;
        const list = scope.matches && scope.matches(sel) ? [scope] : [];
        scope.querySelectorAll && list.push(...scope.querySelectorAll(sel));
        for (const el of list) {
            if (el.dataset.uiHint) continue;   // đã xử lý (kể cả dòng ngắn) → không tính lại mỗi nhịp
            el.dataset.uiHint = '1';
            const t = el.textContent.replace(/\s+/g, ' ').trim();
            if (t.length > 24 && !el.title) el.title = t;
        }
    }

    // <option> chỉ đổi chữ khi có value riêng (game đọc value, không đọc chữ hiển thị)
    function fixOptions(scope) {
        if (!scope.querySelectorAll) return;
        for (const o of scope.querySelectorAll('option[value]')) {
            if (o.closest('[data-ui-raw]')) continue;
            const v = o.textContent, t = normalizeText(v);
            if (t !== v) o.textContent = t;
        }
    }

    function run(doc) {
        compactHeaders(doc);
        compactHints(doc);
        fixOptions(doc);
        fixTree(doc.body);
    }

    const api = { normalizeText, sanitizeTiktokId, fixTree, run };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
    root.HpUiText = api;
    const doc = root.document;
    // App chính (body.ui-v2) hoặc trang tự đánh dấu <html data-ui-text> (cửa sổ Khởi động nhanh)
    if (!doc || !doc.body || !(doc.body.classList.contains('ui-v2') || doc.documentElement.hasAttribute('data-ui-text'))) return;
    // Panel game dựng HTML khi mở màn → chỉ quét phần MỚI chèn (số liệu LIVE đổi liên tục không quét lại cả trang)
    let pending = new Set(), queued = false;
    const flush = () => {
        queued = false;
        const nodes = [...pending]; pending = new Set();
        for (const n of nodes) {
            if (!n.isConnected) continue;
            fixTree(n);
            if (n.nodeType === 1) { compactHints(n); fixOptions(n); }
        }
        compactHeaders(doc);
    };
    const start = () => {
        run(doc);
        if (!root.MutationObserver) return;
        new MutationObserver((list) => {
            for (const m of list) {
                // Cập nhật trong vùng RAW (bình luận, luồng quà…) hoặc chỉ thay chữ số liệu → bỏ qua sớm
                const t = m.target;
                if (t.nodeType === 1 && t.closest(RAW)) continue;
                for (const n of m.addedNodes) if (n.nodeType === 1 || /[—–]|tik|live|creator/i.test(n.nodeValue || '')) pending.add(n);
            }
            if (pending.size && !queued) { queued = true; setTimeout(flush, 80); }
        }).observe(doc.body, { childList: true, subtree: true });
    };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})(typeof window !== 'undefined' ? window : globalThis);
