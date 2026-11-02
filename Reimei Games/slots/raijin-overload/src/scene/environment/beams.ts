// Light volumes: sweeping searchlight cones from behind the skyline and the
// god-mode divine shafts falling from the cloud break. All additive, HDR,
// animated on the CPU with a handful of rotations (no allocation).

import * as THREE from 'three';
import type { EnvUniforms } from './palette';
import { GLSL_NOISE } from './noise';

const BEAM_VERT = /* glsl */ `
uniform float uLen;
varying float vAlong;
varying vec3 vN;
varying vec3 vV;
varying vec3 vWorld;
void main() {
  vAlong = position.y / uLen;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 mv = viewMatrix * w;
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const BEAM_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime, uInt, uSeed, uFlash;
uniform vec3 uBeam, uLightning;
varying float vAlong;
varying vec3 vN;
varying vec3 vV;
varying vec3 vWorld;
${GLSL_NOISE}
void main() {
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float core = pow(facing, 2.2);
  float fade = pow(1.0 - vAlong, 1.4) * smoothstep(0.0, 0.06, vAlong);
  float dust = 0.65 + 0.35 * tfbm(vec2(vAlong * 2.5 - uTime * 0.03, uSeed + vWorld.x * 0.01));
  float a = core * fade * dust * uInt;
  vec3 c = uBeam * a * (1.0 + uFlash * 0.5);
  gl_FragColor = vec4(c, 1.0);
}`;

const SHAFT_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const SHAFT_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime, uShaftAmt, uSeed, uInt;
uniform vec3 uShaft;
varying vec2 vUv;
${GLSL_NOISE}
void main() {
  float x = abs(vUv.x - 0.5) * 2.0;
  float across = pow(1.0 - x, 2.4);
  float along = smoothstep(0.0, 0.25, vUv.y) * pow(vUv.y, 0.6);
  float n = tnoise(vec2(vUv.x * 2.0 + uSeed, vUv.y * 0.6 - uTime * 0.02)) * 0.6 + 0.4;
  float pulse = 0.75 + 0.25 * sin(uTime * 0.6 + uSeed * 9.0);
  float a = across * along * n * pulse * uShaftAmt * uInt;
  gl_FragColor = vec4(uShaft * a, 1.0);
}`;

interface Searchlight {
  pivot: THREE.Object3D;
  base: number;
  amp: number;
  speed: number;
  phase: number;
  tilt: number;
}

export class Beams {
  readonly group = new THREE.Group();
  private lights: Searchlight[] = [];
  private shafts: { mesh: THREE.Mesh; base: number; phase: number }[] = [];
  private t = 0;
  readonly beamIntensity = { value: 0.12 };

  constructor(u: EnvUniforms) {
    this.group.name = 'beams';
    const LEN = 170;
    const coneGeo = new THREE.CylinderGeometry(9, 0.5, LEN, 24, 1, true);
    coneGeo.translate(0, LEN / 2, 0);
    const defs = [
      { x: 58, y: -18, z: -146, base: 0.42, amp: 0.32, speed: 0.00011, phase: 0.0, tilt: -0.22 },
      { x: 30, y: -20, z: -160, base: -0.15, amp: 0.25, speed: 0.00008, phase: 2.1, tilt: -0.3 },
      { x: -52, y: -18, z: -150, base: -0.35, amp: 0.3, speed: 0.0001, phase: 4.0, tilt: -0.25 },
    ];
    defs.forEach((d, i) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uNoise: u.uNoise,
          uTime: u.uTime,
          uFlash: u.uFlash,
          uBeam: u.uBeam,
          uLightning: u.uLightning,
          uLen: { value: LEN },
          uInt: this.beamIntensity,
          uSeed: { value: i * 1.37 },
        },
        vertexShader: BEAM_VERT,
        fragmentShader: BEAM_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      mat.name = 'env-searchlight';
      const pivot = new THREE.Object3D();
      pivot.position.set(d.x, d.y, d.z);
      const cone = new THREE.Mesh(coneGeo, mat);
      cone.frustumCulled = false;
      cone.renderOrder = -8;
      pivot.add(cone);
      this.group.add(pivot);
      this.lights.push({ pivot, base: d.base, amp: d.amp, speed: d.speed, phase: d.phase, tilt: d.tilt });
    });

    // ---- divine shafts (god mode): fan of tapered quads from above the clouds
    const shaftGeo = new THREE.BufferGeometry();
    // tapered quad: narrow at top (y=0) -> wide at bottom (y=-1), uv.y 1 at top
    shaftGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.12, 0, 0, 0.12, 0, 0, -0.5, -1, 0, 0.5, -1, 0], 3));
    shaftGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2));
    shaftGeo.setIndex([0, 2, 1, 1, 2, 3]);
    const fan = [
      { x: 2, z: -95, len: 140, w: 26, rot: 0.05 },
      { x: -10, z: -100, len: 150, w: 18, rot: -0.22 },
      { x: 14, z: -100, len: 150, w: 20, rot: 0.3 },
      { x: -4, z: -70, len: 110, w: 12, rot: -0.08 },
      { x: 8, z: -75, len: 115, w: 10, rot: 0.17 },
      { x: 30, z: -110, len: 160, w: 22, rot: 0.48 },
      { x: -30, z: -110, len: 160, w: 22, rot: -0.45 },
    ];
    fan.forEach((f, i) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uNoise: u.uNoise, uTime: u.uTime, uShaftAmt: u.uShaftAmt, uShaft: u.uShaft, uSeed: { value: i * 0.71 }, uInt: { value: 0.32 } },
        vertexShader: SHAFT_VERT,
        fragmentShader: SHAFT_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      mat.name = 'env-godShaft';
      const mesh = new THREE.Mesh(shaftGeo, mat);
      mesh.position.set(f.x, 62, f.z);
      mesh.scale.set(f.w, f.len, 1);
      mesh.rotation.z = f.rot;
      mesh.frustumCulled = false;
      mesh.renderOrder = -7;
      mesh.visible = false;
      this.group.add(mesh);
      this.shafts.push({ mesh, base: f.rot, phase: i * 1.3 });
    });
  }

  update(dt: number, shaftAmt: number) {
    this.t += dt;
    for (const l of this.lights) {
      const s = Math.sin(this.t * l.speed * 6.283 + l.phase);
      l.pivot.rotation.z = l.base + s * l.amp;
      l.pivot.rotation.x = l.tilt + Math.sin(this.t * l.speed * 4.1 + l.phase * 2) * 0.08;
    }
    const vis = shaftAmt > 0.01;
    for (const s of this.shafts) {
      s.mesh.visible = vis;
      if (vis) s.mesh.rotation.z = s.base + Math.sin(this.t * 0.00025 + s.phase) * 0.03;
    }
  }
}

// ---------------------------------------------------------------- motes / embers

const MOTE_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime, uViewH, uMotes;
uniform vec3 uBoxMin, uBoxSize;
varying float vA;
void main() {
  vec3 p = uBoxMin + aSeed.xyz * uBoxSize;
  float H = uBoxSize.y;
  float rise = mod(aSeed.y * H + uTime * (0.25 + aSeed.w * 0.5), H);
  p.y = uBoxMin.y + rise;
  p.x += sin(uTime * (0.4 + aSeed.w) + aSeed.z * 20.0) * 0.6;
  p.z += cos(uTime * (0.3 + aSeed.w * 0.7) + aSeed.x * 20.0) * 0.4;
  vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float life = rise / H;
  vA = smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.75, 1.0, life)) * step(aSeed.w, uMotes);
  vA *= 0.6 + 0.4 * sin(uTime * (3.0 + aSeed.x * 5.0) + aSeed.z * 30.0);
  gl_PointSize = max(1.0, (0.05 + 0.08 * aSeed.w) * projectionMatrix[1][1] * uViewH * 0.5 / -mv.z);
}`;

const MOTE_FRAG = /* glsl */ `
uniform vec3 uAccent;
varying float vA;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = exp(-dot(d, d) * 18.0) * vA;
  gl_FragColor = vec4(uAccent * a * 3.0, 1.0);
}`;

export function createMotes(u: EnvUniforms, viewH: { value: number }, count = 260): THREE.Points {
  const g = new THREE.BufferGeometry();
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: u.uTime,
      uViewH: viewH,
      uMotes: u.uMotes,
      uAccent: u.uAccent,
      uBoxMin: { value: new THREE.Vector3(-16, -4.2, -14) },
      uBoxSize: { value: new THREE.Vector3(32, 14, 12) },
    },
    vertexShader: MOTE_VERT,
    fragmentShader: MOTE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  mat.name = 'env-motes';
  const p = new THREE.Points(g, mat);
  p.frustumCulled = false;
  p.renderOrder = 11;
  p.name = 'motes';
  return p;
}
