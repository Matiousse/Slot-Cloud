// Independent verification of the Stake Engine publish files.
//
//   npm run math:verify
//
// Reads ONLY math/publish_files (+ the rule constants of shared/game.ts) and
// re-checks every single book: file formats, ids, CSV/books payout match,
// line wins re-evaluated from the board, Storm Wild multipliers, free spin
// counters, max win cap and final payout. Then recomputes RTP, hit rate,
// volatility and max-win odds of every mode from the lookup tables, and writes
// math/REPORT.md.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  GAME_NAME,
  PAYLINES,
  PAYTABLE,
  REELS,
  ROWS,
  RETRIGGER_SCATTERS,
  RETRIGGER_SPINS,
  S,
  SYMBOLS,
  TARGET_RTP,
  TIERS,
  WINCAP,
  WINCAP_X,
  type Book,
  type SymbolCode,
} from '../shared/game';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'math', 'publish_files');

const errors: string[] = [];
const fail = (msg: string) => {
  if (errors.length < 50) console.error('  ✗ ' + msg);
  errors.push(msg);
};

const VALID = new Set<string>(SYMBOLS);
const wild = (c: string) => c === 'WD' || c === 'SW';

function decodeBoard(board: string[]): SymbolCode[][] | null {
  if (!Array.isArray(board) || board.length !== REELS) return null;
  const out: SymbolCode[][] = [];
  for (const col of board) {
    if (typeof col !== 'string' || col.length !== ROWS * 2) return null;
    const c: SymbolCode[] = [];
    for (let i = 0; i < col.length; i += 2) {
      const code = col.slice(i, i + 2);
      if (!VALID.has(code)) return null;
      c.push(code as SymbolCode);
    }
    out.push(c);
  }
  return out;
}

/** Independent payline evaluation. */
function evaluate(board: SymbolCode[][], mult: number[]) {
  const wins: [number, string, number, number, number][] = [];
  let total = 0;
  PAYLINES.forEach((line, li) => {
    const s0 = board[0][line[0]];
    if (s0 === 'SC' || wild(s0)) return;
    let count = 1;
    let m = 1;
    for (let r = 1; r < REELS; r++) {
      const expanded = mult[r] > 0;
      const sym = expanded ? 'SW' : board[r][line[r]];
      if (sym === s0 || wild(sym)) {
        count++;
        if (expanded) m *= mult[r];
      } else break;
    }
    if (count >= 3) {
      const win = PAYTABLE[S[s0 as keyof typeof S]][count - 3] * m;
      wins.push([li, s0, count, m, win]);
      total += win;
    }
  });
  return { wins, total };
}

function checkBook(book: Book, where: string) {
  const ev = book.events;
  if (!Array.isArray(ev) || ev.length === 0) return fail(`${where}: no events`);
  let total = 0;
  let inFs = false;
  let tier = 0;
  let fsTotal = 0;
  let fsPlayed = 0;
  let capped = false;
  let sticky = [0, 0, 0, 0, 0];
  let pendingScatter = 0;
  let sawFinal = false;
  ev.forEach((e: any, i: number) => {
    if (e.index !== i) fail(`${where}: event index ${e.index} != ${i}`);
    switch (e.type) {
      case 'spin': {
        if (capped) fail(`${where}: spin after max win`);
        const b = decodeBoard(e.board);
        if (!b) return fail(`${where}: bad board`);
        if ((e.gameType === 'free') !== inFs) fail(`${where}: gameType mismatch`);
        if (inFs) {
          fsPlayed++;
          if (!e.fs || e.fs[0] !== fsPlayed || e.fs[1] !== fsTotal) fail(`${where}: fs counter ${JSON.stringify(e.fs)} expected [${fsPlayed},${fsTotal}]`);
        } else if (i !== 0) fail(`${where}: base spin not first`);
        const mult = [0, 0, 0, 0, 0];
        for (const [reel, row, m] of e.storm ?? []) {
          if (reel < 1 || reel > 3 || !(m >= 2)) fail(`${where}: bad storm ${reel},${row},${m}`);
          if (row === -1) {
            if (!sticky[reel] || sticky[reel] !== m) fail(`${where}: sticky storm mismatch reel ${reel}`);
            if (b[reel].some((c) => c !== 'SW')) fail(`${where}: sticky reel not fully wild`);
          } else {
            if (b[reel][row] !== 'SW') fail(`${where}: storm not on board`);
            if (sticky[reel]) fail(`${where}: storm landed on sticky reel`);
            if (inFs && TIERS[tier as 1 | 2 | 3].sticky) sticky[reel] = m;
          }
          mult[reel] = m;
        }
        for (let r = 0; r < REELS; r++) {
          const hasSw = b[r].includes('SW');
          if (hasSw && !mult[r]) fail(`${where}: Storm Wild on reel ${r + 1} without expansion`);
          if (hasSw && (r === 0 || r === 4)) fail(`${where}: Storm Wild on outer reel`);
          if (b[r].filter((c) => c === 'SC').length > 1) fail(`${where}: two scatters on one reel`);
        }
        for (let r = 1; r <= 3; r++) if (sticky[r] && !mult[r]) fail(`${where}: sticky reel ${r} missing`);
        if (inFs && TIERS[tier as 1 | 2 | 3].guaranteedStorm && !mult.some((m) => m > 0)) {
          const scReels = [1, 2, 3].filter((r) => b[r].includes('SC')).length;
          if (scReels < 3) fail(`${where}: Storm Chase spin without Storm Wild`);
        }
        const res = evaluate(b, mult);
        const got = e.wins ?? [];
        if (JSON.stringify(got) !== JSON.stringify(res.wins)) fail(`${where}: wins mismatch\n    got ${JSON.stringify(got)}\n    exp ${JSON.stringify(res.wins)}`);
        if (e.win !== res.total) fail(`${where}: spin win ${e.win} != ${res.total}`);
        total = Math.min(WINCAP, total + res.total);
        if (e.total !== total) fail(`${where}: running total ${e.total} != ${total}`);
        if (total >= WINCAP) capped = true;
        pendingScatter = b.flat().filter((c) => c === 'SC').length;
        if (!inFs && pendingScatter >= 3 && !capped) {
          const next = ev[i + 1] as any;
          const expTier = pendingScatter >= 5 ? 3 : pendingScatter === 4 ? 2 : 1;
          if (next?.type !== 'freeSpinTrigger' || next.tier !== expTier) fail(`${where}: missing/wrong trigger`);
        }
        if (inFs && pendingScatter >= RETRIGGER_SCATTERS && !capped) {
          const next = ev[i + 1] as any;
          if (next?.type !== 'freeSpinRetrigger') fail(`${where}: missing retrigger`);
        }
        if (inFs && !capped && fsPlayed === fsTotal) {
          const next = ev[i + 1] as any;
          if (!(next?.type === 'freeSpinEnd' || next?.type === 'freeSpinRetrigger')) fail(`${where}: free spins did not end`);
        }
        break;
      }
      case 'freeSpinTrigger':
        if (inFs) fail(`${where}: nested trigger`);
        inFs = true;
        tier = e.tier;
        fsTotal = e.spins;
        if (e.spins !== TIERS[e.tier as 1 | 2 | 3].spins) fail(`${where}: wrong spin count`);
        if (pendingScatter !== TIERS[e.tier as 1 | 2 | 3].scatters && !(e.tier === 3 && pendingScatter >= 5)) fail(`${where}: trigger tier vs scatters`);
        break;
      case 'startingWild':
        if (!TIERS[tier as 1 | 2 | 3]?.startingWild) fail(`${where}: unexpected starting wild`);
        if (e.reel < 1 || e.reel > 3) fail(`${where}: starting wild reel`);
        sticky[e.reel] = e.mult;
        break;
      case 'freeSpinRetrigger':
        if (!inFs || pendingScatter < RETRIGGER_SCATTERS) fail(`${where}: bad retrigger`);
        if (e.added !== RETRIGGER_SPINS || e.total !== fsTotal + RETRIGGER_SPINS) fail(`${where}: retrigger counts`);
        fsTotal = e.total;
        break;
      case 'freeSpinEnd':
        if (!inFs) fail(`${where}: end without trigger`);
        if (!capped && fsPlayed !== fsTotal) fail(`${where}: played ${fsPlayed}/${fsTotal} free spins`);
        if (e.amount !== total) fail(`${where}: freeSpinEnd amount`);
        inFs = false;
        sticky = [0, 0, 0, 0, 0];
        break;
      case 'wincap':
        if (total !== WINCAP || e.amount !== WINCAP) fail(`${where}: wincap event without cap`);
        break;
      case 'finalWin':
        sawFinal = true;
        if (i !== ev.length - 1) fail(`${where}: finalWin not last`);
        if (e.amount !== total) fail(`${where}: finalWin ${e.amount} != ${total}`);
        break;
      default:
        fail(`${where}: unknown event ${e.type}`);
    }
  });
  if (!sawFinal) fail(`${where}: no finalWin`);
  if (inFs) fail(`${where}: free spins not closed`);
  if (capped !== ev.some((e: any) => e.type === 'wincap')) fail(`${where}: wincap flag`);
  if (book.payoutMultiplier !== total) fail(`${where}: payoutMultiplier ${book.payoutMultiplier} != replay ${total}`);
}

interface ModeReport {
  name: string;
  cost: number;
  books: number;
  rtp: number;
  hitRate: number;
  sd: number;
  maxWinOdds: number;
  bonusOdds: number | null;
  distinct: number;
  maxPayout: number;
  topBookShare: number;
  bands: { label: string; prob: number; rtp: number }[];
  bytes: number;
}

function main() {
  const t0 = Date.now();
  const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
  if (!Array.isArray(index.modes) || index.modes.length === 0) throw new Error('index.json: no modes');
  const reports: ModeReport[] = [];
  const bookCache = new Map<string, Book[]>();

  for (const m of index.modes) {
    console.log(`mode ${m.name} (cost ${m.cost})`);
    for (const key of ['name', 'cost', 'events', 'weights']) if (!(key in m)) fail(`index.json: ${m.name} missing ${key}`);
    if (typeof m.cost !== 'number' || !(m.cost > 0)) fail(`index.json: bad cost`);
    if (!/\.jsonl\.zst$/.test(m.events) || !/\.csv$/.test(m.weights)) fail(`index.json: file names`);

    // CSV
    const csv = fs.readFileSync(path.join(DIR, m.weights), 'utf8').trimEnd().split('\n');
    const ids: number[] = [];
    const W: bigint[] = [];
    const X: number[] = [];
    csv.forEach((line, i) => {
      const parts = line.split(',');
      if (parts.length !== 3 || !parts.every((p) => /^\d+$/.test(p))) return fail(`${m.weights}:${i + 1} not 3 uint64 values: ${line}`);
      ids.push(Number(parts[0]));
      W.push(BigInt(parts[1]));
      X.push(Number(parts[2]));
      if (Number(parts[0]) !== i + 1) fail(`${m.weights}:${i + 1} id ${parts[0]}`);
      if (BigInt(parts[1]) === 0n) fail(`${m.weights}:${i + 1} zero weight`);
    });

    // books (base and ante share identical files: verify once, compare hashes)
    const file = path.join(DIR, m.events);
    const raw = fs.readFileSync(file);
    const key = raw.length + ':' + raw.subarray(0, 64).toString('hex') + raw.subarray(-64).toString('hex');
    let books = bookCache.get(key);
    if (!books) {
      const text = zlib.zstdDecompressSync(raw).toString('utf8');
      const lines = text.split('\n');
      if (lines[lines.length - 1] === '') lines.pop();
      books = lines.map((l, i) => {
        try {
          return JSON.parse(l) as Book;
        } catch {
          fail(`${m.events}: line ${i + 1} is not JSON`);
          return { id: -1, events: [], payoutMultiplier: -1 };
        }
      });
      for (const b of books) {
        for (const f of ['id', 'events', 'payoutMultiplier']) if (!(f in b)) fail(`${m.events}: book ${b.id} missing ${f}`);
        checkBook(b, `${m.name}#${b.id}`);
      }
      bookCache.set(key, books);
      console.log(`  ${books.length.toLocaleString()} books replayed`);
    } else console.log(`  ${books.length.toLocaleString()} books (identical file already replayed)`);

    if (books.length !== csv.length) fail(`${m.name}: ${books.length} books vs ${csv.length} csv rows`);
    books.forEach((b, i) => {
      if (b.id !== i + 1) fail(`${m.name}: book line ${i + 1} has id ${b.id}`);
      if (b.payoutMultiplier !== X[i]) fail(`${m.name}: book ${b.id} payout ${b.payoutMultiplier} != csv ${X[i]}`);
    });

    // stats
    let S0 = 0n, S1 = 0n;
    W.forEach((w, i) => {
      S0 += w;
      S1 += w * BigInt(X[i]);
    });
    const rtp = Number((S1 * 10n ** 12n) / (S0 * BigInt(Math.round(m.cost * 1000)) * 100n)) / 1e9;
    const tot = Number(S0);
    let hit = 0, cap = 0, ex = 0, ex2 = 0, bonus = 0, top = 0;
    const bandEdges = [0, 1, 100, 1_000, 2_000, 5_000, 10_000, 50_000, 100_000, 500_000, WINCAP, WINCAP + 1];
    const bandP = new Array(bandEdges.length - 1).fill(0);
    const bandR = new Array(bandEdges.length - 1).fill(0);
    W.forEach((w, i) => {
      const p = Number(w) / tot;
      const x = X[i] / 100;
      ex += p * x;
      ex2 += p * x * x;
      if (X[i] > 0) hit += p;
      if (X[i] >= WINCAP) cap += p;
      if (books![i].events.some((e) => e.type === 'freeSpinTrigger')) bonus += p;
      if (p > top) top = p;
      let b = bandEdges.length - 2;
      while (b > 0 && X[i] < bandEdges[b]) b--;
      bandP[b] += p;
      bandR[b] += (p * x) / m.cost;
    });
    const fmt = (v: number) => (v / 100).toLocaleString('en-US');
    reports.push({
      name: m.name,
      cost: m.cost,
      books: books.length,
      rtp,
      hitRate: hit,
      sd: Math.sqrt(ex2 - ex * ex) / m.cost,
      maxWinOdds: cap > 0 ? 1 / cap : Infinity,
      bonusOdds: bonus < 0.999 ? 1 / bonus : null,
      distinct: new Set(X).size,
      maxPayout: X.reduce((a, b) => (b > a ? b : a), 0) / 100,
      topBookShare: top,
      bands: bandEdges.slice(0, -1).map((lo, b) => ({
        label: b === bandEdges.length - 2 ? `${fmt(lo)}x (max win)` : lo === 0 ? '0x' : `${fmt(lo)}x – ${fmt(bandEdges[b + 1])}x`,
        prob: bandP[b],
        rtp: bandR[b],
      })),
      bytes: raw.length,
    });
  }

  // cross-mode rules
  const rtps = reports.map((r) => r.rtp);
  const spread = Math.max(...rtps) - Math.min(...rtps);
  for (const r of reports) {
    if (r.rtp < 0.9 || r.rtp > 0.98) fail(`${r.name}: RTP ${r.rtp} outside 90-98%`);
    if (Math.abs(r.rtp - TARGET_RTP) > 1e-6) fail(`${r.name}: RTP ${r.rtp} != target ${TARGET_RTP}`);
    if (r.books < 100_000 && !process.env.QUICK) fail(`${r.name}: only ${r.books} books (< 100k)`);
    if (r.maxPayout !== WINCAP_X) fail(`${r.name}: max payout ${r.maxPayout} != ${WINCAP_X}`);
    if (r.maxWinOdds > 10_000_000) fail(`${r.name}: max win rarer than 1 in 10M`);
    if (r.cost === 1 && r.hitRate < 1 / 20) fail(`${r.name}: hit rate below 1 in 20`);
  }
  if (spread > 0.005) fail(`RTP spread ${spread} > 0.5%`);

  // report
  const pct = (v: number, d = 2) => (v * 100).toFixed(d) + '%';
  const odds = (v: number) => (Number.isFinite(v) ? '1 in ' + Math.round(v).toLocaleString('en-US') : '—');
  let md = `# ${GAME_NAME} — math report\n\n`;
  md += `Generated by \`npm run math:verify\` from \`math/publish_files\` (independent replay of every book).\n\n`;
  md += `| Mode | Cost | RTP | Hit rate | Std dev (per unit cost) | Max win (${WINCAP_X.toLocaleString('en-US')}x) | Bonus odds | Books | Distinct payouts | File |\n`;
  md += `|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n`;
  for (const r of reports)
    md += `| ${r.name} | ${r.cost}x | ${pct(r.rtp, 4)} | ${pct(r.hitRate)} | ${r.sd.toFixed(2)} | ${odds(r.maxWinOdds)} | ${r.bonusOdds ? odds(r.bonusOdds) : '—'} | ${r.books.toLocaleString('en-US')} | ${r.distinct.toLocaleString('en-US')} | ${(r.bytes / 1e6).toFixed(1)} MB |\n`;
  md += `\nRTP spread between modes: ${pct(spread, 6)} (limit 0.5%).\n`;
  for (const r of reports) {
    md += `\n## ${r.name}\n\n| Win range (x bet) | Probability | Odds | RTP contribution |\n|---|---:|---:|---:|\n`;
    for (const b of r.bands) if (b.prob > 0) md += `| ${b.label} | ${(b.prob * 100).toFixed(4)}% | ${odds(1 / b.prob)} | ${pct(b.rtp)} |\n`;
    md += `\nMost likely single book: ${(r.topBookShare * 100).toFixed(4)}% of rounds.\n`;
  }
  md += `\n## Verification\n\n${errors.length === 0 ? '✅ All checks passed' : `❌ ${errors.length} problems`} — ids, CSV/book payout match, uint64 weights, every line win recomputed from the board, Storm Wild multipliers, sticky reels, free spin counters, retriggers, max-win cap, final payouts, RTP range and spread, ≥100k books per mode, max-win odds better than 1 in 10M, base hit rate.\n`;
  fs.writeFileSync(path.join(ROOT, 'math', 'REPORT.md'), md);

  console.log('');
  for (const r of reports)
    console.log(
      `${r.name.padEnd(6)} cost ${String(r.cost).padStart(3)}  RTP ${pct(r.rtp, 6)}  hit ${pct(r.hitRate)}  sd ${r.sd.toFixed(2)}  max win ${odds(r.maxWinOdds)}  ${r.bonusOdds ? 'bonus ' + odds(r.bonusOdds) : ''}`,
    );
  console.log(`\n${errors.length === 0 ? 'ALL CHECKS PASSED' : errors.length + ' ERRORS'} (${((Date.now() - t0) / 1000).toFixed(0)}s) — report: math/REPORT.md`);
  if (errors.length) process.exit(1);
}

main();
