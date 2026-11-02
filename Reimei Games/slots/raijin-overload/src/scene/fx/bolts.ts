// Lightning bolts: recursive midpoint-displacement channels (trunk + ghost
// channel + 2-4 branches + forks) rendered as camera-facing ribbon strips with
// a custom shader (white-hot core, coloured glow, soft edges, leader tip).
// Two layers per bolt: a wide soft halo and the sharp core. Re-jittered every
// ~50 ms (flicker, re-strikes). Fully pooled: geometry buffers are allocated
// once per slot and rewritten in place.

import * as THREE from 'three';
import { gauss, len3, rand, smooth, touch, type FxShared, GLSL_HASH } from './util';

const MAX_LEVEL = 7;
const MAX_TRUNK = (1 << MAX_LEVEL) + 1; // 129
const MAX_BR = 4;
const BR_LEVEL = 4;
const BR_PTS = (1 << BR_LEVEL) + 1; // 17
const FK_LEVEL = 3;
const FK_PTS = (1 << FK_LEVEL) + 1; // 9
const MAX_PTS = MAX_TRUNK * 2 + MAX_BR * (BR_PTS + FK_PTS) + 8;

const VERT = /* glsl */ `
  attribute vec3 aDir;
  attribute vec4 aData; // side, u (reveal coord), width mult, intensity mult
  uniform float uWidth;
  uniform float uPx;
  varying float vSide;
  varying float vU;
  varying float vI;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 t = (modelViewMatrix * vec4(aDir, 0.0)).xyz;
    vec3 v = normalize(-mv.xyz);
    vec3 n = cross(t, v);
    float ln = length(n);
    n = ln > 1e-5 ? n / ln : vec3(1.0, 0.0, 0.0);
    float want = uWidth * aData.z;
    float w = max(want, -mv.z * uPx * 1.6);
    mv.xyz += n * aData.x * w;
    vSide = aData.x;
    vU = aData.y;
    vI = aData.w * (want / w);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uCore;
  uniform float uIntensity;
  uniform float uReveal;
  uniform float uSeed;
  uniform float uGlow;
  uniform float uCoreAmt;
  uniform float uSharp;
  varying float vSide;
  varying float vU;
  varying float vI;
  ${GLSL_HASH}
  void main() {
    float head = vU - uReveal;
    if (head > 0.0) discard;
    float tip = exp(-head * head * 1400.0);
    float d = abs(vSide);
    float seg = 0.72 + 0.56 * fxHash(floor(vU * 70.0) + uSeed * 13.0);
    float g = 1.0 - d;
    float glow = g * g * g;
    float core = exp(-d * d * uSharp);
    vec3 col = uColor * glow * uGlow + uCore * core * uCoreAmt;
    col *= vI * uIntensity * seg * (1.0 + tip * 1.5);
    gl_FragColor = vec4(col, 1.0);
  }
`;

type V3 = THREE.Vector3;

class Slot {
  active = false;
  arc = false;
  age = 0;
  life = 420;
  reveal = 60;
  jitterAt = 0;
  impactDone = false;
  impact = true;
  levels = 6;
  n = 64;
  len = 1;
  width = 0.08;
  kw = 1;
  flick = 1;
  seed = 0;
  nBr = 0;
  readonly from = new THREE.Vector3();
  readonly to = new THREE.Vector3();
  readonly dir = new THREE.Vector3();
  readonly s1 = new THREE.Vector3();
  readonly s2 = new THREE.Vector3();
  readonly color = new THREE.Color();
  readonly trunk = new Float32Array(MAX_TRUNK * 3);
  readonly ghost = new Float32Array(MAX_TRUNK * 3);
  readonly br = new Float32Array(MAX_BR * BR_PTS * 3);
  readonly fk = new Float32Array(MAX_BR * FK_PTS * 3);
  readonly brAt = new Int32Array(MAX_BR);
  readonly brOff = new Float32Array(MAX_BR * 3);
  readonly brS1 = new Float32Array(MAX_BR * 3);
  readonly brS2 = new Float32Array(MAX_BR * 3);
  readonly brLen = new Float32Array(MAX_BR);
  readonly fkAt = new Int32Array(MAX_BR);
  readonly fkOff = new Float32Array(MAX_BR * 3);
  readonly geo = new THREE.BufferGeometry();
  readonly pos = new Float32Array(MAX_PTS * 2 * 3);
  readonly dirs = new Float32Array(MAX_PTS * 2 * 3);
  readonly data = new Float32Array(MAX_PTS * 2 * 4);
  readonly idx = new Uint16Array(MAX_PTS * 6);
  readonly aPos: THREE.BufferAttribute;
  readonly aDir: THREE.BufferAttribute;
  readonly aData: THREE.BufferAttribute;
  readonly aIdx: THREE.BufferAttribute;
  readonly core: THREE.Mesh;
  readonly halo: THREE.Mesh;
  readonly uCore: Record<string, THREE.IUniform>;
  readonly uHalo: Record<string, THREE.IUniform>;
  vCount = 0;
  iCount = 0;
  flare = -1;
  flareTo = -1;

  constructor(shared: FxShared) {
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aDir = new THREE.BufferAttribute(this.dirs, 3).setUsage(THREE.DynamicDrawUsage);
    this.aData = new THREE.BufferAttribute(this.data, 4).setUsage(THREE.DynamicDrawUsage);
    this.aIdx = new THREE.BufferAttribute(this.idx, 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.aPos);
    this.geo.setAttribute('aDir', this.aDir);
    this.geo.setAttribute('aData', this.aData);
    this.geo.setIndex(this.aIdx);
    this.geo.setDrawRange(0, 0);
    const mk = (layer: 'core' | 'halo') => ({
      uColor: { value: new THREE.Color() },
      uCore: { value: new THREE.Color() },
      uIntensity: { value: 0 },
      uReveal: { value: 0 },
      uSeed: { value: 0 },
      uWidth: { value: 0.1 },
      uGlow: { value: layer === 'core' ? 0.85 : 0.06 },
      uCoreAmt: { value: layer === 'core' ? 1.0 : 0.0 },
      uSharp: { value: layer === 'core' ? 16.0 : 1.0 },
      uPx: shared.uPx,
    });
    this.uCore = mk('core');
    this.uHalo = mk('halo');
    const mat = (u: Record<string, THREE.IUniform>, name: string) =>
      new THREE.ShaderMaterial({
        name,
        uniforms: u,
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
    this.halo = new THREE.Mesh(this.geo, mat(this.uHalo, 'fx-bolt-halo'));
    this.core = new THREE.Mesh(this.geo, mat(this.uCore, 'fx-bolt-core'));
    for (const m of [this.halo, this.core]) {
      m.frustumCulled = false;
      m.visible = false;
    }
    this.halo.renderOrder = 18;
    this.core.renderOrder = 19;
  }
}

export interface BoltOpts {
  width: number;
  color: THREE.Color;
  duration: number;
  branches: number;
  /** micro arc (no impact, no ghost channel, quick reveal) */
  arc: boolean;
}


const _c = new THREE.Vector3();
const _t = new THREE.Vector3();
const _w = new THREE.Color();

export class Bolts {
  readonly group = new THREE.Group();
  readonly slots: Slot[] = [];
  /** Called once per bolt when the leader reaches `to` (impact effects). */
  onImpact: (to: V3, color: THREE.Color, width: number) => void = () => {};
  /** Fired at spawn (origin flare etc.). */
  onSpawn: (slot: { from: V3; color: THREE.Color; width: number; life: number; arc: boolean }) => number = () => -1;
  onEnd: (flare: number) => void = () => {};
  onTick: (flare: number, intensity: number) => void = () => {};

  constructor(count: number, private shared: FxShared) {
    this.group.name = 'fx-bolts';
    for (let i = 0; i < count; i++) {
      const s = new Slot(shared);
      this.slots.push(s);
      this.group.add(s.halo, s.core);
    }
  }

  /** Number of slots currently alive (for tests). */
  get alive() {
    let n = 0;
    for (const s of this.slots) if (s.active) n++;
    return n;
  }

  spawn(from: V3, to: V3, o: BoltOpts): boolean {
    // prefer a free slot; micro arcs never steal, main bolts steal the oldest arc / oldest bolt
    let slot: Slot | null = null;
    const slots = this.slots;
    for (let i = 0; i < slots.length; i++) if (!slots[i].active) { slot = slots[i]; break; }
    if (!slot) {
      if (o.arc) return false;
      let best = -1;
      for (let i = 0; i < slots.length; i++) {
        const score = (slots[i].arc ? 1e6 : 0) + slots[i].age;
        if (score > best) { best = score; slot = slots[i]; }
      }
      if (!slot) return false;
      this.onEnd(slot.flare);
    }
    const s = slot;
    s.active = true;
    s.arc = o.arc;
    s.age = 0;
    s.life = o.duration;
    s.reveal = o.arc ? 22 : Math.min(48, 22 + from.distanceTo(to) * 4);
    s.impact = !o.arc;
    s.impactDone = false;
    s.width = o.width;
    s.color.copy(o.color);
    s.from.copy(from);
    s.to.copy(to);
    s.len = from.distanceTo(to);
    s.levels = Math.max(3, Math.min(MAX_LEVEL, Math.ceil(Math.log2(Math.max(1, s.len / (o.arc ? 0.05 : 0.11))))));
    s.n = 1 << s.levels;
    s.nBr = Math.max(0, Math.min(MAX_BR, o.branches));
    s.flick = 1;
    // frame: s1 = in screen plane, perpendicular to the bolt; s2 = toward camera-ish
    s.dir.copy(to).sub(from).normalize();
    this.shared.camera.getWorldPosition(_c);
    _t.copy(from).add(to).multiplyScalar(0.5);
    _c.sub(_t).normalize();
    s.s1.crossVectors(s.dir, _c);
    if (s.s1.lengthSq() < 1e-6) s.s1.set(1, 0, 0);
    s.s1.normalize();
    s.s2.crossVectors(s.s1, s.dir).normalize();
    this.buildFull(s);
    s.jitterAt = rand(40, 60);
    s.halo.visible = s.core.visible = true;
    // colours: halo/glow = given colour, core = white-hot with a hint of colour
    // energy-aware: wide bolts get a relatively thinner core and lower radiance
    s.kw = Math.max(0.6, o.width / 0.06);
    const ik = 1 / Math.sqrt(s.kw);
    const glowK = (o.arc ? 1.6 : 1.9) * ik;
    (s.uCore.uColor.value as THREE.Color).copy(o.color).multiplyScalar(glowK);
    (s.uHalo.uColor.value as THREE.Color).copy(o.color).multiplyScalar(glowK);
    _w.setRGB(1, 1, 1).lerp(o.color, 0.12);
    (s.uCore.uCore.value as THREE.Color).copy(_w).multiplyScalar((o.arc ? 2.4 : 3.0) * Math.min(1, ik * 1.15));
    s.uCore.uSharp.value = 16 * s.kw;
    s.flare = this.onSpawn(s);
    this.write(s);
    return true;
  }

  // ------------------------------------------------------------------ generation

  private subdivide(p: Float32Array, base: number, n: number, fromStep: number, len: number, rough: number, s1x: number, s1y: number, s1z: number, s2x: number, s2y: number, s2z: number, depth: number) {
    for (let step = fromStep; step >= 1; step >>= 1) {
      const fine = step * 8 <= n ? 1.7 : step * 4 <= n ? 1.25 : 1;
      const amp = ((len * 2 * step) / n) * rough * fine;
      for (let i = step; i < n; i += 2 * step) {
        const a = (base + i - step) * 3, b = (base + i + step) * 3, m = (base + i) * 3;
        const g1 = gauss() * amp, g2 = gauss() * amp * depth;
        p[m] = (p[a] + p[b]) * 0.5 + s1x * g1 + s2x * g2;
        p[m + 1] = (p[a + 1] + p[b + 1]) * 0.5 + s1y * g1 + s2y * g2;
        p[m + 2] = (p[a + 2] + p[b + 2]) * 0.5 + s1z * g1 + s2z * g2;
      }
    }
  }

  private trunkPath(s: Slot, fromStep: number) {
    const p = s.trunk, n = s.n;
    p[0] = s.from.x; p[1] = s.from.y; p[2] = s.from.z;
    p[n * 3] = s.to.x; p[n * 3 + 1] = s.to.y; p[n * 3 + 2] = s.to.z;
    const rough = s.arc ? 0.42 : 0.3;
    this.subdivide(p, 0, n, fromStep, s.len, rough, s.s1.x, s.s1.y, s.s1.z, s.s2.x, s.s2.y, s.s2.z, 0.45);
    if (!s.arc) {
      // ghost channel: same coarse shape, independent fine detail
      const g = s.ghost;
      const keep = Math.max(1, n >> 2);
      for (let i = 0; i <= n; i += keep) {
        g[i * 3] = p[i * 3]; g[i * 3 + 1] = p[i * 3 + 1]; g[i * 3 + 2] = p[i * 3 + 2];
      }
      this.subdivide(g, 0, n, keep >> 1, s.len, 0.36, s.s1.x, s.s1.y, s.s1.z, s.s2.x, s.s2.y, s.s2.z, 0.6);
    }
  }

  private branchSetup(s: Slot) {
    const n = s.n;
    for (let b = 0; b < s.nBr; b++) {
      const f = rand(0.1, 0.72);
      s.brAt[b] = Math.max(1, Math.min(n - 2, Math.round(f * n)));
      const sign = Math.random() < 0.5 ? -1 : 1;
      const ang = rand(0.35, 0.95) * sign;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const dz = rand(-0.3, 0.3);
      let dx = s.dir.x * ca + s.s1.x * sa + s.s2.x * dz;
      let dy = s.dir.y * ca + s.s1.y * sa + s.s2.y * dz;
      let dzz = s.dir.z * ca + s.s1.z * sa + s.s2.z * dz;
      const l = len3(dx, dy, dzz);
      dx /= l; dy /= l; dzz /= l;
      const blen = s.len * rand(0.16, 0.4) * (1 - f * 0.45);
      s.brLen[b] = blen;
      s.brOff[b * 3] = dx * blen; s.brOff[b * 3 + 1] = dy * blen; s.brOff[b * 3 + 2] = dzz * blen;
      // branch frame
      _t.set(dx, dy, dzz);
      _c.copy(s.s2);
      const b1 = _c.cross(_t).normalize(); // perpendicular in screen plane
      s.brS1[b * 3] = b1.x; s.brS1[b * 3 + 1] = b1.y; s.brS1[b * 3 + 2] = b1.z;
      s.brS2[b * 3] = s.s2.x; s.brS2[b * 3 + 1] = s.s2.y; s.brS2[b * 3 + 2] = s.s2.z;
      // fork (from the branch, bending further away)
      s.fkAt[b] = Math.random() < 0.8 ? Math.round(rand(0.3, 0.6) * (BR_PTS - 1)) : -1;
      const fa = ang + rand(0.3, 0.7) * sign;
      const fc = Math.cos(fa), fs = Math.sin(fa);
      const flen = blen * rand(0.3, 0.55);
      s.fkOff[b * 3] = (s.dir.x * fc + s.s1.x * fs) * flen;
      s.fkOff[b * 3 + 1] = (s.dir.y * fc + s.s1.y * fs) * flen;
      s.fkOff[b * 3 + 2] = (s.dir.z * fc + s.s1.z * fs) * flen;
    }
  }

  private branchPaths(s: Slot) {
    const t = s.trunk;
    for (let b = 0; b < s.nBr; b++) {
      const base = b * BR_PTS, n = BR_PTS - 1;
      const p = s.br, k = s.brAt[b] * 3, e = (base + n) * 3;
      p[base * 3] = t[k]; p[base * 3 + 1] = t[k + 1]; p[base * 3 + 2] = t[k + 2];
      p[e] = t[k] + s.brOff[b * 3]; p[e + 1] = t[k + 1] + s.brOff[b * 3 + 1]; p[e + 2] = t[k + 2] + s.brOff[b * 3 + 2];
      this.subdivide(p, base, n, n >> 1, s.brLen[b], 0.36, s.brS1[b * 3], s.brS1[b * 3 + 1], s.brS1[b * 3 + 2], s.brS2[b * 3], s.brS2[b * 3 + 1], s.brS2[b * 3 + 2], 0.5);
      const fa = s.fkAt[b];
      if (fa >= 0) {
        const fb = b * FK_PTS, fn = FK_PTS - 1, q = s.fk;
        const kk = (base + fa) * 3, fe = (fb + fn) * 3;
        q[fb * 3] = p[kk]; q[fb * 3 + 1] = p[kk + 1]; q[fb * 3 + 2] = p[kk + 2];
        q[fe] = p[kk] + s.fkOff[b * 3]; q[fe + 1] = p[kk + 1] + s.fkOff[b * 3 + 1]; q[fe + 2] = p[kk + 2] + s.fkOff[b * 3 + 2];
        this.subdivide(q, fb, fn, fn >> 1, s.brLen[b] * 0.45, 0.4, s.brS1[b * 3], s.brS1[b * 3 + 1], s.brS1[b * 3 + 2], s.brS2[b * 3], s.brS2[b * 3 + 1], s.brS2[b * 3 + 2], 0.5);
      }
    }
  }

  private buildFull(s: Slot) {
    this.trunkPath(s, s.n >> 1);
    this.branchSetup(s);
    this.branchPaths(s);
  }

  /** Flicker: keep the coarse channel (usually), re-randomise the fine detail. */
  private rejitter(s: Slot) {
    const full = Math.random() < 0.2;
    if (full) {
      this.trunkPath(s, s.n >> 1);
      if (Math.random() < 0.5) this.branchSetup(s);
    } else this.trunkPath(s, Math.max(1, s.n >> 3));
    this.branchPaths(s);
  }

  // ------------------------------------------------------------------ geometry

  private strip(s: Slot, p: Float32Array, base: number, n: number, u0: number, u1: number, w0: number, w1: number, i0: number, i1: number, jit: number) {
    const pos = s.pos, dirs = s.dirs, data = s.data, idx = s.idx;
    const v0 = s.vCount;
    for (let j = 0; j <= n; j++) {
      const f = j / n;
      const c = (base + j) * 3;
      const pa = (base + (j > 0 ? j - 1 : j)) * 3, pb = (base + (j < n ? j + 1 : j)) * 3;
      let dx = p[pb] - p[pa], dy = p[pb + 1] - p[pa + 1], dz = p[pb + 2] - p[pa + 2];
      const l = len3(dx, dy, dz) || 1;
      dx /= l; dy /= l; dz /= l;
      const w = (w0 + (w1 - w0) * f) * (1 + (Math.random() - 0.5) * jit);
      const inten = i0 + (i1 - i0) * f;
      const u = u0 + (u1 - u0) * f;
      for (let side = -1; side <= 1; side += 2) {
        const v = s.vCount++;
        pos[v * 3] = p[c]; pos[v * 3 + 1] = p[c + 1]; pos[v * 3 + 2] = p[c + 2];
        dirs[v * 3] = dx; dirs[v * 3 + 1] = dy; dirs[v * 3 + 2] = dz;
        data[v * 4] = side; data[v * 4 + 1] = u; data[v * 4 + 2] = w; data[v * 4 + 3] = inten;
      }
    }
    for (let j = 0; j < n; j++) {
      const a = v0 + j * 2;
      idx[s.iCount++] = a; idx[s.iCount++] = a + 1; idx[s.iCount++] = a + 2;
      idx[s.iCount++] = a + 1; idx[s.iCount++] = a + 3; idx[s.iCount++] = a + 2;
    }
  }

  private write(s: Slot) {
    s.vCount = 0;
    s.iCount = 0;
    const n = s.n;
    // trunk: thinner at the origin, full at impact
    this.strip(s, s.trunk, 0, n, 0, 1, 0.6, 1.0, 1, 1, s.arc ? 0.5 : 0.35);
    if (!s.arc) this.strip(s, s.ghost, 0, n, 0, 1, 0.35, 0.6, 0.3, 0.42, 0.6);
    for (let b = 0; b < s.nBr; b++) {
      const at = s.brAt[b] / n;
      const span = s.brLen[b] / s.len;
      this.strip(s, s.br, b * BR_PTS, BR_PTS - 1, at, at + span, 0.62, 0.05, 0.85, 0.3, 0.5);
      const fa = s.fkAt[b];
      if (fa >= 0) {
        const fat = at + span * (fa / (BR_PTS - 1));
        this.strip(s, s.fk, b * FK_PTS, FK_PTS - 1, fat, fat + span * 0.45, 0.36, 0.03, 0.6, 0.2, 0.5);
      }
    }
    s.geo.setDrawRange(0, s.iCount);
    touch(s.aPos, s.vCount);
    touch(s.aDir, s.vCount);
    touch(s.aData, s.vCount);
    touch(s.aIdx, s.iCount);
  }

  // ------------------------------------------------------------------ update

  update(dt: number) {
    // exposure governor: overlapping main bolts share a light budget (keeps multi-strikes legible)
    let mains = 0;
    for (let k = 0; k < this.slots.length; k++) if (this.slots[k].active && !this.slots[k].arc) mains++;
    const coreGov = mains > 1 ? 1 / Math.pow(mains, 0.3) : 1;
    const haloGov = mains > 1 ? 1 / Math.sqrt(mains) : 1;
    for (let k = 0; k < this.slots.length; k++) {
      const s = this.slots[k];
      if (!s.active) continue;
      s.age += dt;
      if (s.age >= s.life) {
        s.active = false;
        s.halo.visible = s.core.visible = false;
        this.onEnd(s.flare);
        s.flare = -1;
        continue;
      }
      if (s.age >= s.jitterAt) {
        s.jitterAt = s.age + rand(38, 62);
        this.rejitter(s);
        // flicker / re-strike pulses
        const r = Math.random();
        s.flick = r < 0.18 ? rand(1.08, 1.22) : r < 0.4 ? rand(0.55, 0.75) : rand(0.85, 1.05);
        s.seed = Math.random() * 100;
        this.write(s);
      }
      const reveal = s.age / s.reveal;
      if (s.impact && !s.impactDone && reveal >= 1) {
        s.impactDone = true;
        this.onImpact(s.to, s.color, s.width);
      }
      const t = s.age / s.life;
      const env = 1 - smooth((t - 0.45) / 0.55);
      // return stroke: big brightness right after the leader connects
      const after = s.age - s.reveal;
      const stroke = after > 0 && after < 90 ? 1 + 0.3 * (1 - after / 90) : 1;
      const inten = env * s.flick * stroke;
      const wm = 0.45 + 0.55 * env;
      const uc = s.uCore, uh = s.uHalo;
      uc.uIntensity.value = inten * (s.arc ? 1 : coreGov);
      uh.uIntensity.value = inten * (s.arc ? 0.8 : haloGov);
      uc.uReveal.value = uh.uReveal.value = reveal;
      uc.uSeed.value = uh.uSeed.value = s.seed;
      uc.uWidth.value = s.width * wm;
      uh.uWidth.value = s.width * wm * (s.arc ? 4 : 6.5) / Math.sqrt(s.kw);
      this.onTick(s.flare, inten);
    }
  }
}
