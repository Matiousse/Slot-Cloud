// Sound bank: renders every recipe once (at unlock) into AudioBuffers.
// JS synthesis (voices.ts) produces the raw signal; recipes that need heavy
// native processing (room convolution) go through an OfflineAudioContext pass.
// Rendering is progressive and grouped so the core UI sounds are ready first.

import { Rng, dcBlock, fadeOut, peakOf, type Sig } from './dsp';
import * as V from './voices';

export type Group = 'core' | 'drums' | 'base' | 'fx' | 'big' | 'fs' | 'winds';
/** render order: UI first, then what the base game needs, then bonus material */
export const GROUPS: Group[] = ['core', 'drums', 'base', 'fx', 'big', 'fs', 'winds'];

export interface Recipe {
  id: string;
  group: Group;
  variants: number;
  /** sample-rate divisor (2 = half rate for dark/low content, saves memory) */
  div?: number;
  /** normalisation peak across all variants (0 = leave as rendered) */
  peak?: number;
  /** seamless loop: [loop length (s), crossfade (s)]; gen must render length + crossfade */
  loop?: [number, number];
  /** native post-processing pass: wooden room (dojo) early reflections */
  room?: number;
  gen: (sr: number, rng: Rng, v: number) => Sig[] | V.Gen;
}

// ------------------------------------------------------------------ musical material (D In scale: D Eb G A Bb)

export const KOTO_NOTES = [62, 63, 67, 69, 70, 74, 75, 79, 81, 82, 86];
export const KOTO_BENDS: [number, number][] = [[67, 2], [69, 1], [74, 1]];
export const SHAM_NOTES = [50, 57, 62, 63, 67, 69, 70, 74, 75, 79, 81, 82, 86];
export const SHAKU_NOTES = [62, 67, 69, 70, 74, 75, 81];
export const BASS_NOTES = [33, 34, 38, 39, 43, 45, 46, 50];
export const CHIME_NOTES = [74, 75, 79, 81, 82, 86, 87, 91, 93, 94, 98];
export const CHOIR_CHORDS: Record<string, number[]> = {
  D: [50, 57, 62, 69],
  Bb: [46, 58, 62, 69],
  G: [43, 55, 58, 62],
  Eb: [51, 55, 58, 63],
};

const shimeHits = (sr: number, rng: Rng): Sig[] => [0.6, 0.8, 1].map((v) => V.taiko(sr, rng, V.SHIME, v)[0]);

export const RECIPES: Recipe[] = [
  // ---------------------------------------------------------------- core (UI / reels)
  { id: 'click', group: 'core', variants: 2, peak: 0.8, gen: (sr, r) => V.click(sr, r) },
  { id: 'tick', group: 'core', variants: 4, peak: 0.8, gen: (sr, r) => V.tick(sr, r) },
  ...[0, 1, 2, 3, 4].map<Recipe>((i) => ({ id: `reel${i}`, group: 'core', variants: 2, peak: 0.85, gen: (sr, r) => V.reelStop(sr, r, i) })),
  { id: 'whoosh', group: 'core', variants: 3, peak: 0.8, gen: (sr, r) => V.whoosh(sr, r) },
  { id: 'spinloop', group: 'core', variants: 1, div: 1.5, peak: 0.8, loop: [1.6, 0.3], gen: (sr, r) => V.spinLoop(sr, r, 1.9) },
  { id: 'error', group: 'core', variants: 1, peak: 0.8, gen: (sr, r) => V.errorSnd(sr, r) },
  // ---------------------------------------------------------------- taiko kit (soft variants first, then hard)
  { id: 'odaiko', group: 'drums', variants: 4, div: 2, peak: 0.9, room: 0.32, gen: (sr, r, v) => V.taiko(sr, r, V.ODAIKO, v < 2 ? 0.55 : 1) },
  { id: 'nagado', group: 'drums', variants: 4, div: 2, peak: 0.9, room: 0.3, gen: (sr, r, v) => V.taiko(sr, r, V.NAGADO, v < 2 ? 0.5 : 1) },
  { id: 'shime', group: 'drums', variants: 4, div: 1.5, peak: 0.85, room: 0.22, gen: (sr, r, v) => V.taiko(sr, r, V.SHIME, v < 2 ? 0.55 : 1) },
  { id: 'ka', group: 'drums', variants: 3, peak: 0.8, room: 0.25, gen: (sr, r) => V.ka(sr, r) },
  // ---------------------------------------------------------------- base music instruments
  ...KOTO_NOTES.map<Recipe>((m) => ({ id: `koto${m}`, group: 'base', variants: 1, div: 1.5, peak: 0.85, gen: (sr, r) => V.koto(sr, r, m) })),
  ...KOTO_BENDS.map<Recipe>(([m, b]) => ({ id: `kotoB${m}`, group: 'base', variants: 1, div: 1.5, peak: 0.85, gen: (sr, r) => V.koto(sr, r, m, b) })),
  ...SHAKU_NOTES.map<Recipe>((m) => ({ id: `shaku${m}`, group: 'winds', variants: 1, div: 2, peak: 0.85, gen: (sr, r) => V.shakuhachi(sr, r, m, 3.8) })),
  ...BASS_NOTES.map<Recipe>((m) => ({ id: `bassL${m}`, group: 'base', variants: 1, div: 2, peak: 0.85, gen: (sr, r) => V.bass(sr, r, m, true) })),
  { id: 'drone', group: 'base', variants: 1, div: 2, peak: 0.8, loop: [10, 1.5], gen: (sr, r) => V.drone(sr, r, 11.5, 10) },
  // ---------------------------------------------------------------- effects
  { id: 'rain', group: 'fx', variants: 1, div: 2, peak: 0.8, loop: [8, 1], gen: (sr, r) => V.rain(sr, r, 9, 8) },
  { id: 'crack', group: 'fx', variants: 2, peak: 0.9, gen: (sr, r) => V.crack(sr, r) },
  { id: 'rumble', group: 'fx', variants: 2, div: 2, peak: 0.9, gen: (sr, r) => V.rumble(sr, r, 5.2, false) },
  { id: 'far', group: 'fx', variants: 1, div: 2, peak: 0.9, gen: (sr, r) => V.rumble(sr, r, 4.5, true) },
  { id: 'boom', group: 'fx', variants: 1, div: 2, peak: 0.9, gen: (sr, r) => V.boom(sr, r) },
  { id: 'zap', group: 'fx', variants: 2, peak: 0.85, gen: (sr, r) => V.zap(sr, r) },
  { id: 'sizzle', group: 'fx', variants: 2, div: 1.5, peak: 0.85, gen: (sr, r) => V.sizzle(sr, r) },
  { id: 'crackle', group: 'fx', variants: 2, div: 1.5, peak: 0.85, gen: (sr, r) => V.crackle(sr, r) },
  { id: 'clangH', group: 'fx', variants: 2, div: 1.5, peak: 0.9, gen: (sr, r) => V.clang(sr, r, 92, 2.2, 2.4) },
  { id: 'clangM', group: 'fx', variants: 2, div: 1.5, peak: 0.9, gen: (sr, r) => V.clang(sr, r, 170, 1.4, 1.6) },
  { id: 'clangL', group: 'fx', variants: 2, div: 1.5, peak: 0.9, gen: (sr, r) => V.clang(sr, r, 330, 0.8, 1.0) },
  { id: 'coin', group: 'fx', variants: 6, div: 1.5, peak: 0.85, gen: (sr, r) => V.coin(sr, r) },
  { id: 'shing', group: 'fx', variants: 1, div: 1.5, peak: 0.85, gen: (sr, r) => V.shing(sr, r) },
  ...CHIME_NOTES.map<Recipe>((m) => ({ id: `chime${m}`, group: 'fx', variants: 1, div: 1.5, peak: 0.85, gen: (sr, r) => V.chime(sr, r, m, 1.3) })),
  { id: 'servoU', group: 'fx', div: 1.5, variants: 2, peak: 0.85, gen: (sr, r) => V.servo(sr, r, true) },
  { id: 'servoD', group: 'fx', div: 1.5, variants: 2, peak: 0.85, gen: (sr, r) => V.servo(sr, r, false) },
  { id: 'steam', group: 'fx', div: 1.5, variants: 1, peak: 0.85, gen: (sr, r) => V.steam(sr, r) },
  { id: 'hydraulic', group: 'fx', div: 1.5, variants: 1, peak: 0.85, gen: (sr, r) => V.hydraulic(sr, r) },
  { id: 'charge', group: 'fx', div: 1.5, variants: 1, peak: 0.85, gen: (sr, r) => V.charge(sr, r) },
  { id: 'riser', group: 'fx', div: 1.5, variants: 1, peak: 0.85, gen: (sr, r) => V.riser(sr, r, shimeHits(sr, r)) },
  // ---------------------------------------------------------------- big moments
  { id: 'gong', group: 'big', variants: 1, div: 1.5, peak: 0.85, gen: (sr, r) => V.gong(sr, r) },
  { id: 'roar', group: 'big', variants: 2, div: 2, peak: 0.9, gen: (sr, r) => V.roar(sr, r) },
  // ---------------------------------------------------------------- free-spins music
  ...SHAM_NOTES.map<Recipe>((m) => ({ id: `sham${m}`, group: 'fs', variants: 1, div: 1.5, peak: 0.85, gen: (sr, r) => V.shamisen(sr, r, m) })),
  ...BASS_NOTES.map<Recipe>((m) => ({ id: `bassP${m}`, group: 'fs', variants: 1, div: 2, peak: 0.85, gen: (sr, r) => V.bass(sr, r, m, false) })),
  { id: 'chappa', group: 'fs', variants: 2, peak: 0.8, gen: (sr, r) => V.chappa(sr, r) },
  ...Object.entries(CHOIR_CHORDS).map<Recipe>(([k, notes]) => ({ id: `choir${k}`, group: 'fs', variants: 1, div: 2, peak: 0.85, gen: (sr, r) => V.choir(sr, r, notes, 2.9) })),
  { id: 'shakuM74', group: 'winds', variants: 1, div: 2, peak: 0.85, gen: (sr, r) => V.shakuhachi(sr, r, 74, 2.2, true) },
  { id: 'shakuM81', group: 'winds', variants: 1, div: 2, peak: 0.85, gen: (sr, r) => V.shakuhachi(sr, r, 81, 2.2, true) },
];

// ------------------------------------------------------------------ helpers

type OfflineCtor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext;

function offlineCtor(): OfflineCtor | null {
  const w = globalThis as unknown as { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor };
  return w.OfflineAudioContext ?? w.webkitOfflineAudioContext ?? null;
}

function renderOffline(ctx: OfflineAudioContext): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    ctx.oncomplete = (e) => resolve(e.renderedBuffer);
    try {
      const p = ctx.startRendering() as Promise<AudioBuffer> | undefined;
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    } catch (err) {
      reject(err);
    }
  });
}

/** Short wooden-room impulse response (dojo): early reflections + damped tail. */
function roomIR(sr: number, rng: Rng): Sig {
  const n = Math.ceil(0.62 * sr);
  const ir = new Float32Array(n);
  const taps = [0.0071, 0.0113, 0.0167, 0.0193, 0.0241, 0.0307, 0.0373, 0.0433, 0.0521, 0.0617];
  taps.forEach((t, k) => (ir[Math.round(t * sr)] += (k % 2 ? -1 : 1) * 0.55 * Math.exp(-t / 0.05)));
  let lp = 0;
  for (let i = Math.round(0.012 * sr); i < n; i++) {
    const t = i / sr;
    const c = 0.25 + 0.6 * Math.min(1, t / 0.5); // damping increases over time (wood absorbs highs)
    lp = lp * c + rng.bi() * (1 - c);
    ir[i] += lp * Math.exp(-t / 0.13) * 0.9;
  }
  fadeOut(ir, sr, 0.05);
  return ir;
}

// Yield to the page between jobs (MessageChannel is not clamped like setTimeout).
let lastYield = 0;
const channel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
export const sliceStats = { max: 0, maxAt: '' };
let current = '';
async function yieldTask(): Promise<void> {
  const slice = performance.now() - lastYield;
  if (slice < 8) return;
  if (lastYield && slice > sliceStats.max) {
    sliceStats.max = Math.round(slice);
    sliceStats.maxAt = current;
  }
  await new Promise<void>((r) => {
    if (channel) {
      channel.port1.onmessage = () => r();
      channel.port2.postMessage(0);
    } else setTimeout(r, 0);
  });
  lastYield = performance.now();
}

export type BufferFactory = (channels: number, length: number, sampleRate: number) => AudioBuffer;

/** Rendered sound bank shared by every engine instance (live or offline). */
export class Bank {
  private bufs = new Map<string, AudioBuffer[]>();
  private rr = new Map<string, number>();
  private readyGroups = new Set<Group>();
  private waiters: { g: Group; res: () => void }[] = [];
  private started = false;
  readonly stats = { buffers: 0, bytes: 0, ms: 0, byGroup: {} as Record<string, number>, byRecipe: {} as Record<string, [ms: number, kb: number]>, maxSliceMs: 0, maxSliceAt: '' };

  constructor(
    readonly sr: number,
    private makeBuffer: BufferFactory,
  ) {}

  has(id: string): boolean {
    return this.bufs.has(id);
  }

  ready(g: Group): boolean {
    return this.readyGroups.has(g);
  }

  whenReady(g: Group): Promise<void> {
    if (this.readyGroups.has(g)) return Promise.resolve();
    return new Promise((res) => this.waiters.push({ g, res }));
  }

  variants(id: string): number {
    return this.bufs.get(id)?.length ?? 0;
  }

  /** Specific variant, or round-robin (never the same one twice in a row). */
  get(id: string, v?: number): AudioBuffer | null {
    const list = this.bufs.get(id);
    if (!list || !list.length) return null;
    if (v !== undefined) return list[Math.max(0, Math.min(list.length - 1, v))];
    if (list.length === 1) return list[0];
    const last = this.rr.get(id) ?? -1;
    let k = Math.floor(Math.random() * list.length);
    if (k === last) k = (k + 1) % list.length;
    this.rr.set(id, k);
    return list[k];
  }

  /** Render every recipe (once). Groups resolve in GROUPS order. */
  async renderAll(only?: Group[]): Promise<void> {
    if (this.started) return this.whenReady(GROUPS[GROUPS.length - 1]);
    this.started = true;
    const t0 = performance.now();
    for (const g of GROUPS) {
      if (only && !only.includes(g)) continue;
      const tg = performance.now();
      for (const r of RECIPES) {
        if (r.group !== g) continue;
        try {
          await this.renderRecipe(r);
        } catch (err) {
          console.warn('[audio] render failed', r.id, err);
        }
        await yieldTask();
      }
      this.stats.byGroup[g] = Math.round(performance.now() - tg);
      this.readyGroups.add(g);
      this.waiters = this.waiters.filter((w) => (w.g === g ? (w.res(), false) : true));
    }
    this.stats.ms = Math.round(performance.now() - t0);
    this.stats.maxSliceMs = sliceStats.max;
    this.stats.maxSliceAt = sliceStats.maxAt;
  }

  private async renderRecipe(r: Recipe) {
    const sr = Math.round(this.sr / (r.div ?? 1));
    const t0 = performance.now();
    current = r.id;
    let kb = 0;
    let seed = 0;
    for (let i = 0; i < r.id.length; i++) seed = (seed * 31 + r.id.charCodeAt(i)) | 0;
    const rendered: Sig[][] = [];
    for (let v = 0; v < r.variants; v++) {
      const rng = new Rng(seed + v * 7919);
      const g = r.gen(sr, rng, v);
      let chans: Sig[];
      if (Array.isArray(g)) chans = g;
      else {
        let it = g.next();
        while (!it.done) {
          await yieldTask();
          it = g.next();
        }
        chans = it.value;
      }
      if (r.loop) chans = chans.map((c) => makeLoop(c, sr, r.loop![0], r.loop![1]));
      if (r.room) chans = await this.room(chans, sr, r.room, rng);
      rendered.push(chans);
    }
    // joint normalisation keeps velocity layers / variants consistent
    if (r.peak) {
      let p = 0;
      for (const ch of rendered) p = Math.max(p, peakOf(ch));
      const g = p > 1e-6 ? r.peak / p : 1;
      for (const ch of rendered) for (const c of ch) for (let i = 0; i < c.length; i++) c[i] *= g;
    }
    const list: AudioBuffer[] = [];
    for (const chans of rendered) {
      const trimmed = r.loop ? chans : trim(chans, sr);
      const b = this.makeBuffer(trimmed.length, trimmed[0].length, sr);
      for (let c = 0; c < trimmed.length; c++) b.getChannelData(c).set(trimmed[c]);
      list.push(b);
      this.stats.buffers++;
      this.stats.bytes += trimmed.length * trimmed[0].length * 4;
      kb += (trimmed.length * trimmed[0].length * 4) / 1024;
    }
    this.bufs.set(r.id, list);
    this.stats.byRecipe[r.id] = [Math.round(performance.now() - t0), Math.round(kb)];
  }

  private irCache = new Map<number, AudioBuffer>();

  /** Native convolution pass (OfflineAudioContext + ConvolverNode): dry + wooden room. */
  private async room(chans: Sig[], sr: number, wet: number, rng: Rng): Promise<Sig[]> {
    const Ctor = offlineCtor();
    if (!Ctor) return chans;
    const tail = 0.5;
    const len = chans[0].length + Math.ceil(tail * sr);
    const ctx = new Ctor(chans.length, len, sr);
    const src = ctx.createBufferSource();
    const b = ctx.createBuffer(chans.length, chans[0].length, sr);
    chans.forEach((c, i) => b.getChannelData(i).set(c));
    src.buffer = b;
    let ir = this.irCache.get(sr);
    if (!ir) {
      const data = roomIR(sr, rng);
      ir = ctx.createBuffer(1, data.length, sr);
      ir.getChannelData(0).set(data);
      this.irCache.set(sr, ir);
    }
    const conv = ctx.createConvolver();
    conv.normalize = false;
    conv.buffer = ir;
    const wg = ctx.createGain();
    wg.gain.value = wet;
    src.connect(ctx.destination);
    src.connect(conv).connect(wg).connect(ctx.destination);
    src.start(0);
    const out = await renderOffline(ctx);
    lastYield = performance.now(); // awaiting the native render gave the thread back
    const res: Sig[] = [];
    for (let c = 0; c < out.numberOfChannels; c++) {
      const d = new Float32Array(out.getChannelData(c));
      dcBlock(d, sr, 15);
      fadeOut(d, sr, 0.08);
      res.push(d);
    }
    return res;
  }
}

/** Equal-power crossfade of the tail into the head: a seamless loop of `len` seconds. */
function makeLoop(s: Sig, sr: number, len: number, xf: number): Sig {
  const L = Math.round(len * sr);
  const X = Math.round(xf * sr);
  const out = new Float32Array(L);
  out.set(s.subarray(0, L));
  for (let i = 0; i < X && L + i < s.length; i++) {
    const k = i / X;
    out[i] = s[i] * Math.sin((k * Math.PI) / 2) + s[L + i] * Math.cos((k * Math.PI) / 2);
  }
  return out;
}

/** Drop trailing near-silence (-80 dB) to save memory, keep a 20 ms margin + fade. */
function trim(chans: Sig[], sr: number): Sig[] {
  const th = 1e-4;
  let end = 0;
  for (const c of chans) for (let i = c.length - 1; i > end; i--) if (Math.abs(c[i]) > th) {
    end = i;
    break;
  }
  const n = Math.min(chans[0].length, end + Math.round(0.02 * sr) + 1);
  if (n >= chans[0].length - 8) return chans;
  return chans.map((c) => fadeOut(c.slice(0, n), sr, 0.01));
}
