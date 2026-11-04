// PIZZA RUSH reel strips (the tunable part of the math model).
//
// Strips are built deterministically from symbol counts so the math generator
// and the frontend see the exact same reels. Scatters are spread with a
// circular gap of at least ROWS positions (never two on one reel).

import { ROWS, S, type Tier } from './game';

type Counts = Partial<Record<keyof typeof S, number>>;

/** Regular symbol mix (per 100 regular stops), from the 10 up to the Tip jar. */
const REG = { L5: 15, L4: 15, L3: 14, L2: 13, L1: 12, H4: 10, H3: 8, H2: 7, H1: 6 };
const reg = (n: number): Counts =>
  Object.fromEntries(Object.entries(REG).map(([k, v]) => [k, Math.round((v * n) / 100)]));

const BASE_REEL_1: Counts = { ...reg(94), SC: 2 };
const BASE_REEL_MID: Counts = { ...reg(94), WD: 3, SC: 2 };

const FS_REEL_1: Counts = { ...reg(100), SC: 1 };
const FS_MID: Record<Tier, Counts> = {
  1: { ...reg(400), WD: 16, SC: 4 },
  2: { ...reg(400), WD: 14, SC: 4 },
  3: { ...reg(100), WD: 6, SC: 1 },
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
    for (let i = 0; i < (n ?? 0); i++) (id === S.SC ? specials : regular).push(id);
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
      if (a === S.SC) continue;
      if (strip[(i + 1) % len] === a && strip[(i + 2) % len] === a) {
        for (let k = 3; k < len; k++) {
          const j = (i + 2 + k) % len;
          const b = strip[j];
          if (b !== a && b !== S.SC) {
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

const SEED = 0x6b17;

export const BASE_REELS: number[][] = [0, 1, 2, 3, 4].map((r) => buildStrip(r === 0 ? BASE_REEL_1 : BASE_REEL_MID, SEED + 1 + r));

export const FS_REELS: Record<Tier, number[][]> = {
  1: [0, 1, 2, 3, 4].map((r) => buildStrip(r === 0 ? FS_REEL_1 : FS_MID[1], SEED + 11 + r)),
  2: [0, 1, 2, 3, 4].map((r) => buildStrip(r === 0 ? FS_REEL_1 : FS_MID[2], SEED + 21 + r)),
  3: [0, 1, 2, 3, 4].map((r) => buildStrip(r === 0 ? FS_REEL_1 : FS_MID[3], SEED + 31 + r)),
};
