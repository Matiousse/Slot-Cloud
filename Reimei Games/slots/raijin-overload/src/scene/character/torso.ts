// RAIJIN torso: pelvis + kusazuri tassets, segmented abdomen, barrel chest
// with layered pec plates, crimson sternum, the tomoe REACTOR, high collar,
// backpack with thrusters, cables and the neck.
//
// Spaces: hips-local (origin = pelvis), spine-local (spine pivot at hips y 0.45),
// chest-local (chest pivot at spine y 0.95, i.e. pelvis + 1.4).

import * as THREE from 'three';
import type { CharMats } from './mats';
import { M, Parts, bendX, bendYAt, chain, circlePoly, cyl, lathe, plate, rbox, rivet, rounded, sphere, symPoly, torus, tube, type P2, type Poly } from './geo';
import { rimmed } from './head';
import { tomoePoly } from './shapes';
import { textGeometry } from '../text3d';

export interface TorsoRig {
  hips: THREE.Group;
  spine: THREE.Group;
  chest: THREE.Group;
  neck: THREE.Group;
  /** head pivot position in neck space */
  headPivot: THREE.Vector3;
  rotor: THREE.Group;
  reactorPos: THREE.Vector3;
  thrusters: THREE.Vector3[];
  haloMount: THREE.Vector3;
  shoulderL: THREE.Vector3;
  shoulderR: THREE.Vector3;
  meshes: THREE.Mesh[];
}

const SPINE_Y = 0.45;
const CHEST_Y = 0.95;

export function buildTorso(mats: CharMats): TorsoRig {
  const hips = new THREE.Group();
  hips.name = 'hips';
  const spine = new THREE.Group();
  spine.name = 'spine';
  spine.position.set(0, SPINE_Y, 0);
  hips.add(spine);
  const chest = new THREE.Group();
  chest.name = 'chest';
  chest.position.set(0, CHEST_Y, 0);
  spine.add(chest);
  const meshes: THREE.Mesh[] = [];

  // ================================================================ hips
  {
    const H = new Parts();
    H.add(rbox(1.6, 0.62, 1.0, 0.22), mats.dark, M(0, -0.14, -0.05));
    // belt (obi): crimson band, gold upper edge
    const belt = lathe([[0.7, 0.1], [0.8, 0.11], [0.83, 0.15], [0.83, 0.3], [0.8, 0.34], [0.7, 0.35]], 36, 0.7);
    belt.scale(1.12, 1, 0.8);
    H.add(belt, mats.crimsonDark);
    const bead = lathe(circlePoly(0.82, 0.33, 0.022, 5), 36, 1.2);
    bead.scale(1.12, 1, 0.8);
    H.add(bead, mats.gold);
    // buckle
    H.add(cyl(0.19, 0.07, 32, 0.02), mats.gold, M(0, 0.22, 0.68, Math.PI / 2));
    H.add(cyl(0.15, 0.03, 32, 0.01), mats.dark, M(0, 0.22, 0.715, Math.PI / 2));
    for (let k = 0; k < 3; k++) H.add(plate(tomoePoly(0.13, (k * Math.PI * 2) / 3, undefined, 9), { depth: 0.02, bevel: 0.006, bevelSegs: 1, noBack: true, seg: 0.05 }), mats.gold, M(0, 0.22, 0.735));
    // kusazuri: flaring tasset skirt (3 lames each, overlapping downward)
    const lameP = (hw: number): Poly => rounded([[-hw, 0.02], [hw, 0.02], [hw + 0.04, -0.2], [-hw - 0.04, -0.2]], 0.04, 3);
    const tassets = [
      { phi: -0.36, hw: 0.36 }, { phi: 0.36, hw: 0.36 },
      { phi: -1.12, hw: 0.34 }, { phi: 1.12, hw: 0.34 },
      { phi: -1.85, hw: 0.32 }, { phi: 1.85, hw: 0.32 },
    ];
    for (const t of tassets) {
      for (let k = 0; k < 3; k++) {
        const r = 0.9 + k * 0.07;
        const m = new THREE.Matrix4().multiplyMatrices(
          M(Math.sin(t.phi) * r * 1.08, 0.02 - k * 0.19, Math.cos(t.phi) * r * 0.8, 0, t.phi, 0),
          M(0, 0, 0, 0.38 + k * 0.05),
        );
        rimmed(H, lameP(t.hw + k * 0.03), k === 0 ? mats.armor : mats.crimson, mats.gold, { depth: 0.05, rim: 0.025, deform: bendX(0.9), m, seg: 0.12, grid: 0.22 });
        if (k === 0) for (const u of [-t.hw + 0.08, t.hw - 0.08]) H.add(rivet(0.024), mats.goldDeep, m.clone().multiply(M(u, -0.08, 0.03)));
      }
    }
    meshes.push(...H.build(hips, { name: 'hips' }));
  }

  // ================================================================ abdomen (spine-local)
  {
    const A = new Parts();
    const core = lathe([[0, -0.15], [0.46, -0.15], [0.52, -0.05], [0.6, 0.75], [0.56, 0.85], [0, 0.85]], 24, 0.7);
    core.scale(1.2, 1, 0.75);
    A.add(core, mats.dark, M(0, 0, -0.08));
    const bands = [
      { y: 0.6, w: 0.8 },
      { y: 0.33, w: 0.72 },
      { y: 0.07, w: 0.66 },
    ];
    bands.forEach((b, i) => {
      const shape: Poly = rounded([[-b.w, 0.13], [b.w, 0.13], [b.w - 0.05, -0.12], [0, -0.15], [-b.w + 0.05, -0.12]], 0.06, 3);
      A.add(plate(shape, { depth: 0.12, bevel: 0.04, deform: bendX(1.0), seg: 0.1, grid: 0.18 }), i === 1 ? mats.armorLight : mats.armor, M(0, b.y, 0.42 - i * 0.02, 0.08));
      // glowing seam under each band
      A.add(plate(rounded([[-b.w + 0.16, 0.016], [b.w - 0.16, 0.016], [b.w - 0.16, -0.016], [-b.w + 0.16, -0.016]], 0.014, 2), { depth: 0.02, bevel: 0.006, deform: bendX(1.0), seg: 0.1 }), mats.lineDim, M(0, b.y - 0.15, 0.36));
    });
    // central gold spine ridge across the bands
    A.add(rbox(0.1, 0.78, 0.1, 0.035), mats.gold, M(0, 0.33, 0.54, 0.06));
    // obliques
    for (const s of [1, -1]) {
      const ob: Poly = rounded([[0, 0.38], [0.2, 0.3], [0.22, -0.15], [0.02, -0.08]], 0.03, 3).map(([x, y]) => [x * s, y] as P2);
      A.add(plate(ob, { depth: 0.08, bevel: 0.025 }), mats.armor, M(s * 0.68, 0.32, 0.2, 0, s * 0.95, 0));
    }
    meshes.push(...A.build(spine, { name: 'abdomen' }));
  }

  // ================================================================ chest (chest-local)
  const C = new Parts();
  // barrel core
  C.add(
    plate(symPoly([[0, 1.62], [0.92, 1.6, 0.15], [1.2, 1.32, 0.2], [1.04, 0.5, 0.25], [0.7, -0.22, 0.15], [0, -0.26]]), {
      depth: 1.25, bevel: 0.22, bevelSegs: 2, deform: bendX(1.4), seg: 0.16, grid: 0.3,
    }),
    mats.dark,
    M(0, 0, -0.12),
  );
  // pectoral plates
  const pecDeform = chain(bendX(2.15), bendYAt(3.2, 1.0));
  const pecR: Poly = rounded([[0.13, 1.47, 0.04], [0.9, 1.53, 0.1], [1.23, 1.3, 0.12], [1.19, 0.88, 0.1], [0.92, 0.57, 0.12], [0.46, 0.46, 0.08], [0.15, 0.6, 0.04]], 0, 4);
  const pecR2: Poly = rounded([[0.36, 1.1, 0.03], [0.96, 1.18, 0.06], [1.08, 0.94, 0.06], [0.88, 0.7, 0.06], [0.5, 0.64, 0.05]], 0, 3);
  for (const s of [1, -1]) {
    const pec = s > 0 ? pecR : pecR.map(([x, y]) => [-x, y] as P2);
    rimmed(C, pec, mats.armor, mats.gold, { depth: 0.14, rim: 0.04, deform: pecDeform, m: M(0, 0, 0.62), seg: 0.08, grid: 0.13 });
    // raised inner plate
    const p2 = s > 0 ? pecR2 : pecR2.map(([x, y]) => [-x, y] as P2);
    C.add(plate(p2, { depth: 0.08, bevel: 0.025, deform: pecDeform, seg: 0.08, grid: 0.13 }), mats.armorLight, M(0, 0, 0.7));
    // emissive panel line under the raised plate
    const ln: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const x = s * (0.42 + t * 0.62);
      const y = 0.6 - Math.sin(t * Math.PI) * 0.04 + t * 0.12;
      const v = new THREE.Vector3(x, y, 0.072);
      pecDeform(v);
      ln.push(v.add(new THREE.Vector3(0, 0, 0.62)));
    }
    C.add(tube(ln, 0.012, 16, 4), mats.line);
    // rivets on pec
    for (const [x, y] of [[0.3, 1.38], [0.75, 1.42], [1.1, 1.22], [1.1, 0.92]] as P2[]) {
      const v = new THREE.Vector3(s * x, y, 0.075);
      pecDeform(v);
      C.add(rivet(0.026), mats.goldDeep, M(v.x, v.y, v.z + 0.62, 0, s * x * 0.45, 0));
    }
    // side rib fins
    for (let k = 0; k < 3; k++) {
      const fin: Poly = rounded([[0, 0], [0.32, 0.02], [0.36, 0.1], [0.04, 0.1]], 0.02, 2).map(([x, y]) => [x * s, y] as P2);
      C.add(plate(fin, { depth: 0.05, bevel: 0.015 }), k === 1 ? mats.crimson : mats.armorLight, M(s * 1.0, 0.42 - k * 0.17, 0.3, 0, s * 1.05, s * -0.18));
    }
  }
  // sternum (crimson) + reactor
  rimmed(C, symPoly([[0, 1.46], [0.16, 1.46, 0.03], [0.22, 1.16, 0.03], [0.25, 0.66, 0.05], [0.12, 0.36, 0.05], [0, 0.3]]), mats.crimson, mats.gold, {
    depth: 0.12, rim: 0.03, deform: bendX(2.2), m: M(0, 0, 0.7), seg: 0.07,
  });
  const reactorPos = new THREE.Vector3(0, 0.98, 0.79);
  {
    const R = new THREE.Matrix4().makeTranslation(reactorPos.x, reactorPos.y, reactorPos.z);
    const housing = lathe([[0.0, -0.1], [0.36, -0.1], [0.39, -0.06], [0.39, 0.0], [0.35, 0.03], [0.27, 0.03], [0.24, -0.02], [0, -0.02]], 32, 0.7);
    C.add(housing.rotateX(Math.PI / 2), mats.dark, R);
    C.add(plate(circlePoly(0, 0, 0.35, 36), { depth: 0.07, bevel: 0.022, holes: [circlePoly(0, 0, 0.255, 36)], seg: 0.08, grid: 0, noBack: true }), mats.gold, R.clone().multiply(M(0, 0, 0.03)));
    // ring studs
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      C.add(rivet(0.018), mats.goldDeep, R.clone().multiply(M(Math.cos(a) * 0.305, Math.sin(a) * 0.305, 0.068)));
    }
    C.add(sphere(0.2, 18, 12), mats.reactor, R.clone().multiply(M(0, 0, -0.07, 0, 0, 0, 1, 1, 0.5)));
  }
  // kanji 雷 on the left pec (viewer's right is the mech's left... keep on +x side)
  C.add(textGeometry('雷', { font: 'kanji', size: 0.16, depth: 0.015, bevel: 0.003, bevelSegments: 1, curveSegments: 3 }), mats.lineDim, (() => {
    const v = new THREE.Vector3(-0.78, 1.2, 0.085);
    pecDeform(v);
    return M(v.x, v.y, v.z + 0.7, -0.05, -0.36, 0.0);
  })());

  // high collar (eri-mawashi)
  const collar: Poly = rounded([[0, 0, 0.02], [0.56, 0.0, 0.04], [0.62, 0.28, 0.08], [0.48, 0.48, 0.1], [0.12, 0.38, 0.06]], 0, 4);
  for (const s of [1, -1]) {
    const c = s > 0 ? collar : collar.map(([x, y]) => [-x, y] as P2);
    rimmed(C, c, mats.crimson, mats.gold, { depth: 0.08, rim: 0.035, deform: bendX(0.8), m: M(s * 0.46, 1.34, 0.1, -0.4, s * 0.85, s * -0.2, 1, 1, 1, 'YXZ'), seg: 0.07 });
  }
  // trapezius blocks
  for (const s of [1, -1]) C.add(rbox(0.6, 0.32, 0.8, 0.1), mats.armor, M(s * 0.78, 1.5, -0.12, 0, 0, s * -0.32));

  // backpack + thrusters
  C.add(rbox(1.62, 1.25, 0.72, 0.14), mats.armor, M(0, 0.86, -0.8));
  C.add(rbox(1.3, 0.95, 0.2, 0.06), mats.dark, M(0, 0.86, -1.17));
  for (let k = 0; k < 4; k++) C.add(rbox(1.0, 0.04, 0.04, 0.015), mats.lineDim, M(0, 0.62 + k * 0.16, -1.27));
  const thrusters: THREE.Vector3[] = [];
  for (const s of [1, -1]) {
    const pos = new THREE.Vector3(s * 0.55, 0.3, -1.12);
    const m = M(pos.x, pos.y, pos.z, 2.55, 0, 0);
    C.add(lathe([[0.12, 0.0], [0.17, 0.06], [0.2, 0.26], [0.24, 0.42], [0.21, 0.44], [0.15, 0.3], [0.1, 0.1], [0.08, 0.0]], 28, 0.6), mats.armorLight, m);
    C.add(torus(0.2, 0.02, 6, 24), mats.gold, m.clone().multiply(M(0, 0.4, 0, Math.PI / 2)));
    C.add(cyl(0.13, 0.02, 20, 0.005), mats.thruster, m.clone().multiply(M(0, 0.16, 0)));
    thrusters.push(new THREE.Vector3(0, 0.5, 0).applyMatrix4(m));
  }
  // halo spine bracket
  const haloMount = new THREE.Vector3(0, 2.45, -1.2);
  C.add(rbox(0.3, 1.5, 0.28, 0.08), mats.armor, M(0, 1.78, -1.15, -0.06));
  C.add(rbox(0.16, 1.3, 0.3, 0.05), mats.dark, M(0, 1.8, -1.12, -0.06));
  for (const y of [1.3, 1.75, 2.2]) C.add(cyl(0.2, 0.08, 20, 0.02), mats.gold, M(0, y, -1.16, 0, 0, 0));

  // cables
  for (const s of [1, -1]) {
    C.add(tube([new THREE.Vector3(s * 0.3, 1.45, -0.6), new THREE.Vector3(s * 0.28, 1.75, -0.45), new THREE.Vector3(s * 0.16, 1.78, -0.2)], 0.05, 16, 8), mats.rubber);
    C.add(tube([new THREE.Vector3(s * 0.75, 1.2, -0.75), new THREE.Vector3(s * 1.2, 1.45, -0.6), new THREE.Vector3(s * 1.45, 1.35, -0.32)], 0.055, 16, 8), mats.rubber);
    C.add(cyl(0.075, 0.1, 12, 0.015), mats.gold, M(s * 0.3, 1.45, -0.6, 0.5));
  }

  const shoulderR = new THREE.Vector3(1.58, 1.22, -0.06);
  const shoulderL = new THREE.Vector3(-1.58, 1.22, -0.06);
  meshes.push(...C.build(chest, { name: 'chest' }));

  // reactor rotor (tomoe blades, spins)
  const rotor = new THREE.Group();
  rotor.name = 'rotor';
  rotor.position.copy(reactorPos).add(new THREE.Vector3(0, 0, 0.04));
  {
    const Rt = new Parts();
    for (let k = 0; k < 3; k++) Rt.add(plate(tomoePoly(0.24, (k * Math.PI * 2) / 3, undefined, 12), { depth: 0.035, bevel: 0.01, seg: 0.05, grid: 0 }), mats.gold);
    Rt.add(sphere(0.045, 12, 8), mats.gold, M(0, 0, 0.02));
    meshes.push(...Rt.build(rotor, { name: 'rotor' }));
  }
  chest.add(rotor);

  // ================================================================ neck
  const neck = new THREE.Group();
  neck.name = 'neck';
  neck.position.set(0, 1.6, 0.2);
  chest.add(neck);
  {
    const N = new Parts();
    N.add(cyl(0.24, 0.42, 24, 0.04), mats.dark, M(0, 0.0, 0));
    for (let k = 0; k < 3; k++) N.add(torus(0.245, 0.03, 8, 24), mats.rubber, M(0, -0.12 + k * 0.1, 0, Math.PI / 2));
    for (const s of [1, -1]) {
      N.add(cyl(0.04, 0.34, 10, 0.01), mats.chrome, M(s * 0.22, 0.02, 0.12, 0, 0, s * 0.25));
      N.add(cyl(0.06, 0.16, 10, 0.015), mats.armorLight, M(s * 0.25, -0.1, 0.12, 0, 0, s * 0.25));
    }
    meshes.push(...N.build(neck, { name: 'neck' }));
  }

  return { hips, spine, chest, neck, headPivot: new THREE.Vector3(0, 0.16, 0.0), rotor, reactorPos, thrusters, haloMount, shoulderL, shoulderR, meshes };
}
