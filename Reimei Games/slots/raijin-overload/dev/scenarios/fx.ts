// FX showcase. URL: ...&s=fx&fx=<name>   (names below; default 'show' = timed sequence)
// Also exposes window.__fx.<name>() for --plan eval.
import type { Harness } from '../harness';

export default async (h: Harness) => {
  const { THREE, fx, board, character } = h;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const cell = (r: number, y: number) => board.cellWorld(r, y, V());
  const fist = (side: 'left' | 'right' = 'right') => character.getFistWorld(side, V());
  const demo: Record<string, () => void> = {
    bolt: () => fx.bolt(fist('right'), cell(2, 2)),
    boltHold: () => fx.bolt(fist('right'), cell(2, 2), { duration: 5000 }),
    boltL: () => fx.bolt(fist('left'), cell(1, 3)),
    boltGold: () => fx.bolt(fist('right'), cell(3, 1), { color: 0xffc93c, width: 0.11 }),
    boltSky: () => fx.bolt(V(-1.5, 9, -3), cell(1, 1), { width: 0.13, branches: 4, duration: 520 }),
    triple: () => {
      fx.bolt(fist('right'), cell(1, 2));
      fx.bolt(fist('right'), cell(2, 2));
      fx.bolt(fist('right'), cell(3, 2));
    },
    sparks: () => fx.sparks(cell(2, 2), 70),
    sparksGold: () => fx.sparks(cell(1, 1), 60, 0xffc93c),
    shock: () => fx.shockwave(cell(2, 2)),
    shockRed: () => fx.shockwave(cell(2, 2), 0xff3b30, 2.2),
    rain: () => fx.coins(90, 'rain'),
    fountain: () => fx.coins(70, 'fountain'),
    aura: () => fx.aura(cell(2, 2), 4000),
    auraGold: () => fx.aura(cell(4, 4), 4000, 0xffc93c),
    auras: () => {
      fx.aura(cell(0, 2), 4000);
      fx.aura(cell(2, 2), 4000, 0xffc93c);
      fx.aura(cell(4, 2), 4000, 0xff2fa0);
    },
    show: () => void show(),
  };
  const show = async () => {
    fx.aura(cell(2, 2), 1600);
    await h.wait(900);
    fx.bolt(fist('right'), cell(2, 2));
    await h.wait(600);
    fx.shockwave(cell(2, 2), 0xffc93c, 2.4);
    fx.coins(80, 'fountain');
    await h.wait(1200);
    fx.coins(100, 'rain');
  };
  (window as unknown as { __fx: typeof demo }).__fx = demo;
  const which = new URLSearchParams(location.search).get('fx') ?? 'show';
  demo[which]?.();
};
