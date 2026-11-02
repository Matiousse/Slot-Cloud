// Sound generators for RAIJIN OVERLOAD. Each function synthesizes one sound
// (instrument note, drum hit, effect layer) offline into Float32Array channels.
// They are pure functions of (sampleRate, rng, params) so renders are reproducible.

import {
  Biquad, Osc, Rng, TAU, ad, brown, clamp, comb, dcBlock, dec, drive, env, fadeIn, fadeOut, filt, gain,
  impulses, lerp, mix, modal, mtof, pink, pluck, pts, resonate, sig, smooth, sweep, white, type Mode, type Sig,
} from './dsp';

export type Chans = Sig[];
/** heavy generators yield between stages so the bank can give the main thread back */
export type Gen = Generator<void, Chans, void>;

// ======================================================================= TAIKO

export interface DrumSpec {
  f0: number;
  /** strike pitch = f0 * glide, relaxing with time constant glideT (tension modulation) */
  glide: number;
  glideT: number;
  t60: number;
  dur: number;
  stick: number;
  stickF: number;
  slap: number;
  slapF: number;
  body: number;
  bodyF: number;
  /** low "air" push of the big heads */
  air: number;
  /** overtone richness 0..1 */
  modes: number;
  drive: number;
}

// circular membrane: [ratio, amp, t60 factor]; centre strikes favour the (0,n) modes
const MEMBRANE: [number, number, number][] = [
  [1, 1, 1],
  [1.594, 0.42, 0.55],
  [2.136, 0.26, 0.42],
  [2.296, 0.46, 0.5],
  [2.653, 0.16, 0.34],
  [2.918, 0.13, 0.3],
  [3.156, 0.1, 0.26],
  [3.6, 0.16, 0.3],
  [4.06, 0.07, 0.2],
  [4.6, 0.05, 0.16],
];

export const ODAIKO: DrumSpec = {
  f0: 60, glide: 1.5, glideT: 0.05, t60: 1.75, dur: 2.2, stick: 0.8, stickF: 2400, slap: 1.25, slapF: 480,
  body: 0.75, bodyF: 140, air: 0.6, modes: 1.0, drive: 2.2,
};
export const NAGADO: DrumSpec = {
  f0: 98, glide: 1.38, glideT: 0.04, t60: 1.0, dur: 1.25, stick: 0.85, stickF: 2900, slap: 1.1, slapF: 760,
  body: 0.55, bodyF: 260, air: 0.45, modes: 0.9, drive: 1.6,
};
export const SHIME: DrumSpec = {
  f0: 420, glide: 1.1, glideT: 0.012, t60: 0.2, dur: 0.38, stick: 1.0, stickF: 3800, slap: 0.45, slapF: 1500,
  body: 0.25, bodyF: 900, air: 0, modes: 1, drive: 1.2,
};

export function taiko(sr: number, rng: Rng, d: DrumSpec, vel: number): Chans {
  const n = Math.ceil(d.dur * sr);
  const out = new Float32Array(n);
  const glide = 1 + (d.glide - 1) * (0.55 + 0.45 * vel);
  const rich = d.modes * (0.45 + 0.55 * vel);
  const att = Math.max(1, Math.round(0.0007 * sr));
  // shared tension-modulated pitch curve (head stretched by the strike relaxes)
  const pc = new Float32Array(n);
  {
    const k = Math.exp(-1 / (d.glideT * sr));
    let e = glide - 1;
    for (let i = 0; i < n; i++) {
      pc[i] = 1 + e;
      e *= k;
    }
  }
  for (let m = 0; m < MEMBRANE.length; m++) {
    const [r0, a0, tf] = MEMBRANE[m];
    const fr = (d.f0 * r0 * (1 + rng.bi() * (m ? 0.014 : 0.004))) / sr;
    let a = m === 0 ? 1 : a0 * rich * (0.7 + 0.6 * rng.f());
    const t60 = d.t60 * tf * (m === 0 ? 1 : 0.85 + 0.3 * rng.f());
    const dk = Math.exp(-6.907755 / (t60 * sr));
    const len = Math.min(n, Math.ceil(t60 * sr * 1.05));
    let ph = 0;
    for (let i = 0; i < len; i++) {
      ph += fr * pc[i];
      out[i] += Math.sin(TAU * ph) * a * (i < att ? i / att : 1);
      a *= dk;
    }
  }
  // second (resonant) head: slightly detuned and delayed, short-lived -> subtle body bloom
  if (d.f0 < 200) {
    const t60 = d.t60 * 0.45;
    const len = Math.min(n, Math.ceil(t60 * sr));
    const fr = (d.f0 * (1.03 + rng.f() * 0.02)) / sr;
    const del = Math.round(0.004 * sr);
    const dk = Math.exp(-6.907755 / (t60 * sr));
    const ak = Math.exp(-1 / (0.012 * sr));
    let a = 0.16;
    let rise = 1;
    let ph = 0;
    for (let i = 0; i < len - del; i++) {
      ph += fr * (1 + (pc[i] - 1) * 0.4);
      out[i + del] += Math.sin(TAU * ph) * a * (1 - rise);
      a *= dk;
      rise *= ak;
    }
  }
  // low air push (big drums)
  if (d.air > 0) {
    const len = Math.round(0.25 * sr);
    const a = brown(rng, len, 0.99);
    filt(a, sr, 'lp', d.f0 * 1.6, 0.8, 0, 2);
    env(a, sr, (t) => ad(t, 0.004, 0.16));
    mix(out, a, 0, d.air * vel * 2.2);
  }
  // stick click (bachi on hide)
  {
    const len = Math.round(0.02 * sr);
    const s = white(rng, len);
    filt(s, sr, 'bp', d.stickF * (0.9 + 0.2 * rng.f()), 0.8);
    filt(s, sr, 'hp', 500);
    env(s, sr, (t) => Math.exp(-t / 0.0022));
    mix(out, s, 0, d.stick * vel * vel * 2.4);
  }
  // hide slap
  {
    const len = Math.round(0.14 * sr);
    const s = white(rng, len);
    filt(s, sr, 'bp', d.slapF * (0.9 + 0.2 * rng.f()), 1.1);
    filt(s, sr, 'lp', d.slapF * 3.5);
    env(s, sr, (t) => ad(t, 0.0008, 0.11));
    mix(out, s, 0, d.slap * (0.35 + 0.65 * vel) * 2.6);
  }
  // barrel resonance (comb tuned to the shell)
  if (d.body > 0) {
    const len = Math.round(Math.min(d.dur, 0.6) * sr);
    const ex = new Float32Array(len);
    const e = white(rng, Math.round(0.012 * sr));
    env(e, sr, (t) => Math.exp(-t / 0.003));
    mix(ex, e);
    const b = comb(ex, sr, 1 / d.bodyF, 0.86, 0.45);
    filt(b, sr, 'lp', d.bodyF * 5, 0.7);
    filt(b, sr, 'hp', d.bodyF * 0.6, 0.7);
    env(b, sr, (t) => dec(t, 0.45));
    mix(out, b, 0, d.body * vel * 0.6);
  }
  drive(out, d.drive * (0.6 + 0.4 * vel));
  dcBlock(out, sr, 20);
  fadeOut(out, sr, 0.05);
  return [out];
}

/** "Ka": stick on the wooden rim (fuchi). */
export function ka(sr: number, rng: Rng): Chans {
  const n = Math.ceil(0.22 * sr);
  const f = 1180 * (0.94 + 0.12 * rng.f());
  const out = modal(sr, n, [
    { f, a: 1, t60: 0.11 },
    { f: f * 2.31, a: 0.55, t60: 0.06 },
    { f: f * 3.93, a: 0.3, t60: 0.04 },
    { f: f * 5.62, a: 0.14, t60: 0.025 },
  ]);
  const c = white(rng, Math.round(0.006 * sr));
  filt(c, sr, 'hp', 2200);
  env(c, sr, (t) => Math.exp(-t / 0.0012));
  mix(out, c, 0, 1.4);
  const th = sig(sr, 0.05);
  let ph = 0;
  for (let i = 0; i < th.length; i++) {
    const t = i / sr;
    ph += (320 - 120 * t * 20) / sr;
    th[i] = Math.sin(TAU * ph) * Math.exp(-t / 0.008);
  }
  mix(out, th, 0, 0.5);
  fadeOut(out, sr, 0.02);
  return [out];
}

/** Chappa: small festival hand cymbals (bright metallic "chan"). */
export function chappa(sr: number, rng: Rng): Chans {
  const n = Math.ceil(0.55 * sr);
  const out = new Float32Array(n);
  const freqs = [263, 400, 421, 474, 587, 845].map((f) => f * (0.97 + 0.06 * rng.f()) * 1.6);
  const oscs = freqs.map(() => new Osc(sr, rng.f()));
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let k = 0; k < oscs.length; k++) v += oscs[k].sqr(freqs[k]);
    out[i] = v / 6;
  }
  filt(out, sr, 'bp', 8200, 0.9);
  filt(out, sr, 'hp', 5200, 0.7);
  const nz = white(rng, n);
  filt(nz, sr, 'hp', 7000);
  mix(out, nz, 0, 0.35);
  // the two plates touch twice ("cha-n")
  env(out, sr, (t) => ad(t, 0.001, 0.32) + 0.5 * (t > 0.012 ? ad(t - 0.012, 0.001, 0.08) : 0));
  const m = modal(sr, n, [
    { f: 3170 * (0.97 + 0.06 * rng.f()), a: 0.25, t60: 0.5 },
    { f: 4520 * (0.97 + 0.06 * rng.f()), a: 0.18, t60: 0.4 },
    { f: 6230, a: 0.12, t60: 0.3 },
  ]);
  mix(out, m, 0, 1);
  fadeOut(out, sr, 0.04);
  return [out];
}

// ======================================================================= STRINGS & WINDS

/** Koto (13-string zither, plucked with ivory picks): bright, long, harp-like with soft wooden body. */
export function koto(sr: number, rng: Rng, midi: number, bendSemis = 0): Chans {
  const f0 = mtof(midi);
  const k = clamp((midi - 60) / 26, 0, 1);
  const t60 = lerp(3.6, 1.5, k);
  const dur = Math.min(2.6, t60 * 0.75 + (bendSemis ? 0.4 : 0.15));
  const s = pluck(sr, {
    f0, dur, t60, bright: 0.78 - k * 0.1, pick: 0.12, excite: 8500,
    bend: bendSemis ? [0.26, bendSemis, 0.16] : undefined,
  }, rng);
  // tsume (pick) scrape
  const c = white(rng, Math.round(0.008 * sr));
  filt(c, sr, 'bp', 4800, 1.2);
  env(c, sr, (t) => Math.exp(-t / 0.0015));
  mix(s, c, 0, 0.45);
  filt(s, sr, 'hp', 70);
  filt(s, sr, 'peak', 290, 1.1, 3);
  filt(s, sr, 'peak', 1450, 1.4, 2.5);
  filt(s, sr, 'peak', 3300, 2, 1.5);
  // sympathetic shimmer: faint octave string ringing
  const sym = pluck(sr, { f0: f0 * 2, dur, t60: t60 * 0.6, bright: 0.3, pick: 0.3, excite: 3000 }, rng);
  env(sym, sr, (t) => smooth(t / 0.05));
  mix(s, sym, 0, 0.08);
  dcBlock(s, sr);
  fadeOut(s, sr, 0.3);
  return [s];
}

/** Tsugaru shamisen: very bright, buzzy (sawari) and percussive (bachi slapping the skin). */
export function shamisen(sr: number, rng: Rng, midi: number): Chans {
  const f0 = mtof(midi);
  const k = clamp((midi - 50) / 36, 0, 1);
  const t60 = lerp(1.5, 0.65, k);
  const dur = Math.min(1.3, t60 * 0.9 + 0.1);
  const s = pluck(sr, { f0, dur, t60, bright: 0.9, pick: 0.07, excite: 9500, buzz: 0.8 }, rng);
  filt(s, sr, 'hp', 140);
  filt(s, sr, 'peak', 950, 1.2, 5);
  filt(s, sr, 'peak', 2700, 1.6, 4);
  filt(s, sr, 'hs', 6500, 0.7, 2);
  // bachi hitting the cat-skin: skin thump + click
  const n = Math.round(0.09 * sr);
  const b = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (260 - 90 * Math.min(1, t * 40)) / sr;
    b[i] = Math.sin(TAU * ph) * Math.exp(-t / 0.018);
  }
  const c = white(rng, Math.round(0.012 * sr));
  filt(c, sr, 'bp', 1900, 0.9);
  env(c, sr, (t) => Math.exp(-t / 0.0025));
  mix(b, c, 0, 1.6);
  mix(s, b, 0, 0.55);
  dcBlock(s, sr);
  fadeOut(s, sr, 0.08);
  return [s];
}

/**
 * Shakuhachi: breathy bamboo flute. Sine-ish tone with meri-kari slide-in,
 * delayed vibrato, band-passed breath noise and an attack chiff.
 * `muraiki` = explosive overblown accent.
 */
export function shakuhachi(sr: number, rng: Rng, midi: number, dur: number, muraiki = false): Chans {
  const f0 = mtof(midi);
  const n = Math.ceil(dur * sr);
  const out = new Float32Array(n);
  const bp1 = new Biquad(sr, 'bp', f0, 6);
  const bp2 = new Biquad(sr, 'bp', f0 * 2, 8);
  const hpN = new Biquad(sr, 'hp', 1600, 0.7);
  const lpN = new Biquad(sr, 'lp', 6500, 0.7);
  const air = new Biquad(sr, 'lp', 900, 0.7);
  let ph = 0;
  let vph = rng.f();
  let drift = 0;
  const rel = Math.min(0.7, dur * 0.3);
  const slide = muraiki ? 40 : -48;
  // control-rate values (every 16 samples): pitch, amplitude, breath
  let inc = f0 / sr;
  let A = 0;
  let breath = 0;
  for (let i = 0; i < n; i++) {
    if ((i & 15) === 0) {
      const t = i / sr;
      drift += (rng.bi() * 0.6 - drift * 0.013) * 0.32;
      const vd = clamp((t - 0.42) / 0.7, 0, 1) * (muraiki ? 24 : 15);
      vph += (16 * (5.1 + 0.4 * Math.sin(t * 1.3))) / sr;
      const cents = slide * Math.exp(-t / (muraiki ? 0.05 : 0.075)) + vd * Math.sin(TAU * vph) + drift;
      inc = (f0 * (1 + cents * 0.0005778)) / sr;
      // soft swell with a little push, natural release
      A = smooth(t / (muraiki ? 0.05 : 0.15)) * (1 + 0.08 * Math.sin(TAU * 0.35 * t)) * (t > dur - rel ? Math.max(0, (dur - t) / rel) ** 1.5 : 1);
      const chiff = Math.exp(-t / 0.05) * (muraiki ? 3 : 1.6);
      breath = (muraiki ? 1.5 * (1 + 0.6 * Math.sin(TAU * 23 * t)) : 0.75) * A + chiff * smooth(t / 0.01);
    }
    ph += inc;
    if (ph >= 1) ph -= 1;
    // harmonics from one sin/cos pair (Chebyshev recurrences)
    const s1 = Math.sin(TAU * ph);
    const c1 = Math.cos(TAU * ph);
    const s2 = 2 * s1 * c1;
    const c2 = 1 - 2 * s1 * s1;
    const s3 = s1 * (3 - 4 * s1 * s1);
    const s4 = 2 * s2 * c2;
    const tone = s1 + 0.2 * (s2 * 0.921 + c2 * 0.389) + 0.075 * s3 + 0.03 * s4;
    const w = rng.bi();
    const nb = bp1.run(w) * 1.6 + bp2.run(w) * 0.6 + lpN.run(hpN.run(w)) * 0.35 + air.run(w) * 0.35;
    out[i] = tone * A * (muraiki ? 0.75 : 0.85) + nb * breath;
  }
  filt(out, sr, 'hp', 120);
  dcBlock(out, sr);
  fadeOut(out, sr, 0.05);
  return [out];
}

/** Dark synth bass: detuned band-limited saws + sub sine, resonant filter envelope, drive, mid "growl" for small speakers. */
export function bass(sr: number, rng: Rng, midi: number, long: boolean): Chans {
  const f0 = mtof(midi);
  const dur = long ? 2.75 : 0.6;
  const n = Math.ceil(dur * sr);
  const out = new Float32Array(n);
  const saws = new Float32Array(n);
  const o1 = new Osc(sr, rng.f());
  const o2 = new Osc(sr, rng.f());
  const o3 = new Osc(sr, 0);
  const d1 = f0 * Math.pow(2, 7 / 1200);
  const d2 = f0 * Math.pow(2, -7 / 1200);
  for (let i = 0; i < n; i++) {
    const sw = (o1.saw(d1) + o2.saw(d2)) * 0.45;
    saws[i] = sw;
    out[i] = sw + o3.sin(f0) * 0.55;
  }
  const fc = long
    ? (t: number) => 170 + 900 * smooth(t / 0.45) * dec(t, 3.2)
    : (t: number) => 230 + 3200 * Math.exp(-t / 0.06) + 380 * Math.exp(-t / 0.5);
  sweep(out, sr, 'lp', fc, 1.6, 1);
  sweep(out, sr, 'lp', (t) => fc(t) * 1.5, 0.7, 1);
  // growl: band-passed, saturated copy of the saws (audible on phone speakers)
  filt(saws, sr, 'bp', long ? 750 : 1000, 0.8);
  drive(saws, 3);
  mix(out, saws, 0, long ? 0.16 : 0.22);
  env(out, sr, long ? (t) => smooth(t / 0.04) * (0.85 + 0.15 * dec(t, 1.2)) * (t > dur - 0.45 ? (dur - t) / 0.45 : 1) : (t) => ad(t, 0.002, 1.1));
  drive(out, 2.2);
  filt(out, sr, 'hp', 32, 0.7);
  fadeOut(out, sr, 0.03);
  return [out];
}

/**
 * Base-game drone: low D/A saws under a breathing filter, a faint shō (mouth-organ)
 * cluster and storm wind. Rendered `len + xf` seconds, made seamless by the bank.
 */
export function* drone(sr: number, rng: Rng, total: number, len: number): Gen {
  const n = Math.ceil(total * sr);
  // low D/A bed (mono, shared)
  const low = new Float32Array(n);
  {
    const oA = new Osc(sr, rng.f());
    const oB = new Osc(sr, rng.f());
    const oC = new Osc(sr, rng.f());
    const oS = new Osc(sr, 0);
    for (let i = 0; i < n; i++) low[i] = oA.saw(73.42 * 0.9976) * 0.5 + oB.saw(110.2) * 0.22 + oC.saw(73.42 * 1.0024) * 0.3 + oS.sin(36.71) * 0.2;
    yield;
    sweep(low, sr, 'lp', (t) => 240 + 170 * Math.sin((TAU * t) / len), 1.6, 2);
  }
  yield;
  const chans: Sig[] = [];
  const notes = [74, 79, 81, 86];
  for (let c = 0; c < 2; c++) {
    yield;
    // shō cluster (aitake-like): reedy pulses with slow independent vibrato
    const sho = new Float32Array(n);
    const os = notes.map(() => new Osc(sr, rng.f()));
    const fs = notes.map((m) => mtof(m));
    const cur = notes.map(() => 0);
    for (let i = 0; i < n; i++) {
      if ((i & 31) === 0) {
        const t = i / sr;
        for (let k = 0; k < notes.length; k++) cur[k] = fs[k] * (1 + 0.0015 * Math.sin(TAU * (0.2 + k * 0.07) * t + c * 1.7 + k));
      }
      let v = 0;
      for (let k = 0; k < notes.length; k++) v += os[k].sqr(cur[k], 0.32);
      sho[i] = v * 0.25;
    }
    yield;
    filt(sho, sr, 'bp', 1500, 0.6);
    filt(sho, sr, 'lp', 3200, 0.7);
    env(sho, sr, (t) => 0.5 - 0.5 * Math.cos((TAU * 2 * t) / len + c * 0.7));
    // storm wind
    yield;
    const wind = brown(rng, n, 0.997);
    sweep(wind, sr, 'bp', (t) => 380 + 260 * Math.sin((TAU * 3 * t) / len + c * 2), 0.8, 1);
    env(wind, sr, (t) => 0.55 + 0.45 * Math.sin((TAU * 3 * t) / len + c * 2));
    const out = new Float32Array(n);
    mix(out, low, 0, 0.9);
    mix(out, sho, 0, 0.16);
    mix(out, wind, 0, 0.55);
    chans.push(out);
  }
  return chans;
}

/** Choir-like pad ("aah"): chorused glottal saws (panned voices) through vowel formants. */
export function* choir(sr: number, rng: Rng, notes: number[], dur: number): Gen {
  const n = Math.ceil(dur * sr);
  const srcs = [new Float32Array(n), new Float32Array(n)];
  const voices = 4;
  const a = 1 / (notes.length * voices * 0.75);
  for (const m of notes) {
    yield;
    const f0 = mtof(m);
    for (let v = 0; v < voices; v++) {
      const o = new Osc(sr, rng.f());
      const det = rng.r(-10, 10);
      const vr = rng.r(4.6, 5.8);
      const vp = rng.f() * TAU;
      const vd = rng.r(8, 15);
      const pan = (v / (voices - 1)) * 2 - 1;
      const gl = a * Math.sqrt(0.5 * (1 - pan * 0.8));
      const gr = a * Math.sqrt(0.5 * (1 + pan * 0.8));
      let drift = 0;
      let f = f0;
      for (let i = 0; i < n; i++) {
        if ((i & 15) === 0) {
          const t = i / sr;
          drift += (rng.bi() * 0.5 - drift * 0.03) * 0.6;
          const cents = det + drift + vd * clamp((t - 0.25) / 0.6, 0, 1) * Math.sin(TAU * vr * t + vp);
          f = f0 * (1 + cents * 0.0005778);
        }
        const x = o.saw(f);
        srcs[0][i] += x * gl;
        srcs[1][i] += x * gr;
      }
    }
  }
  const chans: Sig[] = [];
  for (let c = 0; c < 2; c++) {
    yield;
    const src = srcs[c];
    mix(src, white(rng, n), 0, 0.04);
    filt(src, sr, 'lp', 3600, 0.7);
    const out = resonate(src, sr, [
      [640, 5, 1.0],
      [1080, 6, 0.6],
      [2400, 9, 0.3],
      [2700, 10, 0.22],
      [3300, 12, 0.1],
    ]);
    const body = new Float32Array(src);
    filt(body, sr, 'lp', 420, 0.7);
    mix(out, body, 0, 0.35);
    env(out, sr, (t) => smooth(t / 0.4) * (t > dur - 0.8 ? Math.max(0, (dur - t) / 0.8) : 1));
    chans.push(gain(out, 3));
  }
  return chans;
}

// ======================================================================= THUNDER & ELECTRICITY

/** Lightning crack: snap + tearing crackle + low body. Stereo-decorrelated. */
export function* crack(sr: number, rng: Rng): Gen {
  const dur = 1.3;
  const n = Math.ceil(dur * sr);
  const body = white(rng, n);
  sweep(body, sr, 'lp', (t) => 300 + 3200 * Math.exp(-t / 0.08), 0.8, 2);
  env(body, sr, (t) => ad(t, 0.002, 0.9));
  const chans: Sig[] = [];
  for (let c = 0; c < 2; c++) {
    yield;
    const out = new Float32Array(n);
    const snap = white(rng, Math.round(0.012 * sr));
    filt(snap, sr, 'hp', 500);
    env(snap, sr, (t) => Math.exp(-t / 0.0018));
    mix(out, snap, Math.round(c * 0.0006 * sr), 1.3);
    const tear = impulses(sr, n, rng, (t) => 9000 * Math.exp(-t / 0.07) + 600 * Math.exp(-t / 0.3) + 30, (t) => Math.exp(-t / 0.22) * (1 + 0.6 * Math.sin(t * 61)), 0.0009);
    filt(tear, sr, 'hp', 1100);
    filt(tear, sr, 'peak', 4200, 1, 4);
    mix(out, tear, 0, 0.9);
    mix(out, body, 0, 1.0);
    dcBlock(out, sr);
    fadeOut(out, sr, 0.2);
    chans.push(out);
  }
  return chans;
}

/** Long rolling thunder rumble (stereo). `far` = distant, darker, softer attack. */
export function* rumble(sr: number, rng: Rng, dur: number, far: boolean): Gen {
  const n = Math.ceil(dur * sr);
  const K = far ? 5 : 8;
  const ta = far ? 0.18 : 0.035;
  // rolling envelope: K bumps (fast rise, slow fall), each with its own stereo position
  const envs = [new Float32Array(n), new Float32Array(n)];
  for (let k = 0; k < K; k++) {
    const t0 = k === 0 ? (far ? 0.25 : 0.01) : rng.r(0.08, dur * 0.55);
    const a = (k === 0 ? 1 : rng.r(0.35, 0.95)) * (1 - (0.5 * t0) / dur);
    const w = rng.r(0.25, far ? 1.1 : 0.7);
    const p = rng.r(-0.85, 0.85);
    const pg = [Math.sqrt(0.5 * (1 - p)), Math.sqrt(0.5 * (1 + p))];
    const i0 = Math.round(t0 * sr);
    const kd = Math.exp(-1 / (w * sr));
    const ka = Math.exp(-1 / (ta * sr));
    let dcy = a;
    let att = 1;
    for (let i = i0; i < n; i++) {
      const v = dcy * (1 - att);
      envs[0][i] += v * pg[0];
      envs[1][i] += v * pg[1];
      dcy *= kd;
      att *= ka;
      if (dcy < 1e-4) break;
    }
  }
  const chans: Sig[] = [];
  for (let c = 0; c < 2; c++) {
    yield;
    const e = envs[c];
    const kt = Math.exp(-1 / (dur * 0.35 * sr));
    let tail = 0.18;
    for (let i = 0; i < n; i++) {
      e[i] += tail * smooth(i / (0.3 * sr));
      tail *= kt;
    }
    const nz = brown(rng, n, 0.997);
    mix(nz, pink(rng, n), 0, far ? 0.08 : 0.25);
    yield;
    const lo = far ? 110 : 170;
    const span = far ? 160 : 650;
    sweep(nz, sr, 'lp', (t) => lo + span * Math.min(1, e[Math.min(n - 1, Math.floor(t * sr))]), 0.9, 2);
    filt(nz, sr, 'peak', 68, 1.2, 5);
    filt(nz, sr, 'hp', 24, 0.7);
    for (let i = 0; i < n; i++) nz[i] *= e[i];
    fadeOut(nz, sr, 0.5);
    chans.push(nz);
  }
  return chans;
}

/** Sub boom (felt more than heard). */
export function boom(sr: number, rng: Rng): Chans {
  const dur = 1.9;
  const n = Math.ceil(dur * sr);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = 30 + 34 * Math.exp(-t / 0.18);
    ph += f / sr;
    out[i] = (Math.sin(TAU * ph) + 0.35 * Math.sin(2 * TAU * ph + 0.5) + 0.12 * Math.sin(3 * TAU * ph)) * ad(t, 0.004, 1.7);
  }
  const th = brown(rng, Math.round(0.3 * sr), 0.98);
  filt(th, sr, 'lp', 160, 0.7, 0, 2);
  env(th, sr, (t) => ad(t, 0.002, 0.25));
  mix(out, th, 0, 1.2);
  drive(out, 1.5);
  dcBlock(out, sr, 15);
  fadeOut(out, sr, 0.2);
  return [out];
}

/** Electric zap: fast downward tear (lightning leaving the gauntlet). */
export function zap(sr: number, rng: Rng): Chans {
  const dur = 0.6;
  const n = Math.ceil(dur * sr);
  const out = new Float32Array(n);
  const o = new Osc(sr);
  const o2 = new Osc(sr, 0.3);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = 85 + 4600 * Math.exp(-t / 0.045);
    out[i] = (o.saw(f) * 0.6 + o2.sqr(f * 1.51) * 0.3) * (0.6 + 0.4 * rng.bi());
  }
  sweep(out, sr, 'bp', (t) => 300 + 7000 * Math.exp(-t / 0.06), 1.4);
  const nz = white(rng, n);
  sweep(nz, sr, 'bp', (t) => 600 + 9000 * Math.exp(-t / 0.08), 2.2);
  mix(out, nz, 0, 0.9);
  const cr = impulses(sr, n, rng, (t) => 4000 * Math.exp(-t / 0.08) + 60, (t) => Math.exp(-t / 0.2), 0.0006);
  filt(cr, sr, 'hp', 2000);
  mix(out, cr, 0, 0.8);
  env(out, sr, (t) => ad(t, 0.0015, 0.42));
  dcBlock(out, sr);
  fadeOut(out, sr, 0.05);
  return [out];
}

/** Electric sizzle tail (after a strike): thinning crackle, hiss and arc hum. */
export function* sizzle(sr: number, rng: Rng, dur = 2.0): Gen {
  const n = Math.ceil(dur * sr);
  const chans: Sig[] = [];
  for (let c = 0; c < 2; c++) {
    yield;
    const cr = impulses(sr, n, rng, (t) => 1800 * Math.exp(-t / 0.45) + 40, (t) => Math.exp(-t / 0.7), 0.0006);
    filt(cr, sr, 'hp', 1800);
    filt(cr, sr, 'peak', 5600, 0.8, 5);
    const hiss = white(rng, n);
    filt(hiss, sr, 'hp', 4200);
    env(hiss, sr, (t) => ad(t, 0.005, 0.7) * 0.5);
    const hum = new Float32Array(n);
    const o = new Osc(sr, rng.f());
    let jf = 0;
    for (let i = 0; i < n; i++) {
      jf += (rng.bi() * 6 - jf) * 0.01;
      hum[i] = o.saw(100 + jf) * (0.5 + 0.5 * rng.f());
    }
    filt(hum, sr, 'bp', 1700, 1.6);
    env(hum, sr, (t) => ad(t, 0.01, 0.9) * (0.6 + 0.4 * Math.sin(t * 37 + c)));
    const out = new Float32Array(n);
    mix(out, cr, 0, 1);
    mix(out, hiss, 0, 0.6);
    mix(out, hum, 0, 0.5);
    dcBlock(out, sr);
    fadeOut(out, sr, 0.3);
    chans.push(out);
  }
  return chans;
}

/** Arcing electric crackle: clustered discharges with buzzing arc hum. */
export function* crackle(sr: number, rng: Rng, dur = 1.5): Gen {
  const n = Math.ceil(dur * sr);
  const out = new Float32Array(n);
  let t = 0.01;
  while (t < dur - 0.08) {
    const cl = rng.r(0.012, 0.07);
    const dens = rng.r(400, 2200);
    const amp = rng.r(0.4, 1);
    const f = rng.r(2200, 7000);
    const len = Math.ceil((cl + 0.02) * sr);
    const burst = impulses(sr, len, rng, (x) => (x < cl ? dens : 1), () => amp, 0.0005);
    filt(burst, sr, 'bp', f, 2.5);
    filt(burst, sr, 'hp', 1200);
    mix(out, burst, Math.floor(t * sr), 2.2);
    // arc hum during the cluster
    const h = new Float32Array(len);
    const o = new Osc(sr, rng.f());
    const hf = rng.r(90, 140);
    for (let i = 0; i < len; i++) h[i] = o.saw(hf * (1 + 0.05 * rng.bi())) * Math.sin((Math.PI * i) / len);
    filt(h, sr, 'bp', rng.r(1200, 2600), 2);
    mix(out, h, Math.floor(t * sr), 0.45 * amp);
    t += cl + -Math.log(1 - rng.f() * 0.99) / 7;
  }
  dcBlock(out, sr);
  fadeOut(out, sr, 0.05);
  fadeIn(out, sr, 0.003);
  return [out];
}

// ======================================================================= METAL, BELLS, COINS

/** Heavy struck armour plate: inharmonic plate modes + strike + thump. */
export function clang(sr: number, rng: Rng, base: number, t60: number, dur: number): Chans {
  const n = Math.ceil(dur * sr);
  const modes: Mode[] = [];
  const asp = 1.37;
  const x0 = 0.31 + rng.f() * 0.05;
  const y0 = 0.43 + rng.f() * 0.05;
  const norm = 1 + 1 / (asp * asp);
  for (let m = 1; m <= 6; m++)
    for (let k = 1; k <= 6; k++) {
      const r = (m * m + (k * k) / (asp * asp)) / norm;
      const f = base * r * (1 + rng.bi() * 0.01);
      const a = (Math.abs(Math.sin(m * Math.PI * x0) * Math.sin(k * Math.PI * y0)) / Math.pow(r, 0.45)) * rng.r(0.6, 1);
      modes.push({ f, a, t60: (t60 / Math.pow(r, 0.5)) * rng.r(0.8, 1.2) });
    }
  const out = modal(sr, n, modes);
  const st = white(rng, Math.round(0.006 * sr));
  filt(st, sr, 'lp', 7000);
  env(st, sr, (t) => Math.exp(-t / 0.0012));
  mix(out, st, 0, 1.2);
  const th = sig(sr, 0.2);
  let ph = 0;
  for (let i = 0; i < th.length; i++) {
    const t = i / sr;
    ph += (48 + 50 * Math.exp(-t / 0.03)) / sr;
    th[i] = Math.sin(TAU * ph) * ad(t, 0.001, 0.16);
  }
  mix(out, th, 0, 1.2);
  drive(out, 1.4);
  dcBlock(out, sr);
  fadeOut(out, sr, Math.min(0.3, dur * 0.2));
  return [out];
}

/** Tam-tam gong: dense partials whose highs bloom after the strike. */
export function* gong(sr: number, rng: Rng, base = 72, dur = 4.6): Gen {
  const n = Math.ceil(dur * sr);
  const chans: Sig[] = [];
  for (let c = 0; c < 2; c++) {
    yield;
    const modes: Mode[] = [
      { f: base, a: 0.9, t60: dur * 1.1 },
      { f: base * 1.48, a: 0.5, t60: dur },
      { f: base * 2.03, a: 0.45, t60: dur * 0.9 },
    ];
    for (let k = 0; k < 46; k++) {
      const f = base * Math.exp(rng.r(Math.log(2.2), Math.log(70)));
      modes.push({ f, a: rng.r(0.2, 1) * Math.pow(f / base, -0.45), t60: rng.r(0.5, 1) * dur * Math.pow(base / f, 0.22), att: f > 700 ? rng.r(0.15, 0.9) : 0 });
    }
    const out = modal(sr, n, modes);
    const st = white(rng, Math.round(0.03 * sr));
    filt(st, sr, 'lp', 2500);
    env(st, sr, (t) => Math.exp(-t / 0.006));
    mix(out, st, 0, 0.6);
    drive(out, 1.2);
    dcBlock(out, sr);
    fadeOut(out, sr, 0.6);
    chans.push(out);
  }
  return chans;
}

/** Small gold coin ring (shimmering close partial pairs). */
export function coin(sr: number, rng: Rng): Chans {
  const dur = 0.7;
  const n = Math.ceil(dur * sr);
  const f0 = rng.r(2350, 3300);
  const modes: Mode[] = [];
  const rs = [1, 2.13, 3.47, 5.09, 6.95];
  rs.forEach((r, k) => {
    const a = [1, 0.6, 0.4, 0.22, 0.12][k];
    const t = [0.55, 0.38, 0.26, 0.18, 0.12][k] * rng.r(0.8, 1.2);
    modes.push({ f: f0 * r, a, t60: t });
    modes.push({ f: f0 * r * (1.0035 + 0.004 * rng.f()), a: a * 0.7, t60: t });
  });
  const out = modal(sr, n, modes);
  const c = white(rng, Math.round(0.003 * sr));
  filt(c, sr, 'hp', 3000);
  env(c, sr, (t) => Math.exp(-t / 0.0007));
  mix(out, c, 0, 0.8);
  fadeOut(out, sr, 0.05);
  return [out];
}

/** Glockenspiel / wind-chime bar (free-free bar ratios): clean pitched sparkle. */
export function chime(sr: number, rng: Rng, midi: number, dur = 1.6): Chans {
  const f = mtof(midi);
  const n = Math.ceil(dur * sr);
  const out = modal(sr, n, [
    { f, a: 1, t60: dur * 0.95 },
    { f: f * 1.0018, a: 0.35, t60: dur * 0.9 },
    { f: f * 2.756, a: 0.42, t60: dur * 0.45 },
    { f: f * 5.404, a: 0.18, t60: dur * 0.22 },
    { f: f * 8.933, a: 0.07, t60: dur * 0.1 },
  ]);
  const c = white(rng, Math.round(0.004 * sr));
  filt(c, sr, 'bp', Math.min(9000, f * 3), 1.2);
  env(c, sr, (t) => Math.exp(-t / 0.001));
  mix(out, c, 0, 0.3);
  fadeOut(out, sr, 0.08);
  return [out];
}

/** Coin spin-in: wobbling coin ring accelerating (Euler's disk) to a final "ting". */
export function shing(sr: number, rng: Rng): Chans {
  const dur = 1.25;
  const n = Math.ceil(dur * sr);
  const chans: Sig[] = [];
  for (let c = 0; c < 2; c++) {
    const f0 = 2900 * (c ? 1.004 : 1);
    const ring = modal(sr, n, [
      { f: f0, a: 1, t60: 2 },
      { f: f0 * 1.006, a: 0.8, t60: 2 },
      { f: f0 * 2.13, a: 0.5, t60: 1.4 },
      { f: f0 * 3.47, a: 0.3, t60: 1 },
      { f: f0 * 0.5, a: 0.25, t60: 1.5 },
    ]);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const rate = 7 + 38 * smooth(t / 0.9);
      ph += rate / sr;
      const wob = t < 0.92 ? 0.25 + 0.75 * Math.abs(Math.sin(Math.PI * ph)) : 1;
      ring[i] *= wob * smooth(t / 0.04) * (t < 0.92 ? 0.5 + 0.5 * (t / 0.92) : dec(t - 0.92, 0.9));
    }
    const fin = chime(sr, rng, 98, 1)[0];
    mix(ring, fin, Math.round(0.92 * sr), 0.9);
    const air = white(rng, n);
    sweep(air, sr, 'bp', (t) => 2000 + 6000 * smooth(t / 0.9), 1.5);
    env(air, sr, (t) => smooth(t / 0.9) * (t < 0.92 ? 1 : dec(t - 0.92, 0.1)) * 0.3);
    mix(ring, air, 0, 1);
    fadeOut(ring, sr, 0.1);
    chans.push(ring);
  }
  return chans;
}

// ======================================================================= MECH

/** Short mech servo movement: motor whine sweep, gear ticks, end clunk. */
export function servo(sr: number, rng: Rng, up: boolean, dur = 0.42): Chans {
  const n = Math.ceil(dur * sr);
  const out = new Float32Array(n);
  const o = new Osc(sr, rng.f());
  const o2 = new Osc(sr, rng.f());
  const run = dur - 0.09;
  const f0 = rng.r(105, 130);
  const f1 = f0 * (up ? 2.3 : 0.62);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const k = smooth(t / run);
    const f = f0 + (f1 - f0) * k;
    out[i] = (o.saw(f) * 0.6 + o2.sqr(f * 3.02, 0.3) * 0.25) * (t < run ? smooth(t / 0.03) * (0.85 + 0.15 * Math.sin(t * 220)) : dec(t - run, 0.05));
  }
  sweep(out, sr, 'bp', (t) => 700 + 1400 * smooth(t / run) * (up ? 1 : 0.5), 2.5);
  const wh = new Float32Array(n);
  const o3 = new Osc(sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    wh[i] = o3.sin((f0 + (f1 - f0) * smooth(t / run)) * 12) * (t < run ? smooth(t / 0.05) : dec(t - run, 0.04));
  }
  mix(out, wh, 0, 0.12);
  const gears = impulses(sr, n, rng, (t) => (t < run ? 55 + 30 * Math.sin(t * 9) : 1), (t) => (t < run ? 1 : 0), 0.0008);
  filt(gears, sr, 'bp', 3400, 3);
  mix(out, gears, 0, 1.6);
  const cl = clang(sr, rng, 420, 0.25, 0.3)[0];
  mix(out, cl, Math.round(run * sr), 0.35);
  const hs = white(rng, n);
  filt(hs, sr, 'hp', 3500);
  env(hs, sr, (t) => (t > run ? ad(t - run, 0.005, 0.12) : 0) * 0.25);
  mix(out, hs, 0, 1);
  dcBlock(out, sr);
  fadeOut(out, sr, 0.02);
  return [out];
}

/** Steam vent hiss. */
export function steam(sr: number, rng: Rng, dur = 1.5): Chans {
  const n = Math.ceil(dur * sr);
  const chans: Sig[] = [];
  for (let c = 0; c < 2; c++) {
    const s = white(rng, n);
    filt(s, sr, 'hp', 1800, 0.7);
    sweep(s, sr, 'bp', (t) => 5200 - 1800 * smooth(t / dur), 0.55);
    let fl = 0;
    env(s, sr, (t) => {
      fl += (rng.bi() - fl) * 0.02;
      return smooth(t / 0.035) * dec(t, dur * 1.1) * (0.85 + 0.3 * fl);
    });
    const low = brown(rng, n, 0.99);
    filt(low, sr, 'bp', 300, 0.8);
    env(low, sr, (t) => ad(t, 0.02, 0.5) * 0.4);
    mix(s, low, 0, 1);
    fadeOut(s, sr, 0.1);
    chans.push(s);
  }
  return chans;
}

/** Hydraulic "pssh-chunk". */
export function hydraulic(sr: number, rng: Rng): Chans {
  const dur = 0.7;
  const n = Math.ceil(dur * sr);
  const out = white(rng, n);
  filt(out, sr, 'hp', 1500);
  sweep(out, sr, 'bp', (t) => 4500 - 2500 * smooth(t / 0.3), 0.8);
  env(out, sr, (t) => ad(t, 0.004, 0.32) * 0.8);
  const ch = clang(sr, rng, 150, 0.5, 0.5)[0];
  mix(out, ch, Math.round(0.24 * sr), 0.6);
  const thump = sig(sr, 0.25);
  let ph = 0;
  for (let i = 0; i < thump.length; i++) {
    const t = i / sr;
    ph += (70 + 60 * Math.exp(-t / 0.02)) / sr;
    thump[i] = Math.sin(TAU * ph) * ad(t, 0.002, 0.2);
  }
  mix(out, thump, Math.round(0.24 * sr), 0.9);
  dcBlock(out, sr);
  fadeOut(out, sr, 0.03);
  return [out];
}

/**
 * Mech roar: distorted low growl with vocal formant morph (aa -> oo), robotic ring
 * modulation, servo whine on the way up, steam release at the end.
 */
export function* roar(sr: number, rng: Rng): Gen {
  const dur = 2.5;
  const n = Math.ceil(dur * sr);
  const chans: Sig[] = [];
  const pf = pts([[0, 44], [0.28, 66], [0.9, 62], [1.5, 58], [2.1, 40], [2.5, 36]]);
  const af = pts([[0, 0], [0.07, 0.75], [0.3, 1], [1.5, 0.95], [2.1, 0.35], [2.5, 0]]);
  const pitchA = new Float32Array(n);
  const ampA = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pitchA[i] = pf(i / sr);
    ampA[i] = af(i / sr);
  }
  for (let c = 0; c < 2; c++) {
    yield;
    // low growl (chest) + mid voice two octaves up (throat) + breath noise, with growl roughness
    const low = new Float32Array(n);
    const vox = new Float32Array(n);
    const o1 = new Osc(sr, rng.f());
    const o2 = new Osc(sr, rng.f());
    const o3 = new Osc(sr, rng.f());
    const o4 = new Osc(sr, rng.f());
    const o5 = new Osc(sr, rng.f());
    let jit = 0;
    let rph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      jit += (rng.bi() * 0.12 - jit) * 0.004;
      const f = pitchA[i] * (1 + jit) * (c ? 1.004 : 0.996);
      rph += (29 + 9 * Math.sin(t * 3.1)) / sr;
      const growl = (0.55 + 0.45 * Math.sin(TAU * rph) * (0.6 + 0.4 * rng.f())) * ampA[i];
      low[i] = (o1.saw(f) + o2.saw(f * 1.497) * 0.5 + o3.sqr(f * 0.5, 0.4) * 0.4) * growl;
      vox[i] = (o4.saw(f * 2.003) + o5.saw(f * 3.01) * 0.6 + rng.bi() * 0.7) * growl;
    }
    // vocal formants morphing from "aa" to "oo" (the audible roar on any speaker)
    const morph = (t: number) => smooth((t - 0.5) / 1.4);
    yield;
    const f1 = new Float32Array(vox);
    sweep(f1, sr, 'bp', (t) => lerp(730, 420, morph(t)), 4);
    const f2 = new Float32Array(vox);
    sweep(f2, sr, 'bp', (t) => lerp(1220, 800, morph(t)), 5);
    yield;
    const f3 = new Float32Array(vox);
    sweep(f3, sr, 'bp', (t) => lerp(2600, 2350, morph(t)), 7);
    const out = new Float32Array(n);
    mix(out, f1, 0, 2.4);
    mix(out, f2, 0, 1.8);
    mix(out, f3, 0, 1.1);
    filt(low, sr, 'lp', 200, 0.9);
    mix(out, low, 0, 0.45);
    drive(out, 4);
    // metallic screech riding on top (servo-joint scream)
    const scr = new Float32Array(n);
    let sp = 0;
    let mp = 0;
    let sj = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      sj += (rng.bi() * 0.05 - sj) * 0.01;
      mp += (pitchA[i] * 2) / sr;
      sp += (2150 * (1 + sj + 0.04 * Math.sin(TAU * 6.5 * t))) / sr;
      scr[i] = Math.sin(TAU * sp + 2.2 * Math.sin(TAU * mp)) * smooth((t - 0.12) / 0.25) * (t > 1.5 ? dec(t - 1.5, 0.6) : 1);
    }
    filt(scr, sr, 'bp', 2300, 1.2);
    mix(out, scr, 0, 0.16);
    // robotic ring-mod layer
    const ring = new Float32Array(out);
    let rp = 0;
    for (let i = 0; i < n; i++) {
      rp += 97 / sr;
      ring[i] *= Math.sin(TAU * rp);
    }
    mix(out, ring, 0, 0.25);
    filt(out, sr, 'lp', 6500, 0.7);
    filt(out, sr, 'hp', 40, 0.7);
    filt(out, sr, 'peak', 110, 1, 3);
    filt(out, sr, 'peak', 1500, 0.9, 3);
    chans.push(out);
  }
  // servo whine lifting the head + steam release + sub boom
  yield;
  const sv = servo(sr, rng, true, 0.5)[0];
  const st = steam(sr, rng, 1.3);
  const bm = boom(sr, rng)[0];
  for (let c = 0; c < 2; c++) {
    yield;
    mix(chans[c], sv, 0, 0.5);
    mix(chans[c], st[c], Math.round(1.25 * sr), 0.8);
    mix(chans[c], bm, 0, 0.5);
    dcBlock(chans[c], sr);
    fadeOut(chans[c], sr, 0.1);
  }
  return chans;
}

/** Mech power-up whine before a strike (~0.46 s, ends on the peak). */
export function charge(sr: number, rng: Rng): Chans {
  const T = 0.46;
  const n = Math.ceil((T + 0.01) * sr);
  const chans: Sig[] = [];
  for (let c = 0; c < 2; c++) {
    const out = new Float32Array(n);
    const o = new Osc(sr);
    const o2 = new Osc(sr, rng.f());
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const k = Math.min(1, t / T);
      const f = 240 * Math.pow(3600 / 240, Math.pow(k, 1.25));
      ph += (28 + 50 * k) / sr;
      const fm = 1 + 0.02 * k * Math.sin(TAU * ph);
      out[i] = o.sin(f * fm * (c ? 1.003 : 1)) * 0.5 * Math.pow(k, 1.2) + o2.saw((f / 8) * fm) * 0.5 * (0.3 + 0.7 * k);
    }
    sweep(out, sr, 'lp', (t) => 280 * Math.pow(7500 / 280, Math.min(1, t / T)), 7);
    const nz = white(rng, n);
    sweep(nz, sr, 'bp', (t) => 500 * Math.pow(12, Math.min(1, t / T)), 1.6);
    env(nz, sr, (t) => Math.pow(Math.min(1, t / T), 2.2) * 0.9);
    mix(out, nz, 0, 1);
    const cr = impulses(sr, n, rng, (t) => 30 + 2500 * Math.pow(Math.min(1, t / T), 3), (t) => 0.3 + 0.7 * Math.min(1, t / T), 0.0005);
    filt(cr, sr, 'hp', 2500);
    mix(out, cr, 0, 0.7);
    env(out, sr, (t) => (t < T ? 1 : Math.max(0, 1 - (t - T) / 0.008)));
    chans.push(out);
  }
  const click = clang(sr, rng, 520, 0.12, 0.15)[0];
  mix(chans[0], click, 0, 0.3);
  mix(chans[1], click, 0, 0.3);
  for (const ch of chans) dcBlock(ch, sr);
  return chans;
}

/**
 * Anticipation riser (one-shot, ~9 s): accelerating shime roll, rising noise and
 * cluster, heartbeat sub and growing crackle. Stopped with a short fade.
 */
export function* riser(sr: number, rng: Rng, shimeHits: Sig[]): Gen {
  const dur = 7.5;
  const n = Math.ceil(dur * sr);
  const chans: Sig[] = [new Float32Array(n), new Float32Array(n)];
  const prog = (t: number) => 1 - Math.exp(-t / 2.4);
  // taiko roll (accelerating, crescendo), alternating hands panned
  let t = 0.05;
  let hand = 0;
  while (t < dur - 0.4) {
    const k = prog(t);
    const h = shimeHits[(hand + (rng.f() < 0.3 ? 1 : 0)) % shimeHits.length];
    const v = (0.22 + 0.6 * k) * (hand % 2 ? 0.85 : 1) * (0.9 + 0.2 * rng.f());
    const i0 = Math.round(t * sr);
    mix(chans[0], h, i0, v * (hand % 2 ? 0.7 : 1));
    mix(chans[1], h, i0, v * (hand % 2 ? 1 : 0.7));
    hand++;
    t += 1 / (6 + 14 * k);
    if (hand % 24 === 0) yield;
  }
  for (let c = 0; c < 2; c++) {
    yield;
    const out = chans[c];
    const nz = pink(rng, n);
    sweep(nz, sr, 'bp', (x) => 300 * Math.pow(15, prog(x)), 1.4);
    let tp = 0;
    env(nz, sr, (x) => {
      tp += (4 + 12 * prog(x)) / sr;
      return prog(x) * (0.75 + 0.25 * Math.sin(TAU * tp)) * 1.6;
    });
    mix(out, nz, 0, 1);
    yield;
    const cl = new Float32Array(n);
    const os = [0, 1, 7].map(() => new Osc(sr, rng.f()));
    for (let i = 0; i < n; i++) {
      const x = i / sr;
      const base = 146.8 * Math.pow(2, prog(x) * 1.0);
      cl[i] = (os[0].saw(base) + os[1].saw(base * Math.pow(2, 1 / 12) * (c ? 1.002 : 0.998)) * 0.8 + os[2].saw(base * 1.5) * 0.6) * prog(x);
    }
    sweep(cl, sr, 'lp', (x) => 300 * Math.pow(12, prog(x)), 2);
    mix(out, cl, 0, 0.16);
    yield;
    const cr = impulses(sr, n, rng, (x) => 10 + 900 * prog(x) ** 2, (x) => prog(x), 0.0006);
    filt(cr, sr, 'hp', 2500);
    mix(out, cr, 0, 0.35);
  }
  // heartbeat sub
  yield;
  let hb = 0.2;
  while (hb < dur - 0.5) {
    const k = prog(hb);
    const beat = sig(sr, 0.3);
    let ph = 0;
    for (let i = 0; i < beat.length; i++) {
      const x = i / sr;
      ph += (52 + 30 * Math.exp(-x / 0.02)) / sr;
      beat[i] = Math.sin(TAU * ph) * ad(x, 0.003, 0.22);
    }
    for (let c = 0; c < 2; c++) {
    yield;
      mix(chans[c], beat, Math.round(hb * sr), 0.9 * (0.4 + 0.6 * k));
      mix(chans[c], beat, Math.round((hb + 0.17) * sr), 0.55 * (0.4 + 0.6 * k));
    }
    hb += 1 / (1.2 + 1.6 * k);
  }
  for (const ch of chans) {
    dcBlock(ch, sr);
    fadeIn(ch, sr, 0.01);
    fadeOut(ch, sr, 0.6);
  }
  return chans;
}

// ======================================================================= UI / REELS

/** Spin start: latch release + whoosh + reel motor spin-up. */
export function whoosh(sr: number, rng: Rng): Chans {
  const dur = 0.6;
  const n = Math.ceil(dur * sr);
  const out = new Float32Array(n);
  const o = new Osc(sr, rng.f());
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    out[i] = o.saw(70 + 120 * smooth(t / 0.25)) * ad(t, 0.02, 0.4) * 0.5;
  }
  filt(out, sr, 'lp', 700, 1.2);
  const nz = white(rng, n);
  sweep(nz, sr, 'bp', (t) => 380 * Math.pow(8, smooth(t / 0.3)), 1.3);
  env(nz, sr, (t) => Math.sin(Math.PI * clamp(t / 0.42, 0, 1)) ** 1.6);
  mix(out, nz, 0, 1.5);
  mix(out, ka(sr, rng)[0], 0, 0.35);
  fadeOut(out, sr, 0.05);
  return [out];
}

/** Reels spinning: motor whir + air flutter of the passing symbols + light ratchet ticks (seamless loop source). */
export function spinLoop(sr: number, rng: Rng, total: number): Chans {
  const n = Math.ceil(total * sr);
  const out = new Float32Array(n);
  const o = new Osc(sr, rng.f());
  const o2 = new Osc(sr, rng.f());
  for (let i = 0; i < n; i++) out[i] = o.saw(118) * 0.5 + o2.sqr(236.5, 0.3) * 0.2;
  filt(out, sr, 'lp', 420, 1.1);
  const air = white(rng, n);
  filt(air, sr, 'bp', 950, 0.9);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    ph += 21 / sr;
    air[i] *= 0.55 + 0.45 * Math.sin(TAU * ph);
  }
  mix(out, air, 0, 0.9);
  const ticks = impulses(sr, n, rng, () => 17, () => 0.8, 0.0006);
  filt(ticks, sr, 'bp', 3200, 2.5);
  mix(out, ticks, 0, 1.4);
  return [out];
}

/** Storm ambience: rain hiss, droplets on metal/tiles, gusts of wind (seamless loop source, stereo). */
export function* rain(sr: number, rng: Rng, total: number, len: number): Gen {
  const n = Math.ceil(total * sr);
  const chans: Sig[] = [];
  for (let c = 0; c < 2; c++) {
    yield;
    const hiss = white(rng, n);
    mix(hiss, pink(rng, n), 0, 1.2);
    filt(hiss, sr, 'hp', 500, 0.7);
    filt(hiss, sr, 'lp', 8500, 0.7);
    env(hiss, sr, (t) => 0.75 + 0.25 * Math.sin((TAU * 2 * t) / len + c * 1.3));
    const drops = impulses(sr, n, rng, () => 140, () => 1, 0.0007);
    filt(drops, sr, 'bp', 4200, 1.5);
    const big = impulses(sr, n, rng, () => 9, () => 1, 0.002);
    filt(big, sr, 'bp', 1500, 3);
    yield;
    const wind = brown(rng, n, 0.998);
    sweep(wind, sr, 'bp', (t) => 320 + 180 * Math.sin((TAU * 3 * t) / len + c * 2.1), 1.1);
    env(wind, sr, (t) => 0.5 + 0.5 * Math.sin((TAU * t) / len + c));
    const out = new Float32Array(n);
    mix(out, hiss, 0, 0.32);
    mix(out, drops, 0, 0.9);
    mix(out, big, 0, 0.6);
    mix(out, wind, 0, 0.45);
    chans.push(out);
  }
  return chans;
}

/** Reel stop "thock": short pitched thump + woody knock body + ratchet latch clicks. */
export function reelStop(sr: number, rng: Rng, idx: number): Chans {
  const dur = 0.36;
  const n = Math.ceil(dur * sr);
  const out = new Float32Array(n);
  const k = Math.pow(2, idx / 40);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (82 * k * (1 + 0.75 * Math.exp(-t / 0.012))) / sr;
    out[i] = Math.sin(TAU * ph) * ad(t, 0.0008, 0.16) * 0.5;
  }
  const knock = modal(sr, n, [
    { f: 390 * k * (1 + rng.bi() * 0.01), a: 1, t60: 0.1 },
    { f: 845 * k, a: 0.6, t60: 0.065 },
    { f: 1310 * k, a: 0.38, t60: 0.05 },
    { f: 2080 * k, a: 0.22, t60: 0.035 },
  ]);
  mix(out, knock, 0, 1.1);
  for (const [at, g] of [[0.002, 0.55], [0.019, 0.3]] as const) {
    const tick = modal(sr, Math.round(0.06 * sr), [
      { f: 2650 * (1 + rng.bi() * 0.02), a: 0.5, t60: 0.045 },
      { f: 3980, a: 0.32, t60: 0.035 },
      { f: 5600, a: 0.2, t60: 0.025 },
    ]);
    mix(out, tick, Math.round(at * sr), g);
  }
  const c = white(rng, Math.round(0.012 * sr));
  filt(c, sr, 'bp', 1800, 0.9);
  env(c, sr, (t) => Math.exp(-t / 0.002));
  mix(out, c, 0, 1.6);
  drive(out, 1.6);
  dcBlock(out, sr);
  fadeOut(out, sr, 0.04);
  return [out];
}

/** UI click: tiny wooden tick with a soft low thump. */
export function click(sr: number, rng: Rng): Chans {
  const n = Math.ceil(0.12 * sr);
  const out = modal(sr, n, [
    { f: 1850 * (1 + rng.bi() * 0.01), a: 0.7, t60: 0.05 },
    { f: 3150, a: 0.35, t60: 0.03 },
    { f: 4720, a: 0.15, t60: 0.02 },
  ]);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (260 - 100 * Math.min(1, t * 50)) / sr;
    out[i] += Math.sin(TAU * ph) * Math.exp(-t / 0.01) * 0.6;
  }
  const c = white(rng, Math.round(0.004 * sr));
  filt(c, sr, 'hp', 3000);
  env(c, sr, (t) => Math.exp(-t / 0.0008));
  mix(out, c, 0, 0.6);
  fadeOut(out, sr, 0.02);
  return [out];
}

/** Count-up tick: tiny bright metal tick. */
export function tick(sr: number, rng: Rng): Chans {
  const n = Math.ceil(0.09 * sr);
  const f = rng.r(3000, 3400);
  const out = modal(sr, n, [
    { f, a: 0.8, t60: 0.06 },
    { f: f * 1.73, a: 0.35, t60: 0.04 },
    { f: f * 2.41, a: 0.2, t60: 0.03 },
  ]);
  const c = white(rng, Math.round(0.002 * sr));
  filt(c, sr, 'hp', 4000);
  mix(out, c, 0, 0.4);
  fadeOut(out, sr, 0.01);
  return [out];
}

/** Error: two muted wooden knocks + a dull dissonant low pluck. */
export function errorSnd(sr: number, rng: Rng): Chans {
  const dur = 0.55;
  const n = Math.ceil(dur * sr);
  const out = new Float32Array(n);
  for (const [at, f] of [[0, 520], [0.12, 440]] as const) {
    const k = modal(sr, Math.round(0.15 * sr), [
      { f, a: 1, t60: 0.08 },
      { f: f * 2.4, a: 0.3, t60: 0.04 },
    ]);
    let ph = 0;
    for (let i = 0; i < k.length; i++) {
      const t = i / sr;
      ph += 140 / sr;
      k[i] += Math.sin(TAU * ph) * Math.exp(-t / 0.02) * 0.6;
    }
    mix(out, k, Math.round(at * sr), 0.8);
  }
  const p = pluck(sr, { f0: mtof(39), dur: 0.42, t60: 0.35, bright: 0.2, pick: 0.2, excite: 1500, buzz: 0.6 }, rng);
  filt(p, sr, 'lp', 1400);
  mix(out, p, Math.round(0.12 * sr), 0.7);
  fadeOut(out, sr, 0.05);
  return [out];
}
