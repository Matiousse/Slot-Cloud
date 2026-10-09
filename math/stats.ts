// Quick natural statistics of the current reels/paytable (used while tuning).
//   npx tsx math/stats.ts [nonBonusSims] [bonusSims]
import { Engine, makeRng, NATURAL, BASE_SET } from '../shared/engine';
import { MODES, TARGET_RTP, WINCAP, type Tier } from '../shared/game';

const nNB = Number(process.argv[2] ?? 2_000_000);
const nB = Number(process.argv[3] ?? 200_000);

const eng = new Engine(makeRng(12345));

function summarize(label: string, xs: Float64Array) {
  let sum = 0, sum2 = 0, hits = 0, cap = 0, big = 0, max = 0;
  for (const x of xs) {
    sum += x; sum2 += x * x;
    if (x > 0) hits++;
    if (x >= WINCAP) cap++;
    if (x >= 100_000) big++;
    if (x > max) max = x;
  }
  const n = xs.length;
  const sorted = Float64Array.from(xs).sort();
  const pct = (q: number) => sorted[Math.floor(q * (n - 1))] / 100;
  let tail = 0;
  for (const x of xs) if (x >= 100_000) tail += x;
  const mean = sum / n / 100;
  const sd = Math.sqrt(sum2 / n / 1e4 - mean * mean);
  console.log(
    `${label.padEnd(12)} mean=${mean.toFixed(4)}x sd=${sd.toFixed(2)} hit=${((hits / n) * 100).toFixed(2)}% ` +
      `>=1000x: 1/${big ? Math.round(n / big) : '-'} maxwin: ${cap} (1/${cap ? Math.round(n / cap) : '-'}) max=${max / 100}x\n` +
      `             p50=${pct(0.5)}x p75=${pct(0.75)}x p90=${pct(0.9)}x p99=${pct(0.99)}x  rtp-share>=1000x ${((tail / sum) * 100).toFixed(1)}%`,
  );
  return mean;
}

console.log('scatter visible prob per reel:', BASE_SET.q.map((q) => q.toFixed(4)).join(' '));
console.log(
  `natural trigger 1/${(1 / NATURAL.pTrigger).toFixed(1)}  split T1=${(NATURAL.tierSplit[1] * 100).toFixed(2)}% ` +
    `T2=${(NATURAL.tierSplit[2] * 100).toFixed(3)}% T3=${(NATURAL.tierSplit[3] * 100).toFixed(4)}%`,
);

let t0 = Date.now();
const nb = new Float64Array(nNB);
for (let i = 0; i < nNB; i++) nb[i] = eng.noBonus().payout;
const w = summarize('no-bonus', nb);
console.log(`  (${((Date.now() - t0) / nNB * 1e3).toFixed(2)} us/spin)`);

const tierMean: Record<number, number> = {};
for (const t of [1, 2, 3] as Tier[]) {
  t0 = Date.now();
  const xs = new Float64Array(nB);
  for (let i = 0; i < nB; i++) xs[i] = eng.bonus(t).payout;
  tierMean[t] = summarize(`T${t}`, xs);
  console.log(`  (${((Date.now() - t0) / nB * 1e3).toFixed(1)} us/bonus)`);
}

const Wb = [1, 2, 3].reduce((a, t) => a + NATURAL.tierSplit[t as Tier] * tierMean[t], 0);
const natRtp = NATURAL.pNoBonus * w + NATURAL.pTrigger * Wb;
console.log(`\nnatural base RTP ~ ${(natRtp * 100).toFixed(2)}%  (no-bonus ${(NATURAL.pNoBonus * w * 100).toFixed(2)}%, bonus ${(NATURAL.pTrigger * Wb * 100).toFixed(2)}%)`);
const half = TARGET_RTP / 2;
const p = half / (Wb - half);
console.log(`design: w target ${half.toFixed(4)} (have ${w.toFixed(4)}), Wb=${Wb.toFixed(2)} -> p=1/${(1 / p).toFixed(1)} (natural 1/${(1 / NATURAL.pTrigger).toFixed(1)})`);
for (const m of MODES.filter((m) => m.kind === 'buy'))
  console.log(`buy ${m.name}: target mean ${(m.cost * TARGET_RTP).toFixed(2)}x, natural T${m.tier} ${tierMean[m.tier!].toFixed(2)}x`);

// breakdown of the no-bonus game by number of Storm Wilds
{
  const acc = [0, 0, 0, 0], cnt = [0, 0, 0, 0];
  const n = 1_000_000;
  for (let i = 0; i < n; i++) {
    const r = eng.noBonus();
    acc[r.storms] += r.payout;
    cnt[r.storms]++;
  }
  for (let k = 0; k <= 3; k++)
    console.log(`storms=${k}: freq ${(cnt[k] / n * 100).toFixed(3)}%  rtp ${(acc[k] / n / 100 * 100).toFixed(2)}%  avg ${(acc[k] / Math.max(1, cnt[k]) / 100).toFixed(2)}x`);
}
