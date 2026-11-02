// Shared procedural noise for the environment: one tileable RGBA noise texture
// (sampled instead of hash noise in the big full-screen shaders, much cheaper on
// mobile GPUs) + common GLSL snippets.

import * as THREE from 'three';

let tex: THREE.DataTexture | null = null;

/**
 * 256² tileable noise, linear + mipmapped:
 *  R = smooth value noise (8 cells / tile)
 *  G = fbm, 5 octaves (base 4 cells)
 *  B = ridged fbm, 4 octaves (base 6 cells)
 *  A = smooth value noise (32 cells / tile)
 */
export function noiseTexture(): THREE.DataTexture {
  if (tex) return tex;
  const N = 256;
  let s = 90217;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const lattices = new Map<number, Float32Array>();
  const lattice = (f: number, salt: number) => {
    const key = f * 1000 + salt;
    let g = lattices.get(key);
    if (!g) {
      g = new Float32Array(f * f);
      for (let i = 0; i < g.length; i++) g[i] = rnd();
      lattices.set(key, g);
    }
    return g;
  };
  const value = (f: number, salt: number, x: number, y: number) => {
    const g = lattice(f, salt);
    const fx = (x / N) * f, fy = (y / N) * f;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
    const sy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
    const x0 = ix % f, y0 = iy % f, x1 = (ix + 1) % f, y1 = (iy + 1) % f;
    const a = g[y0 * f + x0] + (g[y0 * f + x1] - g[y0 * f + x0]) * sx;
    const b = g[y1 * f + x0] + (g[y1 * f + x1] - g[y1 * f + x0]) * sx;
    return a + (b - a) * sy;
  };
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const r = value(8, 1, x, y);
      let g = 0, amp = 0.5, tot = 0;
      for (let o = 0, f = 4; o < 5; o++, f *= 2) {
        g += value(f, 2 + o, x, y) * amp;
        tot += amp;
        amp *= 0.5;
      }
      g /= tot;
      let b = 0;
      amp = 0.5;
      tot = 0;
      for (let o = 0, f = 6; o < 4; o++, f *= 2) {
        const v = 1 - Math.abs(value(f, 10 + o, x, y) * 2 - 1);
        b += v * v * amp;
        tot += amp;
        amp *= 0.5;
      }
      b /= tot;
      const a = value(32, 20, x, y);
      const p = (y * N + x) * 4;
      data[p] = Math.round(r * 255);
      data[p + 1] = Math.round(Math.min(1, Math.max(0, (g - 0.5) * 1.6 + 0.5)) * 255);
      data[p + 2] = Math.round(b * 255);
      data[p + 3] = Math.round(a * 255);
    }
  tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** GLSL: hashes + texture fbm helpers (needs `uniform sampler2D uNoise;`). */
export const GLSL_NOISE = /* glsl */ `
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float tnoise(vec2 p) { return texture2D(uNoise, p).r; }
float tfbm(vec2 p) { return texture2D(uNoise, p).g; }
float tridge(vec2 p) { return texture2D(uNoise, p).b; }
`;

/** GLSL: angular screen coordinates (camera looks down -z) + calm-zone mask. */
export const GLSL_VIEW = /* glsl */ `
vec2 angular(vec3 w) {
  float dz = max(cameraPosition.z - w.z, 0.5);
  return (w.xy - cameraPosition.xy) / dz;
}
float calmMask(vec2 ab) {
  vec2 d = (ab - uCalm.xy) / uCalm.zw;
  return exp(-dot(d, d)) * uCalmAmt;
}
`;

/** GLSL: environment fog (exponential + height haze glowing from the streets below). */
export const GLSL_FOG = /* glsl */ `
vec3 envFog(vec3 col, vec3 w, float extra) {
  float dist = length(w - cameraPosition);
  float f = 1.0 - exp(-dist * uFogDensity * 1.45);
  float low = 1.0 - smoothstep(-34.0, 8.0, w.y);
  f = clamp(f * (0.82 + 0.3 * low) + extra, 0.0, 1.0);
  vec3 fc = mix(uFog * 2.1 + uHorizon * 0.4, uCityGlow * 1.25, low * low * 0.85);
  fc *= 1.0 - 0.55 * calmMask(angular(w));
  fc += uLightning * uFlash * 0.18;
  return mix(col, fc, f);
}
`;
