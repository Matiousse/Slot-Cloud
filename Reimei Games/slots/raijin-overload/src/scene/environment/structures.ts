// Landmark structures: multi-tier pagodas with upturned eaves and lantern-lit
// undersides (merged vertex-coloured geometry, one draw call each, stylised
// night shader with fog), and the torii gate on the shrine rooftop (PBR).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MAT, glow } from '../materials';
import { textGeometry } from '../text3d';
import type { EnvUniforms } from './palette';
import { GLSL_FOG, GLSL_NOISE, GLSL_VIEW } from './noise';
import { merge, paint } from './util';

const STRUCT_VERT = /* glsl */ `
attribute float aEmit;
varying vec3 vWorld;
varying vec3 vN;
varying vec3 vCol;
varying float vEmit;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vCol = color;
  vEmit = aEmit;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const STRUCT_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime, uFlash, uFogDensity, uCalmAmt, uLantern, uFogAmt;
uniform vec4 uCalm;
uniform vec3 uFog, uCityGlow, uLightning, uSkyMid, uHorizon, uWinWarm, uAccent;
varying vec3 vWorld;
varying vec3 vN;
varying vec3 vCol;
varying float vEmit;
${GLSL_NOISE}
${GLSL_VIEW}
${GLSL_FOG}
void main() {
  vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 V = normalize(cameraPosition - vWorld);
  float up = max(n.y, 0.0), down = max(-n.y, 0.0);
  // storm sky from above, neon street glow from below, horizon rim from behind
  vec3 light = uSkyMid * (0.9 + 3.2 * up) + uCityGlow * 1.4 * down + vec3(0.02, 0.022, 0.03);
  float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  light += (uHorizon * 2.2 + uLightning * 0.08) * rim;
  // lantern bounce under the eaves (warm) with slow flame flicker
  float flick = 0.85 + 0.15 * tnoise(vec2(uTime * 0.7, vWorld.y * 0.05));
  light += uWinWarm * down * 2.6 * uLantern * flick;
  // lightning: everything catches the flash
  light += uLightning * uFlash * (0.8 + 2.0 * up + rim * 2.0);
  vec3 col = vCol * light;
  col += vCol * vEmit * (0.85 + 0.15 * flick);
  float calm = calmMask(angular(vWorld));
  col *= 1.0 - 0.45 * calm;
  col = mix(col, envFog(col, vWorld, 0.0), uFogAmt);
  gl_FragColor = vec4(col, 1.0);
}`;

export function structureMaterial(u: EnvUniforms): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: { ...u, uLantern: { value: 1 }, uFogAmt: { value: 0.6 } },
    vertexShader: STRUCT_VERT,
    fragmentShader: STRUCT_FRAG,
    vertexColors: true,
    side: THREE.DoubleSide,
    fog: false,
  });
  m.name = 'env-structure';
  return m;
}

// ---------------------------------------------------------------- pagoda

const C = {
  tile: 0x1b222c,
  tileEdge: 0x2b3442,
  goldTrim: 0xc8902a,
  rafter: 0x3a1010,
  lacquer: 0x5a0e14,
  wall: 0x2a1a18,
  stone: 0x30343c,
  shoji: 0xffb25e,
  lantern: 0xff4a22,
};

/** Flared roof: lathe mapped to a square with lifted, extended corners. */
function roofGeometry(r0: number, r1: number, h: number, lift: number): THREE.BufferGeometry {
  const prof: THREE.Vector2[] = [];
  const colors: number[] = [];
  const N = 9;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    prof.push(new THREE.Vector2(r0 + (r1 - r0) * t, h * Math.pow(1 - t, 1.7)));
    colors.push(i === N ? C.tileEdge : C.tile);
  }
  // eave lip (gold trim) and underside back to the wall
  prof.push(new THREE.Vector2(r1 * 1.01, -h * 0.06));
  colors.push(C.goldTrim);
  prof.push(new THREE.Vector2(r1 * 0.99, -h * 0.14));
  colors.push(C.goldTrim);
  prof.push(new THREE.Vector2(r1 * 0.78, -h * 0.07));
  colors.push(C.rafter);
  prof.push(new THREE.Vector2(r0 * 0.9, h * 0.25));
  colors.push(C.rafter);
  const geo = new THREE.LatheGeometry(prof, 36);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const P = prof.length;
  const col = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  const SQ2 = Math.SQRT2 - 1;
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    const r = Math.hypot(x, z);
    const phi = Math.atan2(x, z);
    const s = 1 / Math.max(Math.abs(Math.cos(phi)), Math.abs(Math.sin(phi)));
    const corner = (s - 1) / SQ2;
    const t = Math.min(1, Math.max(0, (r - r0) / (r1 - r0)));
    const k = s * (1 + 0.1 * corner * t * t);
    pos.setXYZ(v, Math.sin(phi) * r * k, y + lift * Math.pow(corner, 3) * t * t, Math.cos(phi) * r * k);
    tmp.set(colors[v % P]);
    col.set([tmp.r, tmp.g, tmp.b], v * 3);
  }
  geo.computeVertexNormals();
  geo.deleteAttribute('uv');
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const g = geo.toNonIndexed();
  geo.dispose();
  const em = new Float32Array(g.attributes.position.count);
  const gc = g.attributes.color as THREE.BufferAttribute;
  const gold = new THREE.Color(C.goldTrim);
  for (let i = 0; i < em.length; i++) if (Math.abs(gc.getX(i) - gold.r) < 1e-3 && Math.abs(gc.getY(i) - gold.g) < 1e-3) em[i] = 0.35;
  g.setAttribute('aEmit', new THREE.BufferAttribute(em, 1));
  return g;
}

export interface PagodaOpts {
  tiers?: number;
  base?: number;
  tierH?: number;
  shrink?: number;
}

export function pagodaGeometry(o: PagodaOpts = {}): { geo: THREE.BufferGeometry; height: number; lanterns: THREE.Vector3[] } {
  const tiers = o.tiers ?? 5;
  const base = o.base ?? 7;
  const tierH = o.tierH ?? 2.6;
  const shrink = o.shrink ?? 0.84;
  const parts: THREE.BufferGeometry[] = [];
  const lanterns: THREE.Vector3[] = [];
  // stone podium (two steps)
  parts.push(paint(new THREE.BoxGeometry(base * 1.5, 1.2, base * 1.5).translate(0, 0.6, 0), C.stone));
  parts.push(paint(new THREE.BoxGeometry(base * 1.25, 0.6, base * 1.25).translate(0, 1.5, 0), C.stone));
  let y = 1.8;
  let w = base;
  for (let i = 0; i < tiers; i++) {
    const bodyW = w * 0.62;
    const bodyH = tierH * (i === 0 ? 1.1 : 0.78);
    parts.push(paint(new THREE.BoxGeometry(bodyW, bodyH, bodyW).translate(0, y + bodyH / 2, 0), C.wall));
    // lacquered corner posts
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        parts.push(paint(new THREE.BoxGeometry(0.22, bodyH, 0.22).translate((sx * bodyW) / 2, y + bodyH / 2, (sz * bodyW) / 2), C.lacquer));
    // glowing shoji panels on each face
    const sw = bodyW * 0.34, sh = bodyH * 0.4;
    const sy = y + bodyH * 0.46;
    parts.push(paint(new THREE.BoxGeometry(sw, sh, 0.06).translate(0, sy, bodyW / 2 + 0.03), C.shoji, 0.75));
    parts.push(paint(new THREE.BoxGeometry(sw, sh, 0.06).translate(0, sy, -bodyW / 2 - 0.03), C.shoji, 0.75));
    parts.push(paint(new THREE.BoxGeometry(0.06, sh, sw).translate(bodyW / 2 + 0.03, sy, 0), C.shoji, 0.75));
    parts.push(paint(new THREE.BoxGeometry(0.06, sh, sw).translate(-bodyW / 2 - 0.03, sy, 0), C.shoji, 0.75));
    // shoji mullions (dark cross)
    parts.push(paint(new THREE.BoxGeometry(sw, 0.06, 0.08).translate(0, sy, bodyW / 2 + 0.05), C.rafter));
    parts.push(paint(new THREE.BoxGeometry(0.06, sh, 0.08).translate(0, sy, bodyW / 2 + 0.05), C.rafter));
    // balcony rail ring
    const rw = bodyW * 1.18;
    parts.push(paint(new THREE.BoxGeometry(rw, 0.1, 0.1).translate(0, y + 0.55, rw / 2), C.goldTrim, 0.05));
    parts.push(paint(new THREE.BoxGeometry(rw, 0.1, 0.1).translate(0, y + 0.55, -rw / 2), C.goldTrim, 0.05));
    parts.push(paint(new THREE.BoxGeometry(0.1, 0.1, rw).translate(rw / 2, y + 0.55, 0), C.goldTrim, 0.05));
    parts.push(paint(new THREE.BoxGeometry(0.1, 0.1, rw).translate(-rw / 2, y + 0.55, 0), C.goldTrim, 0.05));
    // bracket band (tokyo) under the roof
    parts.push(paint(new THREE.BoxGeometry(bodyW * 1.12, 0.32, bodyW * 1.12).translate(0, y + bodyH + 0.1, 0), C.rafter));
    y += bodyH;
    // roof
    const rr = w * 0.5 * (i === 0 ? 1.08 : 1);
    const rh = tierH * 0.42;
    parts.push(roofGeometry(bodyW * 0.45, rr, rh, rh * 0.85).translate(0, y + 0.15, 0));
    // hanging lanterns at the 4 corners
    const cr = rr * 1.32;
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      const lx = Math.sin(a) * cr * 0.92, lz = Math.cos(a) * cr * 0.92;
      const ly = y + rh * 0.5;
      parts.push(paint(new THREE.IcosahedronGeometry(0.2, 1).scale(1, 1.25, 1).translate(lx, ly - 0.45, lz), C.lantern, 4.5));
      parts.push(paint(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 3).translate(lx, ly - 0.15, lz), C.rafter));
      lanterns.push(new THREE.Vector3(lx, ly - 0.45, lz));
    }
    y += rh * 0.65;
    w *= shrink;
  }
  // sorin spire: pole, 9 rings, water flame, jewel
  const spH = tierH * 2.2;
  parts.push(paint(new THREE.CylinderGeometry(0.09, 0.14, spH, 6).translate(0, y + spH / 2, 0), C.goldTrim, 0.15));
  for (let k = 0; k < 9; k++) {
    const rk = 0.42 - k * 0.022;
    parts.push(paint(new THREE.TorusGeometry(rk, 0.05, 4, 14).rotateX(Math.PI / 2).translate(0, y + 0.5 + k * spH * 0.075, 0), C.goldTrim, 0.6));
  }
  parts.push(paint(new THREE.SphereGeometry(0.22, 10, 8).scale(1, 1.5, 1).translate(0, y + spH + 0.15, 0), C.goldTrim, 1.4));
  return { geo: merge(parts), height: y + spH + 0.5, lanterns };
}

// ---------------------------------------------------------------- torii (near, PBR)

export function createTorii(width = 5, height = 6.5): { group: THREE.Group; neon: THREE.MeshBasicMaterial; neonPos: THREE.Vector3 } {
  const group = new THREE.Group();
  group.name = 'torii';
  const red = MAT.crimsonLacquer().clone() as THREE.MeshPhysicalMaterial;
  red.color.set(0x7a0a14);
  red.roughness = 0.42;
  red.name = 'env-toriiLacquer';
  const black = MAT.blackLacquer();
  const gold = MAT.gold();
  const half = width / 2;
  // pillars (slight inward lean, tapered) with black bases and gold collars
  const pillarGeo = new THREE.CylinderGeometry(0.24, 0.3, height, 20);
  const baseGeo = new THREE.CylinderGeometry(0.36, 0.4, 0.7, 20);
  const collarGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.1, 20);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(pillarGeo, red);
    p.position.set(s * half, height / 2, 0);
    p.rotation.z = s * 0.025;
    group.add(p);
    const b = new THREE.Mesh(baseGeo, black);
    b.position.set(s * half, 0.35, 0);
    group.add(b);
    const c = new THREE.Mesh(collarGeo, gold);
    c.position.set(s * half, 0.72, 0);
    group.add(c);
  }
  // kasagi (top lintel, upturned ends) + shimaki under it
  const kw = width * 1.5;
  const kas = new THREE.BoxGeometry(kw, 0.34, 0.62, 32, 1, 1);
  const kp = kas.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < kp.count; i++) {
    const x = kp.getX(i);
    const t = Math.abs(x) / (kw / 2);
    kp.setY(i, kp.getY(i) + 0.42 * Math.pow(t, 3.2) + (kp.getY(i) > 0 ? 0.04 * Math.pow(t, 2) : 0));
  }
  kas.computeVertexNormals();
  const kasagi = new THREE.Mesh(kas, black);
  kasagi.position.y = height + 0.62;
  group.add(kasagi);
  const shim = new THREE.Mesh(new RoundedBoxGeometry(width * 1.34, 0.32, 0.5, 2, 0.05), red);
  shim.position.y = height + 0.3;
  group.add(shim);
  // nuki (tie beam) through the pillars, gakuzuka strut, plaque with kanji
  const nuki = new THREE.Mesh(new RoundedBoxGeometry(width * 1.22, 0.28, 0.32, 2, 0.05), red);
  nuki.position.y = height * 0.74;
  group.add(nuki);
  const strut = new THREE.Mesh(new RoundedBoxGeometry(0.3, height * 0.26 - 0.1, 0.28, 2, 0.04), red);
  strut.position.y = height * 0.74 + (height * 0.26) / 2 + 0.05;
  group.add(strut);
  const plaque = new THREE.Mesh(new RoundedBoxGeometry(0.72, 1.05, 0.12, 2, 0.04), black);
  plaque.position.set(0, height * 0.86, 0.22);
  group.add(plaque);
  const frame = new THREE.Mesh(new RoundedBoxGeometry(0.82, 1.15, 0.08, 2, 0.03), gold);
  frame.position.set(0, height * 0.86, 0.17);
  group.add(frame);
  // plaque kanji stacked vertically
  const k1 = new THREE.Mesh(textGeometry('雷', { font: 'kanji', size: 0.34, depth: 0.03, bevel: 0.006 }), gold);
  const k2 = new THREE.Mesh(textGeometry('神', { font: 'kanji', size: 0.34, depth: 0.03, bevel: 0.006 }), gold);
  k1.position.set(0, height * 0.86 + 0.22, 0.3);
  k2.position.set(0, height * 0.86 - 0.22, 0.3);
  group.add(k1, k2);
  // gold end caps on the kasagi
  const capGeo = new RoundedBoxGeometry(0.12, 0.42, 0.68, 2, 0.03);
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(capGeo, gold);
    cap.position.set(s * (kw / 2 - 0.02), height + 0.62 + 0.42, 0);
    cap.rotation.z = -s * 0.5;
    group.add(cap);
  }
  // neon strip under the shimaki (magenta-red)
  const neon = new THREE.MeshBasicMaterial({ color: glow(0xff2f6a, 3.2), toneMapped: false });
  neon.name = 'env-toriiNeon';
  const strip = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, width * 1.25, 4, 8).rotateZ(Math.PI / 2), neon);
  strip.position.set(0, height + 0.12, 0.2);
  group.add(strip);
  // shimenawa rope with shide paper zigzags on the nuki
  const rope = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([new THREE.Vector3(-half * 0.95, 0, 0), new THREE.Vector3(0, -0.28, 0), new THREE.Vector3(half * 0.95, 0, 0)]),
      24,
      0.07,
      8,
    ),
    new THREE.MeshStandardMaterial({ color: 0x8a7650, roughness: 0.9, metalness: 0 }),
  );
  rope.position.set(0, height * 0.74 - 0.22, 0.24);
  group.add(rope);
  return { group, neon, neonPos: new THREE.Vector3(0, height + 0.12, 0.2) };
}
