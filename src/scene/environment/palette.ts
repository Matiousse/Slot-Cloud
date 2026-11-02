// Mode palettes (ART_DIRECTION §2) + the uniform block shared by every
// environment shader. Colours are lerped in place each frame (no allocation),
// so all materials that reference these uniforms transition together.

import * as THREE from 'three';
import type { SceneMode } from '../contracts';
import { noiseTexture } from './noise';

export interface ModeDef {
  skyTop: number;
  skyMid: number;
  /** Light-pollution band above the skyline. */
  horizon: number;
  cloudDark: number;
  /** Thin cloud edges / undersides lit by the city. */
  cloudLit: number;
  /** Lightning + cloud-internal flash colour. */
  lightning: number;
  fog: number;
  /** Haze glowing up from the streets far below. */
  cityGlow: number;
  winWarm: number;
  winCool: number;
  /** Searchlight colour. */
  beam: number;
  /** Mode accent (neon trims, motes). */
  accent: number;
  /** Divine light (god shafts, cloud break). */
  shaft: number;
  shaftAmt: number;
  /** Cloud churn speed multiplier. */
  churn: number;
  /** Floating motes amount (embers in lock, gold in god). */
  motes: number;
  /** Ambient lightning interval range (ms). */
  strikeMin: number;
  strikeMax: number;
  /** Intra-cloud flicker interval range (ms). */
  flickerMin: number;
  flickerMax: number;
}

export const MODES: Record<SceneMode, ModeDef> = {
  base: {
    skyTop: 0x05060f,
    skyMid: 0x18204a,
    horizon: 0x5e3a8c,
    cloudDark: 0x090c1a,
    cloudLit: 0x55618e,
    lightning: 0xbfefff,
    fog: 0x1a2040,
    cityGlow: 0x5c1f62,
    winWarm: 0xffb562,
    winCool: 0x9fe6ff,
    beam: 0xa6dcff,
    accent: 0x38e8ff,
    shaft: 0xbfe8ff,
    shaftAmt: 0,
    churn: 1,
    motes: 0.25,
    strikeMin: 4000,
    strikeMax: 10000,
    flickerMin: 900,
    flickerMax: 3200,
  },
  overcharge: {
    skyTop: 0x030818,
    skyMid: 0x0e2152,
    horizon: 0x2f6ad0,
    cloudDark: 0x07122e,
    cloudLit: 0x5a8ae6,
    lightning: 0xe6fbff,
    fog: 0x0f1d44,
    cityGlow: 0x1f48c0,
    winWarm: 0xbfe6ff,
    winCool: 0x7ff6ff,
    beam: 0xd2f6ff,
    accent: 0x7ff6ff,
    shaft: 0xd2f6ff,
    shaftAmt: 0.15,
    churn: 1.8,
    motes: 0.6,
    strikeMin: 1800,
    strikeMax: 4500,
    flickerMin: 350,
    flickerMax: 1300,
  },
  lock: {
    skyTop: 0x080103,
    skyMid: 0x2e070c,
    horizon: 0x9a2418,
    cloudDark: 0x180306,
    cloudLit: 0xa83a30,
    lightning: 0xffd36b,
    fog: 0x26080c,
    cityGlow: 0x8a1a12,
    winWarm: 0xffb347,
    winCool: 0xff6a4a,
    beam: 0xffc070,
    accent: 0xff3b30,
    shaft: 0xffb050,
    shaftAmt: 0.1,
    churn: 1.4,
    motes: 1,
    strikeMin: 2500,
    strikeMax: 6000,
    flickerMin: 500,
    flickerMax: 1800,
  },
  god: {
    skyTop: 0x0a0318,
    skyMid: 0x2e1048,
    horizon: 0x8a4aa0,
    cloudDark: 0x160a2c,
    cloudLit: 0x9a70b0,
    lightning: 0xfff0c0,
    fog: 0x201032,
    cityGlow: 0x7a4486,
    winWarm: 0xffd36b,
    winCool: 0xe0b8ff,
    beam: 0xffe2a0,
    accent: 0xffd36b,
    shaft: 0xffd36b,
    shaftAmt: 1,
    churn: 1.25,
    motes: 1,
    strikeMin: 2200,
    strikeMax: 5500,
    flickerMin: 450,
    flickerMax: 1600,
  },
};

const COLOR_KEYS = ['skyTop', 'skyMid', 'horizon', 'cloudDark', 'cloudLit', 'lightning', 'fog', 'cityGlow', 'winWarm', 'winCool', 'beam', 'accent', 'shaft'] as const;
type ColorKey = (typeof COLOR_KEYS)[number];

export type EnvUniforms = ReturnType<typeof makeUniforms>;

export function makeUniforms() {
  const c = () => ({ value: new THREE.Color() });
  return {
    uNoise: { value: noiseTexture() as THREE.Texture },
    /** seconds of animation clock */
    uTime: { value: 0 },
    /** global lightning flash (0..~2) */
    uFlash: { value: 0 },
    /** cloud-internal flash cell (angular coords) + intensity */
    uCell: { value: new THREE.Vector2(0.3, 0.2) },
    uCellI: { value: 0 },
    uCell2: { value: new THREE.Vector2(-0.3, 0.2) },
    uCell2I: { value: 0 },
    /** calm zone (angular centre xy, radii zw) behind cabinet / character */
    uCalm: { value: new THREE.Vector4(-0.36, -0.02, 0.16, 0.3) },
    uCalmAmt: { value: 0.7 },
    uFogDensity: { value: 0.0105 },
    uShaftAmt: { value: 0 },
    uChurn: { value: 1 },
    uMotes: { value: 0.25 },
    /** seconds of cloud scroll (integrated with churn) */
    uCloudT: { value: 0 },
    uSkyTop: c(),
    uSkyMid: c(),
    uHorizon: c(),
    uCloudDark: c(),
    uCloudLit: c(),
    uLightning: c(),
    uFog: c(),
    uCityGlow: c(),
    uWinWarm: c(),
    uWinCool: c(),
    uBeam: c(),
    uAccent: c(),
    uShaft: c(),
  };
}

const UNIFORM_OF: Record<ColorKey, keyof EnvUniforms> = {
  skyTop: 'uSkyTop',
  skyMid: 'uSkyMid',
  horizon: 'uHorizon',
  cloudDark: 'uCloudDark',
  cloudLit: 'uCloudLit',
  lightning: 'uLightning',
  fog: 'uFog',
  cityGlow: 'uCityGlow',
  winWarm: 'uWinWarm',
  winCool: 'uWinCool',
  beam: 'uBeam',
  accent: 'uAccent',
  shaft: 'uShaft',
};

/** Smoothly drives the shared uniforms toward a mode palette. */
export class PaletteDriver {
  mode: SceneMode = 'base';
  private target: Record<ColorKey, THREE.Color>;
  private scalars = { shaftAmt: 0, churn: 1, motes: 0.25 };
  /** 0..1 progress of the current transition (for one-shot effects). */
  blend = 1;

  constructor(private u: EnvUniforms) {
    this.target = {} as Record<ColorKey, THREE.Color>;
    for (const k of COLOR_KEYS) this.target[k] = new THREE.Color();
    this.set('base', true);
  }

  get def(): ModeDef {
    return MODES[this.mode];
  }

  set(mode: SceneMode, instant = false) {
    this.mode = mode;
    const d = MODES[mode];
    for (const k of COLOR_KEYS) this.target[k].set(d[k]);
    this.scalars.shaftAmt = d.shaftAmt;
    this.scalars.churn = d.churn;
    this.scalars.motes = d.motes;
    this.blend = 0;
    if (instant) this.step(1e6);
  }

  step(dt: number) {
    // ~1.4 s ease toward the target (exponential, frame-rate independent)
    const k = 1 - Math.exp(-dt / 420);
    for (const key of COLOR_KEYS) (this.u[UNIFORM_OF[key]].value as THREE.Color).lerp(this.target[key], k);
    const u = this.u;
    u.uShaftAmt.value += (this.scalars.shaftAmt - u.uShaftAmt.value) * k;
    u.uChurn.value += (this.scalars.churn - u.uChurn.value) * k;
    u.uMotes.value += (this.scalars.motes - u.uMotes.value) * k;
    this.blend = Math.min(1, this.blend + dt / 1400);
  }
}
