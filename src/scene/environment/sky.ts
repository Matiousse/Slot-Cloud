// Storm sky: a big dome with a churning cloud-ceiling shader (perspective
// projected so the billows converge toward the skyline), cloud-internal
// lightning that lights the clouds from inside, a light-pollution band above the
// city, god-mode cloud break, and a pool of distant visible lightning bolts.

import * as THREE from 'three';
import type { EnvUniforms } from './palette';
import { GLSL_NOISE, GLSL_VIEW } from './noise';

const SKY_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const SKY_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime, uFlash, uCellI, uCell2I, uShaftAmt, uCalmAmt, uCloudT;
uniform vec2 uCell, uCell2;
uniform vec4 uCalm;
uniform vec3 uSkyTop, uSkyMid, uHorizon, uCloudDark, uCloudLit, uLightning, uShaft, uFog, uCityGlow;
varying vec3 vWorld;
${GLSL_NOISE}
${GLSL_VIEW}

float cellGlow(vec2 ab, vec2 c, float k) {
  vec2 d = (ab - c) * vec2(1.0, 1.35);
  return exp(-dot(d, d) * k);
}

void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  float dz = max(-dir.z, 0.08);
  vec2 ab = dir.xy / dz;
  float b = ab.y;

  // ---- base gradient: light pollution band -> storm indigo -> night
  vec3 col = mix(uHorizon, uSkyMid, smoothstep(-0.02, 0.12, b));
  col = mix(col, uSkyTop, smoothstep(0.1, 0.4, b));

  // ---- cloud ceiling (perspective: distance ~ 1/elevation)
  float inv = 1.0 / (max(b, 0.0) + 0.07);
  vec2 q = vec2(ab.x * inv * 0.85, inv) * 0.11;
  float t = uCloudT;
  q += vec2(t * 0.0035, t * 0.0055);
  vec2 w = vec2(tfbm(q * 0.55 + vec2(0.0, t * 0.0021)), tfbm(q * 0.55 + vec2(0.37, 0.61) - t * 0.0016)) - 0.5;
  vec2 p = q + w * 0.28;
  float d = tfbm(p) * 0.7 + tridge(p * 1.9 + w * 0.2) * 0.42 - 0.12;
  // second, faster scud layer close to the horizon
  float scud = tfbm(vec2(ab.x * 1.3 + t * 0.006, b * 6.0 - t * 0.002));
  d = mix(d, max(d, scud * 1.05), 1.0 - smoothstep(0.02, 0.12, b));
  // relief: compare with a sample slightly "above" -> billow undersides
  float d2 = tfbm(p + vec2(0.0, 0.035)) * 0.7 + tridge((p + vec2(0.0, 0.035)) * 1.9 + w * 0.2) * 0.42 - 0.12;
  float relief = clamp((d - d2) * 7.0, -1.0, 1.0);

  float horizonFade = smoothstep(-0.01, 0.035, b);
  float cov = smoothstep(0.26, 0.62, d) * horizonFade;
  float thick = smoothstep(0.42, 0.9, d);
  vec3 cloud = mix(uCloudLit * 1.15, uCloudDark, thick);
  // undersides lit by the neon city, stronger close to the skyline
  float low = 1.0 - smoothstep(0.0, 0.16, b);
  cloud += uHorizon * (0.2 + 0.8 * low) * (0.25 + 0.95 * max(relief, 0.0)) * (1.0 - thick * 0.75);
  // silver lining on billow edges facing the city glow
  cloud += uCloudLit * 0.55 * smoothstep(0.1, 0.8, relief) * (1.0 - thick);
  cloud *= 0.7 + 0.45 * max(-relief, 0.0) * (1.0 - low);
  col = mix(col, cloud, cov * 0.94);

  // ---- distant rain curtains hanging under the cloud base (slanted, falling)
  float curtainMask = smoothstep(0.35, 0.75, tfbm(vec2(ab.x * 0.9 + t * 0.003, 0.37))) * (1.0 - smoothstep(0.02, 0.2, b)) * horizonFade;
  float streak = tnoise(vec2(ab.x * 26.0 + b * 7.0, b * 1.5 + t * 0.09));
  col = mix(col, col * 0.72 + uCloudLit * 0.12 * streak, curtainMask * (0.35 + 0.65 * streak));

  // ---- cloud-internal lightning: lights the billows from inside
  float g = cellGlow(ab, uCell, 30.0) * uCellI + cellGlow(ab, uCell2, 34.0) * uCell2I;
  float body = 0.1 + 1.7 * smoothstep(0.3, 0.9, d) + 0.5 * max(relief, 0.0);
  col += uLightning * g * body * 0.3 * horizonFade;
  col += uLightning * g * g * 0.06 * horizonFade * smoothstep(0.45, 0.85, d);

  // ---- global flash: whole ceiling lights up, structure visible
  col += uLightning * uFlash * (0.03 + 0.2 * cov * (0.25 + d) + 0.05 * low);

  // ---- god mode: cloud break with radiant rays
  if (uShaftAmt > 0.003) {
    vec2 gc = ab - vec2(0.02, 0.33);
    float r = length(gc * vec2(0.8, 1.2));
    float ang = atan(gc.x, -gc.y);
    float rays = tnoise(vec2(ang * 1.7, t * 0.004)) * tnoise(vec2(ang * 4.3 + 0.5, -t * 0.003));
    float gap = exp(-r * r * 9.0);
    col += uShaft * uShaftAmt * (gap * (0.35 + 0.65 * (1.0 - cov)) * 0.55 + rays * exp(-r * 2.6) * 0.32 * horizonFade);
  }

  // ---- haze band right on the skyline + below
  col = mix(col, uHorizon * 1.1 + uCityGlow * 0.25, exp(-abs(b) * 28.0) * 0.55);
  col = mix(col, mix(uCityGlow * 0.55, uFog * 0.5, smoothstep(-0.02, -0.3, b)), smoothstep(0.0, -0.06, b));

  // ---- calm, darker zone behind the cabinet / character
  col *= 1.0 - 0.62 * calmMask(ab);
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
}`;

export function createSkyDome(u: EnvUniforms): THREE.Mesh {
  const geo = new THREE.SphereGeometry(255, 48, 24);
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  mat.name = 'env-sky';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'skyDome';
  // drawn last among opaques: early-z skips everything the board/cabinet/character covers
  mesh.renderOrder = 1000;
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------- distant bolts

const BOLT_VERT = /* glsl */ `
attribute float aSide;
attribute float aHeat;
varying float vSide;
varying float vHeat;
void main() {
  vSide = aSide;
  vHeat = aHeat;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const BOLT_FRAG = /* glsl */ `
uniform vec3 uLightning;
uniform float uLife;
varying float vSide;
varying float vHeat;
void main() {
  float core = exp(-vSide * vSide * 5.0);
  float hot = pow(core, 8.0);
  float k = uLife * vHeat;
  vec3 c = uLightning * core * 2.2 * k + vec3(1.0) * hot * 5.0 * k;
  gl_FragColor = vec4(c, 1.0);
}`;

const MAIN_PTS = 34;
const BR_PTS = 13;
const BRANCHES = 5;
const TOTAL_PTS = MAIN_PTS + BRANCHES * BR_PTS;

interface BoltSlot {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  pos: THREE.BufferAttribute;
  heat: THREE.BufferAttribute;
  age: number;
  dur: number;
  pulses: number;
  seed: number;
}

export class SkyBolts {
  readonly group = new THREE.Group();
  private slots: BoltSlot[] = [];
  private px = new Float32Array(TOTAL_PTS);
  private py = new Float32Array(TOTAL_PTS);
  private pw = new Float32Array(TOTAL_PTS);

  constructor(u: EnvUniforms, count = 3) {
    this.group.name = 'skyBolts';
    // shared index buffer (strip of quads per chain)
    const idx: number[] = [];
    const chain = (start: number, n: number) => {
      for (let i = 0; i < n - 1; i++) {
        const a = (start + i) * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, b, c, b, d, c);
      }
    };
    chain(0, MAIN_PTS);
    for (let k = 0; k < BRANCHES; k++) chain(MAIN_PTS + k * BR_PTS, BR_PTS);
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BufferGeometry();
      const pos = new THREE.BufferAttribute(new Float32Array(TOTAL_PTS * 2 * 3), 3);
      pos.setUsage(THREE.DynamicDrawUsage);
      const side = new Float32Array(TOTAL_PTS * 2);
      for (let v = 0; v < TOTAL_PTS; v++) (side[v * 2] = -1), (side[v * 2 + 1] = 1);
      const heat = new THREE.BufferAttribute(new Float32Array(TOTAL_PTS * 2), 1);
      heat.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', pos);
      geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
      geo.setAttribute('aHeat', heat);
      geo.setIndex(idx);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uLightning: u.uLightning, uLife: { value: 0 } },
        vertexShader: BOLT_VERT,
        fragmentShader: BOLT_FRAG,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      mat.name = 'env-skyBolt';
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = 1001;
      this.group.add(mesh);
      this.slots.push({ mesh, mat, pos, heat, age: 0, dur: 0, pulses: 0, seed: 0 });
    }
  }

  /**
   * Spawn a bolt from (x, yTop) down to yBottom in the plane z.
   * `scale` widens/lengthens for nearer bolts.
   */
  spawn(x: number, yTop: number, yBottom: number, z: number, scale = 1, rnd: () => number = Math.random) {
    let slot = this.slots[0];
    let best = -1;
    for (const s of this.slots) {
      const k = s.mesh.visible ? s.age / s.dur : 2;
      if (k > best) (best = k), (slot = s);
    }
    const { px, py, pw } = this;
    const len = yTop - yBottom;
    const seg = len / (MAIN_PTS - 1);
    const targetX = x + (rnd() - 0.5) * len * 0.5;
    let cx = x;
    for (let i = 0; i < MAIN_PTS; i++) {
      const tt = i / (MAIN_PTS - 1);
      if (i > 0) cx += (rnd() - 0.5) * seg * 1.5 + (targetX - cx) * 0.06;
      px[i] = cx;
      py[i] = yTop - i * seg + (i > 0 && i < MAIN_PTS - 1 ? (rnd() - 0.5) * seg * 0.5 : 0);
      pw[i] = 1 - tt * 0.55;
    }
    for (let k = 0; k < BRANCHES; k++) {
      const base = MAIN_PTS + k * BR_PTS;
      const from = 3 + Math.floor(rnd() * (MAIN_PTS * 0.6));
      const dirS = rnd() < 0.5 ? -1 : 1;
      let bx = px[from], by = py[from];
      const bl = seg * (0.6 + rnd() * 0.5);
      const w0 = pw[from] * (0.45 + rnd() * 0.2);
      for (let i = 0; i < BR_PTS; i++) {
        if (i > 0) {
          bx += dirS * bl * (0.45 + rnd() * 0.8) + (rnd() - 0.5) * bl * 0.6;
          by -= bl * (0.5 + rnd() * 0.6);
        }
        px[base + i] = bx;
        py[base + i] = by;
        pw[base + i] = w0 * (1 - i / BR_PTS);
      }
    }
    const pos = slot.pos.array as Float32Array;
    const heat = slot.heat.array as Float32Array;
    const halfW = 0.55 * scale;
    const writeChain = (start: number, n: number, heatMul: number) => {
      for (let i = 0; i < n; i++) {
        const j = start + i;
        const jp = start + Math.max(0, i - 1), jn = start + Math.min(n - 1, i + 1);
        let tx = px[jn] - px[jp], ty = py[jn] - py[jp];
        const l = Math.hypot(tx, ty) || 1;
        tx /= l;
        ty /= l;
        const w = halfW * (0.35 + pw[j]);
        const o = j * 6;
        pos[o] = px[j] - ty * w;
        pos[o + 1] = py[j] + tx * w;
        pos[o + 2] = z;
        pos[o + 3] = px[j] + ty * w;
        pos[o + 4] = py[j] - tx * w;
        pos[o + 5] = z;
        const h = heatMul * (0.35 + 0.65 * pw[j]);
        heat[j * 2] = heat[j * 2 + 1] = h;
      }
    };
    writeChain(0, MAIN_PTS, 1);
    for (let k = 0; k < BRANCHES; k++) writeChain(MAIN_PTS + k * BR_PTS, BR_PTS, 0.55);
    slot.pos.needsUpdate = true;
    slot.heat.needsUpdate = true;
    slot.age = 0;
    slot.dur = 380 + rnd() * 260;
    slot.pulses = 2 + Math.floor(rnd() * 3);
    slot.seed = rnd() * 100;
    slot.mesh.visible = true;
  }

  update(dt: number) {
    for (const s of this.slots) {
      if (!s.mesh.visible) continue;
      s.age += dt;
      const t = s.age / s.dur;
      if (t >= 1) {
        s.mesh.visible = false;
        s.mat.uniforms.uLife.value = 0;
        continue;
      }
      // strobing return strokes then fade
      const strobe = 0.55 + 0.45 * Math.cos(t * s.pulses * Math.PI * 2 + s.seed);
      const env = t < 0.06 ? t / 0.06 : Math.pow(1 - (t - 0.06) / 0.94, 1.6);
      s.mat.uniforms.uLife.value = env * strobe;
    }
  }
}
