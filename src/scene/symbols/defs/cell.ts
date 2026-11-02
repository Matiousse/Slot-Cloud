// H4 — Power Cell: clear glass capsule with a swirling HDR plasma core and a
// glowing electron coil, chunky machined gunmetal end caps with gold terminals,
// gold seal rings, cyan neon indicator bands, three armoured side rails and a
// gold lightning emblem. Leans slightly for dynamism.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { extrude, lathe, merge, xf } from '../geo';
import { glassMaterial, plasmaMaterial } from '../shaders';
import type { SymbolDef } from '../types';
import { grp, mk } from './util';

const TAU = Math.PI * 2;
const GH = 0.25; // glass half height

/** Lightning-bolt emblem shape (~1 unit tall). */
export function boltShape(): THREE.Shape {
  const s = new THREE.Shape();
  const p: [number, number][] = [
    [0.12, 0.5],
    [-0.28, -0.02],
    [-0.02, -0.02],
    [-0.14, -0.5],
    [0.3, 0.08],
    [0.04, 0.08],
    [0.2, 0.5],
  ];
  s.moveTo(p[0][0], p[0][1]);
  for (let i = 1; i < p.length; i++) s.lineTo(p[i][0], p[i][1]);
  s.lineTo(p[0][0], p[0][1]);
  return s;
}

function capProfile(sign: number): [number, number][] {
  const pts: [number, number][] = [
    [0.0, 0.36],
    [0.07, 0.36],
    [0.07, 0.35],
    [0.152, 0.35],
    [0.186, 0.332],
    [0.194, 0.312],
    [0.184, 0.303],
    [0.184, 0.288],
    [0.198, 0.282],
    [0.198, 0.262],
    [0.172, 0.254],
    [0.168, 0.244],
    [0.0, 0.244],
  ];
  return pts.map(([r, y]) => [r, y * sign] as [number, number]);
}

export const H4: SymbolDef = {
  color: 0x38e8ff,
  backGlow: 0.26,
  sway: 0.18,
  bob: 0.014,
  glints: [
    [-0.08, 0.3, 0.2],
    [0.1, -0.3, 0.2],
    [-0.05, 0.05, 0.18],
  ],
  build(a) {
    const root = grp('cell');
    const lean = grp('lean', [0, -0.005, 0], [0.1, 0, -0.26]);
    root.add(lean);
    const body = grp('body');
    body.scale.set(1.04, 1.04, 0.8);
    lean.add(body);

    // plasma core + glowing coil
    const core = new THREE.CylinderGeometry(0.078, 0.078, GH * 2, 32, 1, true);
    body.add(mk(a, core, plasmaMaterial(a), 'core'));
    const coilPts: THREE.Vector3[] = [];
    const turns = 4.5;
    for (let i = 0; i <= 160; i++) {
      const f = i / 160;
      const ang = f * turns * TAU;
      coilPts.push(new THREE.Vector3(Math.sin(ang) * 0.112, -GH + 0.03 + f * (GH * 2 - 0.06), Math.cos(ang) * 0.112));
    }
    const coil = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPts), 220, 0.0055, 6, false);
    body.add(mk(a, coil, a.neon(0x7ff6ff, 1.8), 'coil'));

    // glass capsule (rendered after the core)
    const glass = lathe(
      [
        [0.0, -GH - 0.012],
        [0.15, -GH - 0.012],
        [0.158, -GH],
        [0.158, GH],
        [0.15, GH + 0.012],
        [0.0, GH + 0.012],
      ],
      48,
    );
    const gm = mk(a, glass, glassMaterial(a, new THREE.Color(0.06, 0.3, 0.42)), 'glass');
    gm.renderOrder = 3;
    body.add(gm);

    // machined gunmetal caps
    const capTop = lathe(capProfile(1), 48);
    const capBot = lathe(capProfile(-1), 48);
    body.add(mk(a, merge([capTop, capBot]), a.gunmetal(), 'caps'));

    // gold: terminals, seal rings, cap bands, emblem
    const gold: THREE.BufferGeometry[] = [];
    const term = (s: number) => {
      const g = lathe(
        s > 0
          ? [[0, 0.405], [0.032, 0.405], [0.046, 0.395], [0.05, 0.37], [0.062, 0.364], [0.062, 0.355], [0, 0.355]]
          : [[0, -0.355], [0.062, -0.355], [0.062, -0.364], [0.05, -0.37], [0.046, -0.395], [0.032, -0.405], [0, -0.405]],
        32,
      );
      return g;
    };
    gold.push(term(1), term(-1));
    for (const s of [1, -1]) {
      gold.push(xf(new THREE.TorusGeometry(0.165, 0.012, 10, 48), [0, s * (GH - 0.002), 0], [Math.PI / 2, 0, 0]));
      gold.push(xf(new THREE.TorusGeometry(0.186, 0.006, 8, 48), [0, s * 0.296, 0], [Math.PI / 2, 0, 0]));
    }
    const emblem = extrude(boltShape(), 0.02, 0.008, 2, 4);
    emblem.scale(0.09, 0.09, 1);
    emblem.translate(0, -0.3, 0.2);
    gold.push(emblem);
    body.add(mk(a, merge(gold), a.gold(), 'gold'));

    // neon indicator bands on the caps
    const bands = merge([
      xf(new THREE.TorusGeometry(0.2, 0.0045, 6, 64), [0, 0.272, 0], [Math.PI / 2, 0, 0]),
      xf(new THREE.TorusGeometry(0.2, 0.0045, 6, 64), [0, -0.272, 0], [Math.PI / 2, 0, 0]),
    ]);
    body.add(mk(a, bands, a.neon(0x38e8ff, 2.0), 'bands'));

    // side rails (armoured cage) with rivets
    const rails: THREE.BufferGeometry[] = [];
    for (const ang of [Math.PI * 0.42, -Math.PI * 0.42, Math.PI]) {
      const r = new RoundedBoxGeometry(0.03, GH * 2 + 0.02, 0.024, 2, 0.008);
      rails.push(xf(r, [Math.sin(ang) * 0.172, 0, Math.cos(ang) * 0.172], [0, ang, 0]));
      for (const y of [-0.17, 0, 0.17]) rails.push(xf(new THREE.SphereGeometry(0.008, 8, 6), [Math.sin(ang) * 0.186, y, Math.cos(ang) * 0.186]));
    }
    body.add(mk(a, merge(rails), a.blackSteel(), 'rails'));
    return root;
  },
};
