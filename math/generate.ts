// CLOUDBURST — Stake Engine math publication.
//
//   npm run math:generate          (full run, ~10 min on 4 cores)
//   QUICK=1 npm run math:generate  (small smoke run)
//
// Method
// ------
// 1. Pools are simulated with the real game engine (shared/engine.ts):
//      nb  = base spins that do NOT trigger the bonus (0-2 scatters)
//      T1  = rounds triggering STORM CHASE        (3 scatters)
//      T2  = rounds triggering EYE OF THE STORM   (4 scatters)
//      T3  = rounds triggering CLOUDBURST         (5 scatters)
// 2. Each pool is stratified by payout band and sampled into books
//    (tails over-sampled, weights = natural probability / books in band), so
//    every book carries its true natural probability.
// 3. A single exact correction ("tilt") moves each pool mean onto its design
//    target. Mode tables are mixtures of the pools:
//      base  = (1-p)·nb + p·Σ π_k·T_k
//      ante  = (1-5p)·nb + 5p·Σ π_k·T_k      (5x bonus chance, cost 3x)
//      bonus = T1 (cost 100x)    super = T2 (cost 400x)
//    With nb mean = RTP/2 and p = (RTP/2)/(Wb - RTP/2) both base and ante land
//    exactly on the target RTP (π_k = natural tier split of the base reels).
// 4. Weights are written as uint64 integers; the last unit of RTP error is
//    absorbed by one zero-win book so every mode is exactly 96.10%.

import { Worker } from 'node:worker_threads';
import { buildSync } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { MODES, TARGET_RTP, WINCAP, WINCAP_X, GAME_ID, GAME_VERSION, TIERS } from '../shared/game';
import { NATURAL, makeRng } from '../shared/engine';
import type { PoolKind } from './worker';

const QUICK = process.env.QUICK === '1';
const ZSTD_LEVEL = Number(process.env.ZSTD_LEVEL ?? (QUICK ? 6 : 19));
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'math', 'publish_files');
const N_WORKERS = Math.max(1, Number(process.env.WORKERS ?? 4));

const R = TARGET_RTP * 100; // target RTP in book units per unit cost (96.1)

const POOLS: Record<string, { kind: PoolKind; sims: number; seed: number }> = {
  nb: { kind: 'nb', sims: QUICK ? 1_000_000 : 24_000_000, seed: 0x0c10_0001 },
  t1: { kind: 1, sims: QUICK ? 200_000 : 8_000_000, seed: 0x0c10_0101 },
  t2: { kind: 2, sims: QUICK ? 100_000 : 4_000_000, seed: 0x0c10_0201 },
  t3: { kind: 3, sims: QUICK ? 50_000 : 1_500_000, seed: 0x0c10_0301 },
};

const k = (n: number) => (QUICK ? Math.round(n / 10) : n);
const BUDGET = {
  nb: k(100_000),
  t1Buy: k(100_000),
  t2Buy: k(100_000),
  t1Base: k(15_000),
  t2Base: k(8_000),
  t3Base: k(4_000),
};

// payout bands (book units). Band i = [EDGES[i], EDGES[i+1]).
const NB_EDGES = [0, 1, 100, 500, 2_000, 10_000, 100_000, WINCAP, WINCAP + 1];
const FS_EDGES = [0, 1_000, 3_000, 10_000, 30_000, 100_000, 300_000, WINCAP, WINCAP + 1];

// ---------------------------------------------------------------- workers

class WorkerPool {
  private workers: Worker[] = [];
  private pending = new Map<number, (v: any) => void>();
  private next = 0;
  private seq = 0;
  constructor(n: number) {
    // bundle the worker (and the shared engine) into plain JS once
    const bundle = path.join(ROOT, 'math', '.cache', 'worker.mjs');
    buildSync({
      entryPoints: [path.join(ROOT, 'math', 'worker.ts')],
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      outfile: bundle,
      logLevel: 'error',
    });
    for (let i = 0; i < n; i++) {
      const w = new Worker(bundle);
      w.on('message', (m) => {
        const cb = this.pending.get(m.id);
        this.pending.delete(m.id);
        cb?.(m);
      });
      w.on('error', (e) => {
        console.error(e);
        process.exit(1);
      });
      this.workers.push(w);
    }
  }
  run(msg: Record<string, unknown>): Promise<any> {
    const id = ++this.seq;
    const w = this.workers[this.next++ % this.workers.length];
    return new Promise((res) => {
      this.pending.set(id, res);
      w.postMessage({ ...msg, id });
    });
  }
  close() {
    this.workers.forEach((w) => w.terminate());
  }
}

async function simulatePayouts(pool: WorkerPool, kind: PoolKind, seed: number, sims: number) {
  const out = new Int32Array(sims);
  const chunk = 100_000;
  const jobs: Promise<void>[] = [];
  for (let start = 0; start < sims; start += chunk) {
    const end = Math.min(sims, start + chunk);
    jobs.push(
      pool.run({ cmd: 'payouts', pool: kind, seed, start, end }).then((m) => out.set(m.out, start)),
    );
  }
  await Promise.all(jobs);
  return out;
}

async function recordBooks(pool: WorkerPool, kind: PoolKind, seed: number, indices: number[], payouts: Int32Array) {
  const events: string[] = new Array(indices.length);
  const chunk = 2_000;
  const jobs: Promise<void>[] = [];
  for (let s = 0; s < indices.length; s += chunk) {
    const idx = indices.slice(s, s + chunk);
    jobs.push(
      pool
        .run({ cmd: 'books', pool: kind, seed, indices: idx, expected: idx.map((i) => payouts[i]) })
        .then((m) => m.events.forEach((e: string, j: number) => (events[s + j] = e))),
    );
  }
  await Promise.all(jobs);
  return events;
}

// ---------------------------------------------------------------- sampling

interface Sample {
  idx: number[]; // simulation indices
  x: number[]; // payouts (book units)
  w: number[]; // natural probability mass (sums to 1)
  bands: { lo: number; hi: number; sims: number; books: number; prob: number }[];
}

function bandOf(x: number, edges: number[]) {
  for (let b = edges.length - 2; b >= 0; b--) if (x >= edges[b]) return b;
  return 0;
}

function stratifiedSample(payouts: Int32Array, edges: number[], budget: number, minPerBand: number, seed: number): Sample {
  const nb = edges.length - 1;
  const counts = new Array(nb).fill(0);
  for (let i = 0; i < payouts.length; i++) counts[bandOf(payouts[i], edges)]++;
  const lists = counts.map((c) => new Int32Array(c));
  const fill = new Array(nb).fill(0);
  for (let i = 0; i < payouts.length; i++) {
    const b = bandOf(payouts[i], edges);
    lists[b][fill[b]++] = i;
  }
  const N = payouts.length;
  const P = counts.map((c) => c / N);

  // allocation: max(floor, proportional), capped at availability, then scale the big bands to the budget
  const target = counts.map((c, b) => Math.min(c, Math.max(Math.min(c, minPerBand), Math.round(budget * P[b]))));
  const fixed = target.map((t, b) => t <= minPerBand || t === counts[b]);
  const fixedSum = target.reduce((a, t, b) => a + (fixed[b] ? t : 0), 0);
  const flexSum = target.reduce((a, t, b) => a + (fixed[b] ? 0 : t), 0);
  const scale = flexSum > 0 ? Math.max(0, budget - fixedSum) / flexSum : 1;
  const alloc = target.map((t, b) => (fixed[b] ? t : Math.min(counts[b], Math.max(1, Math.round(t * scale)))));

  const rng = makeRng(seed, 999);
  const out: Sample = { idx: [], x: [], w: [], bands: [] };
  for (let b = 0; b < nb; b++) {
    const list = lists[b];
    const n = alloc[b];
    if (n === 0) continue;
    // partial Fisher–Yates
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(rng() * (list.length - i));
      const t = list[i];
      list[i] = list[j];
      list[j] = t;
    }
    const sel = Array.from(list.subarray(0, n)).sort((a, c) => a - c);
    for (const i of sel) {
      out.idx.push(i);
      out.x.push(payouts[i]);
      out.w.push(P[b] / n);
    }
    out.bands.push({ lo: edges[b], hi: edges[b + 1], sims: counts[b], books: n, prob: P[b] });
  }
  return out;
}

const mean = (x: number[], w: number[]) => {
  let sw = 0, swx = 0;
  for (let i = 0; i < x.length; i++) {
    sw += w[i];
    swx += w[i] * x[i];
  }
  return swx / sw;
};

/** Exact two-group tilt so that the weighted mean equals `target`. */
function tilt(s: Sample, target: number, label: string) {
  let L = 0, H = 0, mL = 0, mH = 0;
  s.x.forEach((x, i) => {
    if (x < target) {
      L += s.w[i];
      mL += s.w[i] * x;
    } else {
      H += s.w[i];
      mH += s.w[i] * x;
    }
  });
  mL /= L;
  mH /= H;
  const alpha = (H * (mH - target)) / (L * (target - mL));
  if (!(alpha > 0) || !Number.isFinite(alpha)) throw new Error(`cannot tilt ${label}`);
  const before = mean(s.x, s.w);
  const w = s.w.map((v, i) => (s.x[i] < target ? v * alpha : v));
  const tot = w.reduce((a, b) => a + b, 0);
  s.w = w.map((v) => v / tot);
  console.log(
    `  tilt ${label.padEnd(8)} natural ${(before / 100).toFixed(4)}x -> ${(mean(s.x, s.w) / 100).toFixed(4)}x  (low-group factor ${alpha.toFixed(4)})`,
  );
}

// ---------------------------------------------------------------- tables

interface Entry {
  events: string;
  x: number;
  w: number; // probability within the mode
  pool: string;
}

interface IntTable {
  ids: number[];
  W: bigint[];
  x: number[];
}

const SCALE = 1e15;

function toIntegerTable(entries: Entry[], cost: number, mode: string): IntTable {
  const W = entries.map((e) => BigInt(Math.max(1, Math.round(e.w * SCALE))));
  const x = entries.map((e) => e.x);
  let S0 = 0n, S1 = 0n;
  W.forEach((w, i) => {
    S0 += w;
    S1 += w * BigInt(x[i]);
  });
  // exact fix: RTP = S1 / (S0 * 100 * cost) = TARGET  <=>  S0 = S1 * 1000 / (96100 * cost)
  const den = BigInt(Math.round(TARGET_RTP * 1000)) * 100n * BigInt(cost);
  const S0target = (S1 * 1000n + den / 2n) / den;
  const delta = S0target - S0;
  const zero = x.findIndex((v) => v === 0);
  if (zero >= 0 && W[zero] + delta > 0n) W[zero] += delta;
  else console.warn(`  ! ${mode}: no zero-win book to absorb rounding (delta ${delta})`);
  return { ids: entries.map((_, i) => i + 1), W, x };
}

function rtpOf(t: IntTable, cost: number) {
  let S0 = 0n, S1 = 0n;
  t.W.forEach((w, i) => {
    S0 += w;
    S1 += w * BigInt(t.x[i]);
  });
  // high precision ratio
  return Number((S1 * 10n ** 12n) / (S0 * BigInt(cost) * 100n)) / 1e12;
}

async function writeBooks(file: string, entries: Entry[]) {
  const enc = zlib.createZstdCompress({
    params: { [zlib.constants.ZSTD_c_compressionLevel]: ZSTD_LEVEL, [zlib.constants.ZSTD_c_checksumFlag]: 1 },
  });
  function* lines() {
    let buf = '';
    for (let i = 0; i < entries.length; i++) {
      buf += `{"id":${i + 1},"events":${entries[i].events},"payoutMultiplier":${entries[i].x}}\n`;
      if (buf.length > 1 << 20) {
        yield buf;
        buf = '';
      }
    }
    if (buf) yield buf;
  }
  await pipeline(Readable.from(lines()), enc, fs.createWriteStream(file));
}

function writeCsv(file: string, t: IntTable) {
  const rows = t.ids.map((id, i) => `${id},${t.W[i]},${t.x[i]}`);
  fs.writeFileSync(file, rows.join('\n') + '\n');
}

// ---------------------------------------------------------------- stats

function modeStats(t: IntTable, cost: number, entries: Entry[]) {
  const tot = Number(t.W.reduce((a, b) => a + b, 0n));
  const p = t.W.map((w) => Number(w) / tot);
  let hit = 0, cap = 0, ex = 0, ex2 = 0, bonus = 0;
  const bands = [0, 1, 100, 500, 1_000, 2_000, 5_000, 10_000, 50_000, 100_000, 500_000, WINCAP, WINCAP + 1];
  const bandP = new Array(bands.length - 1).fill(0);
  const bandR = new Array(bands.length - 1).fill(0);
  const distinct = new Set<number>();
  t.x.forEach((x, i) => {
    const xm = x / 100;
    ex += p[i] * xm;
    ex2 += p[i] * xm * xm;
    if (x > 0) hit += p[i];
    if (x >= WINCAP) cap += p[i];
    if (entries[i].pool !== 'nb') bonus += p[i];
    distinct.add(x);
    const b = bandOf(x, bands);
    bandP[b] += p[i];
    bandR[b] += (p[i] * xm) / cost;
  });
  const sd = Math.sqrt(ex2 - ex * ex) / cost;
  return {
    rtp: rtpOf(t, cost),
    books: t.ids.length,
    distinctPayouts: distinct.size,
    hitRate: hit,
    stdDev: sd,
    maxWinProb: cap,
    bonusProb: bonus,
    bands: bands.slice(0, -1).map((lo, b) => ({
      from: lo / 100,
      to: bands[b + 1] / 100,
      prob: bandP[b],
      rtp: bandR[b],
    })),
  };
}

// ---------------------------------------------------------------- main

async function main() {
  const t0 = Date.now();
  fs.mkdirSync(OUT, { recursive: true });
  const pool = new WorkerPool(N_WORKERS);
  console.log(`CLOUDBURST math — ${QUICK ? 'QUICK' : 'FULL'} run, ${N_WORKERS} workers, zstd ${ZSTD_LEVEL}`);

  // 1. payouts
  const payouts: Record<string, Int32Array> = {};
  for (const [name, cfg] of Object.entries(POOLS)) {
    const t = Date.now();
    payouts[name] = await simulatePayouts(pool, cfg.kind, cfg.seed, cfg.sims);
    let s = 0;
    for (const v of payouts[name]) s += v;
    console.log(`sim ${name}: ${cfg.sims.toLocaleString()} rounds, mean ${(s / cfg.sims / 100).toFixed(4)}x (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  }

  // 2. stratified samples
  const samples = {
    nb: stratifiedSample(payouts.nb, NB_EDGES, BUDGET.nb, k(2_000), 1),
    t1Buy: stratifiedSample(payouts.t1, FS_EDGES, BUDGET.t1Buy, k(3_000), 2),
    t2Buy: stratifiedSample(payouts.t2, FS_EDGES, BUDGET.t2Buy, k(3_000), 3),
    t1Base: stratifiedSample(payouts.t1, FS_EDGES, BUDGET.t1Base, k(600), 4),
    t2Base: stratifiedSample(payouts.t2, FS_EDGES, BUDGET.t2Base, k(500), 5),
    t3Base: stratifiedSample(payouts.t3, FS_EDGES, BUDGET.t3Base, k(300), 6),
  };

  // 3. exact means
  const costOf = (name: string) => MODES.find((m) => m.name === name)!.cost;
  const E1 = R * costOf('bonus');
  const E2 = R * costOf('super');
  console.log('targets:');
  tilt(samples.nb, R / 2, 'no-bonus');
  tilt(samples.t1Buy, E1, 'T1 buy');
  tilt(samples.t2Buy, E2, 'T2 buy');
  tilt(samples.t1Base, E1, 'T1 base');
  tilt(samples.t2Base, E2, 'T2 base');
  const E3 = mean(samples.t3Base.x, samples.t3Base.w); // natural (no buy mode for tier 3)
  console.log(`  T3 natural mean ${(E3 / 100).toFixed(2)}x`);

  const pi = NATURAL.tierSplit;
  const Wb = pi[1] * E1 + pi[2] * E2 + pi[3] * E3;
  const p = R / 2 / (Wb - R / 2);
  console.log(
    `bonus mix Wb=${(Wb / 100).toFixed(3)}x  p(base)=1/${(1 / p).toFixed(2)}  p(ante)=1/${(1 / (5 * p)).toFixed(2)}  ` +
      `(natural reels 1/${(1 / NATURAL.pTrigger).toFixed(2)})`,
  );

  // 4. books
  const record = async (s: Sample, poolName: string) => {
    const cfg = POOLS[poolName];
    const t = Date.now();
    const ev = await recordBooks(pool, cfg.kind, cfg.seed, s.idx, payouts[poolName]);
    console.log(`books ${poolName}: ${s.idx.length.toLocaleString()} recorded (${((Date.now() - t) / 1000).toFixed(1)}s)`);
    return s.idx.map((_, i): Entry => ({ events: ev[i], x: s.x[i], w: s.w[i], pool: poolName }));
  };
  const nbE = await record(samples.nb, 'nb');
  const t1BaseE = await record(samples.t1Base, 't1');
  const t2BaseE = await record(samples.t2Base, 't2');
  const t3BaseE = await record(samples.t3Base, 't3');
  const t1BuyE = await record(samples.t1Buy, 't1');
  const t2BuyE = await record(samples.t2Buy, 't2');
  pool.close();

  const mix = (boost: number): Entry[] => [
    ...nbE.map((e) => ({ ...e, w: e.w * (1 - boost * p) })),
    ...t1BaseE.map((e) => ({ ...e, w: e.w * boost * p * pi[1] })),
    ...t2BaseE.map((e) => ({ ...e, w: e.w * boost * p * pi[2] })),
    ...t3BaseE.map((e) => ({ ...e, w: e.w * boost * p * pi[3] })),
  ];

  const modeEntries: Record<string, Entry[]> = {
    base: mix(1),
    ante: mix(MODES.find((m) => m.name === 'ante')!.boost!),
    bonus: t1BuyE,
    super: t2BuyE,
  };

  // 5. write files
  for (const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, f));
  const index = { modes: [] as { name: string; cost: number; events: string; weights: string }[] };
  const stats: Record<string, ReturnType<typeof modeStats> & { cost: number }> = {};
  const writes: Promise<void>[] = [];
  let baseBooks = '';
  for (const m of MODES) {
    const entries = modeEntries[m.name];
    const table = toIntegerTable(entries, m.cost, m.name);
    const events = `books_${m.name}.jsonl.zst`;
    const weights = `lookUpTable_${m.name}_0.csv`;
    index.modes.push({ name: m.name, cost: m.cost, events, weights });
    writeCsv(path.join(OUT, weights), table);
    stats[m.name] = { cost: m.cost, ...modeStats(table, m.cost, entries) };
    // base and ante share the exact same books (only weights differ)
    if (m.name === 'ante') continue;
    const file = path.join(OUT, events);
    if (m.name === 'base') baseBooks = file;
    writes.push(writeBooks(file, entries));
  }
  await Promise.all(writes);
  fs.copyFileSync(baseBooks, path.join(OUT, 'books_ante.jsonl.zst'));
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n');

  // 6. summary for the frontend + report
  const summary = {
    game: GAME_ID,
    version: GAME_VERSION,
    targetRtp: TARGET_RTP,
    maxWinX: WINCAP_X,
    bonusOdds: { base: 1 / stats.base.bonusProb, ante: 1 / stats.ante.bonusProb },
    tierSplit: pi,
    modes: Object.fromEntries(
      Object.entries(stats).map(([name, s]) => [
        name,
        {
          cost: s.cost,
          rtp: Number(s.rtp.toFixed(6)),
          hitRate: Number(s.hitRate.toFixed(6)),
          maxWinOdds: s.maxWinProb > 0 ? Math.round(1 / s.maxWinProb) : null,
        },
      ]),
    ),
  };
  fs.writeFileSync(path.join(ROOT, 'shared', 'math-summary.json'), JSON.stringify(summary, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, 'math', 'stats.json'), JSON.stringify({ summary, stats, design: { p, Wb, E1, E2, E3 } }, null, 2) + '\n');

  console.log('\nmode     cost   RTP        hit      sd      max win odds     bonus odds   books');
  for (const [name, s] of Object.entries(stats)) {
    console.log(
      `${name.padEnd(8)} ${String(s.cost).padStart(4)}  ${(s.rtp * 100).toFixed(6)}%  ${(s.hitRate * 100).toFixed(2).padStart(6)}%  ${s.stdDev
        .toFixed(2)
        .padStart(6)}  1/${Math.round(1 / s.maxWinProb).toLocaleString().padEnd(12)}  ${
        name === 'base' || name === 'ante' ? '1/' + (1 / s.bonusProb).toFixed(1) : '-'
      }`.padEnd(98) + s.books.toLocaleString(),
    );
  }
  for (const f of fs.readdirSync(OUT)) console.log(`  ${f.padEnd(28)} ${(fs.statSync(path.join(OUT, f)).size / 1e6).toFixed(2)} MB`);
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s — tiers: ${Object.values(TIERS).map((t) => t.key).join(', ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
