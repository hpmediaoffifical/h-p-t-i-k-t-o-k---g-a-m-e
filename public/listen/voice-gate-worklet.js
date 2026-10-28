// AudioWorklet của trang nghe giọng Creator: chạy cổng chặn nền (/lib/voice-gate.mjs) trên luồng
// âm thanh — vẫn chạy đều khi cửa sổ nghe bị thu nhỏ (timer của trang thì bị trình duyệt hãm).
import { createVoiceGate, voiceFilterParams } from '/lib/voice-gate.mjs';

class HpVoiceGate extends AudioWorkletProcessor {
    constructor(options) {
        super();
        const opts = options?.processorOptions || {};
        this.gate = createVoiceGate({ sampleRate, blockSize: 128, params: voiceFilterParams(opts.level), initialVoiceDb: opts.initialVoiceDb });
        this.out = new Float32Array(128);
        this.blocks = 0;
        this.openBlocks = 0;
        this.reportEvery = Math.max(1, Math.round(sampleRate / 128 / 8));   // ~8 lần/giây
    }
    process(inputs, outputs) {
        const input = inputs[0] && inputs[0][0];
        const output = outputs[0] && outputs[0][0];
        if (!output) return true;
        if (!input) { output.fill(0); return true; }
        if (this.out.length !== input.length) this.out = new Float32Array(input.length);
        const open = this.gate.process(input, this.out);
        output.set(this.out.subarray(0, output.length));
        for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(output);
        this.blocks += 1;
        if (open) this.openBlocks += 1;
        if (this.blocks >= this.reportEvery) {
            this.port.postMessage({ ...this.gate.state(), openRatio: this.openBlocks / this.blocks });
            this.blocks = 0;
            this.openBlocks = 0;
        }
        return true;
    }
}

registerProcessor('hp-voice-gate', HpVoiceGate);
