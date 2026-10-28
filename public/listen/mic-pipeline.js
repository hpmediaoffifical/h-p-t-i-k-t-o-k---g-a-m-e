// Đường micro của trang nghe giọng Creator: tự mở micro (chọn được thiết bị), lọc dải giọng + cổng chặn
// nền nhạc, rồi đưa track đã lọc cho SpeechRecognition.start(track) thay vì để trình duyệt tự nghe micro
// mặc định của Windows.
//
// Đã thử thật (Chrome 156 / Edge 156): cả hai nghe theo track truyền vào; Edge CHỈ ra chữ khi track ở
// 16 kHz (48 kHz trả câu rỗng) → luôn đi qua AudioContext 16 kHz, kể cả mức lọc "off".
import { voiceFilterParams, pickMicDevice, micLabels } from '/lib/voice-gate.mjs';

export async function listMics() {
    try { return micLabels(await navigator.mediaDevices.enumerateDevices()); } catch (e) { return []; }
}

// → { track, label, level, close() }. Ném lỗi DOMException của getUserMedia (NotAllowedError…) để caller
// đổi sang mã lỗi nhận diện; lỗi dựng WebAudio thì ném Error('pipeline:…').
export async function openMicPipeline({ micDevice = '', level = 'normal', onGate = null, initialVoiceDb = null } = {}) {
    const p = voiceFilterParams(level);
    const audio = {
        echoCancellation: p.browserProcessing,
        noiseSuppression: p.browserProcessing,
        // Tự tăng âm của trình duyệt kéo cả nhạc nền lên lúc im lặng → tắt khi lọc; cổng tự bù âm cho giọng.
        autoGainControl: false,
        channelCount: 1
    };
    // Tên micro đã chọn → deviceId (chỉ đọc được tên sau khi có quyền; lần đầu chưa có tên thì mở mặc định).
    let device = null;
    if (micDevice) {
        try { device = pickMicDevice(await navigator.mediaDevices.enumerateDevices(), micDevice); } catch (e) {}
    }
    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: device ? { ...audio, deviceId: { exact: device.deviceId } } : audio });
    } catch (e) {
        if (!device || e?.name === 'NotAllowedError') throw e;
        stream = await navigator.mediaDevices.getUserMedia({ audio });   // micro đã chọn bị rút/bận → mặc định
        device = null;
    }
    const raw = stream.getAudioTracks()[0];
    if (micDevice && !device) {
        // Lần đầu (chưa có quyền nên chưa thấy tên): giờ đã có quyền → thử lại đúng micro đã chọn.
        try {
            const again = pickMicDevice(await navigator.mediaDevices.enumerateDevices(), micDevice);
            if (again && again.label !== raw.label) {
                const s2 = await navigator.mediaDevices.getUserMedia({ audio: { ...audio, deviceId: { exact: again.deviceId } } });
                stream.getTracks().forEach(t => t.stop());
                stream = s2;
                device = again;
            }
        } catch (e) { /* giữ micro mặc định */ }
    }
    const track0 = stream.getAudioTracks()[0];
    let ctx = null;
    try {
        ctx = new AudioContext({ sampleRate: 16000 });
        const src = ctx.createMediaStreamSource(stream);
        let node = src;
        if (p.highpass) {
            const hp = ctx.createBiquadFilter();
            hp.type = 'highpass'; hp.frequency.value = p.highpass; hp.Q.value = 0.7;
            node = node.connect(hp);
        }
        if (p.lowpass) {
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass'; lp.frequency.value = p.lowpass; lp.Q.value = 0.7;
            node = node.connect(lp);
        }
        if (p.gate) {
            await ctx.audioWorklet.addModule('/listen/voice-gate-worklet.js');
            const gate = new AudioWorkletNode(ctx, 'hp-voice-gate', {
                numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { level: p.level, initialVoiceDb }
            });
            if (onGate) gate.port.onmessage = (ev) => onGate(ev.data);
            node = node.connect(gate);
        }
        const dst = ctx.createMediaStreamDestination();
        node.connect(dst);
        if (ctx.state !== 'running') { try { await ctx.resume(); } catch (e) {} }
        const track = dst.stream.getAudioTracks()[0];
        let closed = false;
        return {
            track,
            label: track0.label || '',
            level: p.level,
            live: () => !closed && track0.readyState === 'live' && track.readyState === 'live',
            close() {
                if (closed) return;
                closed = true;
                try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
                try { track.stop(); } catch (e) {}
                try { ctx.close(); } catch (e) {}
            }
        };
    } catch (e) {
        try { stream.getTracks().forEach(t => t.stop()); } catch (x) {}
        try { ctx?.close(); } catch (x) {}
        throw new Error('pipeline:' + (e?.message || e));
    }
}
