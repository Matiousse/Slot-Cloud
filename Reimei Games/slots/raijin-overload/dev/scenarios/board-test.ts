// Logic test of the 3D board (no rendering): random spins incl. turbo,
// anticipation, slam, locked reels and storms. Result in window.__boardTest.
//   node dev/shoot.cjs ".../dev/harness.html?manual=1&use=board&s=board-test" --plan "wait:20000;eval:console.error(JSON.stringify(window.__boardTest))"
import type { Harness } from '../harness';
import { REELS, ROWS, SYMBOLS, type SymbolCode } from '../../shared/game';

export default async (h: Harness) => {
  const b = h.board;
  const out = { done: false, spins: 0, fails: [] as string[], lateCreates: 0, ms: 0 };
  (window as unknown as { __boardTest: typeof out }).__boardTest = out;
  // logic only: skip rendering
  (h.stage.composer as unknown as { render: () => void }).render = () => {};
  const t0 = performance.now();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = () => SYMBOLS[Math.floor(rnd() * SYMBOLS.length)] as SymbolCode;
  const frame = async () => {
    h.step(16, 1);
    await new Promise((r) => setTimeout(r, 0));
  };
  const until = async (p: Promise<unknown>, max = 2000) => {
    let done = false;
    void p.then(() => (done = true));
    for (let i = 0; i < max && !done; i++) await frame();
    return done;
  };
  const check = (board: SymbolCode[][], tag: string) => {
    for (let r = 0; r < REELS; r++)
      for (let y = 0; y < ROWS; y++)
        if (b.symbolAt(r, y) !== board[r][y]) out.fails.push(`${tag}: reel ${r} row ${y} = ${b.symbolAt(r, y)} expected ${board[r][y]}`);
  };

  for (let n = 0; n < 40; n++) {
    const board = Array.from({ length: REELS }, () => Array.from({ length: ROWS }, pick));
    const turbo = n % 3 === 0;
    const ant = [false, false, n % 4 === 1, n % 4 === 1, n % 5 === 2];
    const slamAt = n % 6 === 5 ? 6 : -1;
    const lock = n % 7 === 3 ? 2 : -1;
    if (lock >= 0) {
      await until(b.expandStorm(lock, 1, 5, true));
      b.lockReel(lock, true);
    }
    b.startSpin(turbo);
    if (b.spinning !== true && lock < 0) out.fails.push(`${n}: not spinning after startSpin`);
    for (let i = 0; i < 10; i++) await frame();
    const order: number[] = [];
    const p = b.stopReels(board, [0, 80, 160, 240 + (ant[3] ? 400 : 0), 320 + (ant[4] ? 800 : 0)], ant, (i) => order.push(i));
    if (slamAt >= 0) {
      for (let i = 0; i < slamAt; i++) await frame();
      b.slam();
    }
    const ok = await until(p);
    if (!ok) out.fails.push(`${n}: stopReels never resolved`);
    for (let i = 0; i < 20; i++) await frame();
    if (b.spinning) out.fails.push(`${n}: still spinning after stop`);
    check(board, `spin ${n}`);
    const expectStops = REELS - (lock >= 0 ? 1 : 0);
    if (order.length !== expectStops) out.fails.push(`${n}: onReelStop called ${order.length}x`);
    if (lock >= 0) {
      if (!b.storms.has(lock)) out.fails.push(`${n}: sticky storm lost`);
      b.clearStorms();
      if (b.storms.size || b.reels.some((r) => r.locked)) out.fails.push(`${n}: clearStorms incomplete`);
    }
    // non-sticky storm cleared on next spin
    if (n % 5 === 0) {
      await until(b.expandStorm(3, 2, 10, false));
      if (!b.storms.has(3)) out.fails.push(`${n}: storm missing after expandStorm`);
      b.showWins([[0, board[0][2], 3, 10, 500]], '€5.00');
      for (let i = 0; i < 5; i++) await frame();
      b.clearWins();
      b.startSpin(true);
      if (b.storms.has(3)) out.fails.push(`${n}: non-sticky storm not cleared by startSpin`);
      const b2 = Array.from({ length: REELS }, () => Array.from({ length: ROWS }, pick));
      await until(b.stopReels(b2, [0, 0, 0, 0, 0], [false, false, false, false, false], () => undefined));
      for (let i = 0; i < 20; i++) await frame();
      check(b2, `quick ${n}`);
    }
    out.spins++;
  }
  b.useFreeSpinReels(2);
  b.startSpin(false);
  for (let i = 0; i < 120; i++) await frame();
  const fb = Array.from({ length: REELS }, () => Array.from({ length: ROWS }, pick));
  await until(b.stopReels(fb, [0, 50, 100, 150, 200], [false, false, false, false, false], () => undefined));
  check(fb, 'free spins');
  b.useFreeSpinReels(0);
  b.setBoard(fb);
  check(fb, 'setBoard');
  out.lateCreates = (b as unknown as { lateCreates: number }).lateCreates;
  out.ms = Math.round(performance.now() - t0);
  out.done = true;
};
