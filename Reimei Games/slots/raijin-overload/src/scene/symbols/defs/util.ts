import * as THREE from 'three';
import type { Assets } from '../assets';
import type { V3 } from '../types';

/** Mesh whose geometry is owned (disposed) by the kit. */
export function mk(a: Assets, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], name = '', pos?: V3, rot?: V3): THREE.Mesh {
  const m = new THREE.Mesh(a.own(geo), mat);
  if (name) m.name = name;
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  return m;
}

/** Group with transform. */
export function grp(name = '', pos?: V3, rot?: V3, scale?: number): THREE.Group {
  const g = new THREE.Group();
  if (name) g.name = name;
  if (pos) g.position.set(...pos);
  if (rot) g.rotation.set(...rot);
  if (scale) g.scale.setScalar(scale);
  return g;
}

/** Deterministic PRNG (stable geometry between kits). */
export function prng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Canvas noise speckle helper. */
export function speckle(x: CanvasRenderingContext2D, w: number, h: number, n: number, color: (r: number) => string, size = 1.5, seed = 7) {
  const r = prng(seed);
  for (let i = 0; i < n; i++) {
    x.fillStyle = color(r());
    const s = size * (0.5 + r());
    x.fillRect(r() * w, r() * h, s, s);
  }
}
