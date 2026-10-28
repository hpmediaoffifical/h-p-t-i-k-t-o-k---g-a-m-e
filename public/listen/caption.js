// Trang nghe giọng Creator — chạy trong Edge/Chrome thật (cửa sổ --app do server mở), vì
// Electron không có khoá dịch vụ Web Speech. Nghe bằng webkitSpeechRecognition, đẩy chữ tạm /
// câu final / trạng thái về server qua socket.io. Logic thuần ở /lib/caption-speech.mjs.
import { createResultTracker, restartDelay, createPartialThrottle, shouldForceCut, cutLimits } from '/lib/caption-speech.mjs';
import { openMicPipeline, listMics } from '/listen/mic-pipeline.js';

const qs = new URLSearchParams(location.search);
const browser = qs.get('browser') === 'chrome' ? 'chrome' : 'edge';
const $ = (id) => document.getElementById(id);
const el = {
    browser: $('browser'), lang: $('lang'), micLabel: $('mic-label'), micHint: $('mic-hint'),
    interim: $('interim'), last: $('last'), status: $('status'), btnStop: $('btn-stop'), btnStart: $('btn-start'), btnClose: $('btn-close'),
    gate: $('gate'), gateLevel: $('gate-level'), gateFloor: $('gate-floor'), gateText: $('gate-text')
};
el.browser.textContent = browser === 'chrome' ? 'Chrome' : 'Edge';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const socket = io({ reconnection: true, reconnectionDelay: 600, reconnectionDelayMax: 5000 });

let cfg = { sourceLang: 'vi-VN' };
let lang = 'vi-VN';
let rec = null;
let active = false;          // app/người dùng muốn nghe
let phase = 'idle';          // idle | starting | listening | stopping
let langSwitch = false;      // abort() để đổi ngôn ngữ / micro / mức lọc, không tính là lỗi
let lastError = '';
let hadResults = false;
let emptySessions = 0;
let networkErrors = 0;
let restartTimer = null;
let micLabel = '';
let state = 'idle';          // báo server: starting | listening | idle | error
let stateError = '';
let connectedOnce = false;
let resultCount = 0;         // số lần onresult trong phiên hiện tại (chẩn đoán)
// Tự ngắt câu: nói liền mạch quá cfg.segmentSeconds (hoặc 18 từ) → stop() để chốt đoạn đã nghe rồi nghe tiếp ngay.
const CUT_MAX_WORDS = 18;
let segmentStartedAt = 0;    // lúc có chữ tạm đầu tiên của câu đang nói
let cutting = false;         // đã gọi stop() để chốt, chờ onend
let cutPartial = '';         // chữ tạm lúc ngắt — trình duyệt không chốt final thì gửi chữ này
let cuts = 0;                // số lần tự ngắt (chẩn đoán)
let closeTimer = null;       // window.close() đang chờ — huỷ nếu app bảo nghe lại ngay
// Đường micro riêng (chọn thiết bị + lọc nhạc nền) → rec.start(track). Không dựng được thì quay về
// rec.start() trơn (trình duyệt tự nghe micro mặc định, không lọc) như bản cũ.
let pipe = null;             // { track, label, level, live(), close() } đang mở
let pipeKey = '';            // mức lọc|micro của pipe — cấu hình đổi thì mở lại
let pipeIdleTimer = null;    // tạm dừng lâu thì nhả micro
let startToken = 0;          // start() mới huỷ lần mở micro đang chờ của start() cũ
let acquiring = false;       // đang chờ mở micro (rec.start() chưa gọi)
let filterState = '';        // báo app: off | normal | strong | fallback
let filterError = '';        // vì sao phải quay về nghe trơn (chẩn đoán)
let mics = [];               // tên các micro trình duyệt thấy (cho ô chọn micro trong app)
let gateInfo = null;         // số đo cổng gần nhất { open, levelDb, floorDb, openRatio }
const PIPE_IDLE_MS = 60000;
// Mức giọng streamer cổng đã học — nhớ theo micro (profile riêng của cửa sổ nghe) để buổi sau chặn lời hát
// ngay từ đầu, không phải chờ streamer nói câu đầu tiên.
const voiceKey = () => 'hpCaptionVoiceDb:' + (cfg.micDevice || 'default');
let voiceSavedAt = 0;
function loadVoiceDb() {
    try { const v = parseFloat(localStorage.getItem(voiceKey())); return Number.isFinite(v) ? v : null; } catch (e) { return null; }
}
// Cổng khởi động từ mức đã nhớ nên mức trong phiên chỉ hạ dần theo nhịp quên của cổng; vẫn chặn ghi đè
// tụt mạnh (phòng khi cổng chưa nhận mức đã nhớ) để một phiên chỉ có nhạc không xoá mất mức giọng thật.
function saveVoiceDb(db) {
    if (!Number.isFinite(db) || db < -60 || Date.now() - voiceSavedAt < 10000) return;
    voiceSavedAt = Date.now();
    const old = loadVoiceDb();
    if (old != null && db < old - 2) return;
    try { localStorage.setItem(voiceKey(), String(db)); } catch (e) {}
}
const tracker = createResultTracker();
const throttle = createPartialThrottle(100);
let flushTimer = null;

const ERROR_TEXT = {
    unsupported: 'Trình duyệt này không hỗ trợ nhận diện giọng. Hãy mở bằng Edge hoặc Chrome.',
    'not-allowed': 'Chưa cho phép micro. Bấm 🎙 BẮT ĐẦU rồi chọn Cho phép; nếu đã lỡ Chặn, vào app bấm "Đặt lại micro".',
    'service-not-allowed': 'Dịch vụ nhận diện giọng bị chặn trên máy này.',
    'audio-capture': 'Không thấy micro. Cắm micro / chọn micro mặc định trong Windows rồi bấm 🎙 BẮT ĐẦU.',
    'language-not-supported': 'Trình duyệt không hỗ trợ ngôn ngữ nghe này — đổi "Creator nói" trong app.',
    network: 'Mất kết nối dịch vụ nhận diện sau nhiều lần thử. Kiểm tra mạng rồi bấm 🎙 BẮT ĐẦU.'
};

function setStatus(text, cls) {
    el.status.textContent = text || '';
    el.status.className = cls || '';
}
// volatile: mất kết nối thì BỎ, không đệm lại — tránh lúc app mở lại nhận cả tràng chữ tạm/nhịp tim cũ.
function report() {
    socket.volatile.emit('creatorCaption:listener', {
        state, browser, lang, micLabel, error: stateError || undefined, mics, filter: filterState,
        // Chẩn đoán cho popup/app: trang đang ở pha nào, lỗi gần nhất, đã bao nhiêu phiên trống.
        detail: {
            phase, lastError, hadResults, emptySessions, networkErrors, results: resultCount, cuts,
            filterError: filterError || undefined,
            gate: gateInfo ? { open: gateInfo.open, levelDb: gateInfo.levelDb, floorDb: gateInfo.floorDb, voiceDb: gateInfo.voiceDb } : undefined
        }
    });
}
const isManual = () => cfg.mode === 'manual';
const hotkeyText = () => (cfg.hotkey ? `phím ${cfg.hotkey}` : 'BẮT ĐẦU NGHE trong app');
function setState(next, err) {
    state = next;
    stateError = err || '';
    el.btnStart.classList.toggle('show', next === 'idle' || next === 'error');
    el.btnStop.style.display = next === 'listening' || next === 'starting' ? '' : 'none';
    el.interim.classList.toggle('listening', next === 'listening');
    if (next === 'listening') setStatus(isManual() ? `🎙 Đang nghe — bấm ${hotkeyText()} để dừng và dịch` : `🎙 Đang nghe — chữ đang gửi sang OBS${cfg.hotkey ? ` · ${cfg.hotkey}: tạm dừng` : ''}`, 'ok');
    else if (next === 'starting') setStatus('Đang bật nhận diện… (cho phép micro nếu được hỏi)', 'warn');
    else if (next === 'idle') setStatus(`⏸ Sẵn sàng — bấm ${hotkeyText()} để nghe`, '');
    else if (next === 'error') setStatus(ERROR_TEXT[stateError] || ('Lỗi nhận diện: ' + stateError), 'err');
    report();
}
// KHÔNG xin micro trước bằng getUserMedia: mở rồi nhả thiết bị ngay làm SpeechRecognition báo
// audio-capture trên micro ảo (ASIO). Quyền được xin lần đầu khi nhận diện start(); server chỉ thu nhỏ
// cửa sổ (chạy ngầm) sau khi trang báo đang nghe, nên lời hỏi quyền luôn hiện ra.

function sendPartial(text) {
    clearTimeout(flushTimer);
    const out = throttle.push(text);
    if (out !== null) emitPartial(out);
    else flushTimer = setTimeout(() => { const t = throttle.flush(); if (t !== null) emitPartial(t); }, 120);
}
function emitPartial(text) {
    socket.volatile.emit('creatorCaption:partial', { text });
    el.interim.textContent = text;
}
// Câu final: chỉ gửi khi đang nối (mất app thì bỏ — không đệm để tránh dồn lời nói riêng lên OBS khi app mở lại),
// kèm ts để server bỏ câu quá cũ.
function emitSpeech(text) {
    if (!socket.connected) return;
    socket.emit('creatorCaption:speech', { text, sourceLang: lang, ts: Date.now() });
    el.last.textContent = 'Câu đã gửi: ' + text;
}

const FILTER_TEXT = { off: 'không lọc', normal: 'lọc nhạc nền', strong: 'lọc nhạc nền mạnh', fallback: 'KHÔNG lọc được' };
async function detectMic() {
    try {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        mics = await listMics();
        if (pipe) micLabel = pipe.label;   // đường micro riêng: biết chính xác micro đang nghe
        else {
            // Nghe trơn: trình duyệt dùng micro mặc định của Windows.
            const devices = await navigator.mediaDevices.enumerateDevices();
            const inputs = devices.filter(d => d.kind === 'audioinput' && d.label);
            const def = inputs.find(d => d.deviceId === 'default') || inputs[0];
            micLabel = def ? def.label.replace(/^Default - /i, '').replace(/^Mặc định - /i, '') : '';
        }
        el.micLabel.textContent = (micLabel || 'micro mặc định của Windows') + (filterState ? ` · ${FILTER_TEXT[filterState] || filterState}` : '');
        el.micHint.style.display = 'block';
        el.micHint.textContent = filterState === 'fallback'
            ? 'Không dựng được bộ lọc — đang nghe micro mặc định của Windows, nhạc nền có thể lọt vào.'
            : 'Đổi micro / mức lọc trong app · đeo tai nghe là sạch nhất';
        report();
    } catch (e) { /* không có quyền → giữ nhãn mặc định */ }
}
if (navigator.mediaDevices) navigator.mediaDevices.ondevicechange = () => detectMic();

// Đồng hồ cổng chặn nền trong cửa sổ nghe: vạch mức tiếng + vạch nền, chữ cho biết đang cho qua hay chặn.
const dbToPct = (db) => Math.max(0, Math.min(100, ((db + 70) / 60) * 100));
function onGate(info) {
    gateInfo = info;
    window.__hpCaptionGate = info;   // chẩn đoán / test
    saveVoiceDb(info.voiceDb);
    if (!el.gate) return;
    el.gate.hidden = false;
    el.gateLevel.style.width = dbToPct(info.levelDb) + '%';
    el.gateLevel.classList.toggle('open', !!info.open);
    el.gateFloor.style.left = dbToPct(info.floorDb) + '%';
    el.gateText.textContent = info.open ? '🗣 Có giọng — đang cho qua' : (info.levelDb > -58 ? '🎵 Đang chặn nền (nhạc / tiếng ồn)' : '… Im lặng');
}
function closePipe() {
    clearTimeout(pipeIdleTimer);
    pipeIdleTimer = null;
    if (pipe) { pipe.close(); pipe = null; }
    pipeKey = '';
    gateInfo = null;
    if (el.gate) el.gate.hidden = true;
}
// Mở (hoặc dùng lại) đường micro theo cấu hình. → track | null (null = nghe trơn). Ném NotAllowedError.
async function acquireTrack() {
    const level = cfg.voiceFilter || 'normal';
    const key = level + '|' + (cfg.micDevice || '');
    clearTimeout(pipeIdleTimer);
    pipeIdleTimer = null;
    if (pipe && pipeKey === key && pipe.live()) return pipe.track;
    closePipe();
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
        filterState = 'fallback'; filterError = 'no-webaudio';
        return null;
    }
    try {
        pipe = await openMicPipeline({ micDevice: cfg.micDevice || '', level, onGate, initialVoiceDb: loadVoiceDb() });
        pipeKey = key;
        filterState = pipe.level;
        filterError = '';
        detectMic();
        return pipe.track;
    } catch (e) {
        if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') throw e;
        // Micro bận / không có thiết bị / WebAudio lỗi → để trình duyệt tự nghe như bản cũ (tự báo lỗi micro nếu có).
        console.warn('[caption] không dựng được đường micro lọc, nghe trơn:', e?.name || '', e?.message || e);
        filterState = 'fallback';
        filterError = String(e?.name && e.name !== 'Error' ? e.name : (e?.message || e)).slice(0, 120);
        return null;
    }
}

function ensureRecognizer() {
    if (rec) return rec;
    rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onstart = () => {
        phase = 'listening';
        setState('listening');
        detectMic();
    };
    rec.onresult = (ev) => {
        resultCount += 1;
        const { partial, finals } = tracker.onResult(ev);
        if (finals.length || partial) { hadResults = true; networkErrors = 0; }
        for (const text of finals) emitSpeech(text);
        if (finals.length) cutPartial = '';   // trình duyệt đã chốt final → không cần dự phòng
        // Sau câu final: xoá dòng tạm trên OBS ngay (partial '' đi thẳng, không qua tiết lưu).
        sendPartial(finals.length ? '' : partial);
        if (finals.length || !partial) { segmentStartedAt = 0; return; }
        if (!segmentStartedAt) segmentStartedAt = Date.now();
        const { maxSeconds, maxWords } = cutLimits(cfg.segmentSeconds, CUT_MAX_WORDS);
        if (!isManual() && !cutting && shouldForceCut({ startedAt: segmentStartedAt, now: Date.now(), words: partial.split(/\s+/).length, maxSeconds, maxWords })) {
            cutting = true;
            cuts += 1;
            cutPartial = partial;
            segmentStartedAt = 0;
            try { rec.stop(); } catch (e) { cutting = false; cutPartial = ''; }   // stop() (không abort) → trình duyệt chốt final cho đoạn đã nghe
        }
    };
    rec.onerror = (ev) => {
        lastError = ev.error || 'error';
        if (lastError === 'network') networkErrors += 1;
        if (lastError !== 'no-speech' && lastError !== 'aborted') console.warn('[caption] lỗi nhận diện:', lastError, ev.message || '');
    };
    rec.onend = () => {
        phase = 'idle';
        segmentStartedAt = 0;
        // Ngắt/dừng mà trình duyệt không chốt final → gửi chữ tạm cuối làm câu (không mất lời đang nói).
        if (cutPartial) { emitSpeech(cutPartial); cutPartial = ''; }
        sendPartial('');
        if (!active) { setState('idle'); return; }
        if (langSwitch) { langSwitch = false; startListening(); return; }
        if (cutting) { cutting = false; startListening(); return; }   // vừa tự ngắt câu → nghe tiếp ngay
        emptySessions = hadResults ? 0 : emptySessions + 1;
        const d = restartDelay({ reason: lastError, hadResults, emptySessions, networkErrors });
        if (d < 0) {
            active = false;
            setState('error', lastError || 'network');
            return;
        }
        if (d > 0) setStatus(`Bật lại sau ${(d / 1000).toFixed(1)}s…`, 'warn');
        restartTimer = setTimeout(startListening, d);
    };
    return rec;
}

function startListening() {
    clearTimeout(restartTimer);
    restartTimer = null;
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }   // app bảo nghe lại ngay sau khi dừng → đừng đóng
    if (!SR) { active = false; setState('error', 'unsupported'); return; }
    if (phase === 'starting' || phase === 'listening') return;
    active = true;
    lang = cfg.sourceLang || 'vi-VN';
    el.lang.textContent = lang;
    try { ensureRecognizer(); } catch (e) { active = false; setState('error', 'unsupported'); return; }
    rec.lang = lang;
    tracker.newSession();
    hadResults = false;
    resultCount = 0;
    segmentStartedAt = 0;
    cutting = false;
    lastError = '';
    phase = 'starting';
    setState('starting');
    const token = ++startToken;
    acquiring = true;
    acquireTrack().then((track) => {
        if (token === startToken) acquiring = false;
        if (token !== startToken || !active || phase !== 'starting') return;   // đã dừng / start khác trong lúc mở micro
        try {
            if (track) {
                try { rec.start(track); }
                catch (e) {
                    if (e && e.name !== 'TypeError') throw e;
                    // Trình duyệt cũ chưa nhận track → nghe trơn.
                    closePipe(); filterState = 'fallback'; filterError = 'start-track-unsupported';
                    rec.start();
                }
            } else rec.start();
        } catch (e) {
            // InvalidStateError = phiên trước chưa kịp end; onend sẽ tự bật lại.
            if (e && e.name === 'InvalidStateError') { phase = 'listening'; return; }
            phase = 'idle';
            active = false;
            setState('error', e?.name || 'start_failed');
        }
    }, (e) => {
        if (token !== startToken) return;
        acquiring = false;
        phase = 'idle';
        active = false;
        setState('error', 'not-allowed');   // acquireTrack chỉ ném khi micro bị chặn
    });
}

function stopListening({ close = false } = {}) {
    active = false;
    langSwitch = false;
    cutting = false;
    clearTimeout(restartTimer);
    restartTimer = null;
    emptySessions = 0;
    networkErrors = 0;
    // Đang chờ mở micro thì rec chưa start() → không có onend để chờ.
    const wasListening = rec && !acquiring && (phase === 'starting' || phase === 'listening');
    if (wasListening) {
        phase = 'stopping';
        // stop() chứ không abort(): trình duyệt chốt nốt đoạn đang nói → câu cuối vẫn được dịch
        // (chế độ Bấm/Dừng dựa hoàn toàn vào đây). Không chốt được thì onend gửi chữ tạm cuối.
        cutPartial = el.interim.textContent || '';
        try { rec.stop(); } catch (e) {}
    } else {
        phase = 'idle';
        sendPartial('');
    }
    startToken += 1;   // huỷ lần mở micro còn đang chờ
    acquiring = false;
    // Tạm dừng: giữ micro một lúc (bấm nghe lại không trễ đầu câu), lâu thì nhả. Đóng cửa sổ: nhả sau khi
    // trình duyệt chốt xong câu cuối (cắt track ngay có thể mất câu đó).
    clearTimeout(pipeIdleTimer);
    pipeIdleTimer = pipe ? setTimeout(closePipe, close ? 1200 : PIPE_IDLE_MS) : null;
    setState('idle');
    // Cửa sổ --app mở mới chỉ có 1 trang trong lịch sử → script đóng được. Chờ final cuối về trước khi đóng.
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = close ? setTimeout(() => window.close(), wasListening ? 1500 : 150) : null;
}

socket.on('connect', () => {
    report();
    if (!connectedOnce) {
        connectedOnce = true;
        setStatus('Đã nối app…', 'warn');
        // cfg tới ngay sau connect; chờ 1 nhịp để lấy đúng ngôn ngữ/chế độ. Chế độ Bấm/Dừng: chỉ sẵn sàng,
        // nghe khi app/phím tắt bảo (listener:start).
        setTimeout(() => {
            if (active) return;
            if (isManual()) setState('idle');
            else startListening();
        }, 250);
    }
});
socket.on('disconnect', () => setStatus('Mất kết nối app — đang nối lại…', 'warn'));
socket.on('creatorCaption:config', (c) => {
    if (!c || typeof c !== 'object') return;
    const prevMic = (cfg.voiceFilter || 'normal') + '|' + (cfg.micDevice || '');
    cfg = c;
    const next = cfg.sourceLang || 'vi-VN';
    el.lang.textContent = next;
    const micChanged = prevMic !== (cfg.voiceFilter || 'normal') + '|' + (cfg.micDevice || '');
    if (micChanged && !(active && (phase === 'starting' || phase === 'listening'))) closePipe();
    if (active && (next !== lang || micChanged) && (phase === 'starting' || phase === 'listening')) {
        // Đổi ngôn ngữ / micro / mức lọc khi đang nghe → abort rồi onend tự nghe lại theo cấu hình mới.
        langSwitch = true;
        if (phase === 'starting' && acquiring) { startToken += 1; acquiring = false; phase = 'idle'; langSwitch = false; startListening(); return; }
        try { rec.abort(); } catch (e) {}
    }
});
window.addEventListener('pagehide', closePipe);
socket.on('creatorCaption:listener:stop', (data) => stopListening({ close: !data || data.close !== false }));
socket.on('creatorCaption:listener:start', () => { emptySessions = 0; networkErrors = 0; startListening(); });

el.btnStop.addEventListener('click', () => stopListening({ close: false }));
el.btnClose.addEventListener('click', () => stopListening({ close: true }));
el.btnStart.addEventListener('click', () => { emptySessions = 0; networkErrors = 0; startListening(); });

if (!SR) setState('error', 'unsupported');
setInterval(report, 5000);

// Móc test (không dùng khi chạy thật): bơm kết quả giả như SpeechRecognitionEvent để kiểm chuỗi
// trang → server → dịch → overlay mà không cần nói. rows = [[isFinal, transcript], ...]
window.__hpCaptionFeed = (rows) => {
    if (!rec || !rec.onresult) return false;
    rec.onresult({ resultIndex: 0, results: rows.map(([isFinal, transcript]) => ({ isFinal, 0: { transcript }, length: 1 })) });
    return true;
};
