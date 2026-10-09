// Procedural audio: every sound effect and both music loops are synthesized
// live with the Web Audio API (no audio files, no licensing issues).

type Music = 'none' | 'base' | 'fs';

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12); // MIDI -> Hz

const PREFS_KEY = 'cloudburst.audio';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private reverb!: ConvolverNode;
  private delay!: DelayNode;
  private noiseBuf!: AudioBuffer;
  private anticip: { osc: OscillatorNode; gain: GainNode; lfo: OscillatorNode } | null = null;
  private music: Music = 'none';
  private step = 0;
  private nextStepTime = 0;
  private timer: number | null = null;
  sfxOn = true;
  musicOn = true;

  constructor() {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      if (typeof p.sfx === 'boolean') this.sfxOn = p.sfx;
      if (typeof p.music === 'boolean') this.musicOn = p.music;
    } catch {
      /* storage unavailable */
    }
  }

  private savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ sfx: this.sfxOn, music: this.musicOn }));
    } catch {
      /* ignore */
    }
  }

  /** Must be called from a user gesture. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(comp).connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.gain.value = this.sfxOn ? 1 : 0;
      this.sfx.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.musicOn ? 0.55 : 0;
      this.musicBus.connect(this.master);
      // reverb
      this.reverb = ctx.createConvolver();
      const len = ctx.sampleRate * 2.4;
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
      this.reverb.buffer = ir;
      const rvGain = ctx.createGain();
      rvGain.gain.value = 0.32;
      this.reverb.connect(rvGain).connect(this.master);
      // tempo delay for the arpeggio
      this.delay = ctx.createDelay(1);
      this.delay.delayTime.value = 0.36;
      const fb = ctx.createGain();
      fb.gain.value = 0.32;
      const dl = ctx.createGain();
      dl.gain.value = 0.35;
      this.delay.connect(fb).connect(this.delay);
      this.delay.connect(dl).connect(this.musicBus);
      // noise
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const nd = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setSfx(on: boolean) {
    this.sfxOn = on;
    if (this.ctx) this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
    this.savePrefs();
  }

  setMusicOn(on: boolean) {
    this.musicOn = on;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.2);
    this.savePrefs();
  }

  // ------------------------------------------------------------ primitives

  private get t() {
    return this.ctx!.currentTime;
  }

  private tone(
    type: OscillatorType,
    freq: number,
    start: number,
    dur: number,
    peak: number,
    opts: { attack?: number; freqEnd?: number; dest?: AudioNode; reverb?: number; detune?: number; filter?: number } = {},
  ) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (opts.freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), start + dur);
    if (opts.detune) o.detune.value = opts.detune;
    const g = ctx.createGain();
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + a);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    let node: AudioNode = o;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.filter;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(opts.dest ?? this.sfx);
    if (opts.reverb) {
      const s = ctx.createGain();
      s.gain.value = opts.reverb;
      g.connect(s).connect(this.reverb);
    }
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  private noise(
    start: number,
    dur: number,
    peak: number,
    opts: { type?: BiquadFilterType; freq?: number; freqEnd?: number; q?: number; attack?: number; dest?: AudioNode; reverb?: number } = {},
  ) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 1000, start);
    if (opts.freqEnd) f.frequency.exponentialRampToValueAtTime(opts.freqEnd, start + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(opts.dest ?? this.sfx);
    if (opts.reverb) {
      const s = ctx.createGain();
      s.gain.value = opts.reverb;
      g.connect(s).connect(this.reverb);
    }
    src.start(start, Math.random());
    src.stop(start + dur + 0.05);
  }

  private bell(freq: number, start: number, dur: number, peak: number, reverb = 0.6) {
    [1, 2.76, 5.4, 8.93].forEach((p, i) => this.tone('sine', freq * p, start, dur / (1 + i * 0.7), peak / (1 + i * 1.6), { reverb }));
  }

  private ok() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  // ------------------------------------------------------------ sound effects

  click() {
    if (!this.ok()) return;
    this.tone('sine', 1500, this.t, 0.05, 0.12, { freqEnd: 900 });
  }

  spinStart() {
    if (!this.ok()) return;
    this.noise(this.t, 0.28, 0.12, { freq: 500, freqEnd: 2600, q: 1.4, attack: 0.04 });
    this.tone('triangle', 180, this.t, 0.2, 0.06, { freqEnd: 420 });
  }

  reelStop(i: number) {
    if (!this.ok()) return;
    const t = this.t;
    this.tone('sine', 120 - i * 4, t, 0.16, 0.32, { freqEnd: 50 });
    this.noise(t, 0.04, 0.09, { type: 'highpass', freq: 3500 });
    this.tone('square', 900 + i * 60, t, 0.03, 0.02);
  }

  scatter(n: number) {
    if (!this.ok()) return;
    const f = [523.25, 659.25, 783.99, 1046.5, 1318.5][Math.min(4, Math.max(0, n - 1))];
    this.bell(f, this.t, 1.6, 0.22);
    this.noise(this.t, 0.5, 0.05, { type: 'highpass', freq: 6000, reverb: 0.4 });
  }

  anticipationStart() {
    if (!this.ok() || this.anticip) return;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, this.t);
    osc.frequency.exponentialRampToValueAtTime(440, this.t + 2.5);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(400, this.t);
    f.frequency.exponentialRampToValueAtTime(3000, this.t + 2.5);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, this.t);
    gain.gain.exponentialRampToValueAtTime(0.07, this.t + 0.3);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 9;
    const lg = ctx.createGain();
    lg.gain.value = 0.03;
    lfo.connect(lg).connect(gain.gain);
    osc.connect(f).connect(gain).connect(this.sfx);
    osc.start();
    lfo.start();
    this.anticip = { osc, gain, lfo };
  }

  anticipationStop() {
    if (!this.anticip || !this.ctx) return;
    const { osc, gain, lfo } = this.anticip;
    gain.gain.cancelScheduledValues(this.t);
    gain.gain.setTargetAtTime(0.0001, this.t, 0.05);
    osc.stop(this.t + 0.3);
    lfo.stop(this.t + 0.3);
    this.anticip = null;
  }

  thunder(strength = 1) {
    if (!this.ok()) return;
    const t = this.t;
    this.noise(t, 0.12, 0.25 * strength, { type: 'highpass', freq: 2500 });
    this.noise(t + 0.02, 1.8 + strength, 0.5 * strength, { type: 'lowpass', freq: 900, freqEnd: 120, attack: 0.03, reverb: 0.5 });
    this.tone('sine', 70, t, 1.2, 0.25 * strength, { freqEnd: 32 });
  }

  /** Distant rumble for background lightning. */
  rumble(strength = 0.5) {
    if (!this.ok()) return;
    this.noise(this.t + 0.15, 2.2, 0.12 * strength, { type: 'lowpass', freq: 380, freqEnd: 90, attack: 0.4 });
  }

  storm(mult: number) {
    if (!this.ok()) return;
    const t = this.t;
    this.thunder(0.8);
    this.noise(t, 0.25, 0.2, { freq: 3000, freqEnd: 400, q: 6 });
    this.tone('sawtooth', 1600, t, 0.22, 0.08, { freqEnd: 120, filter: 4000 });
    // multiplier reveal sparkle (more notes for bigger multipliers)
    const notes = mult >= 50 ? 6 : mult >= 10 ? 5 : mult >= 5 ? 4 : 3;
    for (let i = 0; i < notes; i++) this.bell(NOTE(76 + [0, 4, 7, 12, 16, 19][i]), t + 0.38 + i * 0.06, 0.9, 0.09, 0.5);
  }

  win(level: number) {
    if (!this.ok()) return;
    const t = this.t;
    const seq = [72, 76, 79, 84, 88];
    const n = Math.min(seq.length, 2 + level);
    for (let i = 0; i < n; i++) {
      this.tone('triangle', NOTE(seq[i]), t + i * 0.07, 0.35, 0.13, { reverb: 0.3 });
      this.tone('sine', NOTE(seq[i] + 12), t + i * 0.07, 0.25, 0.04);
    }
  }

  tick() {
    if (!this.ok()) return;
    this.tone('sine', 2200 + Math.random() * 300, this.t, 0.025, 0.035);
  }

  bigWin(tier: number) {
    if (!this.ok()) return;
    const t = this.t;
    const root = 60 + tier * 2;
    const hits = [0, 0.16, 0.32, 0.62];
    hits.forEach((dt, i) => {
      const dur = i === hits.length - 1 ? 1.8 : 0.14;
      for (const iv of [0, 4, 7, 12]) {
        this.tone('sawtooth', NOTE(root + iv + (i === 3 ? 5 : 0)), t + dt, dur, 0.05, { filter: 2400, reverb: 0.3, detune: (Math.random() - 0.5) * 12 });
      }
    });
    this.noise(t, 0.9, 0.12, { type: 'highpass', freq: 5000, freqEnd: 9000, attack: 0.8 });
    this.noise(t + 0.62, 2.2, 0.16, { type: 'highpass', freq: 4000, reverb: 0.6 });
    this.tone('sine', 90, t + 0.62, 0.6, 0.35, { freqEnd: 40 });
  }

  fsTrigger() {
    if (!this.ok()) return;
    const t = this.t;
    this.noise(t, 1.3, 0.18, { freq: 300, freqEnd: 5000, q: 2, attack: 1.1 });
    this.tone('sawtooth', 110, t, 1.3, 0.06, { freqEnd: 880, filter: 3000, attack: 1.0 });
    setTimeout(() => {
      if (!this.ok()) return;
      this.thunder(1);
      for (const n of [57, 64, 69, 72, 76]) this.bell(NOTE(n + 12), this.t, 2.4, 0.08, 0.7);
    }, 1250);
  }

  retrigger() {
    if (!this.ok()) return;
    for (let i = 0; i < 8; i++) this.bell(NOTE(72 + [0, 4, 7, 12, 16, 19, 24, 28][i]), this.t + i * 0.05, 0.7, 0.07, 0.4);
  }

  coins() {
    if (!this.ok()) return;
    const t = this.t;
    for (let i = 0; i < 3; i++) {
      this.tone('sine', 1318.5, t + i * 0.09, 0.18, 0.08);
      this.tone('sine', 1760, t + i * 0.09 + 0.03, 0.22, 0.06);
    }
  }

  error() {
    if (!this.ok()) return;
    this.tone('square', 160, this.t, 0.3, 0.06, { filter: 900 });
  }

  // ------------------------------------------------------------ music

  setMusic(m: Music) {
    if (m === this.music) return;
    this.music = m;
    if (!this.ctx) return;
    if (m === 'none') {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      return;
    }
    if (!this.timer) {
      this.step = 0;
      this.nextStepTime = this.t + 0.1;
      this.timer = window.setInterval(() => this.schedule(), 25);
    }
  }

  private schedule() {
    if (!this.ctx || this.music === 'none') return;
    if (this.ctx.state !== 'running') {
      this.nextStepTime = this.ctx.currentTime + 0.1;
      return;
    }
    const fs = this.music === 'fs';
    const bpm = fs ? 124 : 98;
    const stepDur = 60 / bpm / 4;
    while (this.nextStepTime < this.ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextStepTime, stepDur, fs);
      this.nextStepTime += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(step: number, t: number, sd: number, fs: boolean) {
    const bus = this.musicBus;
    // A minor: Am F C G  |  free spins: Dm Bb F C (darker, driving)
    const prog = fs
      ? [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]]
      : [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chord = prog[bar];
    // pad
    if (s === 0) {
      for (const n of chord) {
        this.tone('sawtooth', NOTE(n), t, sd * 16 + 0.4, 0.018, { attack: 0.35, filter: fs ? 1400 : 900, dest: bus, detune: -7 });
        this.tone('sawtooth', NOTE(n), t, sd * 16 + 0.4, 0.018, { attack: 0.35, filter: fs ? 1400 : 900, dest: bus, detune: 7 });
      }
    }
    // bass
    const bassSteps = fs ? [0, 3, 6, 8, 11, 14] : [0, 6, 8, 14];
    if (bassSteps.includes(s)) this.tone('sawtooth', NOTE(chord[0] - 24), t, sd * 1.8, 0.1, { filter: 380, dest: bus });
    // arpeggio
    const arp = [0, 1, 2, 1, 2, 0, 1, 2];
    if (fs || s % 2 === 0) {
      const n = chord[arp[s % 8]] + 24 + (s >= 8 && fs ? 12 : 0);
      this.tone('triangle', NOTE(n), t, sd * 1.5, fs ? 0.03 : 0.026, { dest: this.delay });
      this.tone('triangle', NOTE(n), t, sd * 1.5, fs ? 0.03 : 0.026, { dest: bus });
    }
    // drums
    const kick = fs ? s % 4 === 0 : s === 0 || s === 8 || s === 10;
    if (kick) this.tone('sine', 130, t, 0.22, 0.32, { freqEnd: 42, dest: bus });
    if (s % 4 === 2) this.noise(t, 0.05, fs ? 0.05 : 0.03, { type: 'highpass', freq: 8000, dest: bus });
    if (s === 4 || s === 12) {
      this.noise(t, 0.16, fs ? 0.1 : 0.05, { freq: 1600, q: 0.8, dest: bus, reverb: 0.3 });
      this.tone('triangle', 190, t, 0.1, fs ? 0.06 : 0.03, { freqEnd: 140, dest: bus });
    }
  }
}

export const audio = new AudioEngine();
