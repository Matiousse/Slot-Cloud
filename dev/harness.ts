// Dev harness: builds the full 3D scene from whatever real modules exist
// (stubs otherwise) so each module can be previewed in context.
//
// URL params:
//   use=character,environment,...   real modules to load (default: all that exist)
//   manual=1                        no rAF loop; drive with window.__step(ms, frames)
//   s=<name>                        run dev/scenarios/<name>.ts after setup
//   mode=base|overcharge|lock|god   scene mode
//   cam=char|board|wide             camera override for close-ups (default: real game framing)
//   w,h                             (set by the screenshot tool via viewport)
import * as THREE from 'three';
import { Stage } from '../src/scene/core';
import { clock } from '../src/render/anim';
import type { Board3D, Cabinet, Character, Environment, Fx, SceneMode, SymbolKit } from '../src/scene/contracts';
import * as stubs from '../src/scene/stubs';

const params = new URLSearchParams(location.search);
const modules = import.meta.glob('../src/scene/*/index.ts');
const scenarios = import.meta.glob('./scenarios/*.ts');
const has = (name: string) => `../src/scene/${name}/index.ts` in modules;
const useList = params.get('use');
const wants = (name: string) => has(name) && (!useList || useList === 'all' || useList.split(',').includes(name));
const load = async <T>(name: string, fn: string, ...args: unknown[]): Promise<T | null> => {
  if (!wants(name)) return null;
  const m = (await modules[`../src/scene/${name}/index.ts`]()) as Record<string, (...a: unknown[]) => T>;
  if (typeof m[fn] !== 'function') throw new Error(`${name}/index.ts must export ${fn}()`);
  return m[fn](...args);
};

export interface Harness {
  stage: Stage;
  env: Environment;
  character: Character;
  kit: SymbolKit;
  board: Board3D;
  cabinet: Cabinet;
  fx: Fx;
  THREE: typeof THREE;
  setMode(m: SceneMode): void;
  step(ms: number, frames?: number): void;
  wait(ms: number): Promise<void>;
}

async function main() {
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const stage = new Stage(canvas);
  const ctx = stage.ctx;
  const env = (await load<Environment>('environment', 'createEnvironment', ctx)) ?? stubs.createEnvironmentStub(ctx);
  const kit = (await load<SymbolKit>('symbols', 'createSymbolKit', ctx)) ?? stubs.createSymbolKitStub();
  const cabinet = (await load<Cabinet>('cabinet', 'createCabinet', ctx)) ?? stubs.createCabinetStub();
  const board = (await load<Board3D>('board', 'createBoard', ctx, kit)) ?? stubs.createBoardStub(ctx, kit);
  const character = (await load<Character>('character', 'createCharacter', ctx)) ?? stubs.createCharacterStub();
  const fx = (await load<Fx>('fx', 'createFx', ctx)) ?? stubs.createFxStub(ctx);
  for (const m of [env, cabinet, board, character, fx]) stage.add(m);
  stage.onLayout((l) => {
    env.setLayout(l.kind);
    character.setLayout(l.kind);
  });

  const cam = params.get('cam');
  const camOverride = () => {
    if (!cam) return;
    stage.camera.clearViewOffset();
    if (cam === 'char') stage.camera.position.set(-1.5, 4.2, 9), stage.camera.lookAt(-1, 3.6, -2);
    if (cam === 'board') stage.camera.position.set(0, 0, 13), stage.camera.lookAt(0, 0, 0);
    if (cam === 'wide') stage.camera.position.set(0, 2, 34), stage.camera.lookAt(0, 2, 0);
    if (cam === 'side') stage.camera.position.set(14, 4, 10), stage.camera.lookAt(0, 3, -2);
    stage.camera.updateProjectionMatrix();
  };
  stage.onLayout(camOverride);

  const h: Harness = {
    stage, env, character, kit, board, cabinet, fx, THREE,
    setMode(m) {
      env.setMode(m);
      character.setMode(m);
      cabinet.setMode(m);
    },
    step(ms, frames = 1) {
      for (let i = 0; i < frames; i++) {
        const dt = clock.tick(ms);
        stage.step(dt, ms);
        if (cam) stage.camera.position.copy(stage.camera.position); // keep override
      }
    },
    wait: (ms) => clock.wait(ms),
  };
  (window as any).__h = h;
  (window as any).__step = (ms = 33, frames = 1) => h.step(ms, frames);
  const mode = params.get('mode') as SceneMode | null;
  if (mode) h.setMode(mode);

  const hud = document.getElementById('hud')!;
  hud.textContent = `real: ${['environment', 'symbols', 'cabinet', 'board', 'character', 'fx'].filter(wants).join(', ') || 'none'}`;

  const s = params.get('s');
  if (s && scenarios[`./scenarios/${s}.ts`]) {
    const mod = (await scenarios[`./scenarios/${s}.ts`]()) as { default: (h: Harness) => Promise<void> | void };
    void mod.default(h);
  }

  if (params.get('manual') !== '1') {
    let last = performance.now();
    const loop = (t: number) => {
      const dtReal = Math.min(50, t - last);
      last = t;
      h.step(dtReal);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  } else h.step(16, 2);
  (window as any).__ready = true;
}

main().catch((e) => {
  document.getElementById('hud')!.textContent = 'ERROR: ' + (e?.stack ?? e);
  (window as any).__error = String(e?.stack ?? e);
  console.error(e);
});
