// Geometry helpers for the symbol models: bevelled extrusions, lathes, merges.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V3 = [number, number, number];

/** Extrude a shape centred on z = 0 (front face at +depth/2 + bevel). */
export function extrude(shape: THREE.Shape | THREE.Shape[], depth: number, bevel = 0.012, segs = 3, curve = 24): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.85,
    bevelSegments: segs,
    curveSegments: curve,
  });
  g.translate(0, 0, -depth / 2);
  return creased(g);
}

/**
 * Smooth normals across soft angles, crisp edges across hard ones. Like
 * BufferGeometryUtils.toCreasedNormals but with a 1e-4 position hash (the
 * stock one quantises to 0.01 units, far too coarse for 1-unit symbols).
 */
export function creased(g: THREE.BufferGeometry, angle = 0.6): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  const pos = out.attributes.position;
  const count = pos.count;
  const fn = new Float32Array((count / 3) * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let t = 0; t < count / 3; t++) {
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    e1.subVectors(c, b);
    e2.subVectors(a, b);
    e1.cross(e2);
    const l = e1.length();
    if (l > 1e-12) e1.multiplyScalar(1 / l);
    else e1.set(0, 0, 0);
    fn[t * 3] = e1.x;
    fn[t * 3 + 1] = e1.y;
    fn[t * 3 + 2] = e1.z;
  }
  const key = (i: number) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const map = new Map<string, number[]>();
  for (let i = 0; i < count; i++) {
    const k = key(i);
    let l = map.get(k);
    if (!l) map.set(k, (l = []));
    l.push(Math.floor(i / 3));
  }
  const cosA = Math.cos(angle);
  const nor = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const t = Math.floor(i / 3);
    const nx = fn[t * 3], ny = fn[t * 3 + 1], nz = fn[t * 3 + 2];
    let sx = 0, sy = 0, sz = 0;
    for (const o of map.get(key(i))!) {
      const ox = fn[o * 3], oy = fn[o * 3 + 1], oz = fn[o * 3 + 2];
      if (nx * ox + ny * oy + nz * oz >= cosA) {
        sx += ox;
        sy += oy;
        sz += oz;
      }
    }
    const l = Math.hypot(sx, sy, sz) || 1;
    nor[i * 3] = sx / l;
    nor[i * 3 + 1] = sy / l;
    nor[i * 3 + 2] = sz / l;
  }
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return sanitizeNormals(out);
}

/** Replace zero / NaN normals (degenerate triangles) so shading never produces NaN. */
export function sanitizeNormals(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.attributes.normal as THREE.BufferAttribute | undefined;
  if (!n) return g;
  const a = n.array as Float32Array;
  for (let i = 0; i < a.length; i += 3) {
    const l = a[i] * a[i] + a[i + 1] * a[i + 1] + a[i + 2] * a[i + 2];
    if (!(l > 1e-12)) {
      a[i] = 0;
      a[i + 1] = 0;
      a[i + 2] = 1;
    }
  }
  n.needsUpdate = true;
  return g;
}

/** Regular polygon shape (n sides, circumradius r, rotated so a flat edge is on top when rot = PI/n). */
export function polygon(n: number, r: number, rot = Math.PI / n): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i <= n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  return s;
}

export function polygonPath(n: number, r: number, rot = Math.PI / n): THREE.Path {
  const s = new THREE.Path();
  for (let i = 0; i <= n; i++) {
    const a = rot - (i / n) * Math.PI * 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  return s;
}

export function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export function circlePath(r: number, cx = 0, cy = 0, hole = true): THREE.Path {
  const p = hole ? new THREE.Path() : new THREE.Shape();
  p.absarc(cx, cy, r, 0, Math.PI * 2, hole);
  return p;
}

/**
 * Lathe around +y from [radius, y] pairs. The profile is re-oriented
 * counter-clockwise (r right, y up) so normals face outward, and split at
 * corners sharper than `crease` so machined edges stay crisp (three's own
 * per-run normals also keep the poles valid).
 */
export function lathe(pts: [number, number][], segs = 48, phiStart = 0, phiLength = Math.PI * 2, crease = 0.5): THREE.BufferGeometry {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    area += x0 * y1 - x1 * y0;
  }
  const p = area < 0 ? pts.slice().reverse() : pts.slice();
  const runs: [number, number][][] = [];
  let run: [number, number][] = [p[0]];
  for (let i = 1; i < p.length; i++) {
    run.push(p[i]);
    if (i < p.length - 1) {
      const ax = p[i][0] - p[i - 1][0], ay = p[i][1] - p[i - 1][1];
      const bx = p[i + 1][0] - p[i][0], by = p[i + 1][1] - p[i][1];
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      const cos = la > 0 && lb > 0 ? (ax * bx + ay * by) / (la * lb) : 1;
      if (Math.acos(Math.max(-1, Math.min(1, cos))) > crease) {
        runs.push(run);
        run = [p[i]];
      }
    }
  }
  if (run.length > 1) runs.push(run);
  const parts = runs
    .filter((r) => r.length > 1)
    .map((r) => new THREE.LatheGeometry(r.map(([x, y]) => new THREE.Vector2(x, y)), segs, phiStart, phiLength));
  return parts.length === 1 ? sanitizeNormals(parts[0]) : merge(parts);
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const vp = new THREE.Vector3();
const vs = new THREE.Vector3();

/** Transformed copy of a geometry. */
export function xf(g: THREE.BufferGeometry, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: number | V3 = 1): THREE.BufferGeometry {
  const c = g.clone();
  q.setFromEuler(e.set(rot[0], rot[1], rot[2]));
  vp.set(...pos);
  if (typeof scale === 'number') vs.setScalar(scale);
  else vs.set(...scale);
  c.applyMatrix4(m4.compose(vp, q, vs));
  return c;
}

/** Merge geometries into one (attributes reduced to position/normal/uv, all non-indexed). */
export function merge(list: THREE.BufferGeometry[], keep: string[] = ['position', 'normal', 'uv']): THREE.BufferGeometry {
  const prepared = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(n.attributes)) if (!keep.includes(k)) n.deleteAttribute(k);
    if (!n.attributes.normal) n.computeVertexNormals();
    sanitizeNormals(n);
    if (keep.includes('uv') && !n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    n.clearGroups();
    return n;
  });
  const out = mergeGeometries(prepared, false)!;
  prepared.forEach((g) => g.dispose());
  list.forEach((g) => g.dispose());
  return out;
}

/** Dome-head rivet geometry (shared). */
export function rivet(r: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  g.rotateX(Math.PI / 2);
  return g;
}

/** Remap planar UVs of a geometry to [0,1] over its xy bounding box. */
export function planarUV(g: THREE.BufferGeometry, minX: number, minY: number, w: number, h: number) {
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = (p.getX(i) - minX) / w;
    uv[i * 2 + 1] = (p.getY(i) - minY) / h;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** Mirror a geometry across x = 0 (keeps triangles front-facing, mirrors normals). */
export function mirrorX(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute | undefined;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, -pos.getX(i));
    if (nor) nor.setX(i, -nor.getX(i));
  }
  if (g.index) {
    const idx = g.index.array as Uint16Array | Uint32Array;
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    g.index.needsUpdate = true;
  } else {
    for (const name of Object.keys(g.attributes)) {
      const at = g.attributes[name] as THREE.BufferAttribute;
      const n = at.itemSize;
      const arr = at.array as Float32Array;
      for (let v = 0; v < at.count; v += 3) {
        for (let c = 0; c < n; c++) {
          const a = (v + 1) * n + c, b = (v + 2) * n + c;
          const t = arr[a];
          arr[a] = arr[b];
          arr[b] = t;
        }
      }
      at.needsUpdate = true;
    }
  }
  pos.needsUpdate = true;
  if (nor) nor.needsUpdate = true;
  return g;
}
