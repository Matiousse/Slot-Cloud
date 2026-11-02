// Pooled additive particles: camera-facing, velocity-stretched instanced
// sprites (motion-blurred sparks, soft motes, star glints, flickering embers),
// simulated on the CPU with gravity, drag and turbulence. One draw call.
//
// Usage (allocation free): fill `spec`, call `emit()`.

import * as THREE from 'three';
import { dynAttr, quadGeometry, touch, type FxShared, GLSL_HASH } from './util';

export const PK_SPARK = 0; // hot streak, stretched along velocity
export const PK_MOTE = 1; // soft round mote, twinkles
export const PK_GLINT = 2; // 4-point star glint (gold/coins)
export const PK_EMBER = 3; // small hot dot, flickers

// state layout (floats per particle)
const S = 28;
const PX = 0, PY = 1, PZ = 2, VX = 3, VY = 4, VZ = 5, AGE = 6, LIFE = 7, SZ0 = 8, SZ1 = 9;
const R0 = 10, G0 = 11, B0 = 12, R1 = 13, G1 = 14, B1 = 15, ALPHA = 16, DRAG = 17, GRAV = 18;
const STRETCH = 19, KIND = 20, TURB = 21, FIN = 22, SEED = 23, CT = 24, FOUT = 25, SPIN = 26;

export interface ParticleSpec {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** ms */
  life: number;
  size0: number; size1: number;
  /** start colour (HDR) */
  r0: number; g0: number; b0: number;
  /** end colour (HDR) */
  r1: number; g1: number; b1: number;
  alpha: number;
  /** 1/s */
  drag: number;
  /** world units / s^2 (positive = falls) */
  grav: number;
  /** streak shutter time (s): streak length = size + speed * stretch */
  stretch: number;
  kind: number;
  /** turbulence acceleration amplitude */
  turb: number;
  /** fraction of life used to fade in */
  fadeIn: number;
  /** fraction of life over which the colour goes from start to end */
  colorT: number;
  /** fraction of life after which alpha fades out */
  fadeOut: number;
  /** glint rotation speed (rad/s) */
  spin: number;
}

const VERT = /* glsl */ `
  attribute vec3 iPos;
  attribute vec3 iVel;
  attribute vec3 iCol;
  attribute vec4 iData; // size, stretch, kind, seed/rotation
  uniform float uPx;
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vKind;
  varying float vSeed;
  void main() {
    vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
    float size = iData.x;
    // keep sub-pixel particles at >= ~1.3 px, conserving energy (no shimmer)
    float minS = -mv.z * uPx * 1.3;
    float s = max(size, minS);
    float energy = (size * size) / (s * s);
    vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
    float sp = length(vv.xy);
    vec2 ax = sp > 1e-4 ? vv.xy / sp : vec2(1.0, 0.0);
    float len = s + sp * iData.y;
    vec2 pp = vec2(-ax.y, ax.x);
    mv.xy += ax * position.x * len + pp * position.y * s;
    vUv = position.xy;
    vCol = iCol * energy * (s / len * 0.6 + 0.4);
    vKind = iData.z;
    vSeed = iData.w;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vKind;
  varying float vSeed;
  ${GLSL_HASH}
  void main() {
    vec2 uv = vUv;
    float d2 = dot(uv, uv);
    float lum = max(max(vCol.r, vCol.g), vCol.b);
    vec3 col;
    if (vKind < 0.5) {
      // streak: comet profile, hot white core, bright head
      float across = exp(-uv.y * uv.y * 7.0) * (1.0 - uv.y * uv.y);
      float along = 1.0 - smoothstep(0.35, 1.0, abs(uv.x));
      float head = mix(0.25, 1.0, smoothstep(-1.0, 0.7, uv.x));
      float core = exp(-uv.y * uv.y * 40.0) * along * head;
      col = vCol * across * along * head + vec3(lum) * core * 0.35;
    } else if (vKind < 1.5) {
      // mote: soft halo + tight core, twinkle
      float tw = 0.55 + 0.45 * sin(uTime * 0.013 + vSeed * 37.0);
      float a = exp(-d2 * 4.5) * 0.55 + exp(-d2 * 30.0);
      col = vCol * a * tw + vec3(lum) * exp(-d2 * 70.0) * 0.4 * tw;
      col *= 1.0 - smoothstep(0.75, 1.0, d2);
    } else if (vKind < 2.5) {
      // glint: rotating 4-point star
      float c = cos(vSeed), s = sin(vSeed);
      vec2 r = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
      float rays = exp(-abs(r.y) * 28.0) * pow(max(0.0, 1.0 - abs(r.x)), 3.0)
                 + exp(-abs(r.x) * 28.0) * pow(max(0.0, 1.0 - abs(r.y)), 3.0);
      vec2 r2 = vec2(r.x + r.y, r.x - r.y) * 0.7071;
      float diag = (exp(-abs(r2.y) * 40.0) * pow(max(0.0, 1.0 - abs(r2.x) * 1.6), 3.0)
                  + exp(-abs(r2.x) * 40.0) * pow(max(0.0, 1.0 - abs(r2.y) * 1.6), 3.0)) * 0.35;
      float core = exp(-d2 * 26.0);
      col = vCol * (rays + diag + core * 0.8) + vec3(lum) * exp(-d2 * 90.0) * 0.8;
    } else {
      // ember: hot flickering dot
      float fl = 0.6 + 0.4 * fxNoise(uTime * 0.02 + vSeed * 91.0);
      float a = exp(-d2 * 9.0) * 0.5 + exp(-d2 * 40.0);
      col = vCol * a * fl + vec3(lum) * exp(-d2 * 90.0) * 0.5 * fl;
      col *= 1.0 - smoothstep(0.75, 1.0, d2);
    }
    gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  }
`;

export class Particles {
  readonly mesh: THREE.Mesh;
  readonly spec: ParticleSpec = {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 500, size0: 0.05, size1: 0,
    r0: 1, g0: 1, b0: 1, r1: 1, g1: 1, b1: 1, alpha: 1, drag: 1, grav: 0, stretch: 0,
    kind: PK_SPARK, turb: 0, fadeIn: 0, colorT: 0.3, fadeOut: 0.4, spin: 0,
  };
  count = 0;
  private st: Float32Array;
  private steal = 0;
  private geo: THREE.InstancedBufferGeometry;
  private aPos: THREE.InstancedBufferAttribute;
  private aVel: THREE.InstancedBufferAttribute;
  private aCol: THREE.InstancedBufferAttribute;
  private aData: THREE.InstancedBufferAttribute;

  constructor(readonly cap: number, shared: FxShared) {
    this.st = new Float32Array(cap * S);
    this.geo = quadGeometry();
    this.aPos = dynAttr(cap, 3);
    this.aVel = dynAttr(cap, 3);
    this.aCol = dynAttr(cap, 3);
    this.aData = dynAttr(cap, 4);
    this.geo.setAttribute('iPos', this.aPos);
    this.geo.setAttribute('iVel', this.aVel);
    this.geo.setAttribute('iCol', this.aCol);
    this.geo.setAttribute('iData', this.aData);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      name: 'fx-particles',
      uniforms: { uTime: shared.uTime, uPx: shared.uPx },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.name = 'fx-particles';
  }

  /** Spawn one particle from `spec`. When the pool is full, recycles round-robin. */
  emit() {
    let i: number;
    if (this.count < this.cap) i = this.count++;
    else i = this.steal = (this.steal + 1) % this.cap;
    const s = this.spec, st = this.st, o = i * S;
    st[o + PX] = s.x; st[o + PY] = s.y; st[o + PZ] = s.z;
    st[o + VX] = s.vx; st[o + VY] = s.vy; st[o + VZ] = s.vz;
    st[o + AGE] = 0; st[o + LIFE] = Math.max(16, s.life);
    st[o + SZ0] = s.size0; st[o + SZ1] = s.size1;
    st[o + R0] = s.r0; st[o + G0] = s.g0; st[o + B0] = s.b0;
    st[o + R1] = s.r1; st[o + G1] = s.g1; st[o + B1] = s.b1;
    st[o + ALPHA] = s.alpha; st[o + DRAG] = s.drag; st[o + GRAV] = s.grav;
    st[o + STRETCH] = s.stretch; st[o + KIND] = s.kind; st[o + TURB] = s.turb;
    st[o + FIN] = s.fadeIn; st[o + SEED] = Math.random() * 6.2832; st[o + CT] = Math.max(0.001, s.colorT);
    st[o + FOUT] = Math.min(0.999, s.fadeOut); st[o + SPIN] = s.spin;
  }

  /** Set the start/end colours of `spec` from a base colour (HDR multipliers). */
  colors(c0: THREE.Color, k0: number, c1: THREE.Color, k1: number) {
    const s = this.spec;
    s.r0 = c0.r * k0; s.g0 = c0.g * k0; s.b0 = c0.b * k0;
    s.r1 = c1.r * k1; s.g1 = c1.g * k1; s.b1 = c1.b * k1;
  }

  update(dt: number) {
    const st = this.st;
    const k = dt * 0.001;
    const pos = this.aPos.array as Float32Array, vel = this.aVel.array as Float32Array;
    const col = this.aCol.array as Float32Array, dat = this.aData.array as Float32Array;
    let i = 0;
    while (i < this.count) {
      const o = i * S;
      const age = st[o + AGE] + dt;
      const life = st[o + LIFE];
      if (age >= life) {
        this.count--;
        if (i !== this.count) st.copyWithin(o, this.count * S, this.count * S + S);
        continue;
      }
      st[o + AGE] = age;
      const drag = 1 / (1 + st[o + DRAG] * k);
      let vx = st[o + VX] * drag, vy = st[o + VY] * drag - st[o + GRAV] * k, vz = st[o + VZ] * drag;
      const turb = st[o + TURB];
      if (turb !== 0) {
        const ph = st[o + SEED] * 7 + age * 0.0035;
        vx += Math.sin(ph * 1.7) * turb * k;
        vy += Math.sin(ph * 1.1 + 2.0) * turb * k * 0.4;
        vz += Math.cos(ph * 1.3) * turb * k * 0.5;
      }
      st[o + VX] = vx; st[o + VY] = vy; st[o + VZ] = vz;
      const px = (st[o + PX] += vx * k), py = (st[o + PY] += vy * k), pz = (st[o + PZ] += vz * k);
      const t = age / life;
      const fin = st[o + FIN];
      const fo = st[o + FOUT];
      let a = st[o + ALPHA];
      if (fin > 0 && t < fin) a *= t / fin;
      if (t > fo) {
        const u = (t - fo) / (1 - fo);
        a *= 1 - u * u * (3 - 2 * u);
      }
      let ct = t / st[o + CT];
      if (ct > 1) ct = 1;
      ct = ct * ct * (3 - 2 * ct);
      const j3 = i * 3, j4 = i * 4;
      pos[j3] = px; pos[j3 + 1] = py; pos[j3 + 2] = pz;
      vel[j3] = vx; vel[j3 + 1] = vy; vel[j3 + 2] = vz;
      col[j3] = (st[o + R0] + (st[o + R1] - st[o + R0]) * ct) * a;
      col[j3 + 1] = (st[o + G0] + (st[o + G1] - st[o + G0]) * ct) * a;
      col[j3 + 2] = (st[o + B0] + (st[o + B1] - st[o + B0]) * ct) * a;
      dat[j4] = st[o + SZ0] + (st[o + SZ1] - st[o + SZ0]) * t;
      dat[j4 + 1] = st[o + STRETCH];
      dat[j4 + 2] = st[o + KIND];
      dat[j4 + 3] = st[o + SEED] + st[o + SPIN] * age * 0.001;
      i++;
    }
    this.geo.instanceCount = this.count;
    touch(this.aPos, this.count);
    touch(this.aVel, this.count);
    touch(this.aCol, this.count);
    touch(this.aData, this.count);
  }
}
