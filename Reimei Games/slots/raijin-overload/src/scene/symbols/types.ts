import type * as THREE from 'three';
import type { SymbolState } from '../contracts';
import type { Assets } from './assets';

export type V3 = [number, number, number];

/** What a symbol definition sees of a live view (for its own extra animation). */
export interface ViewAnim {
  /** Named sub-objects of this view's model clone. */
  nodes: Map<string, THREE.Object3D>;
  state: SymbolState;
  /** ms since the current state was entered */
  stateT: number;
  /** current glow boost (1 = rest) */
  boost: number;
  /** current dim factor (1 = normal) */
  dim: number;
  /** random per-view phase (radians) */
  phase: number;
}

export interface SymbolDef {
  /** Identity colour (back glow, flares, win rays). */
  color: number;
  /** Back-glow strength (HDR multiplier). */
  backGlow: number;
  /** Star-glint anchor points in model space. */
  glints: V3[];
  /** Idle sway amplitude (rad) and bob (units). */
  sway?: number;
  bob?: number;
  /** Builds the shared prototype model once per kit. */
  build(a: Assets): THREE.Object3D;
  /** Optional per-view animation (named nodes). Must not allocate. */
  tick?(v: ViewAnim, dt: number, t: number): void;
}
