/**
 * Room-by-room audio with WebAudio.
 *
 * Every live room (and the lobby) owns a channel: source -> lowpass -> gain -> stereo pan.
 * The game sets each channel's volume/pan/muffle from the player's position every frame,
 * so walking past a room fades its music in, muffled behind the glass, clear inside.
 *
 * A channel plays `assets/audio/<file>` when that file exists (drop your own mp3 in),
 * otherwise a procedural loop in the genre's style. Sequencers only run for channels
 * that are audible, so 25 rooms cost about as much as 2-3.
 */

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const ALL = [...Array(16).keys()];
const EIGHTHS = [0, 2, 4, 6, 8, 10, 12, 14];

/** Procedural styles. Steps are 16th notes inside one bar; chords change every bar. */
export const STYLES = {
  kpop: { bpm: 124, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], kick: [0, 4, 8, 12], clap: [4, 12], hat: [2, 6, 10, 14], bass: { steps: EIGHTHS, wave: 'square', gain: 0.07 }, stab: { steps: [0, 3, 6, 10], wave: 'triangle', gain: 0.05 }, lead: { steps: [0, 3, 6, 8, 11, 14], prob: 0.5, wave: 'square', gain: 0.045, scale: [69, 72, 74, 76, 79, 81] } },
  edm: { bpm: 128, chords: [[53, 56, 60], [49, 53, 56], [56, 60, 63], [51, 55, 58]], kick: [0, 4, 8, 12], clap: [4, 12], hat: [2, 6, 10, 14], ohat: [2, 10], bass: { steps: [2, 6, 10, 14], wave: 'sawtooth', gain: 0.07 }, arp: { steps: ALL, wave: 'sawtooth', gain: 0.025, oct: 12 }, pad: { wave: 'sawtooth', gain: 0.018 } },
  vpop: { bpm: 104, chords: [[48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60]], kick: [0, 8, 10], snare: [4, 12], hat: EIGHTHS, bass: { steps: [0, 6, 8, 14], wave: 'triangle', gain: 0.14 }, pad: { wave: 'triangle', gain: 0.03 }, lead: { steps: [0, 2, 4, 6, 8, 10, 12], prob: 0.45, wave: 'triangle', gain: 0.07, scale: [72, 74, 76, 79, 81, 84] } },
  hiphop: { bpm: 90, swing: 0.18, chords: [[50, 53, 57, 60], [55, 58, 62, 65], [57, 60, 64, 67], [46, 50, 53, 57]], kick: [0, 7, 10], snare: [4, 12], hat: ALL, hatGain: 0.02, bass: { steps: [0, 7, 10], wave: 'sine', gain: 0.3, dur: 4, slide: true }, stab: { steps: [0, 10], wave: 'triangle', gain: 0.05 } },
  tiktok: { bpm: 116, chords: [[53, 57, 60], [48, 52, 55], [50, 53, 57], [46, 50, 53]], kick: [0, 6, 8, 14], clap: [4, 12], perc: { type: 'pop', steps: [3, 11] }, bass: { steps: [0, 8, 11], wave: 'square', gain: 0.07 }, lead: { steps: [0, 2, 5, 8, 10, 13], prob: 0.55, wave: 'square', gain: 0.04, scale: [65, 67, 69, 72, 74, 77] } },

  talk: { bpm: 80, chords: [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]], pad: { wave: 'triangle', gain: 0.04 }, kick: [0, 10], snare: [4, 12], snareGain: 0.05, hat: [1, 3, 5, 7, 9, 11, 13, 15], hatGain: 0.02, bass: { steps: [0, 8], wave: 'sine', gain: 0.14, dur: 6 }, lead: { steps: [6, 14], prob: 0.55, wave: 'sine', gain: 0.05, scale: [69, 72, 74, 76, 79, 81] } },
  sale: { bpm: 112, chords: [[48, 52, 55], [53, 57, 60], [55, 59, 62], [48, 52, 55]], stab: { steps: [0, 3, 6, 8, 11, 14], wave: 'triangle', gain: 0.05, strum: true }, clap: [4, 12], kick: [0, 8], bass: { steps: [0, 8], wave: 'triangle', gain: 0.13 }, perc: { type: 'shaker', steps: EIGHTHS } },
  tarot: { bpm: 60, chords: [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 48, 52]], pad: { wave: 'sine', gain: 0.06, attack: 1.2 }, lead: { steps: [0, 4, 8, 12], prob: 0.3, wave: 'sine', gain: 0.05, scale: [74, 76, 77, 79, 81, 83, 86] }, drone: { midi: 38, wave: 'sine', gain: 0.05 } },
  comedy: { bpm: 100, chords: [[48, 52, 55], [43, 47, 50], [48, 52, 55], [43, 47, 50]], bass: { steps: [0, 4, 8, 12], wave: 'square', gain: 0.07, dur: 0.6 }, stab: { steps: [2, 6, 10, 14], wave: 'triangle', gain: 0.05 }, perc: { type: 'wood', steps: [3, 7, 11, 15] }, lead: { steps: [0, 4, 8, 12], prob: 0.3, wave: 'square', gain: 0.03, scale: [72, 74, 76, 79, 81] } },
  news: { bpm: 120, chords: [[52, 55, 59], [48, 52, 55], [50, 54, 57], [47, 50, 54]], stab: { steps: [0, 3, 6], wave: 'sawtooth', gain: 0.035 }, perc: { type: 'tick', steps: EIGHTHS }, kick: [0, 8], snare: [4, 12], bass: { steps: [0, 3, 6, 8, 11, 14], wave: 'square', gain: 0.06 } },

  ballad: { bpm: 70, chords: [[48, 52, 55], [55, 59, 62], [57, 60, 64], [52, 55, 59], [53, 57, 60], [48, 52, 55], [53, 57, 60], [55, 59, 62]], arp: { steps: EIGHTHS, wave: 'triangle', gain: 0.07, oct: 12 }, pad: { wave: 'sine', gain: 0.035 }, kick: [0], snare: [8], snareGain: 0.05, bass: { steps: [0, 8], wave: 'sine', gain: 0.15, dur: 6 } },
  bolero: { bpm: 66, chords: [[57, 60, 64], [50, 53, 57], [52, 56, 59], [57, 60, 64]], stab: { steps: [0, 4, 6, 8, 12], wave: 'triangle', gain: 0.06, strum: true }, bass: { steps: [0, 8, 12], wave: 'triangle', gain: 0.15 }, perc: { type: 'shaker', steps: EIGHTHS }, lead: { steps: [0, 4, 8, 12], prob: 0.35, wave: 'sawtooth', gain: 0.025, trem: true, scale: [69, 71, 72, 74, 76, 77] } },
  acoustic: { bpm: 94, chords: [[55, 59, 62], [50, 54, 57], [52, 55, 59], [48, 52, 55]], stab: { steps: [0, 2, 3, 6, 8, 10, 11, 14], wave: 'triangle', gain: 0.045, strum: true }, perc: { type: 'shaker', steps: EIGHTHS }, kick: [0, 8], snare: [4, 12], snareGain: 0.05, bass: { steps: [0, 8], wave: 'triangle', gain: 0.12 } },
  rnb: { bpm: 84, swing: 0.2, chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], pad: { wave: 'sine', gain: 0.05 }, perc: { type: 'snap', steps: [4, 12] }, kick: [0, 7, 10], hat: [2, 6, 10, 14], hatGain: 0.025, bass: { steps: [0, 7, 10], wave: 'sine', gain: 0.2, dur: 3 } },

  racing: { bpm: 150, chords: [[52, 55, 59], [48, 52, 55], [50, 54, 57], [47, 51, 54]], bass: { steps: ALL, wave: 'sawtooth', gain: 0.05 }, kick: [0, 4, 8, 12], snare: [4, 12], lead: { steps: EIGHTHS, prob: 0.5, wave: 'sawtooth', gain: 0.03, scale: [64, 67, 69, 71, 74, 76] }, drone: { midi: 28, wave: 'sawtooth', gain: 0.03, slide: 1.6 } },
  battle: { bpm: 140, chords: [[48, 51, 55], [44, 48, 51], [46, 50, 53], [43, 47, 50]], perc: { type: 'tom', steps: [0, 3, 6, 10, 12, 14] }, kick: [0, 8], stab: { steps: [0, 6, 12], wave: 'sawtooth', gain: 0.04 }, lead: { steps: [0, 4, 8, 12], prob: 0.4, wave: 'sawtooth', gain: 0.03, scale: [60, 63, 65, 67, 70, 72] } },
  moba: { bpm: 120, chords: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]], pad: { wave: 'sawtooth', gain: 0.02 }, perc: { type: 'tom', steps: [0, 8] }, kick: [0, 8], snare: [12], lead: { steps: [0, 4, 6, 8, 12], prob: 0.4, wave: 'triangle', gain: 0.06, scale: [62, 65, 67, 69, 72, 74] } },
  craft: { bpm: 90, chords: [[48, 52, 55, 59], [55, 59, 62], [57, 60, 64], [53, 57, 60, 64]], lead: { steps: [0, 3, 6, 8, 11], prob: 0.35, wave: 'sine', gain: 0.07, scale: [72, 74, 76, 79, 81, 84] }, arp: { steps: [0, 6, 12], wave: 'sine', gain: 0.05, oct: 0 } },
  horror: { bpm: 50, chords: [[48, 51, 55], [49, 52, 56]], pad: { wave: 'sawtooth', gain: 0.012, attack: 2 }, perc: { type: 'heart', steps: [0, 3] }, lead: { steps: [8], prob: 0.15, wave: 'sine', gain: 0.04, scale: [85, 86, 91] }, drone: { midi: 31, wave: 'triangle', gain: 0.06 } },

  lobby: { bpm: 92, swing: 0.12, chords: [[50, 53, 57, 60, 64], [55, 59, 64, 65], [48, 52, 55, 59, 62], [57, 61, 64, 67]], pad: { wave: 'sine', gain: 0.035 }, bass: { steps: [0, 4, 8, 12], wave: 'sine', gain: 0.14, walk: true }, hat: [2, 6, 10, 14], hatGain: 0.015, kick: [0, 10], kickGain: 0.25 },
};

export class AudioFx {
  /** @param {{files?: string[]}} [opts] files = tên file nhạc có trong audio/ (data.json → audioFiles) */
  constructor({ files = [] } = {}) {
    this.ctx = null;
    this.musicOn = true;
    this.sfxOn = true;
    this.channels = new Map();
    this.audioList = Promise.resolve(new Set(files || [])); // danh sách tĩnh (app không có /api/audio)
    this.timer = null;
  }

  /** Seconds on the shared clock (AudioContext time once audio has started). */
  now() {
    return this.ctx ? this.ctx.currentTime : performance.now() / 1000;
  }

  /** Create the AudioContext (call inside a click/keydown handler). */
  init() {
    if (this.ctx) {
      this.ctx.resume?.();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const before = this.now();
    this.ctx = new AC();
    const shift = this.ctx.currentTime - before;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? 0.55 : 0;
    this.musicBus.connect(this.master);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = this.sfxOn ? 0.6 : 0;
    this.sfx.connect(this.master);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    for (const ch of this.channels.values()) {
      ch.origin += shift;
      this._wire(ch);
    }
    this.timer = setInterval(() => this.tick(), 90);
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.2);
  }

  setSfx(on) {
    this.sfxOn = on;
    if (this.sfx) this.sfx.gain.setTargetAtTime(on ? 0.6 : 0, this.ctx.currentTime, 0.05);
  }

  /** Does `url` (e.g. "audio/kpop.mp3") exist on the server? Asks once for the folder listing. */
  hasFile(url) {
    if (!url) return Promise.resolve(false);
    return this.audioList.then((set) => set.has(url.replace(/^audio\//, '')));
  }

  /**
   * Register (or retarget) a channel.
   * @param {string} id room id or 'lobby'
   * @param {{style:string, file?:string, bpm?:number}} src
   */
  setChannel(id, src) {
    let ch = this.channels.get(id);
    const style = STYLES[src.style] ?? STYLES.lobby;
    if (!ch) {
      ch = { id, vol: 0, pan: 0, muffle: 0, step: 0, nextTime: 0, running: false, el: null, playing: false };
      this.channels.set(id, ch);
    }
    ch.style = style;
    ch.bpm = src.bpm ?? style.bpm;
    ch.origin = this.now();
    ch.running = false;
    ch.fileUrl = null;
    if (ch.el) {
      ch.el.pause();
      ch.playing = false;
    }
    const token = (ch.token = {});
    this.hasFile(src.file).then((ok) => {
      if (ch.token !== token || !ok) return;
      ch.fileUrl = src.file;
      if (!ch.el) {
        ch.el = new Audio();
        ch.el.loop = true;
        ch.el.preload = 'none';
        if (this.ctx) this._wireEl(ch);
      }
      ch.el.src = src.file;
    });
    if (this.ctx) this._wire(ch);
    return ch;
  }

  _wire(ch) {
    if (ch.input) return;
    const c = this.ctx;
    ch.input = c.createGain();
    ch.filter = c.createBiquadFilter();
    ch.filter.type = 'lowpass';
    ch.filter.frequency.value = 18000;
    ch.gain = c.createGain();
    ch.gain.gain.value = 0;
    ch.panner = c.createStereoPanner ? c.createStereoPanner() : null;
    ch.input.connect(ch.filter).connect(ch.gain);
    if (ch.panner) ch.gain.connect(ch.panner).connect(this.musicBus);
    else ch.gain.connect(this.musicBus);
    if (ch.el) this._wireEl(ch);
  }

  _wireEl(ch) {
    if (ch.elNode || !ch.input) return;
    try {
      ch.elNode = this.ctx.createMediaElementSource(ch.el);
      ch.elNode.connect(ch.input);
    } catch {
      /* element already wired */
    }
  }

  /** Beats elapsed on a channel's clock (drives synced dancing and lights). */
  beat(id) {
    const ch = this.channels.get(id);
    if (!ch) return this.now() * 2;
    return (this.now() - ch.origin) * (ch.bpm / 60);
  }

  bpm(id) {
    return this.channels.get(id)?.bpm ?? 120;
  }

  /** Seconds elapsed on a channel's clock (for rhythm judging). */
  elapsed(id) {
    const ch = this.channels.get(id);
    return ch ? this.now() - ch.origin : 0;
  }

  /**
   * Per-frame mix from the game: vol 0..1, pan -1..1, muffle 0 (clear) .. 1 (behind glass).
   */
  mix(id, vol, pan, muffle) {
    const ch = this.channels.get(id);
    if (!ch) return;
    ch.vol = vol;
    ch.pan = pan;
    ch.muffle = muffle;
    if (!this.ctx || !ch.gain) return;
    const t = this.ctx.currentTime;
    ch.gain.gain.setTargetAtTime(vol, t, 0.12);
    if (ch.panner) ch.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.12);
    ch.filter.frequency.setTargetAtTime(18000 * Math.pow(700 / 18000, muffle), t, 0.15);
  }

  /** Scheduler: runs every ~90 ms. */
  tick() {
    const c = this.ctx;
    if (!c) return;
    for (const ch of this.channels.values()) {
      const audible = ch.vol > 0.008 && this.musicOn;
      if (ch.fileUrl && ch.el) {
        if (audible && !ch.playing) {
          ch.playing = true;
          ch.el.play().catch(() => (ch.playing = false));
        } else if (!audible && ch.playing && ch.vol < 0.002) {
          ch.playing = false;
          ch.el.pause();
        }
        continue;
      }
      if (!audible) {
        ch.running = false;
        continue;
      }
      const st = ch.style;
      const six = 60 / ch.bpm / 4;
      if (!ch.running) {
        ch.running = true;
        ch.step = Math.ceil((c.currentTime + 0.05 - ch.origin) / six);
        ch.nextTime = ch.origin + ch.step * six;
      }
      while (ch.nextTime < c.currentTime + 0.3) {
        const swing = st.swing && ch.step % 2 === 1 ? st.swing * six : 0;
        this.playStep(ch, st, ch.nextTime + swing, ch.step, six);
        ch.step++;
        ch.nextTime = ch.origin + ch.step * six;
      }
    }
  }

  playStep(ch, st, t, step, six) {
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const chord = st.chords[bar % st.chords.length];
    const out = ch.input;
    if (st.pad && s === 0) for (const n of chord) this.tone(mtof(n), t, six * 16, { type: st.pad.wave, gain: st.pad.gain, dest: out, attack: st.pad.attack ?? 0.3 });
    if (st.drone && s === 0) this.tone(mtof(st.drone.midi), t, six * 16.5, { type: st.drone.wave, gain: st.drone.gain, dest: out, attack: 0.6, slide: st.drone.slide ?? 0 });
    if (st.stab?.steps.includes(s)) {
      chord.forEach((n, i) => this.tone(mtof(n + 12), t + (st.stab.strum ? i * 0.018 : 0), six * 1.6, { type: st.stab.wave, gain: st.stab.gain, dest: out, attack: 0.005 }));
    }
    if (st.arp?.steps.includes(s)) {
      const n = chord[Math.floor(step / (st.arp.steps.length >= 16 ? 1 : 2)) % chord.length] + (st.arp.oct ?? 12);
      this.tone(mtof(n), t, six * 1.8, { type: st.arp.wave, gain: st.arp.gain, dest: out, attack: 0.005 });
    }
    if (st.bass?.steps.includes(s)) {
      let root = chord[0] - 12;
      if (st.bass.walk) root = chord[[0, 2, 1, 2][(s / 4) % 4] ?? 0] - 12;
      this.tone(mtof(root), t, six * (st.bass.dur ?? 1.6), { type: st.bass.wave, gain: st.bass.gain, dest: out, attack: 0.008, slide: st.bass.slide ? 0.7 : 0 });
    }
    if (st.lead?.steps.includes(s) && Math.random() < st.lead.prob) {
      const n = st.lead.scale[Math.floor(Math.random() * st.lead.scale.length)];
      if (st.lead.trem) for (let i = 0; i < 4; i++) this.tone(mtof(n), t + i * six * 0.5, six * 0.45, { type: st.lead.wave, gain: st.lead.gain, dest: out, attack: 0.004 });
      else this.tone(mtof(n), t, six * 2.5, { type: st.lead.wave, gain: st.lead.gain, dest: out, attack: 0.01 });
    }
    if (st.kick?.includes(s)) this.kick(t, out, st.kickGain ?? 0.5);
    if (st.snare?.includes(s)) {
      this.noiseHit(t, 0.14, { gain: st.snareGain ?? 0.12, freq: 1800, type: 'bandpass', dest: out });
      this.tone(185, t, 0.08, { gain: (st.snareGain ?? 0.12) * 0.8, dest: out, attack: 0.002 });
    }
    if (st.clap?.includes(s)) for (let i = 0; i < 3; i++) this.noiseHit(t + i * 0.011, 0.09, { gain: 0.09, freq: 1400, type: 'bandpass', dest: out });
    if (st.hat?.includes(s)) this.noiseHit(t, 0.04, { gain: st.hatGain ?? 0.04, freq: 7500, dest: out });
    if (st.ohat?.includes(s)) this.noiseHit(t, 0.22, { gain: 0.035, freq: 6500, dest: out });
    if (st.perc?.steps.includes(s)) this.perc(st.perc.type, t, out);
  }

  tone(freq, start, dur, { type = 'sine', gain = 0.3, dest = this.sfx, attack = 0.01, slide = 0 } = {}) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(dest);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  noiseHit(start, dur, { gain = 0.2, freq = 6000, type = 'highpass', dest = this.sfx, attack = 0 } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    if (attack) {
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(gain, start + attack);
    } else g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(start, Math.random() * 0.5);
    src.stop(start + dur + 0.02);
  }

  kick(t, dest, gain = 0.5) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.2);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.3);
  }

  perc(type, t, dest) {
    switch (type) {
      case 'pop':
        this.tone(700, t, 0.07, { gain: 0.08, dest, slide: 2 });
        break;
      case 'wood':
        this.tone(950, t, 0.05, { type: 'square', gain: 0.03, dest, attack: 0.002 });
        break;
      case 'shaker':
        this.noiseHit(t, 0.06, { gain: 0.03, freq: 5200, dest });
        break;
      case 'tick':
        this.tone(2100, t, 0.025, { type: 'square', gain: 0.015, dest, attack: 0.001 });
        break;
      case 'snap':
        this.noiseHit(t, 0.05, { gain: 0.1, freq: 2600, type: 'bandpass', dest });
        break;
      case 'tom':
        this.tone(130, t, 0.32, { gain: 0.25, dest, slide: 0.5, attack: 0.003 });
        break;
      case 'heart':
        this.tone(62, t, 0.16, { gain: 0.35, dest, attack: 0.005 });
        break;
      default:
        break;
    }
  }

  /** Short sound through a temporary gain/pan (for positional one-shots). */
  _bus(vol = 1, pan = 0) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p).connect(this.sfx);
    } else g.connect(this.sfx);
    setTimeout(() => g.disconnect(), 4000);
    return g;
  }

  /** Babble "voice" for a line of speech (Animal-Crossing style blips). */
  voice(text, pitch = 1, vol = 1, pan = 0) {
    if (!this.ctx || !this.sfxOn || vol < 0.02) return;
    const dest = this._bus(vol * 0.6, pan);
    const n = Math.min(14, Math.max(3, Math.round(String(text).length / 3)));
    const t0 = this.ctx.currentTime + 0.02;
    for (let i = 0; i < n; i++) {
      const f = 220 * pitch * (1 + Math.random() * 0.35);
      this.tone(f, t0 + i * 0.075, 0.06, { type: 'triangle', gain: 0.12, dest, attack: 0.005 });
    }
  }

  /** Hum a melody [[midi, beats], ...] (song-guess mini game). */
  melody(notes, bpm = 110, vol = 1) {
    if (!this.ctx) return 0;
    const dest = this._bus(vol);
    const beat = 60 / bpm;
    let t = this.ctx.currentTime + 0.1;
    for (const [m, b] of notes) {
      this.tone(mtof(m), t, b * beat * 0.92, { type: 'triangle', gain: 0.22, dest, attack: 0.02 });
      this.tone(mtof(m + 12), t, b * beat * 0.6, { type: 'sine', gain: 0.05, dest, attack: 0.02 });
      t += b * beat;
    }
    return t - this.ctx.currentTime;
  }

  /** Crowd cheer swell at a given loudness. */
  cheer(vol = 1, pan = 0) {
    if (!this.ctx || !this.sfxOn || vol < 0.02) return;
    const dest = this._bus(vol, pan);
    const t = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) this.noiseHit(t + i * 0.05, 1.6, { gain: 0.12, freq: 900 + i * 500, type: 'bandpass', dest, attack: 0.25 });
    for (let i = 0; i < 6; i++) this.tone(500 + Math.random() * 700, t + Math.random() * 0.6, 0.25, { type: 'triangle', gain: 0.02, dest, slide: 1.3 });
  }

  /** Play a named sound effect. */
  play(name, vol = 1, pan = 0) {
    if (!this.ctx || !this.sfxOn || vol < 0.02) return;
    const dest = this._bus(vol, pan);
    const t = this.ctx.currentTime + 0.01;
    const T = (f, d, o = {}) => this.tone(f, t + (o.at ?? 0), d, { ...o, dest });
    switch (name) {
      case 'coin':
        T(988, 0.08, { type: 'square', gain: 0.1 });
        T(1319, 0.22, { type: 'square', gain: 0.1, at: 0.08 });
        break;
      case 'buy':
        [523, 659, 784, 1047].forEach((f, i) => T(f, 0.18, { type: 'triangle', gain: 0.13, at: i * 0.07 }));
        break;
      case 'gift':
        [1319, 1568, 2093].forEach((f, i) => T(f, 0.25, { gain: 0.1, at: i * 0.06 }));
        break;
      case 'bigGift':
        [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => T(f, 0.3, { type: 'square', gain: 0.07, at: i * 0.09 }));
        this.noiseHit(t + 0.6, 0.8, { gain: 0.08, freq: 6000, dest });
        break;
      case 'heart':
        T(700 + Math.random() * 300, 0.08, { gain: 0.08, slide: 1.6 });
        break;
      case 'pop':
        T(600, 0.08, { gain: 0.14, slide: 1.8 });
        break;
      case 'whoosh':
        this.noiseHit(t, 0.6, { gain: 0.15, freq: 1200, type: 'bandpass', dest, attack: 0.2 });
        T(200, 0.6, { type: 'sawtooth', gain: 0.04, slide: 4 });
        break;
      case 'win':
        [784, 988, 1175, 1568].forEach((f, i) => T(f, 0.35, { type: 'square', gain: 0.08, at: i * 0.12 }));
        break;
      case 'lose':
        [392, 330, 262].forEach((f, i) => T(f, 0.35, { type: 'triangle', gain: 0.1, at: i * 0.18 }));
        break;
      case 'tick':
        T(1800, 0.03, { type: 'square', gain: 0.05 });
        break;
      case 'confetti':
        for (let i = 0; i < 6; i++) T(900 + Math.random() * 1500, 0.06, { gain: 0.05, at: Math.random() * 0.3 });
        break;
      case 'laser':
        T(1800, 0.4, { type: 'sawtooth', gain: 0.05, slide: 0.15 });
        break;
      case 'smoke':
        this.noiseHit(t, 1.4, { gain: 0.1, freq: 800, type: 'lowpass', dest, attack: 0.2 });
        break;
      case 'perfect':
        T(1568, 0.12, { type: 'square', gain: 0.07 });
        T(2093, 0.16, { type: 'square', gain: 0.07, at: 0.06 });
        break;
      case 'good':
        T(1175, 0.12, { type: 'triangle', gain: 0.1 });
        break;
      case 'miss':
        T(220, 0.18, { type: 'sawtooth', gain: 0.05, slide: 0.7 });
        break;
      case 'jump':
        T(300, 0.15, { gain: 0.12, slide: 2 });
        break;
      case 'bell':
        for (const [f, d] of [[880, 0], [1175, 0.25]]) T(f, 0.9, { gain: 0.12, at: d });
        break;
      case 'click':
        T(1200, 0.03, { type: 'triangle', gain: 0.06 });
        break;
      default:
        break;
    }
  }
}
