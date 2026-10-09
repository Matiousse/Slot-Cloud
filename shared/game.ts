// CLOUDBURST — single source of truth for the game rules.
// Used by the math generator (math/*) and by the frontend (src/*).
//
// All money values inside books are expressed in "book units":
// hundredths of the BASE bet (1150 = 11.5x the base bet), exactly like the
// Stake Engine `payoutMultiplier` field.

export const GAME_ID = 'cloudburst';
export const GAME_NAME = 'CLOUDBURST';
export const GAME_VERSION = '1.0.0';

export const REELS = 5;
export const ROWS = 5;

/** Target RTP for every bet mode (Stake requires all modes within 0.5%). */
export const TARGET_RTP = 0.961;
/** Maximum win, in multiples of the base bet. */
export const WINCAP_X = 10000;
export const WINCAP = WINCAP_X * 100; // book units

// ---------------------------------------------------------------- symbols

export const SYMBOLS = ['L5', 'L4', 'L3', 'L2', 'L1', 'H4', 'H3', 'H2', 'H1', 'WD', 'SW', 'SC'] as const;
export type SymbolCode = (typeof SYMBOLS)[number];

export const S = {
  L5: 0, // 10
  L4: 1, // J
  L3: 2, // Q
  L2: 3, // K
  L1: 4, // A
  H4: 5, // Thunder Bell
  H3: 6, // Lucky Seven
  H2: 7, // Storm Diamond
  H1: 8, // Sky Crown
  WD: 9, // Wild
  SW: 10, // Storm Wild (expands + multiplier, reels 2-4)
  SC: 11, // Bonus scatter
} as const;

export const isWild = (s: number) => s === S.WD || s === S.SW;

export const SYMBOL_NAMES: Record<SymbolCode, string> = {
  L5: '10',
  L4: 'J',
  L3: 'Q',
  L2: 'K',
  L1: 'A',
  H4: 'Thunder Bell',
  H3: 'Lucky Seven',
  H2: 'Storm Diamond',
  H1: 'Sky Crown',
  WD: 'Wild',
  SW: 'Storm Wild',
  SC: 'Bonus',
};

/** Line pays for 3, 4 and 5 of a kind, in book units (hundredths of the bet). */
export const PAYTABLE: Record<number, [number, number, number]> = {
  [S.L5]: [20, 50, 100],
  [S.L4]: [20, 50, 100],
  [S.L3]: [30, 60, 150],
  [S.L2]: [30, 80, 200],
  [S.L1]: [40, 100, 250],
  [S.H4]: [50, 150, 400],
  [S.H3]: [80, 200, 600],
  [S.H2]: [100, 300, 1000],
  [S.H1]: [150, 500, 2000],
};

// ---------------------------------------------------------------- paylines
// 20 fixed paylines, read left to right. Each entry = row index on reels 1..5.

export const PAYLINES: number[][] = [
  [2, 2, 2, 2, 2],
  [1, 1, 1, 1, 1],
  [3, 3, 3, 3, 3],
  [0, 0, 0, 0, 0],
  [4, 4, 4, 4, 4],
  [0, 1, 2, 1, 0],
  [4, 3, 2, 3, 4],
  [1, 2, 3, 2, 1],
  [3, 2, 1, 2, 3],
  [2, 1, 0, 1, 2],
  [2, 3, 4, 3, 2],
  [0, 1, 2, 3, 4],
  [4, 3, 2, 1, 0],
  [1, 0, 1, 0, 1],
  [3, 4, 3, 4, 3],
  [2, 1, 2, 1, 2],
  [2, 3, 2, 3, 2],
  [1, 2, 1, 2, 1],
  [3, 2, 3, 2, 3],
  [0, 2, 4, 2, 0],
];

// ---------------------------------------------------------------- bonus tiers

export type Tier = 1 | 2 | 3;

export interface TierInfo {
  tier: Tier;
  key: string;
  scatters: number;
  spins: number;
  /** Storm Wilds stay on the reels until the end of the bonus. */
  sticky: boolean;
  /** Starts with a guaranteed sticky Storm Wild. */
  startingWild: boolean;
  /** Every free spin has at least one Storm Wild. */
  guaranteedStorm: boolean;
}

export const TIERS: Record<Tier, TierInfo> = {
  1: { tier: 1, key: 'stormChase', scatters: 3, spins: 10, sticky: false, startingWild: false, guaranteedStorm: true },
  2: { tier: 2, key: 'eyeOfTheStorm', scatters: 4, spins: 10, sticky: true, startingWild: true, guaranteedStorm: false },
  3: { tier: 3, key: 'cloudburst', scatters: 5, spins: 10, sticky: true, startingWild: true, guaranteedStorm: false },
};

/** 3+ scatters during free spins award extra spins. */
export const RETRIGGER_SCATTERS = 3;
export const RETRIGGER_SPINS = 5;

// ---------------------------------------------------------------- bet modes

export type ModeKind = 'base' | 'ante' | 'buy';

export interface ModeInfo {
  name: string; // must match index.json `name`
  cost: number;
  kind: ModeKind;
  tier?: Tier;
  /** Bonus trigger chance boost, relative to base. */
  boost?: number;
}

export const MODES: ModeInfo[] = [
  { name: 'base', cost: 1, kind: 'base' },
  { name: 'ante', cost: 3, kind: 'ante', boost: 5 },
  { name: 'bonus', cost: 100, kind: 'buy', tier: 1 },
  { name: 'super', cost: 400, kind: 'buy', tier: 2 },
];

export const modeByName = (name: string) =>
  MODES.find((m) => m.name.toLowerCase() === name.toLowerCase()) ?? MODES[0];

// ---------------------------------------------------------------- book types
//
// One compact "spin" event per spin keeps the books small (Stake requires
// 100k+ rounds per mode). Board = 5 strings (reels 1..5), each the 5 symbol
// codes of that reel from top to bottom, e.g. "L5H1SCWDL2".

/** [reel, row, multiplier] — row is -1 for a sticky Storm Wild carried over. */
export type StormWild = [reel: number, row: number, mult: number];
/** [payline index, symbol, count, multiplier, win] — win in book units. */
export type LineWin = [line: number, symbol: SymbolCode, count: number, mult: number, win: number];

export interface SpinEvent {
  index: number;
  type: 'spin';
  gameType: 'base' | 'free';
  /** free spins only: [current spin, total spins] */
  fs?: [number, number];
  board: string[];
  storm?: StormWild[];
  wins?: LineWin[];
  /** win of this spin (uncapped) */
  win: number;
  /** running round total after this spin (capped) */
  total: number;
}

export type BookEvent =
  | SpinEvent
  | { index: number; type: 'freeSpinTrigger'; tier: Tier; spins: number }
  | { index: number; type: 'startingWild'; reel: number; mult: number }
  | { index: number; type: 'freeSpinRetrigger'; added: number; total: number }
  | { index: number; type: 'freeSpinEnd'; tier: Tier; amount: number }
  | { index: number; type: 'wincap'; amount: number }
  | { index: number; type: 'finalWin'; amount: number };

export interface Book {
  id: number;
  payoutMultiplier: number;
  events: BookEvent[];
}

/** Decode a board string column into symbol codes. */
export const decodeReel = (s: string): SymbolCode[] => {
  const out: SymbolCode[] = [];
  for (let i = 0; i < s.length; i += 2) out.push(s.slice(i, i + 2) as SymbolCode);
  return out;
};
