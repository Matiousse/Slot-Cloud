// Neo-Edo skyline: instanced towers (4 silhouettes, one draw call each) with a
// procedural facade shader (window grids / office bands / LED strips, crown
// lights, street-glow uplight, lightning response, depth fog), rooftop
// antennas, blinking aviation beacons and the glittering abyss of streets.

import * as THREE from 'three';
import type { EnvUniforms } from './palette';
import { GLSL_FOG, GLSL_NOISE, GLSL_VIEW } from './noise';
import { flat, merge, rng } from './util';

const COMMON_UNIFORMS = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime, uFlash, uFogDensity, uCalmAmt;
uniform vec4 uCalm;
uniform vec3 uFog, uCityGlow, uLightning, uWinWarm, uWinCool, uAccent, uSkyMid, uHorizon;
`;

const BUILDING_VERT = /* glsl */ `
attribute vec4 aInfo;   // seed, window density, cool ratio, style
attribute vec4 aInfo2;  // edge LEDs, crown band, accent index, window pitch
varying vec3 vWorld;
varying vec3 vN;
varying vec2 vFac;
varying vec4 vInfo;
varying vec4 vInfo2;
varying vec3 vLocal;
varying float vH;
void main() {
  mat4 im = instanceMatrix;
  vec3 s = vec3(length(im[0].xyz), length(im[1].xyz), length(im[2].xyz));
  vec4 w = modelMatrix * im * vec4(position, 1.0);
  vWorld = w.xyz;
  vN = normal;
  vec2 tng = vec2(-normal.z, normal.x);
  vFac = vec2(dot(position.xz * s.xz, tng), position.y * s.y);
  vInfo = aInfo;
  vInfo2 = aInfo2;
  vLocal = position;
  vH = s.y;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const BUILDING_FRAG = /* glsl */ `
${COMMON_UNIFORMS}
varying vec3 vWorld;
varying vec3 vN;
varying vec2 vFac;
varying vec4 vInfo;
varying vec4 vInfo2;
varying vec3 vLocal;
varying float vH;
${GLSL_NOISE}
${GLSL_VIEW}
${GLSL_FOG}

float band(float x, float a, float b, float w) {
  return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x));
}

vec3 accentColor(float i) {
  if (i < 0.5) return vec3(1.0, 0.18, 0.63);       // magenta
  if (i < 1.5) return vec3(0.22, 0.91, 1.0);       // cyan
  if (i < 2.5) return vec3(1.0, 0.79, 0.24);       // gold
  return uAccent;
}

void main() {
  vec3 n = normalize(vN);
  float seed = vInfo.x;
  float wall = 1.0 - step(0.6, abs(n.y));
  float face = dot(n, vec3(1.0, 7.0, 3.0));
  float pitch = vInfo2.w;
  // bays (rooms) x floors; 3 panes per bay
  vec2 g = vFac / vec2(1.55 * pitch, 1.12 * pitch);
  vec2 id = floor(g);
  vec2 f = fract(g);
  vec2 aa = fwidth(g) * 1.2 + 1e-4;
  float r = hash12(id + vec2(seed * 91.7 + face * 13.1, seed * 17.3));
  float rowR = hash11(id.y * 3.17 + seed * 41.0 + face);

  float style = vInfo.w;
  float glazing;
  if (style < 0.5) glazing = band(f.x, 0.12, 0.88, aa.x) * band(f.y, 0.24, 0.88, aa.y);   // punched windows
  else if (style < 1.5) glazing = band(f.y, 0.3, 0.93, aa.y);                             // curtain-wall ribbons
  else if (style < 2.5) glazing = band(f.x, 0.32, 0.68, aa.x) * band(f.y, 0.04, 0.96, aa.y); // vertical fins
  else glazing = 0.0;                                                                     // blind (service / masts)
  glazing *= wall;
  float mull = band(fract(f.x * 3.0), 0.07, 0.93, aa.x * 3.0);

  float density = vInfo.y;
  float lit = step(1.0 - density, r);
  float rowMode = hash11(id.y * 1.93 + seed * 7.0);
  lit = rowMode > 0.9 ? step(0.3, rowR) : (rowMode < 0.15 ? 0.0 : lit);
  // a few flickering / cycling rooms
  float fl = step(0.985, r);
  lit = max(lit * (1.0 - fl), fl * step(0.4, fract(sin(floor(uTime * (1.5 + r * 6.0)) + r * 50.0) * 437.0)));
  vec3 wc = mix(uWinWarm, uWinCool, step(hash12(id + seed + 3.7), vInfo.z));
  wc = mix(wc, accentColor(floor(hash12(id.yx + seed) * 3.99)), step(0.97, hash12(id * 1.7 + seed)));
  float bright = 0.14 + 0.62 * r * r * r + step(0.992, r) * 1.2;
  // interior: ceiling light falloff + occasional blinds
  float interior = mix(0.45, 1.0, smoothstep(0.25, 0.9, f.y));
  interior *= mix(1.0, 0.55 + 0.45 * step(0.45, fract(f.y * 9.0)), step(0.72, hash12(id + 5.1)));

  vec2 ab = angular(vWorld);
  float calm = calmMask(ab);
  // ---- facade base: dark concrete/steel + sky sheen + street uplight
  vec3 base = vec3(0.011, 0.012, 0.019);
  base += uSkyMid * 0.25 * max(n.y, 0.0) + uSkyMid * 0.05 * wall;
  float up = 1.0 - smoothstep(-44.0, 2.0, vWorld.y);
  base += uCityGlow * 0.14 * up * wall;
  base += uLightning * uFlash * (0.03 + 0.06 * max(n.y, 0.0)) * (0.6 + 0.4 * wall);
  // ---- glass: dark sky reflection when unlit, warm/cool room when lit
  vec3 sheen = uSkyMid * 0.22 + uHorizon * 0.12 * (1.0 - f.y) + uLightning * uFlash * 0.12;
  vec3 room = wc * bright * interior * (1.0 - 0.8 * calm);
  vec3 glass = mix(sheen, room, lit);
  vec3 col = mix(base, mix(base * 1.3, glass, mull), glazing);
  // far LOD: sub-pixel rooms -> average glow
  float lod = smoothstep(0.3, 0.8, max(aa.x, aa.y));
  vec3 avg = base + wc * density * 0.16 * step(0.5, 3.0 - style) * wall * (1.0 - 0.8 * calm);
  col = mix(col, avg, lod);

  // ---- vertical LED edges + crown band (accent buildings)
  float topDist = (1.0 - vLocal.y) * vH;
  vec3 acc = accentColor(vInfo2.z);
  float edge = min(smoothstep(0.47, 0.5, abs(vLocal.x)), smoothstep(0.47, 0.5, abs(vLocal.z))) * wall;
  float edgeAnim = 0.6 + 0.4 * sin(vWorld.y * 0.35 - uTime * 2.2 + seed * 20.0);
  col += acc * edge * vInfo2.x * 1.3 * edgeAnim * (1.0 - 0.7 * calm);
  float crown = band(topDist, 0.3, 0.62, 0.04) * wall;
  col += acc * crown * vInfo2.y * 1.6 * (1.0 - 0.6 * calm);

  col = envFog(col, vWorld, 0.0);
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------- geometry variants

function boxUnit(w = 1, h = 1, d = 1, y = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, y + h / 2, 0);
  return flat(g);
}

function variants(): THREE.BufferGeometry[] {
  // 0: plain slab tower
  const a = boxUnit();
  // 1: setback tower
  const b = merge([boxUnit(1, 0.8, 1), boxUnit(0.74, 0.14, 0.74, 0.8), boxUnit(0.46, 0.06, 0.46, 0.94)]);
  // 2: octagonal tower
  const oct = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1);
  oct.rotateY(Math.PI / 8);
  oct.translate(0, 0.5, 0);
  const c = merge([flat(oct), boxUnit(0.6, 0.05, 0.6, 0.97)]);
  // 3: stepped spire base (slim)
  const d = merge([boxUnit(1, 0.7, 1), boxUnit(0.8, 0.2, 0.8, 0.7), boxUnit(0.55, 0.1, 0.55, 0.9)]);
  return [a, b, c, d];
}

export interface Tower {
  x: number;
  z: number;
  w: number;
  d: number;
  top: number;
  bottom?: number;
  variant?: number;
  style?: number;
  density?: number;
  cool?: number;
  edge?: number;
  crown?: number;
  accent?: number;
  pitch?: number;
  antenna?: number;
  beacon?: boolean;
}

export interface CityBuild {
  group: THREE.Group;
  towers: Tower[];
  update(dt: number): void;
}

// ---------------------------------------------------------------- points (beacons, street lights)

const POINT_VERT = /* glsl */ `
uniform float uViewH;
attribute vec4 aP; // phase, kind (0 beacon red, 1 white strobe, 2 street warm, 3 street cool, 4 accent), size, rate
varying vec3 vCol;
varying float vI;
varying vec3 vWorld;
${COMMON_UNIFORMS}
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 mv = viewMatrix * w;
  gl_Position = projectionMatrix * mv;
  float kind = aP.y;
  float t = uTime * aP.w + aP.x;
  float i;
  if (kind < 0.5) { vCol = vec3(1.0, 0.12, 0.08); i = 0.15 + 0.85 * pow(max(0.0, sin(t)), 6.0); }
  else if (kind < 1.5) { vCol = vec3(0.9, 0.95, 1.0); i = step(0.93, fract(t * 0.16)); }
  else if (kind < 2.5) { vCol = uWinWarm; i = 0.55 + 0.45 * sin(t * 1.7); }
  else if (kind < 3.5) { vCol = uWinCool; i = 0.55 + 0.45 * sin(t * 1.3); }
  else { vCol = uAccent; i = 0.6 + 0.4 * sin(t * 2.3); }
  vI = i;
  gl_PointSize = max(1.5, aP.z * projectionMatrix[1][1] * uViewH * 0.5 / -mv.z);
}`;

const POINT_FRAG = /* glsl */ `
${COMMON_UNIFORMS}
varying vec3 vCol;
varying float vI;
varying vec3 vWorld;
${GLSL_NOISE}
${GLSL_VIEW}
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float core = exp(-r * r * 7.0);
  float dist = length(vWorld - cameraPosition);
  float fog = exp(-dist * uFogDensity * 0.85);
  vec2 ab = angular(vWorld);
  float a = core * vI * fog * (1.0 - 0.7 * calmMask(ab));
  gl_FragColor = vec4(vCol * a * 4.0, 1.0);
}`;

export function createCity(u: EnvUniforms, viewH: { value: number }): CityBuild {
  const group = new THREE.Group();
  group.name = 'city';
  const R = rng(20991);
  const towers: Tower[] = [];

  // ---- hero landmarks (placed for the real game framing, see setLayout notes)
  const hero: Tower[] = [
    // near signage towers flanking the hero pagoda in the right strip (signs mount on their front faces)
    { x: 9.1, z: -26, w: 3.2, d: 4, top: 0.6, variant: 0, style: 0, density: 0.06, cool: 0.3, pitch: 0.5, antenna: 2.2 },
    { x: 18.95, z: -27, w: 11.5, d: 7, top: 0.9, variant: 0, style: 0, density: 0.07, cool: 0.3, pitch: 0.55, antenna: 3.5, beacon: true },
    { x: -24, z: -30, w: 12, d: 8, top: 14, variant: 1, style: 0, density: 0.05, cool: 0.6, pitch: 0.55 },
    // plinth tower under the hero pagoda (temple on a skyscraper)
    { x: 19.4, z: -48, w: 9.5, d: 9.5, top: -12.8, variant: 0, style: 1, density: 0.16, pitch: 0.6, crown: 1, accent: 2 },
    // right strip (landscape): tall landmark + megablock
    { x: 43, z: -104, w: 7, d: 7, top: 22, variant: 3, style: 0, density: 0.3, edge: 1, accent: 1, crown: 1, antenna: 9, beacon: true, pitch: 0.85 },
    { x: 31, z: -124, w: 9, d: 8, top: 9, variant: 1, style: 1, density: 0.32, crown: 1, accent: 0, pitch: 0.9 },
    // left behind the character: darker, calmer
    { x: -34, z: -110, w: 9, d: 8, top: 28, variant: 1, style: 0, density: 0.2, crown: 1, accent: 2, antenna: 6, beacon: true, pitch: 0.9 },
    // portrait: towers flanking the halo above the marquee
    { x: -13.5, z: -112, w: 6, d: 6, top: 30, variant: 3, style: 0, density: 0.28, edge: 1, accent: 1, antenna: 8, beacon: true, pitch: 0.85 },
    { x: 14.5, z: -128, w: 7, d: 7, top: 33, variant: 2, style: 1, density: 0.3, crown: 1, accent: 0, antenna: 10, beacon: true, pitch: 0.9 },
  ];
  towers.push(...hero);

  // ---- procedural fill, three depth bands (x cursor so the skyline is continuous)
  const bands = [
    { z0: -172, z1: -146, x0: -140, x1: 140, w0: 5, w1: 12, t0: -8, t1: 20, pitch: 0.95, dens: [0.1, 0.3], boost: 0.14 },
    { z0: -138, z1: -96, x0: -100, x1: 100, w0: 4, w1: 9, t0: -16, t1: 13, pitch: 0.85, dens: [0.08, 0.26], boost: 0.1 },
    { z0: -88, z1: -36, x0: -64, x1: 64, w0: 3.5, w1: 7, t0: -34, t1: -9, pitch: 0.72, dens: [0.06, 0.22], boost: 0 },
  ];
  for (const b of bands) {
    let x = b.x0;
    while (x < b.x1) {
      const w = b.w0 + R() * (b.w1 - b.w0);
      const cx = x + w / 2;
      const z = b.z0 + R() * (b.z1 - b.z0);
      // taller toward the sides, lower right behind the cabinet
      const side = Math.min(1, Math.abs(cx) / (b.x1 * 0.6));
      let top = b.t0 + Math.pow(R(), 1.4) * (b.t1 - b.t0) * (0.55 + 0.45 * side);
      const boosted = R() < b.boost;
      if (boosted) top += (b.t1 - b.t0) * 0.45;
      // keep the storm sky open: skyline stays low (landscape camera z ~ 14.7),
      // lowest in the right strip where the hero pagoda stands against the sky
      const dz = 14.7 - z;
      const a = cx / dz;
      const cap = (a > 0.17 && a < 0.45 ? 0.045 : boosted ? 0.16 : 0.1) * dz;
      top = Math.min(top, cap + R() * 2);
      const t: Tower = {
        x: cx,
        z,
        w,
        d: w * (0.7 + R() * 0.6),
        top,
        variant: Math.floor(R() * 4),
        style: R() < 0.1 ? 3 : Math.floor(R() * 3),
        density: b.dens[0] + R() * (b.dens[1] - b.dens[0]),
        cool: 0.25 + R() * 0.5,
        edge: R() < 0.08 ? 1 : 0,
        crown: R() < 0.16 ? 1 : 0,
        accent: Math.floor(R() * 4),
        pitch: b.pitch * (0.85 + R() * 0.3),
        antenna: top > 4 && R() < 0.45 ? 2 + R() * 6 : 0,
        beacon: R() < 0.5,
      };
      towers.push(t);
      x += w + R() * 2.5 - 0.6;
    }
  }

  // ---- instanced meshes per silhouette
  const geos = variants();
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: BUILDING_VERT,
    fragmentShader: BUILDING_FRAG,
    fog: false,
  });
  mat.name = 'env-buildings';
  const byVar: Tower[][] = [[], [], [], []];
  for (const t of towers) byVar[t.variant ?? 0].push(t);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const antennas: Tower[] = [];
  byVar.forEach((list, vi) => {
    if (!list.length) return;
    const geo = geos[vi];
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const info = new Float32Array(list.length * 4);
    const info2 = new Float32Array(list.length * 4);
    list.forEach((t, i) => {
      const bottom = t.bottom ?? -80;
      pos.set(t.x, bottom, t.z);
      scl.set(t.w, t.top - bottom, t.d);
      m4.compose(pos, q, scl);
      mesh.setMatrixAt(i, m4);
      info.set([R(), t.density ?? 0.35, t.cool ?? 0.4, t.style ?? 0], i * 4);
      info2.set([t.edge ?? 0, t.crown ?? 0, t.accent ?? 1, t.pitch ?? 1.2], i * 4);
      if (t.antenna) antennas.push(t);
    });
    geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
    geo.setAttribute('aInfo2', new THREE.InstancedBufferAttribute(info2, 4));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.name = `towers${vi}`;
    group.add(mesh);
  });

  // ---- antennas / masts (blind service boxes, one more instanced mesh)
  const mastGeo = boxUnit();
  const masts = new THREE.InstancedMesh(mastGeo, mat, antennas.length * 2);
  const mInfo = new Float32Array(antennas.length * 2 * 4);
  const mInfo2 = new Float32Array(antennas.length * 2 * 4);
  let mi = 0;
  const beaconPos: number[] = [];
  const beaconP: number[] = [];
  const addPoint = (x: number, y: number, z: number, kind: number, size: number, rate: number) => {
    beaconPos.push(x, y, z);
    beaconP.push(R() * 6.28, kind, size, rate);
  };
  for (const t of antennas) {
    const topY = t.top;
    const h = t.antenna ?? 4;
    const off = (R() - 0.5) * t.w * 0.3;
    pos.set(t.x + off, topY - 0.2, t.z);
    scl.set(0.18 + t.w * 0.012, h, 0.18);
    m4.compose(pos, q, scl);
    masts.setMatrixAt(mi, m4);
    mInfo.set([R(), 0, 0, 3], mi * 4);
    mInfo2.set([0, 0, 0, 1], mi * 4);
    mi++;
    // a stubby secondary mast
    pos.set(t.x - off - t.w * 0.18, topY - 0.2, t.z + 0.4);
    scl.set(0.12, h * 0.45, 0.12);
    m4.compose(pos, q, scl);
    masts.setMatrixAt(mi, m4);
    mInfo.set([R(), 0, 0, 3], mi * 4);
    mInfo2.set([0, 0, 0, 1], mi * 4);
    mi++;
    addPoint(t.x + off, topY + h - 0.1, t.z + 0.2, 0, 1.1 + h * 0.06, 1.6 + R() * 0.8);
  }
  mastGeo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(mInfo, 4));
  mastGeo.setAttribute('aInfo2', new THREE.InstancedBufferAttribute(mInfo2, 4));
  masts.frustumCulled = false;
  masts.name = 'masts';
  group.add(masts);

  // ---- beacons on roofs without antennas, roof corner lights
  for (const t of towers) {
    if (t.beacon && !t.antenna && t.top > -10) {
      addPoint(t.x - t.w * 0.42, t.top + 0.15, t.z + t.d * 0.42, 0, 0.8, 1.5 + R());
      addPoint(t.x + t.w * 0.42, t.top + 0.15, t.z + t.d * 0.42, 0, 0.8, 1.5 + R());
    }
    if (t.top > 15 && R() < 0.3) addPoint(t.x, t.top + 0.3, t.z + t.d * 0.5, 1, 1.4, 1 + R() * 0.4);
  }
  // ---- abyss: streets and cars far below, glittering through the fog
  for (let i = 0; i < 900; i++) {
    const z = -30 - Math.pow(R(), 0.8) * 140;
    const span = 50 + (-z) * 0.9;
    const x = (R() * 2 - 1) * span;
    const y = -26 - R() * 34;
    addPoint(x, y, z, R() < 0.55 ? 2 : R() < 0.75 ? 3 : 4, 0.5 + R() * 0.9, 0.3 + R() * 2.5);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.Float32BufferAttribute(beaconPos, 3));
  pGeo.setAttribute('aP', new THREE.Float32BufferAttribute(beaconP, 4));
  const pMat = new THREE.ShaderMaterial({
    uniforms: { ...u, uViewH: viewH },
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  pMat.name = 'env-cityPoints';
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  points.name = 'cityLights';
  group.add(points);

  return {
    group,
    towers,
    update() {
      /* all animation is in the shaders (uTime) */
    },
  };
}
