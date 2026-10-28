import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceGate, voiceFilterParams, normalizeVoiceFilter, pickMicDevice, micLabels } from '../public/lib/voice-gate.mjs';

const SR = 16000;
const BLOCK = 128;

// Tín hiệu thử: "nhạc nền" = tổng vài sin đều đều; "giọng" = sin to hơn bật/tắt theo đoạn.
function makeSignal(seconds, { musicDb = -32, voiceDb = -14, voiceOn = () => false } = {}) {
    const n = Math.round(seconds * SR);
    const out = new Float32Array(n);
    const m = 10 ** (musicDb / 20);
    const v = 10 ** (voiceDb / 20);
    for (let i = 0; i < n; i++) {
        const t = i / SR;
        let x = m * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 330 * t) + Math.sin(2 * Math.PI * 523 * t)) / 1.7;
        if (voiceOn(t)) x += v * Math.sin(2 * Math.PI * 180 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t));
        out[i] = x;
    }
    return out;
}

// Chạy cổng qua tín hiệu → tỉ lệ khối mở trong từng khoảng [from, to) giây + năng lượng ra.
function run(signal, level = 'normal') {
    const gate = createVoiceGate({ sampleRate: SR, blockSize: BLOCK, params: voiceFilterParams(level) });
    const opens = [];
    const out = new Float32Array(BLOCK);
    const energy = [];
    for (let i = 0; i + BLOCK <= signal.length; i += BLOCK) {
        opens.push(gate.process(signal.subarray(i, i + BLOCK), out));
        let e = 0;
        for (let k = 0; k < BLOCK; k++) e += out[k] * out[k];
        energy.push(e / BLOCK);
    }
    const blockAt = (sec) => Math.floor(sec * SR / BLOCK);
    const ratio = (from, to) => {
        const a = blockAt(from), b = blockAt(to);
        const part = opens.slice(a, b);
        return part.filter(Boolean).length / Math.max(1, part.length);
    };
    const rms = (from, to) => {
        const part = energy.slice(blockAt(from), blockAt(to));
        return Math.sqrt(part.reduce((s, x) => s + x, 0) / Math.max(1, part.length));
    };
    return { ratio, rms, gate };
}

test('normalizeVoiceFilter: chỉ nhận off/normal/strong, còn lại về normal', () => {
    assert.equal(normalizeVoiceFilter('off'), 'off');
    assert.equal(normalizeVoiceFilter('strong'), 'strong');
    assert.equal(normalizeVoiceFilter('xyz'), 'normal');
    assert.equal(normalizeVoiceFilter(undefined), 'normal');
    assert.equal(voiceFilterParams('off').gate, false);
    assert.ok(voiceFilterParams('strong').openDb > voiceFilterParams('normal').openDb);
});

test('cổng: nhạc nền đều → đóng (chặn), giọng to hơn nền → mở', () => {
    // 0–4s chỉ nhạc; 4–6s có giọng; 6–9s chỉ nhạc.
    const sig = makeSignal(9, { voiceOn: (t) => t >= 4 && t < 6 });
    const { ratio, rms } = run(sig);
    assert.ok(ratio(1, 4) < 0.05, 'nhạc một mình phải bị chặn: ' + ratio(1, 4));
    assert.ok(ratio(4.1, 5.9) > 0.9, 'có giọng phải mở: ' + ratio(4.1, 5.9));
    assert.ok(ratio(7, 9) < 0.05, 'hết giọng phải đóng lại: ' + ratio(7, 9));
    assert.ok(rms(7, 9) < rms(4.2, 5.8) / 50, 'lúc chặn gần như im lặng');
});

test('cổng: giữ mở (hold) qua khoảng ngắt ngắn giữa các chữ', () => {
    // Giọng nói ngắt quãng 150ms mỗi 600ms (khoảng nghỉ giữa chữ).
    const sig = makeSignal(8, { voiceOn: (t) => t >= 3 && t < 7 && (t % 0.6) < 0.45 });
    const { ratio } = run(sig);
    assert.ok(ratio(3.1, 6.9) > 0.95, 'không được cắt vụn giữa các chữ: ' + ratio(3.1, 6.9));
});

test('cổng: bật lên giữa bài hát không mở ngay vì nhạc', () => {
    const sig = makeSignal(3, { musicDb: -18 });
    const { ratio } = run(sig);
    assert.ok(ratio(0, 3) < 0.05, 'nhạc to ngay từ đầu vẫn là nền: ' + ratio(0, 3));
});

test('cổng: phòng yên tĩnh, giọng nhỏ vẫn qua; im lặng thật không mở', () => {
    const sig = makeSignal(6, { musicDb: -90, voiceDb: -40, voiceOn: (t) => t >= 2 && t < 4 });
    const { ratio } = run(sig);
    assert.ok(ratio(2.1, 3.9) > 0.9, 'giọng nhỏ trong phòng yên phải qua: ' + ratio(2.1, 3.9));
    assert.ok(ratio(0, 2) < 0.05 && ratio(5, 6) < 0.05);
});

test('mức "mạnh" chặn được giọng chỉ nhỉnh hơn nhạc chút ít mà "thường" cho qua', () => {
    const sig = makeSignal(8, { musicDb: -24, voiceDb: -21, voiceOn: (t) => t >= 4 && t < 6 });
    const normal = run(sig, 'normal').ratio(4.1, 5.9);
    const strong = run(sig, 'strong').ratio(4.1, 5.9);
    assert.ok(strong <= normal, `strong ${strong} <= normal ${normal}`);
});

test('mức off: không chặn gì', () => {
    const sig = makeSignal(3);
    const { ratio } = run(sig, 'off');
    assert.equal(ratio(0, 3), 1);
});

test('pickMicDevice / micLabels: chọn theo tên, bỏ mục giả default/communications', () => {
    const devices = [
        { kind: 'audioinput', deviceId: 'default', label: 'Default - Mix 01 (ASIOVADPRO)' },
        { kind: 'audioinput', deviceId: 'communications', label: 'Communications - Mic 01 (ASIOVADPRO)' },
        { kind: 'audioinput', deviceId: 'a1', label: 'Mix 01 (ASIOVADPRO)' },
        { kind: 'audioinput', deviceId: 'a2', label: 'Mic 01 (ASIOVADPRO)' },
        { kind: 'audiooutput', deviceId: 'o1', label: 'Speakers' }
    ];
    assert.deepEqual(micLabels(devices), ['Mix 01 (ASIOVADPRO)', 'Mic 01 (ASIOVADPRO)']);
    assert.equal(pickMicDevice(devices, 'mic 01 (asiovadpro)').deviceId, 'a2');
    assert.equal(pickMicDevice(devices, ''), null);
    assert.equal(pickMicDevice(devices, 'Không có'), null);
});

test('cổng: lời bài hát có khoảng nghỉ (nền tụt) vẫn bị chặn khi đã biết mức giọng streamer', () => {
    // 1–3s streamer nói to (-10 dB); 4–12s "lời hát" lọt từ loa -36 dB, hát 0.8s nghỉ 0.4s, nền rất nhỏ.
    const n = 13 * SR;
    const sig = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const t = i / SR;
        let x = 10 ** (-70 / 20) * Math.sin(2 * Math.PI * 97 * t);
        if (t >= 1 && t < 3) x += 10 ** (-10 / 20) * Math.sin(2 * Math.PI * 180 * t);
        if (t >= 4 && t < 12 && ((t - 4) % 1.2) < 0.8) x += 10 ** (-36 / 20) * Math.sin(2 * Math.PI * 260 * t);
        sig[i] = x;
    }
    const { ratio } = run(sig);
    assert.ok(ratio(1.1, 2.9) > 0.9, 'giọng streamer phải qua: ' + ratio(1.1, 2.9));
    assert.ok(ratio(4, 12) < 0.05, 'lời hát nhỏ hơn giọng >22 dB phải bị chặn: ' + ratio(4, 12));
});

test('cổng: streamer nói nhỏ hơn bình thường (−12 dB) vẫn qua', () => {
    const sig = makeSignal(10, { musicDb: -45, voiceDb: -10, voiceOn: (t) => (t >= 1 && t < 3) });
    const quiet = makeSignal(10, { musicDb: -45, voiceDb: -22, voiceOn: (t) => (t >= 6 && t < 8) });
    for (let i = 0; i < sig.length; i++) sig[i] = (i / SR >= 5 ? quiet[i] : sig[i]);
    const { ratio } = run(sig);
    assert.ok(ratio(6.1, 7.9) > 0.9, 'nói nhỏ vẫn phải qua: ' + ratio(6.1, 7.9));
});

test('cổng: nhớ mức giọng buổi trước → lời hát bị chặn ngay từ đầu, và vẫn chặn sau 3 phút chỉ có nhạc', () => {
    // Lời hát -36 dB có khoảng nghỉ im lặng, streamer không nói gì; mức giọng đã nhớ -12 dB.
    const secs = 185;
    const sig = new Float32Array(secs * SR);
    for (let i = 0; i < sig.length; i++) {
        const t = i / SR;
        sig[i] = ((t % 1.2) < 0.8) ? 10 ** (-36 / 20) * Math.sin(2 * Math.PI * 260 * t) : 0;
    }
    const gate = createVoiceGate({ sampleRate: SR, blockSize: BLOCK, params: voiceFilterParams('normal'), initialVoiceDb: -12 });
    const out = new Float32Array(BLOCK);
    let openEarly = 0, openLate = 0, early = 0, late = 0;
    for (let i = 0; i + BLOCK <= sig.length; i += BLOCK) {
        const o = gate.process(sig.subarray(i, i + BLOCK), out);
        const t = i / SR;
        if (t < 10) { early++; if (o) openEarly++; }
        if (t > 175) { late++; if (o) openLate++; }
    }
    assert.ok(openEarly / early < 0.05, 'đầu buổi phải chặn: ' + openEarly / early);
    assert.ok(openLate / late < 0.05, 'sau 3 phút vẫn phải chặn: ' + openLate / late);
    assert.ok(gate.state().voiceDb <= -12 && gate.state().voiceDb >= -20);
});

test('cổng: hét to 1 giây không làm chặn nhầm giọng nói bình thường sau đó', () => {
    // Nói thường -18 dB (1–6s) → hét -4 dB (7–8s) → nói nhỏ hơn 8 dB (10–13s), nền rất nhỏ.
    const n = 14 * SR;
    const sig = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const t = i / SR;
        const db = (t >= 1 && t < 6) ? -18 : (t >= 7 && t < 8) ? -4 : (t >= 10 && t < 13) ? -26 : null;
        sig[i] = 10 ** (-75 / 20) * Math.sin(2 * Math.PI * 97 * t) + (db == null ? 0 : 10 ** (db / 20) * Math.sin(2 * Math.PI * 180 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t)));
    }
    const { ratio } = run(sig);
    assert.ok(ratio(10.1, 12.9) > 0.9, 'nói nhỏ sau tiếng hét vẫn phải qua: ' + ratio(10.1, 12.9));
});
