// Generative music for RAIJIN OVERLOAD, in the Japanese In scale on D (D Eb G A Bb).
//  base : ~92 bpm brooding taiko groove, koto motifs, shakuhachi phrases, drone + shō.
//  fs   : ~128 bpm driving matsuri taiko, dark synth bass, tsugaru shamisen riffs;
//         tier 2 adds chappa + koto answers, tier 3 adds choir chords + shakuhachi screams.
// A MusicPlayer schedules pre-rendered note buffers with a look-ahead clock; the
// engine crossfades between players when the mode changes.

import type { Bank } from './bank';
import { Rng } from './dsp';

export type MusicMode = 'base' | 'fs';

export interface MusicOut {
  ctx: BaseAudioContext;
  bank: Bank;
  /** music dry bus */
  dry: AudioNode;
  /** music reverb-send bus */
  wet: AudioNode;
}

type Ev = [step: number, midi: number, vel: number, len?: number];

/** "X..6" -> velocities (X = 1, digit = n/9, '.' = rest) */
const lane = (s: string): number[] => [...s].map((c) => (c === '.' ? 0 : c === 'X' ? 1 : Number(c) / 9));

/** index events by step (0..len-1) */
function phrase(evs: Ev[], len = 32): Ev[][] {
  const out: Ev[][] = Array.from({ length: len }, () => []);
  for (const e of evs) out[e[0] % len].push(e);
  return out;
}

// ------------------------------------------------------------------ base material (16 steps / bar)
const B_OD = [lane('X...............'), lane('7.........5.....')];
const B_NG = {
  mistA: lane('..............4.'),
  mistB: lane('........6.......'),
  g1: lane('....7..4X...6.45'),
  g2: lane('..4.7...X..5..6.'),
  fill: lane('....6...45678899'),
};
const B_SH = { ghost: lane('..3...3...3.3..3'), fill: lane('..3...3.33445566') };
const B_KA = { mist: lane('....5.......5...'), groove: lane('....5.......4..3') };
const B_BASS = [38, 38, 34, 33, 38, 39, 38, 33];

const KOTO_A1 = phrase([[0, 74, 0.8], [3, 70, 0.45], [4, 69, 0.65], [8, 67, 0.55], [10, 69, 0.5], [12, 70, 0.6], [16, 69, 0.75, -1], [22, 62, 0.45], [24, 63, 0.5], [28, 62, 0.45]]);
const KOTO_A2 = phrase([[0, 74, 0.8], [2, 75, 0.55], [4, 74, 0.6], [8, 70, 0.6], [11, 69, 0.5], [12, 67, 0.5], [16, 69, 0.7], [20, 70, 0.4], [24, 62, 0.5], [26, 67, 0.45]]);
const KOTO_B1 = phrase([[0, 62, 0.7], [2, 63, 0.5], [4, 67, 0.6], [6, 69, 0.55], [8, 70, 0.7], [12, 69, 0.6], [14, 67, 0.4], [16, 69, 0.75], [20, 74, 0.6], [24, 69, 0.5], [28, 67, 0.45]]);
const KOTO_B2 = phrase([[0, 81, 0.6], [1, 74, 0.4], [4, 82, 0.55], [5, 74, 0.4], [8, 81, 0.6], [9, 74, 0.4], [12, 79, 0.5], [16, 81, 0.7], [20, 74, 0.5], [24, 75, 0.55], [28, 74, 0.6]]);
const KOTO_C1 = phrase([[0, 69, 0.7], [2, 70, 0.5], [4, 74, 0.65], [8, 75, 0.7], [10, 74, 0.5], [12, 70, 0.55], [14, 69, 0.45], [16, 67, 0.7], [18, 69, 0.5], [20, 70, 0.6], [24, 69, 0.7, -1], [28, 62, 0.5]]);
const KOTO_T = phrase([
  ...Array.from({ length: 16 }, (_, i): Ev => [i, 81, 0.18 + i * 0.03]),
  [16, 86, 0.8], [20, 82, 0.6], [22, 81, 0.5], [24, 79, 0.6], [28, 74, 0.55],
]);
// shakuhachi phrases over 4 bars (64 steps); 4th field = length in steps
const SHAKU_1 = phrase([[0, 69, 0.75, 10], [10, 70, 0.6, 6], [16, 69, 0.85, 20], [36, 67, 0.55, 6], [42, 69, 0.6, 6], [48, 62, 0.65, 16]], 64);
const SHAKU_2 = phrase([[0, 74, 0.75, 12], [12, 75, 0.6, 4], [16, 74, 0.85, 16], [32, 70, 0.6, 8], [40, 69, 0.75, 24]], 64);

// ------------------------------------------------------------------ free-spins material
const F_PROG: [string, number][] = [['D', 38], ['Bb', 34], ['G', 43], ['Eb', 39]];
const F_OD = { t1: lane('X.......8.......'), t2: lane('X.......8.....6.'), t3: lane('X.....5.8...6.7.') };
const F_NG = { n1: lane('X..6X..6X.5.X.66'), n2: lane('X.6.X..6X.6.X5.7'), fill: lane('X..6X..656789XXX') };
const F_SH = { run: lane('6343534363435365'), fill: lane('6343534344556677') };
const F_KA = lane('....6.......6...');
const F_CH = lane('..5...5...5...5.');
const F_BASS = lane('X..6..7.8..6..7.');
const SHAM_R1 = phrase([
  [0, 74, 1], [1, 74, 0.45], [2, 81, 0.8], [3, 74, 0.45], [4, 75, 0.9], [5, 74, 0.45], [6, 70, 0.7], [7, 69, 0.6],
  [8, 70, 0.9], [10, 69, 0.7], [11, 67, 0.6], [12, 69, 1], [14, 62, 0.6], [15, 63, 0.6],
  [16, 67, 1], [17, 67, 0.45], [18, 70, 0.8], [19, 67, 0.45], [20, 69, 0.9], [22, 67, 0.7], [23, 63, 0.6],
  [24, 62, 1], [28, 69, 0.7], [30, 70, 0.6], [31, 74, 0.8],
]);
const SHAM_R2 = phrase([
  [0, 86, 1], [2, 82, 0.8], [3, 81, 0.7], [4, 79, 0.9], [6, 81, 0.7], [7, 79, 0.5], [8, 75, 0.9], [10, 74, 0.8],
  [12, 70, 0.9], [13, 69, 0.6], [14, 67, 0.7], [15, 69, 0.6], [16, 70, 1], [18, 69, 0.8], [19, 67, 0.6], [20, 63, 0.8],
  [22, 62, 0.9], [24, 74, 1], [26, 62, 0.6], [27, 74, 0.6], [28, 62, 0.6], [29, 74, 0.6], [30, 75, 0.8], [31, 74, 0.7],
]);
const SHAM_R3 = phrase([
  [0, 62, 1], [2, 62, 0.5], [3, 63, 0.7], [4, 62, 0.9], [6, 57, 0.7], [8, 62, 1], [9, 63, 0.6], [10, 67, 0.8], [11, 69, 0.7],
  [12, 70, 1], [14, 69, 0.6], [15, 67, 0.6], [16, 69, 1], [18, 74, 0.8], [19, 75, 0.7], [20, 74, 0.9], [22, 70, 0.7],
  [24, 69, 1], [25, 67, 0.5], [26, 63, 0.7], [27, 62, 0.6], [28, 57, 0.8], [30, 62, 0.9],
]);
const KOTO_FS = phrase([
  [0, 81, 0.5], [2, 86, 0.4], [4, 82, 0.45], [6, 81, 0.4], [8, 79, 0.45], [10, 81, 0.4], [12, 82, 0.45], [14, 86, 0.5],
  [16, 81, 0.5], [18, 79, 0.4], [20, 75, 0.45], [22, 74, 0.4], [24, 75, 0.45], [26, 79, 0.4], [28, 81, 0.5], [30, 82, 0.45],
]);

// mix levels of the instrument strips
const LEVEL: Record<string, number> = {
  odaiko: 0.6, nagado: 0.55, shime: 0.55, ka: 0.5, chappa: 0.7, koto: 1.1, sham: 1.0, shaku: 0.38, bass: 0.42, choir: 0.4, drone: 0.32,
};

interface Strip {
  g: GainNode;
}

interface Mono {
  g: GainNode;
  s: AudioBufferSourceNode;
}

export class MusicPlayer {
  /** dev hook: only this instrument strip is audible (stem analysis in dev/audio.ts) */
  static solo: string | null = null;
  /** dev hook: when set, every scheduled note is appended as [time, strip, buffer id, gain] */
  static log: [number, string, string, number][] | null = null;
  readonly bpm: number;
  readonly stepDur: number;
  tier: number;
  private ctx: BaseAudioContext;
  private bank: Bank;
  private dryF: GainNode;
  private wetF: GainNode;
  private delayIn: GainNode;
  private strips: Record<string, Strip> = {};
  private mono: Record<string, Mono | null> = {};
  private bar = 0;
  private step = 0;
  private nextT = 0;
  private stopAt = Infinity;
  private rng: Rng;
  private drone: AudioBufferSourceNode | null = null;
  private plan = { kotoA: KOTO_A1, kotoA2: KOTO_A2, kotoB: KOTO_B1, kotoUp: 0, shaku: SHAKU_1, riff: SHAM_R1 };
  private nodes: AudioNode[] = [];

  constructor(
    out: MusicOut,
    readonly mode: MusicMode,
    tier: number,
    seed: number,
  ) {
    this.ctx = out.ctx;
    this.bank = out.bank;
    this.tier = tier;
    this.bpm = mode === 'fs' ? 128 : 92;
    this.stepDur = 60 / this.bpm / 4;
    this.rng = new Rng(seed);
    const c = this.ctx;
    this.dryF = c.createGain();
    this.wetF = c.createGain();
    this.dryF.gain.value = 0;
    this.wetF.gain.value = 0;
    this.dryF.connect(out.dry);
    this.wetF.connect(out.wet);
    // tempo delay (dotted eighth), damped feedback
    this.delayIn = c.createGain();
    const dl = c.createDelay(2);
    dl.delayTime.value = this.stepDur * 3;
    const fb = c.createGain();
    fb.gain.value = 0.32;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const dOut = c.createGain();
    dOut.gain.value = 0.5;
    this.delayIn.connect(dl);
    dl.connect(lp).connect(fb).connect(dl);
    dl.connect(dOut);
    dOut.connect(this.dryF);
    dOut.connect(this.wetF);
    this.nodes.push(this.delayIn, dl, fb, lp, dOut);
    // instrument strips: [pan, reverb send, delay send]
    const S: Record<string, [number, number, number]> = {
      odaiko: [0, 0.3, 0], nagado: [0.08, 0.28, 0], shime: [-0.32, 0.2, 0], ka: [0.36, 0.25, 0], chappa: [0.28, 0.3, 0],
      koto: [0.3, 0.4, 0.28], sham: [-0.22, 0.25, 0.12], shaku: [0.12, 0.75, 0.3], bass: [0, 0.04, 0], choir: [0, 0.55, 0], drone: [0, 0.35, 0],
    };
    for (const [k, [pan, wet, del]] of Object.entries(S)) this.strips[k] = { g: this.strip(MusicPlayer.solo && MusicPlayer.solo !== k ? 0 : LEVEL[k], pan, wet, del) };
  }

  private strip(level: number, pan: number, wet: number, del: number): GainNode {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = level;
    let node: AudioNode = g;
    if (pan && typeof c.createStereoPanner === 'function') {
      const p = c.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      node = p;
      this.nodes.push(p);
    }
    node.connect(this.dryF);
    if (wet) {
      const w = c.createGain();
      w.gain.value = wet;
      node.connect(w).connect(this.wetF);
      this.nodes.push(w);
    }
    if (del) {
      const d = c.createGain();
      d.gain.value = del;
      node.connect(d).connect(this.delayIn);
      this.nodes.push(d);
    }
    this.nodes.push(g);
    return g;
  }

  start(t: number, fade: number) {
    this.nextT = t;
    for (const f of [this.dryF, this.wetF]) {
      f.gain.cancelScheduledValues(t);
      f.gain.setValueAtTime(0.0001, t);
      f.gain.exponentialRampToValueAtTime(1, t + Math.max(0.02, fade));
    }
    if (this.mode === 'base') {
      const b = this.bank.get('drone');
      if (b) {
        const s = this.ctx.createBufferSource();
        s.buffer = b;
        s.loop = true;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(1, t + 3);
        s.connect(g).connect(this.strips.drone.g);
        s.start(t);
        this.drone = s;
        this.nodes.push(g);
      }
    }
  }

  /** Fade out and stop scheduling. */
  stop(t: number, fade: number) {
    if (this.stopAt !== Infinity) return;
    this.stopAt = t + fade;
    for (const f of [this.dryF, this.wetF]) {
      const p = f.gain as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
      if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
      else {
        p.cancelScheduledValues(t);
        p.setValueAtTime(p.value || 1, t);
      }
      p.setTargetAtTime(0, t, fade / 4);
    }
    if (this.drone) this.drone.stop(this.stopAt + 0.2);
  }

  get stopping(): boolean {
    return this.stopAt !== Infinity;
  }

  /** true once the fade is over and every scheduled voice has decayed */
  finished(now: number): boolean {
    return now > this.stopAt + 4;
  }

  dispose() {
    try {
      this.drone?.stop();
    } catch {
      /* already stopped */
    }
    for (const n of this.nodes) n.disconnect();
    this.dryF.disconnect();
    this.wetF.disconnect();
  }

  /** Re-align after the context was suspended (tab hidden). */
  realign(now: number) {
    if (this.nextT < now) this.nextT = now + 0.05;
  }

  schedule(until: number) {
    const end = Math.min(until, this.stopAt);
    while (this.nextT < end) {
      if (this.step === 0) this.onBar(this.bar);
      if (this.mode === 'base') this.baseStep(this.bar, this.step, this.nextT);
      else this.fsStep(this.bar, this.step, this.nextT);
      this.nextT += this.stepDur;
      if (++this.step === 16) {
        this.step = 0;
        this.bar++;
      }
    }
  }

  // ---------------------------------------------------------------- voices

  private play(id: string, t: number, vel: number, strip: string, rate = 1, v?: number, mono = false, len = 0) {
    const b = this.bank.get(id, v);
    if (!b || vel <= 0) return;
    MusicPlayer.log?.push([+t.toFixed(3), strip, id, +vel.toFixed(2)]);
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = b;
    if (rate !== 1) s.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = vel;
    s.connect(g).connect(this.strips[strip].g);
    const tt = Math.max(t, c.currentTime);
    s.start(tt);
    if (mono) {
      const prev = this.mono[strip];
      if (prev) {
        prev.g.gain.setTargetAtTime(0, tt, 0.025);
        try {
          prev.s.stop(tt + 0.25);
        } catch {
          /* ignore */
        }
      }
      this.mono[strip] = { g, s };
    }
    if (len > 0) {
      g.gain.setValueAtTime(vel, tt + len);
      g.gain.setTargetAtTime(0, tt + len, 0.12);
      s.stop(tt + len + 1);
    }
    s.onended = () => g.disconnect();
  }

  private humanize(t: number): number {
    return t + this.rng.g() * 0.0035;
  }

  /** drum hit choosing the soft or hard velocity layer */
  private drum(id: string, t: number, vel: number) {
    if (vel <= 0) return;
    const n = this.bank.variants(id);
    if (!n) return;
    const half = n >> 1;
    const hard = vel >= 0.72;
    const v = (hard ? half : 0) + this.rng.i(half || 1);
    const g = hard ? vel : Math.min(1, vel / 0.6) * 0.9;
    this.play(id, this.humanize(t), g * (0.92 + 0.16 * this.rng.f()), id, 1 + this.rng.bi() * 0.012, v);
  }

  /** pitched note from a family of rendered notes (nearest + playbackRate) */
  private note(prefix: string, notes: readonly number[], midi: number, t: number, vel: number, strip: string, mono = false, len = 0) {
    let best = notes[0];
    for (const n of notes) if (Math.abs(n - midi) < Math.abs(best - midi)) best = n;
    this.play(prefix + best, t, vel, strip, Math.pow(2, (midi - best) / 12), undefined, mono, len);
  }

  // ---------------------------------------------------------------- arrangement

  private onBar(bar: number) {
    if (this.mode === 'base' && bar % 16 === 0) {
      const r = this.rng;
      this.plan.kotoA = r.f() < 0.5 ? KOTO_A1 : KOTO_A2;
      this.plan.kotoA2 = this.plan.kotoA === KOTO_A1 ? KOTO_A2 : KOTO_A1;
      this.plan.kotoUp = bar > 0 && r.f() < 0.35 ? 12 : 0;
      this.plan.kotoB = bar > 0 && r.f() < 0.5 ? KOTO_C1 : KOTO_B1;
      this.plan.shaku = r.f() < 0.5 ? SHAKU_1 : SHAKU_2;
    }
    if (this.mode === 'fs' && bar % 8 === 0) this.plan.riff = bar > 0 && this.rng.f() < 0.4 ? SHAM_R3 : SHAM_R1;
  }

  private baseStep(bar: number, s: number, t: number) {
    const sec = bar % 16;
    const part = sec >> 2; // 0 mist, 1 groove, 2 spirit, 3 storm
    const fill = sec === 15 || (sec === 7 && this.rng.f() < 0.5);
    // taiko
    this.drum('odaiko', t, B_OD[sec & 1][s]);
    const ng = fill ? B_NG.fill : part === 0 ? (sec & 1 ? B_NG.mistB : B_NG.mistA) : sec & 1 ? B_NG.g2 : B_NG.g1;
    this.drum('nagado', t, ng[s]);
    if (part > 0) this.drum('shime', t, (fill ? B_SH.fill : B_SH.ghost)[s] * (0.85 + 0.3 * this.rng.f()));
    this.drum('ka', t, (part === 0 ? B_KA.mist : B_KA.groove)[s]);
    // bass (long notes on the bar)
    if (part > 0 && s === 0) this.note('bassL', [33, 34, 38, 39, 43, 45, 46, 50], B_BASS[sec % 8], t, 0.85, 'bass', true, this.stepDur * 16);
    // koto
    let ph: Ev[][] | null = null;
    let up = 0;
    if (part === 0) ph = sec < 2 ? this.plan.kotoA : this.plan.kotoA2;
    else if (part === 1) ph = sec < 6 ? this.plan.kotoB : KOTO_B2;
    else if (part === 2) ph = sec < 10 ? this.plan.kotoA : null;
    else ph = sec < 14 ? KOTO_T : KOTO_B2;
    if (part === 0 || part === 2) up = this.plan.kotoUp;
    if (ph) {
      for (const e of ph[(sec & 1) * 16 + s]) {
        if (this.rng.f() < 0.08) continue;
        const vel = e[2] * (part === 2 ? 0.6 : 1) * (0.9 + 0.2 * this.rng.f());
        const m = Math.min(86, e[1] + up);
        if (e[3] === -1 && this.bank.has(`kotoB${m}`)) this.play(`kotoB${m}`, this.humanize(t), vel, 'koto');
        else this.note('koto', [62, 63, 67, 69, 70, 74, 75, 79, 81, 82, 86], m, this.humanize(t), vel, 'koto');
      }
    }
    // shakuhachi
    let sp: Ev[][] | null = null;
    let sb = 0;
    if (part === 2) {
      sp = this.plan.shaku;
      sb = 8;
    } else if (part === 3 && Math.floor(bar / 16) % 2 === 1) {
      sp = this.plan.shaku === SHAKU_1 ? SHAKU_2 : SHAKU_1;
      sb = 12;
    }
    if (sp) for (const e of sp[(sec - sb) * 16 + s]) this.note('shaku', [62, 67, 69, 70, 74, 75, 81], e[1], t, e[2], 'shaku', true, (e[3] ?? 8) * this.stepDur);
  }

  private fsStep(bar: number, s: number, t: number) {
    const tier = this.tier;
    const [chord, root] = F_PROG[bar % 4];
    const fill = bar % 4 === 3;
    // taiko
    this.drum('odaiko', t, (tier >= 3 ? F_OD.t3 : tier >= 2 ? F_OD.t2 : F_OD.t1)[s]);
    this.drum('nagado', t, (fill ? F_NG.fill : bar & 1 ? F_NG.n2 : F_NG.n1)[s]);
    this.drum('shime', t, (fill ? F_SH.fill : F_SH.run)[s] * (0.85 + 0.3 * this.rng.f()));
    this.drum('ka', t, F_KA[s]);
    if (tier >= 2 && F_CH[s]) this.play('chappa', this.humanize(t), F_CH[s] * (0.85 + 0.3 * this.rng.f()), 'chappa');
    // bass
    if (F_BASS[s]) {
      const m = s === 14 ? F_PROG[(bar + 1) % 4][1] : root;
      this.note('bassP', [33, 34, 38, 39, 43, 45, 46, 50], m, t, F_BASS[s] * (tier >= 2 ? 1 : 0.9), 'bass', true, this.stepDur * 2.2);
    }
    // shamisen riffs: call (bars 0-1) / response (bars 2-3)
    const riff = bar % 4 < 2 ? this.plan.riff : SHAM_R2;
    for (const e of riff[(bar & 1) * 16 + s]) {
      if (tier >= 2 && bar % 4 >= 2 && this.rng.f() < 0.3) continue;
      this.note('sham', [50, 57, 62, 63, 67, 69, 70, 74, 75, 79, 81, 82, 86], e[1], this.humanize(t), e[2] * (0.88 + 0.24 * this.rng.f()), 'sham', true, this.stepDur * 3);
    }
    if (s === 0 && bar % 4 === 0) {
      this.play('sham50', t, 0.7, 'sham');
      this.play('sham57', t + 0.012, 0.6, 'sham');
    }
    // koto answers (tier 2+)
    if (tier >= 2 && bar % 4 >= 2) for (const e of KOTO_FS[(bar & 1) * 16 + s]) this.note('koto', [62, 63, 67, 69, 70, 74, 75, 79, 81, 82, 86], e[1], this.humanize(t), e[2], 'koto');
    // god mode: choir + shakuhachi screams
    if (tier >= 3) {
      if (s === 0) this.play(`choir${chord}`, t, 0.9, 'choir');
      if (s === 0 && bar % 8 === 0) this.play('shakuM74', t, 0.75, 'shaku', 1, undefined, true, this.stepDur * 14);
      if (s === 8 && bar % 8 === 5) this.play('shakuM81', t, 0.7, 'shaku', 1, undefined, true, this.stepDur * 20);
    }
  }
}
