// Character module scenario: exposes helpers for --plan evals.
//   __rj.strike(reel,row)   strike a board cell (bolt via fx)
//   __rj.react(kind) / __rj.mode(m) / __rj.anticipate(on) / __rj.intro()
// URL extras: &act=<react kind|strike|anticipate|intro> to trigger at load.
import type { Harness } from '../harness';

export default async (h: Harness) => {
  const T = h.THREE;
  const tgt = new T.Vector3();
  const from = new T.Vector3();
  const rj = {
    async strike(reel = 2, row = 2) {
      h.board.cellWorld(reel, row, tgt);
      tgt.z += 0.3;
      h.character.anticipate(false);
      const side = await h.character.strike(tgt.clone());
      h.character.getFistWorld(side, from);
      h.fx.bolt(from, tgt, { branches: 3, duration: 460 });
      h.fx.sparks(tgt, 60, 0xbff8ff);
      h.env.flash(1);
      h.stage.flash(0.3);
      return side;
    },
    react: (k: Parameters<typeof h.character.react>[0]) => h.character.react(k),
    mode: (m: Parameters<typeof h.setMode>[0]) => h.setMode(m),
    anticipate: (on: boolean) => h.character.anticipate(on),
    intro: () => h.character.intro(),
  };
  (window as unknown as { __rj: typeof rj }).__rj = rj;
  const act = new URLSearchParams(location.search).get('act');
  if (act === 'strike') void rj.strike();
  else if (act === 'anticipate') rj.anticipate(true);
  else if (act === 'intro') void rj.intro();
  else if (act) rj.react(act as Parameters<typeof h.character.react>[0]);
};
