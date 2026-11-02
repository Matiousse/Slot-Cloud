// Procedural geometry toolkit for RAIJIN.
//
// The core primitive is `plate()`: a 2D outline (with optional holes) extruded
// into a slab with ROUNDED BEVELS, an evenly tessellated cap (Steiner points)
// so it can then be bent around cylinders (`bendX` / `bendY`) into curved
// armour plates, with crease-aware smooth normals. Everything else (lathe,
// rounded boxes, tubes) is normalised to non-indexed position/normal/uv so
// a `Parts` builder can merge each bone's pieces into one mesh per material.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type P2 = [number, number];
export type Poly = P2[];

// ------------------------------------------------------------------ polygons

export function polyArea(p: Poly): number {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const [x0, y0] = p[i];
    const [x1, y1] = p[(i + 1) % n];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

const ccw = (p: Poly): Poly => (polyArea(p) < 0 ? p.slice().reverse() : p.slice());
const cw = (p: Poly): Poly => (polyArea(p) > 0 ? p.slice().reverse() : p.slice());

/** Closed polygon resampled so no edge is longer than `maxLen` (corners kept). */
export function resample(p: Poly, maxLen: number): Poly {
  const out: Poly = [];
  for (let i = 0, n = p.length; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const k = Math.max(1, Math.ceil(len / maxLen));
    for (let j = 0; j < k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  }
  return out;
}

/** Outward miter vectors of a properly oriented loop (CCW outer / CW hole). */
function miters(p: Poly): P2[] {
  const n = p.length;
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n];
    let e1x = b[0] - a[0], e1y = b[1] - a[1];
    let e2x = c[0] - b[0], e2y = c[1] - b[1];
    const l1 = Math.hypot(e1x, e1y) || 1, l2 = Math.hypot(e2x, e2y) || 1;
    e1x /= l1; e1y /= l1; e2x /= l2; e2y /= l2;
    const n1x = e1y, n1y = -e1x, n2x = e2y, n2y = -e2x;
    let mx = n1x + n2x, my = n1y + n2y;
    const ml = Math.hypot(mx, my);
    if (ml < 1e-6) { mx = n1x; my = n1y; } else { mx /= ml; my /= ml; }
    const cosH = Math.max(0.35, mx * n1x + my * n1y);
    out.push([mx / cosH, my / cosH]);
  }
  return out;
}

/** Offset a polygon (positive = grow). */
export function offsetPoly(p: Poly, d: number): Poly {
  const o = ccw(p);
  const m = miters(o);
  return o.map((v, i) => [v[0] + m[i][0] * d, v[1] + m[i][1] * d] as P2);
}

/** Polygon with per-corner fillets: points are [x, y, radius?]. */
export function rounded(pts: Array<[number, number, number?]>, defR = 0, segs = 4): Poly {
  const n = pts.length;
  const out: Poly = [];
  for (let i = 0; i < n; i++) {
    const [x, y, rr] = pts[i];
    const r = rr ?? defR;
    if (r <= 0) { out.push([x, y]); continue; }
    const a = pts[(i - 1 + n) % n], c = pts[(i + 1) % n];
    let ax = a[0] - x, ay = a[1] - y, cx = c[0] - x, cy = c[1] - y;
    const la = Math.hypot(ax, ay), lc = Math.hypot(cx, cy);
    if (la < 1e-9 || lc < 1e-9) { out.push([x, y]); continue; }
    ax /= la; ay /= la; cx /= lc; cy /= lc;
    const ang = Math.acos(Math.max(-1, Math.min(1, ax * cx + ay * cy)));
    const t = Math.min(r / Math.tan(ang / 2), la * 0.45, lc * 0.45);
    const p0: P2 = [x + ax * t, y + ay * t];
    const p1: P2 = [x + cx * t, y + cy * t];
    // quadratic bezier through the corner approximates the fillet nicely
    for (let j = 0; j <= segs; j++) {
      const s = j / segs;
      const u = 1 - s;
      out.push([u * u * p0[0] + 2 * u * s * x + s * s * p1[0], u * u * p0[1] + 2 * u * s * y + s * s * p1[1]]);
    }
  }
  return out;
}

export function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, n: number): Poly {
  const out: Poly = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

export const circlePoly = (cx: number, cy: number, r: number, n = 24): Poly => arcPts(cx, cy, r, 0, Math.PI * 2, n).slice(0, n);

export const mirrorPoly = (p: Poly): Poly => p.map(([x, y]) => [-x, y] as P2).reverse();

/** Symmetric polygon from its right half (points from top-center clockwise to bottom-center, x >= 0). */
export function symPoly(half: Array<[number, number, number?]>, defR = 0, segs = 4): Poly {
  const left = half.slice(1, -1).reverse().map(([x, y, r]) => [-x, y, r] as [number, number, number?]);
  return rounded([...half, ...left], defR, segs);
}

function pointInPoly(x: number, y: number, p: Poly): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], yi = p[i][1], xj = p[j][0], yj = p[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function distToPoly(x: number, y: number, p: Poly): number {
  let d = Infinity;
  for (let i = 0, n = p.length; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
    d = Math.min(d, Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t));
  }
  return d;
}

// ------------------------------------------------------------------ deformers

export type Deform = (v: THREE.Vector3) => void;

/** Wrap around a vertical axis (cylinder radius R, axis at z = -R): x becomes arc length. */
export const bendX = (R: number): Deform => (v) => {
  const a = v.x / R;
  const r = R + v.z;
  v.x = r * Math.sin(a);
  v.z = r * Math.cos(a) - R;
};
/** Wrap around a horizontal axis (cylinder radius R, axis at z = -R): y becomes arc length. */
export const bendY = (R: number): Deform => (v) => {
  const a = v.y / R;
  const r = R + v.z;
  v.y = r * Math.sin(a);
  v.z = r * Math.cos(a) - R;
};
/** Scale x linearly along y (taper). k = scale at y=1 relative to y=0. */
export const taperX = (y0: number, y1: number, s0: number, s1: number): Deform => (v) => {
  const t = Math.max(0, Math.min(1, (v.y - y0) / (y1 - y0)));
  v.x *= s0 + (s1 - s0) * t;
};
/** Translate (to bend around a different centre). */
export const shift = (dx: number, dy: number, dz = 0): Deform => (v) => {
  v.x += dx;
  v.y += dy;
  v.z += dz;
};
/** Bend around a horizontal axis centred at height cy. */
export const bendYAt = (R: number, cy: number): Deform => {
  const b = bendY(R);
  return (v) => {
    v.y -= cy;
    b(v);
    v.y += cy;
  };
};
export const chain = (...fns: Deform[]): Deform => (v) => {
  for (const f of fns) f(v);
};

// ------------------------------------------------------------------ normals

/** Smooth normals except across edges sharper than `angle` (non-indexed geometry). */
export function creaseNormals(geo: THREE.BufferGeometry, angle = 0.75): THREE.BufferGeometry {
  const g = dropDegenerate(geo.index ? geo.toNonIndexed() : geo);
  const pos = g.attributes.position.array as Float32Array;
  const triCount = pos.length / 9;
  const fn = new Float32Array(triCount * 3); // unit face normals
  const fa = new Float32Array(triCount * 3); // area weighted
  for (let t = 0; t < triCount; t++) {
    const o = t * 9;
    const ax = pos[o], ay = pos[o + 1], az = pos[o + 2];
    const bx = pos[o + 3] - ax, by = pos[o + 4] - ay, bz = pos[o + 5] - az;
    const cx = pos[o + 6] - ax, cy = pos[o + 7] - ay, cz = pos[o + 8] - az;
    const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx;
    const l = Math.hypot(nx, ny, nz) || 1e-12;
    fa[t * 3] = nx; fa[t * 3 + 1] = ny; fa[t * 3 + 2] = nz;
    fn[t * 3] = nx / l; fn[t * 3 + 1] = ny / l; fn[t * 3 + 2] = nz / l;
  }
  const key = (i: number) => `${Math.round(pos[i] * 4000)},${Math.round(pos[i + 1] * 4000)},${Math.round(pos[i + 2] * 4000)}`;
  const map = new Map<string, number[]>();
  for (let v = 0; v < triCount * 3; v++) {
    const k = key(v * 3);
    let l = map.get(k);
    if (!l) map.set(k, (l = []));
    l.push((v / 3) | 0);
  }
  const cos = Math.cos(angle);
  const out = new Float32Array(pos.length);
  for (let v = 0; v < triCount * 3; v++) {
    const t = (v / 3) | 0;
    const list = map.get(key(v * 3))!;
    let x = 0, y = 0, z = 0;
    const nx = fn[t * 3], ny = fn[t * 3 + 1], nz = fn[t * 3 + 2];
    for (const o of list) {
      if (o === t || fn[o * 3] * nx + fn[o * 3 + 1] * ny + fn[o * 3 + 2] * nz > cos) {
        x += fa[o * 3]; y += fa[o * 3 + 1]; z += fa[o * 3 + 2];
      }
    }
    let l = Math.hypot(x, y, z);
    if (l < 1e-12) { x = nx; y = ny; z = nz; l = Math.hypot(x, y, z); }
    if (l < 1e-12 || !Number.isFinite(l)) { x = 0; y = 1; z = 0; l = 1; }
    out[v * 3] = x / l; out[v * 3 + 1] = y / l; out[v * 3 + 2] = z / l;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return g;
}

/** Remove zero-area / non-finite triangles (they produce NaN normals -> bloom artefacts). */
export function dropDegenerate(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.attributes.position.array as Float32Array;
  const tc = pos.length / 9;
  const keep: number[] = [];
  for (let t = 0; t < tc; t++) {
    const o = t * 9;
    let ok = true;
    for (let k = 0; k < 9; k++) if (!Number.isFinite(pos[o + k])) ok = false;
    if (!ok) continue;
    const bx = pos[o + 3] - pos[o], by = pos[o + 4] - pos[o + 1], bz = pos[o + 5] - pos[o + 2];
    const cx = pos[o + 6] - pos[o], cy = pos[o + 7] - pos[o + 1], cz = pos[o + 8] - pos[o + 2];
    const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx;
    if (nx * nx + ny * ny + nz * nz > 1e-16) keep.push(t);
  }
  if (keep.length === tc) return g;
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) {
    const a = attr as THREE.BufferAttribute;
    const isz = a.itemSize;
    const src = a.array as Float32Array;
    const dst = new Float32Array(keep.length * 3 * isz);
    keep.forEach((t, i) => dst.set(src.subarray(t * 3 * isz, (t + 1) * 3 * isz), i * 3 * isz));
    out.setAttribute(name, new THREE.BufferAttribute(dst, isz));
  }
  return out;
}

/** Ensure every normal is finite and unit length. */
function fixNormals(g: THREE.BufferGeometry) {
  const n = g.attributes.normal.array as Float32Array;
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]);
    if (!Number.isFinite(l) || l < 1e-6) { n[i] = 0; n[i + 1] = 1; n[i + 2] = 0; }
    else if (Math.abs(l - 1) > 1e-3) { n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  }
}

// ------------------------------------------------------------------ plate

export interface PlateOpts {
  depth: number;
  bevel?: number;
  bevelSegs?: number;
  holes?: Poly[];
  /** Steiner grid spacing for the caps (0 = none). */
  grid?: number;
  /** Max outline segment length. */
  seg?: number;
  crease?: number;
  deform?: Deform;
  uvScale?: number;
  /** Skip the back cap (plates glued on a surface). */
  noBack?: boolean;
}

const tmpV = new THREE.Vector3();

export function plate(outline: Poly, o: PlateOpts): THREE.BufferGeometry {
  const t = o.depth;
  const b = Math.min(o.bevel ?? Math.min(0.03, t * 0.3), t * 0.499);
  const S = b > 1e-5 ? o.bevelSegs ?? 2 : 0;
  const seg = o.seg ?? 0.07;
  const uvs = o.uvScale ?? 1;
  const loops: Poly[] = [resample(ccw(outline), seg), ...(o.holes ?? []).map((h) => resample(cw(h), seg))];
  const mit = loops.map(miters);
  // edge profile (offset along miter, z)
  const prof: { off: number; z: number }[] = [];
  for (let k = 0; k <= S; k++) {
    const th = S ? (k / S) * (Math.PI / 2) : Math.PI / 2;
    prof.push({ off: -b * (1 - Math.sin(th)), z: t / 2 - b + b * Math.cos(th) });
  }
  const wall = t / 2 - b > 1e-5;
  for (let k = S; k >= 0; k--) {
    if (k === S && !wall) continue;
    const th = S ? (k / S) * (Math.PI / 2) : Math.PI / 2;
    prof.push({ off: -b * (1 - Math.sin(th)), z: -(t / 2 - b + b * Math.cos(th)) });
  }
  const P: number[] = [];
  const U: number[] = [];
  const push = (x: number, y: number, z: number) => {
    P.push(x, y, z);
    U.push(x * uvs, y * uvs + z * 0.5 * uvs);
  };
  const ringPt = (li: number, i: number, r: number): [number, number, number] => {
    const p = loops[li][i], m = mit[li][i];
    return [p[0] + m[0] * prof[r].off, p[1] + m[1] * prof[r].off, prof[r].z];
  };
  // side bands
  const R = o.noBack ? S + 1 : prof.length;
  loops.forEach((loop, li) => {
    const n = loop.length;
    for (let r = 0; r < R - 1; r++) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const A = ringPt(li, i, r), B = ringPt(li, j, r), C = ringPt(li, j, r + 1), D = ringPt(li, i, r + 1);
        push(...A); push(...C); push(...B);
        push(...A); push(...D); push(...C);
      }
    }
  });
  // caps (inset by bevel) with steiner points for even tessellation
  const inset = loops.map((loop, li) => loop.map((_, i) => ringPt(li, i, 0)));
  const contour = inset[0].map(([x, y]) => new THREE.Vector2(x, y));
  const holesV = inset.slice(1).map((h) => h.map(([x, y]) => new THREE.Vector2(x, y)));
  const grid = o.grid ?? (o.deform ? seg * 2 : 0);
  const steiner: THREE.Vector2[] = [];
  if (grid > 0) {
    const c2 = inset[0].map(([x, y]) => [x, y] as P2);
    const h2 = inset.slice(1).map((h) => h.map(([x, y]) => [x, y] as P2));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of c2) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    let row = 0;
    for (let y = minY + grid * 0.5; y < maxY; y += grid * 0.866, row++) {
      for (let x = minX + grid * 0.5 + (row % 2 ? grid * 0.5 : 0); x < maxX; x += grid) {
        if (!pointInPoly(x, y, c2)) continue;
        if (h2.some((h) => pointInPoly(x, y, h))) continue;
        if (distToPoly(x, y, c2) < grid * 0.55) continue;
        if (h2.some((h) => distToPoly(x, y, h) < grid * 0.55)) continue;
        steiner.push(new THREE.Vector2(x, y));
      }
    }
  }
  const all = [...contour, ...holesV.flat(), ...steiner];
  const tris = THREE.ShapeUtils.triangulateShape(contour, [...holesV, ...steiner.map((s) => [s])]);
  const zf = t / 2;
  for (const f of tris) {
    let [a, bb, c] = f;
    const pa = all[a], pb = all[bb], pc = all[c];
    const cr = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
    if (cr < 0) [bb, c] = [c, bb];
    push(all[a].x, all[a].y, zf); push(all[bb].x, all[bb].y, zf); push(all[c].x, all[c].y, zf);
    if (!o.noBack) {
      push(all[a].x, all[a].y, -zf); push(all[c].x, all[c].y, -zf); push(all[bb].x, all[bb].y, -zf);
    }
  }
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(P);
  if (o.deform) {
    for (let i = 0; i < pos.length; i += 3) {
      tmpV.set(pos[i], pos[i + 1], pos[i + 2]);
      o.deform(tmpV);
      pos[i] = tmpV.x; pos[i + 1] = tmpV.y; pos[i + 2] = tmpV.z;
    }
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(U), 2));
  return creaseNormals(g, o.crease ?? 0.8);
}

// ------------------------------------------------------------------ primitives

/** Make a geometry non-indexed with exactly position/normal/uv. */
export function norm(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const p = g.attributes.position;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      uv[i * 2] = p.getX(i) + p.getZ(i) * 0.7;
      uv[i * 2 + 1] = p.getY(i) + p.getZ(i) * 0.3;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  g.clearGroups();
  g = dropDegenerate(g.index ? g.toNonIndexed() : g);
  fixNormals(g);
  return g;
}

export function rbox(w: number, h: number, d: number, r = 0.04, seg = 1): THREE.BufferGeometry {
  return norm(new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)));
}

/** Lathe around +Y. Profile points are [radius, y]. Crease keeps hard profile corners. */
export function lathe(profile: P2[], segs = 32, crease = 0.6, phiStart = 0, phiLength = Math.PI * 2): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), segs, phiStart, phiLength);
  return creaseNormals(norm(g), crease);
}

/** Beveled cylinder along Y, centred. */
export function cyl(r: number, h: number, segs = 24, bevel = 0.02, rTop = r): THREE.BufferGeometry {
  const b = Math.min(bevel, r * 0.4, h * 0.4);
  const y0 = -h / 2, y1 = h / 2;
  const prof: P2[] = [
    [0, y0], [r - b, y0], [r - b * 0.3, y0 + b * 0.3], [r, y0 + b],
    [rTop, y1 - b], [rTop - b * 0.3, y1 - b * 0.3], [rTop - b, y1], [0, y1],
  ];
  return lathe(prof, segs, 0.7);
}

export function sphere(r: number, ws = 16, hs = 12, phiLen = Math.PI * 2, thetaLen = Math.PI): THREE.BufferGeometry {
  return norm(new THREE.SphereGeometry(r, ws, hs, 0, phiLen, 0, thetaLen));
}

export function tube(points: THREE.Vector3[], radius: number, tubular = 32, radial = 8, closed = false): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', 0.5);
  return norm(new THREE.TubeGeometry(curve, tubular, radius, radial, closed));
}

export function torus(r: number, tube: number, radial = 8, tubular = 48, arc = Math.PI * 2): THREE.BufferGeometry {
  return norm(new THREE.TorusGeometry(r, tube, radial, tubular, arc));
}

/** Rivet / stud: low dome. */
export function rivet(r = 0.035, h = 0.6): THREE.BufferGeometry {
  return norm(new THREE.SphereGeometry(r, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2)).scale(1, h, 1).rotateX(Math.PI / 2);
}

// ------------------------------------------------------------------ transforms

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
/** Matrix from position, euler (XYZ) rotation and scale. */
export function M(px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx, order: THREE.EulerOrder = 'XYZ'): THREE.Matrix4 {
  _e.set(rx, ry, rz, order);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), _q.clone(), new THREE.Vector3(sx, sy, sz));
}

/** Matrix that maps +Z to direction `dir`, positioned at `pos`. */
export function aimZ(pos: THREE.Vector3, dir: THREE.Vector3, s = 1): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
  return new THREE.Matrix4().compose(pos, q, new THREE.Vector3(s, s, s));
}

/** Mirror a non-indexed geometry across X (fixes winding & normals). */
export function mirrorX(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.clone();
  const p = g.attributes.position.array as Float32Array;
  const n = g.attributes.normal.array as Float32Array;
  const uv = g.attributes.uv.array as Float32Array;
  for (let i = 0; i < p.length; i += 3) { p[i] = -p[i]; n[i] = -n[i]; }
  // swap vertices 1 and 2 of each triangle
  for (let t = 0; t < p.length / 9; t++) {
    for (let c = 0; c < 3; c++) {
      const a = t * 9 + 3 + c, b = t * 9 + 6 + c;
      [p[a], p[b]] = [p[b], p[a]];
      [n[a], n[b]] = [n[b], n[a]];
    }
    for (let c = 0; c < 2; c++) {
      const a = t * 6 + 2 + c, b = t * 6 + 4 + c;
      [uv[a], uv[b]] = [uv[b], uv[a]];
    }
  }
  return g;
}

// ------------------------------------------------------------------ parts builder

export type MatRef = THREE.Material | string;

/** Collects transformed geometry per material; build() merges into one mesh per material. */
export class Parts {
  private groups = new Map<MatRef, THREE.BufferGeometry[]>();
  tris = 0;

  add(geo: THREE.BufferGeometry, mat: MatRef, m?: THREE.Matrix4): this {
    const g = norm(geo);
    if (m) g.applyMatrix4(m);
    let l = this.groups.get(mat);
    if (!l) this.groups.set(mat, (l = []));
    l.push(g);
    this.tris += g.attributes.position.count / 3;
    return this;
  }

  /** Merge into meshes under `parent`. String material refs are resolved through `mats`. */
  build(parent: THREE.Object3D, opts: { mirror?: boolean; mats?: Record<string, THREE.Material>; name?: string } = {}): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [ref, list] of this.groups) {
      let g = mergeGeometries(list, false);
      if (!g) continue;
      if (opts.mirror) g = mirrorX(g);
      g.computeBoundingSphere();
      const mat = typeof ref === 'string' ? opts.mats?.[ref] : ref;
      if (!mat) throw new Error(`Parts: unresolved material ${String(ref)}`);
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = `${opts.name ?? parent.name}:${mat.name || String(ref)}`;
      parent.add(mesh);
      out.push(mesh);
    }
    return out;
  }
}
