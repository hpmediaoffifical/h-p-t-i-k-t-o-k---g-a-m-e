// Trang nghe giọng Creator — chạy trong Edge/Chrome thật (cửa sổ --app do server mở), vì
// Electron không có khoá dịch vụ Web Speech. Nghe bằng webkitSpeechRecognition, đẩy chữ tạm /
// câu final / trạng thái về server qua socket.io. Logic thuần ở /lib/caption-speech.mjs.
import { createResultTracker, restartDelay, createPartialThrottle } from '/lib/caption-speech.mjs';

const qs = new URLSearchParams(location.search);
const browser = qs.get('browser') === 'chrome' ? 'chrome' : 'edge';
const $ = (id) => document.getElementById(id);
const el = {
    browser: $('browser'), lang: $('lang'), micLabel: $('mic-label'), micHint: $('mic-hint'),
    interim: $('interim'), last: $('last'), status: $('status'), btnStop: $('btn-stop'), btnStart: $('btn-start')
};
el.browser.textContent = browser === 'chrome' ? 'Chrome' : 'Edge';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const socket = io({ reconnection: true, reconnectionDelay: 600, reconnectionDelayMax: 5000 });

let cfg = { sourceLang: 'vi-VN' };
let lang = 'vi-VN';
let rec = null;
let active = false;          // app/người dùng muốn nghe
let phase = 'idle';          // idle | starting | listening | stopping
let langSwitch = false;      // abort() để đổi ngôn ngữ, không tính là lỗi
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
const tracker = createResultTracker();
const throttle = createPartialThrottle(100);
let flushTimer = null;

const ERROR_TEXT = {
    unsupported: 'Trình duyệt này không hỗ trợ nhận diện giọng. Hãy mở bằng Edge hoặc Chrome.',
    'not-allowed': 'Chưa cho phép micro. Bấm 🎙 BẮT ĐẦU rồi chọn Cho phép; nếu đã lỡ Chặn, vào app bấm "Đặt lại quyền micro".',
    'service-not-allowed': 'Dịch vụ nhận diện giọng bị chặn trên máy này.',
    'audio-capture': 'Không thấy micro. Cắm micro / chọn micro mặc định trong Windows rồi bấm 🎙 BẮT ĐẦU.',
    'language-not-supported': 'Trình duyệt không hỗ trợ ngôn ngữ nghe này — đổi "Creator nói" trong app.',
    network: 'Mất kết nối dịch vụ nhận diện sau nhiều lần thử. Kiểm tra mạng rồi bấm 🎙 BẮT ĐẦU.'
};

function setStatus(text, cls) {
    el.status.textContent = text || '';
    el.status.className = cls || '';
}
function report() {
    socket.emit('creatorCaption:listener', {
        state, browser, lang, micLabel, error: stateError || undefined,
        // Chẩn đoán cho popup/app: trang đang ở pha nào, lỗi gần nhất, đã bao nhiêu phiên trống.
        detail: { phase, lastError, hadResults, emptySessions, networkErrors, results: resultCount }
    });
}
function setState(next, err) {
    state = next;
    stateError = err || '';
    el.btnStart.classList.toggle('show', next === 'idle' || next === 'error');
    el.interim.classList.toggle('listening', next === 'listening');
    if (next === 'listening') setStatus('🎙 Đang nghe — chữ đang gửi sang OBS', 'ok');
    else if (next === 'starting') setStatus('Đang bật nhận diện… (cho phép micro nếu được hỏi)', 'warn');
    else if (next === 'idle') setStatus('Đã dừng nghe', '');
    else if (next === 'error') setStatus(ERROR_TEXT[stateError] || ('Lỗi nhận diện: ' + stateError), 'err');
    report();
}

function sendPartial(text) {
    clearTimeout(flushTimer);
    const out = throttle.push(text);
    if (out !== null) emitPartial(out);
    else flushTimer = setTimeout(() => { const t = throttle.flush(); if (t !== null) emitPartial(t); }, 120);
}
function emitPartial(text) {
    socket.emit('creatorCaption:partial', { text });
    el.interim.textContent = text;
}

async function detectMic() {
    try {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter(d => d.kind === 'audioinput' && d.label);
        // Web Speech API luôn dùng micro mặc định của hệ thống — không chọn được từng thiết bị.
        const def = inputs.find(d => d.deviceId === 'default') || inputs[0];
        micLabel = def ? def.label.replace(/^Default - /i, '').replace(/^Mặc định - /i, '') : '';
        el.micLabel.textContent = micLabel || 'micro mặc định của Windows';
        el.micHint.style.display = 'block';
        el.micHint.textContent = `Đổi micro: Windows → Cài đặt âm thanh → Đầu vào, hoặc ${browser}://settings/content/microphone`;
        report();
    } catch (e) { /* không có quyền → giữ nhãn mặc định */ }
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
        for (const text of finals) {
            socket.emit('creatorCaption:speech', { text, sourceLang: lang });
            el.last.textContent = 'Câu đã gửi: ' + text;
        }
        // Sau câu final: xoá dòng tạm trên OBS ngay (partial '' đi thẳng, không qua tiết lưu).
        sendPartial(finals.length ? '' : partial);
    };
    rec.onerror = (ev) => {
        lastError = ev.error || 'error';
        if (lastError === 'network') networkErrors += 1;
        if (lastError !== 'no-speech' && lastError !== 'aborted') console.warn('[caption] lỗi nhận diện:', lastError, ev.message || '');
    };
    rec.onend = () => {
        phase = 'idle';
        sendPartial('');
        if (!active) { setState('idle'); return; }
        if (langSwitch) { langSwitch = false; startListening(); return; }
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
    lastError = '';
    phase = 'starting';
    setState('starting');
    try { rec.start(); }
    catch (e) {
        // InvalidStateError = phiên trước chưa kịp end; onend sẽ tự bật lại.
        if (e && e.name === 'InvalidStateError') { phase = 'listening'; return; }
        phase = 'idle';
        active = false;
        setState('error', e?.name || 'start_failed');
    }
}

function stopListening({ close = false } = {}) {
    active = false;
    langSwitch = false;
    clearTimeout(restartTimer);
    restartTimer = null;
    emptySessions = 0;
    networkErrors = 0;
    if (rec && (phase === 'starting' || phase === 'listening')) {
        phase = 'stopping';
        try { rec.abort(); } catch (e) {}
    } else {
        phase = 'idle';
    }
    sendPartial('');
    setState('idle');
    // Cửa sổ --app mở mới chỉ có 1 trang trong lịch sử → script đóng được.
    if (close) setTimeout(() => window.close(), 150);
}

socket.on('connect', () => {
    report();
    if (!connectedOnce) {
        connectedOnce = true;
        setStatus('Đã nối app — đang bật nhận diện…', 'warn');
        // cfg tới ngay sau connect; chờ 1 nhịp để lấy đúng ngôn ngữ trước khi start.
        setTimeout(() => { if (!active) startListening(); }, 250);
    }
});
socket.on('disconnect', () => setStatus('Mất kết nối app — đang nối lại…', 'warn'));
socket.on('creatorCaption:config', (c) => {
    if (!c || typeof c !== 'object') return;
    cfg = c;
    const next = cfg.sourceLang || 'vi-VN';
    el.lang.textContent = next;
    if (active && next !== lang && (phase === 'starting' || phase === 'listening')) {
        langSwitch = true;
        try { rec.abort(); } catch (e) {}
    }
});
socket.on('creatorCaption:listener:stop', () => stopListening({ close: true }));
socket.on('creatorCaption:listener:start', () => { emptySessions = 0; networkErrors = 0; startListening(); });

el.btnStop.addEventListener('click', () => stopListening({ close: true }));
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
