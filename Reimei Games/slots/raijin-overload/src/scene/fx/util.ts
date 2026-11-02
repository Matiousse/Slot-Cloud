// Shared helpers for the FX module: random numbers, uniforms shared by every
// effect shader, view-frustum queries (allocation free) and GLSL snippets.

import * as THREE from 'three';

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
/** Cheap gaussian-ish random, mean 0, sigma ~0.5. */
export const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.8165;
export const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Uniform objects shared by reference between all effect materials. */
export interface FxShared {
  camera: THREE.PerspectiveCamera;
  /** Animation-clock time (ms). */
  uTime: { value: number };
  /** World size of one framebuffer pixel at view depth 1 (for min-width AA clamps). */
  uPx: { value: number };
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _cam = new THREE.Vector3();

/**
 * World-space point where the camera ray through NDC (nx, ny) crosses the plane z = zPlane.
 * Accounts for view offsets (the stage frames the board off-centre).
 */
export function ndcToPlaneZ(camera: THREE.PerspectiveCamera, nx: number, ny: number, zPlane: number, out: THREE.Vector3): THREE.Vector3 {
  camera.getWorldPosition(_cam);
  _a.set(nx, ny, 0.5).unproject(camera);
  _b.copy(_a).sub(_cam);
  const dz = _b.z;
  const t = Math.abs(dz) < 1e-6 ? 0 : (zPlane - _cam.z) / dz;
  return out.copy(_cam).addScaledVector(_b, t);
}

/** Direction from p toward the camera (unit). */
export function towardCamera(camera: THREE.PerspectiveCamera, p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  camera.getWorldPosition(out);
  return out.sub(p).normalize();
}

export const GLSL_HASH = /* glsl */ `
  float fxHash(float n) { return fract(sin(n) * 43758.5453123); }
  float fxNoise(float x) {
    float i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(fxHash(i), fxHash(i + 1.0), f);
  }
`;

/** Unit quad (-1..1) used as the base of every instanced billboard. */
export function quadGeometry(): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

export function dynAttr(cap: number, size: number): THREE.InstancedBufferAttribute {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * size), size);
  a.setUsage(THREE.DynamicDrawUsage);
  return a;
}

const RANGES = new WeakMap<THREE.BufferAttribute, { start: number; count: number }>();

/**
 * Upload only the first `count` items of a dynamic attribute. Reuses one range
 * object per attribute (three's addUpdateRange allocates a new one per call).
 */
export function touch(a: THREE.BufferAttribute, count: number, itemSize = a.itemSize) {
  let r = RANGES.get(a);
  if (!r) {
    r = { start: 0, count: 0 };
    RANGES.set(a, r);
  }
  const ur = a.updateRanges;
  if (count <= 0) {
    if (ur.length) ur.length = 0;
    return;
  }
  r.count = count * itemSize;
  if (ur.length !== 1 || ur[0] !== r) {
    ur.length = 0;
    ur.push(r);
  }
  a.needsUpdate = true;
}

/** Allocation-free vector length. */
export const len3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);
