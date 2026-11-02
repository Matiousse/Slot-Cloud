// SW — Thunder Wild: crackling plasma-globe orb (pseudo-volumetric lightning
// shader) inside a polished gold cage: thick front ring with studs, two
// gyroscope meridian rings that slowly turn, four lightning-bolt spikes toward
// the corners, kanji 雷 floating in front and a crimson WILD tag.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { extrude, merge, roundedRect, xf } from '../geo';
import { orbMaterial } from '../shaders';
import type { SymbolDef } from '../types';
import { boltShape } from './cell';
import { grp, mk } from './util';

const TAU = Math.PI * 2;
const OR = 0.285;

export const SW: SymbolDef = {
  color: 0x38e8ff,
  backGlow: 0.42,
  sway: 0.14,
  bob: 0.012,
  glints: [
    [-0.26, 0.26, 0.12],
    [0.27, -0.25, 0.12],
    [0.1, 0.18, 0.2],
  ],
  build(a) {
    const root = grp('thunder');
    const gold = a.gold();

    // orb (flattened in depth to respect the cell volume)
    const orb = new THREE.SphereGeometry(OR, 48, 32);
    orb.scale(1, 1, 0.62);
    root.add(mk(a, orb, orbMaterial(a), 'orb'));

    // front cage ring + inner bead + studs + spikes
    const parts: THREE.BufferGeometry[] = [];
    parts.push(new THREE.TorusGeometry(0.33, 0.03, 16, 72));
    parts.push(xf(new THREE.TorusGeometry(0.3, 0.008, 8, 72), [0, 0, 0.018]));
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * TAU;
      parts.push(xf(new THREE.SphereGeometry(0.014, 10, 6), [Math.cos(ang) * 0.33, Math.sin(ang) * 0.33, 0.028]));
    }
    for (let i = 0; i < 4; i++) {
      const ang = Math.PI / 4 + (i / 4) * TAU;
      const b = extrude(boltShape(), 0.03, 0.01, 2, 4);
      b.scale(0.2, 0.2, 1);
      b.rotateZ(ang - Math.PI / 2);
      b.translate(Math.cos(ang) * 0.4, Math.sin(ang) * 0.4, 0);
      parts.push(b);
    }
    root.add(mk(a, merge(parts), gold, 'cage'));

    // gyroscope meridians (animated)
    const flat = grp('gyroFlat');
    flat.scale.set(1, 1, 0.62);
    const gA = grp('gyroA');
    gA.add(mk(a, new THREE.TorusGeometry(0.305, 0.008, 8, 64), a.goldSatin(), '', [0, 0, 0], [0, Math.PI / 2, 0]));
    const gB = grp('gyroB');
    gB.add(mk(a, new THREE.TorusGeometry(0.296, 0.008, 8, 64), a.goldSatin(), '', [0, 0, 0], [Math.PI / 2, 0, 0]));
    flat.add(gA, gB);
    root.add(flat);

    // kanji 雷: dark steel face, glowing gold edges
    const k = new THREE.Mesh(a.text('雷', { font: 'kanji', size: 0.3, depth: 0.03, bevel: 0.008, bevelSegments: 2, curveSegments: 6 }), [
      a.blackSteel(),
      a.neon(0xffd36b, 1.6),
    ]);
    k.name = 'kanji';
    k.position.set(0, 0.012, 0.2);
    root.add(k);

    // WILD tag at the bottom of the ring
    const tag = grp('tag', [0, -0.355, 0.06]);
    tag.add(mk(a, extrude(roundedRect(0.36, 0.105, 0.03), 0.026, 0.008, 2, 6), a.crimson(), 'tag-plate'));
    const tagRim = new RoundedBoxGeometry(0.38, 0.012, 0.02, 2, 0.005);
    tag.add(mk(a, merge([xf(tagRim, [0, 0.055, 0.012]), xf(tagRim, [0, -0.055, 0.012])]), gold, 'tag-rim'));
    const w = new THREE.Mesh(a.text('WILD', { font: 'display', size: 0.095, depth: 0.02, bevel: 0.005, bevelSegments: 2, curveSegments: 6 }), [gold, a.neon(0xffa018, 1.1)]);
    w.position.z = 0.028;
    tag.add(w);
    root.add(tag);
    return root;
  },
  tick(v, _dt, t) {
    const sp = v.state === 'win' || v.state === 'trigger' ? 3 : 1;
    const a = v.nodes.get('gyroA');
    const b = v.nodes.get('gyroB');
    if (a) a.rotation.y = t * 0.0009 * sp + v.phase;
    if (b) b.rotation.x = t * 0.0007 * sp + v.phase * 0.5;
  },
};
