// Symbol showcase for the dev harness.
//   &sym=grid (default)  all 12 symbols (rows 0-2) + a states sampler (rows 3-4)
//   &sym=board           a random 5x5 board fill (in-context density check)
//   &sym=big&code=H1     one symbol, 3.6x, centred (close-up inspection)
//   &sym=icons           renders the HTML icons and shows them as <img> overlay
// window.__sym = { views, set(state, codes?), cycle() } for --plan evals.
import type { Harness } from '../harness';
import type { SymbolState, SymbolView } from '../../src/scene/contracts';
import { SYMBOLS, type SymbolCode } from '../../shared/game';

export default async (h: Harness) => {
  const q = new URLSearchParams(location.search);
  const mode = q.get('sym') ?? 'grid';
  const THREE = h.THREE;
  h.board.object.visible = false;
  const root = new THREE.Group();
  root.name = 'symbols-showcase';
  h.stage.scene.add(root);
  const views: SymbolView[] = [];
  const add = (code: SymbolCode, r: number, y: number, state: SymbolState = 'idle', scale = 1) => {
    const v = h.kit.create(code);
    v.object.position.set(r - 2, 2 - y, 0);
    v.object.scale.setScalar(scale);
    v.setState(state);
    root.add(v.object);
    views.push(v);
    return v;
  };

  if (mode === 'grid') {
    SYMBOLS.forEach((c, i) => add(c, i % 5, Math.floor(i / 5)));
    const states: [SymbolCode, SymbolState][] = [
      ['H1', 'win'], ['SC', 'trigger'], ['WD', 'win'], ['H2', 'land'], ['L3', 'dim'],
      ['L1', 'spin'], ['H4', 'spin'], ['SW', 'win'], ['H3', 'dim'], ['L2', 'dim'],
    ];
    states.forEach(([c, s], i) => add(c, (i % 5), 3 + Math.floor(i / 5), s));
    // the 12th slot of row 2 is free: (2,2), (3,2), (4,2)
    add('H1', 2, 2, 'idle');
    add('SC', 3, 2, 'idle');
    add('SW', 4, 2, 'idle');
  } else if (mode === 'board') {
    const weights: SymbolCode[] = ['L5', 'L5', 'L4', 'L4', 'L3', 'L3', 'L2', 'L2', 'L1', 'L1', 'H4', 'H3', 'H2', 'H1', 'WD', 'SW', 'SC'];
    let seed = +(q.get('seed') ?? 7);
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let r = 0; r < 5; r++) for (let y = 0; y < 5; y++) add(weights[Math.floor(rnd() * weights.length)], r, y);
  } else if (mode === 'sheet') {
    // all 12 large: 4 x 3 at 1.15 spacing, close camera
    SYMBOLS.forEach((c, i) => {
      const v = add(c, 0, 0, (q.get('state') as SymbolState) ?? 'idle');
      v.object.position.set(((i % 4) - 1.5) * 1.15, (1 - Math.floor(i / 4)) * 1.15, 0);
    });
    const cam = h.stage.camera;
    cam.clearViewOffset();
    const d = 3.45 / 2 / Math.tan((15 * Math.PI) / 180);
    (h.stage as unknown as { baseCam: import('three').Vector3 }).baseCam.set(0, 0, d);
    cam.position.set(0, 0, d);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
  } else if (mode === 'big') {
    const code = (q.get('code') ?? 'H1') as SymbolCode;
    const v = add(code, 2, 2, (q.get('state') as SymbolState) ?? 'idle', +(q.get('scale') ?? 1));
    v.object.position.set(0, 0, 0);
    // close-up camera (overrides the harness framing)
    const cam = h.stage.camera;
    cam.clearViewOffset();
    // Stage.step() re-applies its private base position every frame (shake)
    (h.stage as unknown as { baseCam: import('three').Vector3 }).baseCam.set(0, 0, +(q.get('dist') ?? 3.2));
    cam.position.set(0, 0, +(q.get('dist') ?? 3.2));
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
  } else if (mode === 'icons') {
    const { renderSymbolIcons } = await import('../../src/scene/symbols/icons');
    const t0 = performance.now();
    const icons = renderSymbolIcons(h.stage.renderer, +(q.get('px') ?? 128));
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;display:flex;flex-wrap:wrap;align-content:center;justify-content:center;gap:6px;background:radial-gradient(#1a2550,#04050c);padding:20px';
    for (const c of SYMBOLS) {
      const img = document.createElement('img');
      img.src = icons[c];
      img.style.cssText = 'width:160px;height:160px;background:rgba(255,255,255,0.03);border-radius:12px';
      el.appendChild(img);
    }
    const info = document.createElement('div');
    info.textContent = `icons in ${(performance.now() - t0).toFixed(0)} ms`;
    info.style.cssText = 'width:100%;text-align:center;color:#8fa;font:12px monospace';
    el.appendChild(info);
    document.body.appendChild(el);
  }

  h.stage.add({ update: (dt: number, t: number) => views.forEach((v) => v.update(dt, t)) });

  const api = {
    views,
    set(state: SymbolState, codes?: SymbolCode[]) {
      views.forEach((v) => (!codes || codes.includes(v.code)) && v.setState(state));
    },
    async cycle() {
      for (const s of ['spin', 'land', 'idle', 'win', 'dim', 'idle', 'trigger', 'idle'] as SymbolState[]) {
        api.set(s);
        await h.wait(s === 'win' || s === 'trigger' ? 1800 : 700);
      }
    },
  };
  (window as unknown as { __sym: typeof api }).__sym = api;
};
