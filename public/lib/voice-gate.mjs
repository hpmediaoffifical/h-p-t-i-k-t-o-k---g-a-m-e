// Cổng chặn nền cho micro của trang nghe giọng Creator — logic thuần (không đụng WebAudio) để
// test bằng node --test (tests/voice-gate.test.mjs); AudioWorklet /listen/voice-gate-worklet.js chỉ
// gọi process() theo từng khối mẫu.
//
// Vì sao: nhạc/âm thanh desktop phát ra loa lọt vào micro → nhận diện chép cả lời bài hát, dịch lộn
// xộn. Nhạc nền là âm thanh KÉO DÀI ở mức gần như đều; giọng streamer sát micro to hơn hẳn mức đó.
// Cổng ước lượng "mức nền" (đi xuống nhanh, đi lên chậm) và chỉ mở khi tín hiệu vượt nền đủ số dB →
// lúc streamer im lặng, nhận diện chỉ nghe thấy im lặng thay vì lời bài hát.

// Mức lọc người dùng chọn: off = micro thô (chỉ chọn thiết bị); normal / strong = lọc dải giọng + cổng.
export const VOICE_FILTER_LEVELS = ['off', 'normal', 'strong'];

export function normalizeVoiceFilter(v) {
    return VOICE_FILTER_LEVELS.includes(v) ? v : 'normal';
}

// Tham số theo mức lọc. openDb: tín hiệu phải vượt nền bao nhiêu dB mới mở; hysteresis: đóng khi tụt
// dưới (openDb - hysteresis); holdMs: giữ mở sau khi tụt (đuôi chữ không bị cắt); lookaheadMs: trễ
// tiếng để cổng mở kịp trước phụ âm đầu; highpass/lowpass: dải giọng (bỏ trống/bass và xèo cao).
export function voiceFilterParams(level) {
    const l = normalizeVoiceFilter(level);
    if (l === 'off') return { level: l, gate: false, browserProcessing: false, highpass: 0, lowpass: 0 };
    const base = {
        level: l, gate: true, browserProcessing: true,
        hysteresisDb: 3, lookaheadMs: 40, attackMs: 4, releaseMs: 90,
        minOpenDb: -58,          // dưới mức này là im lặng thật — không mở dù nền thấp
        floorRiseSec: 3,         // nền đi lên chậm: nhạc bật to dần thì vài giây sau cổng coi là nền
        floorRiseOpenSec: 20,    // đang có giọng thì nền gần như đứng yên (nói liền không tự đóng cổng)
        floorFallSec: 0.25,      // nền đi xuống nhanh: khoảng lặng giữa câu kéo nền về ngay
        targetDb: -20, maxMakeupDb: 18,
        // Mức giọng streamer: lên theo giọng to (hằng số 1s — tiếng hét / cười to ngắn chỉ đẩy mốc lên một phần);
        // không ai nói thì hạ đều rất chậm — KHÔNG kéo về theo tiếng đang nghe, kẻo lời hát lọt qua một lần rồi
        // tự kéo mốc xuống mức hát và lọt mãi.
        peakRiseSec: 1, peakJumpDb: 40, peakFallDbPerMin: 2
    };
    return l === 'strong'
        ? { ...base, openDb: 12, peakRangeDb: 12, holdMs: 320, highpass: 200, lowpass: 4200 }
        : { ...base, openDb: 8, peakRangeDb: 16, holdMs: 450, highpass: 140, lowpass: 6500 };
}

const dbOf = (rms) => 20 * Math.log10(Math.max(rms, 1e-7));
const coefFor = (sec, blockSec) => (sec > 0 ? 1 - Math.exp(-blockSec / sec) : 1);

// createVoiceGate({ sampleRate, blockSize, params, initialVoiceDb }) → { process(input, output), state() }.
// process: input/output Float32Array cùng độ dài blockSize; output = input trễ lookahead × hệ số cổng.
// initialVoiceDb: mức giọng streamer đã học buổi trước (trang nghe nhớ theo micro) — không có thì phải chờ
// streamer nói câu đầu mới biết, trước đó lời hát vượt nền vẫn lọt.
export function createVoiceGate({ sampleRate = 16000, blockSize = 128, params = voiceFilterParams('normal'), initialVoiceDb = null } = {}) {
    const p = params;
    const blockSec = blockSize / sampleRate;
    const delayLen = Math.max(0, Math.round((p.lookaheadMs || 0) * sampleRate / 1000));
    const ring = new Float32Array(delayLen + blockSize);
    let ringPos = 0;
    let env = -100;          // đường bao mức tín hiệu (dB)
    let floor = -60;         // mức nền ước lượng (dB)
    let primed = false;      // khối đầu tiên: nền = mức hiện tại (không mở cổng chỉ vì bật lên giữa bài hát)
    let open = false;
    let holdLeft = 0;        // số khối còn giữ mở
    let gain = 0;            // hệ số cổng đang áp (làm mượt theo mẫu)
    let speechDb = p.targetDb ?? -20;   // mức giọng lúc mở cổng → bù âm lượng (tự cân micro nhỏ)
    // Mức giọng to nhất gần đây (giọng sát micro to hơn tiếng loa lọt vào cả chục dB). Lời bài hát có khoảng
    // nghỉ làm nền tụt → câu hát sau vượt nền; nhưng vẫn nhỏ hơn giọng streamer nhiều → chặn theo mốc này.
    let peak = Number.isFinite(initialVoiceDb) ? Math.max(-60, Math.min(0, initialVoiceDb)) : -100;
    const peakFallPerBlock = ((p.peakFallDbPerMin || 0) / 60) * blockSec;
    const attackStep = 1 / Math.max(1, (p.attackMs || 4) * sampleRate / 1000);
    const releaseStep = 1 / Math.max(1, (p.releaseMs || 90) * sampleRate / 1000);
    const envAttack = coefFor(0.005, blockSec);
    const envRelease = coefFor(0.06, blockSec);
    const holdBlocks = Math.ceil((p.holdMs || 0) / 1000 / blockSec);

    function process(input, output) {
        const n = input.length;
        let sum = 0;
        for (let i = 0; i < n; i++) sum += input[i] * input[i];
        const level = dbOf(Math.sqrt(sum / Math.max(1, n)));
        if (!primed) { primed = true; env = level; floor = Math.max(level, -75); }
        env += (level > env ? envAttack : envRelease) * (level - env);

        // Nền: xuống nhanh theo khoảng lặng, lên chậm theo nhạc; đang mở thì gần như giữ nguyên.
        if (env < floor) floor += coefFor(p.floorFallSec, blockSec) * (env - floor);
        else floor += coefFor(open ? p.floorRiseOpenSec : p.floorRiseSec, blockSec) * (env - floor);
        floor = Math.max(floor, -80);

        const over = env - floor;
        if (env > peak) {
            if (p.peakJumpDb && env - peak > p.peakJumpDb) peak = env - p.peakJumpDb;   // chưa học gì: bắt kịp ngay
            peak += coefFor(p.peakRiseSec, blockSec) * (env - peak);
        } else if (!open) peak = Math.max(env, peak - peakFallPerBlock);
        const nearVoice = !p.peakRangeDb || env >= peak - p.peakRangeDb;
        if (!p.gate) open = true;
        else if (env >= p.minOpenDb && over >= p.openDb && nearVoice) { open = true; holdLeft = holdBlocks; }
        else if (open && (over < p.openDb - p.hysteresisDb || env < p.minOpenDb || env < peak - p.peakRangeDb - p.hysteresisDb)) {
            if (holdLeft > 0) holdLeft -= 1;
            else open = false;
        } else if (open) holdLeft = holdBlocks;

        if (open && p.gate) speechDb += coefFor(1.5, blockSec) * (env - speechDb);
        const makeupDb = p.gate ? Math.max(0, Math.min(p.maxMakeupDb || 0, (p.targetDb ?? -20) - speechDb)) : 0;
        const makeup = 10 ** (makeupDb / 20);

        // Trễ lookahead qua bộ đệm vòng, áp hệ số cổng mượt theo từng mẫu.
        const target = open ? 1 : 0;
        for (let i = 0; i < n; i++) {
            ring[(ringPos + delayLen) % ring.length] = input[i];
            const x = ring[ringPos];
            ringPos = (ringPos + 1) % ring.length;
            if (gain < target) gain = Math.min(target, gain + attackStep);
            else if (gain > target) gain = Math.max(target, gain - releaseStep);
            const y = x * gain * makeup;
            output[i] = y > 1 ? 1 : y < -1 ? -1 : y;
        }
        return open;
    }

    return {
        process,
        state: () => ({ open, levelDb: Math.round(env), floorDb: Math.round(floor), voiceDb: Math.round(peak), makeupDb: Math.round(Math.max(0, Math.min(p.maxMakeupDb || 0, (p.targetDb ?? -20) - speechDb))) })
    };
}

// Chọn thiết bị micro theo tên đã lưu (deviceId khác nhau giữa Edge/Chrome và profile, tên thì ổn định).
// devices: [{ deviceId, label, kind }] — '' hoặc không thấy tên → null (dùng micro mặc định của Windows).
export function pickMicDevice(devices, wantedLabel) {
    const want = String(wantedLabel || '').trim().toLowerCase();
    if (!want) return null;
    const inputs = (devices || []).filter(d => d && d.kind === 'audioinput' && d.label && d.deviceId !== 'default' && d.deviceId !== 'communications');
    return inputs.find(d => d.label.trim().toLowerCase() === want) || null;
}

// Danh sách tên micro để báo về app (bỏ mục giả "Default"/"Communications" của Chrome trên Windows).
export function micLabels(devices) {
    const out = [];
    for (const d of devices || []) {
        if (!d || d.kind !== 'audioinput' || !d.label || d.deviceId === 'default' || d.deviceId === 'communications') continue;
        const label = String(d.label).slice(0, 120);
        if (!out.includes(label)) out.push(label);
    }
    return out.slice(0, 24);
}
