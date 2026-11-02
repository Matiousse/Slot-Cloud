// L5..L1: extruded Orbitron glyphs. Enamel face (HDR gradient + sheen sweep,
// clearcoat), polished chrome bevel walls, a thick black-steel backing shell with
// a gold edge for silhouette contrast, and a coloured back glow.

import * as THREE from 'three';
import type { Assets } from '../assets';
import { letterFaceMaterial } from '../shaders';
import type { SymbolDef } from '../types';

interface LetterSpec {
  text: string;
  color: number;
  /** cap height in world units */
  height: number;
  /** horizontal squeeze for wide glyphs */
  squeeze?: number;
}

function letterDef(key: string, spec: LetterSpec): SymbolDef {
  const size = spec.height / 0.72;
  return {
    color: spec.color,
    backGlow: 0.16,
    sway: 0.2,
    bob: 0.012,
    glints: [
      [-0.22, spec.height * 0.42, 0.1],
      [0.24, -spec.height * 0.38, 0.1],
      [0.18, spec.height * 0.4, 0.1],
    ],
    build(a: Assets) {
      const root = new THREE.Group();
      root.name = `L-${spec.text}`;
      const base = new THREE.Color(spec.color);
      const top = base.clone().lerp(new THREE.Color(1, 1, 1), 0.3).multiplyScalar(0.85);
      const bottom = base.clone().multiplyScalar(0.55);
      const face = letterFaceMaterial(a, key, top, bottom, spec.height / 2);
      const sx = spec.squeeze ?? 1;

      // main glyph: enamel faces + chrome bevel walls
      const main = new THREE.Mesh(
        a.text(spec.text, { font: 'display', size, depth: 0.1, bevel: 0.032, bevelSegments: 4, curveSegments: 10 }),
        [face, a.chrome()],
      );
      main.scale.set(sx, 1, 1);
      main.position.z = 0.07;
      main.name = 'glyph';

      // backing shell: thicker outline (bigger bevel) in black steel, gold rim walls
      const shell = new THREE.Mesh(
        a.text(spec.text, { font: 'display', size, depth: 0.04, bevel: 0.07, bevelSegments: 3, curveSegments: 10 }),
        [a.blackSteel(), a.gold()],
      );
      shell.scale.set(sx, 1, 1);
      shell.position.z = -0.03;
      root.add(shell, main);
      return root;
    },
  };
}

export const L5 = letterDef('L5', { text: '10', color: 0x2de2c0, height: 0.5, squeeze: 0.86 });
export const L4 = letterDef('L4', { text: 'J', color: 0x3aa0ff, height: 0.6 });
export const L3 = letterDef('L3', { text: 'Q', color: 0xa66bff, height: 0.6 });
export const L2 = letterDef('L2', { text: 'K', color: 0xff4fc8, height: 0.6 });
export const L1 = letterDef('L1', { text: 'A', color: 0xff9a1f, height: 0.6 });
