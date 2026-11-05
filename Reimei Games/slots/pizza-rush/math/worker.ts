// Simulation worker: runs slices of a pool, either payouts only (fast pass) or
// full books for selected simulation indices (recording pass).
import { parentPort } from 'node:worker_threads';
import { Engine, makeRng, type RoundResult } from '../shared/engine';
import type { Tier } from '../shared/game';

export type PoolKind = 'nb' | Tier | 'rush' | 'r1' | 'r2' | 'r3' | 'w2';

const eng = new Engine(makeRng(1));

export function runSim(pool: PoolKind, seed: number, i: number, record: boolean): RoundResult {
  eng.setRng(makeRng(seed, i));
  if (pool === 'nb') return eng.noBonus(record);
  if (pool === 'rush') return eng.rush(record);
  if (pool === 'r1' || pool === 'r2' || pool === 'r3') return eng.rush(record, Number(pool[1]) as Tier);
  if (pool === 'w2') return eng.bonusWild(2, record);
  return eng.bonus(pool, record);
}

parentPort?.on('message', (msg) => {
  if (msg.cmd === 'payouts') {
    const { pool, seed, start, end } = msg;
    const out = new Int32Array(end - start);
    for (let i = start; i < end; i++) out[i - start] = runSim(pool, seed, i, false).payout;
    parentPort!.postMessage({ id: msg.id, out }, [out.buffer]);
  } else if (msg.cmd === 'books') {
    const { pool, seed, indices, expected } = msg as {
      pool: PoolKind;
      seed: number;
      indices: number[];
      expected: number[];
    };
    const events: string[] = [];
    for (let k = 0; k < indices.length; k++) {
      const r = runSim(pool, seed, indices[k], true);
      if (r.payout !== expected[k]) throw new Error(`non-deterministic sim ${pool}#${indices[k]}`);
      events.push(JSON.stringify(r.events));
    }
    parentPort!.postMessage({ id: msg.id, events });
  }
});
