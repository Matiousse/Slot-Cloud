// Rigs Rig Lab : chargement, instances, mise à jour à chaque image.
import * as PIXI from '../vendor/pixi.min.mjs';
import { buildSymbol, loadRig } from '../vendor/symbol-rig.js';
import { SYMBOLS, type SymbolCode } from '../../shared/game';

export { PIXI };

interface RigData {
  rig: any;
  tex: Record<string, any>;
}

const data: Partial<Record<string, RigData>> = {};
const live = new Set<any>();

export async function loadAllRigs(onProgress?: (k: number) => void) {
  const names = [...SYMBOLS, 'tony'];
  let n = 0;
  await Promise.all(
    names.map(async (s) => {
      data[s] = await loadRig(PIXI, `anims/${s}`);
      onProgress?.(++n / names.length);
    }),
  );
}

/** Instance animée d'un rig (container Pixi avec .play / .update). */
export function makeRig(name: string): any {
  const d = data[name]!;
  const sym = buildSymbol(PIXI, d.rig, d.tex);
  sym.rigName = name;
  live.add(sym);
  return sym;
}

export function destroyRig(sym: any) {
  live.delete(sym);
  sym.destroy({ children: true });
}

export function updateRigs(dt: number) {
  for (const s of live) if (!s.destroyed) s.update(dt);
}

/** Texture fixe d'un symbole (pendant que les rouleaux tournent : pas besoin de rig). */
export function symbolTexture(code: SymbolCode) {
  const d = data[code]!;
  const corps = d.rig.parts.find((p: any) => p.src)?.src;
  return d.tex[corps];
}

export function rigSize(name: string): [number, number] {
  return data[name]!.rig.size;
}
