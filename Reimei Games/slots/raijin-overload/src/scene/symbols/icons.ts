// HTML icons (paytable, buy menu): each symbol rendered offscreen with the
// shared light rig + studio reflections, mini bloom, ACES, transparent PNG.

import * as THREE from 'three';
import { SYMBOLS, type SymbolCode } from '../../../shared/game';
import { Assets } from './assets';
import { Baker } from './bake';
import { DEFS } from './defs';

/** Render every symbol to a `px` x `px` PNG data URL (transparent background). */
export function renderSymbolIcons(renderer: THREE.WebGLRenderer, px: number): Record<SymbolCode, string> {
  const a = new Assets(renderer);
  const baker = new Baker(renderer);
  baker.scene.environment = a.envMap;
  const backGeo = new THREE.PlaneGeometry(1.25, 1.25);
  const out = {} as Record<SymbolCode, string>;
  a.time.value = 1.35; // pleasant shader phase (sheen off, plasma mid-swirl)
  for (const code of SYMBOLS) {
    const def = DEFS[code];
    const root = new THREE.Group();
    const model = def.build(a);
    // slight 3/4 turn so the depth reads in a flat icon
    model.rotation.set(0.06, -0.2, 0);
    const back = new THREE.Mesh(backGeo, a.additive('back', a.softGlow(), def.color, def.backGlow * 0.8));
    back.position.z = -0.2;
    root.add(back, model);
    out[code] = baker.icon(root, { size: 1.08, px: Math.max(16, Math.round(px)) });
  }
  backGeo.dispose();
  baker.dispose();
  a.dispose();
  return out;
}
