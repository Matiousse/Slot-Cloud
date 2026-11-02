// RAIJIN OVERLOAD — procedural sound design (Web Audio API, no audio files).
//
// Every sound is synthesized in TypeScript (voices.ts) and pre-rendered once into
// AudioBuffers at unlock (bank.ts, with an OfflineAudioContext convolution pass for
// the taiko room). At run time an event only plays a few buffers through a small
// mixer: SFX + music buses -> shared hall reverb -> glue compressor -> limiter ->
// soft clipper (ceiling 0.97, never clips). Music (music.ts) is a look-ahead
// sequencer of pre-rendered koto / shamisen / shakuhachi / taiko / bass notes.
//
// Public API (used by src/game/controller.ts and src/scene/game-stage.ts):
//   unlock, setSfx, setMusicOn, sfxOn, musicOn, click, spinStart, reelStop(i), scatter(n),
//   drum(n), anticipationStart/Stop, thunder(s), rumble(s), storm(mult), charge(),
//   strikeHit(mult), multiplier(mult), roar(), servo(), win(level), tick, bigWin(tier),
//   fsTrigger, retrigger, coins, error, setMusic(m, tier?), ambience(level)
// Spin start also runs a reel-whir loop that thins out with each reelStop(i); a rain/wind
// storm ambience bed starts by itself once the bank is ready (ambience(0) turns it off).

import { Bank, CHIME_NOTES, KOTO_NOTES, SHAM_NOTES } from './bank';
import { Rng, type Sig } from './dsp';
import { MusicPlayer } from './music';

type Music = 'none' | 'base' | 'fs';

const PREFS_KEY = 'raijin.audio';
/** music bus level relative to SFX */
const MUSIC_LEVEL = 0.3;
const SPIN_LEVEL = 0.2;
const AMB_LEVEL = 0.16;
const OLD_PREFS_KEY = 'cloudburst.audio';

/** D In scale, ascending (koto / shamisen runs) */
const IN = [62, 63, 67, 69, 70, 74, 75, 79, 81, 82, 86];
const WIN_PAIRS = [[69, 74], [67, 74], [70, 74], [74, 81], [69, 81], [75, 74]];
const WIN_TRIADS = [[67, 69, 74], [69, 70, 74], [62, 69, 74], [70, 74, 81], [67, 74, 79]];

interface PlayOpts {
  /** gain */
  g?: number;
  rate?: number;
  pan?: number;
  /** reverb send */
  wet?: number;
  /** variant index */
  v?: number;
  /** start offset inside the buffer (s) */
  offset?: number;
  /** stop after this many seconds (with a short release) */
  dur?: number;
  /** fade-in time (s) */
  fadeIn?: number;
  /** loop the buffer (stopped explicitly) */
  loop?: boolean;
}

interface Voice {
  s: AudioBufferSourceNode;
  g: GainNode;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Soft clipper transfer curve. Input domain [-1, 1] maps to signal [-2, 2] (pre-gain 0.5). */
function clipCurve(): Float32Array<ArrayBuffer> {
  const n = 4096;
  const c = new Float32Array(new ArrayBuffer(n * 4));
  const knee = 0.8;
  const room = 0.17;
  for (let i = 0; i < n; i++) {
    const a = ((i / (n - 1)) * 2 - 1) * 2;
    const m = Math.abs(a);
    c[i] = m <= knee ? a : Math.sign(a) * (knee + room * Math.tanh((m - knee) / room));
  }
  return c;
}

/** Stereo hall impulse response (temple hall: ~2.4 s, damped highs, early reflections). */
function hallIR(sr: number): Sig[] {
  const rng = new Rng(0x5eed);
  const n = Math.ceil(2.7 * sr);
  const pre = Math.round(0.016 * sr);
  const out: Sig[] = [];
  for (let c = 0; c < 2; c++) {
    const ir = new Float32Array(n);
    for (let k = 0; k < 9; k++) {
      const t = 0.008 + rng.f() * 0.075;
      ir[pre + Math.round(t * sr)] += rng.bi() * 0.7 * Math.exp(-t / 0.06);
    }
    let lp = 0;
    let e = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      const coef = 0.15 + 0.75 * Math.min(1, t / 1.8);
      lp = lp * coef + rng.bi() * (1 - coef);
      ir[i] += lp * Math.exp((-6.9 * t) / 2.4) * Math.min(1, t / 0.03) * 1.4;
    }
    const fade = Math.round(0.2 * sr);
    for (let i = 0; i < fade; i++) ir[n - 1 - i] *= i / fade;
    for (let i = 0; i < n; i++) e += ir[i] * ir[i];
    const g = 1 / Math.sqrt(e);
    for (let i = 0; i < n; i++) ir[i] *= g;
    out.push(ir);
  }
  return out;
}

export class AudioEngine {
  sfxOn = true;
  musicOn = true;
  private ctx: BaseAudioContext | null = null;
  private live: AudioContext | null = null;
  private offline = false;
  private bank: Bank | null = null;
  // mixer
  private input!: GainNode;
  private sfxDry!: GainNode;
  private sfxWet!: GainNode;
  private musDry!: GainNode;
  private musWet!: GainNode;
  private duckDry!: GainNode;
  private duckWet!: GainNode;
  // music
  private music: Music = 'none';
  private musicTier = 1;
  private current: MusicPlayer | null = null;
  private players: MusicPlayer[] = [];
  private seed = (Date.now() & 0xffff) + 1;
  private autoSuspended = false;
  // state
  private tAt: number | null = null;
  private anticip: Voice | null = null;
  private tickN = 0;
  private lastTick = -1;
  private winVar = 0;
  private spinVoice: Voice | null = null;
  private amb: Voice | null = null;
  private ambLevel = 1;

  constructor() {
    try {
      const raw = localStorage.getItem(PREFS_KEY) ?? localStorage.getItem(OLD_PREFS_KEY);
      const p = JSON.parse(raw || '{}');
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

  /** Must be called from a user gesture. Creates the context and renders the sound bank in the background. */
  unlock() {
    if (this.offline) return;
    if (!this.live) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      let ctx: AudioContext;
      try {
        ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        ctx = new AC();
      }
      this.live = ctx;
      this.attach(ctx, new Bank(ctx.sampleRate, (ch, len, sr) => ctx.createBuffer(ch, len, sr)));
      void this.bank!.renderAll().then(() => this.pump());
      setInterval(() => this.pump(), 40);
      document.addEventListener('visibilitychange', () => this.onVisibility());
      // iOS can leave the context 'interrupted' (calls, Siri, lock screen): any later tap resumes it
      window.addEventListener('pointerdown', () => {
        if (ctx.state !== 'running' && !document.hidden) void ctx.resume().catch(() => undefined);
      });
    }
    const ctx = this.live;
    if (ctx.state === 'running') return;
    void ctx.resume().then(() => this.pump(), () => undefined);
    // iOS: play a silent buffer inside the gesture to fully unlock output
    try {
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      s.connect(ctx.destination);
      s.start(0);
    } catch {
      /* ignore */
    }
  }

  /**
   * Dev/test hook: run the engine on any context (e.g. an OfflineAudioContext in
   * dev/audio.ts) with an already rendered bank. Events are scheduled at `at()` time.
   */
  attachOffline(ctx: BaseAudioContext, bank: Bank) {
    this.offline = true;
    this.attach(ctx, bank);
  }

  /** Dev/test hook: schedule following events at this context time (null = now). */
  at(t: number | null) {
    this.tAt = t;
  }

  /** Dev/test hook: schedule music up to `until` (offline rendering). */
  flushMusic(until: number) {
    this.syncMusic();
    for (const p of this.players) p.schedule(until);
  }

  /** Bank statistics (render time, memory). */
  get bankStats() {
    return this.bank?.stats ?? null;
  }

  private attach(ctx: BaseAudioContext, bank: Bank) {
    this.ctx = ctx;
    this.bank = bank;
    const c = ctx;
    // master chain: input -> glue comp -> limiter -> soft clip -> out
    this.input = c.createGain();
    this.input.gain.value = 0.42;
    const glue = c.createDynamicsCompressor();
    glue.threshold.value = -20;
    glue.knee.value = 10;
    glue.ratio.value = 2.5;
    glue.attack.value = 0.01;
    glue.release.value = 0.25;
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -6;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.001;
    lim.release.value = 0.12;
    const pre = c.createGain();
    pre.gain.value = 0.5;
    const clip = c.createWaveShaper();
    clip.curve = clipCurve();
    clip.oversample = 'none';
    // remove inaudible sub rumble before the dynamics so it never drives the compressor
    const sub = c.createBiquadFilter();
    sub.type = 'highpass';
    sub.frequency.value = 30;
    sub.Q.value = 0.6;
    this.input.connect(sub).connect(glue).connect(lim).connect(pre).connect(clip).connect(c.destination);
    // reverb
    const rev = c.createConvolver();
    rev.normalize = false;
    const ir = hallIR(c.sampleRate);
    const irb = c.createBuffer(2, ir[0].length, c.sampleRate);
    irb.getChannelData(0).set(ir[0]);
    irb.getChannelData(1).set(ir[1]);
    rev.buffer = irb;
    const revIn = c.createGain();
    const lowcut = c.createBiquadFilter();
    lowcut.type = 'highpass';
    lowcut.frequency.value = 160;
    const revOut = c.createGain();
    revOut.gain.value = 0.9;
    revIn.connect(lowcut).connect(rev).connect(revOut).connect(this.input);
    // buses
    this.sfxDry = c.createGain();
    this.sfxWet = c.createGain();
    this.sfxDry.connect(this.input);
    this.sfxWet.connect(revIn);
    this.musDry = c.createGain();
    this.musWet = c.createGain();
    this.duckDry = c.createGain();
    this.duckWet = c.createGain();
    // music EQ: tighter lows, more presence/air so it reads on phone speakers
    const eq = (type: BiquadFilterType, f: number, gain: number, q = 0.7) => {
      const b = c.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.gain.value = gain;
      b.Q.value = q;
      return b;
    };
    this.musDry
      .connect(this.duckDry)
      .connect(eq('highpass', 48, 0, 0.6))
      .connect(eq('highpass', 48, 0, 0.9))
      .connect(eq('lowshelf', 120, -3))
      .connect(eq('peaking', 2800, 3, 0.8))
      .connect(eq('highshelf', 7500, 3))
      .connect(this.input);
    this.musWet.connect(this.duckWet).connect(revIn);
    this.applyGates(0);
  }

  private applyGates(tau: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (p: AudioParam, v: number) => {
      if (tau <= 0) p.value = v;
      else p.setTargetAtTime(v, t, tau);
    };
    set(this.sfxDry.gain, this.sfxOn ? 1 : 0);
    set(this.sfxWet.gain, this.sfxOn ? 1 : 0);
    set(this.musDry.gain, this.musicOn ? MUSIC_LEVEL : 0);
    set(this.musWet.gain, this.musicOn ? MUSIC_LEVEL : 0);
  }

  setSfx(on: boolean) {
    this.sfxOn = on;
    this.applyGates(0.05);
    if (!on) {
      this.anticipationStop();
      if (this.ctx) this.stopSpinLoop(this.ctx.currentTime, 0.05);
    }
    this.syncAmbience();
    this.savePrefs();
  }

  setMusicOn(on: boolean) {
    this.musicOn = on;
    this.applyGates(0.2);
    this.savePrefs();
    this.pump();
  }

  // ------------------------------------------------------------ plumbing

  private onVisibility() {
    const ctx = this.live;
    if (!ctx) return;
    if (document.hidden) {
      if (ctx.state === 'running') {
        this.autoSuspended = true;
        void ctx.suspend();
      }
    } else if (this.autoSuspended || ctx.state !== 'running') {
      this.autoSuspended = false;
      void ctx.resume().then(
        () => {
          for (const p of this.players) p.realign(ctx.currentTime);
        },
        () => undefined,
      );
    }
  }

  private pump() {
    if (!this.ctx || this.offline) return;
    if (this.ctx.state !== 'running') return;
    this.syncMusic();
    if (!this.amb && this.ambLevel > 0 && this.sfxOn) this.syncAmbience();
    const now = this.ctx.currentTime;
    for (const p of this.players) p.schedule(now + 0.3);
    if (this.players.some((p) => p.finished(now))) {
      this.players = this.players.filter((p) => {
        if (!p.finished(now)) return true;
        p.dispose();
        return false;
      });
    }
  }

  private now(): number {
    if (this.tAt !== null) return this.tAt;
    return this.ctx!.currentTime + 0.012;
  }

  private ok(): boolean {
    return !!this.ctx && !!this.bank && this.sfxOn && (this.offline || this.ctx.state === 'running');
  }

  private play(id: string, at: number, o: PlayOpts = {}): Voice | null {
    const b = this.bank!.get(id, o.v);
    if (!b) return null;
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = b;
    if (o.rate && o.rate !== 1) s.playbackRate.value = o.rate;
    if (o.loop) s.loop = true;
    const g = c.createGain();
    const lvl = o.g ?? 1;
    if (o.fadeIn) {
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(lvl, at + o.fadeIn);
    } else g.gain.value = lvl;
    s.connect(g);
    let node: AudioNode = g;
    let pan: StereoPannerNode | null = null;
    if (o.pan && typeof c.createStereoPanner === 'function') {
      pan = c.createStereoPanner();
      pan.pan.value = clamp(o.pan, -1, 1);
      g.connect(pan);
      node = pan;
    }
    node.connect(this.sfxDry);
    let w: GainNode | null = null;
    if (o.wet) {
      w = c.createGain();
      w.gain.value = o.wet;
      node.connect(w).connect(this.sfxWet);
    }
    s.start(at, o.offset ?? 0);
    if (o.dur) {
      g.gain.setValueAtTime(lvl, at + o.dur);
      g.gain.setTargetAtTime(0, at + o.dur, 0.06);
      s.stop(at + o.dur + 0.5);
    }
    // release every node of the voice (connected-but-idle nodes would otherwise stay alive)
    s.onended = () => {
      g.disconnect();
      pan?.disconnect();
      w?.disconnect();
    };
    return { s, g };
  }

  /** nearest rendered note of a family, pitched with playbackRate */
  private note(prefix: string, notes: readonly number[], midi: number, at: number, o: PlayOpts = {}): Voice | null {
    let best = notes[0];
    for (const n of notes) if (Math.abs(n - midi) < Math.abs(best - midi)) best = n;
    return this.play(prefix + best, at, { ...o, rate: (o.rate ?? 1) * Math.pow(2, (midi - best) / 12) });
  }

  /** taiko hit: soft (first half of variants) or hard layer */
  private hit(id: string, at: number, hard: boolean, o: PlayOpts = {}): Voice | null {
    const n = this.bank!.variants(id);
    if (!n) return null;
    const half = n >> 1;
    return this.play(id, at, { ...o, v: (hard ? half : 0) + Math.floor(Math.random() * (half || 1)), rate: (o.rate ?? 1) * (1 + (Math.random() - 0.5) * 0.02) });
  }

  /** briefly lower the music under a big moment */
  private duck(depth: number, hold: number, at = this.now()) {
    if (!this.ctx) return;
    for (const g of [this.duckDry.gain, this.duckWet.gain]) {
      g.cancelScheduledValues(at);
      if (depth > 0) g.setTargetAtTime(1 - depth, at, 0.04);
      g.setTargetAtTime(1, at + hold, depth > 0 ? 0.6 : 0.25);
    }
  }

  private coinsAt(at: number, n: number, spread: number, level: number) {
    for (let i = 0; i < n; i++) {
      this.play('coin', at + Math.random() * spread, { g: level * rnd(0.55, 1), pan: rnd(-0.75, 0.75), rate: rnd(0.88, 1.18), wet: 0.18 });
    }
  }

  // ------------------------------------------------------------ UI / reels

  click() {
    if (!this.ok()) return;
    this.play('click', this.now(), { g: 0.75, rate: rnd(0.98, 1.03) });
  }

  spinStart() {
    if (!this.ok()) return;
    const t = this.now();
    this.play('whoosh', t, { g: 0.5, wet: 0.08 });
    // spinning-reels whir that thins out as each reel lands (auto-stops after 12 s)
    this.stopSpinLoop(t, 0.05);
    this.spinVoice = this.play('spinloop', t + 0.05, { g: SPIN_LEVEL, fadeIn: 0.12, loop: true, wet: 0.05, rate: rnd(0.97, 1.03) });
    this.spinVoice?.s.stop(t + 12);
  }

  private stopSpinLoop(t: number, tau: number) {
    const v = this.spinVoice;
    if (!v) return;
    this.spinVoice = null;
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setTargetAtTime(0, t, tau);
    try {
      v.s.stop(t + tau * 8);
    } catch {
      /* already stopped */
    }
  }

  reelStop(i: number) {
    if (!this.ok()) return;
    const k = clamp(Math.round(i), 0, 4);
    const t = this.now();
    this.play(`reel${k}`, t, { g: 1.25, pan: (k - 2) * 0.16, wet: 0.08, rate: rnd(0.99, 1.01) });
    const v = this.spinVoice;
    if (v) {
      if (k >= 4) this.stopSpinLoop(t, 0.04);
      else {
        v.g.gain.cancelScheduledValues(t);
        v.g.gain.setTargetAtTime(SPIN_LEVEL * (0.25 + 0.75 * ((4 - k) / 5)), t, 0.03);
      }
    }
  }

  /**
   * Storm ambience bed (rain, droplets, wind gusts). Starts automatically once the
   * sound bank is ready; 0 = off, 1 = base game, ~1.5 = bonus (heavier storm).
   */
  ambience(level: number) {
    this.ambLevel = Math.max(0, level);
    this.syncAmbience();
  }

  private syncAmbience() {
    if (!this.ctx || !this.bank) return;
    const t = this.tAt ?? this.ctx.currentTime;
    if (this.ambLevel <= 0 || !this.sfxOn) {
      if (this.amb) {
        const a = this.amb;
        this.amb = null;
        a.g.gain.cancelScheduledValues(t);
        a.g.gain.setTargetAtTime(0, t, 0.4);
        a.s.stop(t + 3);
      }
      return;
    }
    if (!this.amb) {
      if (!this.bank.has('rain') || !this.ok()) return;
      this.amb = this.play('rain', t + 0.02, { g: 0.0001, loop: true, wet: 0.15 });
    }
    if (this.amb) {
      this.amb.g.gain.cancelScheduledValues(t);
      this.amb.g.gain.setTargetAtTime(AMB_LEVEL * this.ambLevel, t + 0.02, 1.2);
    }
  }

  tick() {
    if (!this.ok()) return;
    const t = this.now();
    if (t - this.lastTick > 0.25) this.tickN = 0;
    this.lastTick = t;
    this.tickN++;
    this.play('tick', t, { g: 0.26, rate: 1 + Math.min(0.5, this.tickN * 0.012), pan: rnd(-0.15, 0.15) });
  }

  error() {
    if (!this.ok()) return;
    this.play('error', this.now(), { g: 0.75 });
  }

  // ------------------------------------------------------------ scatters / anticipation

  /** Bonus drum landed (n-th scatter of the spin, 1..5): increasingly epic taiko hit. */
  drum(n: number) {
    if (!this.ok()) return;
    const k = clamp(Math.round(n), 1, 5);
    const t = this.now();
    const notes = [74, 75, 79, 81, 86];
    this.hit('nagado', t, true, { g: 0.85, wet: 0.22 + k * 0.05 });
    this.note('koto', KOTO_NOTES, notes[k - 1], t + 0.004, { g: 0.5, wet: 0.35, pan: 0.15 });
    this.note('chime', CHIME_NOTES, notes[k - 1] + 12, t + 0.008, { g: 0.16 + 0.04 * k, wet: 0.4, pan: -0.1 });
    if (k >= 2) {
      this.hit('odaiko', t, k >= 3, { g: 0.5 + 0.1 * k, wet: 0.3 });
      this.play('ka', t, { g: 0.3, pan: 0.3 });
    }
    if (k >= 3) {
      this.hit('nagado', t + 0.03, true, { g: 0.65, pan: -0.25, wet: 0.3 });
      this.play('crackle', t, { g: 0.3, wet: 0.2 });
      this.duck(0.25, 0.8, t);
    }
    if (k >= 4) {
      this.play('crack', t, { g: 0.4, wet: 0.3 });
      this.play('boom', t, { g: 0.5 });
      this.note('sham', SHAM_NOTES, 50, t, { g: 0.45 });
      this.note('sham', SHAM_NOTES, 57, t + 0.012, { g: 0.4 });
    }
    if (k >= 5) {
      this.play('rumble', t + 0.05, { g: 0.55, wet: 0.2 });
      this.play('gong', t, { g: 0.28, wet: 0.45 });
      for (let i = 0; i < 4; i++) this.note('chime', CHIME_NOTES, [86, 91, 93, 98][i], t + 0.12 + i * 0.06, { g: 0.18, wet: 0.45 });
    }
  }

  scatter(n: number) {
    this.drum(n);
  }

  anticipationStart() {
    if (!this.ok()) return;
    const t = this.now();
    if (!this.anticip) this.anticip = this.play('riser', t, { g: 0.6, fadeIn: 0.25, wet: 0.12 });
    this.duck(0.35, 12, t); // focus on the suspense; restored by anticipationStop()
  }

  anticipationStop() {
    const a = this.anticip;
    if (!a || !this.ctx) return;
    this.anticip = null;
    const t = this.tAt ?? this.ctx.currentTime;
    const p = a.g.gain as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
    else p.cancelScheduledValues(t);
    p.setTargetAtTime(0, t, 0.04);
    a.s.stop(t + 0.35);
    this.duck(0, 0, t);
  }

  // ------------------------------------------------------------ storm / Raijin

  /** Lightning thunderclap (layered crack + sub boom + long rolling rumble). */
  thunder(strength = 1) {
    if (!this.ok()) return;
    const s = clamp(strength, 0.2, 1.5);
    const t = this.now();
    this.play('crack', t, { g: 0.72 * s, pan: rnd(-0.3, 0.3), wet: 0.3 });
    this.play('boom', t + 0.01, { g: 0.65 * s });
    this.play('rumble', t + 0.04, { g: 0.5 + 0.35 * Math.min(1, s), wet: 0.25, rate: rnd(0.92, 1.05) });
  }

  /** Distant rumble for background lightning. */
  rumble(strength = 0.5) {
    if (!this.ok()) return;
    this.play('far', this.now() + rnd(0, 0.12), { g: 0.25 + 0.4 * clamp(strength, 0, 1), pan: rnd(-0.5, 0.5), wet: 0.3, rate: rnd(0.85, 1.1) });
  }

  /** Mech power-up whine before a strike (~450 ms, ends on the peak). */
  charge() {
    if (!this.ok()) return;
    const t = this.now();
    this.play('charge', t, { g: 0.62, wet: 0.15 });
    this.play('servoU', t, { g: 0.28, pan: -0.2 });
  }

  /** Lightning impact + metal clang, scaled by the multiplier. */
  strikeHit(mult: number) {
    if (!this.ok()) return;
    this.strikeAt(this.now(), mult);
  }

  private strikeAt(t: number, mult: number) {
    const k = clamp(Math.log10(Math.max(1, mult)) / 2, 0, 1);
    this.play('crack', t, { g: 0.78, wet: 0.3 });
    this.play('zap', t, { g: 0.5, wet: 0.2 });
    this.play('boom', t + 0.004, { g: 0.55 + 0.35 * k });
    this.hit('odaiko', t + 0.004, true, { g: 0.55 + 0.3 * k, wet: 0.3 });
    this.play(k > 0.5 ? 'clangH' : 'clangM', t + 0.008, { g: 0.42 + 0.2 * k, wet: 0.25 });
    this.play('sizzle', t + 0.06, { g: 0.32 + 0.25 * k, wet: 0.2 });
    if (k >= 0.3) this.play('rumble', t + 0.08, { g: 0.3 + 0.4 * k, wet: 0.2 });
    this.duck(0.3 + 0.2 * k, 0.6 + k, t);
  }

  /** Gold multiplier coin reveal: chime pitched by the multiplier size. */
  multiplier(mult: number) {
    if (!this.ok()) return;
    this.multAt(this.now(), mult);
  }

  private multAt(t: number, mult: number) {
    const th = [2, 3, 5, 10, 25, 50, 100];
    let idx = 0;
    for (let i = 0; i < th.length; i++) if (mult >= th[i]) idx = i;
    const m = [74, 75, 79, 81, 82, 86, 87][idx];
    this.play('shing', t, { g: 0.42, wet: 0.3, offset: 0.88 });
    this.note('chime', CHIME_NOTES, m, t, { g: 0.48, wet: 0.35 });
    this.note('chime', CHIME_NOTES, m + 12, t + 0.035, { g: 0.24, wet: 0.4 });
    this.note('koto', KOTO_NOTES, Math.min(86, m), t + 0.01, { g: 0.38, wet: 0.3 });
    this.coinsAt(t, 2 + idx, 0.25, 0.3);
    if (mult >= 10) this.hit('nagado', t, true, { g: 0.65, wet: 0.3 });
    if (mult >= 50) {
      this.play('gong', t, { g: 0.28, wet: 0.5 });
      this.play('choirD', t, { g: 0.42, wet: 0.45 });
    }
  }

  /** Legacy combined Thunder Wild sound: strike + multiplier coin. */
  storm(mult: number) {
    if (!this.ok()) return;
    const t = this.now();
    this.strikeAt(t, mult);
    this.multAt(t + 0.55, mult);
  }

  /** Mech roar: distorted growl + servo + steam hiss. */
  roar() {
    if (!this.ok()) return;
    const t = this.now();
    this.play('roar', t, { g: 0.88, wet: 0.3 });
    this.duck(0.45, 1.8, t);
  }

  /** Short mech movement (servo whir + gear ticks + clunk). */
  servo() {
    if (!this.ok()) return;
    this.play(Math.random() < 0.5 ? 'servoU' : 'servoD', this.now(), { g: 0.6, pan: rnd(-0.4, 0.4), wet: 0.1 });
  }

  // ------------------------------------------------------------ wins

  /** Line-win sting (level 0..3), played in key over the music. */
  win(level: number) {
    if (!this.ok()) return;
    const L = clamp(Math.round(level), 0, 3);
    const t = this.now();
    // small wins happen constantly: rotate through In-scale motifs so they never repeat verbatim
    const k = this.winVar++;
    if (L === 0) {
      const pair = WIN_PAIRS[k % WIN_PAIRS.length];
      this.note('koto', KOTO_NOTES, pair[0], t, { g: 0.4, wet: 0.3 });
      this.note('koto', KOTO_NOTES, pair[1], t + 0.09, { g: 0.45, wet: 0.3 });
      this.coinsAt(t + 0.05, 1, 0.05, 0.22);
    } else if (L === 1) {
      WIN_TRIADS[k % WIN_TRIADS.length].forEach((m, i) => this.note('koto', KOTO_NOTES, m, t + i * 0.08, { g: 0.45, wet: 0.3 }));
      this.hit('shime', t, false, { g: 0.35 });
      this.hit('shime', t + 0.16, true, { g: 0.35 });
      this.coinsAt(t + 0.1, 2, 0.2, 0.25);
    } else if (L === 2) {
      [69, 70, 74, 79, 81, 86].forEach((m, i) => this.note('sham', SHAM_NOTES, m, t + i * 0.055, { g: 0.4, wet: 0.25, pan: -0.2 + i * 0.08 }));
      this.hit('nagado', t, false, { g: 0.55 });
      this.hit('nagado', t + 0.33, true, { g: 0.62, wet: 0.3 });
      this.note('chime', CHIME_NOTES, 86, t + 0.33, { g: 0.28, wet: 0.4 });
      this.coinsAt(t + 0.1, 4, 0.5, 0.26);
    } else {
      IN.forEach((m, i) => this.note('koto', KOTO_NOTES, m, t + i * 0.034, { g: 0.36 + i * 0.012, wet: 0.35, pan: -0.3 + i * 0.06 }));
      this.hit('odaiko', t, true, { g: 0.75, wet: 0.3 });
      this.hit('nagado', t + 0.4, true, { g: 0.7, wet: 0.3 });
      this.play('gong', t, { g: 0.2, wet: 0.45 });
      [50, 57, 62].forEach((m, i) => this.note('sham', SHAM_NOTES, m, t + 0.4 + i * 0.012, { g: 0.45 }));
      this.note('chime', CHIME_NOTES, 93, t + 0.42, { g: 0.26, wet: 0.45 });
      this.coinsAt(t + 0.1, 8, 0.9, 0.28);
    }
  }

  /** Big win celebration stinger: tier 0 BIG, 1 MEGA, 2 EPIC, 3 LEGENDARY, 4 MAX WIN. */
  bigWin(tier: number) {
    if (!this.ok()) return;
    const k = clamp(Math.round(tier), 0, 4);
    const t = this.now();
    this.duck(0.45, 2.4 + 0.4 * k, t);
    // DON!
    this.hit('odaiko', t, true, { g: 0.95, wet: 0.35 });
    this.hit('nagado', t + 0.012, true, { g: 0.75, pan: -0.3, wet: 0.3 });
    this.hit('nagado', t + 0.02, true, { g: 0.7, pan: 0.3, wet: 0.3 });
    this.play('boom', t, { g: 0.5 + 0.1 * k });
    this.play('gong', t, { g: 0.28 + 0.07 * k, wet: 0.45 });
    if (k >= 2) this.play('crack', t, { g: 0.5, wet: 0.3 });
    // tsugaru shamisen run up the In scale (starts higher each tier)
    for (let i = 0; i < 9; i++) {
      const m = IN[Math.min(IN.length - 1, i + Math.min(2, k))] + (i + k >= IN.length ? 12 : 0);
      this.note('sham', SHAM_NOTES, m, t + 0.06 + i * 0.045, { g: 0.34 + i * 0.02, pan: -0.25 + i * 0.06, wet: 0.2 });
    }
    // DON! #2 with chord
    const t2 = t + 0.5;
    this.hit('odaiko', t2, true, { g: 1, wet: 0.4 });
    this.hit('nagado', t2 + 0.01, true, { g: 0.8, wet: 0.3 });
    this.play('ka', t2, { g: 0.4, pan: 0.3 });
    [50, 57, 62, 69].forEach((m, i) => this.note('sham', SHAM_NOTES, m, t2 + i * 0.014, { g: 0.5, wet: 0.25 }));
    [74, 81, 86].forEach((m, i) => this.note('koto', KOTO_NOTES, m, t2 + 0.02 + i * 0.02, { g: 0.4, wet: 0.4 }));
    for (let i = 0; i < 3 + k; i++) this.note('chime', CHIME_NOTES, CHIME_NOTES[Math.min(CHIME_NOTES.length - 1, 3 + i)], t2 + 0.08 + i * 0.075, { g: 0.24, wet: 0.45 });
    if (k >= 1) this.play(k >= 3 ? 'shakuM81' : 'shakuM74', t2, { g: 0.5, wet: 0.55, dur: 1.5 });
    if (k >= 2) this.play('choirD', t2, { g: 0.55, wet: 0.45 });
    if (k >= 3) this.play('rumble', t2, { g: 0.5, wet: 0.2 });
    if (k >= 4) {
      this.play('crack', t2, { g: 0.85, wet: 0.35 });
      this.play('clangH', t2, { g: 0.5, wet: 0.3 });
      this.play('choirEb', t2 + 1.1, { g: 0.5, wet: 0.45 });
      this.play('choirD', t2 + 2.4, { g: 0.55, wet: 0.45 });
      this.play('gong', t2 + 2.4, { g: 0.45, wet: 0.5 });
      this.hit('odaiko', t2 + 2.4, true, { g: 1, wet: 0.4 });
    }
    this.coinsAt(t2 + 0.05, 6 + 5 * k, 1.4 + 0.3 * k, 0.32);
  }

  // ------------------------------------------------------------ bonus

  /** Free spins trigger: accelerating taiko roll + charge (1.25 s) into a massive thunder impact. */
  fsTrigger() {
    if (!this.ok()) return;
    const t = this.now();
    const T = 1.25;
    let x = 0;
    let i = 0;
    while (x < T - 0.03) {
      const k = x / T;
      this.hit('nagado', t + x, k > 0.45, { g: 0.4 + 0.5 * k, pan: i % 2 ? 0.22 : -0.22, wet: 0.25 });
      if (k > 0.3) this.hit('shime', t + x + 0.02, k > 0.6, { g: 0.25 + 0.25 * k, pan: i % 2 ? -0.35 : 0.35 });
      x += 0.16 * (1 - k) + 0.034;
      i++;
    }
    this.play('riser', t, { offset: 3.6, g: 0.5, fadeIn: 0.4, dur: T, wet: 0.1 });
    this.play('charge', t + T - 0.46, { g: 0.55 });
    const ti = t + T;
    this.play('crack', ti, { g: 0.95, wet: 0.35 });
    this.play('boom', ti, { g: 1 });
    this.hit('odaiko', ti, true, { g: 1, wet: 0.4 });
    this.hit('odaiko', ti + 0.016, true, { g: 0.7, rate: 0.92, wet: 0.3 });
    this.play('gong', ti, { g: 0.55, wet: 0.5 });
    this.play('choirD', ti, { g: 0.6, wet: 0.5 });
    this.play('rumble', ti + 0.05, { g: 0.7, wet: 0.2 });
    this.play('sizzle', ti, { g: 0.35, wet: 0.2 });
    [50, 57, 62].forEach((m, k) => this.note('sham', SHAM_NOTES, m, ti + k * 0.014, { g: 0.5 }));
    this.duck(0.55, T + 2.6, t);
  }

  /** Extra free spins. */
  retrigger() {
    if (!this.ok()) return;
    const t = this.now();
    this.hit('nagado', t, true, { g: 0.8, wet: 0.3 });
    this.hit('nagado', t + 0.14, true, { g: 0.9, wet: 0.3 });
    this.play('ka', t + 0.07, { g: 0.35, pan: 0.3 });
    this.play('zap', t, { g: 0.3, wet: 0.2 });
    for (let i = 0; i < 7; i++) this.note('koto', KOTO_NOTES, IN[3 + i], t + 0.16 + i * 0.035, { g: 0.38, wet: 0.35, pan: -0.3 + i * 0.1 });
    this.note('chime', CHIME_NOTES, 86, t + 0.45, { g: 0.3, wet: 0.45 });
    this.note('chime', CHIME_NOTES, 93, t + 0.52, { g: 0.25, wet: 0.45 });
    this.coinsAt(t + 0.2, 3, 0.4, 0.28);
  }

  /** Coins pouring (bonus buy). */
  coins() {
    if (!this.ok()) return;
    const t = this.now();
    this.play('clangL', t, { g: 0.22, wet: 0.2 });
    this.hit('shime', t, true, { g: 0.35 });
    let x = 0.02;
    for (let i = 0; i < 16; i++) {
      this.play('coin', t + x, { g: 0.26 * (1 - i / 26), pan: rnd(-0.6, 0.6), rate: rnd(0.9, 1.15), wet: 0.18 });
      x += 0.025 + Math.random() * 0.05;
    }
    this.note('chime', CHIME_NOTES, 91, t + 0.03, { g: 0.3, wet: 0.4 });
    this.note('chime', CHIME_NOTES, 98, t + 0.1, { g: 0.24, wet: 0.4 });
  }

  // ------------------------------------------------------------ music

  setMusic(m: Music, tier?: 1 | 2 | 3) {
    this.music = m;
    if (m === 'fs') this.musicTier = tier ?? 1;
    if (this.ambLevel > 0) this.ambience(m === 'fs' ? 1.3 + 0.15 * this.musicTier : 1);
    this.syncMusic();
  }

  private syncMusic() {
    const ctx = this.ctx;
    const bank = this.bank;
    if (!ctx || !bank) return;
    if (!this.offline && ctx.state !== 'running') return;
    const want = this.musicOn ? this.music : 'none';
    const cur = this.current;
    if (cur && cur.mode === want) {
      if (want === 'fs') cur.tier = this.musicTier;
      return;
    }
    const t = this.now() + 0.03;
    if (want === 'none') {
      if (cur) cur.stop(t, 1.2);
      this.current = null;
      return;
    }
    const ready = bank.ready('drums') && bank.ready('base') && (want === 'base' || bank.ready('fs'));
    if (!ready) return;
    if (cur) cur.stop(t, want === 'fs' ? 0.5 : 2.2);
    const p = new MusicPlayer({ ctx, bank, dry: this.musDry, wet: this.musWet }, want, this.musicTier, this.seed++);
    p.start(want === 'base' && cur ? t + 0.6 : t, want === 'fs' ? 0.2 : 2.5);
    this.current = p;
    this.players.push(p);
  }
}

export const audio = new AudioEngine();
