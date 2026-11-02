// RAIJIN arms. Geometry is authored once for the RIGHT arm (+X = outward) and
// mirrored for the left. Bones follow the IK convention (ik.ts): each bone
// extends along local -Y, +Z faces the inside of the bend (palm side).

import * as THREE from 'three';
import type { CharMats } from './mats';
import { M, Parts, bendX, bendYAt, chain, cyl, lathe, plate, rbox, rivet, rounded, sphere, symPoly, torus, type Poly } from './geo';
import { rimmed } from './head';

export const L_UPPER = 1.7;
export const L_FORE = 1.6;
/** Fist centre in hand (wrist) space. */
export const FIST = new THREE.Vector3(0, -0.5, 0.12);
export const L_FORE_IK = L_FORE + 0.5;

export interface ArmRig {
  side: 1 | -1;
  pivot: THREE.Group; // at the shoulder, child of chest
  paul: THREE.Group; // pauldron, partially follows the arm
  upper: THREE.Group;
  fore: THREE.Group;
  hand: THREE.Group;
  fingers: THREE.Group[]; // 3 curl rows
  thumb: THREE.Group[]; // 2 segments
  fist: THREE.Object3D;
  /** hydraulic pistons */
  pistons: { barrel: THREE.Object3D; rod: THREE.Object3D; a: THREE.Vector3; b: THREE.Vector3 }[];
  meshes: THREE.Mesh[];
  ventMat: THREE.MeshBasicMaterial;
}

interface ArmParts {
  paul: Parts;
  upper: Parts;
  fore: Parts;
  hand: Parts;
  rows: Parts[];
  thumb: Parts[];
  barrel: Parts;
  rod: Parts;
}

const ROW_LEN = [0.22, 0.17, 0.14];
const FINGER_X = [-0.195, -0.065, 0.065, 0.195];
const THUMB_PIVOT = new THREE.Vector3(0.27, -0.14, 0.12);
const PISTON_A = [new THREE.Vector3(0.13, -0.5, 0.25), new THREE.Vector3(-0.12, -0.55, 0.24)];
const PISTON_B = [new THREE.Vector3(0.13, -0.45, 0.24), new THREE.Vector3(-0.12, -0.42, 0.24)];

let cached: ArmParts | null = null;

function buildParts(mats: CharMats): ArmParts {
  if (cached) return cached;
  // ---------------------------------------------------------------- pauldron
  // Layered sode shells: authored facing +Z, then turned to face outward (+X),
  // tilted up by theta and swung toward the camera by phi so they read from the front.
  const frame = (px: number, py: number, pz: number, theta: number, phi: number) =>
    new THREE.Matrix4().makeTranslation(px, py, pz)
      .multiply(new THREE.Matrix4().makeRotationY(-phi))
      .multiply(new THREE.Matrix4().makeRotationZ(theta))
      .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
  const paul = new Parts();
  paul.add(sphere(0.6, 18, 6, Math.PI * 2, Math.PI / 2), mats.dark, M(0.12, 0.08, 0, 0, 0, -0.5, 1, 0.75, 1.0));
  {
    // top shell (kanmuri-ita)
    const top: Poly = rounded([[-0.8, 0.3, 0.12], [0.7, 0.3, 0.14], [0.8, -0.32, 0.12], [0, -0.38, 0], [-0.9, -0.3, 0.12]], 0, 4);
    const mt = frame(0.36, 0.5, 0.0, 1.0, 0.12);
    rimmed(paul, top, mats.armor, mats.gold, { depth: 0.11, rim: 0.045, deform: chain(bendX(0.78), bendYAt(1.1, 0)), m: mt, seg: 0.1, grid: 0.2 });
    for (const u of [-0.55, 0, 0.5]) paul.add(rivet(0.032), mats.goldDeep, mt.clone().multiply(M(Math.sin(u / 0.78) * 0.78, 0.14, Math.cos(u / 0.78) * 0.78 - 0.78 + 0.06, 0, u / 0.78, 0)));
    // horn fin rising from the shell
    const fin: Poly = rounded([[-0.5, 0.0], [0.38, 0.0, 0.03], [0.5, 0.12, 0.03], [0.22, 0.42, 0.04], [-0.05, 0.8, 0], [0.0, 0.42, 0.06], [-0.28, 0.12, 0.04]], 0, 3);
    rimmed(paul, fin, mats.armorLight, mats.gold, { depth: 0.06, rim: 0.03, m: M(0.36, 0.72, -0.08, 0, Math.PI / 2, -0.3, 1, 1, 1, 'ZYX'), seg: 0.07 });
  }
  for (let k = 0; k < 4; k++) {
    const hw = 0.74 + k * 0.05;
    const lame: Poly = rounded([[-hw, 0.0, 0.05], [hw, 0.0, 0.05], [hw + 0.05, -0.34, 0.1], [0, -0.41, 0.0], [-hw - 0.12, -0.37, 0.06]], 0, 4);
    const m = frame(0.66 + k * 0.12, 0.2 - k * 0.25, 0.03, 0.52 - k * 0.06, 0.42);
    rimmed(paul, lame, k === 3 ? mats.armor : mats.crimson, mats.gold, { depth: 0.08, rim: 0.04, deform: bendX(0.8), m, seg: 0.1, grid: 0.2 });
    for (const u of [-hw + 0.14, 0, hw - 0.14]) paul.add(rivet(0.028), mats.goldDeep, m.clone().multiply(M(Math.sin(u / 0.8) * 0.8, -0.09, Math.cos(u / 0.8) * 0.8 - 0.8 + 0.045, 0, u / 0.8, 0)));
  }

  // ---------------------------------------------------------------- upper arm
  const upper = new Parts();
  upper.add(sphere(0.42, 16, 10), mats.dark);
  upper.add(torus(0.4, 0.035, 5, 24), mats.gold, M(0, 0, 0, 0, Math.PI / 2, 0));
  upper.add(cyl(0.27, 1.45, 16, 0.04, 0.3), mats.dark, M(0, -0.92, 0));
  for (let k = 0; k < 3; k++) upper.add(torus(0.29, 0.025, 4, 18), mats.rubber, M(0, -0.32 - k * 0.07, 0, Math.PI / 2));
  {
    const sh: Poly = rounded([[-0.5, -0.5], [0.5, -0.5], [0.46, -1.38], [-0.46, -1.38]], 0.08, 3);
    rimmed(upper, sh, mats.armor, mats.gold, { depth: 0.09, rim: 0.03, deform: bendX(0.36), m: M(0, 0, 0, 0, Math.PI / 2, 0).multiply(M(0, 0, 0.36)), seg: 0.09, grid: 0.16 });
    const fr: Poly = rounded([[-0.16, -0.6], [0.16, -0.6], [0.14, -1.3], [-0.14, -1.3]], 0.05, 3);
    upper.add(plate(fr, { depth: 0.07, bevel: 0.02, deform: bendX(0.33) }), mats.crimson, M(0, 0, 0, 0, -0.35, 0).multiply(M(0, 0, 0.32)));
    upper.add(plate(rounded([[-0.03, -0.62], [0.03, -0.62], [0.03, -1.28], [-0.03, -1.28]], 0.02, 2), { depth: 0.02, bevel: 0.006, deform: bendX(0.4) }), mats.line, M(0, 0, 0, 0, Math.PI / 2 + 0.5, 0).multiply(M(0, 0, 0.39)));
    for (const v of [-0.62, -1.26]) upper.add(rivet(0.025), mats.goldDeep, M(0, 0, 0, 0, Math.PI / 2, 0).multiply(M(0, v, 0.41)));
  }
  // piston mounts
  for (const a of PISTON_A) upper.add(cyl(0.08, 0.12, 12, 0.02), mats.gold, M(a.x, a.y, a.z, 0, 0, Math.PI / 2));

  // ---------------------------------------------------------------- forearm
  const fore = new Parts();
  fore.add(cyl(0.27, 0.6, 16, 0.04), mats.dark, M(0, 0, 0, 0, 0, Math.PI / 2));
  for (const s of [1, -1]) {
    fore.add(cyl(0.21, 0.06, 16, 0.015), mats.gold, M(s * 0.32, 0, 0, 0, 0, Math.PI / 2));
    fore.add(cyl(0.09, 0.05, 12, 0.01), mats.armorLight, M(s * 0.36, 0, 0, 0, 0, Math.PI / 2));
  }
  fore.add(cyl(0.33, 1.32, 16, 0.04, 0.25), mats.dark, M(0, -0.86, 0));
  for (let k = 0; k < 2; k++) fore.add(torus(0.27, 0.028, 4, 18), mats.rubber, M(0, -0.2 - k * 0.07, 0, Math.PI / 2));
  // elbow cop (spike guard at the back)
  rimmed(fore, symPoly([[0, 0.3], [0.22, 0.2, 0.05], [0.25, -0.12, 0.05], [0.1, -0.44, 0.03], [0, -0.56]]), mats.armor, mats.gold, {
    depth: 0.08, rim: 0.03, deform: bendX(0.42), m: M(0, -0.02, 0, 0.12, Math.PI, 0).multiply(M(0, 0, 0.3)), seg: 0.06,
  });
  {
    // kote: main armour on the back/outer side with vent slots
    const holes: Poly[] = [0, 1, 2].map((k) => rounded([[-0.3, -0.66 - k * 0.19], [0.3, -0.66 - k * 0.19], [0.3, -0.74 - k * 0.19], [-0.3, -0.74 - k * 0.19]], 0.03, 2));
    const kote: Poly = rounded([[-0.5, -0.24, 0.06], [0.5, -0.24, 0.06], [0.64, -1.4, 0.06], [0.54, -1.56, 0.06], [-0.54, -1.56, 0.06], [-0.64, -1.4, 0.06]], 0, 3);
    const mk = M(0, 0, 0, 0, Math.PI * 0.72, 0).multiply(M(0, 0, 0.37));
    rimmed(fore, kote, mats.armor, mats.gold, { depth: 0.1, rim: 0.035, deform: bendX(0.37), m: mk, holes, seg: 0.08, grid: 0.15 });
    fore.add(plate(rounded([[-0.4, -0.6], [0.4, -0.6], [0.4, -1.16], [-0.4, -1.16]], 0.03, 2), { depth: 0.03, bevel: 0.01, deform: bendX(0.31) }), 'vent', M(0, 0, 0, 0, Math.PI * 0.72, 0).multiply(M(0, 0, 0.31)));
    // inner (palm side) plate
    fore.add(plate(rounded([[-0.34, -0.32], [0.34, -0.32], [0.38, -1.42], [-0.38, -1.42]], 0.06, 3), { depth: 0.08, bevel: 0.025, deform: bendX(0.34) }), mats.armorLight, M(0, 0, 0, 0, -0.3, 0).multiply(M(0, 0, 0.34)));
    // crimson accent strip between plates
    rimmed(fore, rounded([[-0.09, -0.36], [0.09, -0.36], [0.11, -1.36], [-0.11, -1.36]], 0.04, 2), mats.crimson, mats.gold, { depth: 0.07, rim: 0.02, deform: bendX(0.36), m: M(0, 0, 0, 0, 0.62, 0).multiply(M(0, 0, 0.36)) });
    // wrist cuff
    fore.add(lathe([[0.31, -0.08], [0.37, -0.07], [0.39, -0.02], [0.39, 0.02], [0.37, 0.07], [0.31, 0.08]], 24, 0.7), mats.gold, M(0, -1.5, 0));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      fore.add(rivet(0.02), mats.goldDeep, M(Math.sin(a) * 0.39, -1.5, Math.cos(a) * 0.39, 0, a, 0));
    }
    for (const b of PISTON_B) fore.add(cyl(0.07, 0.1, 12, 0.02), mats.gold, M(b.x, b.y, b.z, 0, 0, Math.PI / 2));
  }

  // ---------------------------------------------------------------- hand
  const hand = new Parts();
  hand.add(sphere(0.25, 12, 8), mats.dark, M(0, -0.03, 0));
  hand.add(rbox(0.58, 0.52, 0.4, 0.1, 2), mats.dark, M(0, -0.29, 0.02));
  rimmed(hand, rounded([[-0.3, -0.04], [0.3, -0.04], [0.33, -0.42], [0.0, -0.5], [-0.33, -0.42]], 0.05, 3), mats.armor, mats.gold, {
    depth: 0.08, rim: 0.025, deform: bendX(0.7), m: M(0, 0, 0, 0, Math.PI, 0).multiply(M(0, 0, 0.21)),
  });
  hand.add(plate(rounded([[-0.16, -0.12], [0.0, -0.3], [0.16, -0.12], [0.16, -0.18], [0.0, -0.37], [-0.16, -0.18]], 0.01, 2), { depth: 0.02, bevel: 0.006 }), 'vent', M(0, 0, -0.265, 0, Math.PI, 0));
  hand.add(rbox(0.66, 0.15, 0.24, 0.05), mats.armor, M(0, -0.53, -0.07));
  for (const x of FINGER_X) hand.add(lathe([[0, 0], [0.045, 0], [0.05, 0.02], [0.0, 0.1]], 10, 0.6), mats.gold, M(x, -0.55, -0.19, -Math.PI / 2));
  // finger rows
  const rows = ROW_LEN.map((len, r) => {
    const row = new Parts();
    for (const x of FINGER_X) {
      row.add(rbox(0.115, len + 0.03, 0.15, 0.04), mats.dark, M(x, -len / 2, 0));
      row.add(rbox(0.1, len * 0.78, 0.05, 0.018), r === 0 ? mats.armor : mats.armorLight, M(x, -len / 2, -0.075));
      if (r === 0) row.add(cyl(0.06, 0.1, 12, 0.012), mats.gold, M(x, 0, -0.02, 0, 0, Math.PI / 2));
    }
    return row;
  });
  const thumb = [0.22, 0.18].map((len, r) => {
    const t = new Parts();
    t.add(rbox(0.14, len + 0.03, 0.15, 0.045), mats.dark, M(0, -len / 2, 0));
    t.add(rbox(0.12, len * 0.75, 0.05, 0.018), mats.armor, M(0.04, -len / 2, -0.06, 0, 0.6, 0));
    if (r === 0) t.add(cyl(0.07, 0.12, 12, 0.012), mats.gold, M(0, 0, 0, 0, 0, Math.PI / 2));
    return t;
  });

  // ---------------------------------------------------------------- pistons (along +Y, origin at anchor)
  const barrel = new Parts();
  barrel.add(cyl(0.07, 0.8, 10, 0.015), mats.armorLight, M(0, 0.42, 0));
  barrel.add(cyl(0.085, 0.07, 10, 0.015), mats.gold, M(0, 0.8, 0));
  const rod = new Parts();
  rod.add(cyl(0.036, 0.95, 8, 0.01), mats.chrome, M(0, 0.47, 0));

  cached = { paul, upper, fore, hand, rows, thumb, barrel, rod };
  return cached;
}

export function buildArm(mats: CharMats, side: 1 | -1, pivotPos: THREE.Vector3): ArmRig {
  const P = buildParts(mats);
  const mirror = side < 0;
  const ventMat = side > 0 ? mats.ventR : mats.ventL;
  const opts = (name: string) => ({ mirror, mats: { vent: ventMat }, name });
  const meshes: THREE.Mesh[] = [];
  const sx = (v: THREE.Vector3) => new THREE.Vector3(v.x * side, v.y, v.z);

  const pivot = new THREE.Group();
  pivot.name = `shoulder${side > 0 ? 'R' : 'L'}`;
  pivot.position.copy(pivotPos);
  const paul = new THREE.Group();
  paul.name = 'pauldron';
  meshes.push(...P.paul.build(paul, opts('pauldron')));
  pivot.add(paul);

  const upper = new THREE.Group();
  upper.name = 'upperArm';
  meshes.push(...P.upper.build(upper, opts('upperArm')));
  pivot.add(upper);

  const fore = new THREE.Group();
  fore.name = 'forearm';
  fore.position.set(0, -L_UPPER, 0);
  meshes.push(...P.fore.build(fore, opts('forearm')));
  upper.add(fore);

  const hand = new THREE.Group();
  hand.name = 'hand';
  hand.position.set(0, -L_FORE, 0);
  meshes.push(...P.hand.build(hand, opts('hand')));
  fore.add(hand);

  const fingers: THREE.Group[] = [];
  let parent: THREE.Object3D = hand;
  P.rows.forEach((row, i) => {
    const g = new THREE.Group();
    g.name = `fingers${i}`;
    g.position.set(0, i === 0 ? -0.55 : -ROW_LEN[i - 1], i === 0 ? 0.05 : 0);
    meshes.push(...row.build(g, opts(`fingers${i}`)));
    parent.add(g);
    fingers.push(g);
    parent = g;
  });
  const thumb: THREE.Group[] = [];
  parent = hand;
  P.thumb.forEach((t, i) => {
    const g = new THREE.Group();
    g.name = `thumb${i}`;
    if (i === 0) {
      g.position.copy(sx(THUMB_PIVOT));
    } else g.position.set(0, -0.22, 0);
    meshes.push(...t.build(g, opts(`thumb${i}`)));
    parent.add(g);
    thumb.push(g);
    parent = g;
  });

  const fist = new THREE.Object3D();
  fist.name = 'fist';
  fist.position.copy(FIST);
  hand.add(fist);

  const pistons = PISTON_A.map((a, i) => {
    const barrel = new THREE.Group();
    meshes.push(...P.barrel.build(barrel, opts('pistonBarrel')));
    barrel.position.copy(sx(a));
    upper.add(barrel);
    const rod = new THREE.Group();
    meshes.push(...P.rod.build(rod, opts('pistonRod')));
    rod.position.copy(sx(PISTON_B[i]));
    fore.add(rod);
    return { barrel, rod, a: sx(a), b: sx(PISTON_B[i]) };
  });

  return { side, pivot, paul, upper, fore, hand, fingers, thumb, fist, pistons, meshes, ventMat };
}

// ------------------------------------------------------------------ per-frame helpers (allocation free)

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** Re-aim the hydraulic pistons after the elbow moved. */
export function updatePistons(arm: ArmRig) {
  for (const p of arm.pistons) {
    // rod anchor in upper-arm space
    _v.copy(p.b).applyQuaternion(arm.fore.quaternion).add(arm.fore.position);
    _w.subVectors(_v, p.a).normalize();
    p.barrel.quaternion.setFromUnitVectors(_up, _w);
    // barrel anchor in forearm space
    _v.copy(p.a).sub(arm.fore.position).applyQuaternion(_qInv.copy(arm.fore.quaternion).invert());
    _w.subVectors(_v, p.b).normalize();
    p.rod.quaternion.setFromUnitVectors(_up, _w);
  }
}
const _qInv = new THREE.Quaternion();

/** Finger curl 0 (open claw) .. 1 (tight fist). */
export function setCurl(arm: ArmRig, c: number, spread: number) {
  const f = arm.fingers;
  f[0].rotation.x = -(0.25 + c * 1.3);
  f[1].rotation.x = -(0.2 + c * 1.45);
  f[2].rotation.x = -(0.15 + c * 1.0);
  f[0].rotation.z = 0;
  // thumb: folds across the front of the fingers
  const t = arm.thumb;
  t[0].rotation.set(-0.35 - c * 0.7, 0, arm.side * (-0.55 - spread * 0.4 + c * 0.25));
  t[1].rotation.set(-0.2 - c * 0.6, 0, arm.side * -c * 0.5);
}
