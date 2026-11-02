// Placement presets (ART_DIRECTION §3). Exported and mutable so the stage /
// integrator can fine-tune numbers; call character.setLayout() again after
// editing. Positions marked "world" assume the character object sits at the
// scene origin; "root-local" positions are in the mech's own space (pelvis
// origin, facing +Z, before scale) and X is mirrored for the left arm.

import * as THREE from 'three';
import type { LayoutKind } from '../contracts';

export interface ArmPreset {
  /** World grip target (fist centre) or null when the arm is free. */
  grip: THREE.Vector3 | null;
  /** Root-local rest target when free (fist centre). */
  rest: THREE.Vector3;
  /** Root-local pole direction (where the elbow points) at rest. */
  pole: THREE.Vector3;
  /** Finger curl at rest (1 = fist). */
  curl: number;
  /** Hand (wrist) rotation at rest, radians XYZ. */
  wrist: THREE.Euler;
}

export interface LayoutPreset {
  /** World position of the pelvis. */
  pos: THREE.Vector3;
  rotY: number;
  scale: number;
  /** Base forward lean of the torso (rad). */
  lean: number;
  headYaw: number;
  headPitch: number;
  left: ArmPreset;
  right: ArmPreset;
  /** Root-local fist targets for the RIGHT arm (mirrored for the left). */
  raise: THREE.Vector3;
  raisePole: THREE.Vector3;
  roar: THREE.Vector3;
  roarPole: THREE.Vector3;
  /** Strike wind-up position (root-local, right arm; mirrored for left). */
  charge: THREE.Vector3;
  chargePole: THREE.Vector3;
  /** How far the fist thrusts from the charge point toward the target (root-local units). */
  punch: number;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const PRESETS: Record<LayoutKind, LayoutPreset> = {
  portrait: {
    pos: v(0, 1.62, -1.7),
    rotY: 0,
    scale: 0.75,
    lean: 0.24,
    headYaw: 0,
    headPitch: 0.16,
    left: { grip: v(-2.85, 2.75, 0.25), rest: v(-2.4, 1.6, 2.4), pole: v(-1, -0.7, -0.5), curl: 0.92, wrist: new THREE.Euler(0.5, 0, 0) },
    right: { grip: v(2.85, 2.75, 0.25), rest: v(2.4, 1.6, 2.4), pole: v(1, -0.7, -0.5), curl: 0.92, wrist: new THREE.Euler(0.5, 0, 0) },
    raise: v(2.5, 4.4, 1.9),
    raisePole: v(1, -0.6, -0.4),
    roar: v(3.1, 2.6, 2.6),
    roarPole: v(1, -0.8, -0.3),
    charge: v(3.0, 3.7, 3.2),
    chargePole: v(1, -0.5, -0.6),
    punch: 0.75,
  },
  landscape: {
    pos: v(-6.0, -3.0, -1.6),
    rotY: 0.42,
    scale: 1.1,
    lean: 0.1,
    headYaw: 0.28,
    headPitch: 0.1,
    left: { grip: null, rest: v(-1.3, 0.78, 0.72), pole: v(-1, 0.15, -0.7), curl: 1, wrist: new THREE.Euler(0.15, 0, 0.25) },
    right: { grip: v(-2.95, 0.6, 0.3), rest: v(2.2, 2.4, 2.4), pole: v(0.7, -1, -0.5), curl: 0.9, wrist: new THREE.Euler(0.35, 0, 0) },
    raise: v(1.9, 5.5, 1.0),
    raisePole: v(1, -0.4, -0.5),
    roar: v(3.2, 2.5, 1.8),
    roarPole: v(1, -0.8, -0.4),
    charge: v(1.6, 4.7, 2.4),
    chargePole: v(1, -0.6, -0.4),
    punch: 0.85,
  },
};
