// Analytic two-bone IK (shoulder -> elbow -> fist) with a pole vector.
//
// Bone convention: each bone extends along its local -Y axis toward its child;
// local +X is the bend-plane normal, local +Z faces the inside of the bend
// (so the elbow cap points along -Z, toward the pole).
// All math is allocation-free (module scratch objects).

import * as THREE from 'three';

const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _qU = new THREE.Quaternion();
const _qF = new THREE.Quaternion();

export interface IKResult {
  /** Rotation of the upper bone in the shoulder's parent space. */
  upper: THREE.Quaternion;
  /** Rotation of the lower bone relative to the upper bone. */
  lower: THREE.Quaternion;
  /** Elbow position (parent space). */
  elbow: THREE.Vector3;
  /** 0..1: how stretched the chain is. */
  reach: number;
}

function basis(yAxis: THREE.Vector3, planeN: THREE.Vector3, out: THREE.Quaternion) {
  _y.copy(yAxis).normalize();
  _x.copy(planeN).addScaledVector(_y, -planeN.dot(_y)).normalize();
  _z.crossVectors(_x, _y).normalize();
  _m.makeBasis(_x, _y, _z);
  out.setFromRotationMatrix(_m);
}

/**
 * Solve the chain in the shoulder's parent space.
 * @param shoulder joint position
 * @param target   desired end position (fist centre)
 * @param pole     direction the elbow should bend toward
 * @param l1 upper length, @param l2 lower length (elbow -> fist centre)
 */
export function solveTwoBone(shoulder: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3, l1: number, l2: number, out: IKResult): IKResult {
  _d.subVectors(target, shoulder);
  let dist = _d.length();
  if (dist < 1e-5) _d.set(0, -1, 0), (dist = 1e-5);
  _d.divideScalar(dist);
  const maxR = (l1 + l2) * 0.9995;
  const minR = Math.abs(l1 - l2) + 0.02;
  out.reach = dist / (l1 + l2);
  dist = Math.min(maxR, Math.max(minR, dist));
  const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  // pole component perpendicular to the chain
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-8) _p.set(0, 0, -1).addScaledVector(_d, -_d.z);
  _p.normalize();
  _elbow.copy(shoulder).addScaledVector(_d, l1 * cosA).addScaledVector(_p, l1 * sinA);
  out.elbow.copy(_elbow);
  // bend plane normal
  _n.crossVectors(_d, _p).normalize();
  // upper bone: local -Y points from shoulder to elbow
  _y.subVectors(shoulder, _elbow);
  basis(_y, _n, _qU);
  // lower bone: from elbow to the (clamped) end
  _z.copy(shoulder).addScaledVector(_d, dist); // clamped end
  _y.subVectors(_elbow, _z);
  basis(_y, _n, _qF);
  out.upper.copy(_qU);
  out.lower.copy(_qU).invert().multiply(_qF);
  return out;
}

export const makeIKResult = (): IKResult => ({ upper: new THREE.Quaternion(), lower: new THREE.Quaternion(), elbow: new THREE.Vector3(), reach: 0 });
