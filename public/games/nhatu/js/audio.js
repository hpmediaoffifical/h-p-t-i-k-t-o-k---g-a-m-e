/**
 * Procedural audio with WebAudio: a soft lo-fi loop and small UI/gameplay sounds.
 * No audio files needed. Must be started from a user gesture.
 */

const CHORDS = [
  [57, 60, 64, 67], // Am7
  [53, 57, 60, 64], // Fmaj7
  [48, 52, 55, 59], // Cmaj7
  [55, 59, 62, 65], // G7
];
const PENTA = [69, 72, 74, 76, 79, 81];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioFx {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.sfxOn = true;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
  }

  /** Create the AudioContext (call inside a click/keydown handler). */
  init() {
    if (this.ctx) {
      this.ctx.resume?.();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);
    this.music = this.ctx.createGain();
    this.music.gain.value = this.musicOn ? 0.16 : 0;
    this.music.connect(this.master);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = this.sfxOn ? 0.5 : 0;
    this.sfx.connect(this.master);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 100);
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.music) this.music.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.2);
  }

  setSfx(on) {
    this.sfxOn = on;
    if (this.sfx) this.sfx.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.05);
  }

  tone(freq, start, dur, { type = 'sine', gain = 0.3, dest = this.sfx, attack = 0.01, slide = 0 } = {}) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(dest);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  noiseHit(start, dur, { gain = 0.2, freq = 6000, type = 'highpass', dest = this.sfx } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(start, Math.random() * 0.5);
    src.stop(start + dur + 0.02);
  }

  /** Music sequencer: 16th notes at ~84 bpm, 4-bar chord loop. */
  schedule() {
    const ctx = this.ctx;
    const sixteenth = 60 / 84 / 4;
    while (this.nextTime < ctx.currentTime + 0.35) {
      const t = this.nextTime;
      const s = this.step % 16;
      const chord = CHORDS[Math.floor(this.step / 16) % CHORDS.length];
      if (s === 0) for (const n of chord) this.tone(mtof(n), t, sixteenth * 15, { type: 'triangle', gain: 0.045, dest: this.music, attack: 0.25 });
      if (s === 0 || s === 8) this.tone(mtof(chord[0] - 12), t, sixteenth * 6, { gain: 0.16, dest: this.music, attack: 0.02 });
      if (s === 0 || s === 10) this.tone(110, t, 0.18, { gain: 0.35, dest: this.music, slide: 0.35, attack: 0.005 });
      if (s === 4 || s === 12) this.noiseHit(t, 0.12, { gain: 0.08, freq: 1800, type: 'bandpass', dest: this.music });
      if (s % 2 === 1) this.noiseHit(t, 0.04, { gain: 0.035, dest: this.music });
      if ((s === 6 || s === 14) && Math.random() < 0.55) {
        const n = PENTA[Math.floor(Math.random() * PENTA.length)];
        this.tone(mtof(n), t, sixteenth * 3, { type: 'sine', gain: 0.06, dest: this.music, attack: 0.01 });
      }
      this.nextTime += sixteenth;
      this.step++;
    }
  }

  /** Play a named sound effect. */
  play(name) {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime + 0.01;
    switch (name) {
      case 'coin':
        this.tone(988, t, 0.08, { type: 'square', gain: 0.12 });
        this.tone(1319, t + 0.08, 0.22, { type: 'square', gain: 0.12 });
        break;
      case 'bell':
        for (const [f, d] of [[880, 0], [660, 0.35], [880, 0.7]]) {
          this.tone(f, t + d, 1.2, { gain: 0.18 });
          this.tone(f * 2.76, t + d, 0.6, { gain: 0.04 });
        }
        break;
      case 'pop':
        this.tone(600, t, 0.08, { gain: 0.15, slide: 1.8 });
        break;
      case 'bounce':
        this.tone(120, t, 0.14, { gain: 0.35, slide: 0.5 });
        break;
      case 'swish':
        this.noiseHit(t, 0.35, { gain: 0.25, freq: 3000, type: 'bandpass' });
        this.tone(1047, t + 0.1, 0.2, { gain: 0.1 });
        this.tone(1568, t + 0.22, 0.3, { gain: 0.1 });
        break;
      case 'miss':
        this.tone(300, t, 0.25, { type: 'sawtooth', gain: 0.06, slide: 0.6 });
        break;
      case 'jump':
        this.tone(300, t, 0.15, { gain: 0.12, slide: 2 });
        break;
      case 'scrub':
        this.noiseHit(t, 0.12, { gain: 0.06, freq: 2500, type: 'bandpass' });
        break;
      case 'buy':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.07, 0.18, { type: 'triangle', gain: 0.14 }));
        break;
      default:
        break;
    }
  }
}
