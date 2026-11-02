// Simulation worker: runs slices of a pool, either payouts only (fast pass) or
// full books for selected simulation indices (recording pass).
import { parentPort } from 'node:worker_threads';
import { Engine, makeRng, type RoundResult } from '../shared/engine';
import type { Tier } from '../shared/game';

export type PoolKind = 'nb' | Tier;

const eng = new Engine(makeRng(1));

export function runSim(pool: PoolKind, seed: number, i: number, record: boolean): RoundResult {
  eng.setRng(makeRng(seed, i));
  return pool === 'nb' ? eng.noBonus(record) : eng.bonus(pool, record);
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
