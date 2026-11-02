// Shrine rooftop in front of the city: rain-soaked stone slabs (puddles, rain
// ripples, Fresnel sky reflection and stretched neon reflection streaks of every
// light source), the parapet with railing + LED strip + warning lights, and
// stone tōrō lanterns.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MAT, canvasTexture, glow, grungeTexture, radialTexture } from '../materials';
import type { EnvUniforms } from './palette';
import { GLSL_FOG, GLSL_NOISE, GLSL_VIEW } from './noise';
import { bakeStatic } from './util';

export const FLOOR_Y = -4.2;
export const EDGE_Z = -16;
export const MAX_SRC = 10;

const FLOOR_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FLOOR_FRAG = /* glsl */ `
#define NSRC ${MAX_SRC}
uniform sampler2D uNoise;
uniform float uTime, uFlash, uFogDensity, uCalmAmt, uFloorY;
uniform vec4 uCalm;
uniform vec3 uFog, uCityGlow, uLightning, uSkyMid, uHorizon, uAccent;
uniform vec4 uSrcPos[NSRC];
uniform vec4 uSrcCol[NSRC];
varying vec3 vWorld;
${GLSL_NOISE}
${GLSL_VIEW}
${GLSL_FOG}
float band(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
void main() {
  vec3 w = vWorld;
  vec3 V = normalize(cameraPosition - w);
  // ---- stone slabs + grooves
  vec2 tc = w.xz / vec2(2.6, 1.7);
  tc.x += step(1.0, mod(floor(tc.y), 2.0)) * 0.5;
  vec2 tid = floor(tc), tf = fract(tc);
  vec2 aa = fwidth(tc) * 1.5 + 1e-4;
  float slab = band(tf.x, 0.02, 0.98, aa.x) * band(tf.y, 0.03, 0.97, aa.y);
  float tv = hash12(tid);
  // ---- puddles (low spots) - mirror-like
  float pn = tfbm(w.xz * 0.03 + vec2(0.13, 0.71)) * 0.7 + tnoise(w.xz * 0.16) * 0.3;
  float pud = smoothstep(0.44, 0.64, pn);
  float wet = mix(0.6, 1.0, pud) * mix(0.45, 1.0, slab);
  // ---- rain ripples (one cell lookup)
  vec2 rc = w.xz * vec2(1.9, 2.6);
  vec2 rid = floor(rc), rf = fract(rc) - 0.5;
  float rh = hash12(rid);
  vec2 ro = (hash22(rid) - 0.5) * 0.45;
  float ph = fract(uTime * (0.8 + rh * 0.9) + rh * 7.0);
  float rr = length((rf - ro) * vec2(1.0, 1.0));
  float ring = exp(-pow((rr - ph * 0.42) * 30.0, 2.0)) * (1.0 - ph) * (1.0 - ph) * step(rh, 0.8);
  vec2 rip = (vec2(tnoise(w.xz * 0.6 + vec2(0.0, uTime * 0.3)), tnoise(w.xz * 0.6 + vec2(4.1, -uTime * 0.27))) - 0.5) * 0.08;
  rip += (rf - ro) * ring * 0.5;
  rip *= mix(1.0, 0.45, pud);
  // ---- Fresnel + mirrored sky
  float cosT = clamp(V.y, 0.0, 1.0);
  float F = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);
  vec3 Rd = reflect(-V, normalize(vec3(rip.x, 1.0, rip.y)));
  float rb = Rd.y / max(-Rd.z, 0.12);
  vec3 skyR = mix(uHorizon * 1.3 + uCityGlow * 0.35, uSkyMid * 0.8, smoothstep(0.0, 0.22, rb));
  skyR += uLightning * uFlash * (0.4 + 0.45 * pud);
  // ---- neon reflection streaks (screen-space, stretched toward the viewer)
  vec2 abF = angular(w);
  vec3 neon = vec3(0.0);
  for (int i = 0; i < NSRC; i++) {
    vec4 sp = uSrcPos[i];
    vec4 sc = uSrcCol[i];
    if (sc.a <= 0.0) continue;
    vec3 m = vec3(sp.x, 2.0 * uFloorY - sp.y, sp.z);
    vec2 abM = angular(m);
    float dzS = max(cameraPosition.z - sp.z, 0.5);
    float wa = sp.w / dzS;
    float dy = abF.y - abM.y;
    float ly = dy < 0.0 ? sc.a : sc.a * 0.22;
    float spread = 1.0 + max(-dy, 0.0) * 6.0;
    float dx = (abF.x - abM.x + rip.x * 0.06) / (wa * spread);
    neon += sc.rgb * exp(-dx * dx) * exp(-(dy * dy) / (ly * ly));
  }
  // horizontal ripple bands break the streaks up (classic wet asphalt look)
  float bands = 0.55 + 0.45 * tnoise(vec2(abF.x * 9.0 + rip.x * 2.0, abF.y * 160.0 - uTime * 0.25));
  neon *= bands;
  // ---- compose
  vec3 base = vec3(0.016, 0.017, 0.022) * (0.7 + 0.6 * tv) * (0.55 + 0.45 * slab);
  base *= 0.85 + 0.3 * tnoise(w.xz * 0.9);
  neon *= 1.6;
  vec3 refl = skyR * F * 0.85 + neon * (0.3 + 0.7 * F);
  refl *= wet;
  refl += (neon * 0.6 + skyR * 0.5 + uAccent * 0.02) * ring * 0.7;
  vec3 col = base + refl;
  col *= 1.0 - 0.35 * calmMask(abF);
  col = envFog(col, w, 0.0);
  gl_FragColor = vec4(col, 1.0);
}`;

export interface ReflectionSource {
  pos: THREE.Vector3;
  /** World half-width of the light. */
  width: number;
  color: THREE.Color;
  /** Linear intensity (multiplies colour). */
  intensity: number;
  /** Streak length toward the viewer (angular). */
  length: number;
}

export interface Rooftop {
  group: THREE.Group;
  sources: ReflectionSource[];
  update(dt: number, t: number): void;
}

let shoji: THREE.Texture | null = null;
/** Warm paper panel with kumiko lattice (lantern fire boxes). */
function shojiTexture(): THREE.Texture {
  if (shoji) return shoji;
  shoji = canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 36, 4, 32, 32, 40);
    g.addColorStop(0, '#ffd890');
    g.addColorStop(0.6, '#ff9a3a');
    g.addColorStop(1, '#a8400c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = 'rgba(40,10,0,0.85)';
    ctx.lineWidth = 3;
    for (const v of [21, 43]) {
      ctx.beginPath();
      ctx.moveTo(v, 0);
      ctx.lineTo(v, 64);
      ctx.moveTo(0, v);
      ctx.lineTo(64, v);
      ctx.stroke();
    }
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, 64, 64);
  });
  return shoji;
}

function toroGeometry(): { stone: THREE.BufferGeometry; light: THREE.BufferGeometry } {
  const parts: THREE.BufferGeometry[] = [];
  const hex = (r0: number, r1: number, h: number, y: number) => new THREE.CylinderGeometry(r1, r0, h, 6).translate(0, y + h / 2, 0);
  parts.push(hex(0.55, 0.5, 0.18, 0));
  parts.push(hex(0.42, 0.36, 0.14, 0.18));
  parts.push(new THREE.CylinderGeometry(0.16, 0.2, 1.05, 12).translate(0, 0.32 + 0.525, 0));
  parts.push(hex(0.3, 0.46, 0.16, 1.37));
  // fire box frame: 4 posts + top/bottom plates
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(new THREE.BoxGeometry(0.08, 0.46, 0.08).translate(sx * 0.24, 1.53 + 0.23, sz * 0.24));
  parts.push(hex(0.36, 0.36, 0.05, 1.99));
  // roof: flared hex with lifted corners
  const prof = [new THREE.Vector2(0.05, 0.42), new THREE.Vector2(0.2, 0.32), new THREE.Vector2(0.48, 0.12), new THREE.Vector2(0.66, 0.02), new THREE.Vector2(0.68, -0.04), new THREE.Vector2(0.3, 0.0)];
  const roof = new THREE.LatheGeometry(prof, 6).translate(0, 2.06, 0);
  const rp = roof.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < rp.count; i++) {
    const r = Math.hypot(rp.getX(i), rp.getZ(i));
    if (r > 0.5) rp.setY(i, rp.getY(i) + (r - 0.5) * 0.45);
  }
  roof.computeVertexNormals();
  parts.push(roof);
  parts.push(new THREE.SphereGeometry(0.08, 10, 8).scale(1, 1.4, 1).translate(0, 2.55, 0));
  const clean = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    n.deleteAttribute('uv');
    return n;
  });
  // merged via BufferGeometryUtils-like concat (positions + normals only)
  let count = 0;
  for (const g of clean) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  let o = 0;
  for (const g of clean) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  }
  const stone = new THREE.BufferGeometry();
  stone.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  stone.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const light = new THREE.BoxGeometry(0.42, 0.4, 0.42).translate(0, 1.53 + 0.23, 0);
  return { stone, light };
}

export function createRooftop(u: EnvUniforms): Rooftop {
  const group = new THREE.Group();
  group.name = 'rooftop';
  const sources: ReflectionSource[] = [];
  const srcPos = Array.from({ length: MAX_SRC }, () => new THREE.Vector4());
  const srcCol = Array.from({ length: MAX_SRC }, () => new THREE.Vector4());

  // ---- floor
  const floorMat = new THREE.ShaderMaterial({
    uniforms: { ...u, uFloorY: { value: FLOOR_Y }, uSrcPos: { value: srcPos }, uSrcCol: { value: srcCol } },
    vertexShader: FLOOR_VERT,
    fragmentShader: FLOOR_FRAG,
    fog: false,
  });
  floorMat.name = 'env-wetFloor';
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(110, 40).rotateX(-Math.PI / 2).translate(0, FLOOR_Y, EDGE_Z + 20), floorMat);
  floor.name = 'wetFloor';
  group.add(floor);

  // static props are merged per material at the end (few draw calls)
  const props = new THREE.Group();
  props.name = 'rooftopProps';
  // ---- parapet: concrete wall, steel cap, LED strip, railing, warning lights
  const concrete = new THREE.MeshStandardMaterial({ color: 0x15181f, roughness: 0.82, metalness: 0.05, roughnessMap: grungeTexture() });
  concrete.name = 'env-concrete';
  const wall = new THREE.Mesh(new RoundedBoxGeometry(110, 0.85, 0.7, 2, 0.08), concrete);
  wall.position.set(0, FLOOR_Y + 0.425, EDGE_Z);
  props.add(wall);
  const cap = new THREE.Mesh(new RoundedBoxGeometry(110.4, 0.16, 0.95, 2, 0.05), MAT.gunmetal());
  cap.position.set(0, FLOOR_Y + 0.92, EDGE_Z + 0.02);
  props.add(cap);
  const ledMat = new THREE.MeshBasicMaterial({ color: glow(0x38e8ff, 1.0), toneMapped: false });
  ledMat.name = 'env-parapetLed';
  const led = new THREE.Mesh(new THREE.BoxGeometry(110, 0.035, 0.035), ledMat);
  led.position.set(0, FLOOR_Y + 0.82, EDGE_Z + 0.5);
  props.add(led);
  const postGeo = new RoundedBoxGeometry(0.08, 1.15, 0.08, 1, 0.02);
  const posts = new THREE.InstancedMesh(postGeo, MAT.gunmetal(), 56);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 56; i++) {
    m4.makeTranslation(-55 + i * 2, FLOOR_Y + 1.0 + 0.575, EDGE_Z);
    posts.setMatrixAt(i, m4);
  }
  group.add(posts);
  const railGeo = new THREE.CylinderGeometry(0.035, 0.035, 110, 8).rotateZ(Math.PI / 2);
  for (const h of [0.6, 1.12]) {
    const rail = new THREE.Mesh(railGeo, MAT.gunmetal());
    rail.position.set(0, FLOOR_Y + 1.0 + h, EDGE_Z);
    props.add(rail);
  }
  const warnMat = new THREE.MeshBasicMaterial({ color: glow(0xff2a1a, 4), toneMapped: false });
  warnMat.name = 'env-warn';
  const warnGeo = new THREE.SphereGeometry(0.07, 10, 8);
  for (let i = -4; i <= 4; i++) {
    const w = new THREE.Mesh(warnGeo, warnMat);
    w.position.set(i * 11 + 3, FLOOR_Y + 2.25, EDGE_Z);
    props.add(w);
  }

  // ---- stone tōrō lanterns (warm light + glow + reflection)
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3b3e46, roughness: 0.88, metalness: 0.02, roughnessMap: grungeTexture() });
  stoneMat.name = 'env-stone';
  const fireMat = new THREE.MeshBasicMaterial({ map: shojiTexture(), color: glow(0xffffff, 1.5), toneMapped: false });
  fireMat.name = 'env-fire';
  const haloMat = new THREE.MeshBasicMaterial({ map: radialTexture(), color: new THREE.Color(0xff9a40).multiplyScalar(0.26), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  haloMat.name = 'env-fireHalo';
  const toro = toroGeometry();
  const haloGeo = new THREE.PlaneGeometry(2.2, 2.2);
  const lanterns: THREE.Vector3[] = [new THREE.Vector3(6.4, FLOOR_Y, -4.5), new THREE.Vector3(-10.2, FLOOR_Y, -8), new THREE.Vector3(-15, FLOOR_Y, -12.6)];
  for (const p of lanterns) {
    const s = new THREE.Mesh(toro.stone, stoneMat);
    s.position.copy(p);
    s.scale.setScalar(1.25);
    s.rotation.y = 0.3;
    props.add(s);
    const f = new THREE.Mesh(toro.light, fireMat);
    f.position.copy(p);
    f.scale.setScalar(1.25);
    f.rotation.y = 0.3;
    props.add(f);
    const h = new THREE.Mesh(haloGeo, haloMat);
    h.position.set(p.x, p.y + 1.76 * 1.25, p.z + 0.4);
    h.renderOrder = 3;
    props.add(h);
    sources.push({ pos: new THREE.Vector3(p.x, p.y + 2.2, p.z), width: 0.45, color: new THREE.Color(0xff9a40), intensity: 1.1, length: 0.05 });
  }
  group.add(bakeStatic(props));

  let warnT = 0;
  const tmp = new THREE.Color();
  return {
    group,
    sources,
    update(dt) {
      warnT += dt;
      // aviation-style slow blink on the parapet
      const blink = 0.25 + 0.75 * Math.pow(Math.max(0, Math.sin(warnT * 0.0028)), 4);
      warnMat.color.setRGB(1, 0.16, 0.1).multiplyScalar(4 * blink);
      for (let i = 0; i < MAX_SRC; i++) {
        const s = sources[i];
        if (!s) {
          srcCol[i].w = 0;
          continue;
        }
        srcPos[i].set(s.pos.x, s.pos.y, s.pos.z, s.width);
        tmp.copy(s.color).multiplyScalar(s.intensity);
        srcCol[i].set(tmp.r, tmp.g, tmp.b, s.intensity > 0 ? s.length : 0);
      }
    },
  };
}
