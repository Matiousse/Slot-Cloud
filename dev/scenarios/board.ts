// Board scenario: scripted spins, Thunder Wild expansion, sticky storm, wins,
// scatters. Helpers are exposed on window.__bs for screenshot plans, e.g.
//   eval:__bs.spinTo('storm');step:40@33;shot:a.png;eval:__bs.storm();...
// URL: &s=board            -> scripted board, idle
//      &s=board&bs=demo    -> endless real-time demo loop (no manual=1)
import type { Harness } from '../harness';
import type { LineWin, SymbolCode } from '../../shared/game';

type B = SymbolCode[][];
const col = (s: string) => s.split(' ') as SymbolCode[];

// board[reel][row], row 0 = top
export const BOARDS: Record<string, B> = {
  idle: [col('H1 L2 H3 L5 L4'), col('L3 H1 H2 L1 SC'), col('H4 L5 H1 L2 L3'), col('L1 H3 L4 H2 H1'), col('L2 L4 H4 L5 H3')],
  // Thunder Wild on reel 2 row 3, a line of crowns through row 2
  storm: [col('H2 L4 H1 L5 L3'), col('L1 H3 H1 L2 H4'), col('L4 L5 H3 SW L2'), col('H4 L3 H1 L1 H2'), col('L5 H2 L2 H3 L4')],
  // scatters on reels 0, 2, 4 (bonus)
  scatter: [col('L4 SC H2 L1 H3'), col('H1 L5 L3 H4 L2'), col('L2 H3 L1 SC H4'), col('H2 L4 H1 L5 L3'), col('SC L3 H4 L2 H1')],
  // many wins
  many: [col('H1 H1 H2 H1 L5'), col('H1 H1 H1 H2 H1'), col('L4 L5 H3 SW L2'), col('H1 H1 H1 H1 L1'), col('L5 H1 L2 H1 L4')],
};

const SINGLE: LineWin[] = [[0, 'H1', 4, 25, 3750]];
const MANY: LineWin[] = [
  [0, 'H1', 4, 25, 12500],
  [1, 'H1', 4, 25, 12500],
  [3, 'H1', 4, 25, 12500],
  [5, 'H1', 4, 25, 12500],
  [9, 'H1', 4, 25, 12500],
  [13, 'H1', 5, 25, 50000],
  [17, 'H1', 4, 25, 12500],
];

export default async (h: Harness) => {
  const b = h.board;
  const params = new URLSearchParams(location.search);
  b.setBoard(BOARDS[params.get('board') ?? 'idle'] ?? BOARDS.idle);

  const spinTo = async (name: string, opts: { anticipate?: boolean[]; turbo?: boolean; delays?: number[] } = {}) => {
    const board = BOARDS[name];
    b.clearWins();
    b.startSpin(!!opts.turbo);
    await h.wait(opts.turbo ? 160 : 380);
    const ant = opts.anticipate ?? [false, false, false, false, false];
    const delays = opts.delays ?? [0, 150, 300, 450, 600].map((d, i) => d + (ant.slice(0, i + 1).filter(Boolean).length * 900));
    let landed = 0;
    await b.stopReels(board, delays, ant, (i) => {
      if (board[i].includes('SC')) {
        landed++;
        b.scatterLanded(i);
      }
    });
    return landed;
  };

  const api = {
    h,
    spinTo,
    storm: (reel = 2, row = 3, mult = 25, sticky = false) => b.expandStorm(reel, row, mult, sticky),
    /** same sequence as GameStage.strike (character strike + bolt + shockwave, then expansion) */
    strike: async (reel = 2, row = 3, mult = 25, sticky = false) => {
      const T = h.THREE;
      const target = b.cellWorld(reel, row < 0 ? 2 : row, new T.Vector3()).clone();
      target.z += 0.3;
      const side = await h.character.strike(target);
      const from = h.character.getFistWorld(side, new T.Vector3());
      h.fx.bolt(from, target, { branches: 3, duration: 460 });
      h.fx.shockwave(target, 0x9ff6ff, 1.4);
      h.fx.sparks(target, 70, 0xbff8ff);
      h.env.flash(1);
      h.stage.flash(0.35);
      h.stage.shake(0.7);
      h.cabinet.pulse(1, 0x38e8ff);
      await b.expandStorm(reel, row, mult, sticky);
    },
    sticky: (reel = 1, mult = 10) => b.expandStorm(reel, -1, mult, true).then(() => b.lockReel(reel, true)),
    setStorm: (reel = 3, mult = 5, sticky = true) => b.setStorm(reel, mult, sticky),
    single: (label = '€37.50') => b.showWins(SINGLE, label),
    many: () => b.showWins(MANY),
    cycle: async () => {
      for (const w of MANY) {
        b.showWins([w], `€${(w[4] / 100).toFixed(2)}`);
        await h.wait(1300);
      }
    },
    clearWins: () => b.clearWins(),
    glow: (on = true) => b.glowScatters(on),
    slam: () => b.slam(),
    /** close-up camera (the stage resets position to its base camera every step) */
    cam: (x: number, y: number, z: number, tx = x, ty = y, tz = 0) => {
      const st = h.stage as unknown as { baseCam: import('three').Vector3; camera: import('three').PerspectiveCamera };
      st.camera.clearViewOffset();
      st.baseCam.set(x, y, z);
      st.camera.position.set(x, y, z);
      st.camera.lookAt(tx, ty, tz);
      st.camera.updateProjectionMatrix();
    },
    /** step frames one by one with a GPU sync (keeps SwiftShader's queue short for screenshots) */
    run: (frames: number, ms = 33) => {
      const gl = h.stage.renderer.getContext();
      const px = new Uint8Array(4);
      for (let i = 0; i < frames; i++) {
        h.step(ms, 1);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      }
    },
    late: () => (b as unknown as { lateCreates: number }).lateCreates,
  };
  (window as unknown as { __bs: typeof api }).__bs = api;

  if (params.get('bs') === 'demo') {
    for (;;) {
      await spinTo('storm');
      await h.wait(250);
      await api.storm(2, 3, 25, false);
      await h.wait(300);
      api.single();
      await h.wait(1800);
      await spinTo('many');
      await api.storm(2, 3, 50, false);
      api.many();
      await h.wait(2000);
      await api.cycle();
      await spinTo('scatter', { anticipate: [false, false, false, true, true] });
      api.glow(true);
      await h.wait(2500);
      api.glow(false);
      await api.sticky(1, 10);
      await spinTo('storm');
      await api.storm(2, 3, 5, true);
      b.lockReel(2, true);
      await h.wait(1500);
      await spinTo('idle');
      await h.wait(800);
      b.clearStorms();
      await h.wait(600);
    }
  }
};
