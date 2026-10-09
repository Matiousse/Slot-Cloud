// Per-code pool of SymbolViews. Views are created up front (warmup) from the
// worst case visible counts of the reel strips, so spinning never allocates.

import * as THREE from 'three';
import { REELS, SYMBOLS, S, type SymbolCode } from '../../../shared/game';
import { BASE_REELS, FS_REELS } from '../../../shared/reels';
import type { SymbolKit, SymbolView } from '../contracts';

/** Visible slots per reel: one above, 5 rows, one below. */
export const SLOTS = 7;

export class SymbolPool {
  private free = new Map<SymbolCode, SymbolView[]>();
  /** Views created after warmup (should stay 0; exposed for debugging). */
  lateCreates = 0;
  private warm = false;

  constructor(
    private kit: SymbolKit,
    private parent: THREE.Object3D,
  ) {
    for (const c of SYMBOLS) this.free.set(c, []);
  }

  /** Worst case number of simultaneously visible views per code over every strip set. */
  static warmCounts(): Record<SymbolCode, number> {
    const need = {} as Record<SymbolCode, number>;
    for (const c of SYMBOLS) need[c] = 0;
    const sets = [BASE_REELS, FS_REELS[1], FS_REELS[2], FS_REELS[3]];
    for (let r = 0; r < REELS; r++) {
      const best = new Map<number, number>();
      for (let s = 0; s < sets.length; s++) {
        const strip = sets[s][r];
        const fs = s > 0;
        const len = strip.length;
        for (let i = 0; i < len; i++) {
          const counts = new Map<number, number>();
          for (let k = 0; k < SLOTS; k++) {
            let id = strip[(i + k) % len];
            if (fs && id === S.SW) id = S.WD; // fillers never show SW in free spins
            counts.set(id, (counts.get(id) ?? 0) + 1);
          }
          for (const [id, n] of counts) best.set(id, Math.max(best.get(id) ?? 0, n));
        }
      }
      for (const [id, n] of best) need[SYMBOLS[id]] += n;
    }
    // safety margin (final boards are injected through the stop queue)
    for (const c of SYMBOLS) need[c] = Math.min(REELS * SLOTS, need[c] + 2);
    // storm wilds expand: at most one per reel shows
    need.SW = Math.max(need.SW, REELS);
    need.SC = Math.max(need.SC, REELS + 1);
    return need;
  }

  warmup() {
    const counts = SymbolPool.warmCounts();
    for (const c of SYMBOLS) {
      const list = this.free.get(c)!;
      while (list.length < counts[c]) list.push(this.make(c));
    }
    this.warm = true;
  }

  private make(code: SymbolCode): SymbolView {
    const v = this.kit.create(code);
    v.object.visible = false;
    v.object.matrixAutoUpdate = true;
    this.parent.add(v.object);
    if (this.warm) this.lateCreates++;
    return v;
  }

  acquire(code: SymbolCode): SymbolView {
    const v = this.free.get(code)!.pop() ?? this.make(code);
    v.object.visible = true;
    return v;
  }

  release(v: SymbolView) {
    v.object.visible = false;
    this.free.get(v.code)!.push(v);
  }
}
