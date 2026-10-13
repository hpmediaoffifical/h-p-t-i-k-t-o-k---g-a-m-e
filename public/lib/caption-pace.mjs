// Giữ nhịp đọc cho overlay phụ đề: câu dịch tới dồn dập thì người xem chưa kịp đọc đã bị thay.
// Mỗi câu được giữ tối thiểu theo độ dài bản dịch; câu tới sớm xếp hàng, hàng quá dài thì bỏ câu cũ
// nhất để overlay không trễ dần so với lời nói. Thuần, test bằng node (tests/caption-pace.test.mjs).

const MS_PER_CHAR = 60;      // ≈16 ký tự/giây
const BASE_MS = 1500;
const MIN_MS = 2500;
const MAX_MS = 9000;

function longestText(item) {
    const rows = Array.isArray(item && item.translations) && item.translations.length
        ? item.translations.map(r => String((r && r.translatedText) || ''))
        : [String((item && item.translatedText) || '')];
    return rows.reduce((m, t) => Math.max(m, t.length), 0);
}

export function minShowMs(item) {
    return Math.max(MIN_MS, Math.min(MAX_MS, BASE_MS + MS_PER_CHAR * longestText(item)));
}

// createLinePacer({ now, show, minShow = minShowMs, maxQueue = 4, enabled = true })
//   push(item): hiện ngay nếu câu trước đã đủ thời gian, không thì xếp hàng.
//   tick(): gọi khi tới hạn (waitMs) để hiện câu kế. pending(): số câu đang chờ. waitMs(): ms tới lần hiện kế.
export function createLinePacer({ now = () => Date.now(), show, minShow = minShowMs, maxQueue = 4, enabled = true } = {}) {
    const queue = [];
    let shownAt = -Infinity;
    let holdMs = 0;
    function display(item) {
        shownAt = now();
        holdMs = minShow(item);
        show(item);
    }
    function ready() { return now() - shownAt >= holdMs; }
    function tick() {
        while (queue.length && ready()) display(queue.shift());
    }
    return {
        push(item) {
            if (!enabled) { show(item); return; }
            if (!queue.length && ready()) { display(item); return; }
            queue.push(item);
            // Dịch song song làm câu sau có thể tới trước câu trước → hàng chờ xếp theo lúc nói (createTime).
            queue.sort((a, b) => (Number(a && a.createTime) || 0) - (Number(b && b.createTime) || 0));
            if (queue.length > maxQueue) queue.splice(0, queue.length - maxQueue);
            tick();
        },
        tick,
        pending() { return queue.length; },
        waitMs() { return queue.length ? Math.max(0, holdMs - (now() - shownAt)) : 0; },
        clear() { queue.length = 0; }
    };
}
