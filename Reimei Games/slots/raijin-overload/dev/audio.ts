// Audio lab: buttons for every sound (live engine) + offline verification.
//
// window.__runChecks(opts?) renders every sound and ~8 bars of each music mode through
// the real engine graph (master chain included) on OfflineAudioContexts, checks for NaN,
// peak <= 0.98, sane RMS / duration, and stores a JSON report in window.__audioReport.
// window.__wav(name) returns a base64 16-bit WAV of a kept render (opts.keep = true).
//
//   node dev/shoot.cjs "http://127.0.0.1:5199/dev/audio.html" --plan "eval:await window.__runChecks();;eval:console.warn(JSON.stringify(window.__audioReport))"

import { AudioEngine, audio } from '../src/audio/audio';
import { Bank, RECIPES } from '../src/audio/bank';
import { MusicPlayer } from '../src/audio/music';

type Fn = (e: AudioEngine) => void;
interface Case {
  name: string;
  dur: number;
  fn: Fn;
  /** expected audible duration range (s) */
  len?: [number, number];
  minRms?: number;
  music?: boolean;
  /** dev: solo one music strip */
  solo?: string;
}

const BAR_BASE = (60 / 92) * 4;
const BAR_FS = (60 / 128) * 4;

const CASES: Case[] = [
  { name: 'click', dur: 0.5, fn: (e) => e.click(), len: [0.03, 0.4], minRms: 0.002 },
  { name: 'spinStart', dur: 1, fn: (e) => e.spinStart(), len: [0.25, 1] },
  {
    name: 'spin cycle (start + 5 stops)', dur: 2.2, len: [1, 2.2],
    fn: (e) => { e.spinStart(); for (let i = 0; i < 5; i++) { e.at(0.45 + i * 0.15); e.reelStop(i); } },
  },
  { name: 'ambience storm', dur: 9, minRms: 0.003, fn: (e) => e.ambience(1), len: [7, 9] },
  ...[0, 1, 2, 3, 4].map<Case>((i) => ({ name: `reelStop${i}`, dur: 0.8, fn: (e) => e.reelStop(i), len: [0.08, 0.8] })),
  {
    name: 'tick x12', dur: 1.2, len: [0.6, 1.2], minRms: 0.002,
    fn: (e) => { for (let i = 0; i < 12; i++) { e.at(0.05 + i * 0.075); e.tick(); } },
  },
  { name: 'error', dur: 1, fn: (e) => e.error(), len: [0.2, 1] },
  ...[1, 2, 3, 4, 5].map<Case>((n) => ({ name: `drum${n}`, dur: 4.5, fn: (e) => e.drum(n), len: [0.6, 4.5] })),
  {
    name: 'anticipation 3s', dur: 4, len: [2.5, 4],
    fn: (e) => { e.anticipationStart(); e.at(3.05); e.anticipationStop(); },
  },
  { name: 'thunder 1', dur: 7, fn: (e) => e.thunder(1), len: [2, 7] },
  { name: 'thunder 0.4', dur: 7, fn: (e) => e.thunder(0.4), len: [1.5, 7] },
  { name: 'rumble 0.6', dur: 5.5, fn: (e) => e.rumble(0.6), len: [1.5, 5.5] },
  { name: 'charge', dur: 1.2, fn: (e) => e.charge(), len: [0.35, 1.2] },
  ...[2, 10, 100].map<Case>((m) => ({ name: `strikeHit x${m}`, dur: 6, fn: (e) => e.strikeHit(m), len: [1, 6] })),
  ...[2, 10, 100].map<Case>((m) => ({ name: `multiplier x${m}`, dur: 4, fn: (e) => e.multiplier(m), len: [0.8, 4] })),
  { name: 'storm x25', dur: 6, fn: (e) => e.storm(25), len: [1.5, 6] },
  {
    name: 'strike sequence', dur: 6, len: [2, 6],
    fn: (e) => { e.charge(); e.at(0.52); e.strikeHit(5); e.at(1.6); e.multiplier(5); },
  },
  { name: 'roar', dur: 3.5, fn: (e) => e.roar(), len: [1.8, 3.5] },
  { name: 'servo', dur: 1, fn: (e) => e.servo(), len: [0.25, 1] },
  ...[0, 1, 2, 3].map<Case>((l) => ({ name: `win${l}`, dur: 4, fn: (e) => e.win(l), len: [0.3, 4] })),
  ...[0, 1, 2, 3, 4].map<Case>((t) => ({ name: `bigWin${t}`, dur: t === 4 ? 8.5 : 6, fn: (e) => e.bigWin(t), len: [2, 8.5] })),
  { name: 'fsTrigger', dur: 7, fn: (e) => e.fsTrigger(), len: [3, 7] },
  { name: 'retrigger', dur: 3.5, fn: (e) => e.retrigger(), len: [0.8, 3.5] },
  { name: 'coins', dur: 2.5, fn: (e) => e.coins(), len: [0.6, 2.5] },
  { name: 'music base 16 bars', dur: BAR_BASE * 16 + 0.5, music: true, minRms: 0.02, fn: (e) => e.setMusic('base') },
  ...[1, 2, 3].map<Case>((tier) => ({ name: `music fs tier${tier} 8 bars`, dur: BAR_FS * 8 + 0.5, music: true, minRms: 0.03, fn: (e) => e.setMusic('fs', tier as 1 | 2 | 3) })),
  {
    name: 'music crossfade base->fs3->base', dur: 16, music: true, minRms: 0.02,
    fn: (e) => { e.setMusic('base'); e.at(5); e.setMusic('fs', 3); e.at(11); e.setMusic('base'); },
  },
  {
    name: 'STRESS fs3 + strikes + bigWin4 + thunder', dur: 10, music: true, minRms: 0.03,
    fn: (e) => {
      e.setMusic('fs', 3); e.ambience(1.6);
      e.at(0.5); e.charge(); e.at(0.96); e.strikeHit(100); e.thunder(1.5);
      e.at(1.2); e.charge(); e.at(1.66); e.strikeHit(50); e.multiplier(100);
      e.at(2); e.bigWin(4); e.roar(); e.fsTrigger(); e.drum(5);
      e.at(3); e.bigWin(3); e.win(3); e.coins();
    },
  },
];

interface Result {
  name: string;
  ok: boolean;
  issues: string[];
  peak: number;
  rms: number;
  loud: number;
  nan: number;
  len: number;
  start: number;
  dc: number;
  clipped: number;
  ms: number;
}

declare global {
  interface Window {
    __ready?: boolean;
    __runChecks?: (o?: { keep?: boolean; only?: string; raw?: boolean; stems?: boolean }) => Promise<unknown>;
    __audioReport?: unknown;
    __wav?: (name: string) => string;
    __names?: () => string[];
    __bankWav?: (id: string, v?: number) => string;
    __bankIds?: () => [string, number][];
  }
}

const kept = new Map<string, AudioBuffer>();
let bank: Bank | null = null;

function analyze(name: string, b: AudioBuffer, c: Case, ms: number): Result {
  const sr = b.sampleRate;
  let peak = 0, sum = 0, nan = 0, dcs = 0, clipped = 0, first = -1, last = -1;
  const n = b.length;
  const chs = Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i));
  const th = 0.0032; // -50 dBFS
  for (let i = 0; i < n; i++) {
    for (const d of chs) {
      const v = d[i];
      if (!Number.isFinite(v)) {
        nan++;
        continue;
      }
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a >= 0.97) clipped++;
      sum += v * v;
      dcs += v;
      if (a > th) {
        if (first < 0) first = i;
        last = i;
      }
    }
  }
  const rms = Math.sqrt(sum / (n * chs.length));
  // loudest 400 ms window RMS (short-term loudness proxy)
  const win = Math.round(0.4 * sr);
  let loud = 0;
  for (let i = 0; i + win <= n; i += Math.round(win / 4)) {
    let s = 0;
    for (const d of chs) for (let j = i; j < i + win; j++) s += d[j] * d[j];
    loud = Math.max(loud, Math.sqrt(s / (win * chs.length)));
  }
  const len = first < 0 ? 0 : (last - first) / sr;
  const issues: string[] = [];
  if (nan) issues.push(`${nan} NaN`);
  if (peak > 0.98) issues.push(`peak ${peak.toFixed(3)} > 0.98`);
  if (rms < (c.minRms ?? 0.004)) issues.push(`rms ${rms.toFixed(4)} too low`);
  if (c.len && (len < c.len[0] || len > c.len[1] + 0.01)) issues.push(`audible ${len.toFixed(2)}s outside [${c.len[0]}, ${c.len[1]}]`);
  if (Math.abs(dcs / (n * chs.length)) > 0.01) issues.push('DC offset');
  return {
    name, ok: issues.length === 0, issues, peak: +peak.toFixed(4), rms: +rms.toFixed(4), loud: +loud.toFixed(4), nan,
    len: +len.toFixed(3), start: +(first / sr).toFixed(3), dc: +(dcs / (n * chs.length)).toFixed(5), clipped, ms: Math.round(ms),
  };
}

const STEMS = ['odaiko', 'nagado', 'shime', 'ka', 'chappa', 'koto', 'sham', 'shaku', 'bass', 'choir', 'drone'];
const stemCases = (): Case[] =>
  STEMS.flatMap((k) => [
    { name: `stem base ${k}`, dur: BAR_BASE * 16 + 0.5, music: true, minRms: 0, fn: (e: AudioEngine) => e.setMusic('base'), solo: k },
    { name: `stem fs3 ${k}`, dur: BAR_FS * 8 + 0.5, music: true, minRms: 0, fn: (e: AudioEngine) => e.setMusic('fs', 3), solo: k },
  ]);

async function runChecks(o: { keep?: boolean; only?: string; raw?: boolean; stems?: boolean } = {}) {
  const SR = 44100;
  const status = document.getElementById('status')!;
  const t0 = performance.now();
  if (!bank) {
    status.textContent = 'rendering sound bank…';
    bank = new Bank(SR, (ch, len, sr) => new AudioBuffer({ numberOfChannels: ch, length: len, sampleRate: sr }));
    await bank.renderAll();
  }
  const results: Result[] = [];
  for (const c of o.stems ? stemCases() : CASES) {
    if (o.only && !c.name.includes(o.only)) continue;
    MusicPlayer.solo = c.solo ?? null;
    status.textContent = `rendering ${c.name}…`;
    const ts = performance.now();
    const ctx = new OfflineAudioContext(2, Math.ceil(c.dur * SR), SR);
    const e = new AudioEngine();
    e.sfxOn = true;
    e.musicOn = true;
    e.attachOffline(ctx, bank);
    e.at(0.05);
    c.fn(e);
    if (c.music) e.flushMusic(c.dur);
    const buf = await ctx.startRendering();
    const r = analyze(c.name, buf, c, performance.now() - ts);
    results.push(r);
    specs.set(c.name, spectrogram(buf));
    if (o.keep) kept.set(c.name, buf);
  }
  MusicPlayer.solo = null;
  const report = {
    ok: results.every((r) => r.ok),
    failed: results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.issues.join(', ')}`),
    bank: bank.stats,
    totalMs: Math.round(performance.now() - t0),
    results,
  };
  window.__audioReport = report;
  renderTable(results);
  document.getElementById('report')!.textContent = JSON.stringify({ ...report, results: undefined }, null, 2);
  status.textContent = report.ok ? `all ${results.length} checks passed` : `${report.failed.length} check(s) failed`;
  return report;
}

const specs = new Map<string, string>();

/** in-place radix-2 FFT */
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    const wr = Math.cos(a);
    const wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** log-frequency spectrogram thumbnail (data URL) */
function spectrogram(b: AudioBuffer, W = 260, H = 54): string {
  const N = 1024;
  const sr = b.sampleRate;
  const L = b.getChannelData(0);
  const R = b.numberOfChannels > 1 ? b.getChannelData(1) : L;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(W, H);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const fLo = Math.log(30);
  const fHi = Math.log(16000);
  for (let x = 0; x < W; x++) {
    const start = Math.floor((x / W) * Math.max(0, b.length - N));
    for (let i = 0; i < N; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
      re[i] = ((L[start + i] ?? 0) + (R[start + i] ?? 0)) * 0.5 * w;
      im[i] = 0;
    }
    fft(re, im);
    for (let y = 0; y < H; y++) {
      const f = Math.exp(fHi - ((fHi - fLo) * y) / (H - 1));
      const k = Math.min(N / 2 - 1, Math.max(1, Math.round((f * N) / sr)));
      const mag = Math.hypot(re[k], im[k]) / (N / 4); // full-scale sine ≈ 0 dB
      const db = 20 * Math.log10(mag + 1e-9);
      const v = Math.max(0, Math.min(1, (db + 84) / 80));
      const o = (y * W + x) * 4;
      // magma-like ramp: indigo -> crimson -> gold -> white
      img.data[o] = Math.min(255, 40 + 420 * v);
      img.data[o + 1] = Math.min(255, 255 * Math.max(0, v * 1.6 - 0.55));
      img.data[o + 2] = Math.min(255, 70 + 160 * Math.sin(Math.PI * Math.min(1, v * 1.2)) + 255 * Math.max(0, v - 0.85) * 4);
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv.toDataURL();
}

function renderTable(rs: Result[]) {
  const rows = rs
    .map((r) => `<tr><td class="${r.ok ? 'pass' : 'fail'}">${r.ok ? '✔' : '✘'} ${r.name}</td><td><img class="spec" src="${specs.get(r.name) ?? ''}"></td><td>${r.peak}</td><td>${r.rms}</td><td>${r.loud}</td><td>${r.len}</td><td>${r.clipped}</td><td>${r.ms}</td><td class="fail">${r.issues.join(', ')}</td></tr>`)
    .join('');
  document.getElementById('table')!.innerHTML = `<table><tr><th>case</th><th>spectrogram (log f, 30 Hz–16 kHz)</th><th>peak</th><th>rms</th><th>loud400ms</th><th>audible s</th><th>≥0.97</th><th>ms</th><th>issues</th></tr>${rows}</table>`;
}

function wav(name: string): string {
  const b = kept.get(name);
  if (!b) throw new Error('not kept: ' + name);
  return encodeWav(b);
}

/** raw bank buffer as WAV (sound design inspection) */
function bankWav(id: string, v = 0): string {
  const b = bank?.get(id, v);
  if (!b) throw new Error('no bank buffer: ' + id);
  return encodeWav(b);
}

function encodeWav(b: AudioBuffer): string {
  const ch = b.numberOfChannels;
  const n = b.length;
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  data.setUint32(4, 36 + n * ch * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, ch, true);
  data.setUint32(24, b.sampleRate, true);
  data.setUint32(28, b.sampleRate * ch * 2, true);
  data.setUint16(32, ch * 2, true);
  data.setUint16(34, 16, true);
  str(36, 'data');
  data.setUint32(40, n * ch * 2, true);
  const chs = Array.from({ length: ch }, (_, i) => b.getChannelData(i));
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      data.setInt16(o, Math.max(-32768, Math.min(32767, Math.round(chs[c][i] * 32767))), true);
      o += 2;
    }
  const bytes = new Uint8Array(data.buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// ------------------------------------------------------------------ live buttons

const groups: [string, [string, () => void][]][] = [
  ['UI & reels', [
    ['click', () => audio.click()], ['spinStart', () => audio.spinStart()],
    ['spin → 5 stops', () => { audio.spinStart(); [0, 1, 2, 3, 4].forEach((i) => setTimeout(() => audio.reelStop(i), 600 + i * 150)); }],
    ...[0, 1, 2, 3, 4].map<[string, () => void]>((i) => [`reelStop(${i})`, () => audio.reelStop(i)]),
    ['stop sequence', () => [0, 1, 2, 3, 4].forEach((i) => setTimeout(() => audio.reelStop(i), i * 150))],
    ['tick x12', () => { for (let i = 0; i < 12; i++) setTimeout(() => audio.tick(), i * 75); }],
    ['error', () => audio.error()],
  ]],
  ['Drums & anticipation', [
    ...[1, 2, 3, 4, 5].map<[string, () => void]>((n) => [`drum(${n})`, () => audio.drum(n)]),
    ['anticipationStart', () => audio.anticipationStart()], ['anticipationStop', () => audio.anticipationStop()],
  ]],
  ['Storm & Raijin', [
    ['thunder(1)', () => audio.thunder(1)], ['thunder(0.4)', () => audio.thunder(0.4)], ['rumble(0.6)', () => audio.rumble(0.6)],
    ['charge', () => audio.charge()], ['strikeHit(2)', () => audio.strikeHit(2)], ['strikeHit(10)', () => audio.strikeHit(10)], ['strikeHit(100)', () => audio.strikeHit(100)],
    ['charge → strike → x5', () => { audio.charge(); setTimeout(() => audio.strikeHit(5), 470); setTimeout(() => audio.multiplier(5), 1500); }],
    ['multiplier(2)', () => audio.multiplier(2)], ['multiplier(10)', () => audio.multiplier(10)], ['multiplier(100)', () => audio.multiplier(100)],
    ['storm(25)', () => audio.storm(25)], ['roar', () => audio.roar()], ['servo', () => audio.servo()],
  ]],
  ['Wins & bonus', [
    ...[0, 1, 2, 3].map<[string, () => void]>((l) => [`win(${l})`, () => audio.win(l)]),
    ...['BIG', 'MEGA', 'EPIC', 'LEGENDARY', 'MAX'].map<[string, () => void]>((n, i) => [`bigWin(${i}) ${n}`, () => audio.bigWin(i)]),
    ['fsTrigger', () => audio.fsTrigger()], ['retrigger', () => audio.retrigger()], ['coins', () => audio.coins()],
  ]],
  ['Music', [
    ['none', () => audio.setMusic('none')], ['base', () => audio.setMusic('base')],
    ['fs tier 1', () => audio.setMusic('fs', 1)], ['fs tier 2', () => audio.setMusic('fs', 2)], ['fs tier 3', () => audio.setMusic('fs', 3)],
    ['toggle music', () => audio.setMusicOn(!audio.musicOn)], ['toggle sfx', () => audio.setSfx(!audio.sfxOn)],
    ['ambience off', () => audio.ambience(0)], ['ambience base', () => audio.ambience(1)], ['ambience bonus', () => audio.ambience(1.6)],
  ]],
];

const panels = document.getElementById('panels')!;
for (const [title, items] of groups) {
  const sec = document.createElement('section');
  sec.innerHTML = `<h2>${title}</h2>`;
  const row = document.createElement('div');
  row.className = 'row';
  for (const [label, fn] of items) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => {
      audio.unlock();
      fn();
      const s = audio.bankStats;
      document.getElementById('status')!.textContent = s ? `bank: ${s.buffers} buffers, ${(s.bytes / 1048576).toFixed(1)} MB, ${s.ms || '…'} ms` : '';
    };
    row.appendChild(b);
  }
  sec.appendChild(row);
  panels.appendChild(sec);
}
document.getElementById('run')!.onclick = () => void runChecks();

window.__runChecks = runChecks;
(window as unknown as { __audio: AudioEngine }).__audio = audio;
window.__wav = wav;
window.__bankWav = bankWav;
window.__bankIds = () => RECIPES.map((r) => [r.id, r.variants]);
window.__names = () => CASES.map((c) => c.name);
// dev: note log of the music sequencer
(window as unknown as { __musicLog: (mode: 'base' | 'fs', tier: number, sec: number) => unknown }).__musicLog = (mode, tier, sec) => {
  if (!bank) throw new Error('run checks first');
  const ctx = new OfflineAudioContext(2, 44100, 44100);
  const e = new AudioEngine();
  e.attachOffline(ctx, bank);
  e.at(0);
  MusicPlayer.log = [];
  e.setMusic(mode, tier as 1 | 2 | 3);
  e.flushMusic(sec);
  const log = MusicPlayer.log;
  MusicPlayer.log = null;
  return log;
};
window.__ready = true;
