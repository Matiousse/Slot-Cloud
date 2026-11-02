// GPU rain: instanced streak quads animated entirely in the vertex shader
// (zero CPU per frame), wind slant + gusts, several depth layers, lightning
// response; splash crowns + rings on the wet rooftop.

import * as THREE from 'three';
import type { EnvUniforms } from './palette';

const RAIN_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime, uSpeed, uLen, uWidth, uWind, uGust;
uniform vec3 uBoxMin, uBoxSize;
varying float vAlong;
varying float vAcross;
varying float vBright;
varying float vDist;
void main() {
  float spd = uSpeed * (0.8 + 0.4 * aSeed.w);
  float H = uBoxSize.y;
  float fall = mod(aSeed.y * H + uTime * spd, H);
  float wind = uWind + uGust * sin(uTime * 0.7 + aSeed.z * 2.0) * 0.5;
  vec3 p = uBoxMin + aSeed.xyz * uBoxSize;
  p.y = uBoxMin.y + H - fall;
  p.x = uBoxMin.x + mod(p.x - uBoxMin.x + fall * wind, uBoxSize.x);
  vec2 dir = normalize(vec2(wind, -1.0));
  vec2 perp = vec2(-dir.y, dir.x);
  float len = uLen * (0.6 + 0.8 * aSeed.w);
  p.xy += perp * position.x * uWidth - dir * position.y * len;
  vAlong = position.y;
  vAcross = position.x * 2.0;
  vBright = 0.45 + 0.55 * fract(aSeed.w * 7.31);
  vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const RAIN_FRAG = /* glsl */ `
uniform float uAlpha, uFlash, uFogDensity;
uniform vec3 uColor, uLightning, uFog;
varying float vAlong;
varying float vAcross;
varying float vBright;
varying float vDist;
void main() {
  float a = pow(1.0 - vAlong, 1.6) * (1.0 - vAcross * vAcross) * uAlpha * vBright;
  float fog = exp(-vDist * uFogDensity * 0.9);
  vec3 c = uColor * (1.0 + uFlash * 2.5) + uLightning * uFlash * 0.6;
  gl_FragColor = vec4(c * a * fog, 1.0);
}`;

export interface RainLayerSpec {
  count: number;
  min: [number, number, number];
  size: [number, number, number];
  speed: number;
  len: number;
  width: number;
  alpha: number;
  color?: number;
}

function quad(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0], 3));
  g.setIndex([0, 1, 2, 1, 3, 2]);
  return g;
}

export class Rain {
  readonly group = new THREE.Group();
  readonly wind = { value: 0.16 };
  readonly gust = { value: 0.05 };
  private mats: THREE.ShaderMaterial[] = [];

  constructor(u: EnvUniforms, layers: RainLayerSpec[], seed = 7) {
    this.group.name = 'rain';
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const base = quad();
    for (const L of layers) {
      const geo = new THREE.InstancedBufferGeometry();
      geo.index = base.index;
      geo.setAttribute('position', base.attributes.position);
      const seeds = new Float32Array(L.count * 4);
      for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
      geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
      geo.instanceCount = L.count;
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: u.uTime,
          uFlash: u.uFlash,
          uFogDensity: u.uFogDensity,
          uLightning: u.uLightning,
          uFog: u.uFog,
          uSpeed: { value: L.speed },
          uLen: { value: L.len },
          uWidth: { value: L.width },
          uWind: this.wind,
          uGust: this.gust,
          uBoxMin: { value: new THREE.Vector3(...L.min) },
          uBoxSize: { value: new THREE.Vector3(...L.size) },
          uAlpha: { value: L.alpha },
          uColor: { value: new THREE.Color(L.color ?? 0x9fb8dd) },
        },
        vertexShader: RAIN_VERT,
        fragmentShader: RAIN_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      mat.name = 'env-rain';
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 10;
      this.group.add(mesh);
      this.mats.push(mat);
    }
  }

  /** Scale all layer alphas (e.g. heavier rain in free spins). */
  setIntensity(k: number) {
    for (const m of this.mats) m.uniforms.uAlpha.value = (m.userData.a0 ??= m.uniforms.uAlpha.value) * k;
  }
}

// ---------------------------------------------------------------- splashes

const SPLASH_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform vec3 uBoxMin, uBoxSize;
varying vec2 vUv;
varying float vPh;
varying float vKind;
varying float vDist;
void main() {
  float rate = 1.1 + aSeed.w * 1.2;
  float cyc = uTime * rate + aSeed.y * 13.0;
  float ph = fract(cyc);
  float id = floor(cyc);
  // new random position every cycle
  vec2 h = fract(sin(vec2(id * 12.9898 + aSeed.x * 78.233, id * 39.346 + aSeed.z * 11.135)) * 43758.5453);
  vec3 p = uBoxMin + vec3(h.x, 0.0, h.y) * uBoxSize;
  vPh = ph;
  vUv = position.xy + 0.5;
  vKind = step(0.5, fract(aSeed.w * 5.3));
  vec3 off;
  if (vKind < 0.5) {
    // ring on the floor (flat)
    float r = 0.05 + ph * 0.32;
    off = vec3(position.x * r * 2.0, 0.004, position.y * r * 2.0);
  } else {
    // crown: small upright billboard that rises & falls
    float up = sin(ph * 3.14159) * 0.09;
    off = vec3(position.x * 0.12, (position.y + 0.5) * (0.04 + up), 0.0);
  }
  vec4 mv = viewMatrix * modelMatrix * vec4(p + off, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const SPLASH_FRAG = /* glsl */ `
uniform float uFlash, uAlpha;
uniform vec3 uColor, uLightning;
varying vec2 vUv;
varying float vPh;
varying float vKind;
varying float vDist;
void main() {
  vec2 d = vUv - 0.5;
  float a;
  if (vKind < 0.5) {
    float r = length(d) * 2.0;
    a = exp(-pow((r - 0.8) * 7.0, 2.0)) * (1.0 - vPh) * (1.0 - vPh);
  } else {
    if (vPh > 0.4) discard;
    // three droplets spraying
    float dd = min(min(length(d - vec2(-0.25, 0.1)), length(d - vec2(0.0, 0.3))), length(d - vec2(0.25, 0.12)));
    a = exp(-dd * dd * 140.0) * (1.0 - vPh / 0.4);
  }
  vec3 c = uColor * (1.0 + uFlash * 2.0) + uLightning * uFlash * 0.4;
  gl_FragColor = vec4(c * a * uAlpha, 1.0);
}`;

export function createSplashes(u: EnvUniforms, floorY: number, count = 520): THREE.Mesh {
  const g = new THREE.InstancedBufferGeometry();
  const q = quad();
  q.translate(0, -0.5, 0);
  g.index = q.index;
  g.setAttribute('position', q.attributes.position);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  g.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: u.uTime,
      uFlash: u.uFlash,
      uLightning: u.uLightning,
      uBoxMin: { value: new THREE.Vector3(-30, floorY, -15.5) },
      uBoxSize: { value: new THREE.Vector3(60, 0, 24) },
      uColor: { value: new THREE.Color(0xa8c4ee) },
      uAlpha: { value: 0.55 },
    },
    vertexShader: SPLASH_VERT,
    fragmentShader: SPLASH_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  mat.name = 'env-splash';
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  mesh.name = 'splashes';
  return mesh;
}
