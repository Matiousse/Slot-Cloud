// Pure-TypeScript DSP toolkit used to synthesize every sound of RAIJIN OVERLOAD
// offline (no DOM, no Web Audio): oscillators, biquads, envelopes, noise,
// Karplus-Strong strings, modal (inharmonic) resonators. Everything renders into
// Float32Arrays that the sound bank copies into AudioBuffers once at unlock.

export const TAU = Math.PI * 2;
export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
export const dbToGain = (d: number): number => Math.pow(10, d / 20);
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const smooth = (k: number): number => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

export type Sig = Float32Array;

/** Deterministic PRNG (mulberry32) so every render is reproducible. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  f(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  r(a: number, b: number): number {
    return a + (b - a) * this.f();
  }
  bi(): number {
    return this.f() * 2 - 1;
  }
  i(n: number): number {
    return Math.floor(this.f() * n);
  }
  /** ~N(0,1) */
  g(): number {
    return (this.f() + this.f() + this.f() + this.f() - 2) * 1.7320508;
  }
}

export const sig = (sr: number, seconds: number): Sig => new Float32Array(Math.max(1, Math.ceil(seconds * sr)));

/** dst[off + i] += src[i] * gain */
export function mix(dst: Sig, src: Sig, offset = 0, gain = 1): Sig {
  const o = Math.round(offset);
  const n = Math.min(src.length, dst.length - o);
  for (let i = Math.max(0, -o); i < n; i++) dst[o + i] += src[i] * gain;
  return dst;
}

export function gain(s: Sig, g: number): Sig {
  for (let i = 0; i < s.length; i++) s[i] *= g;
  return s;
}

export function peakOf(chs: Sig[]): number {
  let p = 0;
  for (const s of chs) for (let i = 0; i < s.length; i++) {
    const a = Math.abs(s[i]);
    if (a > p) p = a;
  }
  return p;
}

/** Multiply by an envelope function of time (s). */
export function env(s: Sig, sr: number, fn: (t: number) => number, from = 0): Sig {
  for (let i = from; i < s.length; i++) s[i] *= fn((i - from) / sr);
  return s;
}

/** Piecewise-linear envelope from [time, value] points (holds the last value). */
export function pts(p: [number, number][]): (t: number) => number {
  return (t: number) => {
    if (t <= p[0][0]) return p[0][1];
    for (let k = 1; k < p.length; k++) {
      if (t <= p[k][0]) {
        const [t0, v0] = p[k - 1];
        const [t1, v1] = p[k];
        return v0 + ((v1 - v0) * (t - t0)) / Math.max(1e-9, t1 - t0);
      }
    }
    return p[p.length - 1][1];
  };
}

/** e^(-6.9 t / t60): reaches -60 dB at t60 */
export const dec = (t: number, t60: number): number => Math.exp((-6.907755 * t) / t60);
/** attack (linear) then t60 exponential decay */
export const ad = (t: number, a: number, t60: number): number => (t < a ? t / a : dec(t - a, t60));

export function fadeIn(s: Sig, sr: number, sec: number): Sig {
  const n = Math.min(s.length, Math.round(sec * sr));
  for (let i = 0; i < n; i++) s[i] *= i / n;
  return s;
}

export function fadeOut(s: Sig, sr: number, sec: number): Sig {
  const n = Math.min(s.length, Math.round(sec * sr));
  const o = s.length - n;
  for (let i = 0; i < n; i++) s[o + i] *= 1 - i / n;
  return s;
}

export function dcBlock(s: Sig, sr: number, hz = 18): Sig {
  const r = Math.exp((-TAU * hz) / sr);
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < s.length; i++) {
    const x = s[i];
    const y = x - x1 + r * y1;
    x1 = x;
    y1 = y;
    s[i] = y;
  }
  return s;
}

/** Soft saturation normalised so that small signals keep unity gain. */
export function drive(s: Sig, amount: number, mixWet = 1): Sig {
  if (amount <= 0) return s;
  const norm = 1 / Math.tanh(amount);
  for (let i = 0; i < s.length; i++) {
    const x = s[i];
    s[i] = x + (Math.tanh(x * amount) * norm - x) * mixWet;
  }
  return s;
}

// ------------------------------------------------------------------ noise

export function white(rng: Rng, n: number): Sig {
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = rng.bi();
  return s;
}

/** Paul Kellet's refined pink noise filter. */
export function pink(rng: Rng, n: number): Sig {
  const s = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = rng.bi();
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    s[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return s;
}

/** Leaky-integrated (brown/red) noise, roughly unit RMS. */
export function brown(rng: Rng, n: number, leak = 0.996): Sig {
  const s = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    y = y * leak + rng.bi() * 0.09;
    s[i] = y;
  }
  return gain(s, 1 / Math.max(1e-6, rms(s)) * 0.3);
}

export function rms(s: Sig): number {
  let a = 0;
  for (let i = 0; i < s.length; i++) a += s[i] * s[i];
  return Math.sqrt(a / Math.max(1, s.length));
}

// ------------------------------------------------------------------ filters

export type BqType = 'lp' | 'hp' | 'bp' | 'peak' | 'notch' | 'ls' | 'hs';

/** RBJ cookbook biquad (direct form I). bp = constant 0 dB peak gain. */
export class Biquad {
  b0 = 1;
  b1 = 0;
  b2 = 0;
  a1 = 0;
  a2 = 0;
  x1 = 0;
  x2 = 0;
  y1 = 0;
  y2 = 0;
  constructor(
    readonly sr: number,
    type?: BqType,
    f?: number,
    q = 0.707,
    gainDb = 0,
  ) {
    if (type && f) this.set(type, f, q, gainDb);
  }
  set(type: BqType, f: number, q = 0.707, gainDb = 0): this {
    const fc = clamp(f, 10, this.sr * 0.47);
    const w = (TAU * fc) / this.sr;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    const alpha = sw / (2 * Math.max(0.05, q));
    const A = Math.pow(10, gainDb / 40);
    let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
    switch (type) {
      case 'lp':
        b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      case 'hp':
        b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      case 'bp':
        b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      case 'notch':
        b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      case 'peak':
        b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A;
        break;
      case 'ls': {
        const sq = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 - (A - 1) * cw + sq); b1 = 2 * A * (A - 1 - (A + 1) * cw); b2 = A * (A + 1 - (A - 1) * cw - sq);
        a0 = A + 1 + (A - 1) * cw + sq; a1 = -2 * (A - 1 + (A + 1) * cw); a2 = A + 1 + (A - 1) * cw - sq;
        break;
      }
      case 'hs': {
        const sq = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 + (A - 1) * cw + sq); b1 = -2 * A * (A - 1 + (A + 1) * cw); b2 = A * (A + 1 + (A - 1) * cw - sq);
        a0 = A + 1 - (A - 1) * cw + sq; a1 = 2 * (A - 1 - (A + 1) * cw); a2 = A + 1 - (A - 1) * cw - sq;
        break;
      }
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
    return this;
  }
  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
  proc(s: Sig, from = 0, to = s.length): Sig {
    for (let i = from; i < to; i++) s[i] = this.run(s[i]);
    return s;
  }
}

/** Static filter in place (optionally cascaded `order` times for steeper slopes). */
export function filt(s: Sig, sr: number, type: BqType, f: number, q = 0.707, gainDb = 0, order = 1): Sig {
  for (let k = 0; k < order; k++) new Biquad(sr, type, f, q, gainDb).proc(s);
  return s;
}

/** Time-varying filter: f(t) / q(t) re-evaluated every `block` samples. */
export function sweep(
  s: Sig,
  sr: number,
  type: BqType,
  f: (t: number) => number,
  q: number | ((t: number) => number) = 0.707,
  order = 1,
  gainDb = 0,
): Sig {
  const bqs: Biquad[] = [];
  for (let k = 0; k < order; k++) bqs.push(new Biquad(sr));
  const block = 32;
  for (let i = 0; i < s.length; i += block) {
    const t = i / sr;
    const qq = typeof q === 'number' ? q : q(t);
    const ff = f(t);
    for (const b of bqs) b.set(type, ff, qq, gainDb);
    const e = Math.min(s.length, i + block);
    for (let j = i; j < e; j++) {
      let v = s[j];
      for (const b of bqs) v = b.run(v);
      s[j] = v;
    }
  }
  return s;
}

/** Parallel band-pass bank (formants / resonances); returns a new signal. */
export function resonate(s: Sig, sr: number, bands: [number, number, number][]): Sig {
  const out = new Float32Array(s.length);
  for (const [f, q, g] of bands) {
    const b = new Biquad(sr, 'bp', f, q);
    for (let i = 0; i < s.length; i++) out[i] += b.run(s[i]) * g;
  }
  return out;
}

// ------------------------------------------------------------------ oscillators

const blep = (t: number, dt: number): number => {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
};

/** Band-limited (polyBLEP) oscillator, advanced one sample per call. */
export class Osc {
  ph: number;
  constructor(
    readonly sr: number,
    phase = 0,
  ) {
    this.ph = phase;
  }
  private adv(f: number): number {
    const dt = Math.min(0.49, Math.abs(f) / this.sr);
    this.ph += dt;
    if (this.ph >= 1) this.ph -= Math.floor(this.ph);
    return dt;
  }
  sin(f: number): number {
    const v = Math.sin(TAU * this.ph);
    this.adv(f);
    return v;
  }
  saw(f: number): number {
    const dt = Math.min(0.49, Math.abs(f) / this.sr);
    const v = 2 * this.ph - 1 - blep(this.ph, dt);
    this.adv(f);
    return v;
  }
  sqr(f: number, pw = 0.5): number {
    const dt = Math.min(0.49, Math.abs(f) / this.sr);
    let p2 = this.ph - pw;
    if (p2 < 0) p2 += 1;
    const v = (this.ph < pw ? 1 : -1) + blep(this.ph, dt) - blep(p2, dt);
    this.adv(f);
    return v;
  }
  tri(f: number): number {
    const v = 1 - 4 * Math.abs(this.ph - 0.5);
    this.adv(f);
    return v;
  }
}

// ------------------------------------------------------------------ modal synthesis

export interface Mode {
  /** frequency (Hz) */
  f: number;
  /** amplitude */
  a: number;
  /** decay time to -60 dB (s) */
  t60: number;
  /** optional attack (s) for "blooming" partials (gongs) */
  att?: number;
}

/** Sum of exponentially decaying sinusoids (recursive rotation, cheap). */
export function modal(sr: number, n: number, modes: Mode[], out: Sig = new Float32Array(n), offset = 0): Sig {
  const nyq = sr * 0.46;
  for (const m of modes) {
    if (m.f <= 0 || m.f >= nyq || m.a === 0) continue;
    const w = (TAU * m.f) / sr;
    const c = Math.cos(w);
    const s = Math.sin(w);
    const d = Math.exp(-6.907755 / (m.t60 * sr));
    // output x = a·sin(ωt)·decay (starts at zero: click-free)
    let x = 0;
    let y = m.a;
    const att = m.att ? Math.max(1, Math.round(m.att * sr)) : 0;
    const len = Math.min(n - offset, Math.ceil(m.t60 * sr * 1.05));
    for (let i = 0; i < len; i++) {
      const nx = (x * c + y * s) * d;
      const ny = (y * c - x * s) * d;
      x = nx;
      y = ny;
      out[offset + i] += att && i < att ? x * (i / att) : x;
    }
  }
  return out;
}

// ------------------------------------------------------------------ Karplus-Strong

export interface PluckOpts {
  f0: number;
  dur: number;
  /** decay of the fundamental to -60 dB (s) */
  t60: number;
  /** 0 = dull (classic averaging), 1 = very bright */
  bright: number;
  /** pluck position (fraction of the string), adds comb colouring */
  pick: number;
  /** excitation brightness (Hz cutoff of the noise burst) */
  excite: number;
  /** sawari buzz amount (shamisen), 0..1 */
  buzz?: number;
  /** pitch bend: start time (s), semitones, glide time (s) */
  bend?: [number, number, number];
  vel?: number;
}

/** Extended Karplus-Strong plucked string with fractional (Lagrange) delay and sawari buzz. */
export function pluck(sr: number, o: PluckOpts, rng: Rng): Sig {
  const n = Math.ceil(o.dur * sr);
  const out = new Float32Array(n);
  const size = 1 << Math.ceil(Math.log2(sr / (o.f0 * 0.7) + 8));
  const mask = size - 1;
  const line = new Float32Array(size);
  const P = sr / o.f0;
  // excitation: lowpassed noise burst of one period, pick-position comb
  const L = Math.max(4, Math.round(P));
  const ex = new Float32Array(L);
  const lp = new Biquad(sr, 'lp', o.excite, 0.6);
  for (let i = 0; i < L; i++) ex[i] = lp.run(rng.bi());
  const pk = Math.max(1, Math.round(o.pick * L));
  const exc = new Float32Array(L);
  for (let i = 0; i < L; i++) exc[i] = ex[i] - (i >= pk ? ex[i - pk] : 0);
  // window and normalise
  let ep = 0;
  for (let i = 0; i < L; i++) {
    exc[i] *= Math.sin((Math.PI * (i + 0.5)) / L) ** 0.5;
    ep = Math.max(ep, Math.abs(exc[i]));
  }
  const vel = o.vel ?? 1;
  for (let i = 0; i < L; i++) exc[i] *= vel / Math.max(1e-6, ep);

  const s = clamp(0.5 - o.bright * 0.42, 0.04, 0.5); // one-zero loop filter weight
  const g = Math.pow(10, -3 / (o.t60 * o.f0)); // loss per round trip
  const buzz = o.buzz ?? 0;
  const th = 0.55 - buzz * 0.4;
  let w = 0;
  let prev = 0;
  const bend = o.bend;
  for (let i = 0; i < n; i++) {
    let p = P;
    if (bend) {
      const t = i / sr;
      if (t > bend[0]) p = P / Math.pow(2, (bend[1] * smooth((t - bend[0]) / bend[2])) / 12);
    }
    const d = p - s; // compensate loop filter phase delay
    // 4-point Lagrange read at fractional delay d
    const rp = w - d;
    const ri = Math.floor(rp);
    const fr = rp - ri;
    const xm1 = line[(ri - 1) & mask];
    const x0 = line[ri & mask];
    const x1 = line[(ri + 1) & mask];
    const x2 = line[(ri + 2) & mask];
    const c1 = x1 - xm1 / 3 - x0 / 2 - x2 / 6;
    const c2 = (xm1 + x1) / 2 - x0;
    const c3 = (x2 - xm1) / 6 + (x0 - x1) / 2;
    const x = x0 + fr * (c1 + fr * (c2 + fr * c3));
    let y = g * ((1 - s) * x + s * prev);
    prev = x;
    if (buzz > 0 && y < -th) y = -th + (y + th) * 0.25; // one-sided bridge contact (sawari)
    if (i < L) y += exc[i];
    line[w & mask] = y;
    w++;
    out[i] = y;
  }
  return out;
}

// ------------------------------------------------------------------ misc generators

/**
 * Sparse random impulses (electric crackle / tearing): rate(t) impulses per second,
 * each a decaying grain of `grain` seconds with random sign & amplitude amp(t).
 */
export function impulses(sr: number, n: number, rng: Rng, rate: (t: number) => number, amp: (t: number) => number, grain = 0.0015): Sig {
  const out = new Float32Array(n);
  const gl = Math.max(2, Math.round(grain * sr));
  let t = 0;
  while (true) {
    const r = Math.max(0.01, rate(t));
    t += -Math.log(1 - rng.f() * 0.999) / r;
    const i0 = Math.floor(t * sr);
    if (i0 >= n) break;
    const a = amp(t) * (0.3 + 0.7 * rng.f()) * (rng.f() < 0.5 ? -1 : 1);
    const k = 3 / gl;
    for (let j = 0; j < gl && i0 + j < n; j++) out[i0 + j] += a * Math.exp(-j * k) * (j === 0 ? 1 : rng.bi());
  }
  return out;
}

/** Feedback comb (resonant body / barrel); returns a new signal. */
export function comb(s: Sig, sr: number, delaySec: number, fb: number, damp = 0.3): Sig {
  const D = Math.max(1, Math.round(delaySec * sr));
  const out = new Float32Array(s.length);
  const line = new Float32Array(D);
  let p = 0;
  let lpz = 0;
  for (let i = 0; i < s.length; i++) {
    const d = line[p];
    lpz = d * (1 - damp) + lpz * damp;
    const y = s[i] + lpz * fb;
    line[p] = y;
    p = (p + 1) % D;
    out[i] = y;
  }
  return out;
}

/** Sum list of signals into a new one of length n. */
export function sum(n: number, parts: [Sig, number, number?][]): Sig {
  const out = new Float32Array(n);
  for (const [s, g, off] of parts) mix(out, s, off ?? 0, g);
  return out;
}

/** Resample by linear interpolation (used for pitch-shifted copies of grains). */
export function resample(s: Sig, ratio: number): Sig {
  const n = Math.max(1, Math.floor(s.length / ratio));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * ratio;
    const i0 = Math.floor(p);
    const fr = p - i0;
    out[i] = (s[i0] ?? 0) * (1 - fr) + (s[i0 + 1] ?? 0) * fr;
  }
  return out;
}
