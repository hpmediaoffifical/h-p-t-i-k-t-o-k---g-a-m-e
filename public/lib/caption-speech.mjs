// Logic thuần của trang nghe giọng (public/listen/caption.js) — không đụng DOM/socket để test
// bằng node --test (tests/caption-speech.test.mjs).

function cleanText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
}

// Gộp kết quả SpeechRecognitionEvent thành { partial, finals }.
// Quét MỌI result chứ không chỉ từ resultIndex: Chromium đôi khi phát lại result cũ, và nếu một
// event bị bỏ lỡ thì câu final ở trước resultIndex vẫn được gửi. Mỗi final chỉ gửi đúng 1 lần theo
// chỉ số trong phiên; Chromium đánh số lại sau mỗi start() nên caller gọi newSession() lúc đó.
export function createResultTracker() {
    let emitted = new Set();
    return {
        newSession() { emitted = new Set(); },
        onResult(ev) {
            const results = (ev && ev.results) || [];
            const finals = [];
            const partials = [];
            for (let i = 0; i < results.length; i++) {
                const r = results[i];
                if (!r) continue;
                const text = cleanText(r[0] && r[0].transcript);
                if (r.isFinal) {
                    if (emitted.has(i)) continue;
                    emitted.add(i);
                    if (text) finals.push(text);
                } else if (text) {
                    partials.push(text);
                }
            }
            return { partial: partials.join(' ').trim(), finals };
        }
    };
}

// Mã lỗi SpeechRecognition không thể tự bật lại — cần người dùng can thiệp.
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported']);

export function isFatalError(reason) {
    return FATAL_ERRORS.has(String(reason || ''));
}

// Thời gian chờ (ms) trước khi start() lại sau onend; -1 = không bật lại.
export function restartDelay({ reason = '', hadResults = false, emptySessions = 0, networkErrors = 0 } = {}) {
    if (isFatalError(reason)) return -1;
    if (reason === 'network') {
        if (networkErrors > 5) return -1;
        return Math.min(30000, 1000 * 2 ** (Math.max(1, networkErrors) - 1));
    }
    if (reason === 'no-speech') return 0;
    if (hadResults) return 300;
    return Math.min(5000, 500 * Math.max(1, emptySessions));
}

// Tự ngắt câu: streamer nói liền mạch thì trình duyệt chốt câu rất muộn (câu dài, dịch tới trễ).
// Từ lúc có chữ tạm đầu tiên (startedAt) mà quá maxSeconds hoặc quá maxWords từ → caller gọi
// recognition.stop() để chốt ngay đoạn đã nghe. maxSeconds = 0 → tắt theo thời gian; maxWords = 0 → tắt theo từ.
export function shouldForceCut({ startedAt = 0, now = 0, words = 0, maxSeconds = 6, maxWords = 18 } = {}) {
    if (!startedAt) return false;
    if (maxSeconds > 0 && now - startedAt >= maxSeconds * 1000) return true;
    if (maxWords > 0 && words >= maxWords) return true;
    return false;
}

// Giới hạn tự ngắt từ cấu hình: segmentSeconds = 0 → TẮT HẲN (cả giới hạn từ), không thì N giây + maxWords từ.
export function cutLimits(segmentSeconds, maxWords = 18) {
    const s = Number(segmentSeconds);
    const maxSeconds = Number.isFinite(s) ? s : 6;
    return maxSeconds > 0 ? { maxSeconds, maxWords } : { maxSeconds: 0, maxWords: 0 };
}

// Tiết lưu chữ tạm: tối đa 1 lần / intervalMs, bỏ text trùng text vừa gửi; chuỗi rỗng (xoá dòng
// tạm) đi ngay. flush() trả text đang giữ (gọi khi phiên kết thúc).
export function createPartialThrottle(intervalMs = 100, now = () => Date.now()) {
    let lastSent = null;
    let lastAt = -Infinity;
    let pending = null;
    return {
        push(text) {
            const t = String(text == null ? '' : text);
            if (t === lastSent) { pending = null; return null; }
            if (t === '' || now() - lastAt >= intervalMs) {
                lastSent = t;
                lastAt = now();
                pending = null;
                return t;
            }
            pending = t;
            return null;
        },
        flush() {
            if (pending === null || pending === lastSent) { pending = null; return null; }
            const t = pending;
            pending = null;
            lastSent = t;
            lastAt = now();
            return t;
        }
    };
}
