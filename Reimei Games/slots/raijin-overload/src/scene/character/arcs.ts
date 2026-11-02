// Electric arcs crawling over RAIJIN's armour: short jagged camera-facing
// ribbons between random surface points of a body region, regenerated every
// ~60 ms. One draw call, fixed buffers, zero allocations per frame.

import * as THREE from 'three';

export type ArcRegion = 'head' | 'chest' | 'armL' | 'armR' | 'paulL' | 'paulR' | 'halo' | 'fistL' | 'fistR';
export const ARC_REGIONS: ArcRegion[] = ['head', 'chest', 'armL', 'armR', 'paulL', 'paulR', 'halo', 'fistL', 'fistR'];

interface Anchor {
  obj: THREE.Object3D;
  p: THREE.Vector3;
  n: THREE.Vector3;
}

const SEG = 10; // segments per arc
const MAX = 40; // arcs

interface Slot {
  life: number;
  max: number;
  w: number;
  bright: number;
  pts: Float32Array; // (SEG+1)*3 root-local
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _na = new THREE.Vector3();
const _nb = new THREE.Vector3();
const _t = new THREE.Vector3();
const _c = new THREE.Vector3();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _j = new THREE.Vector3();
const _k = new THREE.Vector3();
const _rootInv = new THREE.Matrix4();
const _nm = new THREE.Matrix3();

export class ArcSystem {
  readonly mesh: THREE.Mesh;
  private regions = new Map<ArcRegion, Anchor[]>();
  private slots: Slot[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private geo: THREE.BufferGeometry;
  /** desired weights per region (0 = none); set every frame by the character */
  readonly weight: Record<ArcRegion, number> = { head: 0, chest: 0, armL: 0, armR: 0, paulL: 0, paulR: 0, halo: 0, fistL: 0, fistR: 0 };
  /** 0..1 global density */
  level = 0;
  width = 0.03;

  constructor(material: THREE.Material) {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * SEG * 6 * 3);
    this.col = new Float32Array(MAX * SEG * 6 * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.name = 'arcs';
    for (let i = 0; i < MAX; i++) this.slots.push({ life: 0, max: 1, w: 1, bright: 1, pts: new Float32Array((SEG + 1) * 3) });
  }

  /** Sample anchor points from meshes' surfaces (mesh-local), filtered by material names. */
  addRegion(name: ArcRegion, meshes: THREE.Mesh[], count = 60, filter?: (m: THREE.Mesh) => boolean) {
    const list = this.regions.get(name) ?? [];
    const pool = meshes.filter((m) => (filter ? filter(m) : true));
    if (!pool.length) return;
    let seed = list.length * 31 + name.length * 7 + 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      const m = pool[Math.floor(rnd() * pool.length)];
      const pa = m.geometry.attributes.position;
      const na = m.geometry.attributes.normal;
      const v = Math.floor(rnd() * pa.count);
      list.push({ obj: m, p: new THREE.Vector3().fromBufferAttribute(pa, v), n: new THREE.Vector3().fromBufferAttribute(na, v) });
    }
    this.regions.set(name, list);
  }

  /** Add explicit anchors (e.g. drum centres). */
  addPoints(name: ArcRegion, obj: THREE.Object3D, pts: THREE.Vector3[], normal = new THREE.Vector3(0, 0, 1)) {
    const list = this.regions.get(name) ?? [];
    for (const p of pts) list.push({ obj, p: p.clone(), n: normal.clone() });
    this.regions.set(name, list);
  }

  private pickRegion(): ArcRegion | null {
    let tot = 0;
    for (const r of ARC_REGIONS) tot += this.regions.has(r) ? this.weight[r] : 0;
    if (tot <= 1e-4) return null;
    let x = Math.random() * tot;
    for (const r of ARC_REGIONS) {
      if (!this.regions.has(r)) continue;
      x -= this.weight[r];
      if (x <= 0) return r;
    }
    return null;
  }

  private anchorTo(a: Anchor, outP: THREE.Vector3, outN: THREE.Vector3) {
    outP.copy(a.p).applyMatrix4(a.obj.matrixWorld).applyMatrix4(_rootInv);
    _nm.getNormalMatrix(a.obj.matrixWorld);
    outN.copy(a.n).applyMatrix3(_nm).transformDirection(_rootInv).normalize();
  }

  private regen(s: Slot, root: THREE.Object3D): boolean {
    const r = this.pickRegion();
    if (!r) return false;
    const list = this.regions.get(r)!;
    const a = list[(Math.random() * list.length) | 0];
    this.anchorTo(a, _a, _na);
    let ok = false;
    for (let tries = 0; tries < 8 && !ok; tries++) {
      const b = list[(Math.random() * list.length) | 0];
      this.anchorTo(b, _b, _nb);
      const d = _a.distanceTo(_b) * root.scale.x;
      ok = d > 0.18 && d < (r === 'halo' ? 2.2 : 1.1);
    }
    if (!ok) return false;
    const len = _a.distanceTo(_b);
    _t.subVectors(_b, _a);
    _c.addVectors(_na, _nb).normalize(); // outward bulge direction
    for (let i = 0; i <= SEG; i++) {
      const f = i / SEG;
      const env = Math.sin(f * Math.PI);
      _p.copy(_a).addScaledVector(_t, f).addScaledVector(_c, env * len * 0.22 + 0.03);
      if (i > 0 && i < SEG) {
        _j.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(len * 0.32 * (0.35 + env));
        _p.add(_j);
      }
      s.pts[i * 3] = _p.x;
      s.pts[i * 3 + 1] = _p.y;
      s.pts[i * 3 + 2] = _p.z;
    }
    s.max = s.life = 45 + Math.random() * 75;
    s.w = 0.6 + Math.random() * 0.8;
    s.bright = 0.6 + Math.random() * 0.6;
    return true;
  }

  update(dt: number, root: THREE.Object3D, camWorld: THREE.Vector3) {
    _rootInv.copy(root.matrixWorld).invert();
    _k.copy(camWorld).applyMatrix4(_rootInv); // camera in root space
    const want = Math.round(this.level * MAX);
    let active = 0;
    let v = 0;
    for (let i = 0; i < MAX; i++) {
      const s = this.slots[i];
      s.life -= dt;
      if (s.life <= 0) {
        if (i >= want || !this.regen(s, root)) continue;
      }
      active++;
      const fade = Math.min(1, s.life / (s.max * 0.5)) * s.bright;
      const w = this.width * s.w;
      for (let k = 0; k < SEG; k++) {
        for (let e = 0; e < 2; e++) {
          const idx = k + e;
          const pi = idx * 3;
          _p.set(s.pts[pi], s.pts[pi + 1], s.pts[pi + 2]);
          const i0 = Math.max(0, idx - 1) * 3, i1 = Math.min(SEG, idx + 1) * 3;
          _t.set(s.pts[i1] - s.pts[i0], s.pts[i1 + 1] - s.pts[i0 + 1], s.pts[i1 + 2] - s.pts[i0 + 2]);
          _c.subVectors(_k, _p);
          _s.crossVectors(_t, _c).normalize();
          const taper = 0.35 + 0.65 * Math.sin(((idx / SEG) * 0.8 + 0.1) * Math.PI);
          const hw = w * taper;
          if (e === 0) {
            _a.copy(_p).addScaledVector(_s, hw);
            _b.copy(_p).addScaledVector(_s, -hw);
          } else {
            _na.copy(_p).addScaledVector(_s, hw);
            _nb.copy(_p).addScaledVector(_s, -hw);
          }
        }
        // two triangles: a, b, nb  /  a, nb, na
        v = this.writeTri(v, _a, _b, _nb, fade);
        v = this.writeTri(v, _a, _nb, _na, fade);
      }
    }
    this.geo.setDrawRange(0, v);
    if (active) {
      (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }
    this.mesh.visible = active > 0;
  }

  private writeTri(v: number, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, k: number): number {
    const P = this.pos, C = this.col;
    let o = v * 3;
    P[o] = a.x; P[o + 1] = a.y; P[o + 2] = a.z; C[o] = C[o + 1] = C[o + 2] = k; o += 3;
    P[o] = b.x; P[o + 1] = b.y; P[o + 2] = b.z; C[o] = C[o + 1] = C[o + 2] = k; o += 3;
    P[o] = c.x; P[o + 1] = c.y; P[o + 2] = c.z; C[o] = C[o + 1] = C[o + 2] = k;
    return v + 3;
  }
}
