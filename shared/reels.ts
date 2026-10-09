// Reel strips and multiplier tables (the tunable part of the math model).
//
// Strips are built deterministically from symbol counts so the math generator
// and the frontend always see the exact same reels. Specials (Bonus scatter and
// Storm Wild) are spread with a circular gap of at least ROWS positions, so a
// reel can never show two of them at once (a Storm Wild never hides a scatter).

import { ROWS, S, type Tier } from './game';

type Counts = Partial<Record<keyof typeof S, number>>;

/** Regular symbol mix (per 100 regular stops), from the 10 up to the Crown. */
const REG = { L5: 15, L4: 15, L3: 14, L2: 13, L1: 12, H4: 10, H3: 8, H2: 7, H1: 6 };
const reg = (n: number): Counts =>
  Object.fromEntries(Object.entries(REG).map(([k, v]) => [k, Math.round((v * n) / 100)]));

const BASE_REEL_1: Counts = { ...reg(125), SC: 2 };
const BASE_REEL_MID: Counts = { ...reg(234), WD: 6, SW: 1, SC: 4 };
const BASE_REEL_5: Counts = { ...reg(121), WD: 4, SC: 2 };

const FS_REEL_1: Counts = { ...reg(116), SC: 1 };
const FS_REEL_5: Counts = { ...reg(116), WD: 4, SC: 1 };
const FS_MID: Record<Tier, Counts> = {
  1: { ...reg(232), WD: 6, SW: 5, SC: 2 },
  2: { ...reg(464), WD: 24, SW: 3, SC: 4 },
  3: { ...reg(116), WD: 3, SW: 2, SC: 1 },
};

/** Storm Wild multiplier weights. */
export type MultTable = [mult: number, weight: number][];

export const MULT_BASE: MultTable = [
  [2, 540], [3, 250], [4, 115], [5, 65], [10, 28], [25, 7], [50, 3], [100, 1],
];
export const MULT_FS: Record<Tier, MultTable> = {
  1: [[2, 430], [3, 280], [4, 140], [5, 90], [10, 55], [25, 20], [50, 8], [100, 3]],
  2: [[2, 480], [3, 285], [4, 135], [5, 65], [10, 20]],
  3: [[2, 400], [3, 300], [4, 150], [5, 100], [10, 40], [25, 10]],
};

// ---------------------------------------------------------------- builder

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildStrip(counts: Counts, seed: number): number[] {
  const rnd = mulberry32(seed);
  const specials: number[] = [];
  const regular: number[] = [];
  for (const [k, n] of Object.entries(counts)) {
    const id = S[k as keyof typeof S];
    for (let i = 0; i < (n ?? 0); i++) (id === S.SC || id === S.SW ? specials : regular).push(id);
  }
  const len = specials.length + regular.length;
  if (specials.length * ROWS > len) throw new Error('strip too short for its specials');

  // shuffle helper
  const shuffle = (arr: number[]) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };
  shuffle(specials);
  shuffle(regular);

  // evenly spaced special slots with jitter, keeping a circular gap >= ROWS
  const strip = new Array<number>(len).fill(-1);
  const step = len / Math.max(1, specials.length);
  const slack = Math.max(0, Math.floor(step - ROWS));
  const offset = Math.floor(rnd() * len);
  specials.forEach((sym, i) => {
    const jitter = slack > 0 ? Math.floor(rnd() * (slack + 1)) - Math.floor(slack / 2) : 0;
    const pos = (offset + Math.round(i * step) + (i === 0 ? 0 : jitter) + len) % len;
    strip[pos] = sym;
  });
  // verify gap
  const sp = strip.map((s, i) => (s >= 0 ? i : -1)).filter((i) => i >= 0);
  for (let i = 0; i < sp.length; i++) {
    const a = sp[i];
    const b = sp[(i + 1) % sp.length];
    const gap = sp.length === 1 ? len : (b - a + len) % len;
    if (gap < ROWS) throw new Error(`special gap too small (${gap})`);
  }
  let r = 0;
  for (let i = 0; i < len; i++) if (strip[i] < 0) strip[i] = regular[r++];

  // break up runs of 3+ identical regular symbols (keeps boards looking varied)
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < len; i++) {
      const a = strip[i];
      if (a === S.SC || a === S.SW) continue;
      if (strip[(i + 1) % len] === a && strip[(i + 2) % len] === a) {
        for (let k = 3; k < len; k++) {
          const j = (i + 2 + k) % len;
          const b = strip[j];
          if (b !== a && b !== S.SC && b !== S.SW) {
            strip[(i + 2) % len] = b;
            strip[j] = a;
            break;
          }
        }
      }
    }
  }
  return strip;
}

const SEED = 0xc10d;

export const BASE_REELS: number[][] = [
  buildStrip(BASE_REEL_1, SEED + 1),
  buildStrip(BASE_REEL_MID, SEED + 2),
  buildStrip(BASE_REEL_MID, SEED + 3),
  buildStrip(BASE_REEL_MID, SEED + 4),
  buildStrip(BASE_REEL_5, SEED + 5),
];

export const FS_REELS: Record<Tier, number[][]> = {
  1: [
    buildStrip(FS_REEL_1, SEED + 11),
    buildStrip(FS_MID[1], SEED + 12),
    buildStrip(FS_MID[1], SEED + 13),
    buildStrip(FS_MID[1], SEED + 14),
    buildStrip(FS_REEL_5, SEED + 15),
  ],
  2: [
    buildStrip(FS_REEL_1, SEED + 21),
    buildStrip(FS_MID[2], SEED + 22),
    buildStrip(FS_MID[2], SEED + 23),
    buildStrip(FS_MID[2], SEED + 24),
    buildStrip(FS_REEL_5, SEED + 25),
  ],
  3: [
    buildStrip(FS_REEL_1, SEED + 31),
    buildStrip(FS_MID[3], SEED + 32),
    buildStrip(FS_MID[3], SEED + 33),
    buildStrip(FS_MID[3], SEED + 34),
    buildStrip(FS_REEL_5, SEED + 35),
  ],
};
