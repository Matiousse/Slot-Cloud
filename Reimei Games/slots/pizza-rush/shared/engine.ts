// PIZZA RUSH game engine: 5x4 board, 1024 ways, Rush Hour wilds (base),
// Tip Jar multiplier free spins. Deterministic for a given RNG, fast enough
// for tens of millions of rounds, and able to record Stake Engine books.

import {
  type BookEvent,
  type SpinEvent,
  type Tier,
  type WayWin,
  RUSH_CHANCE,
  RUSH_COUNTS,
  MAX_TIPS,
  GOLDEN_SPINS,
  TIP_MULT,
  FULL_JAR_SPINS,
  PAYTABLE,
  RETRIGGER_SCATTERS,
  RETRIGGER_SPINS,
  REELS,
  ROWS,
  S,
  SYMBOLS,
  TIERS,
  WINCAP,
} from './game';
import { BASE_REELS, FS_REELS } from './reels';

// ---------------------------------------------------------------- RNG

export type Rng = () => number;

/** sfc32 seeded through splitmix32. */
export function makeRng(seed: number, stream = 0): Rng {
  let s = (seed ^ Math.imul(stream + 1, 0x9e3779b9)) >>> 0;
  const split = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = split(), b = split(), c = split(), d = split();
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

// ---------------------------------------------------------------- reel sets

interface ReelSet {
  strips: number[][];
  withSc: number[][];
  withoutSc: number[][];
  q: number[];
  bySize: { masks: number[]; cum: Float64Array; total: number }[];
  pCount: number[];
}

function buildReelSet(strips: number[][]): ReelSet {
  const withSc: number[][] = [];
  const withoutSc: number[][] = [];
  const q: number[] = [];
  for (const strip of strips) {
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
  }
  const groups = Array.from({ length: REELS + 1 }, () => ({ masks: [] as number[], probs: [] as number[] }));
  for (let mask = 0; mask < 1 << REELS; mask++) {
    let p = 1, k = 0;
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
    g.probs.forEach((p, i) => (cum[i] = acc += p));
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

const RUSH_TOTAL = RUSH_COUNTS.reduce((a, [, w]) => a + w, 0);

// ---------------------------------------------------------------- simulation

export interface RoundResult {
  payout: number;
  tier: Tier | 0;
  /** number of Rush Hour wilds added on the base spin */
  rush: number;
  events?: BookEvent[];
}

const codes = SYMBOLS;
type NewEvent = BookEvent extends infer E ? (E extends BookEvent ? Omit<E, 'index'> : never) : never;

export class Engine {
  private board = new Int8Array(REELS * ROWS);
  private events: BookEvent[] | null = null;
  private wins: WayWin[] = [];
  private cnt = new Int32Array(REELS);

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

  private count(sym: number): number {
    let n = 0;
    for (let i = 0; i < this.board.length; i++) if (this.board[i] === sym) n++;
    return n;
  }

  /** Rush Hour: turn 1-4 random non-scatter, non-wild cells of reels 2-5 into Wilds. */
  private rushHour(force = false): [number, number][] | null {
    const rng = this.rng;
    // force (GUARANTEED RUSH mode): always happens, with 2 to 4 Wilds (same relative weights)
    if (!force && rng() >= RUSH_CHANCE) return null;
    const counts = force ? RUSH_COUNTS.filter(([c]) => c >= 2) : RUSH_COUNTS;
    const total = force ? counts.reduce((a, [, w]) => a + w, 0) : RUSH_TOTAL;
    let r = rng() * total;
    let n = counts[counts.length - 1][0];
    for (const [c, w] of counts) {
      if (r < w) {
        n = c;
        break;
      }
      r -= w;
    }
    const cells: number[] = [];
    for (let i = ROWS; i < REELS * ROWS; i++) if (this.board[i] !== S.SC && this.board[i] !== S.WD) cells.push(i);
    const out: [number, number][] = [];
    for (let k = 0; k < n && cells.length; k++) {
      const j = Math.floor(rng() * cells.length);
      const c = cells[j];
      cells[j] = cells[cells.length - 1];
      cells.pop();
      this.board[c] = S.WD;
      out.push([Math.floor(c / ROWS), c % ROWS]);
    }
    out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return out;
  }

  /** 1024 ways evaluation; returns total spin win (uncapped). */
  private evaluate(mult: number): number {
    const b = this.board;
    const cnt = this.cnt;
    const rec = this.events !== null;
    let total = 0;
    for (let s = 0; s <= S.H1; s++) {
      let len = 0;
      let ways = 1;
      for (let r = 0; r < REELS; r++) {
        let c = 0;
        for (let y = 0; y < ROWS; y++) {
          const v = b[r * ROWS + y];
          if (v === s || (r > 0 && v === S.WD)) c++;
        }
        cnt[r] = c;
        if (c === 0) break;
        ways *= c;
        len++;
      }
      if (len >= 3) {
        const pay = PAYTABLE[s][len - 3];
        const win = pay * ways * mult;
        total += win;
        if (rec) this.wins.push([codes[s], len, ways, pay, mult, win]);
      }
    }
    return total;
  }

  private spinEvent(e: Omit<SpinEvent, 'index' | 'type' | 'board' | 'wins'>) {
    if (!this.events) return;
    this.emit({
      type: 'spin',
      gameType: e.gameType,
      ...(e.fs ? { fs: e.fs } : {}),
      board: this.boardStrings(),
      ...(e.rush ? { rush: e.rush } : {}),
      ...(e.tips !== undefined ? { tips: e.tips, mult: e.mult } : {}),
      ...(this.wins.length ? { wins: this.wins.slice() } : {}),
      win: e.win,
      total: e.total,
    } as NewEvent);
  }

  private playRound(scatterK: number, allowedMax: number, forceRush = false, forceWild = false, spins?: number): RoundResult {
    this.drawBoard(BASE_SET, scatterK, allowedMax);
    this.wins.length = 0;
    // the board is recorded as landed; Rush Hour cells are listed separately
    const landed = this.events ? this.boardStrings() : null;
    const rush = this.rushHour(forceRush);
    const win = this.evaluate(1);
    let total = Math.min(win, WINCAP);
    let capped = total >= WINCAP;
    if (this.events) {
      this.spinEvent({ gameType: 'base', rush: rush ?? undefined, win, total });
      // store the landed board (before Rush Hour) for the frontend
      const ev = this.events[this.events.length - 1] as SpinEvent;
      ev.board = landed!;
    }
    const sc = this.count(S.SC);
    let tier: Tier | 0 = 0;
    if (!capped && sc >= 3) {
      tier = (sc >= 5 ? 3 : sc === 4 ? 2 : 1) as Tier;
      total = this.freeSpins(tier, total, forceWild, spins);
      capped = total >= WINCAP;
    }
    if (capped) this.emit({ type: 'wincap', amount: WINCAP });
    this.emit({ type: 'finalWin', amount: total });
    return { payout: total, tier, rush: rush?.length ?? 0 };
  }

  /** forceWild (DINNER RUSH BONUS buy): every free spin shows at least one Golden Slice Wild (reels 2-5). */
  private freeSpins(tier: Tier, startTotal: number, forceWild = false, spinsOverride?: number): number {
    const info = TIERS[tier];
    const set = FS_SETS[tier];
    let total = startTotal;
    let spins = spinsOverride ?? info.spins;
    let tips = info.startTips;
    let jarAwarded = tips >= MAX_TIPS;
    this.emit({ type: 'freeSpinTrigger', tier, spins, tips });

    for (let spin = 1; spin <= spins; spin++) {
      this.drawBoard(set, -1);
      if (forceWild && this.count(S.WD) === 0) {
        const cells: number[] = [];
        for (let i = ROWS; i < REELS * ROWS; i++) if (this.board[i] !== S.SC) cells.push(i);
        this.board[cells[Math.floor(this.rng() * cells.length)]] = S.WD;
      }
      this.wins.length = 0;
      tips = Math.min(MAX_TIPS, tips + this.count(S.WD));
      const mult = TIP_MULT[tips];
      const win = this.evaluate(mult);
      total += win;
      const capped = total >= WINCAP;
      if (capped) total = WINCAP;
      this.spinEvent({ gameType: 'free', fs: [spin, spins], tips, mult, win, total });
      if (capped) break;
      if (!jarAwarded && tips >= MAX_TIPS) {
        jarAwarded = true;
        spins += FULL_JAR_SPINS;
        this.emit({ type: 'jarFull', added: FULL_JAR_SPINS, total: spins });
      }
      if (this.count(S.SC) >= RETRIGGER_SCATTERS) {
        spins += RETRIGGER_SPINS;
        this.emit({ type: 'freeSpinRetrigger', added: RETRIGGER_SPINS, total: spins });
      }
    }
    this.emit({ type: 'freeSpinEnd', tier, amount: total });
    return total;
  }

  // ------------------------------------------------------------ public API

  private run(fn: () => RoundResult, record: boolean): RoundResult {
    this.events = record ? [] : null;
    const res = fn();
    if (record) res.events = this.events!;
    this.events = null;
    return res;
  }

  natural(record = false) {
    return this.run(() => this.playRound(-1, REELS), record);
  }

  noBonus(record = false) {
    return this.run(() => this.playRound(-1, 2), record);
  }

  bonus(tier: Tier, record = false) {
    return this.run(() => this.playRound(TIERS[tier].scatters, REELS), record);
  }

  /** GUARANTEED RUSH: Rush Hour always happens (2-4 Wilds). No tier: a round without bonus; tier k: it triggers tier k. */
  rush(record = false, tier?: Tier) {
    return this.run(() => (tier ? this.playRound(TIERS[tier].scatters, REELS, true) : this.playRound(-1, 2, true)), record);
  }

  /** DINNER RUSH BONUS buy: the tier's free spins with a guaranteed Wild on every free spin. */
  bonusWild(tier: Tier, record = false, spins = GOLDEN_SPINS) {
    return this.run(() => this.playRound(TIERS[tier].scatters, REELS, false, true, spins), record);
  }
}
