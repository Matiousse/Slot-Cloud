// The DRUM HALO (raiko): gold ring r 2.3 carrying 8 red-lacquer taiko drums
// with mitsudomoe heads and gold studs, flame rays between them, an emissive
// inner ring and a static hub behind the head. Halo-local: ring in the XY
// plane facing +Z; `ring` group spins about Z.

import * as THREE from 'three';
import type { CharMats } from './mats';
import { M, Parts, lathe, plate, rbox, rivet, torus, type P2 } from './geo';
import { spikePoly } from './shapes';

export const HALO_R = 2.3;
export const DRUMS = 8;

export interface HaloRig {
  mount: THREE.Group; // static, at the back bracket
  ring: THREE.Group; // spins
  drums: THREE.Object3D[]; // drum centres (for lights / arcs)
  heads: THREE.Mesh[];
  meshes: THREE.Mesh[];
}

export function buildHalo(mats: CharMats): HaloRig {
  const mount = new THREE.Group();
  mount.name = 'haloMount';
  const ring = new THREE.Group();
  ring.name = 'haloRing';
  mount.add(ring);
  const meshes: THREE.Mesh[] = [];

  // ---------------------------------------------------------------- static hub
  {
    const H = new Parts();
    const hub = lathe([[0, -0.12], [0.5, -0.12], [0.56, -0.06], [0.56, 0.02], [0.48, 0.06], [0.3, 0.08], [0, 0.08]], 40, 0.7);
    H.add(hub.rotateX(Math.PI / 2), mats.armor);
    H.add(torus(0.53, 0.03, 8, 40), mats.gold, M(0, 0, 0.04));
    H.add(torus(0.4, 0.016, 6, 40), mats.line, M(0, 0, 0.085));
    meshes.push(...H.build(mount, { name: 'haloHub' }));
  }

  // ---------------------------------------------------------------- ring (spins)
  const R = new Parts();
  // main gold band, lathe around Y then turned to face +Z
  const band: P2[] = [
    [2.14, -0.06], [2.44, -0.06], [2.48, -0.025], [2.48, 0.03], [2.44, 0.07], [2.36, 0.085], [2.3, 0.115], [2.24, 0.085], [2.16, 0.07], [2.12, 0.03], [2.12, -0.025],
  ];
  R.add(lathe([...band, band[0]], 96, 0.6).rotateX(Math.PI / 2), mats.haloGold);
  // dark backing band for contrast
  R.add(lathe([[1.98, -0.14], [2.6, -0.14], [2.62, -0.1], [2.6, -0.06], [1.98, -0.06], [1.96, -0.1], [1.98, -0.14]], 72, 0.6).rotateX(Math.PI / 2), mats.dark);
  // inner emissive ring + thin gold ring
  R.add(torus(2.03, 0.018, 4, 96), mats.lineDim, M(0, 0, 0.02));
  R.add(torus(1.95, 0.03, 5, 96), mats.haloGold, M(0, 0, 0.0));
  // studs along the band
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2;
    if (Math.abs(((a / (Math.PI * 2)) * DRUMS) % 1 - 0) < 0.08 || Math.abs(((a / (Math.PI * 2)) * DRUMS) % 1 - 1) < 0.08) continue;
    R.add(rivet(0.03), mats.goldDeep, M(Math.cos(a) * 2.3, Math.sin(a) * 2.3, 0.12));
  }
  // flame rays between drums
  for (let k = 0; k < DRUMS * 2; k++) {
    const a = ((k + 0.5) / (DRUMS * 2)) * Math.PI * 2;
    const long = k % 2 === 1;
    const len = long ? 0.95 : 0.5;
    const sp = spikePoly(long ? 0.3 : 0.2, len, 0.28);
    R.add(plate(sp, { depth: 0.06, bevel: 0.02, bevelSegs: 1, seg: 0.09, grid: 0 }), mats.haloGold, M(Math.cos(a) * 2.42, Math.sin(a) * 2.42, -0.01, 0, 0, a - Math.PI / 2));
  }

  // ---------------------------------------------------------------- drums
  const D = new Parts();
  const body = lathe([[0.31, -0.25], [0.35, -0.23], [0.4, -0.13], [0.42, 0], [0.4, 0.13], [0.35, 0.23], [0.31, 0.25], [0.29, 0.25], [0.29, -0.25], [0.31, -0.25]], 24, 0.55);
  body.rotateX(Math.PI / 2); // axis along Z
  const hoop = torus(0.33, 0.026, 5, 24);
  const band2 = torus(0.385, 0.018, 4, 24);
  const drums: THREE.Object3D[] = [];
  const heads: THREE.Mesh[] = [];
  const headGeo = new THREE.CircleGeometry(0.315, 40);
  for (let k = 0; k < DRUMS; k++) {
    const a = (k / DRUMS) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * HALO_R, y = Math.sin(a) * HALO_R;
    const m = M(x, y, 0.16, 0, 0, a, 1.18);
    D.add(body, mats.crimson, m);
    D.add(hoop, mats.dark, m.clone().multiply(M(0, 0, 0.245)));
    for (const z of [-0.17, 0.17]) D.add(band2, mats.gold, m.clone().multiply(M(0, 0, z)));
    // studs (byou)
    for (let s = 0; s < 12; s++) {
      const b = (s / 12) * Math.PI * 2;
      for (const z of [0.205]) {
        const r = 0.375;
        D.add(rivet(0.022, 0.8), mats.gold, m.clone().multiply(M(Math.cos(b) * r, Math.sin(b) * r, z, 0, 0, 0).multiply(M(0, 0, 0, 0, Math.PI / 2, b, 1, 1, 1, 'ZYX'))));
      }
    }
    // bracket to the ring
    D.add(rbox(0.22, 0.2, 0.2, 0.04), mats.dark, m.clone().multiply(M(0, 0, -0.2)));
    // heads
    const head = new THREE.Mesh(headGeo, mats.drumHeads[k]);
    head.position.set(x, y, 0.16 + 0.252 * 1.18);
    head.scale.setScalar(1.18);
    head.rotation.z = a;
    head.name = `drumHead${k}`;
    ring.add(head);
    heads.push(head);
    const back = new THREE.Mesh(headGeo, mats.drumBack);
    back.position.set(x, y, 0.16 - 0.252 * 1.18);
    back.scale.setScalar(1.18);
    back.rotation.set(0, Math.PI, 0);
    ring.add(back);
    meshes.push(head, back);
    const c = new THREE.Object3D();
    c.position.set(x, y, 0.16);
    ring.add(c);
    drums.push(c);
  }
  meshes.push(...R.build(ring, { name: 'haloRing' }), ...D.build(ring, { name: 'drums' }));
  return { mount, ring, drums, heads, meshes };
}
