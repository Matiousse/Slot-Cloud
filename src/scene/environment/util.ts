// Small helpers shared by the environment builders.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Bake a solid vertex colour + emissive strength into a geometry so many parts
 * can be merged into one draw call with the "structure" shader.
 * Keeps position + normal only.
 */
export function paint(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, emit = 0): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  const c = new THREE.Color(color);
  const col = new Float32Array(n * 3);
  const em = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    em[i] = emit;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aEmit', new THREE.BufferAttribute(em, 1));
  return g;
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('environment: mergeGeometries failed');
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}

/** Flat-shaded copy (per-face normals). */
export function flat(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  return g;
}

/**
 * Merge every static, single-material Mesh under `root` into one mesh per
 * material (transforms baked relative to `root`). Cuts draw calls for props
 * built from many small parts. Returns the new group (replaces the children).
 */
export function bakeStatic(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const keep: THREE.Object3D[] = [];
  const m = new THREE.Matrix4();
  root.traverse((o) => {
    if (o === root) return;
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as unknown as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material)) {
      if (mesh.isMesh) keep.push(mesh);
      return;
    }
    m.multiplyMatrices(inv, mesh.matrixWorld);
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    g.applyMatrix4(m);
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups();
    const list = buckets.get(mesh.material) ?? [];
    list.push(g);
    buckets.set(mesh.material, list);
  });
  const out = new THREE.Group();
  out.name = root.name + '-baked';
  out.position.copy(root.position);
  out.quaternion.copy(root.quaternion);
  out.scale.copy(root.scale);
  for (const [mat, list] of buckets) {
    const mesh = new THREE.Mesh(merge(list), mat);
    if (mat.transparent) mesh.renderOrder = 3;
    out.add(mesh);
  }
  for (const k of keep) {
    k.removeFromParent();
    out.add(k);
  }
  return out;
}
