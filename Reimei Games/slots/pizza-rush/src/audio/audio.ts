// Son de PIZZA RUSH, 100 % généré par le code (Web Audio) : aucun fichier, aucune licence, rien d'externe.
// Bruitages de pizzeria + musique « tarentelle » (mandoline en Karplus-Strong, accordéon, contrebasse, tambourin).

type Music = 'base' | 'fs' | null;

const NOTE = (n: string) => {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(n)!;
  const st = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }[m[1] as 'C'] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * Math.pow(2, (st + (Number(m[3]) - 4) * 12) / 12);
};

class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private mus!: GainNode;
  private comp!: DynamicsCompressorNode;
  private noiseBuf!: AudioBuffer;
  private plucks = new Map<string, AudioBuffer>();
  enabled = true;
  private music: Music = null;
  private seqTimer = 0;
  private nextT = 0;
  private step = 0;
  private loops = new Map<string, { stop: () => void }>();

  unlock() {
    if (!this.ctx) {
      const C = window.AudioContext || (window as any).webkitAudioContext;
      if (!C) return;
      this.ctx = new C();
      const c = this.ctx;
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.ratio.value = 4;
      this.master = c.createGain();
      this.master.gain.value = this.enabled ? 0.9 : 0;
      this.sfx = c.createGain();
      this.sfx.gain.value = 0.85;
      this.mus = c.createGain();
      this.mus.gain.value = 0.32;
      this.sfx.connect(this.comp);
      this.mus.connect(this.comp);
      this.comp.connect(this.master);
      this.master.connect(c.destination);
      const n = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = n;
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) void this.ctx?.suspend();
        else if (this.enabled) void this.ctx?.resume();
      });
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.music && !this.seqTimer) this.startSeq();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  // ------------------------------------------------------------ briques
  private env(g: GainNode, t: number, a: number, peak: number, d: number, sustain = 0, r = 0.08) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t + a + d);
    if (sustain) g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + r);
  }

  private osc(type: OscillatorType, f: number, t: number, dur: number, peak: number, out: AudioNode, a = 0.005, detune = 0) {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.detune.value = detune;
    this.env(g, t, a, peak, dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + a + dur + 0.05);
    return o;
  }

  private noise(t: number, dur: number, peak: number, out: AudioNode, type: BiquadFilterType = 'bandpass', f = 2000, q = 1) {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const fl = c.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = c.createGain();
    this.env(g, t, 0.003, peak, dur);
    s.connect(fl).connect(g).connect(out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
    return fl;
  }

  /** Corde pincée (Karplus-Strong), rendue une fois par note puis mise en cache. */
  private pluckBuf(f: number, dur = 0.9, bright = 0.5) {
    const key = `${f.toFixed(1)}|${bright}`;
    let b = this.plucks.get(key);
    if (b) return b;
    const c = this.ctx!;
    const n = Math.floor(c.sampleRate * dur);
    b = c.createBuffer(1, n, c.sampleRate);
    const d = b.getChannelData(0);
    const p = Math.max(2, Math.round(c.sampleRate / f));
    const ring = new Float32Array(p);
    for (let i = 0; i < p; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0;
    const k = 0.5 * (0.994 + 0.005 * bright);
    for (let i = 0; i < n; i++) {
      const nx = (idx + 1) % p;
      const v = (ring[idx] + ring[nx]) * k;
      d[i] = ring[idx];
      ring[idx] = v;
      idx = nx;
    }
    this.plucks.set(key, b);
    return b;
  }

  private pluck(f: number, t: number, peak: number, out: AudioNode, dur = 0.9) {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.pluckBuf(f, dur);
    const g = c.createGain();
    g.gain.value = peak;
    const fl = c.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = 4200;
    s.connect(fl).connect(g).connect(out);
    s.start(t);
  }

  /** Accordéon : scies désaccordées + tremolo léger, filtrées. */
  private accordion(freqs: number[], t: number, dur: number, peak: number, out: AudioNode) {
    const c = this.ctx!;
    const g = c.createGain();
    const fl = c.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = 1900;
    const trem = c.createOscillator();
    const tg = c.createGain();
    trem.frequency.value = 5.5;
    tg.gain.value = peak * 0.18;
    trem.connect(tg).connect(g.gain);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.03);
    g.gain.setValueAtTime(peak, t + dur - 0.06);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    for (const f of freqs)
      for (const det of [-7, 7]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(fl);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    fl.connect(g).connect(out);
    trem.start(t);
    trem.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------ bruitages
  play(name: string, opt: { i?: number; n?: number } = {}) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx;
    const t = c.currentTime + 0.005;
    const out = this.sfx;
    const i = opt.i ?? 0;
    switch (name) {
      case 'click':
        this.osc('triangle', 900, t, 0.05, 0.25, out);
        break;
      case 'spin': {
        const f = this.noise(t, 0.35, 0.22, out, 'bandpass', 600, 0.8);
        f.frequency.exponentialRampToValueAtTime(2600, t + 0.3);
        this.osc('triangle', 220, t, 0.12, 0.12, out);
        break;
      }
      case 'stop': {
        // planche de bois : bruit grave court + ton boisé, un peu plus aigu à chaque rouleau
        const o = this.osc('sine', 150 + i * 12, t, 0.12, 0.55, out);
        o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
        this.noise(t, 0.05, 0.3, out, 'bandpass', 1400 + i * 120, 2);
        break;
      }
      case 'scatter':
      case 'ring': {
        // sonnerie de téléphone d'époque : cloches rapides modulées
        const dur = name === 'ring' ? 0.9 : 0.42;
        const c2 = this.ctx!;
        const g = c2.createGain();
        const am = c2.createOscillator();
        const amg = c2.createGain();
        am.frequency.value = 22;
        amg.gain.value = 0.5;
        am.connect(amg).connect(g.gain);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.32, t + 0.01);
        g.gain.setValueAtTime(0.32, t + dur - 0.05);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        for (const f of [1320 + i * 60, 1720 + i * 60]) {
          const o = c2.createOscillator();
          o.type = 'triangle';
          o.frequency.value = f;
          o.connect(g);
          o.start(t);
          o.stop(t + dur + 0.05);
        }
        g.connect(out);
        am.start(t);
        am.stop(t + dur + 0.05);
        break;
      }
      case 'wild':
        [NOTE('E6'), NOTE('G#6'), NOTE('B6')].forEach((f, k) => this.osc('sine', f, t + k * 0.05, 0.4, 0.15, out));
        this.noise(t, 0.3, 0.06, out, 'highpass', 6000);
        break;
      case 'tip':
        // pièce qui tombe dans le pot en verre
        this.osc('sine', 2900 + Math.random() * 300, t, 0.18, 0.2, out);
        this.osc('sine', 4300, t + 0.06, 0.25, 0.12, out);
        this.osc('sine', 3600, t + 0.11, 0.3, 0.08, out);
        break;
      case 'win': {
        const base = ['C5', 'E5', 'G5', 'C6'].map(NOTE);
        base.forEach((f, k) => this.pluck(f, t + k * 0.07, 0.55, out, 0.8));
        break;
      }
      case 'winBig': {
        const ch = ['C4', 'E4', 'G4'].map(NOTE);
        this.accordion(ch, t, 0.5, 0.12, out);
        this.accordion(['F4', 'A4', 'C5'].map(NOTE), t + 0.5, 0.35, 0.12, out);
        this.accordion(['G4', 'B4', 'D5', 'G5'].map(NOTE), t + 0.85, 0.9, 0.14, out);
        ['C5', 'E5', 'G5', 'C6', 'E6', 'G6'].map(NOTE).forEach((f, k) => this.pluck(f, t + k * 0.06, 0.5, out));
        break;
      }
      case 'tick':
        this.osc('square', 1800, t, 0.02, 0.05, out);
        break;
      case 'rush': {
        // scooter qui passe (moteur deux-temps) + double coup de klaxon
        const c2 = this.ctx!;
        const o = c2.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(70, t);
        o.frequency.exponentialRampToValueAtTime(170, t + 0.7);
        o.frequency.exponentialRampToValueAtTime(110, t + 1.3);
        const lfo = c2.createOscillator();
        const lg = c2.createGain();
        lfo.frequency.value = 38;
        lg.gain.value = 18;
        lfo.connect(lg).connect(o.frequency);
        const fl = c2.createBiquadFilter();
        fl.type = 'lowpass';
        fl.frequency.value = 900;
        const g = c2.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.22, t + 0.25);
        g.gain.linearRampToValueAtTime(0.0001, t + 1.35);
        o.connect(fl).connect(g).connect(out);
        o.start(t);
        o.stop(t + 1.4);
        lfo.start(t);
        lfo.stop(t + 1.4);
        for (const dt of [0.35, 0.55]) {
          this.osc('square', 520, t + dt, 0.13, 0.08, out);
          this.osc('square', 655, t + dt, 0.13, 0.06, out);
        }
        break;
      }
      case 'trigger': {
        this.play('ring');
        ['C5', 'E5', 'G5', 'C6'].map(NOTE).forEach((f, k) => this.pluck(f, t + 0.9 + k * 0.09, 0.6, out));
        this.accordion(['C4', 'E4', 'G4', 'C5'].map(NOTE), t + 1.25, 0.9, 0.14, out);
        break;
      }
      case 'jar':
        ['G5', 'B5', 'D6', 'G6'].map(NOTE).forEach((f, k) => this.osc('sine', f, t + k * 0.06, 0.35, 0.14, out));
        break;
      case 'banner':
        this.noise(t, 0.4, 0.12, out, 'bandpass', 900, 0.6).frequency.exponentialRampToValueAtTime(3500, t + 0.35);
        break;
      case 'sad':
        [NOTE('E4'), NOTE('D#4'), NOTE('D4')].forEach((f, k) => this.osc('triangle', f, t + k * 0.22, 0.3, 0.1, out, 0.02));
        break;
      case 'oops':
        this.osc('triangle', 660, t, 0.1, 0.12, out).frequency.exponentialRampToValueAtTime(330, t + 0.18);
        break;
    }
  }

  /** Boucle de suspense (rouleau en anticipation) : trémolo qui monte. */
  startLoop(name: 'suspense') {
    if (!this.ctx || !this.enabled || this.loops.has(name)) return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(NOTE('A4'), t);
    o.frequency.linearRampToValueAtTime(NOTE('A5'), t + 2.5);
    const am = c.createOscillator();
    const amg = c.createGain();
    am.frequency.value = 14;
    amg.gain.value = 0.06;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.2);
    am.connect(amg).connect(g.gain);
    o.connect(g).connect(this.sfx);
    o.start(t);
    am.start(t);
    this.loops.set(name, {
      stop: () => {
        const t2 = c.currentTime;
        g.gain.cancelScheduledValues(t2);
        g.gain.setTargetAtTime(0.0001, t2, 0.05);
        o.stop(t2 + 0.3);
        am.stop(t2 + 0.3);
      },
    });
  }
  stopLoop(name: string) {
    this.loops.get(name)?.stop();
    this.loops.delete(name);
  }

  // ------------------------------------------------------------ musique (tarentelle)
  setMusic(m: Music) {
    if (m === this.music) return;
    this.music = m;
    if (!this.ctx) return;
    this.mus.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.15);
    setTimeout(() => {
      if (!this.ctx) return;
      this.mus.gain.setTargetAtTime(m ? (m === 'fs' ? 0.36 : 0.3) : 0.0001, this.ctx.currentTime, 0.3);
      this.step = 0;
      this.nextT = this.ctx.currentTime + 0.1;
      if (m && !this.seqTimer) this.startSeq();
    }, 400);
  }

  private startSeq() {
    if (!this.ctx) return;
    this.nextT = this.ctx.currentTime + 0.1;
    this.seqTimer = window.setInterval(() => this.schedule(), 30);
  }

  // 6/8 : 12 croches par cycle de 2 mesures, progression Am – E – Am – E (base) / C – G – Am – F (free spins)
  private schedule() {
    if (!this.ctx || !this.music) return;
    const c = this.ctx;
    const fs = this.music === 'fs';
    const bpm = fs ? 172 : 148; // noire pointée
    const eighth = 60 / bpm / 3;
    const prog = fs
      ? [['C3', ['C4', 'E4', 'G4']], ['G2', ['B3', 'D4', 'G4']], ['A2', ['A3', 'C4', 'E4']], ['F2', ['A3', 'C4', 'F4']]]
      : [['A2', ['A3', 'C4', 'E4']], ['E2', ['G#3', 'B3', 'E4']], ['A2', ['A3', 'C4', 'E4']], ['E2', ['G#3', 'B3', 'D4']]];
    const melody = fs
      ? ['E5', 'G5', 'C6', 'G5', 'E5', 'G5', 'D5', 'G5', 'B5', 'G5', 'D5', 'B4', 'C5', 'E5', 'A5', 'E5', 'C5', 'E5', 'A4', 'C5', 'F5', 'C5', 'A4', 'C5']
      : ['E5', 'A5', 'C6', 'A5', 'E5', 'C5', 'B4', 'E5', 'G#5', 'E5', 'B4', 'G#4', 'A4', 'C5', 'E5', 'A5', 'G#5', 'A5', 'B5', 'G#5', 'E5', 'D5', 'B4', 'G#4'];
    while (this.nextT < c.currentTime + 0.15) {
      const t = this.nextT;
      const s = this.step;
      const bar = Math.floor(s / 6) % 4;
      const pos = s % 6;
      const [bass, chord] = prog[bar] as [string, string[]];
      const out = this.mus;
      // contrebasse : temps forts de chaque mesure 6/8
      if (pos === 0) this.pluck(NOTE(bass), t, 0.75, out, 0.6);
      if (pos === 3) this.pluck(NOTE(bass) * 1.5, t, 0.5, out, 0.5);
      // accordéon : accords sur les contretemps
      if (pos === 1 || pos === 2 || pos === 4 || pos === 5) this.accordion(chord.map(NOTE), t, eighth * 0.8, fs ? 0.05 : 0.045, out);
      // mandoline : mélodie en croches, avec trémolo (double attaque) sur les temps forts
      const m = melody[s % melody.length];
      this.pluck(NOTE(m), t, 0.32, out, 0.7);
      if (pos === 0 || pos === 3) this.pluck(NOTE(m), t + eighth / 2, 0.18, out, 0.5);
      // tambourin
      if (fs || pos % 3 !== 0) this.noise(t, 0.05, pos % 3 === 0 ? 0.08 : 0.04, out, 'highpass', 7000, 0.7);
      this.nextT += eighth;
      this.step = (s + 1) % 24;
    }
  }
}

export const audio = new AudioEngine();
