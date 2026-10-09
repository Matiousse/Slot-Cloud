// RAIJIN OVERLOAD game engine: board generation, Thunder Wilds, line evaluation and
// free spins. Deterministic for a given RNG, fast enough to simulate tens of
// millions of rounds (typed arrays, numeric symbols) and able to record the
// Stake Engine "book" (list of events) of any round.

import {
  type BookEvent,
  type LineWin,
  type SpinEvent,
  type StormWild,
  type Tier,
  PAYLINES,
  PAYTABLE,
  RETRIGGER_SCATTERS,
  RETRIGGER_SPINS,
  REELS,
  ROWS,
  S,
  SYMBOLS,
  TIERS,
  WINCAP,
  isWild,
} from './game';
import { BASE_REELS, FS_REELS, MULT_BASE, MULT_FS, type MultTable } from './reels';

// ---------------------------------------------------------------- RNG

export type Rng = () => number; // uniform [0, 1)

/** sfc32 seeded through splitmix32 — fast, good statistical quality. */
export function makeRng(seed: number, stream = 0): Rng {
  let s = (seed ^ Math.imul(stream + 1, 0x9e3779b9)) >>> 0;
  const split = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = split();
  let b = split();
  let c = split();
  let d = split();
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  return next;
}

/** Cryptographically secure RNG for the browser demo. */
export function cryptoRng(): Rng {
  const buf = new Uint32Array(256);
  let i = buf.length;
  return () => {
    if (i >= buf.length) {
      crypto.getRandomValues(buf);
      i = 0;
    }
    return buf[i++] / 4294967296;
  };
}

// ---------------------------------------------------------------- helpers

class WeightedTable {
  values: number[];
  cum: Float64Array;
  total: number;
  constructor(table: MultTable) {
    this.values = table.map((t) => t[0]);
    this.cum = new Float64Array(table.length);
    let acc = 0;
    table.forEach(([, w], i) => {
      acc += w;
      this.cum[i] = acc;
    });
    this.total = acc;
  }
  pick(rng: Rng): number {
    const r = rng() * this.total;
    for (let i = 0; i < this.cum.length; i++) if (r < this.cum[i]) return this.values[i];
    return this.values[this.values.length - 1];
  }
}

const MULT_TABLES = {
  base: new WeightedTable(MULT_BASE),
  1: new WeightedTable(MULT_FS[1]),
  2: new WeightedTable(MULT_FS[2]),
  3: new WeightedTable(MULT_FS[3]),
};

/** Per-reel stop positions split by "a scatter is visible" or not. */
interface ReelSet {
  strips: number[][];
  withSc: number[][];
  withoutSc: number[][];
  q: number[]; // probability a scatter is visible on each reel
  /** subsets of reels (bitmask) grouped by scatter count, with cumulative probs */
  bySize: { masks: number[]; cum: Float64Array; total: number }[];
  /** P(exactly k scatters) */
  pCount: number[];
}

function buildReelSet(strips: number[][]): ReelSet {
  const withSc: number[][] = [];
  const withoutSc: number[][] = [];
  const q: number[] = [];
  strips.forEach((strip) => {
    const a: number[] = [];
    const b: number[] = [];
    for (let stop = 0; stop < strip.length; stop++) {
      let has = false;
      for (let r = 0; r < ROWS; r++) if (strip[(stop + r) % strip.length] === S.SC) has = true;
      (has ? a : b).push(stop);
    }
    withSc.push(a);
    withoutSc.push(b);
    q.push(a.length / strip.length);
  });
  const groups: { masks: number[]; probs: number[] }[] = Array.from({ length: REELS + 1 }, () => ({
    masks: [],
    probs: [],
  }));
  for (let mask = 0; mask < 1 << REELS; mask++) {
    let p = 1;
    let k = 0;
    for (let r = 0; r < REELS; r++) {
      if (mask & (1 << r)) {
        p *= q[r];
        k++;
      } else p *= 1 - q[r];
    }
    groups[k].masks.push(mask);
    groups[k].probs.push(p);
  }
  const bySize = groups.map((g) => {
    const cum = new Float64Array(g.probs.length);
    let acc = 0;
    g.probs.forEach((p, i) => {
      acc += p;
      cum[i] = acc;
    });
    return { masks: g.masks, cum, total: acc };
  });
  return { strips, withSc, withoutSc, q, bySize, pCount: bySize.map((g) => g.total) };
}

export const BASE_SET = buildReelSet(BASE_REELS);
const FS_SETS: Record<Tier, ReelSet> = {
  1: buildReelSet(FS_REELS[1]),
  2: buildReelSet(FS_REELS[2]),
  3: buildReelSet(FS_REELS[3]),
};

/** Natural probabilities of the base game: P(no bonus) and P(tier k | bonus). */
export const NATURAL = (() => {
  const p = BASE_SET.pCount;
  const trig = p[3] + p[4] + p[5];
  return {
    pTrigger: trig,
    pNoBonus: 1 - trig,
    tierSplit: { 1: p[3] / trig, 2: p[4] / trig, 3: p[5] / trig } as Record<Tier, number>,
    pScatters: p,
  };
})();

// ---------------------------------------------------------------- simulation

export interface RoundResult {
  payout: number; // book units, capped
  tier: Tier | 0;
  /** number of Storm Wilds that expanded on the base game spin */
  storms: number;
  events?: BookEvent[];
}

const codes = SYMBOLS;
type NewEvent = BookEvent extends infer E ? (E extends BookEvent ? Omit<E, 'index'> : never) : never;

export class Engine {
  private board = new Int8Array(REELS * ROWS); // [reel*ROWS + row]
  private reelMult = new Int32Array(REELS); // 0 = not expanded, else multiplier
  private events: BookEvent[] | null = null;
  private storm: StormWild[] = [];
  private wins: LineWin[] = [];

  constructor(private rng: Rng) {}

  setRng(rng: Rng) {
    this.rng = rng;
  }

  private emit(e: NewEvent) {
    if (this.events) this.events.push({ index: this.events.length, ...e } as BookEvent);
  }

  private boardStrings(): string[] {
    const out: string[] = [];
    for (let r = 0; r < REELS; r++) {
      let col = '';
      for (let y = 0; y < ROWS; y++) col += codes[this.board[r * ROWS + y]];
      out.push(col);
    }
    return out;
  }

  /** Draw a board with an exact scatter count k (k < 0: natural, capped at allowedMax). */
  private drawBoard(set: ReelSet, k: number, allowedMax = REELS) {
    const rng = this.rng;
    if (k < 0 && allowedMax < REELS) {
      let tot = 0;
      for (let c = 0; c <= allowedMax; c++) tot += set.pCount[c];
      let r = rng() * tot;
      let c = 0;
      while (c < allowedMax && r >= set.pCount[c]) {
        r -= set.pCount[c];
        c++;
      }
      k = c;
    }
    let mask = -1;
    if (k >= 0) {
      const g = set.bySize[k];
      const r = rng() * g.total;
      let i = 0;
      while (i < g.cum.length - 1 && r >= g.cum[i]) i++;
      mask = g.masks[i];
    }
    for (let reel = 0; reel < REELS; reel++) {
      const strip = set.strips[reel];
      let stop: number;
      if (mask < 0) stop = Math.floor(rng() * strip.length);
      else {
        const pool = mask & (1 << reel) ? set.withSc[reel] : set.withoutSc[reel];
        stop = pool[Math.floor(rng() * pool.length)];
      }
      for (let y = 0; y < ROWS; y++) this.board[reel * ROWS + y] = strip[(stop + y) % strip.length];
    }
  }

  private countScatters(): number {
    let n = 0;
    for (let i = 0; i < this.board.length; i++) if (this.board[i] === S.SC) n++;
    return n;
  }

  /** Evaluate the 20 paylines. Returns total spin win (uncapped, book units). */
  private evaluate(): number {
    const b = this.board;
    const rm = this.reelMult;
    const rec = this.events !== null;
    let total = 0;
    for (let li = 0; li < PAYLINES.length; li++) {
      const line = PAYLINES[li];
      const s0 = b[line[0]];
      if (s0 === S.SC || isWild(s0)) continue;
      let count = 1;
      let mult = 1;
      for (let r = 1; r < REELS; r++) {
        if (rm[r] > 0) {
          count++;
          mult *= rm[r];
          continue;
        }
        const sym = b[r * ROWS + line[r]];
        if (sym === s0 || isWild(sym)) count++;
        else break;
      }
      if (count >= 3) {
        const win = PAYTABLE[s0][count - 3] * mult;
        total += win;
        if (rec) this.wins.push([li, codes[s0], count, mult, win]);
      }
    }
    return total;
  }

  private spinEvent(gameType: 'base' | 'free', win: number, total: number, fs?: [number, number]) {
    if (!this.events) return;
    const e: Omit<SpinEvent, 'index'> = { type: 'spin', gameType, board: this.boardStrings(), win, total };
    if (fs) e.fs = fs;
    if (this.storm.length) e.storm = this.storm.slice();
    if (this.wins.length) e.wins = this.wins.slice();
    // keep a stable key order: index, type, gameType, fs, board, storm, wins, win, total
    this.emit({
      type: 'spin',
      gameType,
      ...(e.fs ? { fs: e.fs } : {}),
      board: e.board,
      ...(e.storm ? { storm: e.storm } : {}),
      ...(e.wins ? { wins: e.wins } : {}),
      win,
      total,
    });
  }

  /** Base game spin + optional free spins. */
  private playRound(set: ReelSet, scatterK: number, allowedMax: number): RoundResult {
    this.drawBoard(set, scatterK, allowedMax);
    this.reelMult.fill(0);
    this.storm.length = 0;
    this.wins.length = 0;

    // Storm Wilds (reels 2-4) expand and take a multiplier
    let storms = 0;
    for (let r = 1; r <= 3; r++) {
      for (let y = 0; y < ROWS; y++) {
        if (this.board[r * ROWS + y] === S.SW) {
          storms++;
          const m = MULT_TABLES.base.pick(this.rng);
          this.reelMult[r] = m;
          if (this.events) this.storm.push([r, y, m]);
          break;
        }
      }
    }

    const win = this.evaluate();
    let total = Math.min(win, WINCAP);
    let capped = total >= WINCAP;
    this.spinEvent('base', win, total);

    const sc = this.countScatters();
    let tier: Tier | 0 = 0;
    if (!capped && sc >= 3) {
      tier = (sc >= 5 ? 3 : sc === 4 ? 2 : 1) as Tier;
      total = this.freeSpins(tier, total);
      capped = total >= WINCAP;
    }
    if (capped) this.emit({ type: 'wincap', amount: WINCAP });
    this.emit({ type: 'finalWin', amount: total });
    return { payout: total, tier, storms };
  }

  private freeSpins(tier: Tier, startTotal: number): number {
    const info = TIERS[tier];
    const set = FS_SETS[tier];
    const multTable = MULT_TABLES[tier];
    let total = startTotal;
    let spins = info.spins;
    const sticky = new Int32Array(REELS); // sticky multipliers per reel

    this.emit({ type: 'freeSpinTrigger', tier, spins });

    if (info.startingWild) {
      const reel = 1 + Math.floor(this.rng() * 3);
      sticky[reel] = multTable.pick(this.rng);
      this.emit({ type: 'startingWild', reel, mult: sticky[reel] });
    }

    for (let spin = 1; spin <= spins; spin++) {
      this.drawBoard(set, -1);
      this.reelMult.fill(0);
      this.storm.length = 0;
      this.wins.length = 0;
      if (info.guaranteedStorm) this.ensureStorm();
      for (let r = 1; r <= 3; r++) {
        if (sticky[r] > 0) {
          for (let y = 0; y < ROWS; y++) this.board[r * ROWS + y] = S.SW;
          this.reelMult[r] = sticky[r];
          if (this.events) this.storm.push([r, -1, sticky[r]]);
          continue;
        }
        for (let y = 0; y < ROWS; y++) {
          if (this.board[r * ROWS + y] === S.SW) {
            const m = multTable.pick(this.rng);
            this.reelMult[r] = m;
            if (info.sticky) sticky[r] = m;
            if (this.events) this.storm.push([r, y, m]);
            break;
          }
        }
      }

      const win = this.evaluate();
      total += win;
      const capped = total >= WINCAP;
      if (capped) total = WINCAP;
      this.spinEvent('free', win, total, [spin, spins]);
      if (capped) break;

      if (this.countScatters() >= RETRIGGER_SCATTERS) {
        spins += RETRIGGER_SPINS;
        this.emit({ type: 'freeSpinRetrigger', added: RETRIGGER_SPINS, total: spins });
      }
    }
    this.emit({ type: 'freeSpinEnd', tier, amount: total });
    return total;
  }

  /** Drop a Storm Wild on a random middle reel if none landed (never over a scatter). */
  private ensureStorm() {
    const b = this.board;
    let free = 0;
    for (let r = 1; r <= 3; r++) {
      let hasSc = false;
      for (let y = 0; y < ROWS; y++) {
        if (b[r * ROWS + y] === S.SW) return;
        if (b[r * ROWS + y] === S.SC) hasSc = true;
      }
      if (!hasSc) free |= 1 << r;
    }
    if (!free) return;
    const options = [1, 2, 3].filter((r) => free & (1 << r));
    const reel = options[Math.floor(this.rng() * options.length)];
    const row = Math.floor(this.rng() * ROWS);
    b[reel * ROWS + row] = S.SW;
  }

  // ------------------------------------------------------------ public API

  private run(fn: () => RoundResult, record: boolean): RoundResult {
    this.events = record ? [] : null;
    const res = fn();
    if (record) res.events = this.events!;
    this.events = null;
    return res;
  }

  /** Natural base game round (bonus triggers when 3+ scatters land). */
  natural(record = false) {
    return this.run(() => this.playRound(BASE_SET, -1, REELS), record);
  }

  /** Base game round conditioned on NOT triggering the bonus (0-2 scatters). */
  noBonus(record = false) {
    return this.run(() => this.playRound(BASE_SET, -1, 2), record);
  }

  /** Round that triggers the given bonus tier (3/4/5 scatters on the base reels). */
  bonus(tier: Tier, record = false) {
    return this.run(() => this.playRound(BASE_SET, TIERS[tier].scatters, REELS), record);
  }
}
