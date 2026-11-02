// GLSL materials for the symbols. Everything time-driven reads the kit's shared
// `uTime` (seconds) and derives a per-instance phase from the model matrix, so a
// single material is shared by every view; only `uIntensity` / `uBoost` are
// per-material (cloned for dim / win modulation).

import * as THREE from 'three';
import { CLAMP_GLSL, DAMP_GLSL, type Assets } from './assets';

export const NOISE = /* glsl */ `
vec3 sn_mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 sn_mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 sn_permute(vec4 x){ return sn_mod289(((x * 34.0) + 1.0) * x); }
vec4 sn_taylor(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = sn_mod289(i);
  vec4 p = sn_permute(sn_permute(sn_permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = sn_taylor(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

const VERT = /* glsl */ `
#include <common>
#include <clipping_planes_pars_vertex>
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
varying float vPhase;
#ifdef BLADE
attribute vec2 aBlade;
varying vec2 vB;
#endif
void main() {
  vUv = uv;
  vP = position;
#ifdef BLADE
  vB = aBlade;
#endif
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mvPosition.xyz;
  vPhase = dot(modelMatrix[3].xyz, vec3(1.731, 2.37, 0.0));
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`;

const FRAG_HEAD = /* glsl */ `
#include <common>
#include <clipping_planes_pars_fragment>
uniform float uTime;
uniform float uIntensity;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
varying float vPhase;
${NOISE}
`;

const FRAG_TAIL = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

function shader(a: Assets, key: string, frag: string, uniforms: Record<string, THREE.IUniform>, opts: Partial<THREE.ShaderMaterialParameters> = {}, defines: Record<string, string> = {}) {
  return a.once(`sh-${key}`, () => {
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: a.time, uIntensity: { value: 1 }, ...uniforms },
      vertexShader: VERT,
      fragmentShader: frag,
      defines,
      fog: false,
      ...opts,
    });
    m.clipping = true;
    return a.reg(m, ['uIntensity']);
  });
}

/** Swirling plasma column (Power Cell core). Opaque, HDR. */
export function plasmaMaterial(a: Assets) {
  return shader(
    a,
    'plasma',
    FRAG_HEAD +
      /* glsl */ `
uniform vec3 uColA;
uniform vec3 uColB;
void main() {
  #include <clipping_planes_fragment>
  vec3 n = normalize(vN);
  float facing = abs(dot(n, normalize(vV)));
  float t = uTime * 1.0 + vPhase;
  float ang = vUv.x * 6.2831853;
  vec3 q = vec3(cos(ang) * 0.9, sin(ang) * 0.9, vUv.y * 3.4 - t * 1.6);
  float n1 = snoise(q * 1.4 + vec3(0.0, 0.0, t * 0.15));
  float n2 = snoise(q * 3.1 + vec3(t * 0.4, 0.0, -t * 0.7));
  float fil = 0.05 / (abs(n1 * 0.7 + n2 * 0.3) + 0.05);
  float core = pow(facing, 2.5);
  float pulse = 0.85 + 0.15 * sin(t * 6.0 + vUv.y * 12.0);
  vec3 col = uColB * (0.3 + 0.8 * core) * pulse;
  col += uColA * fil * (0.45 + 0.7 * core);
  col += vec3(0.9, 1.0, 1.0) * pow(core, 8.0) * 1.1;
  float ends = smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
  col *= mix(0.35, 1.0, ends) * uIntensity;
  gl_FragColor = vec4(col, 1.0);
  ${FRAG_TAIL}
}`,
    { uColA: { value: new THREE.Color(0.3, 1.05, 1.3) }, uColB: { value: new THREE.Color(0.02, 0.3, 0.62) } },
  );
}

/** Plasma-globe orb with crackling lightning filaments (Thunder Wild). */
export function orbMaterial(a: Assets) {
  return shader(
    a,
    'orb',
    FRAG_HEAD +
      /* glsl */ `
float arcs(vec3 p, float t) {
  float n = snoise(p * 2.3 + vec3(0.0, 0.0, t * 0.9));
  float m = snoise(p * 4.7 - vec3(t * 0.6, t * 0.3, 0.0));
  float v = n * 0.75 + m * 0.25;
  return 0.022 / (abs(v) + 0.022);
}
void main() {
  #include <clipping_planes_fragment>
  vec3 n = normalize(vN);
  vec3 vd = normalize(vV);
  float facing = saturate(dot(n, vd));
  float t = uTime * 1.25 + vPhase;
  // pseudo-volumetric: sample the filaments at 3 depths inside the sphere
  vec3 sp = normalize(vP);
  float f = 0.0;
  for (int k = 0; k < 3; k++) {
    float d = float(k) * 0.28;
    vec3 p = sp * (1.0 - d) + vec3(0.0, 0.0, float(k) * 1.7);
    f += arcs(p, t + float(k) * 0.37) * (1.0 - float(k) * 0.25);
  }
  f *= 0.55;
  // radial "tendrils" from the centre
  float flick = 0.75 + 0.25 * sin(t * 23.0) * sin(t * 7.0 + 1.3);
  vec3 deep = vec3(0.004, 0.02, 0.09);
  vec3 cyan = vec3(0.22, 0.85, 1.25);
  vec3 col = deep + vec3(0.02, 0.12, 0.38) * pow(facing, 1.5);
  col += cyan * f * flick;
  col += vec3(1.1, 1.35, 1.5) * pow(facing, 18.0) * flick;
  float rim = pow(1.0 - facing, 3.0);
  col += vec3(0.08, 0.45, 0.8) * rim;
  col *= uIntensity;
  gl_FragColor = vec4(col, 1.0);
  ${FRAG_TAIL}
}`,
    {},
  );
}

/** Plasma katana blade: dark spine -> white-hot edge, glowing hamon, flowing shimmer. */
export function bladeMaterial(a: Assets) {
  return shader(
    a,
    'blade',
    FRAG_HEAD +
      /* glsl */ `
varying vec2 vB;
void main() {
  #include <clipping_planes_fragment>
  float u = vB.x;
  float v = vB.y;
  float t = uTime + vPhase;
  vec3 n = normalize(vN);
  float facing = saturate(abs(dot(n, normalize(vV))));
  float flow = snoise(vec3(u * 9.0 - t * 2.6, v * 2.0, t * 0.6)) * 0.5 + 0.5;
  float flow2 = snoise(vec3(u * 23.0 - t * 4.0, v * 5.0, t * 1.3)) * 0.5 + 0.5;
  // hamon: wavy temper line
  float hl = 0.48 + 0.07 * sin(u * 46.0) + 0.04 * sin(u * 17.0 + 1.7);
  float hamon = smoothstep(0.05, 0.0, abs(v - hl));
  float edge = smoothstep(0.7, 1.0, v);
  vec3 spine = vec3(0.015, 0.06, 0.1);
  vec3 body = vec3(0.04, 0.48, 0.78);
  vec3 col = mix(spine, body, smoothstep(0.0, 0.55, v)) * (0.65 + 0.7 * flow);
  col += vec3(0.35, 1.0, 1.25) * hamon * (0.7 + 0.6 * flow2);
  col += vec3(1.0, 1.35, 1.45) * edge * (0.85 + 0.3 * flow2);
  // arcs crawling along the blade
  float arc = 0.02 / (abs(snoise(vec3(u * 7.0 - t * 5.0, v * 3.0, t * 2.0))) + 0.02);
  col += vec3(0.5, 1.1, 1.3) * arc * smoothstep(0.2, 0.9, v) * 0.3;
  col *= 0.8 + 0.25 * facing;
  col *= mix(1.0, 1.25, smoothstep(0.75, 1.0, u)) * uIntensity;
  gl_FragColor = vec4(col, 1.0);
  ${FRAG_TAIL}
}`,
    {},
    {},
    { BLADE: '' },
  );
}

/** Additive aura shader: soft vertical-gradient glow plane with flowing noise. */
export function auraMaterial(a: Assets, key: string, color: THREE.Color) {
  return shader(
    a,
    `aura-${key}`,
    FRAG_HEAD +
      /* glsl */ `
uniform vec3 uColor;
void main() {
  #include <clipping_planes_fragment>
  vec2 c = vUv - 0.5;
  float r = length(c * vec2(1.0, 2.2));
  float t = uTime + vPhase;
  float n = snoise(vec3(vUv * vec2(6.0, 3.0) - vec2(t * 1.5, 0.0), t * 0.7)) * 0.5 + 0.5;
  float a = smoothstep(0.5, 0.0, r) * (0.55 + 0.6 * n);
  gl_FragColor = vec4(uColor * a * uIntensity, 1.0);
  ${FRAG_TAIL}
}`,
    { uColor: { value: color } },
    { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide },
  );
}

// ---------------------------------------------------------------- injected PBR materials

type Injected = { uniformsLocal: Record<string, THREE.IUniform> };

/** Enamel letter face: HDR vertical gradient + periodic diagonal sheen, clearcoat on top. */
export function letterFaceMaterial(a: Assets, key: string, top: THREE.Color, bottom: THREE.Color, halfH: number) {
  return a.once(`letter-${key}`, () => {
    const m = new THREE.MeshPhysicalMaterial({
      color: bottom.clone().multiplyScalar(0.08),
      metalness: 0.1,
      roughness: 0.32,
      clearcoat: 1,
      clearcoatRoughness: 0.14,
      emissive: 0xffffff,
      envMap: a.envMap,
      envMapIntensity: 0.9,
    }) as THREE.MeshPhysicalMaterial & Injected;
    m.uniformsLocal = { uBoost: { value: 1 } };
    const uTop = { value: top };
    const uBot = { value: bottom };
    const uH = { value: halfH };
    m.onBeforeCompile = function (this: THREE.MeshPhysicalMaterial & Injected, sh) {
      sh.uniforms.uTime = a.time;
      sh.uniforms.uBoost = this.uniformsLocal.uBoost;
      sh.uniforms.uTop = uTop;
      sh.uniforms.uBot = uBot;
      sh.uniforms.uH = uH;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;\nvarying float vPhase;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;\nvPhase = dot(modelMatrix[3].xyz, vec3(0.37, 0.71, 0.0));');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;\nvarying float vPhase;\nuniform float uTime, uBoost, uH;\nuniform vec3 uTop, uBot;')
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + DAMP_GLSL('0.3'))
        .replace('#include <opaque_fragment>', CLAMP_GLSL)
        .replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
          {
            float gy = clamp(vLocal.y / uH * 0.5 + 0.5, 0.0, 1.0);
            // glossy "horizon" gradient: light sky above, deep saturated below
            float hz = 0.47 + 0.03 * vLocal.x / uH;
            vec3 upper = mix(uTop * 0.55, uTop * 1.15 + vec3(0.12), smoothstep(hz, 1.0, gy));
            vec3 lower = mix(uBot * 0.35, uBot * 1.25, smoothstep(0.0, hz, gy));
            vec3 grad = mix(lower, upper, smoothstep(hz - 0.015, hz + 0.015, gy));
            grad += uTop * 0.9 * exp(-pow((gy - hz - 0.02) * 40.0, 2.0));
            float sweep = fract(uTime * 0.16 + vPhase * 0.173) * 5.0 - 2.0;
            float d = (vLocal.x * 0.55 + vLocal.y) / uH - sweep;
            float band = exp(-d * d * 22.0);
            totalEmissiveRadiance = (grad + band * vec3(1.1, 1.15, 1.2)) * uBoost;
          }`,
        );
    };
    m.customProgramCacheKey = () => 'sym-letterface';
    return a.reg(m);
  });
}

/** Faceted gem: per-facet colour (vertex colours) + flashing inner light. */
export function gemMaterial(a: Assets) {
  return a.once('gem', () => {
    const m = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      color: 0x8a8a8a,
      metalness: 0.35,
      roughness: 0.13,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      iridescence: 0.6,
      iridescenceIOR: 1.6,
      emissive: 0xffffff,
      envMap: a.envMap,
      envMapIntensity: 1.3,
      flatShading: false,
    }) as THREE.MeshPhysicalMaterial & Injected;
    m.uniformsLocal = { uBoost: { value: 1 } };
    m.onBeforeCompile = function (this: THREE.MeshPhysicalMaterial & Injected, sh) {
      sh.uniforms.uTime = a.time;
      sh.uniforms.uBoost = this.uniformsLocal.uBoost;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aFacet;\nvarying float vFacet;\nvarying float vPhase;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFacet = aFacet;\nvPhase = dot(modelMatrix[3].xyz, vec3(1.37, 2.71, 0.0));');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFacet;\nvarying float vPhase;\nuniform float uTime, uBoost;')
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + DAMP_GLSL('0.4'))
        .replace('#include <opaque_fragment>', CLAMP_GLSL)
        .replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
          {
            float facing = saturate(dot(normalize(vNormal), normalize(vViewPosition)));
            float tw = pow(0.5 + 0.5 * sin(uTime * 2.1 + vFacet * 37.0 + vPhase), 8.0);
            vec3 inner = vColor.rgb * (0.08 + 0.42 * pow(facing, 2.2));
            inner += vec3(0.9, 0.95, 1.0) * tw * (0.3 + facing) * 0.55;
            totalEmissiveRadiance = inner * uBoost;
          }`,
        );
    };
    m.customProgramCacheKey = () => 'sym-gem';
    return a.reg(m);
  });
}

/** Thin clear glass with a bright fresnel rim (Power Cell capsule). */
export function glassMaterial(a: Assets, rim: THREE.Color) {
  return a.once('glass', () => {
    const m = new THREE.MeshPhysicalMaterial({
      color: 0xbfeeff,
      metalness: 0,
      roughness: 0.12,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      envMap: a.envMap,
      envMapIntensity: 2.2,
      specularIntensity: 1,
    }) as THREE.MeshPhysicalMaterial & Injected;
    m.uniformsLocal = { uBoost: { value: 1 } };
    const uRim = { value: rim };
    m.onBeforeCompile = function (this: THREE.MeshPhysicalMaterial & Injected, sh) {
      sh.uniforms.uBoost = this.uniformsLocal.uBoost;
      sh.uniforms.uRim = uRim;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uBoost;\nuniform vec3 uRim;')
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + DAMP_GLSL('0.35'))
        .replace(
          '#include <opaque_fragment>',
          /* glsl */ `{
            float fr = pow(1.0 - saturate(abs(dot(normalize(vNormal), normalize(vViewPosition)))), 2.2);
            outgoingLight += uRim * fr * uBoost;
            diffuseColor.a = clamp(diffuseColor.a + fr * 0.55, 0.0, 1.0);
          }
          ${CLAMP_GLSL}`,
        );
    };
    m.customProgramCacheKey = () => 'sym-glass';
    return a.reg(m);
  });
}

/** Pre-multiplied HDR billboard (baked motion-blur sprite shown while spinning). */
export function spriteMaterial(a: Assets, key: string, map: THREE.Texture) {
  return shader(
    a,
    `sprite-${key}`,
    FRAG_HEAD +
      /* glsl */ `
uniform sampler2D map;
void main() {
  #include <clipping_planes_fragment>
  vec4 c = texture2D(map, vUv);
  gl_FragColor = vec4(c.rgb * uIntensity, c.a);
  ${FRAG_TAIL}
}`,
    { map: { value: map } },
    {
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    },
  );
}
