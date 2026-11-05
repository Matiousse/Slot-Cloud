// PIZZA RUSH (Reimei Games) — single source of truth for the game rules.
// Used by the math generator (math/*) and later by the frontend.
//
// Money inside books is in "book units": hundredths of the BASE bet
// (1150 = 11.5x the base bet), exactly like Stake Engine `payoutMultiplier`.

export const GAME_ID = 'pizza-rush';
export const GAME_NAME = 'PIZZA RUSH';
export const GAME_VERSION = '1.0.0';

export const REELS = 5;
export const ROWS = 4;
/** 4^5 = 1024 ways, wins pay left to right on adjacent reels. */
export const WAYS = Math.pow(ROWS, REELS);

/** Target RTP for every bet mode. */
export const TARGET_RTP = 0.96;
/** Maximum win, in multiples of the base bet. */
export const WINCAP_X = 10000;
export const WINCAP = WINCAP_X * 100;

// ---------------------------------------------------------------- symbols

export const SYMBOLS = ['L5', 'L4', 'L3', 'L2', 'L1', 'H4', 'H3', 'H2', 'H1', 'WD', 'SC'] as const;
export type SymbolCode = (typeof SYMBOLS)[number];

export const S = {
  L5: 0, // 10
  L4: 1, // J
  L3: 2, // Q
  L2: 3, // K
  L1: 4, // A
  H4: 5, // Pizza
  H3: 6, // Scooter
  H2: 7, // Pizza boxes
  H1: 8, // Tip jar
  WD: 9, // Golden slice (wild, reels 2-5)
  SC: 10, // Phone order (scatter)
} as const;

export const SYMBOL_NAMES: Record<SymbolCode, string> = {
  L5: '10',
  L4: 'J',
  L3: 'Q',
  L2: 'K',
  L1: 'A',
  H4: 'Pizza',
  H3: 'Scooter',
  H2: 'Pizza Boxes',
  H1: 'Tip jar',
  WD: 'Golden Slice Wild',
  SC: 'Phone Order',
};

/**
 * Pays per WAY for 3, 4 and 5 of a kind, in book units (hundredths of the bet).
 * A win = pay x number of ways (product of matching symbols per reel) x multiplier.
 */
export const PAYTABLE: Record<number, [number, number, number]> = {
  [S.L5]: [5, 10, 20],
  [S.L4]: [5, 10, 20],
  [S.L3]: [5, 15, 25],
  [S.L2]: [10, 15, 30],
  [S.L1]: [10, 20, 40],
  [S.H4]: [15, 40, 100],
  [S.H3]: [20, 50, 150],
  [S.H2]: [25, 75, 250],
  [S.H1]: [40, 100, 500],
};

// ---------------------------------------------------------------- features

/**
 * RUSH HOUR (base game): on some spins Tony speeds by on his scooter and turns
 * 1 to 4 random symbols of reels 2-5 into Wilds (never a scatter).
 */
export const RUSH_CHANCE = 0.085;
export const RUSH_COUNTS: [count: number, weight: number][] = [
  [1, 50],
  [2, 30],
  [3, 15],
  [4, 5],
];

/**
 * TIP JAR (free spins): every Wild that lands drops one tip in the jar (9 tips
 * max). Each tip raises the win multiplier along TIP_MULT (x1 .. x100)
 * and it never resets during the bonus. Filling the jar (9th tip) awards
 * +FULL_JAR_SPINS spins once.
 */
export const MAX_TIPS = 9;
export const TIP_MULT = [1, 2, 3, 4, 6, 8, 12, 20, 40, 100];
export const FULL_JAR_SPINS = 5;

export type Tier = 1 | 2 | 3;

export interface TierInfo {
  tier: Tier;
  key: string;
  scatters: number;
  spins: number;
  /** tips already lit when the bonus starts */
  startTips: number;
}

export const TIERS: Record<Tier, TierInfo> = {
  1: { tier: 1, key: 'lunchRush', scatters: 3, spins: 10, startTips: 0 },
  2: { tier: 2, key: 'dinnerRush', scatters: 4, spins: 12, startTips: 3 },
  3: { tier: 3, key: 'midnightRush', scatters: 5, spins: 15, startTips: 5 },
};

/** DINNER RUSH BONUS (buy): Dinner Rush with this many free spins and a guaranteed Wild on every spin. */
export const GOLDEN_SPINS = 5;

/** 3+ scatters during free spins award extra spins. */
export const RETRIGGER_SCATTERS = 3;
export const RETRIGGER_SPINS = 5;

// ---------------------------------------------------------------- bet modes

export type ModeKind = 'base' | 'boost' | 'rush' | 'buy' | 'mystery';

export interface ModeInfo {
  name: string;
  cost: number;
  kind: ModeKind;
  tier?: Tier;
  /** boost: free spins this many times more likely than in the base game */
  boost?: number;
  /** buy with a guaranteed Wild on every free spin and GOLDEN_SPINS spins */
  golden?: boolean;
  /** mystery: share of rounds that become MIDNIGHT RUSH (the rest: DINNER RUSH or no order) */
  midnight?: number;
  /** stays on, every spin, until the player switches it off (otherwise a one-off bonus buy) */
  persistent?: boolean;
}

// Six features on the bonus screen, as in the reference layout:
//   TIP BOOST (2x, free spins 3x as often) · ORDER BOOST (10x, 19x as often) · GUARANTEED RUSH (4x, Rush Hour on every
//   spin) · LUNCH RUSH BONUS (100x) · DINNER RUSH BONUS (200x, 5 spins, guaranteed Wild) · MYSTERY ORDER (300x).
// Boost costs are exact: with the no-bonus pool at RTP/2, a k-times boost costs (1 + k) / 2.
export const MODES: ModeInfo[] = [
  { name: 'base', cost: 1, kind: 'base' },
  { name: 'boost', cost: 2, kind: 'boost', boost: 3, persistent: true },
  { name: 'superboost', cost: 10, kind: 'boost', boost: 19, persistent: true },
  { name: 'rush', cost: 4, kind: 'rush', persistent: true },
  { name: 'bonus', cost: 100, kind: 'buy', tier: 1 },
  { name: 'super', cost: 200, kind: 'buy', tier: 2, golden: true },
  { name: 'mystery', cost: 300, kind: 'mystery', midnight: 0.15, persistent: true },
];

export const modeByName = (name: string) =>
  MODES.find((m) => m.name.toLowerCase() === name.toLowerCase()) ?? MODES[0];

// ---------------------------------------------------------------- book types
//
// Board = 5 strings (reels 1..5), each the 4 symbol codes of that reel from
// top to bottom, e.g. "L5H1SCWD".

/** [symbol, count (3-5), ways, pay per way, multiplier, win] — win in book units. */
export type WayWin = [symbol: SymbolCode, count: number, ways: number, pay: number, mult: number, win: number];

export interface SpinEvent {
  index: number;
  type: 'spin';
  gameType: 'base' | 'free';
  /** free spins only: [current spin, total spins] */
  fs?: [number, number];
  /** board as it landed */
  board: string[];
  /** base game Rush Hour: cells turned Wild, [reel, row] */
  rush?: [number, number][];
  /** free spins: tips lit after this spin's wilds, and the multiplier used */
  tips?: number;
  mult?: number;
  wins?: WayWin[];
  /** win of this spin (uncapped) */
  win: number;
  /** running round total after this spin (capped) */
  total: number;
}

export type BookEvent =
  | SpinEvent
  | { index: number; type: 'freeSpinTrigger'; tier: Tier; spins: number; tips: number }
  | { index: number; type: 'jarFull'; added: number; total: number }
  | { index: number; type: 'freeSpinRetrigger'; added: number; total: number }
  | { index: number; type: 'freeSpinEnd'; tier: Tier; amount: number }
  | { index: number; type: 'wincap'; amount: number }
  | { index: number; type: 'finalWin'; amount: number };

export interface Book {
  id: number;
  payoutMultiplier: number;
  events: BookEvent[];
}

export const decodeReel = (s: string): SymbolCode[] => {
  const out: SymbolCode[] = [];
  for (let i = 0; i < s.length; i += 2) out.push(s.slice(i, i + 2) as SymbolCode);
  return out;
};
