// Pooled camera-facing glow billboards: shockwave rings, flash discs,
// anamorphic lens streaks, starbursts and soft glows. One instanced draw call.
// Slots are stable (no compaction) so owners (bolts, auras) can keep a handle
// and drive the brightness every frame through `ext`.

import * as THREE from 'three';
import { dynAttr, quadGeometry, touch, type FxShared, GLSL_HASH } from './util';

export const FK_RING = 0;
export const FK_DISC = 1;
export const FK_STREAK = 2;
export const FK_STAR = 3;
export const FK_GLOW = 4;

const S = 26;
const PX = 0, PY = 1, PZ = 2, AGE = 3, LIFE = 4, KIND = 5, SZ0 = 6, SZ1 = 7, SX = 8, SY = 9;
const CR = 10, CG = 11, CB = 12, ALPHA = 13, A0 = 14, A1 = 15, B0 = 16, B1 = 17, SEED = 18, ROT = 19;
const EXT = 20, RISE = 21, POW = 22, DELAY = 23, EASE = 24, ON = 25;

export interface FlareSpec {
  x: number; y: number; z: number;
  kind: number;
  /** ms */
  life: number;
  delay: number;
  /** quad half-size (world) at start / end */
  size0: number; size1: number;
  /** aspect multipliers (streaks) */
  sx: number; sy: number;
  r: number; g: number; b: number;
  alpha: number;
  /** shape params (ring radius fraction / thickness) start → end */
  a0: number; a1: number; b0: number; b1: number;
  /** rotation speed rad/s (starburst) */
  rot: number;
  /** fraction of life to reach full brightness */
  rise: number;
  /** fade-out exponent: alpha = (1 - t)^pow */
  pow: number;
  /** size easing exponent: e = 1 - (1 - t)^ease */
  ease: number;
}

const VERT = /* glsl */ `
  attribute vec3 iPos;
  attribute vec2 iScale;
  attribute vec3 iCol;
  attribute vec4 iShape;
  varying vec2 vUv;
  varying vec3 vCol;
  varying vec4 vShape;
  void main() {
    vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
    mv.xy += position.xy * iScale;
    vUv = position.xy;
    vCol = iCol;
    vShape = iShape;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vCol;
  varying vec4 vShape;
  ${GLSL_HASH}
  void main() {
    vec2 uv = vUv;
    float r = length(uv);
    float kind = vShape.x;
    float lum = max(max(vCol.r, vCol.g), vCol.b);
    vec3 white = vec3(lum);
    vec3 col;
    if (kind < 0.5) {
      // electric shockwave ring: broken plasma band + razor hot edge + faint fill
      float a = vShape.y, th = max(vShape.z, 0.004);
      float dr = (r - a) / th;
      float ang = atan(uv.y, uv.x + 1e-6);
      float n = fxNoise(ang * 3.2 + vShape.w * 17.0) * 0.55 + fxNoise(ang * 9.0 - vShape.w * 23.0) * 0.45;
      float band = exp(-dr * dr * 2.0) * (0.45 + 1.1 * n);
      float edge = exp(-(dr - 0.6) * (dr - 0.6) * 18.0) * (0.5 + n);
      float fill = (1.0 - smoothstep(a * 0.2, a, r)) * smoothstep(0.0, a * 0.5, r) * 0.05;
      col = vCol * (band + fill) + white * edge * 0.45;
      col *= 1.0 - smoothstep(0.9, 1.0, r);
    } else if (kind < 1.5) {
      // flash disc: hot core, colored falloff
      col = vCol * (exp(-r * r * 5.0) * 0.8 + exp(-r * r * 30.0)) + white * exp(-r * r * 70.0) * 1.2;
      col *= 1.0 - smoothstep(0.85, 1.0, r);
    } else if (kind < 2.5) {
      // anamorphic streak (horizontal lens flare)
      float x = abs(uv.x), y = uv.y;
      float fall = pow(max(0.0, 1.0 - x), 2.2);
      col = vCol * exp(-y * y * 10.0) * fall + white * exp(-y * y * 110.0) * pow(max(0.0, 1.0 - x), 5.0) * 0.9;
      col *= 1.0 - smoothstep(0.8, 1.0, abs(y));
    } else if (kind < 3.5) {
      // starburst: 6 long rays + 6 short, rotating
      float ang = atan(uv.y, uv.x + 1e-6) + vShape.w;
      float rays = pow(abs(cos(ang * 3.0)), 70.0) + 0.45 * pow(abs(cos(ang * 3.0 + 0.5236)), 110.0);
      float fall = pow(max(0.0, 1.0 - r), 2.6);
      col = vCol * (rays * fall * 1.6 + exp(-r * r * 16.0) * 0.7) + white * exp(-r * r * 60.0);
      col *= 1.0 - smoothstep(0.9, 1.0, r);
    } else {
      // soft glow (light bloom puff / aura)
      col = vCol * (exp(-r * r * 3.2) * 0.7 + exp(-r * r * 12.0) * 0.3);
      col *= 1.0 - smoothstep(0.7, 1.0, r);
    }
    gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  }
`;

export class Flares {
  readonly mesh: THREE.Mesh;
  readonly spec: FlareSpec = {
    x: 0, y: 0, z: 0, kind: FK_DISC, life: 200, delay: 0, size0: 1, size1: 1, sx: 1, sy: 1,
    r: 1, g: 1, b: 1, alpha: 1, a0: 0.8, a1: 0.8, b0: 0.1, b1: 0.1, rot: 0, rise: 0, pow: 2, ease: 3,
  };
  private st: Float32Array;
  private gen: Uint32Array;
  private top = 0;
  private geo: THREE.InstancedBufferGeometry;
  private aPos: THREE.InstancedBufferAttribute;
  private aScale: THREE.InstancedBufferAttribute;
  private aCol: THREE.InstancedBufferAttribute;
  private aShape: THREE.InstancedBufferAttribute;

  constructor(readonly cap: number, _shared: FxShared) {
    this.st = new Float32Array(cap * S);
    this.gen = new Uint32Array(cap);
    this.geo = quadGeometry();
    this.aPos = dynAttr(cap, 3);
    this.aScale = dynAttr(cap, 2);
    this.aCol = dynAttr(cap, 3);
    this.aShape = dynAttr(cap, 4);
    this.geo.setAttribute('iPos', this.aPos);
    this.geo.setAttribute('iScale', this.aScale);
    this.geo.setAttribute('iCol', this.aCol);
    this.geo.setAttribute('iShape', this.aShape);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      name: 'fx-flares',
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 21;
    this.mesh.name = 'fx-flares';
  }

  /** Spawn from `spec`; returns a handle (slot * 65536 + generation) or -1 when full. */
  emit(): number {
    const st = this.st;
    let i = -1;
    for (let j = 0; j < this.cap; j++) {
      if (st[j * S + ON] === 0) {
        i = j;
        break;
      }
    }
    if (i < 0) return -1;
    const s = this.spec, o = i * S;
    st[o + PX] = s.x; st[o + PY] = s.y; st[o + PZ] = s.z;
    st[o + AGE] = 0; st[o + LIFE] = Math.max(16, s.life); st[o + KIND] = s.kind;
    st[o + SZ0] = s.size0; st[o + SZ1] = s.size1; st[o + SX] = s.sx; st[o + SY] = s.sy;
    st[o + CR] = s.r; st[o + CG] = s.g; st[o + CB] = s.b; st[o + ALPHA] = s.alpha;
    st[o + A0] = s.a0; st[o + A1] = s.a1; st[o + B0] = s.b0; st[o + B1] = s.b1;
    st[o + SEED] = Math.random() * 10; st[o + ROT] = s.rot; st[o + EXT] = 1;
    st[o + RISE] = s.rise; st[o + POW] = s.pow; st[o + DELAY] = s.delay; st[o + EASE] = s.ease; st[o + ON] = 1;
    this.gen[i] = (this.gen[i] + 1) & 0xffff;
    if (i + 1 > this.top) this.top = i + 1;
    return i * 65536 + this.gen[i];
  }

  private slot(h: number): number {
    if (h < 0) return -1;
    const i = Math.floor(h / 65536);
    return this.st[i * S + ON] === 1 && this.gen[i] === (h & 0xffff) ? i : -1;
  }

  /** Brightness multiplier driven by the owner (bolt flicker, aura pulse). */
  setExt(h: number, v: number) {
    const i = this.slot(h);
    if (i >= 0) this.st[i * S + EXT] = v;
  }

  setPos(h: number, x: number, y: number, z: number) {
    const i = this.slot(h);
    if (i >= 0) {
      const o = i * S;
      this.st[o + PX] = x; this.st[o + PY] = y; this.st[o + PZ] = z;
    }
  }

  kill(h: number) {
    const i = this.slot(h);
    if (i >= 0) this.st[i * S + ON] = 0;
  }

  setColor(c: THREE.Color, k: number) {
    this.spec.r = c.r * k; this.spec.g = c.g * k; this.spec.b = c.b * k;
  }

  update(dt: number) {
    const st = this.st;
    const pos = this.aPos.array as Float32Array, sc = this.aScale.array as Float32Array;
    const col = this.aCol.array as Float32Array, sh = this.aShape.array as Float32Array;
    let top = 0;
    for (let i = 0; i < this.top; i++) {
      const o = i * S, j2 = i * 2, j3 = i * 3, j4 = i * 4;
      if (st[o + ON] === 0) {
        col[j3] = col[j3 + 1] = col[j3 + 2] = 0;
        sc[j2] = sc[j2 + 1] = 0;
        continue;
      }
      let age = st[o + AGE] + dt;
      st[o + AGE] = age;
      age -= st[o + DELAY];
      const life = st[o + LIFE];
      if (age >= life) {
        st[o + ON] = 0;
        col[j3] = col[j3 + 1] = col[j3 + 2] = 0;
        sc[j2] = sc[j2 + 1] = 0;
        continue;
      }
      top = i + 1;
      if (age < 0) {
        col[j3] = col[j3 + 1] = col[j3 + 2] = 0;
        sc[j2] = sc[j2 + 1] = 0;
        continue;
      }
      const t = age / life;
      const e = 1 - Math.pow(1 - t, st[o + EASE]);
      const size = st[o + SZ0] + (st[o + SZ1] - st[o + SZ0]) * e;
      const rise = st[o + RISE];
      let a = st[o + ALPHA] * st[o + EXT] * Math.pow(1 - t, st[o + POW]);
      if (rise > 0 && t < rise) a *= t / rise;
      pos[j3] = st[o + PX]; pos[j3 + 1] = st[o + PY]; pos[j3 + 2] = st[o + PZ];
      sc[j2] = size * st[o + SX]; sc[j2 + 1] = size * st[o + SY];
      col[j3] = st[o + CR] * a; col[j3 + 1] = st[o + CG] * a; col[j3 + 2] = st[o + CB] * a;
      sh[j4] = st[o + KIND];
      sh[j4 + 1] = st[o + A0] + (st[o + A1] - st[o + A0]) * e;
      sh[j4 + 2] = st[o + B0] + (st[o + B1] - st[o + B0]) * e;
      sh[j4 + 3] = st[o + SEED] + st[o + ROT] * age * 0.001;
    }
    this.top = top;
    this.geo.instanceCount = top;
    touch(this.aPos, top);
    touch(this.aScale, top);
    touch(this.aCol, top);
    touch(this.aShape, top);
  }
}
