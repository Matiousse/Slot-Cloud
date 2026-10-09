// Contracts between the 3D scene modules. Each module implements one interface
// and only depends on these types + src/scene/core.ts helpers + materials/text3d.
// World layout and art direction: docs/ART_DIRECTION.md.

import type * as THREE from 'three';
import type { LineWin, SymbolCode } from '../../shared/game';

/** dt and t are in milliseconds of the animation clock (already scaled by turbo/skip). */
export interface Updatable {
  update(dt: number, t: number): void;
}

export type SceneMode = 'base' | 'overcharge' | 'lock' | 'god';
export type LayoutKind = 'landscape' | 'portrait';

// ---------------------------------------------------------------- symbols

export type SymbolState = 'idle' | 'spin' | 'land' | 'win' | 'dim' | 'trigger';

export interface SymbolView {
  readonly code: SymbolCode;
  /** Centered at origin, fits a 0.92 x 0.92 cell facing +z, depth <= 0.45. */
  readonly object: THREE.Object3D;
  setState(state: SymbolState): void;
  update(dt: number, t: number): void;
}

export interface SymbolKit {
  /** Create a new view (callers pool them; creation can be moderately expensive). */
  create(code: SymbolCode): SymbolView;
  /** Clipping planes applied to every material the kit creates (reel window mask). */
  setClipping(planes: THREE.Plane[]): void;
  /** Free GPU resources. */
  dispose(): void;
}

// ---------------------------------------------------------------- character

export type ReactKind = 'scatter' | 'trigger' | 'retrigger' | 'smallWin' | 'bigWin' | 'megaWin' | 'maxWin' | 'land';

export interface Character extends Updatable {
  readonly object: THREE.Object3D;
  /** Apply a placement preset (see ART_DIRECTION §3). */
  setLayout(layout: LayoutKind): void;
  /** World position of a fist (for lightning origins). */
  getFistWorld(side: 'left' | 'right', out: THREE.Vector3): THREE.Vector3;
  anticipate(on: boolean): void;
  /** Wind up and point at `target`; resolves at the moment the bolt should fire (~350-500 ms). */
  strike(target: THREE.Vector3): Promise<'left' | 'right'>;
  react(kind: ReactKind): void;
  setMode(mode: SceneMode): void;
  /** Power-up sequence (eyes ignite, halo spins up). Resolves when done (~2 s). */
  intro(): Promise<void>;
}

// ---------------------------------------------------------------- environment

export interface Environment extends Updatable {
  readonly object: THREE.Object3D;
  /** Lightning illumination of the whole scene (sky flash + light pulse). */
  flash(strength?: number): void;
  /** Ambient random lightning in the sky also calls this (audio rumble). */
  onThunder: (strength: number) => void;
  setMode(mode: SceneMode, instant?: boolean): void;
  setLayout(layout: LayoutKind): void;
}

// ---------------------------------------------------------------- effects

export interface Fx extends Updatable {
  readonly object: THREE.Object3D;
  /** Jagged lightning bolt with branches; lives `duration` ms (default 420). */
  bolt(from: THREE.Vector3, to: THREE.Vector3, opts?: { width?: number; color?: THREE.ColorRepresentation; duration?: number; branches?: number }): void;
  sparks(at: THREE.Vector3, count: number, color?: THREE.ColorRepresentation): void;
  shockwave(at: THREE.Vector3, color?: THREE.ColorRepresentation, radius?: number): void;
  /** Gold koban coins raining / fountaining in front of the board. */
  coins(count: number, mode?: 'rain' | 'fountain'): void;
  /** Rising embers / electric motes around a point (anticipation, trigger). */
  aura(at: THREE.Vector3, ms: number, color?: THREE.ColorRepresentation): void;
}

// ---------------------------------------------------------------- cabinet

export interface Cabinet extends Updatable {
  readonly object: THREE.Object3D;
  /** Neon/trim intensity pulse (wins, triggers). */
  pulse(strength?: number, color?: THREE.ColorRepresentation): void;
  /** Reel-column glow used for anticipation (reel 0..4, or -1 for none). */
  anticipation(reel: number): void;
  setMode(mode: SceneMode): void;
  /** Hide the marquee logo (free-spins HUD replaces it). */
  showLogo(on: boolean): void;
}

// ---------------------------------------------------------------- board (reels)

/**
 * The reel board. Same public API the game controller already uses (src/game/controller.ts),
 * implemented in 3D.
 */
export interface Board3D extends Updatable {
  readonly object: THREE.Object3D;
  readonly reels: { locked: boolean }[];
  readonly storms: Map<number, unknown>;
  readonly spinning: boolean;
  useFreeSpinReels(tier: 0 | 1 | 2 | 3): void;
  setBoard(board: SymbolCode[][]): void;
  symbolAt(reel: number, row: number): SymbolCode;
  lockReel(reel: number, locked: boolean): void;
  startSpin(turbo: boolean): void;
  stopReels(board: SymbolCode[][], delays: number[], anticipate: boolean[], onReelStop: (i: number) => void): Promise<void>;
  slam(): void;
  /** Expansion of a Thunder Wild (the lightning strike itself is played by the stage). */
  expandStorm(reel: number, row: number, mult: number, sticky: boolean): Promise<void>;
  setStorm(reel: number, mult: number, sticky: boolean): void;
  clearStorms(): void;
  showWins(wins: LineWin[], label?: string): void;
  clearWins(): void;
  glowScatters(on: boolean): void;
  scatterLanded(reel: number): void;
  /** World-space center of a cell. */
  cellWorld(reel: number, row: number, out: THREE.Vector3): THREE.Vector3;
}

/** Factory signatures each module exports as `create` from its index.ts. */
export interface SceneContext {
  /** Shared PBR environment map etc. live on the scene. */
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  /** Camera shake request (0..1). */
  shake(amount: number): void;
}
