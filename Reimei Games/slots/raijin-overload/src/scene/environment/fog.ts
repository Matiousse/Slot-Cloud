// Layered volumetric-looking fog: noise-textured transparent cards between
// the city layers (slow drift, street-glow tint from below, lightning lit),
// plus low mist banks rolling over the rooftop.

import * as THREE from 'three';
import type { EnvUniforms } from './palette';
import { GLSL_NOISE, GLSL_VIEW } from './noise';

const CARD_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const CARD_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime, uFlash, uOpacity, uScale, uSpeed, uSeed, uTop, uSoft, uBottomFade, uCellI;
uniform vec2 uCell;
uniform vec4 uCalm;
uniform float uCalmAmt;
uniform vec3 uFog, uCityGlow, uLightning, uHorizon, uTint;
varying vec3 vWorld;
varying vec2 vUv;
${GLSL_NOISE}
${GLSL_VIEW}
void main() {
  vec2 p = vWorld.xy * uScale;
  float t = uTime * uSpeed;
  float n = tfbm(p * vec2(0.6, 1.0) + vec2(t + uSeed, uSeed * 0.37)) * 0.65
          + tfbm(p * vec2(1.4, 2.1) + vec2(-t * 1.6 + uSeed * 0.5, t * 0.2)) * 0.35;
  float dens = smoothstep(0.32, 0.78, n);
  float y = vWorld.y;
  float vert = 1.0 - smoothstep(uTop - uSoft, uTop, y);
  vert *= smoothstep(uBottomFade - 6.0, uBottomFade, y) * 0.6 + 0.4;
  float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
  float a = dens * vert * edge * uOpacity;
  float low = 1.0 - smoothstep(-40.0, uTop, y);
  vec3 col = mix(uFog * 1.9 + uHorizon * 0.25, uCityGlow * 1.25, low) + uTint;
  col += uLightning * (uFlash * 0.3 + uCellI * 0.04) * (0.4 + dens);
  col *= 1.0 - 0.6 * calmMask(angular(vWorld));
  gl_FragColor = vec4(col, a);
}`;

export interface FogCardSpec {
  z: number;
  /** Fog top (world y) and softness. */
  top: number;
  soft: number;
  opacity: number;
  scale: number;
  speed: number;
  width: number;
  bottom?: number;
  tint?: number;
}

export class FogLayers {
  readonly group = new THREE.Group();

  constructor(u: EnvUniforms, specs: FogCardSpec[]) {
    this.group.name = 'fogCards';
    specs.forEach((s, i) => {
      const height = s.top + 90;
      const geo = new THREE.PlaneGeometry(s.width, height);
      geo.translate(0, s.top - height / 2 + s.soft * 0.5, 0);
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uNoise: u.uNoise,
          uTime: u.uTime,
          uFlash: u.uFlash,
          uCell: u.uCell,
          uCellI: u.uCellI,
          uFog: u.uFog,
          uCityGlow: u.uCityGlow,
          uLightning: u.uLightning,
          uHorizon: u.uHorizon,
          uCalm: u.uCalm,
          uCalmAmt: u.uCalmAmt,
          uOpacity: { value: s.opacity },
          uScale: { value: s.scale },
          uSpeed: { value: s.speed },
          uSeed: { value: i * 0.173 + 0.31 },
          uTop: { value: s.top },
          uSoft: { value: s.soft },
          uBottomFade: { value: s.bottom ?? -200 },
          uTint: { value: new THREE.Color(s.tint ?? 0) },
        },
        vertexShader: CARD_VERT,
        fragmentShader: CARD_FRAG,
        transparent: true,
        depthWrite: false,
        fog: false,
      });
      mat.name = 'env-fogCard';
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.z = s.z;
      mesh.renderOrder = -5 + i * 0.01;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    });
  }
}
