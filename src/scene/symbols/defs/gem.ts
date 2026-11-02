// H2 — Thunder Gem: round-brilliant-style cut (table, star, kite, upper girdle,
// girdle band, lower girdle and pavilion facets), violet pavilion -> cyan crown
// per-facet colours with flashing inner light, held by six gold claw prongs on
// a gold basket ring, tilted toward the camera for the classic diamond silhouette.

import * as THREE from 'three';
import { merge, xf } from '../geo';
import { gemMaterial } from '../shaders';
import type { SymbolDef } from '../types';
import { grp, mk, prng } from './util';

const TAU = Math.PI * 2;
const R = 0.4; // girdle radius
const HC = 0.15; // crown height
const HP = 0.37; // pavilion depth
const GT = 0.012; // half girdle thickness

function gemGeometry(): THREE.BufferGeometry {
  const N = 8;
  const at = (i: number) => (i / N) * TAU;
  const ag = (j: number) => (j / (2 * N)) * TAU;
  const P = (r: number, a: number, y: number) => new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
  const T = (i: number) => P(R * 0.56, at(((i % N) + N) % N), GT + HC);
  const C = (i: number) => P(R * 0.8, at(((i % N) + N) % N) + Math.PI / N, GT + HC * 0.42);
  const Gu = (j: number) => P(R, ag(((j % (2 * N)) + 2 * N) % (2 * N)), GT);
  const Gl = (j: number) => P(R, ag(((j % (2 * N)) + 2 * N) % (2 * N)), -GT);
  const Pm = (i: number) => P(R * 0.42, at(((i % N) + N) % N) + Math.PI / N, -GT - HP * 0.58);
  const apex = new THREE.Vector3(0, -GT - HP, 0);
  const tableC = new THREE.Vector3(0, GT + HC, 0);
  const tris: THREE.Vector3[][] = [];
  for (let i = 0; i < N; i++) {
    tris.push([tableC, T(i), T(i + 1)]); // table
    tris.push([T(i), T(i + 1), C(i)]); // star
    tris.push([T(i), C(i - 1), Gu(2 * i)]); // kite halves
    tris.push([T(i), Gu(2 * i), C(i)]);
    tris.push([C(i), Gu(2 * i), Gu(2 * i + 1)]); // upper girdle
    tris.push([C(i), Gu(2 * i + 1), Gu(2 * i + 2)]);
    // pavilion
    tris.push([Gl(2 * i), Gl(2 * i + 1), Pm(i)]);
    tris.push([Gl(2 * i + 1), Gl(2 * i + 2), Pm(i)]);
    tris.push([Gl(2 * i), Pm(i), Pm(i - 1)]);
    tris.push([Pm(i - 1), Pm(i), apex]);
  }
  for (let j = 0; j < 2 * N; j++) {
    tris.push([Gu(j), Gl(j), Gl(j + 1)]);
    tris.push([Gu(j), Gl(j + 1), Gu(j + 1)]);
  }
  const pos: number[] = [];
  const col: number[] = [];
  const facet: number[] = [];
  const rnd = prng(5);
  const violet = new THREE.Color(0.42, 0.06, 1.0);
  const deep = new THREE.Color(0.16, 0.02, 0.5);
  const cyan = new THREE.Color(0.2, 0.95, 1.0);
  const pink = new THREE.Color(1.0, 0.35, 0.95);
  const white = new THREE.Color(0.85, 0.95, 1.0);
  const c = new THREE.Color();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3(), cen = new THREE.Vector3();
  const ymin = -GT - HP, ymax = GT + HC;
  for (const t of tris) {
    // outward winding
    e1.subVectors(t[1], t[0]);
    e2.subVectors(t[2], t[0]);
    n.crossVectors(e1, e2);
    cen.copy(t[0]).add(t[1]).add(t[2]).multiplyScalar(1 / 3);
    const tri = n.dot(cen) < 0 ? [t[0], t[2], t[1]] : t;
    const h = (cen.y - ymin) / (ymax - ymin);
    if (h < 0.55) c.copy(deep).lerp(violet, Math.pow(h / 0.55, 0.8));
    else c.copy(violet).lerp(cyan, Math.min(1, (h - 0.55) / 0.35));
    const r = rnd();
    if (r > 0.86) c.lerp(pink, 0.55);
    else if (r > 0.72) c.lerp(white, 0.45);
    else if (r < 0.12) c.multiplyScalar(0.55);
    const f = rnd();
    for (const v of tri) {
      pos.push(v.x, v.y, v.z);
      col.push(c.r, c.g, c.b);
      facet.push(f);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aFacet', new THREE.Float32BufferAttribute(facet, 1));
  g.computeVertexNormals(); // non-indexed -> flat facets
  return g;
}

export const H2: SymbolDef = {
  color: 0xa64dff,
  backGlow: 0.3,
  sway: 0.22,
  bob: 0.014,
  glints: [
    [-0.12, 0.2, 0.2],
    [0.2, 0.08, 0.2],
    [0.0, -0.2, 0.18],
    [-0.3, 0.02, 0.12],
  ],
  build(a) {
    const root = grp('gem');
    const tilt = grp('tilt', [0, 0.07, 0], [0.3, 0, 0]);
    root.add(tilt);
    const spin = grp('spin');
    tilt.add(spin);
    spin.add(mk(a, gemGeometry(), gemMaterial(a), 'stone'));

    // gold setting: 6 claw prongs + basket ring
    const parts: THREE.BufferGeometry[] = [];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU + Math.PI / n;
      const dir = (r: number, y: number) => new THREE.Vector3(Math.sin(ang) * r, y, Math.cos(ang) * r);
      const curve = new THREE.CatmullRomCurve3([dir(R * 0.5, -0.2), dir(R * 0.86, -0.07), dir(R + 0.022, -0.005), dir(R + 0.012, 0.04), dir(R - 0.035, 0.072)]);
      parts.push(new THREE.TubeGeometry(curve, 20, 0.017, 8, false));
      const tip = dir(R - 0.035, 0.072);
      parts.push(xf(new THREE.SphereGeometry(0.022, 12, 8), [tip.x, tip.y, tip.z], [0, 0, 0], [1, 0.8, 1]));
    }
    parts.push(xf(new THREE.TorusGeometry(R * 0.66, 0.014, 10, 48), [0, -0.11, 0], [Math.PI / 2, 0, 0]));
    parts.push(xf(new THREE.TorusGeometry(R * 0.5, 0.012, 10, 48), [0, -0.2, 0], [Math.PI / 2, 0, 0]));
    spin.add(mk(a, merge(parts), a.gold(), 'prongs'));
    return root;
  },
  tick(v, _dt, t) {
    const s = v.nodes.get('spin');
    // slow turn on its own axis (facets catch the light)
    if (s) s.rotation.y = t * 0.00035 + v.phase + (v.state === 'win' ? v.stateT * 0.004 : 0);
  },
};
